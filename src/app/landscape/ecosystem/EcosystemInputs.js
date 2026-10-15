// Assembles the ecosystem rule input vector at a position from renderer-independent sources: terrain, fields, geology, planning and neighbouring layers.
// @ts-check
// Design: the sampler owns the mapping from sources to named inputs and nothing else; the sources are plain functions the bake (files) and the
// worker (loaders) implement. A missing source leaves its inputs at their neutral values and is reported in `availability`, so a recipe evaluates
// on a landscape without sidecars and the trace says what was really read. The AI577 dressing inputs are evaluated exactly as the terrain shader's
// mirror does (display soil, planning share, fields), so their documented meaning is unchanged inside the new model.
import { LANDSCAPE_DRESSING_INPUTS, sampleLandscapeDressingInputs } from '../LandscapeDressingInputs.js';
import { LANDSCAPE_GEOLOGY_CATEGORIES, LANDSCAPE_GEOLOGY_CHANNELS } from '../LandscapeGeology.js';
import { requireCondition, requireFinite } from '../internal/LandscapeValidation.js';
import { ECOSYSTEM_COVER_CLASSES, ECOSYSTEM_DISTANCE_CAP, ECOSYSTEM_PLANNING_COVER_IDS, ECOSYSTEM_SOILS, createEcosystemInputCatalog } from './EcosystemRules.js';

/**
 * @typedef {{height:number,normal:{x:number,y:number,z:number},slopeDegrees:number,soilId:string,landCoverId:number,seaLevel:number}} EcosystemTerrainSample
 * @typedef {{wetness:number,flow:number,deposition:number,rockExposure:number,skyView:number,shoreDistance:number,convexity:number,slopeDegrees:number}} EcosystemFieldsSample
 * @typedef {{channels:Record<string,number>,categories:Record<string,number>}} EcosystemGeologySample
 * @typedef {{terrain:(x:number,z:number)=>EcosystemTerrainSample|null, fields?:((x:number,z:number)=>EcosystemFieldsSample|null)|null, naturalSoil?:((x:number,z:number)=>string|null)|null,
 *   geology?:((x:number,z:number)=>EcosystemGeologySample|null)|null, roadDistance?:((x:number,z:number)=>number|null)|null, districtDistance?:((x:number,z:number)=>number|null)|null,
 *   viewCorridor?:((x:number,z:number)=>boolean|null)|null, coverDistance?:((x:number,z:number,landCoverId:number)=>number|null)|null, layerDistance?:((x:number,z:number,layerId:string)=>number|null)|null}} EcosystemInputSources
 */

const clampDistance = value => Math.min(ECOSYSTEM_DISTANCE_CAP, Math.max(0, value));

/**
 * @param {{layerIds:readonly string[],sources:EcosystemInputSources}} options layerIds in recipe order (the catalog's `distance.layer.*` inputs)
 */
