import test from 'node:test';
import assert from 'node:assert/strict';
import { validateGrassCanopyRenderedExposure } from '../../../src/graphics/gui/grass_debugger_v2/GrassDebugV2CanopyRenderedScore.js';

const visible = { sampleCount:9216,clippedFraction:0,blackFraction:0,minimum:48,maximum:190,mean:120 };
test('Rendered canopy evidence rejects clipped white and black or flat views',()=>{
    assert.doesNotThrow(()=>validateGrassCanopyRenderedExposure(visible));
    for(const change of [{clippedFraction:.02},{blackFraction:.02},{mean:254.9,minimum:254,maximum:255},
        {minimum:119.8,maximum:120.2},{sampleCount:0},{clippedFraction:NaN}])
        assert.throws(()=>validateGrassCanopyRenderedExposure({...visible,...change}),/clipped or degenerate/);
});
