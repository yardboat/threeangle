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
import mapRoom from '@/public/hall/map-room.webp';
import frames from '@/public/hall/frames.webp';
import stairs from '@/public/hall/stairs.webp';
import mapRoomDepth from '@/public/hall/depth/map-room.webp';
import framesDepth from '@/public/hall/depth/frames.webp';
import stairsDepth from '@/public/hall/depth/stairs.webp';
import {clips} from './archive';

// The library is a character, not wallpaper.
// Each room is a painting plus a depth map (MiDaS, see docs/gilded-hall-v2.md). A single fragment shader
// re-projects the painting through that depth, so the camera can move *inside* the room: the pointer
// (or device tilt) looks around, scrolling tilts the view down to the floor, changing screen walks you
// forward into the next room, and the light of each room changes with the time of day of the journey.
// Without WebGL, or with reduced motion, the same rooms are shown as graded still images.

export type Room='arrival'|'reading'|'study'|'gallery'|'maproom'|'frames'|'stairs'|'rotunda';
export const roomNames:Record<Room,string>={arrival:'The Gilded Hall',reading:'The Reading Room',study:'The Reading Alcove',gallery:'The Sunlit Gallery',maproom:'The Map Room',frames:'The Gallery of Frames',stairs:'The Stair Hall',rotunda:'The Rotunda'};
type Scene='arrival'|'reading'|'gallery'|'maproom'|'frames'|'stairs'|'rotunda';
// proj: the one surface in a room built to take a projection (a blank canvas, a lit niche), as a rectangle in
// painting space (x0, y0, x1, y1), measured on the painting itself. arch: the top of the surface is a round arch,
// this fraction of its height. The film keeps its own 4:3 proportions: cropped to the surface (cover), or, on a
// painting, thrown full-width with the canvas dimmed around it (contain). under: how much of the surface still shows.
// Rooms without such a surface (the open colonnade, the gallery of paintings) take no projection at all.
type Rect=[number,number,number,number];
type Surface={rect:Rect;arch?:number;fit?:'cover'|'contain';under?:number};
type SceneDef={image:StaticImageData;depth:StaticImageData;pos:[number,number];proj?:Surface};
const scenes:Record<Scene,SceneDef>={
 arrival:{image:arrival,depth:arrivalDepth,pos:[.5,.46]},
 reading:{image:reading,depth:readingDepth,pos:[.5,.5]},
 gallery:{image:gallery,depth:galleryDepth,pos:[.5,.5]},
 // The map room's great empty canvas, inside its gilt frame.
 maproom:{image:mapRoom,depth:mapRoomDepth,pos:[.5,.5],proj:{rect:[.4195,.2255,.6595,.5265]}},
 // The Gallery of Frames is hung with the great works (see docs/gilded-hall-v2.md). While the library works, the
 // projector takes over the centre frame, the painting dimmed behind the film; the side walls keep their paintings.
 frames:{image:frames,depth:framesDepth,pos:[.5,.55],proj:{rect:[.4746,.5216,.5864,.7746],fit:'contain',under:.1}},
 // The lit niche between the two stairs, arch and all.
 stairs:{image:stairs,depth:stairsDepth,pos:[.5,.5],proj:{rect:[.4735,.3165,.5615,.6575],arch:.235}},
 rotunda:{image:rotunda,depth:rotundaDepth,pos:[.5,.62]},
};
// The time of day moves with the journey: morning at the door, dusk in the rotunda.
type Mood={exposure:number;contrast:number;warm:number;cool:number;vignette:number;beam:number;sweep:number;lift:number;light:number;dolly:number;film:number;project:number};
const moods:Record<Room,Mood>={
 arrival:{exposure:1.04,contrast:1.1,warm:.04,cool:0,vignette:.22,beam:0,sweep:0,lift:.34,light:.05,dolly:0,film:.05,project:0},
 reading:{exposure:1,contrast:1.1,warm:.12,cool:0,vignette:.3,beam:0,sweep:0,lift:.3,light:.06,dolly:0,film:.05,project:0},
 study:{exposure:.98,contrast:1.12,warm:.2,cool:0,vignette:.36,beam:0,sweep:0,lift:.3,light:.06,dolly:.1,film:.07,project:0},
 gallery:{exposure:.4,contrast:1.22,warm:.55,cool:.08,vignette:.8,beam:0,sweep:1,lift:0,light:.22,dolly:.04,film:.42,project:1},
 maproom:{exposure:.38,contrast:1.2,warm:.62,cool:0,vignette:.72,beam:0,sweep:.6,lift:0,light:.24,dolly:.1,film:.3,project:1},
 frames:{exposure:.38,contrast:1.22,warm:.4,cool:.12,vignette:.78,beam:0,sweep:.3,lift:0,light:.22,dolly:.16,film:.26,project:1},
 stairs:{exposure:.44,contrast:1.2,warm:.2,cool:.26,vignette:.74,beam:.3,sweep:0,lift:0,light:.2,dolly:.06,film:.22,project:1},
 rotunda:{exposure:.36,contrast:1.24,warm:.1,cool:.34,vignette:.78,beam:1,sweep:0,lift:0,light:.2,dolly:0,film:.18,project:0},
};
// Rooms that share a painting are seen from a different place in it (dolly) and at a different hour (mood).
const ROOM_SCENE:Record<Room,Scene>={arrival:'arrival',reading:'reading',study:'reading',gallery:'gallery',maproom:'maproom',frames:'frames',stairs:'stairs',rotunda:'rotunda'};
const sceneOf=(r:Room):Scene=>ROOM_SCENE[r];
// The order a visitor walks through the rooms. Only the room in view and the next two on the walk are fetched.
const JOURNEY:Scene[]=['arrival','reading','gallery','maproom','stairs','frames','rotunda'];
const ahead=(s:Scene)=>{const i=JOURNEY.indexOf(s);return [JOURNEY[i+1],JOURNEY[i+2],s==='reading'?'maproom':undefined].filter(Boolean) as Scene[]};

