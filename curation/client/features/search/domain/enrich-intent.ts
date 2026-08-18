// 결정적 보강 계층 — 정책 확정된 매핑(색 유사어·계열색·패턴/소재 유사어·주관어·장소→계절·
// 활동→리뷰태그·어휘밖 명사→keyword)을 LLM 결과 위에 결정적으로 덮는다(설계 §7 승격).
// 목적: 모델 재량이 큰 표현의 비결정 변동을 제거하고 정책을 한 소스로 강제한다. 모든 모드 적용.
// 어휘 정합: 값은 musinsa-vocab.ts의 facet·REVIEW_TAGS·wear-chars-vocab.ts 원문값만 사용.

import type { QueryIntent } from "./query-intent";

// ── 색: 점 유사어(정확 1~다), 계열(고정집합) ──────────────────────────────────
const COLOR_SYNONYM: Record<string, string[]> = {
  곤색: ["네이비", "다크 네이비"],
  남색: ["네이비"],
  진남색: ["다크 네이비"],
  하늘색: ["스카이 블루"],
  소라색: ["스카이 블루"],
  살구색: ["피치"],
  겨자색: ["머스타드"],
  개나리색: ["옐로우", "라이트 옐로우"],
  연두색: ["라임", "라이트 그린"],
  자주색: ["버건디", "퍼플"],
  쥐색: ["그레이", "다크 그레이"],
  잿빛: ["그레이"],
  국방색: ["카키", "올리브 그린"],
  올리브색: ["올리브 그린"],
  밤색: ["브라운", "다크 브라운"],
  커피색: ["브라운"],
  초코색: ["다크 브라운"],
  벽돌색: ["브릭"],
  체리색: ["레드", "딥레드"],
  다홍색: ["레드", "오렌지"],
  귤색: ["오렌지"],
  상아색: ["아이보리"],
  우유색: ["화이트", "아이보리"],
  먹색: ["다크 그레이"],
  와인색: ["버건디"],
  크림색: ["아이보리"],
  오프화이트: ["아이보리", "화이트"],
  에크루: ["오트밀", "아이보리"],
  코랄색: ["피치", "핑크"],
  베이비핑크: ["라이트 핑크", "페일 핑크"],
  진분홍: ["다크핑크"],
  마젠타: ["다크핑크", "핑크"],
  청보라색: ["퍼플"],
  연보라: ["라벤더"],
  터콰이즈: ["민트", "스카이 블루"],
  "네온 그린": ["라임"],
  네온그린: ["라임"],
  모카색: ["브라운", "라이트 브라운"],
};
const COLOR_FAMILY: Record<string, string[]> = {
  파란: ["블루", "스카이 블루", "다크 블루", "데님", "연청", "중청", "진청"],
  파랑: ["블루", "스카이 블루", "다크 블루", "데님", "연청", "중청", "진청"],
  어두운색: ["다크 그레이", "다크 네이비", "다크 브라운"],
  밝은: ["화이트", "아이보리", "라이트 그레이", "라이트 옐로우"],
  파스텔톤: ["라이트 핑크", "페일 핑크", "라벤더", "민트", "스카이 블루"],
  파스텔: ["라이트 핑크", "페일 핑크", "라벤더", "민트", "스카이 블루"],
  화사한: ["옐로우", "오렌지", "핑크", "라이트 옐로우", "민트"],
  무채색: ["블랙", "화이트", "그레이", "라이트 그레이", "다크 그레이"],
  초록: ["그린", "라이트 그린", "다크 그린", "올리브 그린"],
};

