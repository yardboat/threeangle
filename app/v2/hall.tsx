'use client';
import {useCallback,useEffect,useRef,useState,type FormEvent,type PointerEvent} from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {ArrowRight,ArrowUpRight,ArrowLeft,Bookmark,Check,Plus,X,Pause,Play,RotateCcw} from 'lucide-react';
import type {Lookup} from '@/lib/corner-schema';
import {FORMATS} from '@/lib/formats';
import {topics,workUrl,type Topic} from '@/lib/stories';
import {readTriangleResponse,sameWork,screenFromSearch,screenUrl,parentScreen,sameScreen,type Screen} from '@/lib/hall-client';
import {HallMark,Geometry,Flourish,Invitation} from './geometry';
import {TriangleReveal} from './triangle';
import hallImage from '@/public/hall/gilded-hall.webp';
import readingRoom from '@/public/hall/reading-room.webp';

type Stage='welcome'|'input'|'thinking'|'reveal';
type Saved={topicId:string;topic?:Topic|null};
type Refine={open:boolean;creator:string;year:string;format:string};
const errorText=(e:unknown)=>e instanceof Error?e.message:'Something interrupted the connection. Please try again.';
const safeUrl=(url:string)=>/^https?:\/\//i.test(url)?url:'#';
const stageOf=(s:Screen):Stage=>s.s==='welcome'?'welcome':s.s==='thinking'?'thinking':s.s==='reveal'?'reveal':'input';
// A lookup that needs the visitor's help (which episode? which of these?) rather than a service failure.
class LookupError extends Error{status:number;constructor(message:string,status:number){super(message);this.status=status;}}
type HistoryState={hall?:Screen&{n:number}}|null;
const fromHistory=(h:Screen&{n:number}):Screen=>h.s==='confirm'?{s:'confirm',c:h.c}:h.s==='reveal'?{s:'reveal',id:h.id}:{s:h.s};

function Sources({topic,lookup}:{topic?:Topic;lookup?:Lookup}){
 const sources=topic?.sources||lookup?.sources||[],html=topic?.searchHtml||lookup?.searchHtml||[];
 if(!sources.length&&!html.length)return null;
 return <details className="hall-sources"><summary>Notes & sources <Plus size={13}/></summary><ul>{sources.map((s,i)=><li key={s.url+i}><a href={safeUrl(s.url)} target="_blank" rel="noopener noreferrer">{s.title}<ArrowUpRight size={13}/></a></li>)}</ul>{html.map((content,i)=><iframe key={i} title={`Search suggestions ${i+1}`} sandbox="allow-popups allow-popups-to-escape-sandbox" referrerPolicy="no-referrer" srcDoc={`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src https: data:;"><base target="_blank">${content}`}/>)}</details>;
}

