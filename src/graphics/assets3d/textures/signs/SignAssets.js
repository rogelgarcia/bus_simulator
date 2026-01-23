// src/graphics/assets3d/textures/signs/SignAssets.js
// Exposes sign assets derived from the atlas rectangles.
import { SIGN_ATLAS_ID } from './SignAtlases.js';
import { createSignAsset } from './createSignAsset.js';

const BASIC_SIGN_DEFS = Object.freeze([
    {
        id: "sign.basic.001",
        label: "Basic 001",
        rectPx: {
            x: 937,
            y: 7,
            w: 139,
            h: 139
        }
    },
    {
        id: "sign.basic.002",
        label: "Basic 002",
        rectPx: {
            x: 11,
            y: 7,
            w: 139,
            h: 139
        }
    },
    {
        id: "sign.basic.003",
        label: "Basic 003",
        rectPx: {
            x: 165,
            y: 7,
            w: 139,
            h: 139
        }
    },
    {
        id: "sign.basic.004",
        label: "Basic 004",
        rectPx: {
            x: 319,
            y: 7,
            w: 140,
            h: 140
        }
    },
    {
        id: "sign.basic.005",
        label: "Basic 005",
        rectPx: {
            x: 474,
            y: 7,
            w: 139,
            h: 140
        }
    },
    {
        id: "sign.basic.006",
        label: "Basic 006",
        rectPx: {
            x: 628,
            y: 7,
            w: 139,
            h: 139
        }
    },
    {
        id: "sign.basic.007",
        label: "Basic 007",
        rectPx: {
            x: 782,
            y: 7,
            w: 140,
            h: 139
        }
    },
    {
        id: "sign.basic.008",
        label: "Basic 008",
        rectPx: {
            x: 1091,
            y: 7,
            w: 139,
            h: 140
        }
    },
    {
        id: "sign.basic.009",
        label: "Basic 009",
        rectPx: {
            x: 1245,
            y: 7,
            w: 139,
            h: 139
        }
    },
    {
        id: "sign.basic.stop",
        label: "Stop",
        rectPx: {
            x: 1399,
            y: 7,
            w: 139,
            h: 139
        }
    },
    {
        id: "sign.basic.011",
        label: "Basic 011",
        rectPx: {
            x: 165,
            y: 171,
            w: 139,
            h: 140
        }
    },
    {
        id: "sign.basic.012",
        label: "Basic 012",
        rectPx: {
            x: 628,
            y: 171,
            w: 139,
            h: 140
        }
    },
    {
        id: "sign.basic.013",
        label: "Basic 013",
        rectPx: {
            x: 1245,
            y: 171,
            w: 139,
            h: 140
        }
    },
    {
        id: "sign.basic.014",
        label: "Basic 014",
        rectPx: {
            x: 11,
            y: 171,
            w: 139,
            h: 140
        }
    },
    {
        id: "sign.basic.015",
        label: "Basic 015",
        rectPx: {
            x: 319,
            y: 171,
            w: 140,
            h: 140
        }
    },
    {
        id: "sign.basic.016",
        label: "Basic 016",
        rectPx: {
            x: 474,
            y: 171,
            w: 139,
            h: 140
        }
    },
    {
        id: "sign.basic.017",
        label: "Basic 017",
        rectPx: {
            x: 782,
            y: 171,
            w: 139,
            h: 140
        }
    },
    {
        id: "sign.basic.018",
        label: "Basic 018",
        rectPx: {
            x: 937,
            y: 171,
            w: 139,
            h: 140
        }
    },
    {
        id: "sign.basic.019",
        label: "Basic 019",
        rectPx: {
            x: 1091,
            y: 171,
            w: 139,
            h: 140
        }
    },
    {
        id: "sign.basic.020",
        label: "Basic 020",
        rectPx: {
            x: 1399,
            y: 171,
            w: 139,
            h: 140
        }
    },
    {
        id: "sign.basic.021",
        label: "Basic 021",
        rectPx: {
            x: 628,
            y: 335,
            w: 139,
            h: 140
        }
    },
    {
        id: "sign.basic.022",
        label: "Basic 022",
        rectPx: {
            x: 11,
            y: 335,
            w: 139,
            h: 140
        }
    },
    {
        id: "sign.basic.023",
        label: "Basic 023",
        rectPx: {
            x: 165,
            y: 335,
            w: 139,
            h: 140
        }
    },
    {
        id: "sign.basic.024",
        label: "Basic 024",
        rectPx: {
            x: 319,
            y: 335,
            w: 140,
            h: 140
        }
    },
    {
        id: "sign.basic.025",
        label: "Basic 025",
        rectPx: {
            x: 474,
            y: 335,
            w: 139,
            h: 140
        }
    },
    {
        id: "sign.basic.026",
        label: "Basic 026",
        rectPx: {
            x: 782,
            y: 335,
            w: 139,
            h: 140
        }
    },
    {
        id: "sign.basic.027",
        label: "Basic 027",
        rectPx: {
            x: 937,
            y: 335,
            w: 139,
            h: 140
        }
    },
    {
        id: "sign.basic.028",
        label: "Basic 028",
        rectPx: {
            x: 1091,
            y: 335,
            w: 139,
            h: 140
        }
    },
    {
        id: "sign.basic.029",
        label: "Basic 029",
        rectPx: {
            x: 1245,
            y: 335,
            w: 139,
            h: 142
        }
    },
    {
        id: "sign.basic.030",
        label: "Basic 030",
        rectPx: {
            x: 1399,
            y: 338,
            w: 169,
            h: 128
        }
    },
    {
        id: "sign.basic.031",
        label: "Basic 031",
        rectPx: {
            x: 11,
            y: 499,
            w: 139,
            h: 170
        }
    },
    {
        id: "sign.basic.032",
        label: "Basic 032",
        rectPx: {
            x: 628,
            y: 499,
            w: 139,
            h: 169
        }
    },
    {
        id: "sign.basic.033",
        label: "Basic 033",
        rectPx: {
            x: 165,
            y: 499,
            w: 139,
            h: 169
        }
    },
    {
        id: "sign.basic.034",
        label: "Basic 034",
        rectPx: {
            x: 319,
            y: 499,
            w: 140,
            h: 170
        }
    },
    {
        id: "sign.basic.035",
        label: "Basic 035",
        rectPx: {
            x: 474,
            y: 499,
            w: 139,
            h: 170
        }
    },
    {
        id: "sign.basic.036",
        label: "Basic 036",
        rectPx: {
            x: 782,
            y: 499,
            w: 139,
            h: 170
        }
    },
    {
        id: "sign.basic.037",
        label: "Basic 037",
        rectPx: {
            x: 937,
            y: 499,
            w: 139,
            h: 169
        }
    },
    {
        id: "sign.basic.038",
        label: "Basic 038",
        rectPx: {
            x: 1091,
            y: 499,
            w: 139,
            h: 169
        }
    },
    {
        id: "sign.basic.039",
        label: "Basic 039",
        rectPx: {
            x: 1245,
            y: 500,
            w: 139,
            h: 168
        }
    },
    {
        id: "sign.basic.040",
        label: "Basic 040",
        rectPx: {
            x: 1399,
            y: 499,
            w: 139,
            h: 170
        }
    },
    {
        id: "sign.basic.041",
        label: "Basic 041",
        rectPx: {
            x: 474,
            y: 693,
            w: 139,
            h: 230
        }
    },
    {
        id: "sign.basic.042",
        label: "Basic 042",
        rectPx: {
            x: 11,
            y: 693,
            w: 139,
            h: 230
        }
    },
    {
        id: "sign.basic.043",
        label: "Basic 043",
        rectPx: {
            x: 165,
            y: 693,
            w: 139,
            h: 230
        }
    },
    {
        id: "sign.basic.044",
        label: "Basic 044",
        rectPx: {
            x: 320,
            y: 693,
            w: 139,
            h: 230
        }
    },
    {
        id: "sign.basic.045",
        label: "Basic 045",
        rectPx: {
            x: 628,
            y: 693,
            w: 139,
            h: 230
        }
    },
    {
        id: "sign.basic.046",
        label: "Basic 046",
        rectPx: {
            x: 782,
            y: 693,
            w: 139,
            h: 230
        }
    },
    {
        id: "sign.basic.047",
        label: "Basic 047",
        rectPx: {
            x: 937,
            y: 693,
            w: 139,
            h: 230
        }
    },
    {
        id: "sign.basic.048",
        label: "Basic 048",
        rectPx: {
            x: 1091,
            y: 694,
            w: 139,
            h: 139
        }
    },
    {
        id: "sign.basic.049",
        label: "Basic 049",
        rectPx: {
            x: 1245,
            y: 693,
            w: 293,
            h: 230
        }
    },
    {
        id: "sign.basic.050",
        label: "Basic 050",
        rectPx: {
            x: 1091,
            y: 853,
            w: 139,
            h: 70
        }
    },
]);

