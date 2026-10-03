// Retain the calibrated canopy response, but limit the sun-facing energy gain
// as distant normal-map texels converge toward their average orientation.
vec3 grassFieldDistantCanopyResponse(vec3 response, vec3 position, vec3 lightDirection) {
    vec3 up = viewMatrix[1].xyz;
    vec3 view = normalize(-position);
    vec3 horizontalView = view - up * dot(view, up);
    vec3 horizontalLight = lightDirection - up * dot(lightDirection, up);
    float bearing = dot(horizontalView, horizontalLight)
        / max(length(horizontalView) * length(horizontalLight), 0.00001);
    float facingSun = max(0.0, bearing);
    float fade = smoothstep(grassFieldDistance.x, grassFieldDistance.y, length(position));
    float weight = grassFieldDistance.z * fade * (0.07 + 0.47 * facingSun * facingSun);
    return mix(response, vec3(0.32, 0.30, 0.255), weight);
}
