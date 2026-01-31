// src/states/BusSelectState.js
// Manages the bus selection showroom state and transitions.
// Design: Buses are re-anchored to their bounds center to keep carousel swaps stable.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { BUS_CATALOG } from '../graphics/assets3d/factories/BusCatalog.js';
import { createBus } from '../graphics/assets3d/factories/BusFactory.js';
import { tween, easeInOutCubic } from '../app/utils/animate.js';
import { createGarageModel } from '../graphics/assets3d/environment.js';
import { tuneBusMaterials } from '../graphics/assets3d/factories/tuneBusMaterials.js';
import { fadeOut } from '../graphics/gui/shared/utils/screenFade.js';

const TRANSITION = {
    shuffleSec: 1.4,
    focusSec: 1.8,
    fadeOutSec: 1.2,
    fadeTimeoutMs: 3000
};

const GARAGE = {
    width: 48,
    depth: 60,
    height: 14
};

const GARAGE_DOOR_Z = -GARAGE.depth * 0.5 + 0.55;

const COACH_BUS_LENGTH_M = 13.2;
const PLATFORM_SCALE = 0.95;

const PLATFORM = {
    radius: COACH_BUS_LENGTH_M * 0.5 * PLATFORM_SCALE,
    height: 0.12,
    lift: 0.03,
    spinRadPerSec: 0.14,
    transitionSec: 0.9,
    stripeRingTube: 0.09,
    stripeRingLift: 0.006
};

const CAROUSEL = (() => {
    const center = new THREE.Vector3(0, 0, GARAGE_DOOR_Z);
    const radius = Math.max(1, -GARAGE_DOOR_Z);
    const desiredChord = COACH_BUS_LENGTH_M * 1.15;
    const stepAngle = Math.asin(Math.min(0.95, desiredChord / radius));
    const enterAngle = stepAngle * 2.15;
    return { center, radius, stepAngle, enterAngle };
})();

function resolveBoundsTarget(model) {
    const api = model?.userData?.bus ?? model?.userData?.api ?? null;
    if (api?.tiltPivot?.isObject3D) return api.tiltPivot;
    if (api?.bodyRoot?.isObject3D) return api.bodyRoot;
    return model;
}

function makeVehicleAnchor(model) {
    const anchor = new THREE.Group();
    anchor.name = `${model.name || 'bus'}_anchor`;

    anchor.userData = { ...model.userData };
    anchor.userData.model = model;
    anchor.userData.origin = 'center';

    anchor.add(model);

    const boundsTarget = resolveBoundsTarget(model);
    anchor.updateMatrixWorld(true);
    boundsTarget.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(boundsTarget);
    if (!box.isEmpty()) {
        const centerWorld = box.getCenter(new THREE.Vector3());
        const centerLocal = anchor.worldToLocal(centerWorld.clone());
        model.position.sub(centerLocal);
    }

    return anchor;
}

