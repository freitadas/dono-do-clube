"use strict";

const FC26_URL = "https://raw.githubusercontent.com/ismailoksuz/EAFC26-DataHub/main/data/players.csv";
const META_KEY = "v67_fc26_universe_20261013";

function clamp(n,a,b){ return Math.max(a,Math.min(b,n)); }
function normalize(v){
  return String(v||"")
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .toLowerCase().trim();
}
function normalizeClub(v){
  return normalize(v)
    .replace(/\([^)]*\)\s*$/g,"")
    .replace(/\b(football club|futbol club|futebol clube|club de futbol|fc|cf|afc|sc|ac)\b/g," ")
    .replace(/[^a-z0-9]+/g," ")
    .replace(/\s+/g," ")
    .trim();
}
function slug(v){
  return normalize(v).replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,100);
}
function parseCsvLine(line){
  const out=[]; let cur=""; let quoted=false;
  for(let i=0;i<line.length;i++){
    const ch=line[i];
    if(ch==='"'){
      if(quoted && line[i+1]==='"'){cur+='"';i++;}
      else quoted=!quoted;
    }else if(ch===',' && !quoted){out.push(cur);cur="";}
    else cur+=ch;
  }
  out.push(cur);
  return out;
}
function toNumber(v,fallback=0){
  const cleaned=String(v??"").replace(/[^0-9.\-]/g,"");
  if(!cleaned)return fallback;
  const n=Number(cleaned);
  return Number.isFinite(n)?n:fallback;
}
function roleInfo(raw){
  const p=String(raw||"").split(",")[0].trim().toUpperCase();
  if(p==="GK")return {position:"GK",role:"GK"};
  if(["CB","LB","RB","LWB","RWB"].includes(p))return {position:"DEF",role:p==="LWB"?"LB":p==="RWB"?"RB":p};
  if(["CDM","CM","CAM","LM","RM"].includes(p))return {position:"MID",role:p};
  if(["LW","RW","ST","CF"].includes(p))return {position:"ATT",role:p==="CF"?"ST":p};
  return {position:"MID",role:"CM"};
}
function divisionForRating(r){
  r=Number(r||60);
  if(r>=74)return "A";
  if(r>=68)return "B";
  if(r>=62)return "C";
  return "D";
}
function countryFromLeague(league){
  const s=normalize(league);
  const rules=[
    ["scottish premiership","SCO"],["cinch premiership","SCO"],
    ["austrian bundesliga","AUT"],["admiral bundesliga","AUT"],
    ["2 bundesliga","GER"],["3 liga","GER"],["bundesliga","GER"],
    ["premier league","ENG"],["championship","ENG"],["league one","ENG"],["league two","ENG"],["efl","ENG"],
    ["laliga","ESP"],["la liga","ESP"],["segunda division","ESP"],["segunda división","ESP"],
    ["serie a","ITA"],["serie b","ITA"],["serie c","ITA"],
    ["ligue 1","FRA"],["ligue 2","FRA"],
    ["liga portugal","POR"],["primeira liga","POR"],
    ["eredivisie","NED"],["eerste divisie","NED"],
    ["pro league","BEL"],["jupiler","BEL"],
    ["super lig","TUR"],["süper lig","TUR"],
    ["liga mx","MEX"],["ligamx","MEX"],
    ["major league soccer","USA"],["mls","USA"],
    ["j1 league","JPN"],["j league","JPN"],
    ["saudi pro league","KSA"],["rosn saudi","KSA"],
    ["primera division argentina","ARG"],["liga profesional","ARG"],["argentina","ARG"],
    ["uruguay","URU"],["colombia","COL"],["liga betplay","COL"],
    ["swiss super league","SUI"],["super league suisse","SUI"],
    ["superliga","DEN"],["danish","DEN"],
    ["eliteserien","NOR"],["allsvenskan","SWE"],["ekstraklasa","POL"],
    ["czech liga","CZE"],["chance liga","CZE"],["hnl","CRO"],["croatian","CRO"],
    ["super league greece","GRE"],["greek","GRE"],
    ["chile","CHI"],["ecuador","ECU"],["peru","PER"]
  ];
  for(const [needle,code] of rules)if(s.includes(normalize(needle)))return code;
  return null;
}
function nationalityCode(name){
  const s=normalize(name);
  const map={
    brazil:"BR",brasil:"BR",england:"ENG",english:"ENG",spain:"ESP",spanish:"ESP",italy:"ITA",italian:"ITA",
    germany:"GER",german:"GER",france:"FRA",french:"FRA",portugal:"POR",portuguese:"POR",argentina:"ARG",argentine:"ARG",
    netherlands:"NED",dutch:"NED",belgium:"BEL",belgian:"BEL",turkey:"TUR",turkiye:"TUR",scotland:"SCO",mexico:"MEX",
    "united states":"USA",usa:"USA",japan:"JPN","saudi arabia":"KSA",uruguay:"URU",colombia:"COL",austria:"AUT",
    switzerland:"SUI",denmark:"DEN",norway:"NOR",sweden:"SWE",poland:"POL","czech republic":"CZE",czechia:"CZE",
    croatia:"CRO",greece:"GRE",chile:"CHI",ecuador:"ECU",peru:"PER"
  };
  return map[s]||String(name||"").slice(0,3).toUpperCase();
}
function confed(code){
  if(["ENG","ESP","ITA","GER","FRA","POR","NED","BEL","TUR","SCO","AUT","SUI","DEN","NOR","SWE","POL","CZE","CRO","GRE"].includes(code))return "UEFA";
  if(["BR","ARG","URU","COL","CHI","ECU","PER"].includes(code))return "CONMEBOL";
  if(["MEX","USA"].includes(code))return "CONCACAF";
  if(["JPN","KSA"].includes(code))return "AFC";
  return null;
}
function attrs(row,idx,overall,position){
  const g=k=>idx[k]>=0?toNumber(row[idx[k]],overall):overall;
  if(position==="GK"){
    const diving=g("goalkeeping_diving"), reflexes=g("goalkeeping_reflexes"), positioning=g("goalkeeping_positioning"), kicking=g("goalkeeping_kicking");
    return {pace:clamp(g("goalkeeping_speed")||Math.round(overall*.55),20,99),shooting:clamp(Math.round(kicking*.55),20,99),passing:clamp(kicking,20,99),defending:clamp(Math.round((diving+reflexes+positioning)/3),20,99)};
  }
  return {
    pace:clamp(g("pace"),20,99),shooting:clamp(g("shooting"),20,99),passing:clamp(g("passing"),20,99),defending:clamp(g("defending"),20,99)
  };
}
async function fetchText(url){
  const ctrl=new AbortController();
  const timer=setTimeout(()=>ctrl.abort(),45000);
  try{
    const r=await fetch(url,{signal:ctrl.signal,headers:{"user-agent":"DonoDoClube-v67"}});
    if(!r.ok)throw new Error(`HTTP ${r.status}`);
    return await r.text();
  }finally{clearTimeout(timer)}
}

