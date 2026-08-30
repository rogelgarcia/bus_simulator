// Harness scenario for deterministic sun-bloom filtering outcome coverage.
import * as THREE from 'three';
import { SunBloomRig } from '/src/graphics/visuals/sun/SunBloomRig.js';

function createOccluder(name, geometry, material, position) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.position.copy(position);
    return mesh;
}

function createCutoutTexture() {
    const data = new Uint8Array(8 * 2 * 4);
    for (let y = 0; y < 2; y += 1) {
        for (let x = 0; x < 8; x += 1) {
            const offset = (y * 8 + x) * 4;
            data[offset] = 255;
            data[offset + 1] = 255;
            data[offset + 2] = 255;
            data[offset + 3] = x < 4 ? 255 : 0;
        }
    }
    const texture = new THREE.DataTexture(data, 8, 2, THREE.RGBAFormat);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.needsUpdate = true;
    return texture;
}

function projectPoint(camera, point) {
    const ndc = point.clone().project(camera);
    return {
        u: (ndc.x + 1) * 0.5,
        v: (1 - ndc.y) * 0.5,
        onScreen: ndc.x >= -1 && ndc.x <= 1 && ndc.y >= -1 && ndc.y <= 1 && ndc.z >= -1 && ndc.z <= 1
    };
}

export const scenarioSunBloomFilteringOutcomes = {
    id: 'sun_bloom_filtering_outcomes',
    async create({ engine }) {
        engine.clearScene();
        engine.scene.background = new THREE.Color(0x0b0f16);
        engine.camera.position.set(0, 0, 5);
        engine.camera.lookAt(0, 0, -10);

        const root = new THREE.Group();
        root.name = 'SunBloomFilteringOutcomes';
        engine.scene.add(root);

        const sun = new THREE.DirectionalLight(0xffffff, 1);
        sun.position.set(0, 0, -1);
        root.add(sun);

        const bloomRig = new SunBloomRig({
            light: sun,
            sky: null,
            settings: engine.sunBloomSettings
        });
        root.add(bloomRig.group);

        const material = new THREE.MeshBasicMaterial({ color: 0x30353d });
        const smallGeometry = new THREE.PlaneGeometry(0.7, 0.7);
        const centerGeometry = new THREE.PlaneGeometry(1.8, 1.8);
        const largeGeometry = new THREE.PlaneGeometry(7, 5);
        const cutoutGeometry = new THREE.PlaneGeometry(0.24, 0.24);
        const cutoutTexture = createCutoutTexture();
        const cutoutMaterial = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            map: cutoutTexture,
            alphaTest: 0.5,
            side: THREE.DoubleSide
        });
        cutoutMaterial.userData.isFoliage = true;

        const center = createOccluder('sun_filter_center_occluder', centerGeometry, material, new THREE.Vector3(0, 0, -2));
        center.visible = false;
        root.add(center);

        const large = createOccluder('sun_filter_large_occluder', largeGeometry, material, new THREE.Vector3(3.7, 0, -1));
        large.visible = false;
        root.add(large);

        const cutout = createOccluder('sun_filter_cutout_occluder', cutoutGeometry, cutoutMaterial, new THREE.Vector3(0, 0, -2));
        cutout.visible = false;
        root.add(cutout);

        for (let index = 0; index < 16; index += 1) {
            const side = index % 2 === 0 ? -1 : 1;
            const column = Math.floor(index / 2) % 4;
            const row = Math.floor(index / 8);
            const x = side * (3.4 + column * 0.55);
            const y = row === 0 ? -1.7 : 1.7;
            const mesh = createOccluder(
                `sun_filter_off_axis_${index}`,
                smallGeometry,
                material,
                new THREE.Vector3(x, y, -7 - column)
            );
            root.add(mesh);
        }

        bloomRig.update(engine);

        return {
            update() {
                bloomRig.update(engine);
            },
            getMetrics() {
                return {
                    centerVisible: center.visible,
                    largeVisible: large.visible,
                    cutoutVisible: cutout.visible,
                    samplePoints: {
                        opaque: projectPoint(engine.camera, new THREE.Vector3(-0.035, 0, -2)),
                        transparent: projectPoint(engine.camera, new THREE.Vector3(0.035, 0, -2))
                    }
                };
            },
            dispose() {
                root.removeFromParent();
                smallGeometry.dispose();
                centerGeometry.dispose();
                largeGeometry.dispose();
                cutoutGeometry.dispose();
                material.dispose();
                cutoutMaterial.dispose();
                cutoutTexture.dispose();
                bloomRig.dispose();
            }
        };
    }
};
