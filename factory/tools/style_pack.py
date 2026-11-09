#!/usr/bin/env python3
"""Read a style from reference board images, numerically, with provenance.

  style_pack.py extract --sampling sampling.json --boards-dir DIR --out observed.json
  style_pack.py bake    --spec backgrounds.json --boards-dir DIR --out-dir DIR

`extract` records, for every named sample: the observed colour (median/darkest/point of a pixel box), the
colour printed on the board if there is one (declared), their difference (CIE76 delta E), the board file
(+ sha256) and the box. Nothing is typed from memory. `bake` cuts background tiles out of a board and writes
1920x1080 images. Pure Pillow + numpy, no network.
"""
import argparse, hashlib, json, os, sys
import numpy as np
from PIL import Image, ImageFilter


def hexs(rgb): return "#%02X%02X%02X" % tuple(int(round(v)) for v in rgb)


def parse_hex(h):
    h = h.lstrip("#"); return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def to_lab(rgb):
    def lin(v):
        v /= 255.0
        return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4
    r, g, b = (lin(v) for v in rgb)
    x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047; y = 0.2126 * r + 0.7152 * g + 0.0722 * b; z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883
    f = lambda t: t ** (1 / 3) if t > 0.008856 else 7.787 * t + 16 / 116
    fx, fy, fz = f(x), f(y), f(z)
    return (116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz))


def delta_e(a, b): return float(sum((p - q) ** 2 for p, q in zip(to_lab(a), to_lab(b))) ** 0.5)


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""): h.update(chunk)
    return h.hexdigest()


def sample(arr, method, region):
    x0, y0, x1, y1 = region
    if not (0 <= x0 < x1 <= arr.shape[1] and 0 <= y0 < y1 <= arr.shape[0]):
        raise ValueError(f"region {region} is outside the board ({arr.shape[1]}x{arr.shape[0]})")
    px = arr[y0:y1, x0:x1].reshape(-1, 3)
    if method == "median": return tuple(np.median(px, axis=0))
    if method == "darkest": return tuple(px[px.sum(axis=1).argmin()])
    if method == "point": return tuple(px[0])
    raise ValueError(f"unknown method {method}")


def extract(sampling, boards_dir):
    boards, cache, out = sampling["boards"], {}, []
    for s in sampling["samples"]:
        fn = boards[s["board"]]; path = os.path.join(boards_dir, fn)
        if fn not in cache:
            im = Image.open(path).convert("RGB")
            cache[fn] = (np.array(im).astype(float), im.size, sha256(path))
        arr, size, digest = cache[fn]
        obs = sample(arr, s["method"], s["region"])
        row = {"key": s["key"], "observed": hexs(obs), "board": fn, "boardSize": list(size), "boardSha256": digest, "method": s["method"], "region": s["region"]}
        if s.get("declared"):
            row["declared"] = s["declared"].upper(); row["deltaE"] = round(delta_e(obs, parse_hex(s["declared"])), 2)
        if s.get("note"): row["note"] = s["note"]
        out.append(row)
    return {"schema": "ffx-style-observed/1", "samples": out}


def bake(spec, boards_dir, out_dir):
    os.makedirs(out_dir, exist_ok=True); written = []
    for t in spec["tiles"]:
        fn = spec["boards"][t["board"]]
        im = Image.open(os.path.join(boards_dir, fn)).convert("RGB")
        x0, y0, x1, y1 = t["region"]; tile = im.crop((x0, y0, x1, y1))
        big = tile.resize((spec.get("width", 1920), spec.get("height", 1080)), Image.LANCZOS).filter(ImageFilter.GaussianBlur(t.get("blur", 6)))
        p = os.path.join(out_dir, t["id"] + ".png"); big.save(p, optimize=True)
        written.append({"id": t["id"], "file": os.path.basename(p), "sourceBoard": fn, "sourceRegion": t["region"], "sourceSize": [x1 - x0, y1 - y0], "note": t.get("note", "")})
    return written


def lum(rgb):
    def lin(v):
        v /= 255.0
        return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4
    r, g, b = (lin(v) for v in rgb); return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(a, b):
    x, y = sorted((lum(parse_hex(a)), lum(parse_hex(b))), reverse=True); return (x + 0.05) / (y + 0.05)


def text_variant(fill, bg, ink, min_ratio):
    """The series colour pulled toward the ink colour in 4% steps until it reads as text on bg."""
    f, k = parse_hex(fill), parse_hex(ink)
    for i in range(0, 26):
        t = i * 0.04; c = hexs(tuple(f[j] * (1 - t) + k[j] * t for j in range(3)))
        if contrast(c, bg) >= min_ratio: return c
    return ink


