// src/graphics/gui/noise_fabrication/main.js
// Standalone Noise fabrication tool entry point.

import { NoiseFabricationView } from './NoiseFabricationView.js';
import { installViewportContextMenuBlocker } from '../shared/utils/viewportContextMenuBlocker.js';

const canvas = document.getElementById('game-canvas');
if (!canvas) throw new Error('[NoiseFabrication] Missing canvas#game-canvas');

const viewport = document.getElementById('game-viewport');
const viewportContextMenuBlocker = viewport ? installViewportContextMenuBlocker(viewport) : null;

document.body.classList.add('options-dock-open');

const view = new NoiseFabricationView({ canvas });
view.start().catch((err) => {
    console.error('[NoiseFabrication] Failed to start', err);
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
    viewportContextMenuBlocker?.dispose?.();
    view.destroy();
}, { passive: true });
