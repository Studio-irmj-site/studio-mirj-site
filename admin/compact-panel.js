(() => {
  'use strict';
  const content = document.getElementById('content');
  const aside = document.getElementById('irAdminNavigation');
  if (!content || !aside) return;
  const navFor = key => aside.querySelector(key === 'requests' ? '[data-budget-nav]' : key === 'reviews' ? '[data-review-nav]' : '[data-view="' + key + '"]');
  const groups = [
    ['routine', 'Agenda e atendimento', [['requests', 'Pedidos do site'], ['appointments', 'Agendamentos'], ['availability', 'Horários disponíveis'], ['attendances', 'Serviços realizados']]],
    ['business', 'Gestão do espaço', [['clients', 'Clientes'], ['services', 'Serviços'], ['finance', 'Financeiro'], ['reviews', 'Avaliações']]],
    ['settings', 'Ajustes', [['settings', 'Configurações']]]
  ];
  function organizeMenu() {
    const home = navFor('dashboard');
    if (home) { home.title = 'Visão geral'; const label=home.querySelector('span'); if(label.textContent!=='Visão geral')label.textContent='Visão geral'; }
    for (const [key, name, routes] of groups) {
      let section = aside.querySelector('[data-nav-group="' + key + '"]');
      if (!section) {
        section = document.createElement('details'); section.className = 'ir-nav-group'; section.dataset.navGroup = key;
        section.open = key === 'routine';
        const summary = document.createElement('summary'); summary.textContent = name; section.append(summary);
        aside.querySelector('#logout').before(section);
      }
      for (const [route, label] of routes) {
        const button = navFor(route); if (!button) continue;
        const span = button.querySelector('span:not(.nav-budget-badge)');
        if (span && span.textContent !== label) span.textContent = label;
        button.title = label;
        if (button.parentElement !== section) section.append(button);
        if (button.classList.contains('active')) section.open = true;
      }
    }
    if (!aside.querySelector('.ir-menu-close')) {
      const close = document.createElement('button'); close.className = 'ir-menu-close'; close.type = 'button'; close.textContent = 'Fechar menu ×';
      close.addEventListener('click', () => document.getElementById('avMenuToggle').click()); aside.prepend(close);
    }
  }
  function go(route) { navFor(route)?.click(); }
  let previousRoute = '';
  function workflow() {
    const active = aside.querySelector('.nav.active');
    const route = active?.dataset.budgetNav ? 'requests' : active?.dataset.reviewNav ? 'reviews' : active?.dataset.view;
    const isForm = content.querySelector('#appointmentForm,#attendanceForm');
    let rail = document.getElementById('irWorkflow');
    if (!['requests', 'appointments', 'availability', 'attendances'].includes(route) || isForm) { rail?.remove(); return; }
    if (!rail) {
      rail = document.createElement('section'); rail.id = 'irWorkflow'; rail.className = 'ir-workflow';
      rail.innerHTML = '<div class="ir-section-heading"><strong>Agenda e atendimento</strong><small>Escolha o que deseja gerenciar</small></div><nav aria-label="Etapas da agenda">' + [['requests','1 · Pedidos'],['appointments','2 · Agendamentos'],['attendances','3 · Realizados'],['availability','Horários livres']].map(([key,label]) => '<button type="button" data-ir-route="' + key + '">' + label + '</button>').join('') + '</nav><p class="ir-route-help"></p>';
      content.before(rail); rail.querySelectorAll('button').forEach(button => button.onclick = () => go(button.dataset.irRoute));
    }
    rail.querySelectorAll('button').forEach(button => { const selected = button.dataset.irRoute === route; button.classList.toggle('selected', selected); button.setAttribute('aria-current', selected ? 'page' : 'false'); });
    const descriptions = {requests:'Pedidos enviados pelas clientes: confira e confirme o horário.',appointments:'Reservas da agenda: edite o horário ou marque o serviço como concluído.',attendances:'Histórico dos serviços realizados e registros avulsos. Para uma reserva da agenda, conclua em Agendamentos.',availability:'Horários que as clientes podem escolher. Selecione a agenda da profissional antes de criar horários.'};
    if (rail.querySelector('p').textContent !== descriptions[route]) rail.querySelector('p').textContent = descriptions[route];
    if (previousRoute !== route) { previousRoute = route; window.scrollTo({top:0,behavior:'instant'}); }
  }
  const pages = new WeakMap();
  const submitChecks = new WeakMap();
  window.addEventListener('submit',event=>{submitChecks.get(event.target)?.(event);},true);
  function paginate(list) {
    const rows = [...list.children].filter(row => !row.classList.contains('ir-pagination') && !row.matches('.empty,.budget-empty'));
    const old = pages.get(list);
    if (old && old.rows.length === rows.length && old.rows.every((row,i) => row === rows[i])) return;
    list.querySelector('.ir-pagination')?.remove();
    rows.forEach(row => row.hidden = false);
    if (rows.length <= 5) { pages.set(list,{rows}); return; }
    let page = 0; const count = Math.ceil(rows.length / 5);
    const controls = document.createElement('div'); controls.className = 'ir-pagination';
    controls.innerHTML = '<button type="button" class="action">Anterior</button><span role="status" aria-live="polite"></span><button type="button" class="action">Próxima</button>';
    const [prev,next] = controls.querySelectorAll('button');
    function draw() { rows.forEach((row,i) => row.hidden = i < page * 5 || i >= (page+1)*5); prev.disabled = page===0; next.disabled = page===count-1; controls.querySelector('span').textContent = (page*5+1) + '–' + Math.min((page+1)*5,rows.length) + ' de ' + rows.length; }
    prev.onclick = () => { page=Math.max(0,page-1); draw(); list.scrollIntoView({block:'start'}); };
    next.onclick = () => { page=Math.min(count-1,page+1); draw(); list.scrollIntoView({block:'start'}); };
    list.append(controls); pages.set(list,{rows}); draw();
  }
  function dashboard() {
    if (document.getElementById('title').textContent !== 'Dashboard') return;
    const hero = content.querySelector('.hero');
    if (hero && !hero.dataset.compact) { hero.dataset.compact='true'; hero.querySelector('h1').textContent='Olá, Iarytsa & Raquel'; hero.querySelector('p:last-child').textContent='Seu espaço, organizado em um só lugar.'; }
    let shortcuts = content.querySelector('.ir-shortcuts');
    if (hero && !shortcuts) {
      shortcuts = document.createElement('div'); shortcuts.className='ir-shortcuts';
      shortcuts.innerHTML='<button class="action" type="button" data-go="appointments">Ver agendamentos ↗</button><button class="action" type="button" data-go="requests">Pedidos do site ↗</button><button class="action" type="button" data-go="finance">Financeiro ↗</button>';
      content.querySelector('.stats')?.after(shortcuts); shortcuts.querySelectorAll('button').forEach(b=>b.onclick=()=>go(b.dataset.go));
    }
    const details = document.getElementById('revenueDetails');
    if (details && !details.parentElement.matches('details.ir-revenue-fold')) {
      const fold=document.createElement('details'); fold.className='ir-revenue-fold card';
      const summary=document.createElement('summary'); summary.textContent='Análise do faturamento'; fold.append(summary); details.before(fold); fold.append(details);
    }
    if (details) {
      const totals=document.getElementById('financeSummary');
      const fold=details.closest('.ir-revenue-fold');
      if(totals&&fold&&totals.parentElement===fold)fold.before(totals);
      const grid=details.querySelector('.dashboard-grid');
      if (grid && !grid.dataset.compact) {
        grid.dataset.compact='true';
        [...grid.children].forEach(card=>{const h=card.querySelector('h3'); if(!h)return; const fold=document.createElement('details'); fold.className='ir-analysis-fold';const summary=document.createElement('summary');summary.textContent=h.textContent;fold.append(summary);[...card.children].filter(n=>n!==h).forEach(n=>fold.append(n));card.replaceChildren(fold);});
      }
    }
  }
  const formSteps = {
    appointmentForm:[['Cliente e serviço',['pClient','pService','pAmount']],['Horário e profissional',['pProfessional','pDate']],['Conferir e salvar',['pStatus','pNotes']]],
    attendanceForm:[['Cliente e serviço',['aClient','aService']],['Pagamento',['aAmount','aPayment','aDate']],['Conferir e registrar',['aNotes']]]
  };
  function wizard(form) {
    if (form.dataset.irWizard) return; form.dataset.irWizard='true'; form.noValidate=true;
    const config=formSteps[form.id]; let step=0;
    const heading=document.createElement('nav');heading.className='ir-steps';heading.setAttribute('aria-label','Etapas do cadastro');
    const panels=config.map(([name,ids],index)=>{
      const button=document.createElement('button');button.type='button';button.textContent=(index+1)+'. '+name;button.onclick=()=>move(index);heading.append(button);
      const panel=document.createElement('section');panel.className='ir-step-panel';panel.setAttribute('aria-label',name);
      ids.forEach(id=>{const input=document.getElementById(id);const label=input?.closest('label');if(label)panel.append(label);});return panel;
    });
    const save=form.querySelector('button.primary');
    const buttons=document.createElement('div');buttons.className='ir-wizard-actions';buttons.innerHTML='<button type="button" class="action">Voltar</button><button type="button" class="primary">Continuar →</button>';
    const [back,next]=buttons.querySelectorAll('button');back.onclick=()=>move(step-1);next.onclick=()=>move(step+1);
    const review=document.createElement('div');review.className='ir-form-review';panels.at(-1).prepend(review);
    form.prepend(heading,...panels);save.before(buttons);
    function valid(index){for(const input of panels[index].querySelectorAll('input,select,textarea'))if(!input.validity.valid){step=index;draw();input.reportValidity();return false;}return true;}
    function move(target){if(target<0||target>=panels.length)return; if(target>step)for(let i=step;i<target;i++)if(!valid(i))return;step=target;draw();panels[step].querySelector('input,select,textarea')?.focus();}
    function draw(){panels.forEach((p,i)=>p.hidden=i!==step);[...heading.children].forEach((b,i)=>{b.classList.toggle('selected',i===step);b.setAttribute('aria-current',i===step?'step':'false');});back.hidden=step===0;next.hidden=step===panels.length-1;save.hidden=step!==panels.length-1;
      review.replaceChildren(); if(step===panels.length-1){config.slice(0,-1).forEach(([,ids])=>ids.forEach(id=>{const input=document.getElementById(id);if(!input)return;const line=document.createElement('p'),label=input.closest('label').childNodes[0]?.textContent.trim()||'';line.textContent=label+': '+(input.tagName==='SELECT'?input.selectedOptions[0]?.textContent:input.value||'Não informado');review.append(line);}));}
    }
    form.addEventListener('invalid',e=>{const index=panels.findIndex(p=>p.contains(e.target));if(index>=0&&index!==step){step=index;draw();}},true);
    submitChecks.set(form,e=>{if(step<panels.length-1){e.preventDefault();e.stopImmediatePropagation();move(step+1);return;}for(let i=0;i<panels.length;i++)if(!valid(i)){e.preventDefault();e.stopImmediatePropagation();return;}});
    draw();
  }
  function enhance() {
    organizeMenu();workflow();dashboard();
    content.querySelectorAll('#appointmentForm,#attendanceForm').forEach(wizard);
    content.querySelectorAll('#serviceList,#appointmentList,#attendanceList,#clientList,#budgetRequestList,#reviewAdminList').forEach(paginate);
  }
  let queued=false;
  const schedule=()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;enhance();});};
  new MutationObserver(schedule).observe(content,{childList:true,subtree:true});
  new MutationObserver(schedule).observe(aside,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
  document.addEventListener('click',schedule);window.addEventListener('load',schedule);schedule();
})();
