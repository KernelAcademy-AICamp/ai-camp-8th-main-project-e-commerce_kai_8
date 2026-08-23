// 계정에 보관하는 성별 설정 — 서버 호출. 로그인한 사용자만 쓸 수 있다.
//
// 익명 통로(`shared/supabase-rpc.ts`)를 쓰지 않는다. 계정 데이터는 인증 통로로만
// 나간다(구글 로그인 설계 §2 transport 경계).

import { authedRpc } from "@/shared/supabase/authed-rpc";

import { type GenderChoice, isGenderChoice } from "./gender-setting";

/** 서버가 보관하고 있는 값. 저장한 적이 없으면 `null`. */
export interface AccountGender {
  gender: GenderChoice;
  /** 조건부 쓰기의 기준이 되는 서버 시각. 다음 저장에 그대로 돌려보낸다. */
  updatedAt: string;
}

interface GenderRowDto {
  gender: string;
  updated_at: string;
}

function toAccountGender(row: GenderRowDto | undefined): AccountGender | null {
  // 서버가 보낸 값을 그대로 믿지 않는다 — 형태가 어긋나면 없는 것으로 본다.
  if (!row || !isGenderChoice(row.gender) || typeof row.updated_at !== "string") {
    return null;
  }
  return { gender: row.gender, updatedAt: row.updated_at };
}

/**
 * 계정에 보관된 성별. **저장한 적이 없으면 `null`이고, 읽기에 실패하면 던진다.**
 * 둘을 섞으면 실패를 "값 없음"으로 오인해 이미 고른 사람에게 다시 묻게 된다.
 */
export async function fetchAccountGender(): Promise<AccountGender | null> {
  const rows = await authedRpc<GenderRowDto[] | null>("c_gender_get");
  return toAccountGender(rows?.[0]);
}

/** 저장 결과. 응답이 **도착한 경우**의 세 값이다. */
export interface GenderPutResult {
  /** 거짓이면 다른 기기가 더 최신이다 — 아래 값을 설치해야 한다. */
  applied: boolean;
  gender: GenderChoice;
  updatedAt: string;
}

/**
 * 계정에 저장한다.
 *
 * @param expectedUpdatedAt
 *   `null`이면 **"계정에 값이 없을 때만 저장"** — 비회원 선택 승계가 이 형태다.
 *   시각을 주면 그 시각의 행일 때만 덮는다.
 *
 * 적용 여부와 무관하게 **서버의 최종 값**이 함께 온다. 못 덮었으면 이전 로컬 값으로
 * 되돌리는 것이 아니라 이 값을 설치한다 — 안 그러면 화면과 서버가 갈린다.
 *
 * 응답 자체가 오지 않는 경우("미확인")는 던진다. 부르는 쪽이 재시도로 다룬다.
 */
export async function putAccountGender(
  gender: GenderChoice,
  expectedUpdatedAt: string | null,
): Promise<GenderPutResult> {
  const rows = await authedRpc<({ applied: boolean } & GenderRowDto)[] | null>(
    "c_gender_put",
    {
      p_gender: gender,
      p_expected_updated_at: expectedUpdatedAt,
    },
  );
  const row = rows?.[0];
  const value = toAccountGender(row);
  if (!row || !value) {
    throw new Error("성별 저장 응답을 해석할 수 없다");
  }
  return { applied: row.applied, ...value };
}
