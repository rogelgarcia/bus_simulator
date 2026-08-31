import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
    LOW_CUT_GRASS_ASSET_FAMILY,
    LOW_CUT_GRASS_ATLAS_ROLE,
    LOW_CUT_GRASS_LOCAL_OVERRIDES,
    LOW_CUT_GRASS_MATERIAL_ID,
    LOW_CUT_GRASS_NORMAL_POLICY,
    LOW_CUT_GRASS_PBR_ENTRY,
    LOW_CUT_GRASS_PBR_ENTRIES,
    LOW_CUT_GRASS_SHADER_DEFAULTS,
    LOW_CUT_GRASS_V1_ASSET_FAMILY,
    LOW_CUT_GRASS_V1_MATERIAL_ID
} from '../../../src/graphics/content3d/catalogs/LowCutGrassMaterialCatalog.js';

test('low-cut grass material makes v2 canonical while preserving historical v1 registration', () => {
    assert.equal(LOW_CUT_GRASS_MATERIAL_ID, 'pbr.grass_low_cut_maintained_v2');
    assert.equal(LOW_CUT_GRASS_V1_MATERIAL_ID, 'pbr.grass_low_cut_maintained_v1');
    assert.deepEqual(LOW_CUT_GRASS_PBR_ENTRIES.map((entry) => entry.materialId), [
        LOW_CUT_GRASS_V1_MATERIAL_ID,
        LOW_CUT_GRASS_MATERIAL_ID
    ]);
    assert.equal(LOW_CUT_GRASS_PBR_ENTRY.tileMeters, 1.4);
    assert.equal(LOW_CUT_GRASS_LOCAL_OVERRIDES.tileMeters, 1.4);
    assert.deepEqual(LOW_CUT_GRASS_ASSET_FAMILY.physicalDimensionsMeters, { x: 1.4, z: 1.4 });
    assert.equal(LOW_CUT_GRASS_ASSET_FAMILY.source.license, 'CC0 1.0');
    assert.equal(LOW_CUT_GRASS_ASSET_FAMILY.source.url, 'https://ambientcg.com/view?id=Grass004');
    assert.equal(LOW_CUT_GRASS_ASSET_FAMILY.bakeProfile.profileId, 'grass.natural.maintained.v2');
    assert.deepEqual(LOW_CUT_GRASS_ASSET_FAMILY.bakeProfile.heightMeters, { min: 0.025, max: 0.075 });
    assert.deepEqual(LOW_CUT_GRASS_ASSET_FAMILY.bakeProfile.widthMeters, { min: 0.0022, max: 0.0058 });
    assert.equal(LOW_CUT_GRASS_ASSET_FAMILY.generation.seed, 'grass-material-bake-v2');
    assert.equal(LOW_CUT_GRASS_ASSET_FAMILY.generation.lightingInBaseColor, false);
    assert.equal(LOW_CUT_GRASS_ASSET_FAMILY.materialResponse.emissiveIntensity, 0);
    assert.equal(LOW_CUT_GRASS_ASSET_FAMILY.nearBladeAppearance.baseColor, '#494E30');
    assert.equal(LOW_CUT_GRASS_ASSET_FAMILY.nearBladeAppearance.tipColor, '#616743');
    assert.equal(LOW_CUT_GRASS_ASSET_FAMILY.nearBladeAppearance.paletteSource, 'corrected far_basecolor.png linear-color percentiles');
});

