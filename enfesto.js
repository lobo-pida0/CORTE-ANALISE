// =========================================================================
// 🏭 MÁQUINAS DE ENFESTO — sub-aba da Programação
// Decisão de reunião: Máquina 1 = peças inferiores + blazer e paletó;
// Máquina 2 = peças superiores (jaqueta, camisa, blusa), menos blazer/paletó.
// A regra é POR PRODUTO e pode ser editada na própria tela (DEFINIR PRODUTOS),
// porque a reunião não cobriu tudo (jaleco, camiseta, colete, avental, túnica,
// parka... ~23% das OPs) e a decisão pode mudar. Só guarda o que o usuário
// MUDOU em relação ao padrão (localStorage 'maquinasEnfestoMapa').
// Valores: '1' | '2' | 'AMBAS' (qualquer uma) | 'SEM' (sem definição).
// A lista mostrada é a MESMA do Programar Lote (com os filtros de lá).
// =========================================================================
const MAQUINAS_ENFESTO_PADRAO = {
    CALCA: '1', BERMUDA: '1', SAIA: '1', BLAZER: '1', PALETO: '1',
    JAQUETA: '2', CAMISA: '2', BLUSA: '2',
    // Confirmados pelo usuário depois da reunião (todos peças superiores):
    COLETE: '2', JALECO: '2', CAMISETA: '2', VESTIDO: '2', TUNICA: '2', AVENTAL: '2', PARKA: '2', TURBANTE: '2',
};
let dadosProgramacaoVisiveis = [];     // atualizado a cada renderizarTudoImediato
let maquinaEnfestoSelecionada = '1';

function obterMapaMaquinasEnfesto() {
    try { return JSON.parse(localStorage.getItem('maquinasEnfestoMapa') || '{}'); } catch (e) { return {}; }
}
function salvarMapaMaquinasEnfesto(mapa) { localStorage.setItem('maquinasEnfestoMapa', JSON.stringify(mapa)); }

