const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

(async()=>{
 const browser=await chromium.launch({executablePath:process.env.STATION_BROWSER||undefined,headless:true,args:['--enable-unsafe-swiftshader']});
 const checks=[],errors=[];
 const pass=name=>{checks.push({name,status:'Pass'});console.log('PASS',name);};
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  page.on('pageerror',e=>errors.push(e.message));
  const click=name=>page.locator(`[data-ui="${name}"]`).click();
  await page.goto(process.env.STATION_URL||'http://127.0.0.1:8765');
  await page.waitForFunction(()=>window.chronoshov?.state&&chronoshov.world.player.userData.rig,null,{timeout:60000});
  await click('menu');await click('new');await click('close');
  await page.evaluate(()=>{
   const w=chronoshov.world;w.yaw=w.targetYaw=0;w.player.position.set(-8,0,21);
  });
  await page.keyboard.down('w');await page.waitForTimeout(1200);await page.keyboard.up('w');
  await page.waitForFunction(()=>chronoshov.world.velocity.length()<.05);
  const position=await page.evaluate(()=>chronoshov.world.position());
  await page.keyboard.press('Escape');
  await page.waitForFunction(()=>!chronoshov.state.game.timer.running);
  const remaining=await page.evaluate(()=>chronoshov.state.game.timer.remaining);
  await page.waitForTimeout(1200);
  assert.equal(await page.evaluate(()=>chronoshov.state.game.timer.remaining),remaining);
  await page.reload();await page.waitForFunction(()=>window.chronoshov?.state?.game);
  assert.deepEqual(await page.evaluate(()=>chronoshov.state.game.position),position);
  pass('Walking position survives pause and reload; paused time stays fixed');
  await click('menu');await click('continue');
  await page.evaluate(()=>{chronoshov.world.player.position.set(5.9,0,22.75);});
  await page.keyboard.press('r');await page.getByRole('heading',{name:'Портал времени'}).waitFor();
  await page.keyboard.press('Escape');
  await page.getByRole('heading',{name:'Пауза и настройки'}).waitFor();
  await page.waitForFunction(()=>!chronoshov.state.game.timer.running);
  await click('resume');
  await page.getByRole('heading',{name:'Портал времени'}).waitFor();
  pass('Escape pauses inside a dialog and resume restores that dialog');
  await click('close');
  await page.waitForFunction(()=>chronoshov.state.game.timer.running);
  await page.reload();await page.waitForFunction(()=>window.chronoshov?.state?.game&&!chronoshov.state.game.timer.running);
  pass('Normal reload sends a pause snapshot before leaving');
  // WebGL failure must remain visible after the asynchronous state request.
  const fallback=await browser.newPage();fallback.on('pageerror',e=>errors.push(e.message));
  await fallback.route('**/world.js',route=>route.fulfill({contentType:'text/javascript',body:'export class World { constructor(){throw Error("WebGL недоступен");} }'}));
  await fallback.goto(process.env.STATION_URL||'http://127.0.0.1:8765');
  await fallback.waitForFunction(()=>window.chronoshov?.state);
  await fallback.getByRole('heading',{name:'Не удалось открыть 3D сцену'}).waitFor();
  assert(await fallback.getByText('WebGL недоступен').isVisible());
  pass('WebGL error stays visible after server connection');
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(__dirname,'../reports/browser-regressions.json'),JSON.stringify({run_at:new Date().toISOString(),checks,pageErrors:errors},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
