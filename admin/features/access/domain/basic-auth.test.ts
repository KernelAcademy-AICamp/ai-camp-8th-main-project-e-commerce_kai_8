import { describe, expect, it } from "vitest";

import { type BasicCredentials, isAuthorized, parseBasicAuth } from "./basic-auth";

function header(user: string, password: string): string {
  return `Basic ${btoa(`${user}:${password}`)}`;
}

const expected: BasicCredentials = { user: "admin", password: "s3cret-value" };

describe("parseBasicAuth", () => {
  it("사용자명과 비밀번호를 푼다", () => {
    expect(parseBasicAuth(header("admin", "pw"))).toEqual({
      user: "admin",
      password: "pw",
    });
  });

  it("비밀번호에 콜론이 있어도 첫 콜론에서만 자른다", () => {
    expect(parseBasicAuth(header("admin", "a:b:c"))).toEqual({
      user: "admin",
      password: "a:b:c",
    });
  });

  it("헤더가 없으면 null", () => {
    expect(parseBasicAuth(null)).toBeNull();
  });

  it("Basic이 아닌 방식은 null", () => {
    expect(parseBasicAuth("Bearer abcdef")).toBeNull();
  });

  it("base64가 아니면 null", () => {
    expect(parseBasicAuth("Basic 이건base64가아님!!")).toBeNull();
  });

  it("콜론이 없으면 null", () => {
    expect(parseBasicAuth(`Basic ${btoa("nocolon")}`)).toBeNull();
  });

  it("공백 없이 Basic만 와도 터지지 않는다", () => {
    // 배열 분해로 짰다면 여기서 undefined를 만졌을 자리
    expect(parseBasicAuth("Basic")).toBeNull();
    expect(parseBasicAuth("Basic ")).toBeNull();
  });
});

describe("isAuthorized", () => {
  it("사용자명과 비밀번호가 모두 맞으면 통과", () => {
    expect(isAuthorized(header("admin", "s3cret-value"), expected)).toBe(true);
  });

  it("비밀번호가 틀리면 거절", () => {
    expect(isAuthorized(header("admin", "s3cret-valuf"), expected)).toBe(false);
  });

  it("사용자명이 틀리면 거절 — 비밀번호가 맞아도", () => {
    expect(isAuthorized(header("root", "s3cret-value"), expected)).toBe(false);
  });

  it("헤더가 없으면 거절", () => {
    expect(isAuthorized(null, expected)).toBe(false);
  });

  it("비밀번호 앞부분만 맞아도 거절", () => {
    expect(isAuthorized(header("admin", "s3cret"), expected)).toBe(false);
  });

  it("기대 비밀번호가 비어 있으면 무엇을 줘도 거절 (fail closed)", () => {
    // 환경변수를 빠뜨린 채 배포했을 때 문이 열리면 아무도 모르게 데이터가 공개된다
    const missing: BasicCredentials = { user: "admin", password: "" };
    expect(isAuthorized(header("admin", ""), missing)).toBe(false);
    expect(isAuthorized(header("admin", "anything"), missing)).toBe(false);
    expect(isAuthorized(null, missing)).toBe(false);
  });
});
