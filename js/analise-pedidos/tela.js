// =========================================================================
// 📦 ANÁLISE DE PEDIDOS — TELA (aba "ANÁLISE PEDIDOS")
// Visões = abas da planilha: PAINEL ATRASOS, ALOCAÇÃO, FALTAS SEM OP, OPs A PROGRAMAR, CONSULTA PEDIDO e
// CONFIGURAÇÃO (os campos amarelos). O cálculo é do motor.js; aqui só desenha, filtra e exporta.
// Tabelas grandes mostram as primeiras linhas (LIMITE_LINHAS_AP) — a busca filtra tudo e o BAIXAR EXCEL leva tudo.
// =========================================================================
const LIMITE_LINHAS_AP = 400;
const estadoAP = { carregado: false, pedidos: null, ocupacao: null, meta: {}, configNuvem: null, nuvem: '', resultado: null, visao: 'painel', busca: {}, posDe: 0, posAte: 19, consulta: { pedido: '', ciclos: null, res: null } };

// ---------- formatação ----------
const fmtNAP = (v, dec = 0) => (v === '' || v === null || v === undefined || !isFinite(v)) ? '' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
const fmtDataAP = s => { if (!s || typeof s !== 'number') return s ? escHtml(s) : ''; const d = MotorAnalisePedidos.dataDeSerial(s); return d ? d.toLocaleDateString('pt-BR') : ''; };
const fmtPctAP = v => (v === '' || v === null || v === undefined) ? '' : (v * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
const fmtRSAP = v => (v === '' || v === null || v === undefined) ? '' : 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const COR_STATUS_AP = { 'Coberto': 'var(--cor-despacho)', 'Coberto por OP': 'var(--cor-despacho)', 'Fecha': 'var(--cor-despacho)', 'Parcial': '#B8862A', 'OP insuficiente': '#B8862A', 'Sem OP': 'var(--cor-alerta)', 'Sem nenhuma OP': 'var(--cor-alerta)', 'Bloqueado (fora)': 'var(--texto-secundario)' };
const pillAP = s => s ? `<span class="pill" style="background:${COR_STATUS_AP[s] || 'var(--cor-historico)'}; color:white;">${escHtml(s)}</span>` : '';
const linkPedidoAP = p => `<a href="#" class="ap-link-pedido" data-pedido="${escHtml(p)}" title="Consultar este pedido">${escHtml(p)}</a>`;
const hojeSerialAP = () => MotorAnalisePedidos.serialDeData(new Date());
const ehAdminAP = () => papelUsuarioAtual === 'admin';
// Configuração usada no cálculo: o admin usa a dele (é quem decide); quem só vê usa a que o admin publicou.
function configAP() { return (!ehAdminAP() && estadoAP.configNuvem) ? obterConfigAnalisePedidos(estadoAP.configNuvem) : obterConfigAnalisePedidos(); }

// Colunas: { t: título, v: linha => valor bruto (vai pro Excel), h?: linha => html, f?: 'n'|'n1'|'data'|'pct'|'rs', num?: alinhar à direita }
function celulaAP(c, r) {
    if (c.h) return c.h(r);
    const v = c.v(r);
    switch (c.f) {
        case 'n': return fmtNAP(v); case 'n1': return fmtNAP(v, 1); case 'data': return fmtDataAP(v);
        case 'pct': return fmtPctAP(v); case 'rs': return fmtRSAP(v); default: return escHtml(v);
    }
}
function textoBuscaAP(cols, r) { return cols.map(c => { const v = c.v(r); return c.f === 'data' ? fmtDataAP(v) : String(v === null || v === undefined ? '' : v); }).join(' ').toUpperCase(); }
function filtrarAP(id, cols, linhas) {
    const termo = (estadoAP.busca[id] || '').trim().toUpperCase();
    if (!termo) return linhas;
    const partes = termo.split(/\s+/);
    return linhas.filter(r => { const t = textoBuscaAP(cols, r); return partes.every(p => t.includes(p)); });
}
// Bloco de tabela com busca, contador e BAIXAR EXCEL
function blocoTabelaAP(id, titulo, cols, linhas, cor) {
    return `<div class="secao ap-secao">
        <div class="secao-header" style="background:${cor || 'var(--cor-fila)'};"><span>${titulo}</span><span id="apCont-${id}"></span></div>
        <div class="ap-ferramentas">
            <input type="search" class="ap-busca" data-tabela="${id}" placeholder="Buscar (pedido, referência, cliente, OP...)" value="${escHtml(estadoAP.busca[id] || '')}">
            <button class="btn ap-excel" data-tabela="${id}"><i class="fas fa-file-excel"></i> BAIXAR EXCEL</button>
        </div>
        <div class="secao-corpo ap-tabela-wrap" id="apTab-${id}"></div>
    </div>`;
}
const tabelasAP = {};   // id → { cols, linhas, nome }
function registrarTabelaAP(id, cols, linhas, nome) { tabelasAP[id] = { cols, linhas, nome }; }
function desenharTabelaAP(id) {
    const t = tabelasAP[id], el = $('apTab-' + id); if (!t || !el) return;
    const f = filtrarAP(id, t.cols, t.linhas), mostra = f.slice(0, LIMITE_LINHAS_AP);
    el.innerHTML = `<table class="tabela-dados ap-tabela"><thead><tr>${t.cols.map(c => `<th${c.num ? ' class="num"' : ''}>${escHtml(c.t)}</th>`).join('')}</tr></thead>
        <tbody>${mostra.length ? mostra.map(r => `<tr>${t.cols.map(c => `<td${c.num ? ' class="num"' : ''}>${celulaAP(c, r)}</td>`).join('')}</tr>`).join('')
            : `<tr><td colspan="${t.cols.length}" class="tabela-vazia">Nada encontrado.</td></tr>`}</tbody></table>
        ${f.length > mostra.length ? `<div class="ap-aviso-limite">Mostrando ${fmtNAP(mostra.length)} de ${fmtNAP(f.length)} linhas — use a busca para achar o que precisa, ou BAIXAR EXCEL para ver todas.</div>` : ''}`;
    const cont = $('apCont-' + id); if (cont) cont.textContent = (f.length === t.linhas.length ? fmtNAP(f.length) : `${fmtNAP(f.length)} de ${fmtNAP(t.linhas.length)}`) + ' linhas';
}
function baixarExcelTabelaAP(id) {
    const t = tabelasAP[id]; if (!t || !exigirBibliotecaExcel()) return;
    const f = filtrarAP(id, t.cols, t.linhas);
    const aoa = [t.cols.map(c => c.t), ...f.map(r => t.cols.map(c => { const v = c.v(r); return c.f === 'data' && typeof v === 'number' ? MotorAnalisePedidos.dataDeSerial(v) : (v === null || v === undefined ? '' : v); }))];
    const ws = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true }); ws['!cols'] = t.cols.map(c => ({ wch: Math.min(60, Math.max(8, c.t.length + 2)) }));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, t.nome.slice(0, 31));
    XLSX.writeFile(wb, `analise-pedidos-${t.nome.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${new Date().toISOString().slice(0, 10)}.xlsx`);
}
const cartaoAP = (rotulo, numero, detalhe, cor) => `<div class="card-resumo" style="border-top:4px solid ${cor}; cursor:default;"><div class="cr-rotulo">${rotulo}</div><div class="cr-numero">${numero}</div><div class="cr-detalhe">${detalhe || ''}</div></div>`;

