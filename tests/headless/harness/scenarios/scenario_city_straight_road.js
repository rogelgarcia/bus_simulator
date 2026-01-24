// City scenario: single straight arterial road.
import { City } from '/src/graphics/visuals/city/City.js';
import { createHarnessCitySpec } from './ScenarioCitySpec.js';
import { createCityMetrics } from './ScenarioMetrics.js';

export const scenarioCityStraightRoad = {
    id: 'city_straight_road',
    async create({ engine, seed, options }) {
        engine.clearScene();

        const mapSpec = createHarnessCitySpec({
            seed,
            size: options?.size ?? 220,
            mapTileSize: options?.mapTileSize ?? 24,
            roads: [
                { a: [1, 4], b: [7, 4], lanesF: 2, lanesB: 2, tag: 'straight' }
            ],
            buildings: []
        });

        const city = new City({
            size: options?.size ?? 220,
            tileMeters: options?.tileMeters ?? 2,
            mapTileSize: options?.mapTileSize ?? 24,
            seed,
            mapSpec,
            generatorConfig: { render: { treesEnabled: false } }
        });

        engine.context.city = city;
        city.attach(engine);

        engine.camera.position.set(0, 55, 65);
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
