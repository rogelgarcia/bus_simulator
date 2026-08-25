// Headless browser tests: an arch-enabled door must compose like a real arched
// entry — rectangular leaves stopped at the springing line, a transom bar there,
// and a glazed fanlight in the lunette above.
//
// Guard for AI 497: every double-door branch in `WindowMeshGeometry` built plain
// full-height rectangles and `buildArchMeetRectJoinGeometry` bailed out on
// `isDoorDoubleStyle`, so an arched door was a rectangular door in an arched
// hole — leaves running up into the lunette, no top rail, no transom.
//
// Both the building generator and the Window Mesh Debugger render from this one
// module, so asserting on its bundle covers both surfaces.
//
// Runs in the browser rather than node because `three` is CDN-only here (see the
// import map in index.html); there is no local node_modules/three.
import test, { expect } from '@playwright/test';

// door_wood_arch: arch on, meetsRectangleFrame, topPieceMode 'frame', double.
const ARCHED_DOOR_ID = 'door_wood_arch';
// Same family, no arch — must be untouched by the fix.
const PLAIN_DOOR_ID = 'door_black_tall';

async function bundleFor(page, catalogId, overrides = null) {
    return page.evaluate(async (args) => {
        const geometry = await import('/src/graphics/engine3d/buildings/window_mesh/WindowMeshGeometry.js');
        const catalog = await import('/src/app/buildings/window_mesh/WindowFabricationCatalog.js');
        const entry = catalog.getWindowFabricationCatalogEntryById(args.catalogId);
        if (!entry) throw new Error(`catalog entry ${args.catalogId} not found`);
        const settings = args.overrides
            ? { ...entry.settings, ...args.overrides }
            : entry.settings;
        const bundle = geometry.buildWindowMeshGeometryBundle(settings, { curveSegments: 24 });

        const describe = (geo) => {
            if (!geo) return null;
            geo.computeBoundingBox();
            const box = geo.boundingBox;
            return {
                triangles: (geo.index ? geo.index.count : geo.attributes.position.count) / 3,
                min: [box.min.x, box.min.y, box.min.z],
                max: [box.max.x, box.max.y, box.max.z]
            };
        };

        const frameWidth = settings.frame.horizontalWidth ?? settings.frame.width;
        return {
            width: settings.width,
            height: settings.height,
            archEnabled: !!settings.arch?.enabled,
            archRise: settings.arch?.enabled ? settings.arch.heightRatio * settings.width : 0,
            frameHorizontalWidth: frameWidth,
            joinBarLayer: bundle.joinBarLayer,
            frame: describe(bundle.frame),
            opening: describe(bundle.opening),
            muntins: describe(bundle.muntins),
            joinBar: describe(bundle.joinBar),
            handles: describe(bundle.handles)
        };
    }, { catalogId, overrides });
}

test.beforeEach(async ({ page }) => {
    await page.goto('/tests/headless/harness/index.html?ibl=0&bloom=0');
    await page.waitForFunction(() => window.__testHooks && window.__testHooks.version === 1);
});

test('arched double door: transom bar sits on the springing line', async ({ page }) => {
    const b = await bundleFor(page, ARCHED_DOOR_ID);
    expect(b.archEnabled).toBe(true);

    const yChord = b.height / 2 - b.archRise;
    expect(b.joinBar, 'an arched door must emit a transom bar').not.toBeNull();
    expect(b.joinBarLayer, 'topPieceMode "frame" means a frame-material bar').toBe('frame');
    // The bar hangs a rail's depth below the springing line.
    expect(b.joinBar.max[1]).toBeCloseTo(yChord, 3);
    expect(b.joinBar.min[1]).toBeCloseTo(yChord - b.frameHorizontalWidth, 3);
    // And spans the full glazed width, bridging the gap between the leaves.
    expect(b.joinBar.max[0] - b.joinBar.min[0]).toBeGreaterThan(b.width * 0.8);
});

test('arched double door: leaves and muntins stop below the transom', async ({ page }) => {
    const b = await bundleFor(page, ARCHED_DOOR_ID);
    const leafTop = b.height / 2 - b.archRise - b.frameHorizontalWidth;

    // The lunette belongs to the fanlight: no leaf muntin may reach into it.
    expect(b.muntins, 'this door is muntined').not.toBeNull();
    expect(b.muntins.max[1]).toBeLessThanOrEqual(leafTop + 1e-3);
    // Handles stay on the leaves.
    expect(b.handles.max[1]).toBeLessThan(leafTop);
});

test('arched double door: a fanlight fills the lunette', async ({ page }) => {
    const b = await bundleFor(page, ARCHED_DOOR_ID);
    const yChord = b.height / 2 - b.archRise;

    // Frame reaches the apex, so the arched head ring is there...
    expect(b.frame.max[1]).toBeCloseTo(b.height / 2, 3);
    // ...and glazing exists above the springing line, which is the fanlight.
    expect(b.opening.max[1]).toBeGreaterThan(yChord);
    // The head ring is real geometry, not a couple of stray triangles.
    expect(b.frame.triangles).toBeGreaterThan(200);
});

test('a non-arched double door is unchanged', async ({ page }) => {
    const b = await bundleFor(page, PLAIN_DOOR_ID);
    expect(b.archEnabled).toBe(false);
    expect(b.joinBar, 'no arch means no transom').toBeNull();
    // Leaves still run the full height of the door, glazing included.
    expect(b.frame.max[1]).toBeCloseTo(b.height / 2, 3);
    expect(b.opening.max[1]).toBeCloseTo(b.height / 2 - b.frameHorizontalWidth, 3);
});

test('an arched window keeps its own composition', async ({ page }) => {
    const win = await page.evaluate(async () => {
        const catalog = await import('/src/app/buildings/window_mesh/WindowFabricationCatalog.js');
        const entries = catalog.getWindowFabricationCatalogEntries({ assetType: 'window' });
        const arched = entries.find((e) => e.settings?.arch?.enabled && e.settings?.arch?.meetsRectangleFrame);
        return arched ? arched.id : null;
    });
    expect(win, 'catalog should carry an arched window to compare against').not.toBeNull();

    const w = await bundleFor(page, win);
    const yChord = w.height / 2 - w.archRise;
    expect(w.joinBar, 'arched windows already emitted a join bar').not.toBeNull();
    expect(w.joinBar.max[1]).toBeCloseTo(yChord, 3);
    // A window has no leaves, so its glazing still fills the lunette.
    expect(w.opening.max[1]).toBeGreaterThan(yChord);
});
