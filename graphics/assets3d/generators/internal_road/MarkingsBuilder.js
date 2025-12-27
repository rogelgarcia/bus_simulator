// graphics/assets3d/generators/internal_road/MarkingsBuilder.js
import * as THREE from 'three';

export function createMarkingsBuilder({
                                          planeGeo,
                                          whiteMaterial,
                                          yellowMaterial,
                                          whiteCapacity,
                                          yellowCapacity
                                      } = {}) {
    const markingsWhite = new THREE.InstancedMesh(planeGeo, whiteMaterial, Math.max(1, whiteCapacity | 0));
    markingsWhite.name = 'MarkingsWhite';

    const markingsYellow = new THREE.InstancedMesh(planeGeo, yellowMaterial, Math.max(1, yellowCapacity | 0));
    markingsYellow.name = 'MarkingsYellow';

    const dummy = new THREE.Object3D();
    let mw = 0;
    let my = 0;

    function addWhite(x, y, z, sx, sz, ry = 0) {
        dummy.position.set(x, y, z);
        dummy.rotation.set(0, ry, 0);
        dummy.scale.set(sx, 1, sz);
        dummy.updateMatrix();
        markingsWhite.setMatrixAt(mw++, dummy.matrix);
    }

    function addYellow(x, y, z, sx, sz, ry = 0) {
        dummy.position.set(x, y, z);
        dummy.rotation.set(0, ry, 0);
        dummy.scale.set(sx, 1, sz);
        dummy.updateMatrix();
        markingsYellow.setMatrixAt(my++, dummy.matrix);
    }

    function finalize() {
        markingsWhite.count = mw;
        markingsYellow.count = my;
        markingsWhite.instanceMatrix.needsUpdate = true;
        markingsYellow.instanceMatrix.needsUpdate = true;
        return { mw, my };
    }

    return { markingsWhite, markingsYellow, addWhite, addYellow, finalize };
}
