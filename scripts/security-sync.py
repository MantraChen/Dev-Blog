#!/usr/bin/env python3
"""Public vulnerability feed cache. Python stdlib only; never executes feed content."""
import argparse, concurrent.futures, csv, datetime as dt, hashlib, io, json, os
from pathlib import Path
import re, sqlite3, subprocess, sys, time, urllib.error, urllib.parse, urllib.request, zipfile, tarfile

ECOSYSTEMS = ('npm', 'PyPI', 'Maven', 'crates.io', 'Go')
BUCKET = 'https://storage.googleapis.com/osv-vulnerabilities/'
UA = 'HowieLog-Security/1.0 (+https://howielog.com/security)'
KEV_FEED = 'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json'
KEV_MIRROR = 'https://raw.githubusercontent.com/cisagov/kev-data/develop/known_exploited_vulnerabilities.json'
SCHEMA = '''
CREATE TABLE IF NOT EXISTS records(source TEXT,id TEXT,body TEXT,hash TEXT,PRIMARY KEY(source,id));
CREATE TABLE IF NOT EXISTS states(source TEXT PRIMARY KEY,last_attempt TEXT,last_success TEXT,cursor TEXT,error TEXT,count INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS entries(id TEXT PRIMARY KEY,title TEXT,summary TEXT,ecosystems TEXT,packages TEXT,severity TEXT,exploited INTEGER,withdrawn INTEGER,published TEXT,modified TEXT,body TEXT);
CREATE TABLE IF NOT EXISTS aliases(alias TEXT PRIMARY KEY,id TEXT);
CREATE INDEX IF NOT EXISTS entries_date ON entries(modified DESC);
CREATE INDEX IF NOT EXISTS entries_kev ON entries(exploited,modified DESC);
CREATE VIRTUAL TABLE IF NOT EXISTS security_search USING fts5(id UNINDEXED,text,tokenize='unicode61');
'''

def now():
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds').replace('+00:00','Z')

def fetch(url, limit=16*1024*1024):
    # Only fixed, official source endpoints are requested. Redirects remain HTTPS.
    if url != KEV_FEED and not url.startswith(('https://storage.googleapis.com/osv-vulnerabilities/', 'https://raw.githubusercontent.com/cisagov/kev-data/', 'https://raw.githubusercontent.com/github/advisory-database/main/', 'https://codeload.github.com/github/advisory-database/')):
        raise ValueError('unapproved feed URL')
    for attempt in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':UA}),timeout=45) as r:
                if not r.geturl().startswith('https://'): raise ValueError('non-HTTPS redirect')
                data=r.read(limit+1)
                if len(data)>limit: raise ValueError('feed size limit exceeded')
                return data
        except (OSError,ValueError):
            if attempt==2: raise
            time.sleep(2**attempt)

def put(db,source,record):
    rid=record.get('id') or record.get('cveID')
    if not isinstance(rid,str) or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.:+/-]{2,180}',rid):
        raise ValueError('invalid advisory identifier')
    body=json.dumps(record,ensure_ascii=False,sort_keys=True,separators=(',',':'))
    digest=hashlib.sha256(body.encode()).hexdigest()
    db.execute('INSERT INTO records VALUES(?,?,?,?) ON CONFLICT(source,id) DO UPDATE SET body=excluded.body,hash=excluded.hash WHERE hash<>excluded.hash',(source,rid,body,digest))

def state(db,source,**fields):
    db.execute('INSERT OR IGNORE INTO states(source) VALUES(?)',(source,))
    for key,value in fields.items():
        assert key in {'last_attempt','last_success','cursor','error','count'}
        db.execute(f'UPDATE states SET {key}=? WHERE source=?',(value,source))
    db.commit()

def github(db,work):
    old=db.execute('SELECT cursor FROM states WHERE source=?',('GitHub',)).fetchone()
    cursor=json.loads(old[0]) if old and old[0] else {}
    started=now()
    snapshot=cursor.get('snapshot')
    if not snapshot or dt.datetime.now(dt.timezone.utc)-dt.datetime.fromisoformat(snapshot.replace('Z','+00:00'))>dt.timedelta(days=7):
        return github_snapshot(db, started)
    try:
        return github_delta(db, cursor, started)
    except OSError:
        print('GitHub delta unavailable. Refreshing from its official snapshot.', file=sys.stderr, flush=True)
        return github_snapshot(db, started)


