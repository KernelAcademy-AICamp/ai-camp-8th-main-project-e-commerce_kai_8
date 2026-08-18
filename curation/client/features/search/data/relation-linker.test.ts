// linkRelations 데이터 계층 테스트 — 실제 네트워크 호출 금지, fetchFn을 항상 mock 주입한다.
import { describe, expect, it, vi } from "vitest";

import { buildQueryFrame } from "../domain/query-frame";
import { linkRelations } from "./relation-linker";

const frame = () => buildQueryFrame("검은색이나 하얀색 무늬가 있는 빨간색 티셔츠");
const okResponse = (obj: unknown) =>
  ({
    ok: true,
    json: () =>
      Promise.resolve({ choices: [{ message: { content: JSON.stringify(obj) } }] }),
  }) as never;

describe("linkRelations", () => {
  it("LLM JSON을 파싱해 AtomicProposal 반환", async () => {
    process.env.NVIDIA_API_KEY = "k";
    const proposal = {
      assignments: [
        { mentionRef: "m01", target: "print" },
        { mentionRef: "m02", target: "print" },
        { mentionRef: "m03", target: "base" },
      ],
      orGroups: [{ memberRefs: ["m01", "m02"], operatorRef: "o01" }],
    };
    const fetchMock = vi.fn().mockResolvedValue(okResponse(proposal));
    const r = await linkRelations(frame(), fetchMock as typeof fetch);
    expect(r.status).toBe("parsed");
    expect(r.proposal?.assignments).toHaveLength(3);
    expect(r.proposal?.orGroups[0].operatorRef).toBe("o01");
  });

  it("비ok 응답은 http_error(null 아님)", async () => {
    process.env.NVIDIA_API_KEY = "k";
    const fetchMock = vi.fn().mockResolvedValue({ ok: false });
    expect((await linkRelations(frame(), fetchMock as typeof fetch)).status).toBe(
      "http_error",
    );
  });

  it("content 비면 empty_content", async () => {
    process.env.NVIDIA_API_KEY = "k";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ choices: [{ message: { content: "" } }] }),
    });
    expect((await linkRelations(frame(), fetchMock as typeof fetch)).status).toBe(
      "empty_content",
    );
  });

  it("JSON 없는 content는 json_error + rawText 보존", async () => {
    process.env.NVIDIA_API_KEY = "k";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({ choices: [{ message: { content: "그냥 텍스트" } }] }),
    });
    const r = await linkRelations(frame(), fetchMock as typeof fetch);
    expect(r.status).toBe("json_error");
    expect(r.rawText).toBe("그냥 텍스트");
  });

  it("JSON은 되나 스키마 위반은 schema_error + rawJson 보존", async () => {
    process.env.NVIDIA_API_KEY = "k";
    // 잘못된 target → parseAtomicProposal이 통째 거부
    const bad = { assignments: [{ mentionRef: "m01", target: "몸통" }] };
    const fetchMock = vi.fn().mockResolvedValue(okResponse(bad));
    const r = await linkRelations(frame(), fetchMock as typeof fetch);
    expect(r.status).toBe("schema_error");
    expect(r.rawJson).not.toBeUndefined();
    expect(r.proposal).toBeUndefined();
  });

  it("API 키 없으면 fetch 호출 없이 no_key", async () => {
    delete process.env.NVIDIA_API_KEY;
    const fetchMock = vi.fn();
    expect((await linkRelations(frame(), fetchMock as typeof fetch)).status).toBe(
      "no_key",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("mention이 없으면 fetch 호출 없이 no_mentions", async () => {
    process.env.NVIDIA_API_KEY = "k";
    const fetchMock = vi.fn();
    const emptyFrame = buildQueryFrame("아무 색도 없는 문장");
    expect((await linkRelations(emptyFrame, fetchMock as typeof fetch)).status).toBe(
      "no_mentions",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
