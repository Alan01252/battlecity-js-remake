"use strict";

const {
  MAP_SIZE_TILES,
  NAV_DEFAULTS
} = require("./config");
const {
  clamp,
  vectorToDirection,
  directionDelta,
  stepDirectionTowards,
  distance2
} = require("./helpers");

class NavigationState {
  constructor() {
    this.target = null;
    this.path = [];
    this.nextReplanAt = 0;
    this.blockedStreak = 0;
    this.noProgressStreak = 0;
    this.lastProgressAt = Date.now();
    this.lastUnstickAt = 0;
    this.lastVelocity = { x: 0, y: 0 };
    this.evadeUntil = 0;
    this.turnOnlyUntil = 0;
    this.inDetourUntil = 0;
    this.leashCooldownUntil = 0;
    this.leashFailCount = 0;
    this.loopKind = null;
    this.loopCount = 0;
    this.loopWindowStart = 0;
    this.blacklistedTiles = new Map();
    this.stuckScore = 0;
    this.lastStuckAt = 0;
    this.spawnPoint = null;
    this.patrolHome = null;
  }
}

class NavigationController {
  constructor(options = {}) {
    const {
      world,
      player,
      state = new NavigationState(),
      log = () => {},
      debug = false,
      onPathUpdate = () => {}
    } = options;

    if (!world) throw new Error("NavigationController requires a world instance");
    if (!player) throw new Error("NavigationController requires a player reference");

    this.world = world;
    this.player = player;
    this.state = state;
    this.log = log;
    this.debugEnabled = Boolean(debug);
    this.onPathUpdate = typeof onPathUpdate === "function" ? onPathUpdate : () => {};
    this.config = { ...NAV_DEFAULTS };
  }

  get target() {
    return this.state.target;
  }

  set target(next) {
    this.state.target = next;
  }

  get path() {
    return this.state.path;
  }

  set path(next) {
    this.state.path = Array.isArray(next) ? next : [];
  }

  setSpawnPoint(spawn, { adoptAsHome = false } = {}) {
    this.state.spawnPoint = spawn ? { ...spawn } : null;
    if (adoptAsHome || !this.state.patrolHome) {
      this.state.patrolHome = spawn ? { ...spawn } : null;
    }
  }

  setPatrolHome(home) {
    this.state.patrolHome = home ? { ...home } : null;
  }

  debouncedReplan(trigger) {
    const now = Date.now();
    if (now < this.state.nextReplanAt) return;
    this.state.nextReplanAt = now + this.config.replanDebounceMs;
    this.recalcPath(trigger);
  }

  pickNewTarget(reason = "random") {
    const home = this.state.patrolHome || this.state.spawnPoint || this.player.offset;
    const tileSize = this.world.tileSize;
    const mapPixelSize = this.world.mapPixelSize;
    const minR = this.config.patrolMinTiles * tileSize;
    const maxR = this.config.patrolMaxTiles * tileSize;

    const dxH = this.player.offset.x - home.x;
    const dyH = this.player.offset.y - home.y;
    const distH = Math.hypot(dxH, dyH);
    if (distH > this.config.leashMaxTiles * tileSize) {
      const th = Math.atan2(dyH, dxH);
      const r = (minR + maxR) * 0.5;
      const avoid = {
        tx: Math.floor(this.player.offset.x / tileSize),
        ty: Math.floor(this.player.offset.y / tileSize)
      };
      this.state.target = this.world.snapTargetToNearestFree(
        clamp(home.x + Math.cos(th) * r, 0, mapPixelSize - tileSize),
        clamp(home.y + Math.sin(th) * r, 0, mapPixelSize - tileSize),
        { avoid, avoidRadiusTiles: 1 }
      );
      return;
    }

    const cur = this.player.offset;
    const avoid = {
      tx: Math.floor(cur.x / tileSize),
      ty: Math.floor(cur.y / tileSize)
    };

    for (let i = 0; i < 24; i++) {
      const th = Math.random() * Math.PI * 2;
      const r = minR + (maxR - minR) * (0.35 + 0.65 * Math.random());
      const cx = clamp(home.x + Math.cos(th) * r, 0, mapPixelSize - tileSize);
      const cy = clamp(home.y + Math.sin(th) * r, 0, mapPixelSize - tileSize);

      const snap = this.world.snapTargetToNearestFree(cx, cy, { avoid, avoidRadiusTiles: 1 });
      const key = this.world.tileKey(
        Math.floor(snap.x / tileSize),
        Math.floor(snap.y / tileSize)
      );
      const blockedUntil = this.state.blacklistedTiles.get(key) || 0;
      if (blockedUntil > Date.now()) continue;
      if (this.world.isBlocked(snap.x, snap.y)) continue;

      const leg = Math.hypot(snap.x - cur.x, snap.y - cur.y);
      if (leg < this.config.minTravelPx) continue;

      if (this.world.lineOfSight(cur.x, cur.y, snap.x, snap.y) || i > 8) {
        this.state.target = snap;
        return;
      }
    }

    if (!this.state.target || this._sameTile(this.state.target, this.player.offset)) {
      if (!this._assignNeighborStepTarget()) {
        this.state.target = { x: home.x, y: home.y };
      }
    }
  }

