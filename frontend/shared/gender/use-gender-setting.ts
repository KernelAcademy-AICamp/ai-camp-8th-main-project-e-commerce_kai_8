"use client";

import { useSyncExternalStore } from "react";

import {
  type GenderSetting,
  getGenderServerSnapshot,
  getGenderSnapshot,
  subscribeGender,
} from "./gender-setting";

/**
 * 이 기기의 성별 설정. 고르기 전에는 `null`(미확정)이다.
 *
 * **미확정이면 피드·검색·유사 요청을 내보내면 안 된다.** 서버가 성별을 필수로 받고
 * 없으면 거부하기도 하지만, 그보다 먼저 "고르기 전에는 아무것도 안 보여준다"가 이 기능의
 * 계약이다(계획 2단계). 훅을 쓰는 쪽은 각자의 일시정지 조건 앞에 이 값을 결합한다.
 *
 * 서버 스냅숏이 항상 미확정이라, 서버가 그린 화면과 첫 클라이언트 렌더가 어긋나지 않는다.
 * 다른 탭에서 값을 바꾸면 storage 이벤트를 통해 여기로 전달된다(3단계에서 잇는다).
 */
export function useGenderSetting(): GenderSetting {
  return useSyncExternalStore(
    subscribeGender,
    getGenderSnapshot,
    getGenderServerSnapshot,
  );
}

/** 성별이 정해졌는가 — 요청을 내보내도 되는가와 같은 뜻이다. */
export function useGenderReady(): boolean {
  return useGenderSetting() !== null;
}
