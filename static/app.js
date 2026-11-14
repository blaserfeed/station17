import {bindings,keyLabel} from './keybindings.js';
import {annaLines,createStoryAudio,pressureLevel} from './story-audio.js';
import {World} from './world.js';
import {Controls} from './controls.js';
import {GameClock} from './clock.js';
import {createSound} from './audio.js';
const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let state=null,screen='start',modal=null,busy=false,queue=Promise.resolve(),world,toastTimer,transferring=false,selected=0,cinematic=false,cinematicTimer,cinematicAlarm,finaleTimer,epilogueTimer,worldError=null,pausedModal=null;
const station=createSound();
const voices=createStoryAudio(value=>station.setSpeech(value));
let pressureRun, announcedPressure=0;
const controls=new Controls(command,status);
try{world=new World($('world'),{collect:()=>{},damage:()=>{},breaker:()=>{station.cue("error");station.land();},enterPortal:travelThroughPortal,lookPaused:()=>{if(screen==='game'&&!world.confession&&!modal&&!transferring)go('pause');},footstep:surface=>station.step(surface,world.sprinting),land:surface=>station.land(surface)});}catch(e){worldError=e;$('screen').innerHTML=`<div class="error-card"><h2>Не удалось открыть 3D сцену</h2><p>${esc(e.message)}</p><button onclick="location.reload()">Повторить</button></div>`;}
let annaCaptionTimer;
function clearAnnaCaption(){
 clearTimeout(annaCaptionTimer);
 $('anna-caption').hidden=true;
}
function speakAnna(line, caption=$('anna-caption')){
 clearAnnaCaption();
 caption.textContent=annaLines[line];
 if(caption===$('anna-caption')){
  caption.hidden=false;
  annaCaptionTimer=setTimeout(clearAnnaCaption,Math.max(3200,annaLines[line].length*67));
 }
 return voices.play('anna-'+line,state.settings);
}
function sound(kind){if(!kind||!state?.settings.volume)return;try{station.setVolumes(state.settings);station.cue(kind);}catch(e){}}
function toast(text){if(!text)return;$('toast').textContent=text;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),4800);}
async function getState(){const r=await fetch('/api/state',{cache:'no-store'});if(!r.ok)throw Error('Сервер не отвечает.');state=await r.json();world?.sync(state.game);if(!worldError)render();}
function post(path,fields={}){const job=queue.then(async()=>{const quiet=['clock','tick'].includes(fields.kind);if(!quiet)busy=true;const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);try{if(['clock','tick'].includes(fields.kind)&&state.game?.phase!=='explore')return null;const response=await fetch(path,{keepalive:fields.kind==='clock',method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...fields,...(quiet?{payload:{...fields.payload,position:world.position()}}:{}),request_id:crypto.randomUUID(),revision:state.revision}),signal:controller.signal});const data=await response.json();if(!response.ok){if(response.status===409)await getState();throw Error(data.error||'Действие не сохранено.');}state=data;world?.sync(state.game);if(data.event?.message&&fields.kind!=='hint')toast(data.event.message);sound(data.event?.sound);return data;}finally{clearTimeout(timer);if(!quiet)busy=false;}});queue=job.catch(()=>{});return job.catch(e=>{toast(e.name==='AbortError'?'Связь прервалась. Обновляем сохранение.':e.message);if(e.name==='AbortError')getState().catch(()=>{});return null;});}
async function action(kind,payload={}){const previous=state.game;const out=await post('/api/action',{kind,payload:{source:controls.motion().source,...payload}});if(!out)return null;if(['new','retry'].includes(kind)){clearFinale();pausedModal=null;screen='game';modal=null;}if(out.event?.confront==='sergey'){modal={type:'npc'};}else if(out.event?.confront){modal={type:'blocked',mode:out.event.confront};}if(out.game?.phase==='over'&&['timeout','rupture','trapped'].includes(out.game.failure_kind)){startFlood(out);return out;}if(out.game?.phase==='results'){screen='results';modal=null;controls.stopVoice();controls.stopCamera();render();playFinale(out.game);return out;}if(out.game?.phase==='over'){screen='over';modal=null;controls.stopVoice();controls.stopCamera();}if(out.event?.intro)modal={type:'intro'};render();if(out.event?.intro){
 openModal({type:'intro'});
 const intro=modal;
 voices.play('intro',state.settings).then(()=>{
  if(modal===intro)speakAnna('intro',$('anna-intro-line'));
 });
 }else if(out.event?.clue)openModal({type:'clue',clue:out.event.clue});else if(out.event?.reveal){const c=out.game.notes.find(n=>n.id===out.event.reveal);openModal({type:'clue',clue:c});}
 if(kind==='portal_repair'&&!previous?.portal.repaired&&out.game.portal.repaired)speakAnna('repair');
 if(kind==='bypass'&&!previous?.repairs.valve&&out.game.repairs.valve)speakAnna('valve');
 if(out.event?.clue)station.mechanism(out.event.clue.id==='portal_fuse'?'switch':'paper');
 if(kind==='portal_repair'&&!previous?.portal.repaired&&out.game.portal.repaired)station.mechanism('switch');
 if(kind==='bypass'&&!previous?.repairs.valve&&out.game.repairs.valve)station.mechanism('valve');
 if(out.event?.clue?.id==='fatherlog')speakAnna('reel');
 if(out.event?.reveal==='letter')speakAnna('letter');
 return out;}
