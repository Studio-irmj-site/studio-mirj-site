(()=>{
 'use strict';const cfg=window.SUPABASE_CONFIG||{},rules=window.IRPromotionRules;let rows=[],services=[],ready=false,loading=null;
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));const money=v=>Number(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});const date=v=>new Date(v+'T12:00:00').toLocaleDateString('pt-BR');
 async function read(path){const r=await fetch(cfg.url+'/rest/v1/'+path,{headers:{apikey:cfg.anonKey,Authorization:'Bearer '+cfg.anonKey},cache:'no-store'});if(!r.ok)throw Error('Não foi possível atualizar as promoções. Tente novamente.');return r.json();}
 async function load(){if(loading)return loading;loading=(async()=>{const data=await Promise.all([read('service_promotions?select=id,title,service_id,price,start_date,end_date,professional,active&order=start_date.asc'),read('services?select=id,name,price&active=eq.true')]);rows=data[0];services=data[1];ready=true;render();window.dispatchEvent(new Event('ir-promotions-updated'));return rows;})().finally(()=>loading=null);return loading;}
 function price(items,date,professional){return rules.priced(items,rows,date,professional);}
 function labelDate(d,items,professional){return rows.some(p=>items.some(i=>rules.match(p,i.id,d,professional==='any'?(p.professional||'raquel'):professional)&&Number(p.price)<Number(i.basePrice??i.price)))?' ✦ Promoção':'';}
 const period=p=>p.start_date===p.end_date?date(p.start_date):date(p.start_date)+' a '+date(p.end_date);
 const professional=p=>p.professional==='raquel'?'Raquel':p.professional==='iarytsa'?'Iarytsa':'Raquel e Iarytsa';
 function promoCard(p,featured=false){
  const s=services.find(x=>x.id===p.service_id);
  if(featured)return '<article class="ir-promo-spotlight"><div class="ir-promo-spotlight__copy"><span class="ir-promo-spotlight__badge">✦ '+esc((p.start_date>rules.today()?'Em breve · ':'')+rules.highlightLabel(p))+'</span><span class="ir-promo-spotlight__dates">'+esc(period(p))+'</span><h2>'+esc(p.title)+'</h2><p>'+esc(s.name)+' <span>· '+professional(p)+'</span></p><small>Válido para atendimentos nas datas da promoção, conforme disponibilidade.</small></div><div class="ir-promo-spotlight__offer"><span class="ir-promo-spotlight__old">De <del>'+money(s.price)+'</del></span><strong>'+money(p.price)+'</strong><button type="button" data-promo-service="'+esc(p.service_id)+'" data-promo-book="true">Ver horários <span aria-hidden="true">↗</span></button></div></article>';
  return '<article class="ir-promo-card"><span class="ir-promo-date">'+esc(period(p))+'</span><h3>'+esc(p.title)+'</h3><p>'+esc(s.name)+' · '+professional(p)+'</p><div><del>'+money(s.price)+'</del> <strong>'+money(p.price)+'</strong></div><small>Válido para atendimentos nas datas indicadas, conforme horários disponíveis.</small><button type="button" data-promo-service="'+esc(p.service_id)+'">Escolher serviço</button></article>';
 }
 async function selectPromoService(button){
  if(button.disabled)return;button.disabled=true;
  try{
   window.IR_NAV?.openPage('servicos');
   if(typeof window.activateCategory==='function')window.activateCategory('Todos');
   const selector='.service-card[data-service-id="'+button.dataset.promoService+'"]';
   let selected=document.querySelector(selector);
   if(!selected&&typeof window.loadServices==='function'){await window.loadServices();selected=document.querySelector(selector);}
   if(!selected)return;
   if(selected.getAttribute('aria-pressed')!=='true')selected.click();
   if(button.dataset.promoBook==='true')document.querySelector('#ctaButton')?.click();
   else selected.scrollIntoView({behavior:'smooth',block:'center'});
  }finally{button.disabled=false;}
 }
 function render(){
  const eligible=rows.filter(p=>p.active&&p.end_date>=rules.today()&&services.some(s=>s.id===p.service_id&&Number(p.price)<Number(s.price)));
  document.querySelectorAll('[data-promotions]').forEach(host=>{
   host.hidden=!eligible.length;
   if(host.hasAttribute('data-promotion-home')){
    const main=rules.featured(eligible),rest=eligible.filter(p=>p.id!==main?.id);
    host.innerHTML=main?promoCard(main,true)+(rest.length?'<details class="ir-promo-more"><summary>Mais '+rest.length+' '+(rest.length===1?'promoção':'promoções')+'</summary><div class="ir-promo-grid">'+rest.map(p=>promoCard(p)).join('')+'</div></details>':''):'';
   }else host.innerHTML=eligible.length?'<div class="ir-promo-heading"><span>DIAS ESPECIAIS</span><h2>Promoções do Espaço</h2></div><div class="ir-promo-grid">'+eligible.map(p=>promoCard(p)).join('')+'</div>':'';
   host.querySelectorAll('[data-promo-service]').forEach(button=>button.onclick=()=>selectPromoService(button));
  });
 }
 window.IRPromotions={load,price,labelDate,get ready(){return ready;},get services(){return services;}};
 load().catch(()=>{});setInterval(()=>{if(!document.hidden)load().catch(()=>{});},60000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)load().catch(()=>{});});
})();
