// src/graphics/gui/mesh_fabrication/picking/raycast.js

export function configureRaycasterThresholds(raycaster, worldPerPixel) {
    if (!raycaster) return;
    if (!raycaster.params.Line) raycaster.params.Line = {};
    if (!raycaster.params.Points) raycaster.params.Points = {};
    raycaster.params.Line.threshold = Math.max(0.0006, worldPerPixel * 4.0);
    raycaster.params.Points.threshold = Math.max(0.001, worldPerPixel * 9.0);
}

export function setRayFromTileNdc({ raycaster, ndc, camera, ndcX, ndcY }) {
    ndc.set(ndcX, ndcY);
    raycaster.setFromCamera(ndc, camera);
}
