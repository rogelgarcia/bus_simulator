// Independent disc-light ray/plane oracle and a production-shader depth-map fixture.
export async function smallCasterVisibility({ streamed = true, building = true, sign = true, slope = [0, 0],
    boundary = false, buildingEdge = -.1, signGap = 2, buildingGap = 40, independentCaster = true } = {}) {
    const THREE = await import('three');
    const { SmallCasterShadowCache, smallCasterUniforms } = await import('/src/graphics/illumination/static_sun_depth/SmallCasterShadowCache.js');
    const source = await fetch('/src/graphics/shaders/materials/static_sun_depth.frag.glsl').then(r => r.text());
    const declarations = source.slice(0, source.indexOf('void dynamicSunShadowApplyDirectional')).replace('varying highp vec3 vStaticSunWorldPosition;', '');
    let functions = source.slice(source.indexOf('highp vec2 staticSunDepthDecodedDepth'), source.indexOf('highp float staticSunDepthMaxComponent'));
    if (streamed) functions = functions.replace('highp vec4 staticSunDepthLookup(', 'highp vec4 staticSunDepthLookupBase(')
        + await fetch('/src/graphics/shaders/materials/streamed_sun_depth.frag.glsl').then(r => r.text());
    functions += await fetch('/src/graphics/shaders/chunks/shadows/small_caster_shadow.glsl').then(r => r.text());
    const pitch = 0.052734375, finePitch = pitch / 3, count = 126, guard = 24, size = count + 2 * guard;
    const tangent = Math.tan(.53 * Math.PI / 360), low = -100, high = 100;
    const isSign = (x, y) => (Math.abs(x) < .08 && Math.abs(y) < .24) || (Math.abs(x) < .013 && y < -.24 && y > -.8);
    const originX = -count * finePitch * (boundary ? 1 : .5), originY = -count * finePitch / 2;
    function depthMap(step, layers) {
        const bytes = new Uint8Array(size * size * 2 * layers);
        for (let layer = 0; layer < layers; layer++) for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
            const px = originX + (layer * count + x - guard + .5) * step, py = originY + (y - guard + .5) * step;
            const gap = Math.max(building && px < buildingEdge ? buildingGap : 0, sign && isSign(px, py) ? signGap : 0);
            const depth = px * slope[0] + py * slope[1] - gap;
            const q = Math.round((depth - low) / (high - low) * 65534), i = ((layer * size + y) * size + x) * 2;
            bytes[i] = q >> 8; bytes[i + 1] = q & 255;
        }
        const texture = new THREE.DataArrayTexture(bytes, size, size, layers);
        Object.assign(texture, { format: THREE.RGFormat, type: THREE.UnsignedByteType, internalFormat: 'RG8',
            minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false, needsUpdate: true });
        return texture;
    }
    const layers = boundary ? 2 : 1;
    const parent = depthMap(pitch, 1), fine = depthMap(finePitch, layers);
    const table = new THREE.DataTexture(new Float32Array(boundary ? [1, 1, 0, 0, 2, 1, 0, 0] : [1, 1, 0, 0]), layers, 1, THREE.RGBAFormat, THREE.FloatType); table.needsUpdate = true;
    const renderer = new THREE.WebGLRenderer(), width = 128, height = 160;
    renderer.setSize(width, height);
    const uniforms = {
        ...smallCasterUniforms(),
        staticSunDepthTiles: { value: parent }, staticSunDepthWorldToLight: { value: new THREE.Matrix4() },
        staticSunDepthPointDirectionWorld: { value: new THREE.Vector3(0, 0, -1) },
        staticSunDepthGridOrigin: { value: new THREE.Vector2(originX, originY) },
        staticSunDepthTileCount: { value: new THREE.Vector2(1, 1) },
        staticSunDepthDepthRange: { value: new THREE.Vector2(low, high) },
        staticSunDepthEncodingMode: { value: 0 }, staticSunDepthLayout: { value: new THREE.Vector4(count, count, guard, pitch) },
        staticSunDepthBiasPolicy: { value: new THREE.Vector4(.005, 0, 0, 0) },
        staticSunDepthFilterPolicy: { value: new THREE.Vector4(1, 1, 0, tangent) },
        staticSunDepthDebugMode: { value: 0 }, receiverSlope: { value: new THREE.Vector2(...slope) },
        staticSunStreamTiles: { value: fine }, staticSunStreamTable: { value: table },
        staticSunStreamTileCount: { value: new THREE.Vector2(layers, 1) }, staticSunStreamTime: { value: 3 },
        staticSunStreamEnabled: { value: 1 }, staticSunStreamLayout: { value: new THREE.Vector4(count, count, guard, finePitch) }
    };
    const prop = new THREE.Group(), triangles = [];
    for (const [x0, y0, x1, y1] of [[-.08, -.24, .08, .24], [-.013, -.8, .013, -.24]]) {
        for (const [x, y] of [[x0, y0], [x1, y0], [x1, y1], [x0, y0], [x1, y1], [x0, y1]]) triangles.push(x, y, x * slope[0] + y * slope[1] - signGap);
    }
    const propGeometry = new THREE.BufferGeometry(); propGeometry.setAttribute('position', new THREE.Float32BufferAttribute(triangles, 3));
    const propMaterial = new THREE.MeshBasicMaterial(); prop.add(new THREE.Mesh(propGeometry, propMaterial));
    const cache = new SmallCasterShadowCache({ uniforms }, renderer);
    if (sign && independentCaster) await cache.prepare([prop]);
    const material = new THREE.ShaderMaterial({ uniforms, defines: { STATIC_SUN_FINAL: 1 },
        vertexShader: 'varying vec2 vUv; void main(){vUv=uv; gl_Position=vec4(position.xy,0.0,1.0);}',
        fragmentShader: '#include <common>\nvarying vec2 vUv; uniform vec2 receiverSlope;\n' + declarations + functions +
            '\nvoid main(){vec2 xy=vec2((vUv.x-.5)*.8,(vUv.y-.5)*1.0); vec3 p=vec3(xy,dot(xy,receiverSlope)); float v=min(staticSunDepthLookup(p,vec3(0,0,-1)).x,smallSunShadowVisibility(p)); gl_FragColor=vec4(vec3(v),1.0);}' });
    const scene = new THREE.Scene(), quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material); scene.add(quad);
    const target = new THREE.WebGLRenderTarget(width, height), pixels = new Uint8Array(width * height * 4);
    renderer.setRenderTarget(target); renderer.render(scene, new THREE.Camera());
    renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels);
    const reference = new Uint8Array(pixels.length), rays = Array.from({ length: 512 }, (_, i) => {
        const r = Math.sqrt((i + .5) / 512) * tangent, a = i * 2.399963229728653;
        return [r * Math.cos(a), r * Math.sin(a)];
    });
    let absolute = 0, edgeAbsolute = 0, edgeCount = 0, maximum = 0, hiddenSignMaximum = 0;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const px = ((x + .5) / width - .5) * .8, py = ((y + .5) / height - .5);
        let visible = 0;
        for (const [dx, dy] of rays) {
            const denominator = 1 + dx * slope[0] + dy * slope[1];
            const near = signGap / denominator, far = buildingGap / denominator;
            const blocked = (building && px + dx * far < buildingEdge) || (sign && isSign(px + dx * near, py + dy * near));
            if (!blocked) visible++;
        }
        const value = Math.round(visible / rays.length * 255), i = (y * width + x) * 4;
        reference.set([value, value, value, 255], i);
        const error = Math.abs(pixels[i] - value); absolute += error; maximum = Math.max(maximum, error);
        if (sign && Math.abs(py) < .18 && px > -.055 && px < -.025) hiddenSignMaximum = Math.max(hiddenSignMaximum, pixels[i]);
        if (Math.abs(px) < .13 && Math.abs(py) < .3) { edgeAbsolute += error; edgeCount++; }
    }
    function png(bytes) {
        const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
        const context = canvas.getContext('2d'), image = context.createImageData(width, height);
        for (let y = 0; y < height; y++) image.data.set(bytes.subarray(y * width * 4, (y + 1) * width * 4), (height - 1 - y) * width * 4);
        context.putImageData(image, 0, 0); return canvas.toDataURL('image/png').split(',')[1];
    }
    const result = { meanError: absolute / (width * height) / 255, edgeError: edgeAbsolute / edgeCount / 255, maximum: maximum / 255, hiddenSignMaximum: hiddenSignMaximum / 255,
        image: png(pixels), reference: png(reference) };
    cache.dispose(); propGeometry.dispose(); propMaterial.dispose();
    target.dispose(); quad.geometry.dispose(); material.dispose(); parent.dispose(); fine.dispose(); table.dispose(); renderer.dispose();
    return result;
}
