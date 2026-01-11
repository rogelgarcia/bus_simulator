// src/app/city/buildings/index.js
import { BRICK_MIDRISE_BUILDING_CONFIG } from './BrickMidrise.js';
import { STONE_LOWRISE_BUILDING_CONFIG } from './StoneLowrise.js';

const BUILDING_CONFIGS = Object.freeze([
    BRICK_MIDRISE_BUILDING_CONFIG,
    STONE_LOWRISE_BUILDING_CONFIG
]);

export function getBuildingConfigById(id) {
    const key = typeof id === 'string' ? id : '';
    for (const cfg of BUILDING_CONFIGS) {
        if (cfg?.id === key) return cfg;
    }
    return null;
}

export function getBuildingConfigs() {
    return BUILDING_CONFIGS.slice();
}
