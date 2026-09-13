#!/usr/bin/env python3
"""
알라딘 IT 신간 수집 → data/aladin/new_books.json 누적.
YES24 베스트셀러(200위) 밖의 신간 저자까지 저자 목록에 반영하기 위한 소스.
- 알라딘 TTB ItemList API(QueryType=ItemNewAll, 컴퓨터/모바일 카테고리)
- ISBN 기준 dedup 누적, firstCollected 보존, 오래된 pubDate 정리
"""
import json
import os
import re
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

if sys.stdout and sys.stdout.encoding and sys.stdout.encoding.lower().startswith("cp"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(SCRIPT_DIR, "..", "data", "aladin")
OUT_PATH = os.path.join(OUT_DIR, "new_books.json")

# 무료 TTB 키(공개). 필요 시 환경변수로 override.
TTB_KEY = os.environ.get("ALADIN_TTB_KEY", "ttbare4861413001")
CATEGORY_ID = 351     # 국내도서 > 컴퓨터/모바일
MAX_ITEMS = 200       # 하루 수집 상위 신간 수
RETAIN_DAYS = 180     # 출간일이 이보다 오래된 신간은 누적에서 제거
PER_PAGE = 50
KST = timezone(timedelta(hours=9))
BASE = "https://www.aladin.co.kr/ttb/api/ItemList.aspx"


def authors_only(raw: str) -> list:
    """알라딘 author 문자열에서 '지은이'만 추출.
    'A, B (지은이), C (옮긴이)' → [A, B].  역할 표기 없으면 저자로 간주."""
    if not raw:
        return []
    out, group = [], []
    for tok in raw.split(","):
        tok = tok.strip()
        m = re.search(r"\(([^)]+)\)\s*$", tok)
        if m:
            role = m.group(1)
            name = tok[:m.start()].strip()
            if name:
                group.append(name)
            if any(k in role for k in ("지은이", "저자", "글", "지음")):
                out.extend(group)
            group = []
        elif tok:
            group.append(tok)
    out.extend(group)   # 역할 표기 없이 끝난 그룹
    seen, res = set(), []
    for n in out:
        n = re.sub(r"\s*\([^)]*\)", "", n).strip()
        if n and len(n) >= 2 and n not in seen:
            seen.add(n)
            res.append(n)
    return res


def fetch_new() -> dict:
    books = {}
    for start in range(1, MAX_ITEMS // PER_PAGE + 1):
        params = {"ttbkey": TTB_KEY, "QueryType": "ItemNewAll", "MaxResults": PER_PAGE,
                  "start": start, "CategoryId": CATEGORY_ID, "SearchTarget": "Book",
                  "output": "js", "Version": "20131101"}
        url = BASE + "?" + urllib.parse.urlencode(params)
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            data = json.loads(urllib.request.urlopen(req, timeout=20).read().decode("utf-8", "replace"))
        except Exception as e:
            print(f"  ⚠ 알라딘 요청 실패(start={start}): {e}", file=sys.stderr)
            break
        if data.get("errorCode"):
            print(f"  ⚠ 알라딘 API 오류 {data['errorCode']}: {data.get('errorMessage')}", file=sys.stderr)
            break
        items = data.get("item", [])
        if not items:
            break
        for it in items:
            isbn = it.get("isbn13") or it.get("isbn") or it.get("itemId")
            if not isbn:
                continue
            authors = authors_only(it.get("author", ""))
            if not authors:
                continue
            books[str(isbn)] = {
                "title": (it.get("title") or "").strip(),
                "authors": authors,
                "publisher": (it.get("publisher") or "").strip(),
                "pubDate": (it.get("pubDate") or "").strip(),
                "category": (it.get("categoryName") or "").strip(),
            }
    return books


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    today = datetime.now(KST).strftime("%Y-%m-%d")
    prev = {}
    if os.path.exists(OUT_PATH):
        try:
            prev = json.load(open(OUT_PATH, encoding="utf-8")).get("books", {})
        except Exception as e:
            print(f"  ⚠ 기존 new_books.json 읽기 실패: {e}", file=sys.stderr)

    fresh = fetch_new()
    if not fresh:
        print("알라딘 신간 0건 — 기존 데이터 유지")
        return

    # 병합: 기존 firstCollected 보존, 신규는 today
    merged = {}
    for isbn, b in {**prev, **fresh}.items():
        b = dict(b)
        b["firstCollected"] = prev.get(isbn, {}).get("firstCollected", today)
        merged[isbn] = b

    # 보존 정책: 출간일이 너무 오래된 신간 제거(날짜 미상은 유지)
    cutoff = (datetime.now(KST) - timedelta(days=RETAIN_DAYS)).strftime("%Y-%m-%d")
    kept = {k: v for k, v in merged.items()
            if not v.get("pubDate") or v["pubDate"] >= cutoff}

    out = {"updated": today, "count": len(kept), "books": kept}
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False)
    print(f"알라딘 신간: 이번 수집 {len(fresh)}권 · 누적 {len(kept)}권 (기준일 {today})")


if __name__ == "__main__":
    main()
