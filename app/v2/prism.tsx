'use client';
import {useEffect,useRef,type CSSProperties,type ReactNode} from 'react';
import {BookOpen,Film,Headphones} from 'lucide-react';
import {worldSignal} from './world';
import type {Focus} from '@/lib/triangle-focus';

// The threeangle as an object: a standing triangular prism.
//   faces  = the three works (a Read, b Watch, c Listen), 120° apart
//   edges  = the thread between two works, where their faces meet
//   crown  = the common thread, engraved on the top
// Every 60° turn is one step of "Walk the triangle": a, a–b, b, b–c, c, c–a. Tilting forward shows the crown.

export const MODES=['Read','Watch','Listen'] as const;
const ICONS=[BookOpen,Film,Headphones];
export type PrismFace={title?:string;creator?:string;format?:string;seed?:boolean};
export type PrismView={turn:number;tilt:number};
export const HERO:PrismView={turn:-44,tilt:-14};
export const CROWN:PrismView={turn:0,tilt:-48};
export function viewFor(f:Focus|null):PrismView|null{
 if(!f)return null;
 if(f.kind==='center')return CROWN;
 return {turn:f.kind==='vertex'?f.index*120:f.index*120+60,tilt:-12};
}
// The step a drag comes to rest on.
export function focusAt(turn:number):Focus{
 const s=((Math.round(turn/60)%6)+6)%6;
 return s%2===0?{kind:'vertex',index:s/2}:{kind:'edge',index:(s-1)/2};
}

function titleSize(t:string){return t.length>64?'is-xlong':t.length>38?'is-long':t.length>18?'is-mid':'';}

