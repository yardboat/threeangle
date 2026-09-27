import {crateDb} from '@/db/crate';
import {CornerError} from './corner-error';

// Daily per-visitor limits on model calls. Off while the link is private; set QUOTA_ENFORCED=1 before a
// public launch. Atomic per-scope reservations; a failed provider call still consumes a slot.
export async function quota(user:string,kind:string,limit:number){
 if(process.env.QUOTA_ENFORCED!=='1')return;
 const day=new Date().toISOString().slice(0,10),db=crateDb();
 for(const [scope,max] of [[`${kind}:${user}:${day}`,limit],[`${kind}:all:${day}`,limit*10]] as const){
  const r=await db.prepare('INSERT INTO corner_usage (scope,count) VALUES (?,1) ON CONFLICT(scope) DO UPDATE SET count=corner_usage.count+1 WHERE corner_usage.count < ? RETURNING count').bind(scope,max).first();
  if(!r)throw new CornerError('Today’s custom-triangle limit has been reached. Come back tomorrow, or explore the curated topics.',429);
 }
}
