// graphics/visuals/city/CityConnectorDebugOverlay.js
// Manages connector debug visuals and hover highlights for the city state.
import * as THREE from 'three';
import { sampleConnector } from '../../assets3d/generators/road/connectors/ArcConnector.js';
import { createPoleMarkerAssets, createPoleMarkerGroup } from '../shared/PoleMarkerGroup.js';
import { createConnectorPathLine } from '../shared/ConnectorPathLine.js';
import { createConnectorTurnCircleLines } from '../shared/ConnectorTurnCircleLines.js';
import { createConnectorArrowLines } from '../shared/ConnectorArrowLines.js';
import { createConnectorCollisionArrow } from './ConnectorCollisionArrow.js';

const TAU = Math.PI * 2;

export class CityConnectorDebugOverlay {
    constructor(engine, options = {}) {
        this.engine = engine;
        this.group = new THREE.Group();
        this.group.name = 'CityConnectorDebug';

        this._markerY = Number.isFinite(options.markerY) ? options.markerY : 0.05;
        this._arrowY = this._markerY + (Number.isFinite(options.arrowYOffset) ? options.arrowYOffset : 0.01);
        this._arrowLen = Number.isFinite(options.arrowLen) ? options.arrowLen : 0.8;
        this._lineY = Number.isFinite(options.lineY) ? options.lineY : (this._markerY + 0.02);
        this._sampleStep = Number.isFinite(options.sampleStep) ? options.sampleStep : 0.25;
        this._masterColor = Number.isFinite(options.masterColor) ? options.masterColor : 0x1d4d8f;
        this._slaveColor = Number.isFinite(options.slaveColor) ? options.slaveColor : 0xc2410c;

        this._lineResolution = new THREE.Vector2();
        this._pathLineWidth = Number.isFinite(options.pathLineWidth) ? options.pathLineWidth : 6;
        this._circleLineWidth = Number.isFinite(options.circleLineWidth)
            ? options.circleLineWidth
            : Math.max(1, this._pathLineWidth * 0.45);

        const markerRadius = Number.isFinite(options.markerRadius) ? options.markerRadius : 0.35;
        this._markerAssets = {
            master: createPoleMarkerAssets({ radius: markerRadius, colorHex: this._masterColor, depthTest: true }),
            slave: createPoleMarkerAssets({ radius: markerRadius, colorHex: this._slaveColor, depthTest: true })
        };

        this._markers = [];
        this._arrowLines = [];
        this._connectors = [];
        this._activeConnectorIndex = -1;
        this._activePoleIndex = -1;
        this._collisionArrow = null;
        this._tmpDir = new THREE.Vector3();

        const { line: pathLine, geo: pathGeo, mat: pathMat } = createConnectorPathLine({
            y: this._lineY,
            color: 0x3b82f6,
            lineWidth: this._pathLineWidth,
            opacity: 1,
            renderOrder: 8,
            depthTest: false,
            depthWrite: false
        });
        this._pathLine = pathLine;
        this._pathGeo = pathGeo;
        this._pathMat = pathMat;
        this.group.add(this._pathLine);

        this._circleLines = createConnectorTurnCircleLines({
            y: this._markerY,
            lineWidth: this._circleLineWidth,
            opacity: 0.7,
            renderOrder: 7,
            depthTest: false,
            depthWrite: false
        });
        for (const entry of this._circleLines) this.group.add(entry.line);

        this._arrowLineWidth = Number.isFinite(options.arrowLineWidth)
            ? options.arrowLineWidth
            : Math.max(2, this._pathLineWidth * 0.45);
        const arrowVisuals = createConnectorArrowLines({
            y: this._markerY,
            colors: [this._masterColor, this._slaveColor],
            lineWidth: this._arrowLineWidth,
            opacity: 0.95,
            renderOrderLine: 12,
            renderOrderCone: 13,
            depthTest: false,
            depthWrite: false,
            markerRadius
        });
        this._arrowLines = arrowVisuals.arrows;
        this._arrowConeGeo = arrowVisuals.coneGeometry;
        for (const entry of this._arrowLines) {
            this.group.add(entry.line);
            this.group.add(entry.cone);
        }

        const collisionColor = Number.isFinite(options.collisionArrowColor) ? options.collisionArrowColor : 0x000000;
        const collisionOpacity = Number.isFinite(options.collisionArrowOpacity) ? options.collisionArrowOpacity : 0.5;
        this._collisionArrow = createConnectorCollisionArrow({
            y: this._markerY,
            color: collisionColor,
            opacity: collisionOpacity,
            lineWidth: this._arrowLineWidth,
            markerRadius,
            headLength: options.collisionArrowHeadLen,
            headWidth: options.collisionArrowHeadWidth,
            renderOrderLine: 14,
            renderOrderHead: 15,
            depthTest: false,
            depthWrite: false
        });
        this.group.add(this._collisionArrow.line);
        this.group.add(this._collisionArrow.head);
        this._syncLineResolution();
    }

