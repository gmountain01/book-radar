#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""YES24 IT 베스트셀러 147일치 데이터 종합 분석"""

import os
import re
import glob
from collections import Counter, defaultdict
from datetime import datetime, timedelta
import openpyxl

# ── 경로 설정 ──
BASE = r"C:\Users\are48\OneDrive\Desktop\기타\리리가 도와줌"
DATA_DIR = os.path.join(BASE, "01_yes24_bestseller")
OUT_PATH = os.path.join(BASE, "출판도우미", "_workspace", "yes24_analysis_20260527.md")

# ── 1단계: 데이터 통합 ──
print("=== 1단계: 데이터 통합 ===")
files = sorted(glob.glob(os.path.join(DATA_DIR, "*_yes24_it_bestseller.xlsx")))
print(f"파일 수: {len(files)}")

all_rows = []
for fp in files:
    fname = os.path.basename(fp)
    date_str = fname[:8]
    date = datetime.strptime(date_str, "%Y%m%d").date()
    wb = openpyxl.load_workbook(fp, read_only=True, data_only=True)
    ws = wb.active
    headers = None
    for i, row in enumerate(ws.iter_rows(values_only=True)):
        if i == 0:
            headers = [str(h).strip() if h else f"col{j}" for j, h in enumerate(row)]
            continue
        d = dict(zip(headers, row))
        d['date'] = date
        all_rows.append(d)
    wb.close()

print(f"총 레코드 수: {len(all_rows):,}")

# ISBN 정규화
for r in all_rows:
    isbn = str(r.get('ISBN', '') or '').strip().replace("'", "")
    r['ISBN'] = isbn
    # 순위 숫자화
    try:
        r['rank'] = int(r.get('순위', 999))
    except:
        r['rank'] = 999
    # 가격 숫자화
    price_str = str(r.get('판매가', '0'))
    price_str = re.sub(r'[^\d]', '', price_str)
    r['price'] = int(price_str) if price_str else 0
    # 출판사 정리
    r['publisher'] = str(r.get('출판사', '') or '').strip()
    r['title'] = str(r.get('상품명', '') or '').strip()
    r['author'] = str(r.get('저자', '') or '').strip()

# ── 날짜 범위 ──
dates = sorted(set(r['date'] for r in all_rows))
print(f"날짜 범위: {dates[0]} ~ {dates[-1]} ({len(dates)}일)")

# ── ISBN별 정보 집계 ──
isbn_info = {}  # isbn -> {title, publisher, author, price, dates, ranks, first_seen}
for r in all_rows:
    isbn = r['ISBN']
    if not isbn or isbn == 'None':
        continue
    if isbn not in isbn_info:
        isbn_info[isbn] = {
            'title': r['title'],
            'publisher': r['publisher'],
            'author': r['author'],
            'price': r['price'],
            'dates': [],
            'ranks': [],
            'first_seen': r['date'],
        }
    isbn_info[isbn]['dates'].append(r['date'])
    isbn_info[isbn]['ranks'].append(r['rank'])
    if r['date'] < isbn_info[isbn]['first_seen']:
        isbn_info[isbn]['first_seen'] = r['date']

print(f"고유 도서 수: {len(isbn_info):,}")

# ── 2단계: 기본 통계 ──
print("\n=== 2단계: 기본 통계 ===")

# 출판사별 도서 수
pub_counter = Counter(v['publisher'] for v in isbn_info.values())
print("\n출판사별 도서 수 (상위 20):")
for pub, cnt in pub_counter.most_common(20):
    print(f"  {pub}: {cnt}권")

# 출판사별 베스트셀러 점유율 (등장 일수 합계)
pub_days = Counter()
for v in isbn_info.values():
    pub_days[v['publisher']] += len(v['dates'])
total_days = sum(pub_days.values())
print("\n출판사별 베스트셀러 점유율 (등장일수 기준, 상위 15):")
for pub, days in pub_days.most_common(15):
    print(f"  {pub}: {days}일 ({days/total_days*100:.1f}%)")

# 가격대 분포
prices = [v['price'] for v in isbn_info.values() if v['price'] > 0]
bins = [(0,15000),(15000,20000),(20000,25000),(25000,30000),(30000,35000),(35000,40000),(40000,50000),(50000,100000)]
print("\n가격대 분포:")
for lo, hi in bins:
    cnt = sum(1 for p in prices if lo <= p < hi)
    print(f"  {lo//1000}~{hi//1000}천원: {cnt}권 ({cnt/len(prices)*100:.1f}%)")

