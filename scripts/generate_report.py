#!/usr/bin/env python3
"""
YES24 베스트셀러 자동 분석 리포트 생성기
- 매일 Google Sheets에서 오늘의 베스트셀러 스냅샷 fetch
- data/yes24/archive.json에 날짜 태깅하여 누적 저장
- 새 데이터가 있으면 Claude API로 시장 분석 리포트 생성
- data/reports/yes24_weekly.md 덮어쓰기 (항상 최신 1개)
"""
import json
import os
import re
import sys
import urllib.request
from collections import Counter, defaultdict
from datetime import datetime, timezone

# ── 설정 ──
SHEET_URL = "https://script.google.com/macros/s/AKfycbx0PRidfgLM41CLKyM6zmaNkf9_r-a3EZGxU9qicd-a_-i8K0xGGV2XH64geJwQ6k7d/exec"
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
YES24_DIR = os.path.join(SCRIPT_DIR, "..", "data", "yes24")
ARCHIVE_PATH = os.path.join(YES24_DIR, "archive.json")
REPORTS_DIR = os.path.join(SCRIPT_DIR, "..", "data", "reports")
REPORT_PATH = os.path.join(REPORTS_DIR, "yes24_weekly.md")
TODAY = datetime.now(timezone.utc).strftime("%Y-%m-%d")


