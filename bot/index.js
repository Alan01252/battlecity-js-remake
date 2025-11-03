#!/usr/bin/env node
"use strict";

const { io } = require("socket.io-client");

const {
  DEFAULT_SERVER_URL,
  MAX_HEALTH,
  TICK_INTERVAL_MS
} = require("./config");
const { wrapDirection, safeParse } = require("./helpers");
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

    this.player = {
      id: null,
      city: this.cityPreference ?? 0,
      isMayor: false,
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
    if (!this.socket || !this.socket.id || d.id !== this.socket.id) return;

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

  tick() {
    if (!this.socket || this.socket.disconnected || !this.ready) return;
    this.navigation.tick(Date.now());
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
