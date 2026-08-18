// 화면의 닫기·뒤로가기가 어디로 가야 하는가 — 순수 규칙.
//
// 상세 화면에서 눌러 왔으면 그 자리로 돌아가는 것이 자연스럽다. 하지만
// 주소로 바로 들어온 경우에 뒤로 가면 **이 앱을 떠난다.** 그래서 어디서 왔는지를
// 참조 주소로 판단한다. 로그인 화면의 X에서 시작해 마이페이지 뒤로가기도 쓴다.

/** 닫았을 때 갈 곳 */
export type LoginCloseTarget = "back" | "feed";

/**
 * @param selfPath 이 화면 자신의 경로 — 새로고침하면 참조 주소가 자기 자신이
 *   되는데, 그때 뒤로 가면 다시 여기다
 */
export function closeTarget(
  referrer: string,
  origin: string,
  selfPath: string,
): LoginCloseTarget {
  if (referrer === "" || origin === "") return "feed";

  let url: URL;
  try {
    url = new URL(referrer);
  } catch {
    return "feed";
  }

  // 출처를 문자열 앞부분으로만 비교하면 `https://atee.example.evil.com`에 속는다.
  // 파싱한 출처끼리 견준다.
  if (url.origin !== origin) return "feed";
  if (url.pathname === selfPath) return "feed";

  return "back";
}

export function loginCloseTarget(referrer: string, origin: string): LoginCloseTarget {
  return closeTarget(referrer, origin, "/login");
}
