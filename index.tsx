import { GoogleGenAI } from "@google/genai";

const SYSTEM_PROMPT = `Você é um especialista sênior da Receita Federal e um assessor financeiro. Sua missão é analisar os dados financeiros de um contribuinte e propor as melhores soluções para quitação de dívidas.

O usuário fornecerá seus dados financeiros e, opcionalmente, uma proposta de negociação que já recebeu e um valor extra que poderia pagar mensalmente. Sua tarefa é:

1.  **Diagnóstico:** Calcule o "Potencial de Pagamento Mensal" (Receita - Custo).
2.  **Pesquisa e Simulação:** **Use a ferramenta Google Search obrigatoriamente** para pesquisar e encontrar as taxas de juros mais recentes e realistas para diferentes tipos de empréstimos e acordos de dívida no Brasil. Simule as **5 melhores opções de mercado** para a quitação total da dívida do usuário.
3.  **Análise da Proposta do Usuário (se fornecida):** Se o usuário incluiu uma proposta recebida, analise-a como um cenário adicional. Calcule o valor total pago com base nos dados fornecidos por ele. Marque esta proposta com o nome "Sua Proposta".
4.  **Análise "E se?" (se fornecida):** Se o usuário informou um valor extra mensal, considere esse valor no seu cálculo de simulações, mostrando como ele poderia acelerar a quitação da dívida ou reduzir juros.
5.  **Apresentação da Simulação:**
    *   O primeiro cenário deve ser sempre a "Situação Atual", consolidando os dados das dívidas fornecidas.
    *   Inclua o cenário "Sua Proposta" se ele foi fornecido.
    *   Para cada uma das 5 novas propostas de mercado, forneça o nome do banco ou instituição, um link de acesso direto para a oferta (se disponível), a proposta (ex: "Crédito Consolidado"), a taxa de juros mensal e anual, o prazo, o valor da parcela e o valor total pago.
6.  **Resumo e Recomendação:** Forneça um resumo conciso da situação financeira do usuário e recomende a melhor opção entre todos os cenários, justificando sua escolha.

**Regra de Saída:**
Responda APENAS com um único bloco de código JSON, sem markdown \`\`\`json. O JSON deve conter as chaves "diagnostico", "simulacao", "resumoAnalise" e "recomendacao".

**Exemplo de Saída JSON:**
{
  "diagnostico": {
    "receitaMensal": 5000,
    "custoMensal": 3500,
    "potencialPagamento": 1500
  },
  "simulacao": {
    "cenarios": [
      { "proposta": "Situação Atual", "taxaMensal": "14.0%", "taxaAnual": "385.9%", "prazo": 48, "parcela": 1800, "valorTotal": 86400, "banco": "N/A", "link": "" },
      { "proposta": "Sua Proposta", "taxaMensal": "3.5%", "taxaAnual": "51.1%", "prazo": 60, "parcela": 1200, "valorTotal": 72000, "banco": "Proposta do Usuário", "link": "" },
      { "proposta": "Crédito Consolidado", "banco": "Banco Exemplo S.A.", "link": "https://bancoexemplo.com/credito", "taxaMensal": "3.5%", "taxaAnual": "51.1%", "prazo": 60, "parcela": 1100, "valorTotal": 66000 },
      { "proposta": "Crédito com Garantia", "banco": "Financeira Digital", "link": "https://financeiradigital.com/garantia", "taxaMensal": "1.8%", "taxaAnual": "23.9%", "prazo": 72, "parcela": 900, "valorTotal": 64800 }
    ]
  },
  "resumoAnalise": "Sua situação financeira indica um potencial de pagamento positivo, mas as dívidas atuais consomem uma parte significativa. A consolidação da dívida é altamente recomendada para reduzir os juros.",
  "recomendacao": {
    "melhorOpcao": "Crédito com Garantia",
    "justificativa": "Esta opção oferece a menor taxa de juros e o menor valor total pago ao final do período, representando a economia mais significativa a longo prazo."
  }
}
`;

