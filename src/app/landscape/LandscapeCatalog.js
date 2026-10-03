// Declares semantic soil independently from imported land cover and rendering.
// @ts-check

/** @typedef {{id:string,label:string,materialId:string,biome:string}} LandscapeSoil */
/** @typedef {{id:number,label:string,color:string,soilId:string,planningOnly:boolean}} LandscapeLandCover */

/** @type {ReadonlyArray<Readonly<LandscapeSoil>>} */
export const LANDSCAPE_SOIL_CATALOG = Object.freeze([
    { id: 'unknown', label: 'Unspecified substrate', materialId: 'pbr.landscape_soil_uniform_v1', biome: 'land' },
    { id: 'seabed', label: 'Seabed substrate', materialId: 'pbr.aerial_beach_01', biome: 'land' },
    { id: 'sand', label: 'Sand', materialId: 'pbr.aerial_beach_01', biome: 'land' },
    { id: 'loam', label: 'Loam', materialId: 'pbr.landscape_grass_uniform_v1', biome: 'grass' },
    { id: 'forest', label: 'Forest soil', materialId: 'pbr.landscape_forest_soil_uniform_v1', biome: 'land' },
    { id: 'rock', label: 'Exposed rock', materialId: 'pbr.landscape_rock_uniform_v1', biome: 'stone' }
].map((entry) => Object.freeze(entry)));

/** @type {ReadonlyArray<Readonly<LandscapeLandCover>>} */
export const LANDSCAPE_LAND_COVER_CATALOG = Object.freeze([
    { id: 0, label: 'Water / seabed', color: '#597c86', soilId: 'seabed', planningOnly: false },
    { id: 1, label: 'Sand / beach', color: '#d9c58f', soilId: 'sand', planningOnly: false },
    { id: 2, label: 'Grass / low scrub', color: '#8eab66', soilId: 'loam', planningOnly: false },
    { id: 3, label: 'Forest soil', color: '#496b42', soilId: 'forest', planningOnly: false },
    { id: 4, label: 'Exposed rock', color: '#949084', soilId: 'rock', planningOnly: false },
    { id: 5, label: 'Urban ground (planning)', color: '#b4aa95', soilId: 'unknown', planningOnly: true },
    { id: 6, label: 'Road surface (planning)', color: '#626365', soilId: 'unknown', planningOnly: true },
    { id: 7, label: 'Runway (planning)', color: '#454a50', soilId: 'unknown', planningOnly: true }
].map((entry) => Object.freeze(entry)));
