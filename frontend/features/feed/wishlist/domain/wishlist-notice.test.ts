import { describe, expect, it } from "vitest";

import { wishlistNoticeMessage } from "./wishlist-notice";

describe("wishlistNoticeMessage", () => {
  it("알릴 것이 없으면 null", () => {
    expect(wishlistNoticeMessage(null)).toBeNull();
  });

  it("로그인이 필요하다는 것을 따로 알리고, 기기 찜이 올라온다는 사실을 함께 알린다", () => {
    // 이 안내가 없으면 사용자는 지금 기기에 있는 찜이 사라졌다고 본다.
    const login = wishlistNoticeMessage("login");
    expect(login).toContain("로그인");
    expect(login).toContain("올라");
  });

  it("상한에 걸린 것과 저장 실패를 다르게 알린다", () => {
    // 같은 문구를 쓰면 사용자가 다시 눌러도 되는지 알 수 없다.
    const full = wishlistNoticeMessage("full");
    const failed = wishlistNoticeMessage("failed");
    expect(full).not.toBe(failed);
    expect(full).toContain("500");
    expect(failed).toContain("다시");
  });
});
