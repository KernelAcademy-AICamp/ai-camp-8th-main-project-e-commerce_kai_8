import { describe, expect, it } from "vitest";

import {
  looksLikeMistypedHangul,
  qwertyToHangul,
  restoreHangulTyping,
} from "@/features/feed/search/domain/hangul-keyboard";

describe("qwertyToHangul", () => {
  it.each([
    ["skdlzl", "나이키"],
    ["wprtlalrtm", "젝시믹스"],
    ["xmflqtus", "트립션"],
    ["dkelektm", "아디다스"],
    ["zjqjskt", "커버낫"],
    ["qksvkf", "반팔"],
    ["dhqjvlt", "오버핏"],
  ])("%s → %s", (keys, hangul) => {
    expect(qwertyToHangul(keys)).toBe(hangul);
  });

  it("공백은 유지한다", () => {
    expect(qwertyToHangul("qksvkf xl")).toBe("반팔 티");
  });

  it("겹받침을 앞서 합치지 않는다 — 다음이 모음이면 새 음절의 초성이다", () => {
    // ㄱ+ㅅ을 ㄳ으로 합쳐 버리면 젝시믹스가 '제ㄳㅣ미ㄳㅡ'가 된다
    expect(qwertyToHangul("wprtlalrtm")).toBe("젝시믹스");
    expect(qwertyToHangul("xmflqtus")).toBe("트립션");
  });
});

describe("looksLikeMistypedHangul", () => {
  it("이미 한글이 있으면 대상이 아니다", () => {
    expect(looksLikeMistypedHangul("나이키 반팔")).toBe(false);
  });

  it("자판에 없는 글자가 섞이면 대상이 아니다", () => {
    expect(looksLikeMistypedHangul("MLB")).toBe(false);
  });

  it("영어 단어도 자판 글자로만 이뤄지면 대상으로 잡힌다 — 그래서 폴백으로만 쓴다", () => {
    // nike는 전부 두벌식 자판 글자라 여기서는 구분되지 않는다.
    // 바로 치환하지 않고 원문이 0건일 때만 쓰는 이유다.
    expect(looksLikeMistypedHangul("nike")).toBe(true);
  });

  it("한 글자는 대상이 아니다", () => {
    expect(looksLikeMistypedHangul("r")).toBe(false);
  });
});

describe("restoreHangulTyping", () => {
  it("자판 오타는 되돌린다", () => {
    expect(restoreHangulTyping("skdlzl")).toBe("나이키");
  });

  it("대상이 아니면 null — 호출자가 폴백을 건너뛴다", () => {
    expect(restoreHangulTyping("나이키")).toBeNull();
    expect(restoreHangulTyping("MLB")).toBeNull();
  });

  it("한글이 안 만들어지면 null", () => {
    expect(restoreHangulTyping("rrrr")).toBeNull();
  });
});
