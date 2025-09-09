// Minimal SPA + analyzer logic (green/black theme)

const $ = (s, ctx=document) => ctx.querySelector(s);
const $$ = (s, ctx=document) => Array.from(ctx.querySelectorAll(s));

/* ------- Router ------- */
const routes = {
  "#/home":"page-home",
  "#/analyzer":"page-analyzer",
  "#/voc":"page-voc",
  "#/recommendations":"page-recommendations",
  "#/accessibility":"page-accessibility",
  "#/report":"page-report"
};
function route(){
  const hash = location.hash || "#/home";
  $$("#app [data-page]").forEach(sec => sec.hidden = true);
  const id = routes[hash] || "page-home";
  $("#"+id).hidden = false;
  $$(".nav__links a").forEach(a => a.classList.toggle("is-active", a.getAttribute("href")===hash));
  $("#app").focus();
}
addEventListener("hashchange", route);
addEventListener("DOMContentLoaded", () => {
  route();
  wireEvents();
  hydrate();
});

/* ------- State ------- */
const state = {
  input: { domain:"", audience:"", tasks:[], competitors:[], voc:[], styles:[], pains:[] },
  derived: { recs:null, palette:null, ctq:[], affinity:{}, pareto:[], kano:{must:[],performance:[],delighter:[]}, heuristics:[] }
};
function save(){ localStorage.setItem("uxGreenState", JSON.stringify(state)); }
function load(){ try{ return JSON.parse(localStorage.getItem("uxGreenState")||"{}"); }catch{ return {}; } }
function hydrate(){
  const s = load();
  if(s.input){ Object.assign(state.input, s.input); }
  if(s.derived){ Object.assign(state.derived, s.derived); }
  renderAfterAnalyze();
}

/* ------- Events ------- */
function wireEvents(){
  $("#ctaStart")?.addEventListener("click", () => location.hash="#/analyzer");
  $("#analysisForm")?.addEventListener("submit", onAnalyze);
  $("#addKano")?.addEventListener("click", addKanoItem);
  $("#calcHeuristics")?.addEventListener("click", analyzeHeuristics);
  $("#testContrast")?.addEventListener("click", runContrast);
  $("#exportReport")?.addEventListener("click", exportReport);
}

/* ------- Analyze ------- */
function onAnalyze(e){
  e.preventDefault();
  state.input.domain = $("#domain").value.trim();
  state.input.audience = $("#audience").value.trim();
  state.input.tasks = $("#tasks").value.split(",").map(x=>x.trim()).filter(Boolean);
  state.input.competitors = $("#competitors").value.split(",").map(x=>x.trim()).filter(Boolean);
  state.input.voc = $("#voc").value.split("\n").map(x=>x.trim()).filter(Boolean);
  state.input.styles = $$('input[name="style"]:checked').map(x=>x.value);
  state.input.pains = $$('input[name="pain"]:checked').map(x=>x.value);

  state.derived.recs = recommendByDomain(state.input.domain, state.input.styles);
  state.derived.palette = genPalette(state.input.domain, state.input.styles);
  state.derived.ctq = buildCtqTree(state.input.voc);
  state.derived.affinity = buildAffinity(state.input.voc);
  state.derived.pareto = buildPareto(state.input.pains);

  save();
  renderAfterAnalyze();
  toast("Analysis generated ✔️");
}

function renderAfterAnalyze(){
  renderSummary();
  renderVoc();
  renderRecs();
  renderReport();
}

