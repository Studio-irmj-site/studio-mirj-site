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

  async function renderFinance() {
    if (financeBusy || document.getElementById('title')?.textContent !== 'Financeiro') return;
    const content = document.getElementById('content');
    if (!content) return;

    financeBusy = true;
    content.innerHTML = '<div class="card finance-loading"><h3>Financeiro</h3><p>Carregando informações...</p></div>';

    try {
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

      const incomeData = attendanceResult.data || [];
      const expenseData = expenseResult.data || [];
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

      const expenseRows = expenseData.length
        ? expenseData.map(item => `
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
        : '<tr><td colspan="6" class="expense-empty">Nenhuma despesa cadastrada.</td></tr>';

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
