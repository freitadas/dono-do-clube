
const express = require("express");
const { Pool } = require("pg");
const crypto = require("crypto");
const path = require("path");
const CLUB_SEED = require("./clubs.json");
const STATE_DATA = require("./states.json");

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL não configurada.");
  process.exit(1);
}

const app = express();
const PORT = Number(process.env.PORT || 3000);
const SECRET = process.env.APP_SECRET || "dev-secret-change-me";
const COOKIE = "ddc_session";
const RESET_KEY = "v7_brasileirao_estaduais_reset_20260919";
const DIVS = ["A","B","C","D"];
const VALID_STATES = new Set(Object.keys(STATE_DATA.names));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000
});

app.disable("x-powered-by");
app.use(express.json({limit:"1mb"}));

async function q(sql, params=[]){ return pool.query(sql, params); }

async function tx(fn){
  const c=await pool.connect();
  try{
    await c.query("BEGIN");
    const out=await fn(c);
    await c.query("COMMIT");
    return out;
  }catch(e){
    await c.query("ROLLBACK");
    throw e;
  }finally{ c.release(); }
}

async function initDb(){
  await q(`
    CREATE TABLE IF NOT EXISTS users(
      id BIGSERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS clubs(
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      name TEXT UNIQUE NOT NULL,
      primary_color TEXT NOT NULL DEFAULT '#18864b',
      secondary_color TEXT NOT NULL DEFAULT '#f7fafc',
      crest_data TEXT,
      friend_code TEXT,
      state_code TEXT,
      country_code TEXT NOT NULL DEFAULT 'BR',
      club_kind TEXT NOT NULL DEFAULT 'user',
      national_seed_division TEXT,
      base_rating INTEGER NOT NULL DEFAULT 64,
      coins INTEGER NOT NULL DEFAULT 3500 CHECK(coins>=0),
      formation TEXT NOT NULL DEFAULT '4-3-3',
      team_rating INTEGER NOT NULL DEFAULT 64,
      is_ai BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS players(
      id BIGSERIAL PRIMARY KEY,
      club_id BIGINT REFERENCES clubs(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      position TEXT NOT NULL CHECK(position IN ('GK','DEF','MID','ATT')),
      rating INTEGER NOT NULL CHECK(rating BETWEEN 40 AND 99),
      pace INTEGER NOT NULL CHECK(pace BETWEEN 20 AND 99),
      shooting INTEGER NOT NULL CHECK(shooting BETWEEN 20 AND 99),
      passing INTEGER NOT NULL CHECK(passing BETWEEN 20 AND 99),
      defending INTEGER NOT NULL CHECK(defending BETWEEN 20 AND 99),
      price INTEGER NOT NULL CHECK(price>=0),
      is_starter BOOLEAN NOT NULL DEFAULT FALSE,
      age INTEGER NOT NULL DEFAULT 24,
      appearances INTEGER NOT NULL DEFAULT 0,
      goals INTEGER NOT NULL DEFAULT 0,
      assists INTEGER NOT NULL DEFAULT 0,
      yellow_cards INTEGER NOT NULL DEFAULT 0,
      red_cards INTEGER NOT NULL DEFAULT 0,
      clean_sheets INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS matches(
      id BIGSERIAL PRIMARY KEY,
      user_club_id BIGINT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
      opponent_club_id BIGINT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
      user_goals INTEGER NOT NULL,
      opponent_goals INTEGER NOT NULL,
      reward INTEGER NOT NULL DEFAULT 0,
      user_rating INTEGER NOT NULL,
      opponent_rating INTEGER NOT NULL,
      events JSONB NOT NULL DEFAULT '[]'::jsonb,
      match_type TEXT NOT NULL DEFAULT 'league',
      played_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS friendships(
      id BIGSERIAL PRIMARY KEY,
      club_a_id BIGINT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
      club_b_id BIGINT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(club_a_id,club_b_id),
      CHECK(club_a_id<club_b_id)
    );

    CREATE TABLE IF NOT EXISTS careers(
      owner_club_id BIGINT PRIMARY KEY REFERENCES clubs(id) ON DELETE CASCADE,
      season_no INTEGER NOT NULL DEFAULT 1,
      phase TEXT NOT NULL DEFAULT 'STATE',
      state_code TEXT NOT NULL,
      user_division TEXT NOT NULL DEFAULT 'D',
      current_round INTEGER NOT NULL DEFAULT 1,
      data JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS app_meta(
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_clubs_friend_code
      ON clubs(friend_code) WHERE friend_code IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_players_club ON players(club_id);
  `);

  for(const sql of [
    `ALTER TABLE clubs ADD COLUMN IF NOT EXISTS state_code TEXT`,
    `ALTER TABLE clubs ADD COLUMN IF NOT EXISTS country_code TEXT NOT NULL DEFAULT 'BR'`,
    `ALTER TABLE clubs ADD COLUMN IF NOT EXISTS club_kind TEXT NOT NULL DEFAULT 'user'`,
    `ALTER TABLE clubs ADD COLUMN IF NOT EXISTS national_seed_division TEXT`,
    `ALTER TABLE clubs ADD COLUMN IF NOT EXISTS base_rating INTEGER NOT NULL DEFAULT 64`
  ]) await q(sql);
}

const firstNames=["Caio","Davi","Lucas","Rafael","Bruno","Henrique","Matheus","Pedro","Gustavo","Felipe","André","Vitor","Diego","Gabriel","João","Thiago","Arthur","Murilo","Igor","Renan","Enzo","Samuel","Daniel","Leandro","Vinícius","Nicolas","Heitor","Bernardo","Yuri","Otávio","Mateo","Santiago","Emiliano","Joaquín","Facundo","Lautaro"];
const lastNames=["Almeida","Rocha","Ferreira","Souza","Lima","Costa","Mendes","Silva","Ribeiro","Gomes","Martins","Barbosa","Nunes","Teixeira","Moraes","Cardoso","Pires","Campos","Vieira","Freitas","Monteiro","Azevedo","Duarte","Rezende","González","Pereira","Rodríguez","Romero","Suárez","Acosta"];
const rand=(a,b)=>Math.floor(Math.random()*(b-a+1))+a;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const shuffle=arr=>{const a=[...arr];for(let i=a.length-1;i>0;i--){const j=rand(0,i);[a[i],a[j]]=[a[j],a[i]]}return a};
const randomName=()=>`${firstNames[rand(0,firstNames.length-1)]} ${lastNames[rand(0,lastNames.length-1)]}`;

function makeFriendCode(){return crypto.randomBytes(4).toString("hex").toUpperCase().slice(0,6)}

async function ensureFriendCode(client, clubId){
  const r=await client.query(`SELECT friend_code FROM clubs WHERE id=$1`,[clubId]);
  if(r.rows[0]?.friend_code) return r.rows[0].friend_code;
  for(let i=0;i<30;i++){
    const code=makeFriendCode();
    try{
      await client.query(`UPDATE clubs SET friend_code=$2 WHERE id=$1`,[clubId,code]);
      return code;
    }catch(e){ if(e.code!=="23505") throw e; }
  }
  throw new Error("Falha ao gerar código.");
}

