import { describe, expect, it } from "vitest";

import { wishlistNoticeMessage } from "./wishlist-notice";

describe("wishlistNoticeMessage", () => {
  it("알릴 것이 없으면 null", () => {
    expect(wishlistNoticeMessage(null)).toBeNull();
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
