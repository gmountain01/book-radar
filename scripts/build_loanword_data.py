"""국립국어원 외래어 표기법 용례 xlsx → panels/panel8/loanword-data.js

사용: python scripts/build_loanword_data.py "../맞춤법 자료/용례 목록 - 외래어 표기법_*.xlsx"

오탐을 줄이려고 걸러 낸다.
- 일반 용어만(인명·지명 제외): 클라우드→클로드(Claude), 팔로우→팔라우(Palau)처럼
  흔한 단어를 다른 고유명사의 오표기로 잡음
- 영어·언어 미상만: 고블린→고블랭(프랑스어 Goblin), 에포크→에포케(그리스어)
- 다른 항목의 바른 표기·이표기와 같은 오표기 제외: 커리어(career)→캐리어, 나이트→니트
"""
import json, re, sys
from pathlib import Path
import pandas as pd

OUT = Path(__file__).resolve().parent.parent / 'panels' / 'panel8' / 'loanword-data.js'
HANGUL_WORD = re.compile(r'^[가-힣 ]+$')
# 다른 영단어(prime·prize·divine)나 회사명(Micron)으로 흔히 쓰는 표기
EXTRA_OK = {'프라임', '프라이즈', '디바인', '마이크론'}


def clean(x):
    return re.sub(r'\([xX]\)\s*,?$', '', str(x).strip()).strip()


def main(src):
    df = pd.read_excel(src).fillna('').astype(str)
    wcols = [f'오표기{i}' for i in range(1, 6)]
    vcols = ['이표기1', '이표기2', '이표기3']
    ok = {clean(x) for c in ['한글 표기'] + vcols for x in df[c]}
    ok = {x for x in ok if HANGUL_WORD.match(x)} | EXTRA_OK
    g = df[(df['구분'] == '일반 용어') & df['언어명'].isin(['', '영어'])]
    rules = []
    for _, r in g.iterrows():
        c = r['한글 표기'].strip()
        ws = []
        for col in wcols:
            w = clean(r[col])
            if w and HANGUL_WORD.match(w) and w != c and w not in ok and w not in ws:
                ws.append(w)
        if ws:
            rules.append({'c': c, 'o': r['원어 표기'].strip(), 'w': ws})
    OUT.write_text(
        '// 국립국어원 외래어 표기법 용례 — 오표기→올바른 표기 매핑\n'
        '// 출처: 국립국어원 외래어 표기법 용례 목록 (2026), 일반 용어·영어만\n'
        '// 자동 생성됨 — scripts/build_loanword_data.py로 재생성, 수동 편집 금지\n'
        'window._LOANWORD_RULES = ' + json.dumps(rules, ensure_ascii=False, separators=(',', ':')) + ';\n',
        encoding='utf-8')
    print(f'{len(rules)}개 항목, 오표기 {sum(len(r["w"]) for r in rules)}개 → {OUT}')


if __name__ == '__main__':
    main(sys.argv[1])
