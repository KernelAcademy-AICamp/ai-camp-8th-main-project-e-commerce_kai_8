import { describe, expect, it } from "vitest";

import {
  canGoBackInApp,
  nextNavMark,
  readNavMark,
  withNavMark,
} from "@/shared/history/nav-mark";

/** 라우터가 이미 자기 값을 적어 둔 항목 */
const ROUTER_STATE = { __NA: 1, __PRIVATE_NEXTJS_INTERNALS_TREE: ["트리"] };

describe("readNavMark / withNavMark", () => {
  it("표시를 적고 읽는다", () => {
    expect(readNavMark(withNavMark(null, "root"))).toBe("root");
    expect(readNavMark(withNavMark(null, "inner"))).toBe("inner");
  });

  it("라우터가 쓰던 값을 지우지 않는다", () => {
    const next = withNavMark(ROUTER_STATE, "inner");
    expect(next.__NA).toBe(1);
    expect(next.__PRIVATE_NEXTJS_INTERNALS_TREE).toEqual(["트리"]);
    expect(readNavMark(next)).toBe("inner");
  });

  it("표시가 없거나 알 수 없는 값이면 null이다", () => {
    expect(readNavMark(null)).toBeNull();
    expect(readNavMark(ROUTER_STATE)).toBeNull();
    expect(readNavMark("문자열")).toBeNull();
    expect(readNavMark({ aTeeNav: "이상한값" })).toBeNull();
  });
});

describe("nextNavMark", () => {
  it("이 세션에서 처음 보는 자리는 앱의 첫 자리다", () => {
    // 앱을 새로 띄웠거나 주소로 바로 들어왔다. 여기서 뒤로 가면 앱을 떠난다.
    expect(nextNavMark(null, false)).toBe("root");
  });

  it("이미 다른 자리를 본 뒤 생긴 자리는 안쪽이다", () => {
    // 앱 안에서 화면을 옮겨 생긴 자리다. 뒤로 가면 앱 안에 머문다.
    expect(nextNavMark(null, true)).toBe("inner");
  });

  it("이미 표시가 있으면 덮어쓰지 않는다", () => {
    // 새로고침해도 이 표시는 살아남는다. 덮어쓰면 안쪽 자리가 첫 자리로 둔갑해
    // 뒤로가기가 다시 덮어쓰기로 떨어진다 — 그게 원래 결함이었다.
    expect(nextNavMark("root", true)).toBeNull();
    expect(nextNavMark("inner", false)).toBeNull();
  });
});

describe("canGoBackInApp", () => {
  it("안쪽 자리면 뒤로 가도 앱에 머문다", () => {
    expect(canGoBackInApp("inner")).toBe(true);
  });

  it("첫 자리면 뒤로 가면 앱을 떠난다", () => {
    expect(canGoBackInApp("root")).toBe(false);
  });

  it("모르면 뒤로 가지 않는다", () => {
    // 모르는 채로 뒤로 가면 앱 밖으로 튕겨 나갈 수 있다. 안전한 쪽을 고른다.
    expect(canGoBackInApp(null)).toBe(false);
  });
});
