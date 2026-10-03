vec2 grassTransitionInset = min(grassTransitionWorldPosition.xz - grassTransitionFieldBounds.xy,
    grassTransitionFieldBounds.zw - grassTransitionWorldPosition.xz);
float grassTransitionEdge = min(grassTransitionInset.x, grassTransitionInset.y);
transformed.y = grassTransitionCanopyShape.x * smoothstep(0.0, grassTransitionCanopyShape.y, grassTransitionEdge);
// Close the exposed canopy edge against the lower litter without overlapping LODs.
vec4 grassTransitionLocalInset = vec4(position.x + 0.5, 0.5 - position.x, position.z + 0.5, 0.5 - position.z);
vec4 grassTransitionOpenInset = mix(vec4(1.0), grassTransitionLocalInset, grassTransitionOpenEdges);
float grassTransitionInnerEdge = min(min(grassTransitionOpenInset.x, grassTransitionOpenInset.y),
    min(grassTransitionOpenInset.z, grassTransitionOpenInset.w));
transformed.y = min(transformed.y, mix(0.005, grassTransitionCanopyShape.x,
    smoothstep(0.0, grassTransitionCanopyShape.y, grassTransitionInnerEdge)));
