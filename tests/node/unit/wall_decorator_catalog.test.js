// Node unit tests: wall decorator catalog + procedural shape placement model.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
    buildWallDecoratorShapeSpecs,
    getDefaultWallDecoratorDebuggerState,
    getWallDecoratorCatalogEntryById,
    getWallDecoratorCatalogOptions,
    getWallDecoratorPresetOptions,
    getWallDecoratorTypePropertySpecsById,
    loadWallDecoratorCatalogEntry,
    sanitizeWallDecoratorDebuggerState,
    WALL_DECORATOR_ID,
    WALL_DECORATOR_MODE,
    WALL_DECORATOR_PROPERTY_TYPE,
    WALL_DECORATOR_POSITION,
    WALL_DECORATOR_WHERE_TO_APPLY
} from '../../../src/app/buildings/wall_decorators/index.js';

function assertNear(actual, expected, eps = 1e-9, msg = '') {
    const a = Number(actual);
    const e = Number(expected);
    assert.ok(Number.isFinite(a), `Expected finite number. ${msg}`);
    assert.ok(Math.abs(a - e) <= eps, `${msg} (actual=${a}, expected=${e}, eps=${eps})`);
}

test('WallDecoratorCatalog: defaults and options expose wall decorator entries', () => {
    const options = getWallDecoratorCatalogOptions();
    assert.ok(options.some((opt) => opt.id === WALL_DECORATOR_ID.SIMPLE_SKIRT));
    assert.ok(options.some((opt) => opt.id === WALL_DECORATOR_ID.RIBBON));
    assert.ok(options.some((opt) => opt.id === WALL_DECORATOR_ID.EDGE_BRICK_CHAIN));
    assert.ok(options.some((opt) => opt.id === WALL_DECORATOR_ID.CORNICE_BASIC_BLOCK));
    assert.ok(options.some((opt) => opt.id === WALL_DECORATOR_ID.CORNICE_ROUNDED));
    assert.ok(options.some((opt) => opt.id === WALL_DECORATOR_ID.HALF_DOME));
    assert.ok(options.some((opt) => opt.id === WALL_DECORATOR_ID.ANGLED_SUPPORT_PROFILE));
    assert.equal(getWallDecoratorPresetOptions().length, 0, 'Expected empty wall-decoration preset catalog.');

    const entry = getWallDecoratorCatalogEntryById(WALL_DECORATOR_ID.SIMPLE_SKIRT);
    assert.ok(entry);
    assert.equal(entry.id, WALL_DECORATOR_ID.SIMPLE_SKIRT);
    assert.equal(typeof entry.createShapeSpecs, 'function');
    assert.ok(Array.isArray(entry.properties), 'Expected type metadata to expose property descriptors.');
    assert.ok(entry.properties.length > 0, 'Expected non-empty property metadata.');
    assert.ok(Array.isArray(entry.presets), 'Expected per-type preset metadata.');
    assert.ok(entry.presets.length >= 3, 'Expected simple skirt presets.');
    assert.ok(entry.presets.some((preset) => preset?.id === 'medium'), 'Expected medium simple-skirt preset.');
    assert.ok(Array.isArray(entry.presetGroups) && entry.presetGroups.length >= 2, 'Expected grouped presets metadata for simple skirt.');
    const propertySpecs = getWallDecoratorTypePropertySpecsById(WALL_DECORATOR_ID.SIMPLE_SKIRT);
    const simpleSkirtPropertyIds = propertySpecs.map((spec) => String(spec?.id ?? ''));
    assert.deepEqual(
        simpleSkirtPropertyIds,
        ['heightMeters', 'offsetScale', 'nearEdgeOffsetMeters'],
        'Expected simple skirt properties to expose raw numeric controls.'
    );

    const ribbonEntry = getWallDecoratorCatalogEntryById(WALL_DECORATOR_ID.RIBBON);
    assert.ok(ribbonEntry);
    assert.equal(ribbonEntry.id, WALL_DECORATOR_ID.RIBBON);
    assert.equal(typeof ribbonEntry.createShapeSpecs, 'function');
    assert.ok(Array.isArray(ribbonEntry.presets) && ribbonEntry.presets.length >= 3, 'Expected ribbon presets.');
    assert.ok(Array.isArray(ribbonEntry.presetGroups) && ribbonEntry.presetGroups.length >= 2, 'Expected grouped ribbon presets metadata.');
    const ribbonPropertySpecs = getWallDecoratorTypePropertySpecsById(WALL_DECORATOR_ID.RIBBON);
    const ribbonPropertyIds = ribbonPropertySpecs.map((spec) => String(spec?.id ?? ''));
    assert.deepEqual(
        ribbonPropertyIds,
        ['heightMeters', 'offsetScale', 'nearEdgeOffsetMeters', 'patternId', 'patternNormalIntensity'],
        'Expected ribbon type to expose dedicated skirt-like sizing + pattern detail controls.'
    );
    const patternSpec = ribbonPropertySpecs.find((spec) => spec?.id === 'patternId') ?? null;
    assert.equal(patternSpec?.type, WALL_DECORATOR_PROPERTY_TYPE.ENUM, 'Expected ribbon pattern property to be enum.');
    assert.equal(patternSpec?.picker, 'thumbnail', 'Expected ribbon pattern selector to use thumbnail picker metadata.');
    const patternOptionIds = (patternSpec?.options ?? []).map((opt) => String(opt?.id ?? ''));
    assert.ok(patternOptionIds.includes('circle'), 'Expected circle ribbon pattern option.');
    assert.ok(patternOptionIds.includes('flat_base_x'), 'Expected flat-base X ribbon pattern option.');

    const edgeBrickChainEntry = getWallDecoratorCatalogEntryById(WALL_DECORATOR_ID.EDGE_BRICK_CHAIN);
    assert.ok(edgeBrickChainEntry);
    assert.equal(edgeBrickChainEntry.id, WALL_DECORATOR_ID.EDGE_BRICK_CHAIN);
    assert.equal(typeof edgeBrickChainEntry.createShapeSpecs, 'function');
    assert.ok(Array.isArray(edgeBrickChainEntry.presets) && edgeBrickChainEntry.presets.length >= 3, 'Expected edge-brick presets.');
    assert.ok(Array.isArray(edgeBrickChainEntry.presetGroups) && edgeBrickChainEntry.presetGroups.length >= 2, 'Expected grouped edge-brick presets metadata.');
    const edgeBrickChainPropertySpecs = getWallDecoratorTypePropertySpecsById(WALL_DECORATOR_ID.EDGE_BRICK_CHAIN);
    const edgeBrickChainPropertyIds = edgeBrickChainPropertySpecs.map((spec) => String(spec?.id ?? ''));
    assert.deepEqual(
        edgeBrickChainPropertyIds,
        ['edgeTarget', 'startY', 'endY', 'brickHeight', 'depthScaleMultiplier', 'snapToFit'],
        'Expected edge brick chain metadata for edge targeting, range, and snap controls.'
    );

    const corniceEntry = getWallDecoratorCatalogEntryById(WALL_DECORATOR_ID.CORNICE_BASIC_BLOCK);
    assert.ok(corniceEntry);
    assert.equal(corniceEntry.id, WALL_DECORATOR_ID.CORNICE_BASIC_BLOCK);
    assert.equal(corniceEntry.label, 'Cornice Blocks', 'Expected renamed cornice label.');
    assert.equal(typeof corniceEntry.createShapeSpecs, 'function');
    assert.ok(Array.isArray(corniceEntry.presets) && corniceEntry.presets.length >= 2, 'Expected cornice presets.');
    assert.ok(corniceEntry.presets.some((preset) => preset?.id === 'small'), 'Expected small cornice preset.');
    assert.ok(corniceEntry.presets.some((preset) => preset?.id === 'medium'), 'Expected medium cornice preset.');
    assert.ok(Array.isArray(corniceEntry.presetGroups) && corniceEntry.presetGroups.length >= 3, 'Expected grouped cornice presets metadata.');
    const corniceBlockSizeGroup = (corniceEntry.presetGroups ?? [])
        .find((group) => String(group?.id ?? '') === 'block_size') ?? null;
    assert.ok(corniceBlockSizeGroup, 'Expected cornice block-size preset group.');
    assert.equal(String(corniceBlockSizeGroup?.label ?? ''), 'Block size', 'Expected cornice block-size preset group label.');
    const corniceBlockSizeById = new Map((corniceBlockSizeGroup?.options ?? []).map((opt) => [String(opt?.id ?? ''), opt]));
    assertNear(corniceBlockSizeById.get('small')?.configuration?.blockSizeMeters, 0.05, 1e-9, 'Expected small cornice block size = 5cm.');
    assertNear(corniceBlockSizeById.get('medium')?.configuration?.blockSizeMeters, 0.10, 1e-9, 'Expected medium cornice block size = 10cm.');
    assertNear(corniceBlockSizeById.get('large')?.configuration?.blockSizeMeters, 0.15, 1e-9, 'Expected large cornice block size = 15cm.');
    const corniceSpacingGroup = (corniceEntry.presetGroups ?? [])
        .find((group) => String(group?.id ?? '') === 'spacing') ?? null;
    assert.ok(corniceSpacingGroup, 'Expected cornice spacing preset group.');
    assert.equal(String(corniceSpacingGroup?.label ?? ''), 'Spacing', 'Expected cornice spacing preset group label.');
    const corniceSpacingById = new Map((corniceSpacingGroup?.options ?? []).map((opt) => [String(opt?.id ?? ''), opt]));
    assert.equal(corniceSpacingById.get('match_block')?.configuration?.spacingMode, 'match_block', 'Expected match-block spacing preset mode.');
    assertNear(corniceSpacingById.get('small')?.configuration?.spacingMeters, 0.10, 1e-9, 'Expected small fixed spacing preset = 10cm.');
    assertNear(corniceSpacingById.get('medium')?.configuration?.spacingMeters, 0.20, 1e-9, 'Expected medium fixed spacing preset = 20cm.');
    assertNear(corniceSpacingById.get('large')?.configuration?.spacingMeters, 0.30, 1e-9, 'Expected large fixed spacing preset = 30cm.');
    assert.equal(corniceSpacingById.get('small')?.configuration?.spacingMode, 'fixed', 'Expected small spacing preset fixed mode.');
    assert.equal(corniceSpacingById.get('medium')?.configuration?.spacingMode, 'fixed', 'Expected medium spacing preset fixed mode.');
    assert.equal(corniceSpacingById.get('large')?.configuration?.spacingMode, 'fixed', 'Expected large spacing preset fixed mode.');
    const corniceAngleGroup = (corniceEntry.presetGroups ?? [])
        .find((group) => String(group?.id ?? '') === 'front_angle') ?? null;
    assert.ok(corniceAngleGroup, 'Expected cornice front-angle preset group.');
    assert.equal(String(corniceAngleGroup?.label ?? ''), 'Angle', 'Expected cornice front-angle preset group label.');
    const corniceAngleById = new Map((corniceAngleGroup?.options ?? []).map((opt) => [String(opt?.id ?? ''), opt]));
    assertNear(corniceAngleById.get('flat')?.configuration?.frontBottomLiftScale, 0.0, 1e-9, 'Expected flat angle preset to keep zero front lift.');
    assertNear(corniceAngleById.get('angle')?.configuration?.frontBottomLiftScale, 0.5, 1e-9, 'Expected angle preset to lift front-bottom by half block size.');
    assert.equal(String(corniceEntry?.catalogSectionId ?? ''), 'cornice', 'Expected cornice type in Cornice catalog section.');
    assert.equal(String(corniceEntry?.catalogSectionLabel ?? ''), 'Cornice', 'Expected cornice section label.');
    assert.equal(String(corniceEntry?.defaultPlacement?.position ?? ''), WALL_DECORATOR_POSITION.TOP, 'Expected cornice default placement position metadata.');
    assert.equal(String(corniceEntry?.defaultPlacement?.mode ?? ''), WALL_DECORATOR_MODE.CORNER, 'Expected cornice default placement mode metadata.');
    const cornicePropertySpecs = getWallDecoratorTypePropertySpecsById(WALL_DECORATOR_ID.CORNICE_BASIC_BLOCK);
    const cornicePropertyIds = cornicePropertySpecs.map((spec) => String(spec?.id ?? ''));
    assert.deepEqual(
        cornicePropertyIds,
        ['blockSizeMeters', 'spacingMode', 'spacingMeters', 'frontBottomLiftScale', 'snapToFit'],
        'Expected cornice metadata to expose preset and snap controls.'
    );

    const corniceRoundedEntry = getWallDecoratorCatalogEntryById(WALL_DECORATOR_ID.CORNICE_ROUNDED);
    assert.ok(corniceRoundedEntry);
    assert.equal(corniceRoundedEntry.id, WALL_DECORATOR_ID.CORNICE_ROUNDED);
    assert.equal(corniceRoundedEntry.label, 'Cornice Rounded', 'Expected cornice rounded label.');
    assert.equal(typeof corniceRoundedEntry.createShapeSpecs, 'function');
    assert.equal(
        String(corniceRoundedEntry?.defaultPlacement?.position ?? ''),
        WALL_DECORATOR_POSITION.TOP,
        'Expected cornice rounded default placement position metadata.'
    );
    assert.equal(
        String(corniceRoundedEntry?.defaultPlacement?.mode ?? ''),
        WALL_DECORATOR_MODE.CORNER,
        'Expected cornice rounded default placement mode metadata.'
    );
    const corniceRoundedPropertySpecs = getWallDecoratorTypePropertySpecsById(WALL_DECORATOR_ID.CORNICE_ROUNDED);
    const corniceRoundedPropertyIds = corniceRoundedPropertySpecs.map((spec) => String(spec?.id ?? ''));
    assert.deepEqual(
        corniceRoundedPropertyIds,
        ['blockSizeMeters', 'spacingMode', 'spacingMeters', 'curvature', 'snapToFit'],
        'Expected cornice rounded configuration properties (no angle control, with curvature mode).'
    );

    const halfDomeEntry = getWallDecoratorCatalogEntryById(WALL_DECORATOR_ID.HALF_DOME);
    assert.ok(halfDomeEntry);
    assert.equal(halfDomeEntry.id, WALL_DECORATOR_ID.HALF_DOME);
    assert.equal(typeof halfDomeEntry.createShapeSpecs, 'function');
    assert.ok(Array.isArray(halfDomeEntry.presets) && halfDomeEntry.presets.length >= 3, 'Expected half-dome presets.');
    const halfDomePresetById = new Map((halfDomeEntry.presets ?? []).map((preset) => [String(preset?.id ?? ''), preset]));
    assert.ok(halfDomePresetById.has('tiny'), 'Expected tiny curved-ring preset.');
    assert.ok(halfDomePresetById.has('small'), 'Expected small curved-ring preset.');
    assert.ok(halfDomePresetById.has('medium'), 'Expected medium curved-ring preset.');
    assert.ok(halfDomePresetById.has('large'), 'Expected large curved-ring preset.');
    assertNear(halfDomePresetById.get('tiny')?.configuration?.diameterMeters, 0.01, 1e-9, 'Expected tiny curved-ring preset diameter = 1cm.');
    assertNear(halfDomePresetById.get('small')?.configuration?.diameterMeters, 0.05, 1e-9, 'Expected small curved-ring preset diameter = 5cm.');
    assertNear(halfDomePresetById.get('medium')?.configuration?.diameterMeters, 0.10, 1e-9, 'Expected medium curved-ring preset diameter = 10cm.');
    assertNear(halfDomePresetById.get('large')?.configuration?.diameterMeters, 0.20, 1e-9, 'Expected large curved-ring preset diameter = 20cm.');
    const halfDomePropertySpecs = getWallDecoratorTypePropertySpecsById(WALL_DECORATOR_ID.HALF_DOME);
    assert.ok(halfDomePropertySpecs.some((spec) => spec.id === 'diameterMeters'), 'Expected diameter control for half dome.');
    assert.ok(halfDomePropertySpecs.some((spec) => spec.id === 'outsetMeters'), 'Expected outset control for half dome.');
    const halfDomeDiameterSpec = halfDomePropertySpecs.find((spec) => spec?.id === 'diameterMeters') ?? null;
    assertNear(halfDomeDiameterSpec?.min, 0.01, 1e-9, 'Expected curved-ring diameter min to allow 1cm.');

    const angledSupportEntry = getWallDecoratorCatalogEntryById(WALL_DECORATOR_ID.ANGLED_SUPPORT_PROFILE);
    assert.ok(angledSupportEntry);
    assert.equal(angledSupportEntry.id, WALL_DECORATOR_ID.ANGLED_SUPPORT_PROFILE);
    assert.equal(typeof angledSupportEntry.createShapeSpecs, 'function');
    assert.ok(Array.isArray(angledSupportEntry.presets) && angledSupportEntry.presets.length >= 3, 'Expected angled-support presets.');
    const angledSupportPropertySpecs = getWallDecoratorTypePropertySpecsById(WALL_DECORATOR_ID.ANGLED_SUPPORT_PROFILE);
    const angledSupportPropertyIds = angledSupportPropertySpecs.map((spec) => String(spec?.id ?? ''));
    assert.deepEqual(
        angledSupportPropertyIds,
        ['offset', 'height', 'topCapAngleDeg', 'bottomCapAngleDeg'],
        'Expected angled support profile to expose offset/height plus top/bottom cap angle controls.'
    );

    const state = getDefaultWallDecoratorDebuggerState();
    assert.equal(state.decoratorId, '');
    assert.equal(state.whereToApply, WALL_DECORATOR_WHERE_TO_APPLY.ENTIRE_FACADE);
    assert.equal(state.mode, WALL_DECORATOR_MODE.FACE);
    assert.equal(state.position, WALL_DECORATOR_POSITION.BOTTOM);
    assert.deepEqual(state.configuration, {}, 'Expected no configuration until a decorator type is selected.');
    assert.equal(state.materialSelection.kind, 'match_wall');
    assert.equal(state.materialSelection.id, 'match_wall');
    const defaultSpecs = buildWallDecoratorShapeSpecs(state, { widthMeters: 10, heightMeters: 3.5, depthMeters: 0.3 });
    assert.equal(defaultSpecs.length, 0, 'Expected no default decorator mesh/spec until a type is selected.');

    const corniceDefault = getDefaultWallDecoratorDebuggerState({ decoratorId: WALL_DECORATOR_ID.CORNICE_BASIC_BLOCK });
    assert.equal(corniceDefault.position, WALL_DECORATOR_POSITION.TOP, 'Expected cornice default placement at top.');
    assert.equal(corniceDefault.mode, WALL_DECORATOR_MODE.CORNER, 'Expected cornice default mode at corner.');
    assertNear(corniceDefault.configuration.blockSizeMeters, 0.10, 1e-9, 'Expected cornice default block size = 10cm.');
    assert.equal(String(corniceDefault.configuration.spacingMode), 'match_block', 'Expected cornice default spacing mode = match_block.');
    assertNear(corniceDefault.configuration.spacingMeters, 0.10, 1e-9, 'Expected cornice default spacing = 10cm.');
    assertNear(corniceDefault.configuration.frontBottomLiftScale, 0.0, 1e-9, 'Expected cornice default front-bottom lift scale = 0.');
    assert.equal(corniceDefault.configuration.snapToFit, true, 'Expected cornice snap enabled by default.');

    const corniceRoundedDefault = getDefaultWallDecoratorDebuggerState({ decoratorId: WALL_DECORATOR_ID.CORNICE_ROUNDED });
    assert.equal(corniceRoundedDefault.position, WALL_DECORATOR_POSITION.TOP, 'Expected cornice rounded default placement at top.');
    assert.equal(corniceRoundedDefault.mode, WALL_DECORATOR_MODE.CORNER, 'Expected cornice rounded default mode at corner.');
    assertNear(corniceRoundedDefault.configuration.blockSizeMeters, 0.10, 1e-9, 'Expected cornice rounded default block size = 10cm.');
    assert.equal(String(corniceRoundedDefault.configuration.spacingMode), 'match_block', 'Expected cornice rounded default spacing mode = match_block.');
    assertNear(corniceRoundedDefault.configuration.spacingMeters, 0.10, 1e-9, 'Expected cornice rounded default spacing = 10cm.');
    assert.equal(String(corniceRoundedDefault.configuration.curvature), 'convex', 'Expected cornice rounded default curvature = convex.');
    assert.equal(corniceRoundedDefault.configuration.snapToFit, true, 'Expected cornice rounded snap enabled by default.');
});

