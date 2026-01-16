// src/graphics/content3d/catalogs/BuildingConfigCatalog.js
// Registry for city building configs.
import { BLUE_BELT_TOWER_BUILDING_CONFIG } from '../buildings/configs/BlueBeltTower.js';
import { BRICK_MIDRISE_BUILDING_CONFIG } from '../buildings/configs/BrickMidrise.js';
import { GOV_CENTER_BUILDING_CONFIG } from '../buildings/configs/GovCenter.js';
import { STONE_LOWRISE_BUILDING_CONFIG } from '../buildings/configs/StoneLowrise.js';
import { STONE_SETBACK_TOWER_BUILDING_CONFIG } from '../buildings/configs/StoneSetbackTower.js';

const BUILDING_CONFIGS = Object.freeze([
    BRICK_MIDRISE_BUILDING_CONFIG,
    BLUE_BELT_TOWER_BUILDING_CONFIG,
    GOV_CENTER_BUILDING_CONFIG,
    STONE_SETBACK_TOWER_BUILDING_CONFIG,
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
