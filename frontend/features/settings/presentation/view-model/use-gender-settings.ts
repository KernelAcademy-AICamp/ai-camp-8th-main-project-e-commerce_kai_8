"use client";

import { useCallback, useState } from "react";

import {
  fetchAccountGender,
  putAccountGender,
} from "@/shared/gender/account-gender-api";
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
      // **저장 직전에 기준 시각을 확보한다.** 계정 동기화가 아직 안 돌았으면(세션
      // 하이드레이션 타이밍) 기준 시각이 비어 있는데, 그대로 보내면 "값이 없을 때만
      // 저장"으로 나가 행이 이미 있는 한 **항상 충돌**이 된다. 다른 기기가 없는데도
      // 충돌이라고 알리는 거짓 신호였다(브라우저 확인에서 잡혔다).
      const known = getKnownUpdatedAt();
      const baseline =
        known !== null
          ? Promise.resolve(known)
          : fetchAccountGender().then((row) => row?.updatedAt ?? null);

      baseline
        .then((expected) => putAccountGender(next, expected))
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
