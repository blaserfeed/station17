import assert from 'node:assert/strict';
import {integrateMotion,WALK_SPEED,RUN_SPEED} from '../static/locomotion.js';
import {StationCollision} from '../static/collision.js';

const walk=(fps,speed)=>{
 const v={x:0,y:0};let z=0;
 for(let i=0;i<fps*3;i++)z+=integrateMotion(v,0,-speed,1/fps,11).z;
 return {z,v};
};
let checks=0;
const check=(name,run)=>{run();checks++;console.log('PASS',name);};
check('Walking covers the same distance at 10, 30, 60 and 144 FPS',()=>{
 const reference=walk(60,WALK_SPEED);
 for(const fps of [10,30,144])assert(Math.abs(walk(fps,WALK_SPEED).z-reference.z)<1e-8);
 assert(Math.abs(reference.z+WALK_SPEED*(3-(1-Math.exp(-33))/11))<1e-8);
});
check('Running is faster and also independent of frame rate',()=>{
 const reference=walk(60,RUN_SPEED);
 assert(Math.abs(reference.z+RUN_SPEED*(3-(1-Math.exp(-33))/11))<1e-8);
 assert(Math.abs(walk(10,RUN_SPEED).z-reference.z)<1e-8);
 assert(RUN_SPEED>WALK_SPEED);
});
check('Stopping distance stays consistent across frame rates',()=>{
 const stop=fps=>{const v={x:0,y:-WALK_SPEED};let z=0;for(let i=0;i<fps;i++)z+=integrateMotion(v,0,0,1/fps,14).z;return z;};
 assert(Math.abs(stop(10)-stop(144))<1e-8);assert(Math.abs(stop(60))<.26);
});
check('A long sprint frame cannot tunnel through a thin wall',()=>{
 const collision=new StationCollision([{x:0,z:0,width:8,depth:.2,bottom:0,top:3}],[-36,36,-27,27],.43);
 const p={x:0,z:1};const v={x:0,y:-RUN_SPEED};
 const step=integrateMotion(v,0,-RUN_SPEED,.15,11);collision.move(p,step.x,step.z);
 assert(p.z>=.53);assert(collision.free(p.x,p.z));
});
console.log(`${checks} locomotion checks passed`);
