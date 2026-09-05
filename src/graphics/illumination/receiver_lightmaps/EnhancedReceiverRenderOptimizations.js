// Removes redundant draws only while the enhanced receiver implementation owns the render path.
// @ts-check
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';

/** @param {any} engine */
export function installEnhancedReceiverRenderOptimizations(engine) {
    const pipeline = engine._post?.pipeline;
    if (!pipeline) return () => {};
    const shadowOnly = [];
    engine.context.city.group.traverse((object) => {
        if (object.userData?.isShadowCasterMerge) shadowOnly.push(object);
    });
    const previous = pipeline.render;
    function render(...args) {
        const hidden = [];
        const ao = pipeline._ao.mode === 'gtao' ? pipeline._ao.pass : null;
        const preserveColor = ao?.output === GTAOPass.OUTPUT.Diffuse && pipeline._gtaoCache?.blendPass;
        const previousSwap = ao?.needsSwap, previousOutput = ao?.output;
        try {
            for (const object of shadowOnly) {
                if (object.visible && !object.castShadow) { hidden.push(object); object.visible = false; }
            }
            // The separate cached-AO blend already composites the result. Keep its
            // scene-color input in place instead of copying it just to swap buffers.
            if (preserveColor) { ao.output = GTAOPass.OUTPUT.Off; ao.needsSwap = false; }
            return previous.apply(pipeline, args);
        } finally {
            for (const object of hidden) object.visible = true;
            if (preserveColor) { ao.output = previousOutput; ao.needsSwap = previousSwap; }
        }
    }
    pipeline.render = render;
    return () => { if (pipeline.render === render) pipeline.render = previous; };
}
