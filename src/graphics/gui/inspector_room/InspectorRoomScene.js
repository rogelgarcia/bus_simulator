// src/graphics/gui/inspector_room/InspectorRoomScene.js
// Shared inspection room environment with grid, plane, lighting, and camera controls.
import * as THREE from 'three';
import { createToolCameraController } from '../../engine3d/camera/ToolCameraPrefab.js';
import { applyAtmosphereToSkyDome, createGradientSkyDome, shouldShowSkyDome } from '../../assets3d/generators/SkyGenerator.js';

function clamp(value, min, max) {
    const num = Number(value);
    if (!Number.isFinite(num)) return min;
    return Math.max(min, Math.min(max, num));
}

function easeInOutCubic(t) {
    const x = clamp(t, 0, 1);
    return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

function ensureVector3(value, fallback) {
    const v = value && typeof value === 'object' ? value : null;
    if (v && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z)) {
        return new THREE.Vector3(v.x, v.y, v.z);
    }
    return fallback.clone();
}

export class InspectorRoomScene {
    constructor(engine) {
        this.engine = engine;
        this.scene = engine.scene;
        this.camera = engine.camera;
        this.canvas = engine.canvas;

        this.root = null;
        this.content = null;

        this.controls = null;
        this._uiRoot = null;

        this.sky = null;
        this._prevSceneBackground = null;
        this._backgroundColor = new THREE.Color(0x8a8a8a);
        this._prevRendererClear = null;
        this.hemi = null;
        this.sun = null;

        this.plane = null;
        this._planeGeo = null;
        this._planeMat = null;

        this.grid = null;
        this.axes = null;
        this._axisMaterials = [];
        this._axisEndpoints = null;

        this.lightMarker = null;

        this.measurements = null;
        this._measurementGeo = null;
        this._measurementMat = null;

        this._gridVisible = true;
        this._planeVisible = true;
        this._axisLinesVisible = true;
        this._axisAlwaysVisible = false;
        this._lightMarkerVisible = false;
        this._lightEnabled = true;
        this._lightIntensity = 1.2;
        this._lightColorHex = 0xffffff;

        this._config = {
            planeSize: 20,
            planeY: 0,
            planeColor: 0x5b5f66,
            planeRoughness: 1.0,
            planeMetalness: 0.0,
            gridSize: 20,
            gridDivisions: 40
        };

        this._focus = {
            center: new THREE.Vector3(0, 0, 0),
            radius: 2
        };

        this._cameraTween = null;
    }

