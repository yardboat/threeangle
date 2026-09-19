// Run threeangle's agent against the six review cases and save every result untouched.
//   AI_GATEWAY_API_KEY=... EVAL_MODELS=anthropic/claude-sonnet-5,openai/gpt-6-astra npm run eval:agent
// Results land in eval-results/<date>/<model>/<case>.json. Do not regenerate until a case looks good:
// keep the first run and read failures as data. Human source review is still required.
import {mkdir,writeFile} from 'node:fs/promises';
import {identifyWork,buildTriangle} from '../lib/agent';

const CASES=[
{id:'a-emerald-mile',title:'The Emerald Mile',interest:'chasing a record, rather than water policy',expect:'triangle'},
{id:'b-perfect-days',title:'Perfect Days',interest:'the line between a satisfying routine and hiding from life',expect:'triangle'},
{id:'c-ten-thousand-years',title:'Ten Thousand Years 99% Invisible',interest:'getting a message to survive its original audience',expect:'triangle'},
{id:'d-ambiguous-crash',title:'Crash',interest:'',expect:'candidates or a clarifying question'},
{id:'e-podcast-feed',title:'Radiolab',interest:'',expect:'a question asking which episode'},
{id:'f-fabricated',title:'The Quiet Orchard of Vantablack Rivers',interest:'',expect:'no match'}
];
const models=(process.env.EVAL_MODELS||process.env.AGENT_MODEL||'anthropic/claude-sonnet-5').split(',').map(s=>s.trim()).filter(Boolean);
const day=new Date().toISOString().slice(0,10);
for(const model of models){
process.env.AGENT_MODEL=model;
const dir=`eval-results/${day}/${model.replace(/\//g,'_')}`;
await mkdir(dir,{recursive:true});
console.log(`\n== ${model} ==`);
for(const c of CASES){
const started=Date.now();
const record:Record<string,unknown>={case:c.id,model,input:c,expect:c.expect,startedAt:new Date().toISOString()};
try{
const lookup=await identifyWork(c.title);
record.lookup={matches:lookup.matches.map(m=>({title:m.title,creator:m.creator,format:m.format,year:m.year})),sources:lookup.sources};
if(c.expect==='triangle'&&lookup.matches.length){
const words=c.title.toLowerCase().split(/\s+/);
const seed=lookup.matches.find(m=>words.some(w=>w.length>3&&m.title.toLowerCase().includes(w)))||lookup.matches[0];
record.seed=seed.title;
const built=await buildTriangle(seed,c.interest,lookup.sources);
record.output=built.output;record.sources=built.sources;record.status='ok';
}else record.status=lookup.matches.length?'candidates':'no match';
}catch(e){record.status='error';record.error=e instanceof Error?e.message:String(e)}
record.ms=Date.now()-started;
await writeFile(`${dir}/${c.id}.json`,JSON.stringify(record,null,2));
console.log(`${c.id.padEnd(24)} ${String(record.status).padEnd(11)} ${(Number(record.ms)/1000).toFixed(0)}s${record.error?'  '+record.error:''}`);
}
}
