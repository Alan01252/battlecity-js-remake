/*jslint node: true */
"use strict";

var express = require('express');
var http = require('http');
var https = require('https');
var app = express();
var server = http.createServer(app);
var { Server } = require('socket.io');
var citySpawns = require('../shared/citySpawns.json');
var UserStore = require('./src/users/UserStore');
var io = new Server(server, {
    cors: {
        origin: "http://localhost:8020",
        methods: ["GET", "POST"]
    }
});

app.use(express.json());
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', 'http://localhost:8020');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS');
    if (req.method === 'OPTIONS') {
        res.sendStatus(204);
        return;
    }
    next();
});

var PlayerFactory = require('./src/PlayerFactory');
var BulletFactory = require('./src/BulletFactory');
var BuildingFactory = require('./src/BuildingFactory');
var HazardManager = require('./src/hazards/HazardManager');
var OrbManager = require('./src/orb/OrbManager');
var FakeCityManager = require('./src/FakeCityManager');
var DefenseManager = require('./src/DefenseManager');
var { loadMapData } = require('./src/utils/mapLoader');
var ChatManager = require('./src/chat/ChatManager');

app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
});

var PORT = process.env.PORT || 8021;
server.listen(PORT, () => {
    console.log(`BattleCity server listening on port ${PORT}`);
});

var game = {
    tick: 0,

    players: {},
    cities: [],
    map: []
};

try {
    var mapData = loadMapData();
    if (mapData && Array.isArray(mapData.map)) {
        game.map = mapData.map;
        console.log(`[map] Loaded map.dat (${game.map.length} columns / ${Array.isArray(game.map[0]) ? game.map[0].length : 0} rows)`);
    } else {
        console.warn('[map] Map data missing or invalid, collision checks may fail');
    }
} catch (error) {
    console.warn('[map] Unable to load map data:', error.message);
}


const userStore = new UserStore();

const parseClientIds = (value) => {
    if (!value || typeof value !== 'string') {
        return [];
    }
    return value
        .split(/[;,]/)
        .map((part) => part.trim())
        .filter((part) => part.length > 0);
};

const GOOGLE_AUDIENCES = parseClientIds(process.env.GOOGLE_CLIENT_IDS || process.env.GOOGLE_CLIENT_ID || '');
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/tokeninfo';
const GOOGLE_TOKEN_TIMEOUT_MS = 5000;

const fetchJson = (url, { timeout = GOOGLE_TOKEN_TIMEOUT_MS } = {}) => new Promise((resolve, reject) => {
    try {
        const request = https.get(url, (response) => {
            const status = response.statusCode || 0;
            let body = '';
            response.setEncoding('utf8');
            response.on('data', (chunk) => {
                body += chunk;
            });
            response.on('end', () => {
                if (status < 200 || status >= 300) {
                    const error = new Error(`Request failed with status ${status}`);
                    error.status = status;
                    return reject(error);
                }
                try {
                    const parsed = JSON.parse(body);
                    resolve(parsed);
                } catch (parseError) {
                    reject(parseError);
                }
            });
        });
        request.on('error', reject);
        request.setTimeout(timeout, () => {
            request.destroy(new Error('Request timed out'));
        });
    } catch (error) {
        reject(error);
    }
});

const verifyGoogleToken = async (credential) => {
    if (!credential || typeof credential !== 'string') {
        const error = new Error('Missing credential');
        error.code = 'MISSING_CREDENTIAL';
        throw error;
    }
    const url = `${GOOGLE_TOKEN_ENDPOINT}?id_token=${encodeURIComponent(credential)}`;
    const payload = await fetchJson(url);
    if (!payload || typeof payload !== 'object' || typeof payload.sub !== 'string') {
        const error = new Error('Invalid token response');
        error.code = 'INVALID_RESPONSE';
        throw error;
    }
    if (Array.isArray(GOOGLE_AUDIENCES) && GOOGLE_AUDIENCES.length > 0) {
        const audience = payload.aud || payload.azp || '';
        if (!audience || !GOOGLE_AUDIENCES.includes(String(audience))) {
            const error = new Error('Token audience mismatch');
            error.code = 'AUDIENCE_MISMATCH';
            throw error;
        }
    }
    return payload;
};

const playerFactory = new PlayerFactory(game, { userStore });
playerFactory.listen(io);
const bulletFactory = new BulletFactory(game, playerFactory);
bulletFactory.listen(io);
const buildingFactory = new BuildingFactory(game);
buildingFactory.listen(io);
game.buildingFactory = buildingFactory;
const hazardManager = new HazardManager(game, playerFactory);
hazardManager.setIo(io);
const defenseManager = new DefenseManager({ game, playerFactory });
defenseManager.setIo(io);
buildingFactory.setManagers({ hazardManager, defenseManager, playerFactory });
const orbManager = new OrbManager({
    game,
    cityManager: buildingFactory.cityManager,
    playerFactory,
    buildingFactory,
    hazardManager,
    defenseManager,
});
orbManager.setIo(io);
const fakeCityManager = new FakeCityManager({
    game,
    buildingFactory,
    playerFactory,
    hazardManager,
    defenseManager,
    bulletFactory,
});
fakeCityManager.setIo(io);

