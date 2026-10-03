// Displays cached LOD assignments, field outlines and camera-distance limits for the transition lab.
// @ts-check
import * as THREE from 'three';
import { DEFAULT_TRANSITION_DISTANCES, TRANSITION_LEVELS } from './GrassDebugV2TransitionSelection.js';

export const GRASS_TRANSITION_COLORS = Object.freeze([0x42d9e8, 0x5595ff, 0xf1d35a, 0xef9147, 0xad76eb]);

/** @typedef {import('./GrassDebugV2TransitionSelection.js').TransitionCell} TransitionCell */

function createRingGeometry() {
    const points = [];
    for (let i = 0; i < 128; i++) {
        const angle = i * Math.PI * 2 / 128;
        points.push(new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle)));
    }
    return new THREE.BufferGeometry().setFromPoints(points);
}

/** @param {number} color */
function createRingLabel(color) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 96;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Grass LOD helper labels require a 2D canvas context.');
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    const material = new THREE.SpriteMaterial({ map: texture, depthTest: false, depthWrite: false, toneMapped: false });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(2.4, 0.45, 1);
    sprite.renderOrder = 1003;
    const colorCss = `#${color.toString(16).padStart(6, '0')}`;
    return {
        sprite,
        /** @param {string} text */
        setText(text) {
            context.clearRect(0, 0, canvas.width, canvas.height);
            context.fillStyle = 'rgba(13, 23, 20, 0.88)';
            context.fillRect(0, 0, canvas.width, canvas.height);
            context.fillStyle = colorCss;
            context.fillRect(0, 0, 12, canvas.height);
            context.fillStyle = '#f3f7ed';
            context.font = '600 36px "Segoe UI", sans-serif';
            context.textBaseline = 'middle';
            context.textAlign = 'center';
            context.fillText(text, canvas.width / 2, canvas.height / 2);
            texture.needsUpdate = true;
        },
        dispose() { texture.dispose(); material.dispose(); }
    };
}

/** @param {readonly TransitionCell[]} cells */
function createFieldOutlines(cells) {
    const edges = new Map();
    /** @param {number} ax @param {number} az @param {number} bx @param {number} bz */
    const add = (ax, az, bx, bz) => {
        const a = `${Math.round(ax * 1e6)},${Math.round(az * 1e6)}`;
        const b = `${Math.round(bx * 1e6)},${Math.round(bz * 1e6)}`;
        const key = a < b ? `${a}/${b}` : `${b}/${a}`;
        if (edges.has(key)) edges.delete(key);
        else edges.set(key, [ax, 0.185, az, bx, 0.185, bz]);
    };
    for (const cell of cells) {
        const minX = cell.minX ?? cell.centerX - 0.5;
        const maxX = cell.maxX ?? cell.centerX + 0.5;
        const minZ = cell.minZ ?? cell.centerZ - 0.5;
        const maxZ = cell.maxZ ?? cell.centerZ + 0.5;
        add(minX, minZ, maxX, minZ);
        add(maxX, minZ, maxX, maxZ);
        add(maxX, maxZ, minX, maxZ);
        add(minX, maxZ, minX, minZ);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(Array.from(edges.values()).flat(), 3));
    const material = new THREE.LineBasicMaterial({ color: 0xe5ede1, transparent: true, opacity: 0.65, depthTest: false, depthWrite: false, toneMapped: false });
    const outline = new THREE.LineSegments(geometry, material);
    outline.name = 'Grass transition field boundaries';
    outline.renderOrder = 1001;
    return outline;
}

