'use client';
import {useEffect,useRef,type MouseEvent as ReactMouseEvent,type ReactNode} from 'react';
import {worldSignal} from './world';
import type {Focus} from '@/lib/triangle-focus';

// The threeangle, drawn. A construction drawing in the manner of Galileo's and Michelangelo's notebooks:
// a three-sided pyramid standing on a lazy susan, inked, hatched and annotated, never quite still.
//   faces  = the three works (a Read, b Watch, c Listen)
//   edges  = the thread between two works, where their faces meet
//   apex   = the common thread, the one point all three faces reach
// Seen from directly above it resolves into the threeangle mark. The apex drifts, so the proportions of the
// three faces are always slightly changing: a triangle is not a fixed thing.
// Every 60° turn of the table is one step of "Walk the triangle"; looking down from above opens the apex.

export const MODES=['Read','Watch','Listen'] as const;
export type FigureFace={title?:string;creator?:string;seed?:boolean;unknown?:boolean};
export type FigureView={turn:number;el:number};
export const REST:FigureView={turn:0,el:22};
export const ABOVE:FigureView={turn:0,el:84};
export function viewFor(f:Focus|null):FigureView|null{
 if(!f)return null;
 if(f.kind==='center')return ABOVE;
 return {turn:f.kind==='vertex'?f.index*120:f.index*120+60,el:20};
}
export function focusAt(turn:number):Focus{
 const s=((Math.round(turn/60)%6)+6)%6;
 return s%2===0?{kind:'vertex',index:s/2}:{kind:'edge',index:(s-1)/2};
}

type V3=[number,number,number];type P2={x:number;y:number;z:number};
const rad=(d:number)=>d*Math.PI/180;
const lerp=(a:V3,b:V3,t:number):V3=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];
const f2=(n:number)=>n.toFixed(3);
// Corner j sits at j·120° − 60°, so face i (corners i, i+1) faces 0°, 120°, 240°, and the edge between faces i and i+1 is corner i+1.
const corner=(j:number,r=1):V3=>[r*Math.sin(rad(j*120-60)),0,r*Math.cos(rad(j*120-60))];
const seedRand=(i:number)=>{const x=Math.sin(i*127.1+311.7)*43758.5453;return x-Math.floor(x);};

type Variant='mark'|'emblem'|'hero'|'stage';
// Drawing box per use: half-width, and the top and bottom of the frame (the figure sits on its table, so the box is not square).
const SIZES:Record<Variant,{w:number;top:number;bottom:number;table:boolean;hatch:boolean;labels:boolean;construct:boolean}>={
 mark:{w:1.25,top:-1.25,bottom:1.25,table:false,hatch:false,labels:false,construct:false},
 emblem:{w:1.75,top:-1.4,bottom:1.25,table:true,hatch:true,labels:true,construct:true},
 hero:{w:1.75,top:-1.4,bottom:1.25,table:true,hatch:true,labels:true,construct:true},
 stage:{w:2.05,top:-1.45,bottom:1.28,table:true,hatch:true,labels:true,construct:true},
};

