// Mouse drag-look and the shared WASDQE input for inspecting the grass field.
import * as THREE from 'three';
import { GrassDebugV2CameraInput } from './GrassDebugV2CameraInput.js';

export function createGrassDebugV2FreeCamera({ camera, canvas, onChange, onSpeedChange }) {
    let pointer = null, lastX = 0, lastY = 0;
    const rotation = new THREE.Euler(0, 0, 0, 'YXZ');
    const input = new GrassDebugV2CameraInput({
        camera, enabled: true, minHeight: 0.008,
        panWorld: (x, y, z) => { camera.position.add(new THREE.Vector3(x, y, z)); onChange(); }
    }, { speed: Math.pow(10, -0.5), boostMultiplier: 5 });
    const setSpeed = value => {
        input.speed = THREE.MathUtils.clamp(value, 0.01, 5);
        onSpeedChange(input.speed);
    };
    const down = event => {
        if (event.button !== 0 && event.button !== 2) return;
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
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);
    canvas.addEventListener('lostpointercapture', release);
    canvas.addEventListener('wheel', wheel, { passive: false });
    canvas.addEventListener('contextmenu', context);
    window.addEventListener('blur', release);
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
        }
    });
}
