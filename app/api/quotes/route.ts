import {z} from 'zod';
import {notableQuotes,isAgentReady} from '@/lib/agent';
import {sessionIdentity} from '@/lib/session';
import {crateDb} from '@/db/crate';
import type {Lookup} from '@/lib/corner-schema';
import {quota} from '@/lib/quota';
import {overLimit,tooMany} from '@/lib/limit';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;

// POST {id, choice} -> {quotes:[{text,speaker?,url}]} for the confirmed work of a lookup the visitor owns.
// Shown, written into the room, while the triangle is being built. Always answers; an empty list is fine.
const input=z.object({id:z.string().uuid(),choice:z.number().int().min(0).max(2)});
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
export async function POST(request:Request){
 const user=sessionIdentity(request);if(!user)return reply({quotes:[]},401);
 if(overLimit(request,'quotes',12))return tooMany();
 if(request.headers.get('sec-fetch-site')==='cross-site')return reply({quotes:[]},403);
 if(!isAgentReady())return reply({quotes:[]});
 const parsed=input.safeParse(await request.json().catch(()=>null));if(!parsed.success)return reply({quotes:[]},400);
 try{
  const row=await crateDb().prepare('SELECT lookup FROM corner_draft WHERE id=? AND user_id=?').bind(parsed.data.id,user).first<{lookup:string}>();
  const seed=row?(JSON.parse(row.lookup) as Lookup).matches[parsed.data.choice]:null;
  if(!seed)return reply({quotes:[]},404);
  await quota(user,'quotes',20);
  return reply({quotes:await notableQuotes(seed)});
 }catch{return reply({quotes:[]})}
}