    enter() {
        if (this.root) return;

        if (!this._prevSceneBackground) this._prevSceneBackground = this.scene.background ?? null;
        this.scene.background = this._backgroundColor;

        const renderer = this.engine?.renderer ?? null;
        if (renderer && !this._prevRendererClear) {
            const prevColor = new THREE.Color();
            renderer.getClearColor(prevColor);
            this._prevRendererClear = { color: prevColor, alpha: renderer.getClearAlpha?.() ?? 0 };
        }
        renderer?.setClearColor?.(this._backgroundColor, 1);

        this.root = new THREE.Group();
        this.root.name = 'inspector_room_root';
        this.scene.add(this.root);

        this.content = new THREE.Group();
        this.content.name = 'inspector_room_content';
        this.root.add(this.content);

        const lighting = this.engine?.lightingSettings ?? {};
        const hemiIntensity = Number.isFinite(lighting.hemiIntensity) ? lighting.hemiIntensity : 0.85;
        const sunIntensity = Number.isFinite(lighting.sunIntensity) ? lighting.sunIntensity : this._lightIntensity;
        this._lightIntensity = sunIntensity;

        this.hemi = new THREE.HemisphereLight(0xe8f0ff, 0x0b0f14, hemiIntensity);
        this.root.add(this.hemi);

        this.sun = new THREE.DirectionalLight(0xffffff, sunIntensity);
        this.sun.position.set(4, 7, 4);
        this.sun.color.setHex(this._lightColorHex);
        this.sun.visible = this._lightEnabled;
        this.sun.castShadow = true;
        this.sun.shadow.mapSize.width = 1024;
        this.sun.shadow.mapSize.height = 1024;
        this.sun.shadow.camera.near = 0.1;
        this.sun.shadow.camera.far = 80;
        this.root.add(this.sun);

        this.sky = createGradientSkyDome({
            atmosphere: this.engine?.atmosphereSettings ?? null,
            sunDir: this.sun.position.clone().normalize(),
            sunIntensity: 0.28
        });
        this.root.add(this.sky);
        this._applyAtmosphere();
        this._syncSkyVisibility();

        this._syncPlane();
        this._syncGrid();
        this._syncAxes();
        this._syncLightMarker();
        this._applyAxisAlwaysVisible();

        const dist = this._getFitDistance();
        const center = this._focus.center.clone();
        const pos = center.clone().add(new THREE.Vector3(1, 0.75, 1).normalize().multiplyScalar(dist));

        this.controls = createToolCameraController(this.camera, this.canvas, {
            uiRoot: this._uiRoot,
            enabled: true,
            enableDamping: true,
            dampingFactor: 0.08,
            rotateSpeed: 0.9,
            panSpeed: 0.9,
            zoomSpeed: 1.0,
            minDistance: Math.max(0.15, this._focus.radius * 0.35),
            maxDistance: Math.max(5, this._focus.radius * 80),
            minPolarAngle: 0.001,
            maxPolarAngle: Math.PI - 0.001,
            getFocusTarget: () => ({ center: this._focus.center, radius: this._focus.radius }),
            initialPose: { position: pos, target: center }
        });
    }

    dispose() {
        this.controls?.dispose?.();
        this.controls = null;
        this._uiRoot = null;

        if (this.lightMarker) {
            this.root?.remove?.(this.lightMarker);
            this.lightMarker.geometry?.dispose?.();
            this.lightMarker.material?.dispose?.();
            this.lightMarker = null;
        }

        if (this.axes) {
            this.root?.remove?.(this.axes);
            this.axes.traverse?.((obj) => {
                obj.geometry?.dispose?.();
                if (Array.isArray(obj.material)) {
                    for (const m of obj.material) m?.dispose?.();
                } else {
                    obj.material?.dispose?.();
                }
            });
            this.axes = null;
        }
        this._axisMaterials = [];
        this._axisEndpoints = null;

        if (this.grid) {
            this.root?.remove?.(this.grid);
            this.grid.geometry?.dispose?.();
            if (Array.isArray(this.grid.material)) {
                for (const m of this.grid.material) m?.dispose?.();
            } else {
                this.grid.material?.dispose?.();
            }
            this.grid = null;
        }

        if (this.plane) {
            this.root?.remove?.(this.plane);
            this._planeGeo?.dispose?.();
            this._planeMat?.dispose?.();
            this.plane = null;
            this._planeGeo = null;
            this._planeMat = null;
        }

        if (this.measurements) {
            this.root?.remove?.(this.measurements);
            this._measurementGeo?.dispose?.();
            this._measurementMat?.dispose?.();
            this.measurements = null;
            this._measurementGeo = null;
            this._measurementMat = null;
        }

        if (this.hemi) {
            this.root?.remove?.(this.hemi);
            this.hemi = null;
        }

        if (this.sky) {
            this.root?.remove?.(this.sky);
            this.sky.geometry?.dispose?.();
            this.sky.material?.dispose?.();
            this.sky = null;
        }

        if (this.sun) {
            this.root?.remove?.(this.sun);
            this.sun = null;
        }

        if (this.content) {
            this.root?.remove?.(this.content);
            this.content = null;
        }

        if (this.root) {
            this.scene.remove(this.root);
            this.root = null;
        }

        if (this.scene) this.scene.background = this._prevSceneBackground ?? null;
        this._prevSceneBackground = null;

        const renderer = this.engine?.renderer ?? null;
        const clear = this._prevRendererClear ?? null;
        if (renderer && clear?.color) renderer.setClearColor(clear.color, clear.alpha ?? 0);
        this._prevRendererClear = null;

        this._cameraTween = null;
    }

