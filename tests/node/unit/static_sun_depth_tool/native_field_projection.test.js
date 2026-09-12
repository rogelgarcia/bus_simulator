// Region readbacks preserve native pixel centers while cache X runs in the opposite direction.
import test from 'node:test';
import assert from 'node:assert/strict';
import {productionNativeFieldProjection} from '../../../../tools/static_sun_depth/browser/ProductionNativeFieldProjection.js';
import {createProductionStaticSunDepthBasis,getProductionStaticSunGrid} from '../../../../src/app/illumination/static_sun_depth/StaticSunDepthContract.js';

test('denser afternoon grid covers the city footprint within native readback and package limits',()=>{
    const direction=[0.405579787672639,0.819152044288992,0.405579787672639];
    const grid=getProductionStaticSunGrid(direction), basis=createProductionStaticSunDepthBasis(direction);
    const bounds={min:[-301.3699951171875,-0.8017351627349854,-300],max:[300.2178039550781,45.012001037597656,300]};
    const corners=[];
    for(const x of [bounds.min[0],bounds.max[0]])for(const y of [bounds.min[1],bounds.max[1]])for(const z of [bounds.min[2],bounds.max[2]])corners.push([x,y,z]);
    const count=[basis.rightAxisWorld,basis.upAxisWorld].map((axis,i)=>{
        const projected=corners.map(point=>point.reduce((sum,v,j)=>sum+v*axis[j],0));
        const required=Math.max(...projected)-Math.min(...projected)+4+grid.texelSizeMeters;
        return Math.ceil(required/(grid.interiorPixels[i]*grid.texelSizeMeters));
    });
    assert.deepEqual(count,[8,7]);
    assert.ok(grid.texelSizeMeters < 960/16384);
    const payload=count[0]*count[1]*(grid.interiorPixels[0]+8)*(grid.interiorPixels[1]+8)*2;
    assert.equal(payload,448*1024*1024);
    assert.ok(payload+1024*1024<512*1024*1024);
    const p=productionNativeFieldProjection({basis,layout:{boundsLightMeters:{min:[-430,-377]},interiorPixels:grid.interiorPixels}},-270);
    for(let y=0;y<count[1];y++)for(let x=0;x<count[0];x++){
        const region=p.region([x,y]);
        assert.ok(region.x>=0 && region.x+region.width<=p.mapSize[0]);
        assert.ok(region.y>=0 && region.y+region.height<=p.mapSize[1]);
    }
});

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
