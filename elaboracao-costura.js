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

// Leitura do cabeçalho (compartilhada pelas duas extrações).
function lerCabecalhoElab(rows) {
    const semAc = s => String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
    const iCab = [0, 1, 2, 3].find(i => rows[i] && rows[i].some(c => semAc(c) === 'OP'));
    if (iCab === undefined) throw new Error('Não achei a linha de títulos (coluna OP).');
    const cab = rows[iCab].map(semAc), f = fn => cab.findIndex(fn);
    const ix = {
        emp: f(c => c === 'EMP' || c === 'EMPRESA'), local: f(c => c === 'DESCRICAO LOCAL'), op: f(c => c === 'OP'), ciclo: f(c => c === 'CICLO'),
        descRef: f(c => c.includes('DESCRICAO') && c.includes('REFER')), cor: f(c => c === 'COR'), qtd: f(c => c.startsWith('QT') && c.includes('LOCAL')),
        tipo: f(c => c.includes('TIPO') && c.includes('PRODUTO')), dataFin: f(c => c.includes('DATA') && c.includes('FINALIZ')),
        inclusao: f(c => c.includes('INCLUS')), dias: f(c => c === 'DIAS LOCAL'), localObs: f(c => c.startsWith('LOCAL OBS')),
    };
    if (ix.local === -1 || ix.op === -1) throw new Error('Faltam as colunas "Descrição Local" e/ou "OP".');
    if (ix.emp === -1) throw new Error('Não achei a coluna da empresa (Emp).');
    return { iCab, ix, semAc };
}
function montarOPElab(r, ix, semAc, local) {
    return {
        op: String(r[ix.op]).trim(), ciclo: ix.ciclo !== -1 && r[ix.ciclo] != null ? String(r[ix.ciclo]).trim() : '', local,
        descRef: ix.descRef !== -1 ? String(r[ix.descRef] || '').trim() : '', cor: ix.cor !== -1 && r[ix.cor] ? String(r[ix.cor]).trim().toUpperCase() : '',
        qtd: ix.qtd !== -1 ? (parseFloat(r[ix.qtd]) || 0) : 0, tipoProduto: ix.tipo !== -1 ? semAc(r[ix.tipo]) : '',
        dataFinalizacao: ix.dataFin !== -1 ? extrairDataExcel(r[ix.dataFin]) : null, dataInclusao: ix.inclusao !== -1 ? extrairDataExcel(r[ix.inclusao]) : null,
        diasLocal: ix.dias !== -1 ? (parseInt(r[ix.dias]) || 0) : null,
        localProd: ix.localObs !== -1 && r[ix.localObs] ? String(r[ix.localObs]).trim().toUpperCase() : '',
    };
}
// Parte pura (testável): linhas da planilha → OPs da empresa 02 nos locais da elaboração.
function extrairOPsElaboracaoDasLinhas(rows) {
    const { iCab, ix, semAc } = lerCabecalhoElab(rows), lista = [];
    for (let i = iCab + 1; i < rows.length; i++) {
        const r = rows[i]; if (!r || r[ix.op] === undefined || r[ix.op] === null || r[ix.op] === '') continue;
        if (!['2', '02'].includes(String(r[ix.emp]).trim())) continue;
        const local = normalizarLocalElab(r[ix.local]); if (!LOCAIS_ELAB.has(local)) continue;
        lista.push(montarOPElab(r, ix, semAc, local));
    }
    return lista;
}
// OPs da EMPRESA 01 nos locais de "já cortada" (qualquer produto) — para sugerir o que mandar para a 02.
function extrairOPsPaletoEmp1DasLinhas(rows) {
    const { iCab, ix, semAc } = lerCabecalhoElab(rows), lista = [];
    for (let i = iCab + 1; i < rows.length; i++) {
        const r = rows[i]; if (!r || r[ix.op] === undefined || r[ix.op] === null || r[ix.op] === '') continue;
        if (!['1', '01'].includes(String(r[ix.emp]).trim())) continue;
        const o = montarOPElab(r, ix, semAc, normalizarLocalElab(r[ix.local]));
        if (paletoEmp1JaCortado(o)) lista.push(o);   // tudo que está nos locais de "já cortada" (qualquer produto), não só paletó/blazer
    }
    return lista;
}
// "Já cortado e pronto para a costura da 02": só os locais abaixo (definidos pelo usuário) — paletó/blazer da empresa 01 já
// cortado, nas etapas finais de separação/distribuição. Qualquer outro local da empresa 01 NÃO conta como "já cortada".
const LOCAIS_PALETO_EMP1_CORTADO = new Set(['PNP AGRUP DE DISTRIBUICAO', 'PNP AGUARD BIP DISTRIBUICAO', 'PNP DISTRIBUICAO EXT', 'PNP SEPARAR PECAS / UNIR CORPO E PTS']);
function paletoEmp1JaCortado(o) { return LOCAIS_PALETO_EMP1_CORTADO.has(normalizarLocalElab(o.local)); }