async function seedClubs(){
  await tx(async c=>{
    for(const x of CLUB_SEED){
      await c.query(`
        INSERT INTO clubs(name,is_ai,state_code,country_code,club_kind,national_seed_division,base_rating,team_rating,coins,primary_color,secondary_color)
        VALUES($1,TRUE,$2,$3,$4,$5,$6,$6,0,$7,$8)
        ON CONFLICT(name) DO UPDATE SET
          is_ai=TRUE,
          state_code=EXCLUDED.state_code,
          country_code=EXCLUDED.country_code,
          club_kind=EXCLUDED.club_kind,
          national_seed_division=EXCLUDED.national_seed_division,
          base_rating=EXCLUDED.base_rating,
          primary_color=EXCLUDED.primary_color,
          secondary_color=EXCLUDED.secondary_color
      `,[x.name,x.state,x.country,x.kind,x.division,x.rating,x.primary,x.secondary]);
    }
    const missing=await c.query(`SELECT id FROM clubs WHERE friend_code IS NULL`);
    for(const r of missing.rows) await ensureFriendCode(c,r.id);
  });
}

async function oneTimeReset(){
  const done=await q(`SELECT 1 FROM app_meta WHERE key=$1`,[RESET_KEY]);
  if(done.rowCount) return;
  await tx(async c=>{
    await c.query(`DELETE FROM matches`);
    await c.query(`DELETE FROM careers`);
    await c.query(`DELETE FROM players`);
    await c.query(`
      UPDATE clubs SET
        coins=CASE WHEN is_ai THEN 0 ELSE 3500 END,
        formation='4-3-3',
        team_rating=CASE WHEN is_ai THEN base_rating ELSE 64 END,
        state_code=CASE WHEN is_ai THEN state_code ELSE NULL END
    `);
    await c.query(`INSERT INTO app_meta(key,value) VALUES($1,$2)`,[RESET_KEY,new Date().toISOString()]);
  });
}

function makePlayer(position,lo=61,hi=68){
  const rating=rand(lo,hi);
  const variance=()=>clamp(rating+rand(-7,7),25,95);
  let pace=variance(),shooting=variance(),passing=variance(),defending=variance();
  if(position==="GK"){shooting=clamp(rating-rand(22,30),20,55);defending=clamp(rating+rand(-2,6),40,95)}
  if(position==="DEF"){defending=clamp(rating+rand(0,6),40,95);shooting=clamp(rating-rand(8,15),20,85)}
  if(position==="MID") passing=clamp(rating+rand(1,6),40,95);
  if(position==="ATT"){shooting=clamp(rating+rand(1,6),40,95);defending=clamp(rating-rand(12,20),20,80)}
  const price=Math.round((rating*rating*.40+rand(0,350))/50)*50;
  return {name:randomName(),position,rating,pace,shooting,passing,defending,price,age:rand(18,31)};
}

async function createRoster(client, club, force=false){
  const count=await client.query(`SELECT COUNT(*)::int count FROM players WHERE club_id=$1`,[club.id]);
  if(!force && count.rows[0].count>=18) return;
  await client.query(`DELETE FROM players WHERE club_id=$1`,[club.id]);
  const base=club.is_ai?Number(club.base_rating||64):64;
  const lo=club.is_ai?Math.max(52,base-4):61;
  const hi=club.is_ai?Math.min(85,base+3):68;
  const plan=[["GK",2,1],["DEF",6,4],["MID",6,3],["ATT",4,3]];
  for(const [pos,n,starters] of plan){
    for(let i=0;i<n;i++){
      const p=makePlayer(pos,lo,hi);
      await client.query(`
        INSERT INTO players(club_id,name,position,rating,pace,shooting,passing,defending,price,is_starter,age)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      `,[club.id,p.name,p.position,p.rating,p.pace,p.shooting,p.passing,p.defending,p.price,i<starters,p.age]);
    }
  }
}

async function ensureRoster(clubId){
  await tx(async c=>{
    const club=(await c.query(`SELECT * FROM clubs WHERE id=$1`,[clubId])).rows[0];
    if(!club) throw new Error("Clube não encontrado.");
    await createRoster(c,club,false);
  });
}

async function ensureMarket(){
  const r=await q(`SELECT COUNT(*)::int count FROM players WHERE club_id IS NULL`);
  const pos=["GK","DEF","MID","ATT"];
  for(let i=r.rows[0].count;i<40;i++){
    const p=makePlayer(pos[rand(0,3)],59,77);
    await q(`
      INSERT INTO players(name,position,rating,pace,shooting,passing,defending,price,age)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
    `,[p.name,p.position,p.rating,p.pace,p.shooting,p.passing,p.defending,p.price,p.age]);
  }
}

function hashPassword(password,salt=crypto.randomBytes(16).toString("hex")){
  return {salt,hash:crypto.scryptSync(password,salt,64).toString("hex")};
}
function verifyPassword(password,salt,expected){
  const a=crypto.scryptSync(password,salt,64),b=Buffer.from(expected,"hex");
  return a.length===b.length && crypto.timingSafeEqual(a,b);
}
function sign(uid){
  const payload=Buffer.from(JSON.stringify({uid:String(uid),exp:Date.now()+2592000000})).toString("base64url");
  const sig=crypto.createHmac("sha256",SECRET).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}
function session(token){
  if(!token||!token.includes(".")) return null;
  const [payload,sig]=token.split(".");
  const expected=crypto.createHmac("sha256",SECRET).update(payload).digest("base64url");
  const a=Buffer.from(sig),b=Buffer.from(expected);
  if(a.length!==b.length||!crypto.timingSafeEqual(a,b)) return null;
  try{
    const s=JSON.parse(Buffer.from(payload,"base64url").toString());
    return s.exp>Date.now()?s:null;
  }catch{return null}
}
function cookies(header=""){
  const out={};
  for(const part of header.split(";")){
    const i=part.indexOf("=");
    if(i>0) out[part.slice(0,i).trim()]=decodeURIComponent(part.slice(i+1).trim());
  }
  return out;
}
function setCookie(res,uid){
  const secure=process.env.NODE_ENV==="production"?"; Secure":"";
  res.setHeader("Set-Cookie",`${COOKIE}=${encodeURIComponent(sign(uid))}; HttpOnly; Path=/; SameSite=Lax; Max-Age=2592000${secure}`);
}
function clearCookie(res){
  const secure=process.env.NODE_ENV==="production"?"; Secure":"";
  res.setHeader("Set-Cookie",`${COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${secure}`);
}
async function auth(req,res,next){
  try{
    const s=session(cookies(req.headers.cookie||"")[COOKIE]);
    if(!s) return res.status(401).json({error:"Não autenticado."});
    const u=await q(`SELECT id,email FROM users WHERE id=$1`,[s.uid]);
    if(!u.rowCount) return res.status(401).json({error:"Sessão inválida."});
    req.user=u.rows[0];
    next();
  }catch(e){next(e)}
}

