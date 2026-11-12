const {chromium}=require('playwright');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.STATION_BROWSER||undefined,headless:true});
 try{
  const page=await browser.newPage();
  await page.route('**/app.js',r=>r.fulfill({contentType:'text/javascript',body:''}));
  await page.goto(process.env.STATION_URL||'http://127.0.0.1:8765');
  const result=await page.evaluate(async()=>{
   const {person,animatePerson,WALK_SPEED,RUN_SPEED,JUMP}=await import('/people.js');
   const THREE=await import('/vendor/three.module.js');
   const root=person('anna');await root.userData.ready;const rig=root.userData.rig;
   const p=new THREE.Vector3(),k=new THREE.Vector3(),h=new THREE.Vector3();
   const clips=[];
   for(const name of ['Walk','Run']){
    for(const action of rig.actions.values())action.setEffectiveWeight(0);
    const action=rig.actions.get(name);action.setEffectiveWeight(1);
    const samples=[];
    for(let i=0;i<=240;i++){
     action.time=(i/240)*action.getClip().duration;rig.mixer.update(0);root.updateMatrixWorld(true);
     rig.scene.getObjectByName('foot_l').getWorldPosition(p);samples.push({phase:i/240,z:p.z,y:p.y});
    }
    clips.push({name,duration:action.getClip().duration,samples});
   }
   const jumps=[];
   for(const speed of [0,WALK_SPEED,RUN_SPEED]){
    for(const action of rig.actions.values())action.setEffectiveWeight(0);
    rig.actions.get('Idle_Standing').setEffectiveWeight(1);
    Object.assign(rig,{movement:0,running:0,jumping:0,smoothedSpeed:0,phase:0});
    for(let i=0;i<120;i++)animatePerson(root,1/60,speed/60);
    let maxCalfStretch=0,maxUpperStretch=0,worst=null;
    for(let i=0;i<Math.ceil((JUMP.end+.5)*120);i++){
     const age=i/120;
     animatePerson(root,1/120,speed/120,age<JUMP.end?age:null);root.updateMatrixWorld(true);
     for(const side of ['l','r']){
      rig.scene.getObjectByName('foot_'+side).getWorldPosition(p);rig.scene.getObjectByName('calf_'+side).getWorldPosition(k);rig.scene.getObjectByName('thigh_'+side).getWorldPosition(h);
      const calf=p.distanceTo(k)-rig.stand.legs[side].lower,upper=k.distanceTo(h)-rig.stand.legs[side].upper;
      if(calf>maxCalfStretch){maxCalfStretch=calf;worst={age,side,calf};}maxUpperStretch=Math.max(maxUpperStretch,upper);
     }
    }
    jumps.push({speed,maxCalfStretch,maxUpperStretch,worst});
   }
   return {clips,jumps};
  });
  for(const jump of result.jumps){
   assert(jump.maxCalfStretch<.001,'Feet must remain connected during the whole jump and its blend transitions');
   assert(jump.maxUpperStretch<.001,'The knee must remain connected to the thigh');
  }
  fs.writeFileSync(path.join(__dirname,'../reports/cadence-jump-probe.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify({clips:result.clips.map(({name,duration})=>({name,duration})),jumps:result.jumps},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