    setConnectors(connectors = []) {
        const list = Array.isArray(connectors) ? connectors : [];
        this._connectors = list;
        const total = list.length * 2;
        for (let i = 0; i < list.length; i++) {
            const connector = list[i];
            const p0 = connector?.p0;
            const p1 = connector?.p1;

            const masterIndex = i * 2;
            const slaveIndex = masterIndex + 1;

            const p0Positive = this._poleIsPositive(p0);
            const p1Positive = this._poleIsPositive(p1);
            const masterMarker = this._getMarker(masterIndex, p0Positive !== false);
            this._setMarker(masterMarker, p0Positive == null ? null : p0);
            const slaveMarker = this._getMarker(slaveIndex, p1Positive !== false);
            this._setMarker(slaveMarker, p1Positive == null ? null : p1);

        }

        for (let i = total; i < this._markers.length; i++) {
            this._markers[i].visible = false;
        }
        this.setHoverSelection(null);
    }

    setEnabled(enabled) {
        const isEnabled = !!enabled;
        this.group.visible = isEnabled;
        if (!isEnabled) this.setHoverSelection(null);
        else this._syncLineResolution();
    }

    setHoverSelection(selection) {
        if (!selection || !this._connectors.length) {
            this._activeConnectorIndex = -1;
            this._activePoleIndex = -1;
            this._setAllMarkersVisible(false);
            this._hideAllArrows();
            this._hideCollisionArrow();
            this._pathLine.visible = false;
            this._setCirclesVisible(false);
            return;
        }
        this._syncLineResolution();
        const { connectorIndex, poleIndex } = selection;
        const record = this._connectors[connectorIndex];
        const connector = record?.connector ?? record?.p0?.connector ?? null;
        if (!record) {
            this._activeConnectorIndex = -1;
            this._activePoleIndex = -1;
            this._setAllMarkersVisible(false);
            this._hideAllArrows();
            this._hideCollisionArrow();
            this._pathLine.visible = false;
            this._setCirclesVisible(false);
            return;
        }
        if (connectorIndex !== this._activeConnectorIndex || poleIndex !== this._activePoleIndex) {
            this._activeConnectorIndex = connectorIndex;
            this._activePoleIndex = poleIndex;
            this._setOnlyMarkersVisible(connectorIndex);
            this._showArrowsForConnector(record);
            this._updateCollisionArrow(record, poleIndex);
            if (connector) {
                this._updatePathLine(record, connector);
                this._updateCircles(connector);
            } else {
                this._pathLine.visible = false;
                this._setCirclesVisible(false);
            }
        }
    }

