(() => {
  'use strict';
  const cfg = window.SUPABASE_CONFIG || {};
  const $ = (id) => document.getElementById(id);
  let client = null;
  let services = [];

  function errorText(message) {
    const el = $('loginError');
    if (el) el.textContent = message || '';
  }

  function init() {
    if (!cfg.url || !cfg.anonKey) return errorText('Configuração do Supabase não encontrada.');
    if (!window.supabase || typeof window.supabase.createClient !== 'function') return errorText('Sistema de autenticação não carregado.');
    client = window.supabase.createClient(cfg.url, cfg.anonKey);

    const form = $('loginForm');
    if (form) form.addEventListener('submit', login);
    document.querySelectorAll('.nav').forEach((b) => b.addEventListener('click', () => navigate(b.dataset.view)));
    const logout = $('logout');
    if (logout) logout.addEventListener('click', async () => { await client.auth.signOut(); location.reload(); });

    client.auth.getSession().then(({ data }) => {
      if (data && data.session) showPanel();
    }).catch(console.error);
  }

  async function login(event) {
    event.preventDefault();
    const email = ($('email')?.value || '').trim();
    const password = $('password')?.value || '';
    errorText('Entrando...');
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) {
      console.error(error);
      const m = String(error.message || '');
      if (/invalid login credentials/i.test(m)) return errorText('E-mail ou senha incorretos.');
      if (/email not confirmed/i.test(m)) return errorText('E-mail ainda não confirmado.');
      return errorText('Não foi possível entrar: ' + m);
    }
    if (!data?.session) return errorText('Login realizado, mas a sessão não foi criada.');
    errorText('');
    showPanel();
  }

  function showPanel() {
    $('login')?.classList.add('hidden');
    $('panel')?.classList.remove('hidden');
    navigate('dashboard');
  }

  function navigate(view) {
    document.querySelectorAll('.nav').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
    const titles = { dashboard: 'Dashboard', services: 'Serviços', attendances: 'Atendimentos', settings: 'Configurações' };
    if ($('title')) $('title').textContent = titles[view] || 'Dashboard';
    if (view === 'services') renderServices();
    else if (view === 'attendances') renderAttendances();
    else if (view === 'settings') renderSettings();
    else renderDashboard();
  }

  async function getServices() {
    const { data, error } = await client.from('services').select('id,name,category,description,price,active');
    if (error) throw error;
    return (data || []).sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR'));
  }

  async function renderServices() {
    const content = $('content');
    content.innerHTML = '<div class="card"><h3>Serviços</h3><p>Carregando...</p></div>';
    try {
      services = await getServices();
      content.innerHTML = '<div class="card"><div class="card-head"><div><h3>Serviços</h3><p>Gerencie o que aparece no site da cliente.</p></div><button class="primary" type="button" id="newServiceBtn">+ Novo serviço</button></div><div class="toolbar"><input id="serviceSearch" placeholder="Buscar serviço..."></div><div id="serviceList"></div></div>';
      $('newServiceBtn')?.addEventListener('click', () => alert('Cadastro de serviço será conectado na próxima etapa.'));
      $('serviceSearch')?.addEventListener('input', filterServices);
      drawServices(services);
    } catch (e) {
      console.error(e);
      content.innerHTML = '<div class="card"><h3>Serviços</h3><p class="error">Não foi possível carregar os serviços: ' + escapeHtml(e.message) + '</p></div>';
    }
  }

  function drawServices(list) {
    const el = $('serviceList');
    if (!el) return;
    if (!list.length) return void (el.innerHTML = '<p class="empty">Nenhum serviço encontrado.</p>');
    el.innerHTML = list.map((s) => '<div class="service"><div><strong>' + escapeHtml(s.name) + '</strong><div class="empty">' + escapeHtml(s.category || '') + '</div></div><div class="price">R$ ' + Number(s.price || 0).toFixed(2).replace('.', ',') + '</div><div class="badge ' + (s.active ? '' : 'off') + '">' + (s.active ? 'Visível' : 'Oculto') + '</div><div><button class="action" type="button" data-edit="' + escapeHtml(s.id) + '">Editar</button></div></div>').join('');
    el.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => editService(b.dataset.edit)));
  }

  function filterServices() {
    const q = ($('serviceSearch')?.value || '').toLowerCase();
    drawServices(services.filter((s) => String(s.name || '').toLowerCase().includes(q) || String(s.category || '').toLowerCase().includes(q)));
  }

  function editService(id) {
    const s = services.find((x) => String(x.id) === String(id));
    if (s) alert('Serviço selecionado: ' + s.name);
  }

  function renderDashboard() {
    $('content').innerHTML = '<div class="hero"><p class="eyebrow">VISÃO GERAL</p><h1>Olá, Iarytsa & Raquel ✦</h1><p>Gerencie o Studio I.R em um só lugar.</p></div><div class="stats"><div class="stat"><span>Faturamento do mês</span><strong>R$ 0,00</strong></div><div class="stat"><span>Atendimentos</span><strong>0</strong></div><div class="stat"><span>Ticket médio</span><strong>R$ 0,00</strong></div></div><div class="card"><h3>Acesso rápido</h3><p>Use o menu ao lado para administrar serviços, atendimentos e configurações do site.</p></div>';
  }
  function renderAttendances() { $('content').innerHTML = '<div class="card"><h3>Atendimentos</h3><p>Área de registros e faturamento.</p></div>'; }
  function renderSettings() { $('content').innerHTML = '<div class="card"><h3>Configurações do Studio</h3><p>Área reservada para controlar as informações exibidas no site.</p></div>'; }
  function escapeHtml(v) { return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }

  window.addEventListener('DOMContentLoaded', init);
})();
