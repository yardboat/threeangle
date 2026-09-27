// Covers come from a handful of catalog hosts. Those are served through our own /api/img proxy (long cache,
// no hotlink blocks, one origin); anything else, such as an article's share image, loads directly.
export const IMAGE_HOSTS=/(^|\.)(covers\.openlibrary\.org|archive\.org|image\.tmdb\.org|mzstatic\.com|books\.google\.com|googleusercontent\.com|upload\.wikimedia\.org|coverartarchive\.org)$/i;
export function proxiable(url:string){try{const u=new URL(url);return u.protocol==='https:'&&IMAGE_HOSTS.test(u.hostname)}catch{return false}}
export const imgSrc=(url:string)=>proxiable(url)?'/api/img?u='+encodeURIComponent(url):url;
