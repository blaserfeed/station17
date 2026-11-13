let recognizer;
function resultMessage(result){const hands=(result.gestures||[]).map((gestures,i)=>{const g=gestures[0],h=result.handedness?.[i]?.[0];return {label:g?.categoryName||null,score:g?.score||0,handedness:h?.categoryName==='Left'?'Right':h?.categoryName==='Right'?'Left':null,handednessScore:h?.score||0};});return {type:'result',label:hands[0]?.label||null,score:hands[0]?.score||0,hands};}
// Camera frames are unmirrored; swap handedness as specified by MediaPipe.
self.onmessage=async event=>{const d=event.data;try{
 if(d.type==='init'){
  const {GestureRecognizer,FilesetResolver}=await import('./vendor/vision_bundle.mjs');const vision=await FilesetResolver.forVisionTasks(new URL('./vendor/wasm',self.location.href).href);
  recognizer=await GestureRecognizer.createFromOptions(vision,{baseOptions:{modelAssetPath:new URL('./vendor/gesture_recognizer.task',self.location.href).href,delegate:'CPU'},runningMode:'VIDEO',numHands:2,minHandDetectionConfidence:.5,minHandPresenceConfidence:.5,minTrackingConfidence:.5});self.postMessage({type:'ready'});
 }else if(d.type==='image'){
  await recognizer.setOptions({runningMode:'IMAGE',numHands:2});self.postMessage(resultMessage(recognizer.recognize(d.image)));
 }else if(d.type==='frame'){
  if(!recognizer)throw new Error('Модель ещё не загружена.');self.postMessage(resultMessage(recognizer.recognizeForVideo(d.image,d.time)));
 }
 }catch(e){self.postMessage({type:'error',message:e.message||String(e)});}finally{d.image?.close();}
};
