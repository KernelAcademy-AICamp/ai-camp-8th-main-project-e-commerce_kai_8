import { describe, expect, it } from "vitest";

import manifest from "./manifest";

// Chrome의 설치 판정 조건(2023~): 매니페스트에 이름·192/512 아이콘·standalone·
// start_url이 있으면 된다. 서비스 워커는 더 이상 요구하지 않는다.
describe("웹 앱 매니페스트", () => {
  const m = manifest();

  it("설치 판정에 필요한 필드가 있다", () => {
    expect(m.name).toBe("aTee");
    expect(m.start_url).toBe("/");
    expect(m.display).toBe("standalone");
  });

  it("192와 512 아이콘이 있다", () => {
    const sizes = (m.icons ?? []).map((i) => i.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
  });

  it("마스크 대응 아이콘이 따로 있다", () => {
    // 안드로이드가 모서리를 깎아도 글자가 잘리지 않게 여백을 둔 것.
    // 일반 아이콘에 maskable을 겸하게 하면 깎일 때 글자가 잘린다.
    const maskable = (m.icons ?? []).filter((i) => i.purpose === "maskable");
    expect(maskable.length).toBeGreaterThan(0);
  });

  it("테마·배경색이 앱 배경(#E4E6EB)과 같다", () => {
    // 설치 스플래시 화면이 앱 첫 화면과 이어져 보이게
    expect(m.theme_color).toBe("#E4E6EB");
    expect(m.background_color).toBe("#E4E6EB");
  });
});