// A tiny shared channel so the reveal can move the room (the camera orbits a little as the table turns,
// and the oculus light gathers when the apex is open) without re-rendering React.
export const worldSignal={orbit:0,beam:0};

const VERT=`attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}`;
const FRAG=`precision highp float;
uniform vec2 uRes;uniform sampler2D uColA,uDepA,uColB,uDepB,uArc;uniform vec2 uSizeA,uSizeB,uPosA,uPosB,uArcSize;
uniform float uMix,uAmp,uTilt,uTime,uDolly,uFrame;uniform vec2 uCam,uLight;
uniform float uExposure,uContrast,uWarm,uCool,uVignette,uBeam,uSweep,uLift,uLightAmt,uGrain,uFilm,uFilmOn,uArcAmt,uProjA,uProjB,uArchA,uArchB;uniform vec4 uRectA,uRectB;uniform vec2 uCropA,uCropB;uniform float uUnderA,uUnderB;
float hash(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
vec2 cover(vec2 f,vec2 size,vec2 pos){float s=max(uRes.x/size.x,uRes.y/size.y)*1.1;vec2 d=size*s;return(f-(uRes-d)*pos)/d;}
vec3 room(sampler2D col,sampler2D dep,vec2 size,vec2 pos,vec2 f,float dolly,float blur,out float depth,out vec2 uv){
 vec2 base=cover(f,size,pos),vp=cover(uRes*.5,size,pos),p=base;float d=.3;
 for(int i=0;i<6;i++){
  d=texture2D(dep,clamp(p,0.,1.)).r;
  p=vp+(base-vp)/(1.+dolly*(.2+.8*d))-uCam*uAmp*(d-.32)+vec2(0.,uTilt*(.03+.09*d));
 }
 depth=d;uv=p;
 // Moving through: a zoom blur toward the vanishing point, strongest on the near architecture.
 vec3 c=texture2D(col,clamp(p,.002,.998)).rgb;
 if(blur>.001){vec2 dir=(p-vp)*blur*(.35+.65*d);for(int i=1;i<5;i++)c+=texture2D(col,clamp(p-dir*float(i),.002,.998)).rgb;c/=5.;}
 return c;
}
float luma(vec3 c){return dot(c,vec3(.299,.587,.114));}
// The projector: film thrown onto one surface of a room, in painting space so it stays on the wall as the camera moves.
// crop keeps the film's proportions (cover), arch rounds the top of the surface, and the light falls off at the edges.
vec3 project(vec3 c,vec2 p,vec4 rect,vec2 crop,float arch,float under,float amt){
 vec2 r=(p-rect.xy)/(rect.zw-rect.xy);
 float e=.02;
 float inside=smoothstep(0.,e,r.x)*smoothstep(1.,1.-e,r.x)*smoothstep(0.,e*.7,r.y)*smoothstep(1.,1.-e*.7,r.y);
 if(arch>.001&&r.y<arch){vec2 q=vec2((r.x-.5)/.5,(r.y-arch)/arch);inside*=smoothstep(1.,.93,length(q));}
 vec2 fu=.5+(r-.5)*crop;
 float lf=luma(texture2D(uArc,clamp(fu,0.,1.)).rgb);
 // A warm bulb, a little hotter at the centre, the room's own light still under it.
 float hot=1.-.35*length((r-.5)*vec2(1.,.8));
 vec3 film=vec3(lf)*vec3(1.,.95,.84)*(.35+.75*hot);
 // Outside the frame of the film (contain), the surface is only dimmed, like a screen between reels.
 float inFilm=smoothstep(-.004,.004,fu.x)*smoothstep(1.004,.996,fu.x)*smoothstep(-.004,.004,fu.y)*smoothstep(1.004,.996,fu.y);
 return mix(c,c*under+film*inFilm,amt*inside);
}
void main(){
 float T=sin(3.14159*uMix);
 // Film gate weave while travelling between rooms.
 vec2 f=vec2(gl_FragCoord.x,uRes.y-gl_FragCoord.y)+vec2(0.,(hash(vec2(uFrame,3.))-.5)*6.*T*T*uFilmOn);
 vec2 sv=f/uRes;
 float dA,dB;vec2 pA,pB;
 vec3 a=room(uColA,uDepA,uSizeA,uPosA,f,uDolly+uMix*.78,.022*T,dA,pA);
 vec3 b=room(uColB,uDepB,uSizeB,uPosB,f,uDolly-(1.-uMix)*.3,.022*T,dB,pB);
 // Each room carries its own projection, so the film never lands on the wrong room mid-walk.
 if(uProjA>.001)a=project(a,pA,uRectA,uCropA,uArchA,uUnderA,uProjA);
 if(uProjB>.001)b=project(b,pB,uRectB,uCropB,uArchB,uUnderB,uProjB);
 // Walking forward: the nearest architecture passes you first.
 float k=smoothstep(0.,1.,clamp((uMix-(1.-dA)*.38)/.62,0.,1.));
 vec3 c=mix(a,b,k);vec2 p=mix(pA,pB,k);float d=mix(dA,dB,k);
 c*=uExposure*(1.+.18*T);
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
 float l=luma(c);c=mix(c,l*vec3(.7,.8,1.02)+c*.25,uCool);
 c=(c-.5)*uContrast+.5;
 c=mix(c,vec3(.965,.95,.925),uLift*(1.-T)*smoothstep(.62,.0,length((sv-vec2(.5,.56))*vec2(.95,1.45))));
 // Mid-journey the rooms turn to archival film: silver, flickering, with a cut of real footage.
 float film=clamp(uFilm+T*.85*uFilmOn,0.,1.);
 c=mix(c,vec3(luma(c))*vec3(1.03,1.,.94),T*.8*uFilmOn);
 if(uArcAmt>.001){vec2 au=cover(f,uArcSize,vec2(.5));vec3 ar=texture2D(uArc,clamp(au,0.,1.)).rgb;c=mix(c,vec3(luma(ar))*vec3(1.02,.99,.92),uArcAmt*smoothstep(.25,.6,T));}
 c*=1.+(hash(vec2(uFrame,7.))-.5)*.16*film;
 float col=floor(f.x/2.);float scratch=step(.9975,hash(vec2(col,floor(uFrame/2.))))*step(.3,hash(vec2(col,1.)));
 c=mix(c,vec3(.92),scratch*film*.35);
 vec2 cell=floor(f/3.);float dust=step(.99965,hash(cell+uFrame*1.7));c=mix(c,vec3(.05),dust*film*.8);
 // An iris, as in silent film: it closes a little around the journey and opens on the new room.
 float iris=mix(1.7,.86,T*T*uFilmOn);c*=mix(.3,1.,smoothstep(iris,iris-.42,length((sv-.5)*vec2(uRes.x/uRes.y,1.))));
 c*=1.-uVignette*smoothstep(.3,1.05,length((sv-.5)*vec2(1.25,1.)));
 c*=1.-uTilt*.35;
 c+=(hash(gl_FragCoord.xy+fract(uTime)*97.)-.5)*(uGrain+film*.05);
 gl_FragColor=vec4(clamp(c,0.,1.),1.);
}`;

