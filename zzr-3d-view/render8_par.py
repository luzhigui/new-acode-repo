"""标准八视图并行渲染（24 核并行，供大画布使用）
用法: python render8_par.py model.glb outdir [W] [H] [PAD] [FRONT_AZ]

槽位：01 正视 / 02 后视 / 03 左视 / 04 右视 / 05 左45 / 06 右45 / 07 顶图 / 08 俯图
零 AI 重绘：全部来自同一模型，几何绝对自洽，脸零漂移。
"""
import os, sys, time
import numpy as np
from PIL import Image
import multiprocessing as mp

from render8_any import (load_glb, decode_mesh, decode_texture, view_rot, render,
                         skin_score)

W, H = 2048, 2732
PAD = 0.97
TEX_MAX = 2048


def _worker(job):
    (glb, out, az, el, scale, cx, cy, w, h, texmax, want_skin) = job
    import render8_any as R8
    R8.TEX_MAX = texmax
    g, b = R8.load_glb(glb)
    pts, faces, nrm, uv = R8.decode_mesh(g, b)
    tex = R8.decode_texture(g, b)
    center = (pts.min(0) + pts.max(0)) / 2.0
    R = R8.view_rot(az, el)
    img, mask = R8.render(pts - center, faces, nrm, uv, tex, R, scale,
                          np.array([cx, cy]), w, h)
    Image.fromarray(img).save(out, quality=95)
    sk = R8.skin_score(img, mask) if want_skin else 0
    return (os.path.basename(out), round(float(mask.mean() * 100), 2), sk)


def main():
    glb = sys.argv[1]
    outdir = sys.argv[2]
    w = int(sys.argv[3]) if len(sys.argv) > 3 else W
    h = int(sys.argv[4]) if len(sys.argv) > 4 else H
    pad = float(sys.argv[5]) if len(sys.argv) > 5 else PAD
    front_az = float(sys.argv[6]) if len(sys.argv) > 6 else 0.0
    os.makedirs(outdir, exist_ok=True)
    for f in os.listdir(outdir):
        if f.lower().endswith('.jpg'):
            os.remove(os.path.join(outdir, f))

    g, b = load_glb(glb)
    pts, faces, nrm, uv = decode_mesh(g, b)
    print('verts %s faces %s  画布 %dx%d PAD=%.2f 正面方位角=%g'
          % (pts.shape, faces.shape, w, h, pad, front_az), flush=True)
    lo, hi = pts.min(0), pts.max(0)
    center = (lo + hi) / 2.0
    P0 = pts - center

    AZ = [0, 45, 90, 180, 270, 315]
    views = [(az, 0.0) for az in AZ] + [(front_az, 89.0), (front_az, -89.0)]
    scale = None
    for az, el in views:
        Q = P0 @ view_rot(az, el).T
        ex = Q[:, 0].max() - Q[:, 0].min()
        ey = Q[:, 1].max() - Q[:, 1].min()
        s = pad * min(w / ex, h / ey)
        scale = s if scale is None else min(scale, s)
    print('统一缩放 %.1f px/unit  人物高约 %d px / %d'
          % (scale, (hi[1] - lo[1]) * scale, h), flush=True)

    names = {0: '01_正视', 180: '02_后视', 90: '03_左视', 270: '04_右视',
             45: '05_左45度', 315: '06_右45度'}
    jobs = []
    for az, el in views:
        Q = P0 @ view_rot(az, el).T
        cx = (Q[:, 0].min() + Q[:, 0].max()) / 2
        cy = (Q[:, 1].min() + Q[:, 1].max()) / 2
        c2 = (w / 2 - cx * scale, h / 2 + cy * scale)
        if el == 89.0:
            nm = '07_顶图_正上方'
        elif el == -89.0:
            nm = '08_俯图_正下方'
        else:
            nm = names[(az - front_az) % 360]
        jobs.append((glb, os.path.join(outdir, nm + '.jpg'), az, el, scale,
                     c2[0], c2[1], w, h, TEX_MAX, el == 0.0))

    t0 = time.time()
    nproc = min(len(jobs), max(1, (os.cpu_count() or 4)))
    ctx = mp.get_context('spawn')
    with ctx.Pool(nproc) as pool:
        for res in pool.imap_unordered(_worker, jobs):
            print('  %-16s 覆盖=%5.2f%%  肤色=%d' % res, flush=True)
    print('共 %.0f 秒，输出目录 %s' % (time.time() - t0, outdir), flush=True)


if __name__ == '__main__':
    main()
