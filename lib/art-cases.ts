import {resolveWork,searchCatalog,type Candidate} from './catalog';

// Known works across every format, with the traps that used to produce wrong covers.
// `by` must appear in the matched creator (or its alternates); `not` must not.
export type ArtCase={title:string;creator:string;format:string;by:string;not?:string;url?:string};
export const ART_CASES:ArtCase[]=[
 {title:'The Emerald Mile',creator:'Kevin Fedarko',format:'Book',by:'Fedarko'},
 {title:'Dune',creator:'Frank Herbert',format:'Book',by:'Herbert'},
 {title:'Beloved',creator:'Toni Morrison',format:'Book',by:'Morrison'},
 {title:'Educated',creator:'Tara Westover',format:'Book',by:'Westover'},
 {title:'The Overstory',creator:'Richard Powers',format:'Book',by:'Powers'},
 {title:'Braiding Sweetgrass',creator:'Robin Wall Kimmerer',format:'Book',by:'Kimmerer'},
 {title:'Red Rising',creator:'Pierce Brown',format:'Book',by:'Brown'},
 {title:'Cadillac Desert',creator:'Marc Reisner',format:'Book',by:'Reisner'},
 {title:'Jaws',creator:'Steven Spielberg',format:'Movie',by:'Spielberg'},
 {title:'The Godfather',creator:'Francis Ford Coppola',format:'Movie',by:'Coppola'},
 {title:'Perfect Days',creator:'Wim Wenders',format:'Movie',by:'Wenders'},
 {title:'Arrival',creator:'Denis Villeneuve',format:'Movie',by:'Villeneuve'},
 {title:'Parasite',creator:'Bong Joon-ho',format:'Movie',by:'Bong'},
 {title:'Past Lives',creator:'Celine Song',format:'Movie',by:'Song'},
 {title:'Damnation',creator:'Béla Tarr',format:'Movie',by:'Tarr',not:'Rummel'},
 {title:'DamNation',creator:'Travis Rummel / Ben Knight',format:'Documentary',by:'Rummel|Knight|Patagonia',not:'Tarr'},
 {title:'Free Solo',creator:'Elizabeth Chai Vasarhelyi and Jimmy Chin',format:'Documentary',by:'Chin|Vasarhelyi'},
 {title:'My Octopus Teacher',creator:'Pippa Ehrlich and James Reed',format:'Documentary',by:'Ehrlich|Reed'},
 {title:'Won’t You Be My Neighbor?',creator:'Morgan Neville',format:'Documentary',by:'Neville'},
 {title:'Severance',creator:'Dan Erickson',format:'Show',by:'Erickson|Apple'},
 {title:'The Wire',creator:'David Simon',format:'Show',by:'Simon|HBO'},
 {title:'Chernobyl',creator:'Craig Mazin',format:'Show',by:'Mazin|HBO'},
 {title:'Fleabag',creator:'Phoebe Waller-Bridge',format:'Show',by:'Waller-Bridge|BBC'},
 {title:'The Bear',creator:'Christopher Storer',format:'Show',by:'Storer|FX'},
 {title:'Planet Earth',creator:'BBC',format:'Show',by:'BBC|Attenborough|Fothergill'},
 {title:'7 States, 1 River and an Agonizing Choice',creator:'The Daily',format:'Podcast episode',by:'Daily|New York Times'},
 {title:'Ten Thousand Years',creator:'99% Invisible',format:'Podcast episode',by:'99% Invisible|Roman Mars'},
 {title:'Colors',creator:'Radiolab',format:'Podcast episode',by:'Radiolab|WNYC'},
 {title:'Harper High School, Part One',creator:'This American Life',format:'Podcast episode',by:'This American Life'},
 {title:'The Sunday Read: ‘The Man Who Couldn’t Take It Anymore’',creator:'The Daily',format:'Podcast episode',by:'Daily|New York Times'},
 {title:'Rumours',creator:'Fleetwood Mac',format:'Album',by:'Fleetwood'},
 {title:'Kind of Blue',creator:'Miles Davis',format:'Album',by:'Davis'},
 {title:'OK Computer',creator:'Radiohead',format:'Album',by:'Radiohead'},
 {title:'Blue',creator:'Joni Mitchell',format:'Album',by:'Mitchell'},
 {title:'To Pimp a Butterfly',creator:'Kendrick Lamar',format:'Album',by:'Kendrick'},
 {title:'Random Access Memories',creator:'Daft Punk',format:'Album',by:'Daft Punk'},
 {title:'Is Google Making Us Stupid?',creator:'Nicholas Carr',format:'Article',by:'Atlantic|Carr',url:'https://www.theatlantic.com/magazine/archive/2008/07/is-google-making-us-stupid/306868/'},
 {title:'The Really Big One',creator:'Kathryn Schulz',format:'Article',by:'New Yorker|Schulz',url:'https://www.newyorker.com/magazine/2015/07/20/the-really-big-one'},
 {title:'Dune',creator:'Denis Villeneuve',format:'Movie',by:'Villeneuve',not:'Lynch'},
];
export type ArtResult={title:string;format:string;ok:boolean;wrong:boolean;cover:boolean;found?:Pick<Candidate,'title'|'creator'|'format'|'year'|'url'|'image'|'from'>;ms:number};
export async function runArtCheck(cases=ART_CASES):Promise<{hits:number;covers:number;wrong:number;total:number;results:ArtResult[]}>{
 const results=await Promise.all(cases.map(async c=>{
  const started=Date.now();const f=await resolveWork(c).catch(()=>null);
  const names=f?[f.creator,...(f.alt||[]),f.url].join(' | '):'';
  const wrong=Boolean(f&&(!new RegExp(c.by,'i').test(names)||(c.not&&new RegExp(c.not,'i').test(names))));
  return {title:c.title,format:c.format,ok:Boolean(f)&&!wrong,wrong,cover:Boolean(f?.image),found:f?{title:f.title,creator:f.creator,format:f.format,year:f.year,url:f.url,image:f.image,from:f.from}:undefined,ms:Date.now()-started};
 }));
 return {hits:results.filter(r=>r.ok).length,covers:results.filter(r=>r.ok&&r.cover).length,wrong:results.filter(r=>r.wrong).length,total:results.length,results};
}
export const SEARCH_CASES=['the emerald mile','dune','jaws','severance','rumours fleetwood mac','ten thousand years 99% invisible','perfect days','damnation','the daily 7 states 1 river','kind of blue'];
export async function runSearchCheck(queries=SEARCH_CASES){
 return Promise.all(queries.map(async q=>{const started=Date.now();const found=await searchCatalog(q).catch(()=>[]);return {q,ms:Date.now()-started,top:found.map(c=>`${c.format}: ${c.title} — ${c.creator}${c.year?` (${c.year})`:''}${c.image?' [cover]':''} {${c.from}}`)}}));
}
