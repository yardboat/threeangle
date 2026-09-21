'use client';
import {Fragment,useCallback,useEffect,useLayoutEffect,useRef,useState,type CSSProperties,type ReactNode} from 'react';
import {ArrowLeft,ArrowRight,ArrowUpRight,BookOpen,Film,Headphones,Minus,Plus,X} from 'lucide-react';
import {workUrl,type Topic,type Work} from '@/lib/stories';
import {HallMark} from './geometry';
import {STEPS,ends,lightFor,sameFocus,stepOf,type Focus} from '@/lib/triangle-focus';

// The reveal is a real triangle, not three cards around a picture of one.
//   corners  = the three works (a Read, b Watch, c Listen), each seen from its own angle
//   sides    = the sentence that carries you from one work to the next (topic.bridges)
//   centre   = the common thread all three answer (topic.question), resolved by the connection note
// Corners, sides and centre are all selectable. "Walk the triangle" steps a → side → b → side → c → side → centre.
// Behaviour and structure only; typography and surface treatment live in hall.css / triangle.css.

const modes=['Read','Watch','Listen'];
const icons=[BookOpen,Film,Headphones];
const labels=['a','b','c'];
const safeUrl=(url:string)=>/^https?:\/\//i.test(url)?url:'#';

type Point={x:number;y:number};
type Geo={w:number;h:number;pts:Point[];chips:Point[];segments:[Point,Point][]};

function WorkCard({work,index,angle,seedTitle,selected,lit,onSelect,onHover}:{work:Work;index:number;angle?:string;seedTitle?:string;selected:boolean;lit:boolean;onSelect:()=>void;onHover:(on:boolean)=>void}){
 const Icon=icons[index];const seed=work.title===seedTitle;const colon=work.title.indexOf(':');const hasSubtitle=work.title.length>60&&colon>0&&colon<80;
 return <article className={`hall-work hall-tri-work-${index} ${selected?'hall-work-open':''} ${lit?'hall-work-lit':''}`} onPointerEnter={e=>{if(e.pointerType==='mouse')onHover(true);}} onPointerLeave={()=>onHover(false)}>
  <div className="hall-work-top"><span className="hall-letter">{labels[index]}</span><span className="hall-eyebrow"><Icon size={13}/>{modes[index]}{seed?' / You brought this':''}</span></div>
  {angle&&<span className="hall-angle">{angle}</span>}
  <button className="hall-work-select" aria-expanded={selected} aria-controls="hall-reading-note" onClick={onSelect}><span className="hall-format">{work.format}</span><h2>{hasSubtitle?<>{work.title.slice(0,colon+1)}<span className="hall-work-subtitle">{work.title.slice(colon+1).trim()}</span></>:work.title}</h2><p>{work.creator}</p><span className="hall-work-cue">{selected?'Close the reading note':'Why this belongs'} {selected?<Minus size={14}/>:<Plus size={14}/>}</span></button>
  <a className="hall-work-link" href={safeUrl(workUrl(work))} target="_blank" rel="noopener noreferrer">Explore the work <ArrowUpRight size={15}/><span className="hall-sr"> (opens in a new tab)</span></a>
 </article>;
}

