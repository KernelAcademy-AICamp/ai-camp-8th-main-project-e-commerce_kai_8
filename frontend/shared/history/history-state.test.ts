import { describe, expect, it } from "vitest";

import { readEntryValue, withEntryValue } from "@/shared/history/history-state";

/** 라우터가 이미 자기 값을 적어 둔 항목 */
const ROUTER_STATE = { __NA: 1, __PRIVATE_NEXTJS_INTERNALS_TREE: ["트리"] };

describe("withEntryValue", () => {
  it("라우터가 쓰던 값을 지우지 않는다", () => {
    // 이 값을 덮어쓰면 Next.js 라우터가 자기 자리를 잃어 화면 간 이동이 깨진다.
    const next = withEntryValue(ROUTER_STATE, "화면", "큐레이션");
    expect(next.__NA).toBe(1);
    expect(next.__PRIVATE_NEXTJS_INTERNALS_TREE).toEqual(["트리"]);
    expect(readEntryValue(next, "화면")).toBe("큐레이션");
  });

  it("이미 적힌 다른 키는 그대로 두고 이어 쌓인다", () => {
    // 큐레이션 화면 위에 상품 상세가 겹치면, 그 항목은 둘 다 지녀야 한다.
    const withScreen = withEntryValue(ROUTER_STATE, "화면", "큐레이션");
    const withBoth = withEntryValue(withScreen, "상세", 1);
    expect(readEntryValue(withBoth, "화면")).toBe("큐레이션");
    expect(readEntryValue(withBoth, "상세")).toBe(1);
  });

  it("같은 키는 새 값으로 덮인다", () => {
    const once = withEntryValue(null, "화면", "가");
    expect(readEntryValue(withEntryValue(once, "화면", "나"), "화면")).toBe("나");
  });

  it("상태가 없던 항목에도 얹을 수 있다", () => {
    expect(readEntryValue(withEntryValue(null, "화면", "가"), "화면")).toBe("가");
  });
});

describe("readEntryValue", () => {
  it("없는 키나 알 수 없는 상태면 undefined다", () => {
    expect(readEntryValue(null, "화면")).toBeUndefined();
    expect(readEntryValue(undefined, "화면")).toBeUndefined();
    expect(readEntryValue("문자열", "화면")).toBeUndefined();
    expect(readEntryValue(ROUTER_STATE, "화면")).toBeUndefined();
  });
});
