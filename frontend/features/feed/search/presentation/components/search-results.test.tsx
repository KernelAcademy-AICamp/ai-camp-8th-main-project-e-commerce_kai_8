// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SearchResults } from "@/features/feed/search/presentation/components/search-results";

// 그리드는 이미지·관찰자를 쓰므로 여기서는 렌더 여부만 본다
vi.mock("@/features/feed/presentation/components/feed-grid", () => ({
  FeedGrid: ({ columns }: { columns: unknown[][] }) => (
    <div data-testid="grid">{columns.flat().length}</div>
  ),
}));
vi.mock("@/features/feed/presentation/components/feed-skeleton", () => ({
  FeedSkeleton: () => <div data-testid="skeleton" />,
}));

const base = {
  query: "강아지 사료",
  columns: [],
  sentinelRef: { current: null },
  showSkeleton: false,
  isEmpty: false,
  error: false,
  onRetry: vi.fn(),
  onClear: vi.fn(),
  onSelect: vi.fn(),
  replacement: {
    columns: [[{ id: 1 }, { id: 2 }]] as never,
    sentinelRef: { current: null },
    showSkeleton: false,
    onImpress: vi.fn(),
  },
};

// vitest에 globals가 꺼져 있어 자동 정리가 안 된다 — 남은 DOM이 다음 검사에 걸린다
afterEach(cleanup);

describe("SearchResults", () => {
  it("매칭이 0건이면 취향 피드를 대신 보여주고, 검색 결과가 아님을 알린다", () => {
    // 무한 탐색을 표방하는 앱인데 조건이 안 맞으면 빈 화면을 줬다.
    render(<SearchResults {...base} isEmpty />);
    expect(screen.getByText(/검색 결과가 없어요/)).toBeTruthy();
    expect(screen.getByText(/대신 취향에 맞는 티셔츠를 보여드릴게요/)).toBeTruthy();
    expect(screen.getByTestId("grid").textContent).toBe("2");
  });

  it("매칭이 있으면 대체 피드를 섞지 않는다", () => {
    // 섞으면 사용자가 무엇이 답인지 알 수 없다.
    render(
      <SearchResults {...base} columns={[[{ id: 9 }]] as never} isEmpty={false} />,
    );
    expect(screen.queryByText(/대신 취향에 맞는/)).toBeNull();
    expect(screen.getByTestId("grid").textContent).toBe("1");
  });

  it("검색이 오류로 실패하면 대체 피드가 아니라 재시도를 안내한다", () => {
    // 오류는 "결과가 없다"가 아니라 "모른다"이다.
    render(<SearchResults {...base} isEmpty={false} error />);
    expect(screen.getByText(/불러오지 못했어요/)).toBeTruthy();
    expect(screen.queryByText(/대신 취향에 맞는/)).toBeNull();
  });
});
