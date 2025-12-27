# src/city/engines/

## Contents

- `PedestrianEngine.js` - Pedestrian simulation and pathfinding (placeholder)
- `TrafficLightEngine.js` - Traffic light state management and timing (placeholder)
- `VehicleEngine.js` - Vehicle traffic simulation and routing (placeholder)

## Overview

This folder contains simulation engines that manage dynamic city elements. These are currently placeholder implementations for future traffic and pedestrian systems.

**PedestrianEngine.js** will handle pedestrian spawning, pathfinding along sidewalks, and animation.

**TrafficLightEngine.js** will manage traffic light states, timing cycles, and synchronization across intersections.

**VehicleEngine.js** will handle vehicle spawning, routing along roads, lane following, and traffic behavior.

## References

- Intended to be used by `../City.js` for city simulation updates
- Will interact with `../CityNavGraph.js` for pathfinding
- Will use models from `../models/` for visual representation

