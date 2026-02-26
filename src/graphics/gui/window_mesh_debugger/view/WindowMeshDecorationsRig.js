// src/graphics/gui/window_mesh_debugger/view/WindowMeshDecorationsRig.js
// Renders configurable window decoration meshes (sill, header, trim) for the Window Mesh Debugger.
// @ts-check

import * as THREE from 'three';
import {
    WINDOW_DECORATION_PART,
    WINDOW_DECORATION_PART_IDS,
    WINDOW_DECORATION_STYLE,
    WINDOW_DECORATION_MATERIAL_MODE,
    resolveWindowDecorationState
} from '../../../../app/buildings/window_mesh/index.js';
import { WINDOW_MESH_DOUBLE_DOOR_CENTER_GAP_METERS } from '../../../engine3d/buildings/window_mesh/WindowMeshGeometry.js';
import { PbrTextureLoaderService } from '../../../content3d/materials/PbrTexturePipeline.js';

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

function getPartFromValue(value) {
    const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
    for (const partId of WINDOW_DECORATION_PART_IDS) {
        if (raw === partId) return partId;
    }
    return null;
}

function getStyleFromValue(value) {
    const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (raw === WINDOW_DECORATION_STYLE.SIMPLE) return WINDOW_DECORATION_STYLE.SIMPLE;
    if (raw === WINDOW_DECORATION_STYLE.BOTTOM_COVER) return WINDOW_DECORATION_STYLE.BOTTOM_COVER;
    return null;
}

const WINDOW_DECORATION_STYLE_PLUGIN_REGISTRY = new Map();

function makePluginKey(partId, styleId) {
    return `${String(partId ?? '').trim().toLowerCase()}::${String(styleId ?? '').trim().toLowerCase()}`;
}

export function registerWindowMeshDecorationStylePlugin(partId, styleId, plugin) {
    const normalizedPart = getPartFromValue(partId);
    const normalizedStyle = getStyleFromValue(styleId);
    if (!normalizedPart || !normalizedStyle) return false;

    const obj = plugin && typeof plugin === 'object' ? plugin : null;
    if (!obj || typeof obj.buildGeometry !== 'function') return false;

    WINDOW_DECORATION_STYLE_PLUGIN_REGISTRY.set(makePluginKey(normalizedPart, normalizedStyle), {
        buildGeometryKey: typeof obj.buildGeometryKey === 'function' ? obj.buildGeometryKey : null,
        buildGeometry: obj.buildGeometry
    });
    return true;
}

function getWindowMeshDecorationStylePlugin(partId, styleId) {
    const normalizedPart = getPartFromValue(partId);
    const normalizedStyle = getStyleFromValue(styleId);
    if (!normalizedPart || !normalizedStyle) return null;
    return WINDOW_DECORATION_STYLE_PLUGIN_REGISTRY.get(makePluginKey(normalizedPart, normalizedStyle)) ?? null;
}

