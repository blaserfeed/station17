// Exercises Vosk -> AudioWorklet -> Controls -> World with a synthetic microphone.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.STATION_BROWSER||undefined,headless:true,args:['--enable-unsafe-swiftshader']});
 const checks=[],errors=[];
 const pass=name=>{checks.push({name,status:'Pass'});console.log('PASS',name);};
 try{
  const page=await browser.newPage({viewport:{width:1280,height:800}});
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.STATION_URL||'http://127.0.0.1:8765');
  await page.waitForFunction(()=>window.chronoshov?.state&&chronoshov.world.player.userData.rig);
  await page.locator('[data-ui="menu"]').click();await page.locator('[data-ui="new"]').click();await page.locator('[data-ui="close"]').click();
  const audio=Object.fromEntries(['forward','stop'].map(name=>[name,fs.readFileSync(path.join(__dirname,`fixtures/${name}.wav`)).toString('base64')]));
  await page.evaluate(async audio=>{
   const context=new AudioContext({sampleRate:16000});await context.resume();
   const destination=context.createMediaStreamDestination(),buffers={};
   for(const [name,encoded] of Object.entries(audio))buffers[name]=await context.decodeAudioData(Uint8Array.from(atob(encoded),c=>c.charCodeAt(0)).buffer);
   const silence=context.createOscillator(),gain=context.createGain();gain.gain.value=0;silence.connect(gain);gain.connect(destination);silence.start();
   window.testMic={context,stream:destination.stream,play(name){const source=context.createBufferSource();source.buffer=buffers[name];source.connect(destination);source.start();}};
   navigator.mediaDevices.getUserMedia=async()=>destination.stream;
   const w=chronoshov.world;w.player.position.set(-8,0,21);w.yaw=w.targetYaw=0;
  },audio);
  await page.keyboard.press('m');
  await page.waitForFunction(()=>chronoshov.controls.listening,null,{timeout:70000});
  await page.evaluate(()=>testMic.play('forward'));
  await page.waitForFunction(()=>chronoshov.controls.motion().source==='voice'&&chronoshov.controls.motion().z===-1,null,{timeout:12000});
  const heard=await page.locator('#voice-status').textContent();
  pass('Actual Russian audio «вперёд» starts forward movement through the microphone pipeline');
  const before=await page.evaluate(()=>chronoshov.world.position());
  await page.waitForTimeout(5500);
  const held=await page.evaluate(()=>({position:chronoshov.world.position(),motion:chronoshov.controls.motion()}));
  assert.equal(held.motion.z,-1);assert(before[1]-held.position[1]>6);
  pass('One voice command keeps walking for more than five seconds');
  await page.evaluate(()=>testMic.play('stop'));
  await page.waitForFunction(()=>chronoshov.controls.motion().z===0,null,{timeout:12000});
  await page.waitForFunction(()=>chronoshov.world.velocity.length()<.05);
  const stopped=await page.evaluate(()=>chronoshov.world.position());
  await page.waitForTimeout(700);
  const after=await page.evaluate(()=>chronoshov.world.position());
  assert(Math.hypot(after[0]-stopped[0],after[1]-stopped[1])<.03);
  pass('Actual Russian audio «стой» stops the character');
  await page.keyboard.press('m');
  const tracksEnded=await page.evaluate(()=>{const ended=testMic.stream.getTracks().every(t=>t.readyState==='ended');testMic.context.close();return ended;});
  assert(tracksEnded);assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(__dirname,'../reports/voice-current.json'),JSON.stringify({run_at:new Date().toISOString(),input:'Synthetic Russian speech (macOS Milena); real Vosk model, AudioWorklet and MediaStream',checks,heard,before,held,stopped,tracksEnded,pageErrors:errors},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
