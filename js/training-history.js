import { RHYTHM_LEVELS } from './training.js';
import { firstTryBars, practiceDuration } from './training-report.js';

export function groupSessions(history, activity) {
  const groups = new Map();
  history.forEach((result,index)=>{
    if (result.activity!==activity || !result.comparison || !result.replay) return;
    const {bpm,meter,clef,bars,input,accuracy,offset} = result.replay;
    const {level,pace,notes,octaves} = result.comparison;
    const key = JSON.stringify([bpm,meter,bars.length,level,pace,accuracy,offset,activity==='sight'?clef:input,notes,octaves]);
    if (!groups.has(key)) groups.set(key,[]);
    groups.get(key).push({result,index});
  });
  return [...groups.values()];
}

export function historyLabel(result) {
  const {bpm,meter,clef,bars,input,accuracy,offset} = result.replay;
  const {level,pace,notes,octaves} = result.comparison;
  const source = result.activity==='sight' ? `${clef} · ${notes.join(' ')} · octave ${octaves.join('/')}` : input==='midi'?'MIDI':'Touch';
  return `${bpm} BPM · ${RHYTHM_LEVELS[level].name} · ${meter}/4 · ${bars.length} bars · ${source} · ${accuracy} · ${pace==='flow'?'keep playing':'count in'} · ${offset} ms`;
}

const date = new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
const sessionDate = at => date.format(Math.min(at,8640000000000000));
const score = result => result.activity==='sight' ? Math.round(100*firstTryBars(result)/result.report.bars.length) : result.onset ?? 0;
const label = result => result.activity==='sight' ? `${firstTryBars(result)}/${result.report.bars.length} bars first try` : `${result.onset}% on beat · ${result.holds}% holds`;

export function renderHistoryGroup(group) {
  const trend = group.slice(0,5).reverse();
  const delta = group.length>1 ? score(group[0].result)-score(group[1].result) : null;
  const title = group[0].result.activity==='sight' ? 'Bars first try' : 'On the beat';
  const points = trend.map(({result,index})=>`<button type="button" class="history-point" data-history-result="${index}" aria-label="${sessionDate(result.at)}: ${label(result)}. Open report."><span class="history-column"><span style="--score:${score(result)}%"></span></span><strong>${score(result)}%</strong></button>`).join('');
  const rows = group.map(({result,index})=>`<li><button type="button" class="history-row" data-history-result="${index}"><span><strong>${label(result)}</strong><small>${sessionDate(result.at)} · ${practiceDuration(result.report.elapsedMs)}</small></span><span aria-hidden="true">↗</span></button></li>`).join('');
  return `<section class="report-detail-section"><div class="report-chart-heading"><h3>${title}</h3><span class="small muted">Latest ${trend.length} · oldest first</span></div>
  <div class="history-chart" style="--points:${trend.length}">${points}</div>
  <p class="small muted">${delta===null?'Finish another session with this setup to compare.':delta===0?'Same score as the previous comparable session.':`${delta>0?'+':''}${delta} percentage points vs the previous comparable session.`}</p></section>
  <h3 class="history-list-heading">Sessions with this setup</h3><ul class="history-list">${rows}</ul>`;
}
