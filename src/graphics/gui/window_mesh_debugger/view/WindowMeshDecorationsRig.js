// src/graphics/gui/window_mesh_debugger/view/WindowMeshDecorationsRig.js
// Renders configurable window decoration meshes (sill, header, trim) for the Window Mesh Debugger.
// @ts-check

import * as THREE from 'three';
import { resolvePbrMaterialUrls } from '../../../content3d/catalogs/PbrMaterialCatalog.js';

const EPS = 1e-6;
const QUANT = 1000;

function q(value) {
    return Math.round(Number(value) * QUANT);
}

function clamp(value, min, max, fallback) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.max(min, Math.min(max, num));
}

function normalizeHexColor(value, fallback) {
    if (Number.isFinite(value)) return (Number(value) >>> 0) & 0xffffff;

    const raw = typeof value === 'string' ? value.trim() : '';
    if (!raw) return fallback;
    const v = raw.startsWith('#')
        ? raw.slice(1)
        : (raw.toLowerCase().startsWith('0x') ? raw.slice(2) : raw);
    if (v.length === 6 && /^[0-9a-fA-F]{6}$/.test(v)) return parseInt(v, 16) & 0xffffff;
    if (v.length === 3 && /^[0-9a-fA-F]{3}$/.test(v)) {
        const r = v[0];
        const g = v[1];
        const b = v[2];
        return parseInt(`${r}${r}${g}${g}${b}${b}`, 16) & 0xffffff;
    }
    return fallback;
}

function applyTextureColorSpace(tex, { srgb = true } = {}) {
    if (!tex) return;
    if ('colorSpace' in tex) {
        tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        return;
    }
    if ('encoding' in tex) tex.encoding = srgb ? THREE.sRGBEncoding : THREE.LinearEncoding;
}

function ensureUv2(geo) {
    const g = geo?.isBufferGeometry ? geo : null;
    const uv = g?.attributes?.uv ?? null;
    if (!uv?.isBufferAttribute) return;
    if (g.attributes.uv2) return;
    g.setAttribute('uv2', new THREE.BufferAttribute(uv.array.slice(0), 2));
}

function applyUvTransform(tex, uv) {
    if (!tex) return;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    const repU = clamp(uv?.repeatU, 0.01, 100.0, 1.0);
    const repV = clamp(uv?.repeatV, 0.01, 100.0, 1.0);
    const offU = Number(uv?.offsetU) || 0.0;
    const offV = Number(uv?.offsetV) || 0.0;
    const rotDeg = Number(uv?.rotationDeg) || 0.0;
    tex.repeat.set(repU, repV);
    tex.offset.set(offU, offV);
    tex.center.set(0.5, 0.5);
    tex.rotation = (rotDeg * Math.PI) / 180.0;
}

function buildRectOutline(out, { x0, x1, y0, y1, reverse }) {
    if (!reverse) {
        out.moveTo(x0, y0);
        out.lineTo(x1, y0);
        out.lineTo(x1, y1);
        out.lineTo(x0, y1);
        out.lineTo(x0, y0);
        return;
    }
    out.moveTo(x0, y0);
    out.lineTo(x0, y1);
    out.lineTo(x1, y1);
    out.lineTo(x1, y0);
    out.lineTo(x0, y0);
}

function buildArchedOutline(out, { x0, x1, y0, yTop, yChord, archRise, curveSegments, reverse }) {
    if (!(archRise > EPS) || !(Math.abs(x1 - x0) > EPS)) {
        buildRectOutline(out, { x0, x1, y0, y1: yTop, reverse });
        return;
    }

    const w = Math.abs(x1 - x0);
    const hRise = archRise;
    const R = (w * w) / (8 * hRise) + hRise / 2;
    const cx = (x0 + x1) * 0.5;
    const cy = yChord + hRise - R;

    const rightAngle = Math.atan2(yChord - cy, x1 - cx);
    const leftAngle = Math.atan2(yChord - cy, x0 - cx);

    if (!reverse) {
        out.moveTo(x0, y0);
        out.lineTo(x1, y0);
        out.lineTo(x1, yChord);
        out.absarc(cx, cy, R, rightAngle, leftAngle, false);
        out.lineTo(x0, y0);
        return;
    }

    out.moveTo(x0, y0);
    out.lineTo(x0, yChord);
    out.absarc(cx, cy, R, leftAngle, rightAngle, true);
    out.lineTo(x1, y0);
    out.lineTo(x0, y0);
    if (Number.isFinite(curveSegments) && out.curves) {
        for (const c of out.curves) {
            if (c?.isEllipseCurve) c.aClockwise = reverse;
        }
    }
}

