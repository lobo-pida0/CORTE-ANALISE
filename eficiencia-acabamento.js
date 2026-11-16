// =========================================================================
// ✂️ EFICIÊNCIA DO ACABAMENTO (KPI) — mesma ideia da eficiência da costura, mas com UM local só: PNP ACABAMENTO
// (fora ficam "PNP ACABAMENTO TERCEIROS" e o "SLV ACABAMENTO" de Selvíria). Lê o mesmo relatório de movimentação (CSV com
// "Ds Local", "Qt. Movimento", "Cod. Tempolocal"); minutos produzidos = peças × tempo por peça; eficiência = minutos ÷ (pessoas × minutos por pessoa).
// Pessoas é digitado por DIA. Guardado no navegador (localStorage 'eficienciaAcabamento') E na nuvem (tabela destino_producao,
// linha 'eficiencia_acabamento' — sem SQL novo): { 'AAAA-MM-DD': { pecas, minutos, ops, opsMov: { 'ciclo-OP': { q } }, semTempo, pessoas } }.
// Dia limpo na nuvem vira { apagado:true } (quem abre a aba tira o dia daqui). A importação do relatório da COSTURA também alimenta o acabamento.
// =========================================================================
const LOCAL_ACABAMENTO_EF = 'PNP ACABAMENTO';
function ehLocalAcabamentoEficiencia(local) { return normalizarCabecalhoEf(local) === LOCAL_ACABAMENTO_EF; }
function obterEfAcab() { try { return JSON.parse(localStorage.getItem('eficienciaAcabamento') || '{}'); } catch (e) { return {}; } }
function salvarEfAcab(obj) {
    try { localStorage.setItem('eficienciaAcabamento', JSON.stringify(obj)); } catch (e) { showToast('<i class="fas fa-triangle-exclamation"></i> Não consegui salvar a eficiência do acabamento (armazenamento cheio).', true, 6000); }
}
function obterEfAcabPend() { try { return JSON.parse(localStorage.getItem('eficienciaAcabamentoPend') || '[]'); } catch (e) { return []; } }
function salvarEfAcabPend(arr) { try { localStorage.setItem('eficienciaAcabamentoPend', JSON.stringify([...new Set(arr)])); } catch (e) { /* ignora */ } }
function obterEfAcabApagPend() { try { return JSON.parse(localStorage.getItem('eficienciaAcabamentoApagPend') || '[]'); } catch (e) { return []; } }
function salvarEfAcabApagPend(arr) { try { localStorage.setItem('eficienciaAcabamentoApagPend', JSON.stringify([...new Set(arr)])); } catch (e) { /* ignora */ } }

