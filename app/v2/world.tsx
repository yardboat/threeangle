'use client';
import {useEffect,useRef,useState} from 'react';
import Image,{type StaticImageData} from 'next/image';
import arrival from '@/public/hall/gilded-hall.webp';
import reading from '@/public/hall/reading-room.webp';
import gallery from '@/public/hall/gallery.webp';
import rotunda from '@/public/hall/rotunda.webp';
import arrivalDepth from '@/public/hall/depth/gilded-hall.webp';
import readingDepth from '@/public/hall/depth/reading-room.webp';
import galleryDepth from '@/public/hall/depth/gallery.webp';
import rotundaDepth from '@/public/hall/depth/rotunda.webp';

// The library is a character, not wallpaper.
// Each room is a painting plus a depth map (MiDaS, see docs/gilded-hall-v2.md). A single fragment shader
// re-projects the painting through that depth, so the camera can move *inside* the room: the pointer
// (or device tilt) looks around, scrolling tilts the view down to the floor, changing screen walks you
// forward into the next room, and the light of each room changes with the time of day of the journey.
// Without WebGL, or with reduced motion, the same rooms are shown as graded still images.

export type Room='arrival'|'reading'|'study'|'gallery'|'rotunda';
export const roomNames:Record<Room,string>={arrival:'The Gilded Hall',reading:'The Reading Room',study:'The Reading Alcove',gallery:'The Sunlit Gallery',rotunda:'The Rotunda'};
type Scene='arrival'|'reading'|'gallery'|'rotunda';
const scenes:Record<Scene,{image:StaticImageData;depth:StaticImageData;pos:[number,number]}>={
 arrival:{image:arrival,depth:arrivalDepth,pos:[.5,.46]},
 reading:{image:reading,depth:readingDepth,pos:[.5,.5]},
 gallery:{image:gallery,depth:galleryDepth,pos:[.5,.5]},
 rotunda:{image:rotunda,depth:rotundaDepth,pos:[.5,.62]},
};
// The time of day moves with the journey: morning at the door, dusk in the rotunda.
type Mood={exposure:number;contrast:number;warm:number;cool:number;vignette:number;beam:number;sweep:number;lift:number;light:number;dolly:number};
const moods:Record<Room,Mood>={
 arrival:{exposure:1.04,contrast:1.1,warm:.04,cool:0,vignette:.22,beam:0,sweep:0,lift:.34,light:.05,dolly:0},
 reading:{exposure:1,contrast:1.1,warm:.12,cool:0,vignette:.3,beam:0,sweep:0,lift:.3,light:.06,dolly:0},
 study:{exposure:.98,contrast:1.12,warm:.2,cool:0,vignette:.36,beam:0,sweep:0,lift:.3,light:.06,dolly:.1},
 gallery:{exposure:.4,contrast:1.22,warm:.55,cool:.08,vignette:.8,beam:0,sweep:1,lift:0,light:.22,dolly:.04},
 rotunda:{exposure:.36,contrast:1.24,warm:.1,cool:.34,vignette:.78,beam:1,sweep:0,lift:0,light:.2,dolly:0},
};
const sceneOf=(r:Room):Scene=>r==='study'?'reading':r;

// A tiny shared channel so the reveal can move the room (the camera orbits a little as the prism turns,
// and the oculus light gathers when the common thread is open) without re-rendering React.
export const worldSignal={orbit:0,beam:0};

