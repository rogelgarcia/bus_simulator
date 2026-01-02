// src/graphics/visuals/shared/ConnectorArrowLines.js
// Creates arrow line artifacts with cone heads for connector directions.
import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

export function createConnectorArrowLines({
    y = 0,
    colors = [0x1d4d8f, 0xc2410c],
    lineWidth = 2,
    opacity = 0.95,
    coneOpacity = null,
    coneTransparent = true,
    renderOrderLine = 8,
    renderOrderCone = 9,
    depthTest = false,
    depthWrite = false,
    coneDepthTest = null,
    coneDepthWrite = null,
    markerRadius = 0.35,
    coneRadiusScale = 0.16,
    coneHeightScale = 0.4
} = {}) {
    const coneGeo = new THREE.ConeGeometry(markerRadius * coneRadiusScale, markerRadius * coneHeightScale, 16, 1);
    const arrows = [];
    for (const color of colors) {
        const geo = new LineGeometry();
        geo.setPositions([0, y, 0, 0, y, 0]);
        const mat = new LineMaterial({
            color,
            linewidth: lineWidth,
            worldUnits: false,
            transparent: true,
            opacity,
            depthTest,
            depthWrite
        });
        const line = new Line2(geo, mat);
        line.computeLineDistances();
        line.visible = false;
        line.frustumCulled = false;
        line.renderOrder = renderOrderLine;

        const coneMat = new THREE.MeshBasicMaterial({
            color,
            transparent: coneTransparent,
            opacity: coneOpacity ?? opacity,
            depthTest: coneDepthTest ?? depthTest,
            depthWrite: coneDepthWrite ?? depthWrite
        });
        const cone = new THREE.Mesh(coneGeo, coneMat);
        cone.visible = false;
        cone.renderOrder = renderOrderCone;

        arrows.push({ line, geo, mat, cone });
    }

    return { arrows, coneGeometry: coneGeo };
}
