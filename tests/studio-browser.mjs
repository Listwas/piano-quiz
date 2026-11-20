import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium, firefox, webkit } from 'playwright';
import { freshState } from '../js/storage.js';

const engine = process.env.BROWSER || 'chromium';
const origin = process.env.PIANO_URL || 'http://127.0.0.1:8421/';
const output = process.env.STUDIO_REPORT || '/tmp/piano-studio-test';
const browser = await { chromium, firefox, webkit }[engine].launch(
  engine === 'chromium' ? { executablePath: '/usr/bin/chromium', args: ['--mute-audio'] }
    : engine === 'firefox' ? { firefoxUserPrefs: { 'full-screen-api.enabled': false } } : {},
);
const checks = [];
const errors = [];
const profiles = [
  ['small-phone',320,568,0,0,0],
  ['small-phone-landscape',568,320,0,0,0],
  ['iphone',430,932,59,34,0],
  ['iphone-zero-inset',430,873,0,34,0],
  ['iphone-landscape',932,430,0,21,59],
  ['honor-magicpad-2',800,1280,0,0,0],
  ['tablet-landscape',1280,800,0,0,0],
  ['compact-tablet',1024,600,0,0,0],
  ['desktop-portrait',900,1440,0,0,0],
  ['desktop',1440,900,0,0,0],
];
await mkdir(output,{recursive:true});
const tap = (page, selector) => page.locator(selector).click();
const read = (page, key) => page.evaluate(key=>JSON.parse(localStorage.getItem('pianoQuiz.'+key)),key);
async function open(viewport, dark=false, midi=false, seed=false, iosHomeScreen=false) {
  const context = await browser.newContext({ viewport, hasTouch:true, colorScheme:dark?'dark':'light' });
  const page=await context.newPage();
  page.on('pageerror',error=>errors.push(error.message));
  if(iosHomeScreen) await page.addInitScript(()=>{
    Object.defineProperty(navigator,'standalone',{value:true,configurable:true});
  });
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
async function touchTarget(page, selector, { minWidth=44, minHeight=44, top=0, bottom=0, side=0 } = {}) {
  const target=await page.locator(selector).evaluate((el,{minWidth,minHeight,top,bottom,side})=>{
    const rect=el.getBoundingClientRect();
    const x=rect.x+rect.width/2, y=rect.y+rect.height/2;
    return { x,y,width:rect.width,height:rect.height,
      usable:rect.width>=minWidth && rect.height>=minHeight && rect.top>=top && rect.bottom<=innerHeight-bottom+1 &&
        rect.left>=side && rect.right<=innerWidth-side+1 && el.contains(document.elementFromPoint(x,y)) };
  },{minWidth,minHeight,top,bottom,side});
  assert.ok(target.usable,selector+' '+JSON.stringify(target));
  return target;
}
try {
  for (const [device,width,height,top,bottom,side] of profiles) {
    const iphone=device.startsWith('iphone');
    const dark=process.env.STUDIO_THEME ? process.env.STUDIO_THEME==='dark' : width>=1000||iphone;
    const {page,context}=await open({width,height},dark,false,false,iphone);
    const safeArea={top,bottom,side};
    await page.evaluate(([top,bottom,side])=>{
      for (const [edge,n] of Object.entries({top,bottom,left:side,right:side})) document.documentElement.style.setProperty('--safe-'+edge,n+'px');
    },[top,bottom,side]);
    await within(page,'#recommendation-start',bottom);
    if(engine==='chromium'&&['iphone','tablet-landscape'].includes(device))await page.screenshot({path:output+'/'+device+'-today.png'});
    await tap(page,'[data-tab=home]');
    const layout=await page.locator('.practice-layout').evaluate(layout=>{
      const rect=element=>element.getBoundingClientRect();
      const picker=layout.querySelector('#activity-cards');
      const panel=rect(layout.querySelector('.practice-card'));
      const header=rect(document.querySelector('.topbar'));
      const cards=Array.from(picker.children,rect);
      return {header:header.top,panelLeft:panel.left,panelTop:panel.top,panelBottom:panel.bottom,
        pickerLeft:rect(picker).left,pickerRight:rect(picker).right,pickerBottom:rect(picker).bottom,
        cards:cards.map(({top,right,height})=>({top,right,height})),
        lessonBottom:rect(document.querySelector('#lesson-button')).bottom,scrollY};
    });
    if(iphone) assert.ok(layout.header>=(width<height?Math.max(20,top+8):8),JSON.stringify({device,layout}));
    if(width<height) {
      assert.equal(layout.cards[0].top,layout.cards[2].top,device);
      assert.equal(layout.cards[3].top,layout.cards[4].top,device);
      assert.ok(Math.abs(layout.cards[2].right-layout.pickerRight)<=1 && Math.abs(layout.cards[4].right-layout.pickerRight)<=1,device);
      assert.ok(layout.panelTop>=layout.pickerBottom,device);
      if(layout.lessonBottom>0) assert.ok(layout.panelBottom-layout.lessonBottom<=25,device);
    } else {
      assert.ok(layout.panelLeft>layout.pickerRight,device);
      assert.ok(Math.abs(layout.cards[4].right-layout.pickerRight)<=1,device);
    }
    assert.ok(layout.cards.every(card=>card.height>=44) && !layout.scrollY,JSON.stringify({device,layout}));
    for(const card of ['[data-quiz-mode=notes]','[data-quiz-mode=chords]','[data-activity=rhythm]','[data-activity=sight]','[data-activity=metronome]']){
      await tap(page,'.activity-card'+card);
      await within(page,'#start-button',bottom);
    }
    await tap(page,'.activity-card[data-quiz-mode=notes]');
    const guide=await touchTarget(page,'#lesson-button',safeArea);
    await page.touchscreen.tap(guide.x,guide.y);
    assert.ok(await page.locator('#lesson-dialog').isVisible());
    await tap(page,'[data-close="lesson-dialog"]');
    if(['iphone','iphone-zero-inset','iphone-landscape','tablet-landscape'].includes(device))await page.screenshot({path:output+'/'+device+'-practice.png'});
    await tap(page,'#start-button');
    const item=(await read(page,'state.v1')).active.current;
    const box=await page.locator('#check-button').boundingBox();
    for(const selector of ['#quiz-hint','#quiz-reveal']) await touchTarget(page,selector,safeArea);
    for(let letter=0;letter<7;letter++){
      const selector=`#letters [data-letter="${letter}"]`;
      const target=await touchTarget(page,selector,{...safeArea,minWidth:width===320?38:44,minHeight:width<height?48:44});
      await page.touchscreen.tap(target.x,target.y);
      assert.equal(await page.locator(selector).getAttribute('aria-pressed'),'true');
    }
    await tap(page,'#unknown-button');
    await tap(page,`#letters [data-letter="${(item.tones[0].letter+1)%7}"]`);
    await tap(page,'#check-button');
    assert.match(await page.locator('#staff-caption').innerText(),/Try again/);
    assert.ok((await read(page,'state.v1')).active.retrying);
    assert.equal((await page.locator('#check-button').boundingBox()).y,box.y);
    await within(page,'#pause-button',bottom);
    await tap(page,'#pause-button');
    await within(page,'#resume-button',bottom);
    await tap(page,'#resume-button');
    if(['iphone','iphone-landscape','honor-magicpad-2','tablet-landscape'].includes(device))await page.screenshot({path:output+'/'+device+'-quiz.png'});
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

  const quick = await open({ width: 320, height: 568 });
  await tap(quick.page, '[data-tab=progress]');
  assert.equal(await quick.page.locator('#progress-full-history').count(), 0);
  assert.ok(await quick.page.locator('.empty-state').isVisible());
  await tap(quick.page, '[data-tab=home]');
  await quick.page.locator('#setup-clef').selectOption('bass');
  await quick.page.locator('#setup-questions').selectOption('20');
  await tap(quick.page, '#start-button');
  const savedRound = (await read(quick.page, 'state.v1')).active;
  assert.equal(savedRound.settings.clef, 'bass');
  assert.equal(savedRound.settings.length, 20);
  await tap(quick.page, '#pause-button');
  await tap(quick.page, '#pause-home-button');
  await quick.page.locator('#setup-clef').selectOption('treble');
  assert.match(await quick.page.locator('#resume-note').innerText(), /replaces the unfinished quiz/);
  await within(quick.page,'#start-button',0);
  await tap(quick.page, '[data-tab=today]');
  await tap(quick.page, '#recommendation-start');
  assert.equal((await read(quick.page, 'state.v1')).active.id, savedRound.id);
  await tap(quick.page, '#pause-button');
  await tap(quick.page, '#pause-home-button');
  await tap(quick.page, '[data-tab=home]');
  await tap(quick.page, '.activity-card[data-quiz-mode=chords]');
  await tap(quick.page, '#setup-chord-types');
  assert.equal(await quick.page.locator('#range-settings').isVisible(), false);
  await tap(quick.page, '#quality-options [data-quality=aug]');
  await tap(quick.page, '#apply-button');
  assert.match(await quick.page.locator('#setup-chord-summary').innerText(), /3 selected/);
  await tap(quick.page, '.activity-card[data-activity=rhythm]');
  await quick.page.locator('#setup-bars').selectOption('8');
  await tap(quick.page,'#setup-complexity-choices');
  await tap(quick.page,'#choice-options [data-value="eighths"]');
  await tap(quick.page,'#choice-options [data-value="sixteenths"]');
  assert.equal(await quick.page.locator('#choice-dialog').isVisible(),true);
  await tap(quick.page,'#choice-done');
  const selectedPatterns = () => quick.page.locator('#setup-complexity').evaluate(field=>Array.from(field.selectedOptions,option=>option.value));
  assert.equal(await quick.page.locator('#customize-button').isVisible(), false);
  await quick.page.locator('#setup-accuracy').selectOption('strict');
  await quick.page.locator('#setup-pace').selectOption('flow');
  await tap(quick.page, '.activity-card[data-activity=sight]');
  assert.deepEqual(await selectedPatterns(),['half','quarter']);
  assert.match(await quick.page.locator('#home-sight-tools').innerText(), /MIDI keyboard only/);
  await quick.page.locator('#setup-complexity').selectOption(['dotted-quarter','eighths'],{force:true});
  await tap(quick.page, '.activity-card[data-activity=rhythm]');
  await quick.page.reload();
  await tap(quick.page, '[data-tab=home]');
  assert.equal(await quick.page.locator('#setup-bars').inputValue(), '8');
  assert.deepEqual(await selectedPatterns(),['half','quarter','eighths','sixteenths']);
  assert.equal(await quick.page.locator('#setup-accuracy').inputValue(), 'strict');
  assert.equal(await quick.page.locator('#setup-pace').inputValue(), 'flow');
  await tap(quick.page, '.activity-card[data-activity=sight]');
  assert.deepEqual(await selectedPatterns(),['dotted-quarter','eighths']);
  await tap(quick.page, '#settings-button');
  const exported = quick.page.waitForEvent('download');
  await tap(quick.page, '#data-export');
  const exportPath = await (await exported).path();
  await tap(quick.page, '#settings-dialog [data-close]');
  await quick.page.locator('#setup-complexity').selectOption(['whole'],{force:true});
  await tap(quick.page, '#settings-button');
  await quick.page.locator('#data-import').setInputFiles({
    name: 'progress.json', mimeType: 'application/json', buffer: await readFile(exportPath),
  });
  await quick.page.locator('#recommendation-start').waitFor();
  assert.deepEqual((await read(quick.page, 'training.v1')).settings.patterns, {rhythm:['half','quarter','eighths','sixteenths'],sight:['dotted-quarter','eighths']});
  await quick.context.close();
  checks.push('Inline choices persist, including distinct Rhythm and Sight-reading patterns, and Today resumes an unfinished quiz');

  const picker = await open({width:430,height:932},true);
  await tap(picker.page, '[data-tab=home]');
  await tap(picker.page, '.activity-card[data-activity=metronome]');
  await tap(picker.page, '#setup-meter + .choice-trigger');
  await picker.page.locator('#choice-dialog button[aria-pressed=true]').press('ArrowDown');
  await picker.page.locator('#choice-dialog button:focus').press('Enter');
  assert.equal(await picker.page.locator('#setup-meter').inputValue(), '3');
  await picker.page.locator('#setup-meter + .choice-trigger:focus').waitFor();
  await tap(picker.page, '#start-button');
  await tap(picker.page, '#training-configure');
  await tap(picker.page, '#training-meter + .choice-trigger');
  await picker.page.setViewportSize({width:932,height:430});
  await within(picker.page, '#choice-dialog button[aria-pressed=true]', 0);
  if (engine === 'chromium') await picker.page.screenshot({path:output+'/rotated-picker.png'});
  const selectedChoice = picker.page.locator('#choice-dialog button[aria-pressed=true]');
  await selectedChoice.press('Escape');
  // WebKit gives the browser's fullscreen exit priority over the open dialog.
  if (engine === 'webkit' && await selectedChoice.isVisible()) {
    await picker.page.waitForFunction(() => !document.fullscreenElement && !document.webkitFullscreenElement);
    await selectedChoice.press('Escape');
  }
  assert.equal(await picker.page.locator('#training-dialog').isVisible(), true);
  const focusedField = picker.page.locator('#training-meter + .choice-trigger:focus');
  await focusedField.waitFor();
  assert.ok(await focusedField.evaluate(field => parseInt(getComputedStyle(field).outlineOffset) < 0));
  await tap(picker.page, '#training-meter + .choice-trigger');
  await tap(picker.page, '#choice-options button:text-is("4/4")');
  await tap(picker.page, '#training-form button[type=submit]');
  assert.equal((await read(picker.page, 'training.v1')).settings.meter, 4);
  await picker.context.close();
  checks.push('The themed picker supports keyboard and pointer selection, rotation, Escape and focus restoration inside Set up');

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
