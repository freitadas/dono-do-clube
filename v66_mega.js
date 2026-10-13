"use strict";

module.exports = async function installV66(ctx){
  const {
    app,pool,auth,userClub,q,tx,getCareer,rand,clamp,randomName,
    salaryForRating,roleFor,addFinance,publishNews,normalizeSearch
  }=ctx;

  const AGE_GROUPS={U15:[14,15],U17:[16,17],U20:[18,20]};
  const REGIONS={
    BR:["Brasil","América do Sul"],ARG:["Argentina","América do Sul"],URU:["Uruguai","América do Sul"],COL:["Colômbia","América do Sul"],
    ENG:["Inglaterra","Europa"],ESP:["Espanha","Europa"],ITA:["Itália","Europa"],GER:["Alemanha","Europa"],FRA:["França","Europa"],POR:["Portugal","Europa"],NED:["Holanda","Europa"],
    MEX:["México","América do Norte"],USA:["Estados Unidos","América do Norte"],JPN:["Japão","Ásia"],KOR:["Coreia do Sul","Ásia"],KSA:["Arábia Saudita","Ásia"]
  };
  const PERSONALITIES=["PROFESSIONAL","AMBITIOUS","LOYAL","LEADER","TEMPERAMENTAL","TEAM_PLAYER","SHOWMAN"];
  const FEET=["RIGHT","LEFT"];
  const AGENT_NAMES=["Elite Sports","Prime Football","Global XI","Next Level","Arena Management","Top Player Group"];

  function safeNum(v,f=0){const n=Number(v);return Number.isFinite(n)?n:f}
  function clubProfileDefaults(c){
    const rating=safeNum(c.base_rating||c.team_rating,64);
    const nat=clamp(Math.round(25+(rating-55)*2.2),10,95);
    const cont=clamp(Math.round(10+(rating-60)*1.8),5,92);
    const world=clamp(Math.round(5+(rating-65)*1.5),1,90);
    return {nat,cont,world,fans:Math.max(1500,Math.round((rating**2)*110))};
  }
  function attr(v,delta=0){return clamp(Math.round(safeNum(v,60)+delta),20,99)}
  function calcDetailedFromBase(p){
    const pos=String(p.position||"MID");
    const pace=safeNum(p.pace,60),shoot=safeNum(p.shooting,60),pass=safeNum(p.passing,60),def=safeNum(p.defending,60),rating=safeNum(p.rating,60);
    const out={
      acceleration:attr(pace,1),sprint_speed:attr(pace,-1),finishing:attr(shoot,pos==="ATT"?2:-2),long_shots:attr(shoot,-1),
      short_passing:attr(pass,2),long_passing:attr(pass,-1),dribbling:attr((pace+pass)/2,pos==="ATT"?3:0),ball_control:attr((pass+rating)/2,1),
      marking:attr(def,pos==="DEF"?3:-1),tackling:attr(def,pos==="DEF"?2:0),strength:attr((rating+def)/2,pos==="DEF"?4:0),stamina:attr((rating+pace)/2,2),
      heading:attr((rating+def+shoot)/3,pos==="DEF"||pos==="ATT"?2:0),positioning:attr((rating+shoot)/2,pos==="ATT"?4:0),vision:attr((rating+pass)/2,pos==="MID"?4:0),
      gk_reflexes:pos==="GK"?attr(rating,3):25,gk_handling:pos==="GK"?attr(rating,1):25,gk_positioning:pos==="GK"?attr(rating,2):25
    };
    return out;
  }
  function weightedOverall(p){
    const a=calcDetailedFromBase(p);
    const pos=String(p.position||"MID");
    if(pos==="GK")return clamp(Math.round(a.gk_reflexes*.38+a.gk_handling*.30+a.gk_positioning*.32),40,99);
    if(pos==="DEF")return clamp(Math.round(a.marking*.22+a.tackling*.23+a.strength*.16+a.heading*.12+a.short_passing*.10+a.sprint_speed*.09+a.stamina*.08),40,99);
    if(pos==="MID")return clamp(Math.round(a.short_passing*.22+a.long_passing*.15+a.vision*.18+a.ball_control*.15+a.stamina*.10+a.dribbling*.10+a.tackling*.10),40,99);
    return clamp(Math.round(a.finishing*.24+a.positioning*.18+a.acceleration*.14+a.sprint_speed*.14+a.dribbling*.12+a.ball_control*.10+a.heading*.08),40,99);
  }
  function personalityLabel(v){return ({PROFESSIONAL:"Profissional",AMBITIOUS:"Ambicioso",LOYAL:"Leal",LEADER:"Líder",TEMPERAMENTAL:"Temperamental",TEAM_PLAYER:"Coletivo",SHOWMAN:"Midiático"})[v]||v}
  function positionRole(position){
    const pools={GK:["GK"],DEF:["CB","RB","LB"],MID:["CDM","CM","CAM","RM","LM"],ATT:["ST","RW","LW"]};
    const a=pools[position]||[roleFor(position)];return a[rand(0,a.length-1)];
  }
  function regionCountry(region,clubCountry){
    const map={BR:["BR"],SOUTH_AMERICA:["BR","ARG","URU","COL","CHI","ECU","PER"],EUROPE:["ENG","ESP","ITA","GER","FRA","POR","NED","BEL","CRO"],NORTH_AMERICA:["MEX","USA","CAN"],ASIA:["JPN","KOR","KSA","IRN"]};
    const a=map[region]||[clubCountry||"BR"];return a[rand(0,a.length-1)]||clubCountry||"BR";
  }
  function youthCost(level,region){return Math.round((900+level*450)*(region==="BR"?1:1.35)/50)*50}
  function newgenName(country){
    const suffix={BR:["Silva","Santos","Oliveira","Souza"],ARG:["Gómez","Fernández","Romero","Álvarez"],URU:["Pereira","Suárez","Rodríguez"],ENG:["Smith","Taylor","Wilson"],ESP:["García","Martínez","López"],ITA:["Rossi","Romano","Bianchi"],GER:["Schmidt","Müller","Weber"],FRA:["Martin","Bernard","Dubois"],POR:["Silva","Costa","Pereira"],JPN:["Sato","Tanaka","Suzuki"],KOR:["Kim","Lee","Park"],MEX:["Hernández","García","Ramírez"]};
    const first=String(randomName()).split(" ")[0]||"Alex";
    const arr=suffix[country]||[String(randomName()).split(" ").slice(-1)[0]||"Costa"];
    return `${first} ${arr[rand(0,arr.length-1)]}`;
  }

  async function migrate(){
    const already=(await q(`SELECT 1 FROM app_meta WHERE key='v66_mega_career_20261012' LIMIT 1`)).rowCount>0;
    if(already)return;
    const alters=[
      `ALTER TABLE players ADD COLUMN IF NOT EXISTS preferred_foot TEXT NOT NULL DEFAULT 'RIGHT'`,
      `ALTER TABLE players ADD COLUMN IF NOT EXISTS shirt_number INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE players ADD COLUMN IF NOT EXISTS personality TEXT NOT NULL DEFAULT 'PROFESSIONAL'`,
      `ALTER TABLE players ADD COLUMN IF NOT EXISTS world_reputation INTEGER NOT NULL DEFAULT 10`,
      `ALTER TABLE players ADD COLUMN IF NOT EXISTS release_clause INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE players ADD COLUMN IF NOT EXISTS signing_bonus INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE players ADD COLUMN IF NOT EXISTS agent_name TEXT`,
      `ALTER TABLE players ADD COLUMN IF NOT EXISTS agent_commission INTEGER NOT NULL DEFAULT 5`,
      `ALTER TABLE players ADD COLUMN IF NOT EXISTS sell_on_percent INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE players ADD COLUMN IF NOT EXISTS sell_on_club_id BIGINT REFERENCES clubs(id) ON DELETE SET NULL`,
      `ALTER TABLE players ADD COLUMN IF NOT EXISTS bonus_club_id BIGINT REFERENCES clubs(id) ON DELETE SET NULL`,
      `ALTER TABLE players ADD COLUMN IF NOT EXISTS bonus_appearance_target INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE players ADD COLUMN IF NOT EXISTS bonus_appearance_amount INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE players ADD COLUMN IF NOT EXISTS bonus_appearance_paid BOOLEAN NOT NULL DEFAULT FALSE`,
      `ALTER TABLE players ADD COLUMN IF NOT EXISTS bonus_goal_target INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE players ADD COLUMN IF NOT EXISTS bonus_goal_amount INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE players ADD COLUMN IF NOT EXISTS bonus_goal_paid BOOLEAN NOT NULL DEFAULT FALSE`,
      `ALTER TABLE players ADD COLUMN IF NOT EXISTS retired BOOLEAN NOT NULL DEFAULT FALSE`,
      `ALTER TABLE players ADD COLUMN IF NOT EXISTS retired_season INTEGER`,
      `ALTER TABLE players ADD COLUMN IF NOT EXISTS club_joined_season INTEGER NOT NULL DEFAULT 1`,
      `ALTER TABLE players ADD COLUMN IF NOT EXISTS acceleration INTEGER NOT NULL DEFAULT 60`,
      `ALTER TABLE players ADD COLUMN IF NOT EXISTS sprint_speed INTEGER NOT NULL DEFAULT 60`,
      `ALTER TABLE players ADD COLUMN IF NOT EXISTS finishing INTEGER NOT NULL DEFAULT 60`,
      `ALTER TABLE players ADD COLUMN IF NOT EXISTS long_shots INTEGER NOT NULL DEFAULT 60`,
      `ALTER TABLE players ADD COLUMN IF NOT EXISTS short_passing INTEGER NOT NULL DEFAULT 60`,
      `ALTER TABLE players ADD COLUMN IF NOT EXISTS long_passing INTEGER NOT NULL DEFAULT 60`,
      `ALTER TABLE players ADD COLUMN IF NOT EXISTS dribbling INTEGER NOT NULL DEFAULT 60`,
      `ALTER TABLE players ADD COLUMN IF NOT EXISTS ball_control INTEGER NOT NULL DEFAULT 60`,
      `ALTER TABLE players ADD COLUMN IF NOT EXISTS marking INTEGER NOT NULL DEFAULT 60`,
      `ALTER TABLE players ADD COLUMN IF NOT EXISTS tackling INTEGER NOT NULL DEFAULT 60`,
      `ALTER TABLE players ADD COLUMN IF NOT EXISTS strength INTEGER NOT NULL DEFAULT 60`,
      `ALTER TABLE players ADD COLUMN IF NOT EXISTS stamina INTEGER NOT NULL DEFAULT 60`,
      `ALTER TABLE players ADD COLUMN IF NOT EXISTS heading INTEGER NOT NULL DEFAULT 60`,
      `ALTER TABLE players ADD COLUMN IF NOT EXISTS positioning INTEGER NOT NULL DEFAULT 60`,
      `ALTER TABLE players ADD COLUMN IF NOT EXISTS vision INTEGER NOT NULL DEFAULT 60`,
      `ALTER TABLE players ADD COLUMN IF NOT EXISTS gk_reflexes INTEGER NOT NULL DEFAULT 25`,
      `ALTER TABLE players ADD COLUMN IF NOT EXISTS gk_handling INTEGER NOT NULL DEFAULT 25`,
      `ALTER TABLE players ADD COLUMN IF NOT EXISTS gk_positioning INTEGER NOT NULL DEFAULT 25`,
      `ALTER TABLE clubs ADD COLUMN IF NOT EXISTS fan_count BIGINT NOT NULL DEFAULT 5000`,
      `ALTER TABLE clubs ADD COLUMN IF NOT EXISTS social_followers BIGINT NOT NULL DEFAULT 1000`,
      `ALTER TABLE clubs ADD COLUMN IF NOT EXISTS media_reputation INTEGER NOT NULL DEFAULT 20`,
      `ALTER TABLE clubs ADD COLUMN IF NOT EXISTS national_reputation INTEGER NOT NULL DEFAULT 40`,
      `ALTER TABLE clubs ADD COLUMN IF NOT EXISTS continental_reputation INTEGER NOT NULL DEFAULT 20`,
      `ALTER TABLE clubs ADD COLUMN IF NOT EXISTS world_reputation INTEGER NOT NULL DEFAULT 10`,
      `ALTER TABLE clubs ADD COLUMN IF NOT EXISTS stadium_name TEXT`,
      `ALTER TABLE clubs ADD COLUMN IF NOT EXISTS training_level INTEGER NOT NULL DEFAULT 1`,
      `ALTER TABLE clubs ADD COLUMN IF NOT EXISTS academy_level INTEGER NOT NULL DEFAULT 1`,
      `ALTER TABLE clubs ADD COLUMN IF NOT EXISTS club_philosophy TEXT NOT NULL DEFAULT 'BALANCED'`,
      `ALTER TABLE clubs ADD COLUMN IF NOT EXISTS transfer_strategy TEXT NOT NULL DEFAULT 'BALANCED'`,
      `ALTER TABLE clubs ADD COLUMN IF NOT EXISTS home_kit_primary TEXT`,
      `ALTER TABLE clubs ADD COLUMN IF NOT EXISTS home_kit_secondary TEXT`,
      `ALTER TABLE clubs ADD COLUMN IF NOT EXISTS away_kit_primary TEXT`,
      `ALTER TABLE clubs ADD COLUMN IF NOT EXISTS away_kit_secondary TEXT`,
      `ALTER TABLE clubs ADD COLUMN IF NOT EXISTS third_kit_primary TEXT`,
      `ALTER TABLE clubs ADD COLUMN IF NOT EXISTS third_kit_secondary TEXT`,
      `ALTER TABLE academy_players ADD COLUMN IF NOT EXISTS age_group TEXT NOT NULL DEFAULT 'U20'`,
      `ALTER TABLE academy_players ADD COLUMN IF NOT EXISTS nationality_code TEXT`,
      `ALTER TABLE academy_players ADD COLUMN IF NOT EXISTS preferred_foot TEXT NOT NULL DEFAULT 'RIGHT'`,
      `ALTER TABLE academy_players ADD COLUMN IF NOT EXISTS scout_region TEXT`,
      `ALTER TABLE academy_players ADD COLUMN IF NOT EXISTS personality TEXT NOT NULL DEFAULT 'PROFESSIONAL'`
    ];
    for(const sql of alters)await q(sql);
    await q(`CREATE TABLE IF NOT EXISTS transfer_history(
      id BIGSERIAL PRIMARY KEY, career_owner_id BIGINT REFERENCES clubs(id) ON DELETE CASCADE,
      season_no INTEGER NOT NULL DEFAULT 1, player_id BIGINT REFERENCES players(id) ON DELETE SET NULL,
      player_name TEXT NOT NULL, from_club_id BIGINT REFERENCES clubs(id) ON DELETE SET NULL,
      to_club_id BIGINT REFERENCES clubs(id) ON DELETE SET NULL, from_club_name TEXT, to_club_name TEXT,
      transfer_type TEXT NOT NULL, fee INTEGER NOT NULL DEFAULT 0, details JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await q(`CREATE TABLE IF NOT EXISTS player_conversations(
      id BIGSERIAL PRIMARY KEY, club_id BIGINT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
      player_id BIGINT NOT NULL REFERENCES players(id) ON DELETE CASCADE, season_no INTEGER NOT NULL DEFAULT 1,
      round_no INTEGER NOT NULL DEFAULT 0, action TEXT NOT NULL, result_text TEXT NOT NULL,
      morale_delta INTEGER NOT NULL DEFAULT 0, happiness_delta INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await q(`CREATE TABLE IF NOT EXISTS youth_scouting(
      id BIGSERIAL PRIMARY KEY, club_id BIGINT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
      season_no INTEGER NOT NULL DEFAULT 1, age_group TEXT NOT NULL, region TEXT NOT NULL,
      country_code TEXT, cost INTEGER NOT NULL DEFAULT 0, prospects_found INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await q(`CREATE TABLE IF NOT EXISTS club_editor_audit(
      id BIGSERIAL PRIMARY KEY, club_id BIGINT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
      entity_type TEXT NOT NULL, entity_id BIGINT, change_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await q(`CREATE TABLE IF NOT EXISTS world_awards(
      id BIGSERIAL PRIMARY KEY, season_no INTEGER NOT NULL, award_type TEXT NOT NULL,
      player_id BIGINT REFERENCES players(id) ON DELETE SET NULL, player_name TEXT NOT NULL,
      club_id BIGINT REFERENCES clubs(id) ON DELETE SET NULL, club_name TEXT,
      score INTEGER NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(season_no,award_type))`);
    await q(`CREATE INDEX IF NOT EXISTS idx_transfer_history_owner ON transfer_history(career_owner_id,created_at DESC)`);
    await q(`CREATE INDEX IF NOT EXISTS idx_player_conversations_club ON player_conversations(club_id,created_at DESC)`);
    await q(`CREATE INDEX IF NOT EXISTS idx_youth_scouting_club ON youth_scouting(club_id,created_at DESC)`);

    const clubs=(await q(`SELECT id,name,base_rating,team_rating,primary_color,secondary_color,stadium_name,fan_count,national_reputation,continental_reputation,world_reputation FROM clubs`)).rows;
    for(const c of clubs){
      const d=clubProfileDefaults(c);
      await q(`UPDATE clubs SET
        stadium_name=COALESCE(NULLIF(stadium_name,''),$2),
        fan_count=CASE WHEN fan_count<=5000 THEN $3 ELSE fan_count END,
        national_reputation=CASE WHEN national_reputation=40 THEN $4 ELSE national_reputation END,
        continental_reputation=CASE WHEN continental_reputation=20 THEN $5 ELSE continental_reputation END,
        world_reputation=CASE WHEN world_reputation=10 THEN $6 ELSE world_reputation END,
        social_followers=CASE WHEN social_followers<=1000 THEN GREATEST(1000,ROUND($3*.42)::bigint) ELSE social_followers END,
        home_kit_primary=COALESCE(home_kit_primary,primary_color),home_kit_secondary=COALESCE(home_kit_secondary,secondary_color),
        away_kit_primary=COALESCE(away_kit_primary,secondary_color),away_kit_secondary=COALESCE(away_kit_secondary,primary_color),
        third_kit_primary=COALESCE(third_kit_primary,'#111827'),third_kit_secondary=COALESCE(third_kit_secondary,'#f8fafc')
        WHERE id=$1`,[c.id,`Estádio ${c.name}`,d.fans,d.nat,d.cont,d.world]);
    }
    await q(`UPDATE clubs SET
      club_philosophy=CASE WHEN is_ai=TRUE AND base_rating>=80 THEN 'GALACTICOS' WHEN is_ai=TRUE AND base_rating<=66 THEN 'YOUTH' WHEN is_ai=TRUE AND MOD(id,4)=0 THEN 'PRESSING' WHEN is_ai=TRUE AND MOD(id,4)=1 THEN 'POSSESSION' WHEN is_ai=TRUE AND MOD(id,4)=2 THEN 'COUNTER' ELSE club_philosophy END,
      transfer_strategy=CASE WHEN is_ai=TRUE AND base_rating>=80 THEN 'STAR_HUNT' WHEN is_ai=TRUE AND base_rating<=66 THEN 'YOUTH_FIRST' WHEN is_ai=TRUE AND MOD(id,3)=0 THEN 'VALUE_BUY' ELSE transfer_strategy END
      WHERE is_ai=TRUE`);
    const ps=(await q(`SELECT id,club_id,name,position,role,rating,pace,shooting,passing,defending,age,price,shirt_number,release_clause,agent_name FROM players`)).rows;
    for(const p of ps){
      const a=calcDetailedFromBase(p);
      const seed=Math.abs([...String(p.name||p.id)].reduce((n,ch)=>((n*31)+ch.charCodeAt(0))|0,7));
      const personality=PERSONALITIES[seed%PERSONALITIES.length];
      const foot=FEET[(seed>>2)%FEET.length];
      const shirt=Number(p.shirt_number||0)>0?Number(p.shirt_number):((seed%98)+1);
      const clause=Math.max(1000,Math.round(safeNum(p.price,1000)*(1.6+(seed%7)/20)/100)*100);
      const agent=p.agent_name||AGENT_NAMES[seed%AGENT_NAMES.length];
      const posOverall=weightedOverall({...p,...a});
      await q(`UPDATE players SET acceleration=$2,sprint_speed=$3,finishing=$4,long_shots=$5,short_passing=$6,long_passing=$7,dribbling=$8,ball_control=$9,marking=$10,tackling=$11,strength=$12,stamina=$13,heading=$14,positioning=$15,vision=$16,gk_reflexes=$17,gk_handling=$18,gk_positioning=$19,preferred_foot=$20,shirt_number=$21,personality=$22,release_clause=CASE WHEN release_clause<=0 THEN $23 ELSE release_clause END,agent_name=$24,rating=$25 WHERE id=$1`,
        [p.id,a.acceleration,a.sprint_speed,a.finishing,a.long_shots,a.short_passing,a.long_passing,a.dribbling,a.ball_control,a.marking,a.tackling,a.strength,a.stamina,a.heading,a.positioning,a.vision,a.gk_reflexes,a.gk_handling,a.gk_positioning,foot,shirt,personality,clause,agent,posOverall]);
    }
    await q(`INSERT INTO app_meta(key,value) VALUES('v66_mega_career_20261012',$1) ON CONFLICT(key) DO NOTHING`,[new Date().toISOString()]);
  }

  await migrate();

  async function logTransfer(client,data){
    const careerOwnerId=data.careerOwnerId||data.toClubId||data.fromClubId;
    if(!careerOwnerId)return;
    const career=await getCareer(careerOwnerId).catch(()=>null);
    await client.query(`INSERT INTO transfer_history(career_owner_id,season_no,player_id,player_name,from_club_id,to_club_id,from_club_name,to_club_name,transfer_type,fee,details)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)`,[
      careerOwnerId,career?.season_no||1,data.playerId||null,data.playerName||"Jogador",data.fromClubId||null,data.toClubId||null,
      data.fromClubName||null,data.toClubName||null,data.type||"TRANSFER",Math.max(0,safeNum(data.fee,0)),JSON.stringify(data.details||{})
    ]).catch(()=>{});
  }
  globalThis.__v66LogTransfer=logTransfer;

  async function seasonTransition(client,ownerId,career,club){
    const rows=(await client.query(`SELECT * FROM players WHERE club_id=$1 OR (club_id IS NULL AND retired=FALSE)`,[ownerId])).rows;
    const retired=[];
    for(const p of rows.filter(x=>String(x.club_id)===String(ownerId))){
      const age=safeNum(p.age,24),apps=safeNum(p.season_appearances,0),form=safeNum(p.form_rating,70),rating=safeNum(p.rating,60),pot=Math.max(rating,safeNum(p.potential,rating));
      let dynamicPot=pot;
      if(age<=24&&apps>=18&&form>=78)dynamicPot=clamp(pot+1,40,99);
      if(age<=21&&apps>=25&&form>=82)dynamicPot=clamp(dynamicPot+1,40,99);
      const repDelta=apps>=25?2:apps>=10?1:0;
      const retireChance=age>=40?.72:age>=38?.42:age>=36?.16:0;
      if(retireChance>0&&Math.random()<retireChance){
        retired.push(p);
        await client.query(`UPDATE players SET retired=TRUE,retired_season=$2,club_id=NULL,is_starter=FALSE,transfer_listed=FALSE WHERE id=$1`,[p.id,career.season_no]);
        await client.query(`INSERT INTO club_events(club_id,event_type,title,description) VALUES($1,'retirement','Aposentadoria',$2)`,[ownerId,`${p.name} anunciou a aposentadoria aos ${age} anos.`]);
        continue;
      }
      await client.query(`UPDATE players SET potential=$2,world_reputation=LEAST(100,world_reputation+$3),release_clause=GREATEST(release_clause,ROUND(price*1.45)::int) WHERE id=$1`,[p.id,dynamicPot,repDelta]);
      if(p.bonus_club_id&&String(p.bonus_club_id)!==String(ownerId)){
        if(!p.bonus_appearance_paid&&safeNum(p.bonus_appearance_target)>0&&safeNum(p.appearances)>=safeNum(p.bonus_appearance_target)&&safeNum(p.bonus_appearance_amount)>0){
          const amount=safeNum(p.bonus_appearance_amount);await addFinance(client,ownerId,-amount,"transfer_bonus",`Bônus de jogos — ${p.name}`);await client.query(`UPDATE clubs SET coins=coins+$2 WHERE id=$1`,[p.bonus_club_id,amount]);await client.query(`UPDATE players SET bonus_appearance_paid=TRUE WHERE id=$1`,[p.id]);
        }
        if(!p.bonus_goal_paid&&safeNum(p.bonus_goal_target)>0&&safeNum(p.goals)>=safeNum(p.bonus_goal_target)&&safeNum(p.bonus_goal_amount)>0){
          const amount=safeNum(p.bonus_goal_amount);await addFinance(client,ownerId,-amount,"transfer_bonus",`Bônus de gols — ${p.name}`);await client.query(`UPDATE clubs SET coins=coins+$2 WHERE id=$1`,[p.bonus_club_id,amount]);await client.query(`UPDATE players SET bonus_goal_paid=TRUE WHERE id=$1`,[p.id]);
        }
      }
    }

    for(const old of retired){
      const country=old.nationality_code||club.country_code||"BR";
      const age=rand(15,18),rating=clamp(Math.round(safeNum(old.rating,65)*.70)+rand(-3,3),48,72),potential=clamp(rating+rand(10,22),65,94);
      await client.query(`INSERT INTO academy_players(club_id,season_no,name,position,role,age,rating,potential,status,age_group,nationality_code,preferred_foot,scout_region,personality)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,'academy',$9,$10,$11,'legacy',$12)`,[ownerId,career.season_no+1,newgenName(country),old.position,old.role||positionRole(old.position),age,rating,potential,age<=15?"U15":age<=17?"U17":"U20",country,Math.random()<.22?"LEFT":"RIGHT",PERSONALITIES[rand(0,PERSONALITIES.length-1)]]);
    }

    const table=career.data?.divisions?.[career.user_division]?.entries||[];
    const sorted=[...table].sort((a,b)=>safeNum(b.points)-safeNum(a.points)||(safeNum(b.gf)-safeNum(b.ga))-(safeNum(a.gf)-safeNum(a.ga)));
    const pos=Math.max(1,sorted.findIndex(x=>String(x.clubId)===String(ownerId))+1);
    const trophies=safeNum((await client.query(`SELECT COUNT(*)::int count FROM club_trophies WHERE club_id=$1 AND season_no=$2`,[ownerId,career.season_no])).rows[0]?.count,0);
    const fanDelta=(trophies*4500)+(pos<=4?3500:pos>=17?-2500:800);
    const repDelta=(trophies*4)+(pos<=4?3:pos>=17?-3:1);
    await client.query(`UPDATE clubs SET fan_count=GREATEST(1000,fan_count+$2),social_followers=GREATEST(500,social_followers+GREATEST(-1500,ROUND($2*.65)::bigint)),national_reputation=GREATEST(1,LEAST(100,national_reputation+$3)),continental_reputation=GREATEST(1,LEAST(100,continental_reputation+$4)),world_reputation=GREATEST(1,LEAST(100,world_reputation+$5)),media_reputation=GREATEST(1,LEAST(100,media_reputation+CASE WHEN $3>0 THEN 2 ELSE -1 END)) WHERE id=$1`,[ownerId,fanDelta,repDelta,trophies>=1?2:0,trophies>=2?1:0]);

    const awardPool=(await client.query(`SELECT p.id,p.name,p.age,p.rating,p.goals,p.assists,p.form_rating,p.club_id,c.name club_name FROM players p LEFT JOIN clubs c ON c.id=p.club_id WHERE p.retired=FALSE AND p.club_id IS NOT NULL ORDER BY p.rating DESC LIMIT 300`)).rows;
    const awardDefs=[
      ["WORLD_PLAYER","Melhor jogador do mundo",x=>safeNum(x.rating)*3+safeNum(x.form_rating)+safeNum(x.goals)*2+safeNum(x.assists)],
      ["GOLDEN_BOOT","Chuteira de Ouro",x=>safeNum(x.goals)*5+safeNum(x.rating)],
      ["BEST_YOUNG","Melhor jovem",x=>(safeNum(x.age)<=21?safeNum(x.rating)*4+safeNum(x.form_rating):0)]
    ];
    for(const [type,title,scoreFn] of awardDefs){
      const ranked=awardPool.map(x=>({...x,_score:scoreFn(x)})).sort((a,b)=>b._score-a._score);const w=ranked[0];if(!w||w._score<=0)continue;
      await client.query(`INSERT INTO world_awards(season_no,award_type,player_id,player_name,club_id,club_name,score) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(season_no,award_type) DO NOTHING`,[career.season_no,type,w.id,w.name,w.club_id,w.club_name,w._score]);
    }
  }
  globalThis.__v66SeasonTransition=seasonTransition;

  async function ownClub(req){
    const c=await userClub(req.user.id);if(!c)throw Object.assign(new Error("Carreira de clube não encontrada."),{status:404});return c;
  }
  function route(handler){return async(req,res)=>{try{await handler(req,res)}catch(e){console.error("V66",e);res.status(e.status||500).json({error:e.status&&e.status<500?e.message:"Erro interno do servidor."})}}}

  app.get("/api/v66/hub",auth,route(async(req,res)=>{
    const c=await ownClub(req);const career=await getCareer(c.id);
    const [club,players,academy,scouting,conversations,history,records,worldAwards]=await Promise.all([
      q(`SELECT * FROM clubs WHERE id=$1`,[c.id]),
      q(`SELECT * FROM players WHERE club_id=$1 AND retired=FALSE ORDER BY is_starter DESC,rating DESC`,[c.id]),
      q(`SELECT * FROM academy_players WHERE club_id=$1 AND status='academy' ORDER BY age_group, potential DESC,rating DESC`,[c.id]),
      q(`SELECT * FROM youth_scouting WHERE club_id=$1 ORDER BY created_at DESC LIMIT 12`,[c.id]),
      q(`SELECT pc.*,p.name player_name FROM player_conversations pc JOIN players p ON p.id=pc.player_id WHERE pc.club_id=$1 ORDER BY pc.created_at DESC LIMIT 20`,[c.id]),
      q(`SELECT * FROM transfer_history WHERE career_owner_id=$1 ORDER BY created_at DESC LIMIT 40`,[c.id]),
      q(`SELECT COUNT(*)::int retired_count FROM players WHERE retired=TRUE`),
      q(`SELECT * FROM world_awards ORDER BY season_no DESC,id DESC LIMIT 12`)
    ]);
    const expiring=players.rows.filter(p=>safeNum(p.contract_seasons,0)<=1).sort((a,b)=>safeNum(b.rating)-safeNum(a.rating));
    const nextFixtures=[];
    const div=career?.data?.divisions?.[career.user_division];
    for(const f of div?.fixtures||[]){if(!f.played&&(String(f.home)===String(c.id)||String(f.away)===String(c.id)))nextFixtures.push(f);if(nextFixtures.length>=8)break}
    res.json({club:club.rows[0],players:players.rows,academy:academy.rows,scouting:scouting.rows,conversations:conversations.rows,transferHistory:history.rows,worldAwards:worldAwards.rows,expiring,nextFixtures,retiredCount:records.rows[0]?.retired_count||0,season:career?.season_no||1,round:career?.current_round||1,ageGroups:Object.keys(AGE_GROUPS)});
  }));

  app.post("/api/v66/youth-scout",auth,route(async(req,res)=>{
    const c=await ownClub(req);const career=await getCareer(c.id);const ageGroup=String(req.body.ageGroup||"U17").toUpperCase();const region=String(req.body.region||"BR").toUpperCase();
    if(!AGE_GROUPS[ageGroup])throw Object.assign(new Error("Faixa de base inválida."),{status:400});
    const club=(await q(`SELECT * FROM clubs WHERE id=$1`,[c.id])).rows[0];const level=safeNum(club.academy_level,1);const cost=youthCost(level,region);
    if(safeNum(club.coins)<cost)throw Object.assign(new Error(`Saldo insuficiente. A observação custa ${cost.toLocaleString("pt-BR")} moedas.`),{status:400});
    const found=await tx(async client=>{
      await addFinance(client,c.id,-cost,"youth_scout",`Olheiro de base — ${ageGroup} / ${region}`);
      const items=[];const [lo,hi]=AGE_GROUPS[ageGroup];
      for(let i=0;i<3;i++){
        const country=regionCountry(region,c.country_code||"BR");const position=["GK","DEF","MID","ATT"][rand(0,3)];const age=rand(lo,hi);
        const rating=clamp(46+level*2+rand(0,9)+(age>=18?3:0),45,74);const potential=clamp(rating+rand(9,20)+level,60,96);
        const r=await client.query(`INSERT INTO academy_players(club_id,season_no,name,position,role,age,rating,potential,status,age_group,nationality_code,preferred_foot,scout_region,personality)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,'academy',$9,$10,$11,$12,$13) RETURNING *`,[c.id,career?.season_no||1,newgenName(country),position,positionRole(position),age,rating,potential,ageGroup,country,Math.random()<.22?"LEFT":"RIGHT",region,PERSONALITIES[rand(0,PERSONALITIES.length-1)]]);
        items.push(r.rows[0]);
      }
      await client.query(`INSERT INTO youth_scouting(club_id,season_no,age_group,region,country_code,cost,prospects_found) VALUES($1,$2,$3,$4,$5,$6,$7)`,[c.id,career?.season_no||1,ageGroup,region,c.country_code||"BR",cost,items.length]);
      return items;
    });
    res.json({ok:true,cost,prospects:found});
  }));

  app.post("/api/v66/player/:id/conversation",auth,route(async(req,res)=>{
    const c=await ownClub(req);const career=await getCareer(c.id);const id=String(req.params.id);const action=String(req.body.action||"PRAISE").toUpperCase();
    const player=(await q(`SELECT * FROM players WHERE id=$1 AND club_id=$2`,[id,c.id])).rows[0];if(!player)throw Object.assign(new Error("Jogador não encontrado."),{status:404});
    const used=(await q(`SELECT 1 FROM player_conversations WHERE club_id=$1 AND player_id=$2 AND season_no=$3 AND round_no=$4`,[c.id,id,career?.season_no||1,career?.current_round||0])).rowCount;
    if(used)throw Object.assign(new Error("Você já conversou com este jogador nesta rodada."),{status:409});
    let morale=0,happy=0,text="";
    if(action==="PRAISE"){morale=5;happy=4;text=`Você elogiou ${player.name}. O jogador saiu mais confiante.`}
    else if(action==="DEMAND"){morale=-2;happy=-3;text=`Você cobrou mais desempenho de ${player.name}. A pressão aumentou.`}
    else if(action==="PROMISE_MINUTES"){morale=3;happy=6;text=`Você prometeu mais minutos a ${player.name}. A expectativa aumentou.`}
    else if(action==="CAPTAIN_TALK"){morale=4;happy=2;text=`Você conversou sobre liderança com ${player.name}.`}
    else throw Object.assign(new Error("Ação de conversa inválida."),{status:400});
    await tx(async client=>{
      await client.query(`UPDATE players SET morale=GREATEST(0,LEAST(100,morale+$2)),happiness=GREATEST(0,LEAST(100,happiness+$3)) WHERE id=$1`,[id,morale,happy]);
      await client.query(`INSERT INTO player_conversations(club_id,player_id,season_no,round_no,action,result_text,morale_delta,happiness_delta) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[c.id,id,career?.season_no||1,career?.current_round||0,action,text,morale,happy]);
    });
    res.json({ok:true,resultText:text});
  }));

  app.post("/api/v66/player/:id/renew",auth,route(async(req,res)=>{
    const c=await ownClub(req);const id=String(req.params.id);const player=(await q(`SELECT * FROM players WHERE id=$1 AND club_id=$2`,[id,c.id])).rows[0];if(!player)throw Object.assign(new Error("Jogador não encontrado."),{status:404});
    const years=clamp(Math.round(safeNum(req.body.years,3)),1,5);const salary=Math.max(100,Math.round(safeNum(req.body.salary,salaryForRating(player.rating))/10)*10);const release=Math.max(0,Math.round(safeNum(req.body.releaseClause,player.release_clause||player.price*2)/100)*100);const signing=Math.max(0,Math.round(safeNum(req.body.signingBonus,salary*2)/100)*100);
    const ask=Math.max(salaryForRating(player.rating),safeNum(player.salary,0));const personality=String(player.personality||"PROFESSIONAL");
    let chance=58+(salary/Math.max(1,ask)-1)*70+(years-2)*3+(safeNum(player.happiness,75)-70)*.45;
    if(personality==="AMBITIOUS")chance-=safeNum(c.national_reputation,40)<60?9:0;if(personality==="LOYAL")chance+=10;if(personality==="TEMPERAMENTAL")chance-=4;chance=clamp(Math.round(chance),10,96);
    if(rand(1,100)>chance)return res.status(409).json({error:`${player.name} recusou a proposta. Interesse estimado: ${chance}%.`});
    await tx(async client=>{
      if(signing>0)await addFinance(client,c.id,-signing,"contract_bonus",`Luvas de renovação — ${player.name}`);
      await client.query(`UPDATE players SET contract_seasons=$2,salary=$3,release_clause=$4,signing_bonus=$5,happiness=LEAST(100,happiness+5) WHERE id=$1`,[id,years,salary,release,signing]);
    });
    res.json({ok:true,years,salary,releaseClause:release,signingBonus:signing});
  }));

  app.put("/api/v66/player/:id/editor",auth,route(async(req,res)=>{
    const c=await ownClub(req);const id=String(req.params.id);const p=(await q(`SELECT * FROM players WHERE id=$1 AND club_id=$2`,[id,c.id])).rows[0];if(!p)throw Object.assign(new Error("Jogador não encontrado."),{status:404});
    const changes={};
    const rating=clamp(Math.round(safeNum(req.body.rating,p.rating)),40,99);const potential=clamp(Math.round(safeNum(req.body.potential,p.potential)),rating,99);const shirt=clamp(Math.round(safeNum(req.body.shirtNumber,p.shirt_number||10)),1,99);const foot=["RIGHT","LEFT"].includes(String(req.body.preferredFoot))?String(req.body.preferredFoot):p.preferred_foot;
    Object.assign(changes,{rating,potential,shirtNumber:shirt,preferredFoot:foot});
    await tx(async client=>{
      await client.query(`UPDATE players SET rating=$2,potential=$3,shirt_number=$4,preferred_foot=$5 WHERE id=$1`,[id,rating,potential,shirt,foot]);
      await client.query(`INSERT INTO club_editor_audit(club_id,entity_type,entity_id,change_json) VALUES($1,'player',$2,$3::jsonb)`,[c.id,id,JSON.stringify(changes)]);
    });
    res.json({ok:true,changes});
  }));

  app.put("/api/v66/club-profile",auth,route(async(req,res)=>{
    const c=await ownClub(req);const philosophy=["BALANCED","YOUTH","POSSESSION","COUNTER","PRESSING","SELLING_CLUB","GALACTICOS"].includes(String(req.body.philosophy))?String(req.body.philosophy):"BALANCED";const strategy=["BALANCED","YOUTH_FIRST","VALUE_BUY","STAR_HUNT","SELL_TO_GROW"].includes(String(req.body.transferStrategy))?String(req.body.transferStrategy):"BALANCED";
    const stadiumName=String(req.body.stadiumName||c.stadium_name||`Estádio ${c.name}`).slice(0,60);
    const cols=["homeKitPrimary","homeKitSecondary","awayKitPrimary","awayKitSecondary","thirdKitPrimary","thirdKitSecondary"];
    const colors=Object.fromEntries(cols.map(k=>[k,/^#[0-9a-f]{6}$/i.test(String(req.body[k]||""))?String(req.body[k]):null]));
    await q(`UPDATE clubs SET stadium_name=$2,club_philosophy=$3,transfer_strategy=$4,home_kit_primary=COALESCE($5,home_kit_primary),home_kit_secondary=COALESCE($6,home_kit_secondary),away_kit_primary=COALESCE($7,away_kit_primary),away_kit_secondary=COALESCE($8,away_kit_secondary),third_kit_primary=COALESCE($9,third_kit_primary),third_kit_secondary=COALESCE($10,third_kit_secondary) WHERE id=$1`,[c.id,stadiumName,philosophy,strategy,colors.homeKitPrimary,colors.homeKitSecondary,colors.awayKitPrimary,colors.awayKitSecondary,colors.thirdKitPrimary,colors.thirdKitSecondary]);
    res.json({ok:true});
  }));

  app.post("/api/v66/facilities/upgrade",auth,route(async(req,res)=>{
    const c=await ownClub(req);const type=String(req.body.type||"TRAINING").toUpperCase();if(!["TRAINING","ACADEMY"].includes(type))throw Object.assign(new Error("Estrutura inválida."),{status:400});
    const fresh=(await q(`SELECT * FROM clubs WHERE id=$1`,[c.id])).rows[0];const level=safeNum(type==="TRAINING"?fresh.training_level:fresh.academy_level,1);if(level>=5)throw Object.assign(new Error("Estrutura já está no nível máximo."),{status:409});const cost=5000*level*level;
    if(safeNum(fresh.coins)<cost)throw Object.assign(new Error(`Saldo insuficiente. Custo: ${cost.toLocaleString("pt-BR")}.`),{status:400});
    await tx(async client=>{await addFinance(client,c.id,-cost,"facility_upgrade",`${type==="TRAINING"?"Centro de treinamento":"Academia"} nível ${level+1}`);await client.query(`UPDATE clubs SET ${type==="TRAINING"?"training_level":"academy_level"}=${level+1} WHERE id=$1`,[c.id]);});
    res.json({ok:true,level:level+1,cost});
  }));

  app.post("/api/v66/recalculate-overalls",auth,route(async(req,res)=>{
    const c=await ownClub(req);const ps=(await q(`SELECT * FROM players WHERE club_id=$1`,[c.id])).rows;let changed=0;
    await tx(async client=>{for(const p of ps){const o=weightedOverall(p);if(Math.abs(o-safeNum(p.rating))<=7){await client.query(`UPDATE players SET rating=$2 WHERE id=$1`,[p.id,o]);changed++}}});
    res.json({ok:true,changed});
  }));

  return {migrate,seasonTransition,logTransfer};
};
