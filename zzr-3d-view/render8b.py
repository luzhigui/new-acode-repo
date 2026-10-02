"""从 GLB 渲染标准八视图 v2：正交投影 + 全视图统一缩放 + 自动识别正面。
零 AI 重绘：所有视图来自同一模型，几何绝对自洽，脸零漂移。
"""
import json, struct, sys, os, math, io, time
import numpy as np
import DracoPy
from PIL import Image

W, H = 768, 1024
BG = 128
PAD = 0.94
FOVY = None  # 正交


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
    for node in g['nodes']:
        if node.get('mesh') == 0:
            if 'matrix' in node:
                M = np.array(node['matrix'], dtype=np.float64).reshape(4, 4)
                pts = pts @ M[:3, :3].T + M[:3, 3]
                nrm = nrm @ M[:3, :3].T
            else:
                if 'rotation' in node:
                    R = quat_to_mat(node['rotation'])
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
    return np.asarray(Image.open(io.BytesIO(b[o:o + bv['byteLength']])).convert('RGB'))


def view_rot(az_deg, el_deg):
    a = math.radians(az_deg); e = math.radians(el_deg)
    if abs(el_deg) > 80:
        up = np.array([0.0, 0.0, -1.0])
    else:
        up = np.array([0.0, 1.0, 0.0])
    cy = math.sin(e)
    rad = math.cos(e)
    eye_dir = np.array([math.sin(a) * rad, cy, math.cos(a) * rad])  # 相机相对中心方向
    f = -eye_dir
    f = f / np.linalg.norm(f)
    s = np.cross(f, up)
    if np.linalg.norm(s) < 1e-8:
        s = np.cross(f, np.array([1.0, 0.0, 0.0]))
    s = s / np.linalg.norm(s)
    u = np.cross(s, f)
    return np.stack([s, u, -f])       # 世界 -> 相机


