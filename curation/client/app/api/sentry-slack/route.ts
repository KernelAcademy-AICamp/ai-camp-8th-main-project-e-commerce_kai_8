// Route Handler — Sentry 알림 웹훅을 받아 Slack으로 중계한다.
// 공개 엔드포인트라 ?token= 공유 시크릿(SENTRY_WEBHOOK_SECRET)으로 보호한다.
// Slack 대상은 서버 전용 env SLACK_WEBHOOK_URL(클라 노출 안 됨).
import {
  buildSlackMessage,
  parseSentryAlert,
} from "@/features/monitoring/sentry-slack";

export const maxDuration = 15;

export async function POST(request: Request): Promise<Response> {
  const secret = process.env.SENTRY_WEBHOOK_SECRET;
  if (!secret) {
    return new Response("SENTRY_WEBHOOK_SECRET 미설정", { status: 500 });
  }

  const token = new URL(request.url).searchParams.get("token");
  if (token !== secret) {
    return new Response("unauthorized", { status: 401 });
  }

  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) {
    return new Response("SLACK_WEBHOOK_URL 미설정", { status: 500 });
  }

  const payload: unknown = await request.json().catch(() => null);
  const issue = parseSentryAlert(payload);
  if (!issue) {
    // 인식 못 한 페이로드는 Sentry 재시도 폭주를 막기 위해 조용히 흘려보낸다(로그만).
    console.warn("[sentry-slack] 인식하지 못한 페이로드 — 건너뜀");
    return new Response(null, { status: 204 });
  }

  // Slack이 응답을 안 주고 매달리는 것을 막는 짧은 타임아웃.
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, 5000);

  let res: Response;
  try {
    res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildSlackMessage(issue)),
      signal: controller.signal,
    });
  } catch {
    return new Response("Slack 전송 실패", { status: 502 });
  } finally {
    clearTimeout(timer);
  }

  const ok = res.ok;
  const status = res.status;
  // 응답 본문을 소비해 undici 커넥션 누수를 막는다(내용은 사용하지 않음).
  await res.text().catch(() => undefined);

  if (!ok) {
    return new Response(`Slack 오류 (${String(status)})`, { status: 502 });
  }

  return new Response(null, { status: 204 });
}
