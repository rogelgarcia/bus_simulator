// Fixed triad anchors; only a bounded per-axis angle changes with the main camera.
attribute vec3 grassPlatePlacement;
attribute vec4 grassPlateUvRect;
attribute float grassPlateAxis;
uniform vec3 grassTriadTurns;
uniform float grassBillboardHeight;
varying vec2 vGrassTriadSourceFacing;
float grassTriadBaseYaw() { return grassPlateAxis * 1.0471975511965976; }
float grassTriadYaw() { return grassTriadBaseYaw() + grassTriadTurns[int(grassPlateAxis)]; }
