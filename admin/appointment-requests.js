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

  async function loadRequests() {
    const { data, error } = await db
      .from("appointments")
      .select("id,client_name,client_phone,service_name,amount,appointment_at,request_status,notes")
      .eq("request_status", "pendente")
      .order("appointment_at", { ascending: true });

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

    if (error) {
      alert(error.message);
      return;
    }

    await renderRequests();
    if (typeof window.renderAppointments === "function") window.renderAppointments();
  }

  async function renderRequests() {
    const content = document.getElementById("content");
    if (!content) return;

    let requests;
    try {
      requests = await loadRequests();
    } catch (error) {
      console.warn("Não foi possível carregar solicitações.", error);
      return;
    }

    const old = document.getElementById("appointmentRequestsCard");
    old?.remove();

    const nav = document.querySelector('[data-view="appointments"]');
    let badge = document.getElementById("appointmentRequestBadge");
    if (requests.length) {
      if (!badge) {
        badge = document.createElement("span");
        badge.id = "appointmentRequestBadge";
        badge.style.cssText = "display:inline-grid;place-items:center;min-width:20px;height:20px;padding:0 6px;margin-left:8px;border-radius:999px;background:#c34d78;color:#fff;font-size:10px;font-weight:700;";
        nav?.appendChild(badge);
      }
      badge.textContent = requests.length;
    } else {
      badge?.remove();
    }

    if (!requests.length) return;

    const card = document.createElement("div");
    card.id = "appointmentRequestsCard";
    card.className = "card";
    card.style.marginBottom = "18px";
    card.innerHTML = `
      <div class="card-head">
        <div><h3>🔔 Novas solicitações</h3><p>Agendamentos enviados pelo site aguardando confirmação.</p></div>
        <strong style="color:#c34d78">${requests.length} pendente${requests.length === 1 ? "" : "s"}</strong>
      </div>
      <div id="appointmentRequestList"></div>
    `;

    const list = card.querySelector("#appointmentRequestList");
    list.innerHTML = requests.map((request) => `
      <div class="service" data-request-id="${esc(request.id)}">
        <div class="service-main">
          <strong>${esc(request.client_name)}</strong>
          <div class="empty">${esc(request.service_name || "Serviço não informado")}</div>
          <div class="empty">📱 ${esc(request.client_phone || "Sem WhatsApp")}</div>
          <div class="empty">📅 ${dateTime(request.appointment_at)}</div>
        </div>
        <div class="price">${money(request.amount)}</div>
        <div style="display:flex;gap:7px;flex-wrap:wrap">
          <button class="primary" type="button" data-request-confirm="${esc(request.id)}" style="width:auto;padding:9px 13px">Confirmar</button>
          <button class="action danger" type="button" data-request-reject="${esc(request.id)}">Recusar</button>
        </div>
      </div>
    `).join("");

    content.prepend(card);

    list.querySelectorAll("[data-request-confirm]").forEach((button) => {
      button.addEventListener("click", () => updateRequest(button.dataset.requestConfirm, true));
    });
    list.querySelectorAll("[data-request-reject]").forEach((button) => {
      button.addEventListener("click", () => updateRequest(button.dataset.requestReject, false));
    });
  }

  function schedule() {
    const appointmentsNav = document.querySelector('[data-view="appointments"]');
    if (!appointmentsNav) return;
    appointmentsNav.addEventListener("click", () => setTimeout(renderRequests, 250));
    setTimeout(renderRequests, 700);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", schedule);
  else schedule();
})();
