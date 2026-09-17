import base from './catalog-base.json';
import stories from './story-copy.json';
import extras from './extra-topics.json';
export type Work={title:string;creator:string;format:string;pitch:string;url?:string};
export type Topic={id:string;name:string;title:string;kicker:string;color:string;hook:string;intro:string;heads:string[];bridges:string[];shift:string;payoff:string;question:string;angles:string[];answers:string[];bonus:string;pilotIndex:number;works:Work[];sources?:{title:string;url:string}[];searchHtml?:string[];seedTitle?:string};
export const topics:Topic[]=[...base.map((t,i)=>({...t,...stories[i],pilotIndex:i,works:t.works.map((w,j)=>({...w,pitch:j<3?stories[i].pitches[j]:w.pitch}))})),...extras];
export const topicIds=topics.map(t=>t.id);
export const workUrl=(w:Work)=>w.url||'https://www.google.com/search?q='+encodeURIComponent(w.title+' '+w.creator+' '+w.format);