    destroy() {
        if (this.group) this.group.removeFromParent();
        if (this._markerAssets) {
            for (const assets of Object.values(this._markerAssets)) {
                assets?.dispose?.();
            }
        }
        if (this._pathGeo) this._pathGeo.dispose();
        if (this._pathMat) this._pathMat.dispose();
        for (const entry of this._circleLines) {
            entry.geo?.dispose?.();
            entry.mat?.dispose?.();
        }
        if (this._arrowConeGeo) this._arrowConeGeo.dispose();
        for (const arrow of this._arrowLines) {
            arrow.geo?.dispose?.();
            arrow.mat?.dispose?.();
            arrow.cone?.material?.dispose?.();
        }
        if (this._collisionArrow) {
            this._collisionArrow.geo?.dispose?.();
            this._collisionArrow.mat?.dispose?.();
            this._collisionArrow.headGeo?.dispose?.();
            this._collisionArrow.headMat?.dispose?.();
        }
        this._markers = [];
        this._arrowLines = [];
        this._collisionArrow = null;
        this._markerAssets = null;
        this.group = null;
    }

    _syncLineResolution() {
        if (!this.engine?.renderer || !this._lineResolution) return;
        const size = this.engine.renderer.getSize(this._lineResolution);
        if (this._pathMat) this._pathMat.resolution.set(size.x, size.y);
        if (Array.isArray(this._circleLines)) {
            for (const entry of this._circleLines) {
                entry.mat.resolution.set(size.x, size.y);
            }
        }
        if (Array.isArray(this._arrowLines)) {
            for (const entry of this._arrowLines) {
                entry.mat.resolution.set(size.x, size.y);
            }
        }
        if (this._collisionArrow?.mat) {
            this._collisionArrow.mat.resolution.set(size.x, size.y);
        }
    }

    _setMarkerAssets(marker, type) {
        const assets = this._markerAssets?.[type] ?? null;
        const parts = marker?.userData?.markerParts;
        if (!parts || !assets) return;
        parts.disc.material = assets.discMat;
        parts.ring.material = assets.ringMat;
        parts.dot.material = assets.dotMat;
        marker.userData.markerType = type;
        marker.userData.markerAssets = assets;
    }

