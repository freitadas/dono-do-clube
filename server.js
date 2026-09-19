
const express = require("express");
const { Pool } = require("pg");
const crypto = require("crypto");
const path = require("path");
const CLUB_SEED = [...require("./clubs.json"),...require("./international_clubs.json")];
const STATE_DATA = require("./states.json");
const COUNTRY_DATA = require("./countries.json");

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL não configurada.");
  process.exit(1);
}

const app = express();
const PORT = Number(process.env.PORT || 3000);
const SECRET = process.env.APP_SECRET || "dev-secret-change-me";
const COOKIE = "ddc_session";
const RESET_KEY = "v7_brasileirao_estaduais_reset_20260919";
const ECONOMY_MIGRATION_KEY = "v8_economy_fitness_transfer_20260919";
const V14_MIGRATION_KEY = "v14_copa_calendar_trophies_sales_20260919";
const V15_MIGRATION_KEY = "v15_sponsors_installments_loans_market_20260919";
const V16_MIGRATION_KEY = "v16_multi_career_shared_market_20260919";
const V17_MIGRATION_KEY = "v17_independent_career_market_20260919";
const V18_MIGRATION_KEY = "v18_manual_career_save_20260919";
const V21_MIGRATION_KEY = "v21_countries_player_career_20260919";
const MAX_CAREERS_PER_USER = 10;
const TRANSFER_BAN_THRESHOLD = -10000;
const competitionLocks = new Set();
const DIVS = ["A","B","C","D"];
const VALID_STATES = new Set(Object.keys(STATE_DATA.names));
const VALID_COUNTRIES = new Set(Object.keys(COUNTRY_DATA));

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
      user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
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
      manual_saved_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS club_finance_events(
      id BIGSERIAL PRIMARY KEY,
      club_id BIGINT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
      amount INTEGER NOT NULL,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS club_events(
      id BIGSERIAL PRIMARY KEY,
      club_id BIGINT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS club_trophies(
      id BIGSERIAL PRIMARY KEY,
      club_id BIGINT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
      season_no INTEGER NOT NULL,
      competition TEXT NOT NULL,
      title TEXT NOT NULL,
      won_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(club_id,season_no,competition)
    );

    CREATE TABLE IF NOT EXISTS transfer_offers(
      id BIGSERIAL PRIMARY KEY,
      selling_club_id BIGINT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
      player_id BIGINT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      buying_club_id BIGINT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
      amount INTEGER NOT NULL CHECK(amount>0),
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS sponsorship_contracts(
      id BIGSERIAL PRIMARY KEY,
      club_id BIGINT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
      sponsor_key TEXT NOT NULL,
      sponsor_name TEXT NOT NULL,
      division_signed TEXT NOT NULL,
      monthly_amount INTEGER NOT NULL CHECK(monthly_amount>=0),
      signing_bonus INTEGER NOT NULL DEFAULT 0,
      months_total INTEGER NOT NULL DEFAULT 12,
      months_paid INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS transfer_installments(
      id BIGSERIAL PRIMARY KEY,
      buying_club_id BIGINT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
      selling_club_id BIGINT REFERENCES clubs(id) ON DELETE SET NULL,
      player_id BIGINT REFERENCES players(id) ON DELETE SET NULL,
      player_name TEXT NOT NULL,
      total_fee INTEGER NOT NULL,
      amount_remaining INTEGER NOT NULL,
      installment_amount INTEGER NOT NULL,
      installments_total INTEGER NOT NULL,
      installments_paid INTEGER NOT NULL DEFAULT 1,
      next_due_date DATE,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS player_loans(
      id BIGSERIAL PRIMARY KEY,
      player_id BIGINT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      parent_club_id BIGINT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
      borrowing_club_id BIGINT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
      start_season_no INTEGER NOT NULL,
      months_total INTEGER NOT NULL,
      months_elapsed INTEGER NOT NULL DEFAULT 0,
      monthly_fee INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS player_careers(
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      career_slot INTEGER NOT NULL,
      career_label TEXT NOT NULL,
      is_active_career BOOLEAN NOT NULL DEFAULT FALSE,
      player_name TEXT NOT NULL,
      nationality_code TEXT NOT NULL DEFAULT 'BR',
      country_code TEXT NOT NULL DEFAULT 'BR',
      position TEXT NOT NULL CHECK(position IN ('GK','DEF','MID','ATT')),
      role TEXT NOT NULL,
      age INTEGER NOT NULL DEFAULT 17,
      club_id BIGINT NOT NULL REFERENCES clubs(id) ON DELETE RESTRICT,
      club_division TEXT NOT NULL DEFAULT 'D',
      season_no INTEGER NOT NULL DEFAULT 1,
      current_round INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      overall INTEGER NOT NULL DEFAULT 60,
      pace INTEGER NOT NULL DEFAULT 60,
      shooting INTEGER NOT NULL DEFAULT 60,
      passing INTEGER NOT NULL DEFAULT 60,
      defending INTEGER NOT NULL DEFAULT 60,
      fitness INTEGER NOT NULL DEFAULT 100,
      morale INTEGER NOT NULL DEFAULT 75,
      appearances INTEGER NOT NULL DEFAULT 0,
      goals INTEGER NOT NULL DEFAULT 0,
      assists INTEGER NOT NULL DEFAULT 0,
      clean_sheets INTEGER NOT NULL DEFAULT 0,
      skill_points INTEGER NOT NULL DEFAULT 0,
      reputation INTEGER NOT NULL DEFAULT 10,
      salary INTEGER NOT NULL DEFAULT 800,
      balance INTEGER NOT NULL DEFAULT 0,
      data JSONB NOT NULL DEFAULT '{}'::jsonb,
      manual_saved_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
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
    CREATE INDEX IF NOT EXISTS idx_transfer_offers_seller_status ON transfer_offers(selling_club_id,status);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_transfer_offers_pending_buyer_player ON transfer_offers(player_id,buying_club_id) WHERE status='pending';
    CREATE INDEX IF NOT EXISTS idx_trophies_club_season ON club_trophies(club_id,season_no);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_sponsorship_active_club ON sponsorship_contracts(club_id) WHERE status='active';
    CREATE INDEX IF NOT EXISTS idx_installments_buying_status ON transfer_installments(buying_club_id,status);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_active_loan_player ON player_loans(player_id) WHERE status='active';
    CREATE UNIQUE INDEX IF NOT EXISTS idx_player_careers_user_slot ON player_careers(user_id,career_slot);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_player_careers_one_active ON player_careers(user_id) WHERE is_active_career=TRUE;
  `);

  for(const sql of [
    `ALTER TABLE clubs ADD COLUMN IF NOT EXISTS state_code TEXT`,
    `ALTER TABLE clubs ADD COLUMN IF NOT EXISTS country_code TEXT NOT NULL DEFAULT 'BR'`,
    `ALTER TABLE clubs ADD COLUMN IF NOT EXISTS club_kind TEXT NOT NULL DEFAULT 'user'`,
    `ALTER TABLE clubs ADD COLUMN IF NOT EXISTS national_seed_division TEXT`,
    `ALTER TABLE clubs ADD COLUMN IF NOT EXISTS base_rating INTEGER NOT NULL DEFAULT 64`,
    `ALTER TABLE clubs ADD COLUMN IF NOT EXISTS fans INTEGER NOT NULL DEFAULT 5000`,
    `ALTER TABLE clubs ADD COLUMN IF NOT EXISTS career_slot INTEGER`,
    `ALTER TABLE clubs ADD COLUMN IF NOT EXISTS career_label TEXT`,
    `ALTER TABLE clubs ADD COLUMN IF NOT EXISTS is_active_career BOOLEAN NOT NULL DEFAULT FALSE`,
    `ALTER TABLE transfer_offers ADD COLUMN IF NOT EXISTS offer_kind TEXT NOT NULL DEFAULT 'ai'`,
    `ALTER TABLE transfer_offers ADD COLUMN IF NOT EXISTS buyer_salary INTEGER`,
    `ALTER TABLE transfer_offers ADD COLUMN IF NOT EXISTS buyer_years INTEGER`,
    `ALTER TABLE transfer_offers ADD COLUMN IF NOT EXISTS buyer_installments INTEGER`,
    `ALTER TABLE players ADD COLUMN IF NOT EXISTS role TEXT`,
    `ALTER TABLE players ADD COLUMN IF NOT EXISTS salary INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE players ADD COLUMN IF NOT EXISTS contract_seasons INTEGER NOT NULL DEFAULT 2`,
    `ALTER TABLE players ADD COLUMN IF NOT EXISTS fitness INTEGER NOT NULL DEFAULT 100`,
    `ALTER TABLE players ADD COLUMN IF NOT EXISTS morale INTEGER NOT NULL DEFAULT 70`,
    `ALTER TABLE players ADD COLUMN IF NOT EXISTS injury_games INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE players ADD COLUMN IF NOT EXISTS transfer_listed BOOLEAN NOT NULL DEFAULT FALSE`,
    `ALTER TABLE players ADD COLUMN IF NOT EXISTS market_template_id BIGINT`,
    `ALTER TABLE careers ADD COLUMN IF NOT EXISTS manual_saved_at TIMESTAMPTZ`,
    `ALTER TABLE careers ADD COLUMN IF NOT EXISTS country_code TEXT NOT NULL DEFAULT 'BR'`
  ]) await q(sql);

  await q(`ALTER TABLE clubs DROP CONSTRAINT IF EXISTS clubs_coins_check`);
  await q(`ALTER TABLE clubs DROP CONSTRAINT IF EXISTS clubs_user_id_key`);
  await q(`DROP INDEX IF EXISTS idx_transfer_offers_pending_player`);
  await q(`CREATE UNIQUE INDEX IF NOT EXISTS idx_clubs_user_career_slot ON clubs(user_id,career_slot) WHERE user_id IS NOT NULL AND career_slot IS NOT NULL`);
  await q(`CREATE UNIQUE INDEX IF NOT EXISTS idx_clubs_one_active_career ON clubs(user_id) WHERE user_id IS NOT NULL AND is_active_career=TRUE`);
  await q(`CREATE UNIQUE INDEX IF NOT EXISTS idx_transfer_offers_pending_buyer_player ON transfer_offers(player_id,buying_club_id) WHERE status='pending'`);
  await q(`CREATE UNIQUE INDEX IF NOT EXISTS idx_players_career_market_template ON players(club_id,market_template_id) WHERE club_id IS NOT NULL AND market_template_id IS NOT NULL`);
  await q(`CREATE UNIQUE INDEX IF NOT EXISTS idx_player_careers_user_slot ON player_careers(user_id,career_slot)`);
  await q(`CREATE UNIQUE INDEX IF NOT EXISTS idx_player_careers_one_active ON player_careers(user_id) WHERE is_active_career=TRUE`);

  for(const sql of [
    `ALTER TABLE players DROP CONSTRAINT IF EXISTS players_rating_check`,
    `ALTER TABLE players DROP CONSTRAINT IF EXISTS players_pace_check`,
    `ALTER TABLE players DROP CONSTRAINT IF EXISTS players_shooting_check`,
    `ALTER TABLE players DROP CONSTRAINT IF EXISTS players_passing_check`,
    `ALTER TABLE players DROP CONSTRAINT IF EXISTS players_defending_check`
  ]) await q(sql);

  for(const sql of [
    `ALTER TABLE players ADD CONSTRAINT players_rating_check CHECK (rating BETWEEN 40 AND 100)`,
    `ALTER TABLE players ADD CONSTRAINT players_pace_check CHECK (pace BETWEEN 20 AND 100)`,
    `ALTER TABLE players ADD CONSTRAINT players_shooting_check CHECK (shooting BETWEEN 20 AND 100)`,
    `ALTER TABLE players ADD CONSTRAINT players_passing_check CHECK (passing BETWEEN 20 AND 100)`,
    `ALTER TABLE players ADD CONSTRAINT players_defending_check CHECK (defending BETWEEN 20 AND 100)`
  ]){
    try{await q(sql)}catch(e){if(e.code!=="42710")throw e}
  }
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


async function applyV14Migration(){
  const done=await q(`SELECT 1 FROM app_meta WHERE key=$1`,[V14_MIGRATION_KEY]);
  if(done.rowCount)return;
  await tx(async c=>{
    await c.query(`UPDATE players SET transfer_listed=FALSE WHERE transfer_listed IS NULL`);
    await c.query(`UPDATE transfer_offers SET status='expired',updated_at=NOW() WHERE status='pending'`);
    await c.query(`INSERT INTO app_meta(key,value) VALUES($1,$2)`,[V14_MIGRATION_KEY,new Date().toISOString()]);
  });
}

async function applyV15Migration(){
  const done=await q(`SELECT 1 FROM app_meta WHERE key=$1`,[V15_MIGRATION_KEY]);
  if(done.rowCount)return;
  await tx(async c=>{
    await c.query(`UPDATE transfer_installments SET status='paid',amount_remaining=0 WHERE status='active' AND amount_remaining<=0`);
    await c.query(`INSERT INTO app_meta(key,value) VALUES($1,$2)`,[V15_MIGRATION_KEY,new Date().toISOString()]);
  });
}

async function applyV16Migration(){
  const done=await q(`SELECT 1 FROM app_meta WHERE key=$1`,[V16_MIGRATION_KEY]);
  if(done.rowCount)return;
  await tx(async c=>{
    await c.query(`ALTER TABLE clubs DROP CONSTRAINT IF EXISTS clubs_user_id_key`);
    await c.query(`DROP INDEX IF EXISTS idx_transfer_offers_pending_player`);

    const users=(await c.query(`SELECT DISTINCT user_id FROM clubs WHERE user_id IS NOT NULL`)).rows;
    for(const u of users){
      const clubs=(await c.query(`SELECT id,name,career_slot,is_active_career FROM clubs WHERE user_id=$1 ORDER BY created_at,id FOR UPDATE`,[u.user_id])).rows;
      const used=new Set(clubs.map(x=>Number(x.career_slot)).filter(Boolean));
      let next=1;
      for(const club of clubs){
        let slot=Number(club.career_slot||0);
        if(!slot){
          while(used.has(next))next++;
          slot=next;used.add(slot);next++;
        }
        await c.query(`UPDATE clubs SET career_slot=$2,career_label=COALESCE(NULLIF(career_label,''),$3),is_active_career=FALSE WHERE id=$1`,
          [club.id,slot,`Carreira ${slot}`]);
      }
      if(clubs.length){
        const chosen=clubs.find(x=>x.is_active_career)||clubs[0];
        await c.query(`UPDATE clubs SET is_active_career=TRUE WHERE id=$1`,[chosen.id]);
      }
    }

    await c.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_clubs_user_career_slot ON clubs(user_id,career_slot) WHERE user_id IS NOT NULL AND career_slot IS NOT NULL`);
    await c.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_clubs_one_active_career ON clubs(user_id) WHERE user_id IS NOT NULL AND is_active_career=TRUE`);
    await c.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_transfer_offers_pending_buyer_player ON transfer_offers(player_id,buying_club_id) WHERE status='pending'`);
    await c.query(`INSERT INTO app_meta(key,value) VALUES($1,$2)`,[V16_MIGRATION_KEY,new Date().toISOString()]);
  });
}

async function applyV17Migration(){
  const done=await q(`SELECT 1 FROM app_meta WHERE key=$1`,[V17_MIGRATION_KEY]);
  if(done.rowCount)return;
  await tx(async c=>{
    // O mercado compartilhado da v16 foi removido.
    await c.query(`UPDATE transfer_offers SET status='expired',updated_at=NOW() WHERE status='pending' AND offer_kind='human'`);
    await c.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_players_career_market_template ON players(club_id,market_template_id) WHERE club_id IS NOT NULL AND market_template_id IS NOT NULL`);
    await c.query(`INSERT INTO app_meta(key,value) VALUES($1,$2)`,[V17_MIGRATION_KEY,new Date().toISOString()]);
  });
}

async function applyV18Migration(){
  const done=await q(`SELECT 1 FROM app_meta WHERE key=$1`,[V18_MIGRATION_KEY]);
  if(done.rowCount)return;
  await tx(async c=>{
    await c.query(`ALTER TABLE careers ADD COLUMN IF NOT EXISTS manual_saved_at TIMESTAMPTZ`);
    await c.query(`INSERT INTO app_meta(key,value) VALUES($1,$2)`,[V18_MIGRATION_KEY,new Date().toISOString()]);
  });
}

async function applyV21Migration(){
  const done=await q(`SELECT 1 FROM app_meta WHERE key=$1`,[V21_MIGRATION_KEY]);
  if(done.rowCount)return;
  await tx(async c=>{
    await c.query(`ALTER TABLE careers ADD COLUMN IF NOT EXISTS country_code TEXT NOT NULL DEFAULT 'BR'`);
    await c.query(`UPDATE careers cr SET country_code=COALESCE(cl.country_code,'BR') FROM clubs cl WHERE cl.id=cr.owner_club_id`);
    await c.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_player_careers_user_slot ON player_careers(user_id,career_slot)`);
    await c.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_player_careers_one_active ON player_careers(user_id) WHERE is_active_career=TRUE`);
    await c.query(`INSERT INTO app_meta(key,value) VALUES($1,$2)`,[V21_MIGRATION_KEY,new Date().toISOString()]);
  });
}

function countryProfile(code){
  return COUNTRY_DATA[code]||COUNTRY_DATA.BR;
}
function countryName(code){
  return countryProfile(code).name||code;
}
function leagueName(countryCode,div){
  return countryProfile(countryCode).divisions?.[div]||`Divisão ${div}`;
}
function domesticCupName(countryCode){
  return countryProfile(countryCode).cup||"Copa Nacional";
}

function isFelipeName(name){
  return String(name||"").trim().toLocaleLowerCase("pt-BR")==="felipe";
}
async function applyFelipeMode(client,clubId){
  const club=(await client.query(`SELECT id,name FROM clubs WHERE id=$1`,[clubId])).rows[0];
  if(!club||!isFelipeName(club.name))return false;
  await client.query(`
    UPDATE players SET
      rating=100,pace=100,shooting=100,passing=100,defending=100,
      fitness=100,morale=100,injury_games=0
    WHERE club_id=$1
  `,[clubId]);
  await client.query(`UPDATE clubs SET team_rating=100 WHERE id=$1`,[clubId]);
  return true;
}
function felipeScore(){
  const options=[
    {winner:100,loser:0},
    {winner:1067,loser:0},
    {winner:67,loser:42}
  ];
  return options[rand(0,options.length-1)];
}

function salaryForRating(rating){
  const value=((rating-45)*(rating-45)*0.35)+(rating*1.5);
  return Math.max(50,Math.round(value/10)*10);
}
function roleFor(position){
  const roles={
    GK:["GK"],
    DEF:["CB","CB","RB","LB"],
    MID:["CM","CDM","CAM","RM","LM"],
    ATT:["ST","ST","RW","LW"]
  };
  const a=roles[position]||[position];
  return a[rand(0,a.length-1)];
}
async function applyEconomyMigration(){
  const done=await q(`SELECT 1 FROM app_meta WHERE key=$1`,[ECONOMY_MIGRATION_KEY]);
  if(done.rowCount)return;
  await tx(async c=>{
    await c.query(`UPDATE clubs SET coins=GREATEST(coins,25000) WHERE is_ai=FALSE`);
    const rows=(await c.query(`SELECT id,position,rating,age FROM players`)).rows;
    for(const p of rows){
      await c.query(`
        UPDATE players SET
          role=COALESCE(role,$2),
          salary=CASE WHEN salary<=0 THEN $3 ELSE salary END,
          contract_seasons=CASE WHEN contract_seasons<=0 THEN $4 ELSE contract_seasons END,
          fitness=GREATEST(70,LEAST(100,fitness)),
          morale=GREATEST(50,LEAST(100,morale))
        WHERE id=$1
      `,[p.id,roleFor(p.position),salaryForRating(p.rating),rand(1,4)]);
    }
    await c.query(`INSERT INTO app_meta(key,value) VALUES($1,$2)`,[ECONOMY_MIGRATION_KEY,new Date().toISOString()]);
  });
}

function makePlayer(position,lo=61,hi=68){
  const rating=rand(lo,hi);
  const variance=()=>clamp(rating+rand(-6,6),25,95);
  let pace=variance(),shooting=variance(),passing=variance(),defending=variance();
  if(position==="GK"){shooting=clamp(rating-rand(24,31),20,52);defending=clamp(rating+rand(0,6),40,95)}
  if(position==="DEF"){defending=clamp(rating+rand(1,6),40,95);shooting=clamp(rating-rand(9,15),20,84)}
  if(position==="MID"){passing=clamp(rating+rand(1,6),40,95);shooting=clamp(rating+rand(-4,4),25,92)}
  if(position==="ATT"){shooting=clamp(rating+rand(1,7),40,95);defending=clamp(rating-rand(13,20),20,78)}
  const price=Math.max(500,Math.round((((rating-48)**2)*55 + rating*110 + rand(0,1800))/100)*100);
  return {
    name:randomName(),position,role:roleFor(position),rating,pace,shooting,passing,defending,price,
    age:rand(18,31),salary:salaryForRating(rating),contract_seasons:rand(1,4),
    fitness:100,morale:rand(66,82),injury_games:0
  };
}

async function createRoster(client, club, force=false){
  const count=Number((await client.query(`SELECT COUNT(*)::int count FROM players WHERE club_id=$1`,[club.id])).rows[0].count);
  if(!force){
    if(!club.is_ai&&count>0)return;
    if(club.is_ai&&count>=18)return;
  }
  if(force)await client.query(`DELETE FROM players WHERE club_id=$1`,[club.id]);

  const base=club.is_ai?Number(club.base_rating||64):64;
  const lo=club.is_ai?Math.max(52,base-4):61;
  const hi=club.is_ai?Math.min(85,base+3):68;
  const target={GK:2,DEF:6,MID:6,ATT:4};
  const starterTarget={GK:1,DEF:4,MID:3,ATT:3};
  const rolePlan={
    GK:["GK","GK"],
    DEF:["CB","CB","RB","LB","CB","CB"],
    MID:["CM","CDM","CM","CAM","RM","LM"],
    ATT:["ST","RW","LW","ST"]
  };
  const existing=force?[]:(await client.query(`SELECT position,COUNT(*)::int count FROM players WHERE club_id=$1 GROUP BY position`,[club.id])).rows;
  const have=Object.fromEntries(existing.map(x=>[x.position,Number(x.count)]));

  for(const pos of ["GK","DEF","MID","ATT"]){
    const missing=Math.max(0,target[pos]-(have[pos]||0));
    for(let i=0;i<missing;i++){
      const p=makePlayer(pos,lo,hi);
      p.role=rolePlan[pos][((have[pos]||0)+i)%rolePlan[pos].length];
      const startersNow=Number((await client.query(`SELECT COUNT(*)::int count FROM players WHERE club_id=$1 AND position=$2 AND is_starter=TRUE`,[club.id,pos])).rows[0].count);
      const isStarter=startersNow<starterTarget[pos];
      await client.query(`
        INSERT INTO players(
          club_id,name,position,role,rating,pace,shooting,passing,defending,price,is_starter,age,
          salary,contract_seasons,fitness,morale,injury_games
        )
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
      `,[club.id,p.name,p.position,p.role,p.rating,p.pace,p.shooting,p.passing,p.defending,p.price,isStarter,p.age,
         p.salary,p.contract_seasons,p.fitness,p.morale,p.injury_games]);
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
      INSERT INTO players(name,position,role,rating,pace,shooting,passing,defending,price,age,salary,contract_seasons,fitness,morale,injury_games)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
    `,[p.name,p.position,p.role,p.rating,p.pace,p.shooting,p.passing,p.defending,p.price,p.age,p.salary,p.contract_seasons,p.fitness,p.morale,p.injury_games]);
  }
}

async function clonePlayerForCareer(client,source,clubId,{salary=null,years=null,fitness=100,morale=78}={}){
  const templateId=Number(source.market_template_id||source.id);
  const existing=(await client.query(
    `SELECT id FROM players WHERE club_id=$1 AND market_template_id=$2 LIMIT 1`,
    [clubId,templateId]
  )).rows[0];
  if(existing)throw Object.assign(new Error("Esse jogador já pertence a esta carreira."),{status:409});

  const r=await client.query(`
    INSERT INTO players(
      club_id,name,position,role,rating,pace,shooting,passing,defending,price,is_starter,age,
      appearances,goals,assists,yellow_cards,red_cards,clean_sheets,
      salary,contract_seasons,fitness,morale,injury_games,transfer_listed,market_template_id
    )
    VALUES(
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,FALSE,$11,
      0,0,0,0,0,0,
      $12,$13,$14,$15,0,FALSE,$16
    )
    RETURNING *
  `,[
    clubId,source.name,source.position,source.role,source.rating,source.pace,source.shooting,
    source.passing,source.defending,source.price,source.age,
    salary===null?Number(source.salary||salaryForRating(source.rating)):Number(salary),
    years===null?Number(source.contract_seasons||2):Number(years),
    Number(fitness),Number(morale),templateId
  ]);
  return r.rows[0];
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

async function activePlayerCareer(userId){
  return (await q(`SELECT pc.*,c.name club_name,c.base_rating club_rating FROM player_careers pc JOIN clubs c ON c.id=pc.club_id WHERE pc.user_id=$1 AND pc.is_active_career=TRUE ORDER BY pc.career_slot,pc.id LIMIT 1`,[userId])).rows[0]||null;
}
async function userClub(userId){
  let r=await q(`SELECT * FROM clubs WHERE user_id=$1 AND is_active_career=TRUE ORDER BY career_slot,id LIMIT 1`,[userId]);
  if(r.rowCount)return r.rows[0];

  const player=await activePlayerCareer(userId);
  if(player)return null;

  r=await q(`SELECT * FROM clubs WHERE user_id=$1 ORDER BY career_slot NULLS LAST,created_at,id LIMIT 1`,[userId]);
  if(!r.rowCount)return null;
  await tx(async c=>{
    await c.query(`UPDATE player_careers SET is_active_career=FALSE WHERE user_id=$1`,[userId]);
    await c.query(`UPDATE clubs SET is_active_career=FALSE WHERE user_id=$1`,[userId]);
    await c.query(`UPDATE clubs SET is_active_career=TRUE WHERE id=$1`,[r.rows[0].id]);
  });
  return (await q(`SELECT * FROM clubs WHERE id=$1`,[r.rows[0].id])).rows[0]||null;
}
async function listUserCareers(userId){
  const [clubs,players]=await Promise.all([
    q(`
      SELECT 'club'::text career_type,c.id,c.name,c.state_code,c.country_code,c.primary_color,c.secondary_color,c.crest_data,c.coins,c.team_rating,
        c.career_slot,c.career_label,c.is_active_career,c.created_at,
        cr.season_no,cr.phase,cr.user_division,cr.current_round,cr.manual_saved_at,
        NULL::text player_name,NULL::text player_position,NULL::int overall,NULL::text club_name
      FROM clubs c
      LEFT JOIN careers cr ON cr.owner_club_id=c.id
      WHERE c.user_id=$1
    `,[userId]),
    q(`
      SELECT 'player'::text career_type,pc.id,pc.player_name AS name,NULL::text state_code,pc.country_code,
        '#244c3c'::text primary_color,'#f5f7f6'::text secondary_color,NULL::text crest_data,
        pc.balance AS coins,pc.overall AS team_rating,
        pc.career_slot,pc.career_label,pc.is_active_career,pc.created_at,
        pc.season_no,pc.status AS phase,pc.club_division AS user_division,pc.current_round,pc.manual_saved_at,
        pc.player_name,pc.position AS player_position,pc.overall,c.name AS club_name
      FROM player_careers pc
      JOIN clubs c ON c.id=pc.club_id
      WHERE pc.user_id=$1
    `,[userId])
  ]);
  return [...clubs.rows,...players.rows].sort((a,b)=>Number(a.career_slot||99)-Number(b.career_slot||99)||Number(a.id)-Number(b.id));
}
async function activeCareerSummary(userId){
  const player=await activePlayerCareer(userId);
  if(player)return {type:"player",playerCareer:player,club:null};

  const club=await userClub(userId);
  if(club)return {type:"club",club,playerCareer:null};

  // Robustez para saves antigos/incompletos: se só existirem carreiras de jogador
  // sem flag ativa, ativa automaticamente a primeira.
  const firstPlayer=(await q(`SELECT id FROM player_careers WHERE user_id=$1 ORDER BY career_slot,id LIMIT 1`,[userId])).rows[0];
  if(firstPlayer){
    const playerCareer=await activatePlayerCareer(userId,firstPlayer.id);
    return {type:"player",playerCareer,club:null};
  }
  return {type:null,club:null,playerCareer:null};
}
async function activateUserCareer(userId,clubId){
  return tx(async c=>{
    const target=(await c.query(`SELECT * FROM clubs WHERE id=$1 AND user_id=$2 FOR UPDATE`,[clubId,userId])).rows[0];
    if(!target)throw Object.assign(new Error("Carreira de clube não encontrada."),{status:404});
    await c.query(`UPDATE player_careers SET is_active_career=FALSE WHERE user_id=$1`,[userId]);
    await c.query(`UPDATE clubs SET is_active_career=FALSE WHERE user_id=$1`,[userId]);
    await c.query(`UPDATE clubs SET is_active_career=TRUE WHERE id=$1`,[target.id]);
    return (await c.query(`SELECT * FROM clubs WHERE id=$1`,[target.id])).rows[0];
  });
}
async function activatePlayerCareer(userId,careerId){
  return tx(async c=>{
    const target=(await c.query(`SELECT * FROM player_careers WHERE id=$1 AND user_id=$2 FOR UPDATE`,[careerId,userId])).rows[0];
    if(!target)throw Object.assign(new Error("Carreira de jogador não encontrada."),{status:404});
    await c.query(`UPDATE clubs SET is_active_career=FALSE WHERE user_id=$1`,[userId]);
    await c.query(`UPDATE player_careers SET is_active_career=FALSE WHERE user_id=$1`,[userId]);
    await c.query(`UPDATE player_careers SET is_active_career=TRUE WHERE id=$1`,[target.id]);
    return (await c.query(`SELECT pc.*,cl.name club_name,cl.base_rating club_rating FROM player_careers pc JOIN clubs cl ON cl.id=pc.club_id WHERE pc.id=$1`,[target.id])).rows[0];
  });
}
async function totalCareerCount(userId,client=pool){
  const r=await client.query(`
    SELECT
      (SELECT COUNT(*) FROM clubs WHERE user_id=$1)::int +
      (SELECT COUNT(*) FROM player_careers WHERE user_id=$1)::int AS count
  `,[userId]);
  return Number(r.rows[0].count||0);
}
async function nextCareerSlot(userId,client=pool){
  const rows=(await client.query(`
    SELECT career_slot FROM clubs WHERE user_id=$1 AND career_slot IS NOT NULL
    UNION ALL
    SELECT career_slot FROM player_careers WHERE user_id=$1 AND career_slot IS NOT NULL
  `,[userId])).rows;
  const used=new Set(rows.map(r=>Number(r.career_slot)).filter(Boolean));
  for(let i=1;i<=MAX_CAREERS_PER_USER;i++)if(!used.has(i))return i;
  return null;
}
async function activateFirstAvailableCareer(userId){
  const careers=await listUserCareers(userId);
  if(!careers.length)return {type:null,club:null,playerCareer:null};
  const pick=careers.find(x=>x.is_active_career)||careers[0];
  if(pick.career_type==="player"){
    const playerCareer=pick.is_active_career?await activePlayerCareer(userId):await activatePlayerCareer(userId,pick.id);
    return {type:"player",playerCareer,club:null};
  }
  const club=pick.is_active_career?await userClub(userId):await activateUserCareer(userId,pick.id);
  return {type:"club",club,playerCareer:null};
}

function playerCareerBaseAttributes(position){
  if(position==="GK")return {overall:60,pace:55,shooting:40,passing:60,defending:66,role:"GK"};
  if(position==="DEF")return {overall:61,pace:62,shooting:50,passing:58,defending:66,role:"CB"};
  if(position==="MID")return {overall:61,pace:62,shooting:58,passing:66,defending:57,role:"CM"};
  return {overall:61,pace:67,shooting:66,passing:58,defending:42,role:"ST"};
}
function recomputePlayerOverall(pc){
  const pace=Number(pc.pace),shoot=Number(pc.shooting),pass=Number(pc.passing),def=Number(pc.defending);
  let v;
  if(pc.position==="GK")v=def*.52+pass*.25+pace*.13+shoot*.10;
  else if(pc.position==="DEF")v=def*.42+pace*.25+pass*.23+shoot*.10;
  else if(pc.position==="MID")v=pass*.38+pace*.22+shoot*.22+def*.18;
  else v=shoot*.40+pace*.30+pass*.22+def*.08;
  return clamp(Math.round(v),40,99);
}
async function playerCareerClubChoices(countryCode,division="D"){
  return (await q(`
    SELECT id,name,base_rating,country_code,national_seed_division
    FROM clubs
    WHERE is_ai=TRUE AND club_kind='national' AND country_code=$1 AND national_seed_division=$2
    ORDER BY base_rating DESC,name
    LIMIT 20
  `,[countryCode,division])).rows;
}
async function createPlayerSeasonData(countryCode,division,clubId,seasonNo){
  let teams=(await q(`
    SELECT id,name,base_rating FROM clubs
    WHERE is_ai=TRUE AND club_kind='national' AND country_code=$1 AND national_seed_division=$2 AND id<>$3
    ORDER BY base_rating DESC,name
    LIMIT 19
  `,[countryCode,division,clubId])).rows.map(r=>Number(r.id));
  teams.push(Number(clubId));
  teams=[...new Set(teams)];
  if(teams.length<20){
    const fill=(await q(`
      SELECT id FROM clubs
      WHERE is_ai=TRUE AND club_kind='national' AND country_code=$1 AND id<>ALL($2::bigint[])
      ORDER BY ABS(COALESCE(base_rating,64)-64),name LIMIT $3
    `,[countryCode,teams,20-teams.length])).rows.map(r=>Number(r.id));
    teams.push(...fill);
  }
  if(teams.length!==20)throw new Error(`Não foi possível montar a liga de jogador em ${countryName(countryCode)}.`);
  return {
    seasonNo,
    leagueName:leagueName(countryCode,division),
    league:divisionObject(teams),
    history:[],
    payments:[],
    transferOffers:[],
    acceptedOffer:null,
    nextDivision:division
  };
}
async function hydratePlayerCareer(pc){
  if(!pc)return null;
  const data=typeof pc.data==="string"?JSON.parse(pc.data):pc.data;
  const ids=new Set([Number(pc.club_id)]);
  for(const e of data?.league?.entries||[])ids.add(Number(e.clubId));
  for(const f of data?.league?.fixtures||[]){ids.add(Number(f.home));ids.add(Number(f.away))}
  for(const o of data?.transferOffers||[])if(o.clubId)ids.add(Number(o.clubId));
  const clubs=(await q(`SELECT id,name,base_rating,primary_color,secondary_color,country_code,national_seed_division FROM clubs WHERE id=ANY($1::bigint[])`,[[...ids]])).rows;
  const map=new Map(clubs.map(c=>[String(c.id),c]));
  const entries=sortEntries(data?.league?.entries||[]).map(e=>({...e,gd:e.gf-e.ga,club:map.get(String(e.clubId))}));
  const fixtures=(data?.league?.fixtures||[]).map(f=>({...f,homeClub:map.get(String(f.home)),awayClub:map.get(String(f.away))}));
  return {
    career:{
      id:pc.id,career_slot:pc.career_slot,career_label:pc.career_label,player_name:pc.player_name,
      nationality_code:pc.nationality_code,country_code:pc.country_code,position:pc.position,role:pc.role,
      age:pc.age,club_id:pc.club_id,club_name:map.get(String(pc.club_id))?.name||pc.club_name,
      club_division:pc.club_division,league_name:leagueName(pc.country_code,pc.club_division),
      season_no:pc.season_no,current_round:pc.current_round,status:pc.status,
      overall:pc.overall,pace:pc.pace,shooting:pc.shooting,passing:pc.passing,defending:pc.defending,
      fitness:pc.fitness,morale:pc.morale,appearances:pc.appearances,goals:pc.goals,assists:pc.assists,
      clean_sheets:pc.clean_sheets,skill_points:pc.skill_points,reputation:pc.reputation,
      salary:pc.salary,balance:pc.balance,manual_saved_at:pc.manual_saved_at
    },
    league:{entries,fixtures},
    history:data?.history||[],
    payments:data?.payments||[],
    transferOffers:(data?.transferOffers||[]).map(o=>({...o,club:map.get(String(o.clubId))})),
    acceptedOffer:data?.acceptedOffer||null,
    nextDivision:data?.nextDivision||pc.club_division
  };
}
async function generatePlayerTransferOffers(pc,data){
  const table=sortEntries(data.league.entries);
  const pos=Math.max(1,table.findIndex(e=>String(e.clubId)===String(pc.club_id))+1);
  let target=pc.club_division;
  if((Number(pc.overall)>=66||Number(pc.reputation)>=28)&&pc.club_division!=="A")target={D:"C",C:"B",B:"A"}[pc.club_division]||pc.club_division;
  const clubs=(await q(`
    SELECT id,name,base_rating FROM clubs
    WHERE is_ai=TRUE AND club_kind='national' AND country_code=$1 AND national_seed_division=$2 AND id<>$3
    ORDER BY RANDOM() LIMIT 3
  `,[pc.country_code,target,pc.club_id])).rows;
  data.transferOffers=clubs.map((c,i)=>({
    clubId:Number(c.id),
    clubName:c.name,
    division:target,
    salary:Math.max(Number(pc.salary)+150,Math.round((Number(pc.overall)*18+Number(c.base_rating)*8+i*90)/50)*50),
    status:"pending"
  }));
  if(pos<=4&&pc.club_division!=="A")data.nextDivision={D:"C",C:"B",B:"A"}[pc.club_division];
  else if(pos>=17&&pc.club_division!=="D")data.nextDivision={A:"B",B:"C",C:"D"}[pc.club_division];
  else data.nextDivision=pc.club_division;
  return data;
}
async function simulatePlayerCareerRound(userId){
  return tx(async client=>{
    const pc=(await client.query(`SELECT * FROM player_careers WHERE user_id=$1 AND is_active_career=TRUE FOR UPDATE`,[userId])).rows[0];
    if(!pc)throw Object.assign(new Error("Carreira de jogador não encontrada."),{status:404});
    if(pc.status!=="ACTIVE")throw Object.assign(new Error("A temporada terminou. Vá para a próxima temporada."),{status:400});

    const data=typeof pc.data==="string"?JSON.parse(pc.data):pc.data;
    const round=Number(pc.current_round);
    const games=data.league.fixtures.filter(f=>Number(f.round)===round&&!f.played);
    const clubMap=await fastClubSnapshot();
    let playerMatch=null;

    for(const f of games){
      const userGame=String(f.home)===String(pc.club_id)||String(f.away)===String(pc.club_id);
      if(!userGame){
        const sc=fastScore(f.home,f.away,clubMap);
        f.played=true;f.hg=sc.hg;f.ag=sc.ag;
        applyResult(findEntry(data.league.entries,f.home),sc.hg,sc.ag);
        applyResult(findEntry(data.league.entries,f.away),sc.ag,sc.hg);
        continue;
      }

      const home=clubMap.get(String(f.home))||{name:"Mandante",rating:64};
      const away=clubMap.get(String(f.away))||{name:"Visitante",rating:64};
      const userHome=String(f.home)===String(pc.club_id);
      const basePerf=6.35+(Number(pc.overall)-60)*.035+(Number(pc.fitness)-70)*.012+(Math.random()*1.6-.8);
      const performance=clamp(Math.round(basePerf*10)/10,4.5,10);
      const attackWeight=pc.position==="ATT"?1:pc.position==="MID"?.65:pc.position==="DEF"?.22:.04;
      const assistWeight=pc.position==="MID"?1:pc.position==="ATT"?.65:pc.position==="DEF"?.25:.05;
      let goals=0,assists=0;
      if(Math.random()<clamp(.08+attackWeight*(Number(pc.overall)-50)/100+performance*.012,.03,.62))goals++;
      if(pc.position==="ATT"&&performance>8.2&&Math.random()<.22)goals++;
      if(Math.random()<clamp(.07+assistWeight*(Number(pc.passing)-45)/110+performance*.01,.03,.52))assists++;

      const boost=(Number(pc.overall)-60)*.12+(performance-6.5)*1.5;
      const hr=Number(home.rating)+(userHome?boost:0);
      const ar=Number(away.rating)+(userHome?0:boost);
      const sc=basicScore(hr,ar);
      if(userHome)sc.hg=Math.max(sc.hg,goals);
      else sc.ag=Math.max(sc.ag,goals);

      f.played=true;f.hg=sc.hg;f.ag=sc.ag;
      applyResult(findEntry(data.league.entries,f.home),sc.hg,sc.ag);
      applyResult(findEntry(data.league.entries,f.away),sc.ag,sc.hg);

      const ug=userHome?sc.hg:sc.ag,og=userHome?sc.ag:sc.hg;
      const result=ug>og?"win":ug===og?"draw":"loss";
      const newFitness=clamp(Number(pc.fitness)-rand(7,13),35,100);
      const newMorale=clamp(Number(pc.morale)+(result==="win"?4:result==="draw"?1:-3),35,100);
      const skillGain=performance>=8.5?2:performance>=7?1:0;
      const repGain=performance>=8?2:performance>=6.5?1:0;

      playerMatch={
        round,
        home:f.home,away:f.away,
        homeName:home.name,awayName:away.name,
        homeGoals:sc.hg,awayGoals:sc.ag,
        performance,goals,assists,result,
        date:new Date().toISOString()
      };
      data.history.unshift(playerMatch);
      data.history=data.history.slice(0,40);

      pc.appearances=Number(pc.appearances)+1;
      pc.goals=Number(pc.goals)+goals;
      pc.assists=Number(pc.assists)+assists;
      if(pc.position==="GK"&&og===0)pc.clean_sheets=Number(pc.clean_sheets)+1;
      pc.fitness=newFitness;
      pc.morale=newMorale;
      pc.skill_points=Number(pc.skill_points)+skillGain;
      pc.reputation=clamp(Number(pc.reputation)+repGain,0,100);
    }

    let balance=Number(pc.balance);
    if(round%4===0){
      balance+=Number(pc.salary);
      data.payments.unshift({round,amount:Number(pc.salary),season:pc.season_no,date:new Date().toISOString()});
      data.payments=data.payments.slice(0,20);
    }

    let nextRound=round+1,status=pc.status;
    if(round>=38){
      status="END";
      nextRound=39;
      await generatePlayerTransferOffers({...pc,balance},data);
    }

    await client.query(`
      UPDATE player_careers SET
        current_round=$2,status=$3,fitness=$4,morale=$5,appearances=$6,goals=$7,assists=$8,clean_sheets=$9,
        skill_points=$10,reputation=$11,balance=$12,data=$13::jsonb,updated_at=NOW()
      WHERE id=$1
    `,[pc.id,nextRound,status,pc.fitness,pc.morale,pc.appearances,pc.goals,pc.assists,pc.clean_sheets,
       pc.skill_points,pc.reputation,balance,JSON.stringify(data)]);

    return {match:playerMatch,status,nextRound,skillPoints:pc.skill_points,balance};
  });
}
async function trainPlayerCareer(userId,attribute){
  const allowed=new Set(["pace","shooting","passing","defending","fitness"]);
  if(!allowed.has(attribute))throw Object.assign(new Error("Treino inválido."),{status:400});
  return tx(async client=>{
    const pc=(await client.query(`SELECT * FROM player_careers WHERE user_id=$1 AND is_active_career=TRUE FOR UPDATE`,[userId])).rows[0];
    if(!pc)throw Object.assign(new Error("Carreira de jogador não encontrada."),{status:404});
    if(pc.status!=="ACTIVE")throw Object.assign(new Error("Treinos ficam disponíveis durante a temporada."),{status:400});

    if(attribute==="fitness"){
      if(Number(pc.fitness)>=100)throw Object.assign(new Error("Seu físico já está em 100%."),{status:400});
      await client.query(`UPDATE player_careers SET fitness=LEAST(100,fitness+12),morale=LEAST(100,morale+2),updated_at=NOW() WHERE id=$1`,[pc.id]);
    }else{
      if(Number(pc.skill_points)<=0)throw Object.assign(new Error("Você precisa de pelo menos 1 ponto de evolução."),{status:400});
      if(Number(pc[attribute])>=99)throw Object.assign(new Error("Esse atributo já chegou ao máximo."),{status:400});
      const updated={...pc,[attribute]:Number(pc[attribute])+1};
      updated.overall=recomputePlayerOverall(updated);
      await client.query(`UPDATE player_careers SET ${attribute}=${attribute}+1,overall=$2,skill_points=skill_points-1,updated_at=NOW() WHERE id=$1`,[pc.id,updated.overall]);
    }
    return (await client.query(`SELECT pc.*,c.name club_name,c.base_rating club_rating FROM player_careers pc JOIN clubs c ON c.id=pc.club_id WHERE pc.id=$1`,[pc.id])).rows[0];
  });
}
async function acceptPlayerCareerOffer(userId,clubId){
  return tx(async client=>{
    const pc=(await client.query(`SELECT * FROM player_careers WHERE user_id=$1 AND is_active_career=TRUE FOR UPDATE`,[userId])).rows[0];
    if(!pc)throw Object.assign(new Error("Carreira de jogador não encontrada."),{status:404});
    if(pc.status!=="END")throw Object.assign(new Error("As propostas podem ser aceitas no fim da temporada."),{status:400});
    const data=typeof pc.data==="string"?JSON.parse(pc.data):pc.data;
    const offer=(data.transferOffers||[]).find(o=>String(o.clubId)===String(clubId)&&o.status==="pending");
    if(!offer)throw Object.assign(new Error("Proposta não encontrada."),{status:404});
    data.transferOffers=(data.transferOffers||[]).map(o=>({...o,status:String(o.clubId)===String(clubId)?"accepted":"rejected"}));
    data.acceptedOffer={...offer,status:"accepted"};
    // A transferência é confirmada para a próxima temporada.
    // O clube/posição atual da temporada encerrada permanece intacto até o usuário avançar o calendário.
    await client.query(`UPDATE player_careers SET data=$2::jsonb,morale=LEAST(100,morale+8),updated_at=NOW() WHERE id=$1`,
      [pc.id,JSON.stringify(data)]);
    return {ok:true,offer,message:`Transferência para ${offer.clubName} confirmada para a próxima temporada.`};
  });
}
async function nextPlayerCareerSeason(userId){
  return tx(async client=>{
    const pc=(await client.query(`SELECT * FROM player_careers WHERE user_id=$1 AND is_active_career=TRUE FOR UPDATE`,[userId])).rows[0];
    if(!pc)throw Object.assign(new Error("Carreira de jogador não encontrada."),{status:404});
    if(pc.status!=="END")throw Object.assign(new Error("A temporada ainda não terminou."),{status:400});
    const oldData=typeof pc.data==="string"?JSON.parse(pc.data):pc.data;
    const accepted=oldData.acceptedOffer;
    const nextDiv=accepted?.division||oldData.nextDivision||pc.club_division;
    const nextClubId=accepted?.clubId||pc.club_id;
    const nextSeason=Number(pc.season_no)+1;
    const data=await createPlayerSeasonData(pc.country_code,nextDiv,nextClubId,nextSeason);

    await client.query(`
      UPDATE player_careers SET
        age=age+1,club_id=$2,club_division=$3,season_no=$4,current_round=1,status='ACTIVE',
        fitness=100,morale=78,data=$5::jsonb,updated_at=NOW()
      WHERE id=$1
    `,[pc.id,nextClubId,nextDiv,nextSeason,JSON.stringify(data)]);

    return (await client.query(`SELECT pc.*,c.name club_name,c.base_rating club_rating FROM player_careers pc JOIN clubs c ON c.id=pc.club_id WHERE pc.id=$1`,[pc.id])).rows[0];
  });
}
async function clubRating(clubId,client=pool){
  return (await client.query(`SELECT COALESCE(ROUND(AVG(rating)),64)::int rating FROM players WHERE club_id=$1 AND is_starter=TRUE`,[clubId])).rows[0].rating;
}
function poisson(lambda){
  const L=Math.exp(-lambda);let k=0,p=1;
  do{k++;p*=Math.random()}while(p>L);
  return k-1;
}
function effectiveRating(p){
  const fitnessPenalty=(100-Number(p.fitness||100))*0.12;
  const moraleBonus=(Number(p.morale||70)-70)*0.07;
  return Number(p.rating)-fitnessPenalty+moraleBonus;
}
function basicScore(hr,ar){
  return {
    hg:Math.min(6,poisson(clamp(1.28+(hr-ar)*.032,.28,3.15))),
    ag:Math.min(6,poisson(clamp(1.08+(ar-hr)*.032,.24,2.95)))
  };
}
function formationQuotas(formation){
  if(formation==="4-4-2")return {GK:1,DEF:4,MID:4,ATT:2};
  if(formation==="3-5-2")return {GK:1,DEF:3,MID:5,ATT:2};
  return {GK:1,DEF:4,MID:3,ATT:3};
}
function sortForSelection(players,preferManual){
  return [...players].sort((a,b)=>{
    if(preferManual&&Boolean(a.is_starter)!==Boolean(b.is_starter))return a.is_starter?-1:1;
    return effectiveRating(b)-effectiveRating(a);
  });
}
async function matchStarters(client,club,isUser){
  await createRoster(client,club,false);
  const all=(await client.query(`SELECT * FROM players WHERE club_id=$1 ORDER BY rating DESC`,[club.id])).rows;
  const healthy=all.filter(p=>Number(p.injury_games||0)<=0);
  if(healthy.length<11)throw Object.assign(new Error(`${club.name} não possui 11 jogadores disponíveis.`),{status:400});
  const q=formationQuotas(club.formation);
  const chosen=[];
  for(const position of ["GK","DEF","MID","ATT"]){
    const pool=sortForSelection(healthy.filter(p=>p.position===position),isUser);
    chosen.push(...pool.slice(0,q[position]));
  }
  if(chosen.length<11){
    const used=new Set(chosen.map(p=>String(p.id)));
    const remaining=sortForSelection(healthy.filter(p=>!used.has(String(p.id))),isUser);
    chosen.push(...remaining.slice(0,11-chosen.length));
  }
  if(!chosen.some(p=>p.position==="GK"))throw Object.assign(new Error(`${club.name} está sem goleiro disponível.`),{status:400});
  return chosen.slice(0,11);
}
function teamMetrics(players){
  const strength=players.reduce((a,p)=>a+effectiveRating(p),0)/players.length;
  const attack=players.reduce((a,p)=>a+(Number(p.shooting)*.48+Number(p.passing)*.32+Number(p.pace)*.20),0)/players.length;
  const defense=players.reduce((a,p)=>a+(Number(p.defending)*.72+Number(p.passing)*.12+effectiveRating(p)*.16),0)/players.length;
  return {strength,attack,defense};
}
function realisticScore(homePlayers,awayPlayers){
  const h=teamMetrics(homePlayers),a=teamMetrics(awayPlayers);
  const homeLambda=clamp(1.22+(h.strength-a.strength)*.028+(h.attack-a.defense)*.012+.16,.22,3.05);
  const awayLambda=clamp(1.02+(a.strength-h.strength)*.028+(a.attack-h.defense)*.012,.20,2.85);
  return {hg:Math.min(6,poisson(homeLambda)),ag:Math.min(6,poisson(awayLambda)),hr:Math.round(h.strength),ar:Math.round(a.strength)};
}
function weightedPick(players){
  const x=[];
  for(const p of players){
    const n=p.position==="ATT"?7:p.position==="MID"?4:p.position==="DEF"?2:1;
    for(let i=0;i<n;i++)x.push(p);
  }
  return x[rand(0,x.length-1)]||players[0];
}
function eventsFor(clubId,startersList,goals){
  const ev=[];
  for(let i=0;i<goals;i++){
    const scorer=weightedPick(startersList.filter(p=>p.position!=="GK"));
    const pool=startersList.filter(p=>String(p.id)!==String(scorer.id)&&p.position!=="GK");
    const assist=pool.length&&Math.random()<.7?weightedPick(pool):null;
    ev.push({type:"goal",clubId,minute:rand(3,89),scorerId:scorer.id,assistId:assist?.id||null,text:`Gol de ${scorer.name}${assist?` (assistência de ${assist.name})`:""}`});
  }
  if(Math.random()<.52){
    const p=startersList[rand(0,startersList.length-1)];
    ev.push({type:"yellow",clubId,minute:rand(15,87),playerId:p.id,text:`Cartão amarelo para ${p.name}`});
  }
  return ev;
}
async function applyStatsAndCondition(client,clubId,startersList,conceded,events,result){
  const selectedIds=startersList.map(p=>p.id);
  await client.query(`UPDATE players SET appearances=appearances+1 WHERE id=ANY($1::bigint[])`,[selectedIds]);
  if(conceded===0){
    const gk=startersList.find(p=>p.position==="GK");
    if(gk)await client.query(`UPDATE players SET clean_sheets=clean_sheets+1 WHERE id=$1`,[gk.id]);
  }
  for(const e of events.filter(x=>String(x.clubId)===String(clubId))){
    if(e.type==="goal"){
      await client.query(`UPDATE players SET goals=goals+1 WHERE id=$1`,[e.scorerId]);
      if(e.assistId)await client.query(`UPDATE players SET assists=assists+1 WHERE id=$1`,[e.assistId]);
    }
    if(e.type==="yellow")await client.query(`UPDATE players SET yellow_cards=yellow_cards+1 WHERE id=$1`,[e.playerId]);
  }
  for(const p of startersList){
    const fatigue=rand(8,14);
    const moraleDelta=result==="win"?3:result==="draw"?1:-2;
    await client.query(`UPDATE players SET fitness=GREATEST(25,fitness-$2),morale=GREATEST(35,LEAST(100,morale+$3)) WHERE id=$1`,[p.id,fatigue,moraleDelta]);
  }
  await client.query(`UPDATE players SET fitness=LEAST(100,fitness+$2) WHERE club_id=$1 AND NOT(id=ANY($3::bigint[]))`,[clubId,rand(7,11),selectedIds]);
  await client.query(`UPDATE players SET injury_games=GREATEST(0,injury_games-1) WHERE club_id=$1 AND injury_games>0`,[clubId]);
}
async function recordUserMatch(client,ownerId,opponentId,m,events,type,reward=0){
  await client.query(`INSERT INTO matches(user_club_id,opponent_club_id,user_goals,opponent_goals,reward,user_rating,opponent_rating,events,match_type)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)`,
    [ownerId,opponentId,m.userGoals,m.opponentGoals,reward,m.userRating,m.opponentRating,JSON.stringify(events),type]);
}
async function addFinance(client,clubId,amount,category,description){
  await client.query(`UPDATE clubs SET coins=coins+$2 WHERE id=$1`,[clubId,amount]);
  await client.query(`INSERT INTO club_finance_events(club_id,amount,category,description) VALUES($1,$2,$3,$4)`,[clubId,amount,category,description]);
}
async function wageBill(client,clubId){
  return Number((await client.query(`SELECT COALESCE(SUM(salary),0)::int total FROM players WHERE club_id=$1`,[clubId])).rows[0].total||0);
}
function financeRates(context){
  const key=String(context||"D").toUpperCase();
  if(key==="A")return {sponsor:5200,gate:4700};
  if(key==="B")return {sponsor:3900,gate:3400};
  if(key==="C")return {sponsor:3000,gate:2600};
  if(key==="D")return {sponsor:2400,gate:2100};
  if(key==="LIB")return {sponsor:6200,gate:5600};
  if(key==="CUP")return {sponsor:4400,gate:4000};
  return {sponsor:1900,gate:1500};
}
async function unexpectedClubEvent(client,clubId){
  if(Math.random()>.22)return null;
  const players=(await client.query(`SELECT id,name,age,rating FROM players WHERE club_id=$1 ORDER BY RANDOM() LIMIT 6`,[clubId])).rows;
  if(!players.length)return null;
  const p=players[rand(0,players.length-1)];
  const type=rand(1,5);
  let title,description;
  if(type===1){
    const games=rand(1,3);
    await client.query(`UPDATE players SET injury_games=GREATEST(injury_games,$2),fitness=GREATEST(30,fitness-15) WHERE id=$1`,[p.id,games]);
    title="Lesão inesperada";description=`${p.name} sofreu uma lesão e ficará fora por ${games} jogo(s).`;
  }else if(type===2){
    const bonus=rand(12,35)*100;
    await addFinance(client,clubId,bonus,"bonus","Bônus comercial inesperado");
    title="Novo bônus comercial";description=`O clube recebeu ${bonus.toLocaleString("pt-BR")} moedas de uma ação com patrocinadores.`;
  }else if(type===3){
    await client.query(`UPDATE players SET morale=LEAST(100,morale+12) WHERE id=$1`,[p.id]);
    title="Jogador motivado";description=`${p.name} ganhou confiança e melhorou o moral.`;
  }else if(type===4&&Number(p.age)<=24){
    await client.query(`UPDATE players SET rating=LEAST(95,rating+1),price=ROUND(price*1.08)::int WHERE id=$1`,[p.id]);
    title="Evolução no treino";description=`${p.name} evoluiu e ganhou +1 de overall.`;
  }else{
    await client.query(`UPDATE players SET fitness=LEAST(100,fitness+12) WHERE club_id=$1`,[clubId]);
    title="Semana leve";description="A comissão técnica recuperou melhor o elenco. O condicionamento físico subiu.";
  }
  await client.query(`INSERT INTO club_events(club_id,event_type,title,description) VALUES($1,$2,$3,$4)`,[clubId,"unexpected",title,description]);
  return {title,description};
}
async function settleMatchFinances(client,clubId,context,isHome,result){
  const rates=financeRates(context);
  const sponsor=0;
  const gate=isHome?Math.round(rates.gate*(rand(85,115)/100)):0;
  const performance=result==="win"?650:result==="draw"?250:80;
  if(gate)await addFinance(client,clubId,gate,"tickets","Bilheteria da partida em casa");
  await addFinance(client,clubId,performance,"performance","Bônus pelo resultado");
  const event=await unexpectedClubEvent(client,clubId);
  return {sponsor,gate,performance,wages:0,net:gate+performance,event};
}


function seasonStartYear(seasonNo){return 2026+Math.max(0,Number(seasonNo||1)-1)}
function monthKey(d){return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}`}
function isoDate(d){return d.toISOString().slice(0,10)}
function addDays(dateStr,days){const d=new Date(`${dateStr}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+days);return d}
function initialCalendar(seasonNo){
  const year=seasonStartYear(seasonNo);
  return {date:`${year}-01-15`,lastPayrollMonth:`${year}-01`,events:[],payrolls:[]};
}
function ensureCalendarData(career){
  if(!career.data.calendar)career.data.calendar=initialCalendar(career.season_no);
  if(!Array.isArray(career.data.calendar.events))career.data.calendar.events=[];
  if(!Array.isArray(career.data.calendar.payrolls))career.data.calendar.payrolls=[];
  if(!career.data.calendar.lastPayrollMonth)career.data.calendar.lastPayrollMonth=monthKey(new Date(`${career.data.calendar.date}T12:00:00Z`));
  return career.data.calendar;
}
function nextPayrollDate(calendar){
  const d=new Date(`${calendar.date}T12:00:00Z`);
  const next=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,1,12));
  return isoDate(next);
}
function transferBanInfo(balance){
  const amount=Number(balance||0);
  return {active:amount<TRANSFER_BAN_THRESHOLD,threshold:TRANSFER_BAN_THRESHOLD,balance:amount,debt:amount<0?Math.abs(amount):0};
}
async function recordTrophy(client,clubId,seasonNo,competition,title){
  const r=await client.query(`INSERT INTO club_trophies(club_id,season_no,competition,title) VALUES($1,$2,$3,$4) ON CONFLICT(club_id,season_no,competition) DO NOTHING RETURNING id`,[clubId,seasonNo,competition,title]);
  return r.rowCount>0;
}
async function maybeRecordDivisionTrophy(client,career,ownerId){
  const div=career.user_division;
  const table=sortEntries(career.data.divisions?.[div]?.entries||[]);
  if(table[0]&&String(table[0].clubId)===String(ownerId))await recordTrophy(client,ownerId,career.season_no,`LIGA_${div}`,`Campeão — ${leagueName(career.country_code||"BR",div)}`);
}
async function generateIncomingOffers(client,clubId,{force=false,playerId=null}={}){
  const pending=Number((await client.query(`SELECT COUNT(*)::int count FROM transfer_offers WHERE selling_club_id=$1 AND status='pending'`,[clubId])).rows[0].count||0);
  if(pending>=5&&!force)return 0;
  let players;
  if(playerId){
    players=(await client.query(`SELECT * FROM players WHERE id=$1 AND club_id=$2`,[playerId,clubId])).rows;
  }else{
    players=(await client.query(`SELECT * FROM players WHERE club_id=$1 ORDER BY transfer_listed DESC,rating DESC`,[clubId])).rows;
  }
  if(!players.length)return 0;
  const already=(await client.query(`SELECT player_id FROM transfer_offers WHERE selling_club_id=$1 AND status='pending'`,[clubId])).rows.map(r=>String(r.player_id));
  const loaned=(await client.query(`SELECT player_id FROM player_loans WHERE borrowing_club_id=$1 AND status='active'`,[clubId])).rows.map(r=>String(r.player_id));
  const eligible=players.filter(p=>!already.includes(String(p.id))&&!loaned.includes(String(p.id))&&(p.transfer_listed||force||Math.random()<.18));
  if(!eligible.length)return 0;
  const seller=(await client.query(`SELECT country_code FROM clubs WHERE id=$1`,[clubId])).rows[0];
  const buyers=(await client.query(`SELECT id,name,base_rating FROM clubs WHERE is_ai=TRUE AND country_code=$1 ORDER BY RANDOM() LIMIT 20`,[seller?.country_code||"BR"])).rows;
  if(!buyers.length)return 0;
  let created=0;
  for(const p of shuffle(eligible).slice(0,force?2:1)){
    const buyer=buyers.find(b=>String(b.id)!==String(clubId));if(!buyer)continue;
    const base=fairMarketValue(p);
    const factor=p.transfer_listed?(rand(98,112)/100):(rand(93,106)/100);
    const amount=Math.max(500,Math.round(base*factor/100)*100);
    const ins=await client.query(`INSERT INTO transfer_offers(selling_club_id,player_id,buying_club_id,amount,status) VALUES($1,$2,$3,$4,'pending') ON CONFLICT DO NOTHING RETURNING id`,[clubId,p.id,buyer.id,amount]);
    created+=ins.rowCount;
  }
  return created;
}
async function payMonthlyWages(client,career,clubId,month){
  const wages=await wageBill(client,clubId);
  if(wages>0)await addFinance(client,clubId,-wages,"wages",`Folha salarial mensal — ${month}`);

  const sponsor=await paySponsorMonth(client,clubId,month);
  const installments=await payTransferInstallments(client,clubId,month);
  const loanFees=await processLoanMonth(client,clubId,month);

  const balance=Number((await client.query(`SELECT coins FROM clubs WHERE id=$1`,[clubId])).rows[0]?.coins||0);
  const cal=ensureCalendarData(career);
  cal.payrolls.unshift({
    month,
    amount:wages,
    sponsor: sponsor?.amount||0,
    installments,
    loanFees,
    balance
  });
  cal.payrolls=cal.payrolls.slice(0,18);

  if(balance<0)await client.query(`UPDATE players SET morale=GREATEST(35,morale-3) WHERE club_id=$1`,[clubId]);
  if(balance<TRANSFER_BAN_THRESHOLD){
    const recentBan=(await client.query(`SELECT 1 FROM club_events WHERE club_id=$1 AND event_type='finance' AND title='Transfer ban por endividamento' AND created_at>NOW()-INTERVAL '35 days' LIMIT 1`,[clubId])).rowCount>0;
    if(!recentBan)await client.query(`INSERT INTO club_events(club_id,event_type,title,description) VALUES($1,'finance','Transfer ban por endividamento',$2)`,
      [clubId,`O saldo chegou a ${balance.toLocaleString("pt-BR")} moedas. Contratações e novos empréstimos ficam bloqueados enquanto o caixa estiver abaixo de ${TRANSFER_BAN_THRESHOLD.toLocaleString("pt-BR")}.`]);
  }

  await generateIncomingOffers(client,clubId,{force:false});
  return {wages,sponsor,installments,loanFees,balance};
}

