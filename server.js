const express = require("express");
const { Pool } = require("pg");
const crypto = require("crypto");
const path = require("path");

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL não configurada.");
  process.exit(1);
}

const app = express();
const PORT = Number(process.env.PORT || 3000);
const SECRET = process.env.APP_SECRET || "dev-secret-change-me";
const COOKIE = "ddc_session";
const RESET_KEY = "v6_competitions_reset_20260919";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000
});

app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));

async function q(text, params = []) { return pool.query(text, params); }

async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const out = await fn(client);
    await client.query("COMMIT");
    return out;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

async function initDb() {
  await q(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS clubs (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL UNIQUE,
      primary_color TEXT NOT NULL DEFAULT '#18864b',
      secondary_color TEXT NOT NULL DEFAULT '#f7fafc',
      crest_data TEXT,
      friend_code TEXT,
      coins INTEGER NOT NULL DEFAULT 3500 CHECK (coins >= 0),
      formation TEXT NOT NULL DEFAULT '4-3-3',
      team_rating INTEGER NOT NULL DEFAULT 68,
      points INTEGER NOT NULL DEFAULT 0,
      wins INTEGER NOT NULL DEFAULT 0,
      draws INTEGER NOT NULL DEFAULT 0,
      losses INTEGER NOT NULL DEFAULT 0,
      goals_for INTEGER NOT NULL DEFAULT 0,
      goals_against INTEGER NOT NULL DEFAULT 0,
      is_ai BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS players (
      id BIGSERIAL PRIMARY KEY,
      club_id BIGINT REFERENCES clubs(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      position TEXT NOT NULL CHECK (position IN ('GK','DEF','MID','ATT')),
      rating INTEGER NOT NULL CHECK (rating BETWEEN 40 AND 99),
      pace INTEGER NOT NULL CHECK (pace BETWEEN 20 AND 99),
      shooting INTEGER NOT NULL CHECK (shooting BETWEEN 20 AND 99),
      passing INTEGER NOT NULL CHECK (passing BETWEEN 20 AND 99),
      defending INTEGER NOT NULL CHECK (defending BETWEEN 20 AND 99),
      price INTEGER NOT NULL CHECK (price >= 0),
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

    CREATE TABLE IF NOT EXISTS matches (
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

    CREATE TABLE IF NOT EXISTS friendships (
      id BIGSERIAL PRIMARY KEY,
      club_a_id BIGINT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
      club_b_id BIGINT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (club_a_id, club_b_id),
      CHECK (club_a_id < club_b_id)
    );

    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS league_seasons (
      id BIGSERIAL PRIMARY KEY,
      owner_club_id BIGINT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
      season_no INTEGER NOT NULL DEFAULT 1,
      current_round INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'active',
      champion_club_id BIGINT REFERENCES clubs(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      finished_at TIMESTAMPTZ,
      UNIQUE(owner_club_id, season_no)
    );

    CREATE TABLE IF NOT EXISTS league_entries (
      id BIGSERIAL PRIMARY KEY,
      season_id BIGINT NOT NULL REFERENCES league_seasons(id) ON DELETE CASCADE,
      club_id BIGINT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
      points INTEGER NOT NULL DEFAULT 0,
      wins INTEGER NOT NULL DEFAULT 0,
      draws INTEGER NOT NULL DEFAULT 0,
      losses INTEGER NOT NULL DEFAULT 0,
      goals_for INTEGER NOT NULL DEFAULT 0,
      goals_against INTEGER NOT NULL DEFAULT 0,
      UNIQUE(season_id, club_id)
    );

    CREATE TABLE IF NOT EXISTS league_fixtures (
      id BIGSERIAL PRIMARY KEY,
      season_id BIGINT NOT NULL REFERENCES league_seasons(id) ON DELETE CASCADE,
      round_no INTEGER NOT NULL,
      home_club_id BIGINT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
      away_club_id BIGINT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
      played BOOLEAN NOT NULL DEFAULT FALSE,
      home_goals INTEGER,
      away_goals INTEGER,
      events JSONB NOT NULL DEFAULT '[]'::jsonb,
      played_at TIMESTAMPTZ,
      UNIQUE(season_id, round_no, home_club_id, away_club_id)
    );

    CREATE TABLE IF NOT EXISTS libertadores_seasons (
      id BIGSERIAL PRIMARY KEY,
      owner_club_id BIGINT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
      league_season_id BIGINT NOT NULL REFERENCES league_seasons(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'group',
      current_matchday INTEGER NOT NULL DEFAULT 1,
      current_stage TEXT NOT NULL DEFAULT 'GROUP',
      current_leg INTEGER NOT NULL DEFAULT 1,
      champion_club_id BIGINT REFERENCES clubs(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      finished_at TIMESTAMPTZ,
      UNIQUE(owner_club_id, league_season_id)
    );

    CREATE TABLE IF NOT EXISTS libertadores_entries (
      id BIGSERIAL PRIMARY KEY,
      season_id BIGINT NOT NULL REFERENCES libertadores_seasons(id) ON DELETE CASCADE,
      club_id BIGINT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
      source TEXT NOT NULL DEFAULT 'random',
      group_name TEXT,
      points INTEGER NOT NULL DEFAULT 0,
      wins INTEGER NOT NULL DEFAULT 0,
      draws INTEGER NOT NULL DEFAULT 0,
      losses INTEGER NOT NULL DEFAULT 0,
      goals_for INTEGER NOT NULL DEFAULT 0,
      goals_against INTEGER NOT NULL DEFAULT 0,
      UNIQUE(season_id, club_id)
    );

    CREATE TABLE IF NOT EXISTS libertadores_fixtures (
      id BIGSERIAL PRIMARY KEY,
      season_id BIGINT NOT NULL REFERENCES libertadores_seasons(id) ON DELETE CASCADE,
      stage TEXT NOT NULL,
      group_name TEXT,
      matchday INTEGER,
      tie_key TEXT,
      bracket_slot INTEGER,
      leg INTEGER NOT NULL DEFAULT 1,
      home_club_id BIGINT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
      away_club_id BIGINT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
      played BOOLEAN NOT NULL DEFAULT FALSE,
      home_goals INTEGER,
      away_goals INTEGER,
      penalty_winner_club_id BIGINT REFERENCES clubs(id) ON DELETE SET NULL,
      events JSONB NOT NULL DEFAULT '[]'::jsonb,
      played_at TIMESTAMPTZ
    );

    CREATE INDEX IF NOT EXISTS idx_players_club ON players(club_id);
    CREATE INDEX IF NOT EXISTS idx_matches_user_club ON matches(user_club_id, played_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_clubs_friend_code ON clubs(friend_code) WHERE friend_code IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_league_fixture_round ON league_fixtures(season_id, round_no);
    CREATE INDEX IF NOT EXISTS idx_lib_fixture_stage ON libertadores_fixtures(season_id, stage, matchday, leg);
  `);
}

const first = [
  "Caio","Davi","Lucas","Rafael","Bruno","Henrique","Matheus","Pedro","Gustavo","Felipe",
  "André","Vitor","Diego","Gabriel","João","Thiago","Arthur","Murilo","Igor","Renan",
  "Enzo","Samuel","Daniel","Leandro","Vinícius","Nicolas","Heitor","Bernardo","Yuri","Otávio",
  "Mateo","Santiago","Emiliano","Joaquín","Facundo","Lautaro","Nicolás","Sebastián"
];
const last = [
  "Almeida","Rocha","Ferreira","Souza","Lima","Costa","Mendes","Silva","Ribeiro","Gomes",
  "Martins","Barbosa","Nunes","Teixeira","Moraes","Cardoso","Pires","Campos","Vieira","Freitas",
  "Monteiro","Azevedo","Duarte","Rezende","González","Pereira","Rodríguez","Romero","Suárez","Acosta"
];

const aiClubData = [
  ["Aurora FC",69,"#0f766e","#f8fafc"],["Atlético Vale",67,"#b91c1c","#f8fafc"],
  ["Real Serra",72,"#1d4ed8","#f8fafc"],["União Azul",66,"#0369a1","#facc15"],
  ["Estrela do Sul",71,"#7c3aed","#f8fafc"],["Nacional 11",68,"#166534","#fde047"],
  ["Ferroviário City",70,"#9a3412","#f8fafc"],["Imperial FC",73,"#111827","#f59e0b"],
  ["Vila Central",65,"#be123c","#f8fafc"],["Atlético Horizonte",74,"#7f1d1d","#fef2f2"],
  ["Sporting Litoral",68,"#075985","#e0f2fe"],["Grêmio Metropolitano",70,"#1e3a8a","#ffffff"],
  ["Real do Norte",66,"#14532d","#fef08a"],["Independente FC",72,"#991b1b","#111827"],
  ["Cruzeiro do Oeste",69,"#1e40af","#f8fafc"],["Porto Dourado",67,"#92400e","#fde68a"],
  ["Atlético Capital",75,"#111827","#ef4444"],["Juventude Verde",65,"#166534","#ffffff"],
  ["União Serrana",68,"#4338ca","#f8fafc"],["Estrela Vermelha",71,"#dc2626","#ffffff"],
  ["Deportivo Andino",73,"#0f766e","#ffffff"],["Club del Plata",72,"#2563eb","#f8fafc"],
  ["Racing del Sur",74,"#38bdf8","#ffffff"],["Independiente Norte",71,"#dc2626","#111827"],
  ["Atlético Pacífico",70,"#0284c7","#fef3c7"],["Nacional Oriental",69,"#1d4ed8","#ef4444"],
  ["Deportivo Central",68,"#7c2d12","#fef3c7"],["Universidad Roja",72,"#b91c1c","#ffffff"],
  ["Sportivo Guaraní",67,"#14532d","#facc15"],["Libertad del Este",73,"#111827","#ffffff"],
  ["Cerro Dorado",70,"#1e3a8a","#f59e0b"],["Olimpia del Valle",75,"#f8fafc","#111827"],
  ["River del Norte",74,"#ffffff","#dc2626"],["Boca del Pacífico",73,"#1e3a8a","#facc15"],
  ["San Martín FC",69,"#dc2626","#111827"],["Rosario Azul",68,"#0284c7","#facc15"],
  ["Colón del Sur",67,"#111827","#dc2626"],["Talleres Unidos",70,"#1d4ed8","#ffffff"],
  ["Estudiantes Federal",72,"#dc2626","#ffffff"],["Newell Central",68,"#111827","#b91c1c"],
  ["Peñarol del Río",73,"#facc15","#111827"],["Nacional del Puerto",72,"#ffffff","#1e40af"],
  ["Defensor Oriental",69,"#7e22ce","#ffffff"],["Danubio Unido",67,"#111827","#ffffff"],
  ["Universitario Andino",71,"#7f1d1d","#f8fafc"],["Alianza Pacífica",70,"#1e40af","#ffffff"],
  ["Sporting Cristalino",69,"#38bdf8","#ffffff"],["Melgar del Sur",68,"#b91c1c","#111827"],
  ["Colo Estrella",73,"#111827","#ffffff"],["Universidad Azul",72,"#1e40af","#dc2626"],
  ["Católica Central",71,"#1d4ed8","#ffffff"],["Palestino Unido",67,"#16a34a","#dc2626"],
  ["Bolívar Imperial",72,"#38bdf8","#ffffff"],["The Strongest Norte",70,"#facc15","#111827"],
  ["Oriente Petrolero",66,"#15803d","#ffffff"],["Always Ready FC",69,"#dc2626","#ffffff"],
  ["Barcelona del Guayas",72,"#facc15","#111827"],["Emelec Azul",71,"#2563eb","#cbd5e1"],
  ["LDU Andina",73,"#ffffff","#dc2626"],["Independiente del Valle",74,"#111827","#f8fafc"],
  ["Caracas Metropolitano",68,"#dc2626","#111827"],["Táchira Aurinegro",69,"#facc15","#111827"],
  ["Monagas Oriental",66,"#7e22ce","#ffffff"],["Puerto Cabello FC",67,"#f97316","#1e3a8a"],
  ["América del Valle",72,"#dc2626","#ffffff"],["Millonarios Central",73,"#2563eb","#ffffff"],
  ["Atlético Cafetero",71,"#166534","#ffffff"],["Junior Caribe",70,"#dc2626","#ffffff"],
  ["Libertadores FC",69,"#312e81","#facc15"],["Continental 1908",68,"#0f766e","#ffffff"],
  ["Academia del Sol",67,"#ea580c","#ffffff"],["Deportivo Cóndor",70,"#1f2937","#f8fafc"]
];

const rand=(a,b)=>Math.floor(Math.random()*(b-a+1))+a;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const shuffle=arr=>{
  const a=[...arr];
  for(let i=a.length-1;i>0;i--){const j=rand(0,i);[a[i],a[j]]=[a[j],a[i]]}
  return a;
};
const randomName=()=>`${first[rand(0,first.length-1)]} ${last[rand(0,last.length-1)]}`;

function makeFriendCode(){return crypto.randomBytes(4).toString("hex").toUpperCase().slice(0,6)}

async function ensureFriendCode(client,clubId){
  const r=await client.query(`SELECT friend_code FROM clubs WHERE id=$1`,[clubId]);
  if(r.rows[0]?.friend_code)return r.rows[0].friend_code;
  for(let i=0;i<20;i++){
    const code=makeFriendCode();
    try{
      await client.query(`UPDATE clubs SET friend_code=$2 WHERE id=$1`,[clubId,code]);
      return code;
    }catch(e){if(e.code!=="23505")throw e}
  }
  throw new Error("Falha ao gerar código do clube.");
}

function makePlayer(position,lo=58,hi=73){
  const rating=rand(lo,hi);
  const variance=()=>clamp(rating+rand(-11,11),20,95);
  let pace=variance(),shooting=variance(),passing=variance(),defending=variance();
  if(position==="GK"){shooting=clamp(rating-rand(22,34),20,60);defending=clamp(rating+rand(-4,7),40,95)}
  if(position==="DEF"){defending=clamp(rating+rand(-1,8),40,95);shooting=clamp(rating-rand(8,18),20,85)}
  if(position==="MID")passing=clamp(rating+rand(0,7),40,95);
  if(position==="ATT"){shooting=clamp(rating+rand(0,8),40,95);defending=clamp(rating-rand(12,24),20,80)}
  const price=Math.round((rating*rating*.42+rand(0,450))/50)*50;
  return {name:randomName(),position,rating,pace,shooting,passing,defending,price,age:rand(18,33)};
}

async function insertRoster(client,clubId,lo=58,hi=73){
  const plan=[["GK",2,1],["DEF",6,4],["MID",6,3],["ATT",4,3]];
  for(const [pos,count,starters] of plan){
    for(let i=0;i<count;i++){
      const p=makePlayer(pos,lo,hi);
      await client.query(`
        INSERT INTO players(club_id,name,position,rating,pace,shooting,passing,defending,price,is_starter,age)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      `,[clubId,p.name,p.position,p.rating,p.pace,p.shooting,p.passing,p.defending,p.price,i<starters,p.age]);
    }
  }
}

async function seedAiClubs(){
  await tx(async client=>{
    for(const [name,rating,primary,secondary] of aiClubData){
      const r=await client.query(`
        INSERT INTO clubs(name,is_ai,team_rating,coins,primary_color,secondary_color)
        VALUES($1,TRUE,$2,0,$3,$4)
        ON CONFLICT(name) DO UPDATE SET
          is_ai=TRUE,
          team_rating=EXCLUDED.team_rating,
          primary_color=COALESCE(clubs.primary_color,EXCLUDED.primary_color),
          secondary_color=COALESCE(clubs.secondary_color,EXCLUDED.secondary_color)
        RETURNING id
      `,[name,rating,primary,secondary]);
      await ensureFriendCode(client,r.rows[0].id);
    }
    const missing=await client.query(`SELECT id FROM clubs WHERE friend_code IS NULL`);
    for(const c of missing.rows)await ensureFriendCode(client,c.id);
  });
}

async function oneTimeReset(){
  const done=await q(`SELECT value FROM app_meta WHERE key=$1`,[RESET_KEY]);
  if(done.rowCount)return;
  await tx(async client=>{
    await client.query(`DELETE FROM libertadores_fixtures`);
    await client.query(`DELETE FROM libertadores_entries`);
    await client.query(`DELETE FROM libertadores_seasons`);
    await client.query(`DELETE FROM league_fixtures`);
    await client.query(`DELETE FROM league_entries`);
    await client.query(`DELETE FROM league_seasons`);
    await client.query(`DELETE FROM matches`);
    await client.query(`DELETE FROM players`);
    await client.query(`
      UPDATE clubs SET
        coins=CASE WHEN is_ai THEN 0 ELSE 3500 END,
        formation='4-3-3',
        team_rating=CASE WHEN is_ai THEN team_rating ELSE 68 END,
        points=0,wins=0,draws=0,losses=0,goals_for=0,goals_against=0
    `);
    await client.query(`INSERT INTO app_meta(key,value) VALUES($1,$2)`,[RESET_KEY,new Date().toISOString()]);
  });
}

async function ensureRostersAndMarket(){
  await tx(async client=>{
    const clubs=await client.query(`SELECT id,is_ai,team_rating FROM clubs`);
    for(const c of clubs.rows){
      const count=await client.query(`SELECT COUNT(*)::int count FROM players WHERE club_id=$1`,[c.id]);
      if(count.rows[0].count<18){
        await client.query(`DELETE FROM players WHERE club_id=$1`,[c.id]);
        if(c.is_ai){
          const base=Number(c.team_rating)||68;
          await insertRoster(client,c.id,Math.max(56,base-7),Math.min(82,base+6));
        }else{
          await insertRoster(client,c.id,58,73);
        }
      }
    }
  });
  const free=await q(`SELECT COUNT(*)::int count FROM players WHERE club_id IS NULL`);
  const pos=["GK","DEF","MID","ATT"];
  for(let i=free.rows[0].count;i<36;i++){
    const p=makePlayer(pos[rand(0,3)],62,82);
    await q(`
      INSERT INTO players(name,position,rating,pace,shooting,passing,defending,price,age)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
    `,[p.name,p.position,p.rating,p.pace,p.shooting,p.passing,p.defending,p.price,p.age]);
  }
}

function hashPassword(password,salt=crypto.randomBytes(16).toString("hex")){
  return {salt,hash:crypto.scryptSync(password,salt,64).toString("hex")}
}
function verifyPassword(password,salt,expected){
  const a=crypto.scryptSync(password,salt,64),b=Buffer.from(expected,"hex");
  return a.length===b.length&&crypto.timingSafeEqual(a,b)
}
function sign(uid){
  const payload=Buffer.from(JSON.stringify({uid:String(uid),exp:Date.now()+2592000000})).toString("base64url");
  const sig=crypto.createHmac("sha256",SECRET).update(payload).digest("base64url");
  return `${payload}.${sig}`
}
function session(token){
  if(!token||!token.includes("."))return null;
  const [payload,sig]=token.split(".");
  const expected=crypto.createHmac("sha256",SECRET).update(payload).digest("base64url");
  const a=Buffer.from(sig),b=Buffer.from(expected);
  if(a.length!==b.length||!crypto.timingSafeEqual(a,b))return null;
  try{const s=JSON.parse(Buffer.from(payload,"base64url").toString());return s.exp>Date.now()?s:null}catch{return null}
}
function cookies(header=""){
  const out={};
  for(const part of header.split(";")){const i=part.indexOf("=");if(i>0)out[part.slice(0,i).trim()]=decodeURIComponent(part.slice(i+1).trim())}
  return out
}
function setCookie(res,uid){
  const secure=process.env.NODE_ENV==="production"?"; Secure":"";
  res.setHeader("Set-Cookie",`${COOKIE}=${encodeURIComponent(sign(uid))}; HttpOnly; Path=/; SameSite=Lax; Max-Age=2592000${secure}`)
}
function clearCookie(res){
  const secure=process.env.NODE_ENV==="production"?"; Secure":"";
  res.setHeader("Set-Cookie",`${COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${secure}`)
}
async function auth(req,res,next){
  try{
    const s=session(cookies(req.headers.cookie||"")[COOKIE]);
    if(!s)return res.status(401).json({error:"Não autenticado."});
    const u=await q(`SELECT id,email FROM users WHERE id=$1`,[s.uid]);
    if(!u.rowCount)return res.status(401).json({error:"Sessão inválida."});
    req.user=u.rows[0];next()
  }catch(e){next(e)}
}

async function getClubForUser(userId){
  const r=await q(`SELECT * FROM clubs WHERE user_id=$1`,[userId]);
  return r.rows[0]||null
}

async function getClubRating(clubId,client=pool){
  const r=await client.query(`SELECT COALESCE(ROUND(AVG(rating)),60)::int rating FROM players WHERE club_id=$1 AND is_starter=TRUE`,[clubId]);
  return r.rows[0].rating
}

function poisson(lambda){
  const L=Math.exp(-lambda);let k=0,p=1;
  do{k++;p*=Math.random()}while(p>L);
  return k-1
}

function weightedPick(players){
  const weighted=[];
  for(const p of players){
    const base=p.position==="ATT"?7:p.position==="MID"?4:p.position==="DEF"?2:1;
    const extra=Math.max(1,Math.floor((p.rating-50)/10));
    for(let i=0;i<base+extra;i++)weighted.push(p)
  }
  return weighted[rand(0,weighted.length-1)]||players[0]
}

async function startersForClub(client,clubId){
  let r=await client.query(`SELECT * FROM players WHERE club_id=$1 AND is_starter=TRUE ORDER BY rating DESC`,[clubId]);
  if(r.rowCount===11&&r.rows.some(p=>p.position==="GK"))return r.rows;
  const all=await client.query(`
    SELECT * FROM players WHERE club_id=$1
    ORDER BY CASE position WHEN 'GK' THEN 1 WHEN 'DEF' THEN 2 WHEN 'MID' THEN 3 ELSE 4 END,rating DESC
  `,[clubId]);
  if(all.rowCount<11)throw Object.assign(new Error("Clube sem jogadores suficientes."),{status:400});
  const gk=all.rows.find(p=>p.position==="GK");
  if(!gk)throw Object.assign(new Error("Clube sem goleiro."),{status:400});
  const chosen=[gk];
  for(const p of all.rows){if(chosen.length>=11)break;if(String(p.id)!==String(gk.id))chosen.push(p)}
  await client.query(`UPDATE players SET is_starter=FALSE WHERE club_id=$1`,[clubId]);
  await client.query(`UPDATE players SET is_starter=TRUE WHERE id=ANY($1::bigint[])`,[chosen.map(p=>p.id)]);
  return chosen
}

function buildEvents(clubId,starters,goals){
  const events=[];
  for(let i=0;i<goals;i++){
    const scorer=weightedPick(starters.filter(p=>p.position!=="GK"));
    const pool=starters.filter(p=>String(p.id)!==String(scorer.id)&&p.position!=="GK");
    const assist=pool.length&&Math.random()<.72?weightedPick(pool):null;
    events.push({
      type:"goal",clubId,minute:rand(3,89),scorerId:scorer.id,scorerName:scorer.name,
      assistId:assist?.id||null,assistName:assist?.name||null,
      text:`Gol de ${scorer.name}${assist?` (assistência de ${assist.name})`:""}`
    })
  }
  const yellows=Math.random()<.7?rand(0,2):0;
  for(let i=0;i<yellows;i++){
    const p=starters[rand(0,starters.length-1)];
    events.push({type:"yellow",clubId,minute:rand(10,88),playerId:p.id,playerName:p.name,text:`Cartão amarelo para ${p.name}`})
  }
  if(Math.random()<.07){
    const p=starters[rand(0,starters.length-1)];
    events.push({type:"red",clubId,minute:rand(40,88),playerId:p.id,playerName:p.name,text:`Cartão vermelho para ${p.name}`})
  }
  return events
}

async function applyPlayerStats(client,clubId,starters,conceded,events){
  await client.query(`UPDATE players SET appearances=appearances+1 WHERE id=ANY($1::bigint[])`,[starters.map(p=>p.id)]);
  if(conceded===0){
    const gk=starters.find(p=>p.position==="GK");
    if(gk)await client.query(`UPDATE players SET clean_sheets=clean_sheets+1 WHERE id=$1`,[gk.id])
  }
  for(const ev of events.filter(e=>String(e.clubId)===String(clubId))){
    if(ev.type==="goal"){
      await client.query(`UPDATE players SET goals=goals+1 WHERE id=$1`,[ev.scorerId]);
      if(ev.assistId)await client.query(`UPDATE players SET assists=assists+1 WHERE id=$1`,[ev.assistId])
    }
    if(ev.type==="yellow")await client.query(`UPDATE players SET yellow_cards=yellow_cards+1 WHERE id=$1`,[ev.playerId]);
    if(ev.type==="red")await client.query(`UPDATE players SET red_cards=red_cards+1 WHERE id=$1`,[ev.playerId])
  }
}

async function simulateScoreAndStats(client,homeClubId,awayClubId){
  const clubs=await client.query(`SELECT * FROM clubs WHERE id=ANY($1::bigint[])`,[[homeClubId,awayClubId]]);
  const home=clubs.rows.find(c=>String(c.id)===String(homeClubId));
  const away=clubs.rows.find(c=>String(c.id)===String(awayClubId));
  if(!home||!away)throw new Error("Clube não encontrado.");

  const hs=await startersForClub(client,home.id);
  const as=await startersForClub(client,away.id);
  const hr=await getClubRating(home.id,client);
  const ar=await getClubRating(away.id,client);
  const hg=Math.min(7,poisson(clamp(1.40+(hr-ar)*.045,.30,3.8)));
  const ag=Math.min(7,poisson(clamp(1.20+(ar-hr)*.045,.30,3.6)));
  const events=[...buildEvents(home.id,hs,hg),...buildEvents(away.id,as,ag)].sort((a,b)=>a.minute-b.minute);
  await applyPlayerStats(client,home.id,hs,ag,events);
  await applyPlayerStats(client,away.id,as,hg,events);
  await client.query(`UPDATE clubs SET team_rating=$2 WHERE id=$1`,[home.id,hr]);
  await client.query(`UPDATE clubs SET team_rating=$2 WHERE id=$1`,[away.id,ar]);
  return {home,away,homeRating:hr,awayRating:ar,homeGoals:hg,awayGoals:ag,events}
}

function generateDoubleRoundRobin(teamIds){
  if(teamIds.length%2!==0)throw new Error("Quantidade de times precisa ser par.");
  let arr=[...teamIds];
  const n=arr.length;
  const firstHalf=[];
  for(let round=0;round<n-1;round++){
    const games=[];
    for(let i=0;i<n/2;i++){
      let a=arr[i],b=arr[n-1-i];
      if((round+i)%2===0)games.push([a,b]);else games.push([b,a])
    }
    firstHalf.push(games);
    arr=[arr[0],arr[n-1],...arr.slice(1,n-1)];
  }
  const secondHalf=firstHalf.map(games=>games.map(([h,a])=>[a,h]));
  return [...firstHalf,...secondHalf]
}

async function ensureLeagueSeason(ownerClubId){
  let r=await q(`SELECT * FROM league_seasons WHERE owner_club_id=$1 ORDER BY season_no DESC LIMIT 1`,[ownerClubId]);
  if(r.rowCount)return r.rows[0];

  return tx(async client=>{
    const seasonR=await client.query(`
      INSERT INTO league_seasons(owner_club_id,season_no,current_round,status)
      VALUES($1,1,1,'active') RETURNING *
    `,[ownerClubId]);
    const season=seasonR.rows[0];

    const ai=await client.query(`SELECT id FROM clubs WHERE is_ai=TRUE ORDER BY RANDOM() LIMIT 19`);
    if(ai.rowCount<19)throw new Error("Não há clubes suficientes para montar a liga.");
    const teamIds=[ownerClubId,...ai.rows.map(x=>x.id)];

    for(const id of teamIds){
      await client.query(`INSERT INTO league_entries(season_id,club_id) VALUES($1,$2)`,[season.id,id])
    }

    const schedule=generateDoubleRoundRobin(teamIds);
    for(let rno=0;rno<schedule.length;rno++){
      for(const [home,away] of schedule[rno]){
        await client.query(`
          INSERT INTO league_fixtures(season_id,round_no,home_club_id,away_club_id)
          VALUES($1,$2,$3,$4)
        `,[season.id,rno+1,home,away])
      }
    }
    return season
  })
}

async function leagueStandings(client,seasonId){
  const r=await client.query(`
    SELECT e.*,c.name,c.primary_color,c.secondary_color,c.crest_data,c.team_rating,c.is_ai,
      (e.goals_for-e.goals_against) goal_difference
    FROM league_entries e JOIN clubs c ON c.id=e.club_id
    WHERE e.season_id=$1
    ORDER BY e.points DESC,(e.goals_for-e.goals_against) DESC,e.goals_for DESC,c.name
  `,[seasonId]);
  return r.rows
}

async function updateLeagueEntry(client,seasonId,clubId,gf,ga){
  const result=gf>ga?"win":gf===ga?"draw":"loss";
  const pts=result==="win"?3:result==="draw"?1:0;
  await client.query(`
    UPDATE league_entries SET
      points=points+$3,
      wins=wins+$4,
      draws=draws+$5,
      losses=losses+$6,
      goals_for=goals_for+$7,
      goals_against=goals_against+$8
    WHERE season_id=$1 AND club_id=$2
  `,[seasonId,clubId,pts,result==="win"?1:0,result==="draw"?1:0,result==="loss"?1:0,gf,ga]);

  await client.query(`
    UPDATE clubs SET
      points=points+$2,wins=wins+$3,draws=draws+$4,losses=losses+$5,
      goals_for=goals_for+$6,goals_against=goals_against+$7
    WHERE id=$1
  `,[clubId,pts,result==="win"?1:0,result==="draw"?1:0,result==="loss"?1:0,gf,ga])
}

async function createLibertadores(ownerClubId,leagueSeasonId,client){
  const existing=await client.query(`SELECT * FROM libertadores_seasons WHERE owner_club_id=$1 AND league_season_id=$2`,[ownerClubId,leagueSeasonId]);
  if(existing.rowCount)return existing.rows[0];

  const standings=await leagueStandings(client,leagueSeasonId);
  const qualified=standings.slice(0,4).map(x=>x.club_id);
  const leagueIds=standings.map(x=>x.club_id);

  const extras=await client.query(`
    SELECT id FROM clubs
    WHERE is_ai=TRUE AND NOT (id=ANY($1::bigint[]))
    ORDER BY RANDOM() LIMIT 28
  `,[leagueIds]);

  if(extras.rowCount<28)throw new Error("Não há clubes suficientes para criar a Libertadores.");

  const sR=await client.query(`
    INSERT INTO libertadores_seasons(owner_club_id,league_season_id,status,current_matchday,current_stage,current_leg)
    VALUES($1,$2,'group',1,'GROUP',1) RETURNING *
  `,[ownerClubId,leagueSeasonId]);
  const season=sR.rows[0];

  const teams=shuffle([
    ...qualified.map(id=>({id,source:"league_top4"})),
    ...extras.rows.map(x=>({id:x.id,source:"random"}))
  ]);
  const groups="ABCDEFGH".split("");
  for(let i=0;i<32;i++){
    const group=groups[Math.floor(i/4)];
    await client.query(`
      INSERT INTO libertadores_entries(season_id,club_id,source,group_name)
      VALUES($1,$2,$3,$4)
    `,[season.id,teams[i].id,teams[i].source,group])
  }

  for(const group of groups){
    const members=teams.slice(groups.indexOf(group)*4,groups.indexOf(group)*4+4).map(x=>x.id);
    const rounds=generateDoubleRoundRobin(members);
    for(let md=0;md<6;md++){
      for(const [home,away] of rounds[md]){
        await client.query(`
          INSERT INTO libertadores_fixtures(season_id,stage,group_name,matchday,leg,home_club_id,away_club_id)
          VALUES($1,'GROUP',$2,$3,1,$4,$5)
        `,[season.id,group,md+1,home,away])
      }
    }
  }
  return season
}

async function playLeagueRound(ownerClubId){
  const season=await ensureLeagueSeason(ownerClubId);
  if(season.status==="finished")throw Object.assign(new Error("A liga já terminou. A Libertadores está disponível."),{status:400});
  const round=season.current_round;

  return tx(async client=>{
    const fixtures=await client.query(`
      SELECT * FROM league_fixtures WHERE season_id=$1 AND round_no=$2 ORDER BY id
      FOR UPDATE
    `,[season.id,round]);
    if(!fixtures.rowCount)throw new Error("Rodada não encontrada.");

    let userMatch=null;
    const results=[];
    for(const f of fixtures.rows){
      if(f.played)continue;
      const sim=await simulateScoreAndStats(client,f.home_club_id,f.away_club_id);
      await updateLeagueEntry(client,season.id,sim.home.id,sim.homeGoals,sim.awayGoals);
      await updateLeagueEntry(client,season.id,sim.away.id,sim.awayGoals,sim.homeGoals);
      await client.query(`
        UPDATE league_fixtures SET played=TRUE,home_goals=$2,away_goals=$3,events=$4::jsonb,played_at=NOW()
        WHERE id=$1
      `,[f.id,sim.homeGoals,sim.awayGoals,JSON.stringify(sim.events)]);

      results.push({
        home:sim.home.name,away:sim.away.name,homeGoals:sim.homeGoals,awayGoals:sim.awayGoals
      });

      if(String(sim.home.id)===String(ownerClubId)||String(sim.away.id)===String(ownerClubId)){
        const userIsHome=String(sim.home.id)===String(ownerClubId);
        const ug=userIsHome?sim.homeGoals:sim.awayGoals;
        const og=userIsHome?sim.awayGoals:sim.homeGoals;
        const userClub=userIsHome?sim.home:sim.away;
        const opponent=userIsHome?sim.away:sim.home;
        const ur=userIsHome?sim.homeRating:sim.awayRating;
        const or=userIsHome?sim.awayRating:sim.homeRating;
        const result=ug>og?"win":ug===og?"draw":"loss";
        const reward=result==="win"?180:result==="draw"?90:50;
        await client.query(`UPDATE clubs SET coins=coins+$2 WHERE id=$1`,[ownerClubId,reward]);
        await client.query(`
          INSERT INTO matches(user_club_id,opponent_club_id,user_goals,opponent_goals,reward,user_rating,opponent_rating,events,match_type)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,'league')
        `,[ownerClubId,opponent.id,ug,og,reward,ur,or,JSON.stringify(sim.events)]);
        userMatch={result,reward,userClub:userClub.name,opponent:opponent.name,userGoals:ug,opponentGoals:og,userRating:ur,opponentRating:or,matchType:"league",events:sim.events.map(e=>({minute:e.minute,text:e.text,type:e.type,clubId:e.clubId}))}
      }
    }

    if(round>=38){
      const table=await leagueStandings(client,season.id);
      await client.query(`
        UPDATE league_seasons SET status='finished',current_round=39,champion_club_id=$2,finished_at=NOW() WHERE id=$1
      `,[season.id,table[0].club_id]);
      await createLibertadores(ownerClubId,season.id,client)
    }else{
      await client.query(`UPDATE league_seasons SET current_round=current_round+1 WHERE id=$1`,[season.id])
    }

    return {round,results,userMatch}
  })
}

async function libStandings(client,seasonId,groupName){
  const r=await client.query(`
    SELECT e.*,c.name,c.primary_color,c.secondary_color,c.crest_data,c.team_rating,
      (e.goals_for-e.goals_against) goal_difference
    FROM libertadores_entries e JOIN clubs c ON c.id=e.club_id
    WHERE e.season_id=$1 AND e.group_name=$2
    ORDER BY e.points DESC,(e.goals_for-e.goals_against) DESC,e.goals_for DESC,c.name
  `,[seasonId,groupName]);
  return r.rows
}

async function updateLibEntry(client,seasonId,clubId,gf,ga){
  const result=gf>ga?"win":gf===ga?"draw":"loss";
  const pts=result==="win"?3:result==="draw"?1:0;
  await client.query(`
    UPDATE libertadores_entries SET
      points=points+$3,wins=wins+$4,draws=draws+$5,losses=losses+$6,
      goals_for=goals_for+$7,goals_against=goals_against+$8
    WHERE season_id=$1 AND club_id=$2
  `,[seasonId,clubId,pts,result==="win"?1:0,result==="draw"?1:0,result==="loss"?1:0,gf,ga])
}

function stageLabel(stage){
  return {R16:"Oitavas",QF:"Quartas",SF:"Semifinal",FINAL:"Final"}[stage]||stage
}

async function generateKnockoutStage(client,seasonId,stage,teamIds){
  const shuffled=shuffle(teamIds);
  const pairs=[];
  for(let i=0;i<shuffled.length;i+=2)pairs.push([shuffled[i],shuffled[i+1]]);
  for(let i=0;i<pairs.length;i++){
    const [a,b]=pairs[i];
    const tie=`${stage}-${i+1}`;
    if(stage==="FINAL"){
      await client.query(`
        INSERT INTO libertadores_fixtures(season_id,stage,tie_key,bracket_slot,leg,home_club_id,away_club_id)
        VALUES($1,$2,$3,$4,1,$5,$6)
      `,[seasonId,stage,tie,i+1,a,b])
    }else{
      await client.query(`
        INSERT INTO libertadores_fixtures(season_id,stage,tie_key,bracket_slot,leg,home_club_id,away_club_id)
        VALUES($1,$2,$3,$4,1,$5,$6),($1,$2,$3,$4,2,$6,$5)
      `,[seasonId,stage,tie,i+1,a,b])
    }
  }
}

async function generateRoundOf16(client,seasonId){
  const groups="ABCDEFGH".split("");
  const winners=[],runners=[];
  for(const g of groups){
    const s=await libStandings(client,seasonId,g);
    winners.push({id:s[0].club_id,group:g});
    runners.push({id:s[1].club_id,group:g})
  }
  let draw=null;
  for(let attempt=0;attempt<300;attempt++){
    const rr=shuffle(runners);
    if(winners.every((w,i)=>w.group!==rr[i].group)){draw=rr;break}
  }
  if(!draw)draw=shuffle(runners);
  for(let i=0;i<8;i++){
    const tie=`R16-${i+1}`;
    const a=draw[i].id,b=winners[i].id;
    await client.query(`
      INSERT INTO libertadores_fixtures(season_id,stage,tie_key,bracket_slot,leg,home_club_id,away_club_id)
      VALUES($1,'R16',$2,$3,1,$4,$5),($1,'R16',$2,$3,2,$5,$4)
    `,[seasonId,tie,i+1,a,b])
  }
}

async function knockoutWinners(client,seasonId,stage){
  const ties=await client.query(`
    SELECT DISTINCT tie_key,bracket_slot FROM libertadores_fixtures
    WHERE season_id=$1 AND stage=$2 ORDER BY bracket_slot
  `,[seasonId,stage]);
  const winners=[];
  for(const t of ties.rows){
    const fs=await client.query(`
      SELECT * FROM libertadores_fixtures WHERE season_id=$1 AND stage=$2 AND tie_key=$3 ORDER BY leg
    `,[seasonId,stage,t.tie_key]);
    const clubs=[...new Set(fs.rows.flatMap(x=>[String(x.home_club_id),String(x.away_club_id)]))];
    const agg=new Map(clubs.map(id=>[id,0]));
    for(const f of fs.rows){
      agg.set(String(f.home_club_id),agg.get(String(f.home_club_id))+Number(f.home_goals||0));
      agg.set(String(f.away_club_id),agg.get(String(f.away_club_id))+Number(f.away_goals||0))
    }
    let [a,b]=clubs;
    let winner;
    if(agg.get(a)>agg.get(b))winner=a;
    else if(agg.get(b)>agg.get(a))winner=b;
    else{
      winner=Math.random()<.5?a:b;
      await client.query(`
        UPDATE libertadores_fixtures SET penalty_winner_club_id=$4
        WHERE season_id=$1 AND stage=$2 AND tie_key=$3 AND leg=(SELECT MAX(leg) FROM libertadores_fixtures WHERE season_id=$1 AND stage=$2 AND tie_key=$3)
      `,[seasonId,stage,t.tie_key,winner])
    }
    winners.push(Number(winner))
  }
  return winners
}

async function playLibertadoresNext(ownerClubId){
  const league=await ensureLeagueSeason(ownerClubId);
  if(league.status!=="finished")throw Object.assign(new Error("A Libertadores começa após a 38ª rodada da Liga."),{status:400});

  let sR=await q(`SELECT * FROM libertadores_seasons WHERE owner_club_id=$1 AND league_season_id=$2`,[ownerClubId,league.id]);
  if(!sR.rowCount){
    await tx(async client=>{await createLibertadores(ownerClubId,league.id,client)});
    sR=await q(`SELECT * FROM libertadores_seasons WHERE owner_club_id=$1 AND league_season_id=$2`,[ownerClubId,league.id])
  }
  const season=sR.rows[0];
  if(season.status==="finished")throw Object.assign(new Error("A Libertadores já terminou."),{status:400});

  return tx(async client=>{
    let fixtures,description;

    if(season.current_stage==="GROUP"){
      fixtures=await client.query(`
        SELECT * FROM libertadores_fixtures
        WHERE season_id=$1 AND stage='GROUP' AND matchday=$2 ORDER BY group_name,id FOR UPDATE
      `,[season.id,season.current_matchday]);
      description=`Fase de grupos — rodada ${season.current_matchday}/6`;

      for(const f of fixtures.rows){
        if(f.played)continue;
        const sim=await simulateScoreAndStats(client,f.home_club_id,f.away_club_id);
        await updateLibEntry(client,season.id,sim.home.id,sim.homeGoals,sim.awayGoals);
        await updateLibEntry(client,season.id,sim.away.id,sim.awayGoals,sim.homeGoals);
        await client.query(`
          UPDATE libertadores_fixtures SET played=TRUE,home_goals=$2,away_goals=$3,events=$4::jsonb,played_at=NOW() WHERE id=$1
        `,[f.id,sim.homeGoals,sim.awayGoals,JSON.stringify(sim.events)])
      }

      if(season.current_matchday>=6){
        await generateRoundOf16(client,season.id);
        await client.query(`
          UPDATE libertadores_seasons SET status='knockout',current_stage='R16',current_leg=1,current_matchday=7 WHERE id=$1
        `,[season.id])
      }else{
        await client.query(`UPDATE libertadores_seasons SET current_matchday=current_matchday+1 WHERE id=$1`,[season.id])
      }
    }else{
      const stage=season.current_stage;
      const leg=stage==="FINAL"?1:season.current_leg;
      fixtures=await client.query(`
        SELECT * FROM libertadores_fixtures
        WHERE season_id=$1 AND stage=$2 AND leg=$3 ORDER BY bracket_slot,id FOR UPDATE
      `,[season.id,stage,leg]);
      description=`${stageLabel(stage)} — ${stage==="FINAL"?"jogo único":leg===1?"ida":"volta"}`;

      for(const f of fixtures.rows){
        if(f.played)continue;
        const sim=await simulateScoreAndStats(client,f.home_club_id,f.away_club_id);
        await client.query(`
          UPDATE libertadores_fixtures SET played=TRUE,home_goals=$2,away_goals=$3,events=$4::jsonb,played_at=NOW() WHERE id=$1
        `,[f.id,sim.homeGoals,sim.awayGoals,JSON.stringify(sim.events)])
      }

      if(stage==="FINAL"){
        const f=(await client.query(`SELECT * FROM libertadores_fixtures WHERE season_id=$1 AND stage='FINAL' LIMIT 1`,[season.id])).rows[0];
        let champion;
        if(f.home_goals>f.away_goals)champion=f.home_club_id;
        else if(f.away_goals>f.home_goals)champion=f.away_club_id;
        else{
          champion=Math.random()<.5?f.home_club_id:f.away_club_id;
          await client.query(`UPDATE libertadores_fixtures SET penalty_winner_club_id=$2 WHERE id=$1`,[f.id,champion])
        }
        await client.query(`
          UPDATE libertadores_seasons SET status='finished',champion_club_id=$2,finished_at=NOW() WHERE id=$1
        `,[season.id,champion])
      }else if(leg===1){
        await client.query(`UPDATE libertadores_seasons SET current_leg=2 WHERE id=$1`,[season.id])
      }else{
        const winners=await knockoutWinners(client,season.id,stage);
        const next=stage==="R16"?"QF":stage==="QF"?"SF":"FINAL";
        await generateKnockoutStage(client,season.id,next,winners);
        await client.query(`
          UPDATE libertadores_seasons SET current_stage=$2,current_leg=1 WHERE id=$1
        `,[season.id,next])
      }
    }

    const played=await client.query(`
      SELECT f.*,hc.name home_name,ac.name away_name
      FROM libertadores_fixtures f
      JOIN clubs hc ON hc.id=f.home_club_id JOIN clubs ac ON ac.id=f.away_club_id
      WHERE f.id=ANY($1::bigint[]) ORDER BY f.id
    `,[fixtures.rows.map(x=>x.id)]);

    return {description,matches:played.rows}
  })
}

async function competitionData(ownerClubId){
  const league=await ensureLeagueSeason(ownerClubId);
  const standings=await q(`
    SELECT e.*,c.name,c.primary_color,c.secondary_color,c.crest_data,c.team_rating,c.is_ai,
      (e.goals_for-e.goals_against) goal_difference
    FROM league_entries e JOIN clubs c ON c.id=e.club_id
    WHERE e.season_id=$1
    ORDER BY e.points DESC,(e.goals_for-e.goals_against) DESC,e.goals_for DESC,c.name
  `,[league.id]);

  const fixtures=await q(`
    SELECT f.*,hc.name home_name,ac.name away_name
    FROM league_fixtures f
    JOIN clubs hc ON hc.id=f.home_club_id JOIN clubs ac ON ac.id=f.away_club_id
    WHERE f.season_id=$1 ORDER BY f.round_no,f.id
  `,[league.id]);

  let libertadores=null;
  const libS=await q(`SELECT * FROM libertadores_seasons WHERE owner_club_id=$1 AND league_season_id=$2`,[ownerClubId,league.id]);
  if(libS.rowCount){
    const s=libS.rows[0];
    const entries=await q(`
      SELECT e.*,c.name,c.primary_color,c.secondary_color,c.crest_data,c.team_rating,
        (e.goals_for-e.goals_against) goal_difference
      FROM libertadores_entries e JOIN clubs c ON c.id=e.club_id
      WHERE e.season_id=$1
      ORDER BY e.group_name,e.points DESC,(e.goals_for-e.goals_against) DESC,e.goals_for DESC,c.name
    `,[s.id]);
    const libFix=await q(`
      SELECT f.*,hc.name home_name,ac.name away_name
      FROM libertadores_fixtures f
      JOIN clubs hc ON hc.id=f.home_club_id JOIN clubs ac ON ac.id=f.away_club_id
      WHERE f.season_id=$1
      ORDER BY CASE f.stage WHEN 'GROUP' THEN 1 WHEN 'R16' THEN 2 WHEN 'QF' THEN 3 WHEN 'SF' THEN 4 ELSE 5 END,
      f.matchday NULLS LAST,f.bracket_slot NULLS LAST,f.leg,f.id
    `,[s.id]);
    let champion=null;
    if(s.champion_club_id){
      const c=await q(`SELECT id,name,crest_data,primary_color,secondary_color FROM clubs WHERE id=$1`,[s.champion_club_id]);
      champion=c.rows[0]||null
    }
    libertadores={season:s,entries:entries.rows,fixtures:libFix.rows,champion}
  }

  return {league:{season:league,standings:standings.rows,fixtures:fixtures.rows},libertadores}
}

app.get("/health",async(_req,res,next)=>{try{await q("SELECT 1");res.json({ok:true})}catch(e){next(e)}});

app.post("/api/auth/register",async(req,res,next)=>{
  try{
    const email=String(req.body.email||"").trim().toLowerCase();
    const password=String(req.body.password||"");
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return res.status(400).json({error:"E-mail inválido."});
    if(password.length<6||password.length>128)return res.status(400).json({error:"A senha deve ter 6 a 128 caracteres."});
    const h=hashPassword(password);
    const r=await q(`INSERT INTO users(email,password_hash,password_salt) VALUES($1,$2,$3) RETURNING id,email`,[email,h.hash,h.salt]);
    setCookie(res,r.rows[0].id);res.status(201).json({user:r.rows[0]})
  }catch(e){if(e.code==="23505")return res.status(409).json({error:"Este e-mail já está cadastrado."});next(e)}
});

app.post("/api/auth/login",async(req,res,next)=>{
  try{
    const email=String(req.body.email||"").trim().toLowerCase(),password=String(req.body.password||"");
    const r=await q(`SELECT * FROM users WHERE email=$1`,[email]);
    if(!r.rowCount||!verifyPassword(password,r.rows[0].password_salt,r.rows[0].password_hash))return res.status(401).json({error:"E-mail ou senha incorretos."});
    setCookie(res,r.rows[0].id);res.json({ok:true})
  }catch(e){next(e)}
});
app.post("/api/auth/logout",(_req,res)=>{clearCookie(res);res.json({ok:true})});
app.get("/api/me",auth,async(req,res,next)=>{try{res.json({user:req.user,club:await getClubForUser(req.user.id)})}catch(e){next(e)}});

app.post("/api/club",auth,async(req,res,next)=>{
  try{
    const n=String(req.body.name||"").trim().replace(/\s+/g," "),pc=String(req.body.primaryColor||"#18864b"),sc=String(req.body.secondaryColor||"#f7fafc");
    if(n.length<3||n.length>30)return res.status(400).json({error:"Nome deve ter 3 a 30 caracteres."});
    if(!/^#[0-9a-fA-F]{6}$/.test(pc)||!/^#[0-9a-fA-F]{6}$/.test(sc))return res.status(400).json({error:"Cor inválida."});
    const created=await tx(async client=>{
      const ex=await client.query(`SELECT id FROM clubs WHERE user_id=$1`,[req.user.id]);
      if(ex.rowCount)throw Object.assign(new Error("Você já tem um clube."),{status:409});
      const cr=await client.query(`INSERT INTO clubs(user_id,name,primary_color,secondary_color) VALUES($1,$2,$3,$4) RETURNING *`,[req.user.id,n,pc,sc]);
      await ensureFriendCode(client,cr.rows[0].id);
      await insertRoster(client,cr.rows[0].id,58,73);
      return (await client.query(`SELECT * FROM clubs WHERE id=$1`,[cr.rows[0].id])).rows[0]
    });
    await ensureLeagueSeason(created.id);
    res.status(201).json({club:created})
  }catch(e){if(e.code==="23505")return res.status(409).json({error:"Nome de clube já utilizado."});next(e)}
});

app.put("/api/club/customize",auth,async(req,res,next)=>{
  try{
    const c=await getClubForUser(req.user.id);if(!c)return res.status(404).json({error:"Clube não encontrado."});
    const name=String(req.body.name||c.name).trim().replace(/\s+/g," "),primary=String(req.body.primaryColor||c.primary_color),secondary=String(req.body.secondaryColor||c.secondary_color);
    const crest=req.body.crestData===null?null:String(req.body.crestData||c.crest_data||"");
    if(name.length<3||name.length>30)return res.status(400).json({error:"Nome deve ter 3 a 30 caracteres."});
    if(!/^#[0-9a-fA-F]{6}$/.test(primary)||!/^#[0-9a-fA-F]{6}$/.test(secondary))return res.status(400).json({error:"Cor inválida."});
    if(crest&&!/^data:image\/(png|jpeg|webp);base64,/i.test(crest))return res.status(400).json({error:"Escudo inválido."});
    if(crest.length>700000)return res.status(400).json({error:"Escudo grande demais."});
    const r=await q(`UPDATE clubs SET name=$2,primary_color=$3,secondary_color=$4,crest_data=$5 WHERE id=$1 RETURNING *`,[c.id,name,primary,secondary,crest||null]);
    res.json({club:r.rows[0]})
  }catch(e){if(e.code==="23505")return res.status(409).json({error:"Esse nome já está em uso."});next(e)}
});

app.get("/api/dashboard",auth,async(req,res,next)=>{
  try{
    const c=await getClubForUser(req.user.id);
    if(!c)return res.json({club:null,players:[],market:[],matches:[],friends:[]});
    c.team_rating=await getClubRating(c.id);
    await ensureLeagueSeason(c.id);
    const [ps,mk,mt,fr]=await Promise.all([
      q(`SELECT * FROM players WHERE club_id=$1 ORDER BY is_starter DESC,CASE position WHEN 'GK' THEN 1 WHEN 'DEF' THEN 2 WHEN 'MID' THEN 3 ELSE 4 END,rating DESC`,[c.id]),
      q(`SELECT * FROM players WHERE club_id IS NULL ORDER BY rating DESC,price DESC LIMIT 36`),
      q(`SELECT m.*,o.name opponent_name,o.crest_data opponent_crest FROM matches m JOIN clubs o ON o.id=m.opponent_club_id WHERE m.user_club_id=$1 ORDER BY played_at DESC LIMIT 30`,[c.id]),
      q(`
        SELECT c.id,c.name,c.primary_color,c.secondary_color,c.crest_data,c.friend_code,c.team_rating
        FROM friendships f JOIN clubs c ON c.id=CASE WHEN f.club_a_id=$1 THEN f.club_b_id ELSE f.club_a_id END
        WHERE f.club_a_id=$1 OR f.club_b_id=$1 ORDER BY c.name
      `,[c.id])
    ]);
    res.json({club:c,players:ps.rows,market:mk.rows,matches:mt.rows,friends:fr.rows})
  }catch(e){next(e)}
});

app.get("/api/competitions",auth,async(req,res,next)=>{
  try{
    const c=await getClubForUser(req.user.id);if(!c)return res.status(404).json({error:"Clube não encontrado."});
    res.json(await competitionData(c.id))
  }catch(e){next(e)}
});

app.post("/api/league/play-round",auth,async(req,res,next)=>{
  try{
    const c=await getClubForUser(req.user.id);if(!c)return res.status(404).json({error:"Clube não encontrado."});
    res.json(await playLeagueRound(c.id))
  }catch(e){next(e)}
});

app.post("/api/libertadores/next",auth,async(req,res,next)=>{
  try{
    const c=await getClubForUser(req.user.id);if(!c)return res.status(404).json({error:"Clube não encontrado."});
    res.json(await playLibertadoresNext(c.id))
  }catch(e){next(e)}
});

app.get("/api/clubs/:id",auth,async(req,res,next)=>{
  try{
    const id=String(req.params.id||"");
    const c=await q(`SELECT id,name,primary_color,secondary_color,crest_data,friend_code,team_rating,points,wins,draws,losses,goals_for,goals_against,is_ai,formation FROM clubs WHERE id=$1`,[id]);
    if(!c.rowCount)return res.status(404).json({error:"Clube não encontrado."});
    const players=await q(`
      SELECT id,name,position,rating,pace,shooting,passing,defending,price,is_starter,age,appearances,goals,assists,yellow_cards,red_cards,clean_sheets
      FROM players WHERE club_id=$1 ORDER BY is_starter DESC,CASE position WHEN 'GK' THEN 1 WHEN 'DEF' THEN 2 WHEN 'MID' THEN 3 ELSE 4 END,rating DESC
    `,[id]);
    res.json({club:c.rows[0],players:players.rows})
  }catch(e){next(e)}
});

app.put("/api/lineup",auth,async(req,res,next)=>{
  try{
    const c=await getClubForUser(req.user.id);if(!c)return res.status(404).json({error:"Clube não encontrado."});
    const ids=Array.isArray(req.body.starterIds)?req.body.starterIds.map(String):[],formation=String(req.body.formation||"4-3-3");
    if(ids.length!==11||new Set(ids).size!==11)return res.status(400).json({error:"Selecione exatamente 11 titulares."});
    if(!["4-3-3","4-4-2","3-5-2"].includes(formation))return res.status(400).json({error:"Formação inválida."});
    const own=await q(`SELECT id,position FROM players WHERE club_id=$1 AND id=ANY($2::bigint[])`,[c.id,ids]);
    if(own.rowCount!==11||!own.rows.some(p=>p.position==="GK"))return res.status(400).json({error:"Escalação inválida; inclua um goleiro."});
    await tx(async client=>{
      await client.query(`UPDATE players SET is_starter=FALSE WHERE club_id=$1`,[c.id]);
      await client.query(`UPDATE players SET is_starter=TRUE WHERE club_id=$1 AND id=ANY($2::bigint[])`,[c.id,ids]);
      await client.query(`UPDATE clubs SET formation=$2 WHERE id=$1`,[c.id,formation])
    });
    res.json({ok:true})
  }catch(e){next(e)}
});

app.post("/api/players/:id/release",auth,async(req,res,next)=>{
  try{
    const c=await getClubForUser(req.user.id);if(!c)return res.status(404).json({error:"Clube não encontrado."});
    const pid=String(req.params.id||"");
    await tx(async client=>{
      const p=await client.query(`SELECT * FROM players WHERE id=$1 AND club_id=$2 FOR UPDATE`,[pid,c.id]);
      if(!p.rowCount)throw Object.assign(new Error("Jogador não encontrado."),{status:404});
      if(p.rows[0].is_starter)throw Object.assign(new Error("Tire o jogador dos titulares antes de rescindir."),{status:400});
      const count=await client.query(`SELECT COUNT(*)::int count FROM players WHERE club_id=$1`,[c.id]);
      if(count.rows[0].count<=12)throw Object.assign(new Error("Mantenha pelo menos 12 jogadores."),{status:400});
      if(p.rows[0].position==="GK"){
        const gk=await client.query(`SELECT COUNT(*)::int count FROM players WHERE club_id=$1 AND position='GK'`,[c.id]);
        if(gk.rows[0].count<=1)throw Object.assign(new Error("Mantenha pelo menos um goleiro."),{status:400})
      }
      await client.query(`UPDATE players SET club_id=NULL,is_starter=FALSE,price=GREATEST(100,ROUND(price*0.9)) WHERE id=$1`,[pid])
    });
    res.json({ok:true})
  }catch(e){next(e)}
});

app.post("/api/market/buy",auth,async(req,res,next)=>{
  try{
    const c=await getClubForUser(req.user.id);if(!c)return res.status(404).json({error:"Clube não encontrado."});
    const pid=String(req.body.playerId||"");
    await tx(async client=>{
      const p=await client.query(`SELECT * FROM players WHERE id=$1 AND club_id IS NULL FOR UPDATE`,[pid]);
      if(!p.rowCount)throw Object.assign(new Error("Jogador indisponível."),{status:409});
      const cc=await client.query(`SELECT coins FROM clubs WHERE id=$1 FOR UPDATE`,[c.id]);
      if(cc.rows[0].coins<p.rows[0].price)throw Object.assign(new Error("Moedas insuficientes."),{status:400});
      await client.query(`UPDATE clubs SET coins=coins-$2 WHERE id=$1`,[c.id,p.rows[0].price]);
      await client.query(`UPDATE players SET club_id=$2,is_starter=FALSE WHERE id=$1`,[pid,c.id])
    });
    await ensureRostersAndMarket();res.json({ok:true})
  }catch(e){next(e)}
});

app.post("/api/friends/add",auth,async(req,res,next)=>{
  try{
    const c=await getClubForUser(req.user.id);if(!c)return res.status(404).json({error:"Clube não encontrado."});
    const code=String(req.body.code||"").trim().toUpperCase();
    const target=await q(`SELECT id,name,is_ai FROM clubs WHERE friend_code=$1`,[code]);
    if(!target.rowCount)return res.status(404).json({error:"Código não encontrado."});
    if(String(target.rows[0].id)===String(c.id))return res.status(400).json({error:"Esse é seu próprio código."});
    if(target.rows[0].is_ai)return res.status(400).json({error:"Esse código pertence a um clube do sistema."});
    const a=Math.min(Number(c.id),Number(target.rows[0].id)),b=Math.max(Number(c.id),Number(target.rows[0].id));
    await q(`INSERT INTO friendships(club_a_id,club_b_id) VALUES($1,$2) ON CONFLICT DO NOTHING`,[a,b]);
    res.json({ok:true})
  }catch(e){next(e)}
});

app.delete("/api/friends/:clubId",auth,async(req,res,next)=>{
  try{
    const c=await getClubForUser(req.user.id);if(!c)return res.status(404).json({error:"Clube não encontrado."});
    const id=Number(req.params.clubId),a=Math.min(Number(c.id),id),b=Math.max(Number(c.id),id);
    await q(`DELETE FROM friendships WHERE club_a_id=$1 AND club_b_id=$2`,[a,b]);res.json({ok:true})
  }catch(e){next(e)}
});

app.post("/api/friends/:clubId/play",auth,async(req,res,next)=>{
  try{
    const c=await getClubForUser(req.user.id);if(!c)return res.status(404).json({error:"Clube não encontrado."});
    const friendId=Number(req.params.clubId),a=Math.min(Number(c.id),friendId),b=Math.max(Number(c.id),friendId);
    const f=await q(`SELECT id FROM friendships WHERE club_a_id=$1 AND club_b_id=$2`,[a,b]);
    if(!f.rowCount)return res.status(403).json({error:"Clube não está na sua lista de amigos."});

    const result=await tx(async client=>{
      const sim=await simulateScoreAndStats(client,c.id,friendId);
      const result=sim.homeGoals>sim.awayGoals?"win":sim.homeGoals===sim.awayGoals?"draw":"loss";
      await client.query(`
        INSERT INTO matches(user_club_id,opponent_club_id,user_goals,opponent_goals,reward,user_rating,opponent_rating,events,match_type)
        VALUES($1,$2,$3,$4,0,$5,$6,$7::jsonb,'friendly')
      `,[c.id,friendId,sim.homeGoals,sim.awayGoals,sim.homeRating,sim.awayRating,JSON.stringify(sim.events)]);
      return {result,reward:0,userClub:sim.home.name,opponent:sim.away.name,userGoals:sim.homeGoals,opponentGoals:sim.awayGoals,userRating:sim.homeRating,opponentRating:sim.awayRating,matchType:"friendly",events:sim.events.map(e=>({minute:e.minute,text:e.text,type:e.type,clubId:e.clubId}))}
    });
    res.json({match:result})
  }catch(e){next(e)}
});

app.get("/styles.css",(_req,res)=>res.sendFile(path.join(__dirname,"styles.css")));
app.get("/app.js",(_req,res)=>res.sendFile(path.join(__dirname,"app.js")));
app.get("/",(_req,res)=>res.sendFile(path.join(__dirname,"index.html")));

app.use((err,_req,res,_next)=>{
  console.error(err);
  const status=Number(err.status||500);
  res.status(status).json({error:status>=500?"Erro interno do servidor.":err.message})
});

async function start(){
  await initDb();
  await seedAiClubs();
  await oneTimeReset();
  await ensureRostersAndMarket();
  app.listen(PORT,"0.0.0.0",()=>console.log(`Dono do Clube v3 rodando na porta ${PORT}`))
}
start().catch(e=>{console.error("Falha ao iniciar:",e);process.exit(1)});
