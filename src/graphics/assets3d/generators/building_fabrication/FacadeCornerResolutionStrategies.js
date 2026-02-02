// src/graphics/assets3d/generators/building_fabrication/FacadeCornerResolutionStrategies.js
// Corner resolution strategies for rect facade silhouettes.
// @ts-check

/**
 * @typedef {'A'|'B'|'C'|'D'} RectFacadeFaceId
 * @typedef {'start'|'end'} RectFacadeCornerEnd
 *
 * @typedef {Object} RectFacadeCornerCondition
 * @property {RectFacadeFaceId} faceId
 * @property {RectFacadeCornerEnd} end
 * @property {number} depth
 *
 * @typedef {Object} RectFacadeCornerResolution
 * @property {RectFacadeFaceId} winnerFaceId
 * @property {number} depth
 *
 * @typedef {Object} RectFacadeCornerResolutionStrategy
 * @property {string} id
 * @property {(a: RectFacadeCornerCondition, b: RectFacadeCornerCondition, ctx: { cornerId: string }) => RectFacadeCornerResolution} resolve
 */

const FACE_ORDER = Object.freeze({
    A: 1,
    B: 2,
    C: 3,
    D: 4
});

export const RECT_FACADE_CORNER_STRATEGY_ID = Object.freeze({
    ODD_OVER_EVEN: 'odd_over_even',
    MAX_ABS_DEPTH: 'max_abs_depth'
});

function getFaceOrder(faceId) {
    if (faceId === 'A' || faceId === 'B' || faceId === 'C' || faceId === 'D') return FACE_ORDER[faceId];
    return 0;
}

/**
 * @param {RectFacadeCornerCondition} a
 * @param {RectFacadeCornerCondition} b
 */
function resolveOddOverEven(a, b) {
    const ao = getFaceOrder(a.faceId);
    const bo = getFaceOrder(b.faceId);
    const aOdd = (ao % 2) === 1;
    const bOdd = (bo % 2) === 1;
    if (aOdd !== bOdd) {
        const winner = aOdd ? a : b;
        return { winnerFaceId: winner.faceId, depth: winner.depth };
    }
    if (ao !== bo) {
        const winner = ao < bo ? a : b;
        return { winnerFaceId: winner.faceId, depth: winner.depth };
    }
    const tie = String(a.end).localeCompare(String(b.end));
    const winner = tie <= 0 ? a : b;
    return { winnerFaceId: winner.faceId, depth: winner.depth };
}

/**
 * @param {RectFacadeCornerCondition} a
 * @param {RectFacadeCornerCondition} b
 */
function resolveMaxAbsDepth(a, b) {
    const ad = Math.abs(Number(a.depth) || 0);
    const bd = Math.abs(Number(b.depth) || 0);
    if (Math.abs(ad - bd) > 1e-6) {
        const winner = ad > bd ? a : b;
        return { winnerFaceId: winner.faceId, depth: winner.depth };
    }
    return resolveOddOverEven(a, b);
}

const STRATEGIES = Object.freeze({
    [RECT_FACADE_CORNER_STRATEGY_ID.ODD_OVER_EVEN]: Object.freeze({
        id: RECT_FACADE_CORNER_STRATEGY_ID.ODD_OVER_EVEN,
        resolve: (a, b, _ctx) => resolveOddOverEven(a, b)
    }),
    [RECT_FACADE_CORNER_STRATEGY_ID.MAX_ABS_DEPTH]: Object.freeze({
        id: RECT_FACADE_CORNER_STRATEGY_ID.MAX_ABS_DEPTH,
        resolve: (a, b, _ctx) => resolveMaxAbsDepth(a, b)
    })
});

/**
 * @param {string | null | undefined} strategyId
 * @returns {RectFacadeCornerResolutionStrategy}
 */
export function resolveRectFacadeCornerStrategy(strategyId) {
    const id = typeof strategyId === 'string' ? strategyId : '';
    return STRATEGIES[id] ?? STRATEGIES[RECT_FACADE_CORNER_STRATEGY_ID.ODD_OVER_EVEN];
}

