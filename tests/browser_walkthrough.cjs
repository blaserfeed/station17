const {chromium}=require('playwright');
const fs=require('node:fs');
const path=require('node:path');
const reports=path.resolve(__dirname,'../reports');
const screenshots=path.join(reports,'screens','portal-qa');
fs.mkdirSync(screenshots,{recursive:true});
const assert=require('node:assert/strict');

(async()=>{
 const browser=await chromium.launch({executablePath:process.env.STATION_BROWSER||undefined,headless:true,args:['--enable-unsafe-swiftshader']});
 try{
  const page=await browser.newPage({viewport:{width:1100,height:760}});
  const checks=[],errors=[];
  page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});
  const pass=name=>{checks.push({name,status:'Pass'});console.log('PASS',name);};
  const ui=(name,id)=>page.locator(`[data-ui="${name}"]${id===undefined?'':`[data-id="${id}"]`}`);
  const click=(name,id)=>ui(name,id).click();
  const key=name=>page.keyboard.press(name);
  const game=()=>page.evaluate(()=>chronoshov.state.game);
  const heading=(yaw,pitch=.14)=>page.evaluate(([yaw,pitch])=>{const w=chronoshov.world;w.yaw=w.targetYaw=yaw;w.pitch=w.targetPitch=pitch;w.cameraReady=false;},[yaw,pitch]);
  const place=([x,z])=>page.evaluate(([x,z])=>{
   const w=chronoshov.world;w.player.position.set(x,0,z);w.velocity.set(0,0);
  },[x,z]);
  const travel=async stage=>{
   const current=(await game()).stage;
   await key('r');await click('travel-to',stage);
   await page.waitForFunction(s=>chronoshov.state.game.portal.target===s&&chronoshov.world.active,stage);
   assert.equal((await game()).stage,current);
   await page.waitForFunction(()=>chronoshov.world.level.getObjectByName('portal-aperture').scale.x>.85);
   await walk('a',0,4.2,false);
   if(current===1&&stage===2&&!(await game()).inventory.includes('calibration')){
    await heading(0,.12);
    await page.screenshot({path:path.join(screenshots,'open-portal.png')});
   }
   await walk('w',1,20,false);
   await page.waitForFunction(s=>chronoshov.state.game.stage===s&&chronoshov.world.active,stage);
   assert.equal((await game()).portal.target,null);
  };
  const walk=async (direction,axis,target,greater)=>{
   await heading(0);
   await page.keyboard.down(direction);
   try{await page.waitForFunction(([axis,target,greater])=>{
    const value=chronoshov.world.position()[axis];return greater?value>=target:value<=target;
   },[axis,target,greater],{timeout:20000});}
   catch(error){error.message+=' '+JSON.stringify(await page.evaluate(()=>({position:chronoshov.world.position(),active:chronoshov.world.active,screen:chronoshov.screen})));await page.screenshot({path:path.join(screenshots,'failed-walk.png')});throw error;}
   finally{await page.keyboard.up(direction);}
   await page.waitForFunction(()=>chronoshov.world.velocity.length()<.2);
  };
  await page.goto(process.env.STATION_URL||'http://127.0.0.1:8765');
  await page.waitForFunction(()=>window.chronoshov?.state&&chronoshov.world.player.userData.rig&&chronoshov.world.npc.userData.rig,null,{timeout:60000});
  pass('Local skinned Anna and Sergey assets load');
  await click('menu');await click('new');await click('close');
  await page.waitForFunction(()=>chronoshov.state.game.timer.running);
  await page.evaluate(()=>chronoshov.world.setMode('third'));
  await key('r');assert.equal(await page.getByRole('heading',{name:'Портал времени'}).count(),0);
  await walk('s',1,22.6,true);await walk('d',0,6.15,true);
  await key('e');await page.getByRole('heading',{name:'Предохранитель портала'}).waitFor();
  console.log('Fuse collected');
  await click('close');await walk('w',1,22.15,false);await key('r');await click('portal-repair');
  await page.waitForFunction(()=>chronoshov.state.game.portal.repaired);await click('close');
  await travel(2);
  pass('Picked up the fuse, powered the portal, opened it and crossed the physical threshold');
  await walk('a',0,-7.7,false);await walk('w',1,9.0,false);await walk('a',0,-27.5,false);
  await key('e');
  await page.getByRole('heading',{name:'Отчёт о затоплении'}).waitFor();
  assert((await game()).inventory.includes('calibration'));
  pass('Reached the future report with keyboard movement');
  await click('close');
  await walk('w',1,8.7,false);
  await walk('d',0,-25.15,true);await walk('w',1,4.72,false);
  await heading(0,.23);
  await page.waitForTimeout(360);
  await page.screenshot({path:path.join(screenshots,'flooded.png')});
  assert(await page.evaluate(()=>!!chronoshov.world.level.getObjectByName('flood-water')));
  assert(!await page.evaluate(()=>chronoshov.world.level.getObjectByName('father-recording')));
  await place([5.9,22.75]);await travel(0);
  await walk('a',0,-7.7,false);await walk('w',1,8.9,false);await walk('a',0,-28.0,false);
  await walk('w',1,7.9,false);
  await key('e');
  await page.getByRole('heading',{name:'Западный клапан · 1978'}).waitFor();
  await key('3');
  await page.getByRole('button',{name:'Сверить с отчётом'}).click();await click('back-puzzle');
  assert.equal(await ui('select-pipe',2).getAttribute('aria-pressed'),'true');
  await key('f');
  await page.getByText('Эта труба замыкается сама на себя.',{exact:false}).waitFor();
  assert(!(await game()).repairs.valve);
  pass('One wrong route gives actionable feedback and journal preserves selection');
  await key('2');await page.screenshot({path:path.join(screenshots,'valve.png')});
  await key('f');await page.getByRole('button',{name:'К порталу',exact:true}).waitFor();
  assert((await game()).repairs.valve);
  assert(!(await game()).safe_open);
  await click('close');
  await place([5.9,22.75]);await travel(2);
  assert(!await page.evaluate(()=>chronoshov.world.level.getObjectByName('flood-water')));
  assert(await page.evaluate(()=>!!chronoshov.world.level.getObjectByName('father-recording')));
  pass('Repair drains the future wing and exposes a physical reel');
  await walk('a',0,-7.7,false);await walk('w',1,8.9,false);await walk('a',0,-25.5,false);await walk('w',1,-3.45,false);await walk('a',0,-26.45,false);
  await heading(-.48,.20);await page.waitForTimeout(260);
  await page.screenshot({path:path.join(screenshots,'dry.png')});
  await key('e');
  await page.getByRole('heading',{name:'Катушка с голосом отца'}).waitFor();
  assert((await game()).can_return);
  await click('close');await place([5.9,22.75]);await travel(1);
  await walk('a',0,-7.45,false);await walk('s',1,19.25,true);
  await key('e');
  await page.getByRole('heading',{name:'Аварийный пульт · 2026'}).waitFor();
  await click('finish','return');await click('payment','success');await click('finale');await click('finish','return');
  await page.waitForFunction(()=>chronoshov.world.father?.visible);
  await page.waitForFunction(()=>chronoshov.world.father.position.z>21.65);
  assert.equal(await page.locator('#finale-speaker').textContent(),'Олег Соколов');
  await page.screenshot({path:path.join(screenshots,'reunion.png')});
  await page.locator('#skip-finale').click();
  await page.getByRole('heading',{name:'Возвращение'}).waitFor();
  await page.locator('#epilogue').waitFor({state:'hidden'});
  assert.equal((await game()).phase,'results');
  assert.deepEqual((await game()).visits,[1,2,2]);
  assert.equal((await game()).P,250);
  assert((await game()).timer.remaining>0);
  pass('Oleg walks out of the portal and reunites with Anna in the rescue ending');
  await page.screenshot({path:path.join(screenshots,'result.png')});
  await page.reload();await page.waitForFunction(()=>chronoshov.state?.game?.ending==='Возвращение');
  pass('Progress persists after reload');
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(reports,'portal-walkthrough.json'),JSON.stringify({run_at:new Date().toISOString(),version:'4.2.0',checks,pageErrors:errors},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
