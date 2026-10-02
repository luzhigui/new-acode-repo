"""通用 GLB 软件渲染器（支持有/无 Draco），用于验收新生成模型的画质。
用法: python render_any.py model.glb outdir az1,az2,... [--head]
"""
import json, struct, sys, os, math, io, time
import numpy as np
from PIL import Image

W, H = 768, 1024
BG = 128
PAD = 0.94
TEX_MAX = 2048


def load_glb(path):
    with open(path, 'rb') as f:
        data = f.read()
    off = 12; js = bin_ = None
    total = struct.unpack('<I', data[8:12])[0]
    while off < total:
        clen, ctype = struct.unpack('<II', data[off:off + 8])
        body = data[off + 8:off + 8 + clen]
        if ctype == 0x4E4F534A:
            js = json.loads(body.decode('utf-8'))
        else:
            bin_ = body
        off += 8 + clen
    return js, bin_


def quat_to_mat(q):
    x, y, z, w = q
    n = x * x + y * y + z * z + w * w
    s = 0.0 if n == 0 else 2.0 / n
    return np.array([
        [1 - s * (y * y + z * z), s * (x * y - z * w), s * (x * z + y * w)],
        [s * (x * y + z * w), 1 - s * (x * x + z * z), s * (y * z - x * w)],
        [s * (x * z - y * w), s * (y * z + x * w), 1 - s * (x * x + y * y)],
    ], dtype=np.float64)


def acc(g, b, i):
    a = g['accessors'][i]; bv = g['bufferViews'][a['bufferView']]
    dt = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16,
          5125: np.uint32, 5126: np.float32}[a['componentType']]
    n = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[a['type']]
    flat = np.frombuffer(b, dtype=dt, count=a['count'] * n,
                         offset=bv.get('byteOffset', 0) + a.get('byteOffset', 0))
    return flat.reshape(a['count'], n)


def decode_mesh(g, b):
    prim = g['meshes'][0]['primitives'][0]
    if 'KHR_draco_mesh_compression' in prim.get('extensions', {}):
        import DracoPy
        ext = prim['extensions']['KHR_draco_mesh_compression']
        bv = g['bufferViews'][ext['bufferView']]
        o = bv.get('byteOffset', 0)
        m = DracoPy.decode(b[o:o + bv['byteLength']])
        pts = np.asarray(m.points, dtype=np.float64).reshape(-1, 3)
        faces = np.asarray(m.faces, dtype=np.int64).reshape(-1, 3)
        nrm = np.asarray(m.normals, dtype=np.float64).reshape(-1, 3)
        uv = np.asarray(m.tex_coord, dtype=np.float64).reshape(-1, 2)
    else:
        pos = acc(g, b, prim['attributes']['POSITION']).astype(np.float64)
        if 'indices' in prim:
            faces = acc(g, b, prim['indices']).astype(np.int64).reshape(-1, 3)
        else:
            faces = np.arange(len(pos), dtype=np.int64).reshape(-1, 3)
        pts = pos
        nrm = (acc(g, b, prim['attributes']['NORMAL']).astype(np.float64)
               if 'NORMAL' in prim['attributes'] else np.zeros_like(pos))
        uv = (acc(g, b, prim['attributes']['TEXCOORD_0']).astype(np.float64)
              if 'TEXCOORD_0' in prim['attributes'] else np.zeros((len(pos), 2)))
    # node 变换
    for node in g['nodes']:
        if node.get('mesh') == 0:
            if 'matrix' in node:
                M = np.array(node['matrix'], dtype=np.float64).reshape(4, 4)
                pts = pts @ M[:3, :3].T + M[:3, 3]
                nrm = nrm @ M[:3, :3].T
            else:
                if 'rotation' in node:
                    R = quat_to_mat(node['rotation'])
                    pts = pts @ R.T; nrm = nrm @ R.T
                if 'scale' in node:
                    pts = pts * np.array(node['scale'])
                if 'translation' in node:
                    pts = pts + np.array(node['translation'])
    if uv.max() > 1.5 or uv.min() < -0.5:   # 非归一化 UV（KHR_texture_transform 兜底）
        pass
    return pts, faces, nrm, uv


