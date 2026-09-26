// Archival footage for the hall: public-domain U.S. government films (FedFlix, via destockd.com / archive.org).
// Each clip is a short black-and-white excerpt, re-encoded small and silent. See docs/gilded-hall-v2.md for sources.
// `src` has no extension: each clip ships as .webm (VP9) and .mp4 (H.264), and the browser gets what it plays.
export type Clip={src:string;w:number;h:number;subject:string};
export const clips:Clip[]=[];
// Where the gallery's projector lands, in painting space (x0, y0, x1, y1) of gallery.webp: the far arch.
export const PROJECTION:[number,number,number,number]=[.38,.22,.62,.62];