export function Figure({faces=[],labels=['a','b','c'],view,idle=false,still,variant='stage',lit,building=false,onPick,label,orbitWorld=false,callout}:{
 labels?:string[];
 faces?:FigureFace[];view:FigureView|null;idle?:boolean;still:boolean;variant?:Variant;lit?:{corners:Set<number>;sides:Set<number>};
 building?:boolean;onPick?:(f:Focus)=>void;label:string;orbitWorld?:boolean;callout?:{face:number;content:ReactNode}|null;
}){
 const root=useRef<HTMLDivElement>(null),svg=useRef<SVGSVGElement>(null),note=useRef<HTMLDivElement>(null);
 const init=view??(variant==='mark'?{turn:0,el:90}:REST);
 const state=useRef({turn:init.turn,el:init.el,vt:0,ve:0,drag:null as null|{x:number;turn:number;moved:boolean},touched:false,stop:0,dwell:0,t:0,born:0});
 const props=useRef({view,idle,still,onPick,orbitWorld,lit,building,callout,variant});
 useEffect(()=>{props.current={view,idle,still,onPick,orbitWorld,lit,building,callout,variant};});
 useEffect(()=>{
  const el=svg.current,host=root.current;if(!el||!host)return;
  const q=(k:string)=>el.querySelector<SVGElement>(`[data-k="${k}"]`);
  const cfg=SIZES[props.current.variant];
  let frame=0,last=0;
  const paint=()=>{
   const s=state.current,p=props.current,time=s.t;
   const calm=p.still;
   // The apex is never quite fixed: it wanders a little, and a lot while the library is still searching.
   const wander=p.building?.34:p.variant==='mark'?.1:.085;
   const ax=calm?0:Math.sin(time*.31)*wander+Math.sin(time*.83+2)*wander*.35,az=calm?0:Math.sin(time*.23+1)*wander*.8;
   const H=(p.variant==='mark'?1:1.28)+(calm?0:Math.sin(time*.19)*.05);
   const apex:V3=[ax,H,az];
   const C=[0,1,2].map(j=>corner(j));
   const turn=rad(s.turn),el0=rad(s.el),D=6.5,lift=p.variant==='mark'?0:H*.42;
   const proj=(v:V3,drop=0):P2=>{
    const x1=v[0]*Math.cos(turn)-v[2]*Math.sin(turn),z1=v[0]*Math.sin(turn)+v[2]*Math.cos(turn),y1=v[1]-lift-drop;
    const y2=y1*Math.cos(el0)-z1*Math.sin(el0),z2=y1*Math.sin(el0)+z1*Math.cos(el0);
    const k=D/(D-z2);return {x:x1*k,y:-y2*k,z:z2};
   };
   const seg=(a:P2,b:P2)=>`M${f2(a.x)} ${f2(a.y)}L${f2(b.x)} ${f2(b.y)}`;
   const P=proj(apex),B=C.map(c=>proj(c));
   // Which faces look toward us (winding of the projected triangle).
   const area=(a:P2,b:P2,c:P2)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
   const vis=[0,1,2].map(i=>area(B[i],B[(i+1)%3],P)<0);
   // Light from the upper left, fixed to the viewer.
   const L:V3=[-.55,.75,.45];const Ln=Math.hypot(...L);
   const bright=[0,1,2].map(i=>{
    const a=C[i],b=C[(i+1)%3];const u:V3=[b[0]-a[0],b[1]-a[1],b[2]-a[2]],v:V3=[apex[0]-a[0],apex[1]-a[1],apex[2]-a[2]];
    let n:V3=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
    const x1=n[0]*Math.cos(turn)-n[2]*Math.sin(turn),z1=n[0]*Math.sin(turn)+n[2]*Math.cos(turn);n=[x1,n[1]*Math.cos(el0)-z1*Math.sin(el0),n[1]*Math.sin(el0)+z1*Math.cos(el0)];
    const len=Math.hypot(...n)||1;const d=(n[0]*L[0]+n[1]*L[1]+n[2]*L[2])/(len*Ln);return Math.abs(d);
   });
   const litC=p.lit?.corners,litS=p.lit?.sides;
   // Edges: lateral edges (threads) and the base; hidden ones are dashed, as in any technical drawing.
   let hidden='',base='';
   for(let i=0;i<3;i++){
    const d=seg(B[i],B[(i+1)%3]);if(vis[i])base+=d;else hidden+=d;
    const edge=q('edge'+((i+2)%3));
    const lat=seg(B[i],P),shown=vis[i]||vis[(i+2)%3];
    if(edge){edge.setAttribute('d',lat);edge.classList.toggle('is-hidden',!shown);edge.classList.toggle('is-lit',Boolean(litS?.has((i+2)%3)));}
    q('hit'+((i+2)%3))?.setAttribute('d',shown?lat:'');
   }
   q('base')?.setAttribute('d',base);q('hidden')?.setAttribute('d',hidden);
   // Invisible hit areas over the faces that look toward us.
   for(let i=0;i<3;i++){const fh=q('facehit'+i);if(fh){const a2=B[i],b2=B[(i+1)%3];fh.setAttribute('d',vis[i]?`M${f2(a2.x)} ${f2(a2.y)}L${f2(b2.x)} ${f2(b2.y)}L${f2(P.x)} ${f2(P.y)}Z`:'');}}
   // Hatching: parallel to the base, closer as a face turns from the light; cross-hatched in shadow.
   if(cfg.hatch)for(let i=0;i<3;i++){
    const h=q('hatch'+i);if(!h)continue;
    const face=faces[i];
    if(!vis[i]||face?.unknown){h.setAttribute('d','');h.classList.toggle('is-lit',false);continue;}
    const a=C[i],b=C[(i+1)%3],n=Math.round(5+(1-bright[i])*15);let d='';
    for(let k=1;k<n;k++){
     const t=k/n*.94,j=(seedRand(i*40+k)-.5)*.018;
     const u=lerp(a,apex,t),w=lerp(b,apex,t);d+=seg(proj(lerp(u,w,.04+j)),proj(lerp(u,w,.96-j)));
    }
    if(bright[i]<.42){const m=Math.round(4+(0.42-bright[i])*22);for(let k=1;k<m;k++){const t=k/m;d+=seg(proj(lerp(a,b,t*.9)),proj(lerp(apex,b,t*.9)));}}
    h.setAttribute('d',d);h.classList.toggle('is-lit',Boolean(litC?.has(i)));
   }
   // The lazy susan: a turning table with its degree scale and three detents, and a fixed index at the front.
   if(cfg.table){
    const r1=1.34,r2=1.2,y=-.06;let front='',back='',ticks='';
    for(let k=0;k<72;k++){
     const a0=rad(k*5-60),a1=rad((k+1)*5-60);
     for(const [r,acc] of [[r1,0],[r2,1]] as const){
      const A=proj([r*Math.sin(a0),y,r*Math.cos(a0)]),Bp=proj([r*Math.sin(a1),y,r*Math.cos(a1)]);
      const dd=seg(A,Bp);if((A.z+Bp.z)/2>-.05)front+=dd;else if(acc===0||k%2===0)back+=dd;
     }
     const long=k%6===0,r3=long?r1:r2+.06;const t0=proj([r2*Math.sin(a0),y,r2*Math.cos(a0)]),t1=proj([r3*Math.sin(a0),y,r3*Math.cos(a0)]);
     if(t0.z>-.25)ticks+=seg(t0,t1);
    }
    q('table')?.setAttribute('d',front);q('tableback')?.setAttribute('d',back);q('ticks')?.setAttribute('d',ticks);
    // Three detents on the table's rim, one under each face.
    let det='';[0,1,2].forEach(i=>{const a=rad(i*120);const pt=proj([1.41*Math.sin(a),y,1.41*Math.cos(a)]);const w=.035;det+=`M${f2(pt.x)} ${f2(pt.y-w)}L${f2(pt.x+w)} ${f2(pt.y)}L${f2(pt.x)} ${f2(pt.y+w)}L${f2(pt.x-w)} ${f2(pt.y)}Z`;});
    q('detents')?.setAttribute('d',det);
    // Fixed index: a small pointer at the front of the table, outside the turning scale.
    const ix=proj([0,y,1.52],0),ixw=.05;
    const idx=`M${f2(ix.x)} ${f2(ix.y-.02)}L${f2(ix.x-ixw)} ${f2(ix.y+.07)}L${f2(ix.x+ixw)} ${f2(ix.y+.07)}Z`;
    q('index')?.setAttribute('d',idx);
   }
   // Construction: circumscribing circle, plumb line from the apex, compass arc, apex point.
   if(cfg.construct){
    let circ='';for(let k=0;k<48;k++){const a0=rad(k*7.5),a1=rad((k+1)*7.5);if(k%2)continue;circ+=seg(proj([Math.sin(a0),0,Math.cos(a0)]),proj([Math.sin(a1),0,Math.cos(a1)]));}
    q('circum')?.setAttribute('d',circ);
    const foot=proj([apex[0],0,apex[2]]);q('plumb')?.setAttribute('d',seg(P,foot)+`M${f2(foot.x-.035)} ${f2(foot.y)}L${f2(foot.x+.035)} ${f2(foot.y)}`);
    // Compass: an arc swung from the apex; while searching it sweeps round and round.
    const sweep=p.building?(time*70)%360:30,span=p.building?110:44,cr=.34;let arc='';
    for(let k=0;k<=12;k++){const a=rad(sweep+span*k/12);const x=P.x+cr*Math.cos(a),y2=P.y+cr*Math.sin(a)*.62;arc+=(k?'L':'M')+f2(x)+' '+f2(y2);}
    q('compass')?.setAttribute('d',arc);
    // Dimension line for the height, off to the side.
    const side=1.62,dimT=proj([side*Math.cos(turn),H,side*Math.sin(turn)]),dimB=proj([side*Math.cos(turn),0,side*Math.sin(turn)]);
    q('dim')?.setAttribute('d',seg(dimT,dimB)+seg({x:dimT.x-.04,y:dimT.y,z:0},{x:dimT.x+.04,y:dimT.y,z:0})+seg({x:dimB.x-.04,y:dimB.y,z:0},{x:dimB.x+.04,y:dimB.y,z:0}));
    const dl=q('dimlabel');if(dl){dl.setAttribute('x',f2(dimT.x+.07));dl.setAttribute('y',f2((dimT.y+dimB.y)/2));}
   }
   const apexDot=q('apex');if(apexDot){apexDot.setAttribute('cx',f2(P.x));apexDot.setAttribute('cy',f2(P.y));apexDot.classList.toggle('is-lit',Boolean(litC&&litC.size===3));}
   const apexRing=q('apexring');if(apexRing){apexRing.setAttribute('cx',f2(P.x));apexRing.setAttribute('cy',f2(P.y));}
   // Face letters sit just outside each face; hidden faces keep a ghost of their letter.
   const cen=[0,1,2].map(i=>proj(lerp(lerp(C[i],C[(i+1)%3],.5),apex,.3)));
   if(cfg.labels)[0,1,2].forEach(i=>{
    const t=q('label'+i);if(!t)return;const out=proj(lerp(lerp(C[i],C[(i+1)%3],.5),[0,0,0],-.42));
    t.setAttribute('x',f2(out.x));t.setAttribute('y',f2(out.y+.02));t.style.opacity=vis[i]?'1':'.28';t.classList.toggle('is-lit',Boolean(litC?.has(i)));
   });
   // The callout: a leader from the face to a note in the margin, like an annotation in a notebook.
   const co=p.callout,n=note.current;
   if(n&&co){
    const c=co.face<0?P:cen[co.face],vw=cfg.w,sideRight=co.face<0?true:c.x>=0;
    const lx=sideRight?vw*.8:-vw*.8,ly=Math.max(cfg.top*.8,Math.min(cfg.bottom*.5,c.y-.12));
    q('leader')?.setAttribute('d',`M${f2(c.x)} ${f2(c.y)}L${f2(lx*.82)} ${f2(ly)}L${f2(lx)} ${f2(ly)}`);
    n.style.left=((lx+vw)/(2*vw)*100)+'%';n.style.top=((ly-cfg.top)/(cfg.bottom-cfg.top)*100)+'%';n.dataset.side=sideRight?'right':'left';
   }else q('leader')?.setAttribute('d','');
   if(p.orbitWorld)worldSignal.orbit=Math.sin(s.turn*Math.PI/180)*.26;
  };
  const tick=(now:number)=>{
   frame=0;const s=state.current,p=props.current;
   const dt=Math.min(.1,last?(now-last)/1000:.016);last=now;s.t+=p.still?0:dt;
   let goal=p.view??{turn:s.turn,el:REST.el};
   if(p.variant==='mark')goal={turn:0,el:90};
   else if(!p.view&&!s.drag){
    // Lazy susan: rest on a face, then turn a third, and rest again.
    if(p.idle&&!p.still&&!s.touched){s.dwell+=dt;if(s.dwell>(p.building?1.6:3.4)){s.dwell=0;s.stop+=1;}goal={turn:s.stop*120,el:REST.el};}
    else goal={turn:Math.round(s.turn/60)*60,el:REST.el};
   }
   if(s.drag)goal={turn:s.turn,el:goal.el};
   const target=goal.turn+360*Math.round((s.turn-goal.turn)/360);
   if(p.still){s.turn=target;s.el=goal.el;s.vt=0;s.ve=0;}
   else if(!s.drag){
    // A weighted table with a detent: a spring that settles with the smallest overshoot.
    const steps=Math.ceil(dt/(1/120)),h=dt/steps,k=34,c=2*.74*Math.sqrt(k);
    for(let i=0;i<steps;i++){s.vt+=((target-s.turn)*k-c*s.vt)*h;s.turn+=s.vt*h;s.ve+=((goal.el-s.el)*k-c*s.ve)*h;s.el+=s.ve*h;}
   }
   paint();
   const moving=!p.still||Math.abs(target-s.turn)>.01||Math.abs(goal.el-s.el)>.01;
   if(moving&&!document.hidden)frame=requestAnimationFrame(tick);else last=0;
  };
  const kick=()=>{if(!frame)frame=requestAnimationFrame(tick);};
  paint();kick();
  const down=(e:PointerEvent)=>{if(e.button!==0||!props.current.onPick)return;state.current.drag={x:e.clientX,turn:state.current.turn,moved:false};};
  const move=(e:PointerEvent)=>{
   const d=state.current.drag;if(!d)return;const dx=e.clientX-d.x;
   if(!d.moved&&Math.abs(dx)>6){d.moved=true;state.current.touched=true;host.setPointerCapture?.(e.pointerId);host.classList.add('is-dragging');}
   if(d.moved){state.current.turn=d.turn-dx*.45;state.current.vt=0;e.preventDefault();kick();}
  };
  const up=()=>{
   const d=state.current.drag;state.current.drag=null;host.classList.remove('is-dragging');
   if(d?.moved){host.dataset.dragged='1';setTimeout(()=>{delete host.dataset.dragged;},0);props.current.onPick?.(focusAt(state.current.turn));}
   kick();
  };
  host.addEventListener('pointerdown',down);host.addEventListener('pointermove',move);host.addEventListener('pointerup',up);host.addEventListener('pointercancel',up);
  const poke=()=>kick();host.addEventListener('figure:kick',poke);document.addEventListener('visibilitychange',poke);
  return()=>{cancelAnimationFrame(frame);host.removeEventListener('pointerdown',down);host.removeEventListener('pointermove',move);host.removeEventListener('pointerup',up);host.removeEventListener('pointercancel',up);host.removeEventListener('figure:kick',poke);document.removeEventListener('visibilitychange',poke);if(props.current.orbitWorld)worldSignal.orbit=0;};
 // The figure keeps its own animation loop; the latest props are read through a ref.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[]);
 useEffect(()=>{if(view)state.current.touched=true;root.current?.dispatchEvent(new Event('figure:kick'));},[view,idle,still,lit,building,callout]);
 const cfg=SIZES[variant];
 // One delegated handler: faces, edges and the apex carry data-pick.
 const onClick=(e:ReactMouseEvent)=>{
  const t=(e.target as Element).closest?.('[data-pick]')?.getAttribute('data-pick');if(!t||!onPick||e.currentTarget.getAttribute('data-dragged'))return;
  state.current.touched=true;
  onPick(t==='c'?{kind:'center'}:{kind:t[0]==='v'?'vertex':'edge',index:Number(t[1])});
 };
 const interactive=Boolean(onPick);
 return <div ref={root} style={{aspectRatio:`${cfg.w*2} / ${cfg.bottom-cfg.top}`}} className={`fig fig-${variant} ${building?'is-building':''} ${interactive?'is-interactive':''} ${still?'is-still':''}`} role="img" aria-label={label} onClick={interactive?onClick:undefined}>
  <svg ref={svg} viewBox={`${-cfg.w} ${cfg.top} ${cfg.w*2} ${cfg.bottom-cfg.top}`} aria-hidden="true">
   {cfg.construct&&<g className="fig-construct">
    <path data-k="circum" pathLength={1}/><path data-k="plumb"/><path data-k="compass"/><path data-k="dim"/>
    <text data-k="dimlabel" className="fig-note" fontSize=".13">h</text>
   </g>}
   {cfg.table&&<g className="fig-table"><path data-k="tableback" className="fig-back"/><path data-k="table" className="fig-draw" pathLength={1}/><path data-k="ticks" className="fig-ticks"/><path data-k="index" className="fig-index"/>
<path data-k="detents" className="fig-detents"/></g>}
   {cfg.hatch&&<g className="fig-hatch">{[0,1,2].map(i=><path key={i} data-k={'hatch'+i} data-pick={'v'+i}/>)}</g>}
   <g className="fig-lines">
    <path data-k="hidden" className="fig-hidden"/>
    <path data-k="base" className="fig-draw" pathLength={1}/>
    {[0,1,2].map(i=><path key={i} data-k={'edge'+i} className="fig-edge fig-draw" pathLength={1}/>)}
    {interactive&&[0,1,2].map(i=><path key={'fh'+i} data-k={'facehit'+i} className="fig-facehit" data-pick={'v'+i}/>)}
    {interactive&&[0,1,2].map(i=><path key={'hit'+i} data-k={'hit'+i} className="fig-hit" data-pick={'e'+i}/>)}
   </g>
   {cfg.labels&&<g className="fig-labels">{[0,1,2].map(i=><text key={i} data-k={'label'+i} textAnchor="middle" fontSize={labels[i]&&labels[i].length>1?'.15':'.2'} data-pick={'v'+i}>{labels[i]}</text>)}</g>}
   <circle data-k="apexring" className="fig-apexring" r={variant==='mark'?.12:.075}/>
   <circle data-k="apex" className="fig-apex" r={variant==='mark'?.07:.032} data-pick="c"/>
   <path data-k="leader" className="fig-leader"/>
  </svg>
  {callout&&<div ref={note} className="fig-callout" key={callout.face}>{callout.content}</div>}
 </div>;
}
