# YES24 IT 베스트셀러 엑셀 자동 다운로드 + Google Drive 업로드 (수동 1~6단계 재현)
# 사용법: python download_yes24.py [--show] [--date YYYYMMDD] [--no-upload]
#   --show      : 브라우저 창 띄우고 실행(기본은 headless)
#   --date      : 저장 파일 날짜 지정(기본은 어제 — 일일 베스트셀러는 전날 집계)
#   --no-upload : Drive 업로드 건너뛰기(다운로드만)
# 업로드는 rclone 필요 — 최초 1회 설정: 아래 UPLOAD 섹션 주석 참고.
import os
import shutil
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from playwright.sync_api import sync_playwright

# Windows cp949 콘솔 인코딩 에러 방지
if sys.stdout.encoding and sys.stdout.encoding.lower().startswith("cp"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

CATEGORY = "001001003"  # IT 모바일 > 컴퓨터공학
PAGE_SIZE = 200
LIST_URL = (f"https://www.yes24.com/product/category/daybestseller"
            f"?pageNumber=1&pageSize={PAGE_SIZE}&categoryNumber={CATEGORY}&type=day")
# 저장 폴더 — 기본은 로컬 01_yes24_bestseller, CI에선 YES24_OUT_DIR 로 지정
OUT_DIR = Path(os.environ.get("YES24_OUT_DIR")
               or (Path(__file__).resolve().parents[2] / "01_yes24_bestseller"))

# Google Drive 업로드 대상 — generate_report.py가 스캔하는 바로 그 폴더
DRIVE_FOLDER_ID = "1hGsZv7zT6MmFdq2Ouiwrq4Ee72zg1o4O"
RCLONE_REMOTE = "gdrive"  # rclone config 로 만든 리모트 이름

KST = timezone(timedelta(hours=9))

def main():
    show = "--show" in sys.argv
    # 일일 베스트셀러 = 전날 집계 → 한국시간 기준 어제 날짜로 저장
    ymd = (datetime.now(KST) - timedelta(days=1)).strftime("%Y%m%d")
    if "--date" in sys.argv:
        ymd = sys.argv[sys.argv.index("--date") + 1]
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    target = OUT_DIR / f"{ymd}_yes24_it_bestseller.xlsx"

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=not show)
        ctx = browser.new_context(
            accept_downloads=True,
            user_agent=("Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                        "AppleWebKit/537.36 (KHTML, like Gecko) "
                        "Chrome/131.0.0.0 Safari/537.36"),
        )
        page = ctx.new_page()
        page.goto("https://www.yes24.com/Main/default.aspx", wait_until="domcontentloaded")
        page.goto(LIST_URL, wait_until="domcontentloaded")
        page.get_by_text("엑셀로 받기").first.wait_for(timeout=30000)

        # 전체선택 후 엑셀 내보내기 (선택 없이도 되면 무해)
        try:
            page.get_by_text("전체선택", exact=False).first.click(timeout=3000)
        except Exception:
            pass

        with page.expect_download(timeout=60000) as dl:
            page.get_by_text("엑셀로 받기").first.click()
        dl.value.save_as(str(target))
        browser.close()

    print(f"저장됨: {target}  ({target.stat().st_size:,} bytes)")

    if "--no-upload" not in sys.argv:
        upload_to_drive(target)

def upload_to_drive(target: Path):
    # rclone 최초 1회 설정:
    #   1) rclone 설치:  winget install Rclone.Rclone
    #   2) rclone config → n(new) → 이름 gdrive → storage: drive →
    #      client_id/secret 엔터(기본) → scope 1(full) → 나머지 엔터 →
    #      "Use auto config?" y → 브라우저에서 구글 로그인/허용 → q(quit)
    if not shutil.which("rclone"):
        print("ⓘ rclone 미설치 — 업로드 건너뜀. 설치: winget install Rclone.Rclone")
        return
    # 같은 이름이면 덮어씀. --drive-root-folder-id 로 대상 폴더 지정.
    cmd = ["rclone", "copyto", str(target), f"{RCLONE_REMOTE}:{target.name}",
           "--drive-root-folder-id", DRIVE_FOLDER_ID]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode == 0:
        print(f"업로드 완료: Drive 폴더 → {target.name}")
    else:
        print(f"⚠ 업로드 실패(파일은 로컬에 저장됨): {r.stderr.strip()[:300]}")

if __name__ == "__main__":
    main()
