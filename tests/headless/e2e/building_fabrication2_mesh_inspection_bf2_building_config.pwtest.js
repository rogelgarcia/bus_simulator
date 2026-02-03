// Headless browser tests: BF2 mesh inspection for a multi-bay facade config.
import test, { expect } from '@playwright/test';

test.setTimeout(120_000);

async function attachFailFastConsole({ page }) {
    const errors = [];
    await page.addInitScript(() => {
        window.__e2eErrors = [];
        window.addEventListener('unhandledrejection', (e) => {
            const msg = e?.reason?.message ?? String(e?.reason ?? 'unhandledrejection');
            window.__e2eErrors.push({ kind: 'unhandledrejection', message: msg });
        });
    });
    page.on('pageerror', (err) => {
        errors.push({ kind: 'pageerror', message: err?.message ?? String(err) });
    });
    page.on('console', (msg) => {
        if (msg.type() !== 'error') return;
        const text = msg.text();
        const allow = [
            'ResizeObserver loop limit exceeded'
        ];
        if (allow.some((s) => text.includes(s))) return;
        errors.push({ kind: 'console.error', message: text });
    });
    page.on('requestfailed', (req) => {
        const type = req.resourceType();
        if (type !== 'script' && type !== 'document') return;
        errors.push({ kind: 'requestfailed', message: `${req.url()} (${type})` });
    });
    page.on('response', (res) => {
        const req = res.request();
        const type = req.resourceType();
        if (type !== 'script' && type !== 'document') return;
        const status = res.status();
        if (status < 400) return;
        errors.push({ kind: 'http', message: `${status} ${res.url()} (${type})` });
    });
    return async () => {
        const fromPage = await page.evaluate(() => Array.isArray(window.__e2eErrors) ? window.__e2eErrors : []);
        return [...errors, ...fromPage];
    };
}

const BF2_BUILDING_BUILDING_CONFIG = Object.freeze({
    id: 'bf2_building',
    name: 'Building',
    layers: [
        {
            id: 'floor_70',
            type: 'floor',
            floors: 4,
            floorHeight: 4.2,
            planOffset: 0,
            style: 'default',
            material: { kind: 'texture', id: 'default' },
            wallBase: { tintHex: 0xffffff, roughness: 0.85, normalStrength: 0.9 },
            tiling: {
                enabled: false,
                tileMeters: 2,
                tileMetersU: 2,
                tileMetersV: 2,
                uvEnabled: false,
                offsetU: 0,
                offsetV: 0,
                rotationDegrees: 0
            },
            materialVariation: { enabled: false, seedOffset: 0 },
            belt: {
                enabled: false,
                height: 0.18,
                extrusion: 0,
                material: { kind: 'color', id: 'offwhite' },
                tiling: {
                    enabled: false,
                    tileMeters: 2,
                    tileMetersU: 2,
                    tileMetersV: 2,
                    uvEnabled: false,
                    offsetU: 0,
                    offsetV: 0,
                    rotationDegrees: 0
                }
            },
            windows: {
                enabled: false,
                typeId: 'window.style.default',
                params: {},
                width: 2.2,
                height: 1.4,
                sillHeight: 1,
                spacing: 1.6,
                cornerEps: 0.01,
                offset: 0.01,
                fakeDepth: { enabled: false, strength: 0.06, insetStrength: 0.25 },
                pbr: {
                    normal: { enabled: true, strength: 0.85 },
                    roughness: { enabled: true, contrast: 1 },
                    border: { enabled: true, thickness: 0.018, strength: 0.35 }
                },
                windowVisuals: null,
                spaceColumns: {
                    enabled: false,
                    every: 4,
                    width: 0.9,
                    material: { kind: 'color', id: 'offwhite' },
                    tiling: {
                        enabled: false,
                        tileMeters: 2,
                        tileMetersU: 2,
                        tileMetersV: 2,
                        uvEnabled: false,
                        offsetU: 0,
                        offsetV: 0,
                        rotationDegrees: 0
                    },
                    extrude: false,
                    extrudeDistance: 0.12
                }
            },
            faceLinking: { links: { C: 'A', D: 'B' } }
        }
    ],
    facades: {
        floor_70: {
            A: {
                layout: {
                    bays: {
                        items: [
                            {
                                id: 'bay_1',
                                size: { mode: 'range', minMeters: 1, maxMeters: null },
                                expandPreference: 'prefer_expand',
                                wallMaterialOverride: { kind: 'texture', id: 'brick' }
                            },
                            {
                                id: 'bay_2',
                                size: { mode: 'range', minMeters: 1, maxMeters: null },
                                expandPreference: 'prefer_expand',
                                wallMaterialOverride: { kind: 'texture', id: 'pbr.brick_wall_11' },
                                depth: { left: -2, right: -2 }
                            },
                            {
                                id: 'bay_3',
                                size: { mode: 'range', minMeters: 1, maxMeters: null },
                                expandPreference: 'prefer_expand',
                                wallMaterialOverride: { kind: 'texture', id: 'pbr.brick_wall_13' }
                            }
                        ],
                        nextBayIndex: 4
                    }
                }
            }
        }
    }
});