async function userClub(userId){
  return (await q(`SELECT * FROM clubs WHERE user_id=$1`,[userId])).rows[0]||null;
}
async function clubRating(clubId,client=pool){
  return (await client.query(`SELECT COALESCE(ROUND(AVG(rating)),64)::int rating FROM players WHERE club_id=$1 AND is_starter=TRUE`,[clubId])).rows[0].rating;
}
function poisson(lambda){
  const L=Math.exp(-lambda);let k=0,p=1;
  do{k++;p*=Math.random()}while(p>L);
  return k-1;
}
function basicScore(hr,ar){
  return {
    hg:Math.min(7,poisson(clamp(1.34+(hr-ar)*.045,.25,3.6))),
    ag:Math.min(7,poisson(clamp(1.12+(ar-hr)*.045,.25,3.4)))
  };
}
function weightedPick(players){
  const x=[];
  for(const p of players){
    const n=p.position==="ATT"?7:p.position==="MID"?4:p.position==="DEF"?2:1;
    for(let i=0;i<n;i++)x.push(p);
  }
  return x[rand(0,x.length-1)]||players[0];
}
async function starters(client,clubId){
  let r=await client.query(`SELECT * FROM players WHERE club_id=$1 AND is_starter=TRUE ORDER BY rating DESC`,[clubId]);
  if(r.rowCount===11&&r.rows.some(p=>p.position==="GK")) return r.rows;
  const club=(await client.query(`SELECT * FROM clubs WHERE id=$1`,[clubId])).rows[0];
  await createRoster(client,club,false);
  const all=(await client.query(`SELECT * FROM players WHERE club_id=$1 ORDER BY CASE position WHEN 'GK' THEN 1 WHEN 'DEF' THEN 2 WHEN 'MID' THEN 3 ELSE 4 END,rating DESC`,[clubId])).rows;
  const gk=all.find(p=>p.position==="GK");
  const chosen=[gk];
  for(const p of all){if(chosen.length>=11)break;if(String(p.id)!==String(gk.id))chosen.push(p)}
  await client.query(`UPDATE players SET is_starter=FALSE WHERE club_id=$1`,[clubId]);
  await client.query(`UPDATE players SET is_starter=TRUE WHERE id=ANY($1::bigint[])`,[chosen.map(p=>p.id)]);
  return chosen;
}
function eventsFor(clubId,startersList,goals){
  const ev=[];
  for(let i=0;i<goals;i++){
    const scorer=weightedPick(startersList.filter(p=>p.position!=="GK"));
    const pool=startersList.filter(p=>String(p.id)!==String(scorer.id)&&p.position!=="GK");
    const assist=pool.length&&Math.random()<.7?weightedPick(pool):null;
    ev.push({type:"goal",clubId,minute:rand(3,89),scorerId:scorer.id,assistId:assist?.id||null,text:`Gol de ${scorer.name}${assist?` (assistência de ${assist.name})`:""}`});
  }
  if(Math.random()<.55){
    const p=startersList[rand(0,startersList.length-1)];
    ev.push({type:"yellow",clubId,minute:rand(15,87),playerId:p.id,text:`Cartão amarelo para ${p.name}`});
  }
  return ev;
}
async function applyStats(client,clubId,startersList,conceded,events){
  await client.query(`UPDATE players SET appearances=appearances+1 WHERE id=ANY($1::bigint[])`,[startersList.map(p=>p.id)]);
  if(conceded===0){
    const gk=startersList.find(p=>p.position==="GK");
    if(gk) await client.query(`UPDATE players SET clean_sheets=clean_sheets+1 WHERE id=$1`,[gk.id]);
  }
  for(const e of events.filter(x=>String(x.clubId)===String(clubId))){
    if(e.type==="goal"){
      await client.query(`UPDATE players SET goals=goals+1 WHERE id=$1`,[e.scorerId]);
      if(e.assistId) await client.query(`UPDATE players SET assists=assists+1 WHERE id=$1`,[e.assistId]);
    }
    if(e.type==="yellow") await client.query(`UPDATE players SET yellow_cards=yellow_cards+1 WHERE id=$1`,[e.playerId]);
  }
}
async function recordUserMatch(client,ownerId,opponentId,m,events,type,reward=0){
  await client.query(`INSERT INTO matches(user_club_id,opponent_club_id,user_goals,opponent_goals,reward,user_rating,opponent_rating,events,match_type)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)`,
    [ownerId,opponentId,m.userGoals,m.opponentGoals,reward,m.userRating,m.opponentRating,JSON.stringify(events),type]);
}

async function fullMatch(client,homeId,awayId,userId){
  const cs=(await client.query(`SELECT * FROM clubs WHERE id=ANY($1::bigint[])`,[[homeId,awayId]])).rows;
  const home=cs.find(c=>String(c.id)===String(homeId)),away=cs.find(c=>String(c.id)===String(awayId));
  await createRoster(client,home,false);await createRoster(client,away,false);
  const hs=await starters(client,home.id),as=await starters(client,away.id);
  const hr=await clubRating(home.id,client),ar=await clubRating(away.id,client);
  const {hg,ag}=basicScore(hr,ar);
  const events=[...eventsFor(home.id,hs,hg),...eventsFor(away.id,as,ag)].sort((a,b)=>a.minute-b.minute);
  await applyStats(client,home.id,hs,ag,events);await applyStats(client,away.id,as,hg,events);
  await client.query(`UPDATE clubs SET team_rating=$2 WHERE id=$1`,[home.id,hr]);
  await client.query(`UPDATE clubs SET team_rating=$2 WHERE id=$1`,[away.id,ar]);
  const userHome=String(home.id)===String(userId),ug=userHome?hg:ag,og=userHome?ag:hg;
  return {
    home,away,hg,ag,events,
    userMatch:{
      result:ug>og?"win":ug===og?"draw":"loss",
      userClub:userHome?home.name:away.name,
      opponent:userHome?away.name:home.name,
      userGoals:ug,opponentGoals:og,
      userRating:userHome?hr:ar,opponentRating:userHome?ar:hr,
      events:events.map(e=>({minute:e.minute,text:e.text,type:e.type,clubId:e.clubId}))
    }
  };
}

function doubleRR(ids){
  let arr=[...ids],n=arr.length,first=[];
  for(let r=0;r<n-1;r++){
    const games=[];
    for(let i=0;i<n/2;i++){
      const a=arr[i],b=arr[n-1-i];
      games.push((r+i)%2===0?[a,b]:[b,a]);
    }
    first.push(games);
    arr=[arr[0],arr[n-1],...arr.slice(1,n-1)];
  }
  return [...first,...first.map(g=>g.map(([h,a])=>[a,h]))];
}
function singleRR(ids){return doubleRR(ids).slice(0,ids.length-1)}
function blankEntry(clubId){return {clubId,points:0,wins:0,draws:0,losses:0,gf:0,ga:0}}
function sortEntries(entries){return [...entries].sort((a,b)=>b.points-a.points||((b.gf-b.ga)-(a.gf-a.ga))||b.gf-a.gf||a.clubId-b.clubId)}
function applyResult(entry,gf,ga){
  entry.gf+=gf;entry.ga+=ga;
  if(gf>ga){entry.wins++;entry.points+=3}
  else if(gf===ga){entry.draws++;entry.points+=1}
  else entry.losses++;
}
function divisionObject(ids){
  return {
    entries:ids.map(blankEntry),
    fixtures:doubleRR(ids).flatMap((games,ri)=>games.map(([home,away])=>({round:ri+1,home,away,played:false,hg:null,ag:null})))
  };
}
function stateObject(name,ids){
  return {
    name,stage:"GROUP",round:1,champion:null,
    entries:ids.map(blankEntry),
    fixtures:singleRR(ids).flatMap((games,ri)=>games.map(([home,away])=>({stage:"GROUP",round:ri+1,home,away,played:false,hg:null,ag:null,pw:null})))
  };
}

