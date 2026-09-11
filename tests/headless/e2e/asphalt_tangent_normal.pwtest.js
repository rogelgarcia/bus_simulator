// The generated road normal must point out of its tangent plane, not along V.
import test, {expect} from '@playwright/test';

test('generated asphalt normals stay in the outward tangent hemisphere', async ({page}) => {
    await page.goto('tests/headless/harness/index.html?ibl=0&bloom=0&grade=off');
    const stats = await page.evaluate(async () => {
        const {getAsphaltFineTextures} = await import('/src/graphics/assets3d/textures/AsphaltFineTextures.js');
        const {normalMap} = getAsphaltFineTextures({size:128});
        const data=normalMap.image.data, mean=[0,0,0]; let minimumZ=1, lengthError=0;
        for(let i=0;i<data.length;i+=4){
            const v=[0,1,2].map(c=>data[i+c]/255*2-1);
            v.forEach((n,c)=>mean[c]+=n/(data.length/4));
            minimumZ=Math.min(minimumZ,v[2]);
            lengthError=Math.max(lengthError,Math.abs(Math.hypot(...v)-1));
        }
        return {mean,minimumZ,lengthError,colorSpace:normalMap.colorSpace};
    });
    expect(stats.minimumZ).toBeGreaterThan(0);
    expect(stats.mean[2]).toBeGreaterThan(.9);
    expect(Math.abs(stats.mean[0])).toBeLessThan(.01);
    expect(Math.abs(stats.mean[1])).toBeLessThan(.01);
    expect(stats.lengthError).toBeLessThan(.008);
    expect(stats.colorSpace).toBe('');
});