function buildWindowOutline(out, { width, height, wantsArch, archHeightRatio, curveSegments, reverse }) {
    const w = Math.max(0.01, Number(width) || 1);
    const h = Math.max(0.01, Number(height) || 1);
    const x0 = -w * 0.5;
    const x1 = w * 0.5;
    const y0 = -h * 0.5;
    const yTop = h * 0.5;

    if (!wantsArch) {
        buildRectOutline(out, { x0, x1, y0, y1: yTop, reverse });
        return;
    }

    const riseCandidate = Math.max(0, Number(archHeightRatio) || 0) * w;
    const archRise = Math.min(riseCandidate, Math.max(0, h - 0.05));
    const yChord = yTop - archRise;
    buildArchedOutline(out, { x0, x1, y0, yTop, yChord, archRise, curveSegments, reverse });
}

function buildTrimGeometry({ windowWidth, windowHeight, archEnabled, archHeightRatio, bandWidth, innerGap, depth, curveSegments }) {
    const bw = Math.max(0, Number(bandWidth) || 0);
    const ig = Math.max(0, Number(innerGap) || 0);
    const innerW = Math.max(0.01, Number(windowWidth) || 1) + ig * 2;
    const innerH = Math.max(0.01, Number(windowHeight) || 1) + ig * 2;
    const outerW = innerW + bw * 2;
    const outerH = innerH + bw * 2;

    const wantsArch = !!archEnabled && (Number(archHeightRatio) || 0) > EPS;

    const outer = new THREE.Shape();
    buildWindowOutline(outer, {
        width: outerW,
        height: outerH,
        wantsArch,
        archHeightRatio,
        curveSegments,
        reverse: false
    });

    const hole = new THREE.Path();
    buildWindowOutline(hole, {
        width: innerW,
        height: innerH,
        wantsArch,
        archHeightRatio,
        curveSegments,
        reverse: true
    });
    outer.holes.push(hole);

    const d = Math.max(0.001, Number(depth) || 0.02);
    const geo = new THREE.ExtrudeGeometry(outer, {
        depth: d,
        steps: 1,
        bevelEnabled: false,
        curveSegments: Math.max(6, curveSegments | 0)
    });
    geo.computeVertexNormals();
    geo.computeBoundingBox();
    ensureUv2(geo);
    return geo;
}

function buildBoxWithBackAtZero({ width, height, depth }) {
    const w = Math.max(0.01, Number(width) || 1);
    const h = Math.max(0.005, Number(height) || 0.05);
    const d = Math.max(0.001, Number(depth) || 0.02);
    const geo = new THREE.BoxGeometry(w, h, d);
    geo.translate(0, 0, d * 0.5);
    geo.computeVertexNormals();
    geo.computeBoundingBox();
    ensureUv2(geo);
    return geo;
}

function setMaterialWireframe(mat, enabled) {
    if (!mat || typeof mat !== 'object') return;
    if (!('wireframe' in mat)) return;
    mat.wireframe = !!enabled;
    mat.needsUpdate = true;
}

export class WindowMeshDecorationsRig {
    constructor({ renderer, texLoader }) {
        this._renderer = renderer ?? null;
        this._texLoader = texLoader ?? new THREE.TextureLoader();

        this.group = new THREE.Group();
        this.group.name = 'window_decorations';

        this._dummy = new THREE.Object3D();
        this._geometryKeys = { sill: '', header: '', trim: '' };
        this._materialKeys = { sill: '', header: '', trim: '' };
        this._renderMode = 'solid';

        this._meshes = { sill: null, header: null, trim: null };
        this._materials = { sill: null, header: null, trim: null };
        this._savedMaterialsForNormals = { sill: null, header: null, trim: null };
        this._texCaches = { sill: new Map(), header: new Map(), trim: new Map() };
    }