function updateObjective(){
 const g=state?.game, panel=$('current-objective');
 panel.hidden=screen!=='game'||g?.phase!=='explore'||!!modal||transferring||cinematic||!!world?.confession;
 if(panel.hidden)return;
 const {title,text}=g.objective;
 const hint=text.split(/(?<=\.)\s/)[0];
 if(panel.firstElementChild.textContent!==title)panel.firstElementChild.textContent=title;
 if(panel.lastElementChild.textContent!==hint)panel.lastElementChild.textContent=hint;
}
function active(){if(!world)return;updateObjective();document.body.classList.toggle('playing',screen==='game'&&!world.confession&&!modal&&!transferring);world.inGame=!!state?.game&&['game','pause'].includes(screen);world.setActive(screen==='game'&&!world.confession&&!modal&&!busy&&!transferring&&!!state?.game);if(screen!=='game'||modal||transferring)world.releaseLook();gameClock.sync(!!state?.game&&state.game.phase==='explore'&&screen==='game'&&!world.confession&&!['intro','help','shop','bought'].includes(modal?.type)&&!document.hidden&&!cinematic);}
let settingsPage=null;
function go(next){settingsPage=null;voices.stop();clearAnnaCaption();controls.captureKey=null;if(next==='pause'&&screen==='game')pausedModal=modal?{puzzle:modal,selection:selected}:null;else if(next!=='game')pausedModal=null;if(next!=='results')clearFinale();screen=next;modal=null;controls.resetMotion();render();}
function render(){if(!state)return;const g=state.game;document.body.dataset.screen=screen;document.body.classList.toggle('era-future',g?.stage===2&&screen==='game');document.body.classList.toggle('era-1978',g?.stage===0&&screen==='game');document.body.classList.toggle('era-2026',g?.stage===1&&screen==='game');document.body.classList.toggle('era-2074',g?.stage===2&&screen==='game');station.setVolumes(state.settings);world?.setMotion(state.settings.motion!==false);world?.setGraphics(state.settings.graphics??1);if(screen==='game'&&g)station.playBed(g.stage);document.body.classList.toggle('large',state.settings.large);document.body.classList.toggle('contrast',state.settings.contrast);document.body.classList.toggle('reduced',!state.settings.motion);document.body.classList.toggle('playing',screen==='game'&&!modal);$('connection').textContent=screen==='game'?g.epoch.year+' · '+g.epoch.name:'TIMELESS';$('view-toggle').hidden=!g;$('view-toggle').textContent=world?.mode==='first'?'От первого лица':'От третьего лица';$('pause-toggle').hidden=!g;$('countdown').hidden=!g||!['game','pause'].includes(screen);$('map-panel').hidden=screen!=='game';$('aim').hidden=screen!=='game'||!!modal;$('screen').innerHTML=({start:startView,menu:menuView,game:()=>'',pause:pauseView,results:resultView,over:overView}[screen]||menuView)();renderModal();active();document.title='TIMELESS'+(g&&screen==='game'?' · '+g.epoch.year:'');}
function startView(){
 return `<section class="hero timeless-start"><h1>TIMELESS</h1><div class="eyebrow">Гидроузел Ольхов · 17:40</div><p class="lead">Анна ловит голос отца, пропавшего десять лет назад. До аварии на станции осталось 25 минут.</p><div class="actions"><button class="primary" data-ui="menu">Войти на станцию</button><button data-ui="help">Управление</button></div></section>`;
}
function menuView(){
 return `<section class="hero"><h1>TIMELESS</h1><div class="menu-buttons"><button class="primary" data-ui="continue" ${state.game?'':'disabled'}>Продолжить <span>${state.game?state.game.epoch.year:'нет сохранения'}</span></button><button data-ui="new">Новое расследование</button><button data-ui="pause">Настройки</button><button data-ui="stats">Открытые финалы <span>${state.stats.endings}/3</span></button><button data-ui="shop" ${state.full_access?'disabled':''}>${state.full_access?'Финальная глава открыта':'Финальная глава · 990 ₸'}</button></div></section>`;
}
function controlsView(){
 const rows=Object.entries(bindings).map(([action,[label]])=>{
  const key=keyLabel(controls.bindings[action]);
  return `<div class="binding-row"><span>${label}</span><button type="button" data-ui="rebind" data-id="${action}" aria-label="Изменить клавишу: ${label}">${controls.captureKey===action?'Нажмите клавишу…':esc(key)}</button></div>`;
 }).join('');
 const canHint=state.game?.phase==='explore';
 return `<details class="journal-entry" ${modal.openHints?'open':''}><summary>Подсказки по игре</summary><p>${esc(canHint?state.game.objective.text:'Начните расследование, чтобы увидеть подсказку к текущей задаче.')}</p>${canHint?'<p>Оранжевый круг на карте показывает следующую цель.</p><button data-ui="guide-hint">Показать решение текущего шага</button>':''}${modal.hint?`<p class="signal-hint">${esc(modal.hint)}</p>`:''}</details><details class="journal-entry"><summary>Мышь, голос и жесты</summary><p>Щёлкните по сцене, чтобы включить обзор мышью. Для действия подойдите к предмету и наведите взгляд на него. Голос и жесты включаются в панели игры. Сторону руки можно сменить под видео.</p></details><p>Выберите действие и нажмите нужную клавишу. Если она уже занята, действия поменяются клавишами.</p><div class="binding-list">${rows}</div><div class="actions"><button data-ui="reset-bindings">Сбросить клавиши</button><button data-ui="close">Назад</button></div>`;
}
async function guideHint(){
 if(!state.game||state.game.phase!=='explore')return;
 const current=modal;
 const result=await post('/api/action',{kind:'hint',payload:{}});
 if(!result||modal!==current)return;
 if(result.game.phase==='over'){startFlood(result);return;}
 const g=result.game;
 current.hint=!g.portal.repaired&&g.inventory.includes('portal_fuse')
  ?'На щите пазл 3×3. Нажмите фрагмент, затем другой — они поменяются местами. Соберите чертёж как на образце: солнце справа вверху, вода посередине, арка портала справа внизу.'
  :result.event.message;
 current.openHints=true;
 renderModal();
}
function pauseView(){
 const settings=state.settings;
 const tabs=[['sound','Звук'],['display','Экран'],['help','Управление и подсказки']];
 const range=(id,label,value)=>`<div class="setting"><label for="${id}">${label} <output id="${id}-value">${value}</output>%</label><input id="${id}" type="range" min="0" max="100" value="${value}"></div>`;
 const content={
  sound:()=>range('volume','Общая громкость',settings.volume)+range('music','Музыка станции',settings.music??70)+range('effects','Эффекты',settings.effects??80),
  display:()=>`<div class="setting"><span>Камера</span><button data-ui="view">${world.mode==='first'?'Первое':'Третье'} лицо</button></div><div class="setting"><label for="graphics">Графика</label><select id="graphics">${[[2,'Высокая'],[1,'Сбалансированная'],[0,'Производительная']].map(([n,label])=>`<option value="${n}" ${(settings.graphics??1)===n?'selected':''}>${label}</option>`).join('')}</select></div>${[['large','Крупный текст'],['contrast','Высокий контраст'],['motion','Плавные переходы']].map(([key,label])=>`<label class="setting check"><input type="checkbox" data-setting="${key}" ${settings[key]?'checked':''}>${label}</label>`).join('')}`,
 };
 return `<section class="pause-layout"><nav class="pause-menu" aria-label="Пауза и настройки"><h2>${state.game?'Пауза':'Настройки'}</h2>
  ${state.game?'<button class="primary" data-ui="resume">Продолжить</button>':''}
  ${tabs.map(([id,label])=>`<button data-ui="${id==='help'?'help':'settings-tab'}" data-id="${id}" ${settingsPage===id?'aria-current="true"':''}>${label}</button>`).join('')}
  <button data-ui="menu">В главное меню</button>
 </nav>${settingsPage?`<div class="settings-sheet"><h3>${tabs.find(([id])=>id===settingsPage)[1]}</h3>${content[settingsPage]()}</div>`:''}</section>`;
}
function outcomeText(g){
 const sergey=g.sergey==='killed'?'Сергей больше не стоит у пульта: Анна убрала его с дороги до решения.':g.sergey==='outsmart'?'Сергей ушёл к западному проходу и не успел вмешаться.':'Сергей остался на станции, но решение уже принято.';
 if(g.ending==='Возвращение')return 'Анна вывела отца из контура и открыла водосброс. Для Олега прошли минуты, для неё — десять лет: он видит взрослую дочь, а город остаётся на месте. Потерянные годы не возвращаются. '+sergey;
 if(g.ending==='Последняя смена')return 'Анна не стала вытаскивать отца. Водосброс открылся, вода ушла мимо города, а Олег остался между временами: в ответ только «Я понял», без прощания и без обещания вернуться. '+sergey;
 return 'Анна отменила первый пуск. Станции Ольхов нет: нет водохранилища, нет аварии и нет пропажи Олега. В долине другой город, семья Анны никогда здесь не работала. Мелодия в приёмнике — единственный след жизни, которую это решение стёрло.';
}
function resultView(){const g=state.game;return `<section class="result card"><div class="eyebrow">Расследование завершено</div><h1>${esc(g.ending)}</h1><p class="lead">${esc(outcomeText(g))}</p><div class="result-stats"><div><b>${g.P}</b><span>Очки</span></div><div><b>${g.C}/3</b><span>Согласованные узлы</span></div><div><b>${state.stats.endings}/3</b><span>Открытые финалы</span></div></div>${g.achievement?'<p class="gold">«Точная настройка» — без ошибочных проверок и подсказок.</p>':''}<div class="history">${g.history.map(t=>`<div>${esc(t)}</div>`).join('')}</div><div class="actions"><button class="primary" data-ui="new">Пройти иначе</button><button data-ui="menu">Главное меню</button></div></section>`;}
function overView(){const g=state.game,kind=g.failure_kind,freshStart=kind==='timeout'||kind==='trapped',eyebrow=kind==='timeout'?'Время вышло':kind==='trapped'?'Портал не зажёгся':kind==='rupture'?'Линия А':'Связь потеряна',title=kind==='timeout'?'Авария на станции':kind==='trapped'?'Заперта в 1978':kind==='rupture'?'Труба разорвана':'Аварийное размыкание',note=kind==='trapped'?'Линия В замкнула контур. Портал не активируется, Анна остаётся в прошлом. Расследование начинается сначала.':kind==='timeout'?'При новой попытке начнётся новое расследование с полными 25 минутами. Доступ к финальной главе и открытые концовки сохранятся.':kind==='rupture'?'Труба лопнула. Контрольная точка сохранила записи: линию можно выбрать заново.':'Найденные документы и ремонт сохранены в контрольной точке перед решением.';return `<section class="result card"><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p class="lead">${esc(g.failure)}</p><p>${note}</p><div class="actions"><button class="primary" data-ui="retry">${freshStart?'Начать новую попытку':'Вернуться к решению'}</button><button data-ui="menu">Главное меню</button></div></section>`;}
function openModal(next){if(next.type==='journal'&&modal&&['safe','bypass'].includes(modal.type))next.returnTo={puzzle:modal,selection:selected};modal=next;selected=0;if(next.type==='safe')modal.values=[0,0,0];if(next.type==='travel'){const g=state.game;selected=g.objective.stage===g.stage?(g.stage+1)%3:g.objective.stage;if(!g.portal.repaired&&g.inventory.includes('portal_fuse')){modal.values=[2,5,0,7,4,8,1,3,6];modal.held=null;}}controls.resetMotion();renderModal();active();}
function closeModal(){controls.captureKey=null;if(modal?.type==='intro')voices.stop();modal=null;controls.resetMotion();renderModal();active();if(screen==='game'&&!modal)world.captureLook();}
function dialView(labels,max){return `<div class="dial-grid">${modal.values.map((v,i)=>`<div class="dial-unit ${selected===i?'selected':''}"><span>${labels[i]}</span><button data-ui="dial" data-id="${i}:1" aria-label="Увеличить ${labels[i]}">+</button><b>${v}</b><button data-ui="dial" data-id="${i}:-1" aria-label="Уменьшить ${labels[i]}">−</button></div>`).join('')}</div><div class="actions"><button class="primary" data-ui="verify">Проверить</button><button data-ui="journal">Открыть записи</button><button data-ui="close">Вернуться</button></div><p class="small">1–3 меняют регулятор, F — проверка. Жесты: кулак/V — выбор, палец — поворот, жест прыжка — проверка. Голос: «проверить».</p>`;}
function puzzlePos(piece){return `${(piece%3)*50}% ${Math.floor(piece/3)*50}%`;}
function puzzleView(){const tile=(piece,i)=>`<button type="button" class="puzzle-tile ${selected===i?'selected':''} ${modal.held===i?'held':''}" data-ui="circuit" data-id="${i}" aria-label="Фрагмент ${i+1}" style="background-image:url('/assets/puzzle-station.svg');background-position:${puzzlePos(piece)}"></button>`;return `<p class="riddle">На панели разобран чертёж станции. Соберите его: девять фрагментов должны встать так же, как на образце.</p><div class="puzzle-layout"><div class="puzzle-board" role="group" aria-label="Пазл 3 на 3">${modal.values.map(tile).join('')}</div><figure class="puzzle-ref"><figcaption>Образец</figcaption><div style="background-image:url('/assets/puzzle-station.svg')"></div></figure></div><div class="actions"><button class="primary" data-ui="verify">Собрать пазл</button></div><p class="small">Нажмите фрагмент, затем другой — они поменяются местами. Питание включится, когда чертёж совпадёт с образцом.</p>`;}
function renderModal(){const root=$('modal-layer');if(!modal){root.innerHTML='';return;}const g=state.game;let title='',body='';
 if(modal.type==='intro'){title='17:40. Голос отца';body='<div class="radio-transcript"><span>ОЛЕГ СОКОЛОВ</span><p>«Аня. Сначала клапан. Моя запись осталась за западным проходом. Не ищи меня, пока резерв не открыт».</p></div><p>Голос звучит так, будто отец замолчал на минуту, а не на десять лет. На записи стоит сегодняшняя дата. Архивной плёнкой 2016 года это быть не может.</p><p>Сергей у входа не удивлён и не хочет говорить об Олеге. Он показывает обесточенный портал: «Здесь иногда появляются вещи, которые не должны существовать».</p><p>Сначала найдите предохранитель у щитка. На панели пазл: чертёж станции из девяти фрагментов.</p><p class="circuit-status">25 минут до аварии. Время идёт и в других эпохах. Esc — пауза.</p><blockquote id="anna-intro-line">'+annaLines.intro+'</blockquote><button class="primary" data-ui="close">К порталу</button>';}
 else if(modal.type==='clue'){title=modal.clue.name;body=`<div class="eyebrow">${modal.clue.year||g.epoch.year} · ${esc(modal.clue.room||'Станция')}</div><p class="document-text">${esc(modal.clue.text)}</p><p class="small">Запись сохранена в журнале (J).</p><div class="actions"><button class="primary" data-ui="close">Вернуться</button><button data-ui="journal">Все записи</button></div>`;}
 else if(modal.type==='journal'){title='Записи Анны';body=`<div class="quest-summary"><strong>${esc(g.objective.title)}</strong><p>${esc(g.objective.text)}</p></div><p class="era-note">${esc(g.epoch.intro)}</p><p class="small">${esc(g.epoch.world_note||'')}</p><div class="case-progress"><span class="${g.portal.repaired?'done':''}">1. Пазл щитка</span><span class="${g.repairs.valve?'done':''}">2. Резерв</span><span class="${g.can_return?'done':''}">3. Катушка отца</span></div>${g.notes.map(n=>`<details class="journal-entry" ${n.story?'open':''}><summary>${n.year} · ${esc(n.name)}</summary><p>${esc(n.text)}</p></details>`).join('')}<div class="actions">${modal.returnTo?'<button class="primary" data-ui="back-puzzle">Вернуться к прибору</button>':''}<button data-ui="travel">Где портал?</button><button data-ui="close">Закрыть журнал</button></div>`;}
 else if(modal.type==='safe'){title=g.safe_open?'Архивный сейф открыт':'Сейф семейного дела';body=g.safe_open?'<p>Письмо в журнале: Сергей предатель. С ним нужно решить до пульта — увести или убрать с дороги.</p><button data-ui="journal">Прочитать письмо</button><button data-ui="close">Вернуться</button>':`<p>Три цифры, по одной в комнатах 1978 года. Архив — шкаф, турбинный зал — полка, диспетчерская — дело. Порядок тот же: шкаф, полка, дело.</p>${dialView(['Шкаф','Полка','Дело'],9)}`;}
 else if(modal.type==='bypass'){
  title='Западный клапан · 1978';
  if(g.repairs.valve)body='<p>Линия Б открыта. В 2074 году западный проход уже сухой — там катушка.</p><div class="actions"><button class="primary" data-ui="travel">К порталу</button><button data-ui="close">Вернуться</button></div>';
  else if(!['signature','carrier','delay'].every(id=>g.inventory.includes(id)))body='<p>Сначала снимите записи в архиве, турбинном зале и диспетчерской. Буквы на щите нет, пока не сведены все три.</p><div class="actions"><button data-ui="journal">Журнал</button><button data-ui="close">Вернуться</button></div>';
  else{
   const paths=['M12 24 H68 M88 24 H126 M69 17 l5 7 -5 7 M86 17 l-5 7 5 7',
    'M12 24 H50 Q62 24 62 13 H126 M116 8 l10 5 -10 5',
    'M12 24 H58 C58 3 106 3 106 24 C106 45 58 45 58 24'];
   body=`<p>Щит не подсказывает букву. Сведите архив, турбинный зал и диспетчерскую. Неверная труба рвётся. Линия В замыкает контур, и портал больше не зажигается.</p><div class="pipe-options">${['А','Б','В'].map((line,i)=>`<button class="choice pipe-option ${i===selected?'selected':''}" data-ui="select-pipe" data-id="${i}" aria-pressed="${i===selected}"><b>${line}</b><svg viewBox="0 0 138 48" aria-hidden="true"><path d="${paths[i]}"></path></svg></button>`).join('')}</div><div class="actions"><button class="primary" data-ui="verify">Открыть линию</button><button data-ui="journal">Сверить записи</button><button data-ui="close">Вернуться</button></div><p class="small">Выберите трубу и нажмите «Открыть линию».</p>`;
  }
 }
 else if(modal.type==='finale'){
  title='Аварийный пульт · 2026';
  if(!g.can_finish)body='<p>Сначала откройте резерв в 1978 году. Пульт заработает после этого.</p><div class="actions"><button class="primary" data-ui="travel">Выбрать эпоху</button><button data-ui="close">Вернуться</button></div>';
  else if(!g.can_return)body=`<p>Водосброс готов. Без катушки из 2074 года отца не вернуть — можно спасти только город или отменить сам пуск.</p><div class="stack"><button class="choice primary" data-ui="travel">К порталу в 2074 год</button><button class="choice" data-ui="finish" data-id="seal">Только спасти город<small>Вода уйдёт мимо долины. Отец останется между временами.</small></button><button class="choice" data-ui="finish" data-id="erase">Отменить пуск станции<small>Станции не будет. Не будет ни аварии, ни этой семьи на гидроузле.</small></button><button class="choice danger" data-ui="unsafe">Передать сигнал без записи</button></div>`;
  else if(!g.inventory.includes('letter'))body='<p>Катушка на месте, но возвращать отца рано. Сначала письмо в архивном сейфе: Сергей предатель, и это нужно знать до тумблера.</p><div class="actions"><button class="primary" data-ui="close">К сейфу</button></div>';
  else if(!g.sergey)body='<p>Письмо уже у Анны. Сергей всё ещё стоит у входа. Уведите его или уберите с дороги — потом пульт.</p><div class="actions"><button class="primary" data-ui="npc">К Сергею</button><button data-ui="close">Отойти</button></div>';
  else body=`<p>Путь к пульту свободен. Каждое решение меняет и город, и отца.</p><div class="stack"><button class="choice primary" data-ui="finish" data-id="return">Вернуть отца и открыть водосброс<small>Олег выйдет к Анне. Город устоит. Десять лет не вернуть.</small></button><button class="choice" data-ui="finish" data-id="seal">Только спасти город<small>Вода уйдёт мимо долины. Отец останется между временами.</small></button><button class="choice" data-ui="finish" data-id="erase">Отменить пуск станции<small>Станции не будет. Не будет ни аварии, ни этой семьи на гидроузле.</small></button></div>${state.full_access?'':'<p class="small">Финальные решения открываются учебной покупкой без списания.</p>'}`;
 }
 else if(modal.type==='blocked'){title='Сначала письмо';body='<p>Возвращать отца рано. В архивном сейфе письмо: Сергей предатель. Код собран из архива, турбинного зала и диспетчерской 1978 года.</p><div class="actions"><button class="primary" data-ui="close">Идти к сейфу</button></div>';}
 else if(modal.type==='unsafe'){title='Сигнал не согласован';body='<p>Принудительный импульс может оборвать связь. Автоматика остановит запуск, если фазы не совпадут.</p><div class="actions"><button class="danger" data-ui="finish" data-id="unsafe">Всё равно передать</button><button data-ui="finale">Вернуться к решению</button></div>';}
 else if(modal.type==='npc'){title='Сергей Морозов';if(!g.npc_position)body='<p>У входа пусто. К пульту можно идти.</p><button class="primary" data-ui="close">Вернуться</button>';else{const ready=g.inventory.includes('letter')&&g.can_return;body=`<div class="identity"><span class="initials">СМ</span><div><strong>Сергей Морозов</strong><small>Инженер последней смены 2016 года</small></div></div><p>${esc(g.chat.at(-1)?.reply||(ready?'Он стоит между Анной и пультом и ещё не знает, что письмо уже прочитано.':'Портал чинится у щитка. Про Олега он не готов говорить сейчас.'))}</p><div class="stack">${(ready?[['confession','Что случилось в 2016-м?'],['outsmart','Показать письмо и увести его'],['kill','Убрать его с дороги'],['ask','Что он скажет']]:[['ask','Что искать дальше?'],['empathize','Мы разберёмся вместе'],['evidence','Сопоставить записи'],...(g.inventory.includes('fatherlog')?[['confession','Что случилось в 2016-м?']]:[])]).map(([id,t])=>`<button class="choice${id==='kill'?' danger':''}" data-ui="talk" data-id="${id}">${t}</button>`).join('')}</div><button data-ui="close">Вернуться</button>`;}}
 else if(modal.type==='travel'){
  title='Портал времени';
  const portal=g.portal;
  if(!portal.repaired){
   body=g.inventory.includes('portal_fuse')
    ?`<p>Предохранитель на месте. Соберите чертёж на щите.</p>${puzzleView()}`
    :'<p>Предохранитель перегорел. Возьмите запасной в ящике справа: пазл собирается здесь, на щитке.</p>';
  }else{
   body=`<p>Выберите эпоху на щитке, затем пройдите сквозь светящийся портал.</p><div class="time-choices">${g.epochs.map(e=>`<button class="choice time-choice ${e.stage===selected?'selected':''}" data-ui="travel-to" data-id="${e.stage}" ${e.stage===g.stage?'disabled':''}><b>${e.year}</b><span>${esc(e.name)}</span><small>${e.stage===g.stage?'Вы здесь':e.stage===portal.target?'Проход открыт':'Открыть проход'}</small></button>`).join('')}</div><p class="small">Клавиши 1–3 открывают проход. Затем войдите в арку.</p>`;
  }
  body+='<button data-ui="close">Отойти от щитка</button>';
 }
 else if(modal.type==='shop'){title='Финальная глава';body=`<p>Все три эпохи, сейф и ремонт доступны бесплатно. Полная версия открывает финальные решения и повторное прохождение всех трёх концовок.</p><div class="price">990 ₸</div><p class="small">Учебный платёжный стенд. Никакой карты и списания денег.</p><div class="stack"><button class="primary" data-ui="payment" data-id="success">Тест: успешная покупка</button><button data-ui="payment" data-id="failure">Тест: ошибка</button><button data-ui="payment" data-id="cancel">Отменить</button></div>`;}
 else if(modal.type==='bought'){title='Финальная глава открыта';body='<p>Записи и прогресс не изменились.</p><button class="primary" data-ui="finale">Вернуться к решению</button><button data-ui="close">Продолжить исследование</button>';}
 else if(modal.type==='restart'){title='Начать новое расследование';body='<p>Прогресс текущего расследования будет заменён. Завершённые финалы и доступ к полной версии сохранятся.</p><button class="primary" data-ui="new-confirm">Начать заново</button><button data-ui="close">Вернуться</button>';}
 else if(modal.type==='stats'){title='Завершённые истории';body=`<div class="history">${state.results.map(r=>`<div>${esc(r.ending)} · ${r.score} очков</div>`).join('')||'<p>Финалы ещё не открыты.</p>'}</div><button data-ui="close">Вернуться</button>`;}
 else{title='Управление';body=controlsView();}
 root.innerHTML=`<div class="backdrop"><section class="dialog ${['journal','clue','intro'].includes(modal.type)?'notebook':''}" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><h2 id="dialog-title">${title}</h2>${body}</section></div>`;root.querySelector('button:not(:disabled)')?.focus({preventScroll:true});}