function wait(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

function tweenPromise(opts) {
    return new Promise((resolve) => {
        tween({
            ...opts,
            onComplete: () => {
                opts.onComplete?.();
                resolve();
            }
        });
    });
}

function makeWarningStripeTexture() {
    const size = 256;
    const stripe = 28;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.fillStyle = '#0b0d10';
    ctx.fillRect(0, 0, size, size);

    ctx.save();
    ctx.translate(size * 0.5, size * 0.5);
    ctx.rotate(-Math.PI / 4);
    ctx.translate(-size * 0.5, -size * 0.5);

    ctx.fillStyle = '#f7c843';
    for (let x = -size; x < size * 2; x += stripe * 2) {
        ctx.fillRect(x, -size, stripe, size * 3);
    }

    ctx.restore();

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(10, 1);
    tex.anisotropy = 8;
    return tex;
}

function createPlatformMesh() {
    const group = new THREE.Group();
    group.name = 'GaragePlatform';

    const geo = new THREE.CylinderGeometry(PLATFORM.radius, PLATFORM.radius, PLATFORM.height, 72, 1, false);
    const topMat = new THREE.MeshStandardMaterial({
        color: 0x121722,
        roughness: 0.58,
        metalness: 0.65
    });
    const bottomMat = topMat.clone();

    const sideMat = new THREE.MeshStandardMaterial({
        color: 0x0f141d,
        roughness: 0.78,
        metalness: 0.18
    });

    const base = new THREE.Mesh(geo, [sideMat, topMat, bottomMat]);
    base.position.y = PLATFORM.lift + PLATFORM.height * 0.5;
    base.receiveShadow = true;
    base.castShadow = false;
    group.add(base);

    const stripeTex = makeWarningStripeTexture();
    const stripeMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: stripeTex,
        roughness: 0.55,
        metalness: 0.05
    });

    const ringRadius = Math.max(0.001, PLATFORM.radius - PLATFORM.stripeRingTube * 0.55);
    const ringGeo = new THREE.TorusGeometry(ringRadius, PLATFORM.stripeRingTube, 16, 120);
    const ring = new THREE.Mesh(ringGeo, stripeMat);
    ring.position.y = PLATFORM.lift + PLATFORM.height + PLATFORM.stripeRingLift;
    ring.rotation.x = Math.PI / 2;
    ring.castShadow = false;
    ring.receiveShadow = true;
    group.add(ring);

    return group;
}

function applyFade(group, alpha) {
    const a = THREE.MathUtils.clamp(alpha ?? 1, 0, 1);
    group.traverse((o) => {
        if (!o.isMesh) return;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const mat of mats) {
            if (!mat) continue;
            if (!mat.userData) mat.userData = {};
            if (mat.userData._fadeBaseOpacity === undefined) {
                mat.userData._fadeBaseOpacity = Number.isFinite(mat.opacity) ? mat.opacity : 1.0;
            }
            if (mat.userData._fadeBaseTransparent === undefined) {
                mat.userData._fadeBaseTransparent = !!mat.transparent;
            }
            const baseOpacity = mat.userData._fadeBaseOpacity;
            mat.transparent = (a < 0.999) ? true : mat.userData._fadeBaseTransparent;
            mat.opacity = baseOpacity * a;
            mat.needsUpdate = true;
        }
    });
}

function setCarouselAngle(group, angleRad) {
    if (!group) return;
    const a = Number.isFinite(angleRad) ? angleRad : 0;
    group.position.x = CAROUSEL.center.x + CAROUSEL.radius * Math.sin(a);
    group.position.z = CAROUSEL.center.z + CAROUSEL.radius * Math.cos(a);
}

function snapBusToPlatformTop(busAnchor, platformTopY) {
    if (!busAnchor) return;
    const y = Number.isFinite(platformTopY) ? platformTopY : 0;
    busAnchor.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(busAnchor);
    if (box.isEmpty()) return;
    const delta = y - box.min.y;
    if (Number.isFinite(delta) && Math.abs(delta) > 1e-5) {
        busAnchor.position.y += delta;
        busAnchor.updateMatrixWorld(true);
    }
}

export class BusSelectState {
    constructor(engine, sm) {
        this.engine = engine;
        this.sm = sm;

        this.canvas = engine.canvas;

        this.uiWelcome = document.getElementById('ui-welcome');
        this.uiSelect = document.getElementById('ui-select');
        this.hudChip = this.uiSelect.querySelector('.chip');
        this.blinkEl = document.getElementById('blink');

        this.controls = null;

        this.showcase = null;
        this.hoveredBus = null;
        this.selectedBus = null;
        this._isSelecting = false;
        this._transitioning = false;

        this.activeIndex = 0;

        this.pointer = new THREE.Vector2();
        this.raycaster = new THREE.Raycaster();

        this._uiNav = null;

        this._onMove = (e) => this._handlePointerMove(e);
        this._onDown = (e) => this._handlePointerDown(e);
        this._onKeyDown = (e) => this._handleKeyDown(e);
    }

