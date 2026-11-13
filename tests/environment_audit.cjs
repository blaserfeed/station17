const {chromium}=require('playwright');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const shots=[
 ['hall',[-8,1.65,18],[0,2,-8]],
 ['archive',[-24,1.65,-15],[-28,1.2,-23]],
 ['workshop',[-24,1.65,18],[-30,1.3,10]],
 ['tanks',[24,1.65,-12],[24,1.7,-24]],
 ['control',[22,1.65,18],[28,1.2,18]],
 ['monitor',[27.55,1.53,-16.65],[27.53,1.21,-18.00]],
 ['valve',[-26.55,1.67,8.75],[-29,1.23,7]],
 ['museum-bench',[-25.9,1.6,-6.25],[-28,1.05,-5]],
 ['passage',[-25,1.65,6],[-25,1.2,-6]],
 ['windows',[32,1.65,5],[45,2,5]],
 ['roof',[-8,1.65,19],[0,8.5,0]],
 ['yard',[40,2.6,-21],[62,1.45,-27]],
 ['reservoir',[45,7,-47],[0,-1.2,-81]],
];
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.STATION_BROWSER||undefined,headless:true,args:['--enable-unsafe-swiftshader']});
 const output=path.join(__dirname,'../reports/screens/environment'+(process.env.STATION_SHOT_SUFFIX||''));fs.mkdirSync(output,{recursive:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.STATION_URL||'http://127.0.0.1:8765');
  await page.waitForFunction(()=>window.chronoshov?.state&&chronoshov.world.player.userData.rig,null,{timeout:60000});
  await page.locator('[data-ui="menu"]').click();await page.locator('[data-ui="new"]').click();
  const report=[];
  for(const stage of [1,0,2]){
   if(stage!==1)await page.evaluate(async target=>{
    let state=await(await fetch('/api/state')).json();
    async function act(kind,payload){
     const response=await fetch('/api/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind,payload,revision:state.revision,request_id:crypto.randomUUID()})});
     if(!response.ok)throw Error(await response.text());
     state=await response.json();
    }
    if(!state.game.portal.repaired){
     await act('collect',{id:'portal_fuse',position:[7.5,23]});
     await act('portal_repair',{position:state.game.portal.console,circuit:[1,0,3,2]});
    }
    await act('portal_open',{target,position:state.game.portal.console});
    await act('travel',{position:state.game.portal.position});
   },stage);
   await page.reload();await page.waitForFunction(()=>window.chronoshov?.state);
   await page.locator('[data-ui="menu"]').click();await page.locator('[data-ui="continue"]').click();
   await page.evaluate(()=>{
    chronoshov.controls.resetMotion();
    const w=chronoshov.world;w.setMode('first');w.releaseLook();w.player.visible=false;
    w.cameraStep=function(){if(!this.auditShot)return;this.camera.position.set(...this.auditShot.eye);this.camera.lookAt(...this.auditShot.target);this.player.visible=false;};
    document.querySelectorAll('header,footer,#map-panel,#countdown,#current-objective,#interaction,#aim,#toast').forEach(e=>e.style.setProperty('display','none','important'));
   });
   for(const [name,eye,target] of shots){
    await page.evaluate(({eye,target})=>{chronoshov.world.auditShot={eye,target};}, {eye,target});
    await page.waitForTimeout(150);
    await page.screenshot({path:path.join(output,`${[1978,2026,2074][stage]}-${name}.png`)});
   }
   report.push(await page.evaluate(()=>({year:chronoshov.state.game.epoch.year,calls:chronoshov.world.renderer.info.render.calls,triangles:chronoshov.world.renderer.info.render.triangles,geometries:chronoshov.world.renderer.info.memory.geometries})));
   await page.keyboard.press('Escape');await page.waitForFunction(()=>!chronoshov.state.game.timer.running);
  }
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(output,'audit.json'),JSON.stringify({run_at:new Date().toISOString(),views:shots.map(s=>s[0]),report,pageErrors:errors},null,2));
  console.log(JSON.stringify(report));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