async function install({pool,q,tx,salaryForRating}){
  await pool.query(`
    ALTER TABLE players ADD COLUMN IF NOT EXISTS external_source TEXT;
    ALTER TABLE players ADD COLUMN IF NOT EXISTS external_player_id TEXT;
    ALTER TABLE clubs ADD COLUMN IF NOT EXISTS external_source TEXT;
    ALTER TABLE clubs ADD COLUMN IF NOT EXISTS external_club_name TEXT;
    CREATE INDEX IF NOT EXISTS idx_players_market_search ON players(rating,age,potential);
    CREATE INDEX IF NOT EXISTS idx_players_source_club ON players(club_id);
    CREATE INDEX IF NOT EXISTS idx_clubs_external_name ON clubs(external_club_name);
  `);

  const done=await q(`SELECT value FROM app_meta WHERE key=$1`,[META_KEY]);
  if(done.rowCount)return {skipped:true,meta:done.rows[0].value};
  if(String(process.env.FC26_SYNC||"1")==="0")return {skipped:true,disabled:true};

  let csv;
  try{csv=await fetchText(FC26_URL)}catch(err){
    console.warn("v67: sincronização FC26 indisponível; mantendo base local.",err.message);
    return {ok:false,error:err.message};
  }
  const lines=csv.split(/\r?\n/).filter(Boolean);
  if(lines.length<1000)throw new Error("Base FC26 recebida parece incompleta.");
  const header=parseCsvLine(lines[0]);
  const idx={}; header.forEach((h,i)=>idx[h.trim()]=i);
  const required=["short_name","player_positions","club_name","league_name","nationality_name","age","overall","potential","value_eur"];
  for(const k of required)if(idx[k]===undefined)throw new Error(`Coluna FC26 ausente: ${k}`);
  const col=k=>idx[k]===undefined?-1:idx[k];
  const ci={}; for(const k of [...required,"player_id","long_name","wage_eur","pace","shooting","passing","defending","goalkeeping_diving","goalkeeping_reflexes","goalkeeping_positioning","goalkeeping_kicking","goalkeeping_speed"])ci[k]=col(k);

  const existing=(await q(`SELECT id,name,country_code,base_rating,club_kind,national_seed_division FROM clubs WHERE is_ai=TRUE AND club_kind='national'`)).rows;
  const clubMap=new Map();
  const clubCountryMap=new Map();
  for(const c of existing){
    const key=normalizeClub(c.name);
    if(key&&!clubMap.has(key))clubMap.set(key,c);
    if(key&&c.country_code)clubCountryMap.set(`${c.country_code}|${key}`,c);
  }

  const teamAgg=new Map();
  const parsed=[];
  for(let i=1;i<lines.length;i++){
    const row=parseCsvLine(lines[i]);
    const clubName=String(row[ci.club_name]||"").trim();
    const playerName=String(row[ci.short_name]||row[ci.long_name]||"").trim();
    if(!playerName)continue;
    const overall=clamp(toNumber(row[ci.overall],60),40,99);
    const potential=clamp(toNumber(row[ci.potential],overall),overall,99);
    const age=clamp(toNumber(row[ci.age],24),15,50);
    const info=roleInfo(row[ci.player_positions]);
    const a=attrs(row,ci,overall,info.position);
    const valueEur=Math.max(0,toNumber(row[ci.value_eur],0));
    const leagueName=String(row[ci.league_name]||"").trim();
    const nationality=String(row[ci.nationality_name]||"").trim();
    const playerId=String(ci.player_id>=0?row[ci.player_id]:"").trim()||slug(`${playerName}-${age}-${clubName}`);
    const rec={playerId,playerName,clubName,leagueName,nationality,overall,potential,age,...info,...a,
      price:clamp(Math.round(valueEur/1000),500,900000)};
    parsed.push(rec);
    if(clubName){
      const key=normalizeClub(clubName);
      const agg=teamAgg.get(key)||{name:clubName,league:leagueName,sum:0,count:0,players:[]};
      agg.sum+=overall;agg.count++;agg.players.push(rec);teamAgg.set(key,agg);
    }
  }

  const mappedClubIds=new Map();
  await tx(async client=>{
    for(const [key,agg] of teamAgg){
      const inferredCode=countryFromLeague(agg.league);
      let club=(inferredCode&&clubCountryMap.get(`${inferredCode}|${key}`))||clubMap.get(key);
      const avg=Math.round(agg.sum/Math.max(1,agg.count));
      const code=(club&&club.country_code)||inferredCode;
      if(!club){
        const validCode=code||"GLOBAL";
        const isNational=true;
        let name=agg.name;
        const duplicate=(await client.query(`SELECT id FROM clubs WHERE is_ai=TRUE AND name=$1 LIMIT 1`,[name])).rows[0];
        if(duplicate)name=`${agg.name} (${validCode})`;
        club=(await client.query(`
          INSERT INTO clubs(name,is_ai,country_code,confederation_code,club_kind,national_seed_division,base_rating,team_rating,coins,primary_color,secondary_color,external_source,external_club_name)
          VALUES($1,TRUE,$2,$3,$4,$5,$6,$6,0,'#1f6b46','#f5f7f6','FC26',$7)
          ON CONFLICT(name) WHERE is_ai=TRUE DO UPDATE SET external_source='FC26',external_club_name=EXCLUDED.external_club_name,base_rating=GREATEST(clubs.base_rating,EXCLUDED.base_rating),team_rating=GREATEST(clubs.team_rating,EXCLUDED.team_rating)
          RETURNING id,name,country_code,base_rating
        `,[name,validCode,confed(code),"national",divisionForRating(avg),avg,agg.name])).rows[0];
        clubMap.set(key,club);
        if(validCode)clubCountryMap.set(`${validCode}|${key}`,club);
      }else{
        await client.query(`UPDATE clubs SET external_source='FC26',external_club_name=$2,base_rating=$3,team_rating=$3 WHERE id=$1`,[club.id,agg.name,avg]);
      }
      mappedClubIds.set(key,Number(club.id));
      // remove apenas o elenco gerado localmente; carreiras do usuário nunca são tocadas.
      await client.query(`UPDATE players SET club_id=NULL,is_starter=FALSE,market_template_id=COALESCE(market_template_id,-id) WHERE club_id=$1 AND real_player_key IS NULL AND market_template_id IS NULL`,[club.id]);
    }

    // Remove o antigo clube artificial de mercado e seus jogadores.
    await client.query(`UPDATE players SET club_id=NULL,is_starter=FALSE,market_template_id=COALESCE(market_template_id,-id) WHERE club_id IN (SELECT id FROM clubs WHERE is_ai=TRUE AND (club_kind='market' OR name='Mercado Mundial'))`);

    const batch=[];
    const flush=async()=>{
      if(!batch.length)return;
      const values=[]; const params=[]; let n=1;
      for(const p of batch){
        values.push(`($${n++},$${n++},$${n++},$${n++},$${n++},$${n++},$${n++},$${n++},$${n++},$${n++},$${n++},$${n++},$${n++},$${n++},$${n++},$${n++},$${n++},$${n++},$${n++},$${n++},$${n++},$${n++},$${n++},$${n++})`);
        params.push(p.clubId,p.playerName,p.position,p.role,p.overall,p.pace,p.shooting,p.passing,p.defending,p.price,p.isStarter,p.age,
          salaryForRating(p.overall),Math.max(1,Math.min(5,Math.round((33-p.age)/6)+2)),100,76,p.potential,p.nationalityCode,true,p.key,"FC26",p.playerId,"ROTATION",78);
      }
      await client.query(`
        INSERT INTO players(
          club_id,name,position,role,rating,pace,shooting,passing,defending,price,is_starter,age,
          salary,contract_seasons,fitness,morale,potential,nationality_code,is_real_name,real_player_key,external_source,external_player_id,squad_status,happiness
        ) VALUES ${values.join(",")}
        ON CONFLICT(real_player_key) DO UPDATE SET
          club_id=EXCLUDED.club_id,name=EXCLUDED.name,position=EXCLUDED.position,role=EXCLUDED.role,rating=EXCLUDED.rating,
          pace=EXCLUDED.pace,shooting=EXCLUDED.shooting,passing=EXCLUDED.passing,defending=EXCLUDED.defending,price=EXCLUDED.price,
          age=EXCLUDED.age,salary=EXCLUDED.salary,potential=EXCLUDED.potential,nationality_code=EXCLUDED.nationality_code,is_real_name=TRUE,
          external_source='FC26',external_player_id=EXCLUDED.external_player_id
      `,params);
      batch.length=0;
    };

    const starterCounts=new Map();
    for(const p of parsed){
      const clubId=p.clubName?mappedClubIds.get(normalizeClub(p.clubName)):null;
      const roleCountKey=`${clubId||0}|${p.position}`;
      const maxStarter={GK:1,DEF:4,MID:3,ATT:3}[p.position]||0;
      const used=starterCounts.get(roleCountKey)||0;
      const isStarter=Boolean(clubId)&&used<maxStarter;
      if(isStarter)starterCounts.set(roleCountKey,used+1);
      batch.push({...p,clubId:clubId||null,isStarter,nationalityCode:nationalityCode(p.nationality),key:`fc26:${p.playerId}`});
      if(batch.length>=350)await flush();
    }
    await flush();

    await client.query(`
      UPDATE clubs c SET team_rating=x.avg_rating,base_rating=x.avg_rating
      FROM (
        SELECT club_id,ROUND(AVG(rating))::int avg_rating FROM players WHERE club_id IS NOT NULL AND external_source='FC26' GROUP BY club_id
      ) x WHERE c.id=x.club_id AND c.is_ai=TRUE
    `);
    await client.query(`INSERT INTO app_meta(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value`,[
      META_KEY,JSON.stringify({source:"EAFC26-DataHub/SoFIFA",players:parsed.length,clubs:mappedClubIds.size,syncedAt:new Date().toISOString()})
    ]);
  });

  console.log(`v67: FC26 sincronizado: ${parsed.length} jogadores em ${mappedClubIds.size} clubes.`);
  return {ok:true,players:parsed.length,clubs:mappedClubIds.size};
}

module.exports={install,FC26_URL,META_KEY,parseCsvLine,normalizeClub,roleInfo,countryFromLeague};
