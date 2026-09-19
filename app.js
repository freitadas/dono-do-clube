const app=document.querySelector("#app");

const state={
  me:null,club:null,players:[],market:[],matches:[],friends:[],
  competitions:null,view:"home",authMode:"login",competitionTab:"league",selectedRound:1,selectedGroup:"A"
};

async function api(url,options={}){
  const res=await fetch(url,{credentials:"same-origin",headers:{"Content-Type":"application/json",...(options.headers||{})},...options});
  const data=await res.json().catch(()=>({}));
  if(!res.ok)throw new Error(data.error||"Falha na requisição.");
  return data
}
function esc(value){return String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}
function initials(name){return String(name||"FC").split(/\s+/).slice(0,2).map(x=>x[0]).join("").toUpperCase()}
function crestHtml(club,size=""){
  const cls=`crest ${size}`.trim();
  if(club?.crest_data)return `<div class="${cls}"><img src="${club.crest_data}" alt=""></div>`;
  return `<div class="${cls}" style="background:linear-gradient(135deg,${club?.primary_color||"#18864b"},${club?.secondary_color||"#f7fafc"});color:#fff">${esc(initials(club?.name))}</div>`
}
function posName(p){return({GK:"GOL",DEF:"DEF",MID:"MEI",ATT:"ATA"})[p]||p}
function formatDate(v){return new Date(v).toLocaleString("pt-BR",{dateStyle:"short",timeStyle:"short"})}

async function bootstrap(){
  try{
    const d=await api("/api/me");state.me=d.user;state.club=d.club;
    if(state.club)await refreshAll();
    render()
  }catch{renderAuth()}
}
async function refreshAll(){
  const [d,c]=await Promise.all([api("/api/dashboard"),api("/api/competitions")]);
  Object.assign(state,d);state.competitions=c;
  const sr=c.league.season.status==="active"?c.league.season.current_round:38;
  if(!state.selectedRound||state.selectedRound>38)state.selectedRound=sr
}

function renderAuth(){
  app.innerHTML=`<main class="auth"><section class="authbox">
    <div class="brand"><span class="logo">⚽</span>Dono do Clube</div><h1>Seu clube começa aqui.</h1>
    <p>Liga de 20 times, Libertadores, amigos, mercado e estatísticas.</p>
    <div class="switch"><button data-mode="login" class="${state.authMode==="login"?"on":""}">Entrar</button><button data-mode="register" class="${state.authMode==="register"?"on":""}">Criar conta</button></div>
    <form id="authForm" class="stack"><label>E-mail<input type="email" name="email" required></label><label>Senha<input type="password" name="password" minlength="6" maxlength="128" required></label>
    <button class="primary">${state.authMode==="login"?"Entrar":"Criar conta"}</button><div id="authMsg"></div></form>
  </section></main>`;
  app.querySelectorAll("[data-mode]").forEach(b=>b.onclick=()=>{state.authMode=b.dataset.mode;renderAuth()});
  app.querySelector("#authForm").onsubmit=async e=>{
    e.preventDefault();const f=new FormData(e.target);
    try{await api(`/api/auth/${state.authMode}`,{method:"POST",body:JSON.stringify({email:f.get("email"),password:f.get("password")})});await bootstrap()}
    catch(err){app.querySelector("#authMsg").innerHTML=`<div class="msg">${esc(err.message)}</div>`}
  }
}

