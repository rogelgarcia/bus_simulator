// Shares city-editor normalization, settings, and executable JS export behavior.
// @ts-check
import { createCityConfig } from '../CityConfig.js';
import { validateLandscapeCityBinding } from '../../landscape/LandscapeCityBinding.js';

function centeredOrigin(width, height, tileSize) {
    return { x: -width * tileSize / 2 + tileSize / 2, z: -height * tileSize / 2 + tileSize / 2 };
}

/** @param {object} spec @param {object} [cityOptions] @returns {object} */
export function normalizeCitySpec(spec, cityOptions = {}) {
    const input = spec && typeof spec === 'object' ? spec : {}, cfg = createCityConfig(cityOptions);
    const version = Number.isFinite(input.version) ? input.version | 0 : 1;
    const width = Number.isFinite(input.width) ? Math.max(1, input.width | 0) : cfg.map.width;
    const height = Number.isFinite(input.height) ? Math.max(1, input.height | 0) : cfg.map.height;
    const tileSize = Number.isFinite(input.tileSize) ? Number(input.tileSize) : cfg.map.tileSize;
    const originOk = input.origin && Number.isFinite(input.origin.x) && Number.isFinite(input.origin.z);
    const landscape = input.landscape == null ? null : validateLandscapeCityBinding(input.landscape);
    if (landscape && (!originOk || input.width !== width || input.height !== height || !Number.isSafeInteger(input.width) || input.width < 1 || !Number.isSafeInteger(input.height) || input.height < 1 || !Number.isFinite(input.tileSize) || input.tileSize <= 0)) {
        throw new Error('[Landscape] A bound city requires explicit positive grid dimensions, tileSize, and finite origin; it cannot be implicitly recentered.');
    }
    if (landscape) {
        for (const entry of [...(input.buildings ?? []), ...(input.reservations ?? []), ...(input.roads ?? [])]) {
            const squares = entry.tiles ?? entry.squares ?? (entry.a && entry.b ? [entry.a, entry.b] : []);
            for (const square of squares) {
                if (!Array.isArray(square) || !Number.isSafeInteger(square[0]) || !Number.isSafeInteger(square[1]) || square[0] < 0 || square[0] >= width || square[1] < 0 || square[1] >= height) {
                    throw new Error(`[Landscape] City grid excludes authored square ${JSON.stringify(square)} of ${entry.id ?? entry.tag ?? 'construction'}; move or remove the authored entry explicitly before resizing.`);
                }
            }
        }
    }
    return {
        version, seed: String(input.seed ?? cfg.seed ?? 'city'), width, height, tileSize,
        origin: originOk ? { x: input.origin.x, z: input.origin.z } : centeredOrigin(width, height, tileSize),
        roads: Array.isArray(input.roads) ? structuredClone(input.roads) : [],
        buildings: Array.isArray(input.buildings) ? structuredClone(input.buildings) : [],
        reservations: Array.isArray(input.reservations) ? structuredClone(input.reservations) : [],
        ...(landscape ? { landscape } : {})
    };
}

/** @param {object} spec @param {{width?:number,height?:number,seed?:string}} [settings] */
export function applyCitySpecSettings(spec, { width, height, seed } = {}) {
    const current = normalizeCitySpec(spec);
    const nextWidth = Number.isFinite(width) ? Math.max(1, width | 0) : current.width;
    const nextHeight = Number.isFinite(height) ? Math.max(1, height | 0) : current.height;
    return normalizeCitySpec({
        ...current, width: nextWidth, height: nextHeight,
        seed: typeof seed === 'string' && seed.trim() ? seed.trim() : current.seed,
        origin: current.landscape ? current.origin : centeredOrigin(nextWidth, nextHeight, current.tileSize)
    });
}

/** @param {object} spec @returns {string} */
export function serializeCitySpecToModule(spec) {
    const data = JSON.stringify(normalizeCitySpec(spec), null, 2);
    return `// Authoritative city spec exported from the city editor.\nconst CITY_SPEC = ${data};\n\nexport function createCitySpec() {\n    return structuredClone(CITY_SPEC);\n}\n\nexport default createCitySpec;\n`;
}

/** @param {{createCitySpec?:Function,default?:Function}} module @param {object} [cityOptions] */
export function importCitySpecModule(module, cityOptions = {}) {
    const create = module?.createCitySpec ?? module?.default;
    if (typeof create !== 'function') throw new Error('City spec module must export createCitySpec() or a default factory.');
    return normalizeCitySpec(create(createCityConfig(cityOptions)), cityOptions);
}
