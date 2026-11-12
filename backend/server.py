"""Локальный HTTP сервер и SQLite. Python 3.10+, внешние пакеты не требуются."""
import threading,webbrowser
import argparse,hashlib,hmac,json,mimetypes,os,secrets,sqlite3,time,uuid
from pathlib import Path
from http.server import ThreadingHTTPServer,BaseHTTPRequestHandler
from http.cookies import SimpleCookie
from urllib.parse import urlparse,unquote
from .core import apply,public_game,GameError,achievement
from .content import VOICE_COMMANDS,GESTURES
ROOT=Path(__file__).resolve().parents[1]
DEFAULT_SETTINGS={'volume':35,'music':70,'effects':80,'large':False,'motion':True,'contrast':False,'graphics':1}

def connect(path):
 db=sqlite3.connect(path,timeout=10);db.row_factory=sqlite3.Row;db.execute('PRAGMA foreign_keys=ON');return db

def init_db(path):
 Path(path).parent.mkdir(parents=True,exist_ok=True)
 with connect(path) as db:
  db.executescript('''
   PRAGMA journal_mode=WAL;
   CREATE TABLE IF NOT EXISTS profiles(id TEXT PRIMARY KEY,game TEXT,settings TEXT NOT NULL,full_access INTEGER NOT NULL DEFAULT 0,revision INTEGER NOT NULL DEFAULT 0,created REAL NOT NULL);
   CREATE TABLE IF NOT EXISTS actions(profile TEXT NOT NULL,request_id TEXT NOT NULL,digest TEXT NOT NULL,created REAL NOT NULL,PRIMARY KEY(profile,request_id));
   CREATE TABLE IF NOT EXISTS orders(id TEXT PRIMARY KEY,profile TEXT NOT NULL,status TEXT NOT NULL,amount INTEGER NOT NULL,created REAL NOT NULL);
   CREATE TABLE IF NOT EXISTS results(id INTEGER PRIMARY KEY,profile TEXT NOT NULL,run_id TEXT NOT NULL,attempt INTEGER NOT NULL,ending TEXT NOT NULL,score INTEGER NOT NULL,stability INTEGER NOT NULL,achievement INTEGER NOT NULL,created REAL NOT NULL,UNIQUE(profile,run_id,attempt));
  ''')

def signed_event(secret,order_id,outcome):
 payload=json.dumps({'order_id':order_id,'outcome':outcome},sort_keys=True,separators=(',',':')).encode()
 return payload,hmac.new(secret,payload,hashlib.sha256).hexdigest()

def settle(db,secret,payload,signature,profile):
 expected=hmac.new(secret,payload,hashlib.sha256).hexdigest()
 if not hmac.compare_digest(expected,signature):raise GameError('Неверная подпись платёжного события.',403)
 try:event=json.loads(payload)
 except (ValueError,UnicodeDecodeError):raise GameError('Повреждённое платёжное событие.')
 order=db.execute('SELECT * FROM orders WHERE id=? AND profile=?',(event.get('order_id'),profile)).fetchone()
 if not order:raise GameError('Покупка не найдена.',404)
 outcome=event.get('outcome')
 if outcome not in ('success','cancel','failure'):raise GameError('Неизвестный статус покупки.')
 if order['status']=='success':return 'success'
 db.execute('UPDATE orders SET status=? WHERE id=?',(outcome,order['id']))
 if outcome=='success':db.execute('UPDATE profiles SET full_access=1 WHERE id=?',(profile,))
 return outcome

class GameServer(ThreadingHTTPServer):
 daemon_threads=True
 def __init__(self,address,db_path,secret):
  self.db_path=str(db_path);self.secret=secret;init_db(db_path);super().__init__(address,Handler)

