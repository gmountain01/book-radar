#!/usr/bin/env python3
"""index.html 캐시 버스팅 버전 일괄 상향 스크립트.

사용법:
    python scripts/bump_version.py          # 현재 버전 +1
    python scripts/bump_version.py 240      # 지정 버전으로

안전장치:
- src/href 속성 안의 ?v=숫자 만 치환 (유튜브 watch?v=... 등 데이터 URL 미접촉)
- 바이너리 모드 입출력으로 줄바꿈(CRLF) 원본 보존
- 2행 주석의 "현재: v=N" 도 함께 갱신
"""
import os
import re
import sys

# Windows cp949 콘솔에서도 한글/특수문자 출력 안전
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INDEX = os.path.join(ROOT, 'index.html')

# src="..?v=N" / href="..?v=N" 형태만 매칭 (로컬 자산 한정)
ASSET_RE = re.compile(rb'((?:src|href)="[^"]*\?v=)(\d+)(")')


def main():
    with open(INDEX, 'rb') as f:
        data = f.read()

    versions = {int(m.group(2)) for m in ASSET_RE.finditer(data)}
    if not versions:
        print('오류: index.html에서 src/href ?v= 파라미터를 찾지 못했습니다.')
        sys.exit(1)
    cur = max(versions)

    if len(sys.argv) > 1:
        try:
            new = int(sys.argv[1])
        except ValueError:
            print(f'오류: 버전은 정수여야 합니다: {sys.argv[1]!r}')
            sys.exit(1)
        if new <= cur:
            print(f'오류: 새 버전({new})은 현재 최대 버전({cur})보다 커야 합니다.')
            sys.exit(1)
    else:
        new = cur + 1

    new_b = str(new).encode()
    count = 0

    def repl(m):
        nonlocal count
        count += 1
        return m.group(1) + new_b + m.group(3)

    data = ASSET_RE.sub(repl, data)
    # 2행 안내 주석 갱신 ("현재: v=N")
    data = re.sub(rb'\xed\x98\x84\xec\x9e\xac: v=\d+',  # '현재: v=' UTF-8
                  ('현재: v=%d' % new).encode('utf-8'), data, count=1)

    with open(INDEX, 'wb') as f:
        f.write(data)

    if len(versions) > 1:
        print(f'경고: 혼재된 버전 발견 {sorted(versions)} → 전부 v={new}로 통일')
    print(f'완료: ?v={cur} → ?v={new} ({count}곳 치환)')


if __name__ == '__main__':
    main()
