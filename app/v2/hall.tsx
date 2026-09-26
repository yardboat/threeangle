'use client';
import {useCallback,useEffect,useRef,useState,type FormEvent} from 'react';
import Link from 'next/link';
import {ArrowRight,ArrowUpRight,ArrowLeft,Bookmark,Check,Plus,X,Pause,Play,RotateCcw} from 'lucide-react';
import type {Lookup} from '@/lib/corner-schema';
import {FORMATS} from '@/lib/formats';
import {topics,workUrl,type Topic} from '@/lib/stories';
import {readTriangleResponse,sameWork,screenFromSearch,screenUrl,parentScreen,sameScreen,type Screen} from '@/lib/hall-client';
import {HallMark,Invitation,LiveMark} from './geometry';
import {Figure} from './figure';
import {TriangleReveal} from './triangle';
import {HallWorld,roomNames,type Room} from './world';

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
 const [looking,setLooking]=useState(false);
 const [paused,setPaused]=useState(false),[reduced,setReduced]=useState(false),[saved,setSaved]=useState<Saved[]>([]),[saving,setSaving]=useState(false),[shelfLoading,setShelfLoading]=useState(false),[shelfError,setShelfError]=useState('');
 const [fact,setFact]=useState(0),[slow,setSlow]=useState(false),[restoring,setRestoring]=useState(Boolean(first.id&&!first.topic));
 const [refine,setRefine]=useState<Refine>({open:false,creator:'',year:'',format:''}),[clarify,setClarify]=useState(false);
 const controller=useRef<AbortController|null>(null),requestId=useRef(0),main=useRef<HTMLElement>(null),shelf=useRef<HTMLDialogElement>(null),titleInput=useRef<HTMLInputElement>(null);
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
  if(!looking)return;
  const escape=(e:KeyboardEvent)=>{if(e.key==='Escape')setLooking(false);};
  window.addEventListener('keydown',escape);return()=>window.removeEventListener('keydown',escape);
 },[looking]);
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
 const revisit=(t:Topic)=>{if(topic&&topic.id!==t.id)setPrevious(topic);openTopic(t,'push');};
 const choose=(i:number)=>{setChoice(i);setError('');go({s:'confirm',c:i});};
 const knownFact=seed?.facts[fact%(seed?.facts.length||1)];
 const factSource=knownFact?lookup?.sources[knownFact.source]:null;
 const isSaved=topic&&saved.some(s=>s.topicId===topic.id);
 const matches=lookup?.matches||[];
 const room:Room=stage==='welcome'?'arrival':stage==='thinking'?'gallery':stage==='reveal'?'rotunda':seed?'study':'reading';
 const still=paused||reduced;
 const nameSize=(n:string)=>n.length>30?'is-xlong':n.length>20?'is-long':n.length>13?'is-mid':'';
 return <div className={`hall hall-stage-${stage} ${stage==='thinking'||stage==='reveal'?'hall-dark':'hall-light'} ${still?'hall-still':''} ${looking?'hall-looking':''}`}>
  <a className="hall-skip" href="#hall-main">Skip to content</a>
  <HallWorld room={room} still={still} looking={looking}/>
  <header className="hall-header">
   <div className="hall-header-side">{stage!=='welcome'&&<button className="hall-nav hall-back" onClick={goBack}><ArrowLeft size={15}/><span>Back</span></button>}<span className="hall-room-name">{roomNames[room]}</span></div>
   <button className="hall-brand" onClick={goHome} aria-label="threeangle home" disabled={busy}><LiveMark still={still}/><span>threeangle</span></button>
   <div className="hall-header-side hall-header-end"><button className="hall-nav hall-look" onClick={()=>setLooking(v=>!v)} aria-pressed={looking} aria-controls="hall-main">{looking?'Return':'Look around'} {looking?<X size={13}/>:<Plus size={13}/>}</button>{stage!=='welcome'&&<button className="hall-nav hall-saved-nav" disabled={busy} onClick={()=>{shelf.current?.showModal();void loadShelf();}}><span>Saved</span><span className="hall-save-count">{saved.length.toString().padStart(2,'0')}</span></button>}</div>
  </header>
  <main id="hall-main" ref={main} tabIndex={-1} className="hall-main" inert={looking}>
   {stage==='welcome'&&<section className="hall-welcome hall-enter">
    <Invitation still={still}/>
    <div className="hall-welcome-copy">
     <p className="hall-lead">When you read, listen, and watch around the same idea,</p>
     <h1 className="hall-mega">It all glows<br/>a little brighter.</h1>
     <p className="hall-sub">One thing you love. Two things to discover.<br/>A connection you didn’t see coming.</p>
     <div className="hall-actions"><button className="hall-cta" onClick={startInput}>Pick your starting point <ArrowRight size={17}/></button><Link className="hall-quiet" href="/?browse=1" prefetch={false}>Or wander through our threeangle ideas <ArrowUpRight size={13}/></Link></div>
    </div>
   </section>}
   {stage==='input'&&<section className={`hall-input hall-enter ${seed?'hall-confirm':'hall-find'}`} key={seed?'confirm':'find'}>
    {!seed?<header className="hall-screen-head"><p className="hall-kicker">Begin with something you loved</p><h1 className="hall-mega hall-mega-m">What stayed<br/>with you?</h1><p className="hall-sub">A book, a film, a podcast episode. We’ll find two companions and the idea that connects them.</p></header>
     :<header className="hall-screen-head"><p className="hall-kicker">Your first corner</p><h1 className="hall-mega hall-mega-m">Every fascination<br/>starts somewhere.</h1></header>}
    {restoring?<p role="status" className="hall-center-note">Opening your connection…</p>:<div className="hall-desk">
     {!seed?<><form onSubmit={find} className="hall-find-form"><label htmlFor="hall-title">The title you loved</label><div className="hall-title-field"><input ref={titleInput} id="hall-title" value={title} onChange={e=>setTitle(e.target.value)} placeholder="Type a title" maxLength={240} required minLength={2} disabled={busy} autoComplete="off"/><button type="submit" aria-label="Find my title" disabled={busy||ready!==true||title.trim().length<2}><ArrowRight size={24}/></button></div><div className="hall-input-meta"><span>For a podcast, use the episode title.</span><span>01 / 03</span></div></form>
      {busy&&<div className="hall-lookup-status" role="status"><span className="hall-pulse" aria-hidden="true"/> Finding your work… <button className="hall-quiet" onClick={cancelLookup}>Cancel</button></div>}
      {!busy&&(matches.length>0||clarify)&&<div className="hall-matches">{matches.length>0&&<><h2 className="hall-kicker">{matches.length>1?'Which one stayed with you?':'Is this the one?'}</h2><ol>{matches.map((m,i)=><li key={m.title+i}><button onClick={()=>choose(i)}><span className="hall-kicker">{m.format} · {m.year}</span><span className="hall-match-title">{m.title}</span><span className="hall-match-creator">{m.creator}</span><span className="hall-match-description">{m.description.length>220?m.description.slice(0,217).replace(/\s+\S*$/,'')+'…':m.description}</span><span className="hall-match-action">This is the one <ArrowRight size={16}/></span></button></li>)}</ol></>}
       <div className="hall-notit">{!refine.open?<button className="hall-quiet" onClick={()=>setRefine(r=>({...r,open:true}))}>{matches.length>0?'None of these? Help us find it.':'Help us find it.'} <Plus size={14}/></button>
        :<form className="hall-refine" onSubmit={e=>{void find(e,true);}} aria-label="Narrow the search">
         <p className="hall-kicker">{matches.length>0?'Not quite right':'A little more, please'}</p>
         <p className="hall-refine-lede">Add whatever you remember. {matches.length>0?'We’ll look again and skip the ones you’ve ruled out.':'We’ll look again.'}</p>
         <label htmlFor="hall-refine-creator">Who made it? <span>Author, director, host or network</span></label>
         <input id="hall-refine-creator" value={refine.creator} maxLength={120} autoComplete="off" onChange={e=>setRefine(r=>({...r,creator:e.target.value}))}/>
         <fieldset><legend>What kind of thing is it?</legend><div className="hall-refine-formats">{FORMATS.map(f=><button type="button" key={f} aria-pressed={refine.format===f} onClick={()=>setRefine(r=>({...r,format:r.format===f?'':f}))}>{f}</button>)}</div>{refine.format==='Podcast episode'&&<p className="hall-refine-note">Put the episode title in the box above, and the show name under “Who made it?”.</p>}</fieldset>
         <label htmlFor="hall-refine-year">Year <span>Roughly is fine</span></label>
         <input id="hall-refine-year" value={refine.year} maxLength={20} inputMode="numeric" autoComplete="off" onChange={e=>setRefine(r=>({...r,year:e.target.value}))}/>
         <div className="hall-refine-actions"><button className="hall-cta" type="submit" disabled={busy||ready!==true}>Search again <ArrowRight size={16}/></button><button type="button" className="hall-quiet" onClick={()=>setRefine(r=>({...r,open:false}))}>Never mind</button></div>
        </form>}</div>
       {lookup&&<Sources lookup={lookup}/>}</div>}
     </>:<div className="hall-confirm-body">
      <Figure variant="hero" faces={[{title:seed.title,creator:seed.creator,seed:true},{unknown:true},{unknown:true}]} labels={['a','?','?']} view={{turn:0,el:22}} lit={{corners:new Set([0]),sides:new Set()}} still={still} label={`Your first corner: ${seed.title}`}/>
      <div className="hall-confirmed"><p className="hall-kicker">{seed.format} · {seed.year}</p><h2>{seed.title}</h2><p className="hall-match-creator">{seed.creator}</p><button className="hall-quiet" onClick={goBack}>Not this one? Choose a different work</button>
       <form onSubmit={e=>{e.preventDefault();void generate();}}><details className="hall-interest" open={Boolean(interest)}><summary>Something in particular drew you in? <span>Optional</span><Plus size={14}/></summary><label className="hall-sr" htmlFor="hall-interest">What drew you in?</label><textarea id="hall-interest" value={interest} maxLength={600} onChange={e=>setInterest(e.target.value)} placeholder="A character, a question, a feeling you can’t shake…" rows={3}/></details><button className="hall-cta hall-build" disabled={busy||ready!==true}>Build my threeangle <ArrowRight size={17}/></button><p className="hall-form-foot">Your work stays. We’ll find the other two angles.</p></form>
      </div>
     </div>}
     {ready===false&&<div className="hall-alert"><p>Our custom connections are taking a pause. The curated collection is still open.</p><Link className="hall-quiet" href="/?browse=1" prefetch={false}>Explore the collection <ArrowRight size={14}/></Link></div>}
     {error&&<p className="hall-alert" role="alert">{error}{ready===null&&<button className="hall-quiet" onClick={()=>location.reload()}>Reconnect</button>}</p>}
     {previous&&<button className="hall-quiet hall-return" onClick={()=>revisit(previous)}><ArrowLeft size={14}/> Your previous connection: {previous.name}</button>}
    </div>}
    {!seed&&<p className="hall-browse-footer">Don’t know where to start? <Link href="/?browse=1" prefetch={false}>Browse these threeangle ideas.</Link></p>}
   </section>}
   {stage==='thinking'&&<section className="hall-thinking hall-enter">
    <p className="hall-kicker">The library at work</p>
    <h1 className="hall-mega hall-mega-m">A little further<br/>into the idea.</h1>
    <Figure variant="hero" faces={[{title:seed?.title||topic?.seedTitle||topic?.works[0].title},{unknown:true},{unknown:true}]} labels={['a','?','?']} view={null} idle building still={still} label="Your threeangle, taking shape"/>
    <p className="hall-phase" role="status">{phase}</p>
    {knownFact&&factSource&&<div className="hall-discovery"><span className="hall-kicker">A note in the margin</span><p>{knownFact.text}</p><div><a className="hall-quiet" href={safeUrl(factSource.url)} target="_blank" rel="noopener noreferrer">Read the source <ArrowUpRight size={12}/></a>{seed&&seed.facts.length>1&&<button className="hall-quiet" onClick={()=>setFact(f=>f+1)}>Another note <ArrowRight size={12}/></button>}</div></div>}
    <p className="hall-wait-note">{slow?'Still following the thread. Your starting title is safe here.':'Thoughtful connections take a moment. Sometimes a couple of minutes.'}</p>
    <button className="hall-quiet" onClick={goBack}>Back to my title</button>
   </section>}
   {stage==='reveal'&&topic&&<section className="hall-reveal" key={topic.id}>
    <TriangleReveal topic={topic} instant={still} heading={<header className="rv-heading">
     <p className="hall-kicker">Your threeangle <span>·</span> {topic.seedTitle?'Made for you':'From the curated collection'}</p>
     <h1 className={`hall-mega rv-name ${nameSize(topic.name)}`}>{topic.name}</h1>
     <p className="rv-hook">{topic.hook}</p>
    </header>} actions={<div className="rv-actions"><button className="hall-quiet" onClick={freshStart}><ArrowLeft size={14}/> A new starting point</button><button className="hall-quiet" onClick={save} disabled={saving}>{isSaved?<Check size={14}/>:<Bookmark size={14}/>} {saving?'Saving…':isSaved?'Kept':'Keep this connection'}</button></div>}/>
    {topic.works[3]&&<details className="rv-bonus"><summary><span className="hall-kicker">One more thing</span><span className="rv-bonus-tease">A little something from the next shelf.</span><Plus size={18}/></summary><div className="rv-bonus-content"><span className="hall-kicker">{topic.works[3].format}</span><h2>{topic.works[3].title}</h2><p className="hall-match-creator">{topic.works[3].creator}</p><p>{topic.bonus||topic.works[3].pitch}</p><a className="hall-quiet" href={safeUrl(workUrl(topic.works[3]))} target="_blank" rel="noopener noreferrer">Explore the bonus <ArrowUpRight size={15}/></a></div></details>}
    <Sources topic={topic}/>
    <section className="rv-next"><p className="hall-kicker">There’s always another way in</p><h2 className="hall-mega hall-mega-s">What else<br/>might it open?</h2><p className="hall-sub">Keep {topic.seedTitle||topic.works[0].title} as your starting point, or bring something new.</p><div className="hall-actions"><button className="hall-cta hall-cta-light" onClick={()=>void generate(true)} disabled={busy||ready!==true}>Find another angle <RotateCcw size={16}/></button><button className="hall-quiet" onClick={freshStart}>Start with a different title <ArrowRight size={14}/></button><Link className="hall-quiet" href="/?browse=1" prefetch={false}>Or wander through the collection <ArrowUpRight size={13}/></Link>{previous&&<button className="hall-quiet hall-return" onClick={()=>revisit(previous)}>Return to {previous.name}</button>}</div></section>
   </section>}
  </main>
  {notice&&<div className="hall-toast" role="status">{notice}<button aria-label="Dismiss notification" onClick={()=>setNotice('')}><X size={15}/></button></div>}
  <footer className="hall-footer"><span>Read. Listen. Watch. Connect.</span><button className="hall-motion" onClick={()=>setPaused(p=>!p)} aria-pressed={still} disabled={reduced}>{still?<Play size={11}/>:<Pause size={11}/>} {reduced?'Reduced motion':paused?'Resume motion':'Pause motion'}</button><span>threeangle · Stay curious.</span></footer>
  <dialog ref={shelf} className="hall-shelf" aria-labelledby="hall-shelf-title" onClick={e=>{if(e.target===e.currentTarget)shelf.current?.close();}}><div className="hall-shelf-inner"><header><span className="hall-kicker">Your personal collection</span><button onClick={()=>shelf.current?.close()} aria-label="Close saved connections"><X size={22}/></button></header><h2 id="hall-shelf-title" className="hall-mega hall-mega-s">Good things,<br/>kept close.</h2><p className="hall-sub">The connections you want to come back to.</p>{shelfLoading?<p role="status">Opening your collection…</p>:shelfError?<div className="hall-alert"><p role="alert">{shelfError}</p><button className="hall-quiet" onClick={()=>void loadShelf()}>Try again</button></div>:saved.length===0?<div className="hall-shelf-empty"><span className="hall-shelf-mark"><HallMark/></span><p>When something stays with you,<br/>keep the whole triangle here.</p><button className="hall-cta hall-cta-light" onClick={()=>{shelf.current?.close();startInput();}}>Find your first connection <ArrowRight size={16}/></button></div>:<ol className="hall-saved-list">{saved.map(item=>{const t=item.topic||topics.find(t=>t.id===item.topicId);return t?<li key={item.topicId}><button onClick={()=>{shelf.current?.close();revisit(t);}}><span className="hall-kicker">{t.seedTitle?'Your connection':'Curated threeangle'}</span><span className="hall-saved-name">{t.name}</span><span className="hall-saved-works">{t.works.map(w=>w.title).slice(0,3).join(' · ')}</span><ArrowUpRight size={18}/></button></li>:null;})}</ol>}<p className="hall-shelf-foot">Saved for this browser. Clearing cookies removes access to your collection.</p></div></dialog>
 </div>;
}
