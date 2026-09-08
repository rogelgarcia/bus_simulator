// Bounds bus shader submission and owns cancellable readiness polling on pinned Three r183.
// @ts-check

function delay(ms, signal) {
    signal.throwIfAborted();
    return new Promise((resolve,reject) => {
        const abort = () => { clearTimeout(timer); reject(signal.reason); };
        const timer = setTimeout(() => { signal.removeEventListener('abort',abort); resolve(); },ms);
        signal.addEventListener('abort',abort,{once:true});
    });
}

/** @param {any} renderer @param {any} candidate @param {any} camera @param {any} world
 * @param {{signal:AbortSignal, timeoutMs?:number, renderTarget?:any}} options */
export async function prepareBusMaterials(renderer, candidate, camera, world, {signal,timeoutMs=15000,renderTarget}) {
    const deadline=performance.now()+timeoutMs;
    const check=()=>{
        signal.throwIfAborted();
        if(renderer.getContext().isContextLost()) throw new Error('bus_material_context_lost');
        if(performance.now()>=deadline) throw new Error('bus_material_preparation_timeout');
    };
    check();
    // Snapshot lighting once; compiling a material must not traverse the whole city
    // for lights on every batch. Geometry/material storage remains shared.
    const lighting=world.clone(false);
    world.traverseVisible(object=>{if(object.isLight && object.layers.test(camera.layers)) lighting.add(object.clone(false));});
    const meshes=[];candidate.traverse(object=>{if(object.isMesh) {
        for(const material of new Set(Array.isArray(object.material)?object.material:[object.material])) {
            const copy=object.clone(false);copy.material=material;meshes.push(copy);
        }
    }});
    await delay(50,signal);
    for(const mesh of meshes) {
        check();
        // Tone mapping/output color space depend on the render target. Prepare
        // the main pass variant and restore state before yielding to a frame.
        const previous = renderer.getRenderTarget?.();
        let materials;
        try {
            if (renderTarget !== undefined) renderer.setRenderTarget(renderTarget);
            materials=renderer.compile(mesh,camera,lighting);
        } finally {
            if (renderTarget !== undefined) renderer.setRenderTarget(previous);
        }
        const programs=new Set([...materials].flatMap(material=>[...renderer.properties.get(material).programs.values()]));
        while([...programs].some(program=>!program.isReady())) { await delay(16,signal);check(); }
        // Yield after each material, including already warm variants. No subsequent
        // material is submitted after cancellation or the preparation deadline.
        await delay(16,signal);
    }
    check();
}