const LANE_SIGN_DEFS = Object.freeze([
    {
        id: "sign.lane.001",
        label: "Lane 001",
        rectPx: {
            x: 856,
            y: 0,
            w: 173,
            h: 196
        }
    },
    {
        id: "sign.lane.002",
        label: "Lane 002",
        rectPx: {
            x: 1062,
            y: 0,
            w: 173,
            h: 196
        }
    },
    {
        id: "sign.lane.003",
        label: "Lane 003",
        rectPx: {
            x: 33,
            y: 24,
            w: 173,
            h: 173
        }
    },
    {
        id: "sign.lane.004",
        label: "Lane 004",
        rectPx: {
            x: 238,
            y: 24,
            w: 174,
            h: 173
        }
    },
    {
        id: "sign.lane.005",
        label: "Lane 005",
        rectPx: {
            x: 444,
            y: 24,
            w: 174,
            h: 173
        }
    },
    {
        id: "sign.lane.006",
        label: "Lane 006",
        rectPx: {
            x: 650,
            y: 24,
            w: 173,
            h: 173
        }
    },
    {
        id: "sign.lane.007",
        label: "Lane 007",
        rectPx: {
            x: 33,
            y: 254,
            w: 173,
            h: 208
        }
    },
    {
        id: "sign.lane.008",
        label: "Lane 008",
        rectPx: {
            x: 245,
            y: 254,
            w: 173,
            h: 208
        }
    },
    {
        id: "sign.lane.009",
        label: "Lane 009",
        rectPx: {
            x: 654,
            y: 260,
            w: 173,
            h: 70
        }
    },
    {
        id: "sign.lane.010",
        label: "Lane 010",
        rectPx: {
            x: 863,
            y: 262,
            w: 163,
            h: 71
        }
    },
    {
        id: "sign.lane.011",
        label: "Lane 011",
        rectPx: {
            x: 1062,
            y: 262,
            w: 173,
            h: 71
        }
    },
    {
        id: "sign.lane.012",
        label: "Lane 012",
        rectPx: {
            x: 449,
            y: 288,
            w: 174,
            h: 174
        }
    },
    {
        id: "sign.lane.013",
        label: "Lane 013",
        rectPx: {
            x: 654,
            y: 391,
            w: 173,
            h: 70
        }
    },
    {
        id: "sign.lane.014",
        label: "Lane 014",
        rectPx: {
            x: 858,
            y: 391,
            w: 173,
            h: 70
        }
    },
    {
        id: "sign.lane.015",
        label: "Lane 015",
        rectPx: {
            x: 1062,
            y: 391,
            w: 173,
            h: 70
        }
    },
    {
        id: "sign.lane.016",
        label: "Lane 016",
        rectPx: {
            x: 525,
            y: 520,
            w: 276,
            h: 223
        }
    },
    {
        id: "sign.lane.017",
        label: "Lane 017",
        rectPx: {
            x: 33,
            y: 568,
            w: 173,
            h: 175
        }
    },
    {
        id: "sign.lane.018",
        label: "Lane 018",
        rectPx: {
            x: 270,
            y: 569,
            w: 174,
            h: 174
        }
    },
    {
        id: "sign.lane.019",
        label: "Lane 019",
        rectPx: {
            x: 959,
            y: 569,
            w: 276,
            h: 174
        }
    },
    {
        id: "sign.lane.020",
        label: "Lane 020",
        rectPx: {
            x: 247,
            y: 800,
            w: 139,
            h: 207
        }
    },
    {
        id: "sign.lane.021",
        label: "Lane 021",
        rectPx: {
            x: 428,
            y: 800,
            w: 138,
            h: 207
        }
    },
    {
        id: "sign.lane.022",
        label: "Lane 022",
        rectPx: {
            x: 822,
            y: 800,
            w: 413,
            h: 207
        }
    },
    {
        id: "sign.lane.023",
        label: "Lane 023",
        rectPx: {
            x: 33,
            y: 833,
            w: 173,
            h: 174
        }
    },
    {
        id: "sign.lane.024",
        label: "Lane 024",
        rectPx: {
            x: 608,
            y: 834,
            w: 173,
            h: 173
        }
    },
]);

