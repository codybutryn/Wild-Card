import fs from 'fs';
const src = fs.readFileSync('/root/.claude/uploads/c60ab99f-81dc-5f27-b057-3ccdc1870e86/3321074f-index.html','utf8');
const G = JSON.parse(src.split('\n').find(l=>l.startsWith('const GAMES = ')).replace(/^const GAMES = /,'').replace(/;\s*$/,''));
for (const id of process.argv.slice(2)) {
  const g = G.find(x=>x.id===id||x.name.toLowerCase()===id.toLowerCase());
  if(!g){ console.log('MISSING',id); continue; }
  console.log(`\n########## ${g.name} [${g.cat}] ${JSON.stringify(g.players)} ${JSON.stringify(g.time)} age ${g.age} diff ${g.diff}`);
  console.log('needs:', g.needs);
  g.sections.forEach(s=>console.log(`  ‣ ${s.h}: ${s.b}`));
}
