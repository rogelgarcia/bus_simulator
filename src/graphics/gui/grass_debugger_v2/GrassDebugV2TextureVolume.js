// Give texture-only patches connected top and side surfaces over the full square.
// @ts-check
import * as THREE from 'three';
import { createGrassDebugV2SideBake, GRASS_V2_SIDE_ALPHA_TEST } from './GrassDebugV2SideBake.js';
import { createGrassDebugV2FloorMaterial } from './GrassDebugV2FloorMaterial.js';
import { createGrassDebugV2WallJoin } from './GrassDebugV2WallJoin.js';

export const GRASS_V2_VOLUME_RECIPE = Object.freeze({ heightFraction: 0.8, edgeDepth: 0.05 });

/**
 * @param {{renderer:THREE.WebGLRenderer,source:THREE.Group,recipe?:Partial<typeof GRASS_V2_VOLUME_RECIPE>,
 * fields:Array<{id:string,x:number,z:number,textureId:string,edgeLeaves?:boolean}>,
 * topBakes:Record<string,Awaited<ReturnType<import('./GrassDebugV2FloorBake.js').createGrassDebugV2FloorBake>>>}} options
 */
export async function createGrassDebugV2TextureVolume({ renderer, source, fields, topBakes, recipe = {} }) {
    if (!recipe || typeof recipe !== 'object' || Array.isArray(recipe)) throw new Error('Grass texture volume recipe must be an object.');
    const config = Object.freeze({ ...GRASS_V2_VOLUME_RECIPE, ...recipe });
    if (!Object.values(config).every(Number.isFinite) || !(config.heightFraction > 0 && config.heightFraction < 1)
        || !(config.edgeDepth > 0 && config.edgeDepth <= 1)) throw new Error('Invalid grass texture volume recipe.');
    if (!Array.isArray(fields) || !topBakes || typeof topBakes !== 'object'
        || fields.some(field => !Number.isFinite(field.x) || !Number.isFinite(field.z)
            || typeof field.textureId !== 'string' || !Object.hasOwn(topBakes, field.textureId) || !topBakes[field.textureId]))
        throw new Error('Grass texture volume requires positioned fields with matching top bakes.');
    const bake = await createGrassDebugV2SideBake({ renderer, source });
    const silhouetteBake = await createGrassDebugV2SideBake({ renderer, source, edgeDepth: config.edgeDepth, minHeightFraction: config.heightFraction });
    const wallHeight = bake.sourceHeight * config.heightFraction, centerHeight = wallHeight / 2;
    const geometry = new THREE.PlaneGeometry(1, wallHeight), group = new THREE.Group(), walls = [], materials = [], joins = [];
    const silhouetteGeometry = new THREE.PlaneGeometry(1, silhouetteBake.captureHeight), silhouettes = [];
    group.name = 'GrassV2TextureVolumes';
    for (const field of fields) {
        const join = createGrassDebugV2WallJoin({ sideBake: bake, topBake: topBakes[field.textureId], wallHeight });
        joins.push(join);
        for (const view of join.views) {
            const material = createGrassDebugV2FloorMaterial(view.textures);
            material.name = 'GrassV2Volume-' + field.id + '-' + view.id; material.alphaTest = GRASS_V2_SIDE_ALPHA_TEST;
            material.alphaToCoverage = true; materials.push(material);
            const wall = new THREE.Mesh(geometry, material);
            wall.name = 'GrassV2Volume-' + field.id + '-' + view.id; wall.userData.configurationId = field.id;
            wall.position.set(field.x, centerHeight, field.z).addScaledVector(view.outward, 0.5);
            wall.quaternion.copy(view.quaternion); wall.castShadow = false; wall.receiveShadow = true;
            walls.push(wall); group.add(wall);
        }
        if (!field.edgeLeaves) for (const view of silhouetteBake.views) {
            const material = createGrassDebugV2FloorMaterial(view.textures);
            material.alphaTest = GRASS_V2_SIDE_ALPHA_TEST; material.alphaToCoverage = true;
            materials.push(material);
            const card = new THREE.Mesh(silhouetteGeometry, material);
            card.name = 'GrassV2Silhouette-' + field.id + '-' + view.id; card.userData.configurationId = field.id;
            card.position.set(field.x, wallHeight + silhouetteBake.captureHeight / 2, field.z).addScaledVector(view.outward, 0.5);
            card.quaternion.copy(view.quaternion); card.castShadow = false; card.receiveShadow = true;
            silhouettes.push(card); group.add(card);
        }
    }
    return Object.freeze({ group, walls: Object.freeze(walls), joins: Object.freeze(joins), silhouettes: Object.freeze(silhouettes), silhouetteBake, bake, wallHeight, centerHeight, surfaceHeight: wallHeight,
        getSnapshot: () => ({ recipe: { ...config }, wallHeight, centerHeight, surfaceHeight: wallHeight, sourceHeight: bake.sourceHeight, heightFraction: config.heightFraction,
            borderInset: 0, edgeBlendHeight: joins.length ? joins[0].blendHeight : 0, connectedTop: true,
            fields: fields.map(field => field.id), walls: walls.length, silhouettes: silhouettes.length,
            silhouetteTriangles: silhouettes.length * 2, silhouette: silhouetteBake.getSnapshot(),
            triangles: (walls.length + silhouettes.length) * 2, bake: bake.getSnapshot() }),
        dispose: () => {
            geometry.dispose(); silhouetteGeometry.dispose(); silhouetteBake.dispose(); materials.forEach(material => material.dispose());
            joins.forEach(join => join.dispose()); bake.dispose();
        }
    });
}
