import { openPractice } from './studio-navigation.mjs';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { chromium, firefox, webkit } from 'playwright';
import { copyDefaults, NOTE_OPTIONS, OCTAVE_OPTIONS, poolFor, createRound } from '../js/quiz.js';
import { freshState } from '../js/storage.js';

const engine=process.env.BROWSER || 'chromium',origin=process.env.PIANO_URL || 'http://127.0.0.1:8421/';
const report={engine,origin,build:JSON.parse(await readFile('dist/version.json')).version,testedAt:new Date().toISOString(),checks:[],errors:[],limits:['Viewports and touch input are simulated; no physical tablet is attached.']};
const browser=await {chromium,firefox,webkit}[engine].launch({headless:true,...(engine==='chromium'?{executablePath:'/usr/bin/chromium',args:['--mute-audio']}: {})});
const settings={...copyDefaults(),mode:'notes',clef:'mixed',noteNames:NOTE_OPTIONS.map(note=>note.name),octaves:OCTAVE_OPTIONS};
const pool=poolFor(settings);
async function open(item,viewport={width:1280,height:800}){
 const context=await browser.newContext({viewport,hasTouch:true,serviceWorkers:'block'});
 const state=freshState();state.settings=settings;state.active=createRound(settings,{},Date.now(),()=>0);state.active.current=item;
 const page=await context.newPage();page.on('pageerror',error=>report.errors.push(error.message));
 await page.addInitScript(state=>localStorage.setItem('pianoQuiz.state.v1',JSON.stringify(state)),state);
 await page.goto(origin);await openPractice(page);await page.locator('#start-button').tap();return {page,context};
}
const active=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('pianoQuiz.state.v1')).active);
try{
 for(const item of pool.filter(item=>process.env.TOUCH_MATRIX!=='sample'||item.tones[0].letter===1)){
  const {page,context}=await open(item),tone=item.tones[0];
  await page.locator(`#letters [data-letter="${tone.letter}"]`).tap();
  await page.locator(`#accidentals [data-alteration="${tone.alteration}"]`).tap();
  await page.locator('#check-button').tap();const round=await active(page);
  assert.equal(round.feedback.item.id,item.id);assert.equal(round.feedback.correct,true,item.id);
  assert.equal(await page.locator('.staff--correct').count(),1);
  report.checks.push(`${item.id}: correct touch name accepted`);await context.close();
 }
 for(const viewport of [{width:430,height:932},{width:800,height:1280},{width:1280,height:800}])for(const clef of ['treble','bass']){
  const item=pool.find(item=>item.clef===clef&&item.tones[0].name==='D'&&item.tones[0].octave===3);
  const {page,context}=await open(item,viewport);
  await page.locator('#accidentals [data-alteration="1"]').tap();
  assert.equal(await page.locator('#unknown-button').innerText(),'Clear answer');await page.locator('#unknown-button').tap();
  await page.locator('#letters [data-letter="1"]').tap();
  assert.equal(await page.locator('#unknown-button').innerText(),'Clear answer');
  await page.locator('#unknown-button').tap();
  let round=await active(page);assert.equal(round.answers.length,0);assert.equal(round.feedback,null);assert.equal(round.current.id,item.id);
  assert.equal(await page.locator('#check-button').isDisabled(),true);
  await page.locator('#letters [data-letter="1"]').tap();await page.locator('#check-button').tap();
  assert.equal((await active(page)).feedback.correct,true);
  await context.close();
  const skipped=await open(item,viewport);await skipped.page.locator('#unknown-button').tap();
  round=await active(skipped.page);assert.equal(round.feedback.answer,null);
  assert.equal(await skipped.page.locator('#staff-caption').innerText(),'Skipped · Answer: D3');
  assert.equal(await skipped.page.locator('.staff--wrong').count(),0);
  await skipped.context.close();
  report.checks.push(`${viewport.width}x${viewport.height}, ${clef}: selected D3 can only be checked or cleared; explicit skip is neutral and named once`);
 }
 if(engine==='chromium'){
  const item=pool.find(item=>item.id==='note:treble:1:0:3'),{page,context}=await open(item);
  await page.locator('#letters [data-letter="1"]').tap();const box=await page.locator('#check-button').boundingBox();
  const point={x:box.x+box.width/2,y:box.y+box.height/2};
  const cdp=await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});
  await page.evaluate(point=>{
   const check=document.getElementById('check-button'),skip=document.getElementById('unknown-button'),box=skip.getBoundingClientRect();
   check.style.transform='translateY(-100px)';skip.style.transform=`translateY(${point.y-box.y-box.height/2}px)`;
  },point);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('pianoQuiz.state.v1')).active.feedback!==null);
  const feedback=(await active(page)).feedback;assert.equal(feedback.correct,true);assert.equal(feedback.answer.letter,1);
  report.checks.push('Real touch begins on Check, layout moves beneath the finger, pointer capture still checks D3');
  await context.close();
  const cancel=await open(item);await cancel.page.locator('#letters [data-letter="1"]').tap();
  const button=await cancel.page.locator('#check-button').boundingBox();
  await cancel.page.mouse.move(button.x+button.width/2,button.y+button.height/2);await cancel.page.mouse.down();
  await cancel.page.mouse.move(5,5);await cancel.page.mouse.up();assert.equal((await active(cancel.page)).feedback,null);
  await cancel.page.locator('#check-button').focus();await cancel.page.keyboard.press('Enter');
  assert.equal((await active(cancel.page)).feedback.correct,true);
  report.checks.push('Dragging away cancels Check; keyboard Enter still submits the selected answer');
  await cancel.context.close();
 }
 assert.deepEqual(report.errors,[]);report.result='passed';console.log(`${engine}: ${report.checks.length} touch quiz checks passed`);
}catch(error){report.result='failed';report.failure=error.stack;console.error(error);process.exitCode=1;}
finally{await browser.close();await writeFile(`docs/${process.env.PIANO_URL?'live-':''}touch-quiz-${engine}.json`,JSON.stringify(report,null,2)+'\n');}
