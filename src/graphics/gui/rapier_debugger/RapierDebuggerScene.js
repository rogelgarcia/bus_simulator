// src/graphics/gui/rapier_debugger/RapierDebuggerScene.js
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { makeCheckerTexture } from '../../assets3d/textures/CityTextures.js';
import { RAPIER_DEBUGGER_VEHICLE_CONFIG, RAPIER_DEBUGGER_WORLD_CONFIG } from '../../../app/physics/rapier_debugger/RapierDebuggerConstants.js';

export class RapierDebuggerScene {
    constructor(engine, {
        worldConfig = RAPIER_DEBUGGER_WORLD_CONFIG,
        vehicleConfig = RAPIER_DEBUGGER_VEHICLE_CONFIG
    } = {}) {
        this.engine = engine;
        this.scene = engine.scene;
        this.camera = engine.camera;
        this.worldConfig = { ...worldConfig };
        this.vehicleConfig = { ...vehicleConfig };

        this.controls = null;
        this.root = null;

        this._ground = null;
        this._chassisMesh = null;
        this._wheelMeshes = [];
        this._wheelTires = [];
        this._debugRender = null;
        this._debugColorBuffer = null;
        this._originAxes = null;
        this._comMarker = null;
        this._comLocal = new THREE.Vector3();
        this._comVisible = false;
        this._wheelIndexByLabel = {};

        this._tmpQuat = new THREE.Quaternion();
        this._tmpQuatB = new THREE.Quaternion();
        this._tmpQuatC = new THREE.Quaternion();
        this._tmpVecA = new THREE.Vector3();
        this._tmpVecB = new THREE.Vector3();
        this._tmpVecC = new THREE.Vector3();
        this._tmpVecD = new THREE.Vector3();
        this._tmpSize = new THREE.Vector2();
        this._prevChassisPos = new THREE.Vector3();
        this._cameraFollowReady = false;
        this._cameraFollowPending = new THREE.Vector3();
        this._cameraFollowVelocity = new THREE.Vector3();
        this._cameraFollowTau = 0.22;
        this._cameraFollowTauMin = 0.08;
        this._cameraFollowDeadZoneRatio = 0.08;
        this._cameraFollowCatchupRatio = 0.35;
        this._cameraFollowEngaged = false;
        this._viewOffsetX = -200;
        this._viewOffsetMinWidth = 720;
        this._viewOffsetState = { w: 0, h: 0, x: 0 };
        this._defaultCameraPos = new THREE.Vector3();
        this._defaultCameraTarget = new THREE.Vector3();
        this._arrowPanStep = 0.6;
        this._arrowPanFast = 2.4;
        this._keyboardBound = false;
        this._onKeyDown = (event) => {
            if (!this.controls) return;
            const key = event.key;
            if (key !== 'ArrowLeft' && key !== 'ArrowRight' && key !== 'ArrowUp' && key !== 'ArrowDown') return;
            const tag = event.target?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || event.target?.isContentEditable) return;
            event.preventDefault();
            const step = event.shiftKey ? this._arrowPanFast : this._arrowPanStep;
            let dx = 0;
            let dz = 0;
            if (key === 'ArrowLeft') dx = -step;
            if (key === 'ArrowRight') dx = step;
            if (key === 'ArrowUp') dz = step;
            if (key === 'ArrowDown') dz = -step;
            const forward = this._tmpVecA.set(0, 0, 0);
            this.camera.getWorldDirection(forward);
            forward.y = 0;
            if (forward.lengthSq() < 1e-8) return;
            forward.normalize();
            const up = this._tmpVecC.set(0, 1, 0);
            const right = this._tmpVecB.crossVectors(forward, up).normalize();
            const delta = this._tmpVecD.set(0, 0, 0)
                .addScaledVector(right, dx)
                .addScaledVector(forward, dz);
            this._panCamera(delta);
        };
    }

    enter() {
        if (this.root) return;
        this.root = new THREE.Group();
        this.scene.add(this.root);

        this.scene.background = new THREE.Color(0x0b0f1a);
        this.scene.fog = new THREE.Fog(0x0b0f1a, 40, 200);

        this._buildGround();
        this._buildLights();
        this._buildCamera();
        this._syncViewOffset();
        this._buildOriginAxes();
        this._buildChassis();
        this._buildWheels();
        this._buildDebugRender();
        this._applyInitialPose();
        this._bindKeyboard();
    }

    dispose() {
        this.controls?.dispose?.();
        this.controls = null;

        if (this.root) {
            this.scene.remove(this.root);
            this._disposeMeshHierarchy(this.root);
            this.root = null;
        }

        this._ground = null;
        this._chassisMesh = null;
        this._wheelMeshes.length = 0;
        this._wheelTires.length = 0;
        this._debugRender = null;
        this._debugColorBuffer = null;
        this._wheelIndexByLabel = {};
        this._originAxes = null;
        if (this._comMarker?.parent) {
            this._comMarker.parent.remove(this._comMarker);
        }
        this._comMarker = null;
        this._comVisible = false;
        if (this.camera?.clearViewOffset) {
            this.camera.clearViewOffset();
        }
        this._unbindKeyboard();
        this._cameraFollowReady = false;
        this._cameraFollowPending.set(0, 0, 0);
        this._cameraFollowVelocity.set(0, 0, 0);
        this._cameraFollowEngaged = false;
    }

    update(dt) {
        this._syncViewOffset();
        if (this.controls && this._cameraFollowReady) {
            const clampedDt = Math.min(Math.max(dt ?? 0, 0), 0.05);
            const lagLen = this._cameraFollowPending.length();
            const followDistance = this.camera.position.distanceTo(this.controls.target);
            const deadZone = followDistance * this._cameraFollowDeadZoneRatio;

            if (!this._cameraFollowEngaged && lagLen > deadZone) {
                this._cameraFollowEngaged = true;
            }

            if (this._cameraFollowEngaged) {
                if (lagLen <= deadZone) {
                    this._cameraFollowEngaged = false;
                    this._cameraFollowVelocity.set(0, 0, 0);
                } else {
                    const catchupSpan = Math.max(0.01, followDistance * this._cameraFollowCatchupRatio);
                    const t = Math.min(1, Math.max(0, (lagLen - deadZone) / catchupSpan));
                    const eased = t * t * (3 - 2 * t);
                    const tau = this._cameraFollowTau - (this._cameraFollowTau - this._cameraFollowTauMin) * eased;
                    const smoothed = this._smoothDampVec3(
                        this._cameraFollowPending,
                        this._tmpVecD.set(0, 0, 0),
                        this._cameraFollowVelocity,
                        tau,
                        clampedDt
                    );
                    const step = this._tmpVecB.copy(this._cameraFollowPending).sub(smoothed);
                    this.camera.position.add(step);
                    this.controls.target.add(step);
                    this._cameraFollowPending.copy(smoothed);

                    if (this._cameraFollowPending.lengthSq() < 1e-10) {
                        this._cameraFollowPending.set(0, 0, 0);
                        this._cameraFollowVelocity.set(0, 0, 0);
                        this._cameraFollowEngaged = false;
                    }
                }
            }
        }
        this.controls?.update?.();
    }

    resetCamera() {
        if (!this.controls || !this.camera) return;
        this.camera.position.copy(this._defaultCameraPos);
        this.controls.target.copy(this._defaultCameraTarget);
        this.controls.update();
        this._cameraFollowPending.set(0, 0, 0);
        this._cameraFollowVelocity.set(0, 0, 0);
        this._cameraFollowEngaged = false;
        this._cameraFollowReady = false;
    }

    _panCamera(delta) {
        if (!this.controls || !this.camera) return;
        this.camera.position.add(delta);
        this.controls.target.add(delta);
        this.controls.update();
        this._cameraFollowPending.set(0, 0, 0);
        this._cameraFollowVelocity.set(0, 0, 0);
        this._cameraFollowEngaged = false;
        this._cameraFollowReady = false;
    }

    _syncViewOffset() {
        const renderer = this.engine?.renderer;
        if (!renderer || !this.camera) return;
        const size = renderer.getSize(this._tmpSize);
        const w = Math.round(size.x);
        const h = Math.round(size.y);
        const maxOffset = Math.round(w * 0.25);
        const clamped = Math.max(-maxOffset, Math.min(maxOffset, this._viewOffsetX));
        const offset = w >= this._viewOffsetMinWidth ? clamped : 0;

        if (this._viewOffsetState.w === w && this._viewOffsetState.h === h && this._viewOffsetState.x === offset) {
            return;
        }
        this._viewOffsetState = { w, h, x: offset };

        if (offset !== 0 && typeof this.camera.setViewOffset === 'function') {
            this.camera.setViewOffset(w, h, offset, 0, w, h);
        } else if (typeof this.camera.clearViewOffset === 'function') {
            this.camera.clearViewOffset();
        }
    }

    _bindKeyboard() {
        if (this._keyboardBound) return;
        window.addEventListener('keydown', this._onKeyDown, { passive: false });
        this._keyboardBound = true;
    }

    _unbindKeyboard() {
        if (!this._keyboardBound) return;
        window.removeEventListener('keydown', this._onKeyDown);
        this._keyboardBound = false;
    }

    setHighlightedWheel(target) {
        let targetIndex = null;
        if (typeof target === 'number' && Number.isFinite(target)) {
            targetIndex = target;
        } else if (typeof target === 'string') {
            const mapped = this._wheelIndexByLabel?.[target];
            if (Number.isFinite(mapped)) targetIndex = mapped;
        }
        for (let i = 0; i < this._wheelTires.length; i++) {
            const tire = this._wheelTires[i];
            const mat = tire?.material;
            if (!mat) continue;
            if (targetIndex !== null && i === targetIndex) {
                mat.color.setHex(0x4cff7a);
                mat.emissive?.setHex?.(0x102810);
            } else {
                mat.color.setHex(0x1b1f26);
                mat.emissive?.setHex?.(0x000000);
            }
        }
    }

    getCameraPosition() {
        if (!this.camera) return null;
        return { x: this.camera.position.x, y: this.camera.position.y, z: this.camera.position.z };
    }

    sync(snapshot, debugRenderBuffers) {
        if (!snapshot?.body) return;
        const pos = snapshot.body.position;
        const rot = snapshot.body.rotation;
        if (!pos || !rot || !this._chassisMesh) return;

        this._chassisMesh.position.set(pos.x, pos.y, pos.z);
        this._chassisMesh.quaternion.set(rot.x, rot.y, rot.z, rot.w);
        this._syncComMarker();

        if (this.controls) {
            if (!this._cameraFollowReady) {
                this._prevChassisPos.set(pos.x, pos.y, pos.z);
                this._cameraFollowReady = true;
            } else {
                const delta = this._tmpVecD.set(pos.x, pos.y, pos.z).sub(this._prevChassisPos);
                if (Number.isFinite(delta.x) && Number.isFinite(delta.y) && Number.isFinite(delta.z)) {
                    this._cameraFollowPending.add(delta);
                }
                this._prevChassisPos.set(pos.x, pos.y, pos.z);
            }
        }

        this._syncWheels(snapshot);
        this._syncDebugRender(debugRenderBuffers);
    }

    setComPreview(visible, comLocal) {
        this._comVisible = !!visible;
        if (comLocal && Number.isFinite(comLocal.x) && Number.isFinite(comLocal.y) && Number.isFinite(comLocal.z)) {
            this._comLocal.set(comLocal.x, comLocal.y, comLocal.z);
        }
        if (this._comVisible) {
            if (!this._comMarker) {
                const geo = new THREE.SphereGeometry(0.12, 16, 16);
                const mat = new THREE.MeshStandardMaterial({
                    color: 0x2b2f36,
                    roughness: 0.65,
                    metalness: 0.15,
                    emissive: 0x111317,
                    emissiveIntensity: 0.35,
                    depthTest: false,
                    depthWrite: false
                });
                const marker = new THREE.Mesh(geo, mat);
                marker.renderOrder = 4002;
                this._comMarker = marker;
            }
            if (this._comMarker && !this._comMarker.parent) {
                this.root?.add(this._comMarker);
            }
            this._syncComMarker();
        } else if (this._comMarker) {
            this._comMarker.visible = false;
        }
    }

    _syncComMarker() {
        if (!this._comVisible || !this._comMarker || !this._chassisMesh) return;
        const worldPos = this._tmpVecA.copy(this._comLocal);
        worldPos.applyQuaternion(this._chassisMesh.quaternion);
        worldPos.add(this._chassisMesh.position);
        this._comMarker.position.copy(worldPos);
        this._comMarker.visible = true;
    }

    _buildGround() {
        const groundTex = makeCheckerTexture({ size: 256, squares: 8, colorA: '#ffffff', colorB: '#c02929' });
        groundTex.repeat.set(10, 10);

        const groundMat = new THREE.MeshStandardMaterial({
            map: groundTex,
            roughness: 0.95,
            metalness: 0.02
        });

        const groundGeo = new THREE.PlaneGeometry(this.worldConfig.groundSize, this.worldConfig.groundSize);
        const ground = new THREE.Mesh(groundGeo, groundMat);
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        this.root.add(ground);
        this._ground = ground;
    }

    _buildLights() {
        const amb = new THREE.AmbientLight(0xffffff, 0.45);
        this.root.add(amb);

        const sun = new THREE.DirectionalLight(0xffffff, 1.1);
        sun.position.set(18, 24, 12);
        sun.castShadow = true;
        sun.shadow.mapSize.set(2048, 2048);
        sun.shadow.bias = -0.0002;
        this.root.add(sun);
    }

    _buildCamera() {
        this.camera.position.set(8, 6, 12);
        this.camera.lookAt(0, 1, 0);

        this.controls = new OrbitControls(this.camera, this.engine.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.minDistance = 4;
        this.controls.maxDistance = 50;
        this.controls.maxPolarAngle = Math.PI * 0.48;
        this.controls.target.set(0, 1, 0);
        this.controls.update();
        this._defaultCameraPos.copy(this.camera.position);
        this._defaultCameraTarget.copy(this.controls.target);
    }

    _buildChassis() {
        const mesh = this._createChassisMesh();
        this.root.add(mesh);
        this._chassisMesh = mesh;
    }

    _buildWheels() {
        this._createWheelMeshes();
    }

    _applyInitialPose() {
        if (!this._chassisMesh) return;

        const cfg = this.vehicleConfig;
        const halfW = cfg.width * 0.5;
        const halfH = cfg.height * 0.5;
        const halfL = cfg.length * 0.5;

        const wheelY = -halfH - (cfg.groundClearance ?? 0) + cfg.wheelRadius;
        const wheelX = halfW - (cfg.wheelWidth * 0.5) + (cfg.wheelSideInset ?? 0);
        const wheelZ = halfL * cfg.wheelbaseRatio;
        const startY = Number.isFinite(cfg.spawnHeight) ? cfg.spawnHeight : 0;

        this._chassisMesh.position.set(0, startY, 0);
        this._chassisMesh.quaternion.identity();
        this._prevChassisPos.set(0, startY, 0);
        this._cameraFollowReady = false;
        this._cameraFollowPending.set(0, 0, 0);
        this._cameraFollowVelocity.set(0, 0, 0);
        this._cameraFollowEngaged = false;

        const wheelPositions = [
            { x: -wheelX, y: wheelY, z: wheelZ },
            { x: wheelX, y: wheelY, z: wheelZ },
            { x: -wheelX, y: wheelY, z: -wheelZ },
            { x: wheelX, y: wheelY, z: -wheelZ }
        ];

        for (let i = 0; i < this._wheelMeshes.length; i++) {
            const wheel = this._wheelMeshes[i];
            const wp = wheelPositions[i];
            if (!wheel || !wp) continue;
            wheel.position.set(wp.x, startY + wp.y, wp.z);
            wheel.quaternion.identity();
        }
    }

    _buildDebugRender() {
        const debugGeo = new THREE.BufferGeometry();
        const debugMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.95 });
        const debugLines = new THREE.LineSegments(debugGeo, debugMat);
        debugLines.frustumCulled = false;
        debugLines.renderOrder = 1000;
        this.root.add(debugLines);
        this._debugRender = debugLines;
    }

    _buildOriginAxes() {
        const origin = new THREE.Vector3(0, 0, 0);
        const length = 2.4;
        const headLength = 0.45;
        const headWidth = 0.18;

        const axesGroup = new THREE.Group();
        const xArrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), origin, length, 0xff2d2d, headLength, headWidth);
        const yArrow = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), origin, length, 0x2fe75c, headLength, headWidth);
        const zArrow = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), origin, length, 0x2d7dff, headLength, headWidth);
        axesGroup.add(xArrow, yArrow, zArrow);
        axesGroup.renderOrder = 800;
        this.root.add(axesGroup);
        this._originAxes = axesGroup;
    }

    _createChassisMesh() {
        const { width, height, length } = this.vehicleConfig;
        const frontLen = length * 0.1;
        const rearLen = length * 0.1;
        const midLen = Math.max(0.01, length - frontLen - rearLen);

        const frontMat = new THREE.MeshStandardMaterial({ color: 0xf3f5f9 });
        const midMat = new THREE.MeshStandardMaterial({ color: 0x6f767f });
        const rearMat = new THREE.MeshStandardMaterial({ color: 0xb82424 });

        const frontGeo = new THREE.BoxGeometry(width, height, frontLen);
        const midGeo = new THREE.BoxGeometry(width, height, midLen);
        const rearGeo = new THREE.BoxGeometry(width, height, rearLen);

        const frontMesh = new THREE.Mesh(frontGeo, frontMat);
        frontMesh.position.z = length * 0.5 - frontLen * 0.5;

        const midMesh = new THREE.Mesh(midGeo, midMat);
        midMesh.position.z = 0;

        const rearMesh = new THREE.Mesh(rearGeo, rearMat);
        rearMesh.position.z = -length * 0.5 + rearLen * 0.5;

        const group = new THREE.Group();
        group.add(frontMesh, midMesh, rearMesh);

        for (const child of group.children) {
            child.castShadow = true;
            child.receiveShadow = true;
            this._addOutline(child);
        }

        return group;
    }

    _addOutline(mesh) {
        if (!mesh?.geometry) return;
        const geo = new THREE.EdgesGeometry(mesh.geometry, 25);
        const mat = new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.85, depthTest: false });
        const lines = new THREE.LineSegments(geo, mat);
        lines.renderOrder = 2000;
        lines.frustumCulled = false;
        mesh.add(lines);
    }

    _createWheelMeshes() {
        const wheelRadius = this.vehicleConfig.wheelRadius;
        const wheelWidth = this.vehicleConfig.wheelWidth;

        const tireGeo = new THREE.CylinderGeometry(wheelRadius, wheelRadius, wheelWidth, 28, 1, false);
        const tireMatBase = new THREE.MeshStandardMaterial({ color: 0x1b1f26, roughness: 0.9, metalness: 0.05 });
        const lineGeo = new THREE.PlaneGeometry(wheelRadius * 1.3, wheelRadius * 0.12);
        const lineMatBase = new THREE.MeshStandardMaterial({
            color: 0xf5f7fb,
            roughness: 0.6,
            metalness: 0.0,
            side: THREE.DoubleSide
        });

        tireMatBase.polygonOffset = true;
        tireMatBase.polygonOffsetFactor = -4;
        tireMatBase.polygonOffsetUnits = -4;
        tireMatBase.depthTest = false;
        tireMatBase.depthWrite = false;
        lineMatBase.polygonOffset = true;
        lineMatBase.polygonOffsetFactor = -4;
        lineMatBase.polygonOffsetUnits = -4;
        lineMatBase.depthTest = false;
        lineMatBase.depthWrite = false;

        for (let i = 0; i < 4; i++) {
            const wheel = new THREE.Group();
            wheel.renderOrder = 5000;
            const tire = new THREE.Mesh(tireGeo, tireMatBase.clone());
            tire.renderOrder = 5000;
            tire.rotation.z = Math.PI / 2;
            tire.castShadow = true;
            tire.receiveShadow = true;
            wheel.add(tire);
            this._wheelTires.push(tire);

            const sideSign = (i % 2 === 0) ? -1 : 1;
            const line = new THREE.Mesh(lineGeo, lineMatBase);
            line.renderOrder = 5001;
            line.position.x = sideSign * (wheelWidth * 0.5 + 0.01);
            line.rotation.y = sideSign < 0 ? -Math.PI / 2 : Math.PI / 2;
            line.castShadow = false;
            line.receiveShadow = false;
            wheel.add(line);

            this.root.add(wheel);
            this._wheelMeshes.push(wheel);
        }
    }

    _syncWheels(snapshot) {
        const wheelStates = snapshot.wheelStates ?? [];
        if (!wheelStates.length || !this._wheelMeshes.length) return;
        const labelMap = {};

        const rot = snapshot.body.rotation;
        const chassisQuat = this._tmpQuat.set(rot.x, rot.y, rot.z, rot.w);
        const steerAxis = this._tmpVecB.set(0, 1, 0);
        const spinAxis = this._tmpVecC.set(1, 0, 0);
        const wheelRadius = this.vehicleConfig.wheelRadius;
        const zFightOffset = 0.01;

        for (let i = 0; i < this._wheelMeshes.length; i++) {
            const wheel = this._wheelMeshes[i];
            const state = wheelStates[i];
            if (!wheel || !state) continue;
            const label = state.label ?? `W${i}`;
            labelMap[label] = i;
            wheel.userData.label = label;

            const hardPoint = state.hardPoint;
            const suspLen = state.suspensionLength;
            const inContact = !!state.inContact;
            const contactPoint = state.contactPoint;
            const contactNormal = state.contactNormal;
            const dirLocal = state.directionCs ?? { x: 0, y: -1, z: 0 };
            const steerAngle = state.steering ?? 0;
            const spinAngle = state.rotation ?? 0;

            if (inContact && contactPoint && contactNormal) {
                wheel.position.set(
                    contactPoint.x + contactNormal.x * wheelRadius,
                    contactPoint.y + contactNormal.y * wheelRadius,
                    contactPoint.z + contactNormal.z * wheelRadius
                );
            } else if (hardPoint && Number.isFinite(suspLen)) {
                const dirWorld = this._tmpVecA.set(dirLocal.x, dirLocal.y, dirLocal.z)
                    .applyQuaternion(chassisQuat)
                    .normalize();
                wheel.position.set(
                    hardPoint.x + dirWorld.x * suspLen,
                    hardPoint.y + dirWorld.y * suspLen,
                    hardPoint.z + dirWorld.z * suspLen
                );
            } else if (hardPoint) {
                wheel.position.set(hardPoint.x, hardPoint.y, hardPoint.z);
            }

            const sideSign = label.includes('L') ? -1 : 1;
            wheel.position.addScaledVector(
                this._tmpVecA.set(sideSign, 0, 0).applyQuaternion(chassisQuat),
                zFightOffset
            );

            const steerQuat = this._tmpQuatB.setFromAxisAngle(steerAxis, steerAngle);
            const spinQuat = this._tmpQuatC.setFromAxisAngle(spinAxis, spinAngle);
            wheel.quaternion.copy(chassisQuat).multiply(steerQuat).multiply(spinQuat);
        }
        this._wheelIndexByLabel = labelMap;
    }

    _syncDebugRender(buffers) {
        if (!this._debugRender || !buffers?.vertices || !buffers?.colors) return;

        const vertices = buffers.vertices;
        const colors = buffers.colors;
        const geometry = this._debugRender.geometry;

        const vertexCount = Math.floor(vertices.length / 3);
        const colorCount = Math.floor(colors.length / 4);
        if (vertexCount <= 0 || colorCount <= 0) return;

        const positionAttr = geometry.getAttribute('position');
        if (!positionAttr || positionAttr.array.length !== vertices.length) {
            geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertices.length), 3));
        }

        const posArray = geometry.getAttribute('position').array;
        posArray.set(vertices);
        geometry.getAttribute('position').needsUpdate = true;

        const expectedColorLen = vertexCount * 3;
        if (!this._debugColorBuffer || this._debugColorBuffer.length !== expectedColorLen) {
            this._debugColorBuffer = new Float32Array(expectedColorLen);
        }

        const usableVertexCount = Math.min(vertexCount, colorCount);
        for (let i = 0; i < usableVertexCount; i++) {
            const c = i * 4;
            const o = i * 3;
            this._debugColorBuffer[o] = colors[c];
            this._debugColorBuffer[o + 1] = colors[c + 1];
            this._debugColorBuffer[o + 2] = colors[c + 2];
        }

        const colorAttr = geometry.getAttribute('color');
        if (!colorAttr || colorAttr.array.length !== expectedColorLen) {
            geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(expectedColorLen), 3));
        }
        geometry.getAttribute('color').array.set(this._debugColorBuffer);
        geometry.getAttribute('color').needsUpdate = true;

        geometry.setDrawRange(0, usableVertexCount);
    }

    _disposeMeshHierarchy(root) {
        root.traverse((child) => {
            if (!child.isMesh && !child.isLine && !child.isLineSegments) return;
            child.geometry?.dispose?.();
            if (Array.isArray(child.material)) {
                child.material.forEach((mat) => mat?.dispose?.());
            } else {
                child.material?.dispose?.();
            }
        });
    }

    _smoothDampVec3(current, target, currentVelocity, smoothTime, deltaTime) {
        const tau = Math.max(0.0001, smoothTime ?? 0.0001);
        const omega = 2 / tau;
        const x = omega * deltaTime;
        const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);

        const change = this._tmpVecA.copy(current).sub(target);
        const temp = this._tmpVecB.copy(currentVelocity).addScaledVector(change, omega).multiplyScalar(deltaTime);

        currentVelocity.addScaledVector(temp, -omega).multiplyScalar(exp);

        return this._tmpVecC.copy(target).add(this._tmpVecA.copy(change).add(temp).multiplyScalar(exp));
    }
}