    dispose() {
        for (const type of Object.keys(this._meshes)) {
            const mesh = this._meshes[type];
            if (mesh) {
                this.group.remove(mesh);
                mesh.geometry?.dispose?.();
            }
            this._materials[type]?.dispose?.();
            this._meshes[type] = null;
            this._materials[type] = null;
            this._savedMaterialsForNormals[type] = null;
        }

        for (const cache of Object.values(this._texCaches)) {
            for (const tex of cache.values()) tex?.dispose?.();
            cache.clear();
        }
    }

    setRenderMode(mode, normalMaterial) {
        const next = typeof mode === 'string' ? mode : 'solid';
        this._renderMode = next;

        const normals = next === 'normals';
        const wireframe = next === 'wireframe';

        for (const type of Object.keys(this._meshes)) {
            const mesh = this._meshes[type];
            if (!mesh) continue;

            if (normals) {
                if (mesh.material !== normalMaterial) {
                    this._savedMaterialsForNormals[type] = mesh.material;
                    mesh.material = normalMaterial;
                }
                continue;
            }

            if (mesh.material === normalMaterial && this._savedMaterialsForNormals[type]) {
                mesh.material = this._savedMaterialsForNormals[type];
            }

            const mat = this._materials[type];
            setMaterialWireframe(mat, wireframe);
        }
    }

    update({ wallFrontZ, windowSettings, instances, curveSegments = 24 } = {}, decorationState) {
        const wFront = Number.isFinite(wallFrontZ) ? wallFrontZ : 0;
        const s = windowSettings && typeof windowSettings === 'object' ? windowSettings : {};
        const list = Array.isArray(instances) ? instances : [];
        const winW = Math.max(0.01, Number(s.width) || 1);
        const winH = Math.max(0.01, Number(s.height) || 1);
        const archEnabled = !!s?.arch?.enabled;
        const archHeightRatio = Number(s?.arch?.heightRatio) || 0;

        const deco = decorationState && typeof decorationState === 'object' ? decorationState : {};
        const types = ['sill', 'header', 'trim'];

        for (const type of types) {
            const raw = deco[type] && typeof deco[type] === 'object' ? deco[type] : {};
            const enabled = !!raw.enabled;
            const shadows = raw.shadows && typeof raw.shadows === 'object' ? raw.shadows : {};
            const castShadow = shadows.cast !== false;
            const receiveShadow = shadows.receive !== false;
            const off = raw.offset && typeof raw.offset === 'object' ? raw.offset : {};
            const offsetX = Number(off.x) || 0;
            const offsetY = Number(off.y) || 0;
            const offsetZ = Number.isFinite(Number(off.z)) ? Number(off.z) : 0.002;

            if (!enabled) {
                const mesh = this._meshes[type];
                if (mesh) mesh.visible = false;
                continue;
            }

            let geometryKey = '';
            let geo = null;
            if (type === 'sill' || type === 'header') {
                const widthScale = clamp(raw.widthScale, 0.2, 4.0, 1.0);
                const height = clamp(raw.height, 0.001, 2.0, 0.05);
                const depth = clamp(raw.depth, 0.001, 2.0, 0.1);
                geometryKey = `${type}|w:${q(winW * widthScale)}|h:${q(height)}|d:${q(depth)}`;
                if (geometryKey !== this._geometryKeys[type]) {
                    geo = buildBoxWithBackAtZero({ width: winW * widthScale, height, depth });
                }
            } else {
                const bandWidth = clamp(raw.bandWidth, 0.0, 2.0, 0.08);
                const innerGap = clamp(raw.innerGap, 0.0, 1.0, 0.005);
                const depth = clamp(raw.depth, 0.001, 2.0, 0.04);
                geometryKey = `${type}|w:${q(winW)}|h:${q(winH)}|arch:${archEnabled ? 1 : 0}|ahr:${q(archHeightRatio)}|bw:${q(bandWidth)}|ig:${q(innerGap)}|d:${q(depth)}|cs:${curveSegments | 0}`;
                if (geometryKey !== this._geometryKeys[type]) {
                    geo = buildTrimGeometry({
                        windowWidth: winW,
                        windowHeight: winH,
                        archEnabled,
                        archHeightRatio,
                        bandWidth,
                        innerGap,
                        depth,
                        curveSegments
                    });
                }
            }

            const count = list.length;
            let mesh = this._meshes[type];
            if (!mesh || mesh.count !== count) {
                if (mesh) {
                    this.group.remove(mesh);
                    mesh.geometry?.dispose?.();
                }
                this._materials[type]?.dispose?.();
                const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0.0 });
                const seedGeo = (() => {
                    if (geo) return geo;
                    if (type === 'sill' || type === 'header') {
                        const widthScale = clamp(raw.widthScale, 0.2, 4.0, 1.0);
                        const height = clamp(raw.height, 0.001, 2.0, 0.05);
                        const depth = clamp(raw.depth, 0.001, 2.0, 0.1);
                        return buildBoxWithBackAtZero({ width: winW * widthScale, height, depth });
                    }
                    const bandWidth = clamp(raw.bandWidth, 0.0, 2.0, 0.08);
                    const innerGap = clamp(raw.innerGap, 0.0, 1.0, 0.005);
                    const depth = clamp(raw.depth, 0.001, 2.0, 0.04);
                    return buildTrimGeometry({
                        windowWidth: winW,
                        windowHeight: winH,
                        archEnabled,
                        archHeightRatio,
                        bandWidth,
                        innerGap,
                        depth,
                        curveSegments
                    });
                })();

                mesh = new THREE.InstancedMesh(seedGeo, material, count);
                mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
                mesh.frustumCulled = false;
                this.group.add(mesh);
                this._meshes[type] = mesh;
                this._materials[type] = material;
                this._geometryKeys[type] = geometryKey;
                this._materialKeys[type] = '';
                geo = null;
            }

