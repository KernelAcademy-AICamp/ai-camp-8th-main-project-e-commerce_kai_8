"use client";

import { type RefObject, useEffect, useMemo, useRef, useState } from "react";

import { fetchCurationRank } from "@/features/curation/data/curation-rank-api";
import curationRules from "@/features/curation/data/curation-rules.json";
import { type Curation, FOR_YOU_VISIBLE } from "@/features/curation/domain/curation";
import { filterByGender } from "@/features/curation/domain/curation-gender";
import {
  type CurationRule,
  type CurationVectors,
  groundedKeys,
  orderByTaste,
  scoreCurations,
  withGroundedReasons,
} from "@/features/curation/domain/curation-match";
import { useGenderSetting } from "@/shared/gender/use-gender-setting";
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
/** 개인화가 아예 안 걸렸을 때 이유 문구를 지우는 용도 — 매번 새로 만들 필요가 없다 */
const NO_GROUNDED = new Set<string>();

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
  // **성별은 설정에서 온다.** 예전에는 취향 프로필의 행동 판정(#63)을 읽었는데,
  // 사람이 고른 값이 진실이 된 뒤로는 그것을 읽으면 한 앱 안에 성별이 둘이 된다.
  const gender = useGenderSetting();
  // **성별 필터는 앵커와 무관하게 항상 건다.** 예전에는 앵커가 없으면 곧바로 되돌아가
  // 성별 필터까지 함께 건너뛰었다 — 방금 가입해 아무것도 안 한 사람에게 반대 성별이
  // 그대로 보였다는 뜻이다. 취향 정렬만 앵커가 있을 때의 일이다.
  //
  // 렌더에서 계산한다(효과에서 setState하지 않는다). `useGenderSetting`은 서버 스냅숏이
  // 늘 미확정이라, 하이드레이션 렌더는 거르지 않은 목록으로 서버와 같게 그려진다.
  const mine = useMemo(() => filterByGender(curations, gender), [curations, gender]);
  // 취향 정렬 결과. 아직 못 정했으면 null이고 그때는 성별만 거른 목록을 보여준다.
  const [tasteOrdered, setTasteOrdered] = useState<Curation[] | null>(null);
  // 노출을 적을 때 화면에 선 순서를 봐야 한다 — 렌더와 무관하므로 ref로 둔다
  const shownRef = useRef(curations);
  // 개인화가 실제로 걸린 방문인가. 아래 노출 기록의 조건이다.
  const personalizedRef = useRef(false);

  useEffect(() => {
    // 목록이나 성별이 바뀌면 예전 정렬은 버린다 — 남겨 두면 반대 성별 순서가 한 프레임
    // 비친다.
    // 이 효과가 만든 요청인지 표시한다 — 성별이 바뀌면 이전 요청의 완료 콜백이
    // **옛 성별로 거른 목록**을 다시 설치할 수 있다(교차 리뷰 지적).
    let live = true;
    const showBase = () => {
      shownRef.current = withGroundedReasons(mine, NO_GROUNDED);
      setTasteOrdered(null);
    };
    showBase();

    // 요약이 null = 비회원(O-37) 또는 저장 불가 환경 → 성별만 거른 기본 순서
    const summary = getFeedProfileSummary();
    if (!summary) return;
    const anchors = [...summary.longAnchors, ...summary.sessionAnchors];
    if (anchors.length === 0) return;

    personalizedRef.current = true;
    // 노출 횟수는 이번 마운트 동안 고정한다 — 아래에서 적어도 순서가 흔들리지 않는다
    const views = readCurationViews();
    // 벡터 점수는 조회로만 온다(캐시 없음) — 도착하면 채워지고, 못 오면 빈 채로 남아
    // 키워드 점수만으로 순서가 난다.
    let vectors: CurationVectors = {};
    const reorder = () => {
      if (!live) return; // 성별·목록이 바뀐 뒤 도착한 응답은 버린다
      const anchorTitles = cachedAnchorTitles(anchors);
      const next = orderByTaste(mine, rules, anchorTitles, views, vectors);
      // 이유 문구는 벡터 전용 매치가 아니라 키워드 근거가 있을 때만 남긴다.
      const grounded = groundedKeys(
        scoreCurations(mine, rules, anchorTitles, views, vectors),
      );
      const withReasons = withGroundedReasons(next, grounded);
      shownRef.current = withReasons;
      setTasteOrdered(withReasons);
    };
    reorder(); // 캐시에 있는 것만으로 먼저
    void fetchMissingAnchorTitles(anchors)
      .then((gotNew) => {
        if (gotNew) reorder();
      })
      .catch(() => {
        // 제목을 못 받으면 지금 순서 그대로 둔다 — 다음 방문에 다시 시도된다
      });
    // 벡터 점수. BROWSE 피드와 **같은 앵커**를 그대로 보낸다 — 두 화면이 같은 취향을
    // 다른 자로 재지 않게 하는 것이 이 조각의 목적이다.
    void fetchCurationRank(summary.sessionAnchors, summary.longAnchors)
      .then((scores) => {
        if (Object.keys(scores).length === 0) return; // 앵커를 못 푼 경우 — 0행
        vectors = scores;
        reorder();
      })
      .catch(() => {
        // 조회 실패·시간 초과 — 키워드 순서가 그대로 남는다
      });

    return () => {
      live = false;
    };
  }, [mine]);

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

  return tasteOrdered ?? withGroundedReasons(mine, NO_GROUNDED);
}
