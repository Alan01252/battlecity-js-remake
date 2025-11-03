#!/usr/bin/env node
"use strict";

/**
 * Battle City Bot – patrol + obstacle-aware A* navigator
 * ------------------------------------------------------
 * - 4×4 tile buildings by default (CC uses constants if provided)
 * - Obstacle inflation so touching counts as blocked
 * - Tighter arrival (0.4 tile), minimum leg length (≥3 tiles) to avoid spin
 * - Snap-to-free avoids local 3×3 around current tile
 * - LOS-first, 4-way A* fallback, debounced replans
 */

const { io } = require("socket.io-client");
const { loadMapData } = require("../server/src/utils/mapLoader");
const {
  TILE_SIZE,
  MAX_HEALTH,
  PLAYER_HITBOX_GAP,
  COMMAND_CENTER_WIDTH_TILES,
  COMMAND_CENTER_HEIGHT_TILES
} = require("../server/src/gameplay/constants");
const citySpawns = require("../shared/citySpawns.json");

// -------------------- World constants --------------------

const MAP_SIZE_TILES = 512;
const MAP_PIXEL_SIZE = MAP_SIZE_TILES * TILE_SIZE;
const DEFAULT_SERVER_URL = process.env.BATTLECITY_SERVER || "http://localhost:8021";

const BLOCKING_TILE_VALUES = new Set([1, 2, 3]); // terrain 1/2/3 = blocked

// Movement / timing
const DEFAULT_STEP_PX = 28;
const STEP_PER_TICK_PX = Number.isFinite(Number(process.env.BOT_STEP_PX))
  ? Number(process.env.BOT_STEP_PX)
  : DEFAULT_STEP_PX;
const TICK_INTERVAL_MS = Number(process.env.BOT_TICK_MS) || 120;

// Arrival + min travel
const TARGET_REACH_RADIUS_PX = Math.floor(TILE_SIZE * 0.40); // tighter arrival
const MIN_TRAVEL_TILES = 3;                                  // ≥ 3 tiles per leg
const MIN_TRAVEL_PX = MIN_TRAVEL_TILES * TILE_SIZE;

// Patrol band & leash
const PATROL_MIN_TILES = 6;
const PATROL_MAX_TILES = 14;
const LEASH_MAX_TILES  = 18;

const PATROL_MIN_T = 6;
const PATROL_MAX_T = 14;
const LEASH_MAX_T  = 18;

// Geometry
const DEFAULT_BUILDING_TILES = 4; // 4×4 tile generic building
const OB_PAD_PX = Math.max(PLAYER_HITBOX_GAP, Math.ceil(TILE_SIZE * 0.15)); // inflate
const LOS_STEP_PX = Math.max(6, Math.floor(TILE_SIZE / 6));

// Debounce & stall heuristics
const RECALC_DEBOUNCE_MS = 80;
const STALL_TICKS = 6;

// -------------------- Utils --------------------

const clamp = (v, mn, mx) => (v < mn ? mn : v > mx ? mx : v);

const wrapDirection = (d) => {
  if (!Number.isFinite(d)) return 0;
  const n = Math.round(d);
  return ((n % 32) + 32) % 32;
};

const vectorToDirection = (dx, dy, fallback = 0) => {
  // keep legacy orientation (atan2(dx,dy))
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return fallback;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-6) return fallback;
  const theta = Math.atan2(dx, dy);
  let dir = Math.round((-theta / Math.PI) * 16);
  dir %= 32;
  if (dir < 0) dir += 32;
  return dir;
};

const directionDelta = (from, to) => {
  const a = wrapDirection(from);
  const b = wrapDirection(to);
  let d = b - a;
  d = ((d + 16) % 32) - 16;
  return Math.abs(d);
};

const stepDirectionTowards = (from, to, maxStep = 1) => {
  const a = wrapDirection(from);
  const b = wrapDirection(to);
  let d = b - a;
  d = ((d + 16) % 32) - 16;
  const s = Math.max(-Math.abs(maxStep), Math.min(Math.abs(maxStep), d));
  return wrapDirection(a + s);
};

const distance2 = (ax, ay, bx, by) => {
  const dx = ax - bx, dy = ay - by;
  return dx * dx + dy * dy;
};

// Player rectangle built from **centre**
const PLAYER_RECT_SIZE = TILE_SIZE - (PLAYER_HITBOX_GAP * 2);
const playerRectFromCenter = (cx, cy) => ({
  x: Math.floor(cx - PLAYER_RECT_SIZE / 2),
  y: Math.floor(cy - PLAYER_RECT_SIZE / 2),
  w: PLAYER_RECT_SIZE,
  h: PLAYER_RECT_SIZE
});

const createPlayerRectFromCenter = (cx, cy) => ({
  x: Math.floor(cx - PLAYER_RECT_SIZE / 2),
  y: Math.floor(cy - PLAYER_RECT_SIZE / 2),
  w: PLAYER_RECT_SIZE,
  h: PLAYER_RECT_SIZE,
});

// Touch counts as blocked (seam-safe)
const rectsTouchOrOverlap = (a, b) => !(
  a.x + a.w < b.x ||
  a.x > b.x + b.w ||
  a.y + a.h < b.y ||
  a.y > b.y + b.h
);

// -------------------- CLI --------------------

const parseArgs = () => {
  const args = process.argv.slice(2);
  const o = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--server" && args[i + 1]) { o.serverUrl = args[++i]; }
    else if ((a === "--city" || a === "-c") && args[i + 1]) {
      const v = Number(args[++i]); if (Number.isFinite(v)) o.city = Math.max(0, Math.floor(v));
    } else if ((a === "--role" || a === "-r") && args[i + 1]) {
      o.role = (args[++i] || "").toLowerCase();
    } else if ((a === "--name" || a === "-n") && args[i + 1]) {
      o.name = args[++i];
    }
  }
  return o;
};

// ========================================================
//                         Bot
// ========================================================