            if (geo) {
                mesh.geometry?.dispose?.();
                mesh.geometry = geo;
                this._geometryKeys[type] = geometryKey;
            } else if (geometryKey) {
                this._geometryKeys[type] = geometryKey;
            }

            mesh.visible = true;
            mesh.castShadow = !!castShadow;
            mesh.receiveShadow = !!receiveShadow;

            if (type === 'sill' || type === 'header') {
                const height = clamp(raw.height, 0.001, 2.0, 0.05);
                const gap = Number(raw.gap) || 0;
                const yBase = type === 'sill'
                    ? (-winH * 0.5 - gap - height * 0.5)
                    : (winH * 0.5 + gap + height * 0.5);

                for (let i = 0; i < count; i++) {
                    const entry = list[i];
                    const p = entry?.position && typeof entry.position === 'object' ? entry.position : entry;
                    const yaw = Number(entry?.yaw) || 0;
                    const x = (Number(p?.x) || 0) + offsetX;
                    const y = (Number(p?.y) || 0) + yBase + offsetY;
                    const z = wFront + offsetZ;
                    this._dummy.position.set(x, y, z);
                    this._dummy.rotation.set(0, yaw, 0);
                    this._dummy.updateMatrix();
                    mesh.setMatrixAt(i, this._dummy.matrix);
                }
                mesh.instanceMatrix.needsUpdate = true;
            } else {
                for (let i = 0; i < count; i++) {
                    const entry = list[i];
                    const p = entry?.position && typeof entry.position === 'object' ? entry.position : entry;
                    const yaw = Number(entry?.yaw) || 0;
                    const x = (Number(p?.x) || 0) + offsetX;
                    const y = (Number(p?.y) || 0) + offsetY;
                    const z = wFront + offsetZ;
                    this._dummy.position.set(x, y, z);
                    this._dummy.rotation.set(0, yaw, 0);
                    this._dummy.updateMatrix();
                    mesh.setMatrixAt(i, this._dummy.matrix);
                }
                mesh.instanceMatrix.needsUpdate = true;
            }

