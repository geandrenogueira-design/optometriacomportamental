// Camada de usabilidade do app (Instituto Olhar):
// barra do paciente, progresso por etapas, salvamento automático, busca de paciente,
// botões −/+ nas listas numéricas, avanço automático, "não testado / não colaborou",
// aba Entrada (acuidade e refração), relatório para impressão, painel mais limpo
// e menu lateral recolhível no celular.
// Não altera cálculos nem normas: só chama as mesmas funções de calcular/salvar do app.
(function(){
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let B = null;

  // ------------------------------------------------------------ etapas
  const STEPS = [
    { tab:'tab_anamnese',        label:'Anamnese',          done:(p)=> !!(p.anamnese && p.anamnese.answers) },
    { tab:'tab_perfil',          label:'Queixa',            done:(p)=> !!(p.profile && (p.profile.main || p.profile.history)) },
    { tab:'tab_entrada',         label:'Entrada',           done:(p)=> !!(p.tests && p.tests.entrada) },
    { tab:'tab_binocular',       label:'Vergência',         done:(p)=> !!(p.tests && p.tests.binocular) },
    { tab:'tab_visao_binocular', label:'Visão binocular',   done:(p)=> !!(p.tests && (p.tests.binocular_vision || p.tests.binocularVision)) },
    { tab:'tab_nsuco',           label:'NSUCO',             done:(p)=> !!(p.tests && p.tests.nsuco) },
    { tab:'tab_dem',             label:'DEM',               done:(p)=> !!(p.tests && p.tests.dem) },
    { tab:'tab_tvps',            label:'TVPS-4',            done:(p)=> !!(p.tests && p.tests.tvps4) },
    { tab:'tab_dtvp',            label:'DTVP-3',            done:(p)=> !!(p.tests && p.tests.dtvp3) },
  ];
  // Uma etapa marcada inteira como "não testado/não colaborou" também conta como resolvida.
  function stepState(p, st){
    if (!p) return '';
    if (st.done(p)) return 'done';
    const s = p.ux_status || {};
    const keys = Object.keys(s).filter((k)=> k.startsWith(st.tab + '::'));
    return keys.length ? 'skip' : '';
  }

  // ------------------------------------------------------------ barra do paciente
  let lastSaved = null, saveNote = '';
  function ageStr(dob){
    const a = dob && B.calcAge(dob);
    return a ? `${a.yearsRounded}a ${a.monthsRounded}m` : '—';
  }
  function renderBar(){
    const bar = $('pt_bar'); if (!bar) return;
    const p = B.getSelectedPatient();
    const menuBtn = '<button type="button" class="pt-menu" id="pt_menu" aria-label="Abrir menu" aria-expanded="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button>';
    if (!p){
      bar.innerHTML = `${menuBtn}<div class="pt-main"><div class="pt-name muted">Nenhum paciente selecionado</div><div class="pt-sub">Escolha ou cadastre um paciente em <b>Pacientes</b>.</div></div>`;
    } else {
      const done = STEPS.filter((s)=> stepState(p, s)).length;
      const sex = p.sex === 'F' ? 'F' : p.sex === 'M' ? 'M' : (p.sex || '');
      const dots = STEPS.map((s)=>{ const st = stepState(p, s); return `<span class="pt-dot ${st}" title="${esc(s.label)}${st==='done'?' — feito':st==='skip'?' — não testado':''}"></span>`; }).join('');
      bar.innerHTML = `${menuBtn}<div class="pt-main"><div class="pt-name">${esc(p.name)}</div>
        <div class="pt-sub">${ageStr(p.dob)}${sex ? ' · ' + esc(sex) : ''} · <span class="pt-dots" aria-label="${done} de ${STEPS.length} etapas">${dots}</span> ${done}/${STEPS.length} etapas</div></div>
        <div class="pt-save" id="pt_save" aria-live="polite">${esc(saveNote)}</div>`;
    }
    $('pt_menu').addEventListener('click', toggleNav);
    markNav();
  }
  function markNav(){
    const p = B.getSelectedPatient();
    STEPS.forEach((s)=>{
      const b = document.querySelector(`.nav button[data-tab="${s.tab}"]`);
      if (b) b.dataset.state = p ? stepState(p, s) : '';
    });
  }
  function setSaveNote(t){ saveNote = t; const e = $('pt_save'); if (e) e.textContent = t; }

  // ------------------------------------------------------------ salvamento automático
  const QUIET = (fn)=>{ window.__uxQuiet = true; try { fn(); } finally { window.__uxQuiet = false; } };
  const click = (id)=>{ const b = $(id); if (b) b.click(); };
  const filled = (ids)=> ids.every((id)=> { const e = $(id); return e && String(e.value).trim() !== ''; });
  const AUTOSAVE = {
    tab_binocular:       ()=>{ click('btn_binocular_salvar'); return true; },
    tab_visao_binocular: ()=>{ click('btn_bnv_salvar'); return true; },
    tab_perfil:          ()=>{ click('btn_questionnaire_save'); return true; },
    tab_nsuco:           ()=>{ const ids = ['pursuits_ability','pursuits_accuracy','pursuits_head','pursuits_body','saccades_ability','saccades_accuracy','saccades_head','saccades_body'].map((f)=>'nsuco_'+f);
                               if (!filled(ids)) return 'Preencha os 8 campos para salvar o NSUCO.'; click('btn_nsuco_salvar'); return true; },
    tab_dem:             ()=>{ if (!filled(['dem_v','dem_h','dem_err'])) return 'Preencha os 3 campos para calcular e salvar o DEM.'; click('btn_dem_calcular'); click('btn_dem_salvar'); return true; },
    tab_tvps:            ()=>{ const ids = Array.from(document.querySelectorAll('#tab_tvps [id^="tvps_raw_"]')).map((e)=>e.id);
                               if (!filled(ids)) return 'Preencha os 7 subtestes para calcular e salvar o TVPS-4.'; click('btn_tvps_calcular'); click('btn_tvps_salvar'); return true; },
    tab_dtvp:            ()=>{ const ids = Array.from(document.querySelectorAll('#tab_dtvp [id^="dtvp_raw_"]')).map((e)=>e.id);
                               if (!filled(ids)) return 'Preencha os 5 subtestes para calcular e salvar o DTVP-3.'; click('btn_dtvp_calcular'); click('btn_dtvp_salvar'); return true; },
    tab_entrada:         ()=>{ saveEntrada(); return true; },
    tab_relatorio:       ()=>{ saveReportFields(); return true; },
  };
  let timer = null;
  function activeTab(){ const t = document.querySelector('main .tab.active'); return t ? t.id : null; }
  function scheduleAutosave(tabId, delay){
    if (!AUTOSAVE[tabId]) return;
    clearTimeout(timer);
    timer = setTimeout(()=>{
      const p = B.getSelectedPatient();
      if (!p){ setSaveNote('Selecione um paciente para salvar'); return; }
      let r = true;
      QUIET(()=>{ r = AUTOSAVE[tabId](); });
      if (r === true){ lastSaved = new Date(); setSaveNote('Salvo às ' + lastSaved.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' })); }
      else setSaveNote(r);
      renderBarSoon();
    }, delay);
  }
  let barTimer = null;
  function renderBarSoon(){ clearTimeout(barTimer); barTimer = setTimeout(renderBar, 60); }

  // ------------------------------------------------------------ Entrada (acuidade e refração)
  const EN_FIELDS = () => Array.from(document.querySelectorAll('#tab_entrada [id^="en_"]'));
  function saveEntrada(){
    const p = B.getSelectedPatient(); if (!p) return;
    const data = {};
    EN_FIELDS().forEach((e)=>{ const v = String(e.value || '').trim(); if (v !== '') data[e.id.slice(3)] = v; });
    p.tests = p.tests || {};
    if (Object.keys(data).length) p.tests.entrada = { data, savedAt: new Date().toISOString() };
    else delete p.tests.entrada;
    B.upsertPatient(p);
  }
  function loadEntrada(p){
    const d = (p && p.tests && p.tests.entrada && p.tests.entrada.data) || {};
    EN_FIELDS().forEach((e)=>{ e.value = d[e.id.slice(3)] != null ? d[e.id.slice(3)] : ''; });
  }

  // ------------------------------------------------------------ botões −/+ nas listas numéricas
  const STEP_TABS = ['tab_binocular','tab_visao_binocular','tab_nsuco','tab_dem','tab_tvps','tab_dtvp','tab_entrada'];
  function numericOptions(sel){
    const opts = Array.from(sel.options).filter((o)=> o.value !== '');
    if (opts.length < 3) return null;
    const nums = opts.map((o)=> ({ o, n: Number(o.value) }));
    if (nums.some((x)=> !Number.isFinite(x.n))) return null;
    return nums.sort((a, b)=> a.n - b.n);
  }
  function stepSelect(sel, dir){
    const nums = numericOptions(sel); if (!nums) return;
    let target;
    if (sel.value === ''){
      target = nums.find((x)=> x.n === 0) || (dir > 0 ? nums[0] : nums[nums.length - 1]);
    } else {
      const cur = Number(sel.value);
      target = dir > 0 ? nums.find((x)=> x.n > cur) : [...nums].reverse().find((x)=> x.n < cur);
    }
    if (!target) return;
    sel.value = target.o.value;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function enhanceSteppers(root){
    STEP_TABS.forEach((t)=>{
      const tab = $(t); if (!tab) return;
      tab.querySelectorAll('select').forEach((sel)=>{
        if (sel.dataset.stepper || !numericOptions(sel)) return;
        sel.dataset.stepper = '1';
        const wrap = document.createElement('div'); wrap.className = 'stepper';
        sel.parentNode.insertBefore(wrap, sel);
        const lab = (sel.parentNode.querySelector('label') || {}).textContent || 'valor';
        const mk = (txt, dir, aria)=>{ const b = document.createElement('button'); b.type = 'button'; b.className = 'st-btn'; b.textContent = txt; b.setAttribute('aria-label', aria + ': ' + lab.trim()); b.tabIndex = -1;
          b.addEventListener('click', ()=> stepSelect(sel, dir)); return b; };
        wrap.appendChild(mk('−', -1, 'Diminuir'));
        wrap.appendChild(sel);
        wrap.appendChild(mk('+', +1, 'Aumentar'));
      });
    });
  }

  // ------------------------------------------------------------ avanço automático
  function focusNext(from){
    const tab = from.closest('.tab'); if (!tab) return;
    const fields = Array.from(tab.querySelectorAll('select, input:not([type=hidden]):not([readonly]), textarea'))
      .filter((e)=> !e.disabled && e.offsetParent !== null && !e.closest('.no-auto') && !e.closest('.card.ux-skipped'));
    const i = fields.indexOf(from);
    if (i >= 0 && fields[i + 1] && fields[i + 1].tagName === 'SELECT') fields[i + 1].focus();
  }

  // ------------------------------------------------------------ não testado / não colaborou
  const CLINICAL = ['tab_entrada','tab_binocular','tab_visao_binocular','tab_nsuco','tab_dem','tab_tvps','tab_dtvp'];
  const cardKey = (tab, card)=>{ const h = card.querySelector('h2'); return tab + '::' + (h ? h.textContent.replace(/[^\p{L}\p{N} /&—-]/gu, '').replace(/\s+/g, ' ').trim() : ''); };
  function enhanceCards(){
    CLINICAL.forEach((t)=>{
      const tab = $(t); if (!tab) return;
      tab.querySelectorAll('.card').forEach((card)=>{
        if (card.dataset.uxStatus || !card.querySelector('select, input, textarea') || !card.querySelector('h2')) return;
        card.dataset.uxStatus = '1';
        const key = cardKey(t, card);
        const box = document.createElement('div'); box.className = 'ux-status';
        box.innerHTML = `<button type="button" data-st="nao_testado" aria-pressed="false">Não testado</button><button type="button" data-st="nao_colaborou" aria-pressed="false">Não colaborou</button>`;
        card.querySelector('h2').insertAdjacentElement('afterend', box);
        box.addEventListener('click', (e)=>{
          const b = e.target.closest('button[data-st]'); if (!b) return;
          const p = B.getSelectedPatient(); if (!p){ B.showToast('Selecione um paciente primeiro.', false); return; }
          p.ux_status = p.ux_status || {};
          if (p.ux_status[key] === b.dataset.st) delete p.ux_status[key]; else p.ux_status[key] = b.dataset.st;
          B.upsertPatient(p); applyCardStatus(); renderBar();
        });
      });
    });
  }
  function applyCardStatus(){
    const p = B.getSelectedPatient(); const s = (p && p.ux_status) || {};
    CLINICAL.forEach((t)=>{ const tab = $(t); if (!tab) return;
      tab.querySelectorAll('.card[data-ux-status]').forEach((card)=>{
        const v = s[cardKey(t, card)] || '';
        card.classList.toggle('ux-skipped', !!v);
        card.querySelectorAll('.ux-status button').forEach((b)=> b.setAttribute('aria-pressed', String(b.dataset.st === v)));
      });
    });
  }

  // ------------------------------------------------------------ busca de paciente
  function applySearch(){
    const q = ($('pt_search') && $('pt_search').value || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
    let shown = 0;
    document.querySelectorAll('#patient_list .patient-item').forEach((b)=>{
      const t = b.textContent.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      const ok = !q || t.includes(q); b.style.display = ok ? '' : 'none'; if (ok) shown++;
    });
    const empty = $('pt_search_empty'); if (empty) empty.style.display = q && !shown ? '' : 'none';
  }

  // ------------------------------------------------------------ painel mais limpo + queixa × achado
  function cleanPanel(){
    document.querySelectorAll('#tab_painel .dash-card').forEach((c)=>{
      const v = c.querySelector('.dash-card-v'); c.classList.toggle('ux-empty', !!v && v.textContent.trim().replace(/[—\/\sΔ]/g, '') === '');
    });
    let box = $('ux_qxa');
    const tab = $('tab_painel'); if (!tab) return;
    if (!box){ box = document.createElement('div'); box.id = 'ux_qxa'; box.className = 'dash-panel'; box.style.marginTop = '12px'; (tab.querySelector('.dash-shell') || tab).appendChild(box); }
    box.innerHTML = qxaHTML(B.getSelectedPatient());
  }
  const TEST_FOR_DOMAIN = { leitura:['dem'], oculomotor:['nsuco','dem'], binocular:['binocular','binocular_vision'], refracao:['entrada'], percepcao:['tvps4','dtvp3'], visuomotor:['dtvp3'], motor:[], conforto:[] };
  const TEST_NAME = { dem:'DEM', nsuco:'NSUCO', binocular:'Vergência/Acomodação', binocular_vision:'Visão binocular', entrada:'Acuidade/refração', tvps4:'TVPS-4', dtvp3:'DTVP-3' };
  function qxaHTML(p){
    const head = '<div class="dash-panel-head"><div class="dash-panel-title">Queixa × achados</div><div class="dash-panel-sub">Relato dos pais por domínio ao lado dos testes que o investigam</div></div>';
    if (!p) return head + '<div class="muted">Selecione um paciente.</div>';
    if (!(p.anamnese && p.anamnese.answers) || !window.ANAMNESE_SCORE) return head + '<div class="muted">Sem anamnese dos pais importada para este paciente.</div>';
    const sc = window.ANAMNESE_SCORE(p.anamnese.answers);
    const rows = sc.domains.map((d)=>{
      const tests = (TEST_FOR_DOMAIN[d.id] || []).map((k)=>{
        const has = !!(p.tests && p.tests[k]);
        return `<span class="qxa-test ${has ? 'has' : ''}">${TEST_NAME[k]}${has ? ' ✓' : ' · pendente'}</span>`;
      }).join(' ') || '<span class="muted">encaminhamento / contexto</span>';
      return `<tr><td>${esc(d.label)}</td><td class="mono" style="text-align:right">${d.answered ? d.pct + '%' : '—'}</td><td class="mono" style="text-align:center">${d.high}</td><td>${tests}</td></tr>`;
    }).join('');
    return head + `<div style="overflow-x:auto"><table class="qxa"><thead><tr><th>Domínio (relato)</th><th style="text-align:right">Pontos</th><th>Itens freq./sempre</th><th>Testes do app</th></tr></thead><tbody>${rows}</tbody></table></div>
      <div class="muted" style="font-size:12px;margin-top:6px">A concordância entre queixa e achado é julgamento clínico: o app só coloca lado a lado. Questionário sem ponto de corte.</div>`;
  }

  // ------------------------------------------------------------ relatório
  const RP_FIELDS = ['rp_impressao','rp_conduta','rp_encaminhamentos','rp_destino','rp_data'];
  const SIGN_KEY = 'olhar_assinatura';
  const DEFAULT_SIGN = 'Geandré Nogueira — Optometrista comportamental — CROO 1726';
  function saveReportFields(){
    const p = B.getSelectedPatient(); if (!p) return;
    p.report = p.report || {};
    RP_FIELDS.forEach((id)=>{ const e = $(id); if (e) p.report[id.slice(3)] = e.value; });
    try { localStorage.setItem(SIGN_KEY, $('rp_assinatura').value); } catch(_){}
    B.upsertPatient(p);
    renderReport();
  }
  function loadReportFields(p){
    const r = (p && p.report) || {};
    RP_FIELDS.forEach((id)=>{ const e = $(id); if (!e) return; const v = r[id.slice(3)];
      e.value = v != null ? v : (id === 'rp_data' ? new Date().toISOString().slice(0, 10) : (e.tagName === 'SELECT' ? e.options[0].value : '')); });
    let sign = ''; try { sign = localStorage.getItem(SIGN_KEY) || ''; } catch(_){}
    $('rp_assinatura').value = sign || DEFAULT_SIGN;
  }
  // Reaproveita os resumos que o próprio app já calcula em cada aba (mesmos valores e normas).
  const OUTS = [
    ['tab_binocular','Vergência e acomodação','bin_out','binocular'],
    ['tab_visao_binocular','Visão binocular','bnv_out','binocular_vision'],
    ['tab_nsuco','Oculomotricidade (NSUCO)','nsuco_out','nsuco'],
    ['tab_dem','Sacádicos de leitura (DEM)','dem_out','dem'],
    ['tab_tvps','Percepção visual (TVPS-4)','tvps_out','tvps4'],
    ['tab_dtvp','Visuomotor e percepção (DTVP-3)','dtvp_out','dtvp3'],
  ];
  function cloneOut(id){
    const src = $(id); if (!src || !src.textContent.trim()) return '';
    const c = src.cloneNode(true);
    c.querySelectorAll('button, canvas, script, input, select, textarea').forEach((n)=> n.remove());
    c.querySelectorAll('[id]').forEach((n)=> n.removeAttribute('id'));
    return c.innerHTML;
  }
  const nl = (s)=> esc(s).replace(/\n/g, '<br>');
  function statusList(p, tab){
    const s = (p.ux_status) || {};
    return Object.keys(s).filter((k)=> k.startsWith(tab + '::')).map((k)=> `<div class="rp-skip">${esc(k.split('::')[1])}: ${s[k] === 'nao_colaborou' ? 'não colaborou' : 'não testado'}</div>`).join('');
  }
  function renderReport(){
    const doc = $('rp_doc'); if (!doc) return;
    const p = B.getSelectedPatient();
    if (!p){ doc.innerHTML = '<div class="muted">Selecione um paciente.</div>'; return; }
    const r = p.report || {};
    const dt = r.data ? new Date(r.data + 'T12:00:00').toLocaleDateString('pt-BR') : new Date().toLocaleDateString('pt-BR');
    const nasc = p.dob ? new Date(p.dob + 'T12:00:00').toLocaleDateString('pt-BR') : '—';
    const sexo = p.sex === 'F' ? 'Feminino' : p.sex === 'M' ? 'Masculino' : (p.sex || '—');
    let html = `<header class="rp-head"><div class="io-brand"><div class="io-mark" aria-hidden="true"></div><div><b>INSTITUTO OLHAR</b><span>Cuidado humano para a sua visão</span></div></div>
      <div class="rp-title">Relatório de avaliação visual<br><span>${esc(r.destino || 'Pais / responsáveis')} · ${dt}</span></div></header>
      <section><h3>Identificação</h3><div class="rp-kv"><div><span>Paciente</span>${esc(p.name)}</div><div><span>Nascimento</span>${nasc}</div><div><span>Idade</span>${ageStr(p.dob)}</div><div><span>Sexo</span>${esc(sexo)}</div></div></section>`;
    const prof = p.profile || {};
    if (prof.main || prof.history) html += `<section><h3>Queixa e história</h3>${prof.main ? `<p><b>Queixa:</b> ${nl(prof.main)}</p>` : ''}${prof.history ? `<p><b>História:</b> ${nl(prof.history)}</p>` : ''}</section>`;
    if (p.anamnese && p.anamnese.answers && window.ANAMNESE_SCORE){
      const sc = window.ANAMNESE_SCORE(p.anamnese.answers);
      const rows = sc.domains.filter((d)=> d.answered).map((d)=> `<tr><td>${esc(d.label)}</td><td style="text-align:right">${d.pct}%</td><td style="text-align:center">${d.high}</td></tr>`).join('');
      html += `<section><h3>Questionário dos pais (sinais e sintomas)</h3>${sc.flags.length ? `<p><b>Pontos de atenção:</b> ${sc.flags.map(esc).join('; ')}.</p>` : ''}
        ${rows ? `<table class="rp-t"><thead><tr><th>Domínio</th><th style="text-align:right">Pontuação</th><th>Itens frequentes/sempre</th></tr></thead><tbody>${rows}</tbody></table><p class="rp-note">Pontuação descritiva (0 = nunca a 4 = sempre), sem ponto de corte.</p>` : ''}</section>`;
    }
    const en = p.tests && p.tests.entrada && p.tests.entrada.data;
    if (en || statusList(p, 'tab_entrada')){
      const d = en || {};
      const v = (k)=> esc(d[k] || '—');
      const dio = (v)=>{ const n = Number(v); return Number.isFinite(n) ? (n > 0 ? '+' : '') + n.toFixed(2) : esc(v); };
      const rx = (o)=> (d[o + '_esf'] || d[o + '_cil'] || d[o + '_eixo']) ? `${d[o + '_esf'] ? dio(d[o + '_esf']) : 'Plano'} ${d[o + '_cil'] && Number(d[o + '_cil']) !== 0 ? dio(d[o + '_cil']) + ' × ' + esc(d[o + '_eixo'] || '—') + '°' : ''}` : '—';
      html += `<section><h3>Acuidade visual e refração</h3>${statusList(p, 'tab_entrada')}
        ${en ? `<table class="rp-t"><thead><tr><th></th><th>OD</th><th>OE</th><th>AO</th></tr></thead><tbody>
          <tr><td>Acuidade longe</td><td>${v('av_longe_od')}</td><td>${v('av_longe_oe')}</td><td>${v('av_longe_ao')}</td></tr>
          <tr><td>Acuidade perto</td><td>${v('av_perto_od')}</td><td>${v('av_perto_oe')}</td><td>${v('av_perto_ao')}</td></tr>
          <tr><td>Refração</td><td>${rx('od')}</td><td>${rx('oe')}</td><td></td></tr></tbody></table>
          <p class="rp-note">${[d.av_teste && 'Teste: ' + esc(d.av_teste), d.av_correcao && esc(d.av_correcao), d.rx_metodo && 'Refração: ' + esc(d.rx_metodo), d.rx_ciclo && esc(d.rx_ciclo)].filter(Boolean).join(' · ')}</p>
          ${['saude','pupilas','campo','cores'].filter((k)=> d[k]).map((k)=> `<p><b>${({saude:'Saúde ocular',pupilas:'Pupilas e motilidade',campo:'Campo visual',cores:'Visão de cores'})[k]}:</b> ${nl(d[k])}</p>`).join('')}` : ''}</section>`;
    }
    OUTS.forEach(([tab, title, outId, key])=>{
      const has = p.tests && p.tests[key];
      const st = statusList(p, tab);
      if (!has && !st) return;
      html += `<section><h3>${esc(title)}</h3>${st}${has ? `<div class="rp-out">${cloneOut(outId)}</div>` : ''}</section>`;
    });
    if (r.impressao) html += `<section><h3>Impressão clínica</h3><p>${nl(r.impressao)}</p></section>`;
    if (r.conduta) html += `<section><h3>Conduta e plano</h3><p>${nl(r.conduta)}</p></section>`;
    if (r.encaminhamentos) html += `<section><h3>Encaminhamentos e orientações</h3><p>${nl(r.encaminhamentos)}</p></section>`;
    const sign = ($('rp_assinatura') && $('rp_assinatura').value) || DEFAULT_SIGN;
    html += `<footer class="rp-sign"><div class="rp-line"></div><div>${esc(sign)}</div><div class="rp-addr">Instituto Olhar · Comercial Mauro Lima, sala 105 — Praça João Pessoa, 33, Centro, Garanhuns-PE · (87) 99936-0210</div></footer>`;
    doc.innerHTML = html;
  }

  // ------------------------------------------------------------ menu no celular
  function toggleNav(force){
    const open = typeof force === 'boolean' ? force : !document.body.classList.contains('nav-open');
    document.body.classList.toggle('nav-open', open);
    const sc = $('nav_scrim'); if (sc) sc.hidden = !open;
    const b = $('pt_menu'); if (b) b.setAttribute('aria-expanded', String(open));
  }

  // ------------------------------------------------------------ eventos
  function onPatientChanged(){
    const p = B.getSelectedPatient();
    loadEntrada(p); loadReportFields(p); applyCardStatus();
    saveNote = ''; renderBar(); cleanPanel();
    if (activeTab() === 'tab_relatorio') renderReport();
  }
  document.addEventListener('DOMContentLoaded', ()=>{
    B = window.AppBridge; if (!B) return;
    enhanceSteppers(); enhanceCards(); renderBar();
    const main = document.querySelector('main');
    main.addEventListener('change', (e)=>{
      const tab = e.target.closest('.tab'); if (!tab) return;
      if (e.target.closest('#tab_pacientes, #tab_anamnese, #tab_selftest')) return;
      scheduleAutosave(tab.id, 350);
      if (e.isTrusted && e.target.tagName === 'SELECT') focusNext(e.target);
    });
    main.addEventListener('input', (e)=>{
      const tab = e.target.closest('.tab'); if (!tab) return;
      if (e.target.matches('textarea, input[type=text], input:not([type])') && !e.target.closest('#tab_pacientes, #tab_anamnese')) scheduleAutosave(tab.id, 900);
    });
    const s = $('pt_search'); if (s) s.addEventListener('input', applySearch);
    const list = $('patient_list'); if (list) new MutationObserver(applySearch).observe(list, { childList: true });
    const sc = $('nav_scrim'); if (sc) sc.addEventListener('click', ()=> toggleNav(false));
    document.querySelectorAll('.nav button[data-tab]').forEach((b)=> b.addEventListener('click', ()=> toggleNav(false)));
    document.addEventListener('keydown', (e)=>{ if (e.key === 'Escape') toggleNav(false); });
    $('rp_print').addEventListener('click', ()=>{ saveReportFields(); renderReport(); window.print(); });
    $('rp_refresh').addEventListener('click', ()=>{ saveReportFields(); renderReport(); });
    $('rp_assinatura').addEventListener('input', ()=> scheduleAutosave('tab_relatorio', 900));
    document.addEventListener('olhar:patient', onPatientChanged);
    document.addEventListener('olhar:saved', ()=>{ renderBarSoon(); });
    document.addEventListener('olhar:tab', (e)=>{
      const t = e.detail && e.detail.id;
      if (t === 'tab_relatorio') renderReport();
      if (t === 'tab_painel') setTimeout(cleanPanel, 50);
      window.scrollTo(0, 0);
    });
    const panelBtn = $('btn_panel_refresh'); if (panelBtn) panelBtn.addEventListener('click', ()=> setTimeout(cleanPanel, 50));
    onPatientChanged();
  });
})();
