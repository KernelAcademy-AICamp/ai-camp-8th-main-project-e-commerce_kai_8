"use client";

import { useEffect, useRef } from "react";

/* 데이터 절약·모션 최소화를 켠 환경에서만 4.6MB 영상을 받지 않고
   포스터만 보여준다. 모바일이라도 그런 설정이 없으면 영상을 재생한다.
   마운트 후 환경이 바뀌어도(reduced-motion 토글) 다시 판정한다. */
export default function HeroVideo() {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const nav = navigator as Navigator & { connection?: { saveData?: boolean } };

    const apply = () => {
      const blocked = reduceMotion.matches || (nav.connection?.saveData ?? false);
      if (blocked) {
        if (video.getAttribute("src")) {
          video.pause();
          video.removeAttribute("src"); // 영상 다운로드 자체를 건너뛰고 포스터만 유지
          video.load();
        }
      } else if (!video.getAttribute("src")) {
        video.src = "/hero-loop.mp4";
      }
    };

    apply();
    reduceMotion.addEventListener("change", apply);
    return () => {
      reduceMotion.removeEventListener("change", apply);
    };
  }, []);

  return (
    <video
      ref={ref}
      className="tf-home__video"
      poster="/hero-poster.jpg"
      preload="none"
      autoPlay
      muted
      loop
      playsInline
      aria-hidden="true"
    />
  );
}