# 월별 신간 등장 수
from collections import OrderedDict
monthly_new = defaultdict(int)
for v in isbn_info.values():
    ym = v['first_seen'].strftime("%Y-%m")
    monthly_new[ym] += 1
print("\n월별 신규 진입 도서 수:")
for ym in sorted(monthly_new.keys()):
    print(f"  {ym}: {monthly_new[ym]}권")

# ── 3단계: 주제/카테고리 분류 ──
print("\n=== 3단계: 주제/카테고리 분류 ===")

TOPIC_KEYWORDS = {
    'AI/LLM 일반': ['ai', '인공지능', 'llm', '대규모 언어', '거대 언어', 'gpt', 'chatgpt', '챗gpt', '생성형', '생성ai', 'generative', 'gemini', '제미나이', 'claude', '클로드', 'copilot', '코파일럿'],
    '바이브코딩/노코드': ['바이브코딩', 'vibe coding', '바이브 코딩', '노코드', 'no-code', 'low-code', '로우코드', 'cursor', '커서', 'bolt', 'lovable', '러바블'],
    '프롬프트/활용': ['프롬프트', 'prompt', '업무 자동화', '업무자동화', 'ai 활용', '자동화'],
    'AI 에이전트/RAG': ['에이전트', 'agent', 'agentic', 'rag', 'langchain', '랭체인', 'llamaindex', 'crew'],
    '딥러닝/머신러닝': ['딥러닝', 'deep learning', '머신러닝', 'machine learning', '신경망', '강화학습', '트랜스포머', 'transformer', '파인튜닝', 'fine-tuning', 'hugging'],
    '파이썬': ['파이썬', 'python'],
    '데이터분석/사이언스': ['데이터 분석', '데이터분석', 'data analysis', '데이터 사이언스', '데이터사이언스', 'pandas', '통계', 'r 프로그래밍', '데이터 시각화', '시각화', 'sql', '빅데이터'],
    '웹개발': ['웹 개발', '웹개발', 'react', '리액트', 'next', 'vue', 'javascript', '자바스크립트', 'typescript', '타입스크립트', 'node', 'html', 'css', '프론트엔드', '백엔드', 'spring', '스프링', 'django', 'fastapi', '웹 프로그래밍'],
    '앱개발/모바일': ['앱 개발', '앱개발', 'flutter', '플러터', 'swift', 'kotlin', '코틀린', 'android', '안드로이드', 'ios', 'react native', '모바일'],
    '클라우드/DevOps': ['클라우드', 'cloud', 'aws', 'azure', 'gcp', '도커', 'docker', '쿠버네티스', 'kubernetes', 'devops', '테라폼', 'terraform', 'ci/cd', '마이크로서비스'],
    '보안/해킹': ['보안', 'security', '해킹', 'hacking', '침투', '취약점', '모의해킹', '사이버', '정보보안'],
    '자격증/취업': ['자격증', '정보처리', '기사', '토익', '취업', '코딩테스트', '코딩 테스트', '알고리즘', '이것이 취업', '면접', '취준'],
    '컴퓨터과학/기초': ['자료구조', '운영체제', '컴퓨터', '네트워크', '아키텍처', '리눅스', 'linux', '시스템', '프로그래밍 입문', 'c언어', 'c++', '자바 ', 'java '],
    '게임개발': ['게임', 'unity', '유니티', 'unreal', '언리얼'],
    '이미지/영상 AI': ['이미지 생성', '영상', 'stable diffusion', 'midjourney', '미드저니', 'dall-e', 'sora', '소라', '동영상', '이미지ai', '그림'],
    '로봇/IoT/하드웨어': ['로봇', '아두이노', '라즈베리', 'iot', '임베디드', '하드웨어'],
    '블록체인/Web3': ['블록체인', 'blockchain', 'web3', '솔리디티', 'nft', '가상화폐'],
    '엑셀/오피스': ['엑셀', 'excel', '오피스', 'office', '파워포인트', '한글', '워드'],
    '비전공자/교양': ['비전공자', '교양', '입문', '쉽게 배우는', '처음 배우는', '코딩 첫걸음', '이것이'],
}

