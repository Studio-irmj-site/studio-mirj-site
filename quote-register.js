(() => {
  "use strict";

  const config = window.SUPABASE_CONFIG || {};
  const cta = document.querySelector("#ctaButton");
  if (!cta || !config.url || !config.anonKey) return;

  function selectedItems() {
    return [...document.querySelectorAll(".service-card[aria-pressed='true']")].map((card) => ({
      name: card.querySelector(".service-card__copy strong")?.textContent?.trim() || "Serviço",
      price: Number((card.querySelector(".service-card__price strong")?.textContent || "0").replace(/[^0-9,]/g, "").replace(/\./g, "").replace(",", ".")) || 0,
    }));
  }

  cta.addEventListener("click", async (event) => {
    const items = selectedItems();
    if (!items.length) return;

    event.preventDefault();
    const whatsappUrl = cta.href;
    const popup = window.open("about:blank", "_blank");

    const clientName = window.prompt("Para registrar seu orçamento, informe seu nome:");
    if (!clientName?.trim()) {
      popup?.close();
      return;
    }

    const phone = window.prompt("Informe seu WhatsApp (opcional):", "");
    const totalText = document.querySelector("#total")?.textContent || "";
    const total = items.reduce((sum, item) => sum + item.price, 0);

    try {
      const response = await fetch(`${config.url}/rest/v1/quotes`, {
        method: "POST",
        headers: {
          apikey: config.anonKey,
          Authorization: `Bearer ${config.anonKey}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          client_name: clientName.trim(),
          phone: String(phone || "").replace(/\D/g, "") || null,
          items,
          total,
          status: "pending",
          notes: `Solicitado pelo site. ${totalText}`,
        }),
      });

      if (!response.ok) throw new Error(`quote insert failed: ${response.status}`);
      if (popup) popup.location.href = whatsappUrl;
      else window.location.href = whatsappUrl;
    } catch (error) {
      console.error("Não foi possível registrar o orçamento.", error);
      popup?.close();
      alert("Não foi possível registrar o orçamento agora. O WhatsApp não será aberto para evitar perda do registro. Tente novamente.");
    }
  });
})();
