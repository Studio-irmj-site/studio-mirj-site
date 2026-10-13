(function(root){
  'use strict';
  const today=()=>{const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());return ['year','month','day'].map(k=>parts.find(p=>p.type===k).value).join('-');};
  function match(p,id,date,professional){return Boolean(p.active&&p.service_id===id&&date&&p.start_date<=date&&p.end_date>=date&&p.end_date>=today()&&(!p.professional||p.professional===professional));}
  function priced(items,rows,date,professional){return items.map(item=>{const base=Number(item.basePrice??item.price);const promo=rows.filter(p=>match(p,item.id,date,professional)&&Number(p.price)<base).sort((a,b)=>Number(a.price)-Number(b.price)||String(a.id).localeCompare(String(b.id)))[0];return {...item,basePrice:base,price:promo?Number(promo.price):base,promotion:promo?promo.title:''};});}
  function highlightLabel(p,day=today()){
    if(p.start_date===p.end_date)return p.start_date===day?'Promoção do dia':'Dia promocional';
    const days=Math.round((Date.parse(p.end_date+'T12:00:00Z')-Date.parse(p.start_date+'T12:00:00Z'))/86400000)+1;
    return days<=7?'Semana promocional':'Período promocional';
  }
  function featured(rows,day=today()){
    const rank=p=>p.start_date===day&&p.end_date===day?0:p.start_date<=day&&p.end_date>=day?1:2;
    return [...rows].filter(p=>p.active&&p.end_date>=day).sort((a,b)=>rank(a)-rank(b)||a.start_date.localeCompare(b.start_date)||String(a.id).localeCompare(String(b.id)))[0]||null;
  }
  const api={today,match,priced,highlightLabel,featured};root.IRPromotionRules=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
