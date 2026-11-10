"""Сохраняемое расследование: каждая головоломка связывает разные эпохи."""
import copy,math,uuid,time
from .content import EPOCHS,BOUNDS,SPAWN,NPC,VALVE,SAFE,BEACON,DIAGNOSTICS,WALLS,FLOOD_WALL,BONUS_NOTES
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
 g=dict(timer={'limit':1500,'remaining':1500.0,'running':False,'started_at':None},failure_kind=None,story_version=4,run_id=uuid.uuid4().hex,attempt=0,stage=1,phase='explore',position=SPAWN[:],inventory=['radio'],found_by_epoch=[[],['radio'],[]],visits=[0,1,0],safe_open=False,repairs={'valve':False},warned=False,T=0,P=0,C=0,S=20,history=[],chat=[],effects=[],total_errors=0,total_hits=0,ending=None,failure=None,avatar='Idle',voice_actions=0,gesture_actions=0,hints=0)
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

def quality(g):
 return min(100,20+15*int('calibration' in g['inventory'])+30*int(g['repairs']['valve'])+35*int(rescue_ready(g)))

def objective(g):
 if not g['repairs']['valve']:
  if 'calibration' not in g['inventory']:
   return dict(title='Прочитать отчёт',text='Нажмите R и перейдите в 2074 год. Отчёт лежит у клапана в западном крыле: нужна линия Б.',stage=2,room='Западное крыло',target=DIAGNOSTICS)
  return dict(title='Открыть линию Б',text='Нажмите R и перейдите в 1978 год. У клапана выберите линию Б.',stage=0,room='Западное крыло',target=VALVE)
 if not rescue_ready(g):
  return dict(title='Забрать запись отца',text='Снова зайдите в 2074 год. Вода ушла, катушка лежит в западном проходе.',stage=2,room='Музейный отсек',target=[-28,-5])
 return dict(title='Вернуть отца',text='Вернитесь в 2026 год к аварийному пульту у входа и выберите «Вернуть отца».',stage=1,room='У входа в главный зал',target=BEACON)

def walls(g,stage=None):
 out=copy.deepcopy(WALLS);stage=g['stage'] if stage is None else stage
 if stage>0 and not g['repairs']['valve']:out.append(FLOOD_WALL[:])
 return out

