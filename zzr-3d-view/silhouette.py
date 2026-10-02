"""快速点云剪影：把 87 万顶点投影成 ASCII，用于判断姿势/朝向/比例（不做三角光栅化，秒级）"""
import json, struct, sys, os, math
import numpy as np

p = sys.argv[1]
d = open(p, 'rb').read()
total = struct.unpack('<I', d[8:12])[0]
off = 12; js = None; bn = None
while off < total:
    clen, ct = struct.unpack('<II', d[off:off+8]); body = d[off+8:off+8+clen]
    if ct == 0x4E4F534A: js = json.loads(body.decode('utf-8'))
    else: bn = body
    off += 8 + clen

def acc(i):
    a = js['accessors'][i]; bv = js['bufferViews'][a['bufferView']]
    dt = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16,
          5125: np.uint32, 5126: np.float32}[a['componentType']]
    n = {'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']]
    return np.frombuffer(bn, dtype=dt, count=a['count']*n,
                         offset=bv.get('byteOffset',0)+a.get('byteOffset',0)).reshape(a['count'], n)

prim = js['meshes'][0]['primitives'][0]
pos = acc(prim['attributes']['POSITION']).astype(np.float64)

# 应用 node 变换
nd = js['nodes'][0]
if 'matrix' in nd:
    M = np.array(nd['matrix'], float).reshape(4, 4)
else:
    T = nd.get('translation', [0,0,0]); R = nd.get('rotation', [0,0,0,1]); S = nd.get('scale', [1,1,1])
    x,y,z,w = R
    Rm = np.array([[1-2*(y*y+z*z), 2*(x*y-z*w), 2*(x*z+y*w)],
                   [2*(x*y+z*w), 1-2*(x*x+z*z), 2*(y*z-x*w)],
                   [2*(x*z-y*w), 2*(y*z+x*w), 1-2*(x*x+y*y)]])
    M = np.eye(4); M[:3,:3] = Rm * np.array(S); M[:3,3] = T
P = np.c_[pos, np.ones(len(pos))] @ M.T
P = P[:, :3]

print('世界坐标 bbox')
print('  min', np.round(P.min(0), 3), ' max', np.round(P.max(0), 3))
sz = P.max(0) - P.min(0)
print('  尺寸 宽%.3f 高%.3f 厚%.3f' % tuple(sz))
print('  高/宽 %.2f   高/厚 %.2f' % (sz[1]/sz[0], sz[1]/sz[2]))

# 分层轮廓（世界空间）
print('--- 世界空间分层截面 ---')
for f in [0.02,0.08,0.15,0.25,0.35,0.5,0.65,0.8,0.9,0.97]:
    y = P.min(0)[1] + f*sz[1]
    s = P[np.abs(P[:,1]-y) < sz[1]*0.008]
    if len(s):
        print('  y%.2f  x[%+.3f,%+.3f] 宽%.3f   z[%+.3f,%+.3f] 厚%.3f   点%d'
              % (f, s[:,0].min(), s[:,0].max(), s[:,0].max()-s[:,0].min(),
                 s[:,2].min(), s[:,2].max(), s[:,2].max()-s[:,2].min(), len(s)))

# 8 方位剪影
W, H = 46, 30
print('\n--- 8 方位点云剪影（. 空  # 实体）---')
for i, az in enumerate(range(0, 360, 45)):
    a = math.radians(az)
    # 相机绕 Y 轴；屏幕 x = 右方向，屏幕 y = 世界上
    rx = np.array([math.cos(a), 0, -math.sin(a)])
    depth = np.array([math.sin(a), 0, math.cos(a)])
    u = P @ rx
    v = P[:, 1]
    u0, u1 = u.min(), u.max(); v0, v1 = v.min(), v.max()
    span = max(u1-u0, (v1-v0)*W/H*1.0)
    cu = (u0+u1)/2; cv = (v0+v1)/2
    halfw = span/2*1.05; halfh = halfw*H/W*1.0
    grid = np.zeros((H, W), int)
    iu = np.clip(((u-(cu-halfw))/(2*halfw)*W).astype(int), 0, W-1)
    iv = np.clip(((cv+halfh-v)/(2*halfh)*H).astype(int), 0, H-1)
    np.add.at(grid, (iv, iu), 1)
    print(f'\n[方位 {az}°]  u跨度{u1-u0:.3f} v跨度{v1-v0:.3f}')
    chars = ' .:-=+*#%@'
    for r in range(H):
        row = ''.join('#' if grid[r,c] > 0 else '.' for c in range(W))
        print('  ' + row)