def github_snapshot(db, started):
    archive=fetch('https://codeload.github.com/github/advisory-database/tar.gz/refs/heads/main',256*1024*1024)
    records=[]
    with tarfile.open(fileobj=io.BytesIO(archive),mode='r|gz') as tar:
        for member in tar:
            if '/advisories/github-reviewed/' in member.name and member.name.endswith('.json') and member.isfile():
                if member.size>8*1024*1024:raise ValueError('oversized GitHub advisory')
                records.append(json.load(tar.extractfile(member)))
    if len(records)<1000: raise ValueError('GitHub snapshot incomplete')
    previous=db.execute("SELECT count(*) FROM records WHERE source='GitHub'").fetchone()[0]
    if previous and len(records)<previous*0.9:raise ValueError('unexpected GitHub snapshot shrink')
    db.execute('CREATE TEMP TABLE IF NOT EXISTS gh_seen(id TEXT PRIMARY KEY)')
    db.execute('DELETE FROM gh_seen')
    for record in records:
        put(db,'GitHub',record)
        db.execute('INSERT INTO gh_seen VALUES(?)',(record['id'],))
    # Deleted upstream records remain as withdrawn notices rather than disappearing.
    for rid,body in db.execute("SELECT id,body FROM records WHERE source='GitHub' AND id NOT IN (SELECT id FROM gh_seen)").fetchall():
        record=json.loads(body); record['withdrawn']=record.get('withdrawn') or now()
        put(db,'GitHub',record)
    return json.dumps({'snapshot':started,'index':started})


def github_delta(db, cursor, started):
    # OSV's officially documented newest-first index discovers GHSA changes without
    # a GitHub API token. The record itself is fetched from GitHub's official repo.
    boundary=dt.datetime.fromisoformat(cursor['index'].replace('Z','+00:00'))-dt.timedelta(hours=24)
    request=urllib.request.Request(BUCKET+'modified_id.csv',headers={'User-Agent':UA})
    pending={}
    with urllib.request.urlopen(request,timeout=45) as response:
        for date,path in csv.reader(io.TextIOWrapper(response,encoding='utf-8')):
            if dt.datetime.fromisoformat(date.replace('Z','+00:00'))<boundary:break
            eco,_,rid=path.rpartition('/')
            if not re.fullmatch(r'GHSA-[23456789cfghjmpqrvwx]{4}(?:-[23456789cfghjmpqrvwx]{4}){2}',rid):continue
            known=db.execute("SELECT body FROM records WHERE source='GitHub' AND id=?",(rid,)).fetchone()
            if known and dt.datetime.fromisoformat(json.loads(known[0])['modified'].replace('Z','+00:00'))>=dt.datetime.fromisoformat(date.replace('Z','+00:00')):continue
            pending[rid]=eco
    def get(pair):
        rid,eco=pair
        enriched=json.loads(fetch(BUCKET+urllib.parse.quote(eco,safe='')+'/'+rid+'.json'))
        if enriched.get('id') != rid:
            raise ValueError('OSV advisory does not match the requested ID')
        if (enriched.get('database_specific') or {}).get('github_reviewed') is not True:
            return None
        published=dt.datetime.fromisoformat(enriched['published'].replace('Z','+00:00'))
        url=f'https://raw.githubusercontent.com/github/advisory-database/main/advisories/github-reviewed/{published.year}/{published.month:02d}/{rid}/{rid}.json'
        try:
            return json.loads(fetch(url))
        except OSError:
            # OSV already imported this reviewed GitHub advisory. Use that
            # record when direct transport fails to avoid a full archive for
            # a single missing download.
            return enriched
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        records = list(pool.map(get, pending.items()))
    # A failed delta can be replaced by a complete official snapshot.
    for record in records:
        if record:
            put(db, 'GitHub', record)
    return json.dumps({'snapshot':cursor['snapshot'],'index':started})

def kev(db):
    try:
        payload = fetch(KEV_FEED)
    except OSError:
        payload = fetch(KEV_MIRROR)
    data = json.loads(payload)
    records=data.get('vulnerabilities',[])
    if data.get('count')!=len(records) or len(records)<100: raise ValueError('KEV snapshot incomplete')
    old=db.execute("SELECT count(*) FROM records WHERE source='CISA KEV'").fetchone()[0]
    if old and len(records)<old*0.9: raise ValueError('unexpected KEV catalog shrink')
    db.execute("DELETE FROM records WHERE source='CISA KEV'")
    for record in records: put(db,'CISA KEV',record)
    return data['catalogVersion']

