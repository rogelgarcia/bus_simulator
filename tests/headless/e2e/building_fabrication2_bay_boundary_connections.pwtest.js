// AI 541 browser regression: persistence, generator paths, and BF2 authoring controls.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { expect } from '@playwright/test';

test.setTimeout(240_000);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CAPTURE_EDITOR = process.env.AI541_CAPTURE === '1';
const CAPTURE_DIR = path.resolve(
    __dirname,
    '../../artifacts/screens/ai541-bay-boundary-curvature'
);

test('BF2 AI 541: rounded boundaries generate one shared path and round-trip independently', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error?.message ?? String(error)));
    page.on('console', (message) => {
        if (message.type() === 'error' && !message.text().includes('ResizeObserver loop limit exceeded')) errors.push(message.text());
    });
    await page.goto('/tests/headless/harness/index.html?ibl=0&bloom=0');
    await page.waitForFunction(() => window.__testHooks?.version === 1);

    const report = await page.evaluate(async () => {
        const [types, generator, exporter] = await Promise.all([
            import('/src/graphics/assets3d/generators/building_fabrication/BuildingFabricationTypes.js'),
            import('/src/graphics/assets3d/generators/building_fabrication/BuildingFabricationGenerator.js'),
            import('/src/app/city/buildings/BuildingConfigExport.js')
        ]);
        const relationships = {
            connections: [{
                id: 'step',
                type: 'rounded',
                endpoints: [
                    { faceId: 'A', bayId: 'left', edge: 'end' },
                    { faceId: 'A', bayId: 'right', edge: 'start' }
                ],
                depthLink: { enabled: false },
                transition: {
                    mode: 'authored',
                    leftRunoutMeters: 1.1,
                    rightRunoutMeters: 0.8,
                    runoutsLinked: false,
                    meeting: 0.4
                }
            }]
        };
        const defaultFloor = types.createDefaultFloorLayer({ id: 'default' });
        const floor = types.createDefaultFloorLayer({ id: 'roundtrip', bayBoundaryConnections: relationships });
        const cloned = types.cloneBuildingLayers([floor]);
        const cloneDistinct = cloned[0].bayBoundaryConnections !== floor.bayBoundaryConnections
            && cloned[0].bayBoundaryConnections.connections !== floor.bayBoundaryConnections.connections
            && cloned[0].bayBoundaryConnections.connections[0].endpoints !== floor.bayBoundaryConnections.connections[0].endpoints;
        cloned[0].bayBoundaryConnections.connections[0].endpoints[0].bayId = 'changed';
        const cloneIndependent = floor.bayBoundaryConnections.connections[0].endpoints[0].bayId === 'left';
        const exported = exporter.createCityBuildingConfigFromFabrication({ id: 'ai541_roundtrip', name: 'AI 541', layers: [floor] });
        const source = exporter.serializeCityBuildingConfigToEsModule(exported, {
            exportConstName: 'AI541_ROUNDTRIP_BUILDING_CONFIG',
            fileBaseName: 'Ai541Roundtrip'
        });
        const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
        let imported = null;
        try {
            imported = (await import(url)).AI541_ROUNDTRIP_BUILDING_CONFIG.layers[0].bayBoundaryConnections;
        } finally {
            URL.revokeObjectURL(url);
        }

        const rect = [[
            { x: -6, y: 0, z: 4 }, { x: 6, y: 0, z: 4 },
            { x: 6, y: 0, z: -4 }, { x: -6, y: 0, z: -4 }
        ]];
        const bay = (id, widthFrac, depth) => ({
            id,
            sourceBayId: id,
            type: 'bay',
            widthFrac,
            depth: { left: depth, right: depth, linked: true }
        });
        const warnings = [];
        const result = generator.__testOnly.computeQuadFacadeSilhouette({
            wallOuter: rect,
            facades: { A: { layout: { items: [bay('left', 0.5, 0.7), bay('right', 0.5, -0.35)] } } },
            layerMaterial: null,
            bayBoundaryConnections: relationships,
            warnings
        });
        const transition = result?.boundaryTransitions?.[0] ?? null;
        const transitionFrames = generator.__testOnly.computeFacadeFramesFromLoop(rect[0], { warnings: [] });
        const roundedBalconyRelation = transition
            ? generator.__testOnly.resolveBalconyContinuityAdjacency({
                aEndpoint: { edge: 'end' },
                bEndpoint: { edge: 'start' },
                aCandidate: {
                    key: 'left_balcony',
                    faceId: 'A',
                    strip: transition.startEndpoint.strip,
                    frame: transitionFrames.A
                },
                bCandidate: {
                    key: 'right_balcony',
                    faceId: 'A',
                    strip: transition.endEndpoint.strip,
                    frame: transitionFrames.A
                },
                frames: transitionFrames,
                boundaryTransitions: result.boundaryTransitions
            })
            : null;
        const wall = result ? generator.__testOnly.buildWallSidesGeometryFromLoopDetailXZ(result.loopDetail, { height: 3 }) : null;
        const wallVertexCount = wall?.getAttribute?.('position')?.count ?? 0;
        wall?.dispose?.();
        const frames = generator.__testOnly.computeFacadeFramesFromLoop(rect[0], { warnings: [] });
        const crossWarnings = [];
        const cross = generator.__testOnly.computeQuadFacadeSilhouette({
            wallOuter: rect,
            facades: {
                A: { layout: { items: [bay('front', 1, 0)] } },
                B: { layout: { items: [bay('side', 1, 0)] } }
            },
            layerMaterial: null,
            bayBoundaryConnections: {
                connections: [{
                    ...relationships.connections[0],
                    id: 'corner',
                    endpoints: [
                        { faceId: 'A', bayId: 'front', edge: frames.A.runForward === false ? 'start' : 'end' },
                        { faceId: 'B', bayId: 'side', edge: frames.B.runForward === false ? 'end' : 'start' }
                    ]
                }]
            },
            warnings: crossWarnings
        });
        const blockedWarnings = [];
        const blocked = generator.__testOnly.computeQuadFacadeSilhouette({
            wallOuter: rect,
            facades: {
                A: { layout: { items: [
                    { ...bay('left', 0.5, 0), window: { enabled: true, size: { widthMeters: 5.5 }, padding: { leftMeters: 0.2, rightMeters: 0.2 } } },
                    bay('right', 0.5, 0)
                ] } }
            },
            layerMaterial: null,
            bayBoundaryConnections: relationships,
            warnings: blockedWarnings
        });
        const legacyFacades = {
            A: { layout: { items: [bay('legacy_left', 0.5, 0.2), bay('legacy_right', 0.5, -0.1)] } }
        };
        const legacyImplicit = generator.__testOnly.computeQuadFacadeSilhouette({
            wallOuter: rect, facades: legacyFacades, layerMaterial: null, warnings: []
        });
        const legacyExplicitNull = generator.__testOnly.computeQuadFacadeSilhouette({
            wallOuter: rect, facades: legacyFacades, layerMaterial: null,
            bayBoundaryConnections: null, warnings: []
        });
        const wedgeWarnings = [];
        const wedge = generator.__testOnly.computeQuadFacadeSilhouette({
            wallOuter: rect,
            facades: {
                A: { layout: { items: [
                    { ...bay('wedge_left', 0.5, 0), depth: { left: -0.45, right: 0.4, linked: false } },
                    { ...bay('wedge_right', 0.5, 0), depth: { left: 0.4, right: -0.35, linked: false } }
                ] } }
            },
            layerMaterial: null,
            bayBoundaryConnections: {
                connections: [{
                    ...relationships.connections[0],
                    id: 'wedge_kink',
                    endpoints: [
                        { faceId: 'A', bayId: 'wedge_left', edge: 'end' },
                        { faceId: 'A', bayId: 'wedge_right', edge: 'start' }
                    ]
                }]
            },
            warnings: wedgeWarnings
        });
        const wedgeOpeningStrip = wedge?.strips?.find((strip) => strip?.id === 'wedge_left') ?? null;
        const wedgeOpeningFrame = frames?.A ?? null;
        const wedgeOpeningU = wedgeOpeningStrip
            ? (Number(wedgeOpeningStrip.frontU0) + Number(wedgeOpeningStrip.frontU1)) * 0.5
            : 0;
        const wedgeOpeningPose = wedgeOpeningStrip && wedgeOpeningFrame
            ? generator.__testOnly.resolveFacadeStripOpeningPose(wedgeOpeningFrame, wedgeOpeningStrip, wedgeOpeningU)
            : null;
        const wedgeBaseSample = wedgeOpeningFrame
            ? generator.__testOnly.sampleFacadeFrameAtU(wedgeOpeningFrame, wedgeOpeningU)
            : null;
        const arcLoop = [[
            { x: -6, z: 4, cornerId: 'arc_nw', runId: 'A', runForward: true, arc: { bulge: -0.12 } },
            { x: 6, z: 4, cornerId: 'arc_ne', runId: 'B', runForward: true },
            { x: 6, z: -4, cornerId: 'arc_se', runId: 'C', runForward: true },
            { x: -6, z: -4, cornerId: 'arc_sw', runId: 'D', runForward: true }
        ]];
        const arcWarnings = [];
        const arc = generator.__testOnly.computeQuadFacadeSilhouette({
            wallOuter: arcLoop,
            facades: { A: { layout: { items: [bay('arc_left', 0.5, 0.35), bay('arc_right', 0.5, -0.2)] } } },
            layerMaterial: null,
            bayBoundaryConnections: {
                connections: [{
                    ...relationships.connections[0],
                    id: 'arc_step',
                    endpoints: [
                        { faceId: 'A', bayId: 'arc_left', edge: 'end' },
                        { faceId: 'A', bayId: 'arc_right', edge: 'start' }
                    ]
                }]
            },
            warnings: arcWarnings
        });
        const concaveLoop = [[
            { x: -6, z: 4, cornerId: 'l_1', runId: 'A', runForward: true },
            { x: 6, z: 4, cornerId: 'l_2', runId: 'B', runForward: true },
            { x: 6, z: -4, cornerId: 'l_3', runId: 'C', runForward: true },
            { x: 0, z: -4, cornerId: 'l_4', runId: 'D', runForward: true },
            { x: 0, z: 0, cornerId: 'l_5', runId: 'E', runForward: true },
            { x: -6, z: 0, cornerId: 'l_6', runId: 'F', runForward: true }
        ]];
        const concaveWarnings = [];
        const concave = generator.__testOnly.computeQuadFacadeSilhouette({
            wallOuter: concaveLoop,
            facades: {
                D: { layout: { items: [bay('concave_in', 1, 0)] } },
                E: { layout: { items: [bay('concave_out', 1, 0)] } }
            },
            layerMaterial: null,
            bayBoundaryConnections: {
                connections: [{
                    ...relationships.connections[0],
                    id: 'concave_corner',
                    endpoints: [
                        { faceId: 'D', bayId: 'concave_in', edge: 'end' },
                        { faceId: 'E', bayId: 'concave_out', edge: 'start' }
                    ],
                    transition: {
                        mode: 'centered',
                        leftRunoutMeters: 0.6,
                        rightRunoutMeters: 0.6,
                        runoutsLinked: true,
                        meeting: 0.5
                    }
                }]
            },
            warnings: concaveWarnings
        });
        return {
            defaultOff: !Object.hasOwn(defaultFloor, 'bayBoundaryConnections'),
            normalized: floor.bayBoundaryConnections,
            cloneDistinct,
            cloneIndependent,
            imported,
            sourceHasRelationship: source.includes('"bayBoundaryConnections"'),
            warnings,
            transition: transition ? {
                sampleCount: transition.samples.length,
                segmentCount: transition.segments.length,
                owners: [...new Set(transition.segments.map((segment) => segment.ownerBayId))],
                p0: transition.samples[0].position,
                p1: transition.samples.at(-1).position
            } : null,
            roundedBalconyRelation: roundedBalconyRelation
                ? { valid: roundedBalconyRelation.valid, kind: roundedBalconyRelation.kind }
                : null,
            wallVertexCount,
            transitionPointCount: result?.loopDetail?.filter((point) => !!point.boundaryTransitionId).length ?? 0,
            crossWarnings,
            crossCornerId: cross?.boundaryTransitions?.[0]?.cornerId ?? null,
            crossTransitionPoints: cross?.loopDetail?.filter((point) => point.kind === 'boundary_transition').length ?? 0,
            blockedTransitionCount: blocked?.boundaryTransitions?.length ?? 0,
            blockedWarnings,
            legacyNullMatchesAbsent: JSON.stringify(legacyImplicit) === JSON.stringify(legacyExplicitNull),
            wedgeWarnings,
            wedgeTransitionCount: wedge?.boundaryTransitions?.length ?? 0,
            wedgeArcLengthContinuous: wedge?.boundaryTransitions?.[0]?.segments?.every((segment, index, segments) => (
                segment.s1 > segment.s0
                && (index === 0 || Math.abs(segment.s0 - segments[index - 1].s1) < 1e-9)
            )) ?? false,
            wedgeOpeningPose: wedgeOpeningPose ? {
                tangentNormalDot: wedgeOpeningPose.tx * wedgeOpeningPose.nx + wedgeOpeningPose.tz * wedgeOpeningPose.nz,
                normalDeltaFromBase: Math.hypot(
                    wedgeOpeningPose.nx - (Number(wedgeBaseSample?.n?.x) || 0),
                    wedgeOpeningPose.nz - (Number(wedgeBaseSample?.n?.z) || 0)
                ),
                pointError: Math.hypot(
                    wedgeOpeningPose.x - generator.__testOnly.pointOnFacadeFrame({
                        frame: wedgeOpeningFrame,
                        u: wedgeOpeningU,
                        depth: wedgeOpeningPose.depth
                    }).x,
                    wedgeOpeningPose.z - generator.__testOnly.pointOnFacadeFrame({
                        frame: wedgeOpeningFrame,
                        u: wedgeOpeningU,
                        depth: wedgeOpeningPose.depth
                    }).z
                )
            } : null,
            arcWarnings,
            arcTransitionCount: arc?.boundaryTransitions?.length ?? 0,
            arcSampleCount: arc?.boundaryTransitions?.[0]?.samples?.length ?? 0,
            concaveWarnings,
            concaveTransitionCount: concave?.boundaryTransitions?.length ?? 0,
            concaveLoopIsSimple: concave
                ? generator.__testOnly.isSimplePlanLoopXZ(concave.loop)
                : false
        };
    });

    expect(report.defaultOff).toBe(true);
    expect(report.cloneDistinct).toBe(true);
    expect(report.cloneIndependent).toBe(true);
    expect(report.imported).toEqual(report.normalized);
    expect(report.sourceHasRelationship).toBe(true);
    expect(report.warnings).toEqual([]);
    expect(report.transition?.sampleCount).toBeGreaterThan(3);
    expect(report.transition?.segmentCount).toBe(report.transition.sampleCount - 1);
    expect(report.transition?.owners.sort()).toEqual(['left', 'right']);
    expect(report.transitionPointCount).toBeGreaterThan(2);
    expect(report.roundedBalconyRelation).toEqual({ valid: true, kind: 'rounded_boundary' });
    expect(report.wallVertexCount).toBeGreaterThan(0);
    expect(report.crossWarnings).toEqual([]);
    expect(report.crossCornerId).toBe('AB');
    expect(report.crossTransitionPoints).toBeGreaterThan(1);
    expect(report.blockedTransitionCount).toBe(0);
    expect(report.blockedWarnings.join(' ')).toContain('opening or collapse usable bay frontage');
    expect(report.legacyNullMatchesAbsent).toBe(true);
    expect(report.wedgeWarnings).toEqual([]);
    expect(report.wedgeTransitionCount).toBe(1);
    expect(report.wedgeArcLengthContinuous).toBe(true);
    expect(report.wedgeOpeningPose).not.toBeNull();
    expect(Math.abs(report.wedgeOpeningPose.tangentNormalDot)).toBeLessThan(1e-8);
    expect(report.wedgeOpeningPose.normalDeltaFromBase).toBeGreaterThan(0.05);
    expect(report.wedgeOpeningPose.pointError).toBeLessThan(1e-8);
    expect(report.arcWarnings).toEqual([]);
    expect(report.arcTransitionCount).toBe(1);
    expect(report.arcSampleCount).toBeGreaterThan(3);
    expect(report.concaveWarnings).toEqual([]);
    expect(report.concaveTransitionCount).toBe(1);
    expect(report.concaveLoopIsSimple).toBe(true);
    expect(errors).toEqual([]);
});