const WHITE_MESSAGE_SIGN_DEFS = Object.freeze([
    {
        id: "sign.white_messages.001",
        label: "White Messages 001",
        rectPx: {
            x: 22,
            y: 22,
            w: 395,
            h: 493
        }
    },
    {
        id: "sign.white_messages.002",
        label: "White Messages 002",
        rectPx: {
            x: 460,
            y: 22,
            w: 396,
            h: 493
        }
    },
    {
        id: "sign.white_messages.003",
        label: "White Messages 003",
        rectPx: {
            x: 899,
            y: 22,
            w: 395,
            h: 493
        }
    },
    {
        id: "sign.white_messages.004",
        label: "White Messages 004",
        rectPx: {
            x: 22,
            y: 558,
            w: 395,
            h: 493
        }
    },
    {
        id: "sign.white_messages.005",
        label: "White Messages 005",
        rectPx: {
            x: 460,
            y: 558,
            w: 396,
            h: 493
        }
    },
    {
        id: "sign.white_messages.006",
        label: "White Messages 006",
        rectPx: {
            x: 899,
            y: 558,
            w: 395,
            h: 493
        }
    },
    {
        id: "sign.white_messages.007",
        label: "White Messages 007",
        rectPx: {
            x: 22,
            y: 1095,
            w: 409,
            h: 477
        }
    },
    {
        id: "sign.white_messages.008",
        label: "White Messages 008",
        rectPx: {
            x: 474,
            y: 1095,
            w: 404,
            h: 483
        }
    },
    {
        id: "sign.white_messages.009",
        label: "White Messages 009",
        rectPx: {
            x: 921,
            y: 1095,
            w: 403,
            h: 483
        }
    },
]);

