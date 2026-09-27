// Generate the complete comparison study from one leaf and a dependency-ordered recipe catalog.
// @ts-check
import { createGrassDebugV2AssetPipeline } from './GrassDebugV2AssetPipeline.js';
import { resolveGrassDebugV2PipelineConfig } from './GrassDebugV2PipelineConfig.js';
import { createGrassDebugV2SingleLeaf, GRASS_V2_SINGLE_LEAF } from './GrassDebugV2SingleLeaf.js';
import { GRASS_V2_DETAILED_BLADE } from './GrassDebugV2DetailedBlade.js';
import { createGrassDebugV2PlantCards } from './GrassDebugV2PlantCards.js';
import { createGrassDebugV2RandomLeafPatch, GRASS_V2_FIELD_PROFILES } from './GrassDebugV2RandomLeafPatch.js';
import { createGrassDebugV2FloorBake } from './GrassDebugV2FloorBake.js';
import { createGrassDebugV2TextureVolume, GRASS_V2_VOLUME_RECIPE } from './GrassDebugV2TextureVolume.js';
import { createGrassDebugV2RingPatch, GRASS_V2_RING_RECIPE } from './GrassDebugV2RingPatch.js';
import { createGrassDebugV2DirectionalFloor, GRASS_V2_DIRECTIONAL_RECIPE } from './GrassDebugV2DirectionalFloor.js';
import { createGrassDebugV2EdgeLeaves } from './GrassDebugV2EdgeLeaves.js';
import { createGrassDebugV2FloorComparison } from './GrassDebugV2FloorComparison.js';
import { createGrassDebugV2LargeField, GRASS_V2_LARGE_FIELD_RECIPE } from './GrassDebugV2LargeField.js';
import { createGrassDebugV2PatchSubset, disposeGrassDebugV2PatchSubset, countGrassDebugV2Instances } from './GrassDebugV2PatchSubset.js';

