// src/graphics/gui/terrain_debugger/main.js
// Standalone Terrain Debugger tool entry point.

import { TerrainDebuggerView } from './view/TerrainDebuggerView.js';
import { ensureGlobalPerfBar } from '../perf_bar/PerfBar.js';
import { installViewportContextMenuBlocker } from '../shared/utils/viewportContextMenuBlocker.js';

const canvas = document.getElementById('game-canvas');
if (!canvas) throw new Error('[TerrainDebugger] Missing canvas#game-canvas');

const viewport = document.getElementById('game-viewport');
const viewportContextMenuBlocker = viewport ? installViewportContextMenuBlocker(viewport) : null;

document.body.classList.add('options-dock-open');

const perfBar = ensureGlobalPerfBar();

const view = new TerrainDebuggerView({ canvas });

function renderStartError(err) {
    const host = viewport ?? document.body;
    if (!host) return;
    const existing = host.querySelector?.('.terrain-debugger-start-error');
    if (existing) existing.remove();

    const panel = document.createElement('div');
    panel.className = 'terrain-debugger-start-error';
    panel.setAttribute('role', 'alert');
    panel.style.position = 'absolute';
    panel.style.left = '12px';
    panel.style.top = '12px';
    panel.style.maxWidth = '700px';
    panel.style.padding = '12px 14px';
    panel.style.border = '1px solid rgba(255, 90, 90, 0.65)';
    panel.style.background = 'rgba(20, 10, 10, 0.92)';
    panel.style.color = '#ffd7d7';
    panel.style.font = '13px/1.45 Consolas, Menlo, Monaco, monospace';
    panel.style.zIndex = '9999';
    panel.style.whiteSpace = 'pre-wrap';

    const causeMessage = String(err?.cause?.message ?? '').trim();
    const message = String(err?.message ?? err ?? 'Unknown startup failure').trim();
    panel.textContent = [
        '[TerrainDebugger] Failed to start.',
        message,
        causeMessage ? `Cause: ${causeMessage}` : '',
        '',
        'Quick checks:',
        '1) Open chrome://gpu and verify WebGL is enabled.',
        '2) Disable browser extensions that inject WebGL hooks.',
        '3) Restart browser with hardware acceleration enabled.',
        '4) If running in sandbox/remote session, test in normal desktop session.'
    ].filter(Boolean).join('\n');

    if (getComputedStyle(host).position === 'static') {
        host.style.position = 'relative';
    }
    host.appendChild(panel);
}

view.start().then(() => {
    if (view.renderer) perfBar.setRenderer(view.renderer);
    view.onFrame = ({ dt, nowMs }) => perfBar.onFrame({ dt, nowMs });
    window.__terrainDebugHooks = {
        version: 1,
        getLightingInfo: () => {
            const renderer = view?.renderer ?? null;
            const scene = view?.scene ?? null;
            const mat = view?._terrainMat ?? null;
            let hemi = null;
            let sun = null;

            scene?.traverse?.((obj) => {
                if (!hemi && obj?.isHemisphereLight) hemi = obj;
                if (!sun && obj?.isDirectionalLight) sun = obj;
            });

            const asVec3 = (v) => (v && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z))
                ? { x: v.x, y: v.y, z: v.z }
                : null;
            const colorHex = (c) => (c && typeof c.getHex === 'function') ? (c.getHex() >>> 0) : null;
            const shadowMapSize = (light) => {
                const sz = light?.shadow?.mapSize ?? null;
                if (!sz || !Number.isFinite(sz.x) || !Number.isFinite(sz.y)) return null;
                return { x: sz.x, y: sz.y };
            };

            return {
                resolvedLightingDefaults: view?._gameplayLightingDefaults ?? null,
                renderer: renderer ? {
                    toneMapping: renderer.toneMapping ?? null,
                    exposure: renderer.toneMappingExposure ?? null,
                    outputColorSpace: renderer.outputColorSpace ?? null,
                    useLegacyLights: ('useLegacyLights' in renderer) ? !!renderer.useLegacyLights : null,
                    shadowMapEnabled: !!renderer.shadowMap?.enabled,
                    shadowMapType: renderer.shadowMap?.type ?? null
                } : null,
                lights: {
                    hemi: hemi ? {
                        intensity: hemi.intensity ?? null,
                        skyColorHex: colorHex(hemi.color),
                        groundColorHex: colorHex(hemi.groundColor),
                        position: asVec3(hemi.position)
                    } : null,
                    sun: sun ? {
                        intensity: sun.intensity ?? null,
                        colorHex: colorHex(sun.color),
                        position: asVec3(sun.position),
                        castShadow: !!sun.castShadow,
                        shadowMapSize: shadowMapSize(sun),
                        shadowBias: sun.shadow?.bias ?? null,
                        shadowNormalBias: sun.shadow?.normalBias ?? null
                    } : null
                },
                material: mat ? {
                    envMapIntensity: ('envMapIntensity' in mat) ? mat.envMapIntensity : null,
                    roughness: mat.roughness ?? null,
                    metalness: mat.metalness ?? null,
                    hasNormalMap: !!mat.normalMap,
                    hasRoughnessMap: !!mat.roughnessMap,
                    hasAoMap: !!mat.aoMap,
                    hasMetalnessMap: !!mat.metalnessMap
                } : null,
                hasEnvironment: !!scene?.environment
            };
        }
    };
}).catch((err) => {
    console.error('[TerrainDebugger] Failed to start', err);
    renderStartError(err);
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
    window.__terrainDebugHooks = null;
    viewportContextMenuBlocker?.dispose?.();
    view.destroy();
}, { passive: true });
