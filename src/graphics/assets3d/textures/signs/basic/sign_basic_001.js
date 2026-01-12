// src/graphics/assets3d/textures/signs/basic/sign_basic_001.js
// Re-exports the sign.basic.001 sign asset.
import { getSignAssetById } from '../SignAssets.js';

const SIGN_ID = 'sign.basic.001';
const SIGN = getSignAssetById(SIGN_ID);

export { SIGN, SIGN_ID };
export default SIGN;
