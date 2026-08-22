"use client";

import { useEffect } from "react";

import {
  fetchLocalUserId,
  subscribeAuthChange,
} from "@/features/auth/data/auth-repository";
import { carryGender, shouldCarryGender } from "@/shared/identity/gender-carry";
import { takeIdentityLanding } from "@/shared/identity/identity-landing";
import { isIdentityTransition, markerFor } from "@/shared/identity/identity-marker";
import { clearIdentityScopedData } from "@/shared/identity/identity-reset";
import { carryWishes, shouldCarryWishes } from "@/shared/identity/wish-carry";

/**
 * 이 탭이 마지막으로 처리한 신원.
 *
 * **sessionStorage에 둔다 — 탭마다 다르고 새로고침을 견딘다.**
 * localStorage에 공유 표식 하나만 두면, 다른 탭이 먼저 갱신했을 때
 * 뒤늦게 깨어난(또는 새로고침된) 탭이 "이미 처리됨"으로 오판해
 * 자기 sessionStorage에 남은 앞 신원의 세션 프로필을 놓친다.
 * 그러면 그 프로필이 다음 요청 때 장기 프로필로 다시 합쳐진다.
 */
const TAB_MARKER_KEY = "atee-identity-tab";

function readTabMarker(): string | null {
  try {
    return sessionStorage.getItem(TAB_MARKER_KEY);
  } catch {
    return null;
  }
}

function writeTabMarker(marker: string): void {
  try {
    sessionStorage.setItem(TAB_MARKER_KEY, marker);
  } catch {
    // 저장 불가 환경 — 이번 탭에서는 매번 새 탭처럼 판정된다
  }
}

/**
 * 신원이 바뀌면 앞사람의 흔적을 지운다 (설계 §2 신원 전환).
 *
 * 지운 뒤 **페이지를 다시 불러온다.** 저장소만 지우면 이미 화면에 올라온
 * 피드·찜 표시, 노출 기록, 진행 중인 요청의 응답이 메모리에 그대로 남는다.
 * 다시 불러오면 그 전부가 한 번에 사라지고, 전환 순서를 지키느라 여러
 * 모듈에 손댈 필요도 없다.
 */
export function useIdentityReconcile(): void {
  useEffect(() => {
    let active = true;

    function reconcile(): void {
      void fetchLocalUserId().then(
        (userId) => {
          if (!active) return;
          const current = markerFor(userId);
          const previous = readTabMarker();

          if (!isIdentityTransition(previous, current)) {
            // 처리 이력이 없는 새 탭이면 기준점만 남긴다
            if (previous === null) writeTabMarker(current);
            return;
          }

          // **지우기 전에** 계정으로 옮길 찜을 빼둔다. 아래 정리가 기기 찜을
          // 지우고 페이지를 다시 부르므로, 여기서 빼두지 않으면 옮길 것이 이미
          // 사라진 뒤다. 익명 → 사용자 전환에서만 일어난다 — 사용자 A → B에서
          // 옮기면 A의 찜이 B 계정으로 들어간다(설계 §4).
          if (shouldCarryWishes(previous, current)) carryWishes(localStorage);
          // 성별도 같은 자리에서 빼둔다 — 아래 정리가 설정 본체를 지운다.
          // 안 빼두면 비회원으로 고른 성별이 사라져 로그인 직후 다시 묻게 된다.
          if (shouldCarryGender(previous, current)) carryGender(localStorage);

          // 순서: 지우고 → 표식을 확정하고 → 다시 불러온다.
          // 표식을 먼저 쓰면 다시 불러오기 전에 탭이 죽었을 때 정리가 끝난
          // 것으로 오인한다. 지우기가 먼저이므로 중간에 죽어도 데이터는 남지 않는다.
          clearIdentityScopedData();
          writeTabMarker(current);
          // 옮겨 달라고 부탁받은 자리가 있으면 그리로 — 로그아웃처럼 보던 자리가
          // 더는 유효하지 않은 경우다. 부탁한 쪽이 따로 이동시키지 않고 여기에
          // 맡기므로, 페이지를 다시 부르는 일이 한 곳에서만 일어난다.
          // `replace`인 이유: 떠나온 자리로 뒤로가기해 봐야 볼 것이 없다.
          const landing = takeIdentityLanding();
          if (landing === null) window.location.reload();
          else window.location.replace(landing);
        },
        () => {
          // 세션을 읽지 못하면 판정하지 않는다 — 잘못 지우는 것보다 낫다
        },
      );
    }

    reconcile();
    // 같은 브라우저의 다른 탭에서 일어난 변화도 여기로 전달된다
    const unsubscribe = subscribeAuthChange(reconcile);

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);
}
