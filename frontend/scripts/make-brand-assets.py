"""앱 아이콘과 공유 카드를 **홈 화면 로고에서** 만든다.

정본은 화면에 쓰는 컴포넌트다 — `shared/icons.tsx`의 `AteeMark`(모자이크 조각 네 개,
스펙 `docs/superpowers/specs/2026-08-25-mosaic-logo-mark.md`)와 `home-shell.tsx`의
`aTee` 워드마크. 여기서 그 SVG 좌표와 색을 그대로 가져다 쓴다. 아이콘과 카드가 앱
화면과 어긋나지 않게 하려는 것이다. **로고를 고치면 이 파일의 PIECES·색 상수도
같이 고치고 다시 돌린다.**

만드는 것 (public/)
    icon-192.png            안드로이드·매니페스트
    icon-512.png            안드로이드·매니페스트
    icon-512-maskable.png   안드로이드 마스크 대응 (안전 영역 여백)
    apple-touch-icon.png    iOS 홈 화면 (180)
    og.png                  공유 카드 1200x630 (카톡·문자 미리보기)

실행:
    python scripts/make-brand-assets.py
    (Pillow·cairosvg 필요. node_modules/pretendard 설치돼 있어야 한다.)
"""

import io
import pathlib

import cairosvg
from PIL import Image, ImageDraw, ImageFont

HERE = pathlib.Path(__file__).resolve().parent
FRONTEND = HERE.parent
FONTS = FRONTEND / "node_modules/pretendard/dist/public/static"
PUBLIC = FRONTEND / "public"
ICONS = PUBLIC / "icons"

# globals.css 토큰과 같은 값 (검은 테마, 2026-08-24)
APP = "#000000"  # --color-app
ACCENT = "#8fbf9f"  # --color-accent (로고 심볼·워드마크 색)
INK = "#ededed"  # --color-ink (워드마크 글자)
INK_SOFT = "#b5b5b5"  # --color-ink-soft (부제)

# shared/icons.tsx AteeMark의 조각 네 개 (viewBox 56x56) — 그대로 옮긴 것.
# (x, y, width, height, 불투명도)
PIECES = (
    (8, 8, 20, 26, 1.0),
    (31, 8, 17, 14, 0.55),
    (31, 25, 17, 23, 0.8),
    (8, 37, 20, 11, 0.4),
)


def render_svg(svg: str, px: int) -> Image.Image:
    """SVG 문자열을 px x px RGBA로 래스터화."""
    png = cairosvg.svg2png(bytestring=svg.encode(), output_width=px, output_height=px)
    return Image.open(io.BytesIO(png)).convert("RGBA")


def mark_svg(color: str) -> str:
    """AteeMark와 같은 구성 — 조각 네 개, 색 하나에 불투명도로 층을 나눈다."""
    rects = "".join(
        f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="4" '
        f'fill="{color}" fill-opacity="{opacity}"/>'
        for x, y, w, h, opacity in PIECES
    )
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 56 56">{rects}</svg>'


def app_icon(px: int, scale: float) -> Image.Image:
    """홈 화면 아이콘 — 검은 배경 위에 마크를 얹는다. 화면 헤더와 같은 배색이다.

    `scale`은 아이콘 캔버스 대비 마크 크기 비율. 마크 자체가 56 viewBox 안에서
    이미 여백(8px)을 갖고 있어 일반 아이콘은 1.0(추가 축소 없음)이면 되지만,
    마스크 대응은 안드로이드가 모서리를 깎으므로 더 줄인다.
    """
    icon = Image.new("RGBA", (px, px), APP)
    mark_px = round(px * scale)
    m = render_svg(mark_svg(ACCENT), mark_px)
    icon.paste(m, ((px - mark_px) // 2, (px - mark_px) // 2), m)
    return icon


def og_card() -> Image.Image:
    """공유 카드 — 홈 화면 로고줄을 그대로 옮긴 구성. 검은 배경, 양각 효과 없음
    (검은 테마 작업에서 emboss 자체를 없앴다 — globals.css 참고)."""
    W, H = 1200, 630
    card = Image.new("RGB", (W, H), APP)

    mark_px = 190
    mark = render_svg(mark_svg(ACCENT), mark_px)

    f_title = ImageFont.truetype(str(FONTS / "Pretendard-ExtraBold.otf"), 168)
    f_sub = ImageFont.truetype(str(FONTS / "Pretendard-SemiBold.otf"), 44)
    tagline = "취향으로 변하는 티셔츠 무한 탐색"

    probe = ImageDraw.Draw(card)
    title_w = probe.textlength("aTee", font=f_title)
    gap = 34  # 심볼과 워드마크 사이 (home-shell의 gap-2를 키운 비율)
    row_w = mark_px + gap + title_w
    row_x = (W - row_w) / 2
    row_cy = H / 2 - 46

    tx = row_x + mark_px + gap
    probe.text((tx, row_cy), "aTee", font=f_title, fill=INK, anchor="lm")

    card.paste(mark, (round(row_x), round(row_cy - mark_px / 2)), mark)

    probe.text((W / 2, row_cy + 152), tagline, font=f_sub, fill=INK_SOFT, anchor="mm")
    return card


ICONS.mkdir(parents=True, exist_ok=True)
made = []

for px in (192, 512):
    p = ICONS / f"icon-{px}.png"
    app_icon(px, 1.0).convert("RGB").save(p, optimize=True)
    made.append(p)

# 마스크 대응 — 안드로이드가 모서리를 깎아도 조각이 안 잘리게 안전 영역(중앙) 안에
p = ICONS / "icon-512-maskable.png"
app_icon(512, 0.68).convert("RGB").save(p, optimize=True)
made.append(p)

p = ICONS / "apple-touch-icon.png"
app_icon(180, 1.0).convert("RGB").save(p, optimize=True)
made.append(p)

p = PUBLIC / "og.png"
og_card().save(p, optimize=True)
made.append(p)

for f in made:
    print(f"{f.relative_to(FRONTEND)}  {Image.open(f).size}  {f.stat().st_size // 1024}KB")
