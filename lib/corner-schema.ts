import {z} from 'zod';
import {FORMATS} from './formats';
export {FORMATS};
const line=z.string().trim().min(1).max(1400);
export const sourceSchema=z.object({title:z.string(),url:z.string().url().refine(s=>s.startsWith('https://'))});
const ref=z.number().int().min(0);
export const seedSchema=z.object({title:line,creator:line,format:z.enum(FORMATS),year:z.string().max(40),description:line,source:ref,facts:z.array(z.object({text:line,source:ref})).max(3)});
export const lookupSchema=z.object({matches:z.array(seedSchema).max(3)});
export const resultSchema=z.object({name:line,kicker:line,hook:line,intro:line,heads:z.array(line).length(3),bridges:z.array(line).length(3),shift:line,payoff:line,question:line,angles:z.array(line).length(3),answers:z.array(line).length(3),bonus:line,works:z.array(z.object({title:line,creator:line,format:line,pitch:line,source:ref})).length(4)});
export type Source=z.infer<typeof sourceSchema>;
export type Seed=z.infer<typeof seedSchema>;
export type Lookup={id:string;matches:Seed[];sources:Source[];searchHtml:string[]};
export function cornerIndex(format:Seed['format']){return format==='Book'||format==='Article'?0:format==='Podcast episode'?2:1}
export function requireSource(sources:Source[],index:number){const source=sources[index];if(!source)throw new Error('Missing research source');return source;}

// When the confirmed work is not the one the visitor meant, they can narrow the search
// (creator, year, format) and rule out what they already rejected.
export const lookupHintsSchema=z.object({
 creator:z.string().trim().max(120).optional(),
 year:z.string().trim().max(20).optional(),
 format:z.enum(FORMATS).optional(),
 exclude:z.array(z.object({title:z.string().trim().max(240),creator:z.string().trim().max(240)})).max(8).optional()
});
export type LookupHints=z.infer<typeof lookupHintsSchema>;
const plain=(s:string)=>s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
export function isRejected(match:{title:string;creator:string},exclude:{title:string;creator:string}[]=[]){
 const title=plain(match.title),creator=plain(match.creator);
 return exclude.some(x=>{const t=plain(x.title),c=plain(x.creator);return t===title&&(!c||!creator||c===creator||c.includes(creator)||creator.includes(c));});
}
export const dropRejected=<T extends {title:string;creator:string}>(matches:T[],exclude:{title:string;creator:string}[]=[])=>matches.filter(m=>!isRejected(m,exclude));