  _assignNeighborStepTarget() {
    const tileSize = this.world.tileSize;
    const tx = Math.floor(this.player.offset.x / tileSize);
    const ty = Math.floor(this.player.offset.y / tileSize);
    const candidates = [
      { x: (tx + 1 + 0.5) * tileSize, y: (ty + 0.5) * tileSize },
      { x: (tx - 1 + 0.5) * tileSize, y: (ty + 0.5) * tileSize },
      { x: (tx + 0.5) * tileSize, y: (ty + 1 + 0.5) * tileSize },
      { x: (tx + 0.5) * tileSize, y: (ty - 1 + 0.5) * tileSize }
    ];
    for (const c of candidates) {
      if (!this.world.isBlocked(c.x, c.y)) {
        this.state.target = c;
        return true;
      }
    }
    return false;
  }

  _sanitiseWaypoint(pt) {
    if (!pt) return null;
    if (!this.world.isBlocked(pt.x, pt.y)) return pt;
    const cur = this.player.offset;
    const avoid = {
      tx: Math.floor(cur.x / this.world.tileSize),
      ty: Math.floor(cur.y / this.world.tileSize)
    };
    return this.world.snapTargetToNearestFree(pt.x, pt.y, { avoid, avoidRadiusTiles: 1 });
  }

  _blockedCellFactory() {
    const dyn = new Set();
    const tileSize = this.world.tileSize;

    for (const o of this.world.obstacles) {
      const sx = clamp(Math.floor(o.x / tileSize), 0, MAP_SIZE_TILES - 1);
      const ex = clamp(Math.floor((o.x + o.w - 1) / tileSize), 0, MAP_SIZE_TILES - 1);
      const sy = clamp(Math.floor(o.y / tileSize), 0, MAP_SIZE_TILES - 1);
      const ey = clamp(Math.floor((o.y + o.h - 1) / tileSize), 0, MAP_SIZE_TILES - 1);
      for (let tx = sx; tx <= ex; tx++) {
        for (let ty = sy; ty <= ey; ty++) {
          dyn.add((ty << 10) | tx);
        }
      }
    }

    return (tx, ty) => (
      tx < 0 ||
      ty < 0 ||
      tx >= MAP_SIZE_TILES ||
      ty >= MAP_SIZE_TILES ||
      dyn.has((ty << 10) | tx) ||
      this.world.isTileBlocked(tx, ty)
    );
  }