def build(observed, rules, manifest):
    obs = {s["key"]: s for s in observed["samples"]}
    def pick(key, prefer):
        s = obs[key]; want = prefer if prefer in ("declared", "observed") else "observed"
        if want == "declared" and "declared" not in s: want = "observed"
        return s[want], want
    C, prov = rules["color"], {}
    def val(key, prefer):
        v, w = pick(key, prefer); prov[key] = {"used": v, "chose": w, "observed": obs[key]["observed"], "declared": obs[key].get("declared"), "deltaE": obs[key].get("deltaE"), "board": obs[key]["board"], "region": obs[key]["region"]}; return v
    roles = {k: val(r["from"], r.get("prefer", C["preferDefault"])) for k, r in C["roles"].items()}
    ink, surface = roles["ink"], roles["surface"]
    series = []
    for i, s in enumerate(C["series"]):
        fill = val(s["from"], "observed")
        series.append({"slot": i + 1, "id": s["id"], "fill": fill, "stroke": text_variant(fill, surface, ink, C["strokeMinContrast"]), "text": text_variant(fill, surface, ink, C["textMinContrast"])})
    flow = {k: {"fill": val(v["from"], "observed"), "stroke": None, "text": None} for k, v in C["flow"].items() if isinstance(v, dict)}
    for k in flow: flow[k]["stroke"] = text_variant(flow[k]["fill"], surface, ink, C["strokeMinContrast"]); flow[k]["text"] = text_variant(flow[k]["fill"], surface, ink, C["textMinContrast"])
    flow["rule"] = C["flow"]["rule"]
    ink2 = roles["inkSecondary"]
    if contrast(ink2, surface) < C["textMinContrast"]: ink2 = text_variant(ink2, surface, ink, C["textMinContrast"])
    boards = {}
    for s in observed["samples"]: boards[s["board"]] = s["boardSha256"]
    return {
        "schema": "ffx-style-pack/1", "id": rules["id"], "name": rules["name"],
        "color": {"ink": ink, "inkSecondary": ink2, "canvas": roles["canvas"], "surface": surface, "border": roles["border"],
                  "primary": roles["primary"], "cyan": roles["cyan"], "teal": roles["teal"], "lavender": roles["lavender"],
                  "series": series, "flow": flow,
                  "gates": {"strokeMinContrast": C["strokeMinContrast"], "textMinContrast": C["textMinContrast"], "inkMinContrast": C["inkMinContrast"], "fillMinContrast": C["fillMinContrast"], "fillContrastNote": C["fillContrastNote"]}},
        "geometry": rules["geometry"], "type": rules["type"], "motion": rules["motion"], "components": rules["components"], "scene": rules["scene"], "trustRules": rules["trustRules"],
        "backgrounds": {"rule": rules["backgrounds"]["rule"], "default": rules["backgrounds"]["default"],
                        "items": [{"id": m["id"], "file": "assets/" + m["file"], "note": m["note"], "source": {"board": m["sourceBoard"], "region": m["sourceRegion"], "sizePx": m["sourceSize"]}, "approximate": True} for m in manifest]},
        "provenance": {"boards": boards, "values": prov},
    }


def main(argv=None):
    ap = argparse.ArgumentParser(); sub = ap.add_subparsers(dest="cmd", required=True)
    e = sub.add_parser("extract"); e.add_argument("--sampling", required=True); e.add_argument("--boards-dir", required=True); e.add_argument("--out", required=True)
    b = sub.add_parser("bake"); b.add_argument("--spec", required=True); b.add_argument("--boards-dir", required=True); b.add_argument("--out-dir", required=True); b.add_argument("--manifest")
    d = sub.add_parser("build"); d.add_argument("--observed", required=True); d.add_argument("--rules", required=True); d.add_argument("--backgrounds", required=True); d.add_argument("--out", required=True)
    a = ap.parse_args(argv)
    if a.cmd == "build":
        with open(a.observed) as f: o = json.load(f)
        with open(a.rules) as f: r = json.load(f)
        with open(a.backgrounds) as f: m = json.load(f)
        pack = build(o, r, m)
        with open(a.out, "w") as f: json.dump(pack, f, indent=1)
        print(f"style pack {pack['id']} -> {a.out}")
        return 0
    if a.cmd == "extract":
        with open(a.sampling) as f: sp = json.load(f)
        res = extract(sp, a.boards_dir)
        with open(a.out, "w") as f: json.dump(res, f, indent=1)
        print(f"{len(res['samples'])} samples -> {a.out}")
    else:
        with open(a.spec) as f: sp = json.load(f)
        w = bake(sp, a.boards_dir, a.out_dir)
        if a.manifest:
            with open(a.manifest, "w") as f: json.dump(w, f, indent=1)
        print(f"{len(w)} backgrounds -> {a.out_dir}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
