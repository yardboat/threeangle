'use client';
import {useCallback,useEffect,useRef,useState,type FormEvent,type PointerEvent} from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {ArrowRight,ArrowUpRight,ArrowLeft,Bookmark,Check,Plus,Minus,X,Pause,Play,BookOpen,Headphones,Film,RotateCcw} from 'lucide-react';
import type {Lookup} from '@/lib/corner-schema';
import {topics,workUrl,type Topic,type Work} from '@/lib/stories';
import {readTriangleResponse,sameWork} from '@/lib/hall-client';
import {HallMark,Geometry,Flourish} from './geometry';
import hallImage from '@/public/hall/gilded-hall.webp';

type Stage='welcome'|'input'|'thinking'|'reveal';
type Saved={topicId:string;topic?:Topic|null};
const modes=['Read','Watch','Listen'];
const icons=[BookOpen,Film,Headphones];
const labels=['a','b','c'];
const errorText=(e:unknown)=>e instanceof Error?e.message:'Something interrupted the connection. Please try again.';
const safeUrl=(url:string)=>/^https?:\/\//i.test(url)?url:'#';

function Sources({topic,lookup}:{topic?:Topic;lookup?:Lookup}){
 const sources=topic?.sources||lookup?.sources||[],html=topic?.searchHtml||lookup?.searchHtml||[];
 if(!sources.length&&!html.length)return null;
 return <details className="hall-sources"><summary>Notes & sources <Plus size={13}/></summary><ul>{sources.map((s,i)=><li key={s.url+i}><a href={safeUrl(s.url)} target="_blank" rel="noopener noreferrer">{s.title}<ArrowUpRight size={13}/></a></li>)}</ul>{html.map((content,i)=><iframe key={i} title={`Search suggestions ${i+1}`} sandbox="allow-popups allow-popups-to-escape-sandbox" referrerPolicy="no-referrer" srcDoc={`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src https: data:;"><base target="_blank">${content}`}/>)}</details>;
}
function WorkCard({work,index,seedTitle,selected,onSelect}:{work:Work;index:number;seedTitle?:string;selected:boolean;onSelect:()=>void}){
 const Icon=icons[index];const seed=work.title===seedTitle;
 return <article className={`hall-work hall-work-${index} ${selected?'hall-work-open':''}`}>
  <div className="hall-work-top"><span className="hall-letter">{labels[index]}</span><span className="hall-eyebrow"><Icon size={13}/>{modes[index]}{seed?' / You brought this':''}</span></div>
  <button className="hall-work-select" aria-expanded={selected} aria-controls="hall-reading-note" onClick={onSelect}><span className="hall-format">{work.format}</span><h2>{work.title}</h2><p>{work.creator}</p><span className="hall-work-cue">{selected?'Close the reading note':'Why this belongs'} {selected?<Minus size={14}/>:<Plus size={14}/>}</span></button>
  <a className="hall-work-link" href={safeUrl(workUrl(work))} target="_blank" rel="noopener noreferrer">Explore the work <ArrowUpRight size={15}/><span className="hall-sr"> (opens in a new tab)</span></a>
 </article>;
}

