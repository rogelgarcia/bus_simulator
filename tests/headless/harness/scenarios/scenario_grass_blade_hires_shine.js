// Harness scenario: hi-res grass blade material shine regression (on/off toggles).
import { createProceduralMeshAsset, PROCEDURAL_MESH } from '/src/graphics/content3d/catalogs/ProceduralMeshCatalog.js';

function clampNumber(value, min, max, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, n));
}

function normalizeBool(value, fallback) {
    if (value === null || value === undefined) return fallback;
    return !!value;
}

export const scenarioGrassBladeHiresShine = {
    id: 'grass_blade_hires_shine',
    async create({ engine, THREE, seed, options }) {
        engine.clearScene();

        engine.scene.background = new THREE.Color(0x070a10);

        const root = new THREE.Group();
        root.name = 'GrassBladeHiResShine';
        engine.scene.add(root);

        const hemi = new THREE.HemisphereLight(0xffffff, 0x0b1020, 0.42);
        hemi.position.set(0, 4, 0);
        root.add(hemi);

        const sun = new THREE.DirectionalLight(0xffffff, 2.2);
        sun.position.set(0.55, 0.9, 1.2);
        sun.target.position.set(0, 0.18, 0);
        root.add(sun);
        root.add(sun.target);

        engine.camera.position.set(0.12, 0.22, 0.62);
        engine.camera.lookAt(0, 0.18, 0);

        const asset = createProceduralMeshAsset(PROCEDURAL_MESH.SOCCER_GRASS_BLADE_HIRES_V1);
        asset.mesh.name = `GrassBladeHiRes:${String(seed ?? '')}`;
        asset.mesh.position.set(0, 0, 0);
        root.add(asset.mesh);

        const prefab = asset.mesh.userData?.prefab ?? null;
        if (!prefab) throw new Error('Missing prefab api on grass blade mesh.');

        const bladeHeightCm = clampNumber(options?.bladeHeightCm, 6, 70, 30);
        const baseWidthCm = clampNumber(options?.baseWidthCm, 0.5, 9, 2.6);
        const midWidthCm = clampNumber(options?.midWidthCm, 0.5, 9, 2.2);
        const tipWidthCm = clampNumber(options?.tipWidthCm, 0.5, 9, 1.8);
        const tipStart01 = clampNumber(options?.tipStart01, 0.05, 0.98, 0.68);
        const tipRoundness = clampNumber(options?.tipRoundness, 0, 1, 0.8);
        const curvature = clampNumber(options?.curvature, 0, 3, 0.8);
        const bladeBendDegrees = clampNumber(options?.bladeBendDegrees, -180, 180, 0);

        const roughness = clampNumber(options?.roughness, 0, 1, 0.88);
        const metalness = clampNumber(options?.metalness, 0, 1, 0.0);
        const specularIntensity = clampNumber(options?.specularIntensity, 0, 1, 0.15);

        const edgeTintEnabled = normalizeBool(options?.edgeTintEnabled, true);
        const edgeTintStrength = clampNumber(options?.edgeTintStrength, 0, 1, 0.4);

        const grazingShineEnabled = normalizeBool(options?.grazingShineEnabled, true);
        const grazingShine = clampNumber(options?.grazingShine, 0, 1, 0.06);
        const grazingShineRoughness = clampNumber(options?.grazingShineRoughness, 0, 1, 0.85);

        prefab.setParam('count', 1);
        prefab.setParam('yawDegrees', 0);

        prefab.setParam('bladeHeightCm', bladeHeightCm);
        prefab.setParam('baseWidthCm', baseWidthCm);
        prefab.setParam('midWidthCm', midWidthCm);
        prefab.setParam('tipWidthCm', tipWidthCm);
        prefab.setParam('tipStart01', tipStart01);
        prefab.setParam('tipRoundness', tipRoundness);
        prefab.setParam('curvature', curvature);
        prefab.setParam('bladeBendDegrees', bladeBendDegrees);

        prefab.setParam('roughness', roughness);
        prefab.setParam('metalness', metalness);
        prefab.setParam('specularIntensity', specularIntensity);

        prefab.setParam('edgeTintEnabled', edgeTintEnabled);
        prefab.setParam('edgeTintStrength', edgeTintStrength);

        prefab.setParam('grazingShineEnabled', grazingShineEnabled);
        prefab.setParam('grazingShine', grazingShine);
        prefab.setParam('grazingShineRoughness', grazingShineRoughness);

        const semanticMaterial = asset?.materials?.semantic ?? null;

        return {
            update() {},
            getMetrics() {
                return {
                    seed: String(seed ?? ''),
                    params: {
                        bladeHeightCm,
                        baseWidthCm,
                        midWidthCm,
                        tipWidthCm,
                        tipStart01,
                        tipRoundness,
                        curvature,
                        bladeBendDegrees,
                        roughness,
                        metalness,
                        specularIntensity,
                        edgeTintEnabled,
                        edgeTintStrength,
                        grazingShineEnabled,
                        grazingShine,
                        grazingShineRoughness
                    },
                    material: semanticMaterial ? {
                        type: String(semanticMaterial.type ?? 'Material'),
                        roughness: Number.isFinite(semanticMaterial.roughness) ? semanticMaterial.roughness : null,
                        metalness: Number.isFinite(semanticMaterial.metalness) ? semanticMaterial.metalness : null,
                        specularIntensity: Number.isFinite(semanticMaterial.specularIntensity) ? semanticMaterial.specularIntensity : null,
                        sheen: Number.isFinite(semanticMaterial.sheen) ? semanticMaterial.sheen : null,
                        clearcoat: Number.isFinite(semanticMaterial.clearcoat) ? semanticMaterial.clearcoat : null,
                        clearcoatRoughness: Number.isFinite(semanticMaterial.clearcoatRoughness) ? semanticMaterial.clearcoatRoughness : null
                    } : null
                };
            },
            dispose() {
                root.removeFromParent();
                asset.mesh.geometry?.dispose?.();

                const mats = new Set();
                const semantic = asset?.materials?.semantic ?? null;
                if (semantic) mats.add(semantic);
                const solids = Array.isArray(asset?.materials?.solid) ? asset.materials.solid : [];
                for (const mat of solids) if (mat) mats.add(mat);
                for (const mat of mats) mat?.dispose?.();
            }
        };
    }
};
