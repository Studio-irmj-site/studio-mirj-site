"use strict";

const DEFAULT_PHONE = "5511986344770";
const DEFAULT_STUDIO_NAME = "Espaço I.R";
const config = window.SUPABASE_CONFIG || {};

const elements = {
  tabs: document.querySelector("#tabs"),
  serviceMenu: document.querySelector("#serviceMenu"),
  services: document.querySelector("#services"),
  servicesStatus: document.querySelector("#servicesStatus"),
  count: document.querySelector("#count"),
  total: document.querySelector("#total"),
  clearButton: document.querySelector("#clearButton"),
  ctaButton: document.querySelector("#ctaButton"),
  ctaLabel: document.querySelector("#ctaLabel"),
};

const state = { services: [], selectedIds: new Set(), activeCategory: "Todos", phone: DEFAULT_PHONE };
const categoryIcons = { Manicure: "M", Alongamento: "A", Decorações: "D", Pedicure: "P", Blindagem: "B", "Spa dos Pés": "S" };
const formatMoney = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function serviceId(service) { return String(service.id); }
function selectedServices() { return state.services.filter((service) => state.selectedIds.has(serviceId(service))); }
function selectedTotal() { return selectedServices().reduce((sum, service) => sum + Number(service.price || 0), 0); }
function studioName() { return document.querySelector("#brandName").textContent.trim() || DEFAULT_STUDIO_NAME; }

function whatsappMessage() {
  const chosen = selectedServices();
  if (!chosen.length) return `Olá! Vim pelo site do ${studioName()} e gostaria de saber mais sobre os serviços e horários.`;
  const serviceLines = chosen.map((service) => {
    const unit = service.unit ? ` ${service.unit}` : "";
    return `• ${service.name} — ${formatMoney.format(Number(service.price || 0))}${unit}`;
  }).join("\n");
  return [`Olá! Vim pelo site do ${studioName()} e gostaria de agendar:`, "", serviceLines, "", `Valor estimado: ${formatMoney.format(selectedTotal())}`, "", "Quais horários vocês têm disponíveis?"].join("\n");
}

function whatsappUrl() { return `https://wa.me/${state.phone}?text=${encodeURIComponent(whatsappMessage())}`; }
function updateWhatsappLink() { elements.ctaButton.href = whatsappUrl(); }

function updateQuoteSummary() {
  const amount = state.selectedIds.size;
  elements.count.textContent = amount ? `${amount} ${amount === 1 ? "serviço selecionado" : "serviços selecionados"}` : "Nenhum serviço selecionado";
  elements.total.textContent = amount ? `Estimativa: ${formatMoney.format(selectedTotal())}` : "Escolha seus serviços";
  elements.ctaLabel.textContent = amount ? "Enviar orçamento" : "Falar no WhatsApp";
  elements.clearButton.hidden = amount === 0;
  updateWhatsappLink();
}

function categories() {
  return ["Todos", ...new Set(state.services.map((service) => service.category).filter(Boolean))];
}

function filteredServices() {
  return state.activeCategory === "Todos" ? state.services : state.services.filter((service) => service.category === state.activeCategory);
}