def travel(g,target,data=None):
 if g['phase']!='explore':raise GameError('Сначала завершите текущий экран результата.')
 if type(target) is not int or target not in (0,1,2):raise GameError('Выберите 1978, 2026 или 2074 год.')
 if target==g['stage']:raise GameError('Вы уже здесь.')
 p=proximity(data or {'position':g['position']},[0,0],50);old=g['stage']
 p=clear_position(p,station_solids(walls(g,target),target,g['safe_open']))
 g['stage']=target;g['position']=p;g['visits'][target]+=1;g['avatar']='Action';checkpoint(g)
 return g,dict(message=f"{EPOCHS[old]['year']} → {EPOCHS[target]['year']}. {EPOCHS[target]['name']}",sound='key',travel={'from':EPOCHS[old]['year'],'to':EPOCHS[target]['year']})

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
 if kind=='retry':
  if g['phase']!='over':raise GameError('Контрольная точка доступна после аварийного размыкания.')
  number=g['attempt']+1
  if g.get('failure_kind')=='timeout':
   run=g['run_id'];g=fresh();g['run_id']=run;g['attempt']=number;checkpoint(g)
   return g,dict(message='Новая попытка. До аварии 25 минут игрового времени.',sound=None,intro=True)
  g=copy.deepcopy(g['checkpoint']);g['attempt']=number;clock_state(g).update(running=False,started_at=None);checkpoint(g)
  return g,dict(message='Автоматика сохранила контур. Можно пересмотреть решение.',sound=None)
 if g['phase']!='explore':raise GameError('Прохождение завершено.')
 if advance_clock(g,now):return g,dict(message='Время вышло. Напорная линия разрушена.',sound=None,cinematic='flood')
 if kind=='clock':
  running=data.get('running')
  if type(running) is not bool:raise GameError('Некорректное состояние таймера.')
  t=clock_state(g);t['running']=running;t['started_at']=now if running else None
  return g,event
 if kind=='tick':return g,event
 source=data.get('source','keyboard')
 if source not in ('keyboard','mouse','voice','gesture'):raise GameError('Неизвестный источник ввода.')
 if source in ('voice','gesture'):g[source+'_actions']+=1
 if kind=='travel':return travel(g,data.get('target'),data)
 if kind=='collect':
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
   g['safe_open']=True;g['position']=clear_position(g['position'],station_solids(walls(g),1,True));g['inventory']+=['blueprint','letter'];g['P']+=100;_record(g,'Сейф открыт: отец жив и оставил схему ремонта.');event.update(message='В сейфе чертёж и письмо. «Аня, я жив».',sound='success',reveal='letter');checkpoint(g)
  else:g['total_errors']+=1;event.update(message='Замок не открылся. Проверьте цифровой каталог 2074 года и порядок цифр.',sound='error')
 elif kind=='bypass':
  if g['stage']!=0:raise GameError('Клапан можно переключить до первого пуска, в 1978 году.')
  g['position']=proximity(data,VALVE)
  line=data.get('line')
  if line not in ('a','b','c'):raise GameError('Выберите одну из трёх линий.')
  if g['repairs']['valve']:event['message']='Водосброс уже переключён на линию Б.'
  elif 'calibration' not in g['inventory']:raise GameError('Сначала прочитайте отчёт у клапана в 2074 году.')
  elif line=='b':
   g['repairs']['valve']=True;g['P']+=100
   _record(g,'1978: резервный водосброс открыт. В будущем западный проход теперь сухой.')
   event.update(message='Вода пошла в резерв. Перенеситесь в 2074 год и посмотрите, что изменилось.',sound='success')
   checkpoint(g)
  else:
   g['total_errors']+=1
   message={'a':'Давление растёт. Эта труба ведёт к месту разрыва.','c':'Вода вернулась в насос. Эта труба замыкается сама на себя.'}
   event.update(message=message[line],sound='error')
 elif kind=='talk':
  g['position']=proximity(data,NPC);intent=data.get('intent')
  if intent not in ('ask','empathize','evidence','confession'):raise GameError('Выберите тему разговора.')
  if intent=='confession' and 'fatherlog' not in g['inventory']:raise GameError('Пока нет доказательств того, что произошло в 2016 году.')
  if intent=='ask':reply=objective(g)['text']
  elif intent=='empathize':
   reply='Я должен был рассказать раньше. Пойдём по записям, Аня. Я останусь на связи.'
   if 'empathize' not in g['effects']:g['effects'].append('empathize');g['T']+=1
  elif intent=='confession':
   reply='Это я разомкнул контур в 2016-м. Думал, Олег уже погиб. Станция уцелела, но он остался между временами. Я десять лет убеждал себя, что другого выхода не было.'
   if 'confession' not in g['effects']:g['effects'].append('confession');g['T']+=1;_record(g,'Сергей признался: он закрыл контур, не зная, что Олег жив.')
  else:reply='Ведомость 1978 года, письмо и будущий журнал рассказывают об одном человеке. Олег оставил нам маршрут по разным временам.' if g['safe_open'] else 'Будущий отчёт покажет, какая труба выдержала. Действовать придётся ещё до первого пуска.'
  g['chat'].append({'intent':intent,'reply':reply});g['chat']=g['chat'][-12:];event.update(message=reply,sound=None)
 elif kind=='warn':
  if g['stage']!=1:raise GameError('Связь с городом доступна в диспетчерской 2026 года.')
  g['position']=proximity(data,BEACON);g['warned']=True;event['message']='Предупреждение передано. Люди покидают нижнюю часть долины.'
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
  clock_state(g).update(running=False,started_at=None);g.update(phase='results',ending={'return':'Возвращение','seal':'Последняя смена','erase':'Чистый лист'}[ending],avatar='Victory');g['P']+=150;_record(g,'2026: '+g['ending']);event.update(message='Решение принято. Последствия сохранены.',sound='success')
 elif kind=='hint':
  g['hints']+=1;event['message']=objective(g)['text']
 else:raise GameError('Неизвестное игровое действие.')
 g['C']=int('calibration' in g['inventory'])+int(g['repairs']['valve'])+int(rescue_ready(g));g['S']=quality(g)
 return g,event

def public_game(g,full):
 if not g or g.get('story_version')!=4:return None
 p={k:copy.deepcopy(v) for k,v in g.items() if k!='checkpoint'};p['timer']=copy.deepcopy(clock_state(g));p['C']=int('calibration' in g['inventory'])+int(g['repairs']['valve'])+int(rescue_ready(g));p['S']=quality(g) if g['phase']!='over' else 0;p['epoch']=copy.deepcopy(EPOCHS[g['stage']]);p['epoch']['hazards']=[];p['epoch']['terminals']=[];p['found']=g['found_by_epoch'][g['stage']];p['walls']=walls(g);p['bounds']=BOUNDS;p['npc_position']=NPC;p['valve_position']=VALVE;p['safe_position']=SAFE;p['beacon_position']=BEACON;p['flooded']=g['stage']>0 and not g['repairs']['valve'];p['notes']=notes(g);p['objective']=objective(g);p['can_finish']=g['stage']==1 and g['repairs']['valve'];p['can_return']=rescue_ready(g);p['achievement']=g['phase']=='results' and g['total_errors']==0 and g['hints']==0
 p['solids']=station_solids(p['walls'],g['stage'],g['safe_open'])
 p['position']=clear_position(p['position'],p['solids'])
 p['player_radius']=PLAYER_RADIUS;p['safe_door_angle']=DOOR_ANGLE if g['safe_open'] else 0;p['layout']=LAYOUT
 p['epochs']=[dict(stage=i,year=e['year'],name=e['name'],visited=g['visits'][i]>0,completed=False,available=True) for i,e in enumerate(EPOCHS)]
 p['epoch']['world_note']='Западный проход сухой: катушка на месте.' if g['repairs']['valve'] else 'В 2074 году западный проход затоплен. Откройте линию Б в 1978 году.'
 return p
