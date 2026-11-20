import json,glob,os,unittest,numpy as np
from PIL import Image
R=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def hx(h): return np.array([int(h[i:i+2],16) for i in (1,3,5)],float)
class T(unittest.TestCase):
    def test_sampled_colours_match_board(self):
        n=0
        for f in sorted(glob.glob(R+"/config/kits/*.json")):
            k=json.load(open(f)); pv=k.get("overrides",{}).get("provenance")
            if not pv: continue
            for key,v in pv["values"].items():
                im=np.asarray(Image.open(f"{R}/config/styles/boards/{v['board']}").convert("RGB"),float)
                x0,y0,x1,y1=v["region"]; reg=im[y0:y1,x0:x1].reshape(-1,3)
                d=np.abs(np.median(reg,axis=0)-hx(v["used"])).max() if "median" in v["method"] and "light" not in v["method"] and "dark" not in v["method"] else np.min(np.abs(reg-hx(v["used"])).max(axis=1))
                self.assertLessEqual(d,12,f"{k['id']} {key} {v['used']} off board by {d}"); n+=1
        self.assertGreater(n,10)
    def test_recipes_deterministic_and_readable(self):
        import sys; sys.path.insert(0,R+"/tools"); import render_bg as rb
        for f in ("deep-navy","warm-cream"):
            kit,items=rb.main(f"{R}/config/kits/{f}.json",write=False); pal=rb.palette(kit)
            ink=hx(kit["overrides"]["color"]["ink"])
            for it in items:
                a=np.asarray(rb.render(json.load(open(R+"/config/backgrounds/recipes.json"))["recipes"][it["recipe"]],pal),float)
                b=np.asarray(Image.open(f"{R}/config/kits/{it['file'][len('../../kits/'):]}").convert("RGB"),float)
                self.assertEqual(float(np.abs(a-b).max()),0.0,"recipe png stale: "+it["id"])
                def L(c): c=c/255; c=np.where(c<=.04045,c/12.92,((c+.055)/1.055)**2.4); return .2126*c[...,0]+.7152*c[...,1]+.0722*c[...,2]
                li=L(ink); worst=min((max(li,L(b[...,:])[y,x])+.05)/(min(li,L(b)[y,x])+.05) for y,x in [(0,0),(540,960),(1079,1919),(0,1919),(1079,0),(300,500)])
                self.assertGreaterEqual(worst,7,f"{f} {it['id']} ink contrast {worst:.1f}")
if __name__=="__main__": unittest.main()
