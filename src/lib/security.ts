import Database from 'better-sqlite3';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

export interface AdvisoryRecord {
  source: string; id: string; title: string; description: string; severity: string;
  published: string; modified: string; withdrawn: string; exploited: boolean;
  kevAdded: string | null; action: string | null; url: string; references: string[];
  assessments: {source: string; type: string; value: string}[];
}
export interface Affected {
  package: string; ecosystem: string; source: string; record: string;
  ranges: {type: string; repo?: string; events: Record<string,string>[]}[]; versions: string[];
}
export interface Advisory {
  id: string; aliases: string[]; title: string; summary: string; records: AdvisoryRecord[];
  affected: Affected[]; severity: string; exploited: boolean; withdrawn: boolean;
  published: string; modified: string; ecosystems: string[]; packages: string[];
}
export interface SourceState {source: string; last_attempt: string; last_success: string | null; error: string | null; count: number}
type SyncHealth = 'ok' | 'stale' | 'unavailable';
const expectedSources = ['GitHub', 'CISA KEV', 'OSV / npm', 'OSV / PyPI', 'OSV / Maven', 'OSV / crates.io', 'OSV / Go'];
const maxSyncAge = 3 * 60 * 60 * 1000;
const clockTolerance = 5000;
export const severityLabels: Record<string,string> = {critical:'严重',high:'高危',medium:'中危',low:'低危',unknown:'未评级'};
export const ecosystemOptions = ['npm','PyPI','Maven','crates.io','Go','Vendor'];
const path = () => process.env.SECURITY_DATABASE_PATH || join(dirname(process.env.DATABASE_PATH || 'data.db'),'security.db');
function read<T>(fn: (db: Database.Database)=>T, fallback:T):T {
  if (!existsSync(path())) return fallback;
  const db = new Database(path(),{readonly:true,fileMustExist:true,timeout:2000});
  try { return fn(db); } finally { db.close(); }
}
export function securityStatus() {
  return read(db => ({
    sources:db.prepare('SELECT source,last_attempt,last_success,error,count FROM states ORDER BY source').all() as SourceState[],
    total:(db.prepare('SELECT count(*) n FROM entries').get() as {n:number}).n,
    exploited:(db.prepare('SELECT count(*) n FROM entries WHERE exploited=1 AND withdrawn=0').get() as {n:number}).n,
  }),{sources:[] as SourceState[],total:0,exploited:0});
}
export function securitySyncHealth(now = Date.now()): SyncHealth {
  return read<SyncHealth>(db => {
    const published = db.prepare('SELECT 1 FROM entries LIMIT 1').get();
    if (!published) return 'unavailable';
    const states = db.prepare('SELECT source,last_success FROM states').all() as Pick<SourceState, 'source' | 'last_success'>[];
    const bySource = new Map(states.map(state => [state.source, state]));
    return expectedSources.every(source => !sourceStale(bySource.get(source), now)) ? 'ok' : 'stale';
  }, 'unavailable');
}
export function securityList(params: URLSearchParams, pageSize=24) {
  const q=(params.get('q')||'').trim().slice(0,120);
  const ecosystem=ecosystemOptions.includes(params.get('ecosystem')||'')?params.get('ecosystem')!:'';
  const severity=Object.hasOwn(severityLabels,params.get('severity')||'')?params.get('severity')!:'';
  const exploited=params.get('exploited')==='1';
  const withdrawn=params.get('withdrawn')==='1';
  const page=Math.max(1,Math.min(10000,Number.parseInt(params.get('page')||'1',10)||1));
  return read(db=>{
    const clauses=['withdrawn=?']; const args:(string|number)[]=[Number(withdrawn)];
    const terms=q.match(/[\p{L}\p{N}_-]+/gu)?.slice(0,8)||[];
    if(q&&!terms.length)clauses.push('0');
    if(terms.length){clauses.push('id IN (SELECT id FROM security_search WHERE security_search MATCH ?)');args.push(terms.map(t=>'"'+t.replaceAll('"','""')+'"*').join(' AND '));}
    if(ecosystem){clauses.push('EXISTS (SELECT 1 FROM json_each(entries.ecosystems) WHERE value=?)');args.push(ecosystem);}
    if(severity){clauses.push('severity=?');args.push(severity);}
    if(exploited)clauses.push('exploited=1');
    const where=clauses.join(' AND ');
    const total=(db.prepare(`SELECT count(*) n FROM entries WHERE ${where}`).get(...args) as {n:number}).n;
    const records=db.prepare(`SELECT body FROM entries WHERE ${where} ORDER BY modified DESC,id LIMIT ? OFFSET ?`).all(...args,pageSize,(page-1)*pageSize) as {body:string}[];
    return {items:records.map(r=>JSON.parse(r.body) as Advisory),total,page,q,ecosystem,severity,exploited,withdrawn};
  },{items:[] as Advisory[],total:0,page,q,ecosystem,severity,exploited,withdrawn});
}
export function securityDetail(id:string):Advisory|null {
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:+/-]{2,180}$/.test(id))return null;
  return read(db=>{
    const row=db.prepare('SELECT body FROM entries WHERE id=(SELECT id FROM aliases WHERE alias=?)').get(id) as {body:string}|undefined;
    return row?JSON.parse(row.body) as Advisory:null;
  },null);
}
export function securityDate(value:string|null|undefined){
  if(!value||!Number.isFinite(Date.parse(value)))return '未知';
  return new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value));
}
export function sourceStale(source: Pick<SourceState, 'last_success'> | undefined, now = Date.now()) {
  const age = now - Date.parse(source?.last_success ?? '');
  return !Number.isFinite(age) || age > maxSyncAge || age < -clockTolerance;
}
