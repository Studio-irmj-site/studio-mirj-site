(function(root){'use strict';
const values=['raquel','iarytsa'];
const label=value=>value==='raquel'?'Raquel':value==='iarytsa'?'Iarytsa':'Sem profissional definida (horário compartilhado)';
const expand=value=>value==='both'?values:value&&values.includes(value)?[value]:[];
const conflicts=(a,b)=>!a.professional||!b.professional||a.professional===b.professional;
const visibleSlots=(rows,preference)=>(rows||[]).filter(row=>values.includes(row.professional)&&(preference==='any'||row.professional===preference));
const resolveSlotProfessional=(rows,preference,date,time)=>{if(!date&&!time)return values.includes(preference)||preference==='any'?preference:'';if(!date||!time)return '';return visibleSlots(rows,preference).find(row=>row.available_date===date&&String(row.available_time).slice(0,5)===String(time).slice(0,5))?.professional||'';};
const api={values,label,expand,conflicts,visibleSlots,resolveSlotProfessional};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.StudioProfessionals=api;
})(typeof window!=='undefined'?window:globalThis);
