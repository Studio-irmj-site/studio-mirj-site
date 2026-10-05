(function(root){'use strict';
function filter(rows,options){return rows.filter(row=>{
 if(options.date){if(row.available_date!==options.date)return false;}
 else if(options.period==='today'&&row.available_date!==options.today)return false;
 else if(options.period==='week'){const end=new Date(options.today+'T12:00:00Z');end.setUTCDate(end.getUTCDate()+6);if(row.available_date<options.today||row.available_date>end.toISOString().slice(0,10))return false;}
 else if(options.period==='upcoming'&&row.available_date<options.today)return false;
 else if(options.period==='past'&&row.available_date>=options.today)return false;
 if(options.professional==='shared'&&row.professional)return false;
 if(['raquel','iarytsa'].includes(options.professional)&&row.professional&&row.professional!==options.professional)return false;
 if(options.status==='active'&&!row.active)return false;
 if(options.status==='blocked'&&row.active)return false;
 return true;
}).sort((a,b)=>a.available_date.localeCompare(b.available_date)||String(a.available_time).localeCompare(String(b.available_time))||String(a.professional||'').localeCompare(String(b.professional||'')));}
function group(rows){const days=new Map();for(const row of rows){if(!days.has(row.available_date))days.set(row.available_date,[]);days.get(row.available_date).push(row);}return [...days.entries()];}
function summary(rows){return {days:new Set(rows.map(row=>row.available_date)).size,active:rows.filter(row=>row.active).length,blocked:rows.filter(row=>!row.active).length};}
const api={filter,group,summary};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.AvailabilityView=api;
})(typeof window!=='undefined'?window:globalThis);
