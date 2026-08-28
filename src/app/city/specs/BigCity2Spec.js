// src/app/city/specs/BigCity2Spec.js
// Big City 2 layout spec (source of truth: this JS module; JSON export is generated).
// @ts-check

import { BRADBURY_BLOCK_BUILDING_CONFIG } from '../../../graphics/content3d/buildings/configs/BradburyBlock.js';

// Bradbury Block on the avenue corner parcel (replaces the gov center slab).
// The config is authored with its chamfer at the (+x,+z) corner; this parcel's
// street junction is at (min x, max z) — the 6-lane avenue at z=48 to the
// south, the diagonal side street to the west — so the footprint rotates 90°
// CCW ((x,z) → (−z,x)) and the per-face designs re-key to the letters the
// ROTATED geometry derives (face ids are geometric): A = avenue front ← the
// portal design (config C), B = east ← the full-length side design (config
// D), C = back ← the full-length entry design (config E), D = west street ←
// the side design (config A), E = the chamfer (config B). All faces solve
// EXACTLY: the config's bays are fixed and its footprint derives from them.
// Per the user: fire escapes ride the BACK face, the BRADBURY lettering
// follows the portal onto face A, and the placement is ANCHORED — authored
// world coordinates, front flush with the avenue sidewalk (the tile-derived
// build area would otherwise re-center it into the lawn and squeeze it, the
// road tile row being excluded from that area).
function createBradburyCornerEntry() {
    const src = BRADBURY_BLOCK_BUILDING_CONFIG;
    const clone = (value) => JSON.parse(JSON.stringify(value));

    // Rotate 90° CCW, then translate: west edge just inside the parcel,
    // front edge at the avenue sidewalk line (centerline z=48 minus 3 lanes
    // × 4.8 + shoulder 0.525 + sidewalk 1.875 ≈ 16.8).
    const rotated = (src.footprintLoops?.[0] ?? []).map((p) => ({ x: -p.z, z: p.x }));
    const minX = Math.min(...rotated.map((p) => p.x));
    const maxZ = Math.max(...rotated.map((p) => p.z));
    const WEST_EDGE = -92;
    const FRONT_EDGE = 31.1;
    const loop = rotated.map((p) => ({ x: p.x - minX + WEST_EDGE, z: p.z - maxZ + FRONT_EDGE }));

    const facades = {};
    for (const [layerId, faces] of Object.entries(src.facades ?? {})) {
        facades[layerId] = {
            A: clone(faces.C),
            B: clone(faces.D),
            C: clone(faces.E),
            D: clone(faces.A),
            E: clone(faces.B)
        };
    }

    // Back face (C) carries the full-length entry layout; the escapes ride
    // its field pairs and the raised end pavilion.
    const escapeBays = ['f3_w1', 'f3_w3', 'ep_w'];
    const attachments = {
        items: clone(src.attachments?.items ?? []).map((item, index) => ({
            ...item,
            target: {
                ...item.target,
                faceId: 'C',
                bayId: escapeBays[index] ?? item.target.bayId
            }
        }))
    };

    const wallDecorations = {
        lettering: clone(src.wallDecorations?.lettering ?? []).map((sign) => ({
            ...sign,
            target: { ...sign.target, bayRef: 'A:entry_8' }
        }))
    };

    return {
        id: 'building_9',
        configId: 'bradbury_block',
        tiles: [
            [8, 13], [9, 13], [10, 13],
            [8, 12], [9, 12], [10, 12],
            [8, 11], [9, 11], [10, 11]
        ],
        footprintLoops: [loop],
        footprintPlacement: 'anchor',
        facades,
        attachments,
        wallDecorations,
        rendered: true
    };
}

// Modern Bank on the next avenue parcel east of the Bradbury. Authored as a
// PARCEL (AI 519), not as world coordinates: it claims four squares, may
// extend west up to 8 m from the Bradbury, and fills out to the avenue street
// line (the kerb line, which sits INSIDE the road tile row the tile grid would
// have cut it at). The bus start reservation sits in the lawn strip west of
// the parcel and cuts it, so the bank is laid out around the bus instead of
// over it. The config's front is its +z face and the avenue runs along +z, so
// the design needs no rotation.
function createModernBankAvenueParcel() {
    return {
        id: 'building_9_b',
        configId: 'modern_bank',
        squares: [
            [11, 13], [12, 13],
            [11, 12], [12, 12]
        ],
        placement: {
            limits: {
                north: 'street',
                west: { type: 'construction', id: 'building_9', padding: 8 }
            },
            padding: 2,
            front: 'north',
            align: 'center'
        },
        rendered: true
    };
}