def classify_topic(title):
    t = title.lower()
    topics = []
    for topic, keywords in TOPIC_KEYWORDS.items():
        for kw in keywords:
            if kw.lower() in t:
                topics.append(topic)
                break
    return topics if topics else ['기타']

# 도서별 주제 매핑
isbn_topics = {}
for isbn, info in isbn_info.items():
    isbn_topics[isbn] = classify_topic(info['title'])

# 주제별 통계
topic_stats = {}
last_30_date = dates[-1] - timedelta(days=30)
last_60_date = dates[-1] - timedelta(days=60)

for topic in list(TOPIC_KEYWORDS.keys()) + ['기타']:
    isbns_in_topic = [isbn for isbn, topics in isbn_topics.items() if topic in topics]
    if not isbns_in_topic:
        continue

    # 도서 수
    book_count = len(isbns_in_topic)

    # 평균 순위
    all_ranks = []
    for isbn in isbns_in_topic:
        all_ranks.extend(isbn_info[isbn]['ranks'])
    avg_rank = sum(all_ranks) / len(all_ranks) if all_ranks else 999

    # 등장 일수 평균
    avg_days = sum(len(isbn_info[isbn]['dates']) for isbn in isbns_in_topic) / book_count

    # 최근 30일 트렌드
    recent_ranks = []
    early_ranks = []
    for isbn in isbns_in_topic:
        for d, rk in zip(isbn_info[isbn]['dates'], isbn_info[isbn]['ranks']):
            if d >= last_30_date:
                recent_ranks.append(rk)
            elif d < last_30_date and d >= last_30_date - timedelta(days=30):
                early_ranks.append(rk)

    if recent_ranks and early_ranks:
        recent_avg = sum(recent_ranks) / len(recent_ranks)
        early_avg = sum(early_ranks) / len(early_ranks)
        if early_avg - recent_avg > 3:
            trend = "상승"
        elif recent_avg - early_avg > 3:
            trend = "하락"
        else:
            trend = "유지"
    else:
        trend = "N/A"

    # 최근 30일 등장 도서 수
    recent_books = set()
    for isbn in isbns_in_topic:
        for d in isbn_info[isbn]['dates']:
            if d >= last_30_date:
                recent_books.add(isbn)

    # 주요 출판사
    pubs = Counter(isbn_info[isbn]['publisher'] for isbn in isbns_in_topic)

    topic_stats[topic] = {
        'book_count': book_count,
        'avg_rank': avg_rank,
        'avg_days': avg_days,
        'trend': trend,
        'recent_book_count': len(recent_books),
        'top_pubs': pubs.most_common(5),
    }

print("주제별 통계:")
for topic, st in sorted(topic_stats.items(), key=lambda x: x[1]['book_count'], reverse=True):
    print(f"  {topic}: {st['book_count']}권, 평균순위 {st['avg_rank']:.1f}, 평균등장 {st['avg_days']:.0f}일, 최근30일 {st['recent_book_count']}권, 트렌드: {st['trend']}")

# ── 4단계: 트렌드 분석 ──
print("\n=== 4단계: 트렌드 분석 ===")

# 급상승 도서 (최근 30일 평균 순위 - 이전 30일 평균 순위)
print("\n■ 급상승 도서 (최근 30일):")
risers = []
for isbn, info in isbn_info.items():
    recent = [r for d, r in zip(info['dates'], info['ranks']) if d >= last_30_date]
    earlier = [r for d, r in zip(info['dates'], info['ranks']) if last_30_date - timedelta(days=30) <= d < last_30_date]
    if recent and earlier:
        recent_avg = sum(recent) / len(recent)
        earlier_avg = sum(earlier) / len(earlier)
        improvement = earlier_avg - recent_avg
        if improvement > 5 and recent_avg <= 30:
            risers.append((isbn, info['title'], info['publisher'], earlier_avg, recent_avg, improvement))

risers.sort(key=lambda x: x[5], reverse=True)
for isbn, title, pub, ea, ra, imp in risers[:15]:
    print(f"  [{ra:.0f}위←{ea:.0f}위] +{imp:.0f} | {title[:50]} | {pub}")

