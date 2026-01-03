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

        this._tmpQuat = new THREE.Quaternion();
        this._tmpQuatB = new THREE.Quaternion();
        this._tmpQuatC = new THREE.Quaternion();
        this._tmpVecA = new THREE.Vector3();
        this._tmpVecB = new THREE.Vector3();
        this._tmpVecC = new THREE.Vector3();
        this._tmpVecD = new THREE.Vector3();
        this._prevChassisPos = new THREE.Vector3();
        this._cameraFollowReady = false;
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
        this._buildChassis();
        this._buildWheels();
        this._buildDebugRender();
        this._applyInitialPose();
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
        this._cameraFollowReady = false;
    }

    update(dt) {
        this.controls?.update?.();
    }

    setHighlightedWheel(index) {
        for (let i = 0; i < this._wheelTires.length; i++) {
            const tire = this._wheelTires[i];
            const mat = tire?.material;
            if (!mat) continue;
            if (i === index) {
                mat.color.setHex(0x4cff7a);
                mat.emissive?.setHex?.(0x102810);
            } else {
                mat.color.setHex(0x1b1f26);
                mat.emissive?.setHex?.(0x000000);
            }
        }
    }

    sync(snapshot, debugRenderBuffers) {
        if (!snapshot?.body) return;
        const pos = snapshot.body.position;
        const rot = snapshot.body.rotation;
        if (!pos || !rot || !this._chassisMesh) return;

        this._chassisMesh.position.set(pos.x, pos.y, pos.z);
        this._chassisMesh.quaternion.set(rot.x, rot.y, rot.z, rot.w);

        if (this.controls) {
            if (!this._cameraFollowReady) {
                this._prevChassisPos.set(pos.x, pos.y, pos.z);
                this._cameraFollowReady = true;
            } else {
                const delta = this._tmpVecD.set(pos.x, pos.y, pos.z).sub(this._prevChassisPos);
                if (Number.isFinite(delta.x) && Number.isFinite(delta.y) && Number.isFinite(delta.z)) {
                    this.camera.position.add(delta);
                    this.controls.target.add(delta);
                }
                this._prevChassisPos.set(pos.x, pos.y, pos.z);
            }
        }

        this._syncWheels(snapshot);
        this._syncDebugRender(debugRenderBuffers);
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
        this.controls.dampingFactor = 0.08;
        this.controls.minDistance = 4;
        this.controls.maxDistance = 50;
        this.controls.maxPolarAngle = Math.PI * 0.48;
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
        const wheelX = halfW - (cfg.wheelWidth * 0.5) - (cfg.wheelSideInset ?? 0);
        const wheelZ = halfL * cfg.wheelbaseRatio;
        const startY = Number.isFinite(cfg.spawnHeight) ? cfg.spawnHeight : 0;

        this._chassisMesh.position.set(0, startY, 0);
        this._chassisMesh.quaternion.identity();
        this._prevChassisPos.set(0, startY, 0);
        this._cameraFollowReady = false;

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
        const lineMatBase = new THREE.MeshStandardMaterial({ color: 0xf5f7fb, roughness: 0.6, metalness: 0.0 });

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

            const line = new THREE.Mesh(lineGeo, lineMatBase);
            line.renderOrder = 5001;
            line.position.x = wheelWidth * 0.5 + 0.01;
            line.rotation.y = -Math.PI / 2;
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

            const sideSign = (i % 2 === 0) ? -1 : 1;
            wheel.position.addScaledVector(
                this._tmpVecA.set(sideSign, 0, 0).applyQuaternion(chassisQuat),
                zFightOffset
            );

            const steerQuat = this._tmpQuatB.setFromAxisAngle(steerAxis, steerAngle);
            const spinQuat = this._tmpQuatC.setFromAxisAngle(spinAxis, spinAngle);
            wheel.quaternion.copy(chassisQuat).multiply(steerQuat).multiply(spinQuat);
        }
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
}
