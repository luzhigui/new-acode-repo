# -*- coding: utf-8 -*-
import importlib.util, json, os, base64, sys

SCRIPT = r"D:/workbuddy/resources/app.asar.unpacked/resources/plugins/workbuddy-builtin/skills/buddy-multimodal-generation/scripts/buddy-multimodal-generation.py"
spec = importlib.util.spec_from_file_location("bmg", SCRIPT)
bmg = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bmg)

with open(os.path.join(os.path.dirname(__file__), "_tok.txt"), "r") as f:
    token = f.read().strip()

img = os.path.join(os.path.dirname(__file__), "立绘", "张三丰-武当宗师-立绘-v1.png")
with open(img, "rb") as fh:
    b64 = base64.b64encode(fh.read()).decode()

body = {"Model": "3.1", "ImageBase64": b64, "EnablePBR": True}
cfg = bmg._PROVIDER_MAP["3d"]
print("[SUBMIT] sending 张三丰 3D request ...", file=sys.stderr)
r = bmg._call_api(
    bmg._DEFAULT_ENDPOINT, cfg["provider"], cfg["service"], cfg["version"],
    cfg["submit_action"], body, token,
)
print("SUBMIT_RESULT")
print(json.dumps(r, ensure_ascii=False)[:2000])
