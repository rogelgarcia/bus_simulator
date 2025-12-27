// src/assets3d/buses.js
// Public re-export surface for all bus 3D models and skeletons.

export { createCityBus } from './models/buses/CityBus.js';
export { createCoachBus } from './models/buses/CoachBus.js';
export { createDoubleDeckerBus } from './models/buses/DoubleDeckerBus.js';

// Skeleton & tuning utilities
export { BusSkeleton, attachBusSkeleton } from '../skeletons/buses/BusSkeleton.js';
export { tuneBusMaterials } from './factories/tuneBusMaterials.js';