// Where each work actually sits, so the sides are drawn between the real cards and stay attached at every width and title length.
function useGeometry(){
 const ref=useRef<HTMLDivElement>(null);const [geo,setGeo]=useState<Geo|null>(null);
 useLayoutEffect(()=>{
  const el=ref.current;if(!el)return;
  const slots=[...el.querySelectorAll<HTMLElement>('[data-slot]')];
  const measure=()=>{
   if(slots.length<3||!el.offsetWidth){setGeo(null);return;}
   const pts=slots.map(s=>({x:Math.round(s.offsetLeft+s.offsetWidth/2),y:Math.round(s.offsetTop+s.offsetHeight/2)}));
   const half=slots.map(s=>({x:s.offsetWidth/2,y:s.offsetHeight/2}));
   // Each side control sits on the part of its side that is actually visible between the two cards, nearer the apex for the slanted sides so it stays clear of the centre.
   const chips=[0,1,2].map(i=>{
    const a=i,b=(i+1)%3,dx=pts[b].x-pts[a].x,dy=pts[b].y-pts[a].y;
    const leave=(h:Point)=>Math.min(dx?h.x/Math.abs(dx):Infinity,dy?h.y/Math.abs(dy):Infinity);
    const t0=leave(half[a]),t1=1-leave(half[b]);
    const from=t1>t0?t0:0.35,to=t1>t0?t1:0.65,f=i===1?0.5:i===0?0.38:0.62;
    const t=from+(to-from)*f;
    return {x:Math.round(pts[a].x+dx*t),y:Math.round(pts[a].y+dy*t)};
   });
   // Clip ink to the card boundaries so transparent typography never has a line through it.
   const segments:[Point,Point][]=[0,1,2].map(i=>{
    const a=i,b=(i+1)%3,dx=pts[b].x-pts[a].x,dy=pts[b].y-pts[a].y;
    const cut=(h:Point)=>Math.min(dx?(h.x+12)/Math.abs(dx):Infinity,dy?(h.y+12)/Math.abs(dy):Infinity);
    const ta=Math.min(.49,cut(half[a])),tb=Math.max(.51,1-cut(half[b]));
    return [{x:pts[a].x+dx*ta,y:pts[a].y+dy*ta},{x:pts[a].x+dx*tb,y:pts[a].y+dy*tb}];
   });
   const next={w:el.offsetWidth,h:el.offsetHeight,pts,chips,segments};
   setGeo(old=>old&&old.w===next.w&&old.h===next.h&&old.pts.every((p,i)=>p.x===next.pts[i].x&&p.y===next.pts[i].y&&p.x===next.pts[i].x&&old.chips[i].x===next.chips[i].x&&old.chips[i].y===next.chips[i].y)?old:next);
  };
  measure();
  const observer=new ResizeObserver(measure);observer.observe(el);slots.forEach(s=>observer.observe(s));
  void document.fonts?.ready.then(measure);
  return()=>observer.disconnect();
 },[]);
 return {ref,geo};
}

function Stage({topic,focus,active,onSelect,onHover}:{topic:Topic;focus:Focus|null;active:Focus|null;onSelect:(f:Focus)=>void;onHover:(f:Focus|null)=>void}){
 const {ref,geo}=useGeometry();const works=topic.works.slice(0,3);const light=lightFor(active);
 const centroid=geo?{x:Math.round((geo.pts[0].x+geo.pts[1].x+geo.pts[2].x)/3),y:Math.round((geo.pts[0].y+geo.pts[1].y+geo.pts[2].y)/3)}:null;
 const line=(i:number)=>{if(!geo)return '';const [a,b]=geo.segments[i];return `M${a.x} ${a.y}L${b.x} ${b.y}`;};
 const chip=(i:number)=>{
  const [a,b]=ends(i);const edge:Focus={kind:'edge',index:i};
  return <button key={'chip'+i} className={`hall-tri-chip hall-tri-chip-${i} ${light.sides.has(i)?'is-lit':''}`} style={geo?{left:geo.chips[i].x,top:geo.chips[i].y}:undefined} aria-pressed={sameFocus(focus,edge)} aria-label={`The thread between ${modes[a]} and ${modes[b]}`} onClick={()=>onSelect(edge)} onPointerEnter={e=>{if(e.pointerType==='mouse')onHover(edge);}} onPointerLeave={()=>onHover(null)}><span className="hall-thread-label">{modes[a]} + {modes[b]}</span><span aria-hidden="true">↗</span></button>;
 };
 return <div ref={ref} className="hall-tri" role="group" aria-label="Your triangle: three works and the threads between them" data-lit={active?'true':undefined} style={centroid?{'--cx':centroid.x+'px','--cy':centroid.y+'px'} as CSSProperties:undefined}>
  {geo&&<svg className="hall-tri-lines" width={geo.w} height={geo.h} viewBox={`0 0 ${geo.w} ${geo.h}`} aria-hidden="true">
   {[0,1,2].map(i=><path key={i} className={`hall-tri-line hall-tri-line-${i} ${light.sides.has(i)?'is-lit':''}`} d={line(i)} pathLength={1}/>)}
   {[0,1,2].map(i=><path key={'hit'+i} className="hall-tri-hit" d={line(i)} onClick={()=>onSelect({kind:'edge',index:i})} onPointerEnter={e=>{if(e.pointerType==='mouse')onHover({kind:'edge',index:i});}} onPointerLeave={()=>onHover(null)}/>)}
  </svg>}
  {works.map((w,i)=><Fragment key={w.title+i}>
   <div data-slot={i} className={`hall-tri-slot hall-tri-slot-${i}`}>
    <WorkCard work={w} index={i} angle={topic.angles?.[i]} seedTitle={topic.seedTitle} selected={sameFocus(focus,{kind:'vertex',index:i})} lit={light.corners.has(i)&&!sameFocus(focus,{kind:'vertex',index:i})} onSelect={()=>onSelect({kind:'vertex',index:i})} onHover={on=>onHover(on?{kind:'vertex',index:i}:null)}/>
   </div>
   {chip(i)}
  </Fragment>)}
  <div className={`hall-tri-center ${light.corners.size===3?'is-lit':''}`}>
   <div className="hall-topic-seal"><span className="hall-eyebrow">THE COMMON THREAD</span><HallMark/><p>{topic.question}</p></div>
   <button className="hall-tri-center-btn" aria-pressed={focus?.kind==='center'} aria-label="Open the common thread" onClick={()=>onSelect({kind:'center'})} onPointerEnter={e=>{if(e.pointerType==='mouse')onHover({kind:'center'});}} onPointerLeave={()=>onHover(null)}/>
  </div>
 </div>;
}