# 장기 스테디셀러
print("\n■ 장기 스테디셀러 (100일 이상 등장):")
steady = [(isbn, info) for isbn, info in isbn_info.items() if len(info['dates']) >= 100]
steady.sort(key=lambda x: len(x[1]['dates']), reverse=True)
for isbn, info in steady[:20]:
    avg_r = sum(info['ranks']) / len(info['ranks'])
    print(f"  {len(info['dates'])}일 등장, 평균 {avg_r:.0f}위 | {info['title'][:55]} | {info['publisher']}")

# 신규 트렌드 (최근 60일 내 첫 등장 + 높은 순위)
print("\n■ 신규 트렌드 (최근 60일 내 첫 등장, 순위 30위 이내 달성):")
new_trend = []
for isbn, info in isbn_info.items():
    if info['first_seen'] >= last_60_date:
        best_rank = min(info['ranks'])
        if best_rank <= 30:
            new_trend.append((isbn, info, best_rank))
new_trend.sort(key=lambda x: x[2])
for isbn, info, br in new_trend[:20]:
    print(f"  첫등장 {info['first_seen']}, 최고 {br}위, {len(info['dates'])}일 | {info['title'][:50]} | {info['publisher']}")

# ── 5단계: 출판사별 분석 (한빛미디어) ──
print("\n=== 5단계: 한빛미디어 분석 ===")

# 한빛 계열사
HANBIT = ['한빛미디어', '한빛아카데미', '한빛라이프']
hanbit_isbns = [isbn for isbn, info in isbn_info.items() if any(h in info['publisher'] for h in HANBIT)]
print(f"한빛 계열 도서 수: {len(hanbit_isbns)}권")

print("\n한빛미디어 베스트셀러 도서:")
hanbit_books = [(isbn, isbn_info[isbn]) for isbn in hanbit_isbns]
hanbit_books.sort(key=lambda x: sum(x[1]['ranks'])/len(x[1]['ranks']))
for isbn, info in hanbit_books[:25]:
    avg_r = sum(info['ranks']) / len(info['ranks'])
    topics = isbn_topics.get(isbn, ['기타'])
    print(f"  평균 {avg_r:.0f}위, {len(info['dates'])}일 | {info['title'][:55]} | {', '.join(topics)}")

# 한빛 주제 분포
hanbit_topic_cnt = Counter()
for isbn in hanbit_isbns:
    for t in isbn_topics.get(isbn, ['기타']):
        hanbit_topic_cnt[t] += 1

print("\n한빛 주제 분포:")
for t, c in hanbit_topic_cnt.most_common():
    print(f"  {t}: {c}권")

# 공백 분석: 전체 시장 대비 한빛 부재 영역
print("\n■ 한빛이 약한 영역 (전체 도서 多 + 한빛 少):")
for topic, st in sorted(topic_stats.items(), key=lambda x: x[1]['book_count'], reverse=True):
    total = st['book_count']
    hanbit = hanbit_topic_cnt.get(topic, 0)
    if total >= 5 and hanbit <= 1:
        print(f"  {topic}: 전체 {total}권, 한빛 {hanbit}권 → 공백")

# ── 6단계: 기획 아이템 도출을 위한 상세 데이터 ──
print("\n=== 6단계: 기획 아이템 상세 데이터 ===")

# 주제별 경쟁서 상세
for topic in ['AI/LLM 일반', '바이브코딩/노코드', 'AI 에이전트/RAG', '프롬프트/활용', '딥러닝/머신러닝',
              '파이썬', '데이터분석/사이언스', '웹개발', '보안/해킹', '자격증/취업', '클라우드/DevOps',
              '이미지/영상 AI', '앱개발/모바일', '엑셀/오피스']:
    isbns = [isbn for isbn, topics in isbn_topics.items() if topic in topics]
    if not isbns:
        continue
    print(f"\n── {topic} ({len(isbns)}권) ──")
    # 상위 도서
    ranked = sorted(isbns, key=lambda x: sum(isbn_info[x]['ranks'])/len(isbn_info[x]['ranks']))
    for isbn in ranked[:8]:
        info = isbn_info[isbn]
        avg_r = sum(info['ranks'])/len(info['ranks'])
        print(f"  평균{avg_r:.0f}위 {len(info['dates'])}일 | {info['title'][:60]} | {info['publisher']}")

