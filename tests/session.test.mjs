import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const code=ts.transpileModule(readFileSync('lib/session.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText;
const {sessionIdentity,ensureSession}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
test('session uses an unpredictable private cookie and ignores spoofed host identity headers',()=>{
 const request=new Request('https://threeangle.test',{headers:{'oai-authenticated-user-id':'victim'}});
 assert.equal(sessionIdentity(request),null);
 const response=ensureSession(request,new Response());const cookie=response.headers.get('set-cookie');
 assert.match(cookie,/threeangle_session=[a-f0-9]{64};/);assert.match(cookie,/HttpOnly/);assert.match(cookie,/Secure/);assert.match(cookie,/SameSite=Lax/);
 const next=new Request(request,{headers:{cookie:cookie.split(';')[0]}});assert.equal(sessionIdentity(next).length,64);
 assert.equal(ensureSession(next,new Response()).headers.get('set-cookie'),null);
 assert.equal(sessionIdentity(new Request(request,{headers:{cookie:'threeangle_session=anything'}})),null);
});
