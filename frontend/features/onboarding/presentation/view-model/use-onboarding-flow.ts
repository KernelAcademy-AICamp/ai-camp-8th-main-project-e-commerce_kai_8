"use client";

import { useCallback, useEffect, useState } from "react";

import { fetchOnboardingCandidates } from "@/features/onboarding/data/candidates-api";
import { reportReach } from "@/features/onboarding/data/reach-api";
import type { OnboardingCandidate } from "@/features/onboarding/domain/candidate";
import { clearReachMark, readReachMark } from "@/features/onboarding/domain/reach-mark";
import { type GenderChoice, setGenderSetting } from "@/shared/gender/gender-setting";
import { putAccountOnboarding } from "@/shared/onboarding/account-onboarding-api";
import {
  canProceed,
  MIN_PICKS,
  type OnboardingPick,
} from "@/shared/onboarding/onboarding-pick";
import {
  clearFlowProgress,
  type FlowScreen,
  readFlowProgress,
  writeFlowProgress,
} from "@/shared/onboarding/onboarding-progress-store";
import { markDone, setPicks } from "@/shared/onboarding/onboarding-store";
import { useSignedIn } from "@/shared/supabase/use-signed-in";

export type { FlowScreen };

export type SaveState = "idle" | "saving" | "failed";

export interface OnboardingFlowViewModel {
  screen: FlowScreen;

  gender: GenderChoice | null;
  chooseGender: (gender: GenderChoice) => void;

  /** **보이는 카드만.** 이미지가 죽은 카드는 빠져 있다 — 화면 위치와 최소 개수 판정이
   *  같은 목록에서 나와야 한다. */
  candidates: OnboardingCandidate[];
  /** 이미지가 죽은 카드를 알린다. 부모가 목록에서 빼고 위치를 다시 매긴다 */
  markDead: (goodsNo: number) => void;
  /** 후보를 아직 못 받았다 */
  loadingCandidates: boolean;
  candidatesFailed: boolean;
  retryCandidates: () => void;
  /**
   * **보이는 카드**가 최소 개수보다 적다 — 사람이 후보를 갈아야 한다는 신호다.
   * 서버가 준 개수가 아니라 **실제로 그려진 개수**를 센다. CDN 404는 클라이언트만
   * 알기 때문에, 서버 응답만 보면 아무것도 못 고르는 막다른 화면이 생긴다.
   */
  tooFewCandidates: boolean;

  /** 고른 상품 번호 (고른 순서대로) */
  selected: number[];
  toggle: (goodsNo: number) => void;
  minPicks: number;
  canGoNext: boolean;

  goBack: () => void;
  goNext: () => void;

  saveState: SaveState;
}

/**
 * 온보딩 세 화면(또는 두 화면)의 상태.
 *
 * **순서가 둘이다**(계획 §1-0).
 * - 새 기기: 성별 → 옷 → 로그인 (3화면). 고른 것은 기기에 두었다가 로그인 승계로 옮긴다.
 * - 로그인한 상태: 성별 → 옷 (2화면). 이미 인증돼 있어 바로 계정에 저장한다.
 *
 * **기기·계정에 이미 성별이 있어도 성별 화면부터 시작한다** — 불완전 계정을 성별부터
 * 다시 시작시키는 규칙이 그렇다(§1-0). 반쪽 상태를 이어 붙이는 분기가 늘수록 검증할
 * 조합이 곱으로 늘기 때문이다.
 *
 * 로그인한 경로에는 **신원 전환 자체가 없어 승계가 돌지 않는다.** 승계가 깨져 있어도
 * 이 경로로는 안 잡히므로, 승계는 새 기기 경로로 확인해야 한다.
 */
