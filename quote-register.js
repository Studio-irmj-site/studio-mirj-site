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
    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  }

  function dateLabel(value) {
    if (!value) return "";
    const [y, m, d] = value.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });
  }

  async function loadAvailability() {
    if (!config.url || !config.anonKey) return [];
    const response = await fetch(`${config.url}/rest/v1/rpc/get_public_available_slots`, {
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
    const dates = [...new Set((rows || []).map((row) => row.available_date).filter(Boolean))];
    const current = dateSelect.value;
    dateSelect.innerHTML = `<option value="">A combinar</option>` + dates.map((date) => `<option value="${esc(date)}">${esc(dateLabel(date))}</option>`).join("");
    if (dates.includes(current)) dateSelect.value = current;

    const times = (rows || []).filter((row) => row.available_date === dateSelect.value);
    timeSelect.innerHTML = `<option value="">A combinar</option>` + times.map((row) => {
      const t = timeValue(row.available_time);
      return `<option value="${esc(t)}">${esc(t)}</option>`;
    }).join("");
    timeSelect.disabled = false;
  }

  function servicesText(items) {
    return items.map((item) => `${item.quantity}x ${item.name}`).join(", ");
  }

  function serviceNotes(items) {
    return items.map((item) => `${item.quantity}x ${item.name} — ${money(item.price)} cada — subtotal ${money(item.price * item.quantity)}`).join(" | ");
  }

  function buildWhatsAppMessage({ name, phone, items, date, time, notes, registered }) {
    const lines = [
      "Orçamento — Espaço I.R",
      "",
      `Cliente: ${name}`,
      `WhatsApp: ${phone}`,
      `Serviços: ${servicesText(items)}`,
      `Valor estimado: ${money(total(items))}`,
      date ? `Data desejada: ${dateLabel(date)}` : "Data desejada: a combinar",
      time ? `Horário desejado: ${time}` : "Horário desejado: a combinar",
      notes ? `Observação: ${notes}` : "",
      "",
      registered ? "Solicitação registrada no Painel ADM." : "Solicitação enviada pelo site; confirmação pelo WhatsApp.",
    ];
    return lines.filter(Boolean).join("\n");
  }

  async function tryRegister({ name, phone, items, date, time, notes }) {
    if (!config.url || !config.anonKey || !date || !time) return false;
    const response = await fetch(`${config.url}/rest/v1/rpc/create_appointment_request`, {
      method: "POST",
      headers: {
        apikey: config.anonKey,
        Authorization: `Bearer ${config.anonKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_client_name: name,
        p_client_phone: phone,
        p_service_id: items.length === 1 ? (items[0]?.id || null) : null,
        p_service_name: servicesText(items),
        p_amount: Number(total(items).toFixed(2)),
        p_available_date: date,
        p_available_time: `${time}:00`,
        p_notes: [
          `Itens: ${serviceNotes(items)}`,
          notes ? `Observação da cliente: ${notes}` : "",
          "Origem: página pública do Espaço I.R.",
          "Status inicial: Pendente.",
        ].filter(Boolean).join("\n"),
      }),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      if (/HORARIO_INDISPONIVEL/i.test(detail)) throw new Error("Esse horário acabou de ser reservado. Escolha outro ou deixe a combinar.");
      return false;
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
        .request-card{width:min(620px,100%);max-height:92vh;overflow:auto;background:#fff;border-radius:26px;padding:28px;box-shadow:0 28px 80px rgba(49,20,32,.32);color:#311420}
        .request-card h3{margin:0 0 7px;font-family:'Playfair Display',serif;font-size:29px;color:#4b1630}.request-card>p{margin:0 0 18px;color:#785c68;font-size:13px;line-height:1.55}
        .request-items{display:grid;gap:8px;margin-bottom:14px}.request-item{display:grid;grid-template-columns:1fr auto;gap:10px;align-items:center;padding:12px 14px;border:1px solid rgba(75,22,48,.1);border-radius:15px;background:#fcf9ff}.request-item strong{display:block;font-size:13px}.request-item small{display:block;margin-top:3px;color:#785c68;font-size:11px}.request-item__controls{display:flex;align-items:center;gap:7px}.request-item__controls button{width:30px;height:30px;border:1px solid rgba(75,22,48,.14);border-radius:9px;background:#fff;color:#4b1630;font-weight:800}.request-item__qty{min-width:20px;text-align:center;font-weight:800}
        .request-total{display:flex;justify-content:space-between;align-items:center;padding:14px 16px;margin-bottom:16px;border-radius:15px;background:linear-gradient(135deg,#f5efff,#fff5f8)}.request-total span{font-size:12px;color:#785c68}.request-total strong{font:600 21px 'Playfair Display',serif;color:#4b1630}
        .request-grid{display:grid;grid-template-columns:1fr 1fr;gap:4px 12px}.request-field{display:block;margin:9px 0;font-size:12px;font-weight:700}.request-field.full{grid-column:1/-1}.request-field input,.request-field select,.request-field textarea{width:100%;margin-top:6px;padding:12px;border:1px solid rgba(75,22,48,.16);border-radius:12px;background:#fff;color:#311420;font:inherit;box-sizing:border-box}.request-field textarea{min-height:82px;resize:vertical}
        .availability-help{margin:5px 0 0!important;color:#8a6b77!important;font-size:11px!important}.request-error{min-height:18px;margin:9px 0 0!important;color:#b3264d!important;font-size:12px!important}.request-info{min-height:18px;margin:5px 0 0!important;color:#6b5872!important;font-size:11px!important}
        .request-actions{display:flex;gap:10px;margin-top:18px}.request-actions button{flex:1;padding:13px;border:0;border-radius:12px;font-weight:700}.request-cancel{background:#f5f0f8;color:#4b1630}.request-submit{background:linear-gradient(135deg,#8b63c7,#4b1630);color:#fff}.request-submit:disabled{opacity:.65}
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
        <p>Confira os serviços e envie seu orçamento. Data e horário são opcionais: se não houver disponibilidade carregada, você ainda pode enviar pelo WhatsApp.</p>
        <div id="requestItems" class="request-items"></div>
        <div class="request-total"><span>Valor total estimado</span><strong id="requestTotal">${money(total(items))}</strong></div>
        <form id="appointmentRequestForm">
          <div class="request-grid">
            <label class="request-field">Nome completo<input id="requestName" required maxlength="120" autocomplete="name"></label>
            <label class="request-field">WhatsApp<input id="requestPhone" required maxlength="20" inputmode="tel" autocomplete="tel" placeholder="(11) 99999-9999"></label>
            <label class="request-field">Data desejada<select id="requestDate"><option value="">Carregando…</option></select></label>
            <label class="request-field">Horário desejado<select id="requestTime"><option value="">A combinar</option></select></label>
            <label class="request-field full">Observação<textarea id="requestNotes" maxlength="500" placeholder="Detalhes do serviço ou preferência de horário."></textarea></label>
          </div>
          <p class="availability-help">Se preferir, deixe data e horário como “A combinar”.</p>
          <p id="requestInfo" class="request-info">Carregando horários disponíveis…</p>
          <p id="requestError" class="request-error"></p>
          <div class="request-actions"><button type="button" class="request-cancel" id="requestCancel">Cancelar</button><button type="submit" class="request-submit" id="requestSubmit">Enviar orçamento pelo WhatsApp</button></div>
        </form>
      </div>`;
    document.body.append(modal);

    const itemsBox = modal.querySelector("#requestItems");
    const totalBox = modal.querySelector("#requestTotal");
    const dateSelect = modal.querySelector("#requestDate");
    const timeSelect = modal.querySelector("#requestTime");
    const submit = modal.querySelector("#requestSubmit");
    const errorBox = modal.querySelector("#requestError");
    const infoBox = modal.querySelector("#requestInfo");
    let availabilityRows = [];

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

    const close = () => modal.remove();
    modal.querySelector("#requestCancel").addEventListener("click", close);
    modal.addEventListener("click", (event) => { if (event.target === modal) close(); });
    dateSelect.addEventListener("change", () => populateAvailability(availabilityRows, dateSelect, timeSelect));

    loadAvailability().then((rows) => {
      availabilityRows = rows || [];
      populateAvailability(availabilityRows, dateSelect, timeSelect);
      infoBox.textContent = availabilityRows.length ? "Horários carregados. Você também pode deixar a combinar." : "Sem horários publicados no momento; o orçamento pode ser enviado normalmente.";
    }).catch((error) => {
      console.warn(error);
      availabilityRows = [];
      populateAvailability([], dateSelect, timeSelect);
      infoBox.textContent = "Não foi possível carregar a agenda agora; o orçamento continua disponível pelo WhatsApp.";
    });

    modal.querySelector("#appointmentRequestForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const name = modal.querySelector("#requestName").value.trim();
      const phone = modal.querySelector("#requestPhone").value.replace(/\D/g, "");
      const date = dateSelect.value;
      const time = timeSelect.value;
      const notes = modal.querySelector("#requestNotes").value.trim();

      if (!name || phone.length < 10) {
        errorBox.textContent = "Preencha seu nome e um WhatsApp válido.";
        return;
      }
      if ((date && !time) || (!date && time)) {
        errorBox.textContent = "Escolha data e horário juntos ou deixe ambos como “A combinar”.";
        return;
      }

      errorBox.textContent = "";
      submit.disabled = true;
      submit.textContent = "Preparando WhatsApp…";

      let registered = false;
      try {
        registered = await tryRegister({ name, phone, items, date, time, notes });
      } catch (error) {
        errorBox.textContent = error.message;
        submit.disabled = false;
        submit.textContent = "Enviar orçamento pelo WhatsApp";
        return;
      }

      const message = buildWhatsAppMessage({ name, phone, items, date, time, notes, registered });
      openWhatsApp(message);
      close();
    });

    modal.querySelector("#requestName").focus();
  }

  cta.addEventListener("click", (event) => {
    const items = selectedItems();
    if (!items.length) return;
    event.preventDefault();
    openRequestModal();
  });
})();