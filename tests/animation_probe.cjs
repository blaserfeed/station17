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
   return {clips:[...rig.actions.keys()],legs:rig.stand.legs,results};
  });
  for(const item of result.results){assert(Number.isFinite(item.maxCalfStretch));assert(item.maxCalfStretch<.02,'Shoes must remain attached to the lower legs');assert(item.oppositePairRatio>.98,'Each arm must follow the opposite leg');assert(item.minElbowBend>0,'Elbows must bend forward');assert(item.maxElbowBend<1.2,'Elbows must not overbend');assert.equal(item.stopPhaseDrift,0);assert(item.idleWeight>.95);}
  fs.writeFileSync(path.join(__dirname,'../reports/animation-probe.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify(result,null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
