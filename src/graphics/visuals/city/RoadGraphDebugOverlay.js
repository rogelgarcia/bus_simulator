// src/graphics/visuals/city/RoadGraphDebugOverlay.js
// Renders road network visual clues (edge boundaries + crossing markers) for the map debugger.
import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { createInstancedMarkerMesh } from '../shared/InstancedMarkerMesh.js';

function averagePointXZ(points) {
    const list = Array.isArray(points) ? points : [];
    if (!list.length) return null;
    let sx = 0;
    let sz = 0;
    let count = 0;
    for (const p of list) {
        if (!p || !Number.isFinite(p.x)) continue;
        const z = Number.isFinite(p.z) ? p.z : p.y;
        if (!Number.isFinite(z)) continue;
        sx += p.x;
        sz += z;
        count += 1;
    }
    if (!count) return null;
    return { x: sx / count, z: sz / count };
}

function buildLineMaterial({ renderer, color, lineWidth, opacity, depthTest, depthWrite } = {}) {
    const mat = new LineMaterial({
        color,
        linewidth: lineWidth,
        worldUnits: false,
        transparent: true,
        opacity,
        depthTest,
        depthWrite
    });
    if (renderer) {
        const size = renderer.getSize(new THREE.Vector2());
        mat.resolution.set(size.x, size.y);
    }
    return mat;
}

function hasLinePositions(line) {
    const geo = line?.geometry ?? null;
    const attrs = geo?.attributes ?? null;
    const pos = attrs?.position ?? attrs?.instanceStart ?? null;
    return !!pos && pos.count > 0;
}

