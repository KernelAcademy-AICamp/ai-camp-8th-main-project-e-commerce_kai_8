"use client";

import { useEffect, useState } from "react";

import curationRules from "@/features/curation/data/curation-rules.json";
import type { Curation } from "@/features/curation/domain/curation";
import {
  type CurationRule,
  orderByTaste,
} from "@/features/curation/domain/curation-match";
import {
  cachedAnchorTitles,
  fetchMissingAnchorTitles,
} from "@/shared/profile/anchor-titles";
import { getFeedProfileSummary } from "@/shared/signals/signals";

const rules: Record<string, CurationRule | undefined> = curationRules;

/**
 * FOR YOU 목록을 그 사람 취향 순으로 세운다 — BROWSE 피드와 **같은 앵커**를 쓴다.
 * 걸린 큐레이션이 앞으로 오고 나머지는 기본 순서로 이어지므로, 첫 화면 6장이
 * 그 사람 것으로 채워진다.
 *
 * **첫 렌더는 반드시 기본 순서다.** 서버가 그린 것과 같아야 하이드레이션이
 * 어긋나지 않는다. 제목 캐시가 차 있으면 마운트 직후 한 번에 바뀌고(눈에는 그냥
 * 그려진 것으로 보인다), 비어 있으면 조회가 끝난 뒤 바뀐다.
 *
 * 비회원·앵커 없음·조회 실패는 전부 **기본 순서**다 — 개인화인 척하지 않는다.
 */
export function useForYouOrder(curations: Curation[]): Curation[] {
  const [ordered, setOrdered] = useState(curations);

  useEffect(() => {
    // 요약이 null = 비회원(O-37) 또는 저장 불가 환경 → 기본 순서
    const summary = getFeedProfileSummary();
    if (!summary) return;
    const anchors = [...summary.longAnchors, ...summary.sessionAnchors];
    if (anchors.length === 0) return;

    const reorder = () => {
      setOrdered(orderByTaste(curations, rules, cachedAnchorTitles(anchors)));
    };
    reorder(); // 캐시에 있는 것만으로 먼저
    void fetchMissingAnchorTitles(anchors)
      .then((gotNew) => {
        if (gotNew) reorder();
      })
      .catch(() => {
        // 제목을 못 받으면 지금 순서 그대로 둔다 — 다음 방문에 다시 시도된다
      });
  }, [curations]);

  return ordered;
}
