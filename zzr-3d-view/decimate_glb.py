"""高面数 GLB → 网页可用 GLB：
  顶点聚类减面（保 UV/法线）+ 贴图降采样 + 归一化（身高 1.7m、脚底 y=0、水平居中）
用法: python decimate_glb.py in.glb out.glb [目标面数] [贴图边长]
"""
import json, struct, sys, os, io, time
import numpy as np
from PIL import Image


def load_glb(path):
    d = open(path, 'rb').read()
    total = struct.unpack('<I', d[8:12])[0]
    off = 12; js = None; bn = None
    while off < total:
        clen, ct = struct.unpack('<II', d[off:off+8])
        body = d[off+8:off+8+clen]
        if ct == 0x4E4F534A:
            js = json.loads(body.decode('utf-8'))
        else:
            bn = body
        off += 8 + clen
    return js, bn


def acc(g, b, i):
    a = g['accessors'][i]; bv = g['bufferViews'][a['bufferView']]
    dt = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16,
          5125: np.uint32, 5126: np.float32}[a['componentType']]
    n = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[a['type']]
    return np.frombuffer(b, dtype=dt, count=a['count']*n,
                         offset=bv.get('byteOffset', 0)+a.get('byteOffset', 0)).reshape(a['count'], n)


def quat_to_mat(q):
    x, y, z, w = q
    n = x*x + y*y + z*z + w*w
    s = 0.0 if n == 0 else 2.0/n
    return np.array([[1-s*(y*y+z*z), s*(x*y-z*w), s*(x*z+y*w)],
                     [s*(x*y+z*w), 1-s*(x*x+z*z), s*(y*z-x*w)],
                     [s*(x*z-y*w), s*(y*z+x*w), 1-s*(x*x+y*y)]])


def cluster(pos, nrm, uv, faces, N):
    lo, hi = pos.min(0), pos.max(0)
    span = hi - lo
    cell = span.max() / N
    dim = np.floor(span / cell).astype(np.int64) + 2
    q = np.floor((pos - lo) / cell).astype(np.int64)
    key = (q[:, 0]*dim[1] + q[:, 1])*dim[2] + q[:, 2]
    uniq, first, inv = np.unique(key, return_index=True, return_inverse=True)
    nv = len(uniq)
    newpos = np.zeros((nv, 3)); cnt = np.zeros(nv)
    np.add.at(newpos, inv, pos); np.add.at(cnt, inv, 1)
    newpos /= cnt[:, None]
    newnrm = np.zeros((nv, 3))
    np.add.at(newnrm, inv, nrm)
    ln = np.linalg.norm(newnrm, axis=1); ln[ln == 0] = 1
    newnrm /= ln[:, None]
    # UV 必须跟着位置一起平均，否则位置移动了、贴图坐标没动 -> 纹理整体错位
    # （跨 UV 岛时平均会串岛，故对离散度大的格回退到代表顶点 UV）
    newuv = np.zeros((nv, 2))
    np.add.at(newuv, inv, uv)
    newuv /= cnt[:, None]
    umin = np.full(nv, 1e9); umax = np.full(nv, -1e9)
    vmin = np.full(nv, 1e9); vmax = np.full(nv, -1e9)
    np.minimum.at(umin, inv, uv[:, 0]); np.maximum.at(umax, inv, uv[:, 0])
    np.minimum.at(vmin, inv, uv[:, 1]); np.maximum.at(vmax, inv, uv[:, 1])
    wild = (umax - umin > 0.08) | (vmax - vmin > 0.08)
    newuv[wild] = uv[first][wild]
    print('    UV 岛回退格数 %d / %d (%.1f%%)' % (wild.sum(), nv, wild.mean() * 100))
    nf = inv[faces]
    keep = (nf[:, 0] != nf[:, 1]) & (nf[:, 1] != nf[:, 2]) & (nf[:, 0] != nf[:, 2])
    nf = nf[keep]
    # 去掉完全重复的面
    srt = np.sort(nf, axis=1)
    _, uidx = np.unique(srt, axis=0, return_index=True)
    nf = nf[np.sort(uidx)]
    return newpos, newnrm, newuv, nf, nv