test('WallDecoratorCatalog: load entry preserves where/mode and conditionally keeps or remaps position by default-position transition', () => {
    const dirty = sanitizeWallDecoratorDebuggerState({
        decoratorId: WALL_DECORATOR_ID.SIMPLE_SKIRT,
        whereToApply: WALL_DECORATOR_WHERE_TO_APPLY.HALF,
        mode: WALL_DECORATOR_MODE.FACE,
        position: WALL_DECORATOR_POSITION.NEAR_TOP,
        materialSelection: { kind: 'color', id: 'belt.white' },
        wallBase: { tintHex: 0x123456, roughness: 0.2, normalStrength: 1.7 },
        tiling: { enabled: true, tileMetersU: 0.5, tileMetersV: 0.5, uvEnabled: true, offsetU: 2, offsetV: 2, rotationDegrees: 23 }
    });

    const loaded = loadWallDecoratorCatalogEntry(dirty, WALL_DECORATOR_ID.RIBBON);
    assert.equal(loaded.decoratorId, WALL_DECORATOR_ID.RIBBON);
    assert.equal(loaded.whereToApply, WALL_DECORATOR_WHERE_TO_APPLY.HALF, 'Expected where-to-apply preserved across type switch.');
    assert.equal(loaded.mode, WALL_DECORATOR_MODE.FACE, 'Expected mode preserved across type switch.');
    assert.equal(
        loaded.position,
        WALL_DECORATOR_POSITION.NEAR_TOP,
        'Expected position preserved when previous/new type share the same default position.'
    );
    assert.equal(loaded.materialSelection.kind, 'match_wall');
    assert.equal(loaded.materialSelection.id, 'match_wall');
    assert.equal(loaded.tiling.enabled, false);
    assert.equal(loaded.tiling.uvEnabled, false);
    assert.equal(typeof loaded.wallBase.tintHueDeg, 'number');
    assert.equal(typeof loaded.wallBase.tintSaturation, 'number');
    assert.equal(typeof loaded.wallBase.tintValue, 'number');
    assert.equal(typeof loaded.wallBase.tintIntensity, 'number');
    assert.equal(loaded.wallBase.tintBrightness, 1);
    assertNear(loaded.configuration.heightMeters, 0.50, 1e-9, 'Expected ribbon default height.');
    assertNear(loaded.configuration.offsetScale, 1.0, 1e-9, 'Expected ribbon default offset scale.');
    assertNear(loaded.configuration.nearEdgeOffsetMeters, 0.1, 1e-9, 'Expected near-edge offset default.');
    assert.equal(typeof loaded.configuration.patternId, 'string', 'Expected type-specific ribbon pattern default.');

    const corniceLoaded = loadWallDecoratorCatalogEntry(dirty, WALL_DECORATOR_ID.CORNICE_BASIC_BLOCK);
    assert.equal(corniceLoaded.decoratorId, WALL_DECORATOR_ID.CORNICE_BASIC_BLOCK);
    assert.equal(corniceLoaded.whereToApply, WALL_DECORATOR_WHERE_TO_APPLY.HALF, 'Expected where-to-apply preserved on cornice switch.');
    assert.equal(corniceLoaded.mode, WALL_DECORATOR_MODE.FACE, 'Expected mode preserved on cornice switch.');
    assert.equal(
        corniceLoaded.position,
        WALL_DECORATOR_POSITION.TOP,
        'Expected position remap when new type default position differs from previous type default.'
    );
    assertNear(corniceLoaded.configuration.blockSizeMeters, 0.10, 1e-9, 'Expected cornice default block size on type selection.');
    assert.equal(String(corniceLoaded.configuration.spacingMode), 'match_block', 'Expected cornice default spacing mode on type selection.');
    assertNear(corniceLoaded.configuration.spacingMeters, 0.10, 1e-9, 'Expected cornice default spacing on type selection.');
    assertNear(corniceLoaded.configuration.frontBottomLiftScale, 0.0, 1e-9, 'Expected cornice default front-bottom lift scale on type selection.');
});