function renderCreateClub(){
  app.innerHTML=`<main class="auth"><section class="authbox">
    <div class="brand"><span class="logo">⚽</span>Dono do Clube</div><h1>Crie seu clube.</h1>
    <p>Seu clube entrará numa liga com 20 times e 38 rodadas.</p>
    <form id="clubForm" class="stack"><label>Nome<input id="clubName" name="name" value="Meu Clube FC" maxlength="30" required></label>
    <div class="colors"><label>Cor principal<input id="c1" type="color" name="primaryColor" value="#18864b"></label><label>Cor secundária<input id="c2" type="color" name="secondaryColor" value="#f7fafc"></label></div>
    <div id="preview" class="club-preview"></div><button class="primary">Fundar meu clube</button><div id="clubMsg"></div></form>
  </section></main>`;
  const sync=()=>{
    const n=app.querySelector("#clubName").value||"Meu Clube FC",c1=app.querySelector("#c1").value,c2=app.querySelector("#c2").value;
    app.querySelector("#preview").style.background=`linear-gradient(135deg,${c1},${c2})`;
    app.querySelector("#preview").innerHTML=`<div><div class="preview-crest">${esc(initials(n))}</div><h2>${esc(n)}</h2></div>`
  };
  ["clubName","c1","c2"].forEach(id=>app.querySelector("#"+id).oninput=sync);sync();
  app.querySelector("#clubForm").onsubmit=async e=>{
    e.preventDefault();const f=new FormData(e.target);
    try{
      await api("/api/club",{method:"POST",body:JSON.stringify({name:f.get("name"),primaryColor:f.get("primaryColor"),secondaryColor:f.get("secondaryColor")})});
      await refreshAll();state.view="home";render()
    }catch(err){app.querySelector("#clubMsg").innerHTML=`<div class="msg">${esc(err.message)}</div>`}
  }
}

function playerCard(p,own=true){
  return `<article class="player ${p.is_starter?"starter":""}">
    <span class="pos">${posName(p.position)} · ${p.age} anos</span><span class="rating">${p.rating}</span><h4>${esc(p.name)}</h4>
    <div class="attrs"><span>VEL <b>${p.pace}</b></span><span>CHU <b>${p.shooting}</b></span><span>PAS <b>${p.passing}</b></span><span>DEF <b>${p.defending}</b></span></div>
    <div class="pstats"><span>J <b>${p.appearances}</b></span><span>G <b>${p.goals}</b></span><span>A <b>${p.assists}</b></span><span>🟨 <b>${p.yellow_cards}</b></span><span>🟥 <b>${p.red_cards}</b></span><span>SG <b>${p.clean_sheets}</b></span></div>
    ${own?`<div class="player-actions"><button class="${p.is_starter?"primary":"secondary"} toggle-player" data-id="${p.id}">${p.is_starter?"Titular":"Reserva"}</button><button class="danger release-player" data-id="${p.id}" ${p.is_starter?"disabled":""}>Rescindir</button></div>`:""}
  </article>`
}

function nextLeagueFixture(){
  if(!state.competitions)return null;
  const s=state.competitions.league.season;
  if(s.status==="finished")return null;
  return state.competitions.league.fixtures.find(f=>f.round_no===s.current_round&&(String(f.home_club_id)===String(state.club.id)||String(f.away_club_id)===String(state.club.id)))
}

function homeView(){
  const c=state.club,season=state.competitions.league.season,next=nextLeagueFixture();
  return `<section class="hero">
    <div class="club-head">${crestHtml(c)}<div><div class="kicker">${season.status==="active"?`Liga · Rodada ${season.current_round}/38`:"Liga encerrada"}</div><h1>${esc(c.name)}</h1>
    <p>${season.status==="active"?"20 times · 38 rodadas · 19 jogos em casa e 19 fora":"A temporada da liga terminou. Confira a Libertadores."}</p></div></div>
    ${season.status==="active"?`<button id="playBtn" class="primary">⚽ JOGAR E SIMULAR RODADA ${season.current_round}</button>`:`<button id="goLib" class="primary">🏆 VER LIBERTADORES</button>`}
    <div class="stats"><div class="stat"><small>Overall</small><b>${c.team_rating}</b></div><div class="stat"><small>Formação</small><b>${esc(c.formation)}</b></div>
    <div class="stat"><small>Próximo rival</small><b>${next?esc(String(next.home_club_id)===String(c.id)?next.away_name:next.home_name):"—"}</b></div></div>
  </section>
  <section class="grid">
    <div class="card"><div class="section-title"><h2>Últimos jogos</h2><span class="badge">${state.matches.length}</span></div>
      ${state.matches.length?state.matches.slice(0,8).map(m=>`<div class="match"><b>${esc(c.name)}</b><span class="score">${m.user_goals} × ${m.opponent_goals}</span><span class="right">${esc(m.opponent_name)}<br><small class="muted">${m.match_type==="friendly"?"Amistoso":"Liga"}</small></span></div>`).join(""):`<div class="empty">Nenhuma partida disputada.</div>`}
    </div>
    <div class="card"><h2>Temporada</h2><p class="muted">Os 4 primeiros da Liga se classificam para a Libertadores.</p>
      <p class="muted">A Libertadores terá 32 clubes: os 4 classificados + 28 clubes sorteados.</p>
      <p class="muted">São 8 grupos de 4, 6 jogos por clube e os 2 primeiros avançam ao mata-mata.</p>
    </div>
  </section>`
}

