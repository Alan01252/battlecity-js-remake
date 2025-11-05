#!/usr/bin/env node
"use strict";

const { io } = require("socket.io-client");

const {
  DEFAULT_SERVER_URL,
  MAX_HEALTH,
  TICK_INTERVAL_MS,
  TILE_SIZE
} = require("./config");
const {
  wrapDirection,
  safeParse,
  directionDelta,
  vectorToDirection,
  distance2
} = require("./helpers");
const { WorldState } = require("./world");
const { NavigationController, NavigationState } = require("./navigation");

const parseArgs = () => {
  const args = process.argv.slice(2);
  const options = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--server" && args[i + 1]) {
      options.serverUrl = args[++i];
    } else if ((a === "--city" || a === "-c") && args[i + 1]) {
      const v = Number(args[++i]);
      if (Number.isFinite(v)) options.city = Math.max(0, Math.floor(v));
    } else if ((a === "--role" || a === "-r") && args[i + 1]) {
      options.role = (args[++i] || "").toLowerCase();
    } else if ((a === "--name" || a === "-n") && args[i + 1]) {
      options.name = args[++i];
    }
  }
  return options;
};

class BotClient {
  constructor(options = {}) {
    this.serverUrl = options.serverUrl || DEFAULT_SERVER_URL;
    this.cityPreference = Number.isFinite(options.city) ? Math.max(0, Math.floor(options.city)) : null;
    this.rolePreference = (options.role && typeof options.role === "string") ? options.role.toLowerCase() : "recruit";
    this.name = options.name || `bot-${Math.floor(Math.random() * 9999)}`;

    this.socket = null;
    this.loopHandle = null;
    this.ready = false;
    this.debug = process.env.BOT_DEBUG === "1";

    this.otherPlayers = new Map();
    this.currentEnemyId = null;
    this.currentEnemyLastSeen = 0;
    this.nextShootAt = 0;
    this.enemyChaseRadiusPx = TILE_SIZE * 20;
    this.enemyHoldMs = 6000;
    this.lastEnemyPathAt = 0;

    this.player = {
      id: null,
      city: this.cityPreference ?? 0,
      isMayor: false,
      isFake: true,
      isFakeRecruit: true,
      health: MAX_HEALTH,
      direction: 16,
      isTurning: 0,
      isMoving: 0,
      sequence: 0,
      offset: { x: 0, y: 0 }
    };

    this.world = new WorldState({
      log: (...args) => this.log(...args),
      warn: (...args) => this.warn(...args)
    });

    this.navigation = new NavigationController({
      world: this.world,
      player: this.player,
      state: new NavigationState(),
      log: (...args) => this.log(...args),
      debug: this.debug,
      onPathUpdate: ({ path, target, trigger }) => {
        if (this.socket && this.player.id) {
          this.socket.emit("bot:debug", {
            id: this.player.id,
            path,
            target,
            trigger
          });
        }
      }
    });
  }

  log(...args) {
    console.log(`[${new Date().toISOString()}][${this.name}]`, ...args);
  }

  warn(...args) {
    console.warn(`[${new Date().toISOString()}][${this.name}]`, ...args);
  }

  connect() {
    this.socket = io(this.serverUrl, { transports: ["websocket"], reconnection: true });

    this.socket.on("connect", () => {
      this.log(`Connected as ${this.socket.id}`);
      this.player.id = this.socket.id;

      if (this.cityPreference !== null) {
        const spawn = this.world.resolveCitySpawn(this.cityPreference);
        if (spawn) {
          this.navigation.setSpawnPoint(spawn, { adoptAsHome: true });
          this.player.offset = { ...spawn };
        }
      }

      this.sendEnterGame();
      this._startLoop();
    });

    this.socket.on("disconnect", (reason) => {
      this.warn(`Disconnected: ${reason}`);
      this.ready = false;
      this._stopLoop();
    });

    this.socket.on("player", (p) => this.onPlayerPayload(p, { source: "player" }));
    this.socket.on("enter_game", (p) => this.onPlayerPayload(p, { source: "enter_game" }));
    this.socket.on("players:snapshot", (p) => this.onPlayersSnapshot(p));
    this.socket.on("lobby:assignment", (p) => this.onAssignment(p));
    this.socket.on("player:rejected", (p) => this.onRejected(p));
    this.socket.on("lobby:denied", (p) => this.onLobbyDenied(p));
    this.socket.on("new_building", (p) => this.onNewBuilding(p));
    this.socket.on("demolish_building", (p) => this.onDemolishBuilding(p));
    this.socket.on("connect_error", (err) => this.warn(`Connection error: ${err?.message || err}`));
    this.socket.on("player:removed", (p) => this.onPlayerRemoved(p));
  }

