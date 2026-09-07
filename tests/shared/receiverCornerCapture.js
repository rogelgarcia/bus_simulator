// Captures actual sidewalk and foundation triangles with independent unlit wireframe materials.
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function captureReceiverCorner(page, root, mode) {
    const geometry = await page.evaluate(async () => {
        const T = await import('three'), e = window.__busSim.engine;
        const scene = new T.Scene(); scene.background = new T.Color('#18212b');
        const bounds = new T.Box3(new T.Vector3(51,-.1,27),new T.Vector3(59,1.2,35));
        const planes = [new T.Plane(new T.Vector3(1,0,0),-51),new T.Plane(new T.Vector3(-1,0,0),59),
            new T.Plane(new T.Vector3(0,0,1),-27),new T.Plane(new T.Vector3(0,0,-1),35),new T.Plane(new T.Vector3(0,-1,0),1.2)];
        const output = [];
        e.scene.updateMatrixWorld(true);
        e.scene.traverse(o => {
            if (!o.isMesh || o.isInstancedMesh || !['Sidewalk','BuildingSlab'].includes(o.name)) return;
            const g = o.geometry, p = g.attributes.position, index = g.index;
            const count = index?.count ?? p.count, positions = [], triangles = [];
            for (let i=0;i<count;i+=3) {
                const vertices = [0,1,2].map(k=>new T.Vector3().fromBufferAttribute(p,index?index.getX(i+k):i+k).applyMatrix4(o.matrixWorld));
                if (!new T.Box3().setFromPoints(vertices).intersectsBox(bounds)) continue;
                positions.push(...vertices.flatMap(v=>v.toArray())); triangles.push({offset:i,vertices:vertices.map(v=>v.toArray())});
            }
            if (!positions.length) return;
            const geometry = new T.BufferGeometry(); geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
            const color = o.name === 'Sidewalk' ? '#70b6df' : '#e0a868';
            const material = new T.MeshBasicMaterial({color,side:T.DoubleSide,clippingPlanes:planes,polygonOffset:true,polygonOffsetFactor:1,polygonOffsetUnits:1});
            const mesh = new T.Mesh(geometry,material); scene.add(mesh);
            scene.add(new T.LineSegments(new T.WireframeGeometry(geometry),new T.LineBasicMaterial({color:'#15222c',clippingPlanes:planes})));
            output.push({name:o.name,triangles,plan:o.userData.buildingSlabPlan,source:o.parent.userData.slabDebug});
        });
        const camera = new T.OrthographicCamera(-5,5,2.8125,-2.8125,.1,100);
        window.cornerCapture = {scene,camera,clipping:e.renderer.localClippingEnabled};
        e.renderer.localClippingEnabled=true;
        return output;
    });
    await writeFile(path.join(root,`corner-${mode}-geometry.json`),JSON.stringify(geometry));
    for (const pose of ['oblique','top']) {
        await page.evaluate(pose=>{
            const {engine:e}=window.__busSim, {scene,camera}=window.cornerCapture;
            camera.up.set(0,pose==='top'?0:1,pose==='top'?-1:0);
            camera.position.set(55+(pose==='top'?0:8),pose==='top'?15:10,31+(pose==='top'?0:8));
            camera.lookAt(55,.19,31); camera.updateMatrixWorld(true); e.renderer.render(scene,camera);
        },pose);
        await page.screenshot({path:path.join(root,`corner-${mode}-wireframe-${pose}.png`)});
    }
    await page.evaluate(()=>{
        const {engine:e}=window.__busSim,{scene,clipping}=window.cornerCapture;
        scene.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});
        e.renderer.localClippingEnabled=clipping;delete window.cornerCapture;e.updateFrame(0);
    });
}