function processarPorOPElaboracao() {
    if (!exigirAdminOuUsuario('importar a planilha da elaboração de costura')) return;
    if (!exigirBibliotecaExcel()) return;
    const input = document.getElementById('inputPorOPElaboracao'); if (!input || !input.files[0]) return;
    const rd = new FileReader();
    rd.onload = e => {
        try {
            const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
            const linhasPlan = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
            const lista = extrairOPsElaboracaoDasLinhas(linhasPlan);
            localStorage.setItem('porOPPaletoEmp1', JSON.stringify(extrairOPsPaletoEmp1DasLinhas(linhasPlan)));
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
// ---- Reposição do paletó/blazer na empresa 02: avisa quando a elaboração está baixando e sugere o que mandar.
function obterConfigReposicaoPaleto() {
    let c = {}; try { c = JSON.parse(localStorage.getItem('configReposicaoPaleto') || '{}') || {}; } catch (e) { /* padrão */ }
    return { limite: c.limite > 0 ? c.limite : 7, metaDias: c.metaDias > 0 ? c.metaDias : 15 };
}
// Local de produção com "MS" escrito (ex.: "MS", "MS / INT") tem prioridade na lista de reposição.
function ehLocalProdMS(v) { return /(^|[^A-Z0-9])MS($|[^A-Z0-9])/.test(String(v || '').toUpperCase()) ? 1 : 0; }
function calcularReposicaoPaleto(todas) {
    const g = GRUPOS_ELABORACAO_COSTURA.find(x => x.chave === 'PALETOS'), r = calcularResumoGrupoElab(g, todas), cfg = obterConfigReposicaoPaleto();
    const faltam = Math.max(0, Math.ceil(cfg.metaDias * r.media - r.pecas));
    const nivel = r.dias === null ? null : (r.dias < Math.floor(cfg.limite / 2) ? 'vermelho' : (r.dias < cfg.limite ? 'amarelo' : 'verde'));
    // candidatos: 1º já cortadas na empresa 01 (mais antiga primeiro), 2º as que ainda vão cortar (etapa mais perto do corte, depois a mais antiga)
    const antig = o => o.dataInclusao ? new Date(o.dataInclusao).getTime() : Infinity;
    let emp1 = []; try { emp1 = JSON.parse(localStorage.getItem('porOPPaletoEmp1') || '[]'); } catch (e) { /* sem dados */ }
    const localProdFila = typeof obterLocalProducaoPorOP === 'function' ? obterLocalProducaoPorOP() : new Map();
    const prodDe = (op, valor) => String(valor || localProdFila.get(String(op)) || '').trim().toUpperCase();
    const ehDistExt = o => normalizarLocalElab(o.local) === 'PNP DISTRIBUICAO EXT' ? 1 : 0;   // na distribuição externa: aparece na frente de tudo
    const cortadas = emp1.filter(paletoEmp1JaCortado).sort((a, b) => (ehDistExt(b) - ehDistExt(a)) || (ehLocalProdMS(prodDe(b.op, b.localProd)) - ehLocalProdMS(prodDe(a.op, a.localProd))) || (antig(a) - antig(b)))
        .map(o => ({ op: o.op, ciclo: o.ciclo, desc: o.descRef, qtd: o.qtd, onde: o.local, dias: o.diasLocal != null ? o.diasLocal : null, prod: prodDe(o.op, o.localProd), situacao: 'JÁ CORTADA' }));
    const chaves = new Set(cortadas.map(o => `${o.ciclo}-${o.op}`));
    const aCortar = (typeof sugerirOPsMetaCorte === 'function' ? sugerirOPsMetaCorte() : []).filter(o => !chaves.has(`${o.ciclo}-${o.id}`))
        .map(o => ({ op: o.id, ciclo: o.ciclo, desc: o.desc, qtd: parseInt(o.qtd) || 0, onde: nomesEtapas[o.etapa] || '', dias: o.diasLocal != null ? o.diasLocal : null, prod: prodDe(o.id, o.localDestino && o.localDestino !== 'N/D' ? o.localDestino : ''), situacao: 'AINDA VAI CORTAR' }))
        .sort((a, b) => ehLocalProdMS(b.prod) - ehLocalProdMS(a.prod));   // MS primeiro (sort estável: o resto mantém a ordem de proximidade do corte)
    let soma = 0, fechou = faltam <= 0;
    const candidatos = [...cortadas, ...aCortar].map(o => { const pegar = !fechou; if (pegar) { soma += o.qtd; if (soma >= faltam) fechou = true; } return { ...o, pegar }; });
    return { resumo: r, cfg, faltam, nivel, candidatos, somaSugerida: soma };
}
function renderizarReposicaoPaleto(todas) {
    const raiz = document.getElementById('reposicaoPaletoConteudo'), banner = document.getElementById('alertaReposicaoPaleto');
    const fmt = v => Math.round(v).toLocaleString('pt-BR'), esc = t => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const rp = calcularReposicaoPaleto(todas), r = rp.resumo;
    const cor = { vermelho: 'var(--cor-alerta)', amarelo: 'var(--cor-sugestao)', verde: 'var(--cor-despacho)' }[rp.nivel] || 'var(--borda-cor)';
    const dias = r.dias === null ? '—' : r.dias.toFixed(1).replace('.', ',');
    const msg = rp.nivel === 'verde'
        ? `<strong>Paletó/blazer na empresa 02: elaboração OK</strong> — ${dias} dias de serviço (${fmt(r.pecas)} peças).`
        : `<strong>⚠ Paletó/blazer: a elaboração da empresa 02 está ${rp.nivel === 'vermelho' ? 'CRÍTICA' : 'baixando'}</strong> — só ${dias} dias de serviço (${fmt(r.pecas)} peças). Para chegar a ${rp.cfg.metaDias} dias, precisa mandar <strong>${fmt(rp.faltam)} peças</strong>.`;
    if (banner) { banner.style.display = rp.nivel && rp.nivel !== 'verde' ? 'block' : 'none'; banner.style.borderLeft = `5px solid ${cor}`; banner.innerHTML = msg; }
    if (!raiz) return;
    const linhas = rp.candidatos.map((o, i) => `<tr style="${o.pegar ? '' : 'opacity:0.5;'}"><td class="num">${i + 1}</td><td><strong>${esc(o.op)}</strong>${o.ciclo ? ' · ' + esc(o.ciclo) : ''}</td>
        <td><span class="pill" style="background:${o.situacao === 'JÁ CORTADA' ? 'var(--cor-despacho)' : 'var(--borda-cor)'}; color:${o.situacao === 'JÁ CORTADA' ? 'white' : 'var(--texto-cor)'};">${o.situacao}</span></td>
        <td style="font-size:11px;">${esc(String(o.desc).slice(0, 55))}</td><td style="font-size:11px;">${esc(o.onde)}</td><td class="num" style="${(o.dias || 0) >= 3 ? 'color:var(--cor-alerta); font-weight:bold;' : ''}">${o.dias != null ? o.dias + 'd' : '—'}</td><td style="font-size:11px;">${o.prod ? (ehLocalProdMS(o.prod) ? '<span class="pill" style="background:var(--cor-alerta); color:white;">' + esc(o.prod) + '</span>' : esc(o.prod)) : '—'}</td><td class="num">${fmt(o.qtd)}</td><td>${o.pegar ? '<span class="pill" style="background:var(--cor-despacho); color:white;">MANDAR</span>' : ''}</td></tr>`).join('');
    raiz.innerHTML = `<div style="padding:12px 16px; border-left:5px solid ${cor}; background:var(--bg-painel); font-size:13px;">${msg}</div>
        <div style="display:flex; gap:16px; flex-wrap:wrap; align-items:center; padding:8px 16px; font-size:12px;">
            <span>Avisar abaixo de <input type="number" id="inputLimiteReposicaoPaleto" min="1" step="1" value="${rp.cfg.limite}" style="width:60px;"> dias</span>
            <span>Meta de serviço na 02 <input type="number" id="inputMetaDiasReposicaoPaleto" min="1" step="1" value="${rp.cfg.metaDias}" style="width:60px;"> dias</span></div>
        ${rp.faltam > 0 ? (rp.nivel === 'verde' ? '<details style="padding:6px 16px 10px;"><summary style="cursor:pointer; font-size:12px;">Ver o que mandar para chegar a ' + rp.cfg.metaDias + ' dias</summary>' : '') + (rp.candidatos.length ? `<div style="overflow:auto; max-height:380px;"><table class="tabela-dados" style="width:100%;"><thead><tr><th class="num">#</th><th>OP</th><th>SITUAÇÃO NA EMPRESA 01</th><th>DESCRIÇÃO</th><th>ONDE ESTÁ</th><th class="num" title="Dias que a OP está parada no local atual">DIAS LOCAL</th><th>LOCAL DE PRODUÇÃO</th><th class="num">PEÇAS</th><th></th></tr></thead><tbody>${linhas}</tbody></table></div>
            <div style="padding:6px 16px; font-size:11px; color:var(--texto-secundario);">Ordem: primeiro as já cortadas (mais antiga primeiro), depois as que ainda vão cortar (etapa mais perto do corte, depois a mais antiga). As que estão em <strong>PNP DISTRIBUICAO EXT</strong> vêm na frente de tudo; em cada grupo, as com <strong>MS</strong> no local de produção vêm antes. "MANDAR" marca o que cobre a necessidade (${fmt(rp.somaSugerida)} peças). Já cortada = paletó/blazer da empresa 01 em: agrupamento de distribuição, aguardando bipagem, distribuição externa ou separar peças / unir corpo.</div>` : '<div style="padding:12px 16px; font-size:12px; color:var(--texto-secundario);">Nenhum paletó/blazer da empresa 01 encontrado para sugerir (importe a POR_OP e sincronize a planilha).</div>') + (rp.nivel === 'verde' ? '</details>' : '') : '<div style="padding:10px 16px; font-size:12px; color:var(--texto-secundario);">Elaboração acima da meta de dias — nada a mandar por enquanto.</div>'}`;
    const salvar = () => { const l = parseFloat(document.getElementById('inputLimiteReposicaoPaleto').value), m = parseFloat(document.getElementById('inputMetaDiasReposicaoPaleto').value); if (l > 0 && m > 0) { try { localStorage.setItem('configReposicaoPaleto', JSON.stringify({ limite: l, metaDias: m })); } catch (e) { /* ignora */ } } renderizarElaboracaoCostura(); };
    ['inputLimiteReposicaoPaleto', 'inputMetaDiasReposicaoPaleto'].forEach(id => { const e = document.getElementById(id); if (e) e.onchange = salvar; });
}
function renderizarElaboracaoCostura() {
    const raiz = document.getElementById('elaboracaoCosturaLista'); if (!raiz) return;
    const fmt = v => Math.round(v).toLocaleString('pt-BR');
    const esc = t => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const imp = localStorage.getItem('porOPElaboracaoImportadoEm');
    const info = document.getElementById('elaboracaoCosturaInfo'); if (info) info.textContent = imp ? `POR_OP importada em ${new Date(imp).toLocaleString('pt-BR')}` : 'nenhuma planilha importada';
    const todas = obterPorOPElab();
    if (!todas.length) { const bn = document.getElementById('alertaReposicaoPaleto'); if (bn) bn.style.display = 'none'; raiz.innerHTML = '<div style="padding:16px; color:var(--texto-secundario); font-size:12px;">Importe a POR_OP (botão acima) para ver a elaboração de costura da empresa 02.</div>'; return; }
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
    renderizarReposicaoPaleto(todas);
    raiz.querySelectorAll('.input-media-elab').forEach(inp => {
        inp.onchange = () => { const v = parseFloat(inp.value); if (v > 0) { const m = obterMediasElab(); m[inp.dataset.grupo] = v; try { localStorage.setItem('mediasElaboracaoCostura', JSON.stringify(m)); } catch (e) { /* ignora */ } } renderizarElaboracaoCostura(); };
    });
}
