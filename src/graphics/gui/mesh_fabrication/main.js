// src/graphics/gui/mesh_fabrication/main.js
// Standalone Mesh Fabrication tool entry point.

import { GameEngine } from '../../../app/core/GameEngine.js';
import { ensureGlobalPerfBar } from '../perf_bar/PerfBar.js';
import { installViewportContextMenuBlocker } from '../shared/utils/viewportContextMenuBlocker.js';
import { MeshFabricationView } from './MeshFabricationView.js';

const canvas = document.getElementById('game-canvas');
if (!canvas) throw new Error('[MeshFabrication] Missing canvas#game-canvas');

const viewport = document.getElementById('game-viewport');
const viewportContextMenuBlocker = viewport ? installViewportContextMenuBlocker(viewport) : null;

const perfBar = ensureGlobalPerfBar();

const engine = new GameEngine({ canvas });
const baseLighting = engine?.lightingSettings && typeof engine.lightingSettings === 'object'
    ? JSON.parse(JSON.stringify(engine.lightingSettings))
    : null;
engine.setLightingSettings?.({
    ...(baseLighting ?? {}),
    ibl: {
        ...((baseLighting?.ibl && typeof baseLighting.ibl === 'object') ? baseLighting.ibl : {}),
        setBackground: false
    }
});

perfBar.setRenderer(engine.renderer);
const stopPerfBarFrameListener = engine.addFrameListener((frame) => perfBar.onFrame(frame));

const view = new MeshFabricationView(engine);
view.enter();
const stopViewUpdateFrameListener = engine.addFrameListener((frame) => {
    view.update(frame?.dt ?? 0);
});

engine.start();

const onKeyDown = (e) => {
    if (!e) return;
    if (e.code !== 'Escape' && e.key !== 'Escape') return;
    e.preventDefault();
    window.location.assign(new URL('../index.html', window.location.href).toString());
};

window.addEventListener('keydown', onKeyDown, { passive: false });
window.addEventListener('beforeunload', () => {
    window.removeEventListener('keydown', onKeyDown);
    stopViewUpdateFrameListener?.();
    stopPerfBarFrameListener?.();
    view.exit();
    engine.dispose();
    viewportContextMenuBlocker?.dispose?.();
}, { passive: true });