const BASIC_SIGN_ASSETS = Object.freeze(BASIC_SIGN_DEFS.map((def) => createSignAsset({ ...def, atlasId: SIGN_ATLAS_ID.BASIC })));
const LANE_SIGN_ASSETS = Object.freeze(LANE_SIGN_DEFS.map((def) => createSignAsset({ ...def, atlasId: SIGN_ATLAS_ID.LANE })));
const WHITE_MESSAGE_SIGN_ASSETS = Object.freeze(WHITE_MESSAGE_SIGN_DEFS.map((def) => createSignAsset({ ...def, atlasId: SIGN_ATLAS_ID.WHITE_MESSAGES })));

export const SIGN_ASSETS = Object.freeze([
    ...BASIC_SIGN_ASSETS,
    ...LANE_SIGN_ASSETS,
    ...WHITE_MESSAGE_SIGN_ASSETS
]);

const SIGN_ASSET_BY_ID = new Map(SIGN_ASSETS.map((asset) => [asset.id, asset]));

const STOP_SIGN = SIGN_ASSET_BY_ID.get('sign.basic.stop') ?? null;
if (STOP_SIGN) SIGN_ASSET_BY_ID.set('sign.basic.010', STOP_SIGN);

export function getSignAssets() {
    return Array.from(SIGN_ASSETS);
}

export function getSignAssetById(signId) {
    const id = typeof signId === 'string' ? signId : '';
    const asset = SIGN_ASSET_BY_ID.get(id) ?? null;
    if (!asset) throw new Error(`[SignAssets] Unknown sign id: ${signId}`);
    return asset;
}
