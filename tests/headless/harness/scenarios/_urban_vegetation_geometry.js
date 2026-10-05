// Independent browser measurements of woody topology and foliage accessor values.
import * as THREE from 'three';

function measureBark(meshes) {
    const vertexCount = meshes.reduce((sum, mesh) => sum + mesh.geometry.attributes.position.count, 0);
    const triangles = meshes.reduce((sum, mesh) => sum + (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) / 3, 0);
    const coordinates = new Float64Array(vertexCount * 3);
    const order = new Uint32Array(vertexCount);
    const ids = new Uint32Array(vertexCount);
    const point = new THREE.Vector3();
    let lowestWoodOutsideStem = Infinity;
    let offset = 0;
    for (const mesh of meshes) {
        const position = mesh.geometry.getAttribute('position');
        for (let i = 0; i < position.count; i += 1) {
            point.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
            if (point.y > 1.5 && Math.hypot(point.x, point.z) > 1.25) lowestWoodOutsideStem = Math.min(lowestWoodOutsideStem, point.y);
            const index = offset + i;
            coordinates[index * 3] = point.x;
            coordinates[index * 3 + 1] = point.y;
            coordinates[index * 3 + 2] = point.z;
            order[index] = index;
        }
        offset += position.count;
    }
    order.sort((a, b) => coordinates[a * 3] - coordinates[b * 3] || coordinates[a * 3 + 1] - coordinates[b * 3 + 1] || coordinates[a * 3 + 2] - coordinates[b * 3 + 2]);
    let uniquePositions = 0;
    for (let i = 0; i < order.length; i += 1) {
        const current = order[i], previous = order[i - 1];
        if (i === 0 || coordinates[current * 3] !== coordinates[previous * 3] || coordinates[current * 3 + 1] !== coordinates[previous * 3 + 1] || coordinates[current * 3 + 2] !== coordinates[previous * 3 + 2]) uniquePositions += 1;
        ids[current] = uniquePositions - 1;
    }
    if (uniquePositions * uniquePositions > Number.MAX_SAFE_INTEGER) throw new Error('Woody topology exceeds exact numeric edge key capacity');
    const parents = Uint32Array.from({ length: uniquePositions }, (_, index) => index);
    const edges = new Float64Array(triangles * 3);
    let edgeCount = 0, degenerateTriangles = 0;
    const find = vertex => {
        let root = vertex;
        while (parents[root] !== root) root = parents[root];
        while (parents[vertex] !== vertex) {
            const next = parents[vertex];
            parents[vertex] = root;
            vertex = next;
        }
        return root;
    };
    const edge = (a, b) => {
        if (a === b) return;
        edges[edgeCount++] = a < b ? a * uniquePositions + b : b * uniquePositions + a;
        parents[find(b)] = find(a);
    };
    offset = 0;
    for (const mesh of meshes) {
        const count = mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count;
        const index = mesh.geometry.index;
        for (let i = 0; i < count; i += 3) {
            const a = ids[offset + (index ? index.getX(i) : i)];
            const b = ids[offset + (index ? index.getX(i + 1) : i + 1)];
            const c = ids[offset + (index ? index.getX(i + 2) : i + 2)];
            if (a === b || b === c || c === a) degenerateTriangles += 1;
            edge(a, b); edge(b, c); edge(c, a);
        }
        offset += mesh.geometry.attributes.position.count;
    }
    edges.subarray(0, edgeCount).sort();
    let boundaryEdges = 0, nonManifoldEdges = 0, connectedComponents = 0;
    for (let first = 0; first < edgeCount;) {
        let end = first + 1;
        while (end < edgeCount && edges[end] === edges[first]) end += 1;
        if (end - first === 1) boundaryEdges += 1;
        if (end - first > 2) nonManifoldEdges += 1;
        first = end;
    }
    for (let i = 0; i < parents.length; i += 1) if (find(i) === i) connectedComponents += 1;
    const grounded = new Set();
    for (let i = 0; i < vertexCount; i += 1) if (Math.abs(coordinates[i * 3 + 1]) < .00001) grounded.add(find(ids[i]));
    const componentTriangles = new Uint32Array(uniquePositions);
    offset = 0;
    for (const mesh of meshes) {
        const count = mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count;
        for (let i = 0; i < count; i += 3) componentTriangles[find(ids[offset + (mesh.geometry.index ? mesh.geometry.index.getX(i) : i)])] += 1;
        offset += mesh.geometry.attributes.position.count;
    }
    const componentTriangleCounts = [];
    for (const count of componentTriangles) if (count > 0) componentTriangleCounts.push(count);
    componentTriangleCounts.sort((a, b) => b - a);
    return {
        triangles, positionWeldToleranceMetres: 0, positionWeldMethod: 'Exact transformed source positions; UV seam duplicates only', uniquePositions,
        connectedComponents, groundedComponents: grounded.size, boundaryEdges, nonManifoldEdges, degenerateTriangles, componentTriangleCounts,
        lowestWoodOutsideStem: Number.isFinite(lowestWoodOutsideStem) ? lowestWoodOutsideStem : null,
        clearStemProbe: { radiusMetres: 1.25, excludesBelowMetres: 1.5 }
    };
}

export async function measureUrbanPlantGeometry(template) {
    template.updateMatrixWorld(true);
    const bark = [], foliage = [];
    template.traverse(mesh => {
        if (!mesh.isMesh) return;
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        (materials.every(material => material.userData.isFoliage || material.name === 'foliage') ? foliage : bark).push(mesh);
    });
    if (foliage.length !== 1) throw new Error('Vegetation evidence expects one foliage primitive');
    const geometry = foliage[0].geometry;
    const foliageBounds = new THREE.Box3().setFromObject(foliage[0]);
    const fingerprint = {};
    for (const [name, attribute, Type] of [['positions', geometry.getAttribute('position'), Float32Array], ['indices', geometry.index, Uint32Array],
        ['uvs', geometry.getAttribute('uv'), Float32Array], ['normals', geometry.getAttribute('normal'), Float32Array], ['colors', geometry.getAttribute('color'), Float32Array]]) {
        if (!attribute) { fingerprint[name] = null; continue; }
        const values = new Type(attribute.count * attribute.itemSize);
        const getters = ['getX', 'getY', 'getZ', 'getW'];
        for (let row = 0; row < attribute.count; row++) for (let column = 0; column < attribute.itemSize; column++) values[row * attribute.itemSize + column] = attribute[getters[column]](row);
        const hash = await crypto.subtle.digest('SHA-256', values.buffer);
        fingerprint[name] = [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('');
    }
    return {
        variant: template.userData.treeVariant,
        bark: measureBark(bark),
        foliage: { vertices: geometry.attributes.position.count, triangles: geometry.index.count / 3, fingerprint,
            bounds: { min: foliageBounds.min.toArray(), max: foliageBounds.max.toArray() } }
    };
}
