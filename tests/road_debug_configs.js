// tests/road_debug_configs.js
export const ROAD_DEBUG_CONFIGS = [
    {
        id: 'angle_135',
        name: 'Two roads 135 deg',
        roads: [
            { a: [2, 2], b: [6, 6], lanesF: 2, lanesB: 2, tag: 'debug-135-a' },
            { a: [6, 6], b: [4, 6], lanesF: 2, lanesB: 2, tag: 'debug-135-b' }
        ]
    },
    {
        id: 't_junction',
        name: 'T junction',
        roads: [
            { a: [2, 4], b: [6, 4], lanesF: 2, lanesB: 2, tag: 'debug-t-a' },
            { a: [4, 4], b: [4, 6], lanesF: 2, lanesB: 2, tag: 'debug-t-b' }
        ]
    }
];