test('far surface, mid cluster, and accent clump retain separated data channels', () => {
    assert.deepEqual(Object.keys(LOW_CUT_GRASS_PBR_ENTRY.mapFiles).sort(), [
        'ao',
        'baseColor',
        'displacement',
        'normal',
        'roughness'
    ]);
    assert.deepEqual(Object.keys(LOW_CUT_GRASS_PBR_ENTRY.auxiliaryMapFiles).sort(), [
        'accentClumpAo',
        'accentClumpColor',
        'accentClumpCoverage',
        'accentClumpNormal',
        'accentClumpRoughness',
        'coverage',
        'height',
        'midClusterAo',
        'midClusterColor',
        'midClusterCoverage',
        'midClusterNormal',
        'midClusterRoughness'
    ]);
    assert.deepEqual(Object.keys(LOW_CUT_GRASS_ASSET_FAMILY.atlases).sort(), [
        LOW_CUT_GRASS_ATLAS_ROLE.ACCENT_CLUMP,
        LOW_CUT_GRASS_ATLAS_ROLE.MID_CLUSTER
    ]);
    for (const atlas of Object.values(LOW_CUT_GRASS_ASSET_FAMILY.atlases)) {
        assert.equal(atlas.variants, 8);
        assert.equal(atlas.materialPaths, 1);
        assert.equal(atlas.alphaToCoverage, true);
        assert.deepEqual(atlas.alphaLayout, { policy: 'separate_alpha_map', channel: 'green' });
        assert.equal(atlas.minFilter, 'linear_mipmap_linear');
        assert.ok(atlas.gutterPixels >= 16);
        assert.deepEqual(atlas.rgbConditioning, {
            policy: 'cell_complete_nearest_opaque',
            sourceAlphaCutoff: 0.35,
            transparentBlackPixels: 0
        });
        assert.ok(atlas.alphaCoverage.lastRequiredMip >= 6);
        assert.equal(atlas.alphaCoverage.minimumUsefulVariants, atlas.variants);
        assert.match(atlas.alphaCoverage.report, /asset\.manifest\.json/);
        for (const axis of ['x', 'y']) {
            const bake = atlas.bakePhysicalDimensionsMeters[axis];
            const runtime = atlas.runtimePhysicalDimensionsMeters[axis];
            assert.ok(Math.abs(runtime - bake) / bake <= 0.05, `${atlas.role} ${axis} must agree within 5%`);
        }
    }
});

