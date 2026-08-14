// @ts-check
// Parses and validates gameplay launch poses from URL parameters.
import { getBusSpec } from '../vehicle/buses/BusCatalog.js';
import { getGameplayPosePreset } from './GameplayPoseCatalog.js';

export const GAMEPLAY_POSE_PARAM = 'gameplayPose';
export const GAMEPLAY_POSE_PRESET_PARAM = 'pose';

const MAX_INLINE_JSON_LENGTH = 32_768;
const DEG_TO_RAD = Math.PI / 180;

function freezeDeep(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    for (const entry of Object.values(value)) freezeDeep(entry);
    return Object.freeze(value);
}

function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function requiredObject(value, label) {
    if (!isPlainObject(value)) throw new TypeError(`${label} must be an object.`);
    return value;
}

function optionalNumber(value, label, min, max) {
    if (value === undefined) return undefined;
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new TypeError(`${label} must be a finite number.`);
    }
    return Math.max(min, Math.min(max, value));
}

function optionalBoolean(value, label) {
    if (value === undefined) return undefined;
    if (typeof value !== 'boolean') throw new TypeError(`${label} must be a boolean.`);
    return value;
}

function sanitizeVector(value, label, { yOptional = false } = {}) {
    if (value === undefined) return undefined;
    const input = requiredObject(value, label);
    const x = optionalNumber(input.x, `${label}.x`, -10_000, 10_000);
    const y = optionalNumber(input.y, `${label}.y`, -10_000, 10_000);
    const z = optionalNumber(input.z, `${label}.z`, -10_000, 10_000);
    if (x === undefined || z === undefined || (!yOptional && y === undefined)) {
        throw new TypeError(`${label} must include x${yOptional ? '' : ', y'}, and z.`);
    }
    return y === undefined ? { x, z } : { x, y, z };
}

function normalizeAngleDeg(value) {
    if (value === undefined) return undefined;
    const normalized = ((value % 360) + 360) % 360;
    return normalized > 180 ? normalized - 360 : normalized;
}

export function normalizeGameplayCityId(value) {
    if (typeof value !== 'string') return null;
    const key = value.trim().toLowerCase().replaceAll('_', '').replaceAll('-', '');
    if (key === 'bigcity' || key === 'city1' || key === '1') return 'bigcity';
    if (key === 'bigcity2' || key === 'bigcitytwo' || key === 'city2' || key === '2') return 'bigcity2';
    return null;
}

function mergePoseDefinitions(base, override) {
    if (!base) return override;
    if (!override) return base;
    const bus = { ...(base.bus ?? {}), ...(override.bus ?? {}) };
    if (override.bus?.wheelRotationDeg !== undefined && override.bus?.steeringWheelDeg === undefined) {
        bus.steeringWheelDeg = override.bus.wheelRotationDeg;
    }
    if (base.bus?.position || override.bus?.position) {
        bus.position = { ...(base.bus?.position ?? {}), ...(override.bus?.position ?? {}) };
    }
    const camera = { ...(base.camera ?? {}), ...(override.camera ?? {}) };
    if (base.camera?.position || override.camera?.position) {
        camera.position = { ...(base.camera?.position ?? {}), ...(override.camera?.position ?? {}) };
    }
    if (base.camera?.target || override.camera?.target) {
        camera.target = { ...(base.camera?.target ?? {}), ...(override.camera?.target ?? {}) };
    }
    return {
        ...base,
        ...override,
        bus,
        camera,
        simulation: { ...(base.simulation ?? {}), ...(override.simulation ?? {}) },
        hud: { ...(base.hud ?? {}), ...(override.hud ?? {}) }
    };
}

/**
 * Validates a gameplay pose at the public boundary and returns an immutable copy.
 * @param {object} value
 * @param {{ presetId?: string|null }} [options]
 * @returns {object}
 */