def osv(db,eco):
    source='OSV / '+eco
    row=db.execute('SELECT cursor FROM states WHERE source=?',(source,)).fetchone()
    cursor=row[0] if row else None
    root=BUCKET+urllib.parse.quote(eco,safe='')+'/'
    # Index is newest-first. Save its high-water mark only after every changed record succeeds.
    index=fetch(root+'modified_id.csv',32*1024*1024).decode()
    pending=[]; high=None
    for date,rid in csv.reader(io.StringIO(index)):
        high=high or date
        if cursor and date<cursor: break  # Include equal timestamps for boundary safety.
        if rid.startswith('MAL-'): continue  # Malware packages are outside this vulnerability feed.
        if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.:+-]{2,180}',rid): raise ValueError('invalid OSV path')
        # GitHub-reviewed data already comes directly from its authoritative repository.
        if rid.startswith('GHSA-') and db.execute("SELECT 1 FROM records WHERE source='GitHub' AND id=?",(rid,)).fetchone(): continue
        pending.append(rid)
    if not cursor and len(pending)>1000:
        # First run: one bounded archive, not thousands of individual API calls.
        archive=fetch(root+'all.zip',384*1024*1024)
        with zipfile.ZipFile(io.BytesIO(archive)) as z:
            for info in z.infolist():
                if info.file_size>8*1024*1024: raise ValueError('oversized OSV record')
                rid=Path(info.filename).stem
                if not info.filename.endswith('.json') or rid.startswith('MAL-'): continue
                if rid.startswith('GHSA-') and db.execute("SELECT 1 FROM records WHERE source='GitHub' AND id=?",(rid,)).fetchone(): continue
                put(db,source,json.loads(z.read(info)))
    else:
        def get(rid): return json.loads(fetch(root+urllib.parse.quote(rid,safe='')+'.json',8*1024*1024))
        # Failed records fail the source, retaining its old cursor for automatic retry.
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
            for record in pool.map(get,pending): put(db,source,record)
    return high or cursor or now()

def safe_link(value):
    try:
        u=urllib.parse.urlsplit(value)
        return value if u.scheme=='https' and u.hostname and not u.username and not u.password else None
    except (TypeError,ValueError): return None

def severity(value):
    value=str(value or 'unknown').lower()
    return {'moderate':'medium'}.get(value,value) if value in ('low','medium','moderate','high','critical') else 'unknown'

def normalized(source,r):
    iskev=source=='CISA KEV'
    rid=r.get('id') or r['cveID']
    aliases=[rid]+[x for x in r.get('aliases',[]) if isinstance(x,str)]
    affected=[]
    for item in r.get('affected',[]):
        package=item.get('package',{})
        affected.append({'package':package.get('name','未提供组件名'),'ecosystem':package.get('ecosystem','未知'),
            'ranges':item.get('ranges',[]),'versions':item.get('versions',[])})
    if iskev: affected=[{'package':r.get('vendorProject','')+' / '+r.get('product',''),'ecosystem':'Vendor','ranges':[],'versions':[]}]
    assessments=[]
    dbspecific=r.get('database_specific') or {}
    level=severity(dbspecific.get('severity'))
    for s in r.get('severity',[]): assessments.append({'source':source,'type':s.get('type',''),'value':str(s.get('score',''))})
    if level!='unknown': assessments.append({'source':source,'type':'severity','value':level})
    links=[x.get('url') for x in r.get('references',[]) if safe_link(x.get('url'))]
    primary=('https://www.cisa.gov/known-exploited-vulnerabilities-catalog' if iskev else 'https://github.com/advisories/'+rid if source=='GitHub' else 'https://osv.dev/vulnerability/'+urllib.parse.quote(rid,safe=''))
    return {'source':source,'id':rid,'aliases':aliases,'title':r.get('summary') or r.get('vulnerabilityName') or rid,
        'description':(r.get('details') or r.get('shortDescription') or '')[:12000], 'affected':affected,'severity':level,'assessments':assessments,
        'published':r.get('published') or '', 'modified':r.get('modified') or '', 'withdrawn':r.get('withdrawn') or '',
        'exploited':iskev,'kevAdded':r.get('dateAdded') if iskev else None,'action':r.get('requiredAction') if iskev else None,
        'url':primary,'references':list(dict.fromkeys(links))[:25]}

