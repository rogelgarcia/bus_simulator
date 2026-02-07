// src/graphics/visuals/vehicles/BusContactShadowRig.js
// Bus-only contact shadow blobs (cheap grounding cue under wheels/chassis).
// @ts-check

import * as THREE from 'three';

function clamp(value, min, max, fallback) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.max(min, Math.min(max, num));
}

function isDescendantOf(node, root) {
    let cur = node ?? null;
    const r = root ?? null;
    if (!cur || !r) return false;
    while (cur) {
        if (cur === r) return true;
        cur = cur.parent ?? null;
    }
    return false;
}

const CONTACT_SHADOW_BLOB_SHADER = Object.freeze({
    uniforms: {
        uIntensity: { value: 0.4 },
        uSoftness: { value: 0.75 }
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform float uIntensity;
        uniform float uSoftness;
        varying vec2 vUv;

        void main() {
            vec2 p = (vUv - vec2(0.5)) * 2.0;
            float r = length(p);
            float softness = clamp(uSoftness, 0.02, 1.0);
            float inner = max(0.0, 1.0 - softness);
            float a = 1.0 - smoothstep(inner, 1.0, r);
            float alpha = clamp(uIntensity, 0.0, 2.0) * a;
            if (alpha <= 0.0001) discard;
            gl_FragColor = vec4(0.0, 0.0, 0.0, alpha);
        }
    `
});

function createBlobMaterial({ intensity, softness } = {}) {
    const mat = new THREE.ShaderMaterial({
        uniforms: THREE.UniformsUtils.clone(CONTACT_SHADOW_BLOB_SHADER.uniforms),
        vertexShader: CONTACT_SHADOW_BLOB_SHADER.vertexShader,
        fragmentShader: CONTACT_SHADOW_BLOB_SHADER.fragmentShader,
        transparent: true,
        depthWrite: false,
        depthTest: true,
        toneMapped: false
    });

    if (mat.uniforms?.uIntensity) mat.uniforms.uIntensity.value = clamp(intensity, 0, 2, 0.4);
    if (mat.uniforms?.uSoftness) mat.uniforms.uSoftness.value = clamp(softness, 0.02, 1, 0.75);
    return mat;
}

function getWheelRig(busModel) {
    const m = busModel ?? null;
    if (!m) return null;
    const rig = m.userData?.rig ?? m.userData?.bus ?? m.userData?.api ?? null;
    return rig?.wheelRig ?? m.userData?.wheelRig ?? null;
}

function collectWheelPivots(wheelRig) {
    const out = [];
    const rig = wheelRig ?? null;
    if (!rig) return out;

    const add = (wheel) => {
        const pivot = wheel?.rollPivot ?? wheel?.steerPivot ?? null;
        if (!pivot?.isObject3D) return;
        if (out.includes(pivot)) return;
        out.push(pivot);
    };

    for (const w of (rig.front ?? [])) add(w);
    for (const w of (rig.rear ?? [])) add(w);
    return out;
}

export class BusContactShadowRig {
    constructor({ enabled = false, settings = null } = {}) {
        this.group = new THREE.Group();
        this.group.name = 'BusContactShadow';
        this.group.visible = false;
        this.group.renderOrder = 0;

        this._enabled = !!enabled;
        this._settings = {
            intensity: 0.4,
            radius: 0.9,
            softness: 0.75,
            maxDistance: 0.75
        };

        this._targetModel = null;
        this._targetRoot = null;
        this._raycastRoot = null;

        this._wheelRig = null;
        this._wheelPivots = [];
        this._wheelRadius = 0.55;

        this._raycaster = new THREE.Raycaster();
        this._raycaster.far = 50;
        this._tmpPos = new THREE.Vector3();
        this._tmpHitPos = new THREE.Vector3();
        this._tmpNormal = new THREE.Vector3();
        this._tmpQuat = new THREE.Quaternion();
        this._up = new THREE.Vector3(0, 1, 0);
        this._down = new THREE.Vector3(0, -1, 0);

        this._geometry = new THREE.PlaneGeometry(1, 1, 1, 1);
        this._geometry.rotateX(-Math.PI / 2);

        this._blobs = [];

        this.setSettings(settings);
        this.setEnabled(enabled);
    }

    setEnabled(enabled) {
        this._enabled = !!enabled;
        this.group.visible = this._enabled;
    }

    setSettings(settings) {
        const src = settings && typeof settings === 'object' ? settings : {};
        this._settings = {
            intensity: clamp(src.intensity, 0, 2, 0.4),
            radius: clamp(src.radius, 0.05, 5, 0.9),
            softness: clamp(src.softness, 0.02, 1, 0.75),
            maxDistance: clamp(src.maxDistance, 0, 5, 0.75)
        };

        for (const blob of this._blobs) {
            const mat = blob?.mesh?.material ?? null;
            if (!mat?.uniforms) continue;
            if (mat.uniforms.uSoftness) mat.uniforms.uSoftness.value = this._settings.softness;
        }
    }

    setTarget(busModel) {
        const model = busModel?.isObject3D ? busModel : null;
        if (model === this._targetModel) return;
        this._targetModel = model;
        this._targetRoot = null;
        this._syncTargetWheelRig();
    }

    setRaycastRoot(root) {
        this._raycastRoot = root?.isObject3D ? root : null;
    }

    _syncTargetWheelRig() {
        const model = this._targetModel ?? null;
        const wheelRig = getWheelRig(model);
        const pivots = collectWheelPivots(wheelRig);

        const same = wheelRig === this._wheelRig
            && pivots.length === this._wheelPivots.length
            && pivots.every((p, i) => p === this._wheelPivots[i]);
        if (same) return;

        this._wheelRig = wheelRig;
        this._wheelPivots = pivots;
        this._wheelRadius = clamp(wheelRig?.wheelRadius, 0.05, 5, 0.55);
        this._rebuildBlobs();
    }

    _rebuildBlobs() {
        for (const blob of this._blobs) {
            blob?.mesh?.removeFromParent?.();
            blob?.mesh?.material?.dispose?.();
        }
        this._blobs.length = 0;

        for (const pivot of this._wheelPivots) {
            const mat = createBlobMaterial({ intensity: 0, softness: this._settings.softness });
            const mesh = new THREE.Mesh(this._geometry, mat);
            mesh.name = 'ContactShadowBlob';
            mesh.visible = false;
            mesh.castShadow = false;
            mesh.receiveShadow = false;
            mesh.userData.isContactShadow = true;
            this.group.add(mesh);
            this._blobs.push({
                kind: 'wheel',
                pivot,
                mesh,
                smoothPos: new THREE.Vector3(),
                smoothNormal: new THREE.Vector3(0, 1, 0),
                initialized: false
            });
        }

        if (this._targetModel?.isObject3D) {
            const mat = createBlobMaterial({ intensity: 0, softness: this._settings.softness });
            const mesh = new THREE.Mesh(this._geometry, mat);
            mesh.name = 'ContactShadowChassis';
            mesh.visible = false;
            mesh.castShadow = false;
            mesh.receiveShadow = false;
            mesh.userData.isContactShadow = true;
            this.group.add(mesh);
            this._blobs.push({
                kind: 'chassis',
                pivot: this._targetModel,
                mesh,
                smoothPos: new THREE.Vector3(),
                smoothNormal: new THREE.Vector3(0, 1, 0),
                initialized: false
            });
        }
    }

    _getBusRoot() {
        const model = this._targetModel ?? null;
        if (!model) return null;
        if (this._targetRoot && this._targetRoot.isObject3D) return this._targetRoot;

        const parent = model.parent ?? null;
        this._targetRoot = parent?.isObject3D ? parent : model;
        return this._targetRoot;
    }

    _pickGroundHit(hits, busRoot) {
        if (!Array.isArray(hits) || !hits.length) return null;
        for (const hit of hits) {
            const obj = hit?.object ?? null;
            if (!obj) continue;
            if (obj.userData?.isContactShadow === true) continue;
            if (isDescendantOf(obj, busRoot)) continue;
            return hit;
        }
        return null;
    }

    update(dt) {
        const enabled = this._enabled;
        if (!enabled) {
            this.group.visible = false;
            return;
        }

        const busModel = this._targetModel ?? null;
        const raycastRoot = this._raycastRoot ?? null;
        if (!busModel || !raycastRoot) {
            this.group.visible = false;
            return;
        }

        this._syncTargetWheelRig();

        const busRoot = this._getBusRoot();
        if (!busRoot) {
            this.group.visible = false;
            return;
        }

        const radius = this._settings.radius;
        const maxDistance = this._settings.maxDistance;
        const baseIntensity = this._settings.intensity;
        const softness = this._settings.softness;

        const tau = 0.06;
        const k = 1 - Math.exp(-Math.max(0, Number(dt) || 0) / tau);

        const ray = this._raycaster;
        ray.far = 50;

        let any = false;
        let wheelFadeSum = 0;
        let wheelFadeCount = 0;

        for (const blob of this._blobs) {
            const pivot = blob.pivot ?? null;
            const mesh = blob.mesh ?? null;
            const mat = mesh?.material ?? null;
            if (!pivot?.getWorldPosition || !mesh || !mat?.uniforms) continue;

            pivot.getWorldPosition(this._tmpPos);
            ray.set(this._tmpPos, this._down);

            const hits = ray.intersectObject(raycastRoot, true);
            const hit = this._pickGroundHit(hits, busRoot);
            if (!hit) {
                mesh.visible = false;
                continue;
            }

            let fade = 1;
            let intensity = baseIntensity;
            let blobRadius = radius;
            let blobSoftness = softness;

            if (blob.kind === 'wheel') {
                const d = Number.isFinite(hit.distance) ? hit.distance : Infinity;
                const lift = Math.max(0, d - this._wheelRadius);
                fade = maxDistance > 1e-6 ? clamp(1 - (lift / maxDistance), 0, 1, 0) : (lift <= 1e-6 ? 1 : 0);
                wheelFadeSum += fade;
                wheelFadeCount += 1;
                intensity = baseIntensity * fade;
            } else {
                const avgWheelFade = wheelFadeCount ? (wheelFadeSum / wheelFadeCount) : 1;
                fade = avgWheelFade;
                intensity = baseIntensity * 0.55 * fade;
                blobRadius = radius * 2.25;
                blobSoftness = clamp(softness * 1.1, 0.02, 1, softness);
            }

            mat.uniforms.uIntensity.value = intensity;
            mat.uniforms.uSoftness.value = blobSoftness;

            if (!(intensity > 1e-4)) {
                mesh.visible = false;
                continue;
            }

            const n = hit.face?.normal ?? null;
            if (n?.isVector3) {
                this._tmpNormal.copy(n).transformDirection(hit.object.matrixWorld).normalize();
            } else if (hit.normal?.isVector3) {
                this._tmpNormal.copy(hit.normal).normalize();
            } else {
                this._tmpNormal.set(0, 1, 0);
            }

            const offset = 0.02;
            this._tmpHitPos.copy(hit.point).addScaledVector(this._tmpNormal, offset);

            if (!blob.initialized) {
                blob.smoothPos.copy(this._tmpHitPos);
                blob.smoothNormal.copy(this._tmpNormal);
                blob.initialized = true;
            } else {
                blob.smoothPos.lerp(this._tmpHitPos, k);
                blob.smoothNormal.lerp(this._tmpNormal, k).normalize();
            }

            mesh.position.copy(blob.smoothPos);
            this._tmpQuat.setFromUnitVectors(this._up, blob.smoothNormal);
            mesh.quaternion.copy(this._tmpQuat);
            mesh.scale.set(blobRadius * 2, 1, blobRadius * 2);
            mesh.visible = true;
            any = true;
        }

        this.group.visible = any;
    }

    dispose() {
        for (const blob of this._blobs) {
            blob?.mesh?.removeFromParent?.();
            blob?.mesh?.material?.dispose?.();
        }
        this._blobs.length = 0;
        this._geometry?.dispose?.();
    }
}
