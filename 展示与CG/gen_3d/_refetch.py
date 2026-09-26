# -*- coding: utf-8 -*-
"""Re-query finished 3D jobs and (re)download artifacts, always refreshing previews."""
import argparse
import importlib.util
import json
import os
import sys

SKILL_SCRIPTS = r"D:/workbuddy/resources/app.asar.unpacked/resources/plugins/workbuddy-builtin/skills/buddy-multimodal-generation/scripts"
SCRIPT = os.path.join(SKILL_SCRIPTS, "buddy-multimodal-generation.py")


def load_mod():
    spec = importlib.util.spec_from_file_location("bmg", SCRIPT)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def dl(requests, url, dst):
    r = requests.get(url, timeout=600, stream=True)
    r.raise_for_status()
    with open(dst, "wb") as f:
        for c in r.iter_content(chunk_size=1024 * 512):
            if c:
                f.write(c)
    return os.path.getsize(dst)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--token", required=True)
    ap.add_argument("--job", action="append", required=True, help="name:outdir:jobid")
    a = ap.parse_args()
    bmg = load_mod()
    requests = bmg.requests
    cfg = bmg._PROVIDER_MAP["3d"]
    ep = bmg._DEFAULT_ENDPOINT
    for spec in a.job:
        name, outdir, jid = spec.split(":")
        res = bmg._call_api(ep, cfg["provider"], cfg["service"], cfg["version"],
                            cfg["query_action"], {"JobId": jid}, a.token)
        os.makedirs(outdir, exist_ok=True)
        out = {"job": jid, "name": name, "status": res.get("Status"), "files": []}
        for it in (res.get("ResultFile3Ds") or []):
            t = (it.get("Type") or "").upper()
            if t == "GLB" and it.get("Url"):
                p = os.path.join(outdir, name + ".glb")
                if not os.path.exists(p):
                    dl(requests, it["Url"], p)
                out["files"].append(p)
            elif t == "OBJ" and it.get("Url"):
                p = os.path.join(outdir, name + "_obj.zip")
                if not os.path.exists(p):
                    dl(requests, it["Url"], p)
                out["files"].append(p)
            if it.get("PreviewImageUrl"):
                p = os.path.join(outdir, name + "_preview.png")
                dl(requests, it["PreviewImageUrl"], p)
                out["files"].append(p)
        print(json.dumps(out, ensure_ascii=False))


if __name__ == "__main__":
    main()
