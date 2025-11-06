"use strict";

const assert = require("node:assert");
const { test } = require("node:test");
const fs = require("fs");
const os = require("os");
const path = require("path");

const UserStore = require("../src/users/UserStore");

const createStoreHarness = () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "user-store-test-"));
    const dbPath = path.join(directory, "users.db");
    const store = new UserStore({ dbPath });
    const cleanup = () => {
        fs.rmSync(directory, { recursive: true, force: true });
    };
    return { store, cleanup, dbPath };
};

test("registerWithProvider persists Google users", (t) => {
    const { store, cleanup, dbPath } = createStoreHarness();
    t.after(cleanup);

    const profile = store.registerWithProvider({
        provider: "google",
        providerId: "sub-12345",
        name: "Test Pilot",
        email: "pilot@example.com"
    });

    assert.ok(profile, "profile should be created");
    assert.strictEqual(profile.provider, "google");
    assert.strictEqual(profile.providerId, "sub-12345");
    assert.strictEqual(profile.name, "Test Pilot");
    assert.strictEqual(profile.email, "pilot@example.com");

    const freshStore = new UserStore({ dbPath });
    const fetched = freshStore.findByProvider("google", "sub-12345");

    assert.ok(fetched, "fetched profile should exist");
    assert.strictEqual(fetched.id, profile.id);
    assert.strictEqual(fetched.name, "Test Pilot");
    assert.strictEqual(fetched.email, "pilot@example.com");
});

test("registerWithProvider updates name and email when details change", (t) => {
    const { store, cleanup } = createStoreHarness();
    t.after(cleanup);

    const original = store.registerWithProvider({
        provider: "google",
        providerId: "change-me",
        name: "Original Name",
        email: "original@example.com"
    });

    assert.ok(original);

    const updated = store.registerWithProvider({
        provider: "google",
        providerId: "change-me",
        name: "Updated Name",
        email: "updated@example.com"
    });

    assert.ok(updated);
    assert.strictEqual(updated.id, original.id);
    assert.strictEqual(updated.name, "Updated Name");
    assert.strictEqual(updated.email, "updated@example.com");
    assert.ok(updated.updatedAt >= original.updatedAt);
});

test("local registrations persist and can be updated", (t) => {
    const { store, cleanup, dbPath } = createStoreHarness();
    t.after(cleanup);

    const user = store.register("Guest Player");
    assert.ok(user);
    assert.strictEqual(user.provider, "local");

    const renamed = store.update(user.id, "Renamed Pilot");
    assert.ok(renamed);
    assert.strictEqual(renamed.name, "Renamed Pilot");

    const freshStore = new UserStore({ dbPath });
    const fetched = freshStore.get(user.id);

    assert.ok(fetched);
    assert.strictEqual(fetched.name, "Renamed Pilot");
    assert.strictEqual(fetched.provider, "local");
});