test('WallDecoratorCatalog: every decorator type defaults material selection to match_wall', () => {
    const types = [
        WALL_DECORATOR_ID.SIMPLE_SKIRT,
        WALL_DECORATOR_ID.RIBBON,
        WALL_DECORATOR_ID.EDGE_BRICK_CHAIN,
        WALL_DECORATOR_ID.CORNICE_BASIC_BLOCK,
        WALL_DECORATOR_ID.CORNICE_ROUNDED,
        WALL_DECORATOR_ID.HALF_DOME,
        WALL_DECORATOR_ID.ANGLED_SUPPORT_PROFILE
    ];

    for (const typeId of types) {
        const loaded = loadWallDecoratorCatalogEntry(getDefaultWallDecoratorDebuggerState(), typeId);
        assert.equal(loaded.materialSelection.kind, 'match_wall', `Expected ${typeId} default material kind to be match_wall.`);
        assert.equal(loaded.materialSelection.id, 'match_wall', `Expected ${typeId} default material id sentinel.`);
    }
});

test('WallDecoratorCatalog: material selection supports match_wall mode', () => {
    const state = sanitizeWallDecoratorDebuggerState({
        decoratorId: WALL_DECORATOR_ID.HALF_DOME,
        materialSelection: {
            kind: 'match wall',
            id: 'should_be_ignored'
        }
    });

    assert.equal(state.materialSelection.kind, 'match_wall', 'Expected material kind normalization for match wall mode.');
    assert.equal(state.materialSelection.id, 'match_wall', 'Expected material id to normalize to match_wall sentinel.');
});

test('WallDecoratorCatalog: typed configuration metadata sanitizes enum/float values', () => {
    const state = sanitizeWallDecoratorDebuggerState({
        decoratorId: WALL_DECORATOR_ID.SIMPLE_SKIRT,
        configuration: {
            heightMeters: -99,
            offsetScale: 999,
            nearEdgeOffsetMeters: 999
        }
    });

    assertNear(state.configuration.heightMeters, 0.05, 1e-9, 'Expected height to clamp to min.');
    assertNear(state.configuration.offsetScale, 4.0, 1e-9, 'Expected offset-scale to clamp to max.');
    assertNear(state.configuration.nearEdgeOffsetMeters, 2.0, 1e-9, 'Expected near-edge offset to clamp to max.');
});

test('WallDecoratorCatalog: Ribbon specs follow skirt-style face/cap rules and carry pattern-normal metadata', () => {
    const wall = { widthMeters: 10, heightMeters: 3.5, depthMeters: 0.3 };
    const state = sanitizeWallDecoratorDebuggerState({
        decoratorId: WALL_DECORATOR_ID.RIBBON,
        whereToApply: WALL_DECORATOR_WHERE_TO_APPLY.HALF,
        mode: WALL_DECORATOR_MODE.CORNER,
        position: WALL_DECORATOR_POSITION.NEAR_TOP,
        configuration: {
            heightMeters: 0.20,
            offsetScale: 2.0,
            nearEdgeOffsetMeters: 0.12,
            patternId: 'flat_base_x',
            patternNormalIntensity: 2.1
        }
    });
    const specs = buildWallDecoratorShapeSpecs(state, wall);

    const frontMain = specs.find((s) => s?.role === 'front_main') ?? null;
    const rightMain = specs.find((s) => s?.role === 'right_main') ?? null;
    const frontTopCap = specs.find((s) => s?.role === 'front_cap_top') ?? null;
    const rightTopCap = specs.find((s) => s?.role === 'right_cap_top') ?? null;
    const frontBottomCap = specs.find((s) => s?.role === 'front_cap_bottom') ?? null;
    const rightBottomCap = specs.find((s) => s?.role === 'right_cap_bottom') ?? null;
    const frontSideStartCap = specs.find((s) => s?.role === 'front_cap_side_start') ?? null;
    const rightSideEndCap = specs.find((s) => s?.role === 'right_cap_side_end') ?? null;
    assert.equal(specs.length, 8, 'Expected ribbon corner mode to emit front/right panels + top/bottom caps + non-corner side caps.');
    assert.ok(frontMain && rightMain, 'Expected ribbon front/right panels.');
    assert.ok(frontTopCap && rightTopCap && frontBottomCap && rightBottomCap, 'Expected ribbon top/bottom caps on both faces.');
    assert.ok(frontSideStartCap && rightSideEndCap, 'Expected ribbon side caps on non-corner edges.');
    assert.equal(specs.some((s) => s?.role === 'corner_joint_45'), false, 'Expected no separate corner joint mesh in ribbon corner mode.');
    assert.equal(frontMain.geometryKind, 'flat_panel', 'Expected ribbon main panel to keep flat-panel geometry path.');
    assert.equal(rightMain.geometryKind, 'flat_panel', 'Expected ribbon right panel to keep flat-panel geometry path.');
    assert.equal(frontTopCap.geometryKind, 'flat_panel_cap', 'Expected ribbon top cap to keep flat-cap geometry path.');
    assert.equal(frontSideStartCap.geometryKind, 'flat_panel_side_cap', 'Expected ribbon side cap to keep flat-side-cap geometry path.');
    assert.equal(frontMain.ribbonPatternId, 'flat_base_x', 'Expected selected ribbon pattern id propagated to mesh specs.');
    assertNear(frontMain.ribbonPatternNormalIntensity, 2.1, 1e-9, 'Expected ribbon normal intensity propagated to specs.');
    assertNear(frontMain.outsetMeters, 0.04, 1e-9, 'Expected small+extra ribbon outward offset to match skirt preset rules.');
    assertNear(frontMain.widthMeters, 5.04, 1e-9, 'Expected corner front width to add +offset.');
    assertNear(rightMain.widthMeters, 5.04, 1e-9, 'Expected corner right width to add +offset.');
    assertNear(frontTopCap.cornerBridgeEndMeters, 0.04, 1e-9, 'Expected front top cap corner bridge.');
    assertNear(rightTopCap.cornerBridgeStartMeters, 0.04, 1e-9, 'Expected right top cap corner bridge.');
});

