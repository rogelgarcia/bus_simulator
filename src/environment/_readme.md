# src/environment/

## Contents

- `GarageModel.js` - Creates a detailed 3D garage environment with geometry and lighting
- `ProceduralTextures.js` - Generates canvas-based procedural textures for surfaces

## Overview

This folder contains environment and scene generation code.

**GarageModel.js** builds a complete garage scene including floor, walls, ceiling, corner posts, ceiling beams, a roll-up gate, floor lane markings, and multiple light fixtures (ceiling downlights and wall-mounted tube lamps). It returns both the geometry group and an array of lights to be added to the scene.

**ProceduralTextures.js** generates textures programmatically using the Canvas API. It creates an asphalt texture (with noise, specks, stains, and cracks) for the floor and a corrugated metal texture (with ridges, panel seams, rivets, and grime) for the walls. Textures are cached after first generation.

## References

- `GarageModel.js` is used by `../states/BusSelectState.js` to create the bus selection environment
- `ProceduralTextures.js` is used internally by `GarageModel.js` for floor and wall materials
- Textures use Three.js CanvasTexture with proper color space settings

