(() => {
  "use strict";

  const config = window.SUPABASE_CONFIG || {};
  if (!window.supabase || !config.url || !config.anonKey) return;

  const db = window.supabase.createClient(config.url, config.anonKey);
  let selectedPeriod = "month";
  let customStart = "";
  let customEnd = "";
  let busy = false;

  const money = (value) => Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);

  function periodRange(period) {
    const now = new Date();

    if (period === "today") {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return [start, new Date(start.getTime() + 86400000)];
    }
    if (period === "7") {
      return [
        new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6),
        new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1),
      ];
    }
    if (period === "prev") {
      return [
        new Date(now.getFullYear(), now.getMonth() - 1, 1),
        new Date(now.getFullYear(), now.getMonth(), 1),
      ];
    }
    if (period === "custom") {
      const start = new Date(`${customStart}T00:00:00`);
      const end = new Date(`${customEnd}T00:00:00`);
      end.setDate(end.getDate() + 1);
      return [start, end];
    }
    return [
      new Date(now.getFullYear(), now.getMonth(), 1),
      new Date(now.getFullYear(), now.getMonth() + 1, 1),
    ];
  }

  function groupedRevenue(attendances) {
    const byDay = {};
    const byPayment = {};
    const byService = {};

    attendances.forEach((attendance) => {
      const date = new Date(attendance.attended_at);
      const day = `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}`;
      const amount = Number(attendance.amount || 0);
      const payment = attendance.payment_method || "Não informado";
      const service = attendance.service_name || "Serviço";

      byDay[day] = (byDay[day] || 0) + amount;
      byPayment[payment] = (byPayment[payment] || 0) + amount;
      byService[service] = (byService[service] || 0) + 1;
    });

    return {
      days: Object.entries(byDay).sort(),
      payments: Object.entries(byPayment).sort((first, second) => second[1] - first[1]),
      services: Object.entries(byService).sort((first, second) => second[1] - first[1]),
    };
  }

  function revenueDetailsMarkup(attendances) {
    const { days, payments, services } = groupedRevenue(attendances);
    const maximumDay = Math.max(1, ...days.map(([, value]) => value));

    return `
      <div class="card filter-card">
        <div class="filter-head">
          <div>
            <h3>Período do faturamento</h3>
            <p>Somente atendimentos concluídos entram nestes valores.</p>
          </div>
          <div class="period-controls">
            <select id="revenuePeriod">
              <option value="today">Hoje</option>
              <option value="7">Últimos 7 dias</option>
              <option value="month">Este mês</option>
              <option value="prev">Mês anterior</option>
              <option value="custom">Personalizado</option>
            </select>
            <div id="customDates" class="custom-dates ${selectedPeriod === "custom" ? "show" : ""}">
              <label>De <input id="revenueStart" type="date" value="${escapeHtml(customStart)}"></label>
              <label>Até <input id="revenueEnd" type="date" value="${escapeHtml(customEnd)}"></label>
              <button id="applyRevenueDates" type="button">Aplicar</button>
            </div>
          </div>
        </div>
      </div>
      <div class="dashboard-grid">
        <div class="card">
          <h3>Faturamento por dia</h3>
          <div class="mini-bars">
            ${days.length ? days.map(([day, value]) => `
              <div class="bar-row">
                <span>${escapeHtml(day)}</span>
                <div class="bar"><i style="width:${Math.min(100, value / maximumDay * 100)}%"></i></div>
                <strong>${money(value)}</strong>
              </div>`).join("") : '<p class="empty">Nenhum faturamento no período.</p>'}
          </div>
        </div>
        <div class="card">
          <h3>Formas de pagamento</h3>
          <div class="rank-list">
            ${payments.length ? payments.map(([payment, value]) => `
              <div><span>${escapeHtml(payment)}</span><strong>${money(value)}</strong></div>`).join("") : '<p class="empty">Nenhum pagamento registrado.</p>'}
          </div>
        </div>
        <div class="card">
          <h3>Serviços mais realizados</h3>
          <div class="rank-list">
            ${services.length ? services.map(([service, count]) => `
              <div><span>${escapeHtml(service)}</span><strong>${count} atendimento${count === 1 ? "" : "s"}</strong></div>`).join("") : '<p class="empty">Nenhum serviço realizado.</p>'}
          </div>
        </div>
      </div>`;
  }

  function wirePeriodControls() {
    const periodSelect = document.querySelector("#revenuePeriod");
    if (periodSelect) {
      periodSelect.value = selectedPeriod;
      periodSelect.addEventListener("change", (event) => {
        selectedPeriod = event.target.value;
        if (selectedPeriod === "custom") {
          const now = new Date();
          customStart = customStart || new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
          customEnd = customEnd || now.toISOString().slice(0, 10);
        }
        refreshRevenue();
      });
    }

    document.querySelector("#applyRevenueDates")?.addEventListener("click", () => {
      const start = document.querySelector("#revenueStart")?.value;
      const end = document.querySelector("#revenueEnd")?.value;
      if (!start || !end || start > end) {
        window.alert("Selecione um intervalo de datas válido.");
        return;
      }
      customStart = start;
      customEnd = end;
      selectedPeriod = "custom";
      refreshRevenue();
    });
  }

  async function refreshRevenue() {
    if (busy || document.querySelector("#title")?.textContent !== "Dashboard") return;
    busy = true;

    try {
      const [start, end] = periodRange(selectedPeriod);
      if (selectedPeriod === "custom" && (!customStart || !customEnd || start > end)) return;

      window.DASHBOARD_RANGE = {
        start: start.toISOString(),
        end: end.toISOString(),
        key: selectedPeriod,
      };
      window.dispatchEvent(new CustomEvent("dashboard-range-changed", {
        detail: window.DASHBOARD_RANGE,
      }));

      const result = await db
        .from("attendances")
        .select("amount,attended_at,service_name,payment_method")
        .gte("attended_at", start.toISOString())
        .lt("attended_at", end.toISOString());
      if (result.error) return;

      const attendances = result.data || [];
      const revenue = attendances.reduce((sum, attendance) => sum + Number(attendance.amount || 0), 0);
      const count = attendances.length;
      const statValues = [
        money(revenue),
        String(count),
        money(count ? revenue / count : 0),
      ];

      document.querySelectorAll(".stats .stat").forEach((stat, index) => {
        if (index < statValues.length) stat.querySelector("strong")?.replaceChildren(document.createTextNode(statValues[index]));
      });

      let details = document.querySelector("#revenueDetails");
      if (!details) {
        details = document.createElement("div");
        details.id = "revenueDetails";
        document.querySelector("#content")?.append(details);
      }
      details.innerHTML = revenueDetailsMarkup(attendances);
      wirePeriodControls();
    } finally {
      busy = false;
    }
  }

  window.addEventListener("load", () => window.setTimeout(refreshRevenue, 700));
  window.setInterval(() => {
    if (document.querySelector("#title")?.textContent === "Dashboard" && !document.querySelector("#revenueDetails")) {
      refreshRevenue();
    }
  }, 1000);

  window.refreshRevenue = refreshRevenue;
})();