function registerDefaultWindowMeshDecorationStylePlugins() {
    registerWindowMeshDecorationStylePlugin(WINDOW_DECORATION_PART.SILL, WINDOW_DECORATION_STYLE.SIMPLE, {
        buildGeometryKey: ({ windowWidth, resolved }) => {
            const width = Math.max(0.01, Number(windowWidth) || 1) * (Number(resolved?.widthScale) || 1);
            const height = Number(resolved?.template?.height) || 0.08;
            const depth = Number(resolved?.template?.depth) || 0.08;
            return `simple_box|w:${q(width)}|h:${q(height)}|d:${q(depth)}`;
        },
        buildGeometry: ({ windowWidth, resolved }) => {
            const width = Math.max(0.01, Number(windowWidth) || 1) * (Number(resolved?.widthScale) || 1);
            const height = Number(resolved?.template?.height) || 0.08;
            const depth = Number(resolved?.template?.depth) || 0.08;
            return buildBoxWithBackAtZero({ width, height, depth });
        }
    });

    registerWindowMeshDecorationStylePlugin(WINDOW_DECORATION_PART.SILL, WINDOW_DECORATION_STYLE.BOTTOM_COVER, {
        buildGeometryKey: ({ windowWidth, resolved }) => {
            const width = Math.max(0.01, Number(windowWidth) || 1) * (Number(resolved?.widthScale) || 1);
            const height = Number(resolved?.template?.height) || 0.08;
            const depth = Number(resolved?.template?.depth) || 0.08;
            return `simple_box|w:${q(width)}|h:${q(height)}|d:${q(depth)}`;
        },
        buildGeometry: ({ windowWidth, resolved }) => {
            const width = Math.max(0.01, Number(windowWidth) || 1) * (Number(resolved?.widthScale) || 1);
            const height = Number(resolved?.template?.height) || 0.08;
            const depth = Number(resolved?.template?.depth) || 0.08;
            return buildBoxWithBackAtZero({ width, height, depth });
        }
    });

    registerWindowMeshDecorationStylePlugin(WINDOW_DECORATION_PART.HEADER, WINDOW_DECORATION_STYLE.SIMPLE, {
        buildGeometryKey: ({ windowWidth, resolved }) => {
            const width = Math.max(0.01, Number(windowWidth) || 1) * (Number(resolved?.widthScale) || 1);
            const height = Number(resolved?.template?.height) || 0.08;
            const depth = Number(resolved?.template?.depth) || 0.08;
            return `simple_box|w:${q(width)}|h:${q(height)}|d:${q(depth)}`;
        },
        buildGeometry: ({ windowWidth, resolved }) => {
            const width = Math.max(0.01, Number(windowWidth) || 1) * (Number(resolved?.widthScale) || 1);
            const height = Number(resolved?.template?.height) || 0.08;
            const depth = Number(resolved?.template?.depth) || 0.08;
            return buildBoxWithBackAtZero({ width, height, depth });
        }
    });

    registerWindowMeshDecorationStylePlugin(WINDOW_DECORATION_PART.TRIM, WINDOW_DECORATION_STYLE.SIMPLE, {
        buildGeometryKey: ({ windowWidth, windowHeight, archEnabled, archHeightRatio, curveSegments, resolved }) => {
            const width = Math.max(0.01, Number(windowWidth) || 1) * (Number(resolved?.widthScale) || 1);
            const height = Math.max(0.01, Number(windowHeight) || 1);
            const bandWidth = Number(resolved?.template?.height) || 0.08;
            const innerGap = Math.max(0, Number(resolved?.template?.gap) || 0.0);
            const depth = Number(resolved?.template?.depth) || 0.08;
            return `simple_trim|w:${q(width)}|h:${q(height)}|arch:${archEnabled ? 1 : 0}|ahr:${q(archHeightRatio)}|bw:${q(bandWidth)}|ig:${q(innerGap)}|d:${q(depth)}|cs:${curveSegments | 0}`;
        },
        buildGeometry: ({ windowWidth, windowHeight, archEnabled, archHeightRatio, curveSegments, resolved }) => {
            const width = Math.max(0.01, Number(windowWidth) || 1) * (Number(resolved?.widthScale) || 1);
            const height = Math.max(0.01, Number(windowHeight) || 1);
            const bandWidth = Number(resolved?.template?.height) || 0.08;
            const innerGap = Math.max(0, Number(resolved?.template?.gap) || 0.0);
            const depth = Number(resolved?.template?.depth) || 0.08;
            return buildTrimGeometry({
                windowWidth: width,
                windowHeight: height,
                archEnabled,
                archHeightRatio,
                bandWidth,
                innerGap,
                depth,
                curveSegments
            });
        }
    });
}

registerDefaultWindowMeshDecorationStylePlugins();