    _buildCirclesFromPose(pose, radius) {
        if (!pose || !Number.isFinite(radius)) return null;
        const pos = pose.position ?? pose.pos ?? null;
        if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) return null;
        let dir = pose.direction ?? pose.dir ?? null;
        if (!dir || !Number.isFinite(dir.x) || !Number.isFinite(dir.y)) {
            if (Number.isFinite(pose.heading)) {
                dir = new THREE.Vector2(Math.cos(pose.heading), Math.sin(pose.heading));
            } else {
                return null;
            }
        }
        const len = Math.hypot(dir.x, dir.y);
        if (len < 1e-6) return null;
        const nx = -dir.y / len;
        const ny = dir.x / len;
        const left = new THREE.Vector2(pos.x + nx * radius, pos.y + ny * radius);
        const right = new THREE.Vector2(pos.x - nx * radius, pos.y - ny * radius);
        return {
            left: { center: left, radius },
            right: { center: right, radius }
        };
    }

    _getMarker(index, isMaster) {
        let marker = this._markers[index];
        const type = isMaster ? 'master' : 'slave';
        if (!marker) {
            const assets = this._markerAssets?.[type] ?? null;
            const { group } = createPoleMarkerGroup({ assets });
            marker = group;
            marker.visible = false;
            marker.userData.markerType = type;
            this.group.add(marker);
            this._markers[index] = marker;
            return marker;
        }
        if (marker.userData?.markerType !== type) this._setMarkerAssets(marker, type);
        return marker;
    }

    _poleIsPositive(pole) {
        if (!pole) return null;
        if (pole.arrowRole === 'p0') return true;
        if (pole.arrowRole === 'p1') return false;
        if (Number.isFinite(pole.arrowSign)) return pole.arrowSign >= 0;
        return null;
    }

    _setMarker(marker, pos) {
        if (!marker || !pos) {
            if (marker) {
                marker.visible = false;
                marker.userData.hasPos = false;
            }
            return;
        }
        marker.position.set(pos.x, this._markerY, pos.z);
        marker.visible = true;
        marker.userData.hasPos = true;
    }

    _updatePathLine(record, connector) {
        const sample = sampleConnector(connector, this._sampleStep);
        let points = sample.points ?? [];
        if (points.length >= 2) {
            points = points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
        }
        if (points.length < 2) {
            const fallback = [];
            if (record?.p0) fallback.push(new THREE.Vector2(record.p0.x, record.p0.z));
            if (record?.p1) fallback.push(new THREE.Vector2(record.p1.x, record.p1.z));
            points = fallback;
        }
        if (points.length >= 2) {
            const segments = connector.segments ?? [];
            const startPoint = segments[0]?.startPoint;
            const endPoint = segments[segments.length - 1]?.endPoint;
            if (startPoint) points[0] = startPoint.clone();
            if (endPoint) points[points.length - 1] = endPoint.clone();
        }
        if (points.length < 2) {
            this._pathLine.visible = false;
            return;
        }
        const positions = [];
        for (let i = 0; i < points.length; i++) {
            const p = points[i];
            positions.push(p.x, this._lineY, p.y);
        }
        this._pathGeo.setPositions(positions);
        this._pathGeo.instanceCount = Math.max(0, points.length - 1);
        this._pathLine.computeLineDistances();
        this._pathLine.visible = true;
    }

    _updateCircles(connector) {
        const segments = connector.segments ?? [];
        const startTurn = segments[0]?.turnDir ?? null;
        const endTurn = segments[segments.length - 1]?.turnDir ?? null;
        const fallbackRadius = Number.isFinite(connector.radius)
            ? connector.radius
            : (segments.find((segment) => Number.isFinite(segment?.radius))?.radius ?? null);
        const startFallback = this._buildCirclesFromPose(connector.startPose ?? null, fallbackRadius);
        const endFallback = this._buildCirclesFromPose(connector.endPose ?? connector.endPoseComputed ?? null, fallbackRadius);
        const circles = [
            { circle: connector.startLeftCircle ?? startFallback?.left, chosen: startTurn === 'L' },
            { circle: connector.startRightCircle ?? startFallback?.right, chosen: startTurn === 'R' },
            { circle: connector.endLeftCircle ?? endFallback?.left, chosen: endTurn === 'L' },
            { circle: connector.endRightCircle ?? endFallback?.right, chosen: endTurn === 'R' }
        ];
        for (let i = 0; i < this._circleLines.length; i++) {
            const entry = this._circleLines[i];
            const data = circles[i];
            const circle = data?.circle ?? null;
            if (!circle || !Number.isFinite(circle.radius)) {
                entry.line.visible = false;
                continue;
            }
            const center = circle.center;
            const r = Math.max(0.01, circle.radius);
            const segs = Math.max(32, Math.min(96, Math.round(r * 8)));
            const positions = [];
            for (let k = 0; k <= segs; k++) {
                const t = (k / segs) * TAU;
                positions.push(
                    center.x + Math.cos(t) * r,
                    this._markerY,
                    center.y + Math.sin(t) * r
                );
            }
            entry.geo.setPositions(positions);
            entry.geo.instanceCount = Math.max(0, segs);
            const dashSize = Math.max(0.2, r * 0.08);
            const gapSize = Math.max(0.15, r * 0.06);
            entry.mat.dashed = !data.chosen;
            entry.mat.dashSize = dashSize;
            entry.mat.gapSize = gapSize;
            entry.mat.needsUpdate = true;
            entry.line.computeLineDistances();
            entry.line.visible = true;
        }
    }

    _setAllMarkersVisible(visible) {
        for (const marker of this._markers) {
            if (marker) marker.visible = visible;
        }
    }

    _setOnlyMarkersVisible(connectorIndex) {
        const baseIndex = connectorIndex * 2;
        const visibleIndices = new Set([baseIndex, baseIndex + 1]);
        for (let i = 0; i < this._markers.length; i++) {
            const marker = this._markers[i];
            if (marker) marker.visible = visibleIndices.has(i) && marker.userData?.hasPos;
        }
    }

    _hideAllArrows() {
        for (const arrow of this._arrowLines) {
            if (!arrow) continue;
            arrow.line.visible = false;
            arrow.cone.visible = false;
        }
    }

    _hideCollisionArrow() {
        if (!this._collisionArrow) return;
        this._collisionArrow.line.visible = false;
        this._collisionArrow.head.visible = false;
    }

    _showArrowsForConnector(record) {
        this._hideAllArrows();
        const p0 = record?.p0;
        const p1 = record?.p1;
        const dir0 = p0?.arrowDir ?? record?.dir0 ?? null;
        const dir1 = p1?.arrowDir ?? record?.dir1 ?? null;
        if (!p0 || !p1 || !dir0 || !dir1) return;
        const data = [
            { p: p0, dir: dir0 },
            { p: p1, dir: dir1 }
        ];
        const arrowLen = this._arrowLen;
        for (let i = 0; i < this._arrowLines.length; i++) {
            const entry = this._arrowLines[i];
            const item = data[i];
            if (!entry || !item?.p || !item?.dir) continue;
            const isPositive = this._poleIsPositive(item.p);
            if (isPositive == null) {
                entry.line.visible = false;
                entry.cone.visible = false;
                continue;
            }
            const color = isPositive === false ? this._slaveColor : this._masterColor;
            if (entry.mat?.color) entry.mat.color.setHex(color);
            if (entry.cone?.material?.color) entry.cone.material.color.setHex(color);
            this._tmpDir.set(item.dir.x, 0, item.dir.z);
            if (this._tmpDir.lengthSq() < 1e-6) {
                entry.line.visible = false;
                entry.cone.visible = false;
                continue;
            }
            this._tmpDir.normalize();
            const start = new THREE.Vector3(item.p.x, this._arrowY, item.p.z);
            const end = start.clone().add(this._tmpDir.clone().multiplyScalar(arrowLen));
            entry.geo.setPositions([start.x, start.y, start.z, end.x, end.y, end.z]);
            entry.geo.instanceCount = 1;
            entry.line.computeLineDistances();
            entry.line.visible = true;
            entry.cone.position.set(end.x, this._arrowY, end.z);
            const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), this._tmpDir);
            entry.cone.quaternion.copy(q);
            entry.cone.visible = true;
        }
    }

    _updateCollisionArrow(record, poleIndex) {
        if (!this._collisionArrow) return;
        const pole = poleIndex === 1 ? record?.p1 : record?.p0;
        const collision = pole?.collision ?? null;
        const px = pole?.x;
        const pz = Number.isFinite(pole?.z) ? pole.z : pole?.y;
        const cx = collision?.x;
        const cz = Number.isFinite(collision?.z) ? collision.z : collision?.y;
        if (!Number.isFinite(px) || !Number.isFinite(pz) || !Number.isFinite(cx) || !Number.isFinite(cz)) {
            this._hideCollisionArrow();
            return;
        }
        const dx = cx - px;
        const dz = cz - pz;
        const len = Math.hypot(dx, dz);
        if (!(len > 1e-6)) {
            this._hideCollisionArrow();
            return;
        }
        this._collisionArrow.geo.setPositions([px, this._arrowY, pz, cx, this._arrowY, cz]);
        this._collisionArrow.geo.instanceCount = 1;
        this._collisionArrow.line.computeLineDistances();
        this._collisionArrow.line.visible = true;
        this._tmpDir.set(dx / len, 0, dz / len);
        this._collisionArrow.head.position.set(cx, this._arrowY, cz);
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), this._tmpDir);
        this._collisionArrow.head.quaternion.copy(q);
        this._collisionArrow.head.visible = true;
    }

    _setCirclesVisible(visible) {
        for (const entry of this._circleLines) {
            entry.line.visible = visible;
        }
    }
}
