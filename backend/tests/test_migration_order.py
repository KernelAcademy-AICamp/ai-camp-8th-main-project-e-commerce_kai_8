"""마이그레이션 앞뒤 참조 검사 — **DB 없이 CI에서 돈다.**

이 repo의 `c_*` 마이그레이션은 `supabase_migrations`에 기록되지 않고 psql로
손으로 적용한다. 그래서 **파일 이름 순서가 곧 배포 순서**이고, 앞선 파일이 뒤
파일에서 만드는 객체를 쓰면 새 DB 구축이 그 자리에서 멈춘다.

실제로 그렇게 깨져 있었다: `c_search_docs`를 적재하는 파일이 `c_chosung`을
호출하는데 그 함수는 다음 번호에서 만들어졌다. 파일 번호를 앞당겨 고쳤지만,
같은 실수를 사람이 다시 하지 않으리라는 보장이 없어 여기서 막는다.

⚠️ **이 검사는 clean bootstrap을 증명하지 않는다.** SQL을 실행하지 않고 정규식으로
`c_*` 이름의 최초 정의와 텍스트 참조만 비교한다. 타입·확장·비-`c_*` 객체·실제 DDL
오류는 범위 밖이고, `ALLOWED`에 적은 호출이 나중에 적재 구간으로 옮겨져도 잡지
못한다. 실제로 새 DB를 세워 보는 것을 대신하지 못한다 — 검색 마이그레이션의
**한 가지 실패 유형**만 막는다.

**적재 중 호출(eager)과 질의 중 호출(late)은 다르다.** plpgsql 함수 본문은
생성 시점에 이름을 풀지 않으므로, RPC가 뒤 번호의 함수를 불러도 마이그레이션
자체는 통과하고 전부 적용된 뒤에는 정상 동작한다. 그런 경우만 아래에 사유와
함께 적어 둔다 — 목록에 없으면 실패한다.
"""
import re
from pathlib import Path

MIGRATIONS = Path(__file__).resolve().parents[1] / "supabase" / "migrations"

# 앞선 파일이 뒤 객체를 참조해도 되는 예외. 이유를 반드시 적는다.
ALLOWED = {
    (
        "20260817200000_c_search_docs.sql",
        "c_restore_hangul_typing",
    ): "c_search_page_v2 본문의 호출 — plpgsql은 생성 시 이름을 풀지 않는다. "
    "마이그레이션 실행 중에는 부르지 않으므로 전부 적용되면 정상이다.",
    (
        "20260817200000_c_search_docs.sql",
        "c_search_correct_query",
    ): "위와 같다 — 질의 시점에만 불린다.",
    (
        "20260817200000_c_search_docs.sql",
        "c_search_color_parse",
    ): "위와 같다 — c_search_page_v2 본문에서 질의 시점에만 불린다.",
}

CREATE = re.compile(
    r"create\s+(?:or\s+replace\s+)?"
    r"(?:table|function|view|index|materialized\s+view)\s+"
    r"(?:if\s+not\s+exists\s+)?([a-z_][a-z0-9_]*)",
    re.I,
)
RENAME = re.compile(r"rename\s+to\s+([a-z_][a-z0-9_]*)", re.I)


def strip_comments(sql: str) -> str:
    return re.sub(r"--[^\n]*", "", sql)


def test_no_unexplained_forward_references():
    files = sorted(MIGRATIONS.glob("*.sql"))
    assert files, "마이그레이션 파일을 찾지 못했다"

    # 각 c_* 객체를 **처음 만드는** 파일
    origin: dict[str, str] = {}
    for path in files:
        body = strip_comments(path.read_text(encoding="utf-8"))
        for pattern in (CREATE, RENAME):
            for match in pattern.finditer(body):
                origin.setdefault(match.group(1).lower(), path.name)

    problems: list[str] = []
    for path in files:
        body = strip_comments(path.read_text(encoding="utf-8"))
        for obj, made_in in origin.items():
            if not obj.startswith("c_") or made_in <= path.name:
                continue
            if not re.search(rf"\b{re.escape(obj)}\b", body):
                continue
            if (path.name, obj) in ALLOWED:
                continue
            problems.append(f"{path.name} 가 {obj} 를 쓰는데 {made_in} 에서 만들어진다")

    assert not problems, (
        "앞선 마이그레이션이 뒤 파일의 객체를 참조한다 — 새 DB를 파일 순서로 "
        "세우면 멈춘다. 파일 번호를 옮기거나, 실행 중이 아니라 질의 시점에만 "
        "불린다면 ALLOWED에 사유와 함께 추가할 것.\n  " + "\n  ".join(problems)
    )


def test_function_is_defined_before_it_is_used_in_the_same_file():
    """**같은 파일 안의 순서**도 본다.

    적재문(INSERT/UPDATE)이 부르는 함수가 파일 뒤쪽에 정의돼 있으면, 적재는 DB에
    남아 있던 **옛 정의**를 쓴다. 파일을 고쳐도 값이 안 바뀌고 두 번 돌려야
    반영된다. 실제로 카테고리 순위를 두 번 바꿨는데 둘 다 적용되지 않았다.
    파일명만 비교하는 위 검사로는 이걸 못 잡는다.
    """
    problems: list[str] = []
    for path in sorted(MIGRATIONS.glob("*.sql")):
        body = strip_comments(path.read_text(encoding="utf-8"))
        defined = {
            m.group(1).lower(): m.start()
            for m in re.finditer(
                r"create\s+(?:or\s+replace\s+)?function\s+([a-z_][a-z0-9_]*)", body, re.I
            )
        }
        for stmt in re.finditer(r"\b(?:insert\s+into|update)\b", body, re.I):
            # 이 문장부터 다음 세미콜론까지가 적재문이다
            end = body.find(";", stmt.start())
            chunk = body[stmt.start() : end if end > 0 else len(body)]
            for name, defined_at in defined.items():
                if re.search(rf"\b{re.escape(name)}\s*\(", chunk) and defined_at > stmt.start():
                    problems.append(
                        f"{path.name}: 적재문이 {name}()를 부르는데 그 정의가 뒤에 있다"
                    )
    assert not problems, (
        "적재문이 부르는 함수는 그 문장보다 **먼저** 정의돼야 한다 — 안 그러면 "
        "DB에 남은 옛 정의가 쓰인다.\n  " + "\n  ".join(sorted(set(problems)))
    )


def test_allowed_entries_are_still_real():
    """예외 목록이 낡지 않게 한다 — 참조가 사라졌으면 목록에서도 지운다."""
    stale = []
    for (name, obj), _reason in ALLOWED.items():
        path = MIGRATIONS / name
        if not path.exists():
            stale.append(f"{name} 파일이 없다")
        elif not re.search(rf"\b{re.escape(obj)}\b", strip_comments(path.read_text(encoding="utf-8"))):
            stale.append(f"{name} 는 더 이상 {obj} 를 쓰지 않는다")
    assert not stale, "ALLOWED가 낡았다:\n  " + "\n  ".join(stale)
