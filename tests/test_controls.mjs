import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Controls,GestureGate,TwoHandController,voiceCommand} from '../static/controls.js';
import {VOICE_PHRASES} from '../static/speech.js';
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
check('Hands lost stop both channels after a short tracking grace',()=>{const c=new TwoHandController();const pair=[h('Left','Thumb_Up'),h('Right','Victory')];c.update(pair,0);c.update(pair,400);const r=c.update([],900);assert.equal(r.move.motion,'stop');assert.deepEqual(r.look,{x:0,y:0});});
check('Camera hold does not trigger movement actions',()=>{const r=stable([h('Right','Pointing_Up')]);assert.equal(r.move.action,null);assert.deepEqual(r.look,{x:0,y:0});});
check('Voice camera commands and stop',()=>{for(const [a,b] of [['камера влево','look-left'],['Камера вправо!','look-right'],['камера вверх','look-up'],['камера вниз','look-down'],['камера стоп','look-stop'],['посмотри вправо','look-right']])assert.equal(voiceCommand(a),b);});
check('Voice check alias reaches puzzle verification',()=>assert.equal(voiceCommand('проверить'),'circuit-check'));
check('Voice accepts a phrase inside a longer utterance',()=>{assert.equal(voiceCommand('иди чуть вперед'),'forward');assert.equal(voiceCommand('камера стоп сейчас'),'look-stop');});
check('A brief weak frame keeps the current gesture',()=>{const c=new TwoHandController();c.update([h('Left','Thumb_Up')],0);c.update([h('Left','Thumb_Up')],200);const r=c.update([h('Left','None',.2)],280);assert.equal(r.move.motion,'forward');});
check('Forward vocabulary includes the actual Russian model spelling',()=>{assert(VOICE_PHRASES.includes('вперёд'));for(const text of ['вперёд','ВПЕРЕД!','иди вперёд','Анна, пожалуйста, вперёд'])assert.equal(voiceCommand(text),'forward');});
check('The last command wins without splitting camera phrases',()=>{assert.equal(voiceCommand('вперёд стой'),'stop');assert.equal(voiceCommand('вперёд камера влево'),'look-left');assert.equal(voiceCommand('камера влево стоп'),'stop');assert.equal(voiceCommand('камера стоп'),'look-stop');});
check('Words containing commands do not trigger movement',()=>{for(const text of ['впереди','направоход','постойте','перестойка'])assert.equal(voiceCommand(text),null);});
check('Gesture begins within two normal camera frames',()=>{const c=new GestureGate();c.update('Thumb_Up',.9,0);assert.equal(c.update('Thumb_Up',.9,100).motion,'forward');});
check('A short lost frame does not interrupt a held gesture',()=>{const c=new GestureGate();c.update('Thumb_Up',.9,0);c.update('Thumb_Up',.9,100);assert.equal(c.update(null,0,250,false).motion,'forward');assert.equal(c.update('Thumb_Up',.8,330).motion,'forward');});
check('A held gesture tolerates weaker recognition without repeated stops',()=>{const c=new GestureGate();c.update('Thumb_Up',.9,0);c.update('Thumb_Up',.9,100);for(let t=200;t<15000;t+=100)assert.equal(c.update('Thumb_Up',.52,t).motion,'forward');});
check('Palm stops immediately and missing hands cannot latch movement',()=>{const c=new GestureGate();c.update('Thumb_Up',.9,0);c.update('Thumb_Up',.9,100);assert.equal(c.update('Open_Palm',.9,120).motion,'stop');c.update('Thumb_Up',.9,200);c.update('Thumb_Up',.9,300);assert.equal(c.update(null,0,751,false).motion,'stop');});
const controller=()=>Object.assign(Object.create(Controls.prototype),{keys:new Set(),onAction:()=>{},voiceMotion:null,voiceUntil:0,cameraOn:false,gestureMotion:null,gestureMotionUntil:0,gestureLookUntil:0});
check('Voice movement continues until stop rather than expiring',()=>{const c=controller();c.command('forward','voice');assert.equal(c.voiceUntil,Infinity);assert.deepEqual(c.motion(),{x:0,z:-1,source:'voice'});c.command('stop','voice');assert.equal(c.motion().z,0);});
check('Movement freshness is independent of the camera channel',()=>{const c=controller();Object.assign(c,{cameraOn:true,gestureMotion:'forward',gestureMotionUntil:Infinity,gestureLookUntil:0});assert.equal(c.motion().z,-1);c.gestureMotionUntil=0;assert.equal(c.motion().z,0);});
check('Idle controls do not claim gesture input',()=>assert.equal(controller().motion().source,'keyboard'));
console.log(checks+' control checks passed');

fs.writeFileSync(new URL('../reports/controls-tests.json',import.meta.url),JSON.stringify({run_at:new Date().toISOString(),total:checks,checks:results},null,2));
