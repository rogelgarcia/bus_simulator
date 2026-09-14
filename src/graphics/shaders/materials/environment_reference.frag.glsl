uniform bool referenceEnvironmentEnabled;
uniform int referenceEnvironmentSamples;
uniform sampler2D referenceWhiteEnergy;
uniform float referenceRoughness[7];
uniform float referenceNoV[8];

float referenceEnergy(float rough, float nv) {
    int ri = 0; int vi = 0;
    for (int i = 1; i < 6; i++) if (rough >= referenceRoughness[i]) ri = i;
    for (int i = 1; i < 7; i++) if (nv >= referenceNoV[i]) vi = i;
    float r = clamp((rough-referenceRoughness[ri])/(referenceRoughness[ri+1]-referenceRoughness[ri]),0.0,1.0);
    float v = clamp((nv-referenceNoV[vi])/(referenceNoV[vi+1]-referenceNoV[vi]),0.0,1.0);
    return texture2D(referenceWhiteEnergy,vec2((float(ri)+r+0.5)/7.0,(float(vi)+v+0.5)/8.0)).r;
}

float referenceDielectricFresnel(float cosine) {
    float transmitted = sqrt(1.0-(1.0-cosine*cosine)/2.25);
    float perpendicular = (cosine-1.5*transmitted)/(cosine+1.5*transmitted);
    float parallel = (1.5*cosine-transmitted)/(1.5*cosine+transmitted);
    return 0.5*(perpendicular*perpendicular+parallel*parallel);
}

// Diagnostic visible-GGX quadrature (Heitz 2018). The white energy is measured
// independently; this controls energy separately from directional filtering.
vec3 referenceEnvironment(vec3 normal, vec3 viewDir, float roughness) {
    #if defined(USE_ENVMAP) && defined(ENVMAP_TYPE_CUBE_UV)
        float nv = clamp(dot(normal,viewDir),0.0001,1.0);
        vec3 tangent = abs(normal.z)<0.999 ? normalize(cross(vec3(0.0,0.0,1.0),normal)) : normalize(cross(vec3(0.0,1.0,0.0),normal));
        vec3 bitangent = cross(normal,tangent);
        vec3 view = vec3(dot(viewDir,tangent),dot(viewDir,bitangent),nv);
        float alpha = max(roughness*roughness,0.0001);
        vec3 vh = normalize(vec3(alpha*view.xy,view.z));
        float lensq = dot(vh.xy,vh.xy);
        vec3 t1 = lensq>0.00000001 ? vec3(-vh.y,vh.x,0.0)/sqrt(lensq) : vec3(1.0,0.0,0.0);
        vec3 t2 = cross(vh,t1);
        float sv = sqrt(1.0+alpha*alpha*(1.0-nv*nv)/(nv*nv));
        vec3 sum = vec3(0.0); float weights = 0.0;
        for (int i = 0; i < 256; i++) {
            if (i >= referenceEnvironmentSamples) break;
            float u = (float(i)+0.5)/float(referenceEnvironmentSamples);
            float index = float(i); float v = 0.0; float bit = 0.5;
            for (int j = 0; j < 8; j++) { v += mod(index,2.0)*bit; index=floor(index*0.5); bit*=0.5; }
            float p = sqrt(u)*cos(2.0*PI*v); float q = sqrt(u)*sin(2.0*PI*v);
            float s = 0.5*(1.0+vh.z);
            q = (1.0-s)*sqrt(max(0.0,1.0-p*p))+s*q;
            vec3 halfNormal = p*t1+q*t2+sqrt(max(0.0,1.0-p*p-q*q))*vh;
            halfNormal = normalize(vec3(alpha*halfNormal.xy,max(0.0,halfNormal.z)));
            float vhDot = clamp(dot(view,halfNormal),0.0,1.0);
            vec3 light = 2.0*vhDot*halfNormal-view;
            if (light.z>0.000001) {
                float sl = sqrt(1.0+alpha*alpha*(1.0-light.z*light.z)/(light.z*light.z));
                float weight = referenceDielectricFresnel(vhDot)*(1.0+sv)/(sv+sl);
                vec3 direction = inverseTransformDirection(tangent*light.x+bitangent*light.y+normal*light.z,viewMatrix);
                sum += weight*textureCubeUV(envMap,envMapRotation*direction,0.0).rgb;
                weights += weight;
            }
        }
        return sum/max(weights,0.000001)*referenceEnergy(roughness,nv)*envMapIntensity;
    #else
        return vec3(0.0);
    #endif
}
