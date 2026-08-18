// Sentry 알림 페이로드 → Slack 메시지 변환. 순수 함수(I/O 없음) — route.ts에서 사용하고 테스트한다.

export interface SentryIssue {
  title: string;
  level?: string;
  project?: string;
  culprit?: string;
  url?: string;
}

export interface SlackMessage {
  text: string;
  blocks: unknown[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

// Sentry가 보내는 두 형태를 모두 파싱:
//  - 내부 인테그레이션: { action, data: { event: {...} } }
//  - 레거시 웹훅: top-level { message, culprit, level, url, project_name }
export function parseSentryAlert(payload: unknown): SentryIssue | null {
  const root = asRecord(payload);
  if (!root) return null;

  const data = asRecord(root.data);
  const event = data ? asRecord(data.event) : null;
  const source = event ?? root;

  const title = asString(source.title) ?? asString(source.message);
  if (!title) return null;

  const project =
    asString(source.project_name) ??
    asString(source.project) ??
    (typeof source.project === "number" ? String(source.project) : undefined);

  return {
    title,
    level: asString(source.level),
    project,
    culprit: asString(source.culprit),
    url: asString(source.web_url) ?? asString(source.issue_url) ?? asString(source.url),
  };
}

// Slack mrkdwn 특수문자 이스케이프 + 길이 절단(외부 값이 링크/멘션으로 오해석되거나
// Slack 블록 길이 제한(section 3000·field 2000자)을 넘겨 전송 실패하는 것을 방지).
function slackSafe(value: string, max: number): string {
  const escaped = value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return escaped.length > max ? `${escaped.slice(0, max - 1)}…` : escaped;
}

// SentryIssue → Slack Incoming Webhook 페이로드. url이 있으면 이슈 링크 버튼을 붙인다.
export function buildSlackMessage(issue: SentryIssue): SlackMessage {
  const level = slackSafe(issue.level ?? "error", 100);
  const title = slackSafe(issue.title, 2900);

  const fields: unknown[] = [{ type: "mrkdwn", text: `*Level:*\n${level}` }];
  if (issue.project) {
    fields.push({
      type: "mrkdwn",
      text: `*Project:*\n${slackSafe(issue.project, 1900)}`,
    });
  }
  if (issue.culprit) {
    fields.push({
      type: "mrkdwn",
      text: `*Culprit:*\n${slackSafe(issue.culprit, 1900)}`,
    });
  }

  const blocks: unknown[] = [
    { type: "section", text: { type: "mrkdwn", text: `*🚨 ${title}*` } },
    { type: "section", fields },
  ];

  if (issue.url) {
    blocks.push({
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Sentry에서 보기" },
          url: issue.url,
        },
      ],
    });
  }

  return { text: `🚨 [${level}] ${title}`, blocks };
}
