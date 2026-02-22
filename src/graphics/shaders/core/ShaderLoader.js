// src/graphics/shaders/core/ShaderLoader.js
// Shared shader asset loading, variant cache, define injection, and shader metadata helpers.
// @ts-check

const SHADER_ASSET_ROOT = new URL('../', import.meta.url);
const _sourceCache = new Map();
const _payloadCache = new Map();

const INCLUDE_RE = /#include <shaderlib:([^>]+)>/g;

function normalizeRelativePath(path) {
    return String(path || '')
        .replace(/^\.\/+/, '')
        .replace(/\\+/g, '/')
        .replace(/\/+/g, '/');
}

function stableStringify(value) {
    if (value === null || value === undefined) return String(value);
    if (typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') return JSON.stringify(value);
    if (Array.isArray(value)) {
        return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
    }
    const obj = value;
    if (typeof obj === 'object') {
        const keys = Object.keys(obj).sort();
        return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(obj[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
}

function hash32Hex(input) {
    const text = String(input || '');
    let hash = 0x811c9dc5;
    for (let i = 0; i < text.length; i += 1) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, '0');
}

async function loadShaderText(relativePath) {
    const path = normalizeRelativePath(relativePath);
    const cached = _sourceCache.get(path);
    if (cached) return cached;

    const promise = (async () => {
        let lastError = new Error(`[ShaderLoader] unable to load shader source: ${path}`);

        const url = new URL(path, SHADER_ASSET_ROOT);
        try {
            if (typeof fetch === 'function') {
                const response = await fetch(url.toString(), { method: 'GET' });
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status} fetching ${path} from ${url}`);
                }
                return response.text();
            }

            if (typeof process !== 'undefined' && process?.versions?.node) {
                const { readFile } = await import('node:fs/promises');
                const { fileURLToPath } = await import('node:url');
                const fsPath = fileURLToPath(url);
                return readFile(fsPath, 'utf8');
            }

            lastError = new Error(`Cannot load ${path}: no fetch available`);
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
        }

        throw lastError;
    })();

    _sourceCache.set(path, promise);
    return promise;
}

async function expandShaderLibIncludes(source, seen = new Set()) {
    const regex = /#include <shaderlib:([^>]+)>/g;
    let match;
    let cursor = 0;
    let output = '';
    while ((match = regex.exec(source)) !== null) {
        const includeName = String(match[1] || '').trim();
        const token = includeName.endsWith('.glsl') ? includeName : `${includeName}.glsl`;
        const before = source.slice(cursor, match.index);
        cursor = match.index + match[0].length;
        if (!token) {
            output += before;
            continue;
        }
        if (seen.has(token)) {
            throw new Error(`Circular shader include detected for ${token}`);
        }
        seen.add(token);
        const includeSource = await loadShaderText(`chunks/${token}`);
        const expanded = await expandShaderLibIncludes(includeSource, seen);
        output += before;
        output += expanded;
        seen.delete(token);
    }
    output += source.slice(cursor);
    return output;
}

export async function loadShaderSourceSet({ vertexPath, fragmentPath }) {
    if (!vertexPath || !fragmentPath) {
        throw new Error('[ShaderLoader] vertexPath and fragmentPath are required');
    }

    const rawVertex = await loadShaderText(vertexPath);
    const rawFragment = await loadShaderText(fragmentPath);
    const [vertexSource, fragmentSource] = await Promise.all([
        expandShaderLibIncludes(rawVertex),
        expandShaderLibIncludes(rawFragment)
    ]);
    return {
        vertexPath: normalizeRelativePath(vertexPath),
        fragmentPath: normalizeRelativePath(fragmentPath),
        vertexSource,
        fragmentSource
    };
}

function clampValue(value, min = -Infinity, max = Infinity) {
    if (!Number.isFinite(value)) return 0;
    return Math.max(min, Math.min(max, value));
}

function normalizeDefineValue(value) {
    if (value === true) return '1';
    if (value === false || value === null || value === undefined) return '';
    if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '1';
    if (typeof value === 'string') return value;
    return JSON.stringify(value);
}

function normalizeDefines(defines) {
    const result = {};
    const source = defines && typeof defines === 'object' ? defines : {};
    for (const [name, rawValue] of Object.entries(source)) {
        const key = String(name).trim();
        if (!key) continue;
        const value = rawValue;
        if (value === false || value === null || value === undefined) continue;
        const normalized = normalizeDefineValue(value);
        if (normalized === '') continue;
        result[key] = normalized;
    }
    return result;
}

function buildDefineBlock(defines) {
    const entries = Object.entries(defines ?? {}).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    if (!entries.length) return '';
    const lines = [];
    for (const [name, value] of entries) {
        if (value === '1' && !/^\s*[^0-9.\-]/.test(value)) {
            lines.push(`#define ${name}`);
            continue;
        }
        lines.push(`#define ${name} ${value}`);
    }
    return `${lines.join('\n')}\n`;
}

function cloneUniformValue(value) {
    if (value === null || value === undefined) return value;
    if (typeof value === 'object' && typeof value.clone === 'function') return value.clone();
    if (Array.isArray(value)) return value.slice();
    if (typeof value === 'object') return { ...value };
    return value;
}

function normalizeUniformValue(name, spec, value) {
    const source = value;
    if (!spec || typeof spec !== 'object') return cloneUniformValue(source);

    if (spec.type === 'number') {
        const resolved = Number(source);
        if (!Number.isFinite(resolved)) return Number(spec.default ?? 0);
        return clampValue(resolved, Number(spec.min ?? -Infinity), Number(spec.max ?? Infinity));
    }

    if (spec.type === 'boolean') return !!source;
    if (spec.type === 'integer') {
        const resolved = Math.trunc(Number(source));
        if (!Number.isFinite(resolved)) return Math.trunc(Number(spec.default ?? 0));
        return clampValue(resolved, Math.trunc(spec.min ?? -Infinity), Math.trunc(spec.max ?? Infinity));
    }

    return cloneUniformValue(source);
}

function buildUniformValues({ schema = {}, defaults = {}, overrides = {} }) {
    const seen = new Set();
    const out = {};
    const names = new Set([...Object.keys(schema), ...Object.keys(defaults), ...Object.keys(overrides)]);
    for (const name of names) {
        if (seen.has(name)) continue;
        seen.add(name);
        const overrideProvided = Object.prototype.hasOwnProperty.call(overrides, name);
        const overrideValue = overrideProvided ? overrides[name] : undefined;
        const raw = overrideProvided && overrideValue !== undefined ? overrideValue : defaults[name];
        if (raw === undefined) continue;
        const spec = schema[name];
        out[name] = normalizeUniformValue(name, spec, raw);
    }
    return out;
}

function buildUniformObjects(values) {
    const out = {};
    for (const [name, value] of Object.entries(values)) {
        out[name] = { value };
    }
    return out;
}

function clonePayloadTemplate(payload) {
    return {
        shaderId: payload.shaderId,
        variantKey: payload.variantKey,
        vertexPath: payload.vertexPath,
        fragmentPath: payload.fragmentPath,
        defines: { ...payload.defines },
        vertexSource: payload.vertexSource,
        fragmentSource: payload.fragmentSource,
        uniforms: buildUniformObjects(payload.__uniformValues)
    };
}

export function getShaderDebugIdentity(payload) {
    if (!payload || typeof payload !== 'object') return null;
    if (!payload.shaderId || !payload.variantKey) return null;
    return `${payload.shaderId}::${payload.variantKey}`;
}

export function getShaderSourcePaths(payload) {
    if (!payload || typeof payload !== 'object') return null;
    return {
        vertexPath: payload.vertexPath ?? null,
        fragmentPath: payload.fragmentPath ?? null
    };
}

export function createShaderPayload({
    shaderId,
    sourceSet,
    defines = {},
    uniformSchema = {},
    defaultUniforms = {},
    uniformValues = {}
}) {
    if (!shaderId) throw new Error('[ShaderLoader] shaderId is required');
    if (!sourceSet || typeof sourceSet !== 'object') throw new Error('[ShaderLoader] sourceSet is required');

    const normalizedDefines = normalizeDefines(defines);
    const resolvedUniformValues = buildUniformValues({
        schema: uniformSchema,
        defaults: defaultUniforms,
        overrides: uniformValues
    });

    const cacheSeed = {
        shaderId,
        vertexPath: sourceSet.vertexPath,
        fragmentPath: sourceSet.fragmentPath,
        vertexSourceHash: hash32Hex(sourceSet.vertexSource),
        fragmentSourceHash: hash32Hex(sourceSet.fragmentSource),
        defines: normalizedDefines,
        uniforms: resolvedUniformValues
    };
    const variantKey = hash32Hex(stableStringify(cacheSeed));
    const existing = _payloadCache.get(variantKey);
    if (existing) return clonePayloadTemplate(existing);

    const defineBlock = buildDefineBlock(normalizedDefines);
    const payload = {
        shaderId,
        variantKey,
        vertexPath: sourceSet.vertexPath,
        fragmentPath: sourceSet.fragmentPath,
        defines: { ...normalizedDefines },
        vertexSource: `${defineBlock}${sourceSet.vertexSource}`.trimLeft(),
        fragmentSource: `${defineBlock}${sourceSet.fragmentSource}`.trimLeft(),
        __uniformValues: resolvedUniformValues,
        __meta: {
            cacheSeed: stableStringify(cacheSeed)
        }
    };
    _payloadCache.set(variantKey, payload);
    return clonePayloadTemplate(payload);
}

export function attachShaderMetadata(material, payload, label = null) {
    if (!material || typeof material !== 'object') return;
    if (!payload || typeof payload !== 'object') return;
    const safeLabel = typeof label === 'string' && label.trim() ? label.trim() : payload.shaderId;
    const current = material.userData || {};
    const debugIdentity = getShaderDebugIdentity(payload);
    current.shader = {
        ...(current.shader || {}),
        shaderId: payload.shaderId,
        variantKey: payload.variantKey,
        label: safeLabel,
        vertexPath: payload.vertexPath,
        fragmentPath: payload.fragmentPath,
        defines: { ...(payload.defines || {}) }
    };
    current.shader.debug = {
        shaderIdentity: debugIdentity,
        variantKey: payload.variantKey,
        sourcePaths: {
            vertexPath: payload.vertexPath,
            fragmentPath: payload.fragmentPath
        }
    };
    material.userData = current;

    const previous = typeof material.customProgramCacheKey === 'function' ? material.customProgramCacheKey.bind(material) : null;
    material.customProgramCacheKey = () => {
        const base = previous ? previous() : safeLabel;
        return `${base}|${payload.variantKey}`;
    };
}