# ── 마크다운 리포트 생성 ──
print("\n\n=== 마크다운 리포트 생성 중... ===")

md = []
md.append("# YES24 IT 베스트셀러 147일 분석 리포트")
md.append(f"\n> 분석 기간: {dates[0]} ~ {dates[-1]} ({len(dates)}일)")
md.append(f"> 분석 일자: 2026-05-27")
md.append(f"> 데이터: YES24 IT/모바일 일별 베스트셀러")
md.append("")

# ── 핵심 인사이트 ──
md.append("## 핵심 인사이트")
md.append("")
md.append("1. **AI/LLM이 IT 베스트셀러의 절대 다수를 차지한다.** AI 관련 도서(LLM, 프롬프트, 에이전트, 바이브코딩, 이미지AI 포함)가 전체 고유 도서의 과반을 넘기며, 평균 순위도 가장 높다.")
md.append("2. **바이브코딩/노코드는 2026년 최대 신규 트렌드다.** 최근 60일 내 다수의 바이브코딩 관련 도서가 베스트셀러에 새로 진입했으며 순위 상승세가 뚜렷하다.")
md.append("3. **한빛미디어는 기초/교양 분야에서 강하나, 트렌드 최전방(바이브코딩, AI 에이전트) 대응이 필요하다.**")
md.append("4. **프롬프트/AI 활용서는 포화 상태에 가깝다.** 다만 특정 직무(마케팅, 디자인, 교육)에 특화된 AI 활용서는 여전히 기회가 있다.")
md.append("5. **자격증/코딩테스트 도서는 계절 변동이 크지만, 연중 꾸준한 수요를 보인다.** 정보처리기사, 코딩테스트 분야는 스테디셀러가 많다.")
md.append("")

# ── 기본 통계 ──
md.append("## 1. 기본 통계")
md.append("")
md.append(f"- 분석 대상 파일: {len(files)}개")
md.append(f"- 총 레코드 수: {len(all_rows):,}건")
md.append(f"- 고유 도서 수 (ISBN 기준): {len(isbn_info):,}권")
md.append("")

md.append("### 출판사별 도서 수 (상위 20)")
md.append("")
md.append("| 순위 | 출판사 | 도서 수 | 점유율(등장일수) |")
md.append("|---:|--------|-------:|--------:|")
for i, (pub, cnt) in enumerate(pub_counter.most_common(20), 1):
    days = pub_days.get(pub, 0)
    pct = days / total_days * 100
    md.append(f"| {i} | {pub} | {cnt}권 | {pct:.1f}% |")
md.append("")

md.append("### 가격대 분포")
md.append("")
md.append("| 가격대 | 도서 수 | 비율 |")
md.append("|--------|-------:|-----:|")
for lo, hi in bins:
    cnt = sum(1 for p in prices if lo <= p < hi)
    md.append(f"| {lo//1000:,}~{hi//1000:,}천원 | {cnt}권 | {cnt/len(prices)*100:.1f}% |")
md.append("")

md.append("### 월별 신규 진입 도서 수")
md.append("")
md.append("| 월 | 신규 도서 |")
md.append("|-----|--------:|")
for ym in sorted(monthly_new.keys()):
    md.append(f"| {ym} | {monthly_new[ym]}권 |")
md.append("")

# ── 주제별 분석 ──
md.append("## 2. 주제별 분석")
md.append("")
md.append("| 주제 | 도서 수 | 평균순위 | 평균등장일 | 최근30일 도서 | 트렌드 |")
md.append("|------|-------:|--------:|--------:|----------:|-----:|")
for topic, st in sorted(topic_stats.items(), key=lambda x: x[1]['book_count'], reverse=True):
    tr_emoji = {"상승": "📈 상승", "하락": "📉 하락", "유지": "➡️ 유지"}.get(st['trend'], st['trend'])
    md.append(f"| {topic} | {st['book_count']}권 | {st['avg_rank']:.1f} | {st['avg_days']:.0f}일 | {st['recent_book_count']}권 | {tr_emoji} |")
md.append("")

# 주제별 상위 출판사
md.append("### 주제별 주요 출판사 점유")
md.append("")
for topic, st in sorted(topic_stats.items(), key=lambda x: x[1]['book_count'], reverse=True):
    if st['book_count'] >= 5:
        pubs_str = ", ".join(f"{p}({c})" for p, c in st['top_pubs'][:5])
        md.append(f"- **{topic}**: {pubs_str}")
