// Convert the captured visible surface normal into the floor's X / -Z / Y tangent frame.
#include <normal_fragment_maps>
vec3 grassFloorWorldNormal = normalize(normal * mat3(viewMatrix));
normal = vec3(grassFloorWorldNormal.x, -grassFloorWorldNormal.z, grassFloorWorldNormal.y);
