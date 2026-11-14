import * as THREE from './vendor/three.module.js';
import { StationCollision } from './collision.js';
import {buildPortal,portalCrossing} from './portal.js';
import {batchStaticMeshes} from './batching.js';
import {integrateMotion,CLIP_FOOTFALLS} from './locomotion.js';
import { person, animatePerson, animateArrival, reachForSwitch, footShadow, placeFootShadow, JUMP, WALK_SPEED, RUN_SPEED } from './people.js';
import { metal, casing, cylinder, pipe, generator, vessel, bench, chair, deskLamp,
  plant, valveBank, emergencyConsole, reel, rotorBlade, dressing, roof } from './industrial.js';
import { attachAtmosphere } from './atmosphere.js';
import { surfaceMaterial, environmentFor, skyTexture } from './materials.js';
import { buildGrounds } from './landscape.js';

const mat=(color,opts={})=>new THREE.MeshStandardMaterial({color,roughness:.85,...opts});
function mesh(geo,material,parent,pos=[0,0,0],scale){if(material?.normalMap&&geo.index&&!geo.getAttribute('tangent')){try{geo.computeTangents();}catch(e){material=material.clone();material.normalMap=null;}}const m=new THREE.Mesh(geo,material);m.position.set(...pos);if(scale)m.scale.set(...scale);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
function box(p,size,pos,m){
 const geometry=new THREE.BoxGeometry(...size),tile=m?.userData.tileMeters;
 if(tile){
  const uv=geometry.attributes.uv,normals=geometry.attributes.normal,repeat=m.map?.repeat||{x:1,y:1};
  for(let i=0;i<uv.count;i++){
   const width=Math.abs(normals.getX(i))>.5?size[2]:size[0];
   const height=Math.abs(normals.getY(i))>.5?size[2]:size[1];
   uv.setXY(i,uv.getX(i)*width/(tile*repeat.x),uv.getY(i)*height/(tile*repeat.y));
  }
 }
 return mesh(geometry,m,p,pos);
}
function mountedSign(parent,text,pos,width,height,rotation=0){
 const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=Math.max(104,Math.round(1024*height/width));
 const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height;
 ctx.fillStyle='#d7d9ca';ctx.fillRect(0,0,w,h);
 ctx.strokeStyle='#55716b';ctx.lineWidth=4;ctx.strokeRect(10,10,w-20,h-20);
 ctx.fillStyle='#203c39';ctx.textAlign='center';ctx.textBaseline='middle';
 let font=h*.43;
 ctx.font='650 '+font+'px system-ui';
 while(ctx.measureText(text).width>w-54&&font>20){font--;ctx.font='650 '+font+'px system-ui';}
 ctx.fillText(text,w/2,h*.51);
 const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=8;
 const plate=mesh(new THREE.PlaneGeometry(width,height),new THREE.MeshBasicMaterial({map:texture}),parent,pos);
 plate.name='mounted-sign';plate.rotation.y=rotation;plate.castShadow=false;plate.receiveShadow=false;
 return plate;
}
function surface(parent,pos,size,title,lines=[],future=false,rotation=0){
 const c=document.createElement('canvas');c.width=768;c.height=Math.max(144,Math.round(768*size[1]/size[0]));
 const ctx=c.getContext('2d'),w=c.width,h=c.height,pad=30;
 ctx.fillStyle=future?'#10323c':'#ded5bb';ctx.fillRect(0,0,w,h);
 ctx.strokeStyle=future?'#5baca5':'#7a806a';ctx.lineWidth=3;ctx.strokeRect(12,12,w-24,h-24);
 ctx.fillStyle=future?'#9ee7db':'#2e4640';
 let font=Math.min(44,h*.23);ctx.font='600 '+font+'px system-ui';
 while(ctx.measureText(title).width>w-pad*2&&font>16){font--;ctx.font='600 '+font+'px system-ui';}
 const titleY=Math.min(h*.33,65);ctx.fillText(title,pad,titleY);
 const gap=Math.min(48,(h-titleY-28)/Math.max(1,lines.length));
 lines.forEach((line,i)=>{
  let font=Math.min(30,gap*.65);ctx.font=font+'px system-ui';
  while(ctx.measureText(line).width>w-pad*2&&font>13){font--;ctx.font=font+'px system-ui';}
  ctx.fillStyle=future?'#c5e7df':'#475951';ctx.fillText(line,pad,titleY+(i+1)*gap);
 });
 const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=8;
 const plane=mesh(new THREE.PlaneGeometry(...size),new THREE.MeshBasicMaterial({map:tex}),parent,pos);
 plane.rotation.y=rotation;plane.castShadow=false;plane.receiveShadow=false;plane.name='equipment-label';return plane;
}
function detailsBatch(parent,entries){const inst=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),mat(0xffffff),entries.length),dummy=new THREE.Object3D();entries.forEach((e,i)=>{dummy.position.set(e[0],e[1],e[2]);dummy.scale.set(e[3],e[4],e[5]);dummy.rotation.set(0,e[7]||0,0);dummy.updateMatrix();inst.setMatrixAt(i,dummy.matrix);inst.setColorAt(i,new THREE.Color(e[6]));});inst.receiveShadow=true;inst.castShadow=false;parent.add(inst);return inst;}
let contactTexture;
function addContactShadows(parent,solids=[]){
 if(!solids.length)return;
 if(!contactTexture){
  const c=document.createElement('canvas');c.width=c.height=96;const ctx=c.getContext('2d');
  const gradient=ctx.createRadialGradient(48,48,8,48,48,48);gradient.addColorStop(0,'rgba(13,24,23,.24)');gradient.addColorStop(.55,'rgba(13,24,23,.13)');gradient.addColorStop(1,'rgba(13,24,23,0)');ctx.fillStyle=gradient;ctx.fillRect(0,0,96,96);
  contactTexture=new THREE.CanvasTexture(c);contactTexture.userData.keep=true;
 }
 const footprints=solids.filter(s=>s.bottom===0&&!['wall','flood','safe-door'].includes(s.name));
 const material=new THREE.MeshBasicMaterial({map:contactTexture,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1});
 const shadows=new THREE.InstancedMesh(new THREE.PlaneGeometry(1,1),material,footprints.length),dummy=new THREE.Object3D();
 shadows.name='equipment-contact-shadows';shadows.renderOrder=1;
 footprints.forEach((shape,i)=>{dummy.position.set(shape.x,.026,shape.z);dummy.rotation.set(-Math.PI/2,0,shape.yaw||0);dummy.scale.set((shape.radius?shape.radius*2:shape.width)+.5,(shape.radius?shape.radius*2:shape.depth)+.5,1);dummy.updateMatrix();shadows.setMatrixAt(i,dummy.matrix);});
 shadows.instanceMatrix.needsUpdate=true;parent.add(shadows);
}
export class World{
 constructor(container,events){
  this.events=events;this.container=container;  this.scene=new THREE.Scene();this.scene.background=null;this.scene.fog=new THREE.Fog(0xd7e7ee,64,240);this.sky=new THREE.Mesh(new THREE.SphereGeometry(420,24,16),new THREE.MeshBasicMaterial({map:skyTexture(0),side:THREE.BackSide,fog:false,depthWrite:false}));this.sky.frustumCulled=false;this.scene.add(this.sky);
  this.renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.05;container.appendChild(this.renderer.domElement);
  this.camera=new THREE.PerspectiveCamera(63,1,.08,800);this.camera.position.set(17,15,21);this.camera.lookAt(0,0,0);
  this.hemi=new THREE.HemisphereLight(0xe7f4ff,0x9a927e,.95);this.scene.add(this.hemi);this.sun=new THREE.DirectionalLight(0xfff1d6,2.15);this.sun.position.set(-13,22,14);this.sun.castShadow=true;this.sun.shadow.mapSize.set(2048,2048);this.sun.shadow.radius=2.5;Object.assign(this.sun.shadow.camera,{left:-28,right:28,top:28,bottom:-28,far:78});this.sun.shadow.bias=-.00045;this.sun.shadow.normalBias=.04;this.scene.add(this.sun);this.fill=new THREE.DirectionalLight(0xd7e8ff,.3);this.fill.position.set(18,12,-10);this.scene.add(this.fill);this.atmosphere=attachAtmosphere(this.scene,this.renderer);
  this.level=new THREE.Group();this.scene.add(this.level);this.player=person('anna');this.scene.add(this.player);this.player.position.set(-2,0,21);this.npc=person('sergey');this.scene.add(this.npc);this.npc.position.set(0,0,17);this.npc.rotation.y=-.48;
  this.playerShadow=footShadow();this.npcShadow=footShadow();this.scene.add(this.playerShadow,this.npcShadow);this.graphics=1;
  this.clock=new THREE.Clock();this.input={x:0,z:0};this.active=false;this.inGame=false;this.elapsed=0;this.hurtUntil=0;this.hitCooldown=0;this.pendingPick=new Set();this.lastCollect=0;this.mode=localStorage.getItem('timeless-view')==='first'?'first':'third';this.yaw=Math.PI/4;this.pitch=.12;this.distance=3.55;this.cameraReady=false;this.drag=false;this.loadDemo();
  this.targetYaw=this.yaw;this.targetPitch=this.pitch;this.collision=new StationCollision([],[-36,36,-27,27],.43);this.velocity=new THREE.Vector2();this.travelled=0;this.jumpAge=null;this.fallbackLook=false;this.wantsLook=false;this.capturePending=false;
  const canvas=this.renderer.domElement;
  canvas.addEventListener('click',()=>this.captureLook());
  canvas.addEventListener('contextmenu',e=>e.preventDefault());
  document.addEventListener('pointerlockchange',()=>{if(document.pointerLockElement===canvas){this.fallbackLook=false;this.wantsLook=true;}else if(this.wantsLook&&this.active){this.wantsLook=false;this.events.lookPaused?.();}});
  addEventListener('mousemove',e=>{if(!this.active||!(document.pointerLockElement===canvas||(this.fallbackLook&&e.target===canvas)))return;this.targetYaw+=e.movementX*.0024;this.targetPitch=THREE.MathUtils.clamp(this.targetPitch+e.movementY*.002,-.65,1.05);});
  canvas.addEventListener('wheel',e=>{if(this.active&&this.mode==='third'){this.distance=THREE.MathUtils.clamp(this.distance+e.deltaY*.003,2,6);e.preventDefault();}},{passive:false});
  addEventListener('resize',()=>this.resize());this.setMode(this.mode);this.resize();this.tick=this.tick.bind(this);requestAnimationFrame(this.tick);
 }
 loadDemo(){this.build({stage:0,run_id:'preview',epoch:{clues:[],terminals:[],hazards:[]},walls:[[-12,-22.5,.7,9],[-12,-2,.7,16],[-12,20.5,.7,13],[12,-22.5,.7,9],[12,-2,.7,16],[12,20.5,.7,13],[-32,0,8,.7],[-17,0,10,.7],[17,0,10,.7],[32,0,8,.7],[-3,-12,5,5],[3,1,5,5],[-3,11,5,5]],repairs:{valve:false},director:{mode:'обычный'},found:[],activated:[],position:[-2,21]});}
 resize(){this.renderer.setSize(innerWidth,innerHeight);this.camera.aspect=innerWidth/innerHeight;this.camera.updateProjectionMatrix();}
 setMode(mode){this.mode=mode==='first'?'first':'third';localStorage.setItem('timeless-view',this.mode);this.camera.fov=this.mode==='first'?76:63;this.camera.updateProjectionMatrix();this.cameraReady=false;if(this.inGame)this.player.visible=this.mode!=='first';}
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
  const wasSergey=!!this.game?.npc_position;
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
  if(g.inventory.includes('fatherlog')&&!this.father){
   this.father=person('oleg');
   this.father.visible=false;
   this.scene.add(this.father);
   this.fatherShadow=footShadow();
   this.fatherShadow.visible=false;
   this.scene.add(this.fatherShadow);
  }
  if(!this.confession&&!this.reunion&&!this.endingShot)this.portal?.setState(g.portal);
  if(this.fusePickup)this.fusePickup.visible=!g.inventory.includes('portal_fuse');
  if(this.safeDoor)this.safeDoor.rotation.y=g.safe_door_angle??(g.safe_open?-1.25:0);
  if(this.caseReel)this.caseReel.visible=!g.inventory.includes('fatherlog');
  const sergey=!!g.npc_position;
  if(this.collision&&wasSergey!==sergey)this.collision=new StationCollision(g.solids||[],g.bounds,g.player_radius||.43);
  if(!this.endingShot)this.npc.visible=sergey||!!this.departure||!!this.confession;this.npcShadow.visible=sergey&&!this.endingShot;
 }
 build(g){
  const oldMaterials=new Set(),oldTextures=new Set(),mapKeys=['map','normalMap','roughnessMap','bumpMap','metalnessMap','emissiveMap','alphaMap'];for(const c of [...this.level.children]){this.level.remove(c);c.traverse(o=>{if(o.isInstancedMesh)o.dispose();o.geometry?.dispose();for(const m of Array.isArray(o.material)?o.material:o.material?[o.material]:[]){oldMaterials.add(m);for(const key of mapKeys){const tex=m[key];if(tex&&!tex.userData.keep)oldTextures.add(tex);}}});}oldMaterials.forEach(m=>m.dispose());oldTextures.forEach(t=>t.dispose());
  this.game=g;this.repairsKey=JSON.stringify(g.repairs);this.machineRotors=[];this.machineLights=[];this.pickups=new Map();this.terminals=new Map();this.hazards=[];
  const stage=g.stage,q=this.graphics??1,plaster=surfaceMaterial('plaster',stage,[5,3],q),base=surfaceMaterial('plaster',stage,[2,1],q),wood=surfaceMaterial('wood',stage,[2,2],q),steel=surfaceMaterial('steel',stage,[3,3],q),paper=mat(0xf8efd2),orange=mat(0xdb9646);
  base.color.setHex([0x6d8870,0x4e6c68,0x6a8d90][stage]);
  this.sun.position.set(-28,38,16);Object.assign(this.sun.shadow.camera,{left:-48,right:48,top:42,bottom:-42,far:120});this.sun.shadow.camera.updateProjectionMatrix();this.atmosphere.apply(this,stage);this.scene.environment=q===0?null:environmentFor(stage);this.scene.environmentIntensity=.55;
  this.waterMat=buildGrounds(this.level,stage,q);
  box(this.level,[74,.5,56],[0,-.3,0],surfaceMaterial('floor',stage,[4,3],q));box(this.level,[72,.08,54],[0,-.02,0],surfaceMaterial('floor',stage,[9,7],q));
  // Real room openings connect four wings to a tall turbine hall.
  const wallBox=(sz,pos,m)=>box(this.level,sz,pos,m);
  const doorGap=2.7,doorZ=27.2;
  for(const z of [-27.2,27.2]){
   const entrance=z===doorZ,side=(73-doorGap)/2,shift=doorGap/2+side/2;
   if(entrance){
    wallBox([side,2.1,.45],[-shift,1,z],plaster);wallBox([side,2.1,.45],[shift,1,z],plaster);
    wallBox([side,1.25,.45],[-shift,5.9,z],plaster);wallBox([side,1.25,.45],[shift,5.9,z],plaster);
    box(this.level,[side,.12,.5],[-shift,2.12,z],base);box(this.level,[side,.12,.5],[shift,2.12,z],base);
   }else{
    wallBox([73,2.1,.45],[0,1,z],plaster);wallBox([73,1.25,.45],[0,5.9,z],plaster);box(this.level,[73,.12,.5],[0,2.12,z],base);
   }
   for(let x=-36;x<=36;x+=8){
    if(entrance&&Math.abs(x)<doorGap)continue;
    wallBox([.55,4.2,.55],[x,3.6,z],plaster);box(this.level,[7.5,.08,.16],[x+4,3.6,z],steel);box(this.level,[.09,3.2,.16],[x+4,3.75,z],steel);
   }
  }
  const jamb=metal(0x5c6866),leafMat=mat(0x6b5340,{roughness:.7});
  wallBox([.16,2.4,.55],[-doorGap/2,1.2,doorZ],jamb);wallBox([.16,2.4,.55],[doorGap/2,1.2,doorZ],jamb);
  box(this.level,[doorGap+.36,.16,.55],[0,2.38,doorZ],jamb);
  const leafW=doorGap/2-.12;
  const hinge=(x,dir)=>{
   const pivot=new THREE.Group();pivot.position.set(x,0,doorZ);pivot.userData.swing=dir;this.level.add(pivot);
   box(pivot,[leafW,2.08,.07],[dir*leafW/2,1.06,.24],leafMat);
   pivot.rotation.y=dir*.2;
   return pivot;
  };
  this.exitDoors=[hinge(-doorGap/2,1),hinge(doorGap/2,-1)];
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
    for(const end of [-.79,.79])cylinder(this.level,.024,.61,[side*8.9,8.133,z+end],steel,.024,8).castShadow=false;
    casing(this.level,[.19,.024,2.08],[side*8.9,7.718,z],mat(0xfff9e2,{emissive:future?0xabf1eb:0xffedc9,emissiveIntensity:.43}),.01).castShadow=false;
   }
  }
  for(const [x,z,w,d] of g.walls){if(turbines.some(p=>p[0]===x&&p[1]===z)||w===6&&x===-25&&z===0||w===.7&&d===4.2||w===3&&d===1.5)continue;if(w===1&&d>=7){const rack=stage===2?mat(0xc7dedd):wood;wallBox([.12,2.4,d],[x-.45,1.2,z],rack);for(const y of [.12,.7,1.28,1.86,2.44])wallBox([1.04,.07,d],[x,y,z],rack);for(let dz=-d/2;dz<=d/2;dz+=1.5)wallBox([1.0,2.4,.06],[x,1.2,z+dz],rack);const contents=[];for(let dz=-d/2+.25;dz<d/2-.2;dz+=.4)for(const y of [.4,.98,1.56,2.14])contents.push([x+.1,y,z+dz,.65,.4,.28,stage===2?0x9bbbc1:stage===1?0x788c83:0xb4a278]);detailsBatch(this.level,contents);continue;}if(x===-28&&z===-5)continue;const tall=w<1||d<1;const h=tall?3.8:1.8;wallBox([w,h,d],[x,h/2-.02,z],tall?plaster:wood);box(this.level,[w+.04,.13,d+.04],[x,tall?.95:1.84,z],base);}
  // Side-wing roofs leave the central machinery hall open to clerestory light.
  for(const x of [-24,24]){wallBox([24,.24,54],[x,4.12,0],mat(0xcbd2bf));for(let z=-24;z<27;z+=8)box(this.level,[23,.25,.2],[x,3.85,z],steel);}
  for(let z=-24;z<=24;z+=12){for(const x of [-10.8,10.8])wallBox([.7,8.5,.7],[x,4.2,z],mat(0xaeb8a9));box(this.level,[22,.25,.3],[0,8.3,z],steel);for(const x of [-7,0,7]){const brace=box(this.level,[.12,2.1,.12],[x,7.3,z],steel);brace.rotation.z=x<0?-.65:.65;}}
  const wallSign=(text,pos,rotation,w=3.2)=>{
   const fixture=new THREE.Group();fixture.position.set(...pos);fixture.rotation.y=rotation;this.level.add(fixture);
   casing(fixture,[w+.10,w*.19+.07,.09],[0,0,-.04],dark,.012);
   return mountedSign(fixture,text,[0,0,.013],w,w*.19);
  };
  for(const x of [-12,12])for(const z of [-14,10])wallBox([.7,.65,8],[x,3.65,z],plaster);
  const skylight=mat(0xb6d8de,{transparent:true,opacity:.24,depthWrite:false,roughness:.18,side:THREE.DoubleSide});
  const glassRoof=mesh(new THREE.PlaneGeometry(7.73,54),skylight,this.level,[0,8.56,0]);
  glassRoof.rotation.x=-Math.PI/2;glassRoof.castShadow=false;glassRoof.receiveShadow=false;
  const window=mat(stage===2?0xb5d9df:0xb2c7c3,{transparent:true,opacity:.31,depthWrite:false,roughness:.2,side:THREE.DoubleSide});
  roof(this.level,stage,steel,window);
  box(this.level,[7.23,.76,.14],[0,4.98,-26.705],dark);
  wallSign('ГИДРОУЗЕЛ ОЛЬХОВ · '+[1978,2026,2074][stage],[0,4.98,-26.605],0,7);wallSign('АРХИВ',[-11.6,3.5,-14],Math.PI/2,3);wallSign('МАСТЕРСКАЯ',[-11.6,3.5,10],Math.PI/2,3.5);wallSign('ТУРБИННЫЙ ЗАЛ',[11.6,3.5,-14],-Math.PI/2,4);wallSign('ДИСПЕТЧЕРСКАЯ',[11.6,3.5,10],-Math.PI/2,4);
  // Painted paths and practical props give the large building a readable layout.
  for(const x of [-8,8]){
   const stripe=mesh(new THREE.PlaneGeometry(.08,49),orange,this.level,[x,.026,0]);
   stripe.rotation.x=-Math.PI/2;stripe.castShadow=false;
  }
  if(stage===1){for(const [x,z,w,d] of [[-3,-10,3.4,1.6],[9,7,2.4,2.2],[22,-16,3.6,1.3]]){const stain=mesh(new THREE.PlaneGeometry(w,d),mat(0x355864,{transparent:true,opacity:.32,depthWrite:false,roughness:.52}),this.level,[x,.023,z]);stain.rotation.x=-Math.PI/2;stain.castShadow=false;}}
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
    surface(this.level,[x,2,z+1.956],[1.33,.42],stage===0?'ГЕНЕРАТОР':'БЛОК ДИАГНОСТИКИ',stage===0?['Первый пуск  •  1978','Проверить ручную защиту']:['Последняя смена  •  2026','Давление на входе растёт'],false);
   }
  }
  const details=[];
  for(const [x,z] of g.layout?.racks||[[-33,-20],[-33,-10],[-26,-20],[-26,-10],[-18,-20],[-18,-10]]){
   const depth=z===-10&&x<-25?3.44:4.2;
   box(this.level,[.09,2.4,depth],[x-.31,1.22,z],wood);
   for(const end of [-1,1])box(this.level,[.84,2.4,.08],[x,1.22,z+end*(depth/2-.04)],wood);
   box(this.level,[.85,.07,depth],[x,2.405,z],steel);
   for(let y=.28;y<2.3;y+=.55){
    box(this.level,[.84,.07,depth],[x,y,z],steel);
    for(let k=0;k<8;k++)details.push([x+.12,y+.235,z-1.4+k*.39,.39,.4,.24,
     stage===2?[0x7faab4,0xaecbcc,0xe1ece7][k%3]:[0xa99569,0x849a86,0x986d55,0x7b8d94][k%4]]);
   }
  }
  if(stage===2){
   casing(this.level,[2.43,1.48,.115],[-17.585,1.65,-10],dark,.025).rotation.y=Math.PI/2;
   surface(this.level,[-17.515,1.65,-10],[2.3,1.35],'ЦИФРОВОЙ АРХИВ',['Семейные дела оцифрованы','Исторический фонд 1978–2026','Доступ к карточке — на рабочем столе'],true,Math.PI/2);
  }
  const desks=g.layout?.desks||[[-28,-18],[27,-18],[28,18],[-26,21],[-30,10]];
  for(const [i,[x,z]] of desks.entries()){
   const screen=stage>0?(parent,pos,size)=>surface(parent,pos,size,
    future?'СЕРВИС 2074':'СМЕНА 29.10',
    future?['Синхронизация завершена']:['17:40  •  связь жива','Не обрывай контур'],true):null;
   bench(this.level,x,z,stage,wood,piping,dark,screen);
   const [cx,cz]=g.layout?.chairs[i]||[x,z+(z===18?-2.2:2.2)];
   chair(this.level,cx,cz,stage,piping,z===18?Math.PI:0);
   deskLamp(this.level,x-1,z-.29,stage,piping);
  }
  for(const [x,z] of g.layout?.tanks||[[17,-22],[23,-22],[30,-22]])vessel(this.level,x,z,base,piping,future);
  // Noticeboards and framed records belong to the station, not floating quest markers.
  box(this.level,[4,2.1,.12],[0,2.05,26.85],stage===2?steel:wood);
  surface(this.level,[0,2.1,26.76],[3.8,1.9],stage===0?'СМЕННЫЙ ЖУРНАЛ':stage===1?'ПОСТ ДЕЖУРНОГО':'МУЗЕЙ ПЕРВОГО ПУСКА',stage===0?['Гидроузел Ольхов  •  1978','До пуска один день','Клапан ещё слушается руки']:stage===1?['29.10.2026  •  17:40','Голос О. Соколова — сегодня','Сначала клапан, не спасение']:['Та же станция  •  2074','Вода помнит закрытую линию',g.repairs?.valve?'Линия Б осушила проход':'Катушка за затопленным проходом'],stage===2,Math.PI);
  if(stage===0){surface(this.level,[-11.6,2.3,21],[2,1.3],'КАЛЕНДАРЬ',['1978','До первого пуска один день'],false,Math.PI/2);}
  if(stage===1){for(let z=-24;z<25;z+=3){details.push([-11.65,3.1,z,.18,.12,2.8,0x717b70],[11.65,3.1,z,.18,.12,2.8,0x717b70]);}for(const [x,z] of [[-15,17],[16,-14],[29,11]])details.push([x,.025,z,1.2,.01,.45,0x919d8c]);}
  if(stage===2){
   for(const x of [-11.55,11.55])for(const [z,d] of [[-22.5,9],[-2,16],[20.5,13]]){box(this.level,[.035,3.2,d-.3],[x,2,z],mat(0xb6d7da,{transparent:true,opacity:.06,depthWrite:false,roughness:.15}));box(this.level,[.035,.045,d-.3],[x,.4,z],mat(0x7fc6c7,{emissive:0x4ba6b0,emissiveIntensity:.3}));}
   for(const [i,[x,z]] of (g.layout?.planters||[[-34,23],[34,-24],[32,9]]).entries())plant(this.level,x,z,i);
   for(const z of [-23,-7,9,23]){box(this.level,[20,.05,.05],[0,7.8,z],mat(0xe4f7ed,{emissive:0xa3dace,emissiveIntensity:.55}));}
  }
  detailsBatch(this.level,details);
  dressing(this.level, stage,g.layout?.dressing);this.lamps=[];this.level.traverse(o=>{if(o.isPointLight)this.lamps.push({light:o,base:o.intensity});});
  const frames=g.layout?.dressing?.paintings||[[-24,-26.2,0,'archive'],[24,-26.2,0,'turbine'],[22,26.2,Math.PI,'dispatch'],[-22,26.2,Math.PI,'workshop'],[8,-26.2,0,'hall'],[-11.55,-4,Math.PI/2,'hall_west'],[11.55,-4,-Math.PI/2,'hall_east']];
  const captions=[
   {archive:['ЛЕВАЯ ТРУБА',['Это не резерв','Шкаф — 4']],turbine:['ПРАВАЯ ТРУБА',['Вода идёт в насос','Полка — 1']],dispatch:['ПОРЯДОК ЩИТА',['Слева направо А, Б, В','Дело — 7']],workshop:['ТРИ ЛИНИИ',['Букву не ищите здесь','Сведите три комнаты']],hall:['ДО ПУСКА',['Клапан ещё слушается','Один день']],hall_west:['АРХИВ',['Ведомость на столе','Левая труба — не резерв']],hall_east:['ТУРБИНЫ',['Карточка на столе','Правая — в насос']]},
   {archive:['СЕМЕЙНОЕ ДЕЛО',['Сейф в этой комнате','Шкаф, полка, дело']],turbine:['2016',['Не обрывай связь','Дождись сигнала']],dispatch:['ГОЛОС',['Дата — сегодня','Сначала резерв']],workshop:['КОНТУР 4',['Цепь собирают у арки','Не в этих комнатах']],hall:['ЦЕПЬ',['Не напрямик','Обход снизу']],hall_west:['АРХИВ',['Сейф семейного дела','Письмо до пульта']],hall_east:['ТУРБИНЫ',['Снимок последней смены','Отец просил ждать']]},
   {archive:['ДЕЛО СОКОЛОВА',['Цифры остались в 1978','Три комнаты']],turbine:['РОТОРЫ',['Ждут открытый резерв','Буквы здесь нет']],dispatch:['СВЯЗЬ',['Катушка за водой','Сначала клапан']],workshop:['МУЗЕЙ',['Станция та же','Вода помнит резерв']],hall:['ПОСЛЕ НАС',['Отчёт лежит у клапана','Буква на нём стёрта']],hall_west:['АРХИВ',['Карточка без цифр','Смотрите 1978']],hall_east:['ТИШИНА',['Роторы ждут резерв','Катушка за водой']]},
  ][stage];
  const frameWood=metal(stage===2?0x6d807c:0x6b4e38,.72);
  for(const [x,z,yaw,slot] of frames){
   const [title,lines]=captions[slot];
   const frame=new THREE.Group();frame.position.set(x,1.55,z);frame.rotation.y=yaw;frame.name='painting';this.level.add(frame);
   casing(frame,[1.35,.96,.07],[0,0,0],frameWood,.02);
   if(slot!=='hall_west'&&slot!=='hall_east'){
    for(const side of [-1,1])casing(frame,[.075,.13,.70],[side*.45,.29,-.31],dark,.02);
   }
   surface(frame,[0,0,.046],[1.12,.74],title,lines,stage===2,0);
  }
  this.portal=g.portal?buildPortal(this.level,g.portal,(text,pos,width,parent)=>{
   mountedSign(parent,text,pos,width,.34);
  }):null;
  this.portal?.setState(g.portal);
  this.fusePickup=null;
  this.caseReel=null;
  const slips={signature:['ШКАФ — 4',['Левая труба — не резерв']],carrier:['ПОЛКА — 1',['Правая труба — в насос']],delay:['ДЕЛО — 7',['Слева направо: А, Б, В']],photo:['2016',['Не обрывай связь']],radio:['СЕГОДНЯ',['Сначала открой резерв']],safe_note:['СЕЙФ',['Шкаф, полка, дело']],registry:['СЕМЕЙНОЕ ДЕЛО',['Архивная копия']]};
  for(const c of g.epoch.clues){
   if(c.requires==='valve'&&!g.repairs.valve)continue;
   const onDesk=!!slips[c.id];
   const p=new THREE.Group();p.position.set(c.pos[0],(c.id==='lines'||onDesk) ? .985 : 1.03,c.pos[1]);this.level.add(p);
   if(c.id==='portal_fuse'){
    p.name='portal-fuse';p.position.y=.55;
    const caseBase=casing(this.level,[.65,.53,.45],[c.pos[0],.28,c.pos[1]],dark,.035);
    casing(this.level,[.58,.055,.37],[c.pos[0],.56,c.pos[1]],steel,.014);
    for(const x of [-.14,.14])casing(p,[.075,.056,.11],[x,.039,0],dark,.014);
    caseBase.name='fuse-case';
    const fuse=cylinder(p,.072,.34,[0,.08,0],orange,.072,12);fuse.rotation.z=Math.PI/2;
    for(const x of [-.16,.16])cylinder(p,.079,.065,[x,.08,0],steel,.079,12).rotation.z=Math.PI/2;
    this.fusePickup=p;p.visible=!g.inventory?.includes(c.id);
   }else if(c.id==='fatherlog'){
    p.name='father-recording';p.position.y=.978;reel(p,[0,.055,0]);this.caseReel=p;p.visible=!g.inventory?.includes('fatherlog');
   }else if(c.id==='calibration'){
    casing(this.level,[.56,.94,.21],[c.pos[0],.49,c.pos[1]],dark,.022);
    casing(this.level,[.66,.08,.23],[c.pos[0],.06,c.pos[1]],steel,.014);
    casing(p,[.66,.41,.19],[0,.15,0],dark);
    surface(p,[0,.16,.102],[.55,.31],'ДИАГНОСТИКА',['Буква на листе стёрта','Три комнаты 1978'],true);
    box(p,[.34,.004,.01],[.05,.2,.12],mat(0x6d5a3a));
    pipe(p,[[0,.13,-.04],[0,-.91,-.04],[-.51,-1,-.35]],.037,piping,.15);
   }else if(c.id==='pass'){
    casing(this.level,[.72,.81,.65],[c.pos[0],.423,c.pos[1]],dark,.035).name='pass-stand';
    casing(this.level,[.78,.10,.71],[c.pos[0],.928,c.pos[1]],steel,.02);
    p.position.y=.989;
    casing(p,[.34,.02,.22],[0,0,0],paper,.008);
    box(p,[.1,.006,.12],[-.08,.016,0],mat(0x6d7c78));
   }else if(c.id==='lines'){
    casing(p,[.62,.02,.4],[0,0,0],paper,.008);
    for(const y of [-.08,0,.08])box(p,[.4,.004,.012],[0,.016,y],mat(0x5c6a62));
   }else{
    casing(p,[.5,.025,.36],[0,0,0],future?dark:paper,.01);
    if(slips[c.id]){
     const sheet=surface(p,[0,.02,0],[.46,.32],slips[c.id][0],slips[c.id][1],future,0);
     sheet.rotation.x=-Math.PI/2;
    }else for(let k=0;k<4;k++)box(p,[.3,.002,.01],[0,.014,-.1+k*.055],mat(0x819080));
   }
   this.pickups.set(c.id,p);
  }
  // The family safe is a real hinged cabinet in the 2026 archive.
  this.safeDoor=null;if(stage===1){const p=new THREE.Group();p.position.set(-24,0,-23);this.level.add(p);for(const x of [-.75,.75])box(p,[.15,2,.9],[x,1,0],mat(0x647b73));for(const y of [.07,1.93])box(p,[1.65,.14,.9],[0,y,0],mat(0x647b73));box(p,[1.65,2,.12],[0,1,-.4],mat(0x647b73));box(p,[1.35,1.65,.04],[0,1,-.31],mat(0x2d4441));box(p,[.8,.05,.5],[0,.25,.05],paper);box(p,[.45,.04,.3],[.1,.33,.03],paper);const hinge=new THREE.Group();hinge.position.set(-.75,1,.57);p.add(hinge);casing(hinge,[1.5,1.85,.13],[.75,0,0],mat(0x82968a));for(const y of [-.55,.55])box(hinge,[.09,.2,.12],[.04,y,.08],steel);casing(hinge,[.48,.28,.07],[.75,.23,.1],mat(0x314b4b));for(let k=0;k<3;k++)box(hinge,[.1,.14,.03],[.61+k*.15,.23,.15],paper);mesh(new THREE.TorusGeometry(.17,.025,8,24),steel,hinge,[1.07,-.24,.12]);this.safeDoor=hinge;surface(hinge,[.75,.58,.083],[1.20,.30],'СЕМЕЙНОЕ ДЕЛО',['СОКОЛОВЫ · АРХИВ'],false);}
  const consolePos=g.beacon_position||[-7,21];
  const consoleRoot=emergencyConsole(this.level,[consolePos[0],0,consolePos[1]],future,g.repairs.valve,stage===1);
  if(stage===1)surface(consoleRoot,[0,.63,.326],[1.03,.37],'АВАРИЙНЫЙ ПУЛЬТ',['Водосброс  /  Контур 4']);
  const repaired=g.repairs.valve;
  const valve=valveBank(this.level,[-29,0,7],stage,repaired);
  this.reserveWheel=valve.userData.reserveWheel;
  for(const [i,text] of ['А','Б','В'].entries()){
   const x=(i-1)*.79;
   casing(valve,[.34,.22,.085],[x,2.36,.12],dark,.012);
   mountedSign(valve,text,[x,2.36,.175],.29,.15);
  }
  bench(this.level,-28,-5,stage,wood,piping,dark);
  wallBox([6,.65,.7],[-25,3.6,0],plaster);wallSign('ЗАПАДНЫЙ ПРОХОД',[-25,3.55,.4],0,3.6);
  if(g.flooded){const flood=box(this.level,[6,.08,8],[-25,.08,0],mat(0x6eacbe,{transparent:true,opacity:.85,roughness:.15}));flood.name='flood-water';for(const z of [-2,2]){box(this.level,[5,.16,.16],[-25,1,z],orange);for(const x of [-27,-23])box(this.level,[.09,1.2,.09],[x,.6,z],steel);}wallSign('ЗАТОПЛЕНО',[-25,1.3,2.12],0,2.0);}
  if(stage===1){
   const c=document.createElement('canvas');c.width=256;c.height=256;const ctx=c.getContext('2d');
   for(let i=0;i<18;i++){const x=16+(i*73)%224,y=8+(i*37)%120;const gradient=ctx.createLinearGradient(x,y,x,256);gradient.addColorStop(0,'rgba(41,65,54,.34)');gradient.addColorStop(1,'rgba(41,65,54,0)');ctx.fillStyle=gradient;ctx.fillRect(x,y,3+(i%5),256-y);}
   const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;
   const material=new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1});
   for(const z of [1.6,5.5]){const stain=mesh(new THREE.PlaneGeometry(2.6,2.7),material,this.level,[-32.738,1.7,z]);stain.rotation.y=Math.PI/2;stain.castShadow=false;stain.name='local-water-damage';}
  }
  addContactShadows(this.level,g.solids);
  this.batchedMeshes=batchStaticMeshes(this.level,[this.safeDoor,this.reserveWheel,...this.machineRotors,...this.pickups.values(),this.level.getObjectByName('time-portal'),this.level.getObjectByName('portal-console'),...(this.exitDoors||[])]);
 }
 startFlood(g,motion=true){
  const sceneState={...g,stage:1,epoch:{year:2026,name:'Авария на станции',clues:[],terminals:[],hazards:[]}};this.build(sceneState);this.releaseLook();this.setActive(false);this.inGame=true;this.player.visible=false;this.npc.visible=false;this.oldMovieFov=this.camera.fov;this.camera.fov=58;this.camera.updateProjectionMatrix();this.sun.intensity=.65;
  const water=box(this.level,[72,.18,54],[0,-.2,0],mat(0x377f96,{transparent:true,opacity:.87,roughness:.17,metalness:.2,depthWrite:false}));water.name='accident-water';water.castShadow=false;
  const alarm=new THREE.PointLight(0xef674a,100,65,1.5);alarm.position.set(3,4,8);this.level.add(alarm);
  const drops=[];for(let i=0;i<64;i++){const o=mesh(new THREE.SphereGeometry(.06,6,5),mat(0x75bad1,{transparent:true,opacity:.7,depthWrite:false}),this.level);o.castShadow=false;o.userData.spray=i%2?[-3,2,-12]:[3,1.8,1];drops.push(o);}
  this.floodCinematic={started:performance.now(),water,alarm,drops,motion};this.camera.position.set(-24,2.7,12);this.camera.lookAt(-29,1.2,7);
 }
 floodStep(dt){const c=this.floodCinematic,t=(performance.now()-c.started)/1000;c.water.position.y=-.12+Math.min(1,t/7.5)*1.9;c.alarm.intensity=c.motion?65+Math.sin(t*2.2)*25:60;for(let i=0;i<c.drops.length;i++){const drop=c.drops[i],phase=(t*1.2+i/36)%1,[x,y,z]=drop.userData.spray;drop.position.set(x+Math.sin(i*2.3)*phase*2.7,y+.8*phase-2.8*phase*phase,z+Math.cos(i*2.3)*phase*2.7);drop.scale.setScalar(.5+phase*.7);}const shot=!c.motion?1:t<2.5?0:t<6?1:2;const poses=[[-24,2.7,12],[12,6,17],[0,5.7,25]],looks=[[-29,1.2,7],[0,1.3,-2],[0,.9,2]];this.camera.position.lerp(new THREE.Vector3(...poses[shot]),1-Math.exp(-dt*2));if(c.motion){this.camera.position.x+=Math.sin(t*17)*.05;this.camera.position.y+=Math.sin(t*23)*.035;}this.camera.lookAt(...looks[shot]);c.water.material.opacity=.78+Math.sin(t*3)*.08;this.player.visible=false;this.npc.visible=false;}
 endFlood(){if(!this.floodCinematic)return;this.floodCinematic.alarm.intensity=0;this.floodCinematic.drops.forEach(o=>o.visible=false);this.floodCinematic=null;this.camera.fov=this.oldMovieFov||63;this.camera.updateProjectionMatrix();this.npc.visible=!!this.game?.npc_position;this.cameraReady=false;}
 setMotion(v){this.motion=v;this.atmosphere?.setReduced(!v);}
 setGraphics(level){const next=level===0||level===2?level:1;if(this.graphics===next)return;this.graphics=next;const ratio=next===2?Math.min(devicePixelRatio,1.75):next===1?Math.min(devicePixelRatio,1.35):1;this.renderer.setPixelRatio(ratio);const shadow=next===2?2048:next===1?1024:512;this.sun.shadow.mapSize.set(shadow,shadow);if(this.sun.shadow.map){this.sun.shadow.map.dispose();this.sun.shadow.map=null;}this.scene.environment=next===0?null:environmentFor(this.game?.stage||0);this.atmosphere?.setQuality(next);if(this.game)this.build(this.game);this.resize();}
 startDeparture(){
  this.departure={age:0,origin:this.npc.position.clone()};
  this.npc.visible=true;
 }
 departureStep(dt){
  const shot=this.departure;
  shot.age+=dt;
  const points=[shot.origin,new THREE.Vector3(0,0,Math.min(shot.origin.z,20)),new THREE.Vector3(0,0,24.2),new THREE.Vector3(0,0,26.6),new THREE.Vector3(0,0,31.5)];
  const speed=2.7,open=THREE.MathUtils.smoothstep(shot.age,.35,2.4);
  for(const door of this.exitDoors||[])door.rotation.y=door.userData.swing*(.2+open*1.25);
  let distance=shot.age*speed;
  for(let i=1;i<points.length;i++){
   const from=points[i-1],to=points[i],length=from.distanceTo(to);
   if(distance<length){
    this.npc.position.lerpVectors(from,to,distance/Math.max(length,.001));
    this.npc.rotation.y=Math.atan2(to.x-from.x,to.z-from.z);
    animateArrival(this.npc,dt,(shot.age%1.25)/1.25);
    return;
   }
   distance-=length;
  }
  this.departure=null;
  this.npc.visible=false;
 }
 startConfession(){
  this.releaseLook();
  this.confession={start:performance.now(),position:this.npc.position.clone(),rotation:this.npc.rotation.y};
  this.portal?.setState({...this.game.portal,target:0});
 }
 confessionStep(dt){
  const scene=this.confession;
  const t=(performance.now()-scene.start)/1000;
  const motion=this.motion!==false;
  const approach=motion?THREE.MathUtils.smoothstep(t,0,3.5):1;
  const memory=t<8.3;
  this.npc.visible=true;
  this.player.visible=!memory;
  const x=THREE.MathUtils.lerp(scene.position.x,5.5,approach);
  const z=THREE.MathUtils.lerp(scene.position.z,21.9,approach);
  this.npc.position.set(memory?x:scene.position.x,0,memory?z:scene.position.z);
  this.npc.rotation.y=memory?(approach<.98?1.0:2.65):scene.rotation;
  if(memory&&motion&&approach<1)animateArrival(this.npc,dt,approach);
  if(this.father){
   this.father.visible=memory;
   this.father.position.set(4,0,18.8);
   this.father.rotation.y=0;
   if(memory)animatePerson(this.father,dt);
  }
  if(memory&&this.portal){
   const reach=THREE.MathUtils.smoothstep(t,6.85,7.72);
   reachForSwitch(this.npc,this.portal.breakerPosition(),reach);
  }
  const shut=t>=7.75;
  if(shut&&this.portal?.state.target!=null){
   this.portal.setBreaker(true);
   this.portal.setState({...this.game.portal,target:null});
   this.events.breaker?.();
  }
  if(memory){
   this.camera.position.set(9.0,2.3,24.8);
   this.camera.lookAt(4.3,1.48,20.1);
  }else{
   const p=this.npc.position;
   this.camera.position.set(p.x+2.6,1.9,p.z+2.75);
   this.camera.lookAt(p.x,1.38,p.z);
  }
 }
 endConfession(){
  const shot=this.confession;
  if(!shot)return;
  this.confession=null;
  this.npc.position.copy(shot.position);
  this.npc.rotation.y=shot.rotation;
  this.portal?.setBreaker(false);
  if(this.father)this.father.visible=false;
  this.portal?.setState(this.game.portal);
  this.cameraReady=false;
 }
 startReunion(motion){
  if(!this.portal||!this.father)return false;
  this.releaseLook();
  this.reunion={elapsed:0,motion,position:this.player.position.clone(),rotation:this.player.rotation.y,fov:this.camera.fov,npcVisible:this.npc.visible};
  this.player.position.set(3.3,0,23.2);
  this.player.rotation.y=2.84;
  this.npc.visible=false;
  this.camera.fov=55;
  this.camera.updateProjectionMatrix();
  this.portal.setState({...this.game.portal,target:1});
  return true;
 }
 reunionStep(dt){
  const shot=this.reunion;
  const ready=!!this.father.userData.rig;
  if(ready)shot.elapsed+=dt;
  const time=shot.elapsed;
  const progress=shot.motion?THREE.MathUtils.clamp((time-.65)/2.15,0,1):1;
  const approach=shot.motion?THREE.MathUtils.smoothstep(time,2.1,4.3):1;
  this.father.visible=ready&&(time>=.55||!shot.motion);
  this.father.position.set(4,0,19.18+progress*2.65);
  this.father.rotation.y=-.22*progress;
  if(this.father.visible)animateArrival(this.father,dt,progress);
  this.player.visible=true;
  const nextZ=23.4-approach*.82;
  shot.stepDistance=time>2.1?Math.abs(nextZ-this.player.position.z):0;
  this.player.position.set(3.3+approach*.32,0,nextZ);
  this.player.rotation.y=2.83;
  if(time>3&&this.portal.state.target!=null)this.portal.setState({...this.game.portal,target:null});
  placeFootShadow(this.fatherShadow,this.father);
  const drift=shot.motion?Math.min(1,time/6):1;
  this.camera.position.set(8.25-drift*.55,2.18,24.45-drift*.5);
  this.camera.lookAt(4,1.48,21.22);
 }
 endReunion(){
  if(!this.reunion)return;
  const shot=this.reunion;this.reunion=null;
  this.player.position.copy(shot.position);
  this.player.rotation.y=shot.rotation;
  this.npc.visible=shot.npcVisible;
  this.father.visible=false;this.fatherShadow.visible=false;
  this.camera.fov=shot.fov;this.camera.updateProjectionMatrix();
  this.cameraReady=false;this.portal?.setState(this.game.portal);
 }
 startEnding(kind,motion){
  this.releaseLook();
  this.endingShot={kind,motion,elapsed:0,position:this.player.position.clone(),rotation:this.player.rotation.y,fov:this.camera.fov,npcVisible:this.npc.visible};
  this.npc.visible=false;this.npcShadow.visible=false;
  if(this.father)this.father.visible=false;
  this.player.visible=true;
  this.camera.fov=48;
  this.camera.updateProjectionMatrix();
  return true;
 }
 endingStep(dt){
  const shot=this.endingShot;
  shot.elapsed+=dt;
  const drift=shot.motion?Math.min(1,shot.elapsed/6):1;
  this.player.visible=true;
  this.player.position.set(-5.5,0,19.2);
  this.player.rotation.y=.18;
  this.camera.position.set(-2.15-drift*.35,2.02,23.15-drift*.15);
  this.camera.lookAt(-5.35,1.42,19.25);
 }
 endEnding(){
  if(!this.endingShot)return;
  const shot=this.endingShot;this.endingShot=null;
  this.player.position.copy(shot.position);
  this.player.rotation.y=shot.rotation;
  this.npc.visible=shot.npcVisible;
  this.camera.fov=shot.fov;this.camera.updateProjectionMatrix();
  this.cameraReady=false;
  if(this.game)this.portal?.setState(this.game.portal);
 }
 setMemory(v){this.atmosphere?.setMemory(v);if(!v&&this.game)this.atmosphere?.apply(this,this.game.stage);}
 pulseValve(){if(this.reserveWheel)this.reserveWheel.rotation.z=0;}
 footSurface(){
  const {x,z}=this.player.position,portal=this.game?.portal?.position;
  if(portal&&Math.abs(x-portal[0])<=1.32&&Math.abs(z-portal[1])<=.48)return 'metal';
  if(this.game?.stage===0||this.game?.stage===2)return 'tile';
  return 'concrete';
 }
 jump(){if(this.active&&this.jumpAge===null)this.jumpAge=0;}
 position(){return [Number(this.player.position.x.toFixed(3)),Number(this.player.position.z.toFixed(3))];}
 nearest(){
  const g=this.game;if(!g)return null;
  const p=this.position(), dist=q=>Math.hypot(p[0]-q[0],p[1]-q[1]);
  const targets=[];
  if(g.npc_position)targets.push({type:'npc',pos:g.npc_position,height:1.36,name:'Сергей Морозов',verb:'Поговорить'});
  if(g.portal)targets.push({type:'travel',pos:g.portal.console,height:1.17,name:'Щиток портала',verb:g.portal.repaired?'Настроить':g.inventory?.includes('portal_fuse')?'Собрать пазл':'Осмотреть'});
  if(g.stage===0)targets.push({type:'bypass',pos:g.valve_position,height:1.25,name:'Западный клапан',verb:'Переключить'});
  if(g.stage===1)targets.push({type:'finale',pos:g.beacon_position,height:.94,name:'Аварийный пульт',verb:'Открыть'},
    {type:'safe',pos:g.safe_position,height:1,name:'Архивный сейф',verb:'Открыть'});
  for(const c of g.epoch.clues){
   if(c.requires==='valve'&&(!g.repairs.valve||g.inventory.includes(c.id)))continue;
   if(c.id==='portal_fuse'&&(g.portal?.repaired||g.inventory.includes(c.id)))continue;
   const pickup=this.pickups.get(c.id);
   if(!pickup?.visible)continue;
   targets.push({type:'clue',id:c.id,pos:c.pos,height:pickup.position.y+.07,name:c.name,
    verb:['portal_fuse','fatherlog','carrier','signature','pass'].includes(c.id)?'Взять':'Осмотреть'});
  }
  // Select only objects in reach and near the centre of the view.
  this.camera.updateMatrixWorld();
  const anchor=new THREE.Vector3(),ray=new THREE.Vector3();
  const aspect=this.camera.aspect;
  let focused=null,best=Infinity;
  for(const target of targets){
   if(!target.pos)continue;
   const distance=dist(target.pos);
   if(distance>=2.5)continue;
   anchor.set(target.pos[0],target.height,target.pos[1]);
   ray.subVectors(anchor,this.camera.position);
   const length=ray.length();
   anchor.project(this.camera);
   const offset=Math.hypot(anchor.x*aspect,anchor.y);
   if(anchor.z < -1 || anchor.z > 1 || Math.abs(anchor.x)>1 || offset>.42)continue;
   ray.multiplyScalar(1/Math.max(length,.001));
   if(this.collision.cameraLimit(this.camera.position,ray,length,{margin:0,ignoreAtEnd:.55})<length)continue;
   const score=offset+distance*.035;
   if(score<best){best=score;focused=target;}
  }
  return focused;
 }
 hurt(){this.hurtUntil=this.elapsed+1;this.player.position.set(-2,0,21);this.velocity.set(0,0);this.cameraReady=false;}
 cameraStep(dt){
  if(this.confession){this.confessionStep(dt);return;}
  if(this.reunion){this.reunionStep(dt);return;}
  if(this.endingShot){this.endingStep(dt);return;}
  if(this.floodCinematic){this.floodStep(dt);return;}
  const p=this.player.position;if(!this.inGame){this.player.visible=true;const target=new THREE.Vector3(31,29,48);this.camera.position.lerp(target,.06);this.camera.lookAt(0,1,0);this.cameraReady=false;return;}
  if(!this.active&&this.cameraReady)return;
  const eye=new THREE.Vector3(p.x,p.y+1.58,p.z),forward=new THREE.Vector3(Math.sin(this.yaw)*Math.cos(this.pitch),-Math.sin(this.pitch),-Math.cos(this.yaw)*Math.cos(this.pitch));
  if(this.mode==='first'){const phase=this.player.userData.rig?.phase||0,amp=this.motion===false?0:this.sprinting?.04:.022;if(this.travelled>.001&&this.jumpAge===null)eye.y+=Math.sin(phase*CLIP_FOOTFALLS*Math.PI*2)*amp;else if(this.motion!==false)eye.y+=Math.sin(this.elapsed*1.5)*.008;if(this.jumpAge!==null)eye.y+=Math.sin(Math.min(1,this.jumpAge)*Math.PI)*.06;this.camera.position.copy(eye);this.camera.lookAt(eye.clone().add(forward));this.player.visible=false;}
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
   const next=focus.clone().addScaledVector(direction,Math.max(.11,this.cameraDistance));
   if(!this.cameraReady)this.camera.position.copy(next);else this.camera.position.lerp(next,1-Math.exp(-dt*8));
   this.camera.lookAt(focus);
   this.player.visible=this.cameraDistance>.65;
  }

  this.cameraReady=true;
 }
 drawMap(){const c=document.getElementById('mini-map');if(!c||!this.game)return;const ctx=c.getContext('2d'),sx=x=>10+(x+36)*2.5,sz=z=>5+(z+27)*2.5;ctx.clearRect(0,0,200,146);ctx.fillStyle='#172327';ctx.fillRect(0,0,200,146);ctx.strokeStyle='#697774';ctx.strokeRect(10,5,180,135);ctx.fillStyle='#647471';for(const [x,z,w,d] of this.game.walls)ctx.fillRect(sx(x-w/2),sz(z-d/2),Math.max(1,w*2.5),Math.max(1,d*2.5));ctx.font='bold 8px system-ui';ctx.textAlign='center';ctx.lineWidth=3;ctx.strokeStyle='#102028';ctx.fillStyle='#f7f4ea';for(const [n,x,z] of [['АРХИВ',-24,-24],['ТУРБИНЫ',24,-24],['ДИСПЕТЧЕРСКАЯ',22,14],['МАСТЕРСКАЯ',-24,24],['ПУЛЬТ',-6,24]]){ctx.strokeText(n,sx(x),sz(z));ctx.fillText(n,sx(x),sz(z));}const p=this.player.position;ctx.fillStyle='#c28a39';for(const q of this.game.epoch.clues)if((!q.requires||this.game.repairs.valve)&&Math.hypot(p.x-q.pos[0],p.z-q.pos[1])<8)ctx.fillRect(sx(q.pos[0])-2,sz(q.pos[1])-2,4,4);const goal=this.game.objective;
 if(goal&&(goal.stage===this.game.stage||goal.target[0]===this.game.portal?.position[0]&&goal.target[1]===this.game.portal?.position[1])){
  const [x,z]=goal.target;
  ctx.strokeStyle='#f3bb64';ctx.lineWidth=1.4;ctx.beginPath();
  ctx.arc(sx(x),sz(z),5,0,Math.PI*2);ctx.stroke();
  ctx.fillStyle='#f3bb64';ctx.fillRect(sx(x)-1,sz(z)-1,2,2);
 }
 ctx.fillStyle='#466d53';ctx.beginPath();if(this.game.npc_position){ctx.arc(sx(this.game.npc_position[0]),sz(this.game.npc_position[1]),3,0,Math.PI*2);ctx.fill();}if(this.game.flooded){ctx.fillStyle='#78aabd';ctx.fillRect(sx(-28),sz(-3),15,15);}ctx.save();ctx.translate(sx(p.x),sz(p.z));ctx.rotate(this.yaw);ctx.fillStyle='#8ed2ee';ctx.beginPath();ctx.moveTo(0,-5);ctx.lineTo(4,4);ctx.lineTo(0,2);ctx.lineTo(-4,4);ctx.closePath();ctx.fill();ctx.restore();}
 tick(){requestAnimationFrame(()=>this.tick());const dt=Math.min(this.clock.getDelta(),.15);if(this.active||this.key===undefined)this.elapsed+=dt;const t=this.elapsed;
  if(this.active&&this.game){
   const view=this.lookInput||{x:0,y:0};this.targetYaw+=view.x*1.0*dt;this.targetPitch=THREE.MathUtils.clamp(this.targetPitch+view.y*.7*dt,-.65,1.05);
   const lookMix=1-Math.exp(-dt*28);this.yaw+=(this.targetYaw-this.yaw)*lookMix;this.pitch+=(this.targetPitch-this.pitch)*lookMix;
   let {x,z}=this.input;const length=Math.hypot(x,z);if(length>1){x/=length;z/=length;}const co=Math.cos(this.yaw),si=Math.sin(this.yaw),dx=x*co-z*si,dz=x*si+z*co;
   const speed=this.sprinting?RUN_SPEED:WALK_SPEED;const displacement=integrateMotion(this.velocity,dx*speed,dz*speed,dt,length>.01?11:14);if(length<.01&&this.velocity.length()<.02)this.velocity.set(0,0);
   const p=this.player.position,oldX=p.x,oldZ=p.z;
   this.collision.move(p,displacement.x,displacement.z);
   const crossing=portalCrossing(this.game.portal,oldX,oldZ,p.x,p.z);
   if(crossing)this.events.enterPortal?.(crossing);
   if(this.jumpAge!==null){
    this.jumpAge+=dt;
    const flight=this.jumpAge-JUMP.takeoff;
    p.y=Math.max(0, 8.6*flight*(JUMP.land-JUMP.takeoff-flight));
    if(this.jumpAge>=JUMP.end)this.jumpAge=null;
   }
   const actualSpeed=Math.hypot(p.x-oldX,p.z-oldZ)/Math.max(dt,.001),moving=actualSpeed>.06;
   if(moving){const facing=Math.atan2(p.x-oldX,p.z-oldZ),turn=Math.atan2(Math.sin(facing-this.player.rotation.y),Math.cos(facing-this.player.rotation.y));this.player.rotation.y+=turn*(1-Math.exp(-dt*8));}
   this.travelled=Math.hypot(p.x-oldX,p.z-oldZ);
   if(this.wasAir&&this.jumpAge===null)this.events.land?.(this.footSurface());
   this.wasAir=this.jumpAge!==null;
  }
  if(this.game.repairs?.valve&&this.reserveWheel)this.reserveWheel.rotation.z=THREE.MathUtils.damp(this.reserveWheel.rotation.z,Math.PI/4,5,dt);
  animatePerson(this.player,dt,this.reunion?.motion?this.reunion.stepDistance||0:this.active?this.travelled:0,this.jumpAge);
  if(this.active&&this.jumpAge===null&&this.player.userData.rig?.footfalls>0)this.events.footstep?.(this.footSurface());
  if(this.departure)this.departureStep(dt);else animatePerson(this.npc,dt);
  if(this.active&&this.npc.visible&&!this.departure){const dx=this.player.position.x-this.npc.position.x,dz=this.player.position.z-this.npc.position.z;if(Math.hypot(dx,dz)<7){const face=Math.atan2(dx,dz),turn=Math.atan2(Math.sin(face-this.npc.rotation.y),Math.cos(face-this.npc.rotation.y));this.npc.rotation.y+=turn*(1-Math.exp(-dt*3.2));}}
  for(const rotor of this.machineRotors||[])rotor.rotation.y=t*(this.game.stage===2?.25:.045);for(const glow of this.machineLights||[])glow.material.emissiveIntensity=.55+Math.sin(t*.7)*.05;
  if(!this.floodCinematic&&this.motion!==false){for(let i=0;i<(this.lamps||[]).length;i++){const lamp=this.lamps[i];const blink=this.game?.stage===1&&Math.sin(t*2.1+i)>.9?.35:1;lamp.light.intensity=lamp.base*(.86+.14*Math.sin(t*(2+i*.3)+i))*blink;}}
  if(this.waterMat){const slide=this.waterMat.normalMap||this.waterMat.bumpMap;if(slide){slide.offset.x=t*.015;slide.offset.y=Math.sin(t*.2)*.01;}}
  this.portal?.update(dt,this.motion!==false);
  this.atmosphere?.update(this,dt,t);
  this.cameraStep(dt);placeFootShadow(this.playerShadow,this.player);placeFootShadow(this.npcShadow,this.npc);this.drawMap();this.renderer.render(this.scene,this.camera);
 }
}
