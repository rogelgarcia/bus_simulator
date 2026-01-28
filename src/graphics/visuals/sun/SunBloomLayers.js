// src/graphics/visuals/sun/SunBloomLayers.js
// Shared bloom layer constants for sun-only bloom.
// @ts-check

import * as THREE from 'three';

export const SUN_BLOOM_LAYER_ID = 1;
export const SUN_BLOOM_LAYER = new THREE.Layers();
SUN_BLOOM_LAYER.set(SUN_BLOOM_LAYER_ID);

