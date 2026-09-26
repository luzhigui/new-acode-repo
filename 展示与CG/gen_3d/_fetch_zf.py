# -*- coding: utf-8 -*-
import importlib.util, json, os, sys, time, io

SCRIPT = r"D:/workbuddy/resources/app.asar.unpacked/resources/plugins/workbuddy-builtin/skills/buddy-multimodal-generation/scripts/buddy-multimodal-generation.py"
spec = importlib.util.spec_from_file_location("bmg", SCRIPT)
bmg = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bmg)

HERE = os.path.dirname(__file__)
with open(os.path.join(HERE, "_tok.txt"), "r") as f:
    token = f.read().strip()
cfg = bmg._PROVIDER_MAP["3d"]
JOB = "1495351759874293760"
NAME = "zf"          # 张三丰
OUT = os.path.join(HERE, NAME)
os.makedirs(OUT, exist_ok=True)


def download(url, dst):
    r = bmg.requests.get(url, timeout=600, stream=True)
    r.raise_for_status()
    with open(dst, "wb") as f:
        for chunk in r.iter_content(chunk_size=1024 * 512):
            if chunk:
                f.write(chunk)
    return os.path.getsize(dst)


start = time.time()
while True:
    if time.time() - start > 1200:
        print("POLL_TIMEOUT"); sys.exit(2)
    r = bmg._call_api(bmg._DEFAULT_ENDPOINT, cfg["provider"], cfg["service"], cfg["version"],
                      cfg["query_action"], {"JobId": JOB}, token)
    status = r.get("Status", "")
    code = r.get("JobStatusCode")
    print(f"[poll] status={status} code={code} elapsed={int(time.time()-start)}s", file=sys.stderr)
    if status == "DONE" or code == 5:
        break
    if status == "FAIL" or code == 4:
        print("JOB_FAIL", json.dumps(r, ensure_ascii=False)[:600]); sys.exit(1)
    time.sleep(8)

saved = []
for it in (r.get("ResultFile3Ds") or []):
    t = (it.get("Type") or "").upper()
    url = it.get("Url")
    prev = it.get("PreviewImageUrl")
    if t == "GLB" and url:
        d = os.path.join(OUT, NAME + ".glb"); download(url, d); saved.append(d)
    elif t == "OBJ" and url:
        d = os.path.join(OUT, NAME + "_obj.zip"); download(url, d); saved.append(d)
    if prev:
        d = os.path.join(OUT, NAME + "_preview.png"); download(prev, d); saved.append(d)

T = ('<!DOCTYPE html><html lang="zh"><head><meta charset="utf-8">'
     '<meta name="viewport" content="width=device-width,initial-scale=1">'
     '<title>张三丰 3D</title><style>html,body{margin:0;height:100%;background:#12141a;}'
     'model-viewer{width:100%;height:100%;}</style></head><body>'
     '<script type="module" src="../model-viewer.min.js"></script>'
     '<model-viewer src="zf.glb" camera-controls auto-rotate shadow-intensity="1" '
     'exposure="1" interaction-prompt="none" alt="张三丰"></model-viewer></body></html>')
with io.open(os.path.join(OUT, NAME + "_viewer.html"), "w", encoding="utf-8") as f:
    f.write(T)
saved.append(os.path.join(OUT, NAME + "_viewer.html"))

print("DONE")
print(json.dumps({"job_id": JOB, "files": saved, "credits": r.get("ResultCreditConsumed")},
                 ensure_ascii=False, indent=2))
