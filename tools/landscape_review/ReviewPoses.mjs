// Versioned natural-world review poses: strict schema, heading/pitch direction math and camera resolution against the native ground.
// @ts-check
// A pose pins where a reviewer stands (x, z) and how high: an eye height above the authoritative native ground, which is re-resolved
// on every terrain revision, or an altitude above sea level for poses over water or outside the landscape. The resolver turns a pose
// into the viewer camera with the look target a fixed distance along the heading/pitch direction and records the ground it used, so
// one pose file reviews every revision with matched cameras. Poses carrying an explicit camera (the viewer presets) pass through.
import { readFile } from 'node:fs/promises';
import { sampleLandscapeChunk } from '../../src/app/landscape/index.js';
import { readLandscapeFileChunk, readLandscapeFileManifest } from '../landscape_authoring/LandscapeFileIO.mjs';

export const REVIEW_POSES_FORMAT = 'landscape-review-poses';
export const REVIEW_POSES_SCHEMA_VERSION = 1;
export const REVIEW_POSE_FILE_BYTE_LIMIT = 1 << 20;
export const REVIEW_POSE_CONVENTIONS = Object.freeze({
    coordinates: 'world X east, Y up, Z north, meters',
    headingDegrees: 'clockwise from north: 0 = north (+Z), 90 = east (+X)',
    pitchDegrees: 'above the horizon: negative looks down',
    eyeHeightMeters: 'above the authoritative native ground at (x, z), re-resolved on every terrain revision',
    altitudeMeters: 'above sea level, independent of the ground (the ground is still recorded, null outside the landscape)',
    lookDistanceMeters: 'the look target lies this far along the view direction',
    camera: 'an explicit viewer camera {position, target} in world meters, passed through unchanged'
});
export const REVIEW_POSE_LIMITS = Object.freeze({
    coordinate: Object.freeze([-100000, 100000]), eyeHeightMeters: Object.freeze([0.2, 2000]), altitudeMeters: Object.freeze([-100, 20000]),
    lookDistanceMeters: Object.freeze([1, 20000]), fovDegrees: Object.freeze([5, 110]), pitchDegrees: Object.freeze([-89, 89]), poses: 200, references: 16
});

// pose ids are a one- to four-letter series prefix and a two-digit number (NW-01 natural world, F-01 the AI 596 D3 fixture poses)
const POSE_ID = /^[A-Z]{1,4}-\d{2}$/, FILE_ID = /^[a-z0-9][a-z0-9-]{1,63}$/, REFERENCE_ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;
const FILE_KEYS = ['format', 'schemaVersion', 'id', 'conventions', 'poses'];
const COMMON_KEYS = ['id', 'intent', 'fovDegrees', 'references', 'notes'];
const DIRECTIONAL_KEYS = ['x', 'z', 'headingDegrees', 'pitchDegrees', 'lookDistanceMeters'];
const FORM_KEYS = ['eyeHeightMeters', 'altitudeMeters', 'camera'];

/** @typedef {{id:string,intent:string,x:number,z:number,eyeHeightMeters:number,headingDegrees:number,pitchDegrees:number,fovDegrees:number,lookDistanceMeters:number,references:readonly string[],notes:string}} EyeHeightReviewPose */
/** @typedef {{id:string,intent:string,x:number,z:number,altitudeMeters:number,headingDegrees:number,pitchDegrees:number,fovDegrees:number,lookDistanceMeters:number,references:readonly string[],notes:string}} AltitudeReviewPose */
/** @typedef {{id:string,intent:string,camera:{position:readonly number[],target:readonly number[]},fovDegrees:number,references:readonly string[],notes:string}} CameraReviewPose */
/** @typedef {EyeHeightReviewPose|AltitudeReviewPose|CameraReviewPose} ReviewPose */
/** @typedef {{format:string,schemaVersion:number,id:string,conventions:Readonly<Record<string,string>>,poses:readonly ReviewPose[]}} ReviewPoseFile */
/** @typedef {{id:string,position:number[],target:number[],fov:number,zoom:1,projection:'perspective',groundHeight:number|null}} ResolvedReviewPose */
/** @typedef {(x:number,z:number)=>number|null|Promise<number|null>} ReviewGroundSampler */

/** @param {string} message @returns {never} */
function fail(message) { throw new Error(`[ReviewPoses] ${message}`); }

