import json, struct, sys
import numpy as np
import DracoPy
from PIL import Image
import io

def load_glb(path):
    with open(path, 'rb') as f:
        data = f.read()
    magic, ver, total = struct.unpack('<III', data[:12])
    off = 12
    js = None
    binchunk = None
    while off < total:
        clen, ctype = struct.unpack('<II', data[off:off+8])
        body = data[off+8:off+8+clen]
        if ctype == 0x4E4F534A:
            js = json.loads(body.decode('utf-8'))
        else:
            binchunk = body
        off += 8 + clen
    return js, binchunk

g, b = load_glb(sys.argv[1])

def get_bufferview(i):
    bv = g['bufferViews'][i]
    start = bv.get('byteOffset', 0)
    return b[start:start+bv['byteLength']]

prim = g['meshes'][0]['primitives'][0]
ext = prim['extensions']['KHR_draco_mesh_compression']
bv = g['bufferViews'][ext['bufferView']]
draco_bytes = b[bv.get('byteOffset', 0): bv.get('byteOffset', 0)+bv['byteLength']]
print('draco bytes', len(draco_bytes))
print('draco attributes map', ext['attributes'])
m = DracoPy.decode(draco_bytes)
print('type', type(m))
print('points', np.asarray(m.points).shape, 'faces', np.asarray(m.faces).shape)
print('has normals', hasattr(m, 'normals'), 'has tex', hasattr(m, 'tex_coord'))
pts = np.asarray(m.points, dtype=np.float32)
if pts.ndim == 1:
    pts = pts.reshape(-1, 3)
print('pts reshaped', pts.shape)
print('bbox min', pts.min(0), 'max', pts.max(0), 'extent', pts.max(0)-pts.min(0))
faces = np.asarray(m.faces, dtype=np.int64).reshape(-1, 3)
print('faces', faces.shape, 'max idx', faces.max(), 'num verts', pts.shape[0])
if hasattr(m, 'tex_coord'):
    uv = np.asarray(m.tex_coord, dtype=np.float32)
    print('tex_coord raw', uv.shape)
    if uv.ndim == 1:
        uv = uv.reshape(-1, 2)
    print('uv', uv.shape, 'range', uv.min(0), uv.max(0))
if hasattr(m, 'normals'):
    n = np.asarray(m.normals, dtype=np.float32).reshape(-1, 3)
    print('normals', n.shape)

# texture
mt = g['materials'][0]
pbr = mt.get('pbrMetallicRoughness', {})
tex_i = pbr['baseColorTexture']['index']
tex = g['textures'][tex_i]
print('tex obj', json.dumps(tex)[:300])
src = tex.get('source')
if 'extensions' in tex and 'EXT_texture_webp' in tex['extensions']:
    src = tex['extensions']['EXT_texture_webp'].get('source', src)
img = g['images'][src]
bv2 = g['bufferViews'][img['bufferView']]
raw = b[bv2.get('byteOffset', 0): bv2.get('byteOffset', 0)+bv2['byteLength']]
im = Image.open(io.BytesIO(raw))
print('texture image', im.size, im.mode, im.format)
