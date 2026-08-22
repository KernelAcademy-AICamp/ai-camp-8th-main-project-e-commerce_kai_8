import { describe, expect, it } from "vitest";

import { resolveGenderOnLogin } from "./gender-resolve";

describe("로그인 시 성별 결정 — 계정이 이긴다", () => {
  it("계정에 값이 있으면 기기·승계값을 무시하고 계정 값을 쓴다", () => {
    expect(
      resolveGenderOnLogin({ account: "여성", carried: "남성", device: "남성" }),
    ).toEqual({ kind: "useAccount", gender: "여성", discardCarried: true });
  });

  it("계정 값이 있고 승계값이 없으면 버릴 것도 없다", () => {
    expect(
      resolveGenderOnLogin({ account: "남성", carried: null, device: "여성" }),
    ).toEqual({ kind: "useAccount", gender: "남성", discardCarried: false });
  });

  it("계정에 값이 없으면 승계값을 올린다", () => {
    // 비회원으로 고르고 방금 로그인한 경우. 승계값이 가장 최신이다.
    expect(
      resolveGenderOnLogin({ account: null, carried: "여성", device: "남성" }),
    ).toEqual({ kind: "claim", gender: "여성", fromCarried: true });
  });

  it("계정·승계값이 없으면 기기 값을 올린다", () => {
    // 이미 로그인한 채로 쓰던 기기에서 계정에만 값이 없는 경우.
    expect(
      resolveGenderOnLogin({ account: null, carried: null, device: "남성" }),
    ).toEqual({ kind: "claim", gender: "남성", fromCarried: false });
  });

  it("아무 데도 값이 없으면 묻는다", () => {
    expect(
      resolveGenderOnLogin({ account: null, carried: null, device: null }),
    ).toEqual({ kind: "ask" });
  });
});