            const matCfg = raw.material && typeof raw.material === 'object' ? raw.material : {};
            const mode = String(matCfg.mode ?? 'pbr');
            const matId = String(matCfg.materialId ?? '');
            const roughness = clamp(matCfg.roughness, 0.0, 1.0, 0.85);
            const metalness = clamp(matCfg.metalness, 0.0, 1.0, 0.0);
            const normalStrength = clamp(matCfg.normalStrength, 0.0, 5.0, 1.0);
            const uv = matCfg.uv && typeof matCfg.uv === 'object' ? matCfg.uv : {};
            const colorHex = normalizeHexColor(matCfg.colorHex, 0xffffff);

            const matKey = `${mode}|id:${matId}|r:${q(roughness)}|m:${q(metalness)}|n:${q(normalStrength)}|c:${colorHex}|uv:${q(uv.repeatU)}:${q(uv.repeatV)}:${q(uv.offsetU)}:${q(uv.offsetV)}:${q(uv.rotationDeg)}`;
            if (matKey !== this._materialKeys[type]) {
                const mat = this._materials[type];
                if (mat) {
                    if (mode === 'match_frame') {
                        const frame = s.frame ?? {};
                        const frameMat = frame.material ?? {};
                        mat.color.setHex(normalizeHexColor(frame.colorHex, 0xffffff));
                        mat.roughness = clamp(frameMat.roughness, 0.0, 1.0, roughness);
                        mat.metalness = clamp(frameMat.metalness, 0.0, 1.0, metalness);
                        mat.map = null;
                        mat.normalMap = null;
                        mat.roughnessMap = null;
                        mat.metalnessMap = null;
                        mat.aoMap = null;
                        if (mat.normalScale) mat.normalScale.set(clamp(frameMat.normalStrength, 0.0, 5.0, normalStrength), clamp(frameMat.normalStrength, 0.0, 5.0, normalStrength));
                    } else if (mode === 'solid') {
                        mat.color.setHex(colorHex);
                        mat.roughness = roughness;
                        mat.metalness = metalness;
                        mat.map = null;
                        mat.normalMap = null;
                        mat.roughnessMap = null;
                        mat.metalnessMap = null;
                        mat.aoMap = null;
                        if (mat.normalScale) mat.normalScale.set(normalStrength, normalStrength);
                    } else {
                        mat.color.setHex(0xffffff);
                        mat.roughness = roughness;
                        mat.metalness = metalness;

                        const urls = resolvePbrMaterialUrls(matId);
                        const baseUrl = urls?.baseColorUrl ?? null;
                        const normalUrl = urls?.normalUrl ?? null;
                        const ormUrl = urls?.ormUrl ?? null;

                        const cache = this._texCaches[type];
                        const applyTexture = (url, { srgb }) => {
                            const safeUrl = typeof url === 'string' && url ? url : null;
                            if (!safeUrl) return null;
                            const cached = cache.get(safeUrl);
                            if (cached) return cached;
                            const tex = this._texLoader.load(safeUrl);
                            const renderer = this._renderer;
                            if (renderer) tex.anisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy?.() ?? 16);
                            applyTextureColorSpace(tex, { srgb: !!srgb });
                            cache.set(safeUrl, tex);
                            return tex;
                        };

                        mat.map = applyTexture(baseUrl, { srgb: true });
                        mat.normalMap = applyTexture(normalUrl, { srgb: false });
                        const orm = applyTexture(ormUrl, { srgb: false });
                        mat.roughnessMap = orm;
                        mat.metalnessMap = orm;
                        mat.aoMap = orm;
                        if (mat.normalScale) mat.normalScale.set(normalStrength, normalStrength);

                        applyUvTransform(mat.map, uv);
                        applyUvTransform(mat.normalMap, uv);
                        applyUvTransform(orm, uv);
                    }
                    mat.needsUpdate = true;
                }
                this._materialKeys[type] = matKey;
            }
        }
    }
}
