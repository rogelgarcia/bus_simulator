vec4 busDiffuseProbe = busProbeIrradiance(busProbeWorldPosition, inverseTransformDirection(normal, viewMatrix));
reflectedLight.indirectDiffuse = mix(reflectedLight.indirectDiffuse,
    busDiffuseProbe.rgb * BRDF_Lambert(material.diffuseColor), busDiffuseProbe.a);
