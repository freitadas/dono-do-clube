
const app=document.querySelector("#app");
const STATES={"AC": "Acre", "AL": "Alagoas", "AP": "Amapá", "AM": "Amazonas", "BA": "Bahia", "CE": "Ceará", "DF": "Distrito Federal", "ES": "Espírito Santo", "GO": "Goiás", "MA": "Maranhão", "MT": "Mato Grosso", "MS": "Mato Grosso do Sul", "MG": "Minas Gerais", "PA": "Pará", "PB": "Paraíba", "PR": "Paraná", "PE": "Pernambuco", "PI": "Piauí", "RJ": "Rio de Janeiro", "RN": "Rio Grande do Norte", "RS": "Rio Grande do Sul", "RO": "Rondônia", "RR": "Roraima", "SC": "Santa Catarina", "SP": "São Paulo", "SE": "Sergipe", "TO": "Tocantins"};

const state={
  me:null,club:null,players:[],market:[],matches:[],friends:[],competitions:null,
  finance:{wages:0,recent:[],transferBan:{active:false}},clubEvents:[],transferResults:[],
  trophies:[],incomingOffers:[],calendar:null,sponsorship:{active:null,offers:[]},marketProfile:null,
  mediaNews:[],pendingPress:null,saf:{active:false,offers:[],debtRisk:false},
  careers:[],maxCareers:10,lineupDirty:false,
  boardMessages:[],boardExpectation:null,teamPerformance:null,rotationAdvice:null,realism:null,
  transferWindow:null,scoutLevel:1,
  transferSearch:{name:"",position:"",minRating:58,maxPrice:500000,realOnly:false},
  activeType:null,playerCareer:null,playerData:null,countries:{},creationMode:"club",playerView:"home",
  playerStarterClubs:[],
  view:"home",authMode:"login",competitionTab:"STATE",roundByDiv:{A:1,B:1,C:1,D:1}
};

async function api(url,options={}){
  const res=await fetch(url,{
    credentials:"same-origin",
    headers:{"Content-Type":"application/json",...(options.headers||{})},
    ...options
  });
  const data=await res.json().catch(()=>({}));
  if(!res.ok)throw new Error(data.error||"Falha na requisição.");
  return data;
}
function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}
function initials(n){return String(n||"FC").split(/\s+/).slice(0,2).map(x=>x[0]).join("").toUpperCase()}
function crestHtml(c,size=""){
  const cls=`crest ${size}`.trim();
  if(c?.crest_data)return `<div class="${cls}"><img src="${c.crest_data}" alt=""></div>`;
  return `<div class="${cls}" style="background:linear-gradient(135deg,${c?.primary_color||"#18864b"},${c?.secondary_color||"#f7fafc"});color:#fff">${esc(initials(c?.name))}</div>`;
}
function posName(p){return({GK:"GOL",DEF:"DEF",MID:"MEI",ATT:"ATA"})[p]||p}
function stateOptions(){return Object.entries(STATES).map(([k,v])=>`<option value="${k}">${esc(v)}</option>`).join("")}
function countryProfile(code){
  return state.countries?.[code]||{name:code||"Brasil",flag:"",regional:code==="BR",cup:"Copa Nacional",divisions:{A:"Divisão A",B:"Divisão B",C:"Divisão C",D:"Divisão D"}};
}
function countryName(code){return countryProfile(code).name||code}
function countryOptions(selected="BR"){
  return Object.entries(state.countries||{}).map(([k,v])=>`<option value="${k}" ${k===selected?"selected":""}>${esc(v.flag||"")} ${esc(v.name)}</option>`).join("");
}
function leagueLabel(div,countryCode=null){
  const code=countryCode||state.competitions?.career?.country_code||state.club?.country_code||"BR";
  return countryProfile(code).divisions?.[div]||`Divisão ${div}`;
}
function locationLabel(club){
  if(!club)return "";
  return (club.country_code||"BR")==="BR"&&club.state_code?STATES[club.state_code]:countryName(club.country_code||"BR");
}
function lowerDivision(div){return ({A:"B",B:"C",C:"D",D:"D"})[div]||div}
function formatNewsDate(value){
  if(!value)return "";
  const d=new Date(value);
  if(Number.isNaN(d.getTime()))return "";
  return d.toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"});
}
function mediaCategoryLabel(c){return ({
  partida:"JOGO",
  goleada:"GOLEADA",
  goleada_outros:"GOLEADA · OUTROS CLUBES",
  outros_clubes:"OUTROS CLUBES",
  eliminacao:"ELIMINAÇÃO",
  coletiva:"COLETIVA",
  titulo:"TÍTULO",
  classificacao:"CLASSIFICAÇÃO",
  negocios:"NEGÓCIOS",
  saf:"SAF",
  bastidores:"BASTIDORES",
  temporada:"TEMPORADA",
  institucional:"CLUBE"
})[c]||String(c||"NOTÍCIA").toUpperCase()}
function phaseName(p){
  if(p==="STATE")return "Estadual";
  if(p==="NATIONAL")return state.activeType==="player"?"Liga nacional":(state.competitions?.career?leagueLabel(state.competitions.career.user_division):"Liga nacional");
  if(p==="LIBERTADORES")return "Libertadores";
  if(p==="CHAMPIONS")return "Champions League";
  if(p==="CLUB_WORLD_CUP")return "Super Mundial";
  if(p==="END")return "Temporada encerrada";
  return p;
}

async function bootstrap(){
  try{
    const d=await api("/api/me");
    state.me=d.user;
    state.activeType=d.activeType||null;
    state.club=d.club||null;
    state.playerCareer=d.playerCareer||null;
    state.careers=d.careers||[];
    state.countries=d.countries||state.countries||{};
    state.maxCareers=Number(d.maxCareers||10);
    state.transferResults=[];
    state.marketProfile=null;
    state.playerData=null;

    if(state.activeType==="player"&&state.playerCareer){
      await refreshPlayerCareer();
    }else if(state.club&&((state.club.country_code||"BR")!=="BR"||state.club.state_code)){
      await refreshAll();
    }
    render();
  }catch{renderAuth()}
}
async function refreshCareerList(){
  const d=await api("/api/careers");
  state.careers=d.careers||[];
  state.maxCareers=Number(d.maxCareers||10);
  if(d.activeType)state.activeType=d.activeType;
}
async function refreshPlayerCareer(){
  const d=await api("/api/player-career");
  state.playerData=d;
  state.playerCareer=d.career;
  state.activeType="player";
}
async function refreshAll(){
  const c=await api("/api/competitions");
  const d=await api("/api/dashboard");
  Object.assign(state,d);
  state.competitions=c;
  state.activeType="club";
  if(c?.career?.phase==="NATIONAL"){
    for(const div of ["A","B","C","D"])state.roundByDiv[div]=Math.min(38,Number(c.career.current_round||1));
  }
}

function renderAuth(){
  app.innerHTML=`<main class="auth"><section class="authbox">
    <div class="brand"><span class="logo">⚽</span>Dono do Clube</div>
    <h1>Sua carreira, do seu jeito.</h1>
    <p>Comande um clube em vários países ou viva uma carreira como jogador profissional.</p>
    <div class="switch">
      <button data-mode="login" class="${state.authMode==="login"?"on":""}">Entrar</button>
      <button data-mode="register" class="${state.authMode==="register"?"on":""}">Criar conta</button>
    </div>
    <form id="authForm" class="stack">
      <label>E-mail<input type="email" name="email" required></label>
      <label>Senha<input type="password" name="password" minlength="6" maxlength="128" required></label>
      <button class="primary">${state.authMode==="login"?"Entrar":"Criar conta"}</button>
      <div id="authMsg"></div>
    </form>
  </section></main>`;
  app.querySelectorAll("[data-mode]").forEach(b=>b.onclick=()=>{state.authMode=b.dataset.mode;renderAuth()});
  app.querySelector("#authForm").onsubmit=async e=>{
    e.preventDefault();
    const f=new FormData(e.target);
    try{
      await api(`/api/auth/${state.authMode}`,{method:"POST",body:JSON.stringify({email:f.get("email"),password:f.get("password")})});
      await bootstrap();
    }catch(err){
      app.querySelector("#authMsg").innerHTML=`<div class="msg">${esc(err.message)}</div>`;
    }
  };
}

async function loadPlayerStarterClubs(countryCode){
  const select=app.querySelector("#playerClub");
  if(select){
    select.disabled=true;
    select.innerHTML=`<option>Carregando clubes...</option>`;
  }
  try{
    const d=await api(`/api/player-career/clubs?country=${encodeURIComponent(countryCode)}`);
    state.playerStarterClubs=d.clubs||[];
    const current=app.querySelector("#playerClub");
    if(current){
      current.disabled=false;
      current.innerHTML=state.playerStarterClubs.map(c=>`<option value="${c.id}">${esc(c.name)} · OVR ${c.base_rating}</option>`).join("");
    }
  }catch(err){
    const current=app.querySelector("#playerClub");
    if(current)current.innerHTML=`<option value="">${esc(err.message)}</option>`;
  }
}

function renderCreateClub(){
  const hasCareers=(state.careers||[]).length>0;
  const nextNumber=Math.min(state.maxCareers||10,(state.careers||[]).length+1);
  const mode=state.creationMode||"club";
  const defaultLabel=mode==="player"?`Jogador ${nextNumber}`:`Carreira ${nextNumber}`;

  app.innerHTML=`<main class="auth"><section class="authbox career-create-box">
    <div class="brand"><span class="logo">⚽</span>Dono do Clube</div>
    <h1>${hasCareers?"Nova carreira":"Comece uma carreira."}</h1>
    <p>Você pode manter até ${state.maxCareers||10} saves. Escolha se quer comandar um clube ou viver a carreira de um jogador.</p>

    <div class="career-mode-switch">
      <button type="button" data-create-mode="club" class="${mode==="club"?"on":""}">🏟️ Carreira de Clube</button>
      <button type="button" data-create-mode="player" class="${mode==="player"?"on":""}">👤 Carreira de Jogador</button>
    </div>

    ${mode==="club"?`
      <form id="clubForm" class="stack">
        <label>Nome da carreira<input id="careerLabel" name="careerLabel" value="${esc(defaultLabel)}" maxlength="40" required></label>
        <label>Nome do clube<input id="clubName" name="name" value="Meu Clube FC" maxlength="30" required></label>
        <label>País da carreira<select id="clubCountry" name="countryCode" required>${countryOptions("BR")}</select></label>
        <label id="stateField">Estado<select name="stateCode"><option value="">Escolha o estado</option>${stateOptions()}</select></label>
        <div class="country-note" id="clubCountryNote">🇧🇷 No Brasil, seu clube começa na Série D e também disputa o Estadual.</div>
        <div class="colors">
          <label>Cor principal<input id="c1" type="color" name="primaryColor" value="#18864b"></label>
          <label>Cor secundária<input id="c2" type="color" name="secondaryColor" value="#f7fafc"></label>
        </div>
        <div id="preview" class="club-preview"></div>
        <button class="primary">Criar carreira de clube</button>
        ${hasCareers?`<button type="button" id="cancelNewCareer" class="secondary">Voltar para minhas carreiras</button>`:""}
        <div id="clubMsg"></div>
      </form>
    `:`
      <form id="playerCareerForm" class="stack">
        <label>Nome da carreira<input name="careerLabel" value="${esc(defaultLabel)}" maxlength="40" required></label>
        <label>Nome do jogador<input name="playerName" value="Meu Jogador" maxlength="32" required></label>
        <div class="two-cols">
          <label>Nacionalidade<select name="nationalityCode">${countryOptions("BR")}</select></label>
          <label>País onde vai jogar<select id="playerCountry" name="countryCode">${countryOptions("BR")}</select></label>
        </div>
        <label>Posição<select name="position">
          <option value="GK">Goleiro</option>
          <option value="DEF">Defensor / Zagueiro</option>
          <option value="MID">Meio-campista</option>
          <option value="ATT" selected>Atacante</option>
        </select></label>
        <label>Clube inicial da 4ª divisão<select id="playerClub" name="clubId" required><option>Carregando clubes...</option></select></label>
        <div class="player-career-note">Você começa aos 17 anos, evolui com partidas e treinos, recebe salário e pode receber propostas de transferência ao fim da temporada.</div>
        <button class="primary">Criar carreira de jogador</button>
        ${hasCareers?`<button type="button" id="cancelNewCareer" class="secondary">Voltar para minhas carreiras</button>`:""}
        <div id="playerCareerMsg"></div>
      </form>
    `}
  </section></main>`;

  app.querySelectorAll("[data-create-mode]").forEach(btn=>btn.onclick=()=>{
    state.creationMode=btn.dataset.createMode;
    state.playerStarterClubs=[];
    renderCreateClub();
  });

  const cancel=app.querySelector("#cancelNewCareer");
  if(cancel)cancel.onclick=()=>{state.view="careers";render()};

  if(mode==="club"){
    const sync=()=>{
      const n=app.querySelector("#clubName").value||"Meu Clube FC";
      const c1=app.querySelector("#c1").value,c2=app.querySelector("#c2").value;
      app.querySelector("#preview").style.background=`linear-gradient(135deg,${c1},${c2})`;
      const felipe=n.trim().toLowerCase()==="felipe";
      const country=app.querySelector("#clubCountry").value||"BR";
      const div=leagueLabel("D",country);
      app.querySelector("#preview").innerHTML=`<div><div class="preview-crest">${esc(initials(n))}</div><h2>${esc(n)}</h2><p>${felipe?"⚡ Modo Felipe será ativado":`Começa em ${esc(div)}`}</p></div>`;
    };
    const syncCountry=()=>{
      const country=app.querySelector("#clubCountry").value||"BR";
      const field=app.querySelector("#stateField");
      field.style.display=country==="BR"?"grid":"none";
      field.querySelector("select").required=country==="BR";
      const prof=countryProfile(country);
      app.querySelector("#clubCountryNote").textContent=country==="BR"
        ?"🇧🇷 No Brasil, seu clube começa na Série D e também disputa o Estadual."
        :`${prof.flag||""} Em ${prof.name}, o clube começa em ${prof.divisions?.D||"4ª divisão"} e disputa ${prof.cup||"a copa nacional"}.`;
      sync();
    };
    ["clubName","c1","c2"].forEach(id=>app.querySelector("#"+id).oninput=sync);
    app.querySelector("#clubCountry").onchange=syncCountry;
    syncCountry();

    app.querySelector("#clubForm").onsubmit=async e=>{
      e.preventDefault();
      const f=new FormData(e.target);
      try{
        await api("/api/club",{method:"POST",body:JSON.stringify({
          careerLabel:f.get("careerLabel"),name:f.get("name"),
          countryCode:f.get("countryCode"),stateCode:f.get("stateCode"),
          primaryColor:f.get("primaryColor"),secondaryColor:f.get("secondaryColor")
        })});
        state.view="home";
        state.creationMode="club";
        await bootstrap();
      }catch(err){
        app.querySelector("#clubMsg").innerHTML=`<div class="msg">${esc(err.message)}</div>`;
      }
    };
  }else{
    const country=app.querySelector("#playerCountry");
    country.onchange=()=>loadPlayerStarterClubs(country.value);
    loadPlayerStarterClubs(country.value||"BR");

    app.querySelector("#playerCareerForm").onsubmit=async e=>{
      e.preventDefault();
      const f=new FormData(e.target);
      try{
        await api("/api/player-careers",{method:"POST",body:JSON.stringify({
          careerLabel:f.get("careerLabel"),playerName:f.get("playerName"),
          nationalityCode:f.get("nationalityCode"),countryCode:f.get("countryCode"),
          position:f.get("position"),clubId:f.get("clubId")
        })});
        state.playerView="home";
        state.creationMode="club";
        await bootstrap();
      }catch(err){
        app.querySelector("#playerCareerMsg").innerHTML=`<div class="msg">${esc(err.message)}</div>`;
      }
    };
  }
}
function renderStateSetup(){
  app.innerHTML=`<main class="auth"><section class="authbox">
    <div class="brand"><span class="logo">⚽</span>Dono do Clube</div>
    <h1>Escolha o estado do seu clube.</h1>
    <p>A carreira foi reiniciada. Seu clube voltará para a Série D com um novo elenco equilibrado.</p>
    <form id="stateForm" class="stack">
      <label>Estado<select name="stateCode" required><option value="">Escolha o estado</option>${stateOptions()}</select></label>
      <button class="primary">Iniciar nova carreira</button><div id="stateMsg"></div>
    </form>
  </section></main>`;
  app.querySelector("#stateForm").onsubmit=async e=>{
    e.preventDefault();const f=new FormData(e.target);
    try{
      await api("/api/club/state",{method:"PUT",body:JSON.stringify({stateCode:f.get("stateCode")})});
      await bootstrap();
    }catch(err){
      app.querySelector("#stateMsg").innerHTML=`<div class="msg">${esc(err.message)}</div>`;
    }
  };
}