    enter() {
        document.body.classList.remove('splash-bg');

        this.uiWelcome.classList.add('hidden');
        this.uiSelect.classList.remove('hidden');

        this.engine.clearScene();

        this._isSelecting = false;
        this._transitioning = false;

        this.selectedBus = null;
        this.hoveredBus = null;
        this.activeIndex = 0;

        const scene = this.engine.scene;
        scene.background = new THREE.Color(0x070b12);
        scene.fog = null;

        const { root: garageRoot, lights: garageLights } = createGarageModel({
            width: GARAGE.width,
            depth: GARAGE.depth,
            height: GARAGE.height
        });

        garageRoot.traverse((o) => {
            if (o.isMesh) {
                o.castShadow = (o.castShadow ?? true);
                o.receiveShadow = (o.receiveShadow ?? true);
            }
        });

        scene.add(garageRoot);
        for (const l of garageLights) scene.add(l);

        const camera = this.engine.camera;
        camera.position.set(0, 5.4, 18);
        camera.lookAt(0, 1.7, 0);

        this.controls = new OrbitControls(camera, this.engine.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.enablePan = false;
        this.controls.minDistance = 12;
        this.controls.maxDistance = 28;
        this.controls.maxPolarAngle = Math.PI * 0.47;
        this.controls.target.set(0, 1.7, 0);

        this._mountNavUI();

        this.activeIndex = 0;
        this.showcase = this._createShowcase(this.activeIndex);
        scene.add(this.showcase.group);
        this._setActiveIndex(this.activeIndex);

        this.canvas.addEventListener('pointermove', this._onMove);
        this.canvas.addEventListener('pointerdown', this._onDown);
        window.addEventListener('keydown', this._onKeyDown, { passive: false });
        this.canvas.classList.remove('cursor-pointer');
    }

    exit() {
        this.canvas.removeEventListener('pointermove', this._onMove);
        this.canvas.removeEventListener('pointerdown', this._onDown);
        window.removeEventListener('keydown', this._onKeyDown);
        this.canvas.classList.remove('cursor-pointer');

        this.controls?.dispose?.();
        this.controls = null;

        this._unmountNavUI();

        this.uiSelect.classList.add('hidden');
    }

    update(dt) {
        this.controls?.update();

        if (this.showcase?.group) {
            this.showcase.group.rotation.y += (dt ?? 0) * PLATFORM.spinRadPerSec;
        }
    }

    _handleKeyDown(e) {
        if (this._isSelecting) return;

        const code = e.code;
        const key = e.key;

        const isEsc = code === 'Escape' || key === 'Escape' || key === 'Esc';
        const isLeft =
            code === 'ArrowLeft' || key === 'ArrowLeft' || code === 'KeyA' || key === 'a' || key === 'A';
        const isRight =
            code === 'ArrowRight' || key === 'ArrowRight' || code === 'KeyD' || key === 'd' || key === 'D';

        const isEnter = code === 'Enter' || key === 'Enter';
        const isSpace = code === 'Space' || key === ' ' || key === 'Spacebar';
        const isG = code === 'KeyG' || key === 'g' || key === 'G';

        if (isEsc || isLeft || isRight || isEnter || isSpace || isG) e.preventDefault();

        if (isEsc) {
            this.sm.go('welcome');
            return;
        }

        if (isLeft) this._moveActive(-1);
        if (isRight) this._moveActive(1);

        if (isG) {
            const bus = this.hoveredBus ?? this.showcase?.bus ?? null;
            if (bus) this._selectBusToGameplay(bus);
            return;
        }

        if (isEnter || isSpace) {
            const bus = this.hoveredBus ?? this.showcase?.bus ?? null;
            if (bus) this._selectBus(bus);
        }
    }

    _selectBusToGameplay(bus) {
        if (this._isSelecting) return;
        this._isSelecting = true;

        this.engine.context.selectedBus = bus;

        this.sm.go('game_mode');
    }

    _moveActive(delta) {
        if (this._transitioning) return;
        const n = BUS_CATALOG.length;
        if (!n) return;
        const next = (this.activeIndex + delta + n) % n;
        if (next === this.activeIndex) return;
        this._transitionToIndex(next, Math.sign(delta) || 1);
    }

    _setActiveIndex(index) {
        this.activeIndex = Math.max(0, Math.min(index, BUS_CATALOG.length - 1));
        this.hoveredBus = this.showcase?.bus ?? null;

        const spec = BUS_CATALOG[this.activeIndex];
        const label = spec?.name ?? 'Bus';
        this._setChip(label, null);
    }

    _handlePointerMove(event) {
        if (this._isSelecting) return;

        const bus = this._pickBus(event);
        if (bus) {
            this.hoveredBus = bus;

            const label = BUS_CATALOG[this.activeIndex]?.name ?? 'Bus';
            this._setChip(label, null);
            this.canvas.classList.add('cursor-pointer');
            return;
        }

        this.hoveredBus = this.showcase?.bus ?? null;
        const label = BUS_CATALOG[this.activeIndex]?.name ?? 'Bus';
        this._setChip(label, null);
        this.canvas.classList.remove('cursor-pointer');
    }

    _handlePointerDown(event) {
        if (this._isSelecting) return;
        const bus = this._pickBus(event);
        if (!bus) return;
        this._selectBus(bus);
    }

    _pickBus(event) {
        if (!this.showcase?.bus) return null;
        const rect = this.canvas.getBoundingClientRect();
        const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        const y = 1 - ((event.clientY - rect.top) / rect.height) * 2;
        this.pointer.set(x, y);

        this.raycaster.setFromCamera(this.pointer, this.engine.camera);

        const hits = this.raycaster.intersectObject(this.showcase.bus, true);
        if (!hits.length) return null;

        return this.showcase.bus;
    }

    _selectBus(bus) {
        if (this._transitioning) return;

        this._transitioning = true;
        this._isSelecting = true;

        this.selectedBus = bus;
        this.hoveredBus = null;
        this.canvas.classList.remove('cursor-pointer');

        const selectedSpec = bus.userData.spec ?? BUS_CATALOG[this.activeIndex];
        this.engine.context.selectedBusId = selectedSpec?.id ?? null;
        this.engine.context.selectedBus = bus;

        const selectedLabel = BUS_CATALOG[this.activeIndex]?.name ?? selectedSpec?.name ?? 'Bus';
        this._setChip(selectedLabel, 'Selected');

        this._blink();
        if (this.controls) this.controls.enabled = false;

        this._runSelectionSequence(bus).catch((err) => {
            console.error('[BusSelect] Selection sequence failed:', err);
            this.sm.go('game_mode');
        });
    }

    async _runSelectionSequence(bus) {
        await this._focusCameraOn(bus);

        await Promise.race([
            fadeOut({ duration: TRANSITION.fadeOutSec }),
            wait(TRANSITION.fadeTimeoutMs)
        ]);

        this.sm.go('game_mode');
    }

    _focusCameraOn(bus) {
        const cam = this.engine.camera;
        const startPos = cam.position.clone();
        const startTarget = this.controls ? this.controls.target.clone() : new THREE.Vector3(0, 1.5, 0);

        const box = new THREE.Box3().setFromObject(bus);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const d = Math.max(size.x, size.y, size.z);

        const endTarget = center.clone().add(new THREE.Vector3(0, size.y * 0.12, 0));
        const endPos = center.clone().add(new THREE.Vector3(d * 0.75, d * 0.35, d * 1.55));

        return tweenPromise({
            duration: TRANSITION.focusSec,
            easing: easeInOutCubic,
            onUpdate: (k) => {
                cam.position.lerpVectors(startPos, endPos, k);

                if (this.controls) {
                    this.controls.target.lerpVectors(startTarget, endTarget, k);
                } else {
                    cam.lookAt(endTarget);
                }

                cam.lookAt(endTarget);
            }
        });
    }

    _blink() {
        this.blinkEl.classList.remove('blink');
        void this.blinkEl.offsetWidth;
        this.blinkEl.classList.add('blink');
    }

    _createShowcase(index) {
        const spec = BUS_CATALOG[index];
        const group = new THREE.Group();
        group.name = `GarageShowcase_${spec?.id ?? index}`;

        const platform = createPlatformMesh();
        group.add(platform);

        const busModel = createBus(spec);
        const bus = makeVehicleAnchor(busModel);
        bus.userData.id = spec?.id ?? null;
        bus.userData.spec = spec;
        tuneBusMaterials(bus, { colorScale: 0.78, roughness: 0.92, metalness: 0.0 });
        bus.traverse((o) => {
            if (o.isMesh) {
                o.castShadow = true;
                o.receiveShadow = true;
            }
        });

        const platformTopY = PLATFORM.lift + PLATFORM.height;
        bus.position.set(0, platformTopY, 0);
        bus.rotation.set(0, 0, 0);
        group.add(bus);

        snapBusToPlatformTop(bus, platformTopY);
        bus.userData?.readyPromise?.then?.(() => {
            tuneBusMaterials(bus, { colorScale: 0.78, roughness: 0.92, metalness: 0.0 });
            snapBusToPlatformTop(bus, platformTopY);
        });

        applyFade(group, 1);
        setCarouselAngle(group, 0);
        return { group, bus, platform };
    }

    async _transitionToIndex(nextIndex, dir) {
        if (this._transitioning) return;
        this._transitioning = true;

        const scene = this.engine.scene;
        const from = this.showcase;
        const to = this._createShowcase(nextIndex);

        const enterA = (dir >= 0 ? 1 : -1) * CAROUSEL.enterAngle;
        const exitA = -enterA;

        setCarouselAngle(to.group, enterA);
        applyFade(to.group, 0);
        scene.add(to.group);

        await tweenPromise({
            duration: PLATFORM.transitionSec,
            easing: easeInOutCubic,
            onUpdate: (k) => {
                const kk = THREE.MathUtils.clamp(k, 0, 1);
                if (from?.group) {
                    setCarouselAngle(from.group, THREE.MathUtils.lerp(0, exitA, kk));
                    applyFade(from.group, 1 - kk);
                }
                setCarouselAngle(to.group, THREE.MathUtils.lerp(enterA, 0, kk));
                applyFade(to.group, kk);
            }
        });

        if (from?.group) scene.remove(from.group);
        this.showcase = to;
        this.selectedBus = null;
        this.hoveredBus = to.bus;
        this._setActiveIndex(nextIndex);
        this._transitioning = false;
    }

    _setChip(title, meta) {
        if (!this.hudChip) return;
        this.hudChip.innerHTML = '';

        const t = document.createElement('div');
        t.className = 'bus-select-chip-title';
        t.textContent = title;

        this.hudChip.appendChild(t);
        if (meta) {
            const m = document.createElement('div');
            m.className = 'bus-select-chip-meta';
            m.textContent = meta;
            this.hudChip.appendChild(m);
        }
    }

    _mountNavUI() {
        if (this._uiNav?.root) return;
        const root = document.createElement('div');
        root.className = 'bus-select-nav';

        const makeBtn = (text) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = text;
            btn.className = 'bus-select-nav-btn';
            return btn;
        };

        const left = makeBtn('←');
        left.classList.add('is-left');

        const right = makeBtn('→');
        right.classList.add('is-right');

        const onLeft = (e) => {
            e.preventDefault();
            e.stopPropagation();
            this._moveActive(-1);
        };
        const onRight = (e) => {
            e.preventDefault();
            e.stopPropagation();
            this._moveActive(1);
        };

        left.addEventListener('click', onLeft);
        right.addEventListener('click', onRight);

        root.appendChild(left);
        root.appendChild(right);
        document.body.appendChild(root);

        this._uiNav = { root, left, right, onLeft, onRight };
    }

    _unmountNavUI() {
        const nav = this._uiNav;
        if (!nav) return;
        nav.left?.removeEventListener?.('click', nav.onLeft);
        nav.right?.removeEventListener?.('click', nav.onRight);
        nav.root?.parentNode?.removeChild?.(nav.root);
        this._uiNav = null;
    }
}
