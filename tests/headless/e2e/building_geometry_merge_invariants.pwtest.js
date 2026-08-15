// Headless browser tests: merging a fabricated building's geometry must be a
// pure draw-call optimisation — same triangles, same world-space geometry, same
// materials, with groups that carry userData left intact.
//
// Runs in the browser rather than node because `three` is CDN-only here (see the
// import map in index.html); there is no local node_modules/three to import.
//
// Note: only geometry/material facts are asserted, never pixels. A scenario's
// first build in a fresh page renders differently from later builds (cold
// caches), so pixel comparisons across builds are not meaningful without a
// discarded warm-up build.
import test, { expect } from '@playwright/test';

const BUILDING_ID = 'stone_lowrise_2';
const ENTRY_NAME = `showcase_${BUILDING_ID}`;

async function bootHarness(page) {
    await page.goto('/tests/headless/harness/index.html?ibl=0&bloom=0');
    await page.waitForFunction(() => window.__testHooks && window.__testHooks.version === 1);
}

/**
 * Build the showcase for one building and report geometry/material facts about
 * the resulting group, in world space so merged and unmerged are comparable.
 */
async function buildAndInspect(page, { merge, buildingId, entryName }) {
    return page.evaluate(async (args) => {
        const THREE = await import('three');
        await window.__testHooks.loadScenario('building_showcase', {
            seed: 'showcase',
            buildingId: args.buildingId,
            mergeBuildingGeometry: args.merge
        });
        window.__testHooks.setFixedDt(1 / 60);
        window.__testHooks.step(3, { render: true });

        const engine = window.__testHooks.getEngine();
        const group = engine.scene.getObjectByName(args.entryName);
        if (!group) throw new Error(`building group ${args.entryName} not found`);
        group.updateMatrixWorld(true);

        const v = new THREE.Vector3();
        const n = new THREE.Vector3();
        const nm = new THREE.Matrix3();
        let meshes = 0;
        let triangles = 0;
        let vertices = 0;
        let sx = 0, sy = 0, sz = 0;
        let nx = 0, ny = 0, nz = 0;
        const bounds = {
            minX: Infinity, maxX: -Infinity,
            minY: Infinity, maxY: -Infinity,
            minZ: Infinity, maxZ: -Infinity
        };
        const materialUuids = new Set();
        const shaderHookMaterials = new Set();

        group.traverse((o) => {
            if (!o.isMesh) return;
            meshes += 1;

            const geometry = o.geometry;
            const position = geometry?.getAttribute?.('position');
            const normal = geometry?.getAttribute?.('normal');
            if (!position) return;

            const index = geometry.index;
            triangles += index ? index.count / 3 : position.count / 3;
            vertices += position.count;

            nm.getNormalMatrix(o.matrixWorld);
            for (let i = 0; i < position.count; i += 1) {
                v.fromBufferAttribute(position, i).applyMatrix4(o.matrixWorld);
                sx += v.x; sy += v.y; sz += v.z;
                if (v.x < bounds.minX) bounds.minX = v.x;
                if (v.x > bounds.maxX) bounds.maxX = v.x;
                if (v.y < bounds.minY) bounds.minY = v.y;
                if (v.y > bounds.maxY) bounds.maxY = v.y;
                if (v.z < bounds.minZ) bounds.minZ = v.z;
                if (v.z > bounds.maxZ) bounds.maxZ = v.z;
                if (normal) {
                    n.fromBufferAttribute(normal, i).applyMatrix3(nm).normalize();
                    nx += n.x; ny += n.y; nz += n.z;
                }
            }

            const materials = Array.isArray(o.material) ? o.material : [o.material];
            for (const m of materials) {
                if (!m) continue;
                materialUuids.add(m.uuid);
                const proto = Object.getPrototypeOf(m) ?? null;
                if (proto && typeof m.onBeforeCompile === 'function' && m.onBeforeCompile !== proto.onBeforeCompile) {
                    shaderHookMaterials.add(m.uuid);
                }
            }
        });

        // Groups carrying userData must survive the pass as their own containers.
        const userDataGroups = [];
        group.traverse((o) => {
            if (o === group || !o.isGroup) return;
            if (o.userData && Object.keys(o.userData).length > 0) {
                userDataGroups.push({ name: o.name || '(unnamed)', keys: Object.keys(o.userData).sort() });
            }
        });

        const round = (value, places = 3) => {
            const f = 10 ** places;
            return Math.round(value * f) / f;
        };

        return {
            meshes,
            triangles: Math.round(triangles),
            vertices,
            centroid: [round(sx / vertices), round(sy / vertices), round(sz / vertices)],
            averageWorldNormal: [round(nx / vertices), round(ny / vertices), round(nz / vertices)],
            bounds: {
                x: [round(bounds.minX), round(bounds.maxX)],
                y: [round(bounds.minY), round(bounds.maxY)],
                z: [round(bounds.minZ), round(bounds.maxZ)]
            },
            materialCount: materialUuids.size,
            shaderHookMaterialCount: shaderHookMaterials.size,
            shaderHookMaterialUuids: [...shaderHookMaterials].sort(),
            userDataGroups: userDataGroups.sort((a, b) => a.name.localeCompare(b.name))
        };
    }, { merge, buildingId, entryName });
}

test('Building geometry merge preserves geometry, materials and userData groups', async ({ page }) => {
    test.setTimeout(240_000);
    await bootHarness(page);

    const unmerged = await buildAndInspect(page, { merge: false, buildingId: BUILDING_ID, entryName: ENTRY_NAME });
    const merged = await buildAndInspect(page, { merge: true, buildingId: BUILDING_ID, entryName: ENTRY_NAME });

    // The pass must actually do something worth the complexity.
    expect(unmerged.meshes).toBeGreaterThan(200);
    expect(merged.meshes).toBeLessThan(unmerged.meshes / 4);

    // Same geometry, in the same place: merging bakes transforms into the
    // vertices, so world-space facts must be identical, not merely similar.
    expect(merged.triangles).toBe(unmerged.triangles);
    expect(merged.vertices).toBe(unmerged.vertices);
    expect(merged.centroid).toEqual(unmerged.centroid);
    expect(merged.averageWorldNormal).toEqual(unmerged.averageWorldNormal);
    expect(merged.bounds).toEqual(unmerged.bounds);

    // Materials that inject custom shader code (wall UV tiling / material
    // variation) can depend on captured state we cannot compare, so they must
    // never be deduplicated away. Compare counts, not uuids: every build creates
    // fresh material instances with fresh uuids.
    expect(merged.shaderHookMaterialCount).toBe(unmerged.shaderHookMaterialCount);
    expect(merged.materialCount).toBeLessThanOrEqual(unmerged.materialCount);

    // Groups carrying userData drive runtime lookups (e.g. the windows group and
    // its buildingWindowVisuals), so the pass must not flatten them away.
    expect(merged.userDataGroups).toEqual(unmerged.userDataGroups);
});

test('Building geometry merge can be disabled for authoring paths', async ({ page }) => {
    test.setTimeout(240_000);
    await bootHarness(page);

    const off = await buildAndInspect(page, { merge: false, buildingId: BUILDING_ID, entryName: ENTRY_NAME });
    const offAgain = await buildAndInspect(page, { merge: false, buildingId: BUILDING_ID, entryName: ENTRY_NAME });

    // Opting out must leave the individual meshes that bay/decoration pickers
    // rely on, and must be stable across rebuilds.
    expect(off.meshes).toBe(offAgain.meshes);
    expect(off.meshes).toBeGreaterThan(200);
});