/** @param {{cells:readonly TransitionCell[],distances?:readonly number[]}} options */
export function createGrassDebugV2TransitionHelpers({ cells, distances = DEFAULT_TRANSITION_DISTANCES }) {
    const overlayScene = new THREE.Scene();
    const group = new THREE.Group();
    group.name = 'Grass transition helpers';
    overlayScene.add(group);
    const geometry = new THREE.PlaneGeometry(1, 1);
    geometry.rotateX(-Math.PI / 2);
    const material = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.2, depthTest: false, depthWrite: false, toneMapped: false });
    const overlay = new THREE.InstancedMesh(geometry, material, cells.length);
    overlay.name = 'Grass transition cell LOD colors';
    overlay.renderOrder = 1000;
    overlay.frustumCulled = false;
    const matrix = new THREE.Matrix4();
    const palette = GRASS_TRANSITION_COLORS.map((color) => new THREE.Color(color));
    const previousLevels = new Uint8Array(cells.length).fill(255);
    for (let i = 0; i < cells.length; i++) {
        const cell = cells[i];
        const width = cell.maxX === undefined ? 1 : cell.maxX - cell.minX;
        const depth = cell.maxZ === undefined ? 1 : cell.maxZ - cell.minZ;
        matrix.makeScale(width, 1, depth);
        matrix.setPosition(cell.centerX, 0.18, cell.centerZ);
        overlay.setMatrixAt(i, matrix);
        overlay.setColorAt(i, palette[4]);
    }
    overlay.instanceMatrix.needsUpdate = true;
    if (overlay.instanceColor) overlay.instanceColor.setUsage(THREE.DynamicDrawUsage);
    const outlines = createFieldOutlines(cells);
    const ringGroup = new THREE.Group();
    ringGroup.name = 'Grass transition cached camera distance limits';
    ringGroup.position.y = 0.23;
    const ringGeometry = createRingGeometry();
    const rings = GRASS_TRANSITION_COLORS.slice(0, 4).map((color, index) => {
        const ring = new THREE.LineLoop(ringGeometry, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false, toneMapped: false }));
        ring.name = `${TRANSITION_LEVELS[index]} outer distance limit`;
        ring.renderOrder = 1002;
        ringGroup.add(ring);
        return ring;
    });
    const labels = GRASS_TRANSITION_COLORS.map(createRingLabel);
    for (const label of labels) ringGroup.add(label.sprite);
    const cachedDistances = new Float64Array(4).fill(NaN);

    /** @param {readonly number[]} limits */
    function updateDistances(limits) {
        if (limits.length !== 4 || limits.some((value, i) => !Number.isFinite(value) || value <= 0 || (i > 0 && value <= limits[i - 1]))) {
            throw new RangeError('Grass transition helpers require four increasing positive limits.');
        }
        let changed = false;
        for (let i = 0; i < 4; i++) if (limits[i] !== cachedDistances[i]) changed = true;
        if (!changed) return;
        for (let i = 0; i < 4; i++) {
            cachedDistances[i] = limits[i];
            rings[i].scale.set(limits[i], 1, limits[i]);
            labels[i].setText(`${TRANSITION_LEVELS[i]} < ${Number(limits[i].toFixed(2))} m`);
            labels[i].sprite.position.set(limits[i] * 0.707, 0.32 + i * 0.12, -limits[i] * 0.707);
        }
        labels[4].setText(`LOD4 ≥ ${Number(limits[3].toFixed(2))} m`);
        labels[4].sprite.position.set(-limits[3] * 0.76, 0.32, -limits[3] * 0.76);
    }
    updateDistances(distances);
    group.add(overlay, outlines, ringGroup);
    return Object.freeze({
        group,
        /** @param {Uint8Array|readonly number[]} levels @param {{x:number,z:number}} cameraPosition @param {readonly number[]|null} effectiveDistances */
        update(levels, cameraPosition, effectiveDistances) {
            if (levels.length !== cells.length) throw new RangeError('Grass helper LOD count must match the cell count.');
            let changed = false;
            for (let i = 0; i < levels.length; i++) {
                if (levels[i] === previousLevels[i]) continue;
                if (!Number.isInteger(levels[i]) || levels[i] < 0 || levels[i] > 4) throw new RangeError(`Invalid grass helper LOD for cell ${i}.`);
                previousLevels[i] = levels[i];
                overlay.setColorAt(i, palette[levels[i]]);
                changed = true;
            }
            if (changed && overlay.instanceColor) overlay.instanceColor.needsUpdate = true;
            ringGroup.position.x = cameraPosition.x;
            ringGroup.position.z = cameraPosition.z;
            ringGroup.visible = effectiveDistances !== null;
            if (effectiveDistances !== null) updateDistances(effectiveDistances);
        },
        /** @param {boolean} visible */
        setVisible(visible) { group.visible = visible; },
        /** @param {THREE.WebGLRenderer} renderer @param {THREE.Camera} camera */
        render(renderer, camera) {
            if (!group.visible) return;
            const autoClear = renderer.autoClear, autoReset = renderer.info.autoReset;
            renderer.autoClear = false; renderer.info.autoReset = false;
            try { renderer.render(overlayScene, camera); }
            finally { renderer.autoClear = autoClear; renderer.info.autoReset = autoReset; }
        },
        dispose() {
            group.removeFromParent();
            geometry.dispose();
            material.dispose();
            outlines.geometry.dispose();
            outlines.material.dispose();
            ringGeometry.dispose();
            for (const ring of rings) ring.material.dispose();
            for (const label of labels) label.dispose();
            group.clear();
        }
    });
}