export class RoadGraphDebugOverlay {
    constructor(engine, options = {}) {
        this.engine = engine;
        this.group = new THREE.Group();
        this.group.name = 'RoadGraphDebug';

        const y = Number.isFinite(options.y) ? options.y : 0.06;
        this._edgeY = y;
        this._intersectionY = y + 0.01;
        this._centerlineY = y + 0.02;
        this._directionY = y + 0.021;
        this._endpointY = y + 0.025;
        this._crossingY = y + 0.03;

        const renderer = engine?.renderer ?? null;
        const lineWidth = Number.isFinite(options.lineWidth) ? options.lineWidth : 3;
        const edgeColor = Number.isFinite(options.edgeColor) ? options.edgeColor : 0xffd60a;
        const edgeOpacity = Number.isFinite(options.edgeOpacity) ? options.edgeOpacity : 0.9;
        const centerlineColor = Number.isFinite(options.centerlineColor) ? options.centerlineColor : 0x0a84ff;
        const centerlineOpacity = Number.isFinite(options.centerlineOpacity) ? options.centerlineOpacity : 0.95;
        const dirFColor = Number.isFinite(options.dirFColor) ? options.dirFColor : 0x34c759;
        const dirFOpacity = Number.isFinite(options.dirFOpacity) ? options.dirFOpacity : 0.95;
        const dirBColor = Number.isFinite(options.dirBColor) ? options.dirBColor : 0xff9f0a;
        const dirBOpacity = Number.isFinite(options.dirBOpacity) ? options.dirBOpacity : 0.95;
        const intersectionColor = Number.isFinite(options.intersectionColor) ? options.intersectionColor : 0xbf5af2;
        const intersectionOpacity = Number.isFinite(options.intersectionOpacity) ? options.intersectionOpacity : 0.9;
        this._markerRadius = Number.isFinite(options.markerRadius) ? options.markerRadius : 0.8;
        this._markerColor = Number.isFinite(options.markerColor) ? options.markerColor : 0xff3b30;
        this._markerOpacity = Number.isFinite(options.markerOpacity) ? options.markerOpacity : 0.65;
        this._endpointRadius = Number.isFinite(options.endpointRadius) ? options.endpointRadius : 0.55;
        this._endpointStartColor = Number.isFinite(options.endpointStartColor) ? options.endpointStartColor : 0x34c759;
        this._endpointEndColor = Number.isFinite(options.endpointEndColor) ? options.endpointEndColor : 0xff3b30;
        this._endpointOpacity = Number.isFinite(options.endpointOpacity) ? options.endpointOpacity : 0.75;

        this._laneWidth = Number.isFinite(options.laneWidth) ? options.laneWidth : 4.8;

        this._edgeMat = buildLineMaterial({
            renderer,
            color: edgeColor,
            lineWidth,
            opacity: edgeOpacity,
            depthTest: false,
            depthWrite: false
        });
        this._edgeLine = new LineSegments2(new LineSegmentsGeometry(), this._edgeMat);
        this._edgeLine.name = 'RoadGraphEdges';
        this._edgeLine.frustumCulled = false;
        this._edgeLine.renderOrder = 26;
        this.group.add(this._edgeLine);

        this._intersectionMat = buildLineMaterial({
            renderer,
            color: intersectionColor,
            lineWidth: Math.max(1, lineWidth * 0.8),
            opacity: intersectionOpacity,
            depthTest: false,
            depthWrite: false
        });
        this._intersectionLine = new LineSegments2(new LineSegmentsGeometry(), this._intersectionMat);
        this._intersectionLine.name = 'RoadGraphIntersections';
        this._intersectionLine.frustumCulled = false;
        this._intersectionLine.renderOrder = 27;
        this.group.add(this._intersectionLine);

        this._centerMat = buildLineMaterial({
            renderer,
            color: centerlineColor,
            lineWidth: Math.max(1, lineWidth * 0.75),
            opacity: centerlineOpacity,
            depthTest: false,
            depthWrite: false
        });
        this._centerLine = new LineSegments2(new LineSegmentsGeometry(), this._centerMat);
        this._centerLine.name = 'RoadGraphCenterlines';
        this._centerLine.frustumCulled = false;
        this._centerLine.renderOrder = 25;
        this.group.add(this._centerLine);

        this._dirFMat = buildLineMaterial({
            renderer,
            color: dirFColor,
            lineWidth: Math.max(1, lineWidth * 0.65),
            opacity: dirFOpacity,
            depthTest: false,
            depthWrite: false
        });
        this._dirFLine = new LineSegments2(new LineSegmentsGeometry(), this._dirFMat);
        this._dirFLine.name = 'RoadGraphDirF';
        this._dirFLine.frustumCulled = false;
        this._dirFLine.renderOrder = 24;
        this.group.add(this._dirFLine);

        this._dirBMat = buildLineMaterial({
            renderer,
            color: dirBColor,
            lineWidth: Math.max(1, lineWidth * 0.65),
            opacity: dirBOpacity,
            depthTest: false,
            depthWrite: false
        });
        this._dirBLine = new LineSegments2(new LineSegmentsGeometry(), this._dirBMat);
        this._dirBLine.name = 'RoadGraphDirB';
        this._dirBLine.frustumCulled = false;
        this._dirBLine.renderOrder = 24;
        this.group.add(this._dirBLine);

        this._endpointGeo = null;
        this._endpointStartMat = null;
        this._endpointStartMesh = null;
        this._endpointEndMat = null;
        this._endpointEndMesh = null;

        this._crossGeo = null;
        this._crossMat = null;
        this._crossMesh = null;

        this._edgesEnabled = true;
        this._crossingsEnabled = true;
        this._centerlinesEnabled = true;
        this._directionLinesEnabled = true;
        this._endpointsEnabled = true;

        this._edges = [];
        this._intersections = [];
        this._network = null;

        this.setData({ network: null, edges: [], intersections: [] });
    }

    setData({ network = null, edges = [], intersections = [], laneWidth = null, y = null } = {}) {
        this._network = network;
        this._edges = Array.isArray(edges) ? edges : [];
        this._intersections = Array.isArray(intersections) ? intersections : [];
        if (Number.isFinite(laneWidth) && laneWidth > 0) this._laneWidth = laneWidth;
        if (Number.isFinite(y)) {
            this._edgeY = y;
            this._intersectionY = y + 0.01;
            this._centerlineY = y + 0.02;
            this._directionY = y + 0.021;
            this._endpointY = y + 0.025;
            this._crossingY = y + 0.03;
        }

        this._rebuildEdges();
        this._rebuildIntersections();
        this._rebuildCenterlines();
        this._rebuildDirectionLines();
        this._rebuildEndpoints();
        this._rebuildCrossingMarkers();
        this._syncVisibility();
        this._syncLineResolution();
    }

    setEdgesEnabled(enabled) {
        this._edgesEnabled = !!enabled;
        this._syncVisibility();
        this._syncLineResolution();
    }

    setCrossingsEnabled(enabled) {
        this._crossingsEnabled = !!enabled;
        this._syncVisibility();
        this._syncLineResolution();
    }