/** @param {any} value @param {string} context */
function requireRecord(value, context) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${context} must be an object`);
    return /** @type {Record<string, any>} */ (value);
}

/** @param {Record<string, any>} record @param {readonly string[]} allowed @param {string} context */
function requireKeys(record, allowed, context) {
    const unknown = Object.keys(record).filter(key => record[key] !== undefined && !allowed.includes(key));
    if (unknown.length) fail(`${context} has unknown keys: ${unknown.join(', ')}`);
}

/** @param {any} value @param {readonly number[]} range @param {string} context */
function requireNumber(value, range, context) {
    if (typeof value !== 'number' || !Number.isFinite(value)) fail(`${context} must be a finite number; received ${JSON.stringify(value)}`);
    if (value < range[0] || value > range[1]) fail(`${context} must lie in [${range[0]}, ${range[1]}]; received ${value}`);
    return value;
}

/** @param {any} value @param {string} context */
function requireHeading(value, context) {
    requireNumber(value, [0, 360], context);
    if (value === 360) fail(`${context} must be below 360 (0 is north)`);
    return value;
}

/** @param {any} value @param {number} maxLength @param {string} context */
function requireText(value, maxLength, context) {
    if (typeof value !== 'string' || !value.trim() || value.length > maxLength) fail(`${context} must be a non-empty string of at most ${maxLength} characters`);
    return value;
}

/** @param {any} value @param {string} context */
function requirePoint(value, context) {
    if (!Array.isArray(value) || value.length !== 3) fail(`${context} must be [x, y, z]`);
    return value.map((component, axis) => requireNumber(component, REVIEW_POSE_LIMITS.coordinate, `${context}[${axis}]`));
}

/** @template T @param {T} value @returns {T} */
function freezeDeep(value) {
    if (value && typeof value === 'object') for (const entry of Object.values(value)) freezeDeep(entry);
    return Object.freeze(value);
}

/** @param {any} value @param {string} context @returns {ReviewPose} */
function validatePose(value, context) {
    const pose = requireRecord(value, context);
    const id = typeof pose.id === 'string' && POSE_ID.test(pose.id) ? pose.id : fail(`${context} id must match ${POSE_ID}; received ${JSON.stringify(pose.id)}`);
    const where = `pose ${id}`;
    const forms = FORM_KEYS.filter(key => pose[key] !== undefined);
    if (forms.length !== 1) fail(`${where} must carry exactly one of ${FORM_KEYS.join(', ')}; received ${forms.length ? forms.join(', ') : 'none'}`);
    const form = forms[0];
    requireKeys(pose, [...COMMON_KEYS, form, ...(form === 'camera' ? [] : DIRECTIONAL_KEYS)], where);
    const intent = requireText(pose.intent, 200, `${where} intent`), notes = requireText(pose.notes, 4000, `${where} notes`);
    const fovDegrees = requireNumber(pose.fovDegrees, REVIEW_POSE_LIMITS.fovDegrees, `${where} fovDegrees`);
    if (!Array.isArray(pose.references) || pose.references.length > REVIEW_POSE_LIMITS.references) fail(`${where} references must be an array of at most ${REVIEW_POSE_LIMITS.references} ids`);
    const references = pose.references.map(reference => typeof reference === 'string' && REFERENCE_ID.test(reference) ? reference : fail(`${where} references must be short ids; received ${JSON.stringify(reference)}`));
    if (new Set(references).size !== references.length) fail(`${where} repeats a reference`);
    if (form === 'camera') {
        const camera = requireRecord(pose.camera, `${where} camera`);
        requireKeys(camera, ['position', 'target'], `${where} camera`);
        const position = requirePoint(camera.position, `${where} camera.position`), target = requirePoint(camera.target, `${where} camera.target`);
        if (position.every((component, axis) => component === target[axis])) fail(`${where} camera position and target coincide`);
        return { id, intent, camera: { position, target }, fovDegrees, references, notes };
    }
    for (const key of DIRECTIONAL_KEYS) if (pose[key] === undefined) fail(`${where} is missing ${key}`);
    const x = requireNumber(pose.x, REVIEW_POSE_LIMITS.coordinate, `${where} x`), z = requireNumber(pose.z, REVIEW_POSE_LIMITS.coordinate, `${where} z`);
    const headingDegrees = requireHeading(pose.headingDegrees, `${where} headingDegrees`);
    const pitchDegrees = requireNumber(pose.pitchDegrees, REVIEW_POSE_LIMITS.pitchDegrees, `${where} pitchDegrees`);
    const lookDistanceMeters = requireNumber(pose.lookDistanceMeters, REVIEW_POSE_LIMITS.lookDistanceMeters, `${where} lookDistanceMeters`);
    const shared = { id, intent, x, z, headingDegrees, pitchDegrees, fovDegrees, lookDistanceMeters, references, notes };
    if (form === 'eyeHeightMeters') return { ...shared, eyeHeightMeters: requireNumber(pose.eyeHeightMeters, REVIEW_POSE_LIMITS.eyeHeightMeters, `${where} eyeHeightMeters`) };
    return { ...shared, altitudeMeters: requireNumber(pose.altitudeMeters, REVIEW_POSE_LIMITS.altitudeMeters, `${where} altitudeMeters`) };
}

/** Validates a pose document and returns a deep-frozen copy. @param {any} value @returns {ReviewPoseFile} */
export function validateReviewPoses(value) {
    const file = requireRecord(value, 'review pose file');
    requireKeys(file, FILE_KEYS, 'review pose file');
    if (file.format !== REVIEW_POSES_FORMAT) fail(`format must be ${REVIEW_POSES_FORMAT}; received ${JSON.stringify(file.format)}`);
    if (file.schemaVersion !== REVIEW_POSES_SCHEMA_VERSION) fail(`schemaVersion must be ${REVIEW_POSES_SCHEMA_VERSION}; received ${JSON.stringify(file.schemaVersion)}`);
    if (typeof file.id !== 'string' || !FILE_ID.test(file.id)) fail(`id must match ${FILE_ID}; received ${JSON.stringify(file.id)}`);
    const conventions = requireRecord(file.conventions, 'conventions');
    requireKeys(conventions, Object.keys(REVIEW_POSE_CONVENTIONS), 'conventions');
    for (const [key, text] of Object.entries(REVIEW_POSE_CONVENTIONS)) if (conventions[key] !== text) fail(`conventions.${key} must read exactly: ${text}`);
    if (!Array.isArray(file.poses) || !file.poses.length || file.poses.length > REVIEW_POSE_LIMITS.poses) fail(`poses must hold 1 to ${REVIEW_POSE_LIMITS.poses} entries`);
    const poses = file.poses.map((pose, index) => validatePose(pose, `poses[${index}]`));
    const ids = new Set();
    for (const pose of poses) {
        if (ids.has(pose.id)) fail(`pose id ${pose.id} is duplicated`);
        ids.add(pose.id);
    }
    return freezeDeep({ format: REVIEW_POSES_FORMAT, schemaVersion: REVIEW_POSES_SCHEMA_VERSION, id: file.id, conventions: { ...REVIEW_POSE_CONVENTIONS }, poses });
}

/** @param {string} file @returns {Promise<ReviewPoseFile>} */
export async function loadReviewPoses(file) {
    if (typeof file !== 'string' || !file) fail('a pose file path is required');
    const bytes = await readFile(file);
    if (bytes.length > REVIEW_POSE_FILE_BYTE_LIMIT) fail(`${file} exceeds ${REVIEW_POSE_FILE_BYTE_LIMIT} bytes`);
    let parsed;
    try { parsed = JSON.parse(bytes.toString('utf8')); }
    catch (error) { fail(`${file} is not valid JSON: ${/** @type {Error} */ (error).message}`); }
    return validateReviewPoses(parsed);
}

/** Unit view direction for a heading (0 = +Z north, 90 = +X east) and pitch (negative looks down). @param {number} headingDegrees @param {number} pitchDegrees */
export function reviewPoseDirection(headingDegrees, pitchDegrees) {
    requireHeading(headingDegrees, 'headingDegrees');
    requireNumber(pitchDegrees, [-90, 90], 'pitchDegrees');
    const heading = headingDegrees * Math.PI / 180, pitch = pitchDegrees * Math.PI / 180, flat = Math.cos(pitch);
    return [Math.sin(heading) * flat, Math.sin(pitch), Math.cos(heading) * flat];
}

/**
 * Resolves a pose into the viewer camera. `sampleGround(x, z)` returns the authoritative native height, or null outside the landscape;
 * eye-height poses need a ground, altitude and camera poses only record it.
 * @param {ReviewPose} pose @param {ReviewGroundSampler} sampleGround @returns {Promise<ResolvedReviewPose>}
 */
export async function resolveReviewPose(pose, sampleGround) {
    const valid = validatePose(pose, 'pose');
    if (typeof sampleGround !== 'function') fail('sampleGround must be a function (x, z) => height');
    const ground = async (/** @type {number} */ x, /** @type {number} */ z) => {
        const height = await sampleGround(x, z);
        if (height !== null && (typeof height !== 'number' || !Number.isFinite(height))) fail(`ground sampler returned ${JSON.stringify(height)} at (${x}, ${z}) for ${valid.id}`);
        return height;
    };
    if ('camera' in valid) {
        const { position, target } = valid.camera;
        return freezeDeep({ id: valid.id, position: [...position], target: [...target], fov: valid.fovDegrees, zoom: 1, projection: 'perspective', groundHeight: await ground(position[0], position[2]) });
    }
    const groundHeight = await ground(valid.x, valid.z);
    let y;
    if ('eyeHeightMeters' in valid) {
        if (groundHeight === null) fail(`${valid.id} stands outside the landscape at (${valid.x}, ${valid.z}); an eye-height pose needs native ground`);
        y = groundHeight + valid.eyeHeightMeters;
    } else y = valid.altitudeMeters;
    const direction = reviewPoseDirection(valid.headingDegrees, valid.pitchDegrees);
    const position = [valid.x, y, valid.z];
    const target = position.map((component, axis) => component + direction[axis] * valid.lookDistanceMeters);
    return freezeDeep({ id: valid.id, position, target, fov: valid.fovDegrees, zoom: 1, projection: 'perspective', groundHeight });
}

/**
 * Ground sampler over a saved landscape directory: reads the owning native chunk (hash-authenticated, cached) and samples the exact
 * NW-SE triangulation. At shared chunk borders the east/south chunk owns the point (LANDSCAPE_MODEL.md); outside the bounds → null.
 * @param {string} directory @param {{signal?:AbortSignal}} [options]
 * @returns {Promise<((x:number,z:number)=>Promise<number|null>) & {revision:string,bounds:{minX:number,maxX:number,minZ:number,maxZ:number}}>}
 */
export async function createNativeGroundSampler(directory, { signal } = {}) {
    if (typeof directory !== 'string' || !directory) fail('a landscape directory is required');
    const { manifest } = await readLandscapeFileManifest(directory, 'manifest.json', { signal });
    const natives = manifest.chunks.filter((/** @type {any} */ chunk) => chunk.level === manifest.grid.maxLevel && chunk.sampleStride === 1);
    if (natives.length !== 4 ** manifest.grid.maxLevel) fail(`${directory} has an incomplete native chunk level (${natives.length} of ${4 ** manifest.grid.maxLevel})`);
    const { minX, maxX, minZ, maxZ } = manifest.bounds;
    const owner = (/** @type {number} */ x, /** @type {number} */ z) => natives.find((/** @type {any} */ chunk) => {
        const bounds = chunk.bounds;
        return x >= bounds.minX && (x < bounds.maxX || (x === maxX && bounds.maxX === maxX)) && z <= bounds.maxZ && (z > bounds.minZ || (z === minZ && bounds.minZ === minZ));
    });
    /** @type {Map<string, Promise<any>>} */
    const chunks = new Map();
    const sampler = async (/** @type {number} */ x, /** @type {number} */ z) => {
        if (!Number.isFinite(x) || !Number.isFinite(z)) fail(`ground sample needs finite coordinates; received (${x}, ${z})`);
        if (x < minX || x > maxX || z < minZ || z > maxZ) return null;
        const descriptor = owner(x, z);
        if (!descriptor) fail(`no native chunk of ${directory} owns (${x}, ${z})`);
        let pending = chunks.get(descriptor.id);
        if (!pending) { pending = readLandscapeFileChunk(directory, manifest, descriptor.id, { signal }); chunks.set(descriptor.id, pending); }
        const sample = sampleLandscapeChunk(manifest, await pending, x, z);
        if (sample.status !== 'ready' || sample.accuracy !== 'authoritative') fail(`native sample at (${x}, ${z}) is ${sample.status} (${sample.accuracy ?? sample.reason})`);
        return sample.height;
    };
    return Object.freeze(Object.assign(sampler, { revision: manifest.revision, bounds: { minX, maxX, minZ, maxZ } }));
}
