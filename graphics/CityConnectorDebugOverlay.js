// graphics/CityConnectorDebugOverlay.js
import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { sampleConnector } from './assets3d/generators/internal_road/ArcConnector.js';

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
        this._markerGeo = new THREE.CircleGeometry(markerRadius, 40);
        this._markerRingGeo = new THREE.RingGeometry(markerRadius * 0.9, markerRadius * 1.06, 48);
        this._markerDotGeo = new THREE.CircleGeometry(markerRadius * 0.16, 24);
        this._markerMats = {
            master: this._buildMarkerMaterials(this._masterColor),
            slave: this._buildMarkerMaterials(this._slaveColor)
        };

        this._markers = [];
        this._arrowLines = [];
        this._connectors = [];
        this._activeConnectorIndex = -1;
        this._activePoleIndex = -1;
        this._tmpDir = new THREE.Vector3();

        this._pathGeo = new LineGeometry();
        this._pathGeo.setPositions([0, this._lineY, 0, 0, this._lineY, 0]);
        this._pathMat = new LineMaterial({
            color: 0x3b82f6,
            linewidth: this._pathLineWidth,
            worldUnits: false,
            transparent: true,
            opacity: 1,
            depthTest: false,
            depthWrite: false
        });
        this._syncLineResolution();
        this._pathLine = new Line2(this._pathGeo, this._pathMat);
        this._pathLine.computeLineDistances();
        this._pathLine.visible = false;
        this._pathLine.renderOrder = 8;
        this._pathLine.frustumCulled = false;
        this.group.add(this._pathLine);

        this._circleLines = [];
        const circleColors = [0x15803d, 0x15803d, 0x8b5cf6, 0x8b5cf6];
        for (let i = 0; i < circleColors.length; i++) {
            const baseColor = circleColors[i];
            const geo = new LineGeometry();
            geo.setPositions([0, this._markerY, 0, 0, this._markerY, 0]);
            const mat = new LineMaterial({
                color: baseColor,
                linewidth: this._circleLineWidth,
                worldUnits: false,
                transparent: true,
                opacity: 0.7,
                depthTest: false,
                depthWrite: false
            });
            mat.resolution.set(this._lineResolution.x, this._lineResolution.y);
            const line = new Line2(geo, mat);
            line.computeLineDistances();
            line.visible = false;
            line.renderOrder = 7;
            line.frustumCulled = false;
            this.group.add(line);
            this._circleLines.push({ line, geo, mat, baseColor });
        }

        this._arrowLineWidth = Number.isFinite(options.arrowLineWidth)
            ? options.arrowLineWidth
            : Math.max(2, this._pathLineWidth * 0.45);
        this._arrowConeGeo = new THREE.ConeGeometry(markerRadius * 0.16, markerRadius * 0.4, 16, 1);
        const arrowColors = [this._masterColor, this._slaveColor];
        for (let i = 0; i < arrowColors.length; i++) {
            const geo = new LineGeometry();
            geo.setPositions([0, this._markerY, 0, 0, this._markerY, 0]);
            const mat = new LineMaterial({
                color: arrowColors[i],
                linewidth: this._arrowLineWidth,
                worldUnits: false,
                transparent: true,
                opacity: 0.95,
                depthTest: false,
                depthWrite: false
            });
            mat.resolution.set(this._lineResolution.x, this._lineResolution.y);
            const line = new Line2(geo, mat);
            line.computeLineDistances();
            line.visible = false;
            line.frustumCulled = false;
            line.renderOrder = 12;
            const coneMat = new THREE.MeshBasicMaterial({
                color: arrowColors[i],
                transparent: true,
                opacity: 0.95,
                depthTest: false,
                depthWrite: false
            });
            const cone = new THREE.Mesh(this._arrowConeGeo, coneMat);
            cone.visible = false;
            cone.renderOrder = 13;
            this.group.add(line);
            this.group.add(cone);
            this._arrowLines.push({ line, geo, mat, cone });
        }
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

            const masterMarker = this._getMarker(masterIndex, true);
            this._setMarker(masterMarker, p0);
            const slaveMarker = this._getMarker(slaveIndex, false);
            this._setMarker(slaveMarker, p1);

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
            this._pathLine.visible = false;
            this._setCirclesVisible(false);
            return;
        }
        this._syncLineResolution();
        const { connectorIndex, poleIndex } = selection;
        const record = this._connectors[connectorIndex];
        const connector = record?.connector ?? null;
        if (!record || !connector) {
            this._activeConnectorIndex = -1;
            this._activePoleIndex = -1;
            this._setAllMarkersVisible(false);
            this._hideAllArrows();
            this._pathLine.visible = false;
            this._setCirclesVisible(false);
            return;
        }
        if (connectorIndex !== this._activeConnectorIndex || poleIndex !== this._activePoleIndex) {
            this._activeConnectorIndex = connectorIndex;
            this._activePoleIndex = poleIndex;
            this._setOnlyMarkersVisible(connectorIndex);
            this._showArrowsForConnector(record);
            this._updatePathLine(record, connector);
            this._updateCircles(connector);
        }
    }

    destroy() {
        if (this.group) this.group.removeFromParent();
        if (this._markerGeo) this._markerGeo.dispose();
        if (this._markerRingGeo) this._markerRingGeo.dispose();
        if (this._markerDotGeo) this._markerDotGeo.dispose();
        if (this._markerMats) {
            for (const mats of Object.values(this._markerMats)) {
                mats?.discMat?.dispose?.();
                mats?.ringMat?.dispose?.();
                mats?.dotMat?.dispose?.();
                mats?.texture?.dispose?.();
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
            arrow.cone?.geometry?.dispose?.();
            arrow.cone?.material?.dispose?.();
        }
        this._markers = [];
        this._arrowLines = [];
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
    }

    _rgbaFromColor(color, alpha) {
        const r = Math.round(color.r * 255);
        const g = Math.round(color.g * 255);
        const b = Math.round(color.b * 255);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    _createMarkerTexture(size, colors) {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        const c = size * 0.5;
        const grad = ctx.createRadialGradient(c, c, 0, c, c, c);
        grad.addColorStop(0, colors.center);
        grad.addColorStop(0.5, colors.mid);
        grad.addColorStop(1, colors.edge);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(c, c, c, 0, TAU);
        ctx.fill();
        const tex = new THREE.CanvasTexture(canvas);
        tex.wrapS = THREE.ClampToEdgeWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        tex.needsUpdate = true;
        return tex;
    }

    _buildMarkerMaterials(colorHex) {
        const base = new THREE.Color(colorHex);
        const texture = this._createMarkerTexture(128, {
            center: this._rgbaFromColor(base, 0.95),
            mid: this._rgbaFromColor(base, 0.7),
            edge: this._rgbaFromColor(base, 0)
        });
        const discMat = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            opacity: 1,
            side: THREE.DoubleSide,
            depthWrite: false,
            depthTest: true
        });
        const ringMat = new THREE.MeshBasicMaterial({
            color: colorHex,
            transparent: true,
            opacity: 0.9,
            side: THREE.DoubleSide,
            depthWrite: false,
            depthTest: true
        });
        const dotMat = new THREE.MeshBasicMaterial({
            color: colorHex,
            transparent: true,
            opacity: 0.95,
            side: THREE.DoubleSide,
            depthWrite: false,
            depthTest: true
        });
        return { texture, discMat, ringMat, dotMat };
    }

    _buildMarkerGroup(type) {
        const mats = this._markerMats[type];
        const g = new THREE.Group();
        const disc = new THREE.Mesh(this._markerGeo, mats.discMat);
        const ring = new THREE.Mesh(this._markerRingGeo, mats.ringMat);
        const dot = new THREE.Mesh(this._markerDotGeo, mats.dotMat);
        disc.rotation.x = -Math.PI / 2;
        ring.rotation.x = -Math.PI / 2;
        dot.rotation.x = -Math.PI / 2;
        disc.renderOrder = 3;
        ring.renderOrder = 4;
        dot.renderOrder = 5;
        g.add(disc);
        g.add(ring);
        g.add(dot);
        g.userData.markerType = type;
        g.userData.markerParts = { disc, ring, dot };
        return g;
    }

    _setMarkerMaterials(marker, type) {
        const mats = this._markerMats[type];
        const parts = marker?.userData?.markerParts;
        if (!parts || !mats) return;
        parts.disc.material = mats.discMat;
        parts.ring.material = mats.ringMat;
        parts.dot.material = mats.dotMat;
        marker.userData.markerType = type;
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
            marker = this._buildMarkerGroup(type);
            marker.visible = false;
            this.group.add(marker);
            this._markers[index] = marker;
            return marker;
        }
        if (marker.userData?.markerType !== type) this._setMarkerMaterials(marker, type);
        return marker;
    }

    _setMarker(marker, pos) {
        if (!marker || !pos) {
            if (marker) marker.visible = false;
            return;
        }
        marker.position.set(pos.x, this._markerY, pos.z);
        marker.visible = true;
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
            if (marker) marker.visible = visibleIndices.has(i);
        }
    }

    _hideAllArrows() {
        for (const arrow of this._arrowLines) {
            if (!arrow) continue;
            arrow.line.visible = false;
            arrow.cone.visible = false;
        }
    }

    _showArrowsForConnector(record) {
        this._hideAllArrows();
        const data = [
            { p: record?.p0, dir: record?.dir0 },
            { p: record?.p1, dir: record?.dir1 }
        ];
        const arrowLen = this._arrowLen;
        for (let i = 0; i < this._arrowLines.length; i++) {
            const entry = this._arrowLines[i];
            const item = data[i];
            if (!entry || !item?.p || !item?.dir) continue;
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
            entry.line.computeLineDistances();
            entry.line.visible = true;
            entry.cone.position.set(end.x, this._arrowY, end.z);
            const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), this._tmpDir);
            entry.cone.quaternion.copy(q);
            entry.cone.visible = true;
        }
    }

    _setCirclesVisible(visible) {
        for (const entry of this._circleLines) {
            entry.line.visible = visible;
        }
    }
}
