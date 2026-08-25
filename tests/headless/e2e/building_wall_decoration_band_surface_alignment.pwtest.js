// Headless browser tests: band wall decorations must lie flat on the surface
// they decorate, including the derived surfaces of a recessed bay.
//
// Regression guard for AI 494: at a building corner the decoration emitter
// reversed the along-wall axis without reversing the outward normal, which made
// the (U, up, N) triple a reflection. `Quaternion.setFromRotationMatrix`
// returns garbage for reflections — the identity, for these axis-aligned
// facades — so the band on the corner bay of faces B/C/D rendered with the
// world basis instead of its own: a panel sticking straight out of the wall
// like a fin.
//
// Also covers the `inheritOnDerivedSurfaces` flag: bands turn onto the connector
// walls a bay recession generates (owned by the proud side of the step), or stop
// at the recess edge when off.
//
// Runs in the browser rather than node because `three` is CDN-only here (see
// the import map in index.html); there is no local node_modules/three.
import test, { expect } from '@playwright/test';

// Catalog buildings whose ground floor carries band decorations (simple_skirt /
// angled_support_profile) on bays that reach a building corner.
const BUILDING_IDS = ['stone_lowrise_2', 'mainstreet_block', 'gov_center_2', 'beige_1'];
const BAND_GEOMETRY_KINDS = ['flat_panel', 'angled_support_profile'];
// Ground floor of stone_lowrise_2: piers carry the bands, the door and window
// bays between them are recessed.
const RECESS_BUILDING_ID = 'stone_lowrise_2';

async function bootHarness(page) {
    await page.goto('/tests/headless/harness/index.html?ibl=0&bloom=0');
    await page.waitForFunction(() => window.__testHooks && window.__testHooks.version === 1);
}

/**
 * Build one showcase building unmerged (merging bakes transforms away, and this
 * test is about the transforms) and report, per band decoration mesh, its world
 * outward normal plus how far the wall behind it is.
 */
async function inspectBands(page, buildingId, { bandKinds = BAND_GEOMETRY_KINDS, configOverrides = null } = {}) {
    return page.evaluate(async (args) => {
        const THREE = await import('three');
        await window.__testHooks.loadScenario('building_showcase', {
            seed: 'showcase',
            buildingId: args.buildingId,
            mergeBuildingGeometry: false,
            configOverrides: args.configOverrides
        });
        window.__testHooks.setFixedDt(1 / 60);
        window.__testHooks.step(2, { render: true });

        const engine = window.__testHooks.getEngine();
        const building = engine.scene.getObjectByName(`showcase_${args.buildingId}`);
        if (!building) throw new Error(`building group showcase_${args.buildingId} not found`);
        building.updateMatrixWorld(true);

        const bandKinds = new Set(args.bandKinds);
        const walls = [];
        const bands = [];
        building.traverse((o) => {
            if (!o.isMesh) return;
            if (o.userData?.buildingFab2Role === 'wall_decoration') {
                if (bandKinds.has(o.userData.geometryKind)) bands.push(o);
                return;
            }
            walls.push(o);
        });

        const center = new THREE.Vector3();
        const normal = new THREE.Vector3();
        const quaternion = new THREE.Quaternion();
        const raycaster = new THREE.Raycaster();
        raycaster.far = 1.5;

        const rows = [];
        for (const mesh of bands) {
            mesh.geometry.computeBoundingBox();
            mesh.geometry.boundingBox.getCenter(center);
            center.applyMatrix4(mesh.matrixWorld);
            mesh.getWorldQuaternion(quaternion);
            normal.set(0, 0, 1).applyQuaternion(quaternion).normalize();

            raycaster.set(center.clone().addScaledVector(normal, 0.6), normal.clone().multiplyScalar(-1));
            const hit = raycaster.intersectObjects(walls, false)[0] ?? null;

            // Both facade directions are axis-aligned here, so the panel's run
            // length is whichever horizontal extent is the long one.
            const size = mesh.geometry.boundingBox.getSize(new THREE.Vector3());
            size.applyQuaternion(quaternion);

            rows.push({
                runLengthMeters: Math.max(Math.abs(size.x), Math.abs(size.z)),
                layerId: mesh.userData.layerId ?? '',
                bayRef: mesh.userData.bayRef ?? '',
                faceId: String(mesh.userData.bayRef ?? '').split(':')[0] ?? '',
                geometryKind: mesh.userData.geometryKind ?? '',
                derivedSurface: mesh.userData.derivedSurface ?? null,
                center: [center.x, center.y, center.z],
                normal: [normal.x, normal.y, normal.z],
                backingDistance: hit ? hit.distance : null
            });
        }
        return rows;
    }, { buildingId, bandKinds, configOverrides });
}

function formatRow(row) {
    const n = row.normal.map((v) => v.toFixed(2)).join(',');
    const c = row.center.map((v) => v.toFixed(2)).join(',');
    const derived = row.derivedSurface ? ` [${row.derivedSurface}]` : '';
    return `${row.layerId} ${row.bayRef} ${row.geometryKind}${derived} center=(${c}) normal=(${n})`;
}