test('BF2 AI 541: boundary panel applies authored stations, linked depths, cancel, and undo/redo', async ({ page }) => {
    test.setTimeout(180_000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error?.message ?? String(error)));
    page.on('console', (message) => {
        if (message.type() === 'error' && !message.text().includes('ResizeObserver loop limit exceeded')) errors.push(message.text());
    });
    await page.goto('/index.html?screen=building_fabrication2&ibl=0&bloom=0&coreTests=0');
    await page.waitForSelector('#building-fab2-hud');
    await page.waitForFunction(() => !!window.__busSim?.sm?.current?.view, null, { timeout: 60_000 });
    await page.locator('.building-fab2-create-btn').click();
    const floor = page.locator('.building-fab2-layer-group.is-floor').first();
    await floor.locator('.building-fab2-face-btn').filter({ hasText: /^A$/ }).click();
    const addBay = floor.locator('.building-fab2-bay-btn.is-add');
    await addBay.click();
    await addBay.click();
    const bays = floor.locator('.building-fab2-bay-btn:not(.is-add):not(.is-grouping)');
    await expect(bays).toHaveCount(2);
    await bays.first().click();

    const editor = floor.locator('[data-role="bay-boundary-editor"]').first();
    await expect(editor).toBeVisible();
    await expect(editor.locator('.building-fab2-boundary-handle')).toHaveCount(3);
    await editor.getByLabel('Connection').selectOption('rounded');
    await editor.getByLabel('Left runout (m)').fill('0');
    await expect(editor).toHaveClass(/is-invalid/);
    await expect(editor.locator('.building-fab2-boundary-clearance')).toContainText('Left runout must be');
    await expect(editor.getByRole('button', { name: 'Apply' })).toBeDisabled();
    if (CAPTURE_EDITOR) {
        await fs.mkdir(CAPTURE_DIR, { recursive: true });
        await editor.screenshot({ path: path.join(CAPTURE_DIR, 'editor-invalid-state-feedback.png') });
    }
    await page.evaluate(() => {
        const editor = document.querySelector('[data-role="bay-boundary-editor"]');
        if (!(editor instanceof HTMLElement)) throw new Error('AI 541 editor is missing.');
        const field = (label) => {
            const wrap = [...editor.querySelectorAll('label')]
                .find((entry) => entry.querySelector('span')?.textContent?.trim() === label);
            const input = wrap?.querySelector('input, select');
            if (!(input instanceof HTMLInputElement) && !(input instanceof HTMLSelectElement)) {
                throw new Error(`AI 541 field ${label} is missing.`);
            }
            return input;
        };
        const setValue = (label, value, event = 'input') => {
            const input = field(label);
            input.value = value;
            input.dispatchEvent(new Event(event, { bubbles: true }));
        };
        const setChecked = (label, checked) => {
            const input = field(label);
            input.checked = checked;
            input.dispatchEvent(new Event('change', { bubbles: true }));
        };
        setValue('Connection', 'rounded', 'change');
        setChecked('Link boundary depths', true);
        setValue('Linked depth (m)', '0.35');
        setValue('Stations', 'authored', 'change');
        setChecked('Link runouts', false);
        setValue('Left runout (m)', '0.9');
        setValue('Right runout (m)', '0.6');
        const meeting = editor.querySelector('.building-fab2-boundary-meeting input[type="number"]');
        if (!(meeting instanceof HTMLInputElement)) throw new Error('AI 541 meeting input is missing.');
        meeting.value = '0.3';
        meeting.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await expect(editor).not.toHaveClass(/is-invalid/);
    if (CAPTURE_EDITOR) {
        await editor.screenshot({ path: path.join(CAPTURE_DIR, 'editor-plan-handles-tangents.png') });
    }
    await page.evaluate(() => {
        const button = [...document.querySelectorAll('[data-role="bay-boundary-editor"] .building-fab2-boundary-actions button')]
            .find((entry) => entry.textContent?.trim() === 'Apply');
        if (!(button instanceof HTMLButtonElement)) throw new Error('Live AI 541 Apply button is missing.');
        button.click();
    });

    const applied = await page.evaluate(() => {
        const view = window.__busSim.sm.current.view;
        const layer = view._currentConfig.layers.find((entry) => entry.type === 'floor');
        const bays = view._currentConfig.facades[layer.id].A.layout.bays.items;
        return {
            relationship: layer.bayBoundaryConnections,
            depths: bays.map((bay) => bay.depth)
        };
    });
    expect(applied.relationship.connections).toHaveLength(1);
    expect(applied.relationship.connections[0].type).toBe('rounded');
    expect(applied.relationship.connections[0].transition).toMatchObject({
        mode: 'authored', leftRunoutMeters: 0.9, rightRunoutMeters: 0.6, meeting: 0.3
    });
    expect(applied.depths[0].right).toBe(0.35);
    expect(applied.depths[1].left).toBe(0.35);

    await page.keyboard.press('Control+Z');
    expect(await page.evaluate(() => {
        const layer = window.__busSim.sm.current.view._currentConfig.layers.find((entry) => entry.type === 'floor');
        return Object.hasOwn(layer, 'bayBoundaryConnections');
    })).toBe(false);
    await page.keyboard.press('Control+Y');
    expect(await page.evaluate(() => {
        const layer = window.__busSim.sm.current.view._currentConfig.layers.find((entry) => entry.type === 'floor');
        return layer.bayBoundaryConnections?.connections?.[0]?.type;
    })).toBe('rounded');

    await page.evaluate(() => {
        const editor = document.querySelector('[data-role="bay-boundary-editor"]');
        const wrap = [...(editor?.querySelectorAll('label') ?? [])]
            .find((entry) => entry.querySelector('span')?.textContent?.trim() === 'Left runout (m)');
        const input = wrap?.querySelector('input');
        if (!(input instanceof HTMLInputElement)) throw new Error('Live left runout input is missing.');
        input.value = '1.7';
        input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.evaluate(() => {
        const button = [...document.querySelectorAll('[data-role="bay-boundary-editor"] .building-fab2-boundary-actions button')]
            .find((entry) => entry.textContent?.trim() === 'Cancel');
        if (!(button instanceof HTMLButtonElement)) throw new Error('Live AI 541 Cancel button is missing.');
        button.click();
    });
    await expect(floor.locator('[data-role="bay-boundary-editor"]').first().getByLabel('Left runout (m)')).toHaveValue('0.9');
    expect(errors).toEqual([]);
});