async function advanceCalendar(career,clubId,days,label){
  const cal=ensureCalendarData(career);
  const before=new Date(`${cal.date}T12:00:00Z`);
  const after=addDays(cal.date,days);
  let cursor=new Date(Date.UTC(before.getUTCFullYear(),before.getUTCMonth()+1,1,12));
  while(cursor<=after){
    const key=monthKey(cursor);
    if(key!==cal.lastPayrollMonth){
      await tx(async client=>{await payMonthlyWages(client,career,clubId,key)});
      cal.lastPayrollMonth=key;
    }
    cursor=new Date(Date.UTC(cursor.getUTCFullYear(),cursor.getUTCMonth()+1,1,12));
  }
  cal.date=isoDate(after);
  if(label){cal.events.unshift({date:cal.date,label});cal.events=cal.events.slice(0,30)}
  career.data.calendar=cal;
  return cal;
}
function calendarSummary(career,monthlyWages=0){
  const cal=ensureCalendarData(career);
  const d=new Date(`${cal.date}T12:00:00Z`);
  const next=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,1,12));
  return {currentDate:cal.date,nextPayrollDate:isoDate(next),monthlyWages,events:cal.events||[],payrolls:cal.payrolls||[]};
}

async function fullMatch(client,homeId,awayId,userId){
  const cs=(await client.query(`SELECT * FROM clubs WHERE id=ANY($1::bigint[])`,[[homeId,awayId]])).rows;
  const home=cs.find(c=>String(c.id)===String(homeId)),away=cs.find(c=>String(c.id)===String(awayId));
  await applyFelipeMode(client,home.id);
  await applyFelipeMode(client,away.id);
  const hs=await matchStarters(client,home,String(home.id)===String(userId));
  const as=await matchStarters(client,away,String(away.id)===String(userId));
  const sim=realisticScore(hs,as);
  let hg=sim.hg,ag=sim.ag;
  const homeFelipe=isFelipeName(home.name),awayFelipe=isFelipeName(away.name);
  if(homeFelipe&&!awayFelipe){
    const score=felipeScore();hg=score.winner;ag=score.loser;
  }else if(awayFelipe&&!homeFelipe){
    const score=felipeScore();ag=score.winner;hg=score.loser;
  }
  const visualHomeGoals=Math.min(hg,8),visualAwayGoals=Math.min(ag,8);
  const events=[...eventsFor(home.id,hs,visualHomeGoals),...eventsFor(away.id,as,visualAwayGoals)].sort((a,b)=>a.minute-b.minute);
  if(homeFelipe||awayFelipe){
    const winner=homeFelipe?home:away;
    events.unshift({type:"special",clubId:winner.id,minute:1,text:`Modo FELIPE ativado para ${winner.name}: todos os jogadores em 100.`});
  }
  const homeResult=hg>ag?"win":hg===ag?"draw":"loss",awayResult=ag>hg?"win":ag===hg?"draw":"loss";
  const userHome=String(home.id)===String(userId);

  // A carreira só altera o próprio elenco. Adversários (IA ou outra pessoa)
  // não recebem fadiga/estatísticas por uma partida iniciada neste save.
  if(userHome){
    await applyStatsAndCondition(client,home.id,hs,ag,events,homeResult);
    await client.query(`UPDATE clubs SET team_rating=$2 WHERE id=$1`,[home.id,Math.round(hs.reduce((a,p)=>a+Number(p.rating),0)/hs.length)]);
  }else{
    await applyStatsAndCondition(client,away.id,as,hg,events,awayResult);
    await client.query(`UPDATE clubs SET team_rating=$2 WHERE id=$1`,[away.id,Math.round(as.reduce((a,p)=>a+Number(p.rating),0)/as.length)]);
  }

  const ug=userHome?hg:ag,og=userHome?ag:hg;
  return {
    home,away,hg,ag,events,homeLineup:hs,awayLineup:as,
    userMatch:{
      result:ug>og?"win":ug===og?"draw":"loss",
      userClub:userHome?home.name:away.name,
      opponent:userHome?away.name:home.name,
      userGoals:ug,opponentGoals:og,
      userRating:userHome?sim.hr:sim.ar,opponentRating:userHome?sim.ar:sim.hr,
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
function copaStageLabel(stage){return ({R32:"Primeira fase",R16:"Oitavas de final",QF:"Quartas de final",SF:"Semifinais",FINAL:"Final"})[stage]||stage}
async function createCopaBrasil(ownerId){
  const owner=(await q(`SELECT country_code FROM clubs WHERE id=$1`,[ownerId])).rows[0];
  const countryCode=owner?.country_code||"BR";
  const ai=(await q(`SELECT id FROM clubs WHERE is_ai=TRUE AND country_code=$1 AND club_kind='national' ORDER BY base_rating DESC,RANDOM() LIMIT 31`,[countryCode])).rows.map(r=>Number(r.id));
  if(ai.length<31)throw new Error(`Clubes insuficientes para ${domesticCupName(countryCode)}.`);
  const teams=shuffle([Number(ownerId),...ai]);
  const fixtures=[];
  for(let i=0;i<teams.length;i+=2)fixtures.push({stage:"R32",slot:i/2+1,home:teams[i],away:teams[i+1],played:false,hg:null,ag:null,pw:null});
  return {name:domesticCupName(countryCode),countryCode,status:"active",stage:"R32",champion:null,userEliminated:false,fixtures};
}
function copaWinners(copa,stage){
  return copa.fixtures.filter(f=>f.stage===stage&&f.played).sort((a,b)=>(a.slot||0)-(b.slot||0)).map(f=>f.hg>f.ag?f.home:f.ag>f.hg?f.away:(f.pw||f.home));
}
function addCopaStage(copa,stage,ids){
  const x=shuffle(ids);
  for(let i=0;i<x.length;i+=2)copa.fixtures.push({stage,slot:i/2+1,home:x[i],away:x[i+1],played:false,hg:null,ag:null,pw:null});
  copa.stage=stage;
}
async function ensureCopaData(career){
  if(!career.data.copaBrasil)career.data.copaBrasil=await createCopaBrasil(career.owner_club_id);
  return career.data.copaBrasil;
}

async function clubIdsBySeed(div,limit,countryCode="BR"){
  return (await q(`
    SELECT id FROM clubs
    WHERE is_ai=TRUE AND club_kind='national' AND national_seed_division=$1 AND country_code=$2
    ORDER BY base_rating DESC,name
    LIMIT $3
  `,[div,countryCode,limit])).rows.map(x=>Number(x.id));
}
async function buildSeasonData(ownerId,stateCode,previous=null,countryCode="BR"){
  const data={
    state:null,
    divisions:{},
    libertadores:null,
    copaBrasil:null,
    countryCode,
    calendar:initialCalendar(previous?.season_no?Number(previous.season_no)+1:1)
  };
  let members={A:[],B:[],C:[],D:[]};

  if(!previous){
    for(const d of DIVS)members[d]=await clubIdsBySeed(d,d==="D"?19:20,countryCode);
    members.D.push(Number(ownerId));
  }else{
    const t={};
    for(const d of DIVS)t[d]=sortEntries(previous.divisions[d].entries);
    members.A=[...t.A.slice(0,16).map(x=>x.clubId),...t.B.slice(0,4).map(x=>x.clubId)];
    members.B=[...t.A.slice(16,20).map(x=>x.clubId),...t.B.slice(4,16).map(x=>x.clubId),...t.C.slice(0,4).map(x=>x.clubId)];
    members.C=[...t.B.slice(16,20).map(x=>x.clubId),...t.C.slice(4,16).map(x=>x.clubId),...t.D.slice(0,4).map(x=>x.clubId)];
    members.D=[...t.C.slice(16,20).map(x=>x.clubId),...t.D.slice(4,20).map(x=>x.clubId)];
  }

  let userDiv="D";
  for(const d of DIVS){
    if(members[d].length!==20)throw new Error(`${leagueName(countryCode,d)} ficou com ${members[d].length} clubes.`);
    if(members[d].some(id=>String(id)===String(ownerId)))userDiv=d;
    data.divisions[d]=divisionObject(members[d]);
  }

  if(countryCode==="BR"){
    const opp=(await q(`SELECT id FROM clubs WHERE is_ai=TRUE AND country_code='BR' AND state_code=$1 ORDER BY CASE WHEN club_kind='state' THEN 0 ELSE 1 END,RANDOM() LIMIT 7`,[stateCode])).rows.map(x=>Number(x.id));
    if(opp.length<7)throw new Error("Faltam clubes para o Estadual.");
    data.state=stateObject(STATE_DATA.championships[stateCode]||`Campeonato ${stateCode}`,[Number(ownerId),...opp]);
  }

  data.copaBrasil=await createCopaBrasil(ownerId);
  return {data,userDiv};
}

async function createCareer(ownerId,stateCode="",seasonNo=1,previousData=null,countryCode=null){
  const club=(await q(`SELECT country_code FROM clubs WHERE id=$1`,[ownerId])).rows[0];
  countryCode=countryCode||club?.country_code||previousData?.countryCode||"BR";
  const safeState=countryCode==="BR"?stateCode:"";
  const built=await buildSeasonData(ownerId,safeState,previousData,countryCode);
  built.data.calendar=initialCalendar(seasonNo);
  await q(`UPDATE transfer_offers SET status='expired',updated_at=NOW() WHERE selling_club_id=$1 AND status='pending'`,[ownerId]);
  const initialPhase=countryCode==="BR"?"STATE":"NATIONAL";
  await q(`
    INSERT INTO careers(owner_club_id,season_no,phase,state_code,country_code,user_division,current_round,data,updated_at)
    VALUES($1,$2,$3,$4,$5,$6,1,$7::jsonb,NOW())
    ON CONFLICT(owner_club_id) DO UPDATE SET
      season_no=EXCLUDED.season_no,
      phase=EXCLUDED.phase,
      state_code=EXCLUDED.state_code,
      country_code=EXCLUDED.country_code,
      user_division=EXCLUDED.user_division,
      current_round=1,
      data=EXCLUDED.data,
      updated_at=NOW()
  `,[ownerId,seasonNo,initialPhase,safeState,countryCode,built.userDiv,JSON.stringify(built.data)]);
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


async function fastClubSnapshot(){
  const rows=(await q(`SELECT id,name,team_rating,base_rating,is_ai FROM clubs`)).rows;
  return new Map(rows.map(c=>[String(c.id),{
    id:Number(c.id),name:c.name,
    rating:Number(c.is_ai?c.base_rating:(c.team_rating||c.base_rating||64)),
    isAi:Boolean(c.is_ai)
  }]));
}
function fastScore(homeId,awayId,clubMap){
  const home=clubMap.get(String(homeId))||{name:"Mandante",rating:64};
  const away=clubMap.get(String(awayId))||{name:"Visitante",rating:64};
  const homeFelipe=isFelipeName(home.name),awayFelipe=isFelipeName(away.name);
  if(homeFelipe&&!awayFelipe){
    const sc=felipeScore();return {hg:sc.winner,ag:sc.loser};
  }
  if(awayFelipe&&!homeFelipe){
    const sc=felipeScore();return {hg:sc.loser,ag:sc.winner};
  }
  return basicScore(home.rating,away.rating);
}
function fastUserSummary(ownerId,f,hg,ag,clubMap,matchType){
  const home=clubMap.get(String(f.home))||{name:"Mandante",rating:64};
  const away=clubMap.get(String(f.away))||{name:"Visitante",rating:64};
  const userHome=String(f.home)===String(ownerId);
  const ug=userHome?hg:ag,og=userHome?ag:hg;
  return {
    opponentId:userHome?f.away:f.home,
    isHome:userHome,
    result:ug>og?"win":ug===og?"draw":"loss",
    userClub:userHome?home.name:away.name,
    opponent:userHome?away.name:home.name,
    userGoals:ug,opponentGoals:og,
    userRating:userHome?home.rating:away.rating,
    opponentRating:userHome?away.rating:home.rating,
    matchType,
    events:[]
  };
}
function playFastFixture(f,entries,clubMap,ownerId,matchType,userMatches){
  if(f.played)return;
  const {hg,ag}=fastScore(f.home,f.away,clubMap);
  f.played=true;f.hg=hg;f.ag=ag;
  if(entries){
    applyResult(findEntry(entries,f.home),hg,ag);
    applyResult(findEntry(entries,f.away),ag,hg);
  }
  if(String(f.home)===String(ownerId)||String(f.away)===String(ownerId)){
    userMatches.push(fastUserSummary(ownerId,f,hg,ag,clubMap,matchType));
  }
}
function finishFastState(career,ownerId,clubMap,userMatches){
  const st=career.data.state;
  if(st.stage==="FINISHED"){career.phase="NATIONAL";return}
  while(st.stage!=="FINISHED"){
    if(st.stage==="GROUP"){
      while(st.round<=7){
        const games=st.fixtures.filter(f=>f.stage==="GROUP"&&Number(f.round)===Number(st.round));
        games.forEach(f=>playFastFixture(f,st.entries,clubMap,ownerId,"Estadual",userMatches));
        if(st.round>=7){
          const t=sortEntries(st.entries);
          if(!st.fixtures.some(f=>f.stage==="SF")){
            [[t[0].clubId,t[3].clubId],[t[1].clubId,t[2].clubId]].forEach(([home,away],i)=>
              st.fixtures.push({stage:"SF",round:8,slot:i+1,home,away,played:false,hg:null,ag:null,pw:null})
            );
          }
          st.stage="SF";st.round=8;
          break;
        }
        st.round++;
      }
    }else if(st.stage==="SF"){
      const games=st.fixtures.filter(f=>f.stage==="SF");
      const winners=[];
      for(const f of games){
        playFastFixture(f,null,clubMap,ownerId,"Estadual",userMatches);
        const winner=f.hg>f.ag?f.home:f.ag>f.hg?f.away:(Math.random()<.5?f.home:f.away);
        if(f.hg===f.ag)f.pw=winner;
        winners.push(winner);
      }
      if(!st.fixtures.some(f=>f.stage==="FINAL")){
        st.fixtures.push({stage:"FINAL",round:9,slot:1,home:winners[0],away:winners[1],played:false,hg:null,ag:null,pw:null});
      }
      st.stage="FINAL";st.round=9;
    }else if(st.stage==="FINAL"){
      const f=st.fixtures.find(x=>x.stage==="FINAL");
      playFastFixture(f,null,clubMap,ownerId,"Estadual",userMatches);
      st.champion=f.hg>f.ag?f.home:f.ag>f.hg?f.away:(Math.random()<.5?f.home:f.away);
      if(f.hg===f.ag)f.pw=st.champion;
      st.stage="FINISHED";career.phase="NATIONAL";
    }else{
      st.stage="FINISHED";career.phase="NATIONAL";
    }
  }
  career.data.state=st;
}
function simulateFastNationalRounds(career,ownerId,clubMap,userMatches,roundsToPlay){
  let remaining=Math.max(0,Math.min(Number(roundsToPlay||1),39-Number(career.current_round||1)));
  while(career.phase==="NATIONAL"&&remaining>0&&career.current_round<=38){
    const round=Number(career.current_round);
    for(const div of DIVS){
      const d=career.data.divisions[div];
      const games=d.fixtures.filter(f=>Number(f.round)===round&&!f.played);
      games.forEach(f=>playFastFixture(f,d.entries,clubMap,ownerId,leagueName(career.country_code||"BR",div),userMatches));
    }
    career.current_round=round+1;
    remaining--;
  }
}
async function finalizeFastNational(career,ownerId,clubMap,userMatches){
  if(career.phase!=="NATIONAL")return;
  simulateFastNationalRounds(career,ownerId,clubMap,userMatches,100);
  if(career.current_round>38){
    if((career.country_code||"BR")==="BR"){
      if(!career.data.libertadores)await makeLibertadores(career);
      const top4=sortEntries(career.data.divisions.A.entries).slice(0,4);
      const qualified=career.user_division==="A"&&top4.some(e=>String(e.clubId)===String(ownerId));
      career.phase=qualified?"LIBERTADORES":"END";
      if(!qualified)await finishFastLibertadores(career,ownerId,clubMap,userMatches,false);
    }else{
      career.phase="END";
    }
  }
}
function advanceFastLibGroup(lib,ownerId,clubMap,userMatches,includeUser=true){
  while(lib.stage==="GROUP"&&lib.matchday<=6){
    const games=lib.fixtures.filter(f=>f.stage==="GROUP"&&Number(f.matchday)===Number(lib.matchday)&&!f.played);
    games.forEach(f=>{
      const list=includeUser?userMatches:[];
      playFastFixture(f,lib.entries,clubMap,ownerId,"Libertadores",list);
    });
    if(lib.matchday>=6){
      createR16(lib);
      break;
    }
    lib.matchday++;
  }
}
function advanceFastLibKnockout(lib,ownerId,clubMap,userMatches,includeUser=true){
  while(lib.status!=="finished"&&lib.stage!=="GROUP"){
    const stage=lib.stage;
    const leg=stage==="FINAL"?1:Number(lib.leg||1);
    const games=lib.fixtures.filter(f=>f.stage===stage&&Number(f.leg)===leg&&!f.played);
    games.forEach(f=>{
      const list=includeUser?userMatches:[];
      playFastFixture(f,null,clubMap,ownerId,"Libertadores",list);
    });
    if(stage==="FINAL"){
      const f=games[0]||lib.fixtures.find(x=>x.stage==="FINAL");
      if(!f){lib.status="finished";break}
      let champ=f.hg>f.ag?f.home:f.ag>f.hg?f.away:(Math.random()<.5?f.home:f.away);
      if(f.hg===f.ag)f.pw=champ;
      lib.champion=champ;lib.status="finished";
      break;
    }
    if(leg===1){
      lib.leg=2;
    }else{
      const winners=koWinners(lib,stage);
      const next=stage==="R16"?"QF":stage==="QF"?"SF":"FINAL";
      addKoStage(lib,next,winners);
      lib.stage=next;lib.leg=1;
    }
  }
}
async function finishFastLibertadores(career,ownerId,clubMap,userMatches,includeUser=true){
  const lib=career.data.libertadores;
  if(!lib)return;
  if(lib.stage==="GROUP")advanceFastLibGroup(lib,ownerId,clubMap,userMatches,includeUser);
  if(lib.status!=="finished")advanceFastLibKnockout(lib,ownerId,clubMap,userMatches,includeUser);
  career.data.libertadores=lib;
  if(includeUser||career.phase==="LIBERTADORES")career.phase="END";
}

async function finishCopaFast(career,ownerId,clubMap){
  const copa=await ensureCopaData(career);
  while(copa.status!=="finished"){
    const stage=copa.stage;
    const games=copa.fixtures.filter(f=>f.stage===stage&&!f.played);
    for(const f of games){
      const {hg,ag}=fastScore(f.home,f.away,clubMap);f.played=true;f.hg=hg;f.ag=ag;
      if(hg===ag)f.pw=Math.random()<.5?f.home:f.away;
    }
    const winners=copaWinners(copa,stage);
    if(stage==="FINAL"){
      copa.champion=winners[0]||null;copa.status="finished";break;
    }
    const next=stage==="R32"?"R16":stage==="R16"?"QF":stage==="QF"?"SF":"FINAL";
    addCopaStage(copa,next,winners);
  }
  career.data.copaBrasil=copa;
  return copa;
}

async function playCopa(ownerId){
  const career=await getCareer(ownerId);
  if(!career)throw Object.assign(new Error("Carreira não encontrada."),{status:404});
  if((career.country_code||"BR")==="BR"&&career.data.state?.stage!=="FINISHED")throw Object.assign(new Error(`${domesticCupName(career.country_code||"BR")} começa depois do Estadual.`),{status:400});
  const copa=await ensureCopaData(career);
  if(copa.status==="finished")throw Object.assign(new Error(`${copa.name} desta temporada já terminou.`),{status:400});
  if(copa.userEliminated)throw Object.assign(new Error(`Seu clube já foi eliminado de ${copa.name}.`),{status:400});

  const stage=copa.stage;
  const games=copa.fixtures.filter(f=>f.stage===stage&&!f.played);
  const clubMap=await fastClubSnapshot();
  let userMatch=null,userWon=false;

  for(const f of games){
    const userGame=String(f.home)===String(ownerId)||String(f.away)===String(ownerId);
    if(userGame){
      await tx(async client=>{
        const sim=await fullMatch(client,f.home,f.away,ownerId);
        f.played=true;f.hg=sim.hg;f.ag=sim.ag;
        if(f.hg===f.ag)f.pw=Math.random()<.5?f.home:f.away;
        const winner=f.hg>f.ag?f.home:f.ag>f.hg?f.away:f.pw;
        userWon=String(winner)===String(ownerId);
        userMatch=sim.userMatch;userMatch.matchType=copa.name;userMatch.reward=0;
        userMatch.finance=await settleMatchFinances(client,ownerId,"CUP",String(f.home)===String(ownerId),userMatch.result);
        await recordUserMatch(client,ownerId,String(f.home)===String(ownerId)?f.away:f.home,userMatch,sim.events,"copa_nacional",userMatch.finance.performance);
      });
    }else{
      const {hg,ag}=fastScore(f.home,f.away,clubMap);f.played=true;f.hg=hg;f.ag=ag;if(hg===ag)f.pw=Math.random()<.5?f.home:f.away;
    }
  }

  const winners=copaWinners(copa,stage);
  if(stage==="FINAL"){
    copa.champion=winners[0]||null;copa.status="finished";
    if(String(copa.champion)===String(ownerId)){
      await tx(async client=>{
        await addFinance(client,ownerId,9000,"prize",`Premiação pelo título — ${copa.name}`);
        await recordTrophy(client,ownerId,career.season_no,"COPA_NACIONAL",`Campeão — ${copa.name}`);
      });
    }
  }else if(userWon){
    const next=stage==="R32"?"R16":stage==="R16"?"QF":stage==="QF"?"SF":"FINAL";
    addCopaStage(copa,next,winners);
  }else{
    copa.userEliminated=true;
    const next=stage==="R32"?"R16":stage==="R16"?"QF":stage==="QF"?"SF":"FINAL";
    addCopaStage(copa,next,winners);
    await finishCopaFast(career,ownerId,clubMap);
  }

  career.data.copaBrasil=copa;
  await advanceCalendar(career,ownerId,7,`${copa.name} — ${copaStageLabel(stage)}`);
  await saveCareer(career);
  return {userMatch,copaStage:stage,finished:copa.status==="finished",champion:copa.champion};
}

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
          const sim=await fullMatch(c,f.home,f.away,ownerId);hg=sim.hg;ag=sim.ag;events=sim.events;userMatch=sim.userMatch;userMatch.matchType="Estadual";userMatch.reward=0;
          userMatch.finance=await settleMatchFinances(c,ownerId,"STATE",String(f.home)===String(ownerId),userMatch.result);
          await recordUserMatch(c,ownerId,String(f.home)===String(ownerId)?f.away:f.home,userMatch,events,"state",userMatch.finance.performance);
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
          userMatch.finance=await settleMatchFinances(c,ownerId,"STATE",String(f.home)===String(ownerId),userMatch.result);
          await recordUserMatch(c,ownerId,String(f.home)===String(ownerId)?f.away:f.home,userMatch,sim.events,"state",userMatch.finance.performance);
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
      if(String(s.champion)===String(ownerId)){
        await tx(async c=>{
          await addFinance(c,ownerId,4000,"prize","Premiação pelo título estadual");
          await recordTrophy(c,ownerId,career.season_no,"ESTADUAL",`Campeão — ${s.name}`);
        });
      }
    }
  }

  career.data.state=s;
  const stateCalendarLabel=s.stage==="GROUP"?`Estadual — rodada ${Math.max(1,Number(s.round)-1)}`:`Estadual — ${s.stage}`;
  await advanceCalendar(career,ownerId,7,stateCalendarLabel);
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
          userMatch.finance=await settleMatchFinances(c,career.owner_club_id,"LIB",String(f.home)===String(career.owner_club_id),userMatch.result);
          await recordUserMatch(c,career.owner_club_id,String(f.home)===String(career.owner_club_id)?f.away:f.home,userMatch,sim.events,"libertadores",userMatch.finance.performance);
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
          userMatch.finance=await settleMatchFinances(c,career.owner_club_id,"LIB",String(f.home)===String(career.owner_club_id),userMatch.result);
          await recordUserMatch(c,career.owner_club_id,String(f.home)===String(career.owner_club_id)?f.away:f.home,userMatch,sim.events,"libertadores",userMatch.finance.performance);
        }else ({hg,ag}=basicScore(ratings.get(String(f.home))||72,ratings.get(String(f.away))||72));
        f.played=true;f.hg=hg;f.ag=ag;
      }
    });

    if(stage==="FINAL"){
      const f=games[0];
      let champ=f.hg>f.ag?f.home:f.ag>f.hg?f.away:(Math.random()<.5?f.home:f.away);
      if(f.hg===f.ag)f.pw=champ;
      lib.champion=champ;lib.status="finished";userAlive=false;
      if(String(champ)===String(career.owner_club_id)){
        await tx(async client=>{
          await addFinance(client,career.owner_club_id,15000,"prize","Premiação pelo título da Libertadores");
          await recordTrophy(client,career.owner_club_id,career.season_no,"LIBERTADORES","Campeão da Libertadores");
        });
      }
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
  if(!career||career.phase!=="NATIONAL"){
    throw Object.assign(new Error("A liga nacional não está ativa."),{status:400});
  }

  const round=Number(career.current_round);
  if(round<1||round>38){
    await repairCareer(ownerId);
    const repaired=await getCareer(ownerId);
    if(repaired?.phase!=="NATIONAL"){
      return {round:Math.min(round,38),userMatch:null,advanced:true};
    }
  }

  const clubMap=await fastClubSnapshot();
  let userMatch=null;

  // Calcula todos os jogos das quatro divisões em memória.
  for(const div of DIVS){
    const d=career.data.divisions[div];
    const games=d.fixtures.filter(f=>Number(f.round)===round&&!f.played);

    for(const f of games){
      const isUserGame=String(f.home)===String(ownerId)||String(f.away)===String(ownerId);

      if(isUserGame){
        // Apenas a partida do usuário usa o motor detalhado com escalação,
        // físico, moral, eventos, estatísticas e finanças.
        await tx(async c=>{
          const sim=await fullMatch(c,f.home,f.away,ownerId);
          f.played=true;f.hg=sim.hg;f.ag=sim.ag;
          applyResult(findEntry(d.entries,f.home),sim.hg,sim.ag);
          applyResult(findEntry(d.entries,f.away),sim.ag,sim.hg);

          userMatch=sim.userMatch;
          userMatch.matchType=leagueName(career.country_code||"BR",div);
          userMatch.reward=0;
          userMatch.finance=await settleMatchFinances(
            c,
            ownerId,
            div,
            String(f.home)===String(ownerId),
            userMatch.result
          );

          await recordUserMatch(
            c,
            ownerId,
            String(f.home)===String(ownerId)?f.away:f.home,
            userMatch,
            sim.events,
            `serie_${div.toLowerCase()}`,
            userMatch.finance.performance
          );
        });
      }else{
        // Jogos da IA: cálculo instantâneo sem operações individuais no banco.
        const {hg,ag}=fastScore(f.home,f.away,clubMap);
        f.played=true;f.hg=hg;f.ag=ag;
        applyResult(findEntry(d.entries,f.home),hg,ag);
        applyResult(findEntry(d.entries,f.away),ag,hg);
      }
    }
  }

  // Avança exatamente UMA rodada.
  if(round>=38){
    career.current_round=39;
    await tx(async client=>{await maybeRecordDivisionTrophy(client,career,ownerId)});
    if(career.data.copaBrasil?.status!=="finished")await finishCopaFast(career,ownerId,clubMap);
    if(String(career.data.copaBrasil?.champion)===String(ownerId)){
      await tx(async client=>{
        const cupName=career.data.copaBrasil?.name||domesticCupName(career.country_code||"BR");
        const fresh=await recordTrophy(client,ownerId,career.season_no,"COPA_NACIONAL",`Campeão — ${cupName}`);
        if(fresh)await addFinance(client,ownerId,9000,"prize",`Premiação pelo título — ${cupName}`);
      });
    }

    if((career.country_code||"BR")==="BR"){
      await makeLibertadores(career);
      const tableA=sortEntries(career.data.divisions.A.entries);
      const userTop4A=career.user_division==="A"&&tableA.slice(0,4).some(e=>String(e.clubId)===String(ownerId));
      if(userTop4A)career.phase="LIBERTADORES";
      else{
        await finishFastLibertadores(career,ownerId,clubMap,[],false);
        career.phase="END";
      }
    }else{
      career.phase="END";
    }
  }else{
    career.current_round=round+1;
  }

  await advanceCalendar(career,ownerId,7,`${leagueName(career.country_code||"BR",career.user_division)} — rodada ${round}`);
  await saveCareer(career);

  return {
    round,
    userMatch,
    nextRound:career.current_round,
    phase:career.phase
  };
}
async function playLib(ownerId){
  const career=await getCareer(ownerId);
  if(!career||career.phase!=="LIBERTADORES") throw Object.assign(new Error("Você não está na Libertadores agora."),{status:400});
  const r=await simulateLibStep(career,true);
  if(r.finished) career.phase="END";
  else if(!r.userAlive){ await autoFinishLib(career);career.phase="END"; }
  await advanceCalendar(career,ownerId,7,"Libertadores");
  await saveCareer(career);
  return r;
}