function squadView(){
  return `<section class="card"><div class="toolbar"><div><div class="kicker">Gestão do time</div><h2>Elenco e estatísticas</h2></div>
    <label>Formação<select id="formation">${["4-3-3","4-4-2","3-5-2"].map(f=>`<option ${state.club.formation===f?"selected":""}>${f}</option>`).join("")}</select></label></div>
    <p class="muted">Selecione 11 titulares. Para rescindir, deixe o jogador na reserva.</p>
    <div class="players">${state.players.map(p=>playerCard(p,true)).join("")}</div>
    <button id="saveLineup" class="primary" style="margin-top:14px">Salvar escalação</button>
  </section>`
}

function marketView(){
  return `<section class="card"><div class="section-title"><div><div class="kicker">Transferências</div><h2>Mercado</h2></div><span class="coins">● ${Number(state.club.coins).toLocaleString("pt-BR")}</span></div>
  <div class="market-grid">${state.market.map(p=>`<article class="player"><span class="pos">${posName(p.position)} · ${p.age} anos</span><span class="rating">${p.rating}</span><h4>${esc(p.name)}</h4>
  <div class="attrs"><span>VEL <b>${p.pace}</b></span><span>CHU <b>${p.shooting}</b></span><span>PAS <b>${p.passing}</b></span><span>DEF <b>${p.defending}</b></span></div>
  <div class="player-actions"><button class="primary buy-player" data-id="${p.id}">Comprar · ${Number(p.price).toLocaleString("pt-BR")}</button></div></article>`).join("")}</div></section>`
}

function friendsView(){
  return `<section class="card"><div class="section-title"><div><div class="kicker">Multiplayer assíncrono</div><h2>Jogar contra amigos</h2></div><span class="badge">${state.friends.length} amigos</span></div>
  <p class="muted">O amistoso usa o time salvo do seu amigo, mesmo se ele estiver offline.</p>
  <div class="codebox"><span>Seu código</span><code>${esc(state.club.friend_code||"------")}</code><button id="copyCode" class="secondary">Copiar</button></div>
  <div class="friend-add" style="margin-top:12px"><input id="friendCode" maxlength="6" placeholder="Código do amigo"><button id="addFriend" class="primary">Adicionar amigo</button></div>
  <div id="friendMsg" style="margin-top:10px"></div>
  <div class="friends-grid" style="margin-top:14px">${state.friends.length?state.friends.map(f=>`<article class="friend-card"><div class="friend-top">${crestHtml(f,"small")}<div><h4>${esc(f.name)}</h4><span class="muted">OVR ${f.team_rating}</span></div></div>
  <div class="friend-actions"><button class="secondary view-club" data-id="${f.id}">Ver elenco</button><button class="primary play-friend" data-id="${f.id}">Jogar</button></div>
  <button class="danger remove-friend" data-id="${f.id}" style="width:100%;margin-top:7px">Remover</button></article>`).join(""):`<div class="empty">Adicione um amigo pelo código do clube.</div>`}</div></section>`
}