async function verify(){
 if(!modal)return;
 const current=modal,g=state.game;
 const data={position:world.position()};
 if(current.type==='safe'&&!g.safe_open)await action('safe_check',{...data,values:current.values});
 else if(current.type==='travel'&&!g.portal.repaired&&current.values)await action('portal_repair',{...data,circuit:current.values});
 else if(current.type==='bypass'&&!g.repairs.valve&&['signature','carrier','delay'].every(id=>g.inventory.includes(id))){
  const result=await action('bypass',{...data,line:['a','b','c'][selected]});
  if(result?.game.repairs.valve)world.pulseValve();
 }else return;
 if(modal===current)renderModal();
}
async function interact(){if(modal){confirm();return;}if(screen!=='game'||busy)return;const n=world.nearest();if(!n){toast('Подойдите ближе и наведите взгляд на предмет.');return;}if(n.type==='clue')await action('collect',{id:n.id,position:world.position()});else openModal({type:n.type});}
function confirm(){if(!modal){if(screen==='start')go('menu');return;}if(modal.type==='safe'&&!state.game.safe_open){ui('dial',selected+':1');return;}if(modal.type==='travel'&&modal.values&&!state.game.portal.repaired){ui('circuit',String(selected));return;}if(modal.type==='bypass'&&!state.game.repairs.valve&&['signature','carrier','delay'].every(id=>state.game.inventory.includes(id))){verify();return;}if(modal.type==='travel'&&state.game.portal.repaired){openPortal(selected);return;}const items=$('modal-layer').querySelectorAll('.choice:not(:disabled)');if(items.length)items[selected%items.length].click();else $('modal-layer').querySelector('button:not(:disabled)')?.click();}
function command(cmd,source){if(cmd==='binding-changed'){renderModal();return;}if(cinematic||!state||!world)return;if(!$('finale-scene').hidden){if(cmd==='pause')skipOverlay();return;}if(transferring&&cmd!=='pause')return;if(['travel','journal','hint','jump'].includes(cmd)&&(screen!=='game'||state.game?.phase!=='explore'))return;if(cmd==='microphone'){controls.toggleVoice();return;}if(cmd==='gestures'){controls.toggleCamera();return;}if(cmd==='view'){world.toggleView();render();return;}if(cmd.startsWith('look-'))return;if(cmd==='travel'&&state.game){if(modal?.type==='travel')closeModal();else showPortalPanel();return;}if(cmd==='circuit-check'){verify();return;}if(cmd==='pause'){if(transferring)return;if(modal?.type==='intro')closeModal();else if(screen==='game')go('pause');else if(screen==='pause')continueGame();return;}if(cmd==='resume'){if(modal)closeModal();else continueGame();return;}if(cmd==='journal'&&state.game){openModal({type:'journal'});return;}if(cmd==='hint'){showHint();return;}if(cmd==='interact'||cmd==='confirm'){interact();return;}if(cmd==='jump'){if(modal)verify();else world.jump();return;}if(cmd.startsWith('navigate-')){if(!modal)return;const direction=cmd.slice(9);if(modal.type==='travel'&&modal.values?.length===9){const delta=direction==='right'?1:direction==='left'?-1:direction==='back'?3:direction==='forward'?-3:0;if(delta){selected=(selected+delta+9)%9;renderModal();}return;}if(['left','right'].includes(direction)){const count=modal.values?.length||$('modal-layer').querySelectorAll('.choice').length||1;selected=(selected+(direction==='right'?1:-1)+count)%count;renderModal();}else if(modal.values&&['forward','back'].includes(direction))ui('dial',selected+':'+(direction==='forward'?1:-1));return;}if(cmd.startsWith('choice')&&modal){const n=Number(cmd.slice(6))-1;if(modal.type==='travel'&&modal.values&&n<modal.values.length)ui('circuit',String(n));else if(modal.values&&n<modal.values.length)ui('dial',n+':1');else if(modal.type==='bypass'&&n<3&&!state.game.repairs.valve)ui('select-pipe',String(n));else if(modal.type==='travel'&&n<3&&state.game.portal.repaired)openPortal(n);else{selected=n;confirm();}return;}if(cmd==='start'&&['start','menu'].includes(screen))newGame();if(cmd==='retry'&&screen==='over')action('retry');}
function continueGame(){if(!state||!world)return;if(state.game?.phase==='over'&&['timeout','rupture','trapped'].includes(state.game.failure_kind)){startFlood({game:state.game});return;}if(!state.game){newGame();return;}const restore=pausedModal;pausedModal=null;go(state.game.phase==='results'?'results':state.game.phase==='over'?'over':'game');if(screen==='game'&&restore){modal=restore.puzzle;selected=restore.selection;renderModal();active();}if(screen==='results')playFinale(state.game);if(screen==='game'&&!modal)world.captureLook();}
async function newGame(){if(state.game&&!['results','over'].includes(state.game.phase)){openModal({type:'restart'});return;}await action('new');}
function showPortalPanel(){
 const g=state.game;
 if(screen!=='game'||g?.phase!=='explore'||transferring)return;
 const [x,z]=world.position(),[panelX,panelZ]=g.portal.console;
 if(Math.hypot(x-panelX,z-panelZ)>2.5){
  if(modal)closeModal();
  toast('Щиток портала в главном зале. Портал отмечен на плане станции.');
  return;
 }
 openModal({type:'travel'});
}

