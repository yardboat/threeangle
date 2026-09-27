import test from 'node:test';
import assert from 'node:assert/strict';
import {titleFit,creatorFits,wikiFormat,signCandidate,readCandidate,type Candidate} from '../lib/catalog';
import {proxiable,imgSrc} from '../lib/images';
const work=(o:Partial<Candidate>):Candidate=>({title:'',creator:'',format:'Movie',year:'',description:'',url:'https://example.org/w',from:'test',...o});
test('a title must fit both ways, so a longer lookalike is not the work',()=>{
 assert.ok(titleFit('Jaws','Surviving Jaws')<.75);
 assert.equal(titleFit('Jaws','Jaws'),1);
 assert.equal(titleFit('Severance','Severance, Season 1'),1);
 assert.equal(titleFit('The Emerald Mile','The Emerald Mile: The Epic Story of the Fastest Ride in History'),1);
 assert.ok(titleFit('Red Rising','Red Rising: Sons of Ares')>=.75);
 assert.ok(titleFit('Mission: Impossible','Mission: Impossible – Fallout')<.75);
 assert.equal(titleFit('Won’t You Be My Neighbor?','Won\'t You Be My Neighbor?'),1);
});
test('a different creator means a different work with the same name',()=>{
 assert.equal(creatorFits('Travis Rummel / Ben Knight',work({title:'Damnation',creator:'Béla Tarr'})),false);
 assert.equal(creatorFits('Béla Tarr',work({title:'Damnation',creator:'Bela Tarr'})),true);
 assert.equal(creatorFits('HBO',work({creator:'David Simon',alt:['HBO']})),true);
 assert.equal(creatorFits('',work({creator:'Anyone'})),true);
});
test('Wikipedia descriptions map to formats, and people or songs are skipped',()=>{
 assert.equal(wikiFormat('1975 film by Steven Spielberg'),'Movie');
 assert.equal(wikiFormat('2014 documentary film'),'Documentary');
 assert.equal(wikiFormat('American television series'),'Show');
 assert.equal(wikiFormat('1977 studio album by Fleetwood Mac'),'Album');
 assert.equal(wikiFormat('1965 novel by Frank Herbert'),'Book');
 assert.equal(wikiFormat('American novelist (1920–1986)'),null);
 assert.equal(wikiFormat('1977 single by Fleetwood Mac'),null);
});
test('a confirmed work is exactly what the search returned: tokens are signed',()=>{
 const c=work({title:'Jaws',creator:'Steven Spielberg',year:'1975',image:'https://image.tmdb.org/t/p/w500/x.jpg'});
 const token=signCandidate(c);assert.equal(readCandidate(token)?.title,'Jaws');
 const [body,sig]=token.split('.');const forged=Buffer.from(JSON.stringify({...JSON.parse(Buffer.from(body,'base64url').toString()),url:'https://evil.example/'})).toString('base64url');
 assert.equal(readCandidate(forged+'.'+sig),null);assert.equal(readCandidate('nonsense'),null);
});
test('only catalog image hosts go through the proxy',()=>{
 assert.equal(proxiable('https://image.tmdb.org/t/p/w500/x.jpg'),true);
 assert.equal(proxiable('https://is1-ssl.mzstatic.com/image/x.jpg'),true);
 assert.equal(proxiable('https://evil.example/x.jpg'),false);
 assert.equal(proxiable('http://image.tmdb.org/x.jpg'),false);
 assert.equal(imgSrc('https://evil.example/x.jpg'),'https://evil.example/x.jpg');
 assert.match(imgSrc('https://covers.openlibrary.org/b/id/1-L.jpg'),/^\/api\/img\?u=/);
});
