#!/usr/bin/env python3
"""
빅테크 블로그 RSS 수집기 (누적 아카이브)
- 매일 실행 → 새 글만 추가 (URL 기준 중복 제거)
- data/rss/archive.json: 전체 누적 데이터
- data/rss/archive.js: 브라우저용 (window._RSS_ARCHIVE)
- data/rss/feeds.js: 최신 스냅샷 (window._RSS_FEEDS)
"""
import hashlib
import json
import os
import re
import sys
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime

# source_type / weight 정책 (트렌드 쏠림 완화용):
#   community(커뮤니티·큐레이션) 2.0  — 수요 신호가 가장 직접적 (독자/개발자 관심의 집계)
#   corp(기업 기술블로그)       1.5  — 실무 도입 신호
#   media(언론)                 1.0  — 기준선
#   vendor(벤더 자사 블로그)     0.5  — 자사 홍보 편중 → 가중치 하향
FEEDS = [
    # ── 글로벌 빅테크 (vendor: 자사 홍보 블로그 → weight 0.5) ──
    {"id": "anthropic",  "name": "Anthropic",          "url": "https://www.anthropic.com/news",                       "icon": "🟤", "tags": ["AI", "LLM", "Claude"], "type": "scrape", "source_type": "vendor", "weight": 0.5},
    {"id": "openai",     "name": "OpenAI",            "url": "https://openai.com/blog/rss.xml",                      "icon": "🟢", "tags": ["AI", "LLM", "GPT"], "source_type": "vendor", "weight": 0.5},
    {"id": "google_ai",  "name": "Google AI",          "url": "https://blog.google/technology/ai/rss/",              "icon": "🔵", "tags": ["AI", "Gemini", "Search"], "source_type": "vendor", "weight": 0.5},
    {"id": "deepmind",   "name": "DeepMind",           "url": "https://deepmind.google/blog/rss.xml",               "icon": "🧠", "tags": ["AI", "Research", "Science"], "source_type": "vendor", "weight": 0.5},
    {"id": "meta_eng",   "name": "Meta Engineering",   "url": "https://engineering.fb.com/feed/",                    "icon": "🔷", "tags": ["Infra", "ML", "Scale"], "source_type": "vendor", "weight": 0.5},
    {"id": "huggingface","name": "Hugging Face",        "url": "https://huggingface.co/blog/feed.xml",               "icon": "🤗", "tags": ["AI", "OpenSource", "Models"], "source_type": "vendor", "weight": 0.5},
    {"id": "aws_ml",     "name": "AWS ML",              "url": "https://aws.amazon.com/blogs/machine-learning/feed/","icon": "🟠", "tags": ["Cloud", "ML", "DevOps"], "source_type": "vendor", "weight": 0.5},
    {"id": "ms_ai",      "name": "Microsoft AI",        "url": "https://news.microsoft.com/source/topics/ai/feed/",  "icon": "🟦", "tags": ["AI", "Azure", "Copilot"], "source_type": "vendor", "weight": 0.5},
    {"id": "nvidia_ai",  "name": "NVIDIA AI",           "url": "https://blogs.nvidia.com/feed/",                     "icon": "💚", "tags": ["GPU", "AI", "Hardware"], "source_type": "vendor", "weight": 0.5},
    # ── 언론 (media → weight 1.0) ──
    {"id": "techcrunch", "name": "TechCrunch",          "url": "https://techcrunch.com/feed/",                       "icon": "🟩", "tags": ["Startup", "AI", "Global"], "source_type": "media", "weight": 1.0},
    # ── 커뮤니티·큐레이션 (community → weight 2.0, 수요 신호) ──
    {"id": "geeknews",   "name": "긱뉴스",              "url": "https://news.hada.io/rss/news",                       "icon": "🟧", "tags": ["개발", "큐레이션", "트렌드"], "source_type": "community", "weight": 2.0},
    {"id": "hackernews", "name": "Hacker News",         "url": "https://hnrss.org/frontpage",                         "icon": "🟠", "tags": ["개발", "큐레이션", "Global"], "source_type": "community", "weight": 2.0},
    {"id": "github_trending", "name": "GitHub Trending", "url": "https://github.com/trending?since=daily",            "icon": "🐙", "tags": ["OpenSource", "개발", "트렌드"], "type": "scrape_github", "source_type": "community", "weight": 2.0},
    # ── 한국 ──
    {"id": "aitimes",    "name": "AI타임스",            "url": "https://www.aitimes.com/rss/allArticle.xml",          "icon": "🇰🇷", "tags": ["AI", "한국", "뉴스"], "source_type": "media", "weight": 1.0},
    {"id": "yozm",       "name": "요즘IT",              "url": "https://yozm.wishket.com/magazine/feed/",             "icon": "📱", "tags": ["개발", "한국", "트렌드"], "source_type": "community", "weight": 2.0},
    {"id": "woowahan",   "name": "우아한형제들",         "url": "https://techblog.woowahan.com/feed/",                "icon": "🍔", "tags": ["개발", "한국", "실전"], "source_type": "corp", "weight": 1.5},
    {"id": "toss",       "name": "토스",                "url": "https://toss.tech/rss.xml",                           "icon": "💙", "tags": ["핀테크", "한국", "실전"], "source_type": "corp", "weight": 1.5},
    {"id": "kakao",      "name": "카카오테크",          "url": "https://tech.kakao.com/feed/",                        "icon": "💛", "tags": ["개발", "한국", "실전"], "source_type": "corp", "weight": 1.5},
    {"id": "daangn",     "name": "당근",                "url": "https://medium.com/feed/daangn",                      "icon": "🥕", "tags": ["개발", "한국", "실전"], "source_type": "corp", "weight": 1.5},
    {"id": "lycorp",     "name": "LY Corp (라인)",      "url": "https://techblog.lycorp.co.jp/ko/feed/index.xml",     "icon": "💬", "tags": ["개발", "한국", "AI"], "source_type": "corp", "weight": 1.5},
]

