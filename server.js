const express = require("express");
const { Pool } = require("pg");
const crypto = require("crypto");

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
app.use(express.json({ limit: "100kb" }));

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

    CREATE INDEX IF NOT EXISTS idx_players_club ON players(club_id);
    CREATE INDEX IF NOT EXISTS idx_matches_user_club ON matches(user_club_id, played_at DESC);
  `);
}

const first = ["Caio","Davi","Lucas","Rafael","Bruno","Henrique","Matheus","Pedro","Gustavo","Felipe","André","Vitor","Diego","Gabriel","João","Thiago","Arthur","Murilo","Igor","Renan","Enzo","Samuel","Daniel","Leandro","Vinícius","Nicolas"];
const last = ["Almeida","Rocha","Ferreira","Souza","Lima","Costa","Mendes","Silva","Ribeiro","Gomes","Martins","Barbosa","Nunes","Teixeira","Moraes","Cardoso","Pires","Campos","Vieira","Freitas"];
const aiClubs = [["Aurora FC",69],["Atlético Vale",67],["Real Serra",72],["União Azul",66],["Estrela do Sul",71],["Nacional 11",68],["Ferroviário City",70],["Imperial FC",73],["Vila Central",65]];

const rand = (a,b) => Math.floor(Math.random()*(b-a+1))+a;
const clamp = (n,a,b) => Math.max(a,Math.min(b,n));
const name = () => `${first[rand(0,first.length-1)]} ${last[rand(0,last.length-1)]}`;

function player(position, lo=58, hi=73) {
  const rating = rand(lo,hi);
  const variance = () => clamp(rating + rand(-11,11),20,95);
  let pace=variance(), shooting=variance(), passing=variance(), defending=variance();
  if (position==="GK") { shooting=clamp(rating-rand(22,34),20,60); defending=clamp(rating+rand(-4,7),40,95); }
  if (position==="DEF") { defending=clamp(rating+rand(-1,8),40,95); shooting=clamp(rating-rand(8,18),20,85); }
  if (position==="MID") passing=clamp(rating+rand(0,7),40,95);
  if (position==="ATT") { shooting=clamp(rating+rand(0,8),40,95); defending=clamp(rating-rand(12,24),20,80); }
  const price=Math.round((rating*rating*.42+rand(0,450))/50)*50;
  return {name:name(),position,rating,pace,shooting,passing,defending,price};
}

async function seed() {
  for (const [n,r] of aiClubs) {
    await q(`INSERT INTO clubs(name,is_ai,team_rating,coins) VALUES($1,TRUE,$2,0) ON CONFLICT(name) DO NOTHING`, [n,r]);
  }
  const c = await q(`SELECT COUNT(*)::int count FROM players WHERE club_id IS NULL`);
  const positions=["GK","DEF","MID","ATT"];
  for (let i=c.rows[0].count;i<30;i++) {
    const p=player(positions[rand(0,3)],62,81);
    await q(`INSERT INTO players(name,position,rating,pace,shooting,passing,defending,price)
             VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
            [p.name,p.position,p.rating,p.pace,p.shooting,p.passing,p.defending,p.price]);
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
    req.user=u.rows[0]; next();
  } catch(e){ next(e); }
}
async function club(userId) {
  const r=await q(`SELECT * FROM clubs WHERE user_id=$1`,[userId]);
  return r.rows[0]||null;
}
async function rating(clubId) {
  const r=await q(`SELECT COALESCE(ROUND(AVG(rating)),60)::int rating FROM players WHERE club_id=$1 AND is_starter=TRUE`,[clubId]);
  return r.rows[0].rating;
}
function poisson(lambda) {
  const L=Math.exp(-lambda); let k=0,p=1;
  do { k++; p*=Math.random(); } while(p>L);
  return k-1;
}

app.get("/health", async (_req,res,next)=>{ try { await q("SELECT 1"); res.json({ok:true}); } catch(e){next(e);} });

