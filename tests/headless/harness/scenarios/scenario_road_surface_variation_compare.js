// Harness scenario: side-by-side road/marking variation comparison.
import * as THREE from 'three';
import { applyRoadSurfaceVariationToMeshStandardMaterial } from '/src/graphics/assets3d/materials/RoadSurfaceVariationSystem.js';

function clampNumber(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

export const scenarioRoadSurfaceVariationCompare = {
    id: 'road_surface_variation_compare',
    async create({ engine, seed, options }) {
        engine.clearScene();

        const group = new THREE.Group();
        group.name = 'RoadSurfaceVariationCompare';
        engine.scene.add(group);

        const hemi = new THREE.HemisphereLight(0xffffff, 0x101827, 0.55);
        hemi.position.set(0, 60, 0);
        group.add(hemi);

        const sun = new THREE.DirectionalLight(0xffffff, 1.35);
        sun.position.set(28, 12, 18);
        sun.target.position.set(0, 0, 0);
        group.add(sun);
        group.add(sun.target);

        const planeGeo = new THREE.PlaneGeometry(38, 26, 1, 1);
        planeGeo.rotateX(-Math.PI / 2);

        const roadBase = new THREE.MeshStandardMaterial({
            color: 0x2b2b2b,
            roughness: 0.92,
            metalness: 0.0
        });

        const roadVar = roadBase.clone();
        applyRoadSurfaceVariationToMeshStandardMaterial(roadVar, {
            scale: clampNumber(options?.asphalt?.scale, 0.09),
            colorStrength: clampNumber(options?.asphalt?.colorStrength, 0.35),
            dirtyStrength: clampNumber(options?.asphalt?.dirtyStrength, 0.28),
            roughnessStrength: clampNumber(options?.asphalt?.roughnessStrength, 0.48),
            seed: new THREE.Vector2(71, 19).addScalar(String(seed ?? '').length * 0.1)
        });

        const leftRoad = new THREE.Mesh(planeGeo, roadBase);
        leftRoad.name = 'RoadBase';
        leftRoad.position.set(-22, 0, 0);
        leftRoad.receiveShadow = true;
        group.add(leftRoad);

        const rightRoad = new THREE.Mesh(planeGeo, roadVar);
        rightRoad.name = 'RoadVar';
        rightRoad.position.set(22, 0, 0);
        rightRoad.receiveShadow = true;
        group.add(rightRoad);

        const markGeo = new THREE.PlaneGeometry(30, 0.75, 1, 1);
        markGeo.rotateX(-Math.PI / 2);

        const markBase = new THREE.MeshStandardMaterial({
            color: 0xf2f2f2,
            roughness: 0.55,
            metalness: 0.0
        });

        const markVar = markBase.clone();
        applyRoadSurfaceVariationToMeshStandardMaterial(markVar, {
            scale: clampNumber(options?.markings?.scale, 1.6),
            colorStrength: clampNumber(options?.markings?.colorStrength, 0.22),
            dirtyStrength: clampNumber(options?.markings?.dirtyStrength, 0.55),
            roughnessStrength: clampNumber(options?.markings?.roughnessStrength, 0.44),
            seed: new THREE.Vector2(13, 113).addScalar(String(seed ?? '').length * 0.17)
        });

        const leftMark = new THREE.Mesh(markGeo, markBase);
        leftMark.name = 'MarkBase';
        leftMark.position.set(-22, 0.006, 0);
        group.add(leftMark);

        const rightMark = new THREE.Mesh(markGeo, markVar);
        rightMark.name = 'MarkVar';
        rightMark.position.set(22, 0.006, 0);
        group.add(rightMark);

        const mode = String(options?.camera ?? 'wide');
        if (mode === 'close') {
            engine.camera.position.set(0, 3.2, 14);
            engine.camera.lookAt(0, 0.05, 0);
        } else {
            engine.camera.position.set(0, 18, 34);
            engine.camera.lookAt(0, 0.05, 0);
        }

        return {
            update() {},
            getMetrics() {
                return {
                    mode,
                    seed: String(seed ?? ''),
                    asphalt: roadVar.userData?.roadSurfaceVariationConfig ?? null,
                    markings: markVar.userData?.roadSurfaceVariationConfig ?? null
                };
            },
            dispose() {
                group.removeFromParent();
                planeGeo.dispose();
                markGeo.dispose();
                roadBase.dispose();
                roadVar.dispose();
                markBase.dispose();
                markVar.dispose();
            }
        };
    }
};

