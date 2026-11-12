const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.STATION_BROWSER||undefined,headless:true,args:['--enable-unsafe-swiftshader']});
 try{
  const page=await browser.newPage({viewport:{width:1000,height:700}}),errors=[],measurements=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.STATION_URL||'http://127.0.0.1:8765');
  await page.waitForFunction(()=>window.chronoshov?.state&&chronoshov.world.player.userData.rig,null,{timeout:60000});
  await page.locator('[data-ui="menu"]').click();await page.locator('[data-ui="new"]').click();await page.locator('[data-ui="close"]').click();
  for(const run of [false,true]){
   await page.evaluate(()=>{const w=chronoshov.world;chronoshov.controls.resetMotion();w.player.position.set(-8,0,25);w.velocity.set(0,0);w.yaw=w.targetYaw=0;w.cameraReady=false;});
   if(run)await page.keyboard.down('Shift');
   await page.keyboard.down('w');
   await page.waitForTimeout(500);
   const before=await page.evaluate(()=>({at:performance.now(),position:chronoshov.world.position()}));
   await page.waitForTimeout(1600);
   const after=await page.evaluate(()=>({at:performance.now(),position:chronoshov.world.position(),running:chronoshov.world.player.userData.rig.running,phase:chronoshov.world.player.userData.rig.phase}));
   await page.keyboard.up('w');if(run)await page.keyboard.up('Shift');
   const speed=(before.position[1]-after.position[1])/((after.at-before.at)/1000);
   assert(speed>(run?5.5:3),`Observed ${run?'running':'walking'} speed ${speed.toFixed(3)} m/s: ${JSON.stringify({before,after})}`);assert(run?after.running>.9:after.running<.1);
   measurements.push({mode:run?'run':'walk',speed,...after});
   await page.waitForFunction(()=>chronoshov.world.velocity.length()<.02);
   const stoppedPhase=await page.evaluate(()=>chronoshov.world.player.userData.rig.phase);
   await page.waitForTimeout(500);
   assert.equal(await page.evaluate(()=>chronoshov.world.player.userData.rig.phase),stoppedPhase);
  }
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(__dirname,'../reports/locomotion-current.json'),JSON.stringify({run_at:new Date().toISOString(),measurements,pageErrors:errors},null,2));
  console.log('PASS faster walking, distinct running animation and stable idle',measurements);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
