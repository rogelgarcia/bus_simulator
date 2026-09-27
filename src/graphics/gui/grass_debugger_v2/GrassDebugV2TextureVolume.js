// Give texture-only patches connected top and side surfaces over the full square.
// @ts-check
import * as THREE from 'three';
import { createGrassDebugV2SideBake, GRASS_V2_SIDE_ALPHA_TEST } from './GrassDebugV2SideBake.js';
import { createGrassDebugV2FloorMaterial } from './GrassDebugV2FloorMaterial.js';
import { createGrassDebugV2WallJoin } from './GrassDebugV2WallJoin.js';

/**
 * @param {{renderer:THREE.WebGLRenderer,source:THREE.Group,
 * fields:Array<{id:string,x:number,z:number,textureLeaves:number,edgeLeaves?:boolean}>,
 * topBakes:Record<number,Awaited<ReturnType<import('./GrassDebugV2FloorBake.js').createGrassDebugV2FloorBake>>>}} options
 */
export async function createGrassDebugV2TextureVolume({ renderer, source, fields, topBakes }) {
    const bake = await createGrassDebugV2SideBake({ renderer, source });
    const silhouetteBake = await createGrassDebugV2SideBake({ renderer, source, edgeDepth: 0.05, minHeightFraction: 0.8 });
    const wallHeight = bake.sourceHeight * 0.8, centerHeight = wallHeight / 2;
    const geometry = new THREE.PlaneGeometry(1, wallHeight), group = new THREE.Group(), walls = [], materials = [], joins = [];
    const silhouetteGeometry = new THREE.PlaneGeometry(1, silhouetteBake.captureHeight), silhouettes = [];
    group.name = 'GrassV2TextureVolumes';
    for (const field of fields) {
        const join = createGrassDebugV2WallJoin({ sideBake: bake, topBake: topBakes[field.textureLeaves], wallHeight });
        joins.push(join);
        for (const view of join.views) {
            const material = createGrassDebugV2FloorMaterial(view.textures);
            material.name = 'GrassV2Volume-' + field.id + '-' + view.id; material.alphaTest = GRASS_V2_SIDE_ALPHA_TEST;
            material.alphaToCoverage = true; materials.push(material);
            const wall = new THREE.Mesh(geometry, material);
            wall.name = 'GrassV2Volume-' + field.id + '-' + view.id;
            wall.position.set(field.x, centerHeight, field.z).addScaledVector(view.outward, 0.5);
            wall.quaternion.copy(view.quaternion); wall.castShadow = false; wall.receiveShadow = true;
            walls.push(wall); group.add(wall);
        }
        if (!field.edgeLeaves) for (const view of silhouetteBake.views) {
            const material = createGrassDebugV2FloorMaterial(view.textures);
            material.alphaTest = GRASS_V2_SIDE_ALPHA_TEST; material.alphaToCoverage = true;
            materials.push(material);
            const card = new THREE.Mesh(silhouetteGeometry, material);
            card.name = 'GrassV2Silhouette-' + field.id + '-' + view.id;
            card.position.set(field.x, wallHeight + silhouetteBake.captureHeight / 2, field.z).addScaledVector(view.outward, 0.5);
            card.quaternion.copy(view.quaternion); card.castShadow = false; card.receiveShadow = true;
            silhouettes.push(card); group.add(card);
        }
    }
    return Object.freeze({ group, walls: Object.freeze(walls), joins: Object.freeze(joins), silhouettes: Object.freeze(silhouettes), silhouetteBake, bake, wallHeight, centerHeight, surfaceHeight: wallHeight,
        getSnapshot: () => ({ wallHeight, centerHeight, surfaceHeight: wallHeight, sourceHeight: bake.sourceHeight, heightFraction: 0.8,
            borderInset: 0, edgeBlendHeight: joins[0].blendHeight, connectedTop: true,
            fields: fields.map(field => field.id), walls: walls.length, silhouettes: silhouettes.length,
            silhouetteTriangles: silhouettes.length * 2, silhouette: silhouetteBake.getSnapshot(),
            triangles: (walls.length + silhouettes.length) * 2, bake: bake.getSnapshot() }),
        dispose: () => {
            geometry.dispose(); silhouetteGeometry.dispose(); silhouetteBake.dispose(); materials.forEach(material => material.dispose());
            joins.forEach(join => join.dispose()); bake.dispose();
        }
    });
}
