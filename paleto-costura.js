// =========================================================================
// 🧵 COSTURA DO PALETÓ / BLAZER — empresa 02 (seção da aba META CORTE)
// Importa a POR_OP (a mesma planilha com as colunas Emp / Local / Descrição Local), fica só com as OPs de
// paletó/blazer da EMPRESA 02 que estão nos locais de costura abaixo, e monta a fila com previsão de
// início/término — mesma lógica da SEQUÊNCIA, mas com pessoas/horas/eficiência PRÓPRIAS do paletó.
// =========================================================================
const LOCAIS_COSTURA_PALETO = {
    emAndamento: 'SLV COST CEL PALETO',
    aguardando: 'SLV AGUARD DEFINICAO COST SOC PROF SU',
};
function normalizarLocalPaleto(t) { return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toUpperCase(); }
function obterPorOPPaleto() { try { return JSON.parse(localStorage.getItem('porOPPaletoDetalhado') || '[]'); } catch (e) { return []; } }
function obterCapacidadePaleto() {
    try { const c = JSON.parse(localStorage.getItem('capacidadePaleto') || 'null'); if (c && c.pessoas > 0) return c; } catch (e) { /* padrão */ }
    return { pessoas: 5, horas: 8, ef: 85 };
}
function minutosDisponiveisDiaPaleto() { const c = obterCapacidadePaleto(); return c.pessoas * c.horas * 60 * (c.ef / 100); }

