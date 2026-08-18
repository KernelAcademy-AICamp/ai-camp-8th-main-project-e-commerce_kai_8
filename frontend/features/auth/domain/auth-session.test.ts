import { describe, expect, it } from "vitest";

import { readAuthNotice, readCallbackParams } from "./auth-session";

describe("readCallbackParams", () => {
  it("인가 코드가 있으면 코드를 돌려준다", () => {
    const result = readCallbackParams(new URLSearchParams("code=abc123"));
    expect(result).toEqual({ kind: "code", code: "abc123" });
  });

  it("동의 화면 취소(access_denied)는 실패가 아니라 취소다", () => {
    const result = readCallbackParams(
      new URLSearchParams("error=access_denied&error_description=User+denied"),
    );
    expect(result).toEqual({ kind: "cancelled" });
  });

  it("그 밖의 오류는 실패로 본다 — 취소와 화면이 달라야 한다", () => {
    const result = readCallbackParams(new URLSearchParams("error=server_error"));
    expect(result).toEqual({ kind: "failed" });
  });

  it("코드도 오류도 없으면 실패로 본다", () => {
    expect(readCallbackParams(new URLSearchParams(""))).toEqual({ kind: "failed" });
  });

  it("코드가 빈 문자열이면 실패로 본다", () => {
    expect(readCallbackParams(new URLSearchParams("code="))).toEqual({
      kind: "failed",
    });
  });

  it("오류가 있으면 코드가 함께 와도 오류를 우선한다", () => {
    expect(
      readCallbackParams(new URLSearchParams("error=access_denied&code=abc")),
    ).toEqual({
      kind: "cancelled",
    });
  });
});

describe("readAuthNotice", () => {
  it("failed만 표시로 인정한다", () => {
    expect(readAuthNotice("failed")).toBe("failed");
  });

  it("취소는 표시를 남기지 않는다", () => {
    expect(readAuthNotice("cancelled")).toBeNull();
    expect(readAuthNotice(null)).toBeNull();
    expect(readAuthNotice(undefined)).toBeNull();
  });
});
