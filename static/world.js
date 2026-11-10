import * as THREE from './vendor/three.module.js';
import { StationCollision } from './collision.js';
import { person, animatePerson, footShadow, placeFootShadow, JUMP, WALK_SPEED, RUN_SPEED } from './people.js';
import { metal, casing, cylinder, pipe, generator, vessel, bench, chair, deskLamp,
  plant, valveBank, emergencyConsole, reel, rotorBlade, dressing, roof } from './industrial.js';

const mat=(color,opts={})=>new THREE.MeshStandardMaterial({color,roughness:.85,...opts});
function mesh(geo,material,parent,pos=[0,0,0],scale){const m=new THREE.Mesh(geo,material);m.position.set(...pos);if(scale)m.scale.set(...scale);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
function box(p,size,pos,m){return mesh(new THREE.BoxGeometry(...size),m,p,pos);}
function label(text,color='#20374a',width=384){const c=document.createElement('canvas');c.width=width;c.height=72;const ctx=c.getContext('2d');ctx.fillStyle='#fffdf5f0';ctx.fillRect(0,0,width,72);ctx.fillStyle=color;let fontSize=27;ctx.font='600 '+fontSize+'px system-ui';while(ctx.measureText(text).width>width-24&&fontSize>13){fontSize--;ctx.font='600 '+fontSize+'px system-ui';}ctx.textAlign='center';ctx.fillText(text,width/2,46);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;const s=new THREE.Sprite(new THREE.SpriteMaterial({map:t,transparent:true,depthTest:true}));s.scale.set(1.8,.34,1);return s;}
function floorTexture(stage){const c=document.createElement('canvas');c.width=c.height=512;const x=c.getContext('2d');x.fillStyle=['#b8b3a1','#aab9b4','#edf5f4'][stage];x.fillRect(0,0,512,512);let seed=49;const rand=()=>{seed=(seed*16807)%2147483647;return seed/2147483647;};for(let i=0;i<6000;i++){const a=rand(),b=rand();x.fillStyle=`rgba(70,61,47,${rand()*.07})`;x.fillRect(a*512,b*512,stage===0?2+rand()*32:1,1);}x.strokeStyle=stage===0?'#b49b7d':'#a6b6b1';x.lineWidth=1.2;for(let i=0;i<=512;i+=64){x.beginPath();x.moveTo(0,i);x.lineTo(512,i);x.stroke();for(let j=0;j<512;j+=128){const at=j+(i%128?64:0);x.beginPath();x.moveTo(at,i);x.lineTo(at,i+64);x.stroke();}}const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(4,4);t.anisotropy=8;return t;}
function surface(parent,pos,size,title,lines=[],future=false,rotation=0){
 const c=document.createElement('canvas');c.width=768;c.height=512;const ctx=c.getContext('2d');ctx.fillStyle=future?'#0e3947':'#f1e7cc';ctx.fillRect(0,0,768,512);ctx.fillStyle=future?'#83e1d9':'#36544b';ctx.fillRect(28,26,712,4);ctx.font='600 29px system-ui';ctx.fillText(title,32,82);ctx.font='22px system-ui';let y=135;for(const line of lines){ctx.fillStyle=future?'#c1eae7':'#5a6558';ctx.fillText(line,32,y);y+=43;}if(future){ctx.strokeStyle='#438f9d';ctx.lineWidth=2;ctx.beginPath();for(let x=30;x<740;x++){const y=410+Math.sin(x*.026)*25+Math.sin(x*.051)*8;x===30?ctx.moveTo(x,y):ctx.lineTo(x,y);}ctx.stroke();}const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;const plane=mesh(new THREE.PlaneGeometry(...size),new THREE.MeshBasicMaterial({map:tex}),parent,pos);plane.rotation.y=rotation;plane.castShadow=false;return plane;
}
function detailsBatch(parent,entries){const inst=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),mat(0xffffff),entries.length),dummy=new THREE.Object3D();entries.forEach((e,i)=>{dummy.position.set(e[0],e[1],e[2]);dummy.scale.set(e[3],e[4],e[5]);dummy.rotation.set(0,e[7]||0,0);dummy.updateMatrix();inst.setMatrixAt(i,dummy.matrix);inst.setColorAt(i,new THREE.Color(e[6]));});inst.receiveShadow=true;inst.castShadow=false;parent.add(inst);return inst;}
export class World{
 constructor(container,events){
  this.events=events;this.container=container;  this.scene=new THREE.Scene();this.scene.background=new THREE.Color(0xc5e6f5);this.scene.fog=new THREE.Fog(0xd7e7ee,64,158);
  this.renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.05;container.appendChild(this.renderer.domElement);
  this.camera=new THREE.PerspectiveCamera(63,1,.08,180);this.camera.position.set(17,15,21);this.camera.lookAt(0,0,0);
  this.scene.add(new THREE.HemisphereLight(0xe7f4ff,0x9a927e,1.45));this.sun=new THREE.DirectionalLight(0xfff1d6,2.15);this.sun.position.set(-13,22,14);this.sun.castShadow=true;this.sun.shadow.mapSize.set(2048,2048);this.sun.shadow.radius=2.5;Object.assign(this.sun.shadow.camera,{left:-28,right:28,top:28,bottom:-28,far:78});this.sun.shadow.bias=-.00045;this.sun.shadow.normalBias=.04;this.scene.add(this.sun);const fill=new THREE.DirectionalLight(0xd7e8ff,.42);fill.position.set(18,12,-10);this.scene.add(fill);
  this.level=new THREE.Group();this.scene.add(this.level);this.player=person('anna');this.scene.add(this.player);this.player.position.set(-2,0,21);this.npc=person('sergey');this.scene.add(this.npc);this.npc.position.set(0,0,17);this.npc.rotation.y=-.48;
  this.playerShadow=footShadow();this.npcShadow=footShadow();this.scene.add(this.playerShadow,this.npcShadow);
  this.clock=new THREE.Clock();this.input={x:0,z:0};this.active=false;this.inGame=false;this.elapsed=0;this.hurtUntil=0;this.hitCooldown=0;this.pendingPick=new Set();this.lastCollect=0;this.mode=localStorage.getItem('station17-view')==='first'?'first':'third';this.yaw=Math.PI/4;this.pitch=.12;this.distance=3.55;this.cameraReady=false;this.drag=false;this.loadDemo();
  this.targetYaw=this.yaw;this.targetPitch=this.pitch;this.collision=new StationCollision([],[-36,36,-27,27],.43);this.velocity=new THREE.Vector2();this.travelled=0;this.jumpAge=null;this.fallbackLook=false;this.wantsLook=false;this.capturePending=false;
  const canvas=this.renderer.domElement;
  canvas.addEventListener('click',()=>this.captureLook());
  canvas.addEventListener('contextmenu',e=>e.preventDefault());
  document.addEventListener('pointerlockchange',()=>{if(document.pointerLockElement===canvas){this.fallbackLook=false;this.wantsLook=true;}else if(this.wantsLook&&this.active){this.wantsLook=false;this.events.lookPaused?.();}});
  addEventListener('mousemove',e=>{if(!this.active||!(document.pointerLockElement===canvas||(this.fallbackLook&&e.target===canvas)))return;this.targetYaw+=e.movementX*.0024;this.targetPitch=THREE.MathUtils.clamp(this.targetPitch+e.movementY*.002,-.65,1.05);});
  canvas.addEventListener('wheel',e=>{if(this.active&&this.mode==='third'){this.distance=THREE.MathUtils.clamp(this.distance+e.deltaY*.003,2,6);e.preventDefault();}},{passive:false});
  addEventListener('resize',()=>this.resize());this.resize();this.tick=this.tick.bind(this);requestAnimationFrame(this.tick);
 }
 loadDemo(){this.build({stage:0,run_id:'preview',epoch:{clues:[],terminals:[],hazards:[]},walls:[[-12,-22.5,.7,9],[-12,-2,.7,16],[-12,20.5,.7,13],[12,-22.5,.7,9],[12,-2,.7,16],[12,20.5,.7,13],[-32,0,8,.7],[-17,0,10,.7],[17,0,10,.7],[32,0,8,.7],[-3,-12,5,5],[3,1,5,5],[-3,11,5,5]],repairs:{valve:false},director:{mode:'обычный'},found:[],activated:[],position:[-2,21]});}
 resize(){this.renderer.setSize(innerWidth,innerHeight);this.camera.aspect=innerWidth/innerHeight;this.camera.updateProjectionMatrix();}
 setMode(mode){this.mode=mode==='first'?'first':'third';localStorage.setItem('station17-view',this.mode);this.camera.fov=this.mode==='first'?76:63;this.camera.updateProjectionMatrix();this.cameraReady=false;if(this.inGame)this.player.visible=this.mode!=='first';}
 toggleView(){this.setMode(this.mode==='first'?'third':'first');return this.mode;}
 setActive(v){this.active=v;if(!v){this.input={x:0,z:0};this.velocity?.set(0,0);}}
 async captureLook(){if(!this.active||this.capturePending||document.pointerLockElement===this.renderer.domElement)return;this.capturePending=true;this.wantsLook=true;try{if(!this.renderer.domElement.requestPointerLock)throw new Error('Pointer lock unavailable');await this.renderer.domElement.requestPointerLock();if(document.pointerLockElement!==this.renderer.domElement)this.fallbackLook=true;}catch(e){this.fallbackLook=true;}finally{this.capturePending=false;}}
 releaseLook(){this.wantsLook=false;this.fallbackLook=false;if(document.pointerLockElement===this.renderer.domElement)document.exitPointerLock?.();}
 sync(g){
  if(!g)return;
  const key=[g.run_id,g.stage,g.attempt,g.visits[g.stage]].join(':');
  const changedRoom=this.key!==key;
  const changedRepair=this.repairsKey!==JSON.stringify(g.repairs);
  const doorChanged=this.game?.safe_open!==g.safe_open;
  const newRun=this.game?.run_id!==g.run_id;
  if(changedRoom||changedRepair)this.build(g);
  if(changedRoom||changedRepair||doorChanged){
   this.cameraReady=false;
   this.collision=new StationCollision(g.solids||[],g.bounds,g.player_radius||.43);
   const p=this.player.position;
   if(changedRoom||!this.collision.free(p.x,p.z)){
    p.set(g.position[0],0,g.position[1]);
    this.velocity.set(0,0);this.travelled=0;this.jumpAge=null;this.cameraReady=false;
   }
   if(changedRoom){
    if(newRun){this.yaw=Math.PI/4;this.pitch=.12;}
    this.targetYaw=this.yaw;this.targetPitch=this.pitch;
    this.player.rotation.y=Math.PI-this.yaw;
    if(this.player.userData.rig)this.player.userData.rig.phase=0;
   }
  }
  this.key=key;this.game=g;
  if(this.safeDoor)this.safeDoor.rotation.y=g.safe_door_angle??(g.safe_open?-1.25:0);
  if(this.caseReel)this.caseReel.visible=!g.inventory.includes('fatherlog');
 }
 build(g){
  const oldMaterials=new Set(),oldTextures=new Set();for(const c of [...this.level.children]){this.level.remove(c);c.traverse(o=>{if(o.isInstancedMesh)o.dispose();o.geometry?.dispose();for(const m of Array.isArray(o.material)?o.material:o.material?[o.material]:[]){oldMaterials.add(m);if(m.map)oldTextures.add(m.map);}});}oldMaterials.forEach(m=>m.dispose());oldTextures.forEach(t=>t.dispose());
  this.game=g;this.repairsKey=JSON.stringify(g.repairs);this.machineRotors=[];this.machineLights=[];this.pickups=new Map();this.terminals=new Map();this.hazards=[];
  const stage=g.stage,plaster=mat([0xe7debf,0xdbe3d5,0xe9f2f0][stage]),base=mat([0x7e9985,0x608c86,0x83b5ba][stage]),wood=mat([0x937251,0x9c8d70,0xd5dfdc][stage]),steel=mat(0x677f7f,{metalness:.35}),paper=mat(0xf8efd2),orange=mat(0xdb9646);
  this.scene.background.setHex([0xc6e5f0,0xc5e5f3,0xc9e9ed][stage]);this.scene.fog.near=78;this.scene.fog.far=188;this.scene.fog.color.copy(this.scene.background);this.sun.intensity=2.45;this.sun.position.set(-28,38,16);this.sun.color.setHex([0xffebc5,0xfff1dd,0xe4f3ec][stage]);Object.assign(this.sun.shadow.camera,{left:-48,right:48,top:42,bottom:-42,far:120});this.sun.shadow.camera.updateProjectionMatrix();
  box(this.level,[240,.25,220],[0,-.8,0],mat(0x94b27e));box(this.level,[150,.08,40],[0,-.55,-58],mat(0x71b6c2,{roughness:.2,metalness:.15}));
  for(let i=0;i<14;i++){const x=(i-7)*12,z=-85-(i%3)*6,h=14+(i*7%19);mesh(new THREE.ConeGeometry(19,h,7),mat(i%2?0xa5b9ba:0x94afb0),this.level,[x,h/2-1,z]).castShadow=false;}
  for(let i=0;i<18;i++){const x=-70+(i%9)*17,z=i<9?40:-38;if(Math.abs(x)<42)continue;mesh(new THREE.CylinderGeometry(.22,.35,3,7),mat(0x8d7960),this.level,[x,.8,z]);mesh(new THREE.SphereGeometry(2.5,10,8),mat(i%2?0x7b9c66:0x92b173),this.level,[x,4,z],[1,1.3,1]);}
  box(this.level,[74,.5,56],[0,-.3,0],mat(0xa9ad9e));const tex=floorTexture(stage);tex.repeat.set(7,5);box(this.level,[72,.08,54],[0,-.02,0],mat(0xffffff,{map:tex,bumpMap:tex,bumpScale:.021,roughness:.93}));
  // Real room openings connect four wings to a tall turbine hall.
  const wallBox=(sz,pos,m)=>box(this.level,sz,pos,m);
  for(const z of [-27.2,27.2]){wallBox([73,2.1,.45],[0,1,z],plaster);wallBox([73,1.25,.45],[0,5.9,z],plaster);box(this.level,[73,.12,.5],[0,2.12,z],base);for(let x=-36;x<=36;x+=8){wallBox([.55,4.2,.55],[x,3.6,z],plaster);box(this.level,[7.5,.08,.16],[x+4,3.6,z],steel);box(this.level,[.09,3.2,.16],[x+4,3.75,z],steel);}}
  for(const x of [-36.2,36.2]){wallBox([.45,2.1,54],[x,1,0],plaster);wallBox([.45,1.25,54],[x,5.9,0],plaster);for(let z=-24;z<=24;z+=8){wallBox([.55,4.2,.55],[x,3.6,z],plaster);box(this.level,[.16,.08,7.5],[x,3.6,z+4],steel);box(this.level,[.16,3.2,.09],[x,3.75,z+4],steel);}}
  const turbines=g.layout?.turbines||[[-3,-12],[3,1],[-3,11]];
  const future=stage===2, dark=metal(0x425753), piping=metal([0x82968a,0x8d9a95,0x8cb4bb][stage]);
  // The overhead services follow the hall, leaving all passage widths intact.
  for(const side of [-1,1]){
   const x=side*10.35;
   for(let lane=0;lane<2;lane++){
    const y=3.18+lane*.36;
    pipe(this.level,[[x,5,-25.8],[x,y,-25.8],[x,y,24.9],[x,5,24.9]],lane?.095:.155,piping,.62);
    for(const z of [-22,-14,-6,2,10,18,22]){
     const collar=cylinder(this.level,lane?.138:.202,.09,[x,y,z],dark);
     collar.rotation.x=Math.PI/2;
    }
   }
   for(const z of [-23,-15,-7,1,9,17,23]){
    const light=casing(this.level,[.27,.14,2.25],[side*8.9,7.8,z],dark,.05);
    light.castShadow=false;
    casing(this.level,[.19,.024,2.08],[side*8.9,7.718,z],mat(0xfff9e2,{emissive:future?0xabf1eb:0xffedc9,emissiveIntensity:.43}),.01).castShadow=false;
   }
  }
  for(const [x,z,w,d] of g.walls){if(turbines.some(p=>p[0]===x&&p[1]===z)||w===6&&x===-25&&z===0||w===.7&&d===4.2||w===3&&d===1.5)continue;if(w===1&&d>=7){const rack=stage===2?mat(0xc7dedd):wood;wallBox([.12,2.4,d],[x-.45,1.2,z],rack);for(const y of [.12,.7,1.28,1.86,2.44])wallBox([1.04,.07,d],[x,y,z],rack);for(let dz=-d/2;dz<=d/2;dz+=1.5)wallBox([1.0,2.4,.06],[x,1.2,z+dz],rack);const contents=[];for(let dz=-d/2+.25;dz<d/2-.2;dz+=.4)for(const y of [.4,.98,1.56,2.14])contents.push([x+.1,y,z+dz,.65,.4,.28,stage===2?0x9bbbc1:stage===1?0x788c83:0xb4a278]);detailsBatch(this.level,contents);continue;}const tall=w<1||d<1;const h=tall?3.8:1.8;wallBox([w,h,d],[x,h/2-.02,z],tall?plaster:wood);box(this.level,[w+.04,.13,d+.04],[x,tall?.95:1.84,z],base);}
  // Side-wing roofs leave the central machinery hall open to clerestory light.
  for(const x of [-24,24]){wallBox([24,.24,54],[x,4.12,0],mat(0xcbd2bf));for(let z=-24;z<27;z+=8)box(this.level,[23,.25,.2],[x,3.85,z],steel);}
  for(let z=-24;z<=24;z+=12){for(const x of [-10.8,10.8])wallBox([.7,8.5,.7],[x,4.2,z],mat(0xaeb8a9));box(this.level,[22,.25,.3],[0,8.3,z],steel);for(const x of [-7,0,7]){const brace=box(this.level,[.12,2.1,.12],[x,7.3,z],steel);brace.rotation.z=x<0?-.65:.65;}}
  const sign=(text,pos,w=3.2)=>{const l=label(text);l.position.set(...pos);l.scale.set(w,w*.19,1);this.level.add(l);return l;};
  const wallSign=(text,pos,rot,w=3.2)=>{const s=label(text);const m=new THREE.MeshBasicMaterial({map:s.material.map});const b=mesh(new THREE.PlaneGeometry(w,w*.19),m,this.level,pos);b.rotation.y=rot;b.castShadow=false;return b;};
  for(const x of [-12,12])for(const z of [-14,10])wallBox([.7,.65,8],[x,3.65,z],plaster);
  const skylight=mat(0xb6d8de,{transparent:true,opacity:.24,depthWrite:false,roughness:.18,side:THREE.DoubleSide});
  box(this.level,[7.73,.03,54],[0,8.56,0],skylight).castShadow=false;
  const window=mat(stage===2?0xb5d9df:0xb2c7c3,{transparent:true,opacity:.31,depthWrite:false,roughness:.2,side:THREE.DoubleSide});
  roof(this.level,stage,steel,window);
  sign('СТАНЦИЯ 17 · '+[1978,2026,2074][stage],[0,4.8,-26.5],7);wallSign('АРХИВ',[-11.6,3.5,-14],Math.PI/2,3);wallSign('МАСТЕРСКАЯ',[-11.6,3.5,10],Math.PI/2,3.5);wallSign('ТУРБИННЫЙ ЗАЛ',[11.6,3.5,-14],-Math.PI/2,4);wallSign('ДИСПЕТЧЕРСКАЯ',[11.6,3.5,10],-Math.PI/2,4);
  // Painted paths and practical props give the large building a readable layout.
  for(const x of [-8,8])box(this.level,[.08,.012,49],[x,.035,0],orange);
  for(const [x,z] of turbines){
   if(future)cylinder(this.level,2.45,.6,[x,.3,z],metal(0xb0c7c9),2.54,48);
   if(stage===2){
    mesh(new THREE.CylinderGeometry(2.0,2.0,4.2,32,1,true),mat(0xaedce3,{transparent:true,opacity:.16,depthWrite:false,roughness:.12,metalness:.25}),this.level,[x,2.6,z]);
    for(const y of [.7,2.1,4.5]){const ring=mesh(new THREE.TorusGeometry(2.05,.11,8,48),mat(0x7cb7bf,{metalness:.6,roughness:.25}),this.level,[x,y,z]);ring.rotation.x=Math.PI/2;}
    const column=metal(0x54767d,.39), shaft=metal(0x587d85,.25);
    for(let k=0;k<4;k++){
     const a=Math.PI/4+k*Math.PI/2, dx=2.05*Math.sin(a), dz=2.05*Math.cos(a);
     pipe(this.level,[[x+dx,.55,z+dz],[x+dx,4.15,z+dz],[x+dx*.86,4.6,z+dz*.86]],.082,column,.24);
     cylinder(this.level,.143,.14,[x+dx,.65,z+dz],steel,.143,12);
    }
    cylinder(this.level,.24,4.05,[x,2.53,z],shaft,.27,24);
    cylinder(this.level,.58,.18,[x,4.55,z],column,.58,32);
    const rotor=new THREE.Group();rotor.position.set(x,2.5,z);this.level.add(rotor);this.machineRotors.push(rotor);mesh(new THREE.SphereGeometry(.7,20,12),mat(0x639fac,{metalness:.8,roughness:.2}),rotor);const blades=metal(0xb5d2d6,.29);for(let j=0;j<7;j++)rotorBlade(rotor,j*Math.PI*2/7,blades);
    const light=mesh(new THREE.TorusGeometry(2.18,.025,6,48),mat(0x8be0d9,{emissive:0x5bbfb6,emissiveIntensity:.5}),this.level,[x,.67,z]);light.rotation.x=Math.PI/2;this.machineLights.push(light);
    casing(this.level,[1.88,.97,.14],[x,1.37,z+2.15],dark,.07);
    pipe(this.level,[[x,.45,z+1.84],[x,.78,z+2.12],[x,1.22,z+2.15]],.08,piping,.2);
    surface(this.level,[x,1.37,z+2.228],[1.77,.86],'АДАПТИВНЫЙ РОТОР',['Автономный цикл  •  2074','Поток стабилен','Ручной персонал не требуется'],true);
   }else{
    generator(this.level,x,z,stage,base,piping);
    casing(this.level,[1.44,.49,.16],[x,2,z+1.87],dark,.045);
    surface(this.level,[x,2,z+1.956],[1.33,.42],stage===0?'ГЕНЕРАТОР Г-17':'БЛОК ДИАГНОСТИКИ',stage===0?['Первый пуск  •  1978','Проверить ручную защиту']:['Последняя смена  •  2026','Давление на входе растёт'],false);
   }
  }
  const details=[];
  for(const [x,z] of g.layout?.racks||[[-33,-20],[-33,-10],[-26,-20],[-26,-10],[-18,-20],[-18,-10]]){box(this.level,[.7,2.4,4.2],[x,1.2,z],wood);for(let y=.45;y<2.3;y+=.6){box(this.level,[.84,.07,4.3],[x,y,z],steel);for(let k=0;k<8;k++)details.push([x+.44,y+.25,z-1.4+k*.4,.25,.4,.2,stage===2?[0x7faab4,0xaecbcc,0xe1ece7][k%3]:[0xa99569,0x849a86,0x986d55,0x7b8d94][k%4]]);}}
  if(stage===2)surface(this.level,[-17.51,1.65,-10],[2.3,1.35],'ЦИФРОВОЙ АРХИВ',['Семейные дела оцифрованы','Исторический фонд 1978–2026','Доступ к карточке — на рабочем столе'],true,Math.PI/2);
  const desks=g.layout?.desks||[[-28,-18],[27,-18],[28,18],[-26,21],[-30,10]];
  for(const [i,[x,z]] of desks.entries()){
   bench(this.level,x,z,stage,wood,piping,dark);
   const [cx,cz]=g.layout?.chairs[i]||[x,z+(z===18?-2.2:2.2)];
   chair(this.level,cx,cz,stage,piping,z===18?Math.PI:0);
   deskLamp(this.level,x-1,z-.29,stage,piping);
   if(future)surface(this.level,[x+.86,1.32,z-.197],[.70,.355],'СЕРВИС 2074',['Синхронизация завершена'],true);
  }
  for(const [x,z] of g.layout?.tanks||[[17,-22],[23,-22],[30,-22]])vessel(this.level,x,z,base,piping,future);
  // Noticeboards and framed records belong to the station, not floating quest markers.
  box(this.level,[4,2.1,.12],[0,2.05,26.85],stage===2?steel:wood);
  surface(this.level,[0,2.1,26.76],[3.8,1.9],stage===0?'СМЕННЫЙ ЖУРНАЛ':stage===1?'ПОСТ ДЕЖУРНОГО':'МУЗЕЙ ПЕРВОГО ПУСКА',stage===0?['Объект 17  •  1978','Четвёртый контур — опытный','Записи наладки хранить в архиве']:stage===1?['29.10.2026  •  17:40','Последняя запись: О. Соколов','Повтор сигнала от 2016 года']:['Автономный корпус  •  2074','Исторический отсек сохранён',g.repairs?.valve?'Резерв восстановлен в 1978 году':'Причина затопления — старый клапан'],stage===2,Math.PI);
  if(stage===0){for(let z=-22;z<26;z+=4)for(let k=0;k<5;k++)details.push([11.62,1.2+k*.18,z,.02,.15,1.0,0xbaa88b]);surface(this.level,[-11.6,2.3,21],[2,1.3],'КАЛЕНДАРЬ',['1978','До первого пуска один день'],false,Math.PI/2);}
  if(stage===1){for(let z=-24;z<25;z+=3){details.push([-11.65,3.1,z,.18,.12,2.8,0x717b70],[11.65,3.1,z,.18,.12,2.8,0x717b70]);}for(const [x,z] of [[-15,17],[16,-14],[29,11]])details.push([x,.025,z,1.2,.01,.45,0x919d8c]);}
  if(stage===2){
   for(const x of [-11.55,11.55])for(const [z,d] of [[-22.5,9],[-2,16],[20.5,13]]){box(this.level,[.035,3.2,d-.3],[x,2,z],mat(0xb6d7da,{transparent:true,opacity:.06,depthWrite:false,roughness:.15}));box(this.level,[.035,.045,d-.3],[x,.4,z],mat(0x7fc6c7,{emissive:0x4ba6b0,emissiveIntensity:.3}));}
   for(const [i,[x,z]] of (g.layout?.planters||[[-34,23],[34,-24],[32,9]]).entries())plant(this.level,x,z,i);
   for(const z of [-23,-7,9,23]){box(this.level,[20,.05,.05],[0,7.8,z],mat(0xe4f7ed,{emissive:0xa3dace,emissiveIntensity:.55}));}
  }
  detailsBatch(this.level,details);
  dressing(this.level, stage);
  this.caseReel=null;
  for(const c of g.epoch.clues){
   if(c.requires==='valve'&&!g.repairs.valve)continue;
   const p=new THREE.Group();p.position.set(c.pos[0],1.03,c.pos[1]);this.level.add(p);
   if(c.id==='fatherlog'){
    reel(p,[0,.055,0]);this.caseReel=p;p.visible=!g.inventory?.includes('fatherlog');
   }else if(c.id==='calibration'){
    casing(p,[.66,.41,.19],[0,.15,0],dark);
    surface(p,[0,.16,.102],[.55,.31],'ДИАГНОСТИКА',['Трасса А • разрыв'],true);
    pipe(p,[[0,.13,-.04],[0,-.91,-.04],[-.51,-1,-.35]],.037,piping,.15);
   }else{
    casing(p,[.5,.025,.36],[0,0,0],future?dark:paper,.01);
    for(let k=0;k<4;k++)box(p,[.3,.002,.01],[0,.014,-.1+k*.055],mat(0x819080));
   }
   const l=label(c.name);l.position.y=.65;l.scale.set(2.2,.42,1);p.add(l);
   p.userData.clueLabel=l;this.pickups.set(c.id,p);
  }
  // The family safe is a real hinged cabinet in the 2026 archive.
  this.safeDoor=null;if(stage===1){const p=new THREE.Group();p.position.set(-24,0,-23);this.level.add(p);for(const x of [-.75,.75])box(p,[.15,2,.9],[x,1,0],mat(0x647b73));for(const y of [.07,1.93])box(p,[1.65,.14,.9],[0,y,0],mat(0x647b73));box(p,[1.65,2,.12],[0,1,-.4],mat(0x647b73));box(p,[1.35,1.65,.04],[0,1,-.31],mat(0x2d4441));box(p,[.8,.05,.5],[0,.25,.05],paper);box(p,[.45,.04,.3],[.1,.33,.03],paper);const hinge=new THREE.Group();hinge.position.set(-.75,1,.57);p.add(hinge);casing(hinge,[1.5,1.85,.13],[.75,0,0],mat(0x82968a));for(const y of [-.55,.55])box(hinge,[.09,.2,.12],[.04,y,.08],steel);casing(hinge,[.48,.28,.07],[.75,.23,.1],mat(0x314b4b));for(let k=0;k<3;k++)box(hinge,[.1,.14,.03],[.61+k*.15,.23,.15],paper);mesh(new THREE.TorusGeometry(.17,.025,8,24),steel,hinge,[1.07,-.24,.12]);this.safeDoor=hinge;surface(p,[0,2.35,.4],[1.8,.8],'СЕМЕЙНОЕ ДЕЛО',['Шкаф  →  полка  →  дело'],false);}
  const consolePos=g.beacon_position||[-7,21];
  const consoleRoot=emergencyConsole(this.level,[consolePos[0],0,consolePos[1]],future,g.repairs.valve);
  if(stage===1)surface(consoleRoot,[0,1.64,-.12],[1.53,.5],'АВАРИЙНЫЙ ПУЛЬТ',['Водосброс  /  Контур 4']);
  const repaired=g.repairs.valve;
  const valve=valveBank(this.level,[-29,0,7],stage,repaired);
  this.reserveWheel=valve.userData.reserveWheel;
  for(const [i,text] of ['А','Б','В'].entries()){
   const tag=label(text);tag.position.set((i-1)*.79,2.57,.1);
   tag.scale.set(.29,.15,1);valve.add(tag);
  }
  bench(this.level,-28,-5,stage,wood,piping,dark);
  wallBox([6,.65,.7],[-25,3.6,0],plaster);wallSign('ЗАПАДНЫЙ ПРОХОД',[-25,3.55,.4],0,3.6);
  if(g.flooded){const flood=box(this.level,[6,.08,8],[-25,.08,0],mat(0x6eacbe,{transparent:true,opacity:.85,roughness:.15}));flood.name='flood-water';for(const z of [-2,2]){box(this.level,[5,.16,.16],[-25,1,z],orange);for(const x of [-27,-23])box(this.level,[.09,1.2,.09],[x,.6,z],steel);}wallSign('ЗАТОПЛЕНО',[-25,1.3,2.12],0,2.0);}
  const npcLabel=label('Сергей Морозов');npcLabel.position.set(0,2.10,17);npcLabel.scale.set(1.37,.26,1);this.level.add(npcLabel);
 }
 startFlood(g,motion=true){
  const sceneState={...g,stage:1,epoch:{year:2026,name:'Авария на станции',clues:[],terminals:[],hazards:[]}};this.build(sceneState);this.releaseLook();this.setActive(false);this.inGame=true;this.player.visible=false;this.npc.visible=false;this.oldMovieFov=this.camera.fov;this.camera.fov=58;this.camera.updateProjectionMatrix();this.sun.intensity=.65;
  const water=box(this.level,[72,.18,54],[0,-.2,0],mat(0x377f96,{transparent:true,opacity:.87,roughness:.17,metalness:.2,depthWrite:false}));water.name='accident-water';water.castShadow=false;
  const alarm=new THREE.PointLight(0xef674a,100,65,1.5);alarm.position.set(3,4,8);this.level.add(alarm);
  const drops=[];for(let i=0;i<36;i++){const o=mesh(new THREE.SphereGeometry(.075,6,5),mat(0x75bad1,{transparent:true,opacity:.7,depthWrite:false}),this.level);o.castShadow=false;o.userData.spray=i%2?[-3,2,-12]:[3,1.8,1];drops.push(o);}
  this.floodCinematic={started:performance.now(),water,alarm,drops,motion};this.camera.position.set(-24,2.7,12);this.camera.lookAt(-29,1.2,7);
 }
 floodStep(dt){const c=this.floodCinematic,t=(performance.now()-c.started)/1000;c.water.position.y=-.12+Math.min(1,t/7.5)*1.9;c.alarm.intensity=c.motion?65+Math.sin(t*2.2)*25:60;for(let i=0;i<c.drops.length;i++){const drop=c.drops[i],phase=(t*1.2+i/36)%1,[x,y,z]=drop.userData.spray;drop.position.set(x+Math.sin(i*2.3)*phase*2.7,y+.8*phase-2.8*phase*phase,z+Math.cos(i*2.3)*phase*2.7);drop.scale.setScalar(.5+phase*.7);}const shot=!c.motion?1:t<2.5?0:t<6?1:2;const poses=[[-24,2.7,12],[12,6,17],[0,5.7,25]],looks=[[-29,1.2,7],[0,1.3,-2],[0,.9,2]];this.camera.position.lerp(new THREE.Vector3(...poses[shot]),1-Math.exp(-dt*2));this.camera.lookAt(...looks[shot]);this.player.visible=false;this.npc.visible=false;}
 endFlood(){if(!this.floodCinematic)return;this.floodCinematic.alarm.intensity=0;this.floodCinematic.drops.forEach(o=>o.visible=false);this.floodCinematic=null;this.camera.fov=this.oldMovieFov||63;this.camera.updateProjectionMatrix();this.npc.visible=true;this.cameraReady=false;}
 pulseValve(){if(this.reserveWheel)this.reserveWheel.rotation.z=0;}
 jump(){if(this.active&&this.jumpAge===null)this.jumpAge=0;}
 position(){return [Number(this.player.position.x.toFixed(3)),Number(this.player.position.z.toFixed(3))];}
 nearest(){
  const g=this.game;if(!g?.npc_position)return null;
  const p=this.position(), dist=q=>Math.hypot(p[0]-q[0],p[1]-q[1]);
  const targets=[{type:'npc',pos:g.npc_position,name:'Поговорить с Сергеем'}];
  if(g.stage===0)targets.push({type:'bypass',pos:g.valve_position,name:'Переключить клапан'});
  if(g.stage===1)targets.push({type:'finale',pos:g.beacon_position,name:'Аварийный пульт'},
    {type:'safe',pos:g.safe_position,name:'Архивный сейф'});
  for(const c of g.epoch.clues){
   if(c.requires==='valve'&&(!g.repairs.valve||g.inventory.includes(c.id)))continue;
   targets.push({type:'clue',id:c.id,pos:c.pos,name:c.id==='fatherlog'?'Забрать катушку':'Осмотреть: '+c.name});
  }
  return targets.map(t=>({...t,d:dist(t.pos)})).filter(t=>t.d<2.5).sort((a,b)=>a.d-b.d)[0]||null;
 }
 hurt(){this.hurtUntil=this.elapsed+1;this.player.position.set(-2,0,21);this.velocity.set(0,0);this.cameraReady=false;}
 cameraStep(dt){
  if(this.floodCinematic){this.floodStep(dt);return;}
  const p=this.player.position;if(!this.inGame){this.player.visible=true;const target=new THREE.Vector3(31,29,48);this.camera.position.lerp(target,.06);this.camera.lookAt(0,1,0);this.cameraReady=false;return;}
  if(!this.active&&this.cameraReady)return;
  const eye=new THREE.Vector3(p.x,p.y+1.58,p.z),forward=new THREE.Vector3(Math.sin(this.yaw)*Math.cos(this.pitch),-Math.sin(this.pitch),-Math.cos(this.yaw)*Math.cos(this.pitch));
  if(this.mode==='first'){this.camera.position.copy(eye);this.camera.lookAt(eye.clone().add(forward));this.player.visible=false;}
  else{
   const focus=new THREE.Vector3(p.x,p.y+1.28,p.z);
   const desired=focus.clone().addScaledVector(forward,-this.distance);
   desired.x=THREE.MathUtils.clamp(desired.x,-35.64,35.64);
   desired.y=Math.max(.24,desired.y);
   desired.z=THREE.MathUtils.clamp(desired.z,-26.64,26.64);
   const direction=desired.sub(focus);
   const distance=direction.length();
   direction.divideScalar(distance);
   const limit=this.collision.cameraLimit(focus,direction,distance);
   if(!this.cameraReady||limit<this.cameraDistance)this.cameraDistance=limit;
   else this.cameraDistance=THREE.MathUtils.damp(this.cameraDistance,limit,9,dt);
   this.camera.position.copy(focus).addScaledVector(direction,Math.max(.11,this.cameraDistance));
   this.camera.lookAt(focus);
   this.player.visible=this.cameraDistance>.65;
  }

  this.cameraReady=true;
 }
 drawMap(){const c=document.getElementById('mini-map');if(!c||!this.game)return;const ctx=c.getContext('2d'),sx=x=>10+(x+36)*2.5,sz=z=>5+(z+27)*2.5;ctx.clearRect(0,0,200,146);ctx.fillStyle=this.game.stage===2?'#eff8f5':'#f7f8f2';ctx.fillRect(0,0,200,146);ctx.strokeStyle='#bdcac4';ctx.strokeRect(10,5,180,135);ctx.fillStyle='#a1b4ad';for(const [x,z,w,d] of this.game.walls)ctx.fillRect(sx(x-w/2),sz(z-d/2),Math.max(1,w*2.5),Math.max(1,d*2.5));ctx.fillStyle='#668174';ctx.font='8px system-ui';ctx.textAlign='center';for(const [n,x,z] of [['АРХИВ',-24,-24],['ТУРБИНЫ',24,-24],['МАСТЕРСКАЯ',-24,24],['ПУЛЬТ',-6,24]])ctx.fillText(n,sx(x),sz(z));const p=this.player.position;ctx.fillStyle='#c28a39';for(const q of this.game.epoch.clues)if((!q.requires||this.game.repairs.valve)&&Math.hypot(p.x-q.pos[0],p.z-q.pos[1])<8)ctx.fillRect(sx(q.pos[0])-2,sz(q.pos[1])-2,4,4);const goal=this.game.objective;
 if(goal?.stage===this.game.stage){
  const [x,z]=goal.target;
  ctx.strokeStyle='#ae5c25';ctx.lineWidth=1.4;ctx.beginPath();
  ctx.arc(sx(x),sz(z),5,0,Math.PI*2);ctx.stroke();
  ctx.fillStyle='#b6652b';ctx.fillRect(sx(x)-1,sz(z)-1,2,2);
 }
 ctx.fillStyle='#466d53';ctx.beginPath();ctx.arc(sx(0),sz(17),3,0,Math.PI*2);ctx.fill();if(this.game.flooded){ctx.fillStyle='#78aabd';ctx.fillRect(sx(-28),sz(-3),15,15);}ctx.save();ctx.translate(sx(p.x),sz(p.z));ctx.rotate(this.yaw);ctx.fillStyle='#1c6393';ctx.beginPath();ctx.moveTo(0,-5);ctx.lineTo(4,4);ctx.lineTo(0,2);ctx.lineTo(-4,4);ctx.closePath();ctx.fill();ctx.restore();}
 tick(){requestAnimationFrame(()=>this.tick());const dt=Math.min(this.clock.getDelta(),.04);if(this.active||this.key===undefined)this.elapsed+=dt;const t=this.elapsed;
  if(this.active&&this.game){
   const view=this.lookInput||{x:0,y:0};this.targetYaw+=view.x*1.0*dt;this.targetPitch=THREE.MathUtils.clamp(this.targetPitch+view.y*.7*dt,-.65,1.05);
   const lookMix=1-Math.exp(-dt*28);this.yaw+=(this.targetYaw-this.yaw)*lookMix;this.pitch+=(this.targetPitch-this.pitch)*lookMix;
   let {x,z}=this.input;const length=Math.hypot(x,z);if(length>1){x/=length;z/=length;}const co=Math.cos(this.yaw),si=Math.sin(this.yaw),dx=x*co-z*si,dz=x*si+z*co;
   const speed=this.sprinting?RUN_SPEED:WALK_SPEED;const blend=1-Math.exp(-dt*(length>.01?8:12));this.velocity.lerp(new THREE.Vector2(dx*speed,dz*speed),blend);if(length<.01&&this.velocity.length()<.02)this.velocity.set(0,0);
   const p=this.player.position,oldX=p.x,oldZ=p.z;
   this.collision.move(p,this.velocity.x*dt,this.velocity.y*dt);
   if(this.jumpAge!==null){
    this.jumpAge+=dt;
    const flight=this.jumpAge-JUMP.takeoff;
    p.y=Math.max(0, 8.6*flight*(JUMP.land-JUMP.takeoff-flight));
    if(this.jumpAge>=JUMP.end)this.jumpAge=null;
   }
   const actualSpeed=Math.hypot(p.x-oldX,p.z-oldZ)/Math.max(dt,.001),moving=actualSpeed>.06;
   if(moving){const facing=Math.atan2(p.x-oldX,p.z-oldZ),turn=Math.atan2(Math.sin(facing-this.player.rotation.y),Math.cos(facing-this.player.rotation.y));this.player.rotation.y+=turn*(1-Math.exp(-dt*8));}
   this.travelled=Math.hypot(p.x-oldX,p.z-oldZ);
  }
  if(this.game.repairs?.valve&&this.reserveWheel)this.reserveWheel.rotation.z=THREE.MathUtils.damp(this.reserveWheel.rotation.z,Math.PI/4,5,dt);
  animatePerson(this.player,dt,this.active?this.travelled:0,this.jumpAge);
  animatePerson(this.npc,dt);
  if(this.active&&this.npc.visible){const dx=this.player.position.x-this.npc.position.x,dz=this.player.position.z-this.npc.position.z;if(Math.hypot(dx,dz)<7){const face=Math.atan2(dx,dz),turn=Math.atan2(Math.sin(face-this.npc.rotation.y),Math.cos(face-this.npc.rotation.y));this.npc.rotation.y+=turn*(1-Math.exp(-dt*2.4));}}
  for(const obj of this.pickups.values()){if(obj.userData.clueLabel)obj.userData.clueLabel.visible=Math.hypot(this.player.position.x-obj.position.x,this.player.position.z-obj.position.z)<9;}
  for(const rotor of this.machineRotors||[])rotor.rotation.y=t*(this.game.stage===2?.25:.045);for(const glow of this.machineLights||[])glow.material.emissiveIntensity=.55+Math.sin(t*.7)*.05;
  this.cameraStep(dt);placeFootShadow(this.playerShadow,this.player);placeFootShadow(this.npcShadow,this.npc);this.drawMap();this.renderer.render(this.scene,this.camera);
 }
}
