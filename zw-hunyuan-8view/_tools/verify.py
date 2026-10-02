"""几何复检：直接读 prep/ 下 8 张成品，报告人物顶/底位置与画布尺寸一致性。"""
import os
from PIL import Image
import numpy as np

PREP = os.path.dirname(os.path.dirname(os.path.abspath(__file__))) + "/prep"
ORDER = ["01_front_A", "02_front_B", "03_right", "04_left_A",
         "05_left_B", "06_left_C", "07_back_A", "08_back_B"]

def lum(a):
    return 0.299 * a[:, :, 0] + 0.587 * a[:, :, 1] + 0.114 * a[:, :, 2]

print(f"{'file':12} {'WxH':9} {'crownT%':8} {'feetB%':8} {'headOK':6} {'feetOK':6}")
for name in ORDER:
    p = f"{PREP}/{name}.jpg"
    if not os.path.exists(p):
        print(f"{name:12} MISSING"); continue
    im = np.asarray(Image.open(p).convert("RGB"))
    h, w = im.shape[:2]
    L = lum(im)
    SUBJ = L > 40                      # 暗底阈值：人物比深蓝渐变更亮
    rows = np.where(SUBJ.any(axis=1))[0]
    crown = rows.min() / h if len(rows) else 0
    feet = rows.max() / h if len(rows) else 1
    head_ok = crown >= 0.04           # 头顶没被切（v1 缺陷是 crown≈0）
    feet_ok = 0.85 <= feet <= 0.99
    print(f"{name:12} {f'{w}x{h}':9} {crown*100:7.1f} {feet*100:7.1f} "
          f"{'Y' if head_ok else 'N':6} {('Y' if feet_ok else 'N'):6}")

# 画布一致性
sizes = {tuple(np.asarray(Image.open(f"{PREP}/{n}.jpg").convert('RGB')).shape[:2]) for n in ORDER}
print("\ncanvas sizes:", sizes, "-> 统一" if len(sizes) == 1 else "-> 不一致!")
