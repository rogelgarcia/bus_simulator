// Measure hover distance against patch footprints without raycasting the dense leaf geometry.
// @ts-check
import * as THREE from 'three';

/** @typedef {{label:string,cards:number,cardsPerSide?:number,stripDepthMeters:number,leafFraction?:number,castShadow:boolean}} RingDetails */
/** @typedef {{textureLeaves:number,leavesByLod:Record<string,number>,triangles:number,floorTriangles:number,rings?:RingDetails[]}} PatchDetails */
/** @typedef {{id:string,x:number,z:number,textureLeaves:number,surfaceHeight?:number,widthMeters?:number,depthMeters?:number,visible?:boolean,getPatchDetails?:(x:number,z:number)=>PatchDetails|null}} HoverField */
/** @param {{canvas:HTMLCanvasElement, camera:THREE.Camera, fields:HoverField[]}} options */
export function createGrassDebugV2PatchHover({ canvas, camera, fields }) {
    const tooltip = document.createElement('div');
    tooltip.className = 'grass-patch-distance'; tooltip.setAttribute('role', 'tooltip'); tooltip.hidden = true;
    document.body.append(tooltip);
    const pointer = new THREE.Vector2(), ndc = new THREE.Vector2(), raycaster = new THREE.Raycaster();
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hit = new THREE.Vector3(), selectedHit = new THREE.Vector3(), cameraPosition = new THREE.Vector3();
    const leafCountFormat = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
    let hovering = false;
    const hide = () => { hovering = false; tooltip.hidden = true; };
    const update = () => {
        if (!hovering) return;
        const rect = canvas.getBoundingClientRect();
        if (!rect.width || !rect.height || pointer.x < rect.left || pointer.x > rect.right
            || pointer.y < rect.top || pointer.y > rect.bottom) { hide(); return; }
        ndc.set((pointer.x - rect.left) / rect.width * 2 - 1, 1 - (pointer.y - rect.top) / rect.height * 2);
        camera.updateMatrixWorld(); camera.getWorldPosition(cameraPosition);
        raycaster.setFromCamera(ndc, camera);
        let distance = Infinity, selectedField = null;
        for (const field of fields) {
            if (field.visible === false) continue;
            plane.constant = -(field.surfaceHeight ?? (field.textureLeaves ? 0.01 : 0));
            if (raycaster.ray.intersectPlane(plane, hit)
                && Math.abs(hit.x - field.x) <= (field.widthMeters ?? 1) / 2 && Math.abs(hit.z - field.z) <= (field.depthMeters ?? 1) / 2) {
                const candidateDistance = cameraPosition.distanceTo(hit);
                if (candidateDistance < distance) { distance = candidateDistance; selectedField = field; selectedHit.copy(hit); }
            }
        }
        tooltip.hidden = !Number.isFinite(distance);
        if (tooltip.hidden) return;
        const lines = ['Distance: ' + distance.toFixed(2) + ' m'];
        const details = selectedField?.getPatchDetails?.(selectedHit.x, selectedHit.z);
        if (details) {
            lines.push('Texture: ' + (details.textureLeaves ? leafCountFormat.format(details.textureLeaves) : 'None'));
            if (!Object.keys(details.leavesByLod).length) lines.push('Leaves: 0');
            for (const [lod, leaves] of Object.entries(details.leavesByLod))
                lines.push(lod + ': ' + leafCountFormat.format(leaves));
            for (const ring of details.rings ?? [])
                lines.push(ring.label + ': ' + ring.cards + ' cards' + (ring.cardsPerSide ? ' (' + ring.cardsPerSide + ' per side)' : '') + ' · ' + Math.round(ring.stripDepthMeters * 100) + ' cm depth' + (ring.leafFraction === undefined ? '' : ' · ' + Math.round(ring.leafFraction * 100) + '% leaves') + ' · shadows ' + (ring.castShadow ? 'on' : 'off'));
            lines.push('Triangles: ' + details.triangles.toLocaleString('en-US'));
        }
        tooltip.textContent = lines.join('\n');
        const width = tooltip.offsetWidth, height = tooltip.offsetHeight;
        const left = pointer.x + 14 + width > innerWidth - 8 ? pointer.x - width - 14 : pointer.x + 14;
        const top = pointer.y + 16 + height > innerHeight - 8 ? pointer.y - height - 16 : pointer.y + 16;
        tooltip.style.left = Math.max(8, left) + 'px'; tooltip.style.top = Math.max(8, top) + 'px';
    };
    const move = event => {
        if (event.pointerType === 'touch' || event.buttons) { hide(); return; }
        pointer.set(event.clientX, event.clientY); hovering = true; update();
    };
    canvas.addEventListener('pointermove', move); canvas.addEventListener('pointerup', move);
    canvas.addEventListener('pointerdown', hide); canvas.addEventListener('pointerleave', hide);
    canvas.addEventListener('pointercancel', hide); window.addEventListener('blur', hide);
    return Object.freeze({
        update,
        dispose: () => {
            canvas.removeEventListener('pointermove', move); canvas.removeEventListener('pointerup', move);
            canvas.removeEventListener('pointerdown', hide); canvas.removeEventListener('pointerleave', hide);
            canvas.removeEventListener('pointercancel', hide); window.removeEventListener('blur', hide);
            tooltip.remove();
        }
    });
}
