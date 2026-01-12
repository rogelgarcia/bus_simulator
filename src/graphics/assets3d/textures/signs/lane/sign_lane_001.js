// src/graphics/assets3d/textures/signs/lane/sign_lane_001.js
// Re-exports the sign.lane.001 sign asset.
import { getSignAssetById } from '../SignAssets.js';

const SIGN_ID = 'sign.lane.001';
const SIGN = getSignAssetById(SIGN_ID);

export { SIGN, SIGN_ID };
export default SIGN;
