// src/graphics/gui/window_mesh_debugger/main.js
// Standalone Window Mesh Debugger tool entry point.

import { WindowMeshDebuggerView } from './view/WindowMeshDebuggerView.js';
import { ensureGlobalPerfBar } from '../perf_bar/PerfBar.js';

const canvas = document.getElementById('game-canvas');
if (!canvas) throw new Error('[WindowMeshDebugger] Missing canvas#game-canvas');

const viewport = document.getElementById('game-viewport');
if (viewport) {
    const isEditableTarget = (target) => {
        const el = target && typeof target === 'object' ? target : null;
        if (!el) return false;
        const tag = String(el.tagName || '').toLowerCase();
        if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
        return !!el.isContentEditable;
    };

    viewport.addEventListener('contextmenu', (e) => {
        if (!e) return;
        if (isEditableTarget(e.target) || isEditableTarget(document.activeElement)) return;
        e.preventDefault();
        e.stopImmediatePropagation?.();
    }, { passive: false, capture: true });
}

document.body.classList.add('options-dock-open');

const perfBar = ensureGlobalPerfBar();

const view = new WindowMeshDebuggerView({ canvas });
view.start().then(() => {
    if (view.renderer) perfBar.setRenderer(view.renderer);
    view.onFrame = ({ dt, nowMs }) => perfBar.onFrame({ dt, nowMs });
}).catch((err) => {
    console.error('[WindowMeshDebugger] Failed to start', err);
});

const onKeyDown = (e) => {
    if (!e) return;
    if (e.code !== 'Escape' && e.key !== 'Escape') return;
    e.preventDefault();
    window.location.assign(new URL('../index.html', window.location.href).toString());
};

window.addEventListener('keydown', onKeyDown, { passive: false });
window.addEventListener('beforeunload', () => {
    window.removeEventListener('keydown', onKeyDown);
    view.destroy();
}, { passive: true });
