"""Проверки расследования и временных зависимостей версии 4."""
import unittest,tempfile,threading,json,urllib.request,urllib.error,http.cookiejar,uuid,sys,time,copy
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from backend.core import fresh,apply,public_game,GameError,objective
from backend.content import EPOCHS,VALVE,SAFE,BEACON,NPC,FLOOD_WALL,PORTAL,PORTAL_CONSOLE,PORTAL_FUSE,PORTAL_EXIT,SPAWN
from backend.server import GameServer,Handler,connect,signed_event,settle
from backend.collision import can_stand,DRESSING

def powered(g):
 if g['portal']['repaired']:return g
 g,_=apply(g,'collect',{'id':'portal_fuse','position':PORTAL_FUSE})
 return apply(g,'portal_repair',{'position':PORTAL_CONSOLE})[0]

def hop(g,stage):
 if g['stage']==stage:return g
 g,_=apply(powered(g),'portal_open',{'target':stage,'position':PORTAL_CONSOLE})
 return apply(g,'travel',{'position':PORTAL})[0]

def read(g,stage,name):
 g=hop(g,stage);c=next(c for c in EPOCHS[stage]['clues'] if c['id']==name)
 return apply(g,'collect',{'id':name,'position':c['pos']})[0]
def unlock(g):
 g=read(g,2,'registry');g=hop(g,1);return apply(g,'safe_check',{'values':[4,1,7],'position':SAFE})[0]
