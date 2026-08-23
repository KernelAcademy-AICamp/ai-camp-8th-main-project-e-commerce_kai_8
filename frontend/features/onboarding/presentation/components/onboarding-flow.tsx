"use client";

import { useGoogleSignIn } from "@/features/auth/presentation/view-model/use-google-sign-in";
import { useOnboardingFlow } from "@/features/onboarding/presentation/view-model/use-onboarding-flow";

import { OnboardingGenderScreen } from "./onboarding-gender-screen";
import { OnboardingPickScreen } from "./onboarding-pick-screen";
import { OnboardingSignupScreen } from "./onboarding-signup-screen";

/**
 * 온보딩 화면들. 게이트가 "온보딩을 보여줄까"를 정하고, 여기가 "어느 화면"을 정한다.
 *
 * 별도 route가 아니라 홈 안의 상태다 — 히스토리 항목을 새로 쌓지 않으므로
 * 마친 뒤 뒤로가기가 이 화면으로 돌아오지 않는다(성별 게이트와 같은 이유).
 */
export function OnboardingFlow() {
  const flow = useOnboardingFlow();
  const signIn = useGoogleSignIn();

  if (flow.screen === "gender") {
    return (
      <OnboardingGenderScreen
        stepIndex={flow.stepIndex}
        stepCount={flow.stepCount}
        onChoose={flow.chooseGender}
      />
    );
  }

  if (flow.screen === "picks") {
    return (
      <OnboardingPickScreen
        stepIndex={flow.stepIndex}
        stepCount={flow.stepCount}
        candidates={flow.candidates}
        onDead={flow.markDead}
        loading={flow.loadingCandidates}
        failed={flow.candidatesFailed}
        onRetry={flow.retryCandidates}
        tooFew={flow.tooFewCandidates}
        selected={flow.selected}
        onToggle={flow.toggle}
        minPicks={flow.minPicks}
        canGoNext={flow.canGoNext}
        onBack={flow.goBack}
        onNext={flow.goNext}
        saving={flow.saveState === "saving"}
        saveFailed={flow.saveState === "failed"}
      />
    );
  }

  return (
    <OnboardingSignupScreen
      stepIndex={flow.stepIndex}
      stepCount={flow.stepCount}
      pickCount={flow.selected.length}
      busy={signIn.busy}
      failed={signIn.failed}
      onSignIn={signIn.signIn}
      onBack={flow.goBack}
    />
  );
}