test('WallDecoratorCatalog: Edge Brick Chain targets edges only and supports snap-to-fit alternating courses', () => {
    const wall = { widthMeters: 10, heightMeters: 3.5, depthMeters: 0.3 };

    const rawState = sanitizeWallDecoratorDebuggerState({
        decoratorId: WALL_DECORATOR_ID.EDGE_BRICK_CHAIN,
        whereToApply: WALL_DECORATOR_WHERE_TO_APPLY.ENTIRE_FACADE,
        mode: WALL_DECORATOR_MODE.FACE,
        configuration: {
            edgeTarget: 'both',
            startY: 0.0,
            endY: 1.0,
            brickHeight: 0.30,
            snapToFit: false
        }
    });
    const rawSpecs = buildWallDecoratorShapeSpecs(rawState, wall);
    const rawFrontLeft = rawSpecs.filter((s) => s?.faceId === 'front' && s?.edgeColumn === 'left');
    const rawFrontRight = rawSpecs.filter((s) => s?.faceId === 'front' && s?.edgeColumn === 'right');
    assert.equal(rawFrontLeft.length, 4, 'Expected 4 uniform-height courses on front left edge (raw sizing with partial terminal).');
    assert.equal(rawFrontRight.length, 4, 'Expected same course count on front right edge in both-edge mode.');
    const rawHeights = rawFrontLeft.map((spec) => Number(spec?.heightMeters) || 0);
    assertNear(rawHeights[0], 0.30, 1e-9, 'Expected first raw course height.');
    assertNear(rawHeights[1], 0.30, 1e-9, 'Expected second raw course height.');
    assertNear(rawHeights[2], 0.30, 1e-9, 'Expected third raw course height.');
    assertNear(rawHeights[3], 0.10, 1e-9, 'Expected partial terminal course when snap-to-fit is disabled.');
    const rawWidths = rawFrontLeft.map((spec) => Number(spec?.widthMeters) || 0);
    assert.ok(rawWidths[0] > rawWidths[1], 'Expected edge-brick alternation to use longer wall-span width on first course.');
    assert.ok(rawWidths[2] > rawWidths[3], 'Expected edge-brick alternation to keep long/short wall-span width pattern.');
    assertNear(rawWidths[0], rawWidths[2], 1e-9, 'Expected repeating long-width value on even courses.');
    assertNear(rawWidths[1], rawWidths[3], 1e-9, 'Expected repeating short-width value on odd courses.');
    const rawDepths = rawFrontLeft.map((spec) => Number(spec?.depthMeters) || 0);
    for (let i = 0; i < rawFrontLeft.length; i += 1) {
        assertNear(rawFrontLeft[i].heightMeters, rawFrontRight[i].heightMeters, 1e-9, 'Expected same parity sequence on both edges.');
        assertNear(rawFrontLeft[i].centerV, rawFrontRight[i].centerV, 1e-9, 'Expected both edges to start at the same Y range.');
        assertNear(rawFrontLeft[i].widthMeters, rawFrontRight[i].widthMeters, 1e-9, 'Expected both edges to share the same long/short width sequence.');
        assertNear(rawFrontLeft[i].depthMeters, rawFrontRight[i].depthMeters, 1e-9, 'Expected both edges to keep uniform protrusion depth per course.');
        assertNear(rawFrontLeft[i].depthMeters, rawDepths[0], 1e-9, 'Expected protrusion depth to stay constant while width alternates.');
    }
    const rawCaps = rawSpecs.filter((s) => s?.geometryKind === 'flat_panel_cap');
    const rawLeftCaps = rawCaps.filter((s) => String(s?.role ?? '').startsWith('front_left_'));
    const rawRightCaps = rawCaps.filter((s) => String(s?.role ?? '').startsWith('front_right_'));
    assert.equal(rawLeftCaps.length, 5, 'Expected bottom/top silhouette caps plus 3 width-difference seam caps per left-edge column.');
    assert.equal(rawRightCaps.length, 5, 'Expected bottom/top silhouette caps plus 3 width-difference seam caps per right-edge column.');
    const rawLeftBottomFull = rawLeftCaps.find((s) => String(s?.role ?? '').includes('_course_000_cap_bottom_full')) ?? null;
    const rawLeftTopFull = rawLeftCaps.find((s) => String(s?.role ?? '').includes('_course_003_cap_top_full')) ?? null;
    assert.ok(rawLeftBottomFull, 'Expected full bottom cap on first left-edge course silhouette.');
    assert.ok(rawLeftTopFull, 'Expected full top cap on last left-edge course silhouette.');
    assertNear(rawLeftBottomFull?.widthMeters, rawWidths[0], 1e-9, 'Expected first-course full bottom cap width to match long-course width.');
    assertNear(rawLeftTopFull?.widthMeters, rawWidths[3], 1e-9, 'Expected last-course full top cap width to match last-course silhouette.');
    const rawLeftSeamCaps = rawLeftCaps.filter((s) => String(s?.role ?? '').includes('_seam_'));
    assert.equal(rawLeftSeamCaps.length, 3, 'Expected one seam cap for each internal course boundary on left edge.');
    const seamStripWidth = rawWidths[0] - rawWidths[1];
    for (const cap of rawLeftSeamCaps) {
        assertNear(cap?.widthMeters, seamStripWidth, 1e-9, 'Expected seam cap width to match alternating long-vs-short difference.');
    }
    const seamTopCount = rawLeftSeamCaps.filter((s) => String(s?.capSide ?? '') === 'top').length;
    const seamBottomCount = rawLeftSeamCaps.filter((s) => String(s?.capSide ?? '') === 'bottom').length;
    assert.equal(seamTopCount, 2, 'Expected top seam caps where lower course is wider.');
    assert.equal(seamBottomCount, 1, 'Expected bottom seam cap where upper course is wider.');

    const snapCornerState = sanitizeWallDecoratorDebuggerState({
        decoratorId: WALL_DECORATOR_ID.EDGE_BRICK_CHAIN,
        whereToApply: WALL_DECORATOR_WHERE_TO_APPLY.ENTIRE_FACADE,
        mode: WALL_DECORATOR_MODE.CORNER,
        configuration: {
            edgeTarget: 'right',
            startY: 0.0,
            endY: 1.0,
            brickHeight: 0.30,
            snapToFit: true
        }
    });
    const snapSpecs = buildWallDecoratorShapeSpecs(snapCornerState, wall);
    const snapFrontRight = snapSpecs.filter((s) => s?.faceId === 'front' && s?.edgeColumn === 'right');
    const snapRightCorner = snapSpecs.filter((s) => s?.faceId === 'right' && s?.edgeColumn === 'right');
    assert.equal(snapFrontRight.length, 4, 'Expected 4 scaled courses for snapped range.');
    assert.equal(snapRightCorner.length, 4, 'Expected corner continuation on right face for right-edge mode.');
    const snapHeights = snapFrontRight.map((spec) => Number(spec?.heightMeters) || 0);
    assertNear(snapHeights[0], 0.25, 1e-9, 'Expected snap-to-fit scaled first course.');
    assertNear(snapHeights[1], 0.25, 1e-9, 'Expected snap-to-fit scaled second course.');
    assertNear(snapHeights[3], 0.25, 1e-9, 'Expected no partial terminal course in snap-to-fit mode.');
    const snapWidths = snapFrontRight.map((spec) => Number(spec?.widthMeters) || 0);
    assert.ok(snapWidths[0] > snapWidths[1], 'Expected snapped edge-brick courses to alternate long/short wall-span width.');
    assertNear(snapWidths[0], snapWidths[2], 1e-9, 'Expected repeating long-width in snapped sequence.');
    assertNear(snapWidths[1], snapWidths[3], 1e-9, 'Expected repeating short-width in snapped sequence.');
    const snapDepths = snapFrontRight.map((spec) => Number(spec?.depthMeters) || 0);
    assertNear(snapDepths[0], snapDepths[1], 1e-9, 'Expected protrusion depth to remain uniform while snapped widths alternate.');
    for (let i = 0; i < snapFrontRight.length; i += 1) {
        assertNear(
            snapFrontRight[i].widthMeters,
            snapRightCorner[i].widthMeters,
            1e-9,
            'Expected corner continuation courses to keep matching width alternation per course index.'
        );
        assertNear(snapFrontRight[i].depthMeters, snapRightCorner[i].depthMeters, 1e-9, 'Expected corner continuation courses to keep uniform protrusion depth.');
    }
    assert.equal(snapFrontRight.every((s) => s?.miterEnd45 === true), true, 'Expected 45-degree end miter on front corner edge courses.');
    assert.equal(snapRightCorner.every((s) => s?.miterStart45 === true), true, 'Expected 45-degree start miter on corner continuation courses.');
    assert.equal(
        snapFrontRight.every((s) => s?.edgeChainRemoveTopFace === true && s?.edgeChainRemoveBottomFace === true),
        true,
        'Expected edge-brick course meshes to keep top/bottom removed (caps are emitted as separate flat-cap specs).'
    );
    assert.equal(
        snapRightCorner.every((s) => s?.edgeChainRemoveStartFace === true),
        true,
        'Expected corner-continuation courses to remove the internal seam face on the connecting wedge.'
    );
    assert.equal(
        snapFrontRight.every((s) => s?.edgeChainRemoveEndFace === true),
        true,
        'Expected front corner-edge courses to remove their seam-end face to avoid the internal wedge face.'
    );
    assert.equal(
        snapFrontRight.every((s) => s?.edgeChainRemoveWallFace === true),
        true,
        'Expected front edge-brick courses to remove wall-facing face.'
    );
    assert.equal(
        snapRightCorner.every((s) => s?.edgeChainRemoveWallFace === true),
        true,
        'Expected right edge-brick corner courses to remove wall-facing face.'
    );
    const firstFrontRight = snapFrontRight[0] ?? null;
    const firstRightCorner = snapRightCorner[0] ?? null;
    assert.ok(firstFrontRight && firstRightCorner, 'Expected front/right corner courses for corner-edge validation.');
    assertNear((Number(firstFrontRight.centerU) || 0) + (Number(firstFrontRight.widthMeters) || 0) * 0.5, 5.0, 1e-9, 'Expected front corner course to keep full outer reach to the corner edge.');
    assertNear((Number(firstRightCorner.centerU) || 0) - (Number(firstRightCorner.widthMeters) || 0) * 0.5, 0.0, 1e-9, 'Expected right corner course to start exactly at the corner edge.');
    const snapCaps = snapSpecs.filter((s) => s?.geometryKind === 'flat_panel_cap');
    const snapFrontRightCaps = snapCaps.filter((s) => String(s?.role ?? '').startsWith('front_right_'));
    const snapRightCornerCaps = snapCaps.filter((s) => String(s?.role ?? '').startsWith('right_corner_'));
    assert.equal(snapFrontRightCaps.length, 5, 'Expected front corner edge to emit full silhouette caps + seam-only caps.');
    assert.equal(snapRightCornerCaps.length, 5, 'Expected right corner continuation edge to emit full silhouette caps + seam-only caps.');
    const frontBottomFull = snapFrontRightCaps.find((s) => String(s?.role ?? '').includes('_course_000_cap_bottom_full')) ?? null;
    const frontTopFull = snapFrontRightCaps.find((s) => String(s?.role ?? '').includes('_course_003_cap_top_full')) ?? null;
    const rightBottomFull = snapRightCornerCaps.find((s) => String(s?.role ?? '').includes('_course_000_cap_bottom_full')) ?? null;
    const rightTopFull = snapRightCornerCaps.find((s) => String(s?.role ?? '').includes('_course_003_cap_top_full')) ?? null;
    assert.ok(frontBottomFull && frontTopFull && rightBottomFull && rightTopFull, 'Expected full silhouette caps on bottom/top courses for both corner-connected columns.');
    const cornerDepth = Number(snapFrontRight[0]?.depthMeters) || 0.0;
    assertNear(frontBottomFull?.cornerBridgeEndMeters, cornerDepth, 1e-9, 'Expected front bottom silhouette cap to keep corner wedge bridge on end edge.');
    assertNear(frontTopFull?.cornerBridgeEndMeters, cornerDepth, 1e-9, 'Expected front top silhouette cap to keep corner wedge bridge on end edge.');
    assertNear(rightBottomFull?.cornerBridgeStartMeters, cornerDepth, 1e-9, 'Expected right bottom silhouette cap to keep corner wedge bridge on start edge.');
    assertNear(rightTopFull?.cornerBridgeStartMeters, cornerDepth, 1e-9, 'Expected right top silhouette cap to keep corner wedge bridge on start edge.');
    const seamCornerCaps = snapCaps.filter((s) => String(s?.role ?? '').includes('_seam_'));
    assert.equal(
        seamCornerCaps.every((s) => (Number(s?.cornerBridgeStartMeters) || 0.0) === 0.0 && (Number(s?.cornerBridgeEndMeters) || 0.0) === 0.0),
        true,
        'Expected internal seam caps to cover only long-vs-short difference strips, without corner wedge bridges.'
    );

    const leftCornerState = sanitizeWallDecoratorDebuggerState({
        decoratorId: WALL_DECORATOR_ID.EDGE_BRICK_CHAIN,
        whereToApply: WALL_DECORATOR_WHERE_TO_APPLY.ENTIRE_FACADE,
        mode: WALL_DECORATOR_MODE.CORNER,
        configuration: {
            edgeTarget: 'left',
            startY: 0.0,
            endY: 1.0,
            brickHeight: 0.30,
            snapToFit: true
        }
    });
    const leftCornerSpecs = buildWallDecoratorShapeSpecs(leftCornerState, wall);
    const leftFront = leftCornerSpecs.filter((s) => s?.faceId === 'front' && s?.edgeColumn === 'left');
    const leftRightFar = leftCornerSpecs.filter((s) => s?.faceId === 'right' && s?.edgeColumn === 'left');
    const leftCornerMitered = leftCornerSpecs.filter((s) => s?.miterStart45 === true || s?.miterEnd45 === true);
    assert.equal(leftFront.length, 4, 'Expected front left-edge courses in corner mode.');
    assert.equal(leftRightFar.length, 4, 'Expected mirrored right-face far-edge courses in corner mode.');
    assert.equal(leftCornerMitered.length, 0, 'Expected no corner wedge miters when only non-corner edge is targeted.');
});