// Produto da OP, tirado da DESCRIÇÃO (sem acento, maiúsculas). A planilha tem 3
// formatos de descrição: "CORTE AVENTAL UNX ..." (a maioria), "SEMI - ACABADO
// CORTE AVENTAL UNX ..." (produto depois do CORTE) e "PRODUTO ACABADO CAMISA
// MASC ..." (produto depois do ACABADO). Qualquer outro formato usa a 1ª
// palavra. A palavra CORTE só conta no COMEÇO (ou depois do prefixo SEMI -
// ACABADO) — no meio da frase ("... COM CORTE A LASER") não é produto. Erro de
// célula do Excel ("#N/A") e descrição vazia não dão produto: aí usa a coluna de
// produto da Sincronização, se existir.
function chaveProdutoMaquina(op) {
    const sem = t => String(t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();
    const d = sem(op.desc);
    const m = d.match(/^(?:SEMI[\s-]*ACABADO[\s-]*)?CORTE\s+(\S+)/) || d.match(/^PRODUTO[\s-]*ACABADO[\s-]*(?:CORTE\s+)?(\S+)/);
    const palavra = m ? m[1] : (d.split(/\s+/)[0] || '');
    return (palavra && !palavra.startsWith('#')) ? palavra : sem(op.produto);
}
function maquinaDoProdutoEnfesto(chave, mapa) {
    if (!chave) return 'SEM';
    const m = mapa || obterMapaMaquinasEnfesto();
    if (Object.prototype.hasOwnProperty.call(m, chave)) return m[chave];
    return MAQUINAS_ENFESTO_PADRAO[chave] || 'SEM';
}

function abrirSubabaProgramacao(qual) {
    const maq = qual === 'maquinas';
    if ($('subaba-programar-lote')) $('subaba-programar-lote').style.display = maq ? 'none' : '';
    if ($('subaba-maquinas')) $('subaba-maquinas').style.display = maq ? '' : 'none';
    if ($('btnSubabaProgramarLote')) $('btnSubabaProgramarLote').classList.toggle('ativo', !maq);
    if ($('btnSubabaMaquinas')) $('btnSubabaMaquinas').classList.toggle('ativo', maq);
    if (maq) renderizarMaquinasEnfesto();
}
function selecionarMaquinaEnfesto(maquina) { maquinaEnfestoSelecionada = maquina; renderizarMaquinasEnfesto(); }

function renderizarMaquinasEnfesto() {
    if (!$('subaba-maquinas')) return;
    const esc = t => String(t ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    const mapa = obterMapaMaquinasEnfesto();
    const por = classificarOPsPorMaquinaEnfesto(dadosProgramacaoVisiveis, mapa);
    $('contMaquina1').textContent = por['1'].length; $('contMaquina2').textContent = por['2'].length; $('contMaquinaSem').textContent = por['SEM'].length;
    [['1', 'btnMaquina1'], ['2', 'btnMaquina2'], ['SEM', 'btnMaquinaSem']].forEach(([m, id]) => $(id).classList.toggle('ativo', maquinaEnfestoSelecionada === m));

    const sel = maquinaEnfestoSelecionada, ops = por[sel];
    const pecas = ops.reduce((a, o) => a + (Number(o.qtd) || 0), 0), minutos = ops.reduce((a, o) => a + (Number(o.tempoCorte) || 0), 0);
    $('tituloMaquinaEnfesto').textContent = sel === 'SEM' ? 'OPs SEM MÁQUINA DEFINIDA' : `OPs QUE CABEM NA MÁQUINA ${sel}`;
    $('contListaMaquinaEnfesto').textContent = `${ops.length} OPs · ${pecas.toLocaleString('pt-BR')} pçs · ${Math.round(minutos).toLocaleString('pt-BR')} min`;

    // Resumo: quais produtos essa máquina aceita (ou, em "sem definição", quais faltam decidir)
    if (sel === 'SEM') {
        const cont = new Map(); ops.forEach(o => { const k = chaveProdutoMaquina(o) || '(sem produto na descrição)'; cont.set(k, (cont.get(k) || 0) + 1); });
        const lista = [...cont.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${esc(k)} (${n})`).join(' · ');
        $('resumoMaquinaEnfesto').innerHTML = ops.length
            ? `<b>Produtos que ainda precisam de uma máquina:</b> ${lista}.<br>Clique em <b>DEFINIR PRODUTOS</b> pra escolher a máquina de cada um.`
            : 'Todos os produtos da lista já têm máquina definida.';
    } else {
        const chaves = new Set([...Object.keys(MAQUINAS_ENFESTO_PADRAO), ...Object.keys(mapa), ...bancoDadosOPs.map(chaveProdutoMaquina)]);
        const aceitos = [...chaves].filter(k => k && (() => { const v = maquinaDoProdutoEnfesto(k, mapa); return v === sel || v === 'AMBAS'; })()).sort((a, b) => a.localeCompare(b, 'pt-BR'));
        $('resumoMaquinaEnfesto').innerHTML = `<b>Máquina ${sel} aceita:</b> ${aceitos.map(k => `<span class="pill" style="background:var(--cor-sugestao);">${esc(k)}${maquinaDoProdutoEnfesto(k, mapa) === 'AMBAS' ? ' ✱' : ''}</span>`).join(' ') || '(nenhum produto)'}`
            + `<br><span style="font-size:11px;">${aceitos.some(k => maquinaDoProdutoEnfesto(k, mapa) === 'AMBAS') ? '✱ = aceito nas duas máquinas. ' : ''}Mostra as OPs da lista do Programar Lote, com os filtros de lá (Etapa, Local, Produto...).</span>`;
    }

    // A tabela só é desenhada com a sub-aba aberta
    if ($('subaba-maquinas').style.display === 'none') return;
    let loteAtual = null, html = '';
    ops.forEach((o, i) => {
        const mpOP = (o.codigoMP && o.codigoMP !== 'SEM CÓDIGO') ? o.codigoMP : 'SEM MP (LOTE MISTO)';
        if (mpOP !== loteAtual) {
            html += `<tr class="linha-lote-mp" style="background-color: var(--cor-sugestao); color: white;"><td colspan="12" style="text-align:left; font-weight:bold; padding:10px 15px;"><i class="fas fa-layer-group" style="margin-right:8px;"></i> LOTE MATÉRIA-PRIMA: ${esc(mpOP)} <span style="font-weight:normal; font-size:0.9em; opacity:0.9;"> - ${esc(o.descMP || 'Descrição não cadastrada')}</span></td></tr>`;
            loteAtual = mpOP;
        }
        const chave = chaveProdutoMaquina(o);
        const ambas = maquinaDoProdutoEnfesto(chave, mapa) === 'AMBAS';
        html += `<tr>
            <td><input type="checkbox" class="check-maquina-enfesto" data-id="${esc(o.id)}" ${selecaoMaquinaEnfesto.has(o.id) ? 'checked' : ''}></td>
            <td>${i + 1}º</td><td>${esc(o.ciclo)}</td><td><strong>${esc(o.id)}</strong></td>
            <td><span class="pill selo-etapa">${esc(nomesEtapas[o.etapa])}</span>${o.laser ? ' <span class="pill selo-laser"><i class="fas fa-bolt"></i> LASER</span>' : ''}</td>
            <td><span class="pill selo-produto">${esc(chave || '—')}</span>${ambas ? ' <small title="Aceito nas duas máquinas">✱</small>' : ''}</td>
            <td title="${esc(o.descMP)}"><span style="background:#eee; color:#333; padding:2px 6px; border-radius:4px; font-size:0.85em; font-weight:bold; cursor:help;">${esc(mpOP)}</span></td>
            <td>${esc(o.desc)}</td><td class="num" style="color:${(o.diasLocal || 0) >= 3 ? 'var(--cor-alerta)' : 'var(--texto-cor)'};">${o.diasLocal || 0}</td><td>${o.prioridade && o.mesDestino ? `<span class="pill selo-mes">${esc(o.mesDestino)}</span>` : '—'}</td><td class="num">${esc(o.qtd)}</td>
            <td>${o.dataCorte ? new Date(o.dataCorte).toLocaleDateString('pt-BR') : 'FIFO'}</td>
        </tr>`;
    });
    $('listaMaquinaEnfesto').innerHTML = ops.length ? html
        : `<tr><td colspan="12" class="tabela-vazia"><i class="fas fa-inbox tabela-vazia-icone"></i>${dadosProgramacaoVisiveis.length ? 'Nenhuma OP da lista cabe nessa opção.' : 'A lista do Programar Lote está vazia — ajuste os filtros de lá.'}</td></tr>`;
    atualizarSelecaoMaquinaEnfesto();
}

// Divide uma lista de OPs entre as máquinas (OP "qualquer uma" entra nas duas) — usada pela tela e pela exportação.
function classificarOPsPorMaquinaEnfesto(ops, mapa) {
    const por = { '1': [], '2': [], 'SEM': [] };
    ops.forEach(op => {
        const v = maquinaDoProdutoEnfesto(chaveProdutoMaquina(op), mapa);
        if (v === 'AMBAS') { por['1'].push(op); por['2'].push(op); } else por[v === '1' || v === '2' ? v : 'SEM'].push(op);
    });
    return por;
}

// Seleção de OPs na sub-aba (própria — não mexe na seleção do Programar Lote):
// marcar OPs só serve pra escolher o que vai no Excel; sem nenhuma marcada, o
// Excel leva a lista inteira da tela. Guardada em memória por número de OP.
let selecaoMaquinaEnfesto = new Set();
let ultimoIndiceMaquinaEnfesto = null;     // pra marcar um intervalo com Shift

function opsDaMaquinaAtualEnfesto() { return classificarOPsPorMaquinaEnfesto(dadosProgramacaoVisiveis)[maquinaEnfestoSelecionada] || []; }

function atualizarSelecaoMaquinaEnfesto() {
    const info = $('infoSelecaoMaquinaEnfesto'), topo = $('checkTudoMaquinaEnfesto');
    if (!info) return;
    const ops = opsDaMaquinaAtualEnfesto(), marcadas = ops.filter(o => selecaoMaquinaEnfesto.has(o.id));
    const pecas = marcadas.reduce((a, o) => a + (Number(o.qtd) || 0), 0), min = marcadas.reduce((a, o) => a + (Number(o.tempoCorte) || 0), 0);
    info.textContent = !ops.length ? ''
        : !marcadas.length ? `Nenhuma OP marcada — o Excel leva as ${ops.length} OPs da lista.`
        : `${marcadas.length} OP${marcadas.length > 1 ? 's' : ''} marcada${marcadas.length > 1 ? 's' : ''} · ${pecas.toLocaleString('pt-BR')} pçs · ${Math.round(min).toLocaleString('pt-BR')} min — o Excel leva só ${marcadas.length > 1 ? 'elas' : 'ela'}.`;
    if (topo) { topo.checked = ops.length > 0 && marcadas.length === ops.length; topo.indeterminate = marcadas.length > 0 && marcadas.length < ops.length; }
}

// Monta as linhas do Excel (separado da geração do arquivo, pra poder testar).
function montarExportacaoMaquinaEnfesto(ops, maquina) {
    const mapa = obterMapaMaquinasEnfesto();
    const comoNumero = v => { const t = String(v ?? '').trim(); return /^\d+$/.test(t) ? Number(t) : t; };
    const cabecalho = ['ORDEM', 'CICLO', 'OP', 'ETAPA', 'PRODUTO', 'MÁQUINA', 'MATÉRIA-PRIMA', 'DESCRIÇÃO DA MATÉRIA-PRIMA', 'DESCRIÇÃO', 'DUBLAGEM', 'TEMPO (min)', 'PEÇAS', 'DATA CORTE', 'LOCAL DESTINO', 'DIAS NO LOCAL', 'LASER'];
    let totalMin = 0, totalPecas = 0;
    const linhas = ops.map((o, i) => {
        const chave = chaveProdutoMaquina(o), v = maquinaDoProdutoEnfesto(chave, mapa);
        const tempo = Math.round((Number(o.tempoCorte) || 0) * 100) / 100, qtd = Number(o.qtd) || 0;
        totalMin += tempo; totalPecas += qtd;
        const d = o.dataCorte ? new Date(o.dataCorte) : null;
        const dataCorte = (d && !isNaN(d.getTime())) ? { t: 'n', v: Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000 + 25569, z: 'dd/mm/yyyy' } : 'FIFO';
        return [i + 1, comoNumero(o.ciclo), comoNumero(o.id), nomesEtapas[o.etapa] || '', chave || null,
            v === 'AMBAS' ? 'Qualquer uma' : (maquina === 'SEM' ? 'Sem definição' : `Máquina ${maquina}`),
            (o.codigoMP && o.codigoMP !== 'SEM CÓDIGO') ? o.codigoMP : 'SEM MP', o.descMP || null, o.desc || null,
            o.temDublado ? 'SIM' : 'NÃO', tempo, qtd, dataCorte, o.localDestino || null, Number(o.diasLocal) || 0, o.laser ? 'SIM' : null];
    });
    // linha em branco + totais no fim (fora do bloco de dados, pra não atrapalhar filtro/ordenação no Excel)
    const totais = [null, null, null, null, null, null, null, null, `TOTAL — ${ops.length} OP${ops.length > 1 ? 's' : ''}`, null, Math.round(totalMin * 100) / 100, totalPecas, null, null, null, null];
    return { cabecalho, linhas, totais };
}

function exportarMaquinaEnfestoExcel() {
    if (!exigirBibliotecaExcel()) return;
    const ops = opsDaMaquinaAtualEnfesto();
    if (!ops.length) return alert('Não há OPs nessa lista pra exportar.');
    const marcadas = ops.filter(o => selecaoMaquinaEnfesto.has(o.id));
    const aExportar = marcadas.length ? marcadas : ops;     // sem nenhuma marcada → leva a lista inteira
    const rotulo = maquinaEnfestoSelecionada === 'SEM' ? 'Sem definição' : `Máquina ${maquinaEnfestoSelecionada}`;
    const { cabecalho, linhas, totais } = montarExportacaoMaquinaEnfesto(aExportar, maquinaEnfestoSelecionada);

    const ws = XLSX.utils.aoa_to_sheet([cabecalho, ...linhas, [], totais]);
    ws['!cols'] = [7, 7, 8, 18, 14, 14, 13, 40, 52, 10, 12, 8, 12, 18, 14, 8].map(w => ({ wch: w }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, rotulo);
    const hoje = new Date(), dois = n => String(n).padStart(2, '0');
    const nomeMaquina = maquinaEnfestoSelecionada === 'SEM' ? 'Sem_definicao' : `Maquina_${maquinaEnfestoSelecionada}`;
    XLSX.writeFile(wb, `Enfesto_${nomeMaquina}${marcadas.length ? '_selecionadas' : ''}_${hoje.getFullYear()}-${dois(hoje.getMonth() + 1)}-${dois(hoje.getDate())}.xlsx`);
    showToast(`<i class="fas fa-file-excel"></i> ${aExportar.length} OP${aExportar.length > 1 ? 's' : ''} exportada${aExportar.length > 1 ? 's' : ''} (${rotulo})${marcadas.length ? ' — só as marcadas.' : '.'}`);
}

// Tela "DEFINIR PRODUTOS": uma linha por produto que existe nas OPs (os sem
// definição vêm primeiro), com a máquina de cada um.
function renderizarModalMaquinasEnfesto() {
    const esc = t => String(t ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    const mapa = obterMapaMaquinasEnfesto();
    const contagem = new Map();
    bancoDadosOPs.forEach(op => { const k = chaveProdutoMaquina(op); if (k) contagem.set(k, (contagem.get(k) || 0) + 1); });
    Object.keys(MAQUINAS_ENFESTO_PADRAO).forEach(k => { if (!contagem.has(k)) contagem.set(k, 0); });
    const linhas = [...contagem.entries()].map(([k, n]) => ({ k, n, v: maquinaDoProdutoEnfesto(k, mapa) }))
        .sort((a, b) => ((a.v === 'SEM') !== (b.v === 'SEM')) ? (a.v === 'SEM' ? -1 : 1) : (b.n - a.n) || a.k.localeCompare(b.k, 'pt-BR'));
    const opcoes = v => [['1', 'Máquina 1'], ['2', 'Máquina 2'], ['AMBAS', 'Qualquer uma'], ['SEM', 'Sem definição']].map(([val, rot]) => `<option value="${val}" ${v === val ? 'selected' : ''}>${rot}</option>`).join('');
    const semDef = linhas.filter(l => l.v === 'SEM').length;

    $('modalMaquinasEnfesto').innerHTML = `
        <div class="modal-card" style="width:560px; max-width:92vw; border-top:5px solid var(--cor-primaria); max-height:85vh;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; border-bottom:2px solid var(--borda-cor); padding-bottom:10px;">
                <h2 style="margin:0; color:var(--texto-cor); display:flex; align-items:center; gap:10px; font-size:16px;"><i class="fas fa-industry" style="color:var(--cor-primaria);"></i> MÁQUINA DE CADA PRODUTO</h2>
                <button onclick="fecharModais()" class="modal-fechar-btn"><i class="fas fa-times"></i></button>
            </div>
            <div style="font-size:12px; color:var(--texto-secundario); margin-bottom:12px;">
                Já vem com a regra da reunião (inferiores + blazer/paletó na Máquina 1; jaqueta, camisa e blusa na Máquina 2). O produto vem da descrição da OP (a palavra depois de CORTE). Mudou aqui, vale na hora.
                ${semDef ? `<br><b style="color:#E07B39;">${semDef} produto(s) ainda sem máquina.</b>` : ''}
            </div>
            <div style="overflow-y:auto; flex:1; margin-bottom:12px; border:1px solid var(--borda-cor); border-radius:8px;">
                <table class="tabela-dados" style="width:100%;">
                    <thead><tr><th>PRODUTO</th><th style="text-align:right;">OPs</th><th>MÁQUINA</th></tr></thead>
                    <tbody>${linhas.map(l => `<tr style="${l.v === 'SEM' ? 'background:rgba(224,123,57,0.12);' : ''}"><td><strong>${esc(l.k)}</strong></td><td style="text-align:right;">${l.n}</td><td><select data-chave="${esc(l.k)}" style="width:100%;">${opcoes(l.v)}</select></td></tr>`).join('')}</tbody>
                </table>
            </div>
            <div style="display:flex; justify-content:space-between; gap:10px;">
                <button id="btnRestaurarMaquinasPadrao" class="btn" style="background:var(--cor-historico); color:white;" title="Volta tudo pra regra que a reunião decidiu"><i class="fas fa-rotate-left"></i> RESTAURAR REGRA DA REUNIÃO</button>
                <button onclick="fecharModais()" class="btn btn-sugestao">FECHAR</button>
            </div>
        </div>`;
}

function definirMaquinaProdutoEnfesto(chave, valor) {
    const mapa = obterMapaMaquinasEnfesto();
    if (valor === (MAQUINAS_ENFESTO_PADRAO[chave] || 'SEM')) delete mapa[chave]; else mapa[chave] = valor; // só guarda o que difere do padrão
    salvarMapaMaquinasEnfesto(mapa);
    renderizarMaquinasEnfesto();
}

function renderizarTudoImediato() {
    const bCic = $('filtroCiclo').value.trim().toLowerCase(), bOP = $('filtroOP').value.trim().toLowerCase(), bMP = $('filtroMP').value.trim().toLowerCase();
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    let dDados = [], fDados = [];
    const pesoUrgenciaPorOP = new Map(); // id da OP -> peso de urgência (0=pedido urgente, 1=ATRASO, 1.5=pedido futuro, 2=FIFO, 3=PRAZO)
    const pedidoVinculadoPorOP = new Map(); // id da OP -> pedido pendente da mesma referência (se houver)

    // Agrupa os pedidos pendentes por referência, pra achar rápido se alguma OP
    // da Programação está ligada a uma necessidade real de cliente ainda em aberto.
    const pendentesPorReferencia = obterPendentesPorReferencia();

    // Ao buscar uma OP específica, expande o resultado pra mostrar junto
    // outras OPs da MESMA matéria-prima — mesmo que o número delas não bata
    // com o texto buscado. Ajuda a já visualizar o que "cabe" no mesmo corte.
    const condBase = o => locaisSelecionados.includes(o.localDestino) && (bCic === "" || o.ciclo.toLowerCase().includes(bCic)) && (bMP === "" || (o.codigoMP || '').toLowerCase().includes(bMP))
        && passaFiltroDataCorte(o)
        && passaFiltroMesDestino(o)
        && passaFiltroProduto(o);
    let filtrados;
    if (bOP !== "") {
        const localizadasPorTexto = bancoDadosOPs.filter(o => condBase(o) && o.id.toLowerCase().includes(bOP));
        const mpsEncontradas = new Set(localizadasPorTexto.map(o => o.codigoMP).filter(Boolean));
        filtrados = bancoDadosOPs.filter(o => condBase(o) && (o.id.toLowerCase().includes(bOP) || mpsEncontradas.has(o.codigoMP)));
    } else {
        filtrados = bancoDadosOPs.filter(condBase);
    }
    filtrados.sort((a, b) => (b.prioridade === true) - (a.prioridade === true));

    nomesEtapas.forEach((nome, idx) => {
        const opsE = filtrados.filter(o => o.etapa === idx);
        opsE.forEach(op => {
            let dM = null, mTxt = `${idx >= 7 ? "FIM" : (idx === 4 && !op.temDublado ? nomesEtapas[6] : nomesEtapas[idx + 1]).substring(0, 8)} (FIFO)`, sC = "pill-fifo", sT = "FIFO", p = 2;
            if (op.dataCorte) { dM = new Date(op.dataCorte); let passos = 0; for (let i = idx + 1; i <= 7; i++) { if (!etapaEhAplicavel(i, op)) continue; passos++; } dM.setDate(dM.getDate() - (passos * DIAS_POR_ETAPA_PADRAO)); mTxt = mTxt.split(' ')[0] + ` (${dM.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })})`; if (dM < hoje) { p = 1; sT = "ATRASO"; sC = "pill-atraso"; } else { p = 3; sT = "PRAZO"; sC = "pill-ok"; } }

            // Se essa OP é da mesma referência de um pedido ainda sem produção suficiente,
            // a urgência do pedido MANDA — substitui a estimativa interna (ATRASO/PRAZO),
            // porque reflete uma necessidade real de cliente, não uma projeção.
            const pendentesRef = op.referencia ? pendentesPorReferencia.get(op.referencia) : null;
            let pedidoVinculado = null;
            if (pendentesRef && pendentesRef.length) {
                pedidoVinculado = [...pendentesRef].sort(compararUrgenciaPedidos)[0];
                const especial = pedidoVinculado.prior !== 99;
                const dataChegada = pedidoVinculado.chegada ? new Date(pedidoVinculado.chegada) : null;
                const vencido = dataChegada && dataChegada < hoje;
                if (especial) { p = 0; sT = "PEDIDO URG."; sC = "pill-pedido"; }
                else if (vencido) { p = 1; sT = "PEDIDO ATRASADO"; sC = "pill-atraso"; }
                else { p = 1.5; sT = "PEDIDO"; sC = "pill-pedido"; }
                if (dataChegada) mTxt = dataChegada.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + " (cliente)";
                pedidoVinculadoPorOP.set(op.id, pedidoVinculado);
            }

            pesoUrgenciaPorOP.set(op.id, p);
            fDados.push({ op, metaTxt: mTxt, sTxt: sT, sCls: sC, peso: p, dMeta: dM });
            if (etapasSelecionadas.includes(idx)) dDados.push(op);
        });
    });

    // Ordenação das OPs: por data de inclusão, com as OPs de mesma matéria-prima
    // coladas (regra completa em ordenarProgramacaoPorInclusao). Estrela de
    // prioridade e vínculo com pedido não mexem mais na posição da OP.
    dDados = ordenarProgramacaoPorInclusao(dDados, ordemCorteAsc);
    dadosProgramacaoVisiveis = dDados; // a sub-aba Máquinas de Enfesto usa essa mesma lista

    if ($('setaOrdenacao')) $('setaOrdenacao').innerText = ordemCorteAsc ? "▲" : "▼";

    // Mapa referência -> quantidade de OPs no mesmo grupo do Agrupador (só
    // pra mostrar o selo nas linhas — o cálculo pesado já vem cacheado)
    const mapaTamanhoGrupoReferencia = new Map();
    calcularGruposPorReferencia().forEach(([ref, ops]) => mapaTamanhoGrupoReferencia.set(ref, ops.length));

    // =========================================================================
    // 🎨 RENDERIZAÇÃO DA TABELA COM AGRUPAMENTO DE LOTE (MATÉRIA-PRIMA + DESCRIÇÃO)
    // =========================================================================
    let htmlTabela = '';
    let loteAtual = null;

    dDados.forEach((o, i) => {
        // Valida e formata o código da Matéria Prima e a Descrição
        const mpOP = (o.codigoMP && o.codigoMP !== "SEM CÓDIGO") ? o.codigoMP : "SEM MP (LOTE MISTO)";
        const descTexto = " - " + (o.descMP || "Descrição não cadastrada");

        // Se a Matéria Prima mudou, desenha a BARRA DE DIVISÃO (Lote)
        if (mpOP !== loteAtual) {
            htmlTabela += `
                <tr class="linha-lote-mp" style="background-color: var(--cor-sugestao); color: white;">
                    <td colspan="14" style="text-align: left; font-weight: bold; padding: 10px 15px; border-radius: 4px;">
                        <i class="fas fa-layer-group" style="margin-right: 8px;"></i> LOTE MATÉRIA-PRIMA: ${mpOP} <span style="font-weight: normal; font-size: 0.9em; opacity: 0.9;">${descTexto}</span>
                    </td>
                </tr>
            `;
            loteAtual = mpOP;
        }

        // Desenha a linha normal da OP
        const emAtraso = pesoUrgenciaPorOP.get(o.id) === 1;
        const pedidoVinc = pedidoVinculadoPorOP.get(o.id);
        const tintaPedido = pedidoVinc ? (pedidoVinc.prior !== 99 ? 'background:rgba(107, 76, 122,0.12);' : 'background:rgba(107, 76, 122,0.06);') : '';
        const badgePedido = pedidoVinc
            ? `<span class="selo-icone" style="background:var(--cor-roxo);" title="Pedido ${pedidoVinc.pedido} de ${pedidoVinc.cliente} — falta ${pedidoVinc.faltaProduzir} pçs (tam ${pedidoVinc.tam})${pedidoVinc.chegada ? ' — chegada ' + new Date(pedidoVinc.chegada).toLocaleDateString('pt-BR') : ''}"><i class="fas fa-user-clock"></i></span>`
            : '';
        const entrouPorMP = bOP !== "" && !o.id.toLowerCase().includes(bOP);
        const badgeMP = entrouPorMP
            ? `<span class="selo-icone" style="background:var(--cor-sugestao);" title="Não bateu com a busca — apareceu por ser da mesma matéria-prima (${mpOP}) de uma OP buscada"><i class="fas fa-layer-group"></i></span>`
            : '';
        const grupoRef = mapaTamanhoGrupoReferencia.get(o.referencia);
        const badgeAgrupamento = grupoRef
            ? `<span class="selo-icone" style="background:var(--cor-historico); cursor:pointer;" title="Essa referência tem ${grupoRef} OPs entre Programação/Análise de Medidas/Aguard. Matéria Prima — clique pra ver o Agrupamento por Referência" onclick="event.stopPropagation(); abrirAgrupamentoReferencia();"><i class="fas fa-object-group"></i></span>`
            : '';
        htmlTabela += `
            <tr oncontextmenu="mostrarMenuContexto(event, '${o.id}')" style="${o.prioridade ? 'background:rgba(107, 76, 122,0.05);' : (tintaPedido || (emAtraso ? 'background:rgba(193, 68, 78,0.06);' : ''))}">
                <td>${o.prioridade ? '<i class="fas fa-star" style="color:var(--cor-selecao);"></i>' : '●'}</td>
                <td><input type="checkbox" class="check-lote" data-qtd="${o.qtd}" data-tempo="${o.tempoCorte}" data-id="${o.id}" data-mp="${mpOP}" ${selecaoLoteOPs.has(o.id) ? 'checked' : ''}></td>
                <td>${i + 1}º</td>
                <td>${o.ciclo}</td>
                <td><strong>${o.id}</strong>${badgePedido}${badgeMP}${badgeAgrupamento}</td>
                <td><span class="pill selo-etapa">${nomesEtapas[o.etapa]}</span>${o.laser ? ' <span class="pill selo-laser" title="Vai pra máquina de corte a laser"><i class="fas fa-bolt"></i> LASER</span>' : ''}</td>
                
                <td title="${o.descMP}"><span style="background: #eee; color: #333; padding: 2px 6px; border-radius: 4px; font-size: 0.85em; font-weight: bold; cursor: help;">${mpOP}</span></td>
                
                <td>${o.localDestino}</td>
                <td>${o.desc}</td>
                <td class="num" style="color:${(o.diasLocal || 0) >= 3 ? 'var(--cor-alerta)' : 'var(--texto-cor)'};">${o.diasLocal || 0}</td>
                <td>${o.prioridade && o.mesDestino ? `<span class="pill selo-mes">${o.mesDestino}</span>` : '—'}</td>
                <td class="num">${o.qtd}</td>
                <td>${o.dataCorte ? new Date(o.dataCorte).toLocaleDateString('pt-BR') : 'FIFO'}</td>
                <td>${o.dataCorteSuposta && formatarDataBR(o.dataCorteSuposta) ? `<span style="color:var(--cor-roxo);" title="Estimado a partir da finalização (${formatarDataBR(o.dataFinalizacao)})">${formatarDataBR(o.dataCorteSuposta)}</span>` : '—'}</td>
            </tr>
        `;
    });

    if ($('listaDespacho')) $('listaDespacho').innerHTML = dDados.length === 0
        ? `<tr><td colspan="14" class="tabela-vazia"><i class="fas fa-inbox tabela-vazia-icone"></i>Nenhuma OP encontrada com os filtros atuais.</td></tr>`
        : htmlTabela;
    // =========================================================================
    filaGeralDadosGlobais = fDados; renderizarTabelaFilaGeral();
    if ($('contDespacho')) $('contDespacho').innerText = dDados.length + " OPs";
    if ($('contTotal')) $('contTotal').innerText = filtrados.length + " OPs";
    $$('.check-lote').forEach(cb => cb.onclick = handleShiftClick);

    renderizarSidebarPrioridades();
    renderizarAbaPrioridades();
    renderizarMaquinasEnfesto();
    renderizarHistorico();
    calcularSomaLoteImediato();
    renderizarOPsVinculadas(pendentesPorReferencia);
    renderizarResumoGeral(pendentesPorReferencia);
}
const renderizarTudo = debounce(renderizarTudoImediato, 250);

// Lista separada (fora da tabela principal) de todas as OPs em produção que
// estão vinculadas a algum pedido pendente — independe dos filtros da tela
// de Programação, pra nunca esconder um vínculo por causa de um filtro ativo.
// null = ordena pela urgência de sempre (peso); 'asc'/'desc' = usuário clicou
// na coluna CHEGADA, ordena só por data
let ordenacaoOPsVinculadasData = null;

function ordenarOPsVinculadasPorData() {
    ordenacaoOPsVinculadasData = ordenacaoOPsVinculadasData === 'asc' ? 'desc' : 'asc';
    renderizarOPsVinculadas();
}

function renderizarOPsVinculadas(pendentesPorReferenciaParam) {
    if (!$('listaOPsVinculadas')) return;
    const pendentesPorReferencia = pendentesPorReferenciaParam || obterPendentesPorReferencia();
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const vinculadas = [];

    bancoDadosOPs.forEach(op => {
        if (!op.referencia) return;
        const pendentesRef = pendentesPorReferencia.get(op.referencia);
        if (!pendentesRef || !pendentesRef.length) return;
        const pedido = [...pendentesRef].sort(compararUrgenciaPedidos)[0];
        const especial = pedido.prior !== 99;
        const dataChegada = pedido.chegada ? new Date(pedido.chegada) : null;
        const vencido = dataChegada && dataChegada < hoje;
        const peso = especial ? 0 : (vencido ? 1 : 1.5);
        vinculadas.push({ op, pedido, peso, dataChegada, especial, vencido });
    });

    if ($('contOPsVinculadas')) $('contOPsVinculadas').innerText = vinculadas.length + " OPs";
    if ($('setaOPsVinculadas')) {
        $('setaOPsVinculadas').innerText = ordenacaoOPsVinculadasData === 'asc' ? '▲' : ordenacaoOPsVinculadasData === 'desc' ? '▼' : '';
    }

    if (vinculadas.length === 0) {
        $('listaOPsVinculadas').innerHTML = `<tr><td colspan="9" class="tabela-vazia"><i class="fas fa-link tabela-vazia-icone"></i>Nenhuma OP em produção está vinculada a um pedido pendente no momento.</td></tr>`;
        return;
    }

    if (ordenacaoOPsVinculadasData) {
        const mult = ordenacaoOPsVinculadasData === 'asc' ? 1 : -1;
        vinculadas.sort((a, b) => {
            if (!a.dataChegada && !b.dataChegada) return 0;
            if (!a.dataChegada) return 1;
            if (!b.dataChegada) return -1;
            return mult * (a.dataChegada - b.dataChegada);
        });
    } else {
        vinculadas.sort((a, b) => a.peso - b.peso || (a.dataChegada && b.dataChegada ? a.dataChegada - b.dataChegada : 0));
    }

    const grades = obterGradesPorOP();
    $('listaOPsVinculadas').innerHTML = vinculadas.map(v => {
        const marcador = v.especial
            ? `<span class="pill pill-pedido" title="Prioridade sinalizada no pedido: ${v.pedido.prior}">URG.</span>`
            : (v.vencido ? `<span class="pill pill-atraso">ATRASO</span>` : `<span class="pill pill-pedido">PEDIDO</span>`);

        // Confere se a grade DESSA OP realmente tem o tamanho que o pedido
        // pede — ter a referência não garante ter o tamanho certo.
        const gradeOP = buscarGrade(grades, v.op.id, v.op.ciclo);
        let avisoGrade = '';
        if (gradeOP && gradeOP.tamanhos) {
            const qtdTamanho = gradeOP.tamanhos[v.pedido.tam] || 0;
            avisoGrade = qtdTamanho > 0
                ? ` <i class="fas fa-check" style="color:var(--cor-despacho);" title="Grade confirma ${qtdTamanho} peças do tamanho ${v.pedido.tam} nessa OP"></i>`
                : ` <i class="fas fa-triangle-exclamation" style="color:var(--cor-alerta);" title="A grade dessa OP não tem o tamanho ${v.pedido.tam} — ela pode não estar cobrindo essa falta de verdade"></i>`;
        }

        return `<tr>
            <td>${marcador}</td>
            <td><strong>${v.op.id}</strong></td>
            <td>${v.op.referencia}</td>
            <td>${nomesEtapas[v.op.etapa] || '-'}</td>
            <td>${v.pedido.cliente}</td>
            <td>${v.pedido.pedido}</td>
            <td>${v.pedido.tam}${avisoGrade}</td>
            <td style="color:var(--cor-alerta); font-weight:bold;">${v.pedido.faltaProduzir}</td>
            <td>${v.dataChegada ? v.dataChegada.toLocaleDateString('pt-BR') : 'S/ DATA'}</td>
        </tr>`;
    }).join('');
}