async function openPortal(target){
 const g=state.game;
 if(modal?.type!=='travel'||!g.portal.repaired||!Number.isInteger(target)||target<0||target>2||target===g.stage)return;
 const result=await action('portal_open',{target,position:world.position()});
 if(result?.game.phase==='explore'&&screen==='game')closeModal();
}

async function travelThroughPortal(position){
 const g=state.game,target=g?.portal?.target;
 if(screen!=='game'||modal||busy||transferring||cinematic||g?.phase!=='explore'||target==null)return;
 transferring=true;controls.resetMotion();active();
 const overlay=$('time-transfer'),motion=state.settings.motion!==false;
 overlay.hidden=false;
 overlay.classList.toggle('long',motion);
 overlay.querySelector('.transfer-date').textContent=g.epoch.year+' → '+g.epochs[target].year;
 document.body.classList.add('shifting');
 station.travel();station.duck();
 try{
  await new Promise(resolve=>setTimeout(resolve,motion?360:0));
  if(!cinematic&&screen==='game')await action('travel',{position});
  await new Promise(resolve=>setTimeout(resolve,motion?650:140));
 }finally{
  overlay.hidden=true;
  document.body.classList.remove('shifting');
  transferring=false;station.restore();active();
  if(screen==='game'&&!modal){
   world.captureLook();
   const year=state.game.epoch.year;
   if(year===g.epochs[target].year&&annaLines[year])speakAnna(year);
  }
 }
}
function showHint(){
 if(screen!=='game'||busy||transferring||cinematic||world.confession)return;
 go('pause');
 openModal({type:'help',openHints:true});
}
function swapPuzzle(index){
 if(modal?.type!=='travel'||modal.values?.length!==9)return;
 index=Number(index);
 if(!Number.isInteger(index)||index<0||index>8)return;
 selected=index;
 if(modal.held==null||modal.held===index){modal.held=modal.held===index?null:index;renderModal();return;}
 const from=modal.held;
 [modal.values[from],modal.values[index]]=[modal.values[index],modal.values[from]];
 modal.held=null;
 renderModal();
 if(modal.values.every((piece,slot)=>piece===slot))verify();
}
async function ui(name,id){if(cinematic||!state||!world)return;if(busy&&!['close','pause','menu','help'].includes(name))return;if(name==='hint'){showHint();return;}
 if(name==='settings-tab'&&screen==='pause'&&['sound','display'].includes(id)){settingsPage=settingsPage===id?null:id;render();$('screen').querySelector(`[data-id="${id}"]`).focus();return;}
 if(name==='guide-hint'){await guideHint();return;}
 if(name==='rebind'&&modal?.type==='help'&&Object.hasOwn(bindings,id)){
  controls.resetMotion();controls.captureKey=id;renderModal();return;
 }
 if(name==='reset-bindings'&&modal?.type==='help'){controls.resetBindings();renderModal();return;}if(name==='back-puzzle'&&modal?.returnTo){({puzzle:modal,selection:selected}=modal.returnTo);renderModal();return;}if(name==='dial'&&modal?.values){const [i,d]=id.split(':').map(Number),max=modal.max??9;selected=i;modal.values[i]=(modal.values[i]+d+max+1)%(max+1);renderModal();return;}if(name==='verify'){await verify();return;}if(name==='select-pipe'&&modal?.type==='bypass'){selected=Number(id);renderModal();return;}if(name==='finish'){if(id!=='unsafe'&&!state.full_access){ui('shop');return;}await action('finish',{id,position:world.position()});return;}if(name==='npc'){openModal({type:'npc'});return;}if(name==='circuit'&&modal?.values){swapPuzzle(id);return;}if(name==='talk'){const r=await action('talk',{intent:id,position:world.position()});if(r&&id==='outsmart'&&r.game.sergey==='outsmart'){closeModal();world.startDeparture();}else if(r&&id==='confession'&&r.game.phase==='explore')playConfession();else if(r?.game.phase==='explore')openModal({type:'npc'});return;}if(name==='warn'){await action('warn',{position:world.position()});renderModal();return;}if(name==='menu'){go('menu');return;}if(name==='continue'||name==='resume'){continueGame();return;}if(name==='new'){newGame();return;}if(name==='new-confirm'){await action('new');return;}if(name==='retry'){await action('retry');world.captureLook();return;}if(name==='view'){command('view');return;}if(name==='pause'){go('pause');return;}if(name==='travel'){showPortalPanel();return;}if(name==='travel-to'){await openPortal(Number(id));return;}if(name==='portal-repair'&&modal?.type==='travel'){await action('portal_repair',{position:world.position()});return;}if(name==='close'){closeModal();return;}if(name==='shop'){const r=await post('/api/checkout');if(r?.event.order_id)openModal({type:'shop',order:r.event.order_id});else if(r)toast('Финальная глава уже открыта.');return;}if(name==='payment'){const order=modal.order;const r=await post('/api/sandbox/confirm',{order_id:order,outcome:id});if(r){modal=id==='success'?{type:'bought'}:id==='failure'?{type:'shop',order}:null;render();}return;}if(['help','journal','stats','finale','unsafe'].includes(name))openModal({type:name});}