def render(pts, faces, nrm, uv, tex, R, scale, center2d):
    P = pts @ R.T                     # 相机空间
    N = nrm @ R.T
    d = -P[:, 2]
    sx = P[:, 0] * scale + center2d[0]
    sy = -P[:, 1] * scale + center2d[1]

    img = np.full((H, W, 3), BG, dtype=np.float32)
    zb = np.full((H, W), 1e18, dtype=np.float32)
    L = np.array([0.30, 0.55, 0.78]); L = L / np.linalg.norm(L)
    Nc = np.clip(N @ L, 0, 1) * 0.5 + 0.5
    th, tw = tex.shape[0], tex.shape[1]
    tx = tex.astype(np.float32)
    fi = faces

    for t0, t1, t2 in fi:
        x0, y0, x1, y1, x2, y2 = sx[t0], sy[t0], sx[t1], sy[t1], sx[t2], sy[t2]
        z0, z1, z2 = d[t0], d[t1], d[t2]
        minx = int(max(0, math.floor(min(x0, x1, x2))))
        maxx = int(min(W - 1, math.ceil(max(x0, x1, x2))))
        miny = int(max(0, math.floor(min(y0, y1, y2))))
        maxy = int(min(H - 1, math.ceil(max(y0, y1, y2))))
        if minx > maxx or miny > maxy:
            continue
        pw = maxx - minx + 1; ph = maxy - miny + 1
        if pw * ph <= 2:
            px = minx + (pw >> 1); py = miny + (ph >> 1)
            zz = (z0 + z1 + z2) / 3.0
            if zz < zb[py, px]:
                zb[py, px] = zz
                uu = (uv[t0, 0] + uv[t1, 0] + uv[t2, 0]) / 3.0
                vv = (uv[t0, 1] + uv[t1, 1] + uv[t2, 1]) / 3.0
                col = int(uu * (tw - 1) + 0.5); row = int(vv * (th - 1) + 0.5)
                sh = (Nc[t0] + Nc[t1] + Nc[t2]) / 3.0
                img[py, px] = tx[row, col] * sh
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
    """头部区域肤色像素占比 —— 用来判断哪一面是脸"""
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
    global W, H, PAD
    glb_path = sys.argv[1]
    outdir = sys.argv[2]
    if len(sys.argv) > 4:              # 可选：python render8b.py in.glb outdir 2048 2732 [pad]
        W = int(sys.argv[3]); H = int(sys.argv[4])
    if len(sys.argv) > 5:
        PAD = float(sys.argv[5])
    print(f'画布 {W}x{H}  留边 PAD={PAD}')
    os.makedirs(outdir, exist_ok=True)
    for f in os.listdir(outdir):          # 清掉上一版的旧图（含多出来的左后/右后45）
        if f.endswith('.jpg'):
            os.remove(os.path.join(outdir, f))
    g, b = load_glb(glb_path)
    pts, faces, nrm, uv = decode_mesh(g, b)
    tex = decode_texture(g, b)
    print('verts', pts.shape, 'faces', faces.shape, 'tex', tex.shape)
    lo, hi = pts.min(0), pts.max(0)
    print('bbox min', np.round(lo, 3), 'max', np.round(hi, 3))
    center = (lo + hi) / 2.0
    P0 = pts - center

    # 标准八视图槽位：正视 / 后视 / 左视 / 右视 / 左45° / 右45° / 顶图 / 俯图
    # （没有"左后45 / 右后45"——那是环绕八向，不是八视图槽位）
    AZ = [0, 45, 90, 180, 270, 315]
    # 1) 统一缩放：取所有视角都能装下的最大缩放
    scale = None
    for az in AZ:
        R = view_rot(az, 0.0)
        Q = P0 @ R.T
        ex = Q[:, 0].max() - Q[:, 0].min()
        ey = Q[:, 1].max() - Q[:, 1].min()
        s = PAD * min(W / ex, H / ey)
        scale = s if scale is None else min(scale, s)
    for el in (89.0, -89.0):
        R = view_rot(0.0, el)
        Q = P0 @ R.T
        ex = Q[:, 0].max() - Q[:, 0].min()
        ey = Q[:, 1].max() - Q[:, 1].min()
        scale = min(scale, PAD * min(W / ex, H / ey))
    print('统一缩放 scale =', round(scale, 1), 'px/unit; 人物高 =',
          round((hi[1] - lo[1]) * scale), 'px /', H)

    # 2) 先渲染 8 个环绕角，判断哪面是脸
    tmp = {}
    for az in AZ:
        R = view_rot(az, 0.0)
        Q = P0 @ R.T
        cx = (Q[:, 0].min() + Q[:, 0].max()) / 2
        cy = (Q[:, 1].min() + Q[:, 1].max()) / 2
        c2 = np.array([W / 2 - cx * scale, H / 2 + cy * scale])
        t0 = time.time()
        img, mask = render(pts - center, faces, nrm, uv, tex, R, scale, c2)
        tmp[az] = (img, mask)
        print(f'  az={az:3d} 肤色像素={skin_score(img, mask):6d}  覆盖={mask.mean()*100:5.2f}%  {time.time()-t0:5.1f}s')

    front_az = max(AZ, key=lambda a: skin_score(*tmp[a]))
    print('判定正面方位角 =', front_az)

    # 左右按"相机在角色哪一侧"命名：角色面朝 +Z 时，其左手侧为 +X
    names = {0: '01_正视', 180: '02_后视', 90: '03_左视', 270: '04_右视',
             45: '05_左45度', 315: '06_右45度'}
    for az in AZ:
        rel = (az - front_az) % 360
        nm = names[rel]
        img, mask = tmp[az]
        Image.fromarray(img).save(os.path.join(outdir, nm + '.jpg'), quality=95)

    for nm, el in (('07_顶图_正上方', 89.0), ('08_俯图_正下方', -89.0)):
        R = view_rot(front_az, el)
        Q = P0 @ R.T
        cx = (Q[:, 0].min() + Q[:, 0].max()) / 2
        cy = (Q[:, 1].min() + Q[:, 1].max()) / 2
        c2 = np.array([W / 2 - cx * scale, H / 2 + cy * scale])
        img, mask = render(pts - center, faces, nrm, uv, tex, R, scale, c2)
        Image.fromarray(img).save(os.path.join(outdir, nm + '.jpg'), quality=95)
        print(f'  {nm} 覆盖={mask.mean()*100:5.2f}%')
    print('输出目录', outdir)


if __name__ == '__main__':
    main()