/* ------- Summary card ------- */
function renderSummary(){
  const out = $("#analysisOutput");
  if(!out) return;
  if(!state.input.domain){
    out.innerHTML = `<div class="card">Fill the form and click <strong>Analyze</strong> to see results.</div>`;
    return;
  }
  const r = state.derived.recs || {};
  out.innerHTML = `
    <div class="card">
      <h3>Summary</h3>
      <div><strong>Domain:</strong> ${esc(state.input.domain)}</div>
      <div><strong>Audience:</strong> ${esc(state.input.audience||"—")}</div>
      <div><strong>Top Tasks:</strong> ${state.input.tasks.join(", ")||"—"}</div>
      <div><strong>Pain Points:</strong> ${state.input.pains.join(", ")||"—"}</div>
      <div class="pill">Styles: ${state.input.styles.join(", ")||"—"}</div>
    </div>
    <div class="card">
      <h3>High-level Recommendation</h3>
      <ul class="checklist">${(r.layout||[]).map(li=>`<li>${esc(li)}</li>`).join("")}</ul>
      <h4>Navigation</h4>
      <ul class="checklist">${(r.navigation||[]).map(li=>`<li>${esc(li)}</li>`).join("")}</ul>
    </div>
  `;
}

/* ------- Domain rules & palette ------- */
const DOMAIN_RULES = [
  { key:"healthcare", match:["health","patient","clinic","hospital","ehr","emr","care"],
    layout:["Role-based dashboard","Global patient search","Timeline of encounters","Split-view notes vs results"],
    navigation:["Task-driven left nav","Quick actions bar","Contextual breadcrumbs","Universal search"],
    components:["Order entry validation","Medication list + allergies","Vitals chart","Structured forms","Audit log"],
    colorHints:["Trust blues/greens","High contrast for safety","Clear error messages"],
    tone:["Clinical, precise, calm"],
    dataviz:["Sparklines for vitals","Critical alerts with icon+text"],
    accessFocus:["≥4.5:1 contrast","48px targets","Keyboard-friendly forms","Error prevention/recovery"]
  },
  { key:"fintech", match:["bank","finance","trading","payments","wallet","fintech"],
    layout:["Accounts overview","Transactions table","Transfer wizard","Risk/compliance alerts"],
    navigation:["Left rail + quick actions","Status center","Saved payees"],
    components:["Data grid with filters","Balance charts","2FA prompts","Export CSV"],
    colorHints:["Conservative neutrals + accent"],
    tone:["Trustful, compliant, simple"],
    dataviz:["Line/area balances","Bar categories"],
    accessFocus:["Accessible tables","Clear money labels"] },
  { key:"generic", match:[""], layout:["Dashboard with KPI cards","Global search","Modular content","Progressive disclosure"],
    navigation:["Sticky header","Left rail modules","Quick actions","Search-first design"],
    components:["Data grid","Filters","Notifications","Help panel"],
    colorHints:["Neutral base + 1 accent"], tone:["Clear, concise"], dataviz:["Simple trends"], accessFocus:["Keyboard accessible","Readable type"] }
];

const STYLE_MODS = {
  modern:{ colorBias:["#22e884","#0f1a14","#9bf6c8"], notes:["Card layouts","Soft shadows"] },
  minimalistic:{ colorBias:["#0c1310","#a5c3af","#e6f6ec"], notes:["Whitespace","Subtle dividers"] },
  corporate:{ colorBias:["#0b100d","#183223","#22e884"], notes:["Conservative palette","Formal copy"] },
  playful:{ colorBias:["#22e884","#9bf6c8","#7bf4ff"], notes:["Rounded, friendly"] },
  futuristic:{ colorBias:["#22e884","#00ffa8","#9bf6c8"], notes:["Glows & gradients"] }
};

function recommendByDomain(text="", styles=[]){
  const d = text.toLowerCase();
  const rule = DOMAIN_RULES.find(r => r.match.some(m => d.includes(m))) || DOMAIN_RULES.find(r=>r.key==="generic");
  const styleNotes = styles.flatMap(s => STYLE_MODS[s]?.notes || []);
  return {...rule, styleNotes};
}
function genPalette(text="", styles=[]){
  const base = ["#0b100d","#0f1511","#183223","#22e884","#e6f6ec"];
  const bias = styles.flatMap(s => STYLE_MODS[s]?.colorBias || []);
  const pool = [...bias, ...base];
  const uniq = Array.from(new Set(pool)).slice(0,6);
  return {
    primary: uniq[3] || "#22e884", secondary: uniq[2] || "#183223",
    success:"#2ecc71", warning:"#ffb020", danger:"#ff6b6b",
    surface: uniq[1] || "#0f1511", text:"#e6f6ec", border:"#183223", bg:"#070a08"
  };
}

