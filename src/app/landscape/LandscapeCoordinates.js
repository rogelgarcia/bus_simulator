// Converts native raster and city-center coordinates without renderer dependencies.
// @ts-check
import { requireCondition, requireFinite, requireInteger } from './internal/LandscapeValidation.js';

/** @param {import('./LandscapeManifest.js').LandscapeManifest} manifest @param {number} column @param {number} row @returns {{x:number,z:number}} */
export function landscapeGridToWorld(manifest, column, row) {
    requireFinite(column, 'column');
    requireFinite(row, 'row');
    requireCondition(column >= 0 && column <= manifest.grid.columns - 1 && row >= 0 && row <= manifest.grid.rows - 1, 'grid position is outside the landscape');
    return { x: manifest.bounds.minX + column * manifest.grid.spacingX, z: manifest.bounds.maxZ - row * manifest.grid.spacingZ };
}

/** @param {import('./LandscapeManifest.js').LandscapeManifest} manifest @param {number} x @param {number} z @returns {{status:string,column?:number,row?:number}} */
export function landscapeWorldToGrid(manifest, x, z) {
    requireFinite(x, 'x');
    requireFinite(z, 'z');
    const { minX, maxX, minZ, maxZ } = manifest.bounds;
    if (x < minX || x > maxX || z < minZ || z > maxZ) return { status: 'outside' };
    return { status: 'ready', column: (x - minX) / manifest.grid.spacingX, row: (maxZ - z) / manifest.grid.spacingZ };
}

/** @typedef {{origin:{x:number,z:number},tileSize:number,width:number,height:number}} LandscapeCityGrid */

function validateCityGrid(grid) {
    requireFinite(grid.origin?.x, 'city origin.x');
    requireFinite(grid.origin?.z, 'city origin.z');
    requireFinite(grid.tileSize, 'city tileSize');
    requireCondition(grid.tileSize > 0, 'city tileSize must be positive');
    requireInteger(grid.width, 1, 1000000, 'city width');
    requireInteger(grid.height, 1, 1000000, 'city height');
}

/** @param {LandscapeCityGrid} grid @param {number} column @param {number} row @returns {{x:number,z:number}} */
export function landscapeCityTileToWorld(grid, column, row) {
    validateCityGrid(grid);
    requireInteger(column, 0, grid.width - 1, 'city tile column');
    requireInteger(row, 0, grid.height - 1, 'city tile row');
    return { x: grid.origin.x + column * grid.tileSize, z: grid.origin.z + row * grid.tileSize };
}

/** @param {LandscapeCityGrid} grid @param {number} x @param {number} z @returns {{status:string,column:number,row:number}} */
export function landscapeWorldToCityTile(grid, x, z) {
    validateCityGrid(grid);
    requireFinite(x, 'x');
    requireFinite(z, 'z');
    const column = Math.floor((x - grid.origin.x) / grid.tileSize + 0.5);
    const row = Math.floor((z - grid.origin.z) / grid.tileSize + 0.5);
    const status = column < 0 || row < 0 || column >= grid.width || row >= grid.height ? 'outside' : 'ready';
    return { status, column, row };
}
