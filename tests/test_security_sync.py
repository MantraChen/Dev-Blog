import importlib.util, io, json, sqlite3, tempfile, unittest, urllib.error
from pathlib import Path
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('sync',Path(__file__).resolve().parents[1]/'scripts/security-sync.py')
sync=importlib.util.module_from_spec(spec); spec.loader.exec_module(sync)

class SecuritySyncTest(unittest.TestCase):
    def setUp(self):
        self.db=sqlite3.connect(':memory:');self.db.executescript(sync.SCHEMA)
    def tearDown(self): self.db.close()
    def put(self,source,record): sync.put(self.db,source,record);self.db.commit()
    def sample(self,id='GHSA-2345-2345-2345',**extra):
        return dict(id=id,aliases=['CVE-2026-12345'],summary='Test & <unsafe>',published='2026-01-01T00:00:00Z',modified='2026-02-01T00:00:00Z',affected=[{'package':{'ecosystem':'npm','name':'sample'},'ranges':[{'type':'SEMVER','events':[{'introduced':'0'},{'fixed':'2.0.0'}]}]}],database_specific={'severity':'HIGH'},**extra)
    def entry(self):return json.loads(self.db.execute('SELECT body FROM entries').fetchone()[0])
    def test_alias_merge_kev_and_fixed_events(self):
        self.put('GitHub',self.sample());self.put('OSV / npm',self.sample('OSV-2026-123'))
        self.put('CISA KEV',{'cveID':'CVE-2026-12345','vendorProject':'Vendor','product':'App','dateAdded':'2026-03-01','shortDescription':'Evidence','requiredAction':'Patch'})
        self.assertEqual(sync.materialize(self.db),1)
        entry=self.entry();self.assertTrue(entry['exploited']);self.assertEqual(entry['id'],'CVE-2026-12345')
        self.assertEqual(len(entry['records']),3);self.assertIn({'fixed':'2.0.0'},entry['affected'][0]['ranges'][0]['events'])
    def test_github_fallback_discards_partial_delta(self):
        first = 'GHSA-2345-2345-2346'
        second = 'GHSA-2345-2345-2347'
        started = sync.now()
        sync.state(self.db, 'GitHub', cursor=json.dumps({'snapshot': started, 'index': started}))
        self.db.commit()
        index = io.BytesIO(f'{started},npm/{first}\n{started},npm/{second}\n'.encode())

        def fetch(url, *args, **kwargs):
            if url.startswith(sync.BUCKET):
                if second in url:
                    raise urllib.error.URLError('fixture mirror outage')
                return json.dumps({'id': first, 'published': started, 'database_specific': {'github_reviewed': True}}).encode()
            if first in url:
                return json.dumps(self.sample(first)).encode()
            raise urllib.error.URLError('fixture connection reset')

        def snapshot(db, _started):
            self.assertEqual(db.execute('SELECT id FROM records').fetchall(), [])
            return 'official snapshot'

        with patch.object(sync.urllib.request, 'urlopen', return_value=index), \
             patch.object(sync, 'fetch', side_effect=fetch), \
             patch.object(sync, 'github_snapshot', side_effect=snapshot) as fallback, \
             patch.object(sync.sys, 'stderr', io.StringIO()):
            self.assertEqual(sync.github(self.db, Path('.')), 'official snapshot')
        fallback.assert_called_once()

    def test_github_uses_matching_reviewed_osv_record_on_raw_outage(self):
        started = sync.now()
        reviewed = self.sample()
        reviewed['database_specific']['github_reviewed'] = True
        index = io.BytesIO(f"{started},npm/{reviewed['id']}\n".encode())

        def fetch(url, *args, **kwargs):
            if url.startswith(sync.BUCKET):
                return json.dumps(reviewed).encode()
            self.assertEqual(kwargs, {'attempts': 1, 'timeout': 8})
            raise urllib.error.URLError('fixture raw outage')

        with patch.object(sync.urllib.request, 'urlopen', return_value=index), \
             patch.object(sync, 'fetch', side_effect=fetch):
            cursor = sync.github_delta(self.db, {'snapshot': started, 'index': started}, started)
        body, = self.db.execute("SELECT body FROM records WHERE source='GitHub'").fetchone()
        self.assertEqual(json.loads(body), reviewed)
        self.assertEqual(json.loads(cursor)['index'], started)

    def test_kev_uses_official_mirror_when_canonical_fetch_fails(self):
        records = [{'cveID': f'CVE-2026-{10000+i}'} for i in range(100)]
        payload = json.dumps({'catalogVersion': 'fixture', 'count': 100, 'vulnerabilities': records}).encode()
        with patch.object(sync, 'fetch', side_effect=[urllib.error.URLError('fixture outage'), payload]) as fetch:
            self.assertEqual(sync.kev(self.db), 'fixture')
        self.assertEqual([call.args[0] for call in fetch.call_args_list], [sync.KEV_FEED, sync.KEV_MIRROR])
        self.assertEqual(self.db.execute("SELECT count(*) FROM records WHERE source='CISA KEV'").fetchone()[0],100)

    def test_source_withdrawal_does_not_hide_other_active_source(self):
        self.put('GitHub',self.sample(withdrawn='2026-02-02T00:00:00Z'));self.put('OSV / npm',self.sample('OSV-2026-123'))
        sync.materialize(self.db);self.assertFalse(self.entry()['withdrawn'])
        self.put('OSV / npm',self.sample('OSV-2026-123',withdrawn='2026-02-03T00:00:00Z'))
        sync.materialize(self.db);self.assertTrue(self.entry()['withdrawn'])
    def test_kev_removal_and_idempotence(self):
        self.put('GitHub',self.sample());sync.materialize(self.db);first=self.entry()
        sync.materialize(self.db);self.assertEqual(first,self.entry());self.assertFalse(self.entry()['exploited'])
    def test_source_failure_keeps_old_cursor_and_records(self):
        sync.state(self.db,'OSV / npm',cursor='2026-01-01T00:00:00Z')
        def fetch(url,*args):
            if url.endswith('.csv'):return b'2026-03-01T00:00:00Z,OSV-2026-123\n'
            raise OSError('temporary outage')
        with patch.object(sync,'fetch',fetch),self.assertRaises(OSError):sync.osv(self.db,'npm')
        self.assertEqual(self.db.execute('SELECT cursor FROM states').fetchone()[0],'2026-01-01T00:00:00Z')
    def test_publication_failure_keeps_success_and_cursor_until_retry(self):
        self.put('GitHub',self.sample())
        sync.materialize(self.db)
        sync.state(self.db,'GitHub',last_success='2026-01-01T00:00:00Z',cursor='old')
        self.db.commit()
        original=self.entry()
        self.db.execute("""CREATE TRIGGER reject_entry BEFORE INSERT ON entries
                         BEGIN SELECT RAISE(ABORT, 'fixture failure'); END""")
        def change():
            sync.put(self.db,'GitHub',dict(self.sample(),summary='Revised title'))
            return 'next'
        with self.assertRaises(sqlite3.IntegrityError):
            sync.sync_source(self.db,'GitHub',change)
        fields='SELECT last_success,cursor,error FROM states WHERE source=?'
        self.assertEqual(self.db.execute(fields,('GitHub',)).fetchone(),('2026-01-01T00:00:00Z','old','IntegrityError'))
        self.assertEqual(self.entry(),original)
        self.assertEqual(json.loads(self.db.execute('SELECT body FROM records').fetchone()[0])['summary'],
                         self.sample()['summary'])
        self.db.execute('DROP TRIGGER reject_entry')
        with patch.object(sync,'now',return_value='2026-01-01T01:00:00Z'):
            self.assertEqual(sync.sync_source(self.db,'GitHub',change),(1,1))
        self.assertEqual(self.db.execute(fields,('GitHub',)).fetchone(),('2026-01-01T01:00:00Z','next',None))
        self.assertEqual(self.entry()['title'],'Revised title')
    def test_unsafe_reference_is_never_published_as_link(self):
        r=self.sample(references=[{'url':'javascript:alert(1)'},{'url':'https://example.com/patch'},{'url':'http://127.0.0.1'}])
        self.assertEqual(sync.normalized('GitHub',r)['references'],['https://example.com/patch'])
    def test_transitive_aliases(self):
        self.put('GitHub',self.sample());r=self.sample('OSV-2026-123');r['aliases']=['GHSA-2345-2345-2345','OSV-2026-456'];self.put('OSV / npm',r)
        self.assertEqual(sync.materialize(self.db),1);self.assertEqual(self.db.execute('SELECT count(*) FROM aliases').fetchone()[0],4)
    def test_fallback_ghsa_copy_cannot_override_authoritative_withdrawal(self):
        self.put('OSV / npm',self.sample());self.put('GitHub',self.sample(withdrawn='2026-02-02T00:00:00Z'))
        sync.materialize(self.db);self.assertTrue(self.entry()['withdrawn']);self.assertEqual(len(self.entry()['records']),1)

if __name__=='__main__':unittest.main()
