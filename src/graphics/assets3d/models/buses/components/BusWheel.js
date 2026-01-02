// src/graphics/assets3d/models/buses/components/BusWheel.js
import * as THREE from 'three';

// Re-export the canonical WheelRig implementation (avoid duplicate classes,
// and keep backwards-compatible imports that might do:
//   import { WheelRig } from './BusWheel.js'
export { WheelRig } from './WheelRig.js';

function matsDefault() {
    return {
        tire: new THREE.MeshStandardMaterial({
            color: 0x141518,
            roughness: 0.98,
            metalness: 0.0
        }),
        sidewallOuter: new THREE.MeshStandardMaterial({
            color: 0x111215,
            roughness: 0.98,
            metalness: 0.0,
            side: THREE.DoubleSide
        }),
        sidewallInner: new THREE.MeshStandardMaterial({
            color: 0x0c0d10,
            roughness: 0.98,
            metalness: 0.0,
            side: THREE.DoubleSide
        }),
        rimOuter: new THREE.MeshStandardMaterial({
            color: 0xb3bcc9,
            roughness: 0.32,
            metalness: 0.80,
            side: THREE.DoubleSide
        }),
        rimInner: new THREE.MeshStandardMaterial({
            color: 0x242a33,
            roughness: 0.65,
            metalness: 0.25,
            side: THREE.DoubleSide
        }),
        hub: new THREE.MeshStandardMaterial({
            color: 0x2a2f38,
            roughness: 0.45,
            metalness: 0.62,
            side: THREE.DoubleSide
        })
    };
}

function shadowAll(o) {
    o.traverse((x) => {
        if (x.isMesh) {
            x.castShadow = true;
            x.receiveShadow = true;
        }
    });
}

/**
 * Wheel conventions:
 * - Wheel axis is X
 * - Outer side is +X
 * - For LEFT wheels: set wheel.root.rotation.y = Math.PI (so outer remains outward)
 */
export function createBusWheel({
                                   radius = 0.56,
                                   width = 0.30,
                                   mats = null
                               } = {}) {
    const M = mats ?? matsDefault();

    const root = new THREE.Group();
    root.name = 'wheel_root';

    const steerPivot = new THREE.Group();
    steerPivot.name = 'wheel_steer';

    const rollPivot = new THREE.Group();
    rollPivot.name = 'wheel_roll';

    root.add(steerPivot);
    steerPivot.add(rollPivot);

    const treadW = width * 0.72;
    const shoulderW = (width - treadW) / 2;

    // --- TREAD (curved surface only, no end caps) ---
    const treadGeo = new THREE.CylinderGeometry(
        radius * 0.99,
        radius * 0.99,
        treadW,
        32,
        1,
        true
    );
    treadGeo.rotateZ(Math.PI / 2); // axis -> X
    const tread = new THREE.Mesh(treadGeo, M.tire);
    rollPivot.add(tread);

    // --- SHOULDERS (rounded corners) ---
    const shoulderTube = Math.max(0.02, shoulderW * 0.55);
    const shoulderMajor = radius * 0.93;

    const torusGeo = new THREE.TorusGeometry(shoulderMajor, shoulderTube, 14, 36);
    torusGeo.rotateY(Math.PI / 2); // torus axis -> X

    const shOut = new THREE.Mesh(torusGeo, M.tire);
    shOut.position.x = +treadW / 2 + shoulderW * 0.25;
    rollPivot.add(shOut);

    const shIn = new THREE.Mesh(torusGeo, M.tire);
    shIn.position.x = -treadW / 2 - shoulderW * 0.25;
    rollPivot.add(shIn);

    // --- SIDEWALL DISCS ---
    const sideR = radius * 0.985;
    const sideGeo = new THREE.CircleGeometry(sideR, 42);

    const sideOuter = new THREE.Mesh(sideGeo, M.sidewallOuter);
    sideOuter.rotation.y = Math.PI / 2;
    sideOuter.position.x = width / 2 - 0.002;
    rollPivot.add(sideOuter);

    const sideInner = new THREE.Mesh(sideGeo, M.sidewallInner);
    sideInner.rotation.y = -Math.PI / 2;
    sideInner.position.x = -width / 2 + 0.002;
    rollPivot.add(sideInner);

    // --- RIM ---
    const rimR = radius * 0.62;
    const rimW = treadW * 0.92;

    const rimBarrelGeo = new THREE.CylinderGeometry(rimR, rimR, rimW, 28, 1, true);
    rimBarrelGeo.rotateZ(Math.PI / 2);
    const rimBarrel = new THREE.Mesh(rimBarrelGeo, M.rimOuter);
    rollPivot.add(rimBarrel);

    const rimFaceGeo = new THREE.CircleGeometry(rimR * 0.98, 30);

    const rimOuter = new THREE.Mesh(rimFaceGeo, M.rimOuter);
    rimOuter.rotation.y = Math.PI / 2;
    rimOuter.position.x = rimW / 2 - 0.004;
    rollPivot.add(rimOuter);

    const rimInner = new THREE.Mesh(rimFaceGeo, M.rimInner);
    rimInner.rotation.y = -Math.PI / 2;
    rimInner.position.x = -rimW / 2 + 0.004;
    rollPivot.add(rimInner);

    // --- HUB ---
    const hubGeo = new THREE.CylinderGeometry(rimR * 0.42, rimR * 0.42, rimW * 0.9, 22, 1, false);
    hubGeo.rotateZ(Math.PI / 2);
    const hub = new THREE.Mesh(hubGeo, M.hub);
    rollPivot.add(hub);

    // Lug nuts
    const lugGeo = new THREE.CylinderGeometry(0.03, 0.03, rimW * 0.55, 10);
    lugGeo.rotateZ(Math.PI / 2);
    for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const lug = new THREE.Mesh(lugGeo, M.hub);
        lug.position.set(0, Math.cos(a) * rimR * 0.32, Math.sin(a) * rimR * 0.32);
        rollPivot.add(lug);
    }

    // Rotation marker (clue)
    const markerMat = new THREE.MeshStandardMaterial({
        color: 0xf2f2f2,
        roughness: 0.35,
        metalness: 0.05
    });
    const markerGeo = new THREE.BoxGeometry(
        Math.max(0.004, width * 0.018),
        Math.max(0.03, radius * 0.14),
        Math.max(0.02, radius * 0.06)
    );

    const marker = new THREE.Mesh(markerGeo, markerMat);
    marker.name = 'wheel_marker';
    marker.position.set(Math.max(0, width / 2 - 0.006), radius * 0.55, 0);
    rollPivot.add(marker);

    shadowAll(root);
    return { root, steerPivot, rollPivot };
}