class BotClient {
  constructor(options = {}) {
    this.serverUrl = options.serverUrl || DEFAULT_SERVER_URL;
    this.cityPreference = Number.isFinite(options.city) ? Math.max(0, Math.floor(options.city)) : null;
    this.rolePreference = (options.role && typeof options.role === "string") ? options.role.toLowerCase() : "recruit";
    this.name = options.name || `bot-${Math.floor(Math.random() * 9999)}`;

    this.socket = null;
    this.loopHandle = null;
    this.ready = false;

    this.map = this._loadMap();
    this._mapIsXY = undefined;

    this.player = {
      id: null,
      city: this.cityPreference ?? 0,
      isMayor: false,
      health: MAX_HEALTH,
      direction: 16,
      isTurning: 0,
      isMoving: 0,
      sequence: 0,
      offset: { x: 0, y: 0 } // centre coords
    };

    this.spawnPoint = null;
    this.patrolHome = null;

    this.obstacles = []; // {id,x,y,w,h} world px (inflated)

    this.target = null;  // world px centre
    this.path = [];      // [{x,y}, ...]
    this._nextReplanAt = 0;

    // stuck detection
    this._blockedStreak = 0;
    this._noProgressStreak = 0;
    this._lastProgressAt = Date.now();
    this._lastUnstickAt = 0;
    // reverse/turn helpers
this.lastVel = { x: 0, y: 0 };   // last successful move vector (px/tick)
this.evadeUntil = 0;             // timestamp while we’re in reverse/evade mode
this.turnOnlyUntil = 0;          // timestamp to turn-in-place before moving



    // loop guard
    this._loopKind = null;         // "blocked" | "stalled" | null
    this._loopCount = 0;
    this._loopWindowStart = 0;
    this._blacklistedTilesUntil = new Map(); // key "tx,ty" -> expiry ms


    this.debug = process.env.BOT_DEBUG === "1";
  }

   lineOfSightClear(ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const dist = Math.hypot(dx, dy);
    if (!Number.isFinite(dist) || dist < 1) return true;
    const steps = Math.max(1, Math.ceil(dist / LOS_STEP_PX));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const x = ax + dx * t, y = ay + dy * t;
      if (this.checkBlocked(x, y)) return false;
    }
    return true;
  }

   _registerStuck() {
    const now = Date.now();
    if (now - this.lastStuckAt > 900) this.stuckScore = 0; // decay
    this.lastStuckAt = now;
    this.stuckScore += 1;
    if (this.stuckScore >= 4) { this._cornerEscape("stuck_burst"); this.stuckScore = 0; }
  }

    _snapTargetToNearestFree(x, y, opts = {}) {
    const { avoid = null, avoidRadiusTiles = 1, maxRing = 6 } = opts;
    let tx0 = clamp(Math.floor(x / TILE_SIZE), 0, MAP_SIZE_TILES - 1);
    let ty0 = clamp(Math.floor(y / TILE_SIZE), 0, MAP_SIZE_TILES - 1);

    const aTx = avoid ? avoid.tx : -9999;
    const aTy = avoid ? avoid.ty : -9999;
    const isAvoided = (tx, ty) =>
      Math.abs(tx - aTx) <= avoidRadiusTiles && Math.abs(ty - aTy) <= avoidRadiusTiles;

    for (let r = 0; r <= maxRing; r++) {
      for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        const tx = tx0 + dx, ty = ty0 + dy;
        if (tx<0||ty<0||tx>=MAP_SIZE_TILES||ty>=MAP_SIZE_TILES) continue;
        if (avoid && isAvoided(tx, ty)) continue;
        const px = (tx + 0.5) * TILE_SIZE, py = (ty + 0.5) * TILE_SIZE;
        if (!this.isBlocked(px, py)) return { x: px, y: py };
      }
    }
    return { x: clamp((tx0 + 0.5) * TILE_SIZE, 0, MAP_PIXEL_SIZE - TILE_SIZE),
             y: clamp((ty0 + 0.5) * TILE_SIZE, 0, MAP_PIXEL_SIZE - TILE_SIZE) };
  }

  // --------------- Logging ---------------
  log(...a)  { console.log(`[${new Date().toISOString()}][${this.name}]`, ...a); }
  warn(...a) { console.warn(`[${new Date().toISOString()}][${this.name}]`, ...a); }


    pickNewTarget(reason="random") {
    const home = this.patrolHome || this.spawnPoint || this.player.offset;
    const minR = PATROL_MIN_T * TILE_SIZE;
    const maxR = PATROL_MAX_T * TILE_SIZE;

    // If beyond hard leash: pull to ring mid at current angle
    const dx = this.player.offset.x - home.x, dy = this.player.offset.y - home.y;
    const dist = Math.hypot(dx, dy);
    if (dist > LEASH_MAX_T * TILE_SIZE) {
      const th = Math.atan2(dy, dx);
      const r = (minR + maxR) * 0.5;
      const avoid = { tx: Math.floor(this.player.offset.x/TILE_SIZE), ty: Math.floor(this.player.offset.y/TILE_SIZE) };
      this.target = this._snapTargetToNearestFree(home.x + Math.cos(th)*r, home.y + Math.sin(th)*r, { avoid });
      return;
    }

    // Annulus sampling; prefer LOS but accept non-LOS
    for (let i=0;i<18;i++){
      const th = Math.random()*Math.PI*2;
      const r  = minR + (maxR - minR) * (0.35 + 0.65*Math.random());
      const cx = clamp(home.x + Math.cos(th)*r, 0, MAP_PIXEL_SIZE - TILE_SIZE);
      const cy = clamp(home.y + Math.sin(th)*r, 0, MAP_PIXEL_SIZE - TILE_SIZE);
      const avoid = { tx: Math.floor(this.player.offset.x/TILE_SIZE), ty: Math.floor(this.player.offset.y/TILE_SIZE) };
      const snap = this._snapTargetToNearestFree(cx,cy,{ avoid });
      if (!this.checkBlocked(snap.x,snap.y) &&
          (this.lineOfSightClear(this.player.offset.x,this.player.offset.y,snap.x,snap.y) || i>6)) {
        this.target = snap;
        break;
      }
    }

    // Last resort
    if (!this.target || this._sameTile(this.target, this.player.offset)) {
      if (!this._assignNeighborStepTarget()) {
        this.target = { x: home.x, y: home.y };
      }
    }
  }


    getMapValue(tx, ty) {
    if (!Array.isArray(this.mapData)) return 0;
    if (this._mapIsXY === undefined) {
      const xs = this.mapData.length;
      const ys = Array.isArray(this.mapData[0]) ? this.mapData[0].length : 0;
      this._mapIsXY = (xs === MAP_SIZE_TILES) ? true : (ys === MAP_SIZE_TILES ? false : true);
      this.log(`Map orientation detected: ${this._mapIsXY ? "[x][y]" : "[y][x]"}`);
    }
    if (this._mapIsXY) {
      const col = this.mapData[tx]; return Array.isArray(col) ? (col[ty] || 0) : 0;
    } else {
      const row = this.mapData[ty]; return Array.isArray(row) ? (row[tx] || 0) : 0;
    }
  }


  // --------------- IO --------------------
  _loadMap() {
    try {
      const data = loadMapData();
      if (data && Array.isArray(data.map)) {
        this.log(`Loaded map.dat (${data.map.length} columns)`);
        return data.map;
      }
    } catch (e) {
      this.warn(`Unable to load map data: ${e.message}`);
    }
    return [];
  }

  _tileKey(tx, ty) { return `${tx},${ty}`; }

