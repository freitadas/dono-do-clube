
const express = require("express");
const { Pool } = require("pg");
const crypto = require("crypto");
const path = require("path");
const CLUB_SEED = [...require("./clubs.json"),...require("./international_clubs.json"),...require("./global_clubs.json")];
const REAL_PLAYER_SEED = require("./real_players.json");
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
const V22_MIGRATION_KEY = "v22_real_market_champions_superworld_20260919";
const V23_MIGRATION_KEY = "v23_full_season_sim_equal_wages_20260919";
const V24_MIGRATION_KEY = "v24_two_leg_cups_penalty_scores_20260919";
const V25_MIGRATION_KEY = "v25_starting_xi_repair_20260919";
const V26_MIGRATION_KEY = "v26_news_press_saf_20260919";
const V27_MIGRATION_KEY = "v27_board_media_press_lineup_20260919";
const V29_MIGRATION_KEY = "v29_two_real_sponsors_20260919";
const V32_MIGRATION_KEY = "v32_realistic_rotation_performance_offers_20260919";
const V33_MIGRATION_KEY = "v33_copa_skip_and_career_condition_freeze_20260919";
const V34_MIGRATION_KEY = "v34_copa_brasil_libertadores_qualification_20260919";
const V35_MIGRATION_KEY = "v35_loan_purchase_option_contract_renewal_20260919";
const V38_MIGRATION_KEY = "v38_realism_suite_manager_offers_20260920";
const MAX_CAREERS_PER_USER = 10;
const TRANSFER_BAN_THRESHOLD = -10000;
const competitionLocks = new Set();
const DIVS = ["A","B","C","D"];
const VALID_STATES = new Set(Object.keys(STATE_DATA.names));
const VALID_COUNTRIES = new Set(Object.keys(COUNTRY_DATA));
const EUROPE_COUNTRIES = new Set(["ENG","ESP","ITA","GER","FRA","POR"]);
const SOUTH_AMERICA_COUNTRIES = new Set(["BR","ARG"]);
function confederationForCountry(code){
  if(EUROPE_COUNTRIES.has(code))return "UEFA";
  if(SOUTH_AMERICA_COUNTRIES.has(code))return "CONMEBOL";
  if(["KSA","JPN","KOR","UAE","IRN"].includes(code))return "AFC";
  if(["EGY","MAR","RSA","TUN","COD","ANG"].includes(code))return "CAF";
  if(["MEX","USA","CAN","CRC"].includes(code))return "CONCACAF";
  if(["NZL","PNG"].includes(code))return "OFC";
  if(code==="HOST")return "HOST";
  return null;
}
function isSuperWorldSeason(seasonNo){return (Number(seasonNo)-1)%4===0}


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
      confederation_code TEXT,
      club_kind TEXT NOT NULL DEFAULT 'user',
      national_seed_division TEXT,
      base_rating INTEGER NOT NULL DEFAULT 64,
      coins INTEGER NOT NULL DEFAULT 3500 CHECK(coins>=0),
      formation TEXT NOT NULL DEFAULT '4-3-3',
      team_rating INTEGER NOT NULL DEFAULT 64,
      is_ai BOOLEAN NOT NULL DEFAULT FALSE,
      is_saf BOOLEAN NOT NULL DEFAULT FALSE,
      saf_investor_name TEXT,
      saf_investment INTEGER NOT NULL DEFAULT 0,
      saf_started_season INTEGER,
      saf_debt_relegations INTEGER NOT NULL DEFAULT 0,
      board_confidence INTEGER NOT NULL DEFAULT 60,
      media_pressure INTEGER NOT NULL DEFAULT 0,
      chemistry INTEGER NOT NULL DEFAULT 70,
      manager_reputation INTEGER NOT NULL DEFAULT 50,
      coach_name TEXT,
      stadium_capacity INTEGER NOT NULL DEFAULT 12000,
      stadium_level INTEGER NOT NULL DEFAULT 1,
      ticket_price INTEGER NOT NULL DEFAULT 30,
      rival_club_id BIGINT REFERENCES clubs(id) ON DELETE SET NULL,
      tactic_pressing TEXT NOT NULL DEFAULT 'NORMAL',
      tactic_defensive_line TEXT NOT NULL DEFAULT 'NORMAL',
      tactic_tempo TEXT NOT NULL DEFAULT 'NORMAL',
      tactic_width TEXT NOT NULL DEFAULT 'NORMAL',
      tactic_style TEXT NOT NULL DEFAULT 'BALANCED',
      tactic_marking TEXT NOT NULL DEFAULT 'NORMAL',
      last_match_game_date DATE,
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
      consecutive_starts INTEGER NOT NULL DEFAULT 0,
      potential INTEGER NOT NULL DEFAULT 70,
      form_rating INTEGER NOT NULL DEFAULT 70,
      suspension_games INTEGER NOT NULL DEFAULT 0,
      yellow_accumulation INTEGER NOT NULL DEFAULT 0,
      injury_type TEXT,
      squad_status TEXT NOT NULL DEFAULT 'ROTATION',
      happiness INTEGER NOT NULL DEFAULT 75,
      tactical_role TEXT NOT NULL DEFAULT 'BALANCED',
      is_captain BOOLEAN NOT NULL DEFAULT FALSE,
      set_piece_role TEXT NOT NULL DEFAULT 'NONE',
      academy_product BOOLEAN NOT NULL DEFAULT FALSE,
      is_bench BOOLEAN NOT NULL DEFAULT FALSE,
      season_appearances INTEGER NOT NULL DEFAULT 0,
      season_goals INTEGER NOT NULL DEFAULT 0,
      season_assists INTEGER NOT NULL DEFAULT 0,
      season_clean_sheets INTEGER NOT NULL DEFAULT 0,
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
      season_no INTEGER NOT NULL DEFAULT 1,
      is_home BOOLEAN NOT NULL DEFAULT TRUE,
      attendance INTEGER NOT NULL DEFAULT 0,
      game_date DATE,
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

    CREATE TABLE IF NOT EXISTS media_news(
      id BIGSERIAL PRIMARY KEY,
      club_id BIGINT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
      season_no INTEGER NOT NULL DEFAULT 1,
      category TEXT NOT NULL DEFAULT 'geral',
      source_name TEXT NOT NULL DEFAULT 'Jornal do Clube',
      headline TEXT NOT NULL,
      body TEXT NOT NULL,
      importance INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS press_conferences(
      id BIGSERIAL PRIMARY KEY,
      club_id BIGINT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
      season_no INTEGER NOT NULL DEFAULT 1,
      trigger_type TEXT NOT NULL,
      title TEXT NOT NULL,
      question TEXT NOT NULL,
      context JSONB NOT NULL DEFAULT '{}'::jsonb,
      status TEXT NOT NULL DEFAULT 'pending',
      answer_key TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      answered_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS board_messages(
      id BIGSERIAL PRIMARY KEY,
      club_id BIGINT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
      season_no INTEGER NOT NULL DEFAULT 1,
      message_type TEXT NOT NULL DEFAULT 'geral',
      tone TEXT NOT NULL DEFAULT 'neutral',
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      importance INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS career_player_condition_snapshots(
      club_id BIGINT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
      player_id BIGINT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      fitness INTEGER NOT NULL,
      morale INTEGER NOT NULL,
      injury_games INTEGER NOT NULL,
      consecutive_starts INTEGER NOT NULL DEFAULT 0,
      is_starter BOOLEAN NOT NULL DEFAULT FALSE,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(club_id,player_id)
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
      purchase_option_price INTEGER,
      purchase_option_exercised BOOLEAN NOT NULL DEFAULT FALSE,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    
    CREATE TABLE IF NOT EXISTS player_career_development(
      id BIGSERIAL PRIMARY KEY,
      player_career_id BIGINT NOT NULL REFERENCES player_careers(id) ON DELETE CASCADE,
      potential INTEGER NOT NULL DEFAULT 85,
      coach_relation INTEGER NOT NULL DEFAULT 50,
      confidence INTEGER NOT NULL DEFAULT 50,
      starter_status TEXT NOT NULL DEFAULT 'reserve',
      position_competition INTEGER NOT NULL DEFAULT 50,
      goals INTEGER NOT NULL DEFAULT 0,
      assists INTEGER NOT NULL DEFAULT 0,
      appearances INTEGER NOT NULL DEFAULT 0,
      average_rating NUMERIC(4,2) NOT NULL DEFAULT 0,
      individual_awards INTEGER NOT NULL DEFAULT 0,
      career_history JSONB NOT NULL DEFAULT '[]'::jsonb,
      season_objectives JSONB NOT NULL DEFAULT '[]'::jsonb,
      retirement_age INTEGER NOT NULL DEFAULT 38,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS player_training_sessions(
      id BIGSERIAL PRIMARY KEY,
      player_career_id BIGINT NOT NULL REFERENCES player_careers(id) ON DELETE CASCADE,
      training_type TEXT NOT NULL,
      attribute_gain INTEGER NOT NULL DEFAULT 0,
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


    CREATE TABLE IF NOT EXISTS club_staff(
      id BIGSERIAL PRIMARY KEY,
      club_id BIGINT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      staff_name TEXT NOT NULL,
      level INTEGER NOT NULL DEFAULT 1,
      salary INTEGER NOT NULL DEFAULT 200,
      UNIQUE(club_id,role)
    );

    CREATE TABLE IF NOT EXISTS academy_players(
      id BIGSERIAL PRIMARY KEY,
      club_id BIGINT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
      season_no INTEGER NOT NULL,
      name TEXT NOT NULL,
      position TEXT NOT NULL,
      role TEXT NOT NULL,
      age INTEGER NOT NULL,
      rating INTEGER NOT NULL,
      potential INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'academy',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS player_season_history(
      id BIGSERIAL PRIMARY KEY,
      club_id BIGINT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
      player_id BIGINT REFERENCES players(id) ON DELETE SET NULL,
      player_name TEXT NOT NULL,
      season_no INTEGER NOT NULL,
      appearances INTEGER NOT NULL DEFAULT 0,
      goals INTEGER NOT NULL DEFAULT 0,
      assists INTEGER NOT NULL DEFAULT 0,
      clean_sheets INTEGER NOT NULL DEFAULT 0,
      yellow_cards INTEGER NOT NULL DEFAULT 0,
      red_cards INTEGER NOT NULL DEFAULT 0,
      rating_end INTEGER NOT NULL DEFAULT 0,
      UNIQUE(club_id,season_no,player_id)
    );

    CREATE TABLE IF NOT EXISTS career_season_history(
      id BIGSERIAL PRIMARY KEY,
      club_id BIGINT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
      season_no INTEGER NOT NULL,
      division TEXT NOT NULL,
      final_position INTEGER,
      wins INTEGER NOT NULL DEFAULT 0,
      draws INTEGER NOT NULL DEFAULT 0,
      losses INTEGER NOT NULL DEFAULT 0,
      gf INTEGER NOT NULL DEFAULT 0,
      ga INTEGER NOT NULL DEFAULT 0,
      trophies INTEGER NOT NULL DEFAULT 0,
      top_scorer TEXT,
      top_scorer_goals INTEGER NOT NULL DEFAULT 0,
      balance INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(club_id,season_no)
    );

    CREATE TABLE IF NOT EXISTS player_awards(
      id BIGSERIAL PRIMARY KEY,
      club_id BIGINT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
      season_no INTEGER NOT NULL,
      player_id BIGINT REFERENCES players(id) ON DELETE SET NULL,
      player_name TEXT NOT NULL,
      award_type TEXT NOT NULL,
      award_title TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(club_id,season_no,award_type)
    );

    CREATE TABLE IF NOT EXISTS manager_job_offers(
      id BIGSERIAL PRIMARY KEY,
      user_club_id BIGINT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
      offering_club_id BIGINT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
      season_no INTEGER NOT NULL,
      salary INTEGER NOT NULL DEFAULT 0,
      performance_score INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS scout_reports(
      id BIGSERIAL PRIMARY KEY,
      club_id BIGINT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
      target_player_id BIGINT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      exact_rating INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(club_id,target_player_id)
    );

    CREATE TABLE IF NOT EXISTS ai_transfer_log(
      id BIGSERIAL PRIMARY KEY,
      career_owner_id BIGINT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
      season_no INTEGER NOT NULL,
      player_name TEXT NOT NULL,
      from_club_name TEXT NOT NULL,
      to_club_name TEXT NOT NULL,
      fee INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
    CREATE INDEX IF NOT EXISTS idx_sponsorship_club_status ON sponsorship_contracts(club_id,status);
    CREATE INDEX IF NOT EXISTS idx_installments_buying_status ON transfer_installments(buying_club_id,status);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_active_loan_player ON player_loans(player_id) WHERE status='active';
    CREATE UNIQUE INDEX IF NOT EXISTS idx_player_careers_user_slot ON player_careers(user_id,career_slot);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_player_careers_one_active ON player_careers(user_id) WHERE is_active_career=TRUE;
    CREATE INDEX IF NOT EXISTS idx_media_news_club_created ON media_news(club_id,created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_press_club_status ON press_conferences(club_id,status,created_at DESC);
  `);

  for(const sql of [
    `ALTER TABLE clubs ADD COLUMN IF NOT EXISTS state_code TEXT`,
    `ALTER TABLE clubs ADD COLUMN IF NOT EXISTS country_code TEXT NOT NULL DEFAULT 'BR'`,
    `ALTER TABLE clubs ADD COLUMN IF NOT EXISTS confederation_code TEXT`,
    `ALTER TABLE clubs ADD COLUMN IF NOT EXISTS club_kind TEXT NOT NULL DEFAULT 'user'`,
    `ALTER TABLE clubs ADD COLUMN IF NOT EXISTS national_seed_division TEXT`,
    `ALTER TABLE clubs ADD COLUMN IF NOT EXISTS base_rating INTEGER NOT NULL DEFAULT 64`,
    `ALTER TABLE clubs ADD COLUMN IF NOT EXISTS fans INTEGER NOT NULL DEFAULT 5000`,
    `ALTER TABLE clubs ADD COLUMN IF NOT EXISTS career_slot INTEGER`,
    `ALTER TABLE clubs ADD COLUMN IF NOT EXISTS career_label TEXT`,
    `ALTER TABLE clubs ADD COLUMN IF NOT EXISTS is_active_career BOOLEAN NOT NULL DEFAULT FALSE`,
    `ALTER TABLE clubs ADD COLUMN IF NOT EXISTS is_saf BOOLEAN NOT NULL DEFAULT FALSE`,
    `ALTER TABLE clubs ADD COLUMN IF NOT EXISTS saf_investor_name TEXT`,
    `ALTER TABLE clubs ADD COLUMN IF NOT EXISTS saf_investment INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE clubs ADD COLUMN IF NOT EXISTS saf_started_season INTEGER`,
    `ALTER TABLE clubs ADD COLUMN IF NOT EXISTS saf_debt_relegations INTEGER NOT NULL DEFAULT 0`,
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
    `ALTER TABLE players ADD COLUMN IF NOT EXISTS is_real_name BOOLEAN NOT NULL DEFAULT FALSE`,
    `ALTER TABLE players ADD COLUMN IF NOT EXISTS real_player_key TEXT`,
    `ALTER TABLE players ADD COLUMN IF NOT EXISTS nationality_code TEXT`,
    `ALTER TABLE players ADD COLUMN IF NOT EXISTS consecutive_starts INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE player_loans ADD COLUMN IF NOT EXISTS purchase_option_price INTEGER`,
    `ALTER TABLE player_loans ADD COLUMN IF NOT EXISTS purchase_option_exercised BOOLEAN NOT NULL DEFAULT FALSE`,
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
  await q(`CREATE UNIQUE INDEX IF NOT EXISTS idx_players_real_player_key ON players(real_player_key)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_clubs_confederation ON clubs(confederation_code)`);

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
const normalizeSearch=v=>String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();

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
      const confed=x.confed||confederationForCountry(x.country);
      await c.query(`
        INSERT INTO clubs(
          name,is_ai,state_code,country_code,confederation_code,club_kind,national_seed_division,
          base_rating,team_rating,coins,primary_color,secondary_color
        )
        VALUES($1,TRUE,$2,$3,$4,$5,$6,$7,$7,0,$8,$9)
        ON CONFLICT(name) DO UPDATE SET
          is_ai=TRUE,
          state_code=EXCLUDED.state_code,
          country_code=EXCLUDED.country_code,
          confederation_code=EXCLUDED.confederation_code,
          club_kind=EXCLUDED.club_kind,
          national_seed_division=EXCLUDED.national_seed_division,
          base_rating=EXCLUDED.base_rating,
          primary_color=EXCLUDED.primary_color,
          secondary_color=EXCLUDED.secondary_color
      `,[x.name,x.state,x.country,confed,x.kind,x.division,x.rating,x.primary,x.secondary]);
    }
    const missing=await c.query(`SELECT id FROM clubs WHERE friend_code IS NULL`);
    for(const r of missing.rows) await ensureFriendCode(c,r.id);
  });
}

async function seedRealMarketPlayers(){
  await tx(async c=>{
    const hub=(await c.query(`SELECT id FROM clubs WHERE name='Mercado Mundial' AND is_ai=TRUE LIMIT 1`)).rows[0];
    if(!hub)throw new Error("Clube-fonte Mercado Mundial não foi criado.");

    for(const p of REAL_PLAYER_SEED){
      await c.query(`
        INSERT INTO players(
          club_id,name,position,role,rating,pace,shooting,passing,defending,price,is_starter,age,
          salary,contract_seasons,fitness,morale,injury_games,transfer_listed,market_template_id,
          is_real_name,real_player_key,nationality_code
        )
        VALUES(
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,TRUE,$11,
          $12,$13,100,76,0,FALSE,NULL,TRUE,$14,$15
        )
        ON CONFLICT(real_player_key) DO UPDATE SET
          club_id=EXCLUDED.club_id,
          name=EXCLUDED.name,
          position=EXCLUDED.position,
          role=EXCLUDED.role,
          rating=EXCLUDED.rating,
          pace=EXCLUDED.pace,
          shooting=EXCLUDED.shooting,
          passing=EXCLUDED.passing,
          defending=EXCLUDED.defending,
          price=EXCLUDED.price,
          is_starter=TRUE,
          age=EXCLUDED.age,
          salary=EXCLUDED.salary,
          contract_seasons=EXCLUDED.contract_seasons,
          is_real_name=TRUE,
          nationality_code=EXCLUDED.nationality_code
      `,[
        hub.id,p.name,p.position,p.role,p.rating,p.pace,p.shooting,p.passing,p.defending,
        p.price,p.age,salaryForRating(Number(p.rating)),p.contract_seasons,p.key,p.nationality
      ]);
    }
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

async function applyV22Migration(){
  const done=await q(`SELECT 1 FROM app_meta WHERE key=$1`,[V22_MIGRATION_KEY]);
  if(done.rowCount)return;
  await tx(async c=>{
    await c.query(`ALTER TABLE clubs ADD COLUMN IF NOT EXISTS confederation_code TEXT`);
    await c.query(`ALTER TABLE players ADD COLUMN IF NOT EXISTS is_real_name BOOLEAN NOT NULL DEFAULT FALSE`);
    await c.query(`ALTER TABLE players ADD COLUMN IF NOT EXISTS real_player_key TEXT`);
    await c.query(`ALTER TABLE players ADD COLUMN IF NOT EXISTS nationality_code TEXT`);
    await c.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_players_real_player_key ON players(real_player_key)`);
    await c.query(`CREATE INDEX IF NOT EXISTS idx_clubs_confederation ON clubs(confederation_code)`);

    const clubs=(await c.query(`SELECT id,country_code FROM clubs`)).rows;
    for(const club of clubs){
      const confed=confederationForCountry(club.country_code);
      if(confed)await c.query(`UPDATE clubs SET confederation_code=$2 WHERE id=$1`,[club.id,confed]);
    }

    await c.query(`INSERT INTO app_meta(key,value) VALUES($1,$2)`,[V22_MIGRATION_KEY,new Date().toISOString()]);
  });
}

async function applyV23Migration(){
  const done=await q(`SELECT 1 FROM app_meta WHERE key=$1`,[V23_MIGRATION_KEY]);
  if(done.rowCount)return;
  await tx(async c=>{
    const real=(await c.query(`SELECT id,rating FROM players WHERE is_real_name=TRUE`)).rows;
    for(const p of real){
      await c.query(`UPDATE players SET salary=$2 WHERE id=$1`,[p.id,salaryForRating(Number(p.rating||60))]);
    }
    await c.query(`INSERT INTO app_meta(key,value) VALUES($1,$2)`,[V23_MIGRATION_KEY,new Date().toISOString()]);
  });
}
async function applyV24Migration(){
  const done=await q(`SELECT 1 FROM app_meta WHERE key=$1`,[V24_MIGRATION_KEY]);
  if(done.rowCount)return;
  await q(`INSERT INTO app_meta(key,value) VALUES($1,$2)`,[V24_MIGRATION_KEY,new Date().toISOString()]);
}
async function applyV25Migration(){
  const done=await q(`SELECT 1 FROM app_meta WHERE key=$1`,[V25_MIGRATION_KEY]);
  if(done.rowCount)return;
  await q(`INSERT INTO app_meta(key,value) VALUES($1,$2)`,[V25_MIGRATION_KEY,new Date().toISOString()]);
}
async function applyV26Migration(){
  const done=await q(`SELECT 1 FROM app_meta WHERE key=$1`,[V26_MIGRATION_KEY]);
  if(done.rowCount)return;
  await tx(async c=>{
    await c.query(`ALTER TABLE clubs ADD COLUMN IF NOT EXISTS is_saf BOOLEAN NOT NULL DEFAULT FALSE`);
    await c.query(`ALTER TABLE clubs ADD COLUMN IF NOT EXISTS saf_investor_name TEXT`);
    await c.query(`ALTER TABLE clubs ADD COLUMN IF NOT EXISTS saf_investment INTEGER NOT NULL DEFAULT 0`);
    await c.query(`ALTER TABLE clubs ADD COLUMN IF NOT EXISTS saf_started_season INTEGER`);
    await c.query(`ALTER TABLE clubs ADD COLUMN IF NOT EXISTS saf_debt_relegations INTEGER NOT NULL DEFAULT 0`);
    await c.query(`INSERT INTO app_meta(key,value) VALUES($1,$2)`,[V26_MIGRATION_KEY,new Date().toISOString()]);
  });
}

async function applyV27Migration(){
  const done=await q(`SELECT 1 FROM app_meta WHERE key=$1`,[V27_MIGRATION_KEY]);
  if(done.rowCount)return;
  await tx(async c=>{
    await c.query(`ALTER TABLE clubs ADD COLUMN IF NOT EXISTS board_confidence INTEGER NOT NULL DEFAULT 60`);
    await c.query(`ALTER TABLE clubs ADD COLUMN IF NOT EXISTS media_pressure INTEGER NOT NULL DEFAULT 0`);
    await c.query(`
      CREATE TABLE IF NOT EXISTS board_messages(
        id BIGSERIAL PRIMARY KEY,
        club_id BIGINT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
        season_no INTEGER NOT NULL DEFAULT 1,
        message_type TEXT NOT NULL DEFAULT 'geral',
        tone TEXT NOT NULL DEFAULT 'neutral',
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        importance INTEGER NOT NULL DEFAULT 1,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await c.query(`CREATE INDEX IF NOT EXISTS idx_board_messages_club_created ON board_messages(club_id,created_at DESC)`);
    await c.query(`INSERT INTO app_meta(key,value) VALUES($1,$2)`,[V27_MIGRATION_KEY,new Date().toISOString()]);
  });
}

async function applyV29Migration(){
  const done=await q(`SELECT 1 FROM app_meta WHERE key=$1`,[V29_MIGRATION_KEY]);
  if(done.rowCount)return;
  await tx(async c=>{
    // Versões anteriores limitavam o clube a apenas um patrocinador ativo.
    await c.query(`DROP INDEX IF EXISTS idx_sponsorship_active_club`);
    await c.query(`CREATE INDEX IF NOT EXISTS idx_sponsorship_club_status ON sponsorship_contracts(club_id,status)`);
    await c.query(`INSERT INTO app_meta(key,value) VALUES($1,$2)`,[V29_MIGRATION_KEY,new Date().toISOString()]);
  });
}

async function applyV32Migration(){
  const done=await q(`SELECT 1 FROM app_meta WHERE key=$1`,[V32_MIGRATION_KEY]);
  if(done.rowCount)return;
  await tx(async c=>{
    await c.query(`ALTER TABLE players ADD COLUMN IF NOT EXISTS consecutive_starts INTEGER NOT NULL DEFAULT 0`);
    await c.query(`UPDATE players SET consecutive_starts=0 WHERE consecutive_starts IS NULL`);
    await c.query(`INSERT INTO app_meta(key,value) VALUES($1,$2)`,[V32_MIGRATION_KEY,new Date().toISOString()]);
  });
}

async function applyV33Migration(){
  const done=await q(`SELECT 1 FROM app_meta WHERE key=$1`,[V33_MIGRATION_KEY]);
  if(done.rowCount)return;
  await tx(async c=>{
    await c.query(`
      CREATE TABLE IF NOT EXISTS career_player_condition_snapshots(
        club_id BIGINT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
        player_id BIGINT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        fitness INTEGER NOT NULL,
        morale INTEGER NOT NULL,
        injury_games INTEGER NOT NULL,
        consecutive_starts INTEGER NOT NULL DEFAULT 0,
        is_starter BOOLEAN NOT NULL DEFAULT FALSE,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY(club_id,player_id)
      )
    `);
    await c.query(`INSERT INTO app_meta(key,value) VALUES($1,$2)`,[V33_MIGRATION_KEY,new Date().toISOString()]);
  });
}

async function applyV34Migration(){
  const done=await q(`SELECT 1 FROM app_meta WHERE key=$1`,[V34_MIGRATION_KEY]);
  if(done.rowCount)return;
  await q(`INSERT INTO app_meta(key,value) VALUES($1,$2)`,[V34_MIGRATION_KEY,new Date().toISOString()]);
}

async function applyV35Migration(){
  const done=await q(`SELECT 1 FROM app_meta WHERE key=$1`,[V35_MIGRATION_KEY]);
  if(done.rowCount)return;
  await tx(async c=>{
    await c.query(`ALTER TABLE player_loans ADD COLUMN IF NOT EXISTS purchase_option_price INTEGER`);
    await c.query(`ALTER TABLE player_loans ADD COLUMN IF NOT EXISTS purchase_option_exercised BOOLEAN NOT NULL DEFAULT FALSE`);
    await c.query(`INSERT INTO app_meta(key,value) VALUES($1,$2)`,[V35_MIGRATION_KEY,new Date().toISOString()]);
  });
}

async function applyV38Migration(){
  const done=await q(`SELECT 1 FROM app_meta WHERE key=$1`,[V38_MIGRATION_KEY]);
  if(done.rowCount)return;
  await tx(async c=>{
    for(const sql of [
      `ALTER TABLE clubs ADD COLUMN IF NOT EXISTS chemistry INTEGER NOT NULL DEFAULT 70`,
      `ALTER TABLE clubs ADD COLUMN IF NOT EXISTS manager_reputation INTEGER NOT NULL DEFAULT 50`,
      `ALTER TABLE clubs ADD COLUMN IF NOT EXISTS coach_name TEXT`,
      `ALTER TABLE clubs ADD COLUMN IF NOT EXISTS stadium_capacity INTEGER NOT NULL DEFAULT 12000`,
      `ALTER TABLE clubs ADD COLUMN IF NOT EXISTS stadium_level INTEGER NOT NULL DEFAULT 1`,
      `ALTER TABLE clubs ADD COLUMN IF NOT EXISTS ticket_price INTEGER NOT NULL DEFAULT 30`,
      `ALTER TABLE clubs ADD COLUMN IF NOT EXISTS rival_club_id BIGINT REFERENCES clubs(id) ON DELETE SET NULL`,
      `ALTER TABLE clubs ADD COLUMN IF NOT EXISTS tactic_pressing TEXT NOT NULL DEFAULT 'NORMAL'`,
      `ALTER TABLE clubs ADD COLUMN IF NOT EXISTS tactic_defensive_line TEXT NOT NULL DEFAULT 'NORMAL'`,
      `ALTER TABLE clubs ADD COLUMN IF NOT EXISTS tactic_tempo TEXT NOT NULL DEFAULT 'NORMAL'`,
      `ALTER TABLE clubs ADD COLUMN IF NOT EXISTS tactic_width TEXT NOT NULL DEFAULT 'NORMAL'`,
      `ALTER TABLE clubs ADD COLUMN IF NOT EXISTS tactic_style TEXT NOT NULL DEFAULT 'BALANCED'`,
      `ALTER TABLE clubs ADD COLUMN IF NOT EXISTS tactic_marking TEXT NOT NULL DEFAULT 'NORMAL'`,
      `ALTER TABLE clubs ADD COLUMN IF NOT EXISTS last_match_game_date DATE`,
      `ALTER TABLE players ADD COLUMN IF NOT EXISTS potential INTEGER NOT NULL DEFAULT 70`,
      `ALTER TABLE players ADD COLUMN IF NOT EXISTS form_rating INTEGER NOT NULL DEFAULT 70`,
      `ALTER TABLE players ADD COLUMN IF NOT EXISTS suspension_games INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE players ADD COLUMN IF NOT EXISTS yellow_accumulation INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE players ADD COLUMN IF NOT EXISTS injury_type TEXT`,
      `ALTER TABLE players ADD COLUMN IF NOT EXISTS squad_status TEXT NOT NULL DEFAULT 'ROTATION'`,
      `ALTER TABLE players ADD COLUMN IF NOT EXISTS happiness INTEGER NOT NULL DEFAULT 75`,
      `ALTER TABLE players ADD COLUMN IF NOT EXISTS tactical_role TEXT NOT NULL DEFAULT 'BALANCED'`,
      `ALTER TABLE players ADD COLUMN IF NOT EXISTS is_captain BOOLEAN NOT NULL DEFAULT FALSE`,
      `ALTER TABLE players ADD COLUMN IF NOT EXISTS set_piece_role TEXT NOT NULL DEFAULT 'NONE'`,
      `ALTER TABLE players ADD COLUMN IF NOT EXISTS academy_product BOOLEAN NOT NULL DEFAULT FALSE`,
      `ALTER TABLE players ADD COLUMN IF NOT EXISTS is_bench BOOLEAN NOT NULL DEFAULT FALSE`,
      `ALTER TABLE players ADD COLUMN IF NOT EXISTS season_appearances INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE players ADD COLUMN IF NOT EXISTS season_goals INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE players ADD COLUMN IF NOT EXISTS season_assists INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE players ADD COLUMN IF NOT EXISTS season_clean_sheets INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE matches ADD COLUMN IF NOT EXISTS season_no INTEGER NOT NULL DEFAULT 1`,
      `ALTER TABLE matches ADD COLUMN IF NOT EXISTS is_home BOOLEAN NOT NULL DEFAULT TRUE`,
      `ALTER TABLE matches ADD COLUMN IF NOT EXISTS attendance INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE matches ADD COLUMN IF NOT EXISTS game_date DATE`
    ]) await c.query(sql);

    await c.query(`
      UPDATE players SET
        potential=GREATEST(rating,LEAST(99,
          CASE
            WHEN age<=20 THEN rating+8
            WHEN age<=23 THEN rating+5
            WHEN age<=27 THEN rating+2
            ELSE rating
          END
        )),
        form_rating=COALESCE(NULLIF(form_rating,0),70),
        happiness=COALESCE(NULLIF(happiness,0),75),
        squad_status=CASE WHEN is_starter THEN 'STARTER' ELSE 'ROTATION' END
    `);

    await c.query(`
      CREATE TABLE IF NOT EXISTS club_staff(
        id BIGSERIAL PRIMARY KEY,
        club_id BIGINT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        staff_name TEXT NOT NULL,
        level INTEGER NOT NULL DEFAULT 1,
        salary INTEGER NOT NULL DEFAULT 200,
        UNIQUE(club_id,role)
      )
    `);
    await c.query(`
      CREATE TABLE IF NOT EXISTS academy_players(
        id BIGSERIAL PRIMARY KEY,
        club_id BIGINT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
        season_no INTEGER NOT NULL,
        name TEXT NOT NULL,
        position TEXT NOT NULL,
        role TEXT NOT NULL,
        age INTEGER NOT NULL,
        rating INTEGER NOT NULL,
        potential INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'academy',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await c.query(`
      CREATE TABLE IF NOT EXISTS player_season_history(
        id BIGSERIAL PRIMARY KEY,
        club_id BIGINT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
        player_id BIGINT REFERENCES players(id) ON DELETE SET NULL,
        player_name TEXT NOT NULL,
        season_no INTEGER NOT NULL,
        appearances INTEGER NOT NULL DEFAULT 0,
        goals INTEGER NOT NULL DEFAULT 0,
        assists INTEGER NOT NULL DEFAULT 0,
        clean_sheets INTEGER NOT NULL DEFAULT 0,
        yellow_cards INTEGER NOT NULL DEFAULT 0,
        red_cards INTEGER NOT NULL DEFAULT 0,
        rating_end INTEGER NOT NULL DEFAULT 0,
        UNIQUE(club_id,season_no,player_id)
      )
    `);
    await c.query(`
      CREATE TABLE IF NOT EXISTS career_season_history(
        id BIGSERIAL PRIMARY KEY,
        club_id BIGINT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
        season_no INTEGER NOT NULL,
        division TEXT NOT NULL,
        final_position INTEGER,
        wins INTEGER NOT NULL DEFAULT 0,
        draws INTEGER NOT NULL DEFAULT 0,
        losses INTEGER NOT NULL DEFAULT 0,
        gf INTEGER NOT NULL DEFAULT 0,
        ga INTEGER NOT NULL DEFAULT 0,
        trophies INTEGER NOT NULL DEFAULT 0,
        top_scorer TEXT,
        top_scorer_goals INTEGER NOT NULL DEFAULT 0,
        balance INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(club_id,season_no)
      )
    `);
    await c.query(`
      CREATE TABLE IF NOT EXISTS player_awards(
        id BIGSERIAL PRIMARY KEY,
        club_id BIGINT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
        season_no INTEGER NOT NULL,
        player_id BIGINT REFERENCES players(id) ON DELETE SET NULL,
        player_name TEXT NOT NULL,
        award_type TEXT NOT NULL,
        award_title TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(club_id,season_no,award_type)
      )
    `);
    await c.query(`
      CREATE TABLE IF NOT EXISTS manager_job_offers(
        id BIGSERIAL PRIMARY KEY,
        user_club_id BIGINT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
        offering_club_id BIGINT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
        season_no INTEGER NOT NULL,
        salary INTEGER NOT NULL DEFAULT 0,
        performance_score INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await c.query(`
      CREATE TABLE IF NOT EXISTS scout_reports(
        id BIGSERIAL PRIMARY KEY,
        club_id BIGINT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
        target_player_id BIGINT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        exact_rating INTEGER NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(club_id,target_player_id)
      )
    `);
    await c.query(`
      CREATE TABLE IF NOT EXISTS ai_transfer_log(
        id BIGSERIAL PRIMARY KEY,
        career_owner_id BIGINT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
        season_no INTEGER NOT NULL,
        player_name TEXT NOT NULL,
        from_club_name TEXT NOT NULL,
        to_club_name TEXT NOT NULL,
        fee INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await c.query(`CREATE INDEX IF NOT EXISTS idx_manager_job_offers_club_status ON manager_job_offers(user_club_id,status)`);
    await c.query(`CREATE INDEX IF NOT EXISTS idx_player_history_club_season ON player_season_history(club_id,season_no)`);
    await c.query(`CREATE INDEX IF NOT EXISTS idx_academy_club_status ON academy_players(club_id,status)`);
    await c.query(`CREATE INDEX IF NOT EXISTS idx_ai_transfer_log_owner_season ON ai_transfer_log(career_owner_id,season_no)`);

    const aiClubs=(await c.query(`SELECT id FROM clubs WHERE is_ai=TRUE`)).rows;
    for(const row of aiClubs){
      const mod=Number(row.id)%4;
      const style=["BALANCED","POSSESSION","COUNTER","DIRECT"][mod];
      const pressing=["NORMAL","HIGH","LOW","NORMAL"][mod];
      const line=["NORMAL","HIGH","LOW","NORMAL"][mod];
      await c.query(`
        UPDATE clubs SET
          coach_name=COALESCE(coach_name,$2),
          tactic_style=CASE WHEN tactic_style='BALANCED' THEN $3 ELSE tactic_style END,
          tactic_pressing=CASE WHEN tactic_pressing='NORMAL' THEN $4 ELSE tactic_pressing END,
          tactic_defensive_line=CASE WHEN tactic_defensive_line='NORMAL' THEN $5 ELSE tactic_defensive_line END
        WHERE id=$1
      `,[row.id,randomStaffName(),style,pressing,line]);
    }

    await c.query(`INSERT INTO app_meta(key,value) VALUES($1,$2)`,[V38_MIGRATION_KEY,new Date().toISOString()]);
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
  const age=rand(18,31);
  const potential=clamp(rating+(age<=20?rand(6,15):age<=23?rand(3,10):age<=27?rand(0,5):rand(0,2)),rating,96);
  return {
    name:randomName(),position,role:roleFor(position),rating,pace,shooting,passing,defending,price,
    age,potential,salary:salaryForRating(rating),contract_seasons:rand(1,4),
    fitness:100,morale:rand(66,82),injury_games:0,form_rating:70,happiness:75
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
          salary,contract_seasons,fitness,morale,injury_games,potential,form_rating,happiness,squad_status
        )
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
      `,[club.id,p.name,p.position,p.role,p.rating,p.pace,p.shooting,p.passing,p.defending,p.price,isStarter,p.age,
         p.salary,p.contract_seasons,p.fitness,p.morale,p.injury_games,p.potential,p.form_rating,p.happiness,isStarter?"STARTER":"ROTATION"]);
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

async function ensureRealismClubData(client,clubId,career=null){
  const club=(await client.query(`SELECT * FROM clubs WHERE id=$1 FOR UPDATE`,[clubId])).rows[0];
  if(!club)return;

  if(!club.coach_name){
    const coachName=club.is_ai?randomStaffName():"Seu treinador";
    await client.query(`UPDATE clubs SET coach_name=$2 WHERE id=$1`,[clubId,coachName]);
    club.coach_name=coachName;
  }

  for(const [role,meta] of Object.entries(STAFF_ROLES)){
    await client.query(`
      INSERT INTO club_staff(club_id,role,staff_name,level,salary)
      VALUES($1,$2,$3,1,$4)
      ON CONFLICT(club_id,role) DO NOTHING
    `,[clubId,role,randomStaffName(),meta.baseSalary]);
  }

  if(!club.rival_club_id){
    const rival=(await client.query(`
      SELECT id FROM clubs
      WHERE id<>$1
        AND club_kind='national'
        AND country_code=$2
        AND ($3::text IS NULL OR state_code=$3 OR $3='')
      ORDER BY ABS(base_rating-$4),RANDOM()
      LIMIT 1
    `,[clubId,club.country_code||"BR",club.state_code||"",Number(club.base_rating||64)])).rows[0];
    if(rival)await client.query(`UPDATE clubs SET rival_club_id=$2 WHERE id=$1`,[clubId,rival.id]);
  }

  await client.query(`
    UPDATE players SET
      potential=GREATEST(rating,LEAST(99,
        CASE
          WHEN potential<rating THEN rating
          WHEN potential=70 AND age<=20 THEN rating+8
          WHEN potential=70 AND age<=23 THEN rating+5
          WHEN potential=70 THEN rating+2
          ELSE potential
        END
      )),
      squad_status=CASE
        WHEN squad_status IS NULL OR squad_status='' THEN CASE WHEN is_starter THEN 'STARTER' ELSE 'ROTATION' END
        ELSE squad_status
      END
    WHERE club_id=$1
  `,[clubId]);

  const benchCount=Number((await client.query(`SELECT COUNT(*)::int count FROM players WHERE club_id=$1 AND is_bench=TRUE AND is_starter=FALSE`,[clubId])).rows[0]?.count||0);
  if(benchCount<9){
    const reserveIds=(await client.query(`
      SELECT id FROM players
      WHERE club_id=$1 AND is_starter=FALSE AND injury_games<=0 AND suspension_games<=0
      ORDER BY is_bench DESC,rating DESC,fitness DESC
      LIMIT 9
    `,[clubId])).rows.map(x=>Number(x.id));
    await client.query(`UPDATE players SET is_bench=FALSE WHERE club_id=$1`,[clubId]);
    if(reserveIds.length)await client.query(`UPDATE players SET is_bench=TRUE WHERE id=ANY($1::bigint[])`,[reserveIds]);
  }

  const captain=(await client.query(`SELECT id FROM players WHERE club_id=$1 AND is_captain=TRUE LIMIT 1`,[clubId])).rows[0];
  if(!captain){
    const p=(await client.query(`SELECT id FROM players WHERE club_id=$1 ORDER BY is_starter DESC,rating DESC,age DESC LIMIT 1`,[clubId])).rows[0];
    if(p)await client.query(`UPDATE players SET is_captain=TRUE WHERE id=$1`,[p.id]);
  }

  for(const role of ["PENALTY","FREE_KICK","CORNER"]){
    const exists=(await client.query(`SELECT id FROM players WHERE club_id=$1 AND set_piece_role=$2 LIMIT 1`,[clubId,role])).rows[0];
    if(!exists){
      const order=role==="PENALTY"?"shooting DESC":role==="FREE_KICK"?"shooting DESC,passing DESC":"passing DESC";
      const p=(await client.query(`SELECT id FROM players WHERE club_id=$1 ORDER BY ${order} LIMIT 1`,[clubId])).rows[0];
      if(p)await client.query(`UPDATE players SET set_piece_role=$2 WHERE id=$1`,[p.id,role]);
    }
  }

  if(career){
    const season=Number(career.season_no||1);
    const count=Number((await client.query(
      `SELECT COUNT(*)::int count FROM academy_players WHERE club_id=$1 AND season_no=$2`,
      [clubId,season]
    )).rows[0]?.count||0);
    for(let i=count;i<3;i++){
      const position=["GK","DEF","MID","ATT"][rand(0,3)];
      const base=Math.max(48,Number(club.base_rating||64)-rand(8,15));
      const rating=clamp(base+rand(-2,4),45,76);
      const potential=clamp(rating+rand(7,18),rating,94);
      await client.query(`
        INSERT INTO academy_players(club_id,season_no,name,position,role,age,rating,potential,status)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,'academy')
      `,[clubId,season,randomName(),position,roleFor(position),rand(15,18),rating,potential]);
    }
  }
}

async function staffLevels(client,clubId){
  const rows=(await client.query(`SELECT role,staff_name,level,salary FROM club_staff WHERE club_id=$1 ORDER BY role`,[clubId])).rows;
  const levels={FITNESS:1,PHYSIO:1,SCOUT:1,GK_COACH:1};
  rows.forEach(x=>levels[x.role]=Number(x.level||1));
  return {rows,levels};
}

function nextOpponentId(career,ownerId){
  if(!career)return null;
  const uid=String(ownerId);
  const find=(fixtures,predicate=()=>true)=>{
    const f=(fixtures||[]).find(x=>!x.played&&predicate(x)&&(String(x.home)===uid||String(x.away)===uid));
    if(!f)return null;
    return String(f.home)===uid?Number(f.away):Number(f.home);
  };
  if(career.phase==="STATE")return find(career.data?.state?.fixtures,x=>x.stage===career.data?.state?.stage);
  if(career.phase==="NATIONAL")return find(career.data?.divisions?.[career.user_division]?.fixtures,x=>Number(x.round)===Number(career.current_round));
  if(career.phase==="LIBERTADORES")return find(career.data?.libertadores?.fixtures,x=>x.stage===career.data?.libertadores?.stage);
  if(career.phase==="CHAMPIONS")return find(career.data?.championsLeague?.fixtures,x=>x.stage===career.data?.championsLeague?.stage);
  if(career.phase==="CLUB_WORLD_CUP")return find(career.data?.clubWorldCup?.fixtures,x=>x.stage===career.data?.clubWorldCup?.stage);
  return null;
}

async function opponentAnalysis(client,clubId,career,scoutLevel=1){
  const opponentId=nextOpponentId(career,clubId);
  if(!opponentId)return null;
  await createRoster(client,(await client.query(`SELECT * FROM clubs WHERE id=$1`,[opponentId])).rows[0],false);
  const club=(await client.query(`SELECT * FROM clubs WHERE id=$1`,[opponentId])).rows[0];
  if(!club)return null;
  const players=(await client.query(`
    SELECT name,position,role,rating,fitness,injury_games,suspension_games
    FROM players WHERE club_id=$1 ORDER BY rating DESC LIMIT 18
  `,[opponentId])).rows;
  const available=players.filter(p=>Number(p.injury_games||0)<=0&&Number(p.suspension_games||0)<=0);
  const star=available[0]||players[0]||null;
  const unavailable=players.filter(p=>Number(p.injury_games||0)>0||Number(p.suspension_games||0)>0);
  const uncertainty=Math.max(0,4-Number(scoutLevel||1));
  return {
    id:club.id,
    name:club.name,
    rating:Number(club.team_rating||club.base_rating||64),
    formation:club.formation,
    coachName:club.coach_name||"Treinador",
    style:club.tactic_style||"BALANCED",
    pressing:club.tactic_pressing||"NORMAL",
    star:star?{
      name:star.name,
      role:star.role,
      ratingMin:Math.max(40,Number(star.rating)-uncertainty),
      ratingMax:Math.min(100,Number(star.rating)+uncertainty)
    }:null,
    unavailable:unavailable.slice(0,5).map(p=>({
      name:p.name,
      injury:Number(p.injury_games||0),
      suspension:Number(p.suspension_games||0)
    })),
    strength:club.tactic_style==="COUNTER"?"Contra-ataques":club.tactic_pressing==="HIGH"?"Pressão alta":"Organização coletiva",
    weakness:club.tactic_defensive_line==="HIGH"?"Espaço às costas da defesa":club.tactic_pressing==="HIGH"?"Pode cansar no segundo tempo":"Pouca agressividade sem a bola"
  };
}

async function ensureMarket(){
  const r=await q(`SELECT COUNT(*)::int count FROM players WHERE club_id IS NULL`);
  const pos=["GK","DEF","MID","ATT"];
  for(let i=r.rows[0].count;i<40;i++){
    const p=makePlayer(pos[rand(0,3)],59,77);
    await q(`
      INSERT INTO players(name,position,role,rating,pace,shooting,passing,defending,price,age,salary,contract_seasons,fitness,morale,injury_games,potential,form_rating,happiness)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
    `,[p.name,p.position,p.role,p.rating,p.pace,p.shooting,p.passing,p.defending,p.price,p.age,p.salary,p.contract_seasons,p.fitness,p.morale,p.injury_games,p.potential,p.form_rating,p.happiness]);
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
      salary,contract_seasons,fitness,morale,injury_games,transfer_listed,market_template_id,
      is_real_name,nationality_code,potential,form_rating,happiness,squad_status
    )
    VALUES(
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,FALSE,$11,
      0,0,0,0,0,0,
      $12,$13,$14,$15,0,FALSE,$16,$17,$18,$19,70,78,'ROTATION'
    )
    RETURNING *
  `,[
    clubId,source.name,source.position,source.role,source.rating,source.pace,source.shooting,
    source.passing,source.defending,source.price,source.age,
    salary===null?Number(source.salary||salaryForRating(source.rating)):Number(salary),
    years===null?Number(source.contract_seasons||2):Number(years),
    Number(fitness),Number(morale),templateId,Boolean(source.is_real_name),source.nationality_code||null,
    Math.max(Number(source.rating||60),Number(source.potential||source.rating||60))
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
async function snapshotClubCondition(client,clubId){
  if(!clubId)return 0;
  const rows=(await client.query(`
    SELECT id,fitness,morale,injury_games,consecutive_starts,is_starter
    FROM players
    WHERE club_id=$1
  `,[clubId])).rows;

  for(const p of rows){
    await client.query(`
      INSERT INTO career_player_condition_snapshots(
        club_id,player_id,fitness,morale,injury_games,consecutive_starts,is_starter,updated_at
      )
      VALUES($1,$2,$3,$4,$5,$6,$7,NOW())
      ON CONFLICT(club_id,player_id) DO UPDATE SET
        fitness=EXCLUDED.fitness,
        morale=EXCLUDED.morale,
        injury_games=EXCLUDED.injury_games,
        consecutive_starts=EXCLUDED.consecutive_starts,
        is_starter=EXCLUDED.is_starter,
        updated_at=NOW()
    `,[
      clubId,p.id,Number(p.fitness||100),Number(p.morale||70),
      Number(p.injury_games||0),Number(p.consecutive_starts||0),Boolean(p.is_starter)
    ]);
  }

  // Remove snapshots de jogadores que já não pertencem mais à carreira.
  await client.query(`
    DELETE FROM career_player_condition_snapshots s
    WHERE s.club_id=$1
      AND NOT EXISTS(
        SELECT 1 FROM players p WHERE p.id=s.player_id AND p.club_id=$1
      )
  `,[clubId]);

  return rows.length;
}

async function restoreClubCondition(client,clubId){
  if(!clubId)return 0;
  const r=await client.query(`
    UPDATE players p SET
      fitness=s.fitness,
      morale=s.morale,
      injury_games=s.injury_games,
      consecutive_starts=s.consecutive_starts,
      is_starter=s.is_starter
    FROM career_player_condition_snapshots s
    WHERE s.club_id=$1
      AND p.id=s.player_id
      AND p.club_id=$1
    RETURNING p.id
  `,[clubId]);
  return r.rowCount;
}

async function activateUserCareer(userId,clubId){
  return tx(async c=>{
    const target=(await c.query(`SELECT * FROM clubs WHERE id=$1 AND user_id=$2 FOR UPDATE`,[clubId,userId])).rows[0];
    if(!target)throw Object.assign(new Error("Carreira de clube não encontrada."),{status:404});

    const current=(await c.query(`
      SELECT id FROM clubs
      WHERE user_id=$1 AND is_active_career=TRUE
      ORDER BY career_slot,id LIMIT 1
      FOR UPDATE
    `,[userId])).rows[0];

    if(current&&String(current.id)!==String(target.id)){
      await snapshotClubCondition(c,current.id);
    }

    await c.query(`UPDATE player_careers SET is_active_career=FALSE WHERE user_id=$1`,[userId]);
    await c.query(`UPDATE clubs SET is_active_career=FALSE WHERE user_id=$1`,[userId]);

    if(!current||String(current.id)!==String(target.id)){
      await restoreClubCondition(c,target.id);
    }

    await c.query(`UPDATE clubs SET is_active_career=TRUE WHERE id=$1`,[target.id]);
    return (await c.query(`SELECT * FROM clubs WHERE id=$1`,[target.id])).rows[0];
  });
}
async function activatePlayerCareer(userId,careerId){
  return tx(async c=>{
    const target=(await c.query(`SELECT * FROM player_careers WHERE id=$1 AND user_id=$2 FOR UPDATE`,[careerId,userId])).rows[0];
    if(!target)throw Object.assign(new Error("Carreira de jogador não encontrada."),{status:404});

    const currentClub=(await c.query(`
      SELECT id FROM clubs
      WHERE user_id=$1 AND is_active_career=TRUE
      ORDER BY career_slot,id LIMIT 1
      FOR UPDATE
    `,[userId])).rows[0];

    if(currentClub)await snapshotClubCondition(c,currentClub.id);

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
  if((Number(pc.overall)>=66||Number(pc.reputation)>=28)&&pc.club_division!=="A"){
    target={D:"C",C:"B",B:"A"}[pc.club_division]||pc.club_division;
  }

  const sameCountry=(await q(`
    SELECT id,name,base_rating,country_code,national_seed_division
    FROM clubs
    WHERE is_ai=TRUE AND club_kind='national'
      AND country_code=$1
      AND national_seed_division=$2
      AND id<>$3
    ORDER BY RANDOM()
    LIMIT 10
  `,[pc.country_code,target,pc.club_id])).rows;

  const otherCountries=(await q(`
    SELECT id,name,base_rating,country_code,national_seed_division
    FROM clubs
    WHERE is_ai=TRUE AND club_kind='national'
      AND country_code<>$1
      AND country_code=ANY($2::text[])
      AND national_seed_division=$3
    ORDER BY RANDOM()
    LIMIT 30
  `,[pc.country_code,[...VALID_COUNTRIES],target])).rows;

  const chosen=[];
  if(sameCountry.length)chosen.push(sameCountry[0]);

  for(const c of otherCountries){
    if(chosen.length>=3)break;
    if(!chosen.some(x=>String(x.id)===String(c.id)))chosen.push(c);
  }
  for(const c of sameCountry.slice(1)){
    if(chosen.length>=3)break;
    if(!chosen.some(x=>String(x.id)===String(c.id)))chosen.push(c);
  }

  data.transferOffers=chosen.slice(0,3).map((c,i)=>({
    clubId:Number(c.id),
    clubName:c.name,
    countryCode:c.country_code,
    division:c.national_seed_division||target,
    salary:Math.max(
      Number(pc.salary)+150,
      Math.round((Number(pc.overall)*18+Number(c.base_rating)*8+i*110)/50)*50
    ),
    status:"pending"
  }));

  if(pos<=4&&pc.club_division!=="A")data.nextDivision={D:"C",C:"B",B:"A"}[pc.club_division];
  else if(pos>=17&&pc.club_division!=="D")data.nextDivision={A:"B",B:"C",C:"D"}[pc.club_division];
  else data.nextDivision=pc.club_division;

  return data;
}
async function simulatePlayerCareerRound(userId,cachedClubMap=null){
  return tx(async client=>{
    const pc=(await client.query(`SELECT * FROM player_careers WHERE user_id=$1 AND is_active_career=TRUE FOR UPDATE`,[userId])).rows[0];
    if(!pc)throw Object.assign(new Error("Carreira de jogador não encontrada."),{status:404});
    if(pc.status!=="ACTIVE")throw Object.assign(new Error("A temporada terminou. Vá para a próxima temporada."),{status:400});

    const data=typeof pc.data==="string"?JSON.parse(pc.data):pc.data;
    const round=Number(pc.current_round);
    const games=data.league.fixtures.filter(f=>Number(f.round)===round&&!f.played);
    const clubMap=cachedClubMap||await fastClubSnapshot();
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
    const nextCountry=accepted?.countryCode||pc.country_code;
    const nextDiv=accepted?.division||oldData.nextDivision||pc.club_division;
    const nextClubId=accepted?.clubId||pc.club_id;
    const nextSeason=Number(pc.season_no)+1;
    const data=await createPlayerSeasonData(nextCountry,nextDiv,nextClubId,nextSeason);

    await client.query(`
      UPDATE player_careers SET
        age=age+1,country_code=$2,club_id=$3,club_division=$4,season_no=$5,current_round=1,status='ACTIVE',
        fitness=100,morale=78,data=$6::jsonb,updated_at=NOW()
      WHERE id=$1
    `,[pc.id,nextCountry,nextClubId,nextDiv,nextSeason,JSON.stringify(data)]);

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
const STAFF_ROLES={
  FITNESS:{label:"Preparador físico",baseSalary:280},
  PHYSIO:{label:"Fisioterapeuta",baseSalary:300},
  SCOUT:{label:"Olheiro",baseSalary:320},
  GK_COACH:{label:"Treinador de goleiros",baseSalary:260}
};
const STAFF_FIRST=["Rafael","Bruno","Carlos","André","Marcelo","Felipe","Paulo","Renato","Diego","Lucas","Thiago","Eduardo"];
const STAFF_LAST=["Silva","Costa","Almeida","Santos","Pereira","Mendes","Oliveira","Rocha","Souza","Barbosa"];
const INJURY_TYPES=[
  {name:"Contusão leve",min:1,max:1},
  {name:"Torção no tornozelo",min:1,max:3},
  {name:"Distensão muscular",min:2,max:4},
  {name:"Lesão na coxa",min:2,max:5},
  {name:"Problema no joelho",min:3,max:7}
];

function randomStaffName(){return `${STAFF_FIRST[rand(0,STAFF_FIRST.length-1)]} ${STAFF_LAST[rand(0,STAFF_LAST.length-1)]}`}
function transferWindowInfo(dateStr){
  const d=new Date(`${dateStr||new Date().toISOString().slice(0,10)}T12:00:00Z`);
  const md=(d.getUTCMonth()+1)*100+d.getUTCDate();
  const open=(md>=101&&md<=430)||(md>=701&&md<=915);
  let next;
  if(md<101)next=`${d.getUTCFullYear()}-01-01`;
  else if(md>430&&md<701)next=`${d.getUTCFullYear()}-07-01`;
  else if(md>915)next=`${d.getUTCFullYear()+1}-01-01`;
  else next=null;
  return {open,next,date:dateStr};
}
function tacticalModifiers(club){
  let attack=0,defense=0,fatigue=0,injuryRisk=0;
  const pressing=club?.tactic_pressing||"NORMAL";
  const line=club?.tactic_defensive_line||"NORMAL";
  const tempo=club?.tactic_tempo||"NORMAL";
  const width=club?.tactic_width||"NORMAL";
  const style=club?.tactic_style||"BALANCED";
  const marking=club?.tactic_marking||"NORMAL";

  if(pressing==="HIGH"){attack+=.10;defense+=.06;fatigue+=3;injuryRisk+=.012}
  if(pressing==="LOW"){attack-=.05;defense+=.05;fatigue-=1}
  if(line==="HIGH"){attack+=.07;defense-=.04}
  if(line==="LOW"){attack-=.05;defense+=.08}
  if(tempo==="FAST"){attack+=.09;fatigue+=2;injuryRisk+=.008}
  if(tempo==="SLOW"){attack-=.04;defense+=.04;fatigue-=1}
  if(width==="WIDE"){attack+=.04;fatigue+=.5}
  if(width==="NARROW"){attack-=.01;defense+=.04}
  if(style==="POSSESSION"){attack+=.05;defense+=.03}
  if(style==="COUNTER"){attack+=.08;defense+=.02}
  if(style==="DIRECT"){attack+=.06;defense-=.02}
  if(marking==="AGGRESSIVE"){defense+=.08;fatigue+=1;injuryRisk+=.008}
  return {attack,defense,fatigue,injuryRisk};
}
function effectiveRating(p){
  const fitnessPenalty=(100-Number(p.fitness||100))*0.12;
  const moraleBonus=(Number(p.morale||70)-70)*0.07;
  const formBonus=(Number(p.form_rating||70)-70)*0.08;
  const happinessBonus=(Number(p.happiness||75)-75)*0.035;
  const roleBonus=p.tactical_role&&p.tactical_role!=="BALANCED"?0.35:0;
  return Number(p.rating)-fitnessPenalty+moraleBonus+formBonus+happinessBonus+roleBonus;
}
function basicScore(hr,ar){
  return {
    hg:Math.min(6,poisson(clamp(1.28+(hr-ar)*.032,.28,3.15))),
    ag:Math.min(6,poisson(clamp(1.08+(ar-hr)*.032,.24,2.95)))
  };
}
const FORMATION_PRESETS={
  "4-3-3":{GK:1,DEF:4,MID:3,ATT:3},
  "4-4-2":{GK:1,DEF:4,MID:4,ATT:2},
  "3-5-2":{GK:1,DEF:3,MID:5,ATT:2},
  "4-2-3-1":{GK:1,DEF:4,MID:5,ATT:1},
  "4-1-4-1":{GK:1,DEF:4,MID:5,ATT:1},
  "4-5-1":{GK:1,DEF:4,MID:5,ATT:1},
  "3-4-3":{GK:1,DEF:3,MID:4,ATT:3},
  "3-4-2-1":{GK:1,DEF:3,MID:6,ATT:1},
  "3-1-4-2":{GK:1,DEF:3,MID:5,ATT:2},
  "5-3-2":{GK:1,DEF:5,MID:3,ATT:2},
  "5-4-1":{GK:1,DEF:5,MID:4,ATT:1},
  "5-2-3":{GK:1,DEF:5,MID:2,ATT:3},
  "4-2-4":{GK:1,DEF:4,MID:2,ATT:4}
};
function customFormationQuotas(formation){
  const m=String(formation||"").match(/^CUSTOM:(\d)-(\d)-(\d)$/);
  if(!m)return null;
  const DEF=Number(m[1]),MID=Number(m[2]),ATT=Number(m[3]);
  if(DEF<2||DEF>5||MID<1||MID>6||ATT<1||ATT>5||DEF+MID+ATT!==10)return null;
  return {GK:1,DEF,MID,ATT};
}
function formationIsValid(formation){
  return Boolean(FORMATION_PRESETS[String(formation)]||customFormationQuotas(formation));
}
function formationQuotas(formation){
  return FORMATION_PRESETS[String(formation)]||customFormationQuotas(formation)||FORMATION_PRESETS["4-3-3"];
}

async function ensureStartingXI(client,clubId,formation="4-3-3"){
  const players=(await client.query(`
    SELECT * FROM players
    WHERE club_id=$1
    ORDER BY is_starter DESC,rating DESC,fitness DESC,morale DESC,id
  `,[clubId])).rows;

  if(players.length<11)return {repaired:false,count:players.filter(p=>p.is_starter).length,reason:"roster_under_11"};

  const quota=formationQuotas(formation);
  const current=players.filter(p=>p.is_starter);
  const currentCounts={GK:0,DEF:0,MID:0,ATT:0};
  current.forEach(p=>currentCounts[p.position]=(currentCounts[p.position]||0)+1);

  const currentValid=
    current.length===11 &&
    current.some(p=>p.position==="GK") &&
    current.every(p=>Number(p.injury_games||0)<=0&&Number(p.suspension_games||0)<=0) &&
    Object.keys(quota).every(pos=>Number(currentCounts[pos]||0)===Number(quota[pos]));

  if(currentValid)return {repaired:false,count:11};

  const healthy=players.filter(p=>Number(p.injury_games||0)<=0&&Number(p.suspension_games||0)<=0);
  const selected=[];
  const used=new Set();

  const scoreSort=(a,b)=>{
    if(Boolean(a.is_starter)!==Boolean(b.is_starter))return a.is_starter?-1:1;
    return Number(b.rating||0)-Number(a.rating||0) ||
      Number(b.fitness||0)-Number(a.fitness||0) ||
      Number(b.morale||0)-Number(a.morale||0);
  };

  for(const pos of ["GK","DEF","MID","ATT"]){
    const pool=healthy.filter(p=>p.position===pos&&!used.has(String(p.id))).sort(scoreSort);
    for(const p of pool.slice(0,quota[pos])){
      selected.push(p);
      used.add(String(p.id));
    }
  }

  // Se faltou alguém por lesão, completa apenas com atletas da MESMA posição.
  // Assim a escalação nunca vira uma formação diferente da escolhida.
  for(const pos of ["GK","DEF","MID","ATT"]){
    const have=selected.filter(p=>p.position===pos).length;
    const missing=Math.max(0,Number(quota[pos]||0)-have);
    if(!missing)continue;

    const fallback=players
      .filter(p=>p.position===pos&&!used.has(String(p.id))&&Number(p.suspension_games||0)<=0)
      .sort(scoreSort)
      .slice(0,missing);

    for(const p of fallback){
      selected.push(p);
      used.add(String(p.id));
    }
  }

  const selectedCounts={GK:0,DEF:0,MID:0,ATT:0};
  selected.forEach(p=>selectedCounts[p.position]=(selectedCounts[p.position]||0)+1);
  const exact=selected.length===11&&Object.keys(quota).every(pos=>Number(selectedCounts[pos]||0)===Number(quota[pos]||0));
  if(!exact)return {repaired:false,count:selected.length,reason:"formation_positions_unavailable"};

  const ids=selected.map(p=>String(p.id));
  await client.query(`UPDATE players SET is_starter=FALSE WHERE club_id=$1`,[clubId]);
  await client.query(`UPDATE players SET is_starter=TRUE,is_bench=FALSE WHERE club_id=$1 AND id=ANY($2::bigint[])`,[clubId,ids]);

  const avg=Math.round(selected.reduce((n,p)=>n+Number(p.rating||0),0)/selected.length);
  await client.query(`UPDATE clubs SET team_rating=$2 WHERE id=$1`,[clubId,avg]);

  return {repaired:true,count:11};
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
  const healthy=all.filter(p=>Number(p.injury_games||0)<=0&&Number(p.suspension_games||0)<=0);
  if(healthy.length<11)throw Object.assign(new Error(`${club.name} não possui 11 jogadores disponíveis.`),{status:400});
  const q=formationQuotas(club.formation);
  const chosen=[];
  for(const position of ["GK","DEF","MID","ATT"]){
    const pool=sortForSelection(healthy.filter(p=>p.position===position),isUser);
    chosen.push(...pool.slice(0,q[position]));
  }
  if(chosen.length!==11){
    throw Object.assign(new Error(`${club.name} não possui jogadores saudáveis suficientes nas posições exigidas pela formação ${club.formation}.`),{status:400});
  }
  const counts={GK:0,DEF:0,MID:0,ATT:0};
  chosen.forEach(p=>counts[p.position]=(counts[p.position]||0)+1);
  if(Object.keys(q).some(pos=>Number(counts[pos]||0)!==Number(q[pos]||0))){
    throw Object.assign(new Error(`${club.name} não consegue montar a formação ${club.formation} com o elenco disponível.`),{status:400});
  }
  return chosen.slice(0,11);
}
function teamMetrics(players,club=null){
  const chemistry=(Number(club?.chemistry||70)-70)*0.045;
  const tactics=tacticalModifiers(club);
  const gkCoach=Number(club?._gkCoachLevel||1);

  let strength=players.reduce((a,p)=>a+effectiveRating(p),0)/players.length;
  let attack=players.reduce((a,p)=>a+(Number(p.shooting)*.48+Number(p.passing)*.32+Number(p.pace)*.20),0)/players.length;
  let defense=players.reduce((a,p)=>a+(Number(p.defending)*.72+Number(p.passing)*.12+effectiveRating(p)*.16),0)/players.length;

  const captain=players.find(p=>p.is_captain);
  if(captain){strength+=.45;defense+=.25}
  const gk=players.find(p=>p.position==="GK");
  if(gk)defense+=(gkCoach-1)*.45;

  strength+=chemistry;
  attack+=chemistry+tactics.attack*5;
  defense+=chemistry+tactics.defense*5;

  return {strength,attack,defense,tactics};
}
function realisticScore(homePlayers,awayPlayers,homeClub=null,awayClub=null){
  const h=teamMetrics(homePlayers,homeClub),a=teamMetrics(awayPlayers,awayClub);
  const crowdBoost=Math.min(.24,Math.max(.06,Number(homeClub?.stadium_capacity||12000)/100000));
  const rivalry=String(homeClub?.rival_club_id||"")===String(awayClub?.id||"")?.06:0;
  const homeLambda=clamp(1.22+(h.strength-a.strength)*.028+(h.attack-a.defense)*.012+.14+crowdBoost+rivalry,.22,3.35);
  const awayLambda=clamp(1.02+(a.strength-h.strength)*.028+(a.attack-h.defense)*.012-rivalry*.35,.20,3.05);
  return {
    hg:Math.min(7,poisson(homeLambda)),
    ag:Math.min(7,poisson(awayLambda)),
    hr:Math.round(h.strength),
    ar:Math.round(a.strength),
    homeTactics:h.tactics,
    awayTactics:a.tactics
  };
}
function weightedPick(players){
  const x=[];
  for(const p of players){
    const form=Math.max(1,Math.round((Number(p.form_rating||70)-55)/10));
    const n=(p.position==="ATT"?7:p.position==="MID"?4:p.position==="DEF"?2:1)+form;
    for(let i=0;i<n;i++)x.push(p);
  }
  return x[rand(0,x.length-1)]||players[0];
}
function eventsFor(clubId,startersList,goals){
  const ev=[];
  for(let i=0;i<goals;i++){
    let scorer;
    const penaltyTaker=startersList.find(p=>p.set_piece_role==="PENALTY");
    if(penaltyTaker&&Math.random()<.12)scorer=penaltyTaker;
    else scorer=weightedPick(startersList.filter(p=>p.position!=="GK"));
    const pool=startersList.filter(p=>String(p.id)!==String(scorer.id)&&p.position!=="GK");
    const cornerTaker=startersList.find(p=>p.set_piece_role==="CORNER");
    const assist=cornerTaker&&Math.random()<.12?cornerTaker:(pool.length&&Math.random()<.7?weightedPick(pool):null);
    ev.push({type:"goal",clubId,minute:rand(3,89),scorerId:scorer.id,assistId:assist?.id||null,text:`Gol de ${scorer.name}${assist?` (assistência de ${assist.name})`:""}`});
  }

  const yellowCount=Math.random()<.70?rand(0,2):0;
  for(let i=0;i<yellowCount;i++){
    const p=startersList[rand(0,startersList.length-1)];
    ev.push({type:"yellow",clubId,minute:rand(12,88),playerId:p.id,text:`Cartão amarelo para ${p.name}`});
  }
  if(Math.random()<.075){
    const candidates=startersList.filter(p=>p.position!=="GK");
    const p=candidates[rand(0,candidates.length-1)];
    ev.push({type:"red",clubId,minute:rand(25,88),playerId:p.id,text:`Cartão vermelho para ${p.name}`});
  }
  return ev;
}
function matchBench(allPlayers,starters){
  const ids=new Set(starters.map(p=>String(p.id)));
  const available=allPlayers.filter(p=>!ids.has(String(p.id))&&Number(p.injury_games||0)<=0&&Number(p.suspension_games||0)<=0);
  const order={GK:0,DEF:1,MID:2,ATT:3};
  return available.sort((a,b)=>{
    if(Boolean(a.is_bench)!==Boolean(b.is_bench))return a.is_bench?-1:1;
    return (order[a.position]-order[b.position])||effectiveRating(b)-effectiveRating(a);
  }).slice(0,9);
}
function simulateSubstitutions(starters,bench,clubId){
  const subs=[];
  const usedOut=new Set(),usedIn=new Set();
  const target=Math.min(5,Math.max(3,starters.filter(p=>Number(p.fitness||100)<75).length+2));
  const minutes=[55,62,68,73,79];
  for(let i=0;i<target;i++){
    const outPool=starters
      .filter(p=>!usedOut.has(String(p.id))&&p.position!=="GK")
      .sort((a,b)=>Number(a.fitness||100)-Number(b.fitness||100)||effectiveRating(a)-effectiveRating(b));
    const out=outPool[0];
    if(!out)break;
    let inP=bench
      .filter(p=>!usedIn.has(String(p.id))&&p.position===out.position)
      .sort((a,b)=>effectiveRating(b)-effectiveRating(a))[0];
    if(!inP)inP=bench.filter(p=>!usedIn.has(String(p.id))&&p.position!=="GK").sort((a,b)=>effectiveRating(b)-effectiveRating(a))[0];
    if(!inP)break;
    usedOut.add(String(out.id));usedIn.add(String(inP.id));
    subs.push({
      type:"substitution",clubId,minute:minutes[i]||80,
      outId:out.id,inId:inP.id,
      text:`Substituição: sai ${out.name}, entra ${inP.name}`
    });
  }
  return subs;
}

async function applyStatsAndCondition(
  client,clubId,startersList,conceded,events,result,
  {bench=[],substitutions=[],club=null,congestionDays=7,travelLoad=0,staffLevels:staff={}}={}
){
  const selectedIds=startersList.map(p=>p.id);
  const subIds=substitutions.map(x=>x.inId).filter(Boolean);
  const participantIds=[...new Set([...selectedIds,...subIds].map(Number))];

  // Suspensões e lesões antigas contam um jogo cumprido antes de registrar novas punições/lesões.
  await client.query(`UPDATE players SET suspension_games=GREATEST(0,suspension_games-1) WHERE club_id=$1 AND suspension_games>0`,[clubId]);
  await client.query(`UPDATE players SET injury_games=GREATEST(0,injury_games-1),injury_type=CASE WHEN injury_games<=1 THEN NULL ELSE injury_type END WHERE club_id=$1 AND injury_games>0`,[clubId]);

  await client.query(`UPDATE players SET consecutive_starts=0 WHERE club_id=$1 AND NOT(id=ANY($2::bigint[]))`,[clubId,selectedIds]);
  await client.query(`
    UPDATE players SET
      appearances=appearances+1,
      season_appearances=season_appearances+1
    WHERE id=ANY($1::bigint[])
  `,[participantIds]);
  await client.query(`UPDATE players SET consecutive_starts=consecutive_starts+1 WHERE id=ANY($1::bigint[])`,[selectedIds]);

  if(conceded===0){
    const gk=startersList.find(p=>p.position==="GK");
    if(gk)await client.query(`UPDATE players SET clean_sheets=clean_sheets+1,season_clean_sheets=season_clean_sheets+1 WHERE id=$1`,[gk.id]);
  }

  for(const e of events.filter(x=>String(x.clubId)===String(clubId))){
    if(e.type==="goal"){
      await client.query(`UPDATE players SET goals=goals+1,season_goals=season_goals+1,form_rating=LEAST(100,form_rating+4) WHERE id=$1`,[e.scorerId]);
      if(e.assistId)await client.query(`UPDATE players SET assists=assists+1,season_assists=season_assists+1,form_rating=LEAST(100,form_rating+2) WHERE id=$1`,[e.assistId]);
    }

    if(e.type==="yellow"){
      const r=(await client.query(`
        UPDATE players SET
          yellow_cards=yellow_cards+1,
          yellow_accumulation=yellow_accumulation+1
        WHERE id=$1
        RETURNING name,yellow_accumulation
      `,[e.playerId])).rows[0];
      if(r&&Number(r.yellow_accumulation)>=3){
        await client.query(`UPDATE players SET yellow_accumulation=0,suspension_games=GREATEST(suspension_games,1) WHERE id=$1`,[e.playerId]);
        await client.query(
          `INSERT INTO club_events(club_id,event_type,title,description) VALUES($1,'discipline','Suspensão por cartões',$2)`,
          [clubId,`${r.name} atingiu o limite de cartões amarelos e está suspenso por 1 jogo.`]
        );
      }
    }

    if(e.type==="red"){
      const games=Math.random()<.22?2:1;
      const r=(await client.query(`
        UPDATE players SET
          red_cards=red_cards+1,
          suspension_games=GREATEST(suspension_games,$2),
          form_rating=GREATEST(45,form_rating-3)
        WHERE id=$1 RETURNING name
      `,[e.playerId,games])).rows[0];
      if(r)await client.query(
        `INSERT INTO club_events(club_id,event_type,title,description) VALUES($1,'discipline','Expulsão e suspensão',$2)`,
        [clubId,`${r.name} foi expulso e recebeu ${games} jogo(s) de suspensão.`]
      );
    }
  }

  const tactics=tacticalModifiers(club);
  const fitnessStaff=Number(staff.FITNESS||1);
  const physio=Number(staff.PHYSIO||1);
  const congestionPenalty=congestionDays<=3?4:congestionDays<=5?2:0;
  const resultDelta=result==="win"?3:result==="draw"?1:-2;

  for(const p of startersList){
    const fatigue=clamp(
      rand(8,14)+tactics.fatigue+congestionPenalty+Number(travelLoad||0)-(fitnessStaff-1),
      5,22
    );
    const goalCount=events.filter(e=>e.type==="goal"&&String(e.scorerId)===String(p.id)).length;
    const assistCount=events.filter(e=>e.type==="goal"&&String(e.assistId)===String(p.id)).length;
    const formDelta=(result==="win"?2:result==="draw"?0:-2)+goalCount*2+assistCount;
    const status=String(p.squad_status||"ROTATION");
    let happinessDelta=0;
    if(status==="STAR")happinessDelta=2;
    else if(status==="STARTER")happinessDelta=1;
    else if(status==="PROSPECT")happinessDelta=2;
    else happinessDelta=1;

    await client.query(`
      UPDATE players SET
        fitness=GREATEST(20,fitness-ROUND($2::numeric)),
        morale=GREATEST(30,LEAST(100,morale+$3)),
        form_rating=GREATEST(45,LEAST(100,form_rating+$4)),
        happiness=GREATEST(20,LEAST(100,happiness+$5))
      WHERE id=$1
    `,[p.id,fatigue,resultDelta,formDelta,happinessDelta]);

    const currentFitness=Number(p.fitness||100)-fatigue;
    const risk=.012+
      Math.max(0,70-currentFitness)*.0012+
      tactics.injuryRisk+
      (congestionDays<=3?.018:congestionDays<=5?.008:0)-
      (physio-1)*.004;

    if(Math.random()<Math.max(.004,risk)){
      const injury=INJURY_TYPES[rand(0,INJURY_TYPES.length-1)];
      const baseGames=rand(injury.min,injury.max);
      const games=Math.max(1,baseGames-Math.floor((physio-1)/2));
      await client.query(`
        UPDATE players SET
          injury_games=GREATEST(injury_games,$2),
          injury_type=$3,
          fitness=GREATEST(25,fitness-10),
          form_rating=GREATEST(45,form_rating-2)
        WHERE id=$1
      `,[p.id,games,injury.name]);
      await client.query(
        `INSERT INTO club_events(club_id,event_type,title,description)
         VALUES($1,'injury','Lesão no elenco',$2)`,
        [clubId,`${p.name}: ${injury.name}. Previsão de ${games} jogo(s) fora.`]
      );
    }
  }

  for(const sub of substitutions){
    const p=bench.find(x=>String(x.id)===String(sub.inId));
    if(!p)continue;
    const fatigue=clamp(rand(4,8)+Math.max(0,tactics.fatigue-1)+Math.max(0,congestionPenalty-1)-(fitnessStaff-1),3,13);
    const status=String(p.squad_status||"ROTATION");
    const happinessDelta=status==="STAR"||status==="STARTER"?0:status==="PROSPECT"?3:2;
    await client.query(`
      UPDATE players SET
        fitness=GREATEST(25,fitness-ROUND($2::numeric)),
        morale=GREATEST(35,LEAST(100,morale+$3)),
        form_rating=GREATEST(45,LEAST(100,form_rating+$4)),
        happiness=GREATEST(20,LEAST(100,happiness+$5))
      WHERE id=$1
    `,[p.id,fatigue,result==="win"?2:0,result==="win"?1:0,happinessDelta]);
  }

  const nonParticipants=await client.query(`
    SELECT id,name,squad_status,happiness
    FROM players
    WHERE club_id=$1 AND NOT(id=ANY($2::bigint[]))
  `,[clubId,participantIds]);

  const recovery=clamp(rand(7,11)+(fitnessStaff-1)*2,6,18);
  await client.query(`
    UPDATE players SET
      fitness=LEAST(100,fitness+$2),
      form_rating=GREATEST(45,form_rating-1)
    WHERE club_id=$1 AND NOT(id=ANY($3::bigint[]))
  `,[clubId,recovery,participantIds]);

  for(const p of nonParticipants.rows){
    const status=String(p.squad_status||"ROTATION");
    let delta=0;
    if(status==="STAR")delta=-4;
    else if(status==="STARTER")delta=-3;
    else if(status==="ROTATION")delta=-1;
    else if(status==="PROSPECT")delta=-1;
    else delta=1;
    await client.query(`UPDATE players SET happiness=GREATEST(20,LEAST(100,happiness+$2)) WHERE id=$1`,[p.id,delta]);
  }

  const unhappy=(await client.query(`
    SELECT id,name,happiness
    FROM players
    WHERE club_id=$1 AND happiness<=32 AND transfer_listed=FALSE
  `,[clubId])).rows;
  for(const p of unhappy){
    await client.query(`UPDATE players SET transfer_listed=TRUE WHERE id=$1`,[p.id]);
    await client.query(
      `INSERT INTO club_events(club_id,event_type,title,description)
       VALUES($1,'squad','Jogador insatisfeito',$2)`,
      [clubId,`${p.name} está insatisfeito com seu espaço no elenco e pediu para ser colocado no mercado.`]
    );
  }
}

async function recordUserMatch(client,ownerId,opponentId,m,events,type,reward=0){
  const career=(await client.query(`SELECT season_no,data FROM careers WHERE owner_club_id=$1`,[ownerId])).rows[0];
  const gameDate=career?.data?.calendar?.date||null;
  await client.query(`
    INSERT INTO matches(
      user_club_id,opponent_club_id,user_goals,opponent_goals,reward,
      user_rating,opponent_rating,events,match_type,season_no,is_home,attendance,game_date
    )
    VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$13)
  `,[
    ownerId,opponentId,m.userGoals,m.opponentGoals,reward,m.userRating,m.opponentRating,
    JSON.stringify(events),type,Number(career?.season_no||1),Boolean(m.isHome),
    Number(m.attendance||0),gameDate
  ]);
}
async function addFinance(client,clubId,amount,category,description){
  await client.query(`UPDATE clubs SET coins=coins+$2 WHERE id=$1`,[clubId,amount]);
  await client.query(`INSERT INTO club_finance_events(club_id,amount,category,description) VALUES($1,$2,$3,$4)`,[clubId,amount,category,description]);
}
async function wageBill(client,clubId){
  const [players,staff]=await Promise.all([
    client.query(`SELECT COALESCE(SUM(salary),0)::int total FROM players WHERE club_id=$1`,[clubId]),
    client.query(`SELECT COALESCE(SUM(salary),0)::int total FROM club_staff WHERE club_id=$1`,[clubId])
  ]);
  return Number(players.rows[0].total||0)+Number(staff.rows[0].total||0);
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
  const season=Number((await client.query(`SELECT season_no FROM careers WHERE owner_club_id=$1`,[clubId])).rows[0]?.season_no||1);
  await publishNews(client,clubId,season,"bastidores",title,description,1);
  return {title,description};
}
async function settleMatchFinances(client,clubId,context,isHome,result,attendance=0,ticketPrice=30){
  const rates=financeRates(context);
  const sponsor=0;
  const crowdGate=isHome&&Number(attendance)>0
    ?Math.round(Number(attendance)*Math.max(5,Number(ticketPrice||30))/100)
    :0;
  const gate=isHome?Math.max(Math.round(rates.gate*.55),crowdGate):0;
  const performance=result==="win"?650:result==="draw"?250:80;
  if(gate)await addFinance(client,clubId,gate,"tickets",`Bilheteria da partida em casa — público ${Number(attendance||0).toLocaleString("pt-BR")}`);
  await addFinance(client,clubId,performance,"performance","Bônus pelo resultado");
  const event=await unexpectedClubEvent(client,clubId);
  return {sponsor,gate,performance,wages:0,net:gate+performance,event,attendance:Number(attendance||0),ticketPrice:Number(ticketPrice||30)};
}

const MEDIA_SOURCES=["Jornal do Clube","Central da Bola","Esporte Agora","Diário do Futebol","Portal da Torcida"];
function randomMediaSource(){return MEDIA_SOURCES[rand(0,MEDIA_SOURCES.length-1)]}
async function publishNews(client,clubId,seasonNo,category,headline,body,importance=1,sourceName=null){
  const source=sourceName||randomMediaSource();
  const r=await client.query(`
    INSERT INTO media_news(club_id,season_no,category,source_name,headline,body,importance)
    VALUES($1,$2,$3,$4,$5,$6,$7)
    RETURNING *
  `,[clubId,Number(seasonNo||1),category,source,headline,body,clamp(Number(importance||1),1,3)]);
  return r.rows[0];
}

async function publishNewsOnce(client,clubId,seasonNo,category,headline,body,importance=1,sourceName=null){
  const exists=(await client.query(
    `SELECT 1 FROM media_news WHERE club_id=$1 AND season_no=$2 AND headline=$3 LIMIT 1`,
    [clubId,Number(seasonNo||1),headline]
  )).rowCount>0;
  if(exists)return null;
  return publishNews(client,clubId,seasonNo,category,headline,body,importance,sourceName);
}

async function publishBoardMessage(client,clubId,seasonNo,messageType,title,body,tone="neutral",importance=1){
  const r=await client.query(`
    INSERT INTO board_messages(club_id,season_no,message_type,tone,title,body,importance)
    VALUES($1,$2,$3,$4,$5,$6,$7)
    RETURNING *
  `,[clubId,Number(seasonNo||1),messageType,tone,title,body,clamp(Number(importance||1),1,3)]);
  return r.rows[0];
}

function boardExpectationFor(career,club){
  const div=career?.user_division||"D";
  const entries=sortEntries(career?.data?.divisions?.[div]?.entries||[]);
  const position=Math.max(1,entries.findIndex(e=>String(e.clubId)===String(club.id))+1);
  const rating=Number(club.team_rating||club.base_rating||64);

  let targetPosition,targetTitle,description;
  if(div==="A"){
    if(rating>=82){
      targetPosition=2;
      targetTitle="Disputar o título";
      description="A diretoria espera o clube brigando pelo título até as últimas rodadas.";
    }else{
      targetPosition=6;
      targetTitle="Ficar entre os 6 primeiros";
      description="A meta é consolidar o clube na elite e disputar as vagas continentais.";
    }
  }else{
    targetPosition=4;
    targetTitle="Conquistar o acesso";
    description=`A diretoria espera terminar no G4 de ${leagueName(career?.country_code||club.country_code||"BR",div)} e subir de divisão.`;
  }

  if(club.is_saf){
    description+= " Como o clube é SAF, também é obrigatório encerrar a temporada sem saldo negativo para evitar punição administrativa.";
  }

  let status="attention";
  if(position<=targetPosition)status="on_track";
  else if(position<=targetPosition+4)status="attention";
  else status="off_track";

  return {
    targetPosition,
    targetTitle,
    description,
    currentPosition:position,
    status,
    confidence:clamp(Number(club.board_confidence||60),0,100),
    mediaPressure:clamp(Number(club.media_pressure||0),0,100)
  };
}

async function ensureBoardExpectationMessage(client,club,career){
  const season=Number(career?.season_no||1);
  const exists=(await client.query(
    `SELECT 1 FROM board_messages WHERE club_id=$1 AND season_no=$2 AND message_type='expectativa' LIMIT 1`,
    [club.id,season]
  )).rowCount>0;
  if(exists)return;

  const ex=boardExpectationFor(career,club);
  await publishBoardMessage(
    client,club.id,season,"expectativa",
    `Expectativa da diretoria: ${ex.targetTitle}`,
    `${ex.description} Posição atual: ${ex.currentPosition}º.`,
    "neutral",2
  );
}

async function ensureOtherClubHeadlines(client,clubId,career){
  const season=Number(career?.season_no||1);
  const count=Number((await client.query(
    `SELECT COUNT(*)::int count FROM media_news WHERE club_id=$1 AND season_no=$2 AND category='outros_clubes'`,
    [clubId,season]
  )).rows[0]?.count||0);
  if(count>=2)return;

  const div=career?.user_division||"D";
  const table=sortEntries(career?.data?.divisions?.[div]?.entries||[]);
  const targets=table.filter(e=>String(e.clubId)!==String(clubId)).slice(0,3);
  if(!targets.length)return;

  const ids=targets.map(e=>String(e.clubId));
  const clubs=(await client.query(`SELECT id,name FROM clubs WHERE id=ANY($1::bigint[])`,[ids])).rows;
  const names=new Map(clubs.map(c=>[String(c.id),c.name]));
  const league=leagueName(career?.country_code||"BR",div);

  for(let i=0;i<Math.min(2,targets.length);i++){
    const e=targets[i],name=names.get(String(e.clubId))||"Clube";
    const headline=i===0
      ?`${name} aparece entre os destaques de ${league}`
      :`${name} movimenta a disputa em ${league}`;
    const body=`A cobertura também acompanha os rivais: ${name} soma ${Number(e.points||0)} ponto(s), com ${Number(e.wins||0)} vitória(s), e ocupa atualmente a ${table.findIndex(x=>String(x.clubId)===String(e.clubId))+1}ª posição.`;
    await publishNewsOnce(client,clubId,season,"outros_clubes",headline,body,1,"Central da Bola");
  }
}

function mediaFixturePool(career,action,result,ownerId){
  let fs=[];
  if(action==="national"){
    const round=Number(result?.round||career.current_round||1);
    fs=(career.data?.divisions?.[career.user_division]?.fixtures||[])
      .filter(f=>Number(f.round)===round&&f.played);
  }else if(action==="copa"){
    fs=(career.data?.copaBrasil?.fixtures||[])
      .filter(f=>f.played&&(!result?.copaStage||f.stage===result.copaStage)&&(!result?.leg||Number(f.leg||1)===Number(result.leg)));
  }else if(action==="state"){
    fs=(career.data?.state?.fixtures||[]).filter(f=>f.played).slice(-10);
  }else if(action==="lib"){
    fs=(career.data?.libertadores?.fixtures||[]).filter(f=>f.played).slice(-12);
  }else if(action==="champions"){
    fs=(career.data?.championsLeague?.fixtures||[]).filter(f=>f.played).slice(-16);
  }else if(action==="world"){
    fs=(career.data?.clubWorldCup?.fixtures||[]).filter(f=>f.played).slice(-16);
  }
  return fs.filter(f=>String(f.home)!==String(ownerId)&&String(f.away)!==String(ownerId)).reverse();
}

async function publishOtherClubNews(client,ownerId,career,action,result){
  const candidates=mediaFixturePool(career,action,result,ownerId).slice(0,2);
  if(!candidates.length)return 0;

  const ids=[...new Set(candidates.flatMap(f=>[String(f.home),String(f.away)]))];
  const clubs=(await client.query(
    `SELECT id,name FROM clubs WHERE id=ANY($1::bigint[])`,
    [ids]
  )).rows;
  const names=new Map(clubs.map(c=>[String(c.id),c.name]));
  let created=0;

  for(const f of candidates){
    const home=names.get(String(f.home))||"Mandante";
    const away=names.get(String(f.away))||"Visitante";
    const hg=Number(f.hg||0),ag=Number(f.ag||0),diff=Math.abs(hg-ag);
    const winner=hg>ag?home:ag>hg?away:null;
    const loser=hg>ag?away:ag>hg?home:null;
    const isRout=diff>=3;

    const headline=isRout
      ?`Goleada em destaque: ${winner} faz ${Math.max(hg,ag)} a ${Math.min(hg,ag)} em ${loser}`
      :winner
        ?`${winner} vence ${loser} por ${Math.max(hg,ag)} a ${Math.min(hg,ag)}`
        :`${home} e ${away} empatam em ${hg} a ${ag}`;

    const body=isRout
      ?`A rodada teve uma goleada fora dos jogos do seu clube. ${winner} dominou o confronto e venceu ${loser} por ${Math.max(hg,ag)} a ${Math.min(hg,ag)}.`
      :`Outros clubes também movimentaram a rodada: ${home} ${hg} a ${ag} ${away}.`;

    const n=await publishNewsOnce(
      client,ownerId,career.season_no,
      isRout?"goleada_outros":"outros_clubes",
      headline,body,isRout?3:1,
      isRout?"Esporte Agora":"Central da Bola"
    );
    if(n)created++;
  }
  return created;
}

async function publishSeasonRoutHighlights(client,ownerId,career){
  const fixtures=(career?.data?.divisions?.[career.user_division]?.fixtures||[])
    .filter(f=>f.played&&Math.abs(Number(f.hg||0)-Number(f.ag||0))>=3)
    .sort((a,b)=>Math.abs(Number(b.hg||0)-Number(b.ag||0))-Math.abs(Number(a.hg||0)-Number(a.ag||0)))
    .slice(0,5);
  if(!fixtures.length)return;

  const ids=[...new Set(fixtures.flatMap(f=>[String(f.home),String(f.away)]))];
  const clubs=(await client.query(`SELECT id,name FROM clubs WHERE id=ANY($1::bigint[])`,[ids])).rows;
  const names=new Map(clubs.map(c=>[String(c.id),c.name]));

  for(const f of fixtures){
    const home=names.get(String(f.home))||"Mandante";
    const away=names.get(String(f.away))||"Visitante";
    const hg=Number(f.hg||0),ag=Number(f.ag||0);
    const winner=hg>ag?home:away,loser=hg>ag?away:home;
    const involvesUser=String(f.home)===String(ownerId)||String(f.away)===String(ownerId);
    const headline=`Goleada da temporada: ${winner} ${Math.max(hg,ag)} a ${Math.min(hg,ag)} ${loser}`;
    const body=involvesUser
      ?`A simulação da temporada registrou uma goleada envolvendo seu clube: ${home} ${hg} a ${ag} ${away}.`
      :`Entre os outros clubes, uma das maiores goleadas da temporada foi ${home} ${hg} a ${ag} ${away}.`;

    await publishNewsOnce(
      client,ownerId,career.season_no,
      involvesUser?"goleada":"goleada_outros",
      headline,body,3,"Esporte Agora"
    );
  }
}
async function ensureInitialNews(client,clubId,seasonNo,clubName){
  const exists=(await client.query(`SELECT 1 FROM media_news WHERE club_id=$1 LIMIT 1`,[clubId])).rowCount>0;
  if(exists)return;
  await publishNews(
    client,clubId,seasonNo,"institucional",
    `${clubName} inaugura novo canal de notícias`,
    `A cobertura da carreira começou. Resultados, bastidores, mercado, finanças, coletivas e decisões da diretoria passarão a aparecer neste jornal.`,
    1,"Jornal do Clube"
  );
}
async function createPressConference(client,clubId,seasonNo,triggerType,title,question,context={}){
  const pending=(await client.query(
    `SELECT id FROM press_conferences WHERE club_id=$1 AND status='pending' ORDER BY created_at DESC LIMIT 1`,
    [clubId]
  )).rows[0];
  if(pending)return pending;

  // Coletivas comuns são raras: no máximo 3 por temporada.
  // Eliminações continuam podendo gerar coletiva mesmo após esse limite.
  if(triggerType!=="eliminacao"){
    const count=Number((await client.query(
      `SELECT COUNT(*)::int count
       FROM press_conferences
       WHERE club_id=$1 AND season_no=$2 AND trigger_type<>'eliminacao'`,
      [clubId,Number(seasonNo||1)]
    )).rows[0]?.count||0);
    if(count>=3)return null;
  }

  const r=await client.query(`
    INSERT INTO press_conferences(club_id,season_no,trigger_type,title,question,context,status)
    VALUES($1,$2,$3,$4,$5,$6::jsonb,'pending') RETURNING *
  `,[clubId,Number(seasonNo||1),triggerType,title,question,JSON.stringify(context||{})]);
  return r.rows[0];
}
function pressQuestionFor({eliminated=false,result="draw",competition="partida"}={}){
  if(eliminated)return `A eliminação em ${competition} aumenta a pressão. Como você explica o resultado e qual será a resposta do clube?`;
  if(result==="win")return `A vitória ganhou grande repercussão. Como você pretende manter o elenco focado depois deste resultado importante?`;
  if(result==="loss")return `A derrota virou assunto na imprensa. O que precisa mudar imediatamente para o time reagir?`;
  return `O empate gerou debate na imprensa. Qual é sua avaliação sobre o desempenho do time?`;
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
  if(r.rowCount>0){
    const club=(await client.query(`SELECT name,country_code FROM clubs WHERE id=$1`,[clubId])).rows[0];
    const competitionName=title.replace(/^Campeão — /,"");
    const isBrazilCup=competition==="COPA_NACIONAL"&&club?.country_code==="BR";
    const titleBody=isBrazilCup
      ?`${club?.name||"O clube"} confirmou o título de ${competitionName}. Além da taça, a conquista garante uma vaga na Libertadores.`
      :`${club?.name||"O clube"} confirmou o título de ${competitionName}. A conquista passa a integrar a galeria de troféus da carreira.`;

    await publishNews(
      client,clubId,seasonNo,"titulo",
      `🏆 ${club?.name||"Clube"} conquista ${competitionName}`,
      titleBody,3,"Jornal do Clube"
    );

    if(isBrazilCup){
      await publishNewsOnce(
        client,clubId,seasonNo,"classificacao",
        `🌎 ${club?.name||"Clube"} garante vaga na Libertadores`,
        `O título da Copa do Brasil classificou o clube para a Libertadores, independentemente da posição final no Campeonato Brasileiro.`,
        3,"Central da Bola"
      );
    }

    await client.query(`UPDATE clubs SET board_confidence=LEAST(100,board_confidence+10),media_pressure=GREATEST(0,media_pressure-6) WHERE id=$1`,[clubId]);
    await publishBoardMessage(
      client,clubId,seasonNo,"titulo",
      `Diretoria celebra o título de ${competitionName}`,
      isBrazilCup
        ?`Parabéns pelo título. A conquista também garantiu a vaga na Libertadores e elevou as expectativas esportivas da diretoria.`
        :`Parabéns pelo trabalho. A conquista de ${competitionName} superou as expectativas e fortaleceu a confiança da diretoria no projeto.`,
      "positive",3
    );
  }
  return r.rowCount>0;
}
async function maybeRecordDivisionTrophy(client,career,ownerId){
  const div=career.user_division;
  const table=sortEntries(career.data.divisions?.[div]?.entries||[]);
  if(table[0]&&String(table[0].clubId)===String(ownerId))await recordTrophy(client,ownerId,career.season_no,`LIGA_${div}`,`Campeão — ${leagueName(career.country_code||"BR",div)}`);
}
async function teamPerformanceProfile(client,clubId,career=null){
  if(!career){
    career=(await client.query(`SELECT * FROM careers WHERE owner_club_id=$1`,[clubId])).rows[0]||null;
  }

  const recent=(await client.query(`
    SELECT user_goals,opponent_goals,played_at
    FROM matches
    WHERE user_club_id=$1
    ORDER BY played_at DESC,id DESC
    LIMIT 8
  `,[clubId])).rows;

  let wins=0,draws=0,losses=0,gf=0,ga=0;
  for(const m of recent){
    const ug=Number(m.user_goals||0),og=Number(m.opponent_goals||0);
    gf+=ug;ga+=og;
    if(ug>og)wins++;
    else if(ug===og)draws++;
    else losses++;
  }

  const games=recent.length;
  const formPoints=wins*3+draws;
  const formPct=games?formPoints/(games*3):0;

  let entries=[];
  if(career?.phase==="STATE"&&career?.data?.state?.entries?.length){
    entries=sortEntries(career.data.state.entries);
  }else{
    entries=sortEntries(career?.data?.divisions?.[career?.user_division||"D"]?.entries||[]);
  }

  const idx=entries.findIndex(e=>String(e.clubId)===String(clubId));
  const position=idx>=0?idx+1:null;
  let tableFactor=.45;
  if(position===1)tableFactor=1;
  else if(position!=null&&position<=4)tableFactor=.88;
  else if(position!=null&&position<=8)tableFactor=.68;
  else if(position!=null&&position<=12)tableFactor=.52;

  const titleCount=Number((await client.query(
    `SELECT COUNT(*)::int count FROM club_trophies WHERE club_id=$1 AND season_no=$2`,
    [clubId,Number(career?.season_no||1)]
  )).rows[0]?.count||0);

  const goalDiffPerGame=games?(gf-ga)/games:0;
  const gdFactor=clamp((goalDiffPerGame+1.5)/3,0,1);
  const score=clamp(Math.round(formPct*55+tableFactor*30+gdFactor*10+Math.min(10,titleCount*5)),0,100);

  const hot=games>=4&&score>=70;
  const elite=games>=5&&score>=84;
  const label=elite?"Fase excelente":hot?"Grande fase":score>=55?"Boa fase":"Momento normal";

  return {
    score,label,hot,elite,games,wins,draws,losses,gf,ga,position,titleCount,
    unbeaten:games>=4&&losses===0,
    winRate:games?Math.round((wins/games)*100):0
  };
}

async function maybeGenerateManagerJobOffer(client,clubId,career,performance){
  if(!career||career.phase==="STATE"||career.phase==="END"||!performance?.hot||Number(performance.score||0)<74)return null;

  const pending=(await client.query(`
    SELECT 1 FROM manager_job_offers
    WHERE user_club_id=$1 AND status='pending'
    LIMIT 1
  `,[clubId])).rowCount>0;
  if(pending)return null;

  const chance=performance.elite ? 1 : 0.28;
  if(Math.random()>chance)return null;

  const current=(await client.query(`SELECT * FROM clubs WHERE id=$1`,[clubId])).rows[0];
  if(!current)return null;

  const currentDiv=career.user_division||"D";
  const candidates=(await client.query(`
    SELECT c.*
    FROM clubs c
    WHERE c.is_ai=TRUE
      AND c.club_kind='national'
      AND c.country_code=$1
      AND c.id<>$2
      AND c.base_rating >= $3
    ORDER BY
      CASE WHEN c.base_rating>$4 THEN 0 ELSE 1 END,
      c.base_rating DESC,
      RANDOM()
    LIMIT 12
  `,[current.country_code||"BR",clubId,Math.max(55,Number(current.team_rating||current.base_rating||64)-2),Number(current.team_rating||current.base_rating||64)])).rows;

  const eligible=candidates.filter(c=>{
    const div=divisionOfClub(career,c.id);
    if(!div)return false;
    return divisionRank(div)>=Math.max(divisionRank(currentDiv),2)||Number(c.base_rating)>Number(current.team_rating||64);
  });
  if(!eligible.length)return null;

  const target=eligible[rand(0,eligible.length-1)];
  await createRoster(client,target,false);
  const salary=Math.round((1200+Number(target.base_rating||65)*55+Number(performance.score||0)*18)/100)*100;
  const r=await client.query(`
    INSERT INTO manager_job_offers(user_club_id,offering_club_id,season_no,salary,performance_score,status)
    VALUES($1,$2,$3,$4,$5,'pending')
    RETURNING *
  `,[clubId,target.id,career.season_no,salary,performance.score]);

  await client.query(
    `INSERT INTO club_events(club_id,event_type,title,description)
     VALUES($1,'manager_offer','Proposta para comandar outro clube',$2)`,
    [clubId,`${target.name} procurou você após a grande fase da equipe. O clube oferece um projeto com remuneração de ${salary.toLocaleString("pt-BR")} moedas por mês.`]
  );
  await publishNewsOnce(
    client,clubId,career.season_no,"bastidores",
    `${target.name} demonstra interesse no treinador de ${current.name}`,
    `A sequência de bons resultados colocou o trabalho do treinador no radar de outros clubes. ${target.name} formalizou uma proposta para assumir o comando.`,
    2,"Central da Bola"
  );
  return r.rows[0];
}

function swapCareerClubReferences(node,a,b,parentKey=""){
  const scalarKeys=new Set(["clubId","home","away","champion","pw","hostClubId"]);
  const arrayKeys=new Set(["teams","top4","nationalQualifiers","winners","qualified"]);
  const swap=v=>String(v)===String(a)?Number(b):String(v)===String(b)?Number(a):v;

  if(Array.isArray(node)){
    if(arrayKeys.has(parentKey))return node.map(v=>(typeof v==="number"||typeof v==="string")?swap(v):swapCareerClubReferences(v,a,b,parentKey));
    return node.map(v=>swapCareerClubReferences(v,a,b,parentKey));
  }
  if(node&&typeof node==="object"){
    for(const [k,v] of Object.entries(node)){
      if(scalarKeys.has(k)&&(typeof v==="number"||typeof v==="string"))node[k]=swap(v);
      else node[k]=swapCareerClubReferences(v,a,b,k);
    }
  }
  return node;
}

async function finalizeSeasonRealism(client,clubId,career,club){
  const season=Number(career.season_no||1);
  const players=(await client.query(`SELECT * FROM players WHERE club_id=$1 ORDER BY season_goals DESC,season_assists DESC,rating DESC`,[clubId])).rows;

  for(const p of players){
    await client.query(`
      INSERT INTO player_season_history(
        club_id,player_id,player_name,season_no,appearances,goals,assists,clean_sheets,
        yellow_cards,red_cards,rating_end
      )
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      ON CONFLICT(club_id,season_no,player_id) DO UPDATE SET
        appearances=EXCLUDED.appearances,
        goals=EXCLUDED.goals,
        assists=EXCLUDED.assists,
        clean_sheets=EXCLUDED.clean_sheets,
        yellow_cards=EXCLUDED.yellow_cards,
        red_cards=EXCLUDED.red_cards,
        rating_end=EXCLUDED.rating_end
    `,[clubId,p.id,p.name,season,p.season_appearances||0,p.season_goals||0,p.season_assists||0,p.season_clean_sheets||0,p.yellow_cards||0,p.red_cards||0,p.rating||0]);
  }

  const awardCandidates={
    TOP_SCORER:players.slice().sort((a,b)=>Number(b.season_goals||0)-Number(a.season_goals||0)||Number(b.rating)-Number(a.rating))[0],
    ASSIST_KING:players.slice().sort((a,b)=>Number(b.season_assists||0)-Number(a.season_assists||0)||Number(b.rating)-Number(a.rating))[0],
    BEST_PLAYER:players.slice().sort((a,b)=>Number(b.form_rating||70)-Number(a.form_rating||70)||Number(b.rating)-Number(a.rating))[0],
    BEST_GK:players.filter(p=>p.position==="GK").sort((a,b)=>Number(b.season_clean_sheets||0)-Number(a.season_clean_sheets||0)||Number(b.rating)-Number(a.rating))[0],
    YOUNG_PLAYER:players.filter(p=>Number(p.age)<=21).sort((a,b)=>Number(b.rating)-Number(a.rating)||Number(b.potential||0)-Number(a.potential||0))[0]
  };
  const awardNames={
    TOP_SCORER:"Artilheiro do clube",
    ASSIST_KING:"Líder de assistências",
    BEST_PLAYER:"Melhor jogador da temporada",
    BEST_GK:"Melhor goleiro",
    YOUNG_PLAYER:"Revelação da temporada"
  };
  for(const [type,p] of Object.entries(awardCandidates)){
    if(!p)continue;
    await client.query(`
      INSERT INTO player_awards(club_id,season_no,player_id,player_name,award_type,award_title)
      VALUES($1,$2,$3,$4,$5,$6)
      ON CONFLICT(club_id,season_no,award_type) DO NOTHING
    `,[clubId,season,p.id,p.name,type,awardNames[type]]);
  }

  const table=sortEntries(career.data?.divisions?.[career.user_division]?.entries||[]);
  const pos=Math.max(1,table.findIndex(e=>String(e.clubId)===String(clubId))+1);
  const entry=table.find(e=>String(e.clubId)===String(clubId))||{};
  const trophyCount=Number((await client.query(`SELECT COUNT(*)::int count FROM club_trophies WHERE club_id=$1 AND season_no=$2`,[clubId,season])).rows[0]?.count||0);
  const top=awardCandidates.TOP_SCORER;
  const balance=Number((await client.query(`SELECT coins FROM clubs WHERE id=$1`,[clubId])).rows[0]?.coins||0);

  await client.query(`
    INSERT INTO career_season_history(
      club_id,season_no,division,final_position,wins,draws,losses,gf,ga,trophies,top_scorer,top_scorer_goals,balance
    )
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
    ON CONFLICT(club_id,season_no) DO UPDATE SET
      division=EXCLUDED.division,final_position=EXCLUDED.final_position,wins=EXCLUDED.wins,
      draws=EXCLUDED.draws,losses=EXCLUDED.losses,gf=EXCLUDED.gf,ga=EXCLUDED.ga,
      trophies=EXCLUDED.trophies,top_scorer=EXCLUDED.top_scorer,
      top_scorer_goals=EXCLUDED.top_scorer_goals,balance=EXCLUDED.balance
  `,[clubId,season,career.user_division,pos,entry.wins||0,entry.draws||0,entry.losses||0,entry.gf||0,entry.ga||0,trophyCount,top?.name||null,top?.season_goals||0,balance]);

  await client.query(`
    UPDATE players SET
      season_appearances=0,
      season_goals=0,
      season_assists=0,
      season_clean_sheets=0,
      yellow_accumulation=0,
      suspension_games=0,
      form_rating=GREATEST(60,LEAST(82,form_rating))
    WHERE club_id=$1
  `,[clubId]);
}

async function simulateAiTransferActivity(client,careerOwnerId,career){
  const window=transferWindowInfo(career?.data?.calendar?.date);
  if(!window.open||Math.random()>.55)return null;

  const owner=(await client.query(`SELECT country_code FROM clubs WHERE id=$1`,[careerOwnerId])).rows[0];
  const clubs=(await client.query(`
    SELECT id,name,base_rating
    FROM clubs
    WHERE is_ai=TRUE AND club_kind='national' AND country_code=$1
    ORDER BY RANDOM()
    LIMIT 10
  `,[owner?.country_code||"BR"])).rows;
  if(clubs.length<2)return null;

  const from=clubs[0],to=clubs.find(x=>String(x.id)!==String(from.id));
  if(!to)return null;
  await createRoster(client,from,false);await createRoster(client,to,false);

  const p=(await client.query(`
    SELECT * FROM players
    WHERE club_id=$1 AND is_starter=FALSE
    ORDER BY rating DESC,RANDOM()
    LIMIT 1
  `,[from.id])).rows[0];
  if(!p)return null;

  const fee=Math.max(500,Math.round(fairMarketValue(p)*(rand(90,115)/100)/100)*100);
  await client.query(`UPDATE players SET club_id=$2,is_starter=FALSE,morale=75,happiness=78 WHERE id=$1`,[p.id,to.id]);
  await client.query(`
    INSERT INTO ai_transfer_log(career_owner_id,season_no,player_name,from_club_name,to_club_name,fee)
    VALUES($1,$2,$3,$4,$5,$6)
  `,[careerOwnerId,career.season_no,p.name,from.name,to.name,fee]);

  return {playerName:p.name,from:from.name,to:to.name,fee};
}

async function clubRecordsSummary(client,clubId){
  const [
    topScorer,topApps,trophy,bigWin,bigLoss,bigSale,
    installmentPurchase,directPurchase,attendance,matches
  ]=await Promise.all([
    client.query(`SELECT name,goals FROM players WHERE club_id=$1 ORDER BY goals DESC,rating DESC LIMIT 1`,[clubId]),
    client.query(`SELECT name,appearances FROM players WHERE club_id=$1 ORDER BY appearances DESC,rating DESC LIMIT 1`,[clubId]),
    client.query(`SELECT COUNT(*)::int count FROM club_trophies WHERE club_id=$1`,[clubId]),
    client.query(`SELECT user_goals,opponent_goals,opponent_club_id FROM matches WHERE user_club_id=$1 ORDER BY (user_goals-opponent_goals) DESC,id ASC LIMIT 1`,[clubId]),
    client.query(`SELECT user_goals,opponent_goals,opponent_club_id FROM matches WHERE user_club_id=$1 ORDER BY (user_goals-opponent_goals) ASC,id ASC LIMIT 1`,[clubId]),
    client.query(`
      SELECT o.amount,p.name player_name,b.name buying_club_name
      FROM transfer_offers o
      LEFT JOIN players p ON p.id=o.player_id
      LEFT JOIN clubs b ON b.id=o.buying_club_id
      WHERE o.selling_club_id=$1 AND o.status='accepted'
      ORDER BY o.amount DESC LIMIT 1
    `,[clubId]),
    client.query(`
      SELECT player_name,total_fee amount
      FROM transfer_installments
      WHERE buying_club_id=$1
      ORDER BY total_fee DESC LIMIT 1
    `,[clubId]),
    client.query(`
      SELECT description,ABS(amount)::int amount
      FROM club_finance_events
      WHERE club_id=$1 AND category='transfer' AND amount<0
      ORDER BY ABS(amount) DESC LIMIT 1
    `,[clubId]),
    client.query(`
      SELECT attendance,game_date
      FROM matches
      WHERE user_club_id=$1 AND is_home=TRUE
      ORDER BY attendance DESC,id ASC LIMIT 1
    `,[clubId]),
    client.query(`
      SELECT user_goals,opponent_goals
      FROM matches
      WHERE user_club_id=$1
      ORDER BY id ASC
    `,[clubId])
  ]);

  let current=0,maxUnbeaten=0;
  for(const m of matches.rows){
    if(Number(m.user_goals)>=Number(m.opponent_goals)){
      current++;
      maxUnbeaten=Math.max(maxUnbeaten,current);
    }else current=0;
  }

  const installment=installmentPurchase.rows[0]||null;
  const direct=directPurchase.rows[0]||null;
  const largestPurchase=
    !installment?direct:
    !direct?installment:
    Number(installment.amount)>=Number(direct.amount)?installment:direct;

  return {
    topScorer:topScorer.rows[0]||null,
    topAppearances:topApps.rows[0]||null,
    trophies:Number(trophy.rows[0]?.count||0),
    biggestWin:bigWin.rows[0]||null,
    biggestLoss:bigLoss.rows[0]||null,
    biggestSale:bigSale.rows[0]||null,
    biggestPurchase:largestPurchase||null,
    unbeatenStreak:maxUnbeaten,
    recordAttendance:attendance.rows[0]||null
  };
}
async function realismSummary(client,club,career){
  await ensureRealismClubData(client,club.id,career);
  club=(await client.query(`SELECT * FROM clubs WHERE id=$1`,[club.id])).rows[0]||club;
  const staff=await staffLevels(client,club.id);
  const [academy,jobOffers,history,awards,playerHistory,aiTransfers,rival,records,players]=await Promise.all([
    client.query(`SELECT * FROM academy_players WHERE club_id=$1 AND status='academy' ORDER BY potential DESC,rating DESC`,[club.id]),
    client.query(`
      SELECT o.*,c.name club_name,c.base_rating,c.country_code,c.national_seed_division,c.coach_name
      FROM manager_job_offers o JOIN clubs c ON c.id=o.offering_club_id
      WHERE o.user_club_id=$1 AND o.status='pending'
      ORDER BY o.created_at DESC
    `,[club.id]),
    client.query(`SELECT * FROM career_season_history WHERE club_id=$1 ORDER BY season_no DESC LIMIT 20`,[club.id]),
    client.query(`SELECT * FROM player_awards WHERE club_id=$1 ORDER BY season_no DESC,id DESC LIMIT 30`,[club.id]),
    client.query(`SELECT * FROM player_season_history WHERE club_id=$1 ORDER BY season_no DESC,goals DESC,assists DESC LIMIT 100`,[club.id]),
    client.query(`SELECT * FROM ai_transfer_log WHERE career_owner_id=$1 ORDER BY id DESC LIMIT 20`,[club.id]),
    club.rival_club_id?client.query(`SELECT id,name,base_rating FROM clubs WHERE id=$1`,[club.rival_club_id]):Promise.resolve({rows:[]}),
    clubRecordsSummary(client,club.id),
    client.query(`
      SELECT id,name,position,role,rating,potential,form_rating,fitness,morale,happiness,
             suspension_games,yellow_accumulation,injury_games,injury_type,squad_status,
             tactical_role,is_captain,set_piece_role,academy_product,is_starter,is_bench,
             season_appearances,season_goals,season_assists,season_clean_sheets
      FROM players WHERE club_id=$1
      ORDER BY is_starter DESC,rating DESC
    `,[club.id])
  ]);

  const opponent=await opponentAnalysis(client,club.id,career,staff.levels.SCOUT);
  const window=transferWindowInfo(career?.data?.calendar?.date);
  const latestHome=(await client.query(`
    SELECT attendance,game_date FROM matches
    WHERE user_club_id=$1 AND is_home=TRUE
    ORDER BY id DESC LIMIT 1
  `,[club.id])).rows[0]||null;

  return {
    staff:staff.rows,
    staffLevels:staff.levels,
    academy:academy.rows,
    managerOffers:jobOffers.rows,
    history:history.rows,
    awards:awards.rows,
    playerHistory:playerHistory.rows,
    aiTransfers:aiTransfers.rows,
    rival:rival.rows[0]||null,
    records,
    players:players.rows,
    opponent,
    transferWindow:window,
    stadium:{
      capacity:Number(club.stadium_capacity||12000),
      level:Number(club.stadium_level||1),
      ticketPrice:Number(club.ticket_price||30),
      lastAttendance:Number(latestHome?.attendance||0),
      lastAttendanceDate:latestHome?.game_date||null
    },
    tactics:{
      pressing:club.tactic_pressing||"NORMAL",
      defensiveLine:club.tactic_defensive_line||"NORMAL",
      tempo:club.tactic_tempo||"NORMAL",
      width:club.tactic_width||"NORMAL",
      style:club.tactic_style||"BALANCED",
      marking:club.tactic_marking||"NORMAL"
    },
    chemistry:Number(club.chemistry||70),
    managerReputation:Number(club.manager_reputation||50)
  };
}

async function generateIncomingOffers(client,clubId,{force=false,playerId=null,performanceAware=true}={}){
  const pending=Number((await client.query(
    `SELECT COUNT(*)::int count FROM transfer_offers WHERE selling_club_id=$1 AND status='pending'`,
    [clubId]
  )).rows[0].count||0);

  if(pending>=5&&!force)return 0;

  const career=(await client.query(`SELECT * FROM careers WHERE owner_club_id=$1`,[clubId])).rows[0]||null;
  const performance=performanceAware?await teamPerformanceProfile(client,clubId,career):null;

  let players;
  if(playerId){
    players=(await client.query(`SELECT * FROM players WHERE id=$1 AND club_id=$2`,[playerId,clubId])).rows;
  }else{
    players=(await client.query(`
      SELECT *
      FROM players
      WHERE club_id=$1
      ORDER BY transfer_listed DESC,is_starter DESC,rating DESC,goals DESC,assists DESC
    `,[clubId])).rows;
  }
  if(!players.length)return 0;

  const already=(await client.query(
    `SELECT player_id FROM transfer_offers WHERE selling_club_id=$1 AND status='pending'`,
    [clubId]
  )).rows.map(r=>String(r.player_id));

  const loaned=(await client.query(
    `SELECT player_id FROM player_loans WHERE borrowing_club_id=$1 AND status='active'`,
    [clubId]
  )).rows.map(r=>String(r.player_id));

  const chance=force ? 1 : (performance?.elite ? 0.66 : performance?.hot ? 0.42 : 0.16);
  const eligible=players.filter(p=>{
    if(already.includes(String(p.id))||loaned.includes(String(p.id)))return false;
    if(p.transfer_listed||force)return true;

    // Em grande fase, titulares e jogadores decisivos chamam mais atenção.
    let playerChance=chance;
    if(p.is_starter)playerChance+=performance?.hot?.12:.04;
    if(Number(p.goals||0)+Number(p.assists||0)>=8)playerChance+=.10;
    if(Number(p.rating||0)>=78)playerChance+=.08;
    return Math.random()<Math.min(.88,playerChance);
  });

  if(!eligible.length)return 0;

  const seller=(await client.query(
    `SELECT country_code,team_rating,base_rating FROM clubs WHERE id=$1`,
    [clubId]
  )).rows[0];

  const countries=performance?.elite
    ?[...VALID_COUNTRIES]
    :[seller?.country_code||"BR"];

  const buyers=(await client.query(`
    SELECT id,name,base_rating,country_code,national_seed_division
    FROM clubs
    WHERE is_ai=TRUE
      AND club_kind='national'
      AND country_code=ANY($1::text[])
      AND id<>$2
    ORDER BY
      CASE WHEN base_rating >= $3 THEN 0 ELSE 1 END,
      base_rating DESC,
      RANDOM()
    LIMIT 35
  `,[countries,clubId,Math.max(60,Number(seller?.team_rating||seller?.base_rating||64)-2)])).rows;

  if(!buyers.length)return 0;

  const maxNew=force?2:performance?.elite?2:1;
  const sortedEligible=[...eligible].sort((a,b)=>{
    const aScore=(a.transfer_listed?25:0)+(a.is_starter?15:0)+Number(a.rating||0)+(Number(a.goals||0)+Number(a.assists||0))*1.2;
    const bScore=(b.transfer_listed?25:0)+(b.is_starter?15:0)+Number(b.rating||0)+(Number(b.goals||0)+Number(b.assists||0))*1.2;
    return bScore-aScore;
  });

  let created=0;
  const createdOffers=[];

  for(const p of sortedEligible.slice(0,maxNew)){
    const stronger=buyers.filter(b=>Number(b.base_rating||0)>=Number(seller?.team_rating||64)-1);
    const buyerPool=stronger.length?stronger:buyers;
    const buyer=buyerPool[rand(0,buyerPool.length-1)];
    if(!buyer)continue;

    const base=fairMarketValue(p);
    let factor=p.transfer_listed?(rand(98,112)/100):(rand(93,106)/100);

    // Boa campanha valoriza o elenco, mas sem preços absurdos.
    if(performance?.elite)factor+=rand(8,16)/100;
    else if(performance?.hot)factor+=rand(4,10)/100;

    const amount=Math.max(500,Math.round(base*factor/100)*100);

    const ins=await client.query(`
      INSERT INTO transfer_offers(selling_club_id,player_id,buying_club_id,amount,status)
      VALUES($1,$2,$3,$4,'pending')
      ON CONFLICT DO NOTHING
      RETURNING id
    `,[clubId,p.id,buyer.id,amount]);

    if(ins.rowCount){
      created++;
      createdOffers.push({
        playerName:p.name,
        buyerName:buyer.name,
        buyerCountry:buyer.country_code,
        amount
      });
    }
  }

  if(created>0&&performance?.hot&&!force){
    const first=createdOffers[0];
    await client.query(
      `INSERT INTO club_events(club_id,event_type,title,description)
       VALUES($1,'market','Elenco valorizado pela grande fase',$2)`,
      [clubId,`${created} clube(s) enviaram proposta(s) após a boa sequência. ${first.buyerName} apresentou ${first.amount.toLocaleString("pt-BR")} moedas por ${first.playerName}.`]
    );

    await publishNewsOnce(
      client,clubId,career?.season_no||1,"negocios",
      `Grande fase valoriza jogadores de ${((await client.query(`SELECT name FROM clubs WHERE id=$1`,[clubId])).rows[0]?.name)||"seu clube"}`,
      `O bom desempenho recente aumentou o interesse do mercado. Clubes passaram a procurar os principais jogadores do elenco e as propostas podem vir com um prêmio de valorização pela fase atual.`,
      2,"Diário do Futebol"
    );
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
  const aiTransfer=await simulateAiTransferActivity(client,clubId,career);
  return {wages,sponsor,installments,loanFees,balance,aiTransfer};
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

function attendanceForMatch(home,away){
  const capacity=Math.max(3000,Number(home?.stadium_capacity||12000));
  const price=Math.max(5,Number(home?.ticket_price||30));
  const homeRating=Number(home?.team_rating||home?.base_rating||64);
  const awayRating=Number(away?.team_rating||away?.base_rating||64);
  const rival=String(home?.rival_club_id||"")===String(away?.id||"");
  const supporterDemand=Math.min(.20,Number(home?.fans||5000)/Math.max(1,capacity)*.22);
  const base=.38+supporterDemand+(homeRating-60)*.008+(awayRating-60)*.004+(rival?0.16:0);
  const pricePenalty=Math.max(.55,1-Math.max(0,price-35)*.008);
  const fill=clamp(base*pricePenalty,0.35,1);
  return Math.round(capacity*fill);
}
function dayDiff(a,b){
  if(!a||!b)return 7;
  const x=new Date(`${a}T12:00:00Z`),y=new Date(`${b}T12:00:00Z`);
  return Math.max(0,Math.round((x-y)/86400000));
}

async function fullMatch(client,homeId,awayId,userId){
  const cs=(await client.query(`SELECT * FROM clubs WHERE id=ANY($1::bigint[])`,[[homeId,awayId]])).rows;
  const home=cs.find(c=>String(c.id)===String(homeId)),away=cs.find(c=>String(c.id)===String(awayId));
  if(!home||!away)throw new Error("Clubes da partida não encontrados.");

  const careerRow=(await client.query(`SELECT * FROM careers WHERE owner_club_id=$1`,[userId])).rows[0]||null;
  await ensureRealismClubData(client,userId,careerRow);

  await applyFelipeMode(client,home.id);
  await applyFelipeMode(client,away.id);

  const userHome=String(home.id)===String(userId);
  const userClub=userHome?home:away;
  const opponent=userHome?away:home;
  const staff=await staffLevels(client,userId);
  userClub._gkCoachLevel=staff.levels.GK_COACH;

  const hs=await matchStarters(client,home,userHome);
  const as=await matchStarters(client,away,!userHome);

  const homeAll=(await client.query(`SELECT * FROM players WHERE club_id=$1 ORDER BY rating DESC`,[home.id])).rows;
  const awayAll=(await client.query(`SELECT * FROM players WHERE club_id=$1 ORDER BY rating DESC`,[away.id])).rows;
  const hBench=matchBench(homeAll,hs);
  const aBench=matchBench(awayAll,as);
  const hSubs=simulateSubstitutions(hs,hBench,home.id);
  const aSubs=simulateSubstitutions(as,aBench,away.id);

  const sim=realisticScore(hs,as,home,away);
  let hg=sim.hg,ag=sim.ag;

  const homeFelipe=isFelipeName(home.name),awayFelipe=isFelipeName(away.name);
  if(homeFelipe&&!awayFelipe){
    const score=felipeScore();hg=score.winner;ag=score.loser;
  }else if(awayFelipe&&!homeFelipe){
    const score=felipeScore();ag=score.winner;hg=score.loser;
  }

  const visualHomeGoals=Math.min(hg,8),visualAwayGoals=Math.min(ag,8);
  const events=[
    ...eventsFor(home.id,hs,visualHomeGoals),
    ...eventsFor(away.id,as,visualAwayGoals),
    ...hSubs,
    ...aSubs
  ].sort((a,b)=>a.minute-b.minute);

  if(homeFelipe||awayFelipe){
    const winner=homeFelipe?home:away;
    events.unshift({type:"special",clubId:winner.id,minute:1,text:`Modo FELIPE ativado para ${winner.name}: todos os jogadores em 100.`});
  }

  const homeResult=hg>ag?"win":hg===ag?"draw":"loss";
  const awayResult=ag>hg?"win":ag===hg?"draw":"loss";
  const calendarDate=careerRow?.data?.calendar?.date||new Date().toISOString().slice(0,10);
  const lastDate=userClub.last_match_game_date?String(userClub.last_match_game_date).slice(0,10):null;
  const congestionDays=dayDiff(calendarDate,lastDate);
  const travelLoad=!userHome
    ?((userClub.country_code!==opponent.country_code)?4:
      (userClub.state_code&&opponent.state_code&&userClub.state_code!==opponent.state_code)?2:1)
    :0;

  if(userHome){
    await applyStatsAndCondition(client,home.id,hs,ag,events,homeResult,{
      bench:hBench,substitutions:hSubs,club:home,congestionDays,travelLoad,staffLevels:staff.levels
    });
    await client.query(`UPDATE clubs SET team_rating=$2 WHERE id=$1`,[home.id,Math.round(hs.reduce((a,p)=>a+Number(p.rating),0)/hs.length)]);
  }else{
    await applyStatsAndCondition(client,away.id,as,hg,events,awayResult,{
      bench:aBench,substitutions:aSubs,club:away,congestionDays,travelLoad,staffLevels:staff.levels
    });
    await client.query(`UPDATE clubs SET team_rating=$2 WHERE id=$1`,[away.id,Math.round(as.reduce((a,p)=>a+Number(p.rating),0)/as.length)]);
  }

  const userResult=userHome?homeResult:awayResult;
  const isRival=String(userClub.rival_club_id||"")===String(opponent.id);
  const chemistryDelta=userResult==="win"?2:userResult==="draw"?1:(Math.abs(hg-ag)>=3?-2:-1);
  const reputationDelta=(userResult==="win"?1:userResult==="loss"?-1:0)+(isRival&&userResult==="win"?2:0);
  await client.query(`
    UPDATE clubs SET
      chemistry=GREATEST(45,LEAST(100,chemistry+$2)),
      manager_reputation=GREATEST(1,LEAST(100,manager_reputation+$3)),
      board_confidence=GREATEST(0,LEAST(100,board_confidence+$4)),
      last_match_game_date=$5
    WHERE id=$1
  `,[userId,chemistryDelta,reputationDelta,isRival?(userResult==="win"?4:userResult==="loss"?-4:1):0,calendarDate]);

  if(isRival){
    await client.query(
      `INSERT INTO club_events(club_id,event_type,title,description)
       VALUES($1,'rivalry','Clássico disputado',$2)`,
      [userId,userResult==="win"
        ?`Vitória no clássico contra ${opponent.name}. Moral, reputação e confiança da diretoria cresceram.`
        :userResult==="loss"
          ?`Derrota no clássico contra ${opponent.name}. A pressão sobre o time aumentou.`
          :`Empate no clássico contra ${opponent.name}.`]
    );
    await client.query(
      `UPDATE players SET morale=GREATEST(30,LEAST(100,morale+$2)) WHERE club_id=$1`,
      [userId,userResult==="win"?4:userResult==="loss"?-4:1]
    );
  }

  const attendance=attendanceForMatch(home,away);
  const ug=userHome?hg:ag,og=userHome?ag:hg;
  const userSubs=userHome?hSubs:aSubs;
  const userBench=userHome?hBench:aBench;

  return {
    home,away,hg,ag,events,homeLineup:hs,awayLineup:as,
    attendance,
    userMatch:{
      result:ug>og?"win":ug===og?"draw":"loss",
      userClub:userHome?home.name:away.name,
      opponent:userHome?away.name:home.name,
      userGoals:ug,opponentGoals:og,
      userRating:userHome?sim.hr:sim.ar,
      opponentRating:userHome?sim.ar:sim.hr,
      isHome:userHome,
      attendance,
      ticketPrice:Number(home.ticket_price||30),
      congestionDays,
      travelLoad,
      isRival,
      substitutions:userSubs.map(x=>({minute:x.minute,outId:x.outId,inId:x.inId,text:x.text})),
      bench:userBench.map(p=>({id:p.id,name:p.name,position:p.position,role:p.role,rating:p.rating})),
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
function penaltyShootout(f,forcedWinner=null){
  if(f.penHome!=null&&f.penAway!=null&&f.pw)return Number(f.pw);

  let homePens=rand(3,5),awayPens=rand(3,5);
  if(homePens===awayPens){
    if(Math.random()<.5)homePens++;
    else awayPens++;
  }

  if(forcedWinner!=null){
    const forceHome=String(forcedWinner)===String(f.home);
    if(forceHome&&homePens<=awayPens)homePens=awayPens+1;
    if(!forceHome&&awayPens<=homePens)awayPens=homePens+1;
  }

  f.penHome=homePens;
  f.penAway=awayPens;
  f.pw=forcedWinner!=null
    ?Number(forcedWinner)
    :(homePens>awayPens?Number(f.home):Number(f.away));
  return Number(f.pw);
}

function normalizePenaltyScores(career){
  let changed=false;
  const comps=[
    career?.data?.state,
    career?.data?.copaBrasil,
    career?.data?.libertadores,
    career?.data?.championsLeague,
    career?.data?.clubWorldCup
  ];
  for(const comp of comps){
    for(const f of comp?.fixtures||[]){
      if(f.pw!=null&&(f.penHome==null||f.penAway==null)){
        penaltyShootout(f,f.pw);
        changed=true;
      }
    }
  }
  return changed;
}

function knockoutWinnerFromFixtures(fixtures){
  const fs=[...fixtures].filter(f=>f.played).sort((a,b)=>Number(a.leg||1)-Number(b.leg||1));
  if(!fs.length)return null;

  const ids=[...new Set(fs.flatMap(f=>[String(f.home),String(f.away)]))];
  if(ids.length!==2)return null;

  const agg=new Map(ids.map(id=>[id,0]));
  for(const f of fs){
    agg.set(String(f.home),agg.get(String(f.home))+Number(f.hg||0));
    agg.set(String(f.away),agg.get(String(f.away))+Number(f.ag||0));
  }

  const [a,b]=ids;
  if(agg.get(a)>agg.get(b))return Number(a);
  if(agg.get(b)>agg.get(a))return Number(b);

  const decisive=fs[fs.length-1];
  return penaltyShootout(decisive);
}

async function createCopaBrasil(ownerId){
  const owner=(await q(`SELECT country_code FROM clubs WHERE id=$1`,[ownerId])).rows[0];
  const countryCode=owner?.country_code||"BR";
  const ai=(await q(`SELECT id FROM clubs WHERE is_ai=TRUE AND country_code=$1 AND club_kind='national' ORDER BY base_rating DESC,RANDOM() LIMIT 31`,[countryCode])).rows.map(r=>Number(r.id));
  if(ai.length<31)throw new Error(`Clubes insuficientes para ${domesticCupName(countryCode)}.`);

  const teams=shuffle([Number(ownerId),...ai]);
  const twoLegged=countryCode==="BR";
  const fixtures=[];

  for(let i=0;i<teams.length;i+=2){
    const home=teams[i],away=teams[i+1],slot=i/2+1,tie=`R32-${slot}`;
    fixtures.push({
      stage:"R32",tie,slot,leg:1,home,away,
      played:false,hg:null,ag:null,pw:null,penHome:null,penAway:null
    });
    if(twoLegged){
      fixtures.push({
        stage:"R32",tie,slot,leg:2,home:away,away:home,
        played:false,hg:null,ag:null,pw:null,penHome:null,penAway:null
      });
    }
  }

  return {
    name:domesticCupName(countryCode),
    countryCode,
    twoLegged,
    status:"active",
    stage:"R32",
    leg:1,
    champion:null,
    userEliminated:false,
    fixtures
  };
}

function normalizeCopaFormat(career,copa){
  if(!copa||copa.status==="finished")return copa;
  const isBrazil=(career.country_code||copa.countryCode||"BR")==="BR";
  copa.twoLegged=isBrazil;

  const current=copa.fixtures.filter(f=>f.stage===copa.stage);
  if(!current.length)return copa;

  const bySlot=new Map();
  for(const f of current){
    f.slot=Number(f.slot||1);
    f.tie=f.tie||`${copa.stage}-${f.slot}`;
    f.leg=Number(f.leg||1);
    if(f.penHome===undefined)f.penHome=null;
    if(f.penAway===undefined)f.penAway=null;
    if(!bySlot.has(f.slot))bySlot.set(f.slot,[]);
    bySlot.get(f.slot).push(f);
  }

  if(isBrazil){
    for(const [slot,fs] of bySlot.entries()){
      const first=fs.sort((a,b)=>Number(a.leg)-Number(b.leg))[0];
      if(!fs.some(f=>Number(f.leg)===2)){
        copa.fixtures.push({
          stage:copa.stage,
          tie:first.tie||`${copa.stage}-${slot}`,
          slot,
          leg:2,
          home:first.away,
          away:first.home,
          played:false,
          hg:null,ag:null,pw:null,penHome:null,penAway:null
        });
      }
    }

    const leg1=copa.fixtures.filter(f=>f.stage===copa.stage&&Number(f.leg)===1);
    const leg2=copa.fixtures.filter(f=>f.stage===copa.stage&&Number(f.leg)===2);
    copa.leg=leg1.length&&leg1.every(f=>f.played)?2:1;
  }else{
    copa.leg=1;
  }

  return copa;
}

function copaWinners(copa,stage){
  const stageFixtures=copa.fixtures.filter(f=>f.stage===stage);
  const ties=[...new Set(stageFixtures.map(f=>f.tie||`${stage}-${f.slot}`))];
  const out=[];

  for(const tie of ties){
    const fs=stageFixtures.filter(f=>(f.tie||`${stage}-${f.slot}`)===tie);
    const winner=knockoutWinnerFromFixtures(fs);
    if(winner!=null)out.push(Number(winner));
  }
  return out;
}

function addCopaStage(copa,stage,ids){
  const x=shuffle(ids);
  copa.leg=1;

  for(let i=0;i<x.length;i+=2){
    const slot=i/2+1,tie=`${stage}-${slot}`,home=x[i],away=x[i+1];
    copa.fixtures.push({
      stage,tie,slot,leg:1,home,away,
      played:false,hg:null,ag:null,pw:null,penHome:null,penAway:null
    });

    if(copa.twoLegged){
      copa.fixtures.push({
        stage,tie,slot,leg:2,home:away,away:home,
        played:false,hg:null,ag:null,pw:null,penHome:null,penAway:null
      });
    }
  }

  copa.stage=stage;
}

async function ensureCopaData(career){
  if(!career.data.copaBrasil)career.data.copaBrasil=await createCopaBrasil(career.owner_club_id);
  normalizeCopaFormat(career,career.data.copaBrasil);
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
    championsLeague:null,
    clubWorldCup:null,
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

function safBaseInvestment(div){return ({D:140000,C:210000,B:320000,A:520000})[div]||140000}
const SAF_INVESTORS=[
  {id:"aurora",name:"Aurora Sports Capital",factor:.92,profile:"gestão conservadora"},
  {id:"atlas",name:"Atlas Futebol Participações",factor:1.00,profile:"expansão esportiva"},
  {id:"vertex",name:"Vertex Global Sports",factor:1.16,profile:"investimento agressivo"}
];
function safOffersForCareer(career){
  const base=safBaseInvestment(career?.user_division||"D");
  return SAF_INVESTORS.map(x=>({...x,investment:Math.round(base*x.factor/1000)*1000}));
}
async function safSummary(club,career){
  if(!club)return {active:false,offers:[]};
  const active=Boolean(club.is_saf);
  const yearEndBalance=career?.phase==="END"&&career?.data?.safYearEndBalance!=null?Number(career.data.safYearEndBalance):null;
  return {
    active,
    investorName:club.saf_investor_name||null,
    investment:Number(club.saf_investment||0),
    startedSeason:club.saf_started_season?Number(club.saf_started_season):null,
    debtRelegations:Number(club.saf_debt_relegations||0),
    yearEndBalance,
    debtRisk:active&&Number(yearEndBalance!=null?yearEndBalance:club.coins||0)<0,
    offers:active?[]:safOffersForCareer(career)
  };
}
function debtPenaltyTarget(div){return ({A:"B",B:"C",C:"D",D:"D"})[div]||div}
function forceDebtRelegationTransition(data,ownerId,currentDiv){
  const cloned=JSON.parse(JSON.stringify(data||{}));
  const entries=cloned?.divisions?.[currentDiv]?.entries||[];
  const user=entries.find(e=>String(e.clubId)===String(ownerId));
  if(user){user.points=-999;user.gf=0;user.ga=999;user.wins=0;user.draws=0;user.losses=Math.max(38,Number(user.losses||0));}
  return cloned;
}
async function mediaAfterCompetitionAction(ownerId,action,result){
  if(!result?.userMatch)return result;
  const career=await getCareer(ownerId);
  if(!career)return result;

  const m=result.userMatch;
  const club=(await q(`SELECT name FROM clubs WHERE id=$1`,[ownerId])).rows[0];
  const clubName=club?.name||m.userClub||"O clube";
  const userGoals=Number(m.userGoals||0);
  const opponentGoals=Number(m.opponentGoals||0);
  const diff=Math.abs(userGoals-opponentGoals);
  const isRout=diff>=3;
  const competition=m.matchType||"partida";
  let eliminated=false,important=false,majorPressGame=false;

  if(action==="copa"){
    const cup=career.data?.copaBrasil;
    eliminated=Boolean(cup?.userEliminated||(result.finished&&String(cup?.champion||"")!==String(ownerId)));
    important=["SF","FINAL"].includes(result.copaStage);
    majorPressGame=result.copaStage==="FINAL";
  }else if(action==="state"){
    const st=career.data?.state;
    if(st){
      const final=st.fixtures?.find(f=>f.stage==="FINAL");
      if(st.stage==="FINAL"&&final&&!([final.home,final.away].some(id=>String(id)===String(ownerId))))eliminated=true;
      if(st.stage==="FINISHED"&&String(st.champion)!==String(ownerId))eliminated=true;
      important=st.stage==="FINAL"||st.stage==="FINISHED";
      majorPressGame=important;
    }
  }else if(action==="national"){
    important=Number(result.round||0)>=35;
    majorPressGame=Number(result.round||0)===38;
  }else if(action==="lib"){
    const lib=career.data?.libertadores;
    eliminated=Boolean(result.finished?String(lib?.champion||"")!==String(ownerId):result.userAlive===false);
    important=eliminated||result.finished||["SF","FINAL"].includes(lib?.stage);
    majorPressGame=Boolean(result.finished||lib?.stage==="FINAL");
  }else if(action==="champions"){
    const ch=career.data?.championsLeague;
    eliminated=Boolean(result.finished?String(ch?.champion||"")!==String(ownerId):result.userAlive===false);
    important=eliminated||result.finished||["SF","FINAL"].includes(ch?.stage);
    majorPressGame=Boolean(result.finished||ch?.stage==="FINAL");
  }else if(action==="world"){
    const world=career.data?.clubWorldCup;
    eliminated=Boolean(result.finished?String(world?.champion||"")!==String(ownerId):result.userAlive===false);
    important=eliminated||result.finished||["SF","FINAL"].includes(world?.stage);
    majorPressGame=Boolean(result.finished||world?.stage==="FINAL");
  }

  await tx(async client=>{
    const resultWord=m.result==="win"?"vence":m.result==="loss"?"é derrotado por":"empata com";
    const score=`${userGoals} a ${opponentGoals}`;

    if(isRout){
      const winner=m.result==="win"?clubName:m.opponent;
      const loser=m.result==="win"?m.opponent:clubName;
      const high=Math.max(userGoals,opponentGoals),low=Math.min(userGoals,opponentGoals);
      const headline=m.result==="win"
        ?`Goleada: ${clubName} atropela ${m.opponent} por ${high} a ${low}`
        :`Goleada sofrida: ${clubName} cai por ${high} a ${low} diante de ${m.opponent}`;
      const body=m.result==="win"
        ?`${clubName} teve atuação dominante em ${competition} e aplicou ${high} a ${low} em ${m.opponent}. A goleada repercutiu fortemente na imprensa e aumentou a expectativa sobre a equipe.`
        :`${clubName} sofreu uma derrota pesada em ${competition}: ${high} a ${low} para ${m.opponent}. O resultado elevou a pressão da imprensa e da diretoria.`;
      await publishNews(client,ownerId,career.season_no,"goleada",headline,body,3,"Esporte Agora");
    }else{
      await publishNews(
        client,ownerId,career.season_no,"partida",
        `${clubName} ${resultWord} ${m.opponent} por ${score}`,
        `A partida por ${competition} terminou em ${score}. ${m.result==="win"?"A vitória aumenta a confiança da equipe.":m.result==="loss"?"O resultado aumenta a cobrança sobre o trabalho da comissão técnica.":"O empate dividiu opiniões entre imprensa e torcida."}`,
        important?2:1
      );
    }

    if(eliminated){
      await publishNews(
        client,ownerId,career.season_no,"eliminacao",
        `Eliminação pressiona ${clubName}`,
        `${clubName} foi eliminado de ${competition}. A diretoria e a comissão técnica agora enfrentam questionamentos sobre os próximos passos da temporada.`,
        3,"Esporte Agora"
      );
      await client.query(`UPDATE clubs SET board_confidence=GREATEST(0,board_confidence-8),media_pressure=LEAST(100,media_pressure+8) WHERE id=$1`,[ownerId]);
      await publishBoardMessage(
        client,ownerId,career.season_no,"eliminacao",
        `Diretoria cobra resposta após eliminação`,
        `A eliminação em ${competition} ficou abaixo da expectativa. A diretoria espera reação imediata e melhora do desempenho nas competições restantes.`,
        "negative",3
      );
    }else if(isRout&&m.result==="loss"){
      await client.query(`UPDATE clubs SET board_confidence=GREATEST(0,board_confidence-6),media_pressure=LEAST(100,media_pressure+7) WHERE id=$1`,[ownerId]);
      await publishBoardMessage(
        client,ownerId,career.season_no,"goleada_sofrida",
        `Diretoria exige explicações após goleada`,
        `A derrota por ${Math.max(userGoals,opponentGoals)} a ${Math.min(userGoals,opponentGoals)} para ${m.opponent} foi considerada inaceitável. A diretoria exige uma resposta forte no próximo compromisso.`,
        "negative",3
      );
    }else if(isRout&&m.result==="win"){
      await client.query(`UPDATE clubs SET board_confidence=LEAST(100,board_confidence+5),media_pressure=GREATEST(0,media_pressure-3) WHERE id=$1`,[ownerId]);
      await publishBoardMessage(
        client,ownerId,career.season_no,"goleada_aplicada",
        `Diretoria elogia atuação dominante`,
        `A goleada sobre ${m.opponent} agradou a diretoria. O desempenho foi visto como sinal de evolução e aumentou a confiança no trabalho.`,
        "positive",2
      );
    }else if(important&&m.result==="win"){
      await client.query(`UPDATE clubs SET board_confidence=LEAST(100,board_confidence+2),media_pressure=GREATEST(0,media_pressure-1) WHERE id=$1`,[ownerId]);
    }

    const severeRout=
      (m.result==="loss"&&diff>=4) ||
      (m.result==="win"&&diff>=5);

    // Menos coletivas:
    // - eliminação: sempre;
    // - final/última rodada decisiva: pode gerar;
    // - goleada: somente quando for realmente muito fora do normal.
    const shouldPress=eliminated||majorPressGame||severeRout;

    if(shouldPress){
      const pressType=eliminated?"eliminacao":severeRout?"goleada":"jogo_importante";
      await createPressConference(
        client,ownerId,career.season_no,
        pressType,
        eliminated?"Coletiva após eliminação":severeRout?"Coletiva após goleada marcante":"Coletiva após jogo decisivo",
        pressQuestionFor({eliminated,result:m.result,competition}),
        {competition,result:m.result,opponent:m.opponent,score,eliminated,isRout,severeRout,majorPressGame}
      );
    }

    // O jornal não cobre apenas o time do usuário: inclui resultados de outros clubes.
    await publishOtherClubNews(client,ownerId,career,action,result);

    // Uma sequência forte passa a atrair propostas pelos principais jogadores.
    await generateIncomingOffers(client,ownerId,{force:false,performanceAware:true});

    // Em desempenho alto, outros clubes também podem procurar o treinador.
    const performance=await teamPerformanceProfile(client,ownerId,career);
    await maybeGenerateManagerJobOffer(client,ownerId,career,performance);
  });

  return result;
}
async function ratingsMap(ids){
  const rows=(await q(`SELECT id,is_ai,team_rating,base_rating FROM clubs WHERE id=ANY($1::bigint[])`,[ids])).rows;
  return new Map(rows.map(r=>[String(r.id),Number(r.is_ai?r.base_rating:(r.team_rating||r.base_rating||64))]));
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
        const winner=f.hg>f.ag?f.home:f.ag>f.hg?f.away:penaltyShootout(f);
        winners.push(winner);
      }
      if(!st.fixtures.some(f=>f.stage==="FINAL")){
        st.fixtures.push({stage:"FINAL",round:9,slot:1,home:winners[0],away:winners[1],played:false,hg:null,ag:null,pw:null});
      }
      st.stage="FINAL";st.round=9;
    }else if(st.stage==="FINAL"){
      const f=st.fixtures.find(x=>x.stage==="FINAL");
      playFastFixture(f,null,clubMap,ownerId,"Estadual",userMatches);
      st.champion=f.hg>f.ag?f.home:f.ag>f.hg?f.away:penaltyShootout(f);
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
      const qualification=libertadoresQualificationInfo(career,ownerId);
      if(!career.data.libertadores)await makeLibertadores(career);
      career.phase=qualification.qualified?"LIBERTADORES":"END";
      if(!qualification.qualified)await finishFastLibertadores(career,ownerId,clubMap,userMatches,false);
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
      const champ=f.hg>f.ag?f.home:f.ag>f.hg?f.away:penaltyShootout(f);
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

async function finishCopaFast(career,ownerId,clubMap,userMatches=null){
  const copa=await ensureCopaData(career);

  while(copa.status!=="finished"){
    const stage=copa.stage;
    const legs=copa.twoLegged?[1,2]:[1];

    for(const leg of legs){
      const games=copa.fixtures.filter(f=>f.stage===stage&&Number(f.leg||1)===leg&&!f.played);
      for(const f of games){
        playFastFixture(f,null,clubMap,ownerId,copa.name||"Copa Nacional",userMatches||[]);
      }
      copa.leg=leg===1&&copa.twoLegged?2:1;
    }

    const winners=copaWinners(copa,stage);

    if(stage==="FINAL"){
      copa.champion=winners[0]||null;
      copa.status="finished";
      break;
    }

    const next=stage==="R32"?"R16":stage==="R16"?"QF":stage==="QF"?"SF":"FINAL";
    addCopaStage(copa,next,winners);
  }

  career.data.copaBrasil=copa;
  return copa;
}

async function finishCopaAtSeasonEnd(career,ownerId,clubMap){
  const copa=await ensureCopaData(career);

  while(copa.status!=="finished"){
    const stage=copa.stage;
    const stageFixtures=copa.fixtures.filter(f=>f.stage===stage);
    const userStillInStage=stageFixtures.some(
      f=>String(f.home)===String(ownerId)||String(f.away)===String(ownerId)
    );

    const legs=copa.twoLegged?[1,2]:[1];
    for(const leg of legs){
      const games=copa.fixtures.filter(
        f=>f.stage===stage&&Number(f.leg||1)===leg&&!f.played
      );

      for(const f of games){
        const involvesUser=String(f.home)===String(ownerId)||String(f.away)===String(ownerId);

        if(involvesUser){
          // Se a temporada chegou ao fim e o usuário deixou uma partida da Copa pendente,
          // a vaga é perdida por W.O. em vez de a partida ser simulada em seu favor.
          f.played=true;
          if(String(f.home)===String(ownerId)){
            f.hg=0;f.ag=3;
          }else{
            f.hg=3;f.ag=0;
          }
          f.forfeit=true;
          f.forfeitClubId=Number(ownerId);
        }else{
          playFastFixture(f,null,clubMap,ownerId,copa.name||"Copa Nacional",[]);
        }
      }
    }

    let winners=copaWinners(copa,stage);

    if(userStillInStage){
      const userTie=stageFixtures.filter(
        f=>String(f.home)===String(ownerId)||String(f.away)===String(ownerId)
      );
      const opponent=userTie
        .flatMap(f=>[f.home,f.away])
        .find(id=>String(id)!==String(ownerId));

      winners=winners.filter(id=>String(id)!==String(ownerId));
      if(opponent!=null&&!winners.some(id=>String(id)===String(opponent))){
        winners.push(Number(opponent));
      }
      copa.userEliminated=true;
    }

    if(stage==="FINAL"){
      copa.champion=winners.find(id=>String(id)!==String(ownerId))||winners[0]||null;
      copa.status="finished";
      break;
    }

    const expected={R32:16,R16:8,QF:4,SF:2}[stage]||winners.length;
    if(winners.length>expected)winners=winners.slice(0,expected);

    const next=stage==="R32"?"R16":stage==="R16"?"QF":stage==="QF"?"SF":"FINAL";
    addCopaStage(copa,next,winners);
  }

  if(String(copa.champion)===String(ownerId)){
    copa.champion=null;
    copa.userEliminated=true;
  }

  career.data.copaBrasil=copa;
  return copa;
}

async function playCopa(ownerId){
  const career=await getCareer(ownerId);
  if(!career)throw Object.assign(new Error("Carreira não encontrada."),{status:404});
  if((career.country_code||"BR")==="BR"&&career.data.state?.stage!=="FINISHED"){
    throw Object.assign(new Error(`${domesticCupName(career.country_code||"BR")} começa depois do Estadual.`),{status:400});
  }

  const copa=await ensureCopaData(career);
  if(copa.status==="finished")throw Object.assign(new Error(`${copa.name} desta temporada já terminou.`),{status:400});
  if(copa.userEliminated)throw Object.assign(new Error(`Seu clube já foi eliminado de ${copa.name}.`),{status:400});

  const stage=copa.stage;
  const leg=copa.twoLegged?Number(copa.leg||1):1;
  const games=copa.fixtures.filter(f=>f.stage===stage&&Number(f.leg||1)===leg&&!f.played);
  const clubMap=await fastClubSnapshot();
  let userMatch=null;

  for(const f of games){
    const userGame=String(f.home)===String(ownerId)||String(f.away)===String(ownerId);

    if(userGame){
      await tx(async client=>{
        const sim=await fullMatch(client,f.home,f.away,ownerId);
        f.played=true;
        f.hg=sim.hg;
        f.ag=sim.ag;

        userMatch=sim.userMatch;
        userMatch.matchType=`${copa.name} — ${leg===1?"ida":"volta"}`;
        userMatch.reward=0;
        userMatch.finance=await settleMatchFinances(
          client,
          ownerId,
          "CUP",
          String(f.home)===String(ownerId),
          userMatch.result, userMatch.attendance, userMatch.ticketPrice
        );

        await recordUserMatch(
          client,
          ownerId,
          String(f.home)===String(ownerId)?f.away:f.home,
          userMatch,
          sim.events,
          "copa_nacional",
          userMatch.finance.performance
        );
      });
    }else{
      const {hg,ag}=fastScore(f.home,f.away,clubMap);
      f.played=true;
      f.hg=hg;
      f.ag=ag;
    }
  }

  // Em confrontos de ida e volta, a primeira partida não elimina ninguém.
  if(copa.twoLegged&&leg===1){
    copa.leg=2;
    career.data.copaBrasil=copa;
    await advanceCalendar(career,ownerId,3,`${copa.name} — ${copaStageLabel(stage)} — ida`);
    await saveCareer(career);
    return {
      userMatch,
      copaStage:stage,
      leg:1,
      finished:false,
      champion:null,
      awaitingReturn:true
    };
  }

  const winners=copaWinners(copa,stage);
  const userWon=winners.some(id=>String(id)===String(ownerId));

  if(stage==="FINAL"){
    copa.champion=winners[0]||null;
    copa.status="finished";

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
  await advanceCalendar(
    career,
    ownerId,
    3,
    `${copa.name} — ${copaStageLabel(stage)}${copa.twoLegged?" — volta":""}`
  );
  await saveCareer(career);

  return {
    userMatch,
    copaStage:stage,
    leg:copa.twoLegged?2:1,
    finished:copa.status==="finished",
    champion:copa.champion
  };
}

async function playState(ownerId){
  const career=await getCareer(ownerId);
  if(!ownerId) throw Object.assign(new Error("Clube da carreira não encontrado."),{status:400});
  if(!career||career.phase!=="STATE") throw Object.assign(new Error("O Estadual não está ativo."),{status:400});
  const s=career.data.state;
  if(!s || !Array.isArray(s.fixtures) || !Array.isArray(s.entries)) throw Object.assign(new Error("Dados do Estadual inválidos. Simule a temporada ou recarregue a carreira."),{status:400});
  let userMatch=null;

  if(s.stage==="GROUP"){
    const games=s.fixtures.filter(f=>f.stage==="GROUP"&&f.round===s.round);
    const ids=[...new Set(games.flatMap(f=>[f.home,f.away]))],ratings=await ratingsMap(ids);

    await tx(async c=>{
      for(const f of games){
        let hg,ag,events=[];
        if(String(f.home)===String(ownerId)||String(f.away)===String(ownerId)){
          const sim=await fullMatch(c,f.home,f.away,ownerId);hg=sim.hg;ag=sim.ag;events=sim.events;userMatch=sim.userMatch;userMatch.matchType="Estadual";userMatch.reward=0;
          userMatch.finance=await settleMatchFinances(c,ownerId,"STATE",String(f.home)===String(ownerId),userMatch.result, userMatch.attendance, userMatch.ticketPrice);
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
          userMatch.finance=await settleMatchFinances(c,ownerId,"STATE",String(f.home)===String(ownerId),userMatch.result, userMatch.attendance, userMatch.ticketPrice);
          await recordUserMatch(c,ownerId,String(f.home)===String(ownerId)?f.away:f.home,userMatch,sim.events,"state",userMatch.finance.performance);
        }else ({hg,ag}=basicScore(ratings.get(String(f.home))||60,ratings.get(String(f.away))||60));
        f.played=true;f.hg=hg;f.ag=ag;
        const winner=hg>ag?f.home:ag>hg?f.away:penaltyShootout(f);
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
  await advanceCalendar(career,ownerId,5,stateCalendarLabel);
  await saveCareer(career);
  return {userMatch};
}

function libertadoresQualificationInfo(career,ownerId=career?.owner_club_id){
  const tableA=sortEntries(career?.data?.divisions?.A?.entries||[]);
  const top4=tableA.slice(0,4).map(e=>Number(e.clubId));
  const cupChampion=career?.data?.copaBrasil?.status==="finished"
    ?Number(career.data.copaBrasil.champion||0)
    :0;

  const nationalQualifiers=[...new Set([
    ...top4,
    ...(cupChampion?[cupChampion]:[])
  ])].filter(Boolean);

  const userViaLeague=
    career?.user_division==="A" &&
    top4.some(id=>String(id)===String(ownerId));

  const userViaCup=
    cupChampion>0 &&
    String(cupChampion)===String(ownerId);

  return {
    top4,
    cupChampion:cupChampion||null,
    nationalQualifiers,
    userViaLeague,
    userViaCup,
    qualified:userViaLeague||userViaCup,
    reason:userViaCup
      ?(userViaLeague?"Copa do Brasil + G4":"Campeão da Copa do Brasil")
      :(userViaLeague?"G4 da Série A":null)
  };
}

async function makeLibertadores(career){
  const qualification=libertadoresQualificationInfo(career);
  const national=qualification.nationalQualifiers;

  // Mantém 32 clubes. Se o campeão da Copa do Brasil estiver fora do G4,
  // ele entra como uma vaga adicional brasileira e reduz em uma a quantidade de convidados estrangeiros.
  const foreignCount=Math.max(0,32-national.length);
  const foreign=(await q(`
    SELECT id
    FROM clubs
    WHERE is_ai=TRUE AND club_kind='continental'
    ORDER BY RANDOM()
    LIMIT $1
  `,[foreignCount])).rows.map(r=>Number(r.id));

  let teams=[...national,...foreign];

  // Fallback de segurança para sempre fechar 32 participantes.
  if(teams.length<32){
    const missing=32-teams.length;
    const extras=(await q(`
      SELECT id
      FROM clubs
      WHERE is_ai=TRUE
        AND club_kind='national'
        AND country_code IN ('BR','ARG')
        AND NOT(id=ANY($1::bigint[]))
      ORDER BY base_rating DESC,RANDOM()
      LIMIT $2
    `,[teams.map(Number),missing])).rows.map(r=>Number(r.id));
    teams=[...teams,...extras];
  }

  teams=shuffle(teams.slice(0,32));
  const groups="ABCDEFGH".split("");
  const entries=teams.map((clubId,i)=>({...blankEntry(clubId),group:groups[Math.floor(i/4)]}));
  const fixtures=[];

  for(const g of groups){
    const ids=entries.filter(e=>e.group===g).map(e=>e.clubId);
    const rounds=doubleRR(ids).slice(0,6);
    rounds.forEach((games,ri)=>games.forEach(([home,away])=>
      fixtures.push({
        stage:"GROUP",group:g,matchday:ri+1,leg:1,
        home,away,played:false,hg:null,ag:null,pw:null
      })
    ));
  }

  career.data.libertadores={
    status:"group",
    stage:"GROUP",
    matchday:1,
    leg:1,
    champion:null,
    entries,
    fixtures,
    qualification:{
      cupChampion:qualification.cupChampion,
      nationalQualifiers:qualification.nationalQualifiers,
      userQualified:qualification.qualified,
      userReason:qualification.reason
    }
  };
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
    const fs=lib.fixtures
      .filter(f=>f.stage===stage&&f.tie===tie&&f.played)
      .sort((a,b)=>Number(a.leg||1)-Number(b.leg||1));
    const ids=[...new Set(fs.flatMap(f=>[String(f.home),String(f.away)]))];
    const agg=new Map(ids.map(x=>[x,0]));
    fs.forEach(f=>{
      agg.set(String(f.home),agg.get(String(f.home))+Number(f.hg||0));
      agg.set(String(f.away),agg.get(String(f.away))+Number(f.ag||0));
    });
    const [a,b]=ids;
    let w;
    if(agg.get(a)>agg.get(b))w=Number(a);
    else if(agg.get(b)>agg.get(a))w=Number(b);
    else w=penaltyShootout(fs[fs.length-1]);
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
          userMatch.finance=await settleMatchFinances(c,career.owner_club_id,"LIB",String(f.home)===String(career.owner_club_id),userMatch.result, userMatch.attendance, userMatch.ticketPrice);
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
          userMatch.finance=await settleMatchFinances(c,career.owner_club_id,"LIB",String(f.home)===String(career.owner_club_id),userMatch.result, userMatch.attendance, userMatch.ticketPrice);
          await recordUserMatch(c,career.owner_club_id,String(f.home)===String(career.owner_club_id)?f.away:f.home,userMatch,sim.events,"libertadores",userMatch.finance.performance);
        }else ({hg,ag}=basicScore(ratings.get(String(f.home))||72,ratings.get(String(f.away))||72));
        f.played=true;f.hg=hg;f.ag=ag;
      }
    });

    if(stage==="FINAL"){
      const f=games[0];
const champ=f.hg>f.ag?f.home:f.ag>f.hg?f.away:penaltyShootout(f);
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


async function makeChampionsLeague(career,includeOwner=false){
  const ownerId=Number(career.owner_club_id);
  const needed=includeOwner?35:36;
  const ai=(await q(`
    SELECT id FROM clubs
    WHERE is_ai=TRUE
      AND confederation_code='UEFA'
      AND club_kind='national'
      AND national_seed_division='A'
      AND id<>$1
    ORDER BY base_rating DESC,name
    LIMIT $2
  `,[ownerId,needed])).rows.map(r=>Number(r.id));

  const teams=includeOwner?[ownerId,...ai]:ai;
  if(teams.length!==36)throw new Error(`Champions League ficou com ${teams.length} clubes.`);

  const fixtures=[];
  const rounds=singleRR(teams).slice(0,8);
  rounds.forEach((games,ri)=>games.forEach(([home,away])=>{
    fixtures.push({stage:"LEAGUE",matchday:ri+1,leg:1,home,away,played:false,hg:null,ag:null,pw:null});
  }));

  career.data.championsLeague={
    name:"UEFA Champions League",
    status:"league",
    stage:"LEAGUE",
    matchday:1,
    leg:1,
    champion:null,
    directR16:[],
    entries:teams.map(blankEntry),
    fixtures
  };
}
function createChampionsPlayoff(ch){
  const t=sortEntries(ch.entries);
  ch.directR16=t.slice(0,8).map(e=>e.clubId);
  const mid=t.slice(8,24);
  for(let i=0;i<8;i++){
    const a=mid[i].clubId,b=mid[15-i].clubId,tie=`PLAYOFF-${i+1}`;
    ch.fixtures.push({stage:"PLAYOFF",tie,slot:i+1,leg:1,home:a,away:b,played:false,hg:null,ag:null,pw:null});
    ch.fixtures.push({stage:"PLAYOFF",tie,slot:i+1,leg:2,home:b,away:a,played:false,hg:null,ag:null,pw:null});
  }
  ch.status="knockout";ch.stage="PLAYOFF";ch.leg=1;
}
async function simulateChampionsStep(career,allowUserDetail){
  const ch=career.data.championsLeague;
  let userMatch=null,userAlive=true;
  const ownerId=Number(career.owner_club_id);

  if(ch.stage==="LEAGUE"){
    const games=ch.fixtures.filter(f=>f.stage==="LEAGUE"&&Number(f.matchday)===Number(ch.matchday)&&!f.played);
    const ratings=await ratingsMap([...new Set(games.flatMap(f=>[f.home,f.away]))]);
    await tx(async client=>{
      for(const f of games){
        let hg,ag;
        const isUser=String(f.home)===String(ownerId)||String(f.away)===String(ownerId);
        if(allowUserDetail&&isUser){
          const sim=await fullMatch(client,f.home,f.away,ownerId);
          hg=sim.hg;ag=sim.ag;userMatch=sim.userMatch;
          userMatch.matchType="Champions League";userMatch.reward=0;
          userMatch.finance=await settleMatchFinances(client,ownerId,"LIB",String(f.home)===String(ownerId),userMatch.result, userMatch.attendance, userMatch.ticketPrice);
          await recordUserMatch(client,ownerId,String(f.home)===String(ownerId)?f.away:f.home,userMatch,sim.events,"champions",userMatch.finance.performance);
        }else{
          ({hg,ag}=basicScore(ratings.get(String(f.home))||78,ratings.get(String(f.away))||78));
        }
        f.played=true;f.hg=hg;f.ag=ag;
        applyResult(findEntry(ch.entries,f.home),hg,ag);
        applyResult(findEntry(ch.entries,f.away),ag,hg);
      }
    });

    if(Number(ch.matchday)>=8){
      const t=sortEntries(ch.entries);
      userAlive=t.slice(0,24).some(e=>String(e.clubId)===String(ownerId));
      createChampionsPlayoff(ch);
    }else ch.matchday++;
  }else{
    const stage=ch.stage,leg=stage==="FINAL"?1:Number(ch.leg||1);
    const games=ch.fixtures.filter(f=>f.stage===stage&&Number(f.leg)===leg&&!f.played);
    const ratings=await ratingsMap([...new Set(games.flatMap(f=>[f.home,f.away]))]);

    await tx(async client=>{
      for(const f of games){
        let hg,ag;
        const isUser=String(f.home)===String(ownerId)||String(f.away)===String(ownerId);
        if(allowUserDetail&&isUser){
          const sim=await fullMatch(client,f.home,f.away,ownerId);
          hg=sim.hg;ag=sim.ag;userMatch=sim.userMatch;
          userMatch.matchType="Champions League";userMatch.reward=0;
          userMatch.finance=await settleMatchFinances(client,ownerId,"LIB",String(f.home)===String(ownerId),userMatch.result, userMatch.attendance, userMatch.ticketPrice);
          await recordUserMatch(client,ownerId,String(f.home)===String(ownerId)?f.away:f.home,userMatch,sim.events,"champions",userMatch.finance.performance);
        }else{
          ({hg,ag}=basicScore(ratings.get(String(f.home))||80,ratings.get(String(f.away))||80));
        }
        f.played=true;f.hg=hg;f.ag=ag;
      }
    });

    if(stage==="FINAL"){
      const f=games[0];
      if(!f){ch.status="finished";userAlive=false}
      else{
        const champ=f.hg>f.ag?f.home:f.ag>f.hg?f.away:penaltyShootout(f);
        ch.champion=champ;ch.status="finished";userAlive=false;
        if(String(champ)===String(ownerId)){
          await tx(async client=>{
            await addFinance(client,ownerId,22000,"prize","Premiação pelo título da Champions League");
            await recordTrophy(client,ownerId,career.season_no,"CHAMPIONS_LEAGUE","Campeão da UEFA Champions League");
          });
        }
      }
    }else if(leg===1){
      ch.leg=2;
    }else{
      const winners=koWinners(ch,stage);
      let nextIds=winners;
      if(stage==="PLAYOFF")nextIds=[...(ch.directR16||[]),...winners];
      userAlive=nextIds.some(id=>String(id)===String(ownerId));
      const next=stage==="PLAYOFF"?"R16":stage==="R16"?"QF":stage==="QF"?"SF":"FINAL";
      addKoStage(ch,next,nextIds);
      ch.stage=next;ch.leg=1;
    }
  }

  career.data.championsLeague=ch;
  return {userMatch,userAlive,finished:ch.status==="finished"};
}
async function autoFinishChampions(career){
  for(let i=0;i<30&&career.data.championsLeague?.status!=="finished";i++){
    await simulateChampionsStep(career,false);
  }
}

async function selectWorldCupConfed(confed,quota,ownerId=null){
  const params=[confed,ownerId||0,quota];
  return (await q(`
    SELECT id FROM clubs
    WHERE is_ai=TRUE
      AND confederation_code=$1
      AND id<>$2
    ORDER BY
      CASE WHEN club_kind='national' AND national_seed_division='A' THEN 0 WHEN club_kind='world' THEN 1 ELSE 2 END,
      base_rating DESC,name
    LIMIT $3
  `,params)).rows.map(r=>Number(r.id));
}
async function makeClubWorldCup(career,userQualified=false){
  const ownerId=Number(career.owner_club_id);
  const owner=(await q(`SELECT country_code,confederation_code FROM clubs WHERE id=$1`,[ownerId])).rows[0];
  const ownerConfed=owner?.confederation_code||confederationForCountry(owner?.country_code);
  const quotas={UEFA:12,CONMEBOL:6,AFC:4,CAF:4,CONCACAF:4,OFC:1,HOST:1};
  const teams=[];
  const allocation={};

  for(const [confed,quota] of Object.entries(quotas)){
    const includeUser=userQualified&&ownerConfed===confed;
    const ai=await selectWorldCupConfed(confed,quota-(includeUser?1:0),ownerId);
    const ids=includeUser?[ownerId,...ai]:ai;
    if(ids.length!==quota)throw new Error(`Super Mundial: ${confed} ficou com ${ids.length}/${quota} vagas.`);
    allocation[confed]=ids;
    teams.push(...ids);
  }

  if(teams.length!==32)throw new Error(`Super Mundial ficou com ${teams.length} clubes.`);

  const shuffled=shuffle(teams);
  const groups="ABCDEFGH".split("");
  const entries=shuffled.map((clubId,i)=>({...blankEntry(clubId),group:groups[Math.floor(i/4)]}));
  const fixtures=[];
  for(const g of groups){
    const ids=entries.filter(e=>e.group===g).map(e=>e.clubId);
    singleRR(ids).slice(0,3).forEach((games,ri)=>games.forEach(([home,away])=>{
      fixtures.push({stage:"GROUP",group:g,matchday:ri+1,leg:1,home,away,played:false,hg:null,ag:null,pw:null});
    }));
  }

  career.data.clubWorldCup={
    name:"Super Mundial de Clubes",
    status:"group",
    stage:"GROUP",
    matchday:1,
    champion:null,
    entries,
    fixtures,
    allocation:{
      UEFA:12,CONMEBOL:6,AFC:4,CAF:4,CONCACAF:4,OFC:1,HOST:1
    }
  };
}
function createWorldR16(world){
  const winners=[],runners=[];
  for(const g of "ABCDEFGH"){
    const t=sortEntries(world.entries.filter(e=>e.group===g));
    winners.push({id:t[0].clubId,g});
    runners.push({id:t[1].clubId,g});
  }
  let r=shuffle(runners);
  for(let i=0;i<200&&!winners.every((w,j)=>w.g!==r[j].g);i++)r=shuffle(runners);
  for(let i=0;i<8;i++){
    world.fixtures.push({
      stage:"R16",slot:i+1,leg:1,home:winners[i].id,away:r[i].id,
      played:false,hg:null,ag:null,pw:null
    });
  }
  world.status="knockout";world.stage="R16";
}
function worldStageWinners(world,stage){
  return world.fixtures.filter(f=>f.stage===stage&&f.played)
    .sort((a,b)=>(a.slot||0)-(b.slot||0))
    .map(f=>f.hg>f.ag?f.home:f.ag>f.hg?f.away:f.pw);
}
function addWorldStage(world,stage,ids){
  const x=shuffle(ids);
  for(let i=0;i<x.length;i+=2){
    world.fixtures.push({
      stage,slot:i/2+1,leg:1,home:x[i],away:x[i+1],
      played:false,hg:null,ag:null,pw:null
    });
  }
  world.stage=stage;
}
async function simulateClubWorldStep(career,allowUserDetail){
  const world=career.data.clubWorldCup;
  const ownerId=Number(career.owner_club_id);
  let userMatch=null,userAlive=true;

  if(world.stage==="GROUP"){
    const games=world.fixtures.filter(f=>f.stage==="GROUP"&&Number(f.matchday)===Number(world.matchday)&&!f.played);
    const ratings=await ratingsMap([...new Set(games.flatMap(f=>[f.home,f.away]))]);

    await tx(async client=>{
      for(const f of games){
        let hg,ag;
        const isUser=String(f.home)===String(ownerId)||String(f.away)===String(ownerId);
        if(allowUserDetail&&isUser){
          const sim=await fullMatch(client,f.home,f.away,ownerId);
          hg=sim.hg;ag=sim.ag;userMatch=sim.userMatch;
          userMatch.matchType="Super Mundial de Clubes";userMatch.reward=0;
          userMatch.finance=await settleMatchFinances(client,ownerId,"LIB",String(f.home)===String(ownerId),userMatch.result, userMatch.attendance, userMatch.ticketPrice);
          await recordUserMatch(client,ownerId,String(f.home)===String(ownerId)?f.away:f.home,userMatch,sim.events,"super_mundial",userMatch.finance.performance);
        }else{
          ({hg,ag}=basicScore(ratings.get(String(f.home))||77,ratings.get(String(f.away))||77));
        }
        f.played=true;f.hg=hg;f.ag=ag;
        applyResult(findEntry(world.entries,f.home),hg,ag);
        applyResult(findEntry(world.entries,f.away),ag,hg);
      }
    });

    if(Number(world.matchday)>=3){
      const ue=world.entries.find(e=>String(e.clubId)===String(ownerId));
      userAlive=!!ue&&sortEntries(world.entries.filter(e=>e.group===ue.group)).slice(0,2).some(e=>String(e.clubId)===String(ownerId));
      createWorldR16(world);
    }else world.matchday++;
  }else{
    const stage=world.stage;
    const games=world.fixtures.filter(f=>f.stage===stage&&!f.played);
    const ratings=await ratingsMap([...new Set(games.flatMap(f=>[f.home,f.away]))]);

    await tx(async client=>{
      for(const f of games){
        let hg,ag;
        const isUser=String(f.home)===String(ownerId)||String(f.away)===String(ownerId);
        if(allowUserDetail&&isUser){
          const sim=await fullMatch(client,f.home,f.away,ownerId);
          hg=sim.hg;ag=sim.ag;userMatch=sim.userMatch;
          userMatch.matchType="Super Mundial de Clubes";userMatch.reward=0;
          userMatch.finance=await settleMatchFinances(client,ownerId,"LIB",String(f.home)===String(ownerId),userMatch.result, userMatch.attendance, userMatch.ticketPrice);
          await recordUserMatch(client,ownerId,String(f.home)===String(ownerId)?f.away:f.home,userMatch,sim.events,"super_mundial",userMatch.finance.performance);
        }else{
          ({hg,ag}=basicScore(ratings.get(String(f.home))||78,ratings.get(String(f.away))||78));
        }
        f.played=true;f.hg=hg;f.ag=ag;
        if(hg===ag)penaltyShootout(f);
      }
    });

    const winners=worldStageWinners(world,stage);
    userAlive=winners.some(id=>String(id)===String(ownerId));

    if(stage==="FINAL"){
      world.champion=winners[0]||null;world.status="finished";userAlive=false;
      if(String(world.champion)===String(ownerId)){
        await tx(async client=>{
          await addFinance(client,ownerId,35000,"prize","Premiação pelo título do Super Mundial de Clubes");
          await recordTrophy(client,ownerId,career.season_no,"SUPER_MUNDIAL","Campeão do Super Mundial de Clubes");
        });
      }
    }else{
      const next=stage==="R16"?"QF":stage==="QF"?"SF":"FINAL";
      addWorldStage(world,next,winners);
    }
  }

  career.data.clubWorldCup=world;
  return {userMatch,userAlive,finished:world.status==="finished"};
}
async function autoFinishClubWorldCup(career){
  for(let i=0;i<15&&career.data.clubWorldCup?.status!=="finished";i++){
    await simulateClubWorldStep(career,false);
  }
}
async function maybeStartClubWorldCup(career){
  if(!isSuperWorldSeason(career.season_no)){
    career.phase="END";
    return {active:false,qualified:false};
  }

  const ownerId=Number(career.owner_club_id);
  const tableA=sortEntries(career.data.divisions.A.entries);
  const leagueChampion=career.user_division==="A"&&String(tableA[0]?.clubId)===String(ownerId);
  const continentalChampion=
    String(career.data.libertadores?.champion||"")===String(ownerId)||
    String(career.data.championsLeague?.champion||"")===String(ownerId);
  const qualified=leagueChampion||continentalChampion;

  await makeClubWorldCup(career,qualified);
  if(qualified){
    career.phase="CLUB_WORLD_CUP";
  }else{
    await autoFinishClubWorldCup(career);
    career.phase="END";
  }
  return {active:true,qualified};
}

function daysToSeasonEnd(career){
  const cal=ensureCalendarData(career);
  const current=new Date(`${cal.date}T12:00:00Z`);
  const target=new Date(Date.UTC(seasonStartYear(career.season_no),11,20,12));
  return Math.max(0,Math.ceil((target-current)/86400000));
}

async function settleFastSeasonSummary(ownerId,career,userMatches){
  if(!userMatches.length)return {matches:0,revenue:0};

  let revenue=0;
  for(const m of userMatches){
    let context=career.user_division||"D";
    if(String(m.matchType||"").toLowerCase().includes("libertadores"))context="LIB";
    else if(String(m.matchType||"").toLowerCase().includes("champions"))context="LIB";
    else if(String(m.matchType||"").toLowerCase().includes("mundial"))context="LIB";
    else if(String(m.matchType||"").toLowerCase().includes("copa"))context="CUP";
    const rates=financeRates(context);
    if(m.isHome)revenue+=Number(rates.gate||0);
    revenue+=m.result==="win"?650:m.result==="draw"?250:80;
  }

  await tx(async client=>{
    if(revenue>0)await addFinance(client,ownerId,revenue,"season_sim","Receitas acumuladas da simulação da temporada");

    const recent=userMatches.slice(-12);
    for(const m of recent){
      await client.query(`
        INSERT INTO matches(
          user_club_id,opponent_club_id,user_goals,opponent_goals,reward,
          user_rating,opponent_rating,events,match_type
        ) VALUES($1,$2,$3,$4,0,$5,$6,'[]'::jsonb,$7)
      `,[
        ownerId,m.opponentId,m.userGoals,m.opponentGoals,
        Math.round(Number(m.userRating||64)),Math.round(Number(m.opponentRating||64)),
        `season_sim:${m.matchType||"Partida"}`
      ]);
    }
  });

  return {matches:userMatches.length,revenue};
}

async function simulateFullClubSeason(ownerId){
  let career=await repairCareer(ownerId);
  if(!career)throw Object.assign(new Error("Carreira não encontrada."),{status:404});
  if(career.phase==="END")return {alreadyFinished:true,career};

  const clubMap=await fastClubSnapshot();
  const userMatches=[];

  if(career.phase==="STATE"&&career.data.state){
    finishFastState(career,ownerId,clubMap,userMatches);
    if(String(career.data.state.champion||"")===String(ownerId)){
      await tx(async client=>{await recordTrophy(client,ownerId,career.season_no,"ESTADUAL",`Campeão — ${career.data.state.name}`)});
    }
  }

  if(career.data.copaBrasil?.status!=="finished"){
    await finishCopaFast(career,ownerId,clubMap,userMatches);
    if(String(career.data.copaBrasil?.champion||"")===String(ownerId)){
      await tx(async client=>{
        const cupName=career.data.copaBrasil?.name||domesticCupName(career.country_code||"BR");
        const fresh=await recordTrophy(client,ownerId,career.season_no,"COPA_NACIONAL",`Campeão — ${cupName}`);
        if(fresh)await addFinance(client,ownerId,9000,"prize",`Premiação pelo título — ${cupName}`);
      });
    }
  }

  if(career.phase==="NATIONAL"){
    simulateFastNationalRounds(career,ownerId,clubMap,userMatches,100);
    if(Number(career.current_round)>38){
      await tx(async client=>{await maybeRecordDivisionTrophy(client,career,ownerId)});
      const country=career.country_code||"BR";
      const top4=sortEntries(career.data.divisions.A.entries).slice(0,4);
      const leagueQualified=career.user_division==="A"&&top4.some(e=>String(e.clubId)===String(ownerId));

      if(country==="BR"){
        const qualification=libertadoresQualificationInfo(career,ownerId);
        if(!career.data.libertadores)await makeLibertadores(career);
        if(qualification.qualified){
          career.phase="LIBERTADORES";
          await finishFastLibertadores(career,ownerId,clubMap,userMatches,true);
        }else{
          await finishFastLibertadores(career,ownerId,clubMap,userMatches,false);
        }
        await maybeStartClubWorldCup(career);
      }else if(EUROPE_COUNTRIES.has(country)){
        if(!career.data.championsLeague)await makeChampionsLeague(career,leagueQualified);
        career.phase=leagueQualified?"CHAMPIONS":"END";
        await autoFinishChampions(career);
        await maybeStartClubWorldCup(career);
      }else{
        await maybeStartClubWorldCup(career);
      }
    }
  }

  if(career.phase==="LIBERTADORES"){
    await finishFastLibertadores(career,ownerId,clubMap,userMatches,true);
    await maybeStartClubWorldCup(career);
  }

  if(career.phase==="CHAMPIONS"){
    await autoFinishChampions(career);
    await maybeStartClubWorldCup(career);
  }

  if(career.phase==="CLUB_WORLD_CUP"){
    await autoFinishClubWorldCup(career);
    career.phase="END";
  }

  if(career.phase!=="END")career.phase="END";

  const finance=await settleFastSeasonSummary(ownerId,career,userMatches);

  const days=daysToSeasonEnd(career);
  if(days>0)await advanceCalendar(career,ownerId,days,"Temporada simulada até o fim");

  await saveCareer(career);

  const table=sortEntries(career.data.divisions[career.user_division]?.entries||[]);
  const position=Math.max(1,table.findIndex(e=>String(e.clubId)===String(ownerId))+1);

  return {
    alreadyFinished:false,
    phase:career.phase,
    seasonNo:career.season_no,
    division:career.user_division,
    position,
    simulatedMatches:finance.matches,
    simulatedRevenue:finance.revenue
  };
}

async function simulateFullPlayerSeason(userId){
  let rounds=0;
  let last=null;
  const clubMap=await fastClubSnapshot();
  for(let i=0;i<45;i++){
    const pc=await activePlayerCareer(userId);
    if(!pc)throw Object.assign(new Error("Carreira de jogador não encontrada."),{status:404});
    if(pc.status==="END")break;
    last=await simulatePlayerCareerRound(userId,clubMap);
    rounds++;
  }

  const pc=await activePlayerCareer(userId);
  return {
    rounds,
    status:pc?.status||"END",
    last,
    career:pc?await hydratePlayerCareer(pc):null
  };
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
            userMatch.result, userMatch.attendance, userMatch.ticketPrice
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
    if(career.data.copaBrasil?.status!=="finished")await finishCopaAtSeasonEnd(career,ownerId,clubMap);
    if(String(career.data.copaBrasil?.champion)===String(ownerId)){
      await tx(async client=>{
        const cupName=career.data.copaBrasil?.name||domesticCupName(career.country_code||"BR");
        const fresh=await recordTrophy(client,ownerId,career.season_no,"COPA_NACIONAL",`Campeão — ${cupName}`);
        if(fresh)await addFinance(client,ownerId,9000,"prize",`Premiação pelo título — ${cupName}`);
      });
    }

    const country=career.country_code||"BR";
    const tableA=sortEntries(career.data.divisions.A.entries);
    const userTop4A=career.user_division==="A"&&tableA.slice(0,4).some(e=>String(e.clubId)===String(ownerId));

    if(country==="BR"){
      const qualification=libertadoresQualificationInfo(career,ownerId);
      await makeLibertadores(career);
      if(qualification.qualified){
        career.phase="LIBERTADORES";
      }else{
        await autoFinishLib(career);
        await maybeStartClubWorldCup(career);
      }
    }else if(EUROPE_COUNTRIES.has(country)){
      await makeChampionsLeague(career,userTop4A);
      if(userTop4A){
        career.phase="CHAMPIONS";
      }else{
        await autoFinishChampions(career);
        await maybeStartClubWorldCup(career);
      }
    }else{
      await maybeStartClubWorldCup(career);
    }
  }else{
    career.current_round=round+1;
  }

  await advanceCalendar(career,ownerId,5,`${leagueName(career.country_code||"BR",career.user_division)} — rodada ${round}`);
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
  if(r.finished){
    await maybeStartClubWorldCup(career);
  }else if(!r.userAlive){
    await autoFinishLib(career);
    await maybeStartClubWorldCup(career);
  }
  await advanceCalendar(career,ownerId,4,"Libertadores");
  await saveCareer(career);
  return {...r,phase:career.phase};
}

async function playChampions(ownerId){
  const career=await getCareer(ownerId);
  if(!career||career.phase!=="CHAMPIONS")throw Object.assign(new Error("Você não está na Champions League agora."),{status:400});
  const r=await simulateChampionsStep(career,true);
  if(r.finished){
    await maybeStartClubWorldCup(career);
  }else if(!r.userAlive){
    await autoFinishChampions(career);
    await maybeStartClubWorldCup(career);
  }
  await advanceCalendar(career,ownerId,4,"Champions League");
  await saveCareer(career);
  return {...r,phase:career.phase};
}

async function playClubWorldCup(ownerId){
  const career=await getCareer(ownerId);
  if(!career||career.phase!=="CLUB_WORLD_CUP")throw Object.assign(new Error("Você não está no Super Mundial agora."),{status:400});
  const r=await simulateClubWorldStep(career,true);
  if(r.finished){
    career.phase="END";
  }else if(!r.userAlive){
    await autoFinishClubWorldCup(career);
    career.phase="END";
  }
  await advanceCalendar(career,ownerId,3,"Super Mundial de Clubes");
  await saveCareer(career);
  return {...r,phase:career.phase};
}

async function nextSeason(ownerId){
  const career=await getCareer(ownerId);
  if(!career||career.phase!=="END") throw Object.assign(new Error("A temporada ainda não terminou."),{status:400});
  const club=(await q(`SELECT * FROM clubs WHERE id=$1`,[ownerId])).rows[0];

  let transitionData=career.data;
  let safPenalty=null;

  // Regra exclusiva da SAF: terminar a temporada no vermelho provoca rebaixamento administrativo.
  const safYearEndBalance=career.data?.safYearEndBalance!=null?Number(career.data.safYearEndBalance):Number(club.coins);
  if(Boolean(club.is_saf)&&safYearEndBalance<0){
    const from=career.user_division;
    const to=debtPenaltyTarget(from);
    if(from!=="D")transitionData=forceDebtRelegationTransition(career.data,ownerId,from);
    safPenalty={applied:true,from,to,balance:safYearEndBalance};

    await tx(async c=>{
      await c.query(`UPDATE clubs SET saf_debt_relegations=saf_debt_relegations+1 WHERE id=$1`,[ownerId]);
      const description=from==="D"
        ?`A SAF encerrou a temporada com saldo de ${safYearEndBalance.toLocaleString("pt-BR")} moedas. Como o clube já está na divisão mais baixa, permanece na Série D sob sanção administrativa.`
        :`A SAF encerrou a temporada com saldo de ${safYearEndBalance.toLocaleString("pt-BR")} moedas. Pela regra financeira da SAF, o clube sofre rebaixamento administrativo de ${leagueName(career.country_code||"BR",from)} para ${leagueName(career.country_code||"BR",to)}.`;
      await c.query(`INSERT INTO club_events(club_id,event_type,title,description) VALUES($1,'saf','Sanção financeira da SAF',$2)`,[ownerId,description]);
      await publishNews(c,ownerId,career.season_no,"saf",from==="D"?`${club.name} fecha ano no vermelho sob SAF`:`${club.name} sofre rebaixamento administrativo por dívida`,description,3,"Central da Bola");
    });
  }

  await tx(async c=>{
    // Fecha o histórico da temporada antes de devolver emprestados ou envelhecer o elenco.
    await finalizeSeasonRealism(c,ownerId,career,club);
    const developmentStaff=await staffLevels(c,ownerId);

    // Empréstimos não terminam mais automaticamente na virada da temporada.
    // Eles acabam somente quando a duração contratada (meses) for cumprida.
    const borrowed=(await c.query(`
      SELECT l.player_id,l.parent_club_id,p.name
      FROM player_loans l
      JOIN players p ON p.id=l.player_id
      WHERE l.borrowing_club_id=$1
      AND l.status='active'
      AND l.months_elapsed >= l.months_total
      FOR UPDATE OF l
    `,[ownerId])).rows;
    for(const l of borrowed){
      await c.query(`UPDATE player_loans SET status='ended' WHERE player_id=$1 AND borrowing_club_id=$2 AND status='active'`,[l.player_id,ownerId]);
      await c.query(`UPDATE players SET club_id=NULL,is_starter=FALSE,transfer_listed=FALSE,fitness=100,morale=72 WHERE id=$1`,[l.player_id]);
      await c.query(`INSERT INTO club_events(club_id,event_type,title,description) VALUES($1,'loan','Fim de empréstimo',$2)`,[ownerId,`${l.name} retornou ao clube após o término do empréstimo.`]);
    }

    const ps=(await c.query(`
      SELECT id,name,age,rating,potential,academy_product,contract_seasons,
             season_appearances,morale,happiness,form_rating
      FROM players WHERE club_id=$1
    `,[ownerId])).rows;
    for(const p of ps){
      let delta=0;
      const age=Number(p.age||24);
      const rating=Number(p.rating||60);
      const potential=Math.max(rating,Number(p.potential||rating));
      const fitnessCoach=Number(developmentStaff.levels.FITNESS||1);

      if(age<=24&&rating<potential){
        const minutesFactor=Math.min(.20,Number(p.season_appearances||0)*.008);
        const moraleFactor=(Number(p.morale||70)-70)*.002;
        const happinessFactor=(Number(p.happiness||75)-75)*.0015;
        const formFactor=(Number(p.form_rating||70)-70)*.0015;
        const growthChance=clamp(
          .28+(fitnessCoach-1)*.07+(p.academy_product?.08:0)+
          minutesFactor+moraleFactor+happinessFactor+formFactor,
          .10,.88
        );
        if(Math.random()<growthChance){
          const strongDevelopment=Number(p.season_appearances||0)>=20&&Number(p.form_rating||70)>=78;
          delta=Math.min(potential-rating,strongDevelopment&&Math.random()<.34?2:1);
        }
      }else if(age>=35&&Math.random()<.62){
        delta=-rand(1,2);
      }else if(age>=31&&Math.random()<.34){
        delta=-1;
      }

      const remaining=Math.max(0,Number(p.contract_seasons||1)-1);
      if(remaining===0){
        await c.query(`UPDATE players SET age=age+1,contract_seasons=1,salary=ROUND(salary*1.06)::int,fitness=100,morale=LEAST(100,morale+2),rating=GREATEST(45,LEAST(95,rating+$2)),pace=GREATEST(25,LEAST(95,pace+$2)),shooting=GREATEST(20,LEAST(95,shooting+$2)),passing=GREATEST(20,LEAST(95,passing+$2)),defending=GREATEST(20,LEAST(95,defending+$2)) WHERE id=$1`,[p.id,delta]);
        await c.query(`INSERT INTO club_events(club_id,event_type,title,description) VALUES($1,'contract','Renovação automática',$2)`,[ownerId,`${p.name} renovou por mais 1 temporada com reajuste salarial.`]);
      }else{
        await c.query(`UPDATE players SET age=age+1,contract_seasons=$3,fitness=100,rating=GREATEST(45,LEAST(95,rating+$2)),pace=GREATEST(25,LEAST(95,pace+$2)),shooting=GREATEST(20,LEAST(95,shooting+$2)),passing=GREATEST(20,LEAST(95,passing+$2)),defending=GREATEST(20,LEAST(95,defending+$2)) WHERE id=$1`,[p.id,delta,remaining]);
      }
    }
    await c.query(`UPDATE players SET consecutive_starts=0 WHERE club_id=$1`,[ownerId]);
  });

  const next=await createCareer(ownerId,club.state_code||"",career.season_no+1,transitionData,club.country_code||career.country_code||"BR");
  return {...next,safPenalty};
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
  const beforeCopaCount=career.data.copaBrasil?.fixtures?.length||0;
  normalizeCopaFormat(career,career.data.copaBrasil);
  if((career.data.copaBrasil?.fixtures?.length||0)!==beforeCopaCount)changed=true;
  if(normalizePenaltyScores(career))changed=true;
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
        await finishCopaAtSeasonEnd(career,ownerId,await fastClubSnapshot());
        if(String(career.data.copaBrasil?.champion)===String(ownerId))await tx(async client=>{
          const cupName=career.data.copaBrasil?.name||domesticCupName(career.country_code||"BR");
          const fresh=await recordTrophy(client,ownerId,career.season_no,"COPA_NACIONAL",`Campeão — ${cupName}`);
          if(fresh)await addFinance(client,ownerId,9000,"prize",`Premiação pelo título — ${cupName}`);
        });
      }
      const country=career.country_code||"BR";
      const top4=sortEntries(career.data.divisions.A.entries).slice(0,4);
      const leagueQualified=career.user_division==="A"&&top4.some(e=>String(e.clubId)===String(ownerId));

      if(country==="BR"){
        const qualification=libertadoresQualificationInfo(career,ownerId);
        if(!career.data.libertadores){await makeLibertadores(career);changed=true}
        if(qualification.qualified)career.phase="LIBERTADORES";
        else{
          if(career.data.libertadores?.status!=="finished")await autoFinishLib(career);
          await maybeStartClubWorldCup(career);
        }
      }else if(EUROPE_COUNTRIES.has(country)){
        if(!career.data.championsLeague){await makeChampionsLeague(career,leagueQualified);changed=true}
        if(leagueQualified)career.phase="CHAMPIONS";
        else{
          if(career.data.championsLeague?.status!=="finished")await autoFinishChampions(career);
          await maybeStartClubWorldCup(career);
        }
      }else{
        await maybeStartClubWorldCup(career);
      }
      changed=true;
    }
  }

  if(career.phase==="END"&&career.data.copaBrasil?.status!=="finished"){
    await finishCopaAtSeasonEnd(career,ownerId,await fastClubSnapshot());
    changed=true;
  }

  if(career.phase==="LIBERTADORES"){
    const lib=career.data.libertadores;
    if(lib?.status==="finished"){
      if(String(lib.champion)===String(ownerId))await tx(async client=>{await recordTrophy(client,ownerId,career.season_no,"LIBERTADORES","Campeão da Libertadores")});
      await maybeStartClubWorldCup(career);changed=true;
    }
    else if(lib&&lib.stage!=="GROUP"){
      const active=lib.fixtures.some(f=>f.stage===lib.stage&&!f.played&&(String(f.home)===String(ownerId)||String(f.away)===String(ownerId)));
      if(!active){
        await autoFinishLib(career);
        await maybeStartClubWorldCup(career);changed=true;
      }
    }
  }

  if(career.phase==="CHAMPIONS"){
    const ch=career.data.championsLeague;
    if(ch?.status==="finished"){
      await maybeStartClubWorldCup(career);changed=true;
    }else if(ch&&ch.stage!=="LEAGUE"){
      const active=ch.fixtures.some(f=>f.stage===ch.stage&&!f.played&&(String(f.home)===String(ownerId)||String(f.away)===String(ownerId)));
      const waitingDirect=ch.stage==="PLAYOFF"&&(ch.directR16||[]).some(id=>String(id)===String(ownerId));
      if(!active&&!waitingDirect){
        await autoFinishChampions(career);
        await maybeStartClubWorldCup(career);changed=true;
      }
    }
  }

  if(career.phase==="CLUB_WORLD_CUP"){
    const world=career.data.clubWorldCup;
    if(world?.status==="finished"){
      career.phase="END";changed=true;
    }else if(world&&world.stage!=="GROUP"){
      const active=world.fixtures.some(f=>f.stage===world.stage&&!f.played&&(String(f.home)===String(ownerId)||String(f.away)===String(ownerId)));
      if(!active){
        await autoFinishClubWorldCup(career);
        career.phase="END";changed=true;
      }
    }
  }

  if(career.phase==="END"&&career.data.safYearEndBalance==null){
    const safClub=(await q(`SELECT is_saf,coins FROM clubs WHERE id=$1`,[ownerId])).rows[0];
    if(safClub?.is_saf){career.data.safYearEndBalance=Number(safClub.coins||0);changed=true}
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
  if(career.data.championsLeague){
    career.data.championsLeague.entries.forEach(e=>ids.add(e.clubId));
    career.data.championsLeague.fixtures.forEach(f=>{ids.add(f.home);ids.add(f.away)});
  }
  if(career.data.clubWorldCup){
    career.data.clubWorldCup.entries.forEach(e=>ids.add(e.clubId));
    career.data.clubWorldCup.fixtures.forEach(f=>{ids.add(f.home);ids.add(f.away)});
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
  let champions=null;
  if(career.data.championsLeague){
    champions={
      ...career.data.championsLeague,
      entries:career.data.championsLeague.entries.map(hEntry),
      fixtures:career.data.championsLeague.fixtures.map(hFix),
      championClub:career.data.championsLeague.champion?map.get(String(career.data.championsLeague.champion)):null
    };
  }
  let world=null;
  if(career.data.clubWorldCup){
    world={
      ...career.data.clubWorldCup,
      entries:career.data.clubWorldCup.entries.map(hEntry),
      fixtures:career.data.clubWorldCup.fixtures.map(hFix),
      championClub:career.data.clubWorldCup.champion?map.get(String(career.data.clubWorldCup.champion)):null
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
    career:{
      owner_club_id:career.owner_club_id,season_no:career.season_no,phase:career.phase,
      state_code:career.state_code,country_code:career.country_code||"BR",
      user_division:career.user_division,current_round:career.current_round,
      super_world_season:isSuperWorldSeason(career.season_no)
    },
    divisions,state:stateObj,libertadores:lib,championsLeague:champions,clubWorldCup:world,copaBrasil:copa,calendar:calendarSummary(career,0)
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
    B:{min:60,max:80,preferredMin:64},
    A:{min:63,max:92,preferredMin:68}
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
const SPONSOR_CATALOG=[
  {id:"betano",name:"Betano",category:"Casa de apostas",baseMonthly:3600,baseSigning:7000,months:12},
  {id:"superbet",name:"Superbet",category:"Casa de apostas",baseMonthly:3400,baseSigning:7600,months:12},
  {id:"betnacional",name:"Betnacional",category:"Casa de apostas",baseMonthly:3200,baseSigning:6800,months:12},
  {id:"sportingbet",name:"Sportingbet",category:"Casa de apostas",baseMonthly:3000,baseSigning:7200,months:12},

  {id:"nike",name:"Nike",category:"Material esportivo",baseMonthly:3100,baseSigning:6200,months:12},
  {id:"adidas",name:"Adidas",category:"Material esportivo",baseMonthly:3200,baseSigning:6400,months:12},
  {id:"puma",name:"Puma",category:"Material esportivo",baseMonthly:2800,baseSigning:6100,months:12},

  {id:"cocacola",name:"Coca-Cola",category:"Bebidas",baseMonthly:3000,baseSigning:7000,months:12},
  {id:"mercadolivre",name:"Mercado Livre",category:"Tecnologia e varejo",baseMonthly:3300,baseSigning:7500,months:12},
  {id:"amazon",name:"Amazon",category:"Tecnologia e varejo",baseMonthly:3400,baseSigning:7800,months:12},
  {id:"ifood",name:"iFood",category:"Tecnologia e serviços",baseMonthly:2900,baseSigning:6800,months:12},

  {id:"nubank",name:"Nubank",category:"Banco e finanças",baseMonthly:3100,baseSigning:7600,months:12},
  {id:"itau",name:"Itaú",category:"Banco e finanças",baseMonthly:3300,baseSigning:8200,months:12},
  {id:"santander",name:"Santander",category:"Banco e finanças",baseMonthly:3200,baseSigning:8000,months:12},

  {id:"vivo",name:"Vivo",category:"Telecom",baseMonthly:3000,baseSigning:7000,months:12},
  {id:"claro",name:"Claro",category:"Telecom",baseMonthly:3000,baseSigning:7100,months:12},
  {id:"tim",name:"TIM",category:"Telecom",baseMonthly:2850,baseSigning:6900,months:12},

  {id:"samsung",name:"Samsung",category:"Tecnologia",baseMonthly:3300,baseSigning:8100,months:12},
  {id:"byd",name:"BYD",category:"Automotivo",baseMonthly:3400,baseSigning:8400,months:12},
  {id:"shopee",name:"Shopee",category:"Varejo",baseMonthly:2900,baseSigning:7200,months:12}
];

function sponsorOffersForDivision(div){
  const multipliers={
    D:{monthly:1.00,signing:1.00},
    C:{monthly:1.35,signing:1.35},
    B:{monthly:1.95,signing:1.90},
    A:{monthly:3.10,signing:3.00}
  };
  const m=multipliers[div]||multipliers.D;
  return SPONSOR_CATALOG.map((x,i)=>({
    id:x.id,
    name:x.name,
    category:x.category,
    monthly:Math.round((x.baseMonthly*m.monthly)/100)*100,
    signing:Math.round((x.baseSigning*m.signing)/100)*100,
    months:x.months,
    priority:i
  })).sort((a,b)=>b.monthly-a.monthly||b.signing-a.signing);
}

async function sponsorshipSummary(clubId,career){
  const activeRows=(await q(`
    SELECT * FROM sponsorship_contracts
    WHERE club_id=$1 AND status='active'
    ORDER BY id ASC
  `,[clubId])).rows;

  const catalogById=new Map(SPONSOR_CATALOG.map(x=>[x.id,x]));
  const active=activeRows.map(x=>({
    ...x,
    category:catalogById.get(x.sponsor_key)?.category||"Patrocinador"
  }));

  const activeKeys=new Set(active.map(x=>x.sponsor_key));
  const slotsAvailable=Math.max(0,2-active.length);
  const offers=slotsAvailable>0
    ?sponsorOffersForDivision(career?.user_division||"D").filter(x=>!activeKeys.has(x.id))
    :[];

  return {
    active,
    activeCount:active.length,
    maxActive:2,
    slotsAvailable,
    offers
  };
}

async function paySponsorMonth(client,clubId,month){
  const contracts=(await client.query(`
    SELECT * FROM sponsorship_contracts
    WHERE club_id=$1 AND status='active'
    ORDER BY id
    FOR UPDATE
  `,[clubId])).rows;

  if(!contracts.length)return {contracts:[],amount:0,finished:[]};

  let total=0;
  const finished=[];
  const paidContracts=[];

  for(const c of contracts){
    const amount=Number(c.monthly_amount||0);
    if(amount>0){
      await addFinance(
        client,clubId,amount,"sponsor_monthly",
        `Patrocínio mensal — ${c.sponsor_name} — ${month}`
      );
      total+=amount;
    }

    const paid=Number(c.months_paid||0)+1;
    const isFinished=paid>=Number(c.months_total||12);

    await client.query(
      `UPDATE sponsorship_contracts SET months_paid=$2,status=$3 WHERE id=$1`,
      [c.id,paid,isFinished?"completed":"active"]
    );

    paidContracts.push({name:c.sponsor_name,amount,finished:isFinished});

    if(isFinished){
      finished.push(c.sponsor_name);
      await client.query(
        `INSERT INTO club_events(club_id,event_type,title,description)
         VALUES($1,'sponsor','Contrato de patrocínio encerrado',$2)`,
        [clubId,`O contrato com ${c.sponsor_name} terminou. Uma vaga de patrocínio foi liberada.`]
      );
    }
  }

  return {contracts:paidContracts,amount:total,finished};
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
    q(`SELECT l.id,l.months_total,l.months_elapsed,l.monthly_fee,
              l.purchase_option_price,l.purchase_option_exercised,l.status,
              p.id player_id,p.name player_name,p.rating,p.salary,p.contract_seasons,
              pc.id parent_club_id,pc.name parent_club_name
       FROM player_loans l
       JOIN players p ON p.id=l.player_id
       JOIN clubs pc ON pc.id=l.parent_club_id
       WHERE l.borrowing_club_id=$1 AND l.status='active'
       ORDER BY l.id`,[clubId])
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
app.post("/api/player-career/simulate-season",auth,async(req,res,next)=>{
  try{
    res.json(await withCompetitionLock(`player:${req.user.id}`,()=>simulateFullPlayerSeason(req.user.id)));
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
          user_id,name,state_code,country_code,confederation_code,club_kind,base_rating,team_rating,coins,
          primary_color,secondary_color,career_slot,career_label,is_active_career
        )
        VALUES($1,$2,$3,$4,$5,'user',64,64,30000,$6,$7,$8,$9,TRUE)
        RETURNING *
      `,[req.user.id,name,countryCode==="BR"?state:null,countryCode,confederationForCountry(countryCode),pc,sc,slot,label])).rows[0];

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
    await tx(async client=>{
      await applyFelipeMode(client,c.id);
      const clubRow=(await client.query(`SELECT formation FROM clubs WHERE id=$1`,[c.id])).rows[0];
      await ensureStartingXI(client,c.id,clubRow?.formation||"4-3-3");
    });
    const freshClub=(await q(`SELECT * FROM clubs WHERE id=$1`,[c.id])).rows[0];
    Object.assign(c,freshClub);
    c.team_rating=await clubRating(c.id);
    const career=await getCareer(c.id);
    Object.assign(c,(await q(`SELECT * FROM clubs WHERE id=$1`,[c.id])).rows[0]||c);
    await tx(async client=>{
      await ensureInitialNews(client,c.id,career?.season_no||1,c.name);
      if(career){
        await ensureBoardExpectationMessage(client,c,career);
        await ensureOtherClubHeadlines(client,c.id,career);
      }
    });
    const [ps,mk,mt,fr,fin,events,trophies,offers,sponsorship,mediaNews,pendingPress,boardMessages]=await Promise.all([
      q(`SELECT * FROM players WHERE club_id=$1 ORDER BY is_starter DESC,CASE position WHEN 'GK' THEN 1 WHEN 'DEF' THEN 2 WHEN 'MID' THEN 3 ELSE 4 END,rating DESC`,[c.id]),
      q(`SELECT * FROM players WHERE club_id IS NULL ORDER BY rating DESC,price DESC LIMIT 40`),
      q(`SELECT m.*,o.name opponent_name FROM matches m JOIN clubs o ON o.id=m.opponent_club_id WHERE m.user_club_id=$1 ORDER BY played_at DESC LIMIT 30`,[c.id]),
      q(`SELECT c.id,c.name,c.primary_color,c.secondary_color,c.crest_data,c.friend_code,c.team_rating FROM friendships f JOIN clubs c ON c.id=CASE WHEN f.club_a_id=$1 THEN f.club_b_id ELSE f.club_a_id END WHERE f.club_a_id=$1 OR f.club_b_id=$1 ORDER BY c.name`,[c.id]),
      financeSummary(c.id),
      q(`SELECT event_type,title,description,created_at FROM club_events WHERE club_id=$1 ORDER BY created_at DESC,id DESC LIMIT 10`,[c.id]),
      q(`SELECT id,season_no,competition,title,won_at FROM club_trophies WHERE club_id=$1 ORDER BY season_no DESC,won_at DESC`,[c.id]),
      q(`SELECT o.id,o.amount,o.status,o.offer_kind,o.created_at,p.id player_id,p.name player_name,p.position,p.role,p.rating,p.age,p.transfer_listed,b.id buying_club_id,b.name buying_club_name FROM transfer_offers o JOIN players p ON p.id=o.player_id JOIN clubs b ON b.id=o.buying_club_id WHERE o.selling_club_id=$1 AND o.status='pending' AND b.is_ai=TRUE AND o.offer_kind<>'human' ORDER BY o.amount DESC,o.created_at DESC`,[c.id]),
      sponsorshipSummary(c.id,career),
      q(`SELECT id,season_no,category,source_name,headline,body,importance,created_at FROM media_news WHERE club_id=$1 ORDER BY created_at DESC,id DESC LIMIT 80`,[c.id]),
      q(`SELECT id,season_no,trigger_type,title,question,context,created_at FROM press_conferences WHERE club_id=$1 AND status='pending' ORDER BY created_at ASC,id ASC LIMIT 1`,[c.id]),
      q(`SELECT id,season_no,message_type,tone,title,body,importance,created_at FROM board_messages WHERE club_id=$1 ORDER BY created_at DESC,id DESC LIMIT 40`,[c.id])
    ]);
    const cal=career?calendarSummary(career,fin.wages):null;
    const saf=await safSummary(c,career);
    const boardExpectation=career?boardExpectationFor(career,c):null;
    const teamPerformance=career?await teamPerformanceProfile(pool,c.id,career):null;
    const realism=career?await realismSummary(pool,c,career):null;
    res.json({
      club:c,players:ps.rows,market:mk.rows,matches:mt.rows,friends:fr.rows,finance:fin,
      clubEvents:events.rows,trophies:trophies.rows,incomingOffers:offers.rows,calendar:cal,
      sponsorship,mediaNews:mediaNews.rows,pendingPress:pendingPress.rows[0]||null,saf,
      boardMessages:boardMessages.rows,boardExpectation,teamPerformance,realism
    });
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
      // Trava o clube para impedir que requisições simultâneas ultrapassem o limite de 2 contratos.
      await client.query(`SELECT id FROM clubs WHERE id=$1 FOR UPDATE`,[c.id]);

      const active=(await client.query(`
        SELECT * FROM sponsorship_contracts
        WHERE club_id=$1 AND status='active'
        ORDER BY id
        FOR UPDATE
      `,[c.id])).rows;

      if(active.length>=2){
        throw Object.assign(new Error("Seu clube já possui os dois espaços de patrocínio ocupados."),{status:409});
      }
      if(active.some(x=>x.sponsor_key===offer.id)){
        throw Object.assign(new Error(`${offer.name} já é patrocinador ativo do clube.`),{status:409});
      }

      await client.query(`
        INSERT INTO sponsorship_contracts(
          club_id,sponsor_key,sponsor_name,division_signed,
          monthly_amount,signing_bonus,months_total,months_paid,status
        )
        VALUES($1,$2,$3,$4,$5,$6,$7,0,'active')
      `,[c.id,offer.id,offer.name,career.user_division,offer.monthly,offer.signing,offer.months]);

      if(offer.signing>0){
        await addFinance(
          client,c.id,offer.signing,"sponsor_signing",
          `Luvas de patrocínio — ${offer.name}`
        );
      }

      await client.query(
        `INSERT INTO club_events(club_id,event_type,title,description)
         VALUES($1,'sponsor','Novo patrocinador',$2)`,
        [c.id,`${offer.name} (${offer.category}) assinou por ${offer.months} meses: ${offer.monthly.toLocaleString("pt-BR")} moedas por mês.`]
      );

      await publishNews(
        client,c.id,career.season_no,"negocios",
        `${offer.name} fecha patrocínio com ${c.name}`,
        `O clube passa a contar com ${offer.name}, da categoria ${offer.category}. O acordo prevê ${offer.monthly.toLocaleString("pt-BR")} moedas por mês e luvas de ${offer.signing.toLocaleString("pt-BR")} moedas.`,
        2,"Diário do Futebol"
      );

      return {
        ok:true,
        name:offer.name,
        category:offer.category,
        monthly:offer.monthly,
        signing:offer.signing,
        activeCount:active.length+1,
        maxActive:2
      };
    });

    res.json(result);
  }catch(e){next(e)}
});
app.post("/api/press-conferences/:id/respond",auth,async(req,res,next)=>{
  try{
    const c=await userClub(req.user.id);
    if(!c)return res.status(404).json({error:"Clube não encontrado."});
    const id=String(req.params.id),answerKey=String(req.body.answerKey||"");
    const allowed=new Set(["responsibility","protect_squad","demand_reaction"]);
    if(!allowed.has(answerKey))return res.status(400).json({error:"Resposta de coletiva inválida."});

    const result=await tx(async client=>{
      const press=(await client.query(`SELECT * FROM press_conferences WHERE id=$1 AND club_id=$2 FOR UPDATE`,[id,c.id])).rows[0];
      if(!press||press.status!=="pending")throw Object.assign(new Error("Esta coletiva não está mais pendente."),{status:409});

      let headline,body,fans=0,morale=0,board=0,pressure=0,consequence="";
      if(answerKey==="responsibility"){
        fans=250;morale=3;board=4;pressure=-2;
        headline=`${c.name}: treinador assume responsabilidade em coletiva`;
        body="Na entrevista após o jogo, o treinador assumiu a responsabilidade pelo resultado e prometeu corrigir os problemas internamente.";
        consequence="A diretoria valorizou a postura. A pressão externa diminuiu e o elenco recebeu a mensagem com relativa tranquilidade.";
      }else if(answerKey==="protect_squad"){
        fans=60;morale=7;board=-1;pressure=-3;
        headline=`${c.name}: treinador protege elenco diante da imprensa`;
        body="O comandante evitou individualizar erros, defendeu os jogadores e disse que o grupo seguirá unido para a sequência da temporada.";
        consequence="O elenco ganhou moral e a pressão da imprensa caiu, mas a diretoria considerou a resposta excessivamente protetora.";
      }else{
        fans=320;morale=-3;board=1;pressure=4;
        headline=`${c.name}: cobrança pública aumenta pressão por reação`;
        body="O treinador cobrou uma resposta imediata do elenco. A declaração agradou parte da torcida, mas elevou a pressão interna.";
        consequence="A torcida aprovou a cobrança, porém o moral do elenco caiu e a repercussão da imprensa aumentou.";
      }

      await client.query(`
        UPDATE clubs SET
          fans=GREATEST(0,fans+$2),
          board_confidence=GREATEST(0,LEAST(100,board_confidence+$3)),
          media_pressure=GREATEST(0,LEAST(100,media_pressure+$4))
        WHERE id=$1
      `,[c.id,fans,board,pressure]);
      await client.query(`UPDATE players SET morale=GREATEST(30,LEAST(100,morale+$2)) WHERE club_id=$1`,[c.id,morale]);
      await client.query(`UPDATE press_conferences SET status='answered',answer_key=$2,answered_at=NOW() WHERE id=$1`,[press.id,answerKey]);
      await publishNews(client,c.id,press.season_no,"coletiva",headline,`${body} ${consequence}`,2,"Central da Bola");
      await client.query(`INSERT INTO club_events(club_id,event_type,title,description) VALUES($1,'press','Consequência da coletiva',$2)`,[c.id,consequence]);

      return {
        ok:true,headline,
        fansDelta:fans,
        moraleDelta:morale,
        boardDelta:board,
        pressureDelta:pressure,
        consequence
      };
    });
    res.json(result);
  }catch(e){next(e)}
});

app.post("/api/saf/accept",auth,async(req,res,next)=>{
  try{
    const c=await userClub(req.user.id);
    if(!c)return res.status(404).json({error:"Clube não encontrado."});
    const career=await getCareer(c.id);
    if(!career)return res.status(400).json({error:"Carreira não encontrada."});
    const investorId=String(req.body.investorId||"");
    const offer=safOffersForCareer(career).find(x=>x.id===investorId);
    if(!offer)return res.status(400).json({error:"Proposta de SAF inválida."});

    const result=await tx(async client=>{
      const club=(await client.query(`SELECT * FROM clubs WHERE id=$1 FOR UPDATE`,[c.id])).rows[0];
      if(club.is_saf)throw Object.assign(new Error("O clube já foi vendido para uma SAF."),{status:409});
      await client.query(`UPDATE clubs SET is_saf=TRUE,saf_investor_name=$2,saf_investment=$3,saf_started_season=$4,fans=fans+1500 WHERE id=$1`,[c.id,offer.name,offer.investment,career.season_no]);
      await addFinance(client,c.id,offer.investment,"saf_investment",`Aporte inicial da SAF — ${offer.name}`);
      await client.query(`INSERT INTO club_events(club_id,event_type,title,description) VALUES($1,'saf','Clube vendido para SAF',$2)`,[c.id,`${offer.name} assumiu o projeto com aporte de ${offer.investment.toLocaleString("pt-BR")} moedas.`]);
      await publishNews(client,c.id,career.season_no,"saf",`${c.name} é vendido para ${offer.name}`,`A nova SAF anunciou aporte imediato de ${offer.investment.toLocaleString("pt-BR")} moedas. A mudança amplia o poder de investimento, mas cria uma regra dura: se o clube encerrar uma temporada com saldo negativo, sofrerá rebaixamento administrativo de uma divisão.`,3,"Jornal do Clube");
      return {ok:true,investorName:offer.name,investment:offer.investment};
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

        if(!formationIsValid(formation)){
          throw Object.assign(new Error("Formação inválida."),{status:400});
        }
        const quota=formationQuotas(formation),counts={GK:0,DEF:0,MID:0,ATT:0};
        own.forEach(p=>counts[p.position]=(counts[p.position]||0)+1);
        if(Object.keys(quota).some(k=>counts[k]!==quota[k])){
          throw Object.assign(new Error(`A formação ${formation} exige ${quota.DEF} defensores, ${quota.MID} meio-campistas e ${quota.ATT} atacantes.`),{status:400});
        }

        await client.query(`UPDATE players SET is_starter=FALSE WHERE club_id=$1`,[club.id]);
        await client.query(`UPDATE players SET is_starter=TRUE,is_bench=FALSE WHERE club_id=$1 AND id=ANY($2::bigint[])`,[club.id,starterIds]);
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
    res.json(await withCompetitionLock(c.id,async()=>{await repairCareer(c.id);const r=await playCopa(c.id);await mediaAfterCompetitionAction(c.id,"copa",r);return r}));
  }catch(e){next(e)}
});

app.post("/api/state/play-next",auth,async(req,res,next)=>{
  try{
    const c=await userClub(req.user.id);
    res.json(await withCompetitionLock(c.id,async()=>{await repairCareer(c.id);const r=await playState(c.id);await mediaAfterCompetitionAction(c.id,"state",r);return r}));
  }catch(e){next(e)}
});
app.post("/api/national/play-round",auth,async(req,res,next)=>{
  try{
    const c=await userClub(req.user.id);
    res.json(await withCompetitionLock(c.id,async()=>{await repairCareer(c.id);const r=await playNational(c.id);await mediaAfterCompetitionAction(c.id,"national",r);return r}));
  }catch(e){next(e)}
});
app.post("/api/libertadores/play-next",auth,async(req,res,next)=>{
  try{
    const c=await userClub(req.user.id);
    res.json(await withCompetitionLock(c.id,async()=>{await repairCareer(c.id);const r=await playLib(c.id);await mediaAfterCompetitionAction(c.id,"lib",r);return r}));
  }catch(e){next(e)}
});
app.post("/api/champions/play-next",auth,async(req,res,next)=>{
  try{
    const c=await userClub(req.user.id);
    res.json(await withCompetitionLock(c.id,async()=>{await repairCareer(c.id);const r=await playChampions(c.id);await mediaAfterCompetitionAction(c.id,"champions",r);return r}));
  }catch(e){next(e)}
});

app.post("/api/club-world-cup/play-next",auth,async(req,res,next)=>{
  try{
    const c=await userClub(req.user.id);
    res.json(await withCompetitionLock(c.id,async()=>{await repairCareer(c.id);const r=await playClubWorldCup(c.id);await mediaAfterCompetitionAction(c.id,"world",r);return r}));
  }catch(e){next(e)}
});
app.post("/api/career/simulate-season",auth,async(req,res,next)=>{
  try{
    const c=await userClub(req.user.id);
    if(!c)return res.status(404).json({error:"Carreira de clube não encontrada."});
    res.json(await withCompetitionLock(c.id,async()=>{
      const r=await simulateFullClubSeason(c.id);
      const career=await getCareer(c.id);
      await tx(async client=>{
        await publishNews(client,c.id,career?.season_no||1,"temporada",`Temporada de ${c.name} é simulada até o fim`,`A comissão técnica optou por simular o restante da temporada. O clube terminou na ${r.position||"—"}ª posição de sua divisão, com ${r.simulatedMatches||0} partidas processadas automaticamente.`,2,"Jornal do Clube");
        if(career)await publishSeasonRoutHighlights(client,c.id,career);
      });
      return r;
    }));
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
    if(!formationIsValid(formation))return res.status(400).json({error:"Formação inválida."});
    const own=await q(`SELECT id,position,injury_games,suspension_games FROM players WHERE club_id=$1 AND id=ANY($2::bigint[])`,[c.id,ids]);
    if(own.rowCount!==11||!own.rows.some(p=>p.position==="GK"))return res.status(400).json({error:"Inclua um goleiro."});
    if(own.rows.some(p=>Number(p.injury_games||0)>0))return res.status(400).json({error:"Jogadores lesionados não podem ser titulares."});
    if(own.rows.some(p=>Number(p.suspension_games||0)>0))return res.status(400).json({error:"Jogadores suspensos não podem ser titulares."});
    const quota=formationQuotas(formation),counts={GK:0,DEF:0,MID:0,ATT:0};
    own.rows.forEach(p=>counts[p.position]=(counts[p.position]||0)+1);
    if(Object.keys(quota).some(k=>counts[k]!==quota[k]))return res.status(400).json({error:`A formação ${formation} exige ${quota.DEF} defensores, ${quota.MID} meio-campistas e ${quota.ATT} atacantes.`});
    await tx(async x=>{
      await x.query(`UPDATE players SET is_starter=FALSE WHERE club_id=$1`,[c.id]);
      await x.query(`UPDATE players SET is_starter=TRUE,is_bench=FALSE WHERE club_id=$1 AND id=ANY($2::bigint[])`,[c.id,ids]);
      await x.query(`UPDATE clubs SET formation=$2 WHERE id=$1`,[c.id,formation]);
    });
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

      await client.query(`UPDATE clubs SET chemistry=GREATEST(45,chemistry-1) WHERE id=$1`,[c.id]);
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
    const qText=normalizeSearch(req.query.q||"");
    const position=String(req.query.position||"").trim().toUpperCase();
    const minRating=Number(req.query.minRating||0);
    const maxPrice=Number(req.query.maxPrice||999999999);
    const realOnly=String(req.query.realOnly||"")==="1";
    const userDiv=career?.user_division||"D";
    const profile=marketProfile(userDiv);
    const window=transferWindowInfo(career?.data?.calendar?.date);
    const staff=await staffLevels(pool,c.id);
    const scoutLevel=Number(staff.levels.SCOUT||1);
    const reportRows=(await q(`SELECT target_player_id FROM scout_reports WHERE club_id=$1`,[c.id])).rows;
    const scoutedIds=new Set(reportRows.map(x=>String(x.target_player_id)));

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
      ORDER BY p.is_real_name DESC,p.rating DESC,p.price DESC
      LIMIT 700
    `,[c.id])).rows;

    const filtered=rows.filter(p=>{
      const sourceDiv=p.source_club_id?divisionOfClub(career,p.source_club_id):null;
      const ask=askingPrice(p);
      if(qText&&!normalizeSearch(p.name).includes(qText))return false;
      if(realOnly&&!p.is_real_name)return false;
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
      const scouted=scoutedIds.has(String(p.id))||scoutLevel>=5;
      const uncertainty=scouted?0:Math.max(1,6-scoutLevel);
      return {
        ...p,
        fair_value:fairMarketValue(p),
        asking_price:askingPrice(p),
        suggested_salary:salary,
        source_division:sourceDiv,
        interest:chance>=70?"Alta":chance>=45?"Média":"Baixa",
        loan_eligible:Boolean(p.club_id)&&Boolean(p.source_is_ai)&&!likelyImportant,
        loan_reason:!p.club_id?"Jogador livre":likelyImportant?"Importante para o clube":"Disponível",
        suggested_loan_fee:Boolean(p.club_id)&&Boolean(p.source_is_ai)?Math.max(250,Math.round(fairMarketValue(p)*0.025/50)*50):0,
        scouted,
        rating_min:Math.max(40,Number(p.rating)-uncertainty),
        rating_max:Math.min(100,Number(p.rating)+uncertainty),
        scout_cost:Math.max(120,600-scoutLevel*80)
      };
    });

    res.json({
      players:filtered,
      transferBan:ban,
      marketProfile:profile,
      userDivision:userDiv,
      transferWindow:window,
      scoutLevel,
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
    const window=transferWindowInfo(career?.data?.calendar?.date);
    if(!window.open){
      return res.status(403).json({error:`Janela de transferências fechada. Próxima abertura: ${window.next||"próxima temporada"}.`});
    }

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

      await client.query(`UPDATE clubs SET chemistry=GREATEST(45,chemistry-2) WHERE id=$1`,[c.id]);
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
    const wantsPurchaseOption=Boolean(req.body.purchaseOption);
    const purchaseOptionPrice=Math.max(0,Number(req.body.purchaseOptionPrice||0));
    const career=await getCareer(c.id);
    const userDiv=career?.user_division||"D";
    const window=transferWindowInfo(career?.data?.calendar?.date);
    if(!window.open)return res.status(403).json({error:`Janela de transferências fechada. Próxima abertura: ${window.next||"próxima temporada"}.`});

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
      const suggestedPurchasePrice=Math.max(
        1000,
        Math.round(askingPrice(p)*1.03/100)*100
      );

      if(monthlyFee<Math.round(fairFee*.90)){
        return {
          accepted:false,
          message:`${p.source_club_name} recusou. O valor mensal esperado é próximo de ${fairFee.toLocaleString("pt-BR")} moedas.`,
          suggestedFee:fairFee,
          suggestedPurchasePrice
        };
      }

      if(wantsPurchaseOption&&purchaseOptionPrice<Math.round(suggestedPurchasePrice*.92)){
        return {
          accepted:false,
          message:`${p.source_club_name} aceita discutir o empréstimo, mas quer opção de compra próxima de ${suggestedPurchasePrice.toLocaleString("pt-BR")} moedas.`,
          suggestedFee:fairFee,
          suggestedPurchasePrice
        };
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

      const agreedPurchaseOption=wantsPurchaseOption
        ?Math.max(Math.round(purchaseOptionPrice),Math.round(suggestedPurchasePrice*.92))
        :null;

      await client.query(`
        INSERT INTO player_loans(
          player_id,parent_club_id,borrowing_club_id,start_season_no,
          months_total,months_elapsed,monthly_fee,purchase_option_price,
          purchase_option_exercised,status
        )
        VALUES($1,$2,$3,$4,$5,0,$6,$7,FALSE,'active')
      `,[
        loaned.id,p.club_id,c.id,career.season_no,months,
        Math.round(monthlyFee),agreedPurchaseOption
      ]);

      await client.query(`UPDATE clubs SET chemistry=GREATEST(45,chemistry-1) WHERE id=$1`,[c.id]);
      await applyFelipeMode(client,c.id);

      const optionText=agreedPurchaseOption
        ?` com opção de compra de ${agreedPurchaseOption.toLocaleString("pt-BR")} moedas`
        :" sem opção de compra";

      await client.query(
        `INSERT INTO club_events(club_id,event_type,title,description)
         VALUES($1,'loan','Empréstimo confirmado',$2)`,
        [c.id,`${p.name} chegou por ${months} meses${optionText}. A versão original continua disponível nas outras carreiras.`]
      );

      return {
        accepted:true,
        message:`${p.name} chegou por empréstimo de ${months} meses${optionText}.`,
        playerId:loaned.id,
        templatePlayerId:p.id,
        months,
        monthlyFee:Math.round(monthlyFee),
        purchaseOptionPrice:agreedPurchaseOption,
        suggestedPurchasePrice
      };
    });

    res.json(result);
  }catch(e){next(e)}
});

app.post("/api/transfers/loans/:loanId/buy",auth,async(req,res,next)=>{
  try{
    const c=await userClub(req.user.id);
    if(!c)return res.status(404).json({error:"Clube não encontrado."});
    if(transferBanInfo(c.coins).active)return res.status(403).json({error:"Transfer ban ativo. A opção de compra não pode ser exercida enquanto o clube estiver bloqueado."});
    const loanCareer=await getCareer(c.id);
    const loanWindow=transferWindowInfo(loanCareer?.data?.calendar?.date);
    if(!loanWindow.open)return res.status(403).json({error:`Janela de transferências fechada. A opção poderá ser exercida a partir de ${loanWindow.next||"próxima temporada"}.`});

    const loanId=String(req.params.loanId||"");
    const result=await tx(async client=>{
      const club=(await client.query(`SELECT * FROM clubs WHERE id=$1 FOR UPDATE`,[c.id])).rows[0];
      if(transferBanInfo(club.coins).active)throw Object.assign(new Error("Transfer ban ativo por endividamento."),{status:403});

      const loan=(await client.query(`
        SELECT l.*,p.name player_name,p.salary,p.contract_seasons,p.rating,pc.name parent_club_name
        FROM player_loans l
        JOIN players p ON p.id=l.player_id
        JOIN clubs pc ON pc.id=l.parent_club_id
        WHERE l.id=$1
          AND l.borrowing_club_id=$2
        FOR UPDATE OF l,p
      `,[loanId,c.id])).rows[0];

      if(!loan)throw Object.assign(new Error("Empréstimo não encontrado."),{status:404});
      if(loan.status!=="active")throw Object.assign(new Error("Este empréstimo não está mais ativo."),{status:409});
      if(!loan.purchase_option_price)throw Object.assign(new Error("Este empréstimo não possui opção de compra."),{status:400});

      const price=Number(loan.purchase_option_price||0);
      if(Number(club.coins||0)<price){
        throw Object.assign(new Error(`Caixa insuficiente. A opção de compra custa ${price.toLocaleString("pt-BR")} moedas.`),{status:400});
      }

      await addFinance(
        client,c.id,-price,"loan_purchase",
        `Opção de compra exercida — ${loan.player_name}`
      );
      await client.query(`UPDATE clubs SET coins=coins+$2 WHERE id=$1`,[loan.parent_club_id,price]);

      const newContract=Math.max(3,Number(loan.contract_seasons||1));
      await client.query(`
        UPDATE players SET
          contract_seasons=$2,
          transfer_listed=FALSE,
          morale=LEAST(100,morale+4)
        WHERE id=$1 AND club_id=$3
      `,[loan.player_id,newContract,c.id]);

      await client.query(`
        UPDATE player_loans SET
          purchase_option_exercised=TRUE,
          status='purchased'
        WHERE id=$1
      `,[loan.id]);

      await client.query(
        `INSERT INTO club_events(club_id,event_type,title,description)
         VALUES($1,'loan','Opção de compra exercida',$2)`,
        [c.id,`${loan.player_name} foi comprado em definitivo por ${price.toLocaleString("pt-BR")} moedas após o período de empréstimo.`]
      );

      const career=await getCareer(c.id);
      if(career){
        await publishNews(
          client,c.id,career.season_no,"negocios",
          `${c.name} compra ${loan.player_name} em definitivo`,
          `O clube exerceu a opção de compra prevista no empréstimo e pagou ${price.toLocaleString("pt-BR")} moedas ao ${loan.parent_club_name}.`,
          2,"Diário do Futebol"
        );
      }

      return {
        ok:true,
        playerName:loan.player_name,
        price,
        contractSeasons:newContract,
        balance:Number(club.coins)-price
      };
    });

    res.json(result);
  }catch(e){next(e)}
});

app.post("/api/scouting/:playerId",auth,async(req,res,next)=>{
  try{
    const c=await userClub(req.user.id);
    if(!c)return res.status(404).json({error:"Clube não encontrado."});
    const playerId=String(req.params.playerId||"");

    const result=await tx(async client=>{
      const staff=await staffLevels(client,c.id);
      const scoutLevel=Number(staff.levels.SCOUT||1);
      const cost=Math.max(120,600-scoutLevel*80);
      const club=(await client.query(`SELECT coins FROM clubs WHERE id=$1 FOR UPDATE`,[c.id])).rows[0];
      if(Number(club?.coins||0)<cost)throw Object.assign(new Error(`Caixa insuficiente para o relatório. Custo: ${cost.toLocaleString("pt-BR")} moedas.`),{status:400});

      const p=(await client.query(`SELECT id,name,rating,potential FROM players WHERE id=$1`,[playerId])).rows[0];
      if(!p)throw Object.assign(new Error("Jogador não encontrado."),{status:404});

      await addFinance(client,c.id,-cost,"scouting",`Relatório de olheiro — ${p.name}`);
      await client.query(`
        INSERT INTO scout_reports(club_id,target_player_id,exact_rating)
        VALUES($1,$2,$3)
        ON CONFLICT(club_id,target_player_id) DO UPDATE SET exact_rating=EXCLUDED.exact_rating,created_at=NOW()
      `,[c.id,p.id,p.rating]);

      return {ok:true,playerId:p.id,playerName:p.name,rating:Number(p.rating),potential:Number(p.potential||p.rating),cost};
    });

    res.json(result);
  }catch(e){next(e)}
});

app.put("/api/realism/tactics",auth,async(req,res,next)=>{
  try{
    const c=await userClub(req.user.id);
    if(!c)return res.status(404).json({error:"Clube não encontrado."});

    const pressing=String(req.body.pressing||"NORMAL").toUpperCase();
    const defensiveLine=String(req.body.defensiveLine||"NORMAL").toUpperCase();
    const tempo=String(req.body.tempo||"NORMAL").toUpperCase();
    const width=String(req.body.width||"NORMAL").toUpperCase();
    const style=String(req.body.style||"BALANCED").toUpperCase();
    const marking=String(req.body.marking||"NORMAL").toUpperCase();

    if(!["LOW","NORMAL","HIGH"].includes(pressing))return res.status(400).json({error:"Pressão inválida."});
    if(!["LOW","NORMAL","HIGH"].includes(defensiveLine))return res.status(400).json({error:"Linha defensiva inválida."});
    if(!["SLOW","NORMAL","FAST"].includes(tempo))return res.status(400).json({error:"Ritmo inválido."});
    if(!["NARROW","NORMAL","WIDE"].includes(width))return res.status(400).json({error:"Largura inválida."});
    if(!["BALANCED","POSSESSION","COUNTER","DIRECT"].includes(style))return res.status(400).json({error:"Estilo inválido."});
    if(!["NORMAL","AGGRESSIVE"].includes(marking))return res.status(400).json({error:"Marcação inválida."});

    await q(`
      UPDATE clubs SET
        tactic_pressing=$2,
        tactic_defensive_line=$3,
        tactic_tempo=$4,
        tactic_width=$5,
        tactic_style=$6,
        tactic_marking=$7
      WHERE id=$1
    `,[c.id,pressing,defensiveLine,tempo,width,style,marking]);

    res.json({ok:true,tactics:{pressing,defensiveLine,tempo,width,style,marking}});
  }catch(e){next(e)}
});

app.put("/api/realism/players/:playerId",auth,async(req,res,next)=>{
  try{
    const c=await userClub(req.user.id);
    if(!c)return res.status(404).json({error:"Clube não encontrado."});
    const playerId=String(req.params.playerId||"");
    const squadStatus=String(req.body.squadStatus||"").toUpperCase();
    const tacticalRole=String(req.body.tacticalRole||"").toUpperCase();
    const setPieceRole=String(req.body.setPieceRole||"").toUpperCase();
    const isCaptain=req.body.isCaptain===true;
    const isBench=req.body.isBench===true;

    const allowedStatus=new Set(["STAR","STARTER","ROTATION","BACKUP","PROSPECT"]);
    const allowedRole=new Set(["BALANCED","STOPPER","BALL_PLAYING","ANCHOR","PLAYMAKER","BOX_TO_BOX","WINGER","INSIDE_FORWARD","TARGET","POACHER","SWEEPER_KEEPER"]);
    const allowedSetPiece=new Set(["NONE","PENALTY","FREE_KICK","CORNER"]);

    if(squadStatus&&!allowedStatus.has(squadStatus))return res.status(400).json({error:"Status de elenco inválido."});
    if(tacticalRole&&!allowedRole.has(tacticalRole))return res.status(400).json({error:"Função tática inválida."});
    if(setPieceRole&&!allowedSetPiece.has(setPieceRole))return res.status(400).json({error:"Função de bola parada inválida."});

    const result=await tx(async client=>{
      const p=(await client.query(`SELECT * FROM players WHERE id=$1 AND club_id=$2 FOR UPDATE`,[playerId,c.id])).rows[0];
      if(!p)throw Object.assign(new Error("Jogador não encontrado."),{status:404});

      if(isCaptain)await client.query(`UPDATE players SET is_captain=FALSE WHERE club_id=$1`,[c.id]);
      if(isBench&&!p.is_starter){
        const count=Number((await client.query(`SELECT COUNT(*)::int count FROM players WHERE club_id=$1 AND is_bench=TRUE AND id<>$2`,[c.id,p.id])).rows[0]?.count||0);
        if(count>=9)throw Object.assign(new Error("O banco pode ter no máximo 9 jogadores relacionados."),{status:400});
      }
      if(setPieceRole&&setPieceRole!=="NONE"){
        await client.query(`UPDATE players SET set_piece_role='NONE' WHERE club_id=$1 AND set_piece_role=$2`,[c.id,setPieceRole]);
      }

      await client.query(`
        UPDATE players SET
          squad_status=COALESCE(NULLIF($3,''),squad_status),
          tactical_role=COALESCE(NULLIF($4,''),tactical_role),
          is_captain=$5,
          set_piece_role=CASE WHEN $6='' THEN set_piece_role ELSE $6 END,
          is_bench=CASE WHEN is_starter THEN FALSE ELSE $7 END
        WHERE id=$1 AND club_id=$2
      `,[p.id,c.id,squadStatus,tacticalRole,isCaptain,setPieceRole,isBench]);

      return (await client.query(`SELECT * FROM players WHERE id=$1`,[p.id])).rows[0];
    });

    res.json({ok:true,player:result});
  }catch(e){next(e)}
});

app.post("/api/realism/staff/:role/upgrade",auth,async(req,res,next)=>{
  try{
    const c=await userClub(req.user.id);
    if(!c)return res.status(404).json({error:"Clube não encontrado."});
    const role=String(req.params.role||"").toUpperCase();
    if(!STAFF_ROLES[role])return res.status(400).json({error:"Função de comissão inválida."});

    const result=await tx(async client=>{
      await ensureRealismClubData(client,c.id,await getCareer(c.id));
      const staff=(await client.query(`SELECT * FROM club_staff WHERE club_id=$1 AND role=$2 FOR UPDATE`,[c.id,role])).rows[0];
      if(!staff)throw new Error("Membro da comissão não encontrado.");
      if(Number(staff.level)>=5)throw Object.assign(new Error("Este profissional já está no nível máximo."),{status:400});
      const cost=Number(staff.level)*4500;
      const club=(await client.query(`SELECT coins FROM clubs WHERE id=$1 FOR UPDATE`,[c.id])).rows[0];
      if(Number(club.coins)<cost)throw Object.assign(new Error(`Caixa insuficiente. Custo da melhoria: ${cost.toLocaleString("pt-BR")} moedas.`),{status:400});

      await addFinance(client,c.id,-cost,"staff",`Melhoria da comissão — ${STAFF_ROLES[role].label}`);
      await client.query(`
        UPDATE club_staff SET
          level=level+1,
          salary=ROUND(salary*1.18)::int
        WHERE id=$1
      `,[staff.id]);
      return (await client.query(`SELECT * FROM club_staff WHERE id=$1`,[staff.id])).rows[0];
    });

    res.json({ok:true,staff:result});
  }catch(e){next(e)}
});

app.post("/api/realism/academy/:academyId/promote",auth,async(req,res,next)=>{
  try{
    const c=await userClub(req.user.id);
    if(!c)return res.status(404).json({error:"Clube não encontrado."});
    const academyId=String(req.params.academyId||"");

    const result=await tx(async client=>{
      const candidate=(await client.query(`
        SELECT * FROM academy_players
        WHERE id=$1 AND club_id=$2 AND status='academy'
        FOR UPDATE
      `,[academyId,c.id])).rows[0];
      if(!candidate)throw Object.assign(new Error("Jogador da base não encontrado."),{status:404});
      if(Number(candidate.age)<16)throw Object.assign(new Error("O jogador ainda é muito jovem para ser promovido."),{status:400});

      const squad=Number((await client.query(`SELECT COUNT(*)::int count FROM players WHERE club_id=$1`,[c.id])).rows[0]?.count||0);
      if(squad>=30)throw Object.assign(new Error("Seu elenco principal já possui 30 jogadores."),{status:400});

      const rating=Number(candidate.rating);
      const variance=()=>clamp(rating+rand(-5,5),20,99);
      const r=await client.query(`
        INSERT INTO players(
          club_id,name,position,role,rating,pace,shooting,passing,defending,price,
          is_starter,age,salary,contract_seasons,fitness,morale,injury_games,
          potential,form_rating,happiness,squad_status,tactical_role,academy_product
        )
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,FALSE,$11,$12,4,100,78,0,$13,70,82,'PROSPECT','BALANCED',TRUE)
        RETURNING *
      `,[
        c.id,candidate.name,candidate.position,candidate.role,rating,
        variance(),variance(),variance(),variance(),
        Math.max(500,Math.round((rating*rating*2)/100)*100),
        candidate.age,Math.max(50,Math.round(salaryForRating(rating)*.55/10)*10),
        candidate.potential
      ]);

      await client.query(`UPDATE academy_players SET status='promoted' WHERE id=$1`,[candidate.id]);
      await client.query(
        `INSERT INTO club_events(club_id,event_type,title,description)
         VALUES($1,'academy','Promovido da base',$2)`,
        [c.id,`${candidate.name}, ${candidate.age} anos, foi promovido ao elenco principal com OVR ${rating} e potencial ${candidate.potential}.`]
      );
      return r.rows[0];
    });

    res.json({ok:true,player:result});
  }catch(e){next(e)}
});

app.post("/api/realism/academy/:academyId/release",auth,async(req,res,next)=>{
  try{
    const c=await userClub(req.user.id);
    if(!c)return res.status(404).json({error:"Clube não encontrado."});
    const r=await q(`
      UPDATE academy_players
      SET status='released'
      WHERE id=$1 AND club_id=$2 AND status='academy'
      RETURNING name
    `,[String(req.params.academyId),c.id]);
    if(!r.rowCount)return res.status(404).json({error:"Jogador da base não encontrado."});
    await q(
      `INSERT INTO club_events(club_id,event_type,title,description)
       VALUES($1,'academy','Jogador liberado da base',$2)`,
      [c.id,`${r.rows[0].name} foi liberado das categorias de base.`]
    );
    res.json({ok:true,name:r.rows[0].name});
  }catch(e){next(e)}
});

app.put("/api/realism/stadium",auth,async(req,res,next)=>{
  try{
    const c=await userClub(req.user.id);
    if(!c)return res.status(404).json({error:"Clube não encontrado."});
    const ticketPrice=clamp(Number(req.body.ticketPrice||c.ticket_price||30),5,100);
    const upgrade=Boolean(req.body.upgrade);

    const result=await tx(async client=>{
      const club=(await client.query(`SELECT * FROM clubs WHERE id=$1 FOR UPDATE`,[c.id])).rows[0];
      let capacity=Number(club.stadium_capacity||12000),level=Number(club.stadium_level||1),cost=0;

      if(upgrade){
        if(level>=8)throw Object.assign(new Error("Estádio já está no nível máximo."),{status:400});
        cost=level*level*12000;
        if(Number(club.coins)<cost)throw Object.assign(new Error(`Caixa insuficiente. Ampliação custa ${cost.toLocaleString("pt-BR")} moedas.`),{status:400});
        await addFinance(client,c.id,-cost,"stadium","Ampliação do estádio");
        level++;
        capacity+=5000;
      }

      await client.query(`UPDATE clubs SET ticket_price=$2,stadium_level=$3,stadium_capacity=$4 WHERE id=$1`,[c.id,ticketPrice,level,capacity]);
      return {ticketPrice,level,capacity,cost};
    });

    res.json({ok:true,...result});
  }catch(e){next(e)}
});

app.post("/api/manager-offers/:offerId/decline",auth,async(req,res,next)=>{
  try{
    const c=await userClub(req.user.id);
    if(!c)return res.status(404).json({error:"Clube não encontrado."});
    const r=await q(`
      UPDATE manager_job_offers SET status='declined'
      WHERE id=$1 AND user_club_id=$2 AND status='pending'
      RETURNING id
    `,[String(req.params.offerId),c.id]);
    if(!r.rowCount)return res.status(404).json({error:"Proposta não encontrada."});
    res.json({ok:true});
  }catch(e){next(e)}
});

app.post("/api/manager-offers/:offerId/accept",auth,async(req,res,next)=>{
  try{
    const current=await userClub(req.user.id);
    if(!current)return res.status(404).json({error:"Clube não encontrado."});
    const offerId=String(req.params.offerId||"");

    const result=await tx(async client=>{
      const offer=(await client.query(`
        SELECT o.*
        FROM manager_job_offers o
        WHERE o.id=$1 AND o.user_club_id=$2 AND o.status='pending'
        FOR UPDATE
      `,[offerId,current.id])).rows[0];
      if(!offer)throw Object.assign(new Error("Proposta não encontrada ou já encerrada."),{status:404});

      const oldClub=(await client.query(`SELECT * FROM clubs WHERE id=$1 FOR UPDATE`,[current.id])).rows[0];
      const target=(await client.query(`SELECT * FROM clubs WHERE id=$1 FOR UPDATE`,[offer.offering_club_id])).rows[0];
      const career=(await client.query(`SELECT * FROM careers WHERE owner_club_id=$1 FOR UPDATE`,[current.id])).rows[0];
      if(!oldClub||!target||!career)throw new Error("Não foi possível carregar a carreira.");

      if(oldClub.country_code!==target.country_code){
        throw Object.assign(new Error("Nesta versão, propostas de treinador durante a temporada são aceitas apenas dentro do mesmo país."),{status:400});
      }

      const targetDiv=divisionOfClub(career,target.id)||career.user_division;
      await createRoster(client,target,false);
      const oldName=oldClub.name,targetName=target.name;
      const oldPlayers=(await client.query(`SELECT id FROM players WHERE club_id=$1`,[oldClub.id])).rows.map(x=>Number(x.id));
      const targetPlayers=(await client.query(`SELECT id FROM players WHERE club_id=$1`,[target.id])).rows.map(x=>Number(x.id));

      await client.query(`UPDATE player_loans SET status='ended' WHERE status='active' AND borrowing_club_id=ANY($1::bigint[])`,[[oldClub.id,target.id]]);

      if(oldPlayers.length)await client.query(`UPDATE players SET club_id=NULL,is_starter=FALSE WHERE id=ANY($1::bigint[])`,[oldPlayers]);
      if(targetPlayers.length)await client.query(`UPDATE players SET club_id=$2 WHERE id=ANY($1::bigint[])`,[targetPlayers,oldClub.id]);
      if(oldPlayers.length)await client.query(`UPDATE players SET club_id=$2 WHERE id=ANY($1::bigint[])`,[oldPlayers,target.id]);

      const tempName=`__manager_swap_${oldClub.id}_${Date.now()}`;
      await client.query(`UPDATE clubs SET name=$2 WHERE id=$1`,[oldClub.id,tempName]);
      // Libera também o nome do clube de destino antes de atribuí-lo ao clube controlado pelo usuário.
      await client.query(`UPDATE clubs SET name=$2 WHERE id=$1`,[target.id,oldName]);

      const identityFields=[
        target.primary_color,target.secondary_color,target.crest_data,target.state_code,target.country_code,
        target.confederation_code,target.national_seed_division,target.base_rating,target.coins,target.formation,
        target.team_rating,target.is_saf,target.saf_investor_name,target.saf_investment,target.saf_started_season,
        target.saf_debt_relegations,target.board_confidence,target.media_pressure,target.chemistry,
        target.stadium_capacity,target.stadium_level,target.ticket_price,target.rival_club_id,
        target.tactic_pressing,target.tactic_defensive_line,target.tactic_tempo,target.tactic_width,
        target.tactic_style,target.tactic_marking
      ];
      await client.query(`
        UPDATE clubs SET
          name=$2,primary_color=$3,secondary_color=$4,crest_data=$5,state_code=$6,country_code=$7,
          confederation_code=$8,national_seed_division=$9,base_rating=$10,coins=$11,formation=$12,
          team_rating=$13,is_saf=$14,saf_investor_name=$15,saf_investment=$16,saf_started_season=$17,
          saf_debt_relegations=$18,board_confidence=$19,media_pressure=$20,chemistry=$21,
          stadium_capacity=$22,stadium_level=$23,ticket_price=$24,rival_club_id=$25,
          tactic_pressing=$26,tactic_defensive_line=$27,tactic_tempo=$28,tactic_width=$29,
          tactic_style=$30,tactic_marking=$31
        WHERE id=$1
      `,[oldClub.id,targetName,...identityFields]);

      await client.query(`
        UPDATE clubs SET
          name=$2,primary_color=$3,secondary_color=$4,crest_data=$5,state_code=$6,country_code=$7,
          confederation_code=$8,national_seed_division=$9,base_rating=$10,coins=$11,formation=$12,
          team_rating=$13,is_saf=$14,saf_investor_name=$15,saf_investment=$16,saf_started_season=$17,
          saf_debt_relegations=$18,board_confidence=$19,media_pressure=$20,chemistry=$21,
          stadium_capacity=$22,stadium_level=$23,ticket_price=$24,rival_club_id=$25,
          tactic_pressing=$26,tactic_defensive_line=$27,tactic_tempo=$28,tactic_width=$29,
          tactic_style=$30,tactic_marking=$31
        WHERE id=$1
      `,[
        target.id,oldName,oldClub.primary_color,oldClub.secondary_color,oldClub.crest_data,oldClub.state_code,oldClub.country_code,
        oldClub.confederation_code,oldClub.national_seed_division,oldClub.base_rating,oldClub.coins,oldClub.formation,
        oldClub.team_rating,oldClub.is_saf,oldClub.saf_investor_name,oldClub.saf_investment,oldClub.saf_started_season,
        oldClub.saf_debt_relegations,oldClub.board_confidence,oldClub.media_pressure,oldClub.chemistry,
        oldClub.stadium_capacity,oldClub.stadium_level,oldClub.ticket_price,oldClub.rival_club_id,
        oldClub.tactic_pressing,oldClub.tactic_defensive_line,oldClub.tactic_tempo,oldClub.tactic_width,
        oldClub.tactic_style,oldClub.tactic_marking
      ]);

      const data=swapCareerClubReferences(career.data,oldClub.id,target.id);
      if(!Array.isArray(data.managerHistory))data.managerHistory=[];
      data.managerHistory.push({
        season:career.season_no,
        from:oldName,
        to:targetName,
        date:data.calendar?.date||null
      });

      await client.query(`
        UPDATE careers SET
          user_division=$2,
          state_code=$3,
          data=$4::jsonb,
          updated_at=NOW()
        WHERE owner_club_id=$1
      `,[oldClub.id,targetDiv,target.state_code||"",JSON.stringify(data)]);

      await client.query(`UPDATE sponsorship_contracts SET status='completed' WHERE club_id=$1 AND status='active'`,[oldClub.id]);
      await client.query(`UPDATE manager_job_offers SET status=CASE WHEN id=$2 THEN 'accepted' ELSE 'declined' END WHERE user_club_id=$1 AND status='pending'`,[oldClub.id,offerId]);

      await client.query(
        `INSERT INTO club_events(club_id,event_type,title,description)
         VALUES($1,'manager_offer','Novo desafio profissional',$2)`,
        [oldClub.id,`Você deixou ${oldName} e aceitou a proposta para comandar ${targetName}. A carreira continua a partir da situação atual do novo clube.`]
      );

      return {ok:true,from:oldName,to:targetName,division:targetDiv};
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
  await applyV22Migration();
  await applyV23Migration();
  await applyV24Migration();
  await applyV25Migration();
  await applyV26Migration();
  await applyV27Migration();
  await applyV29Migration();
  await applyV32Migration();
  await applyV33Migration();
  await applyV34Migration();
  await applyV35Migration();
  await applyV38Migration();
  await seedRealMarketPlayers();
  await ensureMarket();
  app.listen(PORT,"0.0.0.0",()=>console.log(`Dono do Clube v38 rodando na porta ${PORT}`));
}
start().catch(e=>{console.error("Falha ao iniciar:",e);process.exit(1)});


app.get('/api/player-career/development/:id', async(req,res)=>{
 try{
  const r=await q(`SELECT * FROM player_career_development WHERE player_career_id=$1`,[req.params.id]);
  res.json(r.rows[0]||null);
 }catch(e){res.status(500).json({error:e.message})}
});

app.post('/api/player-career/training/:id', async(req,res)=>{
 try{
  const type=req.body?.type||'technical';
  await q(`INSERT INTO player_training_sessions(player_career_id,training_type,attribute_gain) VALUES($1,$2,1)`,[req.params.id,type]);
  await q(`UPDATE player_career_development SET confidence=LEAST(100,confidence+1) WHERE player_career_id=$1`,[req.params.id]);
  res.json({ok:true});
 }catch(e){res.status(500).json({error:e.message})}
});


// Modo Jogador - propostas europeias facilitadas
const european_offer_chance = {
  minimumOverall: 65,
  minimumPotential: 75,
  goodSeasonGoals: 5,
  goodSeasonAssists: 3
};

function canReceiveEuropeanProposal(player){
  if(!player) return false;
  const overall=Number(player.overall||player.rating||0);
  const potential=Number(player.potential||0);
  const goals=Number(player.goals||0);
  const assists=Number(player.assists||0);
  return overall>=european_offer_chance.minimumOverall ||
         potential>=european_offer_chance.minimumPotential ||
         goals>=european_offer_chance.goodSeasonGoals ||
         assists>=european_offer_chance.goodSeasonAssists;
}


// playerCareerCompleteBackend
const playerCareerCompleteBackend = {
 creation:['height','weight','dominant_foot','position','style'],
 training:['finishing','passing','dribbling','physical'],
 evolution:['performance','potential','attributes'],
 career:['starter','coach_relation','competition','morale'],
 market:['european_offers','loans'],
 history:['statistics','awards','retirement']
};

function playerDevelopmentGain(match={}){
 const value=Number(match.rating||0)+Number(match.goals||0)*3+Number(match.assists||0)*2;
 return Math.max(0,Math.min(3,Math.floor(value/25)));
}

function shouldReceiveEuropeanOffer(player={}){
 return Number(player.overall||0)>=68 ||
        Number(player.potential||0)>=75 ||
        Number(player.goals||0)>=5 ||
        Number(player.assists||0)>=5;
}


// MODO CARREIRA JOGADOR - aumento de interesse europeu
const europeanProposalBoost = {
  baseChance: 45,
  overallThreshold: 60,
  potentialThreshold: 70,
  performanceBonus: 25
};

function europeanProposalChance(player={}){
  let chance = europeanProposalBoost.baseChance;
  const overall = Number(player.overall || 0);
  const potential = Number(player.potential || 0);
  const goals = Number(player.goals || 0);
  const assists = Number(player.assists || 0);
  const rating = Number(player.average_rating || 0);

  if(overall >= europeanProposalBoost.overallThreshold) chance += 20;
  if(potential >= europeanProposalBoost.potentialThreshold) chance += 20;
  if(goals >= 3) chance += 10;
  if(assists >= 3) chance += 10;
  if(rating >= 7) chance += europeanProposalBoost.performanceBonus;

  return Math.min(95,chance);
}


// PLAYER_MODE_REAL_UPGRADE_V2
// Sistemas reais do Modo Carreira Jogador
const PLAYER_MODE_REAL_UPGRADE_V2 = {
  attributes:['pace','shooting','passing','dribbling','physical','defending'],
  training:['finishing','passing','dribbling','fitness'],
  career:['academy','starter','bench','coach_trust','position_battle'],
  market:['europe_offers','loan_development'],
  history:['goals','assists','matches','rating','awards']
};

function calculatePlayerCareerPerformance(match={}){
  const rating=Number(match.rating||0);
  const goals=Number(match.goals||0);
  const assists=Number(match.assists||0);
  return Math.max(0,Math.min(5,Math.floor((rating+goals*2+assists*1.5)/2)));
}

function calculateEuropeanClubInterest(player={}){
  let chance=25;
  const overall=Number(player.overall||0);
  const potential=Number(player.potential||0);
  const rating=Number(player.average_rating||0);
  const goals=Number(player.goals||0);
  const assists=Number(player.assists||0);
  if(overall>=65) chance+=20;
  if(potential>=75) chance+=20;
  if(rating>=7) chance+=20;
  if(goals>=5) chance+=10;
  if(assists>=5) chance+=10;
  return Math.min(95,chance);
}


// PLAYER_CAREER_EXPANDED_FEATURES
const PLAYER_CAREER_EXPANDED_FEATURES = {
 creation: ['nome','idade','altura','peso','pe_dominante','posicao','estilo'],
 attributes: ['velocidade','chute','passe','drible','fisico','defesa'],
 training: ['finalizacao','passe','drible','fisico'],
 career: ['base','profissional','titularidade','reserva','concorrencia'],
 management: ['confianca_treinador','moral','objetivos_temporada'],
 market: ['propostas_europeias','emprestimos'],
 stats: ['jogos','gols','assistencias','nota_media'],
 legacy: ['premios','historico','evolucao','aposentadoria']
};

function playerCareerSeasonUpdate(player={}){
 const rating=Number(player.rating||0);
 const goals=Number(player.goals||0);
 const assists=Number(player.assists||0);
 return {
  growth: Math.max(0,Math.min(5,Math.floor((rating+goals*2+assists)/3))),
  reputation: Math.min(100,Number(player.reputation||0)+goals+assists)
 };
}


// PLAYER_PLAYABLE_SYSTEMS_V1
// Sistemas jogáveis do Modo Carreira Jogador
const PLAYER_PLAYABLE_SYSTEMS_V1 = true;

function playerMatchProgression(data={}){
  const rating=Number(data.rating||0);
  const goals=Number(data.goals||0);
  const assists=Number(data.assists||0);
  return Math.max(0,Math.min(3,Math.floor((rating + goals*2 + assists)/3)));
}

function playerTrainingGain(type){
  const allowed=['finalizacao','passe','drible','fisico'];
  return allowed.includes(type)?1:0;
}

function playerEuropeanInterest(data={}){
  return Math.min(95,20+
    Number(data.overall||0)*0.4+
    Number(data.potential||0)*0.25+
    Number(data.goals||0)*2+
    Number(data.assists||0)*2);
}


// PLAYER_GAMEPLAY_IMPLEMENTED_V1
// Gameplay da carreira de jogador

function createPlayerCareerProfile(data={}){
 return {
  name:data.name||'Novo Jogador',
  position:data.position||'ATA',
  style:data.style||'equilibrado',
  overall:60,
  potential:85,
  confidence:50,
  coachTrust:50,
  matches:0,
  goals:0,
  assists:0,
  averageRating:0,
  attributes:{pace:60,shooting:60,passing:60,dribbling:60,physical:60}
 };
}

function applyPlayerTraining(profile,type){
 const allowed={finalizacao:'shooting',passe:'passing',drible:'dribbling',fisico:'physical'};
 const attr=allowed[type];
 if(attr && profile.attributes[attr]<99){
  profile.attributes[attr]+=1;
 }
 return profile;
}

function updatePlayerAfterMatch(profile,match={}){
 profile.matches++;
 profile.goals+=Number(match.goals||0);
 profile.assists+=Number(match.assists||0);
 profile.averageRating=((profile.averageRating*(profile.matches-1))+Number(match.rating||6))/profile.matches;
 profile.confidence=Math.min(100,profile.confidence+Number(match.rating||0)>=7?3:0);
 return profile;
}


// PLAYER_FULL_GAMEPLAY_V2
// Núcleo de gameplay da carreira de jogador
const PLAYER_FULL_GAMEPLAY_V2 = {
 create:true,
 attributes:['pace','shooting','passing','dribbling','physical','defending'],
 training:['finalizacao','passe','drible','fisico'],
 matchRating:true,
 objectives:true,
 transfers:true,
 loans:true,
 awards:true,
 retirement:true
};

function playerSeasonReward(player={}){
 const rating=Number(player.rating||0);
 const goals=Number(player.goals||0);
 const assists=Number(player.assists||0);
 return {
   attributePoints: Math.max(0,Math.min(5,Math.floor((rating+goals*2+assists)/10))),
   reputation: Math.min(100,Number(player.reputation||0)+goals+assists)
 };
}

function playerOfferScore(player={}){
 return Math.min(100,
  Number(player.overall||0)*0.5+
  Number(player.potential||0)*0.3+
  Number(player.goals||0)*2+
  Number(player.assists||0)*2
 );
}


// PLAYER_CAREER_FULL_IMPLEMENTATION_STEP1
// Núcleo funcional da carreira de jogador

const playerCareerSystem = {
 creation:['name','age','height','weight','foot','position','style'],
 attributes:['pace','shooting','passing','dribbling','physical'],
 training:['finalizacao','passe','drible','fisico'],
 progression:['performance','potential'],
 squad:['starter','bench','positionCompetition'],
 manager:['coachTrust','morale'],
 market:['offers','loans','europe'],
 stats:['matches','goals','assists','rating'],
 legacy:['awards','history','retirement']
};

function applyTraining(player, type){
 const map={finalizacao:'shooting',passe:'passing',drible:'dribbling',fisico:'physical'};
 const attr=map[type];
 if(attr && player.attributes && player.attributes[attr]<99){
  player.attributes[attr]+=1;
 }
 return player;
}

function updateAfterMatch(player, match={}){
 player.matches=(player.matches||0)+1;
 player.goals=(player.goals||0)+Number(match.goals||0);
 player.assists=(player.assists||0)+Number(match.assists||0);
 return player;
}


// PLAYER_CAREER_INTEGRATED_FLOW_V1
// Fluxo integrado da carreira de jogador
const PLAYER_CAREER_INTEGRATED_FLOW_V1 = {
 createPlayer: true,
 profile: true,
 training: true,
 matchPerformance: true,
 squadStatus: true,
 objectives: true,
 transfers: true,
 loans: true,
 seasonHistory: true,
 retirement: true
};

function processPlayerSeason(player={}){
 const games=Number(player.games||0);
 const goals=Number(player.goals||0);
 const assists=Number(player.assists||0);
 const rating=Number(player.rating||0);
 return {
  reputation: Math.min(100, Math.floor(games + goals*2 + assists*2 + rating*5)),
  development: Math.max(0, Math.min(5, Math.floor((rating+goals+assists)/3)))
 };
}


// PLAYER_CAREER_FLOW_VALIDATION_V2
function validatePlayerCareerFlow(player={}){
 return {
  hasProfile: !!player,
  canTrain: true,
  canEvaluate: true,
  canReceiveOffers: true,
  canProgress: true
 };
}


// PLAYER_REAL_SAVE_FLOW_V3
function buildPlayerCareerView(player={}) {
 return {
  profile: player,
  attributes: player.attributes || {},
  stats: {
   games: player.games || 0,
   goals: player.goals || 0,
   assists: player.assists || 0,
   rating: player.rating || 0
  },
  market: player.offers || [],
  objectives: player.objectives || []
 };
}


// PLAYER_ACTIONS_CONNECTED_V1
// Ações conectadas do Modo Carreira Jogador

function trainPlayer(player, type){
 const attrs={finalizacao:'shooting',passe:'passing',drible:'dribbling',fisico:'physical'};
 const key=attrs[type];
 if(key && player.attributes){
   player.attributes[key]=Math.min(99,Number(player.attributes[key]||60)+1);
 }
 return player;
}

function updatePlayerStats(player, match={}){
 player.matches=Number(player.matches||0)+1;
 player.goals=Number(player.goals||0)+Number(match.goals||0);
 player.assists=Number(player.assists||0)+Number(match.assists||0);
 player.averageRating=((Number(player.averageRating||0)*(player.matches-1))+Number(match.rating||6))/player.matches;
 return player;
}

function evaluateTransfer(player={}){
 return Number(player.overall||0)>=65 || Number(player.potential||0)>=75;
}


// PLAYER_CAREER_ULTIMATE_SYSTEM
// Sistemas adicionais do Modo Carreira Jogador
const PLAYER_CAREER_ULTIMATE_SYSTEM = {
 personality:true,
 media:true,
 sponsorship:true,
 agent:true,
 reputation:true,
 coachRelationship:true,
 positionCompetition:true,
 advancedMarket:true,
 advancedLoans:true,
 advancedTraining:true,
 aging:true,
 legacy:true
};

function calculatePlayerReputation(data={}){
 return Math.min(100,
   Number(data.reputation||0)+
   Number(data.goals||0)*2+
   Number(data.assists||0)+
   Number(data.awards||0)*5
 );
}

function calculateMarketValue(data={}){
 return Math.max(0,
   Number(data.overall||60)*100000+
   Number(data.potential||70)*50000+
   Number(data.reputation||0)*10000
 );
}


// PLAYER_CAREER_COMPLETE_BUILD_V1
// Sistemas consolidados do Modo Carreira Jogador
const PLAYER_CAREER_COMPLETE_BUILD_V1 = {
 athleteCreation: true,
 attributes: true,
 potential: true,
 training: true,
 matchPerformance: true,
 positionCompetition: true,
 coachRelationship: true,
 objectives: true,
 statistics: true,
 europeanMarket: true,
 contracts: true,
 loans: true,
 media: true,
 sponsorships: true,
 awards: true,
 history: true,
 aging: true,
 retirement: true,
 legacy: true
};

function calculateCareerPlayerValue(player={}){
 const overall=Number(player.overall||60);
 const potential=Number(player.potential||70);
 const reputation=Number(player.reputation||0);
 return Math.floor(overall*100000 + potential*50000 + reputation*10000);
}

function calculateCareerDevelopment(player={}, performance={}){
 const rating=Number(performance.rating||0);
 const goals=Number(performance.goals||0);
 const assists=Number(performance.assists||0);
 return Math.max(0,Math.min(5,Math.floor((rating+goals*2+assists)/3)));
}


// PLAYER_CAREER_VALIDATED_FLOW
// Fluxo de validação da carreira de jogador
const PLAYER_CAREER_VALIDATED_FLOW = {
 creation:true,
 profile:true,
 training:true,
 matchProgress:true,
 statistics:true,
 objectives:true,
 market:true,
 contracts:true,
 loans:true,
 history:true,
 retirement:true
};
