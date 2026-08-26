import { describe, expect, it } from "vitest";

import { googleProviderId, readAuthNotice, readCallbackParams } from "./auth-session";

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

describe("readAuthNotice — 탈퇴", () => {
  it("탈퇴 완료는 표시가 없다", () => {
    // 탈퇴가 확인되면 홈으로 돌아간다 — 표시할 화면 자체가 없어진다.
    expect(readAuthNotice("deleted")).toBeNull();
  });

  it("지워졌는지 확인하지 못한 경우를 따로 읽는다", () => {
    // "완료"와 절대 섞으면 안 된다 — 지워지지 않았는데 지워진 줄 아는 것이
    // 이 흐름에서 가장 나쁜 결과다.
    expect(readAuthNotice("delete-unverified")).toBe("delete-unverified");
  });

  it("모르는 값은 표시 없음", () => {
    expect(readAuthNotice("deleted-maybe")).toBeNull();
  });
});

describe("googleProviderId", () => {
  it("구글 신원의 제공자 식별자를 고른다", () => {
    expect(googleProviderId([{ provider: "google", id: "sub-1" }])).toBe("sub-1");
  });

  it("여러 제공자가 붙어 있어도 구글만 고른다", () => {
    expect(
      googleProviderId([
        { provider: "github", id: "gh-9" },
        { provider: "google", id: "sub-1" },
      ]),
    ).toBe("sub-1");
  });

  it("구글 신원이 없으면 null", () => {
    expect(googleProviderId([{ provider: "github", id: "gh-9" }])).toBeNull();
  });

  it("목록 자체가 없으면 null — 탈퇴 표식을 남길 수 없다는 뜻이다", () => {
    expect(googleProviderId(null)).toBeNull();
    expect(googleProviderId(undefined)).toBeNull();
    expect(googleProviderId([])).toBeNull();
  });

  it("식별자가 빈 값이면 null — 빈 문자열로 비교하면 남남을 같다고 본다", () => {
    expect(googleProviderId([{ provider: "google", id: "" }])).toBeNull();
  });
});
