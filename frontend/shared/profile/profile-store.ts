// 취향 프로필 저장소 (설계 §6): 장기 = localStorage(백업 슬롯 1개, 멀티탭 병합),
// 세션 = sessionStorage(탭 단위). 규칙 계산은 profile-rules(순수)로 위임한다.

import {
  type AnchorGender,
  applyAction,
  applyImpression,
  deriveDominantGender,
  type DominantGender,
  emptyLongTerm,
  emptySession,
  foldSessionIntoLongTerm,
  type LongTermProfile,
  mergeLongTerm,
  type ProfileActionType,
  type SessionProfile,
  toAnchorGender,
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
 *
 * ⚠️ **접기 결과에 쓰면 안 된다.** 접기는 현재 장기를 변형(감쇠·해제)한
 * 대체본인데, 병합의 "가중 최대"가 감쇠를 되돌리고 합집합이 해제를 부활시킨다
 * — 실제로 그렇게 저장해서 오래된 취향이 영영 안 옅어지는 회귀가 있었다.
 * 접기는 writeLongTermReplacing을 쓴다.
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
  changeListener?.();
}

/**
 * 현재 장기를 **대체**하는 저장 — 접기 전용. 병합하지 않는다.
 *
 * 다른 탭이 읽기와 쓰기 사이에 끼어드는 좁은 틈은 남지만, 병합이 감쇠·해제를
 * 무효화하는 확실한 손해보다 낫다. 끼어든 탭의 몫은 그 탭의 다음 저장이 되살린다.
 */
function writeLongTermReplacing(next: LongTermProfile): void {
  try {
    const currentRaw = localStorage.getItem(LONG_KEY);
    if (currentRaw && parseLongTerm(currentRaw)) {
      localStorage.setItem(BACKUP_KEY, currentRaw);
    }
    localStorage.setItem(LONG_KEY, JSON.stringify(next));
  } catch {
    // 저장 불가 환경 — 프로필 없이 동작
  }
  changeListener?.();
}

/**
 * 장기 프로필이 바뀔 때 부를 곳.
 *
 * 계정 보관(2026-08-19)이 이걸 듣고 "더러워졌다"를 표시한다. 저장소가 계정
 * 동기화를 직접 import하면 순환이 생기므로 반대로 등록받는다.
 */
let changeListener: (() => void) | null = null;

export function setLongTermChangeListener(listener: (() => void) | null): void {
  changeListener = listener;
}

/**
 * 서버에서 읽어온 프로필을 기기에 놓는다.
 *
 * 방금 내려받은 것을 다시 올리지 않도록 **변경 알림을 내지 않는다.**
 * 병합은 그대로 거친다 — 다른 탭이 그 사이 쌓은 것을 덮지 않기 위해서다.
 */
export function installLongTermFromServer(profile: LongTermProfile): void {
  const listener = changeListener;
  changeListener = null;
  try {
    writeLongTerm(profile);
  } finally {
    changeListener = listener;
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
      writeLongTermReplacing(foldSessionIntoLongTerm(readLongTerm(), stored, nowMs));
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

/**
 * 지금 세션의 취향을 **즉시** 장기로 접는다 — 마이페이지 새로고침용.
 *
 * 원래 접기는 세션이 끝나야(비활성 30분 뒤 같은 탭의 다음 활동) 일어나서,
 * "지금까지 본 것"이 취향 카드에 30분 넘게 안 보였다. 새로고침은 "여기까지를
 * 반영해줘"이므로 그 자리에서 접는다.
 *
 * 접은 뒤 세션 앵커를 비운다 — 세션이 이어지다 끝날 때 **같은 행동이 두 번
 * 반영되면 안 된다.** 노출 기억(중복 노출 감쇠·피드 최근 제외)과 부스트는
 * 접기와 무관하므로 남긴다.
 *
 * 접을 것이 없으면 아무것도 하지 않는다 — 빈 접기도 장기 앵커를 한 세션만큼
 * 감쇠시키므로, 연타가 취향을 깎게 두면 안 된다.
 *
 * @returns 실제로 접었는가 (호출부가 서버 올리기 여부를 가른다)
 */
export function foldSessionProfileNow(nowMs: number): boolean {
  try {
    const stored = parseSession(sessionStorage.getItem(SESSION_PROFILE_KEY));
    if (!stored) return false;
    if (stored.anchors.length === 0 && stored.removed.length === 0) return false;
    writeLongTermReplacing(foldSessionIntoLongTerm(readLongTerm(), stored, nowMs));
    writeSessionProfile({ ...stored, anchors: [], removed: [] });
    return true;
  } catch {
    return false;
  }
}

export function recordProfileAction(
  type: ProfileActionType,
  goodsNo: number,
  sessionId: string,
  nowMs: number,
  gender?: string | null,
): void {
  const session = readSessionProfile(sessionId, nowMs);
  writeSessionProfile(
    applyAction(session, { type, goodsNo, nowMs, gender: toAnchorGender(gender) }),
  );
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
  /** 장기+세션 앵커를 합쳐 판정한 우세 성별 (설계: 성별 피드 하드 필터 2단계) */
  gender: DominantGender;
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
    gender: deriveDominantGender([...longTerm.anchors, ...session.anchors]),
  };
}

/**
 * 성별 필드가 없는 장기 앵커의 goods_no 목록 — 기기 보강(3단계)의 조회 대상.
 * 세션 앵커는 대상이 아니다(새 행동은 기록 시점에 이미 성별이 실린다).
 */
export function longAnchorsMissingGender(): number[] {
  return readLongTerm()
    .anchors.filter((a) => a.gender === undefined)
    .map((a) => a.goodsNo);
}

/**
 * 장기 앵커에 성별을 일괄 적용한다 — 기기 보강(3단계) 전용.
 * 이미 성별이 있는 앵커나 응답에 없는 goods_no(뷰에 없거나 빈 문자열)는
 * 손대지 않는다(미상으로 남긴다 — 다음 접속에 다시 물어도 저렴하다).
 */
export function applyAnchorGenders(genders: Map<number, AnchorGender>): void {
  if (genders.size === 0) return;
  const current = readLongTerm();
  const hasTarget = current.anchors.some(
    (a) => a.gender === undefined && genders.has(a.goodsNo),
  );
  if (!hasTarget) return;
  const anchors = current.anchors.map((a) =>
    a.gender === undefined && genders.has(a.goodsNo)
      ? { ...a, gender: genders.get(a.goodsNo) }
      : a,
  );
  writeLongTerm({ ...current, anchors });
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