    setCenterlinesEnabled(enabled) {
        this._centerlinesEnabled = !!enabled;
        this._syncVisibility();
        this._syncLineResolution();
    }

    setDirectionLinesEnabled(enabled) {
        this._directionLinesEnabled = !!enabled;
        this._syncVisibility();
        this._syncLineResolution();
    }

    setEndpointsEnabled(enabled) {
        this._endpointsEnabled = !!enabled;
        this._syncVisibility();
        this._syncLineResolution();
    }

    destroy() {
        if (this.group) this.group.removeFromParent();
        if (this._edgeLine) this._edgeLine.removeFromParent();
        if (this._edgeLine?.geometry) this._edgeLine.geometry.dispose();
        if (this._edgeMat) this._edgeMat.dispose();
        if (this._centerLine) this._centerLine.removeFromParent();
        if (this._centerLine?.geometry) this._centerLine.geometry.dispose();
        if (this._centerMat) this._centerMat.dispose();
        if (this._dirFLine) this._dirFLine.removeFromParent();
        if (this._dirFLine?.geometry) this._dirFLine.geometry.dispose();
        if (this._dirFMat) this._dirFMat.dispose();
        if (this._dirBLine) this._dirBLine.removeFromParent();
        if (this._dirBLine?.geometry) this._dirBLine.geometry.dispose();
        if (this._dirBMat) this._dirBMat.dispose();
        if (this._intersectionLine) this._intersectionLine.removeFromParent();
        if (this._intersectionLine?.geometry) this._intersectionLine.geometry.dispose();
        if (this._intersectionMat) this._intersectionMat.dispose();
        if (this._endpointStartMesh) this._endpointStartMesh.removeFromParent();
        if (this._endpointEndMesh) this._endpointEndMesh.removeFromParent();
        if (this._endpointGeo) this._endpointGeo.dispose();
        if (this._endpointStartMat) this._endpointStartMat.dispose();
        if (this._endpointEndMat) this._endpointEndMat.dispose();
        if (this._crossMesh) this._crossMesh.removeFromParent();
        if (this._crossGeo) this._crossGeo.dispose();
        if (this._crossMat) this._crossMat.dispose();
        this._edgeLine = null;
        this._edgeMat = null;
        this._centerLine = null;
        this._centerMat = null;
        this._dirFLine = null;
        this._dirFMat = null;
        this._dirBLine = null;
        this._dirBMat = null;
        this._intersectionLine = null;
        this._intersectionMat = null;
        this._endpointGeo = null;
        this._endpointStartMesh = null;
        this._endpointStartMat = null;
        this._endpointEndMesh = null;
        this._endpointEndMat = null;
        this._crossMesh = null;
        this._crossGeo = null;
        this._crossMat = null;
        this.group = null;
    }

    _syncLineResolution() {
        const renderer = this.engine?.renderer ?? null;
        if (!renderer) return;
        const size = renderer.getSize(new THREE.Vector2());
        if (this._edgeMat) this._edgeMat.resolution.set(size.x, size.y);
        if (this._centerMat) this._centerMat.resolution.set(size.x, size.y);
        if (this._dirFMat) this._dirFMat.resolution.set(size.x, size.y);
        if (this._dirBMat) this._dirBMat.resolution.set(size.x, size.y);
        if (this._intersectionMat) this._intersectionMat.resolution.set(size.x, size.y);
    }

    _syncVisibility() {
        if (this._edgeLine) this._edgeLine.visible = this._edgesEnabled && hasLinePositions(this._edgeLine);
        if (this._centerLine) this._centerLine.visible = this._centerlinesEnabled && hasLinePositions(this._centerLine);
        if (this._dirFLine) this._dirFLine.visible = this._directionLinesEnabled && hasLinePositions(this._dirFLine);
        if (this._dirBLine) this._dirBLine.visible = this._directionLinesEnabled && hasLinePositions(this._dirBLine);
        if (this._intersectionLine) this._intersectionLine.visible = this._crossingsEnabled && hasLinePositions(this._intersectionLine);
        if (this._endpointStartMesh) this._endpointStartMesh.visible = this._endpointsEnabled && this._endpointStartMesh.count > 0;
        if (this._endpointEndMesh) this._endpointEndMesh.visible = this._endpointsEnabled && this._endpointEndMesh.count > 0;
        if (this._crossMesh) this._crossMesh.visible = this._crossingsEnabled && this._crossMesh.count > 0;
    }

