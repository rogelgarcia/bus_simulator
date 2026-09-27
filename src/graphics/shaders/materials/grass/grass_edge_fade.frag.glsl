float grassEdgeInset = 0.5 - max(abs(vGrassEdgePosition.x), abs(vGrassEdgePosition.z));
float grassEdgeAboveTop = smoothstep(grassEdgeSurfaceHeight - 0.002, grassEdgeSurfaceHeight + 0.016, vGrassEdgePosition.y);
float grassEdgeOpacity = mix(1.0, grassEdgeAboveTop, smoothstep(0.0, 0.035, grassEdgeInset));
grassEdgeOpacity *= 1.0 - smoothstep(0.035, 0.065, grassEdgeInset);
vec3 grassEdgeCell = floor(vGrassEdgePosition * 1600.0);
float grassEdgeNoise = fract(sin(dot(grassEdgeCell, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
if (grassEdgeOpacity <= grassEdgeNoise) discard;
