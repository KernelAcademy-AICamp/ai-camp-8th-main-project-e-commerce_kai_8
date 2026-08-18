// 삭제 대기 표식 판정 — 순수 규칙.
// 설계: docs/superpowers/specs/2026-08-18-google-login-design.md §4 계정 삭제

/**
 * 삭제를 요청하기 **전에** 남기는 표식.
 *
 * 구글 쪽 신원을 함께 적는 이유가 핵심이다. 삭제가 서버에서 성사됐는데 응답만
 * 유실되면, 같은 구글 계정으로 다시 로그인할 때 **새 사용자(다른 식별자)**가
 * 만들어진다. 이때 사용자 식별자만 비교하면 "다르니까 아직 안 지워졌다"로
 * 오판해 재시도하고, 인자 없는 자기 삭제 함수는 **방금 만든 새 계정**을
 * 정상적으로 지운다. 멱등성이 아니라 데이터 파괴다.
 */
export interface PendingDeletion {
  /** 지우려던 인증 사용자 식별자 */
  userId: string;
  /** 구글 쪽 신원 (제공자가 준 고유 식별자) */
  providerId: string;
  /** 표식을 남긴 시각 (epoch ms) */
  requestedAt: number;
}

/** 지금 로그인한 사람 */
export interface CurrentIdentity {
  userId: string;
  providerId: string;
}

export type DeletionFollowUp =
  /** 할 일이 없다 — 표식이 없거나, 아직 로그인하지 않아 비교할 대상이 없다 */
  | { kind: "none" }
  /** 30일이 지났다. 표식을 버린다 */
  | { kind: "clearExpired" }
  /** 첫 삭제가 성공하고 재가입된 것. **재호출하지 않고** 표식만 정리한다 */
  | { kind: "clearCompleted" }
  /** 다른 구글 계정이다. 표식을 유지하고 원래 계정으로 로그인해야 한다고 알린다 */
  | { kind: "keepAndWarn" }
  /** 삭제가 서버에 닿지 않았다. 재확인 후 다시 지운다 */
  | { kind: "retry" };

/**
 * 표식을 들고 있는 기간 (계획 4단계 결정 ②).
 *
 * 표식에는 사용자 식별자와 구글 신원이 들어간다. 무기한으로 두면 돌아오지 않는
 * 사람의 기기에 신원 정보가 영영 남는다.
 */
export const DELETION_MARKER_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export function decideDeletionFollowUp(
  marker: PendingDeletion | null,
  current: CurrentIdentity | null,
  now: number,
): DeletionFollowUp {
  if (marker === null) return { kind: "none" };

  // 만료가 먼저다. 로그인 여부와 무관하게 버린다.
  if (now - marker.requestedAt > DELETION_MARKER_MAX_AGE_MS) {
    return { kind: "clearExpired" };
  }

  if (current === null) return { kind: "none" };

  // **구글 쪽 신원부터** 비교한다. 순서를 바꾸면 위 주석의 사고가 난다.
  if (current.providerId !== marker.providerId) return { kind: "keepAndWarn" };

  if (current.userId !== marker.userId) return { kind: "clearCompleted" };

  return { kind: "retry" };
}
