"use strict";

const assert = require("node:assert");
const { test } = require("node:test");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ScoreService = require("../src/users/ScoreService");

const createUserStore = (identities = {}) => ({
    get(id) {
        const key = String(id);
        const identity = identities[key];
        if (!identity) {
            return null;
        }
        return Object.assign({ id: key }, identity);
    }
});

const createScoreHarness = (identities = {}, options = {}) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "score-service-test-"));
    const dbPath = path.join(directory, "scores.db");
    const userStore = createUserStore(identities);
    const service = new ScoreService(Object.assign({ userStore, dbPath }, options));
    const cleanup = () => {
        fs.rmSync(directory, { recursive: true, force: true });
    };
    return { service, cleanup, directory, dbPath, userStore };
};

test("recordOrbVictory awards points, orb, and assists", (t) => {
    const { service, cleanup } = createScoreHarness({
        pilotA: { provider: "google", name: "Pilot Alpha" },
        pilotB: { provider: "google", name: "Pilot Bravo" }
    });
    t.after(() => cleanup());

    const result = service.recordOrbVictory({
        participantUserIds: ["pilotA", "pilotB"],
        orbHolderUserId: "pilotA",
        points: 30
    });

    assert.strictEqual(result.changed, true);

    const profileA = service.getProfile("pilotA");
    const profileB = service.getProfile("pilotB");

    assert.ok(profileA, "orb holder profile should exist");
    assert.ok(profileB, "teammate profile should exist");

    assert.strictEqual(profileA.points, 30);
    assert.strictEqual(profileA.orbs, 1);
    assert.strictEqual(profileA.assists, 0);

    assert.strictEqual(profileB.points, 30);
    assert.strictEqual(profileB.orbs, 0);
    assert.strictEqual(profileB.assists, 1);
});

test("non Google identities do not create score entries", (t) => {
    const { service, cleanup } = createScoreHarness({
        guest: { provider: "local", name: "Guest" }
    });
    t.after(() => cleanup());

    const result = service.recordOrbVictory({
        participantUserIds: ["guest"],
        orbHolderUserId: "guest",
        points: 50
    });

    assert.strictEqual(result.changed, false);
    assert.strictEqual(result.promotions.length, 0);
    assert.strictEqual(service.getProfile("guest"), null);
});

test("death penalties reward opposing city when victim has 100+ points", (t) => {
    const { service, cleanup } = createScoreHarness({
        hero: { provider: "google", name: "Hero" },
        rival: { provider: "google", name: "Rival" },
        ally: { provider: "google", name: "Ally" }
    });
    t.after(() => cleanup());

    service.recordOrbVictory({
        participantUserIds: ["hero"],
        orbHolderUserId: "hero",
        points: 120
    });

    const deathResult = service.recordDeath({
        victimUserId: "hero",
        killerUserIds: ["rival", "ally"],
        killerUserId: "rival"
    });

    assert.strictEqual(deathResult.changed, true);

    const heroProfile = service.getProfile("hero");
    const rivalProfile = service.getProfile("rival");
    const allyProfile = service.getProfile("ally");

    assert.ok(heroProfile && rivalProfile && allyProfile, "all profiles should exist after scoring");

    assert.strictEqual(heroProfile.points, 118, "victim loses two points");
    assert.strictEqual(heroProfile.deaths, 1);

    assert.strictEqual(rivalProfile.points, 2, "killer city member gains two points");
    assert.strictEqual(rivalProfile.kills, 1, "direct killer records a kill");

    assert.strictEqual(allyProfile.points, 2, "other city members gain assists");
    assert.strictEqual(allyProfile.kills, 0);
});
