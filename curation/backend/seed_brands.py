"""brands 사전 초기 시드(멱등 upsert). 실행: cd backend && python seed_brands.py
이후 사전 관리는 DB(brands 테이블)에서 직접. 여기는 최초 부트스트랩용.

계열(category):
  climbing_core    — 클라이밍 전문 소수 브랜드(타깃 핵심)
  climbing_alpine  — 클라이밍/알파인 대형
  outdoor_general  — 일반 등산/아웃도어
aliases 첫 원소는 항상 canonical(자기 이름으로도 매칭되게). 확인된 표기·약칭만 넣는다.
"""
from db.client import get_client


def _entry(canonical: str, extra: list[str], category: str) -> dict:
    return {"canonical": canonical, "aliases": [canonical, *extra], "category": category}


def core(canonical: str, *extra: str) -> dict:
    return _entry(canonical, list(extra), "climbing_core")


def alpine(canonical: str, *extra: str) -> dict:
    return _entry(canonical, list(extra), "climbing_alpine")


def outdoor(canonical: str, *extra: str) -> dict:
    return _entry(canonical, list(extra), "outdoor_general")


SEED: list[dict] = [
    # ── climbing_core: 클라이밍 전문 소수 브랜드 ──
    core("온사이트", "ONSIGHT", "onsight"),
    core("포텐셜"),
    core("세이즈믹"),
    core("볼더씨"),
    core("쏘엠"),
    core("베어버스"),
    core("피클"),
    core("와일"),
    core("웨이브락"),
    core("디컨투어"),
    core("알투라"),
    core("소셜클라이밍클럽", "소셜 클라이밍 클럽"),
    core("야마", "YAMA"),
    core("위드홀드"),
    core("액션다이렉트"),
    core("크래커클라이밍", "크래커 클라이밍", "크래커", "Cracker Climbing"),
    core("클라이밍브라더스", "클라이밍 브라더스"),
    core("위케어", "WECARE"),
    core("에꼴리에"),
    core("브로이스터"),
    core("레몬클라임비터", "레클비"),
    core("알테그리히"),
    core("스피드바이"),
    core("Bmind"),
    core("홀림"),
    core("9gu", "구구"),
    core("쏘키즈포켓"),
    core("돌자비마켓"),
    core("클리미"),
    core("오름", "ORUMM"),
    core("킵칠링", "keepchilling"),
    core("키모리"),
    # ── climbing_alpine: 클라이밍/알파인 대형 ──
    alpine("아크테릭스", "ARCTERYX"),
    alpine("파타고니아", "PATAGONIA"),
    alpine("마무트", "MAMMUT"),
    alpine("페츨", "PETZL"),
    alpine("그리벨", "GRIVEL"),
    alpine("블랙다이아몬드", "BLACK DIAMOND"),
    alpine("몬츄라", "MONTURA"),
    alpine("RAB", "랩"),
    alpine("클라터뮤젠"),
    alpine("오순", "OCUN"),
    # ── outdoor_general: 일반 등산/아웃도어 ──
    outdoor("코오롱스포츠", "코오롱 스포츠", "코오롱", "KOLON", "KS", "코오롱인더스트리"),
    outdoor("블랙야크", "BLACKYAK", "블랙야크키즈"),
    outdoor("네파", "NEPA"),
    outdoor("몽벨", "MONTBELL"),
    outdoor("프로스펙스", "PROSPECS"),
    outdoor("디스커버리", "디스커버리익스페디션"),
    outdoor("노스페이스", "THE NORTH FACE"),
    outdoor("K2"),
    outdoor("밀레", "MILLET"),
    outdoor("아이더", "EIDER"),
    outdoor("컬럼비아", "COLUMBIA"),
]


def main() -> None:
    client = get_client()
    client.table("brands").upsert(SEED, on_conflict="canonical").execute()
    by_cat: dict[str, int] = {}
    for e in SEED:
        by_cat[e["category"]] = by_cat.get(e["category"], 0) + 1
    print(f"시드 완료: {len(SEED)}개 upsert  {by_cat}")


if __name__ == "__main__":
    main()
