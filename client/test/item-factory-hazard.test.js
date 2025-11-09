import test from 'node:test';
import assert from 'node:assert/strict';

import { applyHazardMetadata } from '../src/factories/hazardMetadata.js';

const mockToFiniteNumber = (value, fallback) => {
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

test('applyHazardMetadata assigns owner and team details from hazard payload', () => {
    const item = {
        city: null,
        teamId: null,
        ownerId: null,
        owner: null
    };

    applyHazardMetadata(item, {
        ownerId: 'enemy_socket',
        teamId: '3'
    }, mockToFiniteNumber);

    assert.equal(item.ownerId, 'enemy_socket');
    assert.equal(item.owner, 'enemy_socket');
    assert.equal(item.teamId, 3);
    assert.equal(item.city, 3);
});

test('applyHazardMetadata clears metadata when hazard payload sets nulls', () => {
    const item = {
        city: 5,
        teamId: 5,
        ownerId: 'ally_socket',
        owner: 'ally_socket'
    };

    applyHazardMetadata(item, {
        ownerId: null,
        teamId: null
    }, mockToFiniteNumber);

    assert.equal(item.ownerId, null);
    assert.equal(item.owner, null);
    assert.equal(item.teamId, null);
    assert.equal(item.city, null);
});
