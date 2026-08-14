// src/graphics/assets3d/models/environment/GarageModel.js
import * as THREE from 'three';
import { getGarageTextures } from './ProceduralTextures.js';

function matStd({
                    color,
                    roughness = 0.9,
                    metalness = 0.05,
                    map = null,
                    bumpMap = null,
                    bumpScale = 0.0,
                    roughnessMap = null,
                    side = THREE.FrontSide
                }) {
    return new THREE.MeshStandardMaterial({
        color,
        roughness,
        metalness,
        map,
        bumpMap,
        bumpScale,
        roughnessMap,
        side
    });
}

function emissiveMat({ emissive = 0xffffff, intensity = 2.0, color = 0xffffff }) {
    return new THREE.MeshStandardMaterial({
        color,
        roughness: 0.25,
        metalness: 0.0,
        emissive,
        emissiveIntensity: intensity
    });
}

function cloneTex(tex) {
    if (!tex) return null;
    const t = tex.clone();
    t.needsUpdate = true;
    return t;
}

function setRepeatSafe(tex, x, y) {
    if (!tex) return;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(x, y);
}

function addFloorMark(root, {
    x = 0,
    z = 0,
    length = 18,
    width = 0.18,
    rotZ = 0,
    color = 0xffcc00,
    opacity = 0.24
} = {}) {
    const mat = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.35,
        metalness: 0.02,
        transparent: true,
        opacity
    });

    const geo = new THREE.PlaneGeometry(length, width);
    const m = new THREE.Mesh(geo, mat);
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = rotZ;
    m.position.set(x, 0.012, z);
    m.receiveShadow = true;
    root.add(m);
}

function addBeam(root, { x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, mat }) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
    return mesh;
}

function addBox(parent, { x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, mat, rotY = 0 }) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
    mesh.position.set(x, y, z);
    mesh.rotation.y = rotY;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
}

function createRollUpGate({ width, height, depth, matMetal, matFrame }) {
    const g = new THREE.Group();
    g.name = 'rollup_gate';

    const gateW = width * 0.66;
    const gateH = height * 0.78;
    const backZ = -depth / 2 + 0.35;

    addBeam(g, { x: -gateW / 2 - 0.35, y: (gateH + 0.9) / 2, z: backZ, sx: 0.6, sy: gateH + 0.9, sz: 0.8, mat: matFrame });
    addBeam(g, { x:  gateW / 2 + 0.35, y: (gateH + 0.9) / 2, z: backZ, sx: 0.6, sy: gateH + 0.9, sz: 0.8, mat: matFrame });
    addBeam(g, { x: 0, y: gateH + 0.75, z: backZ, sx: gateW + 1.8, sy: 0.6, sz: 0.8, mat: matFrame });

    const slatCount = 28;
    const slatH = (gateH - 0.9) / slatCount;
    const slatGeo = new THREE.BoxGeometry(gateW, slatH * 0.86, 0.22);

    for (let i = 0; i < slatCount; i++) {
        const slat = new THREE.Mesh(slatGeo, matMetal);
        slat.position.set(0, 0.45 + i * slatH, backZ + 0.2);
        slat.castShadow = true;
        slat.receiveShadow = true;
        g.add(slat);
    }

    const stripeA = new THREE.Mesh(
        new THREE.BoxGeometry(gateW + 1.3, 0.16, 0.28),
        matStd({ color: 0xffcc00, roughness: 0.55, metalness: 0.05 })
    );
    stripeA.position.set(0, 0.18, backZ + 0.36);
    stripeA.receiveShadow = true;
    g.add(stripeA);

    return g;
}

