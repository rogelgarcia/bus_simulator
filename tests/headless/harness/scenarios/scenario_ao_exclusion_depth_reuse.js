// Deterministic scene for AO receiver-mask depth reuse and mixed-material coverage.
import * as THREE from 'three';

function createCutoutTexture() {
    const width = 4;
    const height = 4;
    const data = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            const index = (y * width + x) * 4;
            data[index] = 96;
            data[index + 1] = 190;
            data[index + 2] = 104;
            data[index + 3] = x < 2 ? 255 : 0;
        }
    }
    const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.needsUpdate = true;
    return texture;
}

function createMixedGeometry() {
    const positions = new Float32Array([
        -0.85, 0.35, 0, -0.15, 0.35, 0, -0.15, 1.35, 0,
        -0.85, 0.35, 0, -0.15, 1.35, 0, -0.85, 1.35, 0,
        0.15, 0.35, 0, 0.85, 0.35, 0, 0.85, 1.35, 0,
        0.15, 0.35, 0, 0.85, 1.35, 0, 0.15, 1.35, 0
    ]);
    const uvs = new Float32Array([
        0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1,
        0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1
    ]);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geometry.addGroup(0, 6, 0);
    geometry.addGroup(6, 6, 1);
    geometry.computeVertexNormals();
    return geometry;
}

export const scenarioAoExclusionDepthReuse = {
    id: 'ao_exclusion_depth_reuse',
    async create({ engine, options }) {
        engine.clearScene();
        engine.scene.background = new THREE.Color(0x15202d);

        const root = new THREE.Group();
        root.name = 'AoExclusionDepthReuse';
        engine.scene.add(root);

        const backdropMaterial = new THREE.MeshBasicMaterial({ color: 0xa8b5c4 });
        const backdropGeometry = new THREE.PlaneGeometry(8, 4.5);
        const backdrop = new THREE.Mesh(backdropGeometry, backdropMaterial);
        backdrop.position.set(0, 1.65, -4.5);
        root.add(backdrop);

        const groundMaterial = new THREE.MeshBasicMaterial({ color: 0x697484 });
        const groundGeometry = new THREE.PlaneGeometry(9, 9);
        const ground = new THREE.Mesh(groundGeometry, groundMaterial);
        ground.rotation.x = -Math.PI / 2;
        ground.position.set(0, 0, -1.2);
        root.add(ground);

        const occluderMaterial = new THREE.MeshBasicMaterial({ color: 0x806b5b });
        const occluderGeometry = new THREE.PlaneGeometry(1.25, 1.8);
        const occluder = new THREE.Mesh(occluderGeometry, occluderMaterial);
        occluder.position.set(-1.4, 1.15, -2.65);
        root.add(occluder);

        const receiverRoot = new THREE.Group();
        receiverRoot.name = 'AoExcludedReceivers';
        receiverRoot.visible = options?.receiversVisible !== false;
        root.add(receiverRoot);

        const cutoutTexture = createCutoutTexture();
        const cutoutMaterial = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            map: cutoutTexture,
            alphaTest: 0.5,
            side: THREE.DoubleSide
        });
        cutoutMaterial.userData.isFoliage = true;
        const cardGeometry = new THREE.PlaneGeometry(1.25, 1.8);

        const frontCard = new THREE.Mesh(cardGeometry, cutoutMaterial);
        frontCard.name = 'AoReceiverFrontCutout';
        frontCard.position.set(0, 1.15, -2.4);
        receiverRoot.add(frontCard);

        const hiddenCard = new THREE.Mesh(cardGeometry, cutoutMaterial);
        hiddenCard.name = 'AoReceiverBehindOccluder';
        hiddenCard.position.set(-1.4, 1.15, -3.0);
        receiverRoot.add(hiddenCard);

        const mixedOpaqueMaterial = new THREE.MeshBasicMaterial({ color: 0xd1a45f });
        const mixedGeometry = createMixedGeometry();
        const mixed = new THREE.Mesh(mixedGeometry, [mixedOpaqueMaterial, cutoutMaterial]);
        mixed.name = 'AoReceiverMixedMaterials';
        mixed.position.set(1.45, 0, -2.5);
        receiverRoot.add(mixed);

        const wholeReceiverMaterial = new THREE.MeshBasicMaterial({ color: 0x6bb6d8 });
        const wholeReceiverGeometry = new THREE.BoxGeometry(0.55, 0.9, 0.45);
        const wholeReceiver = new THREE.Mesh(wholeReceiverGeometry, wholeReceiverMaterial);
        wholeReceiver.name = 'AoReceiverGenericMetadata';
        wholeReceiver.userData.ambientOcclusionReceiver = 'exclude';
        wholeReceiver.position.set(2.45, 0.45, -2.55);
        receiverRoot.add(wholeReceiver);

        engine.camera.position.set(0, 1.6, 4.2);
        engine.camera.lookAt(0, 1.1, -2.8);
        engine.camera.updateMatrixWorld(true);

        return {
            update() {},
            getMetrics() {
                return {
                    receiverObjects: receiverRoot.children.length,
                    mixedMaterialGroups: mixed.geometry.groups.length,
                    receiversVisible: receiverRoot.visible
                };
            },
            dispose() {
                root.removeFromParent();
                backdropGeometry.dispose?.();
                backdropMaterial.dispose?.();
                groundGeometry.dispose?.();
                groundMaterial.dispose?.();
                occluderGeometry.dispose?.();
                occluderMaterial.dispose?.();
                cardGeometry.dispose?.();
                cutoutMaterial.dispose?.();
                cutoutTexture.dispose?.();
                mixedGeometry.dispose?.();
                mixedOpaqueMaterial.dispose?.();
                wholeReceiverGeometry.dispose?.();
                wholeReceiverMaterial.dispose?.();
            }
        };
    }
};
