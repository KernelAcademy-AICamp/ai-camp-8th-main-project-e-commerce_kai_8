import Image from "next/image";

/**
 * 폴더 표지 — 시안 `.fcover`.
 *
 * 겹쳐 쌓인 카드 세 장이다. **뒤 두 장은 사진이 아니라 톤 카드**이고(시안
 * `.fc-b1`·`.fc-b2`), 앞 장만 대표 사진을 담는다. 이름과 개수는 표지 **위**에
 * 얹히며, 사진이 있으면 아래쪽 흐린 띠를 깔아 흰 글씨로 읽게 한다.
 *
 * 빈 폴더는 뒤 카드 없이 톤 카드 한 장만 둔다 — "비어 있음"이 모양으로 보이게.
 *
 * @param sizePx 정사각형 한 변. 주지 않으면 부모 폭을 채운다(정사각 비율).
 */
export function FolderCover({
  thumb,
  name,
  count,
  sizePx,
}: {
  /** 대표 사진. 없으면 빈 폴더로 그린다 */
  thumb?: string;
  name: string;
  count: number;
  sizePx?: number;
}) {
  const hasPhoto = thumb !== undefined && thumb !== "";
  // 그리드 타일(부모 폭)은 최대 반 화면 폭이다
  const sizes =
    sizePx === undefined ? "(max-width: 448px) 50vw, 224px" : `${String(sizePx)}px`;

  return (
    <div
      className={`relative shrink-0 ${sizePx === undefined ? "aspect-square w-full" : ""}`}
      style={sizePx === undefined ? undefined : { width: sizePx, height: sizePx }}
    >
      {hasPhoto && (
        <>
          <span aria-hidden className="fcard fc-b1" />
          <span aria-hidden className="fcard fc-b2" />
        </>
      )}

      <span className="fcard fmain">
        {hasPhoto && (
          <>
            <Image
              src={thumb}
              alt=""
              fill
              sizes={sizes}
              className="object-cover"
              aria-hidden
            />
            <span aria-hidden className="fscrim" />
          </>
        )}
      </span>

      {/* 이름·개수는 표지 위에 얹힌다. 사진이 있으면 흰 글씨로 바뀐다. */}
      <span className="absolute right-3 bottom-[13px] left-[15px] z-[1]">
        <strong
          className={`block truncate text-[14px] font-extrabold ${
            hasPhoto ? "text-white" : "text-ink"
          }`}
        >
          {name}
        </strong>
        <span
          className={`mt-0.5 block text-[10.5px] font-[650] ${
            hasPhoto ? "text-white/[0.78]" : "text-ink-soft"
          }`}
        >
          {count}개
        </span>
      </span>
    </div>
  );
}
