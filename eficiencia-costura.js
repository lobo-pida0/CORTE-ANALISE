// =========================================================================
// 🧵 EFICIÊNCIA DA COSTURA (KPI) — a partir do relatório de movimentação
// (CSV com "Ds Local", "Qt. Movimento", "Cod. Tempolocal"). Só conta as
// linhas dos locais de COSTURA em produção (PNP/SLV COST SUP|INF|CEL) —
// de fora ficam as filas "AGUARD DEFINICAO", a "COSTURA PROGAMADA"
// (preparação), o acabamento e os terceirizados (pedido do usuário: só a
// costura). Minutos produzidos = peças × tempo por peça do local (o mesmo
// valor do "Tempo Peca Costura" do POR_OP). Eficiência = minutos
// produzidos ÷ (pessoas × minutos por pessoa). Pessoas é digitado por LOCAL, por dia.
// Guardado no navegador (localStorage 'eficienciaCostura') E na nuvem (tabela eficiencia_costura_dias, SQL 27):
// { 'AAAA-MM-DD': { locais: { LOCAL: {pecas, minutos, ops, semTempo} }, pessoasLocal: { LOCAL: n } } }
// Reimportar um dia SUBSTITUI os números daquele dia (o relatório é do dia
// inteiro) e mantém as pessoas já digitadas.
// =========================================================================
function normalizarCabecalhoEf(c) {
    return String(c || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\./g, '').replace(/\s+/g, ' ').trim().toUpperCase();
}
function ehLocalCosturaEficiencia(local) {
    const l = normalizarCabecalhoEf(local);
    return /^(PNP|SLV) COST (SUP|INF|CEL)/.test(l) && !l.includes('AGUARD') && !l.includes('PALETO') && !l.includes('CEL SOC') && !/COST SUP CEL 1\b/.test(l); // SLV COST CEL PALETO e SLV COST INF CEL SOC e COST SUP CEL 1 ficam de fora (pedido do usuário)
}
function obterEficienciaCostura() {
    try { return JSON.parse(localStorage.getItem('eficienciaCostura') || '{}'); } catch (e) { return {}; }
}
function salvarEficienciaCostura(obj) {
    try { localStorage.setItem('eficienciaCostura', JSON.stringify(obj)); } catch (e) { showToast('<i class="fas fa-triangle-exclamation"></i> Não consegui salvar a eficiência (armazenamento cheio).', true, 6000); }
}
function numeroBR(txt) {
    if (txt === undefined || txt === null || String(txt).trim() === '') return null;
    const n = parseFloat(String(txt).trim().replace(/\./g, '').replace(',', '.'));
    return isNaN(n) ? null : n;
}


// ☁️ Nuvem da eficiência da costura — tabela `eficiencia_costura_dias` (SQL 27), 1 linha por dia,
// só usuário logado (admin/usuario). Dia que não chegou na nuvem fica em
// `eficienciaCosturaPendentes` e NUNCA é trocado pela versão da nuvem até subir.
let efCosturaSincronizando = false, efCosturaAvisouFalha = false;
function obterEfCosturaPendentes() { try { return JSON.parse(localStorage.getItem('eficienciaCosturaPendentes') || '[]'); } catch (e) { return []; } }
function salvarEfCosturaPendentes(arr) { try { localStorage.setItem('eficienciaCosturaPendentes', JSON.stringify([...new Set(arr)])); } catch (e) { /* ignora */ } }
function avisarFalhaNuvemEfCostura(e) {
    registrarLogDebug('error', ['[NUVEM] Eficiência da costura: ' + (e && e.message ? e.message : e)]);
    const faltaTabela = e && (e.code === 'PGRST205' || e.code === '42P01');
    if (efCosturaAvisouFalha) return;
    efCosturaAvisouFalha = true;
    showToast(faltaTabela
        ? '<i class="fas fa-triangle-exclamation"></i> Eficiência da costura só no seu navegador: falta rodar o SQL 27 no Supabase.'
        : '<i class="fas fa-triangle-exclamation"></i> Não consegui salvar a eficiência da costura na nuvem — ela ficou só neste navegador e será reenviada depois.', true, 8000);
}
async function publicarDiasEfCostura(dias) {
    if (!dias || !dias.length) return true;
    if (!supabaseClient || !sessaoAdminAtual) { salvarEfCosturaPendentes([...obterEfCosturaPendentes(), ...dias]); return false; }
    const todos = obterEficienciaCostura();
    const por = String((sessaoAdminAtual.user && sessaoAdminAtual.user.email) || '').split('@')[0].toUpperCase();
    try {   // mescla as pessoas que outra pessoa já digitou na nuvem (o valor local ganha em caso de conflito)
        const { data: naNuvem } = await supabaseClient.from('eficiencia_costura_dias').select('id, dados').in('id', dias);
        let mesclou = false;
        (naNuvem || []).forEach(l => {
            if (!todos[l.id] || !l.dados || !l.dados.pessoasLocal) return;
            const merged = { ...l.dados.pessoasLocal, ...(todos[l.id].pessoasLocal || {}) };
            if (JSON.stringify(merged) !== JSON.stringify(todos[l.id].pessoasLocal || {})) { todos[l.id].pessoasLocal = merged; mesclou = true; }
        });
        if (mesclou) { salvarEficienciaCostura(todos); renderizarEficienciaCostura(); }
    } catch (e) { /* sem a mescla, segue com o dado local */ }
    const linhas = dias.filter(d => todos[d]).map(d => ({ id: d, dados: { locais: todos[d].locais, opsTotal: todos[d].opsTotal ?? null, opsMov: todos[d].opsMov || null, grupos: todos[d].grupos || null, pessoasLocal: todos[d].pessoasLocal || {} }, atualizado_por: por }));
    try {
        for (let i = 0; i < linhas.length; i += 200) {
            const { error } = await supabaseClient.from('eficiencia_costura_dias').upsert(linhas.slice(i, i + 200), { onConflict: 'id' });
            if (error) throw error;
        }
        salvarEfCosturaPendentes(obterEfCosturaPendentes().filter(d => !dias.includes(d)));
        return true;
    } catch (e) {
        salvarEfCosturaPendentes([...obterEfCosturaPendentes(), ...dias]);
        avisarFalhaNuvemEfCostura(e);
        return false;
    }
}
async function carregarEfCosturaDaNuvem() {
    if (!supabaseClient || !sessaoAdminAtual || efCosturaSincronizando) return;
    efCosturaSincronizando = true;
    try {
        const pendentes = obterEfCosturaPendentes().filter(d => obterEficienciaCostura()[d]);
        if (pendentes.length) await publicarDiasEfCostura(pendentes);
        const { data, error } = await supabaseClient.from('eficiencia_costura_dias').select('id, dados');
        if (error) { avisarFalhaNuvemEfCostura(error); return; }
        const todos = obterEficienciaCostura();
        const aindaPendentes = new Set(obterEfCosturaPendentes());
        const naNuvem = new Set();
        let mudou = false;
        (data || []).forEach(l => {
            naNuvem.add(l.id);
            if (aindaPendentes.has(l.id) || !l.dados || !l.dados.locais) return;
            const novo = { locais: l.dados.locais, opsTotal: l.dados.opsTotal ?? null, ...(l.dados.opsMov ? { opsMov: l.dados.opsMov } : {}), ...(l.dados.grupos ? { grupos: l.dados.grupos } : {}), pessoasLocal: l.dados.pessoasLocal || {} };
            if (JSON.stringify(todos[l.id] || null) !== JSON.stringify(novo)) { todos[l.id] = novo; mudou = true; }
        });
        if (mudou) salvarEficienciaCostura(todos);
        const soLocais = Object.keys(todos).filter(d => !naNuvem.has(d));   // dias que só existem neste navegador → sobem
        if (soLocais.length) await publicarDiasEfCostura(soLocais);
        popularSeletorMesEfCostura();
        renderizarEficienciaCostura();
    } catch (e) {
        avisarFalhaNuvemEfCostura(e);
    } finally {
        efCosturaSincronizando = false;
    }
}

