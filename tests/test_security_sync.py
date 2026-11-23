import importlib.util, json, sqlite3, tempfile, unittest
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
