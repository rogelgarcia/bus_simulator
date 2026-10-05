// Verifies the Inspector refits mature models once after asynchronous readiness.
import test, { expect } from '@playwright/test';

test('Inspector: loaded mature vegetation fits the viewport and retains paired leaf sides', async ({ page }) => {
    await page.goto('/tests/headless/harness/index.html?ibl=0&bloom=0');
    await page.waitForFunction(() => window.__testHooks?.version === 1);
    const result = await page.evaluate(async () => {
        const THREE = await import('three');
        const { InspectorRoomView } = await import('/src/graphics/gui/inspector_room/InspectorRoomView.js');
        const { InspectorRoomScene } = await import('/src/graphics/gui/inspector_room/InspectorRoomScene.js');
        const { applyInspectorTreeMaterials, tagInspectorTreeMaterialRoles } = await import('/src/graphics/gui/inspector_room/InspectorRoomTreeMaterialUtils.js');
        const engine = window.__testHooks.getEngine();
        const camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 1000);
        camera.position.set(0, 3, 10);
        const room = new InspectorRoomScene({ ...engine, camera });
        room.update = () => {};
        room.controls = {
            enabled: true,
            setOrbit() {},
            setLookAt({ position, target }) {
                camera.position.copy(position);
                camera.lookAt(target);
                camera.updateMatrixWorld(true);
            }
        };
        const bounds = new THREE.Box3(new THREE.Vector3(-8, 0, -6), new THREE.Vector3(8, 20, 6));
        const sphere = bounds.getBoundingSphere(new THREE.Sphere());
        const root = new THREE.Group();
        root.userData._meshInspectorNeedsFocusRefresh = true;
        const view = Object.create(InspectorRoomView.prototype);
        view.room = room;
        view._active = { getMeasurementObject3d: () => root, getFocusBounds: () => sphere };
        view.meshes = { update() {} };
        view.textures = { update() {} };
        view._updateCameraFromKeys = () => {};
        view._syncLightMapBasis = () => {};
        view._syncViewportOverlays = () => {};
        view.update(0);
        room._tickCameraTween(1);
        const projectedCorners = [];
        for (const x of [-8, 8]) for (const y of [0, 20]) for (const z of [-6, 6]) {
            projectedCorners.push(new THREE.Vector3(x, y, z).project(camera).toArray());
        }
        camera.position.set(100, 80, 100);
        view.update(0);
        const userPoseRetained = camera.position.equals(new THREE.Vector3(100, 80, 100)) && room._cameraTween === null;
        const leaf = new THREE.MeshStandardMaterial({ name: 'foliage', side: THREE.FrontSide });
        leaf.shadowSide = THREE.FrontSide;
        leaf.userData.preserveShadowSide = true;
        const trunk = new THREE.MeshStandardMaterial({ name: 'bark' });
        const solid = new THREE.MeshStandardMaterial();
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(), leaf);
        root.add(mesh);
        tagInspectorTreeMaterialRoles(root, { sharedLeaf: leaf, sharedTrunk: trunk });
        applyInspectorTreeMaterials(root, { mode: 'solid', leaf, trunk, solid });
        applyInspectorTreeMaterials(root, { mode: 'semantic', leaf, trunk, solid, wireframe: true });
        return {
            radius: room._focus.radius,
            expectedRadius: sphere.radius,
            consumed: root.userData._meshInspectorNeedsFocusRefresh === false,
            projectedCorners,
            userPoseRetained,
            leaf: { identity: mesh.material === leaf, side: mesh.material.side, shadowSide: mesh.material.shadowSide, preserveShadowSide: mesh.material.userData.preserveShadowSide }
        };
    });
    expect(result.radius).toBeCloseTo(result.expectedRadius, 8);
    expect(result.consumed).toBe(true);
    for (const corner of result.projectedCorners) {
        expect(Math.abs(corner[0])).toBeLessThan(1);
        expect(Math.abs(corner[1])).toBeLessThan(1);
        expect(corner[2]).toBeGreaterThan(-1);
        expect(corner[2]).toBeLessThan(1);
    }
    expect(result.userPoseRetained).toBe(true);
    expect(result.leaf).toEqual({ identity: true, side: 0, shadowSide: 0, preserveShadowSide: true });
});
