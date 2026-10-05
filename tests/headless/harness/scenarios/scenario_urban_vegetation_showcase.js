// Deterministic mature urban vegetation showcase with geometry and silhouette probes.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { loadUrbanVegetation } from '/src/graphics/engine3d/vegetation/UrbanVegetationLoader.js';
import { loadIBLBackgroundTexture, loadIBLTexture } from '/src/graphics/lighting/IBL.js';
import { measureUrbanPlantGeometry } from './_urban_vegetation_geometry.js';

const HDR_URL = '/assets/public/lighting/hdri/german_town_street_2k.hdr';
const VARIANTS = Object.freeze(['mature_01', 'mature_02', 'mature_03']);
const SUN_POSITIONS = Object.freeze({ front: [12, 22, 26], side: [-26, 16, 0], back: [0, 18, -28], raking: [-18, 8, 8], clay_raking: [-28, 12, 3] });

function summarizeTree(tree) {
    tree.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(tree);
    const stats = { triangles: 0, vertices: 0, meshes: 0, materialDraws: 0, geometryBufferBytes: 0, finitePositions: true, finiteNormals: true, normalLengthMin: Infinity, normalLengthMax: 0, foliageMaterials: [], barkMaterials: [] };
    const barkShapeHistogram = Array(512).fill(0);
    const barkMeshes = [];
    const barkBounds = new THREE.Box3();
    let barkVertexCount = 0;
    const point = new THREE.Vector3();
    const seen = new Set();
    tree.traverse((mesh) => {
        if (!mesh.isMesh) return;
        stats.meshes += 1;
        const geometry = mesh.geometry;
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        stats.materialDraws += Array.isArray(mesh.material) ? geometry.groups.length : 1;
        stats.geometryBufferBytes += Object.values(geometry.attributes).reduce((sum, attribute) => sum + (attribute.array ?? attribute.data.array).byteLength, 0) + (geometry.index?.array.byteLength ?? 0);
        const position = geometry.getAttribute('position');
        const normal = geometry.getAttribute('normal');
        if (materials.every(material => !material.userData.isFoliage)) {
            barkMeshes.push(mesh);
            barkVertexCount += position.count;
            for (let index = 0; index < position.count; index += 1) {
                point.fromBufferAttribute(position, index).applyMatrix4(mesh.matrixWorld);
                barkBounds.expandByPoint(point);
            }
        }
        stats.vertices += position.count;
        stats.triangles += (geometry.index?.count ?? position.count) / 3;
        for (const component of position.array) stats.finitePositions &&= Number.isFinite(component);
        if (!normal) stats.finiteNormals = false;
        for (let index = 0; normal && index < normal.count; index += 1) {
            const length = Math.hypot(normal.getX(index), normal.getY(index), normal.getZ(index));
            stats.finiteNormals &&= Number.isFinite(length);
            stats.normalLengthMin = Math.min(stats.normalLengthMin, length);
            stats.normalLengthMax = Math.max(stats.normalLengthMax, length);
        }
        for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
            if (seen.has(material)) continue;
            seen.add(material);
            const snapshot = {
                name: material.name, type: material.type, alphaTest: material.alphaTest,
                transparent: material.transparent, alphaToCoverage: material.alphaToCoverage,
                side: material.side, shadowSide: material.shadowSide, depthWrite: material.depthWrite,
                map: Boolean(material.map), normalMap: Boolean(material.normalMap), roughnessMap: Boolean(material.roughnessMap), metalnessMap: Boolean(material.metalnessMap),
                mapColorSpace: material.map?.colorSpace, normalMapColorSpace: material.normalMap?.colorSpace,
                roughnessMapColorSpace: material.roughnessMap?.colorSpace, metalnessMapColorSpace: material.metalnessMap?.colorSpace,
                mapWidth: material.map?.image?.width, mapHeight: material.map?.image?.height,
                roughness: material.roughness, metalness: material.metalness, vertexColors: material.vertexColors,
                foliage: Boolean(material.userData.isFoliage), aoAlphaMap: Boolean(material.userData.aoAlphaMap?.isTexture), preserveShadowSide: material.userData.preserveShadowSide === true
            };
            (snapshot.foliage ? stats.foliageMaterials : stats.barkMaterials).push(snapshot);
        }
    });
    const barkSize = barkBounds.getSize(new THREE.Vector3());
    for (const mesh of barkMeshes) {
        const position = mesh.geometry.getAttribute('position');
        for (let index = 0; index < position.count; index += 1) {
            point.fromBufferAttribute(position, index).applyMatrix4(mesh.matrixWorld);
            const bins = ['x', 'y', 'z'].map(axis => Math.min(7, Math.max(0, Math.floor((point[axis] - barkBounds.min[axis]) / barkSize[axis] * 8))));
            barkShapeHistogram[bins[0] * 64 + bins[1] * 8 + bins[2]] += 1;
        }
    }
    return { ...stats, barkShapeHistogram: barkShapeHistogram.map(count => count / barkVertexCount), bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() }, metadata: tree.userData };
}

