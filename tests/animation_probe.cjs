const {chromium}=require('playwright');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.STATION_BROWSER||undefined,headless:true});
 try{
  const page=await browser.newPage();
  await page.route('**/app.js',route=>route.fulfill({contentType:'text/javascript',body:''}));
  await page.goto(process.env.STATION_URL||'http://127.0.0.1:8765');
  const result=await page.evaluate(async()=>{
   const {person,animatePerson,WALK_SPEED,RUN_SPEED}=await import('/people.js');
   const THREE=await import('/vendor/three.module.js');
   const root=person('anna');await root.userData.ready;
   const rig=root.userData.rig,results=[];
   for(const speed of [WALK_SPEED,RUN_SPEED]){
    rig.movement=0;rig.running=0;rig.smoothedSpeed=0;rig.phase=0;
    let maxCalfStretch=0,minFootY=Infinity,maxFootY=-Infinity,oppositePairs=0,pairSamples=0,minElbowBend=Infinity,maxElbowBend=-Infinity;
    const footPos=new THREE.Vector3(),kneePos=new THREE.Vector3(),shoulder=new THREE.Vector3(),elbow=new THREE.Vector3(),hand=new THREE.Vector3(),leftFoot=new THREE.Vector3(),rightFoot=new THREE.Vector3(),q=new THREE.Quaternion();
    for(let i=0;i<240;i++){
     animatePerson(root,1/60,speed/60);
     root.updateMatrixWorld(true);
     rig.scene.getWorldQuaternion(q);const forward=new THREE.Vector3(0,0,1).applyQuaternion(q),up=new THREE.Vector3(0,1,0).applyQuaternion(q);
     rig.scene.getObjectByName('foot_l').getWorldPosition(leftFoot);rig.scene.getObjectByName('foot_r').getWorldPosition(rightFoot);
     const lead=rightFoot.sub(leftFoot).dot(forward);
     for(const side of ['l','r']){
      rig.scene.getObjectByName('foot_'+side).getWorldPosition(footPos);
      rig.scene.getObjectByName('calf_'+side).getWorldPosition(kneePos);
      maxCalfStretch=Math.max(maxCalfStretch,footPos.distanceTo(kneePos)-rig.stand.legs[side].lower);
      minFootY=Math.min(minFootY,footPos.y);maxFootY=Math.max(maxFootY,footPos.y);
      rig.scene.getObjectByName('upperarm_'+side).getWorldPosition(shoulder);rig.scene.getObjectByName('lowerarm_'+side).getWorldPosition(elbow);rig.scene.getObjectByName('hand_'+side).getWorldPosition(hand);
      const upper=elbow.clone().sub(shoulder),lower=hand.clone().sub(elbow);
      if(i>60){
       const theta=Math.atan2(upper.dot(forward),-upper.dot(up)),phi=Math.atan2(lower.dot(forward),-lower.dot(up));
       const bend=Math.atan2(Math.sin(phi-theta),Math.cos(phi-theta));minElbowBend=Math.min(minElbowBend,bend);maxElbowBend=Math.max(maxElbowBend,bend);
       if(Math.abs(lead)>.15){pairSamples++;if(upper.dot(forward)*lead*(side==='l'?1:-1)>0)oppositePairs++;}
      }
     }
    }
    const phase=rig.phase;
    for(let i=0;i<60;i++)animatePerson(root,1/60,0);
    results.push({speed,maxCalfStretch,minFootY,maxFootY,oppositePairRatio:oppositePairs/pairSamples,minElbowBend,maxElbowBend,stopPhaseDrift:Math.abs(phase-rig.phase),idleWeight:rig.actions.get('Idle_Standing').getEffectiveWeight()});
   }
   const ground=[];
   const contact=(phase, mode)=>{
    // Walk is heel-to-toe, jog has a shorter contact. Measure the middle of loaded stance.
    const window=mode==='walk'?[.065,.20]:[.035,.12];
    return phase>window[0] && phase<window[1];
   };
   const footPosition=side=>rig.scene.getObjectByName('foot_'+side).getWorldPosition(new THREE.Vector3());
   const width=()=>Math.abs(footPosition('l').x-footPosition('r').x);
   const idleWidth=width();
   for(const speed of [WALK_SPEED,RUN_SPEED]){
    let maxDrift=0,maxWidth=0,maxStride=0,contacts=0;
    const previous={l:null,r:null};
    for(let frame=0;frame<360;frame++){
     root.position.z+=speed/120;
     animatePerson(root,1/120,speed/120);
     if(frame<120)continue;
     maxWidth=Math.max(width(),maxWidth);
     maxStride=Math.max(maxStride,Math.abs(footPosition('l').z-footPosition('r').z));
     for(const side of ['l','r']){
      const phase=(rig.phase*2+(side==='l'?0:.5))%1;
      const current=contact(phase,speed===WALK_SPEED?'walk':'run')?footPosition(side):null;
      if(current&&previous[side]){
       maxDrift=Math.max(maxDrift,current.distanceTo(previous[side]));
       contacts++;
      }
      previous[side]=current;
     }
    }
    ground.push({speed,maxDrift,maxWidth,maxStride,contacts});
   }
   return {clips:[...rig.actions.keys()],legs:rig.stand.legs,results,idleWidth,ground};
  });
  for(const item of result.results){assert(Number.isFinite(item.maxCalfStretch));assert(item.maxCalfStretch<.02,'Shoes must remain attached to the lower legs');assert(item.oppositePairRatio>.98,'Each arm must follow the opposite leg');assert(item.minElbowBend>0,'Elbows must bend forward');assert(item.maxElbowBend<1.2,'Elbows must not overbend');assert.equal(item.stopPhaseDrift,0);assert(item.idleWeight>.95);}
  assert(result.idleWidth<.20,'Idle feet should rest under the hips');
  for(const row of result.ground){
   assert(row.maxWidth<.22,'Gait should keep the feet under the hips');
   assert(row.maxStride<(row.speed===result.results[0].speed?.84:1.02),'Feet should stay within a natural stride for the rig');
   assert(row.contacts>25 && row.maxDrift<.012,'The planted shoe should stay in place as the body advances');
  }
  fs.writeFileSync(path.join(__dirname,'../reports/animation-probe.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify(result,null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