test('WallDecoratorCatalog: Cornice Basic Block snaps spacing and anchors corners across both faces', () => {
    const wall = { widthMeters: 10, heightMeters: 3.5, depthMeters: 0.3 };

    const snapFaceState = sanitizeWallDecoratorDebuggerState({
        decoratorId: WALL_DECORATOR_ID.CORNICE_BASIC_BLOCK,
        whereToApply: WALL_DECORATOR_WHERE_TO_APPLY.ENTIRE_FACADE,
        mode: WALL_DECORATOR_MODE.FACE,
        position: WALL_DECORATOR_POSITION.TOP,
        configuration: {
            blockSizeMeters: 0.05,
            spacingMode: 'fixed',
            spacingMeters: 0.05,
            snapToFit: true
        }
    });
    const snapFaceSpecs = buildWallDecoratorShapeSpecs(snapFaceState, wall);
    const snapFrontBlocks = snapFaceSpecs.filter((s) => s?.faceId === 'front' && String(s?.role ?? '').startsWith('cornice_front_block_'));
    assert.equal(snapFrontBlocks.length, 200, 'Expected 200 snapped small blocks across full 10m facade with 5cm center pitch.');
    const snapFirst = snapFrontBlocks[0] ?? null;
    const snapSecond = snapFrontBlocks[1] ?? null;
    const snapLast = snapFrontBlocks[snapFrontBlocks.length - 1] ?? null;
    assert.ok(snapFirst && snapSecond && snapLast, 'Expected first/second/last snapped blocks.');
    assertNear((Number(snapFirst.centerU) || 0) - (Number(snapFirst.widthMeters) || 0) * 0.5, -5.0, 1e-9, 'Expected snapped cornice to start flush at left edge.');
    assertNear((Number(snapLast.centerU) || 0) + (Number(snapLast.widthMeters) || 0) * 0.5, 5.0, 1e-9, 'Expected snapped cornice to end flush at right edge.');
    const snapPitch = (Number(snapSecond.centerU) || 0) - (Number(snapFirst.centerU) || 0);
    assertNear(snapPitch, 0.05, 1e-9, 'Expected snapped spacing to be measured center-to-center.');

    const snapExpandedState = sanitizeWallDecoratorDebuggerState({
        decoratorId: WALL_DECORATOR_ID.CORNICE_BASIC_BLOCK,
        whereToApply: WALL_DECORATOR_WHERE_TO_APPLY.ENTIRE_FACADE,
        mode: WALL_DECORATOR_MODE.FACE,
        position: WALL_DECORATOR_POSITION.TOP,
        configuration: {
            blockSizeMeters: 0.05,
            spacingMode: 'fixed',
            spacingMeters: 0.20,
            snapToFit: true
        }
    });
    const snapExpandedSpecs = buildWallDecoratorShapeSpecs(snapExpandedState, wall);
    const snapExpandedBlocks = snapExpandedSpecs.filter((s) => s?.faceId === 'front' && String(s?.role ?? '').startsWith('cornice_front_block_'));
    assert.equal(snapExpandedBlocks.length, 50, 'Expected snapped 20cm pitch run to keep integer count and fit full span.');
    const snapExpandedFirst = snapExpandedBlocks[0] ?? null;
    const snapExpandedSecond = snapExpandedBlocks[1] ?? null;
    const snapExpandedLast = snapExpandedBlocks[snapExpandedBlocks.length - 1] ?? null;
    assert.ok(snapExpandedFirst && snapExpandedSecond && snapExpandedLast, 'Expected first/second/last snapped-expanded blocks.');
    const snapExpandedPitch = (Number(snapExpandedSecond.centerU) || 0) - (Number(snapExpandedFirst.centerU) || 0);
    assert.ok(snapExpandedPitch > 0.20, 'Expected snap-to-fit to slightly increase pitch so blocks terminate at wall edges.');
    assertNear((Number(snapExpandedFirst.centerU) || 0) - (Number(snapExpandedFirst.widthMeters) || 0) * 0.5, -5.0, 1e-9, 'Expected snapped-expanded run to start flush at left edge.');
    assertNear((Number(snapExpandedLast.centerU) || 0) + (Number(snapExpandedLast.widthMeters) || 0) * 0.5, 5.0, 1e-9, 'Expected snapped-expanded run to end flush at right edge.');

    const matchBlockModeState = sanitizeWallDecoratorDebuggerState({
        decoratorId: WALL_DECORATOR_ID.CORNICE_BASIC_BLOCK,
        whereToApply: WALL_DECORATOR_WHERE_TO_APPLY.ENTIRE_FACADE,
        mode: WALL_DECORATOR_MODE.FACE,
        position: WALL_DECORATOR_POSITION.TOP,
        configuration: {
            blockSizeMeters: 0.10,
            spacingMode: 'match_block',
            spacingMeters: 0.40,
            frontBottomLiftScale: 0.5,
            snapToFit: false
        }
    });
    const matchBlockModeSpecs = buildWallDecoratorShapeSpecs(matchBlockModeState, wall);
    const matchBlockFrontBlocks = matchBlockModeSpecs.filter((s) => s?.faceId === 'front' && String(s?.role ?? '').startsWith('cornice_front_block_'));
    const matchBlockFirst = matchBlockFrontBlocks[0] ?? null;
    const matchBlockSecond = matchBlockFrontBlocks[1] ?? null;
    assert.ok(matchBlockFirst && matchBlockSecond, 'Expected first/second blocks for match-block spacing mode.');
    assertNear(
        (Number(matchBlockSecond.centerU) || 0) - (Number(matchBlockFirst.centerU) || 0),
        0.20,
        1e-9,
        'Expected match-block spacing mode to force center pitch = 2x block size, independent of fixed spacing value.'
    );
    assertNear(
        Number(matchBlockFirst?.corniceFrontBottomLiftMeters) || 0,
        0.05,
        1e-9,
        'Expected angle mode to lift front-bottom by half block size.'
    );

    const unsnappedFaceState = sanitizeWallDecoratorDebuggerState({
        decoratorId: WALL_DECORATOR_ID.CORNICE_BASIC_BLOCK,
        whereToApply: WALL_DECORATOR_WHERE_TO_APPLY.ENTIRE_FACADE,
        mode: WALL_DECORATOR_MODE.FACE,
        position: WALL_DECORATOR_POSITION.TOP,
        configuration: {
            blockSizeMeters: 0.05,
            spacingMode: 'fixed',
            spacingMeters: 0.05,
            snapToFit: false
        }
    });
    const unsnappedFaceSpecs = buildWallDecoratorShapeSpecs(unsnappedFaceState, wall);
    const unsnappedFrontBlocks = unsnappedFaceSpecs.filter((s) => s?.faceId === 'front' && String(s?.role ?? '').startsWith('cornice_front_block_'));
    assert.equal(unsnappedFrontBlocks.length, 200, 'Expected same block count without snap for fixed 5cm center pitch.');
    const unsnapFirst = unsnappedFrontBlocks[0] ?? null;
    const unsnapSecond = unsnappedFrontBlocks[1] ?? null;
    const unsnapLast = unsnappedFrontBlocks[unsnappedFrontBlocks.length - 1] ?? null;
    assert.ok(unsnapFirst && unsnapSecond && unsnapLast, 'Expected first/second/last unsnapped blocks.');
    assertNear((Number(unsnapFirst.centerU) || 0) - (Number(unsnapFirst.widthMeters) || 0) * 0.5, -5.0, 1e-9, 'Expected unsnapped cornice to keep first block flush at left edge for this exact pitch.');
    assertNear((Number(unsnapSecond.centerU) || 0) - (Number(unsnapFirst.centerU) || 0), 0.05, 1e-9, 'Expected unsnapped spacing to remain preset 5cm center pitch.');
    assertNear((Number(unsnapLast.centerU) || 0) + (Number(unsnapLast.widthMeters) || 0) * 0.5, 5.0, 1e-9, 'Expected unsnapped cornice to keep last block flush at right edge for this exact pitch.');
    const unsnapLeftGap = ((Number(unsnapFirst.centerU) || 0) - (Number(unsnapFirst.widthMeters) || 0) * 0.5) - (-5.0);
    const unsnapRightGap = 5.0 - ((Number(unsnapLast.centerU) || 0) + (Number(unsnapLast.widthMeters) || 0) * 0.5);
    assertNear(unsnapLeftGap, unsnapRightGap, 1e-9, 'Expected equal left/right remainder in unsnapped mode.');

    const unsnappedWidePitchState = sanitizeWallDecoratorDebuggerState({
        decoratorId: WALL_DECORATOR_ID.CORNICE_BASIC_BLOCK,
        whereToApply: WALL_DECORATOR_WHERE_TO_APPLY.ENTIRE_FACADE,
        mode: WALL_DECORATOR_MODE.FACE,
        position: WALL_DECORATOR_POSITION.TOP,
        configuration: {
            blockSizeMeters: 0.05,
            spacingMode: 'fixed',
            spacingMeters: 0.20,
            snapToFit: false
        }
    });
    const unsnappedWidePitchSpecs = buildWallDecoratorShapeSpecs(unsnappedWidePitchState, wall);
    const unsnappedWidePitchBlocks = unsnappedWidePitchSpecs.filter((s) => s?.faceId === 'front' && String(s?.role ?? '').startsWith('cornice_front_block_'));
    const unsnapWideFirst = unsnappedWidePitchBlocks[0] ?? null;
    const unsnapWideSecond = unsnappedWidePitchBlocks[1] ?? null;
    const unsnapWideLast = unsnappedWidePitchBlocks[unsnappedWidePitchBlocks.length - 1] ?? null;
    assert.ok(unsnapWideFirst && unsnapWideSecond && unsnapWideLast, 'Expected first/second/last unsnapped-wide-pitch blocks.');
    const unsnapWidePitch = (Number(unsnapWideSecond.centerU) || 0) - (Number(unsnapWideFirst.centerU) || 0);
    assertNear(unsnapWidePitch, 0.20, 1e-9, 'Expected unsnapped wide pitch to remain exact.');
    assert.ok(
        ((Number(unsnapWideFirst.centerU) || 0) - (Number(unsnapWideFirst.widthMeters) || 0) * 0.5) > -5.0,
        'Expected unsnapped wide-pitch run to keep a side gap instead of forcing edge flush.'
    );

    const unsnappedLargeBlockState = sanitizeWallDecoratorDebuggerState({
        decoratorId: WALL_DECORATOR_ID.CORNICE_BASIC_BLOCK,
        whereToApply: WALL_DECORATOR_WHERE_TO_APPLY.ENTIRE_FACADE,
        mode: WALL_DECORATOR_MODE.FACE,
        position: WALL_DECORATOR_POSITION.TOP,
        configuration: {
            blockSizeMeters: 0.10,
            spacingMode: 'fixed',
            spacingMeters: 0.05,
            snapToFit: false
        }
    });
    const unsnappedLargeBlockSpecs = buildWallDecoratorShapeSpecs(unsnappedLargeBlockState, wall);
    const unsnappedLargeFrontBlocks = unsnappedLargeBlockSpecs.filter((s) => s?.faceId === 'front' && String(s?.role ?? '').startsWith('cornice_front_block_'));
    assert.equal(unsnappedLargeFrontBlocks.length, 200, 'Expected block count to stay tied to center pitch, independent of block width.');
    const unsnapLargeFirst = unsnappedLargeFrontBlocks[0] ?? null;
    const unsnapLargeSecond = unsnappedLargeFrontBlocks[1] ?? null;
    const unsnapLargeLast = unsnappedLargeFrontBlocks[unsnappedLargeFrontBlocks.length - 1] ?? null;
    assert.ok(unsnapLargeFirst && unsnapLargeSecond && unsnapLargeLast, 'Expected first/second/last unsnapped large blocks.');
    assertNear(unsnapLargeFirst.centerU, unsnapFirst.centerU, 1e-9, 'Expected first center position to remain stable when only block width changes.');
    assertNear(unsnapLargeSecond.centerU, unsnapSecond.centerU, 1e-9, 'Expected second center position to remain stable when only block width changes.');
    assertNear(unsnapLargeLast.centerU, unsnapLast.centerU, 1e-9, 'Expected last center position to remain stable when only block width changes.');
    assertNear((Number(unsnapLargeSecond.centerU) || 0) - (Number(unsnapLargeFirst.centerU) || 0), 0.05, 1e-9, 'Expected center pitch to remain unchanged when block width changes.');

    const cornerHalfState = sanitizeWallDecoratorDebuggerState({
        decoratorId: WALL_DECORATOR_ID.CORNICE_BASIC_BLOCK,
        whereToApply: WALL_DECORATOR_WHERE_TO_APPLY.HALF,
        mode: WALL_DECORATOR_MODE.CORNER,
        position: WALL_DECORATOR_POSITION.TOP,
        configuration: {
            blockSizeMeters: 0.10,
            spacingMode: 'fixed',
            spacingMeters: 0.10,
            snapToFit: true
        }
    });
    const cornerHalfSpecs = buildWallDecoratorShapeSpecs(cornerHalfState, wall);
    const cornerFrontBlocks = cornerHalfSpecs.filter((s) => s?.faceId === 'front' && String(s?.role ?? '').startsWith('cornice_front_block_'));
    const cornerRightBlocks = cornerHalfSpecs.filter((s) => s?.faceId === 'right' && String(s?.role ?? '').startsWith('cornice_right_block_'));
    assert.equal(cornerFrontBlocks.length, 50, 'Expected 50 medium blocks over 5m front half span in corner mode.');
    assert.equal(cornerRightBlocks.length, 50, 'Expected mirrored 50 medium blocks over right half span in corner mode.');
    const frontCornerStart = cornerFrontBlocks[0] ?? null;
    const rightCornerStart = cornerRightBlocks[0] ?? null;
    const frontFarEnd = cornerFrontBlocks[cornerFrontBlocks.length - 1] ?? null;
    const rightFarEnd = cornerRightBlocks[cornerRightBlocks.length - 1] ?? null;
    assert.ok(frontCornerStart && rightCornerStart && frontFarEnd && rightFarEnd, 'Expected corner and far-edge blocks on both faces.');
    assertNear((Number(frontCornerStart.centerU) || 0) + (Number(frontCornerStart.widthMeters) || 0) * 0.5, 5.0, 1e-9, 'Expected front corner face to start exactly at corner edge.');
    assertNear((Number(rightCornerStart.centerU) || 0) - (Number(rightCornerStart.widthMeters) || 0) * 0.5, 0.0, 1e-9, 'Expected right corner face to start exactly at corner edge.');
    assertNear((Number(frontFarEnd.centerU) || 0) - (Number(frontFarEnd.widthMeters) || 0) * 0.5, 0.0, 1e-9, 'Expected front corner branch to end exactly at far half edge.');
    assertNear((Number(rightFarEnd.centerU) || 0) + (Number(rightFarEnd.widthMeters) || 0) * 0.5, 5.0, 1e-9, 'Expected right corner branch to end exactly at far half edge.');
    assertNear(cornerFrontBlocks[0]?.centerV, 1.7, 1e-9, 'Expected top-position medium cornice blocks to sit just below roofline.');
    assertNear(cornerRightBlocks[0]?.centerV, 1.7, 1e-9, 'Expected right corner medium blocks to share top Y alignment.');
});

