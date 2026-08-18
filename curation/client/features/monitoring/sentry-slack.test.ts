import { describe, expect, it } from "vitest";

import {
  buildSlackMessage,
  parseSentryAlert,
} from "@/features/monitoring/sentry-slack";

describe("parseSentryAlert", () => {
  it("내부 인테그레이션 페이로드(action/data.event)에서 이슈를 추출한다", () => {
    const payload = {
      action: "triggered",
      data: {
        event: {
          title: "Error: Supabase 환경변수 누락",
          level: "error",
          culprit: "SearchResults",
          web_url: "https://kyo-d1.sentry.io/issues/123/",
          project: 4511788120735744,
        },
        triggered_rule: "New issue",
      },
    };

    const issue = parseSentryAlert(payload);

    expect(issue).not.toBeNull();
    expect(issue?.title).toBe("Error: Supabase 환경변수 누락");
    expect(issue?.level).toBe("error");
    expect(issue?.culprit).toBe("SearchResults");
    expect(issue?.url).toBe("https://kyo-d1.sentry.io/issues/123/");
  });

  it("레거시 웹훅 페이로드(top-level message/url)에서 이슈를 추출한다", () => {
    const payload = {
      project_name: "javascript-nextjs",
      message: "TypeError: undefined is not a function",
      culprit: "app/page.tsx",
      level: "error",
      url: "https://sentry.io/organizations/kyo-d1/issues/456/",
    };

    const issue = parseSentryAlert(payload);

    expect(issue?.title).toBe("TypeError: undefined is not a function");
    expect(issue?.project).toBe("javascript-nextjs");
    expect(issue?.url).toBe("https://sentry.io/organizations/kyo-d1/issues/456/");
  });

  it("제목을 못 찾는 알 수 없는 페이로드는 null을 반환한다", () => {
    expect(parseSentryAlert({ hello: "world" })).toBeNull();
    expect(parseSentryAlert(null)).toBeNull();
    expect(parseSentryAlert("nope")).toBeNull();
  });
});

describe("buildSlackMessage", () => {
  it("폴백 text에 제목과 level을 담는다", () => {
    const msg = buildSlackMessage({
      title: "Boom",
      level: "error",
      project: "javascript-nextjs",
      url: "https://kyo-d1.sentry.io/issues/1/",
    });

    expect(msg.text).toContain("Boom");
    expect(msg.text).toContain("error");
  });

  it("url이 있으면 이슈 링크 버튼을 포함한다", () => {
    const msg = buildSlackMessage({
      title: "Boom",
      url: "https://kyo-d1.sentry.io/issues/1/",
    });

    expect(JSON.stringify(msg.blocks)).toContain("https://kyo-d1.sentry.io/issues/1/");
  });

  it("url이 없으면 링크 버튼을 넣지 않는다", () => {
    const msg = buildSlackMessage({ title: "Boom" });

    expect(JSON.stringify(msg.blocks)).not.toContain("http");
  });

  it("Slack mrkdwn 특수문자(<, >, &)를 이스케이프한다", () => {
    const msg = buildSlackMessage({
      title: "Error <script> & <b>tag</b>",
      culprit: "a & b",
    });
    const json = JSON.stringify(msg);

    expect(json).toContain("&lt;");
    expect(json).toContain("&gt;");
    expect(json).toContain("&amp;");
    expect(json).not.toContain("<script>");
  });

  it("Slack 블록 길이 제한을 넘는 값은 절단한다", () => {
    const long = "x".repeat(5000);
    const msg = buildSlackMessage({ title: long });
    const json = JSON.stringify(msg);

    expect(json).not.toContain(long); // 원본 전체는 포함되지 않음
    expect(json).toContain("…"); // 말줄임 표시
  });
});
