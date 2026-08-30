// Builds independently domain-separated freshness hashes for bake-source inputs.
// @ts-check

import { cloneCanonicalJson } from './CanonicalJson.js';
import { hashCanonicalJsonSha256 } from './Hashing.js';
import { createStableInventory } from './StableInventory.js';

export const BAKE_SOURCE_HASH_SET_SCHEMA = 'bus-simulator/illumination/bake-source-hash-set/v1';
export const BAKE_SOURCE_HASH_DOMAINS = Object.freeze({
    resolvedSource: 'bus-simulator/illumination/bake-source/resolved-source/v1',
    geometry: 'bus-simulator/illumination/bake-source/geometry/v1',
    usedMaterials: 'bus-simulator/illumination/bake-source/used-materials/v1',
    profile: 'bus-simulator/illumination/bake-source/profile/v1',
    channel: 'bus-simulator/illumination/bake-source/channel/v1',
    compiler: 'bus-simulator/illumination/bake-source/compiler-reference/v1'
});

/**
 * @typedef {{
 *   resolvedSource: unknown,
 *   geometry: unknown,
 *   usedMaterials: unknown,
 *   profiles: unknown,
 *   channels: unknown,
 *   compiler: unknown
 * }} BuildBakeSourceHashSetInput
 *
 * @typedef {{
 *   id: string,
 *   sha256: string
 * }} NamedBakeSourceHash
 *
 * @typedef {{
 *   schema: string,
 *   resolvedSource: string,
 *   geometry: string,
 *   usedMaterials: string,
 *   profiles: readonly Readonly<NamedBakeSourceHash>[],
 *   channels: readonly Readonly<NamedBakeSourceHash>[],
 *   compiler: string
 * }} BakeSourceHashSet
 */

/**
 * @param {BuildBakeSourceHashSetInput} input
 * @returns {Promise<Readonly<BakeSourceHashSet>>}
 */
export async function buildBakeSourceHashSet(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        throw new TypeError('Bake-source hash input must be an object');
    }
    const requiredKeys = ['resolvedSource', 'geometry', 'usedMaterials', 'profiles', 'channels', 'compiler'];
    for (const key of requiredKeys) {
        if (!Object.prototype.hasOwnProperty.call(input, key)) {
            throw new TypeError('Bake-source hash input is missing "' + key + '"');
        }
    }
    const profiles = createStableInventory(input.profiles, { label: 'Bake-source profiles' });
    const channels = createStableInventory(input.channels, { label: 'Bake-source channels' });
    const usedMaterialInventory = createStableInventory(
        input.usedMaterials,
        { label: 'Bake-source used materials' }
    );
    const [geometry, usedMaterials, compiler, profileHashes, channelHashes] = await Promise.all([
        hashCanonicalJsonSha256(BAKE_SOURCE_HASH_DOMAINS.geometry, input.geometry),
        hashCanonicalJsonSha256(BAKE_SOURCE_HASH_DOMAINS.usedMaterials, usedMaterialInventory),
        hashCanonicalJsonSha256(BAKE_SOURCE_HASH_DOMAINS.compiler, input.compiler),
        hashNamedInventory(BAKE_SOURCE_HASH_DOMAINS.profile, profiles),
        hashNamedInventory(BAKE_SOURCE_HASH_DOMAINS.channel, channels)
    ]);
    const resolvedSource = await hashCanonicalJsonSha256(
        BAKE_SOURCE_HASH_DOMAINS.resolvedSource,
        {
            geometrySha256: geometry,
            source: cloneCanonicalJson(input.resolvedSource),
            usedMaterialsSha256: usedMaterials
        }
    );
    return Object.freeze({
        schema: BAKE_SOURCE_HASH_SET_SCHEMA,
        resolvedSource,
        geometry,
        usedMaterials,
        profiles: profileHashes,
        channels: channelHashes,
        compiler
    });
}

/**
 * @param {string} domain
 * @param {readonly Readonly<Record<string, unknown>>[]} inventory
 * @returns {Promise<readonly Readonly<NamedBakeSourceHash>[]>}
 */
async function hashNamedInventory(domain, inventory) {
    const entries = await Promise.all(inventory.map(async (item) => {
        const id = /** @type {string} */ (item.id);
        return Object.freeze({
            id,
            sha256: await hashCanonicalJsonSha256(domain + '/' + id, item)
        });
    }));
    return Object.freeze(entries);
}
