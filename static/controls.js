import {defaults,loadBindings,saveBindings,canBind} from './keybindings.js';
import {OfflineVoice} from './speech.js';
export const GESTURES={Closed_Fist:'left',Victory:'right',Thumb_Up:'forward',Thumb_Down:'back',Open_Palm:'stop',Pointing_Up:'interact',ILoveYou:'jump'};
const VOICE_MAP={'влево':'left','налево':'left','вправо':'right','направо':'right','вперед':'forward','назад':'back','стой':'stop','стоп':'stop','остановись':'stop','прыжок':'jump','прыгни':'jump','действие':'interact','взаимодействовать':'interact','пауза':'pause','продолжить':'resume','подсказка':'hint','журнал':'journal','первый вариант':'choice1','вариант один':'choice1','второй вариант':'choice2','вариант два':'choice2','третий вариант':'choice3','вариант три':'choice3','поддержать сергея':'empathize','спросить сергея':'ask','показать свидетельства':'evidence','начать':'start','повторить':'retry','сменить вид':'view','прибор':'travel','портал':'travel','проверить цепь':'circuit-check','проверить':'circuit-check','собрать пазл':'circuit-check','проверить пазл':'circuit-check','камера влево':'look-left','камера вправо':'look-right','камера вверх':'look-up','камера вниз':'look-down','камера стоп':'look-stop','посмотри влево':'look-left','посмотри вправо':'look-right','посмотри вверх':'look-up','посмотри вниз':'look-down'};
const VOICE_KEYS=Object.keys(VOICE_MAP).sort((a,b)=>b.length-a.length);
export function voiceCommand(text) {
 const words=String(text).toLowerCase().replace(/ё/g,'е').replace(/[^а-яa-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();
 const matches=[];
 for(const key of VOICE_KEYS) {
  let from=0,index;
  while((index=words.indexOf(key,from))!==-1) {
   const end=index+key.length;
   if((index===0||words[index-1]===' ')&&(end===words.length||words[end]===' '))matches.push({index,end,key});
   from=index+1;
  }
 }
 // A camera phrase owns its direction word; the last separate command wins.
 const commands=matches.filter(a=>!matches.some(b=>b!==a&&b.index<=a.index&&b.end>=a.end&&(b.end-b.index>a.end-a.index)));
 commands.sort((a,b)=>b.index-a.index||b.key.length-a.key.length);
 return commands.length?VOICE_MAP[commands[0].key]:null;
}
export class GestureGate {
 constructor(hold=90,grace=450) {
  this.hold=hold;this.grace=grace;this.reset();
 }
 update(label,score,time,present=true) {
  const threshold=this.motion==='stop'?.6:.45;
  const known=!!GESTURES[label]&&score>=threshold;
  if(!present||!known) {
   if(this.motion!=='stop'&&time-this.lastGood<=this.grace)return {motion:this.motion,action:null};
   this.reset();return {motion:'stop',action:null};
  }
  if(this.label!==label){this.label=label;this.since=time;this.fired=false;}
  if(label==='Open_Palm') {
   const action=this.fired?null:'stop';this.fired=true;this.motion='stop';
   return {motion:'stop',action};
  }
  const cmd=GESTURES[label];
  // Only confirmed motion refreshes the grace period; flickering labels do not latch it.
  if(cmd===this.motion)this.lastGood=time;
  const arm=['Pointing_Up','ILoveYou'].includes(label)?240:this.hold;
  if(time-this.since<arm)return {motion:this.motion,action:null};
  const action=this.fired?null:cmd;this.fired=true;
  this.motion=['left','right','forward','back'].includes(cmd)?cmd:'stop';
  this.lastGood=time;
  return {motion:this.motion,action};
 }
 reset(){this.label=null;this.since=0;this.fired=false;this.motion='stop';this.lastGood=-Infinity;}
}
export class TwoHandController{
 constructor(){this.movement=new GestureGate();this.camera=new GestureGate();}
 reset(){this.movement.reset();this.camera.reset();}
 update(hands,time,movementHand='Left'){
  const cameraHand=movementHand==='Left'?'Right':'Left';
  const choose=side=>(hands||[]).filter(h=>h.handedness===side&&h.handednessScore>=.55).sort((a,b)=>b.score-a.score)[0];
  const m=choose(movementHand),c=choose(cameraHand);
  const move=this.movement.update(m?.label,m?.score||0,time,!!m),look=this.camera.update(c?.label,c?.score||0,time,!!c);
  return {move,look:{x:look.motion==='left'?-1:look.motion==='right'?1:0,y:look.motion==='forward'?-1:look.motion==='back'?1:0},movementLabel:m?.label||null,cameraLabel:c?.label||null,movementHand,cameraHand};
 }
}
export class Controls{
 constructor(onAction,onStatus){this.onAction=onAction;this.onStatus=onStatus;this.keys=new Set();this.bindings=loadBindings();this.captureKey=null;this.voiceMotion=null;this.voiceUntil=0;this.gestureMotion=null;this.hands=new TwoHandController();this.gate=this.hands.movement;this.movementHand=localStorage.getItem('timeless-movement-hand')==='Right'?'Right':'Left';this.gestureLook={x:0,y:0};this.gestureLookUntil=0;this.gestureMotionUntil=0;this.voiceLook={x:0,y:0};this.voiceLookUntil=0;this.generation=0;this.speech=null;this.listening=false;this.cameraOn=false;this.worker=null;this.stream=null;this.framePending=false;this.lastFrame=0;
  addEventListener('keydown',e=>{
   if(this.captureKey){
    if(!canBind(e))return;
    e.preventDefault();
    if(e.repeat)return;
    const action=this.captureKey;
    this.captureKey=null;
    const previous=this.bindings[action];
    const conflict=Object.keys(this.bindings).find(key=>this.bindings[key]===e.code);
    if(conflict)this.bindings[conflict]=previous;
    this.bindings[action]=e.code;
    saveBindings(this.bindings);
    this.onAction('binding-changed','keyboard');
    return;
   }
   if(e.metaKey||e.ctrlKey||e.altKey||['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName))return;
   const action=this.boundAction(e.code);
   if(!action)return;
   if(e.target?.matches?.('button,a,summary')&&['Enter','Space'].includes(e.code))return;
   e.preventDefault();
   this.keys.add(action);
   if(!e.repeat&&!['forward','back','left','right','sprint'].includes(action))this.onAction(action,'keyboard');
  });
  addEventListener('keyup',e=>this.keys.delete(this.boundAction(e.code)));
  addEventListener('blur',()=>this.resetMotion());document.addEventListener('visibilitychange',()=>{if(document.hidden){this.resetMotion();this.stopVoice();this.stopCamera();}});
 }
 boundAction(code){
  const exact=Object.keys(this.bindings).find(action=>this.bindings[action]===code);
  if(exact)return exact;
  const arrows={ArrowUp:'forward',ArrowDown:'back',ArrowLeft:'left',ArrowRight:'right',ShiftRight:'sprint'};
  const action=arrows[code];
  return this.bindings[action]===defaults[action]?action:undefined;
 }
 resetBindings(){
  this.captureKey=null;
  this.bindings={...defaults};
  saveBindings(this.bindings);
  this.resetMotion();
 }
 motion(){if(this.keys.size){const x=Number(this.keys.has('right'))-Number(this.keys.has('left'));const z=Number(this.keys.has('back'))-Number(this.keys.has('forward'));if(x||z)return {x,z,source:'keyboard'};}const now=performance.now(),voiceOn=!!this.voiceMotion&&this.voiceMotion!=='stop'&&now<this.voiceUntil,gestureOn=!!this.gestureMotion&&this.gestureMotion!=='stop'&&now<this.gestureMotionUntil;if(this.cameraOn&&gestureOn)return {x:this.gestureMotion==='left'?-1:this.gestureMotion==='right'?1:0,z:this.gestureMotion==='forward'?-1:this.gestureMotion==='back'?1:0,source:'gesture'};if(voiceOn)return {x:this.voiceMotion==='left'?-1:this.voiceMotion==='right'?1:0,z:this.voiceMotion==='forward'?-1:this.voiceMotion==='back'?1:0,source:'voice'};return {x:0,z:0,source:'keyboard'};}
 lookMotion(){const now=performance.now();if(now<this.voiceLookUntil)return this.voiceLook;if(this.cameraOn&&now<this.gestureLookUntil)return this.gestureLook;return {x:0,y:0};}
 swapHands(){this.movementHand=this.movementHand==='Left'?'Right':'Left';localStorage.setItem('timeless-movement-hand',this.movementHand);this.hands.reset();this.resetMotion();this.showHandRoles();}
 showHandRoles(){const r=document.getElementById('gesture-roles');if(r)r.textContent=this.movementHand==='Left'?'Левая — персонаж · правая — камера':'Правая — персонаж · левая — камера';}
 resetMotion(){this.gestureLook={x:0,y:0};this.gestureLookUntil=0;this.voiceLookUntil=0;this.gestureMotionUntil=0;this.hands.reset();this.keys.clear();this.voiceMotion=null;this.voiceUntil=0;this.gestureMotion=null;}
 command(cmd,source){if(cmd.startsWith('look-')){this.voiceLook={x:cmd==='look-left'?-1:cmd==='look-right'?1:0,y:cmd==='look-up'?-1:cmd==='look-down'?1:0};this.voiceLookUntil=cmd==='look-stop'?0:performance.now()+1600;this.onAction(cmd,source);return;}if(cmd==='stop'&&source==='voice'){this.voiceLookUntil=0;this.gestureLook={x:0,y:0};}if(cmd==='stop'){this.voiceUntil=0;this.voiceMotion=null;this.gestureMotion=null;}if(['left','right','forward','back','stop'].includes(cmd)){if(source==='voice'&&cmd!=='stop'){this.voiceMotion=cmd;this.voiceUntil=Infinity;}this.onAction('navigate-'+cmd,source);}else this.onAction(cmd,source);}
 voiceSupported(){return !!(window.AudioContext&&window.WebAssembly&&navigator.mediaDevices?.getUserMedia);}
 async toggleVoice(){if(this.speech){this.stopVoice();return;}if(!this.voiceSupported()){this.onStatus('voice','Для голоса нужны современный браузер и адрес localhost или HTTPS.',false);return;}const voice=new OfflineVoice((text,confidence,partial)=>{const cmd=voiceCommand(text);if(partial&&!cmd)return;const now=performance.now();if(cmd&&cmd===this.lastVoiceCmd&&now-(this.lastVoiceAt||0)<700)return;if(cmd){this.lastVoiceCmd=cmd;this.lastVoiceAt=now;}this.onStatus('voice',cmd?'Услышано: '+text:'Команда не распознана: '+text,true);if(cmd)this.command(cmd,'voice');},(text,listening)=>{if(this.speech!==voice)return;this.listening=listening;if(!listening&&(text.startsWith('Голос недоступен')||text.startsWith('Разрешите')))this.speech=null;this.onStatus('voice',text,listening||text.startsWith('Загружается'));});this.speech=voice;await voice.start();}
 stopVoice(){const voice=this.speech;if(voice)voice.stop();this.speech=null;this.listening=false;this.voiceUntil=0;this.voiceLookUntil=0;this.onStatus('voice','Микрофон выключен.',false);}
 async toggleCamera(){if(this.cameraOn||this.worker){this.stopCamera();return;}const gen=++this.generation;this.onStatus('gesture','Загрузка модели жестов…',true);const panel=document.getElementById('camera-panel');panel.hidden=false;this.showHandRoles();
  try{
   if(!navigator.mediaDevices?.getUserMedia)throw new Error('Камера доступна только на localhost или HTTPS.');
   const worker=new Worker('/gesture-worker.js');this.worker=worker;
   await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Модель не успела загрузиться. Попробуйте ещё раз.')),30000);worker.onmessage=e=>{if(e.data.type==='ready'){clearTimeout(timer);resolve();}else if(e.data.type==='error'){clearTimeout(timer);reject(new Error(e.data.message));}};worker.onerror=e=>{clearTimeout(timer);reject(new Error(e.message));};worker.postMessage({type:'init'});});
   if(gen!==this.generation)return;
   const stream=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:480},height:{ideal:360},frameRate:{ideal:24,max:30},facingMode:'user'},audio:false});
   if(gen!==this.generation){stream.getTracks().forEach(t=>t.stop());return;}this.stream=stream;const video=document.getElementById('camera');video.srcObject=stream;await video.play();this.cameraOn=true;this.onStatus('gesture','Покажите обе руки. Одной двигайтесь, второй вращайте камеру.',true);
   worker.onmessage=e=>{if(gen!==this.generation)return;if(e.data.type==='result'){this.framePending=false;const now=performance.now(),freshness=Math.max(700,Math.min(2000,(now-this.frameStarted)*2+200)),out=this.hands.update(e.data.hands||[],now,this.movementHand);this.gestureMotion=out.move.motion;this.gestureMotionUntil=now+freshness;if(out.move.action)this.command(out.move.action,'gesture');this.gestureLook=out.look;this.gestureLookUntil=now+freshness;this.onStatus('gesture','Персонаж: '+this.labelName(out.movementLabel)+' · Камера: '+this.cameraLabelName(out.cameraLabel),true);}else if(e.data.type==='error'){this.framePending=false;this.stopCamera();this.onStatus('gesture',e.data.message,false);}};
   const loop=async now=>{if(gen!==this.generation||!this.cameraOn)return;requestAnimationFrame(loop);if(this.framePending||now-this.lastFrame<65||video.readyState<2)return;this.lastFrame=now;this.framePending=true;this.frameStarted=performance.now();try{const image=await createImageBitmap(video,{resizeWidth:480,resizeHeight:360,resizeQuality:'low'});if(gen!==this.generation){image.close();return;}worker.postMessage({type:'frame',image,time:now},[image]);}catch(e){this.framePending=false;}};requestAnimationFrame(loop);
  }catch(e){if(gen===this.generation){this.stopCamera();this.onStatus('gesture','Жесты недоступны: '+e.message,false);}}
 }
 cameraLabelName(s){return {Closed_Fist:'влево',Victory:'вправо',Thumb_Up:'вверх',Thumb_Down:'вниз',Open_Palm:'стоп',Pointing_Up:'стоп',ILoveYou:'стоп'}[s]||'рука не видна';}
 labelName(s){return {Closed_Fist:'Кулак — влево',Victory:'Два пальца — вправо',Thumb_Up:'Большой палец вверх — вперёд',Thumb_Down:'Большой палец вниз — назад',Open_Palm:'ладонь — стоп',Pointing_Up:'Указательный палец — действие',ILoveYou:'Мизинец и указательный — прыжок',None:'Жест не распознан'}[s]||'рука не видна';}
 stopCamera(){this.generation++;this.cameraOn=false;this.gestureMotion=null;this.gestureLook={x:0,y:0};this.gestureLookUntil=0;this.gestureMotionUntil=0;this.hands.reset();if(this.worker){this.worker.terminate();this.worker=null;}if(this.stream){this.stream.getTracks().forEach(t=>t.stop());this.stream=null;}const v=document.getElementById('camera');if(v){v.srcObject=null;document.getElementById('camera-panel').hidden=true;}this.framePending=false;this.onStatus('gesture','Камера выключена.',false);}
}
