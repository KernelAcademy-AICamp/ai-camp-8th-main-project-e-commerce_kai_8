// 삭제 대기 표식의 저장소 — 설계 §4 계정 삭제
//
// 이 표식은 **파괴 호출의 안전장치**다. 저장에 실패했는데 삭제부터 보내면,
// 응답이 유실됐을 때 무엇을 지우려 했는지 알 방법이 사라진다. 그래서 저장 뒤
// **다시 읽어 확인**하고, 확인되지 않으면 호출하지 않는다.

import type { PendingDeletion } from "../domain/pending-deletion";

/**
 * 신원이 바뀌어도 지워지지 않아야 한다.
 * 지키는 쪽은 shared/identity/identity-scoped-keys.ts의 남길 목록이다.
 */
export const PENDING_DELETION_KEY = "atee-pending-account-delete";

/**
 * 저장된 원문을 표식으로 읽는다. 읽을 수 없으면 null.
 *
 * 저장소를 직접 읽는 화면(렌더 중 스냅숏)이 있어 밖으로 낸다.
 */
export function parsePendingDeletion(raw: string): PendingDeletion | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;

  const { userId, providerId, requestedAt } = value as Record<string, unknown>;
  // 반쪽 표식으로 판정하면 오판한다 — 셋이 다 있어야 유효한 표식이다.
  if (typeof userId !== "string" || userId === "") return null;
  if (typeof providerId !== "string" || providerId === "") return null;
  if (typeof requestedAt !== "number" || !Number.isFinite(requestedAt)) return null;

  return { userId, providerId, requestedAt };
}

export function loadPendingDeletion(storage: Storage): PendingDeletion | null {
  let raw: string | null;
  try {
    raw = storage.getItem(PENDING_DELETION_KEY);
  } catch {
    return null;
  }
  return raw === null ? null : parsePendingDeletion(raw);
}

/**
 * 표식을 남기고 **다시 읽어 확인한다.**
 *
 * @returns 확인됐으면 참. 거짓이면 삭제를 호출하지 않는다.
 */
export function savePendingDeletion(
  marker: PendingDeletion,
  storage: Storage,
): boolean {
  try {
    storage.setItem(PENDING_DELETION_KEY, JSON.stringify(marker));
  } catch {
    return false;
  }
  // 예외 없이 삼키고 실제로는 저장하지 않는 환경이 있다(프라이빗 모드 등).
  const readBack = loadPendingDeletion(storage);
  return (
    readBack !== null &&
    readBack.userId === marker.userId &&
    readBack.providerId === marker.providerId &&
    readBack.requestedAt === marker.requestedAt
  );
}

export function clearPendingDeletion(storage: Storage): void {
  try {
    storage.removeItem(PENDING_DELETION_KEY);
  } catch {
    // 지우지 못해도 판정 규칙이 만료로 정리한다
  }
}