async function nextSeason(ownerId){
  const career=await getCareer(ownerId);
  if(!career||career.phase!=="END") throw Object.assign(new Error("A temporada ainda não terminou."),{status:400});
  const club=(await q(`SELECT * FROM clubs WHERE id=$1`,[ownerId])).rows[0];

  await tx(async c=>{
    const borrowed=(await c.query(`SELECT l.player_id,l.parent_club_id,p.name FROM player_loans l JOIN players p ON p.id=l.player_id WHERE l.borrowing_club_id=$1 AND l.status='active' FOR UPDATE OF l`,[ownerId])).rows;
    for(const l of borrowed){
      await c.query(`UPDATE player_loans SET status='ended' WHERE player_id=$1 AND borrowing_club_id=$2 AND status='active'`,[l.player_id,ownerId]);
      await c.query(`UPDATE players SET club_id=NULL,is_starter=FALSE,transfer_listed=FALSE,fitness=100,morale=72 WHERE id=$1`,[l.player_id]);
      await c.query(`INSERT INTO club_events(club_id,event_type,title,description) VALUES($1,'loan','Fim de empréstimo',$2)`,[ownerId,`${l.name} deixou esta carreira ao fim da temporada.`]);
    }

    const ps=(await c.query(`SELECT id,name,age,contract_seasons FROM players WHERE club_id=$1`,[ownerId])).rows;
    for(const p of ps){
      let delta=0;if(p.age<=24&&Math.random()<.35)delta=1;if(p.age>=31&&Math.random()<.25)delta=-1;
      const remaining=Math.max(0,Number(p.contract_seasons||1)-1);
      if(remaining===0){
        await c.query(`UPDATE players SET age=age+1,contract_seasons=1,salary=ROUND(salary*1.06)::int,fitness=100,morale=LEAST(100,morale+2),rating=GREATEST(45,LEAST(95,rating+$2)),pace=GREATEST(25,LEAST(95,pace+$2)),shooting=GREATEST(20,LEAST(95,shooting+$2)),passing=GREATEST(20,LEAST(95,passing+$2)),defending=GREATEST(20,LEAST(95,defending+$2)) WHERE id=$1`,[p.id,delta]);
        await c.query(`INSERT INTO club_events(club_id,event_type,title,description) VALUES($1,'contract','Renovação automática',$2)`,[ownerId,`${p.name} renovou por mais 1 temporada com reajuste salarial.`]);
      }else{
        await c.query(`UPDATE players SET age=age+1,contract_seasons=$3,fitness=100,rating=GREATEST(45,LEAST(95,rating+$2)),pace=GREATEST(25,LEAST(95,pace+$2)),shooting=GREATEST(20,LEAST(95,shooting+$2)),passing=GREATEST(20,LEAST(95,passing+$2)),defending=GREATEST(20,LEAST(95,defending+$2)) WHERE id=$1`,[p.id,delta,remaining]);
      }
    }
  });

  return createCareer(ownerId,club.state_code||"",career.season_no+1,career.data,club.country_code||career.country_code||"BR");
}