def diagnosed(g):return hop(read(g,2,'calibration'),0)
def bypass(g,line='b'):return apply(g,'bypass',{'line':line,'position':VALVE})[0]
def repaired(g):return bypass(diagnosed(g))
def synced(g):return hop(read(repaired(g),2,'fatherlog'),1)
class Investigation(unittest.TestCase):
 def test_a01_start_in_present(self):
  g=fresh();self.assertEqual((g['stage'],g['S'],g['P']),(1,20,0));self.assertIn('radio',g['inventory'])
 def test_a02_no_random_hazards_any_epoch(self):
  for i in range(3):self.assertEqual(public_game(hop(fresh(),i),False)['epoch']['hazards'],[])
 def test_a03_free_cross_time_exploration(self):
  g=fresh()
  for i in [2,0,1]:g=hop(g,i)
  self.assertEqual(g['visits'],[1,2,1])
 def test_a04_portal_arrival(self):
  g=hop(fresh(),0);self.assertEqual(g['position'],PORTAL_EXIT);self.assertIsNone(g['portal']['target'])
 def test_a05_travel_invalid_target(self):
  for x in [True,3,-1,'0']:
   with self.assertRaises(GameError):apply(powered(fresh()),'portal_open',{'target':x,'position':PORTAL_CONSOLE})
 def test_a06_future_record_carried_to_present(self):
  g=hop(read(fresh(),2,'registry'),1);self.assertIn('registry',[n['id'] for n in public_game(g,False)['notes']])
 def test_a07_document_proximity_required(self):
  with self.assertRaises(GameError):apply(hop(fresh(),2),'collect',{'id':'registry','position':[10,20]})
 def test_a08_document_wrong_epoch_rejected(self):
  with self.assertRaises(GameError):apply(fresh(),'collect',{'id':'registry','position':[-28,-18]})
 def test_a09_documents_not_duplicated(self):
  g=read(read(fresh(),2,'registry'),2,'registry');self.assertEqual(g['inventory'].count('registry'),1)
 def test_a10_safe_correct_code_award(self):
  g=unlock(fresh());self.assertTrue(g['safe_open']);self.assertIn('blueprint',g['inventory']);self.assertIn('letter',g['inventory']);self.assertEqual((g['P'],g['C']),(100,0))
 def test_a11_safe_wrong_code_no_damage(self):
  g,_=apply(fresh(),'safe_check',{'values':[0,0,0],'position':SAFE});self.assertEqual((g['S'],g['P'],g['total_errors']),(20,0,1))
 def test_a12_safe_no_farming(self):
  g=unlock(fresh());g,_=apply(g,'safe_check',{'values':[4,1,7],'position':SAFE});self.assertEqual(g['P'],100)
 def test_a13_safe_only_present(self):
  with self.assertRaises(GameError):apply(hop(fresh(),0),'safe_check',{'values':[4,1,7],'position':SAFE})
 def test_a14_bad_digits_rejected(self):
  for a in [[4,True,7],[4,1.0,7],[4,1],[-1,1,7],[10,1,7]]:
   with self.assertRaises(GameError):apply(fresh(),'safe_check',{'values':a,'position':SAFE})
 def test_a15_bypass_needs_future_diagnostics(self):
  with self.assertRaises(GameError):bypass(hop(fresh(),0))
 def test_a16_bypass_only_past(self):
  with self.assertRaises(GameError):bypass(read(fresh(),2,'calibration'))
 def test_a17_bypass_requires_proximity(self):
  with self.assertRaises(GameError):apply(diagnosed(fresh()),'bypass',{'line':'b','position':[0,0]})
 def test_a18_invalid_bypass_rejected(self):
  for invalid in (None,True,2,'x',['b']):
   with self.assertRaises(GameError):bypass(diagnosed(fresh()),invalid)
 def test_a19_bypass_requires_no_safe_or_older_puzzle(self):
  g=repaired(fresh());self.assertTrue(g['repairs']['valve']);self.assertFalse(g['safe_open'])
 def test_a20_both_wrong_paths_give_feedback(self):
  start=diagnosed(fresh())
  for line,fragment in [('a','разрыва'),('c','замыкается')]:
   g,e=apply(start,'bypass',{'line':line,'position':VALVE});self.assertFalse(g['repairs']['valve']);self.assertEqual(g['total_errors'],1);self.assertIn(fragment,e['message'])
 def test_a21_incorrect_bypass_keeps_link_quality(self):
  g=diagnosed(fresh());self.assertEqual(bypass(g,'a')['S'],g['S'])
 def test_a22_valve_riddle_and_causality(self):
  self.assertIn(FLOOD_WALL,public_game(hop(fresh(),2),False)['walls'])
  g=repaired(fresh());p=public_game(hop(g,2),False);self.assertFalse(p['flooded']);self.assertNotIn(FLOOD_WALL,p['walls']);self.assertEqual(g['P'],100)
 def test_a23_objective_points_to_physical_valve(self):
  g=diagnosed(fresh());self.assertEqual(public_game(g,False)['objective']['target'],VALVE)
  self.assertEqual(public_game(hop(g,2),False)['objective']['target'],PORTAL)
 def test_a24_valve_no_farming(self):
  self.assertEqual(bypass(repaired(fresh()))['P'],100)
 def test_a25_future_log_inaccessible_before_repair(self):
  with self.assertRaises(GameError):read(fresh(),2,'fatherlog')
 def test_a26_future_log_accessible_after_repair(self):
  self.assertIn('fatherlog',read(repaired(fresh()),2,'fatherlog')['inventory'])
 def test_a27_repair_opens_safe_finish_but_does_not_rescue(self):
  p=public_game(hop(repaired(fresh()),1),False)
  self.assertTrue(p['can_finish']);self.assertFalse(p['can_return'])
 def test_a28_rescue_route_uses_four_transfers(self):
  g=synced(fresh());self.assertEqual((g['visits'],g['C'],g['P']),([1,2,2],3,100))
 def test_a29_legacy_save_recognizes_completed_repair(self):
  g=hop(fresh(),2);g['repairs']['valve']=True;g['beacons']=[False,True,False];g['power']=True
  p=public_game(g,False);self.assertEqual(p['objective']['title'],'Забрать запись отца');self.assertFalse(p['flooded'])
 def test_a30_reel_remains_in_inventory_after_return(self):
  g=synced(fresh());self.assertTrue(public_game(g,False)['can_return'])
 def test_a31_good_ending_and_maximum_score(self):
  g,_=apply(synced(fresh()),'finish',{'id':'return','position':BEACON},True);self.assertEqual((g['ending'],g['P'],g['phase']),('Возвращение',250,'results'))
 def test_a32_all_three_endings(self):
  g=synced(fresh())
  for choice,title in [('return','Возвращение'),('seal','Последняя смена'),('erase','Чистый лист')]:self.assertEqual(apply(g,'finish',{'id':choice,'position':BEACON},True)[0]['ending'],title)
 def test_a33_ending_requires_paid_chapter(self):
  with self.assertRaises(GameError):apply(synced(fresh()),'finish',{'id':'return','position':BEACON},False)
 def test_a34_good_ending_requires_sync(self):
  with self.assertRaises(GameError):apply(hop(repaired(fresh()),1),'finish',{'id':'return','position':BEACON},True)
 def test_a35_unsafe_signal_over_and_retry_preserves_repair(self):
  g=hop(repaired(fresh()),1);g,_=apply(g,'finish',{'id':'unsafe','position':BEACON},True);self.assertEqual(g['phase'],'over');g,_=apply(g,'retry',{});self.assertEqual((g['phase'],g['P'],g['repairs']['valve']),('explore',100,True))
 def test_a36_accusation_needs_evidence(self):
  with self.assertRaises(GameError):apply(fresh(),'talk',{'intent':'confession','position':NPC})
 def test_a37_confession_after_future_log(self):
  g=read(repaired(fresh()),2,'fatherlog');g,e=apply(g,'talk',{'intent':'confession','position':NPC});self.assertIn('2016',e['message']);self.assertEqual(g['T'],1)
 def test_a38_empathy_not_farmed(self):
  g=fresh()
  for _ in range(2):g,_=apply(g,'talk',{'intent':'empathize','position':NPC})
  self.assertEqual(g['T'],1)
 def test_a39_reject_nan_position(self):
  with self.assertRaises(GameError):apply(fresh(),'safe_check',{'position':[float('nan'),0],'values':[4,1,7]})
 def test_a40_puzzles_cannot_modify_ending_state(self):
  g,_=apply(synced(fresh()),'finish',{'id':'return','position':BEACON},True)
  with self.assertRaises(GameError):apply(g,'safe_check',{'position':SAFE,'values':[4,1,7]})
 def test_a41_voice_and_gestures_sources(self):
  g,_=apply(fresh(),'hint',{'source':'voice'});g,_=apply(g,'hint',{'source':'gesture'});self.assertEqual((g['voice_actions'],g['gesture_actions']),(1,1))
 def test_a42_no_damage_action(self):
  with self.assertRaises(GameError):apply(fresh(),'damage',{'id':'h1','position':[0,0]})
 def test_a43_checkpoint_hidden_from_client(self):self.assertNotIn('checkpoint',public_game(fresh(),False))
 def test_a44_state_input_is_not_mutated(self):
  g=fresh();before=copy.deepcopy(g);apply(g,'safe_check',{'values':[0,0,0],'position':SAFE});self.assertEqual(g,before)
 def test_a45_completed_settings_survive_round_trip(self):
  g=synced(fresh());g=hop(hop(g,0),1);self.assertTrue(public_game(g,False)['can_return']);self.assertEqual(g['P'],100)

 def test_a46_timer_default(self):
  t=fresh()['timer'];self.assertEqual(t['limit'],1500);self.assertFalse(t['running'])
 def test_a47_timer_advances_on_server(self):
  g,_=apply(fresh(),'clock',{'running':True},now=100);g,_=apply(g,'tick',{},now=130);self.assertEqual(g['timer']['remaining'],1470)
 def test_a48_pause_freezes_timer(self):
  g,_=apply(fresh(),'clock',{'running':True},now=100);g,_=apply(g,'clock',{'running':False},now=130);g,_=apply(g,'tick',{},now=9000);self.assertEqual(g['timer']['remaining'],1470)
 def test_a49_resume_does_not_refill(self):
  g,_=apply(fresh(),'clock',{'running':True},now=100);g,_=apply(g,'clock',{'running':False},now=130);g,_=apply(g,'clock',{'running':True},now=500);g,_=apply(g,'tick',{},now=520);self.assertEqual(g['timer']['remaining'],1450)
 def test_a50_time_travel_uses_same_timer(self):
  g,_=apply(powered(fresh()),'portal_open',{'target':2,'position':PORTAL_CONSOLE});g,_=apply(g,'clock',{'running':True},now=100);g,_=apply(g,'travel',{'position':PORTAL},now=140);self.assertEqual((g['stage'],g['timer']['remaining']),(2,1460));self.assertTrue(g['timer']['running'])
 def test_a51_puzzle_time_counts(self):
  g,_=apply(fresh(),'clock',{'running':True},now=100);g,_=apply(g,'safe_check',{'values':[0,0,0],'position':SAFE},now=130);self.assertEqual(g['timer']['remaining'],1470)
 def test_a52_timeout_requests_real_cinematic(self):
  g,_=apply(fresh(),'clock',{'running':True},now=100);g,e=apply(g,'tick',{},now=1600);self.assertEqual((g['phase'],g['ending'],g['failure_kind']),('over','Авария на станции','timeout'));self.assertEqual(e['cinematic'],'flood');self.assertFalse(g['timer']['running'])
 def test_a53_ending_wins_before_deadline(self):
  g=synced(fresh());g,_=apply(g,'clock',{'running':True},now=100);g,_=apply(g,'finish',{'id':'return','position':BEACON},True,now=1599);self.assertEqual(g['ending'],'Возвращение');self.assertFalse(g['timer']['running'])
 def test_a54_timeout_wins_finish_race(self):
  g=synced(fresh());g,_=apply(g,'clock',{'running':True},now=100);g,e=apply(g,'finish',{'id':'return','position':BEACON},True,now=1600);self.assertEqual(g['ending'],'Авария на станции');self.assertEqual(g['P'],100)
 def test_a55_timeout_retry_is_new_attempt(self):
  g=synced(fresh());g,_=apply(g,'clock',{'running':True},now=100);g,_=apply(g,'tick',{},now=1600);g,e=apply(g,'retry',{},now=2000);self.assertEqual((g['P'],g['C'],g['timer']['remaining']),(0,0,1500));self.assertEqual(g['inventory'],['radio']);self.assertTrue(e['intro'])
 def test_a56_signal_retry_keeps_remaining_time(self):
  g=hop(repaired(fresh()),1);g,_=apply(g,'clock',{'running':True},now=100);g,_=apply(g,'finish',{'id':'unsafe','position':BEACON},True,now=200);g,_=apply(g,'retry',{},now=2000);self.assertEqual(g['timer']['remaining'],1400);self.assertFalse(g['timer']['running']);self.assertTrue(g['repairs']['valve'])
 def test_a57_client_cannot_refill_timer(self):
  g,_=apply(fresh(),'clock',{'running':True,'remaining':99999,'limit':99999},now=100);self.assertEqual(g['timer']['remaining'],1500);self.assertEqual(g['timer']['limit'],1500)
 def test_a58_pause_at_zero_cannot_avoid_accident(self):
  g,_=apply(fresh(),'clock',{'running':True},now=100);g,e=apply(g,'clock',{'running':False},now=1600);self.assertEqual(g['failure_kind'],'timeout')

 def test_a59_travel_avoids_future_equipment(self):
  g=hop(fresh(),2)
  p=public_game(g,False)
  self.assertEqual(g['position'],PORTAL_EXIT)
  self.assertTrue(can_stand(*g['position'],p['solids']))

 def test_a60_legacy_save_inside_npc_recovers(self):
  g=fresh()
  g['position']=NPC[:]
  p=public_game(g,False)
  self.assertNotEqual(p['position'],NPC)
  self.assertTrue(can_stand(*p['position'],p['solids']))
  self.assertEqual(g['position'],NPC)

 def test_a61_safe_door_never_opens_through_saved_position(self):
  in_swing=[-24.52,-21.70]
  p=public_game(fresh(),False)
  self.assertTrue(can_stand(*in_swing,p['solids']))
  g,_=apply(fresh(),'safe_check',{'position':in_swing,'values':[4,1,7]})
  self.assertTrue(g['safe_open'])
  self.assertNotEqual(g['position'],in_swing)
  self.assertTrue(can_stand(*g['position'],public_game(g,False)['solids']))

 def test_a62_flood_blocker_is_removed_with_repair(self):
  self.assertFalse(can_stand(-25,0,public_game(hop(fresh(),2),False)['solids']))
  self.assertTrue(can_stand(-25,0,public_game(hop(repaired(fresh()),2),False)['solids']))

 def test_a63_autosave_records_walked_position(self):
  g,_=apply(fresh(),'tick',{'position':[-8,19]})
  self.assertEqual(public_game(g,False)['position'],[-8,19])

 def test_a64_pause_records_position_and_remaining_time(self):
  g,_=apply(fresh(),'clock',{'running':True},now=100)
  g,_=apply(g,'clock',{'running':False,'position':[-8,19]},now=110)
  self.assertEqual((g['position'],g['timer']['remaining']),([-8,19],1490))

 def test_a65_autosave_rejects_invalid_positions(self):
  for position in ([float('nan'),0],[999,0],[True,0],None,[0]):
   with self.subTest(position=position),self.assertRaises(GameError):apply(fresh(),'tick',{'position':position})

 def test_a66_autosave_recovers_inside_equipment(self):
  g,_=apply(fresh(),'tick',{'position':[-3,11]})
  self.assertTrue(can_stand(*g['position'],public_game(g,False)['solids']))

 def test_a67_hint_disqualifies_precision_achievement(self):
  g,_=apply(synced(fresh()),'hint',{})
  g,_=apply(g,'finish',{'id':'return','position':BEACON},True)
  self.assertFalse(public_game(g,True)['achievement'])

 def test_a68_decorative_objects_have_physical_footprints(self):
  for stage in (0,1,2):
   solids=public_game(hop(fresh(),stage),False)['solids']
   for key in ('crates','barrels','reel_stands','signs','extinguishers'):
    for spot in DRESSING[key]:
     with self.subTest(stage=stage,object=key,position=spot):self.assertFalse(can_stand(*spot[:2],solids))
   if stage!=2:
    for point in DRESSING['plants']:self.assertFalse(can_stand(*point,solids))

 def test_a69_story_interactions_remain_reachable(self):
  from collections import deque
  for stage in (0,1,2):
   game=hop(fresh(),stage);game['repairs']['valve']=True
   public=public_game(game,False);solids=public['solids']
   # One-metre cardinal moves cannot cross these expanded walls; test the
   # actual connected walkable area rather than only empty spots at each prop.
   start=(-2,21);queue=deque([start]);seen={start};reachable=[]
   while queue:
    x,z=queue.popleft();reachable.append((x,z))
    for dx,dz in ((1,0),(-1,0),(0,1),(0,-1)):
     p=(x+dx,z+dz)
     if p not in seen:
      seen.add(p)
      if can_stand(*p,solids):queue.append(p)
   targets=[NPC,VALVE,BEACON]+[c['pos'] for c in EPOCHS[stage]['clues']]
   if stage==1:targets.append(SAFE)
   for target in targets:
    with self.subTest(stage=stage,target=target):self.assertTrue(any((x-target[0])**2+(z-target[1])**2<2.4**2 for x,z in reachable))


 def test_portal_requires_fuse_and_physical_access(self):
  g=fresh()
  self.assertEqual(objective(g)['target'],PORTAL_FUSE)
  with self.assertRaises(GameError):apply(g,'portal_repair',{'position':PORTAL_CONSOLE})
  with self.assertRaises(GameError):apply(g,'portal_open',{'target':2,'position':PORTAL_CONSOLE})
  g=powered(g)
  with self.assertRaises(GameError):apply(g,'portal_open',{'target':2,'position':SPAWN})
  g,_=apply(g,'portal_open',{'target':2,'position':PORTAL_CONSOLE})
  self.assertEqual(g['stage'],1)
  for position in ([4,21],[5,20],SPAWN):
   with self.assertRaises(GameError):apply(g,'travel',{'position':position})
  g,_=apply(g,'travel',{'position':PORTAL,'target':0})
  self.assertEqual(g['stage'],2)
  self.assertIsNone(g['portal']['target'])
  with self.assertRaises(GameError):apply(g,'travel',{'position':PORTAL})

 def test_portal_preserves_existing_investigation(self):
  g=hop(fresh(),2)
  del g['portal']
  self.assertTrue(public_game(g,False)['portal']['repaired'])
  g,_=apply(g,'portal_open',{'target':1,'position':PORTAL_CONSOLE})
  self.assertEqual(g['portal']['target'],1)