    _rebuildEdges() {
        const positions = [];
        for (const edge of this._edges) {
            const left = edge?.left ?? null;
            const right = edge?.right ?? null;
            if (left?.a && left?.b) {
                positions.push(left.a.x, this._edgeY, left.a.z, left.b.x, this._edgeY, left.b.z);
            }
            if (right?.a && right?.b) {
                positions.push(right.a.x, this._edgeY, right.a.z, right.b.x, this._edgeY, right.b.z);
            }
        }
        this._edgeLine.geometry.setPositions(positions);
        this._edgeLine.computeLineDistances();
    }

    _rebuildIntersections() {
        const positions = [];
        for (const entry of this._intersections) {
            const points = Array.isArray(entry?.points) ? entry.points : [];
            if (points.length < 3) continue;
            for (let i = 0; i < points.length; i++) {
                const a = points[i];
                const b = points[(i + 1) % points.length];
                if (!a || !b) continue;
                const az = Number.isFinite(a.z) ? a.z : a.y;
                const bz = Number.isFinite(b.z) ? b.z : b.y;
                if (!Number.isFinite(a.x) || !Number.isFinite(az) || !Number.isFinite(b.x) || !Number.isFinite(bz)) continue;
                positions.push(a.x, this._intersectionY, az, b.x, this._intersectionY, bz);
            }
        }
        this._intersectionLine.geometry.setPositions(positions);
        this._intersectionLine.computeLineDistances();
    }

    _rebuildCenterlines() {
        const positions = [];
        for (const edge of this._edges) {
            const a = edge?.centerline?.a ?? null;
            const b = edge?.centerline?.b ?? null;
            if (!a || !b) continue;
            if (!Number.isFinite(a.x) || !Number.isFinite(a.z) || !Number.isFinite(b.x) || !Number.isFinite(b.z)) continue;
            positions.push(a.x, this._centerlineY, a.z, b.x, this._centerlineY, b.z);
        }
        this._centerLine.geometry.setPositions(positions);
        this._centerLine.computeLineDistances();
    }

    _rebuildDirectionLines() {
        const laneWidth = Number.isFinite(this._laneWidth) ? this._laneWidth : 0;
        if (!(laneWidth > 0)) {
            this._dirFLine.geometry.setPositions([]);
            this._dirBLine.geometry.setPositions([]);
            return;
        }

        const positionsF = [];
        const positionsB = [];

        for (const edge of this._edges) {
            const lanesF = Number.isFinite(edge?.lanesF) ? edge.lanesF : 0;
            const lanesB = Number.isFinite(edge?.lanesB) ? edge.lanesB : 0;
            if (!(lanesF > 0 && lanesB > 0)) continue;

            const a = edge?.centerline?.a ?? null;
            const b = edge?.centerline?.b ?? null;
            if (!a || !b) continue;
            const dx = b.x - a.x;
            const dz = b.z - a.z;
            const len = Math.hypot(dx, dz);
            if (!(len > 1e-9)) continue;
            const inv = 1 / len;
            const dirX = dx * inv;
            const dirZ = dz * inv;
            const nx = -dirZ;
            const nz = dirX;

            const offF = laneWidth * lanesF * 0.5;
            const offB = laneWidth * lanesB * 0.5;

            const aFx = a.x + nx * offF;
            const aFz = a.z + nz * offF;
            const bFx = b.x + nx * offF;
            const bFz = b.z + nz * offF;
            const aBx = a.x - nx * offB;
            const aBz = a.z - nz * offB;
            const bBx = b.x - nx * offB;
            const bBz = b.z - nz * offB;

            positionsF.push(aFx, this._directionY, aFz, bFx, this._directionY, bFz);
            positionsB.push(aBx, this._directionY, aBz, bBx, this._directionY, bBz);

            positionsF.push(a.x, this._directionY, a.z, aFx, this._directionY, aFz);
            positionsF.push(b.x, this._directionY, b.z, bFx, this._directionY, bFz);
            positionsB.push(a.x, this._directionY, a.z, aBx, this._directionY, aBz);
            positionsB.push(b.x, this._directionY, b.z, bBx, this._directionY, bBz);
        }

        this._dirFLine.geometry.setPositions(positionsF);
        this._dirFLine.computeLineDistances();
        this._dirBLine.geometry.setPositions(positionsB);
        this._dirBLine.computeLineDistances();
    }

