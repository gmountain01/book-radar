#!/usr/bin/env python3
"""캐시 버스팅 버전 상향 누락 감지 (CI용).

로직:
1. index.html의 ?v= 값이 마지막으로 변경된 커밋(버전 범프 커밋)을 찾는다.
2. 그 커밋 이후 shared/ 또는 panels/ 아래 .js/.css 파일이 변경됐으면
   버전 상향 누락으로 판단하고 exit 1 (CI 실패).

전제: git full history 필요 (actions/checkout fetch-depth: 0).
로컬 실행: python scripts/check_version.py
"""
import os
import subprocess
import sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def git(*args):
    return subprocess.check_output(
        ('git', '-C', ROOT) + args, text=True, encoding='utf-8').strip()


def main():
    # 1. ?v=숫자 diff를 포함한 index.html 최종 커밋 = 마지막 버전 범프
    bump = git('log', '-1', '--format=%H', '-G', r'\?v=[0-9]+', '--', 'index.html')
    if not bump:
        print('버전 범프 커밋을 찾지 못했습니다 (히스토리 얕음?) — 검사 건너뜀')
        return

    # 2. 범프 이후 캐시 대상 자산(.js/.css) 변경 목록
    changed = git('log', '--name-only', '--format=', f'{bump}..HEAD',
                  '--', 'shared', 'panels')
    files = sorted({
        f for f in changed.splitlines()
        if f and (f.endswith('.js') or f.endswith('.css')) and '/libs/' not in f
    })

    if not files:
        print(f'OK: 마지막 버전 범프({bump[:7]}) 이후 캐시 대상 자산 변경 없음')
        return

    print('❌ 캐시 버스팅 버전 상향 누락!')
    print(f'   마지막 범프 커밋: {bump[:7]}')
    print('   그 이후 변경된 캐시 대상 파일:')
    for f in files:
        print(f'     - {f}')
    print('\n   해결: python scripts/bump_version.py 실행 후 index.html을 함께 커밋하세요.')
    sys.exit(1)


if __name__ == '__main__':
    main()