const chatManager = new ChatManager({
    game,
    playerFactory,
});
chatManager.listen(io);
playerFactory.setChatManager(chatManager);

app.post('/api/users/register', (req, res) => {
    const name = typeof req.body?.name === 'string' ? req.body.name : '';
    const user = userStore.register(name);
    if (!user) {
        res.status(400).json({ error: 'invalid_name' });
        return;
    }
    res.status(201).json(user);
});

app.post('/api/auth/google', async (req, res) => {
    const credential = typeof req.body?.credential === 'string' ? req.body.credential.trim() : '';
    if (!credential) {
        res.status(400).json({ error: 'missing_credential' });
        return;
    }
    try {
        const payload = await verifyGoogleToken(credential);
        const profile = userStore.registerWithProvider({
            provider: 'google',
            providerId: payload.sub,
            name: payload.name || payload.given_name || payload.family_name || null,
            email: payload.email,
            given_name: payload.given_name,
            family_name: payload.family_name
        });
        if (!profile) {
            res.status(400).json({ error: 'registration_failed' });
            return;
        }
        res.json(profile);
    } catch (error) {
        if (error && error.message) {
            console.warn('[auth] Google verification failed:', error.message);
        }
        if (error.code === 'AUDIENCE_MISMATCH') {
            res.status(403).json({ error: 'audience_mismatch' });
            return;
        }
        if (error.status && error.status >= 500) {
            res.status(503).json({ error: 'upstream_unavailable' });
            return;
        }
        res.status(401).json({ error: 'invalid_credential' });
    }
});

app.get('/api/identity/config', (_req, res) => {
    const clientIds = Array.isArray(GOOGLE_AUDIENCES) ? GOOGLE_AUDIENCES.filter((value) => value && value.length) : [];
    res.json({
        google: {
            enabled: clientIds.length > 0,
            clientIds,
            clientId: clientIds.length > 0 ? clientIds[0] : null,
        },
    });
});

app.put('/api/users/:id', (req, res) => {
    const id = typeof req.params?.id === 'string' ? req.params.id.trim() : '';
    if (!id) {
        res.status(400).json({ error: 'invalid_id' });
        return;
    }
    const name = typeof req.body?.name === 'string' ? req.body.name : '';
    const sanitized = userStore.sanitize(name);
    if (!sanitized) {
        res.status(400).json({ error: 'invalid_name' });
        return;
    }
    const existing = userStore.get(id);
    if (!existing) {
        res.status(404).json({ error: 'not_found' });
        return;
    }
    const updated = userStore.update(id, sanitized);
    res.json(updated);
});

app.get('/api/users/:id', (req, res) => {
    const id = typeof req.params?.id === 'string' ? req.params.id.trim() : '';
    if (!id) {
        res.status(400).json({ error: 'invalid_id' });
        return;
    }
    const user = userStore.get(id);
    if (!user) {
        res.status(404).json({ error: 'not_found' });
        return;
    }
    res.json(user);
});

const shutdown = () => {
    const botProcesses = fakeCityManager.getBotProcesses();
    for (const processes of botProcesses.values()) {
        if (!processes) {
            continue;
        }
        const children = processes instanceof Set
            ? Array.from(processes)
            : (Array.isArray(processes) ? processes : [processes]);
        for (const child of children) {
            try {
                if (child && !child.killed) {
                    child.kill();
                }
            } catch (error) {
                console.error(`[bot] error killing bot during shutdown: ${error.message}`);
            }
        }
    }
    process.exit(0);
};

process.on('SIGUSR2', shutdown); // nodemon restart
process.on('SIGINT', shutdown); // Ctrl+C
process.on('SIGTERM', shutdown); // kill

const toFiniteNumber = (value, fallback = 0) => {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === 'string') {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }
    return fallback;
};

const normaliseCityId = (cityId) => {
    const numeric = toFiniteNumber(cityId, null);
    if (numeric === null) {
        return null;
    }
    return Math.max(0, Math.floor(numeric));
};

const getCityDisplayName = (cityId) => {
    const id = normaliseCityId(cityId);
    if (id === null) {
        return 'City';
    }
    const key = String(id);
    const entry = citySpawns && citySpawns[key];
    if (entry && entry.name) {
        return entry.name;
    }
    return `City ${id + 1}`;
};

const shortenId = (value) => {
    if (!value || typeof value !== 'string') {
        return null;
    }
    if (value.length <= 8) {
        return value;
    }
    return `${value.slice(0, 4)}...${value.slice(-2)}`;
};

