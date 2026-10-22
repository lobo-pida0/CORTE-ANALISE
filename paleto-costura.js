// =========================================================================
// 🧵 COSTURA DO PALETÓ / BLAZER — empresa 02 (seção da aba META CORTE)
// Importa a POR_OP (a mesma planilha com as colunas Emp / Local / Descrição Local), fica só com as OPs de
// paletó/blazer da EMPRESA 02 que estão nos locais de costura abaixo, e monta a fila com previsão de
// início/término — mesma lógica da SEQUÊNCIA, mas com pessoas/horas/eficiência PRÓPRIAS do paletó.
// =========================================================================
// Locais da empresa 02 que contam como "na costura" do paletó/blazer, na ordem do fluxo.
const LOCAIS_COSTURA_PALETO = [
    { nome: 'SLV COST CEL PALETO', rotulo: 'Em costura' },
    { nome: 'SLV AGUARD DEFINICAO COST SOC PROF SU', rotulo: 'Aguardando costura' },
    { nome: 'SLV RECEB PENAPOLIS', rotulo: 'Recebido de Penápolis' },
];
function normalizarLocalPaleto(t) { return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toUpperCase(); }
function obterPorOPPaleto() { try { return JSON.parse(localStorage.getItem('porOPPaletoDetalhado') || '[]'); } catch (e) { return []; } }
function obterMediaProducaoPaleto() { const v = parseFloat(localStorage.getItem('mediaProducaoPaleto')); return v > 0 ? v : 110; }

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
    const locais = new Set(LOCAIS_COSTURA_PALETO.map(l => normalizarLocalPaleto(l.nome)));
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
            if (!lista.length) throw new Error('Nenhuma OP de paletó/blazer da empresa 02 nos locais de costura (' + LOCAIS_COSTURA_PALETO.map(l => l.nome).join(' / ') + ').');
            localStorage.setItem('porOPPaletoDetalhado', JSON.stringify(lista));
            localStorage.setItem('porOPPaletoImportadoEm', new Date().toISOString());
            renderizarCosturaPaleto();
            showToast(`<i class="fas fa-check-double"></i> ${lista.length} OPs de paletó/blazer importadas (empresa 02).`);
        } catch (err) { alert('❌ Não foi possível processar a planilha.\n\n' + err.message); }
        input.value = '';
    };
    rd.readAsArrayBuffer(input.files[0]);
}
// Resumo por local + total (peças de paletó/blazer da empresa 02 na costura).
function calcularResumoPaleto() {
    const todas = obterPorOPPaleto();
    const porLocal = LOCAIS_COSTURA_PALETO.map(l => { const ops = todas.filter(o => o.local === normalizarLocalPaleto(l.nome)); return { ...l, ops: ops.length, pecas: ops.reduce((t, o) => t + (o.qtd || 0), 0) }; });
    const pecas = porLocal.reduce((t, l) => t + l.pecas, 0), media = obterMediaProducaoPaleto(), dias = media > 0 ? pecas / media : null;
    let dataPrevista = null;
    if (dias !== null && pecas > 0) { const h = new Date(); h.setHours(0, 0, 0, 0); dataPrevista = somarDiasUteisCostura(h, Math.ceil(dias), new Set(obterFeriados())); }
    return { porLocal, ops: todas.length, pecas, media, dias, dataPrevista };
}
function renderizarCosturaPaleto() {
    const raiz = document.getElementById('paletoCosturaLista'); if (!raiz) return;
    const fmt = v => Math.round(v).toLocaleString('pt-BR');
    const esc = t => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const imp = localStorage.getItem('porOPPaletoImportadoEm');
    const info = document.getElementById('paletoCosturaInfo'); if (info) info.textContent = imp ? `POR_OP importada em ${new Date(imp).toLocaleString('pt-BR')}` : 'nenhuma planilha importada';
    const todas = obterPorOPPaleto();
    if (!todas.length) { raiz.innerHTML = '<div style="padding:16px; color:var(--texto-secundario); font-size:12px;">Importe a POR_OP (botão acima) para ver o que tem de paletó/blazer na costura da empresa 02.</div>'; return; }
    const r = calcularResumoPaleto();
    const corDias = r.dias === null ? 'inherit' : (r.dias >= 15 ? 'var(--cor-despacho)' : (r.dias >= 8 ? 'var(--cor-sugestao)' : 'var(--cor-alerta)'));
    const quadro = `<div style="display:grid; grid-template-columns:minmax(0, 3fr) minmax(220px, 2fr); gap:12px; padding:14px; align-items:stretch;">
        <table class="tabela-dados" style="width:100%;"><thead><tr><th>PRODUTO</th><th class="num">QTD. PÇ</th><th class="num">MÉDIA PRODUÇÃO/DIA</th><th class="num">QTD. DIAS</th></tr></thead><tbody>
            <tr><td><strong>Paletós / Blazers</strong></td><td class="num"><strong>${fmt(r.pecas)}</strong></td>
                <td class="num"><input type="number" id="inputMediaProducaoPaleto" min="1" step="5" value="${r.media}" style="width:80px; text-align:right;"></td>
                <td class="num" style="font-weight:900; font-size:16px; color:${corDias};">${r.dias === null ? '—' : r.dias.toFixed(1).replace('.', ',')}</td></tr>
            ${r.porLocal.map(l => `<tr style="font-size:12px; color:var(--texto-secundario);"><td>&nbsp;&nbsp;↳ ${esc(l.rotulo)} <span style="font-size:10px;">(${esc(l.nome)})</span></td><td class="num">${fmt(l.pecas)}</td><td></td><td class="num">${l.ops} OP(s)</td></tr>`).join('')}
        </tbody></table>
        <div style="border:1px solid var(--borda-cor); border-radius:8px; padding:12px; text-align:center; background:var(--bg-painel);">
            <div style="font-size:12px; font-weight:700; color:var(--cor-alerta); text-transform:uppercase;">Necessidade de entrada de serviços</div>
            <div style="font-size:11px; color:var(--texto-secundario); margin:4px 0 8px;">DATA PREVISTA (quando acaba o que tem na costura)</div>
            <div style="font-size:26px; font-weight:900;">${r.dataPrevista ? formatarDataBR(r.dataPrevista) : '—'}</div>
            <div style="font-size:11px; color:var(--texto-secundario); margin-top:6px;">hoje + ${r.dias === null ? '—' : Math.ceil(r.dias)} dia(s) útil(eis)</div>
        </div></div>`;
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const ordemLocal = Object.fromEntries(LOCAIS_COSTURA_PALETO.map((l, i) => [normalizarLocalPaleto(l.nome), i]));
    const rotLocal = Object.fromEntries(LOCAIS_COSTURA_PALETO.map(l => [normalizarLocalPaleto(l.nome), l.rotulo]));
    const t = v => v ? new Date(v).getTime() : Infinity;
    const lista = [...todas].sort((a, b) => (ordemLocal[a.local] - ordemLocal[b.local]) || (t(a.dataFinalizacao) - t(b.dataFinalizacao)) || (t(a.dataInclusao) - t(b.dataInclusao)));
    const linhas = lista.map(o => {
        const venc = o.dataFinalizacao && new Date(o.dataFinalizacao) < hoje;
        return `<tr><td><strong>${esc(o.op)}</strong>${o.ciclo ? ' · ' + esc(o.ciclo) : ''}</td><td><span class="pill" style="background:var(--bg-card); border:1px solid var(--borda-cor); color:var(--texto-cor);">${esc(rotLocal[o.local] || o.local)}</span></td>
            <td style="font-size:11px;">${esc(String(o.descRef).slice(0, 60))}</td><td>${esc(o.cor) || '—'}</td><td class="num">${fmt(o.qtd)}</td>
            <td style="white-space:nowrap; ${venc ? 'color:var(--cor-alerta); font-weight:700;' : ''}">${o.dataFinalizacao ? formatarDataBR(o.dataFinalizacao) : '—'}</td>
            <td style="white-space:nowrap;">${o.dataInclusao ? formatarDataBR(o.dataInclusao) : '—'}</td><td class="num">${o.diasLocal != null ? o.diasLocal + 'd' : '—'}</td></tr>`;
    }).join('');
    raiz.innerHTML = quadro + `<div style="overflow:auto; max-height:460px;"><table class="tabela-dados" style="width:100%;"><thead><tr><th>OP</th><th>ONDE ESTÁ</th><th>DESCRIÇÃO</th><th>COR</th><th class="num">PEÇAS</th><th>FINALIZAÇÃO</th><th>INCLUSÃO</th><th class="num">NO LOCAL</th></tr></thead><tbody>${linhas}</tbody></table></div>
        <div style="padding:8px 14px; font-size:11px; color:var(--texto-secundario);">Só paletó/blazer da empresa 02. Qtd. dias = peças ÷ média de produção por dia. Data prevista = hoje + esses dias úteis (pulando fins de semana e feriados cadastrados).</div>`;
    const inp = document.getElementById('inputMediaProducaoPaleto');
    if (inp) inp.onchange = () => { const v = parseFloat(inp.value); if (v > 0) { try { localStorage.setItem('mediaProducaoPaleto', String(v)); } catch (e) { /* ignora */ } } renderizarCosturaPaleto(); };
}
