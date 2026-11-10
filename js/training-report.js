import { totalIssues } from './training.js';

const issues = [
  ['missed','Missed notes','Lower the tempo and watch the cursor approach each note.'],
  ['offBeat','Off-beat presses','Count along with the clicks before pressing the keys.'],
  ['pitch','Wrong notes','Try a narrower note range or practise the hardest bar more slowly.'],
  ['short','Released too soon','Hold until the release cue and count the full note length.'],
  ['long','Held too long','Use the release cue to let go on time.'],
  ['rest','Rest mistakes','Release all keys for the whole rest.'],
];

export function practiceDuration(milliseconds) {
  const seconds = Math.round(milliseconds/1000);
  return `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;
}

export function firstTryBars(result) {
  return result.report.bars.filter(bar=>!bar.retries).length;
}

function issueRows(bars) {
  return issues.map(([key,label,tip])=>({label,tip,count:bars.reduce((n,bar)=>n+bar.issues[key],0)})).filter(item=>item.count).sort((a,b)=>b.count-a.count);
}

export function renderTrainingReport(result) {
  const {bars,elapsedMs} = result.report;
  const sight = result.activity === 'sight';
  const counts = bars.map(bar=>sight ? bar.retries : totalIssues(bar));
  const max = Math.max(1,...counts);
  const cards = sight
    ? [[`${firstTryBars(result)}/${bars.length}`,'First-try bars'],[result.retries,'Bar retries']]
    : [[`${result.onset}%`,'On the beat'],[`${result.holds}%`,'Note lengths']];
  cards.push([practiceDuration(elapsedMs),'Practice time']);
  const highlights = issueRows(bars);
  const unit = sight ? 'retry' : 'mistake';
  const chart = counts.map((n,i)=>`<button type="button" class="report-bar${n ? ' needs-work' : ''}" style="--fill:${Math.round(n/max*100)}%" data-report-bar="${i}" aria-label="Bar ${i+1}: ${n} ${n===1?unit:sight?'retries':'mistakes'}. View details."><span>Bar ${i+1}</span><strong>${n || '✓'}</strong></button>`).join('');
  return `<div class="training-metrics">${cards.map(([value,label])=>`<div><strong>${value}</strong><span>${label}</span></div>`).join('')}</div>
    <section class="report-chart" aria-label="${sight?'Retries':'Mistakes'} by bar"><div class="report-chart-heading"><h2>${sight?'Retries':'Mistakes'} by bar</h2><span class="muted">Tap a bar for details</span></div><div class="report-bars" data-dense="${bars.length>4}" style="--bars:${bars.length}">${chart}</div></section>
    <div class="report-focus">${highlights.length ? `<ul>${highlights.slice(0,3).map(row=>`<li>${row.label} <strong>${row.count}</strong></li>`).join('')}</ul><p class="muted">${highlights[0].tip}</p>` : '<p class="muted">No mistakes recorded.</p>'}</div>`;
}

export function renderTrainingDetails(result, selected = -1) {
  const {bars,elapsedMs} = result.report;
  const selection = selected < 0 ? bars : [bars[selected]];
  const breakdown = issueRows(selection);
  const highest = breakdown[0]?.count ?? 1;
  const timing = selection.reduce((sum,bar)=>{
    for (const key of Object.keys(sum)) sum[key] += bar.timing[key];
    return sum;
  },{early:0,centered:0,late:0,absoluteMs:0});
  const attacks = timing.early+timing.centered+timing.late;
  const scope = selected < 0 ? `${result.total} notes in the score · ${practiceDuration(elapsedMs)} practice time` : result.activity==='sight' ? `${selection[0].retries} bar ${selection[0].retries===1?'retry':'retries'}` : `${totalIssues(selection[0])} mistakes`;
  return `<p class="small muted">${scope}</p>
    <section class="report-detail-section"><h3>Mistakes</h3>${breakdown.length ? `<ul class="report-issue-list">${breakdown.map(row=>`<li><span>${row.label}</span><strong>${row.count}</strong><meter min="0" max="${highest}" value="${row.count}" aria-label="${row.label}: ${row.count}"></meter></li>`).join('')}</ul><p class="report-tip">${breakdown[0].tip}</p>` : '<p class="small muted">No mistakes recorded here.</p>'}</section>
    <section class="report-detail-section"><h3>Timing of matched presses</h3>${attacks ? `<div class="report-timing" aria-hidden="true">${['early','centered','late'].map(key=>`<span class="${key}" style="flex:${timing[key]}"></span>`).join('')}</div><div class="report-timing-labels"><span><strong>${timing.early}</strong> early</span><span><strong>${timing.centered}</strong> within ±20 ms</span><span><strong>${timing.late}</strong> late</span></div><p class="small muted">${Math.round(timing.absoluteMs/attacks)} ms average distance from the beat. Misses and unmatched presses are counted separately.</p>` : '<p class="small muted">No matched presses to measure.</p>'}</section>
    ${selected < 0 ? `<p class="small muted">Practice time includes waits between bars and retries, and excludes pauses and count-ins after starting or resuming.</p><p class="small muted">${result.activity==='sight' ? 'A pause is not a failed bar.' : 'Rhythm percentages describe the completed pass. Mistake counts also include earlier attempts.'}</p>` : ''}`;
}