app.post("/api/auth/register", async (req,res,next)=>{
  try {
    const email=String(req.body.email||"").trim().toLowerCase();
    const password=String(req.body.password||"");
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({error:"E-mail inválido."});
    if(password.length<6||password.length>128) return res.status(400).json({error:"A senha deve ter 6 a 128 caracteres."});
    const h=hashPassword(password);
    const r=await q(`INSERT INTO users(email,password_hash,password_salt) VALUES($1,$2,$3) RETURNING id,email`,[email,h.hash,h.salt]);
    setCookie(res,r.rows[0].id);
    res.status(201).json({user:r.rows[0]});
  } catch(e) {
    if(e.code==="23505") return res.status(409).json({error:"Este e-mail já está cadastrado."});
    next(e);
  }
});

app.post("/api/auth/login", async (req,res,next)=>{
  try {
    const email=String(req.body.email||"").trim().toLowerCase();
    const password=String(req.body.password||"");
    const r=await q(`SELECT * FROM users WHERE email=$1`,[email]);
    if(!r.rowCount||!verifyPassword(password,r.rows[0].password_salt,r.rows[0].password_hash)) return res.status(401).json({error:"E-mail ou senha incorretos."});
    setCookie(res,r.rows[0].id);
    res.json({ok:true});
  } catch(e){next(e);}
});
app.post("/api/auth/logout",(_req,res)=>{clearCookie(res);res.json({ok:true});});

app.get("/api/me",auth,async(req,res,next)=>{try{res.json({user:req.user,club:await club(req.user.id)});}catch(e){next(e);}});