function activateCategory(category, shouldScroll = false) {
  state.activeCategory = category;
  renderCategoryFilters();
  renderServiceMenu();
  renderServices();
  if (shouldScroll) {
    document.querySelector("#servicos")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function renderCategoryFilters() {
  if (!elements.tabs) return;
  elements.tabs.replaceChildren();
  categories().forEach((category) => {
    const button = document.createElement("button");
    button.className = "category-button";
    button.type = "button";
    button.textContent = category;
    button.setAttribute("aria-pressed", String(category === state.activeCategory));
    button.addEventListener("click", () => activateCategory(category));
    elements.tabs.append(button);
  });
}

function renderServiceMenu() {
  if (!elements.serviceMenu) return;
  elements.serviceMenu.replaceChildren();
  categories().forEach((category) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = category === "Todos" ? "Todos os serviços" : category;
    button.setAttribute("aria-pressed", String(category === state.activeCategory));
    button.setAttribute("aria-label", category === "Todos" ? "Mostrar todos os serviços" : `Mostrar serviços de ${category}`);
    button.addEventListener("click", () => activateCategory(category, true));
    elements.serviceMenu.append(button);
  });
}

function createServiceCard(service) {
  const id = serviceId(service);
  const selected = state.selectedIds.has(id);
  const card = document.createElement("button");
  const icon = categoryIcons[service.category] || "IR";
  card.className = "service-card";
  card.type = "button";
  card.dataset.serviceId = id;
  card.setAttribute("aria-pressed", String(selected));
  card.setAttribute("aria-label", `${selected ? "Remover" : "Adicionar"} ${service.name}, ${formatMoney.format(Number(service.price || 0))}`);

  const iconElement = document.createElement("span");
  iconElement.className = "service-card__icon";
  iconElement.setAttribute("aria-hidden", "true");
  iconElement.textContent = icon;

  const copy = document.createElement("span");
  copy.className = "service-card__copy";
  const name = document.createElement("strong");
  name.textContent = service.name;
  copy.append(name);
  if (service.description) {
    const description = document.createElement("p");
    description.textContent = service.description;
    copy.append(description);
  }

  const price = document.createElement("span");
  price.className = "service-card__price";
  const priceValue = document.createElement("strong");
  priceValue.textContent = formatMoney.format(Number(service.price || 0));
  price.append(priceValue);
  if (service.unit) {
    const unit = document.createElement("small");
    unit.textContent = service.unit;
    price.append(unit);
  }

  const check = document.createElement("span");
  check.className = "service-card__check";
  check.setAttribute("aria-hidden", "true");
  check.textContent = "✓";
  card.append(iconElement, copy, price, check);

  card.addEventListener("click", () => {
    if (state.selectedIds.has(id)) state.selectedIds.delete(id); else state.selectedIds.add(id);
    card.setAttribute("aria-pressed", String(state.selectedIds.has(id)));
    card.setAttribute("aria-label", `${state.selectedIds.has(id) ? "Remover" : "Adicionar"} ${service.name}, ${formatMoney.format(Number(service.price || 0))}`);
    updateQuoteSummary();
  });
  return card;
}

function renderServices() {
  const visibleServices = filteredServices();
  elements.services.replaceChildren();
  elements.services.setAttribute("aria-busy", "false");
  const categoryLabel = state.activeCategory === "Todos" ? "" : ` em ${state.activeCategory}`;
  elements.servicesStatus.textContent = visibleServices.length ? `${visibleServices.length} ${visibleServices.length === 1 ? "serviço disponível" : "serviços disponíveis"}${categoryLabel}` : "Nenhum serviço nesta categoria";
  if (!visibleServices.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML = state.services.length ? "<strong>Nenhum serviço por aqui</strong><p>Escolha outra aba de serviço para continuar.</p>" : "<strong>Novidades em breve</strong><p>Não há serviços disponíveis no momento. Fale conosco pelo WhatsApp para saber mais.</p>";
    elements.services.append(empty);
    return;
  }
  visibleServices.forEach((service) => elements.services.append(createServiceCard(service)));
}

function showLoadError() {
  if (elements.tabs) elements.tabs.replaceChildren();
  if (elements.serviceMenu) elements.serviceMenu.innerHTML = '<span class="service-nav__loading">Serviços indisponíveis no momento</span>';
  elements.services.setAttribute("aria-busy", "false");
  elements.servicesStatus.textContent = "Não foi possível carregar os serviços";
  const error = document.createElement("div");
  error.className = "error-state";
  error.innerHTML = ["<strong>Algo não saiu como esperado</strong>", "<p>Verifique sua conexão e tente carregar os serviços novamente.</p>", '<button class="retry-button" type="button">Tentar novamente</button>'].join("");
  error.querySelector("button").addEventListener("click", loadServices);
  elements.services.replaceChildren(error);
}

async function fetchTable(path) {
  if (!config.url || !config.anonKey) throw new Error("Configuração do Supabase não encontrada.");
  const response = await fetch(`${config.url}/rest/v1${path}`, { headers: { apikey: config.anonKey, Authorization: `Bearer ${config.anonKey}` } });
  if (!response.ok) throw new Error(`Falha ao carregar dados (${response.status}).`);
  return response.json();
}

async function loadServices() {
  elements.services.setAttribute("aria-busy", "true");
  elements.servicesStatus.textContent = "Carregando serviços disponíveis…";
  elements.services.innerHTML = ['<div class="service-skeleton" aria-hidden="true"></div>', '<div class="service-skeleton" aria-hidden="true"></div>', '<div class="service-skeleton" aria-hidden="true"></div>', '<div class="service-skeleton" aria-hidden="true"></div>'].join("");
  try {
    const services = await fetchTable("/services?select=id,name,category,description,price,unit&active=eq.true");
    state.services = services.sort((first, second) => {
      const categoryOrder = String(first.category || "").localeCompare(String(second.category || ""), "pt-BR");
      return categoryOrder || String(first.name || "").localeCompare(String(second.name || ""), "pt-BR");
    });
    const validIds = new Set(state.services.map(serviceId));
    state.selectedIds.forEach((id) => { if (!validIds.has(id)) state.selectedIds.delete(id); });
    state.activeCategory = "Todos";
    renderCategoryFilters();
    renderServiceMenu();
    renderServices();
    updateQuoteSummary();
  } catch (error) {
    console.error(error);
    showLoadError();
  }
}

function normalizePhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits.length >= 12 ? digits : DEFAULT_PHONE;
}