function leagueTable(){
  const l=state.competitions.league;
  return `<div class="competition-info"><span class="badge">20 TIMES</span><span class="badge">38 RODADAS</span><span class="badge">19 CASA + 19 FORA</span><span class="badge">TOP 4 → LIBERTADORES</span></div>
  <div class="table-wrap" style="margin-top:12px"><table>
    <thead><tr><th>#</th><th>Clube</th><th>PTS</th><th>J</th><th>V</th><th>E</th><th>D</th><th>GP</th><th>GC</th><th>SG</th></tr></thead>
    <tbody>${l.standings.map((c,i)=>`<tr class="clickable ${i<4?"qualifier":""} ${String(c.club_id)===String(state.club.id)?"me":""}" data-club="${c.club_id}">
      <td>${i+1}${i<4?" 🏆":""}</td><td><b>${esc(c.name)}</b></td><td><b>${c.points}</b></td><td>${c.wins+c.draws+c.losses}</td><td>${c.wins}</td><td>${c.draws}</td><td>${c.losses}</td>
      <td>${c.goals_for}</td><td>${c.goals_against}</td><td>${c.goal_difference>0?"+":""}${c.goal_difference}</td></tr>`).join("")}</tbody>
  </table></div>`
}

function roundFixtures(){
  const l=state.competitions.league;
  const round=Number(state.selectedRound||l.season.current_round||1);
  const games=l.fixtures.filter(f=>f.round_no===round);
  return `<div class="round-head"><label>Rodada<select id="roundSelect">${Array.from({length:38},(_,i)=>i+1).map(r=>`<option value="${r}" ${r===round?"selected":""}>Rodada ${r}</option>`).join("")}</select></label>
  ${l.season.status==="active"&&round===l.season.current_round?`<button id="playLeagueRound" class="primary">Simular rodada ${round}</button>`:""}</div>
  <div class="fixture-grid">${games.map(f=>`<div class="fixture ${String(f.home_club_id)===String(state.club.id)||String(f.away_club_id)===String(state.club.id)?"user-fixture":""}">
    <span>${esc(f.home_name)}</span><b>${f.played?`${f.home_goals} × ${f.away_goals}`:"×"}</b><span class="right">${esc(f.away_name)}</span>
  </div>`).join("")}</div>`
}

function groupStandings(group){
  const lib=state.competitions.libertadores;
  const rows=lib.entries.filter(e=>e.group_name===group);
  return `<div class="group-card"><h3>Grupo ${group}</h3><table class="mini-table"><thead><tr><th>#</th><th>Clube</th><th>PTS</th><th>J</th><th>SG</th></tr></thead><tbody>
  ${rows.map((e,i)=>`<tr class="${i<2?"qualified":""} clickable" data-club="${e.club_id}"><td>${i+1}</td><td>${esc(e.name)}</td><td><b>${e.points}</b></td><td>${e.wins+e.draws+e.losses}</td><td>${e.goal_difference>0?"+":""}${e.goal_difference}</td></tr>`).join("")}</tbody></table></div>`
}

