(() => {
  'use strict';
  const cfg = window.SUPABASE_CONFIG || {};
  if (!window.supabase || !cfg.url || !cfg.anonKey) return;
  const db = window.supabase.createClient(cfg.url, cfg.anonKey);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const money = value => Number(value || 0).toLocaleString('pt-BR', {style:'currency', currency:'BRL'});
  const dateTime = value => new Date(value).toLocaleString('pt-BR', {dateStyle:'long', timeStyle:'short'});
  const marker = id => `appointment_id:${id}`;

  function closeModal() {
    document.querySelector('.receipt-modal')?.remove();
    document.body.classList.remove('modal-open');
  }

  function paymentModal(appointment, current = 'Pix') {
    return new Promise(resolve => {
      closeModal();
      const modal = document.createElement('div');
      modal.className = 'expense-modal receipt-modal';
      modal.innerHTML = `<div class="expense-modal-backdrop"></div><div class="expense-dialog expense-confirm" role="dialog" aria-modal="true" aria-labelledby="receiptTitle"><button class="expense-close" type="button" aria-label="Fechar">×</button><p class="eyebrow">CONCLUIR ATENDIMENTO</p><h3 id="receiptTitle">Forma de pagamento</h3><p>Confirme como a cliente realizou o pagamento para gerar o recibo.</p><div class="receipt-summary"><strong>${esc(appointment.client_name)}</strong><span>${esc(appointment.service_name || 'Serviço')} · ${money(appointment.amount)}</span><span>${esc(dateTime(appointment.appointment_at))}</span></div><label>Forma de pagamento<select id="receiptPayment"><option>Pix</option><option>Dinheiro</option><option>Cartão de débito</option><option>Cartão de crédito</option><option>Outro</option></select></label><p class="form-feedback error" id="receiptError"></p><div class="expense-form-actions"><button type="button" class="action" id="receiptCancel">Cancelar</button><button type="button" class="primary expense-save" id="receiptConfirm">Concluir e gerar recibo</button></div></div>`;
      document.body.appendChild(modal);
      document.body.classList.add('modal-open');
      const select = modal.querySelector('#receiptPayment');
      if ([...select.options].some(option => option.value === current)) select.value = current;
      const finish = value => { closeModal(); resolve(value); };
      modal.querySelector('.expense-close').onclick = () => finish(null);
      modal.querySelector('#receiptCancel').onclick = () => finish(null);
      modal.querySelector('.expense-modal-backdrop').onclick = () => finish(null);
      modal.querySelector('#receiptConfirm').onclick = () => finish(select.value);
      select.focus();
    });
  }

  async function getAppointment(id) {
    const {data, error} = await db.from('appointments').select('id,client_name,client_phone,service_id,service_name,amount,appointment_at,status,notes').eq('id', id).maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('Agendamento não encontrado.');
    return data;
  }

  async function getAttendance(id) {
    const {data, error} = await db.from('attendances').select('id,payment_method').ilike('notes', `%${marker(id)}%`).limit(1).maybeSingle();
    if (error) throw error;
    return data;
  }

  async function saveCompletion(appointment, payment) {
    const {error} = await db.from('appointments').update({status:'concluido', counted_as_revenue:true, updated_at:new Date().toISOString()}).eq('id', appointment.id);
    if (error) throw error;
    const existing = await getAttendance(appointment.id);
    const payload = {client_name:appointment.client_name, service_id:appointment.service_id, service_name:appointment.service_name || 'Serviço', amount:Number(appointment.amount || 0), payment_method:payment, attended_at:appointment.appointment_at, notes:[appointment.notes || '', marker(appointment.id)].filter(Boolean).join(' | ')};
    const result = existing ? await db.from('attendances').update(payload).eq('id', existing.id) : await db.from('attendances').insert(payload);
    if (result.error) throw result.error;
  }

  function filePart(value) {
    return String(value || 'cliente').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
  }

  function createPdf(appointment, payment, studio) {
    if (!window.jspdf?.jsPDF) throw new Error('O gerador de PDF não foi carregado. Atualize a página e tente novamente.');
    const pdf = new window.jspdf.jsPDF({unit:'mm', format:'a4'});
    const wine = [66,16,39], rose = [195,77,120], muted = [105,89,97];
    pdf.setFillColor(249,241,245); pdf.rect(0,0,210,48,'F');
    pdf.setDrawColor(...rose); pdf.setLineWidth(.6); pdf.circle(25,24,11);
    pdf.setTextColor(...wine); pdf.setFont('times','bolditalic'); pdf.setFontSize(17); pdf.text('I & R',25,26,{align:'center'});
    pdf.setFont('times','bold'); pdf.setFontSize(20); pdf.text(studio.studio_name || 'Studio I.R',44,21);
    pdf.setFont('helvetica','normal'); pdf.setFontSize(9); pdf.setTextColor(...muted); pdf.text(String(studio.tagline || 'Nail Designer').toUpperCase(),44,28);
    pdf.setTextColor(...rose); pdf.setFont('helvetica','bold'); pdf.setFontSize(10); pdf.text('RECIBO DE ATENDIMENTO',185,21,{align:'right'});
    pdf.setTextColor(...muted); pdf.setFont('helvetica','normal'); pdf.setFontSize(8); pdf.text(`Nº ${appointment.id.slice(0,8).toUpperCase()}`,185,27,{align:'right'});
    pdf.setTextColor(...wine); pdf.setFont('times','bold'); pdf.setFontSize(16); pdf.text('Dados da cliente',20,65);
    pdf.setDrawColor(232,218,225); pdf.line(20,70,190,70);
    const rows = [['Nome',appointment.client_name || '-'],['WhatsApp / telefone',appointment.client_phone || 'Não informado'],['Serviço realizado',appointment.service_name || 'Serviço'],['Data e hora',dateTime(appointment.appointment_at)],['Forma de pagamento',payment]];
    let y = 83;
    rows.forEach(([label,value]) => { pdf.setFont('helvetica','bold'); pdf.setFontSize(9); pdf.setTextColor(...muted); pdf.text(label.toUpperCase(),20,y); pdf.setFont('helvetica','normal'); pdf.setFontSize(12); pdf.setTextColor(...wine); pdf.text(String(value),72,y); y += 14; });
    pdf.setFillColor(...wine); pdf.roundedRect(20,158,170,31,4,4,'F');
    pdf.setTextColor(255,255,255); pdf.setFont('helvetica','normal'); pdf.setFontSize(10); pdf.text('VALOR RECEBIDO',30,171);
    pdf.setFont('times','bold'); pdf.setFontSize(22); pdf.text(money(appointment.amount),180,176,{align:'right'});
    pdf.setTextColor(...muted); pdf.setFont('helvetica','normal'); pdf.setFontSize(9); pdf.text('Declaramos que recebemos o valor acima referente ao serviço descrito neste recibo.',20,211);
    const location = [studio.address,studio.city].filter(Boolean).join(' · ');
    if (location) pdf.text(location,20,263);
    pdf.setDrawColor(232,218,225); pdf.line(20,268,190,268);
    pdf.setTextColor(...wine); pdf.setFont('times','italic'); pdf.setFontSize(11); pdf.text('Obrigada pela preferência.',105,278,{align:'center'});
    pdf.setFont('helvetica','normal'); pdf.setFontSize(8); pdf.setTextColor(...muted); pdf.text(`Emitido em ${new Date().toLocaleString('pt-BR')}`,105,285,{align:'center'});
    const filename = `recibo-studio-ir-${filePart(appointment.client_name)}-${new Date(appointment.appointment_at).toLocaleDateString('en-CA')}.pdf`;
    const blob = pdf.output('blob');
    const file = typeof File === 'function' ? new File([blob], filename, {type:'application/pdf'}) : null;
    return {pdf,filename,file};
  }

  function phoneNumber(phone) {
    let digits = String(phone || '').replace(/\D/g,'');
    if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
    return digits;
  }

  function successModal(appointment, payment, receipt) {
    closeModal();
    const phone = phoneNumber(appointment.client_phone);
    const message = `Olá, ${appointment.client_name}! Segue o recibo do seu atendimento no Espaço I.R, no valor de ${money(appointment.amount)}, pago via ${payment}.`;
    const modal = document.createElement('div');
    modal.className = 'expense-modal receipt-modal';
    modal.innerHTML = `<div class="expense-modal-backdrop"></div><div class="expense-dialog expense-confirm" role="dialog" aria-modal="true" aria-labelledby="receiptReadyTitle"><button class="expense-close" type="button" aria-label="Fechar">×</button><p class="eyebrow">RECIBO GERADO</p><h3 id="receiptReadyTitle">Recibo pronto para enviar</h3><p>Toque em “Enviar/compartilhar PDF”, escolha o WhatsApp e selecione a conversa da cliente. O arquivo será anexado pelo menu de compartilhamento do celular.</p><div class="receipt-summary"><strong>${esc(appointment.client_name)}</strong><span>${esc(payment)} · ${money(appointment.amount)}</span></div><p id="receiptShareStatus" class="form-feedback" role="status" aria-live="polite"></p><div class="receipt-delivery-actions"><button type="button" class="primary" id="receiptShare">Enviar/compartilhar PDF</button><button type="button" class="action" id="receiptDownload">Baixar PDF</button>${phone ? '<button type="button" class="action receipt-whatsapp" id="receiptWhatsApp">Abrir conversa no WhatsApp</button>' : ''}<button type="button" class="action" id="receiptDone">Fechar</button></div><p class="receipt-delivery-note">Se o compartilhamento não estiver disponível, baixe o PDF e anexe-o no WhatsApp. “Abrir conversa” prepara a mensagem, mas não anexa o arquivo.</p></div>`;
    document.body.appendChild(modal);
    document.body.classList.add('modal-open');
    const status = modal.querySelector('#receiptShareStatus');
    const shareButton = modal.querySelector('#receiptShare');
    const downloadButton = modal.querySelector('#receiptDownload');
    let canShareFile = false;
    try {
      canShareFile = !!(receipt.file && navigator.share && navigator.canShare && navigator.canShare({files:[receipt.file]}));
    } catch { /* Unsupported file sharing keeps the download option available. */ }
    if (!canShareFile) status.textContent = 'Este navegador não oferece envio direto de PDF. Toque em “Baixar PDF” e anexe o arquivo no WhatsApp.';
    shareButton.onclick = async () => {
      if (shareButton.disabled) return;
      if (!canShareFile) {
        status.textContent = 'Para enviar: toque em “Baixar PDF”, salve em Arquivos e anexe o documento no WhatsApp da cliente.';
        downloadButton.focus();
        return;
      }
      shareButton.disabled = true;
      status.textContent = '';
      try {
        // The file is already prepared: call share directly from this user click.
        await navigator.share({files:[receipt.file],title:'Recibo Espaço I.R'});
        status.textContent = 'Compartilhamento concluído. Confira a conversa escolhida no aplicativo.';
      } catch (error) {
        status.textContent = error.name === 'AbortError'
          ? 'Compartilhamento cancelado. O recibo continua disponível para enviar ou baixar.'
          : 'Não foi possível compartilhar neste navegador. Toque em “Baixar PDF” e anexe o arquivo no WhatsApp.';
      } finally {
        shareButton.disabled = false;
      }
    };
    downloadButton.onclick = () => {
      try {
        receipt.pdf.save(receipt.filename);
        status.textContent = 'PDF aberto para baixar. No iPhone, use Compartilhar → Salvar em Arquivos. Depois anexe o PDF no WhatsApp.';
      } catch {
        status.textContent = 'Não foi possível baixar o PDF. Tente novamente ou use “Enviar/compartilhar PDF”.';
      }
    };
    modal.querySelector('#receiptDone').onclick = closeModal;
    modal.querySelector('.expense-close').onclick = closeModal;
    modal.querySelector('.expense-modal-backdrop').onclick = closeModal;
    if (phone) modal.querySelector('#receiptWhatsApp').onclick = () => window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`,'_blank','noopener');
    shareButton.focus();
  }

  async function generate(appointment, payment) {
    const {data} = await db.from('studio_settings').select('studio_name,tagline,address,city').eq('id',1).maybeSingle();
    const receipt = createPdf(appointment,payment,data || {studio_name:'Espaço I.R',tagline:'Nail Designer'});
    successModal(appointment,payment,receipt);
  }

  window.completeAppointmentWithReceipt = async id => {
    try {
      const appointment = await getAppointment(id);
      const payment = await paymentModal(appointment);
      if (!payment) return false;
      await saveCompletion(appointment,payment);
      await generate(appointment,payment);
      return true;
    } catch (error) { closeModal(); alert(error.message || 'Não foi possível concluir e gerar o recibo.'); return false; }
  };

  window.generateAppointmentReceipt = async id => {
    try {
      const [appointment,attendance] = await Promise.all([getAppointment(id),getAttendance(id)]);
      let payment = attendance?.payment_method;
      if (!payment || payment === 'Não informado') {
        payment = await paymentModal(appointment);
        if (!payment) return;
        if (attendance) { const {error} = await db.from('attendances').update({payment_method:payment}).eq('id',attendance.id); if (error) throw error; }
        else await saveCompletion(appointment,payment);
      }
      await generate(appointment,payment);
    } catch (error) { closeModal(); alert(error.message || 'Não foi possível gerar o recibo.'); }
  };
})();
