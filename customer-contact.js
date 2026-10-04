(function(root){'use strict';
 const KEY='espaco-ir.customer-contact.v1';
 function valid(contact){return contact&&typeof contact.name==='string'&&typeof contact.phone==='string'&&contact.name.trim().length>=2&&contact.name.trim().length<=80&&/^(?:\d{10,11}|55\d{10,11})$/.test(contact.phone);}
 function create(getStorage){
  return {
   read(){try{const stored=JSON.parse(getStorage().getItem(KEY)||'null');return stored?.version===1&&valid(stored)?{name:stored.name.trim(),phone:stored.phone}:null;}catch{return null;}},
   write(contact){if(!valid(contact))return false;try{getStorage().setItem(KEY,JSON.stringify({version:1,name:contact.name.trim(),phone:contact.phone}));return true;}catch{return false;}},
   clear(){try{getStorage().removeItem(KEY);return true;}catch{return false;}}
  };
 }
 const api={create};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.StudioCustomerContact=create(()=>root.localStorage);
})(typeof window!=='undefined'?window:globalThis);
