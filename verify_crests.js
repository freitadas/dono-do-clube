'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const vm=require('node:vm');
const root=__dirname;
const RealCrests=require('./real_crests.js');
const manifest=require('./real_crests_manifest.json');
const read=n=>fs.readFileSync(path.join(root,n),'utf8');
async function run(){
  const seeds=new Map(['clubs.json','international_clubs.json','global_clubs.json','state_clubs.json'].flatMap(f=>JSON.parse(read(f))).map(x=>[x.name,x]));
  const fictional=new Set(manifest.fictional);
  const unique=new Map();
  assert.equal(manifest.unavailable.length,0);
  for(const [name,club] of seeds){
    if(fictional.has(name))assert.equal(RealCrests.club(club),null,`Fictional club given a real crest: ${name}`);
    else assert.ok(RealCrests.club(club)?.src,`Missing real club crest: ${name}`);
  }
  for(const entry of [...manifest.club_records,...manifest.national_teams]){
    assert.ok(entry.source,`Missing provenance: ${entry.name}`);
    assert.match(entry.src,/^\/assets\/crests\/[0-9a-f]{20}\.png$/);
    const data=fs.readFileSync(path.join(root,entry.src.slice(1)));
    assert.equal(data.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
    assert.equal(crypto.createHash('sha256').update(data).digest('hex'),entry.sha256);
    unique.set(entry.src,true);
  }
  for(const [code,n] of Object.entries(JSON.parse(read('countries.json')))){
    assert.ok(RealCrests.nation(code)?.src,`Missing national emblem: ${code}`);
    assert.equal(RealCrests.nation(n.name).src,RealCrests.nation(code).src);
  }
  assert.notEqual(RealCrests.club('Botafogo').src,RealCrests.club('Botafogo-PB').src);
  assert.notEqual(RealCrests.club('São Paulo').src,RealCrests.club('São Paulo-AP').src);
  assert.notEqual(RealCrests.club('Rio Branco-AC').src,RealCrests.club('Rio Branco-ES').src);
  const oldSVG='<svg xmlns="http://www.w3.org/2000/svg"><path d="M60 4 108 20v48"/><text>FC</text></svg>';
  const old='data:image/svg+xml;base64,'+Buffer.from(oldSVG).toString('base64');
  const oldURI='data:image/svg+xml;charset=UTF-8,'+encodeURIComponent(oldSVG);
  assert.ok(RealCrests.isGenerated(old));assert.ok(RealCrests.isGenerated(oldURI));
  const personal='data:image/png;base64,iVBORw0KGgo=';
  assert.equal(RealCrests.source({name:'Flamengo',crest_data:old,is_ai:false}),RealCrests.club('Flamengo').src);
  assert.equal(RealCrests.source({name:'Flamengo',crest_data:personal,is_ai:false}),RealCrests.club('Flamengo').src);
  assert.equal(RealCrests.source({name:'Meu Clube',crest_data:personal}),personal);
  assert.equal(RealCrests.source({name:'English D09 (ENG)',crest_data:old}),null);
  // Execute the actual seed/migration with an existing-save fixture.
  const server=read('server.js');
  const rows=[
    {id:1,name:'Flamengo',is_ai:false,crest_data:old},
    {id:2,name:'English D09 (ENG)',is_ai:true,crest_data:oldURI},
    {id:3,name:'Meu Clube',is_ai:false,crest_data:personal},
    {id:4,name:'Palmeiras',is_ai:true,crest_data:null},
  ];const updates=[];
  const client={query:async(sql,params)=>{
    if(sql.includes('SELECT id,name,is_ai,crest_data FROM clubs'))return {rows};
    if(sql.includes('UPDATE clubs SET crest_data=$2 WHERE id=$1'))updates.push(params);
    return {rows:[],rowCount:0};
  }};
  const seedContext=vm.createContext({RealCrests,CLUB_SEED:[seeds.get('Flamengo')],confederationForCountry:()=>null,tx:async fn=>fn(client),ensureFriendCode:async()=>{}});
  const automatic=server.slice(server.indexOf('function realClubCrest('),server.indexOf('function canonicalStateClubNames'));
  const seed=server.slice(server.indexOf('async function seedClubs('),server.indexOf('async function seedRealMarketPlayers('));
  await vm.runInContext(automatic+'\n'+seed+'\nseedClubs();',seedContext);
  const byId=new Map(updates);
  assert.equal(byId.get(1),RealCrests.club('Flamengo').src);
  assert.equal(byId.get(2),null);
  assert.equal(byId.has(3),false);
  assert.equal(byId.get(4),RealCrests.club('Palmeiras').src);
  assert.match(server,/app\.use\("\/assets\/crests",express\.static/);
  assert.ok(read('index.html').indexOf('/real_crests.js')<read('index.html').indexOf('/app.js'));
  // Execute the real frontend renderers and representative competition views.
  const appSource=read('app.js').replace(/\nbootstrap\(\);/,'\n');
  const context=vm.createContext({RealCrests,console,document:{querySelector:()=>({}),addEventListener:()=>{}},window:{addEventListener:()=>{}},setTimeout,clearTimeout});
  vm.runInContext(appSource,context);
  for(const entry of manifest.club_records){
    const html=vm.runInContext('crestHtml('+JSON.stringify({name:entry.name,crest_data:old,is_ai:true})+',"tiny")',context);
    assert.ok(html.includes(entry.src),`Wrong frontend crest: ${entry.name}`);
    assert.ok(!html.includes('data:image/svg'));
  }
  for(const entry of manifest.national_teams){
    const html=vm.runInContext('nationalCrestHtml('+JSON.stringify(entry.code)+')',context);
    assert.ok(html.includes(entry.src));
  }
  const views=vm.runInContext(`state.nationalTeam={job:null,offers:[{code:'BR',name:'Brasil',rating:86,confed:'CONMEBOL',target:'Final'}]};
    const offerView=nationalTeamView();
    state.nationalTeam={job:{nation_code:'ARG',nationName:'Argentina',status:'active',confidence:80,rating:86,stage:'GROUP'},fixtures:[{home:'BR',away:'ARG',homeName:'Brasil',awayName:'Argentina'}],table:[{clubId:'BR',name:'Brasil',points:3,gd:1}],squad:[],history:[]};
    const activeView=nationalTeamView();
    const knockout=worldKnockoutList({fixtures:[{stage:'FINAL',home:1,away:2,homeClub:{name:'Flamengo'},awayClub:{name:'Palmeiras'},played:false}]});
    [offerView,activeView,knockout];`,context);
  assert.ok(views[0].includes(RealCrests.nation('BR').src));
  assert.ok(views[1].includes(RealCrests.nation('ARG').src));
  assert.ok(views[1].includes(RealCrests.nation('BR').src));
  assert.ok(views[2].includes(RealCrests.club('Flamengo').src));
  assert.ok(views[2].includes(RealCrests.club('Palmeiras').src));
  console.log(`PASS — ${manifest.club_records.length} club records, ${manifest.national_teams.length} national teams, ${unique.size} images; existing saves, homonyms, rendering and asset integrity.`);
}
run().catch(e=>{console.error(e);process.exitCode=1});