test.describe('wall decoration bands lie flat on their surface', () => {
    for (const buildingId of BUILDING_IDS) {
        test(`${buildingId}: every band panel is backed by wall`, async ({ page }) => {
            await bootHarness(page);
            const rows = await inspectBands(page, buildingId);
            expect(rows.length, `${buildingId} should emit band decorations`).toBeGreaterThan(10);

            // A band offset ~0.05m off its wall must find that wall right behind
            // it. A panel rotated out of plane finds nothing (or something far
            // away) and fails here.
            const floating = rows.filter((row) => {
                const distance = row.backingDistance;
                return !(Number.isFinite(distance) && distance > 0.3 && distance < 0.95);
            });
            expect(floating.map(formatRow), 'band panels with no wall behind them').toEqual([]);
        });

        test(`${buildingId}: bands sit square to the surface they decorate`, async ({ page }) => {
            await bootHarness(page);
            const rows = await inspectBands(page, buildingId);
            expect(rows.length).toBeGreaterThan(10);

            // Catalog footprints are rectangles, so every band on a face plane of
            // a given layer shares one outward normal — the corner bays are the
            // ones that used to break this. Bands on a recess return face along
            // the wall instead, exactly perpendicular to it.
            const byFace = new Map();
            for (const row of rows) {
                if (row.derivedSurface === 'return') continue;
                const key = `${row.layerId}|${row.faceId}`;
                const bucket = byFace.get(key) ?? [];
                bucket.push(row);
                byFace.set(key, bucket);
            }
            expect(byFace.size, 'bands should cover several faces').toBeGreaterThan(1);

            const faceNormalByKey = new Map();
            const misaligned = [];
            for (const [key, bucket] of byFace) {
                // The majority normal is the face's; anything not parallel to it
                // is rotated out of plane.
                const counts = new Map();
                for (const row of bucket) {
                    const k = row.normal.map((v) => Math.round(v * 1000)).join(',');
                    counts.set(k, (counts.get(k) ?? 0) + 1);
                }
                let bestKey = null;
                let bestCount = -1;
                for (const [k, count] of counts) {
                    if (count > bestCount) {
                        bestCount = count;
                        bestKey = k;
                    }
                }
                const expected = bestKey.split(',').map((v) => Number(v) / 1000);
                faceNormalByKey.set(key, expected);
                for (const row of bucket) {
                    const dot = row.normal[0] * expected[0] + row.normal[1] * expected[1] + row.normal[2] * expected[2];
                    if (dot < 0.999) misaligned.push(`${key}: ${formatRow(row)}`);
                }
            }
            expect(misaligned, 'band panels rotated out of their face plane').toEqual([]);

            const skewedReturns = [];
            for (const row of rows) {
                if (row.derivedSurface !== 'return') continue;
                const expected = faceNormalByKey.get(`${row.layerId}|${row.faceId}`);
                if (!expected) continue;
                const dot = row.normal[0] * expected[0] + row.normal[1] * expected[1] + row.normal[2] * expected[2];
                if (Math.abs(dot) > 0.001) skewedReturns.push(formatRow(row));
            }
            expect(skewedReturns, 'return bands not square to their face').toEqual([]);
        });
    }

    test('a reversed along-wall axis mirrors the spec instead of reflecting the basis', async ({ page }) => {
        await bootHarness(page);
        const result = await page.evaluate(async () => {
            const THREE = await import('three');
            const { resolveWallDecoratorSurfacePlacement } = await import(
                '/src/graphics/gui/shared/wall_decorator/WallDecoratorPlacement.js'
            );
            const up = new THREE.Vector3(0, 1, 0);
            // Face B of an axis-aligned footprint: tangent -z, outward normal +x.
            const tangent = new THREE.Vector3(0, 0, -1);
            const normal = new THREE.Vector3(1, 0, 0);
            const spec = { centerU: 0.4, yawDegrees: 0 };

            const round = (v) => Math.round(v * 1000) / 1000 + 0;
            const place = (uAxis) => {
                const placement = resolveWallDecoratorSurfacePlacement({ spec, uAxis, nAxis: normal, up });
                const localX = new THREE.Vector3(1, 0, 0).applyQuaternion(placement.quaternion);
                const localZ = new THREE.Vector3(0, 0, 1).applyQuaternion(placement.quaternion);
                // Where the mesh actually lands, and where the caller asked it to.
                const offset = placement.uAxis.clone().multiplyScalar(placement.spec.centerU);
                const requested = uAxis.clone().normalize().multiplyScalar(spec.centerU);
                return {
                    mirrored: placement.mirrored,
                    centerU: placement.spec.centerU,
                    localX: localX.toArray().map(round),
                    localZ: localZ.toArray().map(round),
                    offset: offset.toArray().map(round),
                    requested: requested.toArray().map(round)
                };
            };
            return {
                forward: place(tangent.clone()),
                reversed: place(tangent.clone().multiplyScalar(-1))
            };
        });

        // Forward: the basis is already right-handed, so nothing is mirrored.
        expect(result.forward.mirrored).toBe(false);
        expect(result.forward.localX).toEqual([0, 0, -1]);
        expect(result.forward.localZ).toEqual([1, 0, 0]);

        // Reversed: the rotation still points the panel out of the wall (+x) and
        // keeps the along-wall axis in the wall plane. Before AI 494 this basis
        // was a reflection and collapsed to the identity, pointing the panel
        // along +z — out of the wall.
        expect(result.reversed.mirrored).toBe(true);
        expect(result.reversed.localZ).toEqual([1, 0, 0]);
        expect(result.reversed.localX).toEqual([0, 0, -1]);
        // Mirroring `centerU` alongside the axis puts the piece exactly where
        // the reversed axis asked for, on both sides.
        expect(result.reversed.centerU).toBeCloseTo(-result.forward.centerU, 6);
        expect(result.reversed.offset).toEqual(result.reversed.requested);
        expect(result.forward.offset).toEqual(result.forward.requested);
    });

    test('bands turn onto the connector walls of a bay recession', async ({ page }) => {
        await bootHarness(page);
        const rows = await inspectBands(page, RECESS_BUILDING_ID);
        const derived = rows.filter((row) => row.derivedSurface);
        expect(derived.length, 'band segments on recess connector walls').toBeGreaterThan(0);

        // Connector walls are the only derived surface a decoration may claim: a
        // neighbouring bay front has a bay id, so it is authorable and must be
        // targeted explicitly.
        expect([...new Set(derived.map((row) => row.derivedSurface))]).toEqual(['return']);

        // The band turns the corner as an L: a connector panel is only as long as
        // its recession is deep, plus the one offset that closes the joint. The
        // deepest recession on this ground floor is 0.30m, and the band's own
        // offset is 0.045m — anything much past that is overhanging the corner,
        // which is what a 0.5m minimum wall width used to produce.
        const overhanging = derived.filter((row) => row.runLengthMeters > 0.30 + 0.06);
        expect(
            overhanging.map((row) => `${formatRow(row)} runLength=${row.runLengthMeters.toFixed(3)}`),
            'connector bands longer than their recession'
        ).toEqual([]);
    });

    test('only the proud side of a step claims the connector wall', async ({ page }) => {
        await bootHarness(page);
        // Re-target the same decorations at the recessed bays instead of the
        // piers. The piers are still the proud side of every step, so nothing
        // may claim a connector.
        const configOverrides = await page.evaluate(async (buildingId) => {
            const { getBuildingConfigById } = await import('/src/graphics/content3d/catalogs/BuildingConfigCatalog.js');
            const wallDecorations = JSON.parse(JSON.stringify(getBuildingConfigById(buildingId).wallDecorations));
            const recessed = ['A:bay_2', 'A:bay_4', 'B:bay_2', 'B:bay_4', 'C:bay_2', 'C:bay_4', 'D:bay_2', 'D:bay_4'];
            for (const set of wallDecorations.sets ?? []) {
                set.target = { ...set.target, bayRefs: recessed, allBays: false };
                for (const decoration of set.decorations ?? []) {
                    if (decoration.autoCorner) decoration.autoCorner = { ...decoration.autoCorner, resolvedBayRefs: recessed };
                }
            }
            return { wallDecorations };
        }, RECESS_BUILDING_ID);

        const rows = await inspectBands(page, RECESS_BUILDING_ID, { configOverrides });
        expect(rows.length, 'the recessed bays should still carry their own bands').toBeGreaterThan(10);
        expect(rows.filter((row) => row.derivedSurface).map(formatRow), 'connectors claimed from the recessed side').toEqual([]);
    });

    test('bands stop at the recess edge when inheritOnDerivedSurfaces is off', async ({ page }) => {
        await bootHarness(page);
        const configOverrides = await page.evaluate(async (buildingId) => {
            const { getBuildingConfigById } = await import('/src/graphics/content3d/catalogs/BuildingConfigCatalog.js');
            const wallDecorations = JSON.parse(JSON.stringify(getBuildingConfigById(buildingId).wallDecorations));
            for (const set of wallDecorations.sets ?? []) {
                for (const decoration of set.decorations ?? []) decoration.inheritOnDerivedSurfaces = false;
            }
            return { wallDecorations };
        }, RECESS_BUILDING_ID);

        const off = await inspectBands(page, RECESS_BUILDING_ID, { configOverrides });
        expect(off.length, 'bands should still render on their own bays').toBeGreaterThan(10);
        expect(off.filter((row) => row.derivedSurface).map(formatRow), 'derived band segments with the flag off').toEqual([]);

        // Turning it off must only drop the derived segments: the decoration
        // still covers exactly the same bays. (The panels touching a recess do
        // shift by half the band offset, because with the flag on they grow to
        // butt against the return.)
        const on = await inspectBands(page, RECESS_BUILDING_ID);
        const key = (row) => `${row.layerId}|${row.bayRef}|${row.geometryKind}`;
        expect(off.map(key).sort()).toEqual(on.filter((row) => !row.derivedSurface).map(key).sort());
    });
});
