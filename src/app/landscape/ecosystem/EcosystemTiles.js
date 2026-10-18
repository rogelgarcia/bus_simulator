// Defines the ecosystem-instance-v1 record layout, the tile payload codec and the stable instance identifiers shared by the bake, the worker and the renderer.
// @ts-check
// Design: a tile is one layer's features inside one world-anchored cell. Its payload is GPU-friendly: twelve little-endian float32 per instance
// (an interleaved vertex buffer the renderer binds as is) followed by three int32 per instance (the site and child identity, CPU only). Records are
// sorted by rank so a prefix of the buffer is a lower-density version of the tile. Identities are structural (layer, lattice site, child index),
// never serial numbers, so regenerating a region keeps every id elsewhere.
import { requireCondition, requireFinite, requireInteger } from '../internal/LandscapeValidation.js';

/** Float offsets inside one record. */
export const ECOSYSTEM_RECORD = Object.freeze({
    id: 'ecosystem-instance-v1', floats: 12, bytes: 48, idInts: 3, idBytes: 12, encoding: 'float32-le,int32-le',
    x: 0, y: 1, z: 2, scale: 3, normalX: 4, normalZ: 5, yaw: 6, variant: 7, rank: 8, tintR: 9, tintG: 10, tintB: 11,
    childNone: -1, childPinned: -2, maxInstances: 1 << 20
});
export const ECOSYSTEM_TILE_BYTES_PER_INSTANCE = ECOSYSTEM_RECORD.bytes + ECOSYSTEM_RECORD.idBytes;
const INSTANCE_ID = /^([a-zA-Z0-9][a-zA-Z0-9._/-]{0,159}):(-?\d+),(-?\d+)(?::(\d+))?$/;
const PINNED_ID = /^([a-zA-Z0-9][a-zA-Z0-9._/-]{0,159}):pin:([a-zA-Z0-9][a-zA-Z0-9._-]{0,63})$/;

/** @typedef {{records:Float32Array,ids:Int32Array,count:number}} EcosystemTileData */

/** The world-anchored cell of a layer that owns a position. @param {number} cellMeters @param {number} x @param {number} z */
export function ecosystemCellOf(cellMeters, x, z) { return { cellX: Math.floor(x / cellMeters), cellZ: Math.floor(z / cellMeters) }; }

/** World bounds of a cell. @param {number} cellMeters @param {number} cellX @param {number} cellZ */
export function ecosystemCellBounds(cellMeters, cellX, cellZ) { return { minX: cellX * cellMeters, maxX: (cellX + 1) * cellMeters, minZ: cellZ * cellMeters, maxZ: (cellZ + 1) * cellMeters }; }

/** Tile id of a layer's cell (z grows north like world Z). @param {string} layerId @param {number} cellX @param {number} cellZ */
export function ecosystemTileId(layerId, cellX, cellZ) { return `${layerId}/x${cellX}/z${cellZ}`; }

/** @param {string} id @returns {{layerId:string,cellX:number,cellZ:number}} */
export function parseEcosystemTileId(id) {
    const match = /^(.+)\/x(-?\d+)\/z(-?\d+)$/.exec(id);
    requireCondition(!!match, `${id} is not an ecosystem tile id`);
    return { layerId: match[1], cellX: Number(match[2]), cellZ: Number(match[3]) };
}

/**
 * Stable instance id: `<layer>:<sx>,<sz>` for a lattice site, `<layer>:<sx>,<sz>:<k>` for its k-th child, `<layer>:pin:<name>` for a pinned instance.
 * @param {string} layerId @param {number} siteX @param {number} siteZ @param {number} [child]
 */
export function ecosystemInstanceId(layerId, siteX, siteZ, child = ECOSYSTEM_RECORD.childNone) {
    requireInteger(siteX, -(2 ** 31), 2 ** 31 - 1, 'siteX'); requireInteger(siteZ, -(2 ** 31), 2 ** 31 - 1, 'siteZ'); requireInteger(child, -2, 2 ** 31 - 1, 'child');
    return child === ECOSYSTEM_RECORD.childNone ? `${layerId}:${siteX},${siteZ}` : `${layerId}:${siteX},${siteZ}:${child}`;
}

