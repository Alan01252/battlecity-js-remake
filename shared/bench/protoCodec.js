'use strict';

const WIRE_VARINT = 0;
const WIRE_64BIT = 1;
const WIRE_LENGTH_DELIMITED = 2;

class Writer {
    constructor(initialSize = 256) {
        this.buffer = Buffer.allocUnsafe(initialSize);
        this.offset = 0;
    }

    ensure(size) {
        if (this.offset + size <= this.buffer.length) {
            return;
        }
        const nextSize = Math.max(this.buffer.length * 2, this.offset + size);
        const next = Buffer.allocUnsafe(nextSize);
        this.buffer.copy(next, 0, 0, this.offset);
        this.buffer = next;
    }

    writeVarint(value) {
        let v = value >>> 0;
        while (v > 0x7f) {
            this.ensure(1);
            this.buffer[this.offset++] = (v & 0x7f) | 0x80;
            v >>>= 7;
        }
        this.ensure(1);
        this.buffer[this.offset++] = v;
    }

    writeTag(fieldNumber, wireType) {
        this.writeVarint((fieldNumber << 3) | wireType);
    }

    writeBool(fieldNumber, value) {
        if (value === undefined || value === null) {
            return;
        }
        this.writeTag(fieldNumber, WIRE_VARINT);
        this.writeVarint(value ? 1 : 0);
    }

    writeUint32(fieldNumber, value) {
        if (value === undefined || value === null) {
            return;
        }
        this.writeTag(fieldNumber, WIRE_VARINT);
        this.writeVarint(value >>> 0);
    }

    writeDouble(fieldNumber, value) {
        if (value === undefined || value === null) {
            return;
        }
        this.writeTag(fieldNumber, WIRE_64BIT);
        this.ensure(8);
        this.buffer.writeDoubleLE(Number(value), this.offset);
        this.offset += 8;
    }

    writeString(fieldNumber, value) {
        if (value === undefined || value === null) {
            return;
        }
        const strBuf = Buffer.from(String(value));
        this.writeTag(fieldNumber, WIRE_LENGTH_DELIMITED);
        this.writeVarint(strBuf.length);
        this.ensure(strBuf.length);
        strBuf.copy(this.buffer, this.offset, 0, strBuf.length);
        this.offset += strBuf.length;
    }

    writeMessage(fieldNumber, callback) {
        if (typeof callback !== 'function') {
            return;
        }
        const nested = new Writer();
        callback(nested);
        const nestedBuffer = nested.finish();
        this.writeTag(fieldNumber, WIRE_LENGTH_DELIMITED);
        this.writeVarint(nestedBuffer.length);
        this.ensure(nestedBuffer.length);
        nestedBuffer.copy(this.buffer, this.offset, 0, nestedBuffer.length);
        this.offset += nestedBuffer.length;
    }

    finish() {
        return this.buffer.subarray(0, this.offset);
    }
}

class Reader {
    constructor(buffer) {
        this.buffer = buffer;
        this.offset = 0;
        this.length = buffer.length;
    }

    eof() {
        return this.offset >= this.length;
    }

    readVarint() {
        let shift = 0;
        let result = 0;
        while (true) {
            if (this.offset >= this.length) {
                throw new Error('Truncated varint');
            }
            const byte = this.buffer[this.offset++];
            result |= (byte & 0x7f) << shift;
            if ((byte & 0x80) === 0) {
                return result >>> 0;
            }
            shift += 7;
        }
    }

    readTag() {
        if (this.eof()) {
            return null;
        }
        const tag = this.readVarint();
        return {
            fieldNumber: tag >>> 3,
            wireType: tag & 0x7
        };
    }

    readBool() {
        return this.readVarint() !== 0;
    }

    readUint32() {
        return this.readVarint() >>> 0;
    }

    readDouble() {
        if (this.offset + 8 > this.length) {
            throw new Error('Truncated double');
        }
        const value = this.buffer.readDoubleLE(this.offset);
        this.offset += 8;
        return value;
    }

    readString() {
        const byteLength = this.readVarint();
        if (this.offset + byteLength > this.length) {
            throw new Error('Truncated string');
        }
        const start = this.offset;
        const end = start + byteLength;
        const value = this.buffer.toString('utf8', start, end);
        this.offset = end;
        return value;
    }

    readBytes() {
        const byteLength = this.readVarint();
        if (this.offset + byteLength > this.length) {
            throw new Error('Truncated bytes');
        }
        const start = this.offset;
        const end = start + byteLength;
        this.offset = end;
        return this.buffer.subarray(start, end);
    }

    skip(wireType) {
        switch (wireType) {
            case WIRE_VARINT:
                this.readVarint();
                break;
            case WIRE_64BIT:
                if (this.offset + 8 > this.length) {
                    throw new Error('Truncated skip (64-bit)');
                }
                this.offset += 8;
                break;
            case WIRE_LENGTH_DELIMITED: {
                const len = this.readVarint();
                if (this.offset + len > this.length) {
                    throw new Error('Truncated skip (length-delimited)');
                }
                this.offset += len;
                break;
            }
            default:
                throw new Error(`Unsupported wire type ${wireType}`);
        }
    }
}

function writeOffset(writer, offset) {
    const x = offset?.x ?? 0;
    const y = offset?.y ?? 0;
    writer.writeDouble(1, x);
    writer.writeDouble(2, y);
}

