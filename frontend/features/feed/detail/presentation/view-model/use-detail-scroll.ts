"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * 상세 스크롤 컨테이너 관리 —
 * 복귀 시 저장된 위치를 복원하고, 히어로를 지나 탐색 그리드에 들어갔는지
 * 감지(pastHero)하며, 칩·맨위로 버튼의 맨 위 복귀 동작을 제공한다.
 */
export function useDetailScroll(initialScrollTop: number) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const heroEndRef = useRef<HTMLDivElement | null>(null);
  const [pastHero, setPastHero] = useState(false);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container || initialScrollTop <= 0) return;

    // 로드베어링 불변식: 이 점진 복원 로직은 "높이가 자라는 섹션(하단 탐색
    // 그리드 래퍼)이 마운트 시점부터 스크롤 컨테이너의 직계 자식으로 무조건
    // 렌더된다"는 전제에 의존한다. 그리드를 조건부 렌더로 바꾸면(예: 데이터
    // 로딩 전엔 렌더하지 않음) observer가 관찰할 대상이 없어 이 교착 회피
    // 로직이 조용히 재발한다. jsdom 테스트로는 잡히지 않으니 변경 시 주의.

    // 복원이 한 번 성공하거나 사용자가 개입하면 다시 실행하지 않는다
    let done = false;
    // 이 훅이 마지막으로 강제한 scrollTop. tryRestore 진입 시 실제
    // scrollTop과 비교해 사용자가 그 사이 직접 스크롤했는지 판단한다.
    // 초기값은 마운트 직후의 scrollTop(보통 0)이다.
    let lastAutoTop = container.scrollTop;
    const tryRestore = () => {
      if (done) return;
      // 사용자 스크롤 하이재킹 방지: 복원 창 동안 사용자가 직접 스크롤하면
      // (서브픽셀 오차를 감안해 1px 초과 차이) 복원을 완전히 중단한다.
      if (Math.abs(container.scrollTop - lastAutoTop) > 1) {
        done = true;
        observer.disconnect();
        return;
      }
      const max = container.scrollHeight - container.clientHeight;
      if (max >= initialScrollTop) {
        container.scrollTo({ top: initialScrollTop });
        lastAutoTop = initialScrollTop;
        done = true;
        observer.disconnect();
        return;
      }
      // 아직 목표 위치까지 콘텐츠가 자라지 않았다. 스크롤이 0에 머물러 있으면
      // 무한 스크롤 센티널이 뷰포트에서 멀어져(rootMargin 밖) 다음 페이지 로드가
      // 트리거되지 않는 교착에 빠진다 — 갈 수 있는 데까지(max) 내려가 센티널을
      // 뷰포트 근처로 당겨서 로드를 유도한다. 높이가 자라면 ResizeObserver가
      // tryRestore를 다시 호출한다.
      container.scrollTo({ top: max });
      lastAutoTop = max;
    };

    // 하단 탐색 그리드가 비동기로 로드돼 콘텐츠 높이가 뒤늦게 자라므로,
    // 높이가 자랄 때마다(직계 자식 크기 변화) 복원을 재시도한다.
    // container 자신이 아니라 직계 자식들을 관찰하는 이유: 컨테이너는
    // flex(min-h-0 flex-1)로 높이가 고정돼 콘텐츠가 자라도 컨테이너 자체는
    // 리사이즈되지 않기 때문이다.
    const observer = new ResizeObserver(() => {
      tryRestore();
    });
    for (const child of Array.from(container.children)) {
      observer.observe(child);
    }

    // 마운트 시점에 콘텐츠가 이미 충분한 경우를 위해 즉시 한 번 시도한다
    tryRestore();

    // 카탈로그가 소진돼 목표 위치까지 끝내 자라지 못하면 tryRestore는
    // done을 세팅하지 않으므로 observer가 여기서 disconnect되지 않는다 —
    // 언마운트 cleanup에서만 해제되는 것은 의도된 동작이다(더 로드할
    // 콘텐츠가 생기면 계속 재시도할 수 있어야 하므로).
    return () => {
      observer.disconnect();
    };
    // 마운트 시 한 번만 설정한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const marker = heroEndRef.current;
    if (!marker) return;
    const observer = new IntersectionObserver(
      (entries) => {
        // 마커가 root(스크롤 컨테이너) 상단 위로 사라졌으면 히어로를 지나
        // 그리드 영역에 들어온 것. root는 헤더 아래에서 시작하므로 뷰포트
        // 기준 0이 아니라 rootBounds.top을 기준선으로 삼아야, root 상단을
        // 막 넘는 유일한 이탈 이벤트도 놓치지 않는다(아래로 벗어난 경우는
        // 여전히 오판하지 않는다).
        setPastHero(
          entries.some(
            (entry) =>
              !entry.isIntersecting &&
              entry.boundingClientRect.top < (entry.rootBounds?.top ?? 0),
          ),
        );
      },
      { root: scrollRef.current },
    );
    observer.observe(marker);
    return () => {
      observer.disconnect();
    };
  }, []);

  const scrollToTop = useCallback(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  return { scrollRef, heroEndRef, pastHero, scrollToTop };
}