def materialize(db):
    # A prior GitHub outage may have bootstrapped GHSA copies through OSV. Once
    # authoritative records are available, drop these copies to prevent stale
    # duplicate versions or withdrawal flags from surviving future delta syncs.
    db.execute("DELETE FROM records WHERE source LIKE 'OSV / %' AND id IN (SELECT id FROM records WHERE source='GitHub')")
    db.execute('UPDATE states SET count=(SELECT count(*) FROM records WHERE records.source=states.source)')
    rows=[normalized(source,json.loads(body)) for source,body in db.execute('SELECT source,body FROM records ORDER BY source,id')]
    parent={}
    def find(x):
        parent.setdefault(x,x)
        if parent[x]!=x: parent[x]=find(parent[x])
        return parent[x]
    for r in rows:
        for alias in r['aliases'][1:]: parent[find(alias)]=find(r['id'])
    groups={}
    for r in rows: groups.setdefault(find(r['id']),[]).append(r)
    db.execute('DELETE FROM entries'); db.execute('DELETE FROM aliases'); db.execute('DELETE FROM security_search')
    for records in groups.values():
        records.sort(key=lambda r:(r['source']!='GitHub',r['source']=='CISA KEV',r['id']))
        aliases=sorted({a for r in records for a in r['aliases']},key=lambda a:(not a.startswith('CVE-'),not a.startswith('GHSA-'),a))
        key=aliases[0]; preferred=next((r for r in records if not r['withdrawn'] and not r['exploited']),records[0])
        # Withdrawals are source-specific: never let a withdrawn GHSA erase an active CVE/OSV notice.
        withdrawn=all(bool(r['withdrawn']) for r in records)
        exploited=any(r['exploited'] for r in records)
        levels=[r['severity'] for r in records if not r['withdrawn'] and r['severity']!='unknown']
        level=levels[0] if levels else 'unknown'
        affected=[dict(item,source=r['source'],record=r['id']) for r in records for item in r['affected']]
        packages=sorted({p['package'] for p in affected}); ecosystems=sorted({p['ecosystem'] for p in affected})
        dates=[r['published'] for r in records if r['published']]
        updates=[r['modified'] or ((r['kevAdded'] or '')+'T00:00:00Z' if r['kevAdded'] else '') for r in records]
        published=min(dates) if dates else ''; modified=max(updates) or published
        labels={'critical':'严重','high':'高危','medium':'中危','low':'低危','unknown':'未评级'}
        summary=f"涉及 {', '.join(packages[:3]) or '上游未提供组件'}。来源评级：{labels[level]}；"+('CISA KEV 已确认存在实际利用。' if exploited else '本地 KEV 数据未标记；不代表没有实际利用。')+'影响范围和修复节点请按下列来源记录核对；未提供的信息保持未知。'
        if withdrawn: summary='该公告已被所有收录来源撤回，请勿依据旧摘要判断风险。'+summary
        body={'id':key,'aliases':aliases,'title':preferred['title'],'summary':summary,'records':records,'affected':affected,'severity':level,'exploited':exploited,'withdrawn':withdrawn,'published':published,'modified':modified,'ecosystems':ecosystems,'packages':packages}
        db.execute('INSERT INTO entries VALUES(?,?,?,?,?,?,?,?,?,?,?)',(key,body['title'],summary,json.dumps(ecosystems),json.dumps(packages),level,int(exploited),int(withdrawn),published,modified,json.dumps(body,ensure_ascii=False)))
        db.executemany('INSERT INTO aliases VALUES(?,?)',[(alias,key) for alias in aliases])
        db.execute('INSERT INTO security_search VALUES(?,?)',(key,' '.join(aliases+packages+ecosystems+[body['title'],summary])))
    return len(groups)

def sync_source(db, source, fetch_records):
    with db:
        state(db, source, last_attempt=now())
    try:
        with db:
            cursor = fetch_records()
            published = materialize(db)
            count = db.execute('SELECT count(*) FROM records WHERE source=?', (source,)).fetchone()[0]
            state(db, source, last_success=now(), cursor=cursor, error=None, count=count)
        return count, published
    except Exception as error:
        with db:
            state(db, source, error=type(error).__name__)
        raise


def main():
    import fcntl  # Linux advisory lock; normalization tests also run on Windows.
    parser=argparse.ArgumentParser(); parser.add_argument('--data',required=True); parser.add_argument('--work',required=True)
    parser.add_argument('--source',choices=['all','github','kev','osv'],default='all')
    args=parser.parse_args(); os.umask(0o077)
    data=Path(args.data); work=Path(args.work); data.mkdir(parents=True,exist_ok=True); work.mkdir(parents=True,exist_ok=True)
    with (work/'sync.lock').open('w') as lock:
        try: fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError: print('Security sync already running'); return
        db=sqlite3.connect(data/'security.db',timeout=30); db.execute('pragma journal_mode=WAL'); db.executescript(SCHEMA)
        tasks=[]
        if args.source in ('all','github'): tasks.append(('GitHub',lambda:github(db,work)))
        if args.source in ('all','kev'): tasks.append(('CISA KEV',lambda:kev(db)))
        if args.source in ('all','osv'): tasks.extend(('OSV / '+eco,lambda eco=eco:osv(db,eco)) for eco in ECOSYSTEMS)
        errors=[]
        count=db.execute('SELECT count(*) FROM entries').fetchone()[0]
        for source,fn in tasks:
            try:
                source_count,count=sync_source(db,source,fn)
                print(json.dumps({'source':source,'records':source_count,'ok':True}),flush=True)
            except Exception as error:
                errors.append(source); print(json.dumps({'source':source,'ok':False,'error':type(error).__name__}),flush=True)
        assert db.execute('pragma quick_check').fetchone()[0]=='ok'
        print(json.dumps({'entries':count,'failedSources':errors,'finished':now()}),flush=True)
        db.close()
        if errors: sys.exit(1)

if __name__=='__main__': main()
