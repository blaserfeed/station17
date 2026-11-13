const {app,BrowserWindow,dialog,session}=require('electron');
const {spawn}=require('node:child_process');
const path=require('node:path');
const origin='http://127.0.0.1:18765';
app.setName('TIMELESS');
const saveDir=path.join(app.getPath('appData'),'The Last Signal');
app.setPath('userData',path.join(app.getPath('appData'),'TIMELESS'));
let backend,window,closing=false;

function startServer(){
 const resources=process.resourcesPath;
 const windows=process.platform==='win32';
 const executable=windows?path.join(resources,'python','python.exe'):path.join(resources,'backend','timeless-server');
 const args=windows?[path.join(resources,'game','desktop','server.py')]:[];
 return new Promise((resolve,reject)=>{
  backend=spawn(executable,[...args,'--data-dir',process.env.TIMELESS_TEST_DATA||saveDir],{
   windowsHide:true,stdio:['ignore','pipe','pipe']
  });
  let output='',errors='';
  const timeout=setTimeout(()=>reject(new Error('Сервер игры не ответил вовремя.')),12000);
  backend.stdout.on('data',data=>{
   output+=String(data);
   if(output.includes('READY')){clearTimeout(timeout);resolve();}
  });
  backend.stderr.on('data',data=>{errors=(errors+String(data)).slice(-1500);});
  backend.once('error',error=>{clearTimeout(timeout);reject(error);});
  backend.once('exit',()=>{
   clearTimeout(timeout);
   if(!output.includes('READY'))reject(new Error(errors||'Не удалось запустить сервер игры.'));
   else if(!closing&&window){dialog.showErrorBox('TIMELESS','Сервер игры остановился.');app.quit();}
  });
 });
}

async function openGame(){
 await startServer();
 session.defaultSession.setPermissionCheckHandler((_contents,permission,requestingOrigin)=>{
  return ['media','pointerLock'].includes(permission)&&requestingOrigin===origin;
 });
 session.defaultSession.setPermissionRequestHandler((contents,permission,callback,details)=>{
  const requestingOrigin=new URL(details.requestingUrl||contents.getURL()).origin;
  callback(['media','pointerLock'].includes(permission)&&requestingOrigin===origin);
 });
 window=new BrowserWindow({
  title:'TIMELESS',width:1280,height:840,minWidth:720,minHeight:500,
  backgroundColor:'#10171a',autoHideMenuBar:true,
  webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true},
 });
 window.removeMenu();
 window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 window.webContents.on('will-navigate',(event,url)=>{
  if(new URL(url).origin!==origin)event.preventDefault();
 });
 await window.loadURL(origin);
}

if(!app.requestSingleInstanceLock())app.quit();
else{
 app.on('second-instance',()=>window?.focus());
 app.on('before-quit',()=>{closing=true;backend?.kill();});
 app.on('window-all-closed',()=>app.quit());
 app.whenReady().then(openGame).catch(error=>{
  dialog.showErrorBox('TIMELESS',error.message);app.quit();
 });
}
