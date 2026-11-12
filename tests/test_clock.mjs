import assert from 'node:assert/strict';
import {GameClock} from '../static/clock.js';

globalThis.document={getElementById:()=>null};
const game=()=>({game:{phase:'explore',timer:{remaining:1500,running:false,started_at:null}}});
let checks=0;
async function check(name,run){await run();checks++;console.log('PASS',name);}
await check('Failed clock requests back off instead of looping',async()=>{
 const state=game();let calls=0;
 const clock=new GameClock(()=>state,async()=>{calls++;return null;},()=>{});
 clearInterval(clock.interval);
 clock.wants=true;await clock.request('clock',{running:true});
 for(let i=0;i<120;i++)clock.update();
 assert.equal(calls,1);assert(clock.retryAt>performance.now());
});
await check('Rejected requests also release the pending lock and back off',async()=>{
 const clock=new GameClock(game,async()=>{throw Error('offline');},()=>{});
 clearInterval(clock.interval);await clock.request('tick');
 assert.equal(clock.pending,false);assert(clock.retryAt>performance.now());
});
await check('Pausing during an in-flight resume preserves the latest intent',async()=>{
 const state=game(),calls=[];let complete;
 const clock=new GameClock(()=>state,(kind,payload)=>{
  calls.push(payload.running);
  if(calls.length===1)return new Promise(resolve=>{complete=()=>{state.game.timer.running=true;resolve(state);};});
  state.game.timer.running=false;return Promise.resolve(state);
 },()=>{});
 clearInterval(clock.interval);
 clock.sync(true);clock.sync(false);complete();
 await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(calls,[true,false]);assert.equal(state.game.timer.running,false);
});
await check('A paused timer never subtracts offline time',async()=>{
 const state=game();state.game.timer.remaining=1234;state.game.timer.started_at=0;
 const clock=new GameClock(()=>state,async()=>null,()=>{});
 clearInterval(clock.interval);assert.equal(clock.remaining(),1234);
});
console.log(`${checks} clock checks passed`);