async function withCompetitionLock(ownerId,fn){
  const key=String(ownerId);
  if(competitionLocks.has(key))throw Object.assign(new Error("Já existe uma simulação em andamento. Aguarde alguns segundos."),{status:409});
  competitionLocks.add(key);
  try{return await fn()}finally{competitionLocks.delete(key)}
}

async function repairCareer(ownerId){
  let career=await getCareer(ownerId);
  if(!career||!career.data)return career;
  let changed=false;
  if(!career.data.calendar){career.data.calendar=initialCalendar(career.season_no);changed=true}
  if(!career.data.copaBrasil){career.data.copaBrasil=await createCopaBrasil(ownerId);changed=true}
  const s=career.data.state;

  if(career.phase==="STATE"&&s){
    if(s.stage==="GROUP"){
      const current=s.fixtures.filter(f=>f.stage==="GROUP"&&Number(f.round)===Number(s.round));
      if(current.length&&current.every(f=>f.played)){
        if(Number(s.round)>=7){
          if(!s.fixtures.some(f=>f.stage==="SF")){
            const t=sortEntries(s.entries);
            [[t[0].clubId,t[3].clubId],[t[1].clubId,t[2].clubId]].forEach(([home,away],i)=>s.fixtures.push({stage:"SF",round:8,slot:i+1,home,away,played:false,hg:null,ag:null,pw:null}));
          }
          s.stage="SF";s.round=8;
        }else s.round=Number(s.round)+1;
        changed=true;
      }
    }
    if(s.stage==="SF"){
      const semis=s.fixtures.filter(f=>f.stage==="SF");
      if(semis.length===2&&semis.every(f=>f.played)){
        if(!s.fixtures.some(f=>f.stage==="FINAL")){
          const winners=semis.map(f=>f.hg>f.ag?f.home:f.ag>f.hg?f.away:(f.pw||f.home));
          s.fixtures.push({stage:"FINAL",round:9,slot:1,home:winners[0],away:winners[1],played:false,hg:null,ag:null,pw:null});
        }
        s.stage="FINAL";s.round=9;changed=true;
      }
    }
    if(s.stage==="FINAL"){
      const final=s.fixtures.find(f=>f.stage==="FINAL");
      if(final?.played){
        s.champion=final.hg>final.ag?final.home:final.ag>final.hg?final.away:(final.pw||final.home);
        if(String(s.champion)===String(ownerId))await tx(async client=>{await recordTrophy(client,ownerId,career.season_no,"ESTADUAL",`Campeão — ${s.name}`)});
        s.stage="FINISHED";career.phase="NATIONAL";changed=true;
      }
    }
    if(s.stage==="FINISHED"&&career.phase==="STATE"){career.phase="NATIONAL";changed=true}
    career.data.state=s;
  }

  if(career.phase==="NATIONAL"){
    while(Number(career.current_round)<=38){
      const all=[];
      for(const d of DIVS)all.push(...career.data.divisions[d].fixtures.filter(f=>Number(f.round)===Number(career.current_round)));
      if(all.length===40&&all.every(f=>f.played)){career.current_round=Number(career.current_round)+1;changed=true}
      else break;
    }
    if(Number(career.current_round)>38){
      await tx(async client=>{await maybeRecordDivisionTrophy(client,career,ownerId)});
      if(career.data.copaBrasil?.status!=="finished"){
        await finishCopaFast(career,ownerId,await fastClubSnapshot());
        if(String(career.data.copaBrasil?.champion)===String(ownerId))await tx(async client=>{
          const cupName=career.data.copaBrasil?.name||domesticCupName(career.country_code||"BR");
          const fresh=await recordTrophy(client,ownerId,career.season_no,"COPA_NACIONAL",`Campeão — ${cupName}`);
          if(fresh)await addFinance(client,ownerId,9000,"prize",`Premiação pelo título — ${cupName}`);
        });
      }
      if((career.country_code||"BR")==="BR"){
        if(!career.data.libertadores){await makeLibertadores(career);changed=true}
        const top4=sortEntries(career.data.divisions.A.entries).slice(0,4);
        const qualified=career.user_division==="A"&&top4.some(e=>String(e.clubId)===String(ownerId));
        if(qualified)career.phase="LIBERTADORES";
        else{
          if(career.data.libertadores?.status!=="finished")await autoFinishLib(career);
          career.phase="END";
        }
      }else{
        career.phase="END";
      }
      changed=true;
    }
  }

  if(career.phase==="END"&&career.data.copaBrasil?.status!=="finished"){
    await finishCopaFast(career,ownerId,await fastClubSnapshot());
    changed=true;
  }

  if(career.phase==="LIBERTADORES"){
    const lib=career.data.libertadores;
    if(lib?.status==="finished"){
      if(String(lib.champion)===String(ownerId))await tx(async client=>{await recordTrophy(client,ownerId,career.season_no,"LIBERTADORES","Campeão da Libertadores")});
      career.phase="END";changed=true
    }
    else if(lib&&lib.stage!=="GROUP"){
      const active=lib.fixtures.some(f=>f.stage===lib.stage&&!f.played&&(String(f.home)===String(ownerId)||String(f.away)===String(ownerId)));
      if(!active){
        await autoFinishLib(career);
        career.phase="END";changed=true;
      }
    }
  }

  if(changed)await saveCareer(career);
  return career;
}

