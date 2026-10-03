(function(root){'use strict';
const values=['raquel','iarytsa'];
const label=value=>value==='raquel'?'Raquel':value==='iarytsa'?'Iarytsa':'Sem profissional definida (horário compartilhado)';
const expand=value=>value==='both'?values:value&&values.includes(value)?[value]:[];
const conflicts=(a,b)=>!a.professional||!b.professional||a.professional===b.professional;
const api={values,label,expand,conflicts};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.StudioProfessionals=api;
})(typeof window!=='undefined'?window:globalThis);