app.post("/api/club",auth,async(req,res,next)=>{
  try {
    const n=String(req.body.name||"").trim().replace(/\s+/g," ");
    const pc=String(req.body.primaryColor||"#18864b"), sc=String(req.body.secondaryColor||"#f7fafc");
    if(n.length<3||n.length>30) return res.status(400).json({error:"Nome deve ter 3 a 30 caracteres."});
    if(!/^#[0-9a-fA-F]{6}$/.test(pc)||!/^#[0-9a-fA-F]{6}$/.test(sc)) return res.status(400).json({error:"Cor inválida."});
    const created=await tx(async c=>{
      const ex=await c.query(`SELECT id FROM clubs WHERE user_id=$1`,[req.user.id]);
      if(ex.rowCount) throw Object.assign(new Error("Você já tem um clube."),{status:409});
      const cr=await c.query(`INSERT INTO clubs(user_id,name,primary_color,secondary_color) VALUES($1,$2,$3,$4) RETURNING *`,[req.user.id,n,pc,sc]);
      const cid=cr.rows[0].id;
      const plan=[["GK",2,1],["DEF",6,4],["MID",6,3],["ATT",4,3]];
      for(const [pos,count,starters] of plan) for(let i=0;i<count;i++){
        const p=player(pos);
        await c.query(`INSERT INTO players(club_id,name,position,rating,pace,shooting,passing,defending,price,is_starter)
                       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
                       [cid,p.name,p.position,p.rating,p.pace,p.shooting,p.passing,p.defending,p.price,i<starters]);
      }
      return cr.rows[0];
    });
    res.status(201).json({club:created});
  } catch(e) {
    if(e.code==="23505") return res.status(409).json({error:"Nome de clube já utilizado."});
    next(e);
  }
});

app.get("/api/dashboard",auth,async(req,res,next)=>{
  try {
    const c=await club(req.user.id);
    if(!c) return res.json({club:null,players:[],market:[],standings:[],matches:[]});
    c.team_rating=await rating(c.id);
    const [ps,mk,st,mt]=await Promise.all([
      q(`SELECT * FROM players WHERE club_id=$1 ORDER BY is_starter DESC, CASE position WHEN 'GK' THEN 1 WHEN 'DEF' THEN 2 WHEN 'MID' THEN 3 ELSE 4 END, rating DESC`,[c.id]),
      q(`SELECT * FROM players WHERE club_id IS NULL ORDER BY rating DESC LIMIT 30`),
      q(`SELECT id,name,points,wins,draws,losses,goals_for,goals_against,(goals_for-goals_against) goal_difference,is_ai FROM clubs ORDER BY points DESC,(goals_for-goals_against) DESC,goals_for DESC,name LIMIT 30`),
      q(`SELECT m.*,o.name opponent_name FROM matches m JOIN clubs o ON o.id=m.opponent_club_id WHERE m.user_club_id=$1 ORDER BY played_at DESC LIMIT 20`,[c.id])
    ]);
    res.json({club:c,players:ps.rows,market:mk.rows,standings:st.rows,matches:mt.rows});
  } catch(e){next(e);}
});

app.put("/api/lineup",auth,async(req,res,next)=>{
  try{
    const c=await club(req.user.id); if(!c) return res.status(404).json({error:"Clube não encontrado."});
    const ids=Array.isArray(req.body.starterIds)?req.body.starterIds.map(String):[];
    const formation=String(req.body.formation||"4-3-3");
    if(ids.length!==11||new Set(ids).size!==11) return res.status(400).json({error:"Selecione exatamente 11 titulares."});
    if(!["4-3-3","4-4-2","3-5-2"].includes(formation)) return res.status(400).json({error:"Formação inválida."});
    const own=await q(`SELECT id,position FROM players WHERE club_id=$1 AND id=ANY($2::bigint[])`,[c.id,ids]);
    if(own.rowCount!==11||!own.rows.some(p=>p.position==="GK")) return res.status(400).json({error:"Escalação inválida; inclua um goleiro."});
    await tx(async x=>{
      await x.query(`UPDATE players SET is_starter=FALSE WHERE club_id=$1`,[c.id]);
      await x.query(`UPDATE players SET is_starter=TRUE WHERE club_id=$1 AND id=ANY($2::bigint[])`,[c.id,ids]);
      await x.query(`UPDATE clubs SET formation=$2 WHERE id=$1`,[c.id,formation]);
    });
    res.json({ok:true});
  }catch(e){next(e);}
});

app.post("/api/market/buy",auth,async(req,res,next)=>{
  try{
    const c=await club(req.user.id); if(!c) return res.status(404).json({error:"Clube não encontrado."});
    const pid=String(req.body.playerId||"");
    await tx(async x=>{
      const p=await x.query(`SELECT * FROM players WHERE id=$1 AND club_id IS NULL FOR UPDATE`,[pid]);
      if(!p.rowCount) throw Object.assign(new Error("Jogador indisponível."),{status:409});
      const cc=await x.query(`SELECT coins FROM clubs WHERE id=$1 FOR UPDATE`,[c.id]);
      if(cc.rows[0].coins<p.rows[0].price) throw Object.assign(new Error("Moedas insuficientes."),{status:400});
      await x.query(`UPDATE clubs SET coins=coins-$2 WHERE id=$1`,[c.id,p.rows[0].price]);
      await x.query(`UPDATE players SET club_id=$2,is_starter=FALSE WHERE id=$1`,[pid,c.id]);
    });
    await seed();
    res.json({ok:true});
  }catch(e){next(e);}
});

app.post("/api/matches/play",auth,async(req,res,next)=>{
  try{
    const c=await club(req.user.id); if(!c) return res.status(400).json({error:"Crie seu clube primeiro."});
    const starters=await q(`SELECT id,position,name FROM players WHERE club_id=$1 AND is_starter=TRUE`,[c.id]);
    if(starters.rowCount!==11||!starters.rows.some(p=>p.position==="GK")) return res.status(400).json({error:"Escalação precisa de 11 titulares e um goleiro."});
    const op=(await q(`SELECT * FROM clubs WHERE is_ai=TRUE ORDER BY RANDOM() LIMIT 1`)).rows[0];
    const ur=await rating(c.id), or=op.team_rating;
    const ug=Math.min(7,poisson(clamp(1.35+(ur-or)*.045,.35,3.7)));
    const og=Math.min(7,poisson(clamp(1.25+(or-ur)*.045,.35,3.7)));
    const result=ug>og?"win":ug===og?"draw":"loss";
    const reward=result==="win"?180:result==="draw"?90:50, pts=result==="win"?3:result==="draw"?1:0;
    const scorers=starters.rows.filter(p=>p.position!=="GK");
    const events=[];
    for(let i=0;i<ug;i++) events.push({minute:rand(3,89),text:`Gol de ${scorers[rand(0,scorers.length-1)].name}`});
    for(let i=0;i<og;i++) events.push({minute:rand(3,89),text:`Gol do ${op.name}`});
    events.sort((a,b)=>a.minute-b.minute);
    await tx(async x=>{
      await x.query(`UPDATE clubs SET coins=coins+$2,points=points+$3,wins=wins+$4,draws=draws+$5,losses=losses+$6,goals_for=goals_for+$7,goals_against=goals_against+$8,team_rating=$9 WHERE id=$1`,
        [c.id,reward,pts,result==="win"?1:0,result==="draw"?1:0,result==="loss"?1:0,ug,og,ur]);
      const opts=og>ug?3:og===ug?1:0;
      await x.query(`UPDATE clubs SET points=points+$2,wins=wins+$3,draws=draws+$4,losses=losses+$5,goals_for=goals_for+$6,goals_against=goals_against+$7 WHERE id=$1`,
        [op.id,opts,og>ug?1:0,og===ug?1:0,og<ug?1:0,og,ug]);
      await x.query(`INSERT INTO matches(user_club_id,opponent_club_id,user_goals,opponent_goals,reward,user_rating,opponent_rating,events) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
        [c.id,op.id,ug,og,reward,ur,or,JSON.stringify(events)]);
    });
    res.json({match:{result,reward,userClub:c.name,opponent:op.name,userGoals:ug,opponentGoals:og,userRating:ur,opponentRating:or,events}});
  }catch(e){next(e);}
});

const html = `<!doctype html>
<html lang="pt-BR"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#07110d"><title>Dono do Clube</title>
<style>
:root{--bg:#07110d;--panel:#0e1d16;--panel2:#13271d;--line:#244333;--text:#f4f8f5;--muted:#9eb3a7;--green:#49d17d;--green2:#20a95a;--yellow:#f6c84c}
*{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(circle at top,#123522,#07110d 50%);color:var(--text);font-family:Inter,system-ui,sans-serif}button,input,select{font:inherit}button{cursor:pointer}
.wrap{width:min(1100px,100%);margin:auto;padding:18px 18px 90px}.top{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px}.brand{display:flex;gap:10px;align-items:center;font-size:22px;font-weight:900}.logo{width:42px;height:42px;border-radius:14px;display:grid;place-items:center;background:linear-gradient(135deg,var(--green),var(--green2))}.coins{padding:9px 12px;border-radius:999px;background:#2a240c;color:#ffe28a;font-weight:800}.hero,.card{background:rgba(14,29,22,.95);border:1px solid var(--line);border-radius:22px;padding:20px}.hero{background:linear-gradient(135deg,#17452b,#0d2519);padding:28px}.hero h1{font-size:clamp(30px,7vw,54px);margin:4px 0 10px}.muted{color:var(--muted)}.primary,.secondary{border:0;border-radius:13px;padding:11px 15px;font-weight:900}.primary{background:linear-gradient(135deg,var(--green),var(--green2));color:#04150a}.secondary{background:var(--panel2);color:white;border:1px solid var(--line)}.grid{display:grid;grid-template-columns:1.2fr .8fr;gap:14px;margin-top:14px}.stats{display:flex;flex-wrap:wrap;gap:8px;margin-top:16px}.stat{background:rgba(0,0,0,.2);border:1px solid rgba(255,255,255,.1);padding:9px 12px;border-radius:12px}.stat small{display:block;color:#a9c1b2}.stat b{font-size:18px}.nav{position:fixed;left:50%;bottom:12px;transform:translateX(-50%);width:min(650px,calc(100% - 20px));display:flex;padding:6px;background:rgba(7,17,13,.94);border:1px solid var(--line);border-radius:17px}.nav button{flex:1;border:0;background:transparent;color:var(--muted);padding:10px 5px;border-radius:11px;font-weight:800}.nav button.on{background:var(--panel2);color:white}.auth{min-height:100vh;display:grid;place-items:center;padding:18px}.authbox{width:min(450px,100%);background:var(--panel);border:1px solid var(--line);border-radius:24px;padding:25px}.stack{display:grid;gap:11px}label{display:grid;gap:6px;color:#cbd9d1;font-size:13px;font-weight:700}input,select{width:100%;background:#09150e;color:white;border:1px solid #2a4c39;border-radius:11px;padding:11px}.switch{display:grid;grid-template-columns:1fr 1fr;background:#09150e;padding:4px;border-radius:12px;margin:17px 0}.switch button{border:0;background:transparent;color:var(--muted);padding:9px;border-radius:9px}.switch .on{background:var(--panel2);color:white}.msg{padding:10px;border-radius:11px;background:#34191b;color:#ffc2c2}.players{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.player{position:relative;background:#0a1710;border:1px solid #284a37;border-radius:16px;padding:14px}.player.starter{border-color:var(--green)}.rating{position:absolute;right:13px;top:11px;font-size:25px;font-weight:950}.player h4{margin:24px 0 10px}.attrs{display:grid;grid-template-columns:1fr 1fr;gap:4px;color:var(--muted);font-size:11px}.attrs b{color:white}.player button{width:100%;margin-top:10px}.toolbar{display:flex;justify-content:space-between;gap:10px;align-items:end;flex-wrap:wrap}.toolbar label{min-width:160px}.table{overflow:auto}.table table{width:100%;border-collapse:collapse;min-width:600px}.table th,.table td{padding:10px;border-bottom:1px solid #1d3427;text-align:left;font-size:13px}.me{background:#163522}.match{display:grid;grid-template-columns:1fr auto 1fr;gap:8px;align-items:center;background:#09150e;border:1px solid #1e392a;padding:10px;border-radius:12px;margin:7px 0}.score{font-size:22px;font-weight:900}.right{text-align:right}.modalbg{position:fixed;inset:0;background:rgba(0,0,0,.7);display:grid;place-items:center;padding:16px;z-index:99}.modal{width:min(520px,100%);max-height:88vh;overflow:auto;background:#0d1d15;border:1px solid #315640;border-radius:22px;padding:22px}.board{display:grid;grid-template-columns:1fr auto 1fr;text-align:center;align-items:center;gap:10px;margin:18px 0}.board b{font-size:38px}.event{padding:7px;border-bottom:1px solid #1f392a}.clubpreview{height:140px;border-radius:16px;display:grid;place-items:center;font-size:26px;font-weight:900}.colors{display:flex;gap:10px}.colors label{flex:1}
@media(max-width:800px){.grid{grid-template-columns:1fr}.players{grid-template-columns:repeat(2,1fr)}}@media(max-width:520px){.players{grid-template-columns:1fr}.wrap{padding:12px 12px 86px}}
</style></head><body><div id="app"></div>
<script>
const A=document.querySelector("#app"); const S={me:null,club:null,players:[],market:[],standings:[],matches:[],view:"home",mode:"login"};
const E=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
async function api(url,o={}){const r=await fetch(url,{credentials:"same-origin",headers:{"Content-Type":"application/json",...(o.headers||{})},...o});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||"Erro.");return d}
async function boot(){try{const m=await api("/api/me");S.me=m.user;if(m.club)await refresh();else S.club=null;render()}catch{auth()}}
async function refresh(){const d=await api("/api/dashboard");Object.assign(S,d)}
function auth(){A.innerHTML=\`<main class="auth"><section class="authbox"><div class="brand"><span class="logo">⚽</span>Dono do Clube</div><h1>Seu clube começa aqui.</h1><p class="muted">Monte seu elenco e suba na liga.</p><div class="switch"><button data-m="login" class="\${S.mode==="login"?"on":""}">Entrar</button><button data-m="register" class="\${S.mode==="register"?"on":""}">Criar conta</button></div><form id="f" class="stack"><label>E-mail<input name="email" type="email" required></label><label>Senha<input name="password" type="password" minlength="6" required></label><button class="primary">\${S.mode==="login"?"Entrar":"Criar conta"}</button><div id="m"></div></form></section></main>\`;A.querySelectorAll("[data-m]").forEach(b=>b.onclick=()=>{S.mode=b.dataset.m;auth()});A.querySelector("#f").onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);try{await api("/api/auth/"+S.mode,{method:"POST",body:JSON.stringify({email:f.get("email"),password:f.get("password")})});await boot()}catch(x){A.querySelector("#m").innerHTML='<div class="msg">'+E(x.message)+'</div>'}}}
function createClub(){A.innerHTML=\`<main class="auth"><section class="authbox"><div class="brand"><span class="logo">⚽</span>Dono do Clube</div><h1>Crie seu clube</h1><p class="muted">Você começa com 18 jogadores e 3.500 moedas.</p><form id="cf" class="stack"><label>Nome<input id="cn" name="name" value="Meu Clube FC" maxlength="30" required></label><div class="colors"><label>Cor 1<input id="c1" name="primaryColor" type="color" value="#18864b"></label><label>Cor 2<input id="c2" name="secondaryColor" type="color" value="#f7fafc"></label></div><div id="prev" class="clubpreview">Meu Clube FC</div><button class="primary">Fundar clube</button><div id="cm"></div></form></section></main>\`;const sync=()=>{const p=A.querySelector("#prev");p.textContent=A.querySelector("#cn").value;p.style.background=\`linear-gradient(135deg,\${A.querySelector("#c1").value},\${A.querySelector("#c2").value})\`};["cn","c1","c2"].forEach(id=>A.querySelector("#"+id).oninput=sync);sync();A.querySelector("#cf").onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);try{await api("/api/club",{method:"POST",body:JSON.stringify({name:f.get("name"),primaryColor:f.get("primaryColor"),secondaryColor:f.get("secondaryColor")})});await refresh();render()}catch(x){A.querySelector("#cm").innerHTML='<div class="msg">'+E(x.message)+'</div>'}}}
function card(p,actions){return \`<article class="player \${p.is_starter?"starter":""}"><span>\${p.position}</span><span class="rating">\${p.rating}</span><h4>\${E(p.name)}</h4><div class="attrs"><span>VEL <b>\${p.pace}</b></span><span>CHU <b>\${p.shooting}</b></span><span>PAS <b>\${p.passing}</b></span><span>DEF <b>\${p.defending}</b></span></div>\${actions?'<button class="'+(p.is_starter?"primary":"secondary")+' tog" data-id="'+p.id+'">'+(p.is_starter?"Titular":"Reserva")+"</button>":""}</article>\`}
function home(){const c=S.club;return \`<section class="hero"><small>Temporada atual</small><h1>\${E(c.name)}</h1><p class="muted">Jogue, ganhe moedas e reforce seu elenco.</p><button id="play" class="primary">⚽ JOGAR PARTIDA</button><div class="stats"><div class="stat"><small>Overall</small><b>\${c.team_rating}</b></div><div class="stat"><small>Formação</small><b>\${c.formation}</b></div><div class="stat"><small>Pontos</small><b>\${c.points}</b></div><div class="stat"><small>Campanha</small><b>\${c.wins}V \${c.draws}E \${c.losses}D</b></div></div></section><div class="grid"><section class="card"><h2>Últimos jogos</h2>\${S.matches.length?S.matches.slice(0,6).map(m=>\`<div class="match"><b>\${E(c.name)}</b><span class="score">\${m.user_goals} × \${m.opponent_goals}</span><span class="right">\${E(m.opponent_name)}</span></div>\`).join(""):'<p class="muted">Nenhuma partida ainda.</p>'}</section><section class="card"><h2>Recompensas</h2><p class="muted">Vitória: 180 moedas</p><p class="muted">Empate: 90 moedas</p><p class="muted">Derrota: 50 moedas</p></section></div>\`}
function squad(){return \`<section class="card"><div class="toolbar"><div><small>GESTÃO DO TIME</small><h2>Escalação</h2></div><label>Formação<select id="formation">\${["4-3-3","4-4-2","3-5-2"].map(f=>'<option '+(S.club.formation===f?"selected":"")+'>'+f+"</option>").join("")}</select></label></div><p class="muted">Selecione 11 titulares, incluindo um goleiro.</p><div id="sm"></div><div class="players">\${S.players.map(p=>card(p,true)).join("")}</div><button id="save" class="primary" style="margin-top:12px">Salvar escalação</button></section>\`}
function market(){return \`<section class="card"><h2>Mercado</h2><p class="muted">Saldo: \${Number(S.club.coins).toLocaleString("pt-BR")} moedas</p><div id="mm"></div><div class="players">\${S.market.map(p=>\`<article class="player"><span>\${p.position}</span><span class="rating">\${p.rating}</span><h4>\${E(p.name)}</h4><div class="attrs"><span>VEL <b>\${p.pace}</b></span><span>CHU <b>\${p.shooting}</b></span><span>PAS <b>\${p.passing}</b></span><span>DEF <b>\${p.defending}</b></span></div><button class="primary buy" data-id="\${p.id}">Comprar · \${Number(p.price).toLocaleString("pt-BR")}</button></article>\`).join("")}</div></section>\`}
function league(){return \`<section class="card"><h2>Classificação</h2><div class="table"><table><thead><tr><th>#</th><th>Clube</th><th>PTS</th><th>V</th><th>E</th><th>D</th><th>SG</th></tr></thead><tbody>\${S.standings.map((c,i)=>\`<tr class="\${String(c.id)===String(S.club.id)?"me":""}"><td>\${i+1}</td><td><b>\${E(c.name)}</b></td><td>\${c.points}</td><td>\${c.wins}</td><td>\${c.draws}</td><td>\${c.losses}</td><td>\${c.goal_difference>0?"+":""}\${c.goal_difference}</td></tr>\`).join("")}</tbody></table></div></section>\`}
function render(){if(!S.me)return auth();if(!S.club)return createClub();const body=S.view==="squad"?squad():S.view==="market"?market():S.view==="league"?league():home();A.innerHTML=\`<div class="wrap"><header class="top"><div class="brand"><span class="logo">⚽</span>Dono do Clube</div><span class="coins">● \${Number(S.club.coins).toLocaleString("pt-BR")}</span></header>\${body}</div><nav class="nav"><button data-v="home" class="\${S.view==="home"?"on":""}">INÍCIO</button><button data-v="squad" class="\${S.view==="squad"?"on":""}">ELENCO</button><button data-v="market" class="\${S.view==="market"?"on":""}">MERCADO</button><button data-v="league" class="\${S.view==="league"?"on":""}">LIGA</button></nav>\`;A.querySelectorAll("[data-v]").forEach(b=>b.onclick=()=>{S.view=b.dataset.v;render()});if(S.view==="home")bindHome();if(S.view==="squad")bindSquad();if(S.view==="market")bindMarket()}
function bindHome(){A.querySelector("#play").onclick=async e=>{e.target.disabled=true;try{const d=await api("/api/matches/play",{method:"POST",body:"{}"});modal(d.match);await refresh()}catch(x){alert(x.message)}finally{render()}}}
function bindSquad(){A.querySelectorAll(".tog").forEach(b=>b.onclick=()=>{const p=S.players.find(x=>String(x.id)===b.dataset.id);if(!p)return;if(!p.is_starter&&S.players.filter(x=>x.is_starter).length>=11){alert("Já existem 11 titulares.");return}p.is_starter=!p.is_starter;render()});A.querySelector("#save").onclick=async()=>{try{await api("/api/lineup",{method:"PUT",body:JSON.stringify({starterIds:S.players.filter(p=>p.is_starter).map(p=>p.id),formation:A.querySelector("#formation").value})});await refresh();render()}catch(x){alert(x.message)}}}
function bindMarket(){A.querySelectorAll(".buy").forEach(b=>b.onclick=async()=>{try{await api("/api/market/buy",{method:"POST",body:JSON.stringify({playerId:b.dataset.id})});await refresh();render()}catch(x){alert(x.message)}})}
function modal(m){const d=document.createElement("div");d.className="modalbg";d.innerHTML=\`<div class="modal"><small>+\${m.reward} moedas</small><div class="board"><span>\${E(m.userClub)}</span><b>\${m.userGoals} × \${m.opponentGoals}</b><span>\${E(m.opponent)}</span></div><h3>Lances</h3>\${m.events.length?m.events.map(e=>'<div class="event"><b>'+e.minute+"'</b> "+E(e.text)+"</div>").join(""):'<p class="muted">Partida sem gols.</p>'}<button id="close" class="primary" style="width:100%;margin-top:12px">Continuar</button></div>\`;document.body.appendChild(d);d.querySelector("#close").onclick=()=>d.remove()}
boot();
</script></body></html>`;

app.get("/", (_req,res)=>res.type("html").send(html));

app.use((err,_req,res,_next)=>{
  console.error(err);
  const status=Number(err.status||500);
  res.status(status).json({error:status>=500?"Erro interno do servidor.":err.message});
});

async function start(){
  await initDb();
  await seed();
  app.listen(PORT,"0.0.0.0",()=>console.log(`Dono do Clube rodando na porta ${PORT}`));
}
start().catch(e=>{console.error("Falha ao iniciar:",e);process.exit(1)});
