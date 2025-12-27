# src/city/generators/

## Contents

- `BuildingGenerator.js` - Procedural building generation (placeholder)
- `MarkingsGenerator.js` - Road markings and lane lines (placeholder)
- `PropGenerator.js` - Street furniture and props (benches, bins, signs) (placeholder)
- `RoadGenerator.js` - Road network generation with asphalt, sidewalks, and curbs
- `SkyGenerator.js` - Sky and atmospheric effects (placeholder)
- `TerrainGenerator.js` - Terrain height and features (placeholder)
- `VegetationGenerator.js` - Trees, grass, and foliage placement (placeholder)

## Overview

This folder contains procedural content generators for city elements.

**BuildingGenerator.js** will create procedural buildings with varying heights, styles, and details based on city zones (placeholder).

**MarkingsGenerator.js** will generate road surface markings including lane lines, crosswalks, arrows, and parking spaces (placeholder).

**PropGenerator.js** will place street furniture like benches, trash bins, street signs, and other urban details (placeholder).

**RoadGenerator.js** generates the road network from a CityMap. It creates instanced meshes for asphalt surfaces, sidewalks, and curbs. Handles both straight road segments (EW/NS) and intersections with proper corner sidewalks. Curbs are positioned at the edges of asphalt to create realistic street boundaries. Uses configurable lane widths, shoulder widths, and curb dimensions from CityConfig.

**SkyGenerator.js** will handle advanced sky rendering, clouds, and atmospheric scattering (placeholder - currently sky is handled by `City.js` gradient dome).

**TerrainGenerator.js** will generate terrain elevation, hills, and natural features (placeholder).

**VegetationGenerator.js** will place trees, bushes, grass patches, and other vegetation based on terrain and city layout (placeholder).

## References

- Intended to be used by `../City.js` or `../CityWorld.js` during city construction
- Will use `../CityMap.js` for layout information
- Will use `../CityRNG.js` for deterministic randomness
- Will use materials from `../materials/` for visual appearance

