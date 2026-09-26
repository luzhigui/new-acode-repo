# -*- coding: utf-8 -*-
"""Rename 3 new art files to name-first, then remove bottom-right watermark."""
import os
from PIL import Image

D = os.path.dirname(os.path.abspath(__file__))
CAN = os.path.join(D, "_src", "v2候选")

renames = {
    "国风写实武侠游戏卡牌全身立绘_灭绝师太_倚天屠龙记峨眉派掌门_2026-09-25T16-21-21.png":
        "灭绝师太-剃度尼姑中年-立绘-v4.png",
    "国风性感写实武侠游戏卡牌全身立绘_周芷若_倚天屠龙记峨眉女侠_2026-09-25T16-21-20.png":
        "周芷若-露肩高开衩加料-性感向-v4.png",
    "国风性感写实武侠游戏卡牌全身立绘_黑化版周芷若_倚天屠龙记峨_2026-09-25T16-21-21.png":
        "周芷若-黑化黑金加料-性感向-v4.png",
}

for old, new in renames.items():
    op, np_ = os.path.join(CAN, old), os.path.join(CAN, new)
    if os.path.exists(op):
        os.replace(op, np_)
        print("renamed:", new)
    elif os.path.exists(np_):
        print("already named:", new)
    else:
        print("MISSING:", old)

for new in renames.values():
    p = os.path.join(CAN, new)
    if not os.path.exists(p):
        continue
    im = Image.open(p).convert("RGB")
    W, H = im.size
    box = (W - 170, H - 95, W, H)
    patch = im.crop((W - 520, H - 95, W - 350, H)).resize((box[2] - box[0], box[3] - box[1]))
    im.paste(patch, box[:2])
    im.save(p, optimize=True)
    print("cleaned:", new, W, H, os.path.getsize(p))
