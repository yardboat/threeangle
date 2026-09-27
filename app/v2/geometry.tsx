'use client';
import {useState} from 'react';
import {Figure,MODES} from './figure';
// The mark, alive: the same drawing seen from above, its apex drifting.
export function LiveMark({still}:{still:boolean}){return <Figure variant="mark" view={null} still={still} label=""/>;}
export function HallMark(){return <svg viewBox="0 0 48 46" fill="none" aria-hidden="true"><path d="M24 3L45 40H3Z M24 3V27L3 40 M24 27L45 40" stroke="currentColor" strokeWidth="1.3"/><circle cx="24" cy="27" r="2" fill="currentColor"/></svg>}

// The object waiting at the end of the hall: a small threeangle that teaches the three angles.
export function Invitation({still}:{still:boolean}){
 const [angle,setAngle]=useState<number|null>(null);
 const words=['Read for another perspective.','Watch an idea come alive.','Listen a little closer.'];
 return <div className="hall-invitation">
  <Figure variant="hero" labels={[...MODES]} view={angle===null?null:{turn:angle*120,el:22}} idle still={still} label="A threeangle: read, watch and listen"/>
  <div className="hall-invitation-angles" role="group" aria-label="The three angles">{MODES.map((label,i)=><button key={label} aria-pressed={angle===i} onPointerEnter={e=>{if(e.pointerType==='mouse')setAngle(i);}} onFocus={()=>setAngle(i)} onClick={()=>setAngle(i)}>{label}</button>)}</div>
  <p aria-live="polite">{angle===null?'':words[angle]}</p>
 </div>;
}
