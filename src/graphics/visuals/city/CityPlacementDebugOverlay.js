// src/graphics/visuals/city/CityPlacementDebugOverlay.js
// Draws the city placement model in the map debugger: reservations (keep-out
// areas with a fixed size), each construction's assigned squares, and the
// parcel its limits resolved to. Judge a placement here before driving it.
import * as THREE from 'three';
import { createHoverOutlineLine } from './HoverOutlineLine.js';

const SQUARE_COLOR = 0x0a84ff;
const PARCEL_COLOR = 0x64d2ff;
const RESERVATION_COLOR = 0xbf5af2;
const RESERVATION_FILL_OPACITY = 0.32;
const SQUARE_FILL_OPACITY = 0.13;

function pushLoopSegments(positions, loop, y) {
    if (!Array.isArray(loop) || loop.length < 2) return;
    for (let i = 0; i < loop.length; i++) {
        const a = loop[i];
        const b = loop[(i + 1) % loop.length];
        positions.push(a.x, y, a.z, b.x, y, b.z);
    }
}

function pushRectSegments(positions, rect, y) {
    if (!rect) return;
    pushLoopSegments(positions, [
        { x: rect.minX, z: rect.minZ },
        { x: rect.maxX, z: rect.minZ },
        { x: rect.maxX, z: rect.maxZ },
        { x: rect.minX, z: rect.maxZ }
    ], y);
}

// A dashed-looking marker for the limit line itself: the parcel edge drawn
// again, slightly lifted, only on the sides whose limit was declared.
function pushLimitSegments(positions, parcel, y) {
    const rect = parcel?.rect;
    const limits = parcel?.limits;
    if (!rect || !limits) return;
    for (const [side, limit] of Object.entries(limits)) {
        if (!limit || limit.type === 'square') continue;
        if (side === 'north') positions.push(rect.minX, y, rect.maxZ, rect.maxX, y, rect.maxZ);
        else if (side === 'south') positions.push(rect.minX, y, rect.minZ, rect.maxX, y, rect.minZ);
        else if (side === 'east') positions.push(rect.maxX, y, rect.minZ, rect.maxX, y, rect.maxZ);
        else if (side === 'west') positions.push(rect.minX, y, rect.minZ, rect.minX, y, rect.maxZ);
    }
}

export class CityPlacementDebugOverlay {
    constructor({ renderer = null, surfaceY = 0.1 } = {}) {
        this.group = new THREE.Group();
        this.group.name = 'CityPlacementDebug';
        this.group.visible = false;

        this._surfaceY = surfaceY;

        this._squareFillGeo = new THREE.PlaneGeometry(1, 1, 1, 1);
        this._squareFillGeo.rotateX(-Math.PI / 2);
        this._squareFillMat = new THREE.MeshBasicMaterial({
            color: SQUARE_COLOR,
            transparent: true,
            opacity: SQUARE_FILL_OPACITY,
            depthTest: false,
            depthWrite: false
        });
        this._squareFill = new THREE.InstancedMesh(this._squareFillGeo, this._squareFillMat, 1);
        this._squareFill.name = 'PlacementAssignedSquares';
        this._squareFill.renderOrder = 36;
        this._squareFill.frustumCulled = false;
        this._squareFill.count = 0;
        this.group.add(this._squareFill);

        this._reservationFillGeo = new THREE.PlaneGeometry(1, 1, 1, 1);
        this._reservationFillGeo.rotateX(-Math.PI / 2);
        this._reservationFillMat = new THREE.MeshBasicMaterial({
            color: RESERVATION_COLOR,
            transparent: true,
            opacity: RESERVATION_FILL_OPACITY,
            depthTest: false,
            depthWrite: false
        });
        this._reservationFill = new THREE.InstancedMesh(this._reservationFillGeo, this._reservationFillMat, 1);
        this._reservationFill.name = 'PlacementReservations';
        this._reservationFill.renderOrder = 38;
        this._reservationFill.frustumCulled = false;
        this._reservationFill.count = 0;
        this.group.add(this._reservationFill);

        this._parcelLine = createHoverOutlineLine({ renderer, color: PARCEL_COLOR, lineWidth: 3, opacity: 0.9, renderOrder: 45 });
        this._parcelLine.line.name = 'PlacementParcels';
        this.group.add(this._parcelLine.line);

        this._limitLine = createHoverOutlineLine({ renderer, color: PARCEL_COLOR, lineWidth: 7, opacity: 1.0, renderOrder: 46 });
        this._limitLine.line.name = 'PlacementLimits';
        this.group.add(this._limitLine.line);

        this._reservationLine = createHoverOutlineLine({ renderer, color: RESERVATION_COLOR, lineWidth: 5, opacity: 1.0, renderOrder: 47 });
        this._reservationLine.line.name = 'PlacementReservationOutlines';
        this.group.add(this._reservationLine.line);
    }

