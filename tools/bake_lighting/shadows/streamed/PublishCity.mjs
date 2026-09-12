// Publish optional detail only after full coverage, source, payload and review gates.
import path from 'node:path';
import {readFile,mkdir,writeFile,cp} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {canonicalJsonBytes} from '../../../../src/app/illumination/bake_source/CanonicalJson.js';
import {validateStreamedShadowManifest} from '../../../../src/app/illumination/static_sun_depth/StreamedShadowPages.js';
import {validateShadowPageGuards} from './ValidatePages.mjs';
import {publishBakeFile} from '../../../baking/Publication.mjs';
import {writeJson,listFiles} from '../../../baking/Files.mjs';
import {shadowReviewShaderIdentity} from './ReviewIdentity.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const readJson = async file => JSON.parse(await readFile(file,'utf8'));
export async function publishCityShadowDetail(ctx) {
    if (!ctx.publish || !ctx.options.input || !ctx.options.review) throw new Error('input, completed review and --publish required');
    const input = path.resolve(ctx.root,ctx.options.input), reviewRoot = path.resolve(ctx.root,ctx.options.review);
    const artifactRoot = path.join(ctx.root,'tests/artifacts/screens/illumination_547') + path.sep;
    if (!input.startsWith(artifactRoot) || !reviewRoot.startsWith(artifactRoot)) throw new Error('Expected isolated shadow artifacts');
    const parentIndexFile = path.join(ctx.root,'assets/baked_lighting/shadows/package_index.json');
    const parentIndexBytes = await readFile(parentIndexFile), index = JSON.parse(parentIndexBytes);
    const profile = index.profiles['ai527.sun.az045.el55'];
    const descriptor = await readJson(path.join(path.dirname(path.resolve(ctx.root,profile.packagePath)),'descriptor.json'));
    const bytes = await readFile(path.join(input,'manifest.json')), sha = hash(bytes);
    const manifest = await validateStreamedShadowManifest(JSON.parse(bytes),descriptor);
    const receipt = await readJson(path.join(input,'receipt.json'));
    const source = (await readJson(path.join(input,'source_evidence.json'))).sourceIdentity;
    const review = await readJson(path.join(reviewRoot,'review.json'));
    if (!receipt.fullCity || receipt.casterPolicy !== 'three-r183-effective-shadow-side-v1'
        || receipt.manifestSha256 !== sha || manifest.coverage !== 'complete parent grid'
        || manifest.pages.length !== manifest.tileCount[0]*manifest.tileCount[1]
        || source.resolvedSource !== profile.liveIdentity.resolvedSourceSha256
        || source.channelSources.find(v=>v.id==='static_sun_depth')?.sha256 !== profile.liveIdentity.staticSunDepthSourceSha256)
        throw new Error('Incomplete or stale city detail candidate');
    if (review.status !== 'validated' || review.manifestSha256 !== sha
        || JSON.stringify(review.shaderIdentity) !== JSON.stringify(await shadowReviewShaderIdentity(ctx.root))
        || review.conditions.coldBrowsers !== 2 || review.conditions.warmPasses !== 3
        || review.passes.length !== 12 || !review.corruptFallback
        || review.corruptFallback.mode !== 'baked' || review.corruptFallback.detail.resident !== 0
        || review.passes.some(p => !Number.isFinite(p.performance?.gpuMs?.median)
            || p.state.mode !== 'baked' || !p.state.indirect || p.state.streaming.gpuBytes > 64*1024*1024))
        throw new Error('Full cold/warm GPU and corrupt-page fallback review required');
    const guards = await validateShadowPageGuards(input,manifest);
    if (!guards.passed || guards.maximumCodeError !== 0) throw new Error('Detail guards failed publication validation');
    const assetRoot = path.join(ctx.root,'assets/baked_lighting/shadows');
    const destination = path.join(assetRoot,'details',sha);
    await mkdir(destination,{recursive:true});
    await cp(path.join(input,'pages'),path.join(destination,'pages'),{recursive:true});
    await writeFile(path.join(destination,'manifest.json'),bytes);
    await writeJson(path.join(destination,'publication_receipt.json'),{schema:1,manifestSha256:sha,
        parentDescriptorSha256:hash(canonicalJsonBytes(descriptor)),source,guards,
        reviewSha256:hash(await readFile(path.join(reviewRoot,'review.json'))),candidateSeconds:receipt.seconds,
        staticGpuBudgetBytes:512*1024*1024,scope:'optional complete-city detail; existing parent release gates unchanged'});
    // The manifest binds every uploaded page; authenticate the destination too.
    const installedGuards = await validateShadowPageGuards(destination,manifest);
    if (!installedGuards.passed || installedGuards.maximumCodeError !== 0) throw new Error('Installed detail payload mismatch');
    await ctx.assertInputsStable();
    if (hash(await readFile(parentIndexFile)) !== hash(parentIndexBytes)) throw new Error('Parent changed while publishing detail');
    const indexFile = path.join(assetRoot,'streaming_index.json');
    const old = await readJson(indexFile).catch(error => { if(error.code==='ENOENT') return {schema:'bus-sim-static-shadow-streaming-index-v1',profiles:[]}; throw error; });
    if (old.schema !== 'bus-sim-static-shadow-streaming-index-v1' || !Array.isArray(old.profiles)) throw new Error('Invalid previous detail index');
    const next = {...old,profiles:old.profiles.filter(p=>p.parentDescriptorSha256!==manifest.parentDescriptorSha256)};
    next.profiles.push({parentDescriptorSha256:manifest.parentDescriptorSha256,sha256:sha,
        url:'/'+path.relative(ctx.root,path.join(destination,'manifest.json')).replaceAll('\\','/')});
    const staged = path.join(ctx.stage,'streaming_index.json'); await writeJson(staged,next);
    await publishBakeFile(staged,indexFile);
    return {state:'published',output:destination,files:[indexFile,...await listFiles(destination)]};
}
