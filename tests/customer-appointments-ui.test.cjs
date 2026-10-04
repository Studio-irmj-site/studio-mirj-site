const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const script=fs.readFileSync(require('node:path').join(__dirname,'../customer-appointments.js'),'utf8');
const token='booking1';
class Element{
 constructor(doc){this.doc=doc;this.nodes={};this.dataset={};this.value='';this.disabled=false;this.isConnected=false;}
 set innerHTML(html){this.html=html;this.nodes={};for(const match of html.matchAll(/<([a-z]+)\b([^>]*?)>/g)){const attrs=match[2],id=/id="([^"]+)"/.exec(attrs)?.[1],cls=/class="([^"]+)"/.exec(attrs)?.[1];if(id||cls==='customer-close'){const e=new Element(this.doc);e.id=id;e.className=cls;e.value=/value="([^"]*)"/.exec(attrs)?.[1]||'';e.disabled=/\bdisabled\b/.test(attrs);this.nodes[id||'.customer-close']=e;}}}
 get innerHTML(){return this.html||'';}
 querySelector(q){if(q==='[data-busy]')return Object.values(this.nodes).find(n=>n.dataset.busy)||Object.values(this.nodes).map(n=>n.querySelector(q)).find(Boolean)||null;return this.nodes[q.replace(/^#/,'')]||Object.values(this.nodes).map(n=>n.querySelector(q)).find(Boolean)||null;}
 querySelectorAll(){return [];}
 append(e){e.isConnected=true;this.nodes[e.id]=e;}
 remove(){this.isConnected=false;delete this.doc.body.nodes[this.id];}
 addEventListener(){}
 focus(){this.doc.activeElement=this;}
 getClientRects(){return [{}];}
 async click(){if(!this.disabled)return this.onclick?.();}
}
const tick=()=>new Promise(r=>setImmediate(r));
async function setup({can_manage=true,conflict=false}={}){
 const doc={createElement:()=>new Element(doc),getElementById:id=>doc.body.querySelector('#'+id)||doc.head.querySelector('#'+id),addEventListener(){},removeEventListener(){},querySelector(){return null;}};doc.body=new Element(doc);doc.head=new Element(doc);
 let appointment={id:'booking1',service_name:'Manicure <img src=x>',professional:'raquel',appointment_at:'2026-10-10T12:00:00Z',status:'agendado',request_status:'pendente',updated_at:'revision1',can_manage};const calls=[],updates=[];
 const win={addEventListener(){},SUPABASE_CONFIG:{url:'https://test.invalid',anonKey:'test'},location:{href:'https://site.example/studio/',pathname:'/studio/',search:''},StudioProfessionals:{label:p=>p==='raquel'?'Raquel':'Iarytsa'},localStorage:{getItem:()=>null,setItem(){}},navigator:{clipboard:{writeText(){}}}};
 const fetch=async(url,o)=>{const args=JSON.parse(o.body);calls.push({url,args});if(url.endsWith('get_account_appointment'))return{ok:true,json:async()=>appointment};if(url.endsWith('get_professional_available_slots'))return{ok:true,json:async()=>[{available_date:'2026-10-11',available_time:'10:00:00',professional:'raquel'},{available_date:'2026-10-11',available_time:'11:00:00',professional:'iarytsa'}]};updates.push(args);if(conflict)return{ok:false,text:async()=> 'HORARIO_INDISPONIVEL'};appointment={...appointment,status:args.p_action==='cancel'?'cancelado':'agendado',updated_at:'revision2',can_manage:args.p_action!=='cancel'};return{ok:true,json:async()=>appointment};};
 win.StudioCustomerAccount={requireLogin:async()=>true,client:{rpc:async(name,args)=>{const response=await fetch(name,{body:JSON.stringify(args)});return response.ok?{data:await response.json()}:{error:{message:await response.text()}};}}};
 vm.runInNewContext(script,{window:win,document:doc,URL,URLSearchParams,Intl,Date,Uint8Array,fetch});win.StudioCustomerAppointments.showReceipt(token);await tick();
 const el=id=>doc.getElementById(id);return{win,doc,el,calls,updates};
}
test('Cancel asks for confirmation; keeping the reservation never writes',async()=>{
 const s=await setup();assert.match(s.el('customerContent').innerHTML,/&lt;img/);await s.el('customerCancel').click();assert.equal(s.updates.length,0);await s.el('customerKeep').click();await tick();assert.equal(s.updates.length,0);assert.ok(s.el('customerEdit'));
 await s.el('customerCancel').click();await s.el('customerConfirm').click();assert.equal(s.updates.length,1);assert.equal(s.updates[0].p_action,'cancel');assert.equal(s.updates[0].p_expected_updated_at,'revision1');assert.equal(s.updates[0].p_appointment_id,token);assert.ok(s.el('customerNew'));assert.equal(s.el('customerEdit'),null);
});
test('Reschedule lists only the original professional and writes only after review',async()=>{
 const s=await setup();await s.el('customerEdit').click();await tick();const d=s.el('customerDate');d.value='2026-10-11';d.onchange();const t=s.el('customerTime');assert.match(t.innerHTML,/10:00/);assert.doesNotMatch(t.innerHTML,/11:00/);t.value='10:00';t.onchange();await s.el('customerReview').click();assert.equal(s.updates.length,0);await s.el('customerConfirm').click();assert.equal(s.updates.length,1);assert.equal(s.updates[0].p_action,'reschedule');assert.equal(s.updates[0].p_available_date,'2026-10-11');assert.equal(s.updates[0].p_available_time,'10:00:00');
});
test('Slot conflict stays in confirmation and explains original reservation remains',async()=>{
 const s=await setup({conflict:true});await s.el('customerEdit').click();await tick();s.el('customerDate').value='2026-10-11';s.el('customerDate').onchange();s.el('customerTime').value='10:00';s.el('customerTime').onchange();await s.el('customerReview').click();await s.el('customerConfirm').click();assert.match(s.el('customerChangeError').textContent,/horário anterior foi mantido/);assert.equal(s.el('customerConfirm').disabled,false);assert.equal(s.updates.length,1);
});
test('Noneditable appointments expose no cancel or reschedule actions',async()=>{
 const s=await setup({can_manage:false});assert.equal(s.el('customerCancel'),null);assert.equal(s.el('customerEdit'),null);assert.equal(s.updates.length,0);
});