/** @param {string} id @returns {{layerId:string,siteX:number,siteZ:number,child:number,pinned:string|null}} */
export function parseEcosystemInstanceId(id) {
    const pinned = PINNED_ID.exec(id);
    if (pinned) return { layerId: pinned[1], siteX: 0, siteZ: 0, child: ECOSYSTEM_RECORD.childPinned, pinned: pinned[2] };
    const match = INSTANCE_ID.exec(id);
    requireCondition(!!match, `${id} is not an ecosystem instance id`);
    return { layerId: match[1], siteX: Number(match[2]), siteZ: Number(match[3]), child: match[4] === undefined ? ECOSYSTEM_RECORD.childNone : Number(match[4]), pinned: null };
}

/** Allocates an empty tile able to hold `capacity` instances. @param {number} capacity */
export function createEcosystemTileData(capacity) {
    requireInteger(capacity, 0, ECOSYSTEM_RECORD.maxInstances, 'tile capacity');
    return { records: new Float32Array(capacity * ECOSYSTEM_RECORD.floats), ids: new Int32Array(capacity * ECOSYSTEM_RECORD.idInts), count: 0 };
}

/**
 * Writes one instance at `index`. @param {EcosystemTileData} tile @param {number} index
 * @param {{x:number,y:number,z:number,scale:number,normalX:number,normalZ:number,yaw:number,variant:number,rank:number,tint:readonly number[],siteX:number,siteZ:number,child:number}} instance
 */
export function writeEcosystemRecord(tile, index, instance) {
    requireInteger(index, 0, tile.records.length / ECOSYSTEM_RECORD.floats - 1, 'record index');
    const r = tile.records, o = index * ECOSYSTEM_RECORD.floats;
    for (const [key, value] of [['x', instance.x], ['y', instance.y], ['z', instance.z], ['scale', instance.scale], ['normalX', instance.normalX], ['normalZ', instance.normalZ], ['yaw', instance.yaw], ['variant', instance.variant], ['rank', instance.rank], ['tintR', instance.tint[0]], ['tintG', instance.tint[1]], ['tintB', instance.tint[2]]]) {
        requireFinite(value, `record.${key}`);
        r[o + ECOSYSTEM_RECORD[key]] = value;
    }
    requireCondition(instance.scale > 0 && instance.rank >= 0 && instance.rank <= 1 && Number.isInteger(instance.variant) && instance.variant >= 0, 'record scale, rank and variant must be valid');
    const i = index * ECOSYSTEM_RECORD.idInts;
    tile.ids[i] = instance.siteX | 0; tile.ids[i + 1] = instance.siteZ | 0; tile.ids[i + 2] = instance.child | 0;
}

/** Reads one instance into a plain object (diagnostics, tests). @param {EcosystemTileData} tile @param {number} index */
export function readEcosystemRecord(tile, index) {
    requireInteger(index, 0, tile.count - 1, 'record index');
    const r = tile.records, o = index * ECOSYSTEM_RECORD.floats, i = index * ECOSYSTEM_RECORD.idInts;
    return { x: r[o], y: r[o + 1], z: r[o + 2], scale: r[o + 3], normalX: r[o + 4], normalZ: r[o + 5], yaw: r[o + 6], variant: r[o + 7], rank: r[o + 8], tint: [r[o + 9], r[o + 10], r[o + 11]], siteX: tile.ids[i], siteZ: tile.ids[i + 1], child: tile.ids[i + 2] };
}

/** The ground normal of a record (y recovered from the unit length). @param {Float32Array} records @param {number} index */
export function ecosystemRecordNormal(records, index) {
    const o = index * ECOSYSTEM_RECORD.floats, nx = records[o + 4], nz = records[o + 5];
    return { x: nx, y: Math.sqrt(Math.max(0, 1 - nx * nx - nz * nz)), z: nz };
}

