// Orders independently owned built-in material shader hooks and restores the original material contract.
// @ts-check

/**
 * @typedef {(shader: any, renderer: any, material: any) => void} MaterialShaderHookApply
 * @typedef {Record<string, {value:any}> | (() => Record<string, {value:any}>)} MaterialShaderUniforms
 * @typedef {{id: string, priority?: number, enabled?: boolean, variantKey?: string, apply: MaterialShaderHookApply, uniforms?: MaterialShaderUniforms}} MaterialShaderHookDescriptor
 * @typedef {{id: string, priority: number, enabled: boolean, variantKey: string, apply: MaterialShaderHookApply, uniforms: MaterialShaderUniforms | null, uniformSource?:any, uniformEntries?:any}} MaterialShaderHookEntry
 * @typedef {{
 *   material: any,
 *   hooks: Map<string, MaterialShaderHookEntry>,
 *   ordered: MaterialShaderHookEntry[],
 *   hadOwnOnBeforeCompile: boolean,
 *   previousOnBeforeCompile: any,
 *   hadOwnCustomProgramCacheKey: boolean,
 *   previousCustomProgramCacheKey: any,
 *   hadOwnOnBeforeRender: boolean,
 *   previousOnBeforeRender: any,
 *   renderWrapper?: any,
 *   compileWrapper: (shader: any, renderer: any) => void,
 *   cacheKeyWrapper: () => any
 * }} MaterialShaderHookState
 */

const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;
const DESCRIPTOR_KEYS = new Set(['id', 'priority', 'enabled', 'variantKey', 'apply', 'uniforms']);
const UPDATE_KEYS = new Set(['priority', 'enabled', 'variantKey', 'apply']);
/** @type {WeakMap<object, MaterialShaderHookState>} */
const REGISTRIES = new WeakMap();

function requireMaterial(material) {
    if (!material || typeof material !== 'object' || Array.isArray(material)) {
        throw new TypeError('Material shader hooks require a material object.');
    }
    return material;
}

function requireId(value) {
    if (typeof value !== 'string' || !value || value.trim() !== value || CONTROL_CHARACTER_PATTERN.test(value)) {
        throw new TypeError('Material shader hook id must be a stable non-empty string.');
    }
    return value;
}

function normalizePriority(value = 0) {
    if (!Number.isSafeInteger(value)) throw new TypeError('Material shader hook priority must be a safe integer.');
    return value;
}

function normalizeVariantKey(value = '1') {
    if (typeof value !== 'string' || !value || CONTROL_CHARACTER_PATTERN.test(value)) {
        throw new TypeError('Material shader hook variantKey must be a non-empty string.');
    }
    return value;
}

function normalizeEnabled(value = true) {
    if (typeof value !== 'boolean') throw new TypeError('Material shader hook enabled must be boolean.');
    return value;
}

function requireApply(value) {
    if (typeof value !== 'function') throw new TypeError('Material shader hook apply must be a function.');
    return value;
}

function requireUniforms(value) {
    if (value === undefined || value === null) return null;
    if (typeof value !== 'function' && (typeof value !== 'object' || Array.isArray(value))) {
        throw new TypeError('Material shader hook uniforms must be a dictionary or provider.');
    }
    return value;
}

