// Native bake probes must wait for a rendered view, including after stopped-loop configuration changes.
import {test,expect} from '@playwright/test';

test('Native shadow reads wait through preparation and propagate failures',async({page})=>{
    await page.goto('/tests/headless/harness/index.html');
    const result=await page.evaluate(async()=>{
        const {renderProductionPreparedFrame}=await import('/tools/static_sun_depth/browser/ProductionPreparedFrame.js');
        let frames=0,allocated=false;
        const engine={renderFrame(){frames++;if(frames===3)allocated=true;},
            getBakedLightingDebugInfo:()=>({view:{ready:frames>=3,error:null}})};
        await renderProductionPreparedFrame(engine);
        const error=await renderProductionPreparedFrame({renderFrame(){},
            getBakedLightingDebugInfo:()=>({view:{ready:false,error:'fixture_compile_failure'}})}).then(()=>null,error=>error.message);
        return {frames,allocated,error};
    });
    expect(result).toEqual({frames:3,allocated:true,error:'fixture_compile_failure'});
});
