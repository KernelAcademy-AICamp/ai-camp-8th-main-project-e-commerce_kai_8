import Image from "next/image";

/**
 * 폴더에 쌓인 사진 — 최근 찜 썸네일이 살짝 어긋나게 겹친 모양.
 *
 * 맨 위 장이 제일 크고, 뒤 장들이 좌우로 비껴 보인다. thumbs가 비면 빈 판만
 * 그린다(빈 폴더). 그리드 타일과 시트 행이 크기만 달리해 같이 쓴다.
 *
 * @param sizePx 정사각형 한 변. 주지 않으면 부모 폭을 채운다(정사각 비율).
 */
export function FolderThumbs({
  thumbs,
  sizePx,
}: {
  thumbs: string[];
  sizePx?: number;
}) {
  // 그리드 타일(부모 폭)은 최대 반 화면 폭이다
  const sizes =
    sizePx === undefined ? "(max-width: 448px) 50vw, 224px" : `${String(sizePx)}px`;

  return (
    <div
      aria-hidden
      className={`relative shrink-0 ${sizePx === undefined ? "aspect-square w-full" : ""}`}
      style={sizePx === undefined ? undefined : { width: sizePx, height: sizePx }}
    >
      {thumbs.length > 2 && (
        <Image
          src={thumbs[2]}
          alt=""
          fill
          sizes={sizes}
          className="scale-[0.82] rotate-6 rounded-lg border border-line object-cover opacity-60"
          style={{ transformOrigin: "50% 100%", translate: "9% -4%" }}
        />
      )}
      {thumbs.length > 1 && (
        <Image
          src={thumbs[1]}
          alt=""
          fill
          sizes={sizes}
          className="scale-[0.88] -rotate-3 rounded-lg border border-line object-cover opacity-80"
          style={{ transformOrigin: "50% 100%", translate: "-7% -2%" }}
        />
      )}
      {thumbs.length > 0 ? (
        <Image
          src={thumbs[0]}
          alt=""
          fill
          sizes={sizes}
          className="scale-95 rounded-lg border border-line object-cover"
        />
      ) : (
        // 빈 폴더 — 아무것도 안 쌓인 판
        <div className="absolute inset-0 scale-95 rounded-lg border border-line bg-skel-1" />
      )}
    </div>
  );
}