function computeDecorationPlacement(partId, resolved, windowHeight, wallFrontZ) {
    const template = resolved?.template && typeof resolved.template === 'object' ? resolved.template : {};
    const offset = template.offset && typeof template.offset === 'object' ? template.offset : {};
    const height = Number(template.height) || 0;
    const gap = Number(template.gap) || 0;
    const style = String(resolved?.type ?? WINDOW_DECORATION_STYLE.SIMPLE).toLowerCase();

    let yBase = 0;
    if (partId === WINDOW_DECORATION_PART.SILL) {
        yBase = style === WINDOW_DECORATION_STYLE.BOTTOM_COVER
            ? (-windowHeight * 0.5 + gap + height * 0.5)
            : (-windowHeight * 0.5 - gap - height * 0.5);
    } else if (partId === WINDOW_DECORATION_PART.HEADER) {
        yBase = windowHeight * 0.5 + gap + height * 0.5;
    }

    return {
        x: Number(offset.x) || 0,
        y: yBase + (Number(offset.y) || 0),
        z: wallFrontZ + (Number(offset.z) || 0)
    };
}

function isDoorDoubleSillMode(windowSettings) {
    const frame = windowSettings?.frame && typeof windowSettings.frame === 'object' ? windowSettings.frame : {};
    const style = typeof frame.doorStyle === 'string' ? frame.doorStyle.trim().toLowerCase() : '';
    return !!frame.openBottom && style === 'double';
}

function computeDoorLeafLayout(windowWidth) {
    const width = Math.max(EPS, Number(windowWidth) || 0);
    const centerGap = Math.max(0, Math.min(width - EPS, WINDOW_MESH_DOUBLE_DOOR_CENTER_GAP_METERS));
    const leafWidth = Math.max(EPS, (width - centerGap) * 0.5);
    const leafOffset = centerGap * 0.5 + leafWidth * 0.5;
    return { leafWidth, leafOffset };
}

function buildPartPlacementEntries(partId, instances, windowSettings, windowWidth) {
    const base = Array.isArray(instances) ? instances : [];
    if (partId !== WINDOW_DECORATION_PART.SILL) return { instances: base, width: Math.max(EPS, Number(windowWidth) || 1) };
    if (!isDoorDoubleSillMode(windowSettings)) return { instances: base, width: Math.max(EPS, Number(windowWidth) || 1) };

    const layout = computeDoorLeafLayout(windowWidth);
    const split = [];
    for (const entry of base) {
        const p = entry?.position && typeof entry.position === 'object' ? entry.position : entry;
        const px = Number(p?.x) || 0;
        const py = Number(p?.y) || 0;
        const pz = Number(p?.z) || 0;
        split.push({
            ...entry,
            position: { x: px - layout.leafOffset, y: py, z: pz }
        });
        split.push({
            ...entry,
            position: { x: px + layout.leafOffset, y: py, z: pz }
        });
    }
    return { instances: split, width: layout.leafWidth };
}

function getDefaultUvTransform() {
    return {
        repeatU: 1.0,
        repeatV: 1.0,
        offsetU: 0.0,
        offsetV: 0.0,
        rotationDeg: 0.0
    };
}

export class WindowMeshDecorationsRig {
    constructor({ renderer } = {}) {
        this._renderer = renderer ?? null;
        this._pbrTextureService = new PbrTextureLoaderService({
            renderer: this._renderer
        });

        this.group = new THREE.Group();
        this.group.name = 'window_decorations';

        this._dummy = new THREE.Object3D();
        this._geometryKeys = {
            [WINDOW_DECORATION_PART.SILL]: '',
            [WINDOW_DECORATION_PART.HEADER]: '',
            [WINDOW_DECORATION_PART.TRIM]: ''
        };
        this._materialKeys = {
            [WINDOW_DECORATION_PART.SILL]: '',
            [WINDOW_DECORATION_PART.HEADER]: '',
            [WINDOW_DECORATION_PART.TRIM]: ''
        };
        this._renderMode = 'solid';

        this._meshes = {
            [WINDOW_DECORATION_PART.SILL]: null,
            [WINDOW_DECORATION_PART.HEADER]: null,
            [WINDOW_DECORATION_PART.TRIM]: null
        };
        this._materials = {
            [WINDOW_DECORATION_PART.SILL]: null,
            [WINDOW_DECORATION_PART.HEADER]: null,
            [WINDOW_DECORATION_PART.TRIM]: null
        };
        this._savedMaterialsForNormals = {
            [WINDOW_DECORATION_PART.SILL]: null,
            [WINDOW_DECORATION_PART.HEADER]: null,
            [WINDOW_DECORATION_PART.TRIM]: null
        };
    }

