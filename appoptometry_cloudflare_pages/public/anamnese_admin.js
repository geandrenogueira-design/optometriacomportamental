// Aba "Anamnese (pais)": gera links do formulário, lista respostas e importa para o paciente.
(function(){
  'use strict';
  const API = '/api/anamnese/admin';
  const $ = (id) => document.getElementById(id);
  let B = null;           // AppBridge (definido pelo ui.js no init)
  let S = null;           // ANAMNESE_SCHEMA

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmtDate = (ms) => ms ? new Date(ms).toLocaleDateString('pt-BR') : '—';
  const STATUS = { aguardando: 'Aguardando resposta', respondida: 'Respondida — pronta para importar', importada: 'Importada' };

  async function api(method, body, query){
    const res = await fetch(API + (query || ''), {
      method, credentials: 'same-origin', cache: 'no-store',
      headers: body ? { 'Content-Type': 'application/json', 'Accept': 'application/json' } : { 'Accept': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const ctype = res.headers.get('Content-Type') || '';
    if (res.redirected || !ctype.includes('application/json')) throw new Error('Sessão expirada: recarregue a página.');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || ('Erro ' + res.status));
    return data;
  }

  // ---------------- links ----------------
  function whatsappText(label, url, expiresAt){
    return `Olá! Aqui é do Instituto Olhar. Antes da avaliação de ${label}, pedimos que preencha este questionário com calma (leva cerca de 20 minutos e fica salvo se precisar parar no meio):\n${url}\nO link vale até ${fmtDate(expiresAt)}. Qualquer dúvida, é só responder esta mensagem.`;
  }

  async function copy(text){
    try { await navigator.clipboard.writeText(text); B.showToast('Copiado.'); }
    catch(_){ window.prompt('Copie o texto:', text); }
  }

  async function createLink(){
    const label = $('an_label').value.trim();
    if (!label){ B.showToast('Informe o nome da criança.', false); return; }
    const p = B.getSelectedPatient();
    try{
      const r = await api('POST', { action: 'create', label, patientId: p ? p.id : null, days: Number($('an_days').value) || 14 });
      const msg = whatsappText(label, r.url, r.expiresAt);
      $('an_new').innerHTML = `<div class="card io-newlink">
        <div class="k">Link gerado</div><div class="mono" style="word-break:break-all;margin:4px 0 8px">${esc(r.url)}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button id="an_copy_link">Copiar link</button>
          <button class="secondary" id="an_copy_msg">Copiar mensagem para WhatsApp</button>
          <a class="secondary" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(msg)}">Abrir no WhatsApp</a>
        </div></div>`;
      $('an_copy_link').onclick = () => copy(r.url);
      $('an_copy_msg').onclick = () => copy(msg);
      $('an_label').value = '';
      refresh();
    }catch(e){ B.showToast(e.message, false); }
  }

  async function refresh(){
    const box = $('an_list');
    box.innerHTML = '<div class="muted">Carregando…</div>';
    try{
      const { items } = await api('GET');
      if (!items.length){ box.innerHTML = '<div class="muted">Nenhum link gerado ainda.</div>'; return; }
      box.innerHTML = items.map((it) => {
        const exp = it.status === 'aguardando' && Date.now() > it.expiresAt;
        const pat = it.patientId && B.findPatient(it.patientId);
        return `<div class="card" style="padding:10px 12px;margin:6px 0">
          <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap">
            <div><b>${esc(it.label)}</b>${pat ? ` <span class="muted">· vinculado a ${esc(pat.name)}</span>` : ''}
              <div class="muted" style="font-size:12px">${exp ? 'Expirado sem resposta' : STATUS[it.status] || it.status}
              · criado ${fmtDate(it.createdAt)}${it.submittedAt ? ' · respondido ' + fmtDate(it.submittedAt) : ' · vale até ' + fmtDate(it.expiresAt)}${it.importedAt ? ' · importado ' + fmtDate(it.importedAt) : ''}</div></div>
            <div style="display:flex;gap:6px;flex-wrap:wrap">
              ${it.status !== 'aguardando' ? `<button data-an="import" data-code="${esc(it.code)}">${it.status === 'importada' ? 'Importar de novo' : 'Importar'}</button>` : ''}
              ${it.status === 'aguardando' && !exp ? `<button class="secondary" data-an="msg" data-code="${esc(it.code)}" data-label="${esc(it.label)}" data-exp="${it.expiresAt}">Copiar mensagem</button>` : ''}
              <button class="secondary" data-an="delete" data-code="${esc(it.code)}">Apagar</button>
            </div></div></div>`;
      }).join('');
    }catch(e){ box.innerHTML = `<div class="muted">${esc(e.message)}</div>`; }
  }

  async function onListClick(e){
    const b = e.target.closest('button[data-an]');
    if (!b) return;
    const code = b.dataset.code;
    if (b.dataset.an === 'msg'){
      const url = `${location.origin}/anamnese/?c=${code}`;
      return copy(whatsappText(b.dataset.label, url, Number(b.dataset.exp)));
    }
    if (b.dataset.an === 'delete'){
      if (!window.confirm('Apagar este link e as respostas guardadas na nuvem? O que já foi importado para o paciente continua no prontuário.')) return;
      try{ await api('POST', { action: 'delete', code }); refresh(); }catch(err){ B.showToast(err.message, false); }
      return;
    }
    if (b.dataset.an === 'import'){
      try{
        const r = await api('GET', null, '?code=' + encodeURIComponent(code));
        if (!r.data || !r.data.answers){ B.showToast('Sem respostas neste link.', false); return; }
        const pid = importAnswers(r.data.answers, { source: 'link', code, submittedAt: r.data.submittedAt, schemaVersion: r.data.schemaVersion, consentAt: r.consentAt, linkedPatientId: r.patientId });
        if (pid){ await api('POST', { action: 'mark_imported', code, patientId: pid }); refresh(); }
      }catch(err){ B.showToast(err.message, false); }
    }
  }

  // ---------------- importação ----------------
  function sexCode(v){ return v === 'Feminino' ? 'F' : v === 'Masculino' ? 'M' : ''; }
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

  // Retorna o id do paciente que recebeu a anamnese, ou null se cancelado.
  function importAnswers(answers, meta){
    let p = (meta.linkedPatientId && B.findPatient(meta.linkedPatientId)) || B.getSelectedPatient();
    const childName = answers.crianca_nome || '';

    if (p && norm(p.name) !== norm(childName)){
      const ok = window.confirm(`As respostas são de "${childName}". Importar para o paciente "${p.name}"?\n\nOK = importar para "${p.name}"\nCancelar = escolher outra opção`);
      if (!ok) p = null;
    }
    if (!p){
      const same = B.listPatients().find((x) => norm(x.name) === norm(childName) && (!answers.crianca_nasc || x.dob === answers.crianca_nasc));
      if (same && window.confirm(`Encontrei o paciente "${same.name}" (${same.dob || 'sem data'}). Importar para ele?`)) p = same;
    }
    if (!p){
      if (!window.confirm(`Criar um paciente novo "${childName}" com estas respostas?`)) return null;
      p = { id: B.uid(), name: childName, dob: answers.crianca_nasc || '', sex: sexCode(answers.crianca_sexo), cpf: '',
            createdAt: new Date().toISOString(), notes: '', profile: { main: '', history: '', clinical: '' }, tests: {} };
    }
    if (p.anamnese && p.anamnese.answers && !window.confirm(`"${p.name}" já tem uma anamnese importada em ${p.anamnese.importedAt ? new Date(p.anamnese.importedAt).toLocaleDateString('pt-BR') : 'data anterior'}. Substituir?`)) return null;

    p.anamnese = {
      schema: S.id, schemaVersion: meta.schemaVersion || S.version, source: meta.source, code: meta.code || null,
      submittedAt: meta.submittedAt || null, consentAt: meta.consentAt || null, importedAt: new Date().toISOString(),
      answers,
    };
    p.profile = p.profile || {};
    if (!p.profile.main && answers.motivo) p.profile.main = answers.motivo;
    if (!p.profile.history && answers.preocupacoes) p.profile.history = answers.preocupacoes;
    if (!p.dob && answers.crianca_nasc) p.dob = answers.crianca_nasc;
    if (!p.sex && answers.crianca_sexo) p.sex = sexCode(answers.crianca_sexo);

    B.upsertPatient(p);
    B.selectPatient(p.id);
    renderSummary();
    B.showToast(`Anamnese importada para ${p.name}.`);
    return p.id;
  }

  function importFile(file){
    if (!file) return;
    const rd = new FileReader();
    rd.onload = () => {
      let d;
      try { d = JSON.parse(String(rd.result || '')); } catch(_) { B.showToast('Arquivo inválido.', false); return; }
      const answers = d && (d.answers || (d.data && d.data.answers));
      if (!answers || !answers.crianca_nome){ B.showToast('O arquivo não parece ser um questionário do Instituto Olhar.', false); return; }
      importAnswers(answers, { source: 'arquivo', code: d.code || null, submittedAt: d.savedAt || d.submittedAt || null, schemaVersion: d.schemaVersion });
    };
    rd.readAsText(file);
  }

  // ---------------- resumo ----------------
  function fieldList(){ return S.sections.flatMap((s) => s.fields.map((f) => Object.assign({ section: s.title }, f))); }

  function answerText(f, a){
    const v = a[f.id];
    switch (f.type){
      case 'yesno': {
        const base = v === 'sim' ? 'Sim' : v === 'nao' ? 'Não' : '';
        const d = a[f.id + '_desc'];
        return base + (d ? ' — ' + d : '');
      }
      case 'consent': return v === true ? 'Aceito' : '';
      case 'multi': return Array.isArray(v) ? v.join(', ') : '';
      case 'grid': return v ? f.rows.filter((r) => v[r.id] && v[r.id].v).map((r) => `${r.label}: ${v[r.id].v}${v[r.id].desc ? ' (' + v[r.id].desc + ')' : ''}`).join('; ') : '';
      case 'grid2': return v ? f.rows.filter((r) => v[r.id] && (v[r.id].a || v[r.id].b)).map((r) => `${r.label}: avaliado ${v[r.id].a === 'sim' ? 'sim' : v[r.id].a === 'nao' ? 'não' : '?'}, acompanha ${v[r.id].b === 'sim' ? 'sim' : v[r.id].b === 'nao' ? 'não' : '?'}`).join('; ') : '';
      default: return v == null ? '' : String(v);
    }
  }

  function renderSummary(){
    const box = $('an_summary');
    if (!box) return;
    const p = B.getSelectedPatient();
    if (!p || !p.anamnese || !p.anamnese.answers){
      box.innerHTML = `<div class="muted">${p ? esc(p.name) + ' ainda não tem anamnese importada.' : 'Selecione um paciente com anamnese importada.'}</div>`;
      return;
    }
    const a = p.anamnese.answers;
    const sc = window.ANAMNESE_SCORE(a);
    const scaleItems = S.sections.find((s) => s.id === 's9').fields[0].items;
    const label = (n) => (S.scale.find((x) => x.v === n) || {}).label || '—';
    const sint = a.sintomas || {};

    const rows = sc.domains.map((d) => `<tr>
        <td>${esc(d.label)}</td>
        <td class="mono" style="text-align:right">${d.answered ? d.sum + ' / ' + d.max : '—'}<div class="muted" style="font-size:11px">${d.answered} de ${d.items} itens</div></td>
        <td style="min-width:110px"><div class="io-bar"><div style="width:${d.pct || 0}%"></div></div></td>
        <td class="mono" style="text-align:right">${d.pct == null ? '—' : d.pct + '%'}</td>
        <td class="mono" style="text-align:center">${d.high}</td>
        <td class="muted" style="font-size:12px">${esc(d.tests)}</td></tr>`).join('');

    const high = scaleItems.filter((it) => Number(sint[it.n]) >= 3)
      .map((it) => `<li><b>${it.n}.</b> ${esc(it.t)} — <i>${esc(label(Number(sint[it.n])))}</i>${it.ask ? ' <span class="muted" style="font-size:12px">(relato da criança)</span>' : ''}</li>`).join('');

    const details = S.sections.filter((s) => s.id !== 's9').map((s) => {
      const lines = s.fields.filter((f) => f.type !== 'heading').map((f) => {
        const t = answerText(f, a);
        return t ? `<div style="margin:3px 0"><span class="muted">${esc(f.label)}:</span> ${esc(t)}</div>` : '';
      }).join('');
      return lines ? `<div style="margin-top:10px"><b>${esc(s.title)}</b>${lines}</div>` : '';
    }).join('');

    box.innerHTML = `
      <div class="muted" style="font-size:12px">Preenchido por ${esc(a.respondente || '—')}${a.parentesco ? ' (' + esc(a.parentesco) + ')' : ''}
        · ${p.anamnese.submittedAt ? 'enviado ' + new Date(p.anamnese.submittedAt).toLocaleDateString('pt-BR') : 'importado de arquivo'}
        · consentimento ${a.consentimento === true ? 'registrado' : '<b>não registrado</b>'}</div>
      ${sc.flags.length ? `<div class="card io-alert" style="margin-top:10px"><b>Alertas para o perfil</b><ul style="margin:6px 0 0 18px">${sc.flags.map((f) => `<li>${esc(f)}</li>`).join('')}</ul></div>` : ''}
      <h3 style="margin-top:14px">Sinais e sintomas por domínio</h3>
      <div class="muted" style="font-size:12px;margin-bottom:6px">Escala 0 (nunca) a 4 (sempre). Pontuação descritiva: este questionário não é validado e não tem ponto de corte. Use para orientar quais testes aprofundar.</div>
      <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:14px">
        <thead><tr style="text-align:left"><th>Domínio</th><th style="text-align:right">Pontos</th><th></th><th style="text-align:right">%</th><th style="text-align:center">Itens freq./sempre</th><th>Investigar com</th></tr></thead>
        <tbody>${rows}</tbody></table></div>
      <div class="muted" style="font-size:12px;margin-top:4px">Itens respondidos: ${sc.answered} de ${sc.total}. Impacto no dia a dia: <b>${esc(a.impacto || '—')}</b>.</div>
      ${high ? `<h3 style="margin-top:14px">Itens marcados como frequentes ou sempre</h3><ul style="margin:4px 0 0 18px">${high}</ul>` : ''}
      <details style="margin-top:14px"><summary><b>Todas as respostas</b></summary>${details}</details>`;
  }

  // ---------------- início ----------------
  document.addEventListener('DOMContentLoaded', () => {
    B = window.AppBridge; S = window.ANAMNESE_SCHEMA;
    if (!B || !S || !$('tab_anamnese')) return;
    const local = B.isLocalOnly();
    $('an_cloud').style.display = local ? 'none' : '';
    $('an_local').style.display = local ? '' : 'none';
    $('an_create').addEventListener('click', createLink);
    $('an_refresh').addEventListener('click', refresh);
    $('an_list').addEventListener('click', onListClick);
    $('an_file_btn').addEventListener('click', () => $('an_file').click());
    $('an_file').addEventListener('change', () => { importFile($('an_file').files[0]); $('an_file').value = ''; });
    // Atualiza ao abrir a aba
    document.querySelectorAll('button[data-tab="tab_anamnese"]').forEach((b) => b.addEventListener('click', () => {
      const p = B.getSelectedPatient();
      if (p && !$('an_label').value) $('an_label').value = p.name || '';
      renderSummary();
      if (!local) refresh();
    }));
    document.getElementById('patient_list') && document.getElementById('patient_list').addEventListener('click', () => setTimeout(renderSummary, 0));
  });
})();
