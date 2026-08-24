import Image from "next/image";

/**
 * 3단계의 그림 — **고른 옷 세 장이 하나의 취향으로 모인다**
 * (시안 `design/atee-taste-signup-sample.png`).
 *
 * 장식이 아니라 **설명이다.** 이 화면이 요구하는 것은 가입인데, 왜 가입하는지가
 * "방금 고른 것이 추천의 시작점이 된다"이기 때문이다. 그래서 **실제로 고른 사진**을
 * 쓴다 — 예시 이미지를 쓰면 그 연결이 거짓말이 된다.
 *
 * 셋보다 적게 들어올 일은 없다(최소 3개). 넷 이상이면 앞 셋만 보여준다.
 */
export function TasteConvergeFigure({ thumbnails }: { thumbnails: readonly string[] }) {
  const three = thumbnails.slice(0, 3);
  // 왼쪽·가운데·오른쪽 순서로 부채꼴. 가운데가 앞에 서고 곧게 선다.
  const layout = [
    { rotate: -8, translateY: 14, z: "z-10", scale: 0.94 },
    { rotate: 0, translateY: -6, z: "z-20", scale: 1 },
    { rotate: 8, translateY: 14, z: "z-10", scale: 0.94 },
  ];

  return (
    <div aria-hidden className="px-2">
      <div className="flex items-end justify-center">
        {three.map((src, i) => {
          const at = layout[i] ?? layout[1];
          return (
            <div
              key={src}
              className={`relative ${at.z} ${i === 1 ? "-mx-3" : ""} w-[34%] overflow-hidden rounded-[18px] bg-thumb neo`}
              style={{
                transform: `rotate(${at.rotate.toString()}deg) translateY(${at.translateY.toString()}px) scale(${at.scale.toString()})`,
              }}
            >
              <div className="relative aspect-4/5">
                <Image src={src} alt="" fill sizes="140px" className="object-cover" />
              </div>
            </div>
          );
        })}
      </div>

      {/* 세 장에서 내려온 선이 하나로 모인다. 가지 끝의 점이 사진과 이어져 있음을
          말해 준다 — 선만 있으면 어디서 나온 선인지 읽히지 않는다. */}
      <svg
        viewBox="0 0 240 54"
        className="mt-1 w-full text-accent"
        fill="none"
        preserveAspectRatio="none"
      >
        <path
          d="M42 6v14a8 8 0 0 0 8 8h62M198 6v14a8 8 0 0 1-8 8h-62M120 6v48"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <circle cx="42" cy="6" r="3.5" fill="currentColor" />
        <circle cx="120" cy="6" r="3.5" fill="currentColor" />
        <circle cx="198" cy="6" r="3.5" fill="currentColor" />
      </svg>

      <TasteContourDisc />
    </div>
  );
}

/**
 * 취향이 모이는 자리 — 등고선 원반.
 *
 * 지도의 등고선을 빌린 이유: **한 점으로 수렴하는 것이 아니라 어떤 영역이 짙어지는
 * 것**이 취향에 가깝기 때문이다. 가운데 점은 지금 잡힌 중심이고, 바깥으로 갈수록
 * 옅어진다.
 */
function TasteContourDisc() {
  return (
    <div className="mx-auto -mt-1 flex h-[150px] w-[150px] items-center justify-center rounded-full bg-thumb neo">
      <svg viewBox="0 0 150 150" className="h-full w-full text-accent" fill="none">
        <defs>
          <clipPath id="atee-contour-clip">
            <circle cx="75" cy="75" r="70" />
          </clipPath>
        </defs>
        <g
          clipPath="url(#atee-contour-clip)"
          stroke="currentColor"
          strokeLinecap="round"
        >
          <path
            d="M56 74c0-11 9-19 20-19s19 8 19 18-8 18-19 18-20-7-20-17Z"
            strokeWidth="1.5"
          />
          <path
            d="M45 73c1-17 13-29 30-29s29 12 30 28-12 29-29 30-32-11-31-29Z"
            strokeWidth="1.4"
            opacity=".9"
          />
          <path
            d="M33 71c2-24 19-40 42-40s41 17 42 39-16 41-40 43-46-17-44-42Z"
            strokeWidth="1.3"
            opacity=".72"
          />
          <path
            d="M21 69c3-31 24-52 54-52s52 23 53 50-21 53-51 55S18 100 21 69Z"
            strokeWidth="1.2"
            opacity=".55"
          />
          <path
            d="M9 67C13 29 39 4 76 4s64 29 65 63-26 65-64 67S5 105 9 67Z"
            strokeWidth="1.1"
            opacity=".38"
          />
          <path
            d="M-3 65C2 20 33-9 77-9s76 34 77 74-31 77-76 79S-8 110-3 65Z"
            strokeWidth="1"
            opacity=".24"
          />
        </g>
        <circle cx="75" cy="73" r="5" fill="currentColor" />
        <circle cx="38" cy="78" r="2.5" fill="currentColor" opacity=".5" />
      </svg>
    </div>
  );
}
