// =========================================================================
// 🧵 ELABORAÇÃO DE COSTURA — EMPRESA 02 (seção da aba META CORTE)
// Importa a POR_OP (com as colunas Emp / Local / Descrição Local), fica só com a empresa 02 nos locais abaixo e mostra,
// por grupo (Camisas, Malha, Paletós, Calça): peças na costura, média de produção por dia (digitada), quantos dias de
// serviço isso representa e a data prevista (hoje + esses dias úteis) = quando precisa entrar serviço novo.
// Para mudar o que conta em cada grupo, é só editar GRUPOS_ELABORACAO_COSTURA.
// =========================================================================
const ehTipo = (...tipos) => o => tipos.includes(String(o.tipoProduto || '').toUpperCase());
const ehPaletoBlazer = o => /PALETO|BLAZER|SOBRETUDO/.test(String(o.tipoProduto || '').toUpperCase()) || grupoProdutoKPI(o.descRef) === 'PALETÓ / BLAZER';
const GRUPOS_ELABORACAO_COSTURA = [
    { chave: 'CAMISAS', rotulo: 'Camisas (1 e 2)', mediaPadrao: 320, locais: [
        { nome: 'SLV COST SUP CEL 1', rotulo: 'Célula 1' }, { nome: 'SLV COST SUP CEL 2', rotulo: 'Célula 2' },
        { nome: 'SLV RECEB PENAPOLIS', rotulo: 'Recebido de Penápolis (camisa)', filtro: ehTipo('CAMISA') }] },
    { chave: 'MALHA', rotulo: 'Malha (3 e 4)', mediaPadrao: 160, locais: [{ nome: 'SLV COST SUP CEL 3', rotulo: 'Célula 3' }] },
    { chave: 'PALETOS', rotulo: 'Paletós / Blazers', mediaPadrao: 110, locais: [
        { nome: 'SLV COST CEL PALETO', rotulo: 'Em costura', filtro: ehPaletoBlazer },
        { nome: 'SLV AGUARD DEFINICAO COST SOC PROF SU', rotulo: 'Aguardando costura', filtro: ehPaletoBlazer },
        { nome: 'SLV RECEB PENAPOLIS', rotulo: 'Recebido de Penápolis', filtro: ehPaletoBlazer }] },
    { chave: 'CALCA', rotulo: 'Calça', mediaPadrao: 235, locais: [
        { nome: 'SLV COST INF CEL SOC', rotulo: 'Costura', filtro: ehTipo('CALCA') },
        { nome: 'SLV RECEB PENAPOLIS', rotulo: 'Recebido de Penápolis (calça)', filtro: ehTipo('CALCA') }] },
];
function normalizarLocalElab(t) { return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toUpperCase(); }
function obterPorOPElab() { try { return JSON.parse(localStorage.getItem('porOPElaboracaoCostura') || '[]'); } catch (e) { return []; } }
function obterMediasElab() { try { return JSON.parse(localStorage.getItem('mediasElaboracaoCostura') || '{}') || {}; } catch (e) { return {}; } }
function mediaDoGrupoElab(g) { const v = parseFloat(obterMediasElab()[g.chave]); return v > 0 ? v : g.mediaPadrao; }
const LOCAIS_ELAB = new Set(GRUPOS_ELABORACAO_COSTURA.flatMap(g => g.locais.map(l => normalizarLocalElab(l.nome))));

