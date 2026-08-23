"use client";

import { useCallback, useEffect, useState } from "react";

import { fetchOnboardingCandidates } from "@/features/onboarding/data/candidates-api";
import type { OnboardingCandidate } from "@/features/onboarding/domain/candidate";
import { type GenderChoice, setGenderSetting } from "@/shared/gender/gender-setting";
import { putAccountOnboarding } from "@/shared/onboarding/account-onboarding-api";
import {
  canProceed,
  MIN_PICKS,
  type OnboardingPick,
} from "@/shared/onboarding/onboarding-pick";
import { markDone, setPicks } from "@/shared/onboarding/onboarding-store";
import { useSignedIn } from "@/shared/supabase/use-signed-in";

/** 온보딩 안의 화면. 게이트가 "온보딩을 보여줄까"를 정하고, 여기가 "어느 화면"을 정한다. */
export type FlowScreen = "gender" | "picks" | "signup";

export type SaveState = "idle" | "saving" | "failed";

export interface OnboardingFlowViewModel {
  screen: FlowScreen;
  /** 진행 표시. 경로마다 화면 수가 다르다 — 없는 단계를 세지 않는다(계획 §1-0). */
  stepIndex: number;
  stepCount: number;

  gender: GenderChoice | null;
  chooseGender: (gender: GenderChoice) => void;

  candidates: OnboardingCandidate[];
  /** 후보를 아직 못 받았다 */
  loadingCandidates: boolean;
  candidatesFailed: boolean;
  retryCandidates: () => void;
  /** 서버가 자격 있는 후보를 최소 개수만큼도 주지 못했다 — 사람이 후보를 갈아야 한다 */
  tooFewCandidates: boolean;

  /** 고른 상품 번호 (고른 순서대로) */
  selected: number[];
  toggle: (goodsNo: number, cardPos: number) => void;
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

  const [screen, setScreen] = useState<FlowScreen>("gender");
  const [gender, setGender] = useState<GenderChoice | null>(null);
  const [candidates, setCandidates] = useState<OnboardingCandidate[]>([]);
  const [loadingCandidates, setLoading] = useState(false);
  const [candidatesFailed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // 고른 순서를 그대로 들고 있는다 — `pick_seq`가 여기서 나온다.
  const [selected, setSelected] = useState<number[]>([]);
  const [positions, setPositions] = useState<Record<number, number>>({});
  const [saveState, setSaveState] = useState<SaveState>("idle");

  // 로그인한 사람은 로그인 화면이 없다 — 없는 단계를 세지 않는다.
  const stepCount = signedIn === "in" ? 2 : 3;
  const stepIndex = screen === "gender" ? 1 : screen === "picks" ? 2 : 3;

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
    // 성별을 바꾸면 앞의 옷 선택을 재사용하지 않는다(계획 §1-2).
    setSelected([]);
    setPositions({});
    setScreen("picks");
  }, []);

  // 성별이 정해지면 후보를 받는다. 성별이 바뀌면 다시 받는다.
  useEffect(() => {
    if (gender === null) return;
    let active = true;
    fetchOnboardingCandidates(gender).then(
      (list) => {
        if (!active) return;
        setCandidates(list);
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

  const toggle = useCallback((goodsNo: number, cardPos: number) => {
    setSelected((current) =>
      current.includes(goodsNo)
        ? current.filter((no) => no !== goodsNo)
        : [...current, goodsNo],
    );
    setPositions((current) => ({ ...current, [goodsNo]: cardPos }));
  }, []);

  const picks: OnboardingPick[] = selected.map((goodsNo, index) => ({
    goodsNo,
    cardPos: positions[goodsNo] ?? index,
    pickSeq: index,
  }));

  const goBack = useCallback(() => {
    setScreen((current) => (current === "signup" ? "picks" : "gender"));
    setSaveState("idle");
  }, []);

  const goNext = useCallback(() => {
    if (!canProceed(picks) || gender === null) return;
    if (signedIn !== "in") {
      // 새 기기 경로 — 기기에 담아 두고 가입 화면으로. 로그인하면 승계가 옮긴다.
      setPicks(picks);
      setScreen("signup");
      return;
    }
    // 로그인한 경로 — 바로 계정에 저장한다. **저장이 확인되기 전에는 홈을 열지 않는다.**
    setSaveState("saving");
    putAccountOnboarding(gender, picks).then(
      (saved) => {
        setPicks(saved);
        // 계정에 담긴 것을 확인한 뒤에만 기기 표식을 남긴다.
        markDone();
        setSaveState("idle");
        // 게이트가 계정 상태를 다시 읽게 한다. 화면을 직접 옮기지 않는 이유는
        // 진입 판정이 한 곳(게이트)에만 있어야 하기 때문이다.
        window.location.reload();
      },
      () => {
        setSaveState("failed");
      },
    );
  }, [picks, gender, signedIn]);

  const tooFewCandidates =
    !loadingCandidates &&
    !candidatesFailed &&
    gender !== null &&
    candidates.length < MIN_PICKS;

  return {
    screen,
    stepIndex,
    stepCount,
    gender,
    chooseGender,
    candidates,
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