// ---------- ciclo de vida ----------
async function abrirAbaAnalisePedidos() {
    if (!estadoAP.carregado) {
        $('apConteudo').innerHTML = '<div class="ap-vazio"><i class="fas fa-spinner fa-spin"></i> Carregando as bases salvas…</div>';
        const [p, o, m, cn] = await Promise.all([lerBaseAnalisePedidos('pedidos'), lerBaseAnalisePedidos('ocupacao'), lerBaseAnalisePedidos('meta'), lerBaseAnalisePedidos('configNuvem')]);
        estadoAP.pedidos = p; estadoAP.ocupacao = o; estadoAP.meta = m || {}; estadoAP.configNuvem = cn; estadoAP.carregado = true;
    }
    recalcularAnalisePedidos();
    renderizarAnalisePedidos();
    await atualizarAnalisePedidosDaNuvem();
}
// Confere se tem versão mais nova publicada. Quem só vê sempre segue a nuvem; o admin só baixa se não tiver as bases aqui
// (ex.: abriu de outro computador) — senão a versão dele é a que vale.
async function atualizarAnalisePedidosDaNuvem() {
    if (ehAdminAP() && estadoAP.pedidos && estadoAP.ocupacao) return;
    estadoAP.nuvem = 'verificando'; $('apStatusImport').innerHTML = infoBasesAP();
    const m = estadoAP.meta || {};
    const r = await carregarAnalisePedidosDaNuvem({ publicadoEm: m.publicadoEm, basesEm: m.basesEm, temBases: !!(estadoAP.pedidos && estadoAP.ocupacao) });
    estadoAP.nuvem = r ? (r.vazio ? 'vazia' : 'ok') : 'erro';
    if (r && r.atualizou) {
        if (r.pedidos) { estadoAP.pedidos = r.pedidos; estadoAP.ocupacao = r.ocupacao; }
        estadoAP.meta = r.meta; estadoAP.configNuvem = r.config || null;
        await salvarBaseAnalisePedidos('meta', estadoAP.meta); await salvarBaseAnalisePedidos('configNuvem', estadoAP.configNuvem);
        if (ehAdminAP() && r.config && !localStorage.getItem('configAnalisePedidos')) salvarConfigAnalisePedidos(r.config);
        recalcularAnalisePedidos();
    } else if (r && r.config && !estadoAP.configNuvem) { estadoAP.configNuvem = r.config; recalcularAnalisePedidos(); }
    renderizarAnalisePedidos();
}
async function publicarAnalisePedidosAP(oQue) {
    if (!ehAdminAP()) return;
    estadoAP.nuvem = 'publicando'; $('apStatusImport').innerHTML = infoBasesAP();
    const cfg = obterConfigAnalisePedidos();
    const r = await publicarAnalisePedidosNuvem(oQue, estadoAP.meta, estadoAP.pedidos, estadoAP.ocupacao, cfg);
    if (r.ok) { estadoAP.meta = r.meta; estadoAP.configNuvem = cfg; estadoAP.nuvem = 'ok'; await salvarBaseAnalisePedidos('meta', estadoAP.meta); await salvarBaseAnalisePedidos('configNuvem', cfg); }
    else { estadoAP.nuvem = 'falhou'; showToast('<i class="fas fa-triangle-exclamation"></i> Salvo neste computador, mas a publicação na nuvem falhou — clique em PUBLICAR NA NUVEM para tentar de novo.', true, 7000); }
    $('apStatusImport').innerHTML = infoBasesAP();
}
function recalcularAnalisePedidos() {
    estadoAP.resultado = null;
    if (!estadoAP.pedidos || !estadoAP.ocupacao) return;
    const cfg = { ...configAP(), posicaoDe: estadoAP.posDe, posicaoAte: estadoAP.posAte };
    const t0 = performance.now();
    estadoAP.resultado = MotorAnalisePedidos.calcular(estadoAP.pedidos, estadoAP.ocupacao, cfg, hojeSerialAP());
    registrarLogDebug('log', [`Análise de pedidos recalculada em ${Math.round(performance.now() - t0)} ms`]);
}
async function importarAnalisePedidos(input) {
    if (!exigirAdmin('importar as bases da análise de pedidos')) { input.value = ''; return; }
    if (!exigirBibliotecaExcel()) { input.value = ''; return; }
    const arquivos = [...input.files]; if (!arquivos.length) return;
    $('apStatusImport').innerHTML = '<i class="fas fa-spinner fa-spin"></i> Lendo…';
    const msgs = [], agora = new Date().toISOString();
    try {
        for (const arq of arquivos) {
            const r = await lerArquivoAnalisePedidosAP(arq);
            if (r.pedidos) { estadoAP.pedidos = r.pedidos; estadoAP.meta.pedidos = { arquivo: arq.name, aba: r.abaPedidos, linhas: r.pedidos.length, em: agora }; await salvarBaseAnalisePedidos('pedidos', r.pedidos); msgs.push(`BASE PEDIDOS: ${fmtNAP(r.pedidos.length)} linhas`); }
            if (r.ocupacao) { estadoAP.ocupacao = r.ocupacao; estadoAP.meta.ocupacao = { arquivo: arq.name, aba: r.abaOcupacao, linhas: r.ocupacao.length, em: agora }; await salvarBaseAnalisePedidos('ocupacao', r.ocupacao); msgs.push(`BASE OCUPAÇÃO: ${fmtNAP(r.ocupacao.length)} linhas`); }
            if (!r.pedidos && !r.ocupacao) {
                const falt = [...(r.erroPedidos || []), ...(r.erroOcupacao || [])].map(c => NOMES_CAMPOS_AP[c] || c);
                msgs.push(`"${arq.name}": não reconheci nenhuma das bases${falt.length ? ' — faltou a coluna ' + falt.join(', ') : ''}.`);
            }
        }
        const importouAlgo = msgs.some(m => /linhas$/.test(m));
        if (importouAlgo) estadoAP.meta.basesEm = agora;
        await salvarBaseAnalisePedidos('meta', estadoAP.meta);
        estadoAP.carregado = true;
        recalcularAnalisePedidos(); renderizarAnalisePedidos();
        showToast('<i class="fas fa-check"></i> ' + escHtml(msgs.join(' · ')), !importouAlgo, 6000);
        if (importouAlgo && estadoAP.pedidos && estadoAP.ocupacao) publicarAnalisePedidosAP('tudo');
    } catch (e) {
        registrarLogDebug('error', ['Falha ao importar base da análise de pedidos: ' + e.message]);
        showToast('<i class="fas fa-triangle-exclamation"></i> Não consegui ler o arquivo: ' + escHtml(e.message), true, 6000);
    } finally { input.value = ''; }
}

