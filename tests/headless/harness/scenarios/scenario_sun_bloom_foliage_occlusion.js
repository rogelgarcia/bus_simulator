// Harness scenario: sun bloom occlusion should respect alpha-cutout foliage transparency.
import * as THREE from 'three';
import { SunBloomRig } from '/src/graphics/visuals/sun/SunBloomRig.js';

function applyTextureColorSpace(tex, { srgb = true } = {}) {
    if (!tex) return;
    if ('colorSpace' in tex) {
        tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        return;
    }
    if ('encoding' in tex) tex.encoding = srgb ? THREE.sRGBEncoding : THREE.LinearEncoding;
}

function createDeterministicCutoutMap() {
    const w = 8;
    const h = 8;
    const data = new Uint8Array(w * h * 4);

    for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
            const i = (y * w + x) * 4;
            const opaque = x < (w / 2);
            data[i + 0] = opaque ? 92 : 140;
            data[i + 1] = opaque ? 196 : 212;
            data[i + 2] = opaque ? 106 : 224;
            data[i + 3] = opaque ? 255 : 0;
        }
    }

    const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
    applyTextureColorSpace(tex, { srgb: true });
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.needsUpdate = true;
    return tex;
}

function projectSamplePoints({ camera, pointsWorld }) {
    const out = {};
    const pts = pointsWorld && typeof pointsWorld === 'object' ? pointsWorld : null;
    if (!pts || !camera) return out;

    for (const [id, p] of Object.entries(pts)) {
        if (!p?.isVector3) continue;
        const v = p.clone().project(camera);
        const onScreen = v.x >= -1 && v.x <= 1 && v.y >= -1 && v.y <= 1 && v.z >= -1 && v.z <= 1;
        out[id] = {
            u: (v.x + 1) * 0.5,
            v: (1 - v.y) * 0.5,
            zNdc: v.z,
            onScreen
        };
    }

    return out;
}

export const scenarioSunBloomFoliageOcclusion = {
    id: 'sun_bloom_foliage_occlusion',
    async create({ engine }) {
        engine.clearScene();

        engine.scene.background = new THREE.Color(0x0b0f16);

        const root = new THREE.Group();
        root.name = 'SunBloomFoliageOcclusion';
        engine.scene.add(root);

        engine.camera.position.set(0, 0.7, 2.2);
        engine.camera.lookAt(0, 0.6, -4);

        const sun = new THREE.DirectionalLight(0xffffff, 1.0);
        sun.position.set(0.08, 0.42, -1.0);
        root.add(sun);

        const bloomRig = new SunBloomRig({
            light: sun,
            sky: null,
            settings: engine.sunBloomSettings
        });
        root.add(bloomRig.group);

        const buildingMat = new THREE.MeshBasicMaterial({ color: 0x9ba5b4 });
        const building = new THREE.Mesh(new THREE.PlaneGeometry(3.8, 2.6), buildingMat);
        building.name = 'sunbloom_building_wall';
        building.position.set(-1.6, -0.15, -5.0);
        root.add(building);

        const cutoutTex = createDeterministicCutoutMap();
        cutoutTex.anisotropy = 4;

        const foliageMat = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            map: cutoutTex,
            alphaTest: 0.5,
            side: THREE.DoubleSide
        });
        foliageMat.userData.isFoliage = true;
        foliageMat.name = 'sunbloom_foliage_cutout';

        const cardGeo = new THREE.PlaneGeometry(2.0, 2.0);

        const buildingCard = new THREE.Mesh(cardGeo, foliageMat);
        buildingCard.name = 'sunbloom_foliage_building';
        buildingCard.position.set(-1.6, 0.15, -4.0);
        root.add(buildingCard);

        const skyCard = new THREE.Mesh(cardGeo, foliageMat);
        skyCard.name = 'sunbloom_foliage_sky';
        skyCard.position.set(1.6, 0.15, -4.0);
        root.add(skyCard);

        const samplePointsWorld = {
            buildingTransparent: new THREE.Vector3(-1.05, 0.15, -5.0),
            skyTransparent: new THREE.Vector3(2.15, 0.15, -4.0)
        };

        bloomRig.update(engine);

        return {
            update() {
                bloomRig.update(engine);
            },
            getMetrics() {
                return {
                    samplePoints: projectSamplePoints({ camera: engine.camera, pointsWorld: samplePointsWorld })
                };
            },
            dispose() {
                root.removeFromParent();

                building.geometry?.dispose?.();
                buildingMat.dispose?.();

                cardGeo.dispose?.();
                foliageMat.dispose?.();
                cutoutTex.dispose?.();

                bloomRig.dispose();
            }
        };
    }
};