document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const financialForm = document.getElementById('financial-form') as HTMLFormElement;
    const monthlyIncomeInput = document.getElementById('monthly-income') as HTMLInputElement;
    const monthlyCostsInput = document.getElementById('monthly-costs') as HTMLInputElement;
    // FIX: Cast debtTableBody to HTMLTableSectionElement to access the 'rows' property.
    const debtTableBody = document.getElementById('debt-table-body') as HTMLTableSectionElement;
    const addDebtBtn = document.getElementById('add-debt-btn')!;
    const analyzeBtn = document.getElementById('analyze-btn') as HTMLButtonElement;
    const clearBtn = document.getElementById('clear-btn') as HTMLButtonElement;
    
    const incomeCsvUploadInput = document.getElementById('income-csv-upload') as HTMLInputElement;
    const incomeFileNameDisplay = document.getElementById('income-file-name-display')!;
    const downloadIncomeSampleBtn = document.getElementById('download-income-csv-sample') as HTMLAnchorElement;

    const csvUploadInput = document.getElementById('csv-upload') as HTMLInputElement;
    const fileNameDisplay = document.getElementById('file-name-display')!;
    const downloadDebtsSampleBtn = document.getElementById('download-debts-csv-sample') as HTMLAnchorElement;

    const proposalPaymentInput = document.getElementById('proposal-payment') as HTMLInputElement;
    const proposalTermInput = document.getElementById('proposal-term') as HTMLInputElement;
    const proposalRateInput = document.getElementById('proposal-rate') as HTMLInputElement;
    const whatIfPaymentInput = document.getElementById('what-if-payment') as HTMLInputElement;

    const visualizationPanel = document.getElementById('visualization-panel')!;
    const resultsPlaceholder = document.getElementById('results-placeholder')!;
    const resultsContent = document.getElementById('results-content')!;
    const summaryContainer = document.getElementById('summary-container')!;
    const xrayContainer = document.getElementById('financial-xray-container')!;
    const recommendationContainer = document.getElementById('recommendation-container')!;
    const simResultsContainer = document.getElementById('simulation-results-container')!;
    const sourcesContainer = document.getElementById('sources-container')!;
    
    // Real-time summary elements
    const summaryTotalDebtEl = document.getElementById('summary-total-debt')!;
    const summaryTotalPaymentsEl = document.getElementById('summary-total-payments')!;
    const summaryPaymentPotentialEl = document.getElementById('summary-payment-potential')!;

    // App State
    let ai: GoogleGenAI;
    const LOCAL_STORAGE_KEY = 'financialAdvisorState';

    // --- Initialization ---
    function initializeApp() {
        ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });
        setupEventListeners();
        loadStateFromLocalStorage();
        updateRealTimeSummary();
    }

    // --- Event Listeners ---
    function setupEventListeners() {
        financialForm.addEventListener('submit', handleAnalysis);
        financialForm.addEventListener('input', saveStateToLocalStorage);
        
        clearBtn.addEventListener('click', clearFormAndState);
        addDebtBtn.addEventListener('click', () => addDebtRow());
        
        incomeCsvUploadInput.addEventListener('change', handleIncomeCostsFileUpload);
        downloadIncomeSampleBtn.addEventListener('click', downloadIncomeSampleCSV);

        csvUploadInput.addEventListener('change', handleDebtsFileUpload);
        downloadDebtsSampleBtn.addEventListener('click', downloadDebtsSampleCSV);

        debtTableBody.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            if (target.closest('.remove-debt-btn')) {
                target.closest('tr')?.remove();
                if (debtTableBody.rows.length === 0) addDebtRow(false); // Ensure at least one row
                saveStateToLocalStorage(); // Update state after removal
            }
        });
    }

    // --- State Management (LocalStorage) ---
    function saveStateToLocalStorage() {
        const debtRows = Array.from(debtTableBody.querySelectorAll('tr')).map(row => ({
            type: (row.querySelector('.debt-type') as HTMLInputElement).value,
            total: (row.querySelector('.debt-total') as HTMLInputElement).value,
            rate: (row.querySelector('.debt-rate') as HTMLInputElement).value,
            payment: (row.querySelector('.debt-payment') as HTMLInputElement).value,
        }));

        const state = {
            income: monthlyIncomeInput.value,
            costs: monthlyCostsInput.value,
            proposalPayment: proposalPaymentInput.value,
            proposalTerm: proposalTermInput.value,
            proposalRate: proposalRateInput.value,
            whatIfPayment: whatIfPaymentInput.value,
            debts: debtRows
        };
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(state));
        updateRealTimeSummary();
    }

    function loadStateFromLocalStorage() {
        const savedState = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (savedState) {
            const state = JSON.parse(savedState);
            monthlyIncomeInput.value = state.income || '';
            monthlyCostsInput.value = state.costs || '';
            proposalPaymentInput.value = state.proposalPayment || '';
            proposalTermInput.value = state.proposalTerm || '';
            proposalRateInput.value = state.proposalRate || '';
            whatIfPaymentInput.value = state.whatIfPayment || '';

            debtTableBody.innerHTML = '';
            if (state.debts && state.debts.length > 0) {
                state.debts.forEach((debt: any) => {
                    const newRow = addDebtRow(false);
                    (newRow.querySelector('.debt-type') as HTMLInputElement).value = debt.type;
                    (newRow.querySelector('.debt-total') as HTMLInputElement).value = debt.total;
                    (newRow.querySelector('.debt-rate') as HTMLInputElement).value = debt.rate;
                    (newRow.querySelector('.debt-payment') as HTMLInputElement).value = debt.payment;
                });
            } else {
                addDebtRow(false);
            }
        } else {
            addDebtRow(false);
        }
    }

    function clearFormAndState() {
        if (confirm('Tem certeza que deseja limpar todos os dados do formulário?')) {
            localStorage.removeItem(LOCAL_STORAGE_KEY);
            financialForm.reset();
            debtTableBody.innerHTML = '';
            addDebtRow();
            updateRealTimeSummary();
            incomeFileNameDisplay.textContent = '';
            fileNameDisplay.textContent = '';
        }
    }
    
    // --- File Upload & Download ---
    function downloadCSV(content: string, fileName: string) {
        const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        if (link.download !== undefined) {
            const url = URL.createObjectURL(blob);
            link.setAttribute("href", url);
            link.setAttribute("download", fileName);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        }
    }

    function downloadIncomeSampleCSV(e: Event) {
        e.preventDefault();
        const csvContent = "Descrição;Valor\nSalário;5000\nRenda Extra;500\nAluguel;-1500\nSupermercado;-800\nTransporte;-200";
        downloadCSV(csvContent, 'exemplo_renda_custos.csv');
    }

    function downloadDebtsSampleCSV(e: Event) {
        e.preventDefault();
        const csvContent = "Tipo de Dívida;Valor Total (R$);Juros (% a.m.);Pagamento Atual (R$)\nCartão de Crédito;15000;14,5;950\nCheque Especial;5000;8,0;400\nEmpréstimo Pessoal;20000;4,5;1200";
        downloadCSV(csvContent, 'exemplo_dividas.csv');
    }

    function handleIncomeCostsFileUpload(event: Event) {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0];
        if (!file) { incomeFileNameDisplay.textContent = ''; return; }
        incomeFileNameDisplay.textContent = file.name;
        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target?.result as string;
            try {
                processIncomeCostsCSV(text);
                saveStateToLocalStorage();
            } catch (error: any) {
                alert(`Erro ao processar o arquivo CSV: ${error.message}`);
                incomeFileNameDisplay.textContent = ''; input.value = ''; 
            }
        };
        reader.onerror = () => { alert('Não foi possível ler o arquivo.'); incomeFileNameDisplay.textContent = ''; input.value = ''; }
        reader.readAsText(file);
    }
    
    function parseBrazilianNumberString(numStr: string): string {
        if (!numStr) return '';
        return numStr.replace(/\./g, '').replace(',', '.');
    }

    function processIncomeCostsCSV(csvText: string) {
        const lines = csvText.split('\n').filter(line => line.trim() !== '');
        if (lines.length < 2) return; 

        const separator = lines[0].includes(';') ? ';' : ',';
        const rows = lines.slice(1);
        let totalIncome = 0; let totalCosts = 0;

        rows.forEach((rowText, index) => {
            const columns = rowText.replace(/\r/g, '').split(separator).map(col => col.trim());
            if (columns.length !== 2) throw new Error(`A linha ${index + 2} não contém 2 colunas (Descrição, Valor).`);
            const value = parseFloat(parseBrazilianNumberString(columns[1]));
            if (isNaN(value)) throw new Error(`O valor '${columns[1]}' na linha ${index + 2} não é um número válido.`);
            if (value > 0) totalIncome += value; else totalCosts += Math.abs(value);
        });

        monthlyIncomeInput.value = totalIncome.toString();
        monthlyCostsInput.value = totalCosts.toString();
    }

    function handleDebtsFileUpload(event: Event) {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0];
        if (!file) { fileNameDisplay.textContent = ''; return; }
        fileNameDisplay.textContent = file.name;
        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target?.result as string;
            try {
                processDebtsCSV(text);
                saveStateToLocalStorage();
            } catch (error: any) {
                alert(`Erro ao processar o arquivo CSV: ${error.message}`);
                fileNameDisplay.textContent = ''; input.value = '';
            }
        };
        reader.onerror = () => { alert('Não foi possível ler o arquivo.'); fileNameDisplay.textContent = ''; input.value = ''; }
        reader.readAsText(file);
    }

    function processDebtsCSV(csvText: string) {
        debtTableBody.innerHTML = '';
        const lines = csvText.split('\n').filter(line => line.trim() !== '');
        if (lines.length < 2) { addDebtRow(); return; }
        
        const separator = lines[0].includes(';') ? ';' : ',';
        const rows = lines.slice(1);
        if(rows.length === 0) { addDebtRow(); return; }

        rows.forEach((rowText, index) => {
            const columns = rowText.replace(/\r/g, '').split(separator).map(col => col.trim());
            if (columns.length !== 4) throw new Error(`A linha ${index + 2} não contém 4 colunas.`);
            const newRow = addDebtRow(false);
            const [type, totalStr, rateStr, paymentStr] = columns;
            (newRow.querySelector('.debt-type') as HTMLInputElement).value = type;
            (newRow.querySelector('.debt-total') as HTMLInputElement).value = parseBrazilianNumberString(totalStr);
            (newRow.querySelector('.debt-rate') as HTMLInputElement).value = parseBrazilianNumberString(rateStr);
            (newRow.querySelector('.debt-payment') as HTMLInputElement).value = parseBrazilianNumberString(paymentStr);
        });
    }

    // --- Core Functions ---
    async function handleAnalysis(e: Event) {
        e.preventDefault();
        setLoadingState(true);

        const income = parseFloat(monthlyIncomeInput.value);
        const costs = parseFloat(monthlyCostsInput.value);
        
        const debts = Array.from(debtTableBody.querySelectorAll('tr')).map(row => {
            return {
                tipo: (row.querySelector('.debt-type') as HTMLInputElement).value,
                valorTotal: parseFloat((row.querySelector('.debt-total') as HTMLInputElement).value),
                taxaJuros: parseFloat((row.querySelector('.debt-rate') as HTMLInputElement).value),
                pagamentoMensal: parseFloat((row.querySelector('.debt-payment') as HTMLInputElement).value)
            };
        }).filter(d => d.tipo && !isNaN(d.valorTotal) && !isNaN(d.taxaJuros) && !isNaN(d.pagamentoMensal));

        if (isNaN(income) || isNaN(costs) || debts.length === 0) {
            alert('Por favor, preencha os campos de Renda, Custos e pelo menos uma dívida válida.');
            setLoadingState(false);
            return;
        }
        
        let proposalPromptPart = '';
        const proposalPayment = parseFloat(proposalPaymentInput.value);
        const proposalTerm = parseFloat(proposalTermInput.value);
        const proposalRate = parseFloat(proposalRateInput.value);
        if (!isNaN(proposalPayment) && !isNaN(proposalTerm) && !isNaN(proposalRate)) {
            proposalPromptPart = `\n- Proposta Recebida para Análise: Parcela de R$ ${proposalPayment}, Prazo de ${proposalTerm} meses, Taxa de ${proposalRate}% a.m.`;
        }

        let whatIfPromptPart = '';
        const whatIfPayment = parseFloat(whatIfPaymentInput.value);
        if (!isNaN(whatIfPayment) && whatIfPayment > 0) {
            whatIfPromptPart = `\n- Simulação "E se?": Considere um valor extra de R$ ${whatIfPayment} para amortização mensal.`;
        }

        const userPrompt = `Analisar a seguinte situação financeira:
- Receita Mensal: R$ ${income}
- Custos Mensais: R$ ${costs}
- Dívidas Ativas: ${JSON.stringify(debts)}${proposalPromptPart}${whatIfPromptPart}`;

        try {
            const response = await ai.models.generateContent({
                model: "gemini-2.5-flash",
                contents: userPrompt,
                config: { tools: [{ googleSearch: {} }], systemInstruction: SYSTEM_PROMPT },
            });

            let jsonText = response.text.trim();
            const match = jsonText.match(/```json\s*([\s\S]*?)\s*```/);
            if (match && match[1]) jsonText = match[1];
            
            const aiResponse = JSON.parse(jsonText);
            const sources = response.candidates?.[0]?.groundingMetadata?.groundingChunks;

            renderAllResults(aiResponse, sources);

        } catch (error) {
            console.error("Error generating content:", error);
            let errorMessage = "Não foi possível gerar a análise. Verifique os dados e tente novamente.";
            if (error instanceof SyntaxError) errorMessage = "A resposta da IA não estava em um formato JSON válido. Por favor, tente novamente.";
            displayError(errorMessage);
        } finally {
            setLoadingState(false);
        }
    }
    
    // --- UI & Rendering Functions ---
    function formatCurrency(value: number): string {
        if (isNaN(value)) value = 0;
        return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }

    function updateRealTimeSummary() {
        const income = parseFloat(monthlyIncomeInput.value) || 0;
        const costs = parseFloat(monthlyCostsInput.value) || 0;
        let totalDebt = 0; let totalPayments = 0;
        debtTableBody.querySelectorAll('tr').forEach(row => {
            totalDebt += parseFloat((row.querySelector('.debt-total') as HTMLInputElement).value) || 0;
            totalPayments += parseFloat((row.querySelector('.debt-payment') as HTMLInputElement).value) || 0;
        });
        const paymentPotential = income - costs;
        summaryTotalDebtEl.textContent = formatCurrency(totalDebt);
        summaryTotalPaymentsEl.textContent = formatCurrency(totalPayments);
        summaryPaymentPotentialEl.textContent = formatCurrency(paymentPotential);
    }

    function addDebtRow(focus = true): HTMLTableRowElement {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><input type="text" class="debt-type" placeholder="Ex: Cartão de Crédito"></td>
            <td><input type="number" class="debt-total" placeholder="10000"></td>
            <td><input type="number" class="debt-rate" placeholder="14.0" step="0.1"></td>
            <td><input type="number" class="debt-payment" placeholder="800"></td>
            <td><button type="button" class="remove-debt-btn"><i class="fas fa-trash"></i></button></td>
        `;
        debtTableBody.appendChild(row);
        if (focus) row.querySelector<HTMLInputElement>('.debt-type')?.focus();
        return row;
    }
    
    function setLoadingState(isLoading: boolean) {
        if (isLoading) {
            analyzeBtn.disabled = true;
            analyzeBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Analisando...';
            resultsPlaceholder.classList.remove('hidden');
            resultsContent.classList.add('hidden');
            resultsPlaceholder.innerHTML = `
                <i class="fas fa-spinner fa-spin"></i>
                <h2>Analisando seus dados...</h2>
                <p>Aguarde um momento enquanto a IA prepara seu diagnóstico e simulações.</p>
            `;
        } else {
            analyzeBtn.disabled = false;
            analyzeBtn.innerHTML = '<i class="fas fa-magic"></i> Analisar e Simular';
        }
    }
    
    function displayError(message: string) {
        resultsPlaceholder.classList.remove('hidden');
        resultsContent.classList.add('hidden');
        resultsPlaceholder.innerHTML = `
            <i class="fas fa-exclamation-triangle"></i>
            <h2>Ocorreu um Erro</h2>
            <p>${message}</p>
        `;
    }

    function renderAllResults(data: any, sources: any) {
        resultsPlaceholder.classList.add('hidden');
        resultsContent.classList.remove('hidden');

        summaryContainer.innerHTML = data.resumoAnalise ? `<h2 class="results-section-title">Resumo da Análise</h2><p>${data.resumoAnalise}</p>` : '';
        renderFinancialXRay(data.diagnostico);
        recommendationContainer.innerHTML = data.recomendacao ? `<h2 class="results-section-title">Recomendação da IA</h2>` + renderRecommendation(data.recomendacao) : '';
        renderSimulationResult(data.simulacao);
        sourcesContainer.innerHTML = sources ? `<h2 class="results-section-title">Fontes da Pesquisa</h2>` + renderSources(sources) : '';
    }

    function renderFinancialXRay(data: any) {
        if (!data) { xrayContainer.innerHTML = ''; return; }
        const { receitaMensal = 0, custoMensal = 0, potencialPagamento = 0 } = data;
        const potentialClass = potencialPagamento >= 0 ? 'positive' : 'negative';
        xrayContainer.innerHTML = `
            <h2 class="results-section-title">Raio-X Financeiro</h2>
            <div class="xray-cards">
                <div class="xray-card"><h3>Receita Mensal</h3><p>${formatCurrency(receitaMensal)}</p></div>
                <div class="xray-card"><h3>Custo Mensal</h3><p>${formatCurrency(custoMensal)}</p></div>
                <div class="xray-card ${potentialClass}"><h3>Potencial de Pagamento</h3><p>${formatCurrency(potencialPagamento)}</p></div>
            </div>`;
    }

    function renderRecommendation(data: any) {
        const { melhorOpcao, justificativa } = data;
        return `<div><h3><i class="fas fa-check-circle"></i> ${melhorOpcao}</h3><p>${justificativa}</p></div>`;
    }

    function renderComparisonChart(cenarios: any[], melhorOpcao: string) {
        if (!cenarios || cenarios.length === 0) return '';
        const maxTotal = Math.max(...cenarios.map(s => s.valorTotal || 0));
        let chartHTML = '<div id="comparison-chart">';
        cenarios.forEach(s => {
            const width = maxTotal > 0 ? ((s.valorTotal || 0) / maxTotal * 100) : 0;
            let barClass = '';
            if(s.proposta === melhorOpcao) barClass = 'best';
            else if (s.proposta === 'Situação Atual') barClass = 'current';

            chartHTML += `
                <div class="chart-row">
                    <div class="chart-label" title="${s.proposta}">${s.proposta}</div>
                    <div class="chart-bar-container">
                        <div class="chart-bar ${barClass}" style="width: ${width}%;">
                            ${formatCurrency(s.valorTotal || 0)}
                        </div>
                    </div>
                </div>`;
        });
        chartHTML += '</div>';
        return chartHTML;
    }

    function renderSimulationResult(data: any) {
        const { cenarios = [] } = data || {};
        const melhorOpcao = (document.querySelector('#recommendation-container h3')?.textContent || '').trim();

        if (cenarios.length === 0) { simResultsContainer.innerHTML = ''; return; }

        const chartHTML = renderComparisonChart(cenarios, melhorOpcao);
        const currentRate = parseFloat((cenarios[0] || {}).taxaMensal);

        let tableHTML = `
            <table class="results-table">
                <thead><tr><th>Proposta / Banco</th><th>Taxa (mês)</th><th>Taxa (ano)</th><th>Prazo (meses)</th><th>Parcela</th><th>Valor Total Pago</th></tr></thead>
                <tbody>`;
        cenarios.forEach((s: any) => {
             const proposalRate = parseFloat(s.taxaMensal);
             let rateClass = '', rateIcon = '';
             if (s.proposta !== 'Situação Atual' && !isNaN(currentRate)) {
                 if (proposalRate < currentRate) { rateClass = 'better'; rateIcon = '<i class="fas fa-arrow-down"></i>'; } 
                 else if (proposalRate > currentRate) { rateClass = 'worse'; rateIcon = '<i class="fas fa-arrow-up"></i>'; }
             }
             const bankHTML = s.link ? `<a href="${s.link}" target="_blank" rel="noopener noreferrer">${s.banco || 'N/A'}</a>` : (s.banco || 'N/A');
             const isUserProposal = s.proposta === 'Sua Proposta';
             const rowClass = isUserProposal ? 'user-proposal-row' : '';
             tableHTML += `<tr class="${rowClass}">
                    <td><strong>${s.proposta || 'N/A'} ${isUserProposal ? '<i class="fas fa-star"></i>' : ''}</strong><small>${bankHTML}</small></td>
                    <td><span class="rate-comparison ${rateClass}">${s.taxaMensal || 'N/A'} ${rateIcon}</span></td>
                    <td>${s.taxaAnual || 'N/A'}</td><td>${s.prazo || 'N/A'}</td>
                    <td>${formatCurrency(s.parcela || 0)}</td><td>${formatCurrency(s.valorTotal || 0)}</td></tr>`;
        });
        tableHTML += '</tbody></table>';

        const whatsappText = encodeURIComponent(`Veja a simulação de negociação que a IA preparou:\n\n${cenarios.map((s:any) => `*${s.proposta}*: Parcela de ${formatCurrency(s.parcela)} por ${s.prazo} meses.`).join('\n')}`);
        const shareButtonHTML = `<a href="https://api.whatsapp.com/send?text=${whatsappText}" class="whatsapp-share" target="_blank"><i class="fab fa-whatsapp"></i> Compartilhar Análise</a>`;

        simResultsContainer.innerHTML = `<h2 class="results-section-title">Análise Comparativa</h2>` + chartHTML + tableHTML + shareButtonHTML;
    }

    function renderSources(sources: any[]) {
        if (!sources || sources.length === 0) return '';
        let listHTML = '<ul>';
        sources.forEach(source => {
            if (source.web && source.web.uri) {
                listHTML += `<li><a href="${source.web.uri}" target="_blank" rel="noopener noreferrer"><i class="fas fa-link"></i> ${source.web.title || source.web.uri}</a></li>`;
            }
        });
        listHTML += '</ul>';
        return listHTML;
    }

    // Start the application
    initializeApp();
});