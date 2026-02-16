// Harness scenario: AO foliage response should remain stable under deterministic camera motion.
import * as THREE from 'three';

function applyTextureColorSpace(tex, { srgb = true } = {}) {
    if (!tex) return;
    if ('colorSpace' in tex) {
        tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        return;
    }
    if ('encoding' in tex) tex.encoding = srgb ? THREE.sRGBEncoding : THREE.LinearEncoding;
}

function createDeterministicCutoutMap({ r = 92, g = 196, b = 106 } = {}) {
    const w = 8;
    const h = 8;
    const data = new Uint8Array(w * h * 4);

    for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
            const i = (y * w + x) * 4;
            const opaque = x < (w / 2);
            data[i + 0] = r;
            data[i + 1] = g;
            data[i + 2] = b;
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

function createAoAlphaMapFromRgbaTexture(sourceTexture) {
    const src = sourceTexture?.image?.data ?? null;
    const w = Number(sourceTexture?.image?.width) || 0;
    const h = Number(sourceTexture?.image?.height) || 0;
    if (!(src instanceof Uint8Array) || w <= 0 || h <= 0 || src.length < w * h * 4) return null;

    const out = new Uint8Array(w * h * 4);
    for (let i = 0; i < w * h; i += 1) {
        const alpha = src[(i * 4) + 3];
        const j = i * 4;
        out[j] = alpha;
        out[j + 1] = alpha;
        out[j + 2] = alpha;
        out[j + 3] = 255;
    }

    const tex = new THREE.DataTexture(out, w, h, THREE.RGBAFormat);
    applyTextureColorSpace(tex, { srgb: false });
    tex.magFilter = sourceTexture.magFilter;
    tex.minFilter = sourceTexture.minFilter;
    tex.wrapS = sourceTexture.wrapS;
    tex.wrapT = sourceTexture.wrapT;
    tex.generateMipmaps = sourceTexture.generateMipmaps !== false;
    tex.anisotropy = sourceTexture.anisotropy;
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

export const scenarioAoFoliageMotionStability = {
    id: 'ao_foliage_motion_stability',
    async create({ engine, options }) {
        engine.clearScene();
        engine.scene.background = new THREE.Color(0x0b0f16);

        const root = new THREE.Group();
        root.name = 'AoFoliageMotionStability';
        engine.scene.add(root);

        const wallColor = new THREE.Color(0xbdc9d8);
        const wallMat = new THREE.MeshBasicMaterial({ color: wallColor });
        const wallGeo = new THREE.PlaneGeometry(5.2, 3.0);
        const wall = new THREE.Mesh(wallGeo, wallMat);
        wall.position.set(0, 1.35, -3.2);
        root.add(wall);

        const cutoutTex = createDeterministicCutoutMap();
        cutoutTex.anisotropy = 4;
        const cutoutAoAlphaMap = createAoAlphaMapFromRgbaTexture(cutoutTex);

        const foliageMat = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            map: cutoutTex,
            alphaTest: 0.5,
            side: THREE.DoubleSide
        });
        foliageMat.userData.isFoliage = true;
        if (cutoutAoAlphaMap) foliageMat.userData.aoAlphaMap = cutoutAoAlphaMap;
        foliageMat.name = 'ao_motion_foliage_cutout';

        const cardGeo = new THREE.PlaneGeometry(1.9, 1.9);
        const card = new THREE.Mesh(cardGeo, foliageMat);
        card.position.set(0, 1.35, -2.45);
        root.add(card);

        const groundMat = new THREE.MeshBasicMaterial({ color: 0x6f7785 });
        const groundGeo = new THREE.PlaneGeometry(8.5, 8.5);
        const ground = new THREE.Mesh(groundGeo, groundMat);
        ground.rotation.x = -Math.PI / 2;
        ground.position.set(0, 0, -1.2);
        root.add(ground);

        const contactOccluderMat = new THREE.MeshBasicMaterial({ color: 0x6f7785 });
        const contactOccluderGeo = new THREE.BoxGeometry(0.65, 0.65, 0.65);
        const contactOccluder = new THREE.Mesh(contactOccluderGeo, contactOccluderMat);
        contactOccluder.position.set(-1.5, 0.325, -1.7);
        root.add(contactOccluder);

        const samplePointsWorld = {
            foliageOpaque: new THREE.Vector3(-0.42, 1.35, -2.45),
            foliageTransparent: new THREE.Vector3(0.42, 1.35, -3.2),
            foliageReference: new THREE.Vector3(1.45, 1.35, -3.2),
            contactNear: new THREE.Vector3(-1.1, 0.01, -1.7),
            contactFar: new THREE.Vector3(0.2, 0.01, -1.7)
        };

        const camera = engine.camera;
        const lookAt = new THREE.Vector3(0, 1.2, -2.7);
        const motionX = Number.isFinite(options?.cameraMotionX) ? Number(options.cameraMotionX) : 0.22;
        const motionZ = Number.isFinite(options?.cameraMotionZ) ? Number(options.cameraMotionZ) : 0.18;
        const motionHz = Number.isFinite(options?.cameraMotionHz) ? Number(options.cameraMotionHz) : 0.33;
        let elapsedSec = 0;

        const updateCamera = () => {
            const phase = elapsedSec * motionHz * Math.PI * 2;
            camera.position.set(
                Math.sin(phase) * motionX,
                1.45 + Math.sin(phase * 0.5) * 0.03,
                2.45 + Math.cos(phase) * motionZ
            );
            camera.lookAt(lookAt);
            camera.updateMatrixWorld(true);
        };

        updateCamera();

        return {
            update(dt) {
                elapsedSec += Math.max(0, Number(dt) || 0);
                updateCamera();
            },
            getMetrics() {
                return {
                    elapsedSec,
                    samplePoints: projectSamplePoints({ camera, pointsWorld: samplePointsWorld })
                };
            },
            dispose() {
                root.removeFromParent();
                wallGeo.dispose?.();
                wallMat.dispose?.();
                cardGeo.dispose?.();
                foliageMat.dispose?.();
                cutoutTex.dispose?.();
                cutoutAoAlphaMap?.dispose?.();
                groundGeo.dispose?.();
                groundMat.dispose?.();
                contactOccluderGeo.dispose?.();
                contactOccluderMat.dispose?.();
            }
        };
    }
};