    dispose() {
        for (const partId of WINDOW_DECORATION_PART_IDS) {
            const mesh = this._meshes[partId];
            if (mesh) {
                this.group.remove(mesh);
                mesh.geometry?.dispose?.();
            }
            this._materials[partId]?.dispose?.();
            this._meshes[partId] = null;
            this._materials[partId] = null;
            this._savedMaterialsForNormals[partId] = null;
        }

        this._pbrTextureService?.dispose?.();
        this._pbrTextureService = null;
    }

    setRenderMode(mode, normalMaterial) {
        const next = typeof mode === 'string' ? mode : 'solid';
        this._renderMode = next;

        const normals = next === 'normals';
        const wireframe = next === 'wireframe';

        for (const partId of WINDOW_DECORATION_PART_IDS) {
            const mesh = this._meshes[partId];
            if (!mesh) continue;

            if (normals) {
                if (mesh.material !== normalMaterial) {
                    this._savedMaterialsForNormals[partId] = mesh.material;
                    mesh.material = normalMaterial;
                }
                continue;
            }

            if (mesh.material === normalMaterial && this._savedMaterialsForNormals[partId]) {
                mesh.material = this._savedMaterialsForNormals[partId];
            }

            const mat = this._materials[partId];
            setMaterialWireframe(mat, wireframe);
        }
    }

    update({ wallFrontZ, windowSettings, instances, curveSegments = 24, wallMaterial = null } = {}, decorationState) {
        const wFront = Number.isFinite(wallFrontZ) ? wallFrontZ : 0;
        const s = windowSettings && typeof windowSettings === 'object' ? windowSettings : {};
        const list = Array.isArray(instances) ? instances : [];
        const winW = Math.max(0.01, Number(s.width) || 1);
        const winH = Math.max(0.01, Number(s.height) || 1);
        const archEnabled = !!s?.arch?.enabled;
        const archHeightRatio = Number(s?.arch?.heightRatio) || 0;

        const wallMatCfg = wallMaterial && typeof wallMaterial === 'object' ? wallMaterial : {};
        const wallMaterialId = typeof wallMatCfg.materialId === 'string' ? wallMatCfg.materialId.trim() : '';
        const wallRoughness = clamp(wallMatCfg.roughness, 0.0, 1.0, 0.85);
        const wallNormalStrength = clamp(wallMatCfg.normalIntensity, 0.0, 5.0, 1.0);

        const resolvedByPart = resolveWindowDecorationState(decorationState, {
            wallMaterialId
        });

        for (const partId of WINDOW_DECORATION_PART_IDS) {
            const resolved = resolvedByPart?.[partId] ?? null;
            const enabled = !!resolved?.enabled;

            if (!enabled) {
                const hidden = this._meshes[partId];
                if (hidden) hidden.visible = false;
                continue;
            }

            const styleId = String(resolved?.type ?? WINDOW_DECORATION_STYLE.SIMPLE);
            const plugin = getWindowMeshDecorationStylePlugin(partId, styleId);
            if (!plugin) {
                const hidden = this._meshes[partId];
                if (hidden) hidden.visible = false;
                continue;
            }

            const pluginCtx = {
                partId,
                resolved,
                windowWidth: winW,
                windowHeight: winH,
                archEnabled,
                archHeightRatio,
                curveSegments
            };

            const partPlacement = buildPartPlacementEntries(partId, list, s, winW);
            const partInstances = partPlacement.instances;
            pluginCtx.windowWidth = partPlacement.width;

            const geometryKey = plugin.buildGeometryKey
                ? String(plugin.buildGeometryKey(pluginCtx) ?? '')
                : `${partId}|${styleId}`;
            const count = partInstances.length;

            let mesh = this._meshes[partId];
            let replaceGeometry = false;
            if (!mesh || mesh.count !== count) {
                if (mesh) {
                    this.group.remove(mesh);
                    mesh.geometry?.dispose?.();
                }
                this._materials[partId]?.dispose?.();

                const seedGeo = plugin.buildGeometry(pluginCtx);
                if (!seedGeo) {
                    this._meshes[partId] = null;
                    this._materials[partId] = null;
                    continue;
                }

                const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0.0 });
                mesh = new THREE.InstancedMesh(seedGeo, material, count);
                mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
                mesh.frustumCulled = false;
                this.group.add(mesh);

                this._meshes[partId] = mesh;
                this._materials[partId] = material;
                this._geometryKeys[partId] = geometryKey;
                this._materialKeys[partId] = '';
                replaceGeometry = false;
            } else if (geometryKey !== this._geometryKeys[partId]) {
                replaceGeometry = true;
            }

