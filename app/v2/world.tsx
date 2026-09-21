'use client';
import {useEffect,useRef} from 'react';
import Image from 'next/image';
import arrival from '@/public/hall/gilded-hall.webp';
import reading from '@/public/hall/reading-room.webp';
import gallery from '@/public/hall/gallery.webp';
import rotunda from '@/public/hall/rotunda.webp';

export type Room='arrival'|'reading'|'study'|'gallery'|'rotunda';
export const roomNames:Record<Room,string>={arrival:'The Gilded Hall',reading:'The Reading Room',study:'The Reading Alcove',gallery:'The Sunlit Gallery',rotunda:'The Rotunda'};
const rooms=[{id:'arrival',image:arrival},{id:'reading',image:reading},{id:'gallery',image:gallery},{id:'rotunda',image:rotunda}] as const;

export function HallWorld({room,still,looking}:{room:Room;still:boolean;looking:boolean}){
 const root=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  const el=root.current;if(!el)return;
  el.style.setProperty('--room-x','0px');el.style.setProperty('--room-y','0px');el.style.setProperty('--room-scroll','0px');
  if(still)return;
  let frame=0,x=0,y=0,tx=0,ty=0;
  const paint=()=>{
   x+=(tx-x)*.075;y+=(ty-y)*.075;
   el.style.setProperty('--room-x',`${x.toFixed(2)}px`);el.style.setProperty('--room-y',`${y.toFixed(2)}px`);
   if(Math.abs(tx-x)+Math.abs(ty-y)>.08)frame=requestAnimationFrame(paint);else frame=0;
  };
  const move=(e:globalThis.PointerEvent)=>{
   if(e.pointerType!=='mouse')return;
   tx=(e.clientX/window.innerWidth-.5)*(looking?72:34);
   ty=(e.clientY/window.innerHeight-.5)*(looking?42:20);
   if(!frame)frame=requestAnimationFrame(paint);
  };
  const reset=()=>{tx=0;ty=0;if(!frame)frame=requestAnimationFrame(paint);};
  const scroll=()=>el.style.setProperty('--room-scroll',`${Math.min(window.scrollY*.09,40)}px`);
  window.addEventListener('pointermove',move,{passive:true});window.addEventListener('blur',reset);document.documentElement.addEventListener('pointerleave',reset);window.addEventListener('scroll',scroll,{passive:true});
  return()=>{cancelAnimationFrame(frame);window.removeEventListener('pointermove',move);window.removeEventListener('blur',reset);document.documentElement.removeEventListener('pointerleave',reset);window.removeEventListener('scroll',scroll);};
 },[still,looking]);
 const active=room==='study'?'reading':room;
 return <div ref={root} className="hall-environment" data-room={room} aria-hidden="true">
  {rooms.map(r=><div key={r.id} className="hall-room" data-active={r.id===active} data-scene={r.id}><div className="hall-room-camera"><Image src={r.image} alt="" fill priority={r.id==='arrival'} loading={r.id==='arrival'?undefined:'eager'} sizes="100vw" placeholder="blur" quality={85}/></div></div>)}
  <div className="hall-window-light"/><div className="hall-legibility-light"/>
 </div>;
}
