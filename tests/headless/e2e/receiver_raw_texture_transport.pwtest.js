// Runs the registered native fixture: shader output and saved pixels must retain source semantics.
import test,{expect} from '@playwright/test';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
const execute=promisify(execFile);
test('raw color, data, coverage and HDR transport survive Cycles and scene reload',async()=>{
    test.setTimeout(120000);
    const output=`tests/artifacts/screens/ai562_acesfilmic_reference_matching/texture-regression-${Date.now()}`;
    await execute(process.execPath,['tools/bake.mjs','--target','lighting/experiments/reference-matching/transport-textures',
        '--set',`lighting/experiments/reference-matching/transport-textures:output=${output}`,'--timeout-seconds','90'],
        {cwd:process.cwd(),windowsHide:true,maxBuffer:4*1024*1024});
    const report=JSON.parse(await readFile(path.join(output,'validation.json'),'utf8'));
    expect(report.checks.map(item=>item.name)).toEqual(['raw_srgb','raw_data','raw_linear_hdr','raw_coverage']);
    for(const item of report.checks){expect(item.passed).toBe(true);expect(item.maximumError).toBeLessThan(.001);expect(item.reloadError).toBeLessThan(.001);}
});
