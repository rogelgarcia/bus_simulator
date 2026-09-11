// Map cache tiles to regions of one canonical native shadow projection.
import {getProductionStaticSunGrid} from '../../../src/app/illumination/static_sun_depth/StaticSunDepthContract.js';

export function productionNativeFieldProjection(layout, originDepth) {
    const {basis}=layout, bounds=layout.layout.boundsLightMeters;
    const direction=basis.depthAxisWorld.map(value=>-value);
    const grid=getProductionStaticSunGrid(direction), [width,height]=grid.mapSizeTexels;
    const [tileWidth,tileHeight]=layout.layout.interiorPixels ?? layout.layout.interiorTexels;
    const center=[bounds.min[0]+grid.worldExtentMeters[0]/2,bounds.min[1]+grid.worldExtentMeters[1]/2];
    const position=basis.originWorld.map((v,i)=>v+basis.rightAxisWorld[i]*center[0]+basis.upAxisWorld[i]*center[1]+basis.depthAxisWorld[i]*originDepth);
    return {position,target:position.map((v,i)=>v+basis.depthAxisWorld[i]),extent:grid.worldExtentMeters,mapSize:[width,height],
        region:([x,y])=>({x:width-(x+1)*tileWidth,y:y*tileHeight,width:tileWidth,height:tileHeight}),
        tileLength:tileWidth*tileHeight};
}
