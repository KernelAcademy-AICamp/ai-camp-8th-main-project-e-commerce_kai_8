// @vitest-environment jsdom
//
// 새로고침 결과 판정 (계획 2026-08-25 A-3 후속).
//
// 실측(2026-08-25)에서 연타가 전부 「변화 없음」으로 세어져, 그 지표가 재려던
// "눌렀는데 헛탕" 횟수가 다섯 배로 부풀었다. 도는 중인지만 보면 못 막는다 —
// 접을 것이 없으면 새로고침이 수십 밀리초에 끝나서 다음 클릭 때 이미 풀려 있다.
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readTasteSummary } from "../../domain/taste-summary";
import { TasteCard } from "../components/taste-card";

/** 가짜 시계. 진짜 타이머는 그대로 둬야 findBy*가 돈다 */
let clock = 1_000_000;

const fold = vi.hoisted((): { current: string } => ({ current: "folded" }));
const logs = vi.hoisted((): { refresh: string[] } => ({ refresh: [] }));

vi.mock("@/shared/supabase/use-signed-in", () => ({ useSignedIn: () => "in" }));

vi.mock("@/shared/signals/signals", () => ({
  logTasteView: vi.fn(),
  logTasteRefresh: (outcome: string) => logs.refresh.push(outcome),
}));

vi.mock("@/features/taste/data/taste-summary-api", () => ({
  fetchTasteSummary: () =>
    Promise.resolve(readTasteSummary({ anchor_count: 9, matched_count: 9 })),
  refreshTasteSummary: () =>
    Promise.resolve({
      summary: readTasteSummary({ anchor_count: 9, matched_count: 9 }),
      fold: fold.current,
    }),
}));

async function renderCard() {
  render(<TasteCard />);
  // **뼈대에도 같은 이름의 버튼과 같은 제목이 있다.** 뼈대 쪽은 늘 비활성이라
  // 그걸 잡으면 클릭이 통째로 무시된다. 제목으로 기다려도 뼈대에서 통과하므로,
  // **누를 수 있는 버튼이 생길 때까지** 기다리는 것이 유일하게 확실한 조건이다.
  return waitFor(() => {
    const live = screen
      .getAllByRole("button", { name: /새로고침/ })
      .find((b) => !(b as HTMLButtonElement).disabled);
    if (live === undefined) throw new Error("아직 뼈대다");
    return live;
  });
}

/** 클릭 후 promise 체인이 다 풀릴 때까지 흘린다 */
async function click(button: HTMLElement) {
  await act(async () => {
    button.click();
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  logs.refresh = [];
  fold.current = "folded";
  clock = 1_000_000;
  vi.spyOn(Date, "now").mockImplementation(() => clock);
});

afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
});

describe("새로고침 결과", () => {
  it("접을 행동이 있었으면 새로 반영됨", async () => {
    fold.current = "folded";
    const button = await renderCard();
    await click(button);

    expect(logs.refresh).toEqual(["updated"]);
  });

  it("접을 것이 없었으면 변화 없음", async () => {
    fold.current = "no_changes";
    const button = await renderCard();
    await click(button);

    expect(logs.refresh).toEqual(["no_new_activity"]);
  });

  it("기기 저장소가 막혔으면 실패 — 변화 없음과 뭉치지 않는다", async () => {
    fold.current = "local_error";
    const button = await renderCard();
    await click(button);

    expect(logs.refresh).toEqual(["error"]);
  });
});

describe("연타", () => {
  it("2초 안에 다시 누르면 중복 클릭이다", async () => {
    fold.current = "no_changes";
    const button = await renderCard();

    await click(button);
    clock += 300;
    await click(button);
    clock += 300;
    await click(button);

    expect(logs.refresh).toEqual([
      "no_new_activity",
      "ignored_duplicate",
      "ignored_duplicate",
    ]);
  });

  it("2초가 지나면 다시 정상 시도로 센다", async () => {
    fold.current = "no_changes";
    const button = await renderCard();

    await click(button);
    clock += 2_500;
    await click(button);

    expect(logs.refresh).toEqual(["no_new_activity", "no_new_activity"]);
  });
});
