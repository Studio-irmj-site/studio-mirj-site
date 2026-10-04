const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const script=fs.readFileSync(require('node:path').join(__dirname,'../customer-account.js'),'utf8');
class E {
 constructor(doc){this.doc=doc;this.nodes={};this.value='';this.checked=false;this.events={};this.disabled=false;}
 set innerHTML(html){this.html=html;this.nodes={};for(const m of html.matchAll(/<([a-z]+)\b([^>]*?)>/g)){const a=m[2],id=/id="([^"]+)"/.exec(a)?.[1],cls=/class="([^"]+)"/.exec(a)?.[1];if(id||cls==='account-close'){const e=new E(this.doc);e.id=id;e.value=/value="([^"]*)"/.exec(a)?.[1]||'';this.nodes[id||'.account-close']=e;}}}
 get innerHTML(){return this.html||'';}
 querySelector(q){if(q==='input')return Object.values(this.nodes).find(e=>e.id?.startsWith('account')&&!['accountForm','accountSubmit','accountError'].includes(e.id));return this.nodes[q.replace(/^#/,'')]||Object.values(this.nodes).map(n=>n.querySelector(q)).find(Boolean)||null;}
 querySelectorAll(){return [];}
 append(e){this.nodes[e.id]=e;}
 remove(){delete this.doc.body.nodes[this.id];}
 addEventListener(type,fn){this.events[type]=fn;}
 click(){return (this.onclick||this.events.click)?.();}
 focus(){this.doc.activeElement=this;}
}
function setup({verified=true,signed=false}={}){
 const memory=()=>{const m=new Map();return {getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k),m};};const local=memory(),session=memory(),calls=[];
 const doc={createElement:()=>new E(doc),getElementById:id=>doc.body.querySelector('#'+id)||doc.head.querySelector('#'+id),addEventListener(){},removeEventListener(){}};doc.body=new E(doc);doc.head=new E(doc);
 let user=signed?{id:'customer-a',email_confirmed_at:verified?'confirmed':null,user_metadata:{}}:null,options;
 const sdk={auth:{getSession:async()=>({data:{session:null}}),getUser:async()=>({data:{user}}),onAuthStateChange(fn){this.callback=fn;},signInWithPassword:async args=>{calls.push({method:'login',args});user={id:'customer-a',email_confirmed_at:'confirmed'};options.auth.storage.setItem(options.auth.storageKey,JSON.stringify({access_token:'access',refresh_token:'refresh'}));return{data:{user}};},signUp:async args=>{calls.push({method:'signup',args});return{data:{session:null}};},resetPasswordForEmail:async(email,opts)=>{calls.push({method:'recovery',email,opts});return{};},signOut:async()=>{user=null;return{};},updateUser:async()=>({})},from(){return{select(){return this;},eq(){return this;},maybeSingle:async()=>({data:{full_name:'Marina Silva',phone:'5511999990000'}}),upsert:async args=>{calls.push({method:'profile',args});return{};}};}};
 const win={SUPABASE_CONFIG:{url:'https://test.invalid',anonKey:'public'},location:{href:'https://site.example/studio/'},localStorage:local,sessionStorage:session,supabase:{createClient(url,key,opts){options=opts;return sdk;}},dispatchEvent(){}};
 vm.runInNewContext(script,{window:win,document:doc,URL,Promise,Event,queueMicrotask});return{api:win.StudioCustomerAccount,el:id=>doc.getElementById(id),local,session,calls,options,sdk};
}
test('Sign-in keeps tokens in session storage by default and never stores the password',async()=>{
 const s=setup();s.api.open();s.el('accountEmail').value='marina@example.com';s.el('accountPassword').value='secret-password';await s.el('accountForm').onsubmit({preventDefault(){}});
 assert.equal(s.calls[0].method,'login');assert.equal(s.local.m.size,0);assert.equal(s.session.m.size,1);assert.doesNotMatch([...s.session.m.values()][0],/secret-password/);assert.equal(s.api.getCachedProfile().name,'Marina Silva');
});
test('Keeping connected is explicit and uses a separate customer storage key',async()=>{
 const s=setup();s.api.open();s.el('accountEmail').value='marina@example.com';s.el('accountPassword').value='secret-password';s.el('accountRemember').checked=true;await s.el('accountForm').onsubmit({preventDefault(){}});
 assert.equal(s.local.m.size,1);assert.equal(s.options.auth.storageKey,'espaco-ir.customer-auth.v1');assert.equal(s.session.m.size,0);await s.api.signOut();assert.equal(s.local.m.size,0);assert.equal(s.api.getCachedProfile(),null);
});
test('Signup asks for email confirmation and sends contact only as profile metadata',async()=>{
 const s=setup();s.api.open('signup');s.el('accountName').value='Marina Silva';s.el('accountPhone').value='(11) 99999-0000';s.el('accountEmail').value='marina@example.com';s.el('accountPassword').value='secret-password';await s.el('accountForm').onsubmit({preventDefault(){}});
 assert.equal(s.calls[0].method,'signup');assert.equal(s.calls[0].args.options.data.phone,'5511999990000');assert.equal(s.calls[0].args.options.emailRedirectTo,'https://site.example/studio/');assert.match(s.el('accountContent').innerHTML,/Confirme seu e-mail/);assert.equal(s.api.getCachedProfile(),null);
});
test('Unverified email never loads the customer profile',async()=>{
 const s=setup({signed:true,verified:false});assert.equal(await s.api.getProfile(),null);assert.equal(s.calls.length,0);
});
test('Password recovery uses the site return URL and a neutral success message',async()=>{
 const s=setup();s.api.open('recover');s.el('accountEmail').value='marina@example.com';await s.el('accountForm').onsubmit({preventDefault(){}});
 assert.equal(s.calls[0].method,'recovery');assert.equal(s.calls[0].opts.redirectTo,'https://site.example/studio/');assert.match(s.el('accountContent').innerHTML,/Se houver uma conta/);
});