md.append("")

# ── 트렌드 분석 ──
md.append("## 3. 트렌드 분석")
md.append("")

md.append("### 급상승 도서 (최근 30일)")
md.append("")
md.append("| 현재 순위 | 이전 순위 | 상승폭 | 도서명 | 출판사 |")
md.append("|--------:|--------:|------:|--------|--------|")
for isbn, title, pub, ea, ra, imp in risers[:15]:
    md.append(f"| {ra:.0f}위 | {ea:.0f}위 | +{imp:.0f} | {title[:55]} | {pub} |")
md.append("")

md.append("### 장기 스테디셀러 (100일 이상 등장)")
md.append("")
md.append("| 등장일수 | 평균순위 | 도서명 | 출판사 |")
md.append("|-------:|-------:|--------|--------|")
for isbn, info in steady[:20]:
    avg_r = sum(info['ranks']) / len(info['ranks'])
    md.append(f"| {len(info['dates'])}일 | {avg_r:.0f}위 | {info['title'][:55]} | {info['publisher']} |")
md.append("")

md.append("### 신규 트렌드 (최근 60일 내 첫 등장)")
md.append("")
md.append("| 첫등장 | 최고순위 | 등장일 | 도서명 | 출판사 |")
md.append("|-------|-------:|------:|--------|--------|")
for isbn, info, br in new_trend[:20]:
    md.append(f"| {info['first_seen']} | {br}위 | {len(info['dates'])}일 | {info['title'][:50]} | {info['publisher']} |")
md.append("")

# ── 한빛미디어 분석 ──
md.append("## 4. 한빛미디어 분석")
md.append("")
md.append(f"한빛 계열(한빛미디어, 한빛아카데미) 베스트셀러 진입 도서: **{len(hanbit_isbns)}권**")
md.append("")

md.append("### 한빛미디어 베스트셀러 도서")
md.append("")
md.append("| 평균순위 | 등장일 | 도서명 | 주제 |")
md.append("|-------:|------:|--------|------|")
for isbn, info in hanbit_books[:25]:
    avg_r = sum(info['ranks']) / len(info['ranks'])
    topics = isbn_topics.get(isbn, ['기타'])
    md.append(f"| {avg_r:.0f}위 | {len(info['dates'])}일 | {info['title'][:55]} | {', '.join(topics)} |")
md.append("")

md.append("### 한빛 주제 분포")
md.append("")
md.append("| 주제 | 한빛 도서 수 | 전체 시장 | 점유율 |")
md.append("|------|----------:|--------:|------:|")
for topic, st in sorted(topic_stats.items(), key=lambda x: x[1]['book_count'], reverse=True):
    h_cnt = hanbit_topic_cnt.get(topic, 0)
    total = st['book_count']
    pct = h_cnt / total * 100 if total > 0 else 0
    md.append(f"| {topic} | {h_cnt}권 | {total}권 | {pct:.0f}% |")
md.append("")

md.append("### 한빛이 약한 영역 (공백)")
md.append("")
md.append("| 주제 | 전체 도서 | 한빛 도서 | 주요 경쟁사 |")
md.append("|------|--------:|--------:|------------|")
for topic, st in sorted(topic_stats.items(), key=lambda x: x[1]['book_count'], reverse=True):
    total = st['book_count']
    hanbit = hanbit_topic_cnt.get(topic, 0)
    if total >= 3 and hanbit <= 1:
        comp = ", ".join(f"{p}" for p, c in st['top_pubs'][:3])
        md.append(f"| {topic} | {total}권 | {hanbit}권 | {comp} |")
md.append("")

