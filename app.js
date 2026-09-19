
const app=document.querySelector("#app");
const STATES={"AC": "Acre", "AL": "Alagoas", "AP": "Amapá", "AM": "Amazonas", "BA": "Bahia", "CE": "Ceará", "DF": "Distrito Federal", "ES": "Espírito Santo", "GO": "Goiás", "MA": "Maranhão", "MT": "Mato Grosso", "MS": "Mato Grosso do Sul", "MG": "Minas Gerais", "PA": "Pará", "PB": "Paraíba", "PR": "Paraná", "PE": "Pernambuco", "PI": "Piauí", "RJ": "Rio de Janeiro", "RN": "Rio Grande do Norte", "RS": "Rio Grande do Sul", "RO": "Rondônia", "RR": "Roraima", "SC": "Santa Catarina", "SP": "São Paulo", "SE": "Sergipe", "TO": "Tocantins"};

const state={
  me:null,club:null,players:[],market:[],matches:[],friends:[],competitions:null,
  finance:{wages:0,recent:[],transferBan:{active:false}},clubEvents:[],transferResults:[],
  trophies:[],incomingOffers:[],calendar:null,sponsorship:{active:null,offers:[]},marketProfile:null,
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
function phaseName(p){return({STATE:"Estadual",NATIONAL:"Brasileirão",LIBERTADORES:"Libertadores",END:"Temporada encerrada"})[p]||p}

async function bootstrap(){
  try{
    const d=await api("/api/me");
    state.me=d.user;state.club=d.club;
    if(state.club?.state_code)await refreshAll();
    render();
  }catch{renderAuth()}
}
async function refreshAll(){
  const c=await api("/api/competitions");
  const d=await api("/api/dashboard");
  Object.assign(state,d);
  state.competitions=c;
  if(c?.career?.phase==="NATIONAL"){
    for(const div of ["A","B","C","D"])state.roundByDiv[div]=Math.min(38,Number(c.career.current_round||1));
  }
}

function renderAuth(){
  app.innerHTML=`<main class="auth"><section class="authbox">
    <div class="brand"><span class="logo">⚽</span>Dono do Clube</div>
    <h1>Do Estadual à Série A.</h1>
    <p>Crie seu clube, comece na Série D e suba até a elite.</p>
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

function renderCreateClub(){
  app.innerHTML=`<main class="auth"><section class="authbox">
    <div class="brand"><span class="logo">⚽</span>Dono do Clube</div>
    <h1>Crie seu clube.</h1>
    <p>Seu time começa na Série D e disputa o Estadual do estado escolhido.</p>
    <form id="clubForm" class="stack">
      <label>Nome<input id="clubName" name="name" value="Meu Clube FC" maxlength="30" required></label>
      <label>Estado<select name="stateCode" required><option value="">Escolha o estado</option>${stateOptions()}</select></label>
      <div class="colors">
        <label>Cor principal<input id="c1" type="color" name="primaryColor" value="#18864b"></label>
        <label>Cor secundária<input id="c2" type="color" name="secondaryColor" value="#f7fafc"></label>
      </div>
      <div id="preview" class="club-preview"></div>
      <button class="primary">Fundar clube na Série D</button>
      <div id="clubMsg"></div>
    </form>
  </section></main>`;
  const sync=()=>{
    const n=app.querySelector("#clubName").value||"Meu Clube FC";
    const c1=app.querySelector("#c1").value,c2=app.querySelector("#c2").value;
    app.querySelector("#preview").style.background=`linear-gradient(135deg,${c1},${c2})`;
    const felipe=n.trim().toLowerCase()==="felipe";
    app.querySelector("#preview").innerHTML=`<div><div class="preview-crest">${esc(initials(n))}</div><h2>${esc(n)}</h2><p>${felipe?"⚡ Modo Felipe será ativado":"Começa na Série D"}</p></div>`;
  };
  ["clubName","c1","c2"].forEach(id=>app.querySelector("#"+id).oninput=sync);
  sync();
  app.querySelector("#clubForm").onsubmit=async e=>{
    e.preventDefault();
    const f=new FormData(e.target);
    try{
      await api("/api/club",{method:"POST",body:JSON.stringify({
        name:f.get("name"),stateCode:f.get("stateCode"),
        primaryColor:f.get("primaryColor"),secondaryColor:f.get("secondaryColor")
      })});
      await bootstrap();
    }catch(err){
      app.querySelector("#clubMsg").innerHTML=`<div class="msg">${esc(err.message)}</div>`;
    }
  };
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
function playerCard(p){
  const severance=Math.max(100,Number(p.salary||0)*2);
  return `<article class="player ${p.is_starter?"starter":""}">
    <span class="pos">${esc(p.role||posName(p.position))} · ${p.age} anos</span>
    <span class="rating">${p.rating}</span>
    <h4>${esc(p.name)}</h4>
    <div class="condition-line ${fitnessClass(p)}">
      <span>Físico <b>${p.fitness??100}%</b></span>
      <span>Moral <b>${p.morale??70}</b></span>
      ${Number(p.injury_games||0)>0?`<span>🩹 <b>${p.injury_games} jogo(s)</b></span>`:""}
    </div>
    <div class="attrs">
      <span>VEL <b>${p.pace}</b></span><span>CHU <b>${p.shooting}</b></span>
      <span>PAS <b>${p.passing}</b></span><span>DEF <b>${p.defending}</b></span>
    </div>
    <div class="pstats">
      <span>J <b>${p.appearances}</b></span><span>G <b>${p.goals}</b></span>
      <span>A <b>${p.assists}</b></span><span>Sal. <b>${Number(p.salary||0).toLocaleString("pt-BR")}</b></span>
      <span>Contrato <b>${p.contract_seasons||1}T</b></span><span>Rescisão <b>${severance.toLocaleString("pt-BR")}</b></span>
    </div>
    ${p.transfer_listed?`<div class="sale-badge">À VENDA</div>`:""}
    <div class="player-actions">
      <button class="${p.is_starter?"primary":"secondary"} toggle-player" data-id="${p.id}" ${Number(p.injury_games||0)>0&&!p.is_starter?"disabled":""}>${p.is_starter?"Titular":"Reserva"}</button>
      <button class="secondary list-player" data-id="${p.id}">${p.transfer_listed?"Retirar da venda":"Colocar à venda"}</button>
      <button class="danger release-player" data-id="${p.id}" ${p.is_starter?"disabled":""}>Rescindir</button>
    </div>
  </article>`;
}
function fitScore(p){
  return Number(p.rating)+(Number(p.fitness||100)-70)*.12+(Number(p.morale||70)-70)*.05-(Number(p.injury_games||0)>0?100:0);
}
function formationQuota(formation){
  if(formation==="4-4-2")return {GK:1,DEF:4,MID:4,ATT:2};
  if(formation==="3-5-2")return {GK:1,DEF:3,MID:5,ATT:2};
  return {GK:1,DEF:4,MID:3,ATT:3};
}
function pitchToken(p){
  return `<div class="pitch-player ${fitnessClass(p)}" title="${esc(p.name)}">
    <span class="pitch-rating">${p.rating}</span>
    <b>${esc(p.name.split(" ").slice(-1)[0])}</b>
    <small>${esc(p.role||posName(p.position))} · ${p.fitness??100}%</small>
  </div>`;
}
function formationPitch(formation){
  const starters=state.players.filter(p=>p.is_starter);
  const rows={ATT:[],MID:[],DEF:[],GK:[]};
  starters.forEach(p=>(rows[p.position]||rows.MID).push(p));
  for(const k of Object.keys(rows))rows[k].sort((a,b)=>fitScore(b)-fitScore(a));
  return `<div class="pitch">
    <div class="pitch-line center"></div><div class="pitch-circle"></div>
    <div class="pitch-row attack">${rows.ATT.map(pitchToken).join("")}</div>
    <div class="pitch-row midfield">${rows.MID.map(pitchToken).join("")}</div>
    <div class="pitch-row defense">${rows.DEF.map(pitchToken).join("")}</div>
    <div class="pitch-row goalkeeper">${rows.GK.map(pitchToken).join("")}</div>
    <div class="pitch-caption">${esc(formation)} · ${starters.length}/11 titulares</div>
  </div>`;
}
function suggestRotation(formation){
  const q=formationQuota(formation);
  const chosen=[];
  for(const pos of ["GK","DEF","MID","ATT"]){
    chosen.push(...state.players.filter(p=>p.position===pos&&Number(p.injury_games||0)<=0).sort((a,b)=>fitScore(b)-fitScore(a)).slice(0,q[pos]));
  }
  if(chosen.length<11){
    const used=new Set(chosen.map(p=>String(p.id)));
    chosen.push(...state.players.filter(p=>!used.has(String(p.id))&&Number(p.injury_games||0)<=0).sort((a,b)=>fitScore(b)-fitScore(a)).slice(0,11-chosen.length));
  }
  state.players.forEach(p=>p.is_starter=chosen.some(x=>String(x.id)===String(p.id)));
}

function selectBestSquad(formation){
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
      .filter(p=>p.position===pos&&Number(p.injury_games||0)<=0)
      .sort(bestSort);

    chosen.push(...available.slice(0,q[pos]));
  }

  if(chosen.length<11){
    const used=new Set(chosen.map(p=>String(p.id)));
    const remaining=state.players
      .filter(p=>!used.has(String(p.id))&&Number(p.injury_games||0)<=0)
      .sort(bestSort);

    chosen.push(...remaining.slice(0,11-chosen.length));
  }

  state.players.forEach(p=>{
    p.is_starter=chosen.some(x=>String(x.id)===String(p.id));
  });

  return chosen.length===11;
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
    ${loans.length?`<div class="calendar-sub"><b>Empréstimos ativos</b>${loans.slice(0,4).map(x=>`<span>${esc(x.player_name)} · ${x.months_elapsed}/${x.months_total} meses · taxa ${Number(x.monthly_fee).toLocaleString("pt-BR")}/mês</span>`).join("")}</div>`:""}
  </div>`;
}

function transferBanBanner(){
  const ban=state.finance?.transferBan;
  if(!ban?.active)return "";
  return `<div class="transfer-ban"><b>⛔ TRANSFER BAN ATIVO</b><span>O clube está excessivamente endividado. Você pode vender jogadores, mas não pode contratar nem pedir novos empréstimos enquanto o caixa estiver abaixo de ${Number(ban.threshold).toLocaleString("pt-BR")} moedas.</span></div>`;
}
function sponsorshipCard(){
  const sp=state.sponsorship||{active:null,offers:[]};
  if(sp.active){
    const remaining=Math.max(0,Number(sp.active.months_total||12)-Number(sp.active.months_paid||0));
    return `<div class="card sponsor-card">
      <div class="kicker">PATROCINADOR OFICIAL</div>
      <h2>${esc(sp.active.sponsor_name)}</h2>
      <div class="sponsor-money"><span>Pagamento mensal</span><b>+${Number(sp.active.monthly_amount).toLocaleString("pt-BR")}</b></div>
      <p class="muted">${remaining} mês(es) restantes no contrato.</p>
    </div>`;
  }
  const offers=sp.offers||[];
  return `<div class="card sponsor-card">
    <div class="kicker">PATROCÍNIO</div><h2>Escolha um patrocinador</h2>
    <p class="muted">As propostas melhoram conforme o clube sobe de divisão.</p>
    <div class="sponsor-offers">${offers.map(o=>`<button class="sponsor-offer secondary" data-sponsor="${esc(o.id)}"><b>${esc(o.name)}</b><span>+${Number(o.monthly).toLocaleString("pt-BR")}/mês</span><small>Luvas +${Number(o.signing).toLocaleString("pt-BR")}</small></button>`).join("")}</div>
  </div>`;
}

function copaQuickCard(){
  const copa=state.competitions?.copaBrasil,car=state.competitions?.career;
  if(!copa||car?.phase==="STATE")return "";
  const active=copa.status!=="finished"&&!copa.userEliminated;
  return `<div class="card copa-home"><div><div class="kicker">COPA DO BRASIL</div><h2>${copa.status==="finished"?`🏆 ${esc(copa.championClub?.name||"Encerrada")}`:esc(({R32:"Primeira fase",R16:"Oitavas",QF:"Quartas",SF:"Semifinais",FINAL:"Final"})[copa.stage]||copa.stage)}</h2><p class="muted">Torneio mata-mata em jogo único.</p></div>${active?`<button id="playCopaHome" class="primary">Jogar Copa do Brasil</button>`:""}</div>`;
}

function homeView(){
  const c=state.club,car=state.competitions.career,pos=userPosition();
  let action="";
  if(car.phase==="STATE")action=`<button id="careerAction" data-action="state" class="primary">🏟️ JOGAR PRÓXIMA FASE DO ESTADUAL</button>`;
  if(car.phase==="NATIONAL")action=`<button id="careerAction" data-action="national" class="primary">⚽ JOGAR RODADA ${car.current_round}/38</button>`;
  if(car.phase==="LIBERTADORES")action=`<button id="careerAction" data-action="lib" class="primary">🏆 JOGAR PRÓXIMA FASE DA LIBERTADORES</button>`;
  if(car.phase==="END")action=`<button id="careerAction" data-action="next" class="primary">📅 IR PARA A PRÓXIMA TEMPORADA</button>`;
  const tired=state.players.filter(p=>p.is_starter&&Number(p.fitness||100)<55).length;
  const injured=state.players.filter(p=>Number(p.injury_games||0)>0).length;

  return `<section class="hero">
    <div class="club-head">${crestHtml(c)}<div>
      <div class="kicker">Temporada ${car.season_no} · ${phaseName(car.phase)}</div>
      <h1>${esc(c.name)}</h1>
      <p>${esc(STATES[c.state_code])} · Série ${car.user_division}${pos?` · ${pos}º lugar`:""}</p>
    </div></div>
    ${action}
    <div class="stats">
      <div class="stat"><small>Overall</small><b>${c.team_rating}</b></div>
      <div class="stat"><small>Caixa</small><b>${Number(c.coins).toLocaleString("pt-BR")}</b></div>
      <div class="stat"><small>Folha mensal</small><b>${Number(state.finance?.wages||0).toLocaleString("pt-BR")}</b></div>
      <div class="stat"><small>Elenco</small><b>${tired} cansados · ${injured} lesionados</b></div>
    </div>
  </section>
  ${transferBanBanner()}
  ${copaQuickCard()}
  ${car.phase==="END"?`<section class="season-end" style="margin-top:14px">
    <div class="kicker">FIM DA TEMPORADA</div>
    <h2>${nextDivision()!==car.user_division?`Você vai para a Série ${nextDivision()}`:`Você permanece na Série ${car.user_division}`}</h2>
    <p>A próxima temporada reinicia as tabelas e o Estadual. Seu elenco, dinheiro, escudo e estatísticas de carreira continuam.</p>
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
  <section class="card" style="margin-top:14px"><div class="kicker">GALERIA</div><h2>Troféus do clube</h2>${trophyCards((state.trophies||[]).slice(0,6))}</section>`;
}
function squadView(){
  return `<section class="card">
    <div class="toolbar">
      <div><div class="kicker">Gestão do time</div><h2>Formação, físico e rodízio</h2></div>
      <div class="squad-tools">
        <label>Formação<select id="formation">${["4-3-3","4-4-2","3-5-2"].map(f=>`<option ${state.club.formation===f?"selected":""}>${f}</option>`).join("")}</select></label>
        <button id="bestSquad" class="primary">⭐ Escalar melhores</button>
        <button id="rotateSquad" class="secondary">Sugerir rodízio</button>
      </div>
    </div>
    <p class="muted">O campo abaixo mostra sua escalação. Use <b>Escalar melhores</b> para selecionar automaticamente os maiores overalls disponíveis na formação escolhida. Físico baixo reduz o rendimento; lesionados não podem ser escalados.</p>
    <div id="pitchWrap">${formationPitch(state.club.formation)}</div>
    <div class="legend"><span class="good-dot"></span> Bom físico <span class="warn-dot"></span> Cansado <span class="bad-dot"></span> Muito cansado/lesionado</div>
    <div class="players" style="margin-top:16px">${state.players.map(playerCard).join("")}</div>
    <button id="saveLineup" class="primary" style="margin-top:14px">Salvar escalação</button>
  </section>`;
}
function marketView(){
  const ban=state.finance?.transferBan;
  return `<section class="card">
    <div class="section-title">
      <div><div class="kicker">Scout, compras e vendas</div><h2>Mercado de transferências</h2></div>
      <div class="finance-chips"><span class="coins">Caixa ● ${Number(state.club.coins).toLocaleString("pt-BR")}</span><span class="badge red">Folha mensal ${Number(state.finance?.wages||0).toLocaleString("pt-BR")}</span></div>
    </div>
    ${transferBanBanner()}
    <section class="incoming-section">
      <div class="section-title"><div><div class="kicker">PROPOSTAS RECEBIDAS</div><h3>Clubes interessados nos seus jogadores</h3></div><button id="checkOffers" class="secondary">Buscar novas propostas</button></div>
      <div id="incomingOffers">${incomingOfferCards()}</div>
    </section>
    <section class="selling-section">
      <div class="kicker">VENDER JOGADORES</div><h3>Lista de transferências</h3>
      <p class="muted">Na aba Elenco, use <b>Colocar à venda</b>. Clubes controlados pelo jogo poderão enviar propostas, principalmente nos pagamentos mensais.</p>
      <div class="listed-row">${state.players.filter(p=>p.transfer_listed).length?state.players.filter(p=>p.transfer_listed).map(p=>`<span class="listed-chip">${esc(p.name)} · OVR ${p.rating}</span>`).join(""):`<span class="muted">Nenhum jogador listado.</span>`}</div>
    </section>
    <hr class="section-divider">
    <div class="kicker">CONTRATAÇÕES</div><h3>Pesquisar jogadores</h3>
    ${state.marketProfile?`<div class="market-level">Mercado da Série ${esc(state.competitions?.career?.user_division||"D")} · jogadores normalmente entre OVR ${state.marketProfile.min} e ${state.marketProfile.max}. Ao subir de divisão, o nível disponível aumenta.</div>`:""}
    <p class="muted">O clube vendedor precisa aceitar a proposta e o jogador precisa aceitar o salário e o projeto esportivo. Compras podem ser parceladas em até 24x. Jogadores não essenciais podem chegar por empréstimo.</p>
    ${ban?.active?`<p class="muted">A pesquisa continua disponível, mas novas contratações estão bloqueadas pelo transfer ban.</p>`:""}
    <form id="transferSearch" class="transfer-search">
      <input id="searchName" placeholder="Nome do jogador">
      <select id="searchPosition">
        <option value="">Todas as posições</option>
        <option value="GK">Goleiro</option><option value="DEF">Defesa</option><option value="MID">Meio</option><option value="ATT">Ataque</option>
        <option value="CB">Zagueiro</option><option value="RB">Lateral direito</option><option value="LB">Lateral esquerdo</option>
        <option value="CDM">Volante</option><option value="CM">Meia central</option><option value="CAM">Meia ofensivo</option>
        <option value="RW">Ponta direita</option><option value="LW">Ponta esquerda</option><option value="ST">Centroavante</option>
      </select>
      <input id="searchMinRating" type="number" min="40" max="100" value="58" placeholder="OVR mínimo">
      <input id="searchMaxPrice" type="number" min="0" value="150000" placeholder="Valor máximo">
      <button class="primary">Pesquisar</button>
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
  return state.transferResults.map(p=>`<article class="player">
    <span class="pos">${esc(p.role||posName(p.position))} · ${p.age} anos</span><span class="rating">${p.rating}</span>
    <h4>${esc(p.name)}</h4>
    <div class="transfer-source">${p.source_club_name?esc(p.source_club_name):"Livre no mercado"}${p.source_division?` · Série ${p.source_division}`:""}</div>
    <div class="attrs"><span>VEL <b>${p.pace}</b></span><span>CHU <b>${p.shooting}</b></span><span>PAS <b>${p.passing}</b></span><span>DEF <b>${p.defending}</b></span></div>
    <div class="pstats">
      <span>Valor justo <b>${Number(p.fair_value||0).toLocaleString("pt-BR")}</b></span>
      <span>Pedido <b>${Number(p.asking_price||0).toLocaleString("pt-BR")}</b></span>
      <span>Salário mensal <b>${Number(p.suggested_salary||0).toLocaleString("pt-BR")}</b></span>
      <span>Interesse <b>${esc(p.interest)}</b></span>
    </div>
    <div class="loan-status ${p.loan_eligible?"loan-ok":"loan-no"}">${p.loan_eligible?`Empréstimo disponível · sugerido ${Number(p.suggested_loan_fee||0).toLocaleString("pt-BR")}/mês`:`Empréstimo: ${esc(p.loan_reason||"indisponível")}`}</div>
    <div class="player-actions">
      <button class="primary negotiate-player" data-id="${p.id}" ${state.finance?.transferBan?.active?"disabled":""}>${state.finance?.transferBan?.active?"Transfer ban":"Comprar"}</button>
      ${p.loan_eligible?`<button class="secondary loan-player" data-id="${p.id}" ${state.finance?.transferBan?.active?"disabled":""}>Empréstimo</button>`:""}
    </div>
  </article>`).join("");
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
    ${div==="A"?`<span class="badge">TOP 4 → LIBERTADORES</span><span class="badge red">4 REBAIXADOS</span>`:
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

function knockoutList(lib){
  return `<div class="knockout-grid">${[["R16","Oitavas"],["QF","Quartas"],["SF","Semifinais"],["FINAL","Final"]].map(([code,label])=>{
    const fs=lib.fixtures.filter(f=>f.stage===code);if(!fs.length)return "";
    return `<div class="knockout-stage"><h3>${label}</h3>
      ${fs.map(f=>`<div class="ko-match">
        <small>${code==="FINAL"?"Final":`Chave ${f.slot} · jogo ${f.leg}`}</small>
        <span>${esc(f.homeClub.name)} ${f.played?`<b>${f.hg}</b>`:""}</span>
        <span>${esc(f.awayClub.name)} ${f.played?`<b>${f.ag}</b>`:""}</span>
        ${f.pw?`<em>Decidido nos pênaltis</em>`:""}
      </div>`).join("")}
    </div>`;
  }).join("")}</div>`;
}

function libertadoresView(){
  const lib=state.competitions.libertadores;
  if(!lib)return `<div class="empty"><h2>🏆 Libertadores</h2><p>Somente os 4 primeiros da Série A se classificam.</p></div>`;
  if(lib.status==="finished")return `<div class="champion-card"><div class="kicker">CAMPEÃO DA LIBERTADORES</div><h2>🏆 ${esc(lib.championClub?.name||"Campeão")}</h2></div>${knockoutList(lib)}`;
  const button=state.competitions.career.phase==="LIBERTADORES"?`<button id="playLib" class="primary">Jogar próxima fase</button>`:"";
  if(lib.stage==="GROUP")return `<div class="section-title"><div><div class="kicker">32 CLUBES · 8 GRUPOS</div><h2>Libertadores — fase de grupos</h2><span class="muted">6 jogos por clube · 2 classificados por grupo</span></div>${button}</div>
    <div class="groups-grid">${"ABCDEFGH".split("").map(groupCard).join("")}</div>`;
  return `<div class="section-title"><div><div class="kicker">MATA-MATA</div><h2>${({R16:"Oitavas",QF:"Quartas",SF:"Semifinais",FINAL:"Final"})[lib.stage]}</h2></div>${button}</div>${knockoutList(lib)}`;
}

function copaView(){
  const copa=state.competitions.copaBrasil;
  if(!copa)return `<div class="empty">Copa do Brasil não disponível.</div>`;
  const stageLabels={R32:"Primeira fase",R16:"Oitavas de final",QF:"Quartas de final",SF:"Semifinais",FINAL:"Final"};
  const active=copa.status!=="finished"&&!copa.userEliminated&&state.competitions.career.phase!=="STATE";
  return `<div class="section-title"><div><div class="kicker">MATA-MATA · JOGO ÚNICO</div><h2>Copa do Brasil</h2><span class="muted">${copa.status==="finished"?"Encerrada":stageLabels[copa.stage]||copa.stage}</span></div>${active?`<button id="playCopa" class="primary">Jogar próxima fase</button>`:""}</div>
    ${copa.status==="finished"?`<div class="champion-card"><div class="kicker">CAMPEÃO DA COPA DO BRASIL</div><h2>🏆 ${esc(copa.championClub?.name||"Campeão")}</h2></div>`:""}
    ${copa.userEliminated?`<div class="msg">Seu clube foi eliminado. O restante do torneio foi simulado automaticamente.</div>`:""}
    <div class="knockout-grid copa-grid">${[["R32","1ª fase"],["R16","Oitavas"],["QF","Quartas"],["SF","Semifinais"],["FINAL","Final"]].map(([code,label])=>{
      const fs=copa.fixtures.filter(f=>f.stage===code);if(!fs.length)return "";
      return `<div class="knockout-stage"><h3>${label}</h3>${fs.map(f=>`<div class="ko-match"><small>Chave ${f.slot}</small><span>${esc(f.homeClub?.name||"")} ${f.played?`<b>${f.hg}</b>`:""}</span><span>${esc(f.awayClub?.name||"")} ${f.played?`<b>${f.ag}</b>`:""}</span>${f.pw?`<em>Decidido nos pênaltis</em>`:""}</div>`).join("")}</div>`;
    }).join("")}</div>`;
}

function competitionsView(){
  const car=state.competitions.career;
  if(!["STATE","COPA","A","B","C","D","LIB"].includes(state.competitionTab))state.competitionTab=car.user_division;
  const content=state.competitionTab==="STATE"?stateView():state.competitionTab==="COPA"?copaView():state.competitionTab==="LIB"?libertadoresView():divisionView(state.competitionTab);
  return `<section class="card">
    <div class="competition-tabs">
      <button data-comp="STATE" class="${state.competitionTab==="STATE"?"on":""}">ESTADUAL</button>
      <button data-comp="COPA" class="${state.competitionTab==="COPA"?"on":""}">COPA DO BRASIL</button>
      ${["A","B","C","D"].map(d=>`<button data-comp="${d}" class="${state.competitionTab===d?"on":""}">SÉRIE ${d}</button>`).join("")}
      <button data-comp="LIB" class="${state.competitionTab==="LIB"?"on":""}">LIBERTADORES</button>
    </div>
    ${content}
  </section>`;
}

function clubView(){
  const c=state.club;
  return `<section class="custom-grid">
    <div class="card"><div id="clubPreview" class="club-preview" style="background:linear-gradient(135deg,${c.primary_color},${c.secondary_color})">
      <div><div id="crestPreview" class="preview-crest">${c.crest_data?`<img src="${c.crest_data}" alt="">`:esc(initials(c.name))}</div>
      <h2 id="namePreview">${esc(c.name)}</h2><p>${esc(STATES[c.state_code])}</p><p>Código: <b>${esc(c.friend_code||"")}</b></p></div>
    </div></div>
    <div class="card"><div class="kicker">Identidade do clube</div><h2>Personalização</h2>
      <form id="customForm" class="stack">
        <div class="rename-box">
          <b>Mudar nome do clube</b>
          <span class="muted">Você pode alterar o nome a qualquer momento.</span>
          <label>Novo nome<input id="customName" value="${esc(c.name)}" maxlength="30" required></label>
        </div>
        ${String(c.name||"").trim().toLowerCase()==="felipe"?`<div class="felipe-banner">⚡ MODO FELIPE ATIVO — elenco 100 e goleadas especiais.</div>`:""}
        <label>Estado<input value="${esc(STATES[c.state_code])}" disabled></label>
        <div class="colors"><label>Cor principal<input id="customPrimary" type="color" value="${c.primary_color}"></label>
        <label>Cor secundária<input id="customSecondary" type="color" value="${c.secondary_color}"></label></div>
        <label class="filebox">Escudo<input id="crestFile" type="file" accept="image/png,image/jpeg,image/webp"><span class="muted">PNG, JPG ou WebP.</span></label>
        <div style="display:flex;gap:8px"><button type="button" id="removeCrest" class="secondary">Remover escudo</button><button class="primary" style="flex:1">Salvar nome e personalização</button></div>
        <div id="customMsg"></div>
      </form>

      <div class="club-trophy-section"><div class="kicker">GALERIA DE TROFÉUS</div><h3>Conquistas do clube</h3>${trophyCards(state.trophies||[])}</div>

      <div class="danger-zone">
        <div>
          <div class="kicker danger-kicker">ZONA DE PERIGO</div>
          <h3>Apagar time e reiniciar do início</h3>
          <p class="muted">Apaga o clube, elenco, carreira, partidas, amigos, finanças e progresso esportivo. Sua conta continua existindo para você criar um novo clube na Série D.</p>
        </div>
        <button type="button" id="deleteClub" class="danger">Apagar meu time</button>
      </div>
    </div>
  </section>`;
}

function render(){
  if(!state.me)return renderAuth();
  if(!state.club)return renderCreateClub();
  if(!state.club.state_code)return renderStateSetup();

  const body=state.view==="squad"?squadView():
    state.view==="market"?marketView():
    state.view==="friends"?friendsView():
    state.view==="league"?competitionsView():
    state.view==="club"?clubView():homeView();

  app.innerHTML=`<div class="shell">
    <header class="topbar"><div class="brand"><span class="logo">⚽</span>Dono do Clube</div>
      <div class="top-actions"><span class="coins">● ${Number(state.club.coins).toLocaleString("pt-BR")}</span><button id="logout" class="icon-btn">↪</button></div>
    </header>${body}
  </div>
  <nav class="nav">
    <button data-view="home" class="${state.view==="home"?"on":""}">INÍCIO</button>
    <button data-view="squad" class="${state.view==="squad"?"on":""}">ELENCO</button>
    <button data-view="market" class="${state.view==="market"?"on":""}">MERCADO</button>
    <button data-view="friends" class="${state.view==="friends"?"on":""}">AMIGOS</button>
    <button data-view="league" class="${state.view==="league"?"on":""}">COMPETIÇÕES</button>
    <button data-view="club" class="${state.view==="club"?"on":""}">CLUBE</button>
  </nav>`;

  app.querySelectorAll("[data-view]").forEach(b=>b.onclick=()=>{state.view=b.dataset.view;render()});
  app.querySelector("#logout").onclick=logout;
  if(state.view==="home")bindHome();
  if(state.view==="squad")bindSquad();
  if(state.view==="market")bindMarket();
  if(state.view==="friends")bindFriends();
  if(state.view==="league")bindCompetitions();
  if(state.view==="club")bindClub();
}

function showMatch(m){
  if(!m)return;
  const bg=document.createElement("div");bg.className="modal-bg";
  bg.innerHTML=`<div class="modal">
    <div class="modal-head"><div><div class="kicker">${esc(m.matchType||"Partida")}</div><h2 style="margin:3px 0">${m.reward?`+${m.reward} moedas`:""}</h2></div>
    <button class="secondary close-modal">Fechar</button></div>
    <div class="board"><span>${esc(m.userClub)}<br><small class="muted">OVR ${m.userRating}</small></span><b>${m.userGoals} × ${m.opponentGoals}</b>
    <span>${esc(m.opponent)}<br><small class="muted">OVR ${m.opponentRating}</small></span></div>
    ${m.finance?`<div class="finance-match"><span>Patrocínio: pagamento mensal</span><span>Bilheteria +${Number(m.finance.gate).toLocaleString("pt-BR")}</span><span>Resultado +${Number(m.finance.performance).toLocaleString("pt-BR")}</span><span>Salários: pagamento mensal pelo calendário</span><b>Receita líquida desta partida ${Number(m.finance.net)>=0?"+":""}${Number(m.finance.net).toLocaleString("pt-BR")}</b></div>${m.finance.event?`<div class="msg ok"><b>${esc(m.finance.event.title)}</b><br>${esc(m.finance.event.description)}</div>`:""}`:""}
    <h3>Lances</h3>${m.events?.length?m.events.map(e=>`<div class="event"><b>${e.minute}'</b> ${esc(e.text)}</div>`).join(""):`<div class="empty">Sem lances relevantes.</div>`}
  </div>`;
  document.body.appendChild(bg);bg.querySelector(".close-modal").onclick=()=>bg.remove();bg.onclick=e=>{if(e.target===bg)bg.remove()};
}

async function showClub(id){
  try{
    const d=await api(`/api/clubs/${id}`),c=d.club,bg=document.createElement("div");bg.className="modal-bg";
    bg.innerHTML=`<div class="modal">
      <div class="modal-head"><div class="friend-top">${crestHtml(c,"medium")}<div><h2 style="margin:2px 0">${esc(c.name)}</h2>
      <span class="muted">${c.state_code?esc(STATES[c.state_code]):esc(c.country_code)} · OVR ${c.team_rating}</span></div></div><button class="secondary close-modal">Fechar</button></div>
      <h3>Elenco</h3><div class="club-modal-player head"><span>Jogador</span><span>OVR</span><span>J</span><span>G</span><span>A</span></div>
      ${d.players.map(p=>`<div class="club-modal-player"><span>${p.is_starter?"★ ":""}${esc(p.name)} · ${posName(p.position)}</span><b>${p.rating}</b><span>${p.appearances}</span><span>${p.goals}</span><span>${p.assists}</span></div>`).join("")}
    </div>`;
    document.body.appendChild(bg);bg.querySelector(".close-modal").onclick=()=>bg.remove();bg.onclick=e=>{if(e.target===bg)bg.remove()};
  }catch(err){alert(err.message)}
}

async function careerAction(action){
  const endpoints={state:"/api/state/play-next",national:"/api/national/play-round",copa:"/api/copa/play-next",lib:"/api/libertadores/play-next",next:"/api/career/next-season"};
  try{
    const d=await api(endpoints[action],{method:"POST",body:"{}"});
    await refreshAll();render();
    if(d.userMatch)showMatch(d.userMatch);
  }catch(err){
    alert(err.message);
    await refreshAll().catch(()=>{});
    render();
  }
}

function bindHome(){
  const b=app.querySelector("#careerAction");
  if(b)b.onclick=async()=>{b.disabled=true;b.textContent=b.dataset.action==="national"?"SIMULANDO RODADA...":"SIMULANDO...";await careerAction(b.dataset.action)};
  const gs=app.querySelector("#goSquad");if(gs)gs.onclick=()=>{state.view="squad";render()};
  const cup=app.querySelector("#playCopaHome");if(cup)cup.onclick=async()=>{cup.disabled=true;await careerAction("copa")};
  app.querySelectorAll(".sponsor-offer").forEach(btn=>btn.onclick=async()=>{
    const sponsor=(state.sponsorship?.offers||[]).find(x=>x.id===btn.dataset.sponsor);
    if(!sponsor)return;
    if(!confirm(`Assinar com ${sponsor.name}?\n\n${Number(sponsor.monthly).toLocaleString("pt-BR")} moedas por mês\nLuvas: ${Number(sponsor.signing).toLocaleString("pt-BR")} moedas`))return;
    btn.disabled=true;
    try{
      const d=await api("/api/sponsorships/sign",{method:"POST",body:JSON.stringify({sponsorId:sponsor.id})});
      await refreshAll();render();
      alert(`${d.name} é o novo patrocinador do clube.`);
    }catch(err){alert(err.message);btn.disabled=false}
  });
}
function bindSquad(){
  const formation=app.querySelector("#formation");
  if(formation)formation.onchange=()=>{app.querySelector("#pitchWrap").innerHTML=formationPitch(formation.value)};
  const best=app.querySelector("#bestSquad");
  if(best)best.onclick=()=>{
    const currentFormation=formation?.value||state.club.formation;
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
    suggestRotation(formation?.value||state.club.formation);
    render();
  };
  app.querySelectorAll(".toggle-player").forEach(b=>b.onclick=()=>{
    const p=state.players.find(x=>String(x.id)===String(b.dataset.id));if(!p)return;
    if(Number(p.injury_games||0)>0&&!p.is_starter){alert(`${p.name} está lesionado por ${p.injury_games} jogo(s).`);return}
    if(!p.is_starter&&state.players.filter(x=>x.is_starter).length>=11){alert("Já existem 11 titulares.");return}
    p.is_starter=!p.is_starter;render();
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
      await api("/api/lineup",{method:"PUT",body:JSON.stringify({
        starterIds:state.players.filter(p=>p.is_starter).map(p=>p.id),
        formation:formation?.value||state.club.formation
      })});
      await refreshAll();render();
    }catch(err){alert(err.message)}
  };
}
async function searchTransfers(){
  const qv=encodeURIComponent(app.querySelector("#searchName")?.value||"");
  const pos=encodeURIComponent(app.querySelector("#searchPosition")?.value||"");
  const min=encodeURIComponent(app.querySelector("#searchMinRating")?.value||"0");
  const max=encodeURIComponent(app.querySelector("#searchMaxPrice")?.value||"999999999");
  const box=app.querySelector("#transferResults");
  if(box)box.innerHTML=`<div class="empty">Procurando jogadores...</div>`;
  try{
    const d=await api(`/api/transfers/search?q=${qv}&position=${pos}&minRating=${min}&maxPrice=${max}`);
    state.transferResults=d.players||[];
    state.marketProfile=d.marketProfile||state.marketProfile;
    if(state.finance&&d.transferBan)state.finance.transferBan=d.transferBan;
    if(box)box.innerHTML=transferCards();
    bindTransferButtons();
  }catch(err){
    if(box)box.innerHTML=`<div class="msg">${esc(err.message)}</div>`;
  }
}
function bindTransferButtons(){
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
        setTimeout(()=>{bg.remove();state.view="market";render()},550);
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
  const bg=document.createElement("div");bg.className="modal-bg";
  bg.innerHTML=`<div class="modal">
    <div class="modal-head"><div><div class="kicker">EMPRÉSTIMO</div><h2>${esc(p.name)}</h2><span class="muted">${esc(p.source_club_name)} · ${esc(p.role||p.position)} · OVR ${p.rating}</span></div><button class="secondary close-modal">Fechar</button></div>
    <form id="loanForm" class="stack" style="margin-top:16px">
      <label>Duração<select id="loanMonths"><option value="3">3 meses</option><option value="6" selected>6 meses</option><option value="12">12 meses</option></select></label>
      <label>Taxa mensal ao clube<input id="loanFee" type="number" min="0" value="${suggested}"></label>
      <div class="offer-summary">Taxa sugerida: <b>${suggested.toLocaleString("pt-BR")}/mês</b>. O seu clube também assume o salário mensal do jogador durante o empréstimo.</div>
      <div id="loanMsg"></div>
      <button class="primary">Pedir empréstimo</button>
    </form>
  </div>`;
  document.body.appendChild(bg);
  bg.querySelector(".close-modal").onclick=()=>bg.remove();
  bg.onclick=e=>{if(e.target===bg)bg.remove()};
  bg.querySelector("#loanForm").onsubmit=async e=>{
    e.preventDefault();
    const btn=e.target.querySelector("button.primary");btn.disabled=true;btn.textContent="NEGOCIANDO...";
    try{
      const d=await api("/api/transfers/loan",{method:"POST",body:JSON.stringify({
        playerId:p.id,
        months:Number(bg.querySelector("#loanMonths").value||6),
        monthlyFee:Number(bg.querySelector("#loanFee").value||0)
      })});
      bg.querySelector("#loanMsg").innerHTML=`<div class="msg ${d.accepted?"ok":""}">${esc(d.message)}</div>`;
      if(d.accepted){
        state.transferResults=(state.transferResults||[]).filter(x=>String(x.id)!==String(p.id));
        await refreshAll();
        setTimeout(()=>{bg.remove();state.view="market";render()},550);
      }else{btn.disabled=false;btn.textContent="Pedir empréstimo"}
    }catch(err){
      bg.querySelector("#loanMsg").innerHTML=`<div class="msg">${esc(err.message)}</div>`;
      btn.disabled=false;btn.textContent="Pedir empréstimo";
    }
  };
}

function bindMarket(){
  const form=app.querySelector("#transferSearch");
  if(form)form.onsubmit=async e=>{e.preventDefault();await searchTransfers()};
  bindTransferButtons();
  app.querySelectorAll(".accept-offer").forEach(b=>b.onclick=async()=>{
    const offer=state.incomingOffers.find(o=>String(o.id)===String(b.dataset.id));
    if(!offer||!confirm(`Vender ${offer.player_name} para ${offer.buying_club_name} por ${Number(offer.amount).toLocaleString("pt-BR")} moedas?`))return;
    try{const d=await api(`/api/transfers/incoming/${offer.id}/accept`,{method:"POST",body:"{}"});await refreshAll();render();alert(`${d.playerName} vendido por ${Number(d.amount).toLocaleString("pt-BR")} moedas.`)}catch(err){alert(err.message)}
  });
  app.querySelectorAll(".reject-offer").forEach(b=>b.onclick=async()=>{
    try{await api(`/api/transfers/incoming/${b.dataset.id}/reject`,{method:"POST",body:"{}"});await refreshAll();render()}catch(err){alert(err.message)}
  });
  const check=app.querySelector("#checkOffers");if(check)check.onclick=async()=>{
    check.disabled=true;check.textContent="PROCURANDO...";
    try{const d=await api("/api/transfers/incoming/generate",{method:"POST",body:"{}"});await refreshAll();render();if(!d.created)alert("Nenhuma nova proposta apareceu agora.")}catch(err){alert(err.message);check.disabled=false}
  };
  if(!state.transferResults?.length)searchTransfers();
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
}

let pendingCrest;
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
      state.club=null;
      state.players=[];
      state.market=[];
      state.matches=[];
      state.friends=[];
      state.competitions=null;
      state.finance={wages:0,recent:[],transferBan:{active:false}};
      state.clubEvents=[];
      state.transferResults=[];
      state.trophies=[];
      state.incomingOffers=[];
      state.calendar=null;
      state.sponsorship={active:null,offers:[]};
      state.marketProfile=null;
      state.view="home";
      renderCreateClub();
    }catch(err){
      alert(err.message);
      deleteClub.disabled=false;
      deleteClub.textContent="Apagar meu time";
    }
  };

  app.querySelector("#customForm").onsubmit=async e=>{
    e.preventDefault();
    try{
      const result=await api("/api/club/customize",{method:"PUT",body:JSON.stringify({
        name:name.value,primaryColor:c1.value,secondaryColor:c2.value,crestData:pendingCrest
      })});
      await refreshAll();render();
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
  state.me=null;state.club=null;state.players=[];state.competitions=null;renderAuth();
}
bootstrap();