function processarEficienciaCostura() {
    if (!exigirAdminOuUsuario('importar a movimentação da costura')) return;
    const input = $('inputEfCostura'); if (!input || !input.files[0]) return;
    const r = new FileReader();
    r.onload = async function (e) {
        try {
            await carregarEfCosturaDaNuvem();   // traz o que os outros já digitaram (pessoas) antes de mesclar
            const buf = new Uint8Array(e.target.result);
            let texto;
            try { texto = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (err) { texto = new TextDecoder('windows-1252').decode(buf); }
            const linhas = texto.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
            if (linhas.length < 2) throw new Error('Arquivo vazio ou só com cabeçalho.');
            const cab = linhas[0].split(';').map(normalizarCabecalhoEf);
            const idxLocal = cab.findIndex(c => c === 'DS LOCAL');
            const idxOP = cab.findIndex(c => c === 'OP' || c === 'NR OP');
            const idxCicloEf = cab.findIndex(c => c === 'CICLO');
            const idxData = cab.findIndex(c => c === 'DT MOVIMENTO');
            const idxQtd = cab.findIndex(c => c === 'QT MOVIMENTO');
            const idxTempo = cab.findIndex(c => c === 'COD TEMPOLOCAL');
            const idxDescEf = cab.findIndex(c => c === 'DS DESCRICAO' || c === 'DS DESCRICAO OP' || c.startsWith('DS DESCRI'));   // descrição do produto → grupo (camisa, calça...)
            const idxTpProdEf = cab.findIndex(c => c === 'TP PRODUTO' || c === 'TIPO PRODUTO');
            const idxTipoMov = cab.findIndex(c => c === 'TIPO MOV' || c === 'TIPO MOVIMENTACAO' || c === 'TIPO MOVIMENTO');   // NORMAL / PARTE — movimentação de PARTE não conta
            const faltando = [];
            if (idxLocal === -1) faltando.push('Ds Local');
            if (idxOP === -1) faltando.push('Op');
            if (idxData === -1) faltando.push('Dt. Movimento');
            if (idxQtd === -1) faltando.push('Qt. Movimento');
            if (idxTempo === -1) faltando.push('Cod. Tempolocal');
            if (faltando.length) throw new Error('Não encontrei as colunas: ' + faltando.join(', ') + '. Esse é o relatório de movimentação com "Cod. Tempolocal"?');

            const novosDias = {};
            let linhasCostura = 0, linhasSemTempo = 0, linhasParte = 0;
            for (let i = 1; i < linhas.length; i++) {
                const c = linhas[i].split(';');
                if (idxTipoMov !== -1 && normalizarCabecalhoEf(c[idxTipoMov] || '') === 'PARTE' && ehLocalCosturaEficiencia((c[idxLocal] || '').trim())) { linhasParte++; continue; }
                const op = (c[idxOP] || '').trim(), dataStr = (c[idxData] || '').trim(), local = (c[idxLocal] || '').trim();
                if (!op || !dataStr || !ehLocalCosturaEficiencia(local)) continue;
                const d = parsearDataBR(dataStr); if (!d) continue;
                const dia = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                const qtd = numeroBR(c[idxQtd]) || 0;
                const tempo = numeroBR(c[idxTempo]);
                linhasCostura++;
                const nomeLocal = normalizarCabecalhoEf(local);
                const cicloEf = idxCicloEf !== -1 ? (c[idxCicloEf] || '').trim() : '';
                const reg = ((novosDias[dia] = novosDias[dia] || { locais: {}, ops: {}, opsMov: {}, grupos: {} }).locais[nomeLocal] = novosDias[dia].locais[nomeLocal] || { pecas: 0, minutos: 0, ops: 0, semTempo: 0 });
                reg.pecas += qtd; reg.ops++;
                novosDias[dia].ops[op] = true;
                // produção por GRUPO de produto (aba PRODUÇÃO POR GRUPO): peças e OPs distintas do dia
                const descEf = idxDescEf !== -1 ? (c[idxDescEf] || '') : '';
                let grupoEf = grupoProdutoKPI(descEf);
                if ((grupoEf === 'SEM PRODUTO' || grupoEf === 'OUTROS') && idxTpProdEf !== -1 && (c[idxTpProdEf] || '').trim()) { const g2 = grupoProdutoKPI(c[idxTpProdEf]); if (g2 !== 'SEM PRODUTO') grupoEf = g2; }
                const gr = novosDias[dia].grupos[grupoEf] = novosDias[dia].grupos[grupoEf] || { p: 0, ops: {} };
                gr.p += qtd; gr.ops[montarChaveOP(cicloEf, op)] = true;
                const chaveMov = montarChaveOP(cicloEf, op);   // peças que cada OP movimentou no dia (usado pelo PLANO DA COSTURA)
                const mv = novosDias[dia].opsMov[chaveMov] = novosDias[dia].opsMov[chaveMov] || { q: 0, l: [] };
                mv.q += qtd; if (!mv.l.includes(nomeLocal)) mv.l.push(nomeLocal);
                if (tempo === null) { reg.semTempo += qtd; linhasSemTempo++; } else reg.minutos += qtd * tempo;
            }
            if (!linhasCostura) throw new Error('Não achei nenhuma linha de costura (locais PNP/SLV COST SUP, INF ou CEL) nesse arquivo.');

            const todos = obterEficienciaCostura();
            Object.entries(novosDias).forEach(([dia, v]) => {
                Object.values(v.locais).forEach(l => { l.minutos = Math.round(l.minutos * 100) / 100; });
                todos[dia] = { locais: v.locais, opsTotal: Object.keys(v.ops).length, opsMov: v.opsMov, grupos: Object.fromEntries(Object.entries(v.grupos).map(([g, x]) => [g, { p: Math.round(x.p), o: Object.keys(x.ops).length }])), pessoasLocal: todos[dia] ? (todos[dia].pessoasLocal || {}) : {} };
            });
            salvarEficienciaCostura(todos);
            input.value = '';
            const dias = Object.keys(novosDias).sort();
            publicarDiasEfCostura(dias).then(ok => { if (ok) showToast('<i class="fas fa-cloud-upload-alt"></i> Eficiência da costura salva na nuvem.', false, 2500); });
            popularSeletorMesEfCostura(dias[dias.length - 1].slice(0, 7));
            renderizarEficienciaCostura();
            if (typeof renderizarPlanoCostura === 'function') renderizarPlanoCostura();   // a conferência do plano usa esse relatório
            showToast(`<i class="fas fa-check-double"></i> ${linhasCostura} linhas de costura em ${dias.length} dia(s) importadas.${linhasParte ? ` ${linhasParte} de PARTE ignorada(s).` : ''}${linhasSemTempo ? ` ⚠ ${linhasSemTempo} sem tempo (contam peças, não minutos).` : ''}`, false, linhasSemTempo ? 7000 : 3000);
        } catch (err) {
            input.value = '';
            alert('❌ Não foi possível importar a movimentação da costura.\n\n' + err.message);
        }
    };
    r.readAsArrayBuffer(input.files[0]);
}

function popularSeletorMesEfCostura(preferido) {
    const sel = $('seletorMesEfCostura'); if (!sel) return;
    const meses = [...new Set(Object.keys(obterEficienciaCostura()).map(d => d.slice(0, 7)))].sort();
    const anterior = sel.value;
    sel.innerHTML = meses.map(m => `<option value="${m}">${formatarMesLegivelKPI ? formatarMesLegivelKPI(m) : m}</option>`).join('');
    if (preferido && meses.includes(preferido)) sel.value = preferido;
    else if (meses.includes(anterior)) sel.value = anterior;
    else if (meses.length) sel.value = meses[meses.length - 1];
}

function definirPessoasEfCostura(dia, local, valor) {
    if (!exigirAdminOuUsuario('informar as pessoas do dia')) { renderizarEficienciaCostura(); return; }
    const todos = obterEficienciaCostura(); if (!todos[dia]) return;
    const n = parseFloat(String(valor).replace(',', '.'));
    todos[dia].pessoasLocal = todos[dia].pessoasLocal || {};
    todos[dia].pessoasLocal[local] = (isNaN(n) || n <= 0) ? 0 : n;   // 0 = apagado (guardado pra não ressuscitar na mescla com a nuvem)
    salvarEficienciaCostura(todos);
    renderizarEficienciaCostura();
    publicarDiasEfCostura([dia]);
}

// Um bloco por dia: linha de TOTAL do dia + uma linha por LOCAL de costura,
// cada local com as SUAS pessoas (cada local tem equipe própria, então a
// eficiência é por local). O total do dia usa só os locais que têm pessoas
// informadas (minutos desses locais ÷ pessoas × jornada deles).

const NOMES_LOCAIS_EF_COSTURA = { 'PNP COST SUP CAMISA': 'Camisa', 'PNP COST SUP MALHA': 'Malha', 'PNP COST INF CALCA': 'Calça', 'PNP COST CEL HIBRIDA': 'Híbrida' };
function nomeLocalEfCostura(n) { return NOMES_LOCAIS_EF_COSTURA[n] || String(n).replace(/^(PNP|SLV) /, ''); }
let graficoEfCosturaInstance = null;
const CORES_LOCAIS_EF_COSTURA = { 'PNP COST SUP CAMISA': '#4472C4', 'PNP COST SUP MALHA': '#ED7D31', 'PNP COST INF CALCA': '#4C8C4A', 'PNP COST CEL HIBRIDA': '#8E5EA2' };
// Linhas: uma por local + TOTAL (mais grossa) + linha tracejada em 100%.
// Dia sem pessoas informadas naquele local não tem ponto (a linha liga os dias que têm).
let graficosEfCosturaSepInstances = [];
function alternarModoGraficoEfCostura() {
    let atual = 'separados'; try { atual = localStorage.getItem('efCosturaGraficoModo') === 'juntos' ? 'juntos' : 'separados'; } catch (e) { /* padrão */ }
    try { localStorage.setItem('efCosturaGraficoModo', atual === 'juntos' ? 'separados' : 'juntos'); } catch (e) { /* ignora */ }
    renderizarEficienciaCostura();
}
const COR_STATUS_EF = e => e === null || e === undefined ? '#999' : (e >= 100 ? '#4C9A6A' : (e >= 70 ? '#D9A441' : '#C1444E'));
// Faixas de fundo: verde acima de 100% (meta batida), amarelo de 70 a 100, vermelho abaixo de 70% — mesmas cores dos pontos.
const faixasEficienciaPlugin = {
    id: 'faixasEficiencia',
    beforeDatasetsDraw(chart) {
        const { ctx, chartArea, scales } = chart; if (!chartArea || !scales.y) return;
        const y100 = scales.y.getPixelForValue(100), y70 = scales.y.getPixelForValue(70);
        const L = chartArea.left, W = chartArea.right - chartArea.left;
        ctx.save();
        ctx.fillStyle = 'rgba(76, 154, 106, 0.10)'; ctx.fillRect(L, chartArea.top, W, Math.max(0, y100 - chartArea.top));
        ctx.fillStyle = 'rgba(217, 164, 65, 0.07)'; ctx.fillRect(L, y100, W, Math.max(0, y70 - y100));
        ctx.fillStyle = 'rgba(193, 68, 78, 0.10)'; ctx.fillRect(L, y70, W, Math.max(0, chartArea.bottom - y70));
        ctx.restore();
    },
};
// Dia a dia. Padrão: um gráfico por local (mais o TOTAL), todos na mesma escala e com os pontos coloridos
// pela faixa (verde/amarelo/vermelho) — dá pra ler sem legenda. "Tudo junto" = as linhas no mesmo gráfico.
function desenharGraficoEficienciaCostura(dias, serieEf) {
    const canvas = $('graficoEfCostura'); if (!canvas) return;
    if (graficoEfCosturaInstance) { graficoEfCosturaInstance.destroy(); graficoEfCosturaInstance = null; }
    graficosEfCosturaSepInstances.forEach(g => g.destroy()); graficosEfCosturaSepInstances = [];
    const aviso = $('graficoEfCosturaAviso');
    const nomes = [...new Set(dias.flatMap(d => Object.keys(serieEf[d].locais)))].sort();
    const temDado = dias.some(d => serieEf[d].total !== null || nomes.some(n => serieEf[d].locais[n] && serieEf[d].locais[n].efic !== null));
    const wrapJunto = $('graficoEfCosturaJuntoWrap'), wrapSep = $('graficosEfCosturaSeparados');
    let modo = 'separados'; try { modo = localStorage.getItem('efCosturaGraficoModo') === 'juntos' ? 'juntos' : 'separados'; } catch (e) { /* padrão */ }
    if ($('txtModoGraficoEfCostura')) $('txtModoGraficoEfCostura').textContent = modo === 'separados' ? 'TUDO JUNTO' : 'UM POR LOCAL';
    if (aviso) aviso.style.display = temDado ? 'none' : '';
    if (!temDado) { if (wrapJunto) wrapJunto.style.display = 'none'; if (wrapSep) wrapSep.style.display = 'none'; return; }
    if (wrapJunto) wrapJunto.style.display = modo === 'juntos' ? '' : 'none';
    if (wrapSep) wrapSep.style.display = modo === 'separados' ? 'grid' : 'none';
    const arred = v => v === null || v === undefined ? null : Math.round(v * 10) / 10;
    const escuro = document.body.classList.contains('dark-mode');
    const corTexto = escuro ? '#D8D2C5' : '#555';
    const corTotal = escuro ? '#F2EFE9' : '#2B2620';
    const infoDe = (rotulo, dia) => rotulo === 'TOTAL' ? serieEf[dia] : Object.entries(serieEf[dia].locais).find(([n]) => nomeLocalEfCostura(n) === rotulo)?.[1];
    const tooltipLabel = c => {
        if (c.dataset.label === 'Meta 100%') return null;
        const info = infoDe(c.dataset.label, dias[c.dataIndex]);
        const det = info && info.disp ? `  (${Math.round(info.min).toLocaleString('pt-BR')} ÷ ${Math.round(info.disp).toLocaleString('pt-BR')} min)` : '';
        return `${c.dataset.label}: ${(c.parsed.y ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%${det}`;
    };
    const escalaY = { beginAtZero: true, min: 0, suggestedMax: 120, ticks: { callback: v => v + '%', color: corTexto }, grid: { color: escuro ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)' } };
    const escalaX = { ticks: { color: corTexto, maxRotation: 0, autoSkip: true, maxTicksLimit: 10 }, grid: { display: false } };
    const labelsX = dias.map(d => formatarChaveDataBR(d).slice(0, 5));   // dd/mm — o ano já está no filtro de mês

    if (modo === 'juntos') {
        const datasets = nomes.map(n => ({
            label: nomeLocalEfCostura(n), data: dias.map(d => serieEf[d].locais[n] ? arred(serieEf[d].locais[n].efic) : null),
            borderColor: CORES_LOCAIS_EF_COSTURA[n] || '#999', backgroundColor: CORES_LOCAIS_EF_COSTURA[n] || '#999',
            tension: 0, fill: false, spanGaps: true, borderWidth: 2, pointRadius: 3,
        }));
        datasets.push({ label: 'TOTAL', data: dias.map(d => arred(serieEf[d].total)), borderColor: corTotal, backgroundColor: corTotal, tension: 0, fill: false, spanGaps: true, borderWidth: 4, pointRadius: 4 });
        datasets.push({ label: 'Meta 100%', data: dias.map(() => 100), borderColor: '#4C9A6A', borderDash: [8, 5], borderWidth: 2, pointRadius: 0, fill: false });
        graficoEfCosturaInstance = new Chart(canvas, {
            type: 'line', plugins: [faixasEficienciaPlugin],
            data: { labels: labelsX, datasets },
            options: {
                responsive: true, maintainAspectRatio: false, color: corTexto, interaction: { mode: 'index', intersect: false },
                plugins: { legend: { display: true, labels: { filter: i => i.text !== 'Meta 100%', usePointStyle: true } }, datalabels: { display: false }, tooltip: { callbacks: { label: tooltipLabel }, itemSort: (a, b) => (b.parsed.y ?? -1) - (a.parsed.y ?? -1) } },
                scales: { y: escalaY, x: escalaX },
            },
        });
        return;
    }

    // um gráfico por local (+ TOTAL primeiro)
    const paineis = [{ rotulo: 'TOTAL', titulo: 'TOTAL — todos os locais', valores: dias.map(d => arred(serieEf[d].total)), cor: corTotal }]
        .concat(nomes.map(n => ({ rotulo: nomeLocalEfCostura(n), titulo: nomeLocalEfCostura(n), valores: dias.map(d => serieEf[d].locais[n] ? arred(serieEf[d].locais[n].efic) : null), cor: CORES_LOCAIS_EF_COSTURA[n] || '#999' })));
    wrapSep.innerHTML = paineis.map((pn, i) => {
        const v = pn.valores.filter(x => x !== null);
        const media = v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
        const ultimo = v.length ? v[v.length - 1] : null;
        const fmtp = x => x === null ? '—' : x.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%';
        return `<div style="border:1px solid var(--borda-cor); border-top:4px solid ${pn.cor}; border-radius:8px; background:var(--bg-card); padding:8px 10px;">
            <div style="display:flex; justify-content:space-between; align-items:baseline; gap:8px; margin-bottom:4px;">
                <strong style="font-size:13px;">${pn.titulo}</strong>
                <span style="font-size:11px; color:var(--texto-secundario);">média <strong style="color:${COR_STATUS_EF(media)};">${fmtp(media)}</strong> · último <strong style="color:${COR_STATUS_EF(ultimo)};">${fmtp(ultimo)}</strong></span>
            </div>
            <div style="position:relative; height:190px;"><canvas id="graficoEfCosturaSep${i}"></canvas></div></div>`;
    }).join('');
    paineis.forEach((pn, i) => {
        graficosEfCosturaSepInstances.push(new Chart($('graficoEfCosturaSep' + i), {
            type: 'line', plugins: [faixasEficienciaPlugin],
            data: { labels: labelsX, datasets: [
                { label: pn.rotulo, data: pn.valores, borderColor: pn.cor, backgroundColor: pn.valores.map(COR_STATUS_EF), pointBackgroundColor: pn.valores.map(COR_STATUS_EF), pointBorderColor: pn.valores.map(COR_STATUS_EF), tension: 0, fill: false, spanGaps: true, borderWidth: pn.rotulo === 'TOTAL' ? 3 : 2, pointRadius: 4, pointHoverRadius: 6 },
                { label: 'Meta 100%', data: dias.map(() => 100), borderColor: '#4C9A6A', borderDash: [6, 4], borderWidth: 1.5, pointRadius: 0, fill: false },
            ] },
            options: {
                responsive: true, maintainAspectRatio: false, color: corTexto,
                plugins: { legend: { display: false }, datalabels: { display: false }, tooltip: { callbacks: { label: tooltipLabel } } },
                scales: { y: escalaY, x: escalaX },
            },
        }));
    });
}


// "Peças por dia": mesma ideia da tabela do KPI do corte — uma linha por dia, uma coluna por local, "peças (N OPs)".
function renderizarTabelaPecasCostura(dias, todos) {
    const el = $('efCosturaPecasTabela'); if (!el) return;
    if (!dias.length) { el.innerHTML = ''; return; }
    const nomes = [...new Set(dias.flatMap(d => Object.keys(todos[d].locais || {})))].sort();
    const fmt = v => v.toLocaleString('pt-BR');
    const totaisLocal = {}; let totalGeral = 0;
    const linhas = dias.map(dia => {
        const locais = todos[dia].locais || {};
        let pecasDia = 0;
        const celulas = nomes.map(n => {
            const l = locais[n];
            if (!l || !l.pecas) return `<td style="text-align:right; color:var(--texto-secundario);">—</td>`;
            pecasDia += l.pecas; totaisLocal[n] = (totaisLocal[n] || 0) + l.pecas;
            return `<td style="text-align:right;">${fmt(l.pecas)} <span style="color:var(--texto-secundario); font-size:11px;">(${l.ops} OP${l.ops === 1 ? '' : 's'})</span></td>`;
        }).join('');
        totalGeral += pecasDia;
        const opsDia = todos[dia].opsTotal;
        return `<tr><td><strong>${formatarChaveDataBR(dia)}</strong></td>${celulas}<td style="text-align:right; font-weight:700;">${pecasDia ? fmt(pecasDia) : '—'}${pecasDia && opsDia ? ` <span style="color:var(--texto-secundario); font-size:11px; font-weight:400;">(${opsDia} OP${opsDia === 1 ? '' : 's'})</span>` : ''}</td></tr>`;
    }).join('');
    el.innerHTML = `<table class="tabela-dados" style="width:100%;">
        <thead><tr><th>DATA</th>${nomes.map(n => `<th style="text-align:right;">${nomeLocalEfCostura(n)}</th>`).join('')}<th style="text-align:right;">TOTAL</th></tr></thead>
        <tbody>${linhas}</tbody>
        <tfoot><tr style="font-weight:700; background:var(--bg-painel);"><td>TOTAL DO MÊS</td>${nomes.map(n => `<td style="text-align:right;">${fmt(totaisLocal[n] || 0)}</td>`).join('')}<td style="text-align:right;">${fmt(totalGeral)}</td></tr></tfoot>
    </table>`;
}

function renderizarEficienciaCostura() {
    const corpo = $('efCosturaCorpo'); if (!corpo) return;
    setTimeout(atualizarEficienciaSeqCostura, 0);
    const todos = obterEficienciaCostura();
    const mes = $('seletorMesEfCostura') ? $('seletorMesEfCostura').value : '';
    const minPessoa = parseFloat($('efCosturaMinPessoa') ? $('efCosturaMinPessoa').value : 528) || 528;
    const dias = Object.keys(todos).filter(d => d.startsWith(mes)).sort();
    if (!dias.length) {
        corpo.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:20px; color:var(--texto-secundario);">Nenhum dado ainda — importe o relatório de movimentação.</td></tr>';
        $('efCosturaResumo').innerHTML = ''; if ($('efCosturaPorLocal')) $('efCosturaPorLocal').innerHTML = ''; if ($('efCosturaPecasTabela')) $('efCosturaPecasTabela').innerHTML = '';
        return;
    }
    const nomeCurto = nomeLocalEfCostura;
    const fmt = (v, c = 0) => v.toLocaleString('pt-BR', { maximumFractionDigits: c });
    const efTxt = e => e === null ? '<span style="color:var(--texto-secundario); font-weight:400;">informe as pessoas</span>' : fmt(e, 1) + '%';
    let totPecas = 0, totMin = 0, minComPessoas = 0, minDisp = 0;
    const porLocalMes = {};
    const serieEf = {};   // dia → { total, locais: { nome: {efic, min, disp} } } — alimenta o gráfico
    corpo.innerHTML = dias.map(dia => {
        const d = todos[dia];
        const pl = d.pessoasLocal || {};
        serieEf[dia] = { total: null, locais: {} };
        // filtra de novo ao mostrar: dias importados antes de um local sair da lista também deixam de contá-lo
        const locais = Object.entries(d.locais).filter(([n]) => ehLocalCosturaEficiencia(n)).sort((a, b) => a[0].localeCompare(b[0]));
        if (!locais.length) return '';
        const [ano, m, dd] = dia.split('-');
        let dPecas = 0, dMin = 0, dMinOk = 0, dDisp = 0, dSemTempo = 0, dPessoas = 0;
        const linhasLocais = locais.map(([nome, l]) => {
            const pessoas = pl[nome] || null;
            const disp = pessoas ? pessoas * minPessoa : null;
            const efic = disp ? (l.minutos / disp) * 100 : null;
            serieEf[dia].locais[nome] = { efic, min: l.minutos, disp };
            dPecas += l.pecas; dMin += l.minutos; dSemTempo += (l.semTempo || 0);
            if (disp) { dMinOk += l.minutos; dDisp += disp; dPessoas += pessoas; }
            const p = porLocalMes[nome] = porLocalMes[nome] || { pecas: 0, minutos: 0, minOk: 0, disp: 0, dias: 0 };
            p.pecas += l.pecas; p.minutos += l.minutos; if (disp) { p.minOk += l.minutos; p.disp += disp; p.dias++; }
            return `<tr>
                <td style="padding-left:24px; color:var(--texto-secundario);">${dd}/${m}</td>
                <td><strong>${nomeCurto(nome)}</strong></td>
                <td style="text-align:right;">${fmt(l.pecas)}${l.semTempo ? ` <span title="${l.semTempo} peças sem tempo no relatório (não entram nos minutos)" style="color:var(--cor-alerta);">⚠</span>` : ''}</td>
                <td style="text-align:right;">${l.ops}</td>
                <td style="text-align:right;">${fmt(l.minutos)}</td>
                <td style="text-align:center;"><input type="number" min="0" step="1" value="${pessoas ?? ''}" placeholder="—" style="width:64px; text-align:center;" onchange="definirPessoasEfCostura('${dia}', '${nome.replace(/'/g, "\\'")}', this.value)"></td>
                <td style="text-align:right;">${disp ? fmt(disp) : '—'}</td>
                <td style="text-align:right; font-weight:700;">${efTxt(efic)}</td>
            </tr>`;
        }).join('');
        totPecas += dPecas; totMin += dMin; minComPessoas += dMinOk; minDisp += dDisp;
        const dEfic = dDisp ? (dMinOk / dDisp) * 100 : null;
        serieEf[dia].total = dEfic; serieEf[dia].min = dMinOk; serieEf[dia].disp = dDisp;
        const cab = `<tr class="ef-dia-total">
            <td><strong>${dd}/${m}/${ano}</strong></td>
            <td><strong>TOTAL DO DIA</strong></td>
            <td style="text-align:right; font-weight:700;">${fmt(dPecas)}${dSemTempo ? ' <span style="color:var(--cor-alerta);" title="Há peças sem tempo no relatório">⚠</span>' : ''}</td>
            <td style="text-align:right;">${locais.reduce((a, [, l]) => a + l.ops, 0)}</td>
            <td style="text-align:right; font-weight:700;">${fmt(dMin)}</td>
            <td style="text-align:center;">${dPessoas || '—'}</td>
            <td style="text-align:right;">${dDisp ? fmt(dDisp) : '—'}</td>
            <td style="text-align:right; font-weight:700;">${efTxt(dEfic)}${dDisp && dMinOk < dMin ? ' <span title="Só os locais com pessoas informadas entram nessa %" style="color:var(--cor-alerta); font-weight:400;">*</span>' : ''}</td>
        </tr>`;
        return cab + linhasLocais;
    }).join('');

    desenharGraficoEficienciaCostura(dias, serieEf);
    renderizarTabelaPecasCostura(dias, todos);
    const eficMes = minDisp ? (minComPessoas / minDisp) * 100 : null;
    const card = (titulo, valor, sub) => `<div class="kpi-card" style="flex:1; min-width:180px; border-top:4px solid #35505C; padding:14px; background:var(--bg-card); border-radius:8px;"><div style="font-size:11px; color:var(--texto-secundario); text-transform:uppercase; font-weight:700;">${titulo}</div><div style="font-size:26px; font-weight:700; font-family:var(--fonte-display);">${valor}</div><div style="font-size:11px; color:var(--texto-secundario);">${sub}</div></div>`;
    $('efCosturaResumo').innerHTML =
        card('Eficiência do mês (todos os locais)', eficMes !== null ? fmt(eficMes, 1) + '%' : '—', minDisp ? 'só locais/dias com pessoas informadas' : 'informe as pessoas por local') +
        card('Peças no mês', fmt(totPecas), `${dias.length} dia(s) importados`) +
        card('Minutos produzidos', fmt(totMin), '');
    if ($('efCosturaPorLocal')) {
        $('efCosturaPorLocal').innerHTML = `<div style="font-size:11px; font-weight:700; color:var(--texto-secundario); text-transform:uppercase; margin:18px 0 8px;">Resumo do mês por local</div>
        <table class="tabela-dados" style="width:100%;"><thead><tr><th>LOCAL</th><th>PEÇAS</th><th>MIN. PRODUZIDOS</th><th>DIAS COM PESSOAS</th><th>EFICIÊNCIA</th></tr></thead><tbody>` +
        Object.entries(porLocalMes).sort((a, b) => b[1].minutos - a[1].minutos).map(([n, p]) =>
            `<tr><td><strong>${nomeCurto(n)}</strong></td><td style="text-align:right;">${fmt(p.pecas)}</td><td style="text-align:right;">${fmt(p.minutos)}</td><td style="text-align:center;">${p.dias} de ${dias.length}</td><td style="text-align:right; font-weight:700;">${efTxt(p.disp ? (p.minOk / p.disp) * 100 : null)}</td></tr>`).join('') +
        '</tbody></table>';
    }
}


// =========================================================================
// 📥 BAIXAR MÊS / 🗑 LIMPAR MÊS da EFICIÊNCIA DA COSTURA — mesma ideia do KPI
// do corte: o arquivo congela o mês como está agora (com aba GRÁFICOS) e o
// LIMPAR só apaga o mês escolhido, só deste navegador (a nuvem não é mexida).
// =========================================================================
function montarDadosMesEfCostura(anoMes) {
    const todos = obterEficienciaCostura();
    const minPessoa = parseFloat($('efCosturaMinPessoa') ? $('efCosturaMinPessoa').value : 528) || 528;
    const dias = Object.keys(todos).filter(d => d.startsWith(anoMes)).sort();
    const nomes = [...new Set(dias.flatMap(d => Object.keys(todos[d].locais || {}).filter(ehLocalCosturaEficiencia)))].sort();
    const arred = (v, c = 1) => v === null || v === undefined ? '' : Math.round(v * Math.pow(10, c)) / Math.pow(10, c);
    const diaADia = [['DATA', 'LOCAL', 'PEÇAS', 'OPs', 'MIN. PRODUZIDOS', 'PESSOAS', 'MIN. DISPONÍVEIS', 'EFICIÊNCIA (%)']];
    const pecasPorDia = [['DATA', ...nomes.map(nomeLocalEfCostura), 'TOTAL']];
    const serie = {}; nomes.forEach(n => serie[n] = []); const serieTotal = [];
    const mes = {}; nomes.forEach(n => mes[n] = { pecas: 0, min: 0, minOk: 0, disp: 0, dias: 0 });
    let totPecas = 0, totMin = 0, totMinOk = 0, totDisp = 0;
    dias.forEach(dia => {
        const d = todos[dia], pl = d.pessoasLocal || {};
        let dPecas = 0, dMin = 0, dMinOk = 0, dDisp = 0, dPessoas = 0, dOps = 0;
        const celulas = nomes.map(n => {
            const l = (d.locais || {})[n];
            if (!l) { serie[n].push(null); return ''; }
            const pessoas = pl[n] || null, disp = pessoas ? pessoas * minPessoa : null;
            const efic = disp ? (l.minutos / disp) * 100 : null;
            serie[n].push(efic === null ? null : arred(efic));
            diaADia.push([formatarChaveDataBR(dia), nomeLocalEfCostura(n), l.pecas, l.ops, Math.round(l.minutos), pessoas || '', disp ? Math.round(disp) : '', arred(efic)]);
            dPecas += l.pecas; dMin += l.minutos; dOps += l.ops;
            const m = mes[n]; m.pecas += l.pecas; m.min += l.minutos;
            if (disp) { dMinOk += l.minutos; dDisp += disp; dPessoas += pessoas; m.minOk += l.minutos; m.disp += disp; m.dias++; }
            return l.pecas;
        });
        const dEfic = dDisp ? (dMinOk / dDisp) * 100 : null;
        serieTotal.push(dEfic === null ? null : arred(dEfic));
        diaADia.splice(diaADia.length - celulas.filter(c => c !== '').length, 0, [formatarChaveDataBR(dia), 'TOTAL DO DIA', dPecas, dOps, Math.round(dMin), dPessoas || '', dDisp ? Math.round(dDisp) : '', arred(dEfic)]);
        pecasPorDia.push([formatarChaveDataBR(dia), ...celulas, dPecas]);
        totPecas += dPecas; totMin += dMin; totMinOk += dMinOk; totDisp += dDisp;
    });
    pecasPorDia.push(['TOTAL DO MÊS', ...nomes.map(n => mes[n].pecas), totPecas]);
    const resumo = [[`Eficiência da costura — ${rotuloMesKPI(anoMes)}`], [`Minutos por pessoa/dia: ${minPessoa}. Congelado no momento em que o arquivo foi baixado.`], [],
        ['EFICIÊNCIA DO MÊS (%)', arred(totDisp ? (totMinOk / totDisp) * 100 : null), 'PEÇAS NO MÊS', totPecas, 'MIN. PRODUZIDOS', Math.round(totMin), 'DIAS IMPORTADOS', dias.length], [],
        ['LOCAL', 'PEÇAS', 'MIN. PRODUZIDOS', 'DIAS COM PESSOAS', 'EFICIÊNCIA (%)'],
        ...nomes.map(n => [nomeLocalEfCostura(n), mes[n].pecas, Math.round(mes[n].min), `${mes[n].dias} de ${dias.length}`, arred(mes[n].disp ? (mes[n].minOk / mes[n].disp) * 100 : null)])];
    // ---- PRODUÇÃO POR GRUPO (camisa polo, calça, bermuda...): total do mês e peças de cada dia
    const gMes = {}; let diasSemGrupo = 0;
    dias.forEach(dia => { const g = todos[dia].grupos; if (!g) { diasSemGrupo++; return; } Object.entries(g).forEach(([nome, x]) => { const r = gMes[nome] = gMes[nome] || { p: 0, o: 0, dia: {} }; r.p += x.p; r.o += x.o; r.dia[dia] = x.p; }); });
    const listaG = Object.entries(gMes).sort((x, y) => y[1].p - x[1].p), totG = listaG.reduce((t, [, x]) => t + x.p, 0);
    const producaoGrupo = [['GRUPO', 'PEÇAS NO MÊS', '% DO MÊS', 'OPs (soma dos dias)', ...dias.map(d => formatarChaveDataBR(d).slice(0, 5))],
        ...listaG.map(([nome, x]) => [nome, x.p, totG ? arred((x.p / totG) * 100) : '', x.o, ...dias.map(d => x.dia[d] || '')]),
        ['TOTAL DO MÊS', totG, totG ? 100 : '', '', ...dias.map(d => listaG.reduce((t, [, x]) => t + (x.dia[d] || 0), 0) || '')]];
    if (diasSemGrupo) producaoGrupo.push([], [`${diasSemGrupo} dia(s) importado(s) antes do detalhe por grupo não entram nessa aba — reimporte a movimentação deles.`]);
    return { rotuloMes: rotuloMesKPI(anoMes), dias, nomes, resumo, diaADia, pecasPorDia, producaoGrupo, temGrupos: listaG.length > 0, serie, serieTotal, totPecas };
}

function gerarPngGraficoEfCostura(titulo, labels, series, largura, altura) {
    const canvas = document.createElement('canvas');
    canvas.width = largura; canvas.height = altura;
    const fundoBranco = { id: 'fundoBrancoEf', beforeDraw(chart) { const c = chart.ctx; c.save(); c.globalCompositeOperation = 'destination-over'; c.fillStyle = '#FFFFFF'; c.fillRect(0, 0, chart.width, chart.height); c.restore(); } };
    const meta = series.length ? [{ label: 'Meta 100%', data: labels.map(() => 100), borderColor: '#4C9A6A', borderDash: [6, 5], borderWidth: 1.5, pointRadius: 0, fill: false }] : [];
    const g = new Chart(canvas, {
        type: 'line', plugins: [fundoBranco],
        data: { labels, datasets: [...series.map(se => ({ label: se.label, data: se.data, borderColor: se.cor, backgroundColor: se.cor, tension: 0.25, fill: false, borderWidth: 2, pointRadius: 3, spanGaps: true })), ...meta] },
        options: {
            responsive: false, animation: false, devicePixelRatio: 1, color: '#333',
            plugins: { legend: { display: series.length > 1 }, title: { display: true, text: titulo, font: { size: 15, weight: 'bold' } }, datalabels: { display: false } },
            scales: { y: { beginAtZero: true, suggestedMax: 120, title: { display: true, text: 'Eficiência (%)' } } },
        },
    });
    const png = canvas.toDataURL('image/png').split(',')[1];
    g.destroy();
    return png;
}

async function baixarMesEfCosturaExcel() {
    if (!exigirBibliotecaExcel()) return;
    const anoMes = $('seletorMesEfCostura') ? $('seletorMesEfCostura').value : '';
    if (!anoMes) return alert('Escolha um mês no seletor MÊS antes de baixar.');
    const dados = montarDadosMesEfCostura(anoMes);
    if (!dados.dias.length) return alert(`Não há nenhum dado de eficiência importado em ${dados.rotuloMes}.`);
    const abas = [
        ['RESUMO', dados.resumo, [26, 16, 22, 20, 20, 18, 18, 14], 6],
        ['DIA A DIA', dados.diaADia, [12, 22, 10, 8, 16, 10, 16, 16], 1],
        ['PEÇAS POR DIA', dados.pecasPorDia, [14, ...dados.nomes.map(() => 12), 12], 1],
        ...(dados.temGrupos ? [['PRODUÇÃO POR GRUPO', dados.producaoGrupo, [26, 16, 12, 18, ...dados.dias.map(() => 8)], 1]] : []),
    ];
    if (typeof ExcelJS !== 'undefined' && typeof Chart !== 'undefined') {
        try {
            const wb = new ExcelJS.Workbook();
            const preencher = (nome, linhas, larguras, linhaCab) => {
                const ws = wb.addWorksheet(nome);
                linhas.forEach(l => {
                    const row = ws.addRow(l);
                    // linha de total (TOTAL DO DIA / TOTAL DO MÊS) em destaque, pra não se misturar com as linhas dos locais
                    if (l[1] === 'TOTAL DO DIA' || l[0] === 'TOTAL DO MÊS') {
                        row.font = { bold: true };
                        row.eachCell({ includeEmpty: true }, (c, n) => { if (n <= larguras.length) { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFBDD7EE' } }; c.border = { top: { style: 'thin', color: { argb: 'FF5B9BD5' } }, bottom: { style: 'thin', color: { argb: 'FF5B9BD5' } } }; } });
                    }
                });
                larguras.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
                const cab = ws.getRow(linhaCab); cab.font = { bold: true }; cab.alignment = { wrapText: true, vertical: 'middle' };
                cab.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8DFC8' } }; });
                if (linhaCab > 1) ws.getRow(1).font = { bold: true, size: 13 };
                return ws;
            };
            preencher(...abas[0]);
            const wsG = wb.addWorksheet('GRÁFICOS');
            const labels = dados.dias.map(d => d.slice(8) + '/' + d.slice(5, 7));
            const COL = 64, LIN = 20;
            const colocar = (png, x, y, w, h) => { const id = wb.addImage({ base64: png, extension: 'png' }); wsG.addImage(id, { tl: { col: x / COL, row: y / LIN }, ext: { width: w, height: h } }); };
            wsG.getCell('A1').value = `Gráficos — Eficiência da costura — ${dados.rotuloMes}`; wsG.getCell('A1').font = { bold: true, size: 14 };
            wsG.getCell('A2').value = 'Eficiência por dia (só aparece o ponto nos dias com pessoas informadas). Congelado no momento em que o arquivo foi baixado.'; wsG.getCell('A2').font = { italic: true, color: { argb: 'FF666666' } };
            const cor = n => CORES_LOCAIS_EF_COSTURA[n] || '#999';
            let y = 4 * LIN;
            colocar(gerarPngGraficoEfCostura(`TOTAL e todos os locais — ${dados.rotuloMes}`, labels, [{ label: 'TOTAL', data: dados.serieTotal, cor: '#222222' }, ...dados.nomes.map(n => ({ label: nomeLocalEfCostura(n), data: dados.serie[n], cor: cor(n) }))], 1260, 400), 8, y, 1260, 400);
            y += 420;
            [{ n: null }, ...dados.nomes.map(n => ({ n }))].forEach((it, i) => {
                const x = 8 + (i % 2) * 640, yy = y + Math.floor(i / 2) * 310;
                const dadosSerie = it.n ? dados.serie[it.n] : dados.serieTotal;
                const nome = it.n ? nomeLocalEfCostura(it.n) : 'TOTAL — todos os locais';
                colocar(gerarPngGraficoEfCostura(nome, labels, [{ label: nome, data: dadosSerie, cor: it.n ? cor(it.n) : '#222222' }], 620, 300), x, yy, 620, 300);
            });
            abas.slice(1).forEach(a => preencher(...a));
            const buf = await wb.xlsx.writeBuffer();
            const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
            const link = document.createElement('a'); link.href = url; link.download = `EficienciaCostura_${anoMes}.xlsx`;
            document.body.appendChild(link); link.click(); link.remove();
            setTimeout(() => URL.revokeObjectURL(url), 5000);
            showToast(`<i class="fas fa-file-excel"></i> Eficiência da costura de ${dados.rotuloMes} baixada com gráficos (${dados.dias.length} dias).`);
            return;
        } catch (e) {
            registrarLogDebug('error', ['[Eficiência costura] Falha ao gerar Excel com gráficos, baixando sem: ' + (e && e.message)]);
        }
    }
    const wb = XLSX.utils.book_new();
    abas.forEach(([nome, linhas, larguras]) => {
        const ws = XLSX.utils.aoa_to_sheet(linhas);
        ws['!cols'] = larguras.map(w => ({ wch: w }));
        XLSX.utils.book_append_sheet(wb, ws, nome);
    });
    XLSX.writeFile(wb, `EficienciaCostura_${anoMes}.xlsx`);
    showToast(`<i class="fas fa-file-excel"></i> Eficiência da costura de ${dados.rotuloMes} baixada SEM gráficos (a biblioteca de gráficos para Excel não carregou — recarregue a página).`);
}

function limparMesEfCostura() {
    if (!exigirAdmin('limpar dados da eficiência da costura')) return;
    const anoMes = $('seletorMesEfCostura') ? $('seletorMesEfCostura').value : '';
    if (!anoMes) return alert('Escolha no seletor MÊS qual mês você quer limpar.');
    const todos = obterEficienciaCostura();
    const doMes = Object.keys(todos).filter(d => d.startsWith(anoMes));
    const rotulo = rotuloMesKPI(anoMes);
    if (!doMes.length) return alert(`Não há dados de ${rotulo} pra limpar.`);
    const outros = Object.keys(todos).length - doMes.length;
    const mensagem = `Vai apagar ${doMes.length} dia(s) de ${rotulo} da eficiência da costura (movimentação e pessoas informadas).\n\n`
        + `Os outros meses NÃO são mexidos (${outros} dia(s) continuam).\n\n`
        + `Só apaga deste navegador — o que já foi publicado na nuvem continua lá. Se ainda não baixou o arquivo do mês (BAIXAR MÊS), baixe antes.\n\n`
        + `Não dá pra desfazer. Confirma?`;
    if (!confirm(mensagem)) return;
    doMes.forEach(d => delete todos[d]);
    salvarEficienciaCostura(todos);
    popularSeletorMesEfCostura();
    renderizarEficienciaCostura();
    showToast(`<i class="fas fa-check"></i> ${rotulo} limpo (${doMes.length} dia(s)). Os outros meses foram mantidos.`);
}

function processarMovimentacaoSetor() {
    if (!exigirAdmin('importar movimentação de setor')) return;
    const input = $('inputMovimentacaoKPI'); if (!input.files[0]) return;

    const r = new FileReader();
    r.onload = function (e) {
        try {
            const texto = e.target.result;
            const linhas = texto.replace(/^\uFEFF/, '').split(/\r?\n/).filter(l => l.trim()); // remove BOM (comum em CSV exportado do Windows), que senão gruda no primeiro nome de coluna
            if (linhas.length < 2) throw new Error("Arquivo vazio ou só com cabeçalho.");
            const cabecalho = linhas[0].split(';').map(c => c.trim().toUpperCase());
            const idxOP = cabecalho.findIndex(c => c === 'NR. OP');
            const idxCiclo = cabecalho.findIndex(c => c === 'CICLO');
            const idxData = cabecalho.findIndex(c => c === 'DT. MOVIMENTO');
            const idxQtd = cabecalho.findIndex(c => c === 'QT. MOVIMENTO');
            const idxLocalOrigem = cabecalho.findIndex(c => c === 'DS. LOCALORIGEM');
            const idxLocalDestino = cabecalho.findIndex(c => c === 'DS. LOCALDESTINO');
            const idxOficina = cabecalho.findIndex(c => c.replace(/\./g, '').replace(/\s+/g, ' ') === 'COD LOC PROD COST');   // coluna N: INT ou o nome da oficina (externo)
            // Não sabemos o nome exato dessa coluna nessa planilha — busca
            // tolerante por qualquer cabeçalho que tenha "DESCRI" nele.
            const idxDescricao = cabecalho.findIndex(c => c.includes('DESCRI') || (c.includes('PRODUTO') && c.startsWith('DS')));
            if (idxOP === -1 || idxData === -1 || idxQtd === -1 || idxLocalOrigem === -1) {
                throw new Error("Não encontrei as colunas esperadas (Nr. Op, Dt. Movimento, Qt. Movimento, Ds. Localorigem) no cabeçalho da primeira linha.");
            }

            // O setor não precisa mais ser escolhido antes de importar — o
            // sistema lê sozinho pela coluna "Ds. Localorigem" de cada
            // linha (o número representa o que aquele setor PRODUZIU, é de
            // lá que a OP sai), usando o mapeamento pros 7 nomes conhecidos.
            //
            // Duas situações NÃO contam como produção de verdade (a peça
            // não seguiu adiante) e são ignoradas, mesmo tendo uma origem
            // reconhecida: (1) o movimento não tem NENHUM destino — a
            // planilha vem assim quando a peça foi descartada/perdida, não
            // produzida; (2) o destino é um setor que vem ANTES do de
            // origem na esteira (voltou pra trás, é retrabalho/correção,
            // não produção nova).
            const movimentosImportados = [];   // o que ESTA importação gravou — vai pra nuvem logo depois
            const todas = obterMovimentacoesPorSetorBruto();
            const setoresEncontrados = new Set();
            let linhasLidas = 0, linhasComLocalDesconhecido = 0, linhasSemDestino = 0, linhasRetrocedendo = 0, linhasComMultiplicador = 0, linhasExternas = 0, linhasExternasPorDestino = 0;
            const oficinasNaoClassificadas = new Set();
            const classifImport = obterClassificacaoOficinasKPI();

            for (let i = 1; i < linhas.length; i++) {
                const campos = linhas[i].split(';');
                const opId = campos[idxOP] ? String(campos[idxOP]).trim() : '';
                const dataStr = campos[idxData] ? String(campos[idxData]).trim() : '';
                if (!opId || !dataStr) continue; // pula linha de total (vem com os campos de texto vazios) e linhas malformadas
                const data = parsearDataBR(dataStr);
                if (!data) continue;

                const localOrigemBruto = campos[idxLocalOrigem] ? String(campos[idxLocalOrigem]).trim().toUpperCase() : '';
                const setor = MAPEAMENTO_LOCAL_DESTINO_KPI[localOrigemBruto];
                if (!setor) { linhasComLocalDesconhecido++; continue; }

                const localDestinoBruto = idxLocalDestino !== -1 && campos[idxLocalDestino] ? String(campos[idxLocalDestino]).trim().toUpperCase() : '';
                if (!localDestinoBruto) { linhasSemDestino++; continue; } // sem destino nenhum = peça não produzida

                const setorDestino = MAPEAMENTO_LOCAL_DESTINO_KPI[localDestinoBruto];
                if (setorDestino) {
                    const idxOrigemEsteira = SETORES_KPI.indexOf(setor);
                    const idxDestinoEsteira = SETORES_KPI.indexOf(setorDestino);
                    if (idxDestinoEsteira < idxOrigemEsteira) { linhasRetrocedendo++; continue; } // voltou pra trás na esteira
                }
                // se o destino não é um dos 7 setores conhecidos (ex: uma
                // etapa fora dos 7, tipo "Prep Partes"), assume que é
                // avanço normal na esteira — só sabemos comparar posição
                // entre os 7 que já mapeamos.

                const ciclo = idxCiclo !== -1 && campos[idxCiclo] ? String(campos[idxCiclo]).trim() : '';
                const qtdBase = parseInt(campos[idxQtd]) || 0;
                const descricao = idxDescricao !== -1 && campos[idxDescricao] ? String(campos[idxDescricao]).trim() : '';
                const vezes = SETORES_COM_MULTIPLICADOR_CAMADAS_KPI.has(setor) ? multiplicadorDeCamadas(descricao) : 1;
                const qtd = qtdBase * vezes;
                if (vezes > 1) linhasComMultiplicador++;
                if (!todas[setor]) todas[setor] = {};
                // Chave inclui a DATA (não só o OP) — sem isso, quando a
                // mesma OP passa pelo mesmo setor 2x em dias diferentes
                // (retrabalho, correção), a segunda ocorrência processada
                // apagava a primeira silenciosamente (bug real encontrado
                // pelo usuário: OP 3612 no Corte em 04/09 E 11/09, só a
                // segunda sobrevivia).
                const diaSlice = data.toISOString().slice(0, 10);
                const chaveMovimento = chaveMovimentoKPI(opId, ciclo, diaSlice);
                const chaveAntiga = `${opId}|${diaSlice}`;   // formato antigo (sem ciclo): sai, pra não ficar duplicado
                if (chaveAntiga !== chaveMovimento && todas[setor] && todas[setor][chaveAntiga] && (!todas[setor][chaveAntiga].ciclo || todas[setor][chaveAntiga].ciclo === ciclo)) delete todas[setor][chaveAntiga];
                const movimentoLido = { op: opId, ciclo, data: data.toISOString(), qtd };
                if (descricao) movimentoLido.ds = descricao;
                let oficinaTxt = idxOficina !== -1 && campos[idxOficina] ? normalizarOficinaKPI(campos[idxOficina]) : '';
                if (DESTINOS_EXTERNOS_KPI[setor] && DESTINOS_EXTERNOS_KPI[setor].test(normalizarOficinaKPI(localDestinoBruto))) {
                    oficinaTxt = `DESTINO EXTERNO: ${normalizarOficinaKPI(localDestinoBruto)}`;   // o destino manda nesse setor (o texto da coluna N, sujo, é descartado)
                    linhasExternasPorDestino++;
                }
                if (oficinaTxt && oficinaTxt !== 'INT') { movimentoLido.of = oficinaTxt; if (oficinaEhExternaKPI(oficinaTxt, classifImport)) linhasExternas++; else oficinasNaoClassificadas.add(oficinaTxt); }
                todas[setor][chaveMovimento] = movimentoLido;
                movimentosImportados.push({ setor, m: movimentoLido });
                setoresEncontrados.add(setor);
                linhasLidas++;
            }
            if (linhasLidas === 0) throw new Error("Nenhuma linha reconhecida — confira se a coluna Ds. Localdestino tem um dos 7 setores conhecidos.");

            salvarMovimentacoesPorSetor(todas);
            input.value = '';
            let msg = `<i class="fas fa-check-double"></i> ${linhasLidas} movimentações importadas (${[...setoresEncontrados].join(', ')})!`;
            if (linhasComLocalDesconhecido > 0) msg += ` ${linhasComLocalDesconhecido} com local de origem desconhecido.`;
            if (linhasExternasPorDestino > 0) msg += ` ${linhasExternasPorDestino} do Almox Tecidos com destino externo.`;
            if (linhasExternas > 0) msg += ` ${linhasExternas} de oficina EXTERNA (ficam fora do KPI normal; veja no botão EXTERNO).`;
            if (oficinasNaoClassificadas.size) msg += ` ⚠ Oficina(s) fora da regra (CORTE / ANDERSON / MATHEUS MG / ARI), contadas como fábrica: ${[...oficinasNaoClassificadas].slice(0, 4).join(', ')}${oficinasNaoClassificadas.size > 4 ? '…' : ''} — se forem externas, marque em OFICINAS.`;
            if (idxOficina === -1) msg += ' ⚠ Não achei a coluna "Cod. Loc Prod Cost" — nada foi separado como externo nessa importação.';
            if (linhasSemDestino > 0) msg += ` ${linhasSemDestino} sem destino (não contadas como produção).`;
            if (linhasRetrocedendo > 0) msg += ` ${linhasRetrocedendo} voltando pra trás na esteira (não contadas como produção).`;
            if (linhasComMultiplicador > 0) msg += ` ${linhasComMultiplicador} com quantidade multiplicada por camada (Paletó/Blazer/Jaqueta).`;
            else if (idxDescricao === -1) msg += ' Não achei a coluna de descrição da peça — o multiplicador de camadas (Paletó/Blazer/Jaqueta) não foi aplicado nessa importação.';
            showToast(msg);
            renderizarGraficoKPI();
            publicarMovimentacoesImportadasNaNuvem(movimentosImportados);   // sem await: a importação já terminou
        } catch (err) {
            console.error('Erro ao processar movimentação de setor:', err);
            alert("❌ Não foi possível processar o relatório de movimentação.\n\nVerifique se ele tem as colunas Nr. Op, Ciclo, Dt. Movimento, Qt. Movimento e Ds. Localorigem no cabeçalho.\n\nDetalhe técnico: " + err.message);
            input.value = '';
        }
    };
    r.readAsText(input.files[0]);
}

// Importa o relatório separado de OPs que foram para um destino EXTERNO (ex: AGRUP CORTE EXTERNO).
// Regra do usuário: a OP que vai pra destino externo conta como externo no setor de ORIGEM e em TODOS os setores da esteira até o ALMOX TECIDO
// (ela pulou esses setores sem a movimentação ser lançada). Ex.: origem Análise de Medidas => Análise de Medidas + CAD + PCP Programação-Corte + Almox Tecidos.
function processarExternoAlmox() {
    if (!exigirAdmin('importar externo do Almox')) return;
    const input = $('inputExternoAlmoxKPI'); if (!input.files[0]) return;
    const r = new FileReader();
    r.onload = function (e) {
        try {
            const linhas = e.target.result.replace(/^\uFEFF/, '').split(/\r?\n/).filter(l => l.trim());
            if (linhas.length < 2) throw new Error("Arquivo vazio ou só com cabeçalho.");
            const cab = linhas[0].split(';').map(c => c.trim().toUpperCase());
            const iOP = cab.indexOf('NR. OP'), iCiclo = cab.indexOf('CICLO'), iData = cab.indexOf('DT. MOVIMENTO'), iQtd = cab.indexOf('QT. MOVIMENTO');
            const iOri = cab.indexOf('DS. LOCALORIGEM'), iDes = cab.indexOf('DS. LOCALDESTINO'), iProd = cab.findIndex(c => c === 'DS. PRODUTO');
            if ([iOP, iData, iQtd, iOri, iDes].includes(-1)) throw new Error("Não encontrei as colunas Nr. Op, Dt. Movimento, Qt. Movimento, Ds. Localorigem e Ds. Localdestino.");
            const todas = obterMovimentacoesPorSetorBruto();
            const importados = [];
            const contagem = {}; let ignoradas = 0, pecas = 0;
            const idxAlmox = SETORES_KPI.indexOf('ALMOX TECIDO');
            for (let i = 1; i < linhas.length; i++) {
                const c = linhas[i].split(';');
                const opId = (c[iOP] || '').trim(), dataStr = (c[iData] || '').trim();
                if (!opId || !dataStr) continue;
                const data = parsearDataBR(dataStr); if (!data) continue;
                const origem = MAPEAMENTO_LOCAL_DESTINO_KPI[(c[iOri] || '').trim().toUpperCase()];
                const destino = normalizarOficinaKPI((c[iDes] || '').trim());
                const idxOrigem = SETORES_KPI.indexOf(origem);
                if (!origem || idxOrigem === -1 || idxOrigem > idxAlmox || !/EXTERNO/.test(destino)) { ignoradas++; continue; }
                const qtd = parseInt(c[iQtd]) || 0;
                const mov = { op: opId, ciclo: iCiclo !== -1 ? (c[iCiclo] || '').trim() : '', data: data.toISOString(), qtd, of: `DESTINO EXTERNO: ${destino}` };
                if (iProd !== -1 && (c[iProd] || '').trim()) mov.ds = c[iProd].trim();
                const diaSlice = data.toISOString().slice(0, 10);
                const chave = chaveMovimentoKPI(opId, mov.ciclo, diaSlice);
                const chaveAntiga = `${opId}|${diaSlice}`;
                const alvos = SETORES_KPI.slice(idxOrigem, idxAlmox + 1);
                alvos.forEach(setor => {
                    if (!todas[setor]) todas[setor] = {};
                    const m = { ...mov };
                    if (chaveAntiga !== chave && todas[setor][chaveAntiga] && (!todas[setor][chaveAntiga].ciclo || todas[setor][chaveAntiga].ciclo === mov.ciclo)) delete todas[setor][chaveAntiga];
                    todas[setor][chave] = m;
                    importados.push({ setor, m });
                    contagem[setor] = (contagem[setor] || 0) + 1;
                });
                pecas += qtd;
            }
            if (!importados.length) throw new Error("Nenhuma linha com destino EXTERNO vinda de um setor até o Almox Tecidos (Análise de Medidas, CAD, PCP Programação-Corte ou Almox Tecidos).");
            salvarMovimentacoesPorSetor(todas);
            input.value = '';
            showToast(`<i class="fas fa-industry"></i> Externo importado (${pecas.toLocaleString('pt-BR')} peças): ${SETORES_KPI.filter(st => contagem[st]).map(st => `${contagem[st]} em ${st}`).join(', ')}.` + (ignoradas ? ` ${ignoradas} linha(s) ignorada(s).` : ''));
            renderizarGraficoKPI();
            publicarMovimentacoesImportadasNaNuvem(importados);
        } catch (err) {
            console.error(err);
            alert("❌ Não foi possível importar o externo.\n\n" + err.message);
            input.value = '';
        }
    };
    r.readAsText(input.files[0]);
}

// Média diária de peças que entraram num setor, numa janela de X dias pra
// trás (7=semanal, 30=mensal, por exemplo) — só conta os dias que
// realmente tiveram movimento, não divide pelo tamanho da janela inteira.
function calcularMediaDiariaSetor(setor, dias) {
    const movimentos = obterMovimentacoesPorSetor()[setor] || {};
    const limite = new Date(); limite.setDate(limite.getDate() - dias);

    const totalPorDia = {};
    Object.values(movimentos).forEach(m => {
        const data = new Date(m.data);
        if (data < limite) return;
        const chave = data.toISOString().slice(0, 10);
        totalPorDia[chave] = (totalPorDia[chave] || 0) + m.qtd;
    });

    const dataKeys = Object.keys(totalPorDia);
    if (!dataKeys.length) return { mediaDiaria: 0, diasComMovimento: 0, totalPeriodo: 0 };
    const totalPeriodo = Object.values(totalPorDia).reduce((s, v) => s + v, 0);
    return { mediaDiaria: Math.round(totalPeriodo / dataKeys.length), diasComMovimento: dataKeys.length, totalPeriodo };
}

// Lista os meses ("AAAA-MM") que têm algum movimento importado, olhando
// todos os setores juntos — usado pra popular o seletor de mês da aba KPI.
function obterMesesDisponiveisKPI() {
    const todas = obterMovimentacoesPorSetorBruto();
    const meses = new Set();
    Object.values(todas).forEach(porOP => {
        Object.values(porOP).forEach(m => {
            if (m.data) meses.add(new Date(m.data).toISOString().slice(0, 7));
        });
    });
    return [...meses].sort();
}

// Quebra um mês em semanas de calendário DE VERDADE (segunda a sexta —
// fins de semana não contam, a pedido do usuário: "nossa semana é só de 5
// dias úteis") e calcula a média diária de cada uma. A primeira/última
// semana do mês pode ter menos de 5 dias, se o mês não começar numa
// segunda ou não terminar numa sexta.
function calcularMediaPorSemanaDoMes(setor, anoMes) {
    const movimentos = obterMovimentacoesPorSetor()[setor] || {};
    const [ano, mes] = anoMes.split('-').map(Number);
    const ultimoDiaDoMes = new Date(ano, mes, 0).getDate();

    const totalPorDia = {};
    const opsPorDia = {}; // quais OPs tiveram movimento em cada dia, pra contar distintas por semana
    Object.values(movimentos).forEach(m => {
        if (!m.data) return;
        const data = new Date(m.data);
        const chaveDoMes = data.toISOString().slice(0, 7);
        if (chaveDoMes !== anoMes) return;
        // getUTCDay/getUTCDate, não getDay/getDate — o dado do visitante vem
        // da nuvem só como "AAAA-MM-DD" (sem hora), que o JS sempre
        // interpreta como meia-noite UTC; ler isso com hora LOCAL (fuso do
        // Brasil, negativo) fazia o dia "voltar" um dia inteiro — mesma
        // família do bug já corrigido no rótulo do gráfico, só que dessa
        // vez escondido aqui, causando a Semana 5 sumir inteira e todas as
        // outras semanas baterem diferente entre admin e visitante.
        const diaSemana = data.getUTCDay(); // 0=domingo, 6=sábado
        if (diaSemana === 0 || diaSemana === 6) return; // fim de semana não conta
        const dia = data.getUTCDate();
        totalPorDia[dia] = (totalPorDia[dia] || 0) + m.qtd;
        if (!opsPorDia[dia]) opsPorDia[dia] = new Set();
        opsPorDia[dia].add(idOPKPI(m));
    });

    // Agrupa os dias úteis do mês em semanas de segunda a sexta — a chave
    // de cada grupo é a data da segunda-feira daquela semana (pode cair no
    // mês anterior, se o mês não começar numa segunda; nesse caso a
    // "semana 1" só tem os dias úteis que já são desse mês).
    const gruposPorSegunda = new Map();
    for (let dia = 1; dia <= ultimoDiaDoMes; dia++) {
        const data = new Date(ano, mes - 1, dia);
        const diaSemana = data.getDay();
        if (diaSemana === 0 || diaSemana === 6) continue;
        const deslocamento = diaSemana - 1; // segunda-feira = deslocamento 0
        const segunda = new Date(ano, mes - 1, dia - deslocamento);
        const chaveSegunda = segunda.getTime();
        if (!gruposPorSegunda.has(chaveSegunda)) gruposPorSegunda.set(chaveSegunda, []);
        gruposPorSegunda.get(chaveSegunda).push(dia);
    }

    const semanasOrdenadas = [...gruposPorSegunda.entries()].sort((a, b) => a[0] - b[0]);
    const agora = new Date(); const segundaDeHoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() - ((agora.getDay() + 6) % 7)).getTime();
    return semanasOrdenadas.map(([chaveSegunda, dias], idx) => {
        let totalSemana = 0, diasComMovimento = 0;
        const opsDaSemana = new Set();
        dias.forEach(dia => {
            if (totalPorDia[dia]) { totalSemana += totalPorDia[dia]; diasComMovimento++; }
            if (opsPorDia[dia]) opsPorDia[dia].forEach(op => opsDaSemana.add(op));
        });
        return {
            rotulo: `Semana ${idx + 1} (${dias[0]}-${dias[dias.length - 1]})`,
            ehSemanaAtual: chaveSegunda === segundaDeHoje,
            totalSemana,
            totalOPs: opsDaSemana.size,
            diasComMovimento,
            mediaDiaria: diasComMovimento ? Math.round(totalSemana / diasComMovimento) : 0,
            mediaOPsDia: diasComMovimento ? Math.round((opsDaSemana.size / diasComMovimento) * 10) / 10 : 0,   // OPs distintas da semana ÷ dias com movimento
        };
    });
}

// Lead time médio até um setor: pra cada OP que já entrou nesse setor,
// calcula quantos dias se passaram desde a Inclusão dela (criação, vinda
// da Sincronização) até a data que ela chegou lá — depois tira a média de
// todas as OPs que têm os dois dados disponíveis.
function calcularLeadTimeSetor(setor) {
    const movimentos = obterMovimentacoesPorSetor()[setor] || {};
    // Uma OP pode ter mais de um movimento no mesmo setor (revisita,
    // retrabalho) — pra lead time, importa só a PRIMEIRA vez que ela
    // chegou lá, não cada revisita (diferente do total de peças/OPs do
    // gráfico, onde toda revisita conta como trabalho de verdade).
    const primeiraChegadaPorOP = {};
    Object.values(movimentos).forEach(m => {
        if (!m.data) return;
        if (!primeiraChegadaPorOP[idOPKPI(m)] || m.data < primeiraChegadaPorOP[idOPKPI(m)]) primeiraChegadaPorOP[idOPKPI(m)] = m.data;
    });
    const leadTimes = [];
    Object.entries(primeiraChegadaPorOP).forEach(([opId, dataChegada]) => {
        const op = bancoDadosOPs.find(o => chaveDaOP(o) === opId) || bancoDadosOPs.find(o => o.id === opId);
        if (!op || !op.dataInclusao) return;
        const dataEntradaSetor = new Date(dataChegada);
        const dataInclusao = new Date(op.dataInclusao);
        const dias = Math.round((dataEntradaSetor - dataInclusao) / 86400000);
        if (dias >= 0) leadTimes.push(dias); // datas invertidas = dado inconsistente, ignora
    });
    if (!leadTimes.length) return { mediaLeadTime: null, opsComDado: 0 };
    const media = leadTimes.reduce((s, v) => s + v, 0) / leadTimes.length;
    return { mediaLeadTime: Math.round(media * 10) / 10, opsComDado: leadTimes.length };
}

// Pares de setores adjacentes na esteira (só entre vizinhos — o usuário
// confirmou que não precisa comparar setores quaisquer).
const PARES_ADJACENTES_KPI = SETORES_KPI.slice(0, -1).map((s, i) => [s, SETORES_KPI[i + 1]]);

// "Acertividade": pra cada dia que teve OPs saindo do setor de ORIGEM,
// quantas dessas MESMAS OPs também aparecem no setor de DESTINO no
// PRÓXIMO DIA ÚTIL (janela reduzida de 2 dias pra 1 depois de o usuário
// achar o resultado de 2 dias "estranho" — mas sexta+1 caindo no sábado
// nunca bateria, então sexta/sábado pulam pra segunda de verdade).
function calcularAcertividadeSetores(setorOrigem, setorDestino, anoMes) {
    const movsOrigem = obterMovimentacoesPorSetor()[setorOrigem] || {};
    const movsDestino = obterMovimentacoesPorSetor()[setorDestino] || {};

    // Agrupa as OPs de origem por dia (só do mês escolhido)
    const opsPorDiaOrigem = {};
    Object.values(movsOrigem).forEach(m => {
        if (!m.data) return;
        const dia = new Date(m.data).toISOString().slice(0, 10);
        if (!dia.startsWith(anoMes)) return;
        if (!opsPorDiaOrigem[dia]) opsPorDiaOrigem[dia] = new Set();
        opsPorDiaOrigem[dia].add(idOPKPI(m));
    });

    // Pra cada OP, todas as datas em que ela aparece no destino (uma OP
    // pode, em tese, ter passado por reprocessamento e aparecer mais de
    // uma vez — e agora isso é guardado de verdade, não só "em tese")
    const datasDestinoPorOP = {};
    Object.values(movsDestino).forEach(m => {
        if (!m.data) return;
        const dia = new Date(m.data).toISOString().slice(0, 10);
        if (!datasDestinoPorOP[idOPKPI(m)]) datasDestinoPorOP[idOPKPI(m)] = new Set();
        datasDestinoPorOP[idOPKPI(m)].add(dia);
    });

    const resultado = [];
    Object.keys(opsPorDiaOrigem).sort().forEach(diaOrigem => {
        const opsDoDia = [...opsPorDiaOrigem[diaOrigem]];
        const deslocamento = deslocamentoProximoDiaUtil(diaOrigem);
        let acertos = 0;
        opsDoDia.forEach(opId => {
            const datasNoDestino = datasDestinoPorOP[opId];
            if (!datasNoDestino) return;
            if (datasNoDestino.has(somarDiasChaveData(diaOrigem, deslocamento))) acertos++;
        });
        resultado.push({
            dia: diaOrigem,
            totalOrigem: opsDoDia.length,
            acertos,
            percentual: opsDoDia.length ? Math.round((acertos / opsDoDia.length) * 100) : 0,
        });
    });
    return resultado;
}

// Cor fixa por setor, sempre a mesma em qualquer gráfico — ajuda a
// reconhecer de relance qual linha é qual quando comparando os 7 juntos.
const CORES_SETORES_KPI = {
    'PPCP PROGRAMACAO': '#5E8C8A', 'ANALISE DE MEDIDAS': '#B8862A', 'CAD': '#3D6B87', 'PCP PROGRAMACAO-CORTE': '#7A4B8C',
    'ALMOX TECIDO': '#4C8C4A', 'ENFESTO': '#C0504D', 'CORTE': '#4472C4', 'ETIQUETACAO': '#ED7D31',
};

function hexParaRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Escurece todas as linhas menos a destacada (ou restaura todas se indice
// for null) — usado tanto ao passar o mouse numa linha do gráfico quanto
// ao passar o mouse num item da legenda. Não faz nada com 1 linha só (não
// tem o que destacar).
function destacarLinhaGrafico(chart, indice, coresOriginais) {
    if (coresOriginais.length <= 1) return;
    chart.data.datasets.forEach((ds, i) => {
        const destacada = indice === null || i === indice;
        ds.borderColor = destacada ? coresOriginais[i] : hexParaRgba(coresOriginais[i], 0.12);
        ds.borderWidth = destacada ? 2 : 1;
    });
    chart.update('none'); // 'none' evita reanimar o gráfico inteiro a cada movimento do mouse
}

let graficoKPIInstance = null;
let graficosKPISeparadosInstances = [];
function alternarModoGraficoKPI() {
    let atual = 'juntos'; try { atual = localStorage.getItem('kpiGraficoModo') === 'separados' ? 'separados' : 'juntos'; } catch (e) { /* padrão */ }
    try { localStorage.setItem('kpiGraficoModo', atual === 'separados' ? 'juntos' : 'separados'); } catch (e) { /* ignora */ }
    renderizarGraficoKPI();
}

// Formata uma chave "AAAA-MM-DD" (a que usamos pra agrupar por dia no
// gráfico) direto por texto, sem nunca passar por um objeto Date — evita
// um bug real de fuso horário: "2026-09-01" vira meia-noite UTC quando
// convertido pra Date, e formatarDataBR() usa o fuso LOCAL do navegador
// pra mostrar, o que "puxa" a data um dia pra trás em fusos negativos
// (Brasil, UTC-3) — descoberto porque o navegador do usuário mostrava
// 31/08 quando o dado real era 01/09.
function formatarChaveDataBR(chave) {
    if (!chave) return '';
    const [ano, mes, dia] = chave.split('-');
    return `${dia}/${mes}/${ano}`;
}

// Soma dias numa chave "AAAA-MM-DD", devolvendo outra chave no mesmo
// formato — usa Date.UTC/getUTCDate de propósito, pra nunca sofrer aquele
// mesmo bug de fuso horário que já corrigimos no rótulo do gráfico (uma
// chave de data pura não deveria nunca passar por hora LOCAL).
function somarDiasChaveData(chave, dias) {
    const [ano, mes, dia] = chave.split('-').map(Number);
    const data = new Date(Date.UTC(ano, mes - 1, dia));
    data.setUTCDate(data.getUTCDate() + dias);
    return data.toISOString().slice(0, 10);
}

// Quantos dias pra frente é o PRÓXIMO DIA ÚTIL de uma chave "AAAA-MM-DD"
// (pula sábado/domingo). Sexta+1 caindo no sábado sempre daria "errado" na
// acertividade do KPI, mesmo com a OP se movendo direitinho — corrigido
// pra sexta pular pra segunda (+3) e sábado pular pra segunda (+2), só
// domingo a quinta continuam +1 normal.
function deslocamentoProximoDiaUtil(chave) {
    const diaSemana = new Date(chave + 'T00:00:00Z').getUTCDay(); // 0=domingo ... 6=sábado
    if (diaSemana === 5) return 3; // sexta -> segunda
    if (diaSemana === 6) return 2; // sábado -> segunda
    return 1;
}

function formatarMesLegivelKPI(anoMes) {
    if (!anoMes) return '';
    const [ano, mes] = anoMes.split('-');
    const nomesMeses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    return `${nomesMeses[parseInt(mes) - 1]}/${ano}`;
}

// Preenche o seletor de mês com os meses que realmente têm dado importado
// — mantém a seleção atual se ainda existir, senão pega o mês mais
// recente (então, na primeira vez, já abre direto no mês do que acabou de
// ser importado).
function popularSeletorMesKPI() {
    const sel = $('seletorMesKPI');
    if (!sel) return;
    const meses = obterMesesDisponiveisKPI();
    const valorAnterior = sel.value;
    sel.innerHTML = meses.map(m => `<option value="${m}">${formatarMesLegivelKPI(m)}</option>`).join('');
    if (meses.includes(valorAnterior)) sel.value = valorAnterior;
    else if (meses.length) sel.value = meses[meses.length - 1];
}

// Mesmo dado do gráfico principal (peças por setor, dia a dia), só que em
// tabela — pra quem quer ver o número exato de cada dia sem precisar
// passar o mouse ponto a ponto no gráfico, ou copiar pra outro lugar.
function renderizarTabelaKPI(setoresParaMostrar, datasOrdenadas, totalPorSetorPorDia, opsPorSetorPorDia) {
    const cabecalho = $('tabelaKPICabecalho');
    const corpo = $('tabelaKPICorpo');
    if (!cabecalho || !corpo) return;

    if (!datasOrdenadas.length) {
        cabecalho.innerHTML = '<th>DATA</th>';
        corpo.innerHTML = `<tr><td class="tabela-vazia">Sem dados pra esse setor/mês.</td></tr>`;
        return;
    }

    cabecalho.innerHTML = '<th>DATA</th>' + setoresParaMostrar.map(s => `<th style="text-align:right;">${s}</th>`).join('');
    corpo.innerHTML = datasOrdenadas.map(dia => {
        const celulas = setoresParaMostrar.map(setor => {
            const peças = totalPorSetorPorDia[setor][dia] || 0;
            const opsDoDia = opsPorSetorPorDia[setor][dia];
            const qtdOPs = opsDoDia ? opsDoDia.size : 0;
            return peças
                ? `<td style="text-align:right;">${peças.toLocaleString('pt-BR')} <span style="color:var(--texto-secundario); font-size:11px;">(${qtdOPs} OP${qtdOPs === 1 ? '' : 's'})</span></td>`
                : `<td style="text-align:right; color:var(--texto-secundario);">—</td>`;
        }).join('');
        return `<tr><td><strong>${formatarChaveDataBR(dia)}</strong></td>${celulas}</tr>`;
    }).join('');
}

function renderizarGraficoKPI() {
    const canvas = $('graficoKPI');
    if (!canvas) return;
    popularSeletorMesKPI();
    atualizarBotaoVisaoExternoKPI();
    const setorSelecionado = $('seletorSetorKPI') ? $('seletorSetorKPI').value : 'TODOS';
    const mesSelecionado = $('seletorMesKPI') ? $('seletorMesKPI').value : null;
    const setoresParaMostrar = setorSelecionado === 'TODOS' ? SETORES_KPI : [setorSelecionado];
    const todasMovimentacoes = obterMovimentacoesPorSetor();

    // Monta total por dia, por setor — só do mês selecionado — e a união
    // de todas as datas que aparecem em qualquer um dos setores mostrados,
    // pro eixo X do gráfico. Também rastreia quais OPs distintas tiveram
    // movimento em cada dia, pra mostrar a contagem na dica do gráfico
    // (sem precisar de uma segunda linha/eixo, já que a escala de OPs é
    // bem menor que a de peças).
    const totalPorSetorPorDia = {};
    const opsPorSetorPorDia = {};
    const todasDatas = new Set();
    setoresParaMostrar.forEach(setor => {
        const movs = todasMovimentacoes[setor] || {};
        totalPorSetorPorDia[setor] = {};
        opsPorSetorPorDia[setor] = {};
        Object.values(movs).forEach(m => {
            if (!m.data) return;
            const dia = new Date(m.data).toISOString().slice(0, 10);
            if (mesSelecionado && !dia.startsWith(mesSelecionado)) return;
            totalPorSetorPorDia[setor][dia] = (totalPorSetorPorDia[setor][dia] || 0) + m.qtd;
            if (!opsPorSetorPorDia[setor][dia]) opsPorSetorPorDia[setor][dia] = new Set();
            opsPorSetorPorDia[setor][dia].add(idOPKPI(m));
            todasDatas.add(dia);
        });
    });
    const datasOrdenadas = [...todasDatas].sort();

    const coresOriginaisGraficoKPI = setoresParaMostrar.map(setor => CORES_SETORES_KPI[setor] || '#999');
    const datasets = setoresParaMostrar.map((setor, i) => ({
        label: setor,
        data: datasOrdenadas.map(d => totalPorSetorPorDia[setor][d] || 0),
        borderColor: coresOriginaisGraficoKPI[i],
        backgroundColor: coresOriginaisGraficoKPI[i],
        tension: 0.25,
        fill: false,
    }));

    if (graficoKPIInstance) { graficoKPIInstance.destroy(); graficoKPIInstance = null; }
    graficosKPISeparadosInstances.forEach(g => g.destroy()); graficosKPISeparadosInstances = [];

    // Modo do gráfico: 'juntos' (uma linha por setor no mesmo gráfico) ou 'separados' (um gráfico por setor).
    // Só muda o gráfico — os cards de resumo e a tabela continuam iguais.
    let modoGrafico = 'juntos'; try { modoGrafico = localStorage.getItem('kpiGraficoModo') === 'separados' ? 'separados' : 'juntos'; } catch (e) { /* padrão */ }
    const separar = modoGrafico === 'separados' && setoresParaMostrar.length > 1;
    if ($('txtModoGraficoKPI')) $('txtModoGraficoKPI').textContent = modoGrafico === 'separados' ? 'GRÁFICO JUNTO' : 'GRÁFICOS SEPARADOS';
    const wrapJunto = $('graficoKPIJuntoWrap'), wrapSep = $('graficosKPISeparados');
    if (wrapJunto) wrapJunto.style.display = separar ? 'none' : '';
    if (wrapSep) wrapSep.style.display = separar ? 'grid' : 'none';
    if (separar && wrapSep) {
        wrapSep.innerHTML = datasOrdenadas.length ? setoresParaMostrar.map((setor, i) => `
            <div style="border:1px solid var(--borda-cor); border-top:4px solid ${coresOriginaisGraficoKPI[i]}; border-radius:8px; background:var(--bg-card); padding:8px 10px;">
                <div style="font-size:12px; font-weight:700; margin-bottom:4px;">${setor}</div>
                <div style="position:relative; height:200px;"><canvas id="graficoKPISep${i}"></canvas></div>
            </div>`).join('') : '<div class="tabela-vazia" style="grid-column:1/-1;">Sem dados pra esse setor/mês.</div>';
        if (datasOrdenadas.length) setoresParaMostrar.forEach((setor, i) => {
            graficosKPISeparadosInstances.push(new Chart($('graficoKPISep' + i), {
                type: 'line',
                data: { labels: datasOrdenadas.map(formatarChaveDataBR), datasets: [{ label: setor, data: datasets[i].data, borderColor: coresOriginaisGraficoKPI[i], backgroundColor: coresOriginaisGraficoKPI[i], tension: 0.25, fill: false }] },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false }, datalabels: { display: false },
                        tooltip: { callbacks: { label: c => {
                            const opsDoDia = opsPorSetorPorDia[setor] && opsPorSetorPorDia[setor][datasOrdenadas[c.dataIndex]];
                            const q = opsDoDia ? opsDoDia.size : 0;
                            return `${(c.parsed.y || 0).toLocaleString('pt-BR')} peças (${q} OP${q === 1 ? '' : 's'})`;
                        } } },
                    },
                    scales: { y: { beginAtZero: true, title: { display: true, text: 'Peças' } } },
                },
            }));
        });
    }
    if (!separar && datasOrdenadas.length) {
        graficoKPIInstance = new Chart(canvas, {
            type: 'line',
            data: { labels: datasOrdenadas.map(formatarChaveDataBR), datasets },
            options: {
                responsive: true, maintainAspectRatio: false,
                onHover: (event, activeElements, chart) => {
                    destacarLinhaGrafico(chart, activeElements.length ? activeElements[0].datasetIndex : null, coresOriginaisGraficoKPI);
                },
                plugins: {
                    legend: {
                        display: setoresParaMostrar.length > 1,
                        onHover: (event, legendItem, legend) => destacarLinhaGrafico(legend.chart, legendItem.datasetIndex, coresOriginaisGraficoKPI),
                        onLeave: (event, legendItem, legend) => destacarLinhaGrafico(legend.chart, null, coresOriginaisGraficoKPI),
                    },
                    // ChartDataLabels é registrado globalmente pro gráfico de
                    // OTD, mas isso faz ele aparecer em TODO gráfico por
                    // padrão — desligado aqui, senão poluía a tela com um
                    // número em cima de cada ponto, ilegível com 7 linhas.
                    datalabels: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function (context) {
                                const setor = context.dataset.label;
                                const dia = datasOrdenadas[context.dataIndex];
                                const opsDoDia = opsPorSetorPorDia[setor] && opsPorSetorPorDia[setor][dia];
                                const qtdOPs = opsDoDia ? opsDoDia.size : 0;
                                const peças = (context.parsed.y || 0).toLocaleString('pt-BR');
                                return `${setor}: ${peças} peças (${qtdOPs} OP${qtdOPs === 1 ? '' : 's'})`;
                            }
                        }
                    }
                },
                scales: { y: { beginAtZero: true, title: { display: true, text: 'Peças' } } }
            }
        });
    } // se não tiver dado nenhum pro mês/setor escolhido, só deixa o canvas vazio

    renderizarStatsKPI(setoresParaMostrar, mesSelecionado);
    renderizarTabelaKPI(setoresParaMostrar, datasOrdenadas, totalPorSetorPorDia, opsPorSetorPorDia);
    renderizarGraficoAcertividadeKPI();
}

