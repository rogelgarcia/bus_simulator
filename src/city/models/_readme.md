# src/city/models/

## Contents

- `StreetLamp.js` - Street lamp 3D model with light source (placeholder)
- `TrafficLight.js` - Traffic light 3D model with signal states (placeholder)
- `Trees.js` - Tree 3D models with LOD variants (placeholder)

## Overview

This folder contains reusable 3D model factories for city objects. These are currently placeholder implementations for future city detail features.

**StreetLamp.js** will create street lamp models with geometry for pole, fixture, and bulb, plus associated light sources for nighttime illumination.

**TrafficLight.js** will create traffic light models with geometry for pole, housing, and signal lights (red, yellow, green), with materials that can change emissive intensity based on state.

**Trees.js** will create tree models with procedural or pre-defined geometry, potentially with multiple LOD (Level of Detail) variants for performance optimization at different distances.

## References

- Intended to be used by `../generators/PropGenerator.js` and `../generators/VegetationGenerator.js`
- Will be placed in the city scene by `../City.js` or `../CityWorld.js`
- Will use materials from `../materials/` for consistent appearance
- Similar pattern to `../../buses/models/` for reusable model components