# 소스 id → weight / source_type 조회 (과거 아카이브 항목 소급 적용용)
SOURCE_WEIGHT = {f["id"]: f.get("weight", 1.0) for f in FEEDS}
SOURCE_TYPE = {f["id"]: f.get("source_type", "media") for f in FEEDS}

MAX_ITEMS_PER_FEED = 30
TODAY = datetime.now(timezone.utc).strftime("%Y-%m-%d")


# 일부 소스(요즘IT 405·우아한형제들 403)는 봇 UA를 차단하므로 브라우저급 헤더로 요청한다.
BROWSER_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,"
              "application/rss+xml,application/atom+xml,*/*;q=0.8",
    "Accept-Language": "ko,en-US;q=0.9,en;q=0.8",
}


def fetch_xml(url: str, timeout: int = 30) -> str | None:
    req = urllib.request.Request(url, headers=BROWSER_HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.read().decode("utf-8", errors="replace")
    except Exception as e:
        print(f"  ⚠ fetch 실패: {url} → {e}", file=sys.stderr)
        return None


def parse_rss_date(date_str: str) -> str:
    if not date_str:
        return ""
    try:
        return parsedate_to_datetime(date_str).strftime("%Y-%m-%d")
    except Exception:
        pass
    for fmt in ("%Y-%m-%dT%H:%M:%S%z", "%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%d"):
        try:
            return datetime.strptime(date_str.strip(), fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return date_str[:10] if len(date_str) >= 10 else date_str


def strip_ns(tag: str) -> str:
    return tag.split("}", 1)[1] if "}" in tag else tag


def make_id(link: str) -> str:
    return hashlib.md5(link.encode()).hexdigest()[:12]


def extract_keywords(title: str, summary: str) -> list[str]:
    """제목+요약에서 출판 관련 키워드를 추출한다."""
    text = (title + " " + summary).lower()
    KW_MAP = {
        # 영문
        "agent": "AI Agent", "agentic": "AI Agent", "mcp": "MCP",
        "rag": "RAG", "llm": "LLM", "language model": "LLM",
        "fine-tun": "Fine-tuning", "fine tun": "Fine-tuning",
        "multimodal": "Multimodal", "vision": "Vision",
        "code": "Coding", "coding": "Coding", "developer": "Developer Tools",
        "sdk": "SDK/API", "api": "SDK/API", "framework": "Framework",
        "open source": "Open Source", "open-source": "Open Source",
        "benchmark": "Benchmark", "safety": "AI Safety", "alignment": "AI Safety",
        "reasoning": "Reasoning", "chain-of-thought": "Reasoning",
        "embedding": "Embeddings", "vector": "Vector DB",
        "diffusion": "Image AI", "image generat": "Image AI",
        "video": "Video AI", "speech": "Speech/Audio", "voice": "Speech/Audio",
        "robot": "Robotics", "embodied": "Robotics",
        "quantiz": "Optimization", "inference": "Optimization", "deploy": "Deployment",
        "kubernetes": "Cloud/DevOps", "docker": "Cloud/DevOps", "cloud": "Cloud/DevOps",
        "security": "Security", "privacy": "Security",
        "education": "AI Education", "tutorial": "AI Education",
        "enterprise": "Enterprise AI", "workflow": "Automation", "automat": "Automation",
        "claude": "Claude", "gpt": "GPT", "gemini": "Gemini",
        "cursor": "AI Coding", "copilot": "AI Coding", "vibe cod": "Vibe Coding",
        # 한국어
        "에이전트": "AI Agent", "에이전틱": "AI Agent",
        "바이브 코딩": "Vibe Coding", "바이브코딩": "Vibe Coding",
        "클로드": "Claude", "제미나이": "Gemini",
        "파인튜닝": "Fine-tuning", "미세조정": "Fine-tuning",
        "프롬프트": "Prompt", "자동화": "Automation",
        "오픈소스": "Open Source", "데이터 분석": "Data Analysis",
        "데이터분석": "Data Analysis", "머신러닝": "ML/DL", "딥러닝": "ML/DL",
        "생성형": "Generative AI", "생성ai": "Generative AI", "생성 ai": "Generative AI",
        "랭체인": "LangChain", "langchain": "LangChain", "langgraph": "LangChain",
        "벡터": "Vector DB", "임베딩": "Embeddings",
        "쿠버네티스": "Cloud/DevOps", "도커": "Cloud/DevOps",
        "보안": "Security", "해킹": "Security",
        "n8n": "Automation", "make": "Automation",
        "챗봇": "Chatbot", "chatbot": "Chatbot",
        "sora": "Video AI", "영상 ai": "Video AI", "이미지 생성": "Image AI",
    }
    found = set()
    for pat, kw in KW_MAP.items():
        if pat in text:
            found.add(kw)
    return sorted(found)


def scrape_anthropic_news(html: str) -> list[dict]:
    """Anthropic /news 페이지를 HTML 파싱하여 기사 목록을 반환한다."""
    items = []
    MONTH_MAP = {
        "Jan": "01", "Feb": "02", "Mar": "03", "Apr": "04",
        "May": "05", "Jun": "06", "Jul": "07", "Aug": "08",
        "Sep": "09", "Oct": "10", "Nov": "11", "Dec": "12",
    }
    DATE_RE = re.compile(
        r"(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2}),?\s+(\d{4})"
    )
    # 카테고리 라벨 (제목에서 제거용)
    CATEGORIES = {"Product", "Announcements", "Research", "Company", "Policy",
                  "Safety", "Alignment", "Engineering", "Interpretability"}
    LINK_RE = re.compile(
        r'<a[^>]+href="(/(?:news|research|blog)/[^"]+)"[^>]*>(.*?)</a>',
        re.DOTALL,
    )
    seen_links = set()
    for m in LINK_RE.finditer(html):
        path, inner = m.group(1), m.group(2)
        # 태그 제거 후 텍스트 토큰 추출
        raw = re.sub(r"<[^>]+>", "\n", inner)
        lines = [ln.strip() for ln in raw.splitlines() if ln.strip()]
        # 날짜·카테고리를 분리하고 나머지를 제목으로
        date = ""
        title_parts = []
        for ln in lines:
            dm = DATE_RE.fullmatch(ln)
            if dm:
                date = f"{dm.group(3)}-{MONTH_MAP[dm.group(1)]}-{int(dm.group(2)):02d}"
                continue
            if ln in CATEGORIES:
                continue
            title_parts.append(ln)
        # 첫 줄 = 제목, 나머지 = 설명 (Anthropic은 제목과 설명이 별도 div)
        title = title_parts[0] if title_parts else ""
        summary = " ".join(title_parts[1:]).strip()[:300] if len(title_parts) > 1 else ""
        # HTML 엔티티 정리
        for ent, ch in [("&#x27;", "'"), ("&quot;", '"'), ("&amp;", "&")]:
            title = title.replace(ent, ch)
            summary = summary.replace(ent, ch)
        if not title or len(title) < 5 or path in seen_links:
            continue
        seen_links.add(path)
        link = "https://www.anthropic.com" + path
        # fullmatch 실패 시 주변 컨텍스트에서 날짜 탐색
        if not date:
            ctx = html[max(0, m.start() - 300): m.start()]
            dm2 = DATE_RE.search(ctx)
            if dm2:
                date = f"{dm2.group(3)}-{MONTH_MAP[dm2.group(1)]}-{int(dm2.group(2)):02d}"
        items.append({"title": title, "link": link, "date": date, "summary": summary})
    return items[:MAX_ITEMS_PER_FEED]


def scrape_github_trending(html: str) -> list[dict]:
    """GitHub Trending(daily) 페이지를 파싱한다. RSS가 없어 HTML 파싱으로 대체.
    제목은 "repo명 — 설명" 형태, 링크는 repo URL. 파싱 실패 시 조용히 빈 목록."""
    items = []
    arts = re.findall(r'<article class="Box-row">(.*?)</article>', html, re.DOTALL)
    for a in arts:
        h2 = re.search(r"<h2\b.*?</h2>", a, re.DOTALL)
        if not h2:
            continue
        mrepo = re.search(r'href="/([^"]+)"', h2.group(0))
        if not mrepo:
            continue
        repo = mrepo.group(1).strip()
        desc = ""
        md = re.search(r'<p class="col-9[^"]*"[^>]*>(.*?)</p>', a, re.DOTALL)
        if md:
            desc = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", md.group(1))).strip()
        lang = ""
        ml = re.search(r'itemprop="programmingLanguage">([^<]+)<', a)
        if ml:
            lang = ml.group(1).strip()
        title = repo + (" — " + desc if desc else "")
        link = "https://github.com/" + repo
        # date 없음 → 수집일(TODAY)로 기록 (당일 트렌드로 집계). 언어를 summary에 포함해 키워드 추출 강화.
        summary = (desc + " " + lang).strip()[:300]
        items.append({"title": title, "link": link, "date": TODAY, "summary": summary})
    return items[:MAX_ITEMS_PER_FEED]


def parse_feed(xml_text: str) -> list[dict]:
    items = []
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError as e:
        print(f"  ⚠ XML 파싱 오류: {e}", file=sys.stderr)
        return items

    root_tag = strip_ns(root.tag)

    if root_tag == "rss":
        channel = root.find("channel")
        if channel is None:
            return items
        for item_el in channel.findall("item"):
            title = (item_el.findtext("title") or "").strip()
            link = (item_el.findtext("link") or "").strip()
            pub = item_el.findtext("pubDate") or item_el.findtext("dc:date") or ""
            desc = re.sub(r"<[^>]+>", "", (item_el.findtext("description") or ""))[:300].strip()
            items.append({"title": title, "link": link, "date": parse_rss_date(pub), "summary": desc})

    elif root_tag == "feed":
        for entry in root:
            if strip_ns(entry.tag) != "entry":
                continue
            title = link = pub = desc = ""
            for child in entry:
                tag = strip_ns(child.tag)
                if tag == "title":
                    title = (child.text or "").strip()
                elif tag == "link":
                    link = child.get("href", "") or (child.text or "").strip()
                elif tag in ("published", "updated") and not pub:
                    pub = (child.text or "").strip()
                elif tag in ("summary", "content") and not desc:
                    desc = re.sub(r"<[^>]+>", "", (child.text or ""))[:300].strip()
            items.append({"title": title, "link": link, "date": parse_rss_date(pub), "summary": desc})

    return items[:MAX_ITEMS_PER_FEED]


def load_archive(path: str) -> dict:
    """기존 아카이브를 로드한다."""
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return {"articles": [], "daily_stats": [], "sources": {}}


def merge_into_archive(archive: dict, feed_conf: dict, items: list[dict]) -> int:
    """새 아이템을 아카이브에 병합한다. 추가된 수를 반환."""
    existing_ids = {a["id"] for a in archive["articles"]}
    added = 0

    for item in items:
        if not item["link"]:
            continue
        aid = make_id(item["link"])
        if aid in existing_ids:
            continue

        keywords = extract_keywords(item["title"], item["summary"])

        archive["articles"].append({
            "id": aid,
            "source": feed_conf["id"],
            "source_name": feed_conf["name"],
            "source_type": feed_conf.get("source_type", "media"),  # community/media/vendor/corp
            "icon": feed_conf["icon"],
            "title": item["title"],
            "link": item["link"],
            "date": item["date"],
            "summary": item["summary"],
            "keywords": keywords,
            "first_seen": TODAY,
        })
        existing_ids.add(aid)
        added += 1

    return added


def compute_weekly_trends(archive: dict) -> list[dict]:
    """주간 키워드 빈도를 소스 가중치와 쏠림 캡을 적용해 계산한다.

    - 가중치: 기사 1건당 +1 대신 소스 weight(community 2.0 / corp 1.5 /
      media 1.0 / vendor 0.5)만큼 기여 → 벤더 자사블로그 편중을 낮춘다.
    - 쏠림 캡: (주, 키워드)별로 단일 소스의 기여를 그 키워드 원(raw) 총합의
      50%로 상한한다. AI타임스 물량이 한 키워드를 독점하지 못하게 하는 단순 1-pass
      방식(반복 재계산 없음). 최종값은 정수 반올림 후 0 초과만 유지.
    스키마는 기존과 동일: {"week": "YYYY-Wnn", "keywords": {kw: int}}."""
    from collections import defaultdict

    SINGLE_SOURCE_CAP = 0.5  # 한 소스가 한 키워드 주간 총합에서 차지할 수 있는 최대 비율

    # 주차별·키워드별·소스별 가중 기여
    week_kw_src = defaultdict(lambda: defaultdict(lambda: defaultdict(float)))
    for a in archive["articles"]:
        if not a.get("date"):
            continue
        try:
            dt = datetime.strptime(a["date"][:10], "%Y-%m-%d")
            week = dt.strftime("%Y-W%V")
        except ValueError:
            continue
        w = SOURCE_WEIGHT.get(a.get("source", ""), 1.0)
        for kw in a.get("keywords", []):
            week_kw_src[week][kw][a.get("source", "")] += w

    weeks = sorted(week_kw_src.keys())[-8:]
    trends = []
    for wk in weeks:
        kw_final = {}
        for kw, src_contrib in week_kw_src[wk].items():
            raw_total = sum(src_contrib.values())
            cap = raw_total * SINGLE_SOURCE_CAP
            capped_total = sum(min(v, cap) for v in src_contrib.values())
            val = int(round(capped_total))
            if val > 0:
                kw_final[kw] = val
        top = sorted(kw_final.items(), key=lambda x: -x[1])[:15]
        trends.append({"week": wk, "keywords": {k: v for k, v in top}})
    return trends


def compute_source_stats(archive: dict) -> dict:
    """소스별 통계."""
    from collections import defaultdict
    stats = defaultdict(lambda: {"total": 0, "recent_7d": 0, "recent_30d": 0})
    for a in archive["articles"]:
        src = a["source"]
        stats[src]["total"] += 1
        fs = a.get("first_seen", "")
        now_dt = datetime.now(timezone.utc)
        month_start = now_dt.strftime("%Y-%m") + "-01"
        week_ago = (now_dt - timedelta(days=7)).strftime("%Y-%m-%d")
        if fs >= month_start:
            stats[src]["recent_30d"] += 1
        if fs >= week_ago:
            stats[src]["recent_7d"] += 1
    return dict(stats)


def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    out_dir = os.path.join(script_dir, "..", "data", "rss")
    os.makedirs(out_dir, exist_ok=True)

    archive_path = os.path.join(out_dir, "archive.json")
    archive = load_archive(archive_path)

    # ── 피드 수집 ──
    latest_feeds = []
    total_added = 0

    for feed_conf in FEEDS:
        print(f"📡 {feed_conf['name']}...", end=" ")
        raw = fetch_xml(feed_conf["url"])
        if not raw:
            print("SKIP")
            latest_feeds.append({**feed_conf, "items": []})
            continue

        ftype = feed_conf.get("type")
        if ftype == "scrape":
            items = scrape_anthropic_news(raw)
        elif ftype == "scrape_github":
            items = scrape_github_trending(raw)
        else:
            items = parse_feed(raw)
        added = merge_into_archive(archive, feed_conf, items)
        total_added += added
        print(f"{len(items)}건 (신규 {added}건)")
        latest_feeds.append({**feed_conf, "items": items})

    # ── 과거 아카이브 항목에 source_type 소급 부여 (신규 필드 일관성 유지) ──
    for a in archive["articles"]:
        if "source_type" not in a:
            a["source_type"] = SOURCE_TYPE.get(a.get("source", ""), "media")

    # ── 통계 계산 ──
    archive["weekly_trends"] = compute_weekly_trends(archive)
    archive["source_stats"] = compute_source_stats(archive)
    archive["last_updated"] = TODAY
    archive["total_articles"] = len(archive["articles"])

    # 날짜순 정렬 (최신 먼저)
    archive["articles"].sort(key=lambda a: a.get("date", ""), reverse=True)

    # 오늘의 수집 기록
    if "daily_stats" not in archive:
        archive["daily_stats"] = []
    archive["daily_stats"].append({"date": TODAY, "added": total_added, "total": len(archive["articles"])})
    # 최근 90일만 유지
    archive["daily_stats"] = archive["daily_stats"][-90:]

    # ── 저장 ──
    # 1. archive.json (전체)
    with open(archive_path, "w", encoding="utf-8") as f:
        json.dump(archive, f, ensure_ascii=False, indent=2)

    # 2. archive.js (브라우저용)
    js_archive_path = os.path.join(out_dir, "archive.js")
    with open(js_archive_path, "w", encoding="utf-8") as f:
        f.write("window._RSS_ARCHIVE = ")
        json.dump(archive, f, ensure_ascii=False)
        f.write(";")

    # 3. feeds.js (최신 스냅샷, 하위 호환)
    latest = {"fetched_at": datetime.now(timezone.utc).isoformat(), "feeds": latest_feeds}
    js_feeds_path = os.path.join(out_dir, "feeds.js")
    with open(js_feeds_path, "w", encoding="utf-8") as f:
        f.write("window._RSS_FEEDS = ")
        json.dump(latest, f, ensure_ascii=False)
        f.write(";")

    print(f"\n✅ 아카이브: {len(archive['articles'])}건 (오늘 +{total_added}건)")
    print(f"   주간 트렌드: {len(archive['weekly_trends'])}주")


if __name__ == "__main__":
    main()