let graficoAcertividadeKPIInstance = null;

// Gráfico próprio de "acertividade" entre dois setores adjacentes — mostra
// dia a dia, dentro do mês escolhido no seletor principal, quantas OPs que
// saíram do setor de origem apareceram no setor seguinte da esteira, no
// PRÓXIMO DIA ÚTIL (sexta/sábado pulam pra segunda, ver deslocamentoProximoDiaUtil).
function renderizarGraficoAcertividadeKPI() {
    const canvas = $('graficoAcertividadeKPI');
    if (!canvas) return;
    const valorSelecionado = $('seletorParAcertividadeKPI') ? $('seletorParAcertividadeKPI').value : '0';
    const mesSelecionado = $('seletorMesKPI') ? $('seletorMesKPI').value : null;

    if (graficoAcertividadeKPIInstance) { graficoAcertividadeKPIInstance.destroy(); graficoAcertividadeKPIInstance = null; }
    if (!mesSelecionado) return;

    // Só um par por vez agora — porcentagem permitia comparar vários pares
    // na mesma escala (0-100%), mas isso escondia o problema real (1 OP
    // batendo já vira 100%, igual 28 de 30 batendo — informações bem
    // diferentes de confiabilidade, aparentando ser a mesma coisa no
    // gráfico). Quantidade não tem essa mesma escala comum entre pares
    // diferentes, então "Todos os pares" foi removido — usuário confirmou
    // preferir só o modo de um par.
    const par = PARES_ADJACENTES_KPI[parseInt(valorSelecionado)];
    const dados = calcularAcertividadeSetores(par[0], par[1], mesSelecionado);
    if (!dados.length) return; // par não teve OP saindo da origem nesse mês

    const datasOrdenadas = dados.map(d => d.dia);
    const cores = ['#4C8C4A', '#C0504D']; // verde = total, vermelho = quantos bateram
    const datasets = [
        {
            label: 'Total que saiu da origem',
            data: dados.map(d => d.totalOrigem),
            borderColor: cores[0], backgroundColor: cores[0], tension: 0.25, fill: false,
        },
        {
            label: 'Bateram no destino no próximo dia útil',
            data: dados.map(d => d.acertos),
            borderColor: cores[1], backgroundColor: cores[1], tension: 0.25, fill: false,
        },
    ];

    graficoAcertividadeKPIInstance = new Chart(canvas, {
        type: 'line',
        data: { labels: datasOrdenadas.map(formatarChaveDataBR), datasets },
        options: {
            responsive: true, maintainAspectRatio: false,
            onHover: (event, activeElements, chart) => {
                destacarLinhaGrafico(chart, activeElements.length ? activeElements[0].datasetIndex : null, cores);
            },
            plugins: {
                legend: {
                    display: true,
                    onHover: (event, legendItem, legend) => destacarLinhaGrafico(legend.chart, legendItem.datasetIndex, cores),
                    onLeave: (event, legendItem, legend) => destacarLinhaGrafico(legend.chart, null, cores),
                },
                datalabels: { display: false },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            const d = dados[context.dataIndex];
                            if (context.datasetIndex === 0) return `Total que saiu de ${par[0]}: ${d.totalOrigem} OP(s)`;
                            return `Bateram em ${par[1]} no próximo dia útil: ${d.acertos} de ${d.totalOrigem} OP(s)`;
                        }
                    }
                }
            },
            scales: { y: { beginAtZero: true, title: { display: true, text: 'OPs' } } }
        }
    });
}