function fitnessClass(p){
  if(Number(p.injury_games||0)>0)return "bad";
  if(Number(p.fitness||100)>=75)return "good";
  if(Number(p.fitness||100)>=50)return "warn";
  return "bad";
}
function squadStatusLabel(v){
  return ({STAR:"Craque",STARTER:"Titular",ROTATION:"Rotação",BACKUP:"Reserva",PROSPECT:"Promessa"})[v]||"Rotação";
}
function tacticalRoleLabel(v){
  return ({
    BALANCED:"Equilibrado",STOPPER:"Zagueiro marcador",BALL_PLAYING:"Zagueiro construtor",
    ANCHOR:"Volante marcador",PLAYMAKER:"Armador",BOX_TO_BOX:"Box-to-box",
    WINGER:"Ponta aberto",INSIDE_FORWARD:"Ponta invertido",TARGET:"Referência",
    POACHER:"Finalizador",SWEEPER_KEEPER:"Goleiro-líbero"
  })[v]||"Equilibrado";
}
function playerCard(p){
  const severance=Math.max(100,Number(p.salary||0)*2);
  return `<article class="player ${p.is_starter?"starter":""} ${Number(p.suspension_games||0)>0?"suspended":""}">
    <span class="pos">${esc(p.role||posName(p.position))} · ${p.age} anos</span>
    <span class="rating">${p.rating}</span>
    <h4>${esc(p.name)}</h4>
    <div class="condition-line ${fitnessClass(p)}">
      <span>Físico <b>${p.fitness??100}%</b></span>
      <span>Moral <b>${p.morale??70}</b></span>
      <span>Forma <b>${p.form_rating??70}</b></span>
      <span>Felicidade <b>${p.happiness??75}</b></span>
      ${Number(p.injury_games||0)>0?`<span>🩹 <b>${esc(p.injury_type||"Lesão")} · ${p.injury_games} jogo(s)</b></span>`:""}
      ${Number(p.suspension_games||0)>0?`<span>🟥 <b>Suspenso ${p.suspension_games} jogo(s)</b></span>`:""}
    </div>
    <div class="attrs">
      <span>VEL <b>${p.pace}</b></span><span>CHU <b>${p.shooting}</b></span>
      <span>PAS <b>${p.passing}</b></span><span>DEF <b>${p.defending}</b></span>
    </div>
    <div class="pstats">
      <span>J <b>${p.appearances}</b></span><span>G <b>${p.goals}</b></span>
      <span>A <b>${p.assists}</b></span><span>Sal. <b>${Number(p.salary||0).toLocaleString("pt-BR")}</b></span>
      <span>Contrato <b>${p.contract_seasons||1}T</b></span><span>Rescisão <b>${severance.toLocaleString("pt-BR")}</b></span>
      <span>Potencial <b>${p.potential??p.rating}</b></span>
      <span>Status <b>${esc(squadStatusLabel(p.squad_status))}</b></span>
      <span>Cartões <b>${p.yellow_accumulation||0}/3 🟨 · ${p.red_cards||0} 🟥</b></span>
      ${Number(p.consecutive_starts||0)>=2?`<span>Carga <b>${p.consecutive_starts} jogos seguidos</b></span>`:""}
    </div>
    <div class="player-role-line">
      ${p.is_captain?`<span>© Capitão</span>`:""}
      ${p.set_piece_role&&p.set_piece_role!=="NONE"?`<span>⚽ ${esc(p.set_piece_role.replace("_"," "))}</span>`:""}
      ${p.academy_product?`<span>🌱 Base</span>`:""}
      <span>${esc(tacticalRoleLabel(p.tactical_role))}</span>
    </div>
    ${p.transfer_listed?`<div class="sale-badge">À VENDA</div>`:""}
    <div class="player-actions">
      <button class="${p.is_starter?"primary":"secondary"} toggle-player" data-id="${p.id}" ${(Number(p.injury_games||0)>0||Number(p.suspension_games||0)>0)&&!p.is_starter?"disabled":""}>${p.is_starter?"Titular":"Reserva"}</button>
      <button class="secondary list-player" data-id="${p.id}">${p.transfer_listed?"Retirar da venda":"Colocar à venda"}</button>
      <button class="danger release-player" data-id="${p.id}" ${p.is_starter?"disabled":""}>Rescindir</button>
    </div>
  </article>`;
}
function fitScore(p){
  return Number(p.rating)+(Number(p.fitness||100)-70)*.12+(Number(p.morale||70)-70)*.05-(Number(p.injury_games||0)>0?100:0);
}
const FORMATION_PRESETS_UI=[
  ["4-3-3","4-3-3 · Equilibrada"],
  ["4-4-2","4-4-2 · Clássica"],
  ["3-5-2","3-5-2 · Meio forte"],
  ["4-2-3-1","4-2-3-1 · Ofensiva equilibrada"],
  ["4-1-4-1","4-1-4-1 · Controle de meio"],
  ["4-5-1","4-5-1 · Compacta"],
  ["3-4-3","3-4-3 · Ofensiva"],
  ["3-4-2-1","3-4-2-1 · Dois meias por trás do atacante"],
  ["3-1-4-2","3-1-4-2 · Volante + dois atacantes"],
  ["5-3-2","5-3-2 · Defensiva com dois atacantes"],
  ["5-4-1","5-4-1 · Muito defensiva"],
  ["5-2-3","5-2-3 · Alas e três atacantes"],
  ["4-2-4","4-2-4 · Ataque total"]
];
const FORMATION_QUOTAS_UI={
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
function customFormationQuota(formation){
  const m=String(formation||"").match(/^CUSTOM:(\d)-(\d)-(\d)$/);
  if(!m)return null;
  const DEF=Number(m[1]),MID=Number(m[2]),ATT=Number(m[3]);
  if(DEF<2||DEF>5||MID<1||MID>6||ATT<1||ATT>5||DEF+MID+ATT!==10)return null;
  return {GK:1,DEF,MID,ATT};
}
function formationQuota(formation){
  return FORMATION_QUOTAS_UI[String(formation)]||customFormationQuota(formation)||FORMATION_QUOTAS_UI["4-3-3"];
}
function isCustomFormation(formation){
  return /^CUSTOM:\d-\d-\d$/.test(String(formation||""));
}
function formationDisplayName(formation){
  if(isCustomFormation(formation)){
    return `Personalizada ${String(formation).replace("CUSTOM:","")}`;
  }
  return String(formation||"4-3-3");
}
function formationSelectOptions(current){
  const custom=isCustomFormation(current);
  return `${FORMATION_PRESETS_UI.map(([value,label])=>`<option value="${value}" ${current===value?"selected":""}>${label}</option>`).join("")}
    <option value="CUSTOM" ${custom?"selected":""}>⚙️ Formação personalizada</option>`;
}
function customFormationParts(current){
  const q=customFormationQuota(current)||{DEF:4,MID:3,ATT:3};
  return {DEF:q.DEF,MID:q.MID,ATT:q.ATT};
}
function customFormationBuilder(prefix,current){
  const p=customFormationParts(current);
  const visible=isCustomFormation(current);
  return `<div id="${prefix}CustomFormation" class="custom-formation-builder" ${visible?"":'style="display:none"'}>
    <div class="custom-formation-head">
      <div><div class="kicker">FORMAÇÃO PERSONALIZADA</div><b>Monte os 10 jogadores de linha</b></div>
      <span>+ 1 goleiro fixo</span>
    </div>
    <div class="custom-formation-controls">
      <label>Defensores<input id="${prefix}CustomDef" type="number" min="2" max="5" value="${p.DEF}"></label>
      <span class="formation-plus">+</span>
      <label>Meias<input id="${prefix}CustomMid" type="number" min="1" max="6" value="${p.MID}"></label>
      <span class="formation-plus">+</span>
      <label>Atacantes<input id="${prefix}CustomAtt" type="number" min="1" max="5" value="${p.ATT}"></label>
      <span class="formation-equals">= 10</span>
      <button type="button" id="${prefix}ApplyCustom" class="primary">Aplicar personalizada</button>
    </div>
    <div id="${prefix}CustomMsg" class="custom-formation-msg">Exemplo: 4 defensores + 2 meias + 4 atacantes = 4-2-4.</div>
  </div>`;
}
function selectedFormationValue(select){
  if(!select)return state.club.formation||"4-3-3";
  if(select.value==="CUSTOM"){
    return isCustomFormation(state.club.formation)?state.club.formation:null;
  }
  return select.value;
}
function formationRosterAvailable(formation){
  const q=formationQuota(formation);
  const available={GK:0,DEF:0,MID:0,ATT:0};
  state.players
    .filter(p=>Number(p.injury_games||0)<=0&&Number(p.suspension_games||0)<=0)
    .forEach(p=>available[p.position]=(available[p.position]||0)+1);
  return Object.keys(q).every(pos=>Number(available[pos]||0)>=Number(q[pos]||0));
}
function customFormationValue(prefix){
  const DEF=Number(app.querySelector(`#${prefix}CustomDef`)?.value||0);
  const MID=Number(app.querySelector(`#${prefix}CustomMid`)?.value||0);
  const ATT=Number(app.querySelector(`#${prefix}CustomAtt`)?.value||0);
  if(DEF<2||DEF>5||MID<1||MID>6||ATT<1||ATT>5){
    return {error:"Use entre 2 e 5 defensores, 1 e 6 meias e 1 e 5 atacantes."};
  }
  if(DEF+MID+ATT!==10){
    return {error:`A soma precisa ser 10 jogadores de linha. Agora está em ${DEF+MID+ATT}.`};
  }
  return {formation:`CUSTOM:${DEF}-${MID}-${ATT}`,DEF,MID,ATT};
}
function bindCustomFormation(prefix,select,afterApply){
  const box=app.querySelector(`#${prefix}CustomFormation`);
  const btn=app.querySelector(`#${prefix}ApplyCustom`);
  if(!btn)return;

  const updateMsg=()=>{
    const r=customFormationValue(prefix);
    const msg=app.querySelector(`#${prefix}CustomMsg`);
    if(!msg)return;
    if(r.error){
      msg.textContent=r.error;
      msg.classList.add("bad");
    }else{
      msg.textContent=`Personalizada ${r.DEF}-${r.MID}-${r.ATT} · 1 goleiro + ${r.DEF} defensores + ${r.MID} meias + ${r.ATT} atacantes.`;
      msg.classList.remove("bad");
    }
  };
  ["Def","Mid","Att"].forEach(k=>{
    const input=app.querySelector(`#${prefix}Custom${k}`);
    if(input)input.oninput=updateMsg;
  });

  btn.onclick=()=>{
    const r=customFormationValue(prefix);
    if(r.error){
      alert(r.error);
      updateMsg();
      return;
    }
    if(!formationRosterAvailable(r.formation)){
      alert("Seu elenco saudável não possui jogadores suficientes nas posições exigidas por essa formação personalizada.");
      return;
    }
    const complete=rebalanceForFormation(r.formation);
    if(!complete){
      alert("Não foi possível montar 11 titulares nessa formação.");
      return;
    }
    state.club.formation=r.formation;
    state.lineupDirty=true;
    if(typeof afterApply==="function")afterApply(r.formation);
    render();
  };

  if(select)select.onchange=()=>{
    if(select.value==="CUSTOM"){
      if(box)box.style.display="grid";
      updateMsg();
      return;
    }
    if(box)box.style.display="none";
    if(!formationRosterAvailable(select.value)){
      alert("Seu elenco saudável não possui jogadores suficientes nas posições exigidas por essa formação.");
      select.value=isCustomFormation(state.club.formation)?"CUSTOM":state.club.formation;
      return;
    }
    const complete=rebalanceForFormation(select.value);
    if(!complete){
      alert("Não foi possível montar 11 titulares nessa formação.");
      return;
    }
    state.club.formation=select.value;
    state.lineupDirty=true;
    render();
  };
}
function pitchToken(p,interactive=false){
  return `<button type="button" class="pitch-player ${fitnessClass(p)} ${interactive?"pitch-player-clickable":""}" ${interactive?`data-swap-id="${p.id}"`:""} title="${interactive?`Trocar ${esc(p.name)}`:esc(p.name)}">
    <span class="pitch-rating">${p.rating}</span>
    <b>${esc(p.name.split(" ").slice(-1)[0])}</b>
    <small>${esc(p.role||posName(p.position))} · ${p.fitness??100}%</small>
    ${interactive?`<span class="pitch-swap-hint">TROCAR</span>`:""}
  </button>`;
}
function formationLineSpec(formation){
  const custom=customFormationQuota(formation);
  if(custom){
    return [
      {pos:"ATT",count:custom.ATT,top:8,cls:"attack"},
      {pos:"MID",count:custom.MID,top:36,cls:"midfield"},
      {pos:"DEF",count:custom.DEF,top:64,cls:"defense"},
      {pos:"GK",count:1,bottom:5,cls:"goalkeeper"}
    ];
  }
  if(formation==="4-2-3-1")return [
    {pos:"ATT",count:1,top:5,cls:"attack"},
    {pos:"MID",count:3,top:25,cls:"midfield advanced-mid"},
    {pos:"MID",count:2,top:45,cls:"midfield deep-mid"},
    {pos:"DEF",count:4,top:66,cls:"defense"},
    {pos:"GK",count:1,bottom:5,cls:"goalkeeper"}
  ];
  if(formation==="4-1-4-1")return [
    {pos:"ATT",count:1,top:5,cls:"attack"},
    {pos:"MID",count:4,top:28,cls:"midfield advanced-mid"},
    {pos:"MID",count:1,top:49,cls:"midfield deep-mid"},
    {pos:"DEF",count:4,top:67,cls:"defense"},
    {pos:"GK",count:1,bottom:5,cls:"goalkeeper"}
  ];
  if(formation==="3-4-2-1")return [
    {pos:"ATT",count:1,top:4,cls:"attack"},
    {pos:"MID",count:2,top:24,cls:"midfield advanced-mid"},
    {pos:"MID",count:4,top:46,cls:"midfield deep-mid"},
    {pos:"DEF",count:3,top:67,cls:"defense"},
    {pos:"GK",count:1,bottom:5,cls:"goalkeeper"}
  ];
  if(formation==="3-1-4-2")return [
    {pos:"ATT",count:2,top:7,cls:"attack"},
    {pos:"MID",count:4,top:29,cls:"midfield advanced-mid"},
    {pos:"MID",count:1,top:49,cls:"midfield deep-mid"},
    {pos:"DEF",count:3,top:68,cls:"defense"},
    {pos:"GK",count:1,bottom:5,cls:"goalkeeper"}
  ];
  const q=formationQuota(formation);
  return [
    {pos:"ATT",count:q.ATT,top:8,cls:"attack"},
    {pos:"MID",count:q.MID,top:36,cls:"midfield"},
    {pos:"DEF",count:q.DEF,top:64,cls:"defense"},
    {pos:"GK",count:1,bottom:5,cls:"goalkeeper"}
  ];
}
function formationPitch(formation,interactive=false){
  const starters=state.players.filter(p=>p.is_starter);
  const pools={ATT:[],MID:[],DEF:[],GK:[]};
  starters.forEach(p=>(pools[p.position]||pools.MID).push(p));
  for(const k of Object.keys(pools))pools[k].sort((a,b)=>fitScore(b)-fitScore(a));

  const offsets={ATT:0,MID:0,DEF:0,GK:0};
  const lines=formationLineSpec(formation).map(line=>{
    const start=offsets[line.pos]||0;
    const players=pools[line.pos].slice(start,start+line.count);
    offsets[line.pos]=start+line.count;
    return {...line,players};
  });

  return `<div class="pitch">
    <div class="pitch-line center"></div><div class="pitch-circle"></div>
    ${lines.map(line=>`<div class="pitch-row tactical-row ${line.cls}" style="${line.bottom!=null?`bottom:${line.bottom}%`:`top:${line.top}%`}">
      ${line.players.map(p=>pitchToken(p,interactive)).join("")}
    </div>`).join("")}
    <div class="pitch-caption">${esc(formationDisplayName(formation))} · ${starters.length}/11 titulares</div>
  </div>`;
}
function rotationContext(){
  const car=state.competitions?.career;
  if(!car)return {key:"normal",label:"Jogo normal",maxChanges:4};

  if(car.phase==="LIBERTADORES"){
    const stage=state.competitions?.libertadores?.stage;
    if(["QF","SF","FINAL"].includes(stage))return {key:"decisive",label:"Jogo decisivo continental",maxChanges:2};
    return {key:"normal",label:"Libertadores",maxChanges:3};
  }
  if(car.phase==="CHAMPIONS"){
    const stage=state.competitions?.championsLeague?.stage;
    if(["QF","SF","FINAL"].includes(stage))return {key:"decisive",label:"Jogo decisivo da Champions",maxChanges:2};
    return {key:"normal",label:"Champions League",maxChanges:3};
  }
  if(car.phase==="CLUB_WORLD_CUP"){
    const stage=state.competitions?.clubWorldCup?.stage;
    if(["QF","SF","FINAL"].includes(stage))return {key:"decisive",label:"Jogo decisivo do Mundial",maxChanges:2};
    return {key:"normal",label:"Mundial de Clubes",maxChanges:3};
  }
  if(car.phase==="STATE"){
    const st=state.competitions?.state?.stage;
    if(["SF","FINAL"].includes(st))return {key:"decisive",label:"Mata-mata do Estadual",maxChanges:2};
    return {key:"rotation",label:"Fase inicial do Estadual",maxChanges:5};
  }
  if(car.phase==="NATIONAL"){
    const round=Number(car.current_round||1);
    if(round>=34)return {key:"decisive",label:"Reta final da liga",maxChanges:2};
    if(round<=10)return {key:"rotation",label:"Início de temporada",maxChanges:5};
  }

  return {key:"normal",label:"Jogo normal",maxChanges:4};
}

function rotationPlayerScore(p,contextKey){
  const rating=Number(p.rating||0);
  const fitness=Number(p.fitness??100);
  const morale=Number(p.morale??70);
  const streak=Number(p.consecutive_starts||0);

  if(contextKey==="decisive"){
    return rating*1.00+fitness*.08+morale*.03-Math.max(0,streak-5)*1.4;
  }
  if(contextKey==="rotation"){
    return rating*.58+fitness*.32+morale*.08-Math.max(0,streak-2)*3.2;
  }
  return rating*.76+fitness*.20+morale*.05-Math.max(0,streak-3)*2.2;
}

function shouldRotateStarter(starter,reserve,context){
  const fit=Number(starter.fitness??100);
  const reserveFit=Number(reserve.fitness??100);
  const streak=Number(starter.consecutive_starts||0);
  const ratingGap=Number(starter.rating||0)-Number(reserve.rating||0);

  if(starter.position==="GK"){
    if(fit<45&&reserveFit>=70&&ratingGap<=6)return "goleiro muito cansado";
    if(streak>=8&&fit<68&&reserveFit>=80&&ratingGap<=4)return "sequência muito longa do goleiro";
    return null;
  }

  if(context.key==="decisive"){
    if(fit<50&&reserveFit>=72&&ratingGap<=5)return "físico crítico";
    if(streak>=6&&fit<64&&reserveFit>=80&&ratingGap<=3)return "desgaste acumulado";
    return null;
  }

  if(context.key==="rotation"){
    if(fit<76&&reserveFit>=78&&ratingGap<=8)return "preservação física";
    if(streak>=3&&reserveFit>=82&&ratingGap<=7)return `${streak} jogos seguidos`;
    if(reserveFit-fit>=20&&ratingGap<=6)return "reserva muito mais descansado";
    return null;
  }

  if(fit<62&&reserveFit>=76&&ratingGap<=7)return "físico baixo";
  if(streak>=4&&fit<74&&reserveFit>=80&&ratingGap<=6)return `${streak} jogos seguidos`;
  if(reserveFit-fit>=22&&ratingGap<=5)return "diferença grande de condição física";
  return null;
}

function suggestRotation(formation){
  const q=formationQuota(formation);
  const healthy=state.players.filter(p=>Number(p.injury_games||0)<=0&&Number(p.suspension_games||0)<=0);
  const context=rotationContext();
  const chosen=[];
  const changes=[];

  for(const pos of ["GK","DEF","MID","ATT"]){
    const quota=Number(q[pos]||0);
    const current=healthy
      .filter(p=>p.position===pos&&p.is_starter)
      .sort((x,y)=>rotationPlayerScore(y,context.key)-rotationPlayerScore(x,context.key))
      .slice(0,quota);

    const reserves=healthy
      .filter(p=>p.position===pos&&!current.some(c=>String(c.id)===String(p.id)))
      .sort((x,y)=>rotationPlayerScore(y,context.key)-rotationPlayerScore(x,context.key));

    const picked=[...current];

    // Completa a formação caso já esteja faltando titular em alguma posição.
    while(picked.length<quota&&reserves.length){
      const reserve=reserves.shift();
      picked.push(reserve);
      changes.push({in:reserve.name,out:null,reason:"vaga livre na formação"});
    }

    // Substituições reais de rodízio: preservam qualidade e consideram desgaste.
    if(pos!=="GK"||context.key!=="decisive"){
      const candidates=[...picked].sort((x,y)=>
        Number(x.fitness??100)-Number(y.fitness??100) ||
        Number(y.consecutive_starts||0)-Number(x.consecutive_starts||0)
      );

      for(const starter of candidates){
        if(changes.filter(x=>x.out).length>=context.maxChanges)break;
        const reserve=reserves[0];
        if(!reserve)break;

        const reason=shouldRotateStarter(starter,reserve,context);
        if(!reason)continue;

        const idx=picked.findIndex(p=>String(p.id)===String(starter.id));
        if(idx<0)continue;

        picked[idx]=reserve;
        reserves.shift();
        changes.push({in:reserve.name,out:starter.name,reason});
      }
    }

    chosen.push(...picked);
  }

  if(chosen.length!==11)return false;

  state.players.forEach(p=>p.is_starter=chosen.some(x=>String(x.id)===String(p.id)));
  state.lineupDirty=true;

  const rested=changes.filter(x=>x.out);
  state.rotationAdvice={
    context:context.label,
    changes:rested,
    total:rested.length,
    message:rested.length
      ?`${rested.length} troca(s) sugerida(s) para equilibrar rendimento e desgaste.`
      :"O XI atual está em condição adequada; não há necessidade de rodízio agora."
  };
  return true;
}
function rebalanceForFormation(formation){
  state.rotationAdvice=null;
  const q=formationQuota(formation);
  const chosen=[];

  for(const pos of ["GK","DEF","MID","ATT"]){
    const candidates=state.players
      .filter(p=>p.position===pos&&Number(p.injury_games||0)<=0&&Number(p.suspension_games||0)<=0)
      .sort((x,y)=>{
        if(Boolean(x.is_starter)!==Boolean(y.is_starter))return x.is_starter?-1:1;
        return Number(y.rating)-Number(x.rating) ||
          Number(y.fitness||100)-Number(x.fitness||100);
      });
    chosen.push(...candidates.slice(0,q[pos]));
  }

  if(chosen.length!==11)return false;

  state.players.forEach(p=>p.is_starter=chosen.some(x=>String(x.id)===String(p.id)));
  state.lineupDirty=true;
  return true;
}

function compatibleReserves(starter){
  return state.players
    .filter(p=>!p.is_starter&&p.position===starter.position&&Number(p.injury_games||0)<=0&&Number(p.suspension_games||0)<=0)
    .sort((x,y)=>Number(y.rating)-Number(x.rating) ||
      Number(y.fitness||100)-Number(x.fitness||100));
}

function swapStarter(starterId,reserveId){
  state.rotationAdvice=null;
  const starter=state.players.find(p=>String(p.id)===String(starterId));
  const reserve=state.players.find(p=>String(p.id)===String(reserveId));
  if(!starter||!reserve)return false;
  if(starter.position!==reserve.position)return false;
  if(Number(reserve.injury_games||0)>0)return false;
  starter.is_starter=false;
  reserve.is_starter=true;
  state.lineupDirty=true;
  return true;
}

function selectBestSquad(formation){
  state.rotationAdvice=null;
  const q=formationQuota(formation);
  const chosen=[];

  // "Melhores" = maior overall entre os jogadores disponíveis.
  // Físico e moral servem como desempate; lesionados ficam fora.
  const bestSort=(x,y)=>
    Number(y.rating)-Number(x.rating) ||
    Number(y.fitness||100)-Number(x.fitness||100) ||
    Number(y.morale||70)-Number(x.morale||70);

  for(const pos of ["GK","DEF","MID","ATT"]){
    const available=state.players
      .filter(p=>p.position===pos&&Number(p.injury_games||0)<=0&&Number(p.suspension_games||0)<=0)
      .sort(bestSort);

    chosen.push(...available.slice(0,q[pos]));
  }

  if(chosen.length!==11)return false;

  state.players.forEach(p=>{
    p.is_starter=chosen.some(x=>String(x.id)===String(p.id));
  });
  state.lineupDirty=true;

  return true;
}

function userPosition(){
  const car=state.competitions?.career;if(!car)return null;
  const table=state.competitions.divisions[car.user_division]?.entries||[];
  const i=table.findIndex(e=>String(e.clubId)===String(state.club.id));
  return i>=0?i+1:null;
}
function nextDivision(){
  const car=state.competitions?.career,pos=userPosition();
  if(!car||!pos)return car?.user_division||"D";
  const d=car.user_division;
  if(d==="A")return pos>=17?"B":"A";
  if(d==="B")return pos<=4?"A":pos>=17?"C":"B";
  if(d==="C")return pos<=4?"B":pos>=17?"D":"C";
  return pos<=4?"C":"D";
}

function formatSaveDate(value){
  if(!value)return "Nunca";
  const d=new Date(value);
  if(Number.isNaN(d.getTime()))return "Nunca";
  return d.toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"});
}
function formatGameDate(iso){
  if(!iso)return "—";
  const [y,m,d]=String(iso).split("-");return `${d}/${m}/${y}`;
}
function seasonTrophies(){
  const season=Number(state.competitions?.career?.season_no||0);
  return (state.trophies||[]).filter(t=>Number(t.season_no)===season);
}
function trophyCards(list){
  if(!list.length)return `<div class="empty">Nenhum troféu conquistado nesta temporada.</div>`;
  return `<div class="trophy-grid">${list.map(t=>`<div class="trophy-card"><span>🏆</span><b>${esc(t.title)}</b><small>Temporada ${t.season_no}</small></div>`).join("")}</div>`;
}
function calendarCard(){
  const cal=state.calendar;if(!cal)return "";
  const installments=state.finance?.installments||[];
  const loans=state.finance?.loans||[];
  return `<div class="card calendar-card">
    <div class="section-title"><div><div class="kicker">CALENDÁRIO FINANCEIRO</div><h2>${formatGameDate(cal.currentDate)}</h2></div><span class="badge blue">Próximo fechamento ${formatGameDate(cal.nextPayrollDate)}</span></div>
    <div class="calendar-money"><span>Folha salarial mensal</span><b>${Number(cal.monthlyWages||0).toLocaleString("pt-BR")} moedas</b></div>
    <p class="muted">No início de cada novo mês o jogo paga salários, parcelas de transferências, taxas de empréstimos e recebe o patrocínio mensal.</p>
    ${(cal.payrolls||[]).slice(0,3).map(x=>`<div class="finance-row"><span>Fechamento ${esc(x.month)}</span><b class="${Number(x.balance)>=0?"income":"expense"}">Saldo ${Number(x.balance).toLocaleString("pt-BR")}</b></div>`).join("")}
    ${installments.length?`<div class="calendar-sub"><b>Parcelas de transferências</b>${installments.slice(0,4).map(x=>`<span>${esc(x.player_name)} · ${x.installments_paid}/${x.installments_total} pagas · restante ${Number(x.amount_remaining).toLocaleString("pt-BR")}</span>`).join("")}</div>`:""}
    ${loans.length?`<div class="calendar-sub loan-calendar-list"><b>Empréstimos ativos</b>${loans.slice(0,6).map(x=>`<div class="loan-calendar-item">
      <span>${esc(x.player_name)} · ${x.months_elapsed}/${x.months_total} meses · taxa ${Number(x.monthly_fee).toLocaleString("pt-BR")}/mês</span>
      ${x.purchase_option_price?`<button class="secondary buy-loan-option" data-loan="${x.id}" data-name="${esc(x.player_name)}" data-price="${Number(x.purchase_option_price)}">Comprar por ${Number(x.purchase_option_price).toLocaleString("pt-BR")}</button>`:`<small>Sem opção de compra</small>`}
    </div>`).join("")}</div>`:""}
  </div>`;
}

function transferBanBanner(){
  const ban=state.finance?.transferBan;
  if(!ban?.active)return "";
  return `<div class="transfer-ban"><b>⛔ TRANSFER BAN ATIVO</b><span>O clube está excessivamente endividado. Você pode vender jogadores, mas não pode contratar nem pedir novos empréstimos enquanto o caixa estiver abaixo de ${Number(ban.threshold).toLocaleString("pt-BR")} moedas.</span></div>`;
}
function activeLoansMarketCard(){
  const loans=state.finance?.loans||[];
  if(!loans.length)return "";

  return `<section class="active-loans-market">
    <div class="section-title">
      <div><div class="kicker">EMPRÉSTIMOS ATIVOS</div><h3>Jogadores emprestados ao clube</h3></div>
      <span class="badge">${loans.length}</span>
    </div>
    <div class="active-loan-grid">
      ${loans.map(x=>`<article class="active-loan-card">
        <div>
          <b>${esc(x.player_name)}</b>
          <small>${esc(x.parent_club_name)} · OVR ${x.rating}</small>
        </div>
        <div class="active-loan-meta">
          <span>${x.months_elapsed}/${x.months_total} meses</span>
          <span>Taxa ${Number(x.monthly_fee).toLocaleString("pt-BR")}/mês</span>
        </div>
        ${x.purchase_option_price
          ?`<button class="primary buy-loan-option" data-loan="${x.id}" data-name="${esc(x.player_name)}" data-price="${Number(x.purchase_option_price)}">Exercer opção · ${Number(x.purchase_option_price).toLocaleString("pt-BR")}</button>`
          :`<div class="loan-no-option">Sem opção de compra</div>`}
      </article>`).join("")}
    </div>
  </section>`;
}

function sponsorshipCard(){
  const sp=state.sponsorship||{active:[],offers:[],activeCount:0,maxActive:2,slotsAvailable:2};
  const active=Array.isArray(sp.active)?sp.active:(sp.active?[sp.active]:[]);
  const maxActive=Number(sp.maxActive||2);
  const slots=Math.max(0,Number(sp.slotsAvailable??(maxActive-active.length)));
  const offers=sp.offers||[];

  const categoryIcon=category=>{
    if(String(category).includes("apostas"))return "🎯";
    if(String(category).includes("esportivo"))return "👕";
    if(String(category).includes("Banco"))return "🏦";
    if(String(category).includes("Telecom"))return "📱";
    if(String(category).includes("Automotivo"))return "🚗";
    if(String(category).includes("Bebidas"))return "🥤";
    if(String(category).includes("Tecnologia"))return "💻";
    return "🏢";
  };

  return `<div class="card sponsor-card sponsor-card-v29">
    <div class="section-title">
      <div>
        <div class="kicker">PATROCÍNIOS</div>
        <h2>${active.length}/${maxActive} contratos ativos</h2>
      </div>
      <span class="badge ${slots>0?"blue":""}">${slots>0?`${slots} vaga(s) livre(s)`:"2/2 ocupados"}</span>
    </div>

    <p class="muted">Seu clube pode manter até <b>dois patrocinadores ao mesmo tempo</b>. Os valores aumentam conforme a divisão.</p>

    ${active.length?`<div class="active-sponsors-grid">
      ${active.map((contract,index)=>{
        const remaining=Math.max(0,Number(contract.months_total||12)-Number(contract.months_paid||0));
        return `<article class="active-sponsor">
          <div class="active-sponsor-slot">PATROCÍNIO ${index+1}</div>
          <h3>${esc(contract.sponsor_name)}</h3>
          <span class="active-sponsor-category">${esc(contract.category||"Patrocinador")}</span>
          <div class="sponsor-money"><span>Pagamento mensal</span><b>+${Number(contract.monthly_amount||0).toLocaleString("pt-BR")}</b></div>
          <small>${remaining} mês(es) restantes</small>
        </article>`;
      }).join("")}
    </div>`:""}

    ${slots>0?`
      <div class="sponsor-market-head">
        <div><div class="kicker">PROPOSTAS DISPONÍVEIS</div><h3>Escolha ${slots===2?"até dois":"o segundo"} patrocinador</h3></div>
        <span class="muted">${offers.length} propostas</span>
      </div>

      <div class="sponsor-category-legend">
        <span>🎯 Casas de apostas</span>
        <span>👕 Material esportivo</span>
        <span>🏦 Finanças</span>
        <span>📱 Telecom</span>
        <span>💻 Tecnologia</span>
        <span>🚗 Outros setores</span>
      </div>

      <div class="sponsor-offers sponsor-offers-v29">
        ${offers.map(o=>`<button class="sponsor-offer secondary" data-sponsor="${esc(o.id)}">
          <span class="sponsor-brand-icon">${categoryIcon(o.category)}</span>
          <b>${esc(o.name)}</b>
          <em>${esc(o.category||"Patrocinador")}</em>
          <span>+${Number(o.monthly).toLocaleString("pt-BR")}/mês</span>
          <small>Luvas +${Number(o.signing).toLocaleString("pt-BR")}</small>
        </button>`).join("")}
      </div>
      <p class="sponsor-disclaimer">Os nomes das marcas são usados apenas como parte da simulação do jogo. Não há vínculo, parceria ou patrocínio real com estas empresas.</p>
    `:`<div class="sponsor-limit-note">Os dois espaços de patrocínio estão ocupados. Quando um contrato terminar, uma nova vaga será liberada.</div>`}
  </div>`;
}
function copaQuickCard(){
  const copa=state.competitions?.copaBrasil,car=state.competitions?.career;
  if(!copa||car?.phase==="STATE")return "";
  const active=copa.status!=="finished"&&!copa.userEliminated;
  const legText=copa.twoLegged?` · ${Number(copa.leg||1)===1?"ida":"volta"}`:"";
  return `<div class="card copa-home"><div><div class="kicker">${esc(copa.name||"COPA NACIONAL")}</div><h2>${copa.status==="finished"?`🏆 ${esc(copa.championClub?.name||"Encerrada")}`:esc(({R32:"Primeira fase",R16:"Oitavas",QF:"Quartas",SF:"Semifinais",FINAL:"Final"})[copa.stage]||copa.stage)+legText}</h2><p class="muted">${copa.twoLegged?"Mata-mata em ida e volta. Empate no agregado vai para os pênaltis.":"Torneio mata-mata em jogo único."}</p></div>${active?`<button id="playCopaHome" class="primary">Jogar ${copa.twoLegged?(Number(copa.leg||1)===1?"ida":"volta"):esc(copa.name||"Copa")}</button>`:""}</div>`;
}
function superWorldQuickCard(){
  const car=state.competitions?.career;
  if(!car)return "";
  if(car.super_world_season){
    return `<div class="card world-home">
      <div><div class="kicker">🌍 SUPER MUNDIAL</div><h2>Temporada de Mundial de Clubes</h2>
      <p class="muted">32 clubes: UEFA 12 · CONMEBOL 6 · AFC 4 · CAF 4 · CONCACAF 4 · OFC 1 · país-sede 1.</p></div>
      <button class="secondary" id="goWorldCompetition">Ver Mundial</button>
    </div>`;
  }
  const season=Number(car.season_no||1);
  const next=season<=1?1:1+Math.ceil((season-1)/4)*4;
  return `<div class="card world-home compact-world-home">
    <div><div class="kicker">PRÓXIMO SUPER MUNDIAL</div><b>Temporada ${next}</b><span class="muted"> · ciclo de 4 temporadas</span></div>
  </div>`;
}

function newsHomeCard(){
  const news=(state.mediaNews||[]).slice(0,3);
  return `<section class="card newsroom-home">
    <div class="section-title"><div><div class="kicker">NA MÍDIA</div><h2>Últimas notícias</h2></div><button id="goNews" class="secondary">Abrir jornal</button></div>
    ${news.length?news.map(n=>`<article class="news-home-item"><span>${esc(mediaCategoryLabel(n.category))}</span><div><b>${esc(n.headline)}</b><small>${esc(n.source_name)} · ${formatNewsDate(n.created_at)}</small></div></article>`).join(""):`<p class="muted">As notícias da carreira aparecerão aqui.</p>`}
  </section>`;
}

function injuredPlayersPanel(compact=false){
  const injured=(state.players||[])
    .filter(p=>Number(p.injury_games||0)>0)
    .sort((x,y)=>Number(y.injury_games||0)-Number(x.injury_games||0)||Number(y.rating||0)-Number(x.rating||0));

  if(!injured.length){
    return compact
      ?`<div class="injury-clear">✅ Nenhum jogador lesionado.</div>`
      :`<section class="card injury-panel injury-panel-clear">
          <div class="section-title"><div><div class="kicker">DEPARTAMENTO MÉDICO</div><h2>Jogadores lesionados</h2></div><span class="badge">0</span></div>
          <p class="muted">Todo o elenco está disponível fisicamente.</p>
        </section>`;
  }

  return `<section class="card injury-panel ${compact?"compact":""}">
    <div class="section-title">
      <div><div class="kicker">🩹 DEPARTAMENTO MÉDICO</div><h2>Jogadores lesionados</h2></div>
      <span class="badge red">${injured.length}</span>
    </div>
    <div class="injury-list">
      ${injured.map(p=>`<article class="injury-player">
        <div class="injury-player-main">
          <span class="injury-rating">${p.rating}</span>
          <div>
            <b>${esc(p.name)}</b>
            <small>${esc(p.role||posName(p.position))} · ${p.age} anos${p.is_starter?" · titular":""}</small>
          </div>
        </div>
        <div class="injury-time">
          <strong>🩹 ${esc(p.injury_type||"Lesão")} · ${Number(p.injury_games)} jogo(s)</strong>
          <span>${Number(p.injury_games)===1?"Retorno previsto após o próximo jogo":`Retorno previsto em ${Number(p.injury_games)} jogos`}</span>
        </div>
        <div class="injury-condition">
          <span>Físico <b>${p.fitness??100}%</b></span>
          <span>Moral <b>${p.morale??70}</b></span>
        </div>
      </article>`).join("")}
    </div>
  </section>`;
}

function disciplinePanel(compact=false){
  const suspended=(state.players||[])
    .filter(p=>Number(p.suspension_games||0)>0)
    .sort((a,b)=>Number(b.suspension_games||0)-Number(a.suspension_games||0)||Number(b.rating||0)-Number(a.rating||0));
  const atRisk=(state.players||[])
    .filter(p=>Number(p.suspension_games||0)<=0&&Number(p.yellow_accumulation||0)>=2)
    .sort((a,b)=>Number(b.rating||0)-Number(a.rating||0));

  if(!suspended.length&&!atRisk.length)return "";

  return `<section class="card discipline-panel ${compact?"compact":""}">
    <div class="section-title">
      <div><div class="kicker">🟨 DISCIPLINA</div><h2>Cartões e suspensões</h2></div>
      <span class="badge red">${suspended.length} suspenso(s)</span>
    </div>
    ${suspended.length?`<div class="discipline-list">
      ${suspended.map(p=>`<div class="discipline-row"><b>🟥 ${esc(p.name)}</b><span>${p.suspension_games} jogo(s) de suspensão</span></div>`).join("")}
    </div>`:""}
    ${atRisk.length?`<div class="discipline-risk"><b>Com 2 amarelos:</b> ${atRisk.map(p=>`${esc(p.name)} (${p.yellow_accumulation}/3)`).join(" · ")}</div>`:""}
  </section>`;
}

function benchPanel(){
  const bench=(state.players||[])
    .filter(p=>!p.is_starter&&Number(p.injury_games||0)<=0&&Number(p.suspension_games||0)<=0)
    .sort((a,b)=>{
      if(Boolean(a.is_bench)!==Boolean(b.is_bench))return a.is_bench?-1:1;
      return Number(b.rating||0)-Number(a.rating||0);
    })
    .slice(0,9);
  return `<section class="bench-panel">
    <div class="section-title"><div><div class="kicker">BANCO DE RESERVAS</div><h3>9 relacionados</h3></div><span class="badge">${bench.length}/9</span></div>
    <div class="bench-grid">
      ${bench.map(p=>`<div class="bench-player"><span>${p.rating}</span><b>${esc(p.name)}</b><small>${esc(p.role||posName(p.position))} · físico ${p.fitness??100}% · forma ${p.form_rating??70}</small></div>`).join("")}
    </div>
    <p class="muted">Durante a simulação, o treinador pode fazer até 5 substituições automáticas usando este banco, priorizando desgaste, posição e qualidade.</p>
  </section>`;
}

function managerOffersCard(compact=false){
  const offers=state.realism?.managerOffers||[];
  if(!offers.length)return "";
  return `<section class="card manager-offers-card ${compact?"compact":""}">
    <div class="section-title">
      <div><div class="kicker">📩 MERCADO DE TREINADORES</div><h2>Propostas de outros clubes</h2></div>
      <span class="badge red">${offers.length}</span>
    </div>
    <p class="muted">Seu desempenho chamou atenção. Aceitar uma proposta troca o clube que você comanda dentro desta mesma carreira e você assume a situação atual da nova equipe.</p>
    <div class="manager-offer-list">
      ${offers.map(o=>`<article class="manager-offer">
        <div><b>${esc(o.club_name)}</b><small>OVR-base ${o.base_rating} · desempenho que gerou a oferta ${o.performance_score}/100${o.coach_name?` · atual treinador ${esc(o.coach_name)}`:""}</small></div>
        <div class="offer-value"><small>SALÁRIO</small><b>${Number(o.salary||0).toLocaleString("pt-BR")}/mês</b></div>
        <div class="offer-actions">
          <button class="primary accept-manager-offer" data-id="${o.id}">Aceitar cargo</button>
          <button class="danger decline-manager-offer" data-id="${o.id}">Recusar</button>
        </div>
      </article>`).join("")}
    </div>
  </section>`;
}

function tacticLabel(v){
  return ({
    LOW:"Baixa",NORMAL:"Normal",HIGH:"Alta",SLOW:"Lento",FAST:"Rápido",
    NARROW:"Estreita",WIDE:"Ampla",BALANCED:"Equilibrado",POSSESSION:"Posse",
    COUNTER:"Contra-ataque",DIRECT:"Jogo direto",AGGRESSIVE:"Agressiva"
  })[v]||v;
}
function tacticOptions(values,current){
  return values.map(v=>`<option value="${v}" ${current===v?"selected":""}>${esc(tacticLabel(v))}</option>`).join("");
}
function realismView(){
  const r=state.realism||{};
  const tactics=r.tactics||{};
  const opp=r.opponent;
  const window=r.transferWindow||state.transferWindow||{};
  const records=r.records||{};
  const history=r.history||[];
  const awards=r.awards||[];
  const playerHistory=r.playerHistory||[];

  return `<section class="realism-page">
    <div class="card realism-hero">
      <div>
        <div class="kicker">CENTRAL DE REALISMO</div>
        <h1>Gestão esportiva completa</h1>
        <p class="muted">Tática, comissão técnica, base, estádio, olheiros, rivalidade, histórico e mercado de treinadores.</p>
      </div>
      <div class="realism-kpis">
        <span>Entrosamento <b>${r.chemistry??70}</b></span>
        <span>Reputação do treinador <b>${r.managerReputation??50}</b></span>
        <span>Rival <b>${esc(r.rival?.name||"A definir")}</b></span>
        <span>Janela <b>${window.open?"ABERTA":"FECHADA"}</b></span>
      </div>
    </div>

    ${managerOffersCard(false)}

    <section class="card opponent-analysis">
      <div class="section-title"><div><div class="kicker">PRÓXIMO ADVERSÁRIO</div><h2>Análise pré-jogo</h2></div></div>
      ${opp?`
        <div class="opponent-grid">
          <div><b>${esc(opp.name)}</b><span>OVR ${opp.rating} · ${esc(opp.formation)} · treinador ${esc(opp.coachName||"Treinador")}</span></div>
          <div><small>ESTILO</small><b>${esc(tacticLabel(opp.style))}</b><span>Pressão ${esc(tacticLabel(opp.pressing))}</span></div>
          <div><small>PONTO FORTE</small><b>${esc(opp.strength)}</b><span>Ponto vulnerável: ${esc(opp.weakness)}</span></div>
          <div><small>DESTAQUE</small><b>${esc(opp.star?.name||"Sem informação")}</b><span>${opp.star?`${esc(opp.star.role)} · OVR estimado ${opp.star.ratingMin}–${opp.star.ratingMax}`:""}</span></div>
        </div>
        ${opp.unavailable?.length?`<div class="opponent-unavailable"><b>Desfalques:</b> ${opp.unavailable.map(x=>`${esc(x.name)}${x.injury?` · lesão ${x.injury}j`:` · suspensão ${x.suspension}j`}`).join(" | ")}</div>`:""}
      `:`<div class="empty">Nenhum próximo adversário definido.</div>`}
    </section>

    <section class="card">
      <div class="section-title"><div><div class="kicker">TÁTICA</div><h2>Instruções da equipe</h2></div></div>
      <form id="realismTactics" class="realism-form-grid">
        <label>Pressão<select id="tacticPressing">${tacticOptions(["LOW","NORMAL","HIGH"],tactics.pressing||"NORMAL")}</select></label>
        <label>Linha defensiva<select id="tacticLine">${tacticOptions(["LOW","NORMAL","HIGH"],tactics.defensiveLine||"NORMAL")}</select></label>
        <label>Ritmo<select id="tacticTempo">${tacticOptions(["SLOW","NORMAL","FAST"],tactics.tempo||"NORMAL")}</select></label>
        <label>Largura<select id="tacticWidth">${tacticOptions(["NARROW","NORMAL","WIDE"],tactics.width||"NORMAL")}</select></label>
        <label>Estilo ofensivo<select id="tacticStyle">${tacticOptions(["BALANCED","POSSESSION","COUNTER","DIRECT"],tactics.style||"BALANCED")}</select></label>
        <label>Marcação<select id="tacticMarking">${tacticOptions(["NORMAL","AGGRESSIVE"],tactics.marking||"NORMAL")}</select></label>
        <button class="primary">Salvar instruções</button>
      </form>
      <p class="muted">Pressão alta, ritmo rápido e marcação agressiva podem melhorar a intensidade, mas aumentam fadiga e risco de lesão.</p>
    </section>

    <section class="card">
      <div class="section-title"><div><div class="kicker">FUNÇÕES INDIVIDUAIS</div><h2>Status, capitão e bolas paradas</h2></div></div>
      <div class="realism-player-list">
        ${(r.players||state.players||[]).map(p=>`<div class="realism-player-row" data-realism-player="${p.id}">
          <div class="rp-name"><span>${p.rating}</span><div><b>${esc(p.name)}</b><small>${esc(p.role||p.position)} · forma ${p.form_rating??70} · felicidade ${p.happiness??75} · potencial ${p.potential??p.rating}</small></div></div>
          <select class="rp-status">
            ${[["STAR","Craque"],["STARTER","Titular"],["ROTATION","Rotação"],["BACKUP","Reserva"],["PROSPECT","Promessa"]].map(([v,l])=>`<option value="${v}" ${p.squad_status===v?"selected":""}>${l}</option>`).join("")}
          </select>
          <select class="rp-role">
            ${[["BALANCED","Equilibrado"],["STOPPER","Marcador"],["BALL_PLAYING","Construtor"],["ANCHOR","Volante marcador"],["PLAYMAKER","Armador"],["BOX_TO_BOX","Box-to-box"],["WINGER","Ponta aberto"],["INSIDE_FORWARD","Ponta invertido"],["TARGET","Referência"],["POACHER","Finalizador"],["SWEEPER_KEEPER","Goleiro-líbero"]].map(([v,l])=>`<option value="${v}" ${p.tactical_role===v?"selected":""}>${l}</option>`).join("")}
          </select>
          <select class="rp-setpiece">
            ${[["NONE","Sem bola parada"],["PENALTY","Pênaltis"],["FREE_KICK","Faltas"],["CORNER","Escanteios"]].map(([v,l])=>`<option value="${v}" ${p.set_piece_role===v?"selected":""}>${l}</option>`).join("")}
          </select>
          <div class="rp-checks">
            <label class="captain-check"><input class="rp-captain" type="checkbox" ${p.is_captain?"checked":""}> Capitão</label>
            <label class="captain-check"><input class="rp-bench" type="checkbox" ${p.is_bench?"checked":""} ${p.is_starter?"disabled":""}> Banco</label>
          </div>
          <button type="button" class="secondary save-player-realism" data-id="${p.id}">Salvar</button>
        </div>`).join("")}
      </div>
    </section>

    <section class="grid realism-two">
      <div class="card">
        <div class="section-title"><div><div class="kicker">COMISSÃO TÉCNICA</div><h2>Especialistas</h2></div></div>
        <div class="staff-list">
          ${(r.staff||[]).map(x=>`<div class="staff-row">
            <div><b>${esc(x.staff_name)}</b><small>${esc(({FITNESS:"Preparador físico",PHYSIO:"Fisioterapeuta",SCOUT:"Olheiro",GK_COACH:"Treinador de goleiros"})[x.role]||x.role)} · nível ${x.level}/5 · salário ${Number(x.salary).toLocaleString("pt-BR")}</small></div>
            <button class="secondary upgrade-staff" data-role="${x.role}" ${Number(x.level)>=5?"disabled":""}>${Number(x.level)>=5?"Nível máximo":`Melhorar · ${Number(x.level)*4500}`}</button>
          </div>`).join("")}
        </div>
      </div>

      <div class="card">
        <div class="section-title"><div><div class="kicker">ESTÁDIO E TORCIDA</div><h2>Receita de jogos</h2></div></div>
        <div class="stadium-stats">
          <span>Capacidade <b>${Number(r.stadium?.capacity||0).toLocaleString("pt-BR")}</b></span>
          <span>Nível <b>${r.stadium?.level||1}/8</b></span>
          <span>Último público <b>${Number(r.stadium?.lastAttendance||0).toLocaleString("pt-BR")}</b></span>
        </div>
        <form id="stadiumForm" class="stack">
          <label>Preço do ingresso<input id="ticketPrice" type="number" min="5" max="100" value="${Number(r.stadium?.ticketPrice||30)}"></label>
          <div class="stadium-actions">
            <button class="secondary" name="stadiumAction" value="price">Salvar preço</button>
            <button class="primary" name="stadiumAction" value="upgrade">Ampliar estádio</button>
          </div>
        </form>
        <p class="muted">Preço alto pode reduzir ocupação. Jogos em casa, clássicos e adversários fortes aumentam demanda e receita.</p>
      </div>
    </section>

    <section class="card">
      <div class="section-title"><div><div class="kicker">CATEGORIAS DE BASE</div><h2>Jovens da academia</h2></div><span class="badge">${(r.academy||[]).length}</span></div>
      <div class="academy-grid">
        ${(r.academy||[]).length?(r.academy||[]).map(y=>`<article class="academy-card">
          <span class="rating">${y.rating}</span>
          <b>${esc(y.name)}</b>
          <small>${esc(y.role)} · ${y.age} anos</small>
          <div>Potencial <strong>${y.potential}</strong></div>
          <div class="academy-actions">
            <button class="primary promote-youth" data-id="${y.id}" ${Number(y.age)<16?"disabled":""}>${Number(y.age)<16?"Muito jovem":"Promover ao profissional"}</button>
            <button class="danger release-youth" data-id="${y.id}" data-name="${esc(y.name)}">Dispensar</button>
          </div>
        </article>`).join(""):`<div class="empty">Sem atletas disponíveis na base.</div>`}
      </div>
    </section>

    <section class="grid realism-two">
      <div class="card">
        <div class="section-title"><div><div class="kicker">HISTÓRICO DA CARREIRA</div><h2>Temporadas concluídas</h2></div></div>
        ${history.length?`<div class="history-list">${history.map(h=>`<div class="history-row"><b>T${h.season_no} · ${esc(leagueLabel(h.division,state.club.country_code))} · ${h.final_position}º</b><span>${h.wins}V ${h.draws}E ${h.losses}D · ${h.gf}:${h.ga} · ${h.trophies} título(s)</span><small>Artilheiro: ${esc(h.top_scorer||"—")} ${h.top_scorer_goals||0} gols · caixa ${Number(h.balance||0).toLocaleString("pt-BR")}</small></div>`).join("")}</div>`:`<div class="empty">O histórico será preenchido quando uma temporada for encerrada.</div>`}
      </div>
      <div class="card">
        <div class="section-title"><div><div class="kicker">RECORDES</div><h2>Marcas do clube</h2></div></div>
        <div class="record-grid">
          <span>Maior artilheiro atual <b>${esc(records.topScorer?.name||"—")} · ${records.topScorer?.goals||0}</b></span>
          <span>Mais jogos no elenco <b>${esc(records.topAppearances?.name||"—")} · ${records.topAppearances?.appearances||0}</b></span>
          <span>Troféus <b>${records.trophies||0}</b></span>
          <span>Maior vitória <b>${records.biggestWin?`${records.biggestWin.user_goals}×${records.biggestWin.opponent_goals}`:"—"}</b></span>
          <span>Pior derrota <b>${records.biggestLoss?`${records.biggestLoss.user_goals}×${records.biggestLoss.opponent_goals}`:"—"}</b></span>
          <span>Maior venda <b>${records.biggestSale?`${esc(records.biggestSale.player_name||"Jogador")} · ${Number(records.biggestSale.amount||0).toLocaleString("pt-BR")}`:"—"}</b></span>
          <span>Maior contratação <b>${records.biggestPurchase?`${esc(records.biggestPurchase.player_name||records.biggestPurchase.description||"Contratação")} · ${Number(records.biggestPurchase.amount||0).toLocaleString("pt-BR")}`:"—"}</b></span>
          <span>Maior invencibilidade <b>${records.unbeatenStreak||0} jogo(s)</b></span>
          <span>Recorde de público <b>${records.recordAttendance?Number(records.recordAttendance.attendance||0).toLocaleString("pt-BR"):"—"}</b></span>
        </div>
      </div>
    </section>

    <section class="grid realism-two">
      <div class="card">
        <div class="section-title"><div><div class="kicker">PRÊMIOS INDIVIDUAIS</div><h2>Destaques por temporada</h2></div></div>
        ${awards.length?awards.map(x=>`<div class="award-row"><span>🏅</span><div><b>${esc(x.award_title)}</b><small>${esc(x.player_name)} · temporada ${x.season_no}</small></div></div>`).join(""):`<div class="empty">Ainda não há prêmios encerrados.</div>`}
      </div>
      <div class="card">
        <div class="section-title"><div><div class="kicker">MERCADO DA IA</div><h2>Transferências entre clubes</h2></div></div>
        ${(r.aiTransfers||[]).length?(r.aiTransfers||[]).map(x=>`<div class="ai-transfer-row"><b>${esc(x.player_name)}</b><span>${esc(x.from_club_name)} → ${esc(x.to_club_name)}</span><small>${Number(x.fee||0).toLocaleString("pt-BR")} moedas</small></div>`).join(""):`<div class="empty">A movimentação aparecerá durante as janelas de transferências.</div>`}
      </div>
    </section>

    <section class="card">
      <div class="section-title"><div><div class="kicker">ESTATÍSTICAS HISTÓRICAS</div><h2>Jogadores por temporada</h2></div></div>
      ${playerHistory.length?`<div class="table-wrap"><table><thead><tr><th>Temporada</th><th>Jogador</th><th>J</th><th>G</th><th>A</th><th>SG</th><th>OVR final</th></tr></thead><tbody>
        ${playerHistory.slice(0,60).map(x=>`<tr><td>${x.season_no}</td><td>${esc(x.player_name)}</td><td>${x.appearances}</td><td>${x.goals}</td><td>${x.assists}</td><td>${x.clean_sheets}</td><td>${x.rating_end}</td></tr>`).join("")}
      </tbody></table></div>`:`<div class="empty">Os números por temporada serão arquivados ao fim do primeiro ano.</div>`}
    </section>
  </section>`;
}

function homeView(){
  const c=state.club,car=state.competitions.career,pos=userPosition();
  let action="";
  if(car.phase==="STATE")action=`<button id="careerAction" data-action="state" class="primary">🏟️ JOGAR PRÓXIMA FASE DO ESTADUAL</button>`;
  if(car.phase==="NATIONAL")action=`<button id="careerAction" data-action="national" class="primary">⚽ JOGAR RODADA ${car.current_round}/38</button>`;
  if(car.phase==="LIBERTADORES")action=`<button id="careerAction" data-action="lib" class="primary">🏆 JOGAR PRÓXIMA FASE DA LIBERTADORES</button>`;
  if(car.phase==="CHAMPIONS")action=`<button id="careerAction" data-action="champions" class="primary">⭐ JOGAR PRÓXIMA FASE DA CHAMPIONS</button>`;
  if(car.phase==="CLUB_WORLD_CUP")action=`<button id="careerAction" data-action="world" class="primary">🌍 JOGAR PRÓXIMA FASE DO SUPER MUNDIAL</button>`;
  if(car.phase==="END")action=`<button id="careerAction" data-action="next" class="primary">📅 IR PARA A PRÓXIMA TEMPORADA</button>`;
  const tired=state.players.filter(p=>p.is_starter&&Number(p.fitness||100)<55).length;
  const injured=state.players.filter(p=>Number(p.injury_games||0)>0).length;

  return `<section class="hero">
    <div class="club-head">${crestHtml(c)}<div>
      <div class="kicker">Temporada ${car.season_no} · ${phaseName(car.phase)}</div>
      <h1>${esc(c.name)}</h1>
      <p>${esc(locationLabel(c))} · ${esc(leagueLabel(car.user_division,car.country_code||c.country_code))}${pos?` · ${pos}º lugar`:""}</p>
    </div></div>
    <div class="season-action-row">
      ${action}
      ${car.phase!=="END"?`<button id="simulateFullSeason" class="secondary season-sim-btn">⏩ SIMULAR TEMPORADA INTEIRA</button>`:""}
    </div>
    <div class="stats">
      <div class="stat"><small>Overall</small><b>${c.team_rating}</b></div>
      <div class="stat"><small>Caixa</small><b>${Number(c.coins).toLocaleString("pt-BR")}</b></div>
      <div class="stat"><small>Folha mensal</small><b>${Number(state.finance?.wages||0).toLocaleString("pt-BR")}</b></div>
      <div class="stat"><small>Elenco</small><b>${tired} cansados · ${injured} lesionados</b></div>
    </div>
  </section>
  ${managerOffersCard(true)}
  ${injuredPlayersPanel(true)}
  ${disciplinePanel(true)}
  ${transferBanBanner()}
  ${copaQuickCard()}
  ${superWorldQuickCard()}
  ${car.phase==="END"?`<section class="season-end" style="margin-top:14px">
    <div class="kicker">FIM DA TEMPORADA</div>
    <h2>${state.saf?.active&&state.saf?.debtRisk
      ?(car.user_division==="D"?"SAF fecha o ano no vermelho: sanção financeira na divisão atual":`SAF no vermelho: rebaixamento administrativo para ${esc(leagueLabel(lowerDivision(car.user_division),car.country_code||c.country_code))}`)
      :(nextDivision()!==car.user_division?`Você vai para ${esc(leagueLabel(nextDivision(),car.country_code||c.country_code))}`:`Você permanece em ${esc(leagueLabel(car.user_division,car.country_code||c.country_code))}`)}</h2>
    <p>A próxima temporada reinicia as tabelas${(car.country_code||c.country_code)==="BR"?" e o Estadual":""}. Seu elenco, dinheiro, escudo e estatísticas de carreira continuam.</p>
    <h3>Troféus conquistados nesta temporada</h3>
    ${trophyCards(seasonTrophies())}
  </section>`:""}
  <section class="grid">
    <div class="card"><div class="section-title"><h2>Últimos jogos</h2><span class="badge">${state.matches.length}</span></div>
      ${state.matches.length?state.matches.slice(0,7).map(m=>`<div class="match">
        <b>${esc(c.name)}</b><span class="score">${m.user_goals} × ${m.opponent_goals}</span>
        <span class="right">${esc(m.opponent_name)}<br><small class="muted">${esc(m.match_type)}</small></span>
      </div>`).join(""):`<div class="empty">Nenhum jogo ainda.</div>`}
    </div>
    <div class="card"><div class="section-title"><h2>Finanças</h2><span class="badge">${Number(c.coins).toLocaleString("pt-BR")}</span></div>
      ${(state.finance?.recent||[]).length?(state.finance.recent||[]).slice(0,6).map(x=>`<div class="finance-row"><span>${esc(x.description)}</span><b class="${Number(x.amount)>=0?"income":"expense"}">${Number(x.amount)>=0?"+":""}${Number(x.amount).toLocaleString("pt-BR")}</b></div>`).join(""):`<p class="muted">As receitas e despesas aparecerão após os jogos.</p>`}
    </div>
  </section>
  <section class="grid">
    <div class="card"><h2>Eventos inesperados</h2>
      ${(state.clubEvents||[]).length?(state.clubEvents||[]).slice(0,6).map(e=>`<div class="club-event"><b>${esc(e.title)}</b><span>${esc(e.description)}</span></div>`).join(""):`<p class="muted">Nenhum evento recente.</p>`}
    </div>
    <div class="card"><h2>Gestão do elenco</h2>
      <p class="muted">Jogadores cansados perdem rendimento. Use a escalação e o botão de rodízio para preservar o time.</p>
      <button class="secondary" id="goSquad">Ver escalação e físico</button>
    </div>
  </section>
  <section class="grid calendar-grid">${calendarCard()}${sponsorshipCard()}</section>
  ${newsHomeCard()}
  <section class="card" style="margin-top:14px"><div class="kicker">GALERIA</div><h2>Troféus do clube</h2>${trophyCards((state.trophies||[]).slice(0,6))}</section>`;
}
function startersView(){
  const starters=state.players
    .filter(p=>p.is_starter)
    .sort((x,y)=>{
      const order={GK:1,DEF:2,MID:3,ATT:4};
      return (order[x.position]||9)-(order[y.position]||9) || Number(y.rating)-Number(x.rating);
    });
  const reserves=state.players
    .filter(p=>!p.is_starter)
    .sort((x,y)=>Number(y.rating)-Number(x.rating));

  return `<section class="card starters-page">
    <div class="toolbar">
      <div>
        <div class="kicker">ESCALAÇÃO</div>
        <h2>Monte seu time titular</h2>
      </div>
      <div class="lineup-save-status ${state.lineupDirty?"dirty":"saved"}">
        ${state.lineupDirty?"● Alterações não salvas":"✓ Escalação salva"}
      </div>
    </div>

    <div class="lineup-steps">
      <div><b>1</b><span>Escolha a formação</span></div>
      <div><b>2</b><span>Clique em um titular para trocar</span></div>
      <div><b>3</b><span>Salve a escalação</span></div>
    </div>

    <div class="lineup-toolbar">
      <label>Formação
        <select id="starterFormation">${formationSelectOptions(state.club.formation)}</select>
      </label>
      <button id="starterBestSquad" class="primary">⭐ Usar os melhores</button>
      <button id="starterRotateSquad" class="secondary">🔄 Priorizar descansados</button>
    </div>

    ${customFormationBuilder("starter",state.club.formation)}

    <div class="lineup-tip">💡 O rodízio inteligente leva em conta físico, jogos consecutivos, nível do reserva e importância da partida. Em decisão, ele troca menos; em jogos menos críticos, poupa mais.</div>

    ${state.rotationAdvice?`<div class="rotation-advice compact">
      <div><div class="kicker">PLANO DE RODÍZIO</div><b>${esc(state.rotationAdvice.context)}</b><span>${esc(state.rotationAdvice.message)}</span></div>
      ${state.rotationAdvice.changes?.length?`<div class="rotation-changes">${state.rotationAdvice.changes.map(x=>`<span><b>${esc(x.out)}</b> descansa · entra <b>${esc(x.in)}</b> <small>${esc(x.reason)}</small></span>`).join("")}</div>`:""}
    </div>`:""}

    ${injuredPlayersPanel(true)}
    ${disciplinePanel(true)}

    <div id="starterPitchWrap">${formationPitch(state.club.formation,true)}</div>
    ${benchPanel()}

    <div class="starter-summary">
      <span><small>TITULARES</small><b>${starters.length}/11</b></span>
      <span><small>OVR MÉDIO</small><b>${starters.length?Math.round(starters.reduce((n,p)=>n+Number(p.rating),0)/starters.length):0}</b></span>
      <span><small>FÍSICO MÉDIO</small><b>${starters.length?Math.round(starters.reduce((n,p)=>n+Number(p.fitness||100),0)/starters.length):0}%</b></span>
    </div>

    <div class="section-title lineup-section-title">
      <div><div class="kicker">11 INICIAIS</div><h3>Quem começa jogando</h3></div>
      <span class="badge">${starters.length}</span>
    </div>

    <div class="starter-list">
      ${starters.length?starters.map(p=>`<article class="starter-row ${fitnessClass(p)}">
        <div class="starter-number">${p.rating}</div>
        <div class="starter-info">
          <b>${esc(p.name)}</b>
          <span>${esc(p.role||posName(p.position))} · ${p.age} anos${Number(p.consecutive_starts||0)>=2?` · ${p.consecutive_starts} jogos seguidos`:""}</span>
        </div>
        <div class="starter-condition">
          <span>Físico <b>${p.fitness??100}%</b></span>
          <span>Moral <b>${p.morale??70}</b></span>
        </div>
        <button type="button" class="secondary starter-swap-btn" data-swap-id="${p.id}">Trocar</button>
      </article>`).join(""):`<div class="empty">Nenhum titular definido.</div>`}
    </div>

    <details class="bench-panel">
      <summary>Ver reservas disponíveis (${reserves.length})</summary>
      <div class="bench-grid">
        ${reserves.map(p=>`<div class="bench-player ${Number(p.injury_games||0)>0?"injured":""}">
          <span class="bench-rating">${p.rating}</span>
          <div><b>${esc(p.name)}</b><small>${esc(p.role||posName(p.position))} · físico ${p.fitness??100}%</small></div>
          ${Number(p.injury_games||0)>0?`<span class="bench-injury">Lesionado</span>`:""}
        </div>`).join("")}
      </div>
    </details>

    <div class="starter-actions sticky-lineup-actions">
      <button id="saveStarters" class="primary">💾 Salvar escalação</button>
      <button id="goFullSquad" class="secondary">Ver elenco completo</button>
    </div>
  </section>`;
}
function squadView(){
  return `<section class="card">
    <div class="toolbar">
      <div><div class="kicker">Gestão do time</div><h2>Formação, físico e rodízio</h2></div>
      <div class="squad-tools">
        <label>Formação<select id="formation">${formationSelectOptions(state.club.formation)}</select></label>
        <button id="bestSquad" class="primary">⭐ Escalar melhores</button>
        <button id="rotateSquad" class="secondary">Sugerir rodízio</button>
      </div>
    </div>
    ${customFormationBuilder("squad",state.club.formation)}
    <p class="muted">O rodízio agora considera físico, sequência de jogos, qualidade do reserva e importância da próxima partida. Em jogos decisivos, o sistema preserva mais os titulares; em partidas menos críticas, poupa mais.</p>
    ${state.rotationAdvice?`<div class="rotation-advice">
      <div><div class="kicker">PLANO DE RODÍZIO</div><b>${esc(state.rotationAdvice.context)}</b><span>${esc(state.rotationAdvice.message)}</span></div>
      ${state.rotationAdvice.changes?.length?`<div class="rotation-changes">${state.rotationAdvice.changes.map(x=>`<span><b>${esc(x.out)}</b> descansa · entra <b>${esc(x.in)}</b> <small>${esc(x.reason)}</small></span>`).join("")}</div>`:""}
    </div>`:""}
    ${injuredPlayersPanel()}
    ${disciplinePanel()}
    <div id="pitchWrap">${formationPitch(state.club.formation)}</div>
    ${benchPanel()}
    <div class="legend"><span class="good-dot"></span> Bom físico <span class="warn-dot"></span> Cansado <span class="bad-dot"></span> Muito cansado/lesionado</div>
    <div class="players" style="margin-top:16px">${state.players.map(playerCard).join("")}</div>
    <button id="saveLineup" class="primary" style="margin-top:14px">Salvar escalação</button>
  </section>`;
}
function marketView(){
  const ban=state.finance?.transferBan;
  const window=state.realism?.transferWindow||state.transferWindow||{open:true};
  return `<section class="card">
    <div class="section-title">
      <div><div class="kicker">Scout, compras e vendas</div><h2>Mercado de transferências</h2></div>
      <div class="finance-chips"><span class="coins">Caixa ● ${Number(state.club.coins).toLocaleString("pt-BR")}</span><span class="badge red">Folha mensal ${Number(state.finance?.wages||0).toLocaleString("pt-BR")}</span></div>
    </div>
    ${transferBanBanner()}
    <div class="transfer-window-banner ${window.open?"open":"closed"}">
      <b>${window.open?"🟢 JANELA DE TRANSFERÊNCIAS ABERTA":"🔒 JANELA DE TRANSFERÊNCIAS FECHADA"}</b>
      <span>${window.open?"Compras e empréstimos podem ser registrados agora.":`Você pode pesquisar e observar jogadores, mas só poderá contratar quando a janela reabrir${window.next?` em ${esc(window.next)}`:""}.`}</span>
    </div>
    ${activeLoansMarketCard()}
    ${state.teamPerformance?`<div class="performance-market ${state.teamPerformance.hot?"hot":""} ${state.teamPerformance.elite?"elite":""}">
      <div><div class="kicker">VALORIZAÇÃO DO ELENCO</div><b>${esc(state.teamPerformance.label)}</b>
      <span>${state.teamPerformance.games} jogos analisados · ${state.teamPerformance.wins} vitórias · ${state.teamPerformance.position?`${state.teamPerformance.position}º na tabela · `:""}índice ${state.teamPerformance.score}/100</span></div>
      <p>${state.teamPerformance.hot
        ?"O bom desempenho está atraindo outros clubes. Titulares e jogadores decisivos têm mais chance de receber propostas e podem valer um pouco mais."
        :"Quando o time entrar em grande fase, o interesse de outros clubes pelos seus jogadores aumenta automaticamente."}</p>
    </div>`:""}
    <section class="incoming-section">
      <div class="section-title"><div><div class="kicker">PROPOSTAS RECEBIDAS</div><h3>Clubes interessados nos seus jogadores</h3></div><button id="checkOffers" class="secondary">Buscar novas propostas</button></div>
      <div id="incomingOffers">${incomingOfferCards()}</div>
    </section>
    <section class="selling-section">
      <div class="kicker">VENDER JOGADORES</div><h3>Lista de transferências</h3>
      <p class="muted">Na aba Elenco, use <b>Colocar à venda</b>. Clubes controlados pelo jogo poderão enviar propostas pelo jogador dentro desta carreira.</p>
      <div class="listed-row">${state.players.filter(p=>p.transfer_listed).length?state.players.filter(p=>p.transfer_listed).map(p=>`<span class="listed-chip">${esc(p.name)} · OVR ${p.rating}</span>`).join(""):`<span class="muted">Nenhum jogador listado.</span>`}</div>
    </section>
    <hr class="section-divider">
    <div class="kicker">CONTRATAÇÕES</div><h3>Pesquisar jogadores</h3>
    ${state.marketProfile?`<div class="market-level">Mercado de ${esc(leagueLabel(state.competitions?.career?.user_division||"D",state.competitions?.career?.country_code||state.club?.country_code))} · jogadores normalmente entre OVR ${state.marketProfile.min} e ${state.marketProfile.max}. Ao subir de divisão, o nível disponível aumenta.</div>`:""}
    <p class="muted">O mercado agora inclui jogadores com nomes reais. Os atributos, preços e salários são valores de jogo balanceados e não representam uma base oficial ao vivo. Cada carreira mantém sua própria cópia do atleta.</p><p class="muted">O clube vendedor precisa aceitar a proposta e o jogador precisa aceitar o salário e o projeto esportivo. Compras podem ser parceladas em até 24x. Jogadores não essenciais de clubes do jogo podem chegar por empréstimo.</p>
    ${ban?.active?`<p class="muted">A pesquisa continua disponível, mas novas contratações estão bloqueadas pelo transfer ban.</p>`:""}
    <form id="transferSearch" class="transfer-search" action="javascript:void(0)" novalidate>
      <input id="searchName" placeholder="Nome do jogador" value="${esc(state.transferSearch?.name||"")}">
      <select id="searchPosition">
        ${[
          ["","Todas as posições"],["GK","Goleiro"],["DEF","Defesa"],["MID","Meio"],["ATT","Ataque"],
          ["CB","Zagueiro"],["RB","Lateral direito"],["LB","Lateral esquerdo"],
          ["CDM","Volante"],["CM","Meia central"],["CAM","Meia ofensivo"],
          ["RW","Ponta direita"],["LW","Ponta esquerda"],["ST","Centroavante"]
        ].map(([v,l])=>`<option value="${v}" ${String(state.transferSearch?.position||"")===v?"selected":""}>${l}</option>`).join("")}
      </select>
      <input id="searchMinRating" type="number" min="40" max="100" value="${Number(state.transferSearch?.minRating??58)}" placeholder="OVR mínimo">
      <input id="searchMaxPrice" type="number" min="0" value="${Number(state.transferSearch?.maxPrice??500000)}" placeholder="Valor máximo">
      <label class="real-filter"><input id="searchRealOnly" type="checkbox" ${state.transferSearch?.realOnly?"checked":""}> Só jogadores reais</label>
      <button id="transferSearchBtn" type="button" class="primary">Pesquisar</button>
    </form>
    <div id="transferMsg"></div>
    <div id="transferResults" class="market-grid">${transferCards()}</div>
  </section>`;
}
function incomingOfferCards(){
  if(!(state.incomingOffers||[]).length)return `<div class="empty">Nenhuma proposta pendente. Coloque jogadores à venda ou aguarde o avanço do calendário.</div>`;
  return `<div class="offer-list">${state.incomingOffers.map(o=>`<article class="incoming-offer">
    <div><div class="kicker">${esc(o.buying_club_name)}</div><h4>${esc(o.player_name)}</h4><span class="muted">${esc(o.role||o.position)} · OVR ${o.rating} · ${o.age} anos</span></div>
    <div class="offer-value"><small>OFERTA</small><b>${Number(o.amount).toLocaleString("pt-BR")}</b></div>
    <div class="offer-actions"><button class="primary accept-offer" data-id="${o.id}">Aceitar</button><button class="danger reject-offer" data-id="${o.id}">Recusar</button></div>
  </article>`).join("")}</div>`;
}
function transferCards(){
  if(!state.transferResults?.length)return `<div class="empty">Use a pesquisa para encontrar jogadores livres e atletas de outros clubes. A qualidade do mercado aumenta conforme sua divisão.</div>`;
  const window=state.realism?.transferWindow||state.transferWindow||{open:true};
  const blocked=Boolean(state.finance?.transferBan?.active)||!window.open;

  return state.transferResults.map(p=>{
    const scouted=Boolean(p.scouted);
    const ratingText=scouted?String(p.rating):`${p.rating_min}–${p.rating_max}`;
    const blockLabel=state.finance?.transferBan?.active?"Transfer ban":!window.open?"Janela fechada":"Comprar";

    return `<article class="player transfer-player ${scouted?"scouted":"unscouted"}">
      <span class="pos">${esc(p.role||posName(p.position))} · ${p.age} anos${p.nationality_code?` · ${esc(p.nationality_code)}`:""}</span>
      <span class="rating">${ratingText}</span>
      <h4>${esc(p.name)} ${p.is_real_name?`<span class="real-player-badge">REAL</span>`:""}</h4>
      <div class="transfer-source">${p.source_club_name?esc(p.source_club_name):(p.is_real_name?"Mercado global":"Livre no mercado")}${p.source_division?` · ${esc(leagueLabel(p.source_division,state.competitions?.career?.country_code||state.club?.country_code))}`:""}</div>

      ${scouted?`<div class="attrs">
        <span>VEL <b>${p.pace}</b></span><span>CHU <b>${p.shooting}</b></span>
        <span>PAS <b>${p.passing}</b></span><span>DEF <b>${p.defending}</b></span>
      </div>`:`<div class="scouting-unknown">
        <b>Relatório parcial do olheiro</b>
        <span>OVR estimado ${p.rating_min}–${p.rating_max}. Faça a observação completa para revelar o overall exato.</span>
      </div>`}

      <div class="pstats">
        <span>Valor justo <b>${Number(p.fair_value||0).toLocaleString("pt-BR")}</b></span>
        <span>Pedido <b>${Number(p.asking_price||0).toLocaleString("pt-BR")}</b></span>
        <span>Salário mensal <b>${Number(p.suggested_salary||0).toLocaleString("pt-BR")}</b></span>
        <span>Interesse <b>${esc(p.interest)}</b></span>
        ${scouted?`<span>Potencial <b>${p.potential??p.rating}</b></span>`:""}
      </div>
      <div class="loan-status ${p.loan_eligible?"loan-ok":"loan-no"}">${p.loan_eligible?`Empréstimo disponível · sugerido ${Number(p.suggested_loan_fee||0).toLocaleString("pt-BR")}/mês`:`Empréstimo: ${esc(p.loan_reason||"indisponível")}`}</div>
      <div class="player-actions">
        ${!scouted?`<button class="secondary scout-player" data-id="${p.id}">🔎 Observar · ${Number(p.scout_cost||0).toLocaleString("pt-BR")}</button>`:""}
        <button class="primary negotiate-player" data-id="${p.id}" ${blocked?"disabled":""}>${blockLabel}</button>
        ${p.loan_eligible?`<button class="secondary loan-player" data-id="${p.id}" ${blocked?"disabled":""}>Empréstimo</button>`:""}
      </div>
    </article>`;
  }).join("");
}
function friendsView(){
  return `<section class="card">
    <div class="section-title"><div><div class="kicker">Multiplayer assíncrono</div><h2>Jogar contra amigos</h2></div><span class="badge">${state.friends.length} amigos</span></div>
    <div class="codebox"><span>Seu código</span><code>${esc(state.club.friend_code||"------")}</code><button id="copyCode" class="secondary">Copiar</button></div>
    <div class="friend-add" style="margin-top:12px"><input id="friendCode" maxlength="6" placeholder="Código do amigo"><button id="addFriend" class="primary">Adicionar</button></div>
    <div id="friendMsg" style="margin-top:10px"></div>
    <div class="friends-grid" style="margin-top:14px">
      ${state.friends.length?state.friends.map(f=>`<article class="friend-card">
        <div class="friend-top">${crestHtml(f,"small")}<div><h4>${esc(f.name)}</h4><span class="muted">OVR ${f.team_rating}</span></div></div>
        <div class="friend-actions"><button class="secondary view-club" data-id="${f.id}">Ver elenco</button><button class="primary play-friend" data-id="${f.id}">Jogar</button></div>
        <button class="danger remove-friend" data-id="${f.id}" style="width:100%;margin-top:7px">Remover</button>
      </article>`).join(""):`<div class="empty">Adicione um amigo pelo código.</div>`}
    </div>
  </section>`;
}

function rowClass(div,i,clubId){
  const cls=["clickable"];
  if(String(clubId)===String(state.club.id))cls.push("me");
  if(div==="A"){if(i<4)cls.push("libspot");if(i>=16)cls.push("relegated")}
  else if(div==="D"){if(i<4)cls.push("promoted")}
  else{if(i<4)cls.push("promoted");if(i>=16)cls.push("relegated")}
  return cls.join(" ");
}

function divisionView(div){
  const d=state.competitions.divisions[div],round=state.roundByDiv[div]||1;
  const games=d.fixtures.filter(f=>Number(f.round)===Number(round));
  return `<div class="competition-info">
    <span class="badge blue">20 TIMES</span><span class="badge blue">38 RODADAS</span><span class="badge blue">19 CASA + 19 FORA</span>
    ${div==="A"?`${(state.competitions.career.country_code||"BR")==="BR"
      ?`<span class="badge">TOP 4 → LIBERTADORES</span>`
      :["ENG","ESP","ITA","GER","FRA","POR"].includes(state.competitions.career.country_code||"")
        ?`<span class="badge">TOP 4 → CHAMPIONS LEAGUE</span>`
        :`<span class="badge">ELITE NACIONAL</span>`}<span class="badge red">4 REBAIXADOS</span>`:
      div==="D"?`<span class="badge">4 SOBEM</span><span class="badge blue">SEM REBAIXAMENTO</span>`:
      `<span class="badge">4 SOBEM</span><span class="badge red">4 CAEM</span>`}
  </div>
  <div class="table-wrap" style="margin-top:12px"><table>
    <thead><tr><th>#</th><th>Clube</th><th>PTS</th><th>J</th><th>V</th><th>E</th><th>D</th><th>GP</th><th>GC</th><th>SG</th></tr></thead>
    <tbody>${d.entries.map((e,i)=>`<tr class="${rowClass(div,i,e.clubId)}" data-club="${e.clubId}">
      <td>${i+1}</td><td><b>${esc(e.club.name)}</b></td><td><b>${e.points}</b></td><td>${e.wins+e.draws+e.losses}</td>
      <td>${e.wins}</td><td>${e.draws}</td><td>${e.losses}</td><td>${e.gf}</td><td>${e.ga}</td><td>${e.gd>0?"+":""}${e.gd}</td>
    </tr>`).join("")}</tbody>
  </table></div>
  <div class="round-head"><label>Rodada<select id="roundSelect">${Array.from({length:38},(_,i)=>i+1).map(r=>`<option value="${r}" ${r===Number(round)?"selected":""}>Rodada ${r}</option>`).join("")}</select></label></div>
  <div class="fixture-grid">${games.map(f=>`<div class="fixture ${String(f.home)===String(state.club.id)||String(f.away)===String(state.club.id)?"user-fixture":""}">
    <span>${esc(f.homeClub.name)}</span><b>${f.played?`${f.hg} × ${f.ag}`:"×"}</b><span class="right">${esc(f.awayClub.name)}</span>
  </div>`).join("")}</div>`;
}

function stateView(){
  const s=state.competitions.state;
  return `<div class="section-title"><div>
    <div class="kicker">${esc(STATES[state.competitions.career.state_code])}</div>
    <h2>${esc(s.name)}</h2>
    <span class="muted">${s.stage==="GROUP"?`Fase classificatória · rodada ${Math.min(s.round,7)}/7`:s.stage==="SF"?"Semifinais":s.stage==="FINAL"?"Final":"Encerrado"}</span>
  </div>${state.competitions.career.phase==="STATE"?`<button id="playState" class="primary">Jogar próxima fase</button>`:""}</div>
  ${s.champion?`<div class="champion-card"><div class="kicker">CAMPEÃO ESTADUAL</div><h2>🏆 ${esc(s.championClub?.name||"Campeão")}</h2></div>`:""}
  <div class="table-wrap"><table>
    <thead><tr><th>#</th><th>Clube</th><th>PTS</th><th>J</th><th>V</th><th>E</th><th>D</th><th>SG</th></tr></thead>
    <tbody>${s.entries.map((e,i)=>`<tr class="clickable ${String(e.clubId)===String(state.club.id)?"me":""}" data-club="${e.clubId}">
      <td>${i+1}</td><td>${esc(e.club.name)}</td><td><b>${e.points}</b></td><td>${e.wins+e.draws+e.losses}</td><td>${e.wins}</td><td>${e.draws}</td><td>${e.losses}</td><td>${e.gd>0?"+":""}${e.gd}</td>
    </tr>`).join("")}</tbody>
  </table></div>
  <h3>Jogos</h3><div class="fixture-grid">${s.fixtures.map(f=>`<div class="fixture ${String(f.home)===String(state.club.id)||String(f.away)===String(state.club.id)?"user-fixture":""}">
    <span>${esc(f.homeClub.name)}</span><b>${f.played?`${f.hg} × ${f.ag}`:"×"}</b><span class="right">${esc(f.awayClub.name)}</span>
    ${penaltySummary(f)}
  </div>`).join("")}</div>`;
}

function groupCard(group){
  const rows=state.competitions.libertadores.entries.filter(e=>e.group===group)
    .sort((a,b)=>b.points-a.points||(b.gd-a.gd)||b.gf-a.gf);
  return `<div class="group-card"><h3>Grupo ${group}</h3>
    <table class="mini-table"><thead><tr><th>#</th><th>Clube</th><th>PTS</th><th>J</th><th>SG</th></tr></thead>
    <tbody>${rows.map((e,i)=>`<tr class="${i<2?"qualified":""} clickable" data-club="${e.clubId}">
      <td>${i+1}</td><td>${esc(e.club.name)}</td><td>${e.points}</td><td>${e.wins+e.draws+e.losses}</td><td>${e.gd>0?"+":""}${e.gd}</td>
    </tr>`).join("")}</tbody></table>
  </div>`;
}

function penaltySummary(f){
  if(!f?.pw)return "";
  const winner=String(f.pw)===String(f.home)?f.homeClub?.name:f.awayClub?.name;
  if(f.penHome!=null&&f.penAway!=null){
    return `<em class="penalty-detail">Pênaltis: ${esc(f.homeClub?.name||"Mandante")} <b>${f.penHome}</b> × <b>${f.penAway}</b> ${esc(f.awayClub?.name||"Visitante")} · <strong>${esc(winner||"Vencedor")} passou</strong></em>`;
  }
  return `<em class="penalty-detail">Decidido nos pênaltis · <strong>${esc(winner||"Vencedor")} passou</strong></em>`;
}
function aggregateSummary(fixtures){
  const all=[...(fixtures||[])].sort((x,y)=>Number(x.leg||1)-Number(y.leg||1));
  const fs=all.filter(f=>f.played);
  if(all.length<2||fs.length<all.length)return "";
  const ids=[...new Set(fs.flatMap(f=>[String(f.home),String(f.away)]))];
  if(ids.length!==2)return "";
  const scores=new Map(ids.map(id=>[id,0]));
  const names=new Map();
  for(const f of fs){
    scores.set(String(f.home),scores.get(String(f.home))+Number(f.hg||0));
    scores.set(String(f.away),scores.get(String(f.away))+Number(f.ag||0));
    names.set(String(f.home),f.homeClub?.name||"Clube");
    names.set(String(f.away),f.awayClub?.name||"Clube");
  }
  const [a,b]=ids;
  let winner=null;
  if(scores.get(a)>scores.get(b))winner=a;
  else if(scores.get(b)>scores.get(a))winner=b;
  else winner=String(fs[fs.length-1]?.pw||"");
  return `<div class="aggregate-line">
    Agregado: <b>${esc(names.get(a))} ${scores.get(a)} × ${scores.get(b)} ${esc(names.get(b))}</b>
    ${winner?`<strong>Classificado: ${esc(names.get(String(winner))||"")}</strong>`:""}
  </div>`;
}
function groupedKnockoutTies(fixtures,stage){
  const fs=(fixtures||[]).filter(f=>f.stage===stage);
  const keys=[...new Set(fs.map(f=>f.tie||`${stage}-${f.slot}`))];
  return keys.map(key=>fs.filter(f=>(f.tie||`${stage}-${f.slot}`)===key).sort((x,y)=>Number(x.leg||1)-Number(y.leg||1)));
}

function knockoutList(lib){
  return `<div class="knockout-grid">${[["R16","Oitavas"],["QF","Quartas"],["SF","Semifinais"],["FINAL","Final"]].map(([code,label])=>{
    const ties=groupedKnockoutTies(lib.fixtures,code);if(!ties.length)return "";
    return `<div class="knockout-stage"><h3>${label}</h3>
      ${ties.map(fs=>`<div class="ko-tie">
        <small>${code==="FINAL"?"Final · jogo único":`Chave ${fs[0]?.slot} · ida e volta`}</small>
        ${fs.map(f=>`<div class="ko-leg">
          <span class="leg-label">${code==="FINAL"?"FINAL":Number(f.leg||1)===1?"IDA":"VOLTA"}</span>
          <span>${esc(f.homeClub?.name||"")} ${f.played?`<b>${f.hg}</b>`:""}</span>
          <span>${esc(f.awayClub?.name||"")} ${f.played?`<b>${f.ag}</b>`:""}</span>
          ${penaltySummary(f)}
        </div>`).join("")}
        ${aggregateSummary(fs)}
      </div>`).join("")}
    </div>`;
  }).join("")}</div>`;
}
function libertadoresView(){
  const lib=state.competitions.libertadores;
  if(!lib)return `<div class="empty"><h2>🏆 Libertadores</h2><p>Classificam-se os 4 primeiros da Série A e também o campeão da Copa do Brasil. Se o campeão da Copa estiver fora do G4, ele entra como vaga adicional.</p></div>`;
  const qualificationReason=lib.qualification?.userReason;
  const qualificationBanner=qualificationReason?`<div class="libertadores-qualified-banner">✅ Seu clube se classificou: <b>${esc(qualificationReason)}</b>.</div>`:"";
  if(lib.status==="finished")return `${qualificationBanner}<div class="champion-card"><div class="kicker">CAMPEÃO DA LIBERTADORES</div><h2>🏆 ${esc(lib.championClub?.name||"Campeão")}</h2></div>${knockoutList(lib)}`;
  const button=state.competitions.career.phase==="LIBERTADORES"?`<button id="playLib" class="primary">Jogar próxima fase</button>`:"";
  if(lib.stage==="GROUP")return `${qualificationBanner}<div class="section-title"><div><div class="kicker">32 CLUBES · 8 GRUPOS</div><h2>Libertadores — fase de grupos</h2><span class="muted">6 jogos por clube · 2 classificados por grupo</span></div>${button}</div>
    <div class="groups-grid">${"ABCDEFGH".split("").map(groupCard).join("")}</div>`;
  return `${qualificationBanner}<div class="section-title"><div><div class="kicker">MATA-MATA</div><h2>${({R16:"Oitavas",QF:"Quartas",SF:"Semifinais",FINAL:"Final"})[lib.stage]}</h2></div>${button}</div>${knockoutList(lib)}`;
}

function championsTableRows(){
  const ch=state.competitions.championsLeague;
  if(!ch)return [];
  return [...ch.entries].sort((x,y)=>y.points-x.points||(y.gd-x.gd)||y.gf-x.gf);
}
function championsKnockoutList(ch){
  return `<div class="knockout-grid">${[["PLAYOFF","Playoff"],["R16","Oitavas"],["QF","Quartas"],["SF","Semifinais"],["FINAL","Final"]].map(([code,label])=>{
    const ties=groupedKnockoutTies(ch.fixtures,code);if(!ties.length)return "";
    return `<div class="knockout-stage"><h3>${label}</h3>${ties.map(fs=>`<div class="ko-tie">
      <small>${code==="FINAL"?"Final · jogo único":`Chave ${fs[0]?.slot} · ida e volta`}</small>
      ${fs.map(f=>`<div class="ko-leg">
        <span class="leg-label">${code==="FINAL"?"FINAL":Number(f.leg||1)===1?"IDA":"VOLTA"}</span>
        <span>${esc(f.homeClub?.name||"")} ${f.played?`<b>${f.hg}</b>`:""}</span>
        <span>${esc(f.awayClub?.name||"")} ${f.played?`<b>${f.ag}</b>`:""}</span>
        ${penaltySummary(f)}
      </div>`).join("")}
      ${aggregateSummary(fs)}
    </div>`).join("")}</div>`;
  }).join("")}</div>`;
}
function championsView(){
  const ch=state.competitions.championsLeague;
  const country=state.competitions.career.country_code||"BR";
  if(!ch)return `<div class="empty"><h2>⭐ UEFA Champions League</h2><p>Nas carreiras europeias, os 4 primeiros da elite nacional se classificam.</p></div>`;

  const rows=championsTableRows();
  const button=state.competitions.career.phase==="CHAMPIONS"?`<button id="playChampions" class="primary">Jogar próxima fase</button>`:"";

  if(ch.status==="finished"){
    return `<div class="champion-card"><div class="kicker">CAMPEÃO DA CHAMPIONS LEAGUE</div><h2>⭐ ${esc(ch.championClub?.name||"Campeão")}</h2></div>
      ${championsKnockoutList(ch)}`;
  }

  if(ch.stage==="LEAGUE"){
    return `<div class="section-title"><div>
      <div class="kicker">36 CLUBES · FASE DE LIGA</div>
      <h2>UEFA Champions League</h2>
      <span class="muted">8 jogos por clube · top 8 direto às oitavas · 9º ao 24º no playoff</span>
    </div>${button}</div>
    <div class="table-wrap champions-table"><table>
      <thead><tr><th>#</th><th>Clube</th><th>PTS</th><th>J</th><th>V</th><th>E</th><th>D</th><th>SG</th></tr></thead>
      <tbody>${rows.map((e,i)=>`<tr class="clickable ${i<8?"qualified":i<24?"playoff-zone":"eliminated-zone"} ${String(e.clubId)===String(state.club.id)?"me":""}" data-club="${e.clubId}">
        <td>${i+1}</td><td>${esc(e.club?.name||"")}</td><td><b>${e.points}</b></td><td>${e.wins+e.draws+e.losses}</td><td>${e.wins}</td><td>${e.draws}</td><td>${e.losses}</td><td>${e.gd>0?"+":""}${e.gd}</td>
      </tr>`).join("")}</tbody>
    </table></div>`;
  }

  return `<div class="section-title"><div><div class="kicker">${ch.stage==="FINAL"?"FINAL · JOGO ÚNICO":"MATA-MATA · IDA E VOLTA"}</div><h2>Champions League — ${esc(({PLAYOFF:"Playoff",R16:"Oitavas",QF:"Quartas",SF:"Semifinais",FINAL:"Final"})[ch.stage]||ch.stage)}</h2></div>${button}</div>
    ${championsKnockoutList(ch)}`;
}
function worldGroupCard(group){
  const world=state.competitions.clubWorldCup;
  const rows=world.entries.filter(e=>e.group===group).sort((a,b)=>b.points-a.points||(b.gd-a.gd)||b.gf-a.gf);
  return `<div class="group-card"><h3>Grupo ${group}</h3>
    <table class="mini-table"><thead><tr><th>#</th><th>Clube</th><th>PTS</th><th>J</th><th>SG</th></tr></thead>
    <tbody>${rows.map((e,i)=>`<tr class="${i<2?"qualified":""} clickable" data-club="${e.clubId}">
      <td>${i+1}</td><td>${esc(e.club?.name||"")}</td><td>${e.points}</td><td>${e.wins+e.draws+e.losses}</td><td>${e.gd>0?"+":""}${e.gd}</td>
    </tr>`).join("")}</tbody></table>
  </div>`;
}
function worldKnockoutList(world){
  return `<div class="knockout-grid">${[["R16","Oitavas"],["QF","Quartas"],["SF","Semifinais"],["FINAL","Final"]].map(([code,label])=>{
    const fs=world.fixtures.filter(f=>f.stage===code);if(!fs.length)return "";
    return `<div class="knockout-stage"><h3>${label}</h3>${fs.map(f=>`<div class="ko-match">
      <small>${code==="FINAL"?"Final":`Chave ${f.slot}`}</small>
      <span>${esc(f.homeClub?.name||"")} ${f.played?`<b>${f.hg}</b>`:""}</span>
      <span>${esc(f.awayClub?.name||"")} ${f.played?`<b>${f.ag}</b>`:""}</span>
      ${penaltySummary(f)}
    </div>`).join("")}</div>`;
  }).join("")}</div>`;
}
function clubWorldCupView(){
  const world=state.competitions.clubWorldCup;
  const car=state.competitions.career;
  const allocation=`<div class="world-allocation">
    <span>🇪🇺 UEFA <b>12</b></span><span>🌎 CONMEBOL <b>6</b></span><span>🌏 AFC <b>4</b></span>
    <span>🌍 CAF <b>4</b></span><span>🌎 CONCACAF <b>4</b></span><span>🌊 OFC <b>1</b></span><span>🏟️ País-sede <b>1</b></span>
  </div>`;

  if(!world){
    const season=Number(car.season_no||1);const next=season<=1?1:1+Math.ceil((season-1)/4)*4;
    return `<div class="empty world-empty"><h2>🌍 Super Mundial de Clubes</h2>
      <p>32 clubes. O torneio acontece a cada 4 temporadas neste modo carreira.</p>
      ${allocation}
      <p>Próxima edição no calendário da carreira: temporada ${next}.</p>
    </div>`;
  }

  const button=car.phase==="CLUB_WORLD_CUP"?`<button id="playWorld" class="primary">Jogar próxima fase</button>`:"";
  if(world.status==="finished"){
    return `<div class="champion-card"><div class="kicker">CAMPEÃO MUNDIAL DE CLUBES</div><h2>🌍🏆 ${esc(world.championClub?.name||"Campeão")}</h2></div>${allocation}${worldKnockoutList(world)}`;
  }

  if(world.stage==="GROUP"){
    return `<div class="section-title"><div><div class="kicker">32 CLUBES · 8 GRUPOS</div><h2>Super Mundial de Clubes</h2><span class="muted">3 jogos por clube · os 2 melhores de cada grupo avançam</span></div>${button}</div>
      ${allocation}
      <div class="groups-grid">${"ABCDEFGH".split("").map(worldGroupCard).join("")}</div>`;
  }

  return `<div class="section-title"><div><div class="kicker">SUPER MUNDIAL · MATA-MATA</div><h2>${esc(({R16:"Oitavas",QF:"Quartas",SF:"Semifinais",FINAL:"Final"})[world.stage]||world.stage)}</h2></div>${button}</div>
    ${allocation}${worldKnockoutList(world)}`;
}

function copaView(){
  const copa=state.competitions.copaBrasil;
  if(!copa)return `<div class="empty">Copa nacional não disponível.</div>`;
  const stageLabels={R32:"Primeira fase",R16:"Oitavas de final",QF:"Quartas de final",SF:"Semifinais",FINAL:"Final"};
  const active=copa.status!=="finished"&&!copa.userEliminated&&state.competitions.career.phase!=="STATE";
  const brazilTwoLeg=Boolean(copa.twoLegged);

  return `<div class="section-title"><div>
      <div class="kicker">${brazilTwoLeg?"MATA-MATA · IDA E VOLTA":"MATA-MATA · JOGO ÚNICO"}</div>
      <h2>${esc(copa.name||"Copa Nacional")}</h2>
      <span class="muted">${copa.status==="finished"?"Encerrada":stageLabels[copa.stage]||copa.stage}${brazilTwoLeg&&copa.status!=="finished"?` · ${Number(copa.leg||1)===1?"jogo de ida":"jogo de volta"}`:""}</span>
    </div>
    ${active?`<button id="playCopa" class="primary">${brazilTwoLeg?`Jogar ${Number(copa.leg||1)===1?"ida":"volta"}`:"Jogar próxima fase"}</button>`:""}
  </div>
  ${copa.status==="finished"?`<div class="champion-card"><div class="kicker">CAMPEÃO DA COPA</div><h2>🏆 ${esc(copa.championClub?.name||"Campeão")}</h2>
    ${String(copa.champion||"")===String(state.club.id)&&state.competitions.career.country_code==="BR"?`<div class="libertadores-qualified-banner">🌎 Vaga na Libertadores garantida pelo título da Copa do Brasil.</div>`:""}
  </div>`:""}
  ${copa.userEliminated?`<div class="msg">Seu clube foi eliminado. O restante do torneio foi simulado automaticamente.</div>`:""}
  <div class="knockout-grid copa-grid">
    ${[["R32","1ª fase"],["R16","Oitavas"],["QF","Quartas"],["SF","Semifinais"],["FINAL","Final"]].map(([code,label])=>{
      const ties=groupedKnockoutTies(copa.fixtures,code);if(!ties.length)return "";
      return `<div class="knockout-stage"><h3>${label}</h3>${ties.map(fs=>`<div class="ko-tie">
        <small>Chave ${fs[0]?.slot}${brazilTwoLeg?" · ida e volta":" · jogo único"}</small>
        ${fs.map(f=>`<div class="ko-leg">
          <span class="leg-label">${brazilTwoLeg?(Number(f.leg||1)===1?"IDA":"VOLTA"):"JOGO"}</span>
          <span>${esc(f.homeClub?.name||"")} ${f.played?`<b>${f.hg}</b>`:""}</span>
          <span>${esc(f.awayClub?.name||"")} ${f.played?`<b>${f.ag}</b>`:""}</span>
          ${penaltySummary(f)}
        </div>`).join("")}
        ${brazilTwoLeg?aggregateSummary(fs):""}
      </div>`).join("")}</div>`;
    }).join("")}
  </div>`;
}
function competitionsView(){
  const car=state.competitions.career;
  const country=car.country_code||state.club.country_code||"BR";
  const isBR=country==="BR";
  const isEurope=["ENG","ESP","ITA","GER","FRA","POR"].includes(country);
  const allowed=["STATE","COPA","A","B","C","D","LIB","CHAMPIONS","WORLD"];

  if(!allowed.includes(state.competitionTab))state.competitionTab=car.user_division;
  if(!isBR&&state.competitionTab==="STATE")state.competitionTab=car.user_division;
  if(!isBR&&state.competitionTab==="LIB")state.competitionTab=car.user_division;
  if(!isEurope&&state.competitionTab==="CHAMPIONS")state.competitionTab=car.user_division;

  const content=
    state.competitionTab==="STATE"?stateView():
    state.competitionTab==="COPA"?copaView():
    state.competitionTab==="LIB"?libertadoresView():
    state.competitionTab==="CHAMPIONS"?championsView():
    state.competitionTab==="WORLD"?clubWorldCupView():
    divisionView(state.competitionTab);

  return `<section class="card">
    <div class="competition-tabs">
      ${isBR?`<button data-comp="STATE" class="${state.competitionTab==="STATE"?"on":""}">ESTADUAL</button>`:""}
      <button data-comp="COPA" class="${state.competitionTab==="COPA"?"on":""}">${esc(state.competitions.copaBrasil?.name||"COPA NACIONAL")}</button>
      ${["A","B","C","D"].map(d=>`<button data-comp="${d}" class="${state.competitionTab===d?"on":""}">${esc(leagueLabel(d,country))}</button>`).join("")}
      ${isBR?`<button data-comp="LIB" class="${state.competitionTab==="LIB"?"on":""}">LIBERTADORES</button>`:""}
      ${isEurope?`<button data-comp="CHAMPIONS" class="${state.competitionTab==="CHAMPIONS"?"on":""}">CHAMPIONS</button>`:""}
      <button data-comp="WORLD" class="${state.competitionTab==="WORLD"?"on":""}">MUNDIAL</button>
    </div>
    ${content}
  </section>`;
}
function playerCareerPosition(){
  const pc=state.playerData?.career;
  const table=state.playerData?.league?.entries||[];
  const i=table.findIndex(e=>String(e.clubId)===String(pc?.club_id));
  return i>=0?i+1:null;
}
function playerPositionLabel(p){
  return ({GK:"Goleiro",DEF:"Defensor",MID:"Meio-campista",ATT:"Atacante"})[p]||p;
}
function playerTransferOffersView(){
  const offers=state.playerData?.transferOffers||[];
  if(!offers.length)return `<section class="card"><div class="kicker">MERCADO</div><h2>Sem propostas por enquanto</h2><p class="muted">Você pode continuar no clube e iniciar a próxima temporada.</p></section>`;
  return `<section class="card player-offers">
    <div class="kicker">3 PROPOSTAS POR TEMPORADA</div><h2>Escolha seu próximo passo</h2><p class="muted">As propostas podem vir do seu país atual ou de outra liga disponível no jogo.</p>
    <div class="player-offer-grid">
      ${offers.map(o=>`<article class="player-offer ${o.status!=="pending"?"decided":""}">
        <b>${esc(o.club?.name||o.clubName)}</b>
        <span>${esc(countryName(o.countryCode||state.playerData.career.country_code))} · ${esc(leagueLabel(o.division,o.countryCode||state.playerData.career.country_code))}</span>
        <span>Salário <strong>${Number(o.salary).toLocaleString("pt-BR")}/mês</strong></span>
        ${o.status==="pending"?`<button class="primary accept-player-offer" data-club="${o.clubId}">Aceitar proposta</button>`:`<em>${o.status==="accepted"?"Aceita":"Recusada"}</em>`}
      </article>`).join("")}
    </div>
  </section>`;
}
function playerCareerHome(){
  const d=state.playerData,pc=d?.career;
  if(!pc)return `<div class="empty">Carreira de jogador não carregada.</div>`;
  const pos=playerCareerPosition();
  const last=d.history?.[0];
  const statusEnd=pc.status==="END";
  return `<section class="player-career-hero">
    <div class="player-avatar">${esc(initials(pc.player_name))}</div>
    <div class="player-identity">
      <div class="kicker">TEMPORADA ${pc.season_no} · ${esc(countryName(pc.country_code))}</div>
      <h1>${esc(pc.player_name)}</h1>
      <p>${esc(playerPositionLabel(pc.position))} · ${esc(pc.club_name)} · ${esc(pc.league_name)}${pos?` · ${pos}º`:""}</p>
    </div>
    <div class="player-overall"><small>OVR</small><b>${pc.overall}</b></div>
    <div class="player-season-actions">
      ${!statusEnd?`<button id="playerPlayNext" class="primary player-main-action">⚽ JOGAR RODADA ${pc.current_round}/38</button>
      <button id="playerSimSeason" class="secondary player-main-action">⏩ SIMULAR TEMPORADA INTEIRA</button>`:
      `<button id="playerNextSeason" class="primary player-main-action">📅 IR PARA A PRÓXIMA TEMPORADA</button>`}
    </div>
  </section>
  <section class="player-career-stats">
    <div class="stat"><small>Idade</small><b>${pc.age}</b></div>
    <div class="stat"><small>Jogos</small><b>${pc.appearances}</b></div>
    <div class="stat"><small>Gols</small><b>${pc.goals}</b></div>
    <div class="stat"><small>Assistências</small><b>${pc.assists}</b></div>
    <div class="stat"><small>Físico</small><b>${pc.fitness}%</b></div>
    <div class="stat"><small>Moral</small><b>${pc.morale}</b></div>
    <div class="stat"><small>Evolução</small><b>${pc.skill_points}</b></div>
    <div class="stat"><small>Saldo pessoal</small><b>${Number(pc.balance).toLocaleString("pt-BR")}</b></div>
  </section>
  ${last?`<section class="card">
    <div class="kicker">ÚLTIMA PARTIDA</div>
    <div class="player-last-match">
      <span>${esc(last.homeName)}</span><b>${last.homeGoals} × ${last.awayGoals}</b><span>${esc(last.awayName)}</span>
    </div>
    <div class="player-match-performance">
      <span>Nota <b>${last.performance}</b></span><span>Gols <b>${last.goals}</b></span><span>Assistências <b>${last.assists}</b></span>
    </div>
  </section>`:""}
  ${statusEnd?playerTransferOffersView():""}
  <section class="grid">
    <div class="card"><div class="kicker">CONTRATO</div><h2>${esc(pc.club_name)}</h2>
      <div class="finance-row"><span>Salário</span><b class="income">+${Number(pc.salary).toLocaleString("pt-BR")}/mês</b></div>
      <p class="muted">O salário entra no saldo pessoal a cada 4 rodadas.</p>
    </div>
    <div class="card"><div class="kicker">EVOLUÇÃO</div><h2>${pc.skill_points} ponto(s)</h2>
      <p class="muted">Boas atuações geram pontos. Use a aba TREINO para melhorar os atributos.</p>
      <button class="secondary" id="goPlayerTraining">Abrir treino</button>
    </div>
  </section>`;
}
function playerSeasonView(){
  const d=state.playerData,pc=d.career;
  const round=Math.min(38,Number(pc.current_round||1));
  const table=d.league?.entries||[];
  const games=(d.league?.fixtures||[]).filter(f=>Number(f.round)===round);
  return `<section class="card">
    <div class="section-title"><div><div class="kicker">${esc(pc.league_name)}</div><h2>Temporada ${pc.season_no}</h2></div><span class="badge">Rodada ${round}/38</span></div>
    <div class="table-wrap"><table><thead><tr><th>#</th><th>Clube</th><th>J</th><th>V</th><th>E</th><th>D</th><th>SG</th><th>Pts</th></tr></thead><tbody>
      ${table.map((e,i)=>`<tr class="${String(e.clubId)===String(pc.club_id)?"user-row":""}"><td>${i+1}</td><td>${esc(e.club?.name||"Clube")}</td><td>${e.p??e.wins+e.draws+e.losses}</td><td>${e.w??e.wins}</td><td>${e.d??e.draws}</td><td>${e.l??e.losses}</td><td>${e.gd}</td><td><b>${e.pts??e.points}</b></td></tr>`).join("")}
    </tbody></table></div>
    <h3>Rodada ${round}</h3>
    <div class="fixtures">${games.map(f=>`<div class="match"><span>${esc(f.homeClub?.name||"")}</span><b>${f.played?`${f.hg} × ${f.ag}`:"×"}</b><span class="right">${esc(f.awayClub?.name||"")}</span></div>`).join("")}</div>
    <h3>Seus últimos jogos</h3>
    ${(d.history||[]).slice(0,10).map(m=>`<div class="match"><span>${esc(m.homeName)}</span><b>${m.homeGoals} × ${m.awayGoals}</b><span class="right">${esc(m.awayName)}<br><small>Nota ${m.performance}</small></span></div>`).join("")||`<div class="empty">Nenhum jogo disputado.</div>`}
  </section>`;
}
function playerTrainingView(){
  const pc=state.playerData.career;
  const attrs=[["pace","VEL",pc.pace],["shooting","CHU",pc.shooting],["passing","PAS",pc.passing],["defending","DEF",pc.defending]];
  return `<section class="card">
    <div class="section-title"><div><div class="kicker">DESENVOLVIMENTO</div><h2>Treino individual</h2></div><span class="badge blue">${pc.skill_points} ponto(s)</span></div>
    <p class="muted">Cada ponto de evolução aumenta um atributo em +1. Recuperação física não gasta ponto.</p>
    <div class="player-training-grid">
      ${attrs.map(([key,label,val])=>`<div class="training-card"><small>${label}</small><b>${val}</b><button class="secondary player-train" data-attr="${key}" ${pc.skill_points<=0||val>=99?"disabled":""}>+1</button></div>`).join("")}
      <div class="training-card"><small>FÍSICO</small><b>${pc.fitness}%</b><button class="secondary player-train" data-attr="fitness" ${pc.fitness>=100?"disabled":""}>Recuperar +12</button></div>
    </div>
    <div class="player-ovr-big"><small>OVERALL ATUAL</small><b>${pc.overall}</b></div>
  </section>`;
}
function bindPlayerCareer(){
  const play=app.querySelector("#playerPlayNext");
  if(play)play.onclick=async()=>{
    play.disabled=true;play.textContent="JOGANDO...";
    try{
      const r=await api("/api/player-career/play",{method:"POST",body:"{}"});
      await refreshPlayerCareer();renderPlayerCareer();
      if(r.match)alert(`${r.match.homeName} ${r.match.homeGoals} x ${r.match.awayGoals} ${r.match.awayName}\nSua nota: ${r.match.performance} · Gols: ${r.match.goals} · Assistências: ${r.match.assists}`);
    }catch(err){alert(err.message);play.disabled=false}
  };
  const simSeason=app.querySelector("#playerSimSeason");
  if(simSeason)simSeason.onclick=async()=>{
    if(!confirm("Simular todas as rodadas restantes desta temporada do jogador?\n\nNotas, gols, assistências, físico, evolução e salários continuarão sendo processados."))return;
    simSeason.disabled=true;simSeason.textContent="SIMULANDO TEMPORADA...";
    try{
      const d=await api("/api/player-career/simulate-season",{method:"POST",body:"{}"});
      await refreshPlayerCareer();
      renderPlayerCareer();
      alert(`Temporada simulada.\nRodadas simuladas: ${d.rounds||0}\nAgora você pode analisar as propostas recebidas.`);
    }catch(err){
      alert(err.message);simSeason.disabled=false;simSeason.textContent="⏩ SIMULAR TEMPORADA INTEIRA";
    }
  };

  const next=app.querySelector("#playerNextSeason");
  if(next)next.onclick=async()=>{
    if(!confirm("Iniciar a próxima temporada?"))return;
    next.disabled=true;
    try{await api("/api/player-career/next-season",{method:"POST",body:"{}"});await refreshPlayerCareer();state.playerView="home";renderPlayerCareer()}catch(err){alert(err.message);next.disabled=false}
  };
  const training=app.querySelector("#goPlayerTraining");
  if(training)training.onclick=()=>{state.playerView="training";renderPlayerCareer()};
  app.querySelectorAll(".player-train").forEach(btn=>btn.onclick=async()=>{
    btn.disabled=true;
    try{await api("/api/player-career/train",{method:"POST",body:JSON.stringify({attribute:btn.dataset.attr})});await refreshPlayerCareer();renderPlayerCareer()}catch(err){alert(err.message);btn.disabled=false}
  });
  app.querySelectorAll(".accept-player-offer").forEach(btn=>btn.onclick=async()=>{
    if(!confirm("Aceitar esta transferência?"))return;
    btn.disabled=true;
    try{
      const d=await api(`/api/player-career/offers/${btn.dataset.club}/accept`,{method:"POST",body:"{}"});
      await refreshPlayerCareer();renderPlayerCareer();
      alert(d.message||"Transferência confirmada para a próxima temporada.");
    }catch(err){alert(err.message);btn.disabled=false}
  });
}
function renderPlayerCareer(){
  if(!state.playerData||!state.playerCareer)return renderCreateClub();
  const pc=state.playerData.career;
  const body=state.playerView==="season"?playerSeasonView():
    state.playerView==="training"?playerTrainingView():
    state.playerView==="careers"?careersView():playerCareerHome();
  app.innerHTML=`<div class="shell">
    <header class="topbar"><div class="brand"><span class="logo">⚽</span>Dono do Clube</div>
      <div class="top-actions">
        <button class="career-top-btn" data-player-view="careers">${esc(pc.career_label||"Carreira de Jogador")}</button>
        <button id="playerManualSave" class="manual-save-btn">💾 SALVAR</button>
        <span class="coins">● ${Number(pc.balance).toLocaleString("pt-BR")}</span>
        <button id="logout" class="icon-btn">↪</button>
      </div>
    </header>${body}
  </div>
  <nav class="nav player-nav">
    <button data-player-view="home" class="${state.playerView==="home"?"on":""}">INÍCIO</button>
    <button data-player-view="season" class="${state.playerView==="season"?"on":""}">TEMPORADA</button>
    <button data-player-view="training" class="${state.playerView==="training"?"on":""}">TREINO</button>
    <button data-player-view="careers" class="${state.playerView==="careers"?"on":""}">CARREIRAS</button>
  </nav>`;
  app.querySelectorAll("[data-player-view]").forEach(btn=>btn.onclick=async()=>{
    state.playerView=btn.dataset.playerView;
    if(state.playerView==="careers")await refreshCareerList().catch(()=>{});
    renderPlayerCareer();
  });
  app.querySelector("#logout").onclick=logout;
  app.querySelector("#playerManualSave").onclick=async()=>{
    const b=app.querySelector("#playerManualSave");b.disabled=true;b.textContent="SALVANDO...";
    try{
      const d=await api("/api/player-career/manual-save",{method:"POST",body:"{}"});
      state.playerData.career.manual_saved_at=d.savedAt;
      b.textContent="✓ SALVO";
      setTimeout(()=>{const x=app.querySelector("#playerManualSave");if(x){x.disabled=false;x.textContent="💾 SALVAR"}},1400);
    }catch(err){alert(err.message);b.disabled=false;b.textContent="💾 SALVAR"}
  };
  bindPlayerCareer();
  if(state.playerView==="careers")bindCareers();
}

function careersView(){
  const careers=state.careers||[];
  const canCreate=careers.length<Number(state.maxCareers||10);
  return `<section class="card careers-page">
    <div class="section-title">
      <div><div class="kicker">SAVES</div><h2>Minhas carreiras</h2></div>
      <span class="badge blue">${careers.length}/${state.maxCareers||10}</span>
    </div>
    <p class="muted">Você pode misturar carreiras de clube e de jogador, em países diferentes. Cada save é totalmente independente.</p>
    <div class="career-grid">
      ${careers.map(c=>{
        const isPlayer=c.career_type==="player";
        const location=countryName(c.country_code||"BR");
        const title=isPlayer?(c.player_name||c.name):c.name;
        const subtitle=isPlayer?`${playerPositionLabel(c.player_position)} · ${c.club_name||"Clube"}`:locationLabel(c);
        const div=leagueLabel(c.user_division||"D",c.country_code||"BR");
        return `<article class="career-card ${c.is_active_career?"active":""}">
          <div class="career-card-top">
            <div class="career-slot">CARREIRA ${c.career_slot||"—"}</div>
            <span class="career-type-badge ${isPlayer?"player":"club"}">${isPlayer?"👤 JOGADOR":"🏟️ CLUBE"}</span>
          </div>
          <div class="career-head">
            ${isPlayer?`<div class="career-player-avatar">${esc(initials(title))}</div>`:crestHtml(c,"small")}
            <div><h3>${esc(c.career_label||`Carreira ${c.career_slot}`)}</h3><b>${esc(title)}</b><span>${esc(subtitle)} · ${esc(location)}</span></div>
          </div>
          <div class="career-stats">
            <span>Temporada <b>${c.season_no||1}</b></span>
            <span>${isPlayer?"Liga":"Divisão"} <b>${esc(div)}</b></span>
            <span>${isPlayer?"OVR":"Caixa"} <b>${isPlayer?Number(c.overall||c.team_rating||0):Number(c.coins||0).toLocaleString("pt-BR")}</b></span>
            <span>Último save manual <b>${esc(formatSaveDate(c.manual_saved_at))}</b></span>
          </div>
          <div class="career-actions">
            ${c.is_active_career?`<button class="primary" disabled>Carreira ativa</button>`:`<button class="primary activate-career" data-id="${c.id}" data-type="${c.career_type}">Jogar esta carreira</button>`}
            <button class="danger delete-career" data-id="${c.id}" data-type="${c.career_type}" data-name="${esc(title)}">Apagar</button>
          </div>
        </article>`;
      }).join("")}
      ${canCreate?`<button class="career-new" id="newCareer"><span>＋</span><b>Nova carreira</b><small>Clube ou jogador, em qualquer país disponível</small></button>`:""}
    </div>
    ${!canCreate?`<div class="msg">Você atingiu o limite de ${state.maxCareers||10} carreiras. Apague uma carreira para criar outra.</div>`:""}
  </section>`;
}
function newsView(){
  const news=state.mediaNews||[];
  const otherCats=new Set(["outros_clubes","goleada_outros"]);
  const clubNews=news.filter(n=>!otherCats.has(n.category));
  const otherNews=news.filter(n=>otherCats.has(n.category));
  const featured=clubNews[0]||news[0];

  return `<section class="newspaper">
    <div class="newspaper-masthead">
      <div class="kicker">EDIÇÃO DA CARREIRA</div>
      <h1>O Dono do Clube</h1>
      <p>${esc(state.club?.name||"Clube")} · Temporada ${state.competitions?.career?.season_no||1}</p>
    </div>

    ${featured?`<article class="news-featured importance-${featured.importance||1}">
      <div class="news-meta"><span>${esc(featured.source_name)}</span><span>${formatNewsDate(featured.created_at)}</span></div>
      <span class="news-category">${esc(mediaCategoryLabel(featured.category))}</span>
      <h2>${esc(featured.headline)}</h2>
      <p>${esc(featured.body)}</p>
    </article>`:`<div class="empty">As notícias da carreira aparecerão aqui após partidas e decisões importantes.</div>`}

    <div class="newspaper-section-head">
      <div><div class="kicker">SEU CLUBE</div><h2>Últimas notícias</h2></div>
    </div>
    <div class="news-grid">
      ${clubNews.filter(n=>!featured||String(n.id)!==String(featured.id)).map(n=>`<article class="news-card importance-${n.importance||1}">
        <div class="news-meta"><span>${esc(n.source_name)}</span><span>${formatNewsDate(n.created_at)}</span></div>
        <span class="news-category">${esc(mediaCategoryLabel(n.category))}</span>
        <h3>${esc(n.headline)}</h3>
        <p>${esc(n.body)}</p>
      </article>`).join("")||`<div class="empty">Ainda não há outras notícias do seu clube.</div>`}
    </div>

    <div class="newspaper-section-head other-clubs-head">
      <div><div class="kicker">GIRO DO FUTEBOL</div><h2>Notícias de outros clubes</h2></div>
      <span class="badge">${otherNews.length}</span>
    </div>
    <div class="news-grid other-clubs-news">
      ${otherNews.length?otherNews.map(n=>`<article class="news-card other-club-news importance-${n.importance||1}">
        <div class="news-meta"><span>${esc(n.source_name)}</span><span>${formatNewsDate(n.created_at)}</span></div>
        <span class="news-category">${esc(mediaCategoryLabel(n.category))}</span>
        <h3>${esc(n.headline)}</h3>
        <p>${esc(n.body)}</p>
      </article>`).join(""):`<div class="empty">As notícias dos rivais aparecerão conforme a temporada avança.</div>`}
    </div>
  </section>`;
}

function boardStatusLabel(status){
  return ({
    on_track:"Dentro da expectativa",
    attention:"Atenção",
    off_track:"Abaixo da expectativa"
  })[status]||"Em avaliação";
}
function boardToneLabel(tone){
  return ({positive:"POSITIVA",negative:"ALERTA",neutral:"INFORMATIVA"})[tone]||"DIRETORIA";
}
function boardView(){
  const ex=state.boardExpectation;
  const messages=state.boardMessages||[];
  if(!ex)return `<section class="card"><div class="empty">As expectativas da diretoria aparecerão quando a carreira estiver ativa.</div></section>`;

  return `<section class="board-page">
    <div class="board-hero">
      <div>
        <div class="kicker">CONSELHO DE ADMINISTRAÇÃO</div>
        <h1>Expectativa da Diretoria</h1>
        <p>${esc(ex.description)}</p>
      </div>
      <div class="board-status ${esc(ex.status)}">
        <small>SITUAÇÃO</small>
        <b>${esc(boardStatusLabel(ex.status))}</b>
      </div>
    </div>

    <div class="board-metrics">
      <div class="board-metric"><small>META DA TEMPORADA</small><b>${esc(ex.targetTitle)}</b><span>Alvo: até ${ex.targetPosition}º lugar</span></div>
      <div class="board-metric"><small>POSIÇÃO ATUAL</small><b>${ex.currentPosition}º</b><span>${esc(leagueLabel(state.competitions?.career?.user_division||"D",state.competitions?.career?.country_code))}</span></div>
      <div class="board-metric confidence"><small>CONFIANÇA DA DIRETORIA</small><b>${ex.confidence}%</b><div class="meter"><i style="width:${Math.max(0,Math.min(100,Number(ex.confidence||0)))}%"></i></div></div>
      <div class="board-metric pressure"><small>PRESSÃO DA MÍDIA</small><b>${ex.mediaPressure}%</b><div class="meter"><i style="width:${Math.max(0,Math.min(100,Number(ex.mediaPressure||0)))}%"></i></div></div>
    </div>

    <div class="card board-inbox">
      <div class="section-title">
        <div><div class="kicker">CAIXA DE ENTRADA</div><h2>Mensagens da diretoria</h2></div>
        <span class="badge">${messages.length}</span>
      </div>
      <p class="muted">A diretoria envia mensagens após títulos, eliminações, goleadas aplicadas e goleadas sofridas.</p>
      <div class="board-message-list">
        ${messages.length?messages.map(m=>`<article class="board-message tone-${esc(m.tone)} importance-${m.importance||1}">
          <div class="board-message-meta"><span>${esc(boardToneLabel(m.tone))}</span><span>${formatNewsDate(m.created_at)}</span></div>
          <h3>${esc(m.title)}</h3>
          <p>${esc(m.body)}</p>
        </article>`).join(""):`<div class="empty">Nenhuma mensagem da diretoria ainda.</div>`}
      </div>
    </div>
  </section>`;
}

function safProjectCard(){
  const saf=state.saf||{active:false,offers:[]};
  const car=state.competitions?.career;
  if(saf.active){
    const debt=Boolean(saf.debtRisk);
    const from=car?.user_division||"D",to=lowerDivision(from);
    return `<div class="saf-project active">
      <div class="kicker">PROJETO SAF ATIVO</div>
      <h3>${esc(saf.investorName||"Investidor SAF")}</h3>
      <div class="saf-stats"><span>Aporte inicial <b>${Number(saf.investment||0).toLocaleString("pt-BR")}</b></span><span>Desde a temporada <b>${saf.startedSeason||"—"}</b></span><span>Sanções por dívida <b>${saf.debtRelegations||0}</b></span></div>
      <p>A venda é permanente nesta carreira. A SAF aumenta o poder de investimento, mas existe uma cláusula financeira: <b>se o clube terminar a temporada com saldo negativo, sofre rebaixamento administrativo de uma divisão.</b></p>
      ${debt?`<div class="saf-risk">⚠️ O clube está no vermelho. Se a temporada terminar assim, ${from==="D"?"o time permanecerá na divisão mais baixa sob sanção":`cairá de ${esc(leagueLabel(from,car?.country_code))} para ${esc(leagueLabel(to,car?.country_code))}`}.</div>`:`<div class="saf-ok">✓ Situação financeira regular. Nenhuma sanção prevista.</div>`}
    </div>`;
  }
  return `<div class="saf-project">
    <div class="kicker">VENDA DO CLUBE</div><h3>Projeto SAF</h3>
    <p class="muted">Venda o controle do clube para um investidor e receba um grande aporte imediato. A contrapartida é permanente: se uma SAF fechar qualquer temporada devendo, sofre rebaixamento administrativo.</p>
    <div class="saf-offers">${(saf.offers||[]).map(o=>`<button type="button" class="saf-offer" data-saf="${esc(o.id)}">
      <b>${esc(o.name)}</b><span>${esc(o.profile)}</span><strong>+${Number(o.investment).toLocaleString("pt-BR")} moedas</strong>
    </button>`).join("")}</div>
  </div>`;
}

function clubView(){
  const c=state.club;
  return `<section class="custom-grid">
    <div class="card"><div id="clubPreview" class="club-preview" style="background:linear-gradient(135deg,${c.primary_color},${c.secondary_color})">
      <div><div id="crestPreview" class="preview-crest">${c.crest_data?`<img src="${c.crest_data}" alt="">`:esc(initials(c.name))}</div>
      <h2 id="namePreview">${esc(c.name)}</h2><p>${esc(locationLabel(c))}</p><p>Código: <b>${esc(c.friend_code||"")}</b></p></div>
    </div></div>
    <div class="card"><div class="kicker">Identidade do clube</div><h2>Personalização</h2>
      <form id="customForm" class="stack">
        <div class="rename-box">
          <b>Mudar nome do clube</b>
          <span class="muted">Você pode alterar o nome a qualquer momento.</span>
          <label>Novo nome<input id="customName" value="${esc(c.name)}" maxlength="30" required></label>
        </div>
        ${String(c.name||"").trim().toLowerCase()==="felipe"?`<div class="felipe-banner">⚡ MODO FELIPE ATIVO — elenco 100 e goleadas especiais.</div>`:""}
        <label>País<input value="${esc(countryName(c.country_code||"BR"))}" disabled></label>
        ${(c.country_code||"BR")==="BR"?`<label>Estado<input value="${esc(STATES[c.state_code])}" disabled></label>`:""}
        <div class="colors"><label>Cor principal<input id="customPrimary" type="color" value="${c.primary_color}"></label>
        <label>Cor secundária<input id="customSecondary" type="color" value="${c.secondary_color}"></label></div>
        <label class="filebox">Escudo<input id="crestFile" type="file" accept="image/png,image/jpeg,image/webp"><span class="muted">PNG, JPG ou WebP.</span></label>
        <div style="display:flex;gap:8px"><button type="button" id="removeCrest" class="secondary">Remover escudo</button><button class="primary" style="flex:1">Salvar nome e personalização</button></div>
        <div id="customMsg"></div>
      </form>

      ${safProjectCard()}
      <div class="club-trophy-section"><div class="kicker">GALERIA DE TROFÉUS</div><h3>Conquistas do clube</h3>${trophyCards(state.trophies||[])}</div>

      <div class="danger-zone">
        <div>
          <div class="kicker danger-kicker">ZONA DE PERIGO</div>
          <h3>Apagar time e reiniciar do início</h3>
          <p class="muted">Apaga este clube, elenco, partidas, finanças e progresso esportivo. As outras carreiras da conta continuam intactas.</p>
        </div>
        <button type="button" id="deleteClub" class="danger">Apagar meu time</button>
      </div>
    </div>
  </section>`;
}

async function manualSaveCareer(){
  const btn=app.querySelector("#manualSave");
  if(!btn||!state.club)return;

  const original=btn.textContent;
  btn.disabled=true;
  btn.textContent="SALVANDO...";

  try{
    const payload={};

    if(state.view==="squad"||state.view==="starters"){
      const starters=state.players.filter(p=>p.is_starter).map(p=>p.id);
      const select=app.querySelector(state.view==="starters"?"#starterFormation":"#formation");
      const formation=selectedFormationValue(select)||state.club.formation;
      if(starters.length===11){
        payload.starterIds=starters;
        payload.formation=formation;
      }
    }

    const d=await api("/api/career/manual-save",{
      method:"POST",
      body:JSON.stringify(payload)
    });

    if(state.competitions?.career)state.competitions.career.manual_saved_at=d.savedAt;
    await refreshCareerList().catch(()=>{});

    btn.textContent="✓ SALVO";
    btn.classList.add("saved");
    btn.title=`Último salvamento: ${formatSaveDate(d.savedAt)}`;

    setTimeout(()=>{
      const current=app.querySelector("#manualSave");
      if(current){
        current.disabled=false;
        current.textContent="💾 SALVAR";
        current.classList.remove("saved");
      }
    },1600);
  }catch(err){
    alert(err.message);
    btn.disabled=false;
    btn.textContent=original;
  }
}

function render(){
  if(!state.me)return renderAuth();
  if(state.activeType==="player"&&state.playerCareer)return renderPlayerCareer();
  if(!state.club)return renderCreateClub();
  if((state.club.country_code||"BR")==="BR"&&!state.club.state_code)return renderStateSetup();

  const body=state.view==="starters"?startersView():
    state.view==="squad"?squadView():
    state.view==="market"?marketView():
    state.view==="news"?newsView():
    state.view==="board"?boardView():
    state.view==="realism"?realismView():
    state.view==="friends"?friendsView():
    state.view==="league"?competitionsView():
    state.view==="club"?clubView():
    state.view==="careers"?careersView():homeView();

  app.innerHTML=`<div class="shell">
    <header class="topbar"><div class="brand"><span class="logo">⚽</span>Dono do Clube</div>
      <div class="top-actions">
        <button class="career-top-btn" data-view="careers">${esc(state.club.career_label||`Carreira ${state.club.career_slot||1}`)}</button>
        ${(state.realism?.managerOffers||[]).length?`<button class="notification-top-btn" data-view="realism" title="Propostas de outros clubes">📩 ${(state.realism.managerOffers||[]).length}</button>`:""}
        <button id="manualSave" class="manual-save-btn" title="Salvar a carreira agora">💾 SALVAR</button>
        <span class="coins">● ${Number(state.club.coins).toLocaleString("pt-BR")}</span><button id="logout" class="icon-btn">↪</button>
      </div>
    </header>${body}
  </div>
  <nav class="nav">
    <button data-view="home" class="${state.view==="home"?"on":""}">INÍCIO</button>
    <button data-view="news" class="${state.view==="news"?"on":""}">JORNAL</button>
    <button data-view="board" class="${state.view==="board"?"on":""}">DIRETORIA</button>
    <button data-view="starters" class="${state.view==="starters"?"on":""}">TITULARES</button>
    <button data-view="squad" class="${state.view==="squad"?"on":""}">ELENCO</button>
    <button data-view="realism" class="${state.view==="realism"?"on":""}">GESTÃO</button>
    <button data-view="market" class="${state.view==="market"?"on":""}">MERCADO</button>
    <button data-view="friends" class="${state.view==="friends"?"on":""}">AMIGOS</button>
    <button data-view="league" class="${state.view==="league"?"on":""}">COMPETIÇÕES</button>
    <button data-view="club" class="${state.view==="club"?"on":""}">CLUBE</button>
    <button data-view="careers" class="${state.view==="careers"?"on":""}">CARREIRAS</button>
  </nav>`;

  app.querySelectorAll("[data-view]").forEach(b=>b.onclick=async()=>{
    state.view=b.dataset.view;
    if(state.view==="careers"){
      try{await refreshCareerList()}catch{}
    }
    render();
  });
  app.querySelector("#logout").onclick=logout;
  const saveBtn=app.querySelector("#manualSave");
  if(saveBtn)saveBtn.onclick=manualSaveCareer;
  if(state.view==="home")bindHome();
  if(state.view==="starters")bindStarters();
  if(state.view==="squad")bindSquad();
  if(state.view==="realism")bindRealism();
  if(state.view==="market")bindMarket();
  if(state.view==="friends")bindFriends();
  if(state.view==="league")bindCompetitions();
  if(state.view==="club")bindClub();
  if(state.view==="careers")bindCareers();
}

function maybeShowPressConference(){
  const press=state.pendingPress;
  if(!press||document.querySelector(".modal-bg"))return;
  const bg=document.createElement("div");
  bg.className="modal-bg press-modal-bg";
  bg.innerHTML=`<div class="modal press-modal">
    <div class="press-banner"><div class="press-mics">🎙️ 🎤 🎙️</div><div><div class="kicker">COLETIVA DE IMPRENSA</div><h2>${esc(press.title||"Coletiva pós-jogo")}</h2></div></div>
    <div class="press-question"><span>${esc(press.context?.competition||"Imprensa")}</span><p>${esc(press.question)}</p></div>
    <div class="press-answers">
      <button data-press-answer="responsibility"><b>Assumir responsabilidade</b><span>Torcida +250 · Moral +3 · Diretoria +4 · Pressão da mídia -2</span></button>
      <button data-press-answer="protect_squad"><b>Proteger o elenco</b><span>Moral +7 · Torcida +60 · Diretoria -1 · Pressão da mídia -3</span></button>
      <button data-press-answer="demand_reaction"><b>Cobrar reação</b><span>Torcida +320 · Moral -3 · Diretoria +1 · Pressão da mídia +4</span></button>
    </div>
    <p class="press-consequence-note">Sua resposta altera de verdade o ambiente do clube e pode afetar a confiança da diretoria, o moral do elenco e a pressão da imprensa.</p>
  </div>`;
  document.body.appendChild(bg);
  bg.querySelectorAll("[data-press-answer]").forEach(btn=>btn.onclick=async()=>{
    bg.querySelectorAll("button").forEach(x=>x.disabled=true);
    try{
      const d=await api(`/api/press-conferences/${press.id}/respond`,{method:"POST",body:JSON.stringify({answerKey:btn.dataset.pressAnswer})});
      bg.remove();
      await refreshAll();
      render();
      alert(`${d.headline||"Coletiva concluída."}\n\n${d.consequence||""}\nTorcida: ${d.fansDelta>=0?"+":""}${d.fansDelta||0} · Moral: ${d.moraleDelta>=0?"+":""}${d.moraleDelta||0} · Diretoria: ${d.boardDelta>=0?"+":""}${d.boardDelta||0} · Pressão: ${d.pressureDelta>=0?"+":""}${d.pressureDelta||0}`);
    }catch(err){
      alert(err.message);
      bg.querySelectorAll("button").forEach(x=>x.disabled=false);
    }
  });
}

function showMatch(m){
  if(!m)return;
  const bg=document.createElement("div");bg.className="modal-bg";
  bg.innerHTML=`<div class="modal">
    <div class="modal-head"><div><div class="kicker">${esc(m.matchType||"Partida")}</div><h2 style="margin:3px 0">${m.reward?`+${m.reward} moedas`:""}</h2></div>
    <button class="secondary close-modal">Fechar</button></div>
    <div class="board"><span>${esc(m.userClub)}<br><small class="muted">OVR ${m.userRating}</small></span><b>${m.userGoals} × ${m.opponentGoals}</b>
    <span>${esc(m.opponent)}<br><small class="muted">OVR ${m.opponentRating}</small></span></div>
    <div class="match-realism-meta">
      <span>${m.isHome?"🏟️ Casa":"✈️ Fora"}</span>
      ${m.attendance?`<span>👥 Público ${Number(m.attendance).toLocaleString("pt-BR")}</span>`:""}
      ${m.congestionDays!=null?`<span>📅 ${m.congestionDays} dia(s) desde o jogo anterior</span>`:""}
      ${m.travelLoad?`<span>🧳 Desgaste de viagem +${m.travelLoad}</span>`:""}
      ${m.isRival?`<span>🔥 CLÁSSICO</span>`:""}
    </div>
    ${m.finance?`<div class="finance-match"><span>Patrocínio: pagamento mensal</span><span>Bilheteria +${Number(m.finance.gate).toLocaleString("pt-BR")}</span><span>Resultado +${Number(m.finance.performance).toLocaleString("pt-BR")}</span><span>Salários: pagamento mensal pelo calendário</span><b>Receita líquida desta partida ${Number(m.finance.net)>=0?"+":""}${Number(m.finance.net).toLocaleString("pt-BR")}</b></div>${m.finance.event?`<div class="msg ok"><b>${esc(m.finance.event.title)}</b><br>${esc(m.finance.event.description)}</div>`:""}`:""}
    ${m.substitutions?.length?`<div class="substitution-summary"><b>🔄 Substituições (${m.substitutions.length}/5)</b>${m.substitutions.map(x=>`<span>${x.minute}' · ${esc(x.text)}</span>`).join("")}</div>`:""}
    <h3>Lances</h3>${m.events?.length?m.events.map(e=>`<div class="event ${e.type==="substitution"?"sub-event":""}"><b>${e.minute}'</b> ${esc(e.text)}</div>`).join(""):`<div class="empty">Sem lances relevantes.</div>`}
  </div>`;
  document.body.appendChild(bg);
  const closeMatch=()=>{bg.remove();setTimeout(maybeShowPressConference,120)};
  bg.querySelector(".close-modal").onclick=closeMatch;
  bg.onclick=e=>{if(e.target===bg)closeMatch()};
}

async function showClub(id){
  try{
    const d=await api(`/api/clubs/${id}`),c=d.club,bg=document.createElement("div");bg.className="modal-bg";
    bg.innerHTML=`<div class="modal">
      <div class="modal-head"><div class="friend-top">${crestHtml(c,"medium")}<div><h2 style="margin:2px 0">${esc(c.name)}</h2>
      <span class="muted">${c.state_code?esc(STATES[c.state_code]):esc(countryName(c.country_code||"BR"))} · OVR ${c.team_rating}</span></div></div><button class="secondary close-modal">Fechar</button></div>
      <h3>Elenco</h3><div class="club-modal-player head"><span>Jogador</span><span>OVR</span><span>J</span><span>G</span><span>A</span></div>
      ${d.players.map(p=>`<div class="club-modal-player"><span>${p.is_starter?"★ ":""}${esc(p.name)} · ${posName(p.position)}</span><b>${p.rating}</b><span>${p.appearances}</span><span>${p.goals}</span><span>${p.assists}</span></div>`).join("")}
    </div>`;
    document.body.appendChild(bg);bg.querySelector(".close-modal").onclick=()=>bg.remove();bg.onclick=e=>{if(e.target===bg)bg.remove()};
  }catch(err){alert(err.message)}
}

async function careerAction(action){
  const endpoints={
    state:"/api/state/play-next",
    national:"/api/national/play-round",
    copa:"/api/copa/play-next",
    lib:"/api/libertadores/play-next",
    champions:"/api/champions/play-next",
    world:"/api/club-world-cup/play-next",
    next:"/api/career/next-season"
  };
  try{
    const d=await api(endpoints[action],{method:"POST",body:"{}"});
    await refreshAll();render();
    if(action==="next"&&d.career?.safPenalty?.applied){
      const p=d.career.safPenalty;
      alert(p.from===p.to
        ?`A SAF encerrou a temporada com dívida. Como o clube já estava na divisão mais baixa, permaneceu nela sob sanção administrativa.`
        :`A SAF encerrou a temporada com dívida. Rebaixamento administrativo aplicado: ${leagueLabel(p.from,state.club?.country_code)} → ${leagueLabel(p.to,state.club?.country_code)}.`);
    }
    if(d.userMatch)showMatch(d.userMatch);
    else setTimeout(maybeShowPressConference,150);
  }catch(err){
    alert(err.message);
    await refreshAll().catch(()=>{});
    render();
  }
}

function bindLoanPurchaseButtons(){
  bindLoanPurchaseButtons();
}

function bindManagerOfferButtons(){
  app.querySelectorAll(".decline-manager-offer").forEach(btn=>btn.onclick=async()=>{
    btn.disabled=true;
    try{
      await api(`/api/manager-offers/${btn.dataset.id}/decline`,{method:"POST",body:"{}"});
      await refreshAll();render();
    }catch(err){alert(err.message);btn.disabled=false}
  });

  app.querySelectorAll(".accept-manager-offer").forEach(btn=>btn.onclick=async()=>{
    const offer=(state.realism?.managerOffers||[]).find(x=>String(x.id)===String(btn.dataset.id));
    if(!offer)return;
    if(!confirm(`Aceitar a proposta do ${offer.club_name}?\n\nVocê deixará o clube atual e assumirá a situação esportiva do novo time nesta mesma carreira. O antigo clube continuará controlado pela IA.`))return;
    btn.disabled=true;btn.textContent="ASSUMINDO...";
    try{
      const d=await api(`/api/manager-offers/${btn.dataset.id}/accept`,{method:"POST",body:"{}"});
      state.view="home";
      await bootstrap();
      alert(`Novo trabalho: você deixou ${d.from} e assumiu ${d.to}.`);
    }catch(err){alert(err.message);btn.disabled=false;btn.textContent="Aceitar cargo"}
  });
}

function bindRealism(){
  bindManagerOfferButtons();

  const tactics=app.querySelector("#realismTactics");
  if(tactics)tactics.onsubmit=async e=>{
    e.preventDefault();
    const btn=e.target.querySelector("button.primary");
    btn.disabled=true;btn.textContent="SALVANDO...";
    try{
      await api("/api/realism/tactics",{method:"PUT",body:JSON.stringify({
        pressing:app.querySelector("#tacticPressing").value,
        defensiveLine:app.querySelector("#tacticLine").value,
        tempo:app.querySelector("#tacticTempo").value,
        width:app.querySelector("#tacticWidth").value,
        style:app.querySelector("#tacticStyle").value,
        marking:app.querySelector("#tacticMarking").value
      })});
      await refreshAll();state.view="realism";render();
    }catch(err){alert(err.message);btn.disabled=false;btn.textContent="Salvar instruções"}
  };

  app.querySelectorAll(".save-player-realism").forEach(btn=>btn.onclick=async()=>{
    const row=btn.closest("[data-realism-player]");
    if(!row)return;
    btn.disabled=true;btn.textContent="SALVANDO...";
    try{
      await api(`/api/realism/players/${btn.dataset.id}`,{method:"PUT",body:JSON.stringify({
        squadStatus:row.querySelector(".rp-status").value,
        tacticalRole:row.querySelector(".rp-role").value,
        setPieceRole:row.querySelector(".rp-setpiece").value,
        isCaptain:row.querySelector(".rp-captain").checked,
        isBench:row.querySelector(".rp-bench")?.checked||false
      })});
      await refreshAll();state.view="realism";render();
    }catch(err){alert(err.message);btn.disabled=false;btn.textContent="Salvar"}
  });

  app.querySelectorAll(".upgrade-staff").forEach(btn=>btn.onclick=async()=>{
    if(!confirm("Investir para melhorar este profissional da comissão técnica?"))return;
    btn.disabled=true;
    try{
      await api(`/api/realism/staff/${btn.dataset.role}/upgrade`,{method:"POST",body:"{}"});
      await refreshAll();state.view="realism";render();
    }catch(err){alert(err.message);btn.disabled=false}
  });

  app.querySelectorAll(".promote-youth").forEach(btn=>btn.onclick=async()=>{
    if(!confirm("Promover este jogador da base ao elenco profissional?"))return;
    btn.disabled=true;
    try{
      const d=await api(`/api/realism/academy/${btn.dataset.id}/promote`,{method:"POST",body:"{}"});
      await refreshAll();state.view="realism";render();
      alert(`${d.player.name} foi promovido ao time profissional.`);
    }catch(err){alert(err.message);btn.disabled=false}
  });

  app.querySelectorAll(".release-youth").forEach(btn=>btn.onclick=async()=>{
    if(!confirm(`Dispensar ${btn.dataset.name||"este jogador"} das categorias de base?`))return;
    btn.disabled=true;
    try{
      await api(`/api/realism/academy/${btn.dataset.id}/release`,{method:"POST",body:"{}"});
      await refreshAll();state.view="realism";render();
    }catch(err){alert(err.message);btn.disabled=false}
  });

  const stadium=app.querySelector("#stadiumForm");
  if(stadium)stadium.onsubmit=async e=>{
    e.preventDefault();
    const submitter=e.submitter;
    const upgrade=submitter?.value==="upgrade";
    if(upgrade&&!confirm("Ampliar o estádio em 5.000 lugares?"))return;
    if(submitter)submitter.disabled=true;
    try{
      const d=await api("/api/realism/stadium",{method:"PUT",body:JSON.stringify({
        ticketPrice:Number(app.querySelector("#ticketPrice").value||30),
        upgrade
      })});
      await refreshAll();state.view="realism";render();
      if(upgrade)alert(`Estádio ampliado para ${Number(d.capacity).toLocaleString("pt-BR")} lugares.`);
    }catch(err){alert(err.message);if(submitter)submitter.disabled=false}
  };
}

function bindHome(){
  bindManagerOfferButtons();
  const b=app.querySelector("#careerAction");
  if(b)b.onclick=async()=>{b.disabled=true;b.textContent=b.dataset.action==="national"?"SIMULANDO RODADA...":"SIMULANDO...";await careerAction(b.dataset.action)};

  const fullSeason=app.querySelector("#simulateFullSeason");
  if(fullSeason)fullSeason.onclick=async()=>{
    if(!confirm("Simular todos os jogos restantes desta temporada?\n\nA temporada será concluída de uma vez, incluindo competições restantes. Esta ação não pode ser desfeita."))return;
    fullSeason.disabled=true;
    fullSeason.textContent="SIMULANDO TEMPORADA...";
    try{
      const d=await api("/api/career/simulate-season",{method:"POST",body:"{}"});
      await refreshAll();
      render();
      if(d.alreadyFinished)alert("Esta temporada já estava encerrada.");
      else alert(`Temporada simulada até o fim.\nPosição final: ${d.position}º\nJogos simulados: ${d.simulatedMatches||0}`);
    }catch(err){
      alert(err.message);
      fullSeason.disabled=false;
      fullSeason.textContent="⏩ SIMULAR TEMPORADA INTEIRA";
    }
  };

  const gs=app.querySelector("#goSquad");if(gs)gs.onclick=()=>{state.view="squad";render()};
  const news=app.querySelector("#goNews");if(news)news.onclick=()=>{state.view="news";render()};
  const cup=app.querySelector("#playCopaHome");if(cup)cup.onclick=async()=>{cup.disabled=true;await careerAction("copa")};
  const world=app.querySelector("#goWorldCompetition");if(world)world.onclick=()=>{state.view="league";state.competitionTab="WORLD";render()};
  app.querySelectorAll(".buy-loan-option").forEach(btn=>btn.onclick=async()=>{
    const loanId=btn.dataset.loan;
    const name=btn.dataset.name||"jogador";
    const price=Number(btn.dataset.price||0);
    if(!confirm(`Exercer a opção de compra de ${name} por ${price.toLocaleString("pt-BR")} moedas?\n\nO pagamento é à vista e o jogador passa a pertencer definitivamente ao clube.`))return;
    btn.disabled=true;
    btn.textContent="COMPRANDO...";
    try{
      const d=await api(`/api/transfers/loans/${loanId}/buy`,{method:"POST",body:"{}"});
      await refreshAll();
      render();
      alert(`${d.playerName} foi comprado em definitivo por ${Number(d.price).toLocaleString("pt-BR")} moedas.`);
    }catch(err){
      alert(err.message);
      btn.disabled=false;
      btn.textContent=`Comprar por ${price.toLocaleString("pt-BR")}`;
    }
  });
  app.querySelectorAll(".sponsor-offer").forEach(btn=>btn.onclick=async()=>{
    const sponsor=(state.sponsorship?.offers||[]).find(x=>x.id===btn.dataset.sponsor);
    if(!sponsor)return;
    if(!confirm(`Assinar com ${sponsor.name}?\n\nCategoria: ${sponsor.category||"Patrocinador"}\n${Number(sponsor.monthly).toLocaleString("pt-BR")} moedas por mês\nLuvas: ${Number(sponsor.signing).toLocaleString("pt-BR")} moedas\n\nSeu clube pode ter até 2 patrocinadores ativos.`))return;
    btn.disabled=true;
    try{
      const d=await api("/api/sponsorships/sign",{method:"POST",body:JSON.stringify({sponsorId:sponsor.id})});
      await refreshAll();render();
      alert(`${d.name} assinou com o clube.\n\nPatrocínios ativos: ${d.activeCount}/${d.maxActive}`);
    }catch(err){alert(err.message);btn.disabled=false}
  });
  if(state.pendingPress)setTimeout(maybeShowPressConference,350);
}
function openStarterSwap(starterId){
  const starter=state.players.find(p=>String(p.id)===String(starterId));
  if(!starter)return;
  const reserves=compatibleReserves(starter);

  const bg=document.createElement("div");
  bg.className="modal-bg";
  bg.innerHTML=`<div class="modal lineup-swap-modal">
    <div class="modal-head">
      <div>
        <div class="kicker">SUBSTITUIR TITULAR</div>
        <h2>${esc(starter.name)}</h2>
        <span class="muted">${esc(starter.role||posName(starter.position))} · OVR ${starter.rating}</span>
      </div>
      <button class="secondary close-modal">Fechar</button>
    </div>

    <p class="muted">Escolha abaixo quem entra no lugar dele. Só aparecem jogadores compatíveis e sem lesão.</p>

    <div class="swap-options">
      ${reserves.length?reserves.map(p=>`<button type="button" class="swap-option" data-reserve-id="${p.id}">
        <span class="swap-rating">${p.rating}</span>
        <span class="swap-info"><b>${esc(p.name)}</b><small>${esc(p.role||posName(p.position))} · físico ${p.fitness??100}% · moral ${p.morale??70}</small></span>
        <span class="swap-arrow">ENTRAR →</span>
      </button>`).join(""):`<div class="empty">Não há reserva disponível para esta posição.</div>`}
    </div>
  </div>`;

  document.body.appendChild(bg);
  bg.querySelector(".close-modal").onclick=()=>bg.remove();
  bg.onclick=e=>{if(e.target===bg)bg.remove()};
  bg.querySelectorAll(".swap-option").forEach(btn=>btn.onclick=()=>{
    if(swapStarter(starter.id,btn.dataset.reserveId)){
      bg.remove();
      render();
    }
  });
}

function bindStarters(){
  const formation=app.querySelector("#starterFormation");
  bindCustomFormation("starter",formation);

  const best=app.querySelector("#starterBestSquad");
  if(best)best.onclick=()=>{
    const currentFormation=selectedFormationValue(formation);
    if(!currentFormation){alert("Aplique primeiro a formação personalizada.");return}
    const complete=selectBestSquad(currentFormation);
    if(!complete){
      alert("Não há 11 jogadores disponíveis para montar a escalação.");
      return;
    }
    state.club.formation=currentFormation;
    render();
  };

  const rotate=app.querySelector("#starterRotateSquad");
  if(rotate)rotate.onclick=()=>{
    const currentFormation=selectedFormationValue(formation);
    if(!currentFormation){alert("Aplique primeiro a formação personalizada.");return}
    if(!suggestRotation(currentFormation)){
      alert("Não há jogadores saudáveis suficientes nas posições exigidas por essa formação.");
      return;
    }
    state.club.formation=currentFormation;
    render();
  };

  app.querySelectorAll("[data-swap-id]").forEach(el=>el.onclick=()=>openStarterSwap(el.dataset.swapId));

  const save=app.querySelector("#saveStarters");
  if(save)save.onclick=async()=>{
    const starterIds=state.players.filter(p=>p.is_starter).map(p=>p.id);
    if(starterIds.length!==11){
      alert("A escalação precisa ter exatamente 11 titulares.");
      return;
    }
    save.disabled=true;
    save.textContent="SALVANDO...";
    try{
      const formationValue=selectedFormationValue(formation);
      if(!formationValue){
        alert("Aplique primeiro a formação personalizada.");
        save.disabled=false;
        save.textContent="💾 Salvar escalação";
        return;
      }
      await api("/api/lineup",{method:"PUT",body:JSON.stringify({
        starterIds,
        formation:formationValue
      })});
      state.lineupDirty=false;
      await refreshAll();
      state.view="starters";
      render();
    }catch(err){
      alert(err.message);
      save.disabled=false;
      save.textContent="💾 Salvar escalação";
    }
  };

  const full=app.querySelector("#goFullSquad");
  if(full)full.onclick=()=>{
    state.view="squad";
    render();
  };
}
function bindSquad(){
  const formation=app.querySelector("#formation");
  bindCustomFormation("squad",formation);
  const best=app.querySelector("#bestSquad");
  if(best)best.onclick=()=>{
    const currentFormation=selectedFormationValue(formation);
    if(!currentFormation){alert("Aplique primeiro a formação personalizada.");return}
    const complete=selectBestSquad(currentFormation);
    if(!complete){
      alert("Não há 11 jogadores disponíveis para montar a escalação.");
      return;
    }
    // Mantém a formação escolhida após renderizar.
    state.club.formation=currentFormation;
    render();
  };

  const rotate=app.querySelector("#rotateSquad");
  if(rotate)rotate.onclick=()=>{
    const currentFormation=selectedFormationValue(formation);
    if(!currentFormation){alert("Aplique primeiro a formação personalizada.");return}
    if(!suggestRotation(currentFormation)){
      alert("Não há jogadores saudáveis suficientes nas posições exigidas por essa formação.");
      return;
    }
    state.club.formation=currentFormation;
    render();
  };
  app.querySelectorAll(".toggle-player").forEach(b=>b.onclick=()=>{
    const p=state.players.find(x=>String(x.id)===String(b.dataset.id));if(!p)return;
    if(Number(p.injury_games||0)>0&&!p.is_starter){alert(`${p.name} está lesionado por ${p.injury_games} jogo(s).`);return}
    if(Number(p.suspension_games||0)>0&&!p.is_starter){alert(`${p.name} está suspenso por ${p.suspension_games} jogo(s).`);return}
    if(!p.is_starter&&state.players.filter(x=>x.is_starter).length>=11){alert("Já existem 11 titulares.");return}
    if(!p.is_starter&&p.position==="GK"&&state.players.some(x=>x.is_starter&&x.position==="GK")){
      alert("A escalação pode ter apenas um goleiro titular.");
      return;
    }
    p.is_starter=!p.is_starter;state.lineupDirty=true;render();
  });
  app.querySelectorAll(".list-player").forEach(b=>b.onclick=async()=>{
    const p=state.players.find(x=>String(x.id)===String(b.dataset.id));if(!p)return;
    try{
      await api(`/api/players/${p.id}/transfer-list`,{method:"POST",body:JSON.stringify({listed:!p.transfer_listed})});
      await refreshAll();render();
    }catch(err){alert(err.message)}
  });
  app.querySelectorAll(".release-player").forEach(b=>b.onclick=async()=>{
    const p=state.players.find(x=>String(x.id)===String(b.dataset.id));
    const severance=Math.max(100,Number(p?.salary||0)*2);
    if(!p||!confirm(`Rescindir com ${p.name}? A multa de rescisão será de ${severance.toLocaleString("pt-BR")} moedas.`))return;
    try{await api(`/api/players/${p.id}/release`,{method:"POST",body:"{}"});await refreshAll();render()}catch(err){alert(err.message)}
  });
  app.querySelector("#saveLineup").onclick=async()=>{
    try{
      const formationValue=selectedFormationValue(formation);
      if(!formationValue){alert("Aplique primeiro a formação personalizada.");return}
      await api("/api/lineup",{method:"PUT",body:JSON.stringify({
        starterIds:state.players.filter(p=>p.is_starter).map(p=>p.id),
        formation:formationValue
      })});
      state.lineupDirty=false;
      await refreshAll();render();
    }catch(err){alert(err.message)}
  };
}
function readTransferSearchFilters(){
  const filters={
    name:String(app.querySelector("#searchName")?.value||"").trim(),
    position:String(app.querySelector("#searchPosition")?.value||""),
    minRating:Math.max(40,Math.min(100,Number(app.querySelector("#searchMinRating")?.value||58))),
    maxPrice:Math.max(0,Number(app.querySelector("#searchMaxPrice")?.value||500000)),
    realOnly:Boolean(app.querySelector("#searchRealOnly")?.checked)
  };
  state.transferSearch=filters;
  return filters;
}

async function searchTransfers(){
  const filters=readTransferSearchFilters();
  const qv=encodeURIComponent(filters.name);
  const pos=encodeURIComponent(filters.position);
  const min=encodeURIComponent(filters.minRating);
  const max=encodeURIComponent(filters.maxPrice);
  const realOnly=filters.realOnly?"1":"0";

  const box=app.querySelector("#transferResults");
  const msg=app.querySelector("#transferMsg");
  const btn=app.querySelector("#transferSearchBtn");

  if(btn){
    btn.disabled=true;
    btn.textContent="PESQUISANDO...";
  }
  if(msg)msg.innerHTML="";
  if(box)box.innerHTML=`<div class="empty">Procurando jogadores...</div>`;

  try{
    if(typeof api!=="function") throw new Error("Sistema de pesquisa indisponível.");
    const d=await api(`/api/transfers/search?q=${qv}&position=${pos}&minRating=${min}&maxPrice=${max}&realOnly=${realOnly}`);
    state.transferResults=d.players||[];
    state.marketProfile=d.marketProfile||state.marketProfile;
    state.transferWindow=d.transferWindow||state.transferWindow;
    state.scoutLevel=Number(d.scoutLevel||state.scoutLevel||1);
    if(state.finance&&d.transferBan)state.finance.transferBan=d.transferBan;

    // Atualiza somente a área dos resultados. Não renderiza a aba inteira.
    const liveBox=app.querySelector("#transferResults");
    if(liveBox)liveBox.innerHTML=transferCards();
    bindTransferButtons();

    if(msg){
      const count=state.transferResults.length;
      msg.innerHTML=`<div class="msg ok">${count} jogador(es) encontrado(s)${filters.position?` para ${esc(filters.position)}`:""}.</div>`;
    }
  }catch(err){
    const liveBox=app.querySelector("#transferResults");
    if(liveBox)liveBox.innerHTML=`<div class="msg">${esc(err.message)}</div>`;
  }finally{
    const liveBtn=app.querySelector("#transferSearchBtn");
    if(liveBtn){
      liveBtn.disabled=false;
      liveBtn.textContent="Pesquisar";
    }
  }
}
function bindTransferButtons(){
  app.querySelectorAll(".scout-player").forEach(b=>b.onclick=async()=>{
    b.disabled=true;b.textContent="OBSERVANDO...";
    try{
      const d=await api(`/api/scouting/${b.dataset.id}`,{method:"POST",body:"{}"});
      await searchTransfers();
      alert(`Relatório concluído: ${d.playerName} tem OVR ${d.rating}.`);
    }catch(err){alert(err.message);b.disabled=false}
  });
  app.querySelectorAll(".negotiate-player").forEach(b=>b.onclick=()=>{
    const p=state.transferResults.find(x=>String(x.id)===String(b.dataset.id));
    if(p)openTransferOffer(p);
  });
  app.querySelectorAll(".loan-player").forEach(b=>b.onclick=()=>{
    const p=state.transferResults.find(x=>String(x.id)===String(b.dataset.id));
    if(p)openLoanOffer(p);
  });
}
function openTransferOffer(p){
  const fee=Number(p.asking_price||0);
  const salary=Math.max(Number(p.suggested_salary||0),Math.round(Number(p.suggested_salary||0)*1.1/10)*10);
  const bg=document.createElement("div");bg.className="modal-bg";
  const installmentOptions=p.source_club_id
    ?[1,2,3,4,6,8,10,12,18,24].map(n=>`<option value="${n}">${n}x${n===1?" à vista":""}</option>`).join("")
    :`<option value="1">À vista</option>`;

  bg.innerHTML=`<div class="modal">
    <div class="modal-head"><div><div class="kicker">NEGOCIAÇÃO DE COMPRA</div><h2>${esc(p.name)}</h2><span class="muted">${esc(p.source_club_name||"Jogador livre")} · ${esc(p.role||p.position)} · OVR ${p.rating}</span></div><button class="secondary close-modal">Fechar</button></div>
    <form id="offerForm" class="stack" style="margin-top:16px">
      <label>Oferta total ao clube<input id="offerFee" type="number" min="0" value="${fee}"></label>
      <label>Forma de pagamento<select id="offerInstallments">${installmentOptions}</select></label>
      <label>Salário mensal<input id="offerSalary" type="number" min="10" value="${salary}"></label>
      <label>Duração do contrato<select id="offerYears"><option value="1">1 temporada</option><option value="2">2 temporadas</option><option value="3" selected>3 temporadas</option><option value="4">4 temporadas</option></select></label>
      <div id="installmentPreview" class="offer-summary"></div>
      <div class="offer-summary">Valor justo estimado: <b>${Number(p.fair_value||0).toLocaleString("pt-BR")}</b> · Pedido: <b>${fee.toLocaleString("pt-BR")}</b> · Salário sugerido: <b>${Number(p.suggested_salary||0).toLocaleString("pt-BR")}</b></div>
      <div id="offerMsg"></div>
      <button class="primary">Enviar proposta de compra</button>
    </form>
  </div>`;

  document.body.appendChild(bg);
  const feeEl=bg.querySelector("#offerFee"),instEl=bg.querySelector("#offerInstallments"),preview=bg.querySelector("#installmentPreview");
  const syncInstallments=()=>{
    const total=Math.max(0,Number(feeEl.value||0)),n=Math.max(1,Number(instEl.value||1));
    const each=n>1?Math.ceil(total/n):total;
    preview.innerHTML=n>1
      ?`Transferência em <b>${n}x</b> de aproximadamente <b>${each.toLocaleString("pt-BR")}</b>. A primeira parcela e as luvas são pagas na contratação; as demais vencem mensalmente.`
      :`Pagamento da transferência <b>à vista</b>.`;
  };
  feeEl.oninput=syncInstallments;instEl.onchange=syncInstallments;syncInstallments();

  bg.querySelector(".close-modal").onclick=()=>bg.remove();
  bg.onclick=e=>{if(e.target===bg)bg.remove()};
  bg.querySelector("#offerForm").onsubmit=async e=>{
    e.preventDefault();
    const btn=e.target.querySelector("button.primary");btn.disabled=true;btn.textContent="NEGOCIANDO...";
    try{
      const d=await api("/api/transfers/offer",{method:"POST",body:JSON.stringify({
        playerId:p.id,
        feeOffer:Number(feeEl.value||0),
        installments:Number(instEl.value||1),
        salaryOffer:Number(bg.querySelector("#offerSalary").value||0),
        years:Number(bg.querySelector("#offerYears").value||3)
      })});
      bg.querySelector("#offerMsg").innerHTML=`<div class="msg ${d.accepted?"ok":""}">${esc(d.message)}</div>`;
      if(d.accepted){
        state.transferResults=(state.transferResults||[]).filter(x=>String(x.id)!==String(p.id));
        await refreshAll();
        setTimeout(()=>{bg.remove();state.view="market";render()},650);
      }else{btn.disabled=false;btn.textContent="Enviar proposta de compra"}
    }catch(err){
      bg.querySelector("#offerMsg").innerHTML=`<div class="msg">${esc(err.message)}</div>`;
      btn.disabled=false;btn.textContent="Enviar proposta de compra";
    }
  };
}

function openLoanOffer(p){
  if(!p.loan_eligible){alert(p.loan_reason||"Jogador indisponível para empréstimo.");return}
  const suggested=Number(p.suggested_loan_fee||0);
  const suggestedPurchase=Math.max(1000,Math.round(Number(p.asking_price||p.fair_value||0)*1.03/100)*100);

  const bg=document.createElement("div");bg.className="modal-bg";
  bg.innerHTML=`<div class="modal">
    <div class="modal-head"><div><div class="kicker">EMPRÉSTIMO</div><h2>${esc(p.name)}</h2><span class="muted">${esc(p.source_club_name)} · ${esc(p.role||p.position)} · OVR ${p.rating}</span></div><button class="secondary close-modal">Fechar</button></div>
    <form id="loanForm" class="stack" style="margin-top:16px">
      <label>Duração<select id="loanMonths"><option value="3">3 meses</option><option value="6" selected>6 meses</option><option value="12">12 meses</option></select></label>
      <label>Taxa mensal ao clube<input id="loanFee" type="number" min="0" value="${suggested}"></label>

      <label class="loan-option-toggle">
        <input id="loanPurchaseOption" type="checkbox">
        <span><b>Incluir opção de compra</b><small>Permite comprar o jogador em definitivo enquanto o empréstimo estiver ativo.</small></span>
      </label>

      <div id="loanPurchaseBox" class="loan-purchase-box" style="display:none">
        <label>Valor da opção de compra<input id="loanPurchasePrice" type="number" min="0" value="${suggestedPurchase}"></label>
        <div class="offer-summary">Valor sugerido para a opção: <b>${suggestedPurchase.toLocaleString("pt-BR")} moedas</b>. A compra será à vista se você decidir exercer a opção.</div>
      </div>

      <div class="offer-summary">Taxa sugerida: <b>${suggested.toLocaleString("pt-BR")}/mês</b>. O seu clube também assume o salário mensal do jogador durante o empréstimo.</div>
      <div id="loanMsg"></div>
      <button class="primary">Pedir empréstimo</button>
    </form>
  </div>`;

  document.body.appendChild(bg);
  bg.querySelector(".close-modal").onclick=()=>bg.remove();
  bg.onclick=e=>{if(e.target===bg)bg.remove()};

  const optionCheck=bg.querySelector("#loanPurchaseOption");
  const optionBox=bg.querySelector("#loanPurchaseBox");
  optionCheck.onchange=()=>{optionBox.style.display=optionCheck.checked?"grid":"none"};

  bg.querySelector("#loanForm").onsubmit=async e=>{
    e.preventDefault();
    const btn=e.target.querySelector("button.primary");btn.disabled=true;btn.textContent="NEGOCIANDO...";
    try{
      const purchaseOption=optionCheck.checked;
      const d=await api("/api/transfers/loan",{method:"POST",body:JSON.stringify({
        playerId:p.id,
        months:Number(bg.querySelector("#loanMonths").value||6),
        monthlyFee:Number(bg.querySelector("#loanFee").value||0),
        purchaseOption,
        purchaseOptionPrice:purchaseOption?Number(bg.querySelector("#loanPurchasePrice").value||0):0
      })});
      bg.querySelector("#loanMsg").innerHTML=`<div class="msg ${d.accepted?"ok":""}">${esc(d.message)}</div>`;
      if(!d.accepted&&d.suggestedPurchasePrice&&purchaseOption){
        bg.querySelector("#loanPurchasePrice").value=d.suggestedPurchasePrice;
      }
      if(d.accepted){
        state.transferResults=(state.transferResults||[]).filter(x=>String(x.id)!==String(p.id));
        await refreshAll();
        setTimeout(()=>{bg.remove();state.view="market";render()},550);
      }else{
        btn.disabled=false;btn.textContent="Pedir empréstimo";
      }
    }catch(err){
      bg.querySelector("#loanMsg").innerHTML=`<div class="msg">${esc(err.message)}</div>`;
      btn.disabled=false;btn.textContent="Pedir empréstimo";
    }
  };
}
function bindMarket(){
  bindLoanPurchaseButtons();

  const form=app.querySelector("#transferSearch");
  const searchBtn=app.querySelector("#transferSearchBtn");

  // O formulário nunca faz navegação/reload. Tanto Enter quanto o botão
  // executam a pesquisa AJAX e atualizam somente #transferResults.
  if(form){
    form.addEventListener("submit",async e=>{
      e.preventDefault();
      e.stopPropagation();
      await searchTransfers();
      return false;
    });
  }
  if(searchBtn){
    // Botão restaurado: comportamento antigo, pesquisa direta sem recarregar a página.
    searchBtn.onclick=async e=>{
      e.preventDefault();
      e.stopPropagation();
      await searchTransfers();
      return false;
    };
  }

  const position=app.querySelector("#searchPosition");
  if(position)position.addEventListener("change",()=>{readTransferSearchFilters()});

  const name=app.querySelector("#searchName");
  const min=app.querySelector("#searchMinRating");
  const max=app.querySelector("#searchMaxPrice");
  const real=app.querySelector("#searchRealOnly");
  [name,min,max,real].filter(Boolean).forEach(el=>{
    el.addEventListener(el.type==="checkbox"?"change":"input",()=>{readTransferSearchFilters()});
  });

  bindTransferButtons();
  app.querySelectorAll(".accept-offer").forEach(b=>b.onclick=async()=>{
    const offer=state.incomingOffers.find(o=>String(o.id)===String(b.dataset.id));
    if(!offer||!confirm(`Vender ${offer.player_name} para ${offer.buying_club_name} por ${Number(offer.amount).toLocaleString("pt-BR")} moedas?`))return;
    try{
      const d=await api(`/api/transfers/incoming/${offer.id}/accept`,{method:"POST",body:"{}"});
      await refreshAll();render();
      alert(`${d.playerName} vendido ao ${d.buyerClubName||"clube comprador"} por ${Number(d.amount).toLocaleString("pt-BR")} moedas.`);
    }catch(err){alert(err.message)}
  });
  app.querySelectorAll(".reject-offer").forEach(b=>b.onclick=async()=>{
    try{await api(`/api/transfers/incoming/${b.dataset.id}/reject`,{method:"POST",body:"{}"});await refreshAll();render()}catch(err){alert(err.message)}
  });
  const check=app.querySelector("#checkOffers");if(check)check.onclick=async()=>{
    check.disabled=true;check.textContent="PROCURANDO...";
    try{const d=await api("/api/transfers/incoming/generate",{method:"POST",body:"{}"});await refreshAll();render();if(!d.created)alert("Nenhuma nova proposta apareceu agora.")}catch(err){alert(err.message);check.disabled=false}
  };
  // v33 FIX FINAL aplicado por delegação global
  const finalSearchBtn=app.querySelector("#transferSearchBtn");
  if(finalSearchBtn){
    finalSearchBtn.onclick=async function(e){
      e.preventDefault();
      e.stopPropagation();
      await searchTransfers();
      return false;
    };
  }

  if(!state.transferResults?.length)searchTransfers();
}

// Correção definitiva do botão Pesquisar Mercado.
// Funciona mesmo quando a aba é recriada por render().
if(!window.__marketSearchDelegated){
  window.__marketSearchDelegated=true;
  document.addEventListener("click",async function(e){
    const btn=e.target.closest("#transferSearchBtn");
    if(!btn)return;
    e.preventDefault();
    e.stopPropagation();
    try{
      await searchTransfers();
    }catch(err){
      const msg=document.querySelector("#transferMsg");
      if(msg) msg.innerHTML=`<div class="msg">${esc(err.message)}</div>`;
    }
  }, true);
}

function bindFriends(){
  app.querySelector("#copyCode").onclick=async()=>{try{await navigator.clipboard.writeText(state.club.friend_code);app.querySelector("#friendMsg").innerHTML=`<div class="msg ok">Código copiado.</div>`}catch{alert(state.club.friend_code)}};
  app.querySelector("#addFriend").onclick=async()=>{try{await api("/api/friends/add",{method:"POST",body:JSON.stringify({code:app.querySelector("#friendCode").value.trim()})});await refreshAll();render()}catch(err){app.querySelector("#friendMsg").innerHTML=`<div class="msg">${esc(err.message)}</div>`}};
  app.querySelectorAll(".view-club").forEach(b=>b.onclick=()=>showClub(b.dataset.id));
  app.querySelectorAll(".play-friend").forEach(b=>b.onclick=async()=>{try{const d=await api(`/api/friends/${b.dataset.id}/play`,{method:"POST",body:"{}"});await refreshAll();render();showMatch(d.match)}catch(err){alert(err.message)}});
  app.querySelectorAll(".remove-friend").forEach(b=>b.onclick=async()=>{if(!confirm("Remover amigo?"))return;try{await api(`/api/friends/${b.dataset.id}`,{method:"DELETE"});await refreshAll();render()}catch(err){alert(err.message)}});
}
function bindCompetitions(){
  app.querySelectorAll("[data-comp]").forEach(b=>b.onclick=()=>{state.competitionTab=b.dataset.comp;render()});
  app.querySelectorAll("[data-club]").forEach(r=>r.onclick=()=>showClub(r.dataset.club));
  const rs=app.querySelector("#roundSelect");
  if(rs)rs.onchange=()=>{state.roundByDiv[state.competitionTab]=Number(rs.value);render()};
  const ps=app.querySelector("#playState");if(ps)ps.onclick=async()=>{ps.disabled=true;await careerAction("state")};
  const pc=app.querySelector("#playCopa");if(pc)pc.onclick=async()=>{pc.disabled=true;await careerAction("copa")};
  const pl=app.querySelector("#playLib");if(pl)pl.onclick=async()=>{pl.disabled=true;await careerAction("lib")};
  const pcg=app.querySelector("#playChampions");if(pcg)pcg.onclick=async()=>{pcg.disabled=true;await careerAction("champions")};
  const pw=app.querySelector("#playWorld");if(pw)pw.onclick=async()=>{pw.disabled=true;await careerAction("world")};
}

let pendingCrest;
function bindCareers(){
  const newBtn=app.querySelector("#newCareer");
  if(newBtn)newBtn.onclick=()=>{
    state.creationMode="club";
    renderCreateClub();
  };

  app.querySelectorAll(".activate-career").forEach(btn=>btn.onclick=async()=>{
    btn.disabled=true;btn.textContent="CARREGANDO...";
    try{
      await api(`/api/careers/${btn.dataset.type}/${btn.dataset.id}/activate`,{method:"POST",body:"{}"});
      state.view="home";
      state.playerView="home";
      await bootstrap();
    }catch(err){alert(err.message);btn.disabled=false;btn.textContent="Jogar esta carreira"}
  });

  app.querySelectorAll(".delete-career").forEach(btn=>btn.onclick=async()=>{
    const career=(state.careers||[]).find(x=>String(x.id)===String(btn.dataset.id)&&x.career_type===btn.dataset.type);
    if(!career)return;
    const expected=career.career_type==="player"?(career.player_name||career.name):career.name;
    const kind=career.career_type==="player"?"jogador":"clube";
    const typed=prompt(`Para apagar esta carreira de ${kind}, digite exatamente:\\n\\n${expected}`);
    if(typed===null)return;
    if(typed!==expected){alert("O nome digitado não corresponde.");return}
    if(!confirm(`Apagar definitivamente a carreira "${career.career_label||expected}"?`))return;
    btn.disabled=true;
    try{
      const url=career.career_type==="player"?`/api/player-careers/${career.id}`:`/api/careers/${career.id}`;
      await api(url,{method:"DELETE",body:JSON.stringify({confirmName:typed})});
      state.view="careers";state.playerView="careers";
      await bootstrap();
      if(!(state.careers||[]).length)renderCreateClub();
      else if(state.activeType==="player"){state.playerView="careers";renderPlayerCareer()}
      else{state.view="careers";render()}
    }catch(err){alert(err.message);btn.disabled=false}
  });
}
function bindClub(){
  pendingCrest=state.club.crest_data||null;
  const name=app.querySelector("#customName"),c1=app.querySelector("#customPrimary"),c2=app.querySelector("#customSecondary");
  const sync=()=>{
    app.querySelector("#clubPreview").style.background=`linear-gradient(135deg,${c1.value},${c2.value})`;
    app.querySelector("#namePreview").textContent=name.value||"Clube";
    app.querySelector("#crestPreview").innerHTML=pendingCrest?`<img src="${pendingCrest}" alt="">`:esc(initials(name.value));
  };
  [name,c1,c2].forEach(el=>el.oninput=sync);
  app.querySelector("#crestFile").onchange=async e=>{
    const f=e.target.files?.[0];if(!f)return;
    try{pendingCrest=await resizeImage(f,256,256);sync()}catch(err){alert(err.message)}
  };
  app.querySelector("#removeCrest").onclick=()=>{pendingCrest=null;sync()};
  const deleteClub=app.querySelector("#deleteClub");
  if(deleteClub)deleteClub.onclick=async()=>{
    const typed=prompt(`Para apagar definitivamente o time, digite exatamente o nome atual do clube:\n\n${state.club.name}`);
    if(typed===null)return;
    if(typed!==state.club.name){
      alert("O nome digitado não corresponde ao nome atual do clube.");
      return;
    }
    if(!confirm("Esta ação apaga todo o progresso do time e não pode ser desfeita. Continuar?"))return;

    deleteClub.disabled=true;
    deleteClub.textContent="APAGANDO...";
    try{
      await api("/api/club",{method:"DELETE",body:JSON.stringify({confirmName:typed})});
      state.players=[];state.market=[];state.matches=[];state.friends=[];
      state.competitions=null;state.finance={wages:0,recent:[],transferBan:{active:false}};
      state.clubEvents=[];state.transferResults=[];state.trophies=[];state.incomingOffers=[];
      state.calendar=null;state.sponsorship={active:null,offers:[]};state.marketProfile=null;
      state.mediaNews=[];state.pendingPress=null;state.saf={active:false,offers:[],debtRisk:false};
      state.view="careers";
      await bootstrap();
      if(!(state.careers||[]).length)renderCreateClub();
      else{state.view="careers";render()}
    }catch(err){
      alert(err.message);
      deleteClub.disabled=false;
      deleteClub.textContent="Apagar meu time";
    }
  };

  app.querySelectorAll(".saf-offer").forEach(btn=>btn.onclick=async()=>{
    const offer=(state.saf?.offers||[]).find(x=>x.id===btn.dataset.saf);
    if(!offer)return;
    if(!confirm(`Vender o clube para ${offer.name}?\n\nAporte imediato: ${Number(offer.investment).toLocaleString("pt-BR")} moedas.\n\nATENÇÃO: a venda é permanente nesta carreira. Se a SAF terminar qualquer temporada com saldo negativo, o clube sofre rebaixamento administrativo de uma divisão.`))return;
    btn.disabled=true;
    try{
      const d=await api("/api/saf/accept",{method:"POST",body:JSON.stringify({investorId:offer.id})});
      await refreshAll();
      render();
      alert(`${d.investorName} assumiu a SAF. O clube recebeu ${Number(d.investment).toLocaleString("pt-BR")} moedas.`);
    }catch(err){alert(err.message);btn.disabled=false}
  });

  app.querySelector("#customForm").onsubmit=async e=>{
    e.preventDefault();
    try{
      const result=await api("/api/club/customize",{method:"PUT",body:JSON.stringify({
        name:name.value,primaryColor:c1.value,secondaryColor:c2.value,crestData:pendingCrest
      })});
      await refreshAll();
      await refreshCareerList().catch(()=>{});
      render();
      if(result.felipeMode)alert("MODO FELIPE ATIVADO: todos os jogadores do clube agora têm atributos 100 e o time recebe placares especiais.");
    }catch(err){
      app.querySelector("#customMsg").innerHTML=`<div class="msg">${esc(err.message)}</div>`;
    }
  };
}
function resizeImage(file,maxW,maxH){
  return new Promise((resolve,reject)=>{
    if(!/^image\/(png|jpeg|webp)$/.test(file.type))return reject(new Error("Use PNG, JPG ou WebP."));
    const reader=new FileReader();
    reader.onerror=()=>reject(new Error("Falha ao ler imagem."));
    reader.onload=()=>{
      const img=new Image();
      img.onerror=()=>reject(new Error("Imagem inválida."));
      img.onload=()=>{
        const scale=Math.min(maxW/img.width,maxH/img.height,1);
        const w=Math.max(1,Math.round(img.width*scale)),h=Math.max(1,Math.round(img.height*scale));
        const canvas=document.createElement("canvas");canvas.width=maxW;canvas.height=maxH;
        const ctx=canvas.getContext("2d");ctx.clearRect(0,0,maxW,maxH);ctx.drawImage(img,(maxW-w)/2,(maxH-h)/2,w,h);
        const data=canvas.toDataURL("image/webp",.86);
        if(data.length>650000)return reject(new Error("Imagem grande demais."));
        resolve(data);
      };
      img.src=reader.result;
    };
    reader.readAsDataURL(file);
  });
}
async function logout(){
  await api("/api/auth/logout",{method:"POST",body:"{}"}).catch(()=>{});
  state.me=null;state.club=null;state.playerCareer=null;state.playerData=null;state.activeType=null;state.careers=[];state.players=[];state.competitions=null;renderAuth();
}
bootstrap();