test('anti-tiling contract is stable world-space color variation only', async () => {
    assert.equal(LOW_CUT_GRASS_SHADER_DEFAULTS.enabled, true);
    assert.ok(LOW_CUT_GRASS_SHADER_DEFAULTS.macroScaleMeters >= 2);
    assert.ok(LOW_CUT_GRASS_SHADER_DEFAULTS.secondaryBlend <= 0.75);
    const shaderSource = await readFile(new URL(
        '../../../src/graphics/engine3d/grass/LowCutGrassCarpetMaterialSystem.js',
        import.meta.url
    ), 'utf8');
    assert.match(shaderSource, /vLowCutWorldPosition\.xz \/ lowCutMacroScale/);
    assert.match(shaderSource, /#include <map_fragment>/);
    assert.match(shaderSource, /float lowCutRatio = clamp/);
    assert.match(shaderSource, /lowCutPrimaryLuminance/);
    assert.match(shaderSource, /lowCutSecondaryLuminance/);
    assert.doesNotMatch(shaderSource, /vec3 lowCutRatio/);
    assert.doesNotMatch(shaderSource, /gl_Position\s*\+=/);
});

test('Grass Lab V2 atlas consumers are opaque, guttered, and have zero emissive response', async () => {
    const viewSource = await readFile(new URL(
        '../../../src/graphics/gui/grass_debugger/view/GrassDebuggerView.js',
        import.meta.url
    ), 'utf8');
    const atlasShaderSource = await readFile(new URL(
        '../../../src/graphics/engine3d/grass/GrassMidClusterSystem.js',
        import.meta.url
    ), 'utf8');
    assert.match(viewSource, /contract\.channels/);
    assert.match(viewSource, /LOW_CUT_GRASS_ATLAS_ROLE\.MID_CLUSTER/);
    assert.match(viewSource, /LOW_CUT_GRASS_ATLAS_ROLE\.ACCENT_CLUMP/);
    assert.match(viewSource, /_accentClusterMaterial/);
    assert.match(viewSource, /emissive:\s*0x000000/);
    assert.match(viewSource, /emissiveIntensity:\s*0/);
    assert.doesNotMatch(viewSource, /emissiveIntensity:\s*0\.[0-9]/);
    assert.match(viewSource, /transparent:\s*false/);
    assert.match(viewSource, /depthWrite:\s*true/);
    assert.match(viewSource, /auxiliaryKeys: active\.version === 'v1' \? \['coverage'\] : \[\]/);
    assert.match(viewSource, /material\.alphaMap = active\.version === 'v1' \? \(resolved\?\.auxiliaryTextures\?\.coverage \?\? null\) : null/);
    assert.match(viewSource, /material\.alphaTest = active\.version === 'v1' \? 0\.35 : 0/);
    assert.match(viewSource, /auxiliaryKeys: Object\.values\(channels\)/);
    assert.match(viewSource, /material\.alphaMap = channels\.coverage \? \(atlas\[channels\.coverage\] \?\? null\) : null/);
    assert.match(viewSource, /_createGrassAtlasMaterial\([\s\S]*?vertexColors:\s*false/);
    assert.match(atlasShaderSource, /gutterPixels/);
    assert.match(atlasShaderSource, /grassAtlasInset/);
});

test('V2 cards use a physically lit world-up normal blend while V1 keeps historical mesh normals', async () => {
    for (const atlas of Object.values(LOW_CUT_GRASS_ASSET_FAMILY.atlases)) {
        assert.equal(atlas.lighting.normalPolicy, LOW_CUT_GRASS_NORMAL_POLICY.WORLD_UP_BLEND);
        assert.equal(atlas.lighting.worldUpBlend, 1.0);
    }
    assert.equal(LOW_CUT_GRASS_V1_ASSET_FAMILY.atlas.lighting.normalPolicy, LOW_CUT_GRASS_NORMAL_POLICY.MESH);
    assert.equal(LOW_CUT_GRASS_V1_ASSET_FAMILY.atlas.lighting.worldUpBlend, 0);
    assert.equal(LOW_CUT_GRASS_V1_ASSET_FAMILY.atlas.rgbConditioning, undefined);
    assert.equal(LOW_CUT_GRASS_V1_ASSET_FAMILY.atlas.alphaLayout, undefined);

    const shaderSource = await readFile(new URL(
        '../../../src/graphics/engine3d/grass/GrassMidClusterSystem.js',
        import.meta.url
    ), 'utf8');
    assert.match(shaderSource, /const ATLAS_SHADER_VERSION = 6/);
    assert.match(shaderSource, /grassWorldUpNormalBlend/);
    assert.match(shaderSource, /#include <normal_fragment_maps>/);
    assert.match(shaderSource, /mat3\(viewMatrix\) \* vec3\(0\.0, 1\.0, 0\.0\)/);
    assert.match(shaderSource, /normal = normalize\(mix\(normal, grassWorldUpViewNormal, grassWorldUpNormalBlend\)\)/);
    assert.match(shaderSource, /n:\$\{atlas\.lighting\.normalPolicy\}:\$\{String\(atlas\.lighting\.worldUpBlend\)\}/);
    assert.match(shaderSource, /a:\$\{atlas\.alphaLayout\.policy\}:\$\{atlas\.alphaLayout\.channel\}/);
    assert.match(shaderSource, /replaceRequiredShaderChunk/);
    assert.match(shaderSource, /activeAtlas\.lighting\.normalPolicy === LOW_CUT_GRASS_NORMAL_POLICY\.WORLD_UP_BLEND/);
    assert.doesNotMatch(shaderSource, /emissive/);
});

test('runtime cards and full-atlas fixture previews share V2 lighting without sharing UV remapping', async () => {
    const [shaderSource, fixtureSource] = await Promise.all([
        readFile(new URL(
            '../../../src/graphics/engine3d/grass/GrassMidClusterSystem.js',
            import.meta.url
        ), 'utf8'),
        readFile(new URL(
            '../../../src/graphics/gui/grass_debugger/GrassMaterialFixture.js',
            import.meta.url
        ), 'utf8')
    ]);
    assert.match(shaderSource, /export function applyGrassAtlasPreviewShader/);
    assert.match(shaderSource, /applyGrassCardShader\(material, atlasContract, \{ remapAtlasVariant: false \}\)/);
    assert.match(shaderSource, /applyGrassCardShader\(material, atlasContract, \{ remapAtlasVariant: true \}\)/);
    assert.match(shaderSource, /if \(activeConfig\.remapAtlasVariant\)/);
    assert.match(shaderSource, /source\.alphaLayout\?\.policy \?\? 'packed_basecolor_alpha'/);
    assert.match(shaderSource, /alphaLayoutPolicy !== 'packed_basecolor_alpha'/);
    assert.match(shaderSource, /#ifdef USE_ALPHAMAP/);
    assert.match(shaderSource, /vAlphaMapUv = vAlphaMapUv \* grassAtlasScale \+ grassAtlasOffset/);
    assert.doesNotMatch(shaderSource, /grassSampleAlpha|divide_filtered_rgb_by_alpha/);
    assert.match(shaderSource, /grassCardShaderCompiledAlphaLayout = activeAtlas\.alphaLayout\.policy/);
    assert.match(shaderSource, /grassCardShaderCompiledNormalPolicy = activeAtlas\.lighting\.normalPolicy/);
    assert.match(fixtureSource, /material\.alphaMap = channels\.coverage \? \(atlasTextures\[channels\.coverage\] \?\? null\) : null/);
    assert.match(fixtureSource, /applyGrassAtlasPreviewShader\(material, contract\)/);
});

test('Grass Lab exposes deterministic V1/V2 appearance switching for field and fixture captures', async () => {
    const viewSource = await readFile(new URL(
        '../../../src/graphics/gui/grass_debugger/view/GrassDebuggerView.js',
        import.meta.url
    ), 'utf8');
    const fixtureSource = await readFile(new URL(
        '../../../src/graphics/gui/grass_debugger/GrassMaterialFixture.js',
        import.meta.url
    ), 'utf8');
    assert.match(viewSource, /setGrassMaterialVersion\(version\)/);
    assert.match(viewSource, /_materialFixture\?\.setMaterialVersion\?\.\(next\)/);
    assert.match(viewSource, /this\._syncGrassEngineFromState\(this\._state\)/);
    assert.match(viewSource, /midCompiledAlphaLayout/);
    assert.match(viewSource, /midCompiledNormalPolicy/);
    assert.match(viewSource, /midHasAlphaMap/);
    assert.match(viewSource, /midMapAlphaMapDistinct/);
    assert.match(viewSource, /midVertexColorsEnabled/);
    assert.match(viewSource, /baseColor: appearance\.baseColor/);
    assert.match(viewSource, /tipColor: appearance\.tipColor/);
    assert.match(fixtureSource, /setMaterialVersion\(version\)/);
    assert.match(fixtureSource, /this\._atlasPayloads\.set\('v1'/);
    assert.match(fixtureSource, /this\._atlasPayloads\.set\('v2'/);
    assert.match(fixtureSource, /applyGrassAtlasPreviewShader\(material, contract\)/);
});

test('PBR loader declares color space and clamp policy for every atlas family channel', async () => {
    const catalogSource = await readFile(new URL(
        '../../../src/graphics/content3d/catalogs/PbrMaterialCatalog.js',
        import.meta.url
    ), 'utf8');
    const pipelineSource = await readFile(new URL(
        '../../../src/graphics/content3d/materials/PbrTexturePipeline.js',
        import.meta.url
    ), 'utf8');
    assert.match(catalogSource, /import \{ LOW_CUT_GRASS_PBR_ENTRIES \}/);
    assert.match(catalogSource, /\.\.\.LOW_CUT_GRASS_PBR_ENTRIES/);
    assert.match(pipelineSource, /allowedAuxiliaryKeys/);
    for (const colorKey of ['midClusterColor', 'accentClumpColor']) {
        assert.match(pipelineSource, new RegExp(`${colorKey}: Object\\.freeze\\(\\{ srgb: true, wrap: 'clamp' \\}\\)`));
    }
    for (const linearKey of [
        'midClusterCoverage',
        'midClusterNormal',
        'midClusterRoughness',
        'midClusterAo',
        'accentClumpCoverage',
        'accentClumpNormal',
        'accentClumpRoughness',
        'accentClumpAo'
    ]) {
        assert.match(pipelineSource, new RegExp(`${linearKey}: Object\\.freeze\\(\\{ srgb: false, wrap: 'clamp' \\}\\)`));
    }
});

test('Grass Lab waits for PBR availability before constructing material consumers', async () => {
    const viewSource = await readFile(new URL(
        '../../../src/graphics/gui/grass_debugger/view/GrassDebuggerView.js',
        import.meta.url
    ), 'utf8');
    const probeIndex = viewSource.indexOf('await primePbrAssetsAvailability();');
    const sceneIndex = viewSource.indexOf('new THREE.WebGLRenderer');
    const fixtureIndex = viewSource.indexOf('new GrassMaterialFixture');
    assert.ok(probeIndex >= 0);
    assert.ok(sceneIndex > probeIndex);
    assert.ok(fixtureIndex > probeIndex);
});
