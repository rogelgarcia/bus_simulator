// Headless browser tests: BF2 facade mesh invariants for rotated footprints and corner strategy determinism.
import fs from 'node:fs/promises';
import test, { expect } from '@playwright/test';

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

async function writeJsonArtifact(testInfo, name, data) {
    const outPath = testInfo.outputPath(name);
    await fs.writeFile(outPath, JSON.stringify(data, null, 2), 'utf-8');
    return outPath;
}

test('BF2: rotated footprint keeps facade wall geometry valid (no NaN/UV/degenerate tris)', async ({ page }, testInfo) => {
    const getErrors = await attachFailFastConsole({ page });
    await page.goto('tests/headless/harness/index.html?ibl=0&bloom=0&sunBloom=0&grade=off&aa=off');
    await page.waitForFunction(() => window.__testHooks && window.__testHooks.version === 1);

    const report = await page.evaluate(async () => {
        const { __testOnly } = await import('/src/graphics/assets3d/generators/building_fabrication/BuildingFabricationGenerator.js');
        const { resolveRectFacadeCornerStrategy } = await import('/src/graphics/assets3d/generators/building_fabrication/FacadeCornerResolutionStrategies.js');

        const makeRectLoop = ({ width, depth }) => {
            const w = Number(width) || 1;
            const d = Number(depth) || 1;
            const hw = w * 0.5;
            const hd = d * 0.5;
            return [
                { x: -hw, z: -hd },
                { x: hw, z: -hd },
                { x: hw, z: hd },
                { x: -hw, z: hd }
            ];
        };

        const rotateLoop = (loop, angleRad) => {
            const rad = Number(angleRad) || 0;
            const c = Math.cos(rad);
            const s = Math.sin(rad);
            return (Array.isArray(loop) ? loop : []).map((p) => {
                const x = Number(p?.x) || 0;
                const z = Number(p?.z) || 0;
                return { x: x * c - z * s, z: x * s + z * c };
            });
        };

        const scanGeometry = (geo) => {
            const pos = geo?.getAttribute?.('position') ?? null;
            const uv = geo?.getAttribute?.('uv') ?? null;
            const idx = geo?.index ?? null;
            const vCount = Number(pos?.count) || 0;
            const invalid = { positions: 0, uvs: 0, indicesOutOfRange: 0, degenerateTriangles: 0 };
            const isFiniteNumber = (n) => Number.isFinite(n) && !Number.isNaN(n);

            const scanAttribute = (attr, stride, key) => {
                const arr = attr?.array ?? null;
                if (!arr) return;
                for (let i = 0; i < arr.length; i += stride) {
                    for (let k = 0; k < stride; k++) {
                        if (!isFiniteNumber(arr[i + k])) {
                            invalid[key] += 1;
                            return;
                        }
                    }
                }
            };

            scanAttribute(pos, 3, 'positions');
            scanAttribute(uv, 2, 'uvs');

            const triEps = 1e-10;
            const posArr = pos?.array ?? null;
            const idxArr = idx?.array ?? null;
            if (!posArr || !(vCount > 0)) return { invalid, vertexCount: vCount, triangleCount: 0 };

            const getIdx = (i) => idxArr ? (idxArr[i] ?? 0) : i;
            const triCount = idxArr ? Math.floor(idxArr.length / 3) : Math.floor(vCount / 3);

            const getP = (idxV) => {
                const o = idxV * 3;
                return [posArr[o] ?? 0, posArr[o + 1] ?? 0, posArr[o + 2] ?? 0];
            };

            for (let t = 0; t < triCount; t++) {
                const i0 = getIdx(t * 3);
                const i1 = getIdx(t * 3 + 1);
                const i2 = getIdx(t * 3 + 2);
                if (i0 < 0 || i1 < 0 || i2 < 0 || i0 >= vCount || i1 >= vCount || i2 >= vCount) {
                    invalid.indicesOutOfRange += 1;
                    continue;
                }

                const [ax, ay, az] = getP(i0);
                const [bx, by, bz] = getP(i1);
                const [cx, cy, cz] = getP(i2);

                const abx = bx - ax;
                const aby = by - ay;
                const abz = bz - az;
                const acx = cx - ax;
                const acy = cy - ay;
                const acz = cz - az;
                const cxv = aby * acz - abz * acy;
                const cyv = abz * acx - abx * acz;
                const czv = abx * acy - aby * acx;
                const area2 = cxv * cxv + cyv * cyv + czv * czv;
                if (!(area2 > triEps)) invalid.degenerateTriangles += 1;
            }

            return { invalid, vertexCount: vCount, triangleCount: triCount };
        };

        const scanLoopFinite = (loop) => {
            const pts = Array.isArray(loop) ? loop : [];
            let nonFinite = 0;
            for (const p of pts) {
                const x = Number(p?.x);
                const z = Number(p?.z);
                if (!Number.isFinite(x) || !Number.isFinite(z)) nonFinite += 1;
            }
            return { points: pts.length, nonFinite };
        };

        const facades = {
            A: {
                depthOffset: 0,
                layout: {
                    items: [
                        { type: 'bay', id: 'a_straight', widthFrac: 0.3, depth: { left: 0.4, right: 0.4 } },
                        { type: 'bay', id: 'a_wedge', widthFrac: 0.4, depthOffset: 0.6, wedgeAngleDeg: 45 },
                        { type: 'bay', id: 'a_mix', widthFrac: 0.3, depth: { left: -0.3, right: 0.2, linked: false } }
                    ]
                }
            },
            B: {
                depthOffset: 0,
                layout: {
                    items: [
                        { type: 'bay', id: 'b_mix', widthFrac: 1.0, depth: { left: 0.25, right: -0.25, linked: false } }
                    ]
                }
            },
            C: { depthOffset: 0, layout: { items: [{ type: 'padding', id: 'c_pad', widthFrac: 1.0 }] } },
            D: { depthOffset: -0.15, layout: { items: [{ type: 'padding', id: 'd_pad', widthFrac: 1.0 }] } }
        };

        const run = ({ id, loop }) => {
            const warnings = [];
            const cornerDebug = [];
            const strategy = resolveRectFacadeCornerStrategy('max_abs_depth');
            const res = __testOnly.computeQuadFacadeSilhouette({
                wallOuter: [loop],
                facades,
                warnings,
                cornerStrategy: strategy,
                cornerDebug
            });
            if (!res) {
                return { id, ok: false, warnings, cornerDebug, silhouette: null, loopDetailScan: scanLoopFinite(loop) };
            }
            const geo = __testOnly.buildWallSidesGeometryFromLoopDetailXZ(res.loopDetail, { height: 12, uvBaseV: 0 });
            const geoScan = geo ? scanGeometry(geo) : null;
            const detailScan = scanLoopFinite(res.loopDetail);
            const ok = !!geo && geoScan && detailScan.nonFinite === 0;
            return {
                id,
                ok,
                warnings,
                cornerDebug,
                silhouette: {
                    frames: res.frames ?? null,
                    depthMinsByFaceId: res.depthMinsByFaceId ?? null,
                    loop: res.loop ?? null,
                    loopDetail: res.loopDetail ?? null
                },
                loopDetailScan: detailScan,
                geometryScan: geoScan
            };
        };

        const axisLoop = makeRectLoop({ width: 10, depth: 6 });
        const rotatedLoop = rotateLoop(axisLoop, Math.PI * 0.27);

        return {
            cases: {
                axis: run({ id: 'axis', loop: axisLoop }),
                rotated: run({ id: 'rotated', loop: rotatedLoop })
            }
        };
    });

    try {
        expect(report.cases.axis.ok).toBe(true);
        expect(report.cases.axis.loopDetailScan).toEqual({ points: report.cases.axis.loopDetailScan.points, nonFinite: 0 });
        expect(report.cases.axis.geometryScan.invalid).toEqual({
            positions: 0,
            uvs: 0,
            indicesOutOfRange: 0,
            degenerateTriangles: 0
        });
        expect(report.cases.axis.geometryScan.triangleCount).toBeGreaterThan(0);

        expect(report.cases.rotated.ok).toBe(true);
        expect(report.cases.rotated.loopDetailScan).toEqual({ points: report.cases.rotated.loopDetailScan.points, nonFinite: 0 });
        expect(report.cases.rotated.geometryScan.invalid).toEqual({
            positions: 0,
            uvs: 0,
            indicesOutOfRange: 0,
            degenerateTriangles: 0
        });
        expect(report.cases.rotated.geometryScan.triangleCount).toBeGreaterThan(0);
    } catch (err) {
        await writeJsonArtifact(testInfo, 'rotated_facade_invariants_debug.json', report);
        throw err;
    }

    expect(await getErrors()).toEqual([]);
});

