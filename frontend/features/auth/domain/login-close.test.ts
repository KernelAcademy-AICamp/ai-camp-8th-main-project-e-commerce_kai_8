import { describe, expect, it } from "vitest";

import { closeTarget, loginCloseTarget } from "./login-close";

const ORIGIN = "https://atee.example";

describe("closeTarget", () => {
  it("자기 화면 경로를 받아 어느 화면에서든 쓸 수 있다", () => {
    // 마이페이지의 뒤로가기 — 새로고침으로 참조 주소가 자기 자신이면 피드로
    expect(closeTarget(`${ORIGIN}/my`, ORIGIN, "/my")).toBe("feed");
    expect(closeTarget(`${ORIGIN}/wishlist`, ORIGIN, "/my")).toBe("back");
    expect(closeTarget("", ORIGIN, "/my")).toBe("feed");
    expect(closeTarget("https://google.com/", ORIGIN, "/my")).toBe("feed");
  });
});

describe("loginCloseTarget", () => {
  it("이 앱에서 왔으면 뒤로 간다", () => {
    // 상세 화면에서 하트를 눌러 온 경우다. 그 자리로 돌아가야 한다.
    expect(loginCloseTarget(`${ORIGIN}/`, ORIGIN)).toBe("back");
    expect(loginCloseTarget(`${ORIGIN}/wishlist`, ORIGIN)).toBe("back");
  });

  it("참조 주소가 없으면 피드로 간다", () => {
    // 주소로 바로 들어온 경우. 뒤로 가면 이 앱을 떠난다.
    expect(loginCloseTarget("", ORIGIN)).toBe("feed");
  });

  it("다른 사이트에서 왔으면 피드로 간다", () => {
    expect(loginCloseTarget("https://google.com/search", ORIGIN)).toBe("feed");
  });

  it("출처가 비슷하게 시작하는 다른 주소에 속지 않는다", () => {
    // https://atee.example.evil.com 은 우리 출처가 아니다.
    expect(loginCloseTarget(`${ORIGIN}.evil.com/`, ORIGIN)).toBe("feed");
  });

  it("로그인 화면 자신에서 왔으면 피드로 간다", () => {
    // 새로고침하면 참조 주소가 자기 자신이 된다. 뒤로 가면 다시 여기다.
    expect(loginCloseTarget(`${ORIGIN}/login`, ORIGIN)).toBe("feed");
  });
});
