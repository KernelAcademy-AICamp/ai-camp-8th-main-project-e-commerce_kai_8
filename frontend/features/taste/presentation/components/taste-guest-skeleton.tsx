/**
 * 비회원에게 보이는 취향 자리 — 시안 사이드바 비회원 모드의 `guest-skel` 윗부분.
 *
 * 로그인해야 보이는 것이므로 **내용 대신 자리만** 남긴다. 아무것도 안 그리면
 * 프로필이 텅 비어 "무언가 잘못됐다"로 읽히고, 로그인 안내가 무엇을 가리는지도
 * 알 수 없다.
 *
 * 불러오는 중의 뼈대(`TasteCardSkeleton`)와 다르다. 저쪽은 곧 도착할 내용의
 * 자리를 정확히 잡아야 하지만, 여기는 **도착하지 않는다** — 그래서 시안대로
 * 카드 테두리 없이 납작한 막대만 둔다.
 */
export function TasteGuestSkeleton() {
  return (
    <div aria-hidden className="animate-pulse">
      <div className="mt-6 mb-4 h-3.5 w-16 rounded-lg bg-skel-1" />
      <div className="mb-7 flex flex-col gap-3.5">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-2.5 rounded-lg bg-skel-1" />
        ))}
      </div>
    </div>
  );
}
