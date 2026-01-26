// src/graphics/gui/atmosphere_debugger/main.js
// Standalone Atmosphere Debug tool entry point.

import { AtmosphereDebuggerView } from './AtmosphereDebuggerView.js';

const canvas = document.getElementById('game-canvas');
if (!canvas) throw new Error('[AtmosphereDebugger] Missing canvas#game-canvas');

document.body.classList.add('options-dock-open');

const view = new AtmosphereDebuggerView({ canvas });
view.start().catch((err) => {
    console.error('[AtmosphereDebugger] Failed to start', err);
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
