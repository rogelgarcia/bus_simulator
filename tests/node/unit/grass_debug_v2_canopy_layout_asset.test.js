// Compiled layouts may move leaves, but cannot silently change the source or their shapes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGrassCanopyLayoutAsset, applyGrassCanopyLayoutAsset, validateGrassCanopyLayoutAsset } from '../../../src/graphics/gui/grass_debugger_v2/GrassDebugV2CanopyLayoutAsset.js';

function fixture() {
    const array = new Float32Array([0,0,0, .1,0,0, 0,.2,0]);
    const position = { array, getX: i => array[i*3], getY: i => array[i*3+1], getZ: i => array[i*3+2] };
    const mesh = { geometry: { attributes: { position }, index: { getX: i => i }, computeBoundingBox() {}, computeBoundingSphere() {} }, userData: { grassLeafRanges: [{ start:0, count:3 }] } };
    const source = { hash:'a'.repeat(64), vertices:3, leaves:1, periodMeters:1 };
    const reports = { placement:{algorithm:'periodic-best-candidate'}, optimization:{algorithm:'material-feedback', initialLoss:1, finalLoss:.9, initialCoverage:.5, finalCoverage:.5},
        renderedOptimization:{algorithm:'rendered-feedback', published:false, verificationResolution:4096, verificationShadowResolution:8192, verification:{}} };
    const asset = createGrassCanopyLayoutAsset(mesh, source, reports);
    asset.positions = asset.positions.map((v,i) => i%3===0 ? v+.25 : i%3===2 ? v-.125 : v);
    return {mesh,source,asset};
}

test('Grass LOD4 compiled layout restores positions while retaining source attributes', () => {
    const {mesh,source,asset}=fixture(), original=mesh.geometry.attributes.position;
    applyGrassCanopyLayoutAsset(mesh,JSON.parse(JSON.stringify(asset)),source);
    assert.equal(mesh.geometry.attributes.position, original);
    assert.deepEqual([...original.array], [...new Float32Array(asset.positions)]);
    assert.equal(original.needsUpdate,true);
});

test('Grass LOD4 rejects a stale source, invalid data and reshaped leaves before mutation', () => {
    for(const change of [a=>{a.source.hash='b'.repeat(64);},a=>{a.positions.pop();},a=>{a.positions[0]=NaN;},a=>{a.positions[3]+=.02;},a=>{a.positions[1]=.1;}]) {
        const {mesh,source,asset}=fixture(), before=[...mesh.geometry.attributes.position.array];
        const expected=structuredClone(source); change(asset);
        assert.throws(()=>applyGrassCanopyLayoutAsset(mesh,asset,expected));
        assert.deepEqual([...mesh.geometry.attributes.position.array],before);
    }
});

test('Grass LOD4 retains offline density and rendered publication gates', () => {
    const {asset}=fixture(); asset.optimization.finalCoverage=.6;
    assert.throws(()=>validateGrassCanopyLayoutAsset(asset),/pattern validation/);
    asset.optimization.finalCoverage=.5;asset.renderedOptimization.published=true;
    asset.renderedOptimization.verification={loss:2,worstRatio:1.2};
    assert.throws(()=>validateGrassCanopyLayoutAsset(asset),/publication gates/);
});
