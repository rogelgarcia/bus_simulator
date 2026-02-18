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
