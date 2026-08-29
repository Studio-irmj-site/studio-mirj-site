(()=>{'use strict';
const $=id=>document.getElementById(id);
let lastList=null;
function enhance(){
 const list=$('appointmentList'), filter=$('dateFilter');
 if(!list||!filter||lastList===list)return;
 lastList=list;
 const toolbar=filter.parentElement;
 if(toolbar&&!toolbar.querySelector('#agendaDayLabel')){
  const label=document.createElement('span'); label.id='agendaDayLabel'; label.className='empty'; label.style.marginLeft='10px';
  toolbar.appendChild(label);
 }
 render();
}
function render(){
 const list=$('appointmentList'), filter=$('dateFilter'), label=$('agendaDayLabel'); if(!list||!filter)return;
 const d=filter.value?new Date(filter.value+'T12:00:00'):new Date();
 if(label)label.textContent='Agenda do dia: '+d.toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'2-digit',year:'numeric'});
 const rows=[...list.querySelectorAll('.service')];
 rows.sort((a,b)=>{const ta=a.querySelector('.empty')?.textContent||'',tb=b.querySelector('.empty')?.textContent||'';return ta.localeCompare(tb,'pt-BR')});
 rows.forEach(r=>list.appendChild(r));
}
const obs=new MutationObserver(()=>{enhance();render()});
obs.observe(document.body,{childList:true,subtree:true});
document.addEventListener('change',e=>{if(e.target?.id==='dateFilter')setTimeout(render,50)});
window.addEventListener('load',enhance);
})();