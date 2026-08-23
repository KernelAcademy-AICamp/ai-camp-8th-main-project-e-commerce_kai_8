// FOR YOU 큐레이션 순위 점수 조회 — 앵커와 큐레이션 대표 벡터의 코사인.
//
// 상품 번호 묶음을 보내지 않는다. 큐레이션 정의는 서버(c_curation_vecs)가 갖고
// 브라우저는 **자기 앵커만** 보낸다 — c_taste_summary와 같은 이유다(남의 목록을 넣어
// 카탈로그 속성을 캐내지 못하게).
//
// 마이그레이션: backend/supabase/migrations/20260822500000_curation_vec_rank.sql

import { rpcPost } from "@/shared/supabase-rpc";

interface RankRow {
  key: string;
  score: number;
}

/** 앵커 하나 — BROWSE 피드가 보내는 것과 같은 모양 */
interface Anchor {
  goodsNo: number;
  weight: number;
}

const toAnchor = (a: Anchor) => ({
  g: a.goodsNo,
  // 서버는 float 하나만 필요 — 소수 자리 축소로 페이로드를 줄인다 (mix-api와 같다)
  w: Math.round(a.weight * 100) / 100,
});

/**
 * 큐레이션 키 → 코사인 점수. 앵커가 없거나 벡터를 못 찾으면 **빈 객체**다
 * (서버가 0행을 준다) — 부르는 쪽은 키워드 점수만으로 순서를 낸다.
 *
 * FOR YOU는 첫 화면이라 오래 잡고 있으면 안 된다. 초과하면 키워드 순서가 그대로 남는다.
 */
export async function fetchCurationRank(
  sessionAnchors: Anchor[],
  longAnchors: Anchor[],
): Promise<Record<string, number>> {
  const rows = await rpcPost<RankRow[]>(
    "c_curation_rank",
    {
      p_session: sessionAnchors.map(toAnchor),
      p_long: longAnchors.map(toAnchor),
    },
    { timeoutMs: 3_000 },
  );
  return Object.fromEntries(rows.map((r) => [r.key, r.score]));
}
