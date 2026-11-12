import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { chromium, firefox, webkit } from 'playwright';
const engine=process.env.BROWSER||'chromium', base=process.env.PIANO_URL||'http://127.0.0.1:8421/';
const report={engine,origin:base,build:JSON.parse(await readFile('dist/version.json')).version,testedAt:new Date().toISOString(),checks:[],errors:[],limits:['Device sizes and safe areas are simulated. No physical MIDI keyboard or mobile device is attached.']};
const browser=await {chromium,firefox,webkit}[engine].launch({headless:true,...(engine==='chromium'?{executablePath:'/usr/bin/chromium',args:['--mute-audio']}: {})});
const contexts=[];
async function setup(deterministic = false, midi = false, mockAudio = false){
 const ctx=await browser.newContext({viewport:{width:430,height:932},hasTouch:true,reducedMotion:'reduce',...(engine!=='firefox'?{isMobile:true}: {})});contexts.push(ctx);
 await ctx.addInitScript(()=>{
  window.scheduledClicks=[];
  const start=OscillatorNode.prototype.start;
  OscillatorNode.prototype.start=function(when){window.scheduledClicks.push({when,now:this.context.currentTime,frequency:this.frequency.value});return start.call(this,when);};
 });
 if(deterministic)await ctx.addInitScript(()=>{Math.random=()=>0;});
 if(deterministic && (engine==='webkit'||process.env.TRAINING_VISUAL==='1')){
  // The headless host can report running audio while its clock stalls.
  // Graded fixtures use the app's visual clock; the metronome probe above remains native.
  await ctx.addInitScript(()=>{window.AudioContext=undefined;window.webkitAudioContext=undefined;});
  const limit=`Deterministic ${engine} exercises use the explicit visual clock on this host; native device audio timing is not asserted.`;
  if(!report.limits.includes(limit))report.limits.push(limit);
 }
 if(midi)await ctx.addInitScript(()=>{
  const port={id:'piano',name:'Test piano',manufacturer:'Test',state:'connected',connection:'closed',async open(){this.connection='open';},async close(){this.connection='closed';}};
  const access={inputs:new Map([['piano',port]]),onstatechange:null};
  Object.defineProperty(navigator,'requestMIDIAccess',{configurable:true,value:async()=>access});
  window.midiLog=[];window.trainingMidi={send(data,timeStamp=performance.now()){window.midiLog.push({data:[...data],at:timeStamp});port.onmidimessage?.({data:new Uint8Array(data),timeStamp});},drop(){port.state='disconnected';access.onstatechange?.({port});},plug(){port.state='connected';port.connection='closed';access.onstatechange?.({port});}};
 });
 if(mockAudio)await ctx.addInitScript(()=>{
  window.calibrationClicks=[];
  window.AudioContext=class {
   state='suspended';origin=performance.now();destination={};
   get currentTime(){return (performance.now()-this.origin)/1000;}
   async resume(){this.state='running';} async suspend(){this.state='suspended';}
   createGain(){return {gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}};}
   createOscillator(){return {frequency:{},connect(){},disconnect(){},start:time=>window.calibrationClicks.push(this.origin+time*1000),stop(){}};}
  };
 });
 const page=await ctx.newPage();page.on('pageerror',e=>report.errors.push(e.message));await page.goto(base);return page;
}
async function check(label,run){
 if(process.env.TRAINING_CHECK&&!process.env.TRAINING_CHECK.split('|').some(filter=>label.includes(filter)))return;
 try{await run();report.checks.push(label);console.log('PASS '+label);}
 finally{while(contexts.length)await contexts.pop().close();}
}
async function running(page){
 await page.waitForFunction(()=>document.getElementById('training-screen').dataset.running==='true'||!document.getElementById('training-visual').hidden);
 if(await page.locator('#training-visual').isVisible()){report.limits.push('Audio could not start in this host; visual fallback verified.');await page.locator('#training-visual').click();}
 await page.waitForFunction(()=>document.getElementById('training-screen').dataset.running==='true');
}
async function setupSight(page){
 await page.locator('#customize-button').click();await page.locator('[data-preset="none"]').click();await page.locator('[data-note="C"]').click();await page.locator('[data-range-clef="treble"][data-octave="4"]').click();await page.locator('[data-range-clef="treble"][data-octave="5"]').click();await page.locator('#apply-button').click();
 await page.selectOption('#activity-select','sight');await page.locator('#customize-button').click();await page.locator('#training-bpm').fill('200');await page.selectOption('#training-bars','2');await page.selectOption('#training-pace','flow');await page.locator('#training-form button[type=submit]').click();await page.locator('#start-button').click();await page.waitForFunction(()=>document.getElementById('midi-status').textContent.startsWith('Connected'));await page.locator('#training-toggle').click();await running(page);
 await page.waitForFunction(()=>Number(document.getElementById('exercise-score').dataset.startTime)-performance.now()<100);
 assert.equal(await page.locator('.measure').count(),1);
 assert.ok((await page.locator('[data-event]').evaluateAll(elements=>elements.every(n=>n.dataset.rest==='true'||n.dataset.midi==='72'))));
}
const profiles=[{width:430,height:932,top:59,bottom:34},{width:932,height:430,left:59,right:59,bottom:21},{width:320,height:568},{width:800,height:1280},{width:1280,height:800},{width:1024,height:600}];
try{
 await mkdir('docs/images',{recursive:true});
 await check('metronome starts scheduled accented clicks, pauses, resumes, mutes and saves setup',async()=>{
  const page=await setup();await page.selectOption('#activity-select','metronome');await page.locator('#customize-button').click();await page.locator('#training-bpm').fill('200');await page.selectOption('#training-meter','3');await page.locator('#training-form button[type=submit]').click();await page.locator('#start-button').click();await running(page);
  await page.waitForFunction(()=>document.getElementById('metronome-number').textContent==='2');
  const clicks=await page.evaluate(()=>window.scheduledClicks);
  if(clicks.length){assert.equal(clicks[0].frequency,1320);assert.ok(clicks.every(c=>c.when>=c.now-.025));assert.ok(clicks.some(c=>c.frequency===880));}
  await page.locator('#training-toggle').click();const number=await page.locator('#metronome-number').innerText();await page.waitForTimeout(400);assert.equal(await page.locator('#metronome-number').innerText(),number);
  await page.locator('#training-sound').click();assert.equal(await page.locator('#training-sound').getAttribute('aria-pressed'),'true');await page.locator('#training-toggle').click();await running(page);
  await page.screenshot({path:`docs/images/metronome-${engine}.png`});await page.locator('#training-back').click();await page.reload();assert.equal(await page.locator('#activity-select').inputValue(),'metronome');assert.match(await page.locator('#practice-detail').innerText(),/200 BPM/);
 });
 await check('activity switching preserves an unfinished quiz and MIDI is not requested by the metronome',async()=>{
  const page=await setup();assert.equal(await page.locator('#activity-select').evaluate(e=>getComputedStyle(e).borderRadius),'12px');await page.locator('#start-button').click();await page.locator('#unknown-button').click();await page.locator('#pause-button').click();await page.locator('#pause-home-button').click();
  const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('pianoQuiz.state.v1')).active);
  await page.selectOption('#activity-select','metronome');await page.locator('#start-button').click();await running(page);await page.locator('#training-back').click();
  const after=await page.evaluate(()=>JSON.parse(localStorage.getItem('pianoQuiz.state.v1')).active);assert.equal(after.id,before.id);assert.equal(after.answers.length,before.answers.length);
  await page.selectOption('#activity-select','quiz');await page.locator('#start-button').click();assert.equal(await page.locator('#quiz-screen').isVisible(),true);
 });
 await check('metronome controls remain visible and touchable through phone/tablet rotation',async()=>{
  const page=await setup();await page.selectOption('#activity-select','metronome');await page.locator('#start-button').click();await running(page);
  for(const size of profiles){await page.setViewportSize({width:size.width,height:size.height});await page.evaluate(s=>{for(const edge of ['top','bottom','left','right'])document.documentElement.style.setProperty('--safe-'+edge,(s[edge]||0)+'px');},size);await page.waitForFunction(h=>Math.abs(document.body.getBoundingClientRect().height-h)<1,size.height);
   const layout=await page.locator('#training-screen').evaluate(e=>({height:e.clientHeight,scroll:e.scrollHeight}));assert.ok(layout.scroll<=layout.height+1,JSON.stringify({size,layout}));
   for(const selector of ['#training-toggle','#training-sound','#training-back','#training-configure']){const b=await page.locator(selector).boundingBox();assert.ok(b.y>=(size.top||0)&&b.y+b.height<=size.height-(size.bottom||0)+1,JSON.stringify({size,selector,b}));}
   await page.locator('#training-toggle').tap();await page.locator('#training-toggle').tap();await running(page);
  }
 });
 await check('rhythm touch holds distinguish a one-beat release from a required two-beat half note',async()=>{
  const page=await setup(true);await page.selectOption('#activity-select','rhythm');await page.locator('#customize-button').click();await page.locator('#training-bpm').fill('200');await page.selectOption('#training-bars','2');await page.selectOption('#training-pace','flow');await page.locator('#training-form button[type=submit]').click();await page.locator('#start-button').click();await running(page);
  await page.waitForFunction(()=>Number(document.getElementById('exercise-score').dataset.startTime)-performance.now()<150);
  const data=await page.locator('#exercise-score').evaluate(e=>({start:Number(e.dataset.startTime),events:[...e.querySelectorAll('[data-event]')].filter(n=>n.dataset.rest==='false').map(n=>({beat:Number(n.dataset.beat),duration:Number(n.dataset.duration)}))}));
  const pad=await page.locator('#training-touchpad').boundingBox();await page.mouse.move(pad.x+pad.width/2,pad.y+pad.height/2);
  assert.equal(data.events.length,2,'Only the current bar is rendered during count-in');
  // The second bar varies: a half note followed by two quarters.
  data.events.push({beat:4,duration:2},{beat:6,duration:1},{beat:7,duration:1});
  async function until(time){const delay=await page.evaluate(time=>time-performance.now(),time);if(delay>0)await page.waitForTimeout(Math.ceil(delay));await page.waitForFunction(t=>performance.now()>=t,time,{polling:1});}
  for(let i=0;i<data.events.length;i++){const event=data.events[i];await until(data.start+event.beat*300);await page.mouse.down();await until(data.start+(event.beat+(i===0?1:event.duration))*300);await page.mouse.up();}
  await page.waitForFunction(()=>document.getElementById('training-screen').dataset.complete==='true');
  const result=await page.evaluate(()=>JSON.parse(localStorage.getItem('pianoQuiz.training.v1')).lastResult);assert.equal(result.onset,100);assert.equal(result.holds,80);assert.equal(result.total,5);assert.equal(result.extras,0);await page.screenshot({path:`docs/images/rhythm-results-${engine}.png`});
 });
 await check('rhythm score and touch pad fit rotating phone and tablet layouts',async()=>{
  const page=await setup(true);await page.selectOption('#activity-select','rhythm');await page.locator('#start-button').click();await running(page);await page.locator('#training-toggle').click();
  for(const size of profiles){await page.setViewportSize({width:size.width,height:size.height});await page.evaluate(s=>{for(const edge of ['top','bottom','left','right'])document.documentElement.style.setProperty('--safe-'+edge,(s[edge]||0)+'px');},size);await page.waitForFunction(h=>Math.abs(document.body.getBoundingClientRect().height-h)<1,size.height);
   const rects=await page.locator('#training-screen').evaluate(e=>({height:e.clientHeight,scroll:e.scrollHeight}));assert.ok(rects.scroll<=rects.height+1,JSON.stringify({size,rects}));
   for(const selector of ['#training-toggle','#training-touchpad','#training-back']){const b=await page.locator(selector).boundingBox();assert.ok(b.y>=(size.top||0)&&b.y+b.height<=size.height-(size.bottom||0)+1,JSON.stringify({size,selector,b}));}
   assert.equal(await page.locator('.measure').count(),1);
   assert.ok((await page.locator('.measure').first().boundingBox()).height>=30,JSON.stringify({size,measure:await page.locator('.measure').first().boundingBox()}));
  }
  await page.screenshot({path:`docs/images/rhythm-${engine}.png`});
 });
 await check('rhythm MIDI accepts different keys and scores their physical hold lengths',async()=>{
  const page=await setup(true,true);await page.selectOption('#activity-select','rhythm');await page.locator('#customize-button').click();await page.locator('#training-bpm').fill('200');await page.selectOption('#training-bars','2');await page.selectOption('#training-pace','flow');await page.selectOption('#training-input','midi');await page.locator('#training-form button[type=submit]').click();await page.locator('#start-button').click();await page.waitForFunction(()=>document.getElementById('midi-status').textContent.startsWith('Connected'));await page.locator('#training-toggle').click();await running(page);
  await page.waitForFunction(()=>Number(document.getElementById('exercise-score').dataset.startTime)-performance.now()<150);
  const data=await page.locator('#exercise-score').evaluate(e=>({start:Number(e.dataset.startTime),events:[...e.querySelectorAll('[data-event]')].map(n=>({beat:Number(n.dataset.beat),duration:Number(n.dataset.duration)}))}));
  assert.equal(data.events.length,2,'Only the current bar is rendered during count-in');
  // The second bar varies: a half note followed by two quarters.
  data.events.push({beat:4,duration:2},{beat:6,duration:1},{beat:7,duration:1});
  async function until(time){const delay=await page.evaluate(time=>time-performance.now(),time);if(delay>0)await page.waitForTimeout(Math.ceil(delay));await page.waitForFunction(t=>performance.now()>=t,time,{polling:1});}
  for(let i=0;i<data.events.length;i++){const event=data.events[i],pitch=[35,92,11,80,60][i];await until(data.start+event.beat*300);await page.evaluate(pitch=>window.trainingMidi.send([0x90,pitch,100]),pitch);await until(data.start+(event.beat+event.duration)*300);await page.evaluate(pitch=>window.trainingMidi.send([0x80,pitch,0]),pitch);}
  await page.waitForFunction(()=>document.getElementById('training-screen').dataset.complete==='true');const result=await page.evaluate(()=>JSON.parse(localStorage.getItem('pianoQuiz.training.v1')).lastResult);assert.equal(result.onset,100);assert.equal(result.holds,100);assert.equal(result.pitch,null);
 });
 await check('sight-reading resets the entire bar on wrong pitches and short holds, then waits for the downbeat',async()=>{
  const page=await setup(true,true);await setupSight(page);
  let start=Number(await page.locator('#exercise-score').getAttribute('data-start-time'));
  const original=start;
  async function until(time){const delay=await page.evaluate(t=>t-performance.now(),time);if(delay>0)await page.waitForTimeout(Math.ceil(delay));await page.waitForFunction(t=>performance.now()>=t,time,{polling:1});}
  const press=note=>page.evaluate(note=>window.trainingMidi.send([0x90,note,100]),note);
  const release=note=>page.evaluate(note=>{window.trainingMidi.send([0x80,note,0]);return {value:document.getElementById('hold-progress').value,label:document.getElementById('hold-label').textContent};},note);
  await until(start);await press(72);await until(start+600);const full=await release(72);assert.equal(full.value,1);assert.equal(full.label,'Good release ✓');
  await until(start+650);await press(60);await release(60);
  assert.match(await page.locator('#training-live-status').innerText(),/Wrong note.*get ready to play in/);
  assert.match(await page.locator('#training-progress').innerText(),/Retry in/);
  assert.equal(await page.locator('.score-event.current').getAttribute('data-event'),'0');assert.equal(await page.locator('.score-event.correct').count(),0);
  start=Number(await page.locator('#exercise-score').getAttribute('data-start-time'));assert.ok(Math.abs((start-original)/1200-Math.round((start-original)/1200))<.001,JSON.stringify({start,original}));
  await press(72);await release(72);assert.equal(await page.locator('.score-event.holding').count(),0);
  await page.screenshot({path:`docs/images/sight-guided-${engine}.png`});
  await until(start);await press(72);await until(start+300);await release(72);
  assert.match(await page.locator('#training-live-status').innerText(),/Too short.*get ready/);assert.equal(await page.locator('.score-event.current').getAttribute('data-event'),'0');
  start=Number(await page.locator('#exercise-score').getAttribute('data-start-time'));
  for(const [beat,duration] of [[0,2],[2,2],[4,2],[6,1],[7,1]]){await until(start+beat*300);await press(72);await until(start+(beat+duration)*300);await release(72);}
  await page.waitForFunction(()=>document.getElementById('training-screen').dataset.complete==='true');
  const result=await page.evaluate(()=>JSON.parse(localStorage.getItem('pianoQuiz.training.v1')).lastResult);assert.equal(result.retries,2);assert.equal(result.pitch,100);assert.equal(result.holds,100);assert.equal(result.onset,100);
  assert.equal(result.report.bars[0].issues.pitch,1);assert.equal(result.report.bars[0].issues.short,1);assert.equal(result.report.bars[1].retries,0);assert.ok(result.report.elapsedMs>=start-original+2400);
  const summary=page.locator('#training-summary');
  const [firstTry,retries,duration]=await summary.locator('.training-metrics strong').allTextContents();
  assert.equal(firstTry,'1/2');assert.equal(retries,'2');assert.match(duration,/^\d+:\d\d$/);
  assert.equal(await summary.getByRole('button',{name:'Bar 1: 2 retries. View details.'}).isVisible(),true);
  await page.screenshot({path:`docs/images/sight-report-${engine}.png`});
  await summary.locator('[data-report-bar="0"]').click();
  assert.equal(await page.locator('#report-bar-select').inputValue(),'0');
  assert.deepEqual(await page.locator('.report-issue-list li strong').allTextContents(),['1','1']);
  assert.match(await page.locator('#training-report-details').innerText(),/Wrong notes[\s\S]*Released too soon/);
  await page.screenshot({path:`docs/images/sight-report-details-${engine}.png`});
  await page.selectOption('#report-bar-select','1');assert.match(await page.locator('#training-report-details').innerText(),/No mistakes recorded/);
  await page.locator('[data-close="training-report-dialog"]').click();
  await page.getByRole('button',{name:'Practise hardest bar',exact:true}).click();
  assert.equal(await page.locator('#report-bar-select').inputValue(),'0');
  assert.equal(await page.locator('#report-practise-tempo').inputValue(),'160');
  await page.selectOption('#report-practise-tempo','200');await page.locator('#report-practise').click();await running(page);
  assert.match(await page.locator('#training-progress').innerText(),/Bar 1 · 200 BPM/);
  assert.deepEqual(await page.locator('[data-event]').evaluateAll(nodes=>nodes.map(e=>[+e.dataset.midi,+e.dataset.duration])),[[72,2],[72,2]]);
  await page.waitForFunction(()=>Number(document.getElementById('exercise-score').dataset.startTime)-performance.now()<100);
  const practiseStart=Number(await page.locator('#exercise-score').getAttribute('data-start-time'));
  for(const beat of [0,2]){await until(practiseStart+beat*300);await press(72);await until(practiseStart+(beat+2)*300);await release(72);}
  await page.waitForFunction(()=>document.getElementById('training-screen').dataset.complete==='true');
  await page.locator('#training-back').click();assert.equal(await summary.isVisible(),true);
  assert.equal(await summary.locator('[data-report-bar="0"].practised').count(),1);
  assert.match(await summary.locator('.report-focus').innerText(),/All difficult bars practised/);
  assert.equal(await page.locator('#training-details').innerText(),'Session details');
  assert.deepEqual((await summary.locator('.training-metrics strong').allTextContents()).slice(0,2),['1/2','2']);
  await page.screenshot({path:`docs/images/practised-bars-${engine}.png`});
  for(const size of profiles){
    await page.setViewportSize({width:size.width,height:size.height});
    await page.evaluate(s=>{for(const edge of ['top','bottom','left','right'])document.documentElement.style.setProperty('--safe-'+edge,(s[edge]||0)+'px');},size);
    await page.waitForFunction(h=>Math.abs(document.body.getBoundingClientRect().height-h)<1,size.height);
    for(const selector of ['#training-details','#training-toggle','[data-report-bar="0"]']){
      const box=await page.locator(selector).boundingBox();assert.ok(box && box.y>=(size.top||0) && box.y+box.height<=size.height-(size.bottom||0)+1,JSON.stringify({size,selector,box}));
      if(selector==='#training-details'||selector==='#training-toggle')assert.ok(box.y+box.height<=size.height-(size.bottom||0)-12,JSON.stringify({size,selector,box,padding:'12px minimum'}));
      assert.ok(await page.locator(selector).evaluate(e=>{const b=e.getBoundingClientRect();return e.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2));}),selector+' remains tappable');
    }
    const body=await page.locator('#training-body').evaluate(e=>({height:e.clientHeight,scroll:e.scrollHeight}));assert.ok(body.scroll<=body.height+1,JSON.stringify({size,body}));
    if(size.width===1280)await page.screenshot({path:`docs/images/practised-bars-tablet-${engine}.png`});
  }
  await page.locator('#training-back').click();await page.reload();
  assert.match(await page.locator('#last-session-button').innerText(),/1\/2 bars first try/);
  await page.locator('#last-session-button').click();assert.equal(await page.locator('#report-bar-select').inputValue(),'-1');
  assert.match(await page.locator('#training-report-details').innerText(),/Wrong notes/);
  const saved=await page.evaluate(()=>localStorage.getItem('pianoQuiz.training.v1'));
  await page.selectOption('#report-bar-select','1');
  assert.equal(await page.locator('#report-practise-tempo').inputValue(),'160');
  await page.screenshot({path:`docs/images/bar-drill-${engine}.png`});
  await page.locator('#report-practise').click();
  await page.waitForFunction(()=>document.getElementById('midi-status').textContent.startsWith('Connected'));
  if(await page.locator('#training-toggle').innerText()==='Resume')await page.locator('#training-toggle').click();
  await running(page);
  await page.waitForFunction(()=>Number(document.getElementById('exercise-score').dataset.startTime)-performance.now()<100);
  assert.match(await page.locator('#training-progress').innerText(),/Bar 2 · 160 BPM/);
  assert.deepEqual(await page.locator('[data-event]').evaluateAll(nodes=>nodes.map(e=>[+e.dataset.midi,+e.dataset.duration])),[[72,2],[72,1],[72,1]]);
  const drillStart=Number(await page.locator('#exercise-score').getAttribute('data-start-time'));
  for(const [beat,duration] of [[0,2],[2,1],[3,1]]){
   await until(drillStart+beat*375);await press(72);await until(drillStart+(beat+duration)*375);await release(72);
  }
  await page.waitForFunction(()=>document.getElementById('training-screen').dataset.complete==='true');
  assert.equal(await page.locator('#training-toggle').innerText(),'Play again');
  const updated=await page.evaluate(()=>JSON.parse(localStorage.getItem('pianoQuiz.training.v1'))),before=JSON.parse(saved);
  assert.equal(updated.lastResult.practisedBars[0].bpm,200);assert.equal(updated.lastResult.practisedBars[1].bpm,160);
  for(const state of [updated,before]){delete state.lastResult.practisedBars;for(const result of state.history)delete result.practisedBars;}
  assert.deepEqual(updated,before,'Practice marks preserve original results, history entries and setup');
  await page.locator('#training-details').click();
  assert.equal(await page.locator('#home-screen').isVisible(),true);
  assert.equal(await page.locator('#report-bar-select').inputValue(),'1');
  assert.match(await page.locator('#training-report-details').innerText(),/Practised at 160 BPM · slower tempo/);
  await page.locator('[data-close=training-report-dialog]').click();await page.reload();
  await page.locator('#last-session-button').click();await page.selectOption('#report-bar-select','1');
  assert.match(await page.locator('#training-report-details').innerText(),/Practised at 160 BPM/);
  await page.locator('[data-close="training-report-dialog"]').click();
  await page.locator('#training-history-button').click();
  assert.equal(await page.locator('.history-row').count(),1,'Drill does not create a history entry');
  await page.locator('[data-close="training-history-dialog"]').click();
  await page.evaluate(()=>{
   const key='pianoQuiz.training.v1', state=JSON.parse(localStorage.getItem(key)), latest=state.history[0];
   const earlier=structuredClone(latest);earlier.at-=60000;earlier.report.bars[1].retries=1;earlier.report.bars[1].issues.missed=1;earlier.retries++;
   const slower=structuredClone(earlier);slower.at-=60000;slower.replay.bpm=120;
   state.history.push(earlier,slower);localStorage.setItem(key,JSON.stringify(state));
  });
  await page.reload();await page.locator('#training-history-button').click();
  assert.equal(await page.locator('#history-group-select option').count(),2);
  assert.deepEqual(await page.locator('.history-point strong').allTextContents(),['0%','50%']);
  assert.match(await page.locator('#training-history-content').innerText(),/\+50 percentage points/);
  await page.screenshot({path:`docs/images/session-history-${engine}.png`});
  await page.setViewportSize({width:320,height:568});
  assert.ok(await page.locator('#training-history-dialog').evaluate(e=>e.scrollWidth<=e.clientWidth+1));
  await page.selectOption('#history-group-select','1');
  assert.match(await page.locator('#history-setup').innerText(),/120 BPM/);
  assert.equal(await page.locator('.history-point').count(),1);
  await page.locator('.history-point').click();await page.selectOption('#report-bar-select','1');
  assert.equal(await page.locator('#report-practise-tempo').inputValue(),'96');
  await page.locator('#report-back-history').click();assert.equal(await page.locator('#history-group-select').inputValue(),'1');
 });
 await check('sight-reading retries missed beats while retaining already completed bars',async()=>{
  const page=await setup(true,true);await setupSight(page);
  let start=Number(await page.locator('#exercise-score').getAttribute('data-start-time'));
  async function until(time){const delay=await page.evaluate(t=>t-performance.now(),time);if(delay>0)await page.waitForTimeout(Math.ceil(delay));await page.waitForFunction(t=>performance.now()>=t,time,{polling:1});}
  for(let i=0;i<2;i++){await until(start+i*600);await page.evaluate(()=>window.trainingMidi.send([0x90,72,100]));await until(start+(i+1)*600);await page.evaluate(()=>window.trainingMidi.send([0x80,72,0]));}
  await page.waitForFunction(()=>document.getElementById('training-live-status').textContent.includes('Missed note'));
  assert.equal(await page.locator('.measure').getAttribute('data-bar'),'1');assert.equal(await page.locator('.score-event.current').getAttribute('data-event'),'2');
  start=Number(await page.locator('#exercise-score').getAttribute('data-start-time'));
  for(const [beat,duration] of [[0,2],[2,1],[3,1]]){await until(start+beat*300);await page.evaluate(()=>window.trainingMidi.send([0x90,72,100]));await until(start+(beat+duration)*300);await page.evaluate(()=>window.trainingMidi.send([0x80,72,0]));}
  await page.waitForFunction(()=>document.getElementById('training-screen').dataset.complete==='true');const result=await page.evaluate(()=>JSON.parse(localStorage.getItem('pianoQuiz.training.v1')).lastResult);
  assert.equal(result.retries,1);assert.equal(result.pitch,100);assert.equal(result.holds,100);assert.equal(result.onset,100);assert.equal(result.total,5);
  assert.equal(result.report.bars[1].issues.missed,1);
  await page.locator('#training-details').click();assert.match(await page.locator('#training-report-details').innerText(),/Missed notes/);
 });
 await check('sight-reading pauses on disconnect, rechecks, rotates and resumes with its score intact',async()=>{
  const page=await setup(true,true);await setupSight(page);
  await page.evaluate(()=>window.trainingMidi.drop());assert.equal(await page.locator('#training-screen').getAttribute('data-running'),'false');await page.evaluate(()=>window.trainingMidi.plug());await page.locator('#training-recheck').click();await page.waitForFunction(()=>document.getElementById('midi-status').textContent.startsWith('Connected'));await page.locator('#training-toggle').click();await running(page);await page.locator('#training-toggle').click();
  for(const size of profiles){await page.setViewportSize({width:size.width,height:size.height});await page.evaluate(s=>{for(const edge of ['top','bottom','left','right'])document.documentElement.style.setProperty('--safe-'+edge,(s[edge]||0)+'px');},size);await page.waitForFunction(h=>Math.abs(document.body.getBoundingClientRect().height-h)<1,size.height);
   const rects=await page.locator('#training-screen').evaluate(e=>({height:e.clientHeight,scroll:e.scrollHeight}));assert.ok(rects.scroll<=rects.height+1,JSON.stringify({size,rects}));
   const b=await page.locator('#training-toggle').boundingBox();assert.ok(b.y>=(size.top||0)&&b.y+b.height<=size.height-(size.bottom||0)+1);assert.ok((await page.locator('.measure').first().boundingBox()).height>=30,JSON.stringify({size,measure:await page.locator('.measure').first().boundingBox()}));
  }
  await page.screenshot({path:`docs/images/sight-tablet-${engine}.png`});await page.reload();assert.equal(await page.locator('#activity-select').inputValue(),'sight');assert.equal(await page.locator('#home-screen').isVisible(),true);
 });
 await check('missing MIDI does not block touch rhythm, metronome or the original quiz',async()=>{
  const ctx=await browser.newContext({viewport:{width:430,height:932}});contexts.push(ctx);await ctx.addInitScript(()=>Object.defineProperty(navigator,'requestMIDIAccess',{value:undefined}));const unsupported=await ctx.newPage();await unsupported.goto(base);await unsupported.selectOption('#activity-select','sight');assert.equal(await unsupported.locator('#start-button').isDisabled(),true);assert.match(await unsupported.locator('#practice-detail').innerText(),/Web MIDI/);await unsupported.selectOption('#activity-select','rhythm');assert.equal(await unsupported.locator('#start-button').isEnabled(),true);
 });
 await check('note selection keeps Save visible at both ends of the list on rotated phones and tablets',async()=>{
  const page=await setup();await page.locator('#customize-button').click();
  for(const size of profiles){
   await page.setViewportSize({width:size.width,height:size.height});await page.evaluate(s=>{for(const edge of ['top','bottom','left','right'])document.documentElement.style.setProperty('--safe-'+edge,(s[edge]||0)+'px');},size);
   await page.waitForFunction(h=>Math.abs(document.body.getBoundingClientRect().height-h)<1,size.height);
   for(const end of [false,true]){
    await page.locator('#customize-form .dialog-scroll').evaluate((e,end)=>{e.scrollTop=end?e.scrollHeight:0;},end);
    const b=await page.locator('#apply-button').boundingBox();assert.ok(b.y>=0&&b.y+b.height<=size.height-(size.bottom||0)+1,JSON.stringify({size,b}));
    assert.equal(await page.locator('#apply-button').evaluate(e=>{const b=e.getBoundingClientRect();return document.elementFromPoint(b.x+b.width/2,b.y+b.height/2)===e;}),true);
   }
  }
  await page.locator('#apply-button').tap();assert.equal(await page.locator('#customize-dialog').isVisible(),false);
 });
 await check('rhythm input is selected on Home and leaves the exercise screen clear',async()=>{
  const page=await setup(true,true);await page.selectOption('#activity-select','rhythm');
  assert.equal(await page.locator('#home-training-input').isVisible(),true);
  await page.locator('#home-training-input [data-training-input=midi]').tap();
  assert.equal(await page.locator('#home-training-input [data-training-input=midi]').getAttribute('aria-pressed'),'true');
  await page.locator('#start-button').tap();await page.waitForFunction(()=>document.getElementById('midi-status').textContent.startsWith('Connected'));await page.locator('#training-toggle').tap();await running(page);
  assert.equal(await page.locator('#training-input-row').isVisible(),false);
  assert.equal(await page.locator('#training-screen [data-training-input]').count(),0);
  assert.equal(await page.locator('#training-touchpad').isVisible(),false);
  await page.locator('#training-back').tap();
  await page.locator('#home-training-input [data-training-input=touch]').tap();
  await page.locator('#start-button').tap();await running(page);
  assert.equal(await page.locator('#training-touchpad').isVisible(),true);
  assert.equal(await page.locator('#training-input-row').isVisible(),false);
 });
 await check('long presses cancel native menus without interrupting the touch hold',async()=>{
  const page=await setup(true);await page.selectOption('#activity-select','rhythm');await page.locator('#start-button').tap();await running(page);
  await page.waitForFunction(()=>Number(document.getElementById('exercise-score').dataset.startTime)<=performance.now());
  const rect=await page.locator('#training-touchpad').boundingBox(),x=rect.x+rect.width/2,y=rect.y+rect.height/2;
  let cdp;
  if(engine==='chromium'){
   cdp=await page.context().newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
  }else{await page.mouse.move(x,y);await page.mouse.down();}
  await page.waitForTimeout(1100);
  assert.equal(await page.locator('#training-touchpad').evaluate(e=>{const event=new MouseEvent('contextmenu',{bubbles:true,cancelable:true});return !e.dispatchEvent(event)&&event.defaultPrevented;}),true);
  assert.equal(await page.locator('#training-touchpad').evaluate(e=>e.classList.contains('pressed')),true);
  assert.equal(await page.locator('#training-screen').getAttribute('data-running'),'true');
  if(cdp)await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});else await page.mouse.up();
  assert.equal(await page.locator('#training-touchpad').evaluate(e=>e.classList.contains('pressed')),false);
 });
 await check('beginner MIDI rhythm keeps holds pending and counts in the next bar before its first note',async()=>{
  const page=await setup(true,true);await page.selectOption('#activity-select','rhythm');await page.locator('#home-training-input [data-training-input=midi]').tap();
  await page.locator('#customize-button').click();await page.locator('#training-bpm').fill('200');await page.selectOption('#training-bars','2');await page.locator('#training-form button[type=submit]').click();
  await page.locator('#start-button').click();await page.waitForFunction(()=>document.getElementById('midi-status').textContent.startsWith('Connected'));await page.locator('#training-toggle').click();await running(page);
  await page.waitForFunction(()=>Number(document.getElementById('exercise-score').dataset.startTime)-performance.now()<100);
  assert.equal(await page.locator('.measure').count(),1);
  const start=Number(await page.locator('#exercise-score').getAttribute('data-start-time'));
  async function until(time){const delay=await page.evaluate(t=>t-performance.now(),time);if(delay>0)await page.waitForTimeout(Math.ceil(delay));await page.waitForFunction(t=>performance.now()>=t,time,{polling:1});}
  async function press(at,duration){await until(at);await page.evaluate(()=>window.trainingMidi.send([0x90,60,100]));assert.equal(await page.locator('.score-event.holding').count(),1);assert.equal(await page.locator('.score-event.holding.correct').count(),0);await until(at+duration);await page.evaluate(()=>window.trainingMidi.send([0x80,60,0]));}
  await press(start+80,490);await press(start+600+80,490);
  await until(start+1300);assert.match(await page.locator('#training-live-status').innerText(),/Read bar 2.*count in/);
  assert.equal(await page.locator('.measure').count(),1);
  assert.equal(await page.locator('.measure').first().getAttribute('data-bar'),'1');assert.equal(await page.locator('.score-event.missed').count(),0);
  await press(start+2400+80,490);await press(start+3000+80,250);await press(start+3300+80,250);
  await page.waitForFunction(()=>document.getElementById('training-screen').dataset.complete==='true');
  const result=await page.evaluate(()=>JSON.parse(localStorage.getItem('pianoQuiz.training.v1')).lastResult);assert.equal(result.onset,100);assert.equal(result.holds,100);assert.equal(result.missed,0);
 });
 await check('MIDI eighths reach the full hold meter and accept articulated releases at 200 BPM',async()=>{
  const page=await setup(true,true);await page.selectOption('#activity-select','rhythm');
  await page.locator('#home-training-input [data-training-input=midi]').click();
  await page.locator('#customize-button').click();await page.locator('#training-bpm').fill('200');
  await page.selectOption('#training-complexity','eighths');await page.selectOption('#training-bars','2');
  await page.selectOption('#training-pace','flow');await page.selectOption('#training-accuracy','beginner');
  await page.locator('#training-form button[type=submit]').click();await page.evaluate(()=>{Math.random=()=>.999999;});
  await page.locator('#start-button').click();await page.waitForFunction(()=>document.getElementById('midi-status').textContent.startsWith('Connected'));
  await page.locator('#training-toggle').click();await running(page);
  await page.evaluate(()=>{
   const score=document.getElementById('exercise-score'),seen=new Set();window.eighthChecks=[];
   function schedule(){
    const start=Number(score.dataset.startTime);
    for(const node of score.querySelectorAll('[data-event]')){
     const {event,beat,duration,rest}=node.dataset;if(rest==='true'||seen.has(event))continue;seen.add(event);
     const on=start+Number(beat)*300+55,off=start+(Number(beat)+Number(duration))*300-10;
     setTimeout(()=>window.trainingMidi.send([0x90,60,100],on),Math.max(0,on-performance.now()));
     setTimeout(()=>{
      window.trainingMidi.send([0x80,60,0],off);
      window.eighthChecks.push({duration:Number(duration),full:document.getElementById('hold-progress').value===1,correct:score.querySelector(`[data-event="${event}"]`)?.classList.contains('correct')});
     },Math.max(0,off-performance.now()));
    }
   }
   window.eighthObserver=new MutationObserver(schedule);window.eighthObserver.observe(score,{childList:true});schedule();
  });
  await page.waitForFunction(()=>document.getElementById('training-screen').dataset.complete==='true');
  await page.evaluate(()=>window.eighthObserver.disconnect());
  const checks=await page.evaluate(()=>window.eighthChecks.filter(c=>c.duration===.5));
  assert.ok(checks.length>=8,JSON.stringify(checks));assert.ok(checks.every(c=>c.full&&c.correct),JSON.stringify(checks));
  const result=await page.evaluate(()=>JSON.parse(localStorage.getItem('pianoQuiz.training.v1')).lastResult);
  assert.equal(result.onset,100);assert.equal(result.holds,100);assert.equal(result.missed,0);assert.equal(result.extras,0);
 });
 await check('MIDI calibration is visible at the top of App settings and returns there on close',async()=>{
  const page=await setup(false,true);
  for(const viewport of [{width:430,height:932},{width:1280,height:800}]){
   await page.setViewportSize(viewport);await page.locator('#settings-button').click();
   assert.equal(await page.locator('#settings-dialog').evaluate(e=>e.scrollTop),0);
   const button=page.locator('#midi-calibrate'),box=await button.boundingBox();
   assert.ok(box.y>=0&&box.y+box.height<=viewport.height,JSON.stringify(box));
   assert.match(await page.locator('#midi-timing-summary').innerText(),/current correction: 0 ms/);
   await button.tap();await page.locator('#calibration-dialog').waitFor({state:'visible'});
   await page.locator('[data-close=calibration-dialog]').click();await page.locator('#settings-dialog').waitFor({state:'visible'});
   await page.locator('[data-close=settings-dialog]').click();
  }
  await page.locator('#settings-button').click();await page.screenshot({path:`docs/images/midi-settings-${engine}.png`});
 });
 await check('four rhythm levels save, introduce their own note values, and keep a single readable bar',async()=>{
  const page=await setup(true);await page.selectOption('#activity-select','rhythm');
  for(const level of ['simple','steady','eighths','mixed']){
   await page.locator('#customize-button').click();await page.selectOption('#training-complexity',level);await page.selectOption('#training-bars','8');await page.locator('#training-form button[type=submit]').click();
   await page.locator('#start-button').click();await running(page);assert.equal(await page.locator('.measure').count(),1);
   const notes=await page.locator('[data-event]').evaluateAll(nodes=>nodes.map(n=>({duration:Number(n.dataset.duration),rest:n.dataset.rest==='true'})));
   if(level==='simple')assert.ok(notes.every(n=>[1,2].includes(n.duration)&&!n.rest));
   if(level==='steady')assert.ok(notes.some(n=>n.rest));
   if(level==='eighths')assert.ok(notes.some(n=>n.duration===.5));
   if(level==='mixed'){assert.ok(notes.some(n=>[1.5,3].includes(n.duration)));assert.ok(await page.locator('.score-dot').count());await page.screenshot({path:`docs/images/rhythm-challenge-${engine}.png`});}
   await page.locator('#training-back').click();
  }
  await page.reload();await page.locator('#customize-button').click();assert.equal(await page.locator('#training-complexity').inputValue(),'mixed');
 });
 await check('eight-bar rhythm report stays tappable on compact layouts and explains a session with no presses',async()=>{
  const page=await setup(true);await page.selectOption('#activity-select','rhythm');await page.locator('#customize-button').click();
  await page.locator('#training-bpm').fill('200');await page.selectOption('#training-bars','8');await page.selectOption('#training-pace','flow');
  await page.locator('#training-form button[type=submit]').click();await page.locator('#start-button').click();await running(page);
  await page.waitForFunction(()=>document.getElementById('training-screen').dataset.complete==='true');
  const result=await page.evaluate(()=>JSON.parse(localStorage.getItem('pianoQuiz.training.v1')).lastResult);
  assert.equal(result.report.bars.length,8);assert.equal(result.report.bars.reduce((n,bar)=>n+bar.issues.missed,0),result.total);
  assert.equal(await page.locator('.report-bar').count(),8);
  for(const size of [{width:320,height:568},{width:568,height:320},{width:667,height:375},{width:1280,height:800}]){
    await page.setViewportSize(size);await page.waitForFunction(h=>Math.abs(document.body.getBoundingClientRect().height-h)<1,size.height);
    for(const selector of ['#training-details','#training-toggle','[data-report-bar="7"]']){
      assert.ok(await page.locator(selector).evaluate(e=>{
        const b=e.getBoundingClientRect();return b.width>=44&&b.height>=44&&b.y>=0&&b.bottom<=innerHeight&&e.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2));
      }),JSON.stringify({size,selector}));
    }
  }
  await page.locator('[data-report-bar="7"]').tap();assert.equal(await page.locator('#report-bar-select').inputValue(),'7');
  assert.match(await page.locator('#training-report-details').innerText(),/Missed notes[\s\S]*No matched presses to measure/);
  await page.locator('[data-close="training-report-dialog"]').click();await page.locator('#training-back').click();
  await page.setViewportSize({width:320,height:568});await page.locator('#last-session-button').tap();
  assert.equal(await page.locator('#report-bar-select').inputValue(),'-1');
  await page.selectOption('#report-bar-select','7');
  await page.locator('#report-practise').tap();await running(page);
  assert.equal(await page.locator('#training-touchpad').isVisible(),true);
  assert.match(await page.locator('#training-progress').innerText(),/Bar 8 · 160 BPM/);
  await page.waitForFunction(()=>document.getElementById('training-screen').dataset.complete==='true');
  assert.equal(await page.locator('#training-toggle').innerText(),'Play again');
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('pianoQuiz.training.v1')).lastResult),result);
 });
 await check('MIDI timing calibration suggests an offset, saves only on Apply, and stops on disconnect',async()=>{
  const page=await setup(false,true,true);report.limits.push('Calibration uses scheduled clicks from a controlled audio clock and simulated MIDI.');
  await page.selectOption('#activity-select','rhythm');await page.locator('#customize-button').click();await page.locator('#training-bpm').fill('95');
  await page.locator('#training-calibrate').click();await page.locator('#calibration-connect').click();
  await page.locator('#calibration-start').click();
  await page.waitForFunction(()=>window.calibrationClicks.length>0);
  await page.evaluate(()=>{
   const first=window.calibrationClicks[0]+2400;
   for(let i=0;i<12;i++){
    const tap=first+i*600+42;
    setTimeout(()=>{window.trainingMidi.send([0x90,60,100],tap);window.trainingMidi.send([0x80,60,0],tap+1);},tap-performance.now());
   }
  });
  await page.locator('#calibration-apply').waitFor({state:'visible'});
  assert.match(await page.locator('#calibration-result').innerText(),/12 of 12 taps used/);
  const offset=Number((await page.locator('#calibration-apply').innerText()).match(/\d+/)[0]);
  assert.ok(offset>=40&&offset<=44,offset);
  const stored=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('pianoQuiz.training.v1')).settings.offset);
  assert.equal(await stored(),0);
  await page.screenshot({path:`docs/images/midi-calibration-${engine}.png`});
  await page.locator('#calibration-apply').click();assert.equal(await stored(),offset);
  await page.locator('#calibration-start').click();await page.evaluate(()=>window.trainingMidi.drop());
  await page.waitForFunction(()=>document.getElementById('calibration-status').textContent.includes('disconnected')||document.getElementById('calibration-status').textContent.includes('MIDI input changed'));
  assert.equal(await page.locator('#calibration-apply').isVisible(),false);
  await page.locator('[data-close="calibration-dialog"]').click();
  await page.locator('#training-dialog').waitFor({state:'visible'});
  assert.equal(await page.locator('#training-bpm').inputValue(),'95');assert.equal(await page.locator('#training-offset').inputValue(),String(offset));
  await page.locator('[data-close=training-dialog]').click();await page.locator('#settings-button').click();
  assert.match(await page.locator('#midi-timing-summary').innerText(),new RegExp(`current correction: \\+${offset} ms`));
  await page.locator('#midi-calibrate').click();await page.locator('#calibration-dialog').waitFor({state:'visible'});
  assert.match(await page.locator('#calibration-current').innerText(),new RegExp(`\\+${offset} ms`));
 });
 assert.deepEqual(report.errors,[]);report.result='passed';
}catch(e){report.result='failed';report.failure=e.stack;console.error(e);process.exitCode=1;}
finally{if(process.env.TRAINING_CHECK)report.filter=process.env.TRAINING_CHECK;for(const ctx of contexts)await ctx.close();await browser.close();await writeFile(`docs/${process.env.PIANO_URL?'live-':''}training${process.env.TRAINING_CHECK?'-focused':''}-${engine}.json`,JSON.stringify(report,null,2)+'\n');}
