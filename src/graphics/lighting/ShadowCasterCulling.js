// src/graphics/lighting/ShadowCasterCulling.js
// Switches `castShadow` off for casters that cannot cast into the view.
//
// three culls shadow casters only against the shadow camera's own box, so the
// far cascades -- whose boxes span hundreds of metres -- redraw the whole city
// every frame, including everything behind the camera. Roughly two thirds of
// the cascaded shadow cost is that waste.
//
// A caster matters only if the volume its shadow can occupy reaches the view.
// That volume is the caster's bounding sphere swept along the anti-sun
// direction by its own shadow length (height / tan(elevation)); the sweep's
// bounding sphere is tested against the camera frustum. The test is
// deliberately conservative -- keeping a caster that turned out not to matter
// costs one draw call, dropping one that did makes a shadow pop in.
// @ts-check

import * as THREE from 'three';

const MAX_SHADOW_LENGTH_METERS = 260;
const MIN_SUN_ELEVATION_RAD = 0.12;

export class ShadowCasterCuller {
    /**
     * @param {object} [options]
     * @param {number} [options.paddingMeters] Slack added to every test sphere.
     */
    constructor({ paddingMeters = 10 } = {}) {
        this.paddingMeters = paddingMeters;
        /** @type {Array<{ mesh: any, center: THREE.Vector3, radius: number, top: number }>} */
        this._entries = [];
        /** @type {Set<any>} */
        this._roots = new Set();
        this._frustum = new THREE.Frustum();
        this._projScreen = new THREE.Matrix4();
        this._cullCamera = new THREE.PerspectiveCamera();
        this._sphere = new THREE.Sphere();
        this._offset = new THREE.Vector3();
        this._center = new THREE.Vector3();
        this._down = new THREE.Vector3();
        this.stats = { total: 0, kept: 0, culled: 0 };
        this._active = false;
    }

    /**
     * Index a subtree's static casters. World bounding spheres are cached: the
     * city does not move, and recomputing 2000+ of them per frame would cost
     * more than the draw calls this saves. Call again after a rebuild.
     */
    addRoot(root) {
        if (!root?.traverse || this._roots.has(root)) return;
        this._roots.add(root);
        root.updateMatrixWorld?.(true);
        root.traverse((o) => {
            if (!o?.isMesh || !o.castShadow || !o.geometry) return;
            // An InstancedMesh's *geometry* sphere covers one instance sitting
            // at the origin, not the spread of all of them -- using it would
            // cull whole blocks of instanced facade detail. InstancedMesh keeps
            // its own sphere over every instance; ask for that instead.
            let bs = null;
            if (o.isInstancedMesh) {
                if (!o.boundingSphere) o.computeBoundingSphere();
                bs = o.boundingSphere;
            }
            if (!bs) {
                if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
                bs = o.geometry.boundingSphere;
            }
            if (!bs) return;
            const center = bs.center.clone().applyMatrix4(o.matrixWorld);
            // Uniform-ish scale assumption: take the largest axis length.
            const e = o.matrixWorld.elements;
            const scale = Math.sqrt(Math.max(
                e[0] * e[0] + e[1] * e[1] + e[2] * e[2],
                e[4] * e[4] + e[5] * e[5] + e[6] * e[6],
                e[8] * e[8] + e[9] * e[9] + e[10] * e[10]
            )) || 1;
            const radius = bs.radius * scale;
            this._entries.push({ mesh: o, center, radius, top: center.y + radius });
        });
        this.stats.total = this._entries.length;
    }

    /** Forget every indexed caster, restoring each one's shadow casting. */
    clear() {
        this.restore();
        this._entries.length = 0;
        this._roots.clear();
        this.stats = { total: 0, kept: 0, culled: 0 };
    }

    /** Re-enable shadow casting everywhere (mode switch, teardown, debug). */
    restore() {
        for (const entry of this._entries) entry.mesh.castShadow = true;
        this._active = false;
        this.stats.kept = this.stats.total;
        this.stats.culled = 0;
    }

    /**
     * @param {THREE.Camera} camera Scene camera.
     * @param {THREE.Vector3} sunDirection Unit vector pointing at the sun.
     * @param {number} maxFar Shadow horizon; nothing past it can matter.
     */
    update(camera, sunDirection, maxFar) {
        if (!camera?.isPerspectiveCamera || !sunDirection || !this._entries.length) return;

        // Frustum of what the shadows can actually land in: the view, clipped
        // to the shadow horizon.
        const cull = this._cullCamera;
        cull.fov = camera.fov;
        cull.aspect = camera.aspect;
        cull.near = camera.near;
        cull.far = Math.max(camera.near + 1, maxFar);
        cull.position.copy(camera.position);
        cull.quaternion.copy(camera.quaternion);
        cull.updateMatrixWorld(true);
        cull.updateProjectionMatrix();
        this._projScreen.multiplyMatrices(cull.projectionMatrix, cull.matrixWorldInverse);
        this._frustum.setFromProjectionMatrix(this._projScreen);

        // How far a shadow runs along the ground per metre of caster height.
        const elevation = Math.max(MIN_SUN_ELEVATION_RAD, Math.atan2(sunDirection.y, Math.hypot(sunDirection.x, sunDirection.z)));
        const lengthPerMeter = 1 / Math.tan(elevation);
        this._down.set(-sunDirection.x, 0, -sunDirection.z);
        if (this._down.lengthSq() < 1e-8) this._down.set(0, 0, -1);
        this._down.normalize();

        let kept = 0;
        for (const entry of this._entries) {
            // Shadow length driven by the caster's own height above ground.
            const shadowLength = Math.min(MAX_SHADOW_LENGTH_METERS, Math.max(0, entry.top) * lengthPerMeter);
            // Bounding sphere of the swept capsule: midpoint of the sweep,
            // radius grown by half the sweep length.
            this._offset.copy(this._down).multiplyScalar(shadowLength * 0.5);
            this._center.copy(entry.center).add(this._offset);
            this._sphere.center.copy(this._center);
            this._sphere.radius = entry.radius + shadowLength * 0.5 + this.paddingMeters;

            const visible = this._frustum.intersectsSphere(this._sphere);
            entry.mesh.castShadow = visible;
            if (visible) kept++;
        }

        this._active = true;
        this.stats.kept = kept;
        this.stats.culled = this._entries.length - kept;
    }
}
