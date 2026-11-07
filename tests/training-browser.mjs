import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { chromium, firefox, webkit } from 'playwright';
const engine=process.env.BROWSER||'chromium', base=process.env.PIANO_URL||'http://127.0.0.1:8421/';
const report={engine,origin:base,build:JSON.parse(await readFile('dist/version.json')).version,testedAt:new Date().toISOString(),checks:[],errors:[],limits:['Device sizes and safe areas are simulated. No physical MIDI keyboard or mobile device is attached.']};
const browser=await {chromium,firefox,webkit}[engine].launch({headless:true,...(engine==='chromium'?{executablePath:'/usr/bin/chromium',args:['--mute-audio']}: {})});
const contexts=[];
async function setup(deterministic = false){
 const ctx=await browser.newContext({viewport:{width:430,height:932},hasTouch:true,reducedMotion:'reduce',...(engine!=='firefox'?{isMobile:true}: {})});contexts.push(ctx);
 await ctx.addInitScript(()=>{
  window.scheduledClicks=[];
  const start=OscillatorNode.prototype.start;
  OscillatorNode.prototype.start=function(when){window.scheduledClicks.push({when,now:this.context.currentTime,frequency:this.frequency.value});return start.call(this,when);};
 });
 if(deterministic)await ctx.addInitScript(()=>{Math.random=()=>0;});
 const page=await ctx.newPage();page.on('pageerror',e=>report.errors.push(e.message));await page.goto(base);return page;
}
async function check(label,run){await run();report.checks.push(label);console.log('PASS '+label);}
async function running(page){
 await page.waitForFunction(()=>document.getElementById('training-screen').dataset.running==='true'||!document.getElementById('training-visual').hidden);
 if(await page.locator('#training-visual').isVisible()){report.limits.push('Audio could not start in this host; visual fallback verified.');await page.locator('#training-visual').click();}
 await page.waitForFunction(()=>document.getElementById('training-screen').dataset.running==='true');
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
  const page=await setup();await page.locator('#start-button').click();await page.locator('#unknown-button').click();await page.locator('#pause-button').click();await page.locator('#pause-home-button').click();
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
  const page=await setup(true);await page.selectOption('#activity-select','rhythm');await page.locator('#customize-button').click();await page.locator('#training-bpm').fill('200');await page.selectOption('#training-bars','2');await page.locator('#training-form button[type=submit]').click();await page.locator('#start-button').click();await running(page);
  await page.waitForFunction(()=>Number(document.getElementById('exercise-score').dataset.startTime)-performance.now()<800);
  const data=await page.locator('#exercise-score').evaluate(e=>({start:Number(e.dataset.startTime),events:[...e.querySelectorAll('[data-event]')].filter(n=>n.dataset.rest==='false').map(n=>({beat:Number(n.dataset.beat),duration:Number(n.dataset.duration)}))}));
  const pad=await page.locator('#training-touchpad').boundingBox();await page.mouse.move(pad.x+pad.width/2,pad.y+pad.height/2);
  async function until(time){const delay=await page.evaluate(time=>time-performance.now(),time);if(delay>0)await page.waitForTimeout(delay);}
  for(let i=0;i<data.events.length;i++){const event=data.events[i];await until(data.start+event.beat*300);await page.mouse.down();await until(data.start+(event.beat+(i===0?1:event.duration))*300);await page.mouse.up();}
  await page.waitForFunction(()=>document.getElementById('training-screen').dataset.complete==='true');
  const result=await page.evaluate(()=>JSON.parse(localStorage.getItem('pianoQuiz.training.v1')).lastResult);assert.equal(result.onset,100);assert.equal(result.holds,75);assert.equal(result.total,4);assert.equal(result.extras,0);await page.screenshot({path:`docs/images/rhythm-results-${engine}.png`});
 });
 await check('rhythm score and touch pad fit rotating phone and tablet layouts',async()=>{
  const page=await setup(true);await page.selectOption('#activity-select','rhythm');await page.locator('#start-button').click();await running(page);await page.locator('#training-toggle').click();
  for(const size of profiles){await page.setViewportSize({width:size.width,height:size.height});await page.evaluate(s=>{for(const edge of ['top','bottom','left','right'])document.documentElement.style.setProperty('--safe-'+edge,(s[edge]||0)+'px');},size);await page.waitForFunction(h=>Math.abs(document.body.getBoundingClientRect().height-h)<1,size.height);
   const rects=await page.locator('#training-screen').evaluate(e=>({height:e.clientHeight,scroll:e.scrollHeight}));assert.ok(rects.scroll<=rects.height+1,JSON.stringify({size,rects}));
   for(const selector of ['#training-toggle','#training-touchpad','#training-back']){const b=await page.locator(selector).boundingBox();assert.ok(b.y>=(size.top||0)&&b.y+b.height<=size.height-(size.bottom||0)+1,JSON.stringify({size,selector,b}));}
   assert.ok((await page.locator('.measure').first().boundingBox()).height>=30);
  }
  await page.screenshot({path:`docs/images/rhythm-${engine}.png`});
 });
 assert.deepEqual(report.errors,[]);report.result='passed';
}catch(e){report.result='failed';report.failure=e.stack;console.error(e);process.exitCode=1;}
finally{for(const ctx of contexts)await ctx.close();await browser.close();await writeFile(`docs/${process.env.PIANO_URL?'live-':''}training-${engine}.json`,JSON.stringify(report,null,2)+'\n');}
