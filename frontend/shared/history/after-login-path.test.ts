import { describe, expect, it } from "vitest";

import { isReturnablePath, resolveAfterLoginPath } from "./after-login-path";

describe("isReturnablePath", () => {
  it("이 오리진의 경로면 허용한다", () => {
    expect(isReturnablePath("/")).toBe(true);
    expect(isReturnablePath("/wishlist/folder-a")).toBe(true);
  });

  it("로그인 화면 자신으로는 되돌아가지 않는다", () => {
    expect(isReturnablePath("/login")).toBe(false);
    expect(isReturnablePath("/login?next=/settings")).toBe(false);
  });

  it("다른 오리진으로 새는 값은 막는다", () => {
    expect(isReturnablePath("//evil.example.com")).toBe(false);
    expect(isReturnablePath("evil.example.com")).toBe(false);
  });
});

describe("resolveAfterLoginPath", () => {
  it("쿠키가 없으면 손대지 않는다", () => {
    expect(resolveAfterLoginPath(undefined)).toBeNull();
  });

  it("유효한 경로면 그 값을 디코드해 돌려준다", () => {
    expect(resolveAfterLoginPath(encodeURIComponent("/wishlist/folder-a"))).toBe(
      "/wishlist/folder-a",
    );
  });

  it("이미 콜백의 기본 착지점(/my)이면 손대지 않는다", () => {
    expect(resolveAfterLoginPath(encodeURIComponent("/my"))).toBeNull();
  });

  it("되돌아갈 수 없는 값(로그인 화면 등)이면 손대지 않는다", () => {
    expect(resolveAfterLoginPath(encodeURIComponent("/login"))).toBeNull();
  });

  it("깨진 인코딩은 무시한다", () => {
    expect(resolveAfterLoginPath("%")).toBeNull();
  });
});
