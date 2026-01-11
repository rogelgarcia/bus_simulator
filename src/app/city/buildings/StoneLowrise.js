// src/app/city/buildings/StoneLowrise.js
import { BUILDING_STYLE } from '../../buildings/BuildingStyle.js';

export const STONE_LOWRISE_BUILDING_CONFIG = Object.freeze({
    id: 'stone_lowrise',
    name: 'Stone lowrise',
    floors: 4,
    floorHeight: 3,
    style: BUILDING_STYLE.STONE_1,
    windows: Object.freeze({ width: 1.8, gap: 1.4, height: 1.2, y: 0.9 })
});
