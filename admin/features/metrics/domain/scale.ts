// 축 눈금 계산. 순수 함수 — 프레임워크·DB에 의존하지 않는다.

/** 축 하나 */
export interface Scale {
  /** 축 끝. 넣은 최대값보다 **항상 크거나 같다** */
  max: number;
  /** 0에서 시작해 `max`로 끝나는 오름차순 눈금 */
  ticks: number[];
}

/** 눈금 간격으로 쓸 수 있는 값. 이 배수로만 끊는다 */
const STEPS = [1, 2, 2.5, 5, 10];

/** 부동소수 찌꺼기를 자른다. 0.1을 여섯 번 더하면 0.6000000000000001이 된다 */
function tidy(value: number): number {
  return Number(value.toPrecision(12));
}

/**
 * 최대값을 받아 축 끝과 눈금을 낸다.
 *
 * **축을 코드에 박아 두면 조용히 틀린 그림이 된다.** 실제로 그럴 뻔했다 —
 * 재방문 곡선의 세로축이 20%로 고정이었는데 Day 1이 19.4%였다. 21%만 돼도 점이
 * 그래프 밖으로 나간다. 상자수염은 더 위험했다. 축이 120 고정인데 상위 25%가 92였고,
 * 넘어가면 그리는 쪽에서 `min(v / max, 1)`로 잘라내 **상자가 오른쪽 끝에 붙는다.**
 * 잘렸다는 표시도 없이 틀린 그림이 된다.
 *
 * **여유를 곱하지 않는다.** 올림이 이미 다음 눈금까지 밀어 주므로 값이 축을 넘는 일이
 * 없다. 1.1을 곱해 봤더니 19.4%가 축 30까지 밀려 그래프 절반이 비었다.
 *
 * 눈금은 1·2·2.5·5·10의 배수로만 끊는다. 3,700 같은 값이 눈금에 오면 읽는 사람이
 * 매번 계산해야 한다.
 *
 * @param maxValue 축이 담아야 할 가장 큰 값
 * @param targetTicks 눈금을 몇 칸으로 나눌지. 정확히 그 개수가 나오지는 않는다
 */
export function niceScale(maxValue: number, targetTicks = 4): Scale {
  // 0·음수·NaN·무한대에서도 살아야 한다. 필터를 좁히면 모든 값이 0인 카드가 생기고,
  // 거기서 죽으면 카드 하나가 통째로 "실패"로 떠서 진짜 원인이 가려진다.
  if (!Number.isFinite(maxValue) || maxValue <= 0) return { max: 1, ticks: [0, 1] };

  const want = targetTicks > 0 ? targetTicks : 4;
  const rough = maxValue / want;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalized = rough / magnitude;
  const step = (STEPS.find((s) => normalized <= s) ?? 10) * magnitude;

  const max = tidy(Math.ceil(maxValue / step) * step);
  const ticks: number[] = [];
  // 곱셈으로 만든다 — 더하기로 쌓으면 오차가 누적된다.
  for (let i = 0; tidy(i * step) <= max; i += 1) ticks.push(tidy(i * step));
  return { max, ticks };
}
