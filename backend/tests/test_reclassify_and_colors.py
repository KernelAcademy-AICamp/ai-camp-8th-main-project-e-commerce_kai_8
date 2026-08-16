"""재분류 병합 규칙 + 색군 매핑 마이그레이션 무결성 (개인화 3차 계획 3단계)."""

import pathlib
import re

import numpy as np

from embed.reclassify import PROMPT_SETS, merge_probs

MIG = pathlib.Path(__file__).parent.parent / "supabase" / "migrations" / "20260816210000_color_groups_axes.sql"

# 2026-08-16 카탈로그 스냅숏에 존재하는 54개 색 코드 (DB 실측)
DB_CODES = {
    "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14",
    "15", "16", "23", "24", "25", "26", "28", "29", "30", "31", "32", "34",
    "35", "36", "37", "39", "44", "45", "48", "49", "51", "56", "57", "58",
    "59", "60", "72", "73", "74", "75", "76", "77", "78", "79", "80", "81",
    "82", "83", "84", "85",
}


def parse_mapping():
    sql = MIG.read_text()
    rows = re.findall(
        r"\('(\d+)',\s*'([^']+)',\s*'([^']+)',\s*(true|false),\s*(true|false)\)", sql
    )
    return {
        code: (name, group, achro == "true", vivid == "true")
        for code, name, group, achro, vivid in rows
    }


def test_mapping_covers_all_db_codes_without_duplicates():
    m = parse_mapping()
    assert set(m.keys()) == DB_CODES  # 누락도 잉여도 없음
    assert len(m) == 54


def test_mapping_attributes_are_consistent():
    m = parse_mapping()
    for code, (name, group, achro, vivid) in m.items():
        assert not (achro and vivid), f"code {code}: 무채이면서 원색일 수 없다"
        if achro:
            assert group in {"white", "black", "gray"}, f"code {code}: 무채는 무채 계열이어야"
    # 반대 축이 성립하려면 양쪽 모두 비어 있지 않아야 한다
    assert any(a for _, _, a, _ in m.values())
    assert any(v for _, _, _, v in m.values())


def test_prompt_sets_merge_to_valid_labels():
    for name, prompts in PROMPT_SETS.items():
        labels = [l for _, l in prompts]
        assert set(labels) <= {0, 1, 2, 3}, name
        assert len({p for p, _ in prompts}) == len(prompts), f"{name}: 프롬프트 중복"


def test_merge_probs_sums_grouped_prompts():
    # 프롬프트 3개가 라벨 0,0,3으로 병합될 때: 0.3+0.3 > 0.4 → 라벨 0, conf 0.6
    sm = np.array([[0.3, 0.3, 0.4]])
    labels = np.array([0, 0, 3])
    lab, conf = merge_probs(sm, labels)
    assert lab[0] == 0
    assert abs(conf[0] - 0.6) < 1e-9


def test_merge_probs_argmax_when_no_grouping():
    sm = np.array([[0.1, 0.2, 0.3, 0.4]])
    labels = np.array([0, 1, 2, 3])
    lab, conf = merge_probs(sm, labels)
    assert lab[0] == 3
    assert abs(conf[0] - 0.4) < 1e-9
