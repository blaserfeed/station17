const {chromium}=require('playwright');
const fs=require('node:fs');
const path=require('node:path');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.STATION_BROWSER||undefined,headless:true,args:['--enable-unsafe-swiftshader']});
 const folder=path.join(__dirname,'../reports/screens/animation');fs.mkdirSync(folder,{recursive:true});
 try{
  const page=await browser.newPage({viewport:{width:800,height:900}});
  await page.goto(process.env.STATION_URL||'http://127.0.0.1:8765');
  await page.waitForFunction(()=>window.chronoshov?.state&&chronoshov.world.player.userData.rig,null,{timeout:60000});
  await page.locator('[data-ui="menu"]').click();await page.locator('[data-ui="new"]').click();await page.locator('[data-ui="close"]').click();
  await page.evaluate(()=>{
   const w=chronoshov.world;w.player.position.set(-8,0,17);w.player.rotation.y=0;w.releaseLook();w.player.visible=true;
   w.camera.fov=40;w.camera.updateProjectionMatrix();w.camera.position.set(-4.7,1.15,17.3);w.camera.lookAt(-8,.95,17);
   w.tick=function(){requestAnimationFrame(()=>this.tick());this.renderer.render(this.scene,this.camera);};
   document.querySelectorAll('header,footer,#hud,#map-panel,#countdown,#look-help,#interaction,#aim,#toast,#veil').forEach(e=>e.style.setProperty('display','none','important'));
  });
  for(const mode of ['walk','run'])for(const phase of [0,.125,.25,.375]){
   await page.evaluate(async({mode,phase})=>{
    const {animatePerson,WALK_SPEED,RUN_SPEED}=await import('/people.js');
    const {gaitAdvance}=await import('/locomotion.js');
    const w=chronoshov.world,rig=w.player.userData.rig,speed=mode==='walk'?WALK_SPEED:RUN_SPEED,running=mode==='run'?1:0;
    Object.assign(rig,{movement:1,running,smoothedSpeed:speed,jumping:0,phase:(phase-gaitAdvance(1/60,speed/60,running)+1)%1});
    animatePerson(w.player,1/60,speed/60);w.player.visible=true;
   },{mode,phase});
   await page.waitForTimeout(80);await page.screenshot({path:path.join(folder,`${mode}-${phase}.png`)});
  }
  console.log('Saved eight side views of the walk and run cycles');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
