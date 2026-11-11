import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium, firefox, webkit } from 'playwright';
import { THEMES } from '../js/quiz.js';

const engine = process.env.BROWSER || 'chromium';
const base = process.env.PIANO_URL || 'http://127.0.0.1:8421/';
const report = { engine, origin:base, build:JSON.parse(await readFile('dist/version.json')).version, testedAt:new Date().toISOString(), checks:[], errors:[], limits:['Safe areas and screen sizes are simulated. MIDI is simulated and audio is deliberately unavailable to test the visual fallback. Dense notation uses deliberate edge-case fixtures. Physical devices are not attached.'] };
const browser = await { chromium, firefox, webkit }[engine].launch({ headless:true, ...(engine === 'chromium' ? { executablePath:'/usr/bin/chromium', args:['--mute-audio'] } : {}) });
const context = await browser.newContext({ viewport:{width:430,height:932}, hasTouch:true, reducedMotion:'reduce' });
// Use the explicit visual fallback so count-in sampling is independent of host audio.
await context.addInitScript(() => {
  window.AudioContext = undefined; window.webkitAudioContext = undefined;
  const port = {id:'polish',name:'Test keyboard',state:'connected',connection:'closed',async open(){this.connection='open';},async close(){this.connection='closed';}};
  Object.defineProperty(navigator,'requestMIDIAccess',{configurable:true,value:async()=>({inputs:new Map([[port.id,port]])})});
});
const page = await context.newPage();
page.on('pageerror', error => report.errors.push(error.message));
async function check(label, run) {
  if (process.env.POLISH_CHECK && !label.includes(process.env.POLISH_CHECK)) return;
  await run(); report.checks.push(label); console.log('PASS ' + label);
}
async function home() { await page.goto(base); }
async function startRhythm() {
  await page.selectOption('#activity-select','rhythm');
  await page.locator('#start-button').click();
  await page.locator('#training-visual').click();
  await page.waitForFunction(() => document.getElementById('training-screen').dataset.running === 'true');
}
const profiles = [
  {name:'iphone',width:430,height:932,top:59,bottom:34},
  {name:'iphone-landscape',width:932,height:430,left:59,right:59,bottom:21},
  {name:'small-phone',width:320,height:568},
  {name:'honor-portrait',width:800,height:1280},
  {name:'honor-landscape',width:1280,height:800},
];
try {
  await mkdir('docs/images',{recursive:true});
  await check('initial count-in never adds a phantom beat in either meter or after resume', async () => {
    for (const meter of [3,4]) {
      await home(); await page.selectOption('#activity-select','rhythm');
      await page.locator('#customize-button').click(); await page.selectOption('#training-meter',String(meter));
      await page.locator('#training-bpm').fill('200'); await page.locator('#training-form button[type=submit]').click();
      await page.locator('#start-button').click();
      for (let attempt=0; attempt<2; attempt++) {
        await page.evaluate(() => {
          window.countFrames = [];
          const observe = () => {
            const score = document.getElementById('exercise-score');
            const start = Number(score.dataset.startTime);
            const text = document.getElementById('training-live-status').textContent;
            const remaining = start-performance.now();
            if (document.getElementById('training-screen').dataset.running === 'true' && remaining > 0) {
              window.countFrames.push({text,remaining,dot:document.querySelector('#training-beats .active')?.dataset.beat});
            }
            window.countFrame = requestAnimationFrame(observe);
          }; observe();
        });
        await page.locator(attempt ? '#training-toggle' : '#training-visual').click();
        await page.waitForFunction(() => Number(document.getElementById('exercise-score').dataset.startTime) < performance.now());
        await page.evaluate(() => cancelAnimationFrame(window.countFrame));
        const frames = await page.evaluate(() => window.countFrames);
        const counts = frames.map(f => Number(f.text.match(/^Get ready · (\d+)$/)?.[1])).filter(Boolean);
        assert.ok(counts.includes(meter) && counts.includes(1), JSON.stringify({meter,counts}));
        assert.ok(counts.every(n => n<=meter), JSON.stringify({meter,counts}));
        assert.ok(frames.filter(f=>f.remaining > meter*300).every(f=>f.dot===undefined), 'No last-beat flash before the first click');
        await page.locator('#training-toggle').click();
      }
      await page.locator('#training-back').click();
    }
  });
  await check('dense accidentals clear the time signature and extreme notes stay inside the staff', async () => {
    await home(); await page.selectOption('#activity-select','sight'); await page.locator('#start-button').click();
    await page.waitForFunction(() => document.getElementById('midi-status').textContent.startsWith('Connected'));
    await page.locator('#training-toggle').click(); await page.locator('#training-visual').click();
    await page.locator('#training-toggle').click();
    for (const profile of profiles) {
      await page.setViewportSize({width:profile.width,height:profile.height});
      await page.evaluate(p => { for (const edge of ['top','bottom','left','right']) document.documentElement.style.setProperty('--safe-'+edge,(p[edge]||0)+'px'); },profile);
      for (const clef of ['treble','bass']) for (const range of ['middle','low','high']) {
        const geometry = await page.evaluate(async ({clef,range}) => {
          const {renderScore} = await import('./js/score.js');
          const {makeTone} = await import('./js/notes.js');
          const octave = clef==='treble' ? {middle:4,low:3,high:6}[range] : {middle:3,low:1,high:4}[range];
          const letter = range==='low' ? 0 : clef==='bass' && range==='middle' ? 1 : 6;
          const phrase = {rhythm:false,clef,meter:4,bars:1,events:Array.from({length:8},(_,id)=>({id,bar:0,beat:id/2,durationBeats:.5,rest:false,tone:makeTone(letter,id%2 ? 0 : range==='low' ? 1 : -1,octave)}))};
          document.getElementById('exercise-score').innerHTML = renderScore(phrase,0);
          const svg = document.querySelector('.exercise-staff');
          const box = element => { const b=element.getBBox(); return {x:b.x,y:b.y,right:b.x+b.width,bottom:b.y+b.height}; };
          const v=svg.viewBox.baseVal;
          return {view:{x:v.x,y:v.y,right:v.x+v.width,bottom:v.y+v.height},notes:[...svg.querySelectorAll('[data-event]')].map(box),meter:[...svg.querySelectorAll('.score-meter')].map(box)};
        },{clef,range});
        for (const note of geometry.notes) {
          assert.ok(note.x>=geometry.view.x && note.right<=geometry.view.right && note.y>=geometry.view.y && note.bottom<=geometry.view.bottom, JSON.stringify({profile,clef,range,geometry}));
        }
        assert.ok(geometry.notes[0].x > Math.max(...geometry.meter.map(b=>b.right))+4, JSON.stringify({profile,clef,range,geometry}));
        if (engine==='chromium' && clef==='treble' && range==='middle') await page.screenshot({path:`docs/images/polish-dense-${profile.name}-${engine}.png`});
      }
      const layout = await page.locator('#training-screen').evaluate(e=>({height:e.clientHeight,scroll:e.scrollHeight}));
      assert.ok(layout.scroll<=layout.height+1,JSON.stringify({profile,layout}));
      for (const id of ['training-toggle','training-back','training-configure']) {
        assert.ok(await page.locator('#'+id).evaluate(e=>{const b=e.getBoundingClientRect();return e.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2));}),id+' is touchable');
      }
    }
    await page.locator('#training-back').click();
  });
  await check('training feedback stays readable in all fifteen palettes', async () => {
    await page.setViewportSize({width:430,height:932});
    await page.evaluate(() => { for(const edge of ['top','bottom','left','right']) document.documentElement.style.setProperty('--safe-'+edge,'0px'); });
    await home(); await startRhythm(); await page.locator('#training-toggle').click();
    report.contrast = [];
    for (const theme of THEMES.filter(t=>t.id!=='system')) {
      await page.locator('#settings-button').click(); await page.locator(`[data-theme="${theme.id}"]`).click(); await page.locator('[data-close="settings-dialog"]').click();
      const contrast = await page.evaluate(() => {
        const color = value => value.match(/[\d.]+/g).slice(0,3).map(Number).map(c=>{c/=255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;}).reduce((sum,c,i)=>sum+c*[.2126,.7152,.0722][i],0);
        const ratio = (a,b) => (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
        const status = document.getElementById('training-live-status');
        status.textContent = 'Wrong note · get ready to play in 4 beats'; status.classList.add('mistake');
        const bg=color(getComputedStyle(document.body).backgroundColor), surface=color(getComputedStyle(document.querySelector('.measure')).backgroundColor);
        const wrong=color(getComputedStyle(status).color);
        const note=document.querySelector('[data-event]'); note.classList.add('correct');
        const correct=color(getComputedStyle(note).color); note.classList.remove('correct');
        note.classList.add('wrong'); const wrongNote=color(getComputedStyle(note).color); note.classList.remove('wrong');
        return {text:ratio(wrong,bg),wrongNote:ratio(wrongNote,surface),correctNote:ratio(correct,surface)};
      });
      report.contrast.push({theme:theme.id,...contrast});
      assert.ok(contrast.text>=4.5 && contrast.wrongNote>=3 && contrast.correctNote>=3,JSON.stringify({theme:theme.id,contrast}));
      if (engine==='chromium' && ['dark','ocean','amoled'].includes(theme.id)) await page.screenshot({path:`docs/images/polish-feedback-${theme.id}-${engine}.png`});
    }
  });
  assert.deepEqual(report.errors,[]); report.result='passed';
} catch (error) { report.result='failed'; report.failure=error.stack; console.error(error); process.exitCode=1; }
finally {
  if (process.env.POLISH_CHECK) report.filter=process.env.POLISH_CHECK;
  await browser.close();
  await writeFile(`docs/${process.env.PIANO_URL?'live-':''}polish${process.env.POLISH_CHECK?'-focused':''}-${engine}.json`,JSON.stringify(report,null,2)+'\n');
}
