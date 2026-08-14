"""썸네일 원본 크기 측정 러너 — c_thumb_dims 적재 (2026-08-14 피드 실데이터 연결 1단계).

피드 카드 영역 예약(레이아웃 이동 금지)에 필요한 가로·세로를 이미지 헤더만 받아 잰다.
- 미측정 상품만 처리하므로 중단 후 재실행하면 이어서 한다.
- 대상이 CDN(image.msscdn.net)이라 API의 동시 6 안전선보다 높은 동시성이 가능하다.
  기본 24 — 일시오류 비율이 튀면 낮춰서 재실행한다. 이미지당 최대 256KB만 수신.
- 측정 실패는 width=0, height=0으로 기록해 재시도 대상에서 뺀다.

사용:
  venv/bin/python run_thumb_dims.py [--limit N] [--workers N]
"""
import argparse
import os
import struct
import threading
from concurrent.futures import ThreadPoolExecutor

import psycopg
import requests
from dotenv import load_dotenv

_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
    "Referer": "https://www.musinsa.com/",
}
_MAX_BYTES = 256 * 1024
_FLUSH_EVERY = 500


def parse_dims(buf: bytes) -> tuple[int, int] | None:
    """JPEG·PNG·GIF·WebP 헤더에서 (width, height)를 뽑는다. 못 찾으면 None."""
    if buf[:3] == b"\xff\xd8\xff":  # JPEG: SOF 마커의 5~8바이트가 height·width
        i = 2
        while i + 9 < len(buf):
            if buf[i] != 0xFF:
                i += 1
                continue
            marker = buf[i + 1]
            if 0xC0 <= marker <= 0xCF and marker not in (0xC4, 0xC8, 0xCC):
                h, w = struct.unpack(">HH", buf[i + 5 : i + 9])
                return (w, h)
            if marker in (0xD8, 0x01) or 0xD0 <= marker <= 0xD7:
                i += 2
                continue
            (seg_len,) = struct.unpack(">H", buf[i + 2 : i + 4])
            i += 2 + seg_len
        return None
    if buf[:8] == b"\x89PNG\r\n\x1a\n" and len(buf) >= 24:
        w, h = struct.unpack(">II", buf[16:24])
        return (w, h)
    if buf[:6] in (b"GIF87a", b"GIF89a") and len(buf) >= 10:
        w, h = struct.unpack("<HH", buf[6:10])
        return (w, h)
    if buf[:4] == b"RIFF" and buf[8:12] == b"WEBP" and len(buf) >= 30:
        fmt = buf[12:16]
        if fmt == b"VP8 ":
            w, h = struct.unpack("<HH", buf[26:30])
            return (w & 0x3FFF, h & 0x3FFF)
        if fmt == b"VP8L":
            bits = struct.unpack("<I", buf[21:25])[0]
            return ((bits & 0x3FFF) + 1, ((bits >> 14) & 0x3FFF) + 1)
        if fmt == b"VP8X":
            w = int.from_bytes(buf[24:27], "little") + 1
            h = int.from_bytes(buf[27:30], "little") + 1
            return (w, h)
    return None


def measure(url: str) -> tuple[int, int] | None:
    """이미지 헤더를 스트리밍으로 받아 크기를 잰다.

    확정 실패(404 등 4xx·파싱 불가)만 (0, 0)으로 기록해 재시도에서 뺀다.
    일시 오류(429·5xx·타임아웃·연결 오류)는 None — 기록하지 않아 다음 실행이 다시 줍는다.
    스로틀에 눌렸을 때 멀쩡한 이미지가 실패로 굳지 않게 하기 위한 구분이다.
    """
    try:
        with requests.get(url, headers=_HEADERS, timeout=20, stream=True) as res:
            if res.status_code == 429 or res.status_code >= 500:
                return None
            if res.status_code != 200:
                return (0, 0)
            buf = b""
            for chunk in res.iter_content(8192):
                buf += chunk
                dims = parse_dims(buf)
                if dims:
                    return dims
                if len(buf) >= _MAX_BYTES:
                    break
        return (0, 0)
    except requests.RequestException:
        return None


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=None, help="이번 실행에서 처리할 최대 상품 수")
    ap.add_argument("--workers", type=int, default=24)
    args = ap.parse_args()

    load_dotenv(os.path.join(os.path.dirname(__file__), ".env.local"))
    dsn = os.environ["SUPABASE_DB_URL"]

    with psycopg.connect(dsn) as conn:
        sql = """
            select g.goods_no, g.thumbnail from c_goods g
            where g.thumbnail is not null
              and not exists (select 1 from c_thumb_dims d where d.goods_no = g.goods_no)
        """
        if args.limit:
            sql += f" limit {args.limit}"
        todo = conn.execute(sql).fetchall()
    print(f"측정 대상 {len(todo)}개", flush=True)

    lock = threading.Lock()
    pending: list[tuple[int, int, int]] = []
    done = [0]
    fail = [0]

    def flush(conn: psycopg.Connection) -> None:
        if not pending:
            return
        rows = pending[:]
        pending.clear()
        conn.execute(
            """
            insert into c_thumb_dims (goods_no, width, height)
            select * from unnest(%s::bigint[], %s::int2[], %s::int2[])
            on conflict (goods_no) do nothing
            """,
            ([r[0] for r in rows], [r[1] for r in rows], [r[2] for r in rows]),
        )
        conn.commit()

    with psycopg.connect(dsn) as write_conn:
        skipped = [0]

        def work(row: tuple[int, str]) -> None:
            goods_no, url = row
            dims = measure(url)
            with lock:
                done[0] += 1
                if dims is None:
                    skipped[0] += 1  # 일시 오류 — 기록 안 함, 다음 실행에서 재시도
                else:
                    pending.append((goods_no, dims[0], dims[1]))
                    if dims[0] == 0:
                        fail[0] += 1
                if done[0] % _FLUSH_EVERY == 0:
                    flush(write_conn)
                    print(
                        f"{done[0]}/{len(todo)} (확정실패 {fail[0]}, 일시오류 {skipped[0]})",
                        flush=True,
                    )

        with ThreadPoolExecutor(max_workers=args.workers) as ex:
            list(ex.map(work, todo))
        flush(write_conn)
    print(
        f"완료: {done[0]}개 처리, 확정실패 {fail[0]}개, 일시오류 {skipped[0]}개(재실행 시 재시도)",
        flush=True,
    )


if __name__ == "__main__":
    main()
