// Mouse drag-look and the shared WASDQE input for inspecting the grass field.
import * as THREE from 'three';
import { GrassDebugV2CameraInput } from './GrassDebugV2CameraInput.js';

/** @param {{camera:THREE.Camera,canvas:HTMLCanvasElement,onChange:()=>void,onSpeedChange:(speed:number)=>void,horizontal?:boolean,lookButtons?:number[],onReset?:(()=>void)|null}} options */
export function createGrassDebugV2FreeCamera({ camera, canvas, onChange, onSpeedChange,
    horizontal = false, lookButtons = [0, 2], onReset = null }) {
    let pointer = null, lastX = 0, lastY = 0;
    const rotation = new THREE.Euler(0, 0, 0, 'YXZ');
    const input = new GrassDebugV2CameraInput({
        camera, enabled: true, minHeight: 0.008,
        panWorld: (x, y, z) => { camera.position.add(new THREE.Vector3(x, y, z)); onChange(); }
    }, { speed: Math.pow(10, -0.5), boostMultiplier: 5, horizontal });
    const setSpeed = value => {
        input.speed = THREE.MathUtils.clamp(value, 0.01, 5);
        onSpeedChange(input.speed);
    };
    const down = event => {
        if (!lookButtons.includes(event.button)) return;
        event.preventDefault(); canvas.focus();
        pointer = event.pointerId; lastX = event.clientX; lastY = event.clientY;
        canvas.setPointerCapture(pointer);
    };
    const move = event => {
        if (pointer !== event.pointerId) return;
        rotation.setFromQuaternion(camera.quaternion, 'YXZ');
        rotation.y -= (event.clientX - lastX) * 0.003;
        rotation.x = THREE.MathUtils.clamp(rotation.x - (event.clientY - lastY) * 0.003, -Math.PI / 2 + 0.01, Math.PI / 2 - 0.01);
        rotation.z = 0; camera.quaternion.setFromEuler(rotation); camera.up.set(0, 1, 0);
        lastX = event.clientX; lastY = event.clientY; onChange();
    };
    const release = () => {
        if (pointer !== null && canvas.hasPointerCapture(pointer)) canvas.releasePointerCapture(pointer);
        pointer = null;
    };
    const wheel = event => {
        event.preventDefault(); canvas.focus();
        const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? canvas.clientHeight : 1;
        const distance = event.deltaY * unit * input.speed * 0.002 * (event.shiftKey ? 5 : 1);
        camera.position.add(new THREE.Vector3(0, 0, distance).applyQuaternion(camera.quaternion));
        camera.position.y = Math.max(0.008, camera.position.y);
        onChange();
    };
    const context = event => event.preventDefault();
    const auxiliary = event => { if (lookButtons.includes(event.button)) event.preventDefault(); };
    const reset = event => {
        if (!onReset || event.code !== 'KeyR' || event.repeat || event.ctrlKey || event.altKey || event.metaKey
            || event.isComposing || event.target?.isContentEditable
            || ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target?.tagName)) return;
        event.preventDefault(); input.clear(); release(); onReset();
    };
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);
    canvas.addEventListener('lostpointercapture', release);
    canvas.addEventListener('wheel', wheel, { passive: false });
    canvas.addEventListener('contextmenu', context);
    canvas.addEventListener('auxclick', auxiliary);
    window.addEventListener('blur', release);
    if (onReset) window.addEventListener('keydown', reset);
    setSpeed(input.speed);
    return Object.freeze({
        update: dt => input.update(dt), setSpeed, clear: () => { input.clear(); release(); },
        getSpeed: () => input.speed,
        dispose() {
            input.dispose(); release();
            canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move);
            canvas.removeEventListener('pointerup', release); canvas.removeEventListener('pointercancel', release);
            canvas.removeEventListener('lostpointercapture', release); canvas.removeEventListener('wheel', wheel);
            canvas.removeEventListener('contextmenu', context); window.removeEventListener('blur', release);
            canvas.removeEventListener('auxclick', auxiliary); window.removeEventListener('keydown', reset);
        }
    });
}
