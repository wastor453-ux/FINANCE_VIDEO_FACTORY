import json, os, sys, tempfile, unittest
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "tools"))
import style_pack as SP


def board(path, size=(200, 100)):
    a = np.zeros((size[1], size[0], 3), dtype=np.uint8); a[:, :] = (240, 245, 255)
    a[10:30, 10:30] = (52, 120, 246)      # swatch A
    a[10:30, 40:60] = (6, 31, 81)         # swatch B (darker than its printed label)
    a[50:60, 100:150] = (200, 200, 200); a[54, 120] = (20, 30, 90)   # text-ish area with one dark pixel
    Image.fromarray(a).save(path)


class StylePackTests(unittest.TestCase):
    def setUp(self):
        self.d = tempfile.mkdtemp(); board(os.path.join(self.d, "b.png"))
        self.sp = {"boards": {"b": "b.png"}, "samples": [
            {"key": "brand.a", "board": "b", "method": "median", "region": [12, 12, 28, 28], "declared": "#3478F6"},
            {"key": "brand.b", "board": "b", "method": "median", "region": [42, 12, 58, 28], "declared": "#102044"},
            {"key": "text.dark", "board": "b", "method": "darkest", "region": [100, 50, 150, 60]},
            {"key": "pt", "board": "b", "method": "point", "region": [12, 12, 13, 13]},
            {"key": "bg", "board": "b", "method": "median", "region": [0, 0, 8, 8]}]}

    def test_extract_records_observed_declared_and_difference(self):
        o = SP.extract(self.sp, self.d); m = {s["key"]: s for s in o["samples"]}
        self.assertEqual(m["brand.a"]["observed"], "#3478F6"); self.assertAlmostEqual(m["brand.a"]["deltaE"], 0, places=1)
        self.assertEqual(m["brand.b"]["observed"], "#061F51"); self.assertGreater(m["brand.b"]["deltaE"], 5)
        self.assertEqual(m["text.dark"]["observed"], "#141E5A"); self.assertEqual(m["pt"]["observed"], "#3478F6")
        self.assertEqual(len(m["brand.a"]["boardSha256"]), 64)

    def test_region_outside_board_is_an_error_not_a_guess(self):
        self.sp["samples"][0]["region"] = [0, 0, 500, 500]
        with self.assertRaises(ValueError): SP.extract(self.sp, self.d)

    def test_declared_vs_observed_choice_and_derived_text_is_readable(self):
        o = SP.extract(self.sp, self.d)
        rules = {"id": "t", "name": "t", "color": {"preferDefault": "observed", "roles": {
            "ink": {"from": "brand.b", "prefer": "declared"}, "primary": {"from": "brand.a", "prefer": "observed"}, "cyan": {"from": "brand.a"}, "teal": {"from": "brand.a"}, "lavender": {"from": "brand.a"},
            "canvas": {"from": "bg"}, "surface": {"from": "bg"}, "border": {"from": "bg"}, "inkSecondary": {"from": "text.dark"}},
            "series": [{"id": "x", "from": "brand.a"}], "flow": {"gain": {"from": "brand.a"}, "loss": {"from": "brand.a"}, "lossAlt": {"from": "brand.a"}, "rule": "r"},
            "textMinContrast": 4.5, "inkMinContrast": 7, "fillMinContrast": 1.5, "strokeMinContrast": 3, "fillContrastNote": "n"},
            "geometry": {}, "type": {}, "motion": {}, "components": {}, "scene": {}, "trustRules": {}, "backgrounds": {"rule": "r", "default": "bg"}}
        pack = SP.build(o, rules, [])
        self.assertEqual(pack["color"]["ink"], "#102044")             # printed label won
        self.assertEqual(pack["color"]["primary"], "#3478F6")         # pixels won
        s = pack["color"]["series"][0]
        self.assertGreaterEqual(SP.contrast(s["text"], pack["color"]["surface"]), 4.5)
        self.assertGreaterEqual(SP.contrast(s["stroke"], pack["color"]["surface"]), 3.0)
        self.assertTrue(pack["provenance"]["values"]["brand.b"]["deltaE"] > 5)

    def test_bake_writes_16x9_images_with_provenance(self):
        out = os.path.join(self.d, "o"); spec = {"boards": {"b": "b.png"}, "width": 192, "height": 108, "tiles": [{"id": "t1", "board": "b", "region": [0, 0, 100, 50], "blur": 2}]}
        w = SP.bake(spec, self.d, out)
        self.assertEqual(Image.open(os.path.join(out, "t1.png")).size, (192, 108)); self.assertEqual(w[0]["sourceBoard"], "b.png"); self.assertEqual(w[0]["sourceSize"], [100, 50])


if __name__ == "__main__":
    unittest.main()
