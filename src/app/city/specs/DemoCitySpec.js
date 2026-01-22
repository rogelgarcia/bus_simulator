// src/app/city/specs/DemoCitySpec.js

export function createDemoCitySpec(config) {
    const tileSize = config.map.tileSize;
    const origin = config.map.origin;
    const toWorld = ([x, y]) => ({ x: origin.x + (x | 0) * tileSize, z: origin.z + (y | 0) * tileSize });

    const legacyRoads = [
        { a: [0, 0], b: [4, 4], lanesF: 1, lanesB: 1, tag: 'diag-test' },
        { a: [0, 0], b: [8, 2], lanesF: 2, lanesB: 2, tag: 'diag-shallow' },
        { a: [2, 8], b: [13, 8], lanesF: 2, lanesB: 2, tag: 'arterial' },
        { a: [8, 2], b: [8, 13], lanesF: 2, lanesB: 2, tag: 'arterial' },

        { a: [4, 4], b: [11, 4], lanesF: 1, lanesB: 1, tag: 'collector' },
        { a: [4, 4], b: [4, 11], lanesF: 1, lanesB: 1, tag: 'collector' },
        { a: [4, 11], b: [11, 11], lanesF: 1, lanesB: 1, tag: 'collector' },
        { a: [11, 4], b: [11, 11], lanesF: 1, lanesB: 1, tag: 'collector' },

        { a: [5, 10], b: [6, 10], lanesF: 2, lanesB: 0, tag: 'oneway-east' },
        { a: [6, 10], b: [6, 11], lanesF: 2, lanesB: 0, tag: 'oneway-north' },
        { a: [12, 0], b: [14, 0], lanesF: 1, lanesB: 1, tag: 'test-east-0' },
        { a: [14, 1], b: [12, 1], lanesF: 1, lanesB: 1, tag: 'test-west-1' }
    ];

    return {
        version: 1,
        seed: config.seed,
        width: config.map.width,
        height: config.map.height,
        tileSize: config.map.tileSize,
        origin: config.map.origin,
        roads: legacyRoads.map((road) => ({
            points: [toWorld(road.a), toWorld(road.b)],
            lanesF: road.lanesF,
            lanesB: road.lanesB,
            tag: road.tag
        })),
        buildings: [
            {
                id: 'building_1',
                configId: 'brick_midrise',
                tiles: [[14, 14], [15, 14], [15, 15], [14, 15]]
            },
            {
                id: 'building_2',
                configId: 'stone_lowrise',
                tiles: [[6, 7], [7, 7]]
            }
        ]
    };
}
