import {sessionIdentity,ensureSession} from '@/lib/session';
import { crateDb } from '@/db/crate';
import { topicIds } from '@/lib/stories';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export const maxDuration=300;
const respond=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
function identity(request:Request){return sessionIdentity(request)}
export async function GET(request:Request){
 const user=identity(request);if(!user)return ensureSession(request,respond({items:[]}));
 try{const {results}=await crateDb().prepare(`SELECT c.topic_id AS "topicId",c.saved_at AS "savedAt",d.result AS "customResult" FROM crate c LEFT JOIN corner_draft d ON c.topic_id = 'custom-' || d.id AND c.user_id=d.user_id WHERE c.user_id = ? ORDER BY c.saved_at DESC`).bind(user).all();return respond({items:results.map(r=>({...r,topic:r.customResult?JSON.parse(r.customResult as string):null,customResult:undefined}))});}
 catch(error){console.error('Crate load failed',error);return respond({error:'Your crate is temporarily unavailable. Please try again.'},503);}
}
async function mutate(request:Request,remove:boolean){
 const user=identity(request);if(!user)return respond({error:'Please reload before saving to your crate.'},401);
 const origin=request.headers.get('origin');if(request.headers.get('sec-fetch-site')==='cross-site'||(origin&&origin!==new URL(request.url).origin))return respond({error:'Please save from threeangle.'},403);
 let data:{topicId?:string};try{data=await request.json();}catch{return respond({error:'Choose a triangle to save.'},400);}
 if(!data||typeof data.topicId!=='string'||(!topicIds.includes(data.topicId)&&!/^custom-[0-9a-f-]{36}$/.test(data.topicId)))return respond({error:'This triangle is not in the pilot.'},400);
 try{if(!remove&&!topicIds.includes(data.topicId)){const owned=await crateDb().prepare('SELECT id FROM corner_draft WHERE id=? AND user_id=? AND result IS NOT NULL').bind(data.topicId.slice(7),user).first();if(!owned)return respond({error:'That custom triangle was not found.'},404);}if(remove)await crateDb().prepare('DELETE FROM crate WHERE user_id = ? AND topic_id = ?').bind(user,data.topicId).run();else await crateDb().prepare('INSERT INTO crate (user_id, topic_id, saved_at) VALUES (?, ?, ?) ON CONFLICT(user_id, topic_id) DO NOTHING').bind(user,data.topicId,Date.now()).run();return respond({ok:true,topicId:data.topicId,saved:!remove});}
 catch(error){console.error('Crate save failed',error);return respond({error:'That change could not be saved. Please try again.'},503);}
}
export async function PUT(request:Request){return mutate(request,false)}
export async function DELETE(request:Request){return mutate(request,true)}