/* ------- VOC helpers ------- */
function buildCtqTree(lines=[]){
  if(!lines.length) return [];
  return lines.map(line => {
    const need = line.replace(/\.$/,"");
    const ctqs=[]; if(/fast|quick|speed|within|sec|min/i.test(line)) ctqs.push("Response time");
    if(/find|search|discover|nav/i.test(line)) ctqs.push("Findability");
    if(/error|safe|secure|privacy|consent/i.test(line)) ctqs.push("Safety/Security");
    if(/access|read|contrast|color|blind/i.test(line)) ctqs.push("Accessibility");
    if(/simple|clutter|clean|minimal/i.test(line)) ctqs.push("Simplicity");
    if(!ctqs.length) ctqs.push("Usefulness");
    const specs = ctqs.map(c => ({
      "Response time":"≤ 300ms above-the-fold interactions",
      "Findability":"Key tasks ≤ 3 clicks from entry",
      "Safety/Security":"Mask PII; 2FA for sensitive actions",
      "Accessibility":"Contrast ≥ 4.5:1; logical tab order",
      "Simplicity":"Progressive disclosure; remove non-essential",
      "Usefulness":"Task success ≥ 95% in testing"
    }[c]));
    return {need, ctqs, specs};
  });
}
function buildAffinity(lines=[]){
  const groups={Performance:[],Navigation:[],Trust:[],Accessibility:[],Content:[],Visual:[],Usability:[]};
  lines.forEach(l=>{
    const t=l.toLowerCase();
    if(/speed|slow|load|lag|response/.test(t)) groups.Performance.push(l);
    else if(/nav|find|search|discover|confus/.test(t)) groups.Navigation.push(l);
    else if(/priv|secure|trust|error|safe|consent/.test(t)) groups.Trust.push(l);
    else if(/access|color|contrast|blind|screen reader|keyboard/.test(t)) groups.Accessibility.push(l);
    else if(/copy|content|text|label|word/.test(t)) groups.Content.push(l);
    else if(/look|visual|clutter|layout|aesthetic/.test(t)) groups.Visual.push(l);
    else groups.Usability.push(l);
  });
  return groups;
}
function buildPareto(pains=[]){
  const cats = ["navigation","usability","performance","visual","content","accessibility","trust"];
  const map = Object.fromEntries(cats.map(c=>[c,0]));
  pains.forEach(p => map[p] = (map[p]||0)+1);
  return Object.entries(map).map(([k,v])=>({k,v})).sort((a,b)=>b.v-a.v);
}