  _aStar(fromPx, toPx) {
    const tileSize = this.world.tileSize;
    const startTx = clamp(Math.floor(fromPx.x / tileSize), 0, MAP_SIZE_TILES - 1);
    const startTy = clamp(Math.floor(fromPx.y / tileSize), 0, MAP_SIZE_TILES - 1);
    const goalTx = clamp(Math.floor(toPx.x / tileSize), 0, MAP_SIZE_TILES - 1);
    const goalTy = clamp(Math.floor(toPx.y / tileSize), 0, MAP_SIZE_TILES - 1);

    const blocked = this._blockedCellFactory();
    if (blocked(goalTx, goalTy) || blocked(startTx, startTy)) return null;

    const key = (x, y) => (y << 10) | x;
    const h = (x, y) => Math.abs(x - goalTx) + Math.abs(y - goalTy);

    const open = new Map();
    const g = new Map();
    const f = new Map();
    const came = new Map();

    const sK = key(startTx, startTy);
    open.set(sK, [startTx, startTy]);
    g.set(sK, 0);
    f.set(sK, h(startTx, startTy));

    const nbr = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    let safety = 20000;

    while (open.size && safety-- > 0) {
      let bestK = null;
      let bestF = Infinity;
      let best = null;
      for (const [k, [x, y]] of open) {
        const fv = f.get(k) ?? Infinity;
        if (fv < bestF) {
          bestF = fv;
          bestK = k;
          best = [x, y];
        }
      }
      if (!best) break;

      open.delete(bestK);
      const [cx, cy] = best;
      if (cx === goalTx && cy === goalTy) {
        const pathTiles = [];
        let kk = bestK;
        while (kk !== sK) {
          const ty = kk >> 10;
          const tx = kk & ((1 << 10) - 1);
          pathTiles.push([tx, ty]);
          const p = came.get(kk);
          if (!p) break;
          kk = key(p[0], p[1]);
        }
        pathTiles.reverse();
        const tiles = pathTiles.length ? pathTiles : [[goalTx, goalTy]];
        return tiles.map(([tx, ty]) => ({
          x: (tx + 0.5) * tileSize,
          y: (ty + 0.5) * tileSize
        }));
      }

      const cK = key(cx, cy);
      const gHere = g.get(cK) ?? Infinity;

      for (const [dx, dy] of nbr) {
        const nx = cx + dx;
        const ny = cy + dy;
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

  recalcPath(trigger = "unknown") {
    if (!this.state.target) this.pickNewTarget("init");

    const from = this.player.offset;
    const to = this.state.target;

    if (this.world.lineOfSight(from.x, from.y, to.x, to.y)) {
      this.state.path = [{ x: to.x, y: to.y }];
    } else {
      const p = this._aStar(from, to);
      this.state.path = Array.isArray(p) && p.length ? p : [];
      if (!this.state.path.length) {
        this.pickNewTarget("stalled");
        const fallback = this._aStar(from, this.state.target);
        this.state.path = Array.isArray(fallback) && fallback.length
          ? fallback
          : [{ x: this.state.target.x, y: this.state.target.y }];
      }
    }

    while (this.state.path.length && this.world.isBlocked(this.state.path[0].x, this.state.path[0].y)) {
      const fixed = this._sanitiseWaypoint(this.state.path[0]);
      if (fixed && !this.world.isBlocked(fixed.x, fixed.y)) {
        this.state.path[0] = fixed;
        break;
      }
      this.state.path.shift();
    }

    if (this.state.path.length <= 1) {
      const now = Date.now();
      const kind = (trigger === "blocked" || trigger === "stalled" || trigger === "blocked_wp")
        ? "blocked"
        : trigger;
      if (this.state.loopKind !== kind || now - this.state.loopWindowStart > 1200) {
        this.state.loopKind = kind;
        this.state.loopCount = 0;
        this.state.loopWindowStart = now;
      }
      this.state.loopCount += 1;
      if (this.state.loopCount >= 3) {
        this.state.loopCount = 0;
        this.state.loopWindowStart = now;
        this._breakSpinLoop(trigger);
        return;
      }
    }

    if (this.state.path.length) {
      const wp = this.state.path[0];
      const minWp = Math.max(this.config.targetReachRadiusPx * 1.6, this.world.tileSize * 0.8);
      if (Math.hypot(wp.x - from.x, wp.y - from.y) < minWp) {
        this.state.path.shift();
      }
    }

    if (this.debugEnabled) {
      this.log(`Path len=${this.state.path.length} (trigger=${trigger})`);
    }

    this.onPathUpdate({
      path: this.state.path.map(p => ({ x: p.x, y: p.y })),
      target: this.state.target ? { ...this.state.target } : null,
      trigger
    });
  }

  _makeTangentDetour(distanceTiles = 2.5, forwardTiles = 2.5) {
    const target = this.state.target;
    if (!target) return null;
    const from = this.player.offset;

    const dx = target.x - from.x;
    const dy = target.y - from.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const lx = -uy;
    const ly = ux;

    const dist = distanceTiles * this.world.tileSize;
    const fwd = forwardTiles * this.world.tileSize;

    const candidates = [
      { x: from.x + lx * dist + ux * fwd, y: from.y + ly * dist + uy * fwd },
      { x: from.x - lx * dist + ux * fwd, y: from.y - ly * dist + uy * fwd }
    ];

    for (const c of candidates) {
      const snap = this.world.snapTargetToNearestFree(c.x, c.y, {
        avoid: {
          tx: Math.floor(from.x / this.world.tileSize),
          ty: Math.floor(from.y / this.world.tileSize)
        },
        avoidRadiusTiles: 1
      });
      if (!this.world.isBlocked(snap.x, snap.y)) return snap;
    }
    return null;
  }

  _breakSpinLoop(trigger) {
    const now = Date.now();
    const detour = this._makeTangentDetour(2.5, 2.5);
    if (detour) {
      this.state.target = detour;
      this.state.path = [{ x: detour.x, y: detour.y }];
      if (this.debugEnabled) {
        this.log(`Path len=${this.state.path.length} (trigger=${trigger}_detour)`);
      }
      this.onPathUpdate({
        path: this.state.path.map(p => ({ x: p.x, y: p.y })),
        target: { ...detour },
        trigger: `${trigger}_detour`
      });
      return true;
    }

    if (this.state.target) {
      const gtx = Math.floor(this.state.target.x / this.world.tileSize);
      const gty = Math.floor(this.state.target.y / this.world.tileSize);
      this.state.blacklistedTiles.set(this.world.tileKey(gtx, gty), now + 4000);
    }

    this.pickNewTarget("loop_break");
    this.recalcPath("loop_break");
    return true;
  }

  _tryAdaptiveStep(nx, ny, maxStep, minStep = 4) {
    let step = maxStep;
    for (let i = 0; i < 5 && step >= minStep; i++) {
      const nxX = this.player.offset.x + nx * step;
      const nxY = this.player.offset.y + ny * step;
      if (!this.world.isBlocked(nxX, nxY)) {
        return { x: nxX, y: nxY, stepUsed: step };
      }
      step = Math.max(minStep, Math.floor(step / 2));
    }
    return null;
  }

  _registerStuck() {
    const now = Date.now();
    if (now - this.state.lastStuckAt > 900) this.state.stuckScore = 0;
    this.state.lastStuckAt = now;
    this.state.stuckScore += 1;
    if (this.state.stuckScore >= 4) {
      this._cornerEscape("stuck_burst");
      this.state.stuckScore = 0;
    }
  }

  seekTowardsTarget(now = Date.now()) {
    if (this.state.path.length) {
      const wp0 = this._sanitiseWaypoint(this.state.path[0]);
      if (wp0) this.state.path[0] = wp0;
      if (this.state.path.length) {
        const minWp = Math.max(this.config.targetReachRadiusPx * 1.2, this.world.tileSize * 0.6);
        if (Math.hypot(this.player.offset.x - wp0.x, this.player.offset.y - wp0.y) < minWp) {
          this.state.path.shift();
        }
      }
      if (this.state.path.length) this.state.target = this._sanitiseWaypoint(this.state.path[0]);
    }

    if (!this.state.target) {
      this.player.isMoving = 0;
      this.player.isTurning = 0;
      return false;
    }

    const dx = this.state.target.x - this.player.offset.x;
    const dy = this.state.target.y - this.player.offset.y;
    const dist = Math.hypot(dx, dy);
    if (!Number.isFinite(dist) || dist < 0.5) {
      this.player.isMoving = 0;
      this.player.isTurning = 0;
      return false;
    }

    const nx = dx / dist;
    const ny = dy / dist;

    if (now < this.state.turnOnlyUntil) {
      const targetDirection = vectorToDirection(nx, ny, this.player.direction);
      const stepped = stepDirectionTowards(this.player.direction, targetDirection, 6);
      const delta = ((stepped - this.player.direction + 16) % 32) - 16;
      this.player.isTurning = delta === 0 ? 0 : Math.sign(delta);
      this.player.direction = stepped;
      this.player.isMoving = 0;
      return false;
    }

    const tryMove = this._tryAdaptiveStep(nx, ny, Math.min(this.config.stepPerTickPx, dist), 3);
    if (!tryMove) {
      this.player.isMoving = 0;
      this.player.isTurning = 0;
      this.state.blockedStreak += 1;
      this._registerStuck();

      if (this.state.blockedStreak >= 1 && now > this.state.evadeUntil) {
        this._reverseEscape("blocked_reverse");
        return false;
      }

      if (this.state.target && this.world.isBlocked(this.state.target.x, this.state.target.y)) {
        if (this.state.path.length) this.state.path.shift();
        this.state.target = this._sanitiseWaypoint(this.state.target);
        this.recalcPath("blocked_wp");
      } else if (this.state.blockedStreak >= 2) {
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
      const delta = ((stepped - this.player.direction + 16) % 32) - 16;
      this.player.isTurning = delta === 0 ? 0 : Math.sign(delta);
      this.player.direction = stepped;
    } else {
      this.player.isMoving = -1;
      const back = ((targetDir - 16) % 32 + 32) % 32;
      const stepped = stepDirectionTowards(this.player.direction, back, 4);
      const delta = ((stepped - this.player.direction + 16) % 32) - 16;
      this.player.isTurning = delta === 0 ? 0 : Math.sign(delta);
      this.player.direction = stepped;
    }

    this.player.offset.x = tryMove.x;
    this.player.offset.y = tryMove.y;
    this.state.lastVelocity.x = nx * tryMove.stepUsed;
    this.state.lastVelocity.y = ny * tryMove.stepUsed;
    this.state.blockedStreak = 0;
    return true;
  }

  _reverseEscape(reason = "reverse_escape") {
    const now = Date.now();
    let rx = -this.state.lastVelocity.x;
    let ry = -this.state.lastVelocity.y;
    const len = Math.hypot(rx, ry);

    if (len < 0.01) {
      const r = Math.max(10, Math.floor(this.world.tileSize * 0.8));
      const probes = [
        { x: -r, y: 0 }, { x: r, y: 0 }, { x: 0, y: -r }, { x: 0, y: r }
      ].map(p => {
        const px = this.player.offset.x + p.x;
        const py = this.player.offset.y + p.y;
        return { ...p, blocked: this.world.isBlocked(px, py) };
      });
      rx = 0;
      ry = 0;
      for (const p of probes) {
        if (p.blocked) {
          rx -= p.x;
          ry -= p.y;
        }
      }
      const n = Math.hypot(rx, ry) || 1;
      rx /= n;
      ry /= n;
      if (n < 0.01) {
        rx = 0;
        ry = 1;
      }
    } else {
      rx /= len;
      ry /= len;
    }

    const backDist = this.world.tileSize * 2.5;
    const bx = this.player.offset.x + rx * backDist;
    const by = this.player.offset.y + ry * backDist;
    const snap = this.world.snapTargetToNearestFree(bx, by);

    this.state.evadeUntil = now + 800;
    this.state.turnOnlyUntil = now + 250;
    this.state.target = snap;
    this.state.path = [{ x: snap.x, y: snap.y }];

    if (this.debugEnabled) {
      this.log(`Path len=${this.state.path.length} (trigger=${reason})`);
    }
    this.onPathUpdate({
      path: this.state.path.map(p => ({ x: p.x, y: p.y })),
      target: { ...snap },
      trigger: reason
    });
  }

  _pickReachableRingPoint(home, current, ringRadiusPx) {
    const baseTheta = Math.atan2(current.y - home.y, current.x - home.x);
    const ANG_STEPS = [0, 0.25, -0.25, 0.5, -0.5, 0.75, -0.75, 1.0].map(a => a * Math.PI);
    for (const dTheta of ANG_STEPS) {
      const theta = baseTheta + dTheta;
      const tx = home.x + Math.cos(theta) * ringRadiusPx;
      const ty = home.y + Math.sin(theta) * ringRadiusPx;
      const snap = this.world.snapTargetToNearestFree(tx, ty);
      if (this.world.isBlocked(snap.x, snap.y)) continue;

      const path = this._aStar(current, snap);
      if (Array.isArray(path) && path.length) {
        return {
          target: snap,
          path,
          los: this.world.lineOfSight(current.x, current.y, snap.x, snap.y)
        };
      }
    }
    return null;
  }

  _enforceLeashIfNeeded(now) {
    if (!this.state.patrolHome) return;
    if (now < this.state.inDetourUntil || now < this.state.leashCooldownUntil) return;

    const dx = this.player.offset.x - this.state.patrolHome.x;
    const dy = this.player.offset.y - this.state.patrolHome.y;
    const dist = Math.hypot(dx, dy);
    const leashRadius = this.config.leashMaxTiles * this.world.tileSize;
    if (dist <= leashRadius) return;

    const midR = ((this.config.patrolMinTiles + this.config.patrolMaxTiles) * 0.5) * this.world.tileSize;
    const pick = this._pickReachableRingPoint(this.state.patrolHome, this.player.offset, midR);

    if (pick) {
      this.state.target = pick.target;
      this.state.path = pick.los ? [{ ...pick.target }] : pick.path;
      this.recalcPath("leash");
      this.state.leashFailCount = 0;
      return;
    }

    this.state.leashFailCount += 1;
    const backoffMs = Math.min(4000, 800 + this.state.leashFailCount * 600);
    this.state.leashCooldownUntil = now + backoffMs;
    this._cornerEscape("leash_backoff");
  }

  _tangentCandidate(side) {
    const from = this.player.offset;
    const to = this.state.target || from;
    let dx = to.x - from.x;
    let dy = to.y - from.y;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    const tx = -dy * side;
    const ty = dx * side;

    const lateral = (1.5 + Math.random() * 1.0) * this.world.tileSize;
    const forward = (3.0 + Math.random() * 1.0) * this.world.tileSize;
    const raw = {
      x: from.x + tx * lateral + dx * forward,
      y: from.y + ty * lateral + dy * forward
    };
    const avoid = {
      tx: Math.floor(from.x / this.world.tileSize),
      ty: Math.floor(from.y / this.world.tileSize)
    };
    return this.world.snapTargetToNearestFree(raw.x, raw.y, { avoid });
  }

  _sameTile(a, b) {
    if (!a || !b) return false;
    const tileSize = this.world.tileSize;
    return (
      Math.floor(a.x / tileSize) === Math.floor(b.x / tileSize) &&
      Math.floor(a.y / tileSize) === Math.floor(b.y / tileSize)
    );
  }

  _minHopPx() {
    return Math.max(8, Math.floor(this.world.tileSize * 0.4));
  }

  _cornerEscape(reason = "stuck") {
    const from = this.player.offset;
    const left = this._tangentCandidate(-1);
    const right = this._tangentCandidate(+1);
    const minHop = this._minHopPx();
    const farEnough = (p) => p && Math.hypot(p.x - from.x, p.y - from.y) >= minHop;

    let picks = [left, right].filter(p => p && !this._sameTile(p, from) && farEnough(p));

    if (!picks.length) {
      const avoid = {
        tx: Math.floor(from.x / this.world.tileSize),
        ty: Math.floor(from.y / this.world.tileSize)
      };
      for (let i = 0; i < 8 && !picks.length; i++) {
        const a = (i / 8) * Math.PI * 2;
        const r = 2.5 * this.world.tileSize;
        const rx = from.x + Math.cos(a) * r;
        const ry = from.y + Math.sin(a) * r;
        const s = this.world.snapTargetToNearestFree(rx, ry, { avoid });
        if (!this._sameTile(s, from) && farEnough(s) && !this.world.isBlocked(s.x, s.y)) picks.push(s);
      }
    }

    const score = (p) => {
      const r = this.world.tileSize * 0.6;
      let free = 0;
      const total = 8;
      for (let i = 0; i < total; i++) {
        const a = (i / total) * Math.PI * 2;
        const sx = p.x + Math.cos(a) * r;
        const sy = p.y + Math.sin(a) * r;
        if (!this.world.isBlocked(sx, sy)) free += 1;
      }
      return free;
    };

    picks.sort((a, b) => score(b) - score(a));
    const pick = picks[0] || { x: from.x + this.world.tileSize * 2, y: from.y };

    this.state.inDetourUntil = Date.now() + 1500;
    this.state.target = pick;
    this.state.path = [];
    this.recalcPath("corner_escape");

    if (this.debugEnabled) {
      this.log(`Corner escape triggered (${reason})`);
    }
  }

  reachedTarget() {
    if (!this.state.target) return true;
    return distance2(
      this.player.offset.x,
      this.player.offset.y,
      this.state.target.x,
      this.state.target.y
    ) <= (this.config.targetReachRadiusPx * this.config.targetReachRadiusPx);
  }

  tick(now = Date.now()) {
    const unstickDelay = 1500;
    if (now - this.state.lastUnstickAt > unstickDelay) {
      const corrected = this.world.ensureNotInside(this.player.offset);
      if (corrected) {
        this.player.offset = corrected;
        this.state.lastUnstickAt = now;
        this._assignNeighborStepTarget();
        this.recalcPath("unstick");
      }
    }

    if (now < this.state.evadeUntil) {
      // reverse escape in progress
    } else {
      this._enforceLeashIfNeeded(now);
      if (!this.state.target || this.reachedTarget()) {
        this.pickNewTarget("reached");
      }
    }

    const before = { x: this.player.offset.x, y: this.player.offset.y };
    const beforeDist = this.state.target
      ? Math.hypot(this.state.target.x - before.x, this.state.target.y - before.y)
      : 0;

    const moved = this.seekTowardsTarget(now);

    const posDelta = Math.hypot(this.player.offset.x - before.x, this.player.offset.y - before.y);
    const afterDist = this.state.target
      ? Math.hypot(this.state.target.x - this.player.offset.x, this.state.target.y - this.player.offset.y)
      : 0;
    const progressed = (posDelta >= 0.75) || (beforeDist - afterDist >= 0.75);

    if (!moved && this.state.path.length <= 1) {
      this._breakSpinLoop("blocked");
    }

    if (progressed) {
      this.state.noProgressStreak = 0;
      this.state.lastProgressAt = now;
    } else {
      this.state.noProgressStreak += 1;
    }

    if (!moved || this.state.noProgressStreak >= this.config.stallTicks) {
      this.state.noProgressStreak = 0;
      this.recalcPath("stalled");
    }

    if (this.debugEnabled && (this.player.sequence % 30 === 0)) {
      const tgt = this.state.target
        ? `${this.state.target.x | 0},${this.state.target.y | 0}`
        : "-";
      this.log(
        `tick: pos=${this.player.offset.x | 0},${this.player.offset.y | 0} ` +
        `target=${tgt} moving=${this.player.isMoving} pathLen=${this.state.path.length}`
      );
    }

    return moved;
  }
}

module.exports = { NavigationController, NavigationState };
