# Freesound CC0 önizlemelerinden oyun seslerini üretir (kes, mono, normalize, dikişsiz döngü, AAC).
# Kullanım: ham dosyaları RAW klasörüne fs_<id>.mp3 adıyla koy, sonra: python3 tools/sfx_make.py
import subprocess, numpy as np, sys, os, json
RAW='/tmp/claude-0/sfxraw'; OUT='/home/user/sariyer-aslani/assets/sfx'; os.makedirs(OUT, exist_ok=True)
SR=44100
def dec(i, s, d):
    b=subprocess.run(['ffmpeg','-v','error','-ss',str(s),'-t',str(d),'-i',f'{RAW}/fs_{i}.mp3','-ac','1','-ar',str(SR),'-f','f32le','-'],capture_output=True).stdout
    return np.frombuffer(b,dtype=np.float32).copy()
def fade(a, fi=0.005, fo=0.03):
    n=len(a); i=int(fi*SR); o=int(fo*SR)
    if i: a[:i]*=np.linspace(0,1,i)
    if o: a[-o:]*=np.linspace(1,0,o)
    return a
def norm(a, peak_db=-1.0, rms_db=None):
    if rms_db is not None:
        r=np.sqrt(np.mean(a**2))+1e-9; a=a*(10**(rms_db/20)/r)
    p=np.max(np.abs(a))+1e-9; lim=10**(peak_db/20)
    if rms_db is None or p>lim: a=a*(lim/p)
    return a
def loop(a, x=1.5):
    X=int(x*SR); body=a[:-X].copy(); tail=a[-X:]
    t=np.linspace(0,1,X); body[:X]=body[:X]*np.sqrt(t)+tail*np.sqrt(1-t)
    return body
def enc(name, a, br='64k', sr=SR):
    p=f'{OUT}/{name}.m4a'
    subprocess.run(['ffmpeg','-v','error','-y','-f','f32le','-ar',str(SR),'-ac','1','-i','-','-ar',str(sr),'-c:a','aac','-b:a',br,'-movflags','+faststart',p],input=a.astype(np.float32).tobytes(),check=True)
    return os.path.getsize(p)
J=[]  # (name, id, start, dur, kind, opts)
def one(name,i,s,d,**k): J.append((name,i,s,d,'one',k))
def lp(name,i,s,d,**k): J.append((name,i,s,d,'loop',k))
one('roar',684527,0,1.5,fo=0.15)
one('growl',516829,0.95,2.1,fo=0.3)
one('growl2',437978,4.65,1.4,fo=0.25)
one('hurt',437978,0.55,1.8,fo=0.3)
for n,s in enumerate([0.0,0.26,0.56,1.14]): one(f'step{n+1}',781080,s,0.22,fo=0.06,rms=-18,br='48k')
one('drink',483696,0.2,3.0,fo=0.2,br='48k')
one('eat',675451,20,10,fo=0.3,br='48k')
one('cub',877612,0,0.8,fo=0.1)
lp('forest',523372,30,26,br='48k',rms=-20)
lp('night',591154,5,26,br='48k',rms=-20)
lp('water',826884,10,18.5,br='48k',rms=-20)
lp('wind',135779,2,18.5,br='48k',rms=-20)
lp('rotor',556021,1,7.5,x=1.0,br='48k',rms=-14)
lp('drone',383852,0.1,2.9,x=0.4,br='48k',rms=-16)
one('siren',574394,1,16,fo=1.5,fi=0.5,br='48k')
one('shutter',249750,0,0.5,fo=0.05)
one('gunshot',835200,0.12,1.2,fo=0.3)
one('heartbeat',451948,0,2.4,fo=0.2,br='48k')
one('shout',557375,1.25,1.1,fo=0.15,br='48k')
one('deer',696777,0,1.2,fo=0.15,br='48k')
one('boar',425241,3.0,2.0,fo=0.2,br='48k')
one('music_intro',609900,0,62,fo=5,fi=0.05,br='64k',peak=-2)
one('music_sad',592541,2,38,fo=4,fi=0.5,br='64k',peak=-2)
one('music_hope',755823,0,46,fo=5,fi=0.05,br='64k',peak=-2)
tot=0; rep=[]
for name,i,s,d,kind,k in J:
    a=dec(i,s,d)
    if kind=='loop':
        a=loop(a,k.get('x',1.5)); a=norm(a,-1,k.get('rms'))
    else:
        a=fade(a,k.get('fi',0.005),k.get('fo',0.03)); a=norm(a,k.get('peak',-1.0),k.get('rms'))
    sz=enc(name,a,k.get('br','64k')); tot+=sz; rep.append((name,i,round(len(a)/SR,2),sz))
for r in rep: print(*r)
print('TOTAL KB', tot//1024)
json.dump([{'file':n+'.m4a','id':i,'start':s,'dur':d} for n,i,s,d,_,_ in J], open('/tmp/claude-0/sfxtools/segments.json','w'))