/* ------- Render VOC ------- */
function renderVoc(){
  // CTQ
  const ctqEl=$("#ctqTree"); if(ctqEl){
    const tree=state.derived.ctq||[];
    ctqEl.innerHTML = tree.length ? tree.map(n=>`
      <div class="pill">Need: ${esc(n.need)}</div>
      <div class="pill">CTQs: ${n.ctqs.join(", ")}</div>
      <div class="pill">Specs: ${n.specs.join(" • ")}</div>
      <hr style="border:0;border-top:1px solid var(--border)">
    `).join("") : `<span class="pill">Add VOC lines in Analyzer to generate a CTQ tree.</span>`;
  }
  // Affinity
  const affEl=$("#affinityGroups"); if(affEl){
    const aff=state.derived.affinity||{};
    affEl.innerHTML = Object.keys(aff).length ? Object.entries(aff).map(([g,items])=>`
      <div class="group"><div class="pill" style="background:#0c1712">${esc(g)}</div>
      <div>${items.map(i=>`<span class="pill">${esc(i)}</span>`).join("") || `<span class="pill">—</span>`}</div></div>
    `).join("") : `<span class="pill">Provide VOC to see affinity groups.</span>`;
  }
  // Pareto
  const bars=$("#paretoBars"); if(bars){
    const p=state.derived.pareto||[]; const max=Math.max(1,...p.map(x=>x.v));
    bars.innerHTML = p.length ? p.map(x=>`
      <div class="bar"><div>${esc(x.k)}</div>
        <div class="meter"><span style="width:${(x.v/max)*100}%"></span></div>
        <div>${x.v}</div></div>`).join("") : `<span class="pill">Select pain points to build Pareto.</span>`;
  }
  renderKano();
}
function addKanoItem(){
  const name=$("#kanoFeature").value.trim(); const cls=$("#kanoClass").value;
  if(!name) return; state.derived.kano[cls].push(name); $("#kanoFeature").value="";
  save(); renderKano();
}
function removeKanoItem(cls, idx){ state.derived.kano[cls].splice(idx,1); save(); renderKano(); }
window.removeKanoItem = removeKanoItem;
function renderKano(){
  const wrap=$("#kanoLists"); if(!wrap) return;
  const k=state.derived.kano;
  const list = (title, cls) => `
    <div class="card">
      <h4>${title}</h4>
      ${k[cls].length? k[cls].map((item,i)=>`
        <div class="kano-item"><span>${esc(item)}</span>
        <span class="pill">${cls}</span>
        <button class="btn" onclick="removeKanoItem('${cls}',${i})">✖</button></div>`).join("")
      : `<span class="pill">Add features above.</span>`}
    </div>`;
  wrap.innerHTML = list("Must-be","must")+list("Performance","performance")+list("Delighter","delighter");
}

/* ------- Recs & Palette ------- */
function renderRecs(){
  const box=$("#domainRecs"); if(box){
    if(!state.derived.recs){ box.innerHTML = `<span class="pill">Run Analyzer first.</span>`; return; }
    const r=state.derived.recs;
    box.innerHTML = `
      <div class="card">
        <h3>Navigation & IA</h3><ul class="checklist">${r.navigation.map(li=>`<li>${esc(li)}</li>`).join("")}</ul>
        <h3>Layout</h3><ul class="checklist">${r.layout.map(li=>`<li>${esc(li)}</li>`).join("")}</ul>
      </div>
      <div class="card">
        <h3>Copy Tone</h3><ul class="checklist">${r.tone.map(li=>`<li>${esc(li)}</li>`).join("")}</ul>
        <h3>Data Viz</h3><ul class="checklist">${r.dataviz.map(li=>`<li>${esc(li)}</li>`).join("")}</ul>
        <h3>Accessibility Focus</h3><ul class="checklist">${r.accessFocus.map(li=>`<li>${esc(li)}</li>`).join("")}</ul>
        <h3>Style Notes</h3><ul class="checklist">${(r.styleNotes||[]).map(li=>`<li>${esc(li)}</li>`).join("") || "<li>—</li>"}</ul>
      </div>`;
  }
  const pal=state.derived.palette; const boxP=$("#palette");
  if(pal && boxP){
    boxP.innerHTML = Object.entries(pal).map(([k,v])=>`
      <div class="swatch"><div class="tone" style="background:${v}"></div>
      <div class="meta">${k}<br>${v}</div></div>`).join("");
  }
  const cl=$("#componentChecklist"); if(cl){
    const list=(state.derived.recs?.components||["Data grid","Filters","Notifications","Help panel"])
      .map(c=>`<li>${esc(c)}</li>`).join("");
    cl.innerHTML = list;
  }
}