async function hydrateCareer(career){
  if(!career) return null;
  const ids=new Set();
  for(const d of DIVS){
    career.data.divisions[d].entries.forEach(e=>ids.add(e.clubId));
    career.data.divisions[d].fixtures.forEach(f=>{ids.add(f.home);ids.add(f.away)});
  }
  if(career.data.state){
    career.data.state.entries.forEach(e=>ids.add(e.clubId));
    career.data.state.fixtures.forEach(f=>{ids.add(f.home);ids.add(f.away)});
  }
  if(career.data.libertadores){
    career.data.libertadores.entries.forEach(e=>ids.add(e.clubId));
    career.data.libertadores.fixtures.forEach(f=>{ids.add(f.home);ids.add(f.away)});
  }
  if(career.data.copaBrasil){
    career.data.copaBrasil.fixtures.forEach(f=>{ids.add(f.home);ids.add(f.away)});
    if(career.data.copaBrasil.champion)ids.add(career.data.copaBrasil.champion);
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

  const stateObj=career.data.state?{
    ...career.data.state,
    entries:sortEntries(career.data.state.entries).map(hEntry),
    fixtures:career.data.state.fixtures.map(hFix),
    championClub:career.data.state.champion?map.get(String(career.data.state.champion)):null
  }:null;

  let lib=null;
  if(career.data.libertadores){
    lib={
      ...career.data.libertadores,
      entries:career.data.libertadores.entries.map(hEntry),
      fixtures:career.data.libertadores.fixtures.map(hFix),
      championClub:career.data.libertadores.champion?map.get(String(career.data.libertadores.champion)):null
    };
  }
  let copa=null;
  if(career.data.copaBrasil){
    copa={
      ...career.data.copaBrasil,
      fixtures:career.data.copaBrasil.fixtures.map(hFix),
      championClub:career.data.copaBrasil.champion?map.get(String(career.data.copaBrasil.champion)):null
    };
  }
  return {
    career:{owner_club_id:career.owner_club_id,season_no:career.season_no,phase:career.phase,state_code:career.state_code,country_code:career.country_code||"BR",user_division:career.user_division,current_round:career.current_round},
    divisions,state:stateObj,libertadores:lib,copaBrasil:copa,calendar:calendarSummary(career,0)
  };
}


function divisionOfClub(career,clubId){
  if(!career?.data?.divisions)return null;
  for(const d of DIVS){
    if(career.data.divisions[d].entries.some(e=>String(e.clubId)===String(clubId)))return d;
  }
  return null;
}
function divisionRank(div){return {D:1,C:2,B:3,A:4}[div]||1}
function marketProfile(div){
  return ({
    D:{min:54,max:69,preferredMin:58},
    C:{min:57,max:73,preferredMin:61},
    B:{min:60,max:78,preferredMin:64},
    A:{min:63,max:86,preferredMin:67}
  })[div]||{min:54,max:69,preferredMin:58};
}
function fairMarketValue(player){
  const rating=Number(player.rating||60);
  const age=Number(player.age||25);
  const base=Math.max(500,Number(player.price||0));
  const ageFactor=age<=21?1.12:age<=25?1.06:age<=29?1:age<=32?.91:.80;
  const qualityFactor=rating>=80?1.08:rating>=74?1.04:rating<=60?.92:1;
  return Math.max(500,Math.round(base*ageFactor*qualityFactor/100)*100);
}
function askingPrice(player){
  if(!player.club_id)return 0;
  const contract=Math.max(1,Number(player.contract_seasons||1));
  const fair=fairMarketValue(player);
  const premium=1.03+Math.min(4,contract)*.025;
  return Math.max(500,Math.round(fair*premium/100)*100);
}
function suggestedSalary(player){
  return Math.max(Number(player.salary||0),salaryForRating(Number(player.rating||60)));
}
function interestChance(player,userClub,userDiv,sourceDiv,salaryOffer,years){
  const suggested=suggestedSalary(player);
  const salaryBoost=((Number(salaryOffer)/Math.max(1,suggested))-1)*58;
  const ratingGap=Math.max(0,Number(player.rating)-Number(userClub.team_rating||64))*2.25;
  const divisionBoost=(divisionRank(userDiv)-divisionRank(sourceDiv||userDiv))*7;
  const freeBonus=player.club_id?0:12;
  const contractBoost=Math.max(0,Math.min(4,Number(years))-2)*3;
  const elitePenalty=userDiv==="D"&&Number(player.rating)>=74?14:0;
  return clamp(Math.round(58+salaryBoost+divisionBoost+freeBonus+contractBoost-ratingGap-elitePenalty),5,95);
}
function marketSourceVisible(userDiv,sourceDiv){
  if(!sourceDiv)return true;
  return divisionRank(sourceDiv)<=divisionRank(userDiv)+1;
}
async function ensureTransferPool(ownerId){
  await ensureMarket();
  const career=await getCareer(ownerId);
  if(!career)return;
  const div=career.user_division||"D";
  const ranks={D:["D","C"],C:["D","C","B"],B:["C","B","A"],A:["B","A"]};
  const wanted=new Set(ranks[div]||["D"]);
  const ids=[];
  for(const d of DIVS){
    if(!wanted.has(d))continue;
    for(const e of career.data?.divisions?.[d]?.entries||[]){
      if(String(e.clubId)!==String(ownerId))ids.push(Number(e.clubId));
    }
  }
  for(const id of shuffle(ids).slice(0,18))await ensureRoster(id);
}
function sponsorOffersForDivision(div){
  const table={
    D:[
      {id:"regional_d",name:"Rede Regional",monthly:2600,signing:4500,months:12},
      {id:"sports_d",name:"Arena Sports",monthly:3200,signing:3000,months:12},
      {id:"digital_d",name:"PlayNet",monthly:2200,signing:6500,months:12}
    ],
    C:[
      {id:"regional_c",name:"Banco Popular",monthly:3900,signing:7000,months:12},
      {id:"sports_c",name:"Arena Sports+",monthly:4600,signing:5200,months:12},
      {id:"digital_c",name:"PlayNet Pro",monthly:3500,signing:8500,months:12}
    ],
    B:[
      {id:"national_b",name:"Brasil Energia",monthly:6200,signing:12000,months:12},
      {id:"sports_b",name:"Arena Sports Nacional",monthly:7000,signing:9000,months:12},
      {id:"bank_b",name:"Banco União",monthly:5600,signing:14500,months:12}
    ],
    A:[
      {id:"elite_a",name:"Prime Brasil",monthly:10500,signing:22000,months:12},
      {id:"sports_a",name:"Arena Sports Elite",monthly:11800,signing:17000,months:12},
      {id:"tech_a",name:"Nexa Tecnologia",monthly:9400,signing:26000,months:12}
    ]
  };
  return table[div]||table.D;
}
async function sponsorshipSummary(clubId,career){
  const active=(await q(`SELECT * FROM sponsorship_contracts WHERE club_id=$1 AND status='active' ORDER BY id DESC LIMIT 1`,[clubId])).rows[0]||null;
  return {active,offers:active?[]:sponsorOffersForDivision(career?.user_division||"D")};
}
async function paySponsorMonth(client,clubId,month){
  const c=(await client.query(`SELECT * FROM sponsorship_contracts WHERE club_id=$1 AND status='active' ORDER BY id DESC LIMIT 1 FOR UPDATE`,[clubId])).rows[0];
  if(!c)return null;
  const amount=Number(c.monthly_amount||0);
  if(amount>0)await addFinance(client,clubId,amount,"sponsor_monthly",`Patrocínio mensal — ${c.sponsor_name} — ${month}`);
  const paid=Number(c.months_paid||0)+1;
  const finished=paid>=Number(c.months_total||12);
  await client.query(`UPDATE sponsorship_contracts SET months_paid=$2,status=$3 WHERE id=$1`,[c.id,paid,finished?"completed":"active"]);
  if(finished)await client.query(`INSERT INTO club_events(club_id,event_type,title,description) VALUES($1,'sponsor','Contrato de patrocínio encerrado',$2)`,[clubId,`O contrato com ${c.sponsor_name} terminou. Novas propostas já podem ser avaliadas.`]);
  return {name:c.sponsor_name,amount,finished};
}
function addOneMonth(dateStr){
  const d=new Date(`${dateStr}T12:00:00Z`);
  return isoDate(new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,1,12)));
}
async function payTransferInstallments(client,clubId,month){
  const dueDate=`${month}-01`;
  const rows=(await client.query(`SELECT * FROM transfer_installments WHERE buying_club_id=$1 AND status='active' AND next_due_date<=$2::date ORDER BY next_due_date,id FOR UPDATE`,[clubId,dueDate])).rows;
  let total=0;
  for(const r of rows){
    const payment=Math.min(Number(r.installment_amount),Number(r.amount_remaining));
    if(payment<=0){
      await client.query(`UPDATE transfer_installments SET status='paid',amount_remaining=0,next_due_date=NULL WHERE id=$1`,[r.id]);
      continue;
    }
    await addFinance(client,clubId,-payment,"transfer_installment",`Parcela de ${r.player_name} — ${Number(r.installments_paid)+1}/${r.installments_total}`);
    if(r.selling_club_id)await client.query(`UPDATE clubs SET coins=coins+$2 WHERE id=$1`,[r.selling_club_id,payment]);
    const remaining=Math.max(0,Number(r.amount_remaining)-payment);
    const paid=Number(r.installments_paid)+1;
    const finished=remaining<=0||paid>=Number(r.installments_total);
    await client.query(`UPDATE transfer_installments SET amount_remaining=$2,installments_paid=$3,status=$4,next_due_date=$5 WHERE id=$1`,
      [r.id,remaining,paid,finished?"paid":"active",finished?null:addOneMonth(isoDate(new Date(r.next_due_date)))]);
    total+=payment;
  }
  return total;
}

