import json, re, os, datetime, gzip

D = os.path.dirname(os.path.abspath(__file__))
corpus = json.load(gzip.open(os.path.join(D, 'corpus.json.gz'), 'rt', encoding='utf-8'))

COLORS = (r"black|white|red|blue|navy|green|yellow|orange|purple|pink|brown|grey|gray|beige|cream|"
          r"tan|khaki|olive|maroon|burgundy|teal|turquoise|lavender|lilac|mint|peach|coral|gold|"
          r"silver|charcoal|ivory|off[- ]white|sage|rust|mustard|magenta|crimson|indigo|violet")
TOP = (r"tee|t-shirt|tshirt|t shirt|shirt|hoodie|hoody|sweatshirt|crewneck|jumper|sweater|"
       r"jersey|longsleeve|long sleeve|long-sleeve|pullover")
# graphic-print vocabulary (NOT all-over fabric patterns)
GFX = (r"graphic|logo|artwork|art work|lettering|letters|text|font|writing|wording|embroider\w*|"
       r"decal|screen ?print|emblem|wordmark|slogan|illustration|drawing|design|print|motif|image|character")
# words that turn "print" into an all-over fabric pattern, not a placed graphic
PATTERN = (r"leopard|floral|paisley|cheetah|zebra|animal|camo|camouflage|plaid|tie[- ]?dye|polka|"
           r"hibiscus|greek|ditsy|snake|giraffe|houndstooth|gingham|tartan|abstract|marble|"
           r"stripe\w*|checker\w*|argyle|batik|damask|toile|geometric|cow")
POSITION = (r"front|back|chest|sleeve\w*|pocket|rear|shoulder|hem|all[- ]over|breast")

re_gfx = re.compile(rf"\b({GFX})\b", re.I)
re_top = re.compile(rf"\b({TOP})\b", re.I)
# "tee dress"는 원피스. "dress shirt"는 셔츠 — dress가 뒤에 올 때만 제외한다.
re_dress = re.compile(rf"\b({TOP})\s+dress\b", re.I)
assert re_dress.search("Mini Tee Dress") and re_dress.search("Peacock Print T-Shirt Dress")
assert not re_dress.search("floral dress shirt ideas") and not re_dress.search("DC Shoes t-shirt")
# a graphic mention that is NOT immediately preceded by a fabric-pattern word
re_gfx_clean = re.compile(rf"(?<!\w)(?:(?!\b(?:{PATTERN})\b\s+)\w+\s+){{0,1}}\b({GFX})\b", re.I)

re_base = re.compile(rf"\b({COLORS})\b[\s,]+(?:[\w'-]+[\s,]+){{0,3}}\b({TOP})\b", re.I)
re_base2 = re.compile(rf"\b({TOP})\b[^.]{{0,25}}?\b(?:is|was|in|are|were|,)\s+(?:a\s+)?\b({COLORS})\b", re.I)
re_pc1 = re.compile(rf"\b({COLORS})\b[\s,]+(?:[\w'-]+[\s,]+){{0,2}}\b({GFX})\b", re.I)
re_pc2 = re.compile(rf"\b({GFX})\b[\s,]+(?:is\s+|was\s+|in\s+|of\s+|with\s+|reads?\s+)?(?:a\s+)?\b({COLORS})\b", re.I)


BRAND = re.compile(r"\bold\s+$", re.I)              # "Old Navy" is a brand, not a colour
# connectors that mean the colour belongs to the garment, not to the graphic
CONNECT = re.compile(r"\b(with|and|featuring|plus|over|under|but|has|had|having|w/)\b", re.I)


def _brandish(txt, i):
    return bool(BRAND.search(txt[max(0, i - 6):i]))


def print_color(txt):
    """colour tied to a graphic word; rejects 'leopard print' and 'olive with a print'."""
    for m in re_pc1.finditer(txt):
        if _brandish(txt, m.start(1)):
            continue
        pre = txt[max(0, m.start(2) - 22):m.start(2)].lower()
        if re.search(rf"\b({PATTERN})\b\s*$", pre):
            continue
        if CONNECT.search(m.group(0)[len(m.group(1)):]):   # "olive with a print" -> base, not print
            continue
        return True
    for m in re_pc2.finditer(txt):
        pre = txt[max(0, m.start(1) - 22):m.start(1)].lower()
        if re.search(rf"\b({PATTERN})\b\s*$", pre):
            continue
        if _brandish(txt, m.start(2)):
            continue
        return True
    return False


