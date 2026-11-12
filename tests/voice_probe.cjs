// Real local Vosk inference. Supply a 16 kHz WAV recording as the first argument.
const {chromium}=require('playwright');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const path=require('node:path');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.STATION_BROWSER,headless:true,args:['--enable-unsafe-swiftshader']});
 try {
  const page=await browser.newPage();
  await page.route('**/app.js',route=>route.fulfill({contentType:'text/javascript',body:''}));
  await page.goto(process.env.STATION_URL||'http://127.0.0.1:8765');
  const encoded=fs.readFileSync(process.argv[2]||path.join(__dirname,'fixtures/forward.wav')).toString('base64');
  const results=await page.evaluate(async encoded=>{
   const {getSpeechModel,VOICE_PHRASES}=await import('/speech.js');
   const model=await getSpeechModel();
   const ctx=new AudioContext({sampleRate:16000});
   const bytes=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));
   const audio=await ctx.decodeAudioData(bytes.buffer),samples=audio.getChannelData(0);
   const results=[];
   for(const [name,phrases] of [['legacy',VOICE_PHRASES.filter(p=>!p.includes('ё')&&!p.startsWith('иди'))],['fixed',VOICE_PHRASES],['unrestricted',null]]) {
    const rec=phrases?new model.KaldiRecognizer(16000,JSON.stringify(phrases)):new model.KaldiRecognizer(16000);
    rec.setWords(true);
    const messages=[];
    const done=new Promise(resolve=>rec.addEventListener('result',e=>{const m=e.detail||e;messages.push(m.result);if(m.event==='result')resolve();}));
    for(let i=0;i<samples.length;i+=2048)rec.acceptWaveformFloat(samples.slice(i,i+2048),16000);
    rec.acceptWaveformFloat(new Float32Array(32000),16000);
    rec.retrieveFinalResult();
    await Promise.race([done,new Promise(r=>setTimeout(r,10000))]);
    await new Promise(r=>setTimeout(r,200));rec.remove();results.push({name,messages});
   }
   await ctx.close();return results;
  },encoded);
  const recognized=result=>result.messages.some(m=>m.text?.includes('вперёд'));
  assert(!recognized(results[0]),'Negative control: old vocabulary should reproduce the bug');
  assert(recognized(results[1]),'Fixed vocabulary must recognize forward');
  assert(recognized(results[2]),'Unrestricted recognizer must confirm the recording');
  fs.writeFileSync(path.join(__dirname,'../reports/voice-vocabulary.json'),JSON.stringify({run_at:new Date().toISOString(),input:'Synthetic Russian speech (macOS Milena)',results},null,2));
  console.log('PASS old vocabulary reproduces failure; fixed vocabulary recognizes «вперёд»');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
