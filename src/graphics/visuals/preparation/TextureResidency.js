// Mirrors Three r183's source/sampler cache identity; shared material clones must not upload twice.
// @ts-check
function cacheKey(texture) {
    return [texture.wrapS, texture.wrapT, texture.wrapR || 0, texture.magFilter, texture.minFilter,
        texture.anisotropy, texture.internalFormat, texture.format, texture.type, texture.generateMipmaps,
        texture.premultiplyAlpha, texture.flipY, texture.unpackAlignment, texture.colorSpace].join();
}

export class TextureResidency {
    /** @param {any} renderer */
    constructor(renderer) { this.renderer = renderer; this.sources = new WeakMap(); this.visible = new WeakSet(); this.prepared = new Map(); }

    remember(texture, visible = false) {
        const properties = this.renderer.properties.get(texture), native = properties.__webglTexture;
        if (!native || !properties.__cacheKey) return null;
        let variants = this.sources.get(texture.source);
        if (!variants) this.sources.set(texture.source, variants = new Map());
        variants.set(properties.__cacheKey, { texture, native, sourceVersion: texture.source.version });
        if (visible) this.visible.add(native);
        return native;
    }

    /** Returns true only while the matching renderer-managed source allocation is current. */
    ready(texture) {
        if (this.renderer.properties.get(texture.source).__version !== texture.source.version) return false;
        const key = cacheKey(texture), reference = this.sources.get(texture.source)?.get(key);
        if (!reference || reference.sourceVersion !== texture.source.version) return false;
        const properties = this.renderer.properties.get(reference.texture);
        return properties.__cacheKey === key && properties.__webglTexture === reference.native;
    }

    forget(texture) {
        const variants = this.sources.get(texture.source);
        if (variants) for (const [key, value] of variants) if (value.texture === texture) variants.delete(key);
        for (const [key, value] of this.prepared) if (value === texture) this.prepared.delete(key);
    }
}