/** Sorts a tile's instances by rank (ties by site, then child) in place. @param {EcosystemTileData} tile */
export function sortEcosystemTile(tile) {
    const { records, ids, count } = tile, F = ECOSYSTEM_RECORD.floats, I = ECOSYSTEM_RECORD.idInts;
    const order = Array.from({ length: count }, (_, i) => i).sort((a, b) => records[a * F + 8] - records[b * F + 8] || ids[a * I] - ids[b * I] || ids[a * I + 1] - ids[b * I + 1] || ids[a * I + 2] - ids[b * I + 2]);
    const sortedRecords = new Float32Array(count * F), sortedIds = new Int32Array(count * I);
    order.forEach((source, target) => { sortedRecords.set(records.subarray(source * F, source * F + F), target * F); sortedIds.set(ids.subarray(source * I, source * I + I), target * I); });
    return { records: sortedRecords, ids: sortedIds, count };
}

/** Encodes a tile's `count` instances: records then ids, little-endian. @param {EcosystemTileData} tile @returns {Uint8Array} */
export function encodeEcosystemTile(tile) {
    requireInteger(tile.count, 0, ECOSYSTEM_RECORD.maxInstances, 'tile count');
    requireCondition(tile.records instanceof Float32Array && tile.ids instanceof Int32Array && tile.records.length >= tile.count * ECOSYSTEM_RECORD.floats && tile.ids.length >= tile.count * ECOSYSTEM_RECORD.idInts, 'tile arrays are too short for its count');
    const bytes = new Uint8Array(tile.count * ECOSYSTEM_TILE_BYTES_PER_INSTANCE), view = new DataView(bytes.buffer);
    for (let i = 0; i < tile.count * ECOSYSTEM_RECORD.floats; i++) { requireFinite(tile.records[i], `record float ${i}`); view.setFloat32(i * 4, tile.records[i], true); }
    const idOffset = tile.count * ECOSYSTEM_RECORD.bytes;
    for (let i = 0; i < tile.count * ECOSYSTEM_RECORD.idInts; i++) view.setInt32(idOffset + i * 4, tile.ids[i], true);
    return bytes;
}

/** Decodes a payload into fresh arrays (ranks and finiteness verified). @param {Uint8Array|ArrayBuffer} input @returns {EcosystemTileData} */
export function decodeEcosystemTile(input) {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    requireCondition(bytes.byteLength % ECOSYSTEM_TILE_BYTES_PER_INSTANCE === 0, `ecosystem tile payload of ${bytes.byteLength} bytes is not a whole number of ${ECOSYSTEM_TILE_BYTES_PER_INSTANCE}-byte instances`);
    const count = bytes.byteLength / ECOSYSTEM_TILE_BYTES_PER_INSTANCE;
    requireCondition(count <= ECOSYSTEM_RECORD.maxInstances, 'ecosystem tile exceeds the instance limit');
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), records = new Float32Array(count * ECOSYSTEM_RECORD.floats), ids = new Int32Array(count * ECOSYSTEM_RECORD.idInts);
    for (let i = 0; i < records.length; i++) { records[i] = view.getFloat32(i * 4, true); requireCondition(Number.isFinite(records[i]), `ecosystem tile record float ${i} is not finite`); }
    const idOffset = count * ECOSYSTEM_RECORD.bytes;
    for (let i = 0; i < ids.length; i++) ids[i] = view.getInt32(idOffset + i * 4, true);
    for (let i = 0; i < count; i++) { const rank = records[i * ECOSYSTEM_RECORD.floats + 8]; requireCondition(rank >= 0 && rank <= 1 && records[i * ECOSYSTEM_RECORD.floats + 3] > 0, `ecosystem tile record ${i} has an invalid rank or scale`); }
    return { records, ids, count };
}