async function loadConfigIntoBf2(page, config) {
    await page.evaluate((cfg) => {
        const view = window.__busSim?.sm?.current?.view ?? null;
        if (!view?.scene?.loadBuildingConfig) return false;
        view._currentConfig = cfg;
        return !!view.scene.loadBuildingConfig(cfg, { preserveCamera: true });
    }, config);
}

async function getMeshInspectionReport(page) {
    return page.evaluate(() => {
        const view = window.__busSim?.sm?.current?.view ?? null;
        const building = view?.scene?._building ?? null;
        const solidGroup = building?.solidGroup ?? null;
        if (!solidGroup) return null;

        let wallMesh = null;
        solidGroup.traverse((obj) => {
            if (wallMesh) return;
            if (!obj?.isMesh) return;
            if (obj.userData?.buildingFab2Role === 'wall') wallMesh = obj;
        });
        if (!wallMesh?.geometry) return null;

        const asPlainBox3 = (mesh) => {
            const geo = mesh?.geometry ?? null;
            if (!geo?.computeBoundingBox) return null;
            mesh.updateMatrixWorld(true);
            geo.computeBoundingBox();
            const box = geo.boundingBox?.clone?.()?.applyMatrix4?.(mesh.matrixWorld) ?? null;
            if (!box) return null;
            return {
                min: { x: box.min.x, y: box.min.y, z: box.min.z },
                max: { x: box.max.x, y: box.max.y, z: box.max.z }
            };
        };

        const wallBox = asPlainBox3(wallMesh);
        if (!wallBox) return null;

        const wallPlane = {
            A: wallBox.max.z,
            B: wallBox.max.x,
            C: wallBox.min.z,
            D: wallBox.min.x
        };

        const wallEdgesByFace = { A: new Set(), B: new Set(), C: new Set(), D: new Set() };
        const wallBaselineEdgesByFace = { A: new Set(), B: new Set(), C: new Set(), D: new Set() };
        const wireGrid = 1e-3;
        const quantize = (n) => Math.round(n / wireGrid);
        const edgeKey = (u0, v0, u1, v1) => {
            const a = `${quantize(u0)},${quantize(v0)}`;
            const b = `${quantize(u1)},${quantize(v1)}`;
            return a < b ? `${a}|${b}` : `${b}|${a}`;
        };
        const baselineEps = 1e-3;
        const planeEps = 1e-3;

        const strips = [];
        solidGroup.traverse((obj) => {
            if (!obj?.isMesh) return;
            const faceId = obj.userData?.buildingFacadeFaceId ?? null;
            if (faceId !== 'A' && faceId !== 'B' && faceId !== 'C' && faceId !== 'D') return;
            const geo = obj.geometry ?? null;
            if (!geo?.getAttribute) return;
            const pos = geo.getAttribute('position');
            const vCount = pos?.count ?? 0;
            const iCount = geo.index?.count ?? 0;
            const box = asPlainBox3(obj);
            if (!box) return;
            const cx = (box.min.x + box.max.x) * 0.5;
            const cy = (box.min.y + box.max.y) * 0.5;
            const cz = (box.min.z + box.max.z) * 0.5;

            const axis = (faceId === 'A' || faceId === 'C') ? 'z' : 'x';
            const centerAxis = axis === 'z' ? cz : cx;
            const offsetFromWallPlane = centerAxis - wallPlane[faceId];

            strips.push({
                faceId,
                itemId: obj.userData?.buildingFacadeItemId ?? null,
                uuid: obj.uuid ?? null,
                geometry: {
                    hasIndex: !!geo.index,
                    vertexCount: vCount,
                    indexCount: iCount,
                    triangleCount: geo.index ? Math.floor(iCount / 3) : Math.floor(vCount / 3)
                },
                box,
                center: { x: cx, y: cy, z: cz },
                offsetFromWallPlane
            });
        });

        const stripsByFace = { A: 0, B: 0, C: 0, D: 0 };
        const stripItemIdsByFace = { A: [], B: [], C: [], D: [] };
        for (const s of strips) {
            stripsByFace[s.faceId] = (stripsByFace[s.faceId] ?? 0) + 1;
            if (typeof s.itemId === 'string' && s.itemId) stripItemIdsByFace[s.faceId].push(s.itemId);
        }
        for (const faceId of ['A', 'B', 'C', 'D']) {
            stripItemIdsByFace[faceId].sort();
        }

        const wallGeo = wallMesh.geometry;
        const wallPos = wallGeo.getAttribute?.('position') ?? null;
        const wallUv = wallGeo.getAttribute?.('uv') ?? null;
        const wallIndex = wallGeo.index ?? null;
        const wallVertexCount = wallPos?.count ?? 0;
        const wallIndexCount = wallIndex?.count ?? 0;
        const wallTriangleCount = wallIndex ? Math.floor(wallIndexCount / 3) : Math.floor(wallVertexCount / 3);
        const isFiniteNumber = (n) => Number.isFinite(n) && !Number.isNaN(n);

        const invalid = {
            positions: 0,
            uvs: 0,
            indicesOutOfRange: 0,
            degenerateTriangles: 0
        };

        const scanAttribute = (attr, stride, counterKey) => {
            if (!attr?.array) return;
            const a = attr.array;
            for (let i = 0; i < a.length; i += stride) {
                for (let k = 0; k < stride; k++) {
                    const v = a[i + k];
                    if (!isFiniteNumber(v)) {
                        invalid[counterKey] += 1;
                        return;
                    }
                }
            }
        };

        scanAttribute(wallPos, 3, 'positions');
        scanAttribute(wallUv, 2, 'uvs');

        const triEps = 1e-10;
        const m = wallMesh.matrixWorld?.elements ?? null;
        const toWorld = (x, y, z) => {
            if (!m) return [x, y, z];
            const wx = m[0] * x + m[4] * y + m[8] * z + m[12];
            const wy = m[1] * x + m[5] * y + m[9] * z + m[13];
            const wz = m[2] * x + m[6] * y + m[10] * z + m[14];
            return [wx, wy, wz];
        };
        const getIdx = (i) => {
            if (!wallIndex) return i;
            return wallIndex.array?.[i] ?? 0;
        };

        const getP = (idx) => {
            const arr = wallPos?.array ?? null;
            if (!arr) return [0, 0, 0];
            const o = idx * 3;
            return [arr[o], arr[o + 1], arr[o + 2]];
        };

        const triCount = wallTriangleCount;
        const baselineY = wallBox.min.y;
        for (let t = 0; t < triCount; t++) {
            const i0 = getIdx(t * 3);
            const i1 = getIdx(t * 3 + 1);
            const i2 = getIdx(t * 3 + 2);
            if (i0 < 0 || i1 < 0 || i2 < 0 || i0 >= wallVertexCount || i1 >= wallVertexCount || i2 >= wallVertexCount) {
                invalid.indicesOutOfRange += 1;
                continue;
            }

            const [ax, ay, az] = getP(i0);
            const [bx, by, bz] = getP(i1);
            const [cxp, cyp, czp] = getP(i2);

            const [awx, awy, awz] = toWorld(ax, ay, az);
            const [bwx, bwy, bwz] = toWorld(bx, by, bz);
            const [cwx, cwy, cwz] = toWorld(cxp, cyp, czp);

            const onA = Math.abs(awz - wallPlane.A) < planeEps && Math.abs(bwz - wallPlane.A) < planeEps && Math.abs(cwz - wallPlane.A) < planeEps;
            const onC = Math.abs(awz - wallPlane.C) < planeEps && Math.abs(bwz - wallPlane.C) < planeEps && Math.abs(cwz - wallPlane.C) < planeEps;
            const onB = Math.abs(awx - wallPlane.B) < planeEps && Math.abs(bwx - wallPlane.B) < planeEps && Math.abs(cwx - wallPlane.B) < planeEps;
            const onD = Math.abs(awx - wallPlane.D) < planeEps && Math.abs(bwx - wallPlane.D) < planeEps && Math.abs(cwx - wallPlane.D) < planeEps;

            const addEdge = (faceId, u0, v0, u1, v1) => {
                const key = edgeKey(u0, v0, u1, v1);
                wallEdgesByFace[faceId].add(key);
                if (Math.abs(v0 - baselineY) < baselineEps && Math.abs(v1 - baselineY) < baselineEps) {
                    wallBaselineEdgesByFace[faceId].add(key);
                }
            };

            if (onA || onC || onB || onD) {
                if (onA || onC) {
                    // A/C plane: (x,y)
                    if (onA) {
                        addEdge('A', awx, awy, bwx, bwy);
                        addEdge('A', bwx, bwy, cwx, cwy);
                        addEdge('A', cwx, cwy, awx, awy);
                    }
                    if (onC) {
                        addEdge('C', awx, awy, bwx, bwy);
                        addEdge('C', bwx, bwy, cwx, cwy);
                        addEdge('C', cwx, cwy, awx, awy);
                    }
                }
                if (onB || onD) {
                    // B/D plane: (z,y)
                    if (onB) {
                        addEdge('B', awz, awy, bwz, bwy);
                        addEdge('B', bwz, bwy, cwz, cwy);
                        addEdge('B', cwz, cwy, awz, awy);
                    }
                    if (onD) {
                        addEdge('D', awz, awy, bwz, bwy);
                        addEdge('D', bwz, bwy, cwz, cwy);
                        addEdge('D', cwz, cwy, awz, awy);
                    }
                }
            }

            const abx = bx - ax;
            const aby = by - ay;
            const abz = bz - az;
            const acx = cxp - ax;
            const acy = cyp - ay;
            const acz = czp - az;
            const cxv = aby * acz - abz * acy;
            const cyv = abz * acx - abx * acz;
            const czv = abx * acy - aby * acx;
            const area2 = cxv * cxv + cyv * cyv + czv * czv;
            if (!(area2 > triEps)) invalid.degenerateTriangles += 1;
        }

        // Strip diagonal vs wall diagonal (wireframe "X" hint): if wall uses the opposite split.
        for (const strip of strips) {
            const faceId = strip.faceId;
            const stripMesh = solidGroup.getObjectByProperty('uuid', strip.uuid ?? '') ?? null;
            const matchSet = wallEdgesByFace[faceId];
            strip.wire = { wallDiagonal: 'unknown' };
            if (!stripMesh?.isMesh) continue;
            const geo = stripMesh.geometry ?? null;
            const pos = geo?.getAttribute?.('position') ?? null;
            const arr = pos?.array ?? null;
            const mm = stripMesh.matrixWorld?.elements ?? null;
            if (!arr || !mm) continue;

            const toWorldStrip = (idx) => {
                const o = idx * 3;
                const x = arr[o];
                const y = arr[o + 1];
                const z = arr[o + 2];
                const wx = mm[0] * x + mm[4] * y + mm[8] * z + mm[12];
                const wy = mm[1] * x + mm[5] * y + mm[9] * z + mm[13];
                const wz = mm[2] * x + mm[6] * y + mm[10] * z + mm[14];
                return [wx, wy, wz];
            };

            const v0 = toWorldStrip(0);
            const v1 = toWorldStrip(1);
            const v2 = toWorldStrip(2);
            const v3 = toWorldStrip(3);

            const uv = (v) => {
                if (faceId === 'A' || faceId === 'C') return [v[0], v[1]];
                return [v[2], v[1]];
            };

            const [u0, w0] = uv(v0);
            const [u1, w1] = uv(v1);
            const [u2, w2] = uv(v2);
            const [u3, w3] = uv(v3);
            const diag0 = edgeKey(u0, w0, u2, w2);
            const diag1 = edgeKey(u1, w1, u3, w3);

            const wallHasDiag0 = matchSet.has(diag0);
            const wallHasDiag1 = matchSet.has(diag1);

            let wallDiagonal = 'none';
            if (wallHasDiag0 && wallHasDiag1) wallDiagonal = 'both';
            else if (wallHasDiag0) wallDiagonal = 'matches_strip';
            else if (wallHasDiag1) wallDiagonal = 'opposite_strip';

            strip.wire = {
                wallDiagonal,
                wallHasStripDiagonal: wallHasDiag0,
                wallHasOppositeDiagonal: wallHasDiag1,
                coplanarWithWall: Math.abs(strip.offsetFromWallPlane) < 1e-3
            };
        }

        const wallMaterials = Array.isArray(wallMesh.material) ? wallMesh.material : [];
        const wallPolygonOffsets = wallMaterials.map((mat) => ({
            enabled: !!mat?.polygonOffset,
            factor: mat?.polygonOffsetFactor ?? null,
            units: mat?.polygonOffsetUnits ?? null
        }));

        return {
            wall: {
                box: wallBox,
                geometry: {
                    hasIndex: !!wallIndex,
                    vertexCount: wallVertexCount,
                    indexCount: wallIndexCount,
                    triangleCount: wallTriangleCount
                },
                material: {
                    isMultiMaterial: Array.isArray(wallMesh.material),
                    materialCount: wallMaterials.length,
                    polygonOffset: wallPolygonOffsets,
                    polygonOffsetEnabledAny: wallPolygonOffsets.some((p) => p.enabled)
                }
            },
            strips,
            counts: { stripsByFace, stripItemIdsByFace },
            faces: {
                A: { wallEdgeCount: wallEdgesByFace.A.size, baselineEdgeCount: wallBaselineEdgesByFace.A.size },
                B: { wallEdgeCount: wallEdgesByFace.B.size, baselineEdgeCount: wallBaselineEdgesByFace.B.size },
                C: { wallEdgeCount: wallEdgesByFace.C.size, baselineEdgeCount: wallBaselineEdgesByFace.C.size },
                D: { wallEdgeCount: wallEdgesByFace.D.size, baselineEdgeCount: wallBaselineEdgesByFace.D.size }
            },
            invalid
        };
    });
}

