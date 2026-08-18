// View: LLM이 "이해한 조건"을 물방울 유리 토큰으로 표시(읽기 전용).
import type { ChipKind, IntentChip } from "@/features/search/domain/query-intent-chips";
import { COLOR_HEX } from "@/shared/color-swatch";

const KIND_LABEL: Partial<Record<ChipKind, string>> = {
  brand: "브랜드",
  gender: "성별",
  size: "사이즈",
  price: "가격",
  color: "색상",
  pattern: "패턴",
  material: "소재",
  fit: "핏",
  wear: "착용감",
  review: "리뷰",
  exclude: "제외",
  baseColor: "바탕",
  printColor: "프린트",
  placement: "위치",
  graphic: "도안",
};

export default function IntentChips({ chips }: { chips: IntentChip[] }) {
  if (chips.length === 0) {
    return (
      <p className="tf-parsed__hint">
        조건을 못 알아들었어요. 색·핏·소재·사이즈·가격을 넣어 다시 적어보세요.
      </p>
    );
  }
  return (
    <>
      {chips.map((c, i) => {
        const swatch =
          c.kind === "color" || c.kind === "baseColor" || c.kind === "printColor"
            ? COLOR_HEX[c.label]
            : undefined;
        const kindLabel = KIND_LABEL[c.kind];
        return (
          <span
            key={i}
            className="tf-token"
            style={{ "--i": i } as React.CSSProperties}
          >
            {swatch && (
              <span className="tf-swatch" style={{ background: swatch }} aria-hidden />
            )}
            {kindLabel && <i>{kindLabel}</i>}
            {c.label}
          </span>
        );
      })}
    </>
  );
}