async function clubIdsBySeed(div,limit){
  return (await q(`SELECT id FROM clubs WHERE is_ai=TRUE AND club_kind='national' AND national_seed_division=$1 ORDER BY base_rating DESC,name LIMIT $2`,[div,limit])).rows.map(x=>Number(x.id));
}
async function buildSeasonData(ownerId,stateCode,previous=null){
  const data={state:null,divisions:{},libertadores:null};
  let members={A:[],B:[],C:[],D:[]};

  if(!previous){
    for(const d of DIVS) members[d]=await clubIdsBySeed(d,d==="D"?19:20);
    members.D.push(Number(ownerId));
  }else{
    const t={};
    for(const d of DIVS) t[d]=sortEntries(previous.divisions[d].entries);
    members.A=[...t.A.slice(0,16).map(x=>x.clubId),...t.B.slice(0,4).map(x=>x.clubId)];
    members.B=[...t.A.slice(16,20).map(x=>x.clubId),...t.B.slice(4,16).map(x=>x.clubId),...t.C.slice(0,4).map(x=>x.clubId)];
    members.C=[...t.B.slice(16,20).map(x=>x.clubId),...t.C.slice(4,16).map(x=>x.clubId),...t.D.slice(0,4).map(x=>x.clubId)];
    members.D=[...t.C.slice(16,20).map(x=>x.clubId),...t.D.slice(4,20).map(x=>x.clubId)];
  }

  let userDiv="D";
  for(const d of DIVS){
    if(members[d].length!==20) throw new Error(`Série ${d} ficou com ${members[d].length} clubes.`);
    if(members[d].some(id=>String(id)===String(ownerId))) userDiv=d;
    data.divisions[d]=divisionObject(members[d]);
  }

  const opp=(await q(`SELECT id FROM clubs WHERE is_ai=TRUE AND country_code='BR' AND state_code=$1 ORDER BY CASE WHEN club_kind='state' THEN 0 ELSE 1 END,RANDOM() LIMIT 7`,[stateCode])).rows.map(x=>Number(x.id));
  if(opp.length<7) throw new Error("Faltam clubes para o Estadual.");
  data.state=stateObject(STATE_DATA.championships[stateCode]||`Campeonato ${stateCode}`,[Number(ownerId),...opp]);

  return {data,userDiv};
}

async function createCareer(ownerId,stateCode,seasonNo=1,previousData=null){
  const built=await buildSeasonData(ownerId,stateCode,previousData);
  await q(`
    INSERT INTO careers(owner_club_id,season_no,phase,state_code,user_division,current_round,data,updated_at)
    VALUES($1,$2,'STATE',$3,$4,1,$5::jsonb,NOW())
    ON CONFLICT(owner_club_id) DO UPDATE SET
      season_no=EXCLUDED.season_no,phase='STATE',state_code=EXCLUDED.state_code,user_division=EXCLUDED.user_division,current_round=1,data=EXCLUDED.data,updated_at=NOW()
  `,[ownerId,seasonNo,stateCode,built.userDiv,JSON.stringify(built.data)]);
  return (await q(`SELECT * FROM careers WHERE owner_club_id=$1`,[ownerId])).rows[0];
}
async function getCareer(ownerId){
  return (await q(`SELECT * FROM careers WHERE owner_club_id=$1`,[ownerId])).rows[0]||null;
}
async function saveCareer(career){
  await q(`UPDATE careers SET season_no=$2,phase=$3,state_code=$4,user_division=$5,current_round=$6,data=$7::jsonb,updated_at=NOW() WHERE owner_club_id=$1`,
    [career.owner_club_id,career.season_no,career.phase,career.state_code,career.user_division,career.current_round,JSON.stringify(career.data)]);
}
async function ratingsMap(ids){
  const rows=(await q(`SELECT id,team_rating FROM clubs WHERE id=ANY($1::bigint[])`,[ids])).rows;
  return new Map(rows.map(r=>[String(r.id),Number(r.team_rating)]));
}
function findEntry(entries,id){return entries.find(e=>String(e.clubId)===String(id))}

async function playState(ownerId){
  const career=await getCareer(ownerId);
  if(!career||career.phase!=="STATE") throw Object.assign(new Error("O Estadual não está ativo."),{status:400});
  const s=career.data.state;
  let userMatch=null;

  if(s.stage==="GROUP"){
    const games=s.fixtures.filter(f=>f.stage==="GROUP"&&f.round===s.round);
    const ids=[...new Set(games.flatMap(f=>[f.home,f.away]))],ratings=await ratingsMap(ids);

    await tx(async c=>{
      for(const f of games){
        let hg,ag,events=[];
        if(String(f.home)===String(ownerId)||String(f.away)===String(ownerId)){
          const sim=await fullMatch(c,f.home,f.away,ownerId);hg=sim.hg;ag=sim.ag;events=sim.events;userMatch=sim.userMatch;userMatch.matchType="Estadual";
          const reward=userMatch.result==="win"?80:userMatch.result==="draw"?40:20;userMatch.reward=reward;
          await c.query(`UPDATE clubs SET coins=coins+$2 WHERE id=$1`,[ownerId,reward]);
          await recordUserMatch(c,ownerId,String(f.home)===String(ownerId)?f.away:f.home,userMatch,events,"state",reward);
        }else{
          ({hg,ag}=basicScore(ratings.get(String(f.home))||60,ratings.get(String(f.away))||60));
        }
        f.played=true;f.hg=hg;f.ag=ag;
        applyResult(findEntry(s.entries,f.home),hg,ag);applyResult(findEntry(s.entries,f.away),ag,hg);
      }
    });

    if(s.round>=7){
      const t=sortEntries(s.entries);
      [[t[0].clubId,t[3].clubId],[t[1].clubId,t[2].clubId]].forEach(([home,away],i)=>s.fixtures.push({stage:"SF",round:8,slot:i+1,home,away,played:false,hg:null,ag:null,pw:null}));
      s.stage="SF";s.round=8;
    }else s.round++;
  }else if(s.stage==="SF"||s.stage==="FINAL"){
    const games=s.fixtures.filter(f=>f.stage===s.stage&&!f.played);
    const ids=[...new Set(games.flatMap(f=>[f.home,f.away]))],ratings=await ratingsMap(ids),winners=[];

    await tx(async c=>{
      for(const f of games){
        let hg,ag;
        if(String(f.home)===String(ownerId)||String(f.away)===String(ownerId)){
          const sim=await fullMatch(c,f.home,f.away,ownerId);hg=sim.hg;ag=sim.ag;userMatch=sim.userMatch;userMatch.matchType="Estadual";userMatch.reward=0;
          await recordUserMatch(c,ownerId,String(f.home)===String(ownerId)?f.away:f.home,userMatch,sim.events,"state",0);
        }else ({hg,ag}=basicScore(ratings.get(String(f.home))||60,ratings.get(String(f.away))||60));
        f.played=true;f.hg=hg;f.ag=ag;
        const winner=hg>ag?f.home:ag>hg?f.away:(Math.random()<.5?f.home:f.away);
        if(hg===ag)f.pw=winner;
        winners.push(winner);
      }
    });

    if(s.stage==="SF"){
      s.fixtures.push({stage:"FINAL",round:9,slot:1,home:winners[0],away:winners[1],played:false,hg:null,ag:null,pw:null});
      s.stage="FINAL";s.round=9;
    }else{
      s.champion=winners[0];s.stage="FINISHED";
      career.phase="NATIONAL";
      if(String(s.champion)===String(ownerId)) await q(`UPDATE clubs SET coins=coins+500 WHERE id=$1`,[ownerId]);
    }
  }

  career.data.state=s;
  await saveCareer(career);
  return {userMatch};
}

