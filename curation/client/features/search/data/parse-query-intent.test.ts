import { afterEach, describe, expect, it, vi } from "vitest";

import { parseQueryIntent } from "@/features/search/data/parse-query-intent";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

function llm(content: string) {
  return {
    ok: true,
    json: () => Promise.resolve({ choices: [{ message: { content } }] }),
  };
}

describe("parseQueryIntent", () => {
  it("enum 값·사이즈·정렬을 구조화해 반환한다", async () => {
    vi.stubEnv("NVIDIA_API_KEY", "k");
    const content = JSON.stringify({
      gender: "남성",
      sizeStd: [95],
      priceMax: 40000,
      style: {
        colors: ["블랙"],
        patterns: [],
        materials: ["면"],
        fits: ["오버"],
        keywords: ["빈티지"],
      },
      promote: ["fits"],
      exclude: { colors: [], patterns: [], materials: [], fits: [], keywords: [] },
      sort: "price_asc",
    });
    const r = await parseQueryIntent(
      "블랙 오버핏 면 95 3만원대 빈티지 싼거",
      vi.fn().mockResolvedValue(llm(content)),
    );
    expect(r.degraded).toBe(false);
    expect(r.intent.gender).toBe("남성");
    expect(r.intent.sizeStd).toEqual([95]);
    expect(r.intent.priceMax).toBe(40000);
    expect(r.intent.style.colors).toEqual(["블랙"]);
    expect(r.intent.style.fits).toEqual(["오버"]);
    expect(r.intent.promote).toEqual(["fits"]);
    expect(r.intent.sort).toBe("price_asc");
  });

  it("enum 밖 값은 조용히 제거한다(validate-drop)", async () => {
    vi.stubEnv("NVIDIA_API_KEY", "k");
    const content = JSON.stringify({
      style: {
        colors: ["검정색", "블랙"],
        patterns: ["없는패턴"],
        materials: [],
        fits: [],
        keywords: [],
      },
      sort: "relevance",
    });
    const r = await parseQueryIntent(
      "검정 티",
      vi.fn().mockResolvedValue(llm(content)),
    );
    expect(r.intent.style.colors).toEqual(["블랙"]); // "검정색"은 목록 밖 → 제거
    expect(r.intent.style.patterns).toEqual([]);
  });

  it("이상한 sort·promote·size는 안전 강등한다", async () => {
    vi.stubEnv("NVIDIA_API_KEY", "k");
    const content = JSON.stringify({
      sizeStd: [95, 999, 3.5],
      promote: ["keywords", "colors", "몰라"],
      sort: "무작위",
      style: { colors: ["블랙"], patterns: [], materials: [], fits: [], keywords: [] },
    });
    const r = await parseQueryIntent("x", vi.fn().mockResolvedValue(llm(content)));
    expect(r.intent.sizeStd).toEqual([95]); // 999(범위밖)·3.5(비정수) 제거
    expect(r.intent.promote).toEqual(["colors"]); // keywords·불량키 제거
    expect(r.intent.sort).toBe("relevance"); // 불량 → 기본
  });

  it("빈 쿼리는 EMPTY_INTENT·degraded=false", async () => {
    const r = await parseQueryIntent("   ", vi.fn());
    expect(r.degraded).toBe(false);
    expect(r.intent.sort).toBe("relevance");
    expect(r.intent.style.colors).toEqual([]);
  });

  it("LLM 실패 시 EMPTY_INTENT·degraded=true", async () => {
    vi.stubEnv("NVIDIA_API_KEY", "k");
    const r = await parseQueryIntent(
      "블랙 티",
      vi.fn().mockResolvedValue({ ok: false }),
    );
    expect(r.degraded).toBe(true);
    expect(r.intent.style.colors).toEqual([]);
  });

  it("API 키 없으면 degraded=true", async () => {
    const r = await parseQueryIntent("블랙 티", vi.fn());
    expect(r.degraded).toBe(true);
  });

  it("유효 착용감값은 유지, 목록 밖 값·축은 드롭", async () => {
    vi.stubEnv("NVIDIA_API_KEY", "k");
    const content = JSON.stringify({
      gender: null,
      sizeStd: [],
      priceMin: null,
      priceMax: null,
      style: { colors: [], patterns: [], materials: [], fits: [], keywords: [] },
      promote: [],
      exclude: { colors: [], patterns: [], materials: [], fits: [], keywords: [] },
      wearChars: {
        촉감: ["부드러움", "쫀득함"],
        두께: ["얇음"],
        핏: ["슬림"],
        몸무게: ["70"],
      },
      sort: "relevance",
    });
    const r = await parseQueryIntent(
      "부드부드한 반팔",
      vi.fn().mockResolvedValue(llm(content)),
    );
    expect(r.intent.wearChars.촉감).toEqual(["부드러움"]); // "쫀득함" 드롭
    expect(r.intent.wearChars.두께).toEqual(["얇음"]);
    expect(r.intent.wearChars.비침).toEqual([]); // 미지정 축
    expect(r.intent.wearChars).not.toHaveProperty("핏"); // 핏 축 제외
    expect(r.intent.wearChars).not.toHaveProperty("몸무게"); // 축 밖 키 무시
  });

  it("system prompt에 wear_chars 5축 어휘를 주입한다", async () => {
    vi.stubEnv("NVIDIA_API_KEY", "k");
    const fetchMock = vi.fn().mockResolvedValue(llm("{}"));
    await parseQueryIntent("아무 쿼리", fetchMock);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(init.body as string) as { messages: { content: string }[] };
    const sys = body.messages[0].content;
    expect(sys).toContain("wearChars");
    expect(sys).toContain("부드러움"); // 촉감 어휘 주입
    expect(sys).toContain("약간|부드러움"); // 파이프 값 원문 주입
    expect(sys).not.toContain("wearChars.핏"); // 핏 축은 주입 안 함
  });
});
