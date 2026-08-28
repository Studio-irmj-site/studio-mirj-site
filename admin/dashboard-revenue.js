(() => {
  const cfg = window.SUPABASE_CONFIG || {};
  if (!window.supabase || !cfg.url || !cfg.anonKey) return;
  const db = window.supabase.createClient(cfg.url, cfg.anonKey);
  const money = v => Number(v || 0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  async function refreshRevenue(){
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const end = new Date(now.getFullYear(), now.getMonth()+1, 1).toISOString();
    const [a,r] = await Promise.all([
      db.from('attendances').select('amount,attended_at').gte('attended_at',start).lt('attended_at',end),
      db.from('appointments').select('id,amount,appointment_at,status').eq('status','concluido').gte('appointment_at',start).lt('appointment_at',end)
    ]);
    if(a.error || r.error) return;
    const attendances = a.data || [], appointments = r.data || [];
    const revenue = attendances.reduce((sum,x)=>sum+Number(x.amount||0),0) + appointments.reduce((sum,x)=>sum+Number(x.amount||0),0);
    const count = attendances.length + appointments.length;
    const totalEl = document.querySelector('.stats .stat:nth-child(1) strong');
    const countEl = document.querySelector('.stats .stat:nth-child(2) strong');
    const avgEl = document.querySelector('.stats .stat:nth-child(3) strong');
    if(totalEl) totalEl.textContent = money(revenue);
    if(countEl) countEl.textContent = String(count);
    if(avgEl) avgEl.textContent = money(count ? revenue/count : 0);
  }
  const observer = new MutationObserver(() => {
    const title = document.getElementById('title');
    if(title && title.textContent === 'Dashboard') setTimeout(refreshRevenue,100);
  });
  const content = document.getElementById('content');
  if(content) observer.observe(content,{childList:true,subtree:true});
  window.addEventListener('load',()=>setTimeout(refreshRevenue,700));
})();