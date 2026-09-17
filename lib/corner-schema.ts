import {z} from 'zod';
const line=z.string().trim().min(1).max(1400);
export const sourceSchema=z.object({title:z.string(),url:z.string().url().refine(s=>s.startsWith('https://'))});
const ref=z.number().int().min(0);
export const seedSchema=z.object({title:line,creator:line,format:z.enum(['Book','Article','Movie','Documentary','Show','Podcast episode']),year:z.string().max(40),description:line,source:ref,facts:z.array(z.object({text:line,source:ref})).max(3)});
export const lookupSchema=z.object({matches:z.array(seedSchema).max(3)});
export const resultSchema=z.object({name:line,kicker:line,hook:line,intro:line,heads:z.array(line).length(3),bridges:z.array(line).length(3),shift:line,payoff:line,question:line,angles:z.array(line).length(3),answers:z.array(line).length(3),bonus:line,works:z.array(z.object({title:line,creator:line,format:line,pitch:line,source:ref})).length(4)});
export type Source=z.infer<typeof sourceSchema>;
export type Seed=z.infer<typeof seedSchema>;
export type Lookup={id:string;matches:Seed[];sources:Source[];searchHtml:string[]};
export function cornerIndex(format:Seed['format']){return format==='Book'||format==='Article'?0:format==='Podcast episode'?2:1}
export function requireSource(sources:Source[],index:number){const source=sources[index];if(!source)throw new Error('Missing research source');return source;}
