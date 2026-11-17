import assert from 'node:assert/strict';
import test from 'node:test';
import { copyDefaults, createRound, poolFor, recordAnswer, summarize, DAY } from '../js/quiz.js';
import { freshState, restoreState } from '../js/storage.js';
import { BACKUP_KEY, emptyStudio, loadStudio, noteHint, recommend, recordLearningAnswer } from '../js/learning.js';
import { backupBeforeStudio } from '../js/studio.js';
import { comparisonSetup, ExerciseSession, hardestBar, normalizeTraining, saveReplay } from '../js/training.js';
import { renderTrainingReport } from '../js/training-report.js';
import { groupSessions } from '../js/training-history.js';

const now = 1_800_000_000_000;
const storage = () => {
  const data = new Map();
  return {
    getItem: key => data.get(key) ?? null,
    setItem: (key,value) => data.set(key,value),
  };
};
test('the redesign snapshots exact legacy data once and keeps older pacing independent of Flow', () => {
  const device = storage();
  device.setItem('pianoQuiz.state.v1', JSON.stringify({ ...freshState(), settings: { theme:'nocturne', noteNames:['C♯'] } }));
  const original = JSON.stringify({ activity:'sight', settings:{ pace:'flow', offset:42 } });
  device.setItem('pianoQuiz.training.v1', original);
  assert.ok(backupBeforeStudio(device));
  assert.deepEqual(loadStudio(device,'nocturne'),emptyStudio('nocturne'));
  assert.equal(loadStudio(device,'nocturne').appearance,'dark');
  device.setItem('pianoQuiz.training.v1','{}');
  assert.ok(backupBeforeStudio(device));
  assert.equal(JSON.parse(device.getItem(BACKUP_KEY)).data['pianoQuiz.training.v1'],original);
  assert.equal(normalizeTraining(JSON.parse(original).settings).behavior,'retry-bar');
  assert.equal(normalizeTraining(JSON.parse(original).settings).offset,42);
});
test('a hint survives reload and an assisted correct answer remains due for review', () => {
  const state=freshState();
  state.active=createRound(state.settings,state.history,now,()=>0);
  state.active.assisted=true;
  const round=restoreState(JSON.parse(JSON.stringify(state))).active;
  const tone=round.current.tones[0];
  const feedback=recordAnswer(round,state.history,{letter:tone.letter,alteration:tone.alteration},20,now);
  assert.equal(feedback.correct,true);
  assert.equal(feedback.assisted,true);
  assert.equal(summarize(round).correct,0);
  assert.equal(state.history[round.current.id].due,now);
  const studio=emptyStudio('system');
  recordLearningAnswer(studio,feedback,'touch');
  recordLearningAnswer(studio,{...feedback,assisted:false},'midi');
  assert.equal(studio.items['touch:'+round.current.id].due,now);
  assert.equal(studio.items['midi:'+round.current.id].due,now+DAY);
  const training={activity:'quiz',settings:normalizeTraining()};
  assert.equal(recommend(state,training,now,studio).kind,'resume');
  state.active=null;
  assert.equal(recommend(state,training,now,studio).kind,'review');
});
test('staff hints identify lines and spaces in both clefs', () => {
  const settings={...copyDefaults(),clef:'mixed',octaves:{treble:[5],bass:[2]}};
  const items=poolFor(settings);
  assert.match(noteHint(items.find(i=>i.clef==='treble'&&i.label==='C')),/^Space 3 /);
  assert.match(noteHint(items.find(i=>i.clef==='bass'&&i.label==='G')),/^Line 1 /);
});
test('Flow keeps the grid after a pitch mistake and recommends the affected bar', () => {
  const settings=normalizeTraining({ behavior:'continue', pace:'flow', bpm:120 });
  const quiz=copyDefaults();
  const tone=poolFor(quiz)[0].tones[0];
  const phrase={ rhythm:false,clef:'treble',meter:4,bars:2,totalBeats:8,events:[
    {id:0,bar:0,beat:0,durationBeats:4,tone}, {id:1,bar:1,beat:4,durationBeats:4,tone},
  ]};
  const session=new ExerciseSession(phrase,settings);session.startTime=1000;
  session.input({type:'on',channel:0,note:tone.midi+1,timeStamp:1000});
  session.input({type:'off',channel:0,note:tone.midi+1,timeStamp:3000});
  session.input({type:'on',channel:0,note:tone.midi,timeStamp:3000});
  session.input({type:'off',channel:0,note:tone.midi,timeStamp:5000});
  session.tick(5601);
  assert.equal(session.done,true);
  const result=session.summary(5601);
  result.comparison=comparisonSetup(phrase,settings,quiz);
  result.replay=saveReplay(phrase,{...settings,input:'midi'});
  assert.equal(result.retries,0);
  assert.equal(result.pitch,50);
  assert.equal(result.report.bars[0].issues.pitch,1);
  assert.equal(hardestBar(result),0);
  assert.match(renderTrainingReport(result),/Correct pitches/);
  const practice={...result,comparison:{...result.comparison,behavior:'retry-bar'}};
  assert.equal(groupSessions([result,practice],'sight').length,2);
});