/** Generate fresh assets; leaf/material/ground are inputs, never previously baked descendants. */
export async function createGrassDebugV2StudyPipeline({ renderer, material, ground, rootSoil, shadowDirection, leaf = {}, config: overrides = {} }) {
    const config = resolveGrassDebugV2PipelineConfig(overrides);
    const leafParameters = structuredClone({ definition: { ...GRASS_V2_SINGLE_LEAF, ...leaf.definition }, shape: { ...GRASS_V2_DETAILED_BLADE, ...leaf.shape } });
    const volumeRecipe = { ...GRASS_V2_VOLUME_RECIPE, ...config.volume }, ringRecipe = { ...GRASS_V2_RING_RECIPE, ...config.ring };
    const directionalRecipe = { ...GRASS_V2_DIRECTIONAL_RECIPE, ...config.directional }, fieldRecipe = { ...GRASS_V2_LARGE_FIELD_RECIPE, ...config.field };
    const fields = config.configurations.map(item => ({ ...item,
        ...(item.texture ? { textureId: item.texture } : {}),
        ...(item.kind === 'experiment' ? { directional: { ...directionalRecipe, ...item.directional } } : {}),
        edgeLeaves: item.kind === 'edge', experimentalRing: item.kind === 'experiment' }));
    const items = [
        { id: 'leaf/source', dependencies: [], parameters: leafParameters,
            generate: () => createGrassDebugV2SingleLeaf({ material, ...leafParameters }) },
        { id: 'leaf/lods', dependencies: ['leaf/source'], parameters: { nested: true },
            generate: deps => createGrassDebugV2PlantCards(renderer, deps['leaf/source'], { nested: true, rootSoil }) },
        { id: 'patch/reference', dependencies: ['leaf/source', 'leaf/lods'], parameters: { ...config.reference, profiles: config.reference.profiles ?? GRASS_V2_FIELD_PROFILES },
            generate: deps => createGrassDebugV2RandomLeafPatch({ renderer, plant: deps['leaf/source'], cards: deps['leaf/lods'], rootSoil, ...config.reference }) }
    ];
    const textureId = id => 'texture/' + id, sourceId = id => 'capture-source/' + id, configurationId = id => 'configuration/' + id;
    for (const recipe of config.textures) {
        items.push({ id: sourceId(recipe.id), dependencies: ['patch/reference'], parameters: { ...recipe, lod: config.captures.lod },
            generate: deps => createGrassDebugV2PatchSubset(deps['patch/reference'].representations[config.captures.lod].group, recipe.stride, recipe.offset),
            dispose: disposeGrassDebugV2PatchSubset });
        items.push({ id: textureId(recipe.id), dependencies: [sourceId(recipe.id)], parameters: { ...config.captures, ...recipe },
            generate: async deps => {
                const source = deps[sourceId(recipe.id)];
                const bake = await createGrassDebugV2FloorBake({ renderer, source, ground, resolution: recipe.resolution ?? config.captures.resolution });
                const meshes = source.children.filter(mesh => mesh.isInstancedMesh);
                return Object.freeze({ ...bake, getSnapshot: () => ({ ...bake.getSnapshot(),
                    sourceLeaves: countGrassDebugV2Instances(source), sourceLod: 'LOD3 · ' + meshes[0].geometry.index.count / 6,
                    sourceTriangles: meshes.reduce((sum, mesh) => sum + mesh.count * mesh.geometry.index.count / 3, 0) }) });
            } });
    }
    const describeFields = deps => {
        const patch = deps['patch/reference'];
        const compact = count => new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(count);
        return fields.map(field => {
            const textureLeaves = field.texture ? countGrassDebugV2Instances(deps[sourceId(field.texture)]) : 0;
            const originals = patch.representations.refined.group.children.filter(mesh => mesh.isInstancedMesh);
            const geometryLeaves = field.stride ? originals.reduce((sum, mesh) => sum + Math.max(0, Math.ceil((mesh.count - field.offset) / field.stride)), 0) : 0;
            const label = field.kind === 'reference' ? geometryLeaves.toLocaleString('en-US') + ' leaves'
                : 'Texture · ' + compact(textureLeaves) + (field.kind === 'hybrid' ? ' + ' + compact(geometryLeaves) + ' leaves'
                    : field.kind === 'edge' ? ' + LOD3 · 2 edge' : field.kind === 'experiment' ? ' · ' + field.directional.azimuthOffsetsDegrees.length + ' oblique + top · ' + field.directional.resolution + '²' : ' + alpha edge');
            return { ...field, textureLeaves, geometryLeaves, label };
        });
    };
    const shared = ['patch/reference', ...config.textures.flatMap(recipe => [sourceId(recipe.id), textureId(recipe.id)])];
    items.push({ id: 'volume/standard', dependencies: shared, parameters: volumeRecipe, generate: deps => {
        const descriptions = describeFields(deps);
        const bakes = Object.fromEntries(config.textures.map(recipe => [recipe.id, deps[textureId(recipe.id)]]));
        return createGrassDebugV2TextureVolume({ renderer, source: deps['patch/reference'].representations[config.captures.lod].group,
            topBakes: bakes, fields: descriptions.filter(field => field.kind === 'volume' || field.kind === 'edge'), recipe: volumeRecipe });
    } });
    for (const field of fields) {
        const dependencies = ['patch/reference', ...config.textures.map(recipe => sourceId(recipe.id))];
        if (field.texture) dependencies.push(textureId(field.texture));
        if (field.kind === 'volume' || field.kind === 'edge' || field.kind === 'experiment') dependencies.push('volume/standard');
        if (field.kind === 'experiment') {
            items.push({ id: 'ring/' + field.id, dependencies: [sourceId(field.texture)], parameters: ringRecipe,
                generate: deps => createGrassDebugV2RingPatch({ renderer, source: deps[sourceId(field.texture)],
                    x: field.x, z: field.z, recipe: ringRecipe }) });
            items.push({ id: 'directional/' + field.id, dependencies: [sourceId(field.texture), textureId(field.texture), 'ring/' + field.id],
                parameters: field.directional, generate: deps => createGrassDebugV2DirectionalFloor({ renderer,
                    source: deps[sourceId(field.texture)], ground, topBake: deps[textureId(field.texture)],
                    planeHeight: deps['ring/' + field.id].baseHeight, shadowDirection, recipe: field.directional }) });
            dependencies.push('ring/' + field.id, 'directional/' + field.id);
        }
        if (field.kind === 'edge') {
            items.push({ id: 'edge/' + field.id, dependencies: ['patch/reference', 'volume/standard'], parameters: { depthMeters: field.edgeDepth, lod: 'split' },
                generate: deps => createGrassDebugV2EdgeLeaves({ source: deps['patch/reference'].representations.split.group,
                    surfaceHeight: deps['volume/standard'].surfaceHeight, x: field.x, z: field.z, edgeDepth: field.edgeDepth }) });
            dependencies.push('edge/' + field.id);
        }
        items.push({ id: configurationId(field.id), dependencies, parameters: field, generate: deps => {
            const description = describeFields(deps).find(item => item.id === field.id), patch = deps['patch/reference'];
            const originals = { LOD0: patch.lod0, ...Object.fromEntries(Object.entries(patch.representations).map(([mode, value]) => [mode, value.group])) };
            const representations = field.stride && field.id !== 'source' ? Object.fromEntries(Object.entries(originals).map(([mode, source]) => {
                const subset = createGrassDebugV2PatchSubset(source, field.stride, field.offset);
                subset.position.set(field.x, 0, field.z); subset.name = 'GrassV2Comparison-' + field.id + '-' + mode; return [mode, subset];
            })) : null;
            return { field: description, representations, bake: field.texture ? deps[textureId(field.texture)] : null,
                ring: deps['ring/' + field.id] ?? null, directional: deps['directional/' + field.id] ?? null, edge: deps['edge/' + field.id] ?? null,
                dispose: () => { if (representations) Object.values(representations).forEach(disposeGrassDebugV2PatchSubset); } };
        } });
    }
    items.push({ id: 'view/comparison', dependencies: [...shared, 'volume/standard', ...fields.map(field => configurationId(field.id))],
        parameters: config.layout, generate: deps => createGrassDebugV2FloorComparison({ renderer, patch: deps['patch/reference'],
            configurations: Object.fromEntries(fields.map(field => [field.id, deps[configurationId(field.id)]])),
            textureRecipes: config.textures, volume: deps['volume/standard'], layout: config.layout,
            bakes: Object.fromEntries(config.textures.map(recipe => [recipe.id, deps[textureId(recipe.id)]])) }) });
    items.push({ id: 'field/30x20', dependencies: ['view/comparison', configurationId(fieldRecipe.sourceConfigurationId)], parameters: fieldRecipe,
        generate: deps => createGrassDebugV2LargeField({ comparison: deps['view/comparison'], recipe: fieldRecipe }) });
    const pipeline = createGrassDebugV2AssetPipeline({ items, sourceKey: JSON.stringify(leafParameters) });
    await pipeline.buildAll();
    return Object.freeze({ pipeline, config, plant: pipeline.get('leaf/source'), cards: pipeline.get('leaf/lods'), patch: pipeline.get('patch/reference'),
        comparison: pipeline.get('view/comparison'), largeField: pipeline.get('field/30x20'), dispose: pipeline.dispose });
}