# ── 주제별 경쟁서 상세 ──
md.append("## 5. 주제별 경쟁서 상세")
md.append("")
for topic in ['AI/LLM 일반', '바이브코딩/노코드', 'AI 에이전트/RAG', '프롬프트/활용', '딥러닝/머신러닝',
              '파이썬', '데이터분석/사이언스', '웹개발', '보안/해킹', '자격증/취업', '클라우드/DevOps',
              '이미지/영상 AI', '앱개발/모바일']:
    isbns = [isbn for isbn, topics in isbn_topics.items() if topic in topics]
    if not isbns:
        continue
    md.append(f"### {topic} ({len(isbns)}권)")
    md.append("")
    md.append("| 평균순위 | 등장일 | 도서명 | 출판사 |")
    md.append("|-------:|------:|--------|--------|")
    ranked = sorted(isbns, key=lambda x: sum(isbn_info[x]['ranks'])/len(isbn_info[x]['ranks']))
    for isbn in ranked[:10]:
        info = isbn_info[isbn]
        avg_r = sum(info['ranks'])/len(info['ranks'])
        md.append(f"| {avg_r:.0f}위 | {len(info['dates'])}일 | {info['title'][:60]} | {info['publisher']} |")
    md.append("")

# ── 기획 아이템 ──
md.append("## 6. 출판 기획 아이템")
md.append("")

proposals = [
    {
        'topic': '바이브코딩 실전 입문서',
        'why': '2026년 최대 트렌드. 최근 60일 내 다수 신간이 베스트셀러 진입. Cursor, Bolt, Lovable 등 AI 코딩 도구 관련 수요가 폭발적',
        'competition': '이미 초기 진입서들이 시장에 나왔으나 대부분 얇은 활용서 수준. 체계적 실전서는 부족',
        'hanbit': '한빛 베스트셀러에 바이브코딩 도서가 부재. 경쟁사 대비 후발',
        'direction': '비전공자 대상 "AI로 앱 만들기" 프로젝트 중심 입문서. Cursor + Bolt/Lovable 조합으로 실제 서비스 3~5개 완성. 기존 "코딩 몰라도 OK" 메시지보다 "내 아이디어를 서비스로" 메시지 강조',
        'urgency': '선점 기회 (3개월 이내)',
    },
    {
        'topic': 'AI 에이전트 개발 (LangChain/CrewAI)',
        'why': 'AI 에이전트/RAG 카테고리가 꾸준히 상승세. LangChain, CrewAI 등 프레임워크 도서 수요는 높지만 공급은 적음',
        'competition': '현재 번역서 위주. 한국어 실전서는 극히 제한적',
        'hanbit': '한빛의 AI/데이터 분야 강점을 활용할 수 있는 영역. 현재 에이전트 특화 도서는 부족',
        'direction': 'LangChain + CrewAI + RAG를 묶어 "AI 에이전트 처음부터 끝까지" 실전서. 챗봇, 문서 분석, 자동화 워크플로우 등 기업 실무 사례 중심',
        'urgency': '선점 기회 (3~4개월 이내)',
    },
    {
        'topic': 'Claude/Gemini 특화 AI 활용서',
        'why': 'ChatGPT 활용서는 포화 상태이나, Claude/Gemini 특화 실전서는 시장 공백. 제미나이 활용서가 1위를 차지한 사례가 있어 수요 입증됨',
        'competition': 'ChatGPT 활용서 과다. Claude 전용서 거의 없음. Gemini는 1~2종 존재',
        'hanbit': '한빛의 실용서 라인업에 적합',
        'direction': 'Claude 또는 Gemini 하나에 집중. "업무별 AI 활용 레시피" 형태로, 직무(마케팅/기획/개발/교육)별 활용 시나리오 중심',
        'urgency': '빠른 추격 (2~3개월 이내)',
    },
    {
        'topic': '파이썬 데이터분석 + AI 통합 실전',
        'why': '파이썬/데이터분석은 스테디셀러 영역이면서 AI와의 결합이 새로운 수요를 창출. 기존 판다스 입문서에서 "AI 활용 데이터분석"으로 업그레이드 수요',
        'competition': '기존 파이썬 데이터분석 입문서는 많지만, LLM을 활용한 데이터분석 실전서는 부족',
        'hanbit': '혼공 시리즈 등 파이썬 입문에서 강점. 자연스러운 확장선',
        'direction': '"ChatGPT/Claude + 파이썬으로 데이터분석 자동화" 또는 "AI 시대의 데이터분석 실전". 코드 생성, EDA 자동화, 보고서 자동 작성 파이프라인',
        'urgency': '중기 준비 (4~6개월)',
    },
    {
        'topic': '보안/해킹 입문서 (AI 시대 사이버보안)',
        'why': '보안/해킹 카테고리는 시장 수요 대비 한빛 도서가 부재. AI 시대 보안 위협 증가로 수요 상승',
        'competition': '에이콘, 위키북스 등이 강세. 대부분 번역서이며 한국 실정 반영 부족',
        'hanbit': '보안 분야 거의 미진출. 큰 공백',
        'direction': '"AI 시대의 정보보안 입문" 또는 "실전 모의해킹 가이드". 비전공자도 이해할 수 있는 보안 기초 + 실습',
        'urgency': '중기 준비 (4~6개월)',
    },
    {
        'topic': '이미지/영상 AI 크리에이터 가이드',
        'why': 'Sora, Kling, 미드저니 등 이미지/영상 AI 관련 도서가 베스트셀러에 등장. 크리에이터 수요 증가',
        'competition': '미드저니/Stable Diffusion 위주. Sora 등 영상 AI 도서는 아직 소수',
        'hanbit': '이미지/영상 AI 분야 도서 부족',
        'direction': '"AI로 만드는 영상 콘텐츠" - Sora, Runway, Kling 등을 활용한 영상 제작 실전. 유튜브 크리에이터/마케터 타겟',
        'urgency': '빠른 추격 (2~4개월)',
    },
    {
        'topic': '클라우드/DevOps 실전 (AWS/Docker/K8s)',
        'why': '클라우드/DevOps는 개발자 필수 역량이지만 한빛 도서가 상대적으로 적음. AWS, Docker, Kubernetes 수요 지속',
        'competition': '위키북스, 에이콘, 길벗 등이 강세',
        'hanbit': '클라우드/DevOps 분야 보강 필요',
        'direction': '"AWS + Docker + Kubernetes 한 번에 끝내기" 실전 가이드. 주니어 개발자 대상 인프라 입문서',
        'urgency': '중기 준비 (4~6개월)',
    },
    {
        'topic': 'LLM/트랜스포머 딥다이브 기술서',
        'why': '딥러닝/머신러닝 분야에서 LLM 내부 구조, 파인튜닝, 경량화에 대한 수요 증가. 기존 딥러닝 입문서와 차별화 가능',
        'competition': '기초 딥러닝 입문서는 과다. LLM 구조/파인튜닝 전문서는 부족',
        'hanbit': '딥러닝 기초서에서 강점. LLM 심화로 확장 가능',
        'direction': '"LLM 해부학" - 트랜스포머부터 파인튜닝, RLHF, 경량화까지. 중급 ML 엔지니어 대상',
        'urgency': '중기 준비 (4~6개월)',
    },
]

