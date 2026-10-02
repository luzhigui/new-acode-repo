# -*- coding: utf-8 -*-
"""
张无忌 8 视图 → 混元 3.1 上传包 预处理 v2（纯几何，无 AI 修图）。
- 文字去除：把顶部/底部文字带「涂成背景色」(垂直渐变)，不裁切 -> 不伤冠冕。
- 归一化：冠顶自动测(中列亮像素首行) + 脚底按构图定 -> 统一人物高度 -> 3:4 画布 768x1024。
"""
import os
import numpy as np
from PIL import Image, ImageDraw

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(BASE, "raw")
OUT = os.path.join(BASE, "prep")
os.makedirs(OUT, exist_ok=True)

CW, CH = 768, 1024
CROWN_Y = 0.07 * CH
CHAR_H = 0.86 * CH
CENTER_X = CW / 2

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
# 文字带涂底色比例 (top, bottom)
FILL = {"zw_front": (0.055, 0.02), "zw_side": (0.058, 0.03), "zw_side3": (0.062, 0.045)}
FEET = {"zw_front": 0.97, "zw_side": 0.96, "zw_side3": 0.93, "zw_rear": 1.03}
CLEAN = {"zw_front_1", "zw_sideR", "zw_side_1", "zw_back"}


def corner_bg(a, p):
    return np.concatenate([a[:p, :p].reshape(-1, 3), a[:p, -p:].reshape(-1, 3),
                           a[-p:, :p].reshape(-1, 3), a[-p:, -p:].reshape(-1, 3)]).mean(0)


def fill_bands(im):
    """把文字带涂成背景色(垂直渐变)，返回涂抹后的图。"""
    name = im.info.get("_name")
    t, b = FILL.get(name, (0.0, 0.0))
    if t == 0 and b == 0:
        return im
    a = np.asarray(im).astype(float).copy()
    h, w, _ = a.shape
    p = max(3, int(min(h, w) * 0.015))
    # 逐列取“文字带下方一行(避开中心人物)”的底色，向上延展
    ref = min(h - 1, int(h * t) + max(2, int(h * 0.004)))
    mc = max(2, int(w * 0.12))
    side = np.concatenate([a[ref:ref + 2, :mc], a[ref:ref + 2, -mc:]], axis=1)
    below = side.reshape(-1, 3).mean(0)
    top = corner_bg(a, p)
    # 顶部带：0..tH 垂直渐变 top->below
    tH = int(h * t)
    if tH > 0:
        u = np.linspace(0, 1, tH)[:, None, None]
        band = top[None, None, :] * (1 - u) + below[None, None, :] * u
        a[:tH, :, :] = np.repeat(band, w, axis=1)
    # 底部带：bH..h，用下方角点底色
    bH = int(h * (1 - b))
    if b > 0:
        bot = np.concatenate([a[-p:, :p].reshape(-1, 3), a[-p:, -p:].reshape(-1, 3)]).mean(0)
        ref2 = max(0, bH - max(2, int(h * 0.004)))
        side2 = np.concatenate([a[ref2:ref2 + 2, :mc], a[ref2:ref2 + 2, -mc:]], axis=1)
        above = side2.reshape(-1, 3).mean(0)
        u = np.linspace(0, 1, h - bH)[:, None, None]
        band = above[None, None, :] * (1 - u) + bot[None, None, :] * u
        a[bH:, :, :] = np.repeat(band, w, axis=1)
    return Image.fromarray(a.astype(np.uint8), "RGB")


def crown_top(a, lt=90, c0=0.35, c1=0.65, minc=3, search=0.25):
    lum = a.mean(2); m = lum > lt
    h, w = m.shape
    seg = m[:int(h * search), int(w * c0):int(w * c1)]
    rows = np.where(seg.sum(1) >= minc)[0]
    return int(rows[0]) if len(rows) else 0


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
    t = np.linspace(0, 1, CH)[:, None, None]
    grad = top[None, None, :] * (1 - t) + bot[None, None, :] * t
    return np.repeat(grad, CW, axis=1)


print(f"{'out':16} {'src':12} {'WxH':>10}  {'crownT':>7}{'feetB':>7}  crownT%  feet%")
report = []
for out_name, src, label in ORDER:
    im = Image.open(os.path.join(RAW, src + ".jpg")).convert("RGB")
    im.info["_name"] = src
    im = fill_bands(im)
    w, h = im.size
    a = np.asarray(im).astype(int)
    if src in CLEAN:
        L, T, R, B = rowmedian_bbox(a)
    else:
        ct = crown_top(a)
        T = ct
        B = int(h * FEET[src])
        mb = np.where(a.mean(2) > 90)
        L = R = None
        # 水平中心用亮像素列范围
        lum = a.mean(2); sat = a.max(2) - a.min(2); m = (lum > 100) | (sat > 70)
        cols = np.where(m.sum(0) > h * 0.03)[0]
        L, R = (int(cols[0]), int(cols[-1])) if len(cols) else (int(w * 0.3), int(w * 0.7))
    cx = (L + R) / 2
    scale = CHAR_H / max(1, (B - T))
    nw, nh = max(1, round(w * scale)), max(1, round(h * scale))
    rs = im.resize((nw, nh), Image.LANCZOS)
    ox = round(CENTER_X - cx * scale)
    oy = round(CROWN_Y - T * scale)
    canvas = Image.fromarray(bg_gradient(im).astype(np.uint8), "RGB")
    canvas.paste(rs, (ox, oy))
    canvas.save(os.path.join(OUT, out_name), quality=92)
    report.append((out_name, round(T / h, 3), round(B / h, 3), ox, oy))
    print(f"{out_name:16} {src:12} {w}x{h:<6}  {T:>7}{B:>7}  {round(T/h,3):>7}  {round(B/h,3):>7}")

# 复核成品
print("\n成品人物顶/底位置(应顶≈0.07 底≈0.93):")
for out_name, *_ in ORDER:
    a = np.asarray(Image.open(os.path.join(OUT, out_name)).convert("RGB")).astype(int)
    h, w, _ = a.shape
    lum = a.mean(2); sat = a.max(2) - a.min(2); m = (lum > 100) | (sat > 70)
    x0, x1 = int(w * 0.20), int(w * 0.80)
    rows = np.where(m[:, x0:x1].sum(1) > (x1 - x0) * 0.05)[0]
    t, b = (int(rows[0]), int(rows[-1])) if len(rows) else (-1, -1)
    print(f"  {out_name:16} 顶={round(t/h,3) if t>=0 else '-'}  底={round(b/h,3) if b>=0 else '-'}")
