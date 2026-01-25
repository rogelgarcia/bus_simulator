// Harness scenario: asphalt color + roughness noise close-up.
import * as THREE from 'three';
import { applyAsphaltRoadVisualsToMeshStandardMaterial } from '/src/graphics/visuals/city/AsphaltRoadVisuals.js';

function clampNumber(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

export const scenarioAsphaltNoiseDebug = {
    id: 'asphalt_noise_debug',
    async create({ engine, seed, options }) {
        engine.clearScene();

        const group = new THREE.Group();
        group.name = 'AsphaltNoiseDebug';
        engine.scene.add(group);

        const hemi = new THREE.HemisphereLight(0xffffff, 0x0b1020, 0.4);
        hemi.position.set(0, 50, 0);
        group.add(hemi);

        const sun = new THREE.DirectionalLight(0xffffff, 3.5);
        sun.position.set(10, 6, 10);
        sun.target.position.set(0, 0, 0);
        group.add(sun);
        group.add(sun.target);

        const fill = new THREE.DirectionalLight(0xffffff, 0.6);
        fill.position.set(-14, 18, -6);
        fill.target.position.set(0, 0, 0);
        group.add(fill);
        group.add(fill.target);

        const tileGeo = new THREE.PlaneGeometry(16, 16, 1, 1);
        tileGeo.rotateX(-Math.PI / 2);

        const baseRoughness = clampNumber(options?.baseRoughness, 0.82);
        const base = new THREE.MeshStandardMaterial({
            color: 0x2b2b2b,
            roughness: baseRoughness,
            metalness: 0.0
        });

        const coarseSrc = (options?.coarse && typeof options.coarse === 'object') ? options.coarse : null;
        const fineSrc = (options?.fine && typeof options.fine === 'object') ? options.fine : null;

        const coarseScale = clampNumber(coarseSrc?.scale, 0.07);
        const coarseColorStrength = clampNumber(coarseSrc?.colorStrength, 0.18);
        const coarseDirtyStrength = clampNumber(coarseSrc?.dirtyStrength, 0.18);
        const coarseRoughnessStrength = clampNumber(coarseSrc?.roughnessStrength, 0.28);

        const fineScale = clampNumber(fineSrc?.scale, 12.0);
        const fineColorStrength = clampNumber(fineSrc?.colorStrength, 0.08);
        const fineDirtyStrength = clampNumber(fineSrc?.dirtyStrength, 0.08);
        const fineRoughnessStrength = clampNumber(fineSrc?.roughnessStrength, 0.2);

        const fineOnly = base.clone();
        applyAsphaltRoadVisualsToMeshStandardMaterial(fineOnly, {
            asphaltNoise: {
                coarse: { albedo: false, roughness: false },
                fine: {
                    albedo: true,
                    roughness: true,
                    scale: fineScale,
                    colorStrength: fineColorStrength,
                    dirtyStrength: fineDirtyStrength,
                    roughnessStrength: fineRoughnessStrength
                }
            },
            seed,
            baseColorHex: 0x2b2b2b,
            baseRoughness
        });

        const coarseOnly = base.clone();
        applyAsphaltRoadVisualsToMeshStandardMaterial(coarseOnly, {
            asphaltNoise: {
                coarse: {
                    albedo: true,
                    roughness: true,
                    scale: coarseScale,
                    colorStrength: coarseColorStrength,
                    dirtyStrength: coarseDirtyStrength,
                    roughnessStrength: coarseRoughnessStrength
                },
                fine: { albedo: false, roughness: false }
            },
            seed,
            baseColorHex: 0x2b2b2b,
            baseRoughness
        });

        const both = base.clone();
        applyAsphaltRoadVisualsToMeshStandardMaterial(both, {
            asphaltNoise: {
                coarse: {
                    albedo: true,
                    roughness: true,
                    scale: coarseScale,
                    colorStrength: coarseColorStrength,
                    dirtyStrength: coarseDirtyStrength,
                    roughnessStrength: coarseRoughnessStrength
                },
                fine: {
                    albedo: true,
                    roughness: true,
                    scale: fineScale,
                    colorStrength: fineColorStrength,
                    dirtyStrength: fineDirtyStrength,
                    roughnessStrength: fineRoughnessStrength
                }
            },
            seed,
            baseColorHex: 0x2b2b2b,
            baseRoughness
        });

        const meshes = [
            new THREE.Mesh(tileGeo, base),
            new THREE.Mesh(tileGeo, fineOnly),
            new THREE.Mesh(tileGeo, coarseOnly),
            new THREE.Mesh(tileGeo, both)
        ];

        meshes[0].name = 'Base';
        meshes[1].name = 'FineOnly';
        meshes[2].name = 'CoarseOnly';
        meshes[3].name = 'Both';

        meshes[0].position.set(-9, 0, 9);
        meshes[1].position.set(9, 0, 9);
        meshes[2].position.set(-9, 0, -9);
        meshes[3].position.set(9, 0, -9);

        for (const mesh of meshes) {
            mesh.receiveShadow = true;
            group.add(mesh);
        }

        const cameraMode = String(options?.camera ?? 'macro');
        if (cameraMode === 'grid') {
            engine.camera.position.set(0, 22, 26);
            engine.camera.lookAt(0, 0.05, 0);
        } else {
            const targetX = meshes[3].position.x;
            const targetZ = meshes[3].position.z;
            engine.camera.position.set(targetX + 1.5, 1.15, targetZ + 7.0);
            engine.camera.lookAt(targetX, 0.05, targetZ);
        }

        return {
            update() {},
            getMetrics() {
                return {
                    cameraMode,
                    seed: String(seed ?? ''),
                    params: {
                        baseRoughness,
                        coarse: {
                            scale: coarseScale,
                            colorStrength: coarseColorStrength,
                            dirtyStrength: coarseDirtyStrength,
                            roughnessStrength: coarseRoughnessStrength
                        },
                        fine: {
                            scale: fineScale,
                            colorStrength: fineColorStrength,
                            dirtyStrength: fineDirtyStrength,
                            roughnessStrength: fineRoughnessStrength
                        }
                    },
                    materialConfigs: {
                        base: {
                            hasMap: !!base.map,
                            hasRoughnessMap: !!base.roughnessMap,
                            matVar: base.userData?.materialVariationConfig ?? null
                        },
                        fineOnly: {
                            hasMap: !!fineOnly.map,
                            hasRoughnessMap: !!fineOnly.roughnessMap,
                            matVar: fineOnly.userData?.materialVariationConfig ?? null
                        },
                        coarseOnly: {
                            hasMap: !!coarseOnly.map,
                            hasRoughnessMap: !!coarseOnly.roughnessMap,
                            matVar: coarseOnly.userData?.materialVariationConfig ?? null
                        },
                        both: {
                            hasMap: !!both.map,
                            hasRoughnessMap: !!both.roughnessMap,
                            matVar: both.userData?.materialVariationConfig ?? null
                        }
                    }
                };
            },
            dispose() {
                group.removeFromParent();
                tileGeo.dispose();
                base.dispose();
                fineOnly.dispose();
                coarseOnly.dispose();
                both.dispose();
            }
        };
    }
};