test('BF2: corner strategy debug winners deterministic (no flips across runs)', async ({ page }, testInfo) => {
    const getErrors = await attachFailFastConsole({ page });
    await page.goto('tests/headless/harness/index.html?ibl=0&bloom=0&sunBloom=0&grade=off&aa=off');
    await page.waitForFunction(() => window.__testHooks && window.__testHooks.version === 1);

    const report = await page.evaluate(async () => {
        const { __testOnly } = await import('/src/graphics/assets3d/generators/building_fabrication/BuildingFabricationGenerator.js');
        const { resolveRectFacadeCornerStrategy } = await import('/src/graphics/assets3d/generators/building_fabrication/FacadeCornerResolutionStrategies.js');

        const loop = [
            { x: -5, z: -3 },
            { x: 5, z: -3 },
            { x: 5, z: 3 },
            { x: -5, z: 3 }
        ];

        const facades = {
            A: { depthOffset: 0, layout: { items: [{ type: 'bay', id: 'a', widthFrac: 1, depth: { left: 0.1, right: 0.8, linked: false } }] } },
            B: { depthOffset: 0, layout: { items: [{ type: 'bay', id: 'b', widthFrac: 1, depth: { left: -0.6, right: -0.2, linked: false } }] } },
            C: { depthOffset: 0, layout: { items: [{ type: 'bay', id: 'c', widthFrac: 1, depth: { left: 0.05, right: 0.05 } }] } },
            D: { depthOffset: 0, layout: { items: [{ type: 'bay', id: 'd', widthFrac: 1, depth: { left: 0.3, right: 0.3 } }] } }
        };

        const expectedWinners = {
            AB: 'A',
            BC: 'B',
            CD: 'D',
            DA: 'D'
        };

        const strategy = resolveRectFacadeCornerStrategy('max_abs_depth');
        const signatures = [];
        const cornerWins = [];

        for (let i = 0; i < 8; i++) {
            const warnings = [];
            const cornerDebug = [];
            const res = __testOnly.computeQuadFacadeSilhouette({
                wallOuter: [loop],
                facades,
                warnings,
                cornerStrategy: strategy,
                cornerDebug
            });
            if (!res) return { ok: false, warnings, cornerDebug: [], signatures: [], cornerWins: [], expectedWinners };
            signatures.push({
                corner: JSON.stringify(cornerDebug),
                loop: JSON.stringify(res.loopDetail ?? null)
            });
            cornerWins.push((cornerDebug ?? []).map((c) => ({ cornerId: c.cornerId, winnerFaceId: c.winnerFaceId })));
        }

        const base = signatures[0] ?? null;
        const stable = signatures.every((s) => s.corner === base.corner && s.loop === base.loop);
        const winnersFirst = cornerWins[0] ?? [];

        const winnersByCornerId = {};
        for (const entry of winnersFirst) winnersByCornerId[entry.cornerId] = entry.winnerFaceId;

        return {
            ok: true,
            stable,
            expectedWinners,
            winnersByCornerId,
            signatures
        };
    });

    try {
        expect(report.ok).toBe(true);
        expect(report.stable).toBe(true);
        expect(report.winnersByCornerId).toEqual(report.expectedWinners);
    } catch (err) {
        await writeJsonArtifact(testInfo, 'corner_strategy_determinism_debug.json', report);
        throw err;
    }

    expect(await getErrors()).toEqual([]);
});
