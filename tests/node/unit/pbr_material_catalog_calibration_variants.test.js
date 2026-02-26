// Node unit tests: calibration-only PBR catalog variants.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    getPbrMaterialMeta,
    getPbrMaterialOptions,
    getPbrMaterialOptionsForBuildings,
    getPbrMaterialOptionsForGround,
    resolvePbrMaterialUrls
} from '../../../src/graphics/content3d/catalogs/PbrMaterialCatalog.js';

test('PbrMaterialCatalog: plastered wall 2 horizontal variant is calibration-only and reuses base maps', () => {
    const variantId = 'pbr.plastered_wall_02_horizontal';

    const all = getPbrMaterialOptions();
    assert.ok(all.some((opt) => opt?.id === variantId), 'Expected calibration variant in global PBR catalog options.');

    const building = getPbrMaterialOptionsForBuildings();
    assert.equal(building.some((opt) => opt?.id === variantId), false, 'Did not expect calibration variant in building options.');

    const ground = getPbrMaterialOptionsForGround();
    assert.equal(ground.some((opt) => opt?.id === variantId), false, 'Did not expect calibration variant in ground options.');

    const meta = getPbrMaterialMeta(variantId);
    assert.ok(meta, 'Expected metadata for calibration variant.');
    assert.equal(meta?.calibration?.uvRotationDegrees, 90, 'Expected 90deg UV rotation metadata.');

    const urls = resolvePbrMaterialUrls(variantId);
    const hasAny = !!urls.baseColorUrl || !!urls.normalUrl || !!urls.ormUrl;
    if (!hasAny) {
        assert.equal(urls.baseColorUrl, null);
        assert.equal(urls.normalUrl, null);
        assert.equal(urls.ormUrl, null);
        return;
    }

    assert.equal(typeof urls.baseColorUrl, 'string');
    assert.equal(typeof urls.normalUrl, 'string');
    assert.equal(typeof urls.ormUrl, 'string');
    assert.ok(urls.baseColorUrl.endsWith('/assets/public/pbr/plastered_wall_02/basecolor.jpg'));
    assert.ok(urls.normalUrl.endsWith('/assets/public/pbr/plastered_wall_02/normal_gl.png'));
    assert.ok(urls.ormUrl.endsWith('/assets/public/pbr/plastered_wall_02/arm.png'));
});
