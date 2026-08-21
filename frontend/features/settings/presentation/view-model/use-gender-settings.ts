"use client";

import { useCallback, useState } from "react";

import { putAccountGender } from "@/shared/gender/account-gender-api";
import {
  getKnownUpdatedAt,
  installFromServer,
} from "@/shared/gender/gender-account-sync";
import { type GenderChoice, setGenderSetting } from "@/shared/gender/gender-setting";
import { useGenderSetting } from "@/shared/gender/use-gender-setting";
import { isRetryable } from "@/shared/rpc-error";
import { isSignedInNow } from "@/shared/supabase/session-state";

/**
 * 저장 결과. **충돌은 실패가 아니다** — 값이 왜 바뀌어 보이는지 알려야 한다.
 * 반대로 "미확인"(응답이 없음)은 로컬 값을 되돌리지 않는다. 서버가 받았는지
 * 모르는 상태에서 되돌리면 다음 접속에 값이 또 뒤집힌다.
 */
export type GenderSaveStatus =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "conflict"; gender: GenderChoice }
  | { kind: "failed" }
  | { kind: "syncFailed" };

export function useGenderSettings() {
  const gender = useGenderSetting();
  const [status, setStatus] = useState<GenderSaveStatus>({ kind: "idle" });

  const choose = useCallback(
    (next: GenderChoice) => {
      if (next === gender) return;
      const previous = gender;
      // 화면은 즉시 바꾼다 — 눌렀는데 아무 일도 안 일어나는 것처럼 보이지 않게.
      setGenderSetting(next);

      // 비회원은 계정에 올릴 것이 없다(O-37). 기기 저장으로 끝이다.
      if (!isSignedInNow()) {
        setStatus({ kind: "idle" });
        return;
      }

      setStatus({ kind: "saving" });
      putAccountGender(next, getKnownUpdatedAt())
        .then((result) => {
          if (result.applied) {
            installFromServer(result);
            setStatus({ kind: "idle" });
            return;
          }
          // 다른 기기가 더 최신이다 — 내가 고른 값이 아니라 **서버 값**을 설치한다.
          installFromServer(result);
          setStatus({ kind: "conflict", gender: result.gender });
        })
        .catch((error: unknown) => {
          if (isRetryable(error)) {
            // 응답이 없었다 = 서버가 받았는지 모른다. 로컬은 그대로 두고 알리기만 한다.
            setStatus({ kind: "syncFailed" });
            return;
          }
          // 서버가 거부했다 — 화면만 바뀌고 서버가 모르는 상태를 만들지 않는다.
          if (previous) setGenderSetting(previous);
          setStatus({ kind: "failed" });
        });
    },
    [gender],
  );

  return { gender, status, choose };
}
