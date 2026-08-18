import { describe, expect, it } from "vitest";

import { nextPendingForgetList } from "./pending-forget-list";

describe("nextPendingForgetList", () => {
  it("새 기기 ID를 뒤에 붙인다", () => {
    expect(nextPendingForgetList(["a"], "b")).toEqual(["a", "b"]);
  });

  it("이미 있으면 그대로 둔다", () => {
    expect(nextPendingForgetList(["a", "b"], "a")).toEqual(["a", "b"]);
  });

  it("빈 목록에서 시작한다", () => {
    expect(nextPendingForgetList([], "a")).toEqual(["a"]);
  });

  it("오래된 것을 버리지 않는다 — 항목 하나가 못 지킨 삭제 약속 하나다", () => {
    // 예전에는 상한 20을 넘으면 slice(-20)으로 앞쪽을 조용히 버렸다.
    // 버려진 기기 ID의 서버 기록은 **다시는 지울 수 없다** — 그 ID를 아는
    // 유일한 곳이 이 목록이기 때문이다 (설계 §4-1).
    let list: string[] = [];
    for (let i = 0; i < 25; i += 1) list = nextPendingForgetList(list, `device-${i}`);

    expect(list).toHaveLength(25);
    expect(list[0]).toBe("device-0");
    expect(list.at(-1)).toBe("device-24");
  });

  it("들어온 순서를 지킨다 — 오래된 것이 앞", () => {
    const list = ["old"].concat();
    expect(nextPendingForgetList(nextPendingForgetList(list, "mid"), "new")).toEqual([
      "old",
      "mid",
      "new",
    ]);
  });
});
