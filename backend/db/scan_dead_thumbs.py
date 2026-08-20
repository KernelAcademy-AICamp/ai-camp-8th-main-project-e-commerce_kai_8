"""썸네일이 죽은(404) 상품 스캔 — 무신사에서 내려갔거나 이미지가 갈린 상품 찾기.

실행:
  cd backend
  set -a; source .env.local; set +a
  venv/bin/python db/scan_dead_thumbs.py [출력파일]

- c_goods 전체의 thumbnail에 HEAD 요청을 보낸다 (CDN이라 부하 낮음, 동시 30).
- **404만 후보로 기록한다.** 타임아웃·5xx 등 애매한 응답은 1회 재시도 후에도
  불확실하면 제외한다 — 오판 삭제가 누락보다 나쁘다. 제외 건수는 마지막에 보고.
- 출력: 한 줄에 goods_no 하나 (기본 dead_thumbs.txt).
"""

import asyncio
import os
import sys

import httpx
import psycopg

CONCURRENCY = 30
TIMEOUT = 8.0


async def check(client: httpx.AsyncClient, sem: asyncio.Semaphore, goods_no: int, url: str):
    async with sem:
        for attempt in (1, 2):
            try:
                r = await client.head(url, timeout=TIMEOUT)
                if r.status_code == 404:
                    return goods_no, "dead"
                if r.status_code == 200:
                    return goods_no, "ok"
                # 403·5xx 등 — 한 번 더
            except httpx.HTTPError:
                pass
            if attempt == 1:
                await asyncio.sleep(1.0)
    return goods_no, "unsure"


async def main() -> None:
    out_path = sys.argv[1] if len(sys.argv) > 1 else "dead_thumbs.txt"
    dsn = os.environ["SUPABASE_DB_URL"]
    with psycopg.connect(dsn) as conn:
        rows = conn.execute(
            "select goods_no, thumbnail from c_goods where thumbnail is not null"
        ).fetchall()
    print(f"대상 {len(rows)}건", flush=True)

    sem = asyncio.Semaphore(CONCURRENCY)
    dead: list[int] = []
    unsure = 0
    done = 0
    async with httpx.AsyncClient(follow_redirects=True) as client:
        tasks = [check(client, sem, no, url) for no, url in rows]
        for future in asyncio.as_completed(tasks):
            goods_no, state = await future
            if state == "dead":
                dead.append(goods_no)
            elif state == "unsure":
                unsure += 1
            done += 1
            if done % 10000 == 0:
                print(f"{done}/{len(rows)} 확인, 404 {len(dead)}건", flush=True)

    with open(out_path, "w", encoding="utf-8") as f:
        f.writelines(f"{no}\n" for no in sorted(dead))
    print(f"완료: 404 {len(dead)}건 → {out_path}, 불확실(제외) {unsure}건", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