export default function Hall({initialId,startWithTitle=false}:{initialId?:string;startWithTitle?:boolean}){
 // The page is entered once; every later screen change is driven by state and browser history, not by these props.
 const [first]=useState(()=>({id:initialId,topic:topics.find(t=>t.id===initialId)||null,start:startWithTitle}));
 const [stage,setStage]=useState<Stage>(first.topic?'reveal':first.start||first.id?'input':'welcome');
 const [title,setTitle]=useState(''),[lookup,setLookup]=useState<Lookup|null>(null),[choice,setChoice]=useState<number|null>(null),[interest,setInterest]=useState('');
 const [topic,setTopic]=useState<Topic|null>(first.topic),[previous,setPrevious]=useState<Topic|null>(null);
 const [ready,setReady]=useState<boolean|null>(null),[busy,setBusy]=useState(false),[phase,setPhase]=useState('Following the thread.'),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [paused,setPaused]=useState(false),[reduced,setReduced]=useState(false),[saved,setSaved]=useState<Saved[]>([]),[saving,setSaving]=useState(false),[shelfLoading,setShelfLoading]=useState(false),[shelfError,setShelfError]=useState('');
 const [fact,setFact]=useState(0),[slow,setSlow]=useState(false),[restoring,setRestoring]=useState(Boolean(first.id&&!first.topic));
 const [refine,setRefine]=useState<Refine>({open:false,creator:'',year:'',format:''}),[clarify,setClarify]=useState(false);
 const controller=useRef<AbortController|null>(null),requestId=useRef(0),main=useRef<HTMLElement>(null),world=useRef<HTMLDivElement>(null),shelf=useRef<HTMLDialogElement>(null),titleInput=useRef<HTMLInputElement>(null);
 // Live copies for handlers that outlive a render (popstate, async work).
 const stageRef=useRef(stage),lookupRef=useRef(lookup),choiceRef=useRef(choice),busyRef=useRef(busy),topicRef=useRef(topic);
 useEffect(()=>{stageRef.current=stage;lookupRef.current=lookup;choiceRef.current=choice;busyRef.current=busy;topicRef.current=topic;});
 const depth=useRef(0),origin=useRef<Screen|null>(null),keepError=useRef(false),seen=useRef(new Map<string,Topic>()),restoreRun=useRef<AbortController|null>(null);
 const rejected=useRef<{title:string;creator:string}[]>([]);
 const seed=choice!==null?lookup?.matches[choice]||null:null;

 // ---- Navigation -----------------------------------------------------------------
 // Every screen is a real history entry (welcome, find, confirm, reveal), so the browser's Back button and
 // the Back button in the header take the same path. Generation is one entry that is replaced by the result.
 const record=useCallback((screen:Screen,mode:'push'|'replace')=>{
  const n=mode==='push'?depth.current+1:depth.current;
  window.history[mode==='push'?'pushState':'replaceState']({hall:{...screen,n}},'',screenUrl(screen));depth.current=n;
 },[]);
 const stopRun=useCallback(()=>{requestId.current++;controller.current?.abort();setBusy(false);setSlow(false);},[]);
 const showTopic=useCallback((t:Topic)=>{seen.current.set(t.id,t);setTopic(t);setStage('reveal');stageRef.current='reveal';},[]);
 const restore=useCallback(async(id:string,signal:AbortSignal)=>{
  if(!/^custom-[0-9a-f-]{36}$/.test(id))throw new Error('We couldn’t find that triangle. Start with a title you love.');
  const res=await fetch('/api/corner?id='+encodeURIComponent(id.slice(7)),{signal,cache:'no-store'});const data=await res.json();
  if(!res.ok||!data.topic)throw new Error(data.error||'This triangle isn’t ready yet. Try reopening it in a moment.');
  return data.topic as Topic;
 },[]);
 const show=useCallback((screen:Screen)=>{
  const next=stageOf(screen);
  if(busyRef.current&&screen.s!=='thinking'&&next!==stageRef.current)stopRun();
  restoreRun.current?.abort();
  if(!keepError.current)setError('');
  keepError.current=false;setNotice('');setRestoring(false);
  if(screen.s==='find')setChoice(null);
  if(screen.s==='confirm')setChoice(screen.c);
  if(screen.s==='reveal'){
   const t=topics.find(x=>x.id===screen.id)||seen.current.get(screen.id);
   if(t)showTopic(t);
   else{
    const run=restoreRun.current=new AbortController();setStage('input');stageRef.current='input';setChoice(null);setRestoring(true);
    restore(screen.id,run.signal).then(found=>{if(!run.signal.aborted){setRestoring(false);showTopic(found);}}).catch(e=>{if(run.signal.aborted)return;setRestoring(false);setError(errorText(e));window.history.replaceState({hall:{s:'find',n:depth.current}},'','/v2?start=title');});
   }
  }else{setStage(next);stageRef.current=next;}
  window.scrollTo({top:0,behavior:'instant'});requestAnimationFrame(()=>main.current?.focus({preventScroll:true}));
 },[restore,showTopic,stopRun]);
 const currentScreen=useCallback(():Screen=>{
  const s=stageRef.current;
  return s==='welcome'?{s:'welcome'}:s==='thinking'?{s:'thinking'}:s==='reveal'&&topicRef.current?{s:'reveal',id:topicRef.current.id}:choiceRef.current!==null?{s:'confirm',c:choiceRef.current}:{s:'find'};
 },[]);
 const go=useCallback((screen:Screen,mode:'push'|'replace'='push')=>{
  if(mode==='push'&&sameScreen(currentScreen(),screen)&&stageRef.current!=='thinking'){show(screen);return;}
  record(screen,mode);show(screen);
 },[currentScreen,record,show]);
 const goBack=useCallback(()=>{
  if(depth.current>0){window.history.back();return;}
  const parent=parentScreen(currentScreen());record(parent,'replace');show(parent);
 },[currentScreen,record,show]);
 const openTopic=useCallback((t:Topic,mode:'push'|'replace'='push')=>{record({s:'reveal',id:t.id},mode);showTopic(t);setError('');setNotice('');window.scrollTo({top:0,behavior:'instant'});requestAnimationFrame(()=>main.current?.focus({preventScroll:true}));},[record,showTopic]);
 const loadShelf=useCallback(async()=>{
  setShelfLoading(true);setShelfError('');
  try{const res=await fetch('/api/crate',{cache:'no-store'});const data=await res.json();if(!res.ok)throw new Error(data.error||'Your saved connections couldn’t be opened.');setSaved(data.items);}
  catch(e){setShelfError(errorText(e));}finally{setShelfLoading(false);}
 },[]);

 useEffect(()=>{
  const abort=new AbortController();let live=true;
  const existing=(window.history.state as HistoryState)?.hall;depth.current=existing?.n??0;
  // Tag this entry without disturbing what Next.js keeps in history.state (losing it makes Back hard-reload the page).
  if(!existing)window.history.replaceState({...window.history.state,hall:{...(first.topic?{s:'reveal',id:first.topic.id}:first.id?{s:'reveal',id:first.id}:first.start?{s:'find'}:{s:'welcome'}),n:0}},'');
  fetch('/api/corner',{signal:abort.signal,cache:'no-store'}).then(async r=>{if(!r.ok)throw new Error('The library couldn’t connect. Reload to try again.');return r.json();}).then(async d=>{
   if(!live)return;setReady(d.ready);await loadShelf();
   if(first.id&&!first.topic){const t=await restore(first.id,abort.signal);if(live)openTopic(t,'replace');}
  }).catch(e=>{if(live&&!abort.signal.aborted){setError(errorText(e));if(first.id&&!first.topic)record({s:'find'},'replace');}}).finally(()=>{if(live)setRestoring(false);});
  const media=matchMedia('(prefers-reduced-motion: reduce)');const apply=()=>{setReduced(media.matches);if(media.matches)setPaused(true);};apply();media.addEventListener('change',apply);
  // Browser Back / Forward. Leaving a screen that is working cancels the work.
  const onPop=()=>{
   const state=(window.history.state as HistoryState)?.hall;depth.current=state?.n??0;
   let target:Screen=state?fromHistory(state):screenFromSearch(window.location.search);
   const known=lookupRef.current;
   if(target.s==='thinking'&&!busyRef.current)target=known&&choiceRef.current!==null?{s:'confirm',c:choiceRef.current}:{s:'find'};
   if(target.s==='confirm'&&!known?.matches[target.c])target={s:'find'};
   show(target);
  };
  window.addEventListener('popstate',onPop);
  // The request counter intentionally invalidates outstanding asynchronous work on cleanup.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return()=>{live=false;abort.abort();controller.current?.abort();restoreRun.current?.abort();requestId.current++;media.removeEventListener('change',apply);window.removeEventListener('popstate',onPop);};
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[]);
 useEffect(()=>{
  if(paused||reduced)return;
  const element=world.current;let frame=0;const scroll=()=>{if(frame)return;frame=requestAnimationFrame(()=>{world.current?.style.setProperty('--hall-scroll',Math.min(window.scrollY*.10,48)+'px');frame=0;});};
  window.addEventListener('scroll',scroll,{passive:true});
  return()=>{window.removeEventListener('scroll',scroll);cancelAnimationFrame(frame);element?.style.setProperty('--hall-scroll','0px');};
 },[stage,paused,reduced]);
 useEffect(()=>{if(stage!=='thinking')return;const timer=setTimeout(()=>setSlow(true),35000);return()=>clearTimeout(timer);},[stage]);

 const startInput=()=>{setError('');setNotice('');go({s:'find'});requestAnimationFrame(()=>titleInput.current?.focus());};
 const goHome=()=>{if(busy)return;go({s:'welcome'});};
 const freshStart=()=>{setTitle('');setLookup(null);setChoice(null);setInterest('');setClarify(false);setRefine({open:false,creator:'',year:'',format:''});rejected.current=[];lookupRef.current=null;choiceRef.current=null;startInput();};
 const cancelLookup=()=>{stopRun();setError('');};
 // A failed or abandoned generation goes back to where it started, keeping the message on screen.
 const leaveThinking=(target:Screen)=>{
  const start=origin.current;
  keepError.current=true;
  if(start&&sameScreen(start,target)&&depth.current>0)window.history.back();
  else{record(target,'replace');show(target);}
 };
 async function lookupWork(query:string,signal:AbortSignal,hints:Record<string,unknown>={}):Promise<Lookup>{
  const res=await fetch('/api/corner',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'lookup',title:query.trim(),...hints}),signal});const data=await res.json();if(!res.ok)throw new LookupError(data.error||'We couldn’t find that work. Try adding the creator.',res.status);return data;
 }
 // again = "none of these": search again with what the visitor has added, without the works already ruled out.
 async function find(event?:FormEvent,again=false){
  event?.preventDefault();if(busy||title.trim().length<2)return;
  if(again){if(lookup)rejected.current=[...rejected.current,...lookup.matches.map(m=>({title:m.title.slice(0,100),creator:m.creator.slice(0,60)}))].slice(-6);}
  else rejected.current=[];
  const hints:Record<string,unknown>={};
  if(again||refine.open){if(refine.creator.trim())hints.creator=refine.creator.trim();if(refine.year.trim())hints.year=refine.year.trim();if(refine.format)hints.format=refine.format;}
  if(rejected.current.length)hints.exclude=rejected.current;
  const token=++requestId.current;controller.current=new AbortController();setBusy(true);setError('');setLookup(null);setChoice(null);setClarify(false);
  try{
   const found=await lookupWork(title,controller.current.signal,hints);if(token!==requestId.current)return;
   setLookup(found);
   if(found.matches.length){setRefine(r=>({...r,open:false}));}
   else{setError(again?'Still nothing confident. Add the creator, the year, or the exact episode title.':'No confident match yet. Tell us a little more and we’ll look again.');setClarify(true);setRefine(r=>({...r,open:true}));}
  }catch(e){
   if(token!==requestId.current)return;
   setError(errorText(e));
   if(e instanceof LookupError&&e.status===422){setClarify(true);setRefine(r=>({...r,open:true}));}
  }finally{if(token===requestId.current)setBusy(false);}
 }
 async function generate(another=false){
  if(busy)return;const currentTopic=topic;
  if(!another&&(!lookup||choice===null))return;
  const token=++requestId.current;controller.current=new AbortController();setBusy(true);setError('');setNotice('');setSlow(false);setFact(0);setPhase(another?'Finding another way in.':'Following the thread.');
  origin.current=another&&currentTopic?{s:'reveal',id:currentTopic.id}:{s:'confirm',c:choice as number};
  go({s:'thinking'});
  try{
   let useLookup=lookup,useChoice=choice;
   if(another&&currentTopic){
    setPrevious(currentTopic);
    const original=currentTopic.works.find(w=>w.title===currentTopic.seedTitle)||currentTopic.works[0];
    // A completed draft is cached by the API. A second angle needs a fresh lookup ID.
    const found=await lookupWork((original.title+' — '+original.creator).slice(0,240),controller.current.signal);
    if(token!==requestId.current)return;const index=found.matches.findIndex(m=>sameWork(m,original));
    setLookup(found);setChoice(index>=0?index:null);setTitle(original.title);useLookup=found;useChoice=index;lookupRef.current=found;choiceRef.current=index>=0?index:null;
    if(index<0){setError('Let’s confirm your starting work again before finding another connection.');leaveThinking({s:'find'});return;}
   }
   if(!useLookup||useChoice===null||useChoice<0)throw new Error('Choose your starting work first.');
   const avoid=another&&currentTopic?currentTopic.works.filter(w=>w.title!==useLookup!.matches[useChoice!].title).map(w=>w.title.slice(0,300)):[];
   const res=await fetch('/api/corner',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'generate',id:useLookup.id,choice:useChoice,interest,avoid}),signal:controller.current.signal});
   const result=await readTriangleResponse(res,text=>{if(token===requestId.current)setPhase(text);});
   if(token!==requestId.current)return;if(currentTopic)setPrevious(currentTopic);openTopic(result,'replace');
  }catch(e){if(token===requestId.current){setError(errorText(e));leaveThinking(choiceRef.current!==null&&lookupRef.current?{s:'confirm',c:choiceRef.current}:{s:'find'});}}
  finally{if(token===requestId.current)setBusy(false);}
 }
 async function save(){
  if(!topic||saving)return;setSaving(true);setNotice('');
  const exists=saved.some(s=>s.topicId===topic.id);
  try{const res=await fetch('/api/crate',{method:exists?'DELETE':'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({topicId:topic.id})});const data=await res.json();if(!res.ok)throw new Error(data.error||'Your connection couldn’t be saved.');setSaved(items=>exists?items.filter(i=>i.topicId!==topic.id):[{topicId:topic.id,topic},...items]);setNotice(exists?'Removed from your collection.':'Kept in your collection.');}
  catch(e){setNotice(errorText(e));}finally{setSaving(false);}
 }
 function tilt(event:PointerEvent<HTMLDivElement>){if(paused||reduced||event.pointerType!=='mouse'||!world.current)return;const rect=event.currentTarget.getBoundingClientRect();world.current.style.setProperty('--hall-x',`${(event.clientX-rect.left-rect.width/2)/rect.width*10}px`);world.current.style.setProperty('--hall-y',`${(event.clientY-rect.top-rect.height/2)/rect.height*6}px`);}
 const revisit=(t:Topic)=>{if(topic&&topic.id!==t.id)setPrevious(topic);openTopic(t,'push');};
 const resetTilt=()=>{world.current?.style.setProperty('--hall-x','0px');world.current?.style.setProperty('--hall-y','0px');};
 const choose=(i:number)=>{setChoice(i);setError('');go({s:'confirm',c:i});};
 const knownFact=seed?.facts[fact%(seed?.facts.length||1)];
 const factSource=knownFact?lookup?.sources[knownFact.source]:null;
 const isSaved=topic&&saved.some(s=>s.topicId===topic.id);
 const matches=lookup?.matches||[];
 return <div className={`hall hall-stage-${stage} ${paused||reduced?'hall-still':''}`} onPointerMove={tilt} onPointerLeave={resetTilt}>
  <a className="hall-skip" href="#hall-main">Skip to content</a>
  <div ref={world} className="hall-world" aria-hidden="true"><div className="hall-world-layer hall-world-arrival"><Image src={hallImage} alt="" fill priority sizes="100vw" placeholder="blur" quality={85}/></div><div className="hall-world-layer hall-world-reading"><Image src={readingRoom} alt="" fill priority sizes="100vw" placeholder="blur" quality={85}/></div><div className="hall-world-wash"/></div>
  <header className="hall-header">{stage==='welcome'?<span aria-hidden="true"/>:<button className="hall-back" onClick={goBack}><ArrowLeft size={15}/><span>Back</span></button>}<button className="hall-brand" onClick={goHome} aria-label="threeangle home" disabled={busy}><HallMark/><span>threeangle</span></button>{stage==='welcome'?<span aria-hidden="true"/>:<button className="hall-saved-nav" disabled={busy} onClick={()=>{shelf.current?.showModal();void loadShelf();}}><Bookmark size={15}/><span>Saved</span><span className="hall-save-count">{saved.length.toString().padStart(2,'0')}</span></button>}</header>
  <main id="hall-main" ref={main} tabIndex={-1} className="hall-main">
   {stage==='welcome'&&<section className="hall-welcome"><Invitation/><div className="hall-welcome-copy"><p className="hall-eyebrow">READ · LISTEN · WATCH</p><h1>When you read, listen, and watch<br className="hall-desktop-break"/> around the same idea,<br/><em>it all glows a little brighter.</em></h1><p className="hall-welcome-description">One thing you love. Two things to discover.<br/>A connection you didn’t see coming.</p><button className="hall-button" onClick={startInput}>I have a title <ArrowRight size={17}/></button><Link className="hall-underlink" href="/?browse=1" prefetch={false}>Or wander through our threeangle ideas <ArrowUpRight size={13}/></Link></div><div className="hall-welcome-bottom"><span>THREE WORKS. ONE DEEPER FASCINATION.</span><Flourish/><span>COME IN. STAY CURIOUS.</span></div></section>}
   {stage==='input'&&<section className="hall-input hall-enter"><div className="hall-section-heading"><p className="hall-eyebrow">{seed?'YOUR FIRST CORNER':'BEGIN WITH SOMETHING YOU LOVED'}</p><Flourish/><h1>{seed?<>Every fascination<br/>starts <em>somewhere.</em></>:<>Tell us something you loved,<br/>and we’ll build the rest<br className="hall-mobile-break"/> <em>of the triangle.</em></>}</h1>{!seed&&<p>A book, a film, a podcast episode.<br/>We’ll find two companions and the idea that connects them.</p>}</div>
    {restoring?<p role="status" className="hall-center-note">Opening your connection…</p>:<div className="hall-desk">
     {!seed?<><form onSubmit={find}><label htmlFor="hall-title">The title you loved</label><div className="hall-title-field"><input ref={titleInput} id="hall-title" value={title} onChange={e=>setTitle(e.target.value)} placeholder="What stayed with you?" maxLength={240} required minLength={2} disabled={busy} autoComplete="off"/><button type="submit" aria-label="Find my title" disabled={busy||ready!==true||title.trim().length<2}><ArrowRight size={22}/></button></div><div className="hall-input-meta"><span>For a podcast, use the episode title.</span><span>01 / 03</span></div></form>
      {busy&&<div className="hall-lookup-status" role="status"><span className="hall-tiny-triangle">△</span> Finding your work… <button className="hall-text-button" onClick={cancelLookup}>Cancel</button></div>}
      {!busy&&(matches.length>0||clarify)&&<div className="hall-matches">{matches.length>0&&<><h2>{matches.length>1?'Which one stayed with you?':'Is this the one?'}</h2>{matches.map((m,i)=><button key={m.title+i} onClick={()=>choose(i)}><span className="hall-eyebrow">{m.format} · {m.year}</span><h3>{m.title}</h3><p>{m.creator}</p><span className="hall-match-description">{m.description.length>240?m.description.slice(0,237).replace(/\s+\S*$/,'')+'…':m.description}</span><span className="hall-match-action">This is the one <ArrowRight size={16}/></span></button>)}</>}
       <div className="hall-notit">{!refine.open?<button className="hall-text-button" onClick={()=>setRefine(r=>({...r,open:true}))}>{matches.length>0?'None of these? Help us find it.':'Help us find it.'} <Plus size={14}/></button>
        :<form className="hall-refine" onSubmit={e=>{void find(e,true);}} aria-label="Narrow the search">
         <p className="hall-eyebrow">{matches.length>0?'NOT QUITE RIGHT':'A LITTLE MORE, PLEASE'}</p>
         <p className="hall-refine-lede">Add whatever you remember. {matches.length>0?'We’ll look again and skip the ones you’ve ruled out.':'We’ll look again.'}</p>
         <label htmlFor="hall-refine-creator">Who made it? <span>Author, director, host or network</span></label>
         <input id="hall-refine-creator" value={refine.creator} maxLength={120} autoComplete="off" onChange={e=>setRefine(r=>({...r,creator:e.target.value}))}/>
         <fieldset><legend>What kind of thing is it?</legend><div className="hall-refine-formats">{FORMATS.map(f=><button type="button" key={f} aria-pressed={refine.format===f} onClick={()=>setRefine(r=>({...r,format:r.format===f?'':f}))}>{f}</button>)}</div>{refine.format==='Podcast episode'&&<p className="hall-refine-note">Put the episode title in the box above, and the show name under “Who made it?”.</p>}</fieldset>
         <label htmlFor="hall-refine-year">Year <span>Roughly is fine</span></label>
         <input id="hall-refine-year" value={refine.year} maxLength={20} inputMode="numeric" autoComplete="off" onChange={e=>setRefine(r=>({...r,year:e.target.value}))}/>
         <div className="hall-refine-actions"><button className="hall-button" type="submit" disabled={busy||ready!==true}>Search again <ArrowRight size={16}/></button><button type="button" className="hall-text-button" onClick={()=>setRefine(r=>({...r,open:false}))}>Never mind</button></div>
        </form>}</div>
       {lookup&&<Sources lookup={lookup}/>}</div>}
     </>:<><div className="hall-confirmed"><span className="hall-bookmark-tab"><HallMark/></span><p className="hall-eyebrow">{seed.format} · {seed.year}</p><h2>{seed.title}</h2><p>{seed.creator}</p><button className="hall-text-button" onClick={goBack}>Not this one? Choose a different work</button></div><form onSubmit={e=>{e.preventDefault();void generate();}}><details className="hall-interest" open={Boolean(interest)}><summary>Something in particular drew you in? <span>Optional</span><Plus size={14}/></summary><label className="hall-sr" htmlFor="hall-interest">What drew you in?</label><textarea id="hall-interest" value={interest} maxLength={600} onChange={e=>setInterest(e.target.value)} placeholder="A character, a question, a feeling you can’t shake…" rows={3}/></details><button className="hall-button hall-build" disabled={busy||ready!==true}>Build my threeangle <ArrowRight size={17}/></button><p className="hall-form-foot">Your work stays. We’ll find the other two angles.</p></form></>}
     {ready===false&&<div className="hall-alert"><p>Our custom connections are taking a pause. The curated collection is still open.</p><Link href="/?browse=1" prefetch={false}>Explore the collection <ArrowRight size={14}/></Link></div>}
     {error&&<p className="hall-alert" role="alert">{error}{ready===null&&<button className="hall-text-button" onClick={()=>location.reload()}>Reconnect</button>}</p>}
     {previous&&<button className="hall-text-button hall-return" onClick={()=>revisit(previous)}><ArrowLeft size={14}/> Your previous connection: {previous.name}</button>}
    </div>}
    <p className="hall-browse-footer">Don’t know where to start? <Link href="/?browse=1" prefetch={false}>Browse these threeangle ideas.</Link></p>
   </section>}
   {stage==='thinking'&&<section className="hall-thinking hall-enter"><p className="hall-eyebrow">THE LIBRARY AT WORK</p><div className="hall-thinking-plate"><Geometry building/><span className="hall-plate-side">FIG. 01 / A CONNECTION TAKING SHAPE</span></div><h1>A little further<br/><em>into the idea.</em></h1><p className="hall-thinking-title">Starting with <i>{seed?.title||topic?.seedTitle||topic?.works[0].title}</i></p><p className="hall-phase" role="status">{phase}</p>{knownFact&&factSource&&<div className="hall-discovery"><span className="hall-eyebrow">A NOTE IN THE MARGIN</span><p>{knownFact.text}</p><div><a href={safeUrl(factSource.url)} target="_blank" rel="noopener noreferrer">Read the source <ArrowUpRight size={12}/></a>{seed&&seed.facts.length>1&&<button onClick={()=>setFact(f=>f+1)}>Another note <ArrowRight size={12}/></button>}</div></div>}<p className="hall-wait-note">{slow?'Still following the thread. Your starting title is safe here.':'Thoughtful connections take a moment. Sometimes a couple of minutes.'}</p><button className="hall-text-button" onClick={goBack}>Back to my title</button></section>}
   {stage==='reveal'&&topic&&<section className="hall-reveal hall-enter" key={topic.id}><div className="hall-result-bar"><button className="hall-text-button" onClick={freshStart}><ArrowLeft size={14}/> A new starting point</button><span className="hall-eyebrow">{topic.seedTitle?'A CONNECTION MADE FOR YOU':'FROM THE CURATED COLLECTION'}</span><button className="hall-text-button" onClick={save} disabled={saving}>{isSaved?<Check size={15}/>:<Bookmark size={15}/>} {saving?'Saving…':isSaved?'Saved':'Keep this connection'}</button></div><header className="hall-result-heading"><Flourish/><p className="hall-eyebrow">YOUR THREEANGLE</p><h1>{topic.name}</h1><p>{topic.hook}</p></header>
    <TriangleReveal topic={topic} instant={reduced||paused}/>
    {topic.works[3]&&<details className="hall-bonus"><summary><span className="hall-bonus-mark">+</span><span><span className="hall-eyebrow">ONE MORE THING</span><span className="hall-bonus-tease">A little something from the next shelf.</span></span><ArrowRight size={20}/></summary><div className="hall-bonus-content"><span className="hall-eyebrow">{topic.works[3].format}</span><h2>{topic.works[3].title}</h2><p>{topic.works[3].creator}</p><p>{topic.bonus||topic.works[3].pitch}</p><a className="hall-work-link" href={safeUrl(workUrl(topic.works[3]))} target="_blank" rel="noopener noreferrer">Explore the bonus <ArrowUpRight size={15}/></a></div></details>}
    <Sources topic={topic}/><section className="hall-next"><Flourish/><p className="hall-eyebrow">THERE’S ALWAYS ANOTHER WAY IN</p><h2>What else <em>might it open?</em></h2><p>Keep {topic.seedTitle||topic.works[0].title} as your starting point,<br className="hall-desktop-break"/> or bring something new.</p><button className="hall-button" onClick={()=>void generate(true)} disabled={busy||ready!==true}>Find another angle <RotateCcw size={16}/></button><button className="hall-underlink" onClick={freshStart}>Start with a different title <ArrowRight size={14}/></button><Link className="hall-underlink" href="/?browse=1" prefetch={false}>Or wander through the collection <ArrowUpRight size={13}/></Link>{previous&&<button className="hall-text-button hall-return" onClick={()=>revisit(previous)}>Return to {previous.name}</button>}</section>
   </section>}
  </main>
  {notice&&<div className="hall-toast" role="status">{notice}<button aria-label="Dismiss notification" onClick={()=>setNotice('')}><X size={15}/></button></div>}
  <footer className="hall-footer"><span>READ. LISTEN. WATCH. CONNECT.</span><button className="hall-motion" onClick={()=>{setPaused(p=>!p);resetTilt();}} aria-pressed={paused||reduced} disabled={reduced}>{paused||reduced?<Play size={12}/>:<Pause size={12}/>} {reduced?'Reduced motion':paused?'Resume motion':'Pause motion'}</button><span>threeangle <span className="hall-footer-dot">·</span> STAY CURIOUS.</span></footer>
  <dialog ref={shelf} className="hall-shelf" aria-labelledby="hall-shelf-title" onClick={e=>{if(e.target===e.currentTarget)shelf.current?.close();}}><div className="hall-shelf-inner"><header><span className="hall-eyebrow">YOUR PERSONAL COLLECTION</span><button onClick={()=>shelf.current?.close()} aria-label="Close saved connections"><X size={22}/></button></header><h2 id="hall-shelf-title">Good things,<br/><em>kept close.</em></h2><p className="hall-shelf-description">The connections you want to come back to.</p>{shelfLoading?<p role="status">Opening your collection…</p>:shelfError?<div className="hall-alert"><p role="alert">{shelfError}</p><button className="hall-text-button" onClick={()=>void loadShelf()}>Try again</button></div>:saved.length===0?<div className="hall-shelf-empty"><Geometry/><p>When something stays with you,<br/>keep the whole triangle here.</p><button className="hall-button" onClick={()=>{shelf.current?.close();startInput();}}>Find your first connection <ArrowRight size={16}/></button></div>:<div className="hall-saved-list">{saved.map(item=>{const t=item.topic||topics.find(t=>t.id===item.topicId);return t?<button key={item.topicId} onClick={()=>{shelf.current?.close();revisit(t);}}><span className="hall-eyebrow">{t.seedTitle?'YOUR CONNECTION':'CURATED THREEANGLE'}</span><h3>{t.name}</h3><p>{t.works.map(w=>w.title).slice(0,3).join(' · ')}</p><ArrowUpRight size={18}/></button>:null;})}</div>}<p className="hall-shelf-foot">Saved for this browser. Clearing cookies removes access to your collection.</p></div></dialog>
 </div>;
}
