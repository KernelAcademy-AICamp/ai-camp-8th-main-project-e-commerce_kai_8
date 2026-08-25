"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { logTasteRefresh, logTasteView } from "@/shared/signals/signals";
import type { TasteViewOutcome } from "@/shared/signals/types";
import { useSignedIn } from "@/shared/supabase/use-signed-in";

import { fetchTasteSummary, refreshTasteSummary } from "../../data/taste-summary-api";
import { isStillCollecting, type TasteSummary } from "../../domain/taste-summary";

export type TasteCardState =
  /** 로그인 여부를 아직 모르거나 불러오는 중 */
  | { kind: "loading" }
  /** 비회원 — 카드가 없다 */
  | { kind: "hidden" }
  | { kind: "ready"; summary: TasteSummary }
  | { kind: "failed" };

type Loaded =
  { kind: "loading" } | { kind: "ready"; summary: TasteSummary } | { kind: "failed" };

/**
 * 마이페이지를 열 때만 부른다.
 *
 * **피드 경로에 얹지 않는다.** 피드는 이미 느린 구간이 있어(동시 4요청에서
 * 16~18초) 화면마다 집계를 부르면 그쪽이 먼저 무너진다.
 *
 * 로그인 여부는 **상태로 복사하지 않고** 그때그때 파생한다 — 두 벌로 두면
 * 로그아웃한 뒤에도 남의 취향이 잠깐 남는다.
 */
export interface TasteCardViewModel {
  state: TasteCardState;
  /** 새로고침이 도는 중 — 버튼을 잠그고 도는 표시를 낸다 */
  refreshing: boolean;
  /** 지금 세션의 취향까지 접어 올리고 다시 그린다 */
  refresh: () => void;
}

export function useTasteSummary(): TasteCardViewModel {
  const signedIn = useSignedIn();
  const [loaded, setLoaded] = useState<Loaded>({ kind: "loading" });
  const [refreshing, setRefreshing] = useState(false);

  // **마운트당 한 번만 조회를 센다.** 새로고침으로 다시 그려질 때 또 세면
  // 새로고침을 많이 누른 사람일수록 조회를 많이 한 것처럼 보인다.
  const viewLoggedRef = useRef(false);
  const logViewOnce = useCallback((outcome: TasteViewOutcome) => {
    if (viewLoggedRef.current) return;
    viewLoggedRef.current = true;
    logTasteView(outcome);
  }, []);

  useEffect(() => {
    if (signedIn !== "in") return;

    let alive = true;
    void fetchTasteSummary().then(
      (summary) => {
        if (!alive) return;
        setLoaded({ kind: "ready", summary });
        logViewOnce(isStillCollecting(summary) ? "insufficient_data" : "rendered");
      },
      () => {
        if (!alive) return;
        setLoaded({ kind: "failed" });
        logViewOnce("error");
      },
    );
    return () => {
      alive = false;
      // 로그인 상태를 떠나면 받아둔 요약을 버린다. 실경로에선 계정 전환이 항상
      // 전체 내비게이션을 거치지만, 남의 취향을 메모리에 들고 있을 이유가 없다.
      setLoaded({ kind: "loading" });
    };
    // logViewOnce는 useCallback으로 고정돼 있어 넣어도 다시 돌지 않는다
  }, [signedIn, logViewOnce]);

  // 도는 중의 재클릭은 무시 — 접기는 한 번이면 충분하고, 겹치면 올리기 순서가 섞인다
  const busyRef = useRef(false);
  const refresh = useCallback(() => {
    // **막힌 클릭도 기록한다.** 화면상 아무 일도 안 일어나지만 누른 것은 누른
    // 것이라, 빼면 연타하는 사람이 한 번만 누른 것으로 보인다.
    if (busyRef.current) {
      logTasteRefresh("ignored_duplicate");
      return;
    }
    busyRef.current = true;
    setRefreshing(true);
    void refreshTasteSummary()
      .then(
        ({ summary, fold }) => {
          setLoaded({ kind: "ready", summary });
          // 접기가 기기 저장소에서 실패한 것도 오류다 — 반영할 게 없던 것과
          // 뭉치면 고장이 「변화 없음」에 섞여 영영 안 보인다.
          logTasteRefresh(
            fold === "folded"
              ? "updated"
              : fold === "local_error"
                ? "error"
                : "no_new_activity",
          );
        },
        () => {
          setLoaded({ kind: "failed" });
          logTasteRefresh("error");
        },
      )
      .finally(() => {
        busyRef.current = false;
        setRefreshing(false);
      });
  }, []);

  const state: TasteCardState =
    signedIn === "out"
      ? { kind: "hidden" }
      : signedIn === "unknown"
        ? { kind: "loading" }
        : loaded;
  return { state, refreshing, refresh };
}
