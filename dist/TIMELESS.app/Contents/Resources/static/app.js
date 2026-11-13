import {createStoryAudio,pressureLevel} from './story-audio.js';
import {World} from './world.js';
import {Controls} from './controls.js';
import {GameClock} from './clock.js';
import {createSound} from './audio.js';
const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let state=null,screen='start',modal=null,busy=false,queue=Promise.resolve(),world,toastTimer,transferring=false,selected=0,cinematic=false,cinematicTimer,cinematicAlarm,finaleTimer,epilogueTimer,worldError=null,pausedModal=null;
const station=createSound();
const voices=createStoryAudio();
let pressureRun, announcedPressure=0;
const controls=new Controls(command,status);
try{world=new World($('world'),{collect:()=>{},damage:()=>{},breaker:()=>{station.cue("error");station.land();},enterPortal:travelThroughPortal,lookPaused:()=>{if(screen==='game'&&!world.confession&&!modal&&!transferring)go('pause');},footstep:()=>station.step(),land:()=>station.land()});}catch(e){worldError=e;$('screen').innerHTML=`<div class="error-card"><h2>Не удалось открыть 3D сцену</h2><p>${esc(e.message)}</p><button onclick="location.reload()">Повторить</button></div>`;}
function sound(kind){if(!kind||!state?.settings.volume)return;try{station.setVolumes(state.settings);station.cue(kind);}catch(e){}}
function toast(text){if(!text)return;$('toast').textContent=text;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),4800);}
async function getState(){const r=await fetch('/api/state',{cache:'no-store'});if(!r.ok)throw Error('Сервер не отвечает.');state=await r.json();world?.sync(state.game);if(!worldError)render();}
function post(path,fields={}){const job=queue.then(async()=>{const quiet=['clock','tick'].includes(fields.kind);if(!quiet)busy=true;const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);try{if(['clock','tick'].includes(fields.kind)&&state.game?.phase!=='explore')return null;const response=await fetch(path,{keepalive:fields.kind==='clock',method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...fields,...(quiet?{payload:{...fields.payload,position:world.position()}}:{}),request_id:crypto.randomUUID(),revision:state.revision}),signal:controller.signal});const data=await response.json();if(!response.ok){if(response.status===409)await getState();throw Error(data.error||'Действие не сохранено.');}state=data;world?.sync(state.game);if(data.event?.message)toast(data.event.message);sound(data.event?.sound);return data;}finally{clearTimeout(timer);if(!quiet)busy=false;}});queue=job.catch(()=>{});return job.catch(e=>{toast(e.name==='AbortError'?'Связь прервалась. Обновляем сохранение.':e.message);if(e.name==='AbortError')getState().catch(()=>{});return null;});}
async function action(kind,payload={}){const out=await post('/api/action',{kind,payload:{source:controls.motion().source,...payload}});if(!out)return null;if(['new','retry'].includes(kind)){clearFinale();pausedModal=null;screen='game';modal=null;}if(out.event?.confront==='sergey'){modal={type:'npc'};}else if(out.event?.confront){modal={type:'blocked',mode:out.event.confront};}if(out.game?.phase==='over'&&['timeout','rupture','trapped'].includes(out.game.failure_kind)){startFlood(out);return out;}if(out.game?.phase==='results'){screen='results';modal=null;controls.stopVoice();controls.stopCamera();render();playFinale(out.game);return out;}if(out.game?.phase==='over'){screen='over';modal=null;controls.stopVoice();controls.stopCamera();}if(out.event?.intro)modal={type:'intro'};render();if(out.event?.intro){openModal({type:'intro'});voices.play('intro',state.settings);}else if(out.event?.clue)openModal({type:'clue',clue:out.event.clue});else if(out.event?.reveal){const c=out.game.notes.find(n=>n.id===out.event.reveal);openModal({type:'clue',clue:c});}return out;}
function active(){if(!world)return;document.body.classList.toggle('playing',screen==='game'&&!world.confession&&!modal&&!transferring);world.inGame=!!state?.game&&['game','pause'].includes(screen);world.setActive(screen==='game'&&!world.confession&&!modal&&!busy&&!transferring&&!!state?.game);if(screen!=='game'||modal||transferring)world.releaseLook();gameClock.sync(!!state?.game&&state.game.phase==='explore'&&screen==='game'&&!world.confession&&!['intro','help','shop','bought'].includes(modal?.type)&&!document.hidden&&!cinematic);}
function go(next){if(next==='pause'&&screen==='game')pausedModal=modal?{puzzle:modal,selection:selected}:null;else if(next!=='game')pausedModal=null;if(next!=='results')clearFinale();screen=next;modal=null;controls.resetMotion();render();}
function render(){if(!state)return;const g=state.game;document.body.classList.toggle('era-future',g?.stage===2&&screen==='game');document.body.classList.toggle('era-1978',g?.stage===0&&screen==='game');document.body.classList.toggle('era-2026',g?.stage===1&&screen==='game');document.body.classList.toggle('era-2074',g?.stage===2&&screen==='game');document.body.classList.toggle('tense',screen==='game'&&g?.stage===1);station.setVolumes(state.settings);world?.setMotion(state.settings.motion!==false);world?.setGraphics(state.settings.graphics??1);if(screen==='game'&&g)station.playBed(g.stage);document.body.classList.toggle('large',state.settings.large);document.body.classList.toggle('contrast',state.settings.contrast);document.body.classList.toggle('reduced',!state.settings.motion);document.body.classList.toggle('playing',screen==='game'&&!modal);$('connection').textContent=screen==='game'?g.epoch.year+' · '+g.epoch.name:'TIMELESS';$('view-toggle').hidden=!g;$('view-toggle').textContent=world?.mode==='first'?'От первого лица · V':'От третьего лица · V';$('pause-toggle').hidden=!g;$('countdown').hidden=!g||!['game','pause'].includes(screen);$('map-panel').hidden=screen!=='game';$('aim').hidden=screen!=='game'||!!modal;$('screen').innerHTML=({start:startView,menu:menuView,game:()=>'',pause:pauseView,results:resultView,over:overView}[screen]||menuView)();renderHUD();renderModal();active();document.title='TIMELESS'+(g&&screen==='game'?' · '+g.epoch.year:'');}
function startView(){
 return `<section class="hero timeless-start"><h1 class="timeless-title"><img src="/assets/timeless-logo.png" width="1672" height="941" alt="TIMELESS"></h1><div class="eyebrow">Гидроузел Ольхов · 17:40</div><p class="lead">Анна ловит голос отца, пропавшего десять лет назад. До аварии на станции осталось 25 минут.</p><div class="actions"><button class="primary" data-ui="menu">Войти на станцию</button><button data-ui="help">Управление</button></div></section>`;
}
function menuView(){
 return `<section class="hero"><h1>TIMELESS</h1><div class="menu-buttons"><button class="primary" data-ui="continue" ${state.game?'':'disabled'}>Продолжить <span>${state.game?state.game.epoch.year:'нет сохранения'}</span></button><button data-ui="new">Новое расследование</button><button data-ui="pause">Настройки</button><button data-ui="stats">Открытые финалы <span>${state.stats.endings}/3</span></button><button data-ui="shop" ${state.full_access?'disabled':''}>${state.full_access?'Финальная глава открыта':'Финальная глава · 990 ₸'}</button></div><p class="menu-summary">Учебная покупка без списания денег.</p></section>`;
}
function renderHUD(){
 const g=state.game;
 const hud=$('hud');
 hud.hidden=screen!=='game'||!g;
 if(hud.hidden)return;
 const goal=g.objective;
 const portalYear=g.portal.target==null?null:g.epochs[g.portal.target].year;
 hud.innerHTML=`<div class="hud-panel"><div class="eyebrow">${g.epoch.year} / ${esc(goal.room)}</div><div class="hud-title">${esc(goal.title)}</div><p class="objective">${portalYear?'Пройдите через арку, чтобы попасть в '+portalYear+' год.':esc(goal.text)}</p><div class="hud-bottom"><button data-ui="journal"><kbd>J</kbd> Журнал</button><button data-ui="travel"><kbd>R</kbd> Портал</button><button data-ui="hint"><kbd>H</kbd> Подсказка</button></div></div>`;
}
function pauseView(){return `<section class="center-panel"><div class="card"><div class="eyebrow">Расследование приостановлено</div><h2>Пауза и настройки</h2><div class="grid-2"><div><h3>Звук, текст и камера</h3><button data-ui="view">${world.mode==='first'?'Первое':'Третье'} лицо · сменить V</button><div class="setting"><label for="volume">Общая громкость <span id="volume-value">${state.settings.volume}</span>%</label><input id="volume" type="range" min="0" max="100" value="${state.settings.volume}"></div><div class="setting"><label for="music">Музыка станции <span id="music-value">${state.settings.music??70}</span>%</label><input id="music" type="range" min="0" max="100" value="${state.settings.music??70}"></div><div class="setting"><label for="effects">Эффекты <span id="effects-value">${state.settings.effects??80}</span>%</label><input id="effects" type="range" min="0" max="100" value="${state.settings.effects??80}"></div><div class="setting"><label for="graphics">Графика</label><select id="graphics"><option value="2" ${(state.settings.graphics??1)===2?'selected':''}>Высокая</option><option value="1" ${(state.settings.graphics??1)===1?'selected':''}>Сбалансированная</option><option value="0" ${(state.settings.graphics??1)===0?'selected':''}>Производительная</option></select></div>${[['large','Крупный текст'],['contrast','Высокий контраст'],['motion','Плавные переходы']].map(([k,t])=>`<label class="setting check"><input type="checkbox" data-setting="${k}" ${state.settings[k]?'checked':''}>${t}</label>`).join('')}</div><div><h3>Спокойное исследование</h3><p>В корпусе нет случайных ловушек и атакующих дронов. Двери, вода и отключённое оборудование связаны с расследованием. Неверная настройка не отнимает здоровье, но тратит время. До аварии 25 минут игрового времени. Таймер продолжается в других эпохах и при решении головоломок; этот экран ставит его на паузу.</p><p class="small">Голос M и жесты G работают локально. Две руки независимо управляют персонажем и камерой. V меняет вид, R открывает настройки портала у щитка.</p><button data-ui="help">Все команды</button></div></div><div class="actions">${state.game?'<button class="primary" data-ui="resume">Продолжить</button>':''}<button data-ui="menu">Главное меню</button></div></div></section>`;}
function outcomeText(g){const sergey=g.sergey==='killed'?'Сергея у входа больше нет. ':'Сергей ушёл проверять западный проход и опоздал к пульту. ';if(g.ending==='Возвращение')return 'Олег выходит из портала. Для него прошло несколько минут, для Анны — десять лет. Он видит взрослую дочь и не узнаёт её сразу. '+sergey+'Катушка вывела его из контура, линия Б открыла водосброс. Потерянные годы остаются потерянными. '+(g.warned?'Жителей предупредили: они успели покинуть низину и возвращаются домой.':'Жителей не предупредили. Водосброс открылся, но низина встретила воду людьми, которые не успели выйти.');if(g.ending==='Последняя смена')return 'Анна закрыла четвёртый контур. Город устоял. В приёмнике только «Я понял»: ни прощания, ни обещания, что голос вернётся. Олег остался между временами. '+(g.sergey==='killed'?'Сергей уже не может это оспорить.':'Сергей больше не может прятать решение 2016 года за старым отчётом.');return 'Первого пуска не было. Нет водохранилища, нет аварии и нет исчезновения Олега на станции. В долине другой город, и семья Анны никогда не работала на гидроузле. Приёмник иногда ловит знакомую мелодию. Анна не может объяснить, откуда она её знает.';}
function resultView(){const g=state.game;return `<section class="result card"><div class="eyebrow">Расследование завершено</div><h1>${esc(g.ending)}</h1><p class="lead">${esc(outcomeText(g))}</p><div class="result-stats"><div><b>${g.P}</b><span>Очки</span></div><div><b>${g.C}/3</b><span>Согласованные узлы</span></div><div><b>${state.stats.endings}/3</b><span>Открытые финалы</span></div></div>${g.achievement?'<p class="gold">«Точная настройка» — без ошибочных проверок и подсказок.</p>':''}<div class="history">${g.history.map(t=>`<div>${esc(t)}</div>`).join('')}</div><div class="actions"><button class="primary" data-ui="new">Пройти иначе</button><button data-ui="menu">Главное меню</button></div></section>`;}
function overView(){const g=state.game,kind=g.failure_kind,freshStart=kind==='timeout'||kind==='trapped',eyebrow=kind==='timeout'?'Время вышло':kind==='trapped'?'Портал не зажёгся':kind==='rupture'?'Линия А':'Связь потеряна',title=kind==='timeout'?'Авария на станции':kind==='trapped'?'Заперта в 1978':kind==='rupture'?'Труба разорвана':'Аварийное размыкание',note=kind==='trapped'?'Линия В замкнула контур. Портал не активируется, Анна остаётся в прошлом. Расследование начинается сначала.':kind==='timeout'?'При новой попытке начнётся новое расследование с полными 25 минутами. Доступ к финальной главе и открытые концовки сохранятся.':kind==='rupture'?'Труба лопнула. Контрольная точка сохранила записи: линию можно выбрать заново.':'Найденные документы и ремонт сохранены в контрольной точке перед решением.';return `<section class="result card"><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p class="lead">${esc(g.failure)}</p><p>${note}</p><div class="actions"><button class="primary" data-ui="retry">${freshStart?'Начать новую попытку':'Вернуться к решению'}</button><button data-ui="menu">Главное меню</button></div></section>`;}
function openModal(next){if(next.type==='journal'&&modal&&['safe','bypass'].includes(modal.type))next.returnTo={puzzle:modal,selection:selected};modal=next;selected=0;if(next.type==='safe')modal.values=[0,0,0];if(next.type==='travel'){const g=state.game;selected=g.objective.stage===g.stage?(g.stage+1)%3:g.objective.stage;if(!g.portal.repaired&&g.inventory.includes('portal_fuse')){modal.values=[0,0,0,0];modal.max=3;}}controls.resetMotion();renderModal();active();}
function closeModal(){if(modal?.type==='intro')voices.stop();modal=null;controls.resetMotion();renderModal();active();if(screen==='game'&&!modal)world.captureLook();}
function dialView(labels,max){return `<div class="dial-grid">${modal.values.map((v,i)=>`<div class="dial-unit ${selected===i?'selected':''}"><span>${labels[i]}</span><button data-ui="dial" data-id="${i}:1" aria-label="Увеличить ${labels[i]}">+</button><b>${v}</b><button data-ui="dial" data-id="${i}:-1" aria-label="Уменьшить ${labels[i]}">−</button></div>`).join('')}</div><div class="actions"><button class="primary" data-ui="verify">Проверить · F</button><button data-ui="journal">Открыть записи</button><button data-ui="close">Вернуться</button></div><p class="small">1–3 меняют регулятор, F — проверка. Жесты: кулак/V — выбор, палец — поворот, жест прыжка — проверка. Голос: «проверить».</p>`;}
function circuitView(){const path=r=>['M24 44 L24 24 L44 24','M4 24 L24 24 L24 44','M4 24 L24 24 L24 4','M24 4 L24 24 L44 24'][r];return `<p class="riddle">На кожухе выжжено: «Жила не идёт напрямик. С левой клеммы спустись, обойди снизу, выйди справа».</p><div class="circuit-board">${modal.values.map((r,i)=>`<button class="choice circuit-tile ${selected===i?'selected':''}" data-ui="circuit" data-id="${i}" aria-label="Повернуть звено ${i+1}"><svg viewBox="0 0 48 48" aria-hidden="true"><path d="${path(r)}"></path></svg></button>`).join('')}</div><div class="actions"><button class="primary" data-ui="verify">Замкнуть цепь · F</button></div><p class="small">Нажмите звено, чтобы повернуть. Ток входит слева сверху и должен выйти справа сверху.</p>`;}
function renderModal(){const root=$('modal-layer');if(!modal){root.innerHTML='';return;}const g=state.game;let title='',body='';
 if(modal.type==='intro'){title='17:40. Голос отца';body='<div class="radio-transcript"><span>ОЛЕГ СОКОЛОВ</span><p>«Аня. Сначала клапан. Моя запись осталась за западным проходом. Не ищи меня, пока резерв не открыт».</p></div><p>Голос звучит так, будто отец замолчал на минуту, а не на десять лет. На записи стоит сегодняшняя дата. Архивной плёнкой 2016 года это быть не может.</p><p>Сергей у входа не удивлён и не хочет говорить об Олеге. Он показывает обесточенный портал: «Здесь иногда появляются вещи, которые не должны существовать».</p><p>Сначала найдите предохранитель у щитка. Загадка цепи выжжена на крышке: жила не идёт напрямик.</p><p class="circuit-status">25 минут до аварии. Время идёт и в других эпохах. Esc — пауза.</p><button class="primary" data-ui="close">К порталу</button>';}
 else if(modal.type==='clue'){title=modal.clue.name;body=`<div class="eyebrow">${modal.clue.year||g.epoch.year} · ${esc(modal.clue.room||'Станция')}</div><p class="document-text">${esc(modal.clue.text)}</p><p class="small">Запись сохранена в журнале (J).</p><div class="actions"><button class="primary" data-ui="close">Вернуться · E</button><button data-ui="journal">Все записи</button></div>`;}
 else if(modal.type==='journal'){title='Записи Анны';body=`<div class="quest-summary"><strong>${esc(g.objective.title)}</strong><p>${esc(g.objective.text)}</p></div><p class="era-note">${esc(g.epoch.intro)}</p><p class="small">${esc(g.epoch.world_note||'')}</p><div class="case-progress"><span class="${g.portal.repaired?'done':''}">1. Цепь портала</span><span class="${g.repairs.valve?'done':''}">2. Резерв</span><span class="${g.can_return?'done':''}">3. Катушка отца</span></div>${g.notes.map(n=>`<details class="journal-entry" ${n.story?'open':''}><summary>${n.year} · ${esc(n.name)}</summary><p>${esc(n.text)}</p></details>`).join('')}<div class="actions">${modal.returnTo?'<button class="primary" data-ui="back-puzzle">Вернуться к прибору</button>':''}<button data-ui="travel">Где портал?</button><button data-ui="close">Закрыть журнал</button></div>`;}
 else if(modal.type==='safe'){title=g.safe_open?'Архивный сейф открыт':'Сейф семейного дела';body=g.safe_open?'<p>Письмо в журнале: Сергей предатель. С ним нужно решить до пульта — увести или убрать с дороги.</p><button data-ui="journal">Прочитать письмо</button><button data-ui="close">Вернуться</button>':`<p>Три цифры, по одной в комнатах 1978 года. Архив — шкаф, турбинный зал — полка, диспетчерская — дело. Порядок тот же: шкаф, полка, дело.</p>${dialView(['Шкаф','Полка','Дело'],9)}`;}
 else if(modal.type==='bypass'){
  title='Западный клапан · 1978';
  if(g.repairs.valve)body='<p>Линия Б открыта. В 2074 году западный проход уже сухой — там катушка.</p><div class="actions"><button class="primary" data-ui="travel">К порталу</button><button data-ui="close">Вернуться</button></div>';
  else if(!['signature','carrier','delay'].every(id=>g.inventory.includes(id)))body='<p>Сначала снимите записи в архиве, турбинном зале и диспетчерской. Буквы на щите нет, пока не сведены все три.</p><div class="actions"><button data-ui="journal">Журнал</button><button data-ui="close">Вернуться</button></div>';
  else{
   const paths=['M12 24 H68 M88 24 H126 M69 17 l5 7 -5 7 M86 17 l-5 7 5 7',
    'M12 24 H50 Q62 24 62 13 H126 M116 8 l10 5 -10 5',
    'M12 24 H58 C58 3 106 3 106 24 C106 45 58 45 58 24'];
   body=`<p>Щит не подсказывает букву. Сведите архив, турбинный зал и диспетчерскую. Неверная труба рвётся. Линия В замыкает контур, и портал больше не зажигается.</p><div class="pipe-options">${['А','Б','В'].map((line,i)=>`<button class="choice pipe-option ${i===selected?'selected':''}" data-ui="select-pipe" data-id="${i}" aria-pressed="${i===selected}"><b>${line}</b><svg viewBox="0 0 138 48" aria-hidden="true"><path d="${paths[i]}"></path></svg></button>`).join('')}</div><div class="actions"><button class="primary" data-ui="verify">Открыть линию · F</button><button data-ui="journal">Сверить записи</button><button data-ui="close">Вернуться</button></div><p class="small">1, 2 и 3 выбирают трубу. F открывает подсвеченную. Сначала сверьте три комнаты.</p>`;
  }
 }
 else if(modal.type==='finale'){
  title='Аварийный пульт · 2026';
  if(!g.can_finish)body='<p>Сначала откройте резерв в 1978 году. Пульт заработает после этого.</p><div class="actions"><button class="primary" data-ui="travel">Выбрать эпоху</button><button data-ui="close">Вернуться</button></div>';
  else if(!g.can_return)body=`<p>Водосброс готов. Без катушки из 2074 года отца не вернуть.</p><div class="stack"><button class="choice primary" data-ui="travel">К порталу в 2074 год</button><button class="choice" data-ui="finish" data-id="seal">Только спасти город</button><button class="choice" data-ui="finish" data-id="erase">Отменить пуск станции</button><button class="choice danger" data-ui="unsafe">Передать сигнал без записи</button></div><button data-ui="close">Пока не решать</button>`;
  else if(!g.inventory.includes('letter'))body='<p>Катушка на месте, но возвращать отца рано. Сначала письмо в архивном сейфе: Сергей предатель, и это нужно знать до тумблера.</p><div class="actions"><button class="primary" data-ui="close">К сейфу</button></div>';
  else if(!g.sergey)body='<p>Письмо уже у Анны. Сергей всё ещё стоит у входа. Уведите его или уберите с дороги — потом пульт.</p><div class="actions"><button class="primary" data-ui="npc">К Сергею</button><button data-ui="close">Отойти</button></div>';
  else body=`<p>Тумблеры стёрты: у этого пульта уже стояли и выбирали, что разомкнуть.</p><p>Путь свободен. Можно вернуть отца и открыть водосброс. Предупреждение жителей меняет только этот финал.</p><div class="stack"><button class="choice primary" data-ui="finish" data-id="return">Вернуть отца и открыть водосброс</button><button class="choice" data-ui="finish" data-id="seal">Только спасти город</button><button class="choice" data-ui="finish" data-id="erase">Отменить пуск станции</button></div><div class="actions"><button data-ui="warn">${g.warned?'Жители предупреждены':'Предупредить жителей'}</button><button data-ui="close">Пока не решать</button></div>${state.full_access?'':'<p class="small">Финальные решения открываются учебной покупкой без списания.</p>'}`;
 }
 else if(modal.type==='blocked'){title='Сначала письмо';body='<p>Возвращать отца рано. В архивном сейфе письмо: Сергей предатель. Код собран из архива, турбинного зала и диспетчерской 1978 года.</p><div class="actions"><button class="primary" data-ui="close">Идти к сейфу</button></div>';}
 else if(modal.type==='unsafe'){title='Сигнал не согласован';body='<p>Принудительный импульс может оборвать связь. Автоматика остановит запуск, если фазы не совпадут.</p><div class="actions"><button class="danger" data-ui="finish" data-id="unsafe">Всё равно передать</button><button data-ui="finale">Вернуться к решению</button></div>';}
 else if(modal.type==='npc'){title='Сергей Морозов';if(!g.npc_position)body='<p>У входа пусто. К пульту можно идти.</p><button class="primary" data-ui="close">Вернуться</button>';else{const ready=g.inventory.includes('letter')&&g.can_return;body=`<div class="identity"><span class="initials">СМ</span><div><strong>Сергей Морозов</strong><small>Инженер последней смены 2016 года</small></div></div><p>${esc(g.chat.at(-1)?.reply||(ready?'Он стоит между Анной и пультом и ещё не знает, что письмо уже прочитано.':'Портал чинится у щитка. Про Олега он не готов говорить сейчас.'))}</p><div class="stack">${(ready?[['confession','Что случилось в 2016-м?'],['outsmart','Показать письмо и увести его'],['kill','Убрать его с дороги'],['ask','Что он скажет']]:[['ask','Что искать дальше?'],['empathize','Мы разберёмся вместе'],['evidence','Сопоставить записи'],...(g.inventory.includes('fatherlog')?[['confession','Что случилось в 2016-м?']]:[])]).map(([id,t])=>`<button class="choice${id==='kill'?' danger':''}" data-ui="talk" data-id="${id}">${t}</button>`).join('')}</div><button data-ui="close">Вернуться</button>`;}}
 else if(modal.type==='travel'){
  title='Портал времени';
  const portal=g.portal;
  if(!portal.repaired){
   body=g.inventory.includes('portal_fuse')
    ?`<p>Предохранитель на месте. Поверните четыре звена, пока жила не обойдёт щиток снизу.</p>${circuitView()}`
    :'<p>Предохранитель перегорел. Возьмите запасной в ящике справа: на крышке выжжена загадка цепи.</p>';
  }else{
   body=`<p>Выберите эпоху на щитке, затем пройдите сквозь светящийся портал.</p><div class="time-choices">${g.epochs.map(e=>`<button class="choice time-choice ${e.stage===selected?'selected':''}" data-ui="travel-to" data-id="${e.stage}" ${e.stage===g.stage?'disabled':''}><b>${e.year}</b><span>${esc(e.name)}</span><small>${e.stage===g.stage?'Вы здесь':e.stage===portal.target?'Проход открыт':'Открыть проход'}</small></button>`).join('')}</div><p class="small">Клавиши 1–3 открывают проход. Затем войдите в арку.</p>`;
  }
  body+='<button data-ui="close">Отойти от щитка</button>';
 }
 else if(modal.type==='shop'){title='Финальная глава';body=`<p>Все три эпохи, сейф и ремонт доступны бесплатно. Полная версия открывает финальные решения и повторное прохождение всех трёх концовок.</p><div class="price">990 ₸</div><p class="small">Учебный платёжный стенд. Никакой карты и списания денег.</p><div class="stack"><button class="primary" data-ui="payment" data-id="success">Тест: успешная покупка</button><button data-ui="payment" data-id="failure">Тест: ошибка</button><button data-ui="payment" data-id="cancel">Отменить</button></div>`;}
 else if(modal.type==='bought'){title='Финальная глава открыта';body='<p>Записи и прогресс не изменились.</p><button class="primary" data-ui="finale">Вернуться к решению</button><button data-ui="close">Продолжить исследование</button>';}
 else if(modal.type==='restart'){title='Начать новое расследование';body='<p>Прогресс текущего расследования будет заменён. Завершённые финалы и доступ к полной версии сохранятся.</p><button class="primary" data-ui="new-confirm">Начать заново</button><button data-ui="close">Вернуться</button>';}
 else if(modal.type==='stats'){title='Завершённые истории';body=`<div class="history">${state.results.map(r=>`<div>${esc(r.ending)} · ${r.score} очков</div>`).join('')||'<p>Финалы ещё не открыты.</p>'}</div><button data-ui="close">Вернуться</button>`;}
 else{title='Управление и расследование';body=`<p>E — взаимодействие. R — щиток портала. После выбора года войдите в светящийся проход. Кружок на карте — следующий шаг. Мышь крутит обзор после щелчка, Esc отпускает курсор. V — вид, Shift — бег, пробел — прыжок, J — журнал, H — задача.</p><h3>Маршрут</h3><p>2026: предохранитель и цепь на щитке портала. 1978: три комнаты и резерв. 2074: катушка. 2026: письмо в сейфе, затем Сергей — увести или убрать, и только потом пульт.</p><h3>Голос · M</h3><p class="small">«Вперёд», «налево», «стой», «действие», «портал», «журнал», «проверить», «камера влево», «камера вверх». Шаг не обрывается сам: персонаж идёт, пока не скажете «стой». Модель работает на этом компьютере.</p><h3>Две руки · G</h3><p class="small">Рука движения: кулак влево, два пальца вправо, большой палец вперёд или назад, ладонь стоп, указательный — действие, указательный и мизинец — прыжок. Вторая рука крутит камеру теми же жестами. Картинка с камеры зеркальная, как в зеркале. Роли рук меняются кнопкой под видео.</p><button class="primary" data-ui="close">Понятно</button>`;}
 root.innerHTML=`<div class="backdrop"><section class="dialog ${['journal','intro'].includes(modal.type)?'notebook':''}" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><h2 id="dialog-title">${title}</h2>${body}${['safe','bypass','travel'].includes(modal.type)?'<button data-ui="hint"><kbd>H</kbd> Подсказка</button>':''}${modal.hint?`<p class="signal-hint">${esc(modal.hint)}</p>`:''}</section></div>`;root.querySelector('button:not(:disabled)')?.focus({preventScroll:true});}
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
async function interact(){if(modal){confirm();return;}if(screen!=='game'||busy)return;const n=world.nearest();if(!n){toast('Подойдите к записи, щитку или Сергею.');return;}if(n.type==='clue')await action('collect',{id:n.id,position:world.position()});else openModal({type:n.type});}
function confirm(){if(!modal){if(screen==='start')go('menu');return;}if(modal.type==='safe'&&!state.game.safe_open){ui('dial',selected+':1');return;}if(modal.type==='travel'&&modal.values&&!state.game.portal.repaired){ui('circuit',String(selected));return;}if(modal.type==='bypass'&&!state.game.repairs.valve&&['signature','carrier','delay'].every(id=>state.game.inventory.includes(id))){verify();return;}if(modal.type==='travel'&&state.game.portal.repaired){openPortal(selected);return;}const items=$('modal-layer').querySelectorAll('.choice:not(:disabled)');if(items.length)items[selected%items.length].click();else $('modal-layer').querySelector('button:not(:disabled)')?.click();}
function command(cmd,source){if(cinematic||!state||!world)return;if(!$('finale-scene').hidden){if(cmd==='pause')skipOverlay();return;}if(transferring&&cmd!=='pause')return;if(['travel','journal','hint','jump'].includes(cmd)&&(screen!=='game'||state.game?.phase!=='explore'))return;if(cmd==='microphone'){controls.toggleVoice();return;}if(cmd==='gestures'){controls.toggleCamera();return;}if(cmd==='view'){world.toggleView();render();return;}if(cmd.startsWith('look-'))return;if(cmd==='travel'&&state.game){if(modal?.type==='travel')closeModal();else showPortalPanel();return;}if(cmd==='circuit-check'){verify();return;}if(cmd==='pause'){if(transferring)return;if(modal?.type==='intro')closeModal();else if(screen==='game')go('pause');else if(screen==='pause')continueGame();return;}if(cmd==='resume'){if(modal)closeModal();else continueGame();return;}if(cmd==='journal'&&state.game){openModal({type:'journal'});return;}if(cmd==='hint'){showHint();return;}if(cmd==='interact'||cmd==='confirm'){interact();return;}if(cmd==='jump'){if(modal)verify();else world.jump();return;}if(cmd.startsWith('navigate-')){if(!modal)return;const direction=cmd.slice(9);if(['left','right'].includes(direction)){const count=modal.values?.length||$('modal-layer').querySelectorAll('.choice').length||1;selected=(selected+(direction==='right'?1:-1)+count)%count;renderModal();}else if(modal.values&&['forward','back'].includes(direction))ui('dial',selected+':'+(direction==='forward'?1:-1));return;}if(cmd.startsWith('choice')&&modal){const n=Number(cmd.slice(6))-1;if(modal.values&&n<modal.values.length)ui('dial',n+':1');else if(modal.type==='bypass'&&n<3&&!state.game.repairs.valve)ui('select-pipe',String(n));else if(modal.type==='travel'&&n<3&&state.game.portal.repaired)openPortal(n);else if(modal.type==='travel'&&modal.values&&n<modal.values.length)ui('circuit',String(n));else{selected=n;confirm();}return;}if(cmd==='start'&&['start','menu'].includes(screen))newGame();if(cmd==='retry'&&screen==='over')action('retry');}
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
  if(screen==='game'&&!modal)world.captureLook();
 }
}
async function showHint(){
 if(screen!=='game'||busy||transferring||cinematic||world.confession)return;
 const current=modal;
 const result=await post('/api/action',{kind:'hint',payload:{}});
 if(!result)return;
 if(result.game.phase==='over'){startFlood(result);return;}
 if(modal!==current)return;
 if(current){
  const g=result.game;
  if(current.type==='travel'&&!g.portal.repaired&&current.values){
   current.hint='Соберите путь в форме U. Верхняя левая деталь соединяет левый край с низом. Нижние детали соединяются друг с другом. Верхняя правая соединяет низ с правым краем.';
  }else if(current.type==='safe')current.hint='Код сейфа: 4 — шкаф, 1 — полка, 7 — дело. Введите 417 и нажмите F.';
  else current.hint=result.event.message;
  renderModal();
 }
}
async function ui(name,id){if(cinematic||!state||!world)return;if(busy&&!['close','pause','menu','help'].includes(name))return;if(name==='hint'){await showHint();return;}if(name==='back-puzzle'&&modal?.returnTo){({puzzle:modal,selection:selected}=modal.returnTo);renderModal();return;}if(name==='dial'&&modal?.values){const [i,d]=id.split(':').map(Number),max=modal.max??9;selected=i;modal.values[i]=(modal.values[i]+d+max+1)%(max+1);renderModal();return;}if(name==='verify'){await verify();return;}if(name==='select-pipe'&&modal?.type==='bypass'){selected=Number(id);renderModal();return;}if(name==='finish'){if(id!=='unsafe'&&!state.full_access){ui('shop');return;}await action('finish',{id,position:world.position()});return;}if(name==='npc'){openModal({type:'npc'});return;}if(name==='circuit'&&modal?.values){selected=Number(id);modal.values[selected]=(modal.values[selected]+1)%4;renderModal();return;}if(name==='talk'){const r=await action('talk',{intent:id,position:world.position()});if(r&&id==='outsmart'&&r.game.sergey==='outsmart'){closeModal();world.startDeparture();}else if(r&&id==='confession'&&r.game.phase==='explore')playConfession();else if(r?.game.phase==='explore')openModal({type:'npc'});return;}if(name==='warn'){await action('warn',{position:world.position()});renderModal();return;}if(name==='menu'){go('menu');return;}if(name==='continue'||name==='resume'){continueGame();return;}if(name==='new'){newGame();return;}if(name==='new-confirm'){await action('new');return;}if(name==='retry'){await action('retry');world.captureLook();return;}if(name==='view'){command('view');return;}if(name==='pause'){go('pause');return;}if(name==='travel'){showPortalPanel();return;}if(name==='travel-to'){await openPortal(Number(id));return;}if(name==='portal-repair'&&modal?.type==='travel'){await action('portal_repair',{position:world.position()});return;}if(name==='close'){closeModal();return;}if(name==='shop'){const r=await post('/api/checkout');if(r?.event.order_id)openModal({type:'shop',order:r.event.order_id});else if(r)toast('Финальная глава уже открыта.');return;}if(name==='payment'){const order=modal.order;const r=await post('/api/sandbox/confirm',{order_id:order,outcome:id});if(r){modal=id==='success'?{type:'bought'}:id==='failure'?{type:'shop',order}:null;render();}return;}if(['help','journal','stats','finale','unsafe'].includes(name))openModal({type:name});}
function status(kind,text,on=false){if(kind==='voice'){station.setListening(on);$('voice-status').textContent=text;$('voice-toggle').setAttribute('aria-pressed',String(on));$('voice-toggle').textContent=on?'Выключить микрофон':'Микрофон';}else{$('gesture-label').textContent=text;$('gesture-toggle').setAttribute('aria-pressed',String(on));$('gesture-toggle').textContent=on?'Выключить жесты':'Жесты';if(!on)toast(text);}}
document.addEventListener('click',e=>{const b=e.target.closest('[data-ui]');if(b&&!b.disabled)ui(b.dataset.ui,b.dataset.id);});document.addEventListener('change',e=>{if(['volume','music','effects'].includes(e.target.id))post('/api/settings',{settings:{[e.target.id]:Number(e.target.value)}}).then(()=>render());if(e.target.id==='graphics')post('/api/settings',{settings:{graphics:Number(e.target.value)}}).then(()=>render());if(e.target.dataset.setting)post('/api/settings',{settings:{[e.target.dataset.setting]:e.target.checked}}).then(()=>render());});document.addEventListener('input',e=>{if(['volume','music','effects'].includes(e.target.id)){const label=$(e.target.id+'-value');if(label)label.textContent=e.target.value;}});
$('view-toggle').onclick=()=>command('view');$('brand').onclick=e=>{e.preventDefault();go('menu');};$('voice-toggle').onclick=()=>controls.toggleVoice();$('gesture-toggle').onclick=()=>controls.toggleCamera();$('swap-hands').onclick=()=>controls.swapHands();$('camera-stop').onclick=()=>controls.stopCamera();$('pause-toggle').onclick=()=>screen==='game'?go('pause'):continueGame();$('help-toggle').onclick=()=>openModal({type:'help'});
document.addEventListener('keydown',e=>{if(e.key==='Tab'&&modal){const a=[...$('modal-layer').querySelectorAll('button:not(:disabled),input,summary')],first=a[0],last=a.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus({preventScroll:true});}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus({preventScroll:true});}}});
function update(){requestAnimationFrame(update);if(!state||!world)return;world.setMotion(state.settings.motion!==false);if(cinematic){world.setActive(false);return;}active();updatePressure();world.lookInput=screen==='game'&&!world.confession&&!modal&&!transferring?controls.lookMotion():{x:0,y:0};world.sprinting=controls.keys.has('shift');world.input=screen==='game'&&!world.confession&&!modal&&!transferring?controls.motion():{x:0,z:0};$('look-help').hidden=screen!=='game'||!!modal||!!document.pointerLockElement||!!world.fallbackLook||transferring;const n=screen==='game'&&!world.confession&&!modal&&!transferring?world.nearest():null;$('interaction').hidden=!n;$('interaction').textContent=n?'E · '+n.name:'';}requestAnimationFrame(update);
const gameClock=new GameClock(()=>state,(kind,payload)=>post('/api/action',{kind,payload}),startFlood);
function startFlood(result){if(cinematic)return;closeFinale();const kind=result.game?.failure_kind,captions=kind==='trapped'?['Линия В замкнулась','Портал не активируется','Анна остаётся в 1978 году']:kind==='rupture'?['Труба не выдержала','Напор рвёт линию А','Машинный зал залит']:['Водосброс не получил команду','Напорная линия не выдержала давление','Машинный зал затоплен'];cinematic=true;screen='cinematic';modal=null;controls.resetMotion();controls.stopVoice();controls.stopCamera();world.releaseLook();world.setActive(false);document.body.classList.add('cinematic');$('hud').hidden=true;$('map-panel').hidden=true;$('countdown').hidden=true;$('aim').hidden=true;$('interaction').hidden=true;$('look-help').hidden=true;$('screen').innerHTML='';$('modal-layer').innerHTML='';$('toast').classList.remove('show');$('accident-scene').hidden=false;$('accident-caption').textContent=captions[0];world.startFlood(result.game,state.settings.motion);gameClock.sync(false);sound('error');let step=0;cinematicAlarm=setInterval(()=>{step++;if(step===2)$('accident-caption').textContent=captions[1];if(step===4)$('accident-caption').textContent=captions[2];if(step<4)sound('error');},1500);cinematicTimer=setTimeout(endFlood,9000);}
function endFlood(){if(!cinematic)return;clearTimeout(cinematicTimer);clearInterval(cinematicAlarm);world.endFlood();cinematic=false;document.body.classList.remove('cinematic');$('accident-scene').hidden=true;screen='over';modal=null;render();}
function fatherLine(g){if(g.ending==='Возвращение')return 'Анна, я вышел из контура. Для меня прошли минуты.';if(g.ending==='Последняя смена')return 'Я понял.';if(g.ending==='Чистый лист')return 'Мелодия знакомая. Объяснить её уже некому.';return 'Станция помнит эту смену.';}
function clearFinale(){clearTimeout(finaleTimer);clearTimeout(epilogueTimer);$('epilogue').hidden=true;closeFinale();}
function updatePressure(){
 const g=state.game;
 const playing=screen==='game'&&!document.hidden&&g?.phase==='explore';
 const current=playing&&!world.confession?pressureLevel(gameClock.remaining()):0;
 world.pressure=g?.stage===1?current:0;
 station.setPressure(world.pressure);
 document.body.dataset.pressure=String(world.pressure);
 if(pressureRun!==g?.run_id+':'+g?.attempt){pressureRun=g?.run_id+':'+g?.attempt;announcedPressure=0;}
 if(world.pressure>announcedPressure&&!modal&&!transferring&&!world.confession){
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
 ];
 function next(index){
  if(index===lines.length){closeFinale();return;}
  const [speaker,line,voice,duration]=lines[index];
  $('finale-speaker').textContent=speaker;
  $('finale-line').textContent=line;
  voices.play(voice,state.settings);
  finaleTimer=setTimeout(()=>next(index+1),duration);
 }
 next(0);
}