class HTTP(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.tmp=tempfile.TemporaryDirectory();cls.path=Path(cls.tmp.name)/'test.sqlite3';cls.secret=b'test-only-secret';cls.server=GameServer(('127.0.0.1',0),cls.path,cls.secret);cls.thread=threading.Thread(target=cls.server.serve_forever,daemon=True);cls.thread.start();cls.base='http://127.0.0.1:'+str(cls.server.server_port)
 @classmethod
 def tearDownClass(cls):cls.server.shutdown();cls.server.server_close();cls.tmp.cleanup()
 def setUp(self):self.client=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()));self.state=self.get('/api/state')
 def get(self,path):return json.load(self.client.open(self.base+path))
 def post(self,path,data=None,rid=None,revision=None,headers=None):
  raw=json.dumps({**(data or {}),'request_id':rid or uuid.uuid4().hex,'revision':self.state['revision'] if revision is None else revision}).encode();req=urllib.request.Request(self.base+path,data=raw,headers={'Content-Type':'application/json',**(headers or {})})
  try:
   with self.client.open(req) as r:out=json.load(r);self.state=out;return out
  except urllib.error.HTTPError as e:return {'status':e.code,**json.load(e)}
 def test_19_health(self):self.assertTrue(self.get('/api/health')['ok'])
 def test_20_http_new(self):self.assertEqual(self.post('/api/action',{'kind':'new'})['game']['S'],20)
 def test_21_idempotency(self):
  """Повтор request_id не создаёт новую историю и не меняетrevision."""
  rid=uuid.uuid4().hex;a=self.post('/api/action',{'kind':'new'},rid);b=self.post('/api/action',{'kind':'new'},rid,revision=0);self.assertEqual((a['game']['run_id'],a['revision']),(b['game']['run_id'],b['revision']))
 def test_22_id_reuse_rejected(self):
  rid=uuid.uuid4().hex;self.post('/api/action',{'kind':'new'},rid);self.assertEqual(self.post('/api/action',{'kind':'hint'},rid)['status'],409)
 def test_23_stale_revision(self):
  self.post('/api/action',{'kind':'new'});self.assertEqual(self.post('/api/action',{'kind':'hint'},revision=0)['status'],409)
 def test_24_payment_failure_cancel(self):
  for outcome in ['failure','cancel']:
   oid=self.post('/api/checkout')['event']['order_id'];r=self.post('/api/sandbox/confirm',{'order_id':oid,'outcome':outcome});self.assertFalse(r['full_access'])
 def test_25_payment_success_once(self):
  self.post('/api/action',{'kind':'new'});oid=self.post('/api/checkout')['event']['order_id'];a=self.post('/api/sandbox/confirm',{'order_id':oid,'outcome':'success'});b=self.post('/api/sandbox/confirm',{'order_id':oid,'outcome':'failure'});self.assertTrue(a['full_access']);self.assertTrue(b['full_access']);self.assertEqual(b['game']['S'],20);self.assertEqual(b['game']['P'],0)
 def test_26_forged_callback(self):
  oid=self.post('/api/checkout')['event']['order_id'];r=self.post('/api/sandbox/webhook',{'event':{'order_id':oid,'outcome':'success'},'signature':'forged'});self.assertEqual(r['status'],403);self.assertFalse(self.get('/api/state')['full_access'])
 def test_27_client_access_flag_ignored(self):
  r=self.post('/api/action',{'kind':'new','full_access':True});self.assertFalse(r['full_access'])
 def test_28_cross_origin(self):self.assertEqual(self.post('/api/action',{'kind':'new'},headers={'Origin':'https://unrelated.example'})['status'],403)
 def test_29_settings_validation(self):self.assertEqual(self.post('/api/settings',{'settings':{'volume':999}})['status'],400)
 def test_30_save_reload(self):
  a=self.post('/api/action',{'kind':'new'});b=self.get('/api/state');self.assertEqual(a['game']['run_id'],b['game']['run_id'])
 def test_31_price_is_server_owned(self):
  oid=self.post('/api/checkout',{'amount':1})['event']['order_id']
  with connect(self.path) as db:self.assertEqual(db.execute('SELECT amount FROM orders WHERE id=?',(oid,)).fetchone()[0],990)
 def test_32_profile_isolation(self):
  oid=self.post('/api/checkout')['event']['order_id'];self.setUp();r=self.post('/api/sandbox/confirm',{'order_id':oid,'outcome':'success'});self.assertEqual(r['status'],404)
 def test_33_unknown_action(self):self.assertEqual(self.post('/api/action',{'kind':'teleport'})['status'],400)
 def test_34_static_traversal(self):
  with self.assertRaises(urllib.error.HTTPError) as cm:self.client.open(self.base+'/%2e%2e/backend/server.py')
  self.assertEqual(cm.exception.code,404)

 def test_35_parallel_saves_cannot_overwrite_progress(self):
  self.post('/api/action',{'kind':'new'})
  # Cookie processor position is not part of urllib's public ordering contract.
  jar=next(h.cookiejar for h in self.client.handlers if hasattr(h,'cookiejar'))
  cookie='; '.join(c.name+'='+c.value for c in jar)
  barrier=threading.Barrier(2);original=Handler.profile
  def synchronized(handler,db):
   value=original(handler,db);barrier.wait(timeout=5);return value
  def send(rid):
   raw=json.dumps({'kind':'hint','request_id':rid,'revision':self.state['revision']}).encode()
   request=urllib.request.Request(self.base+'/api/action',data=raw,headers={'Content-Type':'application/json','Cookie':cookie})
   try:
    with urllib.request.urlopen(request,timeout=10) as response:return response.status,json.load(response)
   except urllib.error.HTTPError as error:return error.code,json.load(error)
  with patch.object(Handler,'profile',synchronized),ThreadPoolExecutor(max_workers=2) as pool:
   results=list(pool.map(send,[uuid.uuid4().hex,uuid.uuid4().hex]))
  self.assertEqual(sorted(code for code,_ in results),[200,409])
  self.assertEqual(self.get('/api/state')['game']['hints'],1)

 def test_36_achievement_matches_result_history_after_hint(self):
  self.post('/api/action',{'kind':'new'})
  game,_=apply(synced(fresh()),'hint',{})
  jar=next(h.cookiejar for h in self.client.handlers if hasattr(h,'cookiejar'))
  profile=next(c.value for c in jar if c.name=='chronoshov')
  with connect(self.path) as db:db.execute('UPDATE profiles SET game=?,full_access=1 WHERE id=?',(json.dumps(game),profile))
  result=self.post('/api/action',{'kind':'finish','payload':{'id':'return','position':BEACON}})
  self.assertFalse(result['game']['achievement'])
  self.assertEqual(result['results'][0]['achievement'],0)

 def test_37_walked_position_survives_reload(self):
  self.post('/api/action',{'kind':'new'})
  self.post('/api/action',{'kind':'tick','payload':{'position':[-8,19]}})
  self.assertEqual(self.get('/api/state')['game']['position'],[-8,19])