let efAcabSincronizando = false, efAcabAvisouFalha = false;
function avisarFalhaNuvemEfAcab(e) {
    registrarLogDebug('error', ['[NUVEM] Eficiência do acabamento: ' + (e && e.message ? e.message : e)]);
    if (efAcabAvisouFalha) return;
    efAcabAvisouFalha = true;
    showToast('<i class="fas fa-triangle-exclamation"></i> Não consegui salvar a eficiência do acabamento na nuvem — ficou só neste navegador e será reenviada depois.', true, 8000);
}
// Lê a linha da nuvem, troca SÓ os dias pedidos (e marca os apagados) e grava de volta — duas pessoas mexendo em dias diferentes não se sobrescrevem.
async function sincronizarDiasEfAcab(dias, apagar) {
    dias = dias || []; apagar = apagar || [];
    if (!dias.length && !apagar.length) return true;
    if (!supabaseClient || !sessaoAdminAtual) { salvarEfAcabPend([...obterEfAcabPend(), ...dias]); salvarEfAcabApagPend([...obterEfAcabApagPend(), ...apagar]); return false; }
    try {
        const { data: linha, error: e1 } = await supabaseClient.from('destino_producao').select('dados').eq('id', 'eficiencia_acabamento').maybeSingle();
        if (e1) throw e1;
        const dados = { dias: {}, ...((linha && linha.dados) || {}) };
        dados.dias = { ...(dados.dias || {}) };
        const todos = obterEfAcab();
        dias.forEach(d => { if (todos[d]) dados.dias[d] = todos[d]; });
        apagar.forEach(d => { dados.dias[d] = { apagado: true }; });
        const por = String((sessaoAdminAtual.user && sessaoAdminAtual.user.email) || '').split('@')[0].toUpperCase();
        const { error } = await supabaseClient.from('destino_producao').upsert({ id: 'eficiencia_acabamento', dados, atualizado_em: new Date().toISOString(), atualizado_por: por }, { onConflict: 'id' });
        if (error) throw error;
        salvarEfAcabPend(obterEfAcabPend().filter(d => !dias.includes(d)));
        salvarEfAcabApagPend(obterEfAcabApagPend().filter(d => !apagar.includes(d)));
        return true;
    } catch (e) {
        salvarEfAcabPend([...obterEfAcabPend(), ...dias]); salvarEfAcabApagPend([...obterEfAcabApagPend(), ...apagar]);
        avisarFalhaNuvemEfAcab(e);
        return false;
    }
}
async function carregarEfAcabDaNuvem() {
    if (!supabaseClient || !sessaoAdminAtual || efAcabSincronizando) return;
    efAcabSincronizando = true;
    try {
        const pend = obterEfAcabPend().filter(d => obterEfAcab()[d]), apag = obterEfAcabApagPend();
        if (pend.length || apag.length) await sincronizarDiasEfAcab(pend, apag);
        const { data: linha, error } = await supabaseClient.from('destino_producao').select('dados').eq('id', 'eficiencia_acabamento').maybeSingle();
        if (error) { avisarFalhaNuvemEfAcab(error); return; }
        const nuvem = (linha && linha.dados && linha.dados.dias) || {};
        const todos = obterEfAcab();
        const pendentes = new Set(obterEfAcabPend()), apagPend = new Set(obterEfAcabApagPend());
        let mudou = false;
        Object.entries(nuvem).forEach(([dia, v]) => {
            if (v && v.apagado) { if (!pendentes.has(dia) && todos[dia]) { delete todos[dia]; mudou = true; } return; }   // mês limpo por alguém: some daqui também
            if (pendentes.has(dia) || apagPend.has(dia) || !v || v.pecas === undefined) return;   // o que está esperando para subir (ou ser apagado) vale mais que a nuvem
            if (JSON.stringify(todos[dia] || null) !== JSON.stringify(v)) { todos[dia] = v; mudou = true; }
        });
        if (mudou) salvarEfAcab(todos);
        popularSeletorMesEfAcab();
        renderizarEficienciaAcabamento();
    } catch (e) {
        avisarFalhaNuvemEfAcab(e);
    } finally {
        efAcabSincronizando = false;
    }
}

