// Download the archive shortlist from Destockd (public-domain FedFlix footage) and prepare it for the hall:
// black and white, 640px wide, at most 6 seconds, silent, H.264 with fast start. Writes public/archive/*.mp4
// and regenerates the clip list in app/v2/archive.ts. Needs network access to clips.destockd.com and ffmpeg.
import fs from 'fs';import {execFileSync} from 'child_process';
const list=JSON.parse(fs.readFileSync('scripts/archive-shortlist.json','utf8'));
fs.mkdirSync('public/archive',{recursive:true});fs.mkdirSync('/tmp/archive-src',{recursive:true});
const slug=s=>s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const clips=[];
for(const c of list){
 const name=slug(c.subject),src=`/tmp/archive-src/${name}.mp4`,out=`public/archive/${name}.mp4`;
 if(!fs.existsSync(src)){const r=await fetch(c.clip);if(!r.ok){console.log('skip',c.subject,r.status);continue;}fs.writeFileSync(src,Buffer.from(await r.arrayBuffer()));}
 const vf='scale=640:-2,format=gray,format=yuv420p';
 execFileSync('ffmpeg',['-y','-loglevel','error','-i',src,'-t','6','-an','-vf',vf,'-c:v','libx264','-preset','slow','-crf','30','-movflags','+faststart',out]);
 execFileSync('ffmpeg',['-y','-loglevel','error','-i',src,'-t','6','-an','-vf',vf,'-c:v','libvpx-vp9','-b:v','0','-crf','42','-row-mt','1',out.replace(/\.mp4$/,'.webm')]);
 const [w,h]=execFileSync('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=width,height','-of','csv=p=0',out]).toString().trim().split(',').map(Number);
 clips.push({src:`/archive/${name}`,w,h,subject:c.subject,film:c.film,shot:c.shot});
 console.log('ok',name,fs.statSync(out).size);
}
const ts=fs.readFileSync('app/v2/archive.ts','utf8').replace(/export const clips:Clip\[\]=[\s\S]*?;\n/,`export const clips:Clip[]=${JSON.stringify(clips.map(({src,w,h,subject})=>({src,w,h,subject})),null,1)};\n`);
fs.writeFileSync('app/v2/archive.ts',ts);
fs.writeFileSync('public/archive/SOURCES.json',JSON.stringify(clips,null,1));
