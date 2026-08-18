import { describe, expect, it } from "vitest";

import { overflowState, wheelToHorizontal } from "./thumb-scroll";

describe("overflowState — 썸네일 스트립 오버플로 경계", () => {
  it("내용이 넘치지 않으면 overflowing=false, 양끝 true", () => {
    expect(
      overflowState({ scrollLeft: 0, scrollWidth: 400, clientWidth: 456 }),
    ).toEqual({
      overflowing: false,
      atStart: true,
      atEnd: true,
    });
  });

  it("넘치고 맨 앞이면 atStart=true, atEnd=false", () => {
    expect(
      overflowState({ scrollLeft: 0, scrollWidth: 821, clientWidth: 456 }),
    ).toEqual({
      overflowing: true,
      atStart: true,
      atEnd: false,
    });
  });

  it("넘치고 중간이면 양끝 false", () => {
    expect(
      overflowState({ scrollLeft: 200, scrollWidth: 821, clientWidth: 456 }),
    ).toEqual({
      overflowing: true,
      atStart: false,
      atEnd: false,
    });
  });

  it("넘치고 맨 끝이면 atEnd=true", () => {
    const r = overflowState({ scrollLeft: 365, scrollWidth: 821, clientWidth: 456 });
    expect(r.overflowing).toBe(true);
    expect(r.atEnd).toBe(true);
  });
});

describe("wheelToHorizontal — 세로 휠→가로 변환 판단", () => {
  it("세로 휠(deltaY 우세)은 deltaY를 가로 스크롤로 반환", () => {
    expect(wheelToHorizontal(0, 120)).toBe(120);
    expect(wheelToHorizontal(5, -90)).toBe(-90);
  });

  it("가로 제스처(deltaX 우세)는 0 — 브라우저 기본에 맡김", () => {
    expect(wheelToHorizontal(120, 10)).toBe(0);
  });

  it("델타가 같으면 개입하지 않음(0)", () => {
    expect(wheelToHorizontal(50, 50)).toBe(0);
  });
});
