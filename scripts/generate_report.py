#!/usr/bin/env python3
"""
YES24 베스트셀러 자동 분석 리포트 생성기 v2
- Google Drive 공개 폴더에서 일별 엑셀 파일 감지
- 새 파일만 다운로드 → data/yes24/archive.json 누적
- Claude API로 시장 분석 리포트 생성
- data/reports/yes24_weekly.md 덮어쓰기
"""
import glob
import io
import json
import math
import os
import re
import sys
import urllib.request
import zipfile
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict
from datetime import datetime, timezone, date, timedelta

# ── 설정 ──
DRIVE_FOLDER_ID = "1hGsZv7zT6MmFdq2Ouiwrq4Ee72zg1o4O"

# 자사 분석 대상 출판사 — 환경변수로 설정(부분 일치 문자열). 빈 값이면 자사 분석 섹션 생략.
MY_PUBLISHER = os.environ.get("MY_PUBLISHER", "").strip()

# Windows cp949 인코딩 에러 방지
if sys.stdout.encoding and sys.stdout.encoding.lower().startswith("cp"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
YES24_DIR = os.path.join(SCRIPT_DIR, "..", "data", "yes24")
# CI가 매일 자동 수집한 엑셀을 커밋해두는 폴더 (download_yes24.py 출력 대상)
DAILY_DIR = os.path.join(YES24_DIR, "daily")
ARCHIVE_PATH = os.path.join(YES24_DIR, "archive.json")
REPORTS_DIR = os.path.join(SCRIPT_DIR, "..", "data", "reports")
REPORT_PATH = os.path.join(REPORTS_DIR, "yes24_weekly.md")
TODAY = datetime.now(timezone.utc).strftime("%Y-%m-%d")


# ══════════════════════════════════════════════════════
# 1. Google Drive 폴더에서 파일 목록 가져오기
# ══════════════════════════════════════════════════════

def list_drive_files() -> list[dict]:
    """공개 Drive 폴더의 엑셀 파일 목록을 가져온다."""
    print("📂 Google Drive 폴더 스캔...")
    url = f"https://drive.google.com/embeddedfolderview?id={DRIVE_FOLDER_ID}"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            html = r.read().decode("utf-8", "replace")
    except Exception as e:
        print(f"  ⚠ 폴더 접근 실패: {e}", file=sys.stderr)
        return []

    # HTML에서 파일 ID와 이름 추출
    ids = re.findall(r'/file/d/([a-zA-Z0-9_-]+)', html)
    names = re.findall(r'class="flip-entry-title">(.*?)<', html)

    files = []
    for fid, fname in zip(ids, names):
        # 날짜 추출: 20260101_yes24... → 2026-01-01
        m = re.match(r"(\d{4})(\d{2})(\d{2})", fname)
        if not m or not fname.endswith(".xlsx"):
            continue
        date = f"{m.group(1)}-{m.group(2)}-{m.group(3)}"
        files.append({"id": fid, "name": fname, "date": date})

    files.sort(key=lambda f: f["date"])
    print(f"   {len(files)}개 엑셀 파일 발견 ({files[0]['date']} ~ {files[-1]['date']})" if files else "   파일 없음")
    return files


# ══════════════════════════════════════════════════════
# 2. 엑셀 파일 다운로드 + 파싱 (순수 Python, 외부 라이브러리 없음)
# ══════════════════════════════════════════════════════

def download_xlsx(file_id: str) -> bytes | None:
    """Drive 파일을 다운로드한다."""
    url = f"https://drive.google.com/uc?export=download&id={file_id}"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.read()
    except Exception as e:
        print(f"  ⚠ 다운로드 실패: {e}", file=sys.stderr)
        return None


def parse_xlsx(data: bytes) -> list[dict]:
    """xlsx 바이너리를 순수 Python으로 파싱한다."""
    try:
        zf = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile:
        return []

    # shared strings 로드
    strings = []
    if "xl/sharedStrings.xml" in zf.namelist():
        ss_xml = zf.read("xl/sharedStrings.xml")
        ss_root = ET.fromstring(ss_xml)
        ns = re.match(r"\{.*\}", ss_root.tag)
        ns = ns.group(0) if ns else ""
        for si in ss_root.findall(f".//{ns}si"):
            texts = []
            for t in si.findall(f".//{ns}t"):
                if t.text:
                    texts.append(t.text)
            strings.append("".join(texts))

    # sheet1 파싱
    sheet_path = "xl/worksheets/sheet1.xml"
    if sheet_path not in zf.namelist():
        return []

    sheet_xml = zf.read(sheet_path)
    sheet_root = ET.fromstring(sheet_xml)
    ns = re.match(r"\{.*\}", sheet_root.tag)
    ns = ns.group(0) if ns else ""

    rows_data = []
    for row_el in sheet_root.findall(f".//{ns}row"):
        cells = {}
        for c_el in row_el.findall(f"{ns}c"):
            ref = c_el.get("r", "")
            col = re.match(r"([A-Z]+)", ref)
            if not col:
                continue
            col = col.group(1)
            t = c_el.get("t", "")
            v_el = c_el.find(f"{ns}v")
            val = v_el.text if v_el is not None else ""

            if t == "s" and val.isdigit():
                idx = int(val)
                val = strings[idx] if idx < len(strings) else val
            cells[col] = val
        if cells:
            rows_data.append(cells)

    if not rows_data:
        return []

    # 헤더 감지 (첫 행)
    header_row = rows_data[0]
    col_map = {}
    for col, val in header_row.items():
        vl = str(val).strip().lower()
        if vl in ("순위", "rank"):
            col_map["rank"] = col
        elif vl in ("상품명", "제목", "도서명", "도서 제목"):
            col_map["title"] = col
        elif vl in ("저자", "작가"):
            col_map["author"] = col
        elif vl in ("출판사",):
            col_map["publisher"] = col
        elif "가격" in vl or "판매가" in vl or "정가" in vl:
            col_map["price"] = col
        elif vl in ("isbn",):
            col_map["isbn"] = col

    # 헤더 없으면 위치 기반 추정
    if "title" not in col_map:
        # 열이 A, B, C... 순서대로 순위, 상품명, ... 일 가능성
        cols = sorted(header_row.keys())
        if len(cols) >= 4:
            col_map = {"rank": cols[0], "title": cols[1], "author": cols[2], "publisher": cols[3]}
            if len(cols) >= 5:
                col_map["price"] = cols[4]
            # 첫 행도 데이터일 수 있음
            start = 0
        else:
            return []
    else:
        start = 1

    items = []
    for row in rows_data[start:]:
        title = str(row.get(col_map.get("title", ""), "")).strip()
        if not title or len(title) < 2:
            continue
        rank_val = str(row.get(col_map.get("rank", ""), "")).strip()
        items.append({
            "rank": int(float(rank_val)) if rank_val.replace(".", "").isdigit() else 0,
            "title": title,
            "author": str(row.get(col_map.get("author", ""), "")).strip(),
            "publisher": str(row.get(col_map.get("publisher", ""), "")).strip(),
            "price": str(row.get(col_map.get("price", ""), "")).strip(),
        })

    return items


# ══════════════════════════════════════════════════════
# 3. 아카이브 관리
# ══════════════════════════════════════════════════════

def load_archive() -> dict:
    if os.path.exists(ARCHIVE_PATH):
        with open(ARCHIVE_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    return {"snapshots": {}, "first_date": "", "last_date": "", "total_days": 0}


def _missing_dates(archive: dict) -> list[str]:
    """first~last 사이 빠진 날짜 목록 (report_gaps·meta.js 공용)."""
    dates = sorted(archive["snapshots"].keys())
    if len(dates) < 2:
        return []
    d0, d1 = date.fromisoformat(dates[0]), date.fromisoformat(dates[-1])
    have = set(dates)
    missing, cur = [], d0
    while cur <= d1:
        if cur.isoformat() not in have:
            missing.append(cur.isoformat())
        cur += timedelta(days=1)
    return missing


# ══════════════════════════════════════════════════════
# 시장 역학 지표 (모멘텀·변동성·집중도) — panel23 차트용 insights.js
# 결측(200위 밖으로 나간 날)은 값을 지어내지 않고 "등장한 날만" 사용한다.
# ══════════════════════════════════════════════════════
MOMENTUM_WINDOW = 30   # 모멘텀·현재 상태 판정 최근 창(일)
MIN_PTS = 5            # 기울기 계산 최소 표본(등장일)


def _linreg_slope(xs: list, ys: list) -> float:
    """최소제곱 기울기(순위/일). xs=일 인덱스, ys=순위."""
    n = len(xs)
    sx, sy = sum(xs), sum(ys)
    denom = n * sum(x * x for x in xs) - sx * sx
    if denom == 0:
        return 0.0
    return (n * sum(x * y for x, y in zip(xs, ys)) - sx * sy) / denom


def _stdev(ys: list) -> float:
    n = len(ys)
    if n < 2:
        return 0.0
    m = sum(ys) / n
    return math.sqrt(sum((y - m) ** 2 for y in ys) / (n - 1))


def _opp_reason(mom: float, hh: dict, grade: str) -> str:
    trend = (f"상승세 +{mom:.1f}/일" if mom > 0.2
             else f"하락세 {mom:.1f}/일" if mom < -0.2 else "보합")
    comp = "경쟁 분산" if hh["hhi"] < 0.25 else "과점"
    verdict = {"선점": "지금 선점 적기", "차별화": "차별화 필수",
               "관망": "관망", "회피": "회피"}[grade]
    return (f"{trend} · {comp}(HHI {hh['hhi']:.2f}·{hh['pubs']}개 출판사, "
            f"1위 {hh['top_pub']} {round(hh['top_share'] * 100)}%) · "
            f"{hh['books']}종 → {verdict}")


def compute_insights(archive: dict) -> dict:
    dates = sorted(archive["snapshots"].keys())
    series = defaultdict(list)   # title -> [(ordinal, rank)]
    info = {}
    for d in dates:
        o = date.fromisoformat(d).toordinal()
        for it in archive["snapshots"][d]:
            t = it.get("title")
            if not t:
                continue
            if it.get("rank"):
                series[t].append((o, it["rank"]))
            if t not in info:
                info[t] = it.get("publisher", "") or "(미상)"
    recent_start = date.fromisoformat(dates[-1]).toordinal() - MOMENTUM_WINDOW + 1

    momentum, steady_pool, scatter = [], [], []
    book_climb, book_first = {}, {}   # 주제 종합용: 책별 상승세·첫등장
    for t, recs in series.items():
        recs.sort()
        ranks = [r for (_, r) in recs]
        avg_all = sum(ranks) / len(ranks)
        sd_all = round(_stdev(ranks), 1)   # 순위 표준편차 = 밴드 폭(작을수록 안정)
        days = len(recs)
        book_first[t] = recs[0][0]

        # ② 변동성 산점도 — 어느 정도 등장한 도서만 (x=평균순위, y=std)
        if days >= 20:
            scatter.append({"t": t, "rank": round(avg_all, 1), "sd": sd_all, "days": days})
        # ② 진짜 스테디셀러 — 오래 지속 + 좁은 순위 밴드(중위권도 포함)
        if days >= 60:
            steady_pool.append({"t": t, "pub": info[t], "rank": round(avg_all, 1),
                                "sd": sd_all, "days": days})
        # ① 모멘텀 — 최근 창의 순위 기울기(상승=순위 감소이므로 부호 반전)
        win = [(o, r) for (o, r) in recs if o >= recent_start]
        if len(win) >= MIN_PTS:
            xs = [o - recent_start for (o, _) in win]
            ys = [r for (_, r) in win]
            climb = -_linreg_slope(xs, ys)   # +면 상승(빨라짐), -면 하락
            book_climb[t] = climb
            momentum.append({"t": t, "pub": info[t], "climb": round(climb, 2),
                             "cur": win[-1][1], "pts": len(win)})

    momentum.sort(key=lambda m: -m["climb"])
    rising = [m for m in momentum if m["climb"] > 0.3 and m["cur"] <= 60][:15]
    falling = sorted([m for m in momentum if m["climb"] < -0.3],
                     key=lambda m: m["climb"])[:15]
    steady_pool.sort(key=lambda s: s["sd"])   # 가장 안정적(밴드 좁음) 순
    scatter.sort(key=lambda s: s["rank"])

    # ④ 주제별 출판사 집중도 HHI = Σ(등장일 점유율²), 1에 가까울수록 과점
    topic_pub_days = defaultdict(lambda: defaultdict(int))
    topic_books = defaultdict(set)
    for t, recs in series.items():
        for topic in _classify_topics_multi(t):
            topic_pub_days[topic][info[t]] += len(recs)
            topic_books[topic].add(t)
    hhi = []
    for topic, pubdays in topic_pub_days.items():
        if topic == "기타" or len(topic_books[topic]) < 5:
            continue
        total = sum(pubdays.values()) or 1
        h = sum((v / total) ** 2 for v in pubdays.values())
        top_pub, top_dv = max(pubdays.items(), key=lambda x: x[1])
        hhi.append({"topic": topic, "hhi": round(h, 3), "top_pub": top_pub,
                    "top_share": round(top_dv / total, 3),
                    "books": len(topic_books[topic]), "pubs": len(pubdays)})
    hhi.sort(key=lambda h: -h["hhi"])

    # ⑤ 주제별 기획 기회 종합 — 3지표(모멘텀·경쟁여유·시장크기)를 한 점수로 융합
    #    기회 점수 = max(모멘텀,0) × 경쟁여유(1−HHI).  시장 크기는 곱이 아니라 게이트(작은 니치 제외).
    #    등급: 뜨는가(mom>0.2) × 자리있나(HHI<0.25) → 선점/차별화/관망/회피 4분면.
    hhi_by_topic = {h["topic"]: h for h in hhi}
    opp = []
    for topic in topic_books:
        hh = hhi_by_topic.get(topic)
        if not hh:   # 기타·5종 미만은 hhi에서 이미 제외됨
            continue
        # 주제 모멘텀 = 신간 스파이크 제외(창 시작 전부터 있던 책)들의 평균 상승세
        climbs = [book_climb[t] for t in topic_books[topic]
                  if t in book_climb and book_first[t] < recent_start]
        mom = round(sum(climbs) / len(climbs), 2) if climbs else 0.0
        size = sum(topic_pub_days[topic].values())   # 등장일 합 = 시장 규모
        room = round(1 - hh["hhi"], 3)
        is_rising, is_open = mom > 0.2, hh["hhi"] < 0.25
        grade = ("선점" if is_rising and is_open else "차별화" if is_rising and not is_open
                 else "관망" if not is_rising and is_open else "회피")
        opp.append({"topic": topic, "mom": mom, "hhi": hh["hhi"], "room": room,
                    "books": hh["books"], "pubs": hh["pubs"], "size": size,
                    "top_pub": hh["top_pub"], "top_share": hh["top_share"],
                    "grade": grade, "score": round(max(mom, 0) * room, 3),
                    "reason": _opp_reason(mom, hh, grade)})
    opp.sort(key=lambda o: -o["score"])
    # 결론 TOP3 — 시장 크기 게이트(8종 이상) 통과 + 상승세(선점/차별화) 중 점수순
    top = [o for o in opp if o["books"] >= 8 and o["grade"] in ("선점", "차별화")][:3]

    return {"generated": dates[-1], "window_days": MOMENTUM_WINDOW,
            "momentum": {"rising": rising, "falling": falling},
            "steady": steady_pool[:15], "scatter": scatter[:400], "hhi": hhi,
            "opportunity": {"top": top, "topics": opp}}


def save_insights(archive: dict):
    """panel23 시장 역학 차트용 경량 데이터 (window.YES24_INSIGHTS)."""
    os.makedirs(YES24_DIR, exist_ok=True)
    ins = compute_insights(archive)
    with open(os.path.join(YES24_DIR, "insights.js"), "w", encoding="utf-8") as f:
        f.write("window.YES24_INSIGHTS = ")
        json.dump(ins, f, ensure_ascii=False)
        f.write(";")
    print(f"📊 시장 역학 지표: 급상승 {len(ins['momentum']['rising'])}·"
          f"스테디 {len(ins['steady'])}·주제 HHI {len(ins['hhi'])}")


def save_archive(archive: dict):
    os.makedirs(YES24_DIR, exist_ok=True)
    with open(ARCHIVE_PATH, "w", encoding="utf-8") as f:
        json.dump(archive, f, ensure_ascii=False)

    js_path = os.path.join(YES24_DIR, "archive.js")
    with open(js_path, "w", encoding="utf-8") as f:
        f.write("window._YES24_ARCHIVE = ")
        json.dump(archive, f, ensure_ascii=False)
        f.write(";")

    # 홈 브리핑 신선도 칩용 경량 메타 (archive.js 7MB를 홈에서 로드하지 않기 위함)
    meta = {"last_date": archive.get("last_date", ""),
            "total_days": archive.get("total_days", 0),
            "missing_days": len(_missing_dates(archive))}
    with open(os.path.join(YES24_DIR, "meta.js"), "w", encoding="utf-8") as f:
        f.write("window.YES24_META = ")
        json.dump(meta, f, ensure_ascii=False)
        f.write(";")


# ══════════════════════════════════════════════════════
# 4. 통계 계산
# ══════════════════════════════════════════════════════

TOPIC_KW = {
    "AI/LLM 일반": ["ai", "인공지능", "llm", "gpt", "클로드", "제미나이", "생성형", "챗gpt", "오픈ai", "openai", "claude", "gemini"],
    "바이브코딩/노코드": ["바이브 코딩", "바이브코딩", "vibe coding", "노코드", "로우코드"],
    "AI 에이전트/RAG": ["에이전트", "agent", "rag", "랭체인", "langchain", "langgraph", "mcp", "에이전틱"],
    "프롬프트/활용": ["프롬프트", "prompt", "ai 활용", "업무 자동화", "활용법", "활용 가이드"],
    "이미지/영상 AI": ["이미지 생성", "stable diffusion", "미드저니", "comfyui", "영상 ai", "sora", "캡컷", "영상 편집", "ai 영상", "ai 쇼츠"],
    "데이터분석/사이언스": ["데이터 분석", "데이터분석", "판다스", "pandas", "데이터 사이언스", "통계", "r 프로그래밍"],
    "딥러닝/머신러닝": ["딥러닝", "머신러닝", "deep learning", "machine learning", "텐서플로", "파이토치", "트랜스포머"],
    "파이썬": ["파이썬", "python", "점프 투 파이썬"],
    "웹개발": ["웹", "리액트", "react", "next.js", "스프링", "spring", "html", "css", "자바스크립트", "타입스크립트"],
    "앱개발/모바일": ["앱 개발", "flutter", "swift", "코틀린", "안드로이드", "ios"],
    "컴퓨터과학/기초": ["컴퓨터 개론", "자료구조", "알고리즘", "운영체제", "컴퓨팅", "이산수학", "c언어", "c++", "자바 프로그래밍"],
    "클라우드/DevOps": ["클라우드", "aws", "azure", "도커", "쿠버네티스", "kubernetes", "devops", "terraform"],
    "보안/해킹": ["보안", "해킹", "정보보안", "사이버", "모의침투"],
    "엑셀/오피스": ["엑셀", "excel", "파워포인트", "한글", "오피스", "워드"],
    "게임개발": ["게임 개발", "유니티", "unity", "언리얼", "unreal", "게임 프로그래밍"],
    "비전공자/교양": ["비전공자", "교양", "코딩 입문", "처음 배우는", "쉽게 배우는", "혼자 공부"],
    "자격증/취업": ["자격증", "정보처리", "취업", "코딩 테스트", "코딩테스트"],
    "로봇/IoT/하드웨어": ["로봇", "아두이노", "라즈베리", "iot", "반도체", "하드웨어", "임베디드"],
    "블록체인/Web3": ["블록체인", "web3", "nft", "솔리디티", "이더리움"],
}

def _classify_topic(title: str) -> str:
    """첫 매칭 주제 반환 (단일 분류용)."""
    tl = title.lower()
    for topic, kws in TOPIC_KW.items():
        if any(k in tl for k in kws):
            return topic
    return "기타"

def _classify_topics_multi(title: str) -> list[str]:
    """매칭되는 모든 주제 반환 (복수 분류용)."""
    tl = title.lower()
    matched = []
    for topic, kws in TOPIC_KW.items():
        if any(k in tl for k in kws):
            matched.append(topic)
    return matched if matched else ["기타"]

def compute_stats(archive: dict) -> str:
    dates = sorted(archive["snapshots"].keys())
    all_records = []
    for d in dates:
        for item in archive["snapshots"][d]:
            all_records.append({**item, "date": d})

    unique_titles = set(r["title"] for r in all_records)
    date_range = f"{dates[0]} ~ {dates[-1]}"
    num_days = len(dates)

    # 도서별 등장일수 + 평균 순위
    title_days = defaultdict(set)
    title_ranks = defaultdict(list)
    title_info = {}
    title_first = {}
    for r in all_records:
        t = r["title"]
        title_days[t].add(r["date"])
        if r["rank"]:
            title_ranks[t].append(r["rank"])
        if t not in title_info:
            title_info[t] = {k: r[k] for k in ("author", "publisher", "price") if k in r}
        if t not in title_first or r["date"] < title_first[t]:
            title_first[t] = r["date"]

    # 출판사 점유율
    pub_book_cnt = Counter(title_info[t].get("publisher", "") for t in unique_titles if title_info[t].get("publisher"))
    pub_days = defaultdict(int)
    for t, days in title_days.items():
        pub = title_info[t].get("publisher", "")
        if pub:
            pub_days[pub] += len(days)
    total_days_all = sum(pub_days.values()) or 1
    pub_top20 = sorted(pub_book_cnt.items(), key=lambda x: -x[1])[:20]

    # 가격대 분포
    price_bins = defaultdict(int)
    for t in unique_titles:
        p = title_info[t].get("price", "")
        m = re.search(r"[\d,]+", p.replace(",", ""))
        if m:
            val = int(m.group().replace(",", "")) if m.group().replace(",", "").isdigit() else 0
            if val < 15000: b = "0~15천원"
            elif val < 20000: b = "15~20천원"
            elif val < 25000: b = "20~25천원"
            elif val < 30000: b = "25~30천원"
            elif val < 35000: b = "30~35천원"
            elif val < 40000: b = "35~40천원"
            elif val < 50000: b = "40~50천원"
            else: b = "50천원 이상"
            price_bins[b] += 1

    # 월별 신규 진입
    monthly_new = defaultdict(set)
    seen = set()
    for d in dates:
        month = d[:7]
        for item in archive["snapshots"][d]:
            if item["title"] not in seen:
                seen.add(item["title"])
                monthly_new[month].add(item["title"])

    # ── 주제별 분석 (복수 분류: 한 도서가 여러 주제에 포함) ──
    topic_titles = defaultdict(set)
    for t in unique_titles:
        for topic in _classify_topics_multi(t):
            topic_titles[topic].add(t)

    topic_stats = []
    recent30 = set(dates[-30:]) if len(dates) >= 30 else set(dates)
    prev30 = set(dates[-60:-30]) if len(dates) >= 60 else set()
    for topic, titles in sorted(topic_titles.items(), key=lambda x: -len(x[1])):
        ranks = []
        day_counts = []
        r30 = set()
        p30 = set()
        for t in titles:
            ranks.extend(title_ranks[t])
            day_counts.append(len(title_days[t]))
            for d in title_days[t]:
                if d in recent30: r30.add(t)
                if d in prev30: p30.add(t)
        avg_rank = sum(ranks) / len(ranks) if ranks else 0
        avg_days = sum(day_counts) / len(day_counts) if day_counts else 0
        if prev30:
            trend = "📈 상승" if len(r30) > len(p30) * 1.1 else ("📉 하락" if len(r30) < len(p30) * 0.9 else "➡️ 유지")
        else:
            trend = "➡️ 유지"
        topic_stats.append((topic, len(titles), avg_rank, avg_days, len(r30), trend))

    # 주제별 출판사 점유
    topic_pubs = {}
    for topic, titles in topic_titles.items():
        pc = Counter(title_info[t].get("publisher", "") for t in titles if title_info[t].get("publisher"))
        topic_pubs[topic] = pc.most_common(5)

    # ── 트렌드 분석 ──
    # 급상승 도서 (최근 30일 vs 이전) — 현재 상위권 도서 중 상승폭 큰 순
    surge_books = []
    if len(dates) >= 60:
        r30_set = set(dates[-30:])
        p30_set = set(dates[-60:-30])
        for t in unique_titles:
            r_ranks = [r["rank"] for r in all_records if r["title"] == t and r["date"] in r30_set and r["rank"]]
            p_ranks = [r["rank"] for r in all_records if r["title"] == t and r["date"] in p30_set and r["rank"]]
            if r_ranks and p_ranks:
                r_avg = sum(r_ranks) / len(r_ranks)
                p_avg = sum(p_ranks) / len(p_ranks)
                if p_avg - r_avg >= 5 and r_avg <= 30:  # 현재 30위 이내 + 5순위 이상 상승
                    surge_books.append((round(r_avg), round(p_avg), round(p_avg - r_avg), t, title_info[t].get("publisher", "")))
        surge_books.sort(key=lambda x: -x[2])  # 상승폭 큰 순

    # 장기 스테디셀러 (100일+ 등장)
    steady_threshold = 100 if num_days >= 100 else max(int(num_days * 0.7), 10)
    steady = [(t, len(title_days[t]), sum(title_ranks[t]) / len(title_ranks[t]) if title_ranks[t] else 0, title_info[t].get("publisher", ""))
              for t in unique_titles if len(title_days[t]) >= steady_threshold]
    steady.sort(key=lambda x: -x[1])

    # 신규 트렌드 (최근 60일 첫 등장)
    cutoff_60 = dates[-60] if len(dates) >= 60 else dates[0]
    new_trend = []
    for t in unique_titles:
        if title_first[t] >= cutoff_60:
            best_rank = min(title_ranks[t]) if title_ranks[t] else 999
            nd = len(title_days[t])
            if nd >= 2 and best_rank <= 30:
                new_trend.append((title_first[t], best_rank, nd, t, title_info[t].get("publisher", "")))
    new_trend.sort(key=lambda x: (x[1], -x[2]))

    # ── 자사 분석 (MY_PUBLISHER 설정 시에만) ──
    my_titles = []
    my_topic = defaultdict(int)
    my_books = []
    if MY_PUBLISHER:
        my_titles = [t for t in unique_titles if MY_PUBLISHER in title_info[t].get("publisher", "")]
        for t in my_titles:
            for topic in _classify_topics_multi(t):
                my_topic[topic] += 1
        for t in my_titles:
            avg = sum(title_ranks[t]) / len(title_ranks[t]) if title_ranks[t] else 999
            nd = len(title_days[t])
            topics = ", ".join(_classify_topics_multi(t))
            my_books.append((avg, nd, t, topics))
        my_books.sort(key=lambda x: x[0])

    # ── 리포트 조합 ──
    L = []
    L.append(f"## 1. 기본 통계\n")
    L.append(f"- 분석 대상 파일: {num_days}개")
    L.append(f"- 총 레코드 수: {len(all_records):,}건")
    L.append(f"- 고유 도서 수: {len(unique_titles):,}권\n")

    L.append(f"### 출판사별 도서 수 (상위 20)\n")
    L.append(f"| 순위 | 출판사 | 도서 수 | 점유율(등장일수) |")
    L.append(f"|---:|--------|-------:|--------:|")
    for i, (pub, cnt) in enumerate(pub_top20, 1):
        share = pub_days.get(pub, 0) / total_days_all * 100
        L.append(f"| {i} | {pub} | {cnt}권 | {share:.1f}% |")

    if price_bins:
        L.append(f"\n### 가격대 분포\n")
        L.append(f"| 가격대 | 도서 수 | 비율 |")
        L.append(f"|--------|-------:|-----:|")
        total_priced = sum(price_bins.values()) or 1
        for b in ["0~15천원", "15~20천원", "20~25천원", "25~30천원", "30~35천원", "35~40천원", "40~50천원", "50천원 이상"]:
            if b in price_bins:
                L.append(f"| {b} | {price_bins[b]}권 | {price_bins[b]/total_priced*100:.1f}% |")

    L.append(f"\n### 월별 신규 진입 도서 수\n")
    L.append(f"| 월 | 신규 도서 |")
    L.append(f"|-----|--------:|")
    for m in sorted(monthly_new.keys()):
        L.append(f"| {m} | {len(monthly_new[m])}권 |")

    # ── 2. 주제별 분석 ──
    L.append(f"\n## 2. 주제별 분석\n")
    L.append(f"| 주제 | 도서 수 | 평균순위 | 평균등장일 | 최근30일 도서 | 트렌드 |")
    L.append(f"|------|-------:|--------:|--------:|----------:|-----:|")
    for topic, cnt, avg_r, avg_d, r30_cnt, trend in topic_stats:
        L.append(f"| {topic} | {cnt}권 | {avg_r:.1f} | {avg_d:.0f}일 | {r30_cnt}권 | {trend} |")

    L.append(f"\n### 주제별 주요 출판사 점유\n")
    for topic in sorted(topic_pubs.keys()):
        pubs = topic_pubs[topic]
        if pubs:
            pub_str = ", ".join(f"{p}({c})" for p, c in pubs)
            L.append(f"- **{topic}**: {pub_str}")

    # ── 3. 트렌드 분석 ──
    L.append(f"\n## 3. 트렌드 분석\n")
    if surge_books:
        L.append(f"### 급상승 도서 (최근 30일)\n")
        L.append(f"| 현재 순위 | 이전 순위 | 상승폭 | 도서명 | 출판사 |")
        L.append(f"|--------:|--------:|------:|--------|--------|")
        for r_avg, p_avg, diff, t, pub in surge_books[:15]:
            L.append(f"| {r_avg}위 | {p_avg}위 | +{diff} | {t} | {pub} |")

    if steady:
        L.append(f"\n### 장기 스테디셀러 ({steady_threshold}일 이상 등장)\n")
        L.append(f"| 등장일수 | 평균순위 | 도서명 | 출판사 |")
        L.append(f"|-------:|-------:|--------|--------|")
        for t, nd, avg, pub in steady[:20]:
            L.append(f"| {nd}일 | {avg:.0f}위 | {t} | {pub} |")

    if new_trend:
        L.append(f"\n### 신규 트렌드 (최근 60일 내 첫 등장)\n")
        L.append(f"| 첫등장 | 최고순위 | 등장일 | 도서명 | 출판사 |")
        L.append(f"|-------|-------:|------:|--------|--------|")
        for first, best, nd, t, pub in new_trend[:20]:
            L.append(f"| {first} | {best}위 | {nd}일 | {t} | {pub} |")

    # ── 4. 자사 분석 (MY_PUBLISHER 설정 시에만 생성) ──
    # 자사 섹션 유무에 따라 이후 섹션 번호가 어긋나지 않도록 동적으로 계산한다.
    sec_no = 4
    if MY_PUBLISHER:
        L.append(f"\n## {sec_no}. {MY_PUBLISHER} 분석\n")
        L.append(f"{MY_PUBLISHER} 베스트셀러 진입 도서: **{len(my_titles)}권**\n")

        L.append(f"### {MY_PUBLISHER} 베스트셀러 도서\n")
        L.append(f"| 평균순위 | 등장일 | 도서명 | 주제 |")
        L.append(f"|-------:|------:|--------|------|")
        for avg, nd, t, topic in my_books[:25]:
            L.append(f"| {avg:.0f}위 | {nd}일 | {t} | {topic} |")

        L.append(f"\n### {MY_PUBLISHER} 주제 분포\n")
        L.append(f"| 주제 | 자사 도서 수 | 전체 시장 | 점유율 |")
        L.append(f"|------|----------:|--------:|------:|")
        for topic in sorted(topic_titles.keys()):
            hcnt = my_topic.get(topic, 0)
            tcnt = len(topic_titles[topic])
            share = hcnt / tcnt * 100 if tcnt else 0
            L.append(f"| {topic} | {hcnt}권 | {tcnt}권 | {share:.0f}% |")

        # 자사 공백
        weak = [(topic, len(topic_titles[topic]), my_topic.get(topic, 0))
                for topic in topic_titles if my_topic.get(topic, 0) <= 1 and len(topic_titles[topic]) >= 5]
        if weak:
            L.append(f"\n### {MY_PUBLISHER}가 약한 영역 (공백)\n")
            L.append(f"| 주제 | 전체 도서 | 자사 도서 | 주요 경쟁사 |")
            L.append(f"|------|--------:|--------:|------------|")
            for topic, total, hcnt in sorted(weak, key=lambda x: -x[1]):
                competitors = ", ".join(p for p, _ in topic_pubs.get(topic, [])[:3])
                L.append(f"| {topic} | {total}권 | {hcnt}권 | {competitors} |")

        sec_no += 1

    # ── 주제별 경쟁서 상세 (기타 제외, 전체 주제) ──
    L.append(f"\n## {sec_no}. 주제별 경쟁서 상세\n")
    top_topics = sorted(((t, ts) for t, ts in topic_titles.items() if t != "기타"), key=lambda x: -len(x[1]))
    for topic, titles in top_topics:
        books = []
        for t in titles:
            avg = sum(title_ranks[t]) / len(title_ranks[t]) if title_ranks[t] else 999
            nd = len(title_days[t])
            books.append((avg, nd, t, title_info[t].get("publisher", "")))
        books.sort(key=lambda x: x[0])
        L.append(f"### {topic} ({len(titles)}권)\n")
        L.append(f"| 평균순위 | 등장일 | 도서명 | 출판사 |")
        L.append(f"|-------:|------:|--------|--------|")
        for avg, nd, t, pub in books[:10]:
            L.append(f"| {avg:.0f}위 | {nd}일 | {t} | {pub} |")
        L.append("")

    return "\n".join(L)


# ══════════════════════════════════════════════════════
# 4-b. Claude 미사용 시 통계 기반 폴백 인사이트 생성
# ══════════════════════════════════════════════════════

def generate_fallback_insights(archive: dict) -> str:
    """Claude API 없이 archive 데이터만으로 핵심 인사이트 5줄을 생성한다."""
    dates = sorted(archive["snapshots"].keys())
    if not dates:
        return ""

    all_records = []
    for d in dates:
        for item in archive["snapshots"][d]:
            all_records.append({**item, "date": d})

    unique_titles = set(r["title"] for r in all_records)
    title_days: dict = defaultdict(set)
    title_ranks: dict = defaultdict(list)
    title_info: dict = {}
    title_first: dict = {}
    for r in all_records:
        t = r["title"]
        title_days[t].add(r["date"])
        if r.get("rank"):
            title_ranks[t].append(r["rank"])
        if t not in title_info:
            title_info[t] = {k: r[k] for k in ("author", "publisher") if k in r}
        if t not in title_first or r["date"] < title_first[t]:
            title_first[t] = r["date"]

    num_days = len(dates)
    recent30 = set(dates[-30:]) if len(dates) >= 30 else set(dates)
    prev30   = set(dates[-60:-30]) if len(dates) >= 60 else set()

    # 주제별 집계
    topic_titles: dict = defaultdict(set)
    for t in unique_titles:
        for topic in _classify_topics_multi(t):
            topic_titles[topic].add(t)

    topic_stats = []
    for topic, titles in sorted(topic_titles.items(), key=lambda x: -len(x[1])):
        r30 = set(t for t in titles if any(d in recent30 for d in title_days[t]))
        p30 = set(t for t in titles if any(d in prev30  for d in title_days[t]))
        ranks = [rk for t in titles for rk in title_ranks[t]]
        avg_r = sum(ranks) / len(ranks) if ranks else 999
        avg_d = sum(len(title_days[t]) for t in titles) / len(titles) if titles else 0
        if prev30:
            trend = "📈 상승" if len(r30) > len(p30) * 1.1 else ("📉 하락" if len(r30) < len(p30) * 0.9 else "➡️ 유지")
        else:
            trend = "➡️ 유지"
        topic_stats.append((topic, len(titles), avg_r, avg_d, trend))

    # 출판사 점유
    pub_days: dict = defaultdict(int)
    for t, days in title_days.items():
        pub = title_info.get(t, {}).get("publisher", "")
        if pub:
            pub_days[pub] += len(days)
    total_days_all = sum(pub_days.values()) or 1
    top_pub = sorted(pub_days.items(), key=lambda x: -x[1])

    # 스테디셀러 (70일+)
    steady_thr = max(int(num_days * 0.5), 10)
    steady = sorted(
        [(t, len(title_days[t]), min(title_ranks[t]) if title_ranks[t] else 999, title_info.get(t, {}).get("publisher", ""))
         for t in unique_titles if len(title_days[t]) >= steady_thr],
        key=lambda x: -x[1]
    )

    # 신규 급상승 (최근 60일 첫 등장, 30위 이내)
    cutoff_60 = dates[-60] if len(dates) >= 60 else dates[0]
    new_surge = sorted(
        [(t, min(title_ranks[t]) if title_ranks[t] else 999, len(title_days[t]), title_info.get(t, {}).get("publisher", ""))
         for t in unique_titles if title_first.get(t, "") >= cutoff_60 and len(title_days[t]) >= 3 and min(title_ranks.get(t, [999])) <= 30],
        key=lambda x: x[1]
    )

    # ── 인사이트 문장 생성 ──
    insights = []

    # 1. 최대 카테고리
    top_topic = max(topic_stats, key=lambda x: x[1]) if topic_stats else None
    if top_topic:
        insights.append(
            f"**{top_topic[0]} 카테고리가 {top_topic[1]}권으로 최다 출판.** "
            f"평균 순위 {top_topic[2]:.0f}위, 평균 등장 {top_topic[3]:.0f}일. "
            f"IT 베스트셀러의 핵심 카테고리다."
        )

    # 2. 상승 트렌드 카테고리
    rising = [t for t in topic_stats if t[4] == "📈 상승"]
    if rising:
        names = "·".join(t[0] for t in rising[:3])
        insights.append(
            f"**{names} 카테고리가 최근 30일 트렌드 상승 중.** "
            f"최근 출간 도서가 전달보다 10% 이상 증가한 신호다."
        )

    # 3. 시장 집중도 (출판사를 주인공화하지 않고 구조를 서술)
    if top_pub:
        p1, d1 = top_pub[0]
        p2, d2 = top_pub[1] if len(top_pub) > 1 else ("", 0)
        share1 = d1 / total_days_all * 100
        share2 = d2 / total_days_all * 100 if d2 else 0
        top3 = sum(d for _, d in top_pub[:3]) / total_days_all * 100
        insights.append(
            f"**출판사 집중도 — 상위 3사가 등장일 점유율 {top3:.0f}%를 차지.** "
            + (f"선두 {p1}({share1:.1f}%)·{p2}({share2:.1f}%) 순으로, 나머지는 다수 출판사에 분산돼 있다." if p2
               else f"{p1}({share1:.1f}%)가 최상위다.")
        )

    # 4. 스테디셀러
    if steady:
        t, nd, best, pub = steady[0]
        insights.append(
            f"**'{t[:30]}'이 {nd}일 등장으로 최장 스테디셀러.** "
            f"({pub}, 최고 {best}위) 해당 카테고리 수요가 지속적임을 보여준다."
        )

    # 5. 신규 급부상
    if new_surge:
        t, best, nd, pub = new_surge[0]
        insights.append(
            f"**최근 60일 내 '{t[:30]}'이 최고 {best}위, {nd}일 등장으로 급부상.** "
            f"({pub}) 신규 트렌드 카테고리 선점 기회다."
        )

    if not insights:
        return ""

    lines = ["## 핵심 인사이트\n"]
    for i, s in enumerate(insights, 1):
        lines.append(f"{i}. {s}")
    return "\n".join(lines) + "\n"


# ══════════════════════════════════════════════════════
# 5. Claude API
# ══════════════════════════════════════════════════════

def call_claude(stats: str, dates: list[str]) -> str:
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        print("  ⚠ ANTHROPIC_API_KEY 미설정 — 통계만 생성", file=sys.stderr)
        return ""

    # 자사(## 4) 섹션 유무에 따라 이후 섹션 번호가 달라진다.
    sec_planning = 6 if MY_PUBLISHER else 5
    sec_action = 7 if MY_PUBLISHER else 6

    date_range = f"{dates[0]} ~ {dates[-1]}"
    prompt = f"""아래는 YES24 IT 베스트셀러의 일별 스냅샷 누적 데이터(Python 자동 생성 통계)입니다.
매일 200위까지의 베스트셀러를 수집하여 {len(dates)}일간 누적한 결과입니다.

{stats}

---

위 통계 데이터 앞뒤에 붙일 해석 섹션만 작성하라.
통계 테이블은 이미 완성되어 있으므로 다시 쓰지 마라.
아래 형식대로만 작성하라:

## 핵심 인사이트

1. **[인사이트 제목]** [구체적 수치를 포함한 해석. 출판 기획 관점에서 의미를 설명.]
2. ...
3. ...
4. ...
5. ...

## {sec_planning}. 출판 기획 아이템

### 기획 1: [제목]
[왜 기회인지, 어떤 도서를 만들면 좋을지, 타겟 독자, 예상 경쟁 상황. 3~5문장.]

### 기획 2: [제목]
...

(5~8개 기획 아이템)

## {sec_action}. 추천 다음 액션

- [IT 출판 기획 편집자가 당장 해야 할 구체적 행동 1]
- [구체적 행동 2]
- ...

(5~7개 액션)

---
분석 관점 (중요 — 반드시 지킬 것):
- 이 리포트는 **객관적 시장 분석**이다. 분석의 기준·관점은 특정 출판사가 아니라 **주제·지표(순위·트렌드·집중도·기회)**에 둔다.
- 어느 출판사도 '우리/자사/선두 주인공'으로 다루지 마라. 특정 출판사 시점에서 시장을 서술하지 마라("○○가 선두이나 경쟁사가 추격 중" 같은 특정사 중심 서사 금지).
- 출판사는 데이터로 필요할 때만 중립적으로 언급하라(예: "이 주제 상위는 A·B·C"). 시장 1위 등 사실은 그대로 쓰되, 한 출판사를 반복해서 기준점으로 삼지 마라.

글쓰기 원칙 (사람 문체 — AI 티 억제):
- AI 상투어 금지: "혁신적인/획기적인/매우/다양한" 남발, "~할 수 있습니다"의 반복, "주목할 만합니다", "~에 있어서"·"~라고 할 수 있다" 번역투
- 상투적 연결어·군더더기 대신 직접적이고 구체적인 표현. 매끈하지만 알맹이 없는 총평, 과한 대시(—) 피하기
- 실제 한국 편집자가 동료에게 브리핑하는 톤. 영어 어순을 옮긴 듯한 문장 금지
- 문장 길이·리듬을 섞어라. 모든 문장이 같은 구조로 끝나지 않게
- 통계의 사실·숫자는 그대로. 구체적 수치를 자연스럽게 녹이고, 애매한 hedging 대신 근거 있는 분명한 입장
"""

    body = json.dumps({
        "model": "claude-haiku-4-5-20251001",
        "max_tokens": 4000,
        "messages": [{"role": "user", "content": prompt}]
    }).encode("utf-8")

    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=body,
        headers={"Content-Type": "application/json", "x-api-key": api_key, "anthropic-version": "2023-06-01"}
    )

    print("🤖 Claude API 분석 중...")
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return json.loads(resp.read().decode("utf-8"))["content"][0]["text"]
    except Exception as e:
        print(f"  ⚠ Claude API 실패: {e}", file=sys.stderr)
        return ""


# ══════════════════════════════════════════════════════
# 6. 메인
# ══════════════════════════════════════════════════════

def build_report(archive: dict):
    """archive 데이터로 통계 + AI 섹션을 결합해 리포트를 재작성한다."""
    all_dates = sorted(archive["snapshots"].keys())

    # 통계 + 리포트
    stats = compute_stats(archive)
    ai_sections = call_claude(stats, all_dates)

    # 리포트 조합: 헤더 + 핵심인사이트(AI) + 통계(Python) + 기획아이템(AI)
    header = f"# YES24 IT 베스트셀러 {archive['total_days']}일 분석 리포트\n\n"
    header += f"> 분석 기간: {all_dates[0]} ~ {all_dates[-1]} ({len(all_dates)}일)\n"
    header += f"> 생성일: {TODAY}\n"
    header += f"> 데이터: YES24 IT/모바일 일별 베스트셀러\n\n"

    if ai_sections:
        # AI 결과에서 "핵심 인사이트" 부분과 "출판 기획/추천 액션" 이후 부분을 분리
        insight_part = ""
        planning_part = ""
        lines = ai_sections.split("\n")
        section = ""
        for line in lines:
            if line.startswith("## 핵심 인사이트") or line.startswith("## 핵심"):
                section = "insight"
            elif re.match(r"^## \d+\.\s*(출판 기획 아이템|추천 다음 액션)", line):
                section = "planning"
            if section == "insight":
                insight_part += line + "\n"
            elif section == "planning":
                planning_part += line + "\n"

        report = header + insight_part + "\n" + stats + "\n\n" + planning_part
    else:
        # Claude 미사용 시 통계 기반 폴백 인사이트 삽입
        fallback = generate_fallback_insights(archive)
        print("  ℹ 폴백 인사이트 생성 (Claude 미사용)")
        report = header + fallback + "\n" + stats + "\n"

    with open(REPORT_PATH, "w", encoding="utf-8") as f:
        f.write(report)

    print(f"✅ 리포트 생성: {REPORT_PATH}")


def rebuild():
    """Drive 스캔 없이 기존 archive.json으로 리포트만 재생성한다."""
    os.makedirs(REPORTS_DIR, exist_ok=True)
    archive = load_archive()
    if not archive.get("snapshots"):
        print("❌ archive.json에 데이터 없음 — 재생성 불가")
        return
    all_dates = sorted(archive["snapshots"].keys())
    print(f"♻ 리포트 재생성 모드 — 기존 아카이브 {len(all_dates)}일 사용 ({all_dates[0]} ~ {all_dates[-1]})")
    save_insights(archive)
    build_report(archive)


def local_daily_files() -> list[dict]:
    """CI가 커밋해둔 data/yes24/daily/*.xlsx 목록. YYYYMMDD_*.xlsx → date."""
    out = []
    for p in sorted(glob.glob(os.path.join(DAILY_DIR, "*.xlsx"))):
        name = os.path.basename(p)
        m = re.match(r"(\d{4})(\d{2})(\d{2})", name)
        if not m:
            continue
        out.append({"path": p, "name": name,
                    "date": f"{m.group(1)}-{m.group(2)}-{m.group(3)}"})
    return out


def report_gaps(archive: dict):
    """아카이브의 first~last 사이 빠진 날짜를 알려준다(백필 불가 — 알림용)."""
    missing = _missing_dates(archive)
    if missing:
        shown = ", ".join(missing[:15]) + (" ..." if len(missing) > 15 else "")
        print(f"⚠ 빠진 날짜 {len(missing)}개: {shown}")
    else:
        print("✅ 날짜 구멍 없음")


def main():
    os.makedirs(YES24_DIR, exist_ok=True)
    os.makedirs(REPORTS_DIR, exist_ok=True)

    archive = load_archive()
    existing_dates = set(archive["snapshots"].keys())
    added = 0

    # A. Drive 폴더 (과거 파일 수동 업로드분) — 접근 실패해도 로컬 수집은 계속
    for f in list_drive_files():
        if f["date"] in existing_dates:
            continue
        print(f"  📥 {f['name']}...", end=" ")
        data = download_xlsx(f["id"])
        if not data:
            print("SKIP"); continue
        items = parse_xlsx(data)
        if not items:
            print("파싱 실패"); continue
        archive["snapshots"][f["date"]] = items
        existing_dates.add(f["date"])
        added += 1
        print(f"{len(items)}건")

    # B. 로컬 daily 폴더 (CI 자동 수집분)
    for f in local_daily_files():
        if f["date"] in existing_dates:
            continue
        try:
            items = parse_xlsx(open(f["path"], "rb").read())
        except Exception as e:
            print(f"  ⚠ {f['name']} 읽기 실패: {e}"); continue
        if not items:
            print(f"  ⚠ {f['name']} 파싱 실패"); continue
        archive["snapshots"][f["date"]] = items
        existing_dates.add(f["date"])
        added += 1
        print(f"  📥 {f['name']} {len(items)}건 (로컬)")

    if added == 0:
        print(f"⏭ 새 파일 없음 (마지막: {archive.get('last_date', '?')}) — 스킵")
        report_gaps(archive)
        return

    print(f"🆕 새로 추가 {added}일")

    # 메타데이터 갱신
    all_dates = sorted(archive["snapshots"].keys())
    archive["first_date"] = all_dates[0]
    archive["last_date"] = all_dates[-1]
    archive["total_days"] = len(all_dates)

    save_archive(archive)
    print(f"💾 아카이브 저장: {archive['total_days']}일, {sum(len(v) for v in archive['snapshots'].values())}건")
    report_gaps(archive)
    save_insights(archive)

    # 4. 통계 + 리포트
    build_report(archive)


if __name__ == "__main__":
    if "--rebuild" in sys.argv[1:]:
        rebuild()
    else:
        main()
