(() => {
  'use strict';
  const cfg = window.SUPABASE_CONFIG || {};
  const $ = id => document.getElementById(id);
  let client = null;
  let services = [];
  let attendances = [];

  function escapeHtml(v) { return String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
  function money(v){ return 'R$ ' + Number(v||0).toFixed(2).replace('.',','); }
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
  async function navigate(view){
    document.querySelectorAll('.nav').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
    $('title').textContent={dashboard:'Dashboard',services:'Serviços',attendances:'Atendimentos',settings:'Configurações'}[view]||'Dashboard';
    if(view==='services') renderServices(); else if(view==='attendances') renderAttendances(); else if(view==='settings') renderSettings(); else renderDashboard();
  }
  async function getServices(){
    const {data,error}=await client.from('services').select('id,name,category,description,price,active');
    if(error) throw error;
    return (data||[]).sort((a,b)=>String(a.category||'').localeCompare(String(b.category||''),'pt-BR')||String(a.name||'').localeCompare(String(b.name||''),'pt-BR'));
  }
  async function getAttendances(){
    const {data,error}=await client.from('attendances').select('id,client_name,service_id,service_name,amount,payment_method,attended_at,notes,created_at').order('attended_at',{ascending:false}).limit(200);
    if(error) throw error;
    return data||[];
  }
  async function renderServices(){
    const c=$('content'); c.innerHTML='<div class="card"><h3>Serviços</h3><p>Carregando...</p></div>';
    try{
      services=await getServices();
      c.innerHTML='<div class="card"><div class="card-head"><div><h3>Serviços</h3><p>Gerencie tudo o que aparece no site da cliente.</p></div><button class="primary" type="button" id="newService">+ Novo serviço</button></div><div class="toolbar"><input id="serviceSearch" placeholder="Buscar serviço..."></div><div id="serviceList"></div></div>';
      $('newService').onclick=()=>openServiceForm(null); $('serviceSearch').oninput=filterServices; drawServices(services);
    }catch(e){c.innerHTML='<div class="card"><h3>Serviços</h3><p class="error">Não foi possível carregar os serviços: '+escapeHtml(e.message)+'</p></div>';}
  }
  function drawServices(list){
    $('serviceList').innerHTML=list.length?list.map(s=>'<div class="service"><div class="service-main"><strong>'+escapeHtml(s.name)+'</strong><div class="empty">'+escapeHtml(s.category||'Sem categoria')+'</div></div><div class="price">'+money(s.price)+'</div><button class="badge '+(s.active?'':'off')+'" type="button" data-toggle="'+escapeHtml(s.id)+'">'+(s.active?'Visível':'Oculto')+'</button><div class="actions"><button class="action" type="button" data-edit="'+escapeHtml(s.id)+'">Editar</button><button class="action danger" type="button" data-delete="'+escapeHtml(s.id)+'">Excluir</button></div></div>').join(''):'<p class="empty">Nenhum serviço encontrado.</p>';
    $('serviceList').querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>openServiceForm(b.dataset.edit));
    $('serviceList').querySelectorAll('[data-toggle]').forEach(b=>b.onclick=()=>toggleService(b.dataset.toggle));
    $('serviceList').querySelectorAll('[data-delete]').forEach(b=>b.onclick=()=>deleteService(b.dataset.delete));
  }
  function filterServices(){const q=($('serviceSearch').value||'').toLowerCase();drawServices(services.filter(s=>String(s.name||'').toLowerCase().includes(q)||String(s.category||'').toLowerCase().includes(q)));}
  async function toggleService(id){
    const s=services.find(x=>String(x.id)===String(id)); if(!s)return;
    try{const {error}=await client.from('services').update({active:!s.active,updated_at:new Date().toISOString()}).eq('id',s.id);if(error)throw error;await renderServices();}
    catch(e){alert(errorText(e.message));}
  }
  async function deleteService(id){
    const s=services.find(x=>String(x.id)===String(id)); if(!s)return;
    if(!confirm('Excluir o serviço “'+s.name+'”? Esta ação não poderá ser desfeita.')) return;
    try{const {error}=await client.from('services').delete().eq('id',s.id);if(error)throw error;await renderServices();alert('Serviço excluído com sucesso.');}
    catch(e){alert(errorText(e.message));}
  }
  function openServiceForm(id){
    const s=id?services.find(x=>String(x.id)===String(id)):null; const c=$('content');
    c.innerHTML='<div class="card"><div class="card-head"><div><h3>'+ (s?'Editar serviço':'Novo serviço') +'</h3><p>As alterações são salvas diretamente no Supabase.</p></div></div><form id="serviceForm"><label>Nome<input id="fName" required value="'+escapeHtml(s?.name||'')+'"></label><label>Categoria<input id="fCategory" value="'+escapeHtml(s?.category||'')+'"></label><label>Descrição<textarea id="fDescription" rows="3">'+escapeHtml(s?.description||'')+'</textarea></label><label>Preço<input id="fPrice" type="number" min="0" step="0.01" required value="'+(s?.price??'')+'"></label><label class="check"><input id="fActive" type="checkbox" '+(s?.active!==false?'checked':'')+'> Exibir no site</label><div style="display:flex;gap:10px"><button class="primary" type="submit">Salvar alterações</button><button class="action" type="button" id="cancelService">Cancelar</button></div><p id="saveError" class="error"></p></form></div>';
    $('cancelService').onclick=()=>renderServices();
    $('serviceForm').onsubmit=async e=>{ e.preventDefault(); const btn=e.target.querySelector('button[type=submit]'); btn.disabled=true; btn.textContent='Salvando...';
      const payload={name:$('fName').value.trim(),category:$('fCategory').value.trim(),description:$('fDescription').value.trim(),price:Number($('fPrice').value),active:$('fActive').checked,updated_at:new Date().toISOString()};
      try{ const result=s?await client.from('services').update(payload).eq('id',s.id):await client.from('services').insert(payload); if(result.error) throw result.error; await renderServices(); alert(s?'Serviço atualizado com sucesso!':'Serviço cadastrado com sucesso!'); }
      catch(err){$('saveError').textContent=errorText(err.message);btn.disabled=false;btn.textContent='Salvar alterações';}
    };
  }
  async function renderDashboard(){
    const c=$('content'); c.innerHTML='<div class="card"><h3>Dashboard</h3><p>Carregando indicadores...</p></div>';
    try{
      const [sv,at]=await Promise.all([getServices(),getAttendances()]); services=sv; attendances=at;
      const now=new Date(); const monthStart=new Date(now.getFullYear(),now.getMonth(),1); const seven=new Date(now.getTime()-6*86400000);
      const monthAt=at.filter(x=>new Date(x.attended_at||x.created_at)>=monthStart);
      const total=monthAt.reduce((sum,x)=>sum+Number(x.amount||0),0); const ticket=monthAt.length?total/monthAt.length:0;
      const byDay=[]; for(let i=6;i>=0;i--){const d=new Date(now);d.setHours(0,0,0,0);d.setDate(now.getDate()-i);const next=new Date(d);next.setDate(d.getDate()+1);const value=at.filter(x=>{const t=new Date(x.attended_at||x.created_at);return t>=d&&t<next;}).reduce((s,x)=>s+Number(x.amount||0),0);byDay.push({label:d.toLocaleDateString('pt-BR',{weekday:'short'}).replace('.',''),value});}
      const top={}; at.forEach(x=>{const n=x.service_name||'Serviço';top[n]=(top[n]||0)+1;}); const topService=Object.entries(top).sort((a,b)=>b[1]-a[1])[0];
      c.innerHTML='<div class="hero"><p class="eyebrow">VISÃO GERAL</p><h1>Olá, Iarytsa & Raquel ✦</h1><p>Acompanhe o movimento do Studio em um só lugar.</p></div><div class="stats"><div class="stat"><span>Faturamento do mês</span><strong>'+money(total)+'</strong></div><div class="stat"><span>Atendimentos</span><strong>'+monthAt.length+'</strong></div><div class="stat"><span>Ticket médio</span><strong>'+money(ticket)+'</strong></div></div><div class="card"><div class="card-head"><div><h3>Faturamento · últimos 7 dias</h3><p>Valores registrados em atendimentos.</p></div><button class="primary" type="button" id="quickAttendance">+ Registrar atendimento</button></div><div class="chart-list">'+byDay.map(d=>'<div class="chart-row"><span>'+escapeHtml(d.label)+'</span><div class="bar"><i style="width:'+Math.min(100,(d.value/(Math.max(...byDay.map(x=>x.value),1)))*100)+'%"></i></div><strong>'+money(d.value)+'</strong></div>').join('')+'</div></div><div class="stats"><div class="stat"><span>Serviços cadastrados</span><strong>'+sv.length+'</strong></div><div class="stat"><span>Visíveis no site</span><strong>'+sv.filter(s=>s.active).length+'</strong></div><div class="stat"><span>Mais vendido</span><strong style="font-size:18px">'+escapeHtml(topService?topService[0]:'—')+'</strong></div></div>';
      $('quickAttendance').onclick=()=>openAttendanceForm();
    }catch(e){c.innerHTML='<div class="card"><h3>Dashboard</h3><p class="error">Não foi possível carregar os indicadores: '+escapeHtml(e.message)+'</p></div>';}
  }
  async function renderAttendances(){
    const c=$('content'); c.innerHTML='<div class="card"><h3>Atendimentos</h3><p>Carregando...</p></div>';
    try{
      services=await getServices(); attendances=await getAttendances();
      c.innerHTML='<div class="card"><div class="card-head"><div><h3>Atendimentos</h3><p>Registre cada atendimento para alimentar o faturamento.</p></div><button class="primary" id="newAttendance" type="button">+ Registrar atendimento</button></div><div class="toolbar"><input id="attendanceSearch" placeholder="Buscar cliente ou serviço..."></div><div id="attendanceList"></div></div>';
      $('newAttendance').onclick=()=>openAttendanceForm(); $('attendanceSearch').oninput=filterAttendances; drawAttendances(attendances);
    }catch(e){c.innerHTML='<div class="card"><h3>Atendimentos</h3><p class="error">Não foi possível carregar os atendimentos: '+escapeHtml(e.message)+'</p></div>';}
  }
  function drawAttendances(list){
    $('attendanceList').innerHTML=list.length?list.map(a=>'<div class="service"><div class="service-main"><strong>'+escapeHtml(a.client_name)+'</strong><div class="empty">'+escapeHtml(a.service_name||'')+' · '+new Date(a.attended_at||a.created_at).toLocaleDateString('pt-BR')+'</div></div><div class="price">'+money(a.amount)+'</div><div class="badge">'+escapeHtml(a.payment_method||'Não informado')+'</div></div>').join(''):'<p class="empty">Nenhum atendimento registrado ainda.</p>';
  }
  function filterAttendances(){const q=($('attendanceSearch').value||'').toLowerCase();drawAttendances(attendances.filter(a=>String(a.client_name||'').toLowerCase().includes(q)||String(a.service_name||'').toLowerCase().includes(q)));}
  function openAttendanceForm(){
    const c=$('content');
    c.innerHTML='<div class="card"><div class="card-head"><div><h3>Registrar atendimento</h3><p>O registro alimenta automaticamente o faturamento do Dashboard.</p></div></div><form id="attendanceForm"><label>Cliente<input id="aClient" required placeholder="Nome da cliente"></label><label>Serviço<select id="aService" required><option value="">Selecione...</option>'+services.map(s=>'<option value="'+escapeHtml(s.id)+'" data-price="'+Number(s.price||0)+'">'+escapeHtml(s.name)+' — '+money(s.price)+'</option>').join('')+'</select></label><label>Valor<input id="aAmount" type="number" min="0" step="0.01" required></label><label>Forma de pagamento<select id="aPayment"><option>Pix</option><option>Dinheiro</option><option>Cartão</option><option>Outro</option></select></label><label>Data<input id="aDate" type="date" required value="'+new Date().toISOString().slice(0,10)+'"></label><label>Observações<textarea id="aNotes" rows="3"></textarea></label><div style="display:flex;gap:10px"><button class="primary" type="submit">Salvar atendimento</button><button class="action" type="button" id="cancelAttendance">Cancelar</button></div><p id="attendanceError" class="error"></p></form></div>';
    $('aService').onchange=()=>{const o=$('aService').selectedOptions[0];$('aAmount').value=o?.dataset.price||'';};
    $('cancelAttendance').onclick=()=>renderAttendances();
    $('attendanceForm').onsubmit=async e=>{e.preventDefault();const btn=e.target.querySelector('button[type=submit]');btn.disabled=true;btn.textContent='Salvando...';const opt=$('aService').selectedOptions[0];const payload={client_name:$('aClient').value.trim(),service_id:$('aService').value,service_name:opt?.textContent.split(' — ')[0]||'',amount:Number($('aAmount').value),payment_method:$('aPayment').value,attended_at:new Date($('aDate').value+'T12:00:00').toISOString(),notes:$('aNotes').value.trim()};try{const {error}=await client.from('attendances').insert(payload);if(error)throw error;alert('Atendimento registrado com sucesso!');await renderAttendances();}catch(err){$('attendanceError').textContent=errorText(err.message);btn.disabled=false;btn.textContent='Salvar atendimento';}};
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
  window.addEventListener('DOMContentLoaded',init);
})();