/* ------- Contrast & Heuristics ------- */
function hexToRgb(h){const m=h.replace("#","").match(/.{1,2}/g)||["00","00","00"];return {r:parseInt(m[0],16),g:parseInt(m[1],16),b:parseInt(m[2],16)}}
function relL({r,g,b}){const s=[r,g,b].map(v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)});return 0.2126*s[0]+0.7152*s[1]+0.0722*s[2]}
function contrast(a,b){const L1=relL(hexToRgb(a)),L2=relL(hexToRgb(b));const [hi,lo]=[L1,L2].sort((x,y)=>y-x);return (hi+0.05)/(lo+0.05)}
function runContrast(){
  const p=state.derived.palette; if(!p) return;
  const combos=[["bg","text"],["surface","text"],["primary","text"],["text","bg"],["primary","bg"]];
  $("#contrastResults").innerHTML = combos.map(([a,b])=>{
    const c=contrast(p[a],p[b]); const ok=c>=4.5?"pass":"fail";
    return `<div class="row"><span class="contrast chip" style="background:${p[a]};color:${p[b]}">${a} on ${b}</span> <strong class="${ok}">${c.toFixed(2)}:1</strong></div>`;
  }).join("") + `<div class="pill">Aim for ≥ 4.5:1 for body text.</div>`;
}

function analyzeHeuristics(){
  const labels=["Visibility of status","Match to real world","User control/freedom","Consistency/standards","Error prevention","Recognition vs recall","Flexibility/efficiency","Aesthetic/minimalist","Help users recover","Help & docs"];
  const vals=$$("#heuristicsForm input[type='number']").map(i=>Number(i.value)||1);
  const pairs=labels.map((l,i)=>({l,v:vals[i]||1})).sort((a,b)=>a.v-b.v);
  state.derived.heuristics=pairs; save();
  $("#heuristicsOutput").innerHTML = `
    <div class="bars">
      ${pairs.map(p=>`<div class="bar"><div>${esc(p.l)}</div><div class="meter"><span style="width:${(p.v/5)*100}%"></span></div><div>${p.v}/5</div></div>`).join("")}
    </div><div class="pill">Focus on the lowest scores first.</div>`;
}