    getAxisEndpoints() {
        return this._axisEndpoints;
    }

    setMeasurementOverlay({ enabled = false, mode = 'xyz', bounds = null } = {}) {
        const on = !!enabled;
        if (!on) {
            if (this.measurements) this.measurements.visible = false;
            return;
        }

        const b = bounds && typeof bounds === 'object' ? bounds : null;
        const min = b?.min && typeof b.min === 'object' ? b.min : null;
        const max = b?.max && typeof b.max === 'object' ? b.max : null;
        const minX = Number(min?.x);
        const minY = Number(min?.y);
        const minZ = Number(min?.z);
        const maxX = Number(max?.x);
        const maxY = Number(max?.y);
        const maxZ = Number(max?.z);
        if (!(Number.isFinite(minX) && Number.isFinite(minY) && Number.isFinite(minZ) && Number.isFinite(maxX) && Number.isFinite(maxY) && Number.isFinite(maxZ))) {
            if (this.measurements) this.measurements.visible = false;
            return;
        }

        if (!this.measurements && this.root) {
            this._measurementGeo = new THREE.BufferGeometry();
            this._measurementMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthTest: false });
            this.measurements = new THREE.LineSegments(this._measurementGeo, this._measurementMat);
            this.measurements.name = 'inspector_room_measurements';
            this.measurements.renderOrder = 999;
            this.measurements.visible = false;
            this.root.add(this.measurements);
        }

        if (!this.measurements || !this._measurementGeo) return;

        const nextMode = mode === 'xz' ? 'xz' : 'xyz';
        const pts = [
            minX, maxY, maxZ,
            maxX, maxY, maxZ,
            maxX, maxY, minZ,
            maxX, maxY, maxZ
        ];
        if (nextMode === 'xyz') {
            pts.push(
                maxX, minY, maxZ,
                maxX, maxY, maxZ
            );
        }

        const attr = this._measurementGeo.attributes?.position ?? null;
        if (!attr || !attr.array || attr.array.length !== pts.length) {
            this._measurementGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts), 3));
        } else {
            attr.array.set(pts);
            attr.needsUpdate = true;
        }
        this._measurementGeo.computeBoundingSphere();
        this.measurements.visible = true;
    }

    update(dt) {
        if (this.root && this.scene && this.scene.background !== this._backgroundColor) {
            this.scene.background = this._backgroundColor;
        }
        this._applyAtmosphere();
        this._syncSkyVisibility();
        if (this.sky && this.camera) this.sky.position.copy(this.camera.position);
        if (this._cameraTween) this._tickCameraTween(dt);
        this.controls?.update?.(dt);
    }

    _applyAtmosphere() {
        const atmo = this.engine?.atmosphereSettings ?? null;
        if (!atmo) return;

        applyAtmosphereToSkyDome(this.sky, atmo, { sunDir: this.sun?.position ?? null });
    }

    _syncSkyVisibility() {
        const wantsIblBackground = !!this.engine?.lightingSettings?.ibl?.setBackground;
        const showSky = shouldShowSkyDome({
            skyIblBackgroundMode: this.engine?.atmosphereSettings?.sky?.iblBackgroundMode ?? 'ibl',
            lightingIblSetBackground: wantsIblBackground,
            sceneBackground: this.scene?.background ?? null
        });
        if (this.sky) this.sky.visible = showSky;
    }

    setUiRoot(uiRoot) {
        this._uiRoot = uiRoot ?? null;
        this.controls?.setUiRoot?.(this._uiRoot);
    }

    getContentRoot() {
        return this.content;
    }

    configureRoom({
        planeSize,
        planeY,
        planeColor,
        planeRoughness,
        planeMetalness,
        gridSize,
        gridDivisions
    } = {}) {
        const next = {
            planeSize: Number.isFinite(Number(planeSize)) ? Math.max(0.5, Number(planeSize)) : this._config.planeSize,
            planeY: Number.isFinite(Number(planeY)) ? Number(planeY) : this._config.planeY,
            planeColor: Number.isFinite(Number(planeColor)) ? Number(planeColor) : this._config.planeColor,
            planeRoughness: Number.isFinite(Number(planeRoughness)) ? clamp(Number(planeRoughness), 0, 1) : this._config.planeRoughness,
            planeMetalness: Number.isFinite(Number(planeMetalness)) ? clamp(Number(planeMetalness), 0, 1) : this._config.planeMetalness,
            gridSize: Number.isFinite(Number(gridSize)) ? Math.max(0.5, Number(gridSize)) : this._config.gridSize,
            gridDivisions: Number.isFinite(Number(gridDivisions)) ? Math.max(1, Math.round(Number(gridDivisions))) : this._config.gridDivisions
        };

        const changed = next.planeSize !== this._config.planeSize
            || next.planeY !== this._config.planeY
            || next.planeColor !== this._config.planeColor
            || next.planeRoughness !== this._config.planeRoughness
            || next.planeMetalness !== this._config.planeMetalness
            || next.gridSize !== this._config.gridSize
            || next.gridDivisions !== this._config.gridDivisions;

        this._config = next;
        if (!changed || !this.root) {
            this._syncPlaneMaterial();
            return;
        }

        this._syncPlane({ rebuild: true });
        this._syncGrid({ rebuild: true });
        this._syncAxes({ rebuild: true });
        this._applyAxisAlwaysVisible();
        this._syncLightMarker();
    }

    setGridVisible(enabled) {
        this._gridVisible = !!enabled;
        if (this.grid) this.grid.visible = this._gridVisible;
    }

    getGridVisible() {
        return this._gridVisible;
    }

    setPlaneVisible(enabled) {
        this._planeVisible = !!enabled;
        if (this.plane) this.plane.visible = this._planeVisible;
    }

    getPlaneVisible() {
        return this._planeVisible;
    }

    setAxisLinesVisible(enabled) {
        this._axisLinesVisible = !!enabled;
        if (this.axes) this.axes.visible = this._axisLinesVisible;
    }

    getAxisLinesVisible() {
        return this._axisLinesVisible;
    }

    setAxisAlwaysVisible(enabled) {
        this._axisAlwaysVisible = !!enabled;
        this._applyAxisAlwaysVisible();
    }

    getAxisAlwaysVisible() {
        return this._axisAlwaysVisible;
    }

    setLightMarkerVisible(enabled) {
        this._lightMarkerVisible = !!enabled;
        if (this.lightMarker) this.lightMarker.visible = this._lightMarkerVisible;
    }

    getLightMarkerVisible() {
        return this._lightMarkerVisible;
    }

    setLightEnabled(enabled) {
        this._lightEnabled = !!enabled;
        if (this.sun) this.sun.visible = this._lightEnabled;
        this._syncLightMarker();
    }

    getLightEnabled() {
        return this._lightEnabled;
    }

    setLightIntensity(intensity) {
        const next = clamp(intensity, 0, 4);
        this._lightIntensity = next;
        if (this.sun) this.sun.intensity = next;
        this._syncLightMarker();
    }

    getLightIntensity() {
        if (this.sun && Number.isFinite(Number(this.sun.intensity))) return this.sun.intensity;
        return this._lightIntensity;
    }

    setLightColorHex(hex) {
        const next = Number.isFinite(Number(hex)) ? Number(hex) : 0xffffff;
        this._lightColorHex = next;
        if (this.sun) this.sun.color.setHex(next);
        this._syncLightMarker();
    }

    getLightColorHex() {
        if (this.sun) return this.sun.color.getHex();
        return this._lightColorHex;
    }

    getLightPosition() {
        const light = this.sun ?? null;
        if (!light) return { x: 0, y: 0, z: 0 };
        return { x: light.position.x, y: light.position.y, z: light.position.z };
    }

    setLightPosition({ x, y, z } = {}) {
        if (!this.sun) return;
        const pos = this.sun.position;
        if (Number.isFinite(Number(x))) pos.x = Number(x);
        if (Number.isFinite(Number(y))) pos.y = Number(y);
        if (Number.isFinite(Number(z))) pos.z = Number(z);

        if (this.lightMarker) this.lightMarker.position.copy(pos);
        if (this.sky?.material?.uniforms?.uSunDir?.value) {
            this.sky.material.uniforms.uSunDir.value.copy(pos).normalize();
        }
    }

    setPlaneBaseColor(hex) {
        if (!this._planeMat) return;
        const next = Number.isFinite(Number(hex)) ? Number(hex) : this._config.planeColor;
        this._planeMat.color.setHex(next);
        this._planeMat.needsUpdate = true;
    }

    setFocusBounds({ center, radius } = {}, { keepCamera = false } = {}) {
        const prevCenter = this._focus.center.clone();
        const nextCenter = ensureVector3(center, this._focus.center);
        const nextRadius = Number.isFinite(Number(radius)) ? Math.max(0.001, Number(radius)) : this._focus.radius;

        this._focus.center.copy(nextCenter);
        this._focus.radius = nextRadius;

        if (this.controls) {
            const r = Math.max(0.15, Number(nextRadius) || 1);
            this.controls.minDistance = Math.max(0.15, r * 0.35);
            this.controls.maxDistance = Math.max(5, r * 80);
        }

        const delta = nextCenter.clone().sub(prevCenter);
        if (keepCamera && this.controls) {
            const position = this.camera.position.clone().add(delta);
            const orbit = this.controls.getOrbit?.() ?? null;
            const t = orbit?.target ?? null;
            const target = new THREE.Vector3(Number(t?.x) || 0, Number(t?.y) || 0, Number(t?.z) || 0).add(delta);
            this.camera.up.set(0, 1, 0);
            this.controls.setLookAt({ position, target });
            return;
        }

        this._applyFocusToControls({ immediate: false });
    }

    setCameraPreset(presetId, { duration = 0.28, instant = false } = {}) {
        const preset = typeof presetId === 'string' ? presetId : 'free';
        const dist = this._getFitDistance();
        const center = this._focus.center.clone();

        const views = {
            free: { dir: new THREE.Vector3(1, 0.75, 1), up: new THREE.Vector3(0, 1, 0) },
            front: { dir: new THREE.Vector3(0, 0, 1), up: new THREE.Vector3(0, 1, 0) },
            back: { dir: new THREE.Vector3(0, 0, -1), up: new THREE.Vector3(0, 1, 0) },
            right: { dir: new THREE.Vector3(1, 0, 0), up: new THREE.Vector3(0, 1, 0) },
            left: { dir: new THREE.Vector3(-1, 0, 0), up: new THREE.Vector3(0, 1, 0) },
            top: { dir: new THREE.Vector3(0, 1, 0), up: new THREE.Vector3(0, 0, -1) },
            bottom: { dir: new THREE.Vector3(0, -1, 0), up: new THREE.Vector3(0, 0, 1) }
        };

        const view = views[preset] ?? views.free;
        const dir = view.dir.clone().normalize();
        const pos = center.clone().add(dir.multiplyScalar(dist));
        const up = view.up.clone().normalize();

        if (instant) {
            this._applyCameraPose({ position: pos, target: center, up });
            return;
        }

        this._startCameraTween({
            fromPosition: this.camera.position.clone(),
            fromTarget: this.controls?.target?.clone?.() ?? center.clone(),
            fromUp: this.camera.up.clone(),
            toPosition: pos,
            toTarget: center,
            toUp: up,
            duration: clamp(duration, 0.05, 2.5)
        });
    }

    _applyFocusToControls({ immediate = false } = {}) {
        if (!this.controls) return;
        const c = this._focus.center;
        this.controls.setOrbit?.({ target: { x: c.x, y: c.y, z: c.z } }, { immediate });
    }

    _applyCameraPose({ position, target, up }) {
        if (!this.controls) return;
        this._cameraTween = null;
        this.controls.enabled = true;
        this.camera.up.copy(up);
        this.controls.setLookAt({ position, target });
    }

    _startCameraTween({ fromPosition, fromTarget, fromUp, toPosition, toTarget, toUp, duration }) {
        if (!this.controls) return;
        this._cameraTween = {
            t: 0,
            duration,
            fromPosition,
            fromTarget,
            fromUp,
            toPosition,
            toTarget,
            toUp
        };
        this.controls.enabled = false;
    }

    _tickCameraTween(dt) {
        const tween = this._cameraTween ?? null;
        if (!tween || !this.controls) return;

        tween.t += Math.max(0, Number(dt) || 0);
        const p = tween.duration > 0 ? tween.t / tween.duration : 1;
        const eased = easeInOutCubic(p);

        const target = tween.fromTarget.clone().lerp(tween.toTarget, eased);
        this.camera.position.lerpVectors(tween.fromPosition, tween.toPosition, eased);
        this.camera.up.lerpVectors(tween.fromUp, tween.toUp, eased).normalize();
        this.camera.lookAt(target);

        if (p >= 1) {
            this._cameraTween = null;
            this.controls.enabled = true;
            this.controls.setLookAt({ position: this.camera.position, target });
        }
    }

    _getFitDistance() {
        const r = Math.max(0.15, Number(this._focus.radius) || 1);
        const vfov = THREE.MathUtils.degToRad(Number(this.camera.fov) || 55);
        const aspect = Number(this.camera.aspect) || 1;
        const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect);
        const distV = r / Math.tan(vfov / 2);
        const distH = r / Math.tan(hfov / 2);
        const dist = Math.max(distV, distH);
        return dist * 1.25 + r * 0.15;
    }

    _syncPlane({ rebuild = false } = {}) {
        if (!this.root) return;
        if (this.plane && !rebuild) {
            this._syncPlaneMaterial();
            this.plane.position.y = this._config.planeY;
            this.plane.visible = this._planeVisible;
            return;
        }

        if (this.plane) {
            this.root.remove(this.plane);
            this._planeGeo?.dispose?.();
            this._planeMat?.dispose?.();
            this.plane = null;
            this._planeGeo = null;
            this._planeMat = null;
        }

        this._planeGeo = new THREE.PlaneGeometry(this._config.planeSize, this._config.planeSize);
        this._planeMat = new THREE.MeshStandardMaterial({
            color: this._config.planeColor,
            metalness: this._config.planeMetalness,
            roughness: this._config.planeRoughness,
            side: THREE.DoubleSide
        });

        this.plane = new THREE.Mesh(this._planeGeo, this._planeMat);
        this.plane.name = 'inspector_room_plane';
        this.plane.rotation.x = -Math.PI / 2;
        this.plane.position.y = this._config.planeY;
        this.plane.receiveShadow = true;
        this.plane.visible = this._planeVisible;
        this.root.add(this.plane);
    }

    _syncPlaneMaterial() {
        if (!this._planeMat) return;
        this._planeMat.color.setHex(this._config.planeColor);
        this._planeMat.metalness = this._config.planeMetalness;
        this._planeMat.roughness = this._config.planeRoughness;
        this._planeMat.needsUpdate = true;
    }

    _syncGrid({ rebuild = false } = {}) {
        if (!this.root) return;
        if (this.grid && !rebuild) {
            this.grid.position.y = this._config.planeY + 0.001;
            this.grid.visible = this._gridVisible;
            return;
        }

        if (this.grid) {
            this.root.remove(this.grid);
            this.grid.geometry?.dispose?.();
            if (Array.isArray(this.grid.material)) {
                for (const m of this.grid.material) m?.dispose?.();
            } else {
                this.grid.material?.dispose?.();
            }
            this.grid = null;
        }

        const grid = new THREE.GridHelper(this._config.gridSize, this._config.gridDivisions, 0x2b3544, 0x1a2230);
        grid.name = 'inspector_room_grid';
        grid.position.y = this._config.planeY + 0.001;
        grid.visible = this._gridVisible;
        this.root.add(grid);
        this.grid = grid;
    }

    _syncAxes({ rebuild = false } = {}) {
        if (!this.root) return;
        if (this.axes && !rebuild) {
            this.axes.visible = this._axisLinesVisible;
            return;
        }

        if (this.axes) {
            this.root.remove(this.axes);
            this.axes.traverse?.((obj) => {
                obj.geometry?.dispose?.();
                if (Array.isArray(obj.material)) {
                    for (const m of obj.material) m?.dispose?.();
                } else {
                    obj.material?.dispose?.();
                }
            });
            this.axes = null;
        }
        this._axisMaterials = [];

        const axisSize = 1;
        const yOffset = this._config.planeY + 0.002;

        const makeLine = (a, b, color) => {
            const geo = new THREE.BufferGeometry().setFromPoints([a, b]);
            const mat = new THREE.LineBasicMaterial({ color });
            const line = new THREE.Line(geo, mat);
            this._axisMaterials.push(mat);
            return line;
        };

        const axes = new THREE.Group();
        axes.name = 'inspector_room_axes';
        axes.visible = this._axisLinesVisible;

        axes.add(makeLine(new THREE.Vector3(-axisSize, yOffset, 0), new THREE.Vector3(axisSize, yOffset, 0), 0xff0000));
        axes.add(makeLine(new THREE.Vector3(0, yOffset - axisSize, 0), new THREE.Vector3(0, yOffset + axisSize, 0), 0x00ff00));
        axes.add(makeLine(new THREE.Vector3(0, yOffset, -axisSize), new THREE.Vector3(0, yOffset, axisSize), 0x0000ff));

        this.root.add(axes);
        this.axes = axes;
        this._axisEndpoints = {
            xn: { x: -axisSize, y: yOffset, z: 0 },
            xp: { x: axisSize, y: yOffset, z: 0 },
            yn: { x: 0, y: yOffset - axisSize, z: 0 },
            yp: { x: 0, y: yOffset + axisSize, z: 0 },
            zn: { x: 0, y: yOffset, z: -axisSize },
            zp: { x: 0, y: yOffset, z: axisSize }
        };
    }

    _applyAxisAlwaysVisible() {
        const on = !!this._axisAlwaysVisible;
        for (const mat of this._axisMaterials) {
            if (!mat) continue;
            mat.depthTest = !on ? true : false;
            mat.transparent = on;
            mat.opacity = on ? 0.95 : 1.0;
            mat.needsUpdate = true;
        }
        if (this.axes) this.axes.renderOrder = on ? 999 : 0;
    }

    _syncLightMarker() {
        if (!this.root || !this.sun) return;
        if (!this.lightMarker) {
            const geo = new THREE.SphereGeometry(0.14, 16, 16);
            const mat = new THREE.MeshBasicMaterial({ color: 0xfff1a6, transparent: true, opacity: 0.95 });
            const marker = new THREE.Mesh(geo, mat);
            marker.name = 'inspector_room_light_marker';
            marker.renderOrder = 999;
            marker.position.copy(this.sun.position);
            marker.visible = this._lightMarkerVisible;
            this.root.add(marker);
            this.lightMarker = marker;
        }
        this.lightMarker.visible = this._lightMarkerVisible;
        this.lightMarker.position.copy(this.sun.position);
        const mat = this.lightMarker.material;
        const color = this.sun.color ?? null;
        const intensity = clamp(this.getLightIntensity(), 0, 4);
        const intensityNorm = clamp(intensity / 4, 0, 1);
        const opacity = this._lightEnabled ? (0.24 + 0.72 * intensityNorm) : 0.12;
        if (mat && mat.isMeshBasicMaterial) {
            if (color) mat.color.copy(color);
            mat.opacity = opacity;
            mat.needsUpdate = true;
        }
        const scale = 0.9 + 0.5 * intensityNorm;
        this.lightMarker.scale.setScalar(scale);
        if (this.sky?.material?.uniforms?.uSunDir?.value) {
            this.sky.material.uniforms.uSunDir.value.copy(this.sun.position).normalize();
        }
    }
}