async function loanEligibility(client,player){
  if(!player?.club_id)return {eligible:false,reason:"Jogador livre não precisa de empréstimo."};
  const club=(await client.query(`SELECT id,name,is_ai,base_rating FROM clubs WHERE id=$1`,[player.club_id])).rows[0];
  if(!club?.is_ai)return {eligible:false,reason:"Empréstimos diretos entre usuários não estão disponíveis."};
  const active=(await client.query(`SELECT 1 FROM player_loans WHERE player_id=$1 AND status='active'`,[player.id])).rowCount>0;
  if(active)return {eligible:false,reason:"Jogador já está emprestado."};
  const top=(await client.query(`SELECT id,rating,is_starter FROM players WHERE club_id=$1 ORDER BY rating DESC LIMIT 5`,[player.club_id])).rows;
  const important=top.some(x=>String(x.id)===String(player.id)) || (player.is_starter&&Number(player.rating)>=Number(club.base_rating||64)+2);
  if(important)return {eligible:false,reason:"Jogador importante para o clube e indisponível para empréstimo."};
  return {eligible:true,reason:"Disponível para empréstimo."};
}
async function processLoanMonth(client,clubId,month){
  const loans=(await client.query(`
    SELECT l.*,p.name player_name,p.salary
    FROM player_loans l JOIN players p ON p.id=l.player_id
    WHERE l.borrowing_club_id=$1 AND l.status='active'
    ORDER BY l.id FOR UPDATE OF l
  `,[clubId])).rows;
  let total=0;
  for(const l of loans){
    const fee=Number(l.monthly_fee||0);
    if(fee>0){
      await addFinance(client,clubId,-fee,"loan_fee",`Empréstimo de ${l.player_name} — ${month}`);
      await client.query(`UPDATE clubs SET coins=coins+$2 WHERE id=$1`,[l.parent_club_id,fee]);
      total+=fee;
    }
    const elapsed=Number(l.months_elapsed||0)+1;
    if(elapsed>=Number(l.months_total||0)){
      await client.query(`UPDATE player_loans SET months_elapsed=$2,status='ended' WHERE id=$1`,[l.id,elapsed]);
      await client.query(`UPDATE players SET club_id=NULL,is_starter=FALSE,transfer_listed=FALSE,fitness=100,morale=72 WHERE id=$1`,[l.player_id]);
      await client.query(`INSERT INTO club_events(club_id,event_type,title,description) VALUES($1,'loan','Fim de empréstimo',$2)`,[clubId,`${l.player_name} deixou esta carreira ao fim do empréstimo.`]);
    }else{
      await client.query(`UPDATE player_loans SET months_elapsed=$2 WHERE id=$1`,[l.id,elapsed]);
    }
  }
  return total;
}
async function financeSummary(clubId){
  const [wages,recent,club,installments,loans]=await Promise.all([
    q(`SELECT COALESCE(SUM(salary),0)::int total FROM players WHERE club_id=$1`,[clubId]),
    q(`SELECT amount,category,description,created_at FROM club_finance_events WHERE club_id=$1 ORDER BY created_at DESC,id DESC LIMIT 16`,[clubId]),
    q(`SELECT coins FROM clubs WHERE id=$1`,[clubId]),
    q(`SELECT id,player_name,total_fee,amount_remaining,installment_amount,installments_total,installments_paid,next_due_date,status FROM transfer_installments WHERE buying_club_id=$1 AND status='active' ORDER BY next_due_date,id`,[clubId]),
    q(`SELECT l.id,l.months_total,l.months_elapsed,l.monthly_fee,p.id player_id,p.name player_name,p.rating,pc.name parent_club_name
       FROM player_loans l JOIN players p ON p.id=l.player_id JOIN clubs pc ON pc.id=l.parent_club_id
       WHERE l.borrowing_club_id=$1 AND l.status='active' ORDER BY l.id`,[clubId])
  ]);
  return {
    wages:Number(wages.rows[0].total||0),
    recent:recent.rows,
    transferBan:transferBanInfo(club.rows[0]?.coins||0),
    installments:installments.rows,
    loans:loans.rows
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
  try{
    const active=await activeCareerSummary(req.user.id);
    const careers=await listUserCareers(req.user.id);
    res.json({
      user:req.user,
      activeType:active.type,
      club:active.club,
      playerCareer:active.playerCareer,
      careers,
      states:STATE_DATA.names,
      countries:COUNTRY_DATA,
      maxCareers:MAX_CAREERS_PER_USER
    });
  }catch(e){next(e)}
});

app.get("/api/careers",auth,async(req,res,next)=>{
  try{
    const active=await activeCareerSummary(req.user.id);
    res.json({careers:await listUserCareers(req.user.id),maxCareers:MAX_CAREERS_PER_USER,activeType:active.type});
  }catch(e){next(e)}
});

app.post("/api/careers/:careerType/:careerId/activate",auth,async(req,res,next)=>{
  try{
    const type=String(req.params.careerType||"");
    let active;
    if(type==="player")active={type:"player",playerCareer:await activatePlayerCareer(req.user.id,String(req.params.careerId)),club:null};
    else active={type:"club",club:await activateUserCareer(req.user.id,String(req.params.careerId)),playerCareer:null};
    res.json({ok:true,...active,careers:await listUserCareers(req.user.id)});
  }catch(e){next(e)}
});

app.get("/api/player-career/clubs",auth,async(req,res,next)=>{
  try{
    const country=String(req.query.country||"BR").toUpperCase();
    if(!VALID_COUNTRIES.has(country))return res.status(400).json({error:"País inválido."});
    const clubs=await playerCareerClubChoices(country,"D");
    res.json({country,clubs});
  }catch(e){next(e)}
});

app.post("/api/player-careers",auth,async(req,res,next)=>{
  try{
    const playerName=String(req.body.playerName||"").trim().replace(/\s+/g," ");
    const careerLabel=String(req.body.careerLabel||"").trim().replace(/\s+/g," ");
    const nationality=String(req.body.nationalityCode||"BR").toUpperCase();
    const country=String(req.body.countryCode||"BR").toUpperCase();
    const position=String(req.body.position||"ATT").toUpperCase();
    const clubId=String(req.body.clubId||"");

    if(playerName.length<3||playerName.length>32)return res.status(400).json({error:"Nome do jogador deve ter 3 a 32 caracteres."});
    if(careerLabel.length>40)return res.status(400).json({error:"Nome da carreira deve ter no máximo 40 caracteres."});
    if(!VALID_COUNTRIES.has(country))return res.status(400).json({error:"Escolha um país de liga válido."});
    if(!VALID_COUNTRIES.has(nationality))return res.status(400).json({error:"Escolha uma nacionalidade válida."});
    if(!["GK","DEF","MID","ATT"].includes(position))return res.status(400).json({error:"Posição inválida."});

    const created=await tx(async client=>{
      const count=await totalCareerCount(req.user.id,client);
      if(count>=MAX_CAREERS_PER_USER)throw Object.assign(new Error(`Você já possui o limite de ${MAX_CAREERS_PER_USER} carreiras.`),{status:409});
      const slot=await nextCareerSlot(req.user.id,client);
      if(!slot)throw Object.assign(new Error("Não há vaga de carreira disponível."),{status:409});

      const club=(await client.query(`
        SELECT * FROM clubs
        WHERE id=$1 AND is_ai=TRUE AND club_kind='national' AND country_code=$2 AND national_seed_division='D'
      `,[clubId,country])).rows[0];
      if(!club)throw Object.assign(new Error("Escolha um clube inicial válido da quarta divisão."),{status:400});

      const attrs=playerCareerBaseAttributes(position);
      const label=careerLabel||`Jogador ${slot}`;
      const data=await createPlayerSeasonData(country,"D",club.id,1);

      await client.query(`UPDATE clubs SET is_active_career=FALSE WHERE user_id=$1`,[req.user.id]);
      await client.query(`UPDATE player_careers SET is_active_career=FALSE WHERE user_id=$1`,[req.user.id]);

      const row=(await client.query(`
        INSERT INTO player_careers(
          user_id,career_slot,career_label,is_active_career,player_name,nationality_code,country_code,
          position,role,age,club_id,club_division,season_no,current_round,status,
          overall,pace,shooting,passing,defending,fitness,morale,skill_points,reputation,salary,balance,data
        )
        VALUES($1,$2,$3,TRUE,$4,$5,$6,$7,$8,17,$9,'D',1,1,'ACTIVE',$10,$11,$12,$13,$14,100,75,0,10,$15,0,$16::jsonb)
        RETURNING *
      `,[
        req.user.id,slot,label,playerName,nationality,country,position,attrs.role,club.id,
        attrs.overall,attrs.pace,attrs.shooting,attrs.passing,attrs.defending,
        Math.max(500,Math.round((attrs.overall*14+club.base_rating*5)/50)*50),
        JSON.stringify(data)
      ])).rows[0];

      return row;
    });

    res.status(201).json({ok:true,activeType:"player",playerCareer:created,careers:await listUserCareers(req.user.id)});
  }catch(e){next(e)}
});

app.get("/api/player-career",auth,async(req,res,next)=>{
  try{
    const pc=await activePlayerCareer(req.user.id);
    if(!pc)return res.status(404).json({error:"Nenhuma carreira de jogador está ativa."});
    res.json(await hydratePlayerCareer(pc));
  }catch(e){next(e)}
});

app.post("/api/player-career/play",auth,async(req,res,next)=>{
  try{
    res.json(await withCompetitionLock(`player:${req.user.id}`,()=>simulatePlayerCareerRound(req.user.id)));
  }catch(e){next(e)}
});

app.post("/api/player-career/train",auth,async(req,res,next)=>{
  try{
    const attribute=String(req.body.attribute||"");
    const pc=await trainPlayerCareer(req.user.id,attribute);
    res.json({ok:true,career:await hydratePlayerCareer(pc)});
  }catch(e){next(e)}
});

app.post("/api/player-career/offers/:clubId/accept",auth,async(req,res,next)=>{
  try{
    res.json(await withCompetitionLock(`player:${req.user.id}`,()=>acceptPlayerCareerOffer(req.user.id,String(req.params.clubId))));
  }catch(e){next(e)}
});

app.post("/api/player-career/next-season",auth,async(req,res,next)=>{
  try{
    const pc=await withCompetitionLock(`player:${req.user.id}`,()=>nextPlayerCareerSeason(req.user.id));
    res.json({ok:true,career:await hydratePlayerCareer(pc)});
  }catch(e){next(e)}
});

app.post("/api/player-career/manual-save",auth,async(req,res,next)=>{
  try{
    const pc=await activePlayerCareer(req.user.id);
    if(!pc)return res.status(404).json({error:"Carreira de jogador não encontrada."});
    const row=(await q(`UPDATE player_careers SET manual_saved_at=NOW(),updated_at=NOW() WHERE id=$1 RETURNING manual_saved_at`,[pc.id])).rows[0];
    res.json({ok:true,savedAt:row.manual_saved_at});
  }catch(e){next(e)}
});

