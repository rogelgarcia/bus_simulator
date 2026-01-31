// src/graphics/gui/shared/utils/viewportContextMenuBlocker.js
// Disables the browser context menu for game viewports while allowing editable UI elements.

function isEditableTarget(target) {
    const el = target && typeof target === 'object' ? target : null;
    if (!el) return false;
    const tag = String(el.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
    return !!el.isContentEditable;
}

function getNowMs() {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') return performance.now();
    return Date.now();
}

export function installViewportContextMenuBlocker(viewportEl, { windowObj = window } = {}) {
    const viewport = viewportEl && typeof viewportEl === 'object' ? viewportEl : null;
    const wnd = windowObj && typeof windowObj === 'object' ? windowObj : window;
    if (!viewport) throw new Error('[ViewportContextMenuBlocker] Missing viewport element');

    let suppressUntilMs = 0;
    let activeRightPointerId = null;

    const onPointerDown = (e) => {
        if (!e) return;
        if (Number(e.button) !== 2) return;
        activeRightPointerId = e.pointerId ?? null;
        suppressUntilMs = getNowMs() + 10000;
    };

    const onPointerUp = (e) => {
        if (!e) return;
        if (activeRightPointerId === null) return;
        if (e.pointerId !== activeRightPointerId) return;
        activeRightPointerId = null;
        suppressUntilMs = Math.max(suppressUntilMs, getNowMs() + 250);
    };

    const onBlur = () => {
        activeRightPointerId = null;
        suppressUntilMs = Math.max(suppressUntilMs, getNowMs() + 250);
    };

    const onContextMenuWindow = (e) => {
        if (!e) return;
        const target = e.target;
        if (isEditableTarget(target) || isEditableTarget(document.activeElement)) return;

        const now = getNowMs();
        const withinViewport = !!(target && viewport.contains?.(target));
        const shouldSuppress = withinViewport || now <= suppressUntilMs;
        if (!shouldSuppress) return;

        e.preventDefault();
        e.stopImmediatePropagation?.();
    };

    viewport.addEventListener('pointerdown', onPointerDown, { capture: true, passive: true });
    wnd.addEventListener('pointerup', onPointerUp, { capture: true, passive: true });
    wnd.addEventListener('pointercancel', onPointerUp, { capture: true, passive: true });
    wnd.addEventListener('blur', onBlur, { passive: true });
    wnd.addEventListener('contextmenu', onContextMenuWindow, { capture: true, passive: false });

    return {
        dispose() {
            viewport.removeEventListener('pointerdown', onPointerDown, { capture: true });
            wnd.removeEventListener('pointerup', onPointerUp, { capture: true });
            wnd.removeEventListener('pointercancel', onPointerUp, { capture: true });
            wnd.removeEventListener('blur', onBlur);
            wnd.removeEventListener('contextmenu', onContextMenuWindow, { capture: true });
        }
    };
}