function textureStats(root) {
    const textures = new Set();
    root.traverse((object) => {
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
            if (!material) continue;
            for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
            if (material.userData.aoAlphaMap?.isTexture) textures.add(material.userData.aoAlphaMap);
        }
    });
    return { total: textures.size, ready: [...textures].filter(texture => Number(texture.image?.width) > 0 && texture.image?.complete !== false).length };
}

// Pixel-cell hull area measures gaps within the projected crown, excluding its trunk.
function pixelHullArea(columns) {
    const points = [];
    for (const [x, { min, max }] of columns) {
        points.push([x - 0.5, min - 0.5], [x + 0.5, min - 0.5], [x - 0.5, max + 0.5], [x + 0.5, max + 0.5]);
    }
    points.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    const half = entries => {
        const hull = [];
        for (const point of entries) {
            while (hull.length >= 2 && cross(hull.at(-2), hull.at(-1), point) <= 0) hull.pop();
            hull.push(point);
        }
        return hull.slice(0, -1);
    };
    const hull = [...half(points), ...half([...points].reverse())];
    return Math.abs(hull.reduce((sum, point, index) => {
        const next = hull[(index + 1) % hull.length];
        return sum + point[0] * next[1] - point[1] * next[0];
    }, 0)) * 0.5;
}

