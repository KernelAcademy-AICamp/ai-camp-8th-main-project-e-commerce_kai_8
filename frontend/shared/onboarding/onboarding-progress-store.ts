// 온보딩이 **어디까지 갔는지**를 이 탭에 적어 둔다.
//
// 왜 필요한가: 3단계의 동의 문구에서 처리방침을 열면 온보딩이 통째로 언마운트된다.
// 화면 위치는 React 상태라 그때 사라지고, 돌아오면 **1단계부터 다시** 시작했다
// (고른 옷은 기기에 남아 있는데도). 새 창으로 열어 피하려 했더니 그 창에는 기록이
// 없어 닫기가 갈 곳을 잃었다 — 그래서 같은 탭에 쌓고 위치를 기억한다.
//
// **sessionStorage에 둔다.** 이 탭의 이번 방문에만 유효한 값이다. localStorage에
// 두면 며칠 뒤 다시 온 사람이 중간 화면에서 시작한다.
//
// **신원 종속이다.** `atee-` 접두어라 신원 전환 정리에서 지워진다 — 앞사람이 어디까지
// 갔는지가 다음 사람에게 남으면 안 된다(O-35).

import type { GenderChoice } from "@/shared/gender/gender-setting";

const KEY = "atee-onboarding-step";

/** 온보딩 안의 화면. 게이트가 "온보딩을 보여줄까"를 정하고, 이것이 "어느 화면"이다. */
export type FlowScreen = "gender" | "picks" | "signup";

export interface FlowProgress {
  screen: FlowScreen;
  gender: GenderChoice | null;
  /** 고른 상품 번호 (고른 순서대로) */
  selected: number[];
}

const EMPTY: FlowProgress = { screen: "gender", gender: null, selected: [] };

function isScreen(value: unknown): value is FlowScreen {
  return value === "gender" || value === "picks" || value === "signup";
}

/** 저장된 값을 읽는다. 형태가 어긋나면 처음부터 시작한다 — 반쯤 맞은 상태로 열지 않는다. */
export function readFlowProgress(): FlowProgress {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw === null) return EMPTY;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return EMPTY;
    const { screen, gender, selected } = parsed as Record<string, unknown>;
    if (!isScreen(screen)) return EMPTY;
    if (gender !== "남성" && gender !== "여성" && gender !== null) return EMPTY;
    if (!Array.isArray(selected)) return EMPTY;
    const numbers = selected.filter(
      (x): x is number => typeof x === "number" && Number.isInteger(x) && x > 0,
    );
    // 성별 없이 옷 화면에 있을 수는 없다 — 그런 값이면 처음부터.
    if (screen !== "gender" && gender === null) return EMPTY;
    return { screen, gender, selected: numbers };
  } catch {
    return EMPTY;
  }
}

export function writeFlowProgress(progress: FlowProgress): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(progress));
  } catch {
    // 저장 못 하면 예전처럼 처음부터 시작한다 — 화면이 깨지지는 않는다.
  }
}

/** 온보딩을 마쳤을 때 지운다. 남겨 두면 다음 방문이 중간 화면에서 열린다. */
export function clearFlowProgress(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // 못 지워도 다음 탭에서는 없다(sessionStorage는 탭 단위다)
  }
}