function updateInstagram(value) {
  const handle = String(value || "").trim().replace(/^@/, "");
  if (!handle) return;
  document.querySelector("#instagram").textContent = `@${handle}`;
  document.querySelector("#instagramLink").href = `https://www.instagram.com/${encodeURIComponent(handle)}`;
}

function applyStudioSettings(settings) {
  if (!settings) return;
  if (settings.studio_name) {
    document.title = `${settings.studio_name} — Monte seu orçamento`;
    document.querySelector("#brandName").textContent = settings.studio_name;
    document.querySelector("#footerName").textContent = settings.studio_name;
  }
  if (settings.whatsapp) state.phone = normalizePhone(settings.whatsapp);
  if (settings.instagram) updateInstagram(settings.instagram);
  if (settings.city) {
    document.querySelector("#city").textContent = settings.city;
    document.querySelector("#addressTitle").textContent = settings.city;
  }
  if (settings.address) document.querySelector("#address").textContent = settings.address;
  if (settings.hours) {
    const [days, ...timeParts] = String(settings.hours).split("·").map((part) => part.trim());
    if (timeParts.length) {
      document.querySelector("#hoursTitle").textContent = days;
      document.querySelector("#hours").textContent = timeParts.join(" · ");
    } else document.querySelector("#hours").textContent = settings.hours;
  }
  if (settings.tagline) document.querySelector("#tagline").textContent = settings.tagline;
  updateWhatsappLink();
}

async function loadStudioSettings() {
  try {
    const settings = await fetchTable("/studio_settings?select=studio_name,whatsapp,instagram,city,address,hours,tagline&id=eq.1");
    applyStudioSettings(settings[0]);
  } catch (error) {
    console.warn("Configurações do Espaço indisponíveis; usando os dados padrão.", error);
  }
}

elements.clearButton.addEventListener("click", () => {
  state.selectedIds.clear();
  renderServices();
  updateQuoteSummary();
});

updateQuoteSummary();
loadServices();
loadStudioSettings();