class Handler(BaseHTTPRequestHandler):
 server_version='Station17/4.0'
 def log_message(self,fmt,*args):pass
 def send_json(self,value,status=200,cookie=None):
  raw=json.dumps(value,ensure_ascii=False).encode();self.send_response(status)
  self.send_header('Content-Type','application/json; charset=utf-8');self.send_header('Content-Length',str(len(raw)));self.send_header('Cache-Control','no-store');self.send_header('X-Content-Type-Options','nosniff')
  if cookie:self.send_header('Set-Cookie',f'chronoshov={cookie}; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000')
  self.end_headers();self.wfile.write(raw)
 def profile(self,db):
  c=SimpleCookie()
  try:c.load(self.headers.get('Cookie',''));token=c['chronoshov'].value if 'chronoshov' in c else None
  except Exception:token=None
  row=db.execute('SELECT * FROM profiles WHERE id=?',(token,)).fetchone() if token else None
  if row:return row,None
  token=secrets.token_urlsafe(32);db.execute('INSERT INTO profiles(id,settings,created) VALUES(?,?,?)',(token,json.dumps(DEFAULT_SETTINGS),time.time()));db.commit()
  return db.execute('SELECT * FROM profiles WHERE id=?',(token,)).fetchone(),token
 def view(self,db,p,event=None):
  game=json.loads(p['game']) if p['game'] else None
  if game and game.get('story_version')!=4:game=None
  results=[dict(x) for x in db.execute('SELECT ending,score,stability,achievement,created FROM results WHERE profile=? AND ending IN (?,?,?,?,?) ORDER BY id DESC LIMIT 20',(p['id'],'Возвращение','Последняя смена','Чистый лист','Аварийное размыкание','Авария на станции'))]
  stat=db.execute('SELECT COUNT(*) AS attempts,COALESCE(MAX(score),0) AS best,COUNT(DISTINCT CASE WHEN ending IN (?,?,?) THEN ending END) AS endings FROM results WHERE profile=?',('Возвращение','Последняя смена','Чистый лист',p['id'])).fetchone()
  return {'game':public_game(game,bool(p['full_access'])),'full_access':bool(p['full_access']),'revision':p['revision'],'settings':json.loads(p['settings']),'results':results,'stats':dict(stat),'event':event or {},'controls':{'voice':VOICE_COMMANDS,'gestures':GESTURES},'version':'4.2.0','price':990}
 def do_GET(self):
  path=urlparse(self.path).path
  if path in ('/api/state','/api/health'):
   if path=='/api/health':self.send_json({'ok':True,'version':'4.2.0'});return
   with connect(self.server.db_path) as db:p,cookie=self.profile(db);self.send_json(self.view(db,p),cookie=cookie)
   return
  path='/index.html' if path=='/' else '/favicon.svg' if path=='/favicon.ico' else unquote(path)
  candidate=(ROOT/'static'/path.lstrip('/')).resolve()
  if not candidate.is_relative_to((ROOT/'static').resolve()) or not candidate.is_file():self.send_json({'error':'Файл не найден.'},404);return
  mime=mimetypes.guess_type(candidate.name)[0] or 'application/octet-stream'
  if candidate.suffix in ('.js','.mjs'):mime='text/javascript'
  if candidate.suffix=='.wasm':mime='application/wasm'
  raw=candidate.read_bytes();self.send_response(200);self.send_header('Content-Type',mime+('; charset=utf-8' if mime.startswith('text/') else ''));self.send_header('Content-Length',str(len(raw)));self.send_header('X-Content-Type-Options','nosniff');self.send_header('Cache-Control','no-cache');self.send_header('Cross-Origin-Resource-Policy','same-origin');self.send_header('Referrer-Policy','no-referrer');self.end_headers();self.wfile.write(raw)
 def do_POST(self):
  try:
   origin=self.headers.get('Origin');host=self.headers.get('Host','')
   if self.headers.get('Sec-Fetch-Site')=='cross-site' or (origin and origin not in ('http://'+host,'https://'+host)):raise GameError('Запрос с другого сайта отклонён.',403)
   size=int(self.headers.get('Content-Length','0'))
   if not 0<size<=8192:raise GameError('Некорректный размер запроса.',413)
   if not self.headers.get('Content-Type','').startswith('application/json'):raise GameError('Ожидается JSON.',415)
   try:data=json.loads(self.rfile.read(size))
   except (ValueError,UnicodeDecodeError):raise GameError('Некорректный JSON.')
   if not isinstance(data,dict):raise GameError('Ожидается объект запроса.')
   path=urlparse(self.path).path
   with connect(self.server.db_path) as db:
    p,cookie=self.profile(db);profile=p['id'];db.execute('BEGIN IMMEDIATE')
    # Read the revision after acquiring the write lock: another tab may have saved.
    p=db.execute('SELECT * FROM profiles WHERE id=?',(profile,)).fetchone()
    rid=data.get('request_id')
    if not isinstance(rid,str) or not 8<=len(rid)<=80:raise GameError('Запрос должен иметь уникальный идентификатор.')
    digest=hashlib.sha256((path+json.dumps({k:v for k,v in data.items() if k not in ('request_id','revision')},sort_keys=True)).encode()).hexdigest()
    prev=db.execute('SELECT digest FROM actions WHERE profile=? AND request_id=?',(profile,rid)).fetchone()
    if prev:
     if prev['digest']!=digest:raise GameError('Идентификатор уже использован для другого действия.',409)
     self.send_json(self.view(db,p,{'message':'Повторный запрос уже обработан.','replayed':True}),cookie=cookie);return
    if type(data.get('revision')) is not int or data['revision']!=p['revision']:raise GameError('Состояние изменилось. Повторите действие после обновления.',409)
    event={};game=json.loads(p['game']) if p['game'] else None
    if path=='/api/action':
     kind=data.get('kind');payload=data.get('payload',{})
     if not isinstance(payload,dict):raise GameError('Некорректные параметры действия.')
     game,event=apply(game,kind,payload,bool(p['full_access']))
     db.execute('UPDATE profiles SET game=? WHERE id=?',(json.dumps(game,ensure_ascii=False),profile))
     if game['phase'] in ('over','results'):
      db.execute('INSERT OR IGNORE INTO results(profile,run_id,attempt,ending,score,stability,achievement,created) VALUES(?,?,?,?,?,?,?,?)',(profile,game['run_id'],game['attempt'],game['ending'],game['P'],game['S'],int(achievement(game)),time.time()))
    elif path=='/api/settings':
     cfg=data.get('settings',{})
     if not isinstance(cfg,dict) or set(cfg)-set(DEFAULT_SETTINGS):raise GameError('Неизвестная настройка.')
     current=json.loads(p['settings'])
     for k,v in cfg.items():
      if k in ('volume','music','effects'):
       if type(v) is not int or not 0<=v<=100:raise GameError('Громкость должна быть от 0 до 100.')
      elif k=='graphics':
       if type(v) is not int or v not in (0,1,2):raise GameError('Режим графики: 0, 1 или 2.')
      elif type(v) is not bool:raise GameError('Настройка должна иметь значение да или нет.')
      current[k]=v
     db.execute('UPDATE profiles SET settings=? WHERE id=?',(json.dumps(current),profile));event={'message':'Настройки сохранены.'}
    elif path=='/api/checkout':
     if p['full_access']:event={'message':'Полная история уже открыта.','already_owned':True}
     else:
      oid=uuid.uuid4().hex;db.execute('INSERT INTO orders VALUES(?,?,?,?,?)',(oid,profile,'pending',990,time.time()));event={'order_id':oid,'message':'Учебный платёжный стенд. Деньги не списываются.'}
    elif path=='/api/sandbox/confirm':
     payload,sig=signed_event(self.server.secret,str(data.get('order_id')),data.get('outcome'))
     status=settle(db,self.server.secret,payload,sig,profile);event={'payment':status,'message':{'success':'Полная история открыта. Показатели Анны не изменились.','cancel':'Покупка отменена.','failure':'Тестовый платёж отклонён. Можно повторить.'}[status]}
    elif path=='/api/sandbox/webhook':
     payload=json.dumps(data.get('event',{}),sort_keys=True,separators=(',',':')).encode();status=settle(db,self.server.secret,payload,str(data.get('signature','')),profile);event={'payment':status}
    else:raise GameError('Маршрут не найден.',404)
    db.execute('INSERT INTO actions VALUES(?,?,?,?)',(profile,rid,digest,time.time()));db.execute('UPDATE profiles SET revision=revision+1 WHERE id=?',(profile,));db.commit();p=db.execute('SELECT * FROM profiles WHERE id=?',(profile,)).fetchone();self.send_json(self.view(db,p,event),cookie=cookie)
  except GameError as ex:self.send_json({'error':ex.message},ex.status)
  except (ValueError,TypeError,KeyError):self.send_json({'error':'Некорректные данные запроса.'},400)
  except (BrokenPipeError,ConnectionResetError):pass

def main():
 parser=argparse.ArgumentParser(description='Локальная игра Станция 17');parser.add_argument('--open',action='store_true',help='Открыть браузер после запуска');parser.add_argument('--port',type=int,default=8765);parser.add_argument('--db',default=str(ROOT/'data/game.sqlite3'));args=parser.parse_args()
 secret_path=Path(args.db).with_suffix('.secret');secret_path.parent.mkdir(parents=True,exist_ok=True)
 if not secret_path.exists():secret_path.write_bytes(secrets.token_bytes(32));secret_path.chmod(0o600)
 server=GameServer(('127.0.0.1',args.port),args.db,secret_path.read_bytes());print(f'Станция 17: http://127.0.0.1:{server.server_port}',flush=True)
 if args.open:threading.Timer(.5,lambda:webbrowser.open(f'http://127.0.0.1:{server.server_port}')).start()
 try:server.serve_forever()
 except KeyboardInterrupt:pass
 finally:server.server_close()
if __name__=='__main__':main()