// The player bus starting position: a construction that is not a building —
// fixed size, reserved against the city grid, keep-out for the buildings
// around it, and carrying its own ground treatment (a slab that runs into the
// avenue sidewalk). It takes the lawn strip between the Bradbury and the bank,
// against the same avenue street line both buildings address, and shares the
// Bradbury's square deliberately.
function createBusStartReservation() {
    return {
        id: 'bus_start',
        type: 'bus_start',
        squares: [[10, 13]],
        size: { width: 5.2, depth: 14.0 },
        yawDeg: 0,
        clearance: 1.5,
        ground: 'slab',
        sharesSquaresWith: ['building_9'],
        placement: {
            limits: { north: 'street' },
            padding: 4,
            front: 'north'
        }
    };
}

function tileToWorldPoint(tile, origin, tileSize) {
    const x = tile?.[0] | 0;
    const y = tile?.[1] | 0;
    const org = origin && Number.isFinite(origin.x) && Number.isFinite(origin.z) ? origin : { x: 0, z: 0 };
    const ts = Number.isFinite(tileSize) ? tileSize : 1;
    return { x: org.x + x * ts, z: org.z + y * ts };
}

function convertLegacyRoadSegmentsToPolyline(spec) {
    const tileSize = Number.isFinite(spec?.tileSize) ? spec.tileSize : 1;
    const originRaw = spec?.origin;
    const origin = originRaw && Number.isFinite(originRaw.x) && Number.isFinite(originRaw.z) ? originRaw : { x: 0, z: 0 };

    const roadsIn = Array.isArray(spec?.roads) ? spec.roads : [];
    const roadsOut = roadsIn.map((road) => {
        if (Array.isArray(road?.points) && road.points.length >= 2) return road;
        if (!Array.isArray(road?.a) || !Array.isArray(road?.b)) return road;
        const { a, b, ...rest } = road;
        return {
            ...rest,
            points: [tileToWorldPoint(a, origin, tileSize), tileToWorldPoint(b, origin, tileSize)]
        };
    });

    return { ...spec, roads: roadsOut };
}