function addRoundCeilingLight(root, lights, {
    x, y, z,
    intensity = 10,
    color = 0xd8ecff,
    castShadow = false
}) {
    const fixture = new THREE.Group();

    const stem = new THREE.Mesh(
        new THREE.CylinderGeometry(0.10, 0.10, 0.26, 14),
        matStd({ color: 0x0f141e, roughness: 0.55, metalness: 0.25 })
    );
    stem.position.y = 0.16;
    stem.castShadow = true;
    fixture.add(stem);

    // Flat puck hanging under the ceiling, lens facing straight down.
    const rim = new THREE.Mesh(
        new THREE.CylinderGeometry(0.95, 0.88, 0.14, 44),
        matStd({ color: 0x0f141e, roughness: 0.55, metalness: 0.25 })
    );
    rim.castShadow = true;
    rim.receiveShadow = true;
    fixture.add(rim);

    const lens = new THREE.Mesh(
        new THREE.CircleGeometry(0.76, 44),
        emissiveMat({ emissive: color, intensity: 3.2, color: 0xffffff })
    );
    lens.rotation.x = Math.PI / 2;
    lens.position.y = -0.075;
    fixture.add(lens);

    fixture.position.set(x, y, z);
    root.add(fixture);

    const down = new THREE.SpotLight(color, intensity, 80, Math.PI / 3.2, 0.6, 1.1);
    down.position.set(x, y, z);

    const target = new THREE.Object3D();
    target.position.set(x, 0.18, z);
    root.add(target);
    down.target = target;

    down.castShadow = !!castShadow;
    if (down.castShadow) {
        down.shadow.mapSize.set(1024, 1024);
        down.shadow.bias = -0.00025;
    }

    lights.push(down);

    // Local spill so the fixture lights the ceiling and beams around it.
    const spill = new THREE.PointLight(color, 1.3, 16, 1.8);
    spill.position.set(x, y - 0.3, z);
    lights.push(spill);
}

function addWallBattenLamp(root, lights, {
    x, y, z,
    side = 'left',
    length = 3.2,
    lightColor = 0xfff0d8,
    castShadow = false
}) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = side === 'left' ? 0 : Math.PI;

    const matFrame = matStd({ color: 0x131a26, roughness: 0.6, metalness: 0.3 });
    const matTube = emissiveMat({ emissive: lightColor, intensity: 3.4, color: 0xffffff });

    // Housing runs horizontally along the wall with a bracket at each end.
    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.24, length + 0.24), matFrame);
    housing.position.set(0.10, 0, 0);
    housing.castShadow = true;
    housing.receiveShadow = true;
    g.add(housing);

    const bracketGeo = new THREE.BoxGeometry(0.10, 0.16, 0.10);
    for (const zc of [-length / 2, length / 2]) {
        const bracket = new THREE.Mesh(bracketGeo, matFrame);
        bracket.position.set(0.03, 0, zc);
        bracket.castShadow = true;
        bracket.receiveShadow = true;
        g.add(bracket);
    }

    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, length, 22), matTube);
    tube.rotation.x = Math.PI / 2;
    tube.position.set(0.21, -0.03, 0);
    g.add(tube);

    const capGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.05, 14);
    for (const zc of [-length / 2 - 0.02, length / 2 + 0.02]) {
        const cap = new THREE.Mesh(capGeo, matFrame);
        cap.rotation.x = Math.PI / 2;
        cap.position.set(0.21, -0.03, zc);
        cap.castShadow = true;
        g.add(cap);
    }

    root.add(g);

    const spot = new THREE.SpotLight(lightColor, 4.4, 32, Math.PI / 5.0, 0.8, 1.5);
    spot.position.set(x + (side === 'left' ? 0.4 : -0.4), y, z);

    const target = new THREE.Object3D();
    target.position.set(
        x + (side === 'left' ? 4.2 : -4.2),
        Math.max(0.6, y - 3.4),
        z
    );
    root.add(target);
    spot.target = target;

    spot.castShadow = !!castShadow;
    if (spot.castShadow) {
        spot.shadow.mapSize.set(512, 512);
        spot.shadow.bias = -0.0002;
    }
    lights.push(spot);

    const p = new THREE.PointLight(lightColor, 1.5, 10, 2);
    p.position.set(x + (side === 'left' ? 0.4 : -0.4), y, z);
    lights.push(p);
}

