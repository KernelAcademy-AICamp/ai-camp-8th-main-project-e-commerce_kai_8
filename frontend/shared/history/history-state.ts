// 브라우저 히스토리 항목에 우리 값을 얹고 읽는 순수 도우미.
//
// 화면 전환 중 **주소가 바뀌지 않는 것**(전체 화면 덮개 같은 것)은 그 자리에
// 히스토리 항목을 하나 만들어 둬야 뒤로가기 제스처가 앱을 떠나는 대신 그 화면만
// 닫는다. 그때 "이 자리에서 무엇이 열려 있어야 하는가"를 항목 자체에 적어 둔다 —
// 화면 쪽 기억은 뒤로가기·새로고침·앱 재기동으로 사라지지만 항목은 남기 때문이다.
//
// ⚠️ 이 자리는 Next.js 라우터도 함께 쓴다. 통째로 갈아치우면 화면 간 이동이
// 깨지므로 **반드시 기존 값을 보존한 채 얹는다.**

/** 히스토리 항목 상태에서 우리가 적어 둔 값을 읽는다. 없으면 undefined. */
export function readEntryValue(state: unknown, key: string): unknown {
  if (typeof state !== "object" || state === null) return undefined;
  return (state as Record<string, unknown>)[key];
}

/** 기존 값을 지우지 않고 우리 값만 얹은 새 상태를 만든다. */
export function withEntryValue(
  state: unknown,
  key: string,
  value: unknown,
): Record<string, unknown> {
  const base =
    typeof state === "object" && state !== null
      ? (state as Record<string, unknown>)
      : {};
  return { ...base, [key]: value };
}