def main():
    src, dst = sys.argv[1], sys.argv[2]
    target_faces = int(sys.argv[3]) if len(sys.argv) > 3 else 300000
    tex_size = int(sys.argv[4]) if len(sys.argv) > 4 else 2048

    g, b = load_glb(src)
    prim = g['meshes'][0]['primitives'][0]
    pos = acc(g, b, prim['attributes']['POSITION']).astype(np.float64)
    nrm = acc(g, b, prim['attributes']['NORMAL']).astype(np.float64)
    uv = acc(g, b, prim['attributes']['TEXCOORD_0']).astype(np.float64)
    faces = acc(g, b, prim['indices']).astype(np.int64).reshape(-1, 3)
    print('原始 顶点 %d 面 %d' % (len(pos), len(faces)))

    for nd in g['nodes']:
        if nd.get('mesh') == 0 and 'rotation' in nd:
            R = quat_to_mat(nd['rotation'])
            pos = pos @ R.T; nrm = nrm @ R.T

    # 归一化：脚底 y=0，身高 1.70m，水平居中
    lo, hi = pos.min(0), pos.max(0)
    s = 1.70 / (hi[1] - lo[1])
    pos = (pos - np.array([(lo[0]+hi[0])/2, lo[1], (lo[2]+hi[2])/2])) * s
    print('归一化后 bbox %s ~ %s  身高 1.700' % (np.round(pos.min(0), 3), np.round(pos.max(0), 3)))

    # 二分搜 N
    loN, hiN = 64, 4096
    for _ in range(12):
        midN = (loN + hiN) // 2
        p, n_, u_, f_, nv = cluster(pos, nrm, uv, faces, midN)
        if len(f_) > target_faces:
            hiN = midN
        else:
            loN = midN
        if abs(len(f_) - target_faces) < target_faces*0.03:
            break
    p, n_, u_, f_, nv = cluster(pos, nrm, uv, faces, loN)
    print('减面后 顶点 %d 面 %d  (目标 %d, 网格 N=%d) 压缩比 %.1fx'
          % (len(p), len(f_), target_faces, loN, len(faces)/len(f_)))

    # 贴图
    imgs = []
    for i, im in enumerate(g['images']):
        bv = g['bufferViews'][im['bufferView']]
        raw = b[ bv.get('byteOffset', 0): bv.get('byteOffset', 0)+bv['byteLength'] ]
        img = Image.open(io.BytesIO(raw))
        if max(img.size) > tex_size:
            img = img.resize((tex_size, tex_size), Image.LANCZOS)
        buf = io.BytesIO()
        if i == 1:
            img.convert('RGB').save(buf, 'JPEG', quality=92, optimize=True)
            mime = 'image/jpeg'
        else:
            if img.mode not in ('RGB', 'RGBA'):
                img = img.convert('RGB')
            img.save(buf, 'PNG', optimize=True)
            mime = 'image/png'
        data = buf.getvalue()
        imgs.append((data, mime, img.size))
        print('  贴图%d %s -> %s %s  %.2fMB (原 %.2fMB)'
              % (i, im['name'][:28], img.size, mime.split('/')[1], len(data)/1048576, len(raw)/1048576))

    # 打包
    bin_parts = []
    views = []

    def add(data, target=None):
        while len(b''.join([])) % 4:
            pass
        pad = (-sum(len(x) for x in bin_parts)) % 4
        if pad:
            bin_parts.append(b'\x00'*pad)
        off = sum(len(x) for x in bin_parts)
        bin_parts.append(data)
        views.append({'buffer': 0, 'byteOffset': off, 'byteLength': len(data), 'target': target})
        return len(views)-1

    P = p.astype(np.float32)
    Nn = n_.astype(np.float32)
    U = u_.astype(np.float32)
    F = f_.astype(np.uint32).ravel()
    vP = add(P.tobytes(), 34962)
    vN = add(Nn.tobytes(), 34962)
    vU = add(U.tobytes(), 34962)
    vF = add(F.tobytes(), 34963)
    img_views = [add(d) for d, m, sz in imgs]

    js = {
        'asset': {'generator': 'gmd3d-decimate', 'version': '2.0'},
        'extensionsUsed': [e for e in g.get('extensionsUsed', []) if e == 'KHR_materials_specular'],
        'scene': 0,
        'scenes': [{'name': 'convert', 'nodes': [0]}],
        'nodes': [{'mesh': 0, 'name': 'node_0'}],
        'materials': g['materials'],
        'textures': g['textures'],
        'samplers': g['samplers'],
        'images': [{'bufferView': img_views[i], 'mimeType': imgs[i][1], 'name': g['images'][i]['name']}
                   for i in range(len(imgs))],
        'meshes': [{'name': 'node_0', 'primitives': [{
            'attributes': {'POSITION': 0, 'NORMAL': 1, 'TEXCOORD_0': 2},
            'indices': 3, 'material': 0}]}],
        'accessors': [
            {'bufferView': vP, 'componentType': 5126, 'count': len(P), 'type': 'VEC3',
             'min': [float(x) for x in P.min(0)], 'max': [float(x) for x in P.max(0)]},
            {'bufferView': vN, 'componentType': 5126, 'count': len(Nn), 'type': 'VEC3'},
            {'bufferView': vU, 'componentType': 5126, 'count': len(U), 'type': 'VEC2'},
            {'bufferView': vF, 'componentType': 5125, 'count': len(F), 'type': 'SCALAR'},
        ],
        'bufferViews': views,
        'buffers': [{'byteLength': sum(len(x) for x in bin_parts)}],
    }

    binblob = b''.join(bin_parts)
    jsblob = json.dumps(js, separators=(',', ':')).encode('utf-8')
    jsblob += b' ' * ((-len(jsblob)) % 4)
    binblob += b'\x00' * ((-len(binblob)) % 4)
    total = 12 + 8 + len(jsblob) + 8 + len(binblob)
    out = struct.pack('<III', 0x46546C67, 2, total)
    out += struct.pack('<II', len(jsblob), 0x4E4F534A) + jsblob
    out += struct.pack('<II', len(binblob), 0x004E4942) + binblob
    open(dst, 'wb').write(out)
    print('输出 %s  %.2fMB (原 %.2fMB)' % (dst, len(out)/1048576, os.path.getsize(src)/1048576))


if __name__ == '__main__':
    main()
