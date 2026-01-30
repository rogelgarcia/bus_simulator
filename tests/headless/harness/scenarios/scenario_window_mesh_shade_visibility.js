// Harness scenario: window mesh shade visibility (coverage on/off).
import { WindowMeshGenerator } from '/src/graphics/assets3d/generators/buildings/WindowMeshGenerator.js';
import { getDefaultWindowMeshSettings, sanitizeWindowMeshSettings, WINDOW_INTERIOR_ATLAS_ID } from '/src/app/buildings/window_mesh/index.js';

function clampNumber(value, min, max, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, n));
}

function clampHexColor(value, fallback) {
    if (Number.isFinite(value)) return (Number(value) >>> 0) & 0xffffff;
    return fallback;
}

export const scenarioWindowMeshShadeVisibility = {
    id: 'window_mesh_shade_visibility',
    async create({ engine, THREE, seed, options }) {
        engine.clearScene();

        const root = new THREE.Group();
        root.name = 'WindowMeshShadeVisibility';
        engine.scene.add(root);

        const hemi = new THREE.HemisphereLight(0xffffff, 0x0b1020, 0.55);
        hemi.position.set(0, 6, 0);
        root.add(hemi);

        const sun = new THREE.DirectionalLight(0xffffff, 2.25);
        sun.position.set(6, 10, 8);
        sun.target.position.set(0, 0.8, 0);
        root.add(sun);
        root.add(sun.target);

        const glassOpacity = clampNumber(options?.glassOpacity, 0.0, 1.0, 0.35);
        const shadeCoverage = clampNumber(options?.shadeCoverage, 0.0, 1.0, 1.0);
        const shadeColorHex = clampHexColor(options?.shadeColorHex, 0x111111);
        const randomizeCoverage = options?.randomizeCoverage !== undefined ? !!options.randomizeCoverage : false;

        const base = getDefaultWindowMeshSettings();
        const settings = sanitizeWindowMeshSettings({
            ...base,
            glass: { ...base.glass, opacity: glassOpacity },
            shade: {
                ...base.shade,
                enabled: true,
                randomizeCoverage,
                coverage: shadeCoverage,
                colorHex: shadeColorHex
            },
            interior: {
                ...base.interior,
                atlasId: WINDOW_INTERIOR_ATLAS_ID.PROCEDURAL,
                randomizeCell: false,
                cell: { col: 0, row: 0 },
                randomFlipX: false,
                tintVariation: {
                    hueShiftDeg: { min: 0.0, max: 0.0 },
                    saturationMul: { min: 1.0, max: 1.0 },
                    brightnessMul: { min: 1.0, max: 1.0 }
                }
            }
        });

        engine.camera.position.set(0, 0.8, 3.1);
        engine.camera.lookAt(0, 0.8, 0);

        const generator = new WindowMeshGenerator({ renderer: engine.renderer, curveSegments: 28 });
        const instances = Object.freeze([
            { id: 'center', position: { x: 0, y: 0.8, z: 0 }, yaw: 0 }
        ]);
        const windowGroup = generator.createWindowGroup({ settings, seed: String(seed ?? ''), instances });
        root.add(windowGroup);

        return {
            update() {},
            getMetrics() {
                return {
                    seed: String(seed ?? ''),
                    params: { glassOpacity, shadeCoverage, shadeColorHex, randomizeCoverage },
                    objects: {
                        windowGroupChildren: windowGroup.children.length
                    }
                };
            },
            dispose() {
                root.removeFromParent();
                const ownedGeos = windowGroup?.userData?.ownedGeometries ?? [];
                for (const geo of Array.isArray(ownedGeos) ? ownedGeos : []) geo?.dispose?.();
                const mats = windowGroup?.userData?.materials ?? null;
                if (mats && typeof mats === 'object') {
                    const uniq = new Set(Object.values(mats));
                    for (const mat of uniq) mat?.dispose?.();
                }
                generator.dispose();
            }
        };
    }
};
