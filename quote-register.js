(() => {
  "use strict";

  const config = window.SUPABASE_CONFIG || {};
  const cta = document.querySelector("#ctaButton");
  if (!cta) return;

  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);
  const money = (value) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0));
  const timeValue = (value) => String(value || "").slice(0, 5);

  function selectedItems() {
    return [...document.querySelectorAll(".service-card[aria-pressed='true']")].map((card) => ({
      id: card.dataset.serviceId || null,
      name: card.querySelector(".service-card__copy strong")?.textContent?.trim() || "Serviço",
      price: Number((card.querySelector(".service-card__price strong")?.textContent || "0")
        .replace(/[^0-9,]/g, "").replace(/\./g, "").replace(",", ".")) || 0,
      quantity: 1,
    }));
  }

  function total(items) {
    return items.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 1), 0);
  }

  function localDateValue() {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
    const get = type => parts.find(part => part.type === type).value;
    return `${get("year")}-${get("month")}-${get("day")}`;
  }

  function matchingSlots(rows, preference) {
    return window.StudioProfessionals.visibleSlots(rows, preference);
  }
  function resolveProfessional(rows, preference, date, time) {
    return window.StudioProfessionals.resolveSlotProfessional(rows, preference, date, time);
  }

  function professionalLabel(value) {
    return value === "any" ? "Sem preferência — a combinar com o espaço" : window.StudioProfessionals.label(value);
  }

  function dateLabel(value) {
    if (!value) return "";
    const [y, m, d] = value.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" });
  }

  async function loadAvailability() {
    if (!config.url || !config.anonKey) return [];
    const response = await fetch(`${config.url}/rest/v1/rpc/get_professional_available_slots`, {
      method: "POST",
      headers: {
        apikey: config.anonKey,
        Authorization: `Bearer ${config.anonKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_from_date: localDateValue() }),
    });
    if (!response.ok) throw new Error("Disponibilidade temporariamente indisponível.");
    return response.json();
  }

  function populateAvailability(rows, dateSelect, timeSelect) {
    const dates = [...new Set((rows || []).map((row) => row.available_date).filter(Boolean))].sort();
    const current = dateSelect.value;
    dateSelect.innerHTML = `<option value="">A combinar</option>` + dates.map((date) => `<option value="${esc(date)}">${esc(dateLabel(date))}</option>`).join("");
    if (dates.includes(current)) dateSelect.value = current;

    const times = [...new Set((rows || []).filter((row) => row.available_date === dateSelect.value).map(row => timeValue(row.available_time)))].sort();
    timeSelect.innerHTML = `<option value="">A combinar</option>` + times.map((t) => {
      return `<option value="${esc(t)}">${esc(t)}</option>`;
    }).join("");
    timeSelect.disabled = !dateSelect.value;
  }

  function servicesText(items) {
    return items.map((item) => `${item.quantity}x ${item.name}`).join(", ");
  }

  function serviceNotes(items) {
    return items.map((item) => `${item.quantity}x ${item.name} — ${money(item.price)} cada — subtotal ${money(item.price * item.quantity)}`).join(" | ");
  }

  function buildWhatsAppMessage({ name, phone, items, date, time, professional, notes, registered }) {
    const lines = [
      "Orçamento — Espaço I.R",
      "",
      `Cliente: ${name}`,
      `WhatsApp: ${phone}`,
      `Serviços: ${servicesText(items)}`,
      `Profissional: ${professionalLabel(professional)}`,
      `Valor estimado: ${money(total(items))}`,
      date ? `Data desejada: ${dateLabel(date)}` : "Data desejada: a combinar",
      time ? `Horário desejado: ${time}` : "Horário desejado: a combinar",
      notes ? `Observação: ${notes}` : "",
      "",
      registered ? "Solicitação registrada no Painel ADM. Aguardando confirmação do Espaço I.R; o atendimento ainda não está confirmado." : "Consulta pelo WhatsApp — sem reserva de horário. Aguarde a confirmação do Espaço I.R.",
    ];
    return lines.filter(Boolean).join("\n");
  }

  async function tryRegister({ name, phone, items, date, time, professional, notes }) {
    if (!config.url || !config.anonKey || !date || !time) return false;
    const response = await fetch(`${config.url}/rest/v1/rpc/create_professional_appointment_request`, {
      method: "POST",
      headers: {
        apikey: config.anonKey,
        Authorization: `Bearer ${config.anonKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_client_name: name,
        p_client_phone: phone,
        p_items: items.map(item => ({service_id:item.id,quantity:item.quantity})),
        p_professional: professional,
        p_available_date: date,
        p_available_time: `${time}:00`,
        p_notes: notes || null,
      }),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      if (/HORARIO_INDISPONIVEL/i.test(detail)) throw new Error("Esse horário acabou de ser reservado. Escolha outro ou deixe a combinar.");
      throw new Error("Não foi possível registrar o horário. Tente novamente ou deixe data e horário a combinar.");
    }
    return true;
  }

  function openWhatsApp(message) {
    const studioPhone = String(window.SUPABASE_STUDIO_PHONE || "5511986344770").replace(/\D/g, "");
    const url = `https://wa.me/${studioPhone}?text=${encodeURIComponent(message)}`;
    const popup = window.open(url, "_blank", "noopener,noreferrer");
    if (!popup) window.location.href = url;
  }

  function openRequestModal() {
    if (document.querySelector("#appointmentRequestModal")) return;
    const items = selectedItems();
    if (!items.length) {
      const href = cta.getAttribute("href");
      if (href) window.location.href = href;
      return;
    }

    if (!document.querySelector("#appointment-request-style")) {
      const style = document.createElement("style");
      style.id = "appointment-request-style";
      style.textContent = `
        .request-modal{position:fixed;inset:0;z-index:9999;display:grid;place-items:center;padding:18px;background:rgba(49,20,32,.58);backdrop-filter:blur(7px)}
        .request-card{box-sizing:border-box;width:min(620px,100%);max-height:92vh;overflow:auto;background:#fff;border-radius:26px;padding:28px;box-shadow:0 28px 80px rgba(49,20,32,.32);color:#311420}
        .request-card h3{margin:0 0 7px;font-family:'Playfair Display',serif;font-size:29px;color:#4b1630}.request-card>p{margin:0 0 18px;color:#785c68;font-size:13px;line-height:1.55}
        .request-items{display:grid;gap:8px;margin-bottom:14px}.request-item{display:grid;grid-template-columns:1fr auto;gap:10px;align-items:center;padding:12px 14px;border:1px solid rgba(75,22,48,.1);border-radius:15px;background:#fcf9ff}.request-item strong{display:block;font-size:13px}.request-item small{display:block;margin-top:3px;color:#785c68;font-size:11px}.request-item__controls{display:flex;align-items:center;gap:7px}.request-item__controls button{width:30px;height:30px;border:1px solid rgba(75,22,48,.14);border-radius:9px;background:#fff;color:#4b1630;font-weight:800}.request-item__qty{min-width:20px;text-align:center;font-weight:800}
        .request-total{display:flex;justify-content:space-between;align-items:center;padding:14px 16px;margin-bottom:16px;border-radius:15px;background:linear-gradient(135deg,#f5efff,#fff5f8)}.request-total span{font-size:12px;color:#785c68}.request-total strong{font:600 21px 'Playfair Display',serif;color:#4b1630}
        .request-grid{display:grid;grid-template-columns:1fr 1fr;gap:4px 12px}.request-field{display:block;margin:9px 0;font-size:12px;font-weight:700}.request-field.full{grid-column:1/-1}.request-field input,.request-field select,.request-field textarea{width:100%;margin-top:6px;padding:12px;border:1px solid rgba(75,22,48,.16);border-radius:12px;background:#fff;color:#311420;font:inherit;box-sizing:border-box}.request-field textarea{min-height:82px;resize:vertical}
        .availability-help{margin:5px 0 0!important;color:#8a6b77!important;font-size:11px!important}.request-error{min-height:18px;margin:9px 0 0!important;color:#b3264d!important;font-size:12px!important}.request-info{min-height:18px;margin:5px 0 0!important;color:#6b5872!important;font-size:11px!important}
        .request-actions{display:flex;gap:10px;margin-top:18px}.request-actions button{flex:1;padding:13px;border:0;border-radius:12px;font-weight:700}.request-cancel{background:#f5f0f8;color:#4b1630}.request-submit{background:linear-gradient(135deg,#8b63c7,#4b1630);color:#fff}.request-submit:disabled{opacity:.65}
        .request-card [hidden]{display:none!important}.request-steps{margin-bottom:14px;color:#785c68;font-size:12px}.request-review{padding:16px;border:1px solid rgba(75,22,48,.16);border-radius:16px;background:#fcf9ff}.request-review h4{margin:0 0 12px;font-size:17px}.request-review dl{margin:0;display:grid;gap:6px}.request-review dt{font-weight:700;font-size:12px;color:#785c68}.request-review dd{margin:0 0 9px;font-size:14px;overflow-wrap:anywhere}.request-review p{font-size:12px;line-height:1.5;color:#785c68}.request-card :focus-visible{outline:3px solid #8b63c7;outline-offset:3px}
        .request-saved-contact{grid-column:1/-1;padding:15px;border:1px solid rgba(75,22,48,.12);border-radius:15px;background:#fcf9ff}.request-saved-contact strong,.request-saved-contact span{display:block;overflow-wrap:anywhere}.request-saved-contact span{margin-top:5px;font-size:12px;color:#785c68}.request-contact-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}.request-contact-actions button{min-height:38px;border:1px solid rgba(75,22,48,.16);border-radius:10px;background:#fff;color:#4b1630;padding:8px 12px;font:inherit;font-size:12px}.request-remember{grid-column:1/-1;font-size:12px;color:#785c68;margin:8px 0}.request-remember label{display:flex;align-items:center;gap:9px;cursor:pointer}.request-remember input{width:18px;height:18px;accent-color:#4b1630}.request-remember small{display:block;margin:6px 0 0 27px;line-height:1.5}.request-contact-status{grid-column:1/-1;margin:4px 0;font-size:12px;color:#785c68}
        @media(max-width:560px){.request-grid{grid-template-columns:1fr}.request-field.full{grid-column:auto}.request-card{padding:21px}.request-item{grid-template-columns:1fr}.request-actions{flex-direction:column-reverse}}
      `;
      document.head.append(style);
    }

    const modal = document.createElement("div");
    modal.id = "appointmentRequestModal";
    modal.className = "request-modal";
    modal.innerHTML = `
      <div class="request-card" role="dialog" aria-modal="true" aria-labelledby="requestTitle">
        <h3 id="requestTitle">Enviar orçamento</h3>
        <p>Escolha a profissional e veja os horários disponíveis. Você vai revisar os detalhes antes de enviar. O atendimento depende da confirmação do Espaço I.R.</p>
        <div class="request-steps" id="requestStep" aria-live="polite">1. Serviços → 2. Profissional e horário → 3. Revisão</div>
        <div id="requestItems" class="request-items"></div>
        <div class="request-total"><span>Valor total estimado</span><strong id="requestTotal">${money(total(items))}</strong></div>
        <form id="appointmentRequestForm">
          <div class="request-grid">
            <div id="requestSavedContact" class="request-saved-contact" hidden><strong id="requestSavedName"></strong><span id="requestSavedPhone"></span><div class="request-contact-actions"><button id="requestEditContact" type="button">Editar meus dados</button><button id="requestForgetContact" type="button">Esquecer meus dados</button></div></div>
            <label id="requestNameField" class="request-field">Nome completo<input id="requestName" required maxlength="80" autocomplete="name"></label>
            <label id="requestPhoneField" class="request-field">WhatsApp<input id="requestPhone" required maxlength="20" inputmode="tel" autocomplete="tel" placeholder="(11) 99999-9999"></label>
            <div class="request-remember"><label><input id="requestRemember" type="checkbox">Lembrar meus dados neste dispositivo</label><small>Guarda apenas nome e WhatsApp neste navegador. Você pode editar ou apagar quando quiser.</small></div>
            <label class="request-field full">Profissional desejada<select id="requestProfessional" required><option value="">Selecione a profissional</option><option value="raquel">Raquel</option><option value="iarytsa">Iarytsa</option><option value="any">Sem preferência</option></select></label><label class="request-field">Data desejada<select id="requestDate"><option value="">Selecione a profissional primeiro</option></select></label>
            <label class="request-field">Horário desejado<select id="requestTime"><option value="">A combinar</option></select></label>
            <label class="request-field full">Observação<textarea id="requestNotes" maxlength="500" placeholder="Detalhes do serviço ou preferência de horário."></textarea></label>
          </div>
          <section id="requestReview" class="request-review" tabindex="-1" aria-label="Resumo da solicitação" hidden></section>
          <p id="requestContactStatus" class="request-contact-status" role="status"></p>
          <p class="availability-help">Se preferir, deixe data e horário como “A combinar”.</p>
          <p id="requestInfo" class="request-info">Carregando horários disponíveis…</p>
          <p id="requestError" class="request-error" role="alert"></p>
          <div class="request-actions"><button type="button" class="request-cancel" id="requestCancel">Cancelar</button><button type="submit" class="request-submit" id="requestSubmit">Revisar solicitação</button></div>
        </form>
      </div>`;
    document.body.append(modal);

    const itemsBox = modal.querySelector("#requestItems");
    const totalBox = modal.querySelector("#requestTotal");
    const professionalSelect = modal.querySelector("#requestProfessional");
    const dateSelect = modal.querySelector("#requestDate");
    const timeSelect = modal.querySelector("#requestTime");
    const submit = modal.querySelector("#requestSubmit");
    const errorBox = modal.querySelector("#requestError");
    const infoBox = modal.querySelector("#requestInfo");
    const reviewBox = modal.querySelector("#requestReview");
    const fields = modal.querySelector(".request-grid");
    const cancel = modal.querySelector("#requestCancel");
    const contactStore = window.StudioCustomerContact;
    const nameInput = modal.querySelector("#requestName");
    const phoneInput = modal.querySelector("#requestPhone");
    const rememberInput = modal.querySelector("#requestRemember");
    const contactStatus = modal.querySelector("#requestContactStatus");
    const savedContactBox = modal.querySelector("#requestSavedContact");
    let savedContact = contactStore?.read() || null;
    function showSavedContact(contact) {
      nameInput.value = contact.name;
      phoneInput.value = contact.phone;
      rememberInput.checked = true;
      modal.querySelector("#requestSavedName").textContent = contact.name;
      modal.querySelector("#requestSavedPhone").textContent = "WhatsApp: " + contact.phone;
      savedContactBox.hidden = false;
      modal.querySelector("#requestNameField").hidden = true;
      modal.querySelector("#requestPhoneField").hidden = true;
    }
    function editContact() {
      savedContactBox.hidden = true;
      modal.querySelector("#requestNameField").hidden = false;
      modal.querySelector("#requestPhoneField").hidden = false;
      nameInput.focus();
    }
    if (savedContact) showSavedContact(savedContact);
    modal.querySelector("#requestEditContact").addEventListener("click", editContact);
    function clearSavedContact(clearFields) {
      if (!contactStore?.clear()) {
        contactStatus.textContent = "Não foi possível apagar os dados salvos. Tente novamente ou limpe os dados deste site no navegador.";
        rememberInput.checked = Boolean(savedContact);
        return false;
      }
      savedContact = null;
      rememberInput.checked = false;
      if (clearFields) {nameInput.value = ""; phoneInput.value = ""; editContact();}
      contactStatus.textContent = "Seus dados não estão mais salvos neste dispositivo.";
      return true;
    }
    modal.querySelector("#requestForgetContact").addEventListener("click", () => clearSavedContact(true));
    rememberInput.addEventListener("change", () => {
      if (!rememberInput.checked && savedContact) clearSavedContact(false);
      else contactStatus.textContent = rememberInput.checked ? "Os dados serão salvos quando você revisar a solicitação." : "Seus dados serão usados somente nesta solicitação.";
    });
    const previousFocus = document.activeElement;
    let reviewedRequest = null;
    let availabilityRows = [];

    function editing() {
      reviewedRequest = null;
      fields.hidden = false;
      itemsBox.hidden = false;
      reviewBox.hidden = true;
      cancel.textContent = "Cancelar";
      submit.textContent = "Revisar solicitação";
      modal.querySelector("#requestStep").textContent = "1. Serviços → 2. Profissional e horário → 3. Revisão";
    }

    function refreshAvailability() {
      const rows = matchingSlots(availabilityRows, professionalSelect.value);
      populateAvailability(rows, dateSelect, timeSelect);
      dateSelect.disabled = !professionalSelect.value;
      infoBox.textContent = !professionalSelect.value ? "Selecione a profissional para ver os horários." : !rows.length ? "Sem horários publicados para essa escolha. Você pode consultar pelo WhatsApp sem reservar um horário." : professionalSelect.value === "any" ? "A profissional disponível será indicada na revisão. O horário só será solicitado após você conferir." : "Selecione a data e o horário, ou deixe ambos a combinar.";
    }

    function refreshItems() {
      itemsBox.replaceChildren();
      items.forEach((item, index) => {
        const row = document.createElement("div");
        row.className = "request-item";
        row.innerHTML = `<div><strong>${esc(item.name)}</strong><small>${money(item.price)} cada · subtotal ${money(item.price * item.quantity)}</small></div><div class="request-item__controls"><button type="button" data-act="minus" data-i="${index}">−</button><span class="request-item__qty">${item.quantity}</span><button type="button" data-act="plus" data-i="${index}">+</button></div>`;
        itemsBox.append(row);
      });
      totalBox.textContent = money(total(items));
    }
    refreshItems();

    itemsBox.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-act]");
      if (!button) return;
      const item = items[Number(button.dataset.i)];
      if (!item) return;
      item.quantity = button.dataset.act === "plus" ? Math.min(20, item.quantity + 1) : Math.max(1, item.quantity - 1);
      refreshItems();
    });

    const close = () => { if (submit.disabled) return; modal.remove(); previousFocus?.focus(); };
    cancel.addEventListener("click", () => { if (submit.disabled) return; if (reviewedRequest) { editing(); professionalSelect.focus(); } else close(); });
    modal.addEventListener("click", (event) => { if (event.target === modal) close(); });
    modal.addEventListener("keydown", event => {
      if (event.key === "Escape") { event.preventDefault(); close(); }
      if (event.key !== "Tab") return;
      const focusable = [...modal.querySelectorAll('button,input,select,textarea')].filter(el => !el.disabled && el.getClientRects().length);
      const first = focusable[0], last = focusable.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === reviewBox)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    });
    let availabilityVersion = 0;
    async function reloadAvailability() {
      const version = ++availabilityVersion;
      dateSelect.disabled = true;
      timeSelect.disabled = true;
      infoBox.textContent = professionalSelect.value ? "Atualizando horários da profissional…" : "Selecione a profissional para ver os horários.";
      try {
        const rows = await loadAvailability();
        if (version !== availabilityVersion || !modal.isConnected) return;
        availabilityRows = rows || [];
        refreshAvailability();
      } catch (error) {
        if (version !== availabilityVersion || !modal.isConnected) return;
        availabilityRows = [];
        refreshAvailability();
        infoBox.textContent = "Não foi possível carregar a agenda agora; o orçamento continua disponível pelo WhatsApp.";
      }
    }
    professionalSelect.addEventListener("change", () => {
      editing();
      dateSelect.value = "";
      timeSelect.value = "";
      availabilityRows = [];
      reloadAvailability();
    });
    dateSelect.addEventListener("change", refreshAvailability);
    refreshAvailability();
    reloadAvailability();

    modal.querySelector("#appointmentRequestForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      if (submit.disabled) return;
      const name = modal.querySelector("#requestName").value.trim();
      const phone = modal.querySelector("#requestPhone").value.replace(/\D/g, "");
      const date = dateSelect.value;
      const time = timeSelect.value;
      const preference = professionalSelect.value;
      const professional = resolveProfessional(availabilityRows, preference, date, time);
      const notes = modal.querySelector("#requestNotes").value.trim();

      if (!preference) {errorBox.textContent="Selecione a profissional desejada.";return;}
      if (name.length < 2 || !/^(?:\d{10,11}|55\d{10,11})$/.test(phone)) {
        errorBox.textContent = "Preencha seu nome e um WhatsApp válido.";
        return;
      }
      if ((date && !time) || (!date && time)) {
        errorBox.textContent = "Escolha data e horário juntos ou deixe ambos como “A combinar”.";
        return;
      }

      if (!professional) { errorBox.textContent = "Escolha um horário disponível para essa profissional."; return; }

      if (!reviewedRequest) {
        if (rememberInput.checked) {
          if (contactStore?.write({name, phone})) {
            savedContact = {name, phone};
            showSavedContact(savedContact);
            contactStatus.textContent = "Nome e WhatsApp salvos neste dispositivo.";
          } else {
            contactStatus.textContent = "Este navegador não permitiu salvar seus dados. Você pode enviar a solicitação normalmente.";
            rememberInput.checked = false;
          }
        }
        reviewedRequest = { name, phone, items: items.map(item => ({...item})), date, time, professional, notes };
        errorBox.textContent = "";
        const summary = [["Cliente", name], ["WhatsApp", phone], ["Serviços", servicesText(items)], ["Profissional", professionalLabel(professional)], ["Data e horário", date ? `${dateLabel(date)} às ${time}` : "A combinar — sem reserva de horário"], ["Valor estimado", money(total(items))]];
        if (notes) summary.push(["Observação", notes]);
        reviewBox.innerHTML = `<h4>Confira sua solicitação</h4><dl>${summary.map(([label, value]) => `<dt>${esc(label)}</dt><dd>${esc(value)}</dd>`).join("")}</dl><p>${preference === "any" && date ? "Você escolheu sem preferência. A profissional indicada está disponível nesse horário. " : ""}O envio não confirma o atendimento: aguarde a aprovação do Espaço I.R.</p>`;
        fields.hidden = true;
        itemsBox.hidden = true;
        reviewBox.hidden = false;
        cancel.textContent = "Voltar e editar";
        submit.textContent = "Enviar solicitação pelo WhatsApp";
        modal.querySelector("#requestStep").textContent = "3. Revisão — confira antes de enviar";
        reviewBox.focus();
        return;
      }

      errorBox.textContent = "";
      submit.disabled = true;
      submit.textContent = "Preparando WhatsApp…";

      let registered = false;
      try {
        registered = await tryRegister(reviewedRequest);
      } catch (error) {
        errorBox.textContent = error.message;
        submit.disabled = false;
        editing();
        if (date) loadAvailability().then(rows => { availabilityRows = rows || []; refreshAvailability(); }).catch(() => {});
        return;
      }

      const message = buildWhatsAppMessage({ ...reviewedRequest, registered });
      submit.disabled = false;
      openWhatsApp(message);
      close();
    });

    if (savedContact) professionalSelect.focus();
    else nameInput.focus();
  }

  cta.addEventListener("click", (event) => {
    const items = selectedItems();
    if (!items.length) return;
    event.preventDefault();
    openRequestModal();
  });
})();
