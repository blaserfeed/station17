import assert from 'node:assert/strict';
import {gaitAdvance,WALK_SPEED,RUN_SPEED,CLIP_FOOTFALLS,WALK_CYCLE_SECONDS} from '../static/locomotion.js';

function cadence(speed,running,fps){
 let phase=0;
 for(let i=0;i<fps*6;i++)phase+=gaitAdvance(1/fps,speed/fps,running);
 return phase*CLIP_FOOTFALLS/6;
}
let checks=0;
const check=(name,run)=>{run();checks++;console.log('PASS',name);};
check('The four-step walking clip stays near 2 steps per second',()=>{
 const steps=cadence(WALK_SPEED,0,60);assert(steps>1.95&&steps<2.04);
});
check('Running stays keeps its own cadence near 2.13 steps per second rather than rapid cycling',()=>{
 const steps=cadence(RUN_SPEED,1,60);assert(steps>2.1&&steps<2.18);
});
check('Animation cadence is consistent at 10, 30, 60 and 144 FPS',()=>{
 for(const [speed,running] of [[WALK_SPEED,0],[RUN_SPEED,1]]){
  const reference=cadence(speed,running,60);
  for(const fps of [10,30,144])assert(Math.abs(cadence(speed,running,fps)-reference)<1e-9);
 }
});
check('Standing or pressing into a wall does not play steps',()=>{
 assert.equal(gaitAdvance(1/60,0,0),0);assert.equal(gaitAdvance(1/60,0,1),0);
});
check('A brief speed spike cannot fast-forward the source animation',()=>{
 const walkSeconds=WALK_CYCLE_SECONDS;
 assert(gaitAdvance(1/60,100,0)*walkSeconds/(1/60)<=1+1e-10);
});
console.log(`${checks} gait timing checks passed`);
