"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useSignedIn } from "@/shared/supabase/use-signed-in";

import { refreshTasteSummary } from "../../data/taste-summary-api";
import type { TasteSummary } from "../../domain/taste-summary";

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
 *
 * **열 때마다 접기까지 한다**(`refreshTasteSummary`, 2026-08-26). 그냥 조회만
 * 하면 이번 세션에 방금 본 것이 비활성 30분이 지나야 장기로 접혀, 카드를 열어도
 * 옛 취향이 보인다. 접을 게 없으면 업로드는 건너뛰므로 평소엔 비용이 그대로다.
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

  useEffect(() => {
    if (signedIn !== "in") return;

    let alive = true;
    void refreshTasteSummary().then(
      (summary) => {
        if (alive) setLoaded({ kind: "ready", summary });
      },
      () => {
        if (alive) setLoaded({ kind: "failed" });
      },
    );
    return () => {
      alive = false;
      // 로그인 상태를 떠나면 받아둔 요약을 버린다. 실경로에선 계정 전환이 항상
      // 전체 내비게이션을 거치지만, 남의 취향을 메모리에 들고 있을 이유가 없다.
      setLoaded({ kind: "loading" });
    };
  }, [signedIn]);

  // 도는 중의 재클릭은 무시 — 접기는 한 번이면 충분하고, 겹치면 올리기 순서가 섞인다
  const busyRef = useRef(false);
  const refresh = useCallback(() => {
    if (busyRef.current) return;
    busyRef.current = true;
    setRefreshing(true);
    void refreshTasteSummary()
      .then(
        (summary) => {
          setLoaded({ kind: "ready", summary });
        },
        () => {
          setLoaded({ kind: "failed" });
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
