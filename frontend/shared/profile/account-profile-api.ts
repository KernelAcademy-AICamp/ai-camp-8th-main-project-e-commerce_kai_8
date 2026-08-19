// 계정 취향 프로필 — 서버 호출. 로그인한 사용자만 쓸 수 있다.
//
// 익명 통로(`shared/supabase-rpc.ts`)를 쓰지 않는다. 계정 데이터는 인증 통로로만
// 나간다(구글 로그인 설계 §2 transport 경계).

import { authedRpc } from "@/shared/supabase/authed-rpc";

import { type Anchor, emptyLongTerm, type LongTermProfile } from "./profile-rules";

interface TasteRowDto {
  schema_version: number;
  anchors: unknown;
  updated_at: string;
}

function toAnchors(raw: unknown): Anchor[] {
  if (!Array.isArray(raw)) return [];
  const anchors: Anchor[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const { goodsNo, weight, lastMs } = item as Record<string, unknown>;
    if (typeof goodsNo !== "number" || !Number.isFinite(goodsNo)) continue;
    if (typeof weight !== "number" || !Number.isFinite(weight)) continue;
    anchors.push({
      goodsNo,
      weight,
      lastMs: typeof lastMs === "number" && Number.isFinite(lastMs) ? lastMs : 0,
    });
  }
  return anchors;
}

/**
 * 이 계정에 보관된 취향. 저장한 적이 없으면 빈 프로필.
 *
 * 서버가 보낸 값을 그대로 믿지 않는다 — 형태가 어긋난 항목은 버린다. 깨진 값
 * 하나가 프로필 전체를 못 쓰게 만들면 안 된다.
 */
export async function fetchAccountProfile(): Promise<LongTermProfile> {
  const rows = await authedRpc<TasteRowDto[] | null>("c_taste_get");
  const row = rows?.[0];
  if (!row) return emptyLongTerm();
  return {
    schemaVersion: row.schema_version,
    anchors: toAnchors(row.anchors),
    updatedAtMs: Date.parse(row.updated_at),
  };
}

export async function saveAccountProfile(profile: LongTermProfile): Promise<void> {
  await authedRpc<string>("c_taste_put", {
    p_schema_version: profile.schemaVersion,
    p_anchors: profile.anchors,
  });
}

/**
 * 이 계정에 보관된 취향을 지운다 — 설정의 "개인화 데이터 모두 지우기".
 *
 * **대상을 보내지 않는다** — 서버 함수가 호출자의 인증 주체만 본다.
 *
 * 빈 프로필을 저장하는 것으로 대신하지 않는다. 화면이 "모두 삭제"를 약속했는데
 * 행을 남기면 말과 다르다.
 *
 * @returns 지운 행 수. **0은 오류가 아니라 지울 것이 없었던 것**이다 —
 * 재시도로 두 번 불려도 두 번째는 0이고, 그것도 성공이다.
 * @throws 지워졌는지 알 수 없을 때. 호출자가 재시도 큐에 적어야 한다.
 */
export async function forgetAccountProfile(): Promise<number> {
  const deleted = await authedRpc<unknown>("c_taste_forget");
  // 숫자가 아니면 결과를 모르는 것이다. 0으로 넘기면 "지울 것이 없었다"로 오인해
  // 재시도 큐에서 빠지고, 서버에 남은 취향을 다시 지울 기회를 잃는다.
  if (typeof deleted !== "number") throw new Error("삭제 결과를 해석할 수 없다");
  return deleted;
}
