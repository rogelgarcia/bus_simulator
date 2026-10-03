float grassYaw = grassTriadYaw();
float grassBaseYaw = grassTriadBaseYaw();
vGrassTriadSourceFacing = vec2(sin(grassBaseYaw), cos(grassBaseYaw));
float grassOffset = position.x * grassPlatePlacement.z;
vec3 transformed = vec3(
    grassPlatePlacement.x + cos(grassYaw) * grassOffset,
    position.y * grassBillboardHeight,
    grassPlatePlacement.y - sin(grassYaw) * grassOffset
);
