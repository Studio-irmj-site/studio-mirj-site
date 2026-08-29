(() => {
  "use strict";

  const config = window.SUPABASE_CONFIG || {};
  const cta = document.querySelector("#ctaButton");
  if (!cta || !config.url || !config.anonKey) return;

  const esc = (value) => String(value ?? "").replace(/[&<>\"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  })[char]);

  function selectedItems() {
    return [...document.querySelectorAll(".service-card[aria-pressed='true']")].map((card) => ({
      name: card.querySelector(".service-card__copy strong")?.textContent?.trim() || "Serviço",
      price: Number((card.querySelector(".service-card__price strong")?.textContent || "0").replace(/[^0-9,]/g, "").replace(/\./g, "").replace(",", ".")) || 0,
    }));
  }

  function localDateValue() {
    const now = new Date();
    const pad = (value) => String(value).padStart(2, "0");
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  }

  function openRequestModal() {
    if (document.querySelector("#appointmentRequestModal")) return;

    const items = selectedItems();
    const total = items.reduce((sum, item) => sum + item.price, 0);
    const servicesText = items.map((item) => item.name).join(", ");

    const style = document.createElement("style");
    style.id = "appointment-request-style";
    style.textContent = `
      .request-modal{position:fixed;inset:0;z-index:9999;display:grid;place-items:center;padding:20px;background:rgba(49,20,32,.48);backdrop-filter:blur(5px)}
      .request-card{width:min(520px,100%);max-height:90vh;overflow:auto;background:#fff;border:1px solid rgba(75,22,48,.12);border-radius:24px;padding:28px;box-shadow:0 24px 70px rgba(49,20,32,.25);color:#311420}
      .request-card h3{margin:0 0 7px;font-family:'Playfair Display',serif;font-size:28px;color:#4b1630}.request-card p{margin:0 0 20px;color:#785c68;font-size:14px;line-height:1.5}
      .request-summary{padding:14px 16px;margin-bottom:18px;border-radius:15px;background:#fff5f7;border:1px solid rgba(217,77,120,.16);font-size:13px}.request-summary strong{display:block;color:#4b1630;margin-bottom:5px}
      .request-grid{display:grid;grid-template-columns:1fr 1fr;gap:4px 12px}.request-field{display:block;font-size:12px;font-weight:700;margin:10px 0}.request-field.full{grid-column:1/-1}.request-field input{width:100%;margin-top:6px;padding:12px;border:1px solid rgba(75,22,48,.16);border-radius:12px;font:inherit;box-sizing:border-box}.request-field input:focus{outline:none;border-color:#d94d78;box-shadow:0 0 0 3px rgba(217,77,120,.1)}
      .request-actions{display:flex;gap:10px;margin-top:20px}.request-actions button{flex:1;padding:13px;border-radius:12px;font-weight:700}.request-cancel{background:#f8f3f5;color:#4b1630}.request-submit{background:linear-gradient(135deg,#d94d78,#4b1630);color:#fff}.request-submit:disabled{opacity:.6;cursor:wait}.request-error{min-height:18px;color:#b3264d!important;margin:10px 0 0!important;font-size:12px!important}
      @media(max-width:520px){.request-grid{grid-template-columns:1fr}.request-field.full{grid-column:auto}.request-card{padding:22px}}
    `;
    document.head.append(style);

    const modal = document.createElement("div");
    modal.id = "appointmentRequestModal";
    modal.className = "request-modal";
    modal.innerHTML = `
      <div class="request-card" role="dialog" aria-modal="true" aria-labelledby="requestTitle">
        <h3 id="requestTitle">Solicitar atendimento</h3>
        <p>Preencha seus dados e escolha quando gostaria de ser atendida. Sua solicitação será enviada para o Studio para confirmação.</p>
        <div class="request-summary"><strong>Serviço(s) selecionado(s)</strong><span>${esc(servicesText)}</span><br><strong>Valor estimado</strong><span>R$ ${total.toFixed(2).replace('.', ',')}</span></div>
        <form id="appointmentRequestForm">
          <div class="request-grid">
            <label class="request-field">Nome completo<input id="requestName" required maxlength="120" autocomplete="name"></label>
            <label class="request-field">WhatsApp<input id="requestPhone" required maxlength="20" inputmode="tel" autocomplete="tel" placeholder="(11) 99999-9999"></label>
            <label class="request-field">Data desejada<input id="requestDate" type="date" required min="${localDateValue()}"></label>
            <label class="request-field">Horário desejado<input id="requestTime" type="time" required step="1800"></label>
          </div>
          <p id="requestError" class="request-error"></p>
          <div class="request-actions"><button class="request-cancel" type="button" id="requestCancel">Cancelar</button><button class="request-submit" type="submit" id="requestSubmit">Solicitar atendimento</button></div>
        </form>
      </div>
    `;
    document.body.append(modal);

    const close = () => {
      modal.remove();
      style.remove();
    };
    modal.querySelector("#requestCancel").addEventListener("click", close);
    modal.addEventListener("click", (event) => { if (event.target === modal) close(); });

    modal.querySelector("#appointmentRequestForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const name = modal.querySelector("#requestName").value.trim();
      const phone = modal.querySelector("#requestPhone").value.replace(/\D/g, "");
      const date = modal.querySelector("#requestDate").value;
      const time = modal.querySelector("#requestTime").value;
      const errorBox = modal.querySelector("#requestError");
      const submit = modal.querySelector("#requestSubmit");

      if (!name || phone.length < 10 || !date || !time) {
        errorBox.textContent = "Preencha nome, WhatsApp, data e horário.";
        return;
      }

      const requestedAt = new Date(`${date}T${time}:00`);
      if (Number.isNaN(requestedAt.getTime()) || requestedAt <= new Date()) {
        errorBox.textContent = "Escolha uma data e horário futuros.";
        return;
      }

      const serviceId = document.querySelector(".service-card[aria-pressed='true']")?.dataset?.serviceId || null;
      const primaryService = items[0];
      submit.disabled = true;
      submit.textContent = "Enviando solicitação…";
      errorBox.textContent = "";

      try {
        const response = await fetch(`${config.url}/rest/v1/appointments`, {
          method: "POST",
          headers: {
            apikey: config.anonKey,
            Authorization: `Bearer ${config.anonKey}`,
            "Content-Type": "application/json",
            Prefer: "return=minimal",
          },
          body: JSON.stringify({
            client_name: name,
            client_phone: phone,
            service_id: serviceId,
            service_name: servicesText,
            amount: Number(total.toFixed(2)),
            appointment_at: requestedAt.toISOString(),
            status: "agendado",
            request_status: "pendente",
            notes: `Nova solicitação pelo site. Serviços: ${servicesText}. Aguardando confirmação do Studio.`,
            counted_as_revenue: false,
          }),
        });

        if (!response.ok) {
          const detail = await response.text().catch(() => "");
          throw new Error(`Não foi possível registrar a solicitação (${response.status}). ${detail}`);
        }

        const studioPhone = (window.SUPABASE_STUDIO_PHONE || "5511986344770").replace(/\D/g, "");
        const dateText = requestedAt.toLocaleDateString("pt-BR");
        const timeText = requestedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
        const message = [
          "🔔 Nova solicitação de agendamento!",
          "",
          `Cliente: ${name}`,
          `WhatsApp: ${phone}`,
          `Serviço: ${servicesText}`,
          `Data: ${dateText}`,
          `Horário: ${timeText}`,
          "",
          "Entre no Painel ADM para visualizar os dados completos e confirmar o atendimento.",
        ].join("\n");
        const whatsappUrl = `https://wa.me/${studioPhone}?text=${encodeURIComponent(message)}`;

        modal.querySelector(".request-card").innerHTML = `<h3>Solicitação enviada ✓</h3><p>Sua solicitação foi registrada no Studio. Agora você será direcionada ao WhatsApp para avisar a equipe.</p><div class="request-summary"><strong>Data</strong><span>${esc(dateText)} às ${esc(timeText)}</span><br><strong>Serviço</strong><span>${esc(servicesText)}</span></div>`;
        setTimeout(() => {
          window.location.href = whatsappUrl;
        }, 350);
      } catch (error) {
        console.error(error);
        errorBox.textContent = error.message || "Não foi possível enviar a solicitação. Tente novamente.";
        submit.disabled = false;
        submit.textContent = "Solicitar atendimento";
      }
    });

    modal.querySelector("#requestName").focus();
  }

  cta.addEventListener("click", (event) => {
    if (!selectedItems().length) return;
    event.preventDefault();
    openRequestModal();
  });
})();
