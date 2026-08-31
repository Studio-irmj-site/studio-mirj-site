(() => {
  "use strict";

  const config = window.SUPABASE_CONFIG || {};
  if (!window.supabase || !config.url || !config.anonKey) return;

  const db = window.supabase.createClient(config.url, config.anonKey);
  const esc = (value) => String(value ?? "").replace(/[&<>\"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
  })[char]);

  function money(value) {
    return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  function dateTime(value) {
    return new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  }

  function cleanPhone(value) {
    const digits = String(value || "").replace(/\D/g, "");
    return digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;
  }

  function whatsappUrl(phone, message) {
    return `https://wa.me/${cleanPhone(phone)}?text=${encodeURIComponent(message)}`;
  }

  async function loadRequests(status = "pendente") {
    let query = db
      .from("appointments")
      .select("id,client_name,client_phone,service_name,amount,appointment_at,request_status,status,notes,created_at,updated_at")
      .order("appointment_at", { ascending: true });

    if (status !== "todos") query = query.eq("request_status", status);
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  async function updateRequest(id, approved) {
    const requestStatus = approved ? "confirmado" : "recusado";
    const appointmentStatus = approved ? "confirmado" : "cancelado";
    const { error } = await db.from("appointments").update({
      request_status: requestStatus,
      status: appointmentStatus,
      updated_at: new Date().toISOString(),
      counted_as_revenue: false,
    }).eq("id", id);

    if (error) throw error;
  }

  async function pendingCount() {
    const { count, error } = await db
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("request_status", "pendente");
    if (error) return 0;
    return count || 0;
  }

  function ensureStyles() {
    if (document.getElementById("budget-center-styles")) return;
    const style = document.createElement("style");
    style.id = "budget-center-styles";
    style.textContent = `
      .budget-toolbar{display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap;margin:0 0 16px}
      .budget-filters{display:flex;gap:8px;flex-wrap:wrap}
      .budget-filter{border:1px solid rgba(75,22,48,.13);border-radius:999px;padding:9px 13px;background:#fff;color:#6f5160;font-weight:700;cursor:pointer}
      .budget-filter.active{background:#4b1630;color:#fff;border-color:#4b1630}
      .budget-list{display:grid;gap:12px}
      .budget-item{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:16px;border:1px solid rgba(75,22,48,.11);border-radius:20px;padding:18px;background:#fff;box-shadow:0 8px 24px rgba(75,22,48,.04)}
      .budget-main{display:grid;gap:7px}.budget-main strong{font-size:16px;color:#4b1630}.budget-meta{display:flex;gap:10px;flex-wrap:wrap;color:#7b6470;font-size:12px}.budget-note{margin:3px 0 0;color:#6f5964;font-size:12px;line-height:1.5}
      .budget-value{text-align:right}.budget-value strong{display:block;color:#9b2f57;font-size:16px}.budget-status{display:inline-flex;margin-top:7px;border-radius:999px;padding:5px 9px;background:#fff0f4;color:#9b2f57;font-size:10px;font-weight:800;text-transform:uppercase}
      .budget-actions{grid-column:1/-1;display:flex;gap:8px;flex-wrap:wrap;border-top:1px solid rgba(75,22,48,.08);padding-top:13px}.budget-actions button,.budget-actions a{display:inline-flex;align-items:center;justify-content:center;min-height:38px;border-radius:10px;padding:0 13px;font-weight:700;text-decoration:none}.budget-confirm{border:0;background:#4b1630;color:white}.budget-reject{border:1px solid #c84c66;background:white;color:#a52d49}.budget-whatsapp{border:1px solid #2c8d61;background:#f5fff9;color:#23734f}.budget-empty{padding:32px;text-align:center;color:#7b6470;border:1px dashed rgba(75,22,48,.16);border-radius:18px;background:rgba(255,255,255,.65)}
      .nav-budget-badge{display:inline-grid;place-items:center;min-width:20px;height:20px;padding:0 6px;margin-left:auto;border-radius:999px;background:#9b2f57;color:#fff;font-size:10px;font-weight:800}
      @media(max-width:640px){.budget-item{grid-template-columns:1fr}.budget-value{text-align:left}.budget-actions{grid-column:auto}.budget-actions>*{flex:1 1 140px}}
    `;
    document.head.append(style);
  }

  async function refreshBadge() {
    const badge = document.getElementById("budgetRequestBadge");
    if (!badge) return;
    const count = await pendingCount();
    badge.textContent = String(count);
    badge.hidden = count === 0;
  }

  function installBudgetNav() {
    const agendaNav = document.querySelector('[data-view="appointments"]');
    if (!agendaNav || document.querySelector('[data-budget-nav="true"]')) return;

    const button = document.createElement("button");
    button.className = "nav";
    button.type = "button";
    button.dataset.budgetNav = "true";
    button.title = "Orçamentos";
    button.innerHTML = `
      <svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16v16H4z"></path><path d="M7 8h10M7 12h7M7 16h5"></path></svg>
      <span>Orçamentos</span>
      <span id="budgetRequestBadge" class="nav-budget-badge" hidden></span>
    `;
    agendaNav.parentNode.insertBefore(button, agendaNav);

    button.addEventListener("click", async (event) => {
      event.preventDefault();
      document.querySelectorAll(".nav").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      const title = document.getElementById("title");
      if (title) title.textContent = "Orçamentos";
      await renderBudgetCenter("pendente");
    });

    refreshBadge();
  }

  async function renderBudgetCenter(initialStatus = "pendente") {
    ensureStyles();
    const content = document.getElementById("content");
    if (!content) return;

    content.innerHTML = `
      <div class="card">
        <div class="card-head">
          <div><h3>Orçamentos e solicitações</h3><p>Pedidos enviados pelo site da cliente e aguardando ação do Studio.</p></div>
        </div>
        <div class="budget-toolbar">
          <div class="budget-filters" role="group" aria-label="Filtrar solicitações">
            <button class="budget-filter ${initialStatus === "pendente" ? "active" : ""}" data-budget-filter="pendente">Pendentes</button>
            <button class="budget-filter ${initialStatus === "confirmado" ? "active" : ""}" data-budget-filter="confirmado">Confirmados</button>
            <button class="budget-filter ${initialStatus === "recusado" ? "active" : ""}" data-budget-filter="recusado">Recusados</button>
            <button class="budget-filter ${initialStatus === "todos" ? "active" : ""}" data-budget-filter="todos">Todos</button>
          </div>
          <button class="action" id="budgetRefresh" type="button">Atualizar</button>
        </div>
        <div id="budgetRequestList" class="budget-list"><div class="budget-empty">Carregando solicitações…</div></div>
      </div>
    `;

    const load = async (status) => {
      const list = document.getElementById("budgetRequestList");
      if (!list) return;
      list.innerHTML = '<div class="budget-empty">Carregando solicitações…</div>';
      try {
        const rows = await loadRequests(status);
        if (!rows.length) {
          list.innerHTML = '<div class="budget-empty">Nenhuma solicitação encontrada neste filtro.</div>';
          return;
        }

        list.innerHTML = rows.map((request) => {
          const confirmation = `Olá, ${request.client_name || "cliente"}! Seu horário no Espaço I.R foi confirmado para ${dateTime(request.appointment_at)}. Serviço: ${request.service_name || "serviço"}.`;
          return `
            <article class="budget-item" data-request-id="${esc(request.id)}">
              <div class="budget-main">
                <strong>${esc(request.client_name || "Cliente não informado")}</strong>
                <div class="budget-meta"><span>${esc(request.client_phone || "Sem WhatsApp")}</span><span>${esc(request.service_name || "Serviço não informado")}</span><span>${dateTime(request.appointment_at)}</span></div>
                ${request.notes ? `<p class="budget-note">${esc(request.notes)}</p>` : ""}
              </div>
              <div class="budget-value"><strong>${money(request.amount)}</strong><span class="budget-status">${esc(request.request_status || "pendente")}</span></div>
              <div class="budget-actions">
                ${request.request_status === "pendente" ? `<button class="budget-confirm" type="button" data-request-confirm="${esc(request.id)}">Confirmar</button><button class="budget-reject" type="button" data-request-reject="${esc(request.id)}">Recusar</button>` : ""}
                ${request.client_phone ? `<a class="budget-whatsapp" href="${whatsappUrl(request.client_phone, confirmation)}" target="_blank" rel="noopener noreferrer">Abrir WhatsApp</a>` : ""}
              </div>
            </article>
          `;
        }).join("");

        list.querySelectorAll("[data-request-confirm]").forEach((button) => {
          button.addEventListener("click", async () => {
            button.disabled = true;
            const original = button.textContent;
            button.textContent = "Confirmando…";
            try {
              await updateRequest(button.dataset.requestConfirm, true);
              await load(status);
              await refreshBadge();
              if (typeof window.renderAppointments === "function") window.renderAppointments();
            } catch (error) {
              alert(error.message || "Não foi possível confirmar a solicitação.");
              button.disabled = false;
              button.textContent = original;
            }
          });
        });

        list.querySelectorAll("[data-request-reject]").forEach((button) => {
          button.addEventListener("click", async () => {
            if (!confirm("Recusar esta solicitação?")) return;
            button.disabled = true;
            const original = button.textContent;
            button.textContent = "Recusando…";
            try {
              await updateRequest(button.dataset.requestReject, false);
              await load(status);
              await refreshBadge();
              if (typeof window.renderAppointments === "function") window.renderAppointments();
            } catch (error) {
              alert(error.message || "Não foi possível recusar a solicitação.");
              button.disabled = false;
              button.textContent = original;
            }
          });
        });
      } catch (error) {
        list.innerHTML = `<div class="budget-empty">${esc(error.message || "Não foi possível carregar as solicitações.")}</div>`;
      }
    };

    content.querySelectorAll("[data-budget-filter]").forEach((button) => {
      button.addEventListener("click", async () => {
        content.querySelectorAll("[data-budget-filter]").forEach((item) => item.classList.remove("active"));
        button.classList.add("active");
        await load(button.dataset.budgetFilter);
      });
    });

    document.getElementById("budgetRefresh")?.addEventListener("click", async () => {
      const active = content.querySelector("[data-budget-filter].active")?.dataset.budgetFilter || "pendente";
      await load(active);
      await refreshBadge();
    });

    await load(initialStatus);
  }

  function schedule() {
    ensureStyles();
    installBudgetNav();
    refreshBadge();
    setInterval(refreshBadge, 60000);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", schedule);
  else schedule();
})();