test('WallDecoratorCatalog: Cornice Rounded clones cornice-block placement/sizing and switches geometry kind', () => {
    const wall = { widthMeters: 10, heightMeters: 3.5, depthMeters: 0.3 };
    const state = sanitizeWallDecoratorDebuggerState({
        decoratorId: WALL_DECORATOR_ID.CORNICE_ROUNDED,
        whereToApply: WALL_DECORATOR_WHERE_TO_APPLY.ENTIRE_FACADE,
        mode: WALL_DECORATOR_MODE.CORNER,
        position: WALL_DECORATOR_POSITION.TOP,
        configuration: {
            blockSizeMeters: 0.10,
            spacingMode: 'fixed',
            spacingMeters: 0.20,
            curvature: 'concave',
            snapToFit: true
        }
    });
    const specs = buildWallDecoratorShapeSpecs(state, wall);
    const frontSpecs = specs.filter((s) => s?.faceId === 'front' && String(s?.role ?? '').startsWith('cornice_rounded_front_block_'));
    const rightSpecs = specs.filter((s) => s?.faceId === 'right' && String(s?.role ?? '').startsWith('cornice_rounded_right_block_'));
    assert.equal(frontSpecs.length, 50, 'Expected rounded front face to keep cornice-block count and spacing in corner mode.');
    assert.equal(rightSpecs.length, 50, 'Expected rounded right face to keep cornice-block count and spacing in corner mode.');
    const frontFirst = frontSpecs[0] ?? null;
    const frontSecond = frontSpecs[1] ?? null;
    const frontLast = frontSpecs[frontSpecs.length - 1] ?? null;
    const rightFirst = rightSpecs[0] ?? null;
    const rightLast = rightSpecs[rightSpecs.length - 1] ?? null;
    assert.ok(frontFirst && frontSecond && frontLast && rightFirst && rightLast, 'Expected rounded first/last block specs on both corner faces.');
    assert.equal(frontFirst.geometryKind, 'cornice_rounded_block', 'Expected rounded block geometry kind on front face.');
    assert.equal(rightFirst.geometryKind, 'cornice_rounded_block', 'Expected rounded block geometry kind on right face.');
    assert.equal(String(frontFirst.corniceRoundedCurvature ?? ''), 'concave', 'Expected rounded curvature metadata on front face.');
    assert.equal(String(rightFirst.corniceRoundedCurvature ?? ''), 'concave', 'Expected rounded curvature metadata on right face.');
    assertNear((Number(frontFirst.centerU) || 0) + (Number(frontFirst.widthMeters) || 0) * 0.5, 5.0, 1e-9, 'Expected rounded front corner anchoring at wall edge.');
    assertNear((Number(rightFirst.centerU) || 0) - (Number(rightFirst.widthMeters) || 0) * 0.5, 0.0, 1e-9, 'Expected rounded right corner anchoring at corner edge.');
    assertNear((Number(frontLast.centerU) || 0) - (Number(frontLast.widthMeters) || 0) * 0.5, -5.0, 1e-9, 'Expected rounded front branch to reach far wall edge.');
    assertNear((Number(rightLast.centerU) || 0) + (Number(rightLast.widthMeters) || 0) * 0.5, 10.0, 1e-9, 'Expected rounded right branch to reach far wall edge.');
    assertNear((Number(frontSecond.centerU) || 0) - (Number(frontFirst.centerU) || 0), -9.9 / 49.0, 1e-9, 'Expected rounded front snap spacing to distribute evenly.');

    const unsnappedState = sanitizeWallDecoratorDebuggerState({
        decoratorId: WALL_DECORATOR_ID.CORNICE_ROUNDED,
        whereToApply: WALL_DECORATOR_WHERE_TO_APPLY.ENTIRE_FACADE,
        mode: WALL_DECORATOR_MODE.FACE,
        position: WALL_DECORATOR_POSITION.TOP,
        configuration: {
            blockSizeMeters: 0.10,
            spacingMode: 'fixed',
            spacingMeters: 0.30,
            curvature: 'convex',
            snapToFit: false
        }
    });
    const unsnappedSpecs = buildWallDecoratorShapeSpecs(unsnappedState, wall);
    const unsnappedFront = unsnappedSpecs.filter((s) => s?.faceId === 'front' && String(s?.role ?? '').startsWith('cornice_rounded_front_block_'));
    assert.equal(unsnappedFront.length, 33, 'Expected unsnapped rounded block count to follow fixed center pitch.');
    const unsnappedFirst = unsnappedFront[0] ?? null;
    const unsnappedSecond = unsnappedFront[1] ?? null;
    const unsnappedLast = unsnappedFront[unsnappedFront.length - 1] ?? null;
    assert.ok(unsnappedFirst && unsnappedSecond && unsnappedLast, 'Expected unsnapped rounded first/second/last blocks.');
    assertNear(Number(unsnappedFirst.centerU) || 0.0, -4.8, 1e-9, 'Expected unsnapped rounded first center to remain centered inside wall span.');
    assertNear(Number(unsnappedLast.centerU) || 0.0, 4.8, 1e-9, 'Expected unsnapped rounded last center to remain centered inside wall span.');
    assertNear((Number(unsnappedSecond.centerU) || 0.0) - (Number(unsnappedFirst.centerU) || 0.0), 0.3, 1e-9, 'Expected unsnapped rounded center pitch to remain fixed.');
});

