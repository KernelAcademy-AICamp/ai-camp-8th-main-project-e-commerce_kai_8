import json, sys, glob, os, re, datetime
D = os.path.dirname(os.path.abspath(__file__))
CLOTH = re.compile(r'\b(shirt|t-?shirt|tee|tees|hoodie|sweater|jacket|dress|pants|jeans|clothing|clothes|apparel|outfit|garment|top|shorts|sweatshirt|graphic tee|blouse|skirt|coat|cardigan)\b', re.I)
SHOP = re.compile(r'\b(shop|store|site|website|online|amazon|asos|zara|uniqlo|shein|etsy|ebay|nordstrom|retail|search|filter|browse|depop|poshmark|grailed)\b', re.I)

def load(f):
    with open(f) as fh:
        return json.load(fh).get('data') or []

def show(files, phrase, need_cloth=True, need_shop=False, limit=200):
    seen = set()
    out = []
    for f in files:
        for it in load(os.path.join(D, f)):
            body = it.get('selftext') or it.get('body') or ''
            title = it.get('title') or ''
            txt = title + '\n' + body
            if phrase and phrase.lower() not in txt.lower():
                continue
            if need_cloth and not CLOTH.search(txt):
                continue
            if need_shop and not SHOP.search(txt):
                continue
            pm = it.get('permalink') or ''
            if pm in seen: continue
            seen.add(pm)
            yr = datetime.datetime.utcfromtimestamp(it.get('created_utc',0)).year
            out.append((f, it.get('subreddit'), yr, pm, title[:120], txt))
    print(f"### phrase={phrase!r} files={files} -> {len(out)} hits")
    for f, sub, yr, pm, title, txt in out[:limit]:
        print(f"\n--- [{f}] r/{sub} {yr} https://reddit.com{pm}\nTITLE: {title}\nTEXT: {txt[:900]}")

if __name__ == '__main__':
    import argparse
    p = argparse.ArgumentParser()
    p.add_argument('phrase')
    p.add_argument('files', nargs='+')
    p.add_argument('--nocloth', action='store_true')
    p.add_argument('--shop', action='store_true')
    p.add_argument('--limit', type=int, default=200)
    a = p.parse_args()
    show(a.files, a.phrase, not a.nocloth, a.shop, a.limit)
