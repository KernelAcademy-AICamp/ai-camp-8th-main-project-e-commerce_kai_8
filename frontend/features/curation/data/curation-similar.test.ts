// 이어보기 후보 목록이 화면 데이터와 **같은 큐레이션을 가리키는지** 지킨다.
//
// curation-similar.json은 서버의 대표 벡터(c_curation_vecs)로 미리 뽑아 둔 정적
// 파일이다. curations.json이 바뀌면 낡는데, 낡아도 화면은 멀쩡히 그려진다
// (없어진 키는 건너뛰고, 새 큐레이션만 이어보기 자리가 안 뜬다). 조용히 나빠지므로
// 여기서 잡는다.
//
// 어긋나면: backend에서 `python3 scripts/gen_curation_similar.py`를 다시 돌린다.

import { describe, expect, it } from "vitest";

import similar from "./curation-similar.json";
import curations from "./curations.json";

const keys = new Set(curations.map((c) => c.key));

describe("curation-similar.json", () => {
  it("모든 큐레이션에 후보가 있다", () => {
    expect(Object.keys(similar).sort()).toEqual([...keys].sort());
  });

  it("후보가 전부 실재하는 큐레이션이다", () => {
    const unknown = Object.values(similar)
      .flat()
      .filter((key) => !keys.has(key));
    expect(unknown).toEqual([]);
  });
});