  _startLoop() {
    this._stopLoop();
    this.loopHandle = setInterval(() => this.tick(), TICK_INTERVAL_MS);
  }

  _stopLoop() {
    if (this.loopHandle) {
      clearInterval(this.loopHandle);
      this.loopHandle = null;
    }
  }

  sendEnterGame() {
    if (!this.socket || this.socket.disconnected) return;
    const payload = {
      id: this.player.id,
      city: this.cityPreference ?? this.player.city ?? 0,
      isMayor: false,
      isFake: true,
      isFakeRecruit: true,
      health: this.player.health,
      direction: wrapDirection(this.player.direction),
      isTurning: 0,
      isMoving: 0,
      sequence: 0,
      offset: {
        x: Math.round(this.player.offset.x),
        y: Math.round(this.player.offset.y)
      },
      requestedRole: this.rolePreference,
      role: this.rolePreference,
      ...(this.cityPreference !== null ? { requestedCity: this.cityPreference } : {})
    };
    this.log(`Requesting entry (city=${payload.requestedCity ?? "auto"}, role=${payload.requestedRole})`);
    this.socket.emit("enter_game", JSON.stringify(payload));
  }

  onPlayersSnapshot(payload) {
    const arr = safeParse(payload, (...args) => this.warn(...args));
    if (Array.isArray(arr)) arr.forEach(e => this.onPlayerPayload(e, { source: "snapshot" }));
  }

  onRejected(payload) {
    const d = safeParse(payload, (...args) => this.warn(...args));
    if (d) this.warn("Player update rejected:", d.reasons || d);
  }

  onLobbyDenied(payload) {
    const d = safeParse(payload, (...args) => this.warn(...args));
    if (d) this.warn("Lobby denied:", d.reason || d);
  }

  onAssignment(payload) {
    const d = safeParse(payload, (...args) => this.warn(...args));
    if (!d) return;
    if (Number.isFinite(d.city)) {
      this.player.city = Math.max(0, Math.floor(d.city));
      const spawn = this.world.resolveCitySpawn(this.player.city);
      if (spawn) {
        this.navigation.setSpawnPoint(spawn, { adoptAsHome: true });
        if (this.player.offset.x === 0 && this.player.offset.y === 0) {
          this.player.offset = { ...spawn };
        }
      }
      this.log(
        `Assigned to city ${this.player.city}` +
        (spawn ? ` (${spawn.x.toFixed(0)},${spawn.y.toFixed(0)})` : " (spawn unknown)")
      );
    }
  }

  onNewBuilding(payload) {
    const data = safeParse(payload, (...args) => this.warn(...args));
    if (!data) return;
    this.world.addBuilding(data);
    this.navigation.debouncedReplan("new_building");
  }

  onDemolishBuilding(payload) {
    const data = safeParse(payload, (...args) => this.warn(...args));
    if (!data || !data.id) return;
    this.world.removeBuilding(data.id);
    this.navigation.debouncedReplan("demolish_building");
  }

  onPlayerPayload(payload, ctx = {}) {
    const d = safeParse(payload, (...args) => this.warn(...args));
    if (!d || !d.id) return;
    if (!this.socket || !this.socket.id) return;

    if (d.id !== this.socket.id) {
      this.updateOtherPlayer(d);
      return;
    }

    if (Number.isFinite(d.city)) this.player.city = Math.max(0, Math.floor(d.city));
    if (typeof d.isMayor === "boolean") this.player.isMayor = d.isMayor;
    if (d.offset && Number.isFinite(d.offset.x) && Number.isFinite(d.offset.y)) {
      this.player.offset = { x: d.offset.x, y: d.offset.y };
    }
    if (Number.isFinite(d.direction)) this.player.direction = wrapDirection(d.direction);
    if (Number.isFinite(d.sequence)) this.player.sequence = d.sequence;
    if (Number.isFinite(d.health)) this.player.health = d.health;

    this.ready = true;

    if (!this.navigation.state.spawnPoint) {
      const spawn = this.world.resolveCitySpawn(this.player.city);
      if (spawn) this.navigation.setSpawnPoint(spawn, { adoptAsHome: true });
    }

    if (!this.navigation.state.patrolHome && this.navigation.state.spawnPoint) {
      this.navigation.setPatrolHome({ ...this.navigation.state.spawnPoint });
    }

    if (!this.navigation.target) {
      this.navigation.pickNewTarget("init");
    }

    if (ctx.source === "enter_game") this.log("Successfully entered game");
  }