async function makeLibertadores(career){
  const top4=sortEntries(career.data.divisions.A.entries).slice(0,4).map(e=>e.clubId);
  const foreign=(await q(`SELECT id FROM clubs WHERE is_ai=TRUE AND club_kind='continental' ORDER BY RANDOM() LIMIT 28`)).rows.map(r=>Number(r.id));
  const teams=shuffle([...top4,...foreign]),groups="ABCDEFGH".split("");
  const entries=teams.map((clubId,i)=>({...blankEntry(clubId),group:groups[Math.floor(i/4)]}));
  const fixtures=[];
  for(const g of groups){
    const ids=entries.filter(e=>e.group===g).map(e=>e.clubId);
    const rounds=doubleRR(ids).slice(0,6);
    rounds.forEach((games,ri)=>games.forEach(([home,away])=>fixtures.push({stage:"GROUP",group:g,matchday:ri+1,leg:1,home,away,played:false,hg:null,ag:null,pw:null})));
  }
  career.data.libertadores={status:"group",stage:"GROUP",matchday:1,leg:1,champion:null,entries,fixtures};
}
function groupTable(lib,g){return sortEntries(lib.entries.filter(e=>e.group===g))}
function createR16(lib){
  const winners=[],runners=[];
  for(const g of "ABCDEFGH"){const t=groupTable(lib,g);winners.push({id:t[0].clubId,g});runners.push({id:t[1].clubId,g})}
  let r=shuffle(runners);for(let i=0;i<200&&!winners.every((w,j)=>w.g!==r[j].g);i++)r=shuffle(runners);
  for(let i=0;i<8;i++){
    const a=r[i].id,b=winners[i].id,tie=`R16-${i+1}`;
    lib.fixtures.push({stage:"R16",tie,slot:i+1,leg:1,home:a,away:b,played:false,hg:null,ag:null,pw:null});
    lib.fixtures.push({stage:"R16",tie,slot:i+1,leg:2,home:b,away:a,played:false,hg:null,ag:null,pw:null});
  }
  lib.status="knockout";lib.stage="R16";lib.leg=1;
}
function koWinners(lib,stage){
  const ties=[...new Set(lib.fixtures.filter(f=>f.stage===stage).map(f=>f.tie))],out=[];
  for(const tie of ties){
    const fs=lib.fixtures.filter(f=>f.stage===stage&&f.tie===tie);
    const ids=[...new Set(fs.flatMap(f=>[String(f.home),String(f.away)]))],agg=new Map(ids.map(x=>[x,0]));
    fs.forEach(f=>{agg.set(String(f.home),agg.get(String(f.home))+Number(f.hg||0));agg.set(String(f.away),agg.get(String(f.away))+Number(f.ag||0))});
    let [a,b]=ids,w=agg.get(a)>agg.get(b)?a:agg.get(b)>agg.get(a)?b:(Math.random()<.5?a:b);
    if(agg.get(a)===agg.get(b))fs[fs.length-1].pw=Number(w);
    out.push(Number(w));
  }
  return out;
}
function addKoStage(lib,stage,ids){
  const x=shuffle(ids);
  for(let i=0;i<x.length;i+=2){
    const tie=`${stage}-${i/2+1}`;
    if(stage==="FINAL")lib.fixtures.push({stage,tie,slot:i/2+1,leg:1,home:x[i],away:x[i+1],played:false,hg:null,ag:null,pw:null});
    else{
      lib.fixtures.push({stage,tie,slot:i/2+1,leg:1,home:x[i],away:x[i+1],played:false,hg:null,ag:null,pw:null});
      lib.fixtures.push({stage,tie,slot:i/2+1,leg:2,home:x[i+1],away:x[i],played:false,hg:null,ag:null,pw:null});
    }
  }
}
async function simulateLibStep(career,allowUserDetail){
  const lib=career.data.libertadores;
  let userMatch=null,userAlive=true;

  if(lib.stage==="GROUP"){
    const games=lib.fixtures.filter(f=>f.stage==="GROUP"&&f.matchday===lib.matchday&&!f.played);
    const ratings=await ratingsMap([...new Set(games.flatMap(f=>[f.home,f.away]))]);
    await tx(async c=>{
      for(const f of games){
        let hg,ag;
        if(allowUserDetail&&(String(f.home)===String(career.owner_club_id)||String(f.away)===String(career.owner_club_id))){
          const sim=await fullMatch(c,f.home,f.away,career.owner_club_id);hg=sim.hg;ag=sim.ag;userMatch=sim.userMatch;userMatch.matchType="Libertadores";userMatch.reward=0;
          await recordUserMatch(c,career.owner_club_id,String(f.home)===String(career.owner_club_id)?f.away:f.home,userMatch,sim.events,"libertadores",0);
        }else ({hg,ag}=basicScore(ratings.get(String(f.home))||72,ratings.get(String(f.away))||72));
        f.played=true;f.hg=hg;f.ag=ag;
        applyResult(findEntry(lib.entries,f.home),hg,ag);applyResult(findEntry(lib.entries,f.away),ag,hg);
      }
    });
    if(lib.matchday>=6){
      createR16(lib);
      const ue=lib.entries.find(e=>String(e.clubId)===String(career.owner_club_id));
      userAlive=!!ue&&groupTable(lib,ue.group).slice(0,2).some(e=>String(e.clubId)===String(career.owner_club_id));
    }else lib.matchday++;
  }else{
    const stage=lib.stage,leg=stage==="FINAL"?1:lib.leg;
    const games=lib.fixtures.filter(f=>f.stage===stage&&f.leg===leg&&!f.played);
    const ratings=await ratingsMap([...new Set(games.flatMap(f=>[f.home,f.away]))]);
    await tx(async c=>{
      for(const f of games){
        let hg,ag;
        if(allowUserDetail&&(String(f.home)===String(career.owner_club_id)||String(f.away)===String(career.owner_club_id))){
          const sim=await fullMatch(c,f.home,f.away,career.owner_club_id);hg=sim.hg;ag=sim.ag;userMatch=sim.userMatch;userMatch.matchType="Libertadores";userMatch.reward=0;
          await recordUserMatch(c,career.owner_club_id,String(f.home)===String(career.owner_club_id)?f.away:f.home,userMatch,sim.events,"libertadores",0);
        }else ({hg,ag}=basicScore(ratings.get(String(f.home))||72,ratings.get(String(f.away))||72));
        f.played=true;f.hg=hg;f.ag=ag;
      }
    });

    if(stage==="FINAL"){
      const f=games[0];
      let champ=f.hg>f.ag?f.home:f.ag>f.hg?f.away:(Math.random()<.5?f.home:f.away);
      if(f.hg===f.ag)f.pw=champ;
      lib.champion=champ;lib.status="finished";userAlive=false;
    }else if(leg===1){
      lib.leg=2;
    }else{
      const winners=koWinners(lib,stage);
      userAlive=winners.some(id=>String(id)===String(career.owner_club_id));
      const next=stage==="R16"?"QF":stage==="QF"?"SF":"FINAL";
      addKoStage(lib,next,winners);lib.stage=next;lib.leg=1;
    }
  }
  career.data.libertadores=lib;
  return {userMatch,userAlive,finished:lib.status==="finished"};
}
async function autoFinishLib(career){
  for(let i=0;i<20&&career.data.libertadores?.status!=="finished";i++) await simulateLibStep(career,false);
}

