(() => {
  'use strict';
  const root=window;
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const labelDate=value=>new Date(value).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'short'});
  const status=a=>a.status==='cancelado'?'Cancelado':a.status==='concluido'?'Concluído':a.request_status==='recusado'?'Recusado':a.request_status==='confirmado'?'Confirmado':'Aguardando confirmação';
  const studioUrl=()=>`https://wa.me/${String(root.SUPABASE_STUDIO_PHONE||'5511986344770').replace(/\D/g,'')}`;
  async function rpc(name,body){
    const api=root.StudioCustomerAccount;
    if(!api?.client||!await api.requireLogin())throw new Error('Entre na sua conta para continuar.');
    const {data,error}=await api.client.rpc(name,body);
    if(error){const detail=error.message||'';const failure=new Error(/HORARIO_INDISPONIVEL/.test(detail)?'Esse horário não está mais disponível. Seu horário anterior foi mantido.':/AGENDAMENTO_ATUALIZADO/.test(detail)?'O espaço atualizou este agendamento. Confira os detalhes novamente.':/AGENDAMENTO_NAO_EDITAVEL/.test(detail)?'Este agendamento não pode mais ser alterado pelo site. Fale com o espaço.':/AGENDAMENTO_INDISPONIVEL/.test(detail)?'Agendamento indisponível para esta conta.':'Não foi possível concluir. Tente novamente.');failure.detail=detail;throw failure;}
    return data;
  }
  function ensureStyle(){if(document.getElementById('customer-appointments-style'))return;const style=document.createElement('style');style.id='customer-appointments-style';style.textContent=`
    .customer-appointments-button{border:1px solid #d8c4d2;background:#fff;color:#4b1630;border-radius:12px;padding:10px 14px;font:inherit;font-size:12px;min-height:44px}.site-header__inner{flex-wrap:wrap}
    .customer-modal{position:fixed;inset:0;z-index:10000;background:rgba(49,20,32,.58);backdrop-filter:blur(7px);display:grid;place-items:center;padding:18px}.customer-dialog{box-sizing:border-box;width:min(580px,100%);max-height:90vh;overflow:auto;border-radius:24px;background:#fff;color:#311420;padding:26px;font-family:inherit}.customer-dialog [hidden]{display:none!important}.customer-dialog h2{font:600 27px 'Playfair Display',serif;color:#4b1630;margin:0 0 10px}.customer-dialog h3{font-size:17px;margin:0 0 12px}.customer-dialog p{font-size:14px;line-height:1.55}.customer-dialog small{font-size:12px;color:#785c68}.customer-dialog .customer-record{padding:17px 0;border-top:1px solid #eadde6}.customer-record strong,.customer-record span{display:block;margin-bottom:7px;overflow-wrap:anywhere}.customer-dialog label{display:block;font-size:13px;margin:14px 0}.customer-dialog input,.customer-dialog select{box-sizing:border-box;display:block;width:100%;padding:12px;border:1px solid #d8c4d2;border-radius:11px;font:inherit;font-size:16px;margin-top:6px;background:#fff;color:#311420}.customer-actions{display:flex;flex-wrap:wrap;gap:9px;margin-top:14px}.customer-actions button,.customer-dialog .customer-close{border:1px solid #d8c4d2;background:#f8f2fa;color:#4b1630;border-radius:11px;padding:12px 14px;font:inherit;font-size:13px;min-height:44px}.customer-actions .customer-primary{background:#4b1630;color:#fff;border-color:#4b1630}.customer-actions .customer-danger{background:#fff;color:#a82448;border-color:#edb7c5}.customer-dialog button:disabled{opacity:.55}.customer-dialog .customer-error{color:#a82448;min-height:20px}.customer-dialog :focus-visible{outline:3px solid #8b63c7;outline-offset:3px}.customer-dialog a{color:#4b1630}.customer-close{float:right;margin-left:12px}.customer-link{overflow-wrap:anywhere}.customer-dialog dl{margin:0}.customer-dialog dt{font-size:12px;color:#785c68;margin-top:10px}.customer-dialog dd{margin:4px 0;font-size:14px}
    @media(max-width:560px){.customer-dialog{padding:21px}.customer-actions{flex-direction:column}.customer-actions button{width:100%}}
  `;document.head.append(style);}
  function dialog(){
    document.getElementById('customerAppointmentModal')?.remove();ensureStyle();
    const previous=document.activeElement,modal=document.createElement('div');modal.id='customerAppointmentModal';modal.className='customer-modal';modal.innerHTML='<section class="customer-dialog" role="dialog" aria-modal="true" aria-labelledby="customerTitle"><button class="customer-close" type="button" aria-label="Fechar meus agendamentos">Fechar</button><h2 id="customerTitle">Meus agendamentos</h2><div id="customerContent" aria-live="polite"></div></section>';
    document.body.append(modal);const close=()=>{document.removeEventListener('keydown',key);modal.remove();previous?.focus();};
    const key=e=>{if(e.key==='Escape'&&!modal.querySelector('[data-busy]'))close();if(e.key==='Tab'){const controls=[...modal.querySelectorAll('button:not(:disabled),a[href],input,select')].filter(el=>el.getClientRects().length);const first=controls[0],last=controls.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}};
    document.addEventListener('keydown',key);modal.querySelector('.customer-close').onclick=()=>{if(!modal.querySelector('[data-busy]'))close();};modal.addEventListener('click',e=>{if(e.target===modal&&!modal.querySelector('[data-busy]'))close();});modal.querySelector('.customer-close').focus();
    return {modal,content:modal.querySelector('#customerContent'),close};
  }
  function summary(a){return `<div class="customer-record"><strong>${esc(a.service_name)}</strong><span>${esc(root.StudioProfessionals.label(a.professional))} · ${esc(labelDate(a.appointment_at))}</span><small>${esc(status(a))}</small></div>`;}
  function showAppointment(id,receiptMessage){
    const view=dialog();view.content.textContent='Carregando agendamento…';
    async function render(message=''){
      try{const a=await rpc('get_account_appointment',{p_appointment_id:id});if(!view.modal.isConnected)return;
        view.content.innerHTML=summary(a)+`<p>${esc(message)}</p>${a.can_manage?'<div class="customer-actions"><button id="customerEdit" type="button">Alterar data e horário</button><button id="customerCancel" class="customer-danger" type="button">Cancelar agendamento</button></div>':''}${a.status==='cancelado'?'<div class="customer-actions"><button id="customerNew" class="customer-primary" type="button">Fazer novo agendamento</button></div>':''}${receiptMessage?'<div class="customer-actions"><button id="customerSend" class="customer-primary" type="button">Enviar pelo WhatsApp</button></div>':''}<p><a href="${studioUrl()}" target="_blank" rel="noopener noreferrer">Falar com o espaço</a></p>`;
        const send=view.content.querySelector('#customerSend');if(send)send.onclick=()=>root.open(`${studioUrl()}?text=${encodeURIComponent(receiptMessage)}`,'_blank','noopener,noreferrer');
        const edit=view.content.querySelector('#customerEdit');if(edit)edit.onclick=()=>editTime(a);
        const cancel=view.content.querySelector('#customerCancel');if(cancel)cancel.onclick=()=>confirm(a,'cancel');
        const fresh=view.content.querySelector('#customerNew');if(fresh)fresh.onclick=()=>{view.close();document.querySelector('[data-open-page="servicos"]')?.click();};
      }catch(e){if(!view.modal.isConnected)return;view.content.innerHTML=`<p class="customer-error" role="alert">${esc(e.message)}</p><div class="customer-actions"><button id="customerRetry" type="button">Tentar novamente</button></div><p><a href="${studioUrl()}" target="_blank" rel="noopener noreferrer">Falar com o espaço</a></p>`;view.content.querySelector('#customerRetry').onclick=()=>render();}
    }
    async function editTime(a){
      view.content.innerHTML=summary(a)+'<h3>Escolher novo horário</h3><p>O horário atual será mantido até você confirmar a troca.</p><p id="customerLoading" role="status">Carregando horários…</p><label>Nova data<select id="customerDate" disabled><option value="">Selecione</option></select></label><label>Novo horário<select id="customerTime" disabled><option value="">Selecione a data</option></select></label><p id="customerEditError" class="customer-error" role="alert"></p><div class="customer-actions"><button id="customerBack" type="button">Voltar</button><button id="customerReview" class="customer-primary" type="button" disabled>Revisar alteração</button></div>';
      view.content.querySelector('#customerBack').onclick=()=>render();
      try{const rows=(await rpc('get_professional_available_slots',{p_from_date:null})).filter(r=>r.professional===a.professional);if(!view.content.querySelector('#customerDate'))return;
        const date=view.content.querySelector('#customerDate'),time=view.content.querySelector('#customerTime'),review=view.content.querySelector('#customerReview');
        date.innerHTML='<option value="">Selecione a data</option>'+[...new Set(rows.map(r=>r.available_date))].sort().map(d=>`<option value="${esc(d)}">${esc(d.split('-').reverse().join('/'))}</option>`).join('');date.disabled=!rows.length;view.content.querySelector('#customerLoading').textContent=rows.length?'Horários disponíveis com '+root.StudioProfessionals.label(a.professional)+'.':'Não há outro horário disponível. Seu agendamento foi mantido.';
        date.onchange=()=>{time.innerHTML='<option value="">Selecione o horário</option>'+[...new Set(rows.filter(r=>r.available_date===date.value).map(r=>r.available_time.slice(0,5)))].sort().map(t=>`<option value="${t}">${t}</option>`).join('');time.disabled=!date.value;review.disabled=true;};time.onchange=()=>{review.disabled=!date.value||!time.value;};review.onclick=()=>confirm(a,'reschedule',date.value,time.value);
      }catch(e){const error=view.content.querySelector('#customerEditError');if(error)error.textContent=e.message;}
    }
    function confirm(a,action,date,time){
      const cancel=action==='cancel';view.content.innerHTML=summary(a)+`<h3>${cancel?'Cancelar este agendamento?':'Confirmar novo horário?'}</h3><p>${cancel?'O horário será liberado. Você poderá fazer um novo agendamento depois.':`Novo horário: <strong>${esc(date.split('-').reverse().join('/'))} às ${esc(time)}</strong>. A alteração será enviada ao espaço para nova confirmação.`}</p><p id="customerChangeError" class="customer-error" role="alert"></p><div class="customer-actions"><button id="customerKeep" type="button">${cancel?'Manter agendamento':'Voltar'}</button><button id="customerConfirm" class="${cancel?'customer-danger':'customer-primary'}" type="button">${cancel?'Sim, cancelar agendamento':'Confirmar alteração'}</button></div>`;
      const keep=view.content.querySelector('#customerKeep'),button=view.content.querySelector('#customerConfirm');keep.onclick=()=>cancel?render():editTime(a);button.onclick=async()=>{
        keep.disabled=button.disabled=true;button.dataset.busy='true';
        try{await rpc('change_account_appointment',{p_appointment_id:id,p_action:action,p_expected_updated_at:a.updated_at,p_available_date:date||null,p_available_time:time?time+':00':null});receiptMessage=null;await render(cancel?'Agendamento cancelado. O horário foi liberado.':'Horário alterado. Aguarde a nova confirmação do espaço.');}
        catch(e){if(/AGENDAMENTO_ATUALIZADO|AGENDAMENTO_NAO_EDITAVEL/.test(e.detail||'')){await render(e.message);return;}view.content.querySelector('#customerChangeError').textContent=e.message;keep.disabled=button.disabled=false;delete button.dataset.busy;}
      };
    }
    render(receiptMessage?'Solicitação registrada. Aguarde a confirmação do espaço.':'');
  }
  let pendingList=false;
  root.addEventListener("customer-account-ready",()=>{if(pendingList){pendingList=false;showList();}});
  async function showList(){
    if(!await root.StudioCustomerAccount?.requireLogin()){pendingList=true;return;}
    pendingList=false;
    const view=dialog();view.content.textContent='Carregando seus agendamentos…';
    try{const appointments=await rpc('get_account_appointments',{});if(!view.modal.isConnected)return;
      view.content.innerHTML='<div class="customer-actions"><button id="customerLogout" type="button">Sair da minha conta</button></div>'+(appointments.length?appointments.map(a=>`<div>${summary(a)}<div class="customer-actions"><button data-appointment-id="${esc(a.id)}" type="button">Ver agendamento</button></div></div>`).join(''):'<p>Nenhum agendamento vinculado à sua conta.</p>')+'<p id="customerListError" class="customer-error" role="alert"></p><small>Reservas feitas antes do cadastro ou fora da conta devem ser alteradas pelo WhatsApp.</small><p><a href="'+studioUrl()+'" target="_blank" rel="noopener noreferrer">Falar com o espaço</a></p>';
      view.content.querySelectorAll('[data-appointment-id]').forEach(button=>button.onclick=()=>{view.close();showAppointment(button.dataset.appointmentId);});
      view.content.querySelector('#customerLogout').onclick=async()=>{try{await root.StudioCustomerAccount.signOut();view.close();root.StudioCustomerAccount.open();}catch{view.content.querySelector('#customerListError').textContent='Não foi possível sair. Tente novamente.';}};
    }catch(e){if(view.modal.isConnected)view.content.innerHTML='<p class="customer-error" role="alert">'+esc(e.message)+'</p>';}
  }
  root.StudioCustomerAppointments={
    async register(args){return rpc('create_account_appointment_request',args);},
    showReceipt:showAppointment,
    showList
  };
  ensureStyle();document.getElementById('customerAppointmentsButton')?.addEventListener('click',showList);
})();