// Small tappable triangle for narrow screens, where the works stack vertically.
const MAP=[{x:150,y:40},{x:44,y:206},{x:256,y:206}];
function TriangleMap({focus,active,onSelect}:{focus:Focus|null;active:Focus|null;onSelect:(f:Focus)=>void}){
 const light=lightFor(active);const pos=(p:Point)=>({left:p.x/300*100+'%',top:p.y/250*100+'%'});
 return <div className="hall-tri-map" role="group" aria-label="Move around the triangle">
  <svg viewBox="0 0 300 250" aria-hidden="true">
   {[0,1,2].map(i=>{const [a,b]=ends(i);return <path key={i} className={`hall-tri-line hall-tri-line-${i} ${light.sides.has(i)?'is-lit':''}`} d={`M${MAP[a].x} ${MAP[a].y}L${MAP[b].x} ${MAP[b].y}`} pathLength={1}/>;})}
  </svg>
  {[0,1,2].map(i=>{const Icon=icons[i];return <button key={'v'+i} className={`hall-tri-map-node ${light.corners.has(i)?'is-lit':''}`} style={pos(MAP[i])} aria-pressed={sameFocus(focus,{kind:'vertex',index:i})} aria-label={`${modes[i]}: open the reading note`} onClick={()=>onSelect({kind:'vertex',index:i})}><Icon size={16}/><span>{modes[i]}</span></button>;})}
  {[0,1,2].map(i=>{const [a,b]=ends(i);const mid={x:(MAP[a].x+MAP[b].x)/2,y:(MAP[a].y+MAP[b].y)/2};return <button key={'e'+i} className={`hall-tri-map-edge ${light.sides.has(i)?'is-lit':''}`} style={pos(mid)} aria-pressed={sameFocus(focus,{kind:'edge',index:i})} aria-label={`The thread between ${modes[a]} and ${modes[b]}`} onClick={()=>onSelect({kind:'edge',index:i})}>{labels[a]}—{labels[b]}</button>;})}
  <button className={`hall-tri-map-node hall-tri-map-center ${focus?.kind==='center'?'is-lit':''}`} style={pos({x:150,y:150})} aria-pressed={focus?.kind==='center'} aria-label="The common thread" onClick={()=>onSelect({kind:'center'})}><HallMark/></button>
 </div>;
}

