# -*- coding: utf-8 -*-
"""Image-to-3D via the bundled buddy-multimodal-generation skill.

Downloads GLB + OBJ(zip) + preview PNG, and writes a model-viewer page.
Reuses the skill script's signing/polling so behaviour matches the official flow.
"""
import argparse
import base64
import importlib.util
import io
import json
import os
import sys

SKILL_SCRIPTS = r"D:/workbuddy/resources/app.asar.unpacked/resources/plugins/workbuddy-builtin/skills/buddy-multimodal-generation/scripts"
SCRIPT = os.path.join(SKILL_SCRIPTS, "buddy-multimodal-generation.py")

VIEWER_TPL = """<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>__NAME__ 3D</title>
<style>html,body{{margin:0;height:100%;background:#12141a;}}model-viewer{{width:100%;height:100%;}}</style>
</head>
<body>
<script type="module" src="../model-viewer.min.js"></script>
<model-viewer src="__NAME__.glb" camera-controls auto-rotate shadow-intensity="1"
  exposure="1" interaction-prompt="none" alt="__NAME__"></model-viewer>
</body>
</html>
"""


def load_mod():
    spec = importlib.util.spec_from_file_location("bmg", SCRIPT)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def download(requests, url, dst):
    r = requests.get(url, timeout=600, stream=True)
    r.raise_for_status()
    with open(dst, "wb") as f:
        for chunk in r.iter_content(chunk_size=1024 * 512):
            if chunk:
                f.write(chunk)
    return os.path.getsize(dst)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--token", required=True)
    ap.add_argument("--image", required=True)
    ap.add_argument("--name", required=True)
    ap.add_argument("--outdir", required=True)
    ap.add_argument("--no-pbr", action="store_true")
    a = ap.parse_args()

    bmg = load_mod()
    requests = bmg.requests

    with open(a.image, "rb") as f:
        b64 = base64.b64encode(f.read()).decode()

    body = {"Model": "3.1", "ImageBase64": b64}
    if not a.no_pbr:
        body["EnablePBR"] = True

    cfg = bmg._PROVIDER_MAP["3d"]
    endpoint = bmg._DEFAULT_ENDPOINT
    token = a.token

    print(json.dumps({"stage": "submit", "name": a.name}), file=sys.stderr)
    r = bmg._call_api(endpoint, cfg["provider"], cfg["service"], cfg["version"],
                      cfg["submit_action"], body, token)
    job_id = r.get("JobId")
    if not job_id:
        print(json.dumps({"error": "NO_JOB_ID", "name": a.name, "resp": r}, ensure_ascii=False))
        sys.exit(1)
    print(json.dumps({"stage": "submitted", "job_id": job_id, "name": a.name}), file=sys.stderr)

    result = bmg._poll_job(endpoint, cfg["provider"], cfg["service"], cfg["version"],
                           cfg["query_action"], job_id, token, 5, 600)

    os.makedirs(a.outdir, exist_ok=True)
    saved = {"job_id": job_id, "name": a.name, "status": result.get("Status"), "files": []}
    glb_name = None
    for it in (result.get("ResultFile3Ds") or []):
        t = (it.get("Type") or "").upper()
        url = it.get("Url")
        prev = it.get("PreviewImageUrl")
        if t == "GLB" and url:
            dst = os.path.join(a.outdir, a.name + ".glb")
            download(requests, url, dst)
            saved["files"].append(dst)
            glb_name = a.name + ".glb"
        elif t == "OBJ" and url:
            dst = os.path.join(a.outdir, a.name + "_obj.zip")
            download(requests, url, dst)
            saved["files"].append(dst)
        if prev:
            dst = os.path.join(a.outdir, a.name + "_preview.png")
            download(requests, prev, dst)
            saved["files"].append(dst)

    if glb_name:
        vp = os.path.join(a.outdir, a.name + "_viewer.html")
        with io.open(vp, "w", encoding="utf-8") as f:
            f.write(VIEWER_TPL.replace("__NAME__", a.name))
        saved["files"].append(vp)

    saved["credits"] = result.get("ResultCreditConsumed")
    print(json.dumps(saved, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
