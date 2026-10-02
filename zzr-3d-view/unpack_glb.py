"""把 Draco 压缩的 GLB 重打包成无压缩 GLB（three.js 可直接加载，不需要 draco 解码器）。
同时归一化：身高 = TARGET_H 米，脚底 y=0，水平居中。
"""
import json, struct, sys, io, os
import numpy as np
import DracoPy
from PIL import Image

TARGET_H = 1.70


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


def bufview(blob_list, raw, target=4, bv_meta=None):
    """追加一段二进制（4 字节对齐），返回 bufferView index"""
    pad = (-len(b''.join(blob_list))) % target if False else 0
    return None


def main():
    src = sys.argv[1]
    dst = sys.argv[2]
    g, b = load_glb(src)

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

    # 归一化：脚底 y=0，水平居中，身高 = TARGET_H
    lo, hi = pts.min(0), pts.max(0)
    s = TARGET_H / (hi[1] - lo[1])
    pts = (pts - np.array([(lo[0] + hi[0]) / 2, lo[1], (lo[2] + hi[2]) / 2])) * s
    print('归一化后 bbox min', np.round(pts.min(0), 3), 'max', np.round(pts.max(0), 3))

    P = pts.astype(np.float32)
    N = np.clip(nrm, -1, 1).astype(np.float32)
    U = np.clip(uv, 0, 1)
    Uq = (U * 65535.0).round().astype(np.uint16)
    I = faces.astype(np.uint32).reshape(-1)

    # 贴图（保留 webp，浏览器原生支持）
    mt = g['materials'][0]
    pbr = mt.get('pbrMetallicRoughness', {})
    tex = g['textures'][pbr['baseColorTexture']['index']]
    tsrc = tex.get('source')
    for k, v in (tex.get('extensions') or {}).items():
        if isinstance(v, dict) and 'source' in v:
            tsrc = v['source']
    im = g['images'][tsrc]
    ibv = g['bufferViews'][im['bufferView']]
    io0 = ibv.get('byteOffset', 0)
    timg = b[io0:io0 + ibv['byteLength']]
    mime = im.get('mimeType', 'image/webp')
    print('贴图', len(timg), 'bytes', mime)

    # ---- 组装 BIN ----
    chunks = []
    offsets = []

    def add(raw, align=4):
        pad = (-len(b''.join(chunks))) % align
        if pad:
            chunks.append(b'\x00' * pad)
        off = sum(len(c) for c in chunks)
        chunks.append(raw)
        return off

    o_p = add(P.tobytes())
    o_n = add(N.tobytes())
    o_u = add(Uq.tobytes())
    o_i = add(I.tobytes())
    o_t = add(timg)
    binbytes = b''.join(chunks)
    total = len(binbytes)

    def mn_mx(arr):
        return [float(x) for x in arr.min(0)], [float(x) for x in arr.max(0)]

    pmin, pmax = mn_mx(P)
    js = {
        "asset": {"version": "2.0", "generator": "zzr-unpack"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"mesh": 0, "name": "zzr"}],
        "meshes": [{"name": "zzr", "primitives": [{
            "attributes": {"POSITION": 0, "NORMAL": 1, "TEXCOORD_0": 2},
            "indices": 3, "material": 0}]}],
        "materials": [{"name": "zzr", "pbrMetallicRoughness": {
            "baseColorTexture": {"index": 0},
            "metallicFactor": 0.0, "roughnessFactor": 0.82,
            "baseColorFactor": [1, 1, 1, 1]}}],
        "textures": [{"sampler": 0, "source": 0}],
        "samplers": [{"magFilter": 9729, "minFilter": 9987, "wrapS": 33071, "wrapT": 33071}],
        "images": [{"mimeType": mime, "bufferView": 4, "name": "baseColor"}],
        "accessors": [
            {"bufferView": 0, "componentType": 5126, "count": int(P.shape[0]),
             "type": "VEC3", "min": pmin, "max": pmax},
            {"bufferView": 1, "componentType": 5126, "count": int(N.shape[0]), "type": "VEC3"},
            {"bufferView": 2, "componentType": 5123, "normalized": True,
             "count": int(Uq.shape[0]), "type": "VEC2"},
            {"bufferView": 3, "componentType": 5125, "count": int(I.shape[0]), "type": "SCALAR"},
        ],
        "bufferViews": [
            {"buffer": 0, "byteOffset": o_p, "byteLength": len(P.tobytes()), "target": 34962},
            {"buffer": 0, "byteOffset": o_n, "byteLength": len(N.tobytes()), "target": 34962},
            {"buffer": 0, "byteOffset": o_u, "byteLength": len(Uq.tobytes()), "target": 34962},
            {"buffer": 0, "byteOffset": o_i, "byteLength": len(I.tobytes()), "target": 34963},
            {"buffer": 0, "byteOffset": o_t, "byteLength": len(timg)},
        ],
        "buffers": [{"byteLength": total}],
    }

    jsb = json.dumps(js, separators=(',', ':')).encode('utf-8')
    jsb += b' ' * ((-len(jsb)) % 4)
    padbin = b'\x00' * ((-len(binbytes)) % 4)
    binbytes += padbin
    out = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(jsb) + 8 + len(binbytes))
    out += struct.pack('<II', len(jsb), 0x4E4F534A) + jsb
    out += struct.pack('<II', len(binbytes), 0x004E4942) + binbytes
    with open(dst, 'wb') as f:
        f.write(out)
    print('写出', dst, round(len(out) / 1048576, 2), 'MB  (顶点',
          P.shape[0], ' 三角', I.shape[0] // 3, ')')


if __name__ == '__main__':
    main()
