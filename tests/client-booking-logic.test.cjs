const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const script=fs.readFileSync(path.resolve(__dirname,'../quote-register.js'),'utf8');
const slots=[{available_date:'2026-10-10',available_time:'09:00:00',professional:'raquel'},{available_date:'2026-10-10',available_time:'09:00:00',professional:'iarytsa'},{available_date:'2026-10-10',available_time:'10:00:00',professional:'iarytsa'}];
class Element {
 constructor(doc){this.doc=doc;this.events={};this.value='';this.hidden=false;this.disabled=false;this.children=[];this.textContent='';this.dataset={};}
 addEventListener(type,fn){this.events[type]=fn;}
 async fire(type){return this.events[type]?.({preventDefault(){},target:this});}
 set innerHTML(html){this.html=html;if(html.includes('<option')){this.options=[...html.matchAll(/<option value="([^"]*)">/g)].map(m=>m[1]);this.value=this.options[0]||'';}for(const m of html.matchAll(/id="([^"]+)"/g)){const el=this.doc.elements[m[1]]??=new Element(this.doc);if(m[1]==='requestReview')el.hidden=true;}}
 get innerHTML(){return this.html||'';}
 querySelector(q){return this.doc.querySelector(q);}
 querySelectorAll(){return [];}
 replaceChildren(){this.children=[];}
 append(el){this.children.push(el);}
 remove(){delete this.doc.elements[this.id];}
 focus(){this.doc.activeElement=this;}
 getClientRects(){return this.hidden?[]:[{}];}
 getAttribute(){return '';}
}
async function setup(rows=slots,conflict=false,memory=new Map()){
 const doc={elements:{},activeElement:null,querySelector(q){return this.elements[q.startsWith('#')?q.slice(1):q]||null;},createElement(){return new Element(this);}};
 doc.body=new Element(doc);doc.head=new Element(doc);
 const cta=doc.elements.ctaButton=new Element(doc);
 const card={dataset:{serviceId:'service-test'},querySelector:q=>({textContent:q.includes('copy')?'Manicure':'R$ 50,00'})};
 doc.querySelectorAll=()=>[card];
 const fields=doc.elements['.request-grid']=new Element(doc);
 const calls=[],opened=[];
 const win={SUPABASE_CONFIG:{url:'https://test.invalid',anonKey:'test'},StudioProfessionals:require('../professionals.js'),open(url){opened.push(decodeURIComponent(url));return {};}};
 win.StudioCustomerContact=require('../customer-contact.js').create(()=>({getItem:key=>memory.get(key)||null,setItem:(key,value)=>memory.set(key,value),removeItem:key=>memory.delete(key)}));
 const context={window:win,document:doc,Intl,Date,console,fetch:async(url,options)=>url.endsWith('get_professional_available_slots')?{ok:true,json:async()=>rows}:{ok:!conflict,text:async()=> 'HORARIO_INDISPONIVEL',...calls.push(JSON.parse(options.body))}};
 vm.runInNewContext(script,context);await cta.fire('click');await new Promise(resolve=>setImmediate(resolve));
 const el=id=>doc.elements[id];if(!el('requestName').value){el('requestName').value='Cliente teste';el('requestPhone').value='11999999999';}
 const choose=async(id,value)=>{el(id).value=value;await el(id).fire('change');};
 const submit=()=>el('appointmentRequestForm').fire('submit');
 return {el,choose,submit,calls,opened,fields,memory};
}
test('No write before review; any preference deduplicates slots and submits the displayed professional',async()=>{
 const s=await setup();await s.choose('requestProfessional','any');await s.choose('requestDate','2026-10-10');
 assert.deepEqual(s.el('requestTime').options,['','09:00','10:00']);
 s.el('requestTime').value='10:00';s.el('requestNotes').value='<img src=x>';
 await s.submit();assert.equal(s.calls.length,0);assert.match(s.el('requestReview').innerHTML,/Iarytsa/);assert.match(s.el('requestReview').innerHTML,/&lt;img/);assert.doesNotMatch(s.el('requestReview').innerHTML,/<img/);
 await s.submit();assert.equal(s.calls.length,1);assert.equal(s.calls[0].p_professional,'iarytsa');assert.match(s.opened[0],/Aguardando confirmação/);
});
test('Specific professional filters slots; changing preference clears date and time',async()=>{
 const s=await setup();await s.choose('requestProfessional','raquel');await s.choose('requestDate','2026-10-10');assert.deepEqual(s.el('requestTime').options,['','09:00']);
 s.el('requestTime').value='09:00';await s.choose('requestProfessional','iarytsa');assert.equal(s.el('requestDate').value,'');assert.equal(s.el('requestTime').value,'');
});
test('Back to edit requires a new review',async()=>{
 const s=await setup();await s.choose('requestProfessional','raquel');await s.submit();assert.equal(s.fields.hidden,true);await s.el('requestCancel').fire('click');assert.equal(s.fields.hidden,false);await s.submit();assert.equal(s.calls.length,0);assert.equal(s.el('requestReview').hidden,false);
});
test('No slots still permits WhatsApp consultation without a database write',async()=>{
 const s=await setup([]);await s.choose('requestProfessional','any');await s.submit();await s.submit();assert.equal(s.calls.length,0);assert.match(s.opened[0],/sem reserva de horário/);assert.match(s.opened[0],/Sem preferência/);
});
test('Conflict returns to editing without retrying or sending WhatsApp',async()=>{
 const s=await setup(slots,true);await s.choose('requestProfessional','any');await s.choose('requestDate','2026-10-10');s.el('requestTime').value='10:00';await s.submit();await s.submit();assert.equal(s.calls.length,1);assert.equal(s.opened.length,0);assert.equal(s.fields.hidden,false);assert.match(s.el('requestError').textContent,/acabou de ser reservado/);
});
test('Incomplete date/time and invalid phone are rejected before review',async()=>{
 const s=await setup();await s.choose('requestProfessional','raquel');await s.choose('requestDate','2026-10-10');await s.submit();assert.match(s.el('requestError').textContent,/Escolha data e horário juntos/);s.el('requestPhone').value='abc';await s.submit();assert.match(s.el('requestError').textContent,/WhatsApp válido/);assert.equal(s.calls.length,0);
});
test('Contact is saved only with opt-in; next visit restores identity but leaves professional and time unselected',async()=>{
 const memory=new Map();const first=await setup(slots,false,memory);await first.choose('requestProfessional','any');await first.submit();assert.equal(memory.size,0);
 await first.el('requestCancel').fire('click');first.el('requestRemember').checked=true;await first.submit();assert.equal(memory.size,1);
 const next=await setup(slots,false,memory);assert.equal(next.el('requestSavedContact').hidden,false);assert.equal(next.el('requestNameField').hidden,true);assert.equal(next.el('requestName').value,'Cliente teste');assert.equal(next.el('requestProfessional').value,'');assert.equal(next.el('requestDate').value,'');
});
test('Returning customer can edit then forget contact, clearing the form and subsequent visits',async()=>{
 const memory=new Map();require('../customer-contact.js').create(()=>({setItem:(k,v)=>memory.set(k,v)})).write({name:'Marina Silva',phone:'11999990000'});
 const s=await setup(slots,false,memory);await s.el('requestEditContact').fire('click');assert.equal(s.el('requestNameField').hidden,false);s.el('requestName').value='Marina Santos';await s.choose('requestProfessional','any');await s.submit();assert.match(s.el('requestSavedName').textContent,/Marina Santos/);
 await s.el('requestCancel').fire('click');await s.el('requestForgetContact').fire('click');assert.equal(memory.size,0);assert.equal(s.el('requestName').value,'');assert.equal(s.el('requestPhone').value,'');assert.equal(s.el('requestRemember').checked,false);
});
