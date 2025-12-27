// src/city/CityRNG.js
function xmur3(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
        h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
        h = (h << 13) | (h >>> 19);
    }
    return function () {
        h = Math.imul(h ^ (h >>> 16), 2246822507);
        h = Math.imul(h ^ (h >>> 13), 3266489909);
        h ^= h >>> 16;
        return h >>> 0;
    };
}

function mulberry32(a) {
    return function () {
        let t = (a += 0x6D2B79F5);
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export class CityRNG {
    constructor(seed = 'city') {
        this.reset(seed);
    }

    reset(seed = 'city') {
        this.seed = String(seed);
        const seedFn = xmur3(this.seed);
        this._rand = mulberry32(seedFn());
        return this;
    }

    float() { return this._rand(); }
    int(maxExclusive) { return Math.floor(this.float() * Math.max(1, maxExclusive)); }
    range(min, max) { return min + this.float() * (max - min); }
    chance(p) { return this.float() < p; }
    pick(arr) { return arr[this.int(arr.length)]; }

    shuffle(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = this.int(i + 1);
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }
}
