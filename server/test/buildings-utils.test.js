"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { TILE_SIZE } = require("../src/gameplay/constants");
const { isHospital } = require("../src/constants");
const {
    parseNumericType,
    isHospitalBuilding,
    getHospitalDriveableRect,
} = require("../src/utils/buildings");

test("parseNumericType handles numbers and numeric strings", () => {
    assert.equal(parseNumericType(123), 123);
    assert.equal(parseNumericType("456"), 456);
    assert.equal(parseNumericType("789.5"), 789.5);
});

test("parseNumericType returns NaN for invalid inputs", () => {
    assert.ok(Number.isNaN(parseNumericType("abc")));
    assert.ok(Number.isNaN(parseNumericType({})));
    assert.ok(Number.isNaN(parseNumericType(null)));
    assert.ok(Number.isNaN(parseNumericType(undefined)));
});

test("isHospitalBuilding recognises hospital family codes", () => {
    assert.equal(isHospitalBuilding(200), true, "direct hospital code");
    assert.equal(isHospitalBuilding("200"), true, "string hospital code");
    assert.equal(isHospitalBuilding({ type: 210 }), true, "family range hospital");
    assert.equal(isHospitalBuilding({ type: "210" }), true, "string family hospital");
});

test("isHospitalBuilding rejects non hospital types", () => {
    assert.equal(isHospitalBuilding(0), false, "command center");
    assert.equal(isHospitalBuilding(100), false, "factory");
    assert.equal(isHospitalBuilding({ type: "abc" }), false, "non numeric");
});

test("getHospitalDriveableRect returns null when no building provided", () => {
    assert.equal(getHospitalDriveableRect(null), null);
    assert.equal(getHospitalDriveableRect(undefined), null);
});

test("getHospitalDriveableRect returns expected geometry", () => {
    const building = { x: 12, y: 7 };
    const rect = getHospitalDriveableRect(building);
    assert.deepEqual(rect, {
        x: 12 * TILE_SIZE,
        y: (7 * TILE_SIZE) + (TILE_SIZE * 2),
        w: TILE_SIZE * 3,
        h: TILE_SIZE,
    });
});

test("hospital helper stays aligned with server hospital detection", () => {
    // sanity-checking that helpers don't drift from core detection logic
    for (let type = 180; type <= 420; type += 5) {
        const expected = isHospital(type);
        const actual = isHospitalBuilding({ type });
        assert.equal(actual, expected, `type ${type} mismatch`);
    }
});
