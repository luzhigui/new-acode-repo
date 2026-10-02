"""从 GLB 直接渲染标准八视图（+顶视/俯视）。
零 AI 重绘：8 张全部来自同一个模型，几何绝对自洽、脸零漂移。
"""
import json, struct, sys, os, math, io, time
import numpy as np
import DracoPy
from PIL import Image

W, H = 768, 1024
BG = 128
CHAR_FRAC = 0.86          # 人物占画面高度比例
FOVY = math.radians(30.0)


# ---------- GLB ----------
def load_glb(path):
    with open(path, 'rb') as f:
        data = f.read()
    off = 12
    js = bin_ = None
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


def decode_mesh(g, b):
    prim = g['meshes'][0]['primitives'][0]
    ext = prim['extensions']['KHR_draco_mesh_compression']
    bv = g['bufferViews'][ext['bufferView']]
    o = bv.get('byteOffset', 0)
    m = DracoPy.decode(b[o:o + bv['byteLength']])
    pts = np.asarray(m.points, dtype=np.float64).reshape(-1, 3)
    faces = np.asarray(m.faces, dtype=np.int64).reshape(-1, 3)
    nrm = np.asarray(m.normals, dtype=np.float64).reshape(-1, 3)
    uv = np.asarray(m.tex_coord, dtype=np.float64).reshape(-1, 2)
    # 节点变换
    for node in g['nodes']:
        if node.get('mesh') == 0:
            R = np.eye(3)
            if 'rotation' in node:
                R = quat_to_mat(node['rotation'])
            if 'matrix' in node:
                M = np.array(node['matrix'], dtype=np.float64).reshape(4, 4)
                pts = pts @ M[:3, :3].T + M[:3, 3]
                nrm = nrm @ M[:3, :3].T
            else:
                pts = pts @ R.T
                nrm = nrm @ R.T
                if 'scale' in node:
                    pts = pts * np.array(node['scale'])
                if 'translation' in node:
                    pts = pts + np.array(node['translation'])
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
    return np.asarray(im)


# ---------- 相机 ----------
def look_at(eye, target, up):
    f = target - eye
    f = f / np.linalg.norm(f)
    s = np.cross(f, up)
    if np.linalg.norm(s) < 1e-8:
        s = np.cross(f, np.array([0.0, 0.0, 1.0]))
    s = s / np.linalg.norm(s)
    u = np.cross(s, f)
    R = np.stack([s, u, -f])          # 世界 -> 相机
    return R, -R @ eye


def render(pts, faces, nrm, uv, tex, eye, target, up, W=W, H=H):
    R, t = look_at(eye, target, up)
    P = pts @ R.T + t                    # 相机空间（相机看 -Z）
    N = nrm @ R.T
    f = (H / 2) / math.tan(FOVY / 2)
    d = -P[:, 2]
    d = np.maximum(d, 1e-6)
    sx = f * P[:, 0] / d + W / 2
    sy = -f * P[:, 1] / d + H / 2

    # 可见性：面法线朝向相机
    a, bb, c = faces[:, 0], faces[:, 1], faces[:, 2]
    fn = np.cross(P[bb] - P[a], P[c] - P[a])
    cen = (P[a] + P[bb] + P[c]) / 3.0
    vis = np.einsum('ij,ij->i', fn, cen) < 0
    fi = faces[vis]

    img = np.full((H, W, 3), BG, dtype=np.float32)
    zb = np.full((H, W), 1e18, dtype=np.float32)
    L = np.array([0.35, 0.55, 0.76])
    L = L / np.linalg.norm(L)
    Nc = np.clip(N @ L, 0, 1) * 0.55 + 0.45
    Nc = np.clip(Nc, 0, 1.35)

    th, tw = tex.shape[0], tex.shape[1]
    tx = tex.astype(np.float32)

    for t0, t1, t2 in fi:
        x0, y0, x1, y1, x2, y2 = sx[t0], sy[t0], sx[t1], sy[t1], sx[t2], sy[t2]
        z0, z1, z2 = d[t0], d[t1], d[t2]
        minx = int(max(0, math.floor(min(x0, x1, x2))))
        maxx = int(min(W - 1, math.ceil(max(x0, x1, x2))))
        miny = int(max(0, math.floor(min(y0, y1, y2))))
        maxy = int(min(H - 1, math.ceil(max(y0, y1, y2))))
        if minx > maxx or miny > maxy:
            continue
        area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0)
        if abs(area) < 1e-9:
            continue
        pw = maxx - minx + 1
        ph = maxy - miny + 1
        if pw * ph <= 2:
            px = minx + (pw >> 1)
            py = miny + (ph >> 1)
            zz = (z0 + z1 + z2) / 3.0
            if zz < zb[py, px]:
                zb[py, px] = zz
                uu = (uv[t0, 0] + uv[t1, 0] + uv[t2, 0]) / 3.0
                vv = (uv[t0, 1] + uv[t1, 1] + uv[t2, 1]) / 3.0
                col = int(uu * (tw - 1) + 0.5)
                row = int(vv * (th - 1) + 0.5)
                sh = (Nc[t0] + Nc[t1] + Nc[t2]) / 3.0
                img[py, px] = tx[row, col] * sh
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
        zz = w0 * z0 + w1 * z1 + w2 * z2
        zz = np.where(inside, zz, 1e18)
        sub_z = zb[miny:maxy + 1, minx:maxx + 1]
        win = inside & (zz < sub_z)
        if not win.any():
            continue
        ii, jj = np.nonzero(win)
        w0w, w1w, w2w = w0[ii, jj], w1[ii, jj], w2[ii, jj]
        uu = w0w * uv[t0, 0] + w1w * uv[t1, 0] + w2w * uv[t2, 0]
        vv = w0w * uv[t0, 1] + w1w * uv[t1, 1] + w2w * uv[t2, 1]
        col = np.clip((uu * (tw - 1) + 0.5).astype(np.int32), 0, tw - 1)
        row = np.clip((vv * (th - 1) + 0.5).astype(np.int32), 0, th - 1)
        sh = w0w * Nc[t0] + w1w * Nc[t1] + w2w * Nc[t2]
        img[miny + ii, minx + jj] = tx[row, col] * sh[:, None]
        sub_z[ii, jj] = zz[ii, jj]
    return np.clip(img, 0, 255).astype(np.uint8), (zb < 1e17)


