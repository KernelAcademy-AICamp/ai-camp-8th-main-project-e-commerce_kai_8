// 일별 막대가 쓸 값. 순수 함수 — SQL 결과 표를 읽어 그림이 쓸 모양으로 바꾼다.

import type { MetricTable } from "./metric";

/**
 * 하루씩 그릴 수 있는 최대 일수. 넘으면 주 단위로 묶는다.
 *
 * **재서 정했다.** 모바일 390px에서 막대 폭이 이렇게 나온다:
 * 28일 6.6px · 30일 6.0px · **31일 5.7px** · 45일 2.9px · 60일 1.3px.
 * 6px 아래로 떨어지면 마우스로도 손가락으로도 못 집는다.
 * 주 단위로 묶으면 며칠이든 데스크톱 25.5px · 모바일 13.5px가 나온다.
 *
 * 우리 기간 선택기가 7·14·30·전체라, 실제로 걸리는 건 「전체」뿐이다.
 */
export const DAILY_MAX_DAYS = 31;

/** 한 주에 며칠 */
const WEEK = 7;

export interface DailyBar {
  /** 이 막대가 시작하는 날 `YYYY-MM-DD` */
  iso: string;
  /** 이 막대가 끝나는 날. 하루씩이면 `iso`와 같다 */
  lastIso: string;
  /** 눈금에 찍을 글자 `8/16` */
  label: string;
  value: number;
  /** 이 막대가 며칠을 담았나 */
  days: number;
  /** 7일을 못 채운 묶음인가. "아직 안 끝난 주"라고 알려야 한다 */
  partial: boolean;
  /** 앞 막대와 달이 다른가. 이 칸의 이름표는 솎기와 무관하게 찍는다 */
  monthStart: boolean;
}

export interface DailyModel {
  bars: DailyBar[];
  /** 주 단위로 묶었나. **캡션이 이걸 말해야 한다** */
  weekly: boolean;
  /** 실제 데이터의 첫날·마지막 날. 캡션은 여기서 계산한다 */
  from: string;
  to: string;
  /** 묶기 전의 날짜 수 */
  dayCount: number;
  /** 가장 큰 막대. 축을 여기서 계산한다 */
  max: number;
}

/** `2026-08-16` → `8/16`. 일자만 찍으면 두 달을 넘길 때 같은 숫자가 반복된다 */
export function monthDay(iso: string): string {
  const parts = iso.split("-");
  return `${Number(parts[1])}/${Number(parts[2])}`;
}

/** 같은 달인가 */
function sameMonth(a: string, b: string): boolean {
  return a.slice(0, 7) === b.slice(0, 7);
}

/**
 * 그림이 쓸 값으로 바꾼다. 그릴 것이 없으면 `null`.
 *
 * **값이 전부 0이어도 그린다.** 0건인 날이 이어지는 것은 사실이고, 그림이
 * 사라지면 그 사실이 사라진다. 세션 흐름도와 다른 점이다 — 거기서는 모두 0이면
 * 그릴 갈래 자체가 없지만, 여기서는 "0인 날"이 곧 정보다.
 */
export function toDailyModel(table: MetricTable): DailyModel | null {
  const dateAt = table.columns.indexOf("날짜");
  const valueAt = table.columns.indexOf("기록 수");
  if (dateAt < 0 || valueAt < 0 || table.rows.length === 0) return null;

  const daysRaw = table.rows.map((row, index) => ({
    iso: row[dateAt],
    value: table.values[index]?.[valueAt] ?? 0,
  }));

  const from = daysRaw[0].iso;
  const to = daysRaw[daysRaw.length - 1].iso;
  const dayCount = daysRaw.length;
  const weekly = dayCount > DAILY_MAX_DAYS;

  // **앞에서부터 묶는다.** 뒤에서 묶으면 맨 앞 묶음이 짧아지는데, 그러면
  // "옛날에는 한산했다"로 읽힌다. 마지막이 짧은 건 "이번 주가 아직 안 끝났다"로
  // 읽혀 오해가 적다.
  const chunks = weekly
    ? Array.from({ length: Math.ceil(dayCount / WEEK) }, (_, i) =>
        daysRaw.slice(i * WEEK, i * WEEK + WEEK),
      )
    : daysRaw.map((day) => [day]);

  const bars: DailyBar[] = chunks.map((chunk, index) => ({
    iso: chunk[0].iso,
    lastIso: chunk[chunk.length - 1].iso,
    label: monthDay(chunk[0].iso),
    value: chunk.reduce((sum, day) => sum + day.value, 0),
    days: chunk.length,
    partial: weekly && chunk.length < WEEK,
    monthStart: index > 0 && !sameMonth(chunk[0].iso, chunks[index - 1][0].iso),
  }));

  return {
    bars,
    weekly,
    from,
    to,
    dayCount,
    max: Math.max(...bars.map((bar) => bar.value)),
  };
}

/**
 * 어느 칸에 이름표를 찍을지.
 *
 * **첫날·마지막 날·달이 바뀌는 칸은 반드시 찍는다.** 나머지는 자리가 나는 만큼만.
 * 언제부터 언제까지인지와 어디서 달이 바뀌었는지는 솎여서는 안 되는 정보다.
 *
 * @param slotWidth 막대 하나가 차지하는 가로 폭
 * @param labelWidth 이름표 하나가 필요로 하는 가로 폭
 */
export function labelPlan(
  bars: readonly DailyBar[],
  slotWidth: number,
  labelWidth: number,
): boolean[] {
  const every = Math.max(1, Math.ceil(labelWidth / Math.max(slotWidth, 0.1)));
  return bars.map(
    (bar, index) =>
      index === 0 || index === bars.length - 1 || bar.monthStart || index % every === 0,
  );
}