/* ------- Report ------- */
function buildReportHtml(){
  const s=state, r=s.derived.recs||{}, pal=s.derived.palette||{}, kano=s.derived.kano||{must:[],performance:[],delighter:[]};
  const pareto=s.derived.pareto||[]; const ctq=s.derived.ctq||[]; const aff=s.derived.affinity||{}; const heur=s.derived.heuristics||[];
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>UX VOC Report</title>
  <style>body{font-family:Inter,system-ui,sans-serif;margin:24px;color:#111}h1,h2,h3{margin:.4rem 0}
  .grid{display:grid;gap:12px}.two{grid-template-columns:1fr 1fr}@media(max-width:960px){.two{grid-template-columns:1fr}}
  .card{border:1px solid #ddd;border-radius:10px;padding:12px}
  .bars{display:grid;gap:8px}.bar{display:grid;grid-template-columns:200px 1fr auto;gap:10px;align-items:center}
  .meter{height:12px;background:#f2f4f8;border:1px solid #dde3ee;border-radius:999px;overflow:hidden}
  .meter>span{display:block;height:100%;background:linear-gradient(90deg,#22e884,#9bf6c8)}
  .sw{display:inline-block;width:120px;border:1px solid #ddd;border-radius:10px;margin:6px 6px 0 0;overflow:hidden}
  .tone{height:60px}.meta{padding:6px;font:12px ui-monospace,Menlo,Consolas,monospace;background:#fbfdfa}</style></head>
  <body>
  <h1>UX Feedback Analyzer — VOC Report</h1>
  <small>Generated: ${new Date().toLocaleString()}</small>
  <div class="grid two" style="margin-top:10px">
    <div class="card"><h2>Project</h2>
      <div><strong>Domain:</strong> ${esc(s.input.domain||"—")}</div>
      <div><strong>Audience:</strong> ${esc(s.input.audience||"—")}</div>
      <div><strong>Top Tasks:</strong> ${s.input.tasks.join(", ")||"—"}</div>
      <div><strong>Styles:</strong> ${s.input.styles.join(", ")||"—"}</div>
      <div><strong>Pain Points:</strong> ${s.input.pains.join(", ")||"—"}</div>
      <div><strong>Competitors:</strong> ${s.input.competitors.join(", ")||"—"}</div>
    </div>
    <div class="card"><h2>High-level Recommendation</h2>
      <h3>Layout</h3><ul>${(r.layout||[]).map(li=>`<li>${esc(li)}</li>`).join("")}</ul>
      <h3>Navigation & IA</h3><ul>${(r.navigation||[]).map(li=>`<li>${esc(li)}</li>`).join("")}</ul>
    </div>
  </div>
  <div class="grid two" style="margin-top:10px">
    <div class="card"><h2>CTQ Tree</h2>${ctq.map(n=>`<div><strong>Need:</strong> ${esc(n.need)}<br><strong>CTQs:</strong> ${n.ctqs.join(", ")}<br><strong>Specs:</strong> ${n.specs.join(" • ")}</div><hr>`).join("")||"<small>No VOC entered.</small>"}</div>
    <div class="card"><h2>Kano</h2>
      <div><strong>Must-be:</strong> ${kano.must.join(", ")||"—"}</div>
      <div><strong>Performance:</strong> ${kano.performance.join(", ")||"—"}</div>
      <div><strong>Delighter:</strong> ${kano.delighter.join(", ")||"—"}</div>
      <h2 style="margin-top:10px">Affinity</h2>
      ${Object.entries(aff).map(([g,items])=>`<div><strong>${esc(g)}:</strong> ${items.join(", ")||"—"}</div>`).join("")}
    </div>
  </div>
  <div class="grid two" style="margin-top:10px">
    <div class="card"><h2>Pareto of Issues</h2>
      <div class="bars">${pareto.map(x=>`<div class="bar"><div>${esc(x.k)}</div>
        <div class="meter"><span style="width:${(x.v/Math.max(1,...pareto.map(z=>z.v)))*100}%"></span></div><div>${x.v}</div></div>`).join("")}</div>
    </div>
    <div class="card"><h2>Palette</h2>${Object.entries(pal).map(([k,v])=>`<div class="sw"><div class="tone" style="background:${v}"></div><div class="meta">${k}<br>${v}</div></div>`).join("")}</div>
  </div>
  <div class="card" style="margin-top:10px"><h2>Accessibility Focus</h2><ul>${(r.accessFocus||[]).map(li=>`<li>${esc(li)}</li>`).join("")}</ul></div>
  <div class="card" style="margin-top:10px"><h2>Nielsen Heuristics</h2>
    <div class="bars">${(s.derived.heuristics||[]).map(p=>`<div class="bar"><div>${esc(p.l)}</div><div class="meter"><span style="width:${(p.v/5)*100}%"></span></div><div>${p.v}/5</div></div>`).join("")||"<small>No scoring yet.</small>"}</div>
  </div>
  </body></html>`;
}
function renderReport(){
  const prev=$("#reportPreview"); if(prev){
    prev.innerHTML = `<iframe title="Report preview" style="width:100%;height:70vh;border:1px solid var(--border);border-radius:12px;background:#fff" srcdoc="${esc(buildReportHtml())}"></iframe>`;
  }
}
function exportReport(){
  const html=buildReportHtml();
  const blob=new Blob([html],{type:"text/html"});
  const a=document.createElement("a"); a.href=URL.createObjectURL(blob);
  a.download=`UX-VOC-Report-${Date.now()}.html`; a.click(); URL.revokeObjectURL(a.href);
}

/* ------- Utils ------- */
function toast(msg="Saved."){ const d=$("#toast"); $("#toastMsg").textContent=msg; d.showModal(); }
function esc(s=""){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