type Tex={col:WebGLTexture;dep:WebGLTexture;size:[number,number];pos:[number,number]};
function load(src:string){return new Promise<HTMLImageElement>((ok,fail)=>{const i=new window.Image();i.decoding='async';i.onload=()=>ok(i);i.onerror=fail;i.src=src;});}

export function HallWorld({room,still,looking,film=false}:{room:Room;still:boolean;looking:boolean;film?:boolean}){
 const canvas=useRef<HTMLCanvasElement>(null);
 const [live,setLive]=useState(false);
 const target=useRef(room),flags=useRef({still,looking,film});
 // The render loop reads the latest room and motion settings without restarting.
 useEffect(()=>{target.current=room;flags.current={still,looking,film};},[room,still,looking,film]);
 useEffect(()=>{
  const el=canvas.current;if(!el)return;
  const gl=el.getContext('webgl',{antialias:false,alpha:false,premultipliedAlpha:false,powerPreference:'low-power'});
  if(!gl)return;
  const shader=(type:number,src:string)=>{const s=gl.createShader(type)!;gl.shaderSource(s,src);gl.compileShader(s);return s;};
  const prog=gl.createProgram()!;gl.attachShader(prog,shader(gl.VERTEX_SHADER,VERT));gl.attachShader(prog,shader(gl.FRAGMENT_SHADER,FRAG));gl.linkProgram(prog);
  if(!gl.getProgramParameter(prog,gl.LINK_STATUS)){if(process.env.NODE_ENV!=='production')console.warn('hall shader',gl.getProgramInfoLog(prog));return;}
  gl.useProgram(prog);
  const buf=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buf);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
  const loc=gl.getAttribLocation(prog,'p');gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);
  const U:Record<string,WebGLUniformLocation|null>={};const u=(n:string)=>U[n]??=gl.getUniformLocation(prog,n);
  const texture=(img:HTMLImageElement)=>{const t=gl.createTexture()!;gl.bindTexture(gl.TEXTURE_2D,t);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB,gl.RGB,gl.UNSIGNED_BYTE,img);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);return t;};
  const tex:Partial<Record<Scene,Tex>>={};
  // The archive: one video element, drawn into a texture while it is on screen.
  const arcTex=gl.createTexture()!;gl.bindTexture(gl.TEXTURE_2D,arcTex);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB,1,1,0,gl.RGB,gl.UNSIGNED_BYTE,new Uint8Array([0,0,0]));
  [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER].forEach(pn=>gl.texParameteri(gl.TEXTURE_2D,pn,gl.LINEAR));[gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T].forEach(pn=>gl.texParameteri(gl.TEXTURE_2D,pn,gl.CLAMP_TO_EDGE));
  const vid=clips.length?Object.assign(document.createElement('video'),{muted:true,playsInline:true,loop:true,preload:'auto'}):null;
  let clipAt=0,arcSize:[number,number]=[640,480],arcReady=false;
  const ext=vid&&vid.canPlayType('video/webm; codecs="vp9"')?'.webm':'.mp4';
  // Short shots flash through the walks between rooms; the projector on the gallery wall holds the longer ones.
  // Each pool is shuffled once and dealt in order, so no shot repeats until the pool has run through.
  const shuffle=<T,>(a:T[])=>{for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
  const pools={flash:shuffle(clips.filter(c=>c.dur<4.5)),wall:shuffle(clips.filter(c=>c.dur>=4.5))},dealt={flash:0,wall:0};
  const nextClip=(kind:'flash'|'wall'='flash')=>{if(!vid||!clips.length)return;const pool=pools[kind].length?pools[kind]:clips;const c=pool[dealt[kind]++%pool.length];arcReady=false;vid.src=c.src+ext;arcSize=[c.w,c.h];vid.currentTime=0;void vid.play().catch(()=>{});};
  if(vid)vid.addEventListener('playing',()=>{arcReady=true;});
  if(vid&&process.env.NODE_ENV!=='production')(window as unknown as {__hallArc:unknown}).__hallArc=()=>({src:vid.src,paused:vid.paused,ready:arcReady,rs:vid.readyState,err:vid.error?.message});
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
   const {still:calm,looking:look,film:filmOn}=flags.current;
   // Room changes: walk forward into the next scene, and move the light of day with it.
   if(target.current!==shownRoom){
    const next=sceneOf(target.current);
    // The walk starts once the next room's painting is ready; until then the current room holds.
    if(tex[next]||next===to){if(next!==to){from=to;to=next;mix=0;if(!calm&&filmOn)nextClip();}
     moodFrom={...mood};moodTo=moods[target.current];moodT=0;shownRoom=target.current;fetchAhead(next);}
    else fetchScene(next);
   }
   mix=calm?1:Math.min(1,mix+dt/2.8);moodT=calm?1:Math.min(1,moodT+dt/1.7);
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
   // Archive footage belongs to the waiting screen only: it flashes through each walk between rooms, and a room
   // with a projection surface holds a longer shot on it. Everywhere else the rooms are film-free.
   const transit=filmOn?Math.sin(Math.PI*ease(mix)):0;
   const surf=(sc:Scene)=>filmOn?scenes[sc].proj:undefined;
   const sA=from===to?undefined:surf(from),sB=surf(to);const projAmt=sB?mood.project:0;
   const wantArc=Boolean(vid)&&!calm&&(transit>.05||projAmt>.05||Boolean(sA&&mix<1));
   if(vid){
    if(wantArc&&vid.paused&&!vid.src)nextClip(projAmt>.5?'wall':'flash');
    if(projAmt>.5&&mix>=1&&now-clipAt>5200){clipAt=now;nextClip('wall');}
    if(!wantArc&&!vid.paused&&mix>=1)vid.pause();
    if(wantArc&&arcReady&&vid.readyState>=2){gl.activeTexture(gl.TEXTURE4);gl.bindTexture(gl.TEXTURE_2D,arcTex);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB,gl.RGB,gl.UNSIGNED_BYTE,vid);}
   }
   const arcOn=wantArc&&arcReady?1:0;
   bind(4,arcTex,'uArc');gl.uniform2f(u('uArcSize'),...arcSize);gl.uniform1f(u('uArcAmt'),filmOn?arcOn*.55:0);
   // The room being left lets its projection go as the walk begins; the new room lights its surface as you arrive.
   const e2=ease(mix);
   const setSurface=(k:'A'|'B',sc:Scene,sf:Surface|undefined,amt:number)=>{
    const t=tex[sc];const [x0,y0,x1,y1]=sf?.rect||[0,0,1,1];
    // Cover-crop the 4:3 film to the surface's real proportions, measured in painting pixels.
    const aspect=t?((x1-x0)*t.size[0])/((y1-y0)*t.size[1]):4/3,film=arcSize[0]/arcSize[1];
    gl.uniform1f(u('uProj'+k),sf?arcOn*amt*.9:0);gl.uniform4f(u('uRect'+k),x0,y0,x1,y1);gl.uniform1f(u('uArch'+k),sf?.arch||0);
    const wide=aspect<film;
    if(sf?.fit==='contain')gl.uniform2f(u('uCrop'+k),wide?1:aspect/film,wide?film/aspect:1);
    else gl.uniform2f(u('uCrop'+k),wide?aspect/film:1,wide?1:film/aspect);
    gl.uniform1f(u('uUnder'+k),sf?.under??.35);
   };
   setSurface('A',from,sA,(1-e2)*moodFrom.project);
   setSurface('B',to,sB,projAmt*(sA||from!==to?e2:1));
   gl.uniform1f(u('uFilmOn'),filmOn?1:0);gl.uniform1f(u('uFilm'),calm||!filmOn?0:mood.film);gl.uniform1f(u('uFrame'),calm?0:Math.floor(now/1000*18));
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
  // Load the current room first so the canvas can take over quickly, then only the next rooms on the walk.
  const fetching=new Set<Scene>();
  function fetchScene(s:Scene){
   if(tex[s]||fetching.has(s))return;fetching.add(s);
   void Promise.all([load(scenes[s].image.src),load(scenes[s].depth.src)]).then(([c,d])=>{if(dead)return;
    tex[s]={col:texture(c),dep:texture(d),size:[c.naturalWidth,c.naturalHeight],pos:scenes[s].pos};
    if(!live0){live0=true;from=to=s;setLive(true);fetchAhead(s);}
    kick();
   }).catch(()=>{fetching.delete(s);/* keep the still fallback */});
  }
  function fetchAhead(s:Scene){const go=()=>ahead(s).forEach(fetchScene);if('requestIdleCallback' in window)window.requestIdleCallback(go,{timeout:4000});else setTimeout(go,1500);}
  let live0=false;
  fetchScene(sceneOf(target.current));
  window.addEventListener('pointermove',move,{passive:true});window.addEventListener('blur',reset);document.documentElement.addEventListener('pointerleave',reset);window.addEventListener('scroll',scroll,{passive:true});window.addEventListener('deviceorientation',tiltDevice);document.addEventListener('visibilitychange',visible);
  const poke=setInterval(()=>{if(target.current!==shownRoom||worldSignal.orbit!==orbit||worldSignal.beam!==beam)kick();},120);
  return()=>{dead=true;cancelAnimationFrame(frame);clearInterval(poke);if(vid){vid.pause();vid.removeAttribute('src');vid.load();}ro.disconnect();window.removeEventListener('pointermove',move);window.removeEventListener('blur',reset);document.documentElement.removeEventListener('pointerleave',reset);window.removeEventListener('scroll',scroll);window.removeEventListener('deviceorientation',tiltDevice);document.removeEventListener('visibilitychange',visible);gl.getExtension('WEBGL_lose_context')?.loseContext();};
 },[]);
 const active=sceneOf(room);
 // Still plates (before WebGL takes over, or without it): only rooms that have been in view are rendered,
 // so the first paint fetches one painting, at high priority, not seven.
 const [shown,setShown]=useState<Scene[]>(()=>[active]);
 if(!shown.includes(active))setShown([...shown,active]);
 return <div className="hall-environment" data-room={room} data-live={live||undefined} aria-hidden="true">
  <div className="hall-plates">{shown.map(s=><div key={s} className="hall-plate" data-active={s===active} data-scene={s}><Image src={scenes[s].image} alt="" fill priority={s===shown[0]} sizes="100vw" placeholder="blur" quality={85} style={{objectPosition:`${scenes[s].pos[0]*100}% ${scenes[s].pos[1]*100}%`}}/></div>)}</div>
  <canvas ref={canvas} className="hall-canvas"/>
  <div className="hall-atmos"/>
 </div>;
}
