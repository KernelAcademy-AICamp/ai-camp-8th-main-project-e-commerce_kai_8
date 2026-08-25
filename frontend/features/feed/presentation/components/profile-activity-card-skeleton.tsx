/**
 * `ProfileActivityCard`의 뼈대 — 로그인 판정이 끝나기 전(마이페이지 이동
 * 중, `app/my/loading.tsx`)에 쓴다(2026-08-25).
 *
 * 완성된 카드와 같은 배치(카드 테두리·최근 본 제품 타일 5장·활동 요약
 * 3칸)로 자리를 잡는다 — 도착 후 내용이 그 자리에 그대로 들어와 화면이
 * 튀지 않는다. 비회원 자리(카드 테두리 없음)와는 다르다 — 여기는 곧
 * 내용이 도착할 것을 안다.
 */
export function ProfileActivityCardSkeleton() {
  return (
    <section
      aria-label="불러오는 중"
      className="mt-10 animate-pulse rounded-2xl border border-line p-5"
    >
      <div className="mb-[11px] h-3.5 w-[88px] rounded-lg bg-skel-1" />
      <div className="flex gap-[9px] overflow-hidden">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-[58px] w-[58px] shrink-0 rounded-xl bg-skel-1" />
        ))}
      </div>

      <div className="mt-5 grid grid-cols-3 border-t border-line pt-3.5">
        {[0, 1, 2].map((i) => (
          <div key={i} className={`text-center ${i > 0 ? "border-l border-line" : ""}`}>
            <div className="mx-auto h-[19px] w-8 rounded bg-skel-1" />
            <div className="mx-auto mt-1.5 h-[10.5px] w-14 rounded bg-skel-1" />
          </div>
        ))}
      </div>
    </section>
  );
}
