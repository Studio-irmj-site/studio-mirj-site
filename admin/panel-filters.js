(function(root){
 'use strict';
 const dateKey=value=>{const d=new Date(value);return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');};
 function appointments(rows,options={},now=new Date()){
  const today=dateKey(now);
  return rows.filter(row=>{
   const day=dateKey(row.appointment_at);
   if(options.date){if(day!==options.date)return false;}
   else if(options.period==='today'&&day!==today)return false;
   else if(options.period==='upcoming'&&day<today)return false;
   if(options.professional==='shared'&&row.professional)return false;
   if(['raquel','iarytsa'].includes(options.professional)&&row.professional&&row.professional!==options.professional)return false;
   if(options.status==='active'&&!['agendado','confirmado'].includes(row.status))return false;
   if(['concluido','cancelado'].includes(options.status)&&row.status!==options.status)return false;
   return true;
  });
 }
 function attendances(rows,options={},now=new Date()){
  const today=dateKey(now),search=(options.search||'').trim().toLocaleLowerCase('pt-BR');
  return rows.filter(row=>{
   const day=dateKey(row.attended_at);
   if(options.period==='today'&&day!==today)return false;
   if(options.period==='month'&&day.slice(0,7)!==today.slice(0,7))return false;
   return !search||String(row.client_name||'').toLocaleLowerCase('pt-BR').includes(search);
  });
 }
 const api={appointments,attendances};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.IRPanelFilters=api;
})(typeof window!=='undefined'?window:globalThis);