test('BF2: mesh inspection report for a 3-bay linked facade config', async ({ page }) => {
    const getErrors = await attachFailFastConsole({ page });
    await page.goto('/index.html?ibl=0&bloom=0&coreTests=0');

    await page.waitForSelector('#ui-welcome:not(.hidden)');
    await page.keyboard.press('Q');
    await page.waitForSelector('#ui-setup:not(.hidden)');
    await page.keyboard.press('9');

    await page.waitForSelector('#building-fab2-hud');
    await page.locator('.building-fab2-create-btn').click();

    await loadConfigIntoBf2(page, BF2_BUILDING_BUILDING_CONFIG);

    const report = await getMeshInspectionReport(page);
    expect(report).not.toBeNull();

    expect(report.counts.stripsByFace).toEqual({ A: 0, B: 0, C: 0, D: 0 });
    expect(report.counts.stripItemIdsByFace.A).toEqual([]);
    expect(report.counts.stripItemIdsByFace.C).toEqual([]);
    expect(report.invalid).toEqual({
        positions: 0,
        uvs: 0,
        indicesOutOfRange: 0,
        degenerateTriangles: 0
    });

    expect(report.wall.material.isMultiMaterial).toBe(true);
    expect(report.wall.material.materialCount).toBe(4);
    expect(report.wall.material.polygonOffsetEnabledAny).toBe(false);

    expect(report.faces.A.baselineEdgeCount).toBeGreaterThan(0);
    expect(report.faces.B.baselineEdgeCount).toBeGreaterThan(0);
    expect(report.faces.C.baselineEdgeCount).toBeGreaterThan(0);
    expect(report.faces.D.baselineEdgeCount).toBeGreaterThan(0);

    if (process.env.BF2_MESH_REPORT === '1') {
        // eslint-disable-next-line no-console
        console.log(JSON.stringify(report, null, 2));
    }

    expect(await getErrors()).toEqual([]);
});
