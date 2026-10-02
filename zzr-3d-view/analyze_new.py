import json, struct, sys, os
import numpy as np
from PIL import Image
import io

p = sys.argv[1]
d = open(p, 'rb').read()
magic, ver, total = struct.unpack('<III', d[:12])
off = 12
js = None
bins = []
while off < total:
    clen, ct = struct.unpack('<II', d[off:off+8])
    body = d[off+8:off+8+clen]
    if ct == 0x4E4F534A:
        js = json.loads(body.decode('utf-8'))
    else:
        bins.append(body)
    off += 8 + clen

print('chunk 数', len(bins), ' 总 bin', sum(len(b) for b in bins))
bn = bins[0] if len(bins) == 1 else b''.join(bins)
if len(bins) > 1:
    print('  多 bin，按 bufferView 所属 buffer 处理')

def acc(i):
    a = js['accessors'][i]
    bv = js['bufferViews'][a['bufferView']]
    base = bv.get('byteOffset', 0)
    stride = bv.get('byteStride')
    ct = a['componentType']
    ncomp = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[a['type']]
    dt = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16,
          5125: np.uint32, 5126: np.float32}[ct]
    cnt = a['count']
    if stride:
        raw = np.frombuffer(bn, dtype=np.uint8,
                            count=cnt*stride, offset=base+a.get('byteOffset', 0))
        arr = np.frombuffer(raw.tobytes(), dtype=dt).reshape(cnt, stride//np.dtype(dt).itemsize)[:, :ncomp]
    else:
        arr = np.frombuffer(bn, dtype=dt, count=cnt*ncomp,
                            offset=base+a.get('byteOffset', 0)).reshape(cnt, ncomp)
    return arr

prim = js['meshes'][0]['primitives'][0]
pos = acc(prim['attributes']['POSITION']).astype(np.float64)
print('顶点数', len(pos))
print('POSITION min', np.round(pos.min(0), 4))
print('POSITION max', np.round(pos.max(0), 4))
sz = pos.max(0) - pos.min(0)
print('尺寸 (x宽 y高 z厚)', np.round(sz, 4))
print('  高宽比', round(sz[1]/sz[0], 3), ' 厚宽比', round(sz[2]/sz[0], 3))
mid = (pos.max(0) + pos.min(0)) / 2
print('中心', np.round(mid, 4))

# 各高度层横截面，看人体轮廓
for frac in (0.02, 0.1, 0.25, 0.5, 0.75, 0.9, 0.98):
    yv = pos.min(0)[1] + frac * sz[1]
    sel = pos[(pos[:, 1] >= yv - sz[1]*0.01) & (pos[:, 1] <= yv + sz[1]*0.01)]
    if len(sel):
        print(f'  y={frac:.2f}: x跨 {sel[:,0].min():.3f}~{sel[:,0].max():.3f} '
              f'z跨 {sel[:,2].min():.3f}~{sel[:,2].max():.3f} 顶点 {len(sel)}')

# UV / 贴图
if 'TEXCOORD_0' in prim['attributes']:
    uv = acc(prim['attributes']['TEXCOORD_0'])
    print('UV 范围', np.round(uv.min(0), 3), np.round(uv.max(0), 3))

print('--- 贴图 ---')
for i, img in enumerate(js.get('images', [])):
    bv = js['bufferViews'][img['bufferView']]
    raw = bn[bv['byteOffset']:bv['byteOffset']+bv['byteLength']]
    im = Image.open(io.BytesIO(raw))
    nm = img.get('name', f'img{i}')
    print(f'  {nm}: {im.size} {im.mode} {len(raw)//1024}KB')
    rgb = np.asarray(im.convert('RGB')).astype(np.float64)
    print(f'     平均色 RGB {np.round(rgb.reshape(-1,3).mean(0),1)}')
    if i == 1:  # basecolor
        R, G, B = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
        skin = (R > 130) & (R > G + 8) & (G > B + 4) & (R - B > 20) & (R - B < 110)
        print(f'     肤色像素占比 {skin.mean()*100:.1f}%')
        im.convert('RGB').resize((256, 256)).save('new_tex_basecolor_small.png')
        print('     已存缩略 new_tex_basecolor_small.png')
