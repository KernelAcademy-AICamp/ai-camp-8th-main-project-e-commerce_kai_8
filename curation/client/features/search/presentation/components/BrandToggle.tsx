"use client";

// 홈 로고 = LLM 레이어 토글(내부 실험, 스펙: 2026-08-07-llm-toggle-logo-design.md).
// 누르면 URL에 llm=off를 붙였다 떼며, 라벨이 "티:파운드(without llm)"로 바뀐다.
import { useRouter, useSearchParams } from "next/navigation";

export default function BrandToggle() {
  const router = useRouter();
  const params = useSearchParams();
  const llmOff = params.get("llm") === "off";

  return (
    <button
      type="button"
      className="tf-nav__brand"
      style={{ background: "none", border: "none", cursor: "pointer" }}
      aria-pressed={llmOff}
      title="검색 LLM 레이어 토글 (내부 실험)"
      onClick={() => {
        router.replace(llmOff ? "/" : "/?llm=off");
      }}
    >
      티:파운드{llmOff ? "(without llm)" : ""}
    </button>
  );
}
