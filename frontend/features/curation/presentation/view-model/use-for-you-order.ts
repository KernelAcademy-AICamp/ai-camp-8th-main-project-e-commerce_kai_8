"use client";

import { type RefObject, useEffect, useRef, useState } from "react";

import curationRules from "@/features/curation/data/curation-rules.json";
import { type Curation, FOR_YOU_VISIBLE } from "@/features/curation/domain/curation";
import { filterByGender } from "@/features/curation/domain/curation-gender";
import {
  type CurationRule,
  orderByTaste,
} from "@/features/curation/domain/curation-match";
import {
  cachedAnchorTitles,
  fetchMissingAnchorTitles,
} from "@/shared/profile/anchor-titles";
import {
  readCurationViews,
  recordCurationViews,
} from "@/shared/profile/curation-views";
import { getFeedProfileSummary } from "@/shared/signals/signals";

const rules: Record<string, CurationRule | undefined> = curationRules;

/**
 * FOR YOU 목록을 **내 성별 것만 남겨** 그 사람 취향 순으로 세운다 — BROWSE 피드와
 * **같은 앵커·같은 성별 판정**을 쓴다.
 * 걸린 큐레이션이 앞으로 오고 나머지는 기본 순서로 이어지므로, 첫 화면 6장이
 * 그 사람 것으로 채워진다.
 *
 * **첫 렌더는 반드시 기본 순서다.** 서버가 그린 것과 같아야 하이드레이션이
 * 어긋나지 않는다. 제목 캐시가 차 있으면 마운트 직후 한 번에 바뀌고(눈에는 그냥
 * 그려진 것으로 보인다), 비어 있으면 조회가 끝난 뒤 바뀐다.
 *
 * 비회원·앵커 없음·조회 실패는 전부 **기본 순서**다 — 개인화인 척하지 않는다.
 *
 * @param paneRef 이 목록이 놓인 칸. 그 칸이 실제로 보였을 때만 노출로 센다.
 */
export function useForYouOrder(
  curations: Curation[],
  paneRef: RefObject<HTMLElement | null>,
): Curation[] {
  const [ordered, setOrdered] = useState(curations);
  // 노출을 적을 때 화면에 선 순서를 봐야 한다 — 렌더와 무관하므로 ref로 둔다
  const shownRef = useRef(curations);
  // 개인화가 실제로 걸린 방문인가. 아래 노출 기록의 조건이다.
  const personalizedRef = useRef(false);

  useEffect(() => {
    // 요약이 null = 비회원(O-37) 또는 저장 불가 환경 → 기본 순서
    const summary = getFeedProfileSummary();
    if (!summary) return;
    const anchors = [...summary.longAnchors, ...summary.sessionAnchors];
    if (anchors.length === 0) return;

    personalizedRef.current = true;
    // 성별을 먼저 거른다 — 남는 게 적어 빠진 큐레이션이 6장 자리를 차지하지 않게.
    const mine = filterByGender(curations, summary.gender);
    // 노출 횟수는 이번 마운트 동안 고정한다 — 아래에서 적어도 순서가 흔들리지 않는다
    const views = readCurationViews();
    const reorder = () => {
      const next = orderByTaste(mine, rules, cachedAnchorTitles(anchors), views);
      shownRef.current = next;
      setOrdered(next);
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

  /**
   * 칸이 **실제로 보였을 때** 첫 화면 몫을 한 번 노출로 적는다.
   *
   * 마운트만으로 세면 안 된다 — 두 칸이 늘 함께 마운트돼 있어서, BROWSE만 쓰다 끝난
   * 방문까지 세면 본 적 없는 큐레이션이 깎이고 다음에 더 약한 것이 올라온다.
   * 방문당 한 번이면 충분해 첫 교차에서 관찰을 끊는다.
   *
   * **개인화가 걸린 방문만 적는다.** 비회원은 취향을 쌓지 않고(O-37), 앵커가 없는
   * 사람은 깎을 점수 자체가 없다 — 어느 쪽이든 적어 봐야 쓰이지 않는 기록이다.
   */
  useEffect(() => {
    const pane = paneRef.current;
    if (!pane) return;
    const observer = new IntersectionObserver((entries) => {
      if (!personalizedRef.current) return;
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      recordCurationViews(shownRef.current.slice(0, FOR_YOU_VISIBLE).map((c) => c.key));
    });
    observer.observe(pane);
    return () => {
      observer.disconnect();
    };
  }, [paneRef]);

  return ordered;
}
