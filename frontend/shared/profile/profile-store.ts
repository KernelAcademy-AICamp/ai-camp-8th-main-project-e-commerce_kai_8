// 취향 프로필 저장소 (설계 §6): 장기 = localStorage(백업 슬롯 1개, 멀티탭 병합),
// 세션 = sessionStorage(탭 단위). 규칙 계산은 profile-rules(순수)로 위임한다.

import {
  applyAction,
  applyImpression,
  emptyLongTerm,
  emptySession,
  foldSessionIntoLongTerm,
  type LongTermProfile,
  mergeLongTerm,
  type ProfileActionType,
  type SessionProfile,
} from "./profile-rules";

const LONG_KEY = "atee-profile";
const BACKUP_KEY = "atee-profile-backup";
const SESSION_PROFILE_KEY = "atee-session-profile";

function parseLongTerm(raw: string | null): LongTermProfile | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as LongTermProfile).schemaVersion === "number" &&
      Array.isArray((parsed as LongTermProfile).anchors)
    ) {
      return parsed as LongTermProfile;
    }
    return null;
  } catch {
    return null;
  }
}

/** 손상 복구 (설계 §6·§9): 본체 → 백업 슬롯 → 콜드스타트 */
export function readLongTerm(): LongTermProfile {
  try {
    const main = parseLongTerm(localStorage.getItem(LONG_KEY));
    if (main) return main;
    const backup = parseLongTerm(localStorage.getItem(BACKUP_KEY));
    if (backup) return backup;
    return emptyLongTerm();
  } catch {
    return emptyLongTerm();
  }
}

/**
 * 저장 직전 재읽기 후 병합(앵커 합집합+가중 최대) — 멀티탭에서 마지막 쓰기가
 * 다른 탭의 갱신을 덮지 않게 한다. 직전 정상본은 백업 슬롯으로 밀어둔다.
 */
function writeLongTerm(next: LongTermProfile): void {
  try {
    const currentRaw = localStorage.getItem(LONG_KEY);
    const current = parseLongTerm(currentRaw);
    const merged = current ? mergeLongTerm(current, next) : next;
    if (currentRaw && current) localStorage.setItem(BACKUP_KEY, currentRaw);
    localStorage.setItem(LONG_KEY, JSON.stringify(merged));
  } catch {
    // 저장 불가 환경 — 프로필 없이 동작 (콜드스타트와 동일)
  }
}

function parseSession(raw: string | null): SessionProfile | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as SessionProfile).sessionId === "string" &&
      Array.isArray((parsed as SessionProfile).anchors)
    ) {
      // 과거 스키마에서 저장된 프로필의 누락 필드 보정
      const session = parsed as Partial<SessionProfile> &
        Pick<SessionProfile, "sessionId" | "anchors">;
      return {
        ...session,
        impressionCounts: session.impressionCounts ?? {},
        recentImpressions: session.recentImpressions ?? [],
        removed: session.removed ?? [],
        boostRemaining:
          typeof session.boostRemaining === "number" ? session.boostRemaining : 0,
      };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * 현재 세션 프로필을 돌려준다. 저장된 프로필이 다른(끝난) 세션 것이면
 * 그 시점에 장기 프로필로 반영(fold)하고 새 세션 프로필을 시작한다 —
 * "한 세션의 행동은 세션 종료 시점에 장기에 들어간다"(설계 §6).
 */
function readSessionProfile(sessionId: string, nowMs: number): SessionProfile {
  try {
    const stored = parseSession(sessionStorage.getItem(SESSION_PROFILE_KEY));
    if (!stored) return emptySession(sessionId);
    if (stored.sessionId === sessionId) return stored;
    if (stored.anchors.length > 0 || stored.removed.length > 0) {
      writeLongTerm(foldSessionIntoLongTerm(readLongTerm(), stored, nowMs));
    }
    return emptySession(sessionId);
  } catch {
    return emptySession(sessionId);
  }
}

function writeSessionProfile(session: SessionProfile): void {
  try {
    sessionStorage.setItem(SESSION_PROFILE_KEY, JSON.stringify(session));
  } catch {
    // 저장 불가 — 세션 프로필 없이 동작
  }
}

export function recordProfileAction(
  type: ProfileActionType,
  goodsNo: number,
  sessionId: string,
  nowMs: number,
): void {
  const session = readSessionProfile(sessionId, nowMs);
  writeSessionProfile(applyAction(session, { type, goodsNo, nowMs }));
}

export function recordProfileImpression(
  goodsNo: number,
  sessionId: string,
  nowMs: number,
): void {
  const session = readSessionProfile(sessionId, nowMs);
  writeSessionProfile(applyImpression(session, goodsNo));
}

/** 피드 요청에 실어 보낼 프로필 요약 (설계 §2·§7 — 4단계 믹스 RPC 계약) */
export interface ProfileSummary {
  schemaVersion: number;
  longAnchors: { goodsNo: number; weight: number }[];
  sessionAnchors: { goodsNo: number; weight: number }[];
  recentImpressions: number[];
  /** `이 스타일로 계속 탐색` 부스트가 아직 살아 있는가 (노출 60장 기준) */
  boostActive: boolean;
}

export function getProfileSummary(sessionId: string, nowMs: number): ProfileSummary {
  const longTerm = readLongTerm();
  const session = readSessionProfile(sessionId, nowMs);
  return {
    schemaVersion: longTerm.schemaVersion,
    longAnchors: longTerm.anchors.map(({ goodsNo, weight }) => ({ goodsNo, weight })),
    sessionAnchors: session.anchors.map(({ goodsNo, weight }) => ({ goodsNo, weight })),
    recentImpressions: session.recentImpressions,
    boostActive: session.boostRemaining > 0,
  };
}

/** 개인화 데이터 초기화(설정)에서 함께 지운다 */
export function clearProfile(): void {
  try {
    localStorage.removeItem(LONG_KEY);
    localStorage.removeItem(BACKUP_KEY);
    sessionStorage.removeItem(SESSION_PROFILE_KEY);
  } catch {
    // 저장소 접근 불가면 지울 것도 없다
  }
}
