(() => {
  'use strict';
  const cfg = window.SUPABASE_CONFIG || {};
  const $ = id => document.getElementById(id);
  let client = null;
  let services = [];

  function escapeHtml(v) { return String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
  function errorText(m) {
    const s = String(m || '');
    if (/invalid login credentials/i.test(s)) return 'E-mail ou senha incorretos.';
    if (/email not confirmed/i.test(s)) return 'E-mail ainda não confirmado.';
    if (/permission denied for function is_admin/i.test(s)) return 'Permissão de administrador não configurada no Supabase.';
    return 'Não foi possível concluir: ' + s;
  }
  function init() {
    if (!cfg.url || !cfg.anonKey || !window.supabase) { $('loginError').textContent='Configuração do Supabase não encontrada.'; return; }
    client = window.supabase.createClient(cfg.url, cfg.anonKey);
    $('loginForm')?.addEventListener('submit', login);
    document.querySelectorAll('.nav').forEach(b => b.addEventListener('click', () => navigate(b.dataset.view)));
    $('logout')?.addEventListener('click', async () => { await client.auth.signOut(); location.reload(); });
    client.auth.getSession().then(({data}) => { if (data?.session) showPanel(); }).catch(console.error);
  }
  async function login(e) {
    e.preventDefault(); $('loginError').textContent='Entrando...';
    const {data,error}=await client.auth.signInWithPassword({email:$('email').value.trim(),password:$('password').value});
    if(error){ $('loginError').textContent=errorText(error.message); return; }
    if(!data?.session){ $('loginError').textContent='Login realizado, mas a sessão não foi criada.'; return; }
    showPanel();
  }
  function showPanel(){ $('login').classList.add('hidden'); $('panel').classList.remove('hidden'); navigate('dashboard'); }
  function navigate(view){
    document.querySelectorAll('.nav').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
    $('title').textContent={dashboard:'Dashboard',services:'Serviços',attendances:'Atendimentos',settings:'Configurações'}[view]||'Dashboard';
    if(view==='services') renderServices(); else if(view==='attendances') renderAttendances(); else if(view==='settings') renderSettings(); else renderDashboard();
  }
  async function getServices(){
    const {data,error}=await client.from('services').select('id,name,category,description,price,active');
    if(error) throw error;
    return (data||[]).sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'pt-BR'));
  }
  async function renderServices(){
    const c=$('content'); c.innerHTML='<div class="card"><h3>Serviços</h3><p>Carregando...</p></div>';
    try{
      services=await getServices();
      c.innerHTML='<div class="card"><div class="card-head"><div><h3>Serviços</h3><p>Gerencie o que aparece no site da cliente.</p></div><button class="primary" type="button" id="newService">+ Novo serviço</button></div><div class="toolbar"><input id="serviceSearch" placeholder="Buscar serviço..."></div><div id="serviceList"></div></div>';
      $('newService').onclick=()=>openServiceForm(null); $('serviceSearch').oninput=filterServices; drawServices(services);
    }catch(e){c.innerHTML='<div class="card"><h3>Serviços</h3><p class="error">Não foi possível carregar os serviços: '+escapeHtml(e.message)+'</p></div>';}
  }
  function drawServices(list){
    $('serviceList').innerHTML=list.length?list.map(s=>'<div class="service"><div><strong>'+escapeHtml(s.name)+'</strong><div class="empty">'+escapeHtml(s.category||'')+'</div></div><div class="price">R$ '+Number(s.price||0).toFixed(2).replace('.',',')+'</div><div class="badge '+(s.active?'':'off')+'">'+(s.active?'Visível':'Oculto')+'</div><div><button class="action" type="button" data-edit="'+escapeHtml(s.id)+'">Editar</button></div></div>').join(''):'<p class="empty">Nenhum serviço encontrado.</p>';
    $('serviceList').querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>openServiceForm(b.dataset.edit));
  }
  function filterServices(){const q=($('serviceSearch').value||'').toLowerCase();drawServices(services.filter(s=>String(s.name||'').toLowerCase().includes(q)||String(s.category||'').toLowerCase().includes(q)));}
  function openServiceForm(id){
    const s=id?services.find(x=>String(x.id)===String(id)):null; const c=$('content');
    c.innerHTML='<div class="card"><div class="card-head"><div><h3>'+ (s?'Editar serviço':'Novo serviço') +'</h3><p>As alterações são salvas diretamente no Supabase.</p></div></div><form id="serviceForm"><label>Nome<input id="fName" required value="'+escapeHtml(s?.name||'')+'"></label><label>Categoria<input id="fCategory" value="'+escapeHtml(s?.category||'')+'"></label><label>Descrição<textarea id="fDescription" rows="3">'+escapeHtml(s?.description||'')+'</textarea></label><label>Preço<input id="fPrice" type="number" min="0" step="0.01" required value="'+(s?.price??'')+'"></label><label class="check"><input id="fActive" type="checkbox" '+(s?.active!==false?'checked':'')+'> Exibir no site</label><div style="display:flex;gap:10px"><button class="primary" type="submit">Salvar alterações</button><button class="action" type="button" id="cancelService">Cancelar</button></div><p id="saveError" class="error"></p></form></div>';
    $('cancelService').onclick=()=>renderServices();
    $('serviceForm').onsubmit=async e=>{ e.preventDefault(); const btn=e.target.querySelector('button[type=submit]'); btn.disabled=true; btn.textContent='Salvando...';
      const payload={name:$('fName').value.trim(),category:$('fCategory').value.trim(),description:$('fDescription').value.trim(),price:Number($('fPrice').value),active:$('fActive').checked};
      try{ const result=s?await client.from('services').update(payload).eq('id',s.id):await client.from('services').insert(payload); if(result.error) throw result.error; await renderServices(); alert(s?'Serviço atualizado com sucesso!':'Serviço cadastrado com sucesso!'); }
      catch(err){$('saveError').textContent=errorText(err.message);btn.disabled=false;btn.textContent='Salvar alterações';}
    };
  }
  async function renderSettings(){
    const c=$('content'); c.innerHTML='<div class="card"><h3>Configurações do Studio</h3><p>Carregando...</p></div>';
    try {
      const {data,error}=await client.from('studio_settings').select('id,studio_name,tagline,whatsapp,instagram,address,city,hours').eq('id',1).maybeSingle();
      if(error) throw error;
      const s=data||{};
      c.innerHTML='<div class="card"><div class="card-head"><div><h3>Informações do Studio</h3><p>Altere aqui o conteúdo institucional usado pelo site.</p></div></div><form id="settingsForm"><label>Nome do Studio<input id="stName" required value="'+escapeHtml(s.studio_name||'')+'"></label><label>Frase / especialidade<input id="stTagline" required value="'+escapeHtml(s.tagline||'')+'"></label><label>WhatsApp<input id="stWhatsapp" required value="'+escapeHtml(s.whatsapp||'')+'"></label><label>Instagram<input id="stInstagram" required value="'+escapeHtml(s.instagram||'')+'"></label><label>Endereço<input id="stAddress" required value="'+escapeHtml(s.address||'')+'"></label><label>Cidade<input id="stCity" required value="'+escapeHtml(s.city||'')+'"></label><label>Horário de atendimento<input id="stHours" required value="'+escapeHtml(s.hours||'')+'"></label><button class="primary" type="submit">Salvar configurações</button><p id="settingsError" class="error"></p></form></div>';
      $('settingsForm').onsubmit=async e=>{e.preventDefault(); const btn=e.target.querySelector('button[type=submit]'); btn.disabled=true; btn.textContent='Salvando...';
        const payload={studio_name:$('stName').value.trim(),tagline:$('stTagline').value.trim(),whatsapp:$('stWhatsapp').value.trim(),instagram:$('stInstagram').value.trim(),address:$('stAddress').value.trim(),city:$('stCity').value.trim(),hours:$('stHours').value.trim(),updated_at:new Date().toISOString()};
        try { const {error}=await client.from('studio_settings').update(payload).eq('id',1); if(error) throw error; btn.textContent='Salvo ✓'; alert('Configurações salvas com sucesso!'); }
        catch(err){$('settingsError').textContent=errorText(err.message); btn.disabled=false; btn.textContent='Salvar configurações';}
      };
    } catch(e) { c.innerHTML='<div class="card"><h3>Configurações do Studio</h3><p class="error">Não foi possível carregar as configurações: '+escapeHtml(e.message)+'</p></div>'; }
  }
  function renderDashboard(){ $('content').innerHTML='<div class="hero"><p class="eyebrow">VISÃO GERAL</p><h1>Olá, Iarytsa & Raquel ✦</h1><p>Gerencie o Studio I.R em um só lugar.</p></div><div class="stats"><div class="stat"><span>Faturamento do mês</span><strong>R$ 0,00</strong></div><div class="stat"><span>Atendimentos</span><strong>0</strong></div><div class="stat"><span>Ticket médio</span><strong>R$ 0,00</strong></div></div><div class="card"><h3>Acesso rápido</h3><p>Use o menu ao lado para administrar serviços, atendimentos e configurações do site.</p></div>'; }
  function renderAttendances(){ $('content').innerHTML='<div class="card"><h3>Atendimentos</h3><p>Área de registros e faturamento.</p></div>'; }
  window.addEventListener('DOMContentLoaded',init);
})();
