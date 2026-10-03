#ifdef GRASS_IMPOSTOR_TRANSITION_CARD
attribute vec2 grassImpostorBlend;
#else
attribute float grassImpostorCell;
uniform sampler2D grassImpostorBlendMap;
uniform float grassImpostorCellCount;
#endif
varying vec2 vGrassImpostorBlend;