            if (!mesh) continue;

            if (replaceGeometry) {
                const geo = plugin.buildGeometry(pluginCtx);
                if (geo) {
                    mesh.geometry?.dispose?.();
                    mesh.geometry = geo;
                }
            }
            this._geometryKeys[partId] = geometryKey;

            mesh.visible = true;
            // Decorations are visualization-only and always receive/cast shadows.
            mesh.castShadow = true;
            mesh.receiveShadow = true;

            const placement = computeDecorationPlacement(partId, resolved, winH, wFront);
            for (let i = 0; i < count; i++) {
                const entry = partInstances[i];
                const p = entry?.position && typeof entry.position === 'object' ? entry.position : entry;
                const yaw = Number(entry?.yaw) || 0;
                const x = (Number(p?.x) || 0) + placement.x;
                const y = (Number(p?.y) || 0) + placement.y;
                const z = placement.z;
                this._dummy.position.set(x, y, z);
                this._dummy.rotation.set(0, yaw, 0);
                this._dummy.updateMatrix();
                mesh.setMatrixAt(i, this._dummy.matrix);
            }
            mesh.instanceMatrix.needsUpdate = true;

            const mode = String(resolved?.material?.mode ?? WINDOW_DECORATION_MATERIAL_MODE.MATCH_WALL);
            const pbrMaterialId = typeof resolved?.material?.materialId === 'string' && resolved.material.materialId
                ? resolved.material.materialId
                : wallMaterialId;
            const frame = s.frame ?? {};
            const frameMat = frame.material ?? {};
            const frameColorHex = normalizeHexColor(frame.colorHex, 0xffffff);
            const frameRoughness = clamp(frameMat.roughness, 0.0, 1.0, 0.72);
            const frameMetalness = clamp(frameMat.metalness, 0.0, 1.0, 0.0);
            const frameEnvMapIntensity = clamp(frameMat.envMapIntensity, 0.0, 8.0, 0.0);
            const frameNormalStrength = clamp(frameMat.normalStrength, 0.0, 5.0, 1.0);
            const uv = getDefaultUvTransform();
            const frameMatchKey = `|fc:${frameColorHex}|fr:${q(frameRoughness)}|fm:${q(frameMetalness)}|fe:${q(frameEnvMapIntensity)}|fn:${q(frameNormalStrength)}`;
            const matKey = `${mode}|wall:${wallMaterialId}|pbr:${pbrMaterialId}|wr:${q(wallRoughness)}|wn:${q(wallNormalStrength)}${mode === WINDOW_DECORATION_MATERIAL_MODE.MATCH_FRAME ? frameMatchKey : ''}`;

