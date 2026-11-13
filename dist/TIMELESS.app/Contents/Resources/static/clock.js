export class GameClock {
 constructor(getState, send, onExpired) {
  this.state=getState;this.send=send;this.expired=onExpired;
  this.wants=false;this.pending=false;this.lastTick=0;this.retryAt=0;
  this.interval=setInterval(()=>this.update(),250);
 }
 remaining() {
  const t=this.state()?.game?.timer;
  if(!t)return 1500;
  return Math.max(0,t.remaining-(t.running&&t.started_at!==null?Math.max(0,Date.now()/1000-t.started_at):0));
 }
 sync(wants) {
  this.wants=!!wants;
  const g=this.state()?.game;
  if(!g||g.phase!=='explore'||!g.timer||this.pending||performance.now()<this.retryAt)return;
  if(g.timer.running!==this.wants)this.request('clock',{running:this.wants});
 }
 async request(kind,payload={}) {
  if(this.pending)return;
  this.pending=true;this.lastTick=performance.now();
  let succeeded=false;
  try {
   const r=await this.send(kind,payload);
   succeeded=!!r;
   if(r?.game?.phase==='over'&&r.game.failure_kind==='timeout')this.expired(r);
  } catch {
   // The transport reports errors. Retry later without a tight request loop.
  } finally {
   this.pending=false;
   this.retryAt=succeeded?0:performance.now()+2000;
   if(succeeded)this.sync(this.wants);
  }
 }
 update() {
  const g=this.state()?.game,root=document.getElementById('countdown');
  if(root&&g?.timer) {
   const left=this.remaining(),seconds=Math.ceil(left);
   root.querySelector('b').textContent=String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');
   root.querySelector('small').textContent=g.timer.running?'До аварии · 2026':'Таймер на паузе';
   root.classList.toggle('urgent',left<300);root.classList.toggle('critical',left<60);
  }
  this.sync(this.wants);
  if(g?.phase==='explore'&&g.timer?.running&&this.wants&&!this.pending&&performance.now()>=this.retryAt&&(performance.now()-this.lastTick>2000||this.remaining()<=0))this.request('tick');
 }
}