// Parte pura (testável): transforma as linhas da planilha na lista de OPs do paletó.
function extrairOPsPaletoDasLinhas(rows) {
    const semAc = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
    const iCab = [0, 1, 2, 3].find(i => rows[i] && rows[i].some(c => semAc(c) === 'OP'));
    if (iCab === undefined) throw new Error('Não achei a linha de títulos (coluna OP).');
    const cab = rows[iCab].map(semAc);
    const f = fn => cab.findIndex(fn);
    const ix = {
        emp: f(c => c === 'EMP' || c === 'EMPRESA'), local: f(c => c === 'DESCRICAO LOCAL'), op: f(c => c === 'OP'), ciclo: f(c => c === 'CICLO'),
        ref: f(c => c === 'REFERENCIA'), descRef: f(c => c.includes('DESCRICAO') && c.includes('REFER')), cor: f(c => c === 'COR'),
        qtd: f(c => c.startsWith('QT') && c.includes('LOCAL')), tipo: f(c => c.includes('TIPO') && c.includes('PRODUTO')), prior: f(c => c === 'PRIORIDADE'),
        minCost: f(c => c.includes('MINUTOS') && c.includes('COSTURA')), tpCost: f(c => c.includes('TEMPO') && /PE[CÇ]A/.test(c) && c.includes('COSTURA')),
        dataFin: f(c => c.includes('DATA') && c.includes('FINALIZ')), inclusao: f(c => c.includes('INCLUS')), dias: f(c => c === 'DIAS LOCAL'),
    };
    if (ix.local === -1 || ix.op === -1) throw new Error('Faltam as colunas "Descrição Local" e/ou "OP".');
    if (ix.emp === -1) throw new Error('Não achei a coluna da empresa (Emp).');
    const locais = new Set([normalizarLocalPaleto(LOCAIS_COSTURA_PALETO.emAndamento), normalizarLocalPaleto(LOCAIS_COSTURA_PALETO.aguardando)]);
    const num = v => (v === null || v === undefined || v === '') ? null : (parseFloat(v) || null);
    const lista = [];
    for (let i = iCab + 1; i < rows.length; i++) {
        const r = rows[i]; if (!r || r[ix.op] === undefined || r[ix.op] === null || r[ix.op] === '') continue;
        if (!['2', '02'].includes(String(r[ix.emp]).trim())) continue;
        const local = normalizarLocalPaleto(r[ix.local]); if (!locais.has(local)) continue;
        const tipo = ix.tipo !== -1 ? semAc(r[ix.tipo]) : '', desc = ix.descRef !== -1 ? String(r[ix.descRef] || '').trim() : '';
        if (!/PALETO|BLAZER|SOBRETUDO/.test(tipo) && grupoProdutoKPI(desc) !== 'PALETÓ / BLAZER') continue;
        lista.push({
            op: String(r[ix.op]).trim(), ciclo: ix.ciclo !== -1 && r[ix.ciclo] != null ? String(r[ix.ciclo]).trim() : '', local,
            ref: ix.ref !== -1 && r[ix.ref] ? String(r[ix.ref]).trim().toUpperCase() : '', descRef: desc, cor: ix.cor !== -1 && r[ix.cor] ? String(r[ix.cor]).trim().toUpperCase() : '',
            qtd: ix.qtd !== -1 ? (parseFloat(r[ix.qtd]) || 0) : 0, tipoProduto: tipo, prioridade: ix.prior !== -1 && r[ix.prior] != null && r[ix.prior] !== '' ? parseInt(r[ix.prior]) : null,
            minutosCostura: num(ix.minCost !== -1 ? r[ix.minCost] : null), tempoPecaCostura: num(ix.tpCost !== -1 ? r[ix.tpCost] : null),
            dataFinalizacao: ix.dataFin !== -1 ? extrairDataExcel(r[ix.dataFin]) : null, dataInclusao: ix.inclusao !== -1 ? extrairDataExcel(r[ix.inclusao]) : null,
            diasLocal: ix.dias !== -1 ? (parseInt(r[ix.dias]) || 0) : null,
        });
    }
    return lista;
}
function processarPorOPPaleto() {
    if (!exigirAdminOuUsuario('importar a planilha do paletó/blazer')) return;
    if (!exigirBibliotecaExcel()) return;
    const input = document.getElementById('inputPorOPPaleto'); if (!input || !input.files[0]) return;
    const rd = new FileReader();
    rd.onload = e => {
        try {
            const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
            const lista = extrairOPsPaletoDasLinhas(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 }));
            if (!lista.length) throw new Error('Nenhuma OP de paletó/blazer da empresa 02 nos locais de costura (SLV COST CEL PALETO / SLV AGUARD DEFINICAO COST SOC PROF SU).');
            localStorage.setItem('porOPPaletoDetalhado', JSON.stringify(lista));
            localStorage.setItem('porOPPaletoImportadoEm', new Date().toISOString());
            renderizarCosturaPaleto();
            showToast(`<i class="fas fa-check-double"></i> ${lista.length} OPs de paletó/blazer importadas (empresa 02).`);
        } catch (err) { alert('❌ Não foi possível processar a planilha.\n\n' + err.message); }
        input.value = '';
    };
    rd.readAsArrayBuffer(input.files[0]);
}
function montarFilaPaleto() {
    const todas = obterPorOPPaleto();
    const nA = normalizarLocalPaleto(LOCAIS_COSTURA_PALETO.emAndamento);
    const e = todas.filter(o => o.local === nA).map(o => ({ ...o, situacaoCostura: 'Em andamento', campoTempo: 'minutosCostura' })).sort(compararPrioridadeCostura);
    const a = todas.filter(o => o.local !== nA).map(o => ({ ...o, situacaoCostura: 'Aguardando', campoTempo: 'minutosCostura' })).sort(compararPrioridadeCostura);
    return calcularCronogramaCostura([...e, ...a], minutosDisponiveisDiaPaleto());
}
function renderizarCosturaPaleto() {
    const raiz = document.getElementById('paletoCosturaLista'); if (!raiz) return;
    const fmt = v => Math.round(v).toLocaleString('pt-BR');
    const esc = t => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const c = obterCapacidadePaleto();
    ['paletoPessoas', 'paletoHoras', 'paletoEficiencia'].forEach((id, i) => { const el = document.getElementById(id); if (el && document.activeElement !== el) el.value = [c.pessoas, c.horas, c.ef][i]; });
    const fila = montarFilaPaleto(), hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const imp = localStorage.getItem('porOPPaletoImportadoEm');
    const info = document.getElementById('paletoCosturaInfo'); if (info) info.textContent = imp ? `importado em ${new Date(imp).toLocaleString('pt-BR')}` : 'nenhuma planilha importada';
    if (!fila.length) { raiz.innerHTML = '<div style="padding:16px; color:var(--texto-secundario); font-size:12px;">Importe a POR_OP (botão acima) para ver a fila do paletó/blazer da empresa 02.</div>'; return; }
    const totMin = fila.reduce((t, o) => t + (tempoCosturaOP(o) || 0), 0), pecas = fila.reduce((t, o) => t + (o.qtd || 0), 0), dispDia = minutosDisponiveisDiaPaleto();
    const fim = fila.filter(o => o.dataTerminoProducao).map(o => o.dataTerminoProducao).sort((a, b) => b - a)[0];
    const resumo = `<div style="display:flex; gap:18px; flex-wrap:wrap; padding:10px 14px; font-size:12px; background:var(--bg-painel);"><span><strong>${fila.length}</strong> OPs</span><span><strong>${fmt(pecas)}</strong> peças</span><span><strong>${fmt(totMin)}</strong> min de costura</span><span>capacidade <strong>${fmt(dispDia)}</strong> min/dia</span>${fim ? `<span>fila termina em <strong>${formatarDataBR(fim)}</strong></span>` : ''}</div>`;
    const linhas = fila.map((o, i) => {
        const atraso = classificarAtrasoOP(o, hoje), lim = calcularDataLimiteCostura(o);
        const corPrev = atraso === 'vermelho' ? 'var(--cor-alerta)' : (atraso === 'laranja' ? 'var(--cor-selecao)' : 'inherit');
        return `<tr style="${o.situacaoCostura === 'Em andamento' ? '' : ''}"><td class="num">${i + 1}</td><td><strong>${esc(o.op)}</strong>${o.ciclo ? ' · ' + esc(o.ciclo) : ''}</td>
            <td><span class="pill" style="background:${o.situacaoCostura === 'Em andamento' ? 'var(--cor-despacho)' : 'var(--borda-cor)'}; color:${o.situacaoCostura === 'Em andamento' ? 'white' : 'var(--texto-cor)'};">${o.situacaoCostura}</span></td>
            <td style="font-size:11px;">${esc(String(o.descRef).slice(0, 55))}</td><td>${esc(o.cor) || '—'}</td><td class="num">${fmt(o.qtd)}</td>
            <td class="num">${o.minutosCostura != null ? fmt(o.minutosCostura) : '<span style="color:var(--texto-secundario);">sem tempo</span>'}</td>
            <td style="white-space:nowrap;">${o.dataFinalizacao ? formatarDataBR(o.dataFinalizacao) : '—'}${lim ? `<br><span style="font-size:10px; color:var(--texto-secundario);">limite: ${formatarDataBR(lim)}</span>` : ''}</td>
            <td style="white-space:nowrap; color:${corPrev}; ${atraso ? 'font-weight:700;' : ''}">${o.dataInicioProducao ? formatarDataBR(o.dataInicioProducao) + ' → ' + formatarDataBR(o.dataTerminoProducao) : '—'}</td></tr>`;
    }).join('');
    raiz.innerHTML = resumo + `<div style="overflow:auto;"><table class="tabela-dados" style="width:100%;"><thead><tr><th class="num">#</th><th>OP</th><th>SITUAÇÃO</th><th>DESCRIÇÃO</th><th>COR</th><th class="num">PEÇAS</th><th class="num">TEMPO (MIN)</th><th>FINALIZAÇÃO</th><th>PREVISÃO</th></tr></thead><tbody>${linhas}</tbody></table></div>
        <div style="padding:8px 14px; font-size:11px; color:var(--texto-secundario);">Só paletó/blazer da empresa 02 em ${esc(LOCAIS_COSTURA_PALETO.emAndamento)} (em andamento) e ${esc(LOCAIS_COSTURA_PALETO.aguardando)} (aguardando). Ordem e previsão seguem as mesmas regras da aba SEQUÊNCIA, com a capacidade acima.</div>`;
}
function salvarCapacidadePaleto() {
    const n = id => parseFloat(document.getElementById(id) && document.getElementById(id).value) || 0;
    const c = { pessoas: n('paletoPessoas'), horas: n('paletoHoras'), ef: n('paletoEficiencia') };
    if (c.pessoas > 0 && c.horas > 0 && c.ef > 0) { try { localStorage.setItem('capacidadePaleto', JSON.stringify(c)); } catch (e) { /* ignora */ } }
    renderizarCosturaPaleto();
}