function createShelvingRack({ width = 3.6, height = 3.3, depth = 1.05 } = {}) {
    const g = new THREE.Group();
    g.name = 'shelving_rack';

    const matUpright = matStd({ color: 0x2e5f8a, roughness: 0.6, metalness: 0.35 });
    const matShelf = matStd({ color: 0xb8bcc2, roughness: 0.55, metalness: 0.4 });
    const boxMats = [
        matStd({ color: 0x8a6b4a, roughness: 0.9, metalness: 0.02 }),
        matStd({ color: 0x9b7c58, roughness: 0.9, metalness: 0.02 }),
        matStd({ color: 0x5d6b75, roughness: 0.85, metalness: 0.05 })
    ];

    for (const sx of [-width / 2, width / 2]) {
        for (const sz of [-depth / 2, depth / 2]) {
            addBox(g, { x: sx, y: height / 2, z: sz, sx: 0.09, sy: height, sz: 0.09, mat: matUpright });
        }
    }

    const shelfYs = [0.32, 1.45, 2.55];
    for (const sy of shelfYs) {
        addBox(g, { x: 0, y: sy, z: 0, sx: width - 0.05, sy: 0.07, sz: depth, mat: matShelf });
    }

    const boxSpecs = [
        { x: -1.05, shelf: 0, sx: 0.85, sy: 0.62, sz: 0.7, m: 0 },
        { x:  0.25, shelf: 0, sx: 1.1,  sy: 0.5,  sz: 0.75, m: 1 },
        { x:  1.2,  shelf: 0, sx: 0.6,  sy: 0.72, sz: 0.6, m: 2 },
        { x: -0.9,  shelf: 1, sx: 1.0,  sy: 0.55, sz: 0.72, m: 1 },
        { x:  0.75, shelf: 1, sx: 0.9,  sy: 0.42, sz: 0.66, m: 0 },
        { x: -1.15, shelf: 2, sx: 0.62, sy: 0.5,  sz: 0.6, m: 2 },
        { x:  0.35, shelf: 2, sx: 1.15, sy: 0.4,  sz: 0.7, m: 0 }
    ];
    for (const s of boxSpecs) {
        const shelfY = shelfYs[s.shelf];
        addBox(g, { x: s.x, y: shelfY + 0.035 + s.sy / 2, z: 0, sx: s.sx, sy: s.sy, sz: s.sz, mat: boxMats[s.m], rotY: (s.x * 7.3) % 0.14 });
    }

    return g;
}

function createWorkbench() {
    const g = new THREE.Group();
    g.name = 'workbench';

    const matTop = matStd({ color: 0x8a6a44, roughness: 0.8, metalness: 0.02 });
    const matLeg = matStd({ color: 0x1d2530, roughness: 0.6, metalness: 0.35 });
    const matBoard = matStd({ color: 0x4b5563, roughness: 0.85, metalness: 0.08 });
    const matTool = matStd({ color: 0xb43c30, roughness: 0.55, metalness: 0.2 });
    const matSteel = matStd({ color: 0x9aa2ab, roughness: 0.45, metalness: 0.6 });

    addBox(g, { x: 0, y: 0.94, z: 0, sx: 2.7, sy: 0.09, sz: 0.95, mat: matTop });
    addBox(g, { x: 0, y: 0.42, z: 0, sx: 2.5, sy: 0.05, sz: 0.85, mat: matLeg });
    for (const sx of [-1.2, 1.2]) {
        for (const sz of [-0.38, 0.38]) {
            addBox(g, { x: sx, y: 0.47, z: sz, sx: 0.08, sy: 0.94, sz: 0.08, mat: matLeg });
        }
    }

    // Pegboard with a few hung tools.
    addBox(g, { x: 0, y: 1.85, z: -0.52, sx: 2.7, sy: 1.35, sz: 0.05, mat: matBoard });
    addBox(g, { x: -0.95, y: 1.95, z: -0.47, sx: 0.09, sy: 0.55, sz: 0.05, mat: matTool });
    addBox(g, { x: -0.55, y: 1.85, z: -0.47, sx: 0.3, sy: 0.09, sz: 0.05, mat: matSteel });
    addBox(g, { x: -0.05, y: 2.0, z: -0.47, sx: 0.1, sy: 0.42, sz: 0.05, mat: matSteel });
    addBox(g, { x: 0.42, y: 1.9, z: -0.47, sx: 0.24, sy: 0.24, sz: 0.05, mat: matTool });
    addBox(g, { x: 0.98, y: 1.98, z: -0.47, sx: 0.08, sy: 0.5, sz: 0.05, mat: matSteel });

    // Bench vice.
    addBox(g, { x: 1.0, y: 1.06, z: 0.18, sx: 0.34, sy: 0.16, sz: 0.2, mat: matSteel });
    addBox(g, { x: 1.0, y: 1.2, z: 0.18, sx: 0.22, sy: 0.14, sz: 0.16, mat: matLeg });

    // Toolbox on the bench.
    addBox(g, { x: -0.85, y: 1.1, z: 0.1, sx: 0.55, sy: 0.24, sz: 0.3, mat: matTool });

    return g;
}

