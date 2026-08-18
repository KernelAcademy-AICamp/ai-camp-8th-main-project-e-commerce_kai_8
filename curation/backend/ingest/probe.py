"""키워드 수율 측정기. 후보 키워드가 타깃 상품에 도달하는지 본 수집 전에 확인.
사용: cd backend && python -m ingest.probe [키워드 ...]"""
import sys

from ingest.keywords import SEED_KEYWORDS
from ingest.naver_client import NaverClient
from ingest.normalize import _clean_title
from settings import naver_credentials


def summarize(query: str, items: list[dict], top: int = 5) -> str:
    lines = [f"[{query}] 표본 {len(items)}건"]
    for it in items[:top]:
        title = _clean_title(it.get("title", ""))
        brand = it.get("brand") or "-"
        price = it.get("lprice") or "-"
        lines.append(f"  · {title[:40]} | {brand} | {price}")
    return "\n".join(lines)


def main() -> None:
    keywords = sys.argv[1:] or SEED_KEYWORDS
    client = NaverClient(*naver_credentials())
    for kw in keywords:
        items = client.search(kw, max_items=20)
        print(summarize(kw, items))
        print()


if __name__ == "__main__":
    main()
