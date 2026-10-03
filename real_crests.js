/* Dono do Clube v63 — catálogo de escudos reais
 * Fonte comunitária: hixcoder/football-teams-flags (URLs do football-logos.cc).
 * O catálogo é carregado no navegador e mantido em cache local.
 */
(()=>{
  const CATALOG_URL="https://raw.githubusercontent.com/hixcoder/football-teams-flags/main/football_teams.json";
  const CACHE_KEY="dono_do_clube_real_crests_v63";
  const CACHE_MAX_AGE=7*24*60*60*1000;
  const COUNTRY_EN={
    BR:"Brazil",ARG:"Argentina",ENG:"England",ESP:"Spain",ITA:"Italy",GER:"Germany",FRA:"France",POR:"Portugal",
    NED:"Netherlands",BEL:"Belgium",TUR:"Turkey",SCO:"Scotland",MEX:"Mexico",USA:"Usa",JPN:"Japan",KSA:"Saudi Arabia",
    URU:"Uruguay",COL:"Colombia",AUT:"Austria",SUI:"Switzerland",DEN:"Denmark",NOR:"Norway",SWE:"Sweden",POL:"Poland",
    CZE:"Czech Republic",CRO:"Croatia",GRE:"Greece",CHI:"Chile",ECU:"Ecuador",PER:"Peru",KOR:"South Korea",
    UAE:"United Arab Emirates",IRN:"Iran",EGY:"Egypt",MAR:"Morocco",RSA:"South Africa",TUN:"Tunisia",COD:"DR Congo",
    ANG:"Angola",NZL:"New Zealand",PNG:"Papua New Guinea",HOST:"Usa"
  };

  const NATIONAL_DIRECT={
    BR:"https://assets.football-logos.cc/logos/brazil/256x256/brazil-national-team.fd8ca234.png",
    ARG:"https://assets.football-logos.cc/logos/argentina/256x256/argentina-national-team.fa79bd47.png",
    ENG:"https://assets.football-logos.cc/logos/england/256x256/england-national-team.8e08a37d.png",
    ESP:"https://assets.football-logos.cc/logos/spain/256x256/spain-national-team.f3f017d0.png",
    ITA:"https://assets.football-logos.cc/logos/italy/256x256/italy-national-team.e86a120c.png",
    GER:"https://assets.football-logos.cc/logos/germany/256x256/germany-national-team.6c5e7edf.png",
    FRA:"https://assets.football-logos.cc/logos/france/256x256/france-national-team.3417e562.png",
    POR:"https://crests.football-data.org/765.svg",
    NED:"https://assets.football-logos.cc/logos/netherlands/256x256/dutch-national-team.3fd62267.png",
    BEL:"https://assets.football-logos.cc/logos/belgium/256x256/belgium-national-team.28a4fd00.png",
    TUR:"https://assets.football-logos.cc/logos/turkey/256x256/turkey-national-team.47b9d986.png",
    SCO:"https://assets.football-logos.cc/logos/scotland/256x256/scotland-national-team.bb5a6c4f.png",
    MEX:"https://assets.football-logos.cc/logos/mexico/256x256/mexico-national-team.11d7d44f.png",
    USA:"https://assets.football-logos.cc/logos/usa/256x256/usa-national-team.ea8d4ff6.png",
    JPN:"https://assets.football-logos.cc/logos/japan/256x256/japan-national-team.f37cca5f.png",
    KSA:"https://assets.football-logos.cc/logos/saudi-arabia/256x256/saudi-arabia-national-team.c25f1a8d.png",
    URU:"https://assets.football-logos.cc/logos/uruguay/256x256/uruguay-national-team.f4de4cd6.png",
    COL:"https://assets.football-logos.cc/logos/colombia/256x256/colombia-national-team.a6492bc7.png",
    AUT:"https://assets.football-logos.cc/logos/austria/256x256/austria-national-team.1fa7bfd8.png",
    SUI:"https://assets.football-logos.cc/logos/switzerland/256x256/switzerland-national-team.4c74693e.png",
    DEN:"https://assets.football-logos.cc/logos/denmark/256x256/denmark-national-team.9d5a1b50.png",
    NOR:"https://assets.football-logos.cc/logos/norway/256x256/norway-national-team.b6afb6fa.png",
    SWE:"https://assets.football-logos.cc/logos/sweden/256x256/sweden-national-team.02516fd9.png",
    POL:"https://assets.football-logos.cc/logos/poland/256x256/poland-national-team.859a4472.png",
    CZE:"https://assets.football-logos.cc/logos/czech-republic/256x256/czech-republic-national-team.22a2a846.png",
    CRO:"https://assets.football-logos.cc/logos/croatia/256x256/croatia-national-team.585829ca.png",
    GRE:"https://assets.football-logos.cc/logos/greece/256x256/greece-national-team.fdecda50.png",
    CHI:"https://assets.football-logos.cc/logos/chile/256x256/chile-national-team.81862e87.png",
    ECU:"https://assets.football-logos.cc/logos/ecuador/256x256/ecuador-national-team.dfe16615.png",
    PER:"https://assets.football-logos.cc/logos/peru/256x256/peru-national-team.9b887a65.png"
  };

  const MANUAL_ALIASES={
    "atletico mineiro":["atletico mg","clube atletico mineiro"],
    "america mineiro":["america mg"],
    "atletico goianiense":["atletico go"],
    "athletico paranaense":["athletico pr","atletico paranaense"],
    "red bull bragantino":["bragantino","rb bragantino"],
    "sport recife":["sport"],
    "vasco da gama":["vasco","cr vasco da gama"],
    "vitoria":["vitoria ba"],
    "bayern munich":["bayern munchen","fc bayern munchen"],
    "inter milan":["inter","internazionale"],
    "ac milan":["milan"],
    "paris saint germain":["psg"],
    "al ahli saudi":["al ahli"],
    "inter miami":["inter miami cf"],
    "seattle sounders":["seattle sounders fc"],
    "lafc":["los angeles fc"],
    "club america":["america"],
    "esperance de tunis":["esperance tunis"],
    "wolverhampton":["wolverhampton wanderers","wolves"],
    "brighton":["brighton hove albion","brighton and hove albion"],
    "west bromwich albion":["west brom"],
    "tottenham":["tottenham hotspur"],
    "newcastle united":["newcastle"],
    "manchester united":["man utd"],
    "manchester city":["man city"],
    "nottingham forest":["nottm forest"],
    "real sociedad":["real sociedad de futbol"],
    "athletic bilbao":["athletic club"],
    "real betis":["real betis balompie"],
    "borussia monchengladbach":["borussia mgladbach","monchengladbach"]
  };

  let teams=[];
  let byName=new Map();
  let readyResolved=false;

  function ascii(value){
    return String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"");
  }
  function normalize(value){
    return ascii(value)
      .toLowerCase()
      .replace(/&/g," and ")
      .replace(/\([^)]*\)/g," ")
      .replace(/[’'`.]/g,"")
      .replace(/[^a-z0-9]+/g," ")
      .replace(/\s+/g," ")
      .trim();
  }
  function withoutDesignators(value){
    const stop=new Set(["fc","cf","sc","afc","fk","sk","sv","ac","ca","cd","ec","se","aa"]);
    const parts=normalize(value).split(" ").filter(Boolean);
    while(parts.length>1&&stop.has(parts[0]))parts.shift();
    while(parts.length>1&&stop.has(parts[parts.length-1]))parts.pop();
    return parts.join(" ");
  }
  function variants(value){
    const raw=normalize(value);
    const out=new Set([raw,withoutDesignators(raw)]);
    // Sufixos usados pelo jogo para estado/país/confederação.
    out.add(normalize(String(value||"").replace(/\s*\([A-Z]{2,12}\)\s*$/i,"")));
    out.add(normalize(String(value||"").replace(/-([A-Z]{2})\s*$/i," $1")));
    const noState=normalize(String(value||"").replace(/-([A-Z]{2})\s*$/i,""));
    if(noState)out.add(noState);
    const base=normalize(String(value||"").replace(/\s*\([A-Z]{2,12}\)\s*$/i,"").replace(/-([A-Z]{2})\s*$/i,""));
    if(base)out.add(withoutDesignators(base));
    for(const k of [...out])for(const a of (MANUAL_ALIASES[k]||[]))out.add(normalize(a));
    return [...out].filter(Boolean);
  }
  function index(list){
    teams=Array.isArray(list)?list.filter(x=>x&&x.name&&x.logoUrl):[];
    byName=new Map();
    for(const t of teams){
      for(const k of variants(t.name)){
        if(!byName.has(k))byName.set(k,[]);
        byName.get(k).push(t);
      }
      if(/ national team$/i.test(t.name)){
        const short=t.name.replace(/ national team$/i,"");
        for(const k of variants(short)){
          if(!byName.has(k))byName.set(k,[]);
          byName.get(k).push(t);
        }
      }
    }
  }
  function pick(candidates,countryCode){
    if(!candidates?.length)return null;
    const quality=x=>/\/256x256\//.test(String(x?.logoUrl||""))?3:/\/128x128\//.test(String(x?.logoUrl||""))?2:/\/64x64\//.test(String(x?.logoUrl||""))?1:0;
    const ranked=[...candidates].sort((a,b)=>quality(b)-quality(a));
    const expected=normalize(COUNTRY_EN[String(countryCode||"").toUpperCase()]||"");
    if(expected){
      const exact=ranked.find(x=>normalize(x.country)===expected);
      if(exact)return exact;
      const loose=ranked.find(x=>normalize(x.country).includes(expected)||expected.includes(normalize(x.country)));
      if(loose)return loose;
    }
    return ranked[0];
  }
  function find(name,countryCode,{national=false}={}){
    if(!name||!byName.size)return null;
    const test=[];
    if(national){
      const en=COUNTRY_EN[String(countryCode||"").toUpperCase()];
      if(en)test.push(`${en} National Team`,en);
      test.push(`${name} National Team`,name);
    }else test.push(name);
    for(const q of test){
      for(const key of variants(q)){
        const candidates=byName.get(key);
        if(!candidates?.length)continue;
        const filtered=national?candidates.filter(x=>/ national team$/i.test(x.name)):candidates.filter(x=>!/ national team$/i.test(x.name));
        const chosen=pick(filtered.length?filtered:candidates,countryCode);
        if(chosen?.logoUrl)return chosen.logoUrl;
      }
    }
    return null;
  }
  function slug(value){
    return ascii(value)
      .toLowerCase()
      .replace(/\([^)]*\)/g," ")
      .replace(/[’'`.]/g,"")
      .replace(/&/g," and ")
      .replace(/[^a-z0-9]+/g,"-")
      .replace(/^-+|-+$/g,"")
      .replace(/-+/g,"-");
  }
  function footyLogoCandidates(club){
    const name=String(club?.name||"").trim();
    if(!name)return [];
    const raw=[];
    const cleanConf=name.replace(/\s*\([A-Z]{2,12}\)\s*$/i,"").trim();
    const noState=cleanConf.replace(/-([A-Z]{2})\s*$/i,"").trim();
    raw.push(cleanConf);
    // Em clubes estaduais, o sufixo UF é importante para desambiguar nomes repetidos.
    if(/-([A-Z]{2})\s*$/i.test(cleanConf))raw.push(cleanConf.replace(/-([A-Z]{2})\s*$/i," $1"));
    // Só tentamos a forma sem UF depois da forma específica.
    if(noState&&noState!==cleanConf)raw.push(noState);
    for(const v of variants(cleanConf))raw.push(v);
    const aliases=[];
    for(const v of variants(cleanConf))for(const a of (MANUAL_ALIASES[v]||[]))aliases.push(a);
    raw.push(...aliases);
    const seen=new Set(), urls=[];
    for(const candidate of raw){
      const s=slug(candidate);
      if(!s||seen.has(s))continue;
      seen.add(s);
      urls.push(`https://assets.footylogos.com/logos/${s}-logo-footylogos.svg`);
    }
    return urls;
  }
  function clubCandidates(club){
    const out=[];
    const custom=String(club?.crest_data||"");
    if(custom&&!/^data:image\/svg\+xml/i.test(custom))out.push(custom);
    const primary=find(club?.name,club?.country_code||club?.country,{national:false});
    if(primary)out.push(primary);
    // Segunda fonte real: amplia a cobertura sobretudo dos estaduais brasileiros.
    out.push(...footyLogoCandidates(club));
    return [...new Set(out.filter(Boolean))];
  }

  async function load(){
    let cached=null;
    try{
      const raw=localStorage.getItem(CACHE_KEY);
      if(raw){
        const parsed=JSON.parse(raw);
        if(parsed?.savedAt&&Array.isArray(parsed.teams)){
          cached=parsed;
          index(parsed.teams);
          if(Date.now()-Number(parsed.savedAt)<CACHE_MAX_AGE){readyResolved=true;return teams.length;}
        }
      }
    }catch{}
    try{
      const res=await fetch(CATALOG_URL,{cache:"force-cache"});
      if(!res.ok)throw new Error(`HTTP ${res.status}`);
      const data=await res.json();
      index(data);
      try{
        const compact=teams.map(x=>({name:x.name,country:x.country,logoUrl:x.logoUrl}));
        localStorage.setItem(CACHE_KEY,JSON.stringify({savedAt:Date.now(),teams:compact}));
      }catch{}
    }catch(err){
      if(!cached)console.warn("Catálogo de escudos reais indisponível:",err);
    }
    readyResolved=true;
    return teams.length;
  }

  const ready=load();
  window.RealCrests={
    ready,
    get loaded(){return readyResolved&&teams.length>0},
    club(club){return clubCandidates(club)[0]||"";},
    clubCandidates,
    national(code,name){const key=String(code||"").toUpperCase();return NATIONAL_DIRECT[key]||find(name||COUNTRY_EN[key]||code,code,{national:true});},
    findClub(name,countryCode){return find(name,countryCode,{national:false});},
    findNational(code,name){const key=String(code||"").toUpperCase();return NATIONAL_DIRECT[key]||find(name||code,code,{national:true});},
    catalogUrl:CATALOG_URL
  };
})();