function playFinale(g){
 if(!g)return;
 clearFinale();
 const motion=state.settings.motion!==false;
 const reunion=g.ending==='Возвращение'&&world.startReunion(motion);
 if(!motion&&!reunion){showEpilogue(false);return;}
 const overlay=$('finale-scene');
 overlay.classList.toggle('reunion',reunion);
 $('finale-speaker').textContent=reunion?'Олег Соколов':'Станция помнит';
 $('finale-line').textContent=reunion?'Аня… это правда ты?':fatherLine(g);
 overlay.hidden=false;
 document.body.classList.add('finale');
 station.duck();
 if(!reunion)world.setMemory(true);
 if(reunion){
  voices.play('oleg',state.settings);
  finaleTimer=setTimeout(()=>{
   $('finale-speaker').textContent='Анна Соколова';
   $('finale-line').textContent='Да, пап. Пойдём домой.';
   finaleTimer=setTimeout(closeFinale,3700);
  },motion?4300:2100);
 }else{
  finaleTimer=setTimeout(()=>{closeFinale();finaleTimer=setTimeout(()=>showEpilogue(true),1600);},6500);
 }
}
function closeFinale(){
 clearTimeout(finaleTimer);
 $('finale-scene').hidden=true;
 document.body.classList.remove('finale');
 world?.endReunion();
 if(world?.confession){world.endConfession();active();}
 voices.stop();
 world?.setMemory(false);
 station.restore();
}
function showEpilogue(hold){$('epilogue').hidden=false;epilogueTimer=setTimeout(()=>{$('epilogue').hidden=true;},hold?4200:1800);}
function skipOverlay(){if(cinematic){endFlood();return;}if(!$('finale-scene').hidden){const flashback=!!world.confession;closeFinale();if(!flashback)showEpilogue(false);return;}if(!$('epilogue').hidden){clearTimeout(epilogueTimer);$('epilogue').hidden=true;}}
$('skip-cinematic').onclick=endFlood;$('skip-finale').onclick=skipOverlay;
document.addEventListener('visibilitychange',()=>{if(document.hidden&&screen==='game')go('pause');else active();});
addEventListener('pagehide',()=>{if(!world||state?.game?.phase!=='explore')return;const data={kind:'clock',payload:{running:false,position:world.position()},request_id:crypto.randomUUID(),revision:state.revision};navigator.sendBeacon('/api/action',new Blob([JSON.stringify(data)],{type:'application/json'}));});
addEventListener('blur',()=>{if(screen==='game'&&!transferring&&!cinematic)go('pause');});
getState().catch(e=>{$('screen').innerHTML=`<div class="error-card"><h2>Игра не подключилась</h2><p>${esc(e.message)} Запустите Start.command или Start.bat.</p><button onclick="location.reload()">Повторить</button></div>`;});
window.chronoshov={get state(){return state;},get screen(){return screen;},get world(){return world;},get controls(){return controls;}};
