import test from 'node:test';
import assert from 'node:assert/strict';
import { CalibrationCapture } from '../js/calibration.js';

test('calibration measures a signed median and ignores count-in, duplicate taps and outliers',()=>{
  const c=new CalibrationCapture(), start=3000;
  assert.equal(c.accept(start-600,start),false);
  [42,43,41,40,45,42,38,42,44,41,200,-200].forEach((error,i)=>assert.equal(c.accept(start+i*600+error,start),true));
  assert.equal(c.accept(start+80,start),false);
  assert.equal(c.accept(start+12*600,start),false);
  assert.deepEqual(c.result(),{used:10,spread:2,offset:42});
  const early=new CalibrationCapture();
  for(let i=0;i<12;i++)early.accept(start+i*600-37,start);
  assert.equal(early.result().offset,-37);
});
test('calibration rejects sparse, inconsistent and out-of-range measurements',()=>{
  for(const errors of [[30,31],Array.from({length:12},(_,i)=>i%2?-100:100),Array(12).fill(258)]){
    const c=new CalibrationCapture();errors.forEach((error,i)=>c.accept(3000+i*600+error,3000));
    assert.equal(c.result().offset,null);
  }
});