export const scenarioUrbanVegetationShowcase = {
    id: 'urban_vegetation_showcase',
    async create({ engine, options = {} }) {
        const species = options.species ?? 'london-plane';
        let assets = options.leafStudyUrl || options.prototypeUrl ? { templates: [] } : await loadUrbanVegetation({ species });
        let prototype = null;
        if (options.prototypeUrl || options.leafStudyUrl) {
            prototype = (await new GLTFLoader().loadAsync(options.leafStudyUrl ?? options.prototypeUrl)).scene;
            prototype.userData.treeVariant = 'mature_01';
            prototype.userData.treeSpecies = species;
            prototype.traverse(mesh => {
                if (!mesh.isMesh) return;
                mesh.castShadow = true;
                mesh.receiveShadow = true;
                for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) material.userData.isFoliage = material.name === 'foliage';
            });
            assets = { ...assets, templates: [prototype, ...assets.templates.slice(1)] };
        }
        const silhouetteRadius = Math.max(...assets.templates.map(template => {
            const box = new THREE.Box3().setFromObject(template);
            return Math.hypot(Math.max(Math.abs(box.min.x), Math.abs(box.max.x)), Math.max(Math.abs(box.min.z), Math.abs(box.max.z))) / (box.max.y - box.min.y);
        }));
        const { renderer, scene, camera } = engine;
        const previous = { toneMapping: renderer.toneMapping, exposure: renderer.toneMappingExposure, shadows: renderer.shadowMap.enabled, shadowType: renderer.shadowMap.type, fov: camera.fov };
        const hdr = await loadIBLBackgroundTexture(HDR_URL);
        const environment = await loadIBLTexture(renderer, { enabled: true, hdrUrl: HDR_URL });
        if (environment.userData?.iblFallback) throw new Error('Urban vegetation showcase requires the actual HDR environment');
        scene.background = hdr;
        scene.environment = environment;
        scene.backgroundIntensity = 0.55;
        scene.environmentIntensity = 0.52;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1;
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        camera.fov = 38;
        camera.near = 0.05;
        camera.far = 500;
        camera.updateProjectionMatrix();
        const root = new THREE.Group();
        root.name = 'UrbanVegetationShowcase';
        scene.add(root);
        const groundGeometry = new THREE.PlaneGeometry(500, 500);
        const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x8c9275, roughness: 1, metalness: 0, envMapIntensity: 0.4 });
        const ground = new THREE.Mesh(groundGeometry, groundMaterial);
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = 0;
        ground.receiveShadow = true;
        ground.name = 'UrbanVegetationShowcaseGround';
        scene.add(ground);
        const sun = new THREE.DirectionalLight(0xfff4dc, 2.7);
        sun.castShadow = true;
        sun.shadow.mapSize.set(2048, 2048);
        Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 30, bottom: -20, near: 0.1, far: 120 });
        sun.shadow.bias = -0.00007;
        sun.shadow.normalBias = 0.035;
        sun.shadow.radius = 2;
        scene.add(sun, sun.target);
        let currentVariant = options.variant ?? 'mature_01';
        let currentPose = 'front';
        let currentLight = 'front';
        let lineup = false;
        let activeBounds = null;
        let surfaceMode = 'native';
        let foliageVisible = true;
        const clayMaterial = new THREE.MeshStandardMaterial({ color: 0x666666, roughness: 0.8, metalness: 0 });
        let templateMetrics = null;

        function applyAppearance() {
            root.traverse(mesh => {
                if (!mesh.isMesh) return;
                mesh.userData.showcaseNativeMaterial ??= mesh.material;
                const native = mesh.userData.showcaseNativeMaterial;
                const leaf = (Array.isArray(native) ? native : [native]).every(material => material.userData.isFoliage);
                mesh.visible = !leaf || foliageVisible;
                mesh.material = surfaceMode === 'clay' && (!leaf || options.leafStudyUrl) ? clayMaterial : native;
            });
        }

        function setAppearance({ surface = 'native', foliage = true } = {}) {
            if (!['native', 'clay'].includes(surface)) throw new Error(`Unknown vegetation surface mode ${surface}`);
            surfaceMode = surface;
            foliageVisible = foliage;
            applyAppearance();
            render();
        }

        function render() {
            renderer.setRenderTarget(null);
            renderer.render(scene, camera);
        }

        function setVariant(variant = 'mature_01', showLineup = false) {
            if (!VARIANTS.includes(variant)) throw new Error(`Unknown urban vegetation variant ${variant}`);
            root.clear();
            currentVariant = variant;
            lineup = showLineup;
            const templateSizes = assets.templates.map(template => new THREE.Box3().setFromObject(template).getSize(new THREE.Vector3()));
            const spacing = Math.max(...templateSizes.map(size => size.x)) * 1.15;
            const selected = showLineup ? assets.templates : [assets.templates[VARIANTS.indexOf(variant)]];
            selected.forEach((template, index) => {
                const clone = template.clone(true);
                clone.position.x = showLineup ? (index - 1) * spacing : 0;
                root.add(clone);
            });
            activeBounds = new THREE.Box3().setFromObject(root);
            applyAppearance();
            setPose(showLineup ? 'lineup' : currentPose);
        }

        function setPose(pose = 'front') {
            const bounds = activeBounds;
            const size = bounds.getSize(new THREE.Vector3());
            const center = bounds.getCenter(new THREE.Vector3());
            const height = size.y;
            const distance = Math.max(height * 1.9, size.x / camera.aspect * 1.85);
            const shrub = species === 'arrowwood-viburnum';
            const poses = {
                front: { position: [center.x, height * 0.51, distance], target: [center.x, height * 0.49, 0] },
                three_quarter: { position: [distance * 0.7, height * 0.56, distance * 0.75], target: [0, height * 0.49, 0] },
                low_angle: { position: [height * 0.16, height * 0.07, height * 0.71], target: [0, height * 0.65, 0] },
                bark_detail: { position: [height * 0.15, height * 0.19, height * 0.30], target: [0, height * 0.22, 0] },
                leaf_detail: { position: [size.x * 0.2, height * 0.76, size.z * 0.67], target: [0, height * 0.73, size.z * 0.24] },
                leaf_underside: { position: [size.x * 0.2, height * 0.43, size.z * 0.55], target: [0, height * 0.72, size.z * 0.18] },
                lineup: { position: [0, height * 0.65, distance * 1.06], target: [0, height * 0.46, 0] }
            };
            Object.assign(poses, {
                buttress_detail: shrub
                    ? { position: [height * 0.3, height * 0.16, height * 0.7], target: [0, height * 0.13, 0] }
                    : { position: [height * 0.07, height * 0.05, height * 0.16], target: [0, height * 0.035, 0] },
                fork_detail: shrub
                    ? { position: [height * 0.4, height * 0.35, height * 0.6], target: [0, height * 0.32, 0] }
                    : { position: [height * 0.13, height * 0.29, height * 0.3], target: [0, height * 0.31, 0] },
                ground_transition: { position: [height * .24, height * .18, height * .54], target: [0, height * .13, 0] },
                leaf_study: { position: [size.x * .12, center.y + height * .20, Math.max(size.x * 1.18, height * 2.2)], target: [center.x, center.y, center.z] },
                leaf_study_oblique: { position: [size.x * .66, center.y + height * .65, Math.max(size.x * .95, height * 1.8)], target: [center.x, center.y, center.z] },
                bark_macro: shrub
                    ? { position: [height * 0.15, height * 0.23, height * 0.48], target: [0, height * 0.20, 0] }
                    : { position: [height * 0.05, height * 0.13, height * 0.13], target: [0, height * 0.13, 0] }
            });
            if (!poses[pose]) throw new Error(`Unknown showcase pose ${pose}`);
            camera.position.fromArray(poses[pose].position);
            camera.lookAt(...poses[pose].target);
            camera.updateMatrixWorld(true);
            if (shrub) {
                const extent = lineup ? Math.max(size.x * .6, 3) : Math.max(size.x * .6, 1.6);
                Object.assign(sun.shadow.camera, { left: -extent, right: extent, top: height * 1.4, bottom: -height * .7 });
                sun.shadow.camera.updateProjectionMatrix();
                sun.shadow.normalBias = .003;
            }
            currentPose = pose;
            render();
        }

        function setLight(mode = 'front') {
            if (!SUN_POSITIONS[mode]) throw new Error(`Unknown showcase sunlight ${mode}`);
            sun.position.fromArray(SUN_POSITIONS[mode]);
            sun.target.position.set(0, new THREE.Box3().setFromObject(assets.templates[0]).max.y * 0.4, 0);
            sun.updateMatrixWorld(true);
            sun.target.updateMatrixWorld(true);
            currentLight = mode;
            render();
        }

        function silhouette(template, { size = 256, angle = 0, frameHeight = 16, foliageOnly = false } = {}) {
            const maskScene = new THREE.Scene();
            maskScene.background = new THREE.Color(0);
            const clone = template.clone(true);
            const sourceBounds = new THREE.Box3().setFromObject(template);
            const sourceHeight = sourceBounds.max.y - sourceBounds.min.y;
            clone.scale.setScalar(frameHeight / sourceHeight);
            clone.position.set(0, -sourceBounds.min.y * clone.scale.y, 0);
            clone.rotation.y = angle;
            const materials = [];
            clone.traverse((mesh) => {
                if (!mesh.isMesh) return;
                mesh.castShadow = false;
                const originals = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
                if (foliageOnly && originals.every(material => !material.userData.isFoliage)) mesh.visible = false;
                const convert = original => {
                    const material = new THREE.MeshBasicMaterial({ color: 0xffffff, map: original.userData.isFoliage ? original.map : null, alphaTest: original.alphaTest, side: THREE.DoubleSide, toneMapped: false });
                    materials.push(material);
                    return material;
                };
                mesh.material = Array.isArray(mesh.material) ? mesh.material.map(convert) : convert(mesh.material);
            });
            maskScene.add(clone);
            const halfWidth = Math.max(0.65, silhouetteRadius * 1.12) * frameHeight;
            const width = Math.ceil(size * 2 * halfWidth / (frameHeight * 1.3));
            const maskCamera = new THREE.OrthographicCamera(-halfWidth, halfWidth, frameHeight * 1.05, -frameHeight * 0.25, 0.1, 100);
            maskCamera.position.set(0, 0, 40);
            maskCamera.lookAt(0, 0, 0);
            const target = new THREE.WebGLRenderTarget(width, size);
            renderer.setRenderTarget(target);
            renderer.render(maskScene, maskCamera);
            const pixels = new Uint8Array(width * size * 4);
            renderer.readRenderTargetPixels(target, 0, 0, width, size, pixels);
            const occupied = [];
            const columns = new Map();
            let minX = width, minY = size, maxX = -1, maxY = -1;
            for (let pixel = 0; pixel < width * size; pixel += 1) {
                if (Math.max(pixels[pixel * 4], pixels[pixel * 4 + 1], pixels[pixel * 4 + 2]) <= 15) continue;
                occupied.push(pixel);
                const x = pixel % width, y = Math.floor(pixel / width);
                const column = columns.get(x) ?? { min: y, max: y };
                column.min = Math.min(column.min, y); column.max = Math.max(column.max, y);
                columns.set(x, column);
                minX = Math.min(minX, pixel % width); maxX = Math.max(maxX, pixel % width);
                minY = Math.min(minY, Math.floor(pixel / width)); maxY = Math.max(maxY, Math.floor(pixel / width));
            }
            target.dispose();
            materials.forEach(material => material.dispose());
            render();
            const convexHullPixels = pixelHullArea(columns);
            return { width, height: size, angle, frameHeight, frameHalfWidth: halfWidth, foliageOnly, occupied, pixels: occupied.length, convexHullPixels, convexHullCoverage: occupied.length / convexHullPixels, boundingPixels: (maxX - minX + 1) * (maxY - minY + 1), bounds: [minX, minY, maxX, maxY], clipped: minX === 0 || minY === 0 || maxX === width - 1 || maxY === size - 1 };
        }

        function getMetrics() {
            const gl = renderer.getContext();
            const extension = gl.getExtension('WEBGL_debug_renderer_info');
            return {
                species, variant: currentVariant, pose: currentPose, sunlight: currentLight, lineup,
                appearance: { surface: surfaceMode, foliageVisible, clayUsesTextures: Boolean(clayMaterial.map || clayMaterial.normalMap || clayMaterial.displacementMap) },
                exposure: renderer.toneMappingExposure, toneMapping: renderer.toneMapping,
                scope: 'Native GameEngine renderer, runtime vegetation materials, geometric sun shadows and HDRI; isolated from city compositor and postprocessing.',
                environment: { url: HDR_URL, background: scene.background === hdr, present: scene.environment === environment, fallback: Boolean(environment.userData?.iblFallback) },
                gpu: extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
                textures: textureStats(root), plants: templateMetrics ??= assets.templates.map(summarizeTree),
                renderer: { ...renderer.info.render }, camera: { position: camera.position.toArray(), fov: camera.fov }
            };
        }

        setVariant(currentVariant, options.lineup === true);
        setLight(options.sunlight ?? 'front');
        setPose(options.pose ?? (lineup ? 'lineup' : 'front'));
        window.__urbanVegetationShowcase = Object.freeze({ render, setPose, setLight, setVariant, setAppearance, getMetrics, getGeometryEvidence: () => Promise.all(assets.templates.map(measureUrbanPlantGeometry)), silhouette: (variant, config) => silhouette(assets.templates[VARIANTS.indexOf(variant)], config) });
        return {
            getMetrics,
            dispose() {
                delete window.__urbanVegetationShowcase;
                scene.environment = null;
                scene.background = null;
                groundGeometry.dispose();
                groundMaterial.dispose();
                clayMaterial.dispose();
                if (prototype) {
                    const textures = new Set(), materials = new Set();
                    prototype.traverse(mesh => {
                        if (!mesh.isMesh) return;
                        mesh.geometry.dispose();
                        for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
                            materials.add(material);
                            for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
                        }
                    });
                    textures.forEach(texture => texture.dispose());
                    materials.forEach(material => material.dispose());
                }
                sun.shadow.dispose();
                scene.remove(root, ground, sun, sun.target);
                renderer.toneMapping = previous.toneMapping;
                renderer.toneMappingExposure = previous.exposure;
                renderer.shadowMap.enabled = previous.shadows;
                renderer.shadowMap.type = previous.shadowType;
                camera.fov = previous.fov;
                camera.updateProjectionMatrix();
            }
        };
    }
};
