// Three r183 uploads only level zero for DataArrayTexture; onUpdate supplies the authenticated remaining levels.
// @ts-check
import * as THREE from 'three';

export function createReceiverHdrTexture(renderer, levels) {
    if (THREE.REVISION !== '183') throw new Error('Receiver HDR upload requires audited Three r183.');
    const base=levels[0], gl=renderer.getContext();
    const texture = new THREE.DataArrayTexture(base.data,base.width,base.height,base.depth);
    texture.format=THREE.RGBFormat; texture.type=THREE.UnsignedInt5999Type; texture.internalFormat='RGB9_E5';
    texture.mipmaps=levels;
    texture.minFilter=levels.length>1 ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
    texture.magFilter=THREE.LinearFilter; texture.generateMipmaps=false;
    texture.onUpdate=()=> {
        // The public callback runs while this texture is bound, after texStorage3D allocates all explicit levels.
        for (let mip=1;mip<levels.length;mip++) {
            const level=levels[mip];
            gl.texSubImage3D(gl.TEXTURE_2D_ARRAY,mip,0,0,0,level.width,level.height,level.depth,gl.RGB,gl.UNSIGNED_INT_5_9_9_9_REV,level.data);
        }
    };
    texture.needsUpdate=true;
    return texture;
}