async function playNational(ownerId){
  const career=await getCareer(ownerId);
  if(!career||career.phase!=="NATIONAL") throw Object.assign(new Error("O Brasileirão não está ativo."),{status:400});
  const round=career.current_round;
  let userMatch=null;

  for(const div of DIVS){
    const d=career.data.divisions[div];
    const games=d.fixtures.filter(f=>f.round===round&&!f.played);
    const ids=[...new Set(games.flatMap(f=>[f.home,f.away]))],ratings=await ratingsMap(ids);

    await tx(async c=>{
      for(const f of games){
        let hg,ag,events=[];
        if(String(f.home)===String(ownerId)||String(f.away)===String(ownerId)){
          const sim=await fullMatch(c,f.home,f.away,ownerId);hg=sim.hg;ag=sim.ag;events=sim.events;userMatch=sim.userMatch;userMatch.matchType=`Série ${div}`;
          const reward=userMatch.result==="win"?180:userMatch.result==="draw"?90:50;userMatch.reward=reward;
          await c.query(`UPDATE clubs SET coins=coins+$2 WHERE id=$1`,[ownerId,reward]);
          await recordUserMatch(c,ownerId,String(f.home)===String(ownerId)?f.away:f.home,userMatch,events,`serie_${div.toLowerCase()}`,reward);
        }else ({hg,ag}=basicScore(ratings.get(String(f.home))||64,ratings.get(String(f.away))||64));
        f.played=true;f.hg=hg;f.ag=ag;
        applyResult(findEntry(d.entries,f.home),hg,ag);applyResult(findEntry(d.entries,f.away),ag,hg);
      }
    });
  }

  if(round>=38){
    await makeLibertadores(career);
    const tableA=sortEntries(career.data.divisions.A.entries);
    const userTop4A=career.user_division==="A"&&tableA.slice(0,4).some(e=>String(e.clubId)===String(ownerId));
    if(userTop4A) career.phase="LIBERTADORES";
    else{ await autoFinishLib(career);career.phase="END"; }
  }else career.current_round++;

  await saveCareer(career);
  return {round,userMatch};
}

async function playLib(ownerId){
  const career=await getCareer(ownerId);
  if(!career||career.phase!=="LIBERTADORES") throw Object.assign(new Error("Você não está na Libertadores agora."),{status:400});
  const r=await simulateLibStep(career,true);
  if(r.finished) career.phase="END";
  else if(!r.userAlive){ await autoFinishLib(career);career.phase="END"; }
  await saveCareer(career);
  return r;
}

async function nextSeason(ownerId){
  const career=await getCareer(ownerId);
  if(!career||career.phase!=="END") throw Object.assign(new Error("A temporada ainda não terminou."),{status:400});
  const club=(await q(`SELECT * FROM clubs WHERE id=$1`,[ownerId])).rows[0];

  await tx(async c=>{
    const ps=(await c.query(`SELECT id,age FROM players WHERE club_id=$1`,[ownerId])).rows;
    for(const p of ps){
      let delta=0;if(p.age<=24&&Math.random()<.35)delta=1;if(p.age>=31&&Math.random()<.25)delta=-1;
      await c.query(`UPDATE players SET age=age+1,rating=GREATEST(45,LEAST(95,rating+$2)),pace=GREATEST(25,LEAST(95,pace+$2)),shooting=GREATEST(20,LEAST(95,shooting+$2)),passing=GREATEST(20,LEAST(95,passing+$2)),defending=GREATEST(20,LEAST(95,defending+$2)) WHERE id=$1`,[p.id,delta]);
    }
  });

  return createCareer(ownerId,club.state_code,career.season_no+1,career.data);
}

async function hydrateCareer(career){
  if(!career) return null;
  const ids=new Set();
  for(const d of DIVS){
    career.data.divisions[d].entries.forEach(e=>ids.add(e.clubId));
    career.data.divisions[d].fixtures.forEach(f=>{ids.add(f.home);ids.add(f.away)});
  }
  career.data.state.entries.forEach(e=>ids.add(e.clubId));
  career.data.state.fixtures.forEach(f=>{ids.add(f.home);ids.add(f.away)});
  if(career.data.libertadores){
    career.data.libertadores.entries.forEach(e=>ids.add(e.clubId));
    career.data.libertadores.fixtures.forEach(f=>{ids.add(f.home);ids.add(f.away)});
  }
  const clubs=(await q(`SELECT id,name,primary_color,secondary_color,crest_data,team_rating,state_code,country_code FROM clubs WHERE id=ANY($1::bigint[])`,[[...ids]])).rows;
  const map=new Map(clubs.map(c=>[String(c.id),c]));
  const hEntry=e=>({...e,club:map.get(String(e.clubId)),gd:e.gf-e.ga});
  const hFix=f=>({...f,homeClub:map.get(String(f.home)),awayClub:map.get(String(f.away))});

  const divisions={};
  for(const d of DIVS) divisions[d]={
    entries:sortEntries(career.data.divisions[d].entries).map(hEntry),
    fixtures:career.data.divisions[d].fixtures.map(hFix)
  };

  const stateObj={
    ...career.data.state,
    entries:sortEntries(career.data.state.entries).map(hEntry),
    fixtures:career.data.state.fixtures.map(hFix),
    championClub:career.data.state.champion?map.get(String(career.data.state.champion)):null
  };

  let lib=null;
  if(career.data.libertadores){
    lib={
      ...career.data.libertadores,
      entries:career.data.libertadores.entries.map(hEntry),
      fixtures:career.data.libertadores.fixtures.map(hFix),
      championClub:career.data.libertadores.champion?map.get(String(career.data.libertadores.champion)):null
    };
  }
  return {
    career:{owner_club_id:career.owner_club_id,season_no:career.season_no,phase:career.phase,state_code:career.state_code,user_division:career.user_division,current_round:career.current_round},
    divisions,state:stateObj,libertadores:lib
  };
}

app.get("/health",async(_req,res,next)=>{try{await q("SELECT 1");res.json({ok:true})}catch(e){next(e)}});

