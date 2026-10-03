// Bounds speculative appearance credit by a material composition that fits its existing ceilings.
// @ts-check
import { landscapeTextureBytes } from './LandscapeAppearanceBudget.js';

/**
 * @param {{fixedCpuBytes:number,fixedGpuBytes:number,decodeBytes:number,limits:{cpuBytes:number,gpuBytes:number},materials:Array<{soilId:string,index:number,priority:number,desiredResolution:number,resolutions:number[]}>}} options
 */
export function planLandscapeAppearanceDemand({ fixedCpuBytes, fixedGpuBytes, decodeBytes, limits, materials }) {
    let cpuBytes = fixedCpuBytes + materials.length * 32 ** 2 * 12;
    let gpuBytes = fixedGpuBytes + materials.length * landscapeTextureBytes(32) * 3;
    let largestDecode = decodeBytes;
    const desiredTiers = Object.fromEntries(materials.map(material => [material.soilId, '32']));
    const ordered = [...materials].sort((a, b) => b.priority - a.priority || a.index - b.index);
    for (const material of ordered) {
        const tiers = material.resolutions.filter(resolution => resolution > 32 && resolution <= material.desiredResolution).sort((a, b) => b - a);
        for (const resolution of tiers) {
            const rawBytes = resolution ** 2 * 12, mipBytes = landscapeTextureBytes(resolution) * 3;
            const nextDecode = Math.max(largestDecode, rawBytes);
            if (cpuBytes + rawBytes + nextDecode > limits.cpuBytes || gpuBytes + mipBytes > limits.gpuBytes) continue;
            cpuBytes += rawBytes;
            gpuBytes += mipBytes;
            largestDecode = nextDecode;
            desiredTiers[material.soilId] = String(resolution);
            break;
        }
    }
    return { cpuBytes: cpuBytes + largestDecode, gpuBytes, desiredTiers };
}
