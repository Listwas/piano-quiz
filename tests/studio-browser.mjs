import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, firefox, webkit } from 'playwright';
import { freshState } from '../js/storage.js';

const engine = process.env.BROWSER || 'chromium';
const origin = process.env.PIANO_URL || 'http://127.0.0.1:8421/';
const output = process.env.STUDIO_REPORT || '/tmp/piano-studio-test';
const browser = await { chromium, firefox, webkit }[engine].launch(
  engine === 'chromium' ? { executablePath: '/usr/bin/chromium', args: ['--mute-audio'] } : {},
);
const checks = [];
const errors = [];
const profiles = [
  ['small-phone',320,568,0,0,0],
  ['iphone',430,932,59,34,0],
  ['iphone-landscape',932,430,0,21,59],
  ['tablet',800,1280,0,0,0],
  ['tablet-landscape',1280,800,0,0,0],
  ['compact-tablet',1024,600,0,0,0],
  ['desktop',1440,900,0,0,0],
];
await mkdir(output,{recursive:true});
const tap = (page, selector) => page.locator(selector).click();
const read = (page, key) => page.evaluate(key=>JSON.parse(localStorage.getItem('pianoQuiz.'+key)),key);
async function open(viewport, dark=false, midi=false, seed=false) {
  const context = await browser.newContext({ viewport, hasTouch:true, colorScheme:dark?'dark':'light' });
  const page=await context.newPage();
  page.on('pageerror',error=>errors.push(error.message));
  if(seed){
    const state=freshState();
    state.settings.theme='nocturne';
    state.settings.octaves.treble=[4,5];
    const training={activity:'quiz',settings:{offset:42,pace:'flow'}};
    await page.addInitScript(({state,training})=>{
      if(localStorage.getItem('pianoQuiz.state.v1'))return;
      localStorage.setItem('pianoQuiz.state.v1',JSON.stringify(state));
      localStorage.setItem('pianoQuiz.training.v1',JSON.stringify(training));
    },{state,training});
  }
  if(midi) await page.addInitScript(()=>{
    Object.defineProperty(navigator,'requestMIDIAccess',{value:async()=>access});
    const port={id:'piano',name:'Studio test keys',state:'connected',connection:'closed',async open(){this.connection='open';},async close(){this.connection='closed';}};
    const access={inputs:new Map([[port.id,port]])};
    window.playKey=(status,key,time)=>port.onmidimessage?.({data:new Uint8Array([status,key,90]),timeStamp:time});
    window.testPort=port;
    window.testAccess=access;
    window.AudioContext=undefined;
    window.webkitAudioContext=undefined;
  });
  await page.goto(origin);
  await page.locator('#recommendation-start').waitFor();
  return {page,context};
}
async function within(page, selector, edge) {
  const result=await page.locator(selector).evaluate((el,edge)=>{
    const {top,bottom,left,right,width,height}=el.getBoundingClientRect();
    const point=document.elementFromPoint(left+width/2,top+height/2);
    return {top,bottom,left,right,height,visible:el.contains(point),within:bottom<=innerHeight-edge+1&&top>=0,scroll:scrollY};
  },edge);
  assert.ok(result.visible&&result.within&&!result.scroll,selector+' '+JSON.stringify(result));
}
try {
  for (const [device,width,height,top,bottom,side] of profiles) {
    const {page,context}=await open({width,height},width>=1000);
    await page.evaluate(([top,bottom,side])=>{
      for (const [edge,n] of Object.entries({top,bottom,left:side,right:side})) document.documentElement.style.setProperty('--safe-'+edge,n+'px');
    },[top,bottom,side]);
    await within(page,'#recommendation-start',bottom);
    if(engine==='chromium'&&['iphone','tablet-landscape'].includes(device))await page.screenshot({path:output+'/'+device+'-today.png'});
    await tap(page,'[data-tab=home]');
    for(const card of ['[data-quiz-mode=notes]','[data-quiz-mode=chords]','[data-activity=rhythm]','[data-activity=sight]','[data-activity=metronome]']){
      await tap(page,'.activity-card'+card);
      await within(page,'#start-button',bottom);
    }
    await tap(page,'.activity-card[data-quiz-mode=notes]');
    if(engine==='chromium'&&device==='tablet-landscape')await page.screenshot({path:output+'/'+device+'-practice.png'});
    await tap(page,'#start-button');
    const item=(await read(page,'state.v1')).active.current;
    const box=await page.locator('#check-button').boundingBox();
    await tap(page,`#letters [data-letter="${(item.tones[0].letter+1)%7}"]`);
    await tap(page,'#check-button');
    assert.match(await page.locator('#staff-caption').innerText(),/Try again/);
    assert.ok((await read(page,'state.v1')).active.retrying);
    assert.equal((await page.locator('#check-button').boundingBox()).y,box.y);
    await within(page,'#pause-button',bottom);
    await tap(page,'#pause-button');
    await within(page,'#resume-button',bottom);
    await tap(page,'#resume-button');
    if(engine==='chromium'&&device==='iphone')await page.screenshot({path:output+'/'+device+'-quiz.png'});
    await context.close();
    checks.push(device+' setup, safe areas, fixed feedback and pause controls');
  }

  const {page,context}=await open({width:430,height:932},false,false,true);
  assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
  assert.equal((await read(page,'backup.preStudio.v1')).data['pianoQuiz.training.v1'],JSON.stringify({activity:'quiz',settings:{offset:42,pace:'flow'}}));
  await tap(page,'#recommendation-start');
  let item=(await read(page,'state.v1')).active.current;
  await tap(page,'#quiz-hint');
  await tap(page,`#letters [data-letter="${item.tones[0].letter}"]`);
  await tap(page,'#check-button');
  assert.equal((await read(page,'state.v1')).active.answers[0].assisted,true);
  assert.equal((await read(page,'studio.v2')).items['touch:'+item.id].correct,0);
  await tap(page,'#next-button');
  await tap(page,'#quiz-reveal');
  await page.waitForTimeout(2100);
  assert.match(await page.locator('#staff-caption').innerText(),/^Answer:/);
  await tap(page,'#next-button');
  for(let i=2;i<10;i++){
    item=(await read(page,'state.v1')).active.current;
    await tap(page,`#letters [data-letter="${item.tones[0].letter}"]`);
    await tap(page,'#check-button');
    await tap(page,'#next-button');
  }
  assert.match(await page.locator('#result-message').innerText(),/8 of 10/);
  await tap(page,'#result-home-button');
  await tap(page,'[data-tab=progress]');
  assert.equal(await page.locator('[data-quiz-report="0"] .session-result').innerText(),'8/10');
  await tap(page,'#settings-button');
  for(const theme of ['light','dark'])for(const accent of ['brass','blue','violet','coral']){
    await tap(page,`[data-appearance="${theme}"]`);
    await tap(page,`button[data-accent="${accent}"]`);
    const contrast=await page.evaluate(()=>{
      const v=c=>c.match(/\d+/g).slice(0,3).map(n=>+n/255).reduce((r,n,i)=>r+(n<=.04045?n/12.92:((n+.055)/1.055)**2.4)*[.2126,.7152,.0722][i],0);
      const ratio=(a,b)=>(Math.max(v(a),v(b))+.05)/(Math.min(v(a),v(b))+.05);
      const button=getComputedStyle(document.querySelector('#recommendation-start')),body=getComputedStyle(document.body);
      return Math.min(ratio(button.color,button.backgroundColor),ratio(body.color,body.backgroundColor));
    });
    assert.ok(contrast>=4.5,`${theme} ${accent}: ${contrast}`);
  }
  const download=page.waitForEvent('download');
  await tap(page,'#data-export');
  assert.match((await download).suggestedFilename(),/^piano-quiz-progress-.*\.json$/);
  await page.reload();
  assert.equal(await page.locator('html').getAttribute('data-accent'),'coral');
  checks.push('legacy palette and progress, independent recall, stable reveal, export, all eight palette contrasts');
  await context.close();

  const deletion = await open({ width: 320, height: 568 }, false, false, true);
  const firstTab = deletion.page;
  await tap(firstTab, '#recommendation-start');
  await tap(firstTab, '#quiz-hint');
  const roundId = (await read(firstTab, 'state.v1')).active.id;
  const secondTab = await deletion.context.newPage();
  secondTab.on('pageerror', error => errors.push(error.message));
  await secondTab.goto(origin);
  await tap(secondTab, '#recommendation-start');
  await firstTab.bringToFront();
  await tap(firstTab, '#settings-button');
  await tap(firstTab, '#data-delete');
  assert.match(await firstTab.locator('#delete-data-warning').innerText(), /cannot be undone/);
  assert.equal(await firstTab.locator('#delete-data-dialog :focus').innerText(), 'Cancel');
  assert.equal((await read(firstTab, 'state.v1')).active.id, roundId);
  await tap(firstTab, '#delete-data-dialog [data-close]');
  assert.ok(await firstTab.locator('#settings-dialog').isVisible());
  assert.equal((await read(firstTab, 'training.v1')).settings.offset, 42);
  await firstTab.evaluate(() => {
    localStorage.setItem('unrelated-key', 'keep');
    localStorage.setItem('pianoQuiz.studio.v2', JSON.stringify({
      version: 2, appearance: 'dark', accent: 'coral', items: {},
      sessions: [{ id: 'saved', version: 2, at: Date.now(), input: 'touch', correct: 10, total: 10, items: [], setup: 'notes' }],
    }));
  });
  await tap(firstTab, '#data-delete');
  await tap(firstTab, '#delete-data-confirm');
  await firstTab.locator('#data-deleted-status').waitFor();
  await secondTab.locator('#data-deleted-status').waitFor();
  await secondTab.reload();
  assert.equal((await read(firstTab, 'state.v1')).active, null);
  assert.deepEqual((await read(secondTab, 'studio.v2')).sessions, []);
  assert.equal(await read(secondTab, 'backup.preStudio.v1'), null);
  assert.equal(await secondTab.evaluate(() => localStorage.getItem('unrelated-key')), 'keep');
  await tap(secondTab, '#settings-button');
  assert.match(await secondTab.locator('#midi-timing-summary').innerText(), /0 ms/);
  assert.ok(await secondTab.locator('#data-restore-backup').isDisabled());
  await deletion.context.close();
  checks.push('Delete all data confirms, supports cancellation, clears the backup and resets other tabs');

  const flow=await open({width:430,height:932},false,true);
  await tap(flow.page,'[data-tab=home]');
  await tap(flow.page,'.activity-card[data-activity=sight]');
  await flow.page.locator('#setup-behavior').selectOption('continue');
  await flow.page.locator('#setup-bpm').fill('200');
  await flow.page.locator('#setup-bpm').blur();
  await tap(flow.page,'#start-button');
  await flow.page.waitForFunction(()=>testPort.connection==='open');
  await tap(flow.page,'#training-toggle');
  await tap(flow.page,'#training-visual');
  await flow.page.waitForFunction(()=>Number(document.getElementById('exercise-score').dataset.startTime)>performance.now());
  assert.equal(await flow.page.locator('.measure.upcoming').count(),1);
  const first=await flow.page.locator('.measure:not(.upcoming) [data-rest=false]').first().getAttribute('data-midi');
  await flow.page.evaluate(first=>{
    const start=Number(document.getElementById('exercise-score').dataset.startTime);
    const wait=Math.max(0,start-performance.now());
    setTimeout(()=>{playKey(0x90,Number(first)+1,start);setTimeout(()=>playKey(0x80,Number(first)+1,start+200),200);},wait);
  },first);
  await flow.page.waitForFunction(()=>document.querySelector('.score-event.wrong'));
  assert.match(await flow.page.locator('#training-live-status').innerText(),/Wrong note/);
  await flow.page.waitForFunction(()=>document.querySelector('.measure')?.dataset.bar==='1');
  await flow.page.locator('#training-summary').waitFor({timeout:15000});
  assert.match(await flow.page.locator('#training-summary').innerText(),/Correct pitches/);
  assert.match(await flow.page.locator('#training-details').innerText(),/Practise hardest bar/);
  const saved=(await read(flow.page,'training.v1')).lastResult;
  assert.equal(saved.comparison.behavior,'continue');assert.equal(saved.retries,0);
  assert.equal(saved.report.bars[0].issues.pitch,1);
  if(engine==='chromium')await flow.page.screenshot({path:output+'/flow-report.png'});
  checks.push('Flow previews the next bar, keeps time through a wrong MIDI note, and records the error in the report');
  await flow.context.close();
  assert.deepEqual(errors,[]);
  console.log(`${engine}: ${checks.length} Studio scenarios passed`);
} finally {
  await browser.close();
  await writeFile(output+'/'+engine+'.json',JSON.stringify({engine,origin,checks,errors},null,2)+'\n');
}