function Panel({topic,focus,onSelect,onStep,onClose,onConnection}:{topic:Topic;focus:Focus|null;onSelect:(f:Focus)=>void;onStep:(delta:number)=>void;onClose:()=>void;onConnection:()=>void}){
 const step=stepOf(focus);
 if(!focus)return <div id="hall-reading-note" className="hall-reading-note hall-tri-panel" aria-live="polite"><p className="hall-tri-hint">Choose a corner for the reading note, a side to see how two works answer each other, or the middle for the thread they share.</p><button className="hall-text-button hall-tri-walk" onClick={()=>onSelect(STEPS[0])}>Walk the triangle <ArrowRight size={14}/></button></div>;
 const nav=<div className="hall-tri-steps"><button className="hall-text-button" onClick={()=>onStep(-1)} disabled={step<=0}><ArrowLeft size={14}/> Previous</button><span className="hall-tri-pips" aria-label={`Step ${step+1} of ${STEPS.length}`}>{STEPS.map((s,i)=><i key={i} className={`${i===step?'is-current':''} ${i<step?'is-past':''} hall-tri-pip-${s.kind}`}/>)}</span><button className="hall-text-button" onClick={()=>onStep(1)} disabled={step>=STEPS.length-1}>Next <ArrowRight size={14}/></button></div>;
 const close=<button aria-label="Close" onClick={onClose}><X size={18}/></button>;
 let body:ReactNode;
 if(focus.kind==='vertex'){
  const i=focus.index,Icon=icons[i],work=topic.works[i];
  body=<><div><span className="hall-eyebrow"><Icon size={13}/>{modes[i]} / THE READING NOTE</span>{close}</div><h2>{topic.heads?.[i]||work.title}</h2><p>{work.pitch}</p>{topic.angles?.[i]&&<p className="hall-note-bridge"><span className="hall-eyebrow">SEEN AS · {topic.angles[i]}</span>{topic.answers?.[i]}</p>}</>;
 }else if(focus.kind==='edge'){
  const i=focus.index,[a,b]=ends(i);
  body=<><div><span className="hall-eyebrow">THE THREAD / {modes[a]} + {modes[b]}</span>{close}</div><h2 className="hall-edge-bridge">{topic.bridges?.[i]}</h2><div className="hall-edge-pair">{[a,b].map(c=><button key={c} className="hall-edge-end" onClick={()=>onSelect({kind:'vertex',index:c})}><span className="hall-eyebrow">{labels[c]} · {modes[c]}{topic.angles?.[c]?' · '+topic.angles[c]:''}</span><span className="hall-edge-title">{topic.works[c].title}</span></button>)}</div></>;
 }else{
  body=<><div><span className="hall-eyebrow">THE COMMON THREAD</span>{close}</div><h2>{topic.question}</h2>{topic.angles.length>0&&<p className="hall-edge-angles">{topic.angles.slice(0,3).map((angle,i)=><span key={i}><b>{labels[i]}</b> {angle}</span>)}</p>}<button className="hall-text-button" onClick={onConnection}>See them together <ArrowRight size={14}/></button></>;
 }
 return <div id="hall-reading-note" className="hall-reading-note hall-note-open hall-tri-panel" aria-live="polite">{body}{nav}</div>;
}

export function TriangleReveal({topic,instant}:{topic:Topic;instant:boolean}){
 const [focus,setFocus]=useState<Focus|null>(null),[hover,setHover]=useState<Focus|null>(null),[deeper,setDeeper]=useState(false);
 const connection=useRef<HTMLDivElement>(null);
 const active=hover??focus;
 const select=(f:Focus)=>setFocus(current=>sameFocus(current,f)?null:f);
 const step=useCallback((delta:number)=>setFocus(current=>STEPS[Math.min(STEPS.length-1,Math.max(0,stepOf(current)+delta))]),[]);
 const open=focus!==null;
 useEffect(()=>{
  if(!focus)return;
  const id=requestAnimationFrame(()=>document.getElementById('hall-reading-note')?.scrollIntoView({behavior:instant?'instant':'smooth',block:'nearest'}));
  return()=>cancelAnimationFrame(id);
 },[focus,instant]);
 // While something is open, the arrow keys walk the triangle and Escape closes it.
 useEffect(()=>{
  if(!open)return;
  const onKey=(e:globalThis.KeyboardEvent)=>{
   if(e.defaultPrevented||e.metaKey||e.ctrlKey||e.altKey||(e.target as HTMLElement).closest?.('input,textarea,select,dialog,[contenteditable="true"]'))return;
   if(e.key==='Escape')setFocus(null);
   else if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();step(e.key==='ArrowRight'?1:-1);}
  };
  window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey);
 },[open,step]);
 const showConnection=()=>{setDeeper(true);requestAnimationFrame(()=>connection.current?.scrollIntoView({behavior:instant?'instant':'smooth',block:'start'}));};
 return <div className="hall-tri-wrap">
  <TriangleMap focus={focus} active={active} onSelect={select}/>
  <Stage topic={topic} focus={focus} active={active} onSelect={select} onHover={setHover}/>
  <Panel topic={topic} focus={focus} onSelect={select} onStep={step} onClose={()=>setFocus(null)} onConnection={showConnection}/>
  <div ref={connection} id="hall-connection" className={`hall-connection-note ${focus?.kind==='center'?'hall-connection-active':''}`}><span className="hall-eyebrow">SEE THEM TOGETHER</span><h2>{topic.shift}</h2><p>{topic.payoff||topic.intro}</p><details className="hall-deeper" open={deeper} onToggle={e=>setDeeper(e.currentTarget.open)}><summary>Follow the connection deeper <Plus size={15}/></summary><p>{topic.intro}</p>{topic.angles.map((angle,i)=><div key={i}><h3>{angle}</h3><p>{topic.answers[i]}</p></div>)}</details></div>
 </div>;
}
