import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { chromium, firefox, webkit } from 'playwright';

const engine=process.env.BROWSER||'chromium',origin=process.env.PIANO_URL||'http://127.0.0.1:8421/';
const report={engine,origin,build:JSON.parse(await readFile('dist/version.json')).version,testedAt:new Date().toISOString(),checks:[],errors:[],limits:['Wake lock lifecycle and fullscreen refusal are simulated. Native fullscreen is checked separately when supported. Physical Honor MagicPad 2 system bars and screen timeout are not verified by headless tests.']};
const browser=await {chromium,firefox,webkit}[engine].launch({headless:true,...(engine==='chromium'?{executablePath:'/usr/bin/chromium',args:['--mute-audio']}: {})});
const contexts=[];
async function setup(mode='ready',fullscreen='fake') {
  const context=await browser.newContext({viewport:{width:800,height:1280},hasTouch:true,reducedMotion:'reduce'});contexts.push(context);
  await context.addInitScript(({mode,fullscreen})=>{
    const test=window.displayTest={requests:0,locks:[],fullRequests:[],exits:0};
    if(mode==='native'){
      if(navigator.wakeLock){const request=navigator.wakeLock.request.bind(navigator.wakeLock);navigator.wakeLock.request=async type=>{test.requests++;const lock=await request(type);test.locks.push(lock);return lock;};}
    }else Object.defineProperty(navigator,'wakeLock',{configurable:true,value:mode==='unsupported'?undefined:{async request(type){
      test.requests++;if(mode==='denied')throw new DOMException('Battery saver','NotAllowedError');
      const lock=new EventTarget();lock.released=false;lock.release=async()=>{lock.released=true;lock.dispatchEvent(new Event('release'));};test.locks.push(lock);return lock;
    }}});
    const port={id:'test',name:'Test keyboard',state:'connected',connection:'closed',async open(){this.connection='open';},async close(){this.connection='closed';}};
    Object.defineProperty(navigator,'requestMIDIAccess',{configurable:true,value:async()=>({inputs:new Map([[port.id,port]])})});
    let hidden=false;Object.defineProperty(document,'hidden',{configurable:true,get:()=>hidden});
    test.hide=value=>{hidden=value;document.dispatchEvent(new Event('visibilitychange'));};
    if(fullscreen==='native')return;
    let element=null;Object.defineProperty(document,'fullscreenEnabled',{configurable:true,value:fullscreen!=='unsupported'});
    Object.defineProperty(document,'fullscreenElement',{configurable:true,get:()=>element});
    Element.prototype.requestFullscreen=fullscreen==='unsupported'?undefined:async function(options){
      test.fullRequests.push(options);if(fullscreen==='denied')throw new DOMException('Blocked','NotAllowedError');
      element=this;document.dispatchEvent(new Event('fullscreenchange'));
    };
    Element.prototype.webkitRequestFullscreen=undefined;
    document.exitFullscreen=async()=>{element=null;test.exits++;document.dispatchEvent(new Event('fullscreenchange'));};
  },{mode,fullscreen});
  const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));await page.goto(origin);return page;
}
async function check(label,run){await run();report.checks.push(label);console.log('PASS '+label);}
try{
  await mkdir('docs/images',{recursive:true});
  await check('screen lock starts with quiz, remains during pause, releases at Home, and opt-out persists',async()=>{
    const page=await setup();assert.equal(await page.evaluate(()=>displayTest.requests),0);
    await page.locator('#start-button').click();await page.waitForFunction(()=>displayTest.locks.length===1);
    await page.locator('#pause-button').click();assert.equal(await page.evaluate(()=>displayTest.locks[0].released),false);
    await page.locator('#settings-button').click();assert.match(await page.locator('#wake-status').innerText(),/stays awake/);
    await page.locator('#wake-setting').uncheck();assert.equal(await page.evaluate(()=>displayTest.locks[0].released),true);
    await page.reload();await page.locator('#settings-button').click();assert.equal(await page.locator('#wake-setting').isChecked(),false);
    await page.locator('[data-close="settings-dialog"]').click();await page.locator('#start-button').click();assert.equal(await page.evaluate(()=>displayTest.requests),0);
    await page.locator('#settings-button').click();await page.locator('#wake-setting').check();await page.waitForFunction(()=>displayTest.locks.length===1);
    await page.locator('[data-close="settings-dialog"]').click();await page.locator('#home-button').click();assert.equal(await page.evaluate(()=>displayTest.locks[0].released),true);
  });
  await check('metronome, touch rhythm and MIDI sight-reading all keep the practice screen awake',async()=>{
    const page=await setup();
    for(const [i,activity] of ['metronome','rhythm','sight'].entries()){
      await page.selectOption('#activity-select',activity);await page.locator('#start-button').click();await page.waitForFunction(n=>displayTest.locks.length===n,i+1);
      assert.equal(await page.evaluate(i=>displayTest.locks[i].released,i),false);
      await page.locator('#training-back').click();assert.equal(await page.evaluate(i=>displayTest.locks[i].released,i),true);
    }
  });
  await check('background release reacquires on return and a device release offers a working Retry',async()=>{
    const page=await setup();await page.locator('#start-button').click();await page.waitForFunction(()=>displayTest.locks.length===1);
    await page.evaluate(()=>displayTest.hide(true));assert.equal(await page.evaluate(()=>displayTest.locks[0].released),true);
    await page.evaluate(()=>displayTest.hide(false));await page.waitForFunction(()=>displayTest.locks.length===2);
    await page.evaluate(()=>displayTest.locks[1].release());await page.locator('#settings-button').click();assert.equal(await page.locator('#wake-retry').isVisible(),true);
    await page.locator('#wake-retry').click();await page.waitForFunction(()=>displayTest.locks.length===3);assert.match(await page.locator('#wake-status').innerText(),/stays awake/);
  });
  await check('fullscreen toolbar and settings controls request hidden navigation and follow native exits',async()=>{
    const page=await setup();await page.locator('#fullscreen-button').tap();
    assert.deepEqual(await page.evaluate(()=>displayTest.fullRequests),[{navigationUI:'hide'}]);assert.equal(await page.locator('#fullscreen-button').getAttribute('aria-label'),'Exit fullscreen');
    await page.evaluate(()=>document.exitFullscreen());assert.equal(await page.locator('#fullscreen-button').getAttribute('aria-label'),'Enter fullscreen');
    await page.locator('#settings-button').click();await page.locator('#fullscreen-setting').click();assert.equal(await page.locator('#settings-dialog').isVisible(),false);assert.equal(await page.locator('#fullscreen-button').getAttribute('aria-pressed'),'true');
    for(const size of [{width:800,height:1280},{width:1280,height:800},{width:430,height:932},{width:932,height:430},{width:320,height:568}]){
      await page.setViewportSize(size);await page.waitForFunction(h=>Math.abs(document.body.getBoundingClientRect().height-h)<1,size.height);
      for(const offline of [false,true]){
        await page.evaluate(offline=>{document.getElementById('network-status').hidden=!offline;},offline);
        for(const id of ['fullscreen-button','settings-button'])assert.equal(await page.locator('#'+id).evaluate(e=>{const b=e.getBoundingClientRect();return b.width>=44&&b.height>=44&&b.x>=0&&b.right<=innerWidth&&e.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2));}),true,JSON.stringify({size,id,offline}));
      }
      await page.evaluate(()=>{document.getElementById('network-status').hidden=true;});
    }
    await page.setViewportSize({width:1280,height:800});await page.locator('#settings-button').click();await page.screenshot({path:`docs/images/display-settings-${engine}.png`});
    const manifest=await (await page.request.get(new URL('manifest.webmanifest',origin).href)).json();assert.equal(manifest.display,'fullscreen');
  });
  await check('unsupported and refused display APIs explain their state without blocking practice',async()=>{
    const missing=await setup('unsupported','unsupported');assert.equal(await missing.locator('#fullscreen-button').isVisible(),false);
    await missing.locator('#settings-button').click();assert.equal(await missing.locator('#fullscreen-setting').isDisabled(),true);assert.equal(await missing.locator('#wake-setting').isDisabled(),true);assert.match(await missing.locator('#wake-status').innerText(),/unavailable/);
    await missing.locator('[data-close="settings-dialog"]').click();await missing.locator('#start-button').click();assert.equal(await missing.locator('#quiz-screen').isVisible(),true);
    const denied=await setup('denied','denied');await denied.locator('#fullscreen-button').click();await denied.waitForFunction(()=>document.getElementById('settings-dialog').open);assert.match(await denied.locator('#fullscreen-status').innerText(),/blocked/);
    await denied.locator('[data-close="settings-dialog"]').click();await denied.locator('#start-button').click();await denied.locator('#settings-button').click();
    assert.match(await denied.locator('#fullscreen-status').innerText(),/blocked/);assert.match(await denied.locator('#wake-status').innerText(),/declined/);assert.equal(await denied.locator('#wake-retry').isVisible(),true);
  });
  await check('native browser fullscreen enters and exits when available',async()=>{
    const page=await setup('ready','native');
    if(await page.locator('#fullscreen-button').isVisible()){
      await page.locator('#fullscreen-button').click();await page.waitForFunction(()=>Boolean(document.fullscreenElement||document.webkitFullscreenElement));
      assert.equal(await page.locator('#fullscreen-button').getAttribute('aria-pressed'),'true');
      await page.locator('#fullscreen-button').click();await page.waitForFunction(()=>!document.fullscreenElement&&!document.webkitFullscreenElement);
      report.nativeFullscreen='passed';
    }else report.nativeFullscreen='unavailable in this engine; fallback verified';
  });
  await check('native wake lock acquisition and release are probed independently of simulated lifecycle tests',async()=>{
    const page=await setup('native','native');await page.locator('#start-button').click();
    await page.waitForFunction(()=>!document.getElementById('wake-status').textContent.includes('Keeping the screen awake…'));
    report.nativeWakeLock=await page.locator('#wake-status').innerText();
    const locked=await page.evaluate(()=>displayTest.locks.length>0);
    if(locked){assert.equal(await page.evaluate(()=>displayTest.locks[0].released),false);await page.locator('#home-button').click();assert.equal(await page.evaluate(()=>displayTest.locks[0].released),true);report.nativeWakeLock='passed: native screen lock acquired and released';}
    else report.limits.push('Native wake lock unavailable or declined on this host: '+report.nativeWakeLock);
  });
  assert.deepEqual(report.errors,[]);report.result='passed';
}catch(error){report.result='failed';report.failure=error.stack;console.error(error);process.exitCode=1;}
finally{for(const context of contexts)await context.close();await browser.close();await writeFile(`docs/${process.env.PIANO_URL?'live-':''}display-${engine}.json`,JSON.stringify(report,null,2)+'\n');}
