// src/graphics/visuals/static_ao/StaticAoMaterialPatch.js
// Shader patch for applying baked static AO (attribute `staticAo`) as ambient-only occlusion.
// @ts-check

const STATIC_AO_SHADER_VERSION = 1;

function clamp(value, min, max, fallback) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.max(min, Math.min(max, num));
}

function sanitizeDebugView(value) {
    if (value === true) return true;
    if (value === false) return false;
    return false;
}

function ensureState(material) {
    const mat = material;
    mat.userData = mat.userData ?? {};
    const state = mat.userData.staticAo && typeof mat.userData.staticAo === 'object' ? mat.userData.staticAo : {};
    if (!mat.userData.staticAo || typeof mat.userData.staticAo !== 'object') mat.userData.staticAo = state;
    if (state.patched !== true) state.patched = false;
    if (state.intensity === undefined) state.intensity = 0;
    if (state.debugView === undefined) state.debugView = false;
    if (!('shaderUniforms' in state)) state.shaderUniforms = null;
    return state;
}

function injectStaticAoShader(shader) {
    if (!shader || typeof shader !== 'object') return;

    if (!shader.uniforms) shader.uniforms = {};
    if (!shader.uniforms.uStaticAoIntensity) shader.uniforms.uStaticAoIntensity = { value: 0.0 };

    if (typeof shader.vertexShader === 'string' && !shader.vertexShader.includes('varying float vStaticAo')) {
        shader.vertexShader = shader.vertexShader.replace(
            '#include <common>',
            [
                '#include <common>',
                'attribute float staticAo;',
                'varying float vStaticAo;'
            ].join('\n')
        );

        shader.vertexShader = shader.vertexShader.replace(
            '#include <begin_vertex>',
            [
                '#include <begin_vertex>',
                'vStaticAo = staticAo;'
            ].join('\n')
        );
    }

    if (typeof shader.fragmentShader === 'string' && !shader.fragmentShader.includes('uniform float uStaticAoIntensity')) {
        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <common>',
            [
                '#include <common>',
                'uniform float uStaticAoIntensity;',
                'varying float vStaticAo;',
                'float mvStaticAoFactor = 1.0;'
            ].join('\n')
        );

        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <aomap_fragment>',
            [
                '#include <aomap_fragment>',
                'float mvStaticAoBase = clamp(vStaticAo, 0.0, 1.0);',
                'float mvStaticAoIntensity = clamp(uStaticAoIntensity, 0.0, 2.0);',
                'mvStaticAoFactor = clamp(1.0 - mvStaticAoIntensity * (1.0 - mvStaticAoBase), 0.0, 1.0);',
                'reflectedLight.indirectDiffuse *= mvStaticAoFactor;',
                '#ifdef USE_ENVMAP',
                'reflectedLight.indirectSpecular *= mvStaticAoFactor;',
                '#endif',
                '#ifdef STATIC_AO_DEBUG_VIEW',
                'reflectedLight.directDiffuse = vec3(0.0);',
                'reflectedLight.directSpecular = vec3(0.0);',
                'reflectedLight.indirectDiffuse = vec3(mvStaticAoFactor);',
                'reflectedLight.indirectSpecular = vec3(0.0);',
                '#endif'
            ].join('\n')
        );
    }
}

export function applyStaticAoToMeshStandardMaterial(material, { intensity = 0, debugView = false } = {}) {
    const mat = material && typeof material === 'object' ? material : null;
    if (!mat?.isMeshStandardMaterial) return material;

    const state = ensureState(mat);

    const nextIntensity = clamp(intensity, 0, 2, 0);
    state.intensity = nextIntensity;

    const nextDebugView = sanitizeDebugView(debugView);
    const prevDebugView = state.debugView === true;
    state.debugView = nextDebugView;

    mat.defines = mat.defines ?? {};
    if (nextDebugView) mat.defines.STATIC_AO_DEBUG_VIEW = 1;
    else delete mat.defines.STATIC_AO_DEBUG_VIEW;

    if (state.patched !== true) {
        state.patched = true;

        const prevCacheKey = typeof mat.customProgramCacheKey === 'function' ? mat.customProgramCacheKey.bind(mat) : null;
        mat.customProgramCacheKey = () => {
            const prev = prevCacheKey ? prevCacheKey() : '';
            const debug = mat.defines?.STATIC_AO_DEBUG_VIEW ? 1 : 0;
            return `${prev}|static_ao:${STATIC_AO_SHADER_VERSION}:d${debug}`;
        };

        const prevOnBeforeCompile = typeof mat.onBeforeCompile === 'function' ? mat.onBeforeCompile.bind(mat) : null;
        mat.onBeforeCompile = (shader, renderer) => {
            if (prevOnBeforeCompile) prevOnBeforeCompile(shader, renderer);
            injectStaticAoShader(shader);
            const uniforms = shader?.uniforms ?? null;
            if (uniforms?.uStaticAoIntensity) uniforms.uStaticAoIntensity.value = state.intensity;
            state.shaderUniforms = uniforms;
        };
    }

    const uniforms = state.shaderUniforms ?? null;
    if (uniforms?.uStaticAoIntensity) uniforms.uStaticAoIntensity.value = nextIntensity;
    if (prevDebugView !== nextDebugView) mat.needsUpdate = true;
    return mat;
}