def decode_texture(g, b):
    mt = g['materials'][0]
    pbr = mt.get('pbrMetallicRoughness', {})
    if 'baseColorTexture' not in pbr:
        return None
    tex = g['textures'][pbr['baseColorTexture']['index']]
    src = tex.get('source')
    for k, v in (tex.get('extensions') or {}).items():
        if isinstance(v, dict) and 'source' in v:
            src = v['source']
    img = g['images'][src]
    bv = g['bufferViews'][img['bufferView']]
    o = bv.get('byteOffset', 0)
    im = Image.open(io.BytesIO(b[o:o + bv['byteLength']])).convert('RGB')
    if max(im.size) > TEX_MAX:
        im = im.resize((TEX_MAX, TEX_MAX), Image.LANCZOS)
    return np.asarray(im)


def view_rot(az_deg, el_deg):
    a = math.radians(az_deg); e = math.radians(el_deg)
    up = np.array([0.0, 0.0, -1.0]) if abs(el_deg) > 80 else np.array([0.0, 1.0, 0.0])
    eye = np.array([math.sin(a) * math.cos(e), math.sin(e), math.cos(a) * math.cos(e)])
    f = -eye; f = f / np.linalg.norm(f)
    s = np.cross(f, up)
    if np.linalg.norm(s) < 1e-8:
        s = np.cross(f, np.array([1.0, 0.0, 0.0]))
    s = s / np.linalg.norm(s)
    u = np.cross(s, f)
    return np.stack([s, u, -f])


def render(pts, faces, nrm, uv, tex, R, scale, center2d, out_w=W, out_h=H):
    P = pts @ R.T
    N = nrm @ R.T
    d = -P[:, 2]
    sx = P[:, 0] * scale + center2d[0]
    sy = -P[:, 1] * scale + center2d[1]
    img = np.full((out_h, out_w, 3), BG, dtype=np.float32)
    zb = np.full((out_h, out_w), 1e18, dtype=np.float32)
    L = np.array([0.30, 0.55, 0.78]); L = L / np.linalg.norm(L)
    Nc = np.clip(N @ L, 0, 1) * 0.5 + 0.5
    th, tw = tex.shape[0], tex.shape[1]
    tx = tex.astype(np.float32)
    for t0, t1, t2 in faces:
        x0, y0, x1, y1, x2, y2 = sx[t0], sy[t0], sx[t1], sy[t1], sx[t2], sy[t2]
        minx = int(max(0, math.floor(min(x0, x1, x2))))
        maxx = int(min(out_w - 1, math.ceil(max(x0, x1, x2))))
        miny = int(max(0, math.floor(min(y0, y1, y2))))
        maxy = int(min(out_h - 1, math.ceil(max(y0, y1, y2))))
        if minx > maxx or miny > maxy:
            continue
        z0, z1, z2 = d[t0], d[t1], d[t2]
        pw = maxx - minx + 1; ph = maxy - miny + 1
        if pw * ph <= 2:
            px = minx + (pw >> 1); py = miny + (ph >> 1)
            zz = (z0 + z1 + z2) / 3.0
            if zz < zb[py, px]:
                zb[py, px] = zz
                uu = (uv[t0, 0] + uv[t1, 0] + uv[t2, 0]) / 3.0
                vv = (uv[t0, 1] + uv[t1, 1] + uv[t2, 1]) / 3.0
                col = int(uu * (tw - 1) + 0.5); row = int(vv * (th - 1) + 0.5)
                img[py, px] = tx[row, col] * ((Nc[t0] + Nc[t1] + Nc[t2]) / 3.0)
            continue
        area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0)
        if abs(area) < 1e-9:
            continue
        xs = np.arange(minx, maxx + 1, dtype=np.float32) + 0.5
        ys = np.arange(miny, maxy + 1, dtype=np.float32) + 0.5
        X, Y = np.meshgrid(xs, ys)
        w0 = ((x1 - X) * (y2 - Y) - (x2 - X) * (y1 - Y)) / area
        w1 = ((x2 - X) * (y0 - Y) - (x0 - X) * (y2 - Y)) / area
        w2 = 1.0 - w0 - w1
        inside = (w0 >= 0) & (w1 >= 0) & (w2 >= 0)
        if not inside.any():
            continue
        zz = np.where(inside, w0 * z0 + w1 * z1 + w2 * z2, 1e18)
        sub_z = zb[miny:maxy + 1, minx:maxx + 1]
        win = inside & (zz < sub_z)
        if not win.any():
            continue
        ii, jj = np.nonzero(win)
        a0, a1, a2 = w0[ii, jj], w1[ii, jj], w2[ii, jj]
        uu = a0 * uv[t0, 0] + a1 * uv[t1, 0] + a2 * uv[t2, 0]
        vv = a0 * uv[t0, 1] + a1 * uv[t1, 1] + a2 * uv[t2, 1]
        col = np.clip((uu * (tw - 1) + 0.5).astype(np.int32), 0, tw - 1)
        row = np.clip((vv * (th - 1) + 0.5).astype(np.int32), 0, th - 1)
        sh = a0 * Nc[t0] + a1 * Nc[t1] + a2 * Nc[t2]
        img[miny + ii, minx + jj] = tx[row, col] * sh[:, None]
        sub_z[ii, jj] = zz[ii, jj]
    return np.clip(img, 0, 255).astype(np.uint8), (zb < 1e17)