function createTireStack({ count = 4 } = {}) {
    const g = new THREE.Group();
    g.name = 'tire_stack';
    const matTire = matStd({ color: 0x1c1e22, roughness: 0.95, metalness: 0.0 });
    const geo = new THREE.TorusGeometry(0.42, 0.17, 12, 26);
    for (let i = 0; i < count; i++) {
        const tire = new THREE.Mesh(geo, matTire);
        tire.rotation.x = Math.PI / 2;
        tire.position.y = 0.17 + i * 0.335;
        tire.rotation.z = i * 0.6;
        tire.castShadow = true;
        tire.receiveShadow = true;
        g.add(tire);
    }
    return g;
}

function createOilDrum({ color = 0x2f5d8e } = {}) {
    const g = new THREE.Group();
    g.name = 'oil_drum';
    const matBody = matStd({ color, roughness: 0.5, metalness: 0.45 });
    const matRib = matStd({ color: 0x11161e, roughness: 0.5, metalness: 0.5 });

    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.92, 20), matBody);
    body.position.y = 0.46;
    body.castShadow = true;
    body.receiveShadow = true;
    g.add(body);

    const ribGeo = new THREE.TorusGeometry(0.315, 0.018, 8, 20);
    for (const y of [0.28, 0.64]) {
        const rib = new THREE.Mesh(ribGeo, matRib);
        rib.rotation.x = Math.PI / 2;
        rib.position.y = y;
        rib.castShadow = true;
        g.add(rib);
    }

    return g;
}

function createToolCabinet() {
    const g = new THREE.Group();
    g.name = 'tool_cabinet';
    const matBody = matStd({ color: 0x8e3038, roughness: 0.45, metalness: 0.3 });
    const matSlit = matStd({ color: 0x1a1114, roughness: 0.6, metalness: 0.2 });
    const matWheel = matStd({ color: 0x0d0f13, roughness: 0.8, metalness: 0.1 });

    addBox(g, { x: 0, y: 0.68, z: 0, sx: 1.15, sy: 1.05, sz: 0.55, mat: matBody });
    for (let i = 0; i < 4; i++) {
        addBox(g, { x: 0, y: 0.3 + i * 0.24, z: 0.283, sx: 1.0, sy: 0.035, sz: 0.02, mat: matSlit });
    }

    const wheelGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.05, 12);
    for (const sx of [-0.45, 0.45]) {
        for (const sz of [-0.2, 0.2]) {
            const w = new THREE.Mesh(wheelGeo, matWheel);
            w.rotation.z = Math.PI / 2;
            w.position.set(sx, 0.08, sz);
            w.castShadow = true;
            g.add(w);
        }
    }

    return g;
}

function createTrafficCone() {
    const g = new THREE.Group();
    g.name = 'traffic_cone';
    const matCone = matStd({ color: 0xd85820, roughness: 0.55, metalness: 0.02 });
    const matBand = matStd({ color: 0xf2f2f2, roughness: 0.4, metalness: 0.02 });

    addBox(g, { x: 0, y: 0.03, z: 0, sx: 0.42, sy: 0.06, sz: 0.42, mat: matCone });

    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.62, 16), matCone);
    cone.position.y = 0.36;
    cone.castShadow = true;
    cone.receiveShadow = true;
    g.add(cone);

    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.135, 0.12, 16, 1, true), matBand);
    band.position.y = 0.34;
    g.add(band);

    return g;
}