app.post("/api/auth/register",async(req,res,next)=>{
  try{
    const email=String(req.body.email||"").trim().toLowerCase(),password=String(req.body.password||"");
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({error:"E-mail inválido."});
    if(password.length<6||password.length>128) return res.status(400).json({error:"A senha deve ter 6 a 128 caracteres."});
    const h=hashPassword(password);
    const r=await q(`INSERT INTO users(email,password_hash,password_salt) VALUES($1,$2,$3) RETURNING id,email`,[email,h.hash,h.salt]);
    setCookie(res,r.rows[0].id);res.status(201).json({user:r.rows[0]});
  }catch(e){if(e.code==="23505")return res.status(409).json({error:"Este e-mail já está cadastrado."});next(e)}
});
app.post("/api/auth/login",async(req,res,next)=>{
  try{
    const email=String(req.body.email||"").trim().toLowerCase(),password=String(req.body.password||"");
    const r=await q(`SELECT * FROM users WHERE email=$1`,[email]);
    if(!r.rowCount||!verifyPassword(password,r.rows[0].password_salt,r.rows[0].password_hash))return res.status(401).json({error:"E-mail ou senha incorretos."});
    setCookie(res,r.rows[0].id);res.json({ok:true});
  }catch(e){next(e)}
});
app.post("/api/auth/logout",(_req,res)=>{clearCookie(res);res.json({ok:true})});

app.get("/api/me",auth,async(req,res,next)=>{
  try{res.json({user:req.user,club:await userClub(req.user.id),states:STATE_DATA.names})}catch(e){next(e)}
});

app.post("/api/club",auth,async(req,res,next)=>{
  try{
    const name=String(req.body.name||"").trim().replace(/\s+/g," "),state=String(req.body.stateCode||"").toUpperCase(),pc=String(req.body.primaryColor||"#18864b"),sc=String(req.body.secondaryColor||"#f7fafc");
    if(name.length<3||name.length>30)return res.status(400).json({error:"Nome deve ter 3 a 30 caracteres."});
    if(!VALID_STATES.has(state))return res.status(400).json({error:"Escolha um estado."});
    const club=await tx(async c=>{
      const ex=await c.query(`SELECT id FROM clubs WHERE user_id=$1`,[req.user.id]);if(ex.rowCount)throw Object.assign(new Error("Você já tem um clube."),{status:409});
      const x=(await c.query(`INSERT INTO clubs(user_id,name,state_code,country_code,club_kind,base_rating,team_rating,coins,primary_color,secondary_color) VALUES($1,$2,$3,'BR','user',64,64,3500,$4,$5) RETURNING *`,[req.user.id,name,state,pc,sc])).rows[0];
      await ensureFriendCode(c,x.id);await createRoster(c,x,true);return x;
    });
    await createCareer(club.id,state,1,null);res.status(201).json({club});
  }catch(e){if(e.code==="23505")return res.status(409).json({error:"Nome já utilizado."});next(e)}
});

app.put("/api/club/state",auth,async(req,res,next)=>{
  try{
    const club=await userClub(req.user.id),state=String(req.body.stateCode||"").toUpperCase();
    if(!club)return res.status(404).json({error:"Clube não encontrado."});
    if(club.state_code)return res.status(409).json({error:"O estado já foi definido."});
    if(!VALID_STATES.has(state))return res.status(400).json({error:"Escolha um estado."});
    await tx(async c=>{
      await c.query(`UPDATE clubs SET state_code=$2,coins=3500,base_rating=64,team_rating=64 WHERE id=$1`,[club.id,state]);
      const fresh=(await c.query(`SELECT * FROM clubs WHERE id=$1`,[club.id])).rows[0];
      await createRoster(c,fresh,true);
    });
    await createCareer(club.id,state,1,null);res.json({ok:true});
  }catch(e){next(e)}
});

