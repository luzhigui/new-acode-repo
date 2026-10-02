"""QEM 边折叠减面（保留原顶点位置，不做空间量化）+ KD-tree 传回 UV + 贴图降采样 + 归一化。
顶点聚类会把曲面量化成方块、法线跳变；QEM 只折叠边，表面依旧光滑。
用法: python simplify_glb.py in.glb out.glb [目标面数] [贴图边长]
"""
import json, struct, sys, os, io, time
import numpy as np
from scipy.spatial import cKDTree
from PIL import Image
import pyfqmr


def load_glb(path):
    d = open(path, 'rb').read()
    total = struct.unpack('<I', d[8:12])[0]
    off = 12; js = None; bn = None
    while off < total:
        clen, ct = struct.unpack('<II', d[off:off+8]); body = d[off+8:off+8+clen]
        if ct == 0x4E4F534A: js = json.loads(body.decode('utf-8'))
        else: bn = body
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


def vertex_normals(pos, faces):
    v0, v1, v2 = pos[faces[:, 0]], pos[faces[:, 1]], pos[faces[:, 2]]
    fn = np.cross(v1-v0, v2-v0)
    nrm = np.zeros_like(pos)
    for k in range(3):
        np.add.at(nrm, faces[:, k], fn)
    ln = np.linalg.norm(nrm, axis=1); ln[ln == 0] = 1
    return nrm/ln[:, None]


