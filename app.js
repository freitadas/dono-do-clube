
const app=document.querySelector("#app");
const STATES={"AC": "Acre", "AL": "Alagoas", "AP": "Amapá", "AM": "Amazonas", "BA": "Bahia", "CE": "Ceará", "DF": "Distrito Federal", "ES": "Espírito Santo", "GO": "Goiás", "MA": "Maranhão", "MT": "Mato Grosso", "MS": "Mato Grosso do Sul", "MG": "Minas Gerais", "PA": "Pará", "PB": "Paraíba", "PR": "Paraná", "PE": "Pernambuco", "PI": "Piauí", "RJ": "Rio de Janeiro", "RN": "Rio Grande do Norte", "RS": "Rio Grande do Sul", "RO": "Rondônia", "RR": "Roraima", "SC": "Santa Catarina", "SP": "São Paulo", "SE": "Sergipe", "TO": "Tocantins"};

const state={
  me:null,club:null,players:[],market:[],matches:[],friends:[],competitions:null,
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
  const [d,c]=await Promise.all([api("/api/dashboard"),api("/api/competitions")]);
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
    app.querySelector("#preview").innerHTML=`<div><div class="preview-crest">${esc(initials(n))}</div><h2>${esc(n)}</h2><p>Começa na Série D</p></div>`;
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

function playerCard(p){
  return `<article class="player ${p.is_starter?"starter":""}">
    <span class="pos">${posName(p.position)} · ${p.age} anos</span>
    <span class="rating">${p.rating}</span>
    <h4>${esc(p.name)}</h4>
    <div class="attrs">
      <span>VEL <b>${p.pace}</b></span><span>CHU <b>${p.shooting}</b></span>
      <span>PAS <b>${p.passing}</b></span><span>DEF <b>${p.defending}</b></span>
    </div>
    <div class="pstats">
      <span>J <b>${p.appearances}</b></span><span>G <b>${p.goals}</b></span>
      <span>A <b>${p.assists}</b></span><span>🟨 <b>${p.yellow_cards}</b></span>
      <span>🟥 <b>${p.red_cards}</b></span><span>SG <b>${p.clean_sheets}</b></span>
    </div>
    <div class="player-actions">
      <button class="${p.is_starter?"primary":"secondary"} toggle-player" data-id="${p.id}">${p.is_starter?"Titular":"Reserva"}</button>
      <button class="danger release-player" data-id="${p.id}" ${p.is_starter?"disabled":""}>Rescindir</button>
    </div>
  </article>`;
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

function homeView(){
  const c=state.club,car=state.competitions.career,pos=userPosition();
  let action="";
  if(car.phase==="STATE")action=`<button id="careerAction" data-action="state" class="primary">🏟️ JOGAR PRÓXIMA FASE DO ESTADUAL</button>`;
  if(car.phase==="NATIONAL")action=`<button id="careerAction" data-action="national" class="primary">⚽ JOGAR RODADA ${car.current_round}/38</button>`;
  if(car.phase==="LIBERTADORES")action=`<button id="careerAction" data-action="lib" class="primary">🏆 JOGAR PRÓXIMA FASE DA LIBERTADORES</button>`;
  if(car.phase==="END")action=`<button id="careerAction" data-action="next" class="primary">📅 IR PARA A PRÓXIMA TEMPORADA</button>`;

  return `<section class="hero">
    <div class="club-head">${crestHtml(c)}<div>
      <div class="kicker">Temporada ${car.season_no} · ${phaseName(car.phase)}</div>
      <h1>${esc(c.name)}</h1>
      <p>${esc(STATES[c.state_code])} · Série ${car.user_division}${pos?` · ${pos}º lugar`:""}</p>
    </div></div>
    ${action}
    <div class="stats">
      <div class="stat"><small>Overall</small><b>${c.team_rating}</b></div>
      <div class="stat"><small>Divisão</small><b>Série ${car.user_division}</b></div>
      <div class="stat"><small>Fase</small><b>${phaseName(car.phase)}</b></div>
      <div class="stat"><small>Temporada</small><b>${car.season_no}</b></div>
    </div>
  </section>
  ${car.phase==="END"?`<section class="season-end" style="margin-top:14px">
    <div class="kicker">FIM DA TEMPORADA</div>
    <h2>${nextDivision()!==car.user_division?`Você vai para a Série ${nextDivision()}`:`Você permanece na Série ${car.user_division}`}</h2>
    <p>A próxima temporada reinicia as tabelas e o Estadual. Seu elenco, dinheiro, escudo e estatísticas de carreira continuam.</p>
  </section>`:""}
  <section class="grid">
    <div class="card"><div class="section-title"><h2>Últimos jogos</h2><span class="badge">${state.matches.length}</span></div>
      ${state.matches.length?state.matches.slice(0,8).map(m=>`<div class="match">
        <b>${esc(c.name)}</b><span class="score">${m.user_goals} × ${m.opponent_goals}</span>
        <span class="right">${esc(m.opponent_name)}<br><small class="muted">${esc(m.match_type)}</small></span>
      </div>`).join(""):`<div class="empty">Nenhum jogo ainda.</div>`}
    </div>
    <div class="card">
      <h2>Carreira</h2>
      <p class="muted">Série D → Série C → Série B → Série A.</p>
      <p class="muted">4 sobem e 4 caem em A, B e C. A Série D não tem rebaixamento.</p>
      <p class="muted">Somente os 4 primeiros da Série A vão para a Libertadores.</p>
    </div>
  </section>`;
}

function squadView(){
  return `<section class="card">
    <div class="toolbar"><div><div class="kicker">Gestão do time</div><h2>Elenco e estatísticas</h2></div>
      <label>Formação<select id="formation">${["4-3-3","4-4-2","3-5-2"].map(f=>`<option ${state.club.formation===f?"selected":""}>${f}</option>`).join("")}</select></label>
    </div>
    <p class="muted">Seu elenco inicial é equilibrado para a Série D. A força dos adversários aumenta nas divisões superiores.</p>
    <div class="players">${state.players.map(playerCard).join("")}</div>
    <button id="saveLineup" class="primary" style="margin-top:14px">Salvar escalação</button>
  </section>`;
}

function marketView(){
  return `<section class="card">
    <div class="section-title"><div><div class="kicker">Transferências</div><h2>Mercado</h2></div><span class="coins">● ${Number(state.club.coins).toLocaleString("pt-BR")}</span></div>
    <div class="market-grid">${state.market.map(p=>`<article class="player">
      <span class="pos">${posName(p.position)} · ${p.age} anos</span><span class="rating">${p.rating}</span><h4>${esc(p.name)}</h4>
      <div class="attrs"><span>VEL <b>${p.pace}</b></span><span>CHU <b>${p.shooting}</b></span><span>PAS <b>${p.passing}</b></span><span>DEF <b>${p.defending}</b></span></div>
      <div class="player-actions"><button class="primary buy-player" data-id="${p.id}">Comprar · ${Number(p.price).toLocaleString("pt-BR")}</button></div>
    </article>`).join("")}</div>
  </section>`;
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

function competitionsView(){
  const car=state.competitions.career;
  if(!["STATE","A","B","C","D","LIB"].includes(state.competitionTab))state.competitionTab=car.user_division;
  const content=state.competitionTab==="STATE"?stateView():state.competitionTab==="LIB"?libertadoresView():divisionView(state.competitionTab);
  return `<section class="card">
    <div class="competition-tabs">
      <button data-comp="STATE" class="${state.competitionTab==="STATE"?"on":""}">ESTADUAL</button>
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
        <label>Nome<input id="customName" value="${esc(c.name)}" maxlength="30" required></label>
        <label>Estado<input value="${esc(STATES[c.state_code])}" disabled></label>
        <div class="colors"><label>Cor principal<input id="customPrimary" type="color" value="${c.primary_color}"></label>
        <label>Cor secundária<input id="customSecondary" type="color" value="${c.secondary_color}"></label></div>
        <label class="filebox">Escudo<input id="crestFile" type="file" accept="image/png,image/jpeg,image/webp"><span class="muted">PNG, JPG ou WebP.</span></label>
        <div style="display:flex;gap:8px"><button type="button" id="removeCrest" class="secondary">Remover escudo</button><button class="primary" style="flex:1">Salvar</button></div>
        <div id="customMsg"></div>
      </form>
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
  const endpoints={state:"/api/state/play-next",national:"/api/national/play-round",lib:"/api/libertadores/play-next",next:"/api/career/next-season"};
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
  if(b)b.onclick=async()=>{b.disabled=true;b.textContent="SIMULANDO...";await careerAction(b.dataset.action)};
}
function bindSquad(){
  app.querySelectorAll(".toggle-player").forEach(b=>b.onclick=()=>{
    const p=state.players.find(x=>String(x.id)===String(b.dataset.id));if(!p)return;
    if(!p.is_starter&&state.players.filter(x=>x.is_starter).length>=11){alert("Já existem 11 titulares.");return}
    p.is_starter=!p.is_starter;render();
  });
  app.querySelectorAll(".release-player").forEach(b=>b.onclick=async()=>{
    const p=state.players.find(x=>String(x.id)===String(b.dataset.id));
    if(!p||!confirm(`Rescindir com ${p.name}?`))return;
    try{await api(`/api/players/${p.id}/release`,{method:"POST",body:"{}"});await refreshAll();render()}catch(err){alert(err.message)}
  });
  app.querySelector("#saveLineup").onclick=async()=>{
    try{
      await api("/api/lineup",{method:"PUT",body:JSON.stringify({
        starterIds:state.players.filter(p=>p.is_starter).map(p=>p.id),
        formation:app.querySelector("#formation").value
      })});
      await refreshAll();render();
    }catch(err){alert(err.message)}
  };
}
function bindMarket(){
  app.querySelectorAll(".buy-player").forEach(b=>b.onclick=async()=>{
    b.disabled=true;
    try{await api("/api/market/buy",{method:"POST",body:JSON.stringify({playerId:b.dataset.id})});await refreshAll();render()}
    catch(err){alert(err.message);b.disabled=false}
  });
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
  app.querySelector("#customForm").onsubmit=async e=>{
    e.preventDefault();
    try{
      await api("/api/club/customize",{method:"PUT",body:JSON.stringify({
        name:name.value,primaryColor:c1.value,secondaryColor:c2.value,crestData:pendingCrest
      })});
      await refreshAll();render();
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