export function useOnboardingFlow(): OnboardingFlowViewModel {
  const signedIn = useSignedIn();

  // **어디까지 갔는지 이 탭에 적어 둔 것을 그대로 이어 받는다.** 처리방침을 열었다가
  // 돌아오면 온보딩이 새로 마운트되는데, 기억이 없으면 1단계부터 다시 시작한다.
  const [restored] = useState(readFlowProgress);
  const [screen, setScreen] = useState<FlowScreen>(restored.screen);
  const [gender, setGender] = useState<GenderChoice | null>(restored.gender);
  const [received, setReceived] = useState<OnboardingCandidate[]>([]);
  const [version, setVersion] = useState<string | null>(null);
  const [dead, setDead] = useState<number[]>([]);
  // **지금 화면에 도달했다고 한 번 보낸다** (O-42). 어디서 떨어지는지 세는 것이
  // 목적이라, 화면이 바뀔 때마다 보낸다. 같은 표식으로 같은 단계를 두 번 보내도
  // 서버가 한 번으로 센다 — 뒤로 갔다 오는 것이 전환율을 왜곡하지 않게 한다.
  //
  // 실패는 조용히 넘어간다. 도달을 못 센 것보다 온보딩이 멈추는 것이 훨씬 나쁘다.
  useEffect(() => {
    if (typeof window === "undefined") return;
    void reportReach(
      readReachMark(window.localStorage, () => crypto.randomUUID()),
      screen === "gender" ? "gender" : screen === "picks" ? "picks" : "signup",
    );
  }, [screen]);

  // 이어 받은 성별이 있으면 아래 effect가 곧바로 후보를 부른다 — 그 사이에 CTA가
  // 열려 있으면 화면에 없는 카드로 저장이 나간다. 처음부터 불러오는 중으로 둔다.
  const [loadingCandidates, setLoading] = useState(restored.gender !== null);
  const [candidatesFailed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // 고른 순서를 그대로 들고 있는다 — `pick_seq`가 여기서 나온다.
  const [selected, setSelected] = useState<number[]>(restored.selected);
  const [saveState, setSaveState] = useState<SaveState>("idle");

  const chooseGender = useCallback((next: GenderChoice) => {
    // 기기에는 곧바로 적어 둔다 — 피드·후보 조회가 성별 없이는 돌지 않는다.
    // **계정에는 여기서 올리지 않는다.** 마지막 저장(c_onboarding_put)이 성별과
    // 선택을 한 트랜잭션에서 함께 확정한다 — 반쪽 상태가 생기지 않는다.
    setGenderSetting(next);
    setGender(next);
    // 로딩은 **여기서** 켠다. 아래 effect 안에서 켜면 렌더가 한 번 더 돌고
    // lint 규칙(set-state-in-effect)에도 걸린다 — effect는 부르기만 한다.
    setLoading(true);
    setFailed(false);
    // ⚠️ **같은 성별을 다시 골라도 요청을 새로 낸다.** 뒤로 갔다가 같은 쪽을 다시
    // 고르면 `gender`가 안 바뀌어 아래 effect가 돌지 않는데, 로딩은 켜져 있으므로
    // **끝나지 않는 스켈레톤**이 된다(재검증 ⑤). 이 번호가 바뀌면 항상 다시 받는다.
    setAttempt((n) => n + 1);
    // 성별을 바꾸면 앞의 옷 선택을 재사용하지 않는다(계획 §1-2).
    setSelected([]);
    setScreen("picks");
  }, []);

  // 성별이 정해지면 후보를 받는다. 성별이 바뀌면 다시 받는다.
  useEffect(() => {
    if (gender === null) return;
    let active = true;
    fetchOnboardingCandidates(gender).then(
      (page) => {
        if (!active) return;
        setReceived(page.candidates);
        // **사용자가 본 판을 그대로 들고 있다가 저장에 실려 보낸다.** 저장 시점에
        // 다시 읽으면 화면을 보는 도중 판이 바뀌었을 때 보지 않은 판으로 기록된다.
        setVersion(page.version);
        setDead([]);
        setLoading(false);
      },
      () => {
        if (!active) return;
        setFailed(true);
        setLoading(false);
      },
    );
    return () => {
      active = false;
    };
  }, [gender, attempt]);

  const retryCandidates = useCallback(() => {
    setLoading(true);
    setFailed(false);
    setAttempt((n) => n + 1);
  }, []);

  // 이미지가 죽은 카드는 **목록에서 뺀다.** 자식이 스스로 숨기면 부모는 여전히 12장으로
  // 알고 있어, ① 최소 개수 판정이 틀리고 ② 뒤 카드의 저장 위치가 실제 화면과 어긋난다.
  const markDead = useCallback((goodsNo: number) => {
    setDead((current) => (current.includes(goodsNo) ? current : [...current, goodsNo]));
    // 죽은 카드가 이미 골라져 있었으면 선택에서도 뺀다 — 안 빼면 보이지 않는 것을
    // 고른 상태로 저장한다.
    setSelected((current) => current.filter((no) => no !== goodsNo));
  }, []);

  const candidates = received.filter((c) => !dead.includes(c.goodsNo));

  // 화면·성별·선택이 바뀔 때마다 적어 둔다. 저장소는 바깥 세계이므로 effect가 맞다.
  useEffect(() => {
    writeFlowProgress({ screen, gender, selected });
  }, [screen, gender, selected]);

  const toggle = useCallback((goodsNo: number) => {
    setSelected((current) =>
      current.includes(goodsNo)
        ? current.filter((no) => no !== goodsNo)
        : [...current, goodsNo],
    );
  }, []);

  // **화면 위치는 저장 시점의 보이는 목록에서 센다.** 클릭 시점에 적어 두면 그 뒤에
  // 앞 카드가 죽었을 때 남은 값이 실제 화면과 어긋난다 — 위치 편향을 보려고 남기는
  // 값이 오염되면 남기는 의미가 없다(교차 리뷰 ⑦). 서버도 위치의 유일성과 범위를
  // 검사하므로 여기서 어긋나면 저장이 거부된다.
  const picks: OnboardingPick[] = selected.map((goodsNo, index) => ({
    goodsNo,
    cardPos: candidates.findIndex((c) => c.goodsNo === goodsNo),
    pickSeq: index,
  }));

  const goBack = useCallback(() => {
    setScreen((current) => (current === "signup" ? "picks" : "gender"));
    setSaveState("idle");
  }, []);

  const goNext = useCallback(() => {
    if (!canProceed(picks) || gender === null || version === null) return;
    if (signedIn !== "in") {
      // 새 기기 경로 — 기기에 담아 두고 가입 화면으로. 로그인하면 승계가 옮긴다.
      // **본 판을 함께 담는다** — 승계가 그것을 그대로 서버에 돌려보낸다.
      setPicks(version, picks);
      setScreen("signup");
      return;
    }
    // 로그인한 경로 — 바로 계정에 저장한다. **저장이 확인되기 전에는 홈을 열지 않는다.**
    setSaveState("saving");
    putAccountOnboarding(gender, version, picks).then(
      (confirmed) => {
        // 보낸 값이 아니라 **서버가 확정한 값**을 설치한다(재검증 ①).
        setGenderSetting(confirmed.gender);
        setPicks(confirmed.candidatesVersion, confirmed.picks);
        // 계정에 담긴 것을 확인한 뒤에만 기기 표식을 남긴다.
        markDone();
        // 진행 표식을 지운다 (O-42). **완료를 보고하지는 않는다** — 이 경로엔 신원
        // 전환이 없어 표식이 그대로 남는데, 남기면 나중에 다시 온보딩을 열었을 때
        // 옛 표식이 재사용돼 도달이 안 세어진다.
        clearReachMark(window.localStorage);
        // 마쳤으므로 진행 기록을 지운다 — 남기면 다음 방문이 중간 화면에서 열린다.
        clearFlowProgress();
        setSaveState("idle");
        // 게이트가 계정 상태를 다시 읽게 한다. 화면을 직접 옮기지 않는 이유는
        // 진입 판정이 한 곳(게이트)에만 있어야 하기 때문이다.
        window.location.reload();
      },
      () => {
        setSaveState("failed");
      },
    );
  }, [picks, gender, signedIn, version]);

  const tooFewCandidates =
    !loadingCandidates &&
    !candidatesFailed &&
    gender !== null &&
    candidates.length < MIN_PICKS;

  return {
    screen,
    gender,
    chooseGender,
    candidates,
    markDead,
    loadingCandidates,
    candidatesFailed,
    retryCandidates,
    tooFewCandidates,
    selected,
    toggle,
    minPicks: MIN_PICKS,
    canGoNext: canProceed(picks),
    goBack,
    goNext,
    saveState,
  };
}
