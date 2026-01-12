// src/graphics/assets3d/textures/signs/basic/sign_basic_stop.js
// Re-exports the sign.basic.stop sign asset.
import { getSignAssetById } from '../SignAssets.js';

const SIGN_ID = 'sign.basic.stop';
const SIGN = getSignAssetById(SIGN_ID);

export { SIGN, SIGN_ID };
export default SIGN;
