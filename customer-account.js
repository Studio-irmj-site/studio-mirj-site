(() => {
  'use strict';
  const cfg=window.SUPABASE_CONFIG||{},KEY='espaco-ir.customer-auth.v1';
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let remember=false,memory=null,profile=null,pendingRecovery=false;
  function stored(){try{return window.localStorage.getItem(KEY)||window.sessionStorage.getItem(KEY)||memory;}catch{return memory;}}
  try{remember=Boolean(window.localStorage.getItem(KEY));}catch{}
  const storage={getItem:stored,setItem(key,value){memory=value;try{window.localStorage.removeItem(KEY);window.sessionStorage.removeItem(KEY);(remember?window.localStorage:window.sessionStorage).setItem(KEY,value);}catch{}},removeItem(){memory=null;try{window.localStorage.removeItem(KEY);window.sessionStorage.removeItem(KEY);}catch{}}};
  const client=window.supabase?.createClient(cfg.url,cfg.anonKey,{auth:{storageKey:KEY,storage,persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  const home=()=>new URL('./',window.location.href).href;
  function cleanPhone(value){const digits=String(value||'').replace(/\D/g,'');return digits.length===10||digits.length===11?'55'+digits:digits;}
  function validContact(name,phone){return name.trim().length>=2&&name.trim().length<=80&&/^55\d{10,11}$/.test(phone);}
  function errorMessage(error){const detail=error?.message||'';return /invalid login credentials/i.test(detail)?'E-mail ou senha incorretos.':/email not confirmed/i.test(detail)?'Confirme seu e-mail antes de entrar.':/rate limit|too many requests/i.test(detail)?'Muitas tentativas. Aguarde um pouco e tente novamente.':/email address not authorized|email.*sending|smtp|sending confirmation/i.test(detail)?'O cadastro por e-mail está temporariamente indisponível. Fale com o espaço.':'Não foi possível concluir. Confira os dados e tente novamente.';}
  async function getProfile(){
    if(!client)return null;
    const {data,error}=await client.auth.getUser();if(error||!data?.user){profile=null;return null;}
    const user=data.user;
    if(!user.email_confirmed_at||user.is_anonymous){profile=null;return null;}
    const response=await client.from('customer_profiles').select('full_name,phone').eq('user_id',user.id).maybeSingle();
    if(response.error)throw response.error;
    if(response.data)profile={name:response.data.full_name,phone:response.data.phone};
    else {const name=String(user.user_metadata?.full_name||'').trim(),phone=cleanPhone(user.user_metadata?.phone);
      if(!validContact(name,phone)){profile=null;return null;}
      const saved=await client.from('customer_profiles').upsert({user_id:user.id,full_name:name,phone});if(saved.error)throw saved.error;profile={name,phone};
    }
    return profile;
  }
  function style(){if(document.getElementById('customer-account-style'))return;const node=document.createElement('style');node.id='customer-account-style';node.textContent=`.customer-appointments-button{border:1px solid #d8c4d2;background:#fff;color:#4b1630;border-radius:12px;padding:10px 14px;font:inherit;font-size:12px;min-height:44px}.site-header__inner{flex-wrap:wrap}.account-modal{position:fixed;inset:0;z-index:10010;padding:18px;display:grid;place-items:center;background:rgba(49,20,32,.58);backdrop-filter:blur(7px)}.account-dialog{box-sizing:border-box;width:min(440px,100%);max-height:90vh;overflow:auto;padding:25px;border-radius:24px;background:#fff;color:#311420}.account-dialog h2{font:600 27px 'Playfair Display',serif;color:#4b1630;margin:0 0 10px}.account-dialog p{font-size:14px;line-height:1.55;color:#785c68}.account-dialog label{display:block;font-size:13px;margin:16px 0}.account-dialog input:not([type=checkbox]){box-sizing:border-box;width:100%;display:block;padding:12px;margin-top:7px;border:1px solid #d8c4d2;border-radius:11px;background:#fff;color:#311420;font-size:16px}.account-dialog .account-check{display:flex;align-items:center;gap:8px}.account-dialog .account-check input{width:18px;height:18px;accent-color:#4b1630}.account-actions{display:flex;flex-direction:column;gap:10px;margin-top:18px}.account-dialog button{min-height:44px;padding:12px;border:1px solid #d8c4d2;border-radius:11px;background:#f8f2fa;color:#4b1630;font:inherit;font-size:13px}.account-dialog .account-primary{background:#4b1630;color:#fff}.account-dialog .account-close{float:right;margin-left:12px;padding:8px}.account-dialog .account-error{color:#a82448;min-height:20px}.account-dialog button:disabled{opacity:.55}.account-dialog :focus-visible{outline:3px solid #8b63c7;outline-offset:3px}`;document.head.append(node);}
  function open(mode='login'){
    if(document.getElementById('customerAccountModal'))return;
    style();const previous=document.activeElement,modal=document.createElement('div');modal.id='customerAccountModal';modal.className='account-modal';modal.innerHTML='<section class="account-dialog" role="dialog" aria-modal="true" aria-labelledby="accountTitle"><button class="account-close" type="button">Fechar</button><div id="accountContent" aria-live="polite"></div></section>';document.body.append(modal);
    const content=modal.querySelector('#accountContent');let busy=false;
    const close=()=>{if(busy)return;document.removeEventListener('keydown',key);modal.remove();previous?.focus();};
    const key=e=>{if(e.key==='Escape')close();if(e.key==='Tab'){const nodes=[...modal.querySelectorAll('button:not(:disabled),input')].filter(n=>n.getClientRects().length);const first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}};document.addEventListener('keydown',key);modal.querySelector('.account-close').onclick=close;
    function render(next){mode=next;const signup=mode==='signup',recovery=mode==='recover',changePassword=mode==='new-password',contact=mode==='profile';
      if(mode==='confirmed'){content.innerHTML='<h2 id="accountTitle">Confirme seu e-mail</h2><p>Abra a mensagem enviada ao seu e-mail para ativar a conta. Depois, volte ao site e entre.</p><div class="account-actions"><button id="accountLogin" type="button">Voltar ao login</button></div>';content.querySelector('#accountLogin').onclick=()=>render('login');return;}
      if(mode==='recovery-sent'){content.innerHTML='<h2 id="accountTitle">Confira seu e-mail</h2><p>Se houver uma conta com esse e-mail, você receberá as instruções para recuperar a senha.</p><div class="account-actions"><button id="accountLogin" type="button">Voltar ao login</button></div>';content.querySelector('#accountLogin').onclick=()=>render('login');return;}
      content.innerHTML=`<h2 id="accountTitle">${signup?'Criar minha conta':recovery?'Recuperar senha':changePassword?'Definir nova senha':contact?'Completar meus dados':'Área da cliente'}</h2><p>${signup?'Cadastre-se uma vez para agilizar seus próximos agendamentos.':recovery?'Informe seu e-mail para receber as instruções.':changePassword?'Escolha uma nova senha para sua conta.':contact?'Informe seu nome e WhatsApp para agendar.':'Entre para acompanhar e gerenciar seus agendamentos.'}</p><form id="accountForm">${signup||contact?'<label>Nome completo<input id="accountName" autocomplete="name" maxlength="80" required></label><label>WhatsApp<input id="accountPhone" autocomplete="tel" inputmode="tel" maxlength="20" required></label>':''}${!contact&&!changePassword?'<label>E-mail<input id="accountEmail" type="email" autocomplete="email" required></label>':''}${!contact&&!recovery?`<label>${changePassword?'Nova senha':'Senha'}<input id="accountPassword" type="password" autocomplete="${signup||changePassword?'new-password':'current-password'}" ${signup||changePassword?'minlength="8"':''} required></label>`:''}${mode==='login'?'<label class="account-check"><input id="accountRemember" type="checkbox">Manter conectado neste dispositivo</label>':''}<p id="accountError" class="account-error" role="alert"></p><div class="account-actions"><button id="accountSubmit" class="account-primary" type="submit">${signup?'Criar conta':recovery?'Enviar instruções':changePassword?'Salvar nova senha':contact?'Salvar meus dados':'Entrar'}</button>${mode==='login'?'<button id="accountSignup" type="button">Criar minha conta</button><button id="accountRecover" type="button">Esqueci minha senha</button>':!contact&&!changePassword?'<button id="accountLogin" type="button">Voltar ao login</button>':''}</div></form>`;
      content.querySelector('#accountSignup')?.addEventListener('click',()=>render('signup'));content.querySelector('#accountRecover')?.addEventListener('click',()=>render('recover'));content.querySelector('#accountLogin')?.addEventListener('click',()=>render('login'));
      content.querySelector('#accountForm').onsubmit=async e=>{e.preventDefault();if(busy)return;busy=true;const button=content.querySelector('#accountSubmit');button.disabled=true;const errorBox=content.querySelector('#accountError');errorBox.textContent='';
        try{
          if(!client)throw Error('Client unavailable');
          if(contact){const {data,error}=await client.auth.getUser();if(error||!data?.user)throw error||Error('Login required');const name=content.querySelector('#accountName').value.trim(),phone=cleanPhone(content.querySelector('#accountPhone').value);if(!validContact(name,phone)){errorBox.textContent='Preencha nome e WhatsApp válidos.';return;}const result=await client.from('customer_profiles').upsert({user_id:data.user.id,full_name:name,phone});if(result.error)throw result.error;profile={name,phone};busy=false;close();window.dispatchEvent(new Event('customer-account-ready'));return;}
          if(changePassword){const result=await client.auth.updateUser({password:content.querySelector('#accountPassword').value});if(result.error)throw result.error;pendingRecovery=false;busy=false;close();open('login');return;}
          const email=content.querySelector('#accountEmail').value.trim();
          if(recovery){const result=await client.auth.resetPasswordForEmail(email,{redirectTo:home()});if(result.error)throw result.error;render('recovery-sent');return;}
          const password=content.querySelector('#accountPassword').value;
          if(signup){const name=content.querySelector('#accountName').value.trim(),phone=cleanPhone(content.querySelector('#accountPhone').value);if(!validContact(name,phone)){errorBox.textContent='Preencha nome e WhatsApp válidos.';return;}const result=await client.auth.signUp({email,password,options:{emailRedirectTo:home(),data:{full_name:name,phone}}});if(result.error)throw result.error;if(!result.data.session){render('confirmed');return;}}
          else {remember=content.querySelector('#accountRemember').checked;const result=await client.auth.signInWithPassword({email,password});if(result.error)throw result.error;}
          if(!await getProfile()){render('profile');return;}busy=false;close();window.dispatchEvent(new Event('customer-account-ready'));
        }catch(error){errorBox.textContent=errorMessage(error);}finally{busy=false;button.disabled=false;}
      };content.querySelector('input')?.focus();
    }
    render(mode);
  }
  const ready=client?client.auth.getSession().then(()=>{}):Promise.resolve();
  client?.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT')profile=null;if(event==='PASSWORD_RECOVERY'){pendingRecovery=true;queueMicrotask(()=>open('new-password'));}});
  async function requireLogin(){await ready;try{if(pendingRecovery){open('new-password');return false;}if(await getProfile())return true;const {data}=client?await client.auth.getUser():{data:null};open(data?.user?'profile':'login');return false;}catch{open('login');return false;}}
  async function signOut(){if(!client)return;const result=await client.auth.signOut();if(result.error)throw result.error;profile=null;storage.removeItem();}
  window.StudioCustomerAccount={client,ready,getProfile,getCachedProfile:()=>profile,requireLogin,open,signOut,cleanPhone,validContact};
})();