function status(kind,text,on=false){if(kind==='voice'){station.setListening(on);$('voice-status').textContent=text==='Микрофон выключен.'?'':text;$('voice-toggle').setAttribute('aria-pressed',String(on));$('voice-toggle').textContent=on?'Выключить микрофон':'Микрофон';}else{$('gesture-label').textContent=text;$('gesture-toggle').setAttribute('aria-pressed',String(on));$('gesture-toggle').textContent=on?'Выключить жесты':'Жесты';if(!on)toast(text);}}
document.addEventListener('click',e=>{const b=e.target.closest('[data-ui]');if(b&&!b.disabled)ui(b.dataset.ui,b.dataset.id);});document.addEventListener('change',e=>{if(['volume','music','effects'].includes(e.target.id))post('/api/settings',{settings:{[e.target.id]:Number(e.target.value)}}).then(()=>render());if(e.target.id==='graphics')post('/api/settings',{settings:{graphics:Number(e.target.value)}}).then(()=>render());if(e.target.dataset.setting)post('/api/settings',{settings:{[e.target.dataset.setting]:e.target.checked}}).then(()=>render());});document.addEventListener('input',e=>{if(['volume','music','effects'].includes(e.target.id)){const label=$(e.target.id+'-value');if(label)label.textContent=e.target.value;}});
$('view-toggle').onclick=()=>command('view');$('brand').onclick=e=>{e.preventDefault();go('menu');};$('voice-toggle').onclick=()=>controls.toggleVoice();$('gesture-toggle').onclick=()=>controls.toggleCamera();$('swap-hands').onclick=()=>controls.swapHands();$('camera-stop').onclick=()=>controls.stopCamera();$('pause-toggle').onclick=()=>screen==='game'?go('pause'):continueGame();$('help-toggle').onclick=()=>openModal({type:'help'});
document.addEventListener('keydown',e=>{if(e.key==='Tab'&&modal){const a=[...$('modal-layer').querySelectorAll('button:not(:disabled),input,summary')],first=a[0],last=a.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus({preventScroll:true});}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus({preventScroll:true});}}});
function update(now){requestAnimationFrame(update);if(!state||!world)return;updateAmbience(now);world.setMotion(state.settings.motion!==false);if(cinematic){updateObjective();world.setActive(false);return;}active();updatePressure();world.lookInput=screen==='game'&&!world.confession&&!modal&&!transferring?controls.lookMotion():{x:0,y:0};world.sprinting=controls.keys.has('sprint');world.input=screen==='game'&&!world.confession&&!modal&&!transferring?controls.motion():{x:0,z:0};const exploring=screen==='game'&&!world.confession&&!modal&&!transferring;const n=exploring?world.nearest():null;const prompt=$('interaction'),aim=$('aim');prompt.hidden=!n;aim.hidden=!exploring;aim.classList.toggle('focused',!!n);if(n){
 const key=keyLabel(controls.bindings.interact);
 if(prompt.firstElementChild.textContent!==key)prompt.firstElementChild.textContent=key;
 const caption=`${n.verb} · ${n.name}`;
 if(prompt.lastElementChild.textContent!==caption)prompt.lastElementChild.textContent=caption;
}}requestAnimationFrame(update);
const gameClock=new GameClock(()=>state,(kind,payload)=>post('/api/action',{kind,payload}),startFlood);
function startFlood(result){if(cinematic)return;closeFinale();const kind=result.game?.failure_kind,captions=kind==='trapped'?['Линия В замкнулась','Портал не активируется','Анна остаётся в 1978 году']:kind==='rupture'?['Труба не выдержала','Напор рвёт линию А','Машинный зал залит']:['Водосброс не получил команду','Напорная линия не выдержала давление','Машинный зал затоплен'];cinematic=true;screen='cinematic';modal=null;controls.resetMotion();controls.stopVoice();controls.stopCamera();world.releaseLook();world.setActive(false);document.body.classList.add('cinematic');$('map-panel').hidden=true;$('countdown').hidden=true;$('aim').hidden=true;$('interaction').hidden=true;$('screen').innerHTML='';$('modal-layer').innerHTML='';$('toast').classList.remove('show');$('accident-scene').hidden=false;$('accident-caption').textContent=captions[0];world.startFlood(result.game,state.settings.motion);gameClock.sync(false);sound('error');let step=0;cinematicAlarm=setInterval(()=>{step++;if(step===2)$('accident-caption').textContent=captions[1];if(step===4)$('accident-caption').textContent=captions[2];if(step<4)sound('error');},1500);cinematicTimer=setTimeout(endFlood,9000);}
function endFlood(){if(!cinematic)return;clearTimeout(cinematicTimer);clearInterval(cinematicAlarm);world.endFlood();cinematic=false;document.body.classList.remove('cinematic');$('accident-scene').hidden=true;screen='over';modal=null;render();}
function clearFinale(){clearTimeout(finaleTimer);clearTimeout(epilogueTimer);$('epilogue').hidden=true;closeFinale();}
let nextAmbientUpdate=0;
function updateAmbience(now){
 if(now<nextAmbientUpdate)return;
 nextAmbientUpdate=now+140;
 const g=state.game;
 const audible=screen==='game'&&g&&!transferring&&!document.hidden;
 const sources=audible?{
  machine:g.layout?.turbines,
  pipes:[g.valve_position,...(g.layout?.tanks||[])],
  water:g.flooded?[[-25,0]]:g.stage===1?[[0,-27]]:[],
  portal:g.portal?[g.portal.position]:[],
  vents:[[-18,14],[20,-11]],
 }:{};
 const p=world.player.position;
 station.ambientAt(p.x,p.z,world.yaw,sources);
}
function updatePressure(){
 const g=state.game;
 const playing=screen==='game'&&!document.hidden&&g?.phase==='explore';
 const current=playing&&!world.confession?pressureLevel(gameClock.remaining()):0;
 world.pressure=g?.stage===1?current:0;
 station.setPressure(world.pressure);
 document.body.dataset.pressure=String(world.pressure);
 if(pressureRun!==g?.run_id+':'+g?.attempt){pressureRun=g?.run_id+':'+g?.attempt;announcedPressure=0;}
 if(world.pressure>announcedPressure&&!voices.playing&&!modal&&!transferring&&!world.confession){
  announcedPressure=world.pressure;
  voices.play(world.pressure===2?'critical':'warning',state.settings);
 }
}
function playConfession(){
 closeModal();
 world.startConfession();
 active();
 const overlay=$('finale-scene');
 overlay.classList.add('reunion');
 overlay.hidden=false;
 document.body.classList.add('finale');
 station.duck();
 const lines=[
  ['Сергей · 2016','Олег, ты слышишь? Давление растёт. Я размыкаю контур.','sergey',5050],
  ['Олег · 2016','Сергей, подожди! Я ещё здесь!','trapped',3250],
  ['Сергей · сейчас','Аня, я слышал его голос. Но всё равно отключил контур.','aftermath',5000],
  ['Анна Соколова',annaLines.confession,'anna-confession',4400],
 ];
 function next(index){
  if(index===lines.length){closeFinale();return;}
  const [speaker,line,voice,duration]=lines[index];
  $('finale-speaker').textContent=speaker;
  $('finale-line').textContent=line;
  let advanced=false;
  const advance=()=>{
   if(advanced||overlay.hidden)return;
   advanced=true;clearTimeout(finaleTimer);next(index+1);
  };
  finaleTimer=setTimeout(advance,duration);
  voices.play(voice,state.settings).then(played=>{
   if(played&&!advanced&&!overlay.hidden){
    clearTimeout(finaleTimer);
    finaleTimer=setTimeout(advance,360);
   }
  });
 }
 next(0);
}

