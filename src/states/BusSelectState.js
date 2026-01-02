// src/states/BusSelectState.js
// Manages the bus selection showroom state and transitions.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { BUS_CATALOG } from '../graphics/assets3d/factories/BusCatalog.js';
import { createBus } from '../graphics/assets3d/factories/BusFactory.js';
import { tween, easeInOutCubic } from '../app/utils/animate.js';
import { createGarageModel } from '../graphics/assets3d/environment.js';
import { tuneBusMaterials } from '../graphics/assets3d/factories/tuneBusMaterials.js';
import { fadeOut } from '../graphics/gui/shared/utils/screenFade.js';

const TRANSITION = {
    shuffleSec: 1.4,   // was 0.85
    focusSec: 1.8,     // was 1.1
    fadeOutSec: 1.2,   // was 0.7
    fadeTimeoutMs: 3000 // was 1200 (safety timeout)
};

/**
 * Wrap a bus model in a parent Group whose origin is on the floor (y=0).
 * This makes scaling/rotation safe without the bus “floating” above/below the floor.
 */
function makeFloorAnchor(model) {
    const anchor = new THREE.Group();
    anchor.name = `${model.name || 'bus'}_anchor`;

    // Preserve metadata on the anchor (what the rest of the game uses)
    anchor.userData = { ...model.userData };
    anchor.userData.model = model;

    // Put model inside anchor
    anchor.add(model);

    // Reset model transform before measuring
    model.position.set(0, 0, 0);
    model.rotation.set(0, 0, 0);
    model.scale.set(1, 1, 1);

    // Compute bounds and lift model so its lowest point touches y=0
    const box = new THREE.Box3().setFromObject(model);
    model.position.y -= box.min.y; // ✅ floor at y=0

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

        this.buses = [];
        this.hoveredBus = null;
        this.selectedBus = null;
        this._isSelecting = false;
        this._transitioning = false;

        this.activeIndex = 0;

        this.pointer = new THREE.Vector2();
        this.raycaster = new THREE.Raycaster();

        this.selectorRing = null;

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
        this.buses = [];
        this.activeIndex = 0;

        const scene = this.engine.scene;
        scene.background = new THREE.Color(0x070b12);
        scene.fog = null;

        // Garage environment
        const { root: garageRoot, lights: garageLights } = createGarageModel({
            width: 48,
            depth: 60,
            height: 14
        });

        garageRoot.traverse((o) => {
            if (o.isMesh) {
                o.castShadow = (o.castShadow ?? true);
                o.receiveShadow = (o.receiveShadow ?? true);
            }
        });

        scene.add(garageRoot);
        for (const l of garageLights) scene.add(l);

        // Selector ring
        this.selectorRing = new THREE.Mesh(
            new THREE.RingGeometry(1.15, 1.55, 56),
            new THREE.MeshStandardMaterial({
                color: 0xffcc00,
                roughness: 0.35,
                metalness: 0.1,
                transparent: true,
                opacity: 0.65,
                side: THREE.DoubleSide
            })
        );
        this.selectorRing.rotation.x = -Math.PI / 2;
        this.selectorRing.position.y = 0.02;
        this.selectorRing.receiveShadow = true;
        scene.add(this.selectorRing);

        // Camera
        const camera = this.engine.camera;
        camera.position.set(0, 5.4, 18);
        camera.lookAt(0, 1.7, 0);

        this.controls = new OrbitControls(camera, this.engine.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.08;
        this.controls.enablePan = false;
        this.controls.minDistance = 12;
        this.controls.maxDistance = 28;
        this.controls.maxPolarAngle = Math.PI * 0.47;
        this.controls.target.set(0, 1.7, 0);

        // Buses
        const spacing = 7.2;
        const startX = -spacing * (BUS_CATALOG.length - 1) / 2;

        BUS_CATALOG.forEach((spec, i) => {
            const busModel = createBus(spec);

            // ✅ wrap in a floor-anchored parent
            const bus = makeFloorAnchor(busModel);

            // ✅ ensure stable selection info lives on the anchor
            bus.userData.id = spec.id;
            bus.userData.spec = spec;

            tuneBusMaterials(bus, { colorScale: 0.75, roughness: 0.92, metalness: 0.0 });

            bus.traverse((o) => {
                if (o.isMesh) {
                    o.castShadow = true;
                    o.receiveShadow = true;
                }
            });

            bus.position.set(startX + i * spacing, 0, 0);
            bus.rotation.y = (i - (BUS_CATALOG.length - 1) / 2) * 0.14;

            bus.userData.baseX = bus.position.x;
            bus.userData.baseY = 0;
            bus.userData.baseRotY = bus.rotation.y;

            scene.add(bus);
            this.buses.push(bus);
        });

        this._setActiveIndex(0);

        // Input
        this.canvas.addEventListener('pointermove', this._onMove);
        this.canvas.addEventListener('pointerdown', this._onDown);
        window.addEventListener('keydown', this._onKeyDown, { passive: false });

        this.canvas.style.cursor = 'default';
    }

    exit() {
        this.canvas.removeEventListener('pointermove', this._onMove);
        this.canvas.removeEventListener('pointerdown', this._onDown);
        window.removeEventListener('keydown', this._onKeyDown);

        this.canvas.style.cursor = 'default';

        this.controls?.dispose?.();
        this.controls = null;

        this.uiSelect.classList.add('hidden');
    }

    update(dt) {
        this.controls?.update();

        const t = performance.now() * 0.001;

        if (this.selectorRing) {
            this.selectorRing.visible = !this._isSelecting && !!this.hoveredBus;
            if (this.hoveredBus && !this._isSelecting) {
                this.selectorRing.position.x = this.hoveredBus.position.x;
                this.selectorRing.position.z = this.hoveredBus.position.z;
                const pulse = 1 + Math.sin(t * 3.2) * 0.03;
                this.selectorRing.scale.setScalar(pulse);
            }
        }

        for (const bus of this.buses) {
            if (!bus.visible) continue;

            bus.position.y = 0;

            const isHovered = bus === this.hoveredBus && !this._isSelecting;
            const isSelected = bus === this.selectedBus;

            const targetScale = isSelected ? 1.14 : isHovered ? 1.06 : 1.0;
            const s = bus.scale.x + (targetScale - bus.scale.x) * Math.min(1, dt * 10);
            bus.scale.setScalar(s);
        }
    }

    _handleKeyDown(e) {
        if (this._isSelecting) return;

        const code = e.code;
        const key = e.key;

        const isLeft =
            code === 'ArrowLeft' || key === 'ArrowLeft' || code === 'KeyA' || key === 'a' || key === 'A';
        const isRight =
            code === 'ArrowRight' || key === 'ArrowRight' || code === 'KeyD' || key === 'd' || key === 'D';

        const isEnter = code === 'Enter' || key === 'Enter';
        const isSpace = code === 'Space' || key === ' ' || key === 'Spacebar';
        const isG = code === 'KeyG' || key === 'g' || key === 'G';

        if (isLeft || isRight || isEnter || isSpace || isG) e.preventDefault();

        if (isLeft) this._moveActive(-1);
        if (isRight) this._moveActive(1);

        // G = select and go to new GameplayState (for testing new architecture)
        if (isG) {
            const bus = this.hoveredBus ?? this.buses[this.activeIndex];
            if (bus) this._selectBusToGameplay(bus);
            return;
        }

        if (isEnter || isSpace) {
            const bus = this.hoveredBus ?? this.buses[this.activeIndex];
            if (bus) this._selectBus(bus);
        }
    }

    /**
     * Select bus and go to new GameplayState (for testing new architecture).
     * @param {THREE.Object3D} bus
     */
    _selectBusToGameplay(bus) {
        if (this._isSelecting) return;
        this._isSelecting = true;

        // Store selection
        this.engine.context.selectedBus = bus;

        // Go directly to new gameplay state
        this.sm.go('game_mode');
    }

    _moveActive(delta) {
        const n = this.buses.length;
        if (!n) return;
        const next = (this.activeIndex + delta + n) % n;
        this._setActiveIndex(next);
    }

    _setActiveIndex(index) {
        this.activeIndex = Math.max(0, Math.min(index, this.buses.length - 1));
        this.hoveredBus = this.buses[this.activeIndex] ?? null;

        const spec = BUS_CATALOG[this.activeIndex];
        const label = spec?.name ?? 'Bus';
        this.hudChip.textContent = `Garage: Use ←/→ then Enter — ${label} (or click)`;
    }

    _handlePointerMove(event) {
        if (this._isSelecting) return;

        const bus = this._pickBus(event);
        if (bus) {
            const idx = this.buses.indexOf(bus);
            if (idx >= 0 && idx !== this.activeIndex) this.activeIndex = idx;
            this.hoveredBus = bus;

            const label = BUS_CATALOG[this.activeIndex]?.name ?? 'Bus';
            this.hudChip.textContent = `Garage: Use ←/→ then Enter — ${label} (or click)`;
            this.canvas.style.cursor = 'pointer';
            return;
        }

        this.hoveredBus = this.buses[this.activeIndex] ?? null;
        const label = BUS_CATALOG[this.activeIndex]?.name ?? 'Bus';
        this.hudChip.textContent = `Garage: Use ←/→ then Enter — ${label} (or click)`;
        this.canvas.style.cursor = 'default';
    }

    _handlePointerDown(event) {
        if (this._isSelecting) return;
        const bus = this._pickBus(event);
        if (!bus) return;
        this._selectBus(bus);
    }

    _pickBus(event) {
        const rect = this.canvas.getBoundingClientRect();
        const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        const y = 1 - ((event.clientY - rect.top) / rect.height) * 2;
        this.pointer.set(x, y);

        this.raycaster.setFromCamera(this.pointer, this.engine.camera);

        const hits = this.raycaster.intersectObjects(this.buses, true);
        if (!hits.length) return null;

        let obj = hits[0].object;
        while (obj) {
            if (this.buses.includes(obj)) return obj;
            obj = obj.parent;
        }
        return null;
    }

    _selectBus(bus) {
        if (this._transitioning) return;

        this._transitioning = true;
        this._isSelecting = true;

        this.selectedBus = bus;
        this.hoveredBus = null;
        this.canvas.style.cursor = 'default';

        // Save selection for GameMode
        const selectedSpec = bus.userData.spec ?? BUS_CATALOG[this.buses.indexOf(bus)];
        this.engine.context.selectedBusId = selectedSpec?.id ?? null;
        this.engine.context.selectedBus = bus;

        const selectedIndex = this.buses.indexOf(bus);
        const selectedLabel = BUS_CATALOG[selectedIndex]?.name ?? selectedSpec?.name ?? 'Bus';
        this.hudChip.textContent = `Selected: ${selectedLabel}`;

        this._blink();
        if (this.controls) this.controls.enabled = false;

        // Run the full sequence
        this._runSelectionSequence(bus).catch((err) => {
            console.error('[BusSelect] Selection sequence failed:', err);
            // still try to continue to game mode
            this.sm.go('game_mode');
        });
    }

    async _runSelectionSequence(bus) {
        const others = this.buses.filter((b) => b !== bus);
        const busStartX = bus.position.x;

        // 1) Bus shuffle animation
        await tweenPromise({
            duration: TRANSITION.shuffleSec,
            easing: easeInOutCubic,
            onUpdate: (k) => {
                bus.position.x = THREE.MathUtils.lerp(busStartX, 0, k);
                bus.position.y = 0;
                bus.rotation.y = THREE.MathUtils.lerp(bus.userData.baseRotY, 0, k);

                for (const other of others) {
                    const dir = Math.sign(other.userData.baseX - busStartX) || 1;
                    other.position.x = THREE.MathUtils.lerp(other.userData.baseX, other.userData.baseX + dir * 10, k);
                    other.position.y = 0;
                    other.position.z = THREE.MathUtils.lerp(0, -6, k);
                    other.scale.setScalar(THREE.MathUtils.lerp(1, 0.001, k));
                }
            }
        });

        for (const other of others) other.visible = false;
        if (this.selectorRing) this.selectorRing.visible = false;

        // 2) Camera focus animation
        await this._focusCameraOn(bus);

        // 3) Fade out, then go to game_mode
        // (Race with a timeout so we NEVER get stuck here)
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

                // If OrbitControls is disabled, update() early-returns, so force orientation:
                cam.lookAt(endTarget);
            }
        });
    }

    _blink() {
        this.blinkEl.classList.remove('blink');
        void this.blinkEl.offsetWidth;
        this.blinkEl.classList.add('blink');
    }
}
