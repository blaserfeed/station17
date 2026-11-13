"""Сохраняемое расследование: каждая головоломка связывает разные эпохи."""
import copy,math,uuid,time
from .content import EPOCHS,BOUNDS,SPAWN,NPC,VALVE,SAFE,BEACON,DIAGNOSTICS,WALLS,FLOOD_WALL,BONUS_NOTES,PORTAL,PORTAL_CONSOLE,PORTAL_FUSE,PORTAL_EXIT,PORTAL_CIRCUIT
from .collision import PLAYER_RADIUS, DOOR_ANGLE, LAYOUT, station_solids, clear_position
class GameError(Exception):
 def __init__(self,message,status=400):self.message=message;self.status=status

def proximity(data,target,radius=2.5):
 p=data.get('position')
 if not isinstance(p,list) or len(p)!=2 or any(type(v) not in (int,float) or not math.isfinite(v) for v in p):raise GameError('Не удалось определить положение персонажа.')
 if not (BOUNDS[0]<=p[0]<=BOUNDS[1] and BOUNDS[2]<=p[1]<=BOUNDS[3]):raise GameError('Вы за пределами корпуса.')
 if math.dist(p,target)>radius:raise GameError('Подойдите ближе.')
 return p[:]

def checkpoint(g):
 g['checkpoint']=None;g['checkpoint']=copy.deepcopy(g)

def fresh():
 g=dict(timer={'limit':1500,'remaining':1500.0,'running':False,'started_at':None},failure_kind=None,story_version=4,run_id=uuid.uuid4().hex,attempt=0,stage=1,phase='explore',position=SPAWN[:],inventory=['radio'],found_by_epoch=[[],['radio'],[]],visits=[0,1,0],safe_open=False,repairs={'valve':False},portal={'repaired':False,'target':None},sergey=None,warned=False,T=0,P=0,C=0,S=20,history=[],chat=[],effects=[],total_errors=0,total_hits=0,ending=None,failure=None,avatar='Idle',voice_actions=0,gesture_actions=0,hints=0)
 checkpoint(g);return g

def notes(g):
 out=[]
 for i,e in enumerate(EPOCHS):
  for c in e['clues']:
   if c['id'] in g['inventory']:out.append({**copy.deepcopy(c),'year':e['year']})
 for key,c in BONUS_NOTES.items():
  if key in g['inventory']:out.append(copy.deepcopy(c))
 return out

def rescue_ready(g):
 return 'fatherlog' in g['inventory']

def sergey_gone(g):
 return g.get('sergey') in ('killed','outsmart')

def layout_solids(g,stage=None,safe=None):
 stage=g['stage'] if stage is None else stage
 safe=g['safe_open'] if safe is None else safe
 return station_solids(walls(g,stage),stage,safe,not sergey_gone(g))

def quality(g):
 portal=portal_state(g)
 return min(100,20+15*int(portal['repaired'])+30*int(g['repairs']['valve'])+35*int(rescue_ready(g)))

def case_score(g):
 portal=portal_state(g)
 return int(portal['repaired'])+int(g['repairs']['valve'])+int(rescue_ready(g))

def achievement(g):
 return g['phase']=='results' and g['total_errors']==0 and g['hints']==0

def save_position(g,data):
 if 'position' in data:
  p=proximity(data,[0,0],50)
  g['position']=clear_position(p,layout_solids(g))

def portal_state(g):
 # Existing investigations that already used time travel retain access.
 return g.get('portal', {'repaired':g['stage']!=1 or sum(g['visits'])>1 or g['repairs']['valve'],'target':None})

