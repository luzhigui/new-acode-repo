# -*- coding: utf-8 -*-
import importlib.util, json, os, sys

SCRIPT = r"D:/workbuddy/resources/app.asar.unpacked/resources/plugins/workbuddy-builtin/skills/buddy-multimodal-generation/scripts/buddy-multimodal-generation.py"
spec = importlib.util.spec_from_file_location("bmg", SCRIPT)
bmg = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bmg)

with open(os.path.join(os.path.dirname(__file__), "_tok.txt"), "r") as f:
    token = f.read().strip()
cfg = bmg._PROVIDER_MAP["3d"]
try:
    r = bmg._call_api(
        bmg._DEFAULT_ENDPOINT, cfg["provider"], cfg["service"], cfg["version"],
        cfg["query_action"], {"JobId": "1495100748882395136"}, token,
    )
    print("PROBE_OK")
    print(json.dumps(r, ensure_ascii=False)[:1000])
except SystemExit:
    print("PROBE_FAILED_SYSEXIT")
except Exception as e:
    print("PROBE_EXCEPTION", repr(e))
