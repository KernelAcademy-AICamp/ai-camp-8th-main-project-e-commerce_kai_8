"use client";

import type { AnimationItem } from "lottie-web";
import { useEffect, useRef, useState } from "react";

import { ArrowUpIcon } from "@/shared/icons";

/** 재생 구간과 속도 전환 지점 — 시안 `startSaveAnim`의 값 그대로 */
const SEGMENT: [number, number] = [52, 222];
/** 티셔츠가 접혀 들어오는 도입부까지는 원속도, 이후는 빠르게 */
const SPEED_UP_AT = 64;
const SPEED_UP_TO = 1.7;
/** 체크가 안착한 뒤부터 알약 배경·라벨을 넘긴다 (확 바뀌지 않게) */
const HANDOFF_AT = 150;

interface DetailDockProps {
  /** 이 상품이 저장되어 있는가 */
  saved: boolean;
  /** 맨 위 근처인가 — 아니면 원버튼(맨 위로)으로 접힌다 */
  expanded: boolean;
  /** 저장 버튼을 눌렀을 때. 로그인·폴더 시트 판단은 부모가 한다 */
  onSave: () => void;
  /** 저장된 것을 다시 눌렀을 때 — 해제 */
  onUnsave: () => void;
  /** 접힌 원버튼을 눌렀을 때 */
  onToTop: () => void;
}