def skin_score(img, mask):
    ys, xs = np.nonzero(mask)
    if len(ys) == 0:
        return 0
    top = ys.min(); hgt = ys.max() - ys.min()
    y1 = top + int(hgt * 0.20)
    reg = img[top:y1, xs.min():xs.max() + 1].astype(np.int16)
    R, G, B = reg[:, :, 0], reg[:, :, 1], reg[:, :, 2]
    sk = (R > 130) & (R > G + 8) & (G > B + 4) & (R - B > 20) & (R - B < 110)
    return int(sk.sum())


def main():
    glb = sys.argv[1]
    outdir = sys.argv[2]
    azs = [float(x) for x in sys.argv[3].split(',')] if len(sys.argv) > 3 else [0, 180]
    do_head = '--head' in sys.argv
    os.makedirs(outdir, exist_ok=True)
    g, b = load_glb(glb)
    t0 = time.time()
    pts, faces, nrm, uv = decode_mesh(g, b)
    tex = decode_texture(g, b)
    print('verts %s faces %s tex %s  (%.1fs)' % (pts.shape, faces.shape, tex.shape, time.time() - t0))
    lo, hi = pts.min(0), pts.max(0)
    print('bbox min', np.round(lo, 3), 'max', np.round(hi, 3))
    center = (lo + hi) / 2.0
    P0 = pts - center

    scale = None
    for az in azs:
        Q = P0 @ view_rot(az, 0.0).T
        ex = Q[:, 0].max() - Q[:, 0].min(); ey = Q[:, 1].max() - Q[:, 1].min()
        s = PAD * min(W / ex, H / ey)
        scale = s if scale is None else min(scale, s)
    print('scale %.1f px/unit -> 人物高约 %d px' % (scale, (hi[1] - lo[1]) * scale))

    for az in azs:
        R = view_rot(az, 0.0)
        Q = P0 @ R.T
        cx = (Q[:, 0].min() + Q[:, 0].max()) / 2
        cy = (Q[:, 1].min() + Q[:, 1].max()) / 2
        c2 = np.array([W / 2 - cx * scale, H / 2 + cy * scale])
        t = time.time()
        img, mask = render(pts - center, faces, nrm, uv, tex, R, scale, c2)
        sc = skin_score(img, mask)
        fn = os.path.join(outdir, 'az%03d.jpg' % az)
        Image.fromarray(img).save(fn, quality=95)
        print('  az=%3d 肤色=%6d 覆盖=%.1f%%  %.1fs -> %s' % (az, sc, mask.mean() * 100, time.time() - t, fn))

    if do_head:
        # 头部特写：把视野压到头顶往下 22% 身高
        R = view_rot(azs[0], 0.0)
        Q = P0 @ R.T
        ytop = Q[:, 1].max()
        ybot = lo[1] - center[1] + (hi[1] - lo[1]) * 0.78
        hfrac = ytop - ybot
        hs = PAD * min(1200 / (hfrac * 1.15), 900 / hfrac)
        cx = (Q[:, 0].min() + Q[:, 0].max()) / 2
        c2 = np.array([600 - cx * hs, 450 + (ytop + ybot) / 2 * hs])
        t = time.time()
        img, mask = render(pts - center, faces, nrm, uv, tex, R, hs, c2, 1200, 900)
        fn = os.path.join(outdir, 'head_%03d.jpg' % azs[0])
        Image.fromarray(img).save(fn, quality=95)
        print('  头部特写 覆盖=%.1f%% %.1fs -> %s' % (mask.mean() * 100, time.time() - t, fn))


if __name__ == '__main__':
    main()
