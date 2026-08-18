"use client";

import { useEffect, useState } from "react";

import { useSignedIn } from "@/shared/supabase/use-signed-in";

import { fetchTasteSummary } from "../../data/taste-summary-api";
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
 */
export function useTasteSummary(): TasteCardState {
  const signedIn = useSignedIn();
  const [loaded, setLoaded] = useState<Loaded>({ kind: "loading" });

  useEffect(() => {
    if (signedIn !== "in") return;

    let alive = true;
    void fetchTasteSummary().then(
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

  if (signedIn === "out") return { kind: "hidden" };
  if (signedIn === "unknown") return { kind: "loading" };
  return loaded;
}