    setVisible(visible) {
        this.group.visible = !!visible;
    }

    /** Rebuilds every overlay from the map's resolved placement model. */
    sync({ map, surfaceY = null } = {}) {
        const y = Number.isFinite(surfaceY) ? surfaceY : this._surfaceY;
        this._surfaceY = y;

        const buildings = Array.isArray(map?.buildings) ? map.buildings : [];
        const reservations = Array.isArray(map?.reservations) ? map.reservations : [];
        const tileSize = Number(map?.tileSize) || 1;

        const squares = [];
        for (const entry of buildings) {
            for (const square of (entry?.parcel?.squares ?? entry?.tiles ?? [])) squares.push(square);
        }
        for (const reservation of reservations) {
            for (const square of reservation?.squares ?? []) squares.push(square);
        }
        this._syncInstances(this._squareFill, squares.map((square) => {
            const center = map?.tileToWorldCenter?.(square[0] | 0, square[1] | 0);
            return center ? { x: center.x, z: center.z, w: tileSize * 0.98, d: tileSize * 0.98 } : null;
        }).filter(Boolean), y);

        this._syncInstances(this._reservationFill, reservations.map((reservation) => {
            const rect = reservation?.rect;
            if (!rect) return null;
            return {
                x: (rect.minX + rect.maxX) * 0.5,
                z: (rect.minZ + rect.maxZ) * 0.5,
                w: Math.max(0.01, rect.maxX - rect.minX),
                d: Math.max(0.01, rect.maxZ - rect.minZ)
            };
        }).filter(Boolean), y + 0.01);

        const parcelPositions = [];
        const limitPositions = [];
        for (const entry of buildings) {
            if (!entry?.parcel) continue;
            pushRectSegments(parcelPositions, entry.parcel.rect, y + 0.02);
            pushLimitSegments(limitPositions, entry.parcel, y + 0.03);
        }
        for (const reservation of reservations) {
            if (!reservation?.parcel) continue;
            pushRectSegments(parcelPositions, reservation.parcel.rect, y + 0.02);
            pushLimitSegments(limitPositions, reservation.parcel, y + 0.03);
        }

        const reservationPositions = [];
        for (const reservation of reservations) {
            for (const loop of reservation?.loops ?? []) pushLoopSegments(reservationPositions, loop, y + 0.04);
        }

        this._setLine(this._parcelLine.line, parcelPositions);
        this._setLine(this._limitLine.line, limitPositions);
        this._setLine(this._reservationLine.line, reservationPositions);
    }

    _syncInstances(mesh, rects, y) {
        if (rects.length > mesh.instanceMatrix.count) {
            const geo = mesh.geometry;
            const mat = mesh.material;
            const replacement = new THREE.InstancedMesh(geo, mat, Math.max(1, rects.length));
            replacement.name = mesh.name;
            replacement.renderOrder = mesh.renderOrder;
            replacement.frustumCulled = false;
            this.group.remove(mesh);
            this.group.add(replacement);
            if (mesh === this._squareFill) this._squareFill = replacement;
            if (mesh === this._reservationFill) this._reservationFill = replacement;
            // Geometry and material are shared with the replacement; only the
            // instance buffer belongs to the mesh being dropped.
            mesh.dispose?.();
            mesh = replacement;
        }

        const dummy = new THREE.Object3D();
        let count = 0;
        for (const rect of rects) {
            dummy.position.set(rect.x, y, rect.z);
            dummy.rotation.set(0, 0, 0);
            dummy.scale.set(rect.w, 1, rect.d);
            dummy.updateMatrix();
            mesh.setMatrixAt(count++, dummy.matrix);
        }
        mesh.count = count;
        mesh.instanceMatrix.needsUpdate = true;
    }

    _setLine(line, positions) {
        if (!positions.length) {
            line.visible = false;
            line.geometry.setPositions([]);
            line.geometry.computeBoundingSphere?.();
            return;
        }
        line.geometry.setPositions(positions);
        line.geometry.computeBoundingSphere?.();
        line.visible = true;
    }

    dispose() {
        this.group.removeFromParent();
        this._squareFillGeo.dispose();
        this._squareFillMat.dispose();
        this._reservationFillGeo.dispose();
        this._reservationFillMat.dispose();
        for (const entry of [this._parcelLine, this._limitLine, this._reservationLine]) {
            entry.line.geometry?.dispose?.();
            entry.material?.dispose?.();
        }
    }
}
