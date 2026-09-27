// Which part of the triangle drawing is in focus: a corner, a side, or the centre.
export type Focus={kind:'vertex';index:number}|{kind:'edge';index:number}|{kind:'center'};