def base_color(txt):
    for rx in (re_base, re_base2):
        for m in rx.finditer(txt):
            ci = m.start(1) if rx is re_base else m.start(2)
            if not _brandish(txt, ci):
                return True
    return False
re_pos = re.compile(rf"\b({POSITION})\b", re.I)

FINDWORD = re.compile(r"\bfind\b|\bidentify\b|\blooking for\b|\bwhere .{0,20}(buy|get|from)\b|"
                      r"\bsauce\b|\banyone know\b|\bsimilar\b|\bdupe\b|\bhelp\b|\bwhat .{0,15}(shirt|tee|hoodie|brand)\b", re.I)
ASKSUBS = {'findfashion', 'HelpMeFind'}


def pattern_only(txt):
    """True if every 'print' mention is a fabric pattern (leopard print etc.) and no other gfx word."""
    for m in re.finditer(rf"\b({GFX})\b", txt, re.I):
        pre = txt[max(0, m.start() - 22):m.start()].lower()
        if not re.search(rf"\b({PATTERN})\b\s*$", pre):
            return False
    return True


TIMEBACK = re.compile(r"back\s+(in|then|when|to)\b|back\s+in\s+the\s+day", re.I)


def print_pos(txt):
    """position word that actually refers to where the GRAPHIC sits."""
    for m in re.finditer(rf"\b({POSITION})\b", txt, re.I):
        if m.group(1).lower() == 'back' and TIMEBACK.match(txt[m.start():m.start() + 20]):
            continue
        seg = txt[max(0, m.start() - 60):m.end() + 60]
        if re.search(rf"\b({GFX})\b", seg, re.I):
            return True
    return False


def near(txt, word_re, anchor_re, window=70):
    """anchor within `window` chars of a word_re match"""
    for m in re.finditer(word_re, txt, re.I):
        seg = txt[max(0, m.start() - window):m.end() + window]
        if re.search(anchor_re, seg, re.I):
            return True
    return False


rows = []
for p in corpus:
    title = p.get('title') or ''
    txt = (title + '\n' + (p.get('selftext') or '')).strip()
    if len(txt) < 15 or not re_gfx.search(txt) or not re_top.search(txt):
        continue
    if pattern_only(txt):
        continue                                   # all-over fabric pattern, not a placed graphic
    if re_dress.search(title):
        continue                                   # "tee/t-shirt/sweatshirt dress" = 원피스지 상의가 아님
    if not re_top.search(title):
        continue                                   # keep only posts whose TITLE is about a top
    if p['subreddit'] not in ASKSUBS and not FINDWORD.search(txt):
        continue
    rows.append({
        'id': p['id'], 'sub': p['subreddit'], 'title': title, 'body': p.get('selftext') or '',
        'url': 'https://reddit.com' + (p.get('permalink') or ''),
        'year': datetime.datetime.fromtimestamp(p['created_utc'], datetime.UTC).year,
        'base': base_color(txt),
        'pcol': print_color(txt),
        'pos': print_pos(txt),
        'pos_loose': near(txt, rf"\b({POSITION})\b", rf"\b({GFX}|{TOP})\b", 70),
        'txt': txt,
    })

seen, ded = set(), []
for r in rows:
    k = re.sub(r'\W+', '', r['title'].lower())[:80]
    if k not in seen:
        seen.add(k)
        ded.append(r)
rows = ded

n = len(rows)
print(f'n={n}')
print('바탕색 언급 :', sum(r['base'] for r in rows))
print('프린트색 언급:', sum(r['pcol'] for r in rows))
print('위치 언급   :', sum(r['pos'] for r in rows))
print('base+pcol 둘다(분리서술):', sum(r['base'] and r['pcol'] for r in rows))
print('base+pcol+pos 셋다     :', sum(r['base'] and r['pcol'] and r['pos'] for r in rows))
print('아무 색도 안씀:', sum((not r['base']) and (not r['pcol']) for r in rows))
print('by sub:', {s: sum(1 for r in rows if r['sub'] == s) for s in sorted({r['sub'] for r in rows})})
print('by year:', dict(sorted({y: sum(1 for r in rows if r['year'] == y) for y in {r['year'] for r in rows}}.items())))
json.dump(rows, open(os.path.join(D, 'rows.json'), 'w'))
