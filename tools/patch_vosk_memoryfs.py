from pathlib import Path
import re,base64
p=Path(__file__).resolve().parents[1]/'static/vendor/vosk.js';s=p.read_text();m=re.search("var WorkerFactory = createBase64WorkerFactory\\('([^']+)'",s);w=base64.b64decode(m.group(1)).decode()
for old,new in [('this.Vosk.FS.mount(this.Vosk.IDBFS, {}, storagePath);','// Station 17: bundled local model uses memory FS; avoid duplicate IndexedDB storage.'),('return this.Vosk.syncFilesystem(true);','return Promise.resolve();'),('return this.Vosk.syncFilesystem(false);','return Promise.resolve();')]:
 assert old in w,'Патч уже применён или версия библиотеки отличается: '+old
 w=w.replace(old,new)
s=s[:m.start(1)]+base64.b64encode(w.encode()).decode()+s[m.end(1):];p.write_text(s)