function assertKnownKeys(value, allowed, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be an object.`);
    for (const key of Object.keys(value)) {
        if (!allowed.has(key)) throw new TypeError(`${label} has unknown field '${key}'.`);
    }
}

function compareHooks(left, right) {
    if (left.priority !== right.priority) return left.priority - right.priority;
    return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

/** @param {MaterialShaderHookState} state */
function refreshOrder(state) {
    state.ordered = [...state.hooks.values()].sort(compareHooks);
}

/** @param {MaterialShaderHookState} state */
function activeVariantKey(state) {
    const active = state.ordered
        .filter((hook) => hook.enabled)
        .map((hook) => [hook.priority, hook.id, hook.variantKey]);
    return active.length === 0 ? null : JSON.stringify(active);
}

function restoreProperty(target, key, hadOwn, value) {
    if (hadOwn) target[key] = value;
    else delete target[key];
}

/** @param {MaterialShaderHookState} state */
function callPreviousCacheKey(state) {
    const previous = state.previousCustomProgramCacheKey;
    if (typeof previous !== 'function') return '';
    const material = state.material;
    restoreProperty(material, 'onBeforeCompile', state.hadOwnOnBeforeCompile, state.previousOnBeforeCompile);
    restoreProperty(material, 'customProgramCacheKey', state.hadOwnCustomProgramCacheKey, previous);
    try {
        return previous.call(material);
    } finally {
        material.onBeforeCompile = state.compileWrapper;
        material.customProgramCacheKey = state.cacheKeyWrapper;
    }
}

function markVariantChanged(material) {
    material.needsUpdate = true;
}

/** @returns {MaterialShaderHookState} */
function installRegistry(material) {
    const existing = REGISTRIES.get(material);
    if (existing) return existing;

    /** @type {MaterialShaderHookState} */
    const state = {
        material,
        hooks: new Map(),
        ordered: [],
        hadOwnOnBeforeCompile: Object.prototype.hasOwnProperty.call(material, 'onBeforeCompile'),
        previousOnBeforeCompile: material.onBeforeCompile,
        hadOwnCustomProgramCacheKey: Object.prototype.hasOwnProperty.call(material, 'customProgramCacheKey'),
        previousCustomProgramCacheKey: material.customProgramCacheKey,
        hadOwnOnBeforeRender: Object.hasOwn(material, 'onBeforeRender'),
        previousOnBeforeRender: material.onBeforeRender,
        compileWrapper: () => {},
        cacheKeyWrapper: () => ''
    };

    state.compileWrapper = function materialShaderHookCompile(shader, renderer) {
        if (typeof state.previousOnBeforeCompile === 'function') state.previousOnBeforeCompile.call(material, shader, renderer);
        for (const hook of state.ordered) {
            if (hook.enabled) hook.apply(shader, renderer, material);
        }
    };
    state.cacheKeyWrapper = function materialShaderHookCacheKey() {
        const base = callPreviousCacheKey(state);
        const variant = activeVariantKey(state);
        return variant === null ? base : `${String(base)}|material_shader_hooks:${variant}`;
    };
    // r183 reuses programs without restoring their custom uniform dictionary.
    // Rebind active owners before a draw so old sampler layouts cannot survive
    // a return to a cached shader variant.
    state.renderWrapper = function materialShaderHookRender(renderer, ...args) {
        state.previousOnBeforeRender?.call(material, renderer, ...args);
        const properties = renderer.properties.get(material);
        if (!properties.uniforms) return;
        for (const hook of state.ordered) {
            if (!hook.enabled || !hook.uniforms) continue;
            const uniforms = typeof hook.uniforms === 'function' ? hook.uniforms() : hook.uniforms;
            if (hook.uniformSource !== uniforms) {
                hook.uniformSource = uniforms; hook.uniformEntries = Object.entries(uniforms);
            }
            const first = hook.uniformEntries[0];
            if (first && properties.uniforms[first[0]] === first[1]) continue;
            for (const [name, uniform] of hook.uniformEntries) {
                if (properties.uniforms[name] === uniform) continue;
                properties.uniforms[name] = uniform;
                properties.uniformsList = null;
            }
        }
    };

    material.onBeforeCompile = state.compileWrapper;
    material.customProgramCacheKey = state.cacheKeyWrapper;
    material.onBeforeRender = state.renderWrapper;
    REGISTRIES.set(material, state);
    return state;
}

/** @param {MaterialShaderHookState} state */
function uninstallRegistry(state) {
    const material = state.material;
    restoreProperty(material, 'onBeforeCompile', state.hadOwnOnBeforeCompile, state.previousOnBeforeCompile);
    restoreProperty(material, 'customProgramCacheKey', state.hadOwnCustomProgramCacheKey, state.previousCustomProgramCacheKey);
    if (material.onBeforeRender === state.renderWrapper) {
        restoreProperty(material, 'onBeforeRender', state.hadOwnOnBeforeRender, state.previousOnBeforeRender);
    }
    REGISTRIES.delete(material);
}

/**
 * Register one independently removable material shader hook.
 * Lower priorities run first; equal priorities are ordered by stable hook id.
 * @param {any} material
 * @param {MaterialShaderHookDescriptor} descriptor
 */
export function registerMaterialShaderHook(material, descriptor) {
    requireMaterial(material);
    assertKnownKeys(descriptor, DESCRIPTOR_KEYS, 'Material shader hook descriptor');
    const entry = {
        id: requireId(descriptor.id),
        priority: normalizePriority(descriptor.priority),
        enabled: normalizeEnabled(descriptor.enabled),
        variantKey: normalizeVariantKey(descriptor.variantKey),
        apply: requireApply(descriptor.apply),
        uniforms: requireUniforms(descriptor.uniforms)
    };
    const state = installRegistry(material);
    if (state.hooks.has(entry.id)) throw new Error(`Material shader hook '${entry.id}' is already registered.`);

    const before = activeVariantKey(state);
    state.hooks.set(entry.id, entry);
    refreshOrder(state);
    if (before !== activeVariantKey(state)) markVariantChanged(material);

    let removed = false;
    return Object.freeze({
        id: entry.id,
        update(patch) {
            if (removed) throw new Error(`Material shader hook '${entry.id}' has been removed.`);
            return updateMaterialShaderHook(material, entry.id, patch);
        },
        remove() {
            if (removed) return false;
            const didRemove = removeMaterialShaderHook(material, entry.id);
            if (didRemove) removed = true;
            return didRemove;
        }
    });
}

/**
 * Update an existing hook without disturbing independently registered hooks.
 * Changing `apply` requires a distinct `variantKey` so a cached program cannot
 * silently retain the previous shader source.
 * @param {any} material
 * @param {string} id
 * @param {Partial<Omit<MaterialShaderHookDescriptor, 'id'>>} patch
 */
export function updateMaterialShaderHook(material, id, patch) {
    requireMaterial(material);
    const hookId = requireId(id);
    assertKnownKeys(patch, UPDATE_KEYS, 'Material shader hook update');
    const state = REGISTRIES.get(material);
    const current = state?.hooks.get(hookId);
    if (!state || !current) throw new Error(`Material shader hook '${hookId}' is not registered.`);

    const hasApply = Object.prototype.hasOwnProperty.call(patch, 'apply');
    const hasVariant = Object.prototype.hasOwnProperty.call(patch, 'variantKey');
    const hasPriority = Object.prototype.hasOwnProperty.call(patch, 'priority');
    const hasEnabled = Object.prototype.hasOwnProperty.call(patch, 'enabled');
    const nextApply = hasApply ? requireApply(patch.apply) : current.apply;
    const nextVariantKey = hasVariant ? normalizeVariantKey(patch.variantKey) : current.variantKey;
    const nextPriority = hasPriority ? normalizePriority(patch.priority) : current.priority;
    const nextEnabled = hasEnabled ? normalizeEnabled(patch.enabled) : current.enabled;
    if (nextApply !== current.apply && (!hasVariant || nextVariantKey === current.variantKey)) {
        throw new TypeError(`Material shader hook '${hookId}' must change variantKey when apply changes.`);
    }

    const before = activeVariantKey(state);
    current.priority = nextPriority;
    current.enabled = nextEnabled;
    current.variantKey = nextVariantKey;
    current.apply = nextApply;
    refreshOrder(state);
    if (before !== activeVariantKey(state)) markVariantChanged(material);
    return getMaterialShaderHookRegistrySnapshot(material);
}

/** @param {any} material @param {string} id */
export function removeMaterialShaderHook(material, id) {
    requireMaterial(material);
    const hookId = requireId(id);
    const state = REGISTRIES.get(material);
    if (!state || !state.hooks.has(hookId)) return false;

    const before = activeVariantKey(state);
    state.hooks.delete(hookId);
    refreshOrder(state);
    const after = activeVariantKey(state);
    if (state.hooks.size === 0) uninstallRegistry(state);
    if (before !== after) markVariantChanged(material);
    return true;
}

/** @param {any} material */
export function getMaterialShaderHookRegistrySnapshot(material) {
    requireMaterial(material);
    const state = REGISTRIES.get(material);
    return Object.freeze({
        installed: Boolean(state),
        hooks: Object.freeze((state?.ordered ?? []).map((hook) => Object.freeze({
            id: hook.id,
            priority: hook.priority,
            enabled: hook.enabled,
            variantKey: hook.variantKey
        })))
    });
}

export function getMaterialShaderBaseContract(material) {
    requireMaterial(material);
    const state = REGISTRIES.get(material);
    return Object.freeze({
        hasOwnShaderPatch: state ? state.hadOwnOnBeforeCompile && typeof state.previousOnBeforeCompile === 'function'
            : Object.hasOwn(material, 'onBeforeCompile') && typeof material.onBeforeCompile === 'function',
        hasOwnProgramKey: state ? state.hadOwnCustomProgramCacheKey && typeof state.previousCustomProgramCacheKey === 'function'
            : Object.hasOwn(material, 'customProgramCacheKey') && typeof material.customProgramCacheKey === 'function',
        hookIds: Object.freeze((state?.ordered ?? []).map((hook) => hook.id))
    });
}