function libertadoresView(){
  const lib=state.competitions.libertadores;
  if(!lib){
    return `<div class="empty big-empty"><h2>🏆 Libertadores</h2><p>A competição será sorteada quando a Liga terminar após a 38ª rodada.</p><p>Os 4 primeiros da Liga entram numa Libertadores com 32 clubes.</p></div>`
  }
  const s=lib.season;
  if(s.status==="finished"){
    return `<div class="champion-card"><div class="kicker">CAMPEÃO DA LIBERTADORES</div><h2>🏆 ${esc(lib.champion?.name||"Campeão")}</h2></div>${knockoutList(lib)}`
  }
  if(s.current_stage==="GROUP"){
    const md=s.current_matchday;
    const fixtures=lib.fixtures.filter(f=>f.stage==="GROUP"&&f.matchday===md);
    return `<div class="competition-info"><span class="badge">32 TIMES</span><span class="badge">8 GRUPOS DE 4</span><span class="badge">6 JOGOS POR TIME</span><span class="badge">TOP 2 → OITAVAS</span></div>
    <div class="section-title" style="margin-top:15px"><div><h2>Fase de grupos</h2><span class="muted">Próxima rodada: ${md}/6</span></div><button id="playLibNext" class="primary">Simular rodada ${md}</button></div>
    <div class="groups-grid">${"ABCDEFGH".split("").map(groupStandings).join("")}</div>
    <h3>Jogos da rodada ${md}</h3><div class="fixture-grid">${fixtures.map(f=>`<div class="fixture"><span>${esc(f.home_name)}</span><b>${f.played?`${f.home_goals} × ${f.away_goals}`:"×"}</b><span class="right">${esc(f.away_name)}</span></div>`).join("")}</div>`
  }
  const stageNames={R16:"Oitavas de final",QF:"Quartas de final",SF:"Semifinais",FINAL:"Final"};
  const stage=s.current_stage,leg=stage==="FINAL"?1:s.current_leg;
  const fixtures=lib.fixtures.filter(f=>f.stage===stage&&f.leg===leg);
  return `<div class="section-title"><div><div class="kicker">MATA-MATA</div><h2>${stageNames[stage]}</h2><span class="muted">${stage==="FINAL"?"Jogo único":leg===1?"Jogos de ida":"Jogos de volta"}</span></div>
  <button id="playLibNext" class="primary">Simular ${stage==="FINAL"?"final":leg===1?"ida":"volta"}</button></div>
  <div class="fixture-grid">${fixtures.map(f=>`<div class="fixture"><span>${esc(f.home_name)}</span><b>${f.played?`${f.home_goals} × ${f.away_goals}`:"×"}</b><span class="right">${esc(f.away_name)}</span></div>`).join("")}</div>
  ${knockoutList(lib)}`
}

function knockoutList(lib){
  const stages=[["R16","Oitavas"],["QF","Quartas"],["SF","Semifinais"],["FINAL","Final"]];
  return `<div class="knockout-grid">${stages.map(([code,label])=>{
    const fs=lib.fixtures.filter(f=>f.stage===code);
    if(!fs.length)return "";
    return `<div class="knockout-stage"><h3>${label}</h3>${fs.map(f=>`<div class="ko-match"><small>${code==="FINAL"?"Final":`Chave ${f.bracket_slot} · ${f.leg}º jogo`}</small><span>${esc(f.home_name)} ${f.played?`<b>${f.home_goals}</b>`:""}</span><span>${esc(f.away_name)} ${f.played?`<b>${f.away_goals}</b>`:""}</span>${f.penalty_winner_club_id?`<em>Decidido nos pênaltis</em>`:""}</div>`).join("")}</div>`
  }).join("")}</div>`
}

function leagueView(){
  return `<section class="card">
    <div class="competition-tabs"><button data-comp="league" class="${state.competitionTab==="league"?"on":""}">LIGA</button><button data-comp="lib" class="${state.competitionTab==="lib"?"on":""}">LIBERTADORES</button></div>
    ${state.competitionTab==="league"?`<div class="section-title"><div><div class="kicker">Campeonato nacional</div><h2>Liga — 20 clubes</h2><span class="muted">${state.competitions.league.season.status==="active"?`Rodada atual: ${state.competitions.league.season.current_round}/38`:"Temporada encerrada"}</span></div></div>${leagueTable()}<h2 style="margin-top:18px">Tabela de jogos</h2>${roundFixtures()}`:libertadoresView()}
  </section>`
}

