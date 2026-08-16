// src/graphics/content3d/catalogs/BuildingConfigCatalog.js
// Registry for city building configs.
import { BLUE_BELT_TOWER_BUILDING_CONFIG } from '../buildings/configs/BlueBeltTower.js';
import { BANDED_LOFT_2_BUILDING_CONFIG } from '../buildings/configs/BandedLoft2.js';
import { BEIGE_1_BUILDING_CONFIG } from '../buildings/configs/Beige1.js';
import { BRICK_BANK_2_BUILDING_CONFIG } from '../buildings/configs/BrickBank2.js';
import { BRICK_MIDRISE_BUILDING_CONFIG } from '../buildings/configs/BrickMidrise.js';
import { BRICK_MIDRISE_2_BUILDING_CONFIG } from '../buildings/configs/BrickMidrise2.js';
import { GOV_CENTER_BUILDING_CONFIG } from '../buildings/configs/GovCenter.js';
import { GOV_CENTER_2_BUILDING_CONFIG } from '../buildings/configs/GovCenter2.js';
import { MAIN_STREET_BLOCK_BUILDING_CONFIG } from '../buildings/configs/MainStreetBlock.js';
import { MODERN_RESIDENTIAL_2_BUILDING_CONFIG } from '../buildings/configs/ModernResidential2.js';
import { PIER_GRID_TOWER_2_BUILDING_CONFIG } from '../buildings/configs/PierGridTower2.js';
import { STOREFRONT_ROW_2_BUILDING_CONFIG } from '../buildings/configs/StorefrontRow2.js';
import { STONE_LOWRISE_BUILDING_CONFIG } from '../buildings/configs/StoneLowrise.js';
import { STONE_LOWRISE_2_BUILDING_CONFIG } from '../buildings/configs/StoneLowrise2.js';
import { STONE_SETBACK_TOWER_BUILDING_CONFIG } from '../buildings/configs/StoneSetbackTower.js';

const BUILDING_CONFIGS = Object.freeze([
    BANDED_LOFT_2_BUILDING_CONFIG,
    BEIGE_1_BUILDING_CONFIG,
    BRICK_BANK_2_BUILDING_CONFIG,
    BRICK_MIDRISE_BUILDING_CONFIG,
    BRICK_MIDRISE_2_BUILDING_CONFIG,
    BLUE_BELT_TOWER_BUILDING_CONFIG,
    GOV_CENTER_BUILDING_CONFIG,
    GOV_CENTER_2_BUILDING_CONFIG,
    MAIN_STREET_BLOCK_BUILDING_CONFIG,
    MODERN_RESIDENTIAL_2_BUILDING_CONFIG,
    PIER_GRID_TOWER_2_BUILDING_CONFIG,
    STOREFRONT_ROW_2_BUILDING_CONFIG,
    STONE_SETBACK_TOWER_BUILDING_CONFIG,
    STONE_LOWRISE_BUILDING_CONFIG,
    STONE_LOWRISE_2_BUILDING_CONFIG
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
