// Audits the real bus underside and the chassis contact footprint at different headings.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
test.use({ launchOptions: { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--use-angle=d3d11'] } });
test('City bus underside geometry and contact footprint cover the chassis when turned', async ({ page }) => {
    test.setTimeout(120000);
    await page.goto('/tests/headless/harness/index.html');
    const audit = await page.evaluate(async () => {
        const T = await import('three');
        const { createCityBus } = await import('/src/graphics/assets3d/models/buses/CityBus.js');
        const { BusContactShadowRig } = await import('/src/graphics/visuals/vehicles/BusContactShadowRig.js');
        const bus = createCityBus({ id: 'underside-audit' }); await bus.userData.readyPromise;
        bus.updateMatrixWorld(true);
        const bounds = new T.Box3().setFromObject(bus), size = bounds.getSize(new T.Vector3());
        const rays = [], ray = new T.Raycaster();
        for (const x of [-.6, 0, .6]) for (const z of [-.35, -.175, 0, .175, .35]) {
            ray.set(new T.Vector3(x, bounds.min.y - .2, z * size.z), new T.Vector3(0, 1, 0));
            const hits = ray.intersectObject(bus, true);
            rays.push({ x, z: z * size.z, hits: hits.slice(0, 3).map(h => ({ y: h.point.y, name: h.object.name, normal: h.face.normal.toArray() })) });
        }
        const scene = new T.Scene(), anchor = new T.Group(); anchor.add(bus); scene.add(anchor);
        const ground = new T.Mesh(new T.PlaneGeometry(100, 100), new T.MeshStandardMaterial());
        ground.rotation.x = -Math.PI / 2; ground.position.y = bounds.min.y; scene.add(ground); scene.updateMatrixWorld(true);
        const rig = new BusContactShadowRig({ enabled: true, settings: { intensity: .55, radius: .99, softness: .59, maxDistance: .89 } });
        scene.add(rig.group); rig.setTarget(bus); rig.setRaycastRoot(ground);
        const poses = [];
        for (const yaw of [0, Math.PI / 4, Math.PI / 2]) {
            bus.rotation.y = yaw; scene.updateMatrixWorld(true); rig.update(1);
            const chassis = rig._blobs.find(b => b.kind === 'chassis');
            const axis = new T.Vector3(0, 0, 1).applyQuaternion(chassis.mesh.quaternion);
            const forward = new T.Vector3(0, 0, 1).transformDirection(bus.matrixWorld);
            poses.push({ yaw, agreement: Math.abs(axis.dot(forward)), visible: chassis.mesh.visible, length: chassis.mesh.scale.z, width: chassis.mesh.scale.x });
        }
        rig.dispose(); return { bounds: [bounds.min.toArray(), bounds.max.toArray()], size: size.toArray(), rays, poses };
    });
    const root = path.resolve('tests/artifacts/screens/illumination_534'); await mkdir(root, { recursive: true });
    await writeFile(path.join(root, 'bus-underside-audit.json'), JSON.stringify(audit, null, 2));
    for (const ray of audit.rays) {
        expect(ray.hits.length).toBeGreaterThan(0);
        expect(ray.hits[0].normal[1]).toBeLessThan(-.99);
        expect(ray.hits[0].y-audit.bounds[0][1]).toBeLessThan(.4);
    }
    for (const pose of audit.poses) {
        expect(pose.visible).toBe(true);
        expect(pose.agreement).toBeGreaterThan(.999);
        expect(pose.length).toBeGreaterThan(audit.size[2] * .9);
    }
});
