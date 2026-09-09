// Owns one isolated browser and repository server; never attaches to the user's Chrome.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';

async function freePort() {
    const probe=net.createServer();
    await new Promise((resolve,reject)=>{probe.once('error',reject);probe.listen(0,'127.0.0.1',resolve);});
    const port=probe.address().port;
    await new Promise(resolve=>probe.close(resolve));
    return port;
}

export async function withGameBrowser(ctx, viewport, run) {
    let browser,server,serverClosed,serverError='';
    const cancel=()=>{void browser?.close().catch(()=>{});server?.kill();};
    ctx.signal.addEventListener('abort',cancel,{once:true});
    try {
        ctx.signal.throwIfAborted();
        const port=await freePort(),url=`http://127.0.0.1:${port}`;
        server=spawn(process.execPath,['tests/headless/e2e/static_server.mjs'],{cwd:ctx.root,
            env:{...process.env,PORT:String(port),HOST:'127.0.0.1'},windowsHide:true,stdio:['ignore','ignore','pipe']});
        serverClosed=new Promise(resolve=>server.once('close',resolve));
        server.on('error',error=>{serverError=error.message;});
        server.stderr.on('data',data=>{serverError=(serverError+data).slice(-2000);});
        const deadline=Date.now()+15000;
        while(true) {
            ctx.signal.throwIfAborted();
            if(server.exitCode!==null || serverError) throw new Error(`Game server failed: ${serverError}`);
            const ready=await fetch(`${url}/__health`,{signal:AbortSignal.timeout(1000)}).then(r=>r.ok).catch(()=>false);
            if(ready)break;
            if(Date.now()>deadline)throw new Error('Game server did not become ready');
            await delay(100,undefined,{signal:ctx.signal});
        }
        browser=await chromium.launch({executablePath:ctx.config.browserExecutable,headless:true,
            args:['--disable-background-timer-throttling','--disable-renderer-backgrounding']});
        ctx.signal.throwIfAborted();
        const page=await browser.newPage({viewport:{width:viewport.width,height:viewport.height},deviceScaleFactor:1});
        page.setDefaultTimeout(240000);
        return await run(page,url,browser.version());
    } finally {
        await browser?.close().catch(()=>{});
        if(server?.pid && server.exitCode===null && server.signalCode===null) server.kill();
        await serverClosed;
        ctx.signal.removeEventListener('abort',cancel);
    }
}
