import { describe, expect, it } from "vitest";

import { buildVersionLabel } from "@/features/settings/domain/app-version";

describe("buildVersionLabel", () => {
  it("프로덕션에서는 꼬리표 없이 버전만 보여준다", () => {
    expect(buildVersionLabel("0.1.12", "production")).toBe("aTee v0.1.12");
  });

  it("프리뷰에서는 환경을 꼬리표로 붙인다", () => {
    expect(buildVersionLabel("0.1.12", "preview")).toBe("aTee v0.1.12 · preview");
  });

  it("환경값이 없으면 로컬로 본다", () => {
    expect(buildVersionLabel("0.1.12", undefined)).toBe("aTee v0.1.12 · local");
    expect(buildVersionLabel("0.1.12", "")).toBe("aTee v0.1.12 · local");
  });

  // Vercel이 환경 이름을 늘려도 표기가 깨지지 않아야 한다 (설계 §3)
  it("모르는 환경 이름도 그대로 꼬리표로 쓴다", () => {
    expect(buildVersionLabel("0.1.12", "staging")).toBe("aTee v0.1.12 · staging");
  });

  // `aTee v` 같은 깨진 문자열을 내보내느니 줄을 안 그린다 (설계 §3)
  it("버전이 없으면 줄을 그리지 않는다", () => {
    expect(buildVersionLabel(undefined, "production")).toBeNull();
    expect(buildVersionLabel("", "production")).toBeNull();
    expect(buildVersionLabel("   ", "preview")).toBeNull();
  });
});