export function createEcosystemInputSampler({ layerIds, sources }) {
    requireCondition(!!sources && typeof sources.terrain === 'function', 'ecosystem input sampler needs a terrain source');
    const catalog = createEcosystemInputCatalog(layerIds);
    const at = Object.fromEntries(catalog.entries.map(entry => [entry.name, catalog.index(entry.name)]));
    const soilIndex = Object.fromEntries(ECOSYSTEM_SOILS.map(id => [id, at[`soil.${id}`]])), naturalIndex = Object.fromEntries(ECOSYSTEM_SOILS.map(id => [id, at[`naturalSoil.${id}`]]));
    const coverIndex = ECOSYSTEM_COVER_CLASSES.map(name => at[`cover.${name}`]), coverDistanceIndex = ECOSYSTEM_COVER_CLASSES.map(name => at[`distance.cover.${name}`]);
    const geologyChannelIndex = LANDSCAPE_GEOLOGY_CHANNELS.map(channel => [channel.name, at[`geology.${channel.name}`]]);
    const geologyLabelIndex = LANDSCAPE_GEOLOGY_CATEGORIES.filter(category => category.labels).map(category => [category.name, category.labels.map(label => at[`geology.${category.name}.${label}`])]);
    const layerDistanceIndex = layerIds.map(id => [id, at[`distance.layer.${id}`]]);
    const dressingIndex = LANDSCAPE_DRESSING_INPUTS.outputs.map(name => at[`dressing.${name}`]);
    const fieldsOf = fields => fields ? { wetness: fields.wetness, flow: fields.flow, deposition: fields.deposition, rockExposure: fields.rockExposure, skyView: fields.skyView, shoreDistance: fields.shoreDistance, convexity: fields.convexity, slopeDegrees: fields.slopeDegrees } : null;
    return Object.freeze({
        catalog,
        /**
         * Fills `vector` (or a fresh neutral vector) at a world position; null outside the terrain.
         * @param {number} x @param {number} z @param {Float64Array} [vector]
         * @returns {{vector:Float64Array,terrain:EcosystemTerrainSample,availability:{fields:boolean,geology:boolean,naturalSoil:boolean,planning:boolean,coverDistance:boolean,layerDistance:boolean},displaySoil:string}|null}
         */
        sample(x, z, vector = catalog.neutralVector()) {
            requireFinite(x, 'sample x'); requireFinite(z, 'sample z');
            const terrain = sources.terrain(x, z);
            if (!terrain) return null;
            catalog.reset(vector);
            const normal = terrain.normal, horizontal = Math.sqrt(normal.x * normal.x + normal.z * normal.z);
            vector[at.slopeDegrees] = terrain.slopeDegrees;
            vector[at.aspectNorth] = horizontal > 1e-9 ? normal.z / horizontal : 0;
            vector[at.aspectEast] = horizontal > 1e-9 ? normal.x / horizontal : 0;
            vector[at.altitudeMeters] = terrain.height - terrain.seaLevel;
            const planning = ECOSYSTEM_PLANNING_COVER_IDS.includes(terrain.landCoverId);
            vector[at.planningShare] = planning ? 1 : 0;
            requireCondition(Object.hasOwn(soilIndex, terrain.soilId), `ecosystem inputs do not know soil ${terrain.soilId}`);
            vector[soilIndex.unknown] = 0; vector[soilIndex[terrain.soilId]] = 1;
            const natural = planning ? sources.naturalSoil?.(x, z) ?? null : null, displaySoil = natural ?? terrain.soilId;
            requireCondition(Object.hasOwn(naturalIndex, displaySoil), `ecosystem inputs do not know natural soil ${displaySoil}`);
            vector[naturalIndex.unknown] = 0; vector[naturalIndex[displaySoil]] = 1;
            if (terrain.landCoverId < coverIndex.length) vector[coverIndex[terrain.landCoverId]] = 1;
            const fields = fieldsOf(sources.fields?.(x, z) ?? null);
            if (fields) {
                vector[at.moisture] = fields.wetness; vector[at.light] = fields.skyView; vector[at.shoreDistanceMeters] = fields.shoreDistance; vector[at.flow] = fields.flow;
                vector[at.deposition] = fields.deposition; vector[at.rockExposure] = fields.rockExposure; vector[at.convexity] = fields.convexity;
                vector[at['distance.water']] = clampDistance(fields.shoreDistance);
            } else if (terrain.height < terrain.seaLevel) { vector[at.shoreDistanceMeters] = -ECOSYSTEM_DISTANCE_CAP; vector[at['distance.water']] = 0; }
            const geology = sources.geology?.(x, z) ?? null;
            if (geology) {
                for (const [name, index] of geologyChannelIndex) { requireFinite(geology.channels[name], `geology.${name}`); vector[index] = geology.channels[name]; }
                for (const [name, labels] of geologyLabelIndex) { const label = geology.categories[name]; requireCondition(Number.isInteger(label) && label >= 0 && label < labels.length, `geology ${name} label ${label} is out of range`); labels.forEach((index, i) => { vector[index] = i === label ? 1 : 0; }); }
                vector[at['geology.lithology']] = geology.categories.lithology;
            }
            const roads = sources.roadDistance?.(x, z) ?? null, districts = sources.districtDistance?.(x, z) ?? null;
            if (roads !== null) vector[at['distance.roads']] = clampDistance(roads);
            if (districts !== null) vector[at['distance.districts']] = clampDistance(districts);
            let coverDistance = false;
            if (sources.coverDistance) for (let id = 0; id < coverDistanceIndex.length; id++) { const value = sources.coverDistance(x, z, id); if (value !== null) { vector[coverDistanceIndex[id]] = clampDistance(value); coverDistance = true; } }
            let layerDistance = false;
            if (sources.layerDistance) for (const [id, index] of layerDistanceIndex) { const value = sources.layerDistance(x, z, id); if (value !== null) { vector[index] = clampDistance(value); layerDistance = true; } }
            const dressing = sampleLandscapeDressingInputs({ soilWeights: { [displaySoil]: 1 }, planningShare: planning ? 1 : 0, fields });
            LANDSCAPE_DRESSING_INPUTS.outputs.forEach((name, i) => { vector[dressingIndex[i]] = dressing[name]; });
            return { vector, terrain, displaySoil, availability: { fields: !!fields, geology: !!geology, naturalSoil: natural !== null, planning: roads !== null || districts !== null, coverDistance, layerDistance } };
        },
        /** Names and values of a vector (the inspection trace). @param {Float64Array} vector */
        describe(vector) { return Object.fromEntries(catalog.entries.map((entry, i) => [entry.name, vector[i]])); }
    });
}

/**
 * Whether a position lies in a named exclusion zone (with its margin), from the sampled terrain and sources; recipe zones are regions.
 * @param {string} zone @param {number} marginMeters @param {{x:number,z:number,terrain:EcosystemTerrainSample,vector:Float64Array,catalog:ReturnType<typeof createEcosystemInputCatalog>}} sample
 * @param {{zones:Record<string,any>,viewCorridor?:((x:number,z:number)=>boolean|null)|null,regionDistance:(region:any,x:number,z:number)=>number}} context
 */
export function ecosystemExcludedBy(zone, marginMeters, sample, context) {
    const { x, z, terrain, vector, catalog } = sample;
    if (zone === 'planning-cover') return ECOSYSTEM_PLANNING_COVER_IDS.includes(terrain.landCoverId) || (marginMeters > 0 && ECOSYSTEM_PLANNING_COVER_IDS.some(id => vector[catalog.index(`distance.cover.${ECOSYSTEM_COVER_CLASSES[id]}`)] < marginMeters));
    if (zone === 'roads') return vector[catalog.index('distance.roads')] <= marginMeters;
    if (zone === 'districts') return vector[catalog.index('distance.districts')] <= marginMeters;
    if (zone === 'water') return terrain.height < terrain.seaLevel || vector[catalog.index('distance.water')] <= marginMeters;
    if (zone === 'faces') return vector[catalog.index('geology.faceMask')] >= .5;
    if (zone === 'view-corridor') return context.viewCorridor?.(x, z) === true;
    const region = context.zones[zone];
    requireCondition(!!region, `unknown exclusion zone ${zone}`);
    return context.regionDistance(region, x, z) >= -marginMeters;
}