export function Prism({faces,crown,mark,view,idle=false,still,variant='stage',lit,building=false,onPick,label,orbitWorld=false}:{
 faces:PrismFace[];crown?:ReactNode;mark?:ReactNode;view:PrismView|null;idle?:boolean;still:boolean;variant?:'stage'|'emblem'|'hero';
 lit?:{corners:Set<number>;sides:Set<number>};building?:boolean;onPick?:(f:Focus)=>void;label:string;orbitWorld?:boolean;
}){
 const root=useRef<HTMLDivElement>(null),body=useRef<HTMLDivElement>(null);
 const state=useRef({turn:(view??HERO).turn,tilt:(view??HERO).tilt,drag:null as null|{x:number;turn:number;moved:boolean},spin:0,touched:false});
 const props=useRef({view,idle,still,onPick,orbitWorld});
 useEffect(()=>{props.current={view,idle,still,onPick,orbitWorld};});
 useEffect(()=>{
  const el=body.current,host=root.current;if(!el||!host)return;
  const shades=[...el.querySelectorAll<HTMLElement>('[data-face]')];
  let frame=0,last=0;
  const paint=()=>{
   const s=state.current;
   el.style.transform=`rotateX(${s.tilt.toFixed(3)}deg) rotateY(${(-s.turn).toFixed(3)}deg)`;
   // Light comes from the oculus, slightly left: the face turned toward you is lit, the others fall into shadow.
   shades.forEach((f,i)=>{
    const a=((i*120-s.turn+22)%360+540)%360-180,c=Math.cos(a*Math.PI/180);
    f.style.setProperty('--shade',Math.max(0,Math.min(.82,.5-.62*c)).toFixed(3));
    f.style.setProperty('--sheen',(50+a*.9).toFixed(1)+'%');
    // Engraving reads only while a face is turned toward you; at a glancing angle it falls away.
    const toward=((i*120-s.turn)%360+540)%360-180,facing=Math.cos(toward*Math.PI/180)*Math.cos(s.tilt*Math.PI/180);
    f.style.setProperty('--ink',Math.max(0,Math.min(1,(facing-.28)/.3)).toFixed(3));
   });
   if(props.current.orbitWorld)worldSignal.orbit=Math.sin(s.turn*Math.PI/180)*.28;
  };
  const tick=(now:number)=>{
   frame=0;const s=state.current,p=props.current;
   const dt=Math.min(.1,last?(now-last)/1000:.016);last=now;
   let target=p.view??{turn:s.turn,tilt:HERO.tilt};
   if(!p.view&&!s.drag){
    if(p.idle&&!p.still&&!s.touched){s.spin+=dt*7;target={turn:HERO.turn+s.spin,tilt:HERO.tilt};}
    else target={turn:s.turn,tilt:HERO.tilt};
   }
   if(s.drag)target={turn:s.turn,tilt:target.tilt};
   // Always travel the short way round.
   const goal=target.turn+360*Math.round((s.turn-target.turn)/360);
   const k=p.still?1:1-Math.exp(-dt*(s.drag?30:3.2));
   s.turn+=(goal-s.turn)*k;s.tilt+=(target.tilt-s.tilt)*k;
   paint();
   const moving=Math.abs(goal-s.turn)>.02||Math.abs(target.tilt-s.tilt)>.02||(p.idle&&!p.still&&!s.touched&&!p.view);
   if(moving)frame=requestAnimationFrame(tick);else last=0;
  };
  const kick=()=>{if(!frame)frame=requestAnimationFrame(tick);};
  paint();kick();
  // Drag to turn; let go and it settles on the nearest face or edge.
  const down=(e:PointerEvent)=>{if(e.button!==0||!props.current.onPick)return;state.current.drag={x:e.clientX,turn:state.current.turn,moved:false};};
  const move=(e:PointerEvent)=>{
   const d=state.current.drag;if(!d)return;const dx=e.clientX-d.x;
   if(!d.moved&&Math.abs(dx)>6){d.moved=true;state.current.touched=true;host.setPointerCapture?.(e.pointerId);host.classList.add('is-dragging');}
   if(d.moved){state.current.turn=d.turn-dx*.42;e.preventDefault();kick();}
  };
  const up=()=>{
   const d=state.current.drag;state.current.drag=null;host.classList.remove('is-dragging');
   if(d?.moved){host.dataset.dragged='1';setTimeout(()=>{delete host.dataset.dragged;},0);props.current.onPick?.(focusAt(state.current.turn));}
   kick();
  };
  host.addEventListener('pointerdown',down);host.addEventListener('pointermove',move);host.addEventListener('pointerup',up);host.addEventListener('pointercancel',up);
  const poke=()=>kick();host.addEventListener('prism:kick',poke);
  return()=>{cancelAnimationFrame(frame);host.removeEventListener('pointerdown',down);host.removeEventListener('pointermove',move);host.removeEventListener('pointerup',up);host.removeEventListener('pointercancel',up);host.removeEventListener('prism:kick',poke);if(props.current.orbitWorld)worldSignal.orbit=0;};
 },[]);
 // Any change of view or motion setting restarts the animation loop.
 useEffect(()=>{if(view)state.current.touched=true;root.current?.dispatchEvent(new Event('prism:kick'));},[view,idle,still]);
 const pick=(f:Focus)=>{if(root.current?.dataset.dragged)return;state.current.touched=true;onPick?.(f);};
 const interactive=Boolean(onPick);
 return <div ref={root} className={`prism prism-${variant} ${building?'is-building':''} ${interactive?'is-interactive':''}`} role="img" aria-label={label}>
  <div className="prism-view">
   <div ref={body} className="prism-body">
    {[0,1,2].map(i=>{
     const f=faces[i]||{},Icon=ICONS[i],isLit=lit?.corners.has(i);
     const inner=<>
      <span className="prism-face-mode"><Icon size={variant==='emblem'?11:13} aria-hidden="true"/>{variant!=='emblem'&&<b>{'abc'[i]}</b>}{MODES[i]}{f.seed&&variant!=='emblem'?<em> · yours</em>:null}</span>
      {f.title?<span className={`prism-face-title ${titleSize(f.title)}`}>{f.title}</span>:<span className="prism-face-blank" aria-hidden="true">{variant==='emblem'?MODES[i]:building?'':'·'}</span>}
      {f.creator&&<span className="prism-face-creator">{f.creator}</span>}
      <span className="prism-face-shade" aria-hidden="true"/>
     </>;
     return interactive
      ?<button key={i} type="button" tabIndex={-1} data-face={i} className={`prism-face ${isLit?'is-lit':''} ${f.title?'':'is-blank'}`} style={{'--i':i} as CSSProperties} onClick={()=>pick({kind:'vertex',index:i})}>{inner}</button>
      :<div key={i} data-face={i} className={`prism-face ${isLit?'is-lit':''} ${f.title?'':'is-blank'}`} style={{'--i':i} as CSSProperties}>{inner}</div>;
    })}
    {[0,1,2].map(i=>interactive
     ?<button key={'e'+i} type="button" tabIndex={-1} aria-hidden="true" className={`prism-edge ${lit?.sides.has(i)?'is-lit':''}`} style={{'--i':i} as CSSProperties} onClick={()=>pick({kind:'edge',index:i})}><i/></button>
     :<span key={'e'+i} aria-hidden="true" className={`prism-edge ${lit?.sides.has(i)?'is-lit':''}`} style={{'--i':i} as CSSProperties}><i/></span>)}
    {interactive
     ?<button type="button" tabIndex={-1} aria-hidden="true" className={`prism-crown ${lit&&lit.corners.size===3?'is-lit':''}`} onClick={()=>pick({kind:'center'})}>{mark&&<span className="prism-crown-mark">{mark}</span>}{crown&&<span className="prism-crown-text">{crown}</span>}</button>
     :<div className="prism-crown" aria-hidden="true">{mark&&<span className="prism-crown-mark">{mark}</span>}{crown&&<span className="prism-crown-text">{crown}</span>}</div>}
    <div className="prism-base" aria-hidden="true"/>
   </div>
  </div>
  <div className="prism-shadow" aria-hidden="true"/>
 </div>;
}
