// UI controller (offline-first). No modules.
// NOTE: Este arquivo é "offline-first", mas inclui sincronização opcional via fetch (Cloudflare Pages Functions).
(function(){
  'use strict';

  // ---------------- utils ----------------
  function safeCall(name, fn){
    try{ fn(); }
    catch(e){
      console.error('Init fail:', name, e);
      try{
        if(typeof showToast === 'function') showToast('Falha ao iniciar: '+name+' (veja console)', false);
        else if(typeof window !== 'undefined' && window.alert) window.alert('Falha ao iniciar: '+name+' (veja console)');
      }catch(_){}
    }
  }

  const STORAGE_KEY = 'optometry_app_v4_3_patients';

  let state = {
    selectedId: null,
    patients: []
  };

  // Global error surfacing (prevents "travou" without feedback)
  window.addEventListener('error', (ev)=>{
    try{ console.error('Unhandled error:', ev.error || ev.message); }catch(_){ }
    try{ showToast('Erro: ' + String(ev.error?.message || ev.message || 'desconhecido') + ' (F12 → Console)', false); }catch(_){ }
  });
  window.addEventListener('unhandledrejection', (ev)=>{
    try{ console.error('Unhandled rejection:', ev.reason); }catch(_){ }
    try{ showToast('Erro: ' + String(ev.reason?.message || ev.reason || 'promessa rejeitada') + ' (F12 → Console)', false); }catch(_){ }
  });

  function storageGet(key){
    try{ return localStorage.getItem(key); }
    catch(e){ return null; }
  }
  function storageSet(key, value){
    try{ localStorage.setItem(key, value); return true; }
    catch(e){
      try{ showToast('Falha ao salvar no navegador (armazenamento bloqueado ou cheio).', false); }catch(_){ }
      return false;
    }
  }

  function uid(){
    return 'p_' + Math.random().toString(16).slice(2) + '_' + Date.now().toString(16);
  }

  function saveState(){
    storageSet(STORAGE_KEY, JSON.stringify(state.patients));
  }
  function loadState(){
    try{
      const raw = storageGet(STORAGE_KEY);
      state.patients = raw ? JSON.parse(raw) : [];
      if(!Array.isArray(state.patients)) state.patients = [];
    }catch(e){
      state.patients = [];
    }
  }

  function el(id){ return document.getElementById(id); }

  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }

  // ---- DOM repair: ensure all .tab are direct children of <main> (Safari/iOS can break on malformed HTML) ----
  function repairTabNesting(){
    try{
      const main = document.querySelector('main');
      if(!main) return;
      const tabs = Array.from(document.querySelectorAll('.tab'));
      tabs.forEach(tab=>{
        const parent = tab.parentElement;
        const parentTab = parent && parent.closest ? parent.closest('.tab') : null;
        if(parentTab){
          main.appendChild(tab);
        }
      });
    }catch(e){
      console.warn('repairTabNesting failed', e);
    }
  }

  // ---------------- formatting helpers (NO collisions) ----------------
  function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }

  function setText(id, txt){ const n=el(id); if(n) n.textContent = txt; }
  function safeSetText(id, txt){ const n=el(id); if(n) n.textContent = (txt==null? '': String(txt)); }
  function setHTML(id, html){ const n=el(id); if(n) n.innerHTML = html; }

  function fmt2(x){
    if(x===null || x===undefined || x==='' || Number.isNaN(x)) return '—';
    const n = Number(x);
    if(Number.isNaN(n)) return String(x);
    return (Math.round(n*100)/100).toFixed(2);
  }
  function fmt1(x){
    if(x===null || x===undefined || x==='') return '—';
    const n = Number(x);
    if(Number.isNaN(n)) return String(x);
    return String(Math.round(n*10)/10);
  }
  function fmt0(x){
    if(x===null || x===undefined || x==='') return '—';
    const n = Number(x);
    if(Number.isNaN(n)) return String(x);
    return String(Math.round(n));
  }
  function fmtN(x){
    if(x===null || x===undefined || x==='') return '—';
    return String(x);
  }
  function fmtSigned(x){
    if(x===null || x===undefined || x==='') return '—';
    const n = Number(x);
    if(Number.isNaN(n)) return String(x);
    const s = n>0 ? '+' : '';
    return s+String(n);
  }
  function fmtStr(x){
    if(x===null || x===undefined || x==='') return '—';
    return String(x);
  }
  function fmtFixed(v, decimals){
    if(v === null || v === undefined || v === '') return '—';
    const n = Number(v);
    if(!Number.isFinite(n)) return '—';
    const d = (typeof decimals==='number') ? decimals : 2;
    return n.toFixed(d);
  }

  // ---------------- Clipboard helper (works on iOS / non-secure contexts) ----------------
  async function copyToClipboard(text){
    const t = String(text||'');
    if(!t) return false;
    // Preferred API (requires secure context on some browsers)
    try{
      if(navigator.clipboard && (window.isSecureContext || location.protocol === 'https:')){
        await navigator.clipboard.writeText(t);
        return true;
      }
    }catch(_){}

    // Fallback: execCommand('copy')
    try{
      const ta = document.createElement('textarea');
      ta.value = t;
      ta.setAttribute('readonly','');
      ta.style.position = 'fixed';
      ta.style.top = '-1000px';
      ta.style.left = '0';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      ta.setSelectionRange(0, ta.value.length);
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return !!ok;
    }catch(_){
      return false;
    }
  }

  function showToast(msg, ok=true){
    const box = el('toast');
    if(!box){
      // fallback (não quebra se o toast não existir)
      try{ console.log('TOAST:', msg); }catch(_){}
      return;
    }
    box.textContent = msg;
    box.className = 'toast ' + (ok?'ok':'err') + ' show';
    setTimeout(()=> box.classList.remove('show'), 2800);
  }

  // ---------------- Patient helpers ----------------
  function calcAgeFromForm(){
    const dob = el('p_dob')?.value;
    if(!dob || !window.ClinicalEngine?.calcAgeYMD) return null;
    const age = window.ClinicalEngine.calcAgeYMD(dob, new Date());
    if(!age) return null;
    return age;
  }

  function updateAgeBadges(){
    const age = calcAgeFromForm();
    if(!age){
      setText('age_display','—');
      return;
    }
    setText('age_display', `${age.yearsRounded}a ${age.monthsRounded}m`);
  }

  // ---- CPF (opcional, não bloqueia) ----
  function normalizeCpf(v){ return String(v||'').replace(/\D/g,'').slice(0,11); }
  function formatCpf(d){
    const s = normalizeCpf(d);
    if(s.length !== 11) return s;
    return `${s.slice(0,3)}.${s.slice(3,6)}.${s.slice(6,9)}-${s.slice(9,11)}`;
  }
  function isValidCpfDigits(d){
    const cpf = normalizeCpf(d);
    if(cpf.length !== 11) return false;
    if(/^(\d)\1{10}$/.test(cpf)) return false;
    const nums = cpf.split('').map(n=>parseInt(n,10));
    let sum=0;
    for(let i=0;i<9;i++) sum += nums[i]*(10-i);
    let mod = (sum*10)%11; if(mod===10) mod=0;
    if(mod !== nums[9]) return false;
    sum=0;
    for(let i=0;i<10;i++) sum += nums[i]*(11-i);
    mod = (sum*10)%11; if(mod===10) mod=0;
    return mod === nums[10];
  }
  function cpfWarning(rawInput){
    const digits = normalizeCpf(rawInput);
    if(!digits) return null;
    if(digits.length !== 11) return 'CPF incompleto (11 dígitos).';
    if(!isValidCpfDigits(digits)) return 'CPF inválido (dígitos verificadores não conferem).';
    return null;
  }

  // ---- Perfil (texto) ----
  function readProfile(){
    return {
      main: (el('q_main')?.value || '').trim(),
      history: (el('q_history')?.value || '').trim(),
      clinical: (el('q_clinical')?.value || '').trim(),
    };
  }
  function renderProfileOut(profile){
    const box = el('questionnaire_out');
    if(!box) return;
    const p = profile || {};
    const any = (p.main||p.history||p.clinical);
    if(!any){
      box.innerHTML = '<div class="muted">Sem perfil salvo.</div>';
      return;
    }
    box.innerHTML = `<pre>${escapeHtml(JSON.stringify(p, null, 2))}</pre>`;
  }
  function writeProfile(profile){
    const p = profile || {};
    const qm = el('q_main'); if(qm) qm.value = p.main || '';
    const qh = el('q_history'); if(qh) qh.value = p.history || '';
    const qc = el('q_clinical'); if(qc) qc.value = p.clinical || '';
    renderProfileOut(p);
  }

  function resetForms(){
    if(el('p_name')) el('p_name').value='';
    const cpfEl = el('p_cpf'); if(cpfEl) cpfEl.value='';
    const sexEl = el('p_sex'); if(sexEl) sexEl.value='';
    if(el('p_dob')) el('p_dob').value='';
    if(el('p_notes')) el('p_notes').value='';

    // profile
    const qm = el('q_main'); if(qm) qm.value='';
    const qh = el('q_history'); if(qh) qh.value='';
    const qc = el('q_clinical'); if(qc) qc.value='';
    setHTML('questionnaire_out','<div class="muted">Sem perfil salvo.</div>');

    // tests
    resetTVPSForm();
    resetDTVPForm();
    resetDEMForm();
    resetNSUCOForm();
    resetBinocularForm();
    resetBinocularVisionForm();

    state.selectedId = null;
    setText('selected_patient','nenhum');
    renderPatients();
    updateAgeBadges();
    setHTML('panel_integrado','<div class="muted">Selecione um paciente para ver o painel.</div>');
    showToast('Novo registro pronto.');
  }

  // compat: versões antigas usavam questionário por checkbox. Mantemos o campo sem quebrar histórico.
  function readQuestionnaire(){
    const qs = {};
    document.querySelectorAll('[data-q]').forEach(inp=>{
      qs[inp.getAttribute('data-q')] = !!inp.checked;
    });
    return qs;
  }

  function newPatientFromForm(){
    const name = (el('p_name')?.value || '').trim();
    const dob = el('p_dob')?.value || '';
    const sex = el('p_sex')?.value || '';
    const cpfRaw = el('p_cpf') ? el('p_cpf').value : '';
    const cpfDigits = normalizeCpf(cpfRaw);

    if(!name){ showToast('Nome é obrigatório.', false); return null; }
    if(!dob){ showToast('Data de nascimento é obrigatória.', false); return null; }
    const age = window.ClinicalEngine?.calcAgeYMD ? window.ClinicalEngine.calcAgeYMD(dob, new Date()) : null;
    if(!age){ showToast('Data de nascimento inválida.', false); return null; }

    const warn = cpfWarning(cpfDigits);
    if(warn) showToast(warn, false); // não bloqueia

    return {
      id: uid(),
      name, dob, sex,
      cpf: cpfDigits, // opcional
      createdAt: new Date().toISOString(),
      notes: (el('p_notes')?.value || '').trim(),
      profile: readProfile(),
      questionnaire: readQuestionnaire(), // compat
      tests: {}
    };
  }

  function upsertPatient(patient){
    const idx = state.patients.findIndex(p=>p.id===patient.id);
    if(idx>=0) state.patients[idx]=patient;
    else state.patients.unshift(patient);
    saveState();
    renderPatients();
  }

  function getSelectedPatient(){
    if(!state.selectedId) return null;
    return state.patients.find(p=>p.id===state.selectedId) || null;
  }

  function ensureSelectedPatient(){
    const p = getSelectedPatient();
    if(!p){
      showToast('Selecione (ou salve) um paciente primeiro.', false);
      return null;
    }
    return p;
  }

  function selectPatient(id){
    state.selectedId = id;
    renderPatients();
    const p = getSelectedPatient();
    if(!p) return;

    setText('selected_patient', p.name || '—');

    // basic fields
    if(el('p_name')) el('p_name').value = p.name || '';
    if(el('p_dob')) el('p_dob').value = p.dob || '';
    if(el('p_sex')) el('p_sex').value = p.sex || '';
    if(el('p_notes')) el('p_notes').value = p.notes || '';
    const cpfEl = el('p_cpf'); if(cpfEl) cpfEl.value = formatCpf(p.cpf || '');

    // profile
    writeProfile(p.profile || {});

    updateAgeBadges();

    // load tests
    loadTVPSFromPatient(p);
    loadDTVPFromPatient(p);
    loadDEMFromPatient(p);
    loadNSUCOFromPatient(p);
    loadBinocularFromPatient(p);
    loadBinocularVisionFromPatient(p);

    // panel
    renderIntegratedPanel(p);
  }

  function renderPatients(){
    const box = el('patient_list');
    if(!box) return;
    box.innerHTML = '';
    state.patients.forEach(p=>{
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'patient-item ' + (p.id===state.selectedId?'active':'');

      const age = window.ClinicalEngine?.calcAgeYMD ? window.ClinicalEngine.calcAgeYMD(p.dob, new Date()) : null;
      const ageStr = age ? `${age.yearsRounded}a ${age.monthsRounded}m` : '—';

      btn.innerHTML = `<div class="pname">${escapeHtml(p.name || '—')}</div>
                       <div class="psub">${escapeHtml(ageStr)} • ${escapeHtml(p.sex||'')}</div>`;
      btn.addEventListener('click', ()=> selectPatient(p.id));
      box.appendChild(btn);
    });
    // --- COMPAT: evita crash se algum trecho chama renderPatientList() ---
function renderPatientList(){
  if (typeof renderPatients === 'function') return renderPatients();
  if (typeof renderPatientTable === 'function') return renderPatientTable();
  if (typeof renderList === 'function') return renderList();

  console.error('Nenhuma função de render encontrada (renderPatients/renderPatientTable/renderList).');
}
  }

  // ---------------- Panel Markup Guards ----------------
  function ensurePanelMarkup(){
    const tab = el('tab_painel');
    if(!tab) return;
    if(!el('panel_integrado')){
      tab.innerHTML = `
      <div class="dash-shell">
        <div class="dash-topbar">
          <div>
            <h2 class="dash-title">Painel integrado</h2>
            <div class="dash-sub">Selecione um paciente e clique em <b>Atualizar painel</b>.</div>
          </div>
          <div class="dash-actions">
            <button id="btn_panel_refresh" class="btn-primary">Atualizar painel</button>
            <button id="btn_panel_copy" class="btn">Copiar</button>
          </div>
        </div>

        <div class="dash-cards">
          <div class="dash-card grad-pink"><div class="dash-card-k">TVPS-4</div><div class="dash-card-v" id="dash_tvps_v">—</div><div class="dash-card-s" id="dash_tvps_s">SS / Percentil total</div></div>
          <div class="dash-card grad-purple"><div class="dash-card-k">NSUCO</div><div class="dash-card-v" id="dash_nsuco_v">—</div><div class="dash-card-s" id="dash_nsuco_s">Pursuits / Saccades</div></div>
          <div class="dash-card grad-blue"><div class="dash-card-k">Vergência</div><div class="dash-card-v" id="dash_bin_v">—</div><div class="dash-card-s" id="dash_bin_s">Forias / PPC</div></div>
          <div class="dash-card grad-orange"><div class="dash-card-k">Visão binocular</div><div class="dash-card-v" id="dash_bnv_v">—</div><div class="dash-card-s" id="dash_bnv_s">Worth / Estereopsia</div></div>
          <div class="dash-card grad-green"><div class="dash-card-k">DTVP-3</div><div class="dash-card-v" id="dash_dtvp_v">—</div><div class="dash-card-s" id="dash_dtvp_s">PVG / IVM / PVRM</div></div>
          <div class="dash-card grad-slate"><div class="dash-card-k">DEM</div><div class="dash-card-v" id="dash_dem_v">—</div><div class="dash-card-s" id="dash_dem_s">Ratio / Percentil</div></div>
        </div>

        <div class="dash-grid">
          <div class="dash-panel">
            <div class="dash-panel-head">
              <div class="dash-panel-title">NSUCO — Radar</div>
              <div class="dash-panel-sub" id="dash_nsuco_meta">Pursuits × Saccades • Alvo 4</div>
            </div>
            <canvas id="panel_nsuco_radar" width="720" height="380"></canvas>
          </div>

          <div class="dash-panel">
            <div class="dash-panel-head">
              <div class="dash-panel-title">TVPS-4 — Perfil (Scaled)</div>
              <div class="dash-panel-sub">7 subtestes • escala 1–19</div>
            </div>
            <canvas id="panel_tvps_chart" width="720" height="320"></canvas>
          </div>

          <div class="dash-panel">
            <div class="dash-panel-head">
              <div class="dash-panel-title">DTVP-3 — Perfil (Scaled)</div>
              <div class="dash-panel-sub">5 subtestes • escala 1–19</div>
            </div>
            <canvas id="panel_dtvp_chart" width="720" height="320"></canvas>
          </div>

          <div class="dash-panel">
            <div class="dash-panel-head">
              <div class="dash-panel-title">Resumo estruturado (para copiar)</div>
              <div class="dash-panel-sub">Clique em <b>Copiar</b> para enviar à equipe.</div>
            </div>
            <div class="out" id="panel_integrado"></div>
          </div>
        </div>
      </div>
    `;
    }
  }

  function ensureBinocularVisionMarkup(){
    const tab = el('tab_visao_binocular');
    if(!tab) return;
    if(!el('bnv_w4d_distance')){
      tab.innerHTML = `
        <div class="card">
          <h2>Visão binocular — Worth 4 Dot + Estereopsia</h2>
          <div class="muted">Registro clínico + referências (não inventa valores).</div>

          <div style="margin-top:10px;font-weight:600">Worth 4 Dot</div>
          <div class="row row2">
            <div>
              <label>Distância (≈ 6 m)</label>
              <select id="bnv_w4d_distance"></select>
            </div>
            <div>
              <label>Perto (≈ 40 cm)</label>
              <select id="bnv_w4d_near"></select>
            </div>
          </div>
          <label>Observações (Worth)</label>
          <textarea id="bnv_w4d_notes" placeholder="Ex.: alternância, variação, sintomas..."></textarea>

          <div style="margin-top:10px;font-weight:600">Estereopsia</div>
          <div class="row row3">
            <div>
              <label>Titmus Fly (grosseira)</label>
              <select id="bnv_titmus_fly"></select>
            </div>
            <div>
              <label>Titmus — círculos (arcseg)</label>
              <select id="bnv_titmus_circles"></select>
            </div>
            <div>
              <label>Dot 2 (arcseg)</label>
              <input id="bnv_dot2" type="number" inputmode="numeric" placeholder="Ex.: 20, 40, 60..." />
            </div>
          </div>

          <div class="row row2">
            <div>
              <label>Fixação estável (segundos)</label>
              <input id="bnv_fix_seconds" type="number" inputmode="numeric" placeholder="Ex.: 10" />
            </div>
            <div>
              <label>Notas (estereopsia/fixação)</label>
              <textarea id="bnv_stereo_notes" placeholder="Ex.: dificuldade, flutuação, sintomas..."></textarea>
            </div>
          </div>

          <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">
            <button id="btn_bnv_salvar" class="btn-primary">Salvar no paciente</button>
            <button id="btn_bnv_limpar">Limpar</button>
          </div>

          <div class="out" id="bnv_out" style="margin-top:10px"></div>
        </div>
      `;
    }
  }

  // ---------------- Select helpers ----------------
  function buildSelectOptions(select, min, max){
    if(!select) return;
    select.innerHTML = '';
    const opt0 = document.createElement('option');
    opt0.value = '';
    opt0.textContent = '—';
    select.appendChild(opt0);
    for(let v=min; v<=max; v++){
      const o=document.createElement('option');
      o.value = String(v);
      o.textContent = String(v);
      select.appendChild(o);
    }
  }

  function buildSelectOptionsStep(select, min, max, step, decimals){
    if(!select) return;
    select.innerHTML = '';
    const opt0 = document.createElement('option');
    opt0.value = '';
    opt0.textContent = '—';
    select.appendChild(opt0);

    const d = (typeof decimals === 'number') ? decimals : null;
    function fmt(v){
      if(d === null) return String(v);
      return Number(v).toFixed(d);
    }

    const nSteps = Math.round((max - min) / step);
    for(let i=0;i<=nSteps;i++){
      const v = min + i*step;
      const vv = Math.round(v*1000000)/1000000;
      const o=document.createElement('option');
      o.value = String(vv);
      o.textContent = fmt(vv);
      select.appendChild(o);
    }
  }

  function buildSelectOptionsList(select, items){
    if(!select) return;
    select.innerHTML = '';
    const opt0 = document.createElement('option');
    opt0.value = '';
    opt0.textContent = '—';
    select.appendChild(opt0);
    (items || []).forEach(it=>{
      const o = document.createElement('option');
      if(typeof it === 'string'){
        o.value = it;
        o.textContent = it;
      }else{
        o.value = String(it.value);
        o.textContent = String(it.label);
      }
      select.appendChild(o);
    });
  }

  function buildPhoriaOptions(select, maxAbs, step){
    if(!select) return;
    select.innerHTML = '';
    const opt0 = document.createElement('option');
    opt0.value = '';
    opt0.textContent = '—';
    select.appendChild(opt0);

    const maxA = (typeof maxAbs === 'number') ? maxAbs : 20;
    const st = (typeof step === 'number') ? step : 0.5;
    const nSteps = Math.round((maxA*2) / st);
    for(let i=0;i<=nSteps;i++){
      const v = -maxA + i*st;
      const vv = Math.round(v*1000000)/1000000;
      const o=document.createElement('option');
      o.value = String(vv);
      let label = '';
      if(vv === 0){
        label = '0 (ortoforia)';
      }else if(vv > 0){
        label = `${Math.abs(vv)} exo`;
      }else{
        label = `${Math.abs(vv)} eso`;
      }
      o.textContent = label;
      select.appendChild(o);
    }
  }

  function formatPhoriaValue(v){
    if(!Number.isFinite(v)) return '—';
    if(v === 0) return '0 (ortoforia)';
    if(v > 0) return `${Math.abs(v)} exo`;
    return `${Math.abs(v)} eso`;
  }

  function zAndPercent(v, mean, sd){
    if(!Number.isFinite(v) || !Number.isFinite(mean) || !Number.isFinite(sd) || sd===0) return null;
    const z = (v - mean)/sd;
    const pct = window.ClinicalEngine ? window.ClinicalEngine.percentileFromZ(z) : null;
    return {z, pct};
  }

  // ---------------- TVPS-4 ----------------
  const TVPS_SUBTESTS = ['DIS','MEM','SPA','CON','SEQ','FGR','CLO'];

  // Compat fix: manter initTVPSForm público e estável
  function initTVPSFormSForm(){
    TVPS_SUBTESTS.forEach(k=>{
      const s = el('tvps_raw_'+k);
      buildSelectOptions(s, 0, 18);
    });
    el('btn_tvps_calcular')?.addEventListener('click', calcTVPS);
    el('btn_tvps_salvar')?.addEventListener('click', saveTVPS);
  }
  function initTVPSForm(){ return initTVPSFormSForm(); }

  function resetTVPSForm(){
    TVPS_SUBTESTS.forEach(k=> { const s=el('tvps_raw_'+k); if(s) s.value=''; });
    setHTML('tvps_out','<div class="muted">Preencha os Raw Scores (0–18) e clique Calcular.</div>');
  }

  function calcTVPS(){
    const p = ensureSelectedPatient();
    if(!p) return;

    const age = window.ClinicalEngine.calcAgeYMD(p.dob, new Date());
    const ageKey = window.ClinicalEngine.ageToKeyTVPS(age.yearsRounded, age.monthsRounded);
    if(!ageKey){
      showToast('Idade fora da faixa do TVPS-4 (mínimo 5-0).', false);
      return;
    }

    const raws = {};
    for(const st of TVPS_SUBTESTS){
      const v = el('tvps_raw_'+st)?.value;
      if(v === '' || v == null){ showToast('Preencha todos os subtestes do TVPS.', false); return; }
      raws[st] = parseInt(v,10);
    }

    const scaled = {};
    for(const st of TVPS_SUBTESTS){
      const sc = window.ClinicalEngine.tvpsRawToScaled(ageKey, st, raws[st]);
      if(sc === null){
        showToast(`Sem norma B.1 para ${st} raw=${raws[st]} na faixa ${ageKey}.`, false);
        return;
      }
      scaled[st] = sc;
    }

    const sumScaled = TVPS_SUBTESTS.reduce((a,k)=> a + scaled[k], 0);
    const standard = window.ClinicalEngine.tvpsSumScaledToStandard(sumScaled);
    if(standard === null){
      showToast('Sem norma B.2 para soma de Scaled.', false);
      return;
    }

    const derivedRaw = window.ClinicalEngine.tvpsStandardToB3(standard);
    const derived = derivedRaw ? {
      Percentile: derivedRaw.Percentile ?? derivedRaw.percentile ?? derivedRaw.percentileRank ?? null,
      NCE: derivedRaw.NCE ?? derivedRaw.nce ?? null,
      T: derivedRaw.T ?? derivedRaw.tScore ?? derivedRaw.t ?? null,
      Stanine: derivedRaw.Stanine ?? derivedRaw.stanine ?? null,
      ScaledComposite: derivedRaw.ScaledComposite ?? derivedRaw.scaledScore ?? null
    } : null;

    const subPercentiles = {};
    let missingSubPct = false;
    for(const st of TVPS_SUBTESTS){
      const pct = window.ClinicalEngine.tvpsSubtestPercentile(ageKey, st, scaled[st]);
      if(pct === null) missingSubPct = true;
      subPercentiles[st] = pct;
    }

    const totalAgeEq = window.ClinicalEngine.tvpsTotalAgeEquivalent(standard);
    const ageEq = {};
    for(const st of TVPS_SUBTESTS){
      ageEq[st] = window.ClinicalEngine.tvpsAgeEquivalent(st, raws[st]) || '—';
    }

    const totalAgeEqMean = window.ClinicalEngine.tvpsTrimmedMeanAgeEquivalent(
      TVPS_SUBTESTS.map(st=> ageEq[st])
    );

    const out = {ageKey, raws, scaled, sumScaled, standard, derived, subPercentiles, totalAgeEq, totalAgeEqMean, ageEq, computedAt:new Date().toISOString()};
    p.tests.tvps4 = out;
    renderTVPS(out);
    renderIntegratedPanel(p);

    if(missingSubPct){
      showToast('TVPS-4 calculado. Percentil por subteste indisponível para algum Scaled.', true);
    } else {
      showToast('TVPS-4 calculado.', true);
    }
  }

  function renderTVPS(out){
    const d = out.derived || {};
    const computedMean = (out.totalAgeEqMean === undefined)
      ? window.ClinicalEngine.tvpsTrimmedMeanAgeEquivalent(TVPS_SUBTESTS.map(st=> out.ageEq?.[st]))
      : out.totalAgeEqMean;

    const rows = TVPS_SUBTESTS.map(st=>{
      const pct = out.subPercentiles?.[st];
      return `<tr>
        <td>${st}</td>
        <td>${out.raws[st]}</td>
        <td>${out.scaled[st]}</td>
        <td>${pct===null||pct===undefined?'—':escapeHtml(String(pct))}</td>
        <td>${escapeHtml(out.ageEq?.[st] || '—')}</td>
      </tr>`;
    }).join('');

    const b3line = out.derived
      ? `Scaled (B.3): ${escapeHtml(String(d.ScaledComposite ?? '—'))} • NCE: ${escapeHtml(String(d.NCE ?? '—'))} • T-score: ${escapeHtml(String(d.T ?? '—'))} • Stanine: ${escapeHtml(String(d.Stanine ?? '—'))} • Percentil: ${escapeHtml(String(d.Percentile ?? '—'))}`
      : '—';

    const totalAgeEqMeanLine = (computedMean === null || computedMean === undefined)
      ? '— (requer 7 Age Eq em y-m; aceita < / >)'
      : escapeHtml(String(computedMean));

    const ageEqMeanUsesBounds = (typeof computedMean === 'string' && computedMean.endsWith('*'));

    const totalAgeEqNormLine = (out.totalAgeEq === null || out.totalAgeEq === undefined)
      ? null
      : escapeHtml(String(out.totalAgeEq));

    setHTML('tvps_out', `
      <div class="card">
        <div class="grid4">
          <div><div class="k">Faixa etária (B.1)</div><div class="v mono">${out.ageKey}</div></div>
          <div><div class="k">Soma Scaled</div><div class="v mono">${out.sumScaled}</div></div>
          <div><div class="k">Standard Score</div><div class="v mono">${out.standard}</div></div>
          <div><div class="k">B.3</div><div class="v">${b3line}</div></div>
        </div>
      </div>
      <div class="card">
        <div class="k">Idade Equivalente Total (média aparada)</div>
        <div class="v mono">${totalAgeEqMeanLine}</div>
        ${ageEqMeanUsesBounds ? `<div class="muted" style="margin-top:6px">* inclui valores censurados (&lt; / &gt;) usando o limite da tabela apenas para viabilizar a média aparada.</div>` : ''}
        ${totalAgeEqNormLine ? `<div class="muted" style="margin-top:6px">Total normativo (B4_total): <span class="mono">${totalAgeEqNormLine}</span></div>` : ''}
      </div>
      <div class="card">
        <table class="tbl">
          <thead><tr><th>Subteste</th><th>Raw</th><th>Scaled</th><th>Percentil</th><th>Age Eq (B.4)</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `);

    const canvas = el('tvps_chart');
    drawBarChart(canvas, TVPS_SUBTESTS.map(s=>out.scaled[s]), TVPS_SUBTESTS, 1, 19);
  }

  function saveTVPS(){
    const p = ensureSelectedPatient();
    if(!p) return;
    if(!p.tests.tvps4){ showToast('Calcule o TVPS-4 antes de salvar.', false); return; }
    upsertPatient(p);
    try{ renderIntegratedPanel(p); }catch(e){}
    showToast('TVPS-4 salvo no paciente.');
  }

  function loadTVPSFromPatient(p){
    resetTVPSForm();
    const out = p.tests && p.tests.tvps4;
    if(!out) return;
    for(const st of TVPS_SUBTESTS){
      const s = el('tvps_raw_'+st);
      if(s) s.value = String(out.raws?.[st] ?? '');
    }
    renderTVPS(out);
  }

  // ---------------- DTVP-3 ----------------
  const DTVP_SUBTESTS = ['coordenacao_olho_mao','copia','figura_fundo','fechamento_visual','constancia_forma'];

  function initDTVPForm(){
    const keys = Object.keys(window.DTVP3_NORMS?.tabelas_conversao || {});
    DTVP_SUBTESTS.forEach(st=>{
      let maxRaw = 0;
      for(const k of keys){
        const ranges = window.DTVP3_NORMS.tabelas_conversao[k]?.[st];
        if(!Array.isArray(ranges)) continue;
        for(const r of ranges){
          const hi = (typeof r.bruta_max === 'number') ? r.bruta_max : r.raw_max;
          if(typeof hi === 'number' && Number.isFinite(hi)) maxRaw = Math.max(maxRaw, hi);
        }
      }
      buildSelectOptions(el('dtvp_raw_'+st), 0, maxRaw);
    });
    el('btn_dtvp_calcular')?.addEventListener('click', calcDTVP);
    el('btn_dtvp_salvar')?.addEventListener('click', saveDTVP);
  }

  function resetDTVPForm(){
    DTVP_SUBTESTS.forEach(st=> { const s=el('dtvp_raw_'+st); if(s) s.value=''; });
    setHTML('dtvp_out','<div class="muted">Preencha os Raw Scores e clique Calcular.</div>');
  }

  function calcDTVP(){
    const p = ensureSelectedPatient();
    if(!p) return;

    const age = window.ClinicalEngine.calcAgeYMD(p.dob, new Date());
    const ageKey = window.ClinicalEngine.findDTVPAgeKey(age.yearsRounded, age.monthsRounded);
    if(!ageKey){
      const keys = Object.keys(window.DTVP3_NORMS?.tabelas_conversao || {});
      const hint = keys.length ? `Disponíveis neste arquivo: ${keys.join(', ')}` : 'Nenhuma faixa encontrada no arquivo de normas.';
      showToast('Sem faixa normativa do DTVP-3 para esta idade. ' + hint, false);
      return;
    }

    const raws = {};
    for(const st of DTVP_SUBTESTS){
      const v = el('dtvp_raw_'+st)?.value;
      if(v==='' || v==null){ showToast('Preencha todos os subtestes do DTVP-3.', false); return; }
      raws[st] = parseInt(v,10);
    }

    const scaled = {};
    for(const st of DTVP_SUBTESTS){
      const sc = window.ClinicalEngine.dtvpRawToScaled(ageKey, st, raws[st]);
      if(sc===null){
        showToast(`Sem conversão raw→scaled para ${st} raw=${raws[st]} em ${ageKey}.`, false);
        return;
      }
      scaled[st]=sc;
    }

    const soma_pe = (scaled.coordenacao_olho_mao || 0) + (scaled.copia || 0);
    const soma_mr = (scaled.figura_fundo || 0) + (scaled.fechamento_visual || 0) + (scaled.constancia_forma || 0);
    const soma_gvp = soma_pe + soma_mr;

    const compRow = window.ClinicalEngine.dtvpComposite(ageKey, {soma_pe, soma_mr, soma_gvp});

    const out = {
      ageKey, raws, scaled,
      sums: {soma_pe, soma_mr, soma_gvp},
      composites: compRow ? { ivm: compRow.ivm, pvrm: compRow.pvrm, pvg: compRow.pvg } : null,
      computedAt: new Date().toISOString()
    };

    p.tests.dtvp3 = out;
    renderDTVP(out);
    renderIntegratedPanel(p);
    showToast('DTVP-3 calculado.');
  }

  function prettyDTVP(k){
    const map = {
      coordenacao_olho_mao: 'Coordenação Olho-Mão',
      copia: 'Cópia',
      figura_fundo: 'Figura-Fundo',
      fechamento_visual: 'Fechamento Visual',
      constancia_forma: 'Constância da Forma'
    };
    return map[k] || k;
  }
  function prettyDTVPShort(k){
    const map = { coordenacao_olho_mao:'CO', copia:'COP', figura_fundo:'FG', fechamento_visual:'FV', constancia_forma:'CF' };
    return map[k] || k;
  }

  function renderDTVP(out){
    const rows = DTVP_SUBTESTS.map(st=>{
      return `<tr><td>${escapeHtml(prettyDTVP(st))}</td><td>${out.raws[st]}</td><td>${out.scaled[st]}</td></tr>`;
    }).join('');

    const c = out.composites;
    const compLine = c ? `IVM=${c.ivm} • PVRM=${c.pvrm} • PVG=${c.pvg}` : '—';

    setHTML('dtvp_out', `
      <div class="card">
        <div class="grid3">
          <div><div class="k">Faixa etária</div><div class="v mono">${escapeHtml(out.ageKey)}</div></div>
          <div><div class="k">Índices (SS)</div><div class="v mono">${escapeHtml(compLine)}</div></div>
          <div><div class="k">Somas</div><div class="v mono">PE=${out.sums.soma_pe} • MR=${out.sums.soma_mr} • GVP=${out.sums.soma_gvp}</div></div>
        </div>
      </div>
      <div class="card">
        <table class="tbl">
          <thead><tr><th>Subteste</th><th>Raw</th><th>Scaled</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `);

    drawAreaLineChart(el('dtvp_chart'), DTVP_SUBTESTS.map(s=>out.scaled[s]), DTVP_SUBTESTS.map(prettyDTVPShort), 1, 19);
  }

  function saveDTVP(){
    const p = ensureSelectedPatient();
    if(!p) return;
    if(!p.tests.dtvp3){ showToast('Calcule o DTVP-3 antes de salvar.', false); return; }
    upsertPatient(p);
    showToast('DTVP-3 salvo no paciente.');
  }

  function loadDTVPFromPatient(p){
    resetDTVPForm();
    const out = p.tests && p.tests.dtvp3;
    if(!out) return;
    for(const st of DTVP_SUBTESTS){
      const s = el('dtvp_raw_'+st);
      if(s) s.value = String(out.raws?.[st] ?? '');
    }
    renderDTVP(out);
  }

  // ---------------- DEM ----------------
  function initDEMForm(){
    buildSelectOptions(el('dem_v'), 1, 240);
    buildSelectOptions(el('dem_h'), 1, 240);
    buildSelectOptions(el('dem_err'), 0, 50);
    el('btn_dem_calcular')?.addEventListener('click', calcDEM);
    el('btn_dem_salvar')?.addEventListener('click', saveDEM);
  }

  function resetDEMForm(){
    if(el('dem_v')) el('dem_v').value='';
    if(el('dem_h')) el('dem_h').value='';
    if(el('dem_err')) el('dem_err').value='';
    setHTML('dem_out','<div class="muted">Selecione Vertical, Horizontal e Erros. Ratio e Z-score são calculados automaticamente.</div>');
  }

  function calcDEM(){
    const p = ensureSelectedPatient();
    if(!p) return;

    const age = window.ClinicalEngine.calcAgeYMD(p.dob, new Date());
    const ageKey = window.ClinicalEngine.demAgeKey(age.yearsRounded, age.monthsRounded);
    if(!ageKey){ showToast('DEM: idade fora das normas fornecidas (>=6 anos).', false); return; }

    const v = el('dem_v')?.value, h = el('dem_h')?.value, e = el('dem_err')?.value;
    if(v===''||h===''||e===''){ showToast('Preencha todos os campos do DEM.', false); return; }

    const V = parseFloat(v), H = parseFloat(h), ERR = parseInt(e,10);
    const ratio = H / V;

    const zV = window.ClinicalEngine.demZ(ageKey, 'vertical', V);
    const zH = window.ClinicalEngine.demZ(ageKey, 'horizontal', H);
    const zE = window.ClinicalEngine.demZ(ageKey, 'errors', ERR);
    const zR = window.ClinicalEngine.demZ(ageKey, 'ratio', ratio);

    const out = {ageKey, V, H, ERR, ratio, z: {vertical:zV, horizontal:zH, errors:zE, ratio:zR}, computedAt:new Date().toISOString()};
    p.tests.dem = out;
    renderDEM(out);
    renderIntegratedPanel(p);
    showToast('DEM calculado (Z-score).');
  }

  function renderDEM(out){
    const fmtZ = (x)=> (x===null || Number.isNaN(x)) ? '—' : (Math.round(x*100)/100).toFixed(2);
    setHTML('dem_out', `
      <div class="card">
        <div class="grid4">
          <div><div class="k">Faixa etária</div><div class="v mono">${escapeHtml(out.ageKey)}</div></div>
          <div><div class="k">Ratio (H/V)</div><div class="v mono">${fmtZ(out.ratio)}</div></div>
          <div><div class="k">Z Ratio</div><div class="v mono">${fmtZ(out.z.ratio)}</div></div>
          <div><div class="k">Nota</div><div class="v">${(out.ratio>1.4)?'Ratio elevado (perda de automaticidade).':'Dentro do esperado (regra clínica).'} </div></div>
        </div>
      </div>
      <div class="card">
        <table class="tbl">
          <thead><tr><th>Métrica</th><th>Valor</th><th>Z</th></tr></thead>
          <tbody>
            <tr><td>Vertical (s)</td><td>${out.V}</td><td>${fmtZ(out.z.vertical)}</td></tr>
            <tr><td>Horizontal (s)</td><td>${out.H}</td><td>${fmtZ(out.z.horizontal)}</td></tr>
            <tr><td>Erros (n)</td><td>${out.ERR}</td><td>${fmtZ(out.z.errors)}</td></tr>
            <tr><td>Ratio</td><td>${fmtZ(out.ratio)}</td><td>${fmtZ(out.z.ratio)}</td></tr>
          </tbody>
        </table>
      </div>
    `);
    drawBarChart(el('dem_chart'), [out.z.vertical, out.z.horizontal, out.z.errors, out.z.ratio], ['V','H','E','R'], -3, 3);
  }

  function saveDEM(){
    const p = ensureSelectedPatient();
    if(!p) return;
    if(!p.tests.dem){ showToast('Calcule o DEM antes de salvar.', false); return; }
    upsertPatient(p);
    showToast('DEM salvo no paciente.');
  }

  function loadDEMFromPatient(p){
    resetDEMForm();
    const out = p.tests && p.tests.dem;
    if(!out) return;
    if(el('dem_v')) el('dem_v').value = String(out.V ?? '');
    if(el('dem_h')) el('dem_h').value = String(out.H ?? '');
    if(el('dem_err')) el('dem_err').value = String(out.ERR ?? '');
    renderDEM(out);
  }

  // ---------------- NSUCO (simple) ----------------
  function initNSUCOForm(){
    const fields = ['pursuits_ability','pursuits_accuracy','pursuits_head','pursuits_body','saccades_ability','saccades_accuracy','saccades_head','saccades_body'];
    fields.forEach(f=> buildSelectOptions(el('nsuco_'+f), 1, 5));
    el('btn_nsuco_salvar')?.addEventListener('click', saveNSUCO);
  }

  function resetNSUCOForm(){
    document.querySelectorAll('[id^="nsuco_"]').forEach(s=> {
      if(s.tagName==='SELECT') s.value='';
      if(s.id === 'nsuco_notes') s.value='';
    });
    setHTML('nsuco_out','<div class="muted">Preencha (1–5) e salve no paciente.</div>');
    const c = el('nsuco_chart');
    if(c){ const ctx=c.getContext('2d'); ctx && ctx.clearRect(0,0,c.width,c.height); }
  }

  function saveNSUCO(){
    const p = ensureSelectedPatient();
    if(!p) return;

    const fields = ['pursuits_ability','pursuits_accuracy','pursuits_head','pursuits_body','saccades_ability','saccades_accuracy','saccades_head','saccades_body'];
    const data = {};
    for(const f of fields){
      const v = el('nsuco_'+f)?.value;
      if(v===''){ showToast('Preencha todos os campos do NSUCO.', false); return; }
      data[f]=parseInt(v,10);
    }
    const notes = (el('nsuco_notes')?.value || '').trim();

    const pursuits = {
      ability: data.pursuits_ability,
      accuracy: data.pursuits_accuracy,
      head: data.pursuits_head,
      body: data.pursuits_body
    };
    const saccades = {
      ability: data.saccades_ability,
      accuracy: data.saccades_accuracy,
      head: data.saccades_head,
      body: data.saccades_body
    };
    const totals = {
      pursuitsTotal: pursuits.ability + pursuits.accuracy + pursuits.head + pursuits.body,
      saccadesTotal: saccades.ability + saccades.accuracy + saccades.head + saccades.body
    };

    p.tests.nsuco = { pursuits, saccades, totals, notes: notes || '', computedAt: new Date().toISOString() };
    upsertPatient(p);
    renderNSUCO(p.tests.nsuco, p);
    renderIntegratedPanel(p);
    showToast('NSUCO salvo.');
  }

  function renderNSUCO(result, patient){
    const r = result || {};

    const pursuits = r.pursuits || {
      ability: r.pursuits_ability,
      accuracy: r.pursuits_accuracy,
      head: r.pursuits_head,
      body: r.pursuits_body
    };
    const saccades = r.saccades || {
      ability: r.saccades_ability,
      accuracy: r.saccades_accuracy,
      head: r.saccades_head,
      body: r.saccades_body
    };
    const totals = r.totals || {
      pursuitsTotal: (pursuits.ability||0) + (pursuits.accuracy||0) + (pursuits.head||0) + (pursuits.body||0),
      saccadesTotal: (saccades.ability||0) + (saccades.accuracy||0) + (saccades.head||0) + (saccades.body||0)
    };

    const hbMin = (obj)=> {
      const h = Number.isFinite(obj?.head) ? obj.head : null;
      const b = Number.isFinite(obj?.body) ? obj.body : null;
      if(h==null || b==null) return null;
      return Math.min(h,b);
    };
    const pursuitsHB = hbMin(pursuits);
    const saccadesHB = hbMin(saccades);

    const descAbility = (v)=>({1:'1 ciclo ou nenhuma capacidade',2:'2 ciclos',3:'3 ciclos',4:'4 ciclos',5:'5 ciclos'}[v] || '—');
    const descAccuracy = (v)=>({1:'hiper/hipometria significativa',2:'hiper/hipometria de grande a moderada',3:'hiper/hipometria leve, porém constante',4:'hiper/hipometria leve, porém intermitente',5:'sem refixações corretivas'}[v] || '—');
    const descHeadBody = (v)=> descAbility(v);

    const pass = (v)=> Number.isFinite(v) && v >= 4;
    const classifyBlock = (label, obj, hb)=>{
      const items = [['Ability', obj.ability],['Accuracy', obj.accuracy],['Head', obj.head],['Body', obj.body]];
      const failed = items.filter(([,v])=> Number.isFinite(v) && v <= 3).map(([k,v])=> `${k}:${v}`);
      const ok = items.every(([,v])=> pass(v));
      const hbText = (hb==null) ? '' : ` • Head/Body(min)=${hb}${pass(hb)?' (OK)':' (ALTERADO)'}`;
      return {
        label,
        ok,
        failed,
        text: ok ? `${label}: OK (4–5 em todos os itens)${hbText}` : `${label}: ALTERADO (≤3 em: ${failed.join(', ') || '—'})${hbText}`
      };
    };
    const cP = classifyBlock('Pursuits', pursuits, pursuitsHB);
    const cS = classifyBlock('Saccades', saccades, saccadesHB);
    const overallOk = cP.ok && cS.ok;
    const overallText = overallOk ? 'Global: OK' : 'Global: ALTERADO';

    let normHtml = '';
    try{
      const norms = window.NSUCO_NORMS;
      const p = patient || null;
      const sex = (p && p.sex) ? String(p.sex).toUpperCase() : '';
      const age = (p && p.dob) ? window.ClinicalEngine.calcAgeYMD(p.dob, new Date()) : null;
      const ageY = age ? age.yearsRounded : null;
      const ageKey = (ageY==null) ? null : (ageY >= 14 ? '14+' : String(ageY));

      function getMin(section){
        if(!norms || !ageKey || !sex) return null;
        const t = norms[section];
        const row = t && t[ageKey];
        const bySex = row && row[sex];
        return bySex || null;
      }

      const minP = getMin('pursuits');
      const minS = getMin('saccades');

      function normRow(label, obj, min){
        if(!min){
          return `<div class="muted small">${escapeHtml(label)}: sem norma (idade/sexo fora da tabela ou ausente)</div>`;
        }
        const items = [['Ability', obj.ability, min.ability],['Accuracy', obj.accuracy, min.accuracy],['Head', obj.head, min.head],['Body', obj.body, min.body]];
        const cols = items.map(([k,v,mn])=>{
          const ok = Number.isFinite(v) ? (v >= mn) : null;
          const vs = Number.isFinite(v) ? String(v) : '—';
          return `<div class="row" style="grid-template-columns:0.9fr 0.4fr 0.4fr 0.5fr;gap:8px;margin:2px 0">
            <div class="k">${escapeHtml(k)}</div>
            <div class="v mono">${escapeHtml(vs)}</div>
            <div class="v mono small">${escapeHtml(String(mn))}</div>
            <div class="v mono small">${ok===null?'—':(ok?'OK':'ABAIXO')}</div>
          </div>`;
        }).join('');
        return `<div style="margin-top:8px">
          <div style="font-weight:600;margin-bottom:4px">${escapeHtml(label)} — norma mínima (${escapeHtml(ageKey)}a, ${escapeHtml(sex)})</div>
          <div class="row small" style="grid-template-columns:0.9fr 0.4fr 0.4fr 0.5fr;gap:8px;margin-bottom:4px;opacity:.8">
            <div class="k">Item</div><div class="k">Score</div><div class="k">Mín</div><div class="k">Status</div>
          </div>
          ${cols}
        </div>`;
      }

      normHtml = `<div class="card" style="margin-top:10px">
        <div class="k">Normas NSUCO (mínimo aceitável)</div>
        ${normRow('Pursuits', pursuits, minP)}
        ${normRow('Saccades', saccades, minS)}
      </div>`;
    }catch(e){
      normHtml = `<div class="muted small">Normas: erro ao avaliar (${escapeHtml(String(e && e.message ? e.message : e))})</div>`;
    }

    const notesHtml = r.notes ? `<div class="muted" style="margin-top:8px"><b>Notas:</b> ${escapeHtml(r.notes)}</div>` : '';
    const when = r.computedAt ? new Date(r.computedAt).toLocaleString() : '';

    const row = (label, obj, hb, total)=>`
      <tr>
        <td style="padding:6px 4px">${label}</td>
        <td style="text-align:center;padding:6px 4px">${obj.ability ?? '—'}</td>
        <td style="text-align:center;padding:6px 4px">${obj.accuracy ?? '—'}</td>
        <td style="text-align:center;padding:6px 4px">${obj.head ?? '—'}</td>
        <td style="text-align:center;padding:6px 4px">${obj.body ?? '—'}</td>
        <td style="text-align:center;padding:6px 4px">${hb ?? '—'}</td>
        <td style="text-align:center;padding:6px 4px" class="mono">${Number.isFinite(total) ? total : '—'}</td>
      </tr>`;

    setHTML('nsuco_out', `
      <div class="card">
        <div style="margin-bottom:8px"><b>NSUCO</b> ${when ? `• <span class="muted">${escapeHtml(when)}</span>` : ''}</div>

        <div class="grid3" style="margin-bottom:10px">
          <div>
            <div class="k">Critério de classificação</div>
            <div class="v small">Por item: 4–5 = OK • ≤3 = Alterado • Head/Body(min)=pior dos dois</div>
          </div>
          <div>
            <div class="k">Resumo</div>
            <div class="v mono">${escapeHtml(overallText)}</div>
          </div>
          <div>
            <div class="k">Totais</div>
            <div class="v mono">P=${totals.pursuitsTotal} • S=${totals.saccadesTotal} • G=${(totals.pursuitsTotal||0)+(totals.saccadesTotal||0)}<br><span class="muted">P H/B(min)=${pursuitsHB ?? '—'} • S H/B(min)=${saccadesHB ?? '—'}</span></div>
          </div>
        </div>

        <div class="v small" style="margin:6px 0 10px 0">${escapeHtml(cP.text)}<br>${escapeHtml(cS.text)}</div>

        <table class="tbl">
          <thead>
            <tr>
              <th>Seção</th>
              <th>Ability</th>
              <th>Accuracy</th>
              <th>Head</th>
              <th>Body</th>
              <th>H/B (min)</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            ${row('Pursuits', pursuits, pursuitsHB, totals.pursuitsTotal)}
            ${row('Saccades', saccades, saccadesHB, totals.saccadesTotal)}
          </tbody>
        </table>

        <div class="muted" style="margin-top:8px">
          <b>Legend (tabela de pontuação):</b><br>
          Ability: ${escapeHtml(descAbility(pursuits.ability))} • Accuracy: ${escapeHtml(descAccuracy(pursuits.accuracy))} • Head/Body: ${escapeHtml(descHeadBody(pursuitsHB ?? ''))}
        </div>
        ${notesHtml}
      </div>
      ${normHtml}
    `);

    drawNsucoRadar(el('nsuco_chart'), pursuits, saccades, pursuitsHB, saccadesHB);
  }

  function loadNSUCOFromPatient(p){
    resetNSUCOForm();
    const out = p.tests && p.tests.nsuco;
    if(!out) return;
    const flat = {
      pursuits_ability: out.pursuits?.ability ?? out.pursuits_ability,
      pursuits_accuracy: out.pursuits?.accuracy ?? out.pursuits_accuracy,
      pursuits_head: out.pursuits?.head ?? out.pursuits_head,
      pursuits_body: out.pursuits?.body ?? out.pursuits_body,
      saccades_ability: out.saccades?.ability ?? out.saccades_ability,
      saccades_accuracy: out.saccades?.accuracy ?? out.saccades_accuracy,
      saccades_head: out.saccades?.head ?? out.saccades_head,
      saccades_body: out.saccades?.body ?? out.saccades_body
    };
    Object.keys(flat).forEach(k=>{
      const e = el('nsuco_'+k);
      if(e && flat[k] != null && flat[k] !== '') e.value = String(flat[k]);
    });
    const notesEl = el('nsuco_notes');
    if(notesEl) notesEl.value = out.notes || '';
    renderNSUCO(out, p);
  }

  // ---------------- Binocular (vergence/accommodation) ----------------
  let BINOCULAR_SHOW_JSON = false;

  function initBinocularForm(){
    ['cover_distance','cover_near','cover_distance_lateral','cover_near_lateral','grad_near_m1','grad_near_m2'].forEach(id=>{
      const s = el('bin_'+id);
      if(s) buildPhoriaOptions(s, 20, 0.5);
    });

    const aca = el('bin_aca_ratio');
    if(aca) buildSelectOptionsStep(aca, 0.0, 10.0, 0.1, 1);

    [
      'bo_d_blur','bo_d_break','bo_d_recovery',
      'bi_d_break','bi_d_recovery',
      'bo_n_blur','bo_n_break','bo_n_recovery',
      'bi_n_blur','bi_n_break','bi_n_recovery',

      'step_child_bo_n_break','step_child_bo_n_recovery',
      'step_child_bi_n_break','step_child_bi_n_recovery',

      'step_adult_bo_d_break','step_adult_bo_d_recovery',
      'step_adult_bi_d_break','step_adult_bi_d_recovery',
      'step_adult_bo_n_break','step_adult_bo_n_recovery',
      'step_adult_bi_n_break','step_adult_bi_n_recovery'
    ].forEach(f=>{
      const s = el('bin_'+f);
      if(s) buildSelectOptions(s, 0, 50);
    });

    ['npc_break','npc_recovery','npc_rg_break','npc_rg_recovery'].forEach(f=>{
      const s = el('bin_'+f);
      if(s) buildSelectOptionsStep(s, 0.0, 50.0, 0.5, 1);
    });

    ['aa','aa_minus'].forEach(f=>{
      const s = el('bin_'+f);
      if(s) buildSelectOptionsStep(s, 0.0, 25.0, 0.25, 2);
    });

    ['vf_near_cpm','vf_distance_cpm','maf','af'].forEach(f=>{
      const s = el('bin_'+f);
      if(s) buildSelectOptionsStep(s, 0.0, 20.0, 0.5, 1);
    });

    ['mem','fcc','nra','pra'].forEach(f=>{
      const s = el('bin_'+f);
      if(s) buildSelectOptionsStep(s, -6.0, 6.0, 0.25, 2);
    });

    el('btn_binocular_salvar')?.addEventListener('click', saveBinocular);

    const btnJson = el('btn_binocular_ver_json');
    if(btnJson){
      btnJson.addEventListener('click', ()=>{
        BINOCULAR_SHOW_JSON = !BINOCULAR_SHOW_JSON;
        const p = getSelectedPatient();
        if(p && p.tests?.binocular) renderBinocular(p, p.tests.binocular);
      });
    }

    ['bin_pd_mm','bin_work_cm'].forEach(id=>{
      const t = el(id);
      if(t) t.addEventListener('input', updateAcaCalculated);
    });
    ['bin_cover_distance','bin_cover_near','bin_grad_near_m1','bin_grad_near_m2'].forEach(id=>{
      const s = el(id);
      if(s) s.addEventListener('change', ()=>{ updateAcaCalculated(); updateAcaGradient(); });
    });

    updateAcaCalculated();
    updateAcaGradient();
    resetBinocularForm();
  }

  function resetBinocularForm(){
    document.querySelectorAll('[id^="bin_"]').forEach(s=> {
      if(s.tagName==='SELECT') s.value='';
      if(s.tagName==='INPUT') s.value='';
    });
    setHTML('bin_out','<div class="muted">Selecione valores e salve.</div>');
    updateAcaCalculated();
    updateAcaGradient();
  }

  function updateAcaCalculated(){
    const outEl = el('bin_aca_calc');
    if(!outEl) return;

    const pdEl = el('bin_pd_mm');
    const workEl = el('bin_work_cm');
    const distEl = el('bin_cover_distance');
    const nearEl = el('bin_cover_near');

    const pdmm = pdEl ? Number(String(pdEl.value||'').trim()) : NaN;
    const workcm = workEl ? Number(String(workEl.value||'').trim()) : NaN;
    const dRaw = distEl ? Number(distEl.value) : NaN;
    const nRaw = nearEl ? Number(nearEl.value) : NaN;

    if(!Number.isFinite(pdmm) || !Number.isFinite(workcm) || !Number.isFinite(dRaw) || !Number.isFinite(nRaw) || workcm<=0){
      outEl.value = '';
      return;
    }
    const pdcm = pdmm/10;
    const nfdm = workcm/100;

    // selects: EXO=+, ESO=-; convenção clínica: ESO=+, EXO=- => inverter sinal
    const Hf = -dRaw;
    const Hn = -nRaw;

    const aca = pdcm + (nfdm * (Hn - Hf));
    outEl.value = (Math.round(aca*10)/10).toFixed(1);
  }

  function updateAcaGradient(){
    const out1 = el('bin_aca_grad_m1');
    const out2 = el('bin_aca_grad_m2');
    if(!out1 && !out2) return;

    const nearEl = el('bin_cover_near');
    const m1El = el('bin_grad_near_m1');
    const m2El = el('bin_grad_near_m2');

    const nRaw = nearEl ? Number(nearEl.value) : NaN;
    const m1Raw = m1El ? Number(m1El.value) : NaN;
    const m2Raw = m2El ? Number(m2El.value) : NaN;

    if(!Number.isFinite(nRaw)){
      if(out1) out1.value = '';
      if(out2) out2.value = '';
      return;
    }

    const Hbase = -nRaw; // convenção clínica

    if(out1){
      if(Number.isFinite(m1Raw)){
        const Hm1 = -m1Raw;
        const aca1 = (Hm1 - Hbase) / 1.0;
        out1.value = (Math.round(aca1*10)/10).toFixed(1);
      }else out1.value = '';
    }

    if(out2){
      if(Number.isFinite(m2Raw)){
        const Hm2 = -m2Raw;
        const aca2 = (Hm2 - Hbase) / 2.0;
        out2.value = (Math.round(aca2*10)/10).toFixed(1);
      }else out2.value = '';
    }
  }

  function saveBinocular(){
    const p = ensureSelectedPatient();
    if(!p) return;
    const data = {};
    document.querySelectorAll('[id^="bin_"]').forEach(s=>{
      const key = s.id.replace('bin_','');
      if(s.tagName==='SELECT'){
        const v = s.value;
        if(v==='') return;
        const n = Number(v);
        if(!Number.isFinite(n)) return;
        data[key]=n;
        return;
      }
      if(s.tagName==='INPUT'){
        const v = String(s.value||'').trim();
        if(v==='') return;
        const n = Number(v);
        if(Number.isFinite(n)) data[key]=n;
        else data[key]=v;
      }
    });
    if(Object.keys(data).length===0){ showToast('Preencha ao menos um campo da seção binocular.', false); return; }
    if(!p.tests) p.tests = {};
    p.tests.binocular = {data, computedAt:new Date().toISOString()};
    upsertPatient(p);
    renderBinocular(p, p.tests.binocular);
    renderIntegratedPanel(p);
    showToast('Vergência/Acomodação salvo.');
  }

  function loadBinocularFromPatient(p){
    resetBinocularForm();
    const out = p.tests && p.tests.binocular;
    if(!out) return;
    for(const [k,v] of Object.entries(out.data || {})){
      let key = k;
      if(key.endsWith('_rec')) key = key.replace(/_rec$/,'_recovery');
      if(key === 'npc_rec') key = 'npc_recovery';
      const s = el('bin_'+key);
      if(s) s.value = String(v);
    }
    updateAcaCalculated();
    updateAcaGradient();
    renderBinocular(p, out);
  }

  function renderBinocular(p, out){
    const age = window.ClinicalEngine.calcAgeYMD(p.dob, new Date());
    const ageY = age ? age.yearsRounded : null;
    const ageM = age ? age.monthsRounded : null;
    const ageStr = age ? `${ageY}a ${ageM}m` : '—';

    const data = out?.data || {};
    const N = window.BINOCULAR_NORMS || {};

    function normLine(label, valStr, normStr, zStr){
      return `<div class="row" style="grid-template-columns: 1.3fr 0.7fr 1fr 0.7fr; gap:8px; margin:2px 0;">
        <div class="k">${escapeHtml(label)}</div>
        <div class="v mono">${escapeHtml(valStr)}</div>
        <div class="v small">${escapeHtml(normStr)}</div>
        <div class="v mono small">${escapeHtml(zStr)}</div>
      </div>`;
    }

    function renderZ(v, mean, sd){
      const zp = zAndPercent(v, mean, sd);
      if(!zp) return '—';
      const z = Math.round(zp.z*100)/100;
      const pct = Math.round((zp.pct ?? 0)*10)/10;
      return `z=${z} • p=${pct}`;
    }

    function coverNorm(which){
      const obj = N.cover_test?.[which];
      if(!obj) return null;
      const meanTxt = obj.mean;
      const sd = obj.sd_prism_diopters;
      const m = (typeof meanTxt==='string') ? meanTxt.match(/([0-9.]+)/) : null;
      const mean = m ? Number(m[1]) : null;
      return { mean, sd };
    }

    function facilityNormMAF(ageY){
      const a = N.accommodation?.accommodative_facility?.monocular;
      if(!a || ageY===null) return null;
      if(ageY === 6) return a.children?.["6"] || null;
      if(ageY === 7) return a.children?.["7"] || null;
      if(ageY >= 8 && ageY <= 12) return a.children?.["8_12"] || null;
      if(ageY >= 13 && ageY <= 30) return a.adults?.["13_30"] || null;
      return null;
    }
    function facilityNormBAF(ageY){
      const a = N.accommodation?.accommodative_facility?.binocular;
      if(!a || ageY===null) return null;
      if(ageY === 6) return a.children?.["6"] || null;
      if(ageY === 7) return a.children?.["7"] || null;
      if(ageY >= 8 && ageY <= 12) return a.children?.["8_12"] || null;
      if(ageY >= 13) return a.adults || null;
      return null;
    }
    function stepNorm(mode){ return N.step_vergence?.[mode] || null; }

    let html = `<div class="card"><div class="k">Idade usada</div><div class="v mono">${escapeHtml(ageStr)}</div></div>`;
    html += `<div class="card"><div class="k">Valores + normas</div>`;

    // Cover test
    const cd = data.cover_distance;
    if(cd !== undefined){
      const n = coverNorm('distance');
      const normStr = n ? `média ${n.mean} exo • DP ±${n.sd}Δ` : 'Sem norma';
      html += normLine('Foria Longe', formatPhoriaValue(cd), normStr, n ? renderZ(cd, n.mean, n.sd) : '—');
    }
    const cn = data.cover_near;
    if(cn !== undefined){
      const obj = N.cover_test?.near;
      const mean = obj ? Number(String(obj.mean).match(/([0-9.]+)/)?.[1]) : null;
      const sd = obj?.sd_prism_diopters;
      const normStr = (mean!==null && sd!=null) ? `média ${mean} exo • DP ±${sd}Δ` : 'Sem norma';
      html += normLine('Foria Perto', formatPhoriaValue(cn), normStr, (mean!==null && sd!=null) ? renderZ(cn, mean, sd) : '—');
    }
    const cdl = data.cover_distance_lateral;
    if(cdl !== undefined){
      const obj = N.cover_test?.distance_lateral_phoria;
      const mean = obj ? Number(String(obj.mean).match(/([0-9.]+)/)?.[1]) : null;
      const sd = obj?.sd_prism_diopters;
      const normStr = (mean!==null && sd!=null) ? `média ${mean} exo • DP ±${sd}Δ` : 'Sem norma';
      html += normLine('Foria lateral Longe', formatPhoriaValue(cdl), normStr, (mean!==null && sd!=null) ? renderZ(cdl, mean, sd) : '—');
    }
    const cnl = data.cover_near_lateral;
    if(cnl !== undefined){
      const obj = N.cover_test?.near_lateral_phoria;
      const mean = obj ? Number(String(obj.mean).match(/([0-9.]+)/)?.[1]) : null;
      const sd = obj?.sd_prism_diopters;
      const normStr = (mean!==null && sd!=null) ? `média ${mean} exo • DP ±${sd}Δ` : 'Sem norma';
      html += normLine('Foria lateral Perto', formatPhoriaValue(cnl), normStr, (mean!==null && sd!=null) ? renderZ(cnl, mean, sd) : '—');
    }

    const aca = data.aca_ratio;
    if(aca !== undefined){
      const mean = N.cover_test?.aca_ratio?.mean;
      const normStr = (mean!==undefined && mean!==null) ? `média ${mean} (DP não informado)` : 'Sem norma';
      html += normLine('AC/A (manual)', fmtFixed(aca,1), normStr, '—');
    }

    const acaCalc = data.aca_calc;
    if(acaCalc !== undefined){
      const pd = data.pd_mm;
      const work = data.work_cm;
      const extra = (pd!==undefined && work!==undefined) ? ` (PD ${fmtFixed(pd,1)}mm • dist ${fmtFixed(work,1)}cm)` : '';
      const vNum = Number(acaCalc);
      const valStr = Number.isFinite(vNum) ? fmtFixed(vNum,1) : String(acaCalc);
      html += normLine('AC/A calculada', valStr, 'calculadora (heteroforia)'+extra, '—');
    }

    // Smooth vergence
    function smooth(dataKey, normKey, metric, label){
      const v = data[dataKey];
      if(v === undefined) return;
      const n = N.smooth_vergence?.[normKey]?.[metric];
      const mean = n?.mean, sd = n?.sd;
      const normStr = (mean!=null && sd!=null) ? `média ${mean} • DP ±${sd}` : 'Sem norma';
      html += normLine(label, fmtFixed(v,0), normStr, (mean!=null && sd!=null) ? renderZ(v, mean, sd) : '—');
    }
    smooth('bo_d_blur','base_out_distance','blur','BO Longe — Embaçamento');
    smooth('bo_d_break','base_out_distance','break','BO Longe — Ruptura');
    smooth('bo_d_recovery','base_out_distance','recovery','BO Longe — Recuperação');
    smooth('bi_d_break','base_in_distance','break','BI Longe — Ruptura');
    smooth('bi_d_recovery','base_in_distance','recovery','BI Longe — Recuperação');
    smooth('bo_n_blur','base_out_near','blur','BO Perto — Embaçamento');
    smooth('bo_n_break','base_out_near','break','BO Perto — Ruptura');
    smooth('bo_n_recovery','base_out_near','recovery','BO Perto — Recuperação');
    smooth('bi_n_blur','base_in_near','blur','BI Perto — Embaçamento');
    smooth('bi_n_break','base_in_near','break','BI Perto — Ruptura');
    smooth('bi_n_recovery','base_in_near','recovery','BI Perto — Recuperação');

    // Step vergence
    const stepMode = (ageY!==null && ageY>=13) ? 'adults' : ((ageY!==null && ageY>=7 && ageY<=12) ? 'children_7_12' : null);
    function step(label, key, path){
      const v = data[key];
      if(v === undefined) return;
      const n = stepMode ? stepNorm(stepMode) : null;
      const node = n ? path.reduce((acc,k)=>acc && acc[k], n) : null;
      const mean = node?.mean, sd = node?.sd;
      const normStr = (stepMode && mean!=null && sd!=null) ? `(${stepMode==='adults'?'Adulto':'Criança 7–12'}) média ${mean} • DP ±${sd}` : 'Sem norma';
      html += normLine(label, fmtFixed(v,0), normStr, (mean!=null && sd!=null) ? renderZ(v, mean, sd) : '—');
    }
    step('Step — BO Perto Ruptura', (stepMode==='children_7_12')?'step_child_bo_n_break':'step_adult_bo_n_break', ['base_out_near','break']);
    step('Step — BO Perto Recuperação', (stepMode==='children_7_12')?'step_child_bo_n_recovery':'step_adult_bo_n_recovery', ['base_out_near','recovery']);
    step('Step — BI Perto Ruptura', (stepMode==='children_7_12')?'step_child_bi_n_break':'step_adult_bi_n_break', ['base_in_near','break']);
    step('Step — BI Perto Recuperação', (stepMode==='children_7_12')?'step_child_bi_n_recovery':'step_adult_bi_n_recovery', ['base_in_near','recovery']);

    if(stepMode==='adults'){
      step('Step — BO Longe Ruptura','step_adult_bo_d_break',['base_out_distance','break']);
      step('Step — BO Longe Recuperação','step_adult_bo_d_recovery',['base_out_distance','recovery']);
      step('Step — BI Longe Ruptura','step_adult_bi_d_break',['base_in_distance','break']);
      step('Step — BI Longe Recuperação','step_adult_bi_d_recovery',['base_in_distance','recovery']);
    }

    // Vergence facility
    const vfN = data.vf_near_cpm;
    if(vfN !== undefined){
      const n = N.facility_and_npc?.vergence_facility_near_12bo;
      const normStr = n ? `média ${n.mean_cpm} cpm • DP ±${n.sd_cpm}` : 'Sem norma';
      html += normLine('Flexibilidade vergencial Perto', fmtFixed(vfN,1)+' cpm', normStr, n ? renderZ(vfN, n.mean_cpm, n.sd_cpm) : '—');
    }
    const vfD = data.vf_distance_cpm;
    if(vfD !== undefined){
      const n = N.facility_and_npc?.vergence_facility_distance_12bo;
      const normStr = n ? `média ${n.mean_cpm} cpm • DP ±${n.sd_cpm}` : 'Sem norma';
      html += normLine('Flexibilidade vergencial Longe', fmtFixed(vfD,1)+' cpm', normStr, n ? renderZ(vfD, n.mean_cpm, n.sd_cpm) : '—');
    }

    // NPC
    const npcB = data.npc_break;
    if(npcB !== undefined){
      const n = N.facility_and_npc?.npc_accommodative_target?.break_cm;
      const normStr = n ? `média ${n.mean} cm • DP ±${n.sd}` : 'Sem norma';
      html += normLine('PPC (alvo acomodativo) — Ruptura', fmtFixed(npcB,1)+' cm', normStr, n ? renderZ(npcB, n.mean, n.sd) : '—');
    }
    const npcR = data.npc_recovery;
    if(npcR !== undefined){
      const n = N.facility_and_npc?.npc_accommodative_target?.recovery_cm;
      const normStr = n ? `média ${n.mean} cm • DP ±${n.sd}` : 'Sem norma';
      html += normLine('PPC (alvo acomodativo) — Recuperação', fmtFixed(npcR,1)+' cm', normStr, n ? renderZ(npcR, n.mean, n.sd) : '—');
    }
    const npcRgb = data.npc_rg_break;
    if(npcRgb !== undefined){
      const n = N.facility_and_npc?.npc_penlight_rg?.break_cm;
      const normStr = n ? `média ${n.mean} cm • DP ±${n.sd}` : 'Sem norma';
      html += normLine('PPC (caneta + V/V) — Ruptura', fmtFixed(npcRgb,1)+' cm', normStr, n ? renderZ(npcRgb, n.mean, n.sd) : '—');
    }
    const npcRgr = data.npc_rg_recovery;
    if(npcRgr !== undefined){
      const n = N.facility_and_npc?.npc_penlight_rg?.recovery_cm;
      const normStr = n ? `média ${n.mean} cm • DP ±${n.sd}` : 'Sem norma';
      html += normLine('PPC (caneta + V/V) — Recuperação', fmtFixed(npcRgr,1)+' cm', normStr, n ? renderZ(npcRgr, n.mean, n.sd) : '—');
    }

    // AA
    const aa = data.aa;
    if(aa !== undefined){
      const n = N.accommodation?.amplitude_of_accommodation?.push_up_test;
      if(ageY!==null && n){
        const expected = 18.5 - (0.33*ageY);
        const minimum = 15.0 - (0.25*ageY);
        const sd = n.sd_diopters;
        const belowMin = (Number.isFinite(minimum) && aa < minimum);
        const normStr = `esperado ${fmtFixed(expected,2)} D • mínimo ${fmtFixed(minimum,2)} D • DP ±${sd} D (18,5 − 0,33×idade)`;
        html += normLine('AA — Push-up', fmtFixed(aa,2)+' D', normStr, belowMin ? 'ABAIXO do mínimo' : renderZ(aa, expected, sd));
      }else{
        html += normLine('AA — Push-up', fmtFixed(aa,2)+' D', 'Sem norma (idade não definida)', '—');
      }
    }

    const aaMinus = data.aa_minus;
    if(aaMinus !== undefined){
      const n = N.accommodation?.amplitude_of_accommodation?.minus_lens_test;
      if(aa !== undefined && n){
        const expected = aa + n.expected_delta_from_pushup_diopters; // push-up - 2
        const delta = aaMinus - expected;
        const normStr = `esperado ${fmtFixed(expected,2)} D (≈ Push-up − 2,00 D)`;
        const zStr = `Δ=${fmtFixed(delta,2)} D`;
        html += normLine('AA — Minus lens', fmtFixed(aaMinus,2)+' D', normStr, zStr);
      }else{
        html += normLine('AA — Minus lens', fmtFixed(aaMinus,2)+' D', 'Regra: ≈ Push-up − 2,00 D', '—');
      }
    }

    const maf = data.maf;
    if(maf !== undefined){
      const n = facilityNormMAF(ageY);
      const normStr = n ? `média ${n.mean_cpm} cpm • DP ±${n.sd_cpm}` : 'Sem norma (ou não disponível nesta idade)';
      html += normLine('MAF', fmtFixed(maf,1)+' cpm', normStr, n ? renderZ(maf, n.mean_cpm, n.sd_cpm) : '—');
    }
    const baf = data.af;
    if(baf !== undefined){
      const n = facilityNormBAF(ageY);
      const normStr = n ? `média ${n.mean_cpm} cpm • DP ±${n.sd_cpm}` : 'Sem norma';
      html += normLine('BAF', fmtFixed(baf,1)+' cpm', normStr, n ? renderZ(baf, n.mean_cpm, n.sd_cpm) : '—');
    }

    function acc(key, label){
      const v = data[key];
      if(v === undefined) return;

      if(key === 'mem'){
        const low = 0.25, high = 0.50;
        const ok = (Number.isFinite(v) && v >= low && v <= high);
        html += normLine(label, fmtFixed(v,2)+' D', `faixa esperada +0,25 a +0,50 D`, ok ? 'OK' : 'FORA');
        return;
      }

      const n = N.accommodation?.accuracy?.[key];
      const mean = n?.mean_diopters;
      const sd = n?.sd_diopters;
      const normStr = (mean!=null && sd!=null) ? `média ${fmtFixed(mean,2)} D • DP ±${fmtFixed(sd,2)} D` : 'Sem norma';
      html += normLine(label, fmtFixed(v,2)+' D', normStr, (mean!=null && sd!=null) ? renderZ(v, mean, sd) : '—');
    }
    acc('mem','MEM');
    acc('fcc','FCC');
    acc('nra','NRA');
    acc('pra','PRA');

    html += `</div>`;

    if(BINOCULAR_SHOW_JSON){
      html += `<div class="card"><div class="k">JSON salvo</div><pre class="mono small">${escapeHtml(JSON.stringify(out,null,2))}</pre></div>`;
    }else{
      html += `<div class="muted small">Dica: clique em “Ver JSON” se precisar copiar/exportar exatamente os valores gravados.</div>`;
    }

    setHTML('bin_out', html);
  }

  // ---------------- Visão binocular (Worth 4 Dot / Estereopsia) ----------------
  function initBinocularVisionForm(){
    ensureBinocularVisionMarkup();

    const wItems = [
      {value:'fusion_4', label:'Fusão (4 pontos)'},
      {value:'supp_od', label:'Supressão OD (2 pontos)'},
      {value:'supp_oe', label:'Supressão OE (3 pontos)'},
      {value:'diplopia_5', label:'Diplopia (5 pontos)'},
      {value:'alt_var', label:'Alternância/variável'},
      {value:'other', label:'Outro/indeterminado'}
    ];
    buildSelectOptionsList(el('bnv_w4d_distance'), wItems);
    buildSelectOptionsList(el('bnv_w4d_near'), wItems);

    buildSelectOptionsList(el('bnv_titmus_fly'), [
      {value:'present', label:'Presente'},
      {value:'absent', label:'Ausente'}
    ]);

    const stereoCommon = [
      {value:'no_stereo', label:'Sem estereopsia'},
      {value:40, label:'40"'},
      {value:50, label:'50"'},
      {value:60, label:'60"'},
      {value:80, label:'80"'},
      {value:100, label:'100"'},
      {value:140, label:'140"'},
      {value:200, label:'200"'},
      {value:400, label:'400"'},
      {value:800, label:'800"'}
    ];
    buildSelectOptionsList(el('bnv_titmus_circles'), stereoCommon);

    el('btn_bnv_salvar')?.addEventListener('click', saveBinocularVision);
    el('btn_bnv_limpar')?.addEventListener('click', resetBinocularVisionForm);

    resetBinocularVisionForm();
  }

  function resetBinocularVisionForm(){
    ['bnv_w4d_distance','bnv_w4d_near','bnv_titmus_fly','bnv_titmus_circles'].forEach(id=>{
      const s = el(id); if(s && s.tagName==='SELECT') s.value='';
    });
    if(el('bnv_dot2')) el('bnv_dot2').value='';
    if(el('bnv_fix_seconds')) el('bnv_fix_seconds').value='';
    if(el('bnv_w4d_notes')) el('bnv_w4d_notes').value='';
    if(el('bnv_stereo_notes')) el('bnv_stereo_notes').value='';
    setHTML('bnv_out','<div class="muted">Selecione valores e salve.</div>');
  }

  function saveBinocularVision(){
    const p = ensureSelectedPatient();
    if(!p) return;

    const data = {};
    function takeSelect(id, key){
      const s = el(id);
      if(!s || s.tagName!=='SELECT') return;
      const v = s.value;
      if(v==='') return;
      const n = Number(v);
      data[key] = Number.isFinite(n) ? n : v;
    }
    function takeText(id, key){
      const t = el(id);
      if(!t) return;
      const v = String(t.value||'').trim();
      if(!v) return;
      data[key] = v;
    }

    takeSelect('bnv_w4d_distance','w4d_distance');
    takeSelect('bnv_w4d_near','w4d_near');
    takeText('bnv_w4d_notes','w4d_notes');

    takeSelect('bnv_titmus_fly','titmus_fly');
    takeSelect('bnv_titmus_circles','titmus_circles_arcsec');

    const dot2El = el('bnv_dot2');
    if(dot2El){
      const v = String(dot2El.value||'').trim();
      if(v!==''){
        const n = Number(v);
        if(Number.isFinite(n) && n>=0) data['dot2_arcsec']=n;
      }
    }

    const fixEl = el('bnv_fix_seconds');
    if(fixEl){
      const v = String(fixEl.value||'').trim();
      if(v!==''){
        const n = Number(v);
        if(Number.isFinite(n) && n>=0) data['fix_seconds']=n;
      }
    }

    takeText('bnv_stereo_notes','stereo_notes');

    if(Object.keys(data).length===0){
      showToast('Preencha ao menos um campo em Visão binocular.', false);
      return;
    }

    if(!p.tests) p.tests = {};
    p.tests.binocular_vision = {data, computedAt:new Date().toISOString()};
    upsertPatient(p);
    renderBinocularVision(p, p.tests.binocular_vision);
    renderIntegratedPanel(p);
    showToast('Visão binocular salva.');
  }

  function loadBinocularVisionFromPatient(p){
    resetBinocularVisionForm();
    const out = p.tests && p.tests.binocular_vision;
    if(!out || !out.data) return;
    const d = out.data;

    const setSel = (id, v)=>{
      const s = el(id);
      if(!s || s.tagName!=='SELECT') return;
      if(v===undefined || v===null) return;
      s.value = String(v);
    };
    const setTxt = (id, v)=>{
      const t = el(id);
      if(!t) return;
      if(v===undefined || v===null) return;
      t.value = String(v);
    };

    setSel('bnv_w4d_distance', d.w4d_distance);
    setSel('bnv_w4d_near', d.w4d_near);
    setTxt('bnv_w4d_notes', d.w4d_notes);

    setSel('bnv_titmus_fly', d.titmus_fly);
    setSel('bnv_titmus_circles', d.titmus_circles_arcsec);
    setTxt('bnv_dot2', d.dot2_arcsec);
    setTxt('bnv_stereo_notes', d.stereo_notes);
    setTxt('bnv_fix_seconds', d.fix_seconds);

    renderBinocularVision(p, out);
  }

  function renderBinocularVision(_p, out){
    const d = out?.data || {};
    const mapWorth = {
      'fusion_4':'Fusão (4 pontos)',
      'supp_od':'Supressão OD (2 pontos)',
      'supp_oe':'Supressão OE (3 pontos)',
      'diplopia_5':'Diplopia (5 pontos)',
      'alt_var':'Alternância/variável',
      'other':'Outro/indeterminado'
    };
    const mapFly = {'present':'Presente','absent':'Ausente'};

    function fmtArc(v){
      if(v===undefined || v===null || v==='') return '—';
      if(v==='no_stereo') return 'Sem estereopsia';
      const n = Number(v);
      if(Number.isFinite(n)) return `${n}"`;
      return String(v);
    }

    const rows = [];
    rows.push('<div style="font-weight:600;margin-bottom:6px">Worth 4 Dot</div>');
    rows.push(`<div>Distância: <span class="mono">${escapeHtml(mapWorth[String(d.w4d_distance)] || (d.w4d_distance??'—'))}</span></div>`);
    rows.push(`<div>Perto: <span class="mono">${escapeHtml(mapWorth[String(d.w4d_near)] || (d.w4d_near??'—'))}</span></div>`);
    if(d.w4d_notes) rows.push(`<div class="muted" style="margin-top:6px">Obs.: ${escapeHtml(d.w4d_notes)}</div>`);

    rows.push('<hr style="border:none;border-top:1px solid rgba(255,255,255,.10);margin:10px 0">');
    rows.push('<div style="font-weight:600;margin-bottom:6px">Estereopsia</div>');
    rows.push(`<div>Titmus Fly: <span class="mono">${escapeHtml(mapFly[String(d.titmus_fly)] || (d.titmus_fly??'—'))}</span></div>`);
    rows.push(`<div>Titmus círculos: <span class="mono">${escapeHtml(fmtArc(d.titmus_circles_arcsec))}</span></div>`);
    rows.push(`<div>Dot 2: <span class="mono">${escapeHtml(fmtArc(d.dot2_arcsec))}</span></div>`);
    if(d.stereo_notes) rows.push(`<div class="muted" style="margin-top:6px">Obs.: ${escapeHtml(d.stereo_notes)}</div>`);

    const refStereo = 20;
    function evalStereo(v){
      if(v===undefined || v===null || v==='') return {val:'—', status:'—'};
      if(v==='no_stereo') return {val:'Sem estereopsia', status:'ABAIXO'};
      const n = Number(v);
      if(!Number.isFinite(n)) return {val:String(v), status:'—'};
      return {val:`${n}"`, status:(n<=refStereo ? 'OK' : 'ABAIXO')};
    }
    const cEval = evalStereo(d.titmus_circles_arcsec);
    const dEval = evalStereo(d.dot2_arcsec);

    const fixRef = 10;
    const fixN = Number(d.fix_seconds);
    const fixStatus = Number.isFinite(fixN) ? (fixN>=fixRef ? 'OK' : 'ABAIXO') : '—';

    rows.push('<div class="muted" style="margin-top:10px"><b>Referências:</b> Estereopsia de contorno ≤ <b>20"</b> • Fixação ≥ <b>10 s</b>.</div>');
    rows.push(`<div class="row" style="grid-template-columns:1fr 0.6fr;gap:8px;margin-top:6px">
      <div class="v small">Titmus círculos: <span class="mono">${escapeHtml(cEval.val)}</span></div>
      <div class="v mono small">${escapeHtml(cEval.status)}</div>
    </div>`);
    rows.push(`<div class="row" style="grid-template-columns:1fr 0.6fr;gap:8px;margin-top:2px">
      <div class="v small">Dot 2: <span class="mono">${escapeHtml(dEval.val)}</span></div>
      <div class="v mono small">${escapeHtml(dEval.status)}</div>
    </div>`);
    rows.push(`<div class="row" style="grid-template-columns:1fr 0.6fr;gap:8px;margin-top:2px">
      <div class="v small">Fixação: <span class="mono">${Number.isFinite(fixN)?(fixN+' s'):'—'}</span></div>
      <div class="v mono small">${escapeHtml(fixStatus)}</div>
    </div>`);

    setHTML('bnv_out', rows.join(''));
  }

  // ---------------- Integrated Panel ----------------
  function renderIntegratedPanel(p){
    try{
      const age = window.ClinicalEngine?.calcAgeYMD ? window.ClinicalEngine.calcAgeYMD(p.dob, new Date()) : null;
      const ageStr = age ? `${age.yearsRounded}a ${age.monthsRounded}m` : '—';

      const tvps = p.tests?.tvps4 || null;
      const dtvp = p.tests?.dtvp3 || null;
      const dem  = p.tests?.dem  || null;
      const nsuco = p.tests?.nsuco || null;

      // binocular now stored as {data,...}
      const binWrap = p.tests?.binocular || null;
      const bin = binWrap?.data || null;

      const bnvWrap = p.tests?.binocular_vision || null;
      const bnv = bnvWrap?.data || null;

      const tvpsPct = (tvps && tvps.derived) ? (tvps.derived.Percentile ?? tvps.derived.percentile ?? tvps.derived.totalPercentile ?? tvps.derived.pctTotal ?? null) : null;
      const tvpsLine = tvps ? `SS=${(tvps.standard ?? '—')} • SumScaled=${(tvps.sumScaled ?? '—')} • PctTotal=${(tvpsPct ?? '—')}` : '—';
      const dtvpLine = dtvp ? (dtvp.composites ? `PVG=${dtvp.composites.pvg ?? '—'} • IVM=${dtvp.composites.ivm ?? '—'} • PVRM=${dtvp.composites.pvrm ?? '—'}` : '—') : '—';
      const demLine  = dem ? `Ratio=${fmt2(dem.ratio)} • ZR=${fmt2(dem.z?.ratio)}` : '—';

      const nsucoLine = nsuco ? `P=${fmtN(nsuco.pursuits?.ability)}/${fmtN(nsuco.pursuits?.accuracy)}/${fmtN(nsuco.pursuits?.head)}/${fmtN(nsuco.pursuits?.body)} • S=${fmtN(nsuco.saccades?.ability)}/${fmtN(nsuco.saccades?.accuracy)}/${fmtN(nsuco.saccades?.head)}/${fmtN(nsuco.saccades?.body)}` : '—';

      const binLine = bin
        ? `Foria L/P: ${formatPhoriaValue(bin.cover_distance)} / ${formatPhoriaValue(bin.cover_near)} • PPC(Q/R): ${fmtFixed(bin.npc_break,1)} / ${fmtFixed(bin.npc_recovery,1)} cm`
        : '—';

      const bnvLine = bnv
        ? `Worth D/N: ${fmtStr(bnv.w4d_distance)}/${fmtStr(bnv.w4d_near)} • Titmus: ${fmtStr(bnv.titmus_circles_arcsec)} • Dot2: ${fmtStr(bnv.dot2_arcsec)} • Fix: ${fmtStr(bnv.fix_seconds)}`
        : '—';

      const sexVal = (p.sex ?? p.profile?.sex ?? p.demographics?.sex ?? p.sexo ?? null);
      const sexStr = (sexVal === 'M' || sexVal === 'F') ? sexVal : (sexVal ? String(sexVal) : '—');

      ensurePanelMarkup();

      // Cards
      safeSetText('dash_tvps_v', tvps ? `SS ${tvps.standard ?? '—'}` : '—');
      safeSetText('dash_tvps_s', tvps ? `Pct ${tvpsPct ?? '—'} • Sum ${tvps.sumScaled ?? '—'}` : 'Sem dados');

      const pTotal = nsuco?.totals?.pursuitsTotal ?? (nsuco ? ((nsuco.pursuits?.ability??0)+(nsuco.pursuits?.accuracy??0)+(nsuco.pursuits?.head??0)+(nsuco.pursuits?.body??0)) : null);
      const sTotal = nsuco?.totals?.saccadesTotal ?? (nsuco ? ((nsuco.saccades?.ability??0)+(nsuco.saccades?.accuracy??0)+(nsuco.saccades?.head??0)+(nsuco.saccades?.body??0)) : null);
      safeSetText('dash_nsuco_v', nsuco ? `${pTotal ?? '—'} / ${sTotal ?? '—'}` : '—');
      safeSetText('dash_nsuco_s', nsuco ? 'Pursuits / Saccades (soma 0–20)' : 'Sem dados');

      safeSetText('dash_dtvp_v', dtvp ? `PVG ${dtvp.composites?.pvg ?? '—'}` : '—');
      safeSetText('dash_dtvp_s', dtvp ? `IVM ${dtvp.composites?.ivm ?? '—'} • PVRM ${dtvp.composites?.pvrm ?? '—'}` : 'Sem dados');

      safeSetText('dash_dem_v', dem ? `Ratio ${fmt2(dem.ratio)}` : '—');
      safeSetText('dash_dem_s', dem ? `ZR ${fmt2(dem.z?.ratio)}` : 'Sem dados');

      safeSetText('dash_bin_v', bin ? `${formatPhoriaValue(bin.cover_distance)}/${formatPhoriaValue(bin.cover_near)}` : '—');
      safeSetText('dash_bin_s', bin ? `PPC ${fmtFixed(bin.npc_break,1)} / ${fmtFixed(bin.npc_recovery,1)} cm` : 'Sem dados');

      const stereo = bnv ? (bnv.titmus_circles_arcsec ?? null) : null;
      safeSetText('dash_bnv_v', bnv ? `${fmtStr(bnv.w4d_distance)}/${fmtStr(bnv.w4d_near)}` : '—');
      safeSetText('dash_bnv_s', bnv ? `Stereo ${fmtStr(stereo)}` : 'Sem dados');

      // NSUCO radar inside panel
      try{
        const canvas = el('panel_nsuco_radar');
        if(canvas && nsuco){
          const pursuits2 = nsuco.pursuits || {ability:nsuco.pursuits_ability, accuracy:nsuco.pursuits_accuracy, head:nsuco.pursuits_head, body:nsuco.pursuits_body};
          const saccades2 = nsuco.saccades || {ability:nsuco.saccades_ability, accuracy:nsuco.saccades_accuracy, head:nsuco.saccades_head, body:nsuco.saccades_body};
          const hbMin2 = (obj)=> {
            const h = Number.isFinite(obj?.head) ? obj.head : null;
            const b = Number.isFinite(obj?.body) ? obj.body : null;
            if(h==null || b==null) return null;
            return Math.min(h,b);
          };
          drawNsucoRadar(canvas, pursuits2, saccades2, hbMin2(pursuits2), hbMin2(saccades2));
        }else if(canvas){
          const ctx = canvas.getContext('2d'); ctx && ctx.clearRect(0,0,canvas.width,canvas.height);
        }
      }catch(e){}

      // TVPS chart inside panel
      try{
        const cTvps = el('panel_tvps_chart');
        if(cTvps && tvps){
          const subKeys = ['DIS','MEM','SPA','CON','SEQ','FGR','CLO'];
          const labels = ['DIS','MEM','SPA','CON','SEQ','FGR','CLO'];
          const vals = subKeys.map(k=> tvps.scaled ? tvps.scaled[k] : null);
          drawAreaLineChart(cTvps, vals, labels, 1, 19);
        }else if(cTvps){
          const ctx = cTvps.getContext('2d'); ctx && ctx.clearRect(0,0,cTvps.width,cTvps.height);
        }
      }catch(e){}

      // DTVP chart inside panel
      try{
        const cDtvp = el('panel_dtvp_chart');
        if(cDtvp && dtvp){
          const vals = DTVP_SUBTESTS.map(k=> Number(dtvp.scaled?.[k]));
          const labs = DTVP_SUBTESTS.map(prettyDTVPShort);
          drawAreaLineChart(cDtvp, vals, labs, 1, 19);
        }else if(cDtvp){
          const ctx = cDtvp.getContext('2d'); ctx && ctx.clearRect(0,0,cDtvp.width,cDtvp.height);
        }
      }catch(e){}

      setHTML('panel_integrado', `
        <div class="card">
          <div class="grid3">
            <div><div class="k">Paciente</div><div class="v">${escapeHtml(p.name || '—')}</div></div>
            <div><div class="k">Idade</div><div class="v mono">${escapeHtml(ageStr)}</div></div>
            <div><div class="k">Sexo</div><div class="v mono">${escapeHtml(sexStr)}</div></div>
          </div>
        </div>

        <div class="card">
          <div class="k">Resumo de testes</div>
          <div class="v small">TVPS-4: ${escapeHtml(String(tvpsLine))}</div>
          <div class="v small">DTVP-3: ${escapeHtml(String(dtvpLine))}</div>
          <div class="v small">DEM: ${escapeHtml(String(demLine))}</div>
          <div class="v small">NSUCO: ${escapeHtml(String(nsucoLine))}</div>
          <div class="v small">Vergência/Acomodação: ${escapeHtml(String(binLine))}</div>
          <div class="v small">Visão binocular (sensorial): ${escapeHtml(String(bnvLine))}</div>
        </div>
      `);
    }catch(e){
      console.error('renderIntegratedPanel fail', e);
      ensurePanelMarkup();
      setHTML('panel_integrado', `<div class="muted">Falha ao renderizar painel. Veja o console.</div><pre class="mono small" style="white-space:pre-wrap">${escapeHtml(String(e && e.message ? e.message : e))}</pre>`);
    }
  }

  // ---------------- charts (no external libs) ----------------
  function drawRadarChart(canvas, axes, series, minV, maxV, targetV){
    if(!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0,0,w,h);

    const rs = getComputedStyle(document.documentElement);
    const chartText = (rs.getPropertyValue('--chartText')||'').trim() || '#111827';
    const chartAxis = (rs.getPropertyValue('--chartAxis')||'').trim() || 'rgba(17,24,39,.55)';
    const chartGrid = (rs.getPropertyValue('--chartGrid')||'').trim() || 'rgba(17,24,39,.12)';
    const c1 = (rs.getPropertyValue('--chart1')||'').trim() || '#2563eb';
    const c2 = (rs.getPropertyValue('--chart2')||'').trim() || '#16a34a';

    const cx = w/2, cy = h/2 + 10;
    const radius = Math.min(w,h) * 0.36;
    const n = axes.length;
    const levels = 4;

    ctx.lineWidth = 1;
    for(let l=1;l<=levels;l++){
      const r = radius * (l/levels);
      ctx.beginPath();
      for(let i=0;i<n;i++){
        const a = (Math.PI*2*i/n) - Math.PI/2;
        const x = cx + r*Math.cos(a);
        const y = cy + r*Math.sin(a);
        if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
      }
      ctx.closePath();
      ctx.strokeStyle = chartGrid;
      ctx.stroke();
    }
    ctx.strokeStyle = chartGrid;
    for(let i=0;i<n;i++){
      const a = (Math.PI*2*i/n) - Math.PI/2;
      ctx.beginPath();
      ctx.moveTo(cx,cy);
      ctx.lineTo(cx + radius*Math.cos(a), cy + radius*Math.sin(a));
      ctx.stroke();
    }

    ctx.fillStyle = chartAxis;
    ctx.font = '12px system-ui,-apple-system,Segoe UI,Roboto,Arial';
    for(let i=0;i<n;i++){
      const a = (Math.PI*2*i/n) - Math.PI/2;
      const lx = cx + (radius + 18)*Math.cos(a);
      const ly = cy + (radius + 18)*Math.sin(a);
      ctx.textAlign = (Math.cos(a) > 0.2) ? 'left' : (Math.cos(a) < -0.2 ? 'right' : 'center');
      ctx.textBaseline = (Math.sin(a) > 0.2) ? 'top' : (Math.sin(a) < -0.2 ? 'bottom' : 'middle');
      ctx.fillText(String(axes[i]), lx, ly);
    }

    function poly(values, stroke, fill, dash){
      ctx.save();
      if(dash) ctx.setLineDash(dash); else ctx.setLineDash([]);
      ctx.beginPath();
      for(let i=0;i<n;i++){
        const v = values[i];
        if(!Number.isFinite(v)) continue;
        const t = (v - minV) / (maxV - minV);
        const r = Math.max(0, Math.min(1, t)) * radius;
        const a = (Math.PI*2*i/n) - Math.PI/2;
        const x = cx + r*Math.cos(a);
        const y = cy + r*Math.sin(a);
        if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
      }
      ctx.closePath();
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 2;
      ctx.stroke();
      if(fill){
        ctx.fillStyle = fill;
        ctx.globalAlpha = 0.18;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    }

    if(Number.isFinite(targetV)){
      const tgt = new Array(n).fill(targetV);
      poly(tgt, 'rgba(17,24,39,.55)', null, [6,5]);
    }

    (series||[]).forEach((s, idx)=>{
      const stroke = s.color || (idx===0 ? c1 : c2);
      const fill = s.fill === false ? null : stroke;
      poly(s.values||[], stroke, fill, null);
    });

    const legend = [];
    if(Number.isFinite(targetV)) legend.push({label:`Alvo ${targetV}`, color:'rgba(17,24,39,.55)', dash:true});
    (series||[]).forEach((s, idx)=> legend.push({label:s.name||`S${idx+1}`, color:s.color || (idx===0?c1:c2), dash:false}));
    let x0 = 14, y0 = 16;
    ctx.font = '12px system-ui,-apple-system,Segoe UI,Roboto,Arial';
    ctx.textAlign='left'; ctx.textBaseline='middle';
    legend.forEach((it, i)=>{
      const y = y0 + i*16;
      ctx.save();
      ctx.beginPath();
      ctx.strokeStyle = it.color;
      ctx.lineWidth = 3;
      if(it.dash) ctx.setLineDash([6,5]); else ctx.setLineDash([]);
      ctx.moveTo(x0, y);
      ctx.lineTo(x0+18, y);
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = chartText;
      ctx.fillText(it.label, x0+24, y);
    });
  }

  function drawNsucoRadar(canvas, pursuits, saccades, pursuitsHB, saccadesHB){
    const axes = ['Habilidade','Precisão','Cabeça','Corpo','H/B'];
    const pVals = [pursuits?.ability, pursuits?.accuracy, pursuits?.head, pursuits?.body, pursuitsHB];
    const sVals = [saccades?.ability, saccades?.accuracy, saccades?.head, saccades?.body, saccadesHB];
    const rs = getComputedStyle(document.documentElement);
    const c1 = (rs.getPropertyValue('--chart1')||'').trim() || '#2563eb';
    const c2 = (rs.getPropertyValue('--chart2')||'').trim() || '#16a34a';
    drawRadarChart(canvas, axes, [
      {name:'Pursuits', values:pVals, color:c1},
      {name:'Saccades', values:sVals, color:c2},
    ], 1, 5, 4);
  }

  function drawBarChart(canvas, values, labels, minY, maxY){
    if(!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0,0,w,h);

    const rs = getComputedStyle(document.documentElement);
    const chartText = (rs.getPropertyValue('--chartText')||'').trim() || '#111827';
    const chartAxis = (rs.getPropertyValue('--chartAxis')||'').trim() || 'rgba(17,24,39,.55)';
    const chartGrid = (rs.getPropertyValue('--chartGrid')||'').trim() || 'rgba(17,24,39,.12)';
    const palette = [
      (rs.getPropertyValue('--chart1')||'').trim(),
      (rs.getPropertyValue('--chart2')||'').trim(),
      (rs.getPropertyValue('--chart3')||'').trim(),
      (rs.getPropertyValue('--chart4')||'').trim(),
      (rs.getPropertyValue('--chart5')||'').trim(),
      (rs.getPropertyValue('--chart6')||'').trim()
    ].filter(Boolean);
    if(!palette.length) palette.push('#2563eb');

    const padL=42, padR=10, padT=10, padB=32;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;

    ctx.strokeStyle = chartAxis;
    ctx.fillStyle = chartText;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, padT);
    ctx.lineTo(padL, padT+plotH);
    ctx.lineTo(padL+plotW, padT+plotH);
    ctx.stroke();

    const ticks = 6;
    ctx.font = '12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
    for(let i=0;i<=ticks;i++){
      const y = padT + plotH - (i/ticks)*plotH;
      const v = minY + (i/ticks)*(maxY-minY);
      ctx.strokeStyle = chartGrid;
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL+plotW, y); ctx.stroke();
      ctx.fillStyle = chartText;
      ctx.fillText(String(Math.round(v*100)/100), 4, y+4);
    }

    const n = values.length;
    const gap = plotW / (n*1.2);
    const barW = gap*0.8;
    for(let i=0;i<n;i++){
      const x = padL + (i+0.2)*gap*1.2;
      const vNum = Number(values[i]);
      const vv = Number.isFinite(vNum) ? vNum : minY;
      const t = (vv - minY) / (maxY-minY);
      const barH = clamp(t,0,1)*plotH;
      const y = padT + plotH - barH;

      ctx.globalAlpha = 0.9;
      ctx.fillStyle = palette[i % palette.length];
      ctx.fillRect(x, y, barW, barH);
      ctx.globalAlpha = 1;

      ctx.save();
      ctx.translate(x+barW/2, padT+plotH+14);
      ctx.rotate(-0.35);
      ctx.fillStyle = chartText;
      ctx.fillText(labels[i], -10, 0);
      ctx.restore();
    }
  }

  function drawAreaLineChart(canvas, values, labels, minY, maxY){
    if(!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0,0,w,h);

    const rs = getComputedStyle(document.documentElement);
    const chartText = (rs.getPropertyValue('--chartText')||'').trim() || '#111827';
    const chartAxis = (rs.getPropertyValue('--chartAxis')||'').trim() || 'rgba(17,24,39,.55)';
    const chartGrid = (rs.getPropertyValue('--chartGrid')||'').trim() || 'rgba(17,24,39,.12)';
    const lineCol = (rs.getPropertyValue('--chart2')||'').trim() || (rs.getPropertyValue('--chart1')||'').trim() || '#2563eb';

    const padL=42, padR=12, padT=12, padB=34;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;

    ctx.strokeStyle = chartAxis;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, padT);
    ctx.lineTo(padL, padT+plotH);
    ctx.lineTo(padL+plotW, padT+plotH);
    ctx.stroke();

    const ticks = 6;
    ctx.font = '12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
    for(let i=0;i<=ticks;i++){
      const y = padT + plotH - (i/ticks)*plotH;
      const v = minY + (i/ticks)*(maxY-minY);
      ctx.strokeStyle = chartGrid;
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL+plotW, y); ctx.stroke();
      ctx.fillStyle = chartText;
      ctx.fillText(String(Math.round(v*100)/100), 4, y+4);
    }

    const n = values.length;
    if(!n) return;
    const step = plotW / Math.max(1, (n-1));
    const pts = [];
    for(let i=0;i<n;i++){
      const vNum = Number(values[i]);
      const vv = Number.isFinite(vNum) ? vNum : minY;
      const t = (vv - minY) / (maxY-minY);
      const y = padT + plotH - clamp(t,0,1)*plotH;
      const x = padL + i*step;
      pts.push({x,y});
    }

    ctx.globalAlpha = 0.18;
    ctx.fillStyle = lineCol;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, padT+plotH);
    for(const p of pts) ctx.lineTo(p.x, p.y);
    ctx.lineTo(pts[pts.length-1].x, padT+plotH);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.strokeStyle = lineCol;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for(const p of pts.slice(1)) ctx.lineTo(p.x, p.y);
    ctx.stroke();

    ctx.fillStyle = lineCol;
    for(const p of pts){
      ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI*2); ctx.fill();
    }

    ctx.fillStyle = chartText;
    for(let i=0;i<n;i++){
      const x = padL + i*step;
      ctx.save();
      ctx.translate(x, padT+plotH+16);
      ctx.rotate(-0.35);
      const lab = labels && labels[i] ? String(labels[i]) : '';
      ctx.fillText(lab, -10, 0);
      ctx.restore();
    }
  }

  // ---------------- navigation ----------------
  function showTabById(t){
    if(t==='tab_painel') ensurePanelMarkup();
    if(t==='tab_visao_binocular') ensureBinocularVisionMarkup();

    document.querySelectorAll('.tab').forEach(p=>{
      p.classList.remove('active');
      p.style.display = 'none';
    });

    const node = el(t);
    if(node){
      node.classList.add('active');
      node.style.display = 'block';
    }

    document.querySelectorAll('[data-tab]').forEach(b=>{
      b.classList.toggle('active', b.getAttribute('data-tab')===t);
    });
  }

  function initNav(){
    document.querySelectorAll('[data-tab]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const t = btn.getAttribute('data-tab');
        showTabById(t);
      });
    });

    const initial = document.querySelector('.tab.active')?.id || 'tab_pacientes';
    showTabById(initial);
  }

  // ---------------- Perfil (salvar/limpar) ----------------
  function saveQuestionnaire(){
    const p = ensureSelectedPatient();
    if(!p) return;
    p.profile = readProfile();
    upsertPatient(p);
    renderProfileOut(p.profile);
    renderIntegratedPanel(p);
    showToast('Perfil salvo no paciente.');
  }
  function clearQuestionnaire(){
    const qm = el('q_main'); if(qm) qm.value='';
    const qh = el('q_history'); if(qh) qh.value='';
    const qc = el('q_clinical'); if(qc) qc.value='';
    renderProfileOut({});
    showToast('Perfil limpo.');
  }

  // ---------------- Painel integrado (botões) ----------------
  function initPanel(){
    ensurePanelMarkup();
    el('btn_panel_refresh')?.addEventListener('click', ()=>{
      const p = getSelectedPatient();
      if(!p){ showToast('Selecione um paciente primeiro.', false); return; }
      renderIntegratedPanel(p);
      showToast('Painel atualizado.');
    });

    el('btn_panel_copy')?.addEventListener('click', async ()=>{
      const p = getSelectedPatient();
      if(!p){ showToast('Selecione um paciente primeiro.', false); return; }
      const box = el('panel_integrado');
      const txt = box ? box.innerText : '';
      const ok = await copyToClipboard(txt);
      if(ok) showToast('Painel copiado para a área de transferência.');
      else showToast('Não consegui copiar automaticamente. Selecione e copie manualmente.', false);
    });
  }

  // ---------------- UX: Enter avança para o próximo campo (sem quebrar textarea) ----------------
  function enableEnterToNext(){
    document.addEventListener('keydown', (e)=>{
      if(e.key !== 'Enter') return;
      if(e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;
      const t = e.target;
      if(!t) return;
      const tag = (t.tagName||'').toLowerCase();
      if(tag === 'textarea') return;
      if(tag !== 'input' && tag !== 'select') return;

      const activeTab = document.querySelector('.tab.active') || document.body;
      const focusables = Array.from(activeTab.querySelectorAll('input, select, textarea, button'))
        .filter(n=> !n.disabled && n.type !== 'hidden' && n.offsetParent !== null);
      const i = focusables.indexOf(t);
      if(i === -1) return;
      e.preventDefault();
      const next = focusables[i+1] || focusables[0];
      if(next && typeof next.focus === 'function') next.focus();
    }, true);
  }

  // ---------------- Save profile (paciente) ----------------
  function saveProfile(){
    const existing = getSelectedPatient();

    const cpfRaw = el('p_cpf') ? el('p_cpf').value : '';
    const cpfDigits = normalizeCpf(cpfRaw);
    const warn = cpfWarning(cpfDigits);
    if(warn) showToast(warn, false); // não bloqueia

    if(existing){
      existing.name = (el('p_name')?.value || '').trim();
      existing.dob = el('p_dob')?.value || '';
      existing.sex = el('p_sex')?.value || '';
      existing.cpf = cpfDigits;
      existing.notes = (el('p_notes')?.value || '').trim();
      upsertPatient(existing);
      renderIntegratedPanel(existing);
      showToast('Paciente atualizado.');
      return;
    }

    const p = newPatientFromForm();
    if(!p) return;
    state.selectedId = p.id;
    upsertPatient(p);
    selectPatient(p.id);
    showToast('Paciente salvo.');
  }

  // ---------------- Self-Test ----------------
  function initSelfTest(){
    const btn = el('btn_selftest_run');
    if(!btn) return;
    btn.addEventListener('click', runSelfTest);
    setHTML('selftest_out','<div class="muted">Clique em “Executar Self-Test”.</div>');
  }

  function runSelfTest(){
    const lines = [];
    const fails = [];
    function okLine(name, extra){ lines.push(`✅ ${name}${extra?(' — '+extra):''}`); }
    function badLine(name, extra){ lines.push(`❌ ${name}${extra?(' — '+extra):''}`); fails.push(name + (extra?(' — '+extra):'')); }
    function safe(name, fn){ try{ fn(); okLine(name); } catch(e){ badLine(name, String(e && e.message ? e.message : e)); } }

    lines.push('Self-Test — ' + new Date().toLocaleString('pt-BR'));
    lines.push('------------------------------------------------------------');

    if(window.BINOCULAR_NORMS) okLine('BINOCULAR_NORMS carregado'); else badLine('BINOCULAR_NORMS carregado', 'objeto ausente');
    if(window.NSUCO_NORMS) okLine('NSUCO_NORMS carregado'); else badLine('NSUCO_NORMS carregado', 'objeto ausente');

    const requiredIds = [
      'bin_cover_distance','bin_cover_near','bin_cover_distance_lateral','bin_cover_near_lateral','bin_aca_ratio','bin_pd_mm','bin_work_cm','bin_aca_calc',
      'bin_bo_d_blur','bin_bo_d_break','bin_bo_d_recovery',
      'bin_bi_d_break','bin_bi_d_recovery',
      'bin_bo_n_blur','bin_bo_n_break','bin_bo_n_recovery',
      'bin_bi_n_blur','bin_bi_n_break','bin_bi_n_recovery',
      'bin_step_child_bo_n_break','bin_step_child_bo_n_recovery','bin_step_child_bi_n_break','bin_step_child_bi_n_recovery',
      'bin_step_adult_bo_d_break','bin_step_adult_bo_d_recovery','bin_step_adult_bi_d_break','bin_step_adult_bi_d_recovery',
      'bin_step_adult_bo_n_break','bin_step_adult_bo_n_recovery','bin_step_adult_bi_n_break','bin_step_adult_bi_n_recovery',
      'bin_vf_near_cpm','bin_vf_distance_cpm',
      'bin_npc_break','bin_npc_recovery','bin_npc_rg_break','bin_npc_rg_recovery',
      'bin_aa','bin_aa_minus','bin_maf','bin_af',
      'bin_mem','bin_fcc','bin_nra','bin_pra',
      'btn_binocular_salvar','bin_out'
    ];
    const missing = requiredIds.filter(id=>!el(id));
    if(missing.length===0) okLine('IDs essenciais (Vergência/Acomodação) existem');
    else badLine('IDs essenciais (Vergência/Acomodação) existem', 'faltando: '+missing.join(', '));

    const requiredBnv = ['bnv_w4d_distance','bnv_w4d_near','bnv_titmus_fly','bnv_titmus_circles','bnv_dot2','bnv_fix_seconds','btn_bnv_salvar','bnv_out'];
    const missBnv = requiredBnv.filter(id=>!el(id));
    if(missBnv.length===0) okLine('IDs essenciais (Visão binocular) existem');
    else badLine('IDs essenciais (Visão binocular) existem', 'faltando: '+missBnv.join(', '));

    const selects = Array.from(document.querySelectorAll('#tab_binocular select[id^="bin_"]'));
    if(selects.length===0){
      badLine('Selects da aba binocular encontrados', 'nenhum select detectado');
    }else{
      okLine('Selects da aba binocular encontrados', String(selects.length));
      const empty = selects.filter(s=> (s.options?.length||0) < 2).map(s=>s.id);
      if(empty.length===0) okLine('Selects da aba binocular populados (options >= 2)');
      else badLine('Selects da aba binocular populados (options >= 2)', 'vazios: '+empty.join(', '));
    }

    const bnvSelects = Array.from(document.querySelectorAll('#tab_visao_binocular select'));
    if(bnvSelects.length===0){
      badLine('Selects da aba Visão binocular encontrados', 'nenhum select detectado');
    }else{
      okLine('Selects da aba Visão binocular encontrados', String(bnvSelects.length));
      const bnvEmpty = bnvSelects.filter(s=> (s.options?.length||0) < 2).map(s=>s.id);
      if(bnvEmpty.length===0) okLine('Selects da aba Visão binocular populados (options >= 2)');
      else badLine('Selects da aba Visão binocular populados (options >= 2)', 'vazios: '+bnvEmpty.join(', '));
    }

    function hasOption(id, valueStr){
      const s = el(id);
      if(!s) return false;
      return Array.from(s.options).some(o=>o.value===valueStr);
    }
    if(hasOption('bin_aa','0.25')) okLine('AA (D) inclui passo 0,25'); else badLine('AA (D) inclui passo 0,25', 'opção 0.25 ausente');
    if(hasOption('bin_npc_break','2.5')) okLine('PPC (cm) inclui passo 0,5'); else badLine('PPC (cm) inclui passo 0,5', 'opção 2.5 ausente');
    if(hasOption('bin_cover_distance','-1') && hasOption('bin_cover_distance','1')) okLine('Foria (eso-/exo+) inclui sinais');
    else badLine('Foria (eso-/exo+) inclui sinais', 'faltando -1 e/ou 1');

    safe('Salvar/carregar binocular em paciente temporário', ()=>{
      const prevSelected = state.selectedId;
      const prevPatientsJson = JSON.stringify(state.patients);

      const temp = {
        id: 'selftest_' + Date.now(),
        name: 'SELFTEST',
        dob: '2015-01-15',
        sex: 'O',
        cpf: '',
        createdAt: new Date().toISOString(),
        notes: '',
        profile: {},
        questionnaire: {},
        tests: {}
      };
      state.patients.unshift(temp);
      state.selectedId = temp.id;
      saveState();
      selectPatient(temp.id);

      const setv = (id, v)=>{ const s=el(id); if(s) s.value=String(v); };
      setv('bin_cover_distance', 3);
      setv('bin_bo_d_blur', 9);
      setv('bin_bo_d_break', 19);
      setv('bin_bo_d_recovery', 10);
      setv('bin_npc_break', 2.5);
      setv('bin_npc_recovery', 4.5);
      setv('bin_aa', 10.0);
      setv('bin_maf', 6.5);

      saveBinocular();

      const p2 = getSelectedPatient();
      const d = p2?.tests?.binocular?.data;
      if(!d) throw new Error('binocular não foi salvo');
      const must = {cover_distance:3, bo_d_blur:9, npc_break:2.5, aa:10, maf:6.5};
      for(const [k,v] of Object.entries(must)){
        if(d[k] === undefined) throw new Error('campo ausente: '+k);
        if(Number(d[k]) !== Number(v)) throw new Error('valor divergente em '+k+': '+d[k]+' != '+v);
      }

      resetBinocularForm();
      loadBinocularFromPatient(p2);
      const checkBack = (id, v)=>{
        const s = el(id);
        if(!s) throw new Error('select não encontrado: '+id);
        if(String(s.value) !== String(v)) throw new Error('recarregar falhou em '+id+': '+s.value+' != '+v);
      };
      checkBack('bin_cover_distance', 3);
      checkBack('bin_bo_d_blur', 9);
      checkBack('bin_npc_break', 2.5);
      checkBack('bin_aa', 10);

      try{ state.patients = JSON.parse(prevPatientsJson); }catch(_){ state.patients = []; }
      state.selectedId = prevSelected;
      saveState();
      renderPatients();
      if(prevSelected) selectPatient(prevSelected);
      else setText('selected_patient','nenhum');
    });

    safe('Salvar/carregar visão binocular em paciente temporário', ()=>{
      const prevSelected = state.selectedId;
      const prevPatientsJson = JSON.stringify(state.patients);

      const temp = {
        id: 'selftest_bnv_' + Date.now(),
        name: 'SELFTEST_BNV',
        dob: '2015-01-15',
        sex: 'O',
        cpf: '',
        createdAt: new Date().toISOString(),
        notes: '',
        profile: {},
        questionnaire: {},
        tests: {}
      };
      state.patients.unshift(temp);
      state.selectedId = temp.id;
      saveState();
      selectPatient(temp.id);

      const setSel = (id, v)=>{ const s=el(id); if(s) s.value=String(v); };
      const setTxt = (id, v)=>{ const t=el(id); if(t) t.value=String(v); };

      setSel('bnv_w4d_distance', 'fusion_4');
      setSel('bnv_w4d_near', 'supp_od');
      setTxt('bnv_w4d_notes', 'teste');
      setSel('bnv_titmus_fly', 'present');
      setSel('bnv_titmus_circles', 100);
      setTxt('bnv_dot2', 200);
      setTxt('bnv_stereo_notes', 'ok');

      saveBinocularVision();

      const p2 = getSelectedPatient();
      const d = p2?.tests?.binocular_vision?.data;
      if(!d) throw new Error('binocular_vision não foi salvo');
      if(String(d.w4d_distance) !== 'fusion_4') throw new Error('w4d_distance divergente');
      if(Number(d.dot2_arcsec) !== 200) throw new Error('dot2 divergente');

      resetBinocularVisionForm();
      loadBinocularVisionFromPatient(p2);
      if(el('bnv_w4d_distance').value !== 'fusion_4') throw new Error('recarregar falhou (w4d_distance)');
      if(el('bnv_dot2').value !== '200') throw new Error('recarregar falhou (dot2)');

      try{ state.patients = JSON.parse(prevPatientsJson); }catch(_){ state.patients = []; }
      state.selectedId = prevSelected;
      saveState();
      renderPatients();
      if(prevSelected) selectPatient(prevSelected);
      else setText('selected_patient','nenhum');
    });

    lines.push('------------------------------------------------------------');
    if(fails.length===0){
      lines.push('RESULTADO: PASS ✅');
      showToast('Self-Test: PASS ✅', true);
    }else{
      lines.push('RESULTADO: FAIL ❌');
      lines.push('Falhas:');
      fails.forEach(f=> lines.push(' - ' + f));
      showToast('Self-Test: FAIL ❌ (ver detalhes)', false);
    }

    setHTML('selftest_out', '<pre>'+escapeHtml(lines.join('\n'))+'</pre>');
  }

  // ---------------- Cloudflare Sync (KV via Pages Functions) ----------------
  // Regras:
  // - Usa /api/user-data
  // - Header X-Sync-Key
  // - Payload { patients, updatedAt, schemaVersion }
  // - Integra com STORAGE_KEY e com state.patients
  const SYNC_API_URL = '/api/user-data';
  const SYNC_KEY_STORAGE = 'optometry_app_sync_key_v1';

  function getSyncKey(){
    const inp = el('sync_key');
    const v = (inp && inp.value ? String(inp.value).trim() : '') || (storageGet(SYNC_KEY_STORAGE) || '');
    return String(v || '').trim();
  }
  function setSyncKey(v){
    const key = String(v || '').trim();
    const inp = el('sync_key');
    if(inp) inp.value = key;
    if(key) storageSet(SYNC_KEY_STORAGE, key);
  }
  function setSyncStatus(txt, ok){
    const box = el('sync_status');
    if(!box) return;
    box.textContent = txt;
    box.style.background = ok ? 'rgba(16,185,129,.12)' : 'rgba(239,68,68,.10)';
    box.style.borderColor = ok ? 'rgba(16,185,129,.35)' : 'rgba(239,68,68,.25)';
    box.style.color = ok ? '#065f46' : '#7f1d1d';
  }

 async function syncPull(){
  const key = getSyncKey();
  if(!key){
    setSyncStatus('Informe a chave', false);
    try{ showToast('Informe a chave de sincronização.', false); }catch(_){}
    return;
  }

  setSyncStatus('Baixando...', true);

  try{
    const res = await fetch(SYNC_API_URL, { headers: { 'X-Sync-Key': key }});

    if(res.status === 404){
      setSyncStatus('Sem dados na nuvem', false);
      try{ showToast('Nenhum dado encontrado na nuvem para essa chave.', false); }catch(_){}
      return;
    }

    if(!res.ok){
      const t = await res.text().catch(()=> '');
      throw new Error('HTTP '+res.status+(t ? ' — '+t : ''));
    }

    const data = await res.json();

    if(!data || !Array.isArray(data.patients)){
      throw new Error('Resposta inválida (esperado {patients:[...]})');
    }

    // aplica dados
    state.patients = data.patients;
    state.selectedId = null;
    saveState();

    // render/reset com fallback (não quebra se alguma função não existir)
    if (typeof renderPatients === 'function') {
      renderPatients();
    } else if (typeof renderPatientList === 'function') {
      renderPatientList();
    }

    if (typeof resetForms === 'function') resetForms();

    setSyncStatus('Baixado ✓', true);
    try{ showToast('Dados baixados da nuvem.', true); }catch(_){}

  }catch(e){
    console.error('syncPull failed', e);

    const msg = (e && e.message) ? e.message : String(e);
    setSyncStatus('Falhou', false);
    try{ showToast('Falha ao baixar: ' + msg, false); }catch(_){}
  }
}
  }

  async function syncPush(){
    const key = getSyncKey();
    if(!key){ setSyncStatus('Informe a chave', false); return; }
    setSyncStatus('Enviando...', true);
    try{
      const payload = { patients: state.patients, updatedAt: Date.now(), schemaVersion: 1 };
      const res = await fetch(SYNC_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Sync-Key': key },
        body: JSON.stringify(payload)
      });
      if(!res.ok){
        const t = await res.text().catch(()=> '');
        throw new Error('HTTP '+res.status+' '+t);
      }
      setSyncStatus('Enviado ✓', true);
      try{ showToast('Dados enviados para a nuvem.', true); }catch(_){}
    }catch(e){
      console.error('syncPush failed', e);
      setSyncStatus('Falhou', false);
      try{ showToast('Falha ao enviar: '+(e.message||e), false); }catch(_){}
    }
  }

  function wireSyncUI(){
    const keyEl = el('sync_key');
    const btnPull = el('btn_sync_pull');
    const btnPush = el('btn_sync_push');

    const saved = storageGet(SYNC_KEY_STORAGE);
    if(saved) setSyncKey(saved);

    if(keyEl){
      keyEl.addEventListener('change', ()=> setSyncKey(keyEl.value));
      keyEl.addEventListener('blur', ()=> setSyncKey(keyEl.value));
    }
    if(btnPull) btnPull.addEventListener('click', (e)=>{ e.preventDefault(); syncPull(); });
    if(btnPush) btnPush.addEventListener('click', (e)=>{ e.preventDefault(); syncPush(); });

    setSyncStatus(getSyncKey() ? 'Pronto' : 'Informe a chave', !!getSyncKey());
  }

  // ---------------- init ----------------
  function init(){
    repairTabNesting();

    // critical: verify norms loaded
    const ok = !!(window.TVPS4_NORMS && window.DTVP3_NORMS && window.DEM_NORMS);
    if(!ok){
      const f = el('fatal');
      if(f){
        f.style.display='block';
        f.textContent='ERRO: normas não carregaram. Coloque todos os arquivos .js na mesma pasta do index.html.';
      }else{
        alert('ERRO: normas não carregaram. Coloque todos os arquivos .js na mesma pasta do index.html.');
      }
      return;
    }

    loadState();
    safeCall('Navegação', initNav);
    safeCall('Painel', initPanel);
    safeCall('TVPS-4', initTVPSForm);
    safeCall('DTVP-3', initDTVPForm);
    safeCall('DEM', initDEMForm);
    safeCall('NSUCO', initNSUCOForm);
    safeCall('Vergência/Acomodação', initBinocularForm);
    safeCall('Visão binocular', initBinocularVisionForm);
    safeCall('Self-Test', initSelfTest);
    safeCall('Enter para avançar', enableEnterToNext);
    safeCall('Sync UI', wireSyncUI);

    el('btn_new')?.addEventListener('click', resetForms);
    el('btn_save')?.addEventListener('click', saveProfile);
    el('p_dob')?.addEventListener('change', updateAgeBadges);

    const cpfEl = el('p_cpf');
    if(cpfEl){
      cpfEl.addEventListener('blur', ()=>{ const w = cpfWarning(cpfEl.value); if(w) showToast(w, false); });
    }

    el('btn_questionnaire_save')?.addEventListener('click', saveQuestionnaire);
    el('btn_questionnaire_clear')?.addEventListener('click', clearQuestionnaire);

    renderPatients();
    resetTVPSForm(); resetDTVPForm(); resetDEMForm(); resetNSUCOForm(); resetBinocularForm(); resetBinocularVisionForm();
    updateAgeBadges();
  }

  // Backward-compat: alguns selects usam onchange inline no HTML.
  window.validateBinocularField = function(_id){
    try{ updateAcaCalculated(); updateAcaGradient(); }catch(e){ console.error('validateBinocularField:', e); }
  };
  window.updateAllACA = function(){
    try{ updateAcaCalculated(); updateAcaGradient(); }catch(e){ console.error('updateAllACA:', e); }
  };

  document.addEventListener('DOMContentLoaded', init);

})();