function prefersReducedMotion() {
  if (typeof matchMedia === "undefined") return false;
  return matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * 상세 하단 dock — 시안 `.ddock`.
 *
 * 맨 위에서는 **저장 알약**, 스크롤을 내리면 **원버튼(맨 위로)**으로 접힌다.
 * 접힌 원은 저장 알약과 같은 슬레이트라, 접힘이 색이 바뀌는 게 아니라
 * 알약이 원으로 줄어드는 것처럼 보인다.
 *
 * 저장이 성사되면 버튼 위로 Lottie(티셔츠가 접혀 들어와 체크로)가 한 번
 * 재생되고, 재생 도중에 알약이 눌린 모습으로 넘어간다. 애니메이션 파일은
 * 이 화면에 들어왔을 때만 내려받는다 — 홈 첫 화면 비용을 늘리지 않는다.
 */
export function DetailDock({
  saved,
  expanded,
  onSave,
  onUnsave,
  onToTop,
}: DetailDockProps) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const animRef = useRef<AnimationItem | null>(null);
  const [playing, setPlaying] = useState(false);
  // 알약이 "저장됨" 모습인가. 재생 중에는 중간(HANDOFF_AT)에 넘어가므로
  // saved와 따로 둔다.
  const [settled, setSettled] = useState(saved);
  // 직전 saved 값 — 저장으로 **바뀐 순간**에만 재생한다
  const wasSavedRef = useRef(saved);

  // 애니메이션 준비 (이 화면에 있는 동안만)
  //
  // ⚠️ **취소 표시는 이 실행에만 속한 값이어야 한다.** ref에 두면 다음 실행이
  // 그 값을 되돌려, 이미 취소된 앞 실행의 로드가 살아나 애니메이션이 **둘** 만들어진다.
  // 개발 모드에서 React가 효과를 두 번 돌릴 때 실제로 그렇게 됐다 — 화면에 보이는
  // 것은 재생되지 않는 쪽이고, 재생되는 쪽은 뒤에 붙어 크기가 어긋난 채 잘려 보였다.
  useEffect(() => {
    let cancelled = false;
    // 직접 읽으면 타입 분석이 "항상 false"로 좁혀 검사에 걸린다 — 함수로 감싸 읽는다
    const isCancelled = () => cancelled;
    let created: AnimationItem | null = null;

    const load = async () => {
      const container = boxRef.current;
      if (!container || prefersReducedMotion()) return;
      const [{ default: lottie }, response] = await Promise.all([
        import("lottie-web"),
        fetch("/animations/save.json"),
      ]);
      if (isCancelled() || !response.ok) return;
      const animationData: unknown = await response.json();
      if (isCancelled()) return;
      container.replaceChildren(); // 남아 있을 수 있는 앞선 그림을 비운다
      created = lottie.loadAnimation({
        container,
        renderer: "svg",
        loop: false,
        autoplay: false,
        animationData,
      });
      animRef.current = created;
    };
    void load();

    return () => {
      cancelled = true;
      created?.destroy();
      if (animRef.current === created) animRef.current = null;
    };
  }, []);

  // 저장 상태가 바뀐 순간을 잡아 재생하거나 되돌린다
  useEffect(() => {
    const was = wasSavedRef.current;
    wasSavedRef.current = saved;
    if (was === saved) return;

    const anim = animRef.current;

    if (!saved) {
      anim?.stop();
      const frame = requestAnimationFrame(() => {
        setPlaying(false);
        setSettled(false);
      });
      return () => {
        cancelAnimationFrame(frame);
      };
    }

    if (!anim) {
      // 애니메이션이 없으면(움직임 줄이기·로드 실패) 연출 없이 저장됨 모습으로.
      // 다음 프레임으로 미룬다 — 효과 안에서 곧바로 바꾸면 렌더가 한 번 더 돈다.
      const frame = requestAnimationFrame(() => {
        setSettled(true);
      });
      return () => {
        cancelAnimationFrame(frame);
      };
    }

    let shown = false;
    let spedUp = false;
    let handed = false;
    const onFrame = () => {
      // 그림이 실제로 그려지는 첫 프레임에 상자를 켠다. 프레임 콜백은 재생기가
      // 부르는 것이라 효과 안에서 상태를 바꾸는 것과 다르고, 무엇보다 도입부가
      // 비어 보이지 않는다 — 미리 켜면 아직 아무것도 안 그린 구간이 보인다.
      if (!shown) {
        shown = true;
        setPlaying(true);
      }
      if (!spedUp && anim.currentFrame >= SPEED_UP_AT) {
        spedUp = true;
        anim.setSpeed(SPEED_UP_TO);
      }
      if (!handed && anim.currentFrame >= HANDOFF_AT) {
        handed = true;
        setSettled(true); // 알약이 먼저 넘어가고
        setPlaying(false); // 티셔츠·체크는 사라진다
      }
    };
    const onComplete = () => {
      setPlaying(false);
      setSettled(true);
    };
    anim.addEventListener("enterFrame", onFrame);
    anim.addEventListener("complete", onComplete);

    anim.setSpeed(1);
    anim.resetSegments(true); // 절대 프레임 좌표 복원 (점프 방지)
    anim.playSegments([SEGMENT], true);

    return () => {
      // ⚠️ **파괴된 것에 대고 부르면 던진다.** 정리는 선언 순서대로 돌아서, 화면을
      // 떠날 때 위쪽 로드 효과가 먼저 애니메이션을 없앤다. 그때 animRef도 비워지므로
      // 그것으로 살아 있는지 가른다. 파괴가 리스너를 이미 걷어가니 건너뛰어도 된다.
      if (animRef.current !== anim) return;
      anim.removeEventListener("enterFrame", onFrame);
      anim.removeEventListener("complete", onComplete);
    };
  }, [saved]);

  return (
    <div className="dock-in absolute bottom-[26px] left-1/2 z-[34] -translate-x-1/2">
      <div
        className={`relative h-[58px] rounded-full transition-[width,background-color,box-shadow] duration-[340ms] ease-spring ${
          expanded
            ? "w-[210px] overflow-visible bg-transparent"
            : "w-[58px] overflow-hidden bg-slate shadow-[0_4px_12px_rgb(30_38_55/0.32)]"
        }`}
      >
        {/* 펼친 모습 — 보드 없이 저장 알약만 떠 있다 */}
        <div
          className={`absolute top-0 left-1/2 flex h-full w-[210px] -translate-x-1/2 items-center gap-[14px] px-3 transition-opacity ${
            expanded
              ? "opacity-100 delay-[90ms] duration-[220ms]"
              : "pointer-events-none opacity-0 duration-150"
          }`}
        >
          <button
            type="button"
            aria-label={saved ? "저장됨" : "저장"}
            aria-pressed={saved}
            onClick={saved ? onUnsave : onSave}
            className={`relative h-11 flex-1 cursor-pointer overflow-hidden rounded-full text-[14.5px] font-extrabold tracking-[0.02em] transition-[background-color,color,box-shadow] duration-[380ms] ${
              settled
                ? "bg-app text-slate neo-in"
                : "bg-slate text-on-slate shadow-[0_5px_14px_rgb(30_38_55/0.35)] active:shadow-[inset_3px_3px_7px_rgb(0_0_0/0.2)]"
            }`}
          >
            <span
              className={`relative z-[1] transition-opacity duration-[220ms] ${
                playing ? "opacity-0" : "opacity-100"
              }`}
            >
              {settled ? "저장됨 ✓" : "저장"}
            </span>
            {/* 티셔츠 → 체크. 재생이 끝나갈 때 알약에 자리를 넘기며 사라진다 */}
            <span
              ref={boxRef}
              aria-hidden
              className={`pointer-events-none absolute inset-0 transition-opacity duration-[320ms] [&>svg]:block [&>svg]:h-full [&>svg]:w-full ${
                playing ? "opacity-100" : "opacity-0"
              }`}
            />
          </button>
        </div>

        {/* 접힌 모습 — 슬레이트 원 위 밝은 화살표 (맨 위로 전용) */}
        <button
          type="button"
          aria-label="맨 위로"
          onClick={onToTop}
          className={`absolute inset-0 flex cursor-pointer items-center justify-center text-on-slate transition-opacity duration-[160ms] ${
            expanded ? "pointer-events-none opacity-0" : "opacity-100"
          }`}
        >
          <ArrowUpIcon size={20} />
        </button>
      </div>
    </div>
  );
}
