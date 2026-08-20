// 출입 통제 계층 (Next 16에서 middleware의 새 이름).
//
// **화면에 닿기 전에 여기서 막는다.** 판정은 전적으로 서버에서 일어나며, 통과하지
// 못한 요청에는 데이터가 한 글자도 나가지 않는다.
//
// ⚠️ 지금은 **공용 비밀번호 하나**를 쓰는 임시 조치다. 설계 §3이 정한 것은 구글
//    로그인 + 이메일 허용 목록이고, 이 방식은 거기서 기각했던 안이다 — 누가 봤는지
//    알 수 없고, 유출되면 전원에게 새 비밀번호를 다시 알려야 한다. 그럼에도 넣는
//    이유는 **아무 통제 없이 배포하는 것보다 낫기 때문**이다.
//
//    갈아끼울 때 고칠 곳은 이 파일 하나다. 화면 코드는 이 계층을 모른다.

import { type NextRequest, NextResponse } from "next/server";

import { isAuthorized } from "@/features/access/domain/basic-auth";

export default function proxy(request: NextRequest): NextResponse {
  const expected = {
    user: process.env.ADMIN_USER ?? "admin",
    // 비어 있으면 isAuthorized가 전부 거절한다(fail closed). 환경변수를 빠뜨린 채
    // 배포했을 때 문이 열리는 쪽으로 실패하면 아무도 모르게 데이터가 공개된다.
    password: process.env.ADMIN_PASSWORD ?? "",
  };

  if (isAuthorized(request.headers.get("authorization"), expected)) {
    return NextResponse.next();
  }

  return new NextResponse("인증이 필요합니다.", {
    status: 401,
    headers: {
      // 이 헤더가 있어야 브라우저가 비밀번호 입력창을 띄운다.
      "WWW-Authenticate": 'Basic realm="aTee admin", charset="UTF-8"',
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

/**
 * 적용 범위 — **기본이 통과가 아니라 차단**이 되도록 넓게 잡는다.
 *
 * 경로를 하나씩 나열하면 나중에 페이지를 추가할 때 빠뜨리기 쉽고, 빠뜨린 경로는
 * 조용히 공개된다. 그래서 전부 막고 예외만 뺀다.
 *
 * 빼는 것은 Next.js가 만드는 정적 자산뿐이다. 그 안에는 데이터가 없고(코드는 이미
 * public repo에 있다), 막으면 비밀번호 입력창이 뜨기 전에 화면이 깨진다.
 */
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
