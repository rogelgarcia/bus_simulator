// graphics/assets3d/models/buses/CoachBus.js
import * as THREE from 'three';
import { createBusWheel } from './components/BusWheel.js';
import { WheelRig } from './components/WheelRig.js';
import { attachBusSkeleton } from '../../../../src/skeletons/buses/BusSkeleton.js';

function applyShadows(group) {
    group.traverse((o) => {
        if (o.isMesh) {
            o.castShadow = true;
            o.receiveShadow = true;
        }
    });
}

function makeMaterials(baseColor) {
    const body = new THREE.MeshStandardMaterial({
        color: baseColor,
        roughness: 0.42,
        metalness: 0.14
    });

    const trim = new THREE.MeshStandardMaterial({
        color: 0x101010,
        roughness: 0.85,
        metalness: 0.1
    });

    // clearer glass vs old (still simple)
    const glass = new THREE.MeshPhysicalMaterial({
        color: 0x7ecbff,
        roughness: 0.10,
        metalness: 0.0,
        transmission: 0.85,
        thickness: 0.03,
        ior: 1.45,
        transparent: true,
        opacity: 1.0,
        clearcoat: 1.0,
        clearcoatRoughness: 0.28
    });
    glass.depthWrite = false;
    glass.envMapIntensity = 0.8;

    // IMPORTANT: lights start OFF (emissiveIntensity 0),
    // BusSkeleton turns them on/off.
    const headLightMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0xffffff,
        emissiveIntensity: 0.0,
        roughness: 0.2,
        metalness: 0.0
    });

    const brakeLightMat = new THREE.MeshStandardMaterial({
        color: 0x220808,
        emissive: 0xff2222,
        emissiveIntensity: 0.0,
        roughness: 0.35,
        metalness: 0.0
    });

    return { body, trim, glass, headLightMat, brakeLightMat };
}

export function createCoachBus(spec) {
    const mats = makeMaterials(spec.color);

    const width = 2.7;
    const height = 3.2;
    const length = 9.4;

    const wheelR = 0.55;
    const wheelW = 0.30;

    const axleFront = length * 0.30;
    const axleRear = -length * 0.30;

    // tucked slightly inside
    const wheelX = width / 2 - (wheelW / 2) + 0.02;

    const bus = new THREE.Group();
    bus.userData.type = 'bus';
    bus.userData.id = spec.id;
    bus.name = `bus_${spec.id}`;

    // Body (box)
    const body = new THREE.Mesh(new THREE.BoxGeometry(width, height, length), mats.body);
    body.position.y = wheelR + height / 2;
    bus.add(body);

    // Big coach windows
    const winH = height * 0.50;
    const windows = new THREE.Mesh(
        new THREE.BoxGeometry(width * 0.92, winH, length * 0.78),
        mats.glass
    );
    windows.position.y = wheelR + height * 0.63;
    windows.position.z = -length * 0.04;
    bus.add(windows);

    // Front windshield
    const frontGlass = new THREE.Mesh(
        new THREE.BoxGeometry(width * 0.86, winH * 0.95, 0.10),
        mats.glass
    );
    frontGlass.position.set(0, wheelR + height * 0.63, length / 2 - 0.05);
    bus.add(frontGlass);

    // Lower trim / luggage bay vibe
    const lowerTrim = new THREE.Mesh(
        new THREE.BoxGeometry(width * 0.98, height * 0.26, length * 0.94),
        mats.trim
    );
    lowerTrim.position.y = wheelR + height * 0.16;
    bus.add(lowerTrim);

    // Roof AC unit
    const ac = new THREE.Mesh(
        new THREE.BoxGeometry(width * 0.50, 0.22, length * 0.28),
        mats.trim
    );
    ac.position.set(0, wheelR + height + 0.14, -length * 0.10);
    bus.add(ac);

    // Headlight housings (trim) + lens (emissive controlled by skeleton)
    const headHousingGeo = new THREE.BoxGeometry(0.26, 0.16, 0.10);
    const headLensGeo = new THREE.BoxGeometry(0.20, 0.12, 0.06);

    const hhL = new THREE.Mesh(headHousingGeo, mats.trim);
    hhL.position.set(-width * 0.28, wheelR + height * 0.18, length / 2 - 0.03);
    bus.add(hhL);

    const hhR = hhL.clone();
    hhR.position.x = width * 0.28;
    bus.add(hhR);

    const headL = new THREE.Mesh(headLensGeo, mats.headLightMat);
    headL.name = 'headlight_L';
    headL.position.set(-width * 0.28, wheelR + height * 0.18, length / 2 - 0.005);

    const headR = headL.clone();
    headR.name = 'headlight_R';
    headR.position.x = width * 0.28;

    bus.add(headL, headR);

    // Brake lights (rear)
    const brakeGeo = new THREE.BoxGeometry(0.20, 0.12, 0.06);

    const brakeL = new THREE.Mesh(brakeGeo, mats.brakeLightMat);
    brakeL.name = 'brakelight_L';
    brakeL.position.set(-width * 0.30, wheelR + height * 0.24, -length / 2 + 0.03);

    const brakeR = brakeL.clone();
    brakeR.name = 'brakelight_R';
    brakeR.position.x = width * 0.30;

    bus.add(brakeL, brakeR);

    // Wheels (modular) + WheelRig (steer/spin control)
    const rig = new WheelRig({ wheelRadius: wheelR });

    const wFR = createBusWheel({ radius: wheelR, width: wheelW });
    wFR.root.position.set(wheelX, wheelR, axleFront);
    bus.add(wFR.root);
    rig.addWheel({ rollPivot: wFR.rollPivot, steerPivot: wFR.steerPivot, isFront: true });

    const wRR = createBusWheel({ radius: wheelR, width: wheelW });
    wRR.root.position.set(wheelX, wheelR, axleRear);
    bus.add(wRR.root);
    rig.addWheel({ rollPivot: wRR.rollPivot, isFront: false });

    const wFL = createBusWheel({ radius: wheelR, width: wheelW });
    wFL.root.position.set(-wheelX, wheelR, axleFront);
    wFL.root.rotation.y = Math.PI;
    bus.add(wFL.root);
    rig.addWheel({ rollPivot: wFL.rollPivot, steerPivot: wFL.steerPivot, isFront: true });

    const wRL = createBusWheel({ radius: wheelR, width: wheelW });
    wRL.root.position.set(-wheelX, wheelR, axleRear);
    wRL.root.rotation.y = Math.PI;
    bus.add(wRL.root);
    rig.addWheel({ rollPivot: wRL.rollPivot, isFront: false });

    // Register for skeleton
    bus.userData.wheelRig = rig;
    bus.userData.parts = {
        headlights: [headL, headR],
        brakeLights: [brakeL, brakeR]
    };

    // Attach the interface the engine talks to
    attachBusSkeleton(bus, { wheelRig: rig, parts: bus.userData.parts });

    applyShadows(bus);
    return bus;
}