  updateOtherPlayer(data) {
    const id = data?.id;
    if (!id) return;
    const prev = this.otherPlayers.get(id) || {};
    const now = Date.now();
    const offset = (data.offset && Number.isFinite(data.offset.x) && Number.isFinite(data.offset.y))
      ? { x: data.offset.x, y: data.offset.y }
      : prev.offset || null;
    if (!offset) return;

    this.otherPlayers.set(id, {
      id,
      city: Number.isFinite(data.city) ? Math.max(0, Math.floor(data.city)) : (prev.city ?? null),
      isFake: data.isFake ?? prev.isFake ?? false,
      isFakeRecruit: data.isFakeRecruit ?? prev.isFakeRecruit ?? false,
      isSystemControlled: data.isSystemControlled ?? prev.isSystemControlled ?? false,
      isSpectator: data.isSpectator ?? prev.isSpectator ?? false,
      isCloaked: data.isCloaked ?? prev.isCloaked ?? false,
      offset,
      lastUpdate: now
    });
  }

  onPlayerRemoved(payload) {
    const data = safeParse(payload, (...args) => this.warn(...args));
    if (!data) return;
    const id = typeof data === "string" ? data : data.id;
    if (!id) return;
    this.otherPlayers.delete(id);
    if (this.currentEnemyId === id) {
      this.releaseEnemy();
    }
  }

  pruneOtherPlayers(now) {
    const expiryMs = 10000;
    for (const [id, info] of this.otherPlayers.entries()) {
      if (!info || !info.lastUpdate || now - info.lastUpdate > expiryMs) {
        this.otherPlayers.delete(id);
        if (this.currentEnemyId === id) {
          this.releaseEnemy();
        }
      }
    }
  }

  selectEnemyTarget(now) {
    const selfOffset = this.player.offset || { x: 0, y: 0 };
    const selfCity = Number.isFinite(this.player.city) ? Math.max(0, Math.floor(this.player.city)) : null;
    const detectionSq = this.enemyChaseRadiusPx * this.enemyChaseRadiusPx;
    let best = null;
    let bestDist = detectionSq;

    if (this.currentEnemyId) {
      const existing = this.otherPlayers.get(this.currentEnemyId);
      if (existing && existing.isFake) {
        this.releaseEnemy();
      } else if (existing && now - existing.lastUpdate <= this.enemyHoldMs) {
        if (!Number.isFinite(existing.city) || existing.city !== selfCity) {
          const dist = distance2(
            selfOffset.x + TILE_SIZE / 2,
            selfOffset.y + TILE_SIZE / 2,
            existing.offset.x + TILE_SIZE / 2,
            existing.offset.y + TILE_SIZE / 2
          );
          if (dist <= detectionSq * 1.5) {
            best = existing;
            bestDist = dist;
          }
        }
      } else {
        this.releaseEnemy();
      }
    }

    for (const info of this.otherPlayers.values()) {
      if (!info || !info.offset) continue;
      if (info.isFake) continue;
      if (info.id === this.player.id) continue;
      if (info.isSpectator) continue;
      if (info.isCloaked) continue;
      if (Number.isFinite(info.city) && Number.isFinite(selfCity) && info.city === selfCity) continue;

      const dist = distance2(
        selfOffset.x + TILE_SIZE / 2,
        selfOffset.y + TILE_SIZE / 2,
        info.offset.x + TILE_SIZE / 2,
        info.offset.y + TILE_SIZE / 2
      );
      if (dist > detectionSq) continue;
      if (!best || dist < bestDist) {
        best = info;
        bestDist = dist;
      }
    }

    return best;
  }