def objective(g):
 portal=portal_state(g)
 if not portal['repaired']:
  if 'portal_fuse' not in g['inventory']:
   return dict(title='Найти предохранитель',text='Возьмите запасной предохранитель в ящике справа от портала. Загадка цепи выжжена на крышке.',stage=1,room='Главный зал',target=PORTAL_FUSE)
  return dict(title='Замкнуть цепь',text='Подойдите к щитку и нажмите R. Поверните детали, чтобы соединить левый и правый контакты через нижний ряд.',stage=1,room='Главный зал',target=PORTAL_CONSOLE)
 if not g['repairs']['valve']:
  if 'signature' not in g['inventory']:
   goal=dict(title='Архив 1978',text='Подойдите к столу в архиве и нажмите E, чтобы взять ведомость.',stage=0,room='Архив',target=[-28,-18])
  elif 'carrier' not in g['inventory']:
   goal=dict(title='Турбинный зал',text='Подойдите к столу в турбинном зале и нажмите E, чтобы взять карточку.',stage=0,room='Турбинный зал',target=[27,-18])
  elif 'delay' not in g['inventory']:
   goal=dict(title='Диспетчерская',text='Подойдите к столу в диспетчерской и нажмите E, чтобы прочитать журнал.',stage=0,room='Диспетчерская',target=[28,18])
  else:
   goal=dict(title='Открыть резерв',text='Подойдите к клапану в западном крыле и нажмите E. Выберите среднюю трубу Б и нажмите F.',stage=0,room='Западное крыло',target=VALVE)
 elif not rescue_ready(g):
  goal=dict(title='Забрать запись отца',text='Пройдите в осушенный западный отсек и нажмите E рядом с катушкой.',stage=2,room='Музейный отсек',target=[-28,-5])
 elif 'letter' not in g['inventory']:
  goal=dict(title='Письмо в сейфе',text='Откройте сейф в архиве 2026 года. Введите 4–1–7 и нажмите F, чтобы прочитать письмо.',stage=1,room='Архив',target=SAFE)
 elif not sergey_gone(g):
  goal=dict(title='Сергей у входа',text='Подойдите к Сергею у входа, нажмите E и выберите «Показать письмо и увести его».',stage=1,room='У входа в главный зал',target=NPC)
 else:
  goal=dict(title='Вернуть отца',text='Путь к пульту свободен. Выберите, чем кончится смена.',stage=1,room='У входа в главный зал',target=BEACON)
 if goal['stage']!=g['stage']:
  year=EPOCHS[goal['stage']]['year']
  goal.update(room='Портал в главном зале',target=PORTAL,text=f'У щитка портала выберите {year} год и войдите в светящуюся арку.')
 return goal

def walls(g,stage=None):
 out=copy.deepcopy(WALLS);stage=g['stage'] if stage is None else stage
 if stage>0 and not g['repairs']['valve']:out.append(FLOOD_WALL[:])
 return out

def travel(g,data):
 portal=g['portal']
 target=portal['target']
 if not portal['repaired'] or target is None:
  raise GameError('Сначала восстановите питание и откройте портал.')
 p=proximity(data,PORTAL,1.1)
 if abs(p[0]-PORTAL[0])>.9 or abs(p[1]-PORTAL[1])>.35:
  raise GameError('Войдите в светящийся проход.')
 old=g['stage']
 g['stage']=target
 g['position']=clear_position(PORTAL_EXIT,layout_solids(g,target))
 g['visits'][target]+=1
 g['avatar']='Action'
 portal['target']=None
 checkpoint(g)
 return g,dict(message=f"{EPOCHS[old]['year']} → {EPOCHS[target]['year']}. {EPOCHS[target]['arrival']}",sound='key',travel={'from':EPOCHS[old]['year'],'to':EPOCHS[target]['year']})

def _digits(data,key,n,max_value=9):
 a=data.get(key)
 if not isinstance(a,list) or len(a)!=n or any(type(v) is not int or not 0<=v<=max_value for v in a):raise GameError('Некорректные положения регуляторов.')
 return a

def _record(g,text):g['history'].append(text)

def clock_state(g):
 return g.setdefault('timer',{'limit':1500,'remaining':1500.0,'running':False,'started_at':None})