function clubView(){
  const c=state.club;
  return `<section class="custom-grid"><div class="card"><div id="clubPreview" class="club-preview" style="background:linear-gradient(135deg,${c.primary_color},${c.secondary_color})"><div>
    <div id="crestPreview" class="preview-crest">${c.crest_data?`<img src="${c.crest_data}" alt="">`:esc(initials(c.name))}</div><h2 id="namePreview">${esc(c.name)}</h2><p>Código: <b>${esc(c.friend_code||"")}</b></p></div></div></div>
    <div class="card"><div class="kicker">Identidade do clube</div><h2>Personalização</h2><form id="customForm" class="stack">
    <label>Nome<input id="customName" value="${esc(c.name)}" maxlength="30" required></label><div class="colors"><label>Cor principal<input id="customPrimary" type="color" value="${c.primary_color}"></label><label>Cor secundária<input id="customSecondary" type="color" value="${c.secondary_color}"></label></div>
    <label class="filebox">Escudo<input id="crestFile" type="file" accept="image/png,image/jpeg,image/webp"><span class="muted">PNG, JPG ou WebP.</span></label>
    <div style="display:flex;gap:8px"><button type="button" id="removeCrest" class="secondary">Remover escudo</button><button class="primary" style="flex:1">Salvar</button></div><div id="customMsg"></div></form></div>
  </section>`
}

function render(){
  if(!state.me)return renderAuth();
  if(!state.club)return renderCreateClub();
  const body=state.view==="squad"?squadView():state.view==="market"?marketView():state.view==="friends"?friendsView():state.view==="league"?leagueView():state.view==="club"?clubView():homeView();
  app.innerHTML=`<div class="shell"><header class="topbar"><div class="brand"><span class="logo">⚽</span>Dono do Clube</div><div class="top-actions"><span class="coins">● ${Number(state.club.coins).toLocaleString("pt-BR")}</span><button id="logout" class="icon-btn">↪</button></div></header>${body}</div>
  <nav class="nav"><button data-view="home" class="${state.view==="home"?"on":""}">INÍCIO</button><button data-view="squad" class="${state.view==="squad"?"on":""}">ELENCO</button><button data-view="market" class="${state.view==="market"?"on":""}">MERCADO</button><button data-view="friends" class="${state.view==="friends"?"on":""}">AMIGOS</button><button data-view="league" class="${state.view==="league"?"on":""}">LIGA</button><button data-view="club" class="${state.view==="club"?"on":""}">CLUBE</button></nav>`;
  app.querySelectorAll("[data-view]").forEach(b=>b.onclick=()=>{state.view=b.dataset.view;render()});
  app.querySelector("#logout").onclick=logout;
  if(state.view==="home")bindHome();
  if(state.view==="squad")bindSquad();
  if(state.view==="market")bindMarket();
  if(state.view==="friends")bindFriends();
  if(state.view==="league")bindLeague();
  if(state.view==="club")bindClub()
}

function showMatch(m){
  if(!m)return;
  const bg=document.createElement("div");bg.className="modal-bg";
  bg.innerHTML=`<div class="modal"><div class="modal-head"><div><div class="kicker">${m.matchType==="friendly"?"AMISTOSO":"LIGA"}</div><h2 style="margin:3px 0">${m.reward?`+${m.reward} moedas`:"Sem recompensa"}</h2></div><button class="secondary close-modal">Fechar</button></div>
  <div class="board"><span>${esc(m.userClub)}<br><small class="muted">OVR ${m.userRating}</small></span><b>${m.userGoals} × ${m.opponentGoals}</b><span>${esc(m.opponent)}<br><small class="muted">OVR ${m.opponentRating}</small></span></div>
  <h3>Lances</h3>${m.events.length?m.events.map(e=>`<div class="event"><b>${e.minute}'</b> ${esc(e.text)}</div>`).join(""):`<div class="empty">Sem gols ou cartões.</div>`}</div>`;
  document.body.appendChild(bg);bg.querySelector(".close-modal").onclick=()=>bg.remove();bg.onclick=e=>{if(e.target===bg)bg.remove()}
}