app.delete("/api/player-careers/:careerId",auth,async(req,res,next)=>{
  try{
    const careerId=String(req.params.careerId);
    const confirmName=String(req.body.confirmName||"").trim();
    const pc=(await q(`SELECT * FROM player_careers WHERE id=$1 AND user_id=$2`,[careerId,req.user.id])).rows[0];
    if(!pc)return res.status(404).json({error:"Carreira de jogador não encontrada."});
    if(confirmName!==pc.player_name)return res.status(400).json({error:"Digite exatamente o nome do jogador para confirmar."});
    await q(`DELETE FROM player_careers WHERE id=$1 AND user_id=$2`,[careerId,req.user.id]);

    const remaining=await listUserCareers(req.user.id);
    if(remaining.length&&!remaining.some(x=>x.is_active_career)){
      const first=remaining[0];
      if(first.career_type==="player")await activatePlayerCareer(req.user.id,first.id);
      else await activateUserCareer(req.user.id,first.id);
    }
    res.json({ok:true,careers:await listUserCareers(req.user.id)});
  }catch(e){next(e)}
});

app.post("/api/club",auth,async(req,res,next)=>{
  try{
    const name=String(req.body.name||"").trim().replace(/\s+/g," ");
    const countryCode=String(req.body.countryCode||"BR").toUpperCase();
    const state=String(req.body.stateCode||"").toUpperCase();
    const pc=String(req.body.primaryColor||"#18864b");
    const sc=String(req.body.secondaryColor||"#f7fafc");
    const requestedLabel=String(req.body.careerLabel||"").trim().replace(/\s+/g," ");

    if(name.length<3||name.length>30)return res.status(400).json({error:"Nome deve ter 3 a 30 caracteres."});
    if(!VALID_COUNTRIES.has(countryCode))return res.status(400).json({error:"Escolha um país válido."});
    if(countryCode==="BR"&&!VALID_STATES.has(state))return res.status(400).json({error:"Escolha um estado para a carreira no Brasil."});
    if(requestedLabel.length>40)return res.status(400).json({error:"Nome da carreira deve ter no máximo 40 caracteres."});

    const club=await tx(async c=>{
      const count=await totalCareerCount(req.user.id,c);
      if(count>=MAX_CAREERS_PER_USER)throw Object.assign(new Error(`Você já possui o limite de ${MAX_CAREERS_PER_USER} carreiras.`),{status:409});

      const slot=await nextCareerSlot(req.user.id,c);
      if(!slot)throw Object.assign(new Error("Não há vaga de carreira disponível."),{status:409});
      const label=requestedLabel||`Carreira ${slot}`;

      await c.query(`UPDATE player_careers SET is_active_career=FALSE WHERE user_id=$1`,[req.user.id]);
      await c.query(`UPDATE clubs SET is_active_career=FALSE WHERE user_id=$1`,[req.user.id]);

      const x=(await c.query(`
        INSERT INTO clubs(
          user_id,name,state_code,country_code,club_kind,base_rating,team_rating,coins,
          primary_color,secondary_color,career_slot,career_label,is_active_career
        )
        VALUES($1,$2,$3,$4,'user',64,64,30000,$5,$6,$7,$8,TRUE)
        RETURNING *
      `,[req.user.id,name,countryCode==="BR"?state:null,countryCode,pc,sc,slot,label])).rows[0];

      await ensureFriendCode(c,x.id);
      await createRoster(c,x,true);
      await applyFelipeMode(c,x.id);
      return (await c.query(`SELECT * FROM clubs WHERE id=$1`,[x.id])).rows[0];
    });

    await createCareer(club.id,countryCode==="BR"?state:"",1,null,countryCode);
    res.status(201).json({club,activeType:"club",careers:await listUserCareers(req.user.id)});
  }catch(e){
    if(e.code==="23505")return res.status(409).json({error:"Nome de clube já utilizado. Escolha outro nome."});
    next(e);
  }
});
app.put("/api/club/state",auth,async(req,res,next)=>{
  try{
    const club=await userClub(req.user.id),state=String(req.body.stateCode||"").toUpperCase();
    if(!club)return res.status(404).json({error:"Clube não encontrado."});
    if((club.country_code||"BR")!=="BR")return res.status(400).json({error:"Seleção de estado existe apenas para carreiras no Brasil."});
    if(club.state_code)return res.status(409).json({error:"O estado já foi definido."});
    if(!VALID_STATES.has(state))return res.status(400).json({error:"Escolha um estado."});
    await tx(async c=>{
      await c.query(`UPDATE clubs SET state_code=$2,coins=30000,base_rating=64,team_rating=64 WHERE id=$1`,[club.id,state]);
      const fresh=(await c.query(`SELECT * FROM clubs WHERE id=$1`,[club.id])).rows[0];
      await createRoster(c,fresh,true);
      await applyFelipeMode(c,club.id);
    });
    await createCareer(club.id,state,1,null);res.json({ok:true});
  }catch(e){next(e)}
});

app.delete("/api/club",auth,async(req,res,next)=>{
  try{
    const club=await userClub(req.user.id);
    if(!club)return res.status(404).json({error:"Clube não encontrado."});

    const confirmName=String(req.body.confirmName||"").trim();
    if(confirmName!==club.name){
      return res.status(400).json({error:"Digite exatamente o nome atual do clube para confirmar."});
    }

    await withCompetitionLock(club.id,async()=>{
      await tx(async client=>{
        // Cada carreira possui suas próprias instâncias de jogadores.
        // Ao apagar o save, o elenco desse save é removido sem afetar outras carreiras.
        await client.query(`DELETE FROM players WHERE club_id=$1`,[club.id]);

        // As demais estruturas vinculadas ao clube usam ON DELETE CASCADE.
        await client.query(`DELETE FROM clubs WHERE id=$1 AND user_id=$2`,[club.id,req.user.id]);
      });
    });

    const remaining=await listUserCareers(req.user.id);
    const active=remaining.length?await activateFirstAvailableCareer(req.user.id):{type:null,club:null,playerCareer:null};
    res.json({
      ok:true,
      message:remaining.length?"Carreira apagada. Outra carreira da conta foi ativada.":"Clube apagado. Sua conta foi mantida e você pode criar uma nova carreira.",
      activeType:active.type,
      club:active.club,
      playerCareer:active.playerCareer,
      careers:await listUserCareers(req.user.id)
    });
  }catch(e){next(e)}
});

app.delete("/api/careers/:clubId",auth,async(req,res,next)=>{
  try{
    const clubId=String(req.params.clubId);
    const confirmName=String(req.body.confirmName||"").trim();
    const target=(await q(`SELECT * FROM clubs WHERE id=$1 AND user_id=$2`,[clubId,req.user.id])).rows[0];
    if(!target)return res.status(404).json({error:"Carreira não encontrada."});
    if(confirmName!==target.name)return res.status(400).json({error:"Digite exatamente o nome do clube para confirmar."});

    await withCompetitionLock(target.id,async()=>{
      await tx(async client=>{
        await client.query(`DELETE FROM players WHERE club_id=$1`,[target.id]);
        await client.query(`DELETE FROM clubs WHERE id=$1 AND user_id=$2`,[target.id,req.user.id]);
      });
    });

    const remaining=await listUserCareers(req.user.id);
    const active=remaining.length?await activateFirstAvailableCareer(req.user.id):{type:null,club:null,playerCareer:null};
    res.json({ok:true,activeType:active.type,club:active.club,playerCareer:active.playerCareer,careers:await listUserCareers(req.user.id)});
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
    const updated=await tx(async client=>{
      const r=await client.query(`UPDATE clubs SET name=$2,primary_color=$3,secondary_color=$4,crest_data=$5 WHERE id=$1 RETURNING *`,[c.id,name,primary,secondary,crest||null]);
      const felipeMode=await applyFelipeMode(client,c.id);
      return {club:(await client.query(`SELECT * FROM clubs WHERE id=$1`,[c.id])).rows[0],felipeMode};
    });
    res.json(updated);
  }catch(e){if(e.code==="23505")return res.status(409).json({error:"Esse nome já está em uso."});next(e)}
});

app.get("/api/dashboard",auth,async(req,res,next)=>{
  try{
    const c=await userClub(req.user.id);
    if(!c)return res.json({club:null,players:[],market:[],matches:[],friends:[]});
    if((c.country_code||"BR")==="BR"&&!c.state_code)return res.json({club:c,players:[],market:[],matches:[],friends:[]});
    await ensureRoster(c.id);await ensureMarket();
    await tx(async client=>{await applyFelipeMode(client,c.id)});
    const freshClub=(await q(`SELECT * FROM clubs WHERE id=$1`,[c.id])).rows[0];
    Object.assign(c,freshClub);
    c.team_rating=await clubRating(c.id);
    const career=await getCareer(c.id);
    Object.assign(c,(await q(`SELECT * FROM clubs WHERE id=$1`,[c.id])).rows[0]||c);
    const [ps,mk,mt,fr,fin,events,trophies,offers,sponsorship]=await Promise.all([
      q(`SELECT * FROM players WHERE club_id=$1 ORDER BY is_starter DESC,CASE position WHEN 'GK' THEN 1 WHEN 'DEF' THEN 2 WHEN 'MID' THEN 3 ELSE 4 END,rating DESC`,[c.id]),
      q(`SELECT * FROM players WHERE club_id IS NULL ORDER BY rating DESC,price DESC LIMIT 40`),
      q(`SELECT m.*,o.name opponent_name FROM matches m JOIN clubs o ON o.id=m.opponent_club_id WHERE m.user_club_id=$1 ORDER BY played_at DESC LIMIT 30`,[c.id]),
      q(`SELECT c.id,c.name,c.primary_color,c.secondary_color,c.crest_data,c.friend_code,c.team_rating FROM friendships f JOIN clubs c ON c.id=CASE WHEN f.club_a_id=$1 THEN f.club_b_id ELSE f.club_a_id END WHERE f.club_a_id=$1 OR f.club_b_id=$1 ORDER BY c.name`,[c.id]),
      financeSummary(c.id),
      q(`SELECT event_type,title,description,created_at FROM club_events WHERE club_id=$1 ORDER BY created_at DESC,id DESC LIMIT 10`,[c.id]),
      q(`SELECT id,season_no,competition,title,won_at FROM club_trophies WHERE club_id=$1 ORDER BY season_no DESC,won_at DESC`,[c.id]),
      q(`SELECT o.id,o.amount,o.status,o.offer_kind,o.created_at,p.id player_id,p.name player_name,p.position,p.role,p.rating,p.age,p.transfer_listed,b.id buying_club_id,b.name buying_club_name FROM transfer_offers o JOIN players p ON p.id=o.player_id JOIN clubs b ON b.id=o.buying_club_id WHERE o.selling_club_id=$1 AND o.status='pending' AND b.is_ai=TRUE AND o.offer_kind<>'human' ORDER BY o.amount DESC,o.created_at DESC`,[c.id]),
      sponsorshipSummary(c.id,career)
    ]);
    const cal=career?calendarSummary(career,fin.wages):null;
    res.json({club:c,players:ps.rows,market:mk.rows,matches:mt.rows,friends:fr.rows,finance:fin,clubEvents:events.rows,trophies:trophies.rows,incomingOffers:offers.rows,calendar:cal,sponsorship});
  }catch(e){next(e)}
});

app.post("/api/sponsorships/sign",auth,async(req,res,next)=>{
  try{
    const c=await userClub(req.user.id);
    if(!c)return res.status(404).json({error:"Clube não encontrado."});
    const career=await getCareer(c.id);
    if(!career)return res.status(400).json({error:"Carreira não encontrada."});
    const sponsorId=String(req.body.sponsorId||"");
    const offer=sponsorOffersForDivision(career.user_division).find(x=>x.id===sponsorId);
    if(!offer)return res.status(400).json({error:"Proposta de patrocínio inválida para sua divisão."});
    const result=await tx(async client=>{
      const active=(await client.query(`SELECT 1 FROM sponsorship_contracts WHERE club_id=$1 AND status='active' LIMIT 1 FOR UPDATE`,[c.id])).rowCount>0;
      if(active)throw Object.assign(new Error("Seu clube já possui um patrocinador ativo."),{status:409});
      await client.query(`INSERT INTO sponsorship_contracts(club_id,sponsor_key,sponsor_name,division_signed,monthly_amount,signing_bonus,months_total,months_paid,status)
        VALUES($1,$2,$3,$4,$5,$6,$7,0,'active')`,
        [c.id,offer.id,offer.name,career.user_division,offer.monthly,offer.signing,offer.months]);
      if(offer.signing>0)await addFinance(client,c.id,offer.signing,"sponsor_signing",`Luvas de patrocínio — ${offer.name}`);
      await client.query(`INSERT INTO club_events(club_id,event_type,title,description) VALUES($1,'sponsor','Novo patrocinador',$2)`,
        [c.id,`${offer.name} assinou por ${offer.months} meses: ${offer.monthly.toLocaleString("pt-BR")} moedas por mês.`]);
      return {ok:true,name:offer.name,monthly:offer.monthly,signing:offer.signing};
    });
    res.json(result);
  }catch(e){next(e)}
});

app.post("/api/career/manual-save",auth,async(req,res,next)=>{
  try{
    const club=await userClub(req.user.id);
    if(!club)return res.status(404).json({error:"Carreira não encontrada."});

    const starterIds=Array.isArray(req.body.starterIds)?req.body.starterIds.map(String):null;
    const formation=req.body.formation?String(req.body.formation):null;

    const result=await withCompetitionLock(club.id,async()=>tx(async client=>{
      const career=(await client.query(`SELECT * FROM careers WHERE owner_club_id=$1 FOR UPDATE`,[club.id])).rows[0];
      if(!career)throw Object.assign(new Error("Carreira não encontrada."),{status:404});

      let lineupSaved=false;

      if(starterIds&&formation){
        if(starterIds.length!==11||new Set(starterIds).size!==11){
          throw Object.assign(new Error("Selecione exatamente 11 titulares para salvar a escalação."),{status:400});
        }

        const own=(await client.query(
          `SELECT id,position,injury_games FROM players WHERE club_id=$1 AND id=ANY($2::bigint[])`,
          [club.id,starterIds]
        )).rows;

        if(own.length!==11||!own.some(p=>p.position==="GK")){
          throw Object.assign(new Error("A escalação precisa incluir um goleiro."),{status:400});
        }
        if(own.some(p=>Number(p.injury_games||0)>0)){
          throw Object.assign(new Error("Jogadores lesionados não podem ser titulares."),{status:400});
        }

        const quota=formationQuotas(formation),counts={GK:0,DEF:0,MID:0,ATT:0};
        own.forEach(p=>counts[p.position]=(counts[p.position]||0)+1);
        if(Object.keys(quota).some(k=>counts[k]!==quota[k])){
          throw Object.assign(new Error(`A formação ${formation} exige ${quota.DEF} defensores, ${quota.MID} meio-campistas e ${quota.ATT} atacantes.`),{status:400});
        }

        await client.query(`UPDATE players SET is_starter=FALSE WHERE club_id=$1`,[club.id]);
        await client.query(`UPDATE players SET is_starter=TRUE WHERE club_id=$1 AND id=ANY($2::bigint[])`,[club.id,starterIds]);
        await client.query(`UPDATE clubs SET formation=$2 WHERE id=$1`,[club.id,formation]);

        const rating=Number((await client.query(
          `SELECT COALESCE(ROUND(AVG(rating)),64)::int rating FROM players WHERE club_id=$1 AND is_starter=TRUE`,
          [club.id]
        )).rows[0].rating||64);
        await client.query(`UPDATE clubs SET team_rating=$2 WHERE id=$1`,[club.id,rating]);
        lineupSaved=true;
      }

      const saved=(await client.query(
        `UPDATE careers SET manual_saved_at=NOW(),updated_at=NOW() WHERE owner_club_id=$1 RETURNING manual_saved_at`,
        [club.id]
      )).rows[0];

      return {
        ok:true,
        savedAt:saved.manual_saved_at,
        lineupSaved,
        careerId:club.id,
        careerLabel:club.career_label||`Carreira ${club.career_slot||1}`
      };
    }));

    res.json(result);
  }catch(e){next(e)}
});

app.get("/api/competitions",auth,async(req,res,next)=>{
  try{
    const c=await userClub(req.user.id);
    if(!c)return res.status(404).json({error:"Carreira de clube não encontrada."});
    if((c.country_code||"BR")==="BR"&&!c.state_code)return res.status(400).json({error:"Defina o estado do clube."});
    let career=await repairCareer(c.id);
    if(!career)career=await createCareer(c.id,c.state_code||"",1,null,c.country_code||"BR");
    res.json(await hydrateCareer(career));
  }catch(e){next(e)}
});

app.post("/api/copa/play-next",auth,async(req,res,next)=>{
  try{
    const c=await userClub(req.user.id);
    res.json(await withCompetitionLock(c.id,async()=>{await repairCareer(c.id);return playCopa(c.id)}));
  }catch(e){next(e)}
});

app.post("/api/state/play-next",auth,async(req,res,next)=>{
  try{
    const c=await userClub(req.user.id);
    res.json(await withCompetitionLock(c.id,async()=>{await repairCareer(c.id);return playState(c.id)}));
  }catch(e){next(e)}
});
app.post("/api/national/play-round",auth,async(req,res,next)=>{
  try{
    const c=await userClub(req.user.id);
    res.json(await withCompetitionLock(c.id,async()=>{await repairCareer(c.id);return playNational(c.id)}));
  }catch(e){next(e)}
});
app.post("/api/libertadores/play-next",auth,async(req,res,next)=>{
  try{
    const c=await userClub(req.user.id);
    res.json(await withCompetitionLock(c.id,async()=>{await repairCareer(c.id);return playLib(c.id)}));
  }catch(e){next(e)}
});
app.post("/api/career/next-season",auth,async(req,res,next)=>{
  try{
    const c=await userClub(req.user.id);
    res.json({career:await withCompetitionLock(c.id,async()=>{await repairCareer(c.id);return nextSeason(c.id)})});
  }catch(e){next(e)}
});

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
    const own=await q(`SELECT id,position,injury_games FROM players WHERE club_id=$1 AND id=ANY($2::bigint[])`,[c.id,ids]);
    if(own.rowCount!==11||!own.rows.some(p=>p.position==="GK"))return res.status(400).json({error:"Inclua um goleiro."});
    if(own.rows.some(p=>Number(p.injury_games||0)>0))return res.status(400).json({error:"Jogadores lesionados não podem ser titulares."});
    const quota=formationQuotas(formation),counts={GK:0,DEF:0,MID:0,ATT:0};
    own.rows.forEach(p=>counts[p.position]=(counts[p.position]||0)+1);
    if(Object.keys(quota).some(k=>counts[k]!==quota[k]))return res.status(400).json({error:`A formação ${formation} exige ${quota.DEF} defensores, ${quota.MID} meio-campistas e ${quota.ATT} atacantes.`});
    await tx(async x=>{await x.query(`UPDATE players SET is_starter=FALSE WHERE club_id=$1`,[c.id]);await x.query(`UPDATE players SET is_starter=TRUE WHERE club_id=$1 AND id=ANY($2::bigint[])`,[c.id,ids]);await x.query(`UPDATE clubs SET formation=$2 WHERE id=$1`,[c.id,formation])});
    res.json({ok:true});
  }catch(e){next(e)}
});

app.post("/api/players/:id/release",auth,async(req,res,next)=>{
  try{
    const c=await userClub(req.user.id),pid=String(req.params.id);
    await tx(async x=>{
      const p=(await x.query(`SELECT * FROM players WHERE id=$1 AND club_id=$2 FOR UPDATE`,[pid,c.id])).rows[0];
      if(!p)throw Object.assign(new Error("Jogador não encontrado."),{status:404});
      if(p.is_starter)throw Object.assign(new Error("Tire o jogador dos titulares antes de rescindir."),{status:400});

      const borrowed=(await x.query(`SELECT 1 FROM player_loans WHERE player_id=$1 AND borrowing_club_id=$2 AND status='active'`,[pid,c.id])).rowCount>0;
      if(borrowed)throw Object.assign(new Error("Jogador emprestado não pode ter o contrato rescindido."),{status:400});

      const count=Number((await x.query(`SELECT COUNT(*)::int count FROM players WHERE club_id=$1`,[c.id])).rows[0].count);
      if(count<=12)throw Object.assign(new Error("Mantenha pelo menos 12 jogadores."),{status:400});

      const severance=Math.max(100,Number(p.salary||0)*2);
      await x.query(`UPDATE clubs SET coins=coins-$2 WHERE id=$1`,[c.id,severance]);
      await x.query(`INSERT INTO club_finance_events(club_id,amount,category,description) VALUES($1,$2,'severance',$3)`,[c.id,-severance,`Rescisão de ${p.name}`]);

      // A instância é arquivada fora do save e nunca aparece no mercado de outra carreira.
      await x.query(`
        UPDATE players
        SET club_id=NULL,is_starter=FALSE,transfer_listed=FALSE,
            market_template_id=COALESCE(market_template_id,-id),
            price=GREATEST(100,ROUND(price*0.9)::int),contract_seasons=1
        WHERE id=$1
      `,[pid]);
    });
    res.json({ok:true});
  }catch(e){next(e)}
});


