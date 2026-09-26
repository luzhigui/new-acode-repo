# -*- coding: utf-8 -*-
"""Watermark removal for smooth backgrounds using a feathered patch from directly above."""
import os
from PIL import Image, ImageDraw, ImageFilter

D = os.path.dirname(os.path.abspath(__file__))
RAWD = os.path.join(D, "_src", "v2候选", "raw2")
OUTD = os.path.join(D, "_src", "v2候选")


def target_for(name):
    if "灭绝" in name:
        return "灭绝师太-剃度尼姑中年-立绘-v4.png"
    if "黑化" in name and "周芷若" in name:
        return "周芷若-黑化黑金加料-性感向-v4.png"
    if "周芷若" in name:
        return "周芷若-露肩高开衩加料-性感向-v4.png"
    return None


for fn in sorted(os.listdir(RAWD)):
    if not fn.lower().endswith(".png"):
        continue
    tgt = target_for(fn)
    if not tgt:
        print("skip:", fn)
        continue
    im = Image.open(os.path.join(RAWD, fn)).convert("RGB")
    W, H = im.size
    x0, y0, x1, y1 = W - 140, H - 100, W - 1, H - 1
    w, h = x1 - x0, y1 - y0
    patch = im.crop((x0, y0 - h - 4, x1, y0 - 4)).resize((w, h))
    mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mask).rectangle([10, 10, w - 6, h - 6], fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(5))
    im.paste(patch, (x0, y0), mask)
    im.save(os.path.join(OUTD, tgt), optimize=True)
    print("filled ->", tgt, W, H, os.path.getsize(os.path.join(OUTD, tgt)))