            if (matKey !== this._materialKeys[partId]) {
                const mat = this._materials[partId];
                if (mat) {
                    const clearMaps = () => {
                        mat.map = null;
                        mat.normalMap = null;
                        mat.roughnessMap = null;
                        mat.metalnessMap = null;
                        mat.aoMap = null;
                    };

                    if (mode === WINDOW_DECORATION_MATERIAL_MODE.MATCH_FRAME) {
                        mat.color.setHex(frameColorHex);
                        mat.roughness = frameRoughness;
                        mat.metalness = frameMetalness;
                        mat.envMapIntensity = frameEnvMapIntensity;
                        clearMaps();
                        if (mat.normalScale) {
                            mat.normalScale.set(frameNormalStrength, frameNormalStrength);
                        }
                    } else if (mode === WINDOW_DECORATION_MATERIAL_MODE.PBR) {
                        mat.color.setHex(0xffffff);
                        mat.roughness = 0.85;
                        mat.metalness = 0.0;

                        const resolvedPbr = pbrMaterialId
                            ? (this._pbrTextureService?.resolveMaterial(pbrMaterialId, {
                                cloneTextures: false,
                                localOverrides: { roughness: 0.85, metalness: 0.0, normalStrength: 1.0 },
                                diagnosticsTag: `WindowMeshDecorationsRig.${partId}.pbr`
                            }) ?? null)
                            : null;
                        const tex = resolvedPbr?.textures ?? {};

                        mat.map = tex.baseColor ?? null;
                        mat.normalMap = tex.normal ?? null;
                        if (tex.orm) {
                            mat.roughnessMap = tex.orm;
                            mat.metalnessMap = tex.orm;
                            mat.aoMap = tex.orm;
                        } else {
                            mat.aoMap = tex.ao ?? null;
                            mat.roughnessMap = tex.roughness ?? null;
                            mat.metalnessMap = tex.metalness ?? null;
                        }

                        if (mat.normalScale) mat.normalScale.set(1.0, 1.0);
                        applyUvTransform(mat.map, uv);
                        applyUvTransform(mat.normalMap, uv);
                        applyUvTransform(mat.aoMap, uv);
                        applyUvTransform(mat.roughnessMap, uv);
                        applyUvTransform(mat.metalnessMap, uv);
                    } else {
                        mat.color.setHex(0xffffff);
                        mat.roughness = wallRoughness;
                        mat.metalness = 0.0;

                        const resolvedWall = wallMaterialId
                            ? (this._pbrTextureService?.resolveMaterial(wallMaterialId, {
                                cloneTextures: false,
                                localOverrides: { roughness: wallRoughness, normalStrength: wallNormalStrength },
                                diagnosticsTag: `WindowMeshDecorationsRig.${partId}.match_wall`
                            }) ?? null)
                            : null;
                        const tex = resolvedWall?.textures ?? {};

                        mat.map = tex.baseColor ?? null;
                        mat.normalMap = tex.normal ?? null;
                        if (tex.orm) {
                            mat.roughnessMap = tex.orm;
                            mat.metalnessMap = tex.orm;
                            mat.aoMap = tex.orm;
                        } else {
                            mat.aoMap = tex.ao ?? null;
                            mat.roughnessMap = tex.roughness ?? null;
                            mat.metalnessMap = tex.metalness ?? null;
                        }

                        if (mat.normalScale) mat.normalScale.set(wallNormalStrength, wallNormalStrength);
                        applyUvTransform(mat.map, uv);
                        applyUvTransform(mat.normalMap, uv);
                        applyUvTransform(mat.aoMap, uv);
                        applyUvTransform(mat.roughnessMap, uv);
                        applyUvTransform(mat.metalnessMap, uv);
                    }

                    mat.needsUpdate = true;
                }
                this._materialKeys[partId] = matKey;
            }
        }
    }
}