def advance_clock(g,now):
 timer=clock_state(g)
 if g['phase']=='explore' and timer['running'] and timer['started_at'] is not None:
  timer['remaining']=max(0.0,timer['remaining']-max(0.0,now-timer['started_at']));timer['started_at']=now
  if timer['remaining']<=0:
   timer.update(running=False,started_at=None);g.update(phase='over',failure_kind='timeout',failure='Время вышло. Водосброс не получил команду, давление разрушило напорную линию станции.',ending='Авария на станции',avatar='Damage',S=0)
   return True
 return False

def apply(game,kind,data,full=False,now=None):

 g=copy.deepcopy(game);event={'message':'','sound':None};now=time.time() if now is None else now
 if kind=='new':return fresh(),dict(message='17:40. На служебной частоте звучит голос отца, пропавшего десять лет назад.',sound='key',intro=True)
 if not g:raise GameError('Начните новую игру.')
 if g.get('story_version')!=4:raise GameError('Расследование обновлено. Начните новую игру; прежнее сохранение оставлено в резервной копии.')
 g.setdefault('portal',portal_state(g))
 if kind=='retry':
  if g['phase']!='over':raise GameError('Контрольная точка доступна после аварийного размыкания.')
  number=g['attempt']+1
  if g.get('failure_kind') in ('timeout','trapped'):
   run=g['run_id'];kind=g.get('failure_kind');g=fresh();g['run_id']=run;g['attempt']=number;checkpoint(g)
   message='Новая попытка. До аварии 25 минут игрового времени.' if kind=='timeout' else 'Портал в 1978 году не открылся. Расследование начинается сначала.'
   return g,dict(message=message,sound=None,intro=True)
  g=copy.deepcopy(g['checkpoint']);g.setdefault('portal',portal_state(g));g['portal']['target']=None;g['attempt']=number;clock_state(g).update(running=False,started_at=None);checkpoint(g)
  return g,dict(message='Автоматика сохранила контур. Можно пересмотреть решение.',sound=None)
 if g['phase']!='explore':raise GameError('Прохождение завершено.')
 if advance_clock(g,now):return g,dict(message='Время вышло. Напорная линия разрушена.',sound=None,cinematic='flood')
 if kind=='clock':
  running=data.get('running')
  if type(running) is not bool:raise GameError('Некорректное состояние таймера.')
  save_position(g,data)
  t=clock_state(g);t['running']=running;t['started_at']=now if running else None
  return g,event
 if kind=='tick':
  save_position(g,data)
  return g,event
 source=data.get('source','keyboard')
 if source not in ('keyboard','mouse','voice','gesture'):raise GameError('Неизвестный источник ввода.')
 if source in ('voice','gesture'):g[source+'_actions']+=1
 if kind=='travel':return travel(g,data)
 if kind=='portal_repair':
  g['position']=proximity(data,PORTAL_CONSOLE)
  if g['portal']['repaired']:
   event.update(message='Питание уже восстановлено. Выберите эпоху на щитке.',sound='success')
  else:
   if 'portal_fuse' not in g['inventory']:raise GameError('Возьмите запасной предохранитель у портала.')
   circuit=_digits(data,'circuit',4,3)
   if circuit!=PORTAL_CIRCUIT:
    g['total_errors']+=1
    event.update(message='Цепь не замкнулась. Жила не идёт напрямик: с левой клеммы вниз, обход снизу, выход справа.',sound='error')
   else:
    g['portal']['repaired']=True
    _record(g,'2026: цепь портала замкнута, питание восстановлено.')
    checkpoint(g)
    event.update(message='Цепь замкнулась. Выберите год на щитке и войдите в светящийся проход.',sound='success')
 elif kind=='portal_open':
  g['position']=proximity(data,PORTAL_CONSOLE)
  if not g['portal']['repaired']:raise GameError('Сначала восстановите питание портала.')
  target=data.get('target')
  if type(target) is not int or target not in range(len(EPOCHS)) or target==g['stage']:
   raise GameError('Выберите другую эпоху.')
  g['portal']['target']=target
  if data.get('enter'):
   return travel(g,{'position':PORTAL})
  event.update(message=f"Проход в {EPOCHS[target]['year']} год открыт. Войдите в портал.",sound='key')
 elif kind=='collect':
  c=next((c for c in EPOCHS[g['stage']]['clues'] if c['id']==data.get('id')),None)
  if not c:raise GameError('В этой эпохе нет такого документа.')
  g['position']=proximity(data,c['pos'])
  if c.get('requires')=='valve' and not g['repairs']['valve']:raise GameError('Музейный отсек затоплен. Устраните причину в 1978 году.')
  if c['id'] not in g['inventory']:
   g['inventory'].append(c['id']);g['found_by_epoch'][g['stage']].append(c['id'])
   if c.get('story'):_record(g,f"{EPOCHS[g['stage']]['year']}: {c['name']}")
  event.update(message='Добавлено в журнал: '+c['name'],clue={**c,'year':EPOCHS[g['stage']]['year']},sound='key')
 elif kind=='safe_check':
  if g['stage']!=1:raise GameError('Архивный сейф сохранился в 2026 году.')
  g['position']=proximity(data,SAFE);a=_digits(data,'values',3)
  if g['safe_open']:event['message']='Сейф уже открыт. Письмо и чертёж сохранены в журнале.'
  elif a==[4,1,7]:
   g['safe_open']=True;g['position']=clear_position(g['position'],layout_solids(g,1,True));g['inventory']+=['blueprint','letter'];g['P']+=100;_record(g,'Сейф открыт: Сергей предатель. С ним нужно решить до пульта.');event.update(message='В сейфе письмо: Сергей предатель. До пульта возвращения с ним нужно покончить.',sound='success',reveal='letter');checkpoint(g)
  else:g['total_errors']+=1;event.update(message='Замок не открылся. Три цифры разложены по архиву, турбинному залу и диспетчерской 1978 года. Порядок: шкаф, полка, дело.',sound='error')
 elif kind=='bypass':
  if g['stage']!=0:raise GameError('Клапан можно переключить до первого пуска, в 1978 году.')
  g['position']=proximity(data,VALVE)
  line=data.get('line')
  if line not in ('a','b','c'):raise GameError('Выберите одну из трёх линий.')
  if g['repairs']['valve']:event['message']='Водосброс уже переключён на линию Б.'
  elif any(name not in g['inventory'] for name in ('signature','carrier','delay')):raise GameError('Клапан не повернуть вслепую. Нужны записи из архива, турбинного зала и диспетчерской 1978 года.')
  elif line=='b':
   g['repairs']['valve']=True;g['P']+=100
   _record(g,'1978: линия Б открыта. Проход в будущем осушится. Это ещё не возвращение Олега.')
   event.update(message='Линия Б открыта. В 2074 году западный проход станет сухим. Катушка из этого прохода нужна отдельно: сама линия отца не возвращает.',sound='success')
   checkpoint(g)
  else:
   g['total_errors']+=1
   clock_state(g).update(running=False,started_at=None)
   if line=='a':
    checkpoint(g)
    g.update(phase='over',failure_kind='rupture',failure='Линия А разорвала трубу. Напор ушёл в корпус. Записи сохранились: трубу можно выбрать заново.',ending='Разрыв трубы',S=0,avatar='Damage')
    return g,dict(message='Труба не выдержала. Линия А ведёт к месту разрыва.',sound='error',cinematic='rupture')
   g.update(phase='over',failure_kind='trapped',failure='Линия В замыкается сама на себя. Портал гаснет. Анна остаётся в 1978 году, и расследование придётся начать сначала.',ending='Заперта в прошлом',S=0,avatar='Damage')
   return g,dict(message='Линия В замыкается. Портал не активируется.',sound='error',cinematic='trapped')
 elif kind=='talk':
  if sergey_gone(g):raise GameError('Сергея у входа уже нет.')
  g['position']=proximity(data,NPC);intent=data.get('intent')
  if intent not in ('ask','empathize','evidence','confession','outsmart','kill'):raise GameError('Выберите тему разговора.')
  if intent=='confession' and 'fatherlog' not in g['inventory']:raise GameError('Пока нет доказательств того, что произошло в 2016 году.')
  if intent in ('outsmart','kill'):
   if 'letter' not in g['inventory']:raise GameError('Без письма отца у Анны нет основания решать за него.')
   if not rescue_ready(g):raise GameError('Сначала заберите катушку. К пульту он встанет только после неё.')
   if intent=='outsmart':
    g['sergey']='outsmart';g['position']=clear_position(g['position'],layout_solids(g))
    _record(g,'2026: Анна показала письмо и отправила Сергея проверять западный проход.')
    reply='Он читает письмо, бледнеет и уходит к западному проходу: «Если Олег жив, я сам это увижу». Пульт остаётся без него.'
    event.update(message=reply,sound='key')
   else:
    g['sergey']='killed';g['position']=clear_position(g['position'],layout_solids(g))
    _record(g,'2026: Анна замыкает рубильник у входа. Сергей больше не стоит между ней и пультом.')
    reply='Рубильник на стойке у входа щёлкает. Сергей не успевает отойти. Путь к пульту свободен.'
    event.update(message=reply,sound='error')
   checkpoint(g);g['chat'].append({'intent':intent,'reply':reply});g['chat']=g['chat'][-12:];return g,event
  if intent=='ask':reply=objective(g)['text']
  elif intent=='empathize':
   reply='Теперь ты слышала его сама. Мне нечего прибавить к этому голосу.' if 'fatherlog' in g['inventory'] else 'Я не хотел тебе навредить. Я боялся, что ты пойдёшь за отцом, не зная, чем для станции кончилось ожидание.'
   if 'empathize' not in g['effects']:g['effects'].append('empathize');g['T']+=1
  elif intent=='confession':
   reply='В 2016-м я разомкнул четвёртый контур. Я услышал его ответ и всё равно отключил контур. Боялся потерять станцию. Я спас корпус и оставил его внутри. Правильным это назвать не могу.'
   if 'confession' not in g['effects']:g['effects'].append('confession');g['T']+=1;_record(g,'2016: Сергей разомкнул контур, хотя слышал Олега.')
  elif 'letter' in g['inventory']:reply='Ты смотришь так, будто уже всё знаешь. Если в сейфе было его письмо — скажи сейчас, не у пульта.'
  elif 'fatherlog' in g['inventory']:reply='Ты слышала его. Он просил клапан раньше, чем просил спасение. Я выбрал станцию, хотя слышал его голос.'
  elif g['repairs']['valve']:reply='Линия Б осушила проход. Это ещё не он. Катушка в сухом отсеке 2074 года — его голос, и только им пульт согласует возвращение.'
  else:reply='Архив, турбинный зал и диспетчерская 1978 года. Пока не сведёте все три, к щиту лучше не подходить.'
  g['chat'].append({'intent':intent,'reply':reply});g['chat']=g['chat'][-12:];event.update(message=reply,sound=None)
 elif kind=='warn':
  if g['stage']!=1:raise GameError('Связь с городом доступна в диспетчерской 2026 года.')
  g['position']=proximity(data,BEACON);g['warned']=True;event['message']='Предупреждение ушло в долину. Если вернёте отца и откроете водосброс, люди успеют покинуть низину.'
 elif kind=='finish':
  if g['stage']!=1:raise GameError('Решение нужно передать с пульта 2026 года.')
  g['position']=proximity(data,BEACON);ending=data.get('id')
  if not g['repairs']['valve']:raise GameError('Сначала восстановите резервный водосброс в прошлом.')
  if ending not in ('return','seal','erase','unsafe'):raise GameError('Выберите действие с контуром.')
  if ending=='return' and not rescue_ready(g):raise GameError('Для возвращения отца нужна катушка из осушенного отсека 2074 года.')
  if ending=='unsafe':
   if rescue_ready(g):raise GameError('Сигнал уже согласован: выберите безопасную передачу.')
   checkpoint(g);clock_state(g).update(running=False,started_at=None);g.update(phase='over',failure_kind='signal',failure='Несогласованный импульс сорвал связь. Автоматика разомкнула контур до запуска водосброса.',ending='Аварийное размыкание',S=0,avatar='Damage');return g,dict(message='Контур разомкнут. Записи и ремонт сохранились в контрольной точке.',sound='error')
  if not full:raise GameError('Финальная глава открывается учебной покупкой. Все три эпохи и первые головоломки доступны бесплатно.',403)
  if ending=='return' and 'letter' not in g['inventory']:
   return g,dict(message='До пульта нужно письмо из архивного сейфа. Код: шкаф, полка, дело.',sound='error',confront='need-letter')
  if ending=='return' and not sergey_gone(g):
   return g,dict(message='Сергей всё ещё у входа. Письмо уже у Анны: увести его или убрать с дороги — до тумблера.',sound=None,confront='sergey')
  clock_state(g).update(running=False,started_at=None);g.update(phase='results',ending={'return':'Возвращение','seal':'Последняя смена','erase':'Чистый лист'}[ending],avatar='Victory');g['P']+=150;_record(g,'2026: '+g['ending']);event.update(message='Решение принято. Последствия сохранены.',sound='success')
 elif kind=='hint':
  g['hints']+=1;event['message']=objective(g)['text']
 else:raise GameError('Неизвестное игровое действие.')
 g['C']=case_score(g);g['S']=quality(g)
 return g,event