def main():
    src, dst = sys.argv[1], sys.argv[2]
    target_faces = int(sys.argv[3]) if len(sys.argv) > 3 else 300000
    tex_size = int(sys.argv[4]) if len(sys.argv) > 4 else 2048

    g, b = load_glb(src)
    prim = g['meshes'][0]['primitives'][0]
    pos = acc(g, b, prim['attributes']['POSITION']).astype(np.float64)
    uv = acc(g, b, prim['attributes']['TEXCOORD_0']).astype(np.float64)
    faces = acc(g, b, prim['indices']).astype(np.int64).reshape(-1, 3)
    print('原始 顶点 %d 面 %d' % (len(pos), len(faces)))
    for nd in g['nodes']:
        if nd.get('mesh') == 0 and 'rotation' in nd:
            pos = pos @ quat_to_mat(nd['rotation']).T

    # 归一化（原样保留比例，只改尺度/位置）
    lo, hi = pos.min(0), pos.max(0)
    s = 1.70/(hi[1]-lo[1])
    pos_n = (pos - np.array([(lo[0]+hi[0])/2, lo[1], (lo[2]+hi[2])/2])) * s

    t = time.time()
    sm = pyfqmr.Simplify()
    sm.setMesh(pos_n.astype(np.float32), faces.astype(np.int32))
    sm.simplify_mesh(target_count=target_faces, update_rate=100, aggressiveness=7,
                     max_iterations=200, verbose=False, preserve_border=False)
    np_pos, np_faces, np_norm = sm.getMesh()
    np_pos = np.asarray(np_pos, dtype=np.float64)
    np_faces = np.asarray(np_faces, dtype=np.int64).reshape(-1, 3)
    print('QEM 简化 -> 顶点 %d 面 %d  (%.1fs, 压缩比 %.1fx)'
          % (len(np_pos), len(np_faces), time.time()-t, len(faces)/len(np_faces)))

    # UV 传回：最近邻原始顶点（模型 UV 连续，最近邻即正确取值）
    t = time.time()
    tree = cKDTree(pos_n)
    dist, idx = tree.query(np_pos, k=1)
    np_uv = uv[idx]
    print('UV 最近邻传递 中位距离 %.6f  p99 %.6f  (%.1fs)'
          % (np.median(dist), np.percentile(dist, 99), time.time()-t))

    np_nrm = vertex_normals(np_pos, np_faces)

    # 贴图
    imgs = []
    for i, im in enumerate(g['images']):
        bv = g['bufferViews'][im['bufferView']]
        o = bv.get('byteOffset', 0)
        raw = b[o:o+bv['byteLength']]
        img = Image.open(io.BytesIO(raw))
        if max(img.size) > tex_size:
            img = img.resize((tex_size, tex_size), Image.LANCZOS)
        buf = io.BytesIO()
        if i == 1:
            img.convert('RGB').save(buf, 'JPEG', quality=92, optimize=True)
            mime = 'image/jpeg'
        else:
            if img.mode not in ('RGB', 'RGBA'): img = img.convert('RGB')
            img.save(buf, 'PNG', optimize=True); mime = 'image/png'
        data = buf.getvalue()
        imgs.append((data, mime))
        print('  贴图%d %s %s %.2fMB (原 %.2fMB)' % (i, img.size, mime.split('/')[1], len(data)/1048576, len(raw)/1048576))

    bin_parts = []; views = []

    def add(data, target=None):
        pad = (-sum(len(x) for x in bin_parts)) % 4
        if pad: bin_parts.append(b'\x00'*pad)
        off = sum(len(x) for x in bin_parts)
        bin_parts.append(data)
        views.append({'buffer': 0, 'byteOffset': off, 'byteLength': len(data), 'target': target})
        return len(views)-1

    P = np_pos.astype(np.float32); Nn = np_nrm.astype(np.float32)
    U = np_uv.astype(np.float32); F = np_faces.astype(np.uint32).ravel()
    vP = add(P.tobytes(), 34962); vN = add(Nn.tobytes(), 34962)
    vU = add(U.tobytes(), 34962); vF = add(F.tobytes(), 34963)
    ivs = [add(d) for d, m in imgs]

    js = {
        'asset': {'generator': 'gmd3d-simplify', 'version': '2.0'},
        'extensionsUsed': [e for e in g.get('extensionsUsed', []) if e == 'KHR_materials_specular'],
        'scene': 0, 'scenes': [{'name': 'convert', 'nodes': [0]}],
        'nodes': [{'mesh': 0, 'name': 'node_0'}],
        'materials': g['materials'], 'textures': g['textures'], 'samplers': g['samplers'],
        'images': [{'bufferView': ivs[i], 'mimeType': imgs[i][1], 'name': g['images'][i]['name']}
                   for i in range(len(imgs))],
        'meshes': [{'name': 'node_0', 'primitives': [{
            'attributes': {'POSITION': 0, 'NORMAL': 1, 'TEXCOORD_0': 2}, 'indices': 3, 'material': 0}]}],
        'accessors': [
            {'bufferView': vP, 'componentType': 5126, 'count': len(P), 'type': 'VEC3',
             'min': [float(x) for x in P.min(0)], 'max': [float(x) for x in P.max(0)]},
            {'bufferView': vN, 'componentType': 5126, 'count': len(Nn), 'type': 'VEC3'},
            {'bufferView': vU, 'componentType': 5126, 'count': len(U), 'type': 'VEC2'},
            {'bufferView': vF, 'componentType': 5125, 'count': len(F), 'type': 'SCALAR'}],
        'bufferViews': views,
        'buffers': [{'byteLength': sum(len(x) for x in bin_parts)}],
    }
    binblob = b''.join(bin_parts)
    jsblob = json.dumps(js, separators=(',', ':')).encode('utf-8')
    jsblob += b' '*((-len(jsblob)) % 4)
    binblob += b'\x00'*((-len(binblob)) % 4)
    total = 12+8+len(jsblob)+8+len(binblob)
    out = struct.pack('<III', 0x46546C67, 2, total)
    out += struct.pack('<II', len(jsblob), 0x4E4F534A)+jsblob
    out += struct.pack('<II', len(binblob), 0x004E4942)+binblob
    open(dst, 'wb').write(out)
    print('输出 %s  %.2fMB (原 %.2fMB)' % (dst, len(out)/1048576, os.path.getsize(src)/1048576))


if __name__ == '__main__':
    main()