_makeTangentDetour(distanceTiles = 2.5, forwardTiles = 2.5) {
  // build a lateral waypoint relative to current heading
  const from = this.player.offset;
  if (!this.target) return null;

  const dx = this.target.x - from.x;
  const dy = this.target.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;          // forward
  const lx = -uy, ly = ux;                     // left

  const dist = distanceTiles * TILE_SIZE;
  const fwd  = forwardTiles * TILE_SIZE;

  const candidates = [
    { x: from.x + lx*dist + ux*fwd, y: from.y + ly*dist + uy*fwd }, // left
    { x: from.x - lx*dist + ux*fwd, y: from.y - ly*dist + uy*fwd }, // right
  ];

  for (const c of candidates) {
    const snap = this._snapTargetToNearestFree(c.x, c.y, {
      avoid: { tx: Math.floor(from.x/TILE_SIZE), ty: Math.floor(from.y/TILE_SIZE) },
      avoidRadiusTiles: 1
    });
    if (!this.isBlocked(snap.x, snap.y)) return snap;
  }
  return null;
}

_breakSpinLoop(trigger) {
  const now = Date.now();

  // 1) Try a tangent detour first
  const detour = this._makeTangentDetour(2.5, 2.5);
  if (detour) {
    this.target = detour;
    this.path = [ { x: detour.x, y: detour.y } ];
    if (this.debug) this.log(`Path len=${this.path.length} (trigger=${trigger}_detour)`);
    return true;
  }

  // 2) Blacklist the current goal tile for a few seconds and pick a new one
  if (this.target) {
    const gtx = Math.floor(this.target.x / TILE_SIZE);
    const gty = Math.floor(this.target.y / TILE_SIZE);
    this._blacklistedTilesUntil.set(this._tileKey(gtx,gty), now + 4000);
  }
  this._pickNewTarget("loop_break");
  this.recalcPath("loop_break");
  return true;
}


  connect() {
    this.socket = io(this.serverUrl, { transports: ["websocket"], reconnection: true });

    this.socket.on("connect", () => {
      this.log(`Connected as ${this.socket.id}`);
      this.player.id = this.socket.id;

      if (this.cityPreference !== null) {
        const spawn = this.resolveCitySpawn(this.cityPreference);
        if (spawn) { this.spawnPoint = spawn; this.player.offset = { ...spawn }; }
      }

      this.sendEnterGame();
      this._startLoop();
    });

    this.socket.on("disconnect", (reason) => {
      this.warn(`Disconnected: ${reason}`);
      this.ready = false;
      this._stopLoop();
    });

    // server events
    this.socket.on("player",          (p)=>this.onPlayerPayload(p, { source:"player" }));
    this.socket.on("enter_game",      (p)=>this.onPlayerPayload(p, { source:"enter_game" }));
    this.socket.on("players:snapshot",(p)=>this.onPlayersSnapshot(p));
    this.socket.on("lobby:assignment",(p)=>this.onAssignment(p));
    this.socket.on("player:rejected", (p)=>this.onRejected(p));
    this.socket.on("lobby:denied",    (p)=>this.onLobbyDenied(p));
    this.socket.on("new_building",    (p)=>this.onNewBuilding(p));
    this.socket.on("demolish_building",(p)=>this.onDemolishBuilding(p));
    this.socket.on("connect_error",   (err)=>this.warn(`Connection error: ${err?.message || err}`));
  }

  _startLoop(){ this._stopLoop(); this.loopHandle = setInterval(()=>this.tick(), TICK_INTERVAL_MS); }
  _stopLoop(){ if (this.loopHandle){ clearInterval(this.loopHandle); this.loopHandle=null; } }

  sendEnterGame() {
    if (!this.socket || this.socket.disconnected) return;
    const payload = {
      id: this.player.id,
      city: this.cityPreference ?? this.player.city ?? 0,
      isMayor: false,
      health: this.player.health,
      direction: wrapDirection(this.player.direction),
      isTurning: 0,
      isMoving: 0,
      sequence: 0,
      offset: { x: Math.round(this.player.offset.x), y: Math.round(this.player.offset.y) },
      requestedRole: this.rolePreference, role: this.rolePreference,
      ...(this.cityPreference !== null ? { requestedCity: this.cityPreference } : {})
    };
    this.log(`Requesting entry (city=${payload.requestedCity ?? "auto"}, role=${payload.requestedRole})`);
    this.socket.emit("enter_game", JSON.stringify(payload));
  }

  // --------------- Map helpers ----------------

  _getMapValue(tx, ty) {
    if (!Array.isArray(this.map)) return 0;
    if (this._mapIsXY === undefined) {
      const xs = this.map.length;
      const ys = Array.isArray(this.map[0]) ? this.map[0].length : 0;
      this._mapIsXY = (xs === MAP_SIZE_TILES) ? true : (ys === MAP_SIZE_TILES ? false : true);
      this.log(`Map orientation detected: ${this._mapIsXY ? "[x][y]" : "[y][x]"}`);
    }
    if (this._mapIsXY) {
      const col = this.map[tx]; return Array.isArray(col) ? (col[ty] || 0) : 0;
    } else {
      const row = this.map[ty]; return Array.isArray(row) ? (row[tx] || 0) : 0;
    }
  }

  _rectBlocked(rect) {
    // tiles
    const sx = Math.max(0, Math.floor(rect.x / TILE_SIZE));
    const ex = Math.min(MAP_SIZE_TILES - 1, Math.floor((rect.x + rect.w - 1) / TILE_SIZE));
    const sy = Math.max(0, Math.floor(rect.y / TILE_SIZE));
    const ey = Math.min(MAP_SIZE_TILES - 1, Math.floor((rect.y + rect.h - 1) / TILE_SIZE));
    for (let tx = sx; tx <= ex; tx++) {
      for (let ty = sy; ty <= ey; ty++) {
        if (BLOCKING_TILE_VALUES.has(this._getMapValue(tx, ty))) return true;
      }
    }
    // inflated obstacles
    for (const o of this.obstacles) {
      if (rectsTouchOrOverlap(rect, o)) return true;
    }
    return false;
  }

  isBlocked(x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return true;
    if (x < 0 || y < 0) return true;
    if (x > MAP_PIXEL_SIZE - TILE_SIZE || y > MAP_PIXEL_SIZE - TILE_SIZE) return true;
    return this._rectBlocked(playerRectFromCenter(x, y));
  }

  lineOfSight(ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const d = Math.hypot(dx, dy);
    if (!Number.isFinite(d) || d < 1) return true;
    const steps = Math.max(1, Math.ceil(d / LOS_STEP_PX));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const x = ax + dx * t, y = ay + dy * t;
      if (this.isBlocked(x, y)) return false;
    }
    return true;
  }

  // --------------- Buildings → obstacles ----------------

  onNewBuilding(payload) {
    const d = this.safeParse(payload); if (!d) return;
    const { x, y, type, id } = d;
    if (!Number.isFinite(x) || !Number.isFinite(y) || !id) return;

    // remove old, push new
    this.obstacles = this.obstacles.filter(o => o.id !== id);

    const tilesW = (type === 0 ? Number(COMMAND_CENTER_WIDTH_TILES)  || DEFAULT_BUILDING_TILES : DEFAULT_BUILDING_TILES);
    const tilesH = (type === 0 ? Number(COMMAND_CENTER_HEIGHT_TILES) || DEFAULT_BUILDING_TILES : DEFAULT_BUILDING_TILES);

    const worldX = x * TILE_SIZE;
    const worldY = y * TILE_SIZE;
    this.obstacles.push({
      id,
      x: worldX - OB_PAD_PX,
      y: worldY - OB_PAD_PX,
      w: tilesW * TILE_SIZE + OB_PAD_PX * 2,
      h: tilesH * TILE_SIZE + OB_PAD_PX * 2
    });

    this._debouncedReplan("new_building");
  }

  onDemolishBuilding(payload) {
    const d = this.safeParse(payload); if (!d) return;
    const { id } = d; if (!id) return;
    this.obstacles = this.obstacles.filter(o => o.id !== id);
    this._debouncedReplan("demolish_building");
  }

  // --------------- Player / lobby handlers ----------

  onPlayersSnapshot(payload) {
    const arr = this.safeParse(payload);
    if (Array.isArray(arr)) arr.forEach(e => this.onPlayerPayload(e, { source: "snapshot" }));
  }
  onRejected(payload)    { const d = this.safeParse(payload); if (d) this.warn("Player update rejected:", d.reasons || d); }
  onLobbyDenied(payload) { const d = this.safeParse(payload); if (d) this.warn("Lobby denied:", d.reason || d); }

  onAssignment(payload) {
    const d = this.safeParse(payload); if (!d) return;
    if (Number.isFinite(d.city)) {
      this.player.city = Math.max(0, Math.floor(d.city));
      const spawn = this.resolveCitySpawn(this.player.city);
      if (spawn) {
        this.spawnPoint = spawn;
        if (this.player.offset.x === 0 && this.player.offset.y === 0) this.player.offset = { ...spawn };
      }
      if (!this.patrolHome && this.spawnPoint) this.patrolHome = { ...this.spawnPoint };
      this.log(`Assigned to city ${this.player.city} (${this.spawnPoint ? `${this.spawnPoint.x.toFixed(0)},${this.spawnPoint.y.toFixed(0)}` : "spawn unknown"})`);
    }
  }

  onPlayerPayload(payload, ctx = {}) {
    const d = this.safeParse(payload); if (!d || !d.id) return;
    if (!this.socket || !this.socket.id || d.id !== this.socket.id) return;

    if (Number.isFinite(d.city)) this.player.city = Math.max(0, Math.floor(d.city));
    if (typeof d.isMayor === "boolean") this.player.isMayor = d.isMayor;
    if (d.offset && Number.isFinite(d.offset.x) && Number.isFinite(d.offset.y)) this.player.offset = { x: d.offset.x, y: d.offset.y };
    if (Number.isFinite(d.direction)) this.player.direction = wrapDirection(d.direction);
    if (Number.isFinite(d.sequence)) this.player.sequence = d.sequence;
    this.player.health = Number.isFinite(d.health) ? d.health : this.player.health;

    this.ready = true;

    if (!this.spawnPoint) {
      const spawn = this.resolveCitySpawn(this.player.city);
      if (spawn) this.spawnPoint = spawn;
    }
    if (!this.patrolHome && this.spawnPoint) this.patrolHome = { ...this.spawnPoint };
    if (!this.target) this._pickNewTarget("init");

    if (ctx.source === "enter_game") this.log("Successfully entered game");
  }

  // --------------- A* (4-way) ----------------------

  _blockedCellFactory() {
    // Include dynamic obstacles → covered tiles
    const dyn = new Set();
    for (const o of this.obstacles) {
      const sx = clamp(Math.floor(o.x / TILE_SIZE), 0, MAP_SIZE_TILES - 1);
      const ex = clamp(Math.floor((o.x + o.w - 1) / TILE_SIZE), 0, MAP_SIZE_TILES - 1);
      const sy = clamp(Math.floor(o.y / TILE_SIZE), 0, MAP_SIZE_TILES - 1);
      const ey = clamp(Math.floor((o.y + o.h - 1) / TILE_SIZE), 0, MAP_SIZE_TILES - 1);
      for (let tx = sx; tx <= ex; tx++) for (let ty = sy; ty <= ey; ty++) dyn.add((ty << 10) | tx);
    }
    return (tx, ty) => (tx < 0 || ty < 0 || tx >= MAP_SIZE_TILES || ty >= MAP_SIZE_TILES) ||
                       dyn.has((ty << 10) | tx) ||
                       BLOCKING_TILE_VALUES.has(this._getMapValue(tx, ty));
  }

  _aStar(fromPx, toPx) {
    const startTx = clamp(Math.floor(fromPx.x / TILE_SIZE), 0, MAP_SIZE_TILES - 1);
    const startTy = clamp(Math.floor(fromPx.y / TILE_SIZE), 0, MAP_SIZE_TILES - 1);
    const goalTx  = clamp(Math.floor(toPx.x   / TILE_SIZE), 0, MAP_SIZE_TILES - 1);
    const goalTy  = clamp(Math.floor(toPx.y   / TILE_SIZE), 0, MAP_SIZE_TILES - 1);

    const blocked = this._blockedCellFactory();
    if (blocked(goalTx, goalTy) || blocked(startTx, startTy)) return null;

    const key = (x, y) => (y << 10) | x;
    const h   = (x, y) => Math.abs(x - goalTx) + Math.abs(y - goalTy);

    const open = new Map();     // k -> [x,y]
    const g    = new Map();     // k -> g
    const f    = new Map();     // k -> f
    const came = new Map();     // k -> [px,py]

    const sK = key(startTx, startTy);
    open.set(sK, [startTx, startTy]);
    g.set(sK, 0);
    f.set(sK, h(startTx, startTy));

    const nbr = [[1,0],[-1,0],[0,1],[0,-1]];
    let safety = 20000;

    while (open.size && safety-- > 0) {
      // pop lowest f
      let bestK = null, bestF = Infinity, best = null;
      for (const [k, [x, y]] of open) {
        const fv = (f.get(k) ?? Infinity);
        if (fv < bestF) { bestF = fv; bestK = k; best = [x, y]; }
      }
      if (!best) break;

      open.delete(bestK);
      const [cx, cy] = best;
      if (cx === goalTx && cy === goalTy) {
        // reconstruct
        const pathTiles = [];
        let kk = bestK;
        while (kk !== sK) {
          const ty = (kk >> 10), tx = (kk & ((1 << 10) - 1));
          pathTiles.push([tx, ty]);
          const p = came.get(kk); if (!p) break;
          kk = key(p[0], p[1]);
        }
        pathTiles.reverse();
        return (pathTiles.length ? pathTiles : [[goalTx, goalTy]])
          .map(([tx, ty]) => ({ x: (tx + 0.5) * TILE_SIZE, y: (ty + 0.5) * TILE_SIZE }));
      }

      const cK = key(cx, cy);
      const gHere = g.get(cK) ?? Infinity;

      for (const [dx, dy] of nbr) {
        const nx = cx + dx, ny = cy + dy;
        if (blocked(nx, ny)) continue;
        const nK = key(nx, ny);
        const tentative = gHere + 1;
        if (tentative < (g.get(nK) ?? Infinity)) {
          came.set(nK, [cx, cy]);
          g.set(nK, tentative);
          f.set(nK, tentative + h(nx, ny));
          open.set(nK, [nx, ny]);
        }
      }
    }
    return null;
  }

  // --------------- Targeting & planning ---------------

  _snapTargetToNearestFree(x, y, opts = {}) {
    const { avoid = null, avoidRadiusTiles = 1, maxRing = 6 } = opts;
    let tx0 = clamp(Math.floor(x / TILE_SIZE), 0, MAP_SIZE_TILES - 1);
    let ty0 = clamp(Math.floor(y / TILE_SIZE), 0, MAP_SIZE_TILES - 1);

    const aTx = avoid ? avoid.tx : -9999;
    const aTy = avoid ? avoid.ty : -9999;
    const isAvoided = (tx, ty) =>
      Math.abs(tx - aTx) <= avoidRadiusTiles && Math.abs(ty - aTy) <= avoidRadiusTiles;

    for (let r = 0; r <= maxRing; r++) {
      for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        const tx = tx0 + dx, ty = ty0 + dy;
        if (tx<0||ty<0||tx>=MAP_SIZE_TILES||ty>=MAP_SIZE_TILES) continue;
        if (avoid && isAvoided(tx, ty)) continue;
        const px = (tx + 0.5) * TILE_SIZE, py = (ty + 0.5) * TILE_SIZE;
        if (!this.isBlocked(px, py)) return { x: px, y: py };
      }
    }
    return { x: clamp((tx0 + 0.5) * TILE_SIZE, 0, MAP_PIXEL_SIZE - TILE_SIZE),
             y: clamp((ty0 + 0.5) * TILE_SIZE, 0, MAP_PIXEL_SIZE - TILE_SIZE) };
  }

  _sanitiseWaypoint(pt) {
    if (!pt) return null;
    if (!this.isBlocked(pt.x, pt.y)) return pt;
    const cur = this.player.offset;
    const avoid = { tx: Math.floor(cur.x / TILE_SIZE), ty: Math.floor(cur.y / TILE_SIZE) };
    return this._snapTargetToNearestFree(pt.x, pt.y, { avoid, avoidRadiusTiles: 1 });
  }

  _pickNewTarget(reason = "random") {
    const home = this.patrolHome || this.spawnPoint || this.player.offset;
    const minR = PATROL_MIN_TILES * TILE_SIZE;
    const maxR = PATROL_MAX_TILES * TILE_SIZE;

    // leash back to ring mid if too far
    const dxH = this.player.offset.x - home.x;
    const dyH = this.player.offset.y - home.y;
    const distH = Math.hypot(dxH, dyH);
    if (distH > LEASH_MAX_TILES * TILE_SIZE) {
      const th = Math.atan2(dyH, dxH);
      const r = (minR + maxR) * 0.5;
      const avoid = { tx: Math.floor(this.player.offset.x / TILE_SIZE), ty: Math.floor(this.player.offset.y / TILE_SIZE) };
      this.target = this._snapTargetToNearestFree(
        home.x + Math.cos(th) * r, home.y + Math.sin(th) * r,
        { avoid, avoidRadiusTiles: 1 }
      );
      return;
    }

    const cur = this.player.offset;
    const avoid = { tx: Math.floor(cur.x / TILE_SIZE), ty: Math.floor(cur.y / TILE_SIZE) };

    // Try to pick a point on the patrol band, at least MIN_TRAVEL_PX away
    for (let i = 0; i < 24; i++) {
      const th = Math.random() * Math.PI * 2;
      const r  = minR + (maxR - minR) * (0.35 + 0.65 * Math.random());
      const cx = clamp(home.x + Math.cos(th) * r, 0, MAP_PIXEL_SIZE - TILE_SIZE);
      const cy = clamp(home.y + Math.sin(th) * r, 0, MAP_PIXEL_SIZE - TILE_SIZE);

      const snap = this._snapTargetToNearestFree(cx, cy, { avoid, avoidRadiusTiles: 1 });
      const bkey = this._tileKey(Math.floor(snap.x/TILE_SIZE), Math.floor(snap.y/TILE_SIZE));
      const ts = this._blacklistedTilesUntil.get(bkey) || 0;
      if (ts > Date.now()) continue; // skip recently-bad goal

      if (this.isBlocked(snap.x, snap.y)) continue;

      const leg = Math.hypot(snap.x - cur.x, snap.y - cur.y);
      if (leg < MIN_TRAVEL_PX) continue;

      if (this.lineOfSight(cur.x, cur.y, snap.x, snap.y) || i > 8) {
        this.target = snap;
        return;
      }
    }

    // Last resort: a free neighbour
    if (!this._assignNeighborStepTarget()) {
      this.target = { x: home.x, y: home.y };
    }
  }

  recalcPath(trigger = "unknown") {
    if (!this.target) this._pickNewTarget("init");

    const from = this.player.offset;
    const to   = this.target;

    if (this.lineOfSight(from.x, from.y, to.x, to.y)) {
      this.path = [{ x: to.x, y: to.y }];
    } else {
      const p = this._aStar(from, to);
      this.path = Array.isArray(p) && p.length ? p : [];
      if (!this.path.length) {
        this._pickNewTarget("stalled");
        const p2 = this._aStar(from, this.target);
        this.path = Array.isArray(p2) && p2.length ? p2 : [{ x: this.target.x, y: this.target.y }];
      }
    }

    // sanitise first waypoint(s)
    while (this.path.length && this.isBlocked(this.path[0].x, this.path[0].y)) {
      const fixed = this._sanitiseWaypoint(this.path[0]);
      if (fixed && !this.isBlocked(fixed.x, fixed.y)) { this.path[0] = fixed; break; }
      this.path.shift();
    }


    if (this.path.length <= 1) {
  const kind = (trigger === "blocked" || trigger === "stalled" || trigger === "blocked_wp") ? "blocked" : trigger;
  const now = Date.now();
  if (this._loopKind !== kind || now - this._loopWindowStart > 1200) {
    this._loopKind = kind;
    this._loopCount = 0;
    this._loopWindowStart = now;
  }
  this._loopCount += 1;
  if (this._loopCount >= 3) {        // 3 quick hits within ~1.2s
    this._loopCount = 0;
    this._loopWindowStart = now;
    this._breakSpinLoop(trigger);
    return;
  }
}


    // drop trivial first waypoint (< 0.6 tile)
    if (this.path.length) {
      const wp = this.path[0];
      const minWp = Math.max(TARGET_REACH_RADIUS_PX * 1.6, TILE_SIZE * 0.8);

      if (Math.hypot(wp.x - from.x, wp.y - from.y) < minWp) this.path.shift();
    }

    if (this.debug) this.log(`Path len=${this.path.length} (trigger=${trigger})`);
    if (this.socket) this.socket.emit("bot:debug", { id: this.player.id, path: this.path, target: this.target, trigger });
  }

  _debouncedReplan(trigger) {
    const now = Date.now();
    if (now < this._nextReplanAt) return;
    this._nextReplanAt = now + RECALC_DEBOUNCE_MS;
    this.recalcPath(trigger);
  }

  // --------------- Movement -------------------------

  _tryAdaptiveStep(nx, ny, maxStep, minStep = 4) {
    let step = maxStep;
    for (let i = 0; i < 5 && step >= minStep; i++) {
      const nxX = this.player.offset.x + nx * step;
      const nxY = this.player.offset.y + ny * step;
      if (!this.isBlocked(nxX, nxY)) return { x: nxX, y: nxY };
      step = Math.max(minStep, Math.floor(step / 2));
    }
    return null;
  }

  seekTowardsTarget() {
    // follow first path node if any
    if (this.path.length) {
      // sanitise & drop too-close node
      const wp0 = this._sanitiseWaypoint(this.path[0]);
      if (wp0) this.path[0] = wp0;
      if (this.path.length) {
        const minWp = Math.max(TARGET_REACH_RADIUS_PX * 1.2, TILE_SIZE * 0.6);
        if (Math.hypot(this.player.offset.x - wp0.x, this.player.offset.y - wp0.y) < minWp) {
          this.path.shift();
        }
      }
      if (this.path.length) this.target = this._sanitiseWaypoint(this.path[0]);
    }

    if (!this.target) { this.player.isMoving = 0; return false; }

    const dx = this.target.x - this.player.offset.x;
    const dy = this.target.y - this.player.offset.y;
    const dist = Math.hypot(dx, dy);
    if (!Number.isFinite(dist) || dist < 0.5) {
      this.player.isMoving = 0; this.player.isTurning = 0; return false;
    }

    const nx = dx / dist, ny = dy / dist;


    // If our nose is likely touching something, turn first, then move.
if (Date.now() < this.turnOnlyUntil) {
  const targetDirection = vectorToDirection(nx, ny, this.player.direction);
  const stepped = stepDirectionTowards(this.player.direction, targetDirection, 6);
  const delta = ((stepped - this.player.direction + 16) % 32) - 16;
  this.player.isTurning = delta === 0 ? 0 : Math.sign(delta);
  this.player.direction = stepped;
  this.player.isMoving = 0;     // rotate in place
  return false;                 // don't advance this tick
}


    const tryMove = this._tryAdaptiveStep(nx, ny, Math.min(STEP_PER_TICK_PX, dist), 3);
    if (!tryMove) {
  this.player.isMoving = 0; this.player.isTurning = 0;
  this.blockedStreak += 1;
  this._registerStuck("blocked");

  // NEW: immediate reverse escape if we’re nose-to-wall
  if (this.blockedStreak >= 1 && Date.now() > this.evadeUntil) {
    this._reverseEscape("blocked_reverse");
    return false;
  }

  // Waypoint/plan maintenance as before
  if (this.target && this.checkBlocked(this.target.x, this.target.y)) {
    if (this.path.length) this.path.shift();
    this.target = this._sanitiseWaypoint(this.target);
    this.recalcPath("blocked_wp");
  } else if (this.blockedStreak >= 2) {
    this.recalcPath("blocked");
  }
  return false;
}

    const targetDir = vectorToDirection(nx, ny, this.player.direction);
    const fwd = directionDelta(this.player.direction, targetDir);
    const bwd = directionDelta(this.player.direction, targetDir - 16);

    if (fwd <= bwd) {
      this.player.isMoving = 1;
      const stepped = stepDirectionTowards(this.player.direction, targetDir, 4);
      const delta   = ((stepped - this.player.direction + 16) % 32) - 16;
      this.player.isTurning = delta === 0 ? 0 : Math.sign(delta);
      this.player.direction = stepped;
    } else {
      this.player.isMoving = -1;
      const back = wrapDirection(targetDir - 16);
      const stepped = stepDirectionTowards(this.player.direction, back, 4);
      const delta   = ((stepped - this.player.direction + 16) % 32) - 16;
      this.player.isTurning = delta === 0 ? 0 : Math.sign(delta);
      this.player.direction = stepped;
    }

    this.player.offset.x = tryMove.x;
  this.player.offset.y = tryMove.y;
  this.lastVel.x = nx * tryMove.stepUsed;
  this.lastVel.y = ny * tryMove.stepUsed;
  this.blockedStreak = 0;
  return true;

  }

  _reverseEscape(reason = "reverse_escape") {
  const now = Date.now();
  // 1) Use last velocity if we have it
  let rx = -this.lastVel.x, ry = -this.lastVel.y;
  const len = Math.hypot(rx, ry);
  if (len < 0.01) {
    // 2) Estimate a collision normal by probing 4 directions
    const r = Math.max(10, Math.floor(TILE_SIZE * 0.8));
    const probes = [
      { x: -r, y: 0 }, { x: r, y: 0 }, { x: 0, y: -r }, { x: 0, y: r },
    ].map(p => {
      const px = this.player.offset.x + p.x;
      const py = this.player.offset.y + p.y;
      return { ...p, blocked: this.checkBlocked(px, py) };
    });
    // Build a “push” away from blocked probes
    rx = 0; ry = 0;
    for (const p of probes) if (p.blocked) { rx -= p.x; ry -= p.y; }
    const n = Math.hypot(rx, ry) || 1; rx /= n; ry /= n;
    if (n < 0.01) { rx = 0; ry = 1; } // arbitrary up
  } else {
    rx /= len; ry /= len;
  }

  const backDist = TILE_SIZE * 2.5;
  const bx = this.player.offset.x + rx * backDist;
  const by = this.player.offset.y + ry * backDist;
  const snap = this._snapTargetToNearestFree(bx, by);

  // Enter short evade window
  this.evadeUntil = now + 800;         // 0.8s of “reverse mode”
  this.turnOnlyUntil = now + 250;      // quarter second: turn-in-place first
  this.target = snap;
  this.path = [ { x: snap.x, y: snap.y } ];
  if (this.debug) this.log(`Path len=${this.path.length} (trigger=${reason})`);
}




  reachedTarget() {
    if (!this.target) return true;
    return distance2(this.player.offset.x, this.player.offset.y, this.target.x, this.target.y) <=
           (TARGET_REACH_RADIUS_PX * TARGET_REACH_RADIUS_PX);
  }


    checkBlocked(x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return true;
    if (x < 0 || y < 0) return true;
    if (x > MAP_PIXEL_SIZE - TILE_SIZE || y > MAP_PIXEL_SIZE - TILE_SIZE) return true;

    const rect = createPlayerRectFromCenter(x, y);
    const sx = Math.max(0, Math.floor(rect.x / TILE_SIZE));
    const ex = Math.min(MAP_SIZE_TILES - 1, Math.floor((rect.x + rect.w - 1) / TILE_SIZE));
    const sy = Math.max(0, Math.floor(rect.y / TILE_SIZE));
    const ey = Math.min(MAP_SIZE_TILES - 1, Math.floor((rect.y + rect.h - 1) / TILE_SIZE));
    for (let tx = sx; tx <= ex; tx++) {
      for (let ty = sy; ty <= ey; ty++) {
        const v = this.getMapValue(tx, ty);
        if (BLOCKING_TILE_VALUES.has(v)) return true;
      }
    }
    for (const o of this.obstacles) {
      if (rectsTouchOrOverlap(rect, o)) return true;
    }
    return false;
  }


  _pickReachableRingPoint(home, current, ringRadiusPx) {
  const from = current;
  const baseTheta = Math.atan2(current.y - home.y, current.x - home.x);

  // try angles around the circle; prefer LOS, but require A* reachability
  const ANG_STEPS = [0, 0.25, -0.25, 0.5, -0.5, 0.75, -0.75, 1.0].map(a => a * Math.PI); // ±45°, ±90°, etc.
  for (const dTheta of ANG_STEPS) {
    const theta = baseTheta + dTheta;
    const tx = home.x + Math.cos(theta) * ringRadiusPx;
    const ty = home.y + Math.sin(theta) * ringRadiusPx;
    const snap = this._snapTargetToNearestFree(tx, ty);
    if (this.checkBlocked(snap.x, snap.y)) continue;

    // must be reachable from current tile set
    const path = this._aStar(from, snap);
    if (Array.isArray(path) && path.length) {
      // small bonus: if we also have LOS, it’s golden
      return { target: snap, path, los: this.lineOfSightClear(from.x, from.y, snap.x, snap.y) };
    }
  }
  return null;
}


  // --------------- Unstick / misc -------------------

  _assignNeighborStepTarget() {
    const tx = Math.floor(this.player.offset.x / TILE_SIZE);
    const ty = Math.floor(this.player.offset.y / TILE_SIZE);
    const n = [
      { x: (tx+1+0.5)*TILE_SIZE, y: (ty+0.5)*TILE_SIZE },
      { x: (tx-1+0.5)*TILE_SIZE, y: (ty+0.5)*TILE_SIZE },
      { x: (tx+0.5)*TILE_SIZE,   y: (ty+1+0.5)*TILE_SIZE },
      { x: (tx+0.5)*TILE_SIZE,   y: (ty-1+0.5)*TILE_SIZE },
    ];
    for (const c of n) if (!this.isBlocked(c.x, c.y)) { this.target = c; return true; }
    return false;
  }

  _enforceLeashIfNeeded() {
  if (!this.patrolHome) return;

  // Don’t fight the detour logic or a recent leash attempt
  const now = Date.now();
  if (now < this.inDetourUntil || now < this.leashCooldownUntil) return;

  const dx = this.player.offset.x - this.patrolHome.x;
  const dy = this.player.offset.y - this.patrolHome.y;
  const dist = Math.hypot(dx, dy);
  const leashR = this.LEASH_MAX_TILES * TILE_SIZE;

  if (dist <= leashR) return; // inside leash

  // Aim for middle of the patrol band and validate reachability
  const midR = ((this.PATROL_MIN_TILES + this.PATROL_MAX_TILES) * 0.5) * TILE_SIZE;
  const pick = this._pickReachableRingPoint(this.patrolHome, this.player.offset, midR);

  if (pick) {
    this.target = pick.target;
    this.path = pick.los ? [ { ...pick.target } ] : pick.path;
    this.recalcPath("leash");
    this.leashFailCount = 0;
    return;
  }

  // Couldn’t find a reachable ring point: back off and let detours/pathing work for a bit
  this.leashFailCount += 1;
  const backoffMs = Math.min(4000, 800 + this.leashFailCount * 600);
  this.leashCooldownUntil = now + backoffMs;

  // Nudge with a tangent escape so we change connected component if needed
  this._cornerEscape("leash_backoff");
}

  _tangentCandidate(side) {
    const from = this.player.offset;
    const to = this.target || from;
    let dx = to.x - from.x, dy = to.y - from.y;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len; dy /= len;
    const tx = -dy * side, ty = dx * side; // tangent

    const lateral = (1.5 + Math.random() * 1.0) * TILE_SIZE;
    const forward = (3.0 + Math.random() * 1.0) * TILE_SIZE;
    const raw = { x: from.x + tx*lateral + dx*forward, y: from.y + ty*lateral + dy*forward };
    const avoid = { tx: Math.floor(from.x / TILE_SIZE), ty: Math.floor(from.y / TILE_SIZE) };
    return this._snapTargetToNearestFree(raw.x, raw.y, { avoid });
  }

  

  _sameTile(a, b) {
  if (!a || !b) return false;
  return (Math.floor(a.x / TILE_SIZE) === Math.floor(b.x / TILE_SIZE)) &&
         (Math.floor(a.y / TILE_SIZE) === Math.floor(b.y / TILE_SIZE));
}

  _minHopPx() { return Math.max(8, Math.floor(TILE_SIZE * 0.4)); } // don’t accept micro moves

 _cornerEscape(reason="stuck") {
    const from = this.player.offset;
    const left  = this._tangentCandidate(-1);
    const right = this._tangentCandidate(+1);
    const minHop = this._minHopPx();
    const farEnough = (p)=> p && Math.hypot(p.x-from.x,p.y-from.y) >= minHop;

    let picks = [left,right].filter(p => p && !this._sameTile(p, from) && farEnough(p));

    if (!picks.length) {
      const avoid = { tx: Math.floor(from.x / TILE_SIZE), ty: Math.floor(from.y / TILE_SIZE) };
      for (let i=0;i<8 && !picks.length;i++){
        const a = (i/8) * Math.PI*2;
        const r = 2.5*TILE_SIZE;
        const rx = from.x + Math.cos(a)*r, ry = from.y + Math.sin(a)*r;
        const s = this._snapTargetToNearestFree(rx,ry,{ avoid });
        if (!this._sameTile(s,from) && farEnough(s) && !this.checkBlocked(s.x,s.y)) picks.push(s);
      }
    }

    const score = (p)=>{
      const r = TILE_SIZE*0.6; let free=0, total=8;
      for (let i=0;i<total;i++){
        const a=(i/total)*Math.PI*2, sx=p.x+Math.cos(a)*r, sy=p.y+Math.sin(a)*r;
        if (!this.checkBlocked(sx,sy)) free++;
      }
      return free;
    };
    picks.sort((a,b)=>score(b)-score(a));
    const pick = picks[0] || { x: from.x + TILE_SIZE*2, y: from.y };

    this.inDetourUntil = Date.now() + 1500;
    this.target = pick;
    this.path = [];
    this.recalcPath("corner_escape");
  }


  _ensureNotInsideBlocking() {
    const rect = playerRectFromCenter(this.player.offset.x, this.player.offset.y);
    if (!this._rectBlocked(rect)) return false;

    // push out of obstacle or tile
    const tx0 = Math.floor(this.player.offset.x / TILE_SIZE);
    const ty0 = Math.floor(this.player.offset.y / TILE_SIZE);
    for (let r = 1; r <= 6; r++) {
      for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        const tx = tx0 + dx, ty = ty0 + dy;
        if (tx<0||ty<0||tx>=MAP_SIZE_TILES||ty>=MAP_SIZE_TILES) continue;
        const px = (tx + 0.5) * TILE_SIZE, py = (ty + 0.5) * TILE_SIZE;
        if (!this.isBlocked(px, py)) { this.player.offset.x = px; this.player.offset.y = py; return true; }
      }
    }
    return false;
  }

  tick() {
    if (!this.socket || this.socket.disconnected || !this.ready) return;

    // If embedded (spawned into geometry), pop out and plan
    if (Date.now() - this._lastUnstickAt > 1500) {
      if (this._ensureNotInsideBlocking()) {
        this._lastUnstickAt = Date.now();
        this._assignNeighborStepTarget();
        this.recalcPath("unstick");
      }
    }

    if (Date.now() < this.evadeUntil) {
  // keep going to the reverse waypoint; let seekTowardsTarget drive
} else {
  // normal leash/target maintenance
  this._enforceLeashIfNeeded();
  if (!this.target || this.reachedTarget()) this.pickNewTarget("reached");
}


    const before = { ...this.player.offset };
    const beforeDist = this.target ? Math.hypot(this.target.x - before.x, this.target.y - before.y) : 0;

    const moved = this.seekTowardsTarget();

    const posDelta = Math.hypot(this.player.offset.x - before.x, this.player.offset.y - before.y);
    const afterDist = this.target ? Math.hypot(this.target.x - this.player.offset.x, this.target.y - this.player.offset.y) : 0;
    const progressed = (posDelta >= 0.75) || (beforeDist - afterDist >= 0.75);


    if (!moved && this.path.length <= 1) {
  // immediate escape without waiting for stall streak
  this._breakSpinLoop("blocked");
}

    if (progressed) { this._noProgressStreak = 0; this._lastProgressAt = Date.now(); }
    else            { this._noProgressStreak += 1; }

    if (!moved || this._noProgressStreak >= STALL_TICKS) {
      this._noProgressStreak = 0;
      this.recalcPath("stalled");
    }

    if (this.debug && (this.player.sequence % 30 === 0)) {
      this.log(`tick: pos=${this.player.offset.x|0},${this.player.offset.y|0} target=${this.target?`${this.target.x|0},${this.target.y|0}`:"-"} moving=${this.player.isMoving} pathLen=${this.path.length}`);
    }

    this._emitPlayerUpdate();
  }

  _emitPlayerUpdate() {
    if (!this.socket || this.socket.disconnected) return;
    this.player.sequence += 1;
    const p = this.player;
    const payload = {
      id: p.id, city: p.city, isMayor: p.isMayor, health: p.health,
      direction: wrapDirection(p.direction), isTurning: 0, isMoving: p.isMoving,
      bombsArmed: false, isCloaked: false, cloakExpiresAt: 0, isFrozen: false, frozenUntil: 0,
      sequence: p.sequence,
      offset: { x: Math.round(p.offset.x), y: Math.round(p.offset.y) }
    };
    this.socket.emit("player", JSON.stringify(payload));
  }

  // --------------- Spawn & parsing ------------------

  resolveCitySpawn(cityId) {
    if (!Number.isFinite(cityId)) return null;
    const entry = citySpawns && citySpawns[String(cityId)];
    if (!entry) return null;
    const tx = Number(entry.tileX), ty = Number(entry.tileY);
    if (!Number.isFinite(tx) || !Number.isFinite(ty)) return null;
    return { x: (tx + 0.5) * TILE_SIZE, y: (ty + 0.5) * TILE_SIZE };
  }

  safeParse(payload) {
    if (payload == null) return null;
    if (typeof payload === "object") return payload;
    if (typeof payload !== "string") return null;
    try { return JSON.parse(payload); }
    catch (e) { this.warn("Failed to parse payload:", e.message); return null; }
  }
}

// -------------------- Entrypoint --------------------

if (require.main === module) {
  const options = parseArgs();
  const bot = new BotClient(options);
  bot.connect();

  const shutdown = () => {
    bot.log("Shutting down");
    bot._stopLoop();
    if (bot.socket && bot.socket.connected) bot.socket.disconnect();
    process.exit(0);
  };

  process.on("SIGINT",  shutdown);
  process.on("SIGTERM", shutdown);
  process.on("SIGUSR2", shutdown);
}

module.exports = { BotClient };
