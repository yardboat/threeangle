'use client';
import {useEffect,useRef,useState} from 'react';
import {Check} from 'lucide-react';
import {Figure,MODES,viewFor} from './figure';
import type {Focus} from '@/lib/triangle-focus';

// The wait, made into something to hold. The drawing fills in as the library works: each corner lights when its
// work is found, and the visitor can turn the table (drag it, or press Read, Watch, Listen) to see what is in
// each corner so far. Under the quotes, a quiet rail reads the build's own progress: the work, the angle, the
// corners, the writing.
// Statuses come straight from the build stream (lib/agent.ts): "The angle: …", "Found the read: …",
// "Writing the connections.", and "Taking another path to it." when a build starts over.

const slotOf=(format:string)=>format==='Book'||format==='Article'?0:format==='Podcast episode'||format==='Album'?2:1;
const SLOTS:Record<string,number>={read:0,watch:1,listen:2};
type Progress={angle:string;found:(string|null)[];writing:boolean};
export function readProgress(statuses:string[],seed:{title:string;format:string}):Progress{
 const found:(string|null)[]=[null,null,null];found[slotOf(seed.format)]=seed.title;
 let angle='',writing=false;
 for(const s of statuses){
  if(/another path/i.test(s)){angle='';writing=false;found.fill(null);found[slotOf(seed.format)]=seed.title;continue;}
  const a=s.match(/^The angle:\s*(.+?)\.?$/);if(a){angle=a[1];continue;}
  const f=s.match(/^Found the (read|watch|listen):\s*(.+?)\.?$/i);if(f){const i=SLOTS[f[1].toLowerCase()];if(i!==slotOf(seed.format))found[i]=f[2];continue;}
  if(/^Writing/i.test(s))writing=true;
 }
 return {angle,found,writing};
}

export function Waiting({seed,statuses,still,children}:{seed:{title:string;creator?:string;format:string};statuses:string[];still:boolean;children?:React.ReactNode}){
 const p=readProgress(statuses,seed),mine=slotOf(seed.format);
 const [focus,setFocus]=useState<number|null>(null);
 const idle=useRef<ReturnType<typeof setTimeout>|null>(null);
 // A chosen corner holds for a while, then the table goes back to turning on its own.
 const look=(i:number)=>{setFocus(i);if(idle.current)clearTimeout(idle.current);idle.current=setTimeout(()=>setFocus(null),9000);};
 useEffect(()=>()=>{if(idle.current)clearTimeout(idle.current);},[]);
 const onPick=(f:Focus)=>{if(f.kind==='vertex')look(f.index);else if(f.kind==='edge')look(f.index);};
 const faces=[0,1,2].map(i=>p.found[i]?{title:p.found[i]!,seed:i===mine}:{unknown:true});
 const lit={corners:new Set([0,1,2].filter(i=>p.found[i])),sides:new Set<number>()};
 const count=p.found.filter(Boolean).length;
 // Four stages; the one in progress pulses.
 const done=[true,Boolean(p.angle)||count>1||p.writing,count===3||p.writing,false];
 const current=done.indexOf(false);
 const stages=['Your work','The angle','The corners','The writing'];
 const latest=statuses.length?statuses[statuses.length-1]:'Following the thread.';
 const shown=focus??null;
 return <div className="hw">
  <div className="hw-figure">
   <Figure variant="hero" faces={faces} labels={[0,1,2].map(i=>p.found[i]?'abc'[i]:'?')} view={shown===null?null:viewFor({kind:'vertex',index:shown})} idle building still={still} lit={lit} onPick={onPick} label={`Your threeangle, taking shape: ${count} of 3 works found. Drag to turn it.`}/>
  </div>
  <div className="hw-angles" role="group" aria-label="The three corners so far">
   {MODES.map((m,i)=><button key={m} aria-pressed={shown===i} className={p.found[i]?'is-found':'is-open'} onClick={()=>look(i)} onPointerEnter={e=>{if(e.pointerType==='mouse')look(i);}} onFocus={()=>look(i)}>
    <span className="hw-state" aria-hidden="true">{p.found[i]?<Check size={11} strokeWidth={2.4}/>:<span className="hw-dot"/>}</span>{m}
   </button>)}
  </div>
  <p className="hw-caption" aria-live="polite">{shown===null?<span className="hw-hint">Drag the drawing, or choose a corner</span>
   :p.found[shown]?<><span className="hw-caption-kind">{shown===mine?'Your starting point':MODES[shown]}</span><em>{p.found[shown]}</em></>
   :<><span className="hw-caption-kind">{MODES[shown]}</span><em className="is-open">still looking…</em></>}</p>
  {children}
  <div className="hw-rail" role="status" aria-live="polite">
   <ol>{stages.map((s,i)=><li key={s} className={done[i]?'is-done':i===current?'is-now':''}><span className="hw-bar"/><span className="hw-label">{s}</span></li>)}</ol>
   <p className="hw-latest" key={latest}>{p.angle&&!/^The angle/.test(latest)?<><span>The angle</span> {p.angle}. <span className="hw-sep" aria-hidden="true">·</span> </>:null}{latest}</p>
  </div>
 </div>;
}
