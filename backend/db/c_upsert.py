"""c_* 테이블 적재. Postgres에 직접 붙는다(psycopg).

기존 db/musinsa_upsert.py는 Supabase 클라이언트(HTTP/PostgREST) 전용이라
로컬 Postgres에 쓸 수 없다. 이쪽은 접속 문자열만 바꾸면 로컬과 Supabase 양쪽에 그대로 쓴다.

기존 적재와 결정적으로 다른 점: **실패한 필드가 이전 성공값을 덮지 않는다.**
전체 행 upsert는 2차 실행에서 detail이 실패하면 1차의 정상 detail을 null로 지워버린다.
7.5시간짜리 수집에서 중간 실패는 정상 상황이므로 이 보존이 필수다.
설계: docs/superpowers/specs/2026-08-11-musinsa-c-db-design.md §7
"""
from psycopg.types.json import Jsonb

# 값이 null이면 기존 값을 유지할 열들.
_DATA_COLS = ("plp", "detail", "options", "actual_size", "stat", "tags", "survey", "ai_summary")
_COLS = ("goods_no", *_DATA_COLS, "ingest_tag")

# source_status 열은 두지 않는다. 226,320행 전수에서 고유값이 2개뿐이었고,
# 그 2개가 정확히 (survey is null)과 일치해 정보량이 0이었다(2026-08-12).
# 엔드포인트별 상태는 c_ingest_state가 상품×엔드포인트 단위로 더 정확히 갖는다.
_SQL = f"""
insert into c_raw_goods ({", ".join(_COLS)}, fetched_at)
values ({", ".join("%s" for _ in _COLS)}, now())
on conflict (goods_no) do update set
  {", ".join(f"{c} = coalesce(excluded.{c}, c_raw_goods.{c})" for c in _DATA_COLS)},
  ingest_tag = excluded.ingest_tag,
  fetched_at = now()
"""


def _dedupe(rows: list[dict]) -> list[dict]:
    """배치 안에 같은 goods_no가 있으면 마지막 것만 남긴다(21000 회피)."""
    unique: dict = {}
    for r in rows:
        unique[r["goods_no"]] = r
    return list(unique.values())


def _params(row: dict, ingest_tag: str) -> tuple:
    return (
        row["goods_no"],
        *(Jsonb(row.get(c)) if row.get(c) is not None else None for c in _DATA_COLS),
        ingest_tag,
    )


def upsert_c_raw_goods(conn, rows: list[dict], *, ingest_tag: str, chunk: int = 500) -> int:
    """멱등 적재. 반환값은 적재한 행 수(중복 제거 후)."""
    rows = _dedupe(rows)
    if not rows:
        return 0
    saved = 0
    for i in range(0, len(rows), chunk):
        part = rows[i:i + chunk]
        with conn.cursor() as cur:
            cur.executemany(_SQL, [_params(r, ingest_tag) for r in part])
        conn.commit()
        saved += len(part)
    return saved


__all__ = ["upsert_c_raw_goods"]
