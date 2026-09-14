// White-energy calibration contract shared by browser fixtures and city diagnostics.
export function referenceWhiteEnergy(cells){
    const roughness=[.05,.2,.4,.6,.78,.85,1],noV=[.05,.15,.3,.45,.6,.75,.9,1];
    if(!Array.isArray(cells)||cells.length!==56)throw new Error('Expected 56 white dielectric cells');
    const pixels=new Float32Array(7*8*4);
    for(let v=0;v<8;v++)for(let r=0;r<7;r++){
        const matches=cells.filter(c=>c?.roughness===roughness[r]&&c?.noV===noV[v]);
        if(matches.length!==1)throw new Error('Missing or duplicate roughness/view-angle cell');
        const rgb=matches[0].cycles;
        if(!Array.isArray(rgb)||rgb.length!==3||rgb.some(x=>!Number.isFinite(x)||x<=0||x>1))throw new Error('Invalid dielectric white energy');
        const value=rgb.reduce((a,b)=>a+b,0)/3;
        if((Math.max(...rgb)-Math.min(...rgb))/value>.005)throw new Error('White fixture is not neutral');
        pixels.set([value,value,value,1],(v*7+r)*4);
    }
    return {roughness,noV,pixels};
}