async function showClub(id){
  try{
    const d=await api(`/api/clubs/${id}`),c=d.club,bg=document.createElement("div");bg.className="modal-bg";
    bg.innerHTML=`<div class="modal"><div class="modal-head"><div class="friend-top">${crestHtml(c,"medium")}<div><div class="kicker">${c.is_ai?"Clube do sistema":"Clube de jogador"}</div><h2 style="margin:2px 0">${esc(c.name)}</h2><span class="muted">OVR ${c.team_rating} · ${c.formation}</span></div></div><button class="secondary close-modal">Fechar</button></div>
    <h3>Elenco</h3><div class="club-modal-player head"><span>Jogador</span><span>OVR</span><span>J</span><span>G</span><span>A</span></div>
    ${d.players.map(p=>`<div class="club-modal-player"><span>${p.is_starter?"★ ":""}${esc(p.name)} · ${posName(p.position)}</span><b>${p.rating}</b><span>${p.appearances}</span><span>${p.goals}</span><span>${p.assists}</span></div>`).join("")}</div>`;
    document.body.appendChild(bg);bg.querySelector(".close-modal").onclick=()=>bg.remove();bg.onclick=e=>{if(e.target===bg)bg.remove()}
  }catch(err){alert(err.message)}
}

async function playLeague(){
  try{
    const d=await api("/api/league/play-round",{method:"POST",body:"{}"});
    await refreshAll();state.selectedRound=d.round;render();showMatch(d.userMatch)
  }catch(err){alert(err.message);await refreshAll();render()}
}

function bindHome(){
  const play=app.querySelector("#playBtn");if(play)play.onclick=async e=>{e.currentTarget.disabled=true;e.currentTarget.textContent="SIMULANDO 10 JOGOS...";await playLeague()};
  const gl=app.querySelector("#goLib");if(gl)gl.onclick=()=>{state.view="league";state.competitionTab="lib";render()}
}
function bindSquad(){
  app.querySelectorAll(".toggle-player").forEach(b=>b.onclick=()=>{const p=state.players.find(x=>String(x.id)===String(b.dataset.id));if(!p)return;if(!p.is_starter&&state.players.filter(x=>x.is_starter).length>=11){alert("Já existem 11 titulares.");return}p.is_starter=!p.is_starter;render()});
  app.querySelectorAll(".release-player").forEach(b=>b.onclick=async()=>{const p=state.players.find(x=>String(x.id)===String(b.dataset.id));if(!p||!confirm(`Rescindir com ${p.name}?`))return;try{await api(`/api/players/${p.id}/release`,{method:"POST",body:"{}"});await refreshAll();render()}catch(err){alert(err.message)}});
  app.querySelector("#saveLineup").onclick=async()=>{try{await api("/api/lineup",{method:"PUT",body:JSON.stringify({starterIds:state.players.filter(p=>p.is_starter).map(p=>p.id),formation:app.querySelector("#formation").value})});await refreshAll();render()}catch(err){alert(err.message)}}
}
function bindMarket(){
  app.querySelectorAll(".buy-player").forEach(b=>b.onclick=async()=>{b.disabled=true;try{await api("/api/market/buy",{method:"POST",body:JSON.stringify({playerId:b.dataset.id})});await refreshAll();render()}catch(err){alert(err.message);b.disabled=false}})
}
function bindFriends(){
  app.querySelector("#copyCode").onclick=async()=>{try{await navigator.clipboard.writeText(state.club.friend_code);app.querySelector("#friendMsg").innerHTML=`<div class="msg ok">Código copiado.</div>`}catch{alert(state.club.friend_code)}};
  app.querySelector("#addFriend").onclick=async()=>{try{await api("/api/friends/add",{method:"POST",body:JSON.stringify({code:app.querySelector("#friendCode").value.trim()})});await refreshAll();render()}catch(err){app.querySelector("#friendMsg").innerHTML=`<div class="msg">${esc(err.message)}</div>`}};
  app.querySelectorAll(".view-club").forEach(b=>b.onclick=()=>showClub(b.dataset.id));
  app.querySelectorAll(".play-friend").forEach(b=>b.onclick=async()=>{try{const d=await api(`/api/friends/${b.dataset.id}/play`,{method:"POST",body:"{}"});await refreshAll();render();showMatch(d.match)}catch(err){alert(err.message)}});
  app.querySelectorAll(".remove-friend").forEach(b=>b.onclick=async()=>{if(!confirm("Remover amigo?"))return;try{await api(`/api/friends/${b.dataset.id}`,{method:"DELETE"});await refreshAll();render()}catch(err){alert(err.message)}})
}
function bindLeague(){
  app.querySelectorAll("[data-comp]").forEach(b=>b.onclick=()=>{state.competitionTab=b.dataset.comp;render()});
  app.querySelectorAll("[data-club]").forEach(r=>r.onclick=()=>showClub(r.dataset.club));
  const rs=app.querySelector("#roundSelect");if(rs)rs.onchange=()=>{state.selectedRound=Number(rs.value);render()};
  const pr=app.querySelector("#playLeagueRound");if(pr)pr.onclick=async()=>{pr.disabled=true;pr.textContent="SIMULANDO...";await playLeague()};
  const pl=app.querySelector("#playLibNext");if(pl)pl.onclick=async()=>{pl.disabled=true;pl.textContent="SIMULANDO...";try{const d=await api("/api/libertadores/next",{method:"POST",body:"{}"});await refreshAll();render();alert(d.description)}catch(err){alert(err.message);await refreshAll();render()}}
}

