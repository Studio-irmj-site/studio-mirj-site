(() => {
  'use strict';

  const cfg = window.SUPABASE_CONFIG || {};
  if (!window.supabase || !cfg.url || !cfg.anonKey) return;

  const db = window.supabase.createClient(cfg.url, cfg.anonKey);
  const categories = [
    'Geral',
    'Materiais',
    'Produtos',
    'Aluguel',
    'Água',
    'Energia',
    'Internet',
    'Marketing',
    'Manutenção',
    'Impostos',
    'Transporte',
    'Outros'
  ];
  const paymentMethods = ['Pix', 'Dinheiro', 'Cartão', 'Boleto', 'Transferência', 'Outro'];
  let financeBusy = false;
  let lastFocusedElement = null;
  let cachedIncomeData = [];
  let cachedExpenseData = [];
  let financeCacheReady = false;
  const financeFilters = {
    period: 'month',
    start: '',
    end: '',
    category: 'all'
  };

  const money = value => Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });

  const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);

  const localDateKey = value => {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0')
    ].join('-');
  };

  const monthKey = value => {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  };

  const monthLabel = key => {
    const [year, month] = key.split('-');
    return new Date(Number(year), Number(month) - 1, 1).toLocaleDateString('pt-BR', {
      month: 'short',
      year: 'numeric'
    });
  };

  const formatDate = value => {
    if (!value) return '-';
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString('pt-BR');
  };

  const dateRange = () => {
    const now = new Date();
    const today = localDateKey(now);
    let start = '';
    let end = '';
    let label = 'Todo o período';

    if (financeFilters.period === 'today') {
      start = today;
      end = today;
      label = 'Hoje';
    } else if (financeFilters.period === '7') {
      const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
      start = localDateKey(date);
      end = today;
      label = 'Últimos 7 dias';
    } else if (financeFilters.period === '30') {
      const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29);
      start = localDateKey(date);
      end = today;
      label = 'Últimos 30 dias';
    } else if (financeFilters.period === 'month') {
      start = localDateKey(new Date(now.getFullYear(), now.getMonth(), 1));
      end = today;
      label = 'Este mês';
    } else if (financeFilters.period === 'previous') {
      start = localDateKey(new Date(now.getFullYear(), now.getMonth() - 1, 1));
      end = localDateKey(new Date(now.getFullYear(), now.getMonth(), 0));
      label = 'Mês anterior';
    } else if (financeFilters.period === 'custom') {
      start = financeFilters.start;
      end = financeFilters.end;
      label = start && end ? `${formatDate(start)} a ${formatDate(end)}` : 'Período personalizado';
    }

    return { start, end, label };
  };

  const isInDateRange = (value, range) => {
    if (!range.start && !range.end) return true;
    const key = value?.includes?.('T') ? localDateKey(value) : String(value || '').slice(0, 10);
    if (!key) return false;
    return (!range.start || key >= range.start) && (!range.end || key <= range.end);
  };

  const filteredFinanceData = (incomeData, expenseData) => {
    const range = dateRange();
    const income = incomeData.filter(item => isInDateRange(item.attended_at, range));
    const expenses = expenseData.filter(item => (
      isInDateRange(item.expense_date, range)
      && (financeFilters.category === 'all' || (item.category || 'Geral') === financeFilters.category)
    ));
    return { income, expenses, range };
  };

  const optionList = (options, selected, fallback) => {
    const values = [...options];
    if (selected && !values.includes(selected)) values.push(selected);
    return values.map(value => (
      `<option value="${esc(value)}" ${value === selected || (!selected && value === fallback) ? 'selected' : ''}>${esc(value)}</option>`
    )).join('');
  };

  const showToast = (message, type = 'success') => {
    document.querySelector('.admin-toast')?.remove();
    const toast = document.createElement('div');
    toast.className = `admin-toast ${type}`;
    toast.setAttribute('role', 'status');
    toast.textContent = message;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    window.setTimeout(() => {
      toast.classList.remove('show');
      window.setTimeout(() => toast.remove(), 250);
    }, 3200);
  };

  const closeExpenseDialog = () => {
    document.querySelector('.expense-modal')?.remove();
    document.body.classList.remove('modal-open');
    if (lastFocusedElement?.focus) lastFocusedElement.focus();
    lastFocusedElement = null;
  };

  const handleDialogKeys = event => {
    if (event.key === 'Escape') closeExpenseDialog();
  };

  function openExpenseForm(expense = null) {
    closeExpenseDialog();
    lastFocusedElement = document.activeElement;
    const editing = Boolean(expense);
    const today = localDateKey(new Date());
    const modal = document.createElement('div');
    modal.className = 'expense-modal';
    modal.innerHTML = `
      <div class="expense-modal-backdrop" data-close-expense></div>
      <section class="expense-dialog" role="dialog" aria-modal="true" aria-labelledby="expenseDialogTitle">
        <div class="expense-dialog-head">
          <div>
            <p class="eyebrow">CONTROLE FINANCEIRO</p>
            <h3 id="expenseDialogTitle">${editing ? 'Editar despesa' : 'Nova despesa'}</h3>
            <p>${editing ? 'Atualize os dados desta saída.' : 'Registre uma nova saída do Studio I.R.'}</p>
          </div>
          <button class="expense-close" type="button" data-close-expense aria-label="Fechar formulário">×</button>
        </div>
        <form id="expenseForm" novalidate>
          <div class="expense-form-grid">
            <label class="expense-field-full" for="expenseDescription">
              Descrição
              <input id="expenseDescription" name="description" maxlength="120" required autocomplete="off" value="${esc(expense?.description || '')}" placeholder="Ex.: Compra de produtos para cabelo">
            </label>
            <label for="expenseAmount">
              Valor
              <span class="money-input"><span>R$</span><input id="expenseAmount" name="amount" type="number" min="0.01" step="0.01" inputmode="decimal" required value="${expense?.amount ?? ''}" placeholder="0,00"></span>
            </label>
            <label for="expenseDate">
              Data
              <input id="expenseDate" name="expense_date" type="date" required value="${esc(expense?.expense_date || today)}">
            </label>
            <label for="expenseCategory">
              Categoria
              <select id="expenseCategory" name="category" required>${optionList(categories, expense?.category, 'Geral')}</select>
            </label>
            <label for="expensePayment">
              Forma de pagamento
              <select id="expensePayment" name="payment_method" required>${optionList(paymentMethods, expense?.payment_method, 'Pix')}</select>
            </label>
            <label class="expense-field-full" for="expenseNotes">
              Observações <small>(opcional)</small>
              <textarea id="expenseNotes" name="notes" rows="3" maxlength="500" placeholder="Inclua detalhes importantes sobre esta despesa">${esc(expense?.notes || '')}</textarea>
            </label>
          </div>
          <p id="expenseFormError" class="form-feedback error" role="alert"></p>
          <div class="expense-form-actions">
            <button class="action expense-cancel" type="button" data-close-expense>Cancelar</button>
            <button id="saveExpense" class="primary expense-save" type="submit">${editing ? 'Salvar alterações' : 'Cadastrar despesa'}</button>
          </div>
        </form>
      </section>`;

    document.body.appendChild(modal);
    document.body.classList.add('modal-open');
    modal.querySelectorAll('[data-close-expense]').forEach(button => {
      button.addEventListener('click', closeExpenseDialog);
    });
    modal.addEventListener('keydown', handleDialogKeys);
    modal.querySelector('#expenseDescription')?.focus();

    modal.querySelector('#expenseForm').addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const errorBox = form.querySelector('#expenseFormError');
      const saveButton = form.querySelector('#saveExpense');
      const description = form.elements.description.value.trim();
      const amount = Number(form.elements.amount.value);
      const expenseDate = form.elements.expense_date.value;

      errorBox.textContent = '';
      if (!description) {
        errorBox.textContent = 'Informe a descrição da despesa.';
        form.elements.description.focus();
        return;
      }
      if (!Number.isFinite(amount) || amount <= 0) {
        errorBox.textContent = 'Informe um valor maior que zero.';
        form.elements.amount.focus();
        return;
      }
      if (!expenseDate) {
        errorBox.textContent = 'Informe a data da despesa.';
        form.elements.expense_date.focus();
        return;
      }

      const payload = {
        description,
        amount,
        expense_date: expenseDate,
        category: form.elements.category.value,
        payment_method: form.elements.payment_method.value,
        notes: form.elements.notes.value.trim()
      };

      saveButton.disabled = true;
      saveButton.textContent = 'Salvando...';

      try {
        const query = editing
          ? db.from('expenses').update(payload).eq('id', expense.id)
          : db.from('expenses').insert(payload);
        const { data, error } = await query.select('id').maybeSingle();
        if (error) throw error;
        if (!data) throw new Error('A alteração não foi confirmada pelo banco de dados.');

        closeExpenseDialog();
        showToast(editing ? 'Despesa atualizada com sucesso.' : 'Despesa cadastrada com sucesso.');
        await renderFinance();
      } catch (error) {
        errorBox.textContent = `Não foi possível salvar. ${error.message || 'Tente novamente.'}`;
        saveButton.disabled = false;
        saveButton.textContent = editing ? 'Salvar alterações' : 'Cadastrar despesa';
      }
    });
  }

  function openExpenseDelete(expense) {
    closeExpenseDialog();
    lastFocusedElement = document.activeElement;
    const modal = document.createElement('div');
    modal.className = 'expense-modal';
    modal.innerHTML = `
      <div class="expense-modal-backdrop" data-close-expense></div>
      <section class="expense-dialog expense-confirm" role="alertdialog" aria-modal="true" aria-labelledby="deleteExpenseTitle" aria-describedby="deleteExpenseDescription">
        <div class="delete-icon" aria-hidden="true">!</div>
        <h3 id="deleteExpenseTitle">Excluir despesa?</h3>
        <p id="deleteExpenseDescription">A despesa <strong>“${esc(expense.description)}”</strong>, no valor de <strong>${money(expense.amount)}</strong>, será excluída definitivamente.</p>
        <p id="deleteExpenseError" class="form-feedback error" role="alert"></p>
        <div class="expense-form-actions">
          <button class="action expense-cancel" type="button" data-close-expense>Manter despesa</button>
          <button id="confirmExpenseDelete" class="danger-button" type="button">Excluir despesa</button>
        </div>
      </section>`;

    document.body.appendChild(modal);
    document.body.classList.add('modal-open');
    modal.querySelectorAll('[data-close-expense]').forEach(button => {
      button.addEventListener('click', closeExpenseDialog);
    });
    modal.addEventListener('keydown', handleDialogKeys);

    const deleteButton = modal.querySelector('#confirmExpenseDelete');
    deleteButton.focus();
    deleteButton.addEventListener('click', async () => {
      const errorBox = modal.querySelector('#deleteExpenseError');
      deleteButton.disabled = true;
      deleteButton.textContent = 'Excluindo...';
      errorBox.textContent = '';

      try {
        const { data, error } = await db.from('expenses')
          .delete()
          .eq('id', expense.id)
          .select('id')
          .maybeSingle();
        if (error) throw error;
        if (!data) throw new Error('A exclusão não foi confirmada pelo banco de dados.');

        closeExpenseDialog();
        showToast('Despesa excluída com sucesso.');
        await renderFinance();
      } catch (error) {
        errorBox.textContent = `Não foi possível excluir. ${error.message || 'Tente novamente.'}`;
        deleteButton.disabled = false;
        deleteButton.textContent = 'Excluir despesa';
      }
    });
  }

  const wireExpenseActions = expenseData => {
    document.getElementById('newExpense')?.addEventListener('click', () => openExpenseForm());
    document.querySelectorAll('[data-expense-edit]').forEach(button => {
      button.addEventListener('click', () => {
        const expense = expenseData.find(item => String(item.id) === button.dataset.expenseEdit);
        if (expense) openExpenseForm(expense);
      });
    });
    document.querySelectorAll('[data-expense-delete]').forEach(button => {
      button.addEventListener('click', () => {
        const expense = expenseData.find(item => String(item.id) === button.dataset.expenseDelete);
        if (expense) openExpenseDelete(expense);
      });
    });
  };

  const exportFinancePdf = (incomeData, expenseData) => {
    const filtered = filteredFinanceData(incomeData, expenseData);
    const incomeTotal = filtered.income.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const expenseTotal = filtered.expenses.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const categoryTotals = {};
    filtered.expenses.forEach(item => {
      const category = item.category || 'Geral';
      categoryTotals[category] = (categoryTotals[category] || 0) + Number(item.amount || 0);
    });

    const rows = filtered.expenses.length
      ? filtered.expenses.map(item => `
        <tr>
          <td>${formatDate(item.expense_date)}</td>
          <td>${esc(item.description)}</td>
          <td>${esc(item.category || 'Geral')}</td>
          <td>${esc(item.payment_method || '-')}</td>
          <td class="number">${money(item.amount)}</td>
        </tr>`).join('')
      : '<tr><td colspan="5" class="empty-row">Nenhuma despesa encontrada para os filtros selecionados.</td></tr>';

    const categoriesReport = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1]).map(([category, total]) => `
      <div class="category-row"><span>${esc(category)}</span><strong>${money(total)}</strong></div>`).join('') || '<p>Nenhuma categoria no período.</p>';
    const categoryLabel = financeFilters.category === 'all' ? 'Todas as categorias' : financeFilters.category;
    const generatedAt = new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    const reportWindow = window.open('', '_blank', 'width=1000,height=800');

    if (!reportWindow) {
      showToast('O navegador bloqueou a janela do PDF. Permita pop-ups e tente novamente.', 'error');
      return;
    }

    reportWindow.opener = null;
    reportWindow.document.write(`<!doctype html>
      <html lang="pt-BR">
      <head>
        <meta charset="utf-8">
        <title>Relatório financeiro - Studio I.R</title>
        <style>
          @page { size: A4; margin: 15mm; }
          * { box-sizing: border-box; }
          body { margin: 0; color: #321321; font-family: Arial, sans-serif; font-size: 11px; }
          header { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; padding-bottom: 16px; border-bottom: 2px solid #421027; }
          .brand { display: flex; align-items: center; gap: 12px; }
          .logo { width: 54px; height: 54px; display: grid; place-items: center; border: 1px solid #c8a25d; border-radius: 50%; color: #421027; font: italic 18px Georgia, serif; }
          h1, h2 { font-family: Georgia, serif; color: #421027; }
          h1 { margin: 0 0 5px; font-size: 23px; }
          h2 { margin: 22px 0 10px; font-size: 16px; }
          p { margin: 3px 0; color: #78636c; line-height: 1.45; }
          .meta { text-align: right; }
          .summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin: 18px 0; }
          .summary div { padding: 13px; border: 1px solid #eadfe4; border-radius: 9px; background: #fbf8f9; }
          .summary span { display: block; margin-bottom: 5px; color: #8b7780; font-size: 9px; text-transform: uppercase; }
          .summary strong { color: #421027; font: bold 17px Georgia, serif; }
          table { width: 100%; border-collapse: collapse; }
          th, td { padding: 9px 7px; border-bottom: 1px solid #eadfe4; text-align: left; vertical-align: top; }
          th { background: #f7edf1; color: #421027; font-size: 9px; text-transform: uppercase; }
          .number { text-align: right; white-space: nowrap; }
          .empty-row { padding: 25px; text-align: center; color: #8b7780; }
          .category-list { width: 55%; min-width: 300px; }
          .category-row { display: flex; justify-content: space-between; gap: 15px; padding: 7px 0; border-bottom: 1px solid #eadfe4; }
          footer { margin-top: 24px; padding-top: 10px; border-top: 1px solid #eadfe4; color: #8b7780; font-size: 9px; text-align: center; }
          @media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
        </style>
      </head>
      <body>
        <header>
          <div class="brand"><div class="logo">I.R</div><div><h1>Relatório financeiro</h1><p>Studio I.R - Iarytsa & Raquel</p></div></div>
          <div class="meta"><p><strong>Período:</strong> ${esc(filtered.range.label)}</p><p><strong>Categoria:</strong> ${esc(categoryLabel)}</p><p>Gerado em ${esc(generatedAt)}</p></div>
        </header>
        <section class="summary">
          <div><span>Faturamento no período</span><strong>${money(incomeTotal)}</strong></div>
          <div><span>Despesas filtradas</span><strong>${money(expenseTotal)}</strong></div>
          <div><span>Resultado</span><strong>${money(incomeTotal - expenseTotal)}</strong></div>
        </section>
        <h2>Despesas</h2>
        <table><thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Pagamento</th><th class="number">Valor</th></tr></thead><tbody>${rows}</tbody></table>
        <h2>Despesas por categoria</h2>
        <div class="category-list">${categoriesReport}</div>
        <footer>Relatório gerado pelo painel administrativo do Studio I.R.</footer>
      </body>
      </html>`);
    reportWindow.document.close();
    reportWindow.focus();
    reportWindow.addEventListener('afterprint', () => reportWindow.close());
    window.setTimeout(() => reportWindow.print(), 300);
  };

  const wireFinanceFilters = (incomeData, expenseData) => {
    document.getElementById('financePeriod')?.addEventListener('change', event => {
      financeFilters.period = event.target.value;
      if (financeFilters.period === 'custom' && (!financeFilters.start || !financeFilters.end)) {
        const now = new Date();
        financeFilters.start = localDateKey(new Date(now.getFullYear(), now.getMonth(), 1));
        financeFilters.end = localDateKey(now);
      }
      renderFinance(true);
    });

    document.getElementById('financeCategory')?.addEventListener('change', event => {
      financeFilters.category = event.target.value;
      renderFinance(true);
    });

    document.getElementById('applyFinanceDates')?.addEventListener('click', () => {
      const start = document.getElementById('financeStart')?.value || '';
      const end = document.getElementById('financeEnd')?.value || '';
      if (!start || !end || start > end) {
        showToast('Selecione um intervalo de datas válido.', 'error');
        return;
      }
      financeFilters.start = start;
      financeFilters.end = end;
      renderFinance(true);
    });

    document.getElementById('clearFinanceFilters')?.addEventListener('click', () => {
      financeFilters.period = 'month';
      financeFilters.start = '';
      financeFilters.end = '';
      financeFilters.category = 'all';
      renderFinance(true);
    });

    document.getElementById('exportFinancePdf')?.addEventListener('click', () => {
      exportFinancePdf(incomeData, expenseData);
    });
  };

  async function renderFinance(useCache = false) {
    if (financeBusy || document.getElementById('title')?.textContent !== 'Financeiro') return;
    const content = document.getElementById('content');
    if (!content) return;

    financeBusy = true;
    if (!useCache || !financeCacheReady) {
      content.innerHTML = '<div class="card finance-loading"><h3>Financeiro</h3><p>Carregando informações...</p></div>';
    }

    try {
      if (!useCache || !financeCacheReady) {
        const [attendanceResult, expenseResult] = await Promise.all([
          db.from('attendances')
            .select('amount,attended_at,payment_method,service_name')
            .order('attended_at', { ascending: false }),
          db.from('expenses')
            .select('id,description,amount,expense_date,category,payment_method,notes')
            .order('expense_date', { ascending: false })
        ]);

        if (attendanceResult.error) throw attendanceResult.error;
        if (expenseResult.error) throw expenseResult.error;
        cachedIncomeData = attendanceResult.data || [];
        cachedExpenseData = expenseResult.data || [];
        financeCacheReady = true;
      }

      const incomeData = cachedIncomeData;
      const expenseData = cachedExpenseData;
      const income = incomeData.reduce((sum, item) => sum + Number(item.amount || 0), 0);
      const expenses = expenseData.reduce((sum, item) => sum + Number(item.amount || 0), 0);
      const today = localDateKey(new Date());
      const currentMonth = monthKey(new Date());
      const dayIncome = incomeData
        .filter(item => item.attended_at && localDateKey(item.attended_at) === today)
        .reduce((sum, item) => sum + Number(item.amount || 0), 0);
      const dayExpenses = expenseData
        .filter(item => item.expense_date === today)
        .reduce((sum, item) => sum + Number(item.amount || 0), 0);
      const monthIncome = incomeData
        .filter(item => item.attended_at && monthKey(item.attended_at) === currentMonth)
        .reduce((sum, item) => sum + Number(item.amount || 0), 0);
      const monthExpenses = expenseData
        .filter(item => item.expense_date?.slice(0, 7) === currentMonth)
        .reduce((sum, item) => sum + Number(item.amount || 0), 0);

      const payments = {};
      incomeData.forEach(item => {
        const key = item.payment_method || 'Não informado';
        payments[key] = (payments[key] || 0) + Number(item.amount || 0);
      });

      const months = [];
      for (let index = 5; index >= 0; index -= 1) {
        const date = new Date();
        date.setDate(1);
        date.setMonth(date.getMonth() - index);
        const key = monthKey(date);
        const monthAttendances = incomeData.filter(item => item.attended_at && monthKey(item.attended_at) === key);
        months.push({
          key,
          income: monthAttendances.reduce((sum, item) => sum + Number(item.amount || 0), 0),
          expenses: expenseData
            .filter(item => item.expense_date?.slice(0, 7) === key)
            .reduce((sum, item) => sum + Number(item.amount || 0), 0),
          count: monthAttendances.length
        });
      }

      const chartMax = Math.max(1, ...months.flatMap(item => [item.income, item.expenses]));
      const chart = months.map(item => `
        <div class="finance-month">
          <div class="finance-bars">
            <div class="finance-bar income" style="height:${Math.max(4, item.income / chartMax * 120)}px" title="Faturamento: ${money(item.income)}"></div>
            <div class="finance-bar expense" style="height:${Math.max(4, item.expenses / chartMax * 120)}px" title="Despesas: ${money(item.expenses)}"></div>
          </div>
          <small>${esc(monthLabel(item.key))}</small>
        </div>`).join('');

      const serviceMap = {};
      incomeData.forEach(item => {
        const key = item.service_name || 'Não informado';
        serviceMap[key] = (serviceMap[key] || 0) + 1;
      });
      const topServices = Object.entries(serviceMap).sort((a, b) => b[1] - a[1]).slice(0, 5);

      const filtered = filteredFinanceData(incomeData, expenseData);
      const filteredExpenseTotal = filtered.expenses.reduce((sum, item) => sum + Number(item.amount || 0), 0);
      const filteredIncomeTotal = filtered.income.reduce((sum, item) => sum + Number(item.amount || 0), 0);
      const averageExpense = filtered.expenses.length ? filteredExpenseTotal / filtered.expenses.length : 0;
      const categoryOptions = [...new Set(expenseData.map(item => item.category || 'Geral'))]
        .sort((a, b) => a.localeCompare(b, 'pt-BR'))
        .map(category => `<option value="${esc(category)}" ${financeFilters.category === category ? 'selected' : ''}>${esc(category)}</option>`)
        .join('');

      const expenseRows = filtered.expenses.length
        ? filtered.expenses.map(item => `
          <tr>
            <td>${formatDate(item.expense_date)}</td>
            <td><strong>${esc(item.description)}</strong>${item.notes ? `<small class="expense-note">${esc(item.notes)}</small>` : ''}</td>
            <td><span class="category-pill">${esc(item.category || 'Geral')}</span></td>
            <td>${esc(item.payment_method || '-')}</td>
            <td class="expense-value">${money(item.amount)}</td>
            <td class="expense-actions">
              <button class="action" type="button" data-expense-edit="${esc(item.id)}" aria-label="Editar despesa ${esc(item.description)}">Editar</button>
              <button class="action danger" type="button" data-expense-delete="${esc(item.id)}" aria-label="Excluir despesa ${esc(item.description)}">Excluir</button>
            </td>
          </tr>`).join('')
        : '<tr><td colspan="6" class="expense-empty">Nenhuma despesa encontrada para os filtros selecionados.</td></tr>';

      content.innerHTML = `
        <div class="stats finance-stats">
          <div class="stat card"><span>Faturamento</span><strong>${money(income)}</strong></div>
          <div class="stat card expense-total"><span>Despesas</span><strong>${money(expenses)}</strong></div>
          <div class="stat card profit-total"><span>Lucro</span><strong>${money(income - expenses)}</strong></div>
        </div>
        <div class="card">
          <h3>Evolução financeira</h3>
          <p>Comparação dos últimos 6 meses.</p>
          <div class="finance-legend"><span><i class="income-dot"></i>Faturamento</span><span><i class="expense-dot"></i>Despesas</span></div>
          <div class="finance-chart">${chart}</div>
        </div>
        <div class="dashboard-grid">
          <div class="card"><h3>Fechamento de hoje</h3><p>Entradas: <strong>${money(dayIncome)}</strong></p><p>Despesas: <strong>${money(dayExpenses)}</strong></p><p>Resultado: <strong>${money(dayIncome - dayExpenses)}</strong></p></div>
          <div class="card"><h3>Fechamento do mês</h3><p>Entradas: <strong>${money(monthIncome)}</strong></p><p>Despesas: <strong>${money(monthExpenses)}</strong></p><p>Resultado: <strong>${money(monthIncome - monthExpenses)}</strong></p></div>
          <div class="card"><h3>Formas de pagamento</h3><div class="rank-list">${Object.entries(payments).sort((a, b) => b[1] - a[1]).map(([key, value]) => `<div><span>${esc(key)}</span><strong>${money(value)}</strong></div>`).join('') || '<p class="empty">Nenhuma entrada registrada.</p>'}</div></div>
        </div>
        <div class="card">
          <h3>Relatório mensal</h3>
          <p>Resumo dos últimos 6 meses.</p>
          <div class="table-wrap"><table><thead><tr><th>Mês</th><th>Atendimentos</th><th>Faturamento</th><th>Despesas</th><th>Lucro</th></tr></thead><tbody>${months.map(item => `<tr><td>${esc(monthLabel(item.key))}</td><td>${item.count}</td><td>${money(item.income)}</td><td>${money(item.expenses)}</td><td><strong>${money(item.income - item.expenses)}</strong></td></tr>`).join('')}</tbody></table></div>
        </div>
        <div class="dashboard-grid">
          <div class="card"><h3>Serviços mais realizados</h3><div class="rank-list">${topServices.map(([key, value]) => `<div><span>${esc(key)}</span><strong>${value}</strong></div>`).join('') || '<p class="empty">Nenhum atendimento registrado.</p>'}</div></div>
          <div class="card"><h3>Resumo do período</h3><p>Total de atendimentos: <strong>${incomeData.length}</strong></p><p>Ticket médio: <strong>${money(incomeData.length ? income / incomeData.length : 0)}</strong></p><p>Resultado líquido: <strong>${money(income - expenses)}</strong></p></div>
        </div>
        <div class="card finance-filter-card">
          <div class="card-head finance-filter-head">
            <div><p class="eyebrow">RELATÓRIO DETALHADO</p><h3>Filtros financeiros</h3><p>Escolha o período e a categoria para consultar ou exportar.</p></div>
            <div class="finance-report-actions">
              <button id="clearFinanceFilters" class="action" type="button">Limpar filtros</button>
              <button id="exportFinancePdf" class="primary pdf-button" type="button">Exportar PDF</button>
            </div>
          </div>
          <div class="finance-filter-grid">
            <label for="financePeriod">Período
              <select id="financePeriod">
                <option value="today" ${financeFilters.period === 'today' ? 'selected' : ''}>Hoje</option>
                <option value="7" ${financeFilters.period === '7' ? 'selected' : ''}>Últimos 7 dias</option>
                <option value="30" ${financeFilters.period === '30' ? 'selected' : ''}>Últimos 30 dias</option>
                <option value="month" ${financeFilters.period === 'month' ? 'selected' : ''}>Este mês</option>
                <option value="previous" ${financeFilters.period === 'previous' ? 'selected' : ''}>Mês anterior</option>
                <option value="all" ${financeFilters.period === 'all' ? 'selected' : ''}>Todo o período</option>
                <option value="custom" ${financeFilters.period === 'custom' ? 'selected' : ''}>Personalizado</option>
              </select>
            </label>
            <label for="financeCategory">Categoria
              <select id="financeCategory"><option value="all">Todas as categorias</option>${categoryOptions}</select>
            </label>
            <div class="custom-finance-dates ${financeFilters.period === 'custom' ? 'show' : ''}">
              <label for="financeStart">De<input id="financeStart" type="date" value="${esc(financeFilters.start)}"></label>
              <label for="financeEnd">Até<input id="financeEnd" type="date" value="${esc(financeFilters.end)}"></label>
              <button id="applyFinanceDates" class="action" type="button">Aplicar datas</button>
            </div>
          </div>
          <div class="filtered-summary">
            <div><span>Período selecionado</span><strong>${esc(filtered.range.label)}</strong></div>
            <div><span>Faturamento</span><strong>${money(filteredIncomeTotal)}</strong></div>
            <div><span>Despesas</span><strong>${money(filteredExpenseTotal)}</strong></div>
            <div><span>Lançamentos</span><strong>${filtered.expenses.length}</strong></div>
            <div><span>Média por despesa</span><strong>${money(averageExpense)}</strong></div>
            <div><span>Resultado</span><strong>${money(filteredIncomeTotal - filteredExpenseTotal)}</strong></div>
          </div>
        </div>
        <div class="card expense-card">
          <div class="card-head">
            <div><p class="eyebrow">SAÍDAS</p><h3>Despesas</h3><p>Cadastre, edite e acompanhe as saídas do Studio.</p></div>
            <button id="newExpense" class="primary expense-new" type="button">+ Nova despesa</button>
          </div>
          <div class="table-wrap expense-table-wrap">
            <table class="expense-table">
              <thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Pagamento</th><th>Valor</th><th>Ações</th></tr></thead>
              <tbody>${expenseRows}</tbody>
            </table>
          </div>
        </div>`;

      wireExpenseActions(expenseData);
      wireFinanceFilters(incomeData, expenseData);
    } catch (error) {
      content.innerHTML = `<div class="card finance-error"><h3>Não foi possível carregar o Financeiro</h3><p class="error">${esc(error.message || 'Tente novamente em alguns instantes.')}</p><button id="retryFinance" class="primary" type="button">Tentar novamente</button></div>`;
      document.getElementById('retryFinance')?.addEventListener('click', renderFinance);
    } finally {
      financeBusy = false;
    }
  }

  window.renderFinance = renderFinance;
  window.addEventListener('load', () => window.setTimeout(renderFinance, 500));
})();
