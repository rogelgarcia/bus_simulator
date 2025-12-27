# src/city/materials/

## Contents

- `CityMaterials.js` - Shared material definitions for city objects (road, sidewalk, curb)
- `CityTextures.js` - Procedural texture generation for city surfaces

## Overview

This folder contains material and texture systems for city rendering.

**CityMaterials.js** provides cached material definitions for city infrastructure. The `getCityMaterials()` function returns shared materials for:
- `road` - Dark asphalt material (0x2b2b2b, high roughness)
- `sidewalk` - Light concrete material (0x8b8b8b, full roughness)
- `curb` - Medium gray curb material (0x6f6f6f, full roughness)

Materials are cached after first creation for performance.

**CityTextures.js** provides procedural texture generation for city surfaces. Currently implements `generateGrass()` which creates a tileable grass texture with pixel noise, color variation, and roughness mapping. The `getCityTextures()` function caches generated textures and returns them for reuse.

The grass texture generation:
- Creates a 512x512 canvas with base green color
- Adds per-pixel color variation for organic appearance
- Generates separate roughness map for realistic lighting
- Returns both color map and roughness map as Three.js CanvasTextures
- Configured for 200x repeat to cover large ground planes

## References

- `CityMaterials.js` is used by `../generators/RoadGenerator.js` for road surface materials
- `CityTextures.js` is currently unused (grass texture loaded from `assets/grass.png` instead)
- Intended to be used by `../generators/` for procedural surface materials
- Will be used by `../models/` for object materials
- Similar pattern to `../../environment/ProceduralTextures.js` for garage textures

