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

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000
});

app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));

async function q(text, params = []) {
  return pool.query(text, params);
}

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

    CREATE INDEX IF NOT EXISTS idx_players_club ON players(club_id);
    CREATE INDEX IF NOT EXISTS idx_matches_user_club ON matches(user_club_id, played_at DESC);
  `);

  await q(`ALTER TABLE clubs ADD COLUMN IF NOT EXISTS crest_data TEXT`);
  await q(`ALTER TABLE clubs ADD COLUMN IF NOT EXISTS friend_code TEXT`);
  await q(`CREATE UNIQUE INDEX IF NOT EXISTS idx_clubs_friend_code ON clubs(friend_code) WHERE friend_code IS NOT NULL`);

  await q(`ALTER TABLE players ADD COLUMN IF NOT EXISTS appearances INTEGER NOT NULL DEFAULT 0`);
  await q(`ALTER TABLE players ADD COLUMN IF NOT EXISTS goals INTEGER NOT NULL DEFAULT 0`);
  await q(`ALTER TABLE players ADD COLUMN IF NOT EXISTS assists INTEGER NOT NULL DEFAULT 0`);
  await q(`ALTER TABLE players ADD COLUMN IF NOT EXISTS yellow_cards INTEGER NOT NULL DEFAULT 0`);
  await q(`ALTER TABLE players ADD COLUMN IF NOT EXISTS red_cards INTEGER NOT NULL DEFAULT 0`);
  await q(`ALTER TABLE players ADD COLUMN IF NOT EXISTS clean_sheets INTEGER NOT NULL DEFAULT 0`);
  await q(`ALTER TABLE players ADD COLUMN IF NOT EXISTS age INTEGER NOT NULL DEFAULT 24`);

  await q(`ALTER TABLE matches ADD COLUMN IF NOT EXISTS match_type TEXT NOT NULL DEFAULT 'league'`);
}

const first = [
  "Caio","Davi","Lucas","Rafael","Bruno","Henrique","Matheus","Pedro","Gustavo","Felipe",
  "André","Vitor","Diego","Gabriel","João","Thiago","Arthur","Murilo","Igor","Renan",
  "Enzo","Samuel","Daniel","Leandro","Vinícius","Nicolas","Heitor","Bernardo","Yuri","Otávio"
];
const last = [
  "Almeida","Rocha","Ferreira","Souza","Lima","Costa","Mendes","Silva","Ribeiro","Gomes",
  "Martins","Barbosa","Nunes","Teixeira","Moraes","Cardoso","Pires","Campos","Vieira","Freitas",
  "Monteiro","Azevedo","Duarte","Rezende"
];

const aiClubs = [
  ["Aurora FC",69,"#0f766e","#f8fafc"],
  ["Atlético Vale",67,"#b91c1c","#f8fafc"],
  ["Real Serra",72,"#1d4ed8","#f8fafc"],
  ["União Azul",66,"#0369a1","#facc15"],
  ["Estrela do Sul",71,"#7c3aed","#f8fafc"],
  ["Nacional 11",68,"#166534","#fde047"],
  ["Ferroviário City",70,"#9a3412","#f8fafc"],
  ["Imperial FC",73,"#111827","#f59e0b"],
  ["Vila Central",65,"#be123c","#f8fafc"]
];

const rand = (a,b) => Math.floor(Math.random() * (b-a+1)) + a;
const clamp = (n,a,b) => Math.max(a, Math.min(b,n));
const randomName = () => `${first[rand(0,first.length-1)]} ${last[rand(0,last.length-1)]}`;

function makeFriendCode() {
  return crypto.randomBytes(4).toString("hex").toUpperCase().slice(0, 6);
}

async function ensureFriendCode(client, clubId) {
  const r = await client.query(`SELECT friend_code FROM clubs WHERE id=$1`, [clubId]);
  if (r.rows[0]?.friend_code) return r.rows[0].friend_code;
  for (let i=0; i<20; i++) {
    const code = makeFriendCode();
    try {
      await client.query(`UPDATE clubs SET friend_code=$2 WHERE id=$1`, [clubId, code]);
      return code;
    } catch (e) {
      if (e.code !== "23505") throw e;
    }
  }
  throw new Error("Não foi possível gerar código de amizade.");
}

function makePlayer(position, lo=58, hi=73) {
  const rating = rand(lo,hi);
  const variance = () => clamp(rating + rand(-11,11),20,95);
  let pace=variance(), shooting=variance(), passing=variance(), defending=variance();

  if (position==="GK") {
    shooting=clamp(rating-rand(22,34),20,60);
    defending=clamp(rating+rand(-4,7),40,95);
  }
  if (position==="DEF") {
    defending=clamp(rating+rand(-1,8),40,95);
    shooting=clamp(rating-rand(8,18),20,85);
  }
  if (position==="MID") passing=clamp(rating+rand(0,7),40,95);
  if (position==="ATT") {
    shooting=clamp(rating+rand(0,8),40,95);
    defending=clamp(rating-rand(12,24),20,80);
  }

  const price=Math.round((rating*rating*.42+rand(0,450))/50)*50;
  return {
    name: randomName(),
    position,
    rating,
    pace,
    shooting,
    passing,
    defending,
    price,
    age: rand(18,33)
  };
}

async function insertRoster(client, clubId, lo=58, hi=73) {
  const plan=[["GK",2,1],["DEF",6,4],["MID",6,3],["ATT",4,3]];
  for (const [pos,count,starters] of plan) {
    for (let i=0; i<count; i++) {
      const p=makePlayer(pos,lo,hi);
      await client.query(`
        INSERT INTO players(
          club_id,name,position,rating,pace,shooting,passing,defending,price,is_starter,age
        ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      `,[clubId,p.name,p.position,p.rating,p.pace,p.shooting,p.passing,p.defending,p.price,i<starters,p.age]);
    }
  }
}

async function seed() {
  await tx(async client => {
    for (const [name,rating,primary,secondary] of aiClubs) {
      const c = await client.query(`
        INSERT INTO clubs(name,is_ai,team_rating,coins,primary_color,secondary_color)
        VALUES($1,TRUE,$2,0,$3,$4)
        ON CONFLICT(name) DO UPDATE SET team_rating=EXCLUDED.team_rating
        RETURNING id
      `,[name,rating,primary,secondary]);

      const clubId=c.rows[0].id;
      await ensureFriendCode(client, clubId);
      const count=await client.query(`SELECT COUNT(*)::int count FROM players WHERE club_id=$1`,[clubId]);
      if (count.rows[0].count < 18) {
        await client.query(`DELETE FROM players WHERE club_id=$1`,[clubId]);
        await insertRoster(client,clubId,Math.max(56,rating-7),Math.min(82,rating+6));
      }
    }

    const clubs = await client.query(`SELECT id FROM clubs WHERE friend_code IS NULL`);
    for (const c of clubs.rows) await ensureFriendCode(client, c.id);
  });

  const free = await q(`SELECT COUNT(*)::int count FROM players WHERE club_id IS NULL`);
  const positions=["GK","DEF","MID","ATT"];
  for (let i=free.rows[0].count; i<32; i++) {
    const p=makePlayer(positions[rand(0,3)],62,82);
    await q(`
      INSERT INTO players(name,position,rating,pace,shooting,passing,defending,price,age)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
    `,[p.name,p.position,p.rating,p.pace,p.shooting,p.passing,p.defending,p.price,p.age]);
  }
}

function hashPassword(password,salt=crypto.randomBytes(16).toString("hex")) {
  return {salt,hash:crypto.scryptSync(password,salt,64).toString("hex")};
}
function verifyPassword(password,salt,expected) {
  const a=crypto.scryptSync(password,salt,64), b=Buffer.from(expected,"hex");
  return a.length===b.length && crypto.timingSafeEqual(a,b);
}
function sign(uid) {
  const payload=Buffer.from(JSON.stringify({uid:String(uid),exp:Date.now()+2592000000})).toString("base64url");
  const sig=crypto.createHmac("sha256",SECRET).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}
function session(token) {
  if(!token||!token.includes(".")) return null;
  const [payload,sig]=token.split(".");
  const expected=crypto.createHmac("sha256",SECRET).update(payload).digest("base64url");
  const a=Buffer.from(sig),b=Buffer.from(expected);
  if(a.length!==b.length||!crypto.timingSafeEqual(a,b)) return null;
  try {
    const s=JSON.parse(Buffer.from(payload,"base64url").toString());
    return s.exp>Date.now()?s:null;
  } catch { return null; }
}
function cookies(header="") {
  const out={};
  for(const part of header.split(";")) {
    const i=part.indexOf("=");
    if(i>0) out[part.slice(0,i).trim()]=decodeURIComponent(part.slice(i+1).trim());
  }
  return out;
}
function setCookie(res,uid) {
  const secure=process.env.NODE_ENV==="production"?"; Secure":"";
  res.setHeader("Set-Cookie",`${COOKIE}=${encodeURIComponent(sign(uid))}; HttpOnly; Path=/; SameSite=Lax; Max-Age=2592000${secure}`);
}
function clearCookie(res) {
  const secure=process.env.NODE_ENV==="production"?"; Secure":"";
  res.setHeader("Set-Cookie",`${COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${secure}`);
}
async function auth(req,res,next) {
  try {
    const s=session(cookies(req.headers.cookie||"")[COOKIE]);
    if(!s) return res.status(401).json({error:"Não autenticado."});
    const u=await q(`SELECT id,email FROM users WHERE id=$1`,[s.uid]);
    if(!u.rowCount) return res.status(401).json({error:"Sessão inválida."});
    req.user=u.rows[0];
    next();
  } catch(e){ next(e); }
}

async function getClubForUser(userId) {
  const r=await q(`SELECT * FROM clubs WHERE user_id=$1`,[userId]);
  return r.rows[0]||null;
}

async function getClubRating(clubId, client=pool) {
  const r=await client.query(`
    SELECT COALESCE(ROUND(AVG(rating)),60)::int rating
    FROM players WHERE club_id=$1 AND is_starter=TRUE
  `,[clubId]);
  return r.rows[0].rating;
}

function poisson(lambda) {
  const L=Math.exp(-lambda);
  let k=0,p=1;
  do { k++; p*=Math.random(); } while(p>L);
  return k-1;
}

function weightedPick(players) {
  const weighted=[];
  for (const p of players) {
    const base = p.position==="ATT" ? 7 : p.position==="MID" ? 4 : p.position==="DEF" ? 2 : 1;
    const extra = Math.max(1, Math.floor((p.rating-50)/10));
    for(let i=0;i<base+extra;i++) weighted.push(p);
  }
  return weighted[rand(0,weighted.length-1)] || players[0];
}

async function startersForClub(client, clubId) {
  let r=await client.query(`
    SELECT * FROM players WHERE club_id=$1 AND is_starter=TRUE
    ORDER BY rating DESC
  `,[clubId]);

  if (r.rowCount===11 && r.rows.some(p=>p.position==="GK")) return r.rows;

  const all=await client.query(`
    SELECT * FROM players WHERE club_id=$1
    ORDER BY CASE position WHEN 'GK' THEN 1 WHEN 'DEF' THEN 2 WHEN 'MID' THEN 3 ELSE 4 END, rating DESC
  `,[clubId]);

  if (all.rowCount<11) throw Object.assign(new Error("O clube não possui jogadores suficientes."),{status:400});

  const selected=[];
  const gk=all.rows.find(p=>p.position==="GK");
  if(!gk) throw Object.assign(new Error("O clube não possui goleiro."),{status:400});
  selected.push(gk);
  for(const p of all.rows) {
    if(selected.length>=11) break;
    if(String(p.id)!==String(gk.id)) selected.push(p);
  }

  await client.query(`UPDATE players SET is_starter=FALSE WHERE club_id=$1`,[clubId]);
  await client.query(`UPDATE players SET is_starter=TRUE WHERE id=ANY($1::bigint[])`,[selected.map(p=>p.id)]);
  return selected;
}

async function applyPlayerStats(client, clubId, starters, goals, conceded, events) {
  if (!starters.length) return;
  await client.query(`
    UPDATE players SET appearances=appearances+1
    WHERE id=ANY($1::bigint[])
  `,[starters.map(p=>p.id)]);

  if (conceded===0) {
    const gk=starters.find(p=>p.position==="GK");
    if(gk) await client.query(`UPDATE players SET clean_sheets=clean_sheets+1 WHERE id=$1`,[gk.id]);
  }

  for(const ev of events.filter(e=>e.clubId===clubId)) {
    if(ev.type==="goal" && ev.scorerId) {
      await client.query(`UPDATE players SET goals=goals+1 WHERE id=$1`,[ev.scorerId]);
      if(ev.assistId) await client.query(`UPDATE players SET assists=assists+1 WHERE id=$1`,[ev.assistId]);
    }
    if(ev.type==="yellow" && ev.playerId) {
      await client.query(`UPDATE players SET yellow_cards=yellow_cards+1 WHERE id=$1`,[ev.playerId]);
    }
    if(ev.type==="red" && ev.playerId) {
      await client.query(`UPDATE players SET red_cards=red_cards+1 WHERE id=$1`,[ev.playerId]);
    }
  }
}

function buildEvents(clubId, starters, goals, opponentClubId, opponentName) {
  const events=[];
  for(let i=0;i<goals;i++) {
    const scorer=weightedPick(starters.filter(p=>p.position!=="GK"));
    const assistPool=starters.filter(p=>String(p.id)!==String(scorer.id) && p.position!=="GK");
    const assist=assistPool.length && Math.random()<0.72 ? weightedPick(assistPool) : null;
    events.push({
      type:"goal",
      clubId,
      minute:rand(3,89),
      scorerId:scorer.id,
      scorerName:scorer.name,
      assistId:assist?.id || null,
      assistName:assist?.name || null,
      text:`Gol de ${scorer.name}${assist ? ` (assistência de ${assist.name})` : ""}`
    });
  }

  const yellowCount = Math.random()<0.7 ? rand(0,2) : 0;
  for(let i=0;i<yellowCount;i++) {
    const p=starters[rand(0,starters.length-1)];
    events.push({
      type:"yellow",clubId,minute:rand(10,88),playerId:p.id,playerName:p.name,
      text:`Cartão amarelo para ${p.name}`
    });
  }
  if(Math.random()<0.08) {
    const p=starters[rand(0,starters.length-1)];
    events.push({
      type:"red",clubId,minute:rand(35,88),playerId:p.id,playerName:p.name,
      text:`Cartão vermelho para ${p.name}`
    });
  }
  return events;
}

async function simulateMatch(homeClubId, awayClubId, options={}) {
  const matchType=options.matchType || "league";
  const recordForClubId=options.recordForClubId || homeClubId;
  const rewardEnabled=options.rewardEnabled !== false;
  const updateStandings=options.updateStandings !== false;

  return tx(async client=>{
    const clubs=await client.query(`SELECT * FROM clubs WHERE id=ANY($1::bigint[])`,[[homeClubId,awayClubId]]);
    const home=clubs.rows.find(c=>String(c.id)===String(homeClubId));
    const away=clubs.rows.find(c=>String(c.id)===String(awayClubId));
    if(!home||!away) throw Object.assign(new Error("Clube adversário não encontrado."),{status:404});

    const homeStarters=await startersForClub(client,home.id);
    const awayStarters=await startersForClub(client,away.id);
    const homeRating=await getClubRating(home.id,client);
    const awayRating=await getClubRating(away.id,client);

    const hg=Math.min(7,poisson(clamp(1.35+(homeRating-awayRating)*.045,.35,3.7)));
    const ag=Math.min(7,poisson(clamp(1.25+(awayRating-homeRating)*.045,.35,3.7)));

    const events=[
      ...buildEvents(home.id,homeStarters,hg,away.id,away.name),
      ...buildEvents(away.id,awayStarters,ag,home.id,home.name)
    ].sort((a,b)=>a.minute-b.minute);

    const homeResult=hg>ag?"win":hg===ag?"draw":"loss";
    const awayResult=ag>hg?"win":ag===hg?"draw":"loss";
    const homePts=homeResult==="win"?3:homeResult==="draw"?1:0;
    const awayPts=awayResult==="win"?3:awayResult==="draw"?1:0;

    if(updateStandings) {
      await client.query(`
        UPDATE clubs SET points=points+$2,wins=wins+$3,draws=draws+$4,losses=losses+$5,
        goals_for=goals_for+$6,goals_against=goals_against+$7,team_rating=$8 WHERE id=$1
      `,[home.id,homePts,homeResult==="win"?1:0,homeResult==="draw"?1:0,homeResult==="loss"?1:0,hg,ag,homeRating]);
      await client.query(`
        UPDATE clubs SET points=points+$2,wins=wins+$3,draws=draws+$4,losses=losses+$5,
        goals_for=goals_for+$6,goals_against=goals_against+$7,team_rating=$8 WHERE id=$1
      `,[away.id,awayPts,awayResult==="win"?1:0,awayResult==="draw"?1:0,awayResult==="loss"?1:0,ag,hg,awayRating]);
    } else {
      await client.query(`UPDATE clubs SET team_rating=$2 WHERE id=$1`,[home.id,homeRating]);
      await client.query(`UPDATE clubs SET team_rating=$2 WHERE id=$1`,[away.id,awayRating]);
    }

    await applyPlayerStats(client,home.id,homeStarters,hg,ag,events);
    await applyPlayerStats(client,away.id,awayStarters,ag,hg,events);

    let userClub, opponentClub, userGoals, opponentGoals, userRating, opponentRating, userResult;
    if(String(recordForClubId)===String(home.id)) {
      userClub=home; opponentClub=away; userGoals=hg; opponentGoals=ag; userRating=homeRating; opponentRating=awayRating; userResult=homeResult;
    } else {
      userClub=away; opponentClub=home; userGoals=ag; opponentGoals=hg; userRating=awayRating; opponentRating=homeRating; userResult=awayResult;
    }

    const reward = rewardEnabled ? (userResult==="win"?180:userResult==="draw"?90:50) : 0;
    if(reward>0) await client.query(`UPDATE clubs SET coins=coins+$2 WHERE id=$1`,[userClub.id,reward]);

    await client.query(`
      INSERT INTO matches(
        user_club_id,opponent_club_id,user_goals,opponent_goals,reward,user_rating,opponent_rating,events,match_type
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)
    `,[userClub.id,opponentClub.id,userGoals,opponentGoals,reward,userRating,opponentRating,JSON.stringify(events),matchType]);

    return {
      result:userResult,
      reward,
      userClub:userClub.name,
      opponent:opponentClub.name,
      userGoals,
      opponentGoals,
      userRating,
      opponentRating,
      matchType,
      events:events.map(e=>({minute:e.minute,text:e.text,type:e.type,clubId:e.clubId}))
    };
  });
}

async function simulateAiRound(excludeClubIds=[]) {
  const ai=await q(`
    SELECT id FROM clubs
    WHERE is_ai=TRUE AND NOT (id=ANY($1::bigint[]))
    ORDER BY RANDOM()
  `,[excludeClubIds.length?excludeClubIds:[-1]]);

  const ids=ai.rows.map(r=>r.id);
  const results=[];
  for(let i=0;i+1<ids.length;i+=2) {
    const result=await simulateMatch(ids[i],ids[i+1],{
      matchType:"simulation",
      rewardEnabled:false,
      updateStandings:true,
      recordForClubId:ids[i]
    });
    results.push(result);
  }
  return results;
}

app.get("/health",async(_req,res,next)=>{
  try{await q("SELECT 1");res.json({ok:true});}catch(e){next(e);}
});

app.post("/api/auth/register",async(req,res,next)=>{
  try{
    const email=String(req.body.email||"").trim().toLowerCase();
    const password=String(req.body.password||"");
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({error:"E-mail inválido."});
    if(password.length<6||password.length>128) return res.status(400).json({error:"A senha deve ter 6 a 128 caracteres."});
    const h=hashPassword(password);
    const r=await q(`INSERT INTO users(email,password_hash,password_salt) VALUES($1,$2,$3) RETURNING id,email`,[email,h.hash,h.salt]);
    setCookie(res,r.rows[0].id);
    res.status(201).json({user:r.rows[0]});
  }catch(e){
    if(e.code==="23505") return res.status(409).json({error:"Este e-mail já está cadastrado."});
    next(e);
  }
});

app.post("/api/auth/login",async(req,res,next)=>{
  try{
    const email=String(req.body.email||"").trim().toLowerCase();
    const password=String(req.body.password||"");
    const r=await q(`SELECT * FROM users WHERE email=$1`,[email]);
    if(!r.rowCount||!verifyPassword(password,r.rows[0].password_salt,r.rows[0].password_hash)) {
      return res.status(401).json({error:"E-mail ou senha incorretos."});
    }
    setCookie(res,r.rows[0].id);
    res.json({ok:true});
  }catch(e){next(e);}
});

app.post("/api/auth/logout",(_req,res)=>{clearCookie(res);res.json({ok:true});});

app.get("/api/me",auth,async(req,res,next)=>{
  try{res.json({user:req.user,club:await getClubForUser(req.user.id)});}catch(e){next(e);}
});

app.post("/api/club",auth,async(req,res,next)=>{
  try{
    const n=String(req.body.name||"").trim().replace(/\s+/g," ");
    const pc=String(req.body.primaryColor||"#18864b");
    const sc=String(req.body.secondaryColor||"#f7fafc");
    if(n.length<3||n.length>30) return res.status(400).json({error:"Nome deve ter 3 a 30 caracteres."});
    if(!/^#[0-9a-fA-F]{6}$/.test(pc)||!/^#[0-9a-fA-F]{6}$/.test(sc)) return res.status(400).json({error:"Cor inválida."});

    const created=await tx(async client=>{
      const ex=await client.query(`SELECT id FROM clubs WHERE user_id=$1`,[req.user.id]);
      if(ex.rowCount) throw Object.assign(new Error("Você já tem um clube."),{status:409});
      const cr=await client.query(`
        INSERT INTO clubs(user_id,name,primary_color,secondary_color)
        VALUES($1,$2,$3,$4) RETURNING *
      `,[req.user.id,n,pc,sc]);
      await ensureFriendCode(client,cr.rows[0].id);
      await insertRoster(client,cr.rows[0].id,58,73);
      const final=await client.query(`SELECT * FROM clubs WHERE id=$1`,[cr.rows[0].id]);
      return final.rows[0];
    });
    res.status(201).json({club:created});
  }catch(e){
    if(e.code==="23505") return res.status(409).json({error:"Nome de clube já utilizado."});
    next(e);
  }
});

app.put("/api/club/customize",auth,async(req,res,next)=>{
  try{
    const c=await getClubForUser(req.user.id);
    if(!c) return res.status(404).json({error:"Clube não encontrado."});

    const name=String(req.body.name||c.name).trim().replace(/\s+/g," ");
    const primary=String(req.body.primaryColor||c.primary_color);
    const secondary=String(req.body.secondaryColor||c.secondary_color);
    const crest=req.body.crestData===null ? null : String(req.body.crestData||c.crest_data||"");

    if(name.length<3||name.length>30) return res.status(400).json({error:"Nome deve ter 3 a 30 caracteres."});
    if(!/^#[0-9a-fA-F]{6}$/.test(primary)||!/^#[0-9a-fA-F]{6}$/.test(secondary)) return res.status(400).json({error:"Cor inválida."});
    if(crest && !/^data:image\/(png|jpeg|webp);base64,/i.test(crest)) return res.status(400).json({error:"Formato de escudo inválido."});
    if(crest.length>700000) return res.status(400).json({error:"O escudo ficou grande demais. Use uma imagem menor."});

    const r=await q(`
      UPDATE clubs SET name=$2,primary_color=$3,secondary_color=$4,crest_data=$5
      WHERE id=$1 RETURNING *
    `,[c.id,name,primary,secondary,crest||null]);

    res.json({club:r.rows[0]});
  }catch(e){
    if(e.code==="23505") return res.status(409).json({error:"Esse nome de clube já está sendo usado."});
    next(e);
  }
});

app.get("/api/dashboard",auth,async(req,res,next)=>{
  try{
    const c=await getClubForUser(req.user.id);
    if(!c) return res.json({club:null,players:[],market:[],standings:[],matches:[],friends:[]});
    c.team_rating=await getClubRating(c.id);

    const [ps,mk,st,mt,fr]=await Promise.all([
      q(`SELECT * FROM players WHERE club_id=$1 ORDER BY is_starter DESC,CASE position WHEN 'GK' THEN 1 WHEN 'DEF' THEN 2 WHEN 'MID' THEN 3 ELSE 4 END,rating DESC`,[c.id]),
      q(`SELECT * FROM players WHERE club_id IS NULL ORDER BY rating DESC,price DESC LIMIT 36`),
      q(`
        SELECT id,name,primary_color,secondary_color,crest_data,friend_code,points,wins,draws,losses,
        goals_for,goals_against,(goals_for-goals_against) goal_difference,team_rating,is_ai
        FROM clubs ORDER BY points DESC,(goals_for-goals_against) DESC,goals_for DESC,name LIMIT 40
      `),
      q(`
        SELECT m.*,o.name opponent_name,o.crest_data opponent_crest
        FROM matches m JOIN clubs o ON o.id=m.opponent_club_id
        WHERE m.user_club_id=$1 ORDER BY played_at DESC LIMIT 30
      `,[c.id]),
      q(`
        SELECT c.id,c.name,c.primary_color,c.secondary_color,c.crest_data,c.friend_code,c.team_rating,c.points
        FROM friendships f
        JOIN clubs c ON c.id=CASE WHEN f.club_a_id=$1 THEN f.club_b_id ELSE f.club_a_id END
        WHERE f.club_a_id=$1 OR f.club_b_id=$1
        ORDER BY c.name
      `,[c.id])
    ]);

    res.json({club:c,players:ps.rows,market:mk.rows,standings:st.rows,matches:mt.rows,friends:fr.rows});
  }catch(e){next(e);}
});

app.get("/api/clubs/:id",auth,async(req,res,next)=>{
  try{
    const id=String(req.params.id||"");
    const c=await q(`
      SELECT id,name,primary_color,secondary_color,crest_data,friend_code,team_rating,points,wins,draws,losses,
      goals_for,goals_against,is_ai,formation FROM clubs WHERE id=$1
    `,[id]);
    if(!c.rowCount) return res.status(404).json({error:"Clube não encontrado."});
    const players=await q(`
      SELECT id,name,position,rating,pace,shooting,passing,defending,price,is_starter,age,
      appearances,goals,assists,yellow_cards,red_cards,clean_sheets
      FROM players WHERE club_id=$1
      ORDER BY is_starter DESC,CASE position WHEN 'GK' THEN 1 WHEN 'DEF' THEN 2 WHEN 'MID' THEN 3 ELSE 4 END,rating DESC
    `,[id]);
    res.json({club:c.rows[0],players:players.rows});
  }catch(e){next(e);}
});

app.put("/api/lineup",auth,async(req,res,next)=>{
  try{
    const c=await getClubForUser(req.user.id);
    if(!c) return res.status(404).json({error:"Clube não encontrado."});
    const ids=Array.isArray(req.body.starterIds)?req.body.starterIds.map(String):[];
    const formation=String(req.body.formation||"4-3-3");
    if(ids.length!==11||new Set(ids).size!==11) return res.status(400).json({error:"Selecione exatamente 11 titulares."});
    if(!["4-3-3","4-4-2","3-5-2"].includes(formation)) return res.status(400).json({error:"Formação inválida."});
    const own=await q(`SELECT id,position FROM players WHERE club_id=$1 AND id=ANY($2::bigint[])`,[c.id,ids]);
    if(own.rowCount!==11||!own.rows.some(p=>p.position==="GK")) return res.status(400).json({error:"Escalação inválida; inclua um goleiro."});

    await tx(async client=>{
      await client.query(`UPDATE players SET is_starter=FALSE WHERE club_id=$1`,[c.id]);
      await client.query(`UPDATE players SET is_starter=TRUE WHERE club_id=$1 AND id=ANY($2::bigint[])`,[c.id,ids]);
      await client.query(`UPDATE clubs SET formation=$2 WHERE id=$1`,[c.id,formation]);
    });
    res.json({ok:true});
  }catch(e){next(e);}
});

app.post("/api/players/:id/release",auth,async(req,res,next)=>{
  try{
    const c=await getClubForUser(req.user.id);
    if(!c) return res.status(404).json({error:"Clube não encontrado."});
    const pid=String(req.params.id||"");

    await tx(async client=>{
      const p=await client.query(`SELECT * FROM players WHERE id=$1 AND club_id=$2 FOR UPDATE`,[pid,c.id]);
      if(!p.rowCount) throw Object.assign(new Error("Jogador não encontrado no seu clube."),{status:404});
      if(p.rows[0].is_starter) throw Object.assign(new Error("Tire o jogador dos titulares antes de rescindir."),{status:400});

      const count=await client.query(`SELECT COUNT(*)::int count FROM players WHERE club_id=$1`,[c.id]);
      if(count.rows[0].count<=12) throw Object.assign(new Error("Você precisa manter pelo menos 12 jogadores no elenco."),{status:400});

      if(p.rows[0].position==="GK") {
        const gk=await client.query(`SELECT COUNT(*)::int count FROM players WHERE club_id=$1 AND position='GK'`,[c.id]);
        if(gk.rows[0].count<=1) throw Object.assign(new Error("Você precisa manter pelo menos um goleiro."),{status:400});
      }

      await client.query(`UPDATE players SET club_id=NULL,is_starter=FALSE,price=GREATEST(100,ROUND(price*0.9)) WHERE id=$1`,[pid]);
    });

    res.json({ok:true});
  }catch(e){next(e);}
});

app.post("/api/market/buy",auth,async(req,res,next)=>{
  try{
    const c=await getClubForUser(req.user.id);
    if(!c) return res.status(404).json({error:"Clube não encontrado."});
    const pid=String(req.body.playerId||"");

    await tx(async client=>{
      const p=await client.query(`SELECT * FROM players WHERE id=$1 AND club_id IS NULL FOR UPDATE`,[pid]);
      if(!p.rowCount) throw Object.assign(new Error("Jogador indisponível."),{status:409});
      const cc=await client.query(`SELECT coins FROM clubs WHERE id=$1 FOR UPDATE`,[c.id]);
      if(cc.rows[0].coins<p.rows[0].price) throw Object.assign(new Error("Moedas insuficientes."),{status:400});
      await client.query(`UPDATE clubs SET coins=coins-$2 WHERE id=$1`,[c.id,p.rows[0].price]);
      await client.query(`UPDATE players SET club_id=$2,is_starter=FALSE WHERE id=$1`,[pid,c.id]);
    });

    await seed();
    res.json({ok:true});
  }catch(e){next(e);}
});

app.post("/api/matches/play",auth,async(req,res,next)=>{
  try{
    const c=await getClubForUser(req.user.id);
    if(!c) return res.status(400).json({error:"Crie seu clube primeiro."});
    const opponent=(await q(`SELECT id FROM clubs WHERE is_ai=TRUE ORDER BY RANDOM() LIMIT 1`)).rows[0];
    if(!opponent) return res.status(500).json({error:"Nenhum adversário disponível."});

    const match=await simulateMatch(c.id,opponent.id,{
      matchType:"league",
      rewardEnabled:true,
      updateStandings:true,
      recordForClubId:c.id
    });
    await simulateAiRound([opponent.id]);
    res.json({match});
  }catch(e){next(e);}
});

app.post("/api/league/simulate",auth,async(req,res,next)=>{
  try{
    const results=await simulateAiRound([]);
    res.json({results});
  }catch(e){next(e);}
});

app.post("/api/friends/add",auth,async(req,res,next)=>{
  try{
    const c=await getClubForUser(req.user.id);
    if(!c) return res.status(404).json({error:"Clube não encontrado."});

    const code=String(req.body.code||"").trim().toUpperCase();
    if(!code) return res.status(400).json({error:"Informe o código do amigo."});
    const target=await q(`SELECT id,name,is_ai FROM clubs WHERE friend_code=$1`,[code]);
    if(!target.rowCount) return res.status(404).json({error:"Nenhum clube encontrado com esse código."});
    if(String(target.rows[0].id)===String(c.id)) return res.status(400).json({error:"Esse é o código do seu próprio clube."});
    if(target.rows[0].is_ai) return res.status(400).json({error:"Esse código pertence a um clube do sistema."});

    const a=Math.min(Number(c.id),Number(target.rows[0].id));
    const b=Math.max(Number(c.id),Number(target.rows[0].id));
    await q(`INSERT INTO friendships(club_a_id,club_b_id) VALUES($1,$2) ON CONFLICT DO NOTHING`,[a,b]);
    res.json({ok:true,friend:target.rows[0]});
  }catch(e){next(e);}
});

app.delete("/api/friends/:clubId",auth,async(req,res,next)=>{
  try{
    const c=await getClubForUser(req.user.id);
    if(!c) return res.status(404).json({error:"Clube não encontrado."});
    const id=Number(req.params.clubId);
    const a=Math.min(Number(c.id),id), b=Math.max(Number(c.id),id);
    await q(`DELETE FROM friendships WHERE club_a_id=$1 AND club_b_id=$2`,[a,b]);
    res.json({ok:true});
  }catch(e){next(e);}
});

app.post("/api/friends/:clubId/play",auth,async(req,res,next)=>{
  try{
    const c=await getClubForUser(req.user.id);
    if(!c) return res.status(404).json({error:"Clube não encontrado."});
    const friendId=Number(req.params.clubId);
    const a=Math.min(Number(c.id),friendId), b=Math.max(Number(c.id),friendId);
    const f=await q(`SELECT id FROM friendships WHERE club_a_id=$1 AND club_b_id=$2`,[a,b]);
    if(!f.rowCount) return res.status(403).json({error:"Esse clube ainda não está na sua lista de amigos."});

    const match=await simulateMatch(c.id,friendId,{
      matchType:"friendly",
      rewardEnabled:false,
      updateStandings:false,
      recordForClubId:c.id
    });
    res.json({match});
  }catch(e){next(e);}
});

app.get("/styles.css",(_req,res)=>res.sendFile(path.join(__dirname,"styles.css")));
app.get("/app.js",(_req,res)=>res.sendFile(path.join(__dirname,"app.js")));
app.get("/",(_req,res)=>res.sendFile(path.join(__dirname,"index.html")));

app.use((err,_req,res,_next)=>{
  console.error(err);
  const status=Number(err.status||500);
  res.status(status).json({error:status>=500?"Erro interno do servidor.":err.message});
});

async function start() {
  await initDb();
  await seed();
  app.listen(PORT,"0.0.0.0",()=>console.log(`Dono do Clube v2 rodando na porta ${PORT}`));
}

start().catch(e=>{
  console.error("Falha ao iniciar:",e);
  process.exit(1);
});