def fetch_today() -> list[dict]:
    """Google Sheets에서 오늘 베스트셀러 스냅샷을 가져온다."""
    print("📊 Google Sheets fetch...")
    req = urllib.request.Request(SHEET_URL, headers={"User-Agent": "ReportBot/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            text = resp.read().decode("utf-8", errors="replace")
    except Exception as e:
        print(f"  ⚠ fetch 실패: {e}", file=sys.stderr)
        return []

    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        print("  ⚠ JSON 파싱 실패", file=sys.stderr)
        return []

    if isinstance(data, dict) and "rows" in data:
        data = data["rows"]
    if not isinstance(data, list):
        return []

    # dict 리스트 → 정규화
    items = []
    for row in data:
        if isinstance(row, dict):
            title = str(row.get("상품명", row.get("제목", ""))).strip()
            if not title:
                continue
            items.append({
                "rank": int(row.get("순위", 0)) if str(row.get("순위", "")).isdigit() else 0,
                "title": title,
                "author": str(row.get("저자", "")).strip(),
                "publisher": str(row.get("출판사", "")).strip(),
                "price": str(row.get("판매가", "")).strip(),
                "isbn": str(row.get("ISBN", "")).strip(),
                "category": str(row.get("관리분류", "")).strip(),
            })
    return items


def load_archive() -> dict:
    """누적 아카이브 로드."""
    if os.path.exists(ARCHIVE_PATH):
        with open(ARCHIVE_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    return {"snapshots": {}, "first_date": "", "last_date": "", "total_days": 0}


def save_archive(archive: dict):
    """아카이브 저장."""
    os.makedirs(YES24_DIR, exist_ok=True)
    with open(ARCHIVE_PATH, "w", encoding="utf-8") as f:
        json.dump(archive, f, ensure_ascii=False, indent=2)

    # 브라우저용 .js도 생성
    js_path = os.path.join(YES24_DIR, "archive.js")
    with open(js_path, "w", encoding="utf-8") as f:
        f.write("window._YES24_ARCHIVE = ")
        json.dump(archive, f, ensure_ascii=False)
        f.write(";")


def merge_snapshot(archive: dict, items: list[dict]) -> bool:
    """오늘 스냅샷을 아카이브에 추가. 새 데이터면 True 반환."""
    if TODAY in archive["snapshots"]:
        print(f"⏭ 오늘({TODAY}) 데이터 이미 존재 — 스킵")
        return False

    archive["snapshots"][TODAY] = items
    if not archive["first_date"] or TODAY < archive["first_date"]:
        archive["first_date"] = TODAY
    archive["last_date"] = TODAY
    archive["total_days"] = len(archive["snapshots"])

    print(f"🆕 {TODAY}: {len(items)}건 추가 (누적 {archive['total_days']}일)")
    return True


def compute_stats(archive: dict) -> str:
    """누적 데이터로 통계 생성."""
    dates = sorted(archive["snapshots"].keys())
    all_records = []
    for d in dates:
        for item in archive["snapshots"][d]:
            item_with_date = {**item, "date": d}
            all_records.append(item_with_date)

    total = len(all_records)
    unique_titles = set(r["title"] for r in all_records)
    date_range = f"{dates[0]} ~ {dates[-1]}"

    # 도서별 등장일수 + 평균 순위
    title_days = defaultdict(list)  # title → [dates]
    title_ranks = defaultdict(list)  # title → [ranks]
    title_info = {}  # title → {author, publisher, ...}
    for r in all_records:
        t = r["title"]
        title_days[t].append(r["date"])
        if r["rank"]:
            title_ranks[t].append(r["rank"])
        if t not in title_info:
            title_info[t] = {k: r[k] for k in ("author", "publisher", "price", "category")}

    # TOP 30 (등장일수)
    top30 = sorted(title_days.items(), key=lambda x: -len(set(x[1])))[:30]

    # 출판사 점유율 (등장일수 기준)
    pub_days = defaultdict(int)
    for t, days in title_days.items():
        pub = title_info[t]["publisher"]
        if pub:
            pub_days[pub] += len(set(days))
    total_days_all = sum(pub_days.values())
    pub_top = sorted(pub_days.items(), key=lambda x: -x[1])[:15]

    # 카테고리 키워드 분류
    KW = {
        "AI/LLM": ["ai", "인공지능", "llm", "gpt", "클로드", "제미나이", "생성형", "딥러닝", "머신러닝"],
        "바이브코딩": ["바이브 코딩", "바이브코딩", "vibe coding"],
        "에이전트/RAG": ["에이전트", "agent", "rag", "랭체인", "langchain", "mcp"],
        "프롬프트/활용": ["프롬프트", "prompt", "챗gpt", "ai 활용", "업무 자동화", "활용법"],
        "데이터분석": ["데이터 분석", "데이터분석", "판다스", "pandas", "엑셀", "통계"],
        "프로그래밍": ["파이썬", "python", "자바", "java", "코딩", "알고리즘", "자료구조", "c언어", "c++"],
        "웹/앱개발": ["웹", "리액트", "react", "flutter", "next.js", "스프링", "spring"],
        "클라우드/인프라": ["클라우드", "aws", "도커", "쿠버네티스", "devops", "azure"],
        "보안": ["보안", "해킹", "정보보안"],
        "이미지/영상AI": ["이미지 생성", "stable diffusion", "미드저니", "comfyui", "영상"],
    }
    cat_titles = defaultdict(set)
    for t in unique_titles:
        tl = t.lower()
        for cat, kws in KW.items():
            if any(k in tl for k in kws):
                cat_titles[cat].add(t)
                break

    # 최근 7일 vs 이전 7일
    recent_change = ""
    if len(dates) >= 7:
        last7 = dates[-7:]
        r7_titles = set()
        for d in last7:
            for item in archive["snapshots"][d]:
                r7_titles.add(item["title"])

        if len(dates) >= 14:
            prev7 = dates[-14:-7]
            p7_titles = set()
            for d in prev7:
                for item in archive["snapshots"][d]:
                    p7_titles.add(item["title"])
            new_in = r7_titles - p7_titles
            dropped = p7_titles - r7_titles
            recent_change = f"\n### 최근 7일 변동\n- 신규 진입: {len(new_in)}권\n- 이탈: {len(dropped)}권\n"
            if new_in:
                recent_change += "- 신규 주요:\n"
                for t in list(new_in)[:10]:
                    info = title_info.get(t, {})
                    recent_change += f"  - {t} ({info.get('publisher', '?')})\n"

    # 통계 문자열 조합
    lines = [
        f"## 기초 통계",
        f"- 분석 기간: {date_range} ({len(dates)}일)",
        f"- 총 스냅샷 레코드: {total:,}건",
        f"- 고유 도서: {len(unique_titles):,}권",
        f"",
        f"### 출판사 점유율 (등장일수 기준, 상위 15)",
        f"| 순위 | 출판사 | 등장일수 | 점유율 |",
        f"|---:|--------|-------:|------:|",
    ]
    for i, (pub, days) in enumerate(pub_top, 1):
        share = days / total_days_all * 100 if total_days_all else 0
        lines.append(f"| {i} | {pub} | {days}일 | {share:.1f}% |")

    lines.append(f"\n### 베스트셀러 TOP 30 (등장일수·평균순위)")
    lines.append(f"| 순위 | 도서명 | 출판사 | 등장일수 | 평균순위 |")
    lines.append(f"|---:|--------|--------|-------:|-------:|")
    for i, (title, days) in enumerate(top30, 1):
        ud = len(set(days))
        avg_rank = sum(title_ranks[title]) / len(title_ranks[title]) if title_ranks[title] else 0
        pub = title_info[title]["publisher"]
        lines.append(f"| {i} | {title} | {pub} | {ud}일 | {avg_rank:.1f} |")

    lines.append(f"\n### 카테고리 분포")
    for cat, titles in sorted(cat_titles.items(), key=lambda x: -len(x[1])):
        lines.append(f"- **{cat}**: {len(titles)}권")

    if recent_change:
        lines.append(recent_change)

    return "\n".join(lines)


def call_claude(stats: str, dates: list[str]) -> str:
    """Claude API로 시장 분석 리포트 생성."""
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        print("  ⚠ ANTHROPIC_API_KEY 미설정 — 통계 리포트만 생성", file=sys.stderr)
        return ""

    date_range = f"{dates[0]} ~ {dates[-1]}" if dates else "불명"

    prompt = f"""아래는 YES24 IT 베스트셀러의 일별 스냅샷 누적 데이터 통계입니다.
매일 200위까지의 베스트셀러를 수집하여 {len(dates)}일간 누적한 결과입니다.

{stats}

---

이 데이터를 기반으로 IT 도서 시장 분석 리포트를 작성해주세요:

# YES24 IT 베스트셀러 시장 분석 리포트

> 분석 기간: {date_range} ({len(dates)}일 누적)
> 생성일: {TODAY}
> 데이터: YES24 IT/모바일 일별 베스트셀러 200위 (자동 생성)

## 핵심 인사이트 (5개)
구체적 수치를 포함하고, 출판 기획 관점에서 의미를 해석하라.

## 카테고리별 트렌드
상승/하락/안정 트렌드를 판별하고, 각 카테고리 주목 도서와 출판사를 언급하라.

## 출판 기회 (3~5개)
시장 공백이나 기회를 구체적으로 제안하라.
각 기회: 왜 기회인지, 어떤 도서를 만들면 좋을지, 타겟 독자.

## 경쟁 동향
주요 출판사별 최근 움직임과 전략을 분석하라.

## 주간 변동 요약
최근 7일 신규 진입/이탈 도서 중심으로 시장 변화를 설명하라.

---
글쓰기 원칙:
- AI투 문장 금지 (혁신적인, ~할 수 있습니다, 주목할 만합니다 등)
- 편집자가 동료에게 브리핑하는 톤
- 구체적 수치를 자연스럽게 녹여라
- 문장 구조 다양화
"""

    body = json.dumps({
        "model": "claude-haiku-4-5-20251001",
        "max_tokens": 4000,
        "messages": [{"role": "user", "content": prompt}]
    }).encode("utf-8")

    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=body,
        headers={
            "Content-Type": "application/json",
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01"
        }
    )

    print("🤖 Claude API 분석 중...")
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            result = json.loads(resp.read().decode("utf-8"))
            return result["content"][0]["text"]
    except Exception as e:
        print(f"  ⚠ Claude API 실패: {e}", file=sys.stderr)
        return ""


def main():
    os.makedirs(REPORTS_DIR, exist_ok=True)

    # 1. 오늘 스냅샷 fetch
    items = fetch_today()
    if not items:
        print("❌ 데이터 없음 — 종료")
        return
    print(f"   {len(items)}건 수집")

    # 2. 아카이브에 병합
    archive = load_archive()
    is_new = merge_snapshot(archive, items)
    save_archive(archive)

    if not is_new:
        return

    # 3. 통계 계산
    dates = sorted(archive["snapshots"].keys())
    stats = compute_stats(archive)

    # 4. Claude 분석
    ai_report = call_claude(stats, dates)

    # 5. 리포트 저장
    if ai_report:
        report = ai_report
    else:
        date_range = f"{dates[0]} ~ {dates[-1]}"
        report = f"# YES24 IT 베스트셀러 시장 분석 리포트\n\n> 분석 기간: {date_range} ({len(dates)}일)\n> 생성일: {TODAY}\n\n{stats}\n"

    with open(REPORT_PATH, "w", encoding="utf-8") as f:
        f.write(report)

    print(f"✅ 리포트 생성: {REPORT_PATH}")
    print(f"   누적 {archive['total_days']}일, {sum(len(v) for v in archive['snapshots'].values())}건")


if __name__ == "__main__":
    main()