app.post("/api/players/:id/transfer-list",auth,async(req,res,next)=>{
  try{
    const c=await userClub(req.user.id),pid=String(req.params.id),listed=Boolean(req.body.listed);
    const result=await tx(async client=>{
      const p=(await client.query(`SELECT * FROM players WHERE id=$1 AND club_id=$2 FOR UPDATE`,[pid,c.id])).rows[0];
      if(!p)throw Object.assign(new Error("Jogador não encontrado."),{status:404});
      const borrowed=(await client.query(`SELECT 1 FROM player_loans WHERE player_id=$1 AND borrowing_club_id=$2 AND status='active'`,[pid,c.id])).rowCount>0;
      if(borrowed&&listed)throw Object.assign(new Error("Jogador emprestado não pode ser colocado à venda."),{status:400});
      await client.query(`UPDATE players SET transfer_listed=$3 WHERE id=$1 AND club_id=$2`,[pid,c.id,listed]);
      let offersCreated=0;
      if(listed)offersCreated=await generateIncomingOffers(client,c.id,{force:true,playerId:p.id});
      return {ok:true,listed,offersCreated};
    });
    res.json(result);
  }catch(e){next(e)}
});

app.post("/api/transfers/incoming/:offerId/accept",auth,async(req,res,next)=>{
  try{
    const c=await userClub(req.user.id),offerId=String(req.params.offerId);
    const result=await tx(async client=>{
      const o=(await client.query(`
        SELECT o.*,p.name player_name,p.position,p.is_starter,b.name buying_club_name,b.is_ai buying_is_ai
        FROM transfer_offers o
        JOIN players p ON p.id=o.player_id
        JOIN clubs b ON b.id=o.buying_club_id
        WHERE o.id=$1 AND o.selling_club_id=$2
        FOR UPDATE OF o
      `,[offerId,c.id])).rows[0];

      if(!o||o.status!=="pending")throw Object.assign(new Error("Proposta não está mais disponível."),{status:409});
      if(!o.buying_is_ai||o.offer_kind==="human"){
        await client.query(`UPDATE transfer_offers SET status='expired',updated_at=NOW() WHERE id=$1`,[offerId]);
        throw Object.assign(new Error("Essa proposta pertencia ao antigo mercado compartilhado e foi encerrada."),{status:409});
      }

      const p=(await client.query(`SELECT * FROM players WHERE id=$1 AND club_id=$2 FOR UPDATE`,[o.player_id,c.id])).rows[0];
      if(!p)throw Object.assign(new Error("O jogador não pertence mais a esta carreira."),{status:409});

      const borrowed=(await client.query(`SELECT 1 FROM player_loans WHERE player_id=$1 AND borrowing_club_id=$2 AND status='active'`,[p.id,c.id])).rowCount>0;
      if(borrowed)throw Object.assign(new Error("Jogador emprestado não pode ser vendido."),{status:400});

      const count=Number((await client.query(`SELECT COUNT(*)::int count FROM players WHERE club_id=$1`,[c.id])).rows[0].count);
      if(count<=12)throw Object.assign(new Error("Você precisa manter pelo menos 12 jogadores."),{status:400});
      if(p.position==="GK"){
        const gks=Number((await client.query(`SELECT COUNT(*)::int count FROM players WHERE club_id=$1 AND position='GK'`,[c.id])).rows[0].count);
        if(gks<=1)throw Object.assign(new Error("Você precisa manter pelo menos um goleiro."),{status:400});
      }

      const before=Number((await client.query(`SELECT coins FROM clubs WHERE id=$1`,[c.id])).rows[0].coins||0);
      await addFinance(client,c.id,Number(o.amount),"player_sale",`Venda de ${p.name} ao ${o.buying_club_name}`);

      // Sai apenas desta carreira. Não é inserido no elenco global da IA.
      await client.query(`
        UPDATE players
        SET club_id=NULL,is_starter=FALSE,transfer_listed=FALSE,
            market_template_id=COALESCE(market_template_id,-id),fitness=100,morale=72
        WHERE id=$1
      `,[p.id]);

      await client.query(`UPDATE transfer_offers SET status='accepted',updated_at=NOW() WHERE id=$1`,[o.id]);
      await client.query(`UPDATE transfer_offers SET status='expired',updated_at=NOW() WHERE player_id=$1 AND status='pending' AND id<>$2`,[p.id,o.id]);

      const after=before+Number(o.amount);
      if(before<TRANSFER_BAN_THRESHOLD&&after>=TRANSFER_BAN_THRESHOLD){
        await client.query(`INSERT INTO club_events(club_id,event_type,title,description) VALUES($1,'finance','Transfer ban suspenso','A venda de um jogador melhorou o caixa e o clube voltou a poder contratar.')`,[c.id]);
      }

      return {
        ok:true,
        amount:Number(o.amount),
        playerName:p.name,
        buyerClubName:o.buying_club_name,
        balance:after
      };
    });

    res.json(result);
  }catch(e){next(e)}
});

app.post("/api/transfers/incoming/:offerId/reject",auth,async(req,res,next)=>{
  try{
    const c=await userClub(req.user.id),offerId=String(req.params.offerId);
    const r=await q(`UPDATE transfer_offers SET status='rejected',updated_at=NOW() WHERE id=$1 AND selling_club_id=$2 AND status='pending' RETURNING id`,[offerId,c.id]);
    if(!r.rowCount)return res.status(404).json({error:"Proposta não encontrada."});
    res.json({ok:true});
  }catch(e){next(e)}
});

app.post("/api/transfers/incoming/generate",auth,async(req,res,next)=>{
  try{
    const c=await userClub(req.user.id);
    const created=await tx(async client=>generateIncomingOffers(client,c.id,{force:true}));
    res.json({ok:true,created});
  }catch(e){next(e)}
});

app.get("/api/transfers/search",auth,async(req,res,next)=>{
  try{
    const c=await userClub(req.user.id);
    if(!c)return res.status(404).json({error:"Clube não encontrado."});
    await ensureTransferPool(c.id);
    const career=await getCareer(c.id);
    const ban=transferBanInfo(c.coins);
    const qText=String(req.query.q||"").trim().toLowerCase();
    const position=String(req.query.position||"").trim().toUpperCase();
    const minRating=Number(req.query.minRating||0);
    const maxPrice=Number(req.query.maxPrice||999999999);
    const userDiv=career?.user_division||"D";
    const profile=marketProfile(userDiv);

    const rows=(await q(`
      SELECT p.*,
        sc.name source_club_name,sc.id source_club_id,sc.is_ai source_is_ai,
        sc.base_rating source_base_rating
      FROM players p
      LEFT JOIN clubs sc ON sc.id=p.club_id
      WHERE
        p.market_template_id IS NULL
        AND (p.club_id IS NULL OR sc.is_ai=TRUE)
        AND NOT EXISTS(
          SELECT 1 FROM players own
          WHERE own.club_id=$1 AND own.market_template_id=p.id
        )
      ORDER BY p.rating DESC,p.price DESC
      LIMIT 500
    `,[c.id])).rows;

    const filtered=rows.filter(p=>{
      const sourceDiv=p.source_club_id?divisionOfClub(career,p.source_club_id):null;
      const ask=askingPrice(p);
      if(qText&&!String(p.name).toLowerCase().includes(qText))return false;
      if(position&&p.position!==position&&p.role!==position)return false;
      if(Number(p.rating)<Math.max(minRating,profile.min))return false;
      if(Number(p.rating)>profile.max)return false;
      if(ask>maxPrice)return false;
      if(!marketSourceVisible(userDiv,sourceDiv))return false;
      return true;
    }).slice(0,90).map(p=>{
      const sourceDiv=p.source_club_id?divisionOfClub(career,p.source_club_id):null;
      const salary=suggestedSalary(p);
      const chance=interestChance(p,c,userDiv,sourceDiv,Math.round(salary*1.1/10)*10,3);
      const likelyImportant=Boolean(p.club_id)&&Boolean(p.is_starter)&&Number(p.rating)>=Number(p.source_base_rating||64)+2;
      return {
        ...p,
        fair_value:fairMarketValue(p),
        asking_price:askingPrice(p),
        suggested_salary:salary,
        source_division:sourceDiv,
        interest:chance>=70?"Alta":chance>=45?"Média":"Baixa",
        loan_eligible:Boolean(p.club_id)&&Boolean(p.source_is_ai)&&!likelyImportant,
        loan_reason:!p.club_id?"Jogador livre":likelyImportant?"Importante para o clube":"Disponível",
        suggested_loan_fee:Boolean(p.club_id)&&Boolean(p.source_is_ai)?Math.max(250,Math.round(fairMarketValue(p)*0.025/50)*50):0
      };
    });

    res.json({
      players:filtered,
      transferBan:ban,
      marketProfile:profile,
      userDivision:userDiv,
      independentCareerMarket:true
    });
  }catch(e){next(e)}
});

app.post("/api/transfers/offer",auth,async(req,res,next)=>{
  try{
    const c=await userClub(req.user.id);
    if(!c)return res.status(404).json({error:"Clube não encontrado."});
    const playerId=String(req.body.playerId||"");
    const feeOffer=Math.max(0,Number(req.body.feeOffer||0));
    const salaryOffer=Math.max(0,Number(req.body.salaryOffer||0));
    const years=clamp(Number(req.body.years||3),1,4);
    const installments=clamp(Number(req.body.installments||1),1,24);
    const career=await getCareer(c.id);
    const userDiv=career?.user_division||"D";

    if(transferBanInfo(c.coins).active){
      return res.status(403).json({error:`Transfer ban ativo por endividamento. O caixa precisa voltar para pelo menos ${TRANSFER_BAN_THRESHOLD.toLocaleString("pt-BR")} moedas para contratar.`});
    }

    const result=await tx(async client=>{
      const currentBalance=Number((await client.query(`SELECT coins FROM clubs WHERE id=$1 FOR UPDATE`,[c.id])).rows[0]?.coins||0);
      if(transferBanInfo(currentBalance).active)throw Object.assign(new Error(`Transfer ban ativo por endividamento. Saldo atual: ${currentBalance.toLocaleString("pt-BR")} moedas.`),{status:403});

      const p=(await client.query(`
        SELECT p.*,sc.name source_club_name,sc.id source_club_id,sc.is_ai source_is_ai,
          sc.base_rating source_base_rating
        FROM players p
        LEFT JOIN clubs sc ON sc.id=p.club_id
        WHERE p.id=$1 AND p.market_template_id IS NULL
        FOR UPDATE OF p
      `,[playerId])).rows[0];

      if(!p)throw Object.assign(new Error("Jogador-base não encontrado."),{status:404});
      if(p.club_id&&!p.source_is_ai)throw Object.assign(new Error("Esse jogador não pertence ao mercado desta carreira."),{status:400});

      const duplicate=(await client.query(`SELECT 1 FROM players WHERE club_id=$1 AND market_template_id=$2`,[c.id,p.id])).rowCount>0;
      if(duplicate)throw Object.assign(new Error("Esse jogador já foi contratado nesta carreira."),{status:409});

      const squad=Number((await client.query(`SELECT COUNT(*)::int count FROM players WHERE club_id=$1`,[c.id])).rows[0].count);
      if(squad>=30)throw Object.assign(new Error("Seu elenco já possui 30 jogadores."),{status:400});

      const ask=askingPrice(p);
      const suggested=suggestedSalary(p);
      const sourceDiv=p.source_club_id?divisionOfClub(career,p.source_club_id):null;

      if(p.club_id){
        if(feeOffer<Math.round(ask*.92)){
          return {accepted:false,stage:"club",message:`${p.source_club_name} recusou. O valor considerado justo está próximo de ${ask.toLocaleString("pt-BR")} moedas.`,askingPrice:ask,suggestedSalary:suggested};
        }
        if(feeOffer<ask&&Math.random()>.68){
          return {accepted:false,stage:"club",message:`${p.source_club_name} quer uma proposta mais próxima de ${ask.toLocaleString("pt-BR")} moedas.`,askingPrice:ask,suggestedSalary:suggested};
        }
      }

      const currentTeamRating=await clubRating(c.id,client);
      const chance=interestChance(p,{...c,team_rating:currentTeamRating},userDiv,sourceDiv,salaryOffer,years);
      if(salaryOffer<Math.round(suggested*.82)||Math.random()*100>chance){
        const reason=salaryOffer<suggested?"O salário oferecido foi considerado baixo.":"O jogador preferiu aguardar uma proposta esportivamente melhor.";
        return {accepted:false,stage:"player",message:`${p.name} recusou. ${reason}`,chance,askingPrice:ask,suggestedSalary:suggested};
      }

      const realInstallments=p.club_id?installments:1;
      const signingBonus=Math.max(100,Math.round(salaryOffer*1.5));
      const firstFee=realInstallments>1?Math.ceil(feeOffer/realInstallments):feeOffer;
      const immediateCost=firstFee+signingBonus;

      if(currentBalance<immediateCost){
        throw Object.assign(new Error(`Caixa insuficiente para a entrada e as luvas. Custo imediato: ${immediateCost.toLocaleString("pt-BR")} moedas.`),{status:400});
      }

      await client.query(`UPDATE clubs SET coins=coins-$2 WHERE id=$1`,[c.id,immediateCost]);
      await client.query(`INSERT INTO club_finance_events(club_id,amount,category,description) VALUES($1,$2,'transfer',$3)`,
        [c.id,-immediateCost,`Contratação de ${p.name}: ${realInstallments>1?`entrada 1/${realInstallments}`:"transferência"} + luvas`]);

      if(p.club_id&&firstFee>0)await client.query(`UPDATE clubs SET coins=coins+$2 WHERE id=$1`,[p.club_id,firstFee]);

      const signed=await clonePlayerForCareer(client,p,c.id,{
        salary:Math.round(salaryOffer),
        years,
        fitness:Math.max(82,Number(p.fitness||100)),
        morale:78
      });

      if(p.club_id&&realInstallments>1){
        const remaining=Math.max(0,feeOffer-firstFee);
        const nextDue=nextPayrollDate(ensureCalendarData(career));
        await client.query(`
          INSERT INTO transfer_installments(
            buying_club_id,selling_club_id,player_id,player_name,total_fee,amount_remaining,
            installment_amount,installments_total,installments_paid,next_due_date,status
          ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,1,$9,'active')
        `,[c.id,p.club_id,signed.id,p.name,feeOffer,remaining,firstFee,realInstallments,nextDue]);
      }

      await applyFelipeMode(client,c.id);

      const installmentText=realInstallments>1?` em ${realInstallments}x`:"";
      await client.query(`INSERT INTO club_events(club_id,event_type,title,description) VALUES($1,'transfer','Contratação confirmada',$2)`,
        [c.id,`${p.name} foi contratado${installmentText}. Este jogador existe apenas dentro desta carreira.`]);

      return {
        accepted:true,
        message:`${p.name} aceitou a proposta e entrou nesta carreira.${realInstallments>1?` Transferência parcelada em ${realInstallments}x.`:""}`,
        playerId:signed.id,
        templatePlayerId:p.id,
        cost:immediateCost,
        installments:realInstallments,
        firstPayment:firstFee
      };
    });

    res.json(result);
  }catch(e){next(e)}
});

app.post("/api/transfers/loan",auth,async(req,res,next)=>{
  try{
    const c=await userClub(req.user.id);
    if(!c)return res.status(404).json({error:"Clube não encontrado."});
    if(transferBanInfo(c.coins).active)return res.status(403).json({error:"Transfer ban ativo. Novos empréstimos estão bloqueados até o clube sair do limite de endividamento."});

    const playerId=String(req.body.playerId||"");
    const months=[3,6,12].includes(Number(req.body.months))?Number(req.body.months):6;
    const monthlyFee=Math.max(0,Number(req.body.monthlyFee||0));
    const career=await getCareer(c.id);
    const userDiv=career?.user_division||"D";

    const result=await tx(async client=>{
      const balance=Number((await client.query(`SELECT coins FROM clubs WHERE id=$1 FOR UPDATE`,[c.id])).rows[0]?.coins||0);
      if(transferBanInfo(balance).active)throw Object.assign(new Error("Transfer ban ativo por endividamento."),{status:403});

      const p=(await client.query(`
        SELECT p.*,sc.name source_club_name,sc.id source_club_id,sc.is_ai source_is_ai,sc.base_rating source_base_rating
        FROM players p JOIN clubs sc ON sc.id=p.club_id
        WHERE p.id=$1 AND p.market_template_id IS NULL
        FOR UPDATE OF p
      `,[playerId])).rows[0];

      if(!p)throw Object.assign(new Error("Jogador-base não encontrado."),{status:404});
      if(!p.source_is_ai)throw Object.assign(new Error("Empréstimo disponível apenas para jogadores de clubes controlados pelo jogo."),{status:400});

      const duplicate=(await client.query(`SELECT 1 FROM players WHERE club_id=$1 AND market_template_id=$2`,[c.id,p.id])).rowCount>0;
      if(duplicate)throw Object.assign(new Error("Esse jogador já pertence a esta carreira."),{status:409});

      const eligibility=await loanEligibility(client,p);
      if(!eligibility.eligible)throw Object.assign(new Error(eligibility.reason),{status:400});

      const sourceDiv=divisionOfClub(career,p.club_id);
      const profile=marketProfile(userDiv);
      if(Number(p.rating)>profile.max+1)throw Object.assign(new Error("Esse jogador está acima do nível de empréstimo disponível para sua divisão."),{status:400});

      const fairFee=Math.max(250,Math.round(fairMarketValue(p)*0.025/50)*50);
      if(monthlyFee<Math.round(fairFee*.90)){
        return {accepted:false,message:`${p.source_club_name} recusou. O valor mensal esperado é próximo de ${fairFee.toLocaleString("pt-BR")} moedas.`,suggestedFee:fairFee};
      }

      const currentTeamRating=await clubRating(c.id,client);
      const projectChance=clamp(72+(divisionRank(userDiv)-divisionRank(sourceDiv||userDiv))*5-(Number(p.rating)-currentTeamRating)*1.6,20,95);
      if(Math.random()*100>projectChance){
        return {accepted:false,message:`${p.name} preferiu permanecer no clube atual por enquanto.`,suggestedFee:fairFee};
      }

      const squad=Number((await client.query(`SELECT COUNT(*)::int count FROM players WHERE club_id=$1`,[c.id])).rows[0].count);
      if(squad>=30)throw Object.assign(new Error("Seu elenco já possui 30 jogadores."),{status:400});

      const loaned=await clonePlayerForCareer(client,p,c.id,{
        salary:Number(p.salary||salaryForRating(p.rating)),
        years:Math.max(1,Number(p.contract_seasons||1)),
        fitness:100,
        morale:76
      });

      await client.query(`
        INSERT INTO player_loans(
          player_id,parent_club_id,borrowing_club_id,start_season_no,months_total,months_elapsed,monthly_fee,status
        )
        VALUES($1,$2,$3,$4,$5,0,$6,'active')
      `,[loaned.id,p.club_id,c.id,career.season_no,months,Math.round(monthlyFee)]);

      await applyFelipeMode(client,c.id);

      await client.query(`INSERT INTO club_events(club_id,event_type,title,description) VALUES($1,'loan','Empréstimo confirmado',$2)`,
        [c.id,`${p.name} chegou por ${months} meses. A versão original continua disponível nas outras carreiras.`]);

      return {
        accepted:true,
        message:`${p.name} chegou por empréstimo de ${months} meses nesta carreira.`,
        playerId:loaned.id,
        templatePlayerId:p.id,
        months,
        monthlyFee:Math.round(monthlyFee)
      };
    });

    res.json(result);
  }catch(e){next(e)}
});

app.post("/api/market/buy",auth,async(_req,res)=>{
  res.status(410).json({error:"Compra direta desativada. Use a negociação de transferências."});
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
  await applyEconomyMigration();
  await applyV14Migration();
  await applyV15Migration();
  await applyV16Migration();
  await applyV17Migration();
  await applyV18Migration();
  await applyV21Migration();
  await ensureMarket();
  app.listen(PORT,"0.0.0.0",()=>console.log(`Dono do Clube v13 rodando na porta ${PORT}`));
}
start().catch(e=>{console.error("Falha ao iniciar:",e);process.exit(1)});
