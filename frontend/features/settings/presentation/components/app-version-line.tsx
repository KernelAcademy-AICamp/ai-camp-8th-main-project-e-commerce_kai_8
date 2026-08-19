import { buildVersionLabel } from "@/features/settings/domain/app-version";

/**
 * 설정 화면 맨 아래 버전 표기 (설계 §1). 상태·이벤트가 없어 view-model을 두지 않는다.
 *
 * `process.env.APP_VERSION`을 **통째로** 적어야 한다 — next.config의 `env`가
 * 이 형태를 빌드 때 문자열로 치환한다. 변수에 담아 돌려 쓰면 치환되지 않는다.
 */
export function AppVersionLine() {
  const label = buildVersionLabel(process.env.APP_VERSION, process.env.APP_ENV);
  if (label === null) return null;

  return <p className="mt-10 text-center text-xs text-neutral-500">{label}</p>;
}
