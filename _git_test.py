import subprocess, os

os.chdir(r'd:\003 5V5 only one rukou 20260628\003 github newsest 20260628\new-acode-repo')

with open('_git_test_result.txt', 'w', encoding='utf-8') as f:
    f.write('test start\n')
    try:
        r = subprocess.run('git --version', shell=True, capture_output=True, text=True, timeout=30)
        f.write(f'version exit={r.returncode} out={r.stdout.strip()} err={r.stderr.strip()}\n')
    except Exception as e:
        f.write(f'version error: {e}\n')

print('done')