test('WallDecoratorCatalog: Simple Skirt specs generate flat panels with offset-aware corner span', () => {
    const wall = { widthMeters: 10, heightMeters: 3.5, depthMeters: 0.3 };

    const base = sanitizeWallDecoratorDebuggerState({
        decoratorId: WALL_DECORATOR_ID.SIMPLE_SKIRT,
        whereToApply: WALL_DECORATOR_WHERE_TO_APPLY.ENTIRE_FACADE,
        mode: WALL_DECORATOR_MODE.FACE,
        position: WALL_DECORATOR_POSITION.BOTTOM
    });

    const specsBase = buildWallDecoratorShapeSpecs(base, wall);
    const baseFrontMain = specsBase.find((s) => s?.role === 'front_main') ?? null;
    const baseFrontTopCap = specsBase.find((s) => s?.role === 'front_cap_top') ?? null;
    const baseFrontBottomCap = specsBase.find((s) => s?.role === 'front_cap_bottom') ?? null;
    const baseFrontSideStartCap = specsBase.find((s) => s?.role === 'front_cap_side_start') ?? null;
    const baseFrontSideEndCap = specsBase.find((s) => s?.role === 'front_cap_side_end') ?? null;
    assert.equal(specsBase.length, 4, 'Expected front panel + top cap + two side caps in bottom position.');
    assert.ok(baseFrontMain, 'Expected front flat panel.');
    assert.ok(baseFrontTopCap, 'Expected front top cap when position is bottom.');
    assert.equal(baseFrontBottomCap, null, 'Expected no bottom cap when position is bottom.');
    assert.ok(baseFrontSideStartCap, 'Expected start-side cap in non-corner mode.');
    assert.ok(baseFrontSideEndCap, 'Expected end-side cap in non-corner mode.');
    assert.equal(baseFrontMain.faceId, 'front');
    assert.equal(baseFrontMain.geometryKind, 'flat_panel');
    assertNear(baseFrontMain.widthMeters, 10.0, 1e-9, 'Expected full-face width coverage.');
    assertNear(baseFrontMain.heightMeters, 0.5, 1e-9, 'Expected medium preset height.');
    assertNear(baseFrontMain.centerU, 0.0, 1e-9, 'Expected full-face center alignment.');
    assertNear(baseFrontMain.centerV, -1.5, 1e-9, 'Expected bottom alignment at floor.');
    assertNear(baseFrontMain.outsetMeters, 0.05, 1e-9, 'Expected outward offset to equal medium preset 5cm.');
    assert.equal(baseFrontTopCap.geometryKind, 'flat_panel_cap');
    assertNear(baseFrontTopCap.widthMeters, 10.0, 1e-9, 'Expected top cap to cover full wall span.');
    assertNear(baseFrontTopCap.depthMeters, 0.05, 1e-9, 'Expected top cap depth to match panel offset.');
    assertNear(baseFrontTopCap.centerV, -1.25, 1e-9, 'Expected top cap to align to panel top edge.');
    assertNear(baseFrontTopCap.outsetMeters, 0.0, 1e-9, 'Expected cap to start at wall plane.');
    assert.equal(baseFrontSideStartCap.geometryKind, 'flat_panel_side_cap');
    assert.equal(baseFrontSideEndCap.geometryKind, 'flat_panel_side_cap');
    assertNear(baseFrontSideStartCap.centerU, -5.0, 1e-9, 'Expected start-side cap at wall start edge.');
    assertNear(baseFrontSideEndCap.centerU, 5.0, 1e-9, 'Expected end-side cap at wall end edge.');
    assertNear(baseFrontSideStartCap.centerV, -1.5, 1e-9, 'Expected side caps centered on panel Y.');
    assertNear(baseFrontSideEndCap.centerV, -1.5, 1e-9, 'Expected side caps centered on panel Y.');
    assertNear(baseFrontSideStartCap.widthMeters, 0.05, 1e-9, 'Expected side-cap depth span to match offset.');
    assertNear(baseFrontSideStartCap.outsetMeters, 0.025, 1e-9, 'Expected side-cap center offset to sit halfway between wall and panel.');
    assertNear(baseFrontSideStartCap.yawDegrees, 180.0, 1e-9, 'Expected start-side cap to flip orientation toward negative X.');
    assertNear(baseFrontSideEndCap.yawDegrees, 0.0, 1e-9, 'Expected end-side cap orientation toward positive X.');
    assert.equal(specsBase.some((s) => String(s?.role ?? '').includes('closure')), false, 'Expected no box closure pieces for flat skirt.');

    const cornerHalfNearTop = sanitizeWallDecoratorDebuggerState({
        decoratorId: WALL_DECORATOR_ID.SIMPLE_SKIRT,
        whereToApply: WALL_DECORATOR_WHERE_TO_APPLY.HALF,
        mode: WALL_DECORATOR_MODE.CORNER,
        position: WALL_DECORATOR_POSITION.NEAR_TOP
    });
    const specsCornerHalf = buildWallDecoratorShapeSpecs(cornerHalfNearTop, wall);
    const cornerFrontMain = specsCornerHalf.find((s) => s?.role === 'front_main') ?? null;
    const cornerRightMain = specsCornerHalf.find((s) => s?.role === 'right_main') ?? null;
    const cornerFrontTopCap = specsCornerHalf.find((s) => s?.role === 'front_cap_top') ?? null;
    const cornerFrontBottomCap = specsCornerHalf.find((s) => s?.role === 'front_cap_bottom') ?? null;
    const cornerRightTopCap = specsCornerHalf.find((s) => s?.role === 'right_cap_top') ?? null;
    const cornerRightBottomCap = specsCornerHalf.find((s) => s?.role === 'right_cap_bottom') ?? null;
    const cornerFrontSideStartCap = specsCornerHalf.find((s) => s?.role === 'front_cap_side_start') ?? null;
    const cornerRightSideEndCap = specsCornerHalf.find((s) => s?.role === 'right_cap_side_end') ?? null;
    const cornerFrontSideEndCap = specsCornerHalf.find((s) => s?.role === 'front_cap_side_end') ?? null;
    const cornerRightSideStartCap = specsCornerHalf.find((s) => s?.role === 'right_cap_side_start') ?? null;
    assert.equal(specsCornerHalf.length, 8, 'Expected front/right flat panels, top/bottom caps, and non-corner side caps in corner mode.');
    assert.ok(cornerFrontMain, 'Expected front panel in corner mode.');
    assert.ok(cornerRightMain, 'Expected right panel in corner mode.');
    assert.ok(cornerFrontTopCap, 'Expected front top cap in corner mode.');
    assert.ok(cornerFrontBottomCap, 'Expected front bottom cap in corner mode.');
    assert.ok(cornerRightTopCap, 'Expected right top cap in corner mode.');
    assert.ok(cornerRightBottomCap, 'Expected right bottom cap in corner mode.');
    assert.ok(cornerFrontSideStartCap, 'Expected front non-corner side cap in corner mode.');
    assert.ok(cornerRightSideEndCap, 'Expected right non-corner side cap in corner mode.');
    assert.equal(cornerFrontSideEndCap, null, 'Expected no side cap on front corner edge.');
    assert.equal(cornerRightSideStartCap, null, 'Expected no side cap on right corner edge.');
    assert.equal(cornerFrontMain.faceId, 'front');
    assert.equal(cornerRightMain.faceId, 'right');
    assert.equal(cornerFrontMain.geometryKind, 'flat_panel');
    assert.equal(cornerRightMain.geometryKind, 'flat_panel');
    assertNear(cornerFrontMain.widthMeters, 5.05, 1e-9, 'Expected corner front width to add +offset beyond wall limit.');
    assertNear(cornerRightMain.widthMeters, 5.05, 1e-9, 'Expected corner right width to add +offset beyond wall limit.');
    assertNear(cornerFrontMain.centerU, 2.525, 1e-9, 'Expected front panel to shift half-offset toward corner extension.');
    assertNear(cornerRightMain.centerU, 2.475, 1e-9, 'Expected right panel to shift half-offset toward corner extension.');
    assertNear(cornerFrontMain.centerV, 1.4, 1e-9, 'Expected near-top placement 10cm below top.');
    assertNear(cornerRightMain.centerV, 1.4, 1e-9, 'Expected near-top placement on right panel too.');
    assert.equal(Boolean(cornerFrontMain.miterStart45), false, 'Expected no miter flags for flat skirt panel.');
    assert.equal(Boolean(cornerFrontMain.miterEnd45), false, 'Expected no miter flags for flat skirt panel.');
    assert.equal(Boolean(cornerRightMain.miterStart45), false, 'Expected no miter flags for flat skirt panel.');
    assert.equal(Boolean(cornerRightMain.miterEnd45), false, 'Expected no miter flags for flat skirt panel.');
    assertNear(cornerFrontTopCap.widthMeters, 5.0, 1e-9, 'Expected front cap quad to encompass wall span only.');
    assertNear(cornerRightTopCap.widthMeters, 5.0, 1e-9, 'Expected right cap quad to encompass wall span only.');
    assertNear(cornerFrontTopCap.cornerBridgeEndMeters, 0.05, 1e-9, 'Expected front corner cap to add end-side triangle bridge.');
    assertNear(cornerFrontTopCap.cornerBridgeStartMeters, 0.0, 1e-9, 'Expected no front start-side bridge.');
    assertNear(cornerRightTopCap.cornerBridgeStartMeters, 0.05, 1e-9, 'Expected right corner cap to add start-side triangle bridge.');
    assertNear(cornerRightTopCap.cornerBridgeEndMeters, 0.0, 1e-9, 'Expected no right end-side bridge.');
    assertNear(cornerFrontTopCap.centerV, 1.65, 1e-9, 'Expected top cap to align with panel top edge.');
    assertNear(cornerFrontBottomCap.centerV, 1.15, 1e-9, 'Expected bottom cap to align with panel bottom edge.');
    assert.equal(cornerFrontSideStartCap.geometryKind, 'flat_panel_side_cap', 'Expected front non-corner side cap geometry kind.');
    assert.equal(cornerRightSideEndCap.geometryKind, 'flat_panel_side_cap', 'Expected right non-corner side cap geometry kind.');
    assertNear(cornerFrontSideStartCap.centerU, 0.0, 1e-9, 'Expected front side cap at non-corner start edge for half span.');
    assertNear(cornerRightSideEndCap.centerU, 5.0, 1e-9, 'Expected right side cap at non-corner end edge for half span.');
    assertNear(cornerFrontSideStartCap.yawDegrees, 180.0, 1e-9, 'Expected front side cap orientation toward non-corner side.');
    assertNear(cornerRightSideEndCap.yawDegrees, 0.0, 1e-9, 'Expected right side cap orientation toward non-corner side.');
    assert.equal(specsCornerHalf.some((s) => String(s?.role ?? '').includes('closure')), false, 'Expected no box closure pieces in corner mode.');
    assert.equal(specsCornerHalf.some((s) => s?.role === 'corner_joint_45'), false, 'Expected no dedicated corner-joint mesh.');

    const extraOffset = sanitizeWallDecoratorDebuggerState({
        decoratorId: WALL_DECORATOR_ID.SIMPLE_SKIRT,
        whereToApply: WALL_DECORATOR_WHERE_TO_APPLY.ENTIRE_FACADE,
        mode: WALL_DECORATOR_MODE.FACE,
        position: WALL_DECORATOR_POSITION.TOP,
        configuration: {
            heightMeters: 0.20,
            offsetScale: 2.0
        }
    });
    const normalOffset = sanitizeWallDecoratorDebuggerState({
        decoratorId: WALL_DECORATOR_ID.SIMPLE_SKIRT,
        whereToApply: WALL_DECORATOR_WHERE_TO_APPLY.ENTIRE_FACADE,
        mode: WALL_DECORATOR_MODE.FACE,
        position: WALL_DECORATOR_POSITION.TOP,
        configuration: {
            heightMeters: 0.20,
            offsetScale: 1.0
        }
    });

    const specsExtra = buildWallDecoratorShapeSpecs(extraOffset, wall);
    const specsNormal = buildWallDecoratorShapeSpecs(normalOffset, wall);
    const extraFrontMain = specsExtra.find((s) => s?.role === 'front_main') ?? null;
    const normalFrontMain = specsNormal.find((s) => s?.role === 'front_main') ?? null;
    const extraFrontTopCap = specsExtra.find((s) => s?.role === 'front_cap_top') ?? null;
    const extraFrontBottomCap = specsExtra.find((s) => s?.role === 'front_cap_bottom') ?? null;
    const extraFrontSideStartCap = specsExtra.find((s) => s?.role === 'front_cap_side_start') ?? null;
    const extraFrontSideEndCap = specsExtra.find((s) => s?.role === 'front_cap_side_end') ?? null;
    assert.ok(extraFrontMain && normalFrontMain, 'Expected front panel specs for preset/offset mode validation.');
    assertNear(normalFrontMain.outsetMeters, 0.02, 1e-9, 'Expected small preset normal offset = 2cm.');
    assertNear(extraFrontMain.outsetMeters, 0.04, 1e-9, 'Expected extra mode to double small offset to 4cm.');
    assertNear(extraFrontMain.outsetMeters, normalFrontMain.outsetMeters * 2.0, 1e-9, 'Expected extra mode to be exactly 2x normal mode.');
    assertNear(extraFrontMain.heightMeters, 0.2, 1e-9, 'Expected small preset height to drive skirt height.');
    assertNear(extraFrontMain.widthMeters, 10.0, 1e-9, 'Expected non-corner width to remain equal to wall span.');
    assert.equal(extraFrontMain.geometryKind, 'flat_panel', 'Expected simple skirt to render as flat panel.');
    assert.equal(extraFrontTopCap, null, 'Expected no top cap when position is top.');
    assert.ok(extraFrontBottomCap, 'Expected bottom cap when position is top.');
    assert.ok(extraFrontSideStartCap, 'Expected start-side cap in non-corner mode.');
    assert.ok(extraFrontSideEndCap, 'Expected end-side cap in non-corner mode.');
    assert.equal(extraFrontSideStartCap.geometryKind, 'flat_panel_side_cap');
    assert.equal(extraFrontSideEndCap.geometryKind, 'flat_panel_side_cap');
    assertNear(extraFrontBottomCap.depthMeters, 0.04, 1e-9, 'Expected bottom cap depth to follow extra offset.');
    assertNear(extraFrontSideStartCap.widthMeters, 0.04, 1e-9, 'Expected side cap width to follow extra offset.');
    assertNear(extraFrontSideEndCap.widthMeters, 0.04, 1e-9, 'Expected side cap width to follow extra offset.');
});

