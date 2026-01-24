// City scenario: simple perpendicular crossing.
import { City } from '/src/app/city/City.js';
import { createHarnessCitySpec } from './ScenarioCitySpec.js';
import { createCityMetrics } from './ScenarioMetrics.js';

export const scenarioCityCrossing = {
    id: 'city_crossing',
    async create({ engine, seed, options }) {
        engine.clearScene();

        const mapSpec = createHarnessCitySpec({
            seed,
            size: options?.size ?? 240,
            mapTileSize: options?.mapTileSize ?? 24,
            roads: [
                { a: [1, 5], b: [8, 5], lanesF: 2, lanesB: 2, tag: 'east_west' },
                { a: [4, 1], b: [4, 8], lanesF: 2, lanesB: 2, tag: 'north_south' }
            ],
            buildings: []
        });

        const city = new City({
            size: options?.size ?? 240,
            tileMeters: options?.tileMeters ?? 2,
            mapTileSize: options?.mapTileSize ?? 24,
            seed,
            mapSpec,
            generatorConfig: { render: { treesEnabled: false } }
        });

        engine.context.city = city;
        city.attach(engine);

        engine.camera.position.set(0, 65, 80);
        engine.camera.lookAt(0, 0, 0);

        return {
            update() { city.update(engine); },
            getMetrics() { return createCityMetrics(city); },
            dispose() {
                city.detach(engine);
                engine.context.city = null;
                engine.clearScene();
            }
        };
    }
};