function endingScript(g){
 const killed=g.sergey==='killed';
 if(g.ending==='Возвращение')return {shot:'return',lines:[
  ['Олег Соколов','Аня… это правда ты?','oleg'],
  ['Анна Соколова','Да, пап. Для тебя прошло несколько минут. Для меня — десять лет.','anna-end-return-a'],
  ['Анна Соколова','Катушка вывела тебя из контура, а линия Б открыла водосброс. Город останется на месте.','anna-end-return-b'],
  ['Анна Соколова','Эти годы я тебе не верну. Ты видишь взрослую дочь, а я — отца, который не постарел.','anna-end-return-c'],
  ['Анна Соколова',killed?'Сергея у пульта больше нет. Он не успел снова разомкнуть контур. Это решение теперь наше: ты здесь, и долина цела.':'Сергей вышел через дверь станции и не стоит у пульта. Он опоздал к выбору, который когда-то сделал за нас. Ты здесь, и долина цела.',killed?'anna-end-return-d-killed':'anna-end-return-d-away'],
 ]};
 if(g.ending==='Последняя смена')return {shot:'seal',lines:[
  ['Анна Соколова','Я не стала вытаскивать тебя, пап. Я выбрала город.','anna-end-seal-a'],
  ['Анна Соколова','Четвёртый контур остался закрыт. Водосброс открылся, и вода ушла мимо домов в низине.','anna-end-seal-b'],
  ['Анна Соколова','В приёмнике одно слово: я понял. Ты остался между временами, без прощания и без обещания вернуться.','anna-end-seal-c'],
  ['Анна Соколова',killed?'Сергей уже не скажет, что выбирал станцию. Я выбрала её сама. Город жив. Тебя я не дождалась.':g.sergey==='outsmart'?'Сергей больше не спрячет то, что сделал в две тысячи шестнадцатом. Теперь это моё: город жив, а я не дождалась тебя.':'Сергей остался на станции. Отменить это он уже не сможет: город жив, а тебя я не дождалась.',killed?'anna-end-seal-d-killed':g.sergey==='outsmart'?'anna-end-seal-d-away':'anna-end-seal-d-here'],
 ]};
 return {shot:'erase',lines:[
  ['Анна Соколова','Я отменила первый пуск. Станцию Ольхов не построили.','anna-end-erase-a'],
  ['Анна Соколова','Нет водохранилища и нет аварии. Ты не пропадал: ты жив, но никогда не работал здесь и не знаешь меня.','anna-end-erase-b'],
  ['Анна Соколова','В долине другой город. Людей никто не эвакуировал: топить их стало нечему. Я спасла их тем, что стёрла причину.','anna-end-erase-c'],
  ['Анна Соколова','Вместе с причиной стёрлись и эти десять лет. Мелодия в приёмнике — всё, что от них осталось. Объяснить её больше некому, потому что той жизни не было.','anna-end-erase-d'],
 ]};
}
function playFinale(g){
 if(!g)return;
 clearFinale();
 const script=endingScript(g),motion=state.settings.motion!==false,overlay=$('finale-scene');
 if(!(script.shot==='return'&&world.startReunion(motion)))world.startEnding(script.shot,motion);
 if(script.shot==='erase')world.setMemory(true);
 overlay.classList.add('reunion');
 overlay.hidden=false;
 document.body.classList.add('finale');
 station.duck();
 function next(index){
  if(overlay.hidden)return;
  if(index===script.lines.length){closeFinale();return;}
  const [speaker,line,voice]=script.lines[index];
  $('finale-speaker').textContent=speaker;
  $('finale-line').textContent=line;
  let advanced=false;
  const advance=()=>{if(advanced||overlay.hidden)return;advanced=true;clearTimeout(finaleTimer);next(index+1);};
  finaleTimer=setTimeout(advance,Math.max(5200,line.length*85));
  voices.play(voice,state.settings).then(played=>{if(played&&!advanced&&!overlay.hidden){clearTimeout(finaleTimer);finaleTimer=setTimeout(advance,motion?800:360);}});
 }
 next(0);
}
function closeFinale(){
 clearTimeout(finaleTimer);
 clearAnnaCaption();
 $('finale-scene').hidden=true;
 document.body.classList.remove('finale');
 world?.endReunion();
 world?.endEnding();
 if(world?.confession){world.endConfession();active();}
 voices.stop();
 world?.setMemory(false);
 station.restore();
}
function showEpilogue(hold){$('epilogue').hidden=false;epilogueTimer=setTimeout(()=>{$('epilogue').hidden=true;},hold?4200:1800);}
function skipOverlay(){if(cinematic){endFlood();return;}if(!$('finale-scene').hidden){closeFinale();return;}if(!$('epilogue').hidden){clearTimeout(epilogueTimer);$('epilogue').hidden=true;}}
$('skip-cinematic').onclick=endFlood;$('skip-finale').onclick=skipOverlay;
document.addEventListener('visibilitychange',()=>{if(document.hidden&&screen==='game')go('pause');else active();});
addEventListener('pagehide',()=>{if(!world||state?.game?.phase!=='explore')return;const data={kind:'clock',payload:{running:false,position:world.position()},request_id:crypto.randomUUID(),revision:state.revision};navigator.sendBeacon('/api/action',new Blob([JSON.stringify(data)],{type:'application/json'}));});
addEventListener('blur',()=>{if(screen==='game'&&!transferring&&!cinematic)go('pause');});
getState().catch(e=>{$('screen').innerHTML=`<div class="error-card"><h2>Игра не подключилась</h2><p>${esc(e.message)} Запустите Start.command или Start.bat.</p><button onclick="location.reload()">Повторить</button></div>`;});
window.chronoshov={get state(){return state;},get screen(){return screen;},get world(){return world;},get controls(){return controls;}};