function createBollard() {
    const g = new THREE.Group();
    g.name = 'bollard';
    const matYellow = matStd({ color: 0xd8a516, roughness: 0.5, metalness: 0.15 });
    const matBlack = matStd({ color: 0x14161a, roughness: 0.55, metalness: 0.15 });

    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 1.05, 16), matYellow);
    post.position.y = 0.525;
    post.castShadow = true;
    post.receiveShadow = true;
    g.add(post);

    for (const y of [0.4, 0.75]) {
        const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.115, 0.1, 16), matBlack);
        stripe.position.y = y;
        g.add(stripe);
    }

    return g;
}

function createFireExtinguisher() {
    const g = new THREE.Group();
    g.name = 'fire_extinguisher';
    const matRed = matStd({ color: 0xb42424, roughness: 0.4, metalness: 0.25 });
    const matBlack = matStd({ color: 0x14161a, roughness: 0.5, metalness: 0.2 });

    addBox(g, { x: -0.06, y: 0, z: 0, sx: 0.05, sy: 0.6, sz: 0.24, mat: matBlack });

    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.105, 0.52, 16), matRed);
    tank.position.set(0.08, 0, 0);
    tank.castShadow = true;
    g.add(tank);

    addBox(g, { x: 0.08, y: 0.32, z: 0, sx: 0.07, sy: 0.12, sz: 0.14, mat: matBlack });

    return g;
}

function createExitSign() {
    const g = new THREE.Group();
    g.name = 'exit_sign';
    const frame = new THREE.Mesh(
        new THREE.BoxGeometry(1.5, 0.55, 0.14),
        matStd({ color: 0x10141c, roughness: 0.5, metalness: 0.3 })
    );
    frame.castShadow = true;
    g.add(frame);

    const face = new THREE.Mesh(
        new THREE.PlaneGeometry(1.36, 0.42),
        emissiveMat({ emissive: 0x2fae5a, intensity: 2.6, color: 0x9fe8bb })
    );
    face.position.z = 0.075;
    g.add(face);

    return g;
}

function addWallBaseTrim(root, { width, depth }) {
    const matBase = matStd({ color: 0x0d1117, roughness: 0.85, metalness: 0.1 });
    const matStripe = matStd({ color: 0xd8a516, roughness: 0.6, metalness: 0.08 });

    for (const sideX of [-1, 1]) {
        const base = addBeam(root, {
            x: sideX * (width / 2 - 0.09), y: 0.25, z: 0,
            sx: 0.18, sy: 0.5, sz: depth - 0.4, mat: matBase
        });
        base.castShadow = false;
        const stripe = addBeam(root, {
            x: sideX * (width / 2 - 0.1), y: 0.58, z: 0,
            sx: 0.16, sy: 0.08, sz: depth - 0.4, mat: matStripe
        });
        stripe.castShadow = false;
    }
}

