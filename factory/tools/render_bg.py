#!/usr/bin/env python3
"""Deterministic background recipes -> 1920x1080 PNG. usage: render_bg.py <kit.json> (writes config/kits/assets, rewrites kit background.items)
Blob colours come only from the kit's resolved palette tokens (canvas + primary/cyan/teal/lavender)."""
import json,sys,os,numpy as np
from PIL import Image
R=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def hx(h): return np.array([int(h[i:i+2],16) for i in (1,3,5)],float)
def palette(kit):
    base=json.load(open(f"{R}/config/styles/{kit['base']}/style.json"))['color']
    c={**base,**kit.get('overrides',{}).get('color',{})}
    return {k:c[k] for k in ('canvas','primary','cyan','teal','lavender')}
def render(rec,pal,w=1920,h=1080):
    img=np.ones((h,w,3))*hx(pal['canvas']); ys,xs=np.mgrid[0:h,0:w]; xs=xs/w; ys=ys/h*(h/w)
    for x,y,r,tok,a in rec['blobs']:
        d2=((xs-x)**2+(ys-y*h/w)**2)/(r*r); m=(a*np.exp(-d2*2.2))[...,None]
        img=img*(1-m)+hx(pal[tok])*m
    return Image.fromarray(np.clip(np.rint(img),0,255).astype('uint8'))
def main(path,write=True):
    kit=json.load(open(path)); rec=json.load(open(f"{R}/config/backgrounds/recipes.json"))['recipes']; pal=palette(kit); items=[]
    for rid in kit['background']['recipes']:
        f=f"assets/{kit['id']}__{rid}.png"; out=f"{R}/config/kits/{f}"
        if write: render(rec[rid],pal).save(out)
        items.append({"id":rid,"file":"../../kits/"+f,"note":"recipe "+rid+" on "+kit['id']+" palette","recipe":rid,"approximate":False})
    return kit,items
if __name__=="__main__":
    for p in sys.argv[1:]:
        kit,items=main(p); kit['background']['items']=items; json.dump(kit,open(p,'w'),indent=2); open(p,'a').write("\n")
