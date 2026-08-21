// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearGenderSetting,
  GENDER_SETTING_KEY,
  getGenderServerSnapshot,
  getGenderSnapshot,
  isGenderChoice,
  readStoredGender,
  setGenderSetting,
  subscribeGender,
} from "./gender-setting";

beforeEach(() => {
  localStorage.clear();
  clearGenderSetting();
});

describe("허용값", () => {
  it("'남성'과 '여성'만 성별 선택으로 인정한다", () => {
    expect(isGenderChoice("남성")).toBe(true);
    expect(isGenderChoice("여성")).toBe(true);
  });

  it("공용·미상·빈 문자열·널은 선택이 아니다", () => {
    // 서버가 등식으로 거르므로 '공용'은 고를 수 있는 값이 아니다.
    expect(isGenderChoice("공용")).toBe(false);
    expect(isGenderChoice("")).toBe(false);
    expect(isGenderChoice(null)).toBe(false);
    expect(isGenderChoice("male")).toBe(false);
  });
});

describe("저장과 읽기", () => {
  it("고른 값을 저장하고 다시 읽는다", () => {
    setGenderSetting("여성");
    expect(getGenderSnapshot()).toBe("여성");
    expect(readStoredGender()).toBe("여성");
  });

  it("저장한 값은 저장소에 남아 다음 읽기에서 살아난다", () => {
    setGenderSetting("남성");
    clearGenderSetting(); // 메모리 캐시만 비운다
    expect(readStoredGender()).toBe("남성");
  });

  it("저장소에 이상한 값이 들어 있으면 미확정으로 본다", () => {
    // 손으로 고쳤거나 옛 버전이 남긴 값. 그대로 믿고 서버에 보내면 거부당한다.
    localStorage.setItem(GENDER_SETTING_KEY, "공용");
    expect(readStoredGender()).toBeNull();
  });

  it("저장소를 못 읽어도 던지지 않고 미확정을 돌려준다", () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("접근 불가");
    });
    expect(readStoredGender()).toBeNull();
    spy.mockRestore();
  });
});

describe("구독", () => {
  it("값이 바뀌면 구독자에게 알린다", () => {
    const seen: (string | null)[] = [];
    const stop = subscribeGender(() => {
      seen.push(getGenderSnapshot());
    });
    setGenderSetting("남성");
    setGenderSetting("여성");
    stop();
    setGenderSetting("남성");
    expect(seen).toEqual(["남성", "여성"]);
  });

  it("같은 값을 다시 저장하면 알리지 않는다", () => {
    setGenderSetting("남성");
    const listener = vi.fn();
    const stop = subscribeGender(listener);
    setGenderSetting("남성");
    stop();
    expect(listener).not.toHaveBeenCalled();
  });
});

describe("서버 렌더", () => {
  it("서버 스냅숏은 항상 미확정이다", () => {
    // 서버는 이 기기의 저장소를 모른다. 확정으로 그리면 하이드레이션이 어긋나고,
    // 무엇보다 고르기 전에 피드 요청이 나가버린다.
    setGenderSetting("여성");
    expect(getGenderServerSnapshot()).toBeNull();
  });
});