function writePlayer(writer, player) {
    writer.writeString(1, player.id);
    writer.writeUint32(2, player.city ?? 0);
    writer.writeBool(3, !!player.isMayor);
    writer.writeUint32(4, player.health ?? 0);
    writer.writeUint32(5, player.direction ?? 0);
    writer.writeUint32(6, player.isTurning ?? 0);
    writer.writeUint32(7, player.isMoving ?? 0);
    writer.writeBool(8, !!player.isCloaked);
    writer.writeDouble(9, player.cloakExpiresAt ?? 0);
    writer.writeBool(10, !!player.isFrozen);
    writer.writeDouble(11, player.frozenUntil ?? 0);
    writer.writeUint32(12, player.sequence ?? 0);
    writer.writeMessage(13, (nested) => writeOffset(nested, player.offset));
    writer.writeString(14, player.callsign);
    writer.writeString(15, player.userId);
}

function decodeOffset(reader) {
    const offset = { x: 0, y: 0 };
    while (!reader.eof()) {
        const tag = reader.readTag();
        if (!tag) {
            break;
        }
        switch (tag.fieldNumber) {
            case 1:
                offset.x = reader.readDouble();
                break;
            case 2:
                offset.y = reader.readDouble();
                break;
            default:
                reader.skip(tag.wireType);
                break;
        }
    }
    return offset;
}

function decodePlayer(reader) {
    const player = {
        id: '',
        city: 0,
        isMayor: false,
        health: 0,
        direction: 0,
        isTurning: 0,
        isMoving: 0,
        isCloaked: false,
        cloakExpiresAt: 0,
        isFrozen: false,
        frozenUntil: 0,
        sequence: 0,
        offset: { x: 0, y: 0 },
        callsign: '',
        userId: ''
    };

    while (!reader.eof()) {
        const tag = reader.readTag();
        if (!tag) {
            break;
        }
        switch (tag.fieldNumber) {
            case 1:
                player.id = reader.readString();
                break;
            case 2:
                player.city = reader.readUint32();
                break;
            case 3:
                player.isMayor = reader.readBool();
                break;
            case 4:
                player.health = reader.readUint32();
                break;
            case 5:
                player.direction = reader.readUint32();
                break;
            case 6:
                player.isTurning = reader.readUint32();
                break;
            case 7:
                player.isMoving = reader.readUint32();
                break;
            case 8:
                player.isCloaked = reader.readBool();
                break;
            case 9:
                player.cloakExpiresAt = reader.readDouble();
                break;
            case 10:
                player.isFrozen = reader.readBool();
                break;
            case 11:
                player.frozenUntil = reader.readDouble();
                break;
            case 12:
                player.sequence = reader.readUint32();
                break;
            case 13: {
                const bytes = reader.readBytes();
                const nested = new Reader(bytes);
                player.offset = decodeOffset(nested);
                break;
            }
            case 14:
                player.callsign = reader.readString();
                break;
            case 15:
                player.userId = reader.readString();
                break;
            default:
                reader.skip(tag.wireType);
                break;
        }
    }

    return player;
}

function encodePlayerSnapshot(players) {
    const writer = new Writer(Math.max(256, players.length * 64));
    for (let i = 0; i < players.length; i += 1) {
        const player = players[i];
        writer.writeMessage(1, (nested) => writePlayer(nested, player));
    }
    return writer.finish();
}

function decodePlayerSnapshot(buffer) {
    const reader = new Reader(buffer);
    const players = [];
    while (!reader.eof()) {
        const tag = reader.readTag();
        if (!tag) {
            break;
        }
        if (tag.fieldNumber === 1 && tag.wireType === WIRE_LENGTH_DELIMITED) {
            const bytes = reader.readBytes();
            const nested = new Reader(bytes);
            players.push(decodePlayer(nested));
        } else {
            reader.skip(tag.wireType);
        }
    }
    return players;
}

function encodePlayerMessage(player) {
    const writer = new Writer();
    writePlayer(writer, player);
    return writer.finish();
}

function decodePlayerMessage(buffer) {
    return decodePlayer(new Reader(buffer));
}

function encodeBullet(bullet) {
    const writer = new Writer();
    writer.writeString(1, bullet.shooter);
    writer.writeDouble(2, bullet.x ?? 0);
    writer.writeDouble(3, bullet.y ?? 0);
    writer.writeDouble(4, bullet.angle ?? 0);
    writer.writeUint32(5, bullet.type ?? 0);
    writer.writeUint32(6, bullet.team ?? 0);
    writer.writeString(7, bullet.sourceId);
    writer.writeString(8, bullet.sourceType);
    return writer.finish();
}

function decodeBullet(buffer) {
    const reader = new Reader(buffer);
    const bullet = {
        shooter: '',
        x: 0,
        y: 0,
        angle: 0,
        type: 0,
        team: 0,
        sourceId: '',
        sourceType: ''
    };

    while (!reader.eof()) {
        const tag = reader.readTag();
        if (!tag) {
            break;
        }
        switch (tag.fieldNumber) {
            case 1:
                bullet.shooter = reader.readString();
                break;
            case 2:
                bullet.x = reader.readDouble();
                break;
            case 3:
                bullet.y = reader.readDouble();
                break;
            case 4:
                bullet.angle = reader.readDouble();
                break;
            case 5:
                bullet.type = reader.readUint32();
                break;
            case 6:
                bullet.team = reader.readUint32();
                break;
            case 7:
                bullet.sourceId = reader.readString();
                break;
            case 8:
                bullet.sourceType = reader.readString();
                break;
            default:
                reader.skip(tag.wireType);
                break;
        }
    }

    return bullet;
}

module.exports = {
    encodePlayerSnapshot,
    decodePlayerSnapshot,
    encodePlayerMessage,
    decodePlayerMessage,
    encodeBullet,
    decodeBullet,
    Writer,
    Reader
};
