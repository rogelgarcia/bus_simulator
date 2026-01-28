// src/graphics/gui/sun_bloom_debugger/main.js
// Standalone Sun Bloom Debug tool entry point.

import { SunBloomDebuggerView } from './SunBloomDebuggerView.js';
import { ensureGlobalPerfBar } from '../perf_bar/PerfBar.js';

const canvas = document.getElementById('game-canvas');
if (!canvas) throw new Error('[SunBloomDebugger] Missing canvas#game-canvas');

document.body.classList.add('options-dock-open');

const perfBar = ensureGlobalPerfBar();

const view = new SunBloomDebuggerView({ canvas });
view.start().then(() => {
    if (view.renderer) perfBar.setRenderer(view.renderer);
    view.onFrame = (frame) => perfBar.onFrame(frame);
}).catch((err) => {
    console.error('[SunBloomDebugger] Failed to start', err);
});

const onKeyDown = (e) => {
    if (!e) return;
    if (e.code === 'KeyC' || e.key === 'c' || e.key === 'C') {
        e.preventDefault();
        view.toggleCompare?.();
        return;
    }
    if (e.code !== 'Escape' && e.key !== 'Escape') return;
    e.preventDefault();
    window.location.assign(new URL('../index.html', window.location.href).toString());
};

window.addEventListener('keydown', onKeyDown, { passive: false });
window.addEventListener('beforeunload', () => {
    window.removeEventListener('keydown', onKeyDown);
    view.destroy();
}, { passive: true });
