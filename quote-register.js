(() => {
  "use strict";

  const config = window.SUPABASE_CONFIG || {};
  const cta = document.querySelector("#ctaButton");
  if (!cta || !config.url || !config.anonKey) return;

  const esc = (value) => String(value ?? "").replace(/[&<>\"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
  })[char]);

  function selectedItems() {
    return [...document.querySelectorAll(".service-card[aria-pressed='true']")].map((card) => ({
      id: card.dataset.serviceId || null,
      name: card.querySelector(".service-card__copy strong")?.textContent?.trim() || "Serviço",
      price: Number((card.querySelector(".service-card__price strong")?.textContent || "0").replace(/[^0-9,]/g, "").replace(/\./g, "").replace(",", ".")) || 0,
    }));
  }

  function localDateValue() {
    const now = new Date();
    const pad = (value) => String(value).padStart(2, "0");
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  }

  async function loadAvailability() {
    const response = await fetch(`${config.url}/rest/v1/rpc/get_public_available_slots`, {
      method: "POST",
      headers: {
        apikey: config.anonKey,
        Authorization: `Bearer ${config.anonKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_from_date: localDateValue() }),
    });
    if (!response.ok) throw new Error("Não foi possível carregar os horários disponíveis.");
    return response.json();
  }

  function dateLabel(value) {
    const [y, m, d] = String(value).split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("pt-BR", {
      weekday: "long", day: "2-digit", month: "2-digit", year: "numeric",
    }).replace(/^./, (c) => c.toUpperCase());
  }

  function timeValue(value) {
    return String(value || "").slice(0, 5);
  }

  function populateAvailability(rows, dateSelect, timeSelect) {
    const dates = [...new Set(rows.map((row) => row.available_date))];
    const selectedDate = dateSelect.value || dates[0] || "";
    dateSelect.innerHTML = dates.length
      ? dates.map((date) => `<option value="${esc(date)}">${esc(dateLabel(date))}</option>`).join("")
      : `<option value="">Nenhuma data disponível</option>`;
    dateSelect.value = dates.includes(selectedDate) ? selectedDate : (dates[0] || "");

    const times = rows.filter((row) => row.available_date === dateSelect.value);
    timeSelect.innerHTML = times.length
      ? times.map((row) => `<option value="${esc(timeValue(row.available_time))}">${esc(timeValue(row.available_time))}</option>`).join("")
      : `<option value="">Nenhum horário disponível</option>`;
    timeSelect.disabled = !times.length;
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
      .request-grid{display:grid;grid-template-columns:1fr 1fr;gap:4px 12px}.request-field{display:block;font-size:12px;font-weight:700;margin:10px 0}.request-field.full{grid-column:1/-1}.request-field input,.request-field select{width:100%;margin-top:6px;padding:12px;border:1px solid rgba(75,22,48,.16);border-radius:12px;font:inherit;box-sizing:border-box;background:#fff}.request-field input:focus,.request-field select:focus{outline:none;border-color:#d94d78;box-shadow:0 0 0 3px rgba(217,77,120,.1)}
      .request-actions{display:flex;gap:10px;margin-top:20px}.request-actions button{flex:1;padding:13px;border-radius:12px;font-weight:700}.request-cancel{background:#f8f3f5;color:#4b1630}.request-submit{background:linear-gradient(135deg,#d94d78,#4b1630);color:#fff}.request-submit:disabled{opacity:.6;cursor:wait}.request-error{min-height:18px;color:#b3264d!important;margin:10px 0 0!important;font-size:12px!important}
      .availability-help{font-size:11px!important;margin:5px 0 0!important;color:#8a6b77!important}
      @media(max-width:520px){.request-grid{grid-template-columns:1fr}.request-field.full{grid-column:auto}.request-card{padding:22px}}
    `;
    document.head.append(style);

    const modal = document.createElement("div");
    modal.id = "appointmentRequestModal";
    modal.className = "request-modal";
    modal.innerHTML = `
      <div class="request-card" role="dialog" aria-modal="true" aria-labelledby="requestTitle">
        <h3 id="requestTitle">Solicitar atendimento</h3>
        <p>Escolha uma data e horário liberados pelo Studio. Primeiro registraremos sua solicitação; depois abriremos o WhatsApp para avisar a equipe.</p>
        <div class="request-summary"><strong>Serviço(s) selecionado(s)</strong><span>${esc(servicesText)}</span><br><strong>Valor estimado</strong><span>R$ ${total.toFixed(2).replace('.', ',')}</span></div>
        <form id="appointmentRequestForm">
          <div class="request-grid">
            <label class="request-field">Nome completo<input id="requestName" required maxlength="120" autocomplete="name"></label>
            <label class="request-field">WhatsApp<input id="requestPhone" required maxlength="20" inputmode="tel" autocomplete="tel" placeholder="(11) 99999-9999"></label>
            <label class="request-field">Data disponível<select id="requestDate" required><option value="">Carregando datas...</option></select></label>
            <label class="request-field">Horário disponível<select id="requestTime" required disabled><option value="">Carregando horários...</option></select></label>
          </div>
          <p class="availability-help">Os dias e horários exibidos são definidos pelo Studio no Painel ADM.</p>
          <p id="requestError" class="request-error"></p>
          <div class="request-actions"><button class="request-cancel" type="button" id="requestCancel">Cancelar</button><button class="request-submit" type="submit" id="requestSubmit" disabled>Carregando horários…</button></div>
        </form>
      </div>
    `;
    document.body.append(modal);

    const dateSelect = modal.querySelector("#requestDate");
    const timeSelect = modal.querySelector("#requestTime");
    const submit = modal.querySelector("#requestSubmit");
    const errorBox = modal.querySelector("#requestError");
    let availabilityRows = [];

    const close = () => {
      modal.remove();
      style.remove();
    };
    modal.querySelector("#requestCancel").addEventListener("click", close);
    modal.addEventListener("click", (event) => { if (event.target === modal) close(); });
    dateSelect.addEventListener("change", () => populateAvailability(availabilityRows, dateSelect, timeSelect));

    (async () => {
      try {
        availabilityRows = await loadAvailability();
        populateAvailability(availabilityRows, dateSelect, timeSelect);
        if (!availabilityRows.length) {
          errorBox.textContent = "No momento não há datas e horários disponíveis. Tente novamente mais tarde.";
          submit.disabled = true;
          submit.textContent = "Sem horários disponíveis";
        } else {
          submit.disabled = false;
          submit.textContent = "Confirmar solicitação";
        }
      } catch (error) {
        console.error(error);
        errorBox.textContent = error.message || "Não foi possível carregar a disponibilidade.";
        submit.disabled = true;
        submit.textContent = "Horários indisponíveis";
      }
    })();

    modal.querySelector("#appointmentRequestForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const name = modal.querySelector("#requestName").value.trim();
      const phone = modal.querySelector("#requestPhone").value.replace(/\D/g, "");
      const date = dateSelect.value;
      const time = timeSelect.value;

      if (!name || phone.length < 10 || !date || !time) {
        errorBox.textContent = "Preencha nome, WhatsApp, data e horário.";
        return;
      }

      const allowed = availabilityRows.some((row) => row.available_date === date && timeValue(row.available_time) === time);
      if (!allowed) {
        errorBox.textContent = "Esse horário não está mais disponível. Atualize a página e tente novamente.";
        return;
      }

      submit.disabled = true;
      submit.textContent = "Registrando…";
      errorBox.textContent = "";

      try {
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
            p_service_id: items[0]?.id || null,
            p_service_name: servicesText,
            p_amount: Number(total.toFixed(2)),
            p_available_date: date,
            p_available_time: `${time}:00`,
            p_notes: `Nova solicitação pelo site. Serviços: ${servicesText}. Aguardando confirmação do Studio.`,
          }),
        });

        if (!response.ok) {
          const detail = await response.text().catch(() => "");
          if (/HORARIO_INDISPONIVEL/i.test(detail)) {
            availabilityRows = await loadAvailability();
            populateAvailability(availabilityRows, dateSelect, timeSelect);
            throw new Error("Esse horário acabou de ser reservado. Escolha outro horário disponível.");
          }
          throw new Error(`Não foi possível registrar a solicitação (${response.status}). ${detail}`);
        }

        const studioPhone = (window.SUPABASE_STUDIO_PHONE || "5511986344770").replace(/\D/g, "");
        const requestedAt = new Date(`${date}T${time}:00-03:00`);
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
          `Valor estimado: R$ ${total.toFixed(2).replace('.', ',')}`,
          "",
          "Entre no Painel ADM para visualizar os dados completos e confirmar o atendimento.",
        ].join("\n");
        const whatsappUrl = `https://wa.me/${studioPhone}?text=${encodeURIComponent(message)}`;

        window.location.href = whatsappUrl;
      } catch (error) {
        console.error(error);
        errorBox.textContent = error.message || "Não foi possível enviar a solicitação. Tente novamente.";
        submit.disabled = false;
        submit.textContent = "Confirmar solicitação";
      }
    });

    modal.querySelector("#requestName").focus();
  }

  cta.addEventListener("click", (event) => {
    event.preventDefault();
    if (!selectedItems().length) return;
    openRequestModal();
  });
})();
