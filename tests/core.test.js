// tests/core.test.js
// Automated test runner for core systems
// Runs on page load, prints errors at the end

const errors = [];
if (typeof window !== 'undefined') window.__testErrors = errors;

function test(name, fn) {
    try {
        fn();
        console.log(`✅ ${name}`);
    } catch (err) {
        errors.push({ name, error: err.message || err });
        console.error(`❌ ${name}: ${err.message || err}`);
    }
}

function assertEqual(actual, expected, msg = '') {
    if (actual !== expected) {
        throw new Error(`${msg} Expected ${expected}, got ${actual}`);
    }
}

function assertTrue(value, msg = '') {
    if (!value) {
        throw new Error(`${msg} Expected truthy, got ${value}`);
    }
}

function assertNear(actual, expected, eps = 1e-6, msg = '') {
    const a = Number(actual);
    const e = Number(expected);
    const tol = Number(eps);
    if (!Number.isFinite(a) || !Number.isFinite(e) || !Number.isFinite(tol)) {
        throw new Error(`${msg} Expected finite numbers, got ${actual} vs ${expected}`);
    }
    if (Math.abs(a - e) > tol) {
        throw new Error(`${msg} Expected ${expected}±${eps}, got ${actual}`);
    }
}

function assertFalse(value, msg = '') {
    if (value) {
        throw new Error(`${msg} Expected falsy, got ${value}`);
    }
}

async function runTests() {
    console.log('\n🧪 Running Core Tests...\n');

    // ========== EventBus Tests ==========
    const { EventBus } = await import('/src/app/core/EventBus.js');

    test('EventBus: on/emit works', () => {
        const bus = new EventBus();
        let received = null;
        bus.on('test', (msg) => { received = msg; });
        bus.emit('test', 'hello');
        assertEqual(received, 'hello', 'Message mismatch.');
    });

    test('EventBus: off removes listener', () => {
        const bus = new EventBus();
        let count = 0;
        const handler = () => { count++; };
        bus.on('test', handler);
        bus.emit('test');
        bus.off('test', handler);
        bus.emit('test');
        assertEqual(count, 1, 'Handler should fire once.');
    });

    test('EventBus: once fires only once', () => {
        const bus = new EventBus();
        let count = 0;
        bus.once('test', () => { count++; });
        bus.emit('test');
        bus.emit('test');
        assertEqual(count, 1, 'Once handler should fire once.');
    });

    test('EventBus: listenerCount works', () => {
        const bus = new EventBus();
        bus.on('test', () => {});
        bus.on('test', () => {});
        assertEqual(bus.listenerCount('test'), 2, 'Should have 2 listeners.');
    });

    test('EventBus: clear removes all listeners', () => {
        const bus = new EventBus();
        bus.on('a', () => {});
        bus.on('b', () => {});
        bus.clear();
        assertEqual(bus.listenerCount('a'), 0, 'Should have 0 listeners for a.');
        assertEqual(bus.listenerCount('b'), 0, 'Should have 0 listeners for b.');
    });

    // ========== Post-processing Settings ==========
    const { getDefaultResolvedBloomSettings } = await import('/src/graphics/visuals/postprocessing/BloomSettings.js');

    test('BloomSettings: default disabled', () => {
        const d = getDefaultResolvedBloomSettings();
        assertTrue(d && typeof d === 'object', 'Expected bloom defaults object.');
        assertTrue(d.enabled === false, 'Bloom should be disabled by default.');
        assertTrue(Number.isFinite(d.strength), 'Expected bloom strength to be finite.');
        assertTrue(Number.isFinite(d.radius), 'Expected bloom radius to be finite.');
        assertTrue(Number.isFinite(d.threshold), 'Expected bloom threshold to be finite.');
    });

    // ========== Atmosphere / Sky ==========
    const { shouldShowSkyDome } = await import('/src/graphics/assets3d/generators/SkyGenerator.js');
    const { getDefaultResolvedAtmosphereSettings, getResolvedAtmosphereSettings } = await import('/src/graphics/visuals/atmosphere/AtmosphereSettings.js');

    test('Atmosphere: defaults are stable', () => {
        const d = getDefaultResolvedAtmosphereSettings();
        assertTrue(d && typeof d === 'object', 'Expected atmosphere defaults object.');
        assertTrue(d.sun && typeof d.sun === 'object', 'Expected sun object.');
        assertNear(d.sun.azimuthDeg, 45, 1e-6, 'Expected default sun azimuth.');
        assertNear(d.sun.elevationDeg, 35, 1e-6, 'Expected default sun elevation.');

        assertTrue(d.sky && typeof d.sky === 'object', 'Expected sky object.');
        assertEqual(d.sky.horizonColor, '#EAF9FF', 'Expected default horizon color.');
        assertEqual(d.sky.zenithColor, '#7BCFFF', 'Expected default zenith color.');
        assertEqual(d.sky.groundColor, '#EAF9FF', 'Expected default ground color.');
        assertNear(d.sky.curve, 1.0, 1e-6, 'Expected default curve 1.0.');
        assertNear(d.sky.exposure, 1.0, 1e-6, 'Expected default sky exposure 1.0.');
        assertTrue(Number.isFinite(d.sky.ditherStrength), 'Expected ditherStrength to be finite.');
        assertTrue(d.sky.iblBackgroundMode === 'ibl' || d.sky.iblBackgroundMode === 'gradient', 'Expected valid iblBackgroundMode.');

        assertTrue(d.haze && typeof d.haze === 'object', 'Expected haze object.');
        assertTrue(d.glare && typeof d.glare === 'object', 'Expected glare object.');
        assertTrue(d.disc && typeof d.disc === 'object', 'Expected disc object.');
        assertTrue(d.debug && typeof d.debug === 'object', 'Expected debug object.');
    });

    test('Atmosphere: shouldShowSkyDome respects IBL background mode', () => {
        const texBg = { isTexture: true };
        const plainBg = { isTexture: false };

        assertFalse(shouldShowSkyDome({ skyIblBackgroundMode: 'ibl', lightingIblSetBackground: true, sceneBackground: texBg }), 'IBL mode should hide sky over HDR background.');
        assertTrue(shouldShowSkyDome({ skyIblBackgroundMode: 'ibl', lightingIblSetBackground: true, sceneBackground: plainBg }), 'IBL mode should show sky when background not texture.');
        assertTrue(shouldShowSkyDome({ skyIblBackgroundMode: 'ibl', lightingIblSetBackground: false, sceneBackground: texBg }), 'IBL mode should show sky when IBL bg disabled.');
        assertTrue(shouldShowSkyDome({ skyIblBackgroundMode: 'gradient', lightingIblSetBackground: true, sceneBackground: texBg }), 'Gradient mode should always show sky.');
    });

    test('Atmosphere: url overrides apply', () => {
        const originalUrl = window.location.href;
        history.replaceState(
            {},
            '',
            `${window.location.pathname}?sunAzimuth=123&sunElevation=20&skyHorizon=%23ff0000&skyZenith=00ff00&skyGround=0000ff&skyCurve=2&skyExposure=1.5&skyDither=0.5&skyBg=gradient&skyHaze=0&skyGlare=0&skyDisc=0&skyMode=baseline&skySunRing=1`
        );
        const d = getResolvedAtmosphereSettings({ includeUrlOverrides: true });
        assertNear(d.sun.azimuthDeg, 123, 1e-6, 'Expected overridden sun azimuth.');
        assertNear(d.sun.elevationDeg, 20, 1e-6, 'Expected overridden sun elevation.');
        assertEqual(d.sky.horizonColor.toLowerCase(), '#ff0000', 'Expected overridden horizon color.');
        assertEqual(d.sky.zenithColor.toLowerCase(), '#00ff00', 'Expected overridden zenith color.');
        assertEqual(d.sky.groundColor.toLowerCase(), '#0000ff', 'Expected overridden ground color.');
        assertNear(d.sky.curve, 2.0, 1e-6, 'Expected overridden curve.');
        assertNear(d.sky.exposure, 1.5, 1e-6, 'Expected overridden sky exposure.');
        assertNear(d.sky.ditherStrength, 0.5, 1e-6, 'Expected overridden ditherStrength.');
        assertEqual(d.sky.iblBackgroundMode, 'gradient', 'Expected overridden background mode.');
        assertEqual(d.haze.enabled, false, 'Expected haze disabled.');
        assertEqual(d.glare.enabled, false, 'Expected glare disabled.');
        assertEqual(d.disc.enabled, false, 'Expected disc disabled.');
        assertEqual(d.debug.mode, 'baseline', 'Expected debug mode baseline.');
        assertEqual(d.debug.showSunRing, true, 'Expected sun ring enabled.');
        history.replaceState({}, '', originalUrl);
    });

    // ========== Building Window Visuals Settings ==========
    const { getDefaultResolvedBuildingWindowVisualsSettings } = await import('/src/graphics/visuals/buildings/BuildingWindowVisualsSettings.js');

    test('BuildingWindowVisualsSettings: default reflective disabled', () => {
        const d = getDefaultResolvedBuildingWindowVisualsSettings();
        assertTrue(d && typeof d === 'object', 'Expected building window visuals defaults object.');
        assertTrue(d.reflective && typeof d.reflective === 'object', 'Expected reflective object.');
        assertTrue(d.reflective.enabled === false, 'Reflective building windows should be disabled by default.');
        assertTrue(d.reflective.glass && typeof d.reflective.glass === 'object', 'Expected reflective.glass object.');
        assertEqual(d.reflective.glass.colorHex, 0xffffff, 'Expected default glass color hex.');
        assertNear(d.reflective.glass.metalness, 0.0, 1e-6, 'Expected default glass metalness.');
        assertNear(d.reflective.glass.roughness, 0.02, 1e-6, 'Expected default glass roughness.');
        assertNear(d.reflective.glass.transmission, 0.0, 1e-6, 'Expected default glass transmission.');
        assertNear(d.reflective.glass.ior, 2.2, 1e-6, 'Expected default glass ior.');
        assertNear(d.reflective.glass.envMapIntensity, 4.0, 1e-6, 'Expected default glass envMapIntensity.');
    });

    // ========== Building Materials / IBL ==========
    const { buildBuildingVisualParts: buildBuildingVisualPartsForIbl } = await import('/src/graphics/assets3d/generators/buildings/BuildingGenerator.js');
    const { buildBuildingFabricationVisualParts: buildBuildingFabricationVisualPartsForIbl } = await import('/src/graphics/assets3d/generators/building_fabrication/BuildingFabricationGenerator.js');

    const makeTinyMap = ({ width = 1, height = 1, tileSize = 2 } = {}) => {
        const w = Math.max(1, Math.floor(width));
        const h = Math.max(1, Math.floor(height));
        const size = Number(tileSize) || 2;
        return {
            tileSize: size,
            kind: new Uint8Array(w * h),
            inBounds: (x, y) => x >= 0 && x < w && y >= 0 && y < h,
            index: (x, y) => x + y * w,
            tileToWorldCenter: (x, y) => ({ x: (x + 0.5) * size, z: (y + 0.5) * size })
        };
    };

    const assertMaterialsOptOutOfIbl = (parts, label) => {
        assertTrue(parts && typeof parts === 'object', `${label}: Expected parts object.`);
        assertTrue(Array.isArray(parts.solidMeshes) && parts.solidMeshes.length > 0, `${label}: Expected solidMeshes.`);
        for (const mesh of parts.solidMeshes) {
            const matList = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            for (const mat of matList) {
                if (!mat || !('envMapIntensity' in mat)) continue;
                assertTrue(mat.userData?.iblNoAutoEnvMapIntensity === true, `${label}: Expected iblNoAutoEnvMapIntensity.`);
                assertNear(mat.envMapIntensity, 0.0, 1e-6, `${label}: Expected envMapIntensity 0.`);
            }
        }
    };

    test('BuildingGenerator: walls opt out of IBL', () => {
        const map = makeTinyMap({ width: 1, height: 1, tileSize: 2 });
        const parts = buildBuildingVisualPartsForIbl({
            map,
            tiles: [{ x: 0, y: 0 }],
            tileSize: 2,
            floors: 1,
            floorHeight: 3,
            textureCache: null,
            renderer: null,
            overlays: { wire: false, floorplan: false, border: false, floorDivisions: false },
            windows: { enabled: false }
        });
        assertMaterialsOptOutOfIbl(parts, 'BuildingGenerator');
    });

    test('BuildingFabricationGenerator: walls opt out of IBL', () => {
        const map = makeTinyMap({ width: 1, height: 1, tileSize: 2 });
        const parts = buildBuildingFabricationVisualPartsForIbl({
            map,
            tiles: [{ x: 0, y: 0 }],
            tileSize: 2,
            layers: [
                { type: 'floor', floors: 1, floorHeight: 3, windows: { enabled: false }, belt: { enabled: false } },
                { type: 'roof', ring: { enabled: false } }
            ],
            textureCache: null,
            renderer: null,
            overlays: { wire: false, floorplan: false, border: false, floorDivisions: false }
        });
        assertMaterialsOptOutOfIbl(parts, 'BuildingFabricationGenerator');
    });

    // ========== RoadEngineMeshData Tests ==========
    const { triangulateSimplePolygonXZ } = await import('/src/app/road_engine/RoadEngineMeshData.js');
    const { buildRoadCurbMeshDataFromRoadEnginePrimitives } = await import('/src/app/road_decoration/curbs/RoadCurbBuilder.js');
    const { buildRoadSidewalkMeshDataFromRoadEnginePrimitives } = await import('/src/app/road_decoration/sidewalks/RoadSidewalkBuilder.js');

    test('RoadEngineMeshData: triangulation faces +Y', () => {
        const square = [
            { x: 0, z: 0 },
            { x: 10, z: 0 },
            { x: 10, z: 10 },
            { x: 0, z: 10 }
        ];

        const cases = [square, square.slice().reverse()];
        for (const pts of cases) {
            const { vertices, indices } = triangulateSimplePolygonXZ(pts);
            assertTrue(indices.length >= 3, 'Expected triangle indices.');
            for (let i = 0; i + 2 < indices.length; i += 3) {
                const a = vertices[indices[i]];
                const b = vertices[indices[i + 1]];
                const c = vertices[indices[i + 2]];
                const y = (b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z);
                assertTrue(y > 1e-9, `Expected +Y facing triangle, got ${y}.`);
            }
        }
    });

    test('RoadCurbBuilder: top faces +Y', () => {
        const prims = [{
            type: 'polygon',
            kind: 'asphalt_piece',
            points: [
                { x: 0, z: 0 },
                { x: 10, z: 0 },
                { x: 10, z: 10 },
                { x: 0, z: 10 }
            ]
        }];

        const surfaceY = 0;
        const curbHeight = 0.2;
        const curbExtraHeight = 0.1;
        const curbSink = 0.15;
        const topY = surfaceY + curbHeight + curbExtraHeight;
        const bottomY = surfaceY - curbSink;

        const data = buildRoadCurbMeshDataFromRoadEnginePrimitives(prims, {
            surfaceY,
            curbThickness: 0.5,
            curbHeight,
            curbExtraHeight,
            curbSink
        });

        const positions = data?.positions ?? null;
        assertTrue(positions && positions.length > 0, 'Expected curb positions.');

        let topTris = 0;
        let bottomTris = 0;
        const eps = 1e-6;
        for (let i = 0; i + 8 < positions.length; i += 9) {
            const ax = positions[i];
            const ay = positions[i + 1];
            const az = positions[i + 2];
            const bx = positions[i + 3];
            const by = positions[i + 4];
            const bz = positions[i + 5];
            const cx = positions[i + 6];
            const cy = positions[i + 7];
            const cz = positions[i + 8];

            const abx = bx - ax;
            const aby = by - ay;
            const abz = bz - az;
            const acx = cx - ax;
            const acy = cy - ay;
            const acz = cz - az;
            const ny = abz * acx - abx * acz;

            const isTop = Math.abs(ay - topY) <= eps && Math.abs(by - topY) <= eps && Math.abs(cy - topY) <= eps;
            const isBottom = Math.abs(ay - bottomY) <= eps && Math.abs(by - bottomY) <= eps && Math.abs(cy - bottomY) <= eps;

            if (isTop) {
                topTris += 1;
                assertTrue(ny > 1e-9, `Expected curb top face +Y, got ${ny}.`);
            }

            if (isBottom) {
                bottomTris += 1;
                assertTrue(ny < -1e-9, `Expected curb bottom face -Y, got ${ny}.`);
            }
        }

        assertTrue(topTris > 0, 'Expected curb top triangles.');
        assertTrue(bottomTris > 0, 'Expected curb bottom triangles.');
    });

    test('RoadSidewalkBuilder: top faces +Y', () => {
        const prims = [{
            type: 'polygon',
            kind: 'asphalt_piece',
            points: [
                { x: 0, z: 0 },
                { x: 10, z: 0 },
                { x: 10, z: 10 },
                { x: 0, z: 10 }
            ]
        }];

        const surfaceY = 0;
        const curbHeight = 0.2;
        const curbExtraHeight = 0.1;
        const sidewalkLift = 0.05;
        const topY = surfaceY + curbHeight + curbExtraHeight + sidewalkLift;

        const data = buildRoadSidewalkMeshDataFromRoadEnginePrimitives(prims, {
            surfaceY,
            curbThickness: 0.5,
            curbHeight,
            curbExtraHeight,
            sidewalkWidth: 1.2,
            sidewalkLift
        });

        const positions = data?.positions ?? null;
        assertTrue(positions && positions.length > 0, 'Expected sidewalk positions.');

        let topTris = 0;
        const eps = 1e-6;
        for (let i = 0; i + 8 < positions.length; i += 9) {
            const ax = positions[i];
            const ay = positions[i + 1];
            const az = positions[i + 2];
            const bx = positions[i + 3];
            const by = positions[i + 4];
            const bz = positions[i + 5];
            const cx = positions[i + 6];
            const cy = positions[i + 7];
            const cz = positions[i + 8];

            const isTop = Math.abs(ay - topY) <= eps && Math.abs(by - topY) <= eps && Math.abs(cy - topY) <= eps;
            if (!isTop) continue;

            const abx = bx - ax;
            const abz = bz - az;
            const acx = cx - ax;
            const acz = cz - az;
            const ny = abz * acx - abx * acz;

            topTris += 1;
            assertTrue(ny > 1e-9, `Expected sidewalk top face +Y, got ${ny}.`);
        }

        assertTrue(topTris > 0, 'Expected sidewalk top triangles.');
    });

    // ========== Building Fabrication Mini Controller Utils ==========
    const { clampNumber, clampInt, formatFixed } = await import('/src/graphics/gui/building_fabrication/mini_controllers/RangeNumberUtils.js');
    const { createMaterialPickerRowController } = await import('/src/graphics/gui/building_fabrication/mini_controllers/MaterialPickerRowController.js');
    const { createMaterialVariationUIController } = await import('/src/graphics/gui/building_fabrication/MaterialVariationUIController.js');
    const { createWindowUIController } = await import('/src/graphics/gui/building_fabrication/WindowUIController.js');
    const { createWallsUIController } = await import('/src/graphics/gui/building_fabrication/WallsUIController.js');
    const { WINDOW_TYPE: WINDOW_TYPE_LOCAL, getDefaultWindowParams: getDefaultWindowParamsLocal } = await import('/src/graphics/assets3d/generators/buildings/WindowTextureGenerator.js');

    test('RangeNumberUtils: clampNumber clamps and defaults', () => {
        assertEqual(clampNumber(5, 0, 10), 5, 'Expected 5 to stay in range.');
        assertEqual(clampNumber(-1, 0, 10), 0, 'Expected below-min to clamp to min.');
        assertEqual(clampNumber(11, 0, 10), 10, 'Expected above-max to clamp to max.');
        assertEqual(clampNumber('abc', 2, 10), 2, 'Expected non-numeric to clamp to min.');
    });

    test('RangeNumberUtils: clampInt rounds and clamps', () => {
        assertEqual(clampInt(4.6, 0, 10), 5, 'Expected rounding to nearest int.');
        assertEqual(clampInt(-9, 0, 10), 0, 'Expected below-min to clamp to min.');
        assertEqual(clampInt(99, 0, 10), 10, 'Expected above-max to clamp to max.');
        assertEqual(clampInt('abc', 7, 10), 7, 'Expected non-numeric to clamp to min.');
    });

    test('RangeNumberUtils: formatFixed formats and handles non-finite', () => {
        assertEqual(formatFixed(1.234, 2), '1.23', 'Expected fixed formatting.');
        assertEqual(formatFixed(1.234, -1), '1', 'Expected negative digits to clamp to 0.');
        assertEqual(formatFixed(Infinity, 2), '', 'Expected non-finite to return empty.');
    });

    test('MaterialPickerRowController: builds expected DOM', () => {
        const ctrl = createMaterialPickerRowController({
            label: 'Material',
            text: 'Bricks',
            status: true,
            statusText: 'Ready'
        });

        assertTrue(ctrl.row.classList.contains('building-fab-row'), 'Expected row to have building-fab-row class.');
        assertTrue(ctrl.row.classList.contains('building-fab-row-texture'), 'Expected row to have building-fab-row-texture class.');
        assertEqual(ctrl.label.textContent, 'Material', 'Expected label text to match.');
        assertTrue(ctrl.picker.classList.contains('building-fab-texture-picker'), 'Expected picker container class.');
        assertTrue(ctrl.picker.classList.contains('building-fab-material-picker'), 'Expected picker container class.');
        assertEqual(ctrl.text.textContent, 'Bricks', 'Expected text node to match.');
        assertEqual(ctrl.status.textContent, 'Ready', 'Expected status text to match.');
        ctrl.destroy();
    });

    test('MaterialPickerRowController: onPick respects disabled and destroy', () => {
        let calls = 0;
        const ctrl = createMaterialPickerRowController({
            label: 'Pick',
            onPick: () => { calls++; }
        });

        ctrl.button.click();
        assertEqual(calls, 1, 'Expected click to invoke onPick.');

        ctrl.setDisabled(true);
        ctrl.button.click();
        assertEqual(calls, 1, 'Expected disabled click to do nothing.');

        ctrl.setDisabled(false);
        ctrl.button.click();
        assertEqual(calls, 2, 'Expected re-enabled click to invoke onPick.');

        ctrl.destroy();
        ctrl.button.click();
        assertEqual(calls, 2, 'Expected destroy to remove click handler.');
    });

    test('MaterialVariationUIController: seed override toggles and syncs', () => {
        let seed = null;
        let seedNotified = 0;
        const ctrl = createMaterialVariationUIController({
            detailsOpenByKey: new Map(),
            getAllow: () => true,
            getHasSelected: () => false,
            getSeed: () => seed,
            setSeed: (next) => { seed = next; },
            notifySeedChanged: () => { seedNotified++; },
            onDebugChanged: () => {}
        });

        const root = document.createElement('div');
        ctrl.mount(root);
        ctrl.bind();
        ctrl.sync();

        const toggle = ctrl.seedSection.details.querySelector('input[type=\"checkbox\"]');
        const number = ctrl.seedSection.details.querySelector('input[type=\"number\"]');
        assertTrue(!!toggle, 'Expected seed checkbox to exist.');
        assertTrue(!!number, 'Expected seed number input to exist.');

        assertFalse(toggle.checked, 'Expected seed override to start disabled.');
        assertTrue(number.disabled, 'Expected seed number to be disabled when override off.');

        toggle.checked = true;
        toggle.dispatchEvent(new Event('change'));
        assertEqual(seed, 0, 'Expected enabling override to set seed to 0 when none set.');
        assertEqual(seedNotified, 1, 'Expected seed notification.');
        assertFalse(number.disabled, 'Expected seed number to be enabled when override on.');

        toggle.checked = false;
        toggle.dispatchEvent(new Event('change'));
        assertEqual(seed, null, 'Expected disabling override to clear seed.');
        assertEqual(seedNotified, 2, 'Expected seed notification on disable.');
        assertTrue(number.disabled, 'Expected seed number to be disabled when override off.');

        ctrl.unbind();
    });

    test('MaterialVariationUIController: debug change notifies and unbind stops', () => {
        let debugCalls = 0;
        const ctrl = createMaterialVariationUIController({
            detailsOpenByKey: new Map(),
            getAllow: () => true,
            getHasSelected: () => false,
            getSeed: () => null,
            setSeed: () => {},
            notifySeedChanged: () => {},
            onDebugChanged: () => { debugCalls++; }
        });

        const root = document.createElement('div');
        ctrl.mount(root);
        ctrl.bind();
        ctrl.sync();

        const firstToggle = ctrl.debugSection.details.querySelector('label input[type=\"checkbox\"]');
        assertTrue(!!firstToggle, 'Expected a debug checkbox to exist.');

        const before = debugCalls;
        firstToggle.checked = !firstToggle.checked;
        firstToggle.dispatchEvent(new Event('change'));
        assertTrue(debugCalls === before + 1, 'Expected debug change to notify.');

        ctrl.unbind();
        const beforeUnbound = debugCalls;
        firstToggle.checked = !firstToggle.checked;
        firstToggle.dispatchEvent(new Event('change'));
        assertEqual(debugCalls, beforeUnbound, 'Expected unbind to stop notifications.');
    });

    test('MaterialVariationUIController: anti-tiling changes call onChange', () => {
        let calls = 0;
        const ctrl = createMaterialVariationUIController({
            detailsOpenByKey: new Map(),
            getAllow: () => true,
            getHasSelected: () => true,
            getSeed: () => null,
            setSeed: () => {},
            notifySeedChanged: () => {},
            onDebugChanged: () => {}
        });

        const parent = document.createElement('div');
        const layer = { materialVariation: { enabled: true, seedOffset: 0 } };
        ctrl.appendWallMaterialVariationUI({
            parent,
            allow: true,
            scopeKey: 'test',
            layerId: '0',
            layer,
            onChange: () => { calls++; },
            onReRender: () => {},
            registerMiniController: () => {}
        });

        const antiToggle = Array.from(parent.querySelectorAll('label input[type="checkbox"]'))
            .find((input) => input.parentElement?.textContent?.includes('Enable anti-tiling'));
        assertTrue(!!antiToggle, 'Expected anti-tiling toggle to exist.');

        antiToggle.checked = true;
        antiToggle.dispatchEvent(new Event('change'));
        assertTrue(calls >= 1, 'Expected enabling anti-tiling to call onChange.');

        const antiDetails = antiToggle.closest('details');
        assertTrue(!!antiDetails, 'Expected anti-tiling details section.');
        const strengthRange = antiDetails.querySelector('input[type="range"]');
        assertTrue(!!strengthRange, 'Expected anti-tiling strength range to exist.');

        strengthRange.value = '0.5';
        strengthRange.dispatchEvent(new Event('input'));
        assertTrue(calls >= 2, 'Expected changing anti-tiling strength to call onChange.');
    });

    test('WindowUIController: width change calls callback and unbind stops', () => {
        let windowTypeId = WINDOW_TYPE_LOCAL.STYLE_DEFAULT;
        let windowParams = getDefaultWindowParamsLocal(windowTypeId);
        let windowWidth = 2.2;
        let windowGap = 1.6;
        let windowHeight = 1.4;
        let windowY = 1.0;
        let windowSpacerEnabled = false;
        let windowSpacerEvery = 4;
        let windowSpacerWidth = 0.9;
        let windowSpacerExtrude = false;
        let windowSpacerExtrudeDistance = 0.12;

        let calls = 0;
        const ctrl = createWindowUIController({
            pickerPopup: { open: () => {} },
            detailsOpenByKey: new Map(),
            clamp: clampNumber,
            clampInt,
            formatFloat: (v, digits) => formatFixed(v, digits),
            setMaterialThumbToTexture: () => {},
            setMaterialThumbToColor: () => {},
            getWindowTypeId: () => windowTypeId,
            setWindowTypeId: (v) => { windowTypeId = v; },
            getWindowParams: () => windowParams,
            setWindowParams: (v) => { windowParams = v; },
            getWindowWidth: () => windowWidth,
            setWindowWidth: (v) => { windowWidth = v; },
            getWindowGap: () => windowGap,
            setWindowGap: (v) => { windowGap = v; },
            getWindowHeight: () => windowHeight,
            setWindowHeight: (v) => { windowHeight = v; },
            getWindowY: () => windowY,
            setWindowY: (v) => { windowY = v; },
            getWindowSpacerEnabled: () => windowSpacerEnabled,
            setWindowSpacerEnabled: (v) => { windowSpacerEnabled = v; },
            getWindowSpacerEvery: () => windowSpacerEvery,
            setWindowSpacerEvery: (v) => { windowSpacerEvery = v; },
            getWindowSpacerWidth: () => windowSpacerWidth,
            setWindowSpacerWidth: (v) => { windowSpacerWidth = v; },
            getWindowSpacerExtrude: () => windowSpacerExtrude,
            setWindowSpacerExtrude: (v) => { windowSpacerExtrude = v; },
            getWindowSpacerExtrudeDistance: () => windowSpacerExtrudeDistance,
            setWindowSpacerExtrudeDistance: (v) => { windowSpacerExtrudeDistance = v; },
            requestSync: () => {},
            onWindowWidthChange: () => { calls++; }
        });

        const root = document.createElement('div');
        ctrl.mountFloorsWindowControls(root);
        ctrl.bind();
        ctrl.sync({ hasSelected: true, allow: true, allowStreetWindows: true });

        const widthLabel = Array.from(root.querySelectorAll('.building-fab-row-label'))
            .find((el) => el.textContent === 'Window width (m)');
        assertTrue(!!widthLabel, 'Expected window width row label.');
        const widthRange = widthLabel.parentElement?.querySelector('input[type="range"]');
        assertTrue(!!widthRange, 'Expected window width range input.');

        const before = calls;
        widthRange.value = '3.1';
        widthRange.dispatchEvent(new Event('input'));
        assertTrue(calls === before + 1, 'Expected width change to call callback.');
        assertNear(windowWidth, 3.1, 1e-6, 'Expected window width state to update.');

        ctrl.unbind();
        const beforeUnbound = calls;
        widthRange.value = '4.2';
        widthRange.dispatchEvent(new Event('input'));
        assertEqual(calls, beforeUnbound, 'Expected unbind to stop callbacks.');
    });

    test('WallsUIController: wall inset change calls callback and unbind stops', () => {
        let wallInset = 0.0;
        let calls = 0;
        const ctrl = createWallsUIController({
            detailsOpenByKey: new Map(),
            clamp: clampNumber,
            formatFloat: (v, digits) => formatFixed(v, digits),
            setMaterialThumbToTexture: () => {},
            setMaterialThumbToColor: () => {},
            getWallInset: () => wallInset,
            setWallInset: (v) => { wallInset = v; },
            onWallInsetChange: () => { calls++; }
        });

        const root = document.createElement('div');
        ctrl.mountWallInset(root);
        ctrl.bind();
        ctrl.syncGlobal({ hasSelected: true, allow: true });

        const insetLabel = Array.from(root.querySelectorAll('.building-fab-row-label'))
            .find((el) => el.textContent === 'Wall inset (m)');
        assertTrue(!!insetLabel, 'Expected wall inset row label.');
        const insetRange = insetLabel.parentElement?.querySelector('input[type="range"]');
        assertTrue(!!insetRange, 'Expected wall inset range input.');

        const before = calls;
        insetRange.value = '1.5';
        insetRange.dispatchEvent(new Event('input'));
        assertTrue(calls === before + 1, 'Expected inset change to call callback.');
        assertNear(wallInset, 1.5, 1e-6, 'Expected wall inset state to update.');

        ctrl.unbind();
        const beforeUnbound = calls;
        insetRange.value = '2.2';
        insetRange.dispatchEvent(new Event('input'));
        assertEqual(calls, beforeUnbound, 'Expected unbind to stop callbacks.');
    });

    // ========== VehicleManager Tests ==========
    const { VehicleManager } = await import('/src/app/core/VehicleManager.js');

    test('VehicleManager: addVehicle returns ID', () => {
        const bus = new EventBus();
        const manager = new VehicleManager(bus);
        const id = manager.addVehicle({ userData: {} }, { userData: {} }, {});
        assertTrue(id.startsWith('vehicle_'), 'ID should start with vehicle_');
    });

    test('VehicleManager: getVehicle returns entry', () => {
        const bus = new EventBus();
        const manager = new VehicleManager(bus);
        const mockVehicle = { userData: {} };
        const id = manager.addVehicle(mockVehicle, {}, {});
        const entry = manager.getVehicle(id);
        assertEqual(entry.vehicle, mockVehicle, 'Vehicle mismatch.');
    });

    test('VehicleManager: removeVehicle works', () => {
        const bus = new EventBus();
        const manager = new VehicleManager(bus);
        const id = manager.addVehicle({ userData: {} }, {}, {});
        assertTrue(manager.removeVehicle(id), 'Should return true.');
        assertFalse(manager.hasVehicle(id), 'Should not have vehicle.');
    });

    test('VehicleManager: emits vehicle:added event', () => {
        const bus = new EventBus();
        const manager = new VehicleManager(bus);
        let emitted = null;
        bus.on('vehicle:added', (e) => { emitted = e; });
        manager.addVehicle({ userData: {} }, {}, {});
        assertTrue(emitted !== null, 'Event should be emitted.');
        assertTrue(emitted.id.startsWith('vehicle_'), 'Event should have ID.');
    });

    test('VehicleManager: count works', () => {
        const bus = new EventBus();
        const manager = new VehicleManager(bus);
        manager.addVehicle({ userData: {} }, {}, {});
        manager.addVehicle({ userData: {} }, {}, {});
        assertEqual(manager.count, 2, 'Should have 2 vehicles.');
    });

    // ========== Material Variation Tests ==========
    const THREE = await import('three');
    const { applyMaterialVariationToMeshStandardMaterial, normalizeMaterialVariationConfig: normalizeMatVarConfig, MATERIAL_VARIATION_ROOT } = await import('/src/graphics/assets3d/materials/MaterialVariationSystem.js');

    test('MaterialVariationSystem: normal map shader supports mat-var debug toggles', () => {
        const mat = new THREE.MeshStandardMaterial();
        mat.normalMap = new THREE.Texture();
        mat.normalScale.set(1, 1);

        applyMaterialVariationToMeshStandardMaterial(mat, {
            seed: 1,
            seedOffset: 0,
            heightMin: 0,
            heightMax: 1,
            config: { enabled: true, normalMap: { flipY: true } },
            root: MATERIAL_VARIATION_ROOT.WALL
        });

        const shader = {
            uniforms: {},
            vertexShader: '#include <common>\nvoid main(){\n#include <begin_vertex>\n}\n',
            fragmentShader: '#include <common>\n#include <normal_fragment_maps>\n#include <map_fragment>\n#include <roughnessmap_fragment>\n'
        };

        mat.onBeforeCompile(shader, null);

        assertTrue(shader.uniforms.uMatVarNormalMap?.value?.isVector4, 'Expected uMatVarNormalMap to be injected as a vec4 uniform.');
        assertEqual(shader.uniforms.uMatVarNormalMap.value.y, 1, 'Expected normalMap.flipY to be encoded into uMatVarNormalMap.y.');

        assertTrue(shader.fragmentShader.includes('mvMatVarUvRotation'), 'Expected anti-tiling rotation to be applied to normal vectors.');
        assertTrue(shader.fragmentShader.includes('uMatVarNormalMap'), 'Expected normal-map flip config uniform to be referenced by the shader.');
        assertTrue(
            shader.fragmentShader.includes('uniform vec4 uMatVarDebug0;') && shader.fragmentShader.includes('uniform vec4 uMatVarDebug1;') && shader.fragmentShader.includes('uniform vec4 uMatVarDebug2;'),
            'Expected mat-var debug uniforms to be injected.'
        );
        assertTrue(
            shader.fragmentShader.includes('vec2 mvBasisUv = (mvUseOrigUv > 0.5) ? vNormalMapUv : mvNormUv;'),
            'Expected normal-map basis UV selection to be controllable via debug toggles.'
        );
        assertTrue(
            shader.fragmentShader.includes('mvPerturbNormal2Arb( -vViewPosition, normal, normalTex, faceDirection, mvBasisUv );'),
            'Expected mvPerturbNormal2Arb to use the selectable basis UVs.'
        );
        assertTrue(
            shader.fragmentShader.includes('vec3 q0perp=cross(N,q0);') && shader.fragmentShader.includes('float scale=(det==0.0)?0.0:faceDirection*inversesqrt(det);'),
            'Expected mvPerturbNormal2Arb to use the cross-product tangent basis (matches Three.js).'
        );
    });

    test('MaterialVariationSystem: brick layout normalization keeps legacy fields compatible', () => {
        const normalized = normalizeMatVarConfig(
            {
                brick: { bricksX: 8, bricksY: 4, mortar: 0.12 }
            },
            { root: MATERIAL_VARIATION_ROOT.WALL }
        );

        assertNear(normalized.brick.perBrick.layout.bricksPerTileX, 8, 1e-6, 'Expected bricksX to map to perBrick.layout.bricksPerTileX.');
        assertNear(normalized.brick.perBrick.layout.bricksPerTileY, 4, 1e-6, 'Expected bricksY to map to perBrick.layout.bricksPerTileY.');
        assertNear(normalized.brick.perBrick.layout.mortarWidth, 0.12, 1e-6, 'Expected mortar to map to perBrick.layout.mortarWidth.');
        assertNear(normalized.brick.perBrick.layout.offsetX, 0.0, 1e-6, 'Expected perBrick.layout.offsetX default to 0.');
        assertNear(normalized.brick.perBrick.layout.offsetY, 0.0, 1e-6, 'Expected perBrick.layout.offsetY default to 0.');

        assertNear(normalized.brick.mortar.layout.bricksPerTileX, 8, 1e-6, 'Expected legacy bricksX to default mortar.layout.bricksPerTileX.');
        assertNear(normalized.brick.mortar.layout.bricksPerTileY, 4, 1e-6, 'Expected legacy bricksY to default mortar.layout.bricksPerTileY.');
        assertNear(normalized.brick.mortar.layout.mortarWidth, 0.12, 1e-6, 'Expected legacy mortar to default mortar.layout.mortarWidth.');
        assertNear(normalized.brick.mortar.layout.offsetX, 0.0, 1e-6, 'Expected mortar.layout.offsetX default to 0.');
        assertNear(normalized.brick.mortar.layout.offsetY, 0.0, 1e-6, 'Expected mortar.layout.offsetY default to 0.');
    });

    test('MaterialVariationSystem: brick layout offsets flow into uniforms and shader uses stable hash inputs', () => {
        const mat = new THREE.MeshStandardMaterial();
        mat.map = new THREE.Texture();

        applyMaterialVariationToMeshStandardMaterial(mat, {
            seed: 1,
            seedOffset: 0,
            heightMin: 0,
            heightMax: 1,
            config: {
                enabled: true,
                brick: {
                    perBrick: {
                        enabled: true,
                        strength: 1.0,
                        layout: { offsetU: 0.25, offsetV: -0.5 }
                    }
                }
            },
            root: MATERIAL_VARIATION_ROOT.WALL
        });

        const cfg = mat.userData.materialVariationConfig;
        assertTrue(cfg.uniforms.brickLayout?.isVector4, 'Expected brickLayout uniforms to be a vec4.');
        assertNear(cfg.uniforms.brickLayout.x, 0.25, 1e-6, 'Expected perBrick.layout.offsetU to map to brickLayout.x.');
        assertNear(cfg.uniforms.brickLayout.y, -0.5, 1e-6, 'Expected perBrick.layout.offsetV to map to brickLayout.y.');
        assertNear(cfg.uniforms.brickLayout.z, 0.0, 1e-6, 'Expected mortar.layout.offsetX to default to 0.');
        assertNear(cfg.uniforms.brickLayout.w, 0.0, 1e-6, 'Expected mortar.layout.offsetY to default to 0.');

        const shader = {
            uniforms: {},
            vertexShader: '#include <common>\nvoid main(){\n#include <begin_vertex>\n}\n',
            fragmentShader: '#include <common>\n#include <map_fragment>\n#include <roughnessmap_fragment>\n'
        };

        mat.onBeforeCompile(shader, null);

        assertTrue(shader.uniforms.uMatVarBrickLayout?.value?.isVector4, 'Expected uMatVarBrickLayout to be injected as a vec4 uniform.');
        assertTrue(shader.uniforms.uMatVarBrickTiles2?.value?.isVector4, 'Expected uMatVarBrickTiles2 to be injected as a vec4 uniform.');
        assertTrue(shader.fragmentShader.includes('uMatVarBrickLayout.xy'), 'Expected brick layout offsets to affect brick UVs.');
        assertTrue(shader.fragmentShader.includes('float r = mvHash12(cell + vec2'), 'Expected per-brick randomization to hash stable cell IDs.');
        assertTrue(shader.fragmentShader.includes('brickFade = 1.0 - smoothstep'), 'Expected per-brick variation to fade at distance to reduce flicker.');
        assertFalse(shader.fragmentShader.includes('mvHash12(buv'), 'Expected per-brick hash input to avoid unstable raw UVs.');
    });

    // ========== Bus Catalog Tests ==========
    const { BUS_CATALOG, getBusSpec } = await import('/src/app/vehicle/buses/BusCatalog.js');

    test('BusCatalog: engine power scaled by 30%', () => {
        const scale = 1.3;
        const baseline = Object.freeze({
            city: { engineForce: 200000, maxTorque: 2300 },
            coach: { engineForce: 210000, maxTorque: 2500 },
            double: { engineForce: 220000, maxTorque: 2650 }
        });

        const expectedIds = Object.keys(baseline);
        for (const id of expectedIds) {
            assertTrue(BUS_CATALOG.some((spec) => spec?.id === id), `Expected ${id} in BUS_CATALOG.`);
        }

        for (const [id, expected] of Object.entries(baseline)) {
            const spec = getBusSpec(id);
            assertTrue(!!spec, `Expected bus spec ${id}.`);
            assertNear(spec?.tuning?.engineForce, expected.engineForce * scale, 1e-6, `${id} engineForce.`);
            assertNear(spec?.tuning?.engine?.maxTorque, expected.maxTorque * scale, 1e-6, `${id} maxTorque.`);
        }
    });

    // ========== PhysicsController Tests (added in Task 4) ==========
    try {
        const { PhysicsController } = await import('/src/app/physics/PhysicsController.js');

        test('PhysicsController: instantiates with EventBus', () => {
            const bus = new EventBus();
            const ctrl = new PhysicsController(bus);
            assertTrue(ctrl !== null, 'Controller should exist.');
            assertTrue(ctrl.loop !== null, 'Loop should exist.');
        });

        test('PhysicsController: stores vehicle state after addVehicle', () => {
            const bus = new EventBus();
            const ctrl = new PhysicsController(bus);
            const anchor = { position: { x: 1, y: 2, z: 3 }, rotation: { y: 0.5 } };
            ctrl.addVehicle('v1', { id: 'v1' }, anchor, {});
            assertTrue(ctrl.hasVehicle('v1'), 'Should register vehicle.');
            const state = ctrl.getVehicleState('v1');
            assertTrue(state !== null, 'State should exist.');
            assertEqual(state.locomotion.position.x, 1, 'Position x should match anchor.');
            assertEqual(state.locomotion.position.y, 2, 'Position y should match anchor.');
            assertEqual(state.locomotion.position.z, 3, 'Position z should match anchor.');
        });

        test('PhysicsController: removeVehicle unregisters vehicles', () => {
            const bus = new EventBus();
            const ctrl = new PhysicsController(bus);
            ctrl.addVehicle('v1', { id: 'v1' }, {}, {});
            ctrl.removeVehicle('v1');
            assertFalse(ctrl.hasVehicle('v1'), 'Vehicle should be removed.');
            assertEqual(ctrl.getVehicleState('v1'), null, 'State should be cleared.');
        });

        test('PhysicsController: update calls loop.update', () => {
            const bus = new EventBus();
            const ctrl = new PhysicsController(bus);
            // Should not throw
            ctrl.update(0.016);
            assertTrue(true, 'Update should not throw.');
        });

        test('PhysicsController: setInput updates debug snapshot', () => {
            const bus = new EventBus();
            const ctrl = new PhysicsController(bus);
            ctrl.addVehicle('v1', { id: 'v1' }, {}, {});
            ctrl.setInput('v1', { throttle: 0.8, steering: -0.5, brake: 0.2, handbrake: 0.1 });
            const debug = ctrl.getVehicleDebug('v1');
            assertTrue(debug !== null, 'Debug should exist.');
            assertEqual(debug.input.throttle, 0.8, 'Throttle should match input.');
            assertEqual(debug.input.steering, -0.5, 'Steering should match input.');
            assertEqual(debug.input.brake, 0.2, 'Brake should match input.');
            assertEqual(debug.input.handbrake, 0.1, 'Handbrake should match input.');
            assertTrue(debug.forces.driveForce !== 0, 'Drive force should be non-zero.');
        });

        test('PhysicsController: getSystem returns null', () => {
            const bus = new EventBus();
            const ctrl = new PhysicsController(bus);
            assertEqual(ctrl.getSystem('locomotion'), null, 'Should return null for legacy systems.');
        });

        test('PhysicsController: getVehicleIds returns registered vehicles', () => {
            const bus = new EventBus();
            const ctrl = new PhysicsController(bus);
            ctrl.addVehicle('v1', { id: 'v1' }, {}, {});
            ctrl.addVehicle('v2', { id: 'v2' }, {}, {});
            const ids = ctrl.getVehicleIds();
            assertTrue(ids.includes('v1'), 'Should include v1.');
            assertTrue(ids.includes('v2'), 'Should include v2.');
            assertEqual(ids.length, 2, 'Should have 2 vehicles.');
        });

        test('PhysicsController: hasVehicle returns correct status', () => {
            const bus = new EventBus();
            const ctrl = new PhysicsController(bus);
            ctrl.addVehicle('v1', { id: 'v1' }, {}, {});
            assertTrue(ctrl.hasVehicle('v1'), 'Should have v1.');
            assertFalse(ctrl.hasVehicle('v2'), 'Should not have v2.');
        });
    } catch (e) {
        // PhysicsController not yet created - skip these tests
        console.log('⏭️  PhysicsController tests skipped (not yet created)');
    }

    // ========== SimulationContext Tests (added in Task 5) ==========
    try {
        const { SimulationContext } = await import('/src/app/core/SimulationContext.js');

        test('SimulationContext: instantiates with all systems', () => {
            const ctx = new SimulationContext();
            assertTrue(ctx.events !== null, 'events should exist');
            assertTrue(ctx.vehicles !== null, 'vehicles should exist');
            assertTrue(ctx.physics !== null, 'physics should exist');
        });

        test('SimulationContext: addVehicle registers with all systems', () => {
            const ctx = new SimulationContext();
            const id = ctx.addVehicle({ userData: {} }, { userData: {} }, {});
            assertTrue(id.startsWith('vehicle_'), 'Should return ID');
            assertTrue(ctx.vehicles.hasVehicle(id), 'VehicleManager should have vehicle');
            assertTrue(ctx.physics._vehicleIds.has(id), 'PhysicsController should have vehicle');
        });

        test('SimulationContext: removeVehicle unregisters from all systems', () => {
            const ctx = new SimulationContext();
            const id = ctx.addVehicle({ userData: {} }, { userData: {} }, {});
            ctx.removeVehicle(id);
            assertFalse(ctx.vehicles.hasVehicle(id), 'VehicleManager should not have vehicle');
            assertFalse(ctx.physics._vehicleIds.has(id), 'PhysicsController should not have vehicle');
        });

        test('SimulationContext: setEnvironment propagates to physics', () => {
            const ctx = new SimulationContext();
            const env = { map: {}, config: {} };
            ctx.setEnvironment(env);
            assertEqual(ctx.getEnvironment(), env, 'Environment should be set');
        });

        test('SimulationContext: update calls physics.update', () => {
            const ctx = new SimulationContext();
            ctx.update(0.016);
            assertTrue(true, 'Update should not throw');
        });

        test('SimulationContext: dispose cleans up all systems', () => {
            const ctx = new SimulationContext();
            ctx.addVehicle({ userData: {} }, { userData: {} }, {});
            ctx.dispose();
            assertEqual(ctx.vehicles.count, 0, 'Vehicles should be cleared');
        });

        test('SimulationContext: has legacy context fields', () => {
            const ctx = new SimulationContext();
            assertEqual(ctx.selectedBusId, null, 'selectedBusId should be null');
            assertEqual(ctx.selectedBus, null, 'selectedBus should be null');
        });
    } catch (e) {
        console.log('⏭️  SimulationContext tests skipped (not yet created)');
    }

    // ========== GameEngine Integration Tests (added in Task 6) ==========
    try {
        const { GameEngine } = await import('/src/app/core/GameEngine.js');

        // Create a mock canvas for testing
        const mockCanvas = document.createElement('canvas');
        mockCanvas.width = 100;
        mockCanvas.height = 100;

        test('GameEngine: has simulation property', () => {
            const engine = new GameEngine({ canvas: mockCanvas });
            assertTrue(engine.simulation !== null, 'simulation should exist');
            assertTrue(engine.simulation.events !== undefined, 'simulation.events should exist');
            assertTrue(engine.simulation.vehicles !== undefined, 'simulation.vehicles should exist');
            assertTrue(engine.simulation.physics !== undefined, 'simulation.physics should exist');
        });

        test('GameEngine: context getter returns proxy', () => {
            const engine = new GameEngine({ canvas: mockCanvas });
            assertTrue(engine.context !== null, 'context should exist');
        });

        test('GameEngine: context.selectedBus syncs with simulation', () => {
            const engine = new GameEngine({ canvas: mockCanvas });
            const mockBus = { name: 'test-bus' };
            engine.context.selectedBus = mockBus;
            assertEqual(engine.simulation.selectedBus, mockBus, 'simulation.selectedBus should match');
            assertEqual(engine.context.selectedBus, mockBus, 'context.selectedBus should match');
        });

        test('GameEngine: context.selectedBusId syncs with simulation', () => {
            const engine = new GameEngine({ canvas: mockCanvas });
            engine.context.selectedBusId = 'bus-123';
            assertEqual(engine.simulation.selectedBusId, 'bus-123', 'simulation.selectedBusId should match');
            assertEqual(engine.context.selectedBusId, 'bus-123', 'context.selectedBusId should match');
        });
    } catch (e) {
        console.log('⏭️  GameEngine integration tests skipped:', e.message);
    }

    // ========== InputManager Tests (added in Task 13) ==========
    try {
        const { InputManager } = await import('/src/app/input/InputManager.js');

        test('InputManager: instantiates with EventBus', () => {
            const bus = new EventBus();
            const input = new InputManager(bus);
            assertTrue(input !== null, 'InputManager should exist.');
            assertTrue(input.steer !== null, 'steer control should exist.');
            assertTrue(input.throttle !== null, 'throttle control should exist.');
            assertTrue(input.brake !== null, 'brake control should exist.');
        });

        test('InputManager: getControls returns initial values', () => {
            const bus = new EventBus();
            const input = new InputManager(bus);
            const controls = input.getControls();
            assertEqual(controls.steering, 0, 'Initial steering should be 0.');
            assertEqual(controls.throttle, 0, 'Initial throttle should be 0.');
            assertEqual(controls.brake, 0, 'Initial brake should be 0.');
            assertEqual(controls.handbrake, 0, 'Initial handbrake should be 0.');
            assertEqual(controls.headlights, false, 'Initial headlights should be false.');
        });

        test('InputManager: update emits input:controls event', () => {
            const bus = new EventBus();
            const input = new InputManager(bus);
            let received = null;
            bus.on('input:controls', (e) => { received = e; });

            input.update(1 / 60);

            assertTrue(received !== null, 'Should emit input:controls event.');
            assertTrue(typeof received.steering === 'number', 'Should have steering.');
            assertTrue(typeof received.throttle === 'number', 'Should have throttle.');
        });

        test('InputManager: attach/detach work', () => {
            const bus = new EventBus();
            const input = new InputManager(bus);

            input.attach();
            assertTrue(input._attached, 'Should be attached.');

            input.detach();
            assertFalse(input._attached, 'Should be detached.');
        });

        test('InputManager: reset clears all inputs', () => {
            const bus = new EventBus();
            const input = new InputManager(bus);

            // Simulate some input
            input.keys.up = true;
            input.steer.value = 0.5;

            input.reset();

            assertFalse(input.keys.up, 'Keys should be reset.');
            assertEqual(input.steer.value, 0, 'Steer should be reset.');
        });

        test('InputManager: setHeadlights works', () => {
            const bus = new EventBus();
            const input = new InputManager(bus);

            input.setHeadlights(true);
            assertTrue(input.getControls().headlights, 'Headlights should be on.');

            input.setHeadlights(false);
            assertFalse(input.getControls().headlights, 'Headlights should be off.');
        });

        test('InputManager: dispose cleans up', () => {
            const bus = new EventBus();
            const input = new InputManager(bus);
            input.attach();

            input.dispose();

            assertFalse(input._attached, 'Should be detached after dispose.');
        });
    } catch (e) {
        console.log('⏭️  InputManager tests skipped:', e.message);
    }

    // ========== VehicleController Tests (added in Task 14) ==========
    try {
        const { VehicleController } = await import('/src/app/vehicle/VehicleController.js');
        const { PhysicsController } = await import('/src/app/physics/PhysicsController.js');

        test('VehicleController: instantiates with required params', () => {
            const bus = new EventBus();
            const physics = new PhysicsController(bus);
            physics.addVehicle('v1', { id: 'v1' }, {}, {});

            const ctrl = new VehicleController('v1', physics, bus);
            assertTrue(ctrl !== null, 'VehicleController should exist.');
            assertEqual(ctrl.vehicleId, 'v1', 'vehicleId should match.');
        });

        test('VehicleController: setInput updates input state', () => {
            const bus = new EventBus();
            const physics = new PhysicsController(bus);
            physics.addVehicle('v1', { id: 'v1' }, {}, {});

            const ctrl = new VehicleController('v1', physics, bus);
            ctrl.setInput({ throttle: 0.5, steering: 0.3 });

            const input = ctrl.getInput();
            assertEqual(input.throttle, 0.5, 'Throttle should be 0.5.');
            assertEqual(input.steering, 0.3, 'Steering should be 0.3.');
        });

        test('VehicleController: convenience methods work', () => {
            const bus = new EventBus();
            const physics = new PhysicsController(bus);
            physics.addVehicle('v1', { id: 'v1' }, {}, {});

            const ctrl = new VehicleController('v1', physics, bus);
            ctrl.setThrottle(0.8);
            ctrl.setBrake(0.4);
            ctrl.setSteering(-0.5);
            ctrl.setHandbrake(1.0);

            const input = ctrl.getInput();
            assertEqual(input.throttle, 0.8, 'Throttle should be 0.8.');
            assertEqual(input.brake, 0.4, 'Brake should be 0.4.');
            assertEqual(input.steering, -0.5, 'Steering should be -0.5.');
            assertEqual(input.handbrake, 1.0, 'Handbrake should be 1.0.');
        });

        test('VehicleController: setHeadlights updates settings', () => {
            const bus = new EventBus();
            const physics = new PhysicsController(bus);
            physics.addVehicle('v1', { id: 'v1' }, {}, {});

            const ctrl = new VehicleController('v1', physics, bus);
            ctrl.setHeadlights(true);

            assertTrue(ctrl.getSettings().headlightsOn, 'Headlights should be on.');
        });

        test('VehicleController: getState returns physics state', () => {
            const bus = new EventBus();
            const physics = new PhysicsController(bus);
            physics.addVehicle('v1', { id: 'v1' }, {}, {});

            const ctrl = new VehicleController('v1', physics, bus);
            const state = ctrl.getState();

            assertTrue(state !== null, 'State should exist.');
            assertTrue(state.locomotion !== undefined, 'Should have locomotion.');
            assertTrue(state.suspension !== undefined, 'Should have suspension.');
        });

        test('VehicleController: responds to input:controls event', () => {
            const bus = new EventBus();
            const physics = new PhysicsController(bus);
            physics.addVehicle('v1', { id: 'v1' }, {}, {});

            const ctrl = new VehicleController('v1', physics, bus);

            // Emit input event
            bus.emit('input:controls', { throttle: 0.7, steering: 0.2 });

            const input = ctrl.getInput();
            assertEqual(input.throttle, 0.7, 'Throttle should be 0.7.');
            assertEqual(input.steering, 0.2, 'Steering should be 0.2.');
        });

        test('VehicleController: dispose cleans up', () => {
            const bus = new EventBus();
            const physics = new PhysicsController(bus);
            physics.addVehicle('v1', { id: 'v1' }, {}, {});

            const ctrl = new VehicleController('v1', physics, bus);
            ctrl.dispose();

            // After dispose, input events should not update controller
            bus.emit('input:controls', { throttle: 0.9 });
            assertEqual(ctrl.getInput().throttle, 0, 'Throttle should still be 0 after dispose.');
        });
    } catch (e) {
        console.log('⏭️  VehicleController tests skipped:', e.message);
    }

    // ========== GameLoop Tests (added in Task 15) ==========
    try {
        const { GameLoop } = await import('/src/app/core/GameLoop.js');
        const { SimulationContext } = await import('/src/app/core/SimulationContext.js');
        const { VehicleController } = await import('/src/app/vehicle/VehicleController.js');

        test('GameLoop: instantiates with SimulationContext', () => {
            const sim = new SimulationContext();
            const loop = new GameLoop(sim);
            assertTrue(loop !== null, 'GameLoop should exist.');
            assertTrue(loop.events !== null, 'events should exist.');
            assertTrue(loop.physics !== null, 'physics should exist.');
        });

        test('GameLoop: update runs without error', () => {
            const sim = new SimulationContext();
            const loop = new GameLoop(sim);

            // Should not throw
            loop.update(1 / 60);
            assertTrue(true, 'Update should not throw.');
        });

        test('GameLoop: pause/resume work', () => {
            const sim = new SimulationContext();
            const loop = new GameLoop(sim);

            assertFalse(loop.paused, 'Should not be paused initially.');

            loop.pause();
            assertTrue(loop.paused, 'Should be paused after pause().');

            loop.resume();
            assertFalse(loop.paused, 'Should not be paused after resume().');
        });

        test('GameLoop: togglePause works', () => {
            const sim = new SimulationContext();
            const loop = new GameLoop(sim);

            loop.togglePause();
            assertTrue(loop.paused, 'Should be paused after first toggle.');

            loop.togglePause();
            assertFalse(loop.paused, 'Should not be paused after second toggle.');
        });

        test('GameLoop: addVehicleController/getController work', () => {
            const sim = new SimulationContext();
            const loop = new GameLoop(sim);

            sim.physics.addVehicle('v1', { id: 'v1' }, {}, {});
            const ctrl = new VehicleController('v1', sim.physics, sim.events);

            loop.addVehicleController(ctrl);
            assertEqual(loop.getController('v1'), ctrl, 'Should return controller.');
        });

        test('GameLoop: setTimeScale works', () => {
            const sim = new SimulationContext();
            const loop = new GameLoop(sim);

            loop.setTimeScale(0.5);
            assertEqual(loop.timeScale, 0.5, 'Time scale should be 0.5.');

            loop.setTimeScale(2.0);
            assertEqual(loop.timeScale, 2.0, 'Time scale should be 2.0.');
        });

        test('GameLoop: emits frame events', () => {
            const sim = new SimulationContext();
            const loop = new GameLoop(sim);
            let received = null;

            loop.events.on('gameloop:frame', (e) => { received = e; });
            loop.update(1 / 60);

            assertTrue(received !== null, 'Should emit gameloop:frame.');
            assertTrue(received.frameCount === 1, 'Frame count should be 1.');
        });

        test('GameLoop: getTelemetry returns data', () => {
            const sim = new SimulationContext();
            const loop = new GameLoop(sim);

            sim.physics.addVehicle('v1', { id: 'v1' }, {}, {});
            loop.update(1 / 60);

            const telemetry = loop.getTelemetry('v1');
            assertTrue(telemetry !== null, 'Telemetry should exist.');
            assertTrue(typeof telemetry.speedKph === 'number', 'Should have speedKph.');
        });

        test('GameLoop: dispose cleans up', () => {
            const sim = new SimulationContext();
            const loop = new GameLoop(sim);

            sim.physics.addVehicle('v1', { id: 'v1' }, {}, {});
            const ctrl = new VehicleController('v1', sim.physics, sim.events);
            loop.addVehicleController(ctrl);

            loop.dispose();

            assertEqual(loop.controllers.size, 0, 'Controllers should be cleared.');
        });
    } catch (e) {
        console.log('⏭️  GameLoop tests skipped:', e.message);
    }

    // ========== GameplayState Tests (added in Task 16) ==========
    try {
        const { GameplayState } = await import('/src/states/GameplayState.js');
        const { PhysicsController } = await import('/src/app/physics/PhysicsController.js');

        test('GameplayState: class exists and can be imported', () => {
            assertTrue(typeof GameplayState === 'function', 'GameplayState should be a class.');
        });

        test('GameplayState: constructor works with mock engine', () => {
            // Create minimal mock engine
            const mockEngine = {
                simulation: {
                    events: new EventBus(),
                    physics: new PhysicsController(new EventBus())
                },
                context: {},
                scene: { add: () => {}, remove: () => {} },
                camera: { position: { copy: () => {}, lerp: () => {} }, lookAt: () => {} },
                clearScene: () => {}
            };
            const mockSm = { go: () => {} };

            const state = new GameplayState(mockEngine, mockSm);
            assertTrue(state !== null, 'GameplayState should instantiate.');
            assertEqual(state.gameLoop, null, 'gameLoop should be null before enter.');
        });
    } catch (e) {
        console.log('⏭️  GameplayState tests skipped:', e.message);
    }

    // ========== createVehicleFromBus Tests ==========
    try {
        const { createVehicleFromBus } = await import('/src/app/vehicle/createVehicle.js');
        const THREE = await import('three');

        test('createVehicleFromBus: function exists', () => {
            assertTrue(typeof createVehicleFromBus === 'function', 'createVehicleFromBus should be a function.');
        });

        test('createVehicleFromBus: returns null for null input', () => {
            const result = createVehicleFromBus(null);
            assertEqual(result, null, 'Should return null for null input.');
        });

        test('createVehicleFromBus: returns null for undefined input', () => {
            const result = createVehicleFromBus(undefined);
            assertEqual(result, null, 'Should return null for undefined input.');
        });

        test('createVehicleFromBus: creates vehicle from simple Object3D', () => {
            const mockBus = new THREE.Group();
            mockBus.name = 'test_bus';
            mockBus.userData = {
                api: {
                    setSteerAngle: () => {},
                    setBodyTilt: () => {},
                    wheelRig: { wheelRadius: 0.5 }
                }
            };

            const vehicle = createVehicleFromBus(mockBus);
            assertTrue(vehicle !== null, 'Should create vehicle.');
            assertTrue(vehicle.id.startsWith('vehicle_'), 'Should have generated ID.');
            assertEqual(vehicle.model, mockBus, 'Model should be the bus.');
            assertTrue(vehicle.anchor !== null, 'Should have anchor.');
            assertEqual(vehicle.api, mockBus.userData.api, 'Should have API.');
            assertTrue(vehicle.config !== null, 'Should have config.');
        });

        test('createVehicleFromBus: uses custom ID when provided', () => {
            const mockBus = new THREE.Group();
            mockBus.userData = {};

            const vehicle = createVehicleFromBus(mockBus, { id: 'custom_id' });
            assertTrue(vehicle !== null, 'Should create vehicle.');
            assertEqual(vehicle.id, 'custom_id', 'Should use custom ID.');
        });

        test('createVehicleFromBus: removes model from parent', () => {
            const parent = new THREE.Group();
            const mockBus = new THREE.Group();
            parent.add(mockBus);
            mockBus.userData = {};

            assertEqual(mockBus.parent, parent, 'Bus should have parent before.');
            const vehicle = createVehicleFromBus(mockBus);
            assertEqual(mockBus.parent, vehicle.anchor, 'Bus should be reparented to anchor.');
        });

        test('createVehicleFromBus: extracts config from model', () => {
            const mockBus = new THREE.Group();
            mockBus.name = 'city_bus';
            mockBus.userData = {
                suspensionTuning: { stiffness: 500 }
            };

            // Add a child mesh to give it size
            const body = new THREE.Mesh(
                new THREE.BoxGeometry(2.5, 3, 10),
                new THREE.MeshBasicMaterial()
            );
            mockBus.add(body);

            const vehicle = createVehicleFromBus(mockBus);
            assertTrue(vehicle.config.dimensions.length > 0, 'Should have dimensions.');
            assertEqual(vehicle.config.suspensionTuning.stiffness, 500, 'Should extract suspension tuning.');
        });
    } catch (e) {
        console.log('⏭️  createVehicleFromBus tests skipped:', e.message);
    }

    const { solveConnectorPath } = await import('/src/app/geometry/ConnectorPathSolver.js');
    const { createGeneratorConfig } = await import('/src/graphics/assets3d/generators/GeneratorParams.js');
    const { createCityConfig } = await import('/src/app/city/CityConfig.js');

    test('ConnectorPathSolver: reaches end pose within epsilon', () => {
        const genConfig = createGeneratorConfig();
        const cityConfig = createCityConfig();
        const tileSize = cityConfig.map.tileSize;
        const radius = genConfig.road?.curves?.turnRadius ?? 4.2;
        const posEps = tileSize * 1e-3;
        const dirEps = 1e-3;
        const cases = 64;

        for (let i = 0; i < cases; i++) {
            const p0 = new THREE.Vector2(
                (Math.random() - 0.5) * tileSize * 2,
                (Math.random() - 0.5) * tileSize * 2
            );
            const p1 = new THREE.Vector2(
                (Math.random() - 0.5) * tileSize * 2,
                (Math.random() - 0.5) * tileSize * 2
            );
            const h0 = Math.random() * Math.PI * 2;
            const h1 = Math.random() * Math.PI * 2;
            const dir0 = new THREE.Vector2(Math.cos(h0), Math.sin(h0));
            const dir1 = new THREE.Vector2(Math.cos(h1), Math.sin(h1));
            const result = solveConnectorPath({
                start: { position: p0, direction: dir0 },
                end: { position: p1, direction: dir1 },
                radius,
                allowFallback: false
            });
            assertTrue(result.ok, 'Solver should return a path.');
            assertTrue(result.metrics.endPoseErrorPos <= posEps, 'End position error too large.');
            assertTrue(result.metrics.endPoseErrorDir <= dirEps, 'End direction error too large.');
        }
    });

    // ========== Public Assets Tests ==========
    try {
        const [mainResp, grassResp] = await Promise.all([
            fetch('/assets/public/main.png', { method: 'HEAD' }),
            fetch('/assets/public/grass.png', { method: 'HEAD' })
        ]);

        test('Assets: public main.png served', () => {
            assertTrue(mainResp.ok, 'Expected /assets/public/main.png to be served.');
        });

        test('Assets: public grass.png served', () => {
            assertTrue(grassResp.ok, 'Expected /assets/public/grass.png to be served.');
        });
    } catch (e) {
        errors.push({ name: 'Assets: public assets served', error: e?.message || e });
        console.error(`❌ Assets: public assets served: ${e?.message || e}`);
    }

    // ========== Building Fabrication UI Tests ==========
    const { BuildingFabricationUI } = await import('/src/graphics/gui/building_fabrication/BuildingFabricationUI.js');
    const { BuildingFabricationScene, getHighestIndex3x2FootprintTileIds } = await import('/src/graphics/gui/building_fabrication/BuildingFabricationScene.js');
    const { offsetOrthogonalLoopXZ } = await import('/src/graphics/assets3d/generators/buildings/BuildingGenerator.js');
    const { buildBuildingFabricationVisualParts } = await import('/src/graphics/assets3d/generators/building_fabrication/BuildingFabricationGenerator.js');
    const { createDefaultFloorLayer, createDefaultRoofLayer } = await import('/src/graphics/assets3d/generators/building_fabrication/BuildingFabricationTypes.js');
    const {
        WINDOW_TYPE,
        getWindowNormalMapTexture,
        getWindowRoughnessMapTexture,
        getWindowTypeOptions,
        getWindowTexture
    } = await import('/src/graphics/assets3d/generators/buildings/WindowTextureGenerator.js');

    test('BuildingFabricationUI: view toggles live in view panel', () => {
        const ui = new BuildingFabricationUI();
        const viewPanel = ui.root.querySelector('.building-fab-view-panel');
        const propsPanel = ui.root.querySelector('.building-fab-props-panel');
        assertTrue(!!viewPanel, 'View panel should exist.');
        assertTrue(!!propsPanel, 'Props panel should exist.');
        assertTrue(!!viewPanel.querySelector('.building-fab-view-modes'), 'View mode selector should be inside view panel.');
        assertFalse(!!propsPanel.querySelector('.building-fab-view-modes'), 'View mode selector should not be inside props panel.');
    });

    test('BuildingFabricationUI: reset button lives in view panel', () => {
        const ui = new BuildingFabricationUI();
        const resetBtn = Array.from(ui.root.querySelectorAll('button'))
            .find((btn) => btn.textContent?.trim() === 'Reset scene');
        assertTrue(!!resetBtn, 'Reset button should exist.');
        assertTrue(!!resetBtn.closest('.building-fab-view-panel'), 'Reset button should be in view panel.');
    });

    test('BuildingFabricationUI: grid apply button removed', () => {
        const ui = new BuildingFabricationUI();
        const gridBtn = Array.from(ui.root.querySelectorAll('button'))
            .find((btn) => btn.textContent?.includes('Apply grid size'));
        assertFalse(!!gridBtn, 'Apply grid size button should be removed.');
    });

    test('BuildingFabricationUI: view mode is exclusive', () => {
        const ui = new BuildingFabricationUI();
        ui.setWireframeEnabled(true);
        assertTrue(ui.getWireframeEnabled(), 'Wireframe should be enabled.');
        assertFalse(ui.getFloorDivisionsEnabled(), 'Floors should be disabled.');
        assertFalse(ui.getFloorplanEnabled(), 'Floorplan should be disabled.');

        ui.setFloorDivisionsEnabled(true);
        assertFalse(ui.getWireframeEnabled(), 'Wireframe should be disabled.');
        assertTrue(ui.getFloorDivisionsEnabled(), 'Floors should be enabled.');
        assertFalse(ui.getFloorplanEnabled(), 'Floorplan should be disabled.');

        ui.setFloorplanEnabled(true);
        assertFalse(ui.getWireframeEnabled(), 'Wireframe should be disabled.');
        assertFalse(ui.getFloorDivisionsEnabled(), 'Floors should be disabled.');
        assertTrue(ui.getFloorplanEnabled(), 'Floorplan should be enabled.');
    });

    test('BuildingFabricationUI: max floors default is 30', () => {
        const ui = new BuildingFabricationUI();
        assertEqual(ui.floorNumber.max, '30', 'Floor max should be 30.');
        assertEqual(ui.floorRange.max, '30', 'Floor range max should be 30.');
    });

    test('BuildingFabricationUI: layer editor renders template layers', () => {
        const ui = new BuildingFabricationUI();
        ui.setSelectedBuilding(null);
        const list = ui.root.querySelector('.building-fab-layer-list');
        assertTrue(!!list, 'Layer list should exist.');
        assertTrue((list?.children?.length ?? 0) > 0, 'Layer list should render template layers.');
    });

    test('BuildingFabricationUI: material picker shows texture/color tabs', () => {
        const ui = new BuildingFabricationUI();
        const building = { id: 'building_test', layers: ui.getTemplateLayers() };
        ui.setSelectedBuilding(building);

        const label = Array.from(ui.root.querySelectorAll('.building-fab-row-label'))
            .find((el) => el.textContent?.trim() === 'Wall material');
        assertTrue(!!label, 'Wall material row should exist.');
        const row = label.closest('.building-fab-row') ?? null;
        assertTrue(!!row, 'Wall material row wrapper should exist.');
        const btn = row.querySelector('button.building-fab-material-button') ?? null;
        assertTrue(!!btn, 'Wall material button should exist.');

        btn.click();

        const tabs = document.querySelector('.ui-picker-tabs');
        assertTrue(!!tabs, 'Picker tabs element should exist.');
        assertFalse(tabs.classList.contains('hidden'), 'Picker tabs should be visible.');
        const tabBtns = tabs.querySelectorAll('button.ui-picker-tab');
        assertEqual(tabBtns.length, 2, 'Picker should show 2 tabs.');
        ui._pickerPopup?.close?.();
    });

    test('BuildingFabricationUI: windows fake depth controls toggle and disable sliders', () => {
        const ui = new BuildingFabricationUI();
        const building = { id: 'building_test', layers: ui.getTemplateLayers() };
        ui.setSelectedBuilding(building);

        const pbrNormalText = Array.from(ui.root.querySelectorAll('.building-fab-toggle span'))
            .find((el) => el.textContent?.trim() === 'Runtime normal map');
        assertTrue(!!pbrNormalText, 'Window PBR normal toggle should exist.');

        const toggleText = Array.from(ui.root.querySelectorAll('.building-fab-toggle span'))
            .find((el) => el.textContent?.trim() === 'Fake depth (parallax)');
        assertTrue(!!toggleText, 'Fake depth toggle should exist.');
        const toggleLabel = toggleText.closest('label') ?? null;
        const toggleInput = toggleLabel?.querySelector('input[type="checkbox"]') ?? null;
        assertTrue(!!toggleInput, 'Fake depth checkbox should exist.');

        const strengthLabel = Array.from(ui.root.querySelectorAll('.building-fab-row-label'))
            .find((el) => el.textContent?.trim() === 'Fake depth strength');
        assertTrue(!!strengthLabel, 'Fake depth strength row should exist.');
        const strengthRow = strengthLabel.closest('.building-fab-row') ?? null;
        const strengthRange = strengthRow?.querySelector('input[type="range"]') ?? null;
        assertTrue(!!strengthRange, 'Fake depth strength range should exist.');

        const insetLabel = Array.from(ui.root.querySelectorAll('.building-fab-row-label'))
            .find((el) => el.textContent?.trim() === 'Inset / recess');
        assertTrue(!!insetLabel, 'Inset / recess row should exist.');
        const insetRow = insetLabel.closest('.building-fab-row') ?? null;
        const insetRange = insetRow?.querySelector('input[type="range"]') ?? null;
        assertTrue(!!insetRange, 'Inset / recess range should exist.');

        assertFalse(toggleInput.checked, 'Fake depth should be off by default.');
        assertTrue(strengthRange.disabled, 'Strength slider should be disabled by default.');
        assertTrue(insetRange.disabled, 'Inset slider should be disabled by default.');

        toggleInput.checked = true;
        toggleInput.dispatchEvent(new Event('change'));

        assertFalse(strengthRange.disabled, 'Strength slider should enable when fake depth enabled.');
        assertFalse(insetRange.disabled, 'Inset slider should enable when fake depth enabled.');
    });

    test('BuildingFabricationUI: roof layer has no nested roof/ring sections', () => {
        const ui = new BuildingFabricationUI();
        ui.setSelectedBuilding(null);
        const roofTitle = Array.from(ui.root.querySelectorAll('.building-fab-details-title'))
            .find((el) => el.textContent?.trim() === 'Roof layer');
        assertTrue(!!roofTitle, 'Roof layer section should exist.');
        const roofDetails = roofTitle.closest('details') ?? null;
        assertTrue(!!roofDetails, 'Roof layer details wrapper should exist.');
        const nested = roofDetails.querySelectorAll('.building-fab-layer-subdetails');
        assertEqual(nested.length, 0, 'Roof layer should not render nested detail sections.');
    });

    test('BuildingFabricationUI: sections do not auto-collapse on refresh', () => {
        const ui = new BuildingFabricationUI();
        const building = { id: 'building_test', layers: ui.getTemplateLayers() };
        ui.setSelectedBuilding(building);

        const title = Array.from(ui.root.querySelectorAll('.building-fab-details-title'))
            .find((el) => el.textContent?.trim() === 'Floorplan');
        const details = title?.closest?.('details') ?? null;
        assertTrue(!!details, 'Floorplan section should exist.');
        details.open = true;
        details.dispatchEvent(new Event('toggle'));

        ui.setSelectedBuilding(building);

        const title2 = Array.from(ui.root.querySelectorAll('.building-fab-details-title'))
            .find((el) => el.textContent?.trim() === 'Floorplan');
        const details2 = title2?.closest?.('details') ?? null;
        assertTrue(!!details2, 'Floorplan section should exist after refresh.');
        assertTrue(details2.open, 'Floorplan section should remain open after refresh.');
    });

    test('BuildingFabricationUI: road mode shows done button', () => {
        const ui = new BuildingFabricationUI();
        ui.setRoadModeEnabled(true);
        assertFalse(ui.roadDoneBtn.classList.contains('hidden'), 'Done button should be visible in road mode.');
        assertTrue(ui.buildBtn.classList.contains('hidden'), 'Build button should be hidden in road mode.');
    });

    test('BuildingGenerator: offsetOrthogonalLoopXZ offsets collinear points', () => {
        const loop = [
            { x: 0, z: 0 },
            { x: 1, z: 0 },
            { x: 2, z: 0 },
            { x: 3, z: 0 },
            { x: 3, z: 1 },
            { x: 0, z: 1 }
        ];

        const out = offsetOrthogonalLoopXZ(loop, 0.2);
        assertTrue(Math.abs(out[1].z - 0.2) < 1e-6, 'Collinear point should shift with offset.');
        assertTrue(Math.abs(out[2].z - 0.2) < 1e-6, 'Collinear point should shift with offset.');
    });

    test('BuildingFabricationGenerator: floor above roof ignores ring height', () => {
        const tileSize = 10;
        const map = {
            tileSize,
            kind: new Uint8Array([0]),
            inBounds: (x, y) => x === 0 && y === 0,
            index: () => 0,
            tileToWorldCenter: () => ({ x: 0, z: 0 })
        };
        const generatorConfig = {
            road: {
                surfaceY: 0,
                curb: { height: 0, extraHeight: 0, thickness: 0 },
                sidewalk: { extraWidth: 0, lift: 0 }
            },
            ground: { surfaceY: 0 }
        };

        const lowerFloorHeight = 3.0;
        const ringHeight = 1.0;
        const layers = [
            createDefaultFloorLayer({ floors: 1, floorHeight: lowerFloorHeight, windows: { enabled: false } }),
            createDefaultRoofLayer({ ring: { enabled: true, height: ringHeight } }),
            createDefaultFloorLayer({ floors: 1, floorHeight: 2.5, windows: { enabled: false } })
        ];

        const parts = buildBuildingFabricationVisualParts({
            map,
            tiles: [[0, 0]],
            generatorConfig,
            tileSize,
            occupyRatio: 1.0,
            layers,
            overlays: { wire: false, floorplan: false, border: false, floorDivisions: false },
            walls: { inset: 0.0 }
        });
        assertTrue(!!parts, 'Expected visual parts.');

        const meshes = parts.solidMeshes ?? [];
        assertTrue(meshes.length >= 3, 'Expected floor, roof, floor meshes.');

        const floor1 = meshes[0];
        const floor2 = meshes[2];
        const expected = floor1.position.y + lowerFloorHeight;
        assertTrue(Math.abs(floor2.position.y - expected) < 1e-6, `Floor above roof should start at ${expected}, got ${floor2.position.y}.`);
    });

    test('BuildingFabricationGenerator: arched windows render with transparency', () => {
        const tileSize = 10;
        const map = {
            tileSize,
            kind: new Uint8Array([0]),
            inBounds: (x, y) => x === 0 && y === 0,
            index: () => 0,
            tileToWorldCenter: () => ({ x: 0, z: 0 })
        };
        const generatorConfig = {
            road: {
                surfaceY: 0,
                curb: { height: 0, extraHeight: 0, thickness: 0 },
                sidewalk: { extraWidth: 0, lift: 0 }
            },
            ground: { surfaceY: 0 }
        };

        const layers = [
            createDefaultFloorLayer({
                floors: 1,
                floorHeight: 3.0,
                windows: { enabled: true, typeId: WINDOW_TYPE.ARCH_V1 }
            }),
            createDefaultRoofLayer({ ring: { enabled: false } })
        ];

        const parts = buildBuildingFabricationVisualParts({
            map,
            tiles: [[0, 0]],
            generatorConfig,
            tileSize,
            occupyRatio: 1.0,
            layers,
            overlays: { wire: false, floorplan: false, border: false, floorDivisions: false },
            walls: { inset: 0.0 }
        });
        assertTrue(!!parts, 'Expected visual parts.');
        assertTrue(!!parts.windows, 'Expected windows group.');

        const meshes = parts.windows?.children?.filter?.((m) => m?.isMesh) ?? [];
        assertTrue(meshes.length > 0, 'Expected at least 1 window mesh.');

        const mat = meshes[0]?.material ?? null;
        assertTrue(!!mat, 'Expected a window material.');
        assertTrue(!!mat.transparent, 'Arched window material should be transparent.');
    });

    test('BuildingFabricationGenerator: fake-depth window shader declares roughnessFactor for roughness map', () => {
        const tileSize = 10;
        const map = {
            tileSize,
            kind: new Uint8Array([0]),
            inBounds: (x, y) => x === 0 && y === 0,
            index: () => 0,
            tileToWorldCenter: () => ({ x: 0, z: 0 })
        };
        const generatorConfig = {
            road: {
                surfaceY: 0,
                curb: { height: 0, extraHeight: 0, thickness: 0 },
                sidewalk: { extraWidth: 0, lift: 0 }
            },
            ground: { surfaceY: 0 }
        };

        const layers = [
            createDefaultFloorLayer({
                floors: 1,
                floorHeight: 3.0,
                windows: { enabled: true, fakeDepth: { enabled: true } }
            }),
            createDefaultRoofLayer({ ring: { enabled: false } })
        ];

        const parts = buildBuildingFabricationVisualParts({
            map,
            tiles: [[0, 0]],
            generatorConfig,
            tileSize,
            occupyRatio: 1.0,
            layers,
            overlays: { wire: false, floorplan: false, border: false, floorDivisions: false },
            walls: { inset: 0.0 }
        });
        assertTrue(!!parts, 'Expected visual parts.');
        assertTrue(!!parts.windows, 'Expected windows group.');

        const meshes = parts.windows?.children?.filter?.((m) => m?.isMesh) ?? [];
        assertTrue(meshes.length > 0, 'Expected at least 1 window mesh.');

        const mat = meshes[0]?.material ?? null;
        assertTrue(typeof mat?.onBeforeCompile === 'function', 'Expected fake-depth window material to patch shaders.');

        const shader = {
            uniforms: {},
            vertexShader: '#include <common>\nvoid main(){\n#include <begin_vertex>\n}\n',
            fragmentShader: '#include <common>\nvec4 diffuseColor = vec4( diffuse, opacity );\n#include <map_fragment>\n#include <normal_fragment_maps>\n#include <roughnessmap_fragment>\n#include <emissivemap_fragment>\n'
        };

        mat.onBeforeCompile(shader, null);
        assertTrue(shader.fragmentShader.includes('mvWinPerturbNormal2Arb'), 'Expected window normal mapping helper to be injected (avoids Three.js signature mismatches).');
        assertTrue(shader.fragmentShader.includes('float roughnessFactor = roughness'), 'Expected roughnessFactor to be declared for roughness map sampling.');
        assertTrue(shader.fragmentShader.includes('texture2D( roughnessMap, mvWinUv )'), 'Expected roughness map to sample parallax UVs.');
    });

    test('BuildingFabricationGenerator: belt extrusion can extend beyond footprint', () => {
        const tileSize = 10;
        const map = {
            tileSize,
            kind: new Uint8Array([0]),
            inBounds: (x, y) => x === 0 && y === 0,
            index: () => 0,
            tileToWorldCenter: () => ({ x: 0, z: 0 })
        };
        const generatorConfig = {
            road: {
                surfaceY: 0,
                curb: { height: 0, extraHeight: 0, thickness: 0 },
                sidewalk: { extraWidth: 0, lift: 0 }
            },
            ground: { surfaceY: 0 }
        };

        const extrusion = 0.3;
        const layers = [
            createDefaultFloorLayer({
                floors: 1,
                floorHeight: 3.0,
                belt: { enabled: true, height: 0.2, extrusion },
                windows: { enabled: false }
            }),
            createDefaultRoofLayer({ ring: { enabled: false } })
        ];

        const parts = buildBuildingFabricationVisualParts({
            map,
            tiles: [[0, 0]],
            generatorConfig,
            tileSize,
            occupyRatio: 1.0,
            layers,
            overlays: { wire: false, floorplan: false, border: false, floorDivisions: false },
            walls: { inset: 0.0 }
        });
        assertTrue(!!parts, 'Expected visual parts.');
        assertTrue(!!parts.beltCourse, 'Expected belt group.');

        const floorMesh = parts.solidMeshes?.find?.((m) => m?.isMesh) ?? null;
        const beltMesh = parts.beltCourse?.children?.find?.((m) => m?.isMesh) ?? null;
        assertTrue(!!floorMesh, 'Expected a floor mesh.');
        assertTrue(!!beltMesh, 'Expected a belt mesh.');

        const floorBox = new THREE.Box3().setFromObject(floorMesh);
        const beltBox = new THREE.Box3().setFromObject(beltMesh);
        const floorW = floorBox.max.x - floorBox.min.x;
        const floorD = floorBox.max.z - floorBox.min.z;
        const beltW = beltBox.max.x - beltBox.min.x;
        const beltD = beltBox.max.z - beltBox.min.z;

        assertTrue(beltW > floorW + extrusion * 1.5, 'Expected belt to extend outward in X.');
        assertTrue(beltD > floorD + extrusion * 1.5, 'Expected belt to extend outward in Z.');
    });

    test('BuildingFabricationGenerator: wall texture UVs are continuous across floors', () => {
        const tileSize = 10;
        const map = {
            tileSize,
            kind: new Uint8Array([0]),
            inBounds: (x, y) => x === 0 && y === 0,
            index: () => 0,
            tileToWorldCenter: () => ({ x: 0, z: 0 })
        };
        const generatorConfig = {
            road: {
                surfaceY: 0,
                curb: { height: 0, extraHeight: 0, thickness: 0 },
                sidewalk: { extraWidth: 0, lift: 0 }
            },
            ground: { surfaceY: 0 }
        };

        const floors = 2;
        const floorHeight = 3.0;
        const layers = [
            createDefaultFloorLayer({
                floors,
                floorHeight,
                belt: { enabled: false },
                windows: { enabled: false }
            }),
            createDefaultRoofLayer({ ring: { enabled: false } })
        ];

        const parts = buildBuildingFabricationVisualParts({
            map,
            tiles: [[0, 0]],
            generatorConfig,
            tileSize,
            occupyRatio: 1.0,
            layers,
            overlays: { wire: false, floorplan: false, border: false, floorDivisions: false },
            walls: { inset: 0.0 }
        });
        assertTrue(!!parts, 'Expected visual parts.');

        const wallMeshes = (parts.solidMeshes ?? []).filter((m) => (
            m?.isMesh && Array.isArray(m.material) && m.material.length === 2
        ));
        assertTrue(wallMeshes.length >= 1, 'Expected at least 1 wall mesh.');

        wallMeshes.sort((a, b) => (a.position.y - b.position.y));

        const collectMaterialVertexIndices = (geo, materialIndex) => {
            const groups = Array.isArray(geo?.groups) ? geo.groups : [];
            if (!groups.length) return null;
            const out = new Set();
            const index = geo.index ?? null;
            for (const g of groups) {
                if ((g?.materialIndex ?? 0) !== materialIndex) continue;
                const start = Math.max(0, Number(g?.start) || 0);
                const count = Math.max(0, Number(g?.count) || 0);
                if (!count) continue;
                if (index?.getX) {
                    for (let i = start; i < start + count; i++) out.add(index.getX(i));
                } else {
                    for (let i = start; i < start + count; i++) out.add(i);
                }
            }
            return out.size ? Array.from(out) : null;
        };

        const getUvYEdgeValues = (mesh) => {
            const geo = mesh?.geometry ?? null;
            const pos = geo?.getAttribute?.('position') ?? null;
            const uv = geo?.getAttribute?.('uv') ?? null;
            if (!pos?.getY || !uv?.getY) return null;
            const vis = collectMaterialVertexIndices(geo, 1);
            if (!vis?.length) return null;

            let minY = Infinity;
            let maxY = -Infinity;
            for (const vi of vis) {
                const y = pos.getY(vi);
                if (!Number.isFinite(y)) continue;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
            if (!(minY < Infinity) || !(maxY > -Infinity)) return null;

            const epsY = 1e-5;
            let sumBottom = 0;
            let sumTop = 0;
            let nBottom = 0;
            let nTop = 0;
            for (const vi of vis) {
                const y = pos.getY(vi);
                const v = uv.getY(vi);
                if (!Number.isFinite(y) || !Number.isFinite(v)) continue;
                if (Math.abs(y - minY) < epsY) {
                    sumBottom += v;
                    nBottom += 1;
                }
                if (Math.abs(y - maxY) < epsY) {
                    sumTop += v;
                    nTop += 1;
                }
            }
            if (!nBottom || !nTop) return null;
            return { bottom: sumBottom / nBottom, top: sumTop / nTop };
        };

        if (wallMeshes.length < 2) {
            const single = wallMeshes[0] ?? null;
            const uv = getUvYEdgeValues(single);
            assertTrue(!!uv, 'Expected UV edge values.');
            assertNear(Math.abs(uv.top - uv.bottom), floors * floorHeight, 1e-3, 'Expected wall UV span to match wall height.');
            return;
        }

        const lower = wallMeshes[0];
        const upper = wallMeshes[1];

        const lowerUv = getUvYEdgeValues(lower);
        const upperUv = getUvYEdgeValues(upper);
        assertTrue(!!lowerUv && !!upperUv, 'Expected UV edge values.');
        assertNear(lowerUv.top, upperUv.bottom, 1e-3, 'Expected wall UVs to be continuous across floors.');
    });

    test('BuildingFabricationGenerator: space columns are continuous across belted floors', () => {
        const tileSize = 10;
        const map = {
            tileSize,
            kind: new Uint8Array([0]),
            inBounds: (x, y) => x === 0 && y === 0,
            index: () => 0,
            tileToWorldCenter: () => ({ x: 0, z: 0 })
        };
        const generatorConfig = {
            road: {
                surfaceY: 0,
                curb: { height: 0, extraHeight: 0, thickness: 0 },
                sidewalk: { extraWidth: 0, lift: 0 }
            },
            ground: { surfaceY: 0 }
        };

        const floors = 3;
        const floorHeight = 3.0;
        const beltHeight = 0.2;
        const colsExtrudeDistance = 0.2;
        const layers = [
            createDefaultFloorLayer({
                floors,
                floorHeight,
                belt: { enabled: true, height: beltHeight, extrusion: 0.0 },
                windows: {
                    enabled: true,
                    width: 1.0,
                    height: 1.2,
                    sillHeight: 0.8,
                    spacing: 0.0,
                    spaceColumns: { enabled: true, every: 2, width: 1.0, extrude: true, extrudeDistance: colsExtrudeDistance }
                }
            }),
            createDefaultRoofLayer({ ring: { enabled: false } })
        ];

        const parts = buildBuildingFabricationVisualParts({
            map,
            tiles: [[0, 0]],
            generatorConfig,
            tileSize,
            occupyRatio: 1.0,
            layers,
            overlays: { wire: false, floorplan: false, border: false, floorDivisions: false },
            walls: { inset: 0.0 }
        });
        assertTrue(!!parts, 'Expected visual parts.');
        assertTrue(!!parts.windows, 'Expected windows group.');

        const meshes = parts.windows?.children?.filter?.((m) => m?.isMesh) ?? [];
        const columns = meshes.filter((m) => m?.geometry?.type === 'BoxGeometry');
        assertTrue(columns.length > 0, 'Expected at least 1 space column mesh.');

        const seen = new Map();
        for (const col of columns) {
            const px = Math.round((col.position?.x ?? 0) * 1000);
            const pz = Math.round((col.position?.z ?? 0) * 1000);
            const key = `${px},${pz}`;
            seen.set(key, (seen.get(key) ?? 0) + 1);
        }

        let maxDup = 0;
        for (const count of seen.values()) maxDup = Math.max(maxDup, count);
        assertEqual(maxDup, 1, 'Expected a single continuous column per spacer position (not split per floor).');

        const expectedHeight = floors * (floorHeight + beltHeight);
        for (const col of columns) {
            const h = col.geometry?.parameters?.height ?? null;
            assertTrue(Number.isFinite(h), 'Expected a BoxGeometry height.');
            assertTrue(Math.abs(h - expectedHeight) < 1e-6, `Column height should span full layer (${expectedHeight}).`);
        }
    });

    test('BuildingFabricationScene: trims building tiles when road overlaps', () => {
        const engine = {
            scene: new THREE.Scene(),
            camera: new THREE.PerspectiveCamera(),
            canvas: document.createElement('canvas')
        };
        const scene = new BuildingFabricationScene(engine);

        const a = '0,0';
        const b = '1,0';
        const c = '0,1';
        scene._tileById.set(a, { x: 0, y: 0 });
        scene._tileById.set(b, { x: 1, y: 0 });
        scene._tileById.set(c, { x: 0, y: 1 });

        const building = { id: 'building_test', tiles: new Set([a, b, c]), floors: 1, floorHeight: 3.2 };
        scene._buildingsByTile.set(a, building);
        scene._buildingsByTile.set(b, building);
        scene._buildingsByTile.set(c, building);

        scene._trimBuildingTilesForRoad(building, new Set([b]));
        assertFalse(building.tiles.has(b), 'Building should drop road tile.');
        assertFalse(scene._buildingsByTile.has(b), 'Road tile should no longer map to building.');
        assertTrue(scene._buildingsByTile.get(a) === building, 'Remaining tile should map to building.');
        assertTrue(scene._buildingsByTile.get(c) === building, 'Remaining tile should map to building.');
    });

    test('BuildingFabricationScene: shrinks footprint next to roads', () => {
        const engine = {
            scene: new THREE.Scene(),
            camera: new THREE.PerspectiveCamera(),
            canvas: document.createElement('canvas')
        };
        const scene = new BuildingFabricationScene(engine);
        const { baseMargin, roadMargin } = scene._buildingFootprintMargins();
        assertTrue(roadMargin > baseMargin, 'Road margin should be larger than base margin.');
    });

    test('BuildingFabricationScene: highest index 3x2 footprint is deterministic', () => {
        const tiles = getHighestIndex3x2FootprintTileIds(5);
        assertEqual(tiles.length, 6, 'Expected 3x2 footprint tile count.');
        assertEqual(tiles.join('|'), '2,3|3,3|4,3|2,4|3,4|4,4', 'Expected top-right 3x2 footprint.');

        const small = getHighestIndex3x2FootprintTileIds(2);
        assertEqual(small.length, 0, 'Expected empty footprint for small grids.');
    });

    // ========== City Building Config Tests ==========
    const { CityMap } = await import('/src/app/city/CityMap.js');
    const { getBuildingConfigById, getBuildingConfigs } = await import('/src/app/city/buildings/index.js');
    const { createDemoCitySpec } = await import('/src/app/city/specs/DemoCitySpec.js');
    const { BIG_CITY_SPEC, createBigCitySpec } = await import('/src/app/city/specs/BigCitySpec.js');
    const { getGameplayCityOptions } = await import('/src/states/GameplayState.js');
    const { createCityBuildingConfigFromFabrication, serializeCityBuildingConfigToEsModule } = await import('/src/app/city/buildings/BuildingConfigExport.js');
    const { BUILDING_STYLE } = await import('/src/app/buildings/BuildingStyle.js');
    const { BELT_COURSE_COLOR } = await import('/src/app/buildings/BeltCourseColor.js');
    const { ROOF_COLOR, resolveRoofColorHex } = await import('/src/app/buildings/RoofColor.js');

    test('BuildingCatalog: includes new tower configs', () => {
        const blue = getBuildingConfigById('blue_belt_tower');
        assertTrue(!!blue, 'Expected blue_belt_tower in catalog.');
        assertEqual(blue.id, 'blue_belt_tower');
        assertEqual(blue.name, 'Blue belt tower');
        assertTrue(Array.isArray(blue.layers) && blue.layers.length >= 1, 'Expected layers on blue tower config.');

        const stone = getBuildingConfigById('stone_setback_tower');
        assertTrue(!!stone, 'Expected stone_setback_tower in catalog.');
        assertEqual(stone.id, 'stone_setback_tower');
        assertEqual(stone.name, 'Stone setback tower');
        assertTrue(Array.isArray(stone.layers) && stone.layers.length >= 1, 'Expected layers on stone tower config.');
        assertEqual(
            stone.layers?.[0]?.material?.id,
            'pbr.patterned_concrete_wall',
            'Expected Stone setback tower main wall material to use patterned concrete PBR.'
        );
        assertEqual(
            stone.layers?.[0]?.windows?.spaceColumns?.material?.id,
            'pbr.patterned_concrete_wall',
            'Expected Stone setback tower spacer columns to use patterned concrete PBR.'
        );
        assertEqual(
            stone.layers?.[2]?.material?.id,
            'pbr.patterned_concrete_wall',
            'Expected Stone setback tower setback wall material to use patterned concrete PBR.'
        );
        assertEqual(
            stone.layers?.[3]?.ring?.material?.id,
            'pbr.patterned_concrete_wall',
            'Expected Stone setback tower roof ring material to use patterned concrete PBR.'
        );

        const all = getBuildingConfigs();
        assertTrue(Array.isArray(all) && all.length >= 4, 'Expected at least 4 building configs.');
    });

    test('BuildingCatalog: includes gov_center config', () => {
        const gov = getBuildingConfigById('gov_center');
        assertTrue(!!gov, 'Expected gov_center in catalog.');
        assertEqual(gov.id, 'gov_center');
        assertEqual(gov.name, 'Gov center');
        assertEqual(
            gov.layers?.[0]?.material?.id,
            'pbr.plaster_brick_pattern',
            'Expected Gov center main wall material to use plaster brick pattern PBR.'
        );
        assertEqual(
            gov.layers?.[3]?.material?.id,
            'pbr.plaster_brick_pattern',
            'Expected Gov center upper wall material to use plaster brick pattern PBR.'
        );

        const all = getBuildingConfigs();
        assertTrue(all.includes(gov), 'Expected catalog list to include Gov center config.');
    });

    test('BuildingCatalog: does not rely on placeholder building_3/building_4 ids', () => {
        assertEqual(getBuildingConfigById('building_3'), null, 'Expected building_3 placeholder id to be absent.');
        assertEqual(getBuildingConfigById('building_4'), null, 'Expected building_4 placeholder id to be absent.');
    });

    test('BuildingCatalog: shipped configs are layer-based', () => {
        const all = getBuildingConfigs();
        assertTrue(Array.isArray(all) && all.length > 0, 'Expected building configs list.');
        for (const cfg of all) {
            assertTrue(Array.isArray(cfg?.layers) && cfg.layers.length > 0, `Expected layers on config ${cfg?.id ?? '(missing id)'}.`);
        }
    });

    test('BuildingCatalog: windows enable fake depth by default', () => {
        const all = getBuildingConfigs();
        for (const cfg of all) {
            for (const layer of cfg?.layers ?? []) {
                const win = layer?.windows ?? null;
                if (!win?.enabled) continue;
                assertTrue(!!win.fakeDepth, `Expected windows.fakeDepth on ${cfg?.id ?? '(missing id)'}:${layer?.id ?? '(missing layer id)'}.`);
                assertTrue(!!win.fakeDepth.enabled, `Expected windows.fakeDepth.enabled on ${cfg?.id ?? '(missing id)'}:${layer?.id ?? '(missing layer id)'}.`);
                assertEqual(win.fakeDepth.strength, 0.06, `Expected windows.fakeDepth.strength default on ${cfg?.id ?? '(missing id)'}:${layer?.id ?? '(missing layer id)'}.`);
                assertEqual(win.fakeDepth.insetStrength, 0.25, `Expected windows.fakeDepth.insetStrength default on ${cfg?.id ?? '(missing id)'}:${layer?.id ?? '(missing layer id)'}.`);
            }
        }
    });

    test('BuildingCatalog: converted configs preserve legacy fields', () => {
        const brick = getBuildingConfigById('brick_midrise');
        assertTrue(!!brick, 'Expected brick_midrise in catalog.');
        assertEqual(brick.floors, 5);
        assertEqual(brick.floorHeight, 3);
        assertEqual(brick.style, BUILDING_STYLE.BRICK);
        assertEqual(brick.windows.width, 2.2);
        assertEqual(brick.windows.gap, 1.6);
        assertEqual(brick.windows.height, 1.4);
        assertEqual(brick.windows.y, 1.0);
        assertEqual(brick.layers?.[0]?.material?.id, 'pbr.red_brick', 'Expected Brick midrise wall material to use PBR red brick.');

        const stone = getBuildingConfigById('stone_lowrise');
        assertTrue(!!stone, 'Expected stone_lowrise in catalog.');
        assertEqual(stone.floors, 4);
        assertEqual(stone.floorHeight, 3);
        assertEqual(stone.style, BUILDING_STYLE.STONE_1);
        assertEqual(stone.windows.width, 1.8);
        assertEqual(stone.windows.gap, 1.4);
        assertEqual(stone.windows.height, 1.2);
        assertEqual(stone.windows.y, 0.9);
        assertEqual(stone.layers?.[0]?.material?.id, 'pbr.painted_plaster_wall', 'Expected Stone lowrise wall material to use PBR painted plaster wall.');
    });

    test('BigCitySpec: module is importable', () => {
        assertTrue(typeof createBigCitySpec === 'function', 'Expected createBigCitySpec export.');
        assertTrue(!!BIG_CITY_SPEC && typeof BIG_CITY_SPEC === 'object', 'Expected BIG_CITY_SPEC export.');
        assertTrue(Array.isArray(BIG_CITY_SPEC.roads) && BIG_CITY_SPEC.roads.length > 0, 'Expected roads list.');
        assertTrue(Array.isArray(BIG_CITY_SPEC.buildings) && BIG_CITY_SPEC.buildings.length > 0, 'Expected buildings list.');
    });

    test('BigCitySpec: compatible with CityMap.fromSpec', () => {
        const cfg = createCityConfig({ size: 600, mapTileSize: 24, seed: 'bigcity-spec-test' });
        const spec = createBigCitySpec(cfg);
        const map = CityMap.fromSpec(spec, cfg);
        assertEqual(map.width, spec.width, 'Expected map width from spec.');
        assertEqual(map.height, spec.height, 'Expected map height from spec.');
        assertEqual(map.tileSize, spec.tileSize, 'Expected map tileSize from spec.');
        assertEqual(map.roadSegments.length, spec.roads.length, 'Expected roadSegments count to match spec.');
        assertTrue(Array.isArray(map.buildings) && map.buildings.length > 0, 'Expected buildings generated from spec.');
    });

    test('GameplayState: uses Big City spec by default', () => {
        assertTrue(typeof getGameplayCityOptions === 'function', 'Expected getGameplayCityOptions export.');
        const options = getGameplayCityOptions();
        assertTrue(!!options && typeof options === 'object', 'Expected gameplay city options.');
        assertTrue(options.mapSpec === BIG_CITY_SPEC, 'Expected gameplay mapSpec to be Big City spec.');
        assertEqual(options.mapTileSize, BIG_CITY_SPEC.tileSize, 'Expected gameplay mapTileSize from spec.');
        assertEqual(options.size, BIG_CITY_SPEC.tileSize * BIG_CITY_SPEC.width, 'Expected gameplay size to match spec.');
    });

    test('DemoCitySpec: extracted demo spec module is importable', () => {
        assertTrue(typeof createDemoCitySpec === 'function', 'Expected createDemoCitySpec export.');
        const cfg = createCityConfig({ size: 96, mapTileSize: 24, seed: 'demo-spec-test' });
        const spec = createDemoCitySpec(cfg);
        assertTrue(!!spec && typeof spec === 'object', 'Expected demo spec object.');
        assertEqual(spec.seed, 'demo-spec-test', 'Expected demo spec seed from config.');
        assertTrue(Array.isArray(spec.roads), 'Expected roads array.');
        assertTrue(Array.isArray(spec.buildings), 'Expected buildings array.');
    });

    test('CityMap: demoSpec still works via extracted module', () => {
        const cfg = createCityConfig({ size: 96, mapTileSize: 24, seed: 'demo-spec-test-2' });
        const spec = CityMap.demoSpec(cfg);
        assertTrue(!!spec && typeof spec === 'object', 'Expected demo spec object.');
        assertEqual(spec.seed, 'demo-spec-test-2', 'Expected demo spec seed from config.');
        assertTrue(Array.isArray(spec.roads), 'Expected roads array.');
        assertTrue(Array.isArray(spec.buildings), 'Expected buildings array.');
    });

    test('CityMap: exportSpec produces reloadable spec shape with road tags', () => {
        const cfg = createCityConfig({ size: 96, mapTileSize: 24, seed: 'spec-export' });
        const tileSize = cfg.map.tileSize;
        const origin = { x: -4 * tileSize * 0.5 + tileSize * 0.5, z: -3 * tileSize * 0.5 + tileSize * 0.5 };
        const specIn = {
            version: 1,
            seed: 'spec-seed',
            width: 4,
            height: 3,
            tileSize,
            origin,
            roads: [{ a: [0, 0], b: [0, 2], lanesF: 2, lanesB: 1, tag: 'arterial' }],
            buildings: [{ id: 'building_1', configId: 'brick_midrise', tiles: [[2, 1]] }]
        };

        const map = CityMap.fromSpec(specIn, cfg);
        const out = map.exportSpec({ seed: specIn.seed, version: specIn.version });
        assertEqual(out.version, 1);
        assertEqual(out.seed, 'spec-seed');
        assertEqual(out.width, 4);
        assertEqual(out.height, 3);
        assertEqual(out.tileSize, tileSize);
        assertEqual(out.origin.x, origin.x);
        assertEqual(out.origin.z, origin.z);
        assertTrue(Array.isArray(out.roads) && out.roads.length === 1, 'Expected one road in export.');
        assertEqual(out.roads[0].tag, 'arterial', 'Expected road tag to round-trip.');
        assertTrue(Array.isArray(out.buildings) && out.buildings.length === 1, 'Expected one building in export.');
        assertEqual(out.buildings[0].configId, 'brick_midrise', 'Expected building configId in export.');
    });

    // ========== Traffic Control Placement Tests ==========
    const { classifyIntersectionTrafficControl, computeTrafficControlPlacements, TRAFFIC_CONTROL } = await import('/src/app/city/TrafficControlPlacement.js');

    test('TrafficControlPlacement: classifies 2x2+ lane intersections as traffic lights', () => {
        const kind = classifyIntersectionTrafficControl({ n: 2, e: 2, s: 2, w: 2 }, 2);
        assertEqual(kind, TRAFFIC_CONTROL.TRAFFIC_LIGHT);
    });

    test('TrafficControlPlacement: classifies smaller intersections as stop signs', () => {
        const kind = classifyIntersectionTrafficControl({ n: 1, e: 2, s: 1, w: 2 }, 2);
        assertEqual(kind, TRAFFIC_CONTROL.STOP_SIGN);
    });

    test('TrafficControlPlacement: deterministic traffic light placements for fixed spec', () => {
        const cfg = createCityConfig({ size: 120, mapTileSize: 24, seed: 'traffic-control-determinism' });
        const w = cfg.map.width;
        const h = cfg.map.height;
        const spec = {
            version: 1,
            seed: cfg.seed,
            width: w,
            height: h,
            tileSize: cfg.map.tileSize,
            origin: cfg.map.origin,
            roads: [
                { a: [0, 2], b: [w - 1, 2], lanesF: 2, lanesB: 2, tag: 'road' },
                { a: [2, 0], b: [2, h - 1], lanesF: 2, lanesB: 2, tag: 'road' }
            ],
            buildings: []
        };
        const map = CityMap.fromSpec(spec, cfg);
        const gen = createGeneratorConfig();

        const a = computeTrafficControlPlacements({ map, generatorConfig: gen, laneThreshold: 2 });
        const b = computeTrafficControlPlacements({ map, generatorConfig: gen, laneThreshold: 2 });

        assertEqual(JSON.stringify(a), JSON.stringify(b), 'Placements should be deterministic.');
        assertEqual(a.length, 2, 'Expected two traffic lights.');
        assertTrue(a.every((p) => p.kind === TRAFFIC_CONTROL.TRAFFIC_LIGHT), 'Expected traffic light placements.');

        const laneWidth = gen?.road?.laneWidth ?? 4.8;
        const epsLane = 1e-6;
        for (const p of a) {
            assertTrue(Number.isFinite(p.scale) && p.scale > 0, 'Traffic light placement should include a positive scale.');
            assertTrue(Number.isFinite(p.armLength) && p.armLength > 0, 'Traffic light placement should include a positive armLength.');
            assertNear(p.armLength * p.scale, laneWidth, epsLane, 'Traffic light arm reach should match 1 lane width.');
        }

        const tileSize = map.tileSize;
        const minX = map.origin.x - tileSize * 0.5;
        const minZ = map.origin.z - tileSize * 0.5;
        const maxX = map.origin.x + (map.width - 1) * tileSize + tileSize * 0.5;
        const maxZ = map.origin.z + (map.height - 1) * tileSize + tileSize * 0.5;
        for (const p of a) {
            assertTrue(p.position.x >= minX && p.position.x <= maxX, 'Placement x should be within bounds.');
            assertTrue(p.position.z >= minZ && p.position.z <= maxZ, 'Placement z should be within bounds.');
        }
    });

    test('TrafficControlPlacement: stop sign intersections place stop signs within bounds', () => {
        const cfg = createCityConfig({ size: 120, mapTileSize: 24, seed: 'traffic-control-stops' });
        const w = cfg.map.width;
        const h = cfg.map.height;
        const spec = {
            version: 1,
            seed: cfg.seed,
            width: w,
            height: h,
            tileSize: cfg.map.tileSize,
            origin: cfg.map.origin,
            roads: [
                { a: [0, 2], b: [w - 1, 2], lanesF: 1, lanesB: 1, tag: 'road' },
                { a: [2, 0], b: [2, h - 1], lanesF: 1, lanesB: 1, tag: 'road' }
            ],
            buildings: []
        };
        const map = CityMap.fromSpec(spec, cfg);
        const gen = createGeneratorConfig();

        const placements = computeTrafficControlPlacements({ map, generatorConfig: gen, laneThreshold: 2 });
        assertEqual(placements.length, 4, 'Expected four stop signs on a 4-way stop.');
        assertTrue(placements.every((p) => p.kind === TRAFFIC_CONTROL.STOP_SIGN), 'Expected stop sign placements.');

        const tileSize = map.tileSize;
        const minX = map.origin.x - tileSize * 0.5;
        const minZ = map.origin.z - tileSize * 0.5;
        const maxX = map.origin.x + (map.width - 1) * tileSize + tileSize * 0.5;
        const maxZ = map.origin.z + (map.height - 1) * tileSize + tileSize * 0.5;
        for (const p of placements) {
            assertTrue(p.position.x >= minX && p.position.x <= maxX, 'Placement x should be within bounds.');
            assertTrue(p.position.z >= minZ && p.position.z <= maxZ, 'Placement z should be within bounds.');
        }
    });

    test('BuildingConfigExport: exports building fabrication layers for city', () => {
        const layers = [
            createDefaultFloorLayer({ floors: 3, floorHeight: 3.0 }),
            createDefaultRoofLayer()
        ];
        const cfg = createCityBuildingConfigFromFabrication({
            id: 'export_test_building',
            name: 'Export test building',
            layers,
            wallInset: 0.25
        });

        assertEqual(cfg.id, 'export_test_building');
        assertEqual(cfg.name, 'Export test building');
        assertTrue(Array.isArray(cfg.layers) && cfg.layers.length === 2, 'Expected normalized layers.');
        assertTrue(Number.isFinite(cfg.floors) && cfg.floors >= 1, 'Expected legacy floors.');
        assertTrue(Number.isFinite(cfg.floorHeight) && cfg.floorHeight > 0, 'Expected legacy floorHeight.');
        assertTrue(typeof cfg.style === 'string' && cfg.style.length > 0, 'Expected legacy style.');

        const source = serializeCityBuildingConfigToEsModule(cfg);
        assertTrue(source.includes('export_test_building'), 'Expected module to include id.');
        assertTrue(source.includes('layers: Object.freeze'), 'Expected module to include layers.');
        assertTrue(source.includes('export default'), 'Expected module to export default.');
    });

    test('BuildingConfigExport: preserves belt extrusion in exported layers', () => {
        const layers = [
            createDefaultFloorLayer({
                floors: 2,
                floorHeight: 3.0,
                belt: { enabled: true, height: 0.2, extrusion: 0.35 }
            }),
            createDefaultRoofLayer()
        ];
        const cfg = createCityBuildingConfigFromFabrication({
            id: 'export_belt_extrusion',
            name: 'Export belt extrusion',
            layers
        });

        const belt = cfg.layers?.[0]?.belt ?? null;
        assertTrue(!!belt && typeof belt === 'object', 'Expected belt spec.');
        assertTrue(Number.isFinite(belt.extrusion), 'Expected belt extrusion to be numeric.');
        assertTrue(Math.abs(belt.extrusion - 0.35) < 1e-6, 'Belt extrusion should be preserved.');

        const source = serializeCityBuildingConfigToEsModule(cfg);
        assertTrue(source.includes('"extrusion"'), 'Expected serialized module to include belt extrusion.');
        const match = source.match(/"extrusion"\s*:\s*([0-9eE+.-]+)/);
        assertTrue(!!match, 'Expected serialized belt extrusion field.');
        const serialized = Number(match[1]);
        assertTrue(Number.isFinite(serialized), 'Expected serialized belt extrusion value to be numeric.');
        assertTrue(Math.abs(serialized - 0.35) < 1e-6, 'Expected serialized belt extrusion value.');
    });

    test('CityMap: preserves layer-based building configs', () => {
        const cfg = createCityConfig({ size: 96, mapTileSize: 24, seed: 'test-layer-config' });
        const layers = [
            createDefaultFloorLayer({ floors: 2, floorHeight: 3.0 }),
            createDefaultRoofLayer()
        ];
        const map = CityMap.fromSpec({
            roads: [],
            buildings: [{
                id: 'layer_building_1',
                tiles: [[0, 0]],
                layers
            }]
        }, cfg);

        assertEqual(map.buildings.length, 1, 'Expected one building.');
        assertEqual(map.buildings[0].id, 'layer_building_1');
        assertTrue(Array.isArray(map.buildings[0].layers) && map.buildings[0].layers.length === 2, 'Expected layers on map building entry.');
    });

    test('CityMap: builds empty building list when missing', () => {
        const cfg = createCityConfig({ size: 96, mapTileSize: 24, seed: 'test' });
        const map = CityMap.fromSpec({ roads: [] }, cfg);
        assertTrue(Array.isArray(map.buildings), 'buildings should be an array.');
        assertEqual(map.buildings.length, 0, 'buildings should default to empty.');
    });

    test('CityMap: truncates footprint after first non-adjacent tile', () => {
        const cfg = createCityConfig({ size: 96, mapTileSize: 24, seed: 'test' });
        const map = CityMap.fromSpec({
            width: cfg.map.width,
            height: cfg.map.height,
            tileSize: cfg.map.tileSize,
            origin: cfg.map.origin,
            roads: [],
            buildings: [{
                tiles: [[0, 0], [1, 0], [3, 3], [1, 1]],
                floorHeight: 3,
                floors: 5,
                style: BUILDING_STYLE.BRICK,
                windows: { width: 2.2, gap: 1.6, height: 1.4, y: 1.0 }
            }]
        }, cfg);

        assertEqual(map.buildings.length, 1, 'Should keep one valid building.');
        assertEqual(map.buildings[0].tiles.length, 2, 'Should keep tiles up to first invalid adjacency.');
        assertEqual(map.buildings[0].tiles[0][0], 0);
        assertEqual(map.buildings[0].tiles[0][1], 0);
        assertEqual(map.buildings[0].tiles[1][0], 1);
        assertEqual(map.buildings[0].tiles[1][1], 0);
        assertEqual(map.buildings[0].style, BUILDING_STYLE.BRICK);
        assertEqual(map.buildings[0].windows.width, 2.2);
        assertEqual(map.buildings[0].windows.gap, 1.6);
        assertEqual(map.buildings[0].windows.height, 1.4);
        assertEqual(map.buildings[0].windows.y, 1.0);
    });

    test('CityMap: ignores duplicate tiles without aborting', () => {
        const cfg = createCityConfig({ size: 96, mapTileSize: 24, seed: 'test' });
        const map = CityMap.fromSpec({
            width: cfg.map.width,
            height: cfg.map.height,
            tileSize: cfg.map.tileSize,
            origin: cfg.map.origin,
            roads: [],
            buildings: [{
                tiles: [[0, 0], [0, 0], [1, 0]],
                floorHeight: 3,
                floors: 2
            }]
        }, cfg);

        assertEqual(map.buildings.length, 1);
        assertEqual(map.buildings[0].tiles.length, 2);
        assertEqual(map.buildings[0].tiles[0][0], 0);
        assertEqual(map.buildings[0].tiles[1][0], 1);
    });

    const { computeEvenWindowLayout, computeBuildingLoopsFromTiles, buildBuildingVisualParts, getWindowStyleOptions } = await import('/src/graphics/assets3d/generators/buildings/BuildingGenerator.js');
    const { createTreeField } = await import('/src/graphics/assets3d/generators/TreeGenerator.js');
    const { CityRNG } = await import('/src/app/city/CityRNG.js');
    const {
        INSPECTOR_COLLECTION,
        INSPECTOR_TEXTURE,
        getTextureInspectorCollections,
        getTextureInspectorOptions,
        getTextureInspectorOptionsForCollection,
        getTextureInspectorTextureById
    } = await import('/src/graphics/assets3d/textures/TextureInspectorCatalog.js');
    const { getSignAssetById, getSignAssets } = await import('/src/graphics/assets3d/textures/signs/SignAssets.js');

    test('BuildingGenerator: window layout keeps a corner gap', () => {
        const length = 20;
        const windowWidth = 2;
        const { count, starts } = computeEvenWindowLayout({
            length,
            windowWidth,
            desiredGap: 1.5,
            cornerEps: 0.1
        });
        assertTrue(count > 0, 'Should fit at least one window.');
        assertTrue(starts[0] > 0.09, 'Start gap should be > corner eps.');
        const lastEnd = starts[count - 1] + windowWidth;
        assertTrue(lastEnd < length - 0.09, 'Last window should not touch the corner.');
    });

    test('BuildingGenerator: window layout distributes evenly', () => {
        const length = 18;
        const windowWidth = 2;
        const { count, starts } = computeEvenWindowLayout({
            length,
            windowWidth,
            desiredGap: 1.2,
            cornerEps: 0.05
        });
        assertTrue(count >= 2, 'Should fit multiple windows.');
        const gap = starts[0];
        for (let i = 1; i < count; i++) {
            const prev = starts[i - 1];
            const next = starts[i];
            assertTrue(Math.abs((next - prev) - (windowWidth + gap)) < 1e-6, 'Windows should be evenly spaced.');
        }
    });

    test('BuildingGenerator: window style options provide previews', () => {
        const opts = getWindowStyleOptions();
        assertTrue(Array.isArray(opts) && opts.length >= 3, 'Should expose multiple window styles.');
        const hasPreview = opts.some((opt) => typeof opt?.previewUrl === 'string' && opt.previewUrl.startsWith('data:image/'));
        assertTrue(hasPreview, 'Should include at least one preview URL.');
    });

    test('WindowTextureGenerator: registers Light Blue and Green types with caching', () => {
        const opts = getWindowTypeOptions();
        assertTrue(Array.isArray(opts) && opts.length > 0, 'Expected window type options.');

        const ids = new Set(opts.map((opt) => opt.id));
        assertTrue(ids.has(WINDOW_TYPE.STYLE_LIGHT_BLUE), 'Expected Light Blue window type.');
        assertTrue(ids.has(WINDOW_TYPE.STYLE_GREEN), 'Expected Green window type.');

        const lightBlueOpt = opts.find((opt) => opt.id === WINDOW_TYPE.STYLE_LIGHT_BLUE) ?? null;
        const greenOpt = opts.find((opt) => opt.id === WINDOW_TYPE.STYLE_GREEN) ?? null;
        assertTrue(typeof lightBlueOpt?.previewUrl === 'string' && lightBlueOpt.previewUrl.startsWith('data:image/'), 'Expected Light Blue preview.');
        assertTrue(typeof greenOpt?.previewUrl === 'string' && greenOpt.previewUrl.startsWith('data:image/'), 'Expected Green preview.');

        const t0 = getWindowTexture({ typeId: WINDOW_TYPE.STYLE_LIGHT_BLUE });
        const t1 = getWindowTexture({ typeId: WINDOW_TYPE.STYLE_LIGHT_BLUE });
        assertTrue(t0 === t1, 'Expected Light Blue window textures to be cached.');

        const g0 = getWindowTexture({ typeId: WINDOW_TYPE.STYLE_GREEN });
        const g1 = getWindowTexture({ typeId: WINDOW_TYPE.STYLE_GREEN });
        assertTrue(g0 === g1, 'Expected Green window textures to be cached.');
    });

    test('WindowTextureGenerator: provides runtime normal/roughness maps with caching', () => {
        const border = { enabled: true, thickness: 0.018, strength: 0.35 };
        const n0 = getWindowNormalMapTexture({ typeId: WINDOW_TYPE.STYLE_LIGHT_BLUE, border });
        const n1 = getWindowNormalMapTexture({ typeId: WINDOW_TYPE.STYLE_LIGHT_BLUE, border });
        assertTrue(n0 === n1, 'Expected window normal maps to be cached.');
        if ('colorSpace' in n0) assertEqual(n0.colorSpace, THREE.NoColorSpace, 'Expected window normal map to be linear.');
        else assertEqual(n0.encoding, THREE.LinearEncoding, 'Expected window normal map to be linear.');

        const r0 = getWindowRoughnessMapTexture({ typeId: WINDOW_TYPE.STYLE_LIGHT_BLUE, roughness: { contrast: 1.0 } });
        const r1 = getWindowRoughnessMapTexture({ typeId: WINDOW_TYPE.STYLE_LIGHT_BLUE, roughness: { contrast: 1.0 } });
        assertTrue(r0 === r1, 'Expected window roughness maps to be cached.');
        if ('colorSpace' in r0) assertEqual(r0.colorSpace, THREE.NoColorSpace, 'Expected window roughness map to be linear.');
        else assertEqual(r0.encoding, THREE.LinearEncoding, 'Expected window roughness map to be linear.');

        const n2 = getWindowNormalMapTexture({ typeId: WINDOW_TYPE.STYLE_LIGHT_BLUE, border: { ...border, thickness: 0.02 } });
        assertFalse(n0 === n2, 'Expected window normal map to vary by border parameters.');
    });

    test('TextureInspectorCatalog: includes Light Blue and Green window entries', () => {
        const opts = getTextureInspectorOptions();
        const ids = new Set(opts.map((opt) => opt.id));
        assertTrue(ids.has(INSPECTOR_TEXTURE.WINDOW_LIGHT_BLUE), 'Expected Light Blue inspector entry.');
        assertTrue(ids.has(INSPECTOR_TEXTURE.WINDOW_GREEN), 'Expected Green inspector entry.');
        assertTrue(!!getTextureInspectorTextureById(INSPECTOR_TEXTURE.WINDOW_LIGHT_BLUE), 'Expected Light Blue inspector texture.');
        assertTrue(!!getTextureInspectorTextureById(INSPECTOR_TEXTURE.WINDOW_GREEN), 'Expected Green inspector texture.');
    });

    test('TextureInspectorCatalog: exposes collections with expected entries', () => {
        const collections = getTextureInspectorCollections();
        assertTrue(Array.isArray(collections) && collections.length >= 2, 'Expected multiple inspector collections.');
        const collectionIds = new Set(collections.map((c) => c.id));
        assertTrue(collectionIds.has(INSPECTOR_COLLECTION.WINDOWS), 'Expected Windows collection.');
        assertTrue(collectionIds.has(INSPECTOR_COLLECTION.TRAFFIC_SIGNS), 'Expected Traffic Signs collection.');

        const windows = getTextureInspectorOptionsForCollection(INSPECTOR_COLLECTION.WINDOWS);
        const windowIds = new Set(windows.map((opt) => opt.id));
        assertTrue(windowIds.has(INSPECTOR_TEXTURE.WINDOW_LIGHT_BLUE), 'Expected Light Blue under Windows.');
        assertTrue(windowIds.has(INSPECTOR_TEXTURE.WINDOW_GREEN), 'Expected Green under Windows.');
        assertFalse(windowIds.has('sign.basic.001'), 'Did not expect signs under Windows.');

        const signs = getTextureInspectorOptionsForCollection(INSPECTOR_COLLECTION.TRAFFIC_SIGNS);
        assertEqual(signs.length, getSignAssets().length, 'Expected Traffic Signs collection to include all signs.');
        const signIds = new Set(signs.map((opt) => opt.id));
        assertTrue(signIds.has('sign.basic.001'), 'Expected basic sign under Traffic Signs.');
        assertFalse(signIds.has(INSPECTOR_TEXTURE.WINDOW_GREEN), 'Did not expect windows under Traffic Signs.');
    });

    test('TextureInspectorCatalog: includes all sign entries', () => {
        const opts = getTextureInspectorOptions();
        const ids = new Set(opts.map((opt) => opt.id));
        const signIds = getSignAssets().map((asset) => asset.id);
        for (const signId of signIds) {
            assertTrue(ids.has(signId), `Missing inspector entry for sign id: ${signId}`);
        }
    });

    test('SignAssets: uv mapping is sane', () => {
        for (const asset of getSignAssets()) {
            const uv = asset.uv;
            const offset = asset.offset;
            const repeat = asset.repeat;
            assertTrue(uv.u0 >= 0 && uv.u0 < uv.u1 && uv.u1 <= 1, `Bad u-range for ${asset.id}`);
            assertTrue(uv.v0 >= 0 && uv.v0 < uv.v1 && uv.v1 <= 1, `Bad v-range for ${asset.id}`);
            assertTrue(offset.x >= 0 && offset.x <= 1, `Bad offset.x for ${asset.id}`);
            assertTrue(offset.y >= 0 && offset.y <= 1, `Bad offset.y for ${asset.id}`);
            assertTrue(repeat.x > 0 && repeat.x <= 1, `Bad repeat.x for ${asset.id}`);
            assertTrue(repeat.y > 0 && repeat.y <= 1, `Bad repeat.y for ${asset.id}`);
        }
    });

    test('SignAssets: representative UVs are stable', () => {
        const basic = getSignAssetById('sign.basic.001');
        assertEqual(basic.rectPx.x, 937);
        assertEqual(basic.rectPx.y, 7);
        assertEqual(basic.rectPx.w, 139);
        assertEqual(basic.rectPx.h, 139);
        assertNear(basic.uv.u0, 937 / 1575, 1e-9, 'basic u0');
        assertNear(basic.uv.u1, (937 + 139) / 1575, 1e-9, 'basic u1');
        assertNear(basic.uv.v0, 1 - (7 + 139) / 945, 1e-9, 'basic v0');
        assertNear(basic.uv.v1, 1 - 7 / 945, 1e-9, 'basic v1');

        const lane = getSignAssetById('sign.lane.022');
        assertEqual(lane.rectPx.x, 822);
        assertEqual(lane.rectPx.y, 800);
        assertEqual(lane.rectPx.w, 413);
        assertEqual(lane.rectPx.h, 207);
        assertNear(lane.uv.u0, 822 / 1258, 1e-9, 'lane u0');
        assertNear(lane.uv.u1, (822 + 413) / 1258, 1e-9, 'lane u1');
        assertNear(lane.uv.v0, 1 - (800 + 207) / 1033, 1e-9, 'lane v0');
        assertNear(lane.uv.v1, 1 - 800 / 1033, 1e-9, 'lane v1');

        const white = getSignAssetById('sign.white_messages.001');
        assertEqual(white.rectPx.x, 22);
        assertEqual(white.rectPx.y, 22);
        assertEqual(white.rectPx.w, 395);
        assertEqual(white.rectPx.h, 493);
        assertNear(white.uv.u0, 22 / 1340, 1e-9, 'white u0');
        assertNear(white.uv.u1, (22 + 395) / 1340, 1e-9, 'white u1');
        assertNear(white.uv.v0, 1 - (22 + 493) / 1592, 1e-9, 'white v0');
        assertNear(white.uv.v1, 1 - 22 / 1592, 1e-9, 'white v1');

        assertTrue(!!getTextureInspectorTextureById(basic.id), 'Expected basic sign texture.');
        assertTrue(!!getTextureInspectorTextureById(lane.id), 'Expected lane sign texture.');
        assertTrue(!!getTextureInspectorTextureById(white.id), 'Expected white sign texture.');
    });

    test('BuildingGenerator: never renders windows outside wall bounds', () => {
        const tileSize = 10;
        const map = {
            tileSize,
            kind: new Uint8Array([0]),
            inBounds: (x, y) => x === 0 && y === 0,
            index: () => 0,
            tileToWorldCenter: () => ({ x: 0, z: 0 })
        };
        const generatorConfig = {
            road: {
                surfaceY: 0,
                curb: { height: 0, extraHeight: 0, thickness: 0 },
                sidewalk: { extraWidth: 0, lift: 0 }
            },
            ground: { surfaceY: 0 }
        };

        const tiles = [[0, 0]];
        const occupyRatio = 1.0;
        const footprintLoops = computeBuildingLoopsFromTiles({ map, tiles, generatorConfig, tileSize, occupyRatio });
        assertTrue(footprintLoops.length > 0, 'Expected footprint loops.');

        let minX = Infinity;
        let maxX = -Infinity;
        let minZ = Infinity;
        let maxZ = -Infinity;
        for (const loop of footprintLoops) {
            for (const p of loop ?? []) {
                if (!p) continue;
                minX = Math.min(minX, p.x);
                maxX = Math.max(maxX, p.x);
                minZ = Math.min(minZ, p.z);
                maxZ = Math.max(maxZ, p.z);
            }
        }
        assertTrue(Number.isFinite(minX) && Number.isFinite(maxX), 'Expected X bounds.');
        assertTrue(Number.isFinite(minZ) && Number.isFinite(maxZ), 'Expected Z bounds.');

        const parts = buildBuildingVisualParts({
            map,
            tiles,
            generatorConfig,
            tileSize,
            occupyRatio,
            floors: 1,
            floorHeight: 3.0,
            style: BUILDING_STYLE.DEFAULT,
            overlays: { wire: false, floorplan: false, border: false, floorDivisions: false },
            walls: { inset: 0.0 },
            windows: {
                enabled: true,
                width: 1.0,
                gap: 0.0,
                height: 1.2,
                y: 0.8,
                cornerEps: 0.05,
                offset: 0.05,
                spacer: { enabled: true, every: 2, width: 1.0, extrude: true, extrudeDistance: 0.2 }
            },
            street: { enabled: false }
        });
        assertTrue(!!parts && !!parts.windows, 'Expected windows group.');

        const meshes = parts.windows?.children?.filter?.((m) => m?.isMesh) ?? [];
        assertTrue(meshes.length > 0, 'Expected at least one window/spacer mesh.');

        const margin = 0.4;
        const box = new THREE.Box3();
        for (const mesh of meshes) {
            box.setFromObject(mesh);
            assertTrue(box.min.x >= minX - margin, `Mesh should not extend beyond minX (${box.min.x} < ${minX - margin}).`);
            assertTrue(box.max.x <= maxX + margin, `Mesh should not extend beyond maxX (${box.max.x} > ${maxX + margin}).`);
            assertTrue(box.min.z >= minZ - margin, `Mesh should not extend beyond minZ (${box.min.z} < ${minZ - margin}).`);
            assertTrue(box.max.z <= maxZ + margin, `Mesh should not extend beyond maxZ (${box.max.z} > ${maxZ + margin}).`);
        }
    });

    test('BuildingGenerator: street floors can add street floor belt', () => {
        const cfg = createCityConfig({ size: 96, mapTileSize: 24, seed: 'test-street-floors' });
        const map = CityMap.fromSpec({ roads: [] }, cfg);
        const parts = buildBuildingVisualParts({
            map,
            tiles: [[0, 0], [1, 0]],
            floors: 4,
            floorHeight: 3.0,
            style: BUILDING_STYLE.DEFAULT,
            overlays: { wire: false, floorplan: false, border: false, floorDivisions: false },
            windows: { enabled: false },
            street: { enabled: true, floors: 1, floorHeight: 5.0, style: BUILDING_STYLE.DEFAULT },
            beltCourse: { enabled: true, margin: 0.4, height: 0.3, color: BELT_COURSE_COLOR.ORANGE }
        });
        assertTrue(parts !== null, 'Should build parts.');
        assertTrue(parts.solidMeshes.length >= 2, 'Should split street and upper meshes.');
        assertTrue(!!parts.beltCourse && !!parts.beltCourse.isMesh, 'Should create belt course mesh.');
        assertEqual(parts.beltCourse.geometry?.parameters?.height, 0.3, 'Street floor belt height should match.');
        assertEqual(parts.beltCourse.material?.color?.getHex?.(), 0xd58a3a, 'Street floor belt color should match.');

        const streetMesh = parts.solidMeshes[0];
        const upperMesh = parts.solidMeshes[1];
        const streetTopY = (streetMesh?.position?.y ?? 0) + 5.0;
        assertTrue(Math.abs((parts.beltCourse.position?.y ?? 0) - (streetTopY + 0.15)) < 1e-6, 'Street floor belt should sit above the street floor.');
        assertTrue(Math.abs((upperMesh?.position?.y ?? 0) - (streetTopY + 0.3)) < 1e-6, 'Upper floors should shift up by belt height.');
    });

    test('BuildingGenerator: top belt can render above roof', () => {
        const cfg = createCityConfig({ size: 96, mapTileSize: 24, seed: 'test-top-belt' });
        const map = CityMap.fromSpec({ roads: [] }, cfg);
        const parts = buildBuildingVisualParts({
            map,
            tiles: [[0, 0], [1, 0]],
            floors: 2,
            floorHeight: 3.0,
            style: BUILDING_STYLE.DEFAULT,
            overlays: { wire: false, floorplan: false, border: false, floorDivisions: false },
            windows: { enabled: false },
            topBelt: { enabled: true, width: 0.5, innerWidth: 0.2, height: 0.25 }
        });
        assertTrue(parts !== null, 'Should build parts.');
        assertTrue(!!parts.topBelt && !!parts.topBelt.isMesh, 'Should create top belt mesh.');
        assertEqual(parts.topBelt.geometry?.type, 'ExtrudeGeometry', 'Top belt should use extruded geometry.');
        parts.topBelt.geometry?.computeBoundingBox?.();
        const bbox = parts.topBelt.geometry?.boundingBox ?? null;
        assertTrue(!!bbox, 'Top belt should have bounds.');
        assertTrue(Math.abs((bbox.max.y - bbox.min.y) - 0.25) < 1e-6, 'Top belt height should match.');
        assertTrue(Math.abs((parts.topBelt.position?.y ?? 0) - 6.01) < 1e-6, 'Top belt should start above roof.');
        const shapes = parts.topBelt.geometry?.parameters?.shapes ?? parts.topBelt.geometry?.parameters?.shape ?? null;
        const shape = Array.isArray(shapes) ? shapes[0] : shapes;
        const holeCount = Array.isArray(shape?.holes) ? shape.holes.length : 0;
        assertTrue(holeCount >= 1, 'Top belt should have an inner hole.');
        assertEqual(parts.topBelt.material?.color?.getHex?.(), 0xf2f2f2, 'Top belt should default to off-white.');
    });

    test('BuildingGenerator: roof color can be configured', () => {
        const cfg = createCityConfig({ size: 96, mapTileSize: 24, seed: 'test-roof-color' });
        const map = CityMap.fromSpec({ roads: [] }, cfg);
        const parts = buildBuildingVisualParts({
            map,
            tiles: [[0, 0], [1, 0]],
            floors: 2,
            floorHeight: 3.0,
            style: BUILDING_STYLE.DEFAULT,
            overlays: { wire: false, floorplan: false, border: false, floorDivisions: false },
            windows: { enabled: false },
            roof: { color: ROOF_COLOR.TERRACOTTA }
        });
        assertTrue(parts !== null, 'Should build parts.');
        const expected = resolveRoofColorHex(ROOF_COLOR.TERRACOTTA, 0xffffff);
        for (const mesh of parts.solidMeshes ?? []) {
            const mat = Array.isArray(mesh?.material) ? mesh.material[0] : null;
            assertEqual(mat?.color?.getHex?.(), expected, 'Roof material color should match.');
        }
    });

    test('TreeGenerator: does not place trees on building tiles', () => {
        const cfg = createCityConfig({ size: 96, mapTileSize: 24, seed: 'test-trees' });
        const map = CityMap.fromSpec({
            width: cfg.map.width,
            height: cfg.map.height,
            tileSize: cfg.map.tileSize,
            origin: cfg.map.origin,
            roads: [],
            buildings: [{
                tiles: [[2, 2], [3, 2]],
                floorHeight: 3,
                floors: 1
            }]
        }, cfg);

        const rng = new CityRNG('tree-test');
        const { placements } = createTreeField({
            map,
            rng,
            groundY: 0,
            config: { trees: { density: 1.0, jitter: 0.0, clearance: 0.0, maxAttempts: 1, roadBoost: 0 } }
        });

        const forbidden = new Set(['2,2', '3,2']);
        for (const p of placements ?? []) {
            const t = map.worldToTile(p.x, p.z);
            assertFalse(forbidden.has(`${t.x},${t.y}`), 'Placement should not be on a building tile.');
        }
    });

    // ========== Procedural Mesh Tests (added in Task 30) ==========
    let proceduralMeshes = null;
    try {
        proceduralMeshes = {
            catalog: await import('/src/graphics/assets3d/procedural_meshes/ProceduralMeshCatalog.js'),
            ball: await import('/src/graphics/assets3d/procedural_meshes/meshes/BallMesh_v1.js'),
            streetSignPole: await import('/src/graphics/assets3d/procedural_meshes/meshes/StreetSignPoleMesh_v1.js'),
            trafficLightPole: await import('/src/graphics/content3d/procedural_meshes/meshes/TrafficLightPoleMesh_v1.js'),
            trafficLightHead: await import('/src/graphics/content3d/procedural_meshes/meshes/TrafficLightHeadMesh_v1.js'),
            trafficLight: await import('/src/graphics/content3d/procedural_meshes/meshes/TrafficLightMesh_v1.js'),
            stopSignPlate: await import('/src/graphics/assets3d/procedural_meshes/meshes/StopSignPlateMesh_v1.js'),
            stopSign: await import('/src/graphics/assets3d/procedural_meshes/meshes/StopSignMesh_v1.js'),
            signAssets: await import('/src/graphics/assets3d/textures/signs/SignAssets.js')
        };
    } catch (e) {
        test('ProceduralMesh: modules are importable', () => {
            throw e;
        });
    }

    if (proceduralMeshes) {
        test('ProceduralMesh: mesh modules expose stable ids', () => {
            assertEqual(proceduralMeshes.ball.MESH_ID, 'mesh.ball.v1', 'Ball mesh id should be stable.');
            assertEqual(proceduralMeshes.streetSignPole.MESH_ID, 'mesh.street_sign_pole.v1', 'Street sign pole id should be stable.');
            assertEqual(proceduralMeshes.trafficLightPole.MESH_ID, 'mesh.traffic_light_pole.v1', 'Traffic light pole id should be stable.');
            assertEqual(proceduralMeshes.trafficLightHead.MESH_ID, 'mesh.traffic_light_head.v1', 'Traffic light head id should be stable.');
            assertEqual(proceduralMeshes.trafficLight.MESH_ID, 'mesh.traffic_light.v1', 'Traffic light mesh id should be stable.');
            assertEqual(proceduralMeshes.stopSignPlate.MESH_ID, 'mesh.stop_sign_plate.v1', 'Stop sign plate id should be stable.');
            assertEqual(proceduralMeshes.stopSign.MESH_ID, 'mesh.stop_sign.v1', 'Stop sign id should be stable.');
        });

        test('ProceduralMeshCatalog: exposes new mesh ids', () => {
            const options = proceduralMeshes.catalog.getProceduralMeshOptions();
            const ids = options.map((opt) => opt.id);
            assertTrue(ids.includes(proceduralMeshes.streetSignPole.MESH_ID), 'Options should include street sign pole.');
            assertTrue(ids.includes(proceduralMeshes.trafficLightPole.MESH_ID), 'Options should include traffic light pole.');
            assertTrue(ids.includes(proceduralMeshes.trafficLightHead.MESH_ID), 'Options should include traffic light head.');
            assertTrue(ids.includes(proceduralMeshes.trafficLight.MESH_ID), 'Options should include traffic light.');
            assertTrue(ids.includes(proceduralMeshes.stopSignPlate.MESH_ID), 'Options should include stop sign plate.');
            assertTrue(ids.includes(proceduralMeshes.stopSign.MESH_ID), 'Options should include stop sign.');
        });

        const assertRegionIds = (asset, expectedIds) => {
            assertTrue(asset !== null, 'Asset should exist.');
            assertTrue(Array.isArray(asset.regions), 'Asset regions should be an array.');
            const actual = asset.regions.map((r) => r.id);
            assertEqual(actual.length, expectedIds.length, 'Regions length should be stable.');
            for (let i = 0; i < expectedIds.length; i++) {
                assertEqual(actual[i], expectedIds[i], 'Region id should be stable.');
                assertTrue(typeof actual[i] === 'string' && actual[i].length > 0, 'Region id should be non-empty.');
            }

            const geometry = asset.mesh?.geometry ?? null;
            const groups = geometry?.groups ?? null;
            assertTrue(Array.isArray(groups) && groups.length > 0, 'Geometry groups should exist.');
            for (const group of groups) {
                assertTrue(Number.isInteger(group.materialIndex), 'Group materialIndex should be an integer.');
                assertTrue(group.materialIndex >= 0 && group.materialIndex < expectedIds.length, 'Group materialIndex should map to a region.');
                assertTrue(Number.isInteger(group.start) && Number.isInteger(group.count), 'Group start/count should be integers.');
                assertTrue(group.count > 0, 'Group count should be non-zero.');
            }
        };

        test('ProceduralMesh: street sign pole region ids stable', () => {
            const asset = proceduralMeshes.catalog.createProceduralMeshAsset(proceduralMeshes.streetSignPole.MESH_ID);
            assertRegionIds(asset, ['street_sign_pole:body']);
        });

        test('ProceduralMesh: street sign pole dimensions scaled down', () => {
            const asset = proceduralMeshes.catalog.createProceduralMeshAsset(proceduralMeshes.streetSignPole.MESH_ID);
            const geo = asset?.mesh?.geometry ?? null;
            assertTrue(!!geo, 'Expected street sign pole geometry.');

            geo.computeBoundingBox();
            const box = geo.boundingBox ?? null;
            assertTrue(!!box, 'Expected street sign pole bounding box.');

            const w = box.max.x - box.min.x;
            const h = box.max.y - box.min.y;
            const d = box.max.z - box.min.z;

            const baselineRadius = 0.055;
            const baselineHeight = 3.0;
            const baselineSegments = 6;
            const baselineGeo = new THREE.CylinderGeometry(baselineRadius, baselineRadius, baselineHeight, baselineSegments, 1, false);
            baselineGeo.translate(0, -1.2 + baselineHeight / 2, 0);
            baselineGeo.computeBoundingBox();
            const baselineBox = baselineGeo.boundingBox ?? null;
            assertTrue(!!baselineBox, 'Expected baseline street sign pole bounding box.');
            const baselineW = baselineBox.max.x - baselineBox.min.x;
            const baselineH = baselineBox.max.y - baselineBox.min.y;
            const baselineD = baselineBox.max.z - baselineBox.min.z;

            const heightScale = 0.8;
            const diameterScale = 0.9;
            const eps = 1e-4;

            assertNear(h, baselineH * heightScale, eps, 'Expected pole height scaled by 0.8.');
            assertNear(w, baselineW * diameterScale, eps, 'Expected pole width scaled by 0.9.');
            assertNear(d, baselineD * diameterScale, eps, 'Expected pole depth scaled by 0.9.');
        });

        test('ProceduralMesh: traffic light pole region ids stable', () => {
            const asset = proceduralMeshes.catalog.createProceduralMeshAsset(proceduralMeshes.trafficLightPole.MESH_ID);
            assertRegionIds(asset, [
                'traffic_light_pole:vertical',
                'traffic_light_pole:inclined',
                'traffic_light_pole:arm'
            ]);
        });

        test('ProceduralMesh: traffic light head region ids stable', () => {
            const asset = proceduralMeshes.catalog.createProceduralMeshAsset(proceduralMeshes.trafficLightHead.MESH_ID);
            assertRegionIds(asset, [
                'traffic_light_head:housing',
                'traffic_light_head:light_red',
                'traffic_light_head:light_yellow',
                'traffic_light_head:light_green'
            ]);

            asset.mesh.geometry.computeBoundingBox();
            const box = asset.mesh.geometry.boundingBox;
            assertTrue(Math.abs(box.min.y) < 1e-6, 'Traffic light head should start at y=0.');
            assertTrue(Math.abs(box.min.z) < 1e-6, 'Traffic light head should start at z=0.');
        });

        test('ProceduralMesh: traffic light composed mesh region ids stable', () => {
            const asset = proceduralMeshes.catalog.createProceduralMeshAsset(proceduralMeshes.trafficLight.MESH_ID);
            assertRegionIds(asset, [
                'traffic_light_pole:vertical',
                'traffic_light_pole:inclined',
                'traffic_light_pole:arm',
                'traffic_light_head:housing',
                'traffic_light_head:light_red',
                'traffic_light_head:light_yellow',
                'traffic_light_head:light_green'
            ]);
        });

        test('ProceduralMesh: traffic light head hangs under the arm', () => {
            const asset = proceduralMeshes.catalog.createProceduralMeshAsset(proceduralMeshes.trafficLight.MESH_ID);
            const geo = asset?.mesh?.geometry ?? null;
            assertTrue(!!geo, 'Traffic light geometry should exist.');

            const groups = geo?.groups ?? [];
            const index = geo?.index ?? null;
            const pos = geo?.attributes?.position ?? null;
            assertTrue(!!index?.isBufferAttribute && !!pos?.isBufferAttribute, 'Traffic light should have indexed positions.');

            const armGroup = groups.find((g) => g?.materialIndex === 2) ?? null;
            assertTrue(!!armGroup, 'Traffic light should include an arm group.');

            const computeGroupBox = (group) => {
                const box = new THREE.Box3();
                box.makeEmpty();
                const v = new THREE.Vector3();
                const start = group?.start ?? 0;
                const end = start + (group?.count ?? 0);
                for (let i = start; i < end; i++) {
                    const vi = index.getX(i);
                    v.fromBufferAttribute(pos, vi);
                    box.expandByPoint(v);
                }
                return box;
            };

            const armBox = computeGroupBox(armGroup);
            const armCenterY = (armBox.min.y + armBox.max.y) / 2;

            const headBox = new THREE.Box3();
            headBox.makeEmpty();
            for (const g of groups) {
                const mi = g?.materialIndex;
                if (!Number.isFinite(mi) || mi < 3) continue;
                headBox.union(computeGroupBox(g));
            }
            assertFalse(headBox.isEmpty(), 'Traffic light should include head geometry.');

            const headCenterY = (headBox.min.y + headBox.max.y) / 2;
            const eps = 1e-4;
            assertNear(headCenterY, armCenterY, eps, 'Traffic light head should be centered at arm height.');
            assertTrue(headBox.min.y < armCenterY, 'Traffic light head should hang below the arm.');
        });

        test('ProceduralMesh: stop sign plate region ids stable', () => {
            const asset = proceduralMeshes.catalog.createProceduralMeshAsset(proceduralMeshes.stopSignPlate.MESH_ID);
            assertRegionIds(asset, [
                'stop_sign_plate:edge',
                'stop_sign_plate:face',
                'stop_sign_plate:back'
            ]);
            const radialSegments = asset?.mesh?.geometry?.parameters?.radialSegments ?? null;
            assertEqual(radialSegments, 8, 'Stop sign plate should have 8 sides.');
        });

        test('ProceduralMesh: stop sign plate depth scaled down by 80%', () => {
            const asset = proceduralMeshes.catalog.createProceduralMeshAsset(proceduralMeshes.stopSignPlate.MESH_ID);
            const geo = asset?.mesh?.geometry ?? null;
            assertTrue(!!geo, 'Expected stop sign plate geometry.');

            geo.computeBoundingBox();
            const box = geo.boundingBox ?? null;
            assertTrue(!!box, 'Expected stop sign plate bounding box.');
            const depth = box.max.z - box.min.z;

            const baselineRadius = 0.34;
            const baselineThickness = 0.04;
            const radialSegments = 8;
            const baselineGeo = new THREE.CylinderGeometry(baselineRadius, baselineRadius, baselineThickness, radialSegments, 1, false);
            baselineGeo.rotateX(Math.PI / 2);
            baselineGeo.rotateZ(Math.PI / radialSegments);
            baselineGeo.computeBoundingBox();
            const baselineBox = baselineGeo.boundingBox ?? null;
            assertTrue(!!baselineBox, 'Expected baseline stop sign plate bounding box.');
            const baselineDepth = baselineBox.max.z - baselineBox.min.z;

            const eps = 1e-4;
            assertNear(depth, baselineDepth * 0.2, eps, 'Expected stop sign plate depth scaled by 0.2.');
        });

        test('ProceduralMesh: stop sign composed mesh region ids stable', () => {
            const asset = proceduralMeshes.catalog.createProceduralMeshAsset(proceduralMeshes.stopSign.MESH_ID);
            assertRegionIds(asset, [
                'street_sign_pole:body',
                'stop_sign_plate:edge',
                'stop_sign_plate:face',
                'stop_sign_plate:back'
            ]);
        });

        test('ProceduralMesh: stop sign plate uses stop sign atlas UVs', () => {
            const asset = proceduralMeshes.catalog.createProceduralMeshAsset(proceduralMeshes.stopSignPlate.MESH_ID);
            const geo = asset?.mesh?.geometry ?? null;
            const groups = geo?.groups ?? [];
            const faceGroup = groups.find((g) => g?.materialIndex === 1) ?? null;
            assertTrue(!!faceGroup, 'Stop sign plate should include a face group.');

            const index = geo?.index ?? null;
            const uv = geo?.attributes?.uv ?? null;
            assertTrue(!!index?.isBufferAttribute && !!uv?.isBufferAttribute, 'Stop sign plate should have indexed UVs.');

            const stopId = proceduralMeshes.stopSignPlate.STOP_SIGN_TEXTURE_ID;
            assertEqual(stopId, 'sign.basic.stop', 'Stop sign texture id should be stable.');

            const stopSign = proceduralMeshes.signAssets.getSignAssetById(stopId);
            const atlasTex = stopSign.getAtlasTexture();

            const faceMat = Array.isArray(asset.materials?.solid) ? asset.materials.solid[1] : null;
            assertTrue(faceMat?.map === atlasTex, 'Stop sign face material should use the sign atlas texture.');

            let minU = Infinity;
            let maxU = -Infinity;
            let minV = Infinity;
            let maxV = -Infinity;
            for (let i = faceGroup.start; i < faceGroup.start + faceGroup.count; i++) {
                const vi = index.getX(i);
                const u = uv.getX(vi);
                const v = uv.getY(vi);
                minU = Math.min(minU, u);
                maxU = Math.max(maxU, u);
                minV = Math.min(minV, v);
                maxV = Math.max(maxV, v);
            }

            const eps = 1e-4;
            assertTrue(minU >= 0 - eps && maxU <= 1 + eps, 'Stop sign plate U coordinates should be within [0,1].');
            assertTrue(minV >= 0 - eps && maxV <= 1 + eps, 'Stop sign plate V coordinates should be within [0,1].');
            assertTrue(minU >= stopSign.uv.u0 - eps && maxU <= stopSign.uv.u1 + eps, 'Stop sign plate U range should match stop sign atlas rect.');
            assertTrue(minV >= stopSign.uv.v0 - eps && maxV <= stopSign.uv.v1 + eps, 'Stop sign plate V range should match stop sign atlas rect.');
        });

        test('ProceduralMesh: stop sign plate face UVs project from XY plane', () => {
            const asset = proceduralMeshes.catalog.createProceduralMeshAsset(proceduralMeshes.stopSignPlate.MESH_ID);
            const geo = asset?.mesh?.geometry ?? null;
            assertTrue(!!geo, 'Stop sign plate geometry should exist.');

            const groups = geo?.groups ?? [];
            const faceGroup = groups.find((g) => g?.materialIndex === 1) ?? null;
            assertTrue(!!faceGroup, 'Stop sign plate should include a face group.');

            const index = geo?.index ?? null;
            const uv = geo?.attributes?.uv ?? null;
            const pos = geo?.attributes?.position ?? null;
            assertTrue(!!index?.isBufferAttribute && !!uv?.isBufferAttribute && !!pos?.isBufferAttribute, 'Stop sign plate should have indexed UVs.');

            const sign = proceduralMeshes.signAssets.getSignAssetById(proceduralMeshes.stopSignPlate.STOP_SIGN_TEXTURE_ID);
            const { offset, repeat } = sign.getTextureDescriptor();

            const vertSet = new Set();
            let minX = Infinity;
            let maxX = -Infinity;
            let minY = Infinity;
            let maxY = -Infinity;
            let maxR = 0;
            for (let i = faceGroup.start; i < faceGroup.start + faceGroup.count; i++) {
                const vi = index.getX(i);
                if (vertSet.has(vi)) continue;
                vertSet.add(vi);
                const x = pos.getX(vi);
                const y = pos.getY(vi);
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
            assertTrue(vertSet.size > 0, 'Stop sign face should contain vertices.');

            const cx = (minX + maxX) * 0.5;
            const cy = (minY + maxY) * 0.5;
            for (const vi of vertSet) {
                const x = pos.getX(vi) - cx;
                const y = pos.getY(vi) - cy;
                maxR = Math.max(maxR, Math.hypot(x, y));
            }
            assertTrue(maxR > 0, 'Stop sign face radius should be non-zero.');

            const eps = 1e-6;
            for (const vi of vertSet) {
                const x = pos.getX(vi) - cx;
                const y = pos.getY(vi) - cy;
                const localU = (uv.getX(vi) - offset.x) / repeat.x;
                const localV = (uv.getY(vi) - offset.y) / repeat.y;
                assertNear(localU, x / (2 * maxR) + 0.5, eps, 'Expected U projected from X.');
                assertNear(localV, y / (2 * maxR) + 0.5, eps, 'Expected V projected from Y.');
            }
        });

        test('ProceduralMesh: traffic light head exposes rig schema', () => {
            const asset = proceduralMeshes.catalog.createProceduralMeshAsset(proceduralMeshes.trafficLightHead.MESH_ID);
            const rig = asset?.mesh?.userData?.rig ?? null;
            assertTrue(!!rig, 'Traffic light head should expose a rig api.');
            assertTrue(!!rig.schema && typeof rig.schema === 'object', 'Rig api should expose schema.');
            assertEqual(rig.schema.id, 'rig.traffic_light_head.v1', 'Rig schema id should be stable.');
            const props = Array.isArray(rig.schema?.properties) ? rig.schema.properties : [];
            const signal = props.find((p) => p?.id === 'signal') ?? null;
            assertTrue(!!signal, 'Schema should include signal.');
            assertEqual(signal.type, 'enum', 'signal should be an enum.');
            const options = Array.isArray(signal.options) ? signal.options : [];
            const ids = options.map((opt) => opt.id);
            assertTrue(ids.includes('none'), 'signal should include none.');
            assertTrue(ids.includes('red'), 'signal should include red.');
            assertTrue(ids.includes('yellow'), 'signal should include yellow.');
            assertTrue(ids.includes('green'), 'signal should include green.');
        });

        test('ProceduralMesh: traffic light head signal updates emissive state', () => {
            const asset = proceduralMeshes.catalog.createProceduralMeshAsset(proceduralMeshes.trafficLightHead.MESH_ID);
            const rig = asset?.mesh?.userData?.rig ?? null;
            assertTrue(!!rig, 'Traffic light head should expose a rig api.');
            const regions = asset?.regions ?? [];
            const idxRed = regions.findIndex((r) => r?.id === 'traffic_light_head:light_red');
            const idxYellow = regions.findIndex((r) => r?.id === 'traffic_light_head:light_yellow');
            const idxGreen = regions.findIndex((r) => r?.id === 'traffic_light_head:light_green');
            assertTrue(idxRed >= 0 && idxYellow >= 0 && idxGreen >= 0, 'Light region indices should exist.');

            rig.setValue('signal', 'green');

            const getIntensity = (materials, idx) => {
                const mat = Array.isArray(materials) ? materials[idx] : null;
                return Number(mat?.emissiveIntensity) || 0;
            };

            assertTrue(getIntensity(asset.materials?.semantic, idxGreen) > 0.01, 'Semantic green light should be on.');
            assertTrue(getIntensity(asset.materials?.semantic, idxRed) < 1e-6, 'Semantic red light should be off.');
            assertTrue(getIntensity(asset.materials?.semantic, idxYellow) < 1e-6, 'Semantic yellow light should be off.');

            assertTrue(getIntensity(asset.materials?.solid, idxGreen) > 0.01, 'Solid green light should be on.');
            assertTrue(getIntensity(asset.materials?.solid, idxRed) < 1e-6, 'Solid red light should be off.');
            assertTrue(getIntensity(asset.materials?.solid, idxYellow) < 1e-6, 'Solid yellow light should be off.');

            rig.setValue('signal', 'none');
            assertTrue(getIntensity(asset.materials?.solid, idxGreen) < 1e-6, 'Solid green light should be off for none.');
            assertTrue(getIntensity(asset.materials?.solid, idxRed) < 1e-6, 'Solid red light should be off for none.');
            assertTrue(getIntensity(asset.materials?.solid, idxYellow) < 1e-6, 'Solid yellow light should be off for none.');
        });

        test('ProceduralMesh: composed traffic light exposes prefab params and child rigs', () => {
            const asset = proceduralMeshes.catalog.createProceduralMeshAsset(proceduralMeshes.trafficLight.MESH_ID);
            const prefab = asset?.mesh?.userData?.prefab ?? null;
            assertTrue(!!prefab, 'Composed traffic light should expose prefab params.');
            const rig = asset?.mesh?.userData?.rig ?? null;
            assertTrue(!!rig, 'Composed traffic light should expose a rig api.');

            const children = Array.isArray(rig.children) ? rig.children : [];
            assertTrue(children.length >= 1, 'Composed traffic light should expose child rigs.');
            const head = rig.getChildRig?.('head') ?? children.find((child) => child?.schema?.id === 'rig.traffic_light_head.v1') ?? null;
            assertTrue(!!head, 'Child rigs should include traffic light head rig.');

            const armProp = (Array.isArray(prefab.schema?.properties) ? prefab.schema.properties : []).find((p) => p?.id === 'armLength') ?? null;
            assertTrue(!!armProp && armProp.type === 'number', 'Prefab params should expose armLength.');

            rig.setValue('head.signal', 'yellow');
            const idxYellow = (asset.regions ?? []).findIndex((r) => r?.id === 'traffic_light_head:light_yellow');
            const idxRed = (asset.regions ?? []).findIndex((r) => r?.id === 'traffic_light_head:light_red');
            const idxGreen = (asset.regions ?? []).findIndex((r) => r?.id === 'traffic_light_head:light_green');
            assertTrue(idxYellow >= 0 && idxRed >= 0 && idxGreen >= 0, 'Composed light region indices should exist.');

            assertTrue(Number(asset.materials?.solid?.[idxYellow]?.emissiveIntensity) > 0.01, 'Composed yellow light should be on.');
            assertTrue(Number(asset.materials?.solid?.[idxRed]?.emissiveIntensity) < 1e-6, 'Composed red light should be off.');
            assertTrue(Number(asset.materials?.solid?.[idxGreen]?.emissiveIntensity) < 1e-6, 'Composed green light should be off.');

            const prevGeo = asset.mesh?.geometry ?? null;
            prefab.setParam('armLength', 3.2);
            assertTrue(asset.mesh?.geometry !== prevGeo, 'armLength should rebuild composed geometry.');

            const geo = asset?.mesh?.geometry ?? null;
            assertTrue(!!geo, 'Composed traffic light geometry should exist after rebuild.');
            const groups = geo?.groups ?? [];
            const index = geo?.index ?? null;
            const pos = geo?.attributes?.position ?? null;
            assertTrue(!!index?.isBufferAttribute && !!pos?.isBufferAttribute, 'Composed traffic light should have indexed positions.');

            const computeGroupBox = (group) => {
                const box = new THREE.Box3();
                box.makeEmpty();
                const v = new THREE.Vector3();
                const start = group?.start ?? 0;
                const end = start + (group?.count ?? 0);
                for (let i = start; i < end; i++) {
                    const vi = index.getX(i);
                    v.fromBufferAttribute(pos, vi);
                    box.expandByPoint(v);
                }
                return box;
            };

            const armGroup = groups.find((g) => g?.materialIndex === 2) ?? null;
            assertTrue(!!armGroup, 'Composed traffic light should include an arm group.');
            const armBox = computeGroupBox(armGroup);
            const armCenterY = (armBox.min.y + armBox.max.y) / 2;

            const headBox = new THREE.Box3();
            headBox.makeEmpty();
            for (const g of groups) {
                const mi = g?.materialIndex;
                if (!Number.isFinite(mi) || mi < 3) continue;
                headBox.union(computeGroupBox(g));
            }
            assertFalse(headBox.isEmpty(), 'Composed traffic light should include head geometry.');
            const headCenterY = (headBox.min.y + headBox.max.y) / 2;

            const eps = 1e-4;
            assertNear(headCenterY, armCenterY, eps, 'Composed traffic light head should stay centered after armLength rebuild.');
        });
    }

    // ========== City Spec Registry Tests ==========
    const citySpecs = await import('/src/app/city/specs/CitySpecRegistry.js');

    test('CitySpecRegistry: contains expected entries', () => {
        const entries = Array.isArray(citySpecs.CITY_SPEC_REGISTRY) ? citySpecs.CITY_SPEC_REGISTRY : [];
        assertTrue(entries.length >= 2, 'Expected at least 2 city specs in registry.');
        assertTrue(entries.some((entry) => entry?.id === citySpecs.DEFAULT_CITY_SPEC_ID), 'Expected default city spec id in registry.');
        assertTrue(entries.some((entry) => entry?.id === 'bigcity'), 'Expected bigcity entry in registry.');
    });

    test('CitySpecRegistry: creating different specs rebuilds roads without errors', () => {
        const cfg = createCityConfig({ size: 400, tileMeters: 2, mapTileSize: 24, seed: 'city-spec-test' });
        const demoSpec = citySpecs.createCitySpecById(citySpecs.DEFAULT_CITY_SPEC_ID, cfg);
        const bigSpec = citySpecs.createCitySpecById('bigcity', cfg);
        assertTrue(!!demoSpec, 'Expected demo spec to be created.');
        assertTrue(!!bigSpec, 'Expected bigcity spec to be created.');

        const demoMap = CityMap.fromSpec(demoSpec, cfg);
        const bigMap = CityMap.fromSpec(bigSpec, cfg);
        assertTrue(!!demoMap && !!bigMap, 'Expected CityMap instances from specs.');

        assertTrue((demoMap.roadNetwork?.edgeIds?.length ?? 0) > 0, 'Expected demo road network edges.');
        assertTrue((bigMap.roadNetwork?.edgeIds?.length ?? 0) > 0, 'Expected bigcity road network edges.');
    });

    // ========== Map Debugger Camera Controls Tests ==========
    try {
        const { MapDebuggerShortcutsPanel } = await import('/src/graphics/gui/map_debugger/MapDebuggerShortcutsPanel.js');
        const { MapDebuggerState } = await import('/src/states/MapDebuggerState.js');
        const { createCityConfig } = await import('/src/app/city/CityConfig.js');
        const { CityMap } = await import('/src/app/city/CityMap.js');

        test('MapDebuggerShortcutsPanel: includes R and T shortcuts', () => {
            const panel = new MapDebuggerShortcutsPanel();
            const keys = Array.from(panel.root.querySelectorAll('.map-debugger-shortcuts-key')).map((el) => el.textContent);
            const expected = ['A', 'Z', 'R', 'T', '↑', '↓', '←', '→', 'Esc'];
            expected.forEach((key) => {
                assertTrue(keys.includes(key), `Expected shortcut key ${key}.`);
            });
            panel.destroy();
        });

        test('MapDebuggerState: wheel zoom gated by editing', () => {
            const engine = {
                canvas: document.createElement('canvas'),
                camera: new THREE.PerspectiveCamera(),
                clearScene: () => {},
                context: {}
            };
            const sm = { go: () => {} };
            const state = new MapDebuggerState(engine, sm);

            state._zoom = 10;
            state._zoomMin = 0;
            state._zoomMax = 100;
            state._zoomSpeed = 40;

            let prevented = false;
            const e = { deltaMode: 0, deltaY: 120, preventDefault: () => { prevented = true; } };

            state._roadModeEnabled = true;
            state._buildingModeEnabled = false;
            state._handleWheel(e);
            assertEqual(state._zoom, 10, 'Zoom should not change while editing.');
            assertFalse(prevented, 'Wheel should not prevent default while editing.');

            state._roadModeEnabled = false;
            state._buildingModeEnabled = false;
            state._handleWheel(e);
            assertTrue(state._zoom !== 10, 'Zoom should change when not editing.');
            assertTrue(prevented, 'Wheel should prevent default when zooming.');
        });

        test('MapDebuggerState: drag pan gated by editing', () => {
            const engine = {
                canvas: document.createElement('canvas'),
                camera: new THREE.PerspectiveCamera(),
                clearScene: () => {},
                context: {}
            };
            const sm = { go: () => {} };
            const state = new MapDebuggerState(engine, sm);

            let dragStarted = false;
            state._startCameraDrag = () => { dragStarted = true; };
            const e = { button: 0 };

            state._roadModeEnabled = true;
            state._buildingModeEnabled = false;
            state._handlePointerDown(e);
            assertFalse(dragStarted, 'Drag should not start while editing.');

            state._roadModeEnabled = false;
            state._buildingModeEnabled = false;
            state._handlePointerDown(e);
            assertFalse(dragStarted, 'Drag should not start when not editing (tool camera uses RMB/MMB).');
        });

        test('MapDebuggerState: loadCitySpec triggers rebuild path', () => {
            const engine = {
                canvas: document.createElement('canvas'),
                camera: new THREE.PerspectiveCamera(),
                clearScene: () => {},
                context: {}
            };
            const sm = { go: () => {} };
            const state = new MapDebuggerState(engine, sm);

            let called = null;
            state._applySpec = (spec, options) => { called = { spec, options }; };

            state._loadCitySpec('bigcity');
            assertTrue(!!called, 'Expected loadCitySpec to call _applySpec.');
            assertEqual(state._citySpecId, 'bigcity', 'Expected selected spec id to be stored.');
            assertTrue(!!called?.options?.resetCamera, 'Expected loadCitySpec to reset camera.');
            assertEqual(state._cityOptions.size, 600, 'Expected bigcity size to update city options.');
        });

        test('MapDebuggerState: road draft markers + live preview (segment-by-segment)', () => {
            const engine = {
                canvas: document.createElement('canvas'),
                camera: new THREE.PerspectiveCamera(),
                scene: new THREE.Scene(),
                clearScene: function() { while (this.scene.children.length) this.scene.remove(this.scene.children[0]); },
                context: {}
            };
            const sm = { go: () => {} };
            const state = new MapDebuggerState(engine, sm);
            const cfg = createCityConfig(state._cityOptions);
            const spec = CityMap.demoSpec(cfg);
            state._applySpec(spec, { resetCamera: true });

            state._startRoadMode();
            const markers = state.city.group.getObjectByName('EditorRoadDraftMarkers');
            const preview = state.city.group.getObjectByName('EditorRoadDraftPreview');
            assertTrue(!!markers, 'Expected draft marker overlay.');
            assertTrue(!!preview, 'Expected draft preview group.');
            assertEqual(markers.count, 0, 'Expected 0 draft markers initially.');
            assertEqual(preview.children.length, 0, 'Expected 0 preview sections initially.');

            state._handleRoadToolClick({ x: 1, y: 1 });
            assertEqual(markers.count, 1, 'Expected 1 draft marker after first point.');
            assertEqual(preview.children.length, 0, 'Preview should not render with <2 draft points.');

            state._handleRoadToolClick({ x: 3, y: 1 });
            assertEqual(markers.count, 2, 'Expected 2 draft markers after second point.');
            assertEqual(preview.children.length, 1, 'Expected 1 preview section for 2 draft points.');

            const hashFloatArray = (arr, scale = 1000) => {
                let h = 2166136261;
                for (let i = 0; i < arr.length; i++) {
                    const v = Math.round(arr[i] * scale);
                    h ^= v;
                    h = Math.imul(h, 16777619);
                }
                return h >>> 0;
            };

            const hashPreview = (group) => {
                let h = 2166136261;
                group.traverse((obj) => {
                    if (obj?.name !== 'Asphalt') return;
                    const arr = obj.geometry?.attributes?.position?.array ?? null;
                    if (!arr) return;
                    h ^= hashFloatArray(arr);
                    h = Math.imul(h, 16777619);
                });
                return h >>> 0;
            };

            const h1 = hashPreview(preview);
            state._syncRoadDraftPreview();
            const h2 = hashPreview(preview);
            assertEqual(h2, h1, 'Expected deterministic preview rebuild hash.');

            state._handleRoadToolClick({ x: 3, y: 4 });
            assertEqual(preview.children.length, 2, 'Expected N-1 preview sections for N draft points.');

            state._cancelRoadDraft();
            assertEqual(markers.count, 0, 'Expected markers cleared after cancelling road draft.');
            assertEqual(preview.children.length, 0, 'Expected preview cleared after cancelling road draft.');
        });

        test('MapDebuggerState: road draft preview clears on done', () => {
            const engine = {
                canvas: document.createElement('canvas'),
                camera: new THREE.PerspectiveCamera(),
                scene: new THREE.Scene(),
                clearScene: function() { while (this.scene.children.length) this.scene.remove(this.scene.children[0]); },
                context: {}
            };
            const sm = { go: () => {} };
            const state = new MapDebuggerState(engine, sm);
            const cfg = createCityConfig(state._cityOptions);
            const spec = CityMap.demoSpec(cfg);
            state._applySpec(spec, { resetCamera: true });

            state._startRoadMode();
            state._handleRoadToolClick({ x: 2, y: 2 });
            state._handleRoadToolClick({ x: 5, y: 2 });
            state._handleRoadToolClick({ x: 4, y: 6 });
            state._doneRoadMode();

            const markers = state.city.group.getObjectByName('EditorRoadDraftMarkers');
            const preview = state.city.group.getObjectByName('EditorRoadDraftPreview');
            assertTrue(!!markers, 'Expected draft marker overlay after done.');
            assertTrue(!!preview, 'Expected draft preview group after done.');
            assertEqual(markers.count, 0, 'Expected markers cleared after done.');
            assertEqual(preview.children.length, 0, 'Expected preview cleared after done.');
            assertFalse(state._roadModeEnabled, 'Expected road mode disabled after done.');
        });

        test('MapDebuggerState: hover edge connection lines', () => {
            const engine = {
                canvas: document.createElement('canvas'),
                camera: new THREE.PerspectiveCamera(),
                scene: new THREE.Scene(),
                clearScene: function() { while (this.scene.children.length) this.scene.remove(this.scene.children[0]); },
                context: {}
            };
            const sm = { go: () => {} };
            const state = new MapDebuggerState(engine, sm);

            const cfg = createCityConfig({ size: 288, mapTileSize: 24, seed: 'edge-hover-001' });
            const spec = {
                version: 1,
                seed: cfg.seed,
                width: 12,
                height: 12,
                tileSize: cfg.map.tileSize,
                origin: cfg.map.origin,
                roads: [
                    { a: [5, 5], b: [9, 5], lanesF: 2, lanesB: 2, tag: 'r1' },
                    { a: [5, 5], b: [5, 9], lanesF: 2, lanesB: 2, tag: 'r2' }
                ],
                buildings: []
            };
            state._applySpec(spec, { resetCamera: true });

            const line = state.city.group.getObjectByName('EditorEdgeConnectionHoverLine');
            assertTrue(!!line, 'Expected edge connection hover line overlay.');
            assertFalse(line.visible, 'Expected hover line hidden by default.');

            const debug = state.city?.roads?.debug ?? null;
            const joins = Array.isArray(debug?.cornerJoins) ? debug.cornerJoins : [];
            const edges = Array.isArray(debug?.edges) ? debug.edges : [];
            const join = joins.find((j) => j?.nodeId === 't:5,5') ?? joins[0] ?? null;
            assertTrue(!!join, 'Expected a corner join in the test map.');
            const conn = Array.isArray(join?.connections) ? join.connections[0] : null;
            assertTrue(!!conn?.a && !!conn?.b, 'Expected join connections.');

            const edgePoint = (nodeId, edgeId, side) => {
                const edge = edges.find((e) => e?.edgeId === edgeId) ?? null;
                if (!edge) return null;
                if (edge.a === nodeId) return side === 'left' ? edge.left?.a : edge.right?.a;
                if (edge.b === nodeId) return side === 'left' ? edge.right?.b : edge.left?.b;
                return null;
            };

            const pConnected = edgePoint(join.nodeId, conn.a.edgeId, conn.a.side);
            assertTrue(!!pConnected, 'Expected connected edge point position.');
            state._updateEdgeConnectionHover(new THREE.Vector3(pConnected.x, 0, pConnected.z));
            assertTrue(line.visible, 'Expected hover line visible when hovering connected edge point.');
            const startCount = line.geometry?.attributes?.instanceStart?.count ?? 0;
            const endCount = line.geometry?.attributes?.instanceEnd?.count ?? 0;
            assertEqual(startCount, 1, 'Expected exactly one hover line segment.');
            assertEqual(endCount, 1, 'Expected exactly one hover line segment.');

            const edgeForConn = edges.find((e) => e?.edgeId === conn.a.edgeId) ?? null;
            const otherNodeId = edgeForConn ? (edgeForConn.a === join.nodeId ? edgeForConn.b : edgeForConn.a) : null;
            const pUnconnected = otherNodeId ? (edgePoint(otherNodeId, conn.a.edgeId, conn.a.side) ?? edgePoint(otherNodeId, conn.a.edgeId, 'left')) : null;
            assertTrue(!!pUnconnected, 'Expected unconnected edge point position.');
            state._updateEdgeConnectionHover(new THREE.Vector3(pUnconnected.x, 0, pUnconnected.z));
            assertFalse(line.visible, 'Expected no hover line when hovering unconnected edge point.');

            state._updateEdgeConnectionHover(new THREE.Vector3(9999, 0, 9999));
            assertFalse(line.visible, 'Expected hover line cleared when hover ends.');
        });
    } catch (e) {
        console.log('⏭️  Map debugger camera tests skipped:', e.message);
    }

    // ========== Road Debugger State Tests (Task 53) ==========
    try {
        const { RoadDebuggerState } = await import('/src/states/RoadDebuggerState.js');

        test('RoadDebuggerState: enter/exit without errors', () => {
            const canvas = document.createElement('canvas');
            canvas.width = 100;
            canvas.height = 100;

            const engine = {
                canvas,
                camera: new THREE.PerspectiveCamera(55, 1, 0.1, 500),
                scene: new THREE.Scene(),
                clearScene: function() { while (this.scene.children.length) this.scene.remove(this.scene.children[0]); }
            };

            const sm = { go: () => {} };
            const state = new RoadDebuggerState(engine, sm);

            state.enter();
            assertTrue(!!state.view, 'Expected RoadDebugger view instance.');
            assertTrue(engine.scene.children.length > 0, 'Expected RoadDebugger scene objects.');
            assertTrue(!!document.querySelector('.road-debugger-ui'), 'Expected RoadDebugger UI root.');

            state.exit();
            assertEqual(document.querySelector('.road-debugger-ui'), null, 'Expected RoadDebugger UI cleanup.');
        });

        test('RoadDebuggerState: does not mutate global UI when used with detached canvas (Task 70)', () => {
            const uiWelcome = document.getElementById('ui-welcome');
            const uiSelect = document.getElementById('ui-select');
            const uiSetup = document.getElementById('ui-setup');
            if (!uiWelcome || !uiSelect || !uiSetup) return;

            const before = {
                bodyClass: document.body.className,
                welcomeHidden: uiWelcome.classList.contains('hidden'),
                selectHidden: uiSelect.classList.contains('hidden'),
                setupHidden: uiSetup.classList.contains('hidden')
            };

            const canvas = document.createElement('canvas');
            canvas.width = 100;
            canvas.height = 100;

            const engine = {
                canvas,
                camera: new THREE.PerspectiveCamera(55, 1, 0.1, 500),
                scene: new THREE.Scene(),
                clearScene: function() { while (this.scene.children.length) this.scene.remove(this.scene.children[0]); }
            };

            const sm = { go: () => {} };
            const state = new RoadDebuggerState(engine, sm);
            try {
                state.enter();
            } finally {
                state.exit();
            }

            assertEqual(document.body.className, before.bodyClass, 'Expected body classes to remain unchanged.');
            assertEqual(uiWelcome.classList.contains('hidden'), before.welcomeHidden, 'Expected welcome visibility unchanged.');
            assertEqual(uiSelect.classList.contains('hidden'), before.selectHidden, 'Expected select visibility unchanged.');
            assertEqual(uiSetup.classList.contains('hidden'), before.setupHidden, 'Expected setup visibility unchanged.');
            assertEqual(document.querySelector('.road-debugger-ui'), null, 'Expected RoadDebugger UI cleanup.');
        });
    } catch (e) {
        console.log('⏭️  Road Debugger tests skipped:', e.message);
    }

    // ========== Road Debugger Pipeline Tests (Task 54) ==========
    try {
        const { computeRoadEngineEdges: rebuildRoadDebuggerPipeline } = await import('/src/app/road_engine/RoadEngineCompute.js');

        test('RoadDebuggerPipeline: N points produce N-1 segments', () => {
	            const roads = [
	                {
	                    id: 'roadA',
	                    name: 'Road A',
	                    lanesF: 2,
	                    lanesB: 1,
	                    points: [
	                        { id: 'p0', tileX: 0, tileY: 0, offsetU: 0, offsetV: 0, tangentFactor: 1 },
	                        { id: 'p1', tileX: 1, tileY: 0, offsetU: 0, offsetV: 0, tangentFactor: 1 },
	                        { id: 'p2', tileX: 2, tileY: 0, offsetU: 0, offsetV: 0, tangentFactor: 1 },
	                        { id: 'p3', tileX: 3, tileY: 0, offsetU: 0, offsetV: 0, tangentFactor: 1 }
	                    ]
	                }
	            ];

            const out = rebuildRoadDebuggerPipeline({ roads, settings: { origin: { x: 0, z: 0 }, tileSize: 24, laneWidth: 4.8, marginFactor: 0.1 } });
            assertEqual(out.segments.length, 3, 'Expected N-1 segments for N points.');
            assertEqual(out.segments[0]?.id, 'seg_roadA_p0_p1', 'Expected stable derived segment id.');
            assertEqual(out.segments[1]?.id, 'seg_roadA_p1_p2', 'Expected stable derived segment id.');
        });

        test('RoadDebuggerPipeline: lane/asphalt offsets follow laneWidth + margin', () => {
            const laneWidth = 4.8;
            const margin = laneWidth * 0.1;
            const lanesF = 2;
            const lanesB = 1;

	            const roads = [
	                {
	                    id: 'r1',
	                    name: 'R1',
	                    lanesF,
	                    lanesB,
	                    points: [
	                        { id: 'a', tileX: 0, tileY: 0, offsetU: 0, offsetV: 0, tangentFactor: 1 },
	                        { id: 'b', tileX: 1, tileY: 0, offsetU: 0, offsetV: 0, tangentFactor: 1 }
	                    ]
	                }
	            ];

            const out = rebuildRoadDebuggerPipeline({ roads, settings: { origin: { x: 0, z: 0 }, tileSize: 24, laneWidth, marginFactor: 0.1 } });
            const seg = out.segments[0];
            assertTrue(!!seg, 'Expected segment output.');

            const getLine = (kind) => seg.polylines.find((p) => p.kind === kind);
            const z0 = (kind) => getLine(kind)?.points?.[0]?.z;

            assertNear(z0('centerline'), 0, 1e-6, 'Centerline should be at divider.');
            assertNear(z0('forward_centerline'), (lanesF * laneWidth) * 0.5, 1e-6, 'Forward centerline offset.');
            assertNear(z0('backward_centerline'), -(lanesB * laneWidth) * 0.5, 1e-6, 'Backward centerline offset.');
            assertNear(z0('lane_edge_right'), lanesF * laneWidth, 1e-6, 'Forward lane edge offset.');
            assertNear(z0('lane_edge_left'), -(lanesB * laneWidth), 1e-6, 'Backward lane edge offset.');
            assertNear(z0('asphalt_edge_right'), lanesF * laneWidth + margin, 1e-6, 'Forward asphalt edge offset.');
            assertNear(z0('asphalt_edge_left'), -(lanesB * laneWidth + margin), 1e-6, 'Backward asphalt edge offset.');

            assertNear(seg.asphaltObb.halfWidthLeft, lanesB * laneWidth + margin, 1e-6, 'OBB left half-width.');
            assertNear(seg.asphaltObb.halfWidthRight, lanesF * laneWidth + margin, 1e-6, 'OBB right half-width.');
        });

        test('RoadDebuggerPipeline: deterministic output for same input', () => {
	            const roads = [
	                {
	                    id: 'roadDet',
	                    name: 'Deterministic',
	                    lanesF: 3,
	                    lanesB: 2,
	                    points: [
	                        { id: 'p0', tileX: 0, tileY: 0, offsetU: 0.05, offsetV: -0.02, tangentFactor: 1 },
	                        { id: 'p1', tileX: 0, tileY: 2, offsetU: -0.01, offsetV: 0.03, tangentFactor: 0.8 },
	                        { id: 'p2', tileX: 2, tileY: 2, offsetU: 0.0, offsetV: 0.0, tangentFactor: 1.1 }
	                    ]
	                }
	            ];

            const settings = { origin: { x: 0, z: 0 }, tileSize: 24, laneWidth: 4.8, marginFactor: 0.1 };
            const a = rebuildRoadDebuggerPipeline({ roads, settings });
            const b = rebuildRoadDebuggerPipeline({ roads, settings });
            assertEqual(JSON.stringify(a), JSON.stringify(b), 'Expected deterministic pipeline output.');
        });

        test('RoadDebuggerPipeline: does not create junctions for internal polyline points (Task 67)', () => {
	            const roads = [
	                {
	                    id: 'roadA',
	                    name: 'Road A',
	                    lanesF: 1,
	                    lanesB: 1,
	                    points: [
	                        { id: 'p0', tileX: 0, tileY: 0, offsetU: 0, offsetV: 0, tangentFactor: 1 },
	                        { id: 'p1', tileX: 2, tileY: 0, offsetU: 0, offsetV: 0, tangentFactor: 1 },
	                        { id: 'p2', tileX: 4, tileY: 0, offsetU: 0, offsetV: 0, tangentFactor: 1 }
	                    ]
	                }
	            ];
            const settings = { origin: { x: 0, z: 0 }, tileSize: 24, laneWidth: 4.8, marginFactor: 0.1 };
            const out = rebuildRoadDebuggerPipeline({ roads, settings });
            assertEqual(out?.junctions?.length ?? 0, 0, 'Expected no junctions for a continuous polyline road.');
        });

        test('RoadDebuggerPipeline: crossing only produces junctions when manual junctions are provided (Task 67)', () => {
	            const roads = [
	                {
	                    id: 'roadH',
	                    name: 'Horizontal',
	                    lanesF: 1,
	                    lanesB: 1,
	                    points: [
	                        { id: 'h0', tileX: 0, tileY: 1, offsetU: 0, offsetV: 0, tangentFactor: 1 },
	                        { id: 'h1', tileX: 4, tileY: 1, offsetU: 0, offsetV: 0, tangentFactor: 1 }
	                    ]
	                },
	                {
	                    id: 'roadV',
	                    name: 'Vertical',
	                    lanesF: 1,
	                    lanesB: 1,
	                    points: [
	                        { id: 'v0', tileX: 2, tileY: 0, offsetU: 0, offsetV: 0, tangentFactor: 1 },
	                        { id: 'v1', tileX: 2, tileY: 3, offsetU: 0, offsetV: 0, tangentFactor: 1 }
	                    ]
	                }
	            ];
            const settings = { origin: { x: 0, z: 0 }, tileSize: 24, laneWidth: 4.8, marginFactor: 0.1 };
            const outNoJunc = rebuildRoadDebuggerPipeline({ roads, settings });
            assertEqual(outNoJunc?.junctions?.length ?? 0, 0, 'Expected no junctions unless created explicitly.');

            const endpoints = outNoJunc?.junctionCandidates?.endpoints ?? [];
            const center = { x: 2 * settings.tileSize, z: 1 * settings.tileSize };
            const byRoad = (roadId) => endpoints
                .filter((e) => e?.id && e?.roadId === roadId && e?.world)
                .map((e) => {
                    const dx = (e.world.x ?? 0) - center.x;
                    const dz = (e.world.z ?? 0) - center.z;
                    return { id: e.id, dist: dx * dx + dz * dz };
                })
                .sort((a, b) => a.dist - b.dist)
                .slice(0, 2)
                .map((e) => e.id);

            const candidateIds = Array.from(new Set([...byRoad('roadH'), ...byRoad('roadV')])).sort();
            assertEqual(candidateIds.length, 4, 'Expected 4 endpoint candidates for manual crossing junction.');

            const out = rebuildRoadDebuggerPipeline({
                roads,
                settings: {
                    ...settings,
                    junctions: {
                        manualJunctions: [{ candidateIds }]
                    }
                }
            });
            assertEqual(out?.junctions?.length ?? 0, 1, 'Expected a single manual junction for a simple 2-road crossing.');
            const junction = out.junctions?.[0] ?? null;
            assertEqual(junction?.source, 'manual', 'Expected junction source to be manual.');
            assertEqual(junction?.endpoints?.length ?? 0, 4, 'Expected 4 approach endpoints for a 2-road crossing.');
            assertTrue((junction?.surface?.points?.length ?? 0) >= 4, 'Expected a junction surface polygon.');
        });
    } catch (e) {
        console.log('⏭️  Road Debugger pipeline tests skipped:', e.message);
    }

    // ========== Road Engine Tests (AI 76) ==========
    try {
        const { computeRoadEngineEdges } = await import('/src/app/road_engine/RoadEngineCompute.js');
        const { triangulateSimplePolygonXZ } = await import('/src/app/road_engine/RoadEngineMeshData.js');

	        test('RoadEngineCompute: deterministic output for JSON-cloned inputs (AI 76)', () => {
	            const roads = [
	                {
	                    id: 'roadDet',
	                    name: 'Deterministic',
	                    lanesF: 3,
	                    lanesB: 2,
	                    points: [
	                        { id: 'p0', tileX: 0, tileY: 0, offsetU: 0.05, offsetV: -0.02, tangentFactor: 1 },
	                        { id: 'p1', tileX: 0, tileY: 2, offsetU: -0.01, offsetV: 0.03, tangentFactor: 0.8 },
	                        { id: 'p2', tileX: 2, tileY: 2, offsetU: 0.0, offsetV: 0.0, tangentFactor: 1.1 }
	                    ]
	                }
	            ];
            const settings = { origin: { x: 0, z: 0 }, tileSize: 24, laneWidth: 4.8, marginFactor: 0.1 };
            const a = computeRoadEngineEdges({ roads, settings });
            const b = computeRoadEngineEdges({ roads: JSON.parse(JSON.stringify(roads)), settings: JSON.parse(JSON.stringify(settings)) });
            assertEqual(JSON.stringify(a), JSON.stringify(b), 'Expected deterministic road engine compute output.');
        });

        test('RoadEngineMeshData: triangulates concave polygons deterministically (AI 76)', () => {
            const poly = [
                { x: 0, z: 0 },
                { x: 4, z: 0 },
                { x: 4, z: 1 },
                { x: 1, z: 1 },
                { x: 1, z: 3 },
                { x: 4, z: 3 },
                { x: 4, z: 4 },
                { x: 0, z: 4 }
            ];

            const a = triangulateSimplePolygonXZ(poly);
            const b = triangulateSimplePolygonXZ(poly);

            assertEqual(JSON.stringify(a), JSON.stringify(b), 'Expected deterministic triangulation output.');
            assertTrue((a.vertices?.length ?? 0) >= 3, 'Expected vertices for a valid polygon.');
            assertEqual((a.indices?.length ?? 0), Math.max(0, (a.vertices.length - 2) * 3), 'Expected N-2 triangulation indices.');
        });

        test('RoadEngineCompute: manual corner junction cuts segments and emits junction surface (AI 82)', () => {
	            const roads = [
	                {
	                    id: 'r1',
	                    name: 'CornerRoad',
	                    lanesF: 1,
	                    lanesB: 1,
	                    points: [
	                        { id: 'a', tileX: 0, tileY: 0, offsetU: 0, offsetV: 0, tangentFactor: 1 },
	                        { id: 'b', tileX: 2, tileY: 0, offsetU: 0, offsetV: 0, tangentFactor: 1 },
	                        { id: 'c', tileX: 2, tileY: 2, offsetU: 0, offsetV: 0, tangentFactor: 1 }
	                    ]
	                }
	            ];
            const settings = {
                origin: { x: 0, z: 0 },
                tileSize: 24,
                laneWidth: 4.8,
                marginFactor: 0.1,
                junctions: {
                    manualJunctions: [{ candidateIds: ['corner_r1_b'] }]
                }
            };

            const out = computeRoadEngineEdges({ roads, settings });
            const corners = out?.junctionCandidates?.corners ?? [];
            assertTrue(corners.some((c) => c?.id === 'corner_r1_b'), 'Expected corner candidate corner_r1_b.');

            const junction = out?.junctions?.find?.((j) => j?.source === 'manual' && (j?.candidateIds ?? []).includes('corner_r1_b')) ?? null;
            assertTrue(!!junction, 'Expected a manual junction from the corner candidate.');
            assertTrue((junction?.endpoints?.length ?? 0) >= 2, 'Expected 2+ endpoints for corner junction.');

            const segIn = out?.segments?.find?.((s) => s?.id === 'seg_r1_a_b') ?? null;
            const segOut = out?.segments?.find?.((s) => s?.id === 'seg_r1_b_c') ?? null;
            assertTrue(!!segIn && !!segOut, 'Expected both segments around the corner.');
            assertTrue((segIn?.keptPieces?.[0]?.t1 ?? 1) < 0.99, 'Expected incoming segment to be cut before the corner.');
            assertTrue((segOut?.keptPieces?.[0]?.t0 ?? 0) > 0.01, 'Expected outgoing segment to be cut after the corner.');

            const surface = (out?.primitives ?? []).find((p) => p?.kind === 'junction_surface' && p?.junctionId === junction.id) ?? null;
            assertTrue(!!surface, 'Expected a junction_surface primitive for the corner junction.');
        });

        test('RoadEngineCompute: degree-2 junction keeps endpoint edges when fillet < 1', () => {
            const roads = [
                {
                    id: 'a',
                    lanesF: 2,
                    lanesB: 2,
                    points: [
                        { id: 'a0', tileX: 0, tileY: 0, offsetU: 0, offsetV: 0, tangentFactor: 1 },
                        { id: 'a1', tileX: 12, tileY: 0, offsetU: 0, offsetV: 0, tangentFactor: 1 }
                    ]
                },
                {
                    id: 'b',
                    lanesF: 2,
                    lanesB: 2,
                    points: [
                        { id: 'b0', tileX: 0, tileY: 0, offsetU: 0, offsetV: 0, tangentFactor: 1 },
                        { id: 'b1', tileX: 0, tileY: 12, offsetU: 0, offsetV: 0, tangentFactor: 1 }
                    ]
                }
            ];

            const settings = {
                origin: { x: 0, z: 0 },
                tileSize: 1,
                laneWidth: 1,
                marginFactor: 0,
                junctions: { enabled: true, autoCreate: true, filletRadiusFactor: 0.35, minThreshold: 0 }
            };

            const out = computeRoadEngineEdges({ roads, settings });
            assertEqual(out?.junctions?.length ?? 0, 1, 'Expected a single auto junction at the shared endpoint.');

            const junction = out?.junctions?.[0] ?? null;
            assertTrue(!!junction, 'Expected a junction record.');
            assertEqual(junction?.endpoints?.length ?? 0, 2, 'Expected a degree-2 junction (2 endpoints).');

            const surfacePoints = Array.isArray(junction?.surface?.points) ? junction.surface.points : [];
            assertTrue(surfacePoints.length >= 3, 'Expected a junction surface polygon.');

            const includesPoint = (target) => surfacePoints.some((p) => Math.hypot((p.x ?? 0) - (target?.x ?? 0), (p.z ?? 0) - (target?.z ?? 0)) <= 1e-6);
            for (const ep of junction.endpoints ?? []) {
                assertTrue(includesPoint(ep?.leftEdge), 'Expected junction surface to include endpoint leftEdge.');
                assertTrue(includesPoint(ep?.rightEdge), 'Expected junction surface to include endpoint rightEdge.');
            }
        });

	        test('RoadEngineCompute: trims shared-endpoint junctions (T-intersection)', () => {
	            const sharedPoint = { id: 'node', tileX: 0, tileY: 0, offsetU: 0, offsetV: 0, tangentFactor: 1 };

            const roads = [
                {
                    id: 'east',
                    lanesF: 2,
                    lanesB: 2,
                    points: [
                        sharedPoint,
                        { id: 'east1', tileX: 20, tileY: 0, offsetU: 0, offsetV: 0, tangentFactor: 1 }
                    ]
                },
                {
                    id: 'north',
                    lanesF: 2,
                    lanesB: 2,
                    points: [
                        sharedPoint,
                        { id: 'north1', tileX: 0, tileY: 20, offsetU: 0, offsetV: 0, tangentFactor: 1 }
                    ]
                },
                {
                    id: 'south',
                    lanesF: 2,
                    lanesB: 2,
                    points: [
                        { id: 'south0', tileX: 0, tileY: -20, offsetU: 0, offsetV: 0, tangentFactor: 1 },
                        sharedPoint
                    ]
                }
            ];

            const settings = {
                origin: { x: 0, z: 0 },
                tileSize: 1,
                laneWidth: 1,
                marginFactor: 0,
                trim: { enabled: true, threshold: 0.1 },
                junctions: { enabled: true, autoCreate: true, filletRadiusFactor: 1, minThreshold: 0 }
            };

            const out = computeRoadEngineEdges({ roads, settings });
            assertEqual(out?.junctions?.length ?? 0, 1, 'Expected a single auto junction at the shared endpoint.');
            const junction = out?.junctions?.[0] ?? null;
            assertEqual(junction?.endpoints?.length ?? 0, 3, 'Expected a T-junction (3 endpoints).');

            const endpointWorlds = (junction?.endpoints ?? []).map((e) => e?.world).filter(Boolean);
            const uniq = new Set(endpointWorlds.map((p) => `${Number(p.x).toFixed(6)},${Number(p.z).toFixed(6)}`));
            assertTrue(uniq.size > 1, 'Expected endpoints to be offset after trimming (roads recede from node).');
            for (const p of endpointWorlds) {
                assertTrue(Math.hypot(Number(p.x) || 0, Number(p.z) || 0) > 0.25, 'Expected no endpoint to remain at the shared node location.');
	            }
	        });

	        test('RoadEngineCompute: trims shared-endpoint collinear joins (touch join)', () => {
	            const sharedPoint = { id: 'node', tileX: 0, tileY: 0, offsetU: 0, offsetV: 0, tangentFactor: 1 };

	            const roads = [
	                {
	                    id: 'left',
	                    lanesF: 2,
	                    lanesB: 2,
	                    points: [
	                        { id: 'left0', tileX: -20, tileY: 0, offsetU: 0, offsetV: 0, tangentFactor: 1 },
	                        sharedPoint
	                    ]
	                },
	                {
	                    id: 'right',
	                    lanesF: 3,
	                    lanesB: 3,
	                    points: [
	                        sharedPoint,
	                        { id: 'right1', tileX: 20, tileY: 0, offsetU: 0, offsetV: 0, tangentFactor: 1 }
	                    ]
	                }
	            ];

	            const settings = {
	                origin: { x: 0, z: 0 },
	                tileSize: 1,
	                laneWidth: 1,
	                marginFactor: 0,
	                trim: { enabled: true, threshold: 0.1 },
	                junctions: { enabled: true, autoCreate: true, filletRadiusFactor: 1, minThreshold: 0 }
	            };

	            const out = computeRoadEngineEdges({ roads, settings });
	            assertEqual(out?.junctions?.length ?? 0, 1, 'Expected a single auto junction at the shared collinear endpoint.');
	            const junction = out?.junctions?.[0] ?? null;
	            assertEqual(junction?.endpoints?.length ?? 0, 2, 'Expected a degree-2 junction (2 endpoints).');

	            const endpoints = junction?.endpoints ?? [];
	            assertTrue(endpoints.every((e) => (e?.sourceIds ?? []).some((v) => typeof v === 'string' && v.startsWith('ov_touch_'))), 'Expected endpoints to include ov_touch_ sourceIds.');

	            const endpointWorlds = endpoints.map((e) => e?.world).filter(Boolean);
	            assertTrue(endpointWorlds.some((p) => (p?.x ?? 0) < -0.25) && endpointWorlds.some((p) => (p?.x ?? 0) > 0.25), 'Expected endpoints on both sides of the shared point.');
	            for (const p of endpointWorlds) {
	                assertTrue(Math.hypot(Number(p.x) || 0, Number(p.z) || 0) > 0.25, 'Expected endpoints to be offset after trimming (roads recede from node).');
	            }

	            const surface = (out?.primitives ?? []).find((p) => p?.kind === 'junction_surface' && p?.junctionId === junction.id) ?? null;
	            assertTrue(!!surface, 'Expected a junction_surface primitive for the touch join.');
	            assertTrue((surface?.points?.length ?? 0) >= 3, 'Expected a junction surface polygon.');
	        });

	        test('RoadEngineCompute: overlap junction merges overlap-connected components', () => {
	            const sharedPoint = { id: 'node', tileX: 0, tileY: 0, offsetU: 0, offsetV: 0, tangentFactor: 1 };

	            const roads = [
	                {
	                    id: 'east',
	                    lanesF: 2,
	                    lanesB: 2,
	                    points: [
	                        sharedPoint,
	                        { id: 'east1', tileX: 20, tileY: 0, offsetU: 0, offsetV: 0, tangentFactor: 1 }
	                    ]
	                },
	                {
	                    id: 'north',
	                    lanesF: 2,
	                    lanesB: 2,
	                    points: [
	                        sharedPoint,
	                        { id: 'north1', tileX: 0, tileY: 20, offsetU: 0, offsetV: 0, tangentFactor: 1 }
	                    ]
	                },
	                {
	                    id: 'diag',
	                    lanesF: 2,
	                    lanesB: 2,
	                    points: [
	                        sharedPoint,
	                        { id: 'diag1', tileX: 20, tileY: 20, offsetU: 0, offsetV: 0, tangentFactor: 1 }
	                    ]
	                }
	            ];

	            const settings = {
	                origin: { x: 0, z: 0 },
	                tileSize: 1,
	                laneWidth: 1,
	                marginFactor: 0,
	                trim: { enabled: true, threshold: 0.1 },
	                junctions: { enabled: true, autoCreate: true, filletRadiusFactor: 1, minThreshold: 0, maxThreshold: 0 }
	            };

	            const out = computeRoadEngineEdges({ roads, settings });
	            assertEqual(out?.junctions?.length ?? 0, 1, 'Expected a single overlap-based auto junction for 3 connected endpoints.');
	            const junction = out?.junctions?.[0] ?? null;
	            assertEqual(junction?.endpoints?.length ?? 0, 3, 'Expected 3 endpoints merged into one junction.');

	            const overlapCounts = (junction?.endpoints ?? []).map((e) => (e?.sourceIds ?? []).filter((v) => typeof v === 'string' && v.startsWith('ov_')).length);
	            assertTrue(overlapCounts.every((n) => n >= 1), 'Expected all junction endpoints to include ov_ sourceIds.');
	            assertTrue(overlapCounts.some((n) => n >= 2), 'Expected at least one endpoint to carry multiple overlap ids (requires component merge).');
	        });

	        test('RoadEngineCompute: TAT exposes build tangents for hover debugging', () => {
	            const roads = [
	                {
	                    id: 'h',
                    lanesF: 2,
                    lanesB: 2,
                    points: [
                        { id: 'h0', tileX: -20, tileY: 0, offsetU: 0, offsetV: 0, tangentFactor: 1 },
                        { id: 'h1', tileX: 20, tileY: 0, offsetU: 0, offsetV: 0, tangentFactor: 1 }
                    ]
                },
                {
                    id: 'd',
                    lanesF: 2,
                    lanesB: 2,
                    points: [
                        { id: 'd0', tileX: -20, tileY: -20, offsetU: 0, offsetV: 0, tangentFactor: 1 },
                        { id: 'd1', tileX: 20, tileY: 20, offsetU: 0, offsetV: 0, tangentFactor: 1 }
                    ]
                }
            ];

            const settings = {
                origin: { x: 0, z: 0 },
                tileSize: 1,
                laneWidth: 1,
                marginFactor: 0,
                trim: { enabled: true, threshold: 0.001 },
                junctions: { autoCreate: true, filletRadiusFactor: 1, minThreshold: 0 }
            };

            const out = computeRoadEngineEdges({ roads, settings });
            const tats = (out?.junctions ?? []).flatMap((j) => (j?.tat ?? []));
            const withArc = tats.filter((t) => (t?.arc?.radius ?? 0) > 1e-6 && (t?.arc?.spanAng ?? 0) > 1e-6);
            assertTrue(withArc.length > 0, 'Expected at least one TAT arc.');
            for (const t of withArc) {
                assertTrue((t?.arc?.spanAng ?? 0) <= Math.PI + 1e-6, 'Expected TAT arc span to be a minor arc (<= π).');
            }

            const withBuild = withArc.find((t) => Array.isArray(t?.buildTangents) && t.buildTangents.length === 2) ?? null;
            assertTrue(!!withBuild, 'Expected at least one TAT arc to include buildTangents.');
            for (const line of withBuild.buildTangents) {
                const ox = line?.origin?.x;
                const oz = line?.origin?.z;
                const dx = line?.dir?.x;
                const dz = line?.dir?.z;
                assertTrue(Number.isFinite(ox) && Number.isFinite(oz), 'Expected build tangent origin.');
                assertTrue(Number.isFinite(dx) && Number.isFinite(dz), 'Expected build tangent dir.');
                assertTrue(Math.hypot(dx, dz) > 0.8, 'Expected build tangent dir to be normalized-ish.');
            }

            for (const junction of out?.junctions ?? []) {
                const endpoints = Array.isArray(junction?.endpoints) ? junction.endpoints : [];
                if (!endpoints.length) continue;
                for (const tat of junction?.tat ?? []) {
                    const buildTangents = Array.isArray(tat?.buildTangents) ? tat.buildTangents : [];
                    if (!buildTangents.length) continue;
                    for (const line of buildTangents) {
                        const origin = line?.origin ?? null;
                        const dir = line?.dir ?? null;
                        if (!origin || !dir) continue;
                        const ox = Number(origin.x) || 0;
                        const oz = Number(origin.z) || 0;
                        const dx = Number(dir.x) || 0;
                        const dz = Number(dir.z) || 0;

                        let best = null;
                        let bestDist = Infinity;
                        for (const ep of endpoints) {
                            const left = ep?.leftEdge ?? null;
                            if (left) {
                                const d = Math.hypot((Number(left.x) || 0) - ox, (Number(left.z) || 0) - oz);
                                if (d < bestDist) {
                                    best = ep;
                                    bestDist = d;
                                }
                            }
                            const right = ep?.rightEdge ?? null;
                            if (right) {
                                const d = Math.hypot((Number(right.x) || 0) - ox, (Number(right.z) || 0) - oz);
                                if (d < bestDist) {
                                    best = ep;
                                    bestDist = d;
                                }
                            }
                        }

                        assertTrue(bestDist < 1e-3, 'Expected build tangent to originate from a junction endpoint edge.');
                        const epDir = best?.dirOut ?? null;
                        const dot = epDir ? Math.abs(dx * (Number(epDir.x) || 0) + dz * (Number(epDir.z) || 0)) : 0;
                        assertTrue(dot > 0.7, 'Expected build tangent direction to align with road edge direction.');
                    }
                }
            }
        });
    } catch (e) {
        console.log('⏭️  Road engine tests skipped:', e.message);
    }

    // ========== Road Decoration Tests (AI 156/157) ==========
    try {
        const { buildRoadCurbMeshDataFromRoadEnginePrimitives } = await import('/src/app/road_decoration/curbs/RoadCurbBuilder.js');
        const { buildRoadSidewalkMeshDataFromRoadEnginePrimitives } = await import('/src/app/road_decoration/sidewalks/RoadSidewalkBuilder.js');

        test('RoadCurbBuilder: builds curb strip triangles for a square asphalt polygon (AI 156)', () => {
            const primitives = [
                {
                    type: 'polygon',
                    id: 'p0',
                    kind: 'asphalt_piece',
                    roadId: 'road1',
                    segmentId: 'seg1',
                    points: [
                        { x: 0, z: 0 },
                        { x: 2, z: 0 },
                        { x: 2, z: 1 },
                        { x: 0, z: 1 }
                    ]
                }
            ];

            const out = buildRoadCurbMeshDataFromRoadEnginePrimitives(primitives, {
                surfaceY: 0,
                curbThickness: 0.5,
                curbHeight: 0.2,
                curbExtraHeight: 0,
                curbSink: 0,
                boundaryEpsilon: 1e-6
            });

            assertTrue(out?.positions instanceof Float32Array, 'Expected Float32Array positions.');
            assertEqual(out.positions.length, 288, 'Expected 4 edges × (top/bottom/inner/outer) quads × 2 triangles.');
        });

        test('RoadCurbBuilder: ignores non-asphalt polygons (AI 156)', () => {
            const primitives = [
                {
                    type: 'polygon',
                    id: 'p0',
                    kind: 'trim_overlap',
                    roadId: 'road1',
                    segmentId: 'seg1',
                    points: [
                        { x: 0, z: 0 },
                        { x: 1, z: 0 },
                        { x: 1, z: 1 },
                        { x: 0, z: 1 }
                    ]
                }
            ];
            const out = buildRoadCurbMeshDataFromRoadEnginePrimitives(primitives, { surfaceY: 0 });
            assertEqual(out.positions.length, 0, 'Expected no curb output for non-asphalt kinds.');
        });

        test('RoadSidewalkBuilder: builds sidewalk strip triangles for a square asphalt polygon (AI 157)', () => {
            const primitives = [
                {
                    type: 'polygon',
                    id: 'p0',
                    kind: 'asphalt_piece',
                    roadId: 'road1',
                    segmentId: 'seg1',
                    points: [
                        { x: 0, z: 0 },
                        { x: 2, z: 0 },
                        { x: 2, z: 1 },
                        { x: 0, z: 1 }
                    ]
                }
            ];

            const out = buildRoadSidewalkMeshDataFromRoadEnginePrimitives(primitives, {
                surfaceY: 0,
                curbThickness: 0.5,
                curbHeight: 0.25,
                curbExtraHeight: 0,
                sidewalkWidth: 1.0,
                sidewalkLift: 0.01,
                startFromCurb: true,
                boundaryEpsilon: 1e-6
            });

            assertTrue(out?.positions instanceof Float32Array, 'Expected Float32Array positions.');
            assertEqual(out.positions.length, 216, 'Expected 4 edges × (top + inner + outer) quads × 2 triangles.');
        });

        test('RoadCurbBuilder: offsets inner holes outward (into the hole) (AI 156)', () => {
            const primitives = [
                {
                    type: 'polygon',
                    id: 'ring_bottom',
                    kind: 'asphalt_piece',
                    roadId: 'road1',
                    segmentId: 'seg1',
                    points: [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 3 }, { x: 0, z: 3 }]
                },
                {
                    type: 'polygon',
                    id: 'ring_top',
                    kind: 'asphalt_piece',
                    roadId: 'road1',
                    segmentId: 'seg1',
                    points: [{ x: 0, z: 7 }, { x: 10, z: 7 }, { x: 10, z: 10 }, { x: 0, z: 10 }]
                },
                {
                    type: 'polygon',
                    id: 'ring_left',
                    kind: 'asphalt_piece',
                    roadId: 'road1',
                    segmentId: 'seg1',
                    points: [{ x: 0, z: 3 }, { x: 3, z: 3 }, { x: 3, z: 7 }, { x: 0, z: 7 }]
                },
                {
                    type: 'polygon',
                    id: 'ring_right',
                    kind: 'asphalt_piece',
                    roadId: 'road1',
                    segmentId: 'seg1',
                    points: [{ x: 7, z: 3 }, { x: 10, z: 3 }, { x: 10, z: 7 }, { x: 7, z: 7 }]
                }
            ];

            const out = buildRoadCurbMeshDataFromRoadEnginePrimitives(primitives, {
                surfaceY: 0,
                curbThickness: 0.5,
                curbHeight: 0.2,
                curbExtraHeight: 0,
                curbSink: 0,
                boundaryEpsilon: 1e-6
            });

            assertTrue(out?.positions instanceof Float32Array, 'Expected Float32Array positions.');
            const cx = 5;
            const cz = 5;
            let minDist = Infinity;
            for (let i = 0; i < out.positions.length; i += 3) {
                const x = out.positions[i];
                const z = out.positions[i + 2];
                const d = Math.hypot(x - cx, z - cz);
                if (d < minDist) minDist = d;
            }

            assertTrue(minDist < 2.6, `Expected curb strip to extend into hole (minDist=${minDist}).`);
        });

        test('RoadSidewalkBuilder: offsets inner holes outward (into the hole) (AI 157)', () => {
            const primitives = [
                {
                    type: 'polygon',
                    id: 'ring_bottom',
                    kind: 'asphalt_piece',
                    roadId: 'road1',
                    segmentId: 'seg1',
                    points: [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 3 }, { x: 0, z: 3 }]
                },
                {
                    type: 'polygon',
                    id: 'ring_top',
                    kind: 'asphalt_piece',
                    roadId: 'road1',
                    segmentId: 'seg1',
                    points: [{ x: 0, z: 7 }, { x: 10, z: 7 }, { x: 10, z: 10 }, { x: 0, z: 10 }]
                },
                {
                    type: 'polygon',
                    id: 'ring_left',
                    kind: 'asphalt_piece',
                    roadId: 'road1',
                    segmentId: 'seg1',
                    points: [{ x: 0, z: 3 }, { x: 3, z: 3 }, { x: 3, z: 7 }, { x: 0, z: 7 }]
                },
                {
                    type: 'polygon',
                    id: 'ring_right',
                    kind: 'asphalt_piece',
                    roadId: 'road1',
                    segmentId: 'seg1',
                    points: [{ x: 7, z: 3 }, { x: 10, z: 3 }, { x: 10, z: 7 }, { x: 7, z: 7 }]
                }
            ];

            const out = buildRoadSidewalkMeshDataFromRoadEnginePrimitives(primitives, {
                surfaceY: 0,
                curbThickness: 0.5,
                curbHeight: 0.25,
                curbExtraHeight: 0,
                sidewalkWidth: 1.0,
                sidewalkLift: 0.01,
                startFromCurb: true,
                boundaryEpsilon: 1e-6
            });

            assertTrue(out?.positions instanceof Float32Array, 'Expected Float32Array positions.');
            const cx = 5;
            const cz = 5;
            let minDist = Infinity;
            for (let i = 0; i < out.positions.length; i += 3) {
                const x = out.positions[i];
                const z = out.positions[i + 2];
                const d = Math.hypot(x - cx, z - cz);
                if (d < minDist) minDist = d;
            }

            assertTrue(minDist < 2.6, `Expected sidewalk strip to extend into hole (minDist=${minDist}).`);
        });
    } catch (e) {
        console.log('⏭️  Road decoration tests skipped:', e.message);
    }

    // ========== Road Engine Global Roads Tests (AI 149) ==========
    try {
        const { CityMap } = await import('/src/app/city/CityMap.js');
        const { City } = await import('/src/graphics/visuals/city/City.js');
        const { createGeneratorConfig } = await import('/src/graphics/assets3d/generators/GeneratorParams.js');
        const { getCityMaterials } = await import('/src/graphics/assets3d/textures/CityMaterials.js');
        const { createRoadEngineRoads } = await import('/src/graphics/visuals/city/RoadEngineRoads.js');

        test('RoadEngineRoads: renders CityMap roads using RoadEngine compute (AI 149)', () => {
            const map = new CityMap({ width: 6, height: 6, tileSize: 24, origin: { x: 0, z: 0 } });
            map.addRoadSegment({ a: [0, 1], b: [5, 1], lanesF: 2, lanesB: 1, tag: 'test' });
            map.addRoadSegment({ a: [2, 0], b: [2, 5], lanesF: 1, lanesB: 1, tag: 'test' });
            map.finalize({ seed: 't' });

            const config = createGeneratorConfig({ render: { roadMode: 'normal' } });
            const materials = getCityMaterials();
            const roads = createRoadEngineRoads({ map, config, materials });

            assertTrue(roads?.group?.isGroup === true, 'Expected roads.group to be a THREE.Group.');
            assertEqual(roads?.debug?.source, 'road_engine', 'Expected road debug source to be road_engine.');
            assertTrue((roads?.debug?.derived?.segments?.length ?? 0) > 0, 'Expected derived segments from RoadEngine.');
            assertTrue((roads?.debug?.edges?.length ?? 0) > 0, 'Expected debug edges for RoadGraph overlay.');
            assertTrue((roads?.debug?.intersections?.length ?? 0) > 0, 'Expected intersection polygons from junction surfaces.');

            const asphalt = roads?.group?.getObjectByName?.('Asphalt') ?? null;
            assertTrue(asphalt?.isMesh === true, 'Expected an Asphalt mesh.');

            const white = roads?.group?.getObjectByName?.('MarkingsWhite') ?? null;
            assertTrue(white?.isMesh === true, 'Expected MarkingsWhite mesh in default mode.');
        });

        test('City: uses RoadEngine roads pipeline (AI 149)', () => {
            const mapSpec = {
                version: 1,
                seed: 't',
                width: 6,
                height: 6,
                tileSize: 24,
                origin: { x: 0, z: 0 },
                roads: [
                    { a: [0, 1], b: [5, 1], lanesF: 2, lanesB: 1, tag: 'test' },
                    { a: [2, 0], b: [2, 5], lanesF: 1, lanesB: 1, tag: 'test' }
                ],
                buildings: []
            };

            const city = new City({ size: 120, tileMeters: 2, mapTileSize: 24, seed: 't', mapSpec, generatorConfig: { render: { treesEnabled: false } } });
            assertEqual(city?.roads?.debug?.source, 'road_engine', 'Expected City roads to come from RoadEngine pipeline.');
            assertTrue((city?.roads?.debug?.derived?.segments?.length ?? 0) > 0, 'Expected City to have derived RoadEngine segments.');
        });
    } catch (e) {
        console.log('⏭️  Road engine global road tests skipped:', e.message);
    }

    // ========== Road Markings + Traffic Controls Tests (AI 158/159) ==========
	    try {
	        const { buildRoadMarkingsMeshDataFromRoadEngineDerived } = await import('/src/app/road_decoration/markings/RoadMarkingsBuilder.js');
	        const { computeRoadTrafficControlPlacementsFromRoadEngineDerived, ROAD_TRAFFIC_CONTROL } = await import('/src/app/road_decoration/traffic_controls/RoadTrafficControlPlacement.js');
	        const { createCityConfig } = await import('/src/app/city/CityConfig.js');
	        const { CityMap } = await import('/src/app/city/CityMap.js');
	        const { BIG_CITY_SPEC } = await import('/src/app/city/specs/BigCitySpec.js');
	        const { buildRoadEngineRoadsFromCityMap } = await import('/src/app/road_engine/RoadEngineCityMapAdapter.js');
	        const { computeRoadEngineEdges } = await import('/src/app/road_engine/RoadEngineCompute.js');

        test('RoadMarkingsBuilder: draws a border loop for a square asphalt polygon (AI 158)', () => {
            const derived = {
                segments: [],
                junctions: [],
                primitives: [
                    {
                        type: 'polygon',
                        id: 'p0',
                        kind: 'asphalt_piece',
                        roadId: 'road1',
                        segmentId: 'seg1',
                        points: [
                            { x: 0, z: 0 },
                            { x: 10, z: 0 },
                            { x: 10, z: 10 },
                            { x: 0, z: 10 }
                        ]
                    }
                ]
            };

            const out = buildRoadMarkingsMeshDataFromRoadEngineDerived(derived, { laneWidth: 4.8, markingY: 0, boundaryEpsilon: 1e-6 });
            assertTrue(out?.whiteLineSegments instanceof Float32Array, 'Expected Float32Array whiteLineSegments.');
            assertTrue(out?.yellowLineSegments instanceof Float32Array, 'Expected Float32Array yellowLineSegments.');
            assertEqual(out.whiteLineSegments.length, 24, 'Expected 4 border segments (8 points).');
            assertEqual(out.yellowLineSegments.length, 0, 'Expected no centerline segments without road network data.');
        });

	        test('RoadMarkingsBuilder: centerline through degree-2 junction follows arc (AI 158)', () => {
	            const derived = {
	                segments: [
                    {
                        id: 'seg0',
                        roadId: 'r0',
                        dir: { x: 1, z: 0 },
                        right: { x: 0, z: -1 },
                        lanesF: 1,
                        lanesB: 1,
                        laneWidth: 4.8,
                        keptPieces: [
                            { id: 'p0', roadId: 'r0', segmentId: 'seg0', aWorld: { x: -10, z: 0 }, bWorld: { x: -2, z: 0 }, length: 8 }
                        ]
                    },
                    {
                        id: 'seg1',
                        roadId: 'r0',
                        dir: { x: 0, z: 1 },
                        right: { x: 1, z: 0 },
                        lanesF: 1,
                        lanesB: 1,
                        laneWidth: 4.8,
                        keptPieces: [
                            { id: 'p1', roadId: 'r0', segmentId: 'seg1', aWorld: { x: 0, z: 2 }, bWorld: { x: 0, z: 10 }, length: 8 }
                        ]
                    }
                ],
                junctions: [
                    {
                        id: 'j2',
                        center: { x: 0, z: 0 },
                        endpoints: [
                            { pieceId: 'p0', end: 'b', world: { x: -2, z: 0 }, dirOut: { x: -1, z: 0 } },
                            { pieceId: 'p1', end: 'a', world: { x: 0, z: 2 }, dirOut: { x: 0, z: 1 } }
                        ]
                    }
                ],
                primitives: []
            };

            const out = buildRoadMarkingsMeshDataFromRoadEngineDerived(derived, { laneWidth: 4.8, markingY: 0 });
            assertTrue(out?.yellowLineSegments instanceof Float32Array, 'Expected Float32Array yellowLineSegments.');
            assertTrue(out.yellowLineSegments.length > 60, 'Expected centerline segments through curved junction.');

            const angles = new Set();
            const segs = out.yellowLineSegments;
            for (let i = 0; i + 5 < segs.length; i += 6) {
                const dx = (Number(segs[i + 3]) || 0) - (Number(segs[i]) || 0);
                const dz = (Number(segs[i + 5]) || 0) - (Number(segs[i + 2]) || 0);
                const len = Math.hypot(dx, dz);
                if (!(len > 1e-6)) continue;
                angles.add(Math.round(Math.atan2(dz, dx) * 10) / 10);
            }
	            assertTrue(angles.size > 4, 'Expected multiple segment angles for curved centerline.');
	        });

	        test('RoadMarkingsBuilder: lane dividers through degree-2 junction follow arc and lane-count matching', () => {
	            const derived = {
	                segments: [
	                    {
	                        id: 'seg0',
	                        roadId: 'r0',
	                        dir: { x: 1, z: 0 },
	                        right: { x: 0, z: -1 },
	                        lanesF: 2,
	                        lanesB: 0,
	                        laneWidth: 4.8,
	                        keptPieces: [
	                            { id: 'p0', roadId: 'r0', segmentId: 'seg0', aWorld: { x: -10, z: 0 }, bWorld: { x: -2, z: 0 }, length: 8 }
	                        ]
	                    },
	                    {
	                        id: 'seg1',
	                        roadId: 'r1',
	                        dir: { x: 0, z: 1 },
	                        right: { x: 1, z: 0 },
	                        lanesF: 3,
	                        lanesB: 0,
	                        laneWidth: 4.8,
	                        keptPieces: [
	                            { id: 'p1', roadId: 'r1', segmentId: 'seg1', aWorld: { x: 0, z: 2 }, bWorld: { x: 0, z: 10 }, length: 8 }
	                        ]
	                    }
	                ],
	                junctions: [
	                    {
	                        id: 'j2',
	                        center: { x: 0, z: 0 },
	                        endpoints: [
	                            { pieceId: 'p0', end: 'b', world: { x: -2, z: 0 }, dirOut: { x: -1, z: 0 } },
	                            { pieceId: 'p1', end: 'a', world: { x: 0, z: 2 }, dirOut: { x: 0, z: 1 } }
	                        ]
	                    }
	                ],
	                primitives: []
	            };

	            const out = buildRoadMarkingsMeshDataFromRoadEngineDerived(derived, { laneWidth: 4.8, markingY: 0 });
	            assertTrue(out?.whiteLineSegments instanceof Float32Array, 'Expected Float32Array whiteLineSegments.');
	            assertTrue(out.whiteLineSegments.length > 0, 'Expected lane divider segments in whiteLineSegments.');

	            const segs = out.whiteLineSegments;
	            const anglesNear48 = new Set();
	            const anglesNear96 = new Set();
	            let countNear96 = 0;

	            for (let i = 0; i + 5 < segs.length; i += 6) {
	                const x0 = Number(segs[i]) || 0;
	                const z0 = Number(segs[i + 2]) || 0;
	                const x1 = Number(segs[i + 3]) || 0;
	                const z1 = Number(segs[i + 5]) || 0;
	                const dx = x1 - x0;
	                const dz = z1 - z0;
	                const len = Math.hypot(dx, dz);
	                if (!(len > 1e-6)) continue;
	                const ang = Math.round(Math.atan2(dz, dx) * 10) / 10;
	                const midX = (x0 + x1) * 0.5;

	                if (midX > 3 && midX < 6) anglesNear48.add(ang);
	                if (midX > 8 && midX < 11) {
	                    anglesNear96.add(ang);
	                    countNear96++;
	                }
	            }

	            assertTrue(anglesNear48.size > 4, 'Expected multiple segment angles for curved lane divider across degree-2 junction.');
	            assertTrue(countNear96 > 0, 'Expected an extra lane divider line at ~2*laneWidth (x≈9.6).');
	            assertTrue(anglesNear96.size <= 2, 'Expected the extra lane divider to remain straight (no continuation across junction).');
	        });

	        test('RoadMarkingsBuilder: emits crosswalk stripes for 3-way junctions (AI 158)', () => {
	            const derived = {
	                segments: [],
                primitives: [],
                junctions: [
                    {
                        id: 'j1',
                        center: { x: 0, z: 0 },
                        endpoints: [
                            { id: 'epN', roadId: 'rN', segmentId: 'segN', pieceId: 'pN', end: 'a', world: { x: 0, z: 0 }, dirOut: { x: 0, z: 1 }, rightOut: { x: 1, z: 0 }, widthLeft: 5, widthRight: 5 },
                            { id: 'epE', roadId: 'rE', segmentId: 'segE', pieceId: 'pE', end: 'a', world: { x: 0, z: 0 }, dirOut: { x: 1, z: 0 }, rightOut: { x: 0, z: -1 }, widthLeft: 0, widthRight: 0 },
                            { id: 'epW', roadId: 'rW', segmentId: 'segW', pieceId: 'pW', end: 'a', world: { x: 0, z: 0 }, dirOut: { x: -1, z: 0 }, rightOut: { x: 0, z: 1 }, widthLeft: 0, widthRight: 0 }
                        ]
                    }
                ]
            };

            const laneWidth = 4.8;
            const out = buildRoadMarkingsMeshDataFromRoadEngineDerived(derived, { laneWidth, crosswalkY: 0.2 });
            assertTrue(out?.crosswalkPositions instanceof Float32Array, 'Expected Float32Array crosswalkPositions.');
            assertTrue(out.crosswalkPositions.length > 0, 'Expected crosswalk triangles.');
            assertEqual(out.crosswalkPositions.length % 9, 0, 'Expected triangle list positions.');
            assertTrue(Math.abs(out.crosswalkPositions[1] - 0.2) < 1e-6, 'Expected crosswalkY to be applied.');

            const stripeDepth = laneWidth * 0.1;
            const stripeGap = laneWidth * 0.06;
            const stripeStep = stripeDepth + stripeGap;
            const edgeInset = laneWidth * (0.33 / 4.8);
            const span = Math.max(0, 5 - edgeInset) + Math.max(0, 5 - edgeInset);
            const stripeCount = Math.max(1, Math.floor((span + stripeGap) / stripeStep));
            assertEqual(out.crosswalkPositions.length, stripeCount * 18, 'Expected stripes to repeat across road width.');

            let minX = Infinity;
            let maxX = -Infinity;
            let minZ = Infinity;
            let maxZ = -Infinity;
            for (let i = 0; i < 18; i += 3) {
                const x = out.crosswalkPositions[i];
                const z = out.crosswalkPositions[i + 2];
                minX = Math.min(minX, x);
                maxX = Math.max(maxX, x);
                minZ = Math.min(minZ, z);
                maxZ = Math.max(maxZ, z);
            }
            assertTrue((maxZ - minZ) > (maxX - minX) * 3, 'Expected crosswalk stripes to align with road flow.');
        });

        test('RoadTrafficControlPlacement: 4-way crossings with 3+ lane road yield traffic lights (AI 159)', () => {
            const derived = {
                segments: [
                    { id: 'segN', roadId: 'rN', dir: { x: 0, z: 1 }, lanesF: 1, lanesB: 1 },
                    { id: 'segS', roadId: 'rS', dir: { x: 0, z: -1 }, lanesF: 2, lanesB: 1 },
                    { id: 'segE', roadId: 'rE', dir: { x: 1, z: 0 }, lanesF: 1, lanesB: 1 },
                    { id: 'segW', roadId: 'rW', dir: { x: -1, z: 0 }, lanesF: 1, lanesB: 1 }
                ],
                junctions: [
                    {
                        id: 'j4',
                        center: { x: 0, z: 0 },
                        endpoints: [
                            { id: 'epN', roadId: 'rN', segmentId: 'segN', world: { x: 0, z: 0 }, dirOut: { x: 0, z: 1 }, rightOut: { x: 1, z: 0 }, widthLeft: 5, widthRight: 5 },
                            { id: 'epS', roadId: 'rS', segmentId: 'segS', world: { x: 0, z: 0 }, dirOut: { x: 0, z: -1 }, rightOut: { x: -1, z: 0 }, widthLeft: 5, widthRight: 5 },
                            { id: 'epE', roadId: 'rE', segmentId: 'segE', world: { x: 0, z: 0 }, dirOut: { x: 1, z: 0 }, rightOut: { x: 0, z: -1 }, widthLeft: 5, widthRight: 5 },
                            { id: 'epW', roadId: 'rW', segmentId: 'segW', world: { x: 0, z: 0 }, dirOut: { x: -1, z: 0 }, rightOut: { x: 0, z: 1 }, widthLeft: 5, widthRight: 5 }
                        ]
                    }
                ]
            };

            const placements = computeRoadTrafficControlPlacementsFromRoadEngineDerived(derived, { laneWidth: 4.8, asphaltY: 0.02, curbHeight: 0.17, trafficLightLaneThreshold: 3 });
            const lights = placements.filter((p) => p?.kind === ROAD_TRAFFIC_CONTROL.TRAFFIC_LIGHT);
            const stops = placements.filter((p) => p?.kind === ROAD_TRAFFIC_CONTROL.STOP_SIGN);
            assertEqual(lights.length, 4, 'Expected one traffic light placement per approach.');
            assertEqual(stops.length, 0, 'Expected no stop signs when traffic lights are selected.');
        });

	        test('RoadTrafficControlPlacement: T-junction stop sign only on stem approach (AI 159)', () => {
	            const derived = {
	                segments: [
	                    { id: 'segN', roadId: 'rN', dir: { x: 0, z: 1 }, lanesF: 1, lanesB: 1 },
                    { id: 'segS', roadId: 'rS', dir: { x: 0, z: -1 }, lanesF: 1, lanesB: 1 },
                    { id: 'segE', roadId: 'rE', dir: { x: 1, z: 0 }, lanesF: 1, lanesB: 1 }
                ],
                junctions: [
                    {
                        id: 'jT',
                        center: { x: 0, z: 0 },
                        endpoints: [
                            { id: 'epN', roadId: 'rN', segmentId: 'segN', world: { x: 0, z: 0 }, dirOut: { x: 0, z: 1 }, rightOut: { x: 1, z: 0 }, widthLeft: 5, widthRight: 5 },
                            { id: 'epS', roadId: 'rS', segmentId: 'segS', world: { x: 0, z: 0 }, dirOut: { x: 0, z: -1 }, rightOut: { x: -1, z: 0 }, widthLeft: 5, widthRight: 5 },
                            { id: 'epE', roadId: 'rE', segmentId: 'segE', world: { x: 0, z: 0 }, dirOut: { x: 1, z: 0 }, rightOut: { x: 0, z: -1 }, widthLeft: 5, widthRight: 5 }
                        ]
                    }
                ]
            };

            const placements = computeRoadTrafficControlPlacementsFromRoadEngineDerived(derived, { laneWidth: 4.8, asphaltY: 0.02, curbHeight: 0.17, trafficLightLaneThreshold: 3 });
            const stops = placements.filter((p) => p?.kind === ROAD_TRAFFIC_CONTROL.STOP_SIGN);
	            assertEqual(stops.length, 1, 'Expected exactly one stop sign on the stem approach.');
	            assertEqual(stops[0]?.corner, 'epE', 'Expected stop sign to be placed on the stem endpoint.');
	        });

	        test('RoadTrafficControlPlacement: Big City tile 6:14 selects traffic lights and places them on sidewalks (AI 178)', () => {
	            const cfg = createCityConfig({ size: 600, mapTileSize: 24, seed: 'bigcity-ai178-test' });
	            const map = CityMap.fromSpec(BIG_CITY_SPEC, cfg);
	            const roads = buildRoadEngineRoadsFromCityMap(map);

	            const laneWidth = 4.8;
	            const derived = computeRoadEngineEdges({
	                roads,
	                settings: {
	                    origin: map.origin,
	                    tileSize: map.tileSize,
	                    laneWidth,
	                    marginFactor: 0.1,
	                    flags: { centerline: false, directionCenterlines: false, laneEdges: false, asphaltEdges: false, markers: false, asphaltObb: false },
	                    trim: { enabled: true, threshold: laneWidth * 0.5 },
	                    junctions: { enabled: true, autoCreate: true, filletRadiusFactor: 0.9 }
	                }
	            });

	            const asphaltY = 0.02;
	            const curbThickness = 0.48;
	            const curbHeight = 0.17;
	            const sidewalkWidth = 1.875;
	            const sidewalkLift = 0.001;
	            const sidewalkY = asphaltY + curbHeight + sidewalkLift;

	            const placements = computeRoadTrafficControlPlacementsFromRoadEngineDerived(derived, {
	                laneWidth,
	                tileSize: map.tileSize,
	                asphaltY,
	                curbThickness,
	                curbHeight,
	                sidewalkWidth,
	                sidewalkLift,
	                trafficLightLaneThreshold: 3
	            });

	            const target = { x: map.origin.x + 6 * map.tileSize, z: map.origin.z + 14 * map.tileSize };
	            const radius = map.tileSize * 1.25;

	            const lightsNear = placements.filter((p) => {
	                if (p?.kind !== ROAD_TRAFFIC_CONTROL.TRAFFIC_LIGHT) return false;
	                const pos = p?.position ?? null;
	                if (!pos) return false;
	                const dx = (Number(pos.x) || 0) - target.x;
	                const dz = (Number(pos.z) || 0) - target.z;
	                return Math.hypot(dx, dz) <= radius + 1e-6;
	            });

	            const stopsNear = placements.filter((p) => {
	                if (p?.kind !== ROAD_TRAFFIC_CONTROL.STOP_SIGN) return false;
	                const pos = p?.position ?? null;
	                if (!pos) return false;
	                const dx = (Number(pos.x) || 0) - target.x;
	                const dz = (Number(pos.z) || 0) - target.z;
	                return Math.hypot(dx, dz) <= radius + 1e-6;
	            });

	            assertEqual(lightsNear.length, 4, 'Expected 4 traffic lights near tile 6:14.');
	            assertEqual(stopsNear.length, 0, 'Expected no stop signs near tile 6:14 when traffic lights are selected.');

	            const endpointById = new Map();
	            const junctions = Array.isArray(derived?.junctions) ? derived.junctions : [];
	            for (const junction of junctions) {
	                for (const ep of Array.isArray(junction?.endpoints) ? junction.endpoints : []) {
	                    if (ep?.id) endpointById.set(ep.id, ep);
	                }
	            }

	            for (const placement of lightsNear) {
	                const pos = placement.position;
	                assertNear(pos.y, sidewalkY, 1e-6, 'Expected traffic light y to be on the sidewalk surface.');

	                const cornerId = placement?.corner ?? null;
	                const ep = cornerId ? endpointById.get(cornerId) : null;
	                assertTrue(!!ep?.world && !!ep?.rightOut, 'Expected matching endpoint with rightOut for traffic light placement.');

	                const vx = (Number(pos.x) || 0) - (Number(ep.world.x) || 0);
	                const vz = (Number(pos.z) || 0) - (Number(ep.world.z) || 0);
	                const rightOut = ep.rightOut;
	                const lateral = vx * (Number(rightOut.x) || 0) + vz * (Number(rightOut.z) || 0);

	                const half = Math.max(0, Number(ep?.widthRight) || 0, Number(ep?.widthLeft) || 0);
	                assertTrue(lateral > half + curbThickness + 0.05, 'Expected traffic light to be placed beyond the curb (on sidewalk).');
	            }
	        });
	    } catch (e) {
	        console.log('⏭️  Road markings/traffic controls tests skipped:', e.message);
	    }

    // ========== Road Debugger Authoring Tests (Task 55) ==========
    try {
        const { RoadDebuggerView } = await import('/src/graphics/gui/road_debugger/RoadDebuggerView.js');

        test('RoadDebugger: roads can be created from tile clicks (N points -> N-1 segments)', () => {
            const engine = {
                canvas: document.createElement('canvas'),
                camera: new THREE.PerspectiveCamera(55, 1, 0.1, 500),
                scene: new THREE.Scene(),
                clearScene: function() { while (this.scene.children.length) this.scene.remove(this.scene.children[0]); }
            };

            const view = new RoadDebuggerView(engine, { uiEnabled: true });
            view.enter();
            try {
                view.startRoadDraft();
                const ox = view._origin.x;
                const oz = view._origin.z;
                const tileSize = view._tileSize;
                const w = (tx, ty) => ({ x: ox + tx * tileSize, z: oz + ty * tileSize });

                view.addDraftPointFromWorld(w(0, 0));
                view.addDraftPointFromWorld(w(2, 0));
                view.addDraftPointFromWorld(w(2, 2));
                assertEqual(view.getDraftRoad().points.length, 3, 'Expected 3 draft points.');

                view.finishRoadDraft();
                const roads = view.getRoads();
                assertEqual(roads.length, 1, 'Expected 1 authored road.');

                const derived = view.getDerived();
                const segs = (derived?.segments ?? []).filter((s) => s?.roadId === roads[0].id);
                assertEqual(segs.length, 2, 'Expected N-1 derived segments.');
                assertTrue(!!document.querySelector(`.road-debugger-road-row[data-road-id="${roads[0].id}"]`), 'Expected road row in table.');
            } finally {
                view.exit();
            }
        });

	        test('RoadDebugger: table hover/selection updates highlight state', () => {
            const engine = {
                canvas: document.createElement('canvas'),
                camera: new THREE.PerspectiveCamera(55, 1, 0.1, 500),
                scene: new THREE.Scene(),
                clearScene: function() { while (this.scene.children.length) this.scene.remove(this.scene.children[0]); }
            };

            const view = new RoadDebuggerView(engine, { uiEnabled: true });
            view.enter();
            try {
                view.startRoadDraft();
                view.addDraftPointByTile(0, 0);
                view.addDraftPointByTile(2, 0);
                view.addDraftPointByTile(2, 2);
                view.finishRoadDraft();
                view.clearSelection();

                const roadId = view.getRoads()[0].id;
                const derived = view.getDerived();
                const segId = (derived?.segments ?? []).find((s) => s?.roadId === roadId)?.id ?? null;
                assertTrue(!!segId, 'Expected derived segment id.');

	                let roadRow = document.querySelector(`.road-debugger-road-row[data-road-id="${roadId}"]`);
	                assertTrue(!!roadRow, 'Expected road row.');
	                roadRow.dispatchEvent(new Event('mouseenter'));
	                assertEqual(view._hover.roadId, roadId, 'Expected hover road id to update.');

	                roadRow.dispatchEvent(new MouseEvent('click', { bubbles: true }));
	                assertEqual(view._selection.type, 'road', 'Expected road selection type.');

	                const segRow = document.querySelector(`.road-debugger-seg-row[data-segment-id="${segId}"]`);
	                assertTrue(!!segRow, 'Expected segment row in detail panel.');
	                segRow.dispatchEvent(new Event('mouseenter'));
	                assertEqual(view._hover.segmentId, segId, 'Expected hover segment id to update.');

	                segRow.dispatchEvent(new MouseEvent('click', { bubbles: true }));
	                assertEqual(view._selection.type, 'segment', 'Expected segment selection type.');
	                assertEqual(view._selection.segmentId, segId, 'Expected segment selection id.');
            } finally {
                view.exit();
            }
        });

	        test('RoadDebugger: lane config edits update derived widths', () => {
            const engine = {
                canvas: document.createElement('canvas'),
                camera: new THREE.PerspectiveCamera(55, 1, 0.1, 500),
                scene: new THREE.Scene(),
                clearScene: function() { while (this.scene.children.length) this.scene.remove(this.scene.children[0]); }
            };

            const view = new RoadDebuggerView(engine, { uiEnabled: true });
            view.enter();
            try {
                view.startRoadDraft();
                view.addDraftPointByTile(0, 0);
                view.addDraftPointByTile(3, 0);
                view.finishRoadDraft();

                const roadId = view.getRoads()[0].id;
                const before = view.getDerived().segments.find((s) => s?.roadId === roadId);
                assertTrue(!!before, 'Expected derived segment.');
	                assertNear(before.asphaltObb.halfWidthRight, 5.28, 1e-6, 'Expected initial right half-width for lanesF=1.');
	                assertNear(before.asphaltObb.halfWidthLeft, 5.28, 1e-6, 'Expected initial left half-width for lanesB=1.');

	                const roadRow = document.querySelector(`.road-debugger-road-row[data-road-id="${roadId}"]`);
	                assertTrue(!!roadRow, 'Expected road row.');
	                roadRow.dispatchEvent(new MouseEvent('click', { bubbles: true }));
	                assertEqual(view._selection?.type, 'road', 'Expected road selection.');

	                const editor = document.querySelector('.road-debugger-editor');
	                assertTrue(!!editor, 'Expected bottom editor panel.');
	                const getLaneGroup = (capText) => Array.from(editor.querySelectorAll('.road-debugger-lane-group')).find((el) => ((el.querySelector('.road-debugger-lane-group-cap')?.textContent ?? '').trim() === capText)) ?? null;
	                const clickLane = (capText, value) => {
	                    const group = getLaneGroup(capText);
	                    assertTrue(!!group, `Expected ${capText} lane group.`);
	                    const btn = Array.from(group.querySelectorAll('button.road-debugger-segmented-btn')).find((b) => ((b.textContent ?? '').trim() === String(value))) ?? null;
	                    assertTrue(!!btn, `Expected ${capText} button ${value}.`);
	                    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
	                };

	                clickLane('lanesF', 3);
	                const afterF = view.getDerived().segments.find((s) => s?.roadId === roadId);
	                assertNear(afterF.asphaltObb.halfWidthRight, 14.88, 1e-6, 'Expected right half-width to update for lanesF=3.');

	                clickLane('lanesB', 2);
	                const afterB = view.getDerived().segments.find((s) => s?.roadId === roadId);
	                assertNear(afterB.asphaltObb.halfWidthLeft, 10.08, 1e-6, 'Expected left half-width to update for lanesB=2.');

	                clickLane('lanesB', 0);
	                const afterB0 = view.getDerived().segments.find((s) => s?.roadId === roadId);
	                assertNear(afterB0.asphaltObb.halfWidthLeft, 0.48, 1e-6, 'Expected left half-width to update for lanesB=0 (one-way).');
            } finally {
                view.exit();
            }
        });

	        test('RoadDebugger: lanesF cannot be zero', () => {
	            const engine = {
	                canvas: document.createElement('canvas'),
	                camera: new THREE.PerspectiveCamera(55, 1, 0.1, 500),
	                scene: new THREE.Scene(),
	                clearScene: function() { while (this.scene.children.length) this.scene.remove(this.scene.children[0]); }
	            };

	            const view = new RoadDebuggerView(engine, { uiEnabled: true });
	            view.enter();
	            try {
	                view.startRoadDraft({ lanesF: 0, lanesB: 1 });
	                assertEqual(view.getDraftRoad()?.lanesF ?? null, 1, 'Expected draft lanesF to clamp to 1 when passed 0.');

	                view.addDraftPointByTile(0, 0);
	                view.addDraftPointByTile(2, 0);
	                view.finishRoadDraft();

	                const roadId = view.getRoads()?.[0]?.id ?? null;
	                assertTrue(!!roadId, 'Expected road id.');
	                assertEqual(view.getRoads()?.[0]?.lanesF ?? null, 1, 'Expected authored road lanesF to be at least 1.');

	                view.setRoadLaneConfig(roadId, { lanesF: 0 });
	                assertEqual(view.getRoads()?.[0]?.lanesF ?? null, 1, 'Expected lanesF to remain at least 1 after lane edit attempt.');

	                const roadRow = document.querySelector(`.road-debugger-road-row[data-road-id="${roadId}"]`);
	                assertTrue(!!roadRow, 'Expected road row.');
	                roadRow.dispatchEvent(new MouseEvent('click', { bubbles: true }));

	                const editor = document.querySelector('.road-debugger-editor');
	                assertTrue(!!editor, 'Expected bottom editor panel.');
	                const lanesFGroup = Array.from(editor.querySelectorAll('.road-debugger-lane-group'))
	                    .find((el) => ((el.querySelector('.road-debugger-lane-group-cap')?.textContent ?? '').trim() === 'lanesF')) ?? null;
	                assertTrue(!!lanesFGroup, 'Expected lanesF lane group.');
	                const hasZero = Array.from(lanesFGroup.querySelectorAll('button.road-debugger-segmented-btn'))
	                    .some((b) => ((b.textContent ?? '').trim() === '0'));
	                assertFalse(hasZero, 'Expected lanesF selector to not include 0.');
	            } finally {
	                view.exit();
	            }
	        });
    } catch (e) {
        console.log('⏭️  Road Debugger authoring tests skipped:', e.message);
    }

    // ========== Road Debugger Editing Tests (Task 56) ==========
    try {
        const { RoadDebuggerView } = await import('/src/graphics/gui/road_debugger/RoadDebuggerView.js');

	        test('RoadDebugger: moving points updates tile coords across boundaries', () => {
            const engine = {
                canvas: document.createElement('canvas'),
                camera: new THREE.PerspectiveCamera(55, 1, 0.1, 500),
                scene: new THREE.Scene(),
                clearScene: function() { while (this.scene.children.length) this.scene.remove(this.scene.children[0]); }
            };

            const view = new RoadDebuggerView(engine, { uiEnabled: false });
            view.startRoadDraft();
            view.addDraftPointByTile(0, 0);
            view.addDraftPointByTile(0, 1);
            view.finishRoadDraft();

            const road = view.getRoads()[0];
            const roadId = road.id;
            const pointId = road.points[0].id;
            const tileSize = view._tileSize;
            const ox = view._origin.x;
            const oz = view._origin.z;

            const ok = view.movePointToWorld(roadId, pointId, { x: ox + tileSize * 0.6, z: oz }, { snap: false });
            assertTrue(ok, 'Expected point move to apply.');

	            const moved = view.getRoads()[0].points.find((p) => p?.id === pointId);
	            assertEqual(moved.tileX, 1, 'Expected tileX to update after crossing boundary.');
	            assertEqual(moved.tileY, 0, 'Expected tileY to remain.');
	            assertNear(moved.offsetU, -0.4, 1e-6, 'Expected offsetU to be relative to new tile center.');
	            assertNear(moved.offsetV, 0, 1e-6, 'Expected offsetV to remain.');
	        });

	        test('RoadDebugger: snapping produces only tile/10 positions and clamps inside tile', () => {
            const engine = {
                canvas: document.createElement('canvas'),
                camera: new THREE.PerspectiveCamera(55, 1, 0.1, 500),
                scene: new THREE.Scene(),
                clearScene: function() { while (this.scene.children.length) this.scene.remove(this.scene.children[0]); }
            };

            const view = new RoadDebuggerView(engine, { uiEnabled: false });
            view.startRoadDraft();
            view.addDraftPointByTile(0, 0);
            view.addDraftPointByTile(1, 0);
            view.finishRoadDraft();

            const road = view.getRoads()[0];
	            const roadId = road.id;
	            const pointId = road.points[0].id;
	            const step = 0.1;
	            const half = 0.5;
	            const ox = view._origin.x;
	            const oz = view._origin.z;

	            view.movePointToWorld(roadId, pointId, { x: ox + 3.1, z: oz - 4.9 }, { snap: true });
	            let pt = view.getRoads()[0].points.find((p) => p?.id === pointId);
	            const ix = Math.round(pt.offsetU / step);
	            const iy = Math.round(pt.offsetV / step);
	            assertTrue(ix >= -5 && ix <= 5, 'Expected snap index X within [-5..5].');
	            assertTrue(iy >= -5 && iy <= 5, 'Expected snap index Y within [-5..5].');
	            assertNear(pt.offsetU, ix * step, 1e-6, 'Expected snapped offsetU to match grid.');
	            assertNear(pt.offsetV, iy * step, 1e-6, 'Expected snapped offsetV to match grid.');
	            assertTrue(Math.abs(pt.offsetU) <= half + 1e-6, 'Expected snapped offsetU within tile bounds.');
	            assertTrue(Math.abs(pt.offsetV) <= half + 1e-6, 'Expected snapped offsetV within tile bounds.');

	            const tileSize = view._tileSize;
	            view.movePointToWorld(roadId, pointId, { x: ox - tileSize * 100, z: oz - tileSize * 100 }, { snap: true });
	            pt = view.getRoads()[0].points.find((p) => p?.id === pointId);
	            assertEqual(pt.tileX, 0, 'Expected clamped tileX at map boundary.');
	            assertEqual(pt.tileY, 0, 'Expected clamped tileY at map boundary.');
	            assertNear(pt.offsetU, -half, 1e-6, 'Expected clamped offsetU inside tile bounds.');
	            assertNear(pt.offsetV, -half, 1e-6, 'Expected clamped offsetV inside tile bounds.');
	        });

        test('RoadDebugger: undo/redo reverts point moves deterministically', () => {
            const engine = {
                canvas: document.createElement('canvas'),
                camera: new THREE.PerspectiveCamera(55, 1, 0.1, 500),
                scene: new THREE.Scene(),
                clearScene: function() { while (this.scene.children.length) this.scene.remove(this.scene.children[0]); }
            };

            const view = new RoadDebuggerView(engine, { uiEnabled: false });
            view.startRoadDraft();
            view.addDraftPointByTile(0, 0);
            view.addDraftPointByTile(2, 0);
            view.finishRoadDraft();

            const road = view.getRoads()[0];
            const roadId = road.id;
            const pointId = road.points[0].id;
            const tileSize = view._tileSize;
            const ox = view._origin.x;
            const oz = view._origin.z;

            const before = JSON.stringify(view.getDerived());
            view.movePointToWorld(roadId, pointId, { x: ox + tileSize * 0.6, z: oz }, { snap: false });
            const after = JSON.stringify(view.getDerived());
            assertTrue(before !== after, 'Expected derived output to change after move.');

            assertTrue(view.undo(), 'Expected undo to succeed.');
            assertEqual(JSON.stringify(view.getDerived()), before, 'Expected undo to restore derived output.');

            assertTrue(view.redo(), 'Expected redo to succeed.');
            assertEqual(JSON.stringify(view.getDerived()), after, 'Expected redo to restore derived output.');
        });

        test('RoadDebugger: undo/redo covers road creation', () => {
            const engine = {
                canvas: document.createElement('canvas'),
                camera: new THREE.PerspectiveCamera(55, 1, 0.1, 500),
                scene: new THREE.Scene(),
                clearScene: function() { while (this.scene.children.length) this.scene.remove(this.scene.children[0]); }
            };

            const view = new RoadDebuggerView(engine, { uiEnabled: false });
            view.startRoadDraft();
            view.addDraftPointByTile(0, 0);
            view.addDraftPointByTile(2, 0);
            view.finishRoadDraft();

            assertEqual(view.getRoads().length, 1, 'Expected 1 road after finishing draft.');
            assertTrue(view.undo(), 'Expected undo to succeed.');
            assertEqual(view.getRoads().length, 0, 'Expected undo to remove road.');
            assertTrue(!!view.getDraftRoad(), 'Expected undo to restore draft.');

            assertTrue(view.redo(), 'Expected redo to succeed.');
            assertEqual(view.getRoads().length, 1, 'Expected redo to restore road.');
            assertEqual(view.getDraftRoad(), null, 'Expected redo to clear draft.');
        });

        test('RoadDebugger: schema export/import roundtrip preserves derived output', () => {
            const engineA = {
                canvas: document.createElement('canvas'),
                camera: new THREE.PerspectiveCamera(55, 1, 0.1, 500),
                scene: new THREE.Scene(),
                clearScene: function() { while (this.scene.children.length) this.scene.remove(this.scene.children[0]); }
            };

            const viewA = new RoadDebuggerView(engineA, { uiEnabled: false });
            viewA.startRoadDraft();
            viewA.addDraftPointByTile(0, 0);
            viewA.addDraftPointByTile(3, 0);
            viewA.addDraftPointByTile(3, 2);
            viewA.finishRoadDraft();

            const roadId = viewA.getRoads()[0].id;
            const pointId = viewA.getRoads()[0].points[0].id;
            viewA.setRoadLaneConfig(roadId, { lanesF: 3, lanesB: 2 });
            viewA.setPointTangentFactor(roadId, pointId, 1.4);
            viewA.movePointToWorld(roadId, pointId, { x: viewA._origin.x + viewA._tileSize * 0.6, z: viewA._origin.z }, { snap: true });

            const exported = viewA.exportSchema({ pretty: false, includeDraft: true });
            const expected = JSON.stringify(viewA.getDerived());

            const engineB = {
                canvas: document.createElement('canvas'),
                camera: new THREE.PerspectiveCamera(55, 1, 0.1, 500),
                scene: new THREE.Scene(),
                clearScene: function() { while (this.scene.children.length) this.scene.remove(this.scene.children[0]); }
            };
            const viewB = new RoadDebuggerView(engineB, { uiEnabled: false });
            assertTrue(viewB.importSchema(exported, { pushUndo: false }), 'Expected schema import to succeed.');
            assertEqual(JSON.stringify(viewB.getDerived()), expected, 'Expected derived output to match after import.');
        });

        test('RoadDebugger: merging same-road connector persists via undo/redo and export/import (Task 67)', () => {
            const engineA = {
                canvas: document.createElement('canvas'),
                camera: new THREE.PerspectiveCamera(55, 1, 0.1, 500),
                scene: new THREE.Scene(),
                clearScene: function() { while (this.scene.children.length) this.scene.remove(this.scene.children[0]); }
            };

            const viewA = new RoadDebuggerView(engineA, { uiEnabled: false });
            viewA.setAutoJunctionEnabled(false);
            viewA.startRoadDraft();
            viewA.addDraftPointByTile(0, 1);
            viewA.addDraftPointByTile(4, 1);
            viewA.finishRoadDraft();

            viewA.startRoadDraft();
            viewA.addDraftPointByTile(2, 0);
            viewA.addDraftPointByTile(2, 3);
            viewA.finishRoadDraft();

            const findConnector = (view, id) => {
                const derived = view.getDerived();
                for (const j of derived?.junctions ?? []) {
                    const c = j?.connectors?.find?.((x) => x?.id === id) ?? null;
                    if (c) return c;
                }
                return null;
            };

            const derived0 = viewA.getDerived();
            assertEqual(derived0?.junctions?.length ?? 0, 0, 'Expected no junctions unless created explicitly.');

            const endpoints = derived0?.junctionCandidates?.endpoints ?? [];
            const center = { x: viewA._origin.x + viewA._tileSize * 2, z: viewA._origin.z + viewA._tileSize * 1 };
            const roadIds = viewA.getRoads().map((r) => r?.id).filter(Boolean);
            const byRoad = (roadId) => endpoints
                .filter((e) => e?.id && e?.roadId === roadId && e?.world)
                .map((e) => {
                    const dx = (e.world.x ?? 0) - center.x;
                    const dz = (e.world.z ?? 0) - center.z;
                    return { id: e.id, dist: dx * dx + dz * dz };
                })
                .sort((a, b) => a.dist - b.dist)
                .slice(0, 2)
                .map((e) => e.id);

            const candidateIds = Array.from(new Set(roadIds.flatMap((id) => byRoad(id)))).sort();
            assertEqual(candidateIds.length, 4, 'Expected 4 endpoint candidates for manual crossing junction.');

            viewA.setJunctionToolEnabled(true);
            assertTrue(viewA.setJunctionToolSelection(candidateIds), 'Expected junction tool selection to apply.');
            assertTrue(viewA.createJunctionFromToolSelection(), 'Expected manual junction creation to succeed.');
            viewA.setJunctionToolEnabled(false);

            const derived1 = viewA.getDerived();
            assertEqual(derived1?.junctions?.length ?? 0, 1, 'Expected a single crossing junction after manual creation.');
            const junction0 = derived1.junctions[0];
            const sameRoad = (junction0?.connectors ?? []).find((c) => c?.sameRoad && !c?.mergedIntoRoad) ?? null;
            assertTrue(!!sameRoad?.id, 'Expected at least one same-road connector.');

            const connectorId = sameRoad.id;
            assertTrue(viewA.mergeConnectorIntoRoad(connectorId), 'Expected mergeConnectorIntoRoad to succeed.');
            assertTrue(!!findConnector(viewA, connectorId)?.mergedIntoRoad, 'Expected connector to be marked merged after merge.');

            assertTrue(viewA.undo(), 'Expected undo after merge to succeed.');
            assertTrue(!findConnector(viewA, connectorId)?.mergedIntoRoad, 'Expected connector merge to revert on undo.');

            assertTrue(viewA.redo(), 'Expected redo after merge to succeed.');
            assertTrue(!!findConnector(viewA, connectorId)?.mergedIntoRoad, 'Expected connector merge to reapply on redo.');

            const exported = viewA.exportSchema({ pretty: false, includeDraft: true });
            const expected = JSON.stringify(viewA.getDerived());

            const engineB = {
                canvas: document.createElement('canvas'),
                camera: new THREE.PerspectiveCamera(55, 1, 0.1, 500),
                scene: new THREE.Scene(),
                clearScene: function() { while (this.scene.children.length) this.scene.remove(this.scene.children[0]); }
            };
            const viewB = new RoadDebuggerView(engineB, { uiEnabled: false });
            assertTrue(viewB.importSchema(exported, { pushUndo: false }), 'Expected schema import to succeed.');
            assertTrue(!!findConnector(viewB, connectorId)?.mergedIntoRoad, 'Expected merged connector state to persist after import.');
            assertEqual(JSON.stringify(viewB.getDerived()), expected, 'Expected derived output to match after import with merged connectors.');
        });

        test('RoadDebugger: schema export/import supports lanesB=0 (Task 81)', () => {
            const engineA = {
                canvas: document.createElement('canvas'),
                camera: new THREE.PerspectiveCamera(55, 1, 0.1, 500),
                scene: new THREE.Scene(),
                clearScene: function() { while (this.scene.children.length) this.scene.remove(this.scene.children[0]); }
            };

            const viewA = new RoadDebuggerView(engineA, { uiEnabled: false });
            viewA.startRoadDraft();
            viewA.addDraftPointByTile(0, 0);
            viewA.addDraftPointByTile(2, 0);
            viewA.finishRoadDraft();

            const roadId = viewA.getRoads()[0].id;
            viewA.setRoadLaneConfig(roadId, { lanesF: 2, lanesB: 0 });

            const exported = viewA.exportSchema({ pretty: false, includeDraft: true });
            const expected = JSON.stringify(viewA.getDerived());

            const engineB = {
                canvas: document.createElement('canvas'),
                camera: new THREE.PerspectiveCamera(55, 1, 0.1, 500),
                scene: new THREE.Scene(),
                clearScene: function() { while (this.scene.children.length) this.scene.remove(this.scene.children[0]); }
            };
            const viewB = new RoadDebuggerView(engineB, { uiEnabled: false });
            assertTrue(viewB.importSchema(exported, { pushUndo: false }), 'Expected schema import to succeed.');
            assertEqual(viewB.getRoads()[0].lanesB, 0, 'Expected lanesB=0 to persist after import.');
            assertEqual(JSON.stringify(viewB.getDerived()), expected, 'Expected derived output to match after import.');
        });
    } catch (e) {
        console.log('⏭️  Road Debugger editing tests skipped:', e.message);
    }

    // ========== Road Debugger Rendering Tests (Task 57) ==========
    try {
        const { RoadDebuggerView } = await import('/src/graphics/gui/road_debugger/RoadDebuggerView.js');

        test('RoadDebugger: asphalt toggle controls asphalt visibility', () => {
            const engine = {
                canvas: document.createElement('canvas'),
                camera: new THREE.PerspectiveCamera(55, 1, 0.1, 500),
                scene: new THREE.Scene(),
                clearScene: function() { while (this.scene.children.length) this.scene.remove(this.scene.children[0]); }
            };

            const view = new RoadDebuggerView(engine, { uiEnabled: true });
            view.enter();
            try {
                view.startRoadDraft();
                view.addDraftPointByTile(0, 0);
                view.addDraftPointByTile(2, 0);
                view.finishRoadDraft();

                assertTrue((view._asphaltMeshes?.length ?? 0) > 0, 'Expected asphalt meshes for authored segments.');
                assertTrue(view._asphaltGroup?.visible !== false, 'Expected asphalt to be visible by default.');

                const rows = Array.from(document.querySelectorAll('.road-debugger-row'));
                const asphaltRow = rows.find((r) => r.textContent.includes('Asphalt')) ?? null;
                assertTrue(!!asphaltRow, 'Expected Asphalt toggle row.');
                const input = asphaltRow.querySelector('input[type="checkbox"]');
                assertTrue(!!input, 'Expected Asphalt checkbox input.');

                input.checked = false;
                input.dispatchEvent(new Event('change'));
                assertTrue(view._asphaltGroup?.visible === false, 'Expected asphalt group to be hidden after toggle off.');

                input.checked = true;
                input.dispatchEvent(new Event('change'));
                assertTrue(view._asphaltGroup?.visible === true, 'Expected asphalt group to be visible after toggle on.');
            } finally {
                view.exit();
            }
        });

        test('RoadDebugger: markings pipeline toggle controls arrow/marking visibility', () => {
            const engine = {
                canvas: document.createElement('canvas'),
                camera: new THREE.PerspectiveCamera(55, 1, 0.1, 500),
                scene: new THREE.Scene(),
                clearScene: function() { while (this.scene.children.length) this.scene.remove(this.scene.children[0]); }
            };

            const view = new RoadDebuggerView(engine, { uiEnabled: true });
            view.enter();
            try {
                view.startRoadDraft();
                view.addDraftPointByTile(0, 0);
                view.addDraftPointByTile(1, 0);
                view.finishRoadDraft();

                const button = document.querySelector('.road-debugger-decoration-btn[data-step-id="markings"]');
                assertTrue(!!button, 'Expected markings pipeline button.');

                assertTrue(view._markingsGroup?.visible !== false, 'Expected markings to be visible by default.');

                button.dispatchEvent(new Event('click'));
                assertTrue(view._markingsGroup?.visible === false, 'Expected markings group to be hidden after toggle off.');

                button.dispatchEvent(new Event('click'));
                assertTrue(view._markingsGroup?.visible === true, 'Expected markings group to be visible after toggle on.');
                assertTrue((view._markingLines?.length ?? 0) > 0, 'Expected lane marking object.');
                assertTrue((view._arrowMeshes?.length ?? 0) > 0, 'Expected lane arrow mesh object.');
            } finally {
                view.exit();
            }
        });

        test('RoadDebugger: hovering approach renders traffic control marker when controls are visible', () => {
            const engine = {
                canvas: document.createElement('canvas'),
                camera: new THREE.PerspectiveCamera(55, 1, 0.1, 500),
                scene: new THREE.Scene(),
                clearScene: function() { while (this.scene.children.length) this.scene.remove(this.scene.children[0]); }
            };

            const view = new RoadDebuggerView(engine, { uiEnabled: true });
            view.enter();
            try {
                const stopSigns = view._stopSignsGroup ?? null;
                assertTrue(!!stopSigns, 'Expected stop signs group to exist.');
                stopSigns.visible = true;

                const instance = new THREE.Group();
                instance.userData.trafficControl = { kind: 'stop_sign', corner: 'ep_test', approach: 'seg_test' };
                instance.position.set(10, 0.5, 20);
                stopSigns.add(instance);

                view.setHoverApproach('j_test', 'ep_test');
                assertTrue(view._trafficControlMarkerMesh?.visible === true, 'Expected traffic control marker to be visible on hover.');
                assertNear(Number(view._trafficControlMarkerMesh?.position?.x) || 0, 10, 1e-6, 'Expected marker X to match traffic control.');
                assertNear(Number(view._trafficControlMarkerMesh?.position?.z) || 0, 20, 1e-6, 'Expected marker Z to match traffic control.');
            } finally {
                view.exit();
            }
        });

	        test('RoadDebugger: distance-scaled edge thickness is automatic (Task 89)', () => {
            const engine = {
                canvas: document.createElement('canvas'),
                camera: new THREE.PerspectiveCamera(55, 1, 0.1, 500),
                scene: new THREE.Scene(),
                clearScene: function() { while (this.scene.children.length) this.scene.remove(this.scene.children[0]); }
            };

            const view = new RoadDebuggerView(engine, { uiEnabled: false });
	            view.enter();
	            try {
	                view.startRoadDraft();
	                view.addDraftPointByTile(0, 0);
	                view.addDraftPointByTile(2, 0);
	                view.finishRoadDraft();
	                view.setRenderOptions({ edges: true });

		                view.controls?.setOrbit?.({ radius: view._zoomMin }, { immediate: true });
		                view._syncOrbitCamera();
			                const asphaltNear = view._materials?.lineBase?.get?.('asphalt_edge_left') ?? null;
			                const laneNear = view._materials?.lineBase?.get?.('lane_edge_left') ?? null;
	                assertTrue(!!asphaltNear, 'Expected asphalt edge line material.');
	                assertTrue(!!laneNear, 'Expected lane edge line material.');
	                const nearAsphaltWidth = Number(asphaltNear.linewidth) || 0;
	                const nearLaneWidth = Number(laneNear.linewidth) || 0;
	                assertNear(nearAsphaltWidth, 2, 1e-6, 'Expected full asphalt edge thickness at near zoom.');
	                assertNear(nearLaneWidth, 2, 1e-6, 'Expected full lane edge thickness at near zoom.');

	                view.controls?.setOrbit?.({ radius: view._zoomMax }, { immediate: true });
	                view._syncOrbitCamera();
	                const asphaltFar = view._materials?.lineBase?.get?.('asphalt_edge_left') ?? null;
	                const laneFar = view._materials?.lineBase?.get?.('lane_edge_left') ?? null;
	                assertTrue(!!asphaltFar, 'Expected asphalt edge line material at far zoom.');
	                assertTrue(!!laneFar, 'Expected lane edge line material at far zoom.');
	                const farAsphaltWidth = Number(asphaltFar.linewidth) || 0;
	                const farLaneWidth = Number(laneFar.linewidth) || 0;
	                assertNear(farAsphaltWidth, 0.55, 1e-6, 'Expected thinner asphalt edges at far zoom.');
	                assertNear(farLaneWidth, 0.55, 1e-6, 'Expected thinner lane edges at far zoom.');
	                assertTrue(farLaneWidth < nearLaneWidth, 'Expected lane edges to scale down when zoomed out.');
	            } finally {
	                view.exit();
            }
        });

	        test('RoadDebugger: lane arrows follow segment forward direction (Task 71)', () => {
	            const engine = {
	                canvas: document.createElement('canvas'),
	                camera: new THREE.PerspectiveCamera(55, 1, 0.1, 500),
	                scene: new THREE.Scene(),
                clearScene: function() { while (this.scene.children.length) this.scene.remove(this.scene.children[0]); }
            };

            const view = new RoadDebuggerView(engine, { uiEnabled: false });
            view.enter();
            try {
                view.startRoadDraft();
                view.addDraftPointByTile(0, 0);
                view.addDraftPointByTile(2, 0);
                view.finishRoadDraft();
                view.setRenderOptions({ markings: true });
	
	                const derived = view.getDerived();
	                const seg = derived?.segments?.[0] ?? null;
	                assertTrue(!!seg?.aWorld && !!seg?.bWorld && !!seg?.dir && !!seg?.right, 'Expected derived segment with direction vectors.');

                const mesh = view._arrowMeshes?.[0] ?? null;
                const attr = mesh?.geometry?.getAttribute?.('position') ?? null;
                const positions = attr?.array ?? null;
                assertTrue(Array.isArray(positions) || positions instanceof Float32Array, 'Expected arrow geometry positions.');
                assertTrue((positions.length % (9 * 3)) === 0, 'Expected arrow geometry to be packed as 9 vertices per arrow.');

                const arrowCount = positions.length / (9 * 3);
                assertTrue(arrowCount >= 2, 'Expected at least two lane arrows (forward + backward).');

	                const segMidX = ((Number(seg.aWorld.x) || 0) + (Number(seg.bWorld.x) || 0)) * 0.5;
	                const segMidZ = ((Number(seg.aWorld.z) || 0) + (Number(seg.bWorld.z) || 0)) * 0.5;
	                const dirX = Number(seg.dir.x) || 0;
	                const dirZ = Number(seg.dir.z) || 0;
	                const expectedRightX = -dirZ;
	                const expectedRightZ = dirX;
	                const rightX = Number(seg.right.x) || 0;
	                const rightZ = Number(seg.right.z) || 0;
	                assertTrue((rightX * expectedRightX + rightZ * expectedRightZ) > 0.95, 'Expected segment.right to follow right-hand traffic convention.');
	
	                const readV = (vertexIndex) => {
	                    const i = vertexIndex * 3;
	                    return { x: Number(positions[i]) || 0, y: Number(positions[i + 1]) || 0, z: Number(positions[i + 2]) || 0 };
                };

                let foundForward = false;
                let foundBackward = false;

	                for (let a = 0; a < arrowCount; a++) {
	                    const base = a * 9;
	                    const tip = readV(base + 6);
	                    const triSign = (offset) => {
	                        const v0 = readV(base + offset);
	                        const v1 = readV(base + offset + 1);
	                        const v2 = readV(base + offset + 2);
	                        const abx = v1.x - v0.x;
	                        const abz = v1.z - v0.z;
	                        const acx = v2.x - v0.x;
	                        const acz = v2.z - v0.z;
	                        const ny = abz * acx - abx * acz;
	                        return Math.sign(ny);
	                    };
	                    const sign0 = triSign(0);
	                    const sign1 = triSign(3);
	                    const sign2 = triSign(6);
	                    assertTrue(sign2 !== 0 && sign0 === sign2 && sign1 === sign2, 'Expected arrow body triangles to share winding with the arrow head.');

	                    let tailX = 0;
	                    let tailZ = 0;
	                    for (let k = 0; k < 6; k++) {
	                        const v = readV(base + k);
	                        tailX += v.x;
	                        tailZ += v.z;
	                    }
	                    const tail = {
	                        x: tailX / 6,
	                        z: tailZ / 6
	                    };

	                    const arrowDirX = tip.x - tail.x;
	                    const arrowDirZ = tip.z - tail.z;
	                    const dotForward = arrowDirX * dirX + arrowDirZ * dirZ;
	
	                    const centerX = (tip.x + tail.x) * 0.5;
	                    const centerZ = (tip.z + tail.z) * 0.5;
	                    const side = (centerX - segMidX) * expectedRightX + (centerZ - segMidZ) * expectedRightZ;
	
	                    if (dotForward > 0) {
	                        foundForward = true;
	                        assertTrue(dotForward > 0.25, 'Expected forward-lane arrow to point along segment direction.');
	                        assertTrue(side > 1e-6, 'Expected forward-lane arrow to render on the right side of the centerline.');
	                    } else {
	                        foundBackward = true;
	                        assertTrue(dotForward < -0.25, 'Expected backward-lane arrow to point opposite segment direction.');
	                        assertTrue(side < -1e-6, 'Expected backward-lane arrow to render on the left side of the centerline.');
	                    }
	                }
	
	                assertTrue(foundForward && foundBackward, 'Expected both forward and backward lane arrows.');
            } finally {
                view.exit();
            }
        });

        test('RoadDebugger: lane arrows correct on vertical segment (Task 84)', () => {
            const engine = {
                canvas: document.createElement('canvas'),
                camera: new THREE.PerspectiveCamera(55, 1, 0.1, 500),
                scene: new THREE.Scene(),
                clearScene: function() { while (this.scene.children.length) this.scene.remove(this.scene.children[0]); }
            };

            const view = new RoadDebuggerView(engine, { uiEnabled: false });
            view.enter();
            try {
                view.startRoadDraft();
                view.addDraftPointByTile(0, 0);
                view.addDraftPointByTile(0, 2);
                view.finishRoadDraft();
                view.setRenderOptions({ markings: true });

                const derived = view.getDerived();
                const seg = derived?.segments?.[0] ?? null;
                assertTrue(!!seg?.aWorld && !!seg?.bWorld && !!seg?.dir && !!seg?.right, 'Expected derived segment with direction vectors.');

                const mesh = view._arrowMeshes?.[0] ?? null;
                const attr = mesh?.geometry?.getAttribute?.('position') ?? null;
                const positions = attr?.array ?? null;
                assertTrue(Array.isArray(positions) || positions instanceof Float32Array, 'Expected arrow geometry positions.');
                assertTrue((positions.length % (9 * 3)) === 0, 'Expected arrow geometry to be packed as 9 vertices per arrow.');

                const arrowCount = positions.length / (9 * 3);
                assertTrue(arrowCount >= 2, 'Expected at least two lane arrows (forward + backward).');

	                const segMidX = ((Number(seg.aWorld.x) || 0) + (Number(seg.bWorld.x) || 0)) * 0.5;
	                const segMidZ = ((Number(seg.aWorld.z) || 0) + (Number(seg.bWorld.z) || 0)) * 0.5;
	                const dirX = Number(seg.dir.x) || 0;
	                const dirZ = Number(seg.dir.z) || 0;
	                const expectedRightX = -dirZ;
	                const expectedRightZ = dirX;
	                const rightX = Number(seg.right.x) || 0;
	                const rightZ = Number(seg.right.z) || 0;
	                assertTrue((rightX * expectedRightX + rightZ * expectedRightZ) > 0.95, 'Expected segment.right to follow right-hand traffic convention.');

                const readV = (vertexIndex) => {
                    const i = vertexIndex * 3;
                    return { x: Number(positions[i]) || 0, y: Number(positions[i + 1]) || 0, z: Number(positions[i + 2]) || 0 };
                };

                let foundForward = false;
                let foundBackward = false;
	                for (let a = 0; a < arrowCount; a++) {
	                    const base = a * 9;
	                    const tip = readV(base + 6);
	                    let tailX = 0;
	                    let tailZ = 0;
	                    for (let k = 0; k < 6; k++) {
	                        const v = readV(base + k);
	                        tailX += v.x;
	                        tailZ += v.z;
	                    }
	                    const tail = {
	                        x: tailX / 6,
	                        z: tailZ / 6
	                    };

	                    const arrowDirX = tip.x - tail.x;
	                    const arrowDirZ = tip.z - tail.z;
	                    const dotForward = arrowDirX * dirX + arrowDirZ * dirZ;
	
	                    const centerX = (tip.x + tail.x) * 0.5;
	                    const centerZ = (tip.z + tail.z) * 0.5;
	                    const side = (centerX - segMidX) * expectedRightX + (centerZ - segMidZ) * expectedRightZ;
	                    if (dotForward > 0) {
	                        foundForward = true;
	                        assertTrue(dotForward > 0.25, 'Expected forward-lane arrow to point along segment direction.');
	                    } else {
	                        foundBackward = true;
	                        assertTrue(dotForward < -0.25, 'Expected backward-lane arrow to point opposite segment direction.');
	                    }
	                    if (dotForward > 0) assertTrue(side > 1e-6, 'Expected forward-lane arrow to render on the right side of the centerline.');
	                    else assertTrue(side < -1e-6, 'Expected backward-lane arrow to render on the left side of the centerline.');
	                }
	                assertTrue(foundForward && foundBackward, 'Expected both forward and backward lane arrows.');
            } finally {
                view.exit();
            }
        });

        test('RoadDebugger: lane arrows correct on diagonal segment (Task 84)', () => {
            const engine = {
                canvas: document.createElement('canvas'),
                camera: new THREE.PerspectiveCamera(55, 1, 0.1, 500),
                scene: new THREE.Scene(),
                clearScene: function() { while (this.scene.children.length) this.scene.remove(this.scene.children[0]); }
            };

            const view = new RoadDebuggerView(engine, { uiEnabled: false });
            view.enter();
            try {
                view.startRoadDraft();
                view.addDraftPointByTile(0, 0);
                view.addDraftPointByTile(2, 2);
                view.finishRoadDraft();
                view.setRenderOptions({ markings: true });

                const derived = view.getDerived();
                const seg = derived?.segments?.[0] ?? null;
                assertTrue(!!seg?.aWorld && !!seg?.bWorld && !!seg?.dir && !!seg?.right, 'Expected derived segment with direction vectors.');

                const mesh = view._arrowMeshes?.[0] ?? null;
                const attr = mesh?.geometry?.getAttribute?.('position') ?? null;
                const positions = attr?.array ?? null;
                assertTrue(Array.isArray(positions) || positions instanceof Float32Array, 'Expected arrow geometry positions.');
                assertTrue((positions.length % (9 * 3)) === 0, 'Expected arrow geometry to be packed as 9 vertices per arrow.');

                const arrowCount = positions.length / (9 * 3);
                assertTrue(arrowCount >= 2, 'Expected at least two lane arrows (forward + backward).');

	                const segMidX = ((Number(seg.aWorld.x) || 0) + (Number(seg.bWorld.x) || 0)) * 0.5;
	                const segMidZ = ((Number(seg.aWorld.z) || 0) + (Number(seg.bWorld.z) || 0)) * 0.5;
	                const dirX = Number(seg.dir.x) || 0;
	                const dirZ = Number(seg.dir.z) || 0;
	                const expectedRightX = -dirZ;
	                const expectedRightZ = dirX;
	                const rightX = Number(seg.right.x) || 0;
	                const rightZ = Number(seg.right.z) || 0;
	                assertTrue((rightX * expectedRightX + rightZ * expectedRightZ) > 0.95, 'Expected segment.right to follow right-hand traffic convention.');

                const readV = (vertexIndex) => {
                    const i = vertexIndex * 3;
                    return { x: Number(positions[i]) || 0, y: Number(positions[i + 1]) || 0, z: Number(positions[i + 2]) || 0 };
                };

                let foundForward = false;
                let foundBackward = false;
	                for (let a = 0; a < arrowCount; a++) {
	                    const base = a * 9;
	                    const tip = readV(base + 6);
	                    let tailX = 0;
	                    let tailZ = 0;
	                    for (let k = 0; k < 6; k++) {
	                        const v = readV(base + k);
	                        tailX += v.x;
	                        tailZ += v.z;
	                    }
	                    const tail = {
	                        x: tailX / 6,
	                        z: tailZ / 6
	                    };

	                    const arrowDirX = tip.x - tail.x;
	                    const arrowDirZ = tip.z - tail.z;
	                    const dotForward = arrowDirX * dirX + arrowDirZ * dirZ;
	
	                    const centerX = (tip.x + tail.x) * 0.5;
	                    const centerZ = (tip.z + tail.z) * 0.5;
	                    const side = (centerX - segMidX) * expectedRightX + (centerZ - segMidZ) * expectedRightZ;
	                    if (dotForward > 0) {
	                        foundForward = true;
	                        assertTrue(dotForward > 0.25, 'Expected forward-lane arrow to point along segment direction.');
	                    } else {
	                        foundBackward = true;
	                        assertTrue(dotForward < -0.25, 'Expected backward-lane arrow to point opposite segment direction.');
	                    }
	                    if (dotForward > 0) assertTrue(side > 1e-6, 'Expected forward-lane arrow to render on the right side of the centerline.');
	                    else assertTrue(side < -1e-6, 'Expected backward-lane arrow to render on the left side of the centerline.');
	                }
	                assertTrue(foundForward && foundBackward, 'Expected both forward and backward lane arrows.');
            } finally {
                view.exit();
            }
        });

        test('RoadDebugger: lane arrows correct on multi-segment road (Task 84)', () => {
            const engine = {
                canvas: document.createElement('canvas'),
                camera: new THREE.PerspectiveCamera(55, 1, 0.1, 500),
                scene: new THREE.Scene(),
                clearScene: function() { while (this.scene.children.length) this.scene.remove(this.scene.children[0]); }
            };

            const view = new RoadDebuggerView(engine, { uiEnabled: false });
            view.enter();
            try {
                view.startRoadDraft();
                view.addDraftPointByTile(0, 0);
                view.addDraftPointByTile(2, 0);
                view.addDraftPointByTile(2, 2);
                view.finishRoadDraft();
                view.setRenderOptions({ markings: true });

                const derived = view.getDerived();
                const segs = derived?.segments ?? [];
                assertTrue(segs.length >= 2, 'Expected at least two segments.');

                const mesh = view._arrowMeshes?.[0] ?? null;
                const attr = mesh?.geometry?.getAttribute?.('position') ?? null;
                const positions = attr?.array ?? null;
                assertTrue(Array.isArray(positions) || positions instanceof Float32Array, 'Expected arrow geometry positions.');
                assertTrue((positions.length % (9 * 3)) === 0, 'Expected arrow geometry to be packed as 9 vertices per arrow.');

                const arrowCount = positions.length / (9 * 3);
                assertTrue(arrowCount >= 4, 'Expected arrows for each segment and direction.');

	                const segInfo = segs.map((seg) => ({
	                    seg,
	                    midX: ((Number(seg.aWorld?.x) || 0) + (Number(seg.bWorld?.x) || 0)) * 0.5,
	                    midZ: ((Number(seg.aWorld?.z) || 0) + (Number(seg.bWorld?.z) || 0)) * 0.5,
	                    dirX: Number(seg.dir?.x) || 0,
	                    dirZ: Number(seg.dir?.z) || 0,
	                    expectedRightX: -(Number(seg.dir?.z) || 0),
	                    expectedRightZ: (Number(seg.dir?.x) || 0),
	                    foundForward: false,
	                    foundBackward: false
	                }));
	
	                for (const info of segInfo) {
	                    const rightX = Number(info.seg?.right?.x) || 0;
	                    const rightZ = Number(info.seg?.right?.z) || 0;
	                    const dot = rightX * info.expectedRightX + rightZ * info.expectedRightZ;
	                    assertTrue(dot > 0.95, 'Expected segment.right to follow right-hand traffic convention.');
	                }

                const readV = (vertexIndex) => {
                    const i = vertexIndex * 3;
                    return { x: Number(positions[i]) || 0, y: Number(positions[i + 1]) || 0, z: Number(positions[i + 2]) || 0 };
                };

	                for (let a = 0; a < arrowCount; a++) {
	                    const base = a * 9;
	                    const tip = readV(base + 6);
	                    let tailX = 0;
	                    let tailZ = 0;
	                    for (let k = 0; k < 6; k++) {
	                        const v = readV(base + k);
	                        tailX += v.x;
	                        tailZ += v.z;
	                    }
	                    const tail = {
	                        x: tailX / 6,
	                        z: tailZ / 6
	                    };
                    const centerX = (tip.x + tail.x) * 0.5;
                    const centerZ = (tip.z + tail.z) * 0.5;

                    let best = 0;
                    let bestDist = Infinity;
                    for (let i = 0; i < segInfo.length; i++) {
                        const dx = centerX - segInfo[i].midX;
                        const dz = centerZ - segInfo[i].midZ;
                        const d2 = dx * dx + dz * dz;
                        if (d2 < bestDist) {
                            bestDist = d2;
                            best = i;
                        }
                    }
                    const info = segInfo[best];

	                    const arrowDirX = tip.x - tail.x;
	                    const arrowDirZ = tip.z - tail.z;
	                    const dotForward = arrowDirX * info.dirX + arrowDirZ * info.dirZ;
	
	                    const side = (centerX - info.midX) * info.expectedRightX + (centerZ - info.midZ) * info.expectedRightZ;
	                    if (dotForward > 0) {
	                        info.foundForward = true;
	                        assertTrue(dotForward > 0.25, 'Expected forward-lane arrow to point along its segment direction.');
	                    } else {
	                        info.foundBackward = true;
	                        assertTrue(dotForward < -0.25, 'Expected backward-lane arrow to point opposite its segment direction.');
	                    }
	                    if (dotForward > 0) assertTrue(side > 1e-6, 'Expected forward-lane arrow to render on the right side of the centerline.');
	                    else assertTrue(side < -1e-6, 'Expected backward-lane arrow to render on the left side of the centerline.');
	                }

                for (const info of segInfo.slice(0, 2)) {
                    assertTrue(info.foundForward && info.foundBackward, 'Expected both forward and backward arrows per segment.');
                }
            } finally {
                view.exit();
            }
        });

        test('RoadDebugger: arrow tangent overlay builds (Task 84)', () => {
            const engine = {
                canvas: document.createElement('canvas'),
                camera: new THREE.PerspectiveCamera(55, 1, 0.1, 500),
                scene: new THREE.Scene(),
                clearScene: function() { while (this.scene.children.length) this.scene.remove(this.scene.children[0]); }
            };

            const view = new RoadDebuggerView(engine, { uiEnabled: false });
            view.enter();
            try {
                view.startRoadDraft();
                view.addDraftPointByTile(0, 0);
                view.addDraftPointByTile(2, 0);
                view.finishRoadDraft();
                view.setRenderOptions({ markings: true });
                view.setArrowTangentDebugEnabled(true);
                assertTrue((view._arrowTangentLines?.length ?? 0) > 0, 'Expected arrow tangent lines to be created when enabled.');
            } finally {
                view.exit();
            }
        });

        test('RoadDebugger: Enter finishes draft like DONE (Task 72)', () => {
            const engine = {
                canvas: document.createElement('canvas'),
                camera: new THREE.PerspectiveCamera(55, 1, 0.1, 500),
                scene: new THREE.Scene(),
                clearScene: function() { while (this.scene.children.length) this.scene.remove(this.scene.children[0]); }
            };

            const view = new RoadDebuggerView(engine, { uiEnabled: false });
            view.enter();
            try {
                view.startRoadDraft();
                view.addDraftPointByTile(0, 0);
                view.addDraftPointByTile(2, 0);

                assertTrue(!!view.getDraftRoad(), 'Expected an active draft before pressing Enter.');
                assertTrue(view.getRoads().length === 0, 'Expected no authored roads before finishing the draft.');

                view._onKeyDown({
                    code: 'Enter',
                    key: 'Enter',
                    target: document.body,
                    ctrlKey: false,
                    metaKey: false,
                    shiftKey: false,
                    preventDefault: () => {},
                    stopImmediatePropagation: () => {}
                });

                assertTrue(!view.getDraftRoad(), 'Expected draft to be completed after pressing Enter.');
                assertTrue(view.getRoads().length === 1, 'Expected the drafted road to be committed.');
            } finally {
                view.exit();
            }
        });

        test('RoadDebugger: Escape during draft does not open exit confirm (Task 72)', () => {
            const engine = {
                canvas: document.createElement('canvas'),
                camera: new THREE.PerspectiveCamera(55, 1, 0.1, 500),
                scene: new THREE.Scene(),
                clearScene: function() { while (this.scene.children.length) this.scene.remove(this.scene.children[0]); }
            };

            const view = new RoadDebuggerView(engine, { uiEnabled: true });
            view.enter();
            try {
                view.startRoadDraft();
                view.addDraftPointByTile(0, 0);

                assertTrue(!!view.getDraftRoad(), 'Expected an active draft before pressing Escape.');

                view._onKeyDown({
                    code: 'Escape',
                    key: 'Escape',
                    target: document.body,
                    ctrlKey: false,
                    metaKey: false,
                    shiftKey: false,
                    preventDefault: () => {},
                    stopImmediatePropagation: () => {}
                });

                assertTrue(!!view.getDraftRoad(), 'Expected draft to remain active when fewer than 2 points exist (DONE would be disabled).');
                assertTrue(view.isExitConfirmOpen() === false, 'Expected exit confirmation to stay closed while drafting.');
            } finally {
                view.exit();
            }
        });

        test('RoadDebugger: Escape opens exit confirm and confirm triggers onExit (Task 72)', () => {
            const engine = {
                canvas: document.createElement('canvas'),
                camera: new THREE.PerspectiveCamera(55, 1, 0.1, 500),
                scene: new THREE.Scene(),
                clearScene: function() { while (this.scene.children.length) this.scene.remove(this.scene.children[0]); }
            };

            const view = new RoadDebuggerView(engine, { uiEnabled: true });
            view.enter();
            try {
                let exited = false;
                view.onExit = () => { exited = true; };

                assertTrue(view.isExitConfirmOpen() === false, 'Expected exit confirmation to be closed initially.');

                view._onKeyDown({
                    code: 'Escape',
                    key: 'Escape',
                    target: document.body,
                    ctrlKey: false,
                    metaKey: false,
                    shiftKey: false,
                    preventDefault: () => {},
                    stopImmediatePropagation: () => {}
                });
                assertTrue(view.isExitConfirmOpen() === true, 'Expected exit confirmation to open after Escape.');
                assertTrue(exited === false, 'Expected onExit to not run until confirmed.');

                view._onKeyDown({
                    code: 'Escape',
                    key: 'Escape',
                    target: document.body,
                    ctrlKey: false,
                    metaKey: false,
                    shiftKey: false,
                    preventDefault: () => {},
                    stopImmediatePropagation: () => {}
                });
                assertTrue(view.isExitConfirmOpen() === false, 'Expected Escape to cancel the exit confirmation.');
                assertTrue(exited === false, 'Expected onExit to remain uncalled after cancel.');

                view._onKeyDown({
                    code: 'Escape',
                    key: 'Escape',
                    target: document.body,
                    ctrlKey: false,
                    metaKey: false,
                    shiftKey: false,
                    preventDefault: () => {},
                    stopImmediatePropagation: () => {}
                });
                assertTrue(view.isExitConfirmOpen() === true, 'Expected exit confirmation to re-open.');

                view.ui?.exitConfirm?.click?.();
                assertTrue(exited === true, 'Expected onExit to be called when confirming exit.');
                assertTrue(view.isExitConfirmOpen() === false, 'Expected exit confirmation to close after confirming.');
            } finally {
                view.exit();
            }
        });

	        test('RoadDebugger: draft preview line shows and clears (Task 72)', () => {
	            const engine = {
	                canvas: document.createElement('canvas'),
	                camera: new THREE.PerspectiveCamera(55, 1, 0.1, 500),
                scene: new THREE.Scene(),
                clearScene: function() { while (this.scene.children.length) this.scene.remove(this.scene.children[0]); }
            };

            const view = new RoadDebuggerView(engine, { uiEnabled: false });
	            view.enter();
	            try {
	                view.startRoadDraft();
	                view.addDraftPointByTile(0, 0);

	                const world = {
	                    x: (Number(view._origin?.x) || 0) + (Number(view._tileSize) || 24) * 0.55,
	                    z: (Number(view._origin?.z) || 0) + (Number(view._tileSize) || 24) * 0.20
	                };

	                assertTrue(view.updateDraftPreviewFromWorld(world) === true, 'Expected preview update to succeed with a 1-point draft.');
	                assertTrue(!!view._draftPreviewLine && view._draftPreviewLine.visible === true, 'Expected draft preview line to be visible.');

	                const res = view._worldToTilePoint(world.x, world.z, { snap: false });
	                const attr = view._draftPreviewLine?.geometry?.getAttribute?.('position') ?? null;
	                const positions = attr?.array ?? null;
	                assertTrue(!!res && !!positions && positions.length >= 6, 'Expected preview geometry positions to exist.');
	                const tileSize = Number(view._tileSize) || 24;
	                const expectedX = (Number(view._origin?.x) || 0) + (Number(res.tileX) || 0) * tileSize;
	                const expectedZ = (Number(view._origin?.z) || 0) + (Number(res.tileY) || 0) * tileSize;
	                assertTrue(Math.abs((positions[3] ?? 0) - expectedX) < 1e-6, 'Expected preview endpoint X to match the hovered tile center.');
	                assertTrue(Math.abs((positions[5] ?? 0) - expectedZ) < 1e-6, 'Expected preview endpoint Z to match the hovered tile center.');

	                view.cancelRoadDraft();
	                assertTrue(view._draftPreviewLine.visible === false, 'Expected preview line to clear on cancel.');
	            } finally {
                view.exit();
            }
        });

        test('RoadDebugger: export schema textarea stays within panel bounds (Task 75)', () => {
            const engine = {
                canvas: document.createElement('canvas'),
                camera: new THREE.PerspectiveCamera(55, 1, 0.1, 500),
                scene: new THREE.Scene(),
                clearScene: function() { while (this.scene.children.length) this.scene.remove(this.scene.children[0]); }
            };

            const view = new RoadDebuggerView(engine, { uiEnabled: true });
            view.enter();
            try {
                view.ui?._onExport?.({ preventDefault: () => {} });

                const panel = view.ui?.schemaModal?.querySelector?.('.road-debugger-schema-panel') ?? null;
                const textarea = view.ui?.schemaTextarea ?? null;
                assertTrue(!!panel && !!textarea, 'Expected export schema panel elements.');

                const panelRect = panel.getBoundingClientRect();
                const textareaRect = textarea.getBoundingClientRect();
                assertTrue(panelRect.left >= -0.5, 'Expected export panel to stay within viewport (left).');
                assertTrue(panelRect.right <= (window.innerWidth + 0.5), 'Expected export panel to stay within viewport (right).');
                assertTrue(textareaRect.left >= (panelRect.left - 0.5), 'Expected textarea to stay within panel (left).');
                assertTrue(textareaRect.right <= (panelRect.right + 0.5), 'Expected textarea to stay within panel (right).');

                textarea.value = 'X'.repeat(2000);
                assertTrue(textarea.scrollWidth > textarea.clientWidth, 'Expected textarea to allow horizontal scrolling for long lines.');
            } finally {
                view.exit();
            }
        });

	        test('RoadDebugger: segment row hover highlights only that segment (Task 78)', () => {
	            const engine = {
	                canvas: document.createElement('canvas'),
	                camera: new THREE.PerspectiveCamera(55, 1, 0.1, 500),
                scene: new THREE.Scene(),
                clearScene: function() { while (this.scene.children.length) this.scene.remove(this.scene.children[0]); }
            };

            const view = new RoadDebuggerView(engine, { uiEnabled: false });
	            view.enter();
	            try {
	                view.startRoadDraft();
	                view.addDraftPointByTile(0, 0);
	                view.addDraftPointByTile(2, 0);
	                view.addDraftPointByTile(2, 2);
	                view.finishRoadDraft();
	                view.setRenderOptions({ edges: true });

	                const segs = view.getDerived()?.segments ?? [];
	                assertTrue(segs.length >= 2, 'Expected multiple derived segments.');
	                const segA = segs[0];
                const segB = segs[1];
                assertTrue(!!segA?.id && !!segB?.id, 'Expected segment ids.');

                view.setHoverSegment(segA.id);

                const hoverHex = 0x34c759;

                const segALines = (view._overlayLines ?? []).filter((line) => line?.userData?.segmentId === segA.id);
                const segBLines = (view._overlayLines ?? []).filter((line) => line?.userData?.segmentId === segB.id);
                assertTrue(segALines.length > 0, 'Expected overlay lines for the hovered segment.');
                assertTrue(segBLines.length > 0, 'Expected overlay lines for the other segment.');

                assertTrue(segALines.every((line) => (line.material?.color?.getHex?.() ?? null) === hoverHex), 'Expected hovered segment lines to use hover highlight color.');
                assertTrue(segBLines.every((line) => (line.material?.color?.getHex?.() ?? null) !== hoverHex), 'Expected other segment lines not to use hover highlight color.');

                const segAPicks = (view._segmentPickMeshes ?? []).filter((mesh) => mesh?.userData?.segmentId === segA.id);
                const segBPicks = (view._segmentPickMeshes ?? []).filter((mesh) => mesh?.userData?.segmentId === segB.id);
                assertTrue(segAPicks.length > 0, 'Expected pick meshes for the hovered segment.');
                assertTrue(segBPicks.length > 0, 'Expected pick meshes for the other segment.');

                assertTrue(segAPicks.every((mesh) => (mesh.material?.color?.getHex?.() ?? null) === hoverHex && (Number(mesh.material?.opacity) || 0) > 0.05), 'Expected hovered segment pick meshes to be visible and highlighted.');
                assertTrue(segBPicks.every((mesh) => (Number(mesh.material?.opacity) || 0) < 0.01), 'Expected other segment pick meshes to remain hidden.');
            } finally {
                view.exit();
            }
        });

	        test('RoadDebugger: lanesB=0 produces one-way overlays (Task 81)', () => {
	            const engine = {
	                canvas: document.createElement('canvas'),
	                camera: new THREE.PerspectiveCamera(55, 1, 0.1, 500),
                scene: new THREE.Scene(),
                clearScene: function() { while (this.scene.children.length) this.scene.remove(this.scene.children[0]); }
            };

            const view = new RoadDebuggerView(engine, { uiEnabled: false });
            view.enter();
            try {
                view.startRoadDraft();
                view.addDraftPointByTile(0, 0);
                view.addDraftPointByTile(2, 0);
                view.finishRoadDraft();

	                const roadId = view.getRoads()?.[0]?.id ?? null;
	                assertTrue(!!roadId, 'Expected road id.');
	                view.setRoadLaneConfig(roadId, { lanesF: 2, lanesB: 0 });
	                assertEqual(view.getRoads()?.[0]?.lanesB, 0, 'Expected lanesB to allow 0 for one-way roads.');
	                view.setRenderOptions({ centerlines: true, edges: true });

	                const derived = view.getDerived();
	                const seg = derived?.segments?.[0] ?? null;
	                assertTrue(!!seg?.id, 'Expected derived segment.');
                const kinds = (derived?.primitives ?? [])
                    .filter((p) => p?.type === 'polyline' && p?.segmentId === seg.id)
                    .map((p) => p.kind);

                assertTrue(kinds.includes('centerline'), 'Expected centerline polyline.');
                assertTrue(kinds.includes('forward_centerline'), 'Expected forward direction centerline polyline.');
                assertTrue(!kinds.includes('backward_centerline'), 'Expected no backward direction centerline when lanesB=0.');
                assertTrue(kinds.includes('lane_edge_right'), 'Expected lane edge on the forward side.');
                assertTrue(!kinds.includes('lane_edge_left'), 'Expected no lane edge on the missing direction side.');

                view.setRenderOptions({ markings: true });
                const derivedAfter = view.getDerived();
                const segAfter = derivedAfter?.segments?.[0] ?? null;
                const mesh = view._arrowMeshes?.[0] ?? null;
                const attr = mesh?.geometry?.getAttribute?.('position') ?? null;
                const positions = attr?.array ?? null;
                assertTrue(!!segAfter?.dir && !!segAfter?.right && !!positions, 'Expected lane arrow mesh and segment basis vectors.');
                assertTrue((positions.length % (9 * 3)) === 0, 'Expected arrow geometry to be packed as 9 vertices per arrow.');

                const arrowCount = positions.length / (9 * 3);
                assertTrue(arrowCount > 0, 'Expected at least one forward lane arrow.');

                const segMidX = ((Number(segAfter.aWorld?.x) || 0) + (Number(segAfter.bWorld?.x) || 0)) * 0.5;
	                const segMidZ = ((Number(segAfter.aWorld?.z) || 0) + (Number(segAfter.bWorld?.z) || 0)) * 0.5;
	                const dirX = Number(segAfter.dir?.x) || 0;
	                const dirZ = Number(segAfter.dir?.z) || 0;
	                const expectedRightX = -dirZ;
	                const expectedRightZ = dirX;
	                const rightX = Number(segAfter.right?.x) || 0;
	                const rightZ = Number(segAfter.right?.z) || 0;
	                assertTrue((rightX * expectedRightX + rightZ * expectedRightZ) > 0.95, 'Expected segment.right to follow right-hand traffic convention.');

                const readV = (vertexIndex) => {
                    const i = vertexIndex * 3;
                    return { x: Number(positions[i]) || 0, y: Number(positions[i + 1]) || 0, z: Number(positions[i + 2]) || 0 };
                };

	                for (let a = 0; a < arrowCount; a++) {
	                    const base = a * 9;
	                    const tip = readV(base + 6);
	                    let tailX = 0;
	                    let tailZ = 0;
	                    for (let k = 0; k < 6; k++) {
	                        const v = readV(base + k);
	                        tailX += v.x;
	                        tailZ += v.z;
	                    }
	                    const tail = {
	                        x: tailX / 6,
	                        z: tailZ / 6
	                    };

                    const arrowDirX = tip.x - tail.x;
                    const arrowDirZ = tip.z - tail.z;
	                    const dotForward = arrowDirX * dirX + arrowDirZ * dirZ;
	                    assertTrue(dotForward > 0.25, 'Expected one-way road arrows to point along segment direction.');
	
	                    const centerX = (tip.x + tail.x) * 0.5;
	                    const centerZ = (tip.z + tail.z) * 0.5;
	                    const side = (centerX - segMidX) * expectedRightX + (centerZ - segMidZ) * expectedRightZ;
	                    assertTrue(side > -1e-6, 'Expected one-way road arrows to only appear on the forward side.');
	                }
	            } finally {
	                view.exit();
            }
        });
    } catch (e) {
        console.log('⏭️  Road Debugger rendering tests skipped:', e.message);
    }

    // ========== Road Debugger Trimming Tests (Task 58) ==========
    try {
        const { computeRoadEngineEdges: rebuildRoadDebuggerPipeline } = await import('/src/app/road_engine/RoadEngineCompute.js');

        const dot2 = (a, b) => (Number(a?.x) || 0) * (Number(b?.x) || 0) + (Number(a?.z) || 0) * (Number(b?.z) || 0);
        const rectAxes = (points) => {
            const pts = Array.isArray(points) ? points : [];
            const axes = [];
            for (let i = 0; i < pts.length; i++) {
                const a = pts[i];
                const b = pts[(i + 1) % pts.length];
                const dx = (Number(b?.x) || 0) - (Number(a?.x) || 0);
                const dz = (Number(b?.z) || 0) - (Number(a?.z) || 0);
                const len = Math.hypot(dx, dz);
                if (!(len > 1e-9)) continue;
                const inv = 1 / len;
                axes.push({ x: dz * inv, z: -dx * inv });
            }
            return axes;
        };
        const project = (points, axis) => {
            const pts = Array.isArray(points) ? points : [];
            let min = Infinity;
            let max = -Infinity;
            for (const p of pts) {
                const t = dot2(p, axis);
                if (t < min) min = t;
                if (t > max) max = t;
            }
            return { min, max };
        };
        const satOverlap = (aPts, bPts, eps = 1e-5) => {
            const axes = [...rectAxes(aPts), ...rectAxes(bPts)];
            for (const axis of axes) {
                const a = project(aPts, axis);
                const b = project(bPts, axis);
                if (a.max <= b.min + eps || b.max <= a.min + eps) return false;
            }
            return true;
        };

        test('RoadDebuggerPipeline: trim output is deterministic', () => {
            const laneWidth = 4.8;
            const roads = [
                {
                    id: 'A',
                    name: 'A',
                    lanesF: 1,
                    lanesB: 1,
                    points: [
                        { id: 'A0', tileX: 0, tileY: 0, offsetX: -12, offsetY: 0, tangentFactor: 1 },
                        { id: 'A1', tileX: 1, tileY: 0, offsetX: 12, offsetY: 0, tangentFactor: 1 }
                    ]
                },
                {
                    id: 'B',
                    name: 'B',
                    lanesF: 1,
                    lanesB: 1,
                    points: [
                        { id: 'B0', tileX: 0, tileY: 0, offsetX: 12, offsetY: -12, tangentFactor: 1 },
                        { id: 'B1', tileX: 0, tileY: 1, offsetX: 12, offsetY: 12, tangentFactor: 1 }
                    ]
                }
            ];

            const settings = {
                origin: { x: 0, z: 0 },
                tileSize: 24,
                laneWidth,
                marginFactor: 0.1,
                trim: { enabled: true, threshold: laneWidth * 0.1, debug: {} }
            };

            const a = rebuildRoadDebuggerPipeline({ roads, settings });
            const b = rebuildRoadDebuggerPipeline({ roads, settings });
            assertEqual(JSON.stringify(a), JSON.stringify(b), 'Expected deterministic rebuild output.');
        });

        test('RoadDebuggerPipeline: kept asphalt pieces do not overlap after trim', () => {
            const laneWidth = 4.8;
            const roads = [
                {
                    id: 'A',
                    name: 'A',
                    lanesF: 1,
                    lanesB: 1,
                    points: [
                        { id: 'A0', tileX: 0, tileY: 0, offsetX: -12, offsetY: 0, tangentFactor: 1 },
                        { id: 'A1', tileX: 1, tileY: 0, offsetX: 12, offsetY: 0, tangentFactor: 1 }
                    ]
                },
                {
                    id: 'B',
                    name: 'B',
                    lanesF: 1,
                    lanesB: 1,
                    points: [
                        { id: 'B0', tileX: 0, tileY: 0, offsetX: 12, offsetY: -12, tangentFactor: 1 },
                        { id: 'B1', tileX: 0, tileY: 1, offsetX: 12, offsetY: 12, tangentFactor: 1 }
                    ]
                }
            ];

            const settings = {
                origin: { x: 0, z: 0 },
                tileSize: 24,
                laneWidth,
                marginFactor: 0.1,
                trim: { enabled: true, threshold: laneWidth * 0.1, debug: {} }
            };

            const out = rebuildRoadDebuggerPipeline({ roads, settings });
            const pieces = [];
            for (const seg of out.segments ?? []) {
                for (const piece of seg?.keptPieces ?? []) {
                    if (!Array.isArray(piece?.corners) || piece.corners.length < 3) continue;
                    pieces.push({ id: piece.id, segmentId: seg.id, corners: piece.corners });
                }
            }

            assertTrue(pieces.length > 0, 'Expected kept pieces.');
            assertTrue((out.trim?.overlaps?.length ?? 0) > 0, 'Expected at least one overlap before trimming.');

            for (let i = 0; i < pieces.length; i++) {
                for (let j = i + 1; j < pieces.length; j++) {
                    const a = pieces[i];
                    const b = pieces[j];
                    if (satOverlap(a.corners, b.corners)) {
                        throw new Error(`Unexpected kept overlap: ${a.id} vs ${b.id}`);
                    }
                }
            }
        });

        test('RoadDebuggerPipeline: trims can split into multiple kept pieces', () => {
            const laneWidth = 4.8;
            const roads = [
                {
                    id: 'main',
                    name: 'Main',
                    lanesF: 1,
                    lanesB: 1,
                    points: [
                        { id: 'm0', tileX: 0, tileY: 0, offsetX: -12, offsetY: 0, tangentFactor: 1 },
                        { id: 'm1', tileX: 4, tileY: 0, offsetX: 12, offsetY: 0, tangentFactor: 1 }
                    ]
                },
                {
                    id: 'cross1',
                    name: 'Cross 1',
                    lanesF: 1,
                    lanesB: 1,
                    points: [
                        { id: 'c10', tileX: 0, tileY: 0, offsetX: 12, offsetY: -12, tangentFactor: 1 },
                        { id: 'c11', tileX: 0, tileY: 1, offsetX: 12, offsetY: 12, tangentFactor: 1 }
                    ]
                },
                {
                    id: 'cross2',
                    name: 'Cross 2',
                    lanesF: 1,
                    lanesB: 1,
                    points: [
                        { id: 'c20', tileX: 2, tileY: 0, offsetX: 12, offsetY: -12, tangentFactor: 1 },
                        { id: 'c21', tileX: 2, tileY: 1, offsetX: 12, offsetY: 12, tangentFactor: 1 }
                    ]
                }
            ];

            const settings = {
                origin: { x: 0, z: 0 },
                tileSize: 24,
                laneWidth,
                marginFactor: 0.1,
                trim: { enabled: true, threshold: laneWidth * 0.1, debug: {} }
            };

            const outA = rebuildRoadDebuggerPipeline({ roads, settings });
            const outB = rebuildRoadDebuggerPipeline({ roads, settings });

            const segA = outA.segments?.find?.((s) => s?.roadId === 'main') ?? null;
            const segB = outB.segments?.find?.((s) => s?.roadId === 'main') ?? null;
            assertTrue(!!segA && !!segB, 'Expected main segment.');

            assertTrue((segA.trimRemoved?.length ?? 0) >= 2, 'Expected at least two removed intervals on the main segment.');
            assertEqual(segA.keptPieces?.length ?? 0, 3, 'Expected main segment to split into 3 kept pieces.');

            const stableA = (segA.keptPieces ?? []).map((p) => ({ t0: p.t0, t1: p.t1, length: p.length }));
            const stableB = (segB.keptPieces ?? []).map((p) => ({ t0: p.t0, t1: p.t1, length: p.length }));
            assertEqual(JSON.stringify(stableA), JSON.stringify(stableB), 'Expected stable split intervals across runs.');
        });

        test('RoadDebuggerPipeline: dropped pieces only render when enabled', () => {
            const laneWidth = 4.8;
            const roads = [
                {
                    id: 'main',
                    name: 'Main',
                    lanesF: 1,
                    lanesB: 1,
                    points: [
                        { id: 'm0', tileX: 0, tileY: 0, offsetX: -12, offsetY: 0, tangentFactor: 1 },
                        { id: 'm1', tileX: 2, tileY: 0, offsetX: 12, offsetY: 0, tangentFactor: 1 }
                    ]
                },
                {
                    id: 'cross1',
                    name: 'Cross 1',
                    lanesF: 1,
                    lanesB: 1,
                    points: [
                        { id: 'c10', tileX: 0, tileY: 0, offsetX: 12, offsetY: -12, tangentFactor: 1 },
                        { id: 'c11', tileX: 0, tileY: 1, offsetX: 12, offsetY: 12, tangentFactor: 1 }
                    ]
                },
                {
                    id: 'cross2',
                    name: 'Cross 2',
                    lanesF: 1,
                    lanesB: 1,
                    points: [
                        { id: 'c20', tileX: 1, tileY: 0, offsetX: 0, offsetY: -12, tangentFactor: 1 },
                        { id: 'c21', tileX: 1, tileY: 1, offsetX: 0, offsetY: 12, tangentFactor: 1 }
                    ]
                }
            ];

            const baseSettings = {
                origin: { x: 0, z: 0 },
                tileSize: 24,
                laneWidth,
                marginFactor: 0.1
            };

            const outNoDbg = rebuildRoadDebuggerPipeline({
                roads,
                settings: { ...baseSettings, trim: { enabled: true, threshold: laneWidth * 0.1, debug: { droppedPieces: false } } }
            });
            const droppedCount = (outNoDbg.segments ?? []).reduce((sum, seg) => sum + (seg?.droppedPieces?.length ?? 0), 0);
            assertTrue(droppedCount > 0, 'Expected at least one dropped piece.');
            assertEqual((outNoDbg.primitives ?? []).filter((p) => p?.type === 'polygon' && p?.kind === 'trim_dropped_piece').length, 0, 'Expected dropped piece primitives to be hidden.');

            const outDbg = rebuildRoadDebuggerPipeline({
                roads,
                settings: { ...baseSettings, trim: { enabled: true, threshold: laneWidth * 0.1, debug: { droppedPieces: true } } }
            });
            assertEqual(
                (outDbg.primitives ?? []).filter((p) => p?.type === 'polygon' && p?.kind === 'trim_dropped_piece').length,
                droppedCount,
                'Expected dropped piece primitives when enabled.'
            );
        });

        test('RoadDebuggerPipeline: removed pieces only render when enabled', () => {
            const laneWidth = 4.8;
            const roads = [
                {
                    id: 'main',
                    name: 'Main',
                    lanesF: 1,
                    lanesB: 1,
                    points: [
                        { id: 'm0', tileX: 0, tileY: 0, offsetX: -12, offsetY: 0, tangentFactor: 1 },
                        { id: 'm1', tileX: 2, tileY: 0, offsetX: 12, offsetY: 0, tangentFactor: 1 }
                    ]
                },
                {
                    id: 'cross1',
                    name: 'Cross 1',
                    lanesF: 1,
                    lanesB: 1,
                    points: [
                        { id: 'c10', tileX: 0, tileY: 0, offsetX: 12, offsetY: -12, tangentFactor: 1 },
                        { id: 'c11', tileX: 0, tileY: 1, offsetX: 12, offsetY: 12, tangentFactor: 1 }
                    ]
                },
                {
                    id: 'cross2',
                    name: 'Cross 2',
                    lanesF: 1,
                    lanesB: 1,
                    points: [
                        { id: 'c20', tileX: 1, tileY: 0, offsetX: 0, offsetY: -12, tangentFactor: 1 },
                        { id: 'c21', tileX: 1, tileY: 1, offsetX: 0, offsetY: 12, tangentFactor: 1 }
                    ]
                }
            ];

            const baseSettings = {
                origin: { x: 0, z: 0 },
                tileSize: 24,
                laneWidth,
                marginFactor: 0.1
            };

            const outNoDbg = rebuildRoadDebuggerPipeline({
                roads,
                settings: { ...baseSettings, trim: { enabled: true, threshold: laneWidth * 0.1, debug: { removedPieces: false } } }
            });
            const removedCount = (outNoDbg.segments ?? []).reduce((sum, seg) => sum + (seg?.trimRemoved?.length ?? 0), 0);
            assertTrue(removedCount > 0, 'Expected at least one removed interval.');
            assertEqual((outNoDbg.primitives ?? []).filter((p) => p?.type === 'polygon' && p?.kind === 'trim_removed_piece').length, 0, 'Expected removed piece primitives to be hidden.');

            const outDbg = rebuildRoadDebuggerPipeline({
                roads,
                settings: { ...baseSettings, trim: { enabled: true, threshold: laneWidth * 0.1, debug: { removedPieces: true } } }
            });
            assertEqual(
                (outDbg.primitives ?? []).filter((p) => p?.type === 'polygon' && p?.kind === 'trim_removed_piece').length,
                removedCount,
                'Expected removed piece primitives when enabled.'
            );
        });
    } catch (e) {
        console.log('⏭️  Road Debugger trimming tests skipped:', e.message);
    }

    // ========== Road Debugger Help UI Tests (Task 59) ==========
    try {
        const { RoadDebuggerView } = await import('/src/graphics/gui/road_debugger/RoadDebuggerView.js');

        test('RoadDebuggerUI: help panel exists and contains key concepts', () => {
            const engine = {
                canvas: document.createElement('canvas'),
                camera: new THREE.PerspectiveCamera(55, 1, 0.1, 500),
                scene: new THREE.Scene(),
                clearScene: function() { while (this.scene.children.length) this.scene.remove(this.scene.children[0]); }
            };

            const view = new RoadDebuggerView(engine, { uiEnabled: true });
            view.enter();
            try {
                const helpBtn = document.querySelector('.road-debugger-help-btn');
                assertTrue(!!helpBtn, 'Expected Help button.');

                const helpModal = document.querySelector('.road-debugger-help-modal');
                assertTrue(!!helpModal, 'Expected Help modal.');

                helpBtn.click();
                assertTrue(helpModal.style.display !== 'none', 'Expected help modal to be visible after open.');

                const text = (helpModal.textContent || '').toLowerCase();
                const terms = [
                    'lane model',
                    'width derivation',
                    'direction centerlines',
                    'tangent factor',
                    'snapping',
                    'crossing threshold',
                    'aabb',
                    'obb',
                    'sat',
                    'sutherland',
                    'removed intervals',
                    't0',
                    't1',
                    'dropped'
                ];
                for (const term of terms) {
                    assertTrue(text.includes(term), `Expected help text to include "${term}".`);
                }

                const rows = Array.from(document.querySelectorAll('.road-debugger-row'));
                const snapRow = rows.find((r) => (r.textContent || '').includes('Snap')) ?? null;
                assertTrue(!!snapRow, 'Expected Snap row.');
                assertTrue((snapRow.title || '').includes('tile/10'), 'Expected Snap tooltip to mention tile/10.');
            } finally {
                view.exit();
            }
        });
    } catch (e) {
        console.log('⏭️  Road Debugger help UI tests skipped:', e.message);
    }

    // ========== Road Debugger Line Visualization Tests (Task 60) ==========
    try {
        const { RoadDebuggerView } = await import('/src/graphics/gui/road_debugger/RoadDebuggerView.js');

	        test('RoadDebugger: divider vs direction centerline toggles are independent', () => {
	            const engine = {
	                canvas: document.createElement('canvas'),
	                camera: new THREE.PerspectiveCamera(55, 1, 0.1, 500),
                scene: new THREE.Scene(),
                clearScene: function() { while (this.scene.children.length) this.scene.remove(this.scene.children[0]); }
            };

            const view = new RoadDebuggerView(engine, { uiEnabled: true });
            view.enter();
            try {
                view.startRoadDraft();
                view.addDraftPointByTile(0, 0);
                view.addDraftPointByTile(2, 0);
                view.finishRoadDraft();

                const findToggle = (labelText) => {
                    const rows = Array.from(document.querySelectorAll('.road-debugger-row'));
                    for (const row of rows) {
                        const label = row.querySelector('.road-debugger-label');
                        if ((label?.textContent || '').trim() !== labelText) continue;
                        return row.querySelector('input[type="checkbox"]');
                    }
                    return null;
	                };

	                const dividerToggle = findToggle('Divider');
	                const directionToggle = findToggle('Direction lines');
	                assertTrue(!!dividerToggle, 'Expected divider toggle.');
	                assertTrue(!!directionToggle, 'Expected direction lines toggle.');

	                const kinds = () => (view.getDerived()?.primitives ?? [])
	                    .filter((p) => p?.type === 'polyline')
	                    .map((p) => p?.kind);

	                assertFalse(kinds().includes('centerline'), 'Expected divider centerline primitives disabled by default.');
	                assertFalse(kinds().includes('forward_centerline'), 'Expected forward direction centerline primitives disabled by default.');
	                assertFalse(kinds().includes('backward_centerline'), 'Expected backward direction centerline primitives disabled by default.');

	                dividerToggle.checked = true;
	                dividerToggle.dispatchEvent(new Event('change', { bubbles: true }));
	                directionToggle.checked = true;
	                directionToggle.dispatchEvent(new Event('change', { bubbles: true }));
	                assertTrue(kinds().includes('centerline'), 'Expected divider centerline primitives after toggle on.');
	                assertTrue(kinds().includes('forward_centerline'), 'Expected forward direction centerline primitives after toggle on.');
	                assertTrue(kinds().includes('backward_centerline'), 'Expected backward direction centerline primitives after toggle on.');

	                dividerToggle.checked = false;
	                dividerToggle.dispatchEvent(new Event('change', { bubbles: true }));
	                assertFalse(kinds().includes('centerline'), 'Expected divider centerline primitives hidden after toggle.');
	                assertTrue(kinds().includes('forward_centerline'), 'Expected direction centerlines to remain visible when divider is hidden.');

	                dividerToggle.checked = true;
	                dividerToggle.dispatchEvent(new Event('change', { bubbles: true }));
	                assertTrue(kinds().includes('centerline'), 'Expected divider centerline primitives visible after re-enable.');
	                assertTrue(kinds().includes('forward_centerline'), 'Expected direction centerlines to remain visible when divider is re-enabled.');

	                directionToggle.checked = false;
	                directionToggle.dispatchEvent(new Event('change', { bubbles: true }));
	                assertFalse(kinds().includes('forward_centerline'), 'Expected forward direction centerline primitives hidden after toggle.');
	                assertFalse(kinds().includes('backward_centerline'), 'Expected backward direction centerline primitives hidden after toggle.');
	            } finally {
	                view.exit();
            }
        });

	        test('RoadDebugger: direction centerlines share a distinct color', () => {
	            const engine = {
	                canvas: document.createElement('canvas'),
	                camera: new THREE.PerspectiveCamera(55, 1, 0.1, 500),
                scene: new THREE.Scene(),
                clearScene: function() { while (this.scene.children.length) this.scene.remove(this.scene.children[0]); }
            };

            const view = new RoadDebuggerView(engine, { uiEnabled: false });
	            view.enter();
	            try {
	                view.startRoadDraft();
	                view.addDraftPointByTile(0, 0);
	                view.addDraftPointByTile(2, 0);
	                view.finishRoadDraft();
	                view.setRenderOptions({ centerlines: true });

	                const matCenter = view._materials?.lineBase?.get?.('centerline') ?? null;
	                const matF = view._materials?.lineBase?.get?.('forward_centerline') ?? null;
	                const matB = view._materials?.lineBase?.get?.('backward_centerline') ?? null;
                assertTrue(!!matCenter && !!matF && !!matB, 'Expected centerline and direction line materials.');

                const c = matCenter.color?.getHex?.() ?? null;
                const f = matF.color?.getHex?.() ?? null;
                const b = matB.color?.getHex?.() ?? null;
                assertTrue(Number.isFinite(c) && Number.isFinite(f) && Number.isFinite(b), 'Expected material colors.');
                assertEqual(f, b, 'Expected forward/back direction centerlines to share the same color.');
                assertFalse(f === c, 'Expected direction centerline color to differ from divider centerline.');
            } finally {
                view.exit();
            }
        });
    } catch (e) {
        console.log('⏭️  Road Debugger line visualization tests skipped:', e.message);
    }

    // ========== Road Debugger First Tile Marker Tests (Task 61) ==========
    try {
        const { RoadDebuggerView } = await import('/src/graphics/gui/road_debugger/RoadDebuggerView.js');

        test('RoadDebugger: first draft point creates tile marker', () => {
            const engine = {
                canvas: document.createElement('canvas'),
                camera: new THREE.PerspectiveCamera(55, 1, 0.1, 500),
                scene: new THREE.Scene(),
                clearScene: function() { while (this.scene.children.length) this.scene.remove(this.scene.children[0]); }
            };

            const view = new RoadDebuggerView(engine, { uiEnabled: false });
            view.enter();
            try {
                view.startRoadDraft();
                assertFalse(view._draftFirstTileMarkerMesh?.visible ?? false, 'Expected marker hidden before first click.');

                view.addDraftPointByTile(3, 4);
                assertTrue(view._draftFirstTileMarkerMesh?.visible === true, 'Expected marker visible after first click.');

                const ox = Number(view._origin?.x) || 0;
                const oz = Number(view._origin?.z) || 0;
                const tileSize = Number(view._tileSize) || 24;
                const marker = view._draftFirstTileMarkerMesh;
                assertNear(marker.position.x, ox + 3 * tileSize, 1e-6, 'Marker X should be centered on the tile.');
                assertNear(marker.position.z, oz + 4 * tileSize, 1e-6, 'Marker Z should be centered on the tile.');

                view.addDraftPointByTile(5, 4);
                assertTrue(view._draftFirstTileMarkerMesh?.visible === true, 'Expected marker to remain visible after additional points.');
            } finally {
                view.exit();
            }
        });

        test('RoadDebugger: cancelling or finishing draft removes tile marker', () => {
            const engine = {
                canvas: document.createElement('canvas'),
                camera: new THREE.PerspectiveCamera(55, 1, 0.1, 500),
                scene: new THREE.Scene(),
                clearScene: function() { while (this.scene.children.length) this.scene.remove(this.scene.children[0]); }
            };

            const view = new RoadDebuggerView(engine, { uiEnabled: false });
            view.enter();
            try {
                view.startRoadDraft();
                view.addDraftPointByTile(1, 1);
                assertTrue(view._draftFirstTileMarkerMesh?.visible === true, 'Expected marker visible after first click.');
                view.cancelRoadDraft();
                assertFalse(view._draftFirstTileMarkerMesh?.visible ?? false, 'Expected marker hidden after cancel.');

                view.startRoadDraft();
                view.addDraftPointByTile(2, 2);
                view.addDraftPointByTile(3, 2);
                assertTrue(view._draftFirstTileMarkerMesh?.visible === true, 'Expected marker visible before done.');
                view.finishRoadDraft();
                assertFalse(view._draftFirstTileMarkerMesh?.visible ?? false, 'Expected marker hidden after done.');
            } finally {
                view.exit();
            }
        });
    } catch (e) {
        console.log('⏭️  Road Debugger first tile marker tests skipped:', e.message);
    }

    // ========== Road Debugger Hover/Selection Sync Tests (Task 62) ==========
    try {
        const { RoadDebuggerView } = await import('/src/graphics/gui/road_debugger/RoadDebuggerView.js');

        test('RoadDebugger: table hover/selection syncs to viewport state', () => {
            const engine = {
                canvas: document.createElement('canvas'),
                camera: new THREE.PerspectiveCamera(55, 1, 0.1, 500),
                scene: new THREE.Scene(),
                clearScene: function() { while (this.scene.children.length) this.scene.remove(this.scene.children[0]); }
            };

            const view = new RoadDebuggerView(engine, { uiEnabled: true });
            view.enter();
            try {
                view.startRoadDraft();
                view.addDraftPointByTile(0, 0);
                view.addDraftPointByTile(2, 0);
                view.finishRoadDraft();

                const roadId = view.getRoads()[0].id;
                const roadRow = document.querySelector(`.road-debugger-road-row[data-road-id="${roadId}"]`);
                assertTrue(!!roadRow, 'Expected road row.');

                roadRow.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
                assertEqual(view._hover?.roadId, roadId, 'Expected hover roadId from table hover.');
                assertEqual(view._hover?.segmentId, null, 'Expected no hovered segment when hovering road row.');

	                roadRow.dispatchEvent(new MouseEvent('click', { bubbles: true }));
	                assertEqual(view._selection?.type, 'road', 'Expected selection type road from table click.');
	                assertEqual(view._selection?.roadId, roadId, 'Expected selected roadId from table click.');

	                const segId = view.getDerived()?.segments?.[0]?.id ?? null;
	                assertTrue(!!segId, 'Expected derived segment id.');
	                const segRow = document.querySelector(`.road-debugger-seg-row[data-segment-id="${segId}"]`);
	                assertTrue(!!segRow, 'Expected segment row in detail panel.');

                segRow.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
                assertEqual(view._hover?.segmentId, segId, 'Expected hovered segmentId from table hover.');
                segRow.dispatchEvent(new MouseEvent('click', { bubbles: true }));
                assertEqual(view._selection?.type, 'segment', 'Expected selection type segment from table click.');
                assertEqual(view._selection?.segmentId, segId, 'Expected selected segmentId from table click.');
            } finally {
                view.exit();
            }
        });

	        test('RoadDebugger: viewport hover/selection syncs to table highlight', () => {
            const engine = {
                canvas: document.createElement('canvas'),
                camera: new THREE.PerspectiveCamera(55, 1, 0.1, 500),
                scene: new THREE.Scene(),
                clearScene: function() { while (this.scene.children.length) this.scene.remove(this.scene.children[0]); }
            };

            const view = new RoadDebuggerView(engine, { uiEnabled: true });
            view.enter();
            try {
                view.startRoadDraft();
                view.addDraftPointByTile(0, 0);
                view.addDraftPointByTile(3, 0);
                view.finishRoadDraft();

	                const roadId = view.getRoads()[0].id;
	                const segId = view.getDerived()?.segments?.[0]?.id ?? null;
	                assertTrue(!!segId, 'Expected derived segment id.');

	                const roadRow = document.querySelector(`.road-debugger-road-row[data-road-id="${roadId}"]`);
	                assertTrue(!!roadRow, 'Expected road row.');
	                roadRow.dispatchEvent(new MouseEvent('click', { bubbles: true }));
	                assertTrue(roadRow.classList.contains('is-selected'), 'Expected road row selected class after selection.');

	                view.setHoverSegment(segId);
	                let segRow = document.querySelector(`.road-debugger-seg-row[data-segment-id="${segId}"]`);
	                assertTrue(!!segRow, 'Expected segment row in detail panel.');
	                assertTrue(segRow.classList.contains('is-hovered'), 'Expected segment row hovered class from viewport hover.');

	                view.selectSegment(segId);
	                assertTrue(roadRow.classList.contains('is-selected'), 'Expected road row selected class from viewport selection.');
	                segRow = document.querySelector(`.road-debugger-seg-row[data-segment-id="${segId}"]`);
	                assertTrue(!!segRow, 'Expected segment row in detail panel.');
	                assertTrue(segRow.classList.contains('is-selected'), 'Expected segment row selected class from viewport selection.');
	            } finally {
	                view.exit();
	            }
	        });
    } catch (e) {
        console.log('⏭️  Road Debugger hover/selection sync tests skipped:', e.message);
    }

    // ========== Road Debugger Table Delete/Visibility Tests (Task 63) ==========
    try {
        const { RoadDebuggerView } = await import('/src/graphics/gui/road_debugger/RoadDebuggerView.js');

	        test('RoadDebugger: road row is single-line and supports delete', () => {
            const engine = {
                canvas: document.createElement('canvas'),
                camera: new THREE.PerspectiveCamera(55, 1, 0.1, 500),
                scene: new THREE.Scene(),
                clearScene: function() { while (this.scene.children.length) this.scene.remove(this.scene.children[0]); }
            };

            const view = new RoadDebuggerView(engine, { uiEnabled: true });
            view.enter();
            try {
                view.startRoadDraft();
                view.addDraftPointByTile(0, 0);
                view.addDraftPointByTile(2, 0);
                view.finishRoadDraft();

                view.startRoadDraft();
                view.addDraftPointByTile(0, 2);
                view.addDraftPointByTile(2, 2);
                view.finishRoadDraft();

                const roads = view.getRoads();
                assertEqual(roads.length, 2, 'Expected 2 roads before delete.');
                const roadId = roads[0].id;

	                const roadRow = document.querySelector(`.road-debugger-road-row[data-road-id="${roadId}"]`);
	                assertTrue(!!roadRow, 'Expected road row.');
	                assertTrue(roadRow.classList.contains('road-debugger-road-row-single'), 'Expected single-line road row class.');

	                roadRow.dispatchEvent(new MouseEvent('click', { bubbles: true }));
	                const editor = document.querySelector('.road-debugger-editor');
	                assertTrue(!!editor, 'Expected bottom editor panel.');
	                const del = editor.querySelector('.road-debugger-editor-delete');
	                assertTrue(!!del && del.style.display !== 'none', 'Expected delete button.');
	                del.dispatchEvent(new MouseEvent('click', { bubbles: true }));

	                assertEqual(view.getRoads().length, 1, 'Expected road count to decrease after delete.');
	                assertFalse(!!document.querySelector(`.road-debugger-road-row[data-road-id="${roadId}"]`), 'Expected deleted road row to be removed.');
            } finally {
                view.exit();
            }
        });

	        test('RoadDebugger: delete is available when selecting a segment in the viewport', () => {
	            const engine = {
	                canvas: document.createElement('canvas'),
	                camera: new THREE.PerspectiveCamera(55, 1, 0.1, 500),
	                scene: new THREE.Scene(),
	                clearScene: function() { while (this.scene.children.length) this.scene.remove(this.scene.children[0]); }
	            };

	            const view = new RoadDebuggerView(engine, { uiEnabled: true });
	            view.enter();
	            try {
	                view.startRoadDraft();
	                view.addDraftPointByTile(0, 0);
	                view.addDraftPointByTile(2, 0);
	                view.finishRoadDraft();

	                const roadId = view.getRoads()?.[0]?.id ?? null;
	                const segId = view.getDerived()?.segments?.[0]?.id ?? null;
	                assertTrue(!!roadId, 'Expected road id.');
	                assertTrue(!!segId, 'Expected derived segment id.');

	                view.selectSegment(segId);
	                assertEqual(view._selection?.type ?? null, 'segment', 'Expected segment selection after viewport pick.');

	                const editor = document.querySelector('.road-debugger-editor');
	                assertTrue(!!editor, 'Expected bottom editor panel.');
	                const del = editor.querySelector('.road-debugger-editor-delete');
	                assertTrue(!!del && del.style.display !== 'none', 'Expected delete button when a segment is selected.');

	                del.dispatchEvent(new MouseEvent('click', { bubbles: true }));

	                assertEqual(view.getRoads().length, 0, 'Expected road to be deleted from segment selection.');
	                assertFalse(!!document.querySelector(`.road-debugger-road-row[data-road-id="${roadId}"]`), 'Expected deleted road row to be removed.');
	            } finally {
	                view.exit();
	            }
	        });

	        test('RoadDebugger: visibility toggle hides rendering but keeps derived geometry stable', () => {
            const engine = {
                canvas: document.createElement('canvas'),
                camera: new THREE.PerspectiveCamera(55, 1, 0.1, 500),
                scene: new THREE.Scene(),
                clearScene: function() { while (this.scene.children.length) this.scene.remove(this.scene.children[0]); }
            };

            const view = new RoadDebuggerView(engine, { uiEnabled: true });
            view.enter();
            try {
                view.startRoadDraft();
                view.addDraftPointByTile(0, 0);
                view.addDraftPointByTile(3, 0);
                view.finishRoadDraft();

                view.startRoadDraft();
                view.addDraftPointByTile(0, 1);
                view.addDraftPointByTile(3, 1);
                view.finishRoadDraft();

                const roads = view.getRoads();
                const hideId = roads[0].id;
                const keepId = roads[1].id;

                const before = JSON.stringify(view.getDerived());
                const beforeHiddenAsphalt = (view._asphaltMeshes ?? []).filter((m) => m?.userData?.roadId === hideId).length;
	                const beforeKeepAsphalt = (view._asphaltMeshes ?? []).filter((m) => m?.userData?.roadId === keepId).length;
	                assertTrue(beforeHiddenAsphalt > 0, 'Expected asphalt meshes for road to hide.');
	                assertTrue(beforeKeepAsphalt > 0, 'Expected asphalt meshes for road to keep.');

	                const hideRow = document.querySelector(`.road-debugger-road-row[data-road-id="${hideId}"]`);
	                assertTrue(!!hideRow, 'Expected road row for visibility toggle.');
	                hideRow.dispatchEvent(new MouseEvent('click', { bubbles: true }));
	                const editor = document.querySelector('.road-debugger-editor');
	                assertTrue(!!editor, 'Expected bottom editor panel.');
	                const visibleField = Array.from(editor.querySelectorAll('.road-debugger-editor-field')).find((row) => (row.querySelector('.road-debugger-editor-field-label')?.textContent || '').trim() === 'visible') ?? null;
	                const vis = visibleField?.querySelector?.('input[type="checkbox"]') ?? null;
	                assertTrue(!!vis, 'Expected visibility checkbox.');
	                vis.checked = false;
	                vis.dispatchEvent(new Event('change', { bubbles: true }));

                assertEqual(JSON.stringify(view.getDerived()), before, 'Expected derived output to be unchanged after visibility toggle.');

                const afterHiddenAsphalt = (view._asphaltMeshes ?? []).filter((m) => m?.userData?.roadId === hideId).length;
                const afterKeepAsphalt = (view._asphaltMeshes ?? []).filter((m) => m?.userData?.roadId === keepId).length;
                assertEqual(afterHiddenAsphalt, 0, 'Expected hidden road to have no rendered asphalt meshes.');
                assertTrue(afterKeepAsphalt > 0, 'Expected visible road to keep rendered asphalt meshes.');
            } finally {
                view.exit();
            }
        });
    } catch (e) {
        console.log('⏭️  Road Debugger table delete/visibility tests skipped:', e.message);
    }

    // ========== Road Debugger Info Panel Tests (Task 64) ==========
    try {
        const { RoadDebuggerView } = await import('/src/graphics/gui/road_debugger/RoadDebuggerView.js');

        test('RoadDebuggerUI: info panel exists and updates with hover/selection', () => {
            const engine = {
                canvas: document.createElement('canvas'),
                camera: new THREE.PerspectiveCamera(55, 1, 0.1, 500),
                scene: new THREE.Scene(),
                clearScene: function() { while (this.scene.children.length) this.scene.remove(this.scene.children[0]); }
            };

            const view = new RoadDebuggerView(engine, { uiEnabled: true });
            view.enter();
            try {
                const panel = document.querySelector('.road-debugger-info-panel');
                assertTrue(!!panel, 'Expected bottom-right info panel.');
                const title = panel.querySelector('.road-debugger-info-title');
                const body = panel.querySelector('.road-debugger-info-body');
                assertTrue(!!title && !!body, 'Expected info panel title/body.');
                assertEqual((body.textContent || '').trim(), '—', 'Expected placeholder info when nothing is hovered.');

                view.startRoadDraft();
                view.addDraftPointByTile(0, 0);
                view.addDraftPointByTile(2, 0);
                view.finishRoadDraft();

                const roadId = view.getRoads()[0].id;
                const roadName = view.getRoads()[0].name;
                const segId = view.getDerived().segments[0].id;

                view.setHoverRoad(roadId);
                assertTrue((title.textContent || '').includes('Hover'), 'Expected info panel title to indicate hover panel.');
                assertTrue((body.textContent || '').includes(`road: ${roadName}`), 'Expected hovered road name in info body.');

                view.selectSegment(segId);
                assertTrue((body.textContent || '').includes(`road: ${roadName}`), 'Expected hovered info to remain after selection changes.');
                assertFalse((body.textContent || '').includes(`segment: ${segId}`), 'Expected selection info to not be shown in hover panel.');
            } finally {
                view.exit();
            }
        });

        test('RoadDebuggerUI: hover panel does not include selection details', () => {
            const engine = {
                canvas: document.createElement('canvas'),
                camera: new THREE.PerspectiveCamera(55, 1, 0.1, 500),
                scene: new THREE.Scene(),
                clearScene: function() { while (this.scene.children.length) this.scene.remove(this.scene.children[0]); }
            };

            const view = new RoadDebuggerView(engine, { uiEnabled: true });
            view.enter();
            try {
                view.startRoadDraft();
                view.addDraftPointByTile(0, 0);
                view.addDraftPointByTile(2, 0);
                view.finishRoadDraft();

                view.startRoadDraft();
                view.addDraftPointByTile(0, 1);
                view.addDraftPointByTile(2, 1);
                view.finishRoadDraft();

                const roads = view.getRoads();
                assertTrue(roads.length >= 2, 'Expected at least two roads for override test.');
                const hoverId = roads[0].id;
                const selectedId = roads[1].id;
                const hoverName = roads[0].name;
                const selectedName = roads[1].name;

                const panel = document.querySelector('.road-debugger-info-panel');
                const title = panel?.querySelector?.('.road-debugger-info-title') ?? null;
                const body = panel?.querySelector?.('.road-debugger-info-body') ?? null;
                assertTrue(!!panel && !!title && !!body, 'Expected info panel elements.');

                view.setHoverRoad(hoverId);
                assertTrue((body.textContent || '').includes(hoverName), 'Expected hovered road name in hover panel.');
                assertFalse((body.textContent || '').includes(selectedName), 'Expected selection to not appear in hover panel.');

                view.selectRoad(selectedId);
                view.setHoverRoad(hoverId);
                assertTrue((title.textContent || '').includes('Hover'), 'Expected info panel title to indicate hover panel.');
                assertTrue((body.textContent || '').includes(hoverName), 'Expected hover panel to continue reflecting hover target.');
                assertFalse((body.textContent || '').includes(selectedName), 'Expected selection to not appear in hover panel.');
            } finally {
                view.exit();
            }
        });
    } catch (e) {
        console.log('⏭️  Road Debugger info panel tests skipped:', e.message);
    }

    // ========== Road Debugger Camera Controls Tests (Task 65) ==========
    try {
        const { RoadDebuggerView } = await import('/src/graphics/gui/road_debugger/RoadDebuggerView.js');
        const { ROAD_DEBUGGER_WHEEL_ZOOM_DIVISOR } = await import('/src/graphics/gui/road_debugger/RoadDebuggerInput.js');

        test('RoadDebuggerInput: wheel zoom divisor is configured for faster zoom', () => {
            assertTrue(Number.isFinite(ROAD_DEBUGGER_WHEEL_ZOOM_DIVISOR), 'Expected wheel zoom divisor to be a number.');
            assertTrue(ROAD_DEBUGGER_WHEEL_ZOOM_DIVISOR < 12000, 'Expected wheel zoom divisor to be faster than legacy 12000.');
        });

        test('RoadDebuggerUI: orbit widget removed and RMB orbit updates camera', () => {
            const engine = {
                canvas: document.createElement('canvas'),
                camera: new THREE.PerspectiveCamera(55, 1, 0.1, 500),
                scene: new THREE.Scene(),
                clearScene: function() { while (this.scene.children.length) this.scene.remove(this.scene.children[0]); }
            };

            engine.canvas.width = 800;
            engine.canvas.height = 600;
            engine.canvas.style.width = '800px';
            engine.canvas.style.height = '600px';
            engine.canvas.style.position = 'fixed';
            engine.canvas.style.left = '0px';
            engine.canvas.style.top = '0px';
            engine.canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600 });
            document.body.appendChild(engine.canvas);

            const view = new RoadDebuggerView(engine, { uiEnabled: true });
            view.enter();
            try {
                const surface = document.querySelector('.road-debugger-orbit-surface');
                assertEqual(surface, null, 'Expected orbit widget surface to be removed.');
                assertTrue(typeof PointerEvent !== 'undefined', 'Expected PointerEvent support for orbit widget test.');

                const before = view.camera.position.clone();
                engine.canvas.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 2, clientX: 380, clientY: 300, pointerId: 1 }));
                engine.canvas.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, button: 2, clientX: 420, clientY: 340, pointerId: 1 }));
                engine.canvas.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 2, clientX: 420, clientY: 340, pointerId: 1 }));
                view.controls?.update?.(1 / 60);
                const after = view.camera.position.clone();

                assertTrue(after.distanceTo(before) > 1e-6, 'Expected RMB orbit to update camera position.');
            } finally {
                view.exit();
                engine.canvas.remove();
            }
        });
    } catch (e) {
        console.log('⏭️  Road Debugger camera controls tests skipped:', e.message);
    }

	    // ========== Road Debugger Pan Stability Tests (Task 66) ==========
	    try {
	        const { RoadDebuggerView } = await import('/src/graphics/gui/road_debugger/RoadDebuggerView.js');

	        test('RoadDebuggerInput: mouse pan is deterministic for a synthetic pointer sequence', () => {
	            assertTrue(typeof PointerEvent !== 'undefined', 'Expected PointerEvent support for pan test.');

            const run = () => {
                const canvas = document.createElement('canvas');
                canvas.width = 200;
                canvas.height = 200;
                canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 200 });

                const engine = {
                    canvas,
                    camera: new THREE.PerspectiveCamera(55, 1, 0.1, 500),
                    scene: new THREE.Scene(),
                    clearScene: function() { while (this.scene.children.length) this.scene.remove(this.scene.children[0]); }
                };

	                const view = new RoadDebuggerView(engine, { uiEnabled: false });
	                view.enter();
	                try {
                        view.controls.enableDamping = false;
	                    const start = view.camera.position.clone();
	                    canvas.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 1, clientX: 100, clientY: 100, pointerId: 1 }));
	                    canvas.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 120, clientY: 100, pointerId: 1 }));
	                    canvas.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: 120, clientY: 100, pointerId: 1 }));
                        view.controls.update(1 / 60);
	                    const after = view.camera.position.clone();
	                    return { start, after };
	                } finally {
	                    view.exit();
                }
            };

            const a = run();
            const b = run();
            assertTrue(a.after.distanceTo(a.start) > 1e-6, 'Expected pan to move the camera.');
            assertNear(a.after.x, b.after.x, 1e-6, 'Pan X should be deterministic.');
            assertNear(a.after.y, b.after.y, 1e-6, 'Pan Y should be deterministic.');
            assertNear(a.after.z, b.after.z, 1e-6, 'Pan Z should be deterministic.');
        });

	        test('RoadDebuggerInput: mouse pan applies no extra delta when pointer does not move', () => {
            const canvas = document.createElement('canvas');
            canvas.width = 200;
            canvas.height = 200;
            canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 200 });

            const engine = {
                canvas,
                camera: new THREE.PerspectiveCamera(55, 1, 0.1, 500),
                scene: new THREE.Scene(),
                clearScene: function() { while (this.scene.children.length) this.scene.remove(this.scene.children[0]); }
            };

	            const view = new RoadDebuggerView(engine, { uiEnabled: false });
	            view.enter();
	            try {
                    view.controls.enableDamping = false;
	                canvas.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 1, clientX: 100, clientY: 100, pointerId: 1 }));
	                canvas.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 120, clientY: 100, pointerId: 1 }));
	                canvas.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: 120, clientY: 100, pointerId: 1 }));
                    view.controls.update(1 / 60);
	                const after = view.camera.position.clone();
                    canvas.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 1, clientX: 120, clientY: 100, pointerId: 1 }));
                    canvas.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 120, clientY: 100, pointerId: 1 }));
                    canvas.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: 120, clientY: 100, pointerId: 1 }));
                    view.controls.update(1 / 60);
	                const after2 = view.camera.position.clone();
	                assertTrue(after2.distanceTo(after) < 1e-6, 'Expected no camera movement when pointer stays still.');
	            } finally {
	                view.exit();
            }
        });
    } catch (e) {
        console.log('⏭️  Road Debugger pan stability tests skipped:', e.message);
    }

    // ========== Rapier Debugger Renderer State Tests ==========
    try {
        const { RapierDebuggerScene } = await import('/src/graphics/gui/rapier_debugger/RapierDebuggerScene.js');

        test('RapierDebuggerScene: restores renderer localClippingEnabled on dispose', () => {
            const engine = {
                canvas: document.createElement('canvas'),
                camera: new THREE.PerspectiveCamera(55, 1, 0.1, 500),
                scene: new THREE.Scene(),
                renderer: {
                    localClippingEnabled: false,
                    getSize: (out) => {
                        out.set(800, 600);
                        return out;
                    }
                }
            };

            const scene = new RapierDebuggerScene(engine);
            scene.enter();
            assertTrue(engine.renderer.localClippingEnabled === true, 'Expected Rapier debugger to enable local clipping.');
            scene.dispose();
            assertTrue(engine.renderer.localClippingEnabled === false, 'Expected Rapier debugger to restore local clipping state.');
        });

        test('RapierDebuggerScene: restores scene fog/background on dispose', () => {
            const engine = {
                canvas: document.createElement('canvas'),
                camera: new THREE.PerspectiveCamera(55, 1, 0.1, 500),
                scene: new THREE.Scene(),
                renderer: {
                    localClippingEnabled: false,
                    getSize: (out) => {
                        out.set(800, 600);
                        return out;
                    }
                }
            };

            engine.scene.background = null;
            engine.scene.fog = null;

            const scene = new RapierDebuggerScene(engine);
            scene.enter();
            assertTrue(!!engine.scene.background, 'Expected Rapier debugger to set scene background.');
            assertTrue(!!engine.scene.fog, 'Expected Rapier debugger to set scene fog.');
            scene.dispose();
            assertEqual(engine.scene.background, null, 'Expected Rapier debugger to restore scene background.');
            assertEqual(engine.scene.fog, null, 'Expected Rapier debugger to restore scene fog.');
        });
    } catch (e) {
        console.log('⏭️  Rapier Debugger renderer state tests skipped:', e.message);
    }

    // ========== Road Debugger Tile Offset Normalization Tests (Task 68) ==========
    try {
        const { normalizeRoadDebuggerTileOffsetBoundary } = await import('/src/app/road_debugger/RoadDebuggerTileOffset.js');
        const { RoadDebuggerView } = await import('/src/graphics/gui/road_debugger/RoadDebuggerView.js');

	        test('RoadDebuggerTileOffset: +half boundary normalizes to next tile -half (both axes)', () => {
	            const tileSize = 24;
	            const half = 0.5;

	            const x = normalizeRoadDebuggerTileOffsetBoundary({ tileX: 7, tileY: 8, offsetU: half, offsetV: 0 }, { tileSize });
	            assertEqual(x.tileX, 8, 'tileX should increment when offsetU is +half.');
	            assertNear(x.offsetU, -half, 1e-9, 'offsetU should normalize to -half.');

	            const y = normalizeRoadDebuggerTileOffsetBoundary({ tileX: 7, tileY: 8, offsetU: 0, offsetV: half }, { tileSize });
	            assertEqual(y.tileY, 9, 'tileY should increment when offsetV is +half.');
	            assertNear(y.offsetV, -half, 1e-9, 'offsetV should normalize to -half.');
	        });

	        test('RoadDebuggerTileOffset: boundary-equivalent representations normalize deterministically', () => {
	            const tileSize = 24;
	            const half = 0.5;

	            const a = normalizeRoadDebuggerTileOffsetBoundary({ tileX: 7, tileY: 8, offsetU: 0, offsetV: half }, { tileSize });
	            const b = normalizeRoadDebuggerTileOffsetBoundary({ tileX: 7, tileY: 9, offsetU: 0, offsetV: -half }, { tileSize });
	            assertEqual(JSON.stringify(a), JSON.stringify(b), 'Expected boundary-equivalent points to normalize identically.');
	        });

	        test('RoadDebuggerView: snapping to +half boundary returns canonical next-tile -half', () => {
            const engine = {
                canvas: document.createElement('canvas'),
                camera: new THREE.PerspectiveCamera(55, 1, 0.1, 500),
                scene: new THREE.Scene(),
                clearScene: function() { while (this.scene.children.length) this.scene.remove(this.scene.children[0]); }
            };

            const view = new RoadDebuggerView(engine, { uiEnabled: false });
            view.enter();
	            try {
	                const tileSize = Number(view._tileSize) || 24;
	                const half = 0.5;
	                const step = tileSize / 10;
	                const ox = Number(view._origin?.x) || 0;
	                const oz = Number(view._origin?.z) || 0;

                const tileX = 5;
                const tileY = 5;
	                const worldX = ox + tileX * tileSize + half * tileSize - step * 0.25;
	                const worldZ = oz + tileY * tileSize;
	                const res = view._worldToTilePoint(worldX, worldZ, { snap: true });

	                assertEqual(res.tileX, tileX + 1, 'Expected snap to normalize to the next tile.');
	                assertNear(res.offsetU, -half, 1e-6, 'Expected snap to normalize to -half.');
	                assertEqual(res.tileY, tileY, 'Expected Y tile to remain unchanged.');
	            } finally {
	                view.exit();
	            }
        });
    } catch (e) {
        console.log('⏭️  Road Debugger tile offset normalization tests skipped:', e.message);
    }

    // ========== Road Debugger Hover Cube Gizmo Tests (Task 69) ==========
    try {
        const { RoadDebuggerView } = await import('/src/graphics/gui/road_debugger/RoadDebuggerView.js');

        test('RoadDebugger: hover cube gizmo shows for hovered and selected point (Task 90)', () => {
            const engine = {
                canvas: document.createElement('canvas'),
                camera: new THREE.PerspectiveCamera(55, 1, 0.1, 500),
                scene: new THREE.Scene(),
                clearScene: function() { while (this.scene.children.length) this.scene.remove(this.scene.children[0]); }
            };

            const view = new RoadDebuggerView(engine, { uiEnabled: false });
            view.enter();
            try {
                view.startRoadDraft();
                view.addDraftPointByTile(0, 0);
                view.addDraftPointByTile(2, 0);
                view.finishRoadDraft();

                const roadId = view.getRoads()[0].id;
                const derivedRoad = view.getDerived()?.roads?.find?.((r) => r?.id === roadId) ?? null;
                const pointId = derivedRoad?.points?.[0]?.id ?? null;
                assertTrue(!!pointId, 'Expected derived point id.');

                view.setHoverPoint(roadId, pointId);
                assertTrue(view._hoverCubeMesh?.visible === true, 'Expected hover cube visible when hovering point.');
                assertEqual(view._hoverCubeMesh?.material?.color?.getHex?.(), 0x3b82f6, 'Expected hover cube to be blue.');

                const control = (view._controlPointMeshes ?? []).find((m) => m?.userData?.roadId === roadId && m?.userData?.pointId === pointId) ?? null;
                assertTrue(!!control, 'Expected control point mesh.');
                assertNear(view._hoverCubeMesh.position.x, control.position.x, 1e-6, 'Hover cube X should match control point.');
                assertNear(view._hoverCubeMesh.position.z, control.position.z, 1e-6, 'Hover cube Z should match control point.');

                view.clearHover();
                assertFalse(view._hoverCubeMesh?.visible ?? false, 'Expected hover cube hidden after clearing hover.');

                view.selectPoint(roadId, pointId);
                assertTrue(view._hoverCubeMesh?.visible === true, 'Expected hover cube visible when a point is selected.');

                view.clearSelection();
                assertFalse(view._hoverCubeMesh?.visible ?? false, 'Expected hover cube hidden after clearing selection.');
            } finally {
                view.exit();
            }
        });

        test('RoadDebuggerUI: point row hover/select keeps hover cube visible (Task 90)', () => {
            const engine = {
                canvas: document.createElement('canvas'),
                camera: new THREE.PerspectiveCamera(55, 1, 0.1, 500),
                scene: new THREE.Scene(),
                clearScene: function() { while (this.scene.children.length) this.scene.remove(this.scene.children[0]); }
            };

            const view = new RoadDebuggerView(engine, { uiEnabled: true });
            view.enter();
            try {
                view.startRoadDraft();
                view.addDraftPointByTile(0, 0);
                view.addDraftPointByTile(2, 0);
                view.finishRoadDraft();

                assertTrue(!view.ui?.hoverCubeToggle, 'Expected no hover cube toggle in UI.');

	                const roadId = view.getRoads()[0].id;
	                const roadRow = document.querySelector(`.road-debugger-road-row[data-road-id="${roadId}"]`);
	                assertTrue(!!roadRow, 'Expected road row.');
	                roadRow.dispatchEvent(new MouseEvent('click', { bubbles: true }));

	                const derivedRoad = view.getDerived()?.roads?.find?.((r) => r?.id === roadId) ?? null;
	                const pointId = derivedRoad?.points?.[0]?.id ?? null;
	                assertTrue(!!pointId, 'Expected derived point id.');

	                const pointRow = document.querySelector(`.road-debugger-point-row[data-road-id="${roadId}"][data-point-id="${pointId}"]`);
	                assertTrue(!!pointRow, 'Expected point row in detail panel.');
                pointRow.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
                assertEqual(view._hover?.pointId, pointId, 'Expected hovered pointId from table hover.');
                assertTrue(view._hoverCubeMesh?.visible === true, 'Expected hover cube visible after point row hover.');

                pointRow.dispatchEvent(new MouseEvent('click', { bubbles: true }));
                assertEqual(view._selection?.type, 'point', 'Expected click to select point.');

                pointRow.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
                assertFalse(!!view._hover?.pointId, 'Expected hover pointId to clear on leave.');
                assertTrue(view._hoverCubeMesh?.visible === true, 'Expected hover cube to remain visible for selected point.');
            } finally {
                view.exit();
            }
        });
    } catch (e) {
        console.log('⏭️  Road Debugger hover cube gizmo tests skipped:', e.message);
    }

    // ========== Scene Shortcut Tests ==========
    const { getSceneShortcutByKey, getSceneShortcutById } = await import('/src/states/SceneShortcutRegistry.js');

    test('SceneShortcutRegistry: key 6 maps to Inspector Room', () => {
        const scene = getSceneShortcutByKey('6');
        assertTrue(!!scene, 'Expected scene for key 6.');
        assertEqual(scene.id, 'inspector_room', 'Expected inspector_room id.');
        assertEqual(scene.label, 'Inspector Room', 'Expected Inspector Room label.');
    });

    test('SceneShortcutRegistry: inspector_room uses key 6', () => {
        const scene = getSceneShortcutById('inspector_room');
        assertTrue(!!scene, 'Expected scene for inspector_room.');
        assertEqual(scene.key, '6', 'Expected inspector_room key 6.');
    });

    const { InspectorRoomUI } = await import('/src/graphics/gui/inspector_room/InspectorRoomUI.js');
    const {
        lightSignedExpSliderToValue,
        lightSignedExpValueToSlider,
        lightBiasedSignedExpSliderToValue,
        lightHexIntToHueTone,
        lightHueToneToHexInt,
        lightBiasedSignedExpValueToSlider
    } = await import('/src/graphics/gui/inspector_room/InspectorRoomLightUtils.js');

    test('InspectorRoomLightUtils: signed exponential mapping is symmetric', () => {
        const samples = [-1, -0.5, -0.1, 0, 0.1, 0.5, 1];
        for (const t of samples) {
            const v = lightSignedExpSliderToValue(t);
            const back = lightSignedExpValueToSlider(v);
            assertNear(back, t, 1e-6, 'Expected slider->value->slider roundtrip.');
            assertNear(lightSignedExpSliderToValue(-t), -v, 1e-6, 'Expected symmetry about 0.');
        }
    });

    test('InspectorRoomUI: lighting slider initializes from light state', () => {
        const ui = new InspectorRoomUI();
        const state = ui.getLightState();
        const expected = lightBiasedSignedExpValueToSlider(state.y, { maxAbs: 25, exponent: 3, zeroAt: 0.25 });
        assertNear(Number(ui.lightY.value), expected, 1e-3, 'Expected lightY slider to match mapped light state.');
    });

    const { InspectorRoomMeshesProvider } = await import('/src/graphics/gui/inspector_room/InspectorRoomMeshesProvider.js');
    const THREE_IR = await import('three');

    test('InspectorRoomMeshesProvider: pivot gizmo does not change focus bounds', () => {
        const provider = new InspectorRoomMeshesProvider({});
        const parent = new THREE_IR.Group();
        provider.mount(parent);
        provider.setSelectedMeshId('mesh.ball.v1');

        const before = provider.getFocusBounds();
        assertTrue(!!before, 'Expected focus bounds before pivot.');

        provider.setPivotEnabled(true);
        const after = provider.getFocusBounds();
        assertTrue(!!after, 'Expected focus bounds after pivot.');

        assertNear(after.center.x, before.center.x, 1e-6, 'Expected focus center x unchanged.');
        assertNear(after.center.y, before.center.y, 1e-6, 'Expected focus center y unchanged.');
        assertNear(after.center.z, before.center.z, 1e-6, 'Expected focus center z unchanged.');
        assertNear(after.radius, before.radius, 1e-6, 'Expected focus radius unchanged.');
    });

    const { getTreeMeshCollections, getTreeMeshEntryById, getTreeMeshOptionsForCollection, isTreeMeshId, TREE_MESH_COLLECTION } = await import('/src/graphics/content3d/catalogs/TreeMeshCatalog.js');

    test('TreeMeshCatalog: desktop tree entries resolve stable ids', () => {
        const collections = getTreeMeshCollections();
        assertTrue(collections.some((c) => c.id === TREE_MESH_COLLECTION.TREES_DESKTOP), 'Expected desktop tree collection.');

        const options = getTreeMeshOptionsForCollection(TREE_MESH_COLLECTION.TREES_DESKTOP);
        assertTrue(options.length > 0, 'Expected at least one desktop tree option.');

        const firstId = options[0].id;
        assertTrue(isTreeMeshId(firstId), 'Expected tree id to be recognized.');
        const entry = getTreeMeshEntryById(firstId);
        assertTrue(!!entry && typeof entry.fileName === 'string', 'Expected tree entry with fileName.');
    });

    const { PROCEDURAL_MESH, PROCEDURAL_MESH_COLLECTION, createProceduralMeshAsset, getProceduralMeshOptionsForCollection } = await import('/src/graphics/content3d/catalogs/ProceduralMeshCatalog.js');

    test('ProceduralMeshCatalog: Urban collection includes signs + traffic controls', () => {
        const urban = getProceduralMeshOptionsForCollection(PROCEDURAL_MESH_COLLECTION.URBAN);
        const ids = urban.map((o) => o.id);
        assertEqual(new Set(ids).size, ids.length, 'Expected no duplicate ids in Urban collection.');

        const required = [
            PROCEDURAL_MESH.STREET_SIGN_POLE_V1,
            PROCEDURAL_MESH.STOP_SIGN_PLATE_V1,
            PROCEDURAL_MESH.STOP_SIGN_V1,
            PROCEDURAL_MESH.TRAFFIC_LIGHT_POLE_V1,
            PROCEDURAL_MESH.TRAFFIC_LIGHT_HEAD_V1,
            PROCEDURAL_MESH.TRAFFIC_LIGHT_V1
        ];
        for (const id of required) {
            assertTrue(ids.includes(id), `Expected Urban collection to include ${id}.`);
        }
    });

    test('Procedural meshes: urban props + ball pivots are at base', () => {
        const ids = [
            PROCEDURAL_MESH.BALL_V1,
            PROCEDURAL_MESH.STREET_SIGN_POLE_V1,
            PROCEDURAL_MESH.STOP_SIGN_PLATE_V1,
            PROCEDURAL_MESH.STOP_SIGN_V1,
            PROCEDURAL_MESH.TRAFFIC_LIGHT_POLE_V1,
            PROCEDURAL_MESH.TRAFFIC_LIGHT_HEAD_V1,
            PROCEDURAL_MESH.TRAFFIC_LIGHT_V1
        ];

        for (const id of ids) {
            const asset = createProceduralMeshAsset(id);
            const mesh = asset?.mesh ?? null;
            assertTrue(!!mesh && typeof mesh.updateMatrixWorld === 'function', `Expected mesh for ${id}.`);
            mesh.updateMatrixWorld(true);
            const box = new THREE_IR.Box3().setFromObject(mesh);
            assertFalse(box.isEmpty(), `Expected non-empty bounds for ${id}.`);
            assertNear(box.min.y, 0, 1e-3, `Expected ${id} base (min.y) ~ 0.`);
        }
    });

    test('PbrMaterialCatalog: default tile meters is 4 when unset', async () => {
        const { getPbrMaterialExplicitTileMeters, getPbrMaterialTileMeters } = await import('/src/graphics/assets3d/materials/PbrMaterialCatalog.js');
        assertEqual(getPbrMaterialExplicitTileMeters('pbr.brick_wall_11'), null, 'Expected no explicit tile meters for brick_wall_11.');
        assertEqual(getPbrMaterialTileMeters('pbr.brick_wall_11'), 4.0, 'Expected 4m default tiling for brick_wall_11.');
    });

    test('InspectorRoomTexturesProvider: pbr materials default to 4x4 meters', async () => {
        const { InspectorRoomTexturesProvider } = await import('/src/graphics/gui/inspector_room/InspectorRoomTexturesProvider.js');
        const provider = new InspectorRoomTexturesProvider({}, null);
        provider._syncPreviewLayout = () => {};
        provider._setPbrMaterial = () => {};
        provider.setSelectedTextureId('pbr.brick_wall_11');
        const size = provider.getSelectedRealWorldSizeMeters();
        assertEqual(size.widthMeters, 4.0, 'Expected default PBR widthMeters 4.0.');
        assertEqual(size.heightMeters, 4.0, 'Expected default PBR heightMeters 4.0.');
        const meta = provider.getSelectedTextureMeta();
        assertEqual(meta?.extra?.tileMeters, 4.0, 'Expected tileMeters shown as 4.0 in meta.');
    });

    const { applyInspectorTreeMaterials, getInspectorTreeRoleFromIntersection, tagInspectorTreeMaterialRoles } = await import('/src/graphics/gui/inspector_room/InspectorRoomTreeMaterialUtils.js');

    test('InspectorRoomTreeMaterialUtils: preserves leaf materials for multi-material tree meshes', () => {
        const leafTex = new THREE_IR.DataTexture(new Uint8Array([60, 160, 60, 255]), 1, 1);
        leafTex.needsUpdate = true;
        const trunkTex = new THREE_IR.DataTexture(new Uint8Array([140, 90, 60, 255]), 1, 1);
        trunkTex.needsUpdate = true;

        const sharedLeaf = new THREE_IR.MeshStandardMaterial({ map: leafTex, alphaTest: 0.5 });
        const sharedTrunk = new THREE_IR.MeshStandardMaterial({ map: trunkTex });

        const geo = new THREE_IR.BufferGeometry();
        geo.setAttribute('position', new THREE_IR.Float32BufferAttribute([
            0, 0, 0,
            1, 0, 0,
            0, 1, 0,
            0, 0, 1,
            1, 0, 1,
            0, 1, 1
        ], 3));
        geo.setIndex([0, 1, 2, 3, 4, 5]);
        geo.clearGroups();
        geo.addGroup(0, 3, 0);
        geo.addGroup(3, 3, 1);

        const mesh = new THREE_IR.Mesh(geo, [sharedTrunk, sharedLeaf]);
        const root = new THREE_IR.Group();
        root.add(mesh);

        tagInspectorTreeMaterialRoles(root, { sharedLeaf, sharedTrunk });

        const leaf = new THREE_IR.MeshStandardMaterial({ color: 0x00ff00, alphaTest: 0.5 });
        const trunk = new THREE_IR.MeshStandardMaterial({ color: 0x885533 });
        const solid = new THREE_IR.MeshStandardMaterial({ color: 0xffffff });

        applyInspectorTreeMaterials(root, { mode: 'semantic', leaf, trunk, solid, wireframe: false });
        assertTrue(Array.isArray(mesh.material), 'Expected multi-material mesh.');
        assertTrue(mesh.material[0] === trunk, 'Expected group 0 material to be trunk.');
        assertTrue(mesh.material[1] === leaf, 'Expected group 1 material to be leaf.');

        assertEqual(getInspectorTreeRoleFromIntersection({ object: mesh, faceIndex: 0 }), 'trunk', 'Expected triangle 0 to be trunk.');
        assertEqual(getInspectorTreeRoleFromIntersection({ object: mesh, faceIndex: 1 }), 'leaf', 'Expected triangle 1 to be leaf.');

        applyInspectorTreeMaterials(root, { mode: 'solid', leaf, trunk, solid, wireframe: false });
        assertTrue(mesh.material[0] === solid, 'Expected solid mode to override trunk material.');
        assertTrue(mesh.material[1] === solid, 'Expected solid mode to override leaf material.');
    });

    // ========== AI-113 Registry Tests ==========
    const { WINDOW_STYLE } = await import('/src/app/buildings/WindowStyle.js');
    const { WINDOW_TYPE: WINDOW_TYPE_IDS } = await import('/src/graphics/assets3d/generators/buildings/WindowTextureGenerator.js');
    const {
        windowTypeIdFromLegacyWindowStyle,
        legacyWindowStyleFromWindowTypeId,
        normalizeWindowTypeIdOrLegacyStyle
    } = await import('/src/graphics/assets3d/generators/buildings/WindowTypeCompatibility.js');

    test('WindowTypeCompatibility: legacy styles map to window type IDs', () => {
        assertEqual(windowTypeIdFromLegacyWindowStyle(WINDOW_STYLE.DARK), WINDOW_TYPE_IDS.STYLE_DARK, 'DARK mismatch.');
        assertEqual(windowTypeIdFromLegacyWindowStyle(WINDOW_STYLE.BLUE), WINDOW_TYPE_IDS.STYLE_BLUE, 'BLUE mismatch.');
        assertEqual(windowTypeIdFromLegacyWindowStyle(WINDOW_STYLE.GRID), WINDOW_TYPE_IDS.STYLE_GRID, 'GRID mismatch.');
        assertEqual(normalizeWindowTypeIdOrLegacyStyle(WINDOW_STYLE.WARM), WINDOW_TYPE_IDS.STYLE_WARM, 'WARM mismatch.');
        assertEqual(normalizeWindowTypeIdOrLegacyStyle('not_a_style'), WINDOW_TYPE_IDS.STYLE_DEFAULT, 'Default mismatch.');
    });

    test('WindowTypeCompatibility: window types map to legacy styles', () => {
        assertEqual(legacyWindowStyleFromWindowTypeId(WINDOW_TYPE_IDS.STYLE_GREEN), WINDOW_STYLE.GREEN, 'GREEN mismatch.');
        assertEqual(legacyWindowStyleFromWindowTypeId(WINDOW_TYPE_IDS.ARCH_V1), WINDOW_STYLE.DEFAULT, 'ARCH mismatch.');
    });

    const {
        resolveBuildingStyleLabel,
        resolveBuildingStyleWallMaterialUrls
    } = await import('/src/graphics/content3d/catalogs/BuildingStyleCatalog.js');

    test('BuildingStyleCatalog: brick style uses lightweight wall texture', () => {
        assertEqual(resolveBuildingStyleLabel('brick'), 'Brick', 'Brick label mismatch.');
        const urls = resolveBuildingStyleWallMaterialUrls('brick');
        assertTrue(
            typeof urls.baseColorUrl === 'string' && urls.baseColorUrl.includes('brick_wall_DEPRECATED.png'),
            'Expected baseColorUrl.'
        );
        assertEqual(urls.normalUrl, null, 'Expected normalUrl to be null.');
        assertEqual(urls.ormUrl, null, 'Expected ormUrl to be null.');
    });

    const {
        getPbrMaterialOptions,
        getPbrMaterialOptionsForBuildings,
        getPbrMaterialExplicitTileMeters,
        computePbrMaterialTextureRepeat,
        getPbrMaterialMeta
    } = await import('/src/graphics/content3d/catalogs/PbrMaterialCatalog.js');

    test('BuildingStyleCatalog: PBR style ids resolve safely when assets are missing', () => {
        assertEqual(resolveBuildingStyleLabel('pbr.red_brick'), 'Red Brick', 'PBR label mismatch.');
        const urls = resolveBuildingStyleWallMaterialUrls('pbr.red_brick');
        const hasAny = !!urls.baseColorUrl || !!urls.normalUrl || !!urls.ormUrl;
        if (!hasAny) {
            assertEqual(urls.baseColorUrl, null, 'Expected missing baseColorUrl for local-only assets.');
            assertEqual(urls.normalUrl, null, 'Expected missing normalUrl for local-only assets.');
            assertEqual(urls.ormUrl, null, 'Expected missing ormUrl for local-only assets.');
            return;
        }
        assertTrue(typeof urls.baseColorUrl === 'string' && urls.baseColorUrl.includes('/assets/public/pbr/red_brick/basecolor'), 'Expected baseColorUrl to point at local-only PBR folder.');
        assertTrue(typeof urls.normalUrl === 'string' && urls.normalUrl.includes('/assets/public/pbr/red_brick/normal_gl'), 'Expected normalUrl to point at local-only PBR folder.');
        assertTrue(typeof urls.ormUrl === 'string' && urls.ormUrl.includes('/assets/public/pbr/red_brick/arm'), 'Expected ormUrl to point at local-only PBR folder.');
    });

    test('PbrMaterialCatalog: exposes expected PBR ids', () => {
        const all = getPbrMaterialOptions();
        assertTrue(all.some((opt) => opt?.id === 'pbr.red_brick'), 'Expected pbr.red_brick.');
        assertTrue(all.some((opt) => opt?.id === 'pbr.asphalt_02'), 'Expected pbr.asphalt_02.');
    });

    test('PbrMaterialCatalog: building list excludes grass and surfaces', () => {
        const building = getPbrMaterialOptionsForBuildings();
        assertTrue(building.some((opt) => opt?.id === 'pbr.red_brick'), 'Expected pbr.red_brick to be building-eligible.');
        assertFalse(building.some((opt) => opt?.id === 'pbr.asphalt_02'), 'Did not expect pbr.asphalt_02 to be building-eligible.');
        assertFalse(building.some((opt) => String(opt?.id ?? '').toLowerCase().includes('grass')), 'Did not expect grass materials in building list.');
    });

    test('PbrMaterialCatalog: scale metadata computes repeat consistently', () => {
        const meta = getPbrMaterialMeta('pbr.red_brick');
        assertTrue(!!meta, 'Expected red_brick metadata.');
        assertTrue(Number.isFinite(meta.tileMeters) && meta.tileMeters > 0, 'Expected tileMeters > 0.');
        assertEqual(meta.preferredVariant, '1k', 'Expected preferredVariant to default to 1k.');
        assertTrue(Array.isArray(meta.variants) && meta.variants.includes('1k'), 'Expected variants to include 1k.');
        assertTrue(Array.isArray(meta.maps) && meta.maps.includes('baseColor') && meta.maps.includes('normal') && meta.maps.includes('orm'), 'Expected map keys.');

        const repWorld = computePbrMaterialTextureRepeat('pbr.red_brick', { uvSpace: 'meters' });
        assertNear(repWorld.x, 1 / meta.tileMeters, 1e-6, 'Expected world repeat x=1/tileMeters.');
        assertNear(repWorld.y, 1 / meta.tileMeters, 1e-6, 'Expected world repeat y=1/tileMeters.');

        const repUnit = computePbrMaterialTextureRepeat('pbr.red_brick', { uvSpace: 'unit', surfaceSizeMeters: { x: 3, y: 3 } });
        assertNear(repUnit.x, 3 / meta.tileMeters, 1e-6, 'Expected unit repeat x=surface/tileMeters.');
        assertNear(repUnit.y, 3 / meta.tileMeters, 1e-6, 'Expected unit repeat y=surface/tileMeters.');
    });

    test('PbrMaterialCatalog: explicit tile size is only set for configured materials', () => {
        assertEqual(getPbrMaterialExplicitTileMeters('pbr.red_brick'), null, 'Expected null explicit tileMeters for red_brick.');
        assertEqual(getPbrMaterialExplicitTileMeters('pbr.concrete'), null, 'Expected null explicit tileMeters for materials without config.');
        assertNear(getPbrMaterialMeta('pbr.concrete')?.tileMeters, 4.0, 1e-6, 'Expected default tileMeters=4m for wall materials.');
    });

    const { buildTexturePreviewMaterialMaps, computeRealWorldAspectRatio, computeRealWorldRepeat } = await import('/src/graphics/gui/inspector_room/InspectorRoomTexturesProvider.js');

    test('InspectorRoomTexturesProvider: real-world helpers compute repeat/aspect', () => {
        assertEqual(computeRealWorldAspectRatio({ widthMeters: 2, heightMeters: 1 }), 2, 'Expected aspect=2.');
        assertEqual(computeRealWorldAspectRatio({ widthMeters: 2, heightMeters: 0 }), null, 'Expected invalid aspect to return null.');

        const rep = computeRealWorldRepeat({ surfaceSizeMeters: { x: 3, y: 3 }, tileSizeMeters: { x: 2, y: 1 } });
        assertNear(rep.x, 1.5, 1e-6, 'Expected repeat x=surface/tile.');
        assertNear(rep.y, 3, 1e-6, 'Expected repeat y=surface/tile.');
    });

    test('InspectorRoomTexturesProvider: preview maps use standard material slots', () => {
        const baseUrl = 'base';
        const normalUrl = 'normal';
        const ormUrl = 'orm';
        const alphaUrl = 'alpha';

        const single = buildTexturePreviewMaterialMaps({
            previewMode: 'single',
            baseTex: baseUrl,
            normalTex: normalUrl,
            ormTex: ormUrl,
            alphaTex: alphaUrl
        });
        assertEqual(single.overlay.map, baseUrl, 'Expected base map in overlay (single).');
        assertEqual(single.overlay.normalMap, normalUrl, 'Expected normal map in overlay (single).');
        assertEqual(single.overlay.roughnessMap, ormUrl, 'Expected ORM in roughnessMap slot (single).');
        assertEqual(single.overlay.alphaMap, alphaUrl, 'Expected alpha map in overlay (single).');

        const tiled = buildTexturePreviewMaterialMaps({
            previewMode: 'tiled',
            baseTex: baseUrl,
            normalTex: normalUrl,
            ormTex: ormUrl,
            alphaTex: alphaUrl
        });
        assertEqual(tiled.overlay.map, null, 'Expected overlay map cleared in tiled mode.');
        assertEqual(tiled.overlay.normalMap, null, 'Expected overlay normal cleared in tiled mode.');
        assertEqual(tiled.overlay.roughnessMap, null, 'Expected overlay roughness cleared in tiled mode.');
        assertEqual(tiled.tile.map, baseUrl, 'Expected base map in tile material.');
        assertEqual(tiled.tile.normalMap, normalUrl, 'Expected normal map in tile material.');
        assertEqual(tiled.tile.roughnessMap, ormUrl, 'Expected ORM in roughnessMap slot (tile).');
    });

    const { computeBoundsSize, formatMeters } = await import('/src/graphics/gui/inspector_room/InspectorRoomMeasurementUtils.js');

    test('InspectorRoomMeasurementUtils: bounds size and meters formatting', () => {
        const size = computeBoundsSize({ min: { x: 1, y: 2, z: 3 }, max: { x: 4, y: 6, z: 5 } });
        assertTrue(!!size, 'Expected size.');
        assertNear(size.x, 3, 1e-6, 'Expected dx=3.');
        assertNear(size.y, 4, 1e-6, 'Expected dy=4.');
        assertNear(size.z, 2, 1e-6, 'Expected dz=2.');
        assertEqual(formatMeters(2, { digits: 0 }), '2m', 'Expected 0-digit meters.');
        assertEqual(formatMeters(2.3456, { digits: 2 }), '2.35m', 'Expected rounded meters.');
    });

    const { sampleConnector } = await import('/src/app/geometry/ConnectorSampling.js');
    const THREE_NS = await import('three');

    test('ConnectorSampling: straight connector samples endpoints', () => {
        const start = new THREE_NS.Vector2(0, 0);
        const end = new THREE_NS.Vector2(1, 0);
        const connector = {
            segments: [{
                type: 'STRAIGHT',
                startPoint: start,
                endPoint: end,
                length: 1,
                direction: new THREE_NS.Vector2(1, 0)
            }]
        };
        const { points, tangents } = sampleConnector(connector, 0.4);
        assertTrue(points.length >= 2, 'Expected at least 2 points.');
        assertEqual(points[0].x, 0, 'Expected first point x=0.');
        assertEqual(points[0].y, 0, 'Expected first point y=0.');
        assertNear(points[points.length - 1].x, 1, 1e-6, 'Expected last point x≈1.');
        assertNear(points[points.length - 1].y, 0, 1e-6, 'Expected last point y≈0.');
        assertTrue(tangents.length === points.length, 'Expected tangents to match points length.');
        assertNear(tangents[0].x, 1, 1e-6, 'Expected tangent x≈1.');
        assertNear(tangents[0].y, 0, 1e-6, 'Expected tangent y≈0.');
    });

    const { computeFrameDistanceForSphere } = await import('/src/graphics/engine3d/camera/ToolCameraController.js');

    test('ToolCameraController: frame distance fits sphere', () => {
        const d = computeFrameDistanceForSphere({ radius: 1, fovDeg: 90, aspect: 1, padding: 1.0 });
        assertNear(d, 1, 1e-6, 'Expected radius=1 to fit at distance=1 for 90° fov.');
        const padded = computeFrameDistanceForSphere({ radius: 1, fovDeg: 90, aspect: 1, padding: 1.2 });
        assertTrue(padded > d, 'Expected padding to increase distance.');
        const tall = computeFrameDistanceForSphere({ radius: 1, fovDeg: 90, aspect: 0.5, padding: 1.0 });
        assertTrue(tall > d, 'Expected narrower aspect to require larger distance.');
    });

    // ========== Material Variation Tests ==========
    const {
        computeMaterialVariationSeedFromTiles,
        normalizeMaterialVariationConfig
    } = await import('/src/graphics/assets3d/materials/MaterialVariationSystem.js');

    test('MaterialVariation: seed stable across tile order', () => {
        const tilesA = [[1, 2], [3, 4], [2, 2]];
        const tilesB = [[3, 4], [2, 2], [1, 2]];
        const tilesObj = [{ x: 1, y: 2 }, { x: 3, y: 4 }, { x: 2, y: 2 }];

        const a = computeMaterialVariationSeedFromTiles(tilesA, { salt: 'building' });
        const b = computeMaterialVariationSeedFromTiles(tilesB, { salt: 'building' });
        const c = computeMaterialVariationSeedFromTiles(tilesObj, { salt: 'building' });
        assertEqual(a, b, 'Expected same seed regardless of tile order.');
        assertEqual(a, c, 'Expected same seed for array/object tile formats.');
    });

    test('MaterialVariation: seed changes when tiles change', () => {
        const tilesA = [[1, 2], [3, 4], [2, 2]];
        const tilesC = [[1, 2], [3, 4], [2, 3]];
        const a = computeMaterialVariationSeedFromTiles(tilesA, { salt: 'building' });
        const c = computeMaterialVariationSeedFromTiles(tilesC, { salt: 'building' });
        assertTrue(a !== c, 'Expected different seeds for different tile sets.');
    });

    test('MaterialVariation: config normalization clamps ranges', () => {
        const cfg = normalizeMaterialVariationConfig({
            worldSpaceScale: 999,
            objectSpaceScale: -5,
            tintAmount: 9,
            roughnessAmount: 9,
            dust: { strength: -1, heightBand: { min: 1, max: 0 } }
        });

        assertTrue(cfg.worldSpaceScale <= 20.0, 'worldSpaceScale should clamp to max.');
        assertTrue(cfg.objectSpaceScale >= 0.001, 'objectSpaceScale should clamp to min.');
        assertTrue(cfg.tintAmount <= 2.0, 'tintAmount should clamp to max.');
        assertTrue(cfg.roughnessAmount <= 2.0, 'roughnessAmount should clamp to max.');
        assertEqual(cfg.dust.strength, 0, 'dust.strength should clamp to 0.');
        assertEqual(cfg.dust.heightBand.min, 0, 'heightBand.min should normalize/swap.');
        assertEqual(cfg.dust.heightBand.max, 1, 'heightBand.max should normalize/swap.');
    });

    // ========== Building Fabrication Layer Schema Tests ==========
    const {
        cloneBuildingLayers
    } = await import('/src/graphics/assets3d/generators/building_fabrication/BuildingFabricationTypes.js');

    test('BuildingFabricationTypes: default layers include mat-var and tiling sections', () => {
        const floor = createDefaultFloorLayer();
        assertTrue(!!floor.tiling, 'Expected floor tiling config.');
        assertFalse(floor.tiling.enabled, 'Expected floor tiling disabled by default.');
        assertTrue(Number.isFinite(floor.tiling.tileMeters), 'Expected floor tileMeters to be a number.');
        assertFalse(floor.tiling.uvEnabled, 'Expected floor UV transform disabled by default.');
        assertEqual(floor.tiling.offsetU, 0.0, 'Expected floor UV offsetU default 0.');
        assertEqual(floor.tiling.offsetV, 0.0, 'Expected floor UV offsetV default 0.');
        assertEqual(floor.tiling.rotationDegrees, 0.0, 'Expected floor UV rotation default 0.');
        assertTrue(!!floor.materialVariation, 'Expected floor materialVariation config.');
        assertFalse(floor.materialVariation.enabled, 'Expected floor materialVariation disabled by default.');
        assertTrue(Number.isFinite(floor.materialVariation.seedOffset), 'Expected floor seedOffset to be a number.');

        const roof = createDefaultRoofLayer();
        assertTrue(!!roof.roof?.tiling, 'Expected roof tiling config.');
        assertFalse(roof.roof.tiling.enabled, 'Expected roof tiling disabled by default.');
        assertTrue(Number.isFinite(roof.roof.tiling.tileMeters), 'Expected roof tileMeters to be a number.');
        assertFalse(roof.roof.tiling.uvEnabled, 'Expected roof UV transform disabled by default.');
        assertEqual(roof.roof.tiling.offsetU, 0.0, 'Expected roof UV offsetU default 0.');
        assertEqual(roof.roof.tiling.offsetV, 0.0, 'Expected roof UV offsetV default 0.');
        assertEqual(roof.roof.tiling.rotationDegrees, 0.0, 'Expected roof UV rotation default 0.');
        assertTrue(!!roof.roof?.materialVariation, 'Expected roof materialVariation config.');
        assertFalse(roof.roof.materialVariation.enabled, 'Expected roof materialVariation disabled by default.');
        assertTrue(Number.isFinite(roof.roof.materialVariation.seedOffset), 'Expected roof seedOffset to be a number.');
    });

    test('BuildingFabricationTypes: windows include fake depth defaults', () => {
        const floor = createDefaultFloorLayer();
        assertTrue(!!floor.windows?.fakeDepth, 'Expected windows.fakeDepth config.');
        assertFalse(floor.windows.fakeDepth.enabled, 'Expected windows fakeDepth disabled by default.');
        assertTrue(Number.isFinite(floor.windows.fakeDepth.strength), 'Expected windows fakeDepth strength to be a number.');
        assertTrue(Number.isFinite(floor.windows.fakeDepth.insetStrength), 'Expected windows fakeDepth insetStrength to be a number.');

        assertTrue(!!floor.windows?.pbr, 'Expected windows.pbr config.');
        assertTrue(!!floor.windows.pbr.normal, 'Expected windows.pbr.normal config.');
        assertTrue(!!floor.windows.pbr.normal.enabled, 'Expected windows.pbr.normal enabled by default.');
        assertTrue(Number.isFinite(floor.windows.pbr.normal.strength), 'Expected windows.pbr.normal.strength to be a number.');
        assertTrue(!!floor.windows.pbr.roughness, 'Expected windows.pbr.roughness config.');
        assertTrue(!!floor.windows.pbr.roughness.enabled, 'Expected windows.pbr.roughness enabled by default.');
        assertTrue(Number.isFinite(floor.windows.pbr.roughness.contrast), 'Expected windows.pbr.roughness.contrast to be a number.');
        assertTrue(!!floor.windows.pbr.border, 'Expected windows.pbr.border config.');
        assertTrue(!!floor.windows.pbr.border.enabled, 'Expected windows.pbr.border enabled by default.');
        assertTrue(Number.isFinite(floor.windows.pbr.border.thickness), 'Expected windows.pbr.border.thickness to be a number.');
        assertTrue(Number.isFinite(floor.windows.pbr.border.strength), 'Expected windows.pbr.border.strength to be a number.');
    });

    test('BuildingFabricationTypes: cloneBuildingLayers deep clones mat-var and tiling', () => {
        const original = [
            createDefaultFloorLayer({
                tiling: { enabled: true, tileMeters: 3.5, uvEnabled: true, offsetU: 0.25, offsetV: -0.15, rotationDegrees: 45 },
                materialVariation: { enabled: true, seedOffset: 7, macro: { enabled: true, intensity: 1.2 } }
            }),
            createDefaultRoofLayer({
                roof: {
                    tiling: { enabled: true, tileMeters: 5.0, uvEnabled: true, offsetU: -0.2, offsetV: 0.33, rotationDegrees: -30 },
                    materialVariation: { enabled: true, seedOffset: 9, grime: { enabled: true, strength: 0.25 } }
                }
            })
        ];

        const cloned = cloneBuildingLayers(original);
        cloned[0].tiling.tileMeters = 9.0;
        cloned[0].tiling.offsetU = 0.99;
        cloned[0].materialVariation.seedOffset = 123;
        cloned[1].roof.tiling.tileMeters = 9.0;
        cloned[1].roof.tiling.rotationDegrees = 90;
        cloned[1].roof.materialVariation.seedOffset = 456;

        assertEqual(original[0].tiling.tileMeters, 3.5, 'Expected floor tiling to be cloned (no shared refs).');
        assertEqual(original[0].tiling.offsetU, 0.25, 'Expected floor tiling UV fields to be cloned (no shared refs).');
        assertEqual(original[0].materialVariation.seedOffset, 7, 'Expected floor materialVariation to be cloned (no shared refs).');
        assertEqual(original[1].roof.tiling.tileMeters, 5.0, 'Expected roof tiling to be cloned (no shared refs).');
        assertEqual(original[1].roof.tiling.rotationDegrees, -30, 'Expected roof tiling UV fields to be cloned (no shared refs).');
        assertEqual(original[1].roof.materialVariation.seedOffset, 9, 'Expected roof materialVariation to be cloned (no shared refs).');
    });

    test('BuildingFabricationTypes: cloneBuildingLayers clones window fakeDepth', () => {
        const original = [
            createDefaultFloorLayer({
                windows: { fakeDepth: { enabled: true, strength: 0.12, insetStrength: 0.4 } }
            }),
            createDefaultRoofLayer({ ring: { enabled: false } })
        ];

        const cloned = cloneBuildingLayers(original);
        cloned[0].windows.fakeDepth.strength = 0.2;
        cloned[0].windows.fakeDepth.insetStrength = 0.9;
        assertEqual(original[0].windows.fakeDepth.strength, 0.12, 'Expected window fakeDepth to be cloned (no shared refs).');
        assertEqual(original[0].windows.fakeDepth.insetStrength, 0.4, 'Expected window fakeDepth to be cloned (no shared refs).');
    });

    test('BuildingFabricationTypes: cloneBuildingLayers clones window pbr config', () => {
        const original = [
            createDefaultFloorLayer({
                windows: {
                    pbr: {
                        normal: { enabled: true, strength: 0.7 },
                        roughness: { enabled: true, contrast: 1.25 },
                        border: { enabled: true, thickness: 0.02, strength: 0.45 }
                    }
                }
            }),
            createDefaultRoofLayer({ ring: { enabled: false } })
        ];

        const cloned = cloneBuildingLayers(original);
        cloned[0].windows.pbr.normal.strength = 1.3;
        cloned[0].windows.pbr.roughness.contrast = 2.0;
        cloned[0].windows.pbr.border.thickness = 0.08;
        cloned[0].windows.pbr.border.strength = 0.9;

        assertEqual(original[0].windows.pbr.normal.strength, 0.7, 'Expected window pbr.normal to be cloned (no shared refs).');
        assertEqual(original[0].windows.pbr.roughness.contrast, 1.25, 'Expected window pbr.roughness to be cloned (no shared refs).');
        assertEqual(original[0].windows.pbr.border.thickness, 0.02, 'Expected window pbr.border to be cloned (no shared refs).');
        assertEqual(original[0].windows.pbr.border.strength, 0.45, 'Expected window pbr.border to be cloned (no shared refs).');
    });

    // ========== InspectorRoomLightUtils Tests ==========
    test('InspectorRoomLightUtils: biased slider uses 25% zero pivot', () => {
        const opts = { maxAbs: 25, exponent: 3, zeroAt: 0.25 };
        assertNear(lightBiasedSignedExpSliderToValue(0, opts), -25, 1e-6, 'Slider 0 should map to -maxAbs.');
        assertNear(lightBiasedSignedExpSliderToValue(0.25, opts), 0, 1e-6, 'Slider pivot should map to 0.');
        assertNear(lightBiasedSignedExpSliderToValue(1, opts), 25, 1e-6, 'Slider 1 should map to +maxAbs.');

        assertNear(lightBiasedSignedExpValueToSlider(-25, opts), 0, 1e-6, 'Value -maxAbs should map to slider 0.');
        assertNear(lightBiasedSignedExpValueToSlider(0, opts), 0.25, 1e-6, 'Value 0 should map to slider pivot.');
        assertNear(lightBiasedSignedExpValueToSlider(25, opts), 1, 1e-6, 'Value +maxAbs should map to slider 1.');
    });

    test('InspectorRoomLightUtils: biased slider round-trips without jumps', () => {
        const opts = { maxAbs: 25, exponent: 3, zeroAt: 0.25 };
        const values = [-25, -12.5, -1, 0, 1, 12.5, 25];
        for (const v of values) {
            const s = lightBiasedSignedExpValueToSlider(v, opts);
            const vv = lightBiasedSignedExpSliderToValue(s, opts);
            assertNear(vv, v, 1e-6, `Round-trip for ${v}.`);
        }
    });

    test('InspectorRoomLightUtils: hue/tone encodes core extremes', () => {
        assertEqual(lightHueToneToHexInt(0, 0), 0xff0000, 'Hue 0 should be red at tone 0.');
        assertEqual(lightHueToneToHexInt(120, 0), 0x00ff00, 'Hue 120 should be green at tone 0.');
        assertEqual(lightHueToneToHexInt(240, 0), 0x0000ff, 'Hue 240 should be blue at tone 0.');
        assertEqual(lightHueToneToHexInt(200, -1), 0x000000, 'Tone -1 should be black.');
        assertEqual(lightHueToneToHexInt(200, 1), 0xffffff, 'Tone 1 should be white.');
    });

    test('InspectorRoomLightUtils: hex->hue/tone preserves generated colors', () => {
        const cases = [
            { hueDegrees: 0, tone: -0.5 },
            { hueDegrees: 0, tone: 0 },
            { hueDegrees: 0, tone: 0.4 },
            { hueDegrees: 60, tone: -0.25 },
            { hueDegrees: 120, tone: 0.25 },
            { hueDegrees: 200, tone: 0.75 }
        ];

        for (const c of cases) {
            const hex = lightHueToneToHexInt(c.hueDegrees, c.tone);
            const decoded = lightHexIntToHueTone(hex, { fallbackHueDegrees: c.hueDegrees });
            const back = lightHueToneToHexInt(decoded.hueDegrees, decoded.tone);
            assertEqual(back, hex, `Expected round-trip for hue=${c.hueDegrees} tone=${c.tone}.`);
        }
    });

    // ========== Summary ==========
    console.log('\n' + '='.repeat(50));
    if (errors.length === 0) {
        console.log('✅ All tests passed!');
    } else {
        console.log(`❌ ${errors.length} test(s) failed:\n`);
        errors.forEach(({ name, error }) => {
            console.error(`  • ${name}: ${error}`);
        });
    }
    console.log('='.repeat(50) + '\n');

    // Expose errors globally for easy inspection
    window.__testErrors = errors;
}

// Run tests when module loads
runTests().catch(err => {
    console.error('[CoreTests] Test runner failed:', err);
    const message = err?.message ?? String(err);
    if (typeof window !== 'undefined') {
        if (!Array.isArray(window.__testFatals)) window.__testFatals = [];
        window.__testFatals.push({ name: 'CoreTests', message });
        window.__testErrors = errors;
    }
});
