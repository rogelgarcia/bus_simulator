import { test, expect } from '@playwright/test';

test('City input plans preserve reconstructed attributes and cancel before replacing live geometry', async ({ page }) => {
    await page.goto('/tests/headless/harness/index.html');
    const result = await page.evaluate(async () => {
        const THREE = await import('three');
        const { installEnhancedReceiverBindings, installEnhancedReceiverBindingsAsync } = await import('/src/graphics/illumination/receiver_lightmaps/EnhancedReceiverMaterialAdapter.js');
        const { createCityInputPlans, CITY_INPUT_SCHEMA, coplanarInputKey } = await import('/src/app/city/precomputed/CityInputPlans.js');
        const { planReceiverCoplanarOwnership } = await import('/src/app/illumination/receiver_lightmaps/ReceiverCoplanarOwnership.js');
        const positions = new Float32Array([0,0,0, 2,0,0, 0,0,2, 0,0,0, 2,0,0, 0,0,2]);
        const groups = new Int32Array([0,0]), plan = planReceiverCoplanarOwnership(positions, groups);
        const catalog = { schema: CITY_INPUT_SCHEMA, slabs: [], coplanar: [{ key: await coplanarInputKey(positions, groups), patches: [...plan.patches], removedArea: plan.removedArea }] };
        const cache = createCityInputPlans(catalog);
        const mapping = () => ({ profile: { irradianceRepresentation: 'surface-diffuse-v1' }, objects: [{ id: 'mesh', base: 0, referenceCount: 6 }] });
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions,3));
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0,0,1,0,0,1,0,0,1,0,0,1],2));
        geometry.computeVertexNormals();
        const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
        const refs = new Map([['mesh',mesh]]), coords = Float32Array.from({length:24}, (_,i) => i % 4 === 3 ? 1 : .25);
        const describe = g => JSON.stringify({ groups:g.groups, index:g.index?.array, attributes:Object.fromEntries(Object.entries(g.attributes).map(([k,a])=>[k,[...a.array]])) });
        const original = installEnhancedReceiverBindings(mapping(),refs,{},coords), expected = describe(mesh.geometry);
        original.restore();
        const cached = await installEnhancedReceiverBindingsAsync(mapping(),refs,{},coords,new AbortController().signal,cache);
        const actual = describe(mesh.geometry), coverage = cached.coverage;
        cached.restore();
        const controller = new AbortController();
        const pending = { ...cache, async coplanar(...args) { const value = await cache.coplanar(...args); controller.abort(); return value; } };
        let aborted = false;
        try { await installEnhancedReceiverBindingsAsync(mapping(),refs,{},coords,controller.signal,pending); }
        catch (error) { aborted = error.name === 'AbortError'; }
        const restored = mesh.geometry === geometry;
        geometry.dispose(); mesh.material.dispose();
        return { expected, actual, coverage, aborted, restored, hits:cache.diagnostics().coplanarHits };
    });
    expect(result.actual).toBe(result.expected);
    expect(result.coverage.overlappingTriangles).toBe(1);
    expect(result.coverage.removedOverlapArea).toBe(2);
    expect(result.aborted).toBe(true);
    expect(result.restored).toBe(true);
    expect(result.hits).toBe(2);
});
