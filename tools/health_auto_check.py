#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
自动体检一键脚本（自动后台线）
用法：
    python3 tools/health_auto_check.py [预算秒] [目标关] [速度值] [轮数]
    python3 tools/health_auto_check.py 180 7 100 1
    python3 tools/health_auto_check.py 600 7 100 3      # 扫 3 轮不同随机阵容，累计覆盖率

功能：
    1. 自动起本地静态服务器（若 8000 端口未占用）
    2. 用无头 Chromium 打开 tests/120test-runner.html?auto=1&budget=&stages=&speed=
    3. 后台自动跑完目标关卡，轮询 window.__healthResult 并打印完整 JSON
    4. 轮数>1 时每轮重载页面（新随机阵容），合并跨轮异常并累计「去重后覆盖规则数」，
       解决单轮只触发约 1/3 规则、稀有机制随 RNG 没出现就一直跳过导致的覆盖盲区。
"""
import json
import os
import socket
import subprocess
import sys
import time

try:
    from playwright.sync_api import sync_playwright
except ImportError:
    print('[错误] 缺少 playwright，请先安装：pip3 install playwright && python3 -m playwright install chromium')
    sys.exit(1)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8000
URL = f'http://localhost:{PORT}/tests/120test-runner.html'

BUDGET = int(sys.argv[1]) if len(sys.argv) > 1 else 180   # 脚本最多等多久(秒)
STAGES = int(sys.argv[2]) if len(sys.argv) > 2 else 7      # 目标关
SPEED = int(sys.argv[3]) if len(sys.argv) > 3 else 100     # 游戏速度 100=8x
ROUNDS = int(sys.argv[4]) if len(sys.argv) > 4 else 1      # 轮数：每轮重载=新随机阵容


def port_busy(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(('127.0.0.1', port)) == 0


def render_progress(pr):
    """生成单行进度条文本"""
    stage = pr.get('stage', 0)
    target = pr.get('target', STAGES)
    elapsed = pr.get('elapsed', 0)
    issues = pr.get('issues', '?')
    pct = min(100, int(elapsed / max(BUDGET, 1) * 100))
    bar_len = 20
    filled = int(bar_len * pct / 100)
    bar = '█' * filled + '░' * (bar_len - filled)
    return f'[体检中] 第{stage}关/共{target}关 | 耗时{elapsed}s | 异常{issues} | {bar} {pct}%'


def run_one_round(page, round_idx, total_rounds):
    """跑一轮：首轮已 goto，后续轮重载页面（新随机阵容）。返回体检结果 dict 或 None。"""
    if round_idx > 1:
        target_url = f'{URL}?auto=1&budget={BUDGET}&stages={STAGES}&speed={SPEED}'
        print(f'\n[第{round_idx}/{total_rounds}轮] 重载页面（新随机阵容）…', flush=True)
        try:
            page.goto(target_url, wait_until='domcontentloaded', timeout=20000)
        except Exception as e:
            print('[错误] 重载页面失败:', str(e)[:200], flush=True)
            return None
    deadline = time.time() + BUDGET + 20
    result = None
    last_render = ''
    while time.time() < deadline:
        try:
            r = page.evaluate("() => window.__healthResult ? window.__healthResult : null")
            if r:
                result = r
                break
            pr = page.evaluate("() => window.__healthProgress ? window.__healthProgress : null")
            if pr:
                line = render_progress(pr)
                # 单行原地刷新：内容变化才重绘，绝不逐行刷屏
                if line != last_render:
                    print('\r' + line, end='', flush=True)
                    last_render = line
        except Exception:
            pass
        page.wait_for_timeout(2000)
    print()
    return result


def main():
    server = None
    if not port_busy(PORT):
        print(f'[起服务器] python3 -m http.server {PORT} (cwd={ROOT})', flush=True)
        server = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT), '--bind', '127.0.0.1'],
                                  cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        time.sleep(1.2)

    target_url = f'{URL}?auto=1&budget={BUDGET}&stages={STAGES}&speed={SPEED}'
    print(f'[打开] {target_url}', flush=True)
    print(f'[轮数] 共 {ROUNDS} 轮，每轮目标关{STAGES}、预算{BUDGET}s', flush=True)

    with sync_playwright() as p:
        # 优先用系统 Edge（免下载 chromium）；失败再退回 playwright 自带 chromium
        try:
            browser = p.chromium.launch(headless=True, channel='msedge')
        except Exception:
            browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.on('console', lambda m: print('[console]', m.text[:200], flush=True) if '[AUTO-HEALTH' in m.text else None)
        try:
            page.goto(target_url, wait_until='domcontentloaded', timeout=20000)
        except Exception as e:
            print('[错误] 打开页面失败:', str(e)[:200], flush=True)
            browser.close()
            if server:
                server.terminate()
            sys.exit(1)

        # 跨轮累计
        all_issues = []                                   # 异常（按 关/类型/详情 去重）
        seen_issue_keys = set()
        all_pass_names = set()                            # 去重后「通过」规则名
        all_skip_names = set()                            # 去重后「跳过」规则名
        rounds_meta = []                                  # 每轮摘要

        for i in range(1, ROUNDS + 1):
            if i > 1:
                time.sleep(1.0)  # 给上一轮收尾/页面卸载留点时间
            res = run_one_round(page, i, ROUNDS)
            if res:
                for it in res.get('issues', []):
                    key = (it.get('stage'), it.get('type'), it.get('detail'))
                    if key not in seen_issue_keys:
                        seen_issue_keys.add(key)
                        all_issues.append(it)
                all_pass_names.update(res.get('rulePassNames', []))
                all_skip_names.update(res.get('ruleSkippedNames', []))
                rounds_meta.append({
                    'idx': i, 'elapsed': res.get('elapsed', 0), 'max': res.get('maxStageSeen', 0),
                    'reason': res.get('reason'), 'pass': res.get('rulePass', 0), 'skip': res.get('ruleSkip', 0),
                })
            else:
                rounds_meta.append({'idx': i, 'elapsed': None, 'max': 0, 'reason': 'no-result', 'pass': 0, 'skip': 0})

        # —— 输出报告 ——
        print('══════════ 体检报告（多轮累计） ══════════', flush=True)
        if not all_issues:
            print('✅ 全部通过，未发现异常', flush=True)
        else:
            print(f'❌ 发现 {len(all_issues)} 项异常（跨 {ROUNDS} 轮合并去重）：', flush=True)
            for it in all_issues:
                print(f'   · [第{it.get("stage", "?")}关 · {it.get("type", "?")}] {it.get("detail", "")}（来源:{it.get("source", "?")}）', flush=True)

        # 每轮摘要
        tot_elapsed = 0
        for m in rounds_meta:
            if m['elapsed'] is not None:
                tot_elapsed += m['elapsed']
            e = f"{m['elapsed']}s" if m['elapsed'] is not None else '—'
            print(f'   ↳ 第{m["idx"]}轮：{e} | 最远第{m["max"]}关 | 通过{m["pass"]}/跳过{m["skip"]} | {m["reason"]}', flush=True)
        print(f'⏱ 累计耗时约 {tot_elapsed} 秒（{ROUNDS} 轮）', flush=True)

        # 累计覆盖
        exercised = len(all_pass_names) + len(all_skip_names)
        print(f'📊 累计覆盖规则（去重）：通过 {len(all_pass_names)} + 跳过 {len(all_skip_names)} = {exercised} 条', flush=True)
        if all_skip_names:
            print(f'⏭️ 累计未覆盖规则 {len(all_skip_names)} 条（多轮仍没出现的稀有机制，不代表通过）：', flush=True)
            # 每行约 6 个，避免超长单行
            names = sorted(all_skip_names)
            for k in range(0, len(names), 6):
                print('   ' + '、'.join(names[k:k + 6]), flush=True)
        print('══════════════════════════════', flush=True)
        browser.close()

    if server:
        server.terminate()
        print('[关服务器] 完成', flush=True)


if __name__ == '__main__':
    main()