const PATTERN_SYNONYM: Record<string, string> = {
  줄무늬: "스트라이프",
  땡땡이: "도트",
  물방울무늬: "도트",
  격자무늬: "체크",
  깅엄체크: "체크",
  위장무늬: "카모플라쥬",
  밀리터리: "카모플라쥬",
  옴브레: "그라데이션",
  "홀치기 염색": "타이다이",
  민무늬: "단색",
  "솔리드 컬러": "단색",
  솔리드: "단색",
  꽃무늬: "플라워",
};
const MATERIAL_SYNONYM: Record<string, string> = {
  코튼: "면",
  순면: "면",
  "오가닉 코튼": "면",
  레이온: "비스코스",
  스판: "스판덱스",
  라이크라: "스판덱스",
};
// 주관 매핑어(직역=단색)
const SOLID_WORDS = [
  "무지",
  "민무늬",
  "깔끔",
  "미니멀",
  "심플",
  "베이직",
  "기본",
  "단정",
];
// 장소·상황 → 여름
const SUMMER_WORDS = [
  "흠뻑쇼",
  "계곡",
  "워터파크",
  "동남아",
  "수영장",
  "피서",
  "휴가",
  "바닷가",
  "해변",
  "바다",
];
// 활동 → 리뷰태그
const ACTIVITY_TAG: Record<string, string> = {
  러닝: "러닝",
  마라톤: "러닝",
  골프: "골프",
  필라테스: "필라테스",
  등산: "등산·산책",
  클라이밍: "클라이밍",
  헬스: "운동복",
  운동: "운동복",
  잠옷: "홈웨어·잠옷",
  홈웨어: "홈웨어·잠옷",
  커플: "커플티",
  단체: "단체티·유니폼",
};

const uniq = (xs: string[]): string[] => [...new Set(xs)];

export interface EnrichResult {
  intent: QueryIntent;
  /** 결정적으로 덮은 표현들(관측·칩용). */
  applied: string[];
}

/** LLM/기본 intent에 결정적 정책 매핑을 덮는다. 값이 있는 표현만 개입한다. */
export function enrichIntent(query: string, intent: QueryIntent): EnrichResult {
  const q = query.normalize("NFKC");
  const applied: string[] = [];
  let colors = [...intent.style.colors];
  const patterns = [...intent.style.patterns];
  const materials = [...intent.style.materials];
  const season = [...intent.wearChars.계절];
  const reviewTags = [...intent.reviewTags];

  // 색: 계열(고정집합 SET) 우선 — 없으면 점 유사어(merge).
  let familyColors: string[] | null = null;
  for (const [w, set] of Object.entries(COLOR_FAMILY)) {
    if (q.includes(w)) {
      familyColors = [...(familyColors ?? []), ...set];
      applied.push(w);
    }
  }
  const synColors: string[] = [];
  for (const [w, set] of Object.entries(COLOR_SYNONYM)) {
    if (q.includes(w)) {
      synColors.push(...set);
      applied.push(w);
    }
  }
  if (familyColors) colors = uniq([...familyColors, ...synColors]);
  else if (synColors.length) colors = uniq([...synColors]);

  for (const [w, v] of Object.entries(PATTERN_SYNONYM)) {
    if (q.includes(w)) {
      patterns.push(v);
      applied.push(w);
    }
  }
  for (const w of SOLID_WORDS) {
    if (q.includes(w)) {
      patterns.push("단색");
      applied.push(w);
    }
  }
  for (const [w, v] of Object.entries(MATERIAL_SYNONYM)) {
    if (q.includes(w)) {
      materials.push(v);
      applied.push(w);
    }
  }
  let seasonOut = season;
  for (const w of SUMMER_WORDS) {
    if (q.includes(w)) {
      seasonOut = uniq([...seasonOut, "여름"]);
      applied.push(w);
    }
  }
  let tagsOut = reviewTags;
  for (const [w, v] of Object.entries(ACTIVITY_TAG)) {
    if (q.includes(w)) {
      tagsOut = uniq([...tagsOut, v]);
      applied.push(w);
    }
  }

  return {
    intent: {
      ...intent,
      style: {
        ...intent.style,
        colors,
        patterns: uniq(patterns),
        materials: uniq(materials),
      },
      wearChars: { ...intent.wearChars, 계절: seasonOut },
      reviewTags: tagsOut,
    },
    applied: uniq(applied),
  };
}
