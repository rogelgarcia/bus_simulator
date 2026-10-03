vec4 soilOrm = texture2D(litterSoilOrm, (litterSoilOrmTransform * soilUv).xy);
roughnessFactor = mix(litterSoilRoughness * soilOrm.g, roughnessFactor, litterCoverage);
metalnessFactor = mix(litterSoilMetalness * soilOrm.b, metalnessFactor, litterCoverage);