let pendingCrest;
function bindClub(){
  pendingCrest=state.club.crest_data||null;
  const name=app.querySelector("#customName"),c1=app.querySelector("#customPrimary"),c2=app.querySelector("#customSecondary");
  const sync=()=>{app.querySelector("#clubPreview").style.background=`linear-gradient(135deg,${c1.value},${c2.value})`;app.querySelector("#namePreview").textContent=name.value||"Clube";app.querySelector("#crestPreview").innerHTML=pendingCrest?`<img src="${pendingCrest}" alt="">`:esc(initials(name.value))};
  [name,c1,c2].forEach(el=>el.oninput=sync);
  app.querySelector("#crestFile").onchange=async e=>{const file=e.target.files?.[0];if(!file)return;try{pendingCrest=await resizeImage(file,256,256);sync()}catch(err){alert(err.message)}};
  app.querySelector("#removeCrest").onclick=()=>{pendingCrest=null;sync()};
  app.querySelector("#customForm").onsubmit=async e=>{e.preventDefault();try{await api("/api/club/customize",{method:"PUT",body:JSON.stringify({name:name.value,primaryColor:c1.value,secondaryColor:c2.value,crestData:pendingCrest})});await refreshAll();render()}catch(err){app.querySelector("#customMsg").innerHTML=`<div class="msg">${esc(err.message)}</div>`}}
}
function resizeImage(file,maxW,maxH){
  return new Promise((resolve,reject)=>{
    if(!/^image\/(png|jpeg|webp)$/.test(file.type))return reject(new Error("Use PNG, JPG ou WebP."));
    const reader=new FileReader();reader.onerror=()=>reject(new Error("Falha ao ler imagem."));
    reader.onload=()=>{const img=new Image();img.onerror=()=>reject(new Error("Imagem inválida."));img.onload=()=>{const scale=Math.min(maxW/img.width,maxH/img.height,1),w=Math.max(1,Math.round(img.width*scale)),h=Math.max(1,Math.round(img.height*scale)),canvas=document.createElement("canvas");canvas.width=maxW;canvas.height=maxH;const ctx=canvas.getContext("2d");ctx.clearRect(0,0,maxW,maxH);ctx.drawImage(img,(maxW-w)/2,(maxH-h)/2,w,h);const data=canvas.toDataURL("image/webp",.86);if(data.length>650000)return reject(new Error("Imagem grande demais."));resolve(data)};img.src=reader.result};reader.readAsDataURL(file)
  })
}
async function logout(){await api("/api/auth/logout",{method:"POST",body:"{}"}).catch(()=>{});state.me=null;state.club=null;state.players=[];state.competitions=null;renderAuth()}
bootstrap();
