import assert from 'node:assert/strict';
import fs from 'node:fs';
import {TwoHandController,voiceCommand} from '../static/controls.js';
const h=(handedness,label,score=.95)=>({handedness,label,score,handednessScore:.99});
const results=[];let checks=0;function check(name,fn){fn();results.push({name,status:'Pass'});checks++;console.log('PASS',name);}
function stable(hands,side='Left'){const c=new TwoHandController();c.update(hands,0,side);return c.update(hands,400,side);}
check('Movement and camera act simultaneously',()=>{const r=stable([h('Left','Thumb_Up'),h('Right','Victory')]);assert.equal(r.move.motion,'forward');assert.deepEqual(r.look,{x:1,y:0});});
check('Hand order cannot swap roles',()=>{const r=stable([h('Right','Victory'),h('Left','Thumb_Up')]);assert.equal(r.move.motion,'forward');assert.equal(r.look.x,1);});
check('Missing camera hand does not stop movement',()=>{const r=stable([h('Left','Thumb_Up')]);assert.equal(r.move.motion,'forward');assert.deepEqual(r.look,{x:0,y:0});});
check('Missing movement hand does not stop camera',()=>{const r=stable([h('Right','Thumb_Down')]);assert.equal(r.move.motion,'stop');assert.equal(r.look.y,1);});
check('Palm stops camera without stopping character',()=>{const r=stable([h('Left','Thumb_Up'),h('Right','Open_Palm')]);assert.equal(r.move.motion,'forward');assert.deepEqual(r.look,{x:0,y:0});});
check('Swap hand preference reverses roles',()=>{const r=stable([h('Left','Thumb_Up'),h('Right','Victory')],'Right');assert.equal(r.move.motion,'right');assert.equal(r.look.y,-1);});
check('Weak or unknown gesture stops its own channel',()=>{const r=stable([h('Left','Thumb_Up'),h('Right','Victory',.5)]);assert.equal(r.move.motion,'forward');assert.deepEqual(r.look,{x:0,y:0});});
check('Hands lost stop both channels',()=>{const c=new TwoHandController();const pair=[h('Left','Thumb_Up'),h('Right','Victory')];c.update(pair,0);c.update(pair,400);const r=c.update([],500);assert.equal(r.move.motion,'stop');assert.deepEqual(r.look,{x:0,y:0});});
check('Camera hold does not trigger movement actions',()=>{const r=stable([h('Right','Pointing_Up')]);assert.equal(r.move.action,null);assert.deepEqual(r.look,{x:0,y:0});});
check('Voice camera commands and stop',()=>{for(const [a,b] of [['камера влево','look-left'],['Камера вправо!','look-right'],['камера вверх','look-up'],['камера вниз','look-down'],['камера стоп','look-stop'],['посмотри вправо','look-right']])assert.equal(voiceCommand(a),b);});
check('Voice check alias reaches puzzle verification',()=>assert.equal(voiceCommand('проверить'),'circuit-check'));
check('Voice accepts a phrase inside a longer utterance',()=>{assert.equal(voiceCommand('иди чуть вперед'),'forward');assert.equal(voiceCommand('камера стоп сейчас'),'look-stop');});
check('A brief weak frame keeps the current gesture',()=>{const c=new TwoHandController();c.update([h('Left','Thumb_Up')],0);c.update([h('Left','Thumb_Up')],200);const r=c.update([h('Left','None',.2)],280);assert.equal(r.move.motion,'forward');});
console.log(checks+' control checks passed');

fs.writeFileSync(new URL('../reports/controls-tests.json',import.meta.url),JSON.stringify({run_at:new Date().toISOString(),total:checks,checks:results},null,2));