// Lê o CSV de movimentação (linhas já separadas) e devolve os números do PNP ACABAMENTO por dia. Movimentação de PARTE não conta.
function extrairAcabamentoDasLinhas(linhas) {
    const cab = linhas[0].split(';').map(normalizarCabecalhoEf);
    const idx = n => cab.findIndex(c => c === n);
    const iLocal = idx('DS LOCAL'), iOP = cab.findIndex(c => c === 'OP' || c === 'NR OP'), iCiclo = idx('CICLO'), iData = idx('DT MOVIMENTO'), iQtd = idx('QT MOVIMENTO'), iTempo = idx('COD TEMPOLOCAL');
    const iTipoMov = cab.findIndex(c => c === 'TIPO MOV' || c === 'TIPO MOVIMENTACAO' || c === 'TIPO MOVIMENTO');
    const faltando = [];
    if (iLocal === -1) faltando.push('Ds Local'); if (iOP === -1) faltando.push('Op'); if (iData === -1) faltando.push('Dt. Movimento'); if (iQtd === -1) faltando.push('Qt. Movimento'); if (iTempo === -1) faltando.push('Cod. Tempolocal');
    if (faltando.length) throw new Error('Não encontrei as colunas: ' + faltando.join(', ') + '. Esse é o relatório de movimentação com "Cod. Tempolocal"?');
    const dias = {}; let n = 0, semTempo = 0, partes = 0;
    for (let i = 1; i < linhas.length; i++) {
        const c = linhas[i].split(';');
        if (!ehLocalAcabamentoEficiencia((c[iLocal] || '').trim())) continue;
        if (iTipoMov !== -1 && normalizarCabecalhoEf(c[iTipoMov] || '') === 'PARTE') { partes++; continue; }
        const op = (c[iOP] || '').trim(), dataStr = (c[iData] || '').trim();
        const d = parsearDataBR(dataStr); if (!op || !d) continue;
        const dia = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const qtd = numeroBR(c[iQtd]) || 0, tempo = numeroBR(c[iTempo]);
        const reg = dias[dia] = dias[dia] || { pecas: 0, minutos: 0, ops: {}, semTempo: 0 };
        reg.pecas += qtd; { const kOP = montarChaveOP(iCiclo !== -1 ? (c[iCiclo] || '').trim() : '', op); reg.ops[kOP] = (reg.ops[kOP] || 0) + qtd; } n++;   // peças que cada OP movimentou (usado pelo PLANO DO ACABAMENTO)
        if (tempo === null) { reg.semTempo += qtd; semTempo++; } else reg.minutos += qtd * tempo;
    }
    return { dias, n, semTempo, partes };
}
// Grava os dias extraídos (substitui os números do dia, mantém as pessoas já digitadas) e manda pra nuvem.
function gravarImportacaoAcabamento(res) {
    const todos = obterEfAcab();
    Object.entries(res.dias).forEach(([dia, v]) => {
        todos[dia] = { pecas: Math.round(v.pecas), minutos: Math.round(v.minutos * 100) / 100, ops: Object.keys(v.ops).length, opsMov: Object.fromEntries(Object.entries(v.ops).map(([k, q]) => [k, { q: Math.round(q) }])), semTempo: Math.round(v.semTempo), pessoas: todos[dia] ? (todos[dia].pessoas || 0) : 0 };
    });
    salvarEfAcab(todos);
    const dias = Object.keys(res.dias).sort();
    sincronizarDiasEfAcab(dias, []).then(ok => { if (ok) showToast('<i class="fas fa-cloud-upload-alt"></i> Eficiência do acabamento salva na nuvem.', false, 2500); });
    popularSeletorMesEfAcab(dias[dias.length - 1].slice(0, 7));
    renderizarEficienciaAcabamento();
    return dias;
}
// Importação pelo relatório da COSTURA: leva o acabamento junto (sem erro se o arquivo não tem linha de acabamento).
function importarAcabamentoDasLinhas(linhas) {
    const res = extrairAcabamentoDasLinhas(linhas);
    if (!res.n) return res;
    gravarImportacaoAcabamento(res);
    return res;
}
function processarEficienciaAcabamento() {
    if (!exigirAdminOuUsuario('importar a movimentação do acabamento')) return;
    const input = $('inputEfAcab'); if (!input || !input.files[0]) return;
    const r = new FileReader();
    r.onload = async function (e) {
        try {
            await carregarEfAcabDaNuvem();   // traz as pessoas que os outros já digitaram antes de mesclar
            const buf = new Uint8Array(e.target.result);
            let texto;
            try { texto = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (err) { texto = new TextDecoder('windows-1252').decode(buf); }
            const linhas = texto.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
            if (linhas.length < 2) throw new Error('Arquivo vazio ou só com cabeçalho.');
            const res = extrairAcabamentoDasLinhas(linhas);
            if (!res.n) throw new Error('Não achei nenhuma linha do local PNP ACABAMENTO nesse arquivo.');
            const dias = gravarImportacaoAcabamento(res);
            input.value = '';
            showToast(`<i class="fas fa-check-double"></i> ${res.n} linha(s) de acabamento em ${dias.length} dia(s) importadas.${res.partes ? ` ${res.partes} de PARTE ignorada(s).` : ''}${res.semTempo ? ` ⚠ ${res.semTempo} sem tempo (contam peças, não minutos).` : ''}`, false, res.semTempo ? 7000 : 3000);
        } catch (err) {
            input.value = '';
            alert('❌ Não foi possível importar a movimentação do acabamento.\n\n' + err.message);
        }
    };
    r.readAsArrayBuffer(input.files[0]);
}

function popularSeletorMesEfAcab(preferido) {
    const sel = $('seletorMesEfAcab'); if (!sel) return;
    const meses = [...new Set(Object.keys(obterEfAcab()).map(d => d.slice(0, 7)))].sort();
    const anterior = sel.value;
    sel.innerHTML = meses.map(m => `<option value="${m}">${formatarMesLegivelKPI ? formatarMesLegivelKPI(m) : m}</option>`).join('');
    if (preferido && meses.includes(preferido)) sel.value = preferido;
    else if (meses.includes(anterior)) sel.value = anterior;
    else if (meses.length) sel.value = meses[meses.length - 1];
}
function definirPessoasEfAcab(dia, valor) {
    if (!exigirAdminOuUsuario('informar as pessoas do dia')) { renderizarEficienciaAcabamento(); return; }
    const todos = obterEfAcab(); if (!todos[dia]) return;
    const n = parseFloat(String(valor).replace(',', '.'));
    todos[dia].pessoas = (isNaN(n) || n <= 0) ? 0 : n;
    salvarEfAcab(todos);
    renderizarEficienciaAcabamento();
    sincronizarDiasEfAcab([dia], []);
}

let graficoEfAcabInstance = null;
function limparGraficoEficienciaAcabamento() {
    if (graficoEfAcabInstance) { graficoEfAcabInstance.destroy(); graficoEfAcabInstance = null; }
    if ($('graficoEfAcabWrap')) $('graficoEfAcabWrap').style.display = 'none';
    if ($('graficoEfAcabAviso')) $('graficoEfAcabAviso').style.display = 'none';
}
function desenharGraficoEficienciaAcabamento(linhas) {
    const canvas = $('graficoEfAcab'); if (!canvas) return;
    if (graficoEfAcabInstance) { graficoEfAcabInstance.destroy(); graficoEfAcabInstance = null; }
    const temDado = linhas.some(l => l.efic !== null);
    if ($('graficoEfAcabAviso')) $('graficoEfAcabAviso').style.display = temDado ? 'none' : '';
    if ($('graficoEfAcabWrap')) $('graficoEfAcabWrap').style.display = temDado ? '' : 'none';
    if (!temDado) return;
    const escuro = document.body.classList.contains('dark-mode'), corTexto = escuro ? '#D8D2C5' : '#555';
    const valores = linhas.map(l => l.efic === null ? null : Math.round(l.efic * 10) / 10);
    graficoEfAcabInstance = new Chart(canvas, {
        type: 'line', plugins: [faixasEficienciaPlugin],
        data: { labels: linhas.map(l => formatarChaveDataBR(l.dia).slice(0, 5)), datasets: [
            { label: 'Acabamento', data: valores, borderColor: '#35505C', backgroundColor: valores.map(COR_STATUS_EF), pointBackgroundColor: valores.map(COR_STATUS_EF), pointBorderColor: valores.map(COR_STATUS_EF), tension: 0, fill: false, spanGaps: true, borderWidth: 3, pointRadius: 5, pointHoverRadius: 7 },
            { label: 'Meta 100%', data: linhas.map(() => 100), borderColor: '#4C9A6A', borderDash: [8, 5], borderWidth: 2, pointRadius: 0, fill: false },
        ] },
        options: {
            responsive: true, maintainAspectRatio: false, color: corTexto,
            plugins: { legend: { display: false }, datalabels: { display: false }, tooltip: { callbacks: { label: c => {
                if (c.dataset.label === 'Meta 100%') return null;
                const l = linhas[c.dataIndex];
                return `Acabamento: ${(c.parsed.y ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%  (${Math.round(l.minutos).toLocaleString('pt-BR')} ÷ ${Math.round(l.disp).toLocaleString('pt-BR')} min)`;
            } } } },
            scales: {
                y: { beginAtZero: true, min: 0, suggestedMax: 120, ticks: { callback: v => v + '%', color: corTexto }, grid: { color: escuro ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)' } },
                x: { ticks: { color: corTexto, maxRotation: 0, autoSkip: true, maxTicksLimit: 12 }, grid: { display: false } },
            },
        },
    });
}

// Números do mês (usado na tela e no Excel): uma linha por dia + totais.
function calcularMesEfAcab(anoMes, minPessoa) {
    const todos = obterEfAcab();
    const dias = Object.keys(todos).filter(d => d.startsWith(anoMes)).sort();
    const linhas = dias.map(dia => {
        const v = todos[dia], pessoas = v.pessoas || 0, disp = pessoas ? pessoas * minPessoa : 0;
        return { dia, pecas: v.pecas || 0, ops: v.ops || 0, minutos: v.minutos || 0, semTempo: v.semTempo || 0, pessoas, disp, efic: disp ? (v.minutos / disp) * 100 : null };
    });
    const tot = linhas.reduce((a, l) => { a.pecas += l.pecas; a.minutos += l.minutos; if (l.disp) { a.minOk += l.minutos; a.disp += l.disp; a.diasPessoas++; } return a; }, { pecas: 0, minutos: 0, minOk: 0, disp: 0, diasPessoas: 0 });
    tot.efic = tot.disp ? (tot.minOk / tot.disp) * 100 : null;
    return { linhas, tot };
}
function renderizarEficienciaAcabamento() {
    const corpo = $('efAcabCorpo'); if (!corpo) return;
    const mes = $('seletorMesEfAcab') ? $('seletorMesEfAcab').value : '';
    const minPessoa = parseFloat($('efAcabMinPessoa') ? $('efAcabMinPessoa').value : 528) || 528;
    const { linhas, tot } = calcularMesEfAcab(mes, minPessoa);
    if (!linhas.length) {
        corpo.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:20px; color:var(--texto-secundario);">Nenhum dado ainda — importe o relatório de movimentação.</td></tr>';
        $('efAcabResumo').innerHTML = '';
        limparGraficoEficienciaAcabamento();   // sem dados no mês: o gráfico antigo não pode ficar na tela
        return;
    }
    const fmt = (v, c = 0) => v.toLocaleString('pt-BR', { maximumFractionDigits: c });
    const efTxt = e => e === null ? '<span style="color:var(--texto-secundario); font-weight:400;">informe as pessoas</span>' : `<span style="color:${COR_STATUS_EF(e)};">${fmt(e, 1)}%</span>`;
    corpo.innerHTML = linhas.map(l => {
        const [ano, m, dd] = l.dia.split('-');
        return `<tr>
            <td><strong>${dd}/${m}/${ano}</strong></td>
            <td style="text-align:right;">${fmt(l.pecas)}${l.semTempo ? ` <span title="${l.semTempo} peças sem tempo no relatório (não entram nos minutos)" style="color:var(--cor-alerta);">⚠</span>` : ''}</td>
            <td style="text-align:right;">${l.ops}</td>
            <td style="text-align:right;">${fmt(l.minutos)}</td>
            <td style="text-align:center;"><input type="number" min="0" step="1" value="${l.pessoas || ''}" placeholder="—" style="width:64px; text-align:center;" onchange="definirPessoasEfAcab('${l.dia}', this.value)"></td>
            <td style="text-align:right;">${l.disp ? fmt(l.disp) : '—'}</td>
            <td style="text-align:right; font-weight:700;">${efTxt(l.efic)}</td>
        </tr>`;
    }).join('');
    desenharGraficoEficienciaAcabamento(linhas);
    const card = (titulo, valor, sub) => `<div class="kpi-card" style="flex:1; min-width:180px; border-top:4px solid #35505C; padding:14px; background:var(--bg-card); border-radius:8px;"><div style="font-size:11px; color:var(--texto-secundario); text-transform:uppercase; font-weight:700;">${titulo}</div><div style="font-size:26px; font-weight:700; font-family:var(--fonte-display);">${valor}</div><div style="font-size:11px; color:var(--texto-secundario);">${sub}</div></div>`;
    $('efAcabResumo').innerHTML =
        card('Eficiência do mês', tot.efic !== null ? fmt(tot.efic, 1) + '%' : '—', tot.disp ? `${tot.diasPessoas} de ${linhas.length} dia(s) com pessoas informadas` : 'informe as pessoas por dia') +
        card('Peças no mês', fmt(tot.pecas), `${linhas.length} dia(s) importados`) +
        card('Minutos produzidos', fmt(tot.minutos), '');
}

function baixarMesEfAcabExcel() {
    if (!exigirBibliotecaExcel()) return;
    const anoMes = $('seletorMesEfAcab') ? $('seletorMesEfAcab').value : '';
    if (!anoMes) return alert('Escolha um mês no seletor MÊS antes de baixar.');
    const minPessoa = parseFloat($('efAcabMinPessoa') ? $('efAcabMinPessoa').value : 528) || 528;
    const { linhas, tot } = calcularMesEfAcab(anoMes, minPessoa);
    if (!linhas.length) return alert(`Não há dados de eficiência do acabamento em ${rotuloMesKPI(anoMes)}.`);
    const aoa = [['DATA', 'PEÇAS', 'OPs', 'MIN. PRODUZIDOS', 'PESSOAS', 'MIN. DISPONÍVEIS', 'EFICIÊNCIA (%)']]
        .concat(linhas.map(l => [formatarChaveDataBR(l.dia), l.pecas, l.ops, Math.round(l.minutos * 100) / 100, l.pessoas || '', l.disp || '', l.efic === null ? '' : Math.round(l.efic * 10) / 10]));
    aoa.push([], ['TOTAL DO MÊS', tot.pecas, '', Math.round(tot.minutos * 100) / 100, '', tot.disp || '', tot.efic === null ? '' : Math.round(tot.efic * 10) / 10]);
    aoa.push(['(a % do mês usa só os dias com pessoas informadas; jornada de ' + minPessoa + ' min por pessoa)']);
    const wb = XLSX.utils.book_new(), ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [14, 10, 8, 18, 10, 18, 16].map(w => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, 'ACABAMENTO');
    XLSX.writeFile(wb, `EficienciaAcabamento_${anoMes}.xlsx`);
    showToast(`<i class="fas fa-file-excel"></i> Eficiência do acabamento de ${rotuloMesKPI(anoMes)} baixada (${linhas.length} dias).`);
}

function limparMesEfAcab() {
    if (!exigirAdmin('limpar dados da eficiência do acabamento')) return;
    const anoMes = $('seletorMesEfAcab') ? $('seletorMesEfAcab').value : '';
    if (!anoMes) return alert('Escolha no seletor MÊS qual mês você quer limpar.');
    const todos = obterEfAcab();
    const doMes = Object.keys(todos).filter(d => d.startsWith(anoMes));
    const rotulo = rotuloMesKPI(anoMes);
    if (!doMes.length) return alert(`Não há dados de ${rotulo} pra limpar.`);
    const mensagem = `Vai apagar ${doMes.length} dia(s) de ${rotulo} da eficiência do acabamento (movimentação e pessoas informadas).\n\n`
        + `Os outros meses NÃO são mexidos (${Object.keys(todos).length - doMes.length} dia(s) continuam).\n\n`
        + `Apaga também da nuvem (some para todo mundo). Se ainda não baixou o arquivo do mês (BAIXAR MÊS), baixe antes.\n\nNão dá pra desfazer. Confirma?`;
    if (!confirm(mensagem)) return;
    doMes.forEach(d => delete todos[d]);
    salvarEfAcab(todos);
    salvarEfAcabPend(obterEfAcabPend().filter(d => !doMes.includes(d)));   // não reenviar dia que acabou de ser limpo
    popularSeletorMesEfAcab();
    renderizarEficienciaAcabamento();
    sincronizarDiasEfAcab([], doMes);
    showToast(`<i class="fas fa-check"></i> ${rotulo} limpo (${doMes.length} dia(s)). Os outros meses foram mantidos.`);
}
