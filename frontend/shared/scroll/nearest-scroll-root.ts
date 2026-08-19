/**
 * 이 요소를 실제로 담아 굴리는 조상을 찾는다. 없으면 `null`(문서가 굴린다).
 *
 * 화면마다 굴리는 주체가 다르다 — 홈은 칸이(home-shell), 상세는 자기 본문이
 * 굴린다. 그런데 같은 피드 코드가 두 곳에 다 쓰인다. 그래서 "누가 굴리는지"를
 * 밖에서 넘겨받는 대신 **놓인 자리에서 직접 찾는다.** 컴포넌트가 다른 화면으로
 * 옮겨가도 따라오고, 넘겨주는 것을 빠뜨려 조용히 어긋날 일이 없다.
 *
 * 문서 자신(html·body)에는 멈추지 않고 `null`을 준다. 브라우저마다 그 둘의
 * 계산된 overflow 값이 갈려서, 문서가 굴리는 경우를 값으로 판단하면 흔들린다.
 */
export function nearestScrollRoot(element: Element | null): Element | null {
  const stopAt: (Element | null)[] = [document.documentElement, document.body];
  for (
    let node = element?.parentElement ?? null;
    node !== null && !stopAt.includes(node);
    node = node.parentElement
  ) {
    const overflowY = getComputedStyle(node).overflowY;
    if (overflowY === "auto" || overflowY === "scroll") return node;
  }
  return null;
}