class ReportingResult(unittest.TextTestResult):
 def startTest(self,test):super().startTest(test);self._started=time.perf_counter()
 def addSuccess(self,test):super().addSuccess(test);self._record(test,'Pass','Ожидаемые значения подтверждены.')
 def addFailure(self,test,err):super().addFailure(test,err);self._record(test,'Fail',str(err[1]))
 def addError(self,test,err):super().addError(test,err);self._record(test,'Error',str(err[1]))
 def _record(self,test,status,actual):
  self.records=getattr(self,'records',[]);self.records.append({'id':getattr(test,'_testMethodName',str(test)),'function':test.__class__.__name__,'steps':test.shortDescription() or str(test),'expected':'Все утверждения теста выполняются.','actual':actual,'status':status,'seconds':round(time.perf_counter()-getattr(self,'_started',time.perf_counter()),4)})
if __name__=='__main__':
 suite=unittest.defaultTestLoader.loadTestsFromModule(sys.modules[__name__]);result=unittest.TextTestRunner(verbosity=2,resultclass=ReportingResult).run(suite);out=Path(__file__).resolve().parents[1]/'reports/functional-tests.json';out.write_text(json.dumps({'run_at':time.strftime('%Y-%m-%dT%H:%M:%S%z'),'total':result.testsRun,'failures':len(result.failures),'errors':len(result.errors),'cases':result.records},ensure_ascii=False,indent=2));sys.exit(not result.wasSuccessful())
