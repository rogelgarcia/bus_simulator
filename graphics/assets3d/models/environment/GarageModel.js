// graphics/assets3d/models/environment/GarageModel.js
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
    intensity = 4.0,
    color = 0xbfe9ff
}) {
    const fixture = new THREE.Group();

    const rim = new THREE.Mesh(
        new THREE.CylinderGeometry(0.95, 0.95, 0.10, 44),
        matStd({ color: 0x0f141e, roughness: 0.55, metalness: 0.25 })
    );
    rim.rotation.x = Math.PI / 2;
    rim.castShadow = true;
    rim.receiveShadow = true;
    fixture.add(rim);

    const lens = new THREE.Mesh(
        new THREE.CircleGeometry(0.78, 44),
        emissiveMat({ emissive: color, intensity: 2.2, color: 0xffffff })
    );
    lens.position.z = 0.051;
    fixture.add(lens);

    fixture.position.set(x, y, z);
    root.add(fixture);

    const down = new THREE.SpotLight(color, intensity, 80, Math.PI / 4.0, 0.75, 1.2);
    down.position.set(x, y, z);

    const target = new THREE.Object3D();
    target.position.set(x, 0.18, z);
    root.add(target);
    down.target = target;

    down.castShadow = true;
    down.shadow.mapSize.set(1024, 1024);
    down.shadow.bias = -0.00025;

    lights.push(down);
}

function addWallTubeLamp(root, lights, {
    x, y, z,
    side = 'left',
    length = 3.2,
    lightColor = 0xfff0d8
}) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = side === 'left' ? 0 : Math.PI;

    const matFrame = matStd({ color: 0x0f141e, roughness: 0.65, metalness: 0.28 });
    const matGlass = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.08,
        metalness: 0.0,
        transparent: true,
        opacity: 0.22
    });
    const matTube = emissiveMat({ emissive: lightColor, intensity: 2.6, color: 0xffffff });

    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.7, 0.55), matFrame);
    plate.position.set(0.03, 0, 0);
    plate.castShadow = true;
    plate.receiveShadow = true;
    g.add(plate);

    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.06, 0.06), matFrame);
    arm.position.set(0.16, 0, 0);
    arm.castShadow = true;
    arm.receiveShadow = true;
    g.add(arm);

    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, length, 22), matTube);
    tube.rotation.x = Math.PI / 2;
    tube.position.set(0.26, 0, 0);
    g.add(tube);

    const cover = new THREE.Mesh(
        new THREE.CylinderGeometry(0.13, 0.13, length, 16, 1, true),
        matGlass
    );
    cover.rotation.x = Math.PI / 2;
    cover.position.set(0.26, 0, 0);
    cover.receiveShadow = true;
    g.add(cover);

    const capGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.04, 16);
    const capA = new THREE.Mesh(capGeo, matFrame);
    capA.rotation.z = Math.PI / 2;
    capA.position.set(0.26, 0, -length / 2);
    capA.castShadow = true;
    capA.receiveShadow = true;

    const capB = capA.clone();
    capB.position.set(0.26, 0, length / 2);

    g.add(capA, capB);

    root.add(g);

    const spot = new THREE.SpotLight(lightColor, 2.2, 30, Math.PI / 6.2, 0.85, 1.6);
    spot.position.set(x + (side === 'left' ? 0.35 : -0.35), y, z);

    const target = new THREE.Object3D();
    target.position.set(
        x + (side === 'left' ? 3.2 : -3.2),
        Math.max(0.6, y - 2.8),
        z
    );
    root.add(target);
    spot.target = target;

    spot.castShadow = true;
    spot.shadow.mapSize.set(512, 512);
    spot.shadow.bias = -0.0002;
    lights.push(spot);

    const p = new THREE.PointLight(lightColor, 0.6, 7, 2);
    p.position.set(x + (side === 'left' ? 0.35 : -0.35), y, z);
    lights.push(p);
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
        matStd({ color: 0x121826, roughness: 0.98, metalness: 0.02 })
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

    const gate = createRollUpGate({ width, height, depth, matMetal: gateMat, matFrame: frameMat });
    gate.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    root.add(gate);

    const bayX = [-7.2, 0, 7.2];
    for (const x of bayX) {
        addFloorMark(root, { x, z: 0, length: 22, width: 0.18, color: 0xffcc00, opacity: 0.22 });
        addFloorMark(root, { x: x - 2.2, z: 0, length: 22, width: 0.10, color: 0xffffff, opacity: 0.10 });
        addFloorMark(root, { x: x + 2.2, z: 0, length: 22, width: 0.10, color: 0xffffff, opacity: 0.10 });
    }

    const lights = [];
    lights.push(new THREE.AmbientLight(0xffffff, 0.35));
    lights.push(new THREE.HemisphereLight(0xbfe9ff, 0x0f1420, 0.28));

    const dir = new THREE.DirectionalLight(0xffffff, 0.65);
    dir.position.set(10, 18, 12);
    dir.castShadow = true;
    dir.shadow.mapSize.set(1024, 1024);
    dir.shadow.bias = -0.00025;
    lights.push(dir);

    const yLight = height - 0.28;
    addRoundCeilingLight(root, lights, { x: -7.2, y: yLight, z: -10, intensity: 4.2, color: 0xbfe9ff });
    addRoundCeilingLight(root, lights, { x:  0.0, y: yLight, z: -10, intensity: 4.8, color: 0xbfe9ff });
    addRoundCeilingLight(root, lights, { x:  7.2, y: yLight, z: -10, intensity: 4.2, color: 0xbfe9ff });

    addRoundCeilingLight(root, lights, { x: -7.2, y: yLight, z:  6, intensity: 4.2, color: 0xbfe9ff });
    addRoundCeilingLight(root, lights, { x:  0.0, y: yLight, z:  6, intensity: 5.0, color: 0xbfe9ff });
    addRoundCeilingLight(root, lights, { x:  7.2, y: yLight, z:  6, intensity: 4.2, color: 0xbfe9ff });

    const lampY = height * 0.62;
    for (const z of [-20, -8, 6]) {
        addWallTubeLamp(root, lights, { x: -width / 2 + 0.10, y: lampY, z, side: 'left',  length: 3.2, lightColor: 0xfff0d8 });
        addWallTubeLamp(root, lights, { x:  width / 2 - 0.10, y: lampY, z, side: 'right', length: 3.2, lightColor: 0xfff0d8 });
    }

    return { root, lights };
}
