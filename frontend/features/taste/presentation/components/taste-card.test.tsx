// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { readTasteSummary } from "../../domain/taste-summary";
import { TasteCard } from "./taste-card";

const summary = vi.hoisted((): { current: unknown } => ({ current: null }));

vi.mock("@/shared/supabase/use-signed-in", () => ({
  useSignedIn: () => "in",
}));

vi.mock("@/features/taste/data/taste-summary-api", () => ({
  fetchTasteSummary: () => Promise.resolve(readTasteSummary(summary.current)),
  // 반환 형태가 { summary, fold }다 — 계측이 접기 결과로 결과값을 가른다
  refreshTasteSummary: () =>
    Promise.resolve({
      summary: readTasteSummary(summary.current),
      fold: "no_changes",
    }),
}));

/** 서버가 보내는 모양 그대로 준다 — 화면까지 오는 길을 통째로 지난다. */
function givenServerSends(raw: unknown) {
  summary.current = raw;
}

/**
 * 실측 치수 축 넷은 커버리지가 정확히 같아(45.3%) 늘 함께 있거나 함께 없다.
 * 그래서 `measured`도 넷이 같은 값이다.
 */
const FULL = {
  anchor_count: 18,
  matched_count: 16,
  axes: {
    cohesion: { value: 0.3, measured: 20 },
    color_vivid: { value: 0.7, measured: 16 },
    graphic: { value: 0.2, measured: 16 },
    price: { value: 0.45, measured: 16 },
    shoulder: { value: 0.8, measured: 7 },
    length: { value: 0.35, measured: 7 },
    chest: { value: 0.78, measured: 7 },
    sleeve: { value: 0.4, measured: 7 },
  },
  colors: [{ group: "black", share: 0.34 }],
  brands: [{ name: "커버낫", share: 0.2 }],
};

const WITHOUT_FIT_MEASURES = {
  ...FULL,
  axes: {
    color_vivid: FULL.axes.color_vivid,
    graphic: FULL.axes.graphic,
    price: FULL.axes.price,
  },
};

/** 앵커 20개를 못 채우면 서버가 응집도를 아예 안 보낸다. */
const WITHOUT_COHESION = {
  ...FULL,
  axes: { ...FULL.axes, cohesion: undefined },
};

afterEach(cleanup);

describe("내 취향 카드", () => {
  it("축을 묶음 소제목 아래에 그린다", async () => {
    givenServerSends(FULL);
    render(<TasteCard />);

    const silhouette = await screen.findByRole("heading", { name: "실루엣" });
    // 소제목만 있고 그 아래가 비면 아무 뜻이 없다 — 묶음 안에 막대가 있어야 한다
    const group = silhouette.parentElement;
    if (!group) throw new Error("묶음 소제목에 부모가 없다");
    expect(within(group).getByRole("img", { name: /좁은 어깨/ })).toBeTruthy();

    expect(screen.getByRole("heading", { name: "색·프린트" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "값" })).toBeTruthy();
  });

  it("잴 수 없었던 묶음은 소제목째 사라진다", async () => {
    // 실측 치수는 카탈로그 45.3%뿐이고 넷이 늘 함께 빠진다. 실제로 앵커 4개짜리
    // 계정에서 실루엣 축 넷이 전부 없는 응답을 확인했다(2026-08-20).
    // 빈 소제목이 남으면 "잴 수 없었다"가 아니라 "있던 게 사라졌다"로 읽힌다.
    givenServerSends(WITHOUT_FIT_MEASURES);
    render(<TasteCard />);

    expect(await screen.findByRole("heading", { name: "색·프린트" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "실루엣" })).toBeNull();
  });

  it("실루엣 축 넷을 한 묶음에 그린다", async () => {
    givenServerSends(FULL);
    render(<TasteCard />);

    const silhouette = await screen.findByRole("heading", { name: "실루엣" });
    const group = silhouette.parentElement;
    if (!group) throw new Error("묶음 소제목에 부모가 없다");

    expect(within(group).getAllByRole("img")).toHaveLength(4);
    for (const name of [/좁은 어깨/, /크롭/, /슬림/, /짧은 소매/]) {
      expect(within(group).getByRole("img", { name })).toBeTruthy();
    }
  });

  it("몇 개로 잰 값인지 밝힌다", async () => {
    givenServerSends(FULL);
    render(<TasteCard />);

    // 카드 전체의 모수는 눈에 보인다
    expect(await screen.findByText("상품 16개로 쟀어요")).toBeTruthy();

    // 축별 모수는 숫자로 적지 않기로 했다(2026-08-20 화면 확인 — 숫자가 라벨과
    // 한 덩어리로 읽혀 막대를 방해했다). 대신 막대 설명에는 남아 있어야 한다.
    expect(screen.getByRole("img", { name: /좁은 어깨.*상품 7개로 잼/ })).toBeTruthy();
    expect(screen.getByRole("img", { name: /무채색.*상품 16개로 잼/ })).toBeTruthy();
  });

  it("응집도는 소제목 없이 맨 위에 홀로 그린다", async () => {
    givenServerSends(FULL);
    render(<TasteCard />);

    const lead = await screen.findByRole("img", { name: /두루에서 확고 사이/ });
    // 어느 묶음 안에도 있으면 안 된다 — 성질이 다른 값이라 따로 그린다
    for (const title of ["색·프린트", "값", "실루엣"]) {
      const group = screen.getByRole("heading", { name: title }).parentElement;
      if (!group) throw new Error("묶음 소제목에 부모가 없다");
      expect(group.contains(lead)).toBe(false);
    }
  });

  it("앵커가 모자라면 응집도 줄이 아예 없다", async () => {
    // 앵커가 적으면 우연히 확고해 보인다. 서버가 20개 미만이면 안 보낸다.
    givenServerSends(WITHOUT_COHESION);
    render(<TasteCard />);

    expect(await screen.findByRole("heading", { name: "색·프린트" })).toBeTruthy();
    expect(screen.queryByRole("img", { name: /두루에서 확고 사이/ })).toBeNull();
  });

  /*
   * 시안은 색 이름을 글씨로 적지 않는다 — 동그란 색 아래에 비율만 둔다.
   * 이름은 보조기기용 설명으로만 남으므로 글씨가 아니라 그 이름으로 찾는다.
   */
  it("색과 브랜드가 그대로 남는다", async () => {
    givenServerSends(FULL);
    render(<TasteCard />);

    expect(await screen.findByRole("heading", { name: "자주 본 색" })).toBeTruthy();
    expect(screen.getByLabelText("블랙")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "자주 본 브랜드" })).toBeTruthy();
    expect(screen.getByText("커버낫")).toBeTruthy();
  });

  it("아직 잰 것이 없으면 경향을 지어내지 않는다", async () => {
    givenServerSends({ anchor_count: 2, matched_count: 0 });
    render(<TasteCard />);

    expect(await screen.findByText(/아직 모으는 중이에요/)).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "색·프린트" })).toBeNull();
  });
});
