"""이미지 유형 분류 표본 판정 페이지 생성 (설계 2단계 사람 게이트).

embed_state.db의 done 행에서 유형별 층화 표본을 뽑아, 예측 라벨과 함께
보여주는 HTML을 만든다. 사람이 틀린 카드를 클릭해 표시하면 하단에
오류율 집계와 내보내기 텍스트가 갱신된다.

실행: python gen_judgment.py [표본수(기본 200)]  →  data/judgment.html
"""

import html
import pathlib
import sqlite3
import sys

BASE = pathlib.Path(__file__).parent
DB = BASE / "data" / "embed_state.db"  # DB_ARG로 대체 가능(배치 중 스냅숏)
DB_ARG = next((a for a in sys.argv[1:] if a.endswith(".db")), None)
N = next((int(a) for a in sys.argv[1:] if a.isdigit()), 200)
TYPES = ["착용샷", "단품컷", "디테일·원단", "표·라벨"]
GRAPHICS = ["무지", "그래픽", "레터링"]

conn = sqlite3.connect(DB_ARG or DB)
per_type = max(1, N // len(TYPES))
rows = []
for t in range(len(TYPES)):
    rows += conn.execute(
        "select goods_no, slot, url, img_type, type_conf, graphic, graphic_conf"
        " from imgs where status='done' and img_type=? order by random() limit ?",
        (t, per_type)).fetchall()

cards = []
for gid, slot, url, it, tc, g, gc in rows:
    cards.append(
        f'<div class="c" data-id="{gid}:{slot}" data-type="{it}" onclick="tog(this)">'
        f'<img src="{html.escape(url)}" loading="lazy">'
        f'<div class="l">{TYPES[it]} {tc:.2f}<br>{GRAPHICS[g]} {gc:.2f}</div></div>')

page = """<meta charset="utf-8"><title>분류 판정 — aTee</title><style>
body{font-family:-apple-system,sans-serif;margin:16px;background:#fafafa}
.g{display:flex;flex-wrap:wrap;gap:6px}
.c{width:120px;cursor:pointer;border-radius:8px;padding:3px;background:#fff;border:2px solid #ddd}
.c img{width:100%;height:140px;object-fit:cover;border-radius:6px;background:#eee}
.c .l{font-size:11px;color:#444;padding:2px}
.c.wrong{border-color:#e11;background:#fee}
#sum{position:fixed;bottom:0;left:0;right:0;background:#111;color:#fff;padding:10px 16px;font-size:14px}
</style>
<h1>이미지 유형 분류 판정 (표본 __COUNT__)</h1>
<p>예측 라벨이 <b>틀린</b> 카드를 클릭해 빨갛게 표시하세요. 하단에 오류율이 집계됩니다.</p>
<div class="g">__CARDS__</div>
<div id="sum"></div>
<script>
function tog(el){el.classList.toggle('wrong');upd()}
function upd(){
  const all=[...document.querySelectorAll('.c')];
  const by={};
  all.forEach(c=>{const t=c.dataset.type;by[t]=by[t]||[0,0];by[t][1]++;
    if(c.classList.contains('wrong'))by[t][0]++;});
  const names=['착용샷','단품컷','디테일','표라벨'];
  let s=Object.entries(by).map(([t,[w,n]])=>`${names[t]}: 오류 ${w}/${n}`).join('  ·  ');
  const wrong=all.filter(c=>c.classList.contains('wrong')).map(c=>c.dataset.id);
  document.getElementById('sum').textContent=s+'   [틀린 항목: '+wrong.join(', ')+']';
}
upd();
</script>"""
page = page.replace("__COUNT__", str(len(rows))).replace("__CARDS__", "\n".join(cards))

out = BASE / "data" / "judgment.html"
out.write_text(page)
print(f"wrote {out} ({len(rows)} cards)")
