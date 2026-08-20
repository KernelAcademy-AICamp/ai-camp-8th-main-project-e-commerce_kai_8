// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  backfillAnchorGenders,
  fetchAnchorGenders,
} from "@/features/feed/data/gender-backfill";
import { readLongTerm } from "@/shared/profile/profile-store";
import { restSelect } from "@/shared/supabase-rpc";

vi.mock("@/shared/supabase-rpc", () => ({ restSelect: vi.fn() }));

const restSelectMock = vi.mocked(restSelect);

const LONG_KEY = "atee-profile";

beforeEach(() => {
  localStorage.clear();
  restSelectMock.mockReset();
});

describe("fetchAnchorGenders", () => {
  it("goods_no 목록을 in-list로 c_feed_products에 조회한다", async () => {
    restSelectMock.mockResolvedValue([]);
    await fetchAnchorGenders([1, 2, 3]);
    expect(restSelectMock).toHaveBeenCalledWith(
      "c_feed_products?select=goods_no,gender&goods_no=in.(1,2,3)",
    );
  });

  it("빈 목록이면 조회하지 않는다", async () => {
    const result = await fetchAnchorGenders([]);
    expect(result.size).toBe(0);
    expect(restSelectMock).not.toHaveBeenCalled();
  });

  it("응답의 성별을 goods_no별 맵으로 바꾼다 — 빈 문자열·null은 미상으로 뺀다", async () => {
    restSelectMock.mockResolvedValue([
      { goods_no: 1, gender: "남성" },
      { goods_no: 2, gender: "" },
      { goods_no: 3, gender: null },
      { goods_no: 4, gender: "공용" },
    ]);
    const result = await fetchAnchorGenders([1, 2, 3, 4]);
    expect(result.get(1)).toBe("남성");
    expect(result.has(2)).toBe(false);
    expect(result.has(3)).toBe(false);
    expect(result.get(4)).toBe("공용");
  });
});

describe("backfillAnchorGenders — 기존 장기 앵커 성별 1회 보강(3단계)", () => {
  it("성별 없는 앵커만 조회 대상이 된다", async () => {
    localStorage.setItem(
      LONG_KEY,
      JSON.stringify({
        schemaVersion: 2,
        anchors: [
          { goodsNo: 1, weight: 1, lastMs: 10, gender: "남성" },
          { goodsNo: 2, weight: 1, lastMs: 10 },
        ],
        updatedAtMs: 10,
      }),
    );
    restSelectMock.mockResolvedValue([]);

    await backfillAnchorGenders();

    expect(restSelectMock).toHaveBeenCalledWith(
      expect.stringContaining("goods_no=in.(2)"),
    );
  });

  it("보강 대상이 없으면 조회 자체를 하지 않는다", async () => {
    localStorage.setItem(
      LONG_KEY,
      JSON.stringify({
        schemaVersion: 2,
        anchors: [{ goodsNo: 1, weight: 1, lastMs: 10, gender: "남성" }],
        updatedAtMs: 10,
      }),
    );

    await backfillAnchorGenders();

    expect(restSelectMock).not.toHaveBeenCalled();
  });

  it("응답이 장기 프로필에 반영된다", async () => {
    localStorage.setItem(
      LONG_KEY,
      JSON.stringify({
        schemaVersion: 2,
        anchors: [{ goodsNo: 2, weight: 1, lastMs: 10 }],
        updatedAtMs: 10,
      }),
    );
    restSelectMock.mockResolvedValue([{ goods_no: 2, gender: "여성" }]);

    await backfillAnchorGenders();

    expect(readLongTerm().anchors.find((a) => a.goodsNo === 2)?.gender).toBe("여성");
  });

  it("조회가 실패해도 예외가 새지 않는다 — 다음 세션에 재시도되는 셈", async () => {
    localStorage.setItem(
      LONG_KEY,
      JSON.stringify({
        schemaVersion: 2,
        anchors: [{ goodsNo: 2, weight: 1, lastMs: 10 }],
        updatedAtMs: 10,
      }),
    );
    restSelectMock.mockRejectedValue(new Error("네트워크 오류"));

    await expect(backfillAnchorGenders()).resolves.toBeUndefined();
  });
});
