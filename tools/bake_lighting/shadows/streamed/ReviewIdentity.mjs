// Bind publication evidence to the exact shaders that produced the review.
import path from 'node:path';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

export async function shadowReviewShaderIdentity(root) {
    const names = ['static_sun_depth.vert.glsl', 'static_sun_depth.frag.glsl',
        'streamed_sun_depth.frag.glsl', 'dynamic_sun_shadow.frag.glsl'];
    return Object.fromEntries(await Promise.all(names.map(async name => [name,
        createHash('sha256').update(await readFile(path.join(root, 'src/graphics/shaders/materials', name))).digest('hex')])));
}
