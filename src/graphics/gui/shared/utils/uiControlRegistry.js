// src/graphics/gui/shared/utils/uiControlRegistry.js
// Minimal control registry for bulk enable/visibility sync and cleanup.

function resolveFlag(flag, ctx, defaultValue) {
    if (typeof flag === 'function') return !!flag(ctx);
    if (typeof flag === 'boolean') return flag;
    return defaultValue;
}

function resolveRoot(control) {
    if (!control) return null;
    if (control instanceof HTMLElement) return control;
    if (control.root instanceof HTMLElement) return control.root;
    if (control.row instanceof HTMLElement) return control.row;
    if (control.el instanceof HTMLElement) return control.el;
    return null;
}

function applyVisibility(control, visible) {
    const root = resolveRoot(control);
    if (!root) return;
    root.hidden = !visible;
}

function applyEnabled(control, enabled) {
    if (!control) return;
    if (typeof control.setEnabled === 'function') {
        control.setEnabled(enabled);
        return;
    }
    if (typeof control.setDisabled === 'function') {
        control.setDisabled(!enabled);
        return;
    }

    const disabled = !enabled;
    const candidates = [control.input, control.range, control.number, control.select];
    for (const node of candidates) {
        if (node && typeof node === 'object' && 'disabled' in node) node.disabled = disabled;
    }
}

export function createUiControlRegistry() {
    const entries = [];
    const byKey = new Map();

    const add = (control, { key = null, enabledIf = null, visibleIf = null } = {}) => {
        const entry = { key: typeof key === 'string' && key ? key : null, control, enabledIf, visibleIf };
        entries.push(entry);
        if (entry.key) byKey.set(entry.key, entry);
        return control;
    };

    const get = (key) => {
        if (typeof key !== 'string' || !key) return null;
        return byKey.get(key)?.control ?? null;
    };

    const sync = (ctx) => {
        for (const entry of entries) {
            const visible = resolveFlag(entry.visibleIf, ctx, true);
            const enabled = resolveFlag(entry.enabledIf, ctx, true);
            applyVisibility(entry.control, visible);
            applyEnabled(entry.control, enabled);
        }
    };

    const destroy = () => {
        for (const entry of entries) {
            const ctrl = entry.control;
            const dispose = typeof ctrl?.dispose === 'function'
                ? ctrl.dispose
                : (typeof ctrl?.destroy === 'function' ? ctrl.destroy : null);
            dispose?.();
        }
        entries.length = 0;
        byKey.clear();
    };

    return {
        add,
        get,
        sync,
        destroy,
        dispose: destroy,
        entries
    };
}
