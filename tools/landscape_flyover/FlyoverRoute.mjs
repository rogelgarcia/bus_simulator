// Validates landscape flyover routes and turns their key poses into a smooth, timed camera path and a per-frame plan.
// @ts-check
// Design: positions and look targets run on centripetal Catmull-Rom splines through the keys (no cusps or overshoot on uneven key
// spacing) and share one curve parameter, so every key's target is met at its position. Time is not that parameter: the path is
// re-timed by arc length under a speed profile that eases between the keys' speeds (smoothstep in arc length), so the velocity is
// continuous everywhere and a short segment never changes the pace abruptly. The plan samples the path per frame and checks the
// clearance over the authoritative ground and the view's turn rate before anything is rendered; the renderer never lifts or corrects
// the camera, so what the plan accepts is exactly what is flown.
import { readFile } from 'node:fs/promises';

export const FLYOVER_ROUTE_FORMAT = 'landscape-flyover-route';
export const FLYOVER_PLAN_FORMAT = 'landscape-flyover-plan';
export const FLYOVER_ROUTE_CONVENTIONS = Object.freeze([
    'World X east, Y up, Z north, meters; sea level is the landscape manifest coordinates.seaLevel.',
    'A key is {position, target, speed, feature}: the camera passes through position looking at target; speed (m/s) is the pace at that key.',
    'feature names the caption shown from that key until the next key with another feature; null shows none.',
    'Heading 0 deg = north (+Z), 90 deg = east (+X), clockwise; clearance is measured above max(ground, sea level).'
]);
const CENTRIPETAL_ALPHA = 0.5;
const TABLE_STEPS_PER_SEGMENT = 2000;
const MIN_KEY_SPACING_METERS = 1;
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** @typedef {[number, number, number]} Vec3 */
/** @typedef {{id:string,title:string,caption:string,mapHint:string}} FlyoverFeature */
/** @typedef {{position:Vec3,target:Vec3,speed:number,feature:string|null}} FlyoverKey */
/** @typedef {{fovDegrees:number,minClearanceMeters:number,maxTurnDegreesPerSecond:number,captionFadeSeconds:number}} FlyoverCamera */
/** @typedef {{format:string,schemaVersion:1,id:string,landscapeId:string,description:string,conventions:readonly string[],camera:FlyoverCamera,features:readonly FlyoverFeature[],keys:readonly FlyoverKey[]}} FlyoverRoute */
/** @typedef {{position:Vec3,target:Vec3,speed:number,distance:number,segment:number,u:number}} FlyoverPathSample */
/** @typedef {(x:number, z:number) => (number|null|Promise<number|null>)} FlyoverGroundSampler */

/** @param {string} message @returns {never} */
function fail(message) { throw new Error(`[LandscapeFlyover] ${message}`); }

