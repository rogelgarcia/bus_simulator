// Reads exact runtime atlas coordinates at real mesh hits, at each requested GPU mip.
export async function probeReceiverIrradiance(page, points) {
    return page.evaluate(async points => {
        const T = await import('three'), e = window.__busSim.engine;
        const u = e._bakedLighting.receiverModes.enhanced.uniforms, targets = [];
        e.scene.traverseVisible(o => { if (o.isMesh && !o.isInstancedMesh) targets.push(o); });
        const scene = new T.Scene(), camera = new T.Camera();
        const material = new T.RawShaderMaterial({ glslVersion:T.GLSL3, uniforms:{
            atlas:u.receiverIndirectAtlas, coordinate:{value:new T.Vector3()}, level:{value:0}
        }, vertexShader:'in vec3 position; void main(){gl_Position=vec4(position,1.0);}',
        fragmentShader:'precision highp float; precision highp sampler2DArray; uniform sampler2DArray atlas; uniform vec3 coordinate; uniform float level; out vec4 result; void main(){result=textureLod(atlas,coordinate,level);}' });
        const quad = new T.Mesh(new T.PlaneGeometry(2,2), material); quad.frustumCulled = false; scene.add(quad);
        const target = new T.WebGLRenderTarget(1,1,{type:T.FloatType}), previous = e.renderer.getRenderTarget();
        const results = [];
        try {
            for (const {x,z,mip} of points) {
                const ray = new T.Raycaster(new T.Vector3(x,5,z),new T.Vector3(0,-1,0));
                const hit = ray.intersectObjects(targets,false)[0];
                if (!hit) throw new Error('No receiver at probe');
                const o = hit.object, g = o.geometry, ids = [hit.face.a,hit.face.b,hit.face.c];
                const vertices = ids.map(i => new T.Vector3().fromBufferAttribute(g.attributes.position,i));
                const weights = T.Triangle.getBarycoord(o.worldToLocal(hit.point.clone()),...vertices,new T.Vector3());
                const a = g.attributes.receiverAtlasCoordinate;
                if (!a || ids.some(i=>a.getW(i)!==1)) throw new Error('Probe receiver has no active atlas');
                const coordinate = [0,1,2].map(c=>ids.reduce((sum,i,k)=>sum+a.getComponent(i,c)*weights.getComponent(k),0));
                material.uniforms.coordinate.value.fromArray(coordinate); material.uniforms.level.value = mip;
                e.renderer.setRenderTarget(target); e.renderer.render(scene,camera);
                const pixel = new Float32Array(4); e.renderer.readRenderTargetPixels(target,0,0,1,1,pixel);
                const layer = Math.round(coordinate[2]);
                const rgb = [0,1,2].map(c=>pixel[c]*u.receiverIndirectScale.value[layer].getComponent(c)+u.receiverIndirectBias.value[layer].getComponent(c));
                results.push({x,z,mip,mesh:o.name,coordinate,rgb});
            }
        } finally { e.renderer.setRenderTarget(previous); target.dispose(); quad.geometry.dispose(); material.dispose(); e.updateFrame(0); }
        return results;
    }, points);
}
