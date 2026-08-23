"""앱 아이콘과 공유 카드를 **홈 화면 로고에서** 만든다.

정본은 화면에 쓰는 컴포넌트다 — `shared/icons.tsx`의 `AteeMark`(원 + 티셔츠 글립)와
`home-shell.tsx`의 `aTee` 워드마크. 여기서 그 SVG 경로와 색을 그대로 가져다 쓴다.
아이콘과 카드가 앱 화면과 어긋나지 않게 하려는 것이다. **로고를 고치면 이 파일의
GLYPH·색 상수도 같이 고치고 다시 돌린다.**

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
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = pathlib.Path(__file__).resolve().parent
FRONTEND = HERE.parent
FONTS = FRONTEND / "node_modules/pretendard/dist/public/static"
PUBLIC = FRONTEND / "public"
ICONS = PUBLIC / "icons"

# globals.css 토큰과 같은 값
APP = "#e4e6eb"  # --color-app
SLATE = "#8590a8"  # --color-slate (로고 심볼·워드마크 색)
SH_D = (166, 175, 195)  # --sh-d
SH_L = (255, 255, 255)  # --sh-l

# shared/icons.tsx AteeMark의 티셔츠 경로 (viewBox 26x26) — 그대로 옮긴 것
GLYPH = (
    "M13 6.5C11.9 6.5 11 7.4 11 8.5C11 9.2 11.4 9.8 12 10.2V11L5.8 15.4"
    "C5.3 15.7 5.5 16.5 6.1 16.5H19.9C20.5 16.5 20.7 15.7 20.2 15.4L14 11V10.2"
    "C14.6 9.8 15 9.2 15 8.5H13.6C13.6 8.8 13.3 9.1 13 9.1C12.7 9.1 12.4 8.8 12.4 8.5"
    "C12.4 8.2 12.7 7.9 13 7.9V6.5Z"
)


def render_svg(svg: str, px: int) -> Image.Image:
    """SVG 문자열을 px x px RGBA로 래스터화."""
    png = cairosvg.svg2png(bytestring=svg.encode(), output_width=px, output_height=px)
    return Image.open(io.BytesIO(png)).convert("RGBA")


def mark_svg(circle: str, glyph: str) -> str:
    """AteeMark와 같은 구성 — 색이 찬 원에 옷걸이를 뚫는다."""
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 26 26">'
        f'<circle cx="13" cy="13" r="12" fill="{circle}"/>'
        f'<path d="{GLYPH}" fill="{glyph}"/>'
        "</svg>"
    )


def glyph_only(width: int, color: str) -> Image.Image:
    """옷걸이 글립만 — **실제 잉크 영역으로 잘라서** 돌려준다.

    경로가 viewBox(26x26) 안에서 y 6.5~16.5에만 있어, 그대로 쓰면 위아래 빈칸이
    절반을 먹어 아이콘에서 작아 보인다. 알파 경계로 잘라 크기를 실제 글립 기준으로 잡는다.
    """
    big = render_svg(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 26 26">'
        f'<path d="{GLYPH}" fill="{color}"/>'
        "</svg>",
        1024,
    )
    cropped = big.crop(big.getbbox())
    h = round(cropped.height * width / cropped.width)
    return cropped.resize((width, h), Image.LANCZOS)


def app_icon(px: int, glyph_ratio: float) -> Image.Image:
    """홈 화면 아이콘 — 슬레이트 바탕에 옷걸이를 앱 색으로 뚫는다.

    화면의 심볼은 옅은 회색 위 옅은 파랑이라 대비가 낮다. 60px로 줄어드는
    홈 화면에서는 그대로 쓰면 뭉개져서, **원을 판 전체로 키워** 대비를 얻는다.
    색 관계(슬레이트 ↔ 앱 배경)는 로고 그대로다.
    """
    icon = Image.new("RGBA", (px, px), SLATE)
    g = glyph_only(round(px * glyph_ratio), APP)
    icon.paste(g, ((px - g.width) // 2, (px - g.height) // 2), g)
    return icon


def og_card() -> Image.Image:
    """공유 카드 — 홈 화면 로고줄(.brandrow)을 그대로 옮긴 구성."""
    W, H = 1200, 630
    card = Image.new("RGB", (W, H), APP)

    mark_px = 190
    mark = render_svg(mark_svg(SLATE, APP), mark_px)

    f_title = ImageFont.truetype(str(FONTS / "Pretendard-ExtraBold.otf"), 168)
    f_sub = ImageFont.truetype(str(FONTS / "Pretendard-SemiBold.otf"), 44)
    tagline = "취향으로 변하는 티셔츠 무한 탐색"

    probe = ImageDraw.Draw(card)
    title_w = probe.textlength("aTee", font=f_title)
    gap = 34  # 심볼과 워드마크 사이 (home-shell의 gap-2를 키운 비율)
    row_w = mark_px + gap + title_w
    row_x = (W - row_w) / 2
    row_cy = H / 2 - 46

    # 워드마크 — .emboss (밝은 그림자 왼위, 어두운 그림자 오른아래)
    tx = row_x + mark_px + gap
    for dx, dy, color in ((-3, -3, SH_L), (3, 3, SH_D)):
        probe.text((tx + dx, row_cy + dy), "aTee", font=f_title, fill=color, anchor="lm")
    probe.text((tx, row_cy), "aTee", font=f_title, fill=SLATE, anchor="lm")

    card.paste(mark, (round(row_x), round(row_cy - mark_px / 2)), mark)

    probe.text((W / 2, row_cy + 152), tagline, font=f_sub, fill="#6b7280", anchor="mm")
    return card


ICONS.mkdir(parents=True, exist_ok=True)
made = []

for px in (192, 512):
    p = ICONS / f"icon-{px}.png"
    app_icon(px, 0.56).convert("RGB").save(p, optimize=True)
    made.append(p)

# 마스크 대응 — 안드로이드가 모서리를 깎아도 글립이 안 잘리게 안전 영역(중앙 80%) 안에
p = ICONS / "icon-512-maskable.png"
app_icon(512, 0.42).convert("RGB").save(p, optimize=True)
made.append(p)

p = ICONS / "apple-touch-icon.png"
app_icon(180, 0.56).convert("RGB").save(p, optimize=True)
made.append(p)

p = PUBLIC / "og.png"
og_card().save(p, optimize=True)
made.append(p)

for f in made:
    print(f"{f.relative_to(FRONTEND)}  {Image.open(f).size}  {f.stat().st_size // 1024}KB")
