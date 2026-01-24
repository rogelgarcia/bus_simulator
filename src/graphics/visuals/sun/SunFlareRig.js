// src/graphics/visuals/sun/SunFlareRig.js
// Lens flare + sun core visual attached to a directional sun light.
// @ts-check

import * as THREE from 'three';
import { getSunFlarePresetById } from './SunFlarePresets.js';

function clamp(value, min, max) {
    const num = Number(value);
    if (!Number.isFinite(num)) return min;
    return Math.max(min, Math.min(max, num));
}

function smoothstep(edge0, edge1, x) {
    const t = clamp((x - edge0) / Math.max(1e-6, edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
}

function applyTextureColorSpace(tex, { srgb = true } = {}) {
    if (!tex) return;
    if ('colorSpace' in tex) {
        tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        return;
    }
    if ('encoding' in tex) tex.encoding = srgb ? THREE.sRGBEncoding : THREE.LinearEncoding;
}

function configureFlareTexture(tex) {
    if (!tex) return;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    applyTextureColorSpace(tex, { srgb: true });
    tex.needsUpdate = true;
}

const SUN_FLARE_TEXTURE_URLS = Object.freeze({
    core: new URL('../../../../assets/public/lensflare/sun_core.svg', import.meta.url).href,
    star: new URL('../../../../assets/public/lensflare/sun_star.svg', import.meta.url).href,
    ghost: new URL('../../../../assets/public/lensflare/sun_ghost.svg', import.meta.url).href
});

let _cachedTextures = null;

function getOrCreateSunFlareTextures() {
    if (_cachedTextures) return _cachedTextures;
    const loader = new THREE.TextureLoader();
    const textures = {
        core: loader.load(SUN_FLARE_TEXTURE_URLS.core),
        star: loader.load(SUN_FLARE_TEXTURE_URLS.star),
        ghost: loader.load(SUN_FLARE_TEXTURE_URLS.ghost)
    };
    configureFlareTexture(textures.core);
    configureFlareTexture(textures.star);
    configureFlareTexture(textures.ghost);
    _cachedTextures = textures;
    return textures;
}

function getDirectionalSunDir(light, out) {
    const target = light?.target ?? null;
    if (!target) return out.set(0, 1, 0);
    return out.subVectors(light.position, target.position).normalize();
}

export class SunFlareRig {
    constructor({ light, settings = null } = {}) {
        if (!light) throw new Error('[SunFlareRig] light is required');

        this.light = light;
        this.group = new THREE.Group();
        this.group.name = 'SunFlareRig';
        this.group.frustumCulled = false;

        this._textures = getOrCreateSunFlareTextures();
        this._preset = getSunFlarePresetById(settings?.preset);
        this._strength = Number.isFinite(settings?.strength) ? clamp(settings.strength, 0, 2) : 1;
        this._enabled = settings?.enabled !== undefined ? !!settings.enabled : true;

        this._sunDir = new THREE.Vector3();
        this._sunWorldPos = new THREE.Vector3();
        this._ndc = new THREE.Vector3();
        this._camForward = new THREE.Vector3();
        this._size = new THREE.Vector2();
        this._tmp = new THREE.Vector3();
        this._tmpDir = new THREE.Vector3();

        this._visibility = 0;

        this._sprites = [];
        this._buildSprites();
    }

    _clearSprites() {
        for (const entry of this._sprites) {
            entry.sprite?.material?.dispose?.();
            entry.sprite?.removeFromParent?.();
        }
        this._sprites.length = 0;
    }

    _buildSprites() {
        this._clearSprites();
        const preset = this._preset;
        if (!preset) return;

        const makeSprite = (textureKey, { sizePx, intensity = 1, color = '#ffffff', kind = 'ghost', distance = 0 }) => {
            const tex = this._textures?.[textureKey] ?? null;
            if (!tex) return;
            const mat = new THREE.SpriteMaterial({
                map: tex,
                color: new THREE.Color(color),
                transparent: true,
                opacity: 1,
                depthTest: kind === 'core',
                depthWrite: false,
                blending: THREE.AdditiveBlending,
                toneMapped: false
            });
            const sprite = new THREE.Sprite(mat);
            sprite.frustumCulled = false;
            sprite.visible = false;
            sprite.renderOrder = kind === 'core' ? 950 : 960;
            this.group.add(sprite);
            this._sprites.push({
                sprite,
                kind,
                sizePx: Math.max(1, sizePx | 0),
                distance: clamp(distance, 0, 1),
                intensity: Number(intensity) || 0,
                baseColor: mat.color.clone()
            });
        };

        makeSprite('core', { ...preset.core, kind: 'core', distance: 0 });
        makeSprite('star', { ...preset.star, kind: 'ghost', distance: 0 });
        for (const ghost of Array.isArray(preset.ghosts) ? preset.ghosts : []) {
            makeSprite('ghost', { ...ghost, kind: 'ghost' });
        }
    }

    setSettings(settings) {
        const src = settings && typeof settings === 'object' ? settings : {};
        const nextPresetId = typeof src.preset === 'string' ? src.preset.trim().toLowerCase() : '';
        const presetChanged = nextPresetId && nextPresetId !== this._preset?.id;

        this._enabled = src.enabled !== undefined ? !!src.enabled : this._enabled;
        this._strength = Number.isFinite(src.strength) ? clamp(src.strength, 0, 2) : this._strength;

        if (presetChanged) {
            this._preset = getSunFlarePresetById(nextPresetId);
            this._buildSprites();
        }
    }

    update(engine) {
        const camera = engine?.camera ?? null;
        const renderer = engine?.renderer ?? null;
        if (!camera) return;

        this.group.visible = !!this._enabled;
        if (!this._enabled) return;

        getDirectionalSunDir(this.light, this._sunDir);
        const far = Number.isFinite(camera.far) ? camera.far : 2000;
        const dist = Math.max(50, far * 0.92);

        this._sunWorldPos.copy(camera.position).addScaledVector(this._sunDir, dist);

        this._ndc.copy(this._sunWorldPos).project(camera);
        const edge = Math.max(Math.abs(this._ndc.x), Math.abs(this._ndc.y));
        const inFront = this._ndc.z >= -1 && this._ndc.z <= 1;
        const edgeFade = 1 - smoothstep(0.92, 1.02, edge);

        this._camForward.set(0, 0, -1).applyQuaternion(camera.quaternion).normalize();
        const forwardDot = this._camForward.dot(this._sunDir);
        const forwardFade = smoothstep(0.02, 0.10, forwardDot);

        const target = inFront ? (edgeFade * forwardFade) : 0;
        this._visibility = this._visibility * 0.88 + target * 0.12;

        const intensity = this._strength * this._visibility;
        const viewportReady = !!renderer?.getSize;
        if (viewportReady) renderer.getSize(this._size);
        const viewportH = viewportReady ? Math.max(1, this._size.y) : 720;
        const fovRad = (Number.isFinite(camera.fov) ? camera.fov : 55) * (Math.PI / 180);
        const tanHalfFov = Math.tan(fovRad * 0.5);

        for (const entry of this._sprites) {
            const sprite = entry.sprite;
            if (!sprite) continue;

            const localIntensity = entry.intensity * intensity;
            sprite.visible = localIntensity > 1e-4;
            if (!sprite.visible) continue;

            const mat = sprite.material;
            if (mat?.color) mat.color.copy(entry.baseColor).multiplyScalar(localIntensity);

            if (entry.kind === 'core') {
                sprite.position.copy(this._sunWorldPos);
            } else if (entry.distance <= 0) {
                sprite.position.copy(this._sunWorldPos);
            } else {
                const x = this._ndc.x * (1 - entry.distance);
                const y = this._ndc.y * (1 - entry.distance);
                const sample = this._tmp.set(x, y, 0.5).unproject(camera);
                this._tmpDir.copy(sample).sub(camera.position).normalize();
                const ghostDist = Math.max(8, far * 0.25);
                sprite.position.copy(camera.position).addScaledVector(this._tmpDir, ghostDist);
            }

            const dToCam = sprite.position.distanceTo(camera.position);
            const worldUnitsPerPixel = (2 * dToCam * tanHalfFov) / viewportH;
            const s = entry.sizePx * worldUnitsPerPixel;
            sprite.scale.set(s, s, 1);
        }
    }

    dispose() {
        this._clearSprites();
        this.group.removeFromParent?.();
    }
}
