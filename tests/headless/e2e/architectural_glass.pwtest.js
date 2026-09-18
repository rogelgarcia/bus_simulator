// Architectural settings survive serialization and keep curved panes thin with coherent normals.
import test, { expect } from '@playwright/test';

test('Architectural glass: dielectric composition, persistence, geometry and legacy isolation', async ({ page }) => {
    await page.goto('/tests/headless/harness/index.html');
    const result = await page.evaluate(async () => {
        const THREE = await import('three');
        const { sanitizeWindowMeshSettings } = await import('/src/app/buildings/window_mesh/WindowMeshSettings.js');
        const { createWindowMeshMaterials } = await import('/src/graphics/engine3d/buildings/window_mesh/WindowMeshMaterials.js');
        const { bendWindowGeometryToArc } = await import('/src/graphics/engine3d/buildings/window_mesh/WindowMeshCurveGeometry.js');
        const { getBuildingConfigById } = await import('/src/graphics/content3d/catalogs/BuildingConfigCatalog.js');
        const { computeMaterialIdentityKey } = await import('/src/graphics/assets3d/generators/building_fabrication/BuildingGeometryMerger.js');
        const { applyBuildingWindowVisualsToCityMeshes } = await import('/src/graphics/visuals/buildings/BuildingWindowVisualsRuntime.js');
        const rows = [];
        for (const id of ['burban', 'bglass', 'terramar']) for (const definition of getBuildingConfigById(id).windowDefinitions.items) {
            const settings = sanitizeWindowMeshSettings(JSON.parse(JSON.stringify(definition.settings)));
            if (settings.glass.reflection.coatingReflectance == null) continue;
            const bundle = createWindowMeshMaterials(settings), mat = bundle.glassMat;
            const group = new THREE.Group(); group.name = 'windows'; group.add(new THREE.Mesh(new THREE.PlaneGeometry(), mat));
            applyBuildingWindowVisualsToCityMeshes(group, { reflective: { glass: { metalness: .9 } } });
            const shader = { vertexShader: THREE.ShaderLib.physical.vertexShader, fragmentShader: THREE.ShaderLib.physical.fragmentShader, uniforms: {} };
            mat.onBeforeCompile(shader);
            rows.push({ id, metalness: mat.metalness, transmission: mat.transmission, opacity: mat.opacity, thickness: mat.thickness,
                transparent: mat.transparent, depthWrite: mat.depthWrite, f0: shader.uniforms.architecturalGlassF0.value,
                authoredF0: definition.settings.glass.reflection.coatingReflectance, patched: shader.fragmentShader.includes('material.specularColor = vec3( architecturalGlassF0 )') });
            group.children[0].geometry.dispose(); Object.values(bundle).forEach(m => m.dispose());
        }
        const low = createWindowMeshMaterials({ glass: { reflection: { coatingReflectance: .043 } } });
        const high = createWindowMeshMaterials({ glass: { reflection: { coatingReflectance: .22 } } });
        const distinctCoatings = computeMaterialIdentityKey(low.glassMat) !== computeMaterialIdentityKey(high.glassMat);
        const legacy = createWindowMeshMaterials({ glass: { opacity: .7, reflection: { metalness: .6, transmission: .4 } } });
        const geometry = new THREE.PlaneGeometry(5, 3), bent = bendWindowGeometryToArc(geometry, { centerZ: -12, segments: 16 });
        let maxRadialError = 0, maxNormalError = 0, maxNormalAngleError = 0;
        const p = bent.attributes.position, n = bent.attributes.normal;
        for (let i = 0; i < p.count; i++) {
            const x = p.getX(i), z = p.getZ(i) + 12;
            maxRadialError = Math.max(maxRadialError, Math.abs(Math.hypot(x, z) - 12));
            maxNormalError = Math.max(maxNormalError, Math.abs(Math.hypot(n.getX(i), n.getY(i), n.getZ(i)) - 1));
            maxNormalAngleError = Math.max(maxNormalAngleError, Math.abs(n.getX(i) - x / 12), Math.abs(n.getZ(i) - z / 12));
        }
        const legacyState = { opacity: legacy.glassMat.opacity, metalness: legacy.glassMat.metalness, thickness: legacy.glassMat.thickness };
        geometry.dispose(); bent.dispose();
        for (const bundle of [low, high, legacy]) Object.values(bundle).forEach(m => m.dispose());
        return { rows, distinctCoatings, legacyState, maxRadialError, maxNormalError, maxNormalAngleError };
    });
    expect(result.rows.length).toBeGreaterThan(10);
    for (const row of result.rows) {
        expect(row).toMatchObject({ metalness: 0, transmission: 1, opacity: 1, thickness: 0, transparent: false, depthWrite: true, patched: true });
        expect(row.f0).toBe(row.authoredF0);
    }
    expect(result.distinctCoatings).toBe(true);
    expect(result.legacyState).toEqual({ opacity: .7, metalness: .6, thickness: .01 });
    expect(result.maxRadialError).toBeLessThan(1e-5);
    expect(result.maxNormalError).toBeLessThan(1e-6);
    expect(result.maxNormalAngleError).toBeLessThan(1e-6);
});
