// Resolve ~40 known works across every format and report the hit rate and any wrong matches.
//   npx tsx scripts/art-check.ts            (add TMDB_API_KEY=... for TMDB film and TV)
// Goal: 100% hits, 0 wrong. The same check runs on the deploy at /api/admin/check?suite=art&token=ADMIN_TOKEN.
import {runArtCheck,runSearchCheck} from '../lib/art-cases';
const art=await runArtCheck();
for(const r of art.results)console.log(`${r.wrong?'WRONG':r.ok?(r.cover?'ok   ':'nocov'):'MISS '} ${r.format.padEnd(16)} ${r.title.slice(0,44).padEnd(45)} ${r.found?`${r.found.title} — ${r.found.creator} {${r.found.from}}`:''}`);
console.log(`\n${art.hits}/${art.total} found, ${art.covers} with covers, ${art.wrong} wrong`);
if(process.argv.includes('--search'))for(const s of await runSearchCheck())console.log(`\n${s.q} (${s.ms} ms)\n  ${s.top.join('\n  ')}`);
process.exit(art.wrong?1:0);
