import json, urllib.parse, time, os, sys, subprocess, gzip

D = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(D, 'corpus.json.gz')


def get(url, tries=3):
    for i in range(tries):
        r = subprocess.run(['curl', '-s', '--max-time', '50', '-A', 'research/1.0', url],
                           capture_output=True, text=True)
        try:
            return json.loads(r.stdout)
        except Exception:
            sys.stderr.write(f'retry {i} {url[:100]}\n')
            time.sleep(3 + i * 3)
    return None


def arctic(sub, q, pages=3):
    out, before = [], None
    for _ in range(pages):
        p = {'subreddit': sub, 'query': q, 'limit': 100, 'sort': 'desc'}
        if before:
            p['before'] = before
        d = get('https://arctic-shift.photon-reddit.com/api/posts/search?' + urllib.parse.urlencode(p))
        items = (d or {}).get('data', [])
        if not items:
            break
        out += items
        before = min(i['created_utc'] for i in items)
        time.sleep(0.8)
    return out


SUBS = ['findfashion', 'HelpMeFind', 'streetwear', 'malefashionadvice', 'femalefashionadvice']
QUERIES = ['print', 'graphic', 'tee', 'shirt', 'hoodie', 'logo', 'sweatshirt']
KEEP = ('id', 'subreddit', 'title', 'selftext', 'permalink', 'created_utc', 'num_comments', 'link_flair_text')

seen, corpus = set(), []
for sub in SUBS:
    for q in QUERIES:
        for post in arctic(sub, q, pages=3):
            k = post.get('id')
            if k and k not in seen:
                seen.add(k)
                corpus.append({kk: post.get(kk) for kk in KEEP})
        sys.stderr.write(f'{sub}/{q}: total {len(corpus)}\n')
        json.dump(corpus, gzip.open(OUT, 'wt', encoding='utf-8'))

print('TOTAL', len(corpus))