const parseCityInspectPayload = (payload) => {
    if (payload === null || payload === undefined) {
        return null;
    }
    if (typeof payload === 'number') {
        return normaliseCityId(payload);
    }
    if (typeof payload === 'string') {
        try {
            const parsed = JSON.parse(payload);
            return parseCityInspectPayload(parsed);
        } catch (error) {
            return normaliseCityId(payload);
        }
    }
    if (typeof payload === 'object') {
        if (payload.city !== undefined) {
            return normaliseCityId(payload.city);
        }
        if (payload.cityId !== undefined) {
            return normaliseCityId(payload.cityId);
        }
        if (payload.id !== undefined) {
            return normaliseCityId(payload.id);
        }
    }
    return null;
};

const collectCityInfo = (cityId) => {
    const id = normaliseCityId(cityId) ?? 0;
    const roster = playerFactory.ensureCityRoster
        ? playerFactory.ensureCityRoster(id)
        : null;

    const players = Object.values(game.players)
        .filter((player) => normaliseCityId(player && player.city) === id);

    const mayorId = roster && roster.mayor
        ? roster.mayor
        : (players.find((player) => player && player.isMayor)?.id || null);

    const mayorLabel = mayorId ? shortenId(mayorId) : null;

    let buildingCount = 0;
    if (buildingFactory && buildingFactory.buildings) {
        for (const building of buildingFactory.buildings.values()) {
            if (normaliseCityId(building && building.cityId) === id) {
                buildingCount += 1;
            }
        }
    }

    const cityManager = buildingFactory && buildingFactory.cityManager
        ? buildingFactory.cityManager
        : null;
    const cityState = cityManager
        ? cityManager.getCity(id)
        : (game.cities && game.cities[id]) || null;
    const cityName = (cityState && (cityState.nameOverride || cityState.name))
        ? (cityState.nameOverride || cityState.name)
        : getCityDisplayName(id);

    const orbPoints = cityState && cityManager
        ? cityManager.getOrbValue(cityState)
        : 0;
    const cityOrbs = cityState ? Number(cityState.orbs) || 0 : 0;
    const cityScore = cityState ? Number(cityState.score) || 0 : 0;
    const isOrbable = cityManager ? cityManager.isOrbable(id) : false;

    const startedAt = cityState && cityState.startedAt
        ? cityState.startedAt
        : (cityState && cityState.updatedAt) || null;
    const uptimeInMinutes = startedAt
        ? Math.max(0, Math.floor((Date.now() - startedAt) / 60000))
        : 0;

    return {
        cityId: id,
        cityName,
        mayorId: mayorId || null,
        mayorLabel: mayorLabel,
        playerCount: players.length,
        buildingCount,
        isOrbable,
        orbs: cityOrbs,
        orbPoints,
        score: cityScore,
        uptimeInMinutes,
    };
};

io.on('connection', (socket) => {
    socket.on('hazard:spawn', (payload) => {
        hazardManager.spawnHazard(socket, payload);
    });
    socket.on('hazard:arm', (payload) => {
        hazardManager.handleArm(socket, hazardManager.parsePayload(payload));
    });
    socket.on('hazard:remove', (payload) => {
        hazardManager.handleRemove(socket, hazardManager.parsePayload(payload));
    });
    socket.on('city:inspect', (payload) => {
        const cityId = parseCityInspectPayload(payload);
        if (cityId === null || cityId === undefined) {
            return;
        }
        const info = collectCityInfo(cityId);
        if (info) {
            socket.emit('city:info', info);
        }
    });
    socket.on('orb:drop', (payload) => {
        orbManager.handleDrop(socket, payload);
    });
    socket.on('defense:spawn', (payload) => {
        defenseManager.handleSpawn(socket, payload);
    });
    socket.on('defense:remove', (payload) => {
        defenseManager.handleRemove(socket, payload);
    });
    socket.on('disconnect', () => {
        hazardManager.onDisconnect(socket.id);
    });
    socket.on('bot:debug', (data) => {
        socket.broadcast.emit('bot:debug', data);
    });
    hazardManager.sendSnapshot(socket);
    fakeCityManager.sendSnapshot(socket);
});

const BUILDING_UPDATE_INTERVAL = 100;
let buildingAccumulator = 0;

var loop = () => {

    var now = Date.now();
    if (!game.tick) {
        game.tick = now;
        game.lastTick = now;
    }
    var delta = now - (game.tick || now);
    if (delta < 0 || delta > 1000) {
        delta = 16;
    }
    game.lastTick = game.tick;
    game.tick = now;
    game.timePassed = delta;

    bulletFactory.cycle(delta);
    hazardManager.update(delta);
    playerFactory.cycle(now);
    fakeCityManager.update(now);

    buildingAccumulator += delta;
    if (buildingAccumulator >= BUILDING_UPDATE_INTERVAL) {
        buildingFactory.cycle();
        buildingAccumulator = buildingAccumulator % BUILDING_UPDATE_INTERVAL;
    }

    setTimeout(function () {
        loop();
    }, 16);
};
loop();