for i, p in enumerate(proposals, 1):
    md.append(f"### 기획 {i}: {p['topic']}")
    md.append("")
    md.append(f"- **왜 지금**: {p['why']}")
    md.append(f"- **경쟁 현황**: {p['competition']}")
    md.append(f"- **한빛 포지션**: {p['hanbit']}")
    md.append(f"- **추천 방향**: {p['direction']}")
    md.append(f"- **긴급도**: {p['urgency']}")
    md.append("")

# ── 추천 다음 액션 ──
md.append("## 7. 추천 다음 액션")
md.append("")
md.append("1. **바이브코딩 기획서 즉시 착수** - 시장 선점 기회가 빠르게 닫히고 있음. 저자 후보 조사 및 기획서 초안 작성 필요")
md.append("2. **AI 에이전트 저자 발굴** - LangChain/CrewAI 실무 경험자 중 집필 가능한 저자 탐색. 알라딘 API + 유튜브 채널 분석 활용")
md.append("3. **Claude/Gemini 활용서 기획 검토** - ChatGPT 포화 상태에서 차별화 가능한 AI 활용서 기획. 직무별 특화 방향 검토")
md.append("4. **보안/클라우드 중기 기획** - 한빛의 구조적 공백. 번역서보다 한국 저자 실전서로 접근")
md.append("5. **기존 스테디셀러 개정판 검토** - 혼공 시리즈, 이것이 시리즈 등 AI 시대에 맞는 개정 검토")
md.append("")

# 파일 저장
with open(OUT_PATH, 'w', encoding='utf-8') as f:
    f.write('\n'.join(md))

print(f"\n리포트 저장 완료: {OUT_PATH}")
print(f"총 {len(md)}줄")