def ascii_art(mask, rows=44, cols=26):
    hh, ww = mask.shape
    out = []
    for r in range(rows):
        line = ''
        for c in range(cols):
            y0 = int(r * hh / rows); y1 = int((r + 1) * hh / rows)
            x0 = int(c * ww / cols); x1 = int((c + 1) * ww / cols)
            blk = mask[y0:y1, x0:x1]
            line += '#' if blk.mean() > 0.35 else ('+' if blk.mean() > 0.12 else '.')
        out.append(line)
    return '\n'.join(out)


VIEWS = [
    ('01_正视',     0.0,   0.0),
    ('02_右45度',  45.0,   0.0),
    ('03_右视',    90.0,   0.0),
    ('04_右后45度', 135.0,  0.0),
    ('05_后视',   180.0,   0.0),
    ('06_左后45度', 225.0,  0.0),
    ('07_左视',   270.0,   0.0),
    ('08_左45度',  315.0,   0.0),
    ('09_顶视_从上往下', 0.0, 89.0),
    ('10_俯视_从下往上', 0.0, -89.0),
]


def main():
    glb_path = sys.argv[1]
    outdir = sys.argv[2]
    os.makedirs(outdir, exist_ok=True)
    g, b = load_glb(glb_path)
    pts, faces, nrm, uv = decode_mesh(g, b)
    tex = decode_texture(g, b)
    print('verts', pts.shape, 'faces', faces.shape, 'tex', tex.shape)
    print('bbox min', np.round(pts.min(0), 3), 'max', np.round(pts.max(0), 3))

    lo, hi = pts.min(0), pts.max(0)
    center = (lo + hi) / 2.0
    height = hi[1] - lo[1]
    dist = (height / CHAR_FRAC) / (2 * math.tan(FOVY / 2))
    print('height', round(height, 3), 'dist', round(dist, 3))

    results = []
    for name, az, el in VIEWS:
        a = math.radians(az); e = math.radians(el)
        # 相机绕 Y 轴方位角，俯仰 el
        cy = center[1] + math.sin(e) * dist
        rad = math.cos(e) * dist
        eye = np.array([center[0] + math.sin(a) * rad, cy, center[2] + math.cos(a) * rad])
        up = np.array([0.0, 1.0, 0.0]) if abs(el) < 80 else np.array([0.0, 0.0, -1.0])
        t0 = time.time()
        img, mask = render(pts, faces, nrm, uv, tex, eye, center, up)
        p = os.path.join(outdir, name + '.jpg')
        Image.fromarray(img).save(p, quality=95)
        cov = mask.mean()
        results.append((name, p, img))
        print(f'{name:16s} cover={cov*100:5.2f}%  {time.time()-t0:5.1f}s')
    return results


if __name__ == '__main__':
    main()
