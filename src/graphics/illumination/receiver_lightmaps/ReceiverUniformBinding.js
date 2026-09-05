// Restores uniform ownership when Three r183 reuses a program from another receiver bank.
// @ts-check

/** @param {any} material @param {Record<string, {value: any}>} uniforms */
export function bindReceiverUniforms(material, uniforms) {
    const hadRender = Object.hasOwn(material, 'onBeforeRender'), previousRender = material.onBeforeRender;
    function render(renderer, ...args) {
        previousRender.call(material, renderer, ...args);
        const properties = renderer.properties.get(material);
        if (properties.uniforms && properties.uniforms.receiverAtlasEnabled !== uniforms.receiverAtlasEnabled) {
            Object.assign(properties.uniforms, uniforms);
            properties.uniformsList = null;
        }
    }
    material.onBeforeRender = render;
    return () => {
        if (material.onBeforeRender !== render) return;
        if (hadRender) material.onBeforeRender = previousRender;
        else delete material.onBeforeRender;
    };
}