export function createGarageModel({ width = 48, depth = 60, height = 14 } = {}) {
    const root = new THREE.Group();
    root.name = 'garage_root';

    const { asphalt, wall } = getGarageTextures();

    const floorMat = matStd({
        color: 0xffffff,
        roughness: 0.98,
        metalness: 0.02,
        map: asphalt.map,
        bumpMap: asphalt.bumpMap,
        bumpScale: 0.08
    });

    const wallMapBack = cloneTex(wall.map);
    const wallBumpBack = cloneTex(wall.bumpMap);
    const wallRoughBack = cloneTex(wall.roughnessMap);

    setRepeatSafe(wallMapBack, width / 8, height / 6);
    setRepeatSafe(wallBumpBack, width / 8, height / 6);
    setRepeatSafe(wallRoughBack, width / 8, height / 6);

    const wallMapSide = cloneTex(wall.map);
    const wallBumpSide = cloneTex(wall.bumpMap);
    const wallRoughSide = cloneTex(wall.roughnessMap);

    setRepeatSafe(wallMapSide, depth / 8, height / 6);
    setRepeatSafe(wallBumpSide, depth / 8, height / 6);
    setRepeatSafe(wallRoughSide, depth / 8, height / 6);

    const wallMatBack = matStd({
        color: 0xffffff,
        roughness: 0.95,
        metalness: 0.10,
        map: wallMapBack,
        bumpMap: wallBumpBack,
        bumpScale: 0.14,
        roughnessMap: wallRoughBack
    });

    const wallMatSide = matStd({
        color: 0xffffff,
        roughness: 0.95,
        metalness: 0.10,
        map: wallMapSide,
        bumpMap: wallBumpSide,
        bumpScale: 0.14,
        roughnessMap: wallRoughSide
    });

    const frameMat = matStd({ color: 0x0c1018, roughness: 0.75, metalness: 0.25 });
    const beamMat = matStd({ color: 0x141b28, roughness: 0.82, metalness: 0.18 });
    const gateMat = matStd({ color: 0x3b4652, roughness: 0.55, metalness: 0.58 });

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    root.add(floor);

    const backWall = new THREE.Mesh(new THREE.PlaneGeometry(width, height), wallMatBack);
    backWall.position.set(0, height / 2, -depth / 2);
    backWall.receiveShadow = true;
    root.add(backWall);

    const sideGeo = new THREE.PlaneGeometry(depth, height);

    const leftWall = new THREE.Mesh(sideGeo, wallMatSide);
    leftWall.rotation.y = Math.PI / 2;
    leftWall.position.set(-width / 2, height / 2, 0);
    leftWall.receiveShadow = true;
    root.add(leftWall);

    const rightWall = new THREE.Mesh(sideGeo, wallMatSide);
    rightWall.rotation.y = -Math.PI / 2;
    rightWall.position.set(width / 2, height / 2, 0);
    rightWall.receiveShadow = true;
    root.add(rightWall);

    const ceiling = new THREE.Mesh(
        new THREE.PlaneGeometry(width, depth),
        matStd({ color: 0x1a2234, roughness: 0.98, metalness: 0.02 })
    );
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(0, height, 0);
    ceiling.receiveShadow = true;
    root.add(ceiling);

    const postH = height;
    const postS = 0.55;
    addBeam(root, { x: -width / 2 + postS / 2, y: postH / 2, z: -depth / 2 + postS / 2, sx: postS, sy: postH, sz: postS, mat: frameMat });
    addBeam(root, { x:  width / 2 - postS / 2, y: postH / 2, z: -depth / 2 + postS / 2, sx: postS, sy: postH, sz: postS, mat: frameMat });
    addBeam(root, { x: -width / 2 + postS / 2, y: postH / 2, z:  depth / 2 - postS / 2, sx: postS, sy: postH, sz: postS, mat: frameMat });
    addBeam(root, { x:  width / 2 - postS / 2, y: postH / 2, z:  depth / 2 - postS / 2, sx: postS, sy: postH, sz: postS, mat: frameMat });

    for (let i = -3; i <= 3; i++) {
        addBeam(root, { x: 0, y: height - 0.55, z: i * (depth / 7.2), sx: width, sy: 0.35, sz: 0.75, mat: beamMat });
    }
    for (const bx of [-width / 4, width / 4]) {
        addBeam(root, { x: bx, y: height - 0.35, z: 0, sx: 0.35, sy: 0.3, sz: depth - 1.2, mat: beamMat });
    }

    addWallBaseTrim(root, { width, depth });

    const gate = createRollUpGate({ width, height, depth, matMetal: gateMat, matFrame: frameMat });
    gate.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    root.add(gate);

    const bayX = [-7.2, 0, 7.2];
    for (const x of bayX) {
        addFloorMark(root, { x, z: 0, length: 22, width: 0.18, color: 0xffcc00, opacity: 0.22 });
        addFloorMark(root, { x: x - 2.2, z: 0, length: 22, width: 0.10, color: 0xffffff, opacity: 0.10 });
        addFloorMark(root, { x: x + 2.2, z: 0, length: 22, width: 0.10, color: 0xffffff, opacity: 0.10 });
    }

    // Props hug the walls: the bus carousel sweeps the back half (z <= 0)
    // along an arc around the gate, so floor clutter stays either close to
    // the gate (inside the arc) or in the front half of the room.
    const leftX = -width / 2;
    const rightX = width / 2;

    const workbench = createWorkbench();
    workbench.rotation.y = Math.PI / 2;
    workbench.position.set(leftX + 0.75, 0, 2.2);
    root.add(workbench);

    for (const z of [9, 15]) {
        const rack = createShelvingRack();
        rack.rotation.y = Math.PI / 2;
        rack.position.set(leftX + 0.72, 0, z);
        root.add(rack);
    }

    const cabinet = createToolCabinet();
    cabinet.rotation.y = -Math.PI / 2;
    cabinet.position.set(rightX - 0.55, 0, 0.8);
    root.add(cabinet);

    for (const [z, spin] of [[3.1, 0.3], [5.6, 1.4]]) {
        const tires = createTireStack({ count: z > 4 ? 3 : 4 });
        tires.rotation.y = spin;
        tires.position.set(rightX - 0.85, 0, z);
        root.add(tires);
    }

    const drumColors = [0x2f5d8e, 0x6a7076, 0x7a3030];
    const drumPos = [[rightX - 0.75, 10.6], [rightX - 0.7, 12.1], [rightX - 1.5, 11.4]];
    drumPos.forEach(([x, z], i) => {
        const drum = createOilDrum({ color: drumColors[i % drumColors.length] });
        drum.position.set(x, 0, z);
        root.add(drum);
    });

    const conePos = [[-11.2, -25.2, 0.2], [-9.6, -23.9, 1.7], [-12.6, -23.3, 2.9]];
    for (const [x, z, spin] of conePos) {
        const cone = createTrafficCone();
        cone.rotation.y = spin;
        cone.position.set(x, 0, z);
        root.add(cone);
    }

    const gateW = width * 0.66;
    for (const sideX of [-1, 1]) {
        const bollard = createBollard();
        bollard.position.set(sideX * (gateW / 2 + 1.3), 0, -depth / 2 + 3.2);
        root.add(bollard);
    }

    const extinguisher = createFireExtinguisher();
    extinguisher.rotation.y = -Math.PI / 2;
    extinguisher.position.set(rightX - 0.12, 1.55, 6.9);
    root.add(extinguisher);

    const exitSign = createExitSign();
    exitSign.position.set(gateW / 2 + 2.6, height * 0.78 + 1.1, -depth / 2 + 0.62);
    root.add(exitSign);

    const lights = [];
    lights.push(new THREE.AmbientLight(0xffffff, 1.1));
    lights.push(new THREE.HemisphereLight(0xcfe6ff, 0x2b3550, 0.75));

    const dir = new THREE.DirectionalLight(0xffffff, 1.1);
    dir.position.set(10, 18, 12);
    dir.castShadow = true;
    dir.shadow.mapSize.set(1024, 1024);
    dir.shadow.bias = -0.00025;
    lights.push(dir);

    const yLight = height - 0.42;
    for (const z of [-10, 6, 20]) {
        addRoundCeilingLight(root, lights, { x: -7.2, y: yLight, z, intensity: 10 });
        addRoundCeilingLight(root, lights, { x:  0.0, y: yLight, z, intensity: 12 });
        addRoundCeilingLight(root, lights, { x:  7.2, y: yLight, z, intensity: 10 });
    }

    const lampY = height * 0.62;
    for (const z of [-20, -8, 6]) {
        addWallBattenLamp(root, lights, { x: -width / 2 + 0.10, y: lampY, z, side: 'left',  length: 3.2, lightColor: 0xfff0d8 });
        addWallBattenLamp(root, lights, { x:  width / 2 - 0.10, y: lampY, z, side: 'right', length: 3.2, lightColor: 0xfff0d8 });
    }

    return { root, lights };
}
