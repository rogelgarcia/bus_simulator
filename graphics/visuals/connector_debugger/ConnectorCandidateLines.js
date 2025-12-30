// graphics/visuals/connector_debugger/ConnectorCandidateLines.js
// Creates candidate path line artifacts for connector debugger previews.
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

export function createConnectorCandidateLines({
    count = 1,
    y = 0,
    color = 0xef4444,
    lineWidth = 2,
    opacity = 1,
    renderOrder = 6,
    depthTest = false,
    depthWrite = false
} = {}) {
    const lines = [];
    const total = Math.max(0, count | 0);
    for (let i = 0; i < total; i++) {
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
        line.renderOrder = renderOrder;
        lines.push({ line, geo, mat });
    }
    return lines;
}
