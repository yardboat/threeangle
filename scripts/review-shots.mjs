// Visual review of the /v2 journey with mocked APIs. Not part of the app build.
// Usage (dev server on :3000): PLAYWRIGHT_PATH=<playwright module> node --import tsx scripts/review-shots.mjs <outDir> [desktop|mobile|all] [screens...]
// Shots use reduced motion so every frame is the settled state; MOTION=1 keeps animation on.
import {createRequire} from 'module';
import fs from 'fs';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const [out='/tmp/shots',which='all',...only]=process.argv.slice(2);
const motion=process.env.MOTION==='1';
fs.mkdirSync(out,{recursive:true});
const {topics}=await import('../lib/stories.ts');
const topic=topics[0];
const seed={title:topic.works[0].title,creator:topic.works[0].creator,format:topic.works[0].format,year:'2013',description:'A wooden boat, a record attempt, and the Grand Canyon in flood. Kevin Fedarko’s account of the fastest ride ever taken down the Colorado.',source:0,facts:[{text:'Fedarko rode along as a journalist before becoming a boatman himself.',source:0}]};
const lookup={id:'11111111-1111-1111-1111-111111111111',matches:[seed,{...seed,title:'The Emerald Mile (Audiobook)',format:'Podcast episode',year:'2014'}],sources:[{title:'Simon & Schuster',url:'https://www.simonandschuster.com/'}],searchHtml:[]};
const base='http://localhost:3000';
const sizes={desktop:{width:1440,height:900},mobile:{width:390,height:844}};
const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const want=s=>!only.length||only.includes(s);
for(const [name,viewport] of Object.entries(sizes)){
 if(which!=='all'&&which!==name)continue;
 const ctx=await browser.newContext({viewport,deviceScaleFactor:1,reducedMotion:motion?'no-preference':'reduce'});
 const page=await ctx.newPage();
 page.on('pageerror',e=>console.log(name,'PAGEERROR',e.message));
 page.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource/.test(m.text()))console.log(name,'CONSOLE',m.text());});
 let hold=false;
 await page.route('**/api/corner*',async r=>{const q=r.request();
  if(q.method()==='GET')return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ready:true,signedIn:true})});
  const b=q.postDataJSON();
  if(b.action==='lookup')return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(lookup)});
  if(hold)return; // leave the generation running for the thinking screen
  return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({topic})});
 });
 await page.route('**/api/crate*',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({items:[]})}));
 const shot=async(id,wait=1600)=>{await page.waitForTimeout(wait);await page.screenshot({path:`${out}/${name}-${id}.png`});console.log('shot',name,id);};
 if(want('welcome')||want('find')||want('matches')||want('confirm')||want('thinking')){
  await page.goto(base+'/v2',{waitUntil:'networkidle'});
  if(want('welcome'))await shot('1-welcome',2600);
  await page.getByRole('button',{name:'I have a title'}).click();
  if(want('find'))await shot('2-find',2600);
  await page.locator('#hall-title').fill('The Emerald Mile');await page.getByLabel('Find my title').click();
  if(want('matches'))await shot('3-matches');
  await page.getByText('This is the one').first().click();
  if(want('confirm'))await shot('4-confirm',2600);
  if(want('thinking')){hold=true;await page.getByRole('button',{name:/Build my threeangle/}).click();await shot('5-thinking',3200);hold=false;}
 }
 if(want('reveal')){
  await page.goto(base+'/v2?triangle='+topic.id,{waitUntil:'networkidle'});
  await shot('6-reveal',3200);
  const pips=page.locator('.rv-pip');
  for(const [i,label] of [[0,'a'],[1,'ab'],[3,'bc'],[6,'center']]){await pips.nth(i).click();await shot('7-reveal-'+label,2200);}
  await page.evaluate(()=>window.scrollTo(0,window.innerHeight*1.05));await shot('8-below',1600);
  await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));await shot('9-end',1400);
 }
 await ctx.close();
}
await browser.close();
