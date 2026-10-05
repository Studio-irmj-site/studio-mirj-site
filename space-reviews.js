(() => {
 'use strict';
 const root=document.getElementById('spaceReviews'),panel=document.getElementById('page-espaco');
 if(!root||!panel)return;
 const api=window.IRReviews,cfg=window.SUPABASE_CONFIG||{};
 let items=[],total=0,average=null,busy=false,loaded=false,failed=false;
 const date=value=>new Date(value).toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo'});
 function render() {
  const summary=total ? '<div class="space-review-summary"><strong>'+Number(average).toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+' <small>/ 5</small></strong><span>'+total+' '+(total===1?'avaliação publicada':'avaliações publicadas')+'</span></div>' : '';
  const cards=items.map(item=>'<article class="space-review-card"><div class="space-review-card-head"><span class="space-review-stars" role="img" aria-label="'+Number(item.rating)+' de 5 estrelas">'+api.stars(item.rating)+'</span><time datetime="'+api.esc(item.reviewed_at)+'">'+api.esc(date(item.reviewed_at))+'</time></div>'+(item.comment?'<p class="space-review-comment">'+api.esc(item.comment)+'</p>':'<p class="space-review-no-comment">Avaliação enviada sem comentário.</p>')+'<small>Cliente com atendimento realizado</small></article>').join('');
  root.innerHTML=summary+'<div class="space-review-list">'+cards+'</div>'+
   (loaded&&!total?'<p class="space-review-empty">Ainda não há avaliações públicas. Após seu atendimento, compartilhe sua experiência pelo link recebido do Espaço I.R.</p>':'')+
   (failed?'<p class="review-error" role="alert">Não foi possível carregar as avaliações. Tente novamente.</p>':'')+
   (busy?'<p role="status">Carregando avaliações…</p>':'')+
   (!busy&&(failed||items.length<total)?'<button id="spaceReviewsMore" type="button" class="space-review-button">'+(failed?'Tentar novamente':'Ver mais avaliações')+'</button>':'');
  root.setAttribute('aria-busy',String(busy));
  root.querySelector('#spaceReviewsMore')?.addEventListener('click',()=>load());
 }
 async function load() {
  if(busy)return;
  busy=true;failed=false;render();
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),20000);
  try {
   if(!cfg.url||!cfg.anonKey)throw new Error('CONFIGURACAO');
   const response=await fetch(cfg.url+'/rest/v1/rpc/list_public_service_reviews',{method:'POST',headers:{apikey:cfg.anonKey,'Content-Type':'application/json'},body:JSON.stringify({p_offset:items.length}),signal:controller.signal});
   if(!response.ok)throw new Error('CARREGAMENTO');
   const data=await response.json();
   if(!Array.isArray(data.items))throw new Error('RESPOSTA');
   items=items.concat(data.items);total=Number(data.total)||0;average=data.average;loaded=true;
  } catch {failed=true;} finally {clearTimeout(timeout);busy=false;render();}
 }
 const ensureLoaded=()=>{if(panel.classList.contains('is-active')&&!loaded&&!busy)load();};
 new MutationObserver(ensureLoaded).observe(panel,{attributes:true,attributeFilter:['class']});
 window.addEventListener('ir-review-submitted',()=>{items=[];total=0;average=null;loaded=false;render();ensureLoaded();});
 ensureLoaded();
})();
