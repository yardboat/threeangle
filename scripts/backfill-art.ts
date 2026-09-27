// Resolve covers for the curated topics and write them into lib/catalog-base.json and lib/extra-topics.json.
//   npx tsx scripts/backfill-art.ts            (add TMDB_KEY=... for film and TV posters)
//   npx tsx scripts/backfill-art.ts fills.json (apply a result saved from /api/admin/check?suite=backfill)
import {readFile,writeFile} from 'node:fs/promises';
import {curatedFills,type Fill} from '../lib/backfill';
const input=process.argv[2];
const fills:Fill[]=input?(JSON.parse(await readFile(input,'utf8')).data??JSON.parse(await readFile(input,'utf8'))):await curatedFills();
for(const file of ['catalog-base','extra-topics'] as const){
 const path=`lib/${file}.json`,topics=JSON.parse(await readFile(path,'utf8'));
 for(const f of fills.filter(f=>f.file===file)){
  const w=topics.find((t:{id:string})=>t.id===f.topic)?.works[f.index];if(!w||w.title!==f.title)continue;
  if(f.image&&!w.image)w.image=f.image;if(f.url&&!w.url)w.url=f.url;
 }
 await writeFile(path,JSON.stringify(topics,null,2)+'\n');
}
const got=fills.filter(f=>f.image).length;
console.log(`${got}/${fills.length} curated works now have covers.`);
for(const f of fills.filter(f=>!f.image))console.log('  no cover:',f.title);