const VERT=`attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}`;
const FRAG=`precision highp float;
uniform vec2 uRes;uniform sampler2D uColA,uDepA,uColB,uDepB;uniform vec2 uSizeA,uSizeB,uPosA,uPosB;
uniform float uMix,uAmp,uTilt,uTime,uDolly;uniform vec2 uCam,uLight;
uniform float uExposure,uContrast,uWarm,uCool,uVignette,uBeam,uSweep,uLift,uLightAmt,uGrain;
float hash(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
vec2 cover(vec2 f,vec2 size,vec2 pos){float s=max(uRes.x/size.x,uRes.y/size.y)*1.1;vec2 d=size*s;return(f-(uRes-d)*pos)/d;}
vec3 room(sampler2D col,sampler2D dep,vec2 size,vec2 pos,vec2 f,float dolly,out float depth,out vec2 uv){
 vec2 base=cover(f,size,pos),vp=cover(uRes*.5,size,pos),p=base;float d=.3;
 for(int i=0;i<6;i++){
  d=texture2D(dep,clamp(p,0.,1.)).r;
  p=vp+(base-vp)/(1.+dolly*(.2+.8*d))-uCam*uAmp*(d-.32)+vec2(0.,uTilt*(.03+.09*d));
 }
 depth=d;uv=p;return texture2D(col,clamp(p,.002,.998)).rgb;
}
void main(){
 vec2 f=vec2(gl_FragCoord.x,uRes.y-gl_FragCoord.y),sv=f/uRes;
 float dA,dB;vec2 pA,pB;
 vec3 a=room(uColA,uDepA,uSizeA,uPosA,f,uDolly+uMix*.42,dA,pA);
 vec3 b=room(uColB,uDepB,uSizeB,uPosB,f,uDolly-(1.-uMix)*.16,dB,pB);
 // Walking forward: the nearest architecture passes you first.
 float k=smoothstep(0.,1.,clamp((uMix-(1.-dA)*.38)/.62,0.,1.));
 vec3 c=mix(a,b,k);vec2 p=mix(pA,pB,k);float d=mix(dA,dB,k);
 c*=uExposure*(1.+.22*sin(3.14159*uMix));
 // The oculus: a shaft of late light onto the floor medallion (in painting space, so it stays put as you move).
 float bx=abs(p.x-.5),w=mix(.035,.2,clamp(p.y*1.25,0.,1.));
 float cone=smoothstep(w,w*.25,bx)*smoothstep(.95,.05,p.y);
 float pool=exp(-pow((p.x-.5)*3.2,2.)-pow((p.y-.74)*11.,2.));
 c+=vec3(1.,.88,.68)*uBeam*(cone*.12+pool*.3)*(.55+.45*d)*(1.-uTilt*.85);
 // Golden-hour light crossing the gallery, slowly.
 float band=exp(-pow((p.x+p.y*.45-fract(uTime*.018)*2.2+.5)*4.,2.));
 c+=c*uSweep*band*.8;
 // The visitor carries a little light.
 vec2 q=(sv-uLight)*vec2(uRes.x/uRes.y,1.);c+=c*uLightAmt*exp(-dot(q,q)*5.)*(.4+.6*d);
 c*=mix(vec3(1.),vec3(1.1,1.,.82),uWarm);
 float l=dot(c,vec3(.299,.587,.114));c=mix(c,l*vec3(.7,.8,1.02)+c*.25,uCool);
 c=(c-.5)*uContrast+.5;
 c=mix(c,vec3(.965,.95,.925),uLift*smoothstep(.62,.0,length((sv-vec2(.5,.56))*vec2(.95,1.45))));
 c*=1.-uVignette*smoothstep(.3,1.05,length((sv-.5)*vec2(1.25,1.)));
 c*=1.-uTilt*.35;
 c+=(hash(gl_FragCoord.xy+fract(uTime)*97.)-.5)*uGrain;
 gl_FragColor=vec4(clamp(c,0.,1.),1.);
}`;

type Tex={col:WebGLTexture;dep:WebGLTexture;size:[number,number];pos:[number,number]};
function load(src:string){return new Promise<HTMLImageElement>((ok,fail)=>{const i=new window.Image();i.decoding='async';i.onload=()=>ok(i);i.onerror=fail;i.src=src;});}

