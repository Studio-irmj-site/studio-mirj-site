(function(root){
'use strict';
function minutes(value){if(!/^\d{2}:\d{2}$/.test(value))throw new Error('Informe horários válidos.');const [h,m]=value.split(':').map(Number);if(h>23||m>59)throw new Error('Informe horários válidos.');return h*60+m;}
function date(value){if(!/^\d{4}-\d{2}-\d{2}$/.test(value))throw new Error('Informe uma data válida.');const d=new Date(value+'T12:00:00Z');if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==value)throw new Error('Informe uma data válida.');return d;}
function generate(o){
 const start=minutes(o.start),end=minutes(o.end),step=Number(o.interval);
 if(end<=start)throw new Error('O fim deve ser depois do início.');
 if(!Number.isInteger(step)||step<1||step>720)throw new Error('Use um intervalo de 1 a 720 minutos.');
 let pauseStart,pauseEnd;
 if(o.pause){pauseStart=minutes(o.pauseStart);pauseEnd=minutes(o.pauseEnd);if(pauseEnd<=pauseStart||pauseStart<start||pauseEnd>end)throw new Error('A pausa deve estar dentro do expediente, com fim após o início.');}
 const first=date(o.date),last=o.repeat?date(o.until):first;
 if(last<first||last-first>365*86400000)throw new Error('Selecione um período de até 366 dias, a partir do dia inicial.');
 if(o.repeat&&(!o.weekdays?.length||o.weekdays.some(v=>!Number.isInteger(v)||v<0||v>6)))throw new Error('Selecione pelo menos um dia da semana.');
 const times=[];for(let t=start;t<end;t+=step){if(o.pause&&t>=pauseStart&&t<pauseEnd)continue;times.push(String(Math.floor(t/60)).padStart(2,'0')+':'+String(t%60).padStart(2,'0')+':00');}
 if(!times.length)throw new Error('Essa configuração não gera horários.');
 const rows=[];for(let d=new Date(first);d<=last;d.setUTCDate(d.getUTCDate()+1)){if(o.repeat&&!o.weekdays.includes(d.getUTCDay()))continue;for(const time of times)rows.push({available_date:d.toISOString().slice(0,10),available_time:time,active:true});}
 if(!rows.length)throw new Error('Nenhum dia selecionado existe nesse período.');
 if(rows.length>2000)throw new Error('Gere até 2.000 horários por vez. Reduza o período.');
 return rows;
}
const key=r=>r.available_date+'|'+String(r.available_time).slice(0,5);
function pending(rows,existing){const keys=new Set(existing.map(key));return rows.filter(r=>{const k=key(r);if(keys.has(k))return false;keys.add(k);return true;});}
const api={generate,pending};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.AvailabilityGenerator=api;
})(typeof window!=='undefined'?window:globalThis);
