// Convert identified generated XZY normal texels into tangent XYZ without mutating source storage.
export function generatedNormalToTangent(pixels){
    if(!ArrayBuffer.isView(pixels)||pixels.length%4)throw new Error('Expected generated RGBA normal texels');
    const corrected=pixels.slice();
    for(let i=0;i<corrected.length;i+=4){corrected[i+1]=pixels[i+2];corrected[i+2]=pixels[i+1];}
    return corrected;
}