export function sanitizeGameplayPose(value, { presetId = null } = {}) {
    const input = requiredObject(value, 'Gameplay pose');
    const version = input.version ?? 1;
    if (version !== 1) throw new RangeError(`Unsupported gameplay pose version '${version}'.`);

    const output = { version: 1 };
    if (presetId) output.presetId = presetId;

    if (input.city !== undefined) {
        const city = normalizeGameplayCityId(input.city);
        if (!city) throw new RangeError(`Unknown gameplay pose city '${input.city}'.`);
        output.city = city;
    }

    if (input.bus !== undefined) {
        const busInput = requiredObject(input.bus, 'Gameplay pose bus');
        const bus = {};
        const modelId = busInput.modelId ?? busInput.id;
        if (modelId !== undefined) {
            if (typeof modelId !== 'string' || !getBusSpec(modelId)) {
                throw new RangeError(`Unknown gameplay pose bus '${modelId}'.`);
            }
            bus.modelId = modelId.trim().toLowerCase();
        }
        const position = sanitizeVector(busInput.position, 'Gameplay pose bus.position', { yOptional: true });
        if (position) bus.position = position;
        const yawDeg = optionalNumber(busInput.yawDeg, 'Gameplay pose bus.yawDeg', -360_000, 360_000);
        if (yawDeg !== undefined) bus.yawDeg = normalizeAngleDeg(yawDeg);
        const steeringWheelDeg = optionalNumber(
            busInput.steeringWheelDeg ?? busInput.wheelRotationDeg,
            'Gameplay pose bus.steeringWheelDeg',
            -270,
            270
        );
        if (steeringWheelDeg !== undefined) bus.steeringWheelDeg = steeringWheelDeg;
        const wheelSpinDeg = optionalNumber(busInput.wheelSpinDeg, 'Gameplay pose bus.wheelSpinDeg', -360_000, 360_000);
        if (wheelSpinDeg !== undefined) bus.wheelSpinDeg = normalizeAngleDeg(wheelSpinDeg);
        output.bus = bus;
    }

    if (input.camera !== undefined) {
        const cameraInput = requiredObject(input.camera, 'Gameplay pose camera');
        const camera = {};
        const position = sanitizeVector(cameraInput.position, 'Gameplay pose camera.position');
        const target = sanitizeVector(cameraInput.target, 'Gameplay pose camera.target');
        if (position) camera.position = position;
        if (target) camera.target = target;
        const yawDeg = optionalNumber(cameraInput.yawDeg, 'Gameplay pose camera.yawDeg', -360_000, 360_000);
        const pitchDeg = optionalNumber(cameraInput.pitchDeg, 'Gameplay pose camera.pitchDeg', -89, 89);
        const distance = optionalNumber(cameraInput.distance, 'Gameplay pose camera.distance', 0.5, 10_000);
        const fovDeg = optionalNumber(cameraInput.fovDeg, 'Gameplay pose camera.fovDeg', 10, 120);
        const locked = optionalBoolean(cameraInput.locked, 'Gameplay pose camera.locked');
        if (yawDeg !== undefined) camera.yawDeg = normalizeAngleDeg(yawDeg);
        if (pitchDeg !== undefined) camera.pitchDeg = pitchDeg;
        if (distance !== undefined) camera.distance = distance;
        if (fovDeg !== undefined) camera.fovDeg = fovDeg;
        camera.locked = locked ?? true;
        output.camera = camera;
    }

    if (input.simulation !== undefined) {
        const simulationInput = requiredObject(input.simulation, 'Gameplay pose simulation');
        const paused = optionalBoolean(simulationInput.paused, 'Gameplay pose simulation.paused');
        output.simulation = paused === undefined ? {} : { paused };
    }

    if (input.hud !== undefined) {
        const hudInput = requiredObject(input.hud, 'Gameplay pose hud');
        const visible = optionalBoolean(hudInput.visible, 'Gameplay pose hud.visible');
        output.hud = visible === undefined ? {} : { visible };
    }

    return freezeDeep(output);
}

function parseInlinePose(raw) {
    if (raw === null || raw === '') return null;
    if (raw.length > MAX_INLINE_JSON_LENGTH) {
        throw new RangeError(`Gameplay pose JSON exceeds ${MAX_INLINE_JSON_LENGTH} characters.`);
    }
    return requiredObject(JSON.parse(raw), 'Gameplay pose JSON');
}

/**
 * Reads `pose=<catalog id>` and/or `gameplayPose=<JSON>` from a query string.
 * Inline JSON overrides fields from the named preset.
 * @param {string} search
 * @param {{ warn?: (message: string, error?: unknown) => void }} [options]
 * @returns {object|null}
 */
export function readGameplayPoseFromSearch(search, { warn = console.warn } = {}) {
    const params = new URLSearchParams(typeof search === 'string' ? search : '');
    const inlineRaw = params.get(GAMEPLAY_POSE_PARAM);
    const queryPresetId = params.get(GAMEPLAY_POSE_PRESET_PARAM)?.trim().toLowerCase() || null;
    if (!queryPresetId && (inlineRaw === null || inlineRaw === '')) return null;

    try {
        const inline = parseInlinePose(inlineRaw);
        const presetId = queryPresetId
            ?? (typeof inline?.preset === 'string' ? inline.preset.trim().toLowerCase() : null);
        const preset = presetId ? getGameplayPosePreset(presetId) : null;
        if (presetId && !preset) throw new RangeError(`Unknown gameplay pose preset '${presetId}'.`);
        return sanitizeGameplayPose(mergePoseDefinitions(preset?.pose ?? null, inline), { presetId });
    } catch (error) {
        warn('[GameplayPose] Ignoring invalid gameplay pose URL parameter.', error);
        return null;
    }
}

/**
 * Resolves an explicit or orbit-style camera pose into world-space vectors.
 * @param {object|null} pose
 * @param {{x:number,y:number,z:number}} fallbackTarget
 * @returns {{position:{x:number,y:number,z:number},target:{x:number,y:number,z:number},fovDeg?:number,locked:boolean}|null}
 */
export function resolveGameplayPoseCamera(pose, fallbackTarget) {
    const camera = pose?.camera;
    if (!camera) return null;
    const target = camera.target ? { ...camera.target } : { ...fallbackTarget };
    let position = camera.position ? { ...camera.position } : null;
    if (!position) {
        const yaw = (camera.yawDeg ?? 180) * DEG_TO_RAD;
        const pitch = (camera.pitchDeg ?? 10) * DEG_TO_RAD;
        const distance = camera.distance ?? 20;
        const horizontal = Math.cos(pitch) * distance;
        position = {
            x: target.x + Math.sin(yaw) * horizontal,
            y: target.y + Math.sin(pitch) * distance,
            z: target.z + Math.cos(yaw) * horizontal
        };
    }
    return {
        position,
        target,
        ...(camera.fovDeg === undefined ? {} : { fovDeg: camera.fovDeg }),
        locked: camera.locked !== false
    };
}
