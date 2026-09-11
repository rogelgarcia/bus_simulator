// Validate native city/bus transitions in the same isolated, compatible capture session.
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { writeJson } from '../../../baking/Files.mjs';

export async function lightingTransitions(page, output) {
    await mkdir(output);
    const progress = [];
    await page.exposeFunction('__ai562TransitionProgress', async item => {
        progress.push(item);
        await writeJson(path.join(output, 'progress.json'), progress);
    });
    await page.locator('canvas').first().screenshot({path:path.join(output, 'before.png')});
    const work = page.evaluate(async () => {
        const engine = window.__busSim.engine, renderer = engine.renderer;
        const original = structuredClone(engine.bakedLightingSettings);
        const frames = [], modes = [], rounds = [], materialTransitions = [], longTasks = [];
        let phase='reflections';
        const observer=new PerformanceObserver(list=>{
            for(const entry of list.getEntries())longTasks.push({phase,startMs:entry.startTime,durationMs:entry.duration});
        });
        observer.observe({type:'longtask',buffered:false});
        const materialSnapshot = () => {
            const materials = {};
            for (const vehicle of engine.getDynamicIlluminationObjects().filter(value => value.id.startsWith('vehicle.'))) {
                vehicle.root.traverse(mesh => {
                    if (!mesh.isMesh || mesh.name === 'ibl_probe_sphere') return;
                    (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((material, index) => {
                        materials[vehicle.id + ':' + mesh.uuid + ':' + index] = {uuid:material.uuid,name:material.name};
                    });
                });
            }
            return materials;
        };
        const authoredMaterials = materialSnapshot();
        let track = true, previous = performance.now(), expected = 'baked';
        const frame = time => {
            frames.push(time - previous); previous = time;
            const state = engine.getBakedLightingDebugInfo();
            if (expected === 'baked' && (state.status.effectiveMode !== 'baked' || !state.receiverLightmaps.effective.indirect)) modes.push(state.status);
            if (track) requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
        const wait = async predicate => {
            const deadline = performance.now() + 120000;
            while (!predicate()) {
                const bus = engine.getBakedLightingDebugInfo().busLighting;
                if (bus.transitionState === 'failed') throw new Error('Bus material transition failed: ' + bus.transitionError);
                if (performance.now() > deadline) throw new Error('Lighting transition timed out');
                await new Promise(requestAnimationFrame);
            }
            for (let i = 0; i < 6; i++) await new Promise(requestAnimationFrame);
        };
        try {
            for (let round = 0; round < 3; round++) {
                const start = performance.now(), firstFrame = frames.length;
                for (const flags of [{glassReflections:true}, {bodyReflections:true}, {rimShine:true},
                    {glassReflections:true,bodyReflections:true,rimShine:true}, {}]) {
                    await window.__ai562TransitionProgress({round,flags,state:'requested'});
                    await engine.setBakedLightingSettings({...original, bus:{...original.bus,
                        glassReflections:false,bodyReflections:false,rimShine:false,...flags}});
                    await wait(() => !engine.getBakedLightingDebugInfo().busLighting.transitionState);
                    const snapshot = materialSnapshot();
                    const changed = Object.entries(snapshot).filter(([key, value]) => value.uuid !== authoredMaterials[key]?.uuid);
                    const enabled = Object.keys(flags).length > 0;
                    // The capture recipe starts with all three reflection controls off.
                    // Verify visible mesh assignments, not merely the saved checkbox state.
                    if (!original.bus.enabled && !original.bus.glassReflections && !original.bus.bodyReflections && !original.bus.rimShine
                        && (enabled ? changed.length === 0 : changed.length !== 0)) {
                        throw new Error('Bus reflection toggle did not apply or restore the authored material references');
                    }
                    materialTransitions.push({round,flags,changed:changed.map(([mesh, material]) => ({mesh,...material})),
                        diagnostics:engine.getBakedLightingDebugInfo().busLighting});
                    await window.__ai562TransitionProgress({round,flags,state:'applied',changedMaterials:changed.length});
                }
                rounds.push({round,seconds:(performance.now()-start)/1000,programs:renderer.info.programs.length,
                    memory:{...renderer.info.memory},maximumFrameMs:Math.max(...frames.slice(firstFrame))});
            }
            expected = null;
            for (const [modeRound, mode] of [0,1].flatMap(round=>['current','auto','baked'].map(mode=>[round,mode]))) {
                phase=mode;
                await window.__ai562TransitionProgress({mode,state:'requested'});
                const start = performance.now(), firstFrame = frames.length;
                await engine.setBakedLightingSettings({...original,mode});
                await wait(() => {
                    const state = engine.getBakedLightingDebugInfo();
                    return state.status.effectiveMode === (mode === 'current' ? 'current' : 'baked')
                        && state.view?.ready
                        && (mode === 'current' || state.receiverLightmaps.activationBlend === 1);
                });
                rounds.push({mode,modeRound,seconds:(performance.now()-start)/1000,status:engine.getBakedLightingDebugInfo().status,
                    programs:renderer.info.programs.length,memory:{...renderer.info.memory},
                    renderedFrames:frames.length-firstFrame,maximumFrameMs:Math.max(0,...frames.slice(firstFrame))});
                await window.__ai562TransitionProgress({mode,state:'applied'});
            }
            return {rounds,materialTransitions,longTasks,worldDropouts:modes,steadyPrograms:rounds[1].programs === rounds[2].programs,
                steadyTextures:rounds[1].memory.textures === rounds[2].memory.textures,
                steadyGeometries:rounds[1].memory.geometries === rounds[2].memory.geometries};
        } catch (error) {
            await window.__ai562TransitionProgress({error:error.message,bus:engine.getBakedLightingDebugInfo().busLighting});
            throw error;
        } finally {
            observer.disconnect();
            track = false;
            await engine.setBakedLightingSettings(original);
            await wait(() => engine.getBakedLightingDebugInfo().receiverLightmaps.activationBlend === 1);
        }
    });
    let timer;
    const result = await Promise.race([work, new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Actual lighting transition suite exceeded 180 seconds')), 180000);
    })]).finally(() => clearTimeout(timer));
    await writeJson(path.join(output, 'transitions.json'), result);
    await page.locator('canvas').first().screenshot({path:path.join(output, 'after.png')});
    if(result.worldDropouts.length || !result.steadyPrograms || !result.steadyTextures || !result.steadyGeometries) throw new Error('Lighting toggles lost the baked world or kept allocating resources');
    if(result.rounds.some(round=>round.maximumFrameMs>2000)) throw new Error('Lighting transition blocked the main thread for over two seconds');
    return result;
}
