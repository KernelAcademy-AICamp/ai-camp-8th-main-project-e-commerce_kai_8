// HTTP Basic 인증 판정 — 순수 로직. 프레임워크·환경변수에 의존하지 않는다.
//
// ⚠️ 이것은 **임시 조치**다. 설계 §3이 정한 것은 구글 로그인 + 이메일 허용 목록이고,
//    공용 비밀번호는 거기서 기각했던 안이다(누가 봤는지 알 수 없고, 유출되면 전원에게
//    다시 알려야 한다). 그럼에도 지금 넣는 이유는 **아무 통제 없이 배포하는 것보다
//    낫기 때문**이다. 이 화면에는 사용자 행동 기록 전부가 보인다.
//
//    갈아끼울 때는 proxy.ts만 바꾸면 된다 — 화면 코드는 이 계층을 모른다.

export interface BasicCredentials {
  user: string;
  password: string;
}

/**
 * `Authorization: Basic <base64>` 헤더를 푼다. 형식이 아니면 null.
 *
 * 비밀번호에 콜론이 들어갈 수 있으므로 **첫 콜론에서만** 자른다.
 *
 * ⚠️ `atob`는 Latin-1만 다룬다. 비밀번호에 한글 같은 비ASCII를 쓰면 브라우저가
 *    보낸 바이트와 서버가 가진 문자열이 어긋나 **맞는 비밀번호인데도 거절된다.**
 *    영숫자만 쓴다(.env.example에도 적어 뒀다).
 *
 * 배열 분해 대신 인덱스로 자르는 이유 — `split(" ")`의 결과를 분해하면 타입은
 * `string`이라고 하지만 런타임에는 `undefined`가 나올 수 있다("Basic"만 온 경우).
 * 타입이 거짓말하는 자리를 만들지 않는다.
 */
export function parseBasicAuth(header: string | null): BasicCredentials | null {
  if (header === null) return null;
  const space = header.indexOf(" ");
  if (space === -1) return null;
  const scheme = header.slice(0, space);
  const encoded = header.slice(space + 1);
  if (scheme.toLowerCase() !== "basic" || encoded === "") return null;

  let decoded: string;
  try {
    decoded = atob(encoded);
  } catch {
    return null; // base64가 아니다
  }

  const separator = decoded.indexOf(":");
  if (separator === -1) return null;
  return {
    user: decoded.slice(0, separator),
    password: decoded.slice(separator + 1),
  };
}

/**
 * 길이가 같은 두 문자열을 **끝까지 비교**한다.
 *
 * 첫 글자가 틀리면 바로 false를 내는 보통 비교는 걸리는 시간이 "몇 글자까지
 * 맞았는가"에 따라 달라져, 그 차이로 비밀번호를 한 글자씩 알아낼 수 있다.
 *
 * 길이가 다르면 즉시 false다 — 길이는 새어 나가지만, 길이만으로는 값을 알 수 없다.
 */
function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * 통과시킬 것인가.
 *
 * **기대값이 비어 있으면 무조건 거절한다(fail closed).** 환경변수를 빠뜨린 채
 * 배포했을 때 문이 열리는 쪽으로 실패하면, 아무도 모르는 사이 데이터가 공개된다.
 */
export function isAuthorized(
  header: string | null,
  expected: BasicCredentials,
): boolean {
  if (expected.password === "") return false;
  const given = parseBasicAuth(header);
  if (given === null) return false;
  // 둘 다 검사한다. 사용자명만 맞아도, 비밀번호만 맞아도 통과하면 안 된다.
  const userOk = constantTimeEquals(given.user, expected.user);
  const passwordOk = constantTimeEquals(given.password, expected.password);
  return userOk && passwordOk;
}
