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
