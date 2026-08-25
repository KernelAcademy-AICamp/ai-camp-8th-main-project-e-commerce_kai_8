"""FOR YOU 카드 추천 이유 한 줄 초안 생성 (사람 검수 전).

큐레이션 각각의 제목·소개문단·선별조건 라벨을 근거로, "최근 관심 보인 것과 왜
맞는지"를 설명하는 한국어 한 줄을 Claude Haiku로 만든다. 결과는 파일로만 남고
gen_curation_page.py의 REASONS 딕셔너리에는 자동으로 반영되지 않는다 — 사람이
훑어보고 확정한 것만 손으로 옮겨 적는다.
계획: docs/superpowers/plans/2026-08-25-foryou-recommendation-reason.md

실행 (backend 디렉터리에서, ANTHROPIC_API_KEY 필요):
    .venv/bin/python scripts/gen_curation_reasons.py           # 전체 초안 생성
    .venv/bin/python scripts/gen_curation_reasons.py --demo    # 프롬프트 조립 자체점검(API 호출 없음)
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from gen_curation_page import SEED  # noqa: E402

MODEL = "claude-haiku-4-5"
OUT = Path(__file__).parent / "curation_reasons_draft.json"

PROMPT = """아래 큐레이션 정보를 보고, "최근 관심 보인 것과 왜 맞는지"를 설명하는
한국어 한 줄을 만들어라.

큐레이션 제목: {title}
소개: {lede}
선별 조건: {cond}

규칙:
- 30자 안팎, 존댓말체(-예요/-해요), 이모지 없음.
- "최근 관심 보인" 또는 이와 비슷한 말로 시작한다.
- 위에 없는 사실을 지어내지 않는다. 문장 하나만 출력한다(따옴표·설명 없이)."""


def build_prompt(entry):
    """SEED 한 항목 → LLM에 보낼 프롬프트 문자열."""
    return PROMPT.format(
        title=entry["title"], lede=entry["lede"],
        cond=", ".join(entry["cond_labels"]))


def generate_all(entries, client):
    out = {}
    for entry in entries:
        msg = client.messages.create(
            model=MODEL, max_tokens=200,
            messages=[{"role": "user", "content": build_prompt(entry)}])
        text = msg.content[0].text.strip()
        out[entry["key"]] = text
        print(f"{entry['key']}: {text}")
    return out


def demo():
    """자체 점검: 프롬프트가 근거(제목·조건)를 실제로 담는지. API 호출 없음."""
    entry = {"key": "cat_print", "title": "고양이 프린트 반팔",
              "lede": "고양이 그래픽이 크게 들어간 것.", "cond_labels": ["고양이", "9/9"]}
    p = build_prompt(entry)
    assert "고양이 프린트 반팔" in p, p
    assert "고양이, 9/9" in p, p
    print("demo ok")


def main():
    if "--demo" in sys.argv:
        demo()
        return
    from anthropic import Anthropic
    client = Anthropic()
    result = generate_all(SEED, client)
    OUT.write_text(json.dumps(result, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"\n{len(result)}장 초안 → {OUT}")
    print("훑어보고 고친 뒤 gen_curation_page.py의 REASONS에 손으로 옮겨 적을 것.")


if __name__ == "__main__":
    main()
