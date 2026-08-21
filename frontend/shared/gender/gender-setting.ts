// 사람이 고른 성별 — 이 기기의 설정.
//
// **취향 프로필과 별개 키다.** 성별은 "취향"이 아니라 "설정"이라, 설정 화면의
// *개인화 데이터 모두 지우기*로 지워지지 않아야 한다. 초기화할 때마다 온보딩이 다시
// 뜨면 초기화가 못 쓸 기능이 된다. (계획 1단계)
//
// **신원이 바뀌면(로그아웃·탈퇴) 지워진다.** identity-scoped-keys가 "남길 것만 열거"하는
// 방식이고 이 키를 거기 넣지 않았기 때문이다 — 앞 사용자의 성별이 다음 사용자에게 새지
// 않게 하는 의도된 동작이다. 비회원이 고른 값을 로그인 계정으로 넘기는 승계는 별도 키로
// 처리한다(3단계).
//
// useSyncExternalStore 계약을 지킨다 — 바뀌기 전까지 같은 값을 돌려준다.

/** 사람이 고를 수 있는 성별. 공용은 고를 수 있는 값이 아니다(서버가 등식으로 거른다). */
export type GenderChoice = "남성" | "여성";

/** 아직 고르지 않았거나 저장소를 못 읽은 상태 */
export type GenderSetting = GenderChoice | null;

export const GENDER_SETTING_KEY = "atee-gender";

const CHOICES: readonly string[] = ["남성", "여성"];

export function isGenderChoice(value: unknown): value is GenderChoice {
  return typeof value === "string" && CHOICES.includes(value);
}

/**
 * 저장소에서 직접 읽는다. **허용값이 아니면 미확정으로 본다** — 손으로 고쳤거나 옛
 * 버전이 남긴 값을 그대로 믿고 서버에 보내면 거부당한다(서버 입력 계약).
 */
export function readStoredGender(): GenderSetting {
  try {
    const raw = localStorage.getItem(GENDER_SETTING_KEY);
    return isGenderChoice(raw) ? raw : null;
  } catch {
    // 저장소 접근 불가(사생활 보호 모드 등) — 미확정으로 두면 선택 화면이 뜬다
    return null;
  }
}

let current: GenderSetting = null;
let loaded = false;
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((listener) => {
    listener();
  });
}

/**
 * 지금 값. **첫 호출에서 저장소를 동기적으로 읽는다** — effect 뒤로 미루면 그 사이에
 * 피드 훅이 마운트 즉시 요청을 보내버린다(계획 2단계 "초기값은 동기적으로 미확정").
 */
export function getGenderSnapshot(): GenderSetting {
  if (!loaded) {
    current = readStoredGender();
    loaded = true;
  }
  return current;
}

/** 서버 렌더에는 이 기기의 설정이 없다 — 항상 미확정이다. */
export function getGenderServerSnapshot(): GenderSetting {
  return null;
}

export function setGenderSetting(next: GenderChoice): void {
  if (getGenderSnapshot() === next) return; // 같은 값이면 화면을 흔들지 않는다
  current = next;
  loaded = true;
  try {
    localStorage.setItem(GENDER_SETTING_KEY, next);
  } catch {
    // 저장은 실패해도 이번 세션 동안은 고른 값으로 동작한다. 화면에 알리는 것은
    // 설정 화면의 몫이다(계획 8단계).
  }
  notify();
}

/** 메모리 캐시만 비운다 — 저장소는 건드리지 않는다(테스트·신원 전환용). */
export function clearGenderSetting(): void {
  current = null;
  loaded = false;
  notify();
}

export function subscribeGender(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
