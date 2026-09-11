// Checks bounded CPU work and complete shadow coverage for moving rigid geometry.
import { test, expect } from '@playwright/test';

test('Dynamic shadow fitting reuses rigid bounds and refreshes edited or deforming geometry', async ({ page }) => {
    await page.goto('/tests/headless/harness/index.html');
    await page.waitForFunction(() => window.__testHooks?.getEngine());
    const result = await page.evaluate(async () => {
        const THREE = await import('three');
        const { DynamicSunShadowLayer } = await import('/src/graphics/illumination/dynamic_sun_shadow/DynamicSunShadowLayer.js');
        const engine = window.__testHooks.getEngine();
        const geometry = new THREE.SphereGeometry(1, 64, 32), material = new THREE.MeshStandardMaterial();
        const mesh = new THREE.Mesh(geometry, material), root = new THREE.Group();
        root.add(mesh); engine.scene.add(root); mesh.castShadow = true;
        const layer = new DynamicSunShadowLayer(engine.renderer, { mapSize: 64, worldUnitsPerTexel: 0.5 });
        layer.register({ id: 'test.rigid', root }); layer.activate();
        let vertexReads = 0, boxBuilds = 0;
        const vertex = mesh.getVertexPosition, compute = geometry.computeBoundingBox;
        mesh.getVertexPosition = function (...args) { vertexReads++; return vertex.apply(this, args); };
        geometry.computeBoundingBox = function () { boxBuilds++; return compute.call(this); };
        const coversVertices = binding => {
            const point = new THREE.Vector3();
            for (let i = 0; i < geometry.attributes.position.count; i++) {
                vertex.call(mesh, i, point).applyMatrix4(mesh.matrixWorld).applyMatrix4(binding.worldToClip);
                if (Math.max(Math.abs(point.x), Math.abs(point.y), Math.abs(point.z)) > 1.000001) return false;
            }
            return true;
        };
        let covered = true;
        for (let i = 0; i < 12; i++) {
            root.position.set(i * 0.25, 2, 0); root.rotation.y = i * 0.1;
            covered &&= coversVertices(layer.render([0.4, 0.8, 0.4]));
        }
        const rigid = { vertexReads, boxBuilds, covered };
        geometry.attributes.position.setY(0, 3); geometry.attributes.position.needsUpdate = true;
        const editedCovered = coversVertices(layer.render([0.4, 0.8, 0.4]));
        const editedBuilds = boxBuilds;
        geometry.morphAttributes.position = [geometry.attributes.position.clone()];
        geometry.morphAttributes.position[0].setY(0, 5); mesh.updateMorphTargets(); mesh.morphTargetInfluences[0] = 1;
        layer.deactivate(); layer.activate();
        vertexReads = 0;
        const morphCovered = coversVertices(layer.render([0.4, 0.8, 0.4]));
        const morphReads = vertexReads;
        layer.dispose(); root.removeFromParent(); geometry.dispose(); material.dispose();
        return { rigid, editedCovered, editedBuilds, morphCovered, morphReads };
    });
    expect(result.rigid).toEqual({ vertexReads: 0, boxBuilds: 1, covered: true });
    expect(result.editedCovered).toBe(true);
    expect(result.editedBuilds).toBe(2);
    expect(result.morphCovered).toBe(true);
    expect(result.morphReads).toBeGreaterThan(0);
});
