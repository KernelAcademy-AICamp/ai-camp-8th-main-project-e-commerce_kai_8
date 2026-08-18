"""상품 임베딩 텍스트 조립 + NVIDIA 임베딩 호출. 검색 의미축의 원천."""
import requests

from settings import nvidia_credentials

# 라이브 확정(2026-07-24): bge-m3는 이 NVIDIA 계정에서 500(서빙 이슈)이라 1024차원 e5-v5로 확정.
# 비대칭 모델 — 상품은 input_type="passage", 쿼리는 "query". 차원 1024 = migration vector(1024).
MODEL = "nvidia/nv-embedqa-e5-v5"
_CATEGORY_FIELDS = ("category2", "category3", "category4")


def build_embed_text(row: dict) -> str:
    """제목 + 카테고리를 공백으로 이어 임베딩 대상 자유텍스트를 만든다(순수).
    설명 컬럼이 없으므로 카테고리를 의미 보조로 붙인다. 빈 값은 건너뛴다."""
    parts = [row.get("title") or ""]
    parts += [str(row.get(f)) for f in _CATEGORY_FIELDS if row.get(f)]
    return " ".join(p for p in parts if p).strip()


def embed_texts(
    texts: list[str], *, input_type: str = "passage", http_post=None
) -> list[list[float]]:
    """텍스트 리스트를 임베딩 벡터 리스트로. input_type: 상품='passage', 쿼리='query'.
    응답이 뒤섞여 와도 index 기준으로 입력 순서에 맞춰 정렬한다."""
    if not texts:
        return []
    post = http_post or requests.post
    base_url, api_key = nvidia_credentials()
    res = post(
        f"{base_url}/embeddings",
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json={"model": MODEL, "input": texts, "input_type": input_type, "truncate": "END"},
        timeout=30,
    )
    res.raise_for_status()
    data = sorted(res.json()["data"], key=lambda d: d["index"])
    return [d["embedding"] for d in data]