app.put("/api/club/customize",auth,async(req,res,next)=>{
  try{
    const c=await userClub(req.user.id);
    const name=String(req.body.name||c.name).trim().replace(/\s+/g," "),primary=String(req.body.primaryColor||c.primary_color),secondary=String(req.body.secondaryColor||c.secondary_color),crest=req.body.crestData===null?null:String(req.body.crestData||c.crest_data||"");
    if(name.length<3||name.length>30)return res.status(400).json({error:"Nome deve ter 3 a 30 caracteres."});
    if(!/^#[0-9a-fA-F]{6}$/.test(primary)||!/^#[0-9a-fA-F]{6}$/.test(secondary))return res.status(400).json({error:"Cor inválida."});
    if(crest&&!/^data:image\/(png|jpeg|webp);base64,/i.test(crest))return res.status(400).json({error:"Escudo inválido."});
    if(crest.length>700000)return res.status(400).json({error:"Escudo grande demais."});
    const r=await q(`UPDATE clubs SET name=$2,primary_color=$3,secondary_color=$4,crest_data=$5 WHERE id=$1 RETURNING *`,[c.id,name,primary,secondary,crest||null]);
    res.json({club:r.rows[0]});
  }catch(e){if(e.code==="23505")return res.status(409).json({error:"Esse nome já está em uso."});next(e)}
});

app.get("/api/dashboard",auth,async(req,res,next)=>{
  try{
    const c=await userClub(req.user.id);
    if(!c)return res.json({club:null,players:[],market:[],matches:[],friends:[]});
    if(!c.state_code)return res.json({club:c,players:[],market:[],matches:[],friends:[]});
    await ensureRoster(c.id);await ensureMarket();
    c.team_rating=await clubRating(c.id);
    const [ps,mk,mt,fr]=await Promise.all([
      q(`SELECT * FROM players WHERE club_id=$1 ORDER BY is_starter DESC,CASE position WHEN 'GK' THEN 1 WHEN 'DEF' THEN 2 WHEN 'MID' THEN 3 ELSE 4 END,rating DESC`,[c.id]),
      q(`SELECT * FROM players WHERE club_id IS NULL ORDER BY rating DESC,price DESC LIMIT 40`),
      q(`SELECT m.*,o.name opponent_name FROM matches m JOIN clubs o ON o.id=m.opponent_club_id WHERE m.user_club_id=$1 ORDER BY played_at DESC LIMIT 30`,[c.id]),
      q(`SELECT c.id,c.name,c.primary_color,c.secondary_color,c.crest_data,c.friend_code,c.team_rating FROM friendships f JOIN clubs c ON c.id=CASE WHEN f.club_a_id=$1 THEN f.club_b_id ELSE f.club_a_id END WHERE f.club_a_id=$1 OR f.club_b_id=$1 ORDER BY c.name`,[c.id])
    ]);
    res.json({club:c,players:ps.rows,market:mk.rows,matches:mt.rows,friends:fr.rows});
  }catch(e){next(e)}
});

app.get("/api/competitions",auth,async(req,res,next)=>{
  try{
    const c=await userClub(req.user.id);
    if(!c?.state_code)return res.status(400).json({error:"Defina o estado do clube."});
    let career=await getCareer(c.id);
    if(!career)career=await createCareer(c.id,c.state_code,1,null);
    res.json(await hydrateCareer(career));
  }catch(e){next(e)}
});

app.post("/api/state/play-next",auth,async(req,res,next)=>{try{const c=await userClub(req.user.id);res.json(await playState(c.id))}catch(e){next(e)}});
app.post("/api/national/play-round",auth,async(req,res,next)=>{try{const c=await userClub(req.user.id);res.json(await playNational(c.id))}catch(e){next(e)}});
app.post("/api/libertadores/play-next",auth,async(req,res,next)=>{try{const c=await userClub(req.user.id);res.json(await playLib(c.id))}catch(e){next(e)}});
app.post("/api/career/next-season",auth,async(req,res,next)=>{try{const c=await userClub(req.user.id);res.json({career:await nextSeason(c.id)})}catch(e){next(e)}});

app.get("/api/clubs/:id",auth,async(req,res,next)=>{
  try{
    const id=String(req.params.id);await ensureRoster(id);
    const c=await q(`SELECT id,name,primary_color,secondary_color,crest_data,friend_code,team_rating,state_code,country_code,is_ai,formation FROM clubs WHERE id=$1`,[id]);
    if(!c.rowCount)return res.status(404).json({error:"Clube não encontrado."});
    const ps=await q(`SELECT * FROM players WHERE club_id=$1 ORDER BY is_starter DESC,CASE position WHEN 'GK' THEN 1 WHEN 'DEF' THEN 2 WHEN 'MID' THEN 3 ELSE 4 END,rating DESC`,[id]);
    res.json({club:c.rows[0],players:ps.rows});
  }catch(e){next(e)}
});

app.put("/api/lineup",auth,async(req,res,next)=>{
  try{
    const c=await userClub(req.user.id),ids=Array.isArray(req.body.starterIds)?req.body.starterIds.map(String):[],formation=String(req.body.formation||"4-3-3");
    if(ids.length!==11||new Set(ids).size!==11)return res.status(400).json({error:"Selecione exatamente 11 titulares."});
    const own=await q(`SELECT id,position FROM players WHERE club_id=$1 AND id=ANY($2::bigint[])`,[c.id,ids]);
    if(own.rowCount!==11||!own.rows.some(p=>p.position==="GK"))return res.status(400).json({error:"Inclua um goleiro."});
    await tx(async x=>{await x.query(`UPDATE players SET is_starter=FALSE WHERE club_id=$1`,[c.id]);await x.query(`UPDATE players SET is_starter=TRUE WHERE club_id=$1 AND id=ANY($2::bigint[])`,[c.id,ids]);await x.query(`UPDATE clubs SET formation=$2 WHERE id=$1`,[c.id,formation])});
    res.json({ok:true});
  }catch(e){next(e)}
});

app.post("/api/players/:id/release",auth,async(req,res,next)=>{
  try{
    const c=await userClub(req.user.id),pid=String(req.params.id);
    await tx(async x=>{
      const p=await x.query(`SELECT * FROM players WHERE id=$1 AND club_id=$2 FOR UPDATE`,[pid,c.id]);
      if(!p.rowCount)throw Object.assign(new Error("Jogador não encontrado."),{status:404});
      if(p.rows[0].is_starter)throw Object.assign(new Error("Tire o jogador dos titulares antes de rescindir."),{status:400});
      const count=await x.query(`SELECT COUNT(*)::int count FROM players WHERE club_id=$1`,[c.id]);if(count.rows[0].count<=12)throw Object.assign(new Error("Mantenha pelo menos 12 jogadores."),{status:400});
      await x.query(`UPDATE players SET club_id=NULL,is_starter=FALSE,price=GREATEST(100,ROUND(price*0.9)) WHERE id=$1`,[pid]);
    });
    res.json({ok:true});
  }catch(e){next(e)}
});

app.post("/api/market/buy",auth,async(req,res,next)=>{
  try{
    const c=await userClub(req.user.id),pid=String(req.body.playerId||"");
    await tx(async x=>{
      const p=await x.query(`SELECT * FROM players WHERE id=$1 AND club_id IS NULL FOR UPDATE`,[pid]);if(!p.rowCount)throw Object.assign(new Error("Jogador indisponível."),{status:409});
      const cc=await x.query(`SELECT coins FROM clubs WHERE id=$1 FOR UPDATE`,[c.id]);if(cc.rows[0].coins<p.rows[0].price)throw Object.assign(new Error("Moedas insuficientes."),{status:400});
      await x.query(`UPDATE clubs SET coins=coins-$2 WHERE id=$1`,[c.id,p.rows[0].price]);await x.query(`UPDATE players SET club_id=$2,is_starter=FALSE WHERE id=$1`,[pid,c.id]);
    });
    await ensureMarket();res.json({ok:true});
  }catch(e){next(e)}
});

app.post("/api/friends/add",auth,async(req,res,next)=>{
  try{
    const c=await userClub(req.user.id),code=String(req.body.code||"").trim().toUpperCase();
    const t=await q(`SELECT id,is_ai FROM clubs WHERE friend_code=$1`,[code]);if(!t.rowCount)return res.status(404).json({error:"Código não encontrado."});
    if(String(t.rows[0].id)===String(c.id))return res.status(400).json({error:"Esse é seu código."});if(t.rows[0].is_ai)return res.status(400).json({error:"Código de clube do sistema."});
    const a=Math.min(Number(c.id),Number(t.rows[0].id)),b=Math.max(Number(c.id),Number(t.rows[0].id));await q(`INSERT INTO friendships(club_a_id,club_b_id) VALUES($1,$2) ON CONFLICT DO NOTHING`,[a,b]);res.json({ok:true});
  }catch(e){next(e)}
});
app.delete("/api/friends/:clubId",auth,async(req,res,next)=>{
  try{const c=await userClub(req.user.id),id=Number(req.params.clubId),a=Math.min(Number(c.id),id),b=Math.max(Number(c.id),id);await q(`DELETE FROM friendships WHERE club_a_id=$1 AND club_b_id=$2`,[a,b]);res.json({ok:true})}catch(e){next(e)}
});
app.post("/api/friends/:clubId/play",auth,async(req,res,next)=>{
  try{
    const c=await userClub(req.user.id),friendId=Number(req.params.clubId),a=Math.min(Number(c.id),friendId),b=Math.max(Number(c.id),friendId);
    const f=await q(`SELECT 1 FROM friendships WHERE club_a_id=$1 AND club_b_id=$2`,[a,b]);if(!f.rowCount)return res.status(403).json({error:"Clube não está na sua lista."});
    const m=await tx(async x=>{
      const sim=await fullMatch(x,c.id,friendId,c.id),um=sim.userMatch;um.reward=0;um.matchType="Amistoso";
      await x.query(`INSERT INTO matches(user_club_id,opponent_club_id,user_goals,opponent_goals,reward,user_rating,opponent_rating,events,match_type) VALUES($1,$2,$3,$4,0,$5,$6,$7::jsonb,'friendly')`,
        [c.id,friendId,um.userGoals,um.opponentGoals,um.userRating,um.opponentRating,JSON.stringify(sim.events)]);
      return um;
    });
    res.json({match:m});
  }catch(e){next(e)}
});

app.get("/styles.css",(_req,res)=>res.sendFile(path.join(__dirname,"styles.css")));
app.get("/app.js",(_req,res)=>res.sendFile(path.join(__dirname,"app.js")));
app.get("/",(_req,res)=>res.sendFile(path.join(__dirname,"index.html")));

app.use((err,_req,res,_next)=>{
  console.error(err);
  const status=Number(err.status||500);
  res.status(status).json({error:status>=500?"Erro interno do servidor.":err.message});
});

async function start(){
  await initDb();
  await seedClubs();
  await oneTimeReset();
  await ensureMarket();
  app.listen(PORT,"0.0.0.0",()=>console.log(`Dono do Clube v4 rodando na porta ${PORT}`));
}
start().catch(e=>{console.error("Falha ao iniciar:",e);process.exit(1)});