// Parte pura (testável): linhas da planilha → OPs da empresa 02 nos locais da elaboração.
function extrairOPsElaboracaoDasLinhas(rows) {
    const semAc = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
    const iCab = [0, 1, 2, 3].find(i => rows[i] && rows[i].some(c => semAc(c) === 'OP'));
    if (iCab === undefined) throw new Error('Não achei a linha de títulos (coluna OP).');
    const cab = rows[iCab].map(semAc), f = fn => cab.findIndex(fn);
    const ix = {
        emp: f(c => c === 'EMP' || c === 'EMPRESA'), local: f(c => c === 'DESCRICAO LOCAL'), op: f(c => c === 'OP'), ciclo: f(c => c === 'CICLO'),
        descRef: f(c => c.includes('DESCRICAO') && c.includes('REFER')), cor: f(c => c === 'COR'), qtd: f(c => c.startsWith('QT') && c.includes('LOCAL')),
        tipo: f(c => c.includes('TIPO') && c.includes('PRODUTO')), dataFin: f(c => c.includes('DATA') && c.includes('FINALIZ')),
        inclusao: f(c => c.includes('INCLUS')), dias: f(c => c === 'DIAS LOCAL'),
    };
    if (ix.local === -1 || ix.op === -1) throw new Error('Faltam as colunas "Descrição Local" e/ou "OP".');
    if (ix.emp === -1) throw new Error('Não achei a coluna da empresa (Emp).');
    const lista = [];
    for (let i = iCab + 1; i < rows.length; i++) {
        const r = rows[i]; if (!r || r[ix.op] === undefined || r[ix.op] === null || r[ix.op] === '') continue;
        if (!['2', '02'].includes(String(r[ix.emp]).trim())) continue;
        const local = normalizarLocalElab(r[ix.local]); if (!LOCAIS_ELAB.has(local)) continue;
        lista.push({
            op: String(r[ix.op]).trim(), ciclo: ix.ciclo !== -1 && r[ix.ciclo] != null ? String(r[ix.ciclo]).trim() : '', local,
            descRef: ix.descRef !== -1 ? String(r[ix.descRef] || '').trim() : '', cor: ix.cor !== -1 && r[ix.cor] ? String(r[ix.cor]).trim().toUpperCase() : '',
            qtd: ix.qtd !== -1 ? (parseFloat(r[ix.qtd]) || 0) : 0, tipoProduto: ix.tipo !== -1 ? semAc(r[ix.tipo]) : '',
            dataFinalizacao: ix.dataFin !== -1 ? extrairDataExcel(r[ix.dataFin]) : null, dataInclusao: ix.inclusao !== -1 ? extrairDataExcel(r[ix.inclusao]) : null,
            diasLocal: ix.dias !== -1 ? (parseInt(r[ix.dias]) || 0) : null,
        });
    }
    return lista;
}
function processarPorOPElaboracao() {
    if (!exigirAdminOuUsuario('importar a planilha da elaboração de costura')) return;
    if (!exigirBibliotecaExcel()) return;
    const input = document.getElementById('inputPorOPElaboracao'); if (!input || !input.files[0]) return;
    const rd = new FileReader();
    rd.onload = e => {
        try {
            const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
            const lista = extrairOPsElaboracaoDasLinhas(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 }));
            if (!lista.length) throw new Error('Nenhuma OP da empresa 02 nos locais da elaboração de costura.');
            localStorage.setItem('porOPElaboracaoCostura', JSON.stringify(lista));
            localStorage.setItem('porOPElaboracaoImportadoEm', new Date().toISOString());
            renderizarElaboracaoCostura();
            showToast(`<i class="fas fa-check-double"></i> ${lista.length} OPs da empresa 02 importadas.`);
        } catch (err) { alert('❌ Não foi possível processar a planilha.\n\n' + err.message); }
        input.value = '';
    };
    rd.readAsArrayBuffer(input.files[0]);
}
// Resumo de um grupo: peças por local (com o filtro de produto de cada um), média, dias e data prevista.
function calcularResumoGrupoElab(g, todas) {
    const porLocal = g.locais.map(l => {
        const ops = (todas || obterPorOPElab()).filter(o => o.local === normalizarLocalElab(l.nome) && (!l.filtro || l.filtro(o)));
        return { ...l, listaOps: ops, ops: ops.length, pecas: ops.reduce((t, o) => t + (o.qtd || 0), 0) };
    });
    const pecas = porLocal.reduce((t, l) => t + l.pecas, 0), media = mediaDoGrupoElab(g), dias = media > 0 ? pecas / media : null;
    let dataPrevista = null;
    if (dias !== null && pecas > 0) { const h = new Date(); h.setHours(0, 0, 0, 0); dataPrevista = somarDiasUteisCostura(h, Math.ceil(dias), new Set(obterFeriados())); }
    return { grupo: g, porLocal, pecas, media, dias, dataPrevista };
}
function renderizarElaboracaoCostura() {
    const raiz = document.getElementById('elaboracaoCosturaLista'); if (!raiz) return;
    const fmt = v => Math.round(v).toLocaleString('pt-BR');
    const esc = t => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const imp = localStorage.getItem('porOPElaboracaoImportadoEm');
    const info = document.getElementById('elaboracaoCosturaInfo'); if (info) info.textContent = imp ? `POR_OP importada em ${new Date(imp).toLocaleString('pt-BR')}` : 'nenhuma planilha importada';
    const todas = obterPorOPElab();
    if (!todas.length) { raiz.innerHTML = '<div style="padding:16px; color:var(--texto-secundario); font-size:12px;">Importe a POR_OP (botão acima) para ver a elaboração de costura da empresa 02.</div>'; return; }
    const resumos = GRUPOS_ELABORACAO_COSTURA.map(g => calcularResumoGrupoElab(g, todas));
    const corDias = d => d === null ? 'inherit' : (d >= 15 ? 'var(--cor-despacho)' : (d >= 8 ? 'var(--cor-sugestao)' : 'var(--cor-alerta)'));
    const linhasQuadro = resumos.map(r => `<tr>
        <td><strong>${esc(r.grupo.rotulo)}</strong></td><td class="num"><strong>${fmt(r.pecas)}</strong></td>
        <td class="num"><input type="number" class="input-media-elab" data-grupo="${r.grupo.chave}" min="1" step="5" value="${r.media}" style="width:80px; text-align:right;"></td>
        <td class="num" style="font-weight:900; font-size:16px; color:${corDias(r.dias)};">${r.dias === null ? '—' : r.dias.toFixed(1).replace('.', ',')}</td>
        <td style="text-align:center; font-weight:700;">${r.dataPrevista ? formatarDataBR(r.dataPrevista) : '—'}</td></tr>`).join('');
    const quadro = `<div style="padding:14px; overflow:auto;"><table class="tabela-dados" style="width:100%;"><thead><tr>
        <th>PRODUTO</th><th class="num">QTD. PÇ</th><th class="num">MÉDIA PRODUÇÃO/DIA</th><th class="num">QTD. DIAS</th>
        <th style="text-align:center; color:#ff8a80;">NECESSIDADE DE ENTRADA DE SERVIÇOS<br><span style="font-weight:400; font-size:10px;">DATA PREVISTA</span></th></tr></thead><tbody>${linhasQuadro}</tbody></table>
        <div style="font-size:11px; color:var(--texto-secundario); margin-top:6px;">Data: ${formatarDataBR(new Date())} · Qtd. dias = peças ÷ média por dia · Data prevista = hoje + esses dias úteis (pula fins de semana e feriados cadastrados).</div></div>`;
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const t = v => v ? new Date(v).getTime() : Infinity;
    const detalhes = resumos.map(r => {
        const linhas = r.porLocal.flatMap(l => [...l.listaOps].sort((a, b) => (t(a.dataFinalizacao) - t(b.dataFinalizacao)) || (t(a.dataInclusao) - t(b.dataInclusao))).map(o => {
            const venc = o.dataFinalizacao && new Date(o.dataFinalizacao) < hoje;
            return `<tr><td><strong>${esc(o.op)}</strong>${o.ciclo ? ' · ' + esc(o.ciclo) : ''}</td><td><span class="pill" style="background:var(--bg-card); border:1px solid var(--borda-cor); color:var(--texto-cor);">${esc(l.rotulo)}</span></td>
                <td style="font-size:11px;">${esc(String(o.descRef).slice(0, 60))}</td><td>${esc(o.cor) || '—'}</td><td class="num">${fmt(o.qtd)}</td>
                <td style="white-space:nowrap; ${venc ? 'color:var(--cor-alerta); font-weight:700;' : ''}">${o.dataFinalizacao ? formatarDataBR(o.dataFinalizacao) : '—'}</td>
                <td style="white-space:nowrap;">${o.dataInclusao ? formatarDataBR(o.dataInclusao) : '—'}</td><td class="num">${o.diasLocal != null ? o.diasLocal + 'd' : '—'}</td></tr>`;
        }));
        const resumoLocais = r.porLocal.map(l => `${esc(l.rotulo)}: <strong>${fmt(l.pecas)}</strong> (${l.ops} OP${l.ops === 1 ? '' : 's'})`).join(' · ');
        return `<details ${r.grupo.chave === 'PALETOS' ? 'open' : ''} style="border-top:1px solid var(--borda-cor); padding:8px 14px;">
            <summary style="cursor:pointer; font-size:13px;"><strong>${esc(r.grupo.rotulo)}</strong> <span style="font-size:11px; color:var(--texto-secundario);">— ${resumoLocais}</span></summary>
            ${linhas.length ? `<div style="overflow:auto; max-height:360px; margin-top:6px;"><table class="tabela-dados" style="width:100%;"><thead><tr><th>OP</th><th>ONDE ESTÁ</th><th>DESCRIÇÃO</th><th>COR</th><th class="num">PEÇAS</th><th>FINALIZAÇÃO</th><th>INCLUSÃO</th><th class="num">NO LOCAL</th></tr></thead><tbody>${linhas.join('')}</tbody></table></div>` : '<div style="font-size:12px; color:var(--texto-secundario); padding:6px 0;">Nenhuma OP nesse grupo.</div>'}
        </details>`;
    }).join('');
    raiz.innerHTML = quadro + detalhes;
    raiz.querySelectorAll('.input-media-elab').forEach(inp => {
        inp.onchange = () => { const v = parseFloat(inp.value); if (v > 0) { const m = obterMediasElab(); m[inp.dataset.grupo] = v; try { localStorage.setItem('mediasElaboracaoCostura', JSON.stringify(m)); } catch (e) { /* ignora */ } } renderizarElaboracaoCostura(); };
    });
}