export function HallWorld({room,still,looking}:{room:Room;still:boolean;looking:boolean}){
 const canvas=useRef<HTMLCanvasElement>(null);
 const [live,setLive]=useState(false);
 const target=useRef(room),flags=useRef({still,looking});
 // The render loop reads the latest room and motion settings without restarting.
 useEffect(()=>{target.current=room;flags.current={still,looking};},[room,still,looking]);
 useEffect(()=>{
  const el=canvas.current;if(!el)return;
  const gl=el.getContext('webgl',{antialias:false,alpha:false,premultipliedAlpha:false,powerPreference:'low-power'});
  if(!gl)return;
  const shader=(type:number,src:string)=>{const s=gl.createShader(type)!;gl.shaderSource(s,src);gl.compileShader(s);return s;};
  const prog=gl.createProgram()!;gl.attachShader(prog,shader(gl.VERTEX_SHADER,VERT));gl.attachShader(prog,shader(gl.FRAGMENT_SHADER,FRAG));gl.linkProgram(prog);
  if(!gl.getProgramParameter(prog,gl.LINK_STATUS))return;
  gl.useProgram(prog);
  const buf=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buf);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
  const loc=gl.getAttribLocation(prog,'p');gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);
  const U:Record<string,WebGLUniformLocation|null>={};const u=(n:string)=>U[n]??=gl.getUniformLocation(prog,n);
  const texture=(img:HTMLImageElement)=>{const t=gl.createTexture()!;gl.bindTexture(gl.TEXTURE_2D,t);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB,gl.RGB,gl.UNSIGNED_BYTE,img);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);return t;};
  const tex:Partial<Record<Scene,Tex>>={};
  let dead=false,frame=0,last=0;
  // Camera and light state, eased every frame toward where the visitor is looking.
  const cam={x:0,y:0,tx:0,ty:0},lightPos={x:.5,y:.45,tx:.5,ty:.45};
  let from:Scene=sceneOf(target.current),to:Scene=from,mix=1,tilt=0,orbit=0,beam=0;
  const mood:Mood={...moods[target.current]};let moodFrom:Mood={...mood},moodTo:Mood=moods[target.current],moodT=1;
  let shownRoom=target.current;
  const resize=()=>{const r=Math.min(window.devicePixelRatio||1,1.25);el.width=Math.round(el.clientWidth*r);el.height=Math.round(el.clientHeight*r);gl.viewport(0,0,el.width,el.height);};
  const bind=(unit:number,t:WebGLTexture,name:string)=>{gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,t);gl.uniform1i(u(name),unit);};
  const ease=(t:number)=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
  const draw=(now:number)=>{
   frame=0;if(dead)return;
   const dt=Math.min(.1,last?(now-last)/1000:.016);last=now;
   const {still:calm,looking:look}=flags.current;
   // Room changes: walk forward into the next scene, and move the light of day with it.
   if(target.current!==shownRoom){
    const next=sceneOf(target.current);
    if(next!==to&&tex[next]){from=to;to=next;mix=0;}
    moodFrom={...mood};moodTo=moods[target.current];moodT=0;shownRoom=target.current;
   }
   mix=calm?1:Math.min(1,mix+dt/2.1);moodT=calm?1:Math.min(1,moodT+dt/2.4);
   const e=ease(moodT);(Object.keys(mood) as (keyof Mood)[]).forEach(k=>{mood[k]=moodFrom[k]+(moodTo[k]-moodFrom[k])*e;});
   const idle=calm?0:now/1000;
   const drift={x:Math.sin(idle*.13)*.18,y:Math.sin(idle*.09+1)*.08};
   const k=calm?1:1-Math.pow(.02,dt);
   cam.x+=(cam.tx+drift.x+orbit-cam.x)*k;cam.y+=(cam.ty+drift.y-cam.y)*k;
   lightPos.x+=(lightPos.tx-lightPos.x)*k;lightPos.y+=(lightPos.ty-lightPos.y)*k;
   orbit+=((worldSignal.orbit||0)-orbit)*k;beam+=((worldSignal.beam||0)-beam)*k;
   const A=tex[from]??tex[to],B=tex[to]??A;if(!A||!B){frame=requestAnimationFrame(draw);return;}
   bind(0,A.col,'uColA');bind(1,A.dep,'uDepA');bind(2,B.col,'uColB');bind(3,B.dep,'uDepB');
   gl.uniform2f(u('uRes'),el.width,el.height);gl.uniform2f(u('uSizeA'),...A.size);gl.uniform2f(u('uSizeB'),...B.size);gl.uniform2f(u('uPosA'),...A.pos);gl.uniform2f(u('uPosB'),...B.pos);
   gl.uniform1f(u('uMix'),ease(mix));gl.uniform1f(u('uAmp'),look?.075:.036);gl.uniform1f(u('uTilt'),tilt);gl.uniform1f(u('uTime'),idle);gl.uniform1f(u('uDolly'),mood.dolly);
   gl.uniform2f(u('uCam'),cam.x,cam.y);gl.uniform2f(u('uLight'),lightPos.x,lightPos.y);
   gl.uniform1f(u('uExposure'),mood.exposure+beam*.05);gl.uniform1f(u('uContrast'),mood.contrast);gl.uniform1f(u('uWarm'),mood.warm);gl.uniform1f(u('uCool'),mood.cool);gl.uniform1f(u('uVignette'),mood.vignette);gl.uniform1f(u('uBeam'),mood.beam*(1+beam*.9));gl.uniform1f(u('uSweep'),mood.sweep);gl.uniform1f(u('uLift'),look?0:mood.lift);gl.uniform1f(u('uLightAmt'),mood.light);gl.uniform1f(u('uGrain'),calm?.02:.035);
   gl.drawArrays(gl.TRIANGLES,0,3);
   // Keep breathing while there is somewhere to go; stop entirely when still.
   const settling=mix<1||moodT<1||Math.abs(cam.tx+drift.x+orbit-cam.x)>.0005||Math.abs(orbit-(worldSignal.orbit||0))>.0005;
   if(!calm||settling)frame=requestAnimationFrame(draw);
  };
  const kick=()=>{if(!frame&&!dead)frame=requestAnimationFrame(draw);};
  const move=(e:globalThis.PointerEvent)=>{
   if(flags.current.still)return;
   const x=e.clientX/window.innerWidth,y=e.clientY/window.innerHeight;lightPos.tx=x;lightPos.ty=y;
   if(e.pointerType==='mouse'){cam.tx=(x-.5)*2;cam.ty=(y-.5)*1.4;}
   kick();
  };
  const reset=()=>{cam.tx=0;cam.ty=0;kick();};
  const scroll=()=>{if(flags.current.still){tilt=0;return;}tilt=Math.min(1,window.scrollY/(window.innerHeight*1.1));kick();};
  const tiltDevice=(e:DeviceOrientationEvent)=>{if(flags.current.still||e.gamma==null||e.beta==null)return;cam.tx=Math.max(-1,Math.min(1,e.gamma/22));cam.ty=Math.max(-1,Math.min(1,(e.beta-45)/30));kick();};
  const visible=()=>{if(document.hidden){cancelAnimationFrame(frame);frame=0;}else{last=0;kick();}};
  const ro=new ResizeObserver(()=>{resize();kick();});ro.observe(el);resize();
  // Load the current room first so the canvas can take over quickly, then the rest of the journey.
  const order=[sceneOf(target.current),...(Object.keys(scenes) as Scene[]).filter(s=>s!==sceneOf(target.current))];
  (async()=>{
   for(const s of order){
    try{const [c,d]=await Promise.all([load(scenes[s].image.src),load(scenes[s].depth.src)]);if(dead)return;
     tex[s]={col:texture(c),dep:texture(d),size:[c.naturalWidth,c.naturalHeight],pos:scenes[s].pos};
     if(s===order[0]){from=to=s;setLive(true);kick();}
    }catch{/* keep the still fallback */}
   }
  })();
  window.addEventListener('pointermove',move,{passive:true});window.addEventListener('blur',reset);document.documentElement.addEventListener('pointerleave',reset);window.addEventListener('scroll',scroll,{passive:true});window.addEventListener('deviceorientation',tiltDevice);document.addEventListener('visibilitychange',visible);
  const poke=setInterval(()=>{if(target.current!==shownRoom||worldSignal.orbit!==orbit||worldSignal.beam!==beam)kick();},120);
  return()=>{dead=true;cancelAnimationFrame(frame);clearInterval(poke);ro.disconnect();window.removeEventListener('pointermove',move);window.removeEventListener('blur',reset);document.documentElement.removeEventListener('pointerleave',reset);window.removeEventListener('scroll',scroll);window.removeEventListener('deviceorientation',tiltDevice);document.removeEventListener('visibilitychange',visible);gl.getExtension('WEBGL_lose_context')?.loseContext();};
 },[]);
 const active=sceneOf(room);
 return <div className="hall-environment" data-room={room} data-live={live||undefined} aria-hidden="true">
  <div className="hall-plates">{(Object.keys(scenes) as Scene[]).map(s=><div key={s} className="hall-plate" data-active={s===active} data-scene={s}><Image src={scenes[s].image} alt="" fill priority={s==='arrival'} sizes="100vw" placeholder="blur" quality={85} style={{objectPosition:`${scenes[s].pos[0]*100}% ${scenes[s].pos[1]*100}%`}}/></div>)}</div>
  <canvas ref={canvas} className="hall-canvas"/>
  <div className="hall-atmos"/>
 </div>;
}