  focusEnemy(enemy, now) {
    if (!enemy || !enemy.offset) return;
    this.currentEnemyId = enemy.id;
    this.currentEnemyLastSeen = now;
    const targetPos = { x: enemy.offset.x, y: enemy.offset.y };
    const currentTarget = this.navigation.target;
    const distToCurrent = currentTarget
      ? Math.hypot(currentTarget.x - targetPos.x, currentTarget.y - targetPos.y)
      : Infinity;
    const shouldReplan = !currentTarget || distToCurrent > TILE_SIZE * 0.75 || now - this.lastEnemyPathAt > 600;
    if (shouldReplan) {
      this.navigation.target = targetPos;
      this.navigation.recalcPath("enemy");
      this.lastEnemyPathAt = now;
    } else {
      this.navigation.target = targetPos;
    }
  }

  releaseEnemy() {
    this.currentEnemyId = null;
    this.currentEnemyLastSeen = 0;
    this.lastEnemyPathAt = 0;
    this.navigation.target = null;
  }

  tryShoot(enemy, now) {
    if (!enemy || !enemy.offset) return;
    if (now < this.nextShootAt) return;

    const selfCenterX = this.player.offset.x + TILE_SIZE / 2;
    const selfCenterY = this.player.offset.y + TILE_SIZE / 2;
    const enemyCenterX = enemy.offset.x + TILE_SIZE / 2;
    const enemyCenterY = enemy.offset.y + TILE_SIZE / 2;
    const dx = enemyCenterX - selfCenterX;
    const dy = enemyCenterY - selfCenterY;
    const distSq = dx * dx + dy * dy;
    const maxRangePx = TILE_SIZE * 22;
    if (distSq > maxRangePx * maxRangePx) return;

    const facing = vectorToDirection(dx, dy, this.player.direction);
    const faceDelta = directionDelta(this.player.direction, facing);
    if (faceDelta > 4) return;

    if (!this.world.lineOfSight(selfCenterX, selfCenterY, enemyCenterX, enemyCenterY)) return;

    this.fireLaser(facing);
    this.nextShootAt = now + 900;
  }

  fireLaser(direction) {
    const facing = wrapDirection(direction);
    this.player.direction = facing;
    const angleRadians = (facing / 32) * (Math.PI * 2);
    const xComp = Math.sin(angleRadians);
    const yComp = Math.cos(angleRadians) * -1;
    const originX = this.player.offset.x + TILE_SIZE / 2 + xComp * 30;
    const originY = this.player.offset.y + TILE_SIZE / 2 + yComp * 30;
    const packet = {
      shooter: this.player.id,
      x: originX,
      y: originY,
      type: 0,
      angle: -facing,
      team: this.player.city ?? null
    };
    if (this.socket && !this.socket.disconnected) {
      this.socket.emit("bullet_shot", JSON.stringify(packet));
    }
  }

  tick() {
    if (!this.socket || this.socket.disconnected || !this.ready) return;
    const now = Date.now();
    this.pruneOtherPlayers(now);
    const enemy = this.selectEnemyTarget(now);
    if (enemy) {
      this.focusEnemy(enemy, now);
    } else if (this.currentEnemyId && now - this.currentEnemyLastSeen > this.enemyHoldMs) {
      this.releaseEnemy();
    }
    this.navigation.tick(now);
    if (enemy) {
      this.tryShoot(enemy, now);
    }
    this._emitPlayerUpdate();
  }

  _emitPlayerUpdate() {
    if (!this.socket || this.socket.disconnected) return;
    this.player.sequence += 1;
    const p = this.player;
    const payload = {
      id: p.id,
      city: p.city,
      isMayor: p.isMayor,
      isFake: true,
      isFakeRecruit: true,
      health: p.health,
      direction: wrapDirection(p.direction),
      isTurning: 0,
      isMoving: p.isMoving,
      bombsArmed: false,
      isCloaked: false,
      cloakExpiresAt: 0,
      isFrozen: false,
      frozenUntil: 0,
      sequence: p.sequence,
      offset: {
        x: Math.round(p.offset.x),
        y: Math.round(p.offset.y)
      }
    };
    this.socket.emit("player", JSON.stringify(payload));
  }

  resolveCitySpawn(cityId) {
    return this.world.resolveCitySpawn(cityId);
  }
}

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

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  process.on("SIGUSR2", shutdown);
}

module.exports = { BotClient, NavigationController, NavigationState, WorldState };
