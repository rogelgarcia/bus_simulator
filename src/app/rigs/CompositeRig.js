// src/app/rigs/CompositeRig.js
// Creates a rig that composes child rigs under a namespace and optional aliases.
import { isRigApi } from './RigSchema.js';

function isPlainObject(v) {
    return !!v && typeof v === 'object' && !Array.isArray(v);
}

function splitPath(path) {
    const str = typeof path === 'string' ? path : '';
    const parts = str.split('.').map((p) => p.trim()).filter(Boolean);
    return parts.length ? parts : [];
}

function cloneProperty(prop, { id, label } = {}) {
    if (!prop || typeof prop !== 'object') return null;
    const nextId = typeof id === 'string' ? id : '';
    if (!nextId) return null;
    const nextLabel = typeof label === 'string' && label ? label : nextId;

    const base = { ...prop, id: nextId, label: nextLabel };
    if (Array.isArray(base.options)) base.options = Object.freeze(base.options.map((o) => ({ ...o })));
    return Object.freeze(base);
}

function propertyById(schema, propId) {
    const props = Array.isArray(schema?.properties) ? schema.properties : [];
    return props.find((p) => p?.id === propId) ?? null;
}

function normalizeChildren(children) {
    const list = Array.isArray(children) ? children : [];
    const out = [];
    for (const child of list) {
        const key = typeof child?.key === 'string' ? child.key.trim() : '';
        const rig = child?.rig ?? null;
        if (!key || !isRigApi(rig)) continue;
        const label = typeof child?.label === 'string' && child.label ? child.label : null;
        out.push({ key, rig, label });
    }
    return out;
}

function normalizeAliases(aliases) {
    if (!aliases) return [];
    if (Array.isArray(aliases)) {
        return aliases
            .map((a) => ({
                id: typeof a?.id === 'string' ? a.id.trim() : '',
                label: typeof a?.label === 'string' && a.label ? a.label : null,
                path: typeof a?.path === 'string' ? a.path.trim() : ''
            }))
            .filter((a) => a.id && a.path);
    }
    if (isPlainObject(aliases)) {
        return Object.entries(aliases)
            .map(([id, path]) => ({
                id: typeof id === 'string' ? id.trim() : '',
                label: null,
                path: typeof path === 'string' ? path.trim() : ''
            }))
            .filter((a) => a.id && a.path);
    }
    return [];
}

function resolveRigByPath(childByKey, pathParts) {
    if (pathParts.length === 0) return { rig: null, propId: null };
    const key = pathParts[0];
    const rig = childByKey.get(key) ?? null;
    if (!rig) return { rig: null, propId: null };
    const propId = pathParts.slice(1).join('.');
    return { rig, propId };
}

export function createCompositeRig({
    id,
    label,
    children = [],
    aliases = null
} = {}) {
    const safeId = typeof id === 'string' ? id : '';
    if (!safeId) throw new Error('[CompositeRig] id must be a non-empty string.');
    const safeLabel = typeof label === 'string' && label ? label : safeId;

    const childDefs = normalizeChildren(children);
    const childByKey = new Map(childDefs.map((c) => [c.key, c.rig]));
    const aliasDefs = normalizeAliases(aliases);

    const aliasToPath = new Map();
    const aliasProps = [];

    for (const alias of aliasDefs) {
        const parts = splitPath(alias.path);
        if (parts.length < 2) continue;
        const { rig, propId } = resolveRigByPath(childByKey, parts);
        if (!rig || !propId) continue;
        aliasToPath.set(alias.id, alias.path);
        const targetProp = propertyById(rig.schema, propId);
        const cloned = cloneProperty(targetProp, { id: alias.id, label: alias.label ?? null });
        if (cloned) aliasProps.push(cloned);
    }

    const childSchemas = childDefs.map((c) => Object.freeze({
        ...c.rig.schema,
        key: c.key,
        label: c.label ?? c.rig.schema.label ?? c.rig.schema.id
    }));

    const schema = Object.freeze({
        id: safeId,
        label: safeLabel,
        properties: Object.freeze(aliasProps),
        children: Object.freeze(childSchemas)
    });

    const getValueByPath = (path) => {
        const parts = splitPath(path);
        if (parts.length < 2) return null;
        const { rig, propId } = resolveRigByPath(childByKey, parts);
        return rig && propId ? rig.getValue(propId) : null;
    };

    const setValueByPath = (path, value) => {
        const parts = splitPath(path);
        if (parts.length < 2) return;
        const { rig, propId } = resolveRigByPath(childByKey, parts);
        rig?.setValue?.(propId, value);
    };

    return {
        schema,
        children: childDefs.map((c) => c.rig),
        getValue: (propId) => {
            const id = typeof propId === 'string' ? propId : '';
            if (!id) return null;
            if (aliasToPath.has(id)) return getValueByPath(aliasToPath.get(id));
            if (id.includes('.')) return getValueByPath(id);
            return null;
        },
        setValue: (propId, value) => {
            const id = typeof propId === 'string' ? propId : '';
            if (!id) return;
            if (aliasToPath.has(id)) setValueByPath(aliasToPath.get(id), value);
            else if (id.includes('.')) setValueByPath(id, value);
        },
        apply: () => {
            for (const c of childDefs) c.rig?.apply?.();
        },
        getChildRig: (key) => {
            const k = typeof key === 'string' ? key : '';
            return childByKey.get(k) ?? null;
        }
    };
}