export const BIG_CITY_2_SPEC_SOURCE = Object.freeze(
    {
        "version": 1,
        "seed": "x",
        "width": 25,
        "height": 25,
        "tileSize": 24,
        "origin": {
            "x": -288,
            "z": -288
        },
        "roads": [
            {
                "points": [
                    {
                        "x": -240,
                        "z": 48
                    },
                    {
                        "x": 216,
                        "z": 48
                    }
                ],
                "defaultRadius": 0,
                "lanesF": 3,
                "lanesB": 3,
                "tag": "road",
                "rendered": true
            },
            {
                "points": [
                    {
                        "x": 216,
                        "z": 48
                    },
                    {
                        "x": 264,
                        "z": 0
                    }
                ],
                "defaultRadius": 0,
                "lanesF": 3,
                "lanesB": 3,
                "tag": "road",
                "rendered": true
            },
            {
                "points": [
                    {
                        "x": 264,
                        "z": -240
                    },
                    {
                        "x": 240,
                        "z": -264
                    }
                ],
                "defaultRadius": 0,
                "lanesF": 2,
                "lanesB": 2,
                "tag": "road",
                "rendered": true
            },
            {
                "points": [
                    {
                        "x": 240,
                        "z": -264
                    },
                    {
                        "x": 120,
                        "z": -264
                    }
                ],
                "defaultRadius": 0,
                "lanesF": 2,
                "lanesB": 2,
                "tag": "road",
                "rendered": true
            },
            {
                "points": [
                    {
                        "x": 120,
                        "z": -264
                    },
                    {
                        "x": 72,
                        "z": -216
                    }
                ],
                "defaultRadius": 0,
                "lanesF": 2,
                "lanesB": 2,
                "tag": "road",
                "rendered": true
            },
            {
                "points": [
                    {
                        "x": 72,
                        "z": -216
                    },
                    {
                        "x": -192,
                        "z": -216
                    }
                ],
                "defaultRadius": 0,
                "lanesF": 2,
                "lanesB": 2,
                "tag": "road",
                "rendered": true
            },
            {
                "points": [
                    {
                        "x": -192,
                        "z": -216
                    },
                    {
                        "x": -192,
                        "z": -120
                    }
                ],
                "defaultRadius": 0,
                "lanesF": 2,
                "lanesB": 2,
                "tag": "road",
                "rendered": true
            },
            {
                "points": [
                    {
                        "x": -192,
                        "z": -120
                    },
                    {
                        "x": -240,
                        "z": -72
                    }
                ],
                "defaultRadius": 0,
                "lanesF": 2,
                "lanesB": 2,
                "tag": "road",
                "rendered": true
            },
            {
                "points": [
                    {
                        "x": -240,
                        "z": -72
                    },
                    {
                        "x": -240,
                        "z": 0
                    }
                ],
                "defaultRadius": 0,
                "lanesF": 2,
                "lanesB": 2,
                "tag": "road",
                "rendered": true
            },
            {
                "points": [
                    {
                        "x": -240,
                        "z": 0
                    },
                    {
                        "x": -240,
                        "z": 48
                    }
                ],
                "defaultRadius": 0,
                "lanesF": 3,
                "lanesB": 3,
                "tag": "road",
                "rendered": true
            },
            {
                "points": [
                    {
                        "x": 72,
                        "z": -72
                    },
                    {
                        "x": 72,
                        "z": 216
                    }
                ],
                "defaultRadius": 0,
                "lanesF": 3,
                "lanesB": 3,
                "tag": "road",
                "rendered": true
            },
            {
                "points": [
                    {
                        "x": -240,
                        "z": 48
                    },
                    {
                        "x": -240,
                        "z": 216
                    }
                ],
                "defaultRadius": 0,
                "lanesF": 3,
                "lanesB": 3,
                "tag": "road",
                "rendered": true
            },
            {
                "points": [
                    {
                        "x": -72,
                        "z": -216
                    },
                    {
                        "x": -72,
                        "z": -72
                    }
                ],
                "defaultRadius": 0,
                "lanesF": 2,
                "lanesB": 2,
                "tag": "road",
                "rendered": true
            },
            {
                "points": [
                    {
                        "x": -72,
                        "z": -72
                    },
                    {
                        "x": 264,
                        "z": -72
                    }
                ],
                "defaultRadius": 0,
                "lanesF": 2,
                "lanesB": 2,
                "tag": "road",
                "rendered": true
            },
            {
                "points": [
                    {
                        "x": 264,
                        "z": 0
                    },
                    {
                        "x": 264,
                        "z": -72
                    }
                ],
                "defaultRadius": 0,
                "lanesF": 3,
                "lanesB": 3,
                "tag": "road",
                "rendered": true
            },
            {
                "points": [
                    {
                        "x": 264,
                        "z": -72
                    },
                    {
                        "x": 264,
                        "z": -240
                    }
                ],
                "defaultRadius": 0,
                "lanesF": 3,
                "lanesB": 3,
                "tag": "road",
                "rendered": true
            },
            {
                "points": [
                    {
                        "x": -144,
                        "z": 120
                    },
                    {
                        "x": 216,
                        "z": 120
                    }
                ],
                "defaultRadius": 0,
                "lanesF": 1,
                "lanesB": 1,
                "tag": "road",
                "rendered": true
            },
            {
                "points": [
                    {
                        "x": -144,
                        "z": 288
                    },
                    {
                        "x": 216,
                        "z": 288
                    }
                ],
                "defaultRadius": 0,
                "lanesF": 1,
                "lanesB": 1,
                "tag": "road",
                "rendered": true
            },
            {
                "points": [
                    {
                        "x": 216,
                        "z": 288
                    },
                    {
                        "x": 216,
                        "z": 120
                    }
                ],
                "defaultRadius": 0,
                "lanesF": 1,
                "lanesB": 1,
                "tag": "road",
                "rendered": true
            },
            {
                "points": [
                    {
                        "x": -144,
                        "z": 120
                    },
                    {
                        "x": -144,
                        "z": 288
                    }
                ],
                "defaultRadius": 0,
                "lanesF": 1,
                "lanesB": 1,
                "tag": "road",
                "rendered": true
            },
            {
                "points": [
                    {
                        "x": -240,
                        "z": 216
                    },
                    {
                        "x": 72,
                        "z": 216
                    }
                ],
                "defaultRadius": 0,
                "lanesF": 3,
                "lanesB": 3,
                "tag": "road",
                "rendered": true
            },
            {
                "points": [
                    {
                        "x": -144,
                        "z": 18
                    },
                    {
                        "x": -144,
                        "z": 114
                    }
                ],
                "defaultRadius": 0,
                "lanesF": 2,
                "lanesB": 2,
                "tag": "road",
                "rendered": true
            },
            {
                "points": [
                    {
                        "x": -144,
                        "z": 18
                    },
                    {
                        "x": -72,
                        "z": -72
                    }
                ],
                "defaultRadius": 0,
                "lanesF": 2,
                "lanesB": 2,
                "tag": "road",
                "rendered": true
            },
            {
                "points": [
                    {
                        "x": -192,
                        "z": -144
                    },
                    {
                        "x": 192,
                        "z": -144
                    }
                ],
                "defaultRadius": 0,
                "lanesF": 1,
                "lanesB": 2,
                "tag": "road",
                "rendered": true
            },
            {
                "points": [
                    {
                        "x": 192,
                        "z": -144
                    },
                    {
                        "x": 192,
                        "z": -264
                    }
                ],
                "defaultRadius": 0,
                "lanesF": 1,
                "lanesB": 2,
                "tag": "road",
                "rendered": true
            }
        ],
        "buildings": [
            {
                "id": "building_1",
                "configId": "brick_midrise",
                "tiles": [
                    [
                        14,
                        2
                    ],
                    [
                        13,
                        2
                    ],
                    [
                        14,
                        1
                    ],
                    [
                        12,
                        2
                    ],
                    [
                        13,
                        1
                    ],
                    [
                        12,
                        1
                    ]
                ],
                "rendered": true
            },
            {
                "id": "building_2",
                "configId": "brick_midrise",
                "tiles": [
                    [
                        10,
                        2
                    ],
                    [
                        9,
                        2
                    ],
                    [
                        10,
                        1
                    ],
                    [
                        8,
                        2
                    ],
                    [
                        9,
                        1
                    ],
                    [
                        10,
                        0
                    ],
                    [
                        8,
                        1
                    ],
                    [
                        9,
                        0
                    ],
                    [
                        8,
                        0
                    ]
                ],
                "rendered": true
            },
            {
                "id": "building_3",
                "configId": "brick_midrise",
                "tiles": [
                    [
                        5,
                        1
                    ],
                    [
                        4,
                        1
                    ],
                    [
                        5,
                        2
                    ],
                    [
                        4,
                        2
                    ]
                ],
                "rendered": true
            },
            {
                "id": "building_4",
                "configId": "brick_midrise",
                "tiles": [
                    [
                        2,
                        2
                    ],
                    [
                        3,
                        2
                    ],
                    [
                        2,
                        3
                    ],
                    [
                        3,
                        3
                    ],
                    [
                        2,
                        4
                    ],
                    [
                        3,
                        4
                    ]
                ],
                "rendered": true
            },
            {
                "id": "building_5",
                "configId": "blue_belt_tower",
                "tiles": [
                    [
                        5,
                        4
                    ],
                    [
                        6,
                        4
                    ],
                    [
                        5,
                        5
                    ],
                    [
                        7,
                        4
                    ],
                    [
                        6,
                        5
                    ],
                    [
                        8,
                        4
                    ],
                    [
                        7,
                        5
                    ],
                    [
                        8,
                        5
                    ]
                ],
                "rendered": true
            },
            {
                "id": "building_6",
                "configId": "stone_setback_tower",
                "tiles": [
                    [
                        2,
                        7
                    ],
                    [
                        2,
                        6
                    ],
                    [
                        3,
                        6
                    ]
                ],
                "rendered": true
            },
            {
                "id": "building_7",
                "configId": "mainstreet_block",
                "tiles": [
                    [
                        13,
                        13
                    ],
                    [
                        14,
                        13
                    ]
                ],
                "rendered": true
            },
            {
                "id": "building_7_b",
                "configId": "mainstreet_block",
                "tiles": [
                    [
                        13,
                        12
                    ],
                    [
                        14,
                        12
                    ]
                ],
                "rendered": true
            },
            {
                "id": "building_8",
                "configId": "mainstreet_block",
                "tiles": [
                    [
                        10,
                        10
                    ],
                    [
                        11,
                        10
                    ]
                ],
                "rendered": true
            },
            {
                "id": "building_8_b",
                "configId": "mainstreet_block",
                "tiles": [
                    [
                        12,
                        10
                    ],
                    [
                        13,
                        10
                    ]
                ],
                "rendered": true
            },
            createBradburyCornerEntry(),
            createModernBankAvenueParcel(),
            {
                "id": "building_10",
                "configId": "brick_midrise",
                "tiles": [
                    [
                        10,
                        8
                    ],
                    [
                        11,
                        8
                    ]
                ],
                "rendered": true
            },
            {
                "id": "building_11",
                "configId": "brick_midrise",
                "tiles": [
                    [
                        12,
                        7
                    ],
                    [
                        13,
                        7
                    ]
                ],
                "rendered": true
            },
            {
                "id": "building_12",
                "configId": "brick_midrise",
                "tiles": [
                    [
                        14,
                        8
                    ],
                    [
                        15,
                        8
                    ]
                ],
                "rendered": true
            },
            {
                "id": "building_13",
                "configId": "brick_midrise",
                "tiles": [
                    [
                        16,
                        7
                    ],
                    [
                        17,
                        7
                    ]
                ],
                "rendered": true
            },
            {
                "id": "building_14",
                "configId": "brick_midrise",
                "tiles": [
                    [
                        18,
                        8
                    ],
                    [
                        19,
                        8
                    ]
                ],
                "rendered": true
            },
            {
                "id": "building_15",
                "configId": "brick_midrise",
                "tiles": [
                    [
                        20,
                        7
                    ],
                    [
                        21,
                        7
                    ],
                    [
                        21,
                        6
                    ]
                ],
                "rendered": true
            },
            {
                "id": "building_16",
                "configId": "brick_midrise",
                "tiles": [
                    [
                        22,
                        5
                    ],
                    [
                        22,
                        4
                    ]
                ],
                "rendered": true
            },
            {
                "id": "building_17",
                "configId": "brick_midrise",
                "tiles": [
                    [
                        21,
                        3
                    ],
                    [
                        21,
                        2
                    ]
                ],
                "rendered": true
            },
            {
                "id": "building_18",
                "configId": "gov_center",
                "tiles": [
                    [
                        19,
                        5
                    ],
                    [
                        18,
                        5
                    ],
                    [
                        19,
                        4
                    ],
                    [
                        18,
                        4
                    ]
                ],
                "rendered": true
            },
            {
                "id": "building_19",
                "configId": "blue_belt_tower",
                "tiles": [
                    [
                        18,
                        3
                    ],
                    [
                        19,
                        3
                    ],
                    [
                        18,
                        2
                    ],
                    [
                        19,
                        2
                    ]
                ],
                "rendered": true
            },
            {
                "id": "building_20",
                "configId": "blue_belt_tower",
                "tiles": [
                    [
                        10,
                        4
                    ]
                ],
                "rendered": true
            },
            {
                "id": "building_21",
                "configId": "blue_belt_tower",
                "tiles": [
                    [
                        11,
                        5
                    ]
                ],
                "rendered": true
            },
            {
                "id": "building_22",
                "configId": "blue_belt_tower",
                "tiles": [
                    [
                        12,
                        4
                    ]
                ],
                "rendered": true
            },
            {
                "id": "building_23",
                "configId": "blue_belt_tower",
                "tiles": [
                    [
                        13,
                        5
                    ]
                ],
                "rendered": true
            },
            {
                "id": "building_24",
                "configId": "stone_setback_tower",
                "tiles": [
                    [
                        15,
                        4
                    ],
                    [
                        16,
                        4
                    ],
                    [
                        15,
                        5
                    ],
                    [
                        16,
                        5
                    ]
                ],
                "rendered": true
            },
            {
                "id": "building_25",
                "configId": "stone_setback_tower",
                "tiles": [
                    [
                        5,
                        8
                    ],
                    [
                        6,
                        8
                    ],
                    [
                        5,
                        7
                    ],
                    [
                        6,
                        7
                    ]
                ],
                "rendered": true
            },
            {
                "id": "building_26",
                "configId": "stone_setback_tower",
                "tiles": [
                    [
                        14,
                        15
                    ],
                    [
                        13,
                        15
                    ],
                    [
                        14,
                        16
                    ],
                    [
                        12,
                        15
                    ],
                    [
                        13,
                        16
                    ],
                    [
                        12,
                        16
                    ]
                ],
                "rendered": true
            },
            {
                "id": "building_27",
                "configId": "gov_center",
                "tiles": [
                    [
                        16,
                        15
                    ],
                    [
                        17,
                        15
                    ],
                    [
                        16,
                        16
                    ],
                    [
                        18,
                        15
                    ],
                    [
                        17,
                        16
                    ],
                    [
                        18,
                        16
                    ]
                ],
                "rendered": true
            },
            {
                "id": "building_28",
                "configId": "brick_midrise",
                "tiles": [
                    [
                        16,
                        10
                    ],
                    [
                        17,
                        10
                    ],
                    [
                        16,
                        11
                    ],
                    [
                        17,
                        11
                    ]
                ],
                "rendered": true
            },
            {
                "id": "building_29",
                "configId": "brick_midrise",
                "tiles": [
                    [
                        18,
                        12
                    ],
                    [
                        19,
                        12
                    ],
                    [
                        18,
                        13
                    ],
                    [
                        19,
                        13
                    ]
                ],
                "rendered": true
            },
            {
                "id": "building_30",
                "configId": "brick_midrise",
                "tiles": [
                    [
                        20,
                        10
                    ],
                    [
                        21,
                        10
                    ],
                    [
                        20,
                        11
                    ],
                    [
                        21,
                        11
                    ]
                ],
                "rendered": true
            },
            {
                "id": "building_31",
                "configId": "brick_midrise",
                "tiles": [
                    [
                        7,
                        20
                    ]
                ],
                "rendered": true
            },
            {
                "id": "building_32",
                "configId": "blue_belt_tower",
                "tiles": [
                    [
                        9,
                        20
                    ]
                ],
                "rendered": true
            },
            {
                "id": "building_33",
                "configId": "gov_center",
                "tiles": [
                    [
                        11,
                        20
                    ]
                ],
                "rendered": true
            },
            {
                "id": "building_34",
                "configId": "stone_setback_tower",
                "tiles": [
                    [
                        13,
                        20
                    ]
                ],
                "rendered": true
            },
            {
                "id": "building_35",
                "configId": "stone_lowrise_2",
                "tiles": [
                    [
                        14,
                        18
                    ]
                ],
                "rendered": true
            },
            {
                "id": "building_36",
                "configId": "stone_setback_tower",
                "tiles": [
                    [
                        7,
                        18
                    ],
                    [
                        8,
                        18
                    ],
                    [
                        9,
                        18
                    ],
                    [
                        10,
                        18
                    ]
                ],
                "rendered": true
            },
            {
                "id": "building_37",
                "configId": "brick_midrise",
                "tiles": [
                    [
                        0,
                        15
                    ]
                ],
                "rendered": true
            },
            {
                "id": "building_38",
                "configId": "blue_belt_tower",
                "tiles": [
                    [
                        0,
                        17
                    ]
                ],
                "rendered": true
            },
            {
                "id": "building_39",
                "configId": "gov_center",
                "tiles": [
                    [
                        0,
                        19
                    ]
                ],
                "rendered": true
            },
            {
                "id": "building_40",
                "configId": "stone_setback_tower",
                "tiles": [
                    [
                        0,
                        21
                    ]
                ],
                "rendered": true
            },
            {
                "id": "building_41",
                "configId": "stone_lowrise_2",
                "tiles": [
                    [
                        0,
                        23
                    ]
                ],
                "rendered": true
            },
            {
                "id": "building_42",
                "configId": "stone_setback_tower",
                "tiles": [
                    [
                        7,
                        23
                    ]
                ],
                "rendered": true
            },
            {
                "id": "building_43",
                "configId": "stone_setback_tower",
                "tiles": [
                    [
                        9,
                        23
                    ]
                ],
                "rendered": true
            },
            {
                "id": "building_44",
                "configId": "stone_setback_tower",
                "tiles": [
                    [
                        11,
                        23
                    ]
                ],
                "rendered": true
            },
            {
                "id": "building_45",
                "configId": "stone_setback_tower",
                "tiles": [
                    [
                        13,
                        23
                    ]
                ],
                "rendered": true
            },
            {
                "id": "building_46",
                "configId": "stone_setback_tower",
                "tiles": [
                    [
                        15,
                        23
                    ]
                ],
                "rendered": true
            },
            {
                "id": "building_47",
                "configId": "stone_lowrise_2",
                "tiles": [
                    [
                        19,
                        23
                    ]
                ],
                "rendered": true
            },
            {
                "id": "building_47_b",
                "configId": "stone_lowrise_2",
                "tiles": [
                    [
                        20,
                        23
                    ]
                ],
                "rendered": true
            },
            {
                "id": "building_47_c",
                "configId": "stone_lowrise_2",
                "tiles": [
                    [
                        19,
                        22
                    ]
                ],
                "rendered": true
            },
            {
                "id": "building_47_d",
                "configId": "stone_lowrise_2",
                "tiles": [
                    [
                        20,
                        22
                    ]
                ],
                "rendered": true
            },
            {
                "id": "building_48",
                "configId": "stone_lowrise_2",
                "tiles": [
                    [
                        19,
                        20
                    ]
                ],
                "rendered": true
            },
            {
                "id": "building_48_b",
                "configId": "stone_lowrise_2",
                "tiles": [
                    [
                        20,
                        20
                    ]
                ],
                "rendered": true
            },
            {
                "id": "building_48_c",
                "configId": "stone_lowrise_2",
                "tiles": [
                    [
                        19,
                        19
                    ]
                ],
                "rendered": true
            },
            {
                "id": "building_48_d",
                "configId": "stone_lowrise_2",
                "tiles": [
                    [
                        20,
                        19
                    ]
                ],
                "rendered": true
            },
            {
                "id": "building_49",
                "configId": "stone_lowrise_2",
                "tiles": [
                    [
                        17,
                        22
                    ]
                ],
                "rendered": true
            },
            {
                "id": "building_49_b",
                "configId": "stone_lowrise_2",
                "tiles": [
                    [
                        17,
                        21
                    ]
                ],
                "rendered": true
            },
            {
                "id": "building_49_c",
                "configId": "stone_lowrise_2",
                "tiles": [
                    [
                        17,
                        20
                    ]
                ],
                "rendered": true
            },
            {
                "id": "building_49_d",
                "configId": "stone_lowrise_2",
                "tiles": [
                    [
                        17,
                        19
                    ]
                ],
                "rendered": true
            },
            {
                "id": "building_50",
                "configId": "blue_belt_tower",
                "tiles": [
                    [
                        22,
                        23
                    ],
                    [
                        22,
                        22
                    ],
                    [
                        23,
                        22
                    ]
                ],
                "rendered": true
            },
            {
                "id": "building_51",
                "configId": "blue_belt_tower",
                "tiles": [
                    [
                        23,
                        20
                    ],
                    [
                        23,
                        19
                    ],
                    [
                        22,
                        19
                    ]
                ],
                "rendered": true
            },
            {
                "id": "building_52",
                "configId": "blue_belt_tower",
                "tiles": [
                    [
                        23,
                        17
                    ],
                    [
                        23,
                        16
                    ],
                    [
                        22,
                        16
                    ]
                ],
                "rendered": true
            },
            {
                "id": "building_53",
                "configId": "stone_lowrise_2",
                "tiles": [
                    [
                        2,
                        23
                    ]
                ],
                "rendered": true
            },
            {
                "id": "building_54",
                "configId": "stone_lowrise_2",
                "tiles": [
                    [
                        4,
                        23
                    ]
                ],
                "rendered": true
            },
            {
                "id": "building_55",
                "configId": "beige_1",
                "tiles": [
                    [
                        5,
                        13
                    ]
                ],
                "rendered": true
            }
        ],
        "reservations": [
            createBusStartReservation()
        ]
    }
);

export const BIG_CITY_2_SPEC = Object.freeze(convertLegacyRoadSegmentsToPolyline(BIG_CITY_2_SPEC_SOURCE));

export function createBigCity2Spec() {
    return BIG_CITY_2_SPEC;
}