export default function Hall({initialId,startWithTitle=false}:{initialId?:string;startWithTitle?:boolean}){
 const initialTopic=topics.find(t=>t.id===initialId)||null;
 const [stage,setStage]=useState<Stage>(initialTopic?'reveal':startWithTitle||initialId?'input':'welcome');
 const [title,setTitle]=useState(''),[lookup,setLookup]=useState<Lookup|null>(null),[choice,setChoice]=useState<number|null>(null),[interest,setInterest]=useState('');
 const [topic,setTopic]=useState<Topic|null>(initialTopic),[previous,setPrevious]=useState<Topic|null>(null),[selected,setSelected]=useState<number|null>(null);
 const [ready,setReady]=useState<boolean|null>(null),[busy,setBusy]=useState(false),[phase,setPhase]=useState('Following the thread.'),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [paused,setPaused]=useState(false),[reduced,setReduced]=useState(false),[saved,setSaved]=useState<Saved[]>([]),[saving,setSaving]=useState(false),[shelfLoading,setShelfLoading]=useState(false),[shelfError,setShelfError]=useState('');
 const [fact,setFact]=useState(0),[slow,setSlow]=useState(false),[restoring,setRestoring]=useState(Boolean(initialId&&!initialTopic));
 const controller=useRef<AbortController|null>(null),requestId=useRef(0),main=useRef<HTMLElement>(null),world=useRef<HTMLDivElement>(null),shelf=useRef<HTMLDialogElement>(null),titleInput=useRef<HTMLInputElement>(null);
 const seed=choice!==null?lookup?.matches[choice]||null:null;
 const transition=useCallback((next:Stage)=>{setStage(next);setSelected(null);window.scrollTo({top:0,behavior:'instant'});requestAnimationFrame(()=>main.current?.focus({preventScroll:true}));},[]);
 const openTopic=useCallback((t:Topic)=>{setTopic(t);setError('');setNotice('');transition('reveal');history.replaceState(null,'','/v2?triangle='+encodeURIComponent(t.id));},[transition]);
 const loadShelf=useCallback(async()=>{
  setShelfLoading(true);setShelfError('');
  try{const res=await fetch('/api/crate',{cache:'no-store'});const data=await res.json();if(!res.ok)throw new Error(data.error||'Your saved connections couldn’t be opened.');setSaved(data.items);}
  catch(e){setShelfError(errorText(e));}finally{setShelfLoading(false);}
 },[]);
 useEffect(()=>{
  const abort=new AbortController();let live=true;
  fetch('/api/corner',{signal:abort.signal,cache:'no-store'}).then(async r=>{if(!r.ok)throw new Error('The library couldn’t connect. Reload to try again.');return r.json();}).then(async d=>{
   if(!live)return;setReady(d.ready);await loadShelf();
   if(initialId&&!initialTopic){
    if(!/^custom-[0-9a-f-]{36}$/.test(initialId))throw new Error('We couldn’t find that triangle. Start with a title you love.');
    const res=await fetch('/api/corner?id='+encodeURIComponent(initialId.slice(7)),{signal:abort.signal,cache:'no-store'});const data=await res.json();if(!res.ok||!data.topic)throw new Error(data.error||'This triangle isn’t ready yet. Try reopening it in a moment.');if(live)openTopic(data.topic);
   }
  }).catch(e=>{if(live&&!abort.signal.aborted)setError(errorText(e));}).finally(()=>{if(live)setRestoring(false);});
  const media=matchMedia('(prefers-reduced-motion: reduce)');const apply=()=>{setReduced(media.matches);if(media.matches)setPaused(true);};apply();media.addEventListener('change',apply);
  // The request counter intentionally invalidates outstanding asynchronous work on cleanup.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return()=>{live=false;abort.abort();controller.current?.abort();requestId.current++;media.removeEventListener('change',apply);};
 },[initialId,initialTopic,loadShelf,openTopic]);
 useEffect(()=>{if(stage!=='thinking')return;const timer=setTimeout(()=>setSlow(true),35000);return()=>clearTimeout(timer);},[stage]);
 const startInput=()=>{setError('');setNotice('');transition('input');history.replaceState(null,'','/v2?start=title');requestAnimationFrame(()=>titleInput.current?.focus());};
 function cancel(){requestId.current++;controller.current?.abort();setBusy(false);setError('');setSlow(false);transition('input');}
 async function lookupWork(query:string,signal:AbortSignal):Promise<Lookup>{
  const res=await fetch('/api/corner',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'lookup',title:query.trim()}),signal});const data=await res.json();if(!res.ok)throw new Error(data.error||'We couldn’t find that work. Try adding the creator.');return data;
 }
 async function find(event?:FormEvent){
  event?.preventDefault();if(busy||title.trim().length<2)return;
  const token=++requestId.current;controller.current=new AbortController();setBusy(true);setError('');setLookup(null);setChoice(null);
  try{const found=await lookupWork(title,controller.current.signal);if(token!==requestId.current)return;setLookup(found);if(!found.matches.length)setError('No confident match yet. Try the creator’s name, year, or exact episode title.');}
  catch(e){if(token===requestId.current)setError(errorText(e));}finally{if(token===requestId.current)setBusy(false);}
 }
 async function generate(another=false){
  if(busy)return;const currentTopic=topic;
  if(!another&&(!lookup||choice===null))return;
  const token=++requestId.current;controller.current=new AbortController();setBusy(true);setError('');setNotice('');setSlow(false);setFact(0);setPhase(another?'Finding another way in.':'Following the thread.');transition('thinking');
  try{
   let useLookup=lookup,useChoice=choice;
   if(another&&currentTopic){
    setPrevious(currentTopic);
    const original=currentTopic.works.find(w=>w.title===currentTopic.seedTitle)||currentTopic.works[0];
    // A completed draft is cached by the API. A second angle needs a fresh lookup ID.
    const found=await lookupWork((original.title+' — '+original.creator).slice(0,240),controller.current.signal);
    if(token!==requestId.current)return;const index=found.matches.findIndex(m=>sameWork(m,original));
    setLookup(found);setChoice(index>=0?index:null);setTitle(original.title);useLookup=found;useChoice=index;
    if(index<0){setError('Let’s confirm your starting work again before finding another connection.');transition('input');return;}
   }
   if(!useLookup||useChoice===null||useChoice<0)throw new Error('Choose your starting work first.');
   const avoid=another&&currentTopic?currentTopic.works.filter(w=>w.title!==useLookup!.matches[useChoice!].title).map(w=>w.title.slice(0,300)):[];
   const res=await fetch('/api/corner',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'generate',id:useLookup.id,choice:useChoice,interest,avoid}),signal:controller.current.signal});
   const result=await readTriangleResponse(res,text=>{if(token===requestId.current)setPhase(text);});
   if(token!==requestId.current)return;if(currentTopic)setPrevious(currentTopic);openTopic(result);
  }catch(e){if(token===requestId.current){setError(errorText(e));transition('input');}}
  finally{if(token===requestId.current)setBusy(false);}
 }
 async function save(){
  if(!topic||saving)return;setSaving(true);setNotice('');
  const exists=saved.some(s=>s.topicId===topic.id);
  try{const res=await fetch('/api/crate',{method:exists?'DELETE':'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({topicId:topic.id})});const data=await res.json();if(!res.ok)throw new Error(data.error||'Your connection couldn’t be saved.');setSaved(items=>exists?items.filter(i=>i.topicId!==topic.id):[{topicId:topic.id,topic},...items]);setNotice(exists?'Removed from your collection.':'Kept in your collection.');}
  catch(e){setNotice(errorText(e));}finally{setSaving(false);}
 }
 function tilt(event:PointerEvent<HTMLDivElement>){if(paused||reduced||event.pointerType!=='mouse'||!world.current)return;const rect=event.currentTarget.getBoundingClientRect();world.current.style.setProperty('--hall-x',`${(event.clientX-rect.left-rect.width/2)/rect.width*10}px`);world.current.style.setProperty('--hall-y',`${(event.clientY-rect.top-rect.height/2)/rect.height*6}px`);}
 const resetTilt=()=>{world.current?.style.setProperty('--hall-x','0px');world.current?.style.setProperty('--hall-y','0px');};
 const knownFact=seed?.facts[fact%(seed?.facts.length||1)];
 const factSource=knownFact?lookup?.sources[knownFact.source]:null;
 const isSaved=topic&&saved.some(s=>s.topicId===topic.id);
 return <div className={`hall hall-stage-${stage} ${paused||reduced?'hall-still':''}`} onPointerMove={tilt} onPointerLeave={resetTilt}>
  <a className="hall-skip" href="#hall-main">Skip to content</a>
  <div ref={world} className="hall-world" aria-hidden="true"><Image src={hallImage} alt="" fill priority sizes="100vw" placeholder="blur" quality={85}/><div className="hall-world-wash"/></div>
  <header className="hall-header"><Link className="hall-browse-nav" href="/?browse=1" prefetch={false}><span className="hall-nav-line"/>The collection</Link><button className="hall-brand" onClick={()=>{if(busy)return;transition('welcome');history.replaceState(null,'','/v2');}} aria-label="threeangle home" disabled={busy}><HallMark/><span>threeangle</span></button><button className="hall-saved-nav" disabled={busy} onClick={()=>{shelf.current?.showModal();void loadShelf();}}><Bookmark size={15}/><span>Saved</span><span className="hall-save-count">{saved.length.toString().padStart(2,'0')}</span></button></header>
  <main id="hall-main" ref={main} tabIndex={-1} className="hall-main">
   {stage==='welcome'&&<section className="hall-welcome"><div className="hall-welcome-label"><span/>A PLACE FOR YOUR CURIOSITY<span/></div><div className="hall-welcome-copy"><p className="hall-eyebrow">READ · LISTEN · WATCH</p><h1>When you read, listen, and watch<br className="hall-desktop-break"/> around the same idea,<br/><em>it all glows a little brighter.</em></h1><p className="hall-welcome-description">One thing you love. Two things to discover.<br/>A connection you didn’t see coming.</p><button className="hall-button" onClick={startInput}>I have a title <ArrowRight size={17}/></button><Link className="hall-underlink" href="/?browse=1" prefetch={false}>Or wander through our threeangle ideas <ArrowUpRight size={13}/></Link></div><div className="hall-welcome-bottom"><span>THREE WORKS. ONE DEEPER FASCINATION.</span><Flourish/><span>COME IN. STAY CURIOUS.</span></div></section>}
   {stage==='input'&&<section className="hall-input hall-enter"><div className="hall-section-heading"><p className="hall-eyebrow">{seed?'YOUR FIRST CORNER':'BEGIN WITH SOMETHING YOU LOVED'}</p><Flourish/><h1>{seed?<>Every fascination<br/>starts <em>somewhere.</em></>:<>Tell us something you loved,<br/>and we’ll build the rest<br className="hall-mobile-break"/> <em>of the triangle.</em></>}</h1>{!seed&&<p>A book, a film, a podcast episode.<br/>We’ll find two companions and the idea that connects them.</p>}</div>
    {restoring?<p role="status" className="hall-center-note">Opening your connection…</p>:<div className="hall-desk">
     {!seed?<><form onSubmit={find}><label htmlFor="hall-title">The title you loved</label><div className="hall-title-field"><input ref={titleInput} id="hall-title" value={title} onChange={e=>setTitle(e.target.value)} placeholder="What stayed with you?" maxLength={240} required minLength={2} disabled={busy} autoComplete="off"/><button type="submit" aria-label="Find my title" disabled={busy||ready!==true||title.trim().length<2}><ArrowRight size={22}/></button></div><div className="hall-input-meta"><span>For a podcast, use the episode title.</span><span>01 / 03</span></div></form>
      {busy&&<div className="hall-lookup-status" role="status"><span className="hall-tiny-triangle">△</span> Finding your work… <button className="hall-text-button" onClick={cancel}>Cancel</button></div>}
      {lookup&&!busy&&lookup.matches.length>0&&<div className="hall-matches"><h2>Is this the one?</h2>{lookup.matches.map((m,i)=><button key={m.title+i} onClick={()=>{setChoice(i);setError('');}}><span className="hall-eyebrow">{m.format} · {m.year}</span><h3>{m.title}</h3><p>{m.creator}</p><span className="hall-match-description">{m.description}</span><span className="hall-match-action">This is the one <ArrowRight size={16}/></span></button>)}<Sources lookup={lookup}/></div>}
     </>:<><div className="hall-confirmed"><span className="hall-bookmark-tab"><HallMark/></span><p className="hall-eyebrow">{seed.format} · {seed.year}</p><h2>{seed.title}</h2><p>{seed.creator}</p><button className="hall-text-button" onClick={()=>setChoice(null)}>Choose a different work</button></div><form onSubmit={e=>{e.preventDefault();void generate();}}><details className="hall-interest"><summary>Something in particular drew you in? <span>Optional</span><Plus size={14}/></summary><label className="hall-sr" htmlFor="hall-interest">What drew you in?</label><textarea id="hall-interest" value={interest} maxLength={600} onChange={e=>setInterest(e.target.value)} placeholder="A character, a question, a feeling you can’t shake…" rows={3}/></details><button className="hall-button hall-build" disabled={busy||ready!==true}>Build my threeangle <ArrowRight size={17}/></button><p className="hall-form-foot">Your work stays. We’ll find the other two angles.</p></form></>}
     {ready===false&&<div className="hall-alert"><p>Our custom connections are taking a pause. The curated collection is still open.</p><Link href="/?browse=1" prefetch={false}>Explore the collection <ArrowRight size={14}/></Link></div>}
     {error&&<p className="hall-alert" role="alert">{error}{ready===null&&<button className="hall-text-button" onClick={()=>location.reload()}>Reconnect</button>}</p>}
     {previous&&<button className="hall-text-button hall-return" onClick={()=>openTopic(previous)}><ArrowLeft size={14}/> Your previous connection: {previous.name}</button>}
    </div>}
    <p className="hall-browse-footer">Don’t know where to start? <Link href="/?browse=1" prefetch={false}>Browse these threeangle ideas.</Link></p>
   </section>}
   {stage==='thinking'&&<section className="hall-thinking hall-enter"><p className="hall-eyebrow">THE LIBRARY AT WORK</p><div className="hall-thinking-plate"><Geometry building/><span className="hall-plate-side">FIG. 01 / A CONNECTION TAKING SHAPE</span></div><h1>A little further<br/><em>into the idea.</em></h1><p className="hall-thinking-title">Starting with <i>{seed?.title||topic?.seedTitle||topic?.works[0].title}</i></p><p className="hall-phase" role="status">{phase}</p>{knownFact&&factSource&&<div className="hall-discovery"><span className="hall-eyebrow">A NOTE IN THE MARGIN</span><p>{knownFact.text}</p><div><a href={safeUrl(factSource.url)} target="_blank" rel="noopener noreferrer">Read the source <ArrowUpRight size={12}/></a>{seed&&seed.facts.length>1&&<button onClick={()=>setFact(f=>f+1)}>Another note <ArrowRight size={12}/></button>}</div></div>}<p className="hall-wait-note">{slow?'Still following the thread. Your starting title is safe here.':'Thoughtful connections take a moment. Sometimes a couple of minutes.'}</p><button className="hall-text-button" onClick={cancel}>Back to my title</button></section>}
   {stage==='reveal'&&topic&&<section className="hall-reveal hall-enter" key={topic.id}><div className="hall-result-bar"><button className="hall-text-button" onClick={startInput}><ArrowLeft size={14}/> A new starting point</button><span className="hall-eyebrow">{topic.seedTitle?'A CONNECTION MADE FOR YOU':'FROM THE CURATED COLLECTION'}</span><button className="hall-text-button" onClick={save} disabled={saving}>{isSaved?<Check size={15}/>:<Bookmark size={15}/>} {saving?'Saving…':isSaved?'Saved':'Keep this connection'}</button></div><header className="hall-result-heading"><Flourish/><p className="hall-eyebrow">YOUR THREEANGLE</p><h1>{topic.name}</h1><p>{topic.hook}</p></header>
    <div className="hall-result-plate"><div className="hall-result-lines" aria-hidden="true"><svg viewBox="0 0 1000 550" preserveAspectRatio="none"><path className="hall-result-edge" d="M500 55L130 470H870Z"/><path className="hall-result-ray" d="M500 55V310L130 470M500 310L870 470"/></svg></div><div className="hall-topic-seal"><span className="hall-eyebrow">THE COMMON THREAD</span><HallMark/><p>{topic.question}</p></div>{topic.works.slice(0,3).map((w,i)=><WorkCard key={w.title+i} work={w} index={i} seedTitle={topic.seedTitle} selected={selected===i} onSelect={()=>setSelected(selected===i?null:i)}/>)}</div>
    <div id="hall-reading-note" className={`hall-reading-note ${selected!==null?'hall-note-open':''}`} aria-live="polite">{selected!==null&&<><div><span className="hall-eyebrow">{modes[selected]} / THE READING NOTE</span><button aria-label="Close reading note" onClick={()=>setSelected(null)}><X size={18}/></button></div><h2>{topic.heads[selected]}</h2><p>{topic.works[selected].pitch}</p><p className="hall-note-bridge">{topic.bridges[selected]}</p></>}</div>
    <div className="hall-connection-note"><span className="hall-eyebrow">SEE THEM TOGETHER</span><h2>{topic.shift}</h2><p>{topic.payoff||topic.intro}</p><details className="hall-deeper"><summary>Follow the connection deeper <Plus size={15}/></summary><p>{topic.intro}</p>{topic.angles.map((angle,i)=><div key={i}><h3>{angle}</h3><p>{topic.answers[i]}</p></div>)}</details></div>
    {topic.works[3]&&<details className="hall-bonus"><summary><span className="hall-bonus-mark">+</span><span><span className="hall-eyebrow">ONE MORE THING</span><span className="hall-bonus-tease">A little something from the next shelf.</span></span><ArrowRight size={20}/></summary><div className="hall-bonus-content"><span className="hall-eyebrow">{topic.works[3].format}</span><h2>{topic.works[3].title}</h2><p>{topic.works[3].creator}</p><p>{topic.bonus||topic.works[3].pitch}</p><a className="hall-work-link" href={safeUrl(workUrl(topic.works[3]))} target="_blank" rel="noopener noreferrer">Explore the bonus <ArrowUpRight size={15}/></a></div></details>}
    <Sources topic={topic}/><section className="hall-next"><Flourish/><p className="hall-eyebrow">THERE’S ALWAYS ANOTHER WAY IN</p><h2>What else <em>might it open?</em></h2><p>Keep {topic.seedTitle||topic.works[0].title} as your starting point,<br className="hall-desktop-break"/> or bring something new.</p><button className="hall-button" onClick={()=>void generate(true)} disabled={busy||ready!==true}>Find another angle <RotateCcw size={16}/></button><button className="hall-underlink" onClick={()=>{setTitle('');setLookup(null);setChoice(null);setInterest('');startInput();}}>Start with a different title <ArrowRight size={14}/></button>{previous&&<button className="hall-text-button hall-return" onClick={()=>openTopic(previous)}>Return to {previous.name}</button>}</section>
   </section>}
  </main>
  {notice&&<div className="hall-toast" role="status">{notice}<button aria-label="Dismiss notification" onClick={()=>setNotice('')}><X size={15}/></button></div>}
  <footer className="hall-footer"><span>READ. LISTEN. WATCH. CONNECT.</span><button className="hall-motion" onClick={()=>{setPaused(p=>!p);resetTilt();}} aria-pressed={paused||reduced} disabled={reduced}>{paused||reduced?<Play size={12}/>:<Pause size={12}/>} {reduced?'Reduced motion':paused?'Resume motion':'Pause motion'}</button><span>threeangle <span className="hall-footer-dot">·</span> STAY CURIOUS.</span></footer>
  <dialog ref={shelf} className="hall-shelf" aria-labelledby="hall-shelf-title" onClick={e=>{if(e.target===e.currentTarget)shelf.current?.close();}}><div className="hall-shelf-inner"><header><span className="hall-eyebrow">YOUR PERSONAL COLLECTION</span><button onClick={()=>shelf.current?.close()} aria-label="Close saved connections"><X size={22}/></button></header><h2 id="hall-shelf-title">Good things,<br/><em>kept close.</em></h2><p className="hall-shelf-description">The connections you want to come back to.</p>{shelfLoading?<p role="status">Opening your collection…</p>:shelfError?<div className="hall-alert"><p role="alert">{shelfError}</p><button className="hall-text-button" onClick={()=>void loadShelf()}>Try again</button></div>:saved.length===0?<div className="hall-shelf-empty"><Geometry/><p>When something stays with you,<br/>keep the whole triangle here.</p><button className="hall-button" onClick={()=>{shelf.current?.close();startInput();}}>Find your first connection <ArrowRight size={16}/></button></div>:<div className="hall-saved-list">{saved.map(item=>{const t=item.topic||topics.find(t=>t.id===item.topicId);return t?<button key={item.topicId} onClick={()=>{shelf.current?.close();openTopic(t);}}><span className="hall-eyebrow">{t.seedTitle?'YOUR CONNECTION':'CURATED THREEANGLE'}</span><h3>{t.name}</h3><p>{t.works.map(w=>w.title).slice(0,3).join(' · ')}</p><ArrowUpRight size={18}/></button>:null;})}</div>}<p className="hall-shelf-foot">Saved for this browser. Clearing cookies removes access to your collection.</p></div></dialog>
 </div>;
}