// ---------- desenho ----------
function infoBasesAP() {
    const m = estadoAP.meta || {}, f = x => x ? `${escHtml(x.arquivo)} · ${fmtNAP(x.linhas)} linhas · ${new Date(x.em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : '<em>não importada</em>';
    const quando = x => new Date(x).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    const nuvem = { verificando: '<i class="fas fa-spinner fa-spin"></i> conferindo a nuvem…', publicando: '<i class="fas fa-spinner fa-spin"></i> publicando…',
        erro: '<span style="color:var(--cor-alerta);">sem conexão com a nuvem — mostrando a última cópia deste computador</span>',
        falhou: '<span style="color:var(--cor-alerta);">publicação falhou</span>', vazia: 'nada publicado ainda' }[estadoAP.nuvem]
        || (m.publicadoEm ? `publicado ${quando(m.publicadoEm)}${m.publicadoPor ? ' por ' + escHtml(m.publicadoPor) : ''}` : 'não publicado');
    const botaoPublicar = ehAdminAP() && estadoAP.pedidos && estadoAP.ocupacao ? ' <button class="btn" id="apBtnPublicar" style="padding:3px 9px; font-size:11px;"><i class="fas fa-cloud-arrow-up"></i> PUBLICAR NA NUVEM</button>' : '';
    return `<div class="ap-bases"><span><strong>BASE PEDIDOS:</strong> ${f(m.pedidos)}</span><span><strong>BASE OCUPAÇÃO:</strong> ${f(m.ocupacao)}</span><span><strong>NUVEM:</strong> ${nuvem}${botaoPublicar}</span></div>`;
}
function renderizarAnalisePedidos() {
    const el = $('apConteudo'); if (!el) return;
    $$('.ap-nav button').forEach(b => b.classList.toggle('ativo', b.dataset.visao === estadoAP.visao));
    $('apStatusImport').innerHTML = infoBasesAP();
    if (estadoAP.visao === 'config') { el.innerHTML = htmlConfigAP(); return; }
    const R = estadoAP.resultado;
    if (!R) {
        el.innerHTML = ehAdminAP()
            ? `<div class="ap-vazio"><i class="fas fa-file-import" style="font-size:28px; color:var(--cor-roxo);"></i>
                <p><strong>Importe as duas bases para começar.</strong></p>
                <p>Pode ser a própria <strong>PLANILHA_ANALISE_PEDIDOS.xlsx</strong> (o sistema pega as abas BASE PEDIDOS e BASE OCUPAÇÃO) ou os dois relatórios separados — selecione os dois arquivos de uma vez. Ao importar, a análise é publicada na nuvem para quem tem acesso.</p>
                <p style="color:var(--texto-secundario); font-size:12px;">BASE PEDIDOS precisa das colunas Pedido, Situação, Referência, Cor, Tam, Pendente e Falta Estoque. BASE OCUPAÇÃO precisa de Ciclo, OP, Referência, Cor, Tam, Qt OP Local e Descrição Local.</p></div>`
            : `<div class="ap-vazio"><i class="fas fa-cloud" style="font-size:28px; color:var(--cor-roxo);"></i>
                <p><strong>${estadoAP.nuvem === 'verificando' ? 'Buscando a análise publicada…' : (estadoAP.nuvem === 'erro' ? 'Não consegui buscar a análise na nuvem.' : 'O admin ainda não publicou a análise de pedidos.')}</strong></p>
                <p style="color:var(--texto-secundario);">${estadoAP.nuvem === 'erro' ? 'Confira a internet e abra a aba de novo.' : 'Assim que ele importar as bases, ela aparece aqui.'}</p></div>`;
        return;
    }
    const aviso = R.locaisSemEtapa.length && ehAdminAP() ? `<div class="ap-alerta"><i class="fas fa-triangle-exclamation"></i> ${R.locaisSemEtapa.length} local(is) da BASE OCUPAÇÃO sem etapa cadastrada (contam como posição 0, gastos por último): ${escHtml(R.locaisSemEtapa.slice(0, 6).join(', '))}${R.locaisSemEtapa.length > 6 ? '…' : ''} — ajuste em <a href="#" data-ir-visao="config">CONFIGURAÇÃO</a>.</div>` : '';
    const html = { painel: htmlPainelAP, alocacao: htmlAlocacaoAP, faltas: htmlFaltasAP, ops: htmlOPsAP, consulta: htmlConsultaAP }[estadoAP.visao] || htmlPainelAP;
    el.innerHTML = aviso + html(R);
    Object.keys(tabelasAP).forEach(id => { if ($('apTab-' + id)) desenharTabelaAP(id); });
}

function htmlPainelAP(R) {
    const i = R.indicadoresPainel;
    registrarTabelaAP('painel', [
        { t: 'Pedido', v: r => r.pedido, h: r => linkPedidoAP(r.pedido) }, { t: 'Cliente (Coligador)', v: r => r.cliente }, { t: 'Situação', v: r => r.situacao },
        { t: 'Prior', v: r => r.prior, num: 1 }, { t: 'Chegada', v: r => r.chegada, f: 'data' }, { t: 'Nec. Fat. (ou Prev.)', v: r => r.prev, f: 'data' },
        { t: 'Dias atraso', v: r => r.dias, f: 'n', num: 1 }, { t: 'Faixa', v: r => r.faixa }, { t: 'Peças pendentes', v: r => r.pendentes, f: 'n', num: 1 },
        { t: 'Fecha físico', v: r => r.fechaFisico, f: 'n', num: 1 }, { t: '% atendido', v: r => r.pctAtendido, f: 'pct', num: 1 }, { t: 'Peças em falta', v: r => r.falta, f: 'n', num: 1 },
        { t: 'R$ total do pedido', v: r => r.rsTotal, f: 'rs', num: 1 }, { t: 'Restrição faturamento', v: r => r.restricao }, { t: 'Peças cobertas por OP', v: r => r.cobertoOP, f: 'n', num: 1 },
        { t: '% fecha c/ OPs', v: r => r.pctComOPs, f: 'pct', num: 1 }, { t: 'Status OPs', v: r => r.statusOPs, h: r => pillAP(r.statusOPs) }, { t: 'R$ em falta', v: r => r.rsFalta, f: 'rs', num: 1 }
    ], R.painel, 'Pedidos atrasados');
    return `<div class="ap-cartoes">
            ${cartaoAP('PEDIDOS NÃO 100% ATENDIDOS', fmtNAP(i.naoAtendidos), 'pendente maior que fecha físico', 'var(--cor-fila)')}
            ${cartaoAP('PEDIDOS ATRASADOS', fmtNAP(i.atrasados), fmtPctAP(i.pctAtrasados) + ' dos não atendidos', 'var(--cor-alerta)')}
            ${cartaoAP('R$ EM FALTA (ATRASADOS)', fmtRSAP(i.rsFaltaAtrasado), 'valor das peças que faltam', 'var(--cor-roxo)')}
            ${cartaoAP('PEÇAS EM FALTA (ATRASADOS)', fmtNAP(i.pecasFaltaAtrasadas), 'data base: ' + fmtDataAP(hojeSerialAP()), '#B8862A')}
        </div>
        <div class="ap-duas-colunas">
            <div class="secao ap-secao"><div class="secao-header" style="background:var(--cor-alerta);"><span>FAIXA DE ATRASO</span></div><div class="secao-corpo">
                <table class="tabela-dados"><thead><tr><th>Faixa</th><th class="num">Nº pedidos</th><th class="num">R$ em falta</th><th class="num">Peças em falta</th><th class="num">R$ total pedidos</th></tr></thead>
                <tbody>${R.faixas.map(f => `<tr><td>${escHtml(f.faixa)}</td><td class="num">${fmtNAP(f.pedidos)}</td><td class="num">${fmtRSAP(f.rsFalta)}</td><td class="num">${fmtNAP(f.pecasFalta)}</td><td class="num">${fmtRSAP(f.rsTotal)}</td></tr>`).join('')}</tbody></table></div></div>
            <div class="secao ap-secao"><div class="secao-header" style="background:var(--cor-roxo);"><span>TOP 10 CLIENTES (R$ EM FALTA ATRASADO)</span></div><div class="secao-corpo">
                <table class="tabela-dados"><thead><tr><th>Cliente</th><th class="num">Nº pedidos</th><th class="num">R$ em falta</th><th class="num">Maior atraso</th></tr></thead>
                <tbody>${R.top10.map(c => `<tr><td>${escHtml(c.cliente)}</td><td class="num">${fmtNAP(c.pedidos)}</td><td class="num">${fmtRSAP(c.rsFalta)}</td><td class="num">${fmtNAP(c.maiorAtraso)} d</td></tr>`).join('') || '<tr><td colspan="4" class="tabela-vazia">Nenhum pedido atrasado.</td></tr>'}</tbody></table></div></div>
        </div>
        ${blocoTabelaAP('painel', 'PEDIDOS ATRASADOS (do mais atrasado para o menos)', tabelasAP.painel.cols, R.painel, 'var(--cor-fila)')}
        <p class="ap-nota">Atrasado = Necessidade Fat. (ou Prev. Fat.) vencida há ${fmtNAP(configAP().atrasoMinimo)}+ dia(s) e Fecha Físico menor que o Pendente. "Peças cobertas por OP" usa a alocação (sem contar a mesma peça duas vezes).</p>`;
}

function htmlAlocacaoAP(R) {
    const i = R.indicadores, cfg = configAP();
    registrarTabelaAP('alocacao', [
        { t: 'Pedido', v: r => r.pedido, h: r => linkPedidoAP(r.pedido) }, { t: 'Cliente (Coligador)', v: r => r.cliente }, { t: 'Situação', v: r => r.situacao },
        { t: 'Nec. Fat. (ou Prev.)', v: r => r.prev, f: 'data' }, { t: 'Dias atraso', v: r => r.diasAtraso, f: 'n', num: 1 }, { t: 'Referência', v: r => r.ref },
        { t: 'Descrição do produto', v: r => r.desc }, { t: 'Cor', v: r => r.cor }, { t: 'Tam', v: r => r.tam }, { t: 'Falta', v: r => r.falta, f: 'n', num: 1 },
        { t: 'Alocado OP', v: r => r.alocado, f: 'n', num: 1 }, { t: 'Descoberto', v: r => r.descoberto, f: 'n', num: 1 }, { t: 'Status', v: r => r.status, h: r => pillAP(r.status) },
        { t: 'OPs usadas (ciclo-OP-peças)', v: r => r.opsUsadas }, { t: 'Local das OPs [etapa]', v: r => r.locaisOps }
    ], R.alocacao, 'Alocação por linha');
    registrarTabelaAP('resumoOP', [
        { t: 'Ciclo', v: r => r.ciclo }, { t: 'OP', v: r => r.op }, { t: 'Situação OP', v: r => r.situacao }, { t: 'Peças na OP', v: r => r.qtd, f: 'n', num: 1 },
        { t: 'Alocadas', v: r => r.alocado, f: 'n', num: 1 }, { t: 'Sobra', v: r => r.sobra, f: 'n', num: 1 }, { t: 'Linhas atendidas', v: r => r.linhas, f: 'n', num: 1 }, { t: 'Local', v: r => r.locais }
    ], R.resumoOP, 'Resumo por OP');
    return `<div class="ap-cartoes">
            ${cartaoAP('LINHAS DE PEDIDO EM FALTA', fmtNAP(i.linhasEmFalta), fmtNAP(i.pecasEmFalta) + ' peças em falta', 'var(--cor-fila)')}
            ${cartaoAP('PEÇAS COBERTAS POR OP', fmtNAP(i.pecasCobertas), fmtPctAP(i.coberturaReal) + ' de cobertura real', 'var(--cor-despacho)')}
            ${cartaoAP('PEÇAS DESCOBERTAS', fmtNAP(i.pecasDescobertas), 'precisam de OP nova', 'var(--cor-alerta)')}
            ${cartaoAP('PEÇAS DE OP SOBRANDO', fmtNAP(i.pecasOPSobrando), 'nas OPs que atendem estes itens', 'var(--cor-roxo)')}
        </div>
        <p class="ap-nota"><strong>Regra:</strong> pedidos mais atrasados recebem primeiro. As OPs são gastas na ordem: etapa mais avançada → locais prioritários → ciclos preferenciais (${escHtml(cfg.ciclosPreferenciais)}) → Em Andamento → Ag. Liberação → entrada mais antiga.
        Casando por Referência + ${cfg.considerarCor ? 'Cor + ' : ''}Tam · pedidos bloqueados ${cfg.incluirBloqueados ? '<strong>incluídos</strong>' : 'fora'} ·
        peças não alocáveis: ${fmtNAP(i.pecasBloqueadasCicloLocal)} (ciclo + local) e ${fmtNAP(i.pecasBloqueadasEmpresaCiclo)} (empresa + ciclo).</p>
        ${blocoTabelaAP('alocacao', 'ALOCAÇÃO POR LINHA DE PEDIDO (ordem de prioridade)', tabelasAP.alocacao.cols, R.alocacao, 'var(--cor-fila)')}
        ${blocoTabelaAP('resumoOP', 'RESUMO POR OP', tabelasAP.resumoOP.cols, R.resumoOP, 'var(--cor-historico)')}`;
}

function htmlFaltasAP(R) {
    const i = R.indicadoresFaltas;
    registrarTabelaAP('faltas', [
        { t: 'Referência', v: r => r.ref }, { t: 'Descrição', v: r => r.desc }, { t: 'Cor', v: r => r.cor }, { t: 'Tam', v: r => r.tam },
        { t: 'Falta total', v: r => r.faltaTotal, f: 'n', num: 1 }, { t: 'Peças em OP', v: r => r.pecasOP, f: 'n', num: 1 }, { t: 'Alocado', v: r => r.alocado, f: 'n', num: 1 },
        { t: 'Falta descoberta', v: r => r.descoberto, f: 'n', num: 1 }, { t: 'Nº pedidos', v: r => r.pedidos, f: 'n', num: 1 }, { t: 'Maior atraso (dias)', v: r => r.maiorAtraso, f: 'n', num: 1 },
        { t: 'Situação', v: r => r.situacao, h: r => pillAP(r.situacao) }
    ], R.faltasSemOP, 'Faltas sem OP');
    return `<div class="ap-cartoes">
            ${cartaoAP('ITENS COM FALTA DESCOBERTA', fmtNAP(i.itens), 'referência + tamanho', 'var(--cor-alerta)')}
            ${cartaoAP('PEÇAS DESCOBERTAS', fmtNAP(i.pecasDescobertas), 'necessidade de produção nova', '#B8862A')}
            ${cartaoAP('ITENS SEM NENHUMA OP', fmtNAP(i.semNenhumaOP), 'nem uma OP aberta pra eles', 'var(--cor-roxo)')}
        </div>
        ${blocoTabelaAP('faltas', 'FALTAS SEM OP — NECESSIDADE DE PRODUÇÃO (maior falta primeiro)', tabelasAP.faltas.cols, R.faltasSemOP, 'var(--cor-alerta)')}`;
}

function htmlOPsAP(R) {
    const nomes = MotorAnalisePedidos.NOMES_POSICAO, opt = sel => nomes.map((n, i) => `<option value="${i}"${i === sel ? ' selected' : ''}>${i} — ${escHtml(n)}</option>`).join('');
    registrarTabelaAP('ops', [
        { t: 'Prior.', v: r => r.prioridade, num: 1 }, { t: 'Ciclo', v: r => r.ciclo }, { t: 'OP', v: r => r.op }, { t: 'Situação OP', v: r => r.situacao },
        { t: 'Local', v: r => r.local }, { t: 'Posição', v: r => r.posicao, num: 1 }, { t: 'Ref', v: r => r.ref }, { t: 'Descrição', v: r => r.desc }, { t: 'Cor', v: r => r.cor }, { t: 'Tam', v: r => r.tam },
        { t: 'Qtd OP', v: r => r.qtd, f: 'n', num: 1 }, { t: 'Alocado p/ pedidos', v: r => r.alocado, f: 'n', num: 1 }, { t: 'Sobra', v: r => r.sobra, f: 'n', num: 1 },
        { t: 'Linhas atendidas', v: r => r.linhas, f: 'n', num: 1 }, { t: 'Pedidos atendidos', v: r => r.pedidos }, { t: 'Prev. Fat. mais antiga', v: r => r.prevMaisAntiga, f: 'data' },
        { t: 'Dias atraso', v: r => r.diasAtraso, f: 'n', num: 1 }
    ], R.opsAProgramar, 'OPs a programar');
    return `<div class="ap-filtros">
            <label>POSIÇÃO DE <select id="apPosDe">${opt(estadoAP.posDe)}</select></label>
            <label>ATÉ <select id="apPosAte">${opt(estadoAP.posAte)}</select></label>
            <span class="ap-nota" style="margin:0;">Uma linha por OP × Ref/Cor/Tam que atende pedidos em falta, ordenada pela Prev. Fat. mais antiga dos pedidos atendidos. Ex.: 0 a 7 = OPs que ainda não chegaram no almoxarifado de tecidos.</span>
        </div>
        ${blocoTabelaAP('ops', 'OPs A PROGRAMAR', tabelasAP.ops.cols, R.opsAProgramar, 'var(--cor-sugestao)')}`;
}

function htmlConsultaAP() {
    const c = estadoAP.consulta, cfg = configAP();
    if (c.ciclos === null) c.ciclos = cfg.ciclosPreferenciais;
    let res = '';
    if (c.pedido) {
        const r = MotorAnalisePedidos.consultarPedido(estadoAP.pedidos, estadoAP.ocupacao, c.pedido, c.ciclos, cfg);
        if (!r.encontrado) res = `<div class="ap-vazio">Pedido <strong>${escHtml(c.pedido)}</strong> não encontrado na BASE PEDIDOS.</div>`;
        else {
            registrarTabelaAP('cItens', [
                { t: 'Referência', v: r => r.ref }, { t: 'Descrição', v: r => r.desc }, { t: 'Produto', v: r => r.produto }, { t: 'Cor', v: r => r.cor }, { t: 'Tam', v: r => r.tam },
                { t: 'Pendente', v: r => r.pendente, f: 'n', num: 1 }, { t: 'Falta Estoque', v: r => r.falta, f: 'n', num: 1 }, { t: 'Qt em OPs', v: r => r.emOPs, f: 'n', num: 1 },
                { t: 'Falta após OPs', v: r => r.faltaAposOPs, f: 'n', num: 1 }, { t: 'Status', v: r => r.status, h: r => pillAP(r.status) }, { t: 'Nº linhas OP', v: r => r.linhasOP, num: 1 }
            ], r.itens, 'Itens em falta ' + c.pedido);
            registrarTabelaAP('cOps', [
                { t: 'Referência', v: r => r.ref }, { t: 'Cor', v: r => r.cor }, { t: 'Tam', v: r => r.tam }, { t: 'Ciclo', v: r => r.ciclo }, { t: 'OP', v: r => r.op },
                { t: 'Situação OP', v: r => r.situacao }, { t: 'Qt OP Local', v: r => r.qtd, f: 'n', num: 1 }, { t: 'Local', v: r => r.local }, { t: 'Dias Local', v: r => r.diasLocal, f: 'n', num: 1 },
                { t: 'Entrada', v: r => r.entrada, f: 'data' }, { t: 'Produto (OP)', v: r => r.produto }, { t: 'Falta do item', v: r => r.faltaItem, f: 'n', num: 1 }
            ], r.ops, 'OPs pedido ' + c.pedido);
            registrarTabelaAP('cResumo', [
                { t: 'Ciclo', v: r => r.ciclo }, { t: 'OP', v: r => r.op }, { t: 'Situação OP', v: r => r.situacao }, { t: 'Peças úteis p/ pedido', v: r => r.pecas, f: 'n', num: 1 }, { t: 'Linhas atendidas', v: r => r.itens, num: 1 }
            ], r.resumo, 'Resumo OPs ' + c.pedido);
            res = `<div class="ap-cartoes">
                    ${cartaoAP('CLIENTE', `<span style="font-size:16px;">${escHtml(r.cliente)}</span>`, escHtml(r.situacao), 'var(--cor-fila)')}
                    ${cartaoAP('PEÇAS EM FALTA', fmtNAP(r.pecasFalta), 'itens com falta de estoque', 'var(--cor-alerta)')}
                    ${cartaoAP('PEÇAS COBERTAS POR OP', fmtNAP(r.pecasCobertas), fmtPctAP(r.cobertura) + ' de cobertura', 'var(--cor-despacho)')}
                    ${cartaoAP('ITENS QUE FECHAM', `${fmtNAP(r.itensFecham)} / ${fmtNAP(r.itensTotal)}`, 'com as OPs existentes', 'var(--cor-roxo)')}
                </div>
                <p class="ap-nota">A consulta mostra <strong>todas</strong> as OPs com a mesma referência/cor/tamanho, sem descontar o que já foi para pedidos mais atrasados — para a cobertura real (sem contar a mesma peça duas vezes), veja a ALOCAÇÃO.</p>
                ${r.itens.length ? blocoTabelaAP('cItens', 'ITENS DO PEDIDO COM FALTA DE ESTOQUE', tabelasAP.cItens.cols, r.itens, 'var(--cor-alerta)') : '<div class="ap-vazio">Esse pedido não tem item com falta de estoque.</div>'}
                ${r.ops.length ? blocoTabelaAP('cOps', 'OPs QUE ATENDEM OS ITENS EM FALTA', tabelasAP.cOps.cols, r.ops, 'var(--cor-fila)') : ''}
                ${r.resumo.length ? blocoTabelaAP('cResumo', 'RESUMO POR OP', tabelasAP.cResumo.cols, r.resumo, 'var(--cor-historico)') : ''}`;
        }
    }
    return `<div class="ap-filtros">
            <label>PEDIDO <input type="text" id="apConsultaPedido" value="${escHtml(c.pedido)}" placeholder="nº do pedido" style="width:130px;"></label>
            <label>CICLOS PREFERENCIAIS <input type="text" id="apConsultaCiclos" value="${escHtml(c.ciclos)}" style="width:120px;" title="Separados por espaço — o primeiro tem prioridade"></label>
            <button class="btn btn-acao" id="apBtnConsultar"><i class="fas fa-magnifying-glass"></i> CONSULTAR</button>
        </div>${res}`;
}

// ---------- configuração ----------
function htmlConfigAP() {
    const c = obterConfigAnalisePedidos(), semEtapa = estadoAP.resultado ? estadoAP.resultado.locaisSemEtapa : [];
    const linhaEtapa = ([loc, pos], i) => `<tr><td><input type="text" class="ap-et-local" value="${escHtml(loc)}" style="width:100%;"></td>
        <td><select class="ap-et-pos">${MotorAnalisePedidos.NOMES_POSICAO.map((n, p) => `<option value="${p}"${Number(pos) === p ? ' selected' : ''}>${p} — ${escHtml(n)}</option>`).join('')}</select></td>
        <td><button class="btn ap-et-remover" title="Remover"><i class="fas fa-trash"></i></button></td></tr>`;
    return `<div class="ap-config">
        <div class="ap-config-grade">
            <fieldset><legend>Alocação</legend>
                <label>Ciclos preferenciais <input type="text" id="apCfgCiclosPref" value="${escHtml(c.ciclosPreferenciais)}"><small>separados por espaço — o primeiro tem prioridade</small></label>
                <label class="ap-check"><input type="checkbox" id="apCfgBloq"${c.incluirBloqueados ? ' checked' : ''}><span>Incluir pedidos <strong>Bloqueados</strong> na fila</span></label>
                <label class="ap-check"><input type="checkbox" id="apCfgCor"${c.considerarCor ? ' checked' : ''}><span>Considerar a <strong>COR</strong> <small>(desligado = casa só Referência + Tamanho)</small></span></label>
                <label>Ciclos EXCLUÍDOS (qualquer empresa) <input type="text" id="apCfgCiclosExc" value="${escHtml(c.ciclosExcluidos)}"></label>
            </fieldset>
            <fieldset><legend>OPs não alocáveis (ciclo + local)</legend>
                <label>Ciclos <input type="text" id="apCfgNACiclos" value="${escHtml(c.naoAlocaveisCicloLocal.ciclos)}"></label>
                <label>Locais <textarea id="apCfgNALocais" rows="5">${escHtml((c.naoAlocaveisCicloLocal.locais || []).filter(Boolean).join('\n'))}</textarea><small>um por linha — as duas condições juntas</small></label>
            </fieldset>
            <fieldset><legend>OPs não alocáveis (empresa + ciclo)</legend>
                <label>Empresa <input type="text" id="apCfgNEEmpresa" value="${escHtml(c.naoAlocaveisEmpresaCiclo.empresa)}"></label>
                <label>Ciclos <input type="text" id="apCfgNECiclos" value="${escHtml(c.naoAlocaveisEmpresaCiclo.ciclos)}"></label>
            </fieldset>
            <fieldset><legend>Locais prioritários</legend>
                <label>Valem para os ciclos <input type="text" id="apCfgLPCiclos" value="${escHtml(c.locaisPrioritarios.ciclos)}"></label>
                <label>Locais <textarea id="apCfgLPLocais" rows="8">${escHtml((c.locaisPrioritarios.locais || []).filter(Boolean).join('\n'))}</textarea><small>um por linha — o de cima é usado primeiro</small></label>
            </fieldset>
            <fieldset><legend>Painel de atrasos</legend>
                <label>Atraso mínimo (dias) <input type="number" id="apCfgAtrasoMin" min="0" value="${escHtml(c.atrasoMinimo)}"></label>
                ${c.faixas.map((f, i) => `<label class="ap-faixa"><input type="text" class="ap-faixa-nome" value="${escHtml(f[0])}" aria-label="Nome da faixa ${i + 1}"><span>a partir de</span><input type="number" class="ap-faixa-de" value="${escHtml(f[1])}" min="0" aria-label="Dias da faixa ${i + 1}"><span>dias</span></label>`).join('')}
            </fieldset>
        </div>
        <fieldset><legend>Etapas do processo por local (0–19: quanto maior, mais perto de finalizar → a OP é gasta primeiro)</legend>
            ${semEtapa.length ? `<div class="ap-alerta">Locais da BASE OCUPAÇÃO sem etapa: ${semEtapa.map(l => `<button class="btn ap-et-add" data-local="${escHtml(l)}"><i class="fas fa-plus"></i> ${escHtml(l)}</button>`).join(' ')}</div>` : ''}
            <table class="tabela-dados" id="apTabEtapas"><thead><tr><th>Local (Descrição)</th><th>Posição</th><th></th></tr></thead><tbody>${c.etapas.map(linhaEtapa).join('')}</tbody></table>
            <button class="btn" id="apEtNova" style="margin-top:8px;"><i class="fas fa-plus"></i> NOVO LOCAL</button>
        </fieldset>
        <div class="ap-config-acoes">
            <button class="btn" id="apCfgPadrao"><i class="fas fa-rotate-left"></i> VOLTAR AO PADRÃO DA PLANILHA</button>
            <button class="btn btn-acao" id="apCfgSalvar"><i class="fas fa-floppy-disk"></i> SALVAR E RECALCULAR</button>
        </div></div>`;
}
function lerFormConfigAP() {
    const linhas = id => $(id).value.split('\n').map(s => s.trim()).filter(Boolean);
    const etapas = [...document.querySelectorAll('#apTabEtapas tbody tr')].map(tr => [tr.querySelector('.ap-et-local').value.trim(), Number(tr.querySelector('.ap-et-pos').value)]).filter(e => e[0]);
    const nomes = [...document.querySelectorAll('.ap-faixa-nome')].map(x => x.value.trim()), des = [...document.querySelectorAll('.ap-faixa-de')].map(x => Number(x.value) || 0);
    return {
        ciclosPreferenciais: $('apCfgCiclosPref').value.trim(), incluirBloqueados: $('apCfgBloq').checked, considerarCor: $('apCfgCor').checked,
        ciclosExcluidos: $('apCfgCiclosExc').value.trim(),
        naoAlocaveisCicloLocal: { ciclos: $('apCfgNACiclos').value.trim(), locais: linhas('apCfgNALocais') },
        naoAlocaveisEmpresaCiclo: { empresa: $('apCfgNEEmpresa').value.trim(), ciclos: $('apCfgNECiclos').value.trim() },
        locaisPrioritarios: { ciclos: $('apCfgLPCiclos').value.trim(), locais: linhas('apCfgLPLocais') },
        atrasoMinimo: Number($('apCfgAtrasoMin').value) || 0, faixas: nomes.map((n, i) => [n || `Faixa ${i + 1}`, des[i]]), etapas
    };
}

// ---------- eventos (delegados: a tela é redesenhada a cada mudança) ----------
function ligarEventosAnalisePedidos() {
    const raiz = $('aba-analise-pedidos'); if (!raiz) return;
    $('inputAnalisePedidos').addEventListener('change', e => importarAnalisePedidos(e.target));
    raiz.addEventListener('click', e => {
        const nav = e.target.closest('.ap-nav button');
        if (nav) { estadoAP.visao = nav.dataset.visao; renderizarAnalisePedidos(); return; }
        const ir = e.target.closest('[data-ir-visao]'); if (ir) { e.preventDefault(); estadoAP.visao = ir.dataset.irVisao; renderizarAnalisePedidos(); return; }
        const lp = e.target.closest('.ap-link-pedido');
        if (lp) { e.preventDefault(); estadoAP.consulta.pedido = lp.dataset.pedido; estadoAP.visao = 'consulta'; renderizarAnalisePedidos(); window.scrollTo({ top: 0 }); return; }
        const xl = e.target.closest('.ap-excel'); if (xl) { baixarExcelTabelaAP(xl.dataset.tabela); return; }
        if (e.target.closest('#apBtnPublicar')) { if (exigirAdmin('publicar a análise de pedidos')) publicarAnalisePedidosAP('tudo'); return; }
        if (e.target.closest('#apBtnConsultar')) { estadoAP.consulta.pedido = $('apConsultaPedido').value.trim(); estadoAP.consulta.ciclos = $('apConsultaCiclos').value; renderizarAnalisePedidos(); return; }
        const rem = e.target.closest('.ap-et-remover'); if (rem) { rem.closest('tr').remove(); return; }
        const add = e.target.closest('.ap-et-add');
        if (add || e.target.closest('#apEtNova')) {
            const tb = document.querySelector('#apTabEtapas tbody'); const tmp = document.createElement('tbody');
            tmp.innerHTML = `<tr><td><input type="text" class="ap-et-local" value="${escHtml(add ? add.dataset.local : '')}" style="width:100%;"></td><td><select class="ap-et-pos">${MotorAnalisePedidos.NOMES_POSICAO.map((n, p) => `<option value="${p}">${p} — ${escHtml(n)}</option>`).join('')}</select></td><td><button class="btn ap-et-remover"><i class="fas fa-trash"></i></button></td></tr>`;
            tb.prepend(tmp.firstElementChild); if (add) add.remove(); tb.querySelector('.ap-et-pos').focus(); return;
        }
        if (e.target.closest('#apCfgSalvar')) {
            if (!exigirAdmin('mudar a configuração da análise de pedidos')) return;
            salvarConfigAnalisePedidos(lerFormConfigAP()); recalcularAnalisePedidos(); renderizarAnalisePedidos();
            showToast('<i class="fas fa-check"></i> Configuração salva — análise recalculada.');
            if (estadoAP.pedidos && estadoAP.ocupacao) publicarAnalisePedidosAP(estadoAP.meta.publicadoEm ? 'config' : 'tudo');
            return;
        }
        if (e.target.closest('#apCfgPadrao')) {
            if (!exigirAdmin('mudar a configuração da análise de pedidos')) return;
            if (!confirm('Voltar toda a configuração ao padrão da planilha?')) return;
            localStorage.removeItem('configAnalisePedidos'); recalcularAnalisePedidos(); renderizarAnalisePedidos();
            if (estadoAP.pedidos && estadoAP.ocupacao) publicarAnalisePedidosAP(estadoAP.meta.publicadoEm ? 'config' : 'tudo');
            return;
        }
    });
    const redesenhar = debounce(id => desenharTabelaAP(id), 200);
    raiz.addEventListener('input', e => { if (e.target.classList.contains('ap-busca')) { estadoAP.busca[e.target.dataset.tabela] = e.target.value; redesenhar(e.target.dataset.tabela); } });
    raiz.addEventListener('change', e => {
        if (e.target.id === 'apPosDe' || e.target.id === 'apPosAte') {
            estadoAP.posDe = Number($('apPosDe').value); estadoAP.posAte = Number($('apPosAte').value);
            recalcularAnalisePedidos(); renderizarAnalisePedidos();
        }
    });
    raiz.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.target.id === 'apConsultaPedido' || e.target.id === 'apConsultaCiclos')) $('apBtnConsultar').click(); });
}