test('WallDecoratorCatalog: Curved Ring specs sweep half-circle profile across facade span with corner miters', () => {
    const wall = { widthMeters: 10, heightMeters: 3.5, depthMeters: 0.3 };

    const faceState = sanitizeWallDecoratorDebuggerState({
        decoratorId: WALL_DECORATOR_ID.HALF_DOME,
        whereToApply: WALL_DECORATOR_WHERE_TO_APPLY.HALF,
        mode: WALL_DECORATOR_MODE.FACE,
        position: WALL_DECORATOR_POSITION.NEAR_BOTTOM,
        configuration: {
            diameterMeters: 1.2,
            outsetMeters: 0.03,
            nearEdgeOffsetMeters: 0.2
        }
    });
    const faceSpecs = buildWallDecoratorShapeSpecs(faceState, wall);
    assert.equal(faceSpecs.length, 1, 'Expected one front curved-ring sweep in face mode.');
    const faceRing = faceSpecs[0] ?? null;
    assert.ok(faceRing, 'Expected face-mode curved-ring spec.');
    assert.equal(faceRing.geometryKind, 'curved_ring');
    assert.equal(faceRing.faceId, 'front');
    assert.equal(faceRing.miterStart45, false);
    assert.equal(faceRing.miterEnd45, false);
    assertNear(faceRing.widthMeters, 5.0, 1e-9, 'Expected half-facade sweep width in face mode.');
    assertNear(faceRing.heightMeters, 1.2, 1e-9, 'Expected curved-ring height from diameter.');
    assertNear(faceRing.depthMeters, 0.6, 1e-9, 'Expected curved-ring protrusion depth to be radius.');
    assertNear(faceRing.centerU, 2.5, 1e-9, 'Expected half-facade placement centered in right-half span.');
    assertNear(faceRing.centerV, -0.95, 1e-9, 'Expected near-bottom placement offset 20cm from floor.');
    assertNear(faceRing.outsetMeters, 0.03, 1e-9, 'Expected outward offset to pass through to spec.');

    const cornerState = sanitizeWallDecoratorDebuggerState({
        decoratorId: WALL_DECORATOR_ID.HALF_DOME,
        whereToApply: WALL_DECORATOR_WHERE_TO_APPLY.ENTIRE_FACADE,
        mode: WALL_DECORATOR_MODE.CORNER,
        position: WALL_DECORATOR_POSITION.BOTTOM,
        configuration: {
            diameterMeters: 0.8,
            outsetMeters: 0.02
        }
    });
    const cornerSpecs = buildWallDecoratorShapeSpecs(cornerState, wall);
    assert.equal(cornerSpecs.length, 2, 'Expected front + right curved-ring sweeps in corner mode.');
    const frontCorner = cornerSpecs.find((s) => s?.faceId === 'front') ?? null;
    const rightCorner = cornerSpecs.find((s) => s?.faceId === 'right') ?? null;
    assert.ok(frontCorner, 'Expected front corner curved-ring sweep.');
    assert.ok(rightCorner, 'Expected right corner curved-ring sweep.');
    assert.equal(frontCorner.geometryKind, 'curved_ring');
    assert.equal(rightCorner.geometryKind, 'curved_ring');
    assert.equal(frontCorner.miterEnd45, true, 'Expected front corner sweep to miter towards corner.');
    assert.equal(frontCorner.miterStart45, false, 'Expected front corner sweep start to stay untrimmed.');
    assert.equal(rightCorner.miterStart45, true, 'Expected right corner sweep to miter towards corner.');
    assert.equal(rightCorner.miterEnd45, false, 'Expected right corner sweep end to stay untrimmed.');
    assertNear(frontCorner.depthMeters, 0.4, 1e-9, 'Expected front corner depth from radius.');
    assertNear(rightCorner.depthMeters, 0.4, 1e-9, 'Expected right corner depth from radius.');
    assertNear(frontCorner.widthMeters, 10.0, 1e-9, 'Expected front sweep spec span to stay wall-width while corner wedge is geometry-driven.');
    assertNear(rightCorner.widthMeters, 10.0, 1e-9, 'Expected right sweep spec span to stay wall-width while corner wedge is geometry-driven.');
    assertNear(frontCorner.centerU, 0.0, 1e-9, 'Expected front sweep center to remain full-span centered.');
    assertNear(rightCorner.centerU, 5.0, 1e-9, 'Expected right sweep center to remain full-span centered.');
    assertNear(frontCorner.outsetMeters, 0.02, 1e-9, 'Expected front corner outward offset.');
    assertNear(rightCorner.outsetMeters, 0.02, 1e-9, 'Expected right corner outward offset.');
});

test('WallDecoratorCatalog: Angled Support Profile specs follow skirt face/cap logic with angled cap wall-edge offsets', () => {
    const wall = { widthMeters: 10, heightMeters: 3.5, depthMeters: 0.3 };

    const faceState = sanitizeWallDecoratorDebuggerState({
        decoratorId: WALL_DECORATOR_ID.ANGLED_SUPPORT_PROFILE,
        whereToApply: WALL_DECORATOR_WHERE_TO_APPLY.ENTIRE_FACADE,
        mode: WALL_DECORATOR_MODE.FACE,
        position: WALL_DECORATOR_POSITION.BOTTOM,
        configuration: {
            offset: 0.12,
            height: 0.22,
            topCapAngleDeg: 52,
            bottomCapAngleDeg: 33
        }
    });
    const faceSpecs = buildWallDecoratorShapeSpecs(faceState, wall);
    assert.equal(faceSpecs.length, 4, 'Expected front panel + top cap + two side caps in bottom face mode.');
    const faceMain = faceSpecs.find((spec) => spec?.role === 'angled_support_front') ?? null;
    const faceTopCap = faceSpecs.find((spec) => spec?.role === 'angled_support_front_cap_top') ?? null;
    const faceBottomCap = faceSpecs.find((spec) => spec?.role === 'angled_support_front_cap_bottom') ?? null;
    const faceSideStart = faceSpecs.find((spec) => spec?.role === 'angled_support_front_cap_side_start') ?? null;
    const faceSideEnd = faceSpecs.find((spec) => spec?.role === 'angled_support_front_cap_side_end') ?? null;
    assert.ok(faceMain, 'Expected front angled-support panel in face mode.');
    assert.ok(faceTopCap, 'Expected top cap in bottom face mode.');
    assert.equal(faceBottomCap, null, 'Expected no bottom cap in bottom face mode.');
    assert.ok(faceSideStart && faceSideEnd, 'Expected both side caps in face mode.');
    assert.equal(faceMain.geometryKind, 'flat_panel');
    assert.equal(faceTopCap.geometryKind, 'flat_panel_cap');
    assert.equal(faceSideStart.geometryKind, 'flat_panel_side_cap');
    assertNear(faceMain.widthMeters, 10.0, 1e-9, 'Expected full-facade panel width in face mode.');
    assertNear(faceMain.heightMeters, 0.22, 1e-9, 'Expected height parameter to drive panel height.');
    assertNear(faceMain.outsetMeters, 0.12, 1e-9, 'Expected offset parameter to drive panel offset.');
    assertNear(faceTopCap.wallEdgeYOffsetMeters, 0.12 * Math.tan(52 * Math.PI / 180.0), 1e-9, 'Expected top-cap wall-edge Y offset from offset + top angle.');
    assertNear(faceSideStart.wallEdgeTopYOffsetMeters, 0.12 * Math.tan(52 * Math.PI / 180.0), 1e-9, 'Expected side-cap top wall-edge offset to match top cap.');
    assertNear(faceSideStart.wallEdgeBottomYOffsetMeters, -0.12 * Math.tan(33 * Math.PI / 180.0), 1e-9, 'Expected side-cap bottom wall-edge offset to match bottom cap.');

    const cornerState = sanitizeWallDecoratorDebuggerState({
        decoratorId: WALL_DECORATOR_ID.ANGLED_SUPPORT_PROFILE,
        whereToApply: WALL_DECORATOR_WHERE_TO_APPLY.HALF,
        mode: WALL_DECORATOR_MODE.CORNER,
        position: WALL_DECORATOR_POSITION.NEAR_TOP,
        configuration: {
            offset: 0.10,
            height: 0.25,
            topCapAngleDeg: 60,
            bottomCapAngleDeg: 25
        }
    });
    const cornerSpecs = buildWallDecoratorShapeSpecs(cornerState, wall);
    assert.equal(cornerSpecs.length, 8, 'Expected front/right panels + top/bottom caps + non-corner side caps in corner mode.');
    const frontMain = cornerSpecs.find((spec) => spec?.role === 'angled_support_front') ?? null;
    const rightMain = cornerSpecs.find((spec) => spec?.role === 'angled_support_right') ?? null;
    const frontTopCap = cornerSpecs.find((spec) => spec?.role === 'angled_support_front_cap_top') ?? null;
    const rightTopCap = cornerSpecs.find((spec) => spec?.role === 'angled_support_right_cap_top') ?? null;
    const frontBottomCap = cornerSpecs.find((spec) => spec?.role === 'angled_support_front_cap_bottom') ?? null;
    const rightBottomCap = cornerSpecs.find((spec) => spec?.role === 'angled_support_right_cap_bottom') ?? null;
    const frontSideStartCap = cornerSpecs.find((spec) => spec?.role === 'angled_support_front_cap_side_start') ?? null;
    const rightSideEndCap = cornerSpecs.find((spec) => spec?.role === 'angled_support_right_cap_side_end') ?? null;
    assert.ok(frontMain && rightMain, 'Expected front/right panels in corner mode.');
    assert.ok(frontTopCap && rightTopCap && frontBottomCap && rightBottomCap, 'Expected top/bottom caps on both faces in corner mode.');
    assert.ok(frontSideStartCap && rightSideEndCap, 'Expected non-corner side caps in corner mode.');
    assert.equal(cornerSpecs.some((spec) => spec?.role === 'angled_support_front_cap_side_end'), false, 'Expected no side cap on front corner edge.');
    assert.equal(cornerSpecs.some((spec) => spec?.role === 'angled_support_right_cap_side_start'), false, 'Expected no side cap on right corner edge.');
    assertNear(frontMain.widthMeters, 5.10, 1e-9, 'Expected front panel width to add +offset at corner edge.');
    assertNear(rightMain.widthMeters, 5.10, 1e-9, 'Expected right panel width to add +offset at corner edge.');
    assertNear(frontMain.centerU, 2.55, 1e-9, 'Expected front panel center shift for +offset corner extension.');
    assertNear(rightMain.centerU, 2.45, 1e-9, 'Expected right panel center shift for +offset corner extension.');
    assertNear(frontTopCap.cornerBridgeEndMeters, 0.10, 1e-9, 'Expected front top cap corner bridge from offset.');
    assertNear(rightTopCap.cornerBridgeStartMeters, 0.10, 1e-9, 'Expected right top cap corner bridge from offset.');
    assertNear(frontBottomCap.cornerBridgeEndMeters, 0.10, 1e-9, 'Expected front bottom cap corner bridge from offset.');
    assertNear(rightBottomCap.cornerBridgeStartMeters, 0.10, 1e-9, 'Expected right bottom cap corner bridge from offset.');
    assertNear(frontTopCap.wallEdgeYOffsetMeters, 0.10 * Math.tan(60 * Math.PI / 180.0), 1e-9, 'Expected top cap wall-edge Y offset from top angle.');
    assertNear(rightTopCap.wallEdgeYOffsetMeters, 0.10 * Math.tan(60 * Math.PI / 180.0), 1e-9, 'Expected right top cap wall-edge Y offset from top angle.');
    assertNear(frontBottomCap.wallEdgeYOffsetMeters, -0.10 * Math.tan(25 * Math.PI / 180.0), 1e-9, 'Expected bottom cap wall-edge Y offset from bottom angle.');
    assertNear(rightBottomCap.wallEdgeYOffsetMeters, -0.10 * Math.tan(25 * Math.PI / 180.0), 1e-9, 'Expected right bottom cap wall-edge Y offset from bottom angle.');
    assertNear(frontSideStartCap.wallEdgeTopYOffsetMeters, 0.10 * Math.tan(60 * Math.PI / 180.0), 1e-9, 'Expected corner side-cap top wall-edge offset from top angle.');
    assertNear(rightSideEndCap.wallEdgeBottomYOffsetMeters, -0.10 * Math.tan(25 * Math.PI / 180.0), 1e-9, 'Expected corner side-cap bottom wall-edge offset from bottom angle.');
});
