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
  refreshTasteSummary: () => Promise.resolve(readTasteSummary(summary.current)),
}));

/** 서버가 보내는 모양 그대로 준다 — 화면까지 오는 길을 통째로 지난다. */
function givenServerSends(raw: unknown) {
  summary.current = raw;
}

const FULL = {
  anchor_count: 18,
  matched_count: 16,
  axes: {
    color_vivid: { value: 0.7, measured: 16 },
    graphic: { value: 0.2, measured: 16 },
    price: { value: 0.45, measured: 16 },
    shoulder: { value: 0.8, measured: 7 },
  },
  colors: [{ group: "black", share: 0.34 }],
  brands: [{ name: "커버낫", share: 0.2 }],
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
    // 실측 치수는 카탈로그 45%뿐이라 실루엣이 통째로 빠지는 일이 흔하다.
    // 빈 소제목이 남으면 "잴 수 없었다"가 아니라 "있던 게 사라졌다"로 읽힌다.
    givenServerSends({ ...FULL, axes: { ...FULL.axes, shoulder: undefined } });
    render(<TasteCard />);

    expect(await screen.findByRole("heading", { name: "색·프린트" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "실루엣" })).toBeNull();
  });

  it("몇 개로 잰 값인지 밝힌다", async () => {
    givenServerSends(FULL);
    render(<TasteCard />);

    // 카드 전체의 모수
    expect(await screen.findByText("상품 16개로 쟀어요")).toBeTruthy();
    // 축마다 다른 모수 — 색은 16개로, 어깨는 7개로 쟀다
    expect(screen.getByText("7")).toBeTruthy();
  });

  it("색 칩과 브랜드가 그대로 남는다", async () => {
    givenServerSends(FULL);
    render(<TasteCard />);

    expect(await screen.findByRole("heading", { name: "자주 본 색" })).toBeTruthy();
    expect(screen.getByText("블랙")).toBeTruthy();
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
