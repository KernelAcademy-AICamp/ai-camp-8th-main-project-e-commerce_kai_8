// 찜 토글을 서버로 보내는 순서 관리자.
//
// 하트는 즉시 반응하고 저장은 뒤따른다(설계 §3). 그러면 사용자가 빠르게 연타할
// 때 요청이 뒤섞여 **화면과 반대 상태로 굳는** 일이 생긴다. 그래서 상품마다
// 한 번에 하나만 보내고, 보내는 동안 바뀐 의도는 끝난 뒤에 반영한다.
//
// **마지막 의도가 이긴다.** 중간에 몇 번을 눌렀든 서버에 남는 것은 마지막 상태다.

/** 서버로 보내는 실제 동작. wanted=true면 찜, false면 해제. */
export type PushWish = (goodsNo: number, wanted: boolean) => Promise<void>;

/**
 * 보내기가 실패해 화면을 되돌려야 할 때 부른다.
 *
 * @param confirmed 서버가 받아준 마지막 상태
 * @param cause 실패 원인 — 화면이 "규칙에 걸렸다"와 "연결이 안 된다"를 구분해
 *   다른 문구를 보여줄 수 있어야 한다.
 */
export type OnRevert = (goodsNo: number, confirmed: boolean, cause: unknown) => void;

export interface WishSync {
  /** 이 상품을 wanted 상태로 만들고 싶다고 알린다 */
  request: (goodsNo: number, wanted: boolean) => void;
  /**
   * 서버에서 읽은 현재 상태를 알려준다.
   *
   * **이걸 하지 않으면** 서버에 이미 담긴 찜을 풀 때 "이미 그 상태"로 보고
   * 요청을 건너뛴다 — 화면만 줄고 서버는 그대로가 된다.
   */
  setConfirmed: (goodsNo: number, state: boolean) => void;
}

export function createWishSync(push: PushWish, onRevert: OnRevert): WishSync {
  /** 서버가 받아준 마지막 상태. 없으면 "찜 안 함". */
  const confirmed = new Map<number, boolean>();
  /** 사용자가 마지막으로 원한 상태 */
  const desired = new Map<number, boolean>();
  /** 지금 보내는 중인 상품 */
  const sending = new Set<number>();

  function confirmedOf(goodsNo: number): boolean {
    return confirmed.get(goodsNo) ?? false;
  }

  function drain(goodsNo: number): void {
    if (sending.has(goodsNo)) return;

    const want = desired.get(goodsNo);
    // 원하는 상태가 이미 서버 상태와 같으면 보낼 것이 없다.
    if (want === undefined || want === confirmedOf(goodsNo)) return;

    sending.add(goodsNo);
    void push(goodsNo, want).then(
      () => {
        confirmed.set(goodsNo, want);
        sending.delete(goodsNo);
        // 보내는 동안 의도가 또 바뀌었을 수 있다.
        drain(goodsNo);
      },
      (cause: unknown) => {
        sending.delete(goodsNo);
        // 확정 상태로 되돌린다. 화면이 서버보다 앞서간 채로 두지 않는다.
        desired.set(goodsNo, confirmedOf(goodsNo));
        onRevert(goodsNo, confirmedOf(goodsNo), cause);
      },
    );
  }

  return {
    request(goodsNo, wanted) {
      desired.set(goodsNo, wanted);
      drain(goodsNo);
    },
    setConfirmed(goodsNo, state) {
      // 보내는 중이면 건드리지 않는다. 그 요청의 결과가 더 최신이다.
      if (sending.has(goodsNo)) return;
      confirmed.set(goodsNo, state);
    },
  };
}
