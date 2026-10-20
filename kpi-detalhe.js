// =========================================================================
// 🔎 DETALHE DO SETOR (clique no card do KPI) — dia a dia do mês escolhido, fábrica x externo, e as OPs de cada dia.
// Sempre mostra fábrica e externo juntos (separados em colunas), independente do seletor FÁBRICA/EXTERNO/JUNTOS.
// Só dias úteis (igual aos cards) — o que aconteceu em fim de semana aparece num aviso.
// =========================================================================

// Soma de peças/OPs por dia ÚTIL de um setor (só fábrica ou só externo), opcionalmente limitado ao mês e a um dia do mês.
function somarDiasUteisSetorKPI(setor, externo, anoMes, ateDia) {
    const classif = obterClassificacaoOficinasKPI();
    const porDia = {};
    Object.values(obterMovimentacoesPorSetorBruto()[setor] || {}).forEach(m => {
        if (!m.data || oficinaEhExternaKPI(m.of, classif) !== externo) return;
        const dia = new Date(m.data).toISOString().slice(0, 10);
        if (anoMes && dia.slice(0, 7) !== anoMes) return;
        if (ateDia && Number(dia.slice(8)) > ateDia) return;
        const dow = new Date(dia + 'T00:00:00Z').getUTCDay();
        if (dow === 0 || dow === 6) return;
        const d = porDia[dia] = porDia[dia] || { pecas: 0, ops: new Set() };
        d.pecas += m.qtd || 0; d.ops.add(idOPKPI(m));
    });
    const chaves = Object.keys(porDia), ops = new Set();
    let total = 0; chaves.forEach(k => { total += porDia[k].pecas; porDia[k].ops.forEach(o => ops.add(o)); });
    return { porDia, total, ops: ops.size, dias: chaves.length, media: chaves.length ? Math.round(total / chaves.length) : 0 };
}
function mesAnteriorKPI(anoMes) {
    const [a, m] = anoMes.split('-').map(Number);
    return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}`;
}
// Tempo que cada OP FICOU no setor: da saída do setor anterior da esteira (= entrada aqui) até a saída daqui, em DIAS ÚTEIS (seg-sex).
// No primeiro setor da esteira a entrada é a data de inclusão da OP. Usa a 1ª passagem de cada OP (ciclo+OP). Só conta saídas de FÁBRICA
// (OP que foi direto pro externo não "ficou" no setor). Só entram OPs que saíram do setor dentro do mês escolhido.
function diasUteisEntreKPI(inicioIso, fimIso) {
    let n = 0; const d = new Date(String(inicioIso).slice(0, 10) + 'T00:00:00Z'), fim = new Date(String(fimIso).slice(0, 10) + 'T00:00:00Z');
    while (d < fim) { d.setUTCDate(d.getUTCDate() + 1); const w = d.getUTCDay(); if (w !== 0 && w !== 6) n++; }
    return n;
}
function calcularTempoNoSetorKPI(setor, anoMes) {
    const todas = obterMovimentacoesPorSetorBruto();
    const classif = obterClassificacaoOficinasKPI();
    const idx = SETORES_KPI.indexOf(setor), anterior = idx > 0 ? SETORES_KPI[idx - 1] : null;
    const primeiraPorOP = (movs, soFabrica) => {
        const r = {};
        Object.values(movs || {}).forEach(m => {
            if (!m.data || (soFabrica && oficinaEhExternaKPI(m.of, classif))) return;
            const k = idOPKPI(m);
            if (!r[k] || m.data < r[k].data) r[k] = m;
        });
        return r;
    };
    const saidas = primeiraPorOP(todas[setor], true);
    const entradas = anterior ? primeiraPorOP(todas[anterior], false) : null;
    const itens = []; let semEntrada = 0;
    Object.entries(saidas).forEach(([k, m]) => {
        if (new Date(m.data).toISOString().slice(0, 7) !== anoMes) return;
        let entradaIso = null;
        if (entradas) { const e = entradas[k]; if (e && e.data <= m.data) entradaIso = e.data; }
        else { const op = acharOPNaSincronizacao(m.op, m.ciclo); if (op && op.dataInclusao) entradaIso = new Date(op.dataInclusao).toISOString(); }
        if (!entradaIso || entradaIso.slice(0, 10) > m.data.slice(0, 10)) { semEntrada++; return; }
        itens.push({ op: m.op, ciclo: m.ciclo || '', dias: diasUteisEntreKPI(entradaIso, m.data), entrada: entradaIso, saida: m.data, qtd: m.qtd || 0, desc: m.ds || (acharOPNaSincronizacao(m.op, m.ciclo) || {}).desc || '' });
    });
    const ord = itens.map(x => x.dias).sort((a, b) => a - b);
    const media = ord.length ? Math.round(ord.reduce((a, b) => a + b, 0) / ord.length * 10) / 10 : null;
    const mediana = ord.length ? (ord.length % 2 ? ord[(ord.length - 1) / 2] : (ord[ord.length / 2 - 1] + ord[ord.length / 2]) / 2) : null;
    return { itens, media, mediana, semEntrada, anterior };
}
function montarTempoNoSetorKPI(setor, anoMes) {
    const t = calcularTempoNoSetorKPI(setor, anoMes);
    const f1 = v => v === null ? '—' : String(v).replace('.', ',');
    const titulo = '<div style="font-size:11px; font-weight:700; color:var(--texto-secundario); text-transform:uppercase; margin-bottom:6px;">Tempo no setor <span style="font-weight:400; text-transform:none;">(da saída de ' + (t.anterior || 'inclusão da OP') + ' até a saída daqui, em dias úteis)</span></div>';
    if (!t.itens.length) return `<div style="margin-bottom:14px;">${titulo}<div style="font-size:12px; color:var(--texto-secundario); padding:8px 0;">Sem OPs com entrada e saída conhecidas nesse mês${t.semEntrada ? ` (${t.semEntrada} saíram daqui sem registro da entrada)` : ''}.</div></div>`;
    const lentas = [...t.itens].sort((a, b) => b.dias - a.dias).slice(0, 8);
    const fmtD = iso => formatarChaveDataBR(String(iso).slice(0, 10)).slice(0, 5);
    const linhas = lentas.map(x => `<tr><td style="white-space:nowrap;"><strong>${x.op}</strong>${x.ciclo ? ` <span style="font-size:11px; color:var(--texto-secundario);">· ciclo ${x.ciclo}</span>` : ''}</td>
        <td style="font-size:11px; color:var(--texto-secundario);">${String(x.desc).replace(/</g, '&lt;').slice(0, 46)}</td>
        <td style="font-size:11px; color:var(--texto-secundario);">${fmtD(x.entrada)} → ${fmtD(x.saida)}</td>
        <td style="text-align:right; ${x.dias >= 5 ? 'color:var(--cor-alerta); font-weight:700;' : ''}">${x.dias}d</td></tr>`).join('');
    return `<div style="margin-bottom:14px;">${titulo}
        <div style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:8px;">
            <div style="flex:1; min-width:130px; padding:8px 12px; background:var(--bg-card); border-radius:8px;"><div style="font-size:10px; color:var(--texto-secundario); text-transform:uppercase; font-weight:700;">Média</div><div style="font-size:20px; font-weight:900;">${f1(t.media)}<span style="font-size:11px; font-weight:400; color:var(--texto-secundario);"> dias</span></div></div>
            <div style="flex:1; min-width:130px; padding:8px 12px; background:var(--bg-card); border-radius:8px;"><div style="font-size:10px; color:var(--texto-secundario); text-transform:uppercase; font-weight:700;">Mediana</div><div style="font-size:20px; font-weight:900;">${f1(t.mediana)}<span style="font-size:11px; font-weight:400; color:var(--texto-secundario);"> dias</span></div></div>
            <div style="flex:1; min-width:130px; padding:8px 12px; background:var(--bg-card); border-radius:8px;"><div style="font-size:10px; color:var(--texto-secundario); text-transform:uppercase; font-weight:700;">OPs medidas</div><div style="font-size:20px; font-weight:900;">${t.itens.length}</div><div style="font-size:10px; color:var(--texto-secundario);">${t.semEntrada ? `${t.semEntrada} sem entrada registrada` : 'todas com entrada'}</div></div>
        </div>
        <details><summary style="cursor:pointer; font-size:12px; padding:4px 2px; color:var(--texto-secundario);">Ver as ${lentas.length} OPs mais lentas do mês</summary>
            <table class="tabela-dados" style="width:100%; margin-top:4px;"><thead><tr><th>OP</th><th>PRODUTO</th><th>ENTROU → SAIU</th><th style="text-align:right;">NO SETOR</th></tr></thead><tbody>${linhas}</tbody></table></details>
    </div>`;
}

// Bloco de comparação do detalhe do setor: última semana contra a anterior (só aparece se a semana anterior tem dados — o mês anterior
// normalmente já foi baixado e apagado, então não há comparação entre meses).
function montarComparacaoSetorKPI(setor, anoMes) {
    const fmt = v => v.toLocaleString('pt-BR');
    const variacao = (a, p, bomQuandoSobe = true) => {
        if (!p) return '<span style="color:var(--texto-secundario);">—</span>';
        const v = Math.round(((a - p) / p) * 100);
        if (v === 0) return '<span style="color:var(--texto-secundario);">＝ 0%</span>';
        const bom = (v > 0) === bomQuandoSobe;
        return `<strong style="color:${bomQuandoSobe === null ? 'var(--texto-secundario)' : (bom ? 'var(--cor-despacho)' : 'var(--cor-alerta)')};">${v > 0 ? '▲' : '▼'} ${Math.abs(v)}%</strong>`;
    };
    const linha = (rotulo, a, p, bomQuandoSobe, fmtVal) => `<tr><td>${rotulo}</td><td style="text-align:right;"><strong>${fmtVal ? fmtVal(a) : fmt(a)}</strong></td><td style="text-align:right; color:var(--texto-secundario);">${p ? (fmtVal ? fmtVal(p) : fmt(p)) : '—'}</td><td style="text-align:right;">${variacao(a, p, bomQuandoSobe)}</td></tr>`;
    // semana: a última semana (seg–sex) com movimento da fábrica dentro do mês escolhido contra a semana anterior (pode cair no mês anterior)
    const todosDias = somarDiasUteisSetorKPI(setor, false, null, null).porDia;
    const diasDoMes = Object.keys(todosDias).filter(d => d.slice(0, 7) === anoMes).sort();
    let semanaTxt = '';
    if (diasDoMes.length) {
        const ultimo = diasDoMes[diasDoMes.length - 1];
        const dt = new Date(ultimo + 'T00:00:00Z'); const segunda = new Date(dt.getTime() - ((dt.getUTCDay() + 6) % 7) * 86400000);
        const semana = ini => { const dias = [0, 1, 2, 3, 4].map(i => new Date(ini.getTime() + i * 86400000).toISOString().slice(0, 10)).filter(d => todosDias[d]); const tot = dias.reduce((x, d) => x + todosDias[d].pecas, 0); return { dias: dias.length, tot, media: dias.length ? Math.round(tot / dias.length) : 0 }; };
        const sA = semana(segunda), sP = semana(new Date(segunda.getTime() - 7 * 86400000));
        const rot = ini => { const f = new Date(ini.getTime() + 4 * 86400000); return `${String(ini.getUTCDate()).padStart(2, '0')}/${String(ini.getUTCMonth() + 1).padStart(2, '0')}–${String(f.getUTCDate()).padStart(2, '0')}/${String(f.getUTCMonth() + 1).padStart(2, '0')}`; };
        if (sP.dias) semanaTxt = `<table class="tabela-dados" style="width:100%;"><thead><tr><th>COMPARAÇÃO DE SEMANAS</th><th style="text-align:right;">SEMANA ${rot(segunda)} <span style="font-weight:400;">(${sA.dias} dia${sA.dias === 1 ? '' : 's'})</span></th><th style="text-align:right;">SEMANA ${rot(new Date(segunda.getTime() - 7 * 86400000))} <span style="font-weight:400;">(${sP.dias} dia${sP.dias === 1 ? '' : 's'})</span></th><th style="text-align:right;">VARIAÇÃO</th></tr></thead><tbody>
            ${linha('Média por dia (fábrica)', sA.media, sP.media, true)}</tbody></table>`;
    }
    return semanaTxt ? `<div style="margin-bottom:14px;">${semanaTxt}</div>` : '';
}


// Bloco "FILA AGORA" do detalhe do setor: as OPs que estão NESTA etapa neste momento (não depende do mês escolhido),
// com os mesmos números do Gargalo (dias de fila = peças na etapa ÷ ritmo do KPI), ordenadas por prioridade → pedido urgente → dias no local.
// Quadro "O que saiu": peças por grupo de produto no mês (calça, camisa, jaqueta...), com fábrica x externo.
function montarProdutosSetorKPI(porProduto, cor) {
    const fmt = v => v.toLocaleString('pt-BR');
    const lista = Object.entries(porProduto).map(([g, v]) => ({ g, ...v, total: v.fab + v.ext })).filter(x => x.total > 0).sort((a, b) => b.total - a.total);
    if (!lista.length) return '';
    const totalGeral = lista.reduce((a, x) => a + x.total, 0), maior = lista[0].total;
    const temExt = lista.some(x => x.ext > 0);
    const linhas = lista.map(x => `<tr>
        <td style="white-space:nowrap;"><strong>${x.g}</strong></td>
        <td style="width:34%;"><div style="display:flex; height:8px; border-radius:4px; overflow:hidden; background:var(--borda-cor); width:${Math.max(4, Math.round(x.total / maior * 100))}%;"><div style="width:${x.total ? x.fab / x.total * 100 : 0}%; background:${cor};"></div><div style="width:${x.total ? x.ext / x.total * 100 : 0}%; background:var(--cor-alerta);"></div></div></td>
        <td style="text-align:right;"><strong>${fmt(x.total)}</strong></td>
        <td style="text-align:right; color:var(--texto-secundario);">${Math.round(x.total / totalGeral * 100)}%</td>
        ${temExt ? `<td style="text-align:right; font-size:11px; color:${x.ext ? 'var(--cor-alerta)' : 'var(--texto-secundario)'};">${x.ext ? fmt(x.ext) : '—'}</td>` : ''}
        <td style="text-align:right; font-size:11px; color:var(--texto-secundario);">${x.ops.size}</td></tr>`).join('');
    return `<div style="margin-bottom:14px;"><div style="font-size:11px; font-weight:700; color:var(--texto-secundario); text-transform:uppercase; margin-bottom:6px;">O que saiu no mês <span style="font-weight:400; text-transform:none;">(peças por grupo de produto, dias úteis${temExt ? '; vermelho = externo' : ''})</span></div>
        <div style="max-height:240px; overflow-y:auto; border:1px solid var(--borda-cor); border-radius:8px;"><table class="tabela-dados" style="width:100%;"><thead><tr><th>PRODUTO</th><th></th><th style="text-align:right;">PEÇAS</th><th style="text-align:right;">%</th>${temExt ? '<th style="text-align:right;">EXTERNO</th>' : ''}<th style="text-align:right;">OPs</th></tr></thead><tbody>${linhas}</tbody></table></div></div>`;
}

function montarFilaSetorKPI(setor) {
    const fmt = v => v.toLocaleString('pt-BR');
    const idEtapa = Object.keys(SETOR_KPI_DA_ETAPA).find(k => SETOR_KPI_DA_ETAPA[k] === setor);
    if (idEtapa === undefined) return '';
    const st = (calcularRankingGargalo() || []).find(x => x.id === Number(idEtapa));
    const titulo = '<div style="font-size:11px; font-weight:700; color:var(--texto-secundario); text-transform:uppercase; margin-bottom:6px;">Fila agora <span style="font-weight:400; text-transform:none;">(OPs que estão nessa etapa neste momento)</span></div>';
    if (!st) return `<div style="margin-bottom:14px;">${titulo}<div style="font-size:12px; color:var(--texto-secundario); padding:8px 0;">Nenhuma OP na etapa ${nomesEtapas[idEtapa] || setor} agora (ou a planilha de Sincronização ainda não foi importada).</div></div>`;
    const corDaFila = d => d >= 3 ? 'var(--cor-alerta)' : (d >= 1.5 ? 'var(--cor-selecao)' : 'var(--cor-despacho)');
    const temFila = st.diasFila !== null;
    const ordenadas = [...st.ops].sort((a, b) => (opEstaNaAbaPrioridades(b.op.ciclo, b.op.id) ? 1 : 0) - (opEstaNaAbaPrioridades(a.op.ciclo, a.op.id) ? 1 : 0) || (b.urgente ? 1 : 0) - (a.urgente ? 1 : 0) || b.dias - a.dias);
    const linhas = ordenadas.map(o => {
        const x = o.op, prio = opEstaNaAbaPrioridades(x.ciclo, x.id);
        return `<tr><td style="white-space:nowrap;">${prio ? '<i class="fas fa-star" style="color:var(--cor-selecao); font-size:10px;" title="Está na aba Prioridades"></i> ' : ''}<strong>${x.id}</strong>${x.ciclo ? ' · ' + x.ciclo : ''}</td>
            <td style="max-width:260px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:11px; color:var(--texto-secundario);" title="${String(x.desc || '').replace(/"/g, '&quot;')}">${String(x.desc || '').replace(/</g, '&lt;')}</td>
            <td style="text-align:right;">${fmt(o.pecas)}</td>
            <td style="text-align:right; ${o.dias >= 3 ? 'color:var(--cor-alerta); font-weight:700;' : ''}">${o.dias}d</td>
            <td>${o.comPedido ? `<span class="pill" style="background:${o.urgente ? 'var(--cor-roxo)' : 'var(--cor-sugestao)'}; color:white;">${o.urgente ? 'PEDIDO URGENTE' : 'PEDIDO'}</span>` : ''}</td></tr>`;
    }).join('');
    const media = st.qtdOps ? (st.somaDias / st.qtdOps).toFixed(1).replace('.', ',') : '0';
    return `<div style="margin-bottom:14px;">${titulo}
        <div style="display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap; padding:10px 12px; background:var(--bg-card); border-radius:8px; border-left:4px solid ${temFila ? corDaFila(st.diasFila) : 'var(--borda-cor)'};">
            <div style="font-size:12px;"><strong>${st.qtdOps}</strong> OPs · <strong>${fmt(st.pcsFila)}</strong> pçs${st.pcsFila !== st.qtdPcs ? ' <span title="Enfesto e Corte contam por camada, igual ao KPI">(contando camadas)</span>' : ''}
                <div style="font-size:11px; color:var(--texto-secundario); margin-top:2px;">no local: máx <strong style="color:${st.maxDias >= 3 ? 'var(--cor-alerta)' : 'inherit'};">${st.maxDias}d</strong>, média ${media}d${st.opsCriticas ? ` · <span style="color:var(--cor-alerta); font-weight:700;">${st.opsCriticas} crítica${st.opsCriticas === 1 ? '' : 's'} (3+ dias)</span>` : ''}${st.opsComPedido ? ` · <span style="font-weight:700;">${st.opsComPedido} com pedido${st.opsComPedidoUrgente ? ` (${st.opsComPedidoUrgente} urgente${st.opsComPedidoUrgente === 1 ? '' : 's'})` : ''}</span>` : ''}</div>
                ${temFila ? `<div style="font-size:11px; color:var(--texto-secundario); margin-top:2px;">÷ ritmo de <strong>${fmt(Math.round(st.ritmo.media))}</strong> pçs/dia (últimos ${st.ritmo.dias} dias úteis, só fábrica)</div>` : '<div style="font-size:11px; color:var(--texto-secundario); margin-top:2px;">Sem ritmo do KPI pra calcular dias de fila.</div>'}</div>
            ${temFila ? `<div style="text-align:right;"><div style="font-size:24px; font-weight:900; line-height:1; color:${corDaFila(st.diasFila)};">${st.diasFila.toFixed(1).replace('.', ',')}</div><div style="font-size:10px; color:var(--texto-secundario);">dias de fila</div></div>` : ''}
        </div>
        <details style="margin-top:6px;"><summary style="cursor:pointer; font-size:12px; padding:6px 2px; color:var(--texto-secundario);">Ver as ${st.qtdOps} OPs na etapa (estrela = aba Prioridades)</summary>
            <div style="max-height:260px; overflow-y:auto; border-top:1px solid var(--borda-cor);"><table class="tabela-dados" style="width:100%;"><thead><tr><th>OP</th><th>DESCRIÇÃO</th><th style="text-align:right;">PEÇAS</th><th style="text-align:right;">NO LOCAL</th><th></th></tr></thead><tbody>${linhas}</tbody></table></div></details>
    </div>`;
}

function abrirDetalheSetorKPI(setor, anoMes) {
    anoMes = anoMes || ($('seletorMesKPI') ? $('seletorMesKPI').value : '');
    if (!anoMes) return;
    const classif = obterClassificacaoOficinasKPI();
    const movs = Object.values(obterMovimentacoesPorSetorBruto()[setor] || {}).filter(m => m.data && new Date(m.data).toISOString().slice(0, 7) === anoMes);
    const dias = {}; let fimDeSemana = 0;
    const porProduto = {};   // grupo de produto -> { fab, ext, ops }
    movs.forEach(m => {
        const dia = new Date(m.data).toISOString().slice(0, 10);
        const dow = new Date(dia + 'T00:00:00Z').getUTCDay();
        if (dow === 0 || dow === 6) { fimDeSemana += m.qtd || 0; return; }
        const d = dias[dia] = dias[dia] || { dow, fab: { pecas: 0, ops: new Set() }, ext: { pecas: 0, ops: new Set() }, lista: [] };
        const ext = oficinaEhExternaKPI(m.of, classif);
        const alvo = ext ? d.ext : d.fab;
        alvo.pecas += m.qtd || 0; alvo.ops.add(idOPKPI(m));
        const descProd = m.ds || (acharOPNaSincronizacao(m.op, m.ciclo) || {}).desc || '';
        const grupo = grupoProdutoKPI(descProd);
        const gp = porProduto[grupo] = porProduto[grupo] || { fab: 0, ext: 0, ops: new Set() };
        gp[ext ? 'ext' : 'fab'] += m.qtd || 0; gp.ops.add(idOPKPI(m));
        d.lista.push({ op: m.op, ciclo: m.ciclo, qtd: m.qtd || 0, ext, of: m.of || '', desc: descProd, grupo });
    });
    const chaves = Object.keys(dias).sort();
    const nomesDia = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
    const fmt = v => v.toLocaleString('pt-BR');
    const totFab = chaves.reduce((a, k) => a + dias[k].fab.pecas, 0), totExt = chaves.reduce((a, k) => a + dias[k].ext.pecas, 0);
    const opsFab = new Set(), opsExt = new Set();
    chaves.forEach(k => { dias[k].fab.ops.forEach(o => opsFab.add(o)); dias[k].ext.ops.forEach(o => opsExt.add(o)); });
    const diasFab = chaves.filter(k => dias[k].fab.pecas > 0);
    const media = diasFab.length ? Math.round(totFab / diasFab.length) : 0;   // média da FÁBRICA por dia com movimento (mesma ideia dos cards)
    const melhor = diasFab.reduce((a, k) => (!a || dias[k].fab.pecas > dias[a].fab.pecas) ? k : a, null);
    const pior = diasFab.reduce((a, k) => (!a || dias[k].fab.pecas < dias[a].fab.pecas) ? k : a, null);
    const total = totFab + totExt;
    const pctExt = total ? Math.round((totExt / total) * 100) : 0;
    const card = (t, v, sub, cor) => `<div style="flex:1; min-width:140px; padding:10px 12px; background:var(--bg-card); border-radius:8px; border-top:3px solid ${cor || 'var(--borda-cor)'};"><div style="font-size:10px; color:var(--texto-secundario); text-transform:uppercase; font-weight:700;">${t}</div><div style="font-size:20px; font-weight:900;">${v}</div><div style="font-size:10px; color:var(--texto-secundario);">${sub || ''}</div></div>`;
    const blocos = chaves.length ? chaves.map(k => {
        const d = dias[k];
        const pico = media && d.fab.pecas > media * 1.6;
        const marca = k === melhor && diasFab.length > 1 ? '<span class="pill" style="background:var(--cor-despacho); color:white; font-size:9px; padding:1px 6px; margin-left:6px;">MELHOR</span>' : (k === pior && diasFab.length > 1 ? '<span class="pill" style="background:var(--cor-alerta); color:white; font-size:9px; padding:1px 6px; margin-left:6px;">MENOR</span>' : '');
        const lista = d.lista.sort((a, b) => b.qtd - a.qtd).map(x => `<tr${x.ext ? ' style="background:rgba(193,68,78,.10);"' : ''}>
            <td><strong>${x.op}</strong>${x.ciclo ? ` <span style="color:var(--texto-secundario); font-size:11px;">· ciclo ${x.ciclo}</span>` : ''}</td>
            <td style="font-size:11px; color:var(--texto-secundario);">${String(x.desc).replace(/</g, '&lt;').slice(0, 60)}</td>
            <td style="text-align:right;">${fmt(x.qtd)}</td>
            <td>${x.ext ? `<span style="color:var(--cor-alerta); font-weight:700; font-size:11px;">EXTERNO</span> <span style="font-size:10px; color:var(--texto-secundario);">${String(x.of).replace(/</g, '&lt;')}</span>` : '<span style="font-size:11px; color:var(--texto-secundario);">fábrica</span>'}</td></tr>`).join('');
        return `<details style="border-bottom:1px solid var(--borda-cor);">
            <summary style="display:grid; grid-template-columns:150px 1fr 1fr 1fr; gap:8px; padding:8px 6px; cursor:pointer; font-size:12px; align-items:center; ${pico ? 'background:rgba(217,164,65,.14);' : ''}">
                <span><strong>${formatarChaveDataBR(k).slice(0, 5)}</strong> <span style="color:var(--texto-secundario);">${nomesDia[d.dow]}</span>${marca}</span>
                <span style="text-align:right;">${d.fab.pecas ? `<strong>${fmt(d.fab.pecas)}</strong> <span style="font-size:10px; color:var(--texto-secundario);">(${d.fab.ops.size} OP${d.fab.ops.size === 1 ? '' : 's'})</span>` : '—'}${pico ? ' <span title="Bem acima da média dos dias do mês" style="color:var(--cor-selecao);">▲</span>' : ''}</span>
                <span style="text-align:right; color:${d.ext.pecas ? 'var(--cor-alerta)' : 'var(--texto-secundario)'};">${d.ext.pecas ? `<strong>${fmt(d.ext.pecas)}</strong> <span style="font-size:10px;">(${d.ext.ops.size} OP${d.ext.ops.size === 1 ? '' : 's'})</span>` : '—'}</span>
                <span style="text-align:right; font-weight:700;">${fmt(d.fab.pecas + d.ext.pecas)}</span>
            </summary>
            <div style="padding:4px 6px 10px 20px;"><table class="tabela-dados" style="width:100%;"><thead><tr><th>OP</th><th>PRODUTO</th><th style="text-align:right;">PEÇAS</th><th>ORIGEM</th></tr></thead><tbody>${lista}</tbody></table></div>
        </details>`;
    }).join('') : '<div style="padding:20px; text-align:center; color:var(--texto-secundario);">Sem movimentação desse setor nesse mês.</div>';
    const cor = CORES_SETORES_KPI[setor] || '#999';
    const modal = $('modalDetalheSetorKPI');
    modal.innerHTML = `<div class="modal-card" style="width:820px; max-width:95vw; border-top:5px solid ${cor}; max-height:90vh;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; border-bottom:2px solid var(--borda-cor); padding-bottom:10px;">
            <h2 style="margin:0; color:var(--texto-cor); font-size:18px;">${setor} <span style="font-weight:400; font-size:13px; color:var(--texto-secundario);">— ${rotuloMesKPI(anoMes)}</span></h2>
            <button onclick="document.getElementById('modalDetalheSetorKPI').style.display='none'" class="modal-fechar-btn"><i class="fas fa-times"></i></button>
        </div>
        <div style="overflow-y:auto; flex:1; padding-right:4px;">
            <div style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:14px;">
                ${card('Fábrica no mês', fmt(totFab), `${fmt(opsFab.size)} OPs`, cor)}
                ${card('Externo no mês', fmt(totExt), `${fmt(opsExt.size)} OPs${total ? ` · ${pctExt}% do total` : ''}`, 'var(--cor-alerta)')}
                ${card('Média por dia (fábrica)', fmt(media), `${diasFab.length} dia(s) com movimento`)}
                ${card('Melhor / menor dia', melhor ? `${fmt(dias[melhor].fab.pecas)} / ${fmt(dias[pior].fab.pecas)}` : '—', melhor ? `${formatarChaveDataBR(melhor).slice(0, 5)} / ${formatarChaveDataBR(pior).slice(0, 5)}` : '')}
            </div>
            ${montarFilaSetorKPI(setor)}
            ${montarTempoNoSetorKPI(setor, anoMes)}
            ${montarProdutosSetorKPI(porProduto, cor)}
            ${montarComparacaoSetorKPI(setor, anoMes)}
            ${total ? `<div style="margin-bottom:14px;" title="Fábrica x externo"><div style="display:flex; justify-content:space-between; font-size:12px; font-weight:700; margin-bottom:4px;"><span style="color:${cor};">FÁBRICA ${100 - pctExt}% <span style="font-weight:400; font-size:11px; color:var(--texto-secundario);">(${fmt(totFab)} pçs)</span></span><span style="color:var(--cor-alerta);"><span style="font-weight:400; font-size:11px; color:var(--texto-secundario);">(${fmt(totExt)} pçs)</span> EXTERNO ${pctExt}%</span></div><div style="display:flex; height:10px; border-radius:5px; overflow:hidden;"><div style="width:${100 - pctExt}%; background:${cor};"></div><div style="width:${pctExt}%; background:var(--cor-alerta);"></div></div></div>` : ''}
            <div style="font-size:11px; color:var(--texto-secundario); margin-bottom:6px;">Clique num dia para ver as OPs que foram movimentadas. <span style="color:var(--cor-selecao);">▲</span> = dia bem acima da média. Linhas em vermelho são OPs de oficina externa.</div>
            <div style="display:grid; grid-template-columns:150px 1fr 1fr 1fr; gap:8px; padding:6px; font-size:10px; font-weight:700; text-transform:uppercase; color:var(--texto-secundario); border-bottom:2px solid var(--borda-cor);"><span>DIA</span><span style="text-align:right;">FÁBRICA</span><span style="text-align:right;">EXTERNO</span><span style="text-align:right;">TOTAL</span></div>
            ${blocos}
            ${fimDeSemana ? `<div style="font-size:11px; color:var(--texto-secundario); margin-top:10px;">Obs.: ${fmt(fimDeSemana)} peças foram movimentadas em fim de semana e não entram nessa conta (os cards também não contam).</div>` : ''}
        </div>
        <div style="display:flex; justify-content:flex-end; border-top:1px solid var(--borda-cor); padding-top:12px; margin-top:10px;"><button onclick="document.getElementById('modalDetalheSetorKPI').style.display='none'" class="btn" style="background:var(--borda-cor); color:var(--texto-cor);">FECHAR</button></div>
    </div>`;
    modal.style.display = 'flex';
}

// Cards com a média diária de cada SEMANA DO MÊS escolhido + lead time —
// um card por setor sendo mostrado no momento (1 se um setor específico, 7
// se "Todos").
function renderizarStatsKPI(setoresParaMostrar, mesSelecionado) {
    const el = $('statsKPI');
    if (!el) return;
    if (!mesSelecionado) { el.innerHTML = ''; return; }

    el.innerHTML = setoresParaMostrar.map(setor => {
        const todasSemanas = calcularMediaPorSemanaDoMes(setor, mesSelecionado);
        const semanas = todasSemanas.filter(s => s.diasComMovimento > 0); // esconde semana sem dado nenhum, em vez de repetir "0 peças/dia" várias vezes
        const lead = calcularLeadTimeSetor(setor);
        const totalMovimentado = semanas.reduce((acc, s) => acc + s.totalSemana, 0);
        const corSetor = CORES_SETORES_KPI[setor] || '#999';
        const maiorMedia = Math.max(1, ...semanas.map(x => x.mediaDiaria));
        const linhasSemanas = semanas.length
            ? semanas.map((s, i) => {
                // tendência: média/dia desta semana contra a semana anterior (com dado)
                const ant = i > 0 ? semanas[i - 1].mediaDiaria : null;
                const varia = (ant && ant > 0) ? Math.round(((s.mediaDiaria - ant) / ant) * 100) : null;
                const tendencia = varia === null ? '' : varia === 0
                    ? `<span style="font-size:10px; color:var(--texto-secundario);" title="Igual à semana anterior">＝ 0%</span>`
                    : `<span style="font-size:10px; font-weight:700; color:${varia > 0 ? 'var(--cor-despacho)' : 'var(--cor-alerta)'};" title="Média por dia comparada com a semana anterior">${varia > 0 ? '▲' : '▼'} ${Math.abs(varia)}%</span>`;
                const larg = Math.max(3, Math.round((s.mediaDiaria / maiorMedia) * 100));
                return `
            <div style="padding:6px 6px 6px 8px; margin:0 -6px; border-bottom:1px solid var(--borda-cor); ${s.ehSemanaAtual ? `background:rgba(217,164,65,0.14); border-left:3px solid var(--cor-selecao); border-radius:4px;` : 'border-left:3px solid transparent;'}">
                <div style="display:flex; justify-content:space-between; align-items:baseline; font-size:11px;">
                    <span style="color:var(--texto-secundario);">${s.rotulo}${s.ehSemanaAtual ? ' <span class="pill" style="background:var(--cor-selecao); color:#1c1710; padding:1px 7px; font-size:9px; margin-left:4px;">SEMANA ATUAL</span>' : ''}</span>
                    <span style="text-align:right;">
                        <strong style="font-size:14px; font-variant-numeric:tabular-nums;">${s.mediaDiaria.toLocaleString('pt-BR')}<span style="font-size:10px; font-weight:400; color:var(--texto-secundario);"> peças/dia</span></strong>
                        <span style="font-size:10px; color:var(--texto-secundario); display:block; font-variant-numeric:tabular-nums;">${s.totalOPs.toLocaleString('pt-BR')} OP(s) · <b>${s.mediaOPsDia.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</b> OPs/dia ${tendencia}</span>
                    </span>
                </div>
                <div style="height:4px; border-radius:2px; background:var(--borda-cor); margin-top:5px;" title="Média por dia, comparada com a melhor semana do mês"><div style="height:100%; width:${larg}%; border-radius:2px; background:${corSetor};"></div></div>
            </div>`;
            }).join('')
            : `<div style="font-size:11px; color:var(--texto-secundario); padding:8px 0;">Sem dados importados pra esse mês ainda.</div>`;
        return `
        <div class="kpi-card" onclick="abrirDetalheSetorKPI('${setor}')" title="Clique para ver o detalhe do setor (dia a dia, OPs de cada dia, fábrica x externo)" style="flex:1; min-width:240px; border-top:4px solid ${CORES_SETORES_KPI[setor] || '#999'}; padding:14px; background:var(--bg-card); border-radius:8px; cursor:pointer;">
            <div style="font-weight:700; margin-bottom:8px; font-size:12px; display:flex; justify-content:space-between; align-items:center;"><span>${setor}</span><span style="font-size:10px; font-weight:600; color:var(--texto-secundario);">detalhes <i class="fas fa-chevron-right"></i></span></div>
            ${linhasSemanas}
            <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-top:8px;">
                <div>
                    <div style="font-size:11px; color:var(--texto-secundario);">Lead time médio</div>
                    <div style="font-size:18px; font-weight:900;">${lead.mediaLeadTime !== null ? lead.mediaLeadTime + ' dias' : '—'}</div>
                </div>
                <div style="text-align:right;">
                    <div style="font-size:11px; color:var(--texto-secundario);">Total no mês</div>
                    <div style="font-size:18px; font-weight:900;">${totalMovimentado.toLocaleString('pt-BR')}</div>
                </div>
            </div>
        </div>`;
    }).join('');
}

// =========================================================================
// 📥 BAIXAR MÊS DO KPI (Excel) — pra guardar um mês que acabou. Os dados
// brutos de movimentação ficam na nuvem, mas os números CALCULADOS em cima
// deles mudam com o tempo (principalmente o lead time, que depende da data
// de inclusão da OP — que só existe enquanto a OP ainda está na planilha de
// Sincronização). O arquivo congela o mês como ele está AGORA.
// =========================================================================

// Lead time só das OPs que CHEGARAM nesse setor dentro do mês (a primeira
// vez que chegaram, igual calcularLeadTimeSetor) — o do cartão da tela
// considera todos os meses juntos, então não serve pra "fechar" um mês.
function calcularLeadTimeSetorNoMes(setor, anoMes) {
    const movimentos = obterMovimentacoesPorSetor()[setor] || {};
    const primeiraChegadaPorOP = {};
    Object.values(movimentos).forEach(m => {
        if (!m.data) return;
        if (!primeiraChegadaPorOP[idOPKPI(m)] || m.data < primeiraChegadaPorOP[idOPKPI(m)]) primeiraChegadaPorOP[idOPKPI(m)] = m.data;
    });
    const opsPorId = new Map(); bancoDadosOPs.forEach(o => { opsPorId.set(chaveDaOP(o), o); if (!opsPorId.has(o.id)) opsPorId.set(o.id, o); });
    const leadTimes = [];
    let opsQueChegaramNoMes = 0;
    Object.entries(primeiraChegadaPorOP).forEach(([opId, dataChegada]) => {
        if (new Date(dataChegada).toISOString().slice(0, 7) !== anoMes) return;
        opsQueChegaramNoMes++;
        const op = opsPorId.get(opId);
        if (!op || !op.dataInclusao) return;
        const dias = Math.round((new Date(dataChegada) - new Date(op.dataInclusao)) / 86400000);
        if (dias >= 0) leadTimes.push(dias);
    });
    const media = leadTimes.length ? Math.round((leadTimes.reduce((a, b) => a + b, 0) / leadTimes.length) * 10) / 10 : null;
    return { mediaLeadTime: media, opsComDado: leadTimes.length, opsQueChegaramNoMes };
}

// Monta o conteúdo das abas do arquivo (listas de linhas) — separado da
// geração do arquivo em si pra poder ser testado sem navegador.
function montarPlanilhasMesKPI(anoMes) {
    const todas = obterMovimentacoesPorSetor();
    const juntos = modoVisaoKPI() === 'juntos';   // fábrica + externo: o arquivo separa/destaca o que é externo
    const classifX = obterClassificacaoOficinasKPI();
    const rotuloMes = rotuloMesKPI(anoMes);
    const nomesDia = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
    const diaDaSemana = chave => nomesDia[new Date(chave + 'T00:00:00Z').getUTCDay()]; // UTC de propósito (mesma armadilha de fuso de sempre)

    // Tudo do mês, por setor, uma única passada
    const porSetor = {};
    SETORES_KPI.forEach(setor => {
        porSetor[setor] = { dias: {}, opsUteis: new Set(), foraDoTotal: 0, movs: [], pecasExt: 0, produtos: {} };
        Object.values(todas[setor] || {}).forEach(m => {
            if (!m.data) return;
            const dia = new Date(m.data).toISOString().slice(0, 10);
            if (!dia.startsWith(anoMes)) return;
            const d = porSetor[setor];
            const ext = juntos && oficinaEhExternaKPI(m.of, classifX);
            const descProd = m.ds || (acharOPNaSincronizacao(m.op, m.ciclo) || {}).desc || '';
            const grupo = grupoProdutoKPI(descProd);
            d.movs.push({ dia, op: m.op, ciclo: m.ciclo || '', qtd: m.qtd, ext, of: m.of || '', grupo, desc: descProd });
            if (!d.dias[dia]) d.dias[dia] = { pecas: 0, ops: new Set(), pecasExt: 0 };
            d.dias[dia].pecas += m.qtd; d.dias[dia].ops.add(idOPKPI(m));
            if (ext) d.dias[dia].pecasExt += m.qtd;
            const dow = new Date(dia + 'T00:00:00Z').getUTCDay();
            if (dow === 0 || dow === 6) d.foraDoTotal += m.qtd; else {
                d.opsUteis.add(idOPKPI(m)); if (ext) d.pecasExt += m.qtd;
                const gp = d.produtos[grupo] = d.produtos[grupo] || { fab: 0, ext: 0, ops: new Set() };   // peças por grupo de produto (só dias úteis, igual ao total)
                gp[ext ? 'ext' : 'fab'] += m.qtd; gp.ops.add(idOPKPI(m));
            }
        });
    });

    // ---- RESUMO
    const resumo = [
        [`KPI — ${rotuloMes}`],
        [`Arquivo gerado em ${new Date().toLocaleString('pt-BR')}. Congela o mês como ele estava nesse momento.`],
        ['Total do mês, OPs e médias contam só dias úteis (segunda a sexta), igual aos cartões da tela. Movimento de fim de semana aparece numa coluna à parte e NÃO entra no total.'],
        ['Lead time = dias entre a inclusão da OP e a 1ª chegada dela no setor, só das OPs que chegaram no setor DENTRO desse mês. Só calcula pra OPs que ainda tinham a data de inclusão na Sincronização.'],
        [],
        ['SETOR', 'TOTAL DO MÊS (peças, dias úteis)', 'OPs DISTINTAS (dias úteis)', 'DIAS ÚTEIS COM MOVIMENTO', 'MÉDIA POR DIA COM MOVIMENTO', 'PEÇAS EM FIM DE SEMANA (fora do total)', 'LEAD TIME MÉDIO (dias)', 'OPs COM LEAD TIME CALCULADO', 'OPs QUE CHEGARAM NO SETOR NO MÊS', ...(juntos ? ['DESTES: FÁBRICA (peças)', 'DESTES: EXTERNO (peças)', '% EXTERNO'] : [])],
    ];
    const LIN_CAB_RESUMO = juntos ? 7 : 6;
    if (juntos) resumo.splice(4, 0, ['Visão FÁBRICA + EXTERNO: o total já soma os dois; o que é de oficina externa aparece em vermelho (colunas em RESUMO e DIA A DIA, linhas em MOVIMENTAÇÕES).']);
    const semanas = [['SETOR', 'SEMANA', 'TOTAL (peças)', 'OPs DISTINTAS', 'DIAS COM MOVIMENTO', 'MÉDIA POR DIA', 'MÉDIA DE OPs POR DIA']];
    SETORES_KPI.forEach(setor => {
        const sem = calcularMediaPorSemanaDoMes(setor, anoMes).filter(x => x.diasComMovimento > 0);
        const total = sem.reduce((a, x) => a + x.totalSemana, 0);
        const dias = sem.reduce((a, x) => a + x.diasComMovimento, 0);
        const lead = calcularLeadTimeSetorNoMes(setor, anoMes);
        resumo.push([setor, total, porSetor[setor].opsUteis.size, dias, dias ? Math.round(total / dias) : 0, porSetor[setor].foraDoTotal, lead.mediaLeadTime === null ? '' : lead.mediaLeadTime, lead.opsComDado, lead.opsQueChegaramNoMes, ...(juntos ? [total - porSetor[setor].pecasExt, porSetor[setor].pecasExt, total ? Math.round(porSetor[setor].pecasExt / total * 100) + '%' : ''] : [])]);
        sem.forEach(x => semanas.push([setor, x.rotulo, x.totalSemana, x.totalOPs, x.diasComMovimento, x.mediaDiaria, x.mediaOPsDia]));
    });

    // ---- DIA A DIA (uma coluna de peças e uma de OPs por setor)
    const todasDatas = [...new Set(SETORES_KPI.flatMap(s => Object.keys(porSetor[s].dias)))].sort();
    const diaADia = [['DATA', 'DIA DA SEMANA', ...SETORES_KPI.flatMap(s => juntos ? [`${s} — FÁBRICA (peças)`, `${s} — EXTERNO (peças)`, `${s} — TOTAL (peças)`, `${s} — OPs`] : [`${s} — PEÇAS`, `${s} — OPs`])]];
    todasDatas.forEach(dia => {
        diaADia.push([formatarChaveDataBR(dia), diaDaSemana(dia), ...SETORES_KPI.flatMap(s => {
            const d = porSetor[s].dias[dia];
            if (juntos) return d ? [d.pecas - d.pecasExt, d.pecasExt || '', d.pecas, d.ops.size] : ['', '', '', ''];
            return d ? [d.pecas, d.ops.size] : ['', ''];
        })]);
    });

    // ---- ACERTIVIDADE (só quantidades — sem porcentagem, de propósito)
    const acertividade = [['PAR (ORIGEM → DESTINO)', 'DIA', 'TOTAL QUE SAIU DA ORIGEM', 'BATERAM NO DESTINO NO PRÓXIMO DIA ÚTIL']];
    PARES_ADJACENTES_KPI.forEach(([origem, destino]) => {
        const dias = calcularAcertividadeSetores(origem, destino, anoMes);
        if (!dias.length) return;
        dias.forEach(d => acertividade.push([`${origem} → ${destino}`, formatarChaveDataBR(d.dia), d.totalOrigem, d.acertos]));
        acertividade.push([`${origem} → ${destino}`, 'TOTAL DO MÊS', dias.reduce((a, d) => a + d.totalOrigem, 0), dias.reduce((a, d) => a + d.acertos, 0)]);
    });

    // ---- MOVIMENTAÇÕES (os dados brutos do mês, linha a linha)
    const movimentacoes = [['SETOR', 'OP', 'CICLO', 'DATA', 'QTD (já com o multiplicador de camadas no Enfesto/Corte)', ...(juntos ? ['TIPO', 'OFICINA / DESTINO'] : []), 'GRUPO DE PRODUTO', 'DESCRIÇÃO DO PRODUTO']];
    let totalMovs = 0;
    SETORES_KPI.forEach(setor => {
        porSetor[setor].movs.sort((a, b) => a.dia.localeCompare(b.dia) || String(a.op).localeCompare(String(b.op), 'pt-BR', { numeric: true }))
            .forEach(m => { movimentacoes.push([setor, m.op, m.ciclo, formatarChaveDataBR(m.dia), m.qtd, ...(juntos ? [m.ext ? 'EXTERNO' : 'FÁBRICA', m.of || ''] : []), m.grupo, m.desc]); totalMovs++; });
    });

    // ---- PRODUTOS (o que saiu de cada setor, por grupo de produto — só dias úteis, igual ao total do mês)
    const produtos = [['SETOR', 'GRUPO DE PRODUTO', 'PEÇAS', '% DO SETOR', 'OPs DISTINTAS', ...(juntos ? ['FÁBRICA (peças)', 'EXTERNO (peças)'] : [])]];
    SETORES_KPI.forEach(setor => {
        const lista = Object.entries(porSetor[setor].produtos).map(([g, v]) => ({ g, ...v, total: v.fab + v.ext })).filter(x => x.total > 0).sort((a, b) => b.total - a.total);
        const totalSetor = lista.reduce((a, x) => a + x.total, 0);
        lista.forEach(x => produtos.push([setor, x.g, x.total, totalSetor ? Math.round(x.total / totalSetor * 100) + '%' : '', x.ops.size, ...(juntos ? [x.fab, x.ext || ''] : [])]));
        if (lista.length) produtos.push([setor, 'TOTAL DO SETOR', totalSetor, '100%', porSetor[setor].opsUteis.size, ...(juntos ? [lista.reduce((a, x) => a + x.fab, 0), lista.reduce((a, x) => a + x.ext, 0) || ''] : [])]);
    });

    const graficos = { datas: todasDatas, porSetor: {} };
    SETORES_KPI.forEach(setor => { graficos.porSetor[setor] = { pecas: todasDatas.map(d => (porSetor[setor].dias[d] || { pecas: 0 }).pecas), pecasExt: todasDatas.map(d => (porSetor[setor].dias[d] || { pecasExt: 0 }).pecasExt || 0), ops: todasDatas.map(d => porSetor[setor].dias[d] ? porSetor[setor].dias[d].ops.size : 0), temDado: Object.keys(porSetor[setor].dias).length > 0 }; });
    return { rotuloMes, resumo, semanas, diaADia, acertividade, movimentacoes, produtos, totalMovs, graficos, juntos, linCabResumo: LIN_CAB_RESUMO };
}

// Desenha um gráfico de linhas fora da tela e devolve o PNG (base64) — usado pra embutir no Excel.
function gerarPngGraficoKPI(titulo, labels, series, largura, altura) {
    const canvas = document.createElement('canvas');
    canvas.width = largura; canvas.height = altura;
    const fundoBranco = { id: 'fundoBrancoKPI', beforeDraw(chart) { const c = chart.ctx; c.save(); c.globalCompositeOperation = 'destination-over'; c.fillStyle = '#FFFFFF'; c.fillRect(0, 0, chart.width, chart.height); c.restore(); } };
    const g = new Chart(canvas, {
        type: 'line',
        plugins: [fundoBranco],
        data: { labels, datasets: series.map(se => ({ label: se.label, data: se.data, borderColor: se.cor, backgroundColor: se.cor, tension: 0.25, fill: false, borderWidth: 2, pointRadius: 2.5, borderDash: se.tracejado ? [6, 4] : [] })) },
        options: {
            responsive: false, animation: false, devicePixelRatio: 1, color: '#333',
            plugins: { legend: { display: series.length > 1 }, title: { display: true, text: titulo, font: { size: 15, weight: 'bold' } }, datalabels: { display: false } },
            scales: { y: { beginAtZero: true, title: { display: true, text: 'Peças' } } },
        },
    });
    const png = canvas.toDataURL('image/png').split(',')[1];
    g.destroy();
    return png;
}

// Baixa o mês em Excel. Com a biblioteca ExcelJS (carregada da internet) o arquivo já leva uma aba
// GRÁFICOS com um gráfico de todos os setores e um por setor; sem ela, baixa só as tabelas (como antes).
async function baixarMesKPIExcel() {
    if (!exigirBibliotecaExcel()) return;
    const anoMes = $('seletorMesKPI') ? $('seletorMesKPI').value : '';
    if (!anoMes) return alert('Escolha um mês no seletor MÊS antes de baixar.');
    const dados = montarPlanilhasMesKPI(anoMes);
    if (!dados.totalMovs) return alert(`Não há nenhuma movimentação importada em ${dados.rotuloMes}.`);

    const abas = [
        ['RESUMO', dados.resumo, [26, 20, 20, 18, 20, 22, 16, 18, 22, 20, 20, 12], dados.linCabResumo],
        ['SEMANAS', dados.semanas, [26, 26, 16, 16, 18, 16, 20], 1],
        ['DIA A DIA', dados.diaADia, [12, 14, ...SETORES_KPI.flatMap(() => dados.juntos ? [14, 14, 14, 8] : [14, 8])], 1],
        ['PRODUTOS', dados.produtos, [26, 26, 14, 12, 16, 16, 16], 1],
        ['ACERTIVIDADE', dados.acertividade, [52, 14, 24, 34], 1],
        ['MOVIMENTAÇÕES', dados.movimentacoes, [26, 10, 8, 12, 24, 12, 34, 22, 50], 1],
    ];

    if (typeof ExcelJS !== 'undefined' && typeof Chart !== 'undefined') {
        try {
            const wb = new ExcelJS.Workbook();
            const preencher = (nome, linhas, larguras, linhaCab) => {
                const ws = wb.addWorksheet(nome);
                linhas.forEach(l => ws.addRow(l));
                larguras.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
                const cab = ws.getRow(linhaCab); cab.font = { bold: true }; cab.alignment = { wrapText: true, vertical: 'middle' };
                cab.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8DFC8' } }; });
                if (linhaCab > 1) ws.getRow(1).font = { bold: true, size: 13 };
                // Visão fábrica + externo: tudo que é externo fica em vermelho
                if (dados.juntos) {
                    const vermelho = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8D7DA' } };
                    cab.eachCell(c => { if (/EXTERNO/.test(String(c.value || ''))) { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8A0A6' } }; c.font = { bold: true, color: { argb: 'FF8A1C26' } }; } });
                    if (nome === 'MOVIMENTAÇÕES') ws.eachRow((r, n) => { if (n > 1 && r.getCell(6).value === 'EXTERNO') { r.eachCell({ includeEmpty: true }, c => { c.fill = vermelho; c.font = { color: { argb: 'FF8A1C26' } }; }); } });
                    if (nome === 'DIA A DIA') { const extCols = linhas[0].map((t, i) => /EXTERNO/.test(String(t)) ? i + 1 : 0).filter(Boolean); ws.eachRow((r, n) => { if (n > 1) extCols.forEach(ci => { const c = r.getCell(ci); if (c.value) { c.fill = vermelho; c.font = { bold: true, color: { argb: 'FF8A1C26' } }; } }); }); }
                    if (nome === 'PRODUTOS') ws.eachRow((r, n) => { if (n > 1) { const c = r.getCell(7); if (c.value) { c.fill = vermelho; c.font = { bold: true, color: { argb: 'FF8A1C26' } }; } } });
                    if (nome === 'RESUMO') ws.eachRow((r, n) => { if (n > linhaCab) [11, 12].forEach(ci => { r.getCell(ci).fill = vermelho; }); });
                }
                return ws;
            };
            preencher(...abas[0]);
            // ---- aba GRÁFICOS
            const wsG = wb.addWorksheet('GRÁFICOS');
            const { datas, porSetor } = dados.graficos;
            const labels = datas.map(formatarChaveDataBR);
            const setoresComDado = SETORES_KPI.filter(st => porSetor[st].temDado);
            const COL = 64, LIN = 20;   // pixels de uma coluna/linha padrão do Excel
            let yAtual = 10;
            const colocar = (png, x, y, w, h) => { const id = wb.addImage({ base64: png, extension: 'png' }); wsG.addImage(id, { tl: { col: x / COL, row: y / LIN }, ext: { width: w, height: h } }); };
            wsG.getCell('A1').value = `Gráficos — ${dados.rotuloMes}`; wsG.getCell('A1').font = { bold: true, size: 14 };
            wsG.getCell('A2').value = 'Peças por dia, de cada setor. Congelado no momento em que o arquivo foi baixado.'; wsG.getCell('A2').font = { italic: true, color: { argb: 'FF666666' } };
            colocar(gerarPngGraficoKPI(`Todos os setores — ${dados.rotuloMes}`, labels, setoresComDado.map(st => ({ label: st, data: porSetor[st].pecas, cor: CORES_SETORES_KPI[st] || '#999' })), 1260, 400), 8, 4 * LIN, 1260, 400);
            yAtual = 4 * LIN + 400 + 20;
            setoresComDado.forEach((st, i) => {
                const col = i % 2, x = 8 + col * 640, y = yAtual + Math.floor(i / 2) * 310;
                colocar(gerarPngGraficoKPI(st, labels, dados.juntos ? [{ label: 'Fábrica', data: porSetor[st].pecas.map((v, k) => v - porSetor[st].pecasExt[k]), cor: CORES_SETORES_KPI[st] || '#999' }, { label: 'Externo', data: porSetor[st].pecasExt, cor: '#C1444E', tracejado: true }] : [{ label: st, data: porSetor[st].pecas, cor: CORES_SETORES_KPI[st] || '#999' }], 620, 300), x, y, 620, 300);
            });
            abas.slice(1).forEach(a => preencher(...a));
            const buf = await wb.xlsx.writeBuffer();
            const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
            const link = document.createElement('a'); link.href = url; link.download = `KPI_${anoMes}${({ externo: '_EXTERNO', juntos: '_FABRICA+EXTERNO' })[modoVisaoKPI()] || ''}.xlsx`;
            document.body.appendChild(link); link.click(); link.remove();
            setTimeout(() => URL.revokeObjectURL(url), 5000);
            showToast(`<i class="fas fa-file-excel"></i> KPI de ${dados.rotuloMes} baixado com gráficos (${dados.totalMovs.toLocaleString('pt-BR')} movimentações).`);
            return;
        } catch (e) {
            registrarLogDebug('error', ['[KPI] Falha ao gerar Excel com gráficos, baixando sem: ' + (e && e.message)]);
        }
    }

    const wb = XLSX.utils.book_new();
    abas.forEach(([nome, linhas, larguras]) => {
        const ws = XLSX.utils.aoa_to_sheet(linhas);
        ws['!cols'] = larguras.map(w => ({ wch: w }));
        XLSX.utils.book_append_sheet(wb, ws, nome);
    });
    XLSX.writeFile(wb, `KPI_${anoMes}${({ externo: '_EXTERNO', juntos: '_FABRICA+EXTERNO' })[modoVisaoKPI()] || ''}.xlsx`);
    showToast(`<i class="fas fa-file-excel"></i> KPI de ${dados.rotuloMes} baixado SEM gráficos (a biblioteca de gráficos para Excel não carregou — recarregue a página).`);
}

function salvarOpsDestinoAutomaticas(obj) {
    localStorage.setItem('opsDestinoAutomaticas', JSON.stringify(obj));
}

