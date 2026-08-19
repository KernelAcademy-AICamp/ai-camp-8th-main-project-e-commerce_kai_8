/**
 * 설정 화면 맨 아래 한 줄 (설계 §1).
 *
 * 버전은 릴리즈 워크플로가 올리는 `package.json`의 값, 환경은 Vercel이 빌드에
 * 넣어주는 `VERCEL_ENV`다. 둘 다 빌드 시점에 번들로 굳는다(설계 §2).
 */

const PRODUCT_NAME = "aTee";

/** 환경값이 아예 없을 때 — 로컬 개발이다. */
const LOCAL = "local";

/**
 * `production`만 특별 취급하고 나머지는 받은 문자열을 그대로 꼬리표로 쓴다.
 * 실사용자 화면에 내부 용어를 노출하지 않으면서, Vercel이 앞으로 환경 이름을
 * 늘려도 표기가 깨지지 않게 하기 위해서다(설계 §3).
 */
export function buildVersionLabel(
  version: string | undefined,
  environment: string | undefined,
): string | null {
  const trimmedVersion = version?.trim() ?? "";
  if (trimmedVersion === "") return null;

  const base = `${PRODUCT_NAME} v${trimmedVersion}`;

  const trimmedEnvironment = environment?.trim() ?? "";
  if (trimmedEnvironment === "production") return base;

  return `${base} · ${trimmedEnvironment === "" ? LOCAL : trimmedEnvironment}`;
}