    _rebuildEndpoints() {
        if (this._endpointStartMesh) {
            this._endpointStartMesh.removeFromParent();
            this._endpointStartMesh = null;
        }
        if (this._endpointEndMesh) {
            this._endpointEndMesh.removeFromParent();
            this._endpointEndMesh = null;
        }
        if (this._endpointGeo) {
            this._endpointGeo.dispose();
            this._endpointGeo = null;
        }
        if (this._endpointStartMat) {
            this._endpointStartMat.dispose();
            this._endpointStartMat = null;
        }
        if (this._endpointEndMat) {
            this._endpointEndMat.dispose();
            this._endpointEndMat = null;
        }

        const starts = [];
        const ends = [];
        for (const edge of this._edges) {
            const a = edge?.centerline?.a ?? null;
            const b = edge?.centerline?.b ?? null;
            if (a && Number.isFinite(a.x) && Number.isFinite(a.z)) starts.push({ x: a.x, z: a.z });
            if (b && Number.isFinite(b.x) && Number.isFinite(b.z)) ends.push({ x: b.x, z: b.z });
        }

        if (!starts.length && !ends.length) return;

        this._endpointGeo = new THREE.CircleGeometry(Math.max(0.25, this._endpointRadius), 20);
        this._endpointGeo.rotateX(-Math.PI / 2);

        this._endpointStartMat = new THREE.MeshBasicMaterial({
            color: this._endpointStartColor,
            transparent: true,
            opacity: this._endpointOpacity,
            depthTest: false,
            depthWrite: false
        });
        this._endpointEndMat = new THREE.MeshBasicMaterial({
            color: this._endpointEndColor,
            transparent: true,
            opacity: this._endpointOpacity,
            depthTest: false,
            depthWrite: false
        });

        this._endpointStartMesh = createInstancedMarkerMesh({
            geometry: this._endpointGeo,
            material: this._endpointStartMat,
            points: starts,
            y: this._endpointY,
            renderOrder: 29,
            visible: true
        });
        if (this._endpointStartMesh) {
            this._endpointStartMesh.name = 'RoadGraphStartPoints';
            this.group.add(this._endpointStartMesh);
        }

        this._endpointEndMesh = createInstancedMarkerMesh({
            geometry: this._endpointGeo,
            material: this._endpointEndMat,
            points: ends,
            y: this._endpointY,
            renderOrder: 29,
            visible: true
        });
        if (this._endpointEndMesh) {
            this._endpointEndMesh.name = 'RoadGraphEndPoints';
            this.group.add(this._endpointEndMesh);
        }
    }

    _rebuildCrossingMarkers() {
        if (this._crossMesh) {
            this._crossMesh.removeFromParent();
            this._crossMesh = null;
        }
        if (this._crossGeo) {
            this._crossGeo.dispose();
            this._crossGeo = null;
        }
        if (this._crossMat) {
            this._crossMat.dispose();
            this._crossMat = null;
        }

        const points = [];
        for (const entry of this._intersections) {
            const nodeId = entry?.nodeId ?? null;
            const node = nodeId ? this._network?.getNode?.(nodeId) : null;
            if (node?.position && Number.isFinite(node.position.x) && Number.isFinite(node.position.z)) {
                points.push({ x: node.position.x, z: node.position.z });
                continue;
            }
            const center = averagePointXZ(entry?.points);
            if (center && Number.isFinite(center.x) && Number.isFinite(center.z)) points.push(center);
        }

        if (!points.length) return;

        const radius = Math.max(0.4, this._markerRadius);
        this._crossGeo = new THREE.CircleGeometry(radius, 28);
        this._crossGeo.rotateX(-Math.PI / 2);
        this._crossMat = new THREE.MeshBasicMaterial({
            color: this._markerColor,
            transparent: true,
            opacity: this._markerOpacity,
            depthTest: false,
            depthWrite: false
        });
        this._crossMesh = createInstancedMarkerMesh({
            geometry: this._crossGeo,
            material: this._crossMat,
            points,
            y: this._crossingY,
            renderOrder: 28,
            visible: true
        });
        if (this._crossMesh) {
            this._crossMesh.name = 'RoadGraphCrossingMarkers';
            this.group.add(this._crossMesh);
        } else {
            this._crossGeo.dispose();
            this._crossMat.dispose();
            this._crossGeo = null;
            this._crossMat = null;
        }
    }
}
