// @ts-check
// Sample the owned invocation tree without touching user sessions; peaks are sampled estimates.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile);
export async function monitor(){
    const records=[],failures=[];let pending=Promise.resolve(),busy=false;
    const sample=()=>{
        if(busy)return;busy=true;
        pending=(async()=>{
            try{
                const cmd=`$ErrorActionPreference='Stop'; $all=Get-CimInstance Win32_Process; $ids=[System.Collections.Generic.HashSet[int]]::new(); [void]$ids.Add(${process.pid}); do { $changed=$false; foreach($p in $all){if($ids.Contains([int]$p.ParentProcessId) -and !$ids.Contains([int]$p.ProcessId)){[void]$ids.Add([int]$p.ProcessId);$changed=$true}} } while($changed); $rows=@($all | Where-Object {$ids.Contains([int]$_.ProcessId) -and $_.Name -ne 'powershell.exe'} | Select-Object ProcessId,Name,WorkingSetSize,KernelModeTime,UserModeTime); ConvertTo-Json -InputObject $rows -Compress`;
                const {stdout}=await exec('powershell.exe',['-NoProfile','-Command',cmd],{windowsHide:true,timeout:15000});
                const rows=JSON.parse(stdout);if(!rows.length)throw new Error('Owned process enumeration unavailable');records.push({time:Date.now(),residentBytes:rows.reduce((s,r)=>s+Number(r.WorkingSetSize),0),processes:rows});
            }catch(e){failures.push(e.message);}
            finally{busy=false;}
        })();
    };
    sample();const timer=setInterval(sample,5000);timer.unref();
    return async()=>{clearInterval(timer);await pending;return {samplingSeconds:5,peakOwnedResidentBytes:records.length?Math.max(...records.map(r=>r.residentBytes)):null,records,failures,gpu:'Per-process GPU utilization/VRAM not available from this sampler; not inferred from system totals.',scope:'Current Node invocation and descendants only; cumulative working-set sum is sampled and may count shared pages.'};};
}
