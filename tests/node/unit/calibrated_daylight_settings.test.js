// Physical daylight settings retain radiance units and preserve old user-authored lighting profiles.
import test from 'node:test';
import assert from 'node:assert/strict';
import {CALIBRATED_DAYLIGHT} from '../../../src/graphics/lighting/CalibratedDaylight.js';
import {getDefaultResolvedLightingSettings,loadSavedLightingSettings,sanitizeLightingSettings} from '../../../src/graphics/lighting/LightingSettings.js';

test('Calibrated daylight: source RGB and low exposure survive settings serialization',()=>{
    const value=sanitizeLightingSettings(JSON.parse(JSON.stringify(getDefaultResolvedLightingSettings())));
    assert.equal(value.exposure,CALIBRATED_DAYLIGHT.exposure);
    assert.equal(value.hemiIntensity,0);
    assert.equal(value.ibl.iblId,CALIBRATED_DAYLIGHT.environmentId);
    for(let i=0;i<3;i++)assert.ok(Math.abs(value.sunColorLinear[i]*value.sunIntensity-CALIBRATED_DAYLIGHT.sunNormalRgb[i])<1e-9);
});
test('Calibrated daylight: old saved custom light powers do not inherit the new calibrated sky and sun tint',()=>{
    const previous=globalThis.window;
    globalThis.window={localStorage:{getItem:()=>JSON.stringify({exposure:1.1,hemiIntensity:1.3,sunIntensity:7.2,ibl:{enabled:true,envMapIntensity:.28,setBackground:false}})}};
    try {const saved=loadSavedLightingSettings();assert.equal(saved.ibl.iblId,'ibl.hdri.german_town_street_2k');assert.deepEqual(saved.sunColorLinear,[1,1,1]);assert.equal(saved.sunIntensity,7.2);}
    finally {if(previous===undefined)delete globalThis.window;else globalThis.window=previous;}
});
