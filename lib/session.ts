import {randomBytes} from 'node:crypto';
const COOKIE='threeangle_session';
export function sessionIdentity(request:Request):string|null {
 const value=request.headers.get('cookie')?.split(';').map(v=>v.trim()).find(v=>v.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
 return value&&/^[a-f0-9]{64}$/.test(value)?value:null;
}
export function ensureSession(request:Request,response:Response):Response {
 if(!sessionIdentity(request)) {
  const secure=new URL(request.url).protocol==='https:'?'; Secure':'';
  response.headers.append('Set-Cookie',`${COOKIE}=${randomBytes(32).toString('hex')}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${secure}`);
 }
 return response;
}
