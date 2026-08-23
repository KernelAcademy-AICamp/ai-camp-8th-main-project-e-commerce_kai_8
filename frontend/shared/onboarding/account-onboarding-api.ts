// 계정에 보관하는 온보딩 상태 — 서버 호출. 로그인한 사용자만 쓸 수 있다.
//
// 익명 통로(`shared/supabase-rpc.ts`)를 쓰지 않는다. 계정 데이터는 인증 통로로만
// 나간다(구글 로그인 설계 §2 transport 경계).

import type { GenderChoice } from "@/shared/gender/gender-setting";
import { authedRpc } from "@/shared/supabase/authed-rpc";

import { type OnboardingPick, toPicks, toWire } from "./onboarding-pick";

/** 계정이 보관하고 있는 것. 온보딩을 마친 적이 없으면 `null`. */
export interface AccountOnboarding {
  gender: GenderChoice;
  /** 마친 적이 있다는 뜻이다. 선택이 비어 있어도(초기화 뒤) 참이다. */
  completed: true;
  /** 그때 본 후보 목록 판. */
  candidatesVersion: string;
  /** 개인화 초기화로 걷어냈으면 빈 배열이다. */
  picks: OnboardingPick[];
}

interface OnboardingRowDto {
  gender: string;
  candidates_version: string;
  completed_at: string;
  picks: unknown;
}

/**
 * 계정에 보관된 온보딩 상태.
 *
 * **마친 적이 없으면 `null`이고, 읽기에 실패하면 던진다.** 둘을 섞으면 실패를
 * "안 했다"로 오인해 이미 마친 사람에게 온보딩을 다시 보여준다.
 */
export async function fetchAccountOnboarding(): Promise<AccountOnboarding | null> {
  const rows = await authedRpc<OnboardingRowDto[] | null>("c_onboarding_get");
  const row = rows?.[0];
  if (!row) return null;
  // 서버가 보낸 값을 그대로 믿지 않는다 — 성별이 허용값이 아니면 행이 깨진 것이다.
  if (row.gender !== "남성" && row.gender !== "여성") return null;
  return {
    gender: row.gender,
    completed: true,
    candidatesVersion: row.candidates_version,
    picks: toPicks(row.picks),
  };
}

/**
 * 계정에 저장한다. 서버가 최소 3개·후보 목록 안·성별 일치를 검증하고,
 * 어긋나면 **정화하지 않고 거부한다.**
 *
 * 원자적·멱등이다. **완료는 한 번뿐이다** — 이미 마친 계정이 다시 부르면 서버가
 * 아무것도 바꾸지 않고 저장돼 있는 것을 돌려준다. 지연 요청·다중 탭·직접 호출이
 * 최신 성별과 선택을 되돌리지 못하게 하는 계약이다(교차 리뷰 ②).
 *
 * @returns 서버에 실제로 담긴 선택. 화면은 이 값을 설치한다.
 * @throws 응답이 오지 않거나 서버가 거부했을 때. 부르는 쪽이 재시도로 다룬다.
 */
export async function putAccountOnboarding(
  gender: GenderChoice,
  version: string,
  picks: readonly OnboardingPick[],
): Promise<OnboardingPick[]> {
  const rows = await authedRpc<unknown>("c_onboarding_put", {
    p_gender: gender,
    // **사용자가 본 판을 그대로 보낸다.** 서버가 지금 판을 다시 읽으면 화면을 보는
    // 도중 갈린 경우 보지 않은 판으로 기록된다(교차 리뷰 ⑥).
    p_version: version,
    p_picks: picks.map(toWire),
  });
  const saved = toPicks(rows);
  // 빈 응답은 "저장됐다"로 볼 수 없다 — 서버는 최소 3개를 보장한다.
  if (saved.length === 0) throw new Error("온보딩 저장 응답을 해석할 수 없다");
  return saved;
}

/**
 * 계정에 담긴 온보딩 **선택만** 지운다 — 설정의 "개인화 데이터 모두 지우기".
 * 완료 표식은 남는다(초기화가 온보딩을 다시 띄우면 안 된다).
 *
 * @returns 지운 행 수. **0은 오류가 아니라 지울 것이 없었던 것**이다.
 * @throws 지워졌는지 알 수 없을 때. 호출자가 재시도 큐에 적어야 한다.
 */
export async function forgetAccountOnboarding(): Promise<number> {
  const deleted = await authedRpc<unknown>("c_onboarding_forget");
  if (typeof deleted !== "number") throw new Error("삭제 결과를 해석할 수 없다");
  return deleted;
}
