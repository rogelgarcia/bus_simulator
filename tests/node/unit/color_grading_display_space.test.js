import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

function read(relativePath) {
    return readFileSync(`${REPO_ROOT}/${relativePath}`, 'utf8');
}

test('color grading is part of the final display transform after tone mapping', () => {
    const shader = read('src/graphics/shaders/postprocessing/postprocessing_output.frag.glsl');
    const toneMapIndex = shader.indexOf('#include <tonemapping_fragment>');
    const gradeIndex = shader.indexOf('vec3 gradedSrgb = sampleDisplayLut(displaySrgb);');
    const encodeIndex = shader.indexOf('#include <colorspace_fragment>');

    assert.ok(toneMapIndex >= 0);
    assert.ok(gradeIndex > toneMapIndex);
    assert.ok(encodeIndex > gradeIndex);
    assert.match(shader, /uEnableToneMapping > 0\.5 && uEnableColorGrading > 0\.5/);
    assert.match(shader, /max\(gl_FragColor\.rgb, vec3\(0\.0\)\)/);
    assert.doesNotMatch(shader, /clamp\(gl_FragColor\.rgb/);
});

test('3D LUT coordinates address texel centers and stay finite at display-domain edges', () => {
    const shader = read('src/graphics/shaders/postprocessing/postprocessing_output.frag.glsl');
    assert.match(shader, /max\(uLutSize, 2\.0\)/);
    assert.match(shader, /clamp\(displaySrgb, 0\.0, 1\.0\) \* \(size - 1\.0\) \+ 0\.5\) \/ size/);

    for (const size of [16, 33]) {
        for (const value of [0, 0.5, 1]) {
            const coordinate = (Math.min(1, Math.max(0, value)) * (size - 1) + 0.5) / size;
            assert.ok(Number.isFinite(coordinate));
            assert.ok(coordinate > 0 && coordinate < 1);
        }
    }
});

test('color grading no longer consumes a separate pre-output composer pass', () => {
    const pipeline = read('src/graphics/visuals/postprocessing/PostProcessingPipeline.js');
    const bloomPipeline = read('src/graphics/visuals/postprocessing/BloomPipeline.js');
    const passFactory = read('src/graphics/visuals/postprocessing/ColorGradingPass.js');

    assert.doesNotMatch(pipeline, /colorGradingPass/);
    assert.doesNotMatch(bloomPipeline, /colorGradingPass/);
    assert.match(pipeline, /setColorGradingOutputState\(this\.outputPass/);
    assert.match(bloomPipeline, /setColorGradingOutputState\(this\.outputPass/);
    assert.doesNotMatch(passFactory, /pass\.enabled\s*=/);
    assert.match(passFactory, /uEnableColorGrading\.value = lutTexture && strength > 0 \? 1 : 0/);

    const compositeIndex = pipeline.indexOf('this.composer.addPass(this.compositePass)');
    const taaIndex = pipeline.indexOf('this.composer.addPass(this.taaPass)');
    const smaaIndex = pipeline.indexOf('this.composer.addPass(this.smaaPass)');
    const fxaaIndex = pipeline.indexOf('this.composer.addPass(this.fxaaPass)');
    const outputIndex = pipeline.indexOf('this.composer.addPass(this.outputPass)');
    assert.ok(compositeIndex < taaIndex && taaIndex < smaaIndex && smaaIndex < fxaaIndex && fxaaIndex < outputIndex);
});

test('cool, vivid, and warm LUTs cover the normalized display domain', () => {
    for (const preset of ['cool', 'vivid', 'warm']) {
        const cube = read(`assets/public/luts/${preset}.cube`);
        const size = Number(cube.match(/^LUT_3D_SIZE\s+(\d+)/m)?.[1]);
        const triples = cube.split(/\r?\n/).filter((line) => /^\s*[+-]?(?:\d|\.)/.test(line));
        assert.ok(size > 1, `${preset} has a valid cube size`);
        assert.equal(triples.length, size ** 3, `${preset} has a complete cube`);
        assert.match(cube, /^DOMAIN_MIN\s+0(?:\.0+)?\s+0(?:\.0+)?\s+0(?:\.0+)?/m);
        assert.match(cube, /^DOMAIN_MAX\s+1(?:\.0+)?\s+1(?:\.0+)?\s+1(?:\.0+)?/m);
    }
});
test('unsupported WebGL1 renderers keep the 3D LUT path gated off', () => {
    const loader = read('src/graphics/visuals/postprocessing/ColorGradingCubeLutLoader.js');
    assert.match(loader, /return !!r\?\.capabilities\?\.isWebGL2/);
    assert.match(loader, /new THREE\.Data3DTexture/);
});