// Region readbacks preserve native pixel centers while cache X runs in the opposite direction.
import test from 'node:test';
import assert from 'node:assert/strict';
import {productionNativeFieldProjection} from '../../../../tools/static_sun_depth/browser/ProductionNativeFieldProjection.js';
import {createProductionStaticSunDepthBasis} from '../../../../src/app/illumination/static_sun_depth/StaticSunDepthContract.js';

test('high-sun tile regions preserve full-map pixel centers, including odd tile rows',()=>{
    const elevation=55*Math.PI/180;
    const basis=createProductionStaticSunDepthBasis([Math.cos(elevation)/Math.sqrt(2),Math.sin(elevation),Math.cos(elevation)/Math.sqrt(2)]);
    const layout={basis,layout:{boundsLightMeters:{min:[-440,-380],max:[437,374]},interiorPixels:[1870,1821]}};
    const p=productionNativeFieldProjection(layout,-270);
    for(let ty=0;ty<7;ty++)for(let tx=0;tx<8;tx++){
        const [w,h]=p.mapSize;
        const region=p.region([tx,ty]);
        assert.equal(w,16384);assert.equal(h,16384);
        assert.deepEqual([region.width,region.height],[1870,1821]);
        assert.ok(region.x>=0 && region.x+region.width<=w);
        assert.ok(region.y>=0 && region.y+region.height<=h);
        for(const x of [0,935,1869])for(const y of [0,910,1820]){
            const fullX=w-(tx*1870+x+.5),fullY=ty*1821+y+.5;
            const localX=fullX-region.x,localY=fullY-region.y;
            assert.equal(localX,1870-x-.5);
            assert.equal(localY,y+.5);
        }
    }
    assert.equal(p.tileLength,1870*1821);
});
