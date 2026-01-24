// src/graphics/gui/shared/utils/uiDescriptors.js
// Small descriptor-to-control builder (screen-specific factories injected).
import { createUiControlRegistry } from './uiControlRegistry.js';

function resolveRoot(control) {
    if (!control) return null;
    if (control instanceof HTMLElement) return control;
    if (control.root instanceof HTMLElement) return control.root;
    if (control.row instanceof HTMLElement) return control.row;
    if (control.el instanceof HTMLElement) return control.el;
    return null;
}

export function buildUiFromDescriptors({
    parent,
    descriptors,
    ctx,
    factories,
    registry = null,
    register = null
} = {}) {
    const root = parent instanceof HTMLElement ? parent : null;
    const list = Array.isArray(descriptors) ? descriptors : [];
    const byType = factories && typeof factories === 'object' ? factories : {};
    const reg = registry ?? createUiControlRegistry();
    const onRegister = typeof register === 'function' ? register : null;

    for (const desc of list) {
        if (!desc || typeof desc !== 'object') continue;
        const type = desc.type;
        const factory = type && typeof byType[type] === 'function' ? byType[type] : null;
        if (!factory) continue;

        const control = factory(desc, ctx);
        if (!control) continue;

        const el = resolveRoot(control);
        if (root && el) root.appendChild(el);

        reg.add(control, { key: desc.key, enabledIf: desc.enabledIf, visibleIf: desc.visibleIf });
        onRegister?.(control, desc);
    }

    reg.sync(ctx);

    return {
        registry: reg,
        sync: (nextCtx) => reg.sync(nextCtx ?? ctx),
        destroy: () => reg.destroy(),
        dispose: () => reg.destroy()
    };
}

