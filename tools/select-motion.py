"""Sample representative 100STYLE Neutral cycles, aligned to the in-game heel strike."""
import json, math, sys
from pathlib import Path
source, legs, output = map(Path, sys.argv[1:])
mocap = json.loads(source.read_text())
gait = json.loads(legs.read_text().split('export const gaitClips = ', 1)[1].strip().rstrip(';'))

def cycle(rows, mode):
    periods = range(57, 72) if mode == 'walk' else range(44, 57)
    speed = (0.80, 1.2) if mode == 'walk' else (1.55, 2.1)
    candidates = []
    for start in range(100, len(rows)-130, 3):
        for period in periods:
            a,b = rows[start],rows[start+period]
            v = math.hypot(b[0]-a[0],b[1]-a[1]) * .6 / period
            if not speed[0]<v<speed[1] or abs(math.remainder(b[3]-a[3],math.tau))>.22:
                continue
            cost = sum((b[i]-a[i])**2 for i in range(6,22) if i not in (6,7,14,15))
            cost += sum(((b[i]-a[i])/22)**2 for i in (6,7,14,15))
            if max(r[6] for r in rows[start:start+period])-min(r[6] for r in rows[start:start+period])>41:
                candidates.append((cost,start,period))
    _,start,n = min(candidates)
    rows=rows[start:start+n+1]
    # Match the difference in ankle lead to the established gameplay step phase.
    lead=[r[6]-r[14] for r in rows[:-1]]
    reference=[r[6]-r[12] for r in gait[mode]['samples']]
    shift=max(range(n),key=lambda k:sum(r*lead[(k+round(i*n/len(reference)))%n] for i,r in enumerate(reference)))
    channels=[4,5,*range(8,14),*range(16,22)]
    out=[]
    for frame in range(64):
        t=(shift+frame*n/64)%n
        j=int(t)
        # Bleed the end-to-start correction across the whole sample to close the loop.
        out.append([round(rows[j][i]+(rows[j+1][i]-rows[j][i])*(t-j)-(rows[-1][i]-rows[0][i])*t/n,5) for i in channels])
    print(mode,start,n,shift)
    return out

data={mode:cycle(rows,mode) for mode,rows in mocap.items()}
text=json.dumps(data,separators=(',',':')).replace('],[','],\n[')
output.write_text('// 100STYLE Neutral forward motion, CC BY 4.0. See assets/NOTICE-100STYLE.txt.\nexport const upperBodyClips = '+text+';\n')
