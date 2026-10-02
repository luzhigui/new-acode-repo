# -*- coding: utf-8 -*-
"""
张无忌 8 视图 → 混元 3.1 上传包 预处理（纯确定性几何操作，不用 AI 修图）。
步骤：去文字条 → 定冠顶/底边 → 按统一人物高度重定标 → 统一 3:4 画布(768x1024)+渐变补边。
"""
import os
import numpy as np
from PIL import Image

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(BASE, "raw")
OUT = os.path.join(BASE, "prep")
os.makedirs(OUT, exist_ok=True)

CANVAS_W, CANVAS_H = 768, 1024
CROWN_Y = 0.07 * CANVAS_H          # 冠顶目标 y
CHAR_H  = 0.86 * CANVAS_H          # 人物目标高度
CENTER_X = CANVAS_W / 2

# 输出顺序 + 视角标注
ORDER = [
    ("01_front_A.jpg", "zw_front_1", "正面-清版"),
    ("02_front_B.jpg", "zw_front",   "正面-带字版"),
    ("03_right.jpg",   "zw_sideR",   "右侧 3/4"),
    ("04_left_A.jpg",  "zw_side_1",  "左侧 A"),
    ("05_left_B.jpg",  "zw_side",    "左侧 B"),
    ("06_left_C.jpg",  "zw_side3",   "左侧 C"),
    ("07_back_A.jpg",  "zw_back",    "背面 A"),
    ("08_back_B.jpg",  "zw_rear",    "背面 B(近景)"),
]

# 去文字条比例 (top, bottom)
TEXT = {"zw_front": (0.10, 0.00), "zw_side": (0.14, 0.03), "zw_side3": (0.13, 0.06)}
# 渐变底图片的「底边(脚)」占裁后画面高度比例（目视标定，黑底图不用，走自动）
FEET_FRAC = {"zw_front": 0.97, "zw_side": 0.96, "zw_side3": 0.93, "zw_rear": 1.02}
CLEAN = {"zw_front_1", "zw_sideR", "zw_side_1", "zw_back"}


def text_crop(im, name):
    t, b = TEXT.get(name, (0.0, 0.0))
    w, h = im.size
    return im.crop((0, int(h * t), w, int(h * (1 - b))))


def load(name):
    im = Image.open(os.path.join(RAW, name + ".jpg")).convert("RGB")
    return text_crop(im, name)


def mask_bbox(a, lt=100, st=70, c0=0.12, c1=0.88, rowf=0.04):
    lum = a.mean(2); sat = a.max(2) - a.min(2)
    m = (lum > lt) | (sat > st)
    h, w = m.shape
    x0, x1 = int(w * c0), int(w * c1)
    rows = np.where(m[:, x0:x1].sum(1) > (x1 - x0) * rowf)[0]
    cols = np.where(m.sum(0) > h * 0.03)[0]
    if len(rows) == 0 or len(cols) == 0:
        return None
    return int(cols[0]), int(rows[0]), int(cols[-1]), int(rows[-1])


def rowmedian_bbox(a, thr=30, edge=0.12, min_frac=0.02):
    h, w = a.shape[:2]
    ew = max(2, int(w * edge))
    edges = np.concatenate([a[:, :ew], a[:, -ew:]], axis=1)
    bg = np.median(edges, axis=1)
    dist = np.sqrt(((a - bg[:, None, :]) ** 2).sum(2))
    m = dist > thr
    rows = np.where(m.sum(1) > w * min_frac)[0]
    cols = np.where(m.sum(0) > h * min_frac)[0]
    if len(rows) == 0 or len(cols) == 0:
        return None
    return int(cols[0]), int(rows[0]), int(cols[-1]), int(rows[-1])


def bg_gradient(im):
    a = np.asarray(im).astype(float); h, w, _ = a.shape
    p = max(3, int(min(h, w) * 0.02))
    top = np.concatenate([a[:p, :p].reshape(-1, 3), a[:p, -p:].reshape(-1, 3)]).mean(0)
    bot = np.concatenate([a[-p:, :p].reshape(-1, 3), a[-p:, -p:].reshape(-1, 3)]).mean(0)
    t = np.linspace(0, 1, CANVAS_H)[:, None, None]
    grad = (top[None, None, :] * (1 - t) + bot[None, None, :] * t)
    return np.repeat(grad, CANVAS_W, axis=1)


print(f"{'out':16} {'src':12} {'cropWxH':>10}  {'crownT':>7} {'feetB':>7}  {'offsetX':>8} {'offsetY':>8}")
report = []
for out_name, src, label in ORDER:
    im = load(src)
    w, h = im.size
    a = np.asarray(im).astype(int)
    if src in CLEAN:
        bb = rowmedian_bbox(a)
        L, T, R, B = bb
    else:
        mb = mask_bbox(a)
        L, T, R, _ = mb
        B = int(h * FEET_FRAC[src])
    cx = (L + R) / 2
    scale = CHAR_H / max(1, (B - T))
    nw, nh = max(1, round(w * scale)), max(1, round(h * scale))
    rs = im.resize((nw, nh), Image.LANCZOS)
    ox = round(CENTER_X - cx * scale)
    oy = round(CROWN_Y - T * scale)
    canvas = Image.fromarray(bg_gradient(im).astype(np.uint8), "RGB")
    canvas.paste(rs, (ox, oy))
    canvas.save(os.path.join(OUT, out_name), quality=92)
    report.append((out_name, src, w, h, T, B, ox, oy, round((B - T) * scale / CANVAS_H, 3)))
    print(f"{out_name:16} {src:12} {w}x{h:<6}  {T:>7} {B:>7}  {ox:>8} {oy:>8}")

print("\n输出人物高度占画布比例(应≈0.86):")
for r in report:
    print(f"  {r[0]:16} {r[8]}")
