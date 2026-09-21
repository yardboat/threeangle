// Pure logic for the triangle reveal: what is selected, what lights up, and the order of "Walk the triangle".
export type Focus={kind:'vertex';index:number}|{kind:'edge';index:number}|{kind:'center'};
// Side i joins corner i to corner i+1 (side 2 closes the loop back to a).
export const ends=(i:number):[number,number]=>[i,(i+1)%3];
export const STEPS:Focus[]=[{kind:'vertex',index:0},{kind:'edge',index:0},{kind:'vertex',index:1},{kind:'edge',index:1},{kind:'vertex',index:2},{kind:'edge',index:2},{kind:'center'}];
export const indexOf=(f:Focus)=>f.kind==='center'?0:f.index;
export const sameFocus=(a:Focus|null,b:Focus|null)=>Boolean(a&&b&&a.kind===b.kind&&indexOf(a)===indexOf(b));
export const stepOf=(f:Focus|null)=>f?STEPS.findIndex(s=>sameFocus(s,f)):-1;
// What lights up for a given focus: the corners and sides it touches.
export function lightFor(f:Focus|null){
 const corners=new Set<number>(),sides=new Set<number>();
 if(!f)return {corners,sides};
 if(f.kind==='vertex'){corners.add(f.index);sides.add(f.index);sides.add((f.index+2)%3);}
 else if(f.kind==='edge'){ends(f.index).forEach(c=>corners.add(c));sides.add(f.index);}
 else{[0,1,2].forEach(i=>{corners.add(i);sides.add(i);});}
 return {corners,sides};
}