/** @param {unknown} value @param {string} name */
function requireObject(value, name) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${name} must be an object`);
    return /** @type {Record<string, unknown>} */ (value);
}

/** @param {Record<string, unknown>} value @param {readonly string[]} keys @param {string} name */
function requireExactKeys(value, keys, name) {
    const extra = Object.keys(value).filter(key => !keys.includes(key)), missing = keys.filter(key => !(key in value));
    if (extra.length || missing.length) fail(`${name} must have exactly the keys ${keys.join(', ')}${extra.length ? `; unexpected ${extra.join(', ')}` : ''}${missing.length ? `; missing ${missing.join(', ')}` : ''}`);
}

/** @param {unknown} value @param {string} name @param {number} min @param {number} max */
function requireNumber(value, name, min, max) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) fail(`${name} must be a number from ${min} to ${max}; received ${JSON.stringify(value)}`);
    return value;
}

/** @param {unknown} value @param {string} name */
function requireText(value, name) {
    if (typeof value !== 'string' || !value.trim()) fail(`${name} must be a non-empty string`);
    return value;
}

/** @param {unknown} value @param {string} name @returns {Vec3} */
function requireVec3(value, name) {
    if (!Array.isArray(value) || value.length !== 3) fail(`${name} must be [x, y, z]`);
    return /** @type {Vec3} */ (value.map((component, axis) => requireNumber(component, `${name}[${axis}]`, -100000, 100000)));
}

/** @param {Vec3} a @param {Vec3} b */
const distance = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);

/** @template T @param {T} value @returns {T} */
function freezeDeep(value) {
    if (value && typeof value === 'object') { for (const child of Object.values(value)) freezeDeep(child); Object.freeze(value); }
    return value;
}

/** @param {unknown} input @returns {FlyoverRoute} */
export function validateFlyoverRoute(input) {
    const value = requireObject(input, 'route');
    requireExactKeys(value, ['format', 'schemaVersion', 'id', 'landscapeId', 'description', 'conventions', 'camera', 'features', 'keys'], 'route');
    if (value.format !== FLYOVER_ROUTE_FORMAT) fail(`route.format must be ${FLYOVER_ROUTE_FORMAT}`);
    if (value.schemaVersion !== 1) fail('route.schemaVersion must be 1');
    const id = requireText(value.id, 'route.id');
    if (!ID_PATTERN.test(id)) fail(`route.id must be lowercase words joined by dashes; received ${id}`);
    if (!Array.isArray(value.conventions) || value.conventions.length !== FLYOVER_ROUTE_CONVENTIONS.length || value.conventions.some((line, index) => line !== FLYOVER_ROUTE_CONVENTIONS[index])) fail('route.conventions must repeat FLYOVER_ROUTE_CONVENTIONS verbatim');
    const camera = requireObject(value.camera, 'route.camera');
    requireExactKeys(camera, ['fovDegrees', 'minClearanceMeters', 'maxTurnDegreesPerSecond', 'captionFadeSeconds'], 'route.camera');
    requireNumber(camera.fovDegrees, 'route.camera.fovDegrees', 10, 100);
    requireNumber(camera.minClearanceMeters, 'route.camera.minClearanceMeters', 1, 1000);
    requireNumber(camera.maxTurnDegreesPerSecond, 'route.camera.maxTurnDegreesPerSecond', 1, 360);
    requireNumber(camera.captionFadeSeconds, 'route.camera.captionFadeSeconds', 0, 10);
    if (!Array.isArray(value.features) || !value.features.length) fail('route.features must be a non-empty array');
    const features = value.features.map((entry, index) => {
        const feature = requireObject(entry, `route.features[${index}]`);
        requireExactKeys(feature, ['id', 'title', 'caption', 'mapHint'], `route.features[${index}]`);
        const featureId = requireText(feature.id, `route.features[${index}].id`);
        if (!ID_PATTERN.test(featureId)) fail(`route.features[${index}].id must be lowercase words joined by dashes; received ${featureId}`);
        return { id: featureId, title: requireText(feature.title, `route.features[${index}].title`), caption: requireText(feature.caption, `route.features[${index}].caption`), mapHint: requireText(feature.mapHint, `route.features[${index}].mapHint`) };
    });
    const known = new Set(features.map(feature => feature.id));
    if (known.size !== features.length) fail('route.features ids must be unique');
    if (!Array.isArray(value.keys) || value.keys.length < 2) fail('route.keys must hold at least two keys');
    const keys = value.keys.map((entry, index) => {
        const key = requireObject(entry, `route.keys[${index}]`);
        requireExactKeys(key, ['position', 'target', 'speed', 'feature'], `route.keys[${index}]`);
        const position = requireVec3(key.position, `route.keys[${index}].position`), target = requireVec3(key.target, `route.keys[${index}].target`);
        if (distance(position, target) < 1) fail(`route.keys[${index}] looks at its own position`);
        const speed = requireNumber(key.speed, `route.keys[${index}].speed`, 0.5, 1000);
        if (key.feature !== null && (typeof key.feature !== 'string' || !known.has(key.feature))) fail(`route.keys[${index}].feature must be null or a feature id; received ${JSON.stringify(key.feature)}`);
        return { position, target, speed, feature: /** @type {string|null} */ (key.feature) };
    });
    for (let index = 1; index < keys.length; index++) {
        if (distance(keys[index - 1].position, keys[index].position) < MIN_KEY_SPACING_METERS) fail(`route.keys[${index - 1}] and route.keys[${index}] are less than ${MIN_KEY_SPACING_METERS} m apart`);
    }
    const used = new Set(keys.map(key => key.feature).filter(Boolean)), unused = features.filter(feature => !used.has(feature.id)).map(feature => feature.id);
    if (unused.length) fail(`route.features ${unused.join(', ')} are never shown by a key`);
    return freezeDeep({ format: FLYOVER_ROUTE_FORMAT, schemaVersion: /** @type {1} */ (1), id, landscapeId: requireText(value.landscapeId, 'route.landscapeId'), description: requireText(value.description, 'route.description'),
        conventions: [...FLYOVER_ROUTE_CONVENTIONS], camera: /** @type {FlyoverCamera} */ ({ ...camera }), features, keys });
}

/** @param {string} file */
export async function loadFlyoverRoute(file) {
    let text;
    try { text = await readFile(file, 'utf8'); } catch (error) { fail(`cannot read the route ${file}: ${/** @type {Error} */ (error).message}`); }
    try { return validateFlyoverRoute(JSON.parse(text)); } catch (error) { if (error instanceof SyntaxError) fail(`${file} is not JSON: ${error.message}`); throw error; }
}

/**
 * One centripetal Catmull-Rom segment between p1 and p2 (Barry-Goldman), u in [0, 1].
 * @param {Vec3} p0 @param {Vec3} p1 @param {Vec3} p2 @param {Vec3} p3 @param {number} u @returns {Vec3}
 */
export function centripetalCatmullRom(p0, p1, p2, p3, u) {
    if (distance(p1, p2) < 1e-9) return [p1[0], p1[1], p1[2]];
    const knot = (/** @type {Vec3} */ a, /** @type {Vec3} */ b) => Math.max(distance(a, b) ** CENTRIPETAL_ALPHA, 1e-6);
    const t0 = 0, t1 = t0 + knot(p0, p1), t2 = t1 + knot(p1, p2), t3 = t2 + knot(p2, p3), t = t1 + (t2 - t1) * u;
    const lerp = (/** @type {Vec3} */ a, /** @type {Vec3} */ b, /** @type {number} */ ta, /** @type {number} */ tb) => /** @type {Vec3} */ (a.map((component, axis) => ((tb - t) * component + (t - ta) * b[axis]) / (tb - ta)));
    const a1 = lerp(p0, p1, t0, t1), a2 = lerp(p1, p2, t1, t2), a3 = lerp(p2, p3, t2, t3);
    const b1 = lerp(a1, a2, t0, t2), b2 = lerp(a2, a3, t1, t3);
    return lerp(b1, b2, t1, t2);
}

/** @param {readonly Vec3[]} points @param {number} segment @param {number} u */
function splinePoint(points, segment, u) {
    const last = points.length - 1, p1 = points[segment], p2 = points[segment + 1];
    const p0 = segment > 0 ? points[segment - 1] : /** @type {Vec3} */ (p1.map((component, axis) => 2 * component - p2[axis]));
    const p3 = segment + 2 <= last ? points[segment + 2] : /** @type {Vec3} */ (p2.map((component, axis) => 2 * component - p1[axis]));
    return centripetalCatmullRom(p0, p1, p2, p3, u);
}

/** @param {number} x */
const smoothstep = x => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };

/**
 * The timed path of a route: arc-length tables per segment, the eased speed profile and its integrated clock.
 * @param {FlyoverRoute} route
 */
export function createFlyoverPath(route) {
    const positions = route.keys.map(key => key.position), targets = route.keys.map(key => key.target), segments = route.keys.length - 1;
    const steps = TABLE_STEPS_PER_SEGMENT, count = segments * steps + 1;
    const lengthAt = new Float64Array(count), timeAt = new Float64Array(count);
    let previous = positions[0];
    for (let segment = 0; segment < segments; segment++) {
        for (let step = 1; step <= steps; step++) {
            const index = segment * steps + step, point = splinePoint(positions, segment, step / steps);
            lengthAt[index] = lengthAt[index - 1] + distance(previous, point);
            previous = point;
        }
    }
    const keyDistance = route.keys.map((_, key) => lengthAt[key * steps]);
    const speedAt = (/** @type {number} */ index) => {
        const segment = Math.min(segments - 1, Math.floor(index / steps)), start = keyDistance[segment], span = keyDistance[segment + 1] - start;
        const blend = span > 0 ? smoothstep((lengthAt[index] - start) / span) : 0;
        return route.keys[segment].speed + (route.keys[segment + 1].speed - route.keys[segment].speed) * blend;
    };
    for (let index = 1; index < count; index++) timeAt[index] = timeAt[index - 1] + 2 * (lengthAt[index] - lengthAt[index - 1]) / (speedAt(index - 1) + speedAt(index));
    const duration = timeAt[count - 1], keyTimes = route.keys.map((_, key) => timeAt[key * steps]);
    /** @param {number} time @returns {FlyoverPathSample} */
    const sample = time => {
        const t = Math.min(duration, Math.max(0, time));
        let low = 0, high = count - 1;
        while (high - low > 1) { const middle = (low + high) >> 1; if (timeAt[middle] <= t) low = middle; else high = middle; }
        const span = timeAt[high] - timeAt[low], blend = span > 0 ? (t - timeAt[low]) / span : 0;
        const parameter = (low + blend) / steps, segment = Math.min(segments - 1, Math.floor(parameter)), u = parameter - segment;
        return { position: splinePoint(positions, segment, u), target: splinePoint(targets, segment, u), speed: speedAt(low) + (speedAt(high) - speedAt(low)) * blend,
            distance: lengthAt[low] + (lengthAt[high] - lengthAt[low]) * blend, segment, u };
    };
    return Object.freeze({ length: lengthAt[count - 1], duration, keyTimes: Object.freeze(keyTimes), keyDistances: Object.freeze(keyDistance), sample });
}

/** @param {Vec3} position @param {Vec3} target */
export function viewAngles(position, target) {
    const dx = target[0] - position[0], dy = target[1] - position[1], dz = target[2] - position[2];
    return { headingDegrees: (Math.atan2(dx, dz) * 180 / Math.PI + 360) % 360, pitchDegrees: Math.atan2(dy, Math.hypot(dx, dz)) * 180 / Math.PI };
}

/**
 * The caption intervals of a route: consecutive keys with the same feature merge; each interval fades in and out over captionFadeSeconds.
 * @param {FlyoverRoute} route @param {readonly number[]} keyTimes
 */
export function flyoverCaptionIntervals(route, keyTimes) {
    /** @type {{feature:string,index:number,startSeconds:number,endSeconds:number}[]} */
    const intervals = [];
    route.keys.slice(0, -1).forEach((key, index) => {
        const open = intervals.at(-1);
        if (key.feature && open && open.feature === key.feature && open.endSeconds === keyTimes[index]) { open.endSeconds = keyTimes[index + 1]; return; }
        if (key.feature) intervals.push({ feature: key.feature, index: route.features.findIndex(feature => feature.id === key.feature), startSeconds: keyTimes[index], endSeconds: keyTimes[index + 1] });
    });
    return intervals;
}

/** @param {{startSeconds:number,endSeconds:number}} interval @param {number} time @param {number} fade */
export function captionAlpha(interval, time, fade) {
    if (time < interval.startSeconds || time > interval.endSeconds) return 0;
    if (fade <= 0) return 1;
    return Math.min(smoothstep((time - interval.startSeconds) / fade), smoothstep((interval.endSeconds - time) / fade));
}

/**
 * Samples the route per frame on the virtual clock and measures it against the ground: clearance over max(ground, sea level) at the
 * camera and a ring of probes around it, turn rate of the view, speeds. `sampleGround` returns the authoritative height or null where
 * no landscape covers the point (then the sea level stands in).
 * @param {FlyoverRoute} route @param {{fps:number, seaLevel:number, sampleGround:FlyoverGroundSampler, probeRadiusMeters?:number}} options
 */
export async function planFlyover(route, { fps, seaLevel, sampleGround, probeRadiusMeters = 8 }) {
    requireNumber(fps, 'fps', 1, 240);
    requireNumber(seaLevel, 'seaLevel', -1000, 1000);
    const path = createFlyoverPath(route), frameCount = Math.floor(path.duration * fps) + 1;
    const intervals = flyoverCaptionIntervals(route, path.keyTimes), fade = route.camera.captionFadeSeconds;
    const ground = async (/** @type {number} */ x, /** @type {number} */ z) => {
        const height = await sampleGround(x, z);
        if (height !== null && (typeof height !== 'number' || !Number.isFinite(height))) fail(`ground sampler returned ${JSON.stringify(height)} at (${x}, ${z})`);
        return height;
    };
    const frames = [];
    /** @type {Vec3|null} */ let previousDirection = null;
    let minClearance = { meters: Infinity, frame: -1 }, maxTurn = { degreesPerSecond: 0, frame: -1 };
    for (let frame = 0; frame < frameCount; frame++) {
        const time = frame / fps, at = path.sample(time), [x, y, z] = at.position;
        const groundHeight = await ground(x, z);
        let highest = Math.max(groundHeight ?? seaLevel, seaLevel);
        for (let probe = 0; probe < 8; probe++) {
            const angle = probe * Math.PI / 4, height = await ground(x + Math.cos(angle) * probeRadiusMeters, z + Math.sin(angle) * probeRadiusMeters);
            highest = Math.max(highest, height ?? seaLevel);
        }
        const clearance = y - highest;
        if (clearance < minClearance.meters) minClearance = { meters: clearance, frame };
        const length = distance(at.position, at.target), direction = /** @type {Vec3} */ (at.target.map((component, axis) => (component - at.position[axis]) / length));
        const turn = previousDirection ? Math.acos(Math.min(1, Math.max(-1, direction[0] * previousDirection[0] + direction[1] * previousDirection[1] + direction[2] * previousDirection[2]))) * 180 / Math.PI * fps : 0;
        if (turn > maxTurn.degreesPerSecond) maxTurn = { degreesPerSecond: turn, frame };
        previousDirection = direction;
        const overWater = groundHeight === null || groundHeight < seaLevel;
        const caption = intervals.map(interval => ({ interval, alpha: captionAlpha(interval, time, fade) })).find(entry => entry.alpha > 0) ?? null;
        frames.push({ frame, time: +time.toFixed(4), position: at.position, target: at.target, speed: at.speed, distance: at.distance, segment: at.segment,
            ground: groundHeight, overWater, heightAboveSurface: y - (overWater ? seaLevel : /** @type {number} */ (groundHeight)), altitude: y - seaLevel, clearance,
            ...viewAngles(at.position, at.target), turnDegreesPerSecond: turn,
            caption: caption ? { feature: caption.interval.feature, index: caption.interval.index, alpha: caption.alpha } : null });
    }
    const violations = [];
    if (minClearance.meters < route.camera.minClearanceMeters) violations.push(`clearance ${minClearance.meters.toFixed(2)} m at frame ${minClearance.frame} (t ${(minClearance.frame / fps).toFixed(2)} s, segment ${frames[minClearance.frame].segment}) is below ${route.camera.minClearanceMeters} m`);
    if (maxTurn.degreesPerSecond > route.camera.maxTurnDegreesPerSecond) violations.push(`turn rate ${maxTurn.degreesPerSecond.toFixed(1)} deg/s at frame ${maxTurn.frame} (t ${(maxTurn.frame / fps).toFixed(2)} s, segment ${frames[maxTurn.frame].segment}) is above ${route.camera.maxTurnDegreesPerSecond} deg/s`);
    const segments = route.keys.slice(0, -1).map((key, index) => {
        const inSegment = frames.filter(entry => entry.segment === index);
        return { index, feature: key.feature, startSeconds: +path.keyTimes[index].toFixed(2), endSeconds: +path.keyTimes[index + 1].toFixed(2), lengthMeters: +(path.keyDistances[index + 1] - path.keyDistances[index]).toFixed(1),
            minClearance: inSegment.length ? +Math.min(...inSegment.map(entry => entry.clearance)).toFixed(2) : null, maxTurn: inSegment.length ? +Math.max(...inSegment.map(entry => entry.turnDegreesPerSecond)).toFixed(1) : null };
    });
    return { format: FLYOVER_PLAN_FORMAT, schemaVersion: 1, route: route.id, fps, seaLevel, durationSeconds: path.duration, lengthMeters: path.length, frameCount, keyTimes: path.keyTimes,
        captions: intervals.map(interval => ({ ...interval, title: /** @type {FlyoverFeature} */ (route.features.find(feature => feature.id === interval.feature)).title })),
        summary: { minClearance, maxTurn, minHeightAboveSurface: Math.min(...frames.map(entry => entry.heightAboveSurface)), maxAltitude: Math.max(...frames.map(entry => entry.altitude)), maxSpeed: Math.max(...frames.map(entry => entry.speed)) },
        segments, violations, frames };
}
