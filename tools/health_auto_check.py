#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
自动体检一键脚本（自动后台线）
用法：
    python3 tools/health_auto_check.py [预算秒] [目标关] [速度值]
    python3 tools/health_auto_check.py 180 6 100

功能：
    1. 自动起本地静态服务器（若 8000 端口未占用）
    2. 用无头 Chromium 打开 tests/55test-runner.html?auto=1&budget=&stages=&speed=
    3. 后台自动跑完目标关卡，轮询 window.__healthResult 并打印完整 JSON
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
URL = f'http://localhost:{PORT}/tests/55test-runner.html'

BUDGET = int(sys.argv[1]) if len(sys.argv) > 1 else 180   # 脚本最多等多久(秒)
STAGES = int(sys.argv[2]) if len(sys.argv) > 2 else 6      # 目标关
SPEED = int(sys.argv[3]) if len(sys.argv) > 3 else 100     # 游戏速度 100=8x


def port_busy(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(('127.0.0.1', port)) == 0


def main():
    server = None
    if not port_busy(PORT):
        print(f'[起服务器] python3 -m http.server {PORT} (cwd={ROOT})', flush=True)
        server = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT), '--bind', '127.0.0.1'],
                                  cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        time.sleep(1.2)

    target_url = f'{URL}?auto=1&budget={BUDGET}&stages={STAGES}&speed={SPEED}'
    print(f'[打开] {target_url}', flush=True)

    with sync_playwright() as p:
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

        deadline = time.time() + BUDGET + 20
        result = None
        last_progress = None
        while time.time() < deadline:
            try:
                r = page.evaluate("() => window.__healthResult ? window.__healthResult : null")
                if r:
                    result = r
                    break
                pr = page.evaluate("() => window.__healthProgress ? window.__healthProgress : null")
                if pr and pr != last_progress:
                    last_progress = pr
                    print(f"[进度] 关{pr.get('stage')}/{pr.get('target')} | {pr.get('elapsed')}s | 异常{pr.get('issues', '?')}项 | {pr.get('flag')}", flush=True)
            except Exception:
                pass
            page.wait_for_timeout(2000)

        if result:
            print('===== [AUTO-HEALTH-DONE] =====', flush=True)
            print(json.dumps(result, ensure_ascii=False, indent=2), flush=True)
            print('===== [AUTO-HEALTH-END] =====', flush=True)
        else:
            print(f'[超时] 预算 {BUDGET}s 内未生成 __healthResult（可能卡在战斗中）', flush=True)
        browser.close()

    if server:
        server.terminate()
        print('[关服务器] 完成', flush=True)


if __name__ == '__main__':
    main()