def public_game(g,full):
 if not g or g.get('story_version')!=4:return None
 p={k:copy.deepcopy(v) for k,v in g.items() if k!='checkpoint'};p['timer']=copy.deepcopy(clock_state(g));p['C']=case_score(g);p['S']=quality(g) if g['phase']!='over' else 0;p['epoch']=copy.deepcopy(EPOCHS[g['stage']]);p['epoch']['hazards']=[];p['epoch']['terminals']=[];p['found']=g['found_by_epoch'][g['stage']];p['walls']=walls(g);p['bounds']=BOUNDS;p['npc_position']=None if sergey_gone(g) else NPC;p['valve_position']=VALVE;p['safe_position']=SAFE;p['beacon_position']=BEACON;p['flooded']=g['stage']>0 and not g['repairs']['valve'];p['notes']=notes(g);p['objective']=objective(g);p['can_finish']=g['stage']==1 and g['repairs']['valve'];p['can_return']=rescue_ready(g);p['can_rescue']=rescue_ready(g) and 'letter' in g['inventory'] and sergey_gone(g);p['achievement']=achievement(g)
 p['portal']={**portal_state(g),'position':PORTAL,'console':PORTAL_CONSOLE}
 p['solids']=layout_solids(g)
 p['position']=clear_position(p['position'],p['solids'])
 p['player_radius']=PLAYER_RADIUS;p['safe_door_angle']=DOOR_ANGLE if g['safe_open'] else 0;p['layout']=LAYOUT
 p['epochs']=[dict(stage=i,year=e['year'],name=e['name'],visited=g['visits'][i]>0,completed=False,available=True) for i,e in enumerate(EPOCHS)]
 p['epoch']['world_note']=('Западный проход сухой. Катушка — голос отца; открытый резерв его не заменяет.' if g['repairs']['valve'] else 'Западный проход затоплен. Резерв открывается в 1978 году, когда сведены три комнаты. Это ещё не возвращение отца.') if g['stage']==2 else ('Буква резерва собрана из архива, турбинного зала и диспетчерской. Неверная труба рвётся.' if g['stage']==0 else 'До заклинивания 25 минут. Голос отца просит сначала клапан, не спасение.')
 return p
