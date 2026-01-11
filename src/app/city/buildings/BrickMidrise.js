// src/app/city/buildings/BrickMidrise.js
import { BUILDING_STYLE } from '../../buildings/BuildingStyle.js';

export const BRICK_MIDRISE_BUILDING_CONFIG = Object.freeze({
    id: 'brick_midrise',
    name: 'Brick midrise',
    floors: 5,
    floorHeight: 3,
    style: BUILDING_STYLE.BRICK,
    windows: Object.freeze({ width: 2.2, gap: 1.6, height: 1.4, y: 1.0 })
});

