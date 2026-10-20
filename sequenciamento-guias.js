// =========================================================================
// 📑 SUGESTÃO DE SEQUÊNCIA DE PRODUÇÃO — a partir de uma meta de peças, monta
// a lista de OPs (entre as vinculadas a pedidos pendentes) que juntas cobrem
// essa meta, na ordem de urgência já usada no resto do sistema. Quando a meta
// cai "no meio" de uma OP, inclui ela inteira em vez de cortar no meio.
// =========================================================================
function gerarSugestaoSequenciaPedidos() {
    const meta = parseInt($('metaPecasPedidos').value) || 0;
    if (meta <= 0) { alert("Informe uma quantidade de peças maior que zero."); return; }

    const pendentesPorReferencia = obterPendentesPorReferencia();
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const candidatas = [];
    bancoDadosOPs.forEach(op => {
        if (op.etapa !== 0) return; // só considera OPs ainda em PCP-Programação (outros setores já estão em andamento)
        if (!op.referencia) return;
        const pendentesRef = pendentesPorReferencia.get(op.referencia);
        if (!pendentesRef || !pendentesRef.length) return;
        const pedido = [...pendentesRef].sort(compararUrgenciaPedidos)[0];
        const especial = pedido.prior !== 99;
        const dataChegada = pedido.chegada ? new Date(pedido.chegada) : null;
        const vencido = dataChegada && dataChegada < hoje;
        const peso = especial ? 0 : (vencido ? 1 : 1.5);
        candidatas.push({ op, pedido, peso, dataChegada, tipo: 'pedido' });
    });
    candidatas.sort((a, b) => a.peso - b.peso || (a.dataChegada && b.dataChegada ? a.dataChegada - b.dataChegada : 0));

    let total = 0;
    const sequencia = [];
    const idsUsados = new Set();
    for (const c of candidatas) {
        if (total >= meta) break;
        total += c.op.qtd;
        sequencia.push(c);
        idsUsados.add(c.op.id);
    }

    // As OPs vinculadas a pedidos SEMPRE prevalecem e vêm primeiro na sequência.
    // Só se elas — todas juntas — não derem a quantidade pedida, completa com
    // outras OPs da mesma matéria-prima das que já entraram, pra aproveitar o
    // corte (menos troca de tecido) em vez de pegar qualquer OP aleatória.
    if (total < meta) {
        const mpsUsadas = [...new Set(sequencia.map(c => c.op.codigoMP).filter(Boolean))];
        for (const mp of mpsUsadas) {
            if (total >= meta) break;
            const opsMesmaMP = bancoDadosOPs
                .filter(o => o.etapa === 0 && o.codigoMP === mp && !idsUsados.has(o.id))
                .sort((a, b) => {
                    const dA = a.dataCorte ? new Date(a.dataCorte).getTime() : Infinity;
                    const dB = b.dataCorte ? new Date(b.dataCorte).getTime() : Infinity;
                    return dA - dB;
                });
            for (const op of opsMesmaMP) {
                if (total >= meta) break;
                total += op.qtd;
                sequencia.push({ op, pedido: null, peso: null, dataChegada: null, tipo: 'materia-prima', mpRef: mp });
                idsUsados.add(op.id);
            }
        }
    }

    exibirModalSequenciaPedidos(sequencia, total, meta);
}

function exibirModalSequenciaPedidos(sequencia, total, meta) {
    const qtdPedido = sequencia.filter(c => c.tipo === 'pedido').length;
    const qtdMP = sequencia.filter(c => c.tipo === 'materia-prima').length;

    const linhas = sequencia.map((c, i) => {
        const ehPedido = c.tipo === 'pedido';
        const badge = ehPedido
            ? `<span class="pill pill-pedido" style="background:${c.peso === 0 ? 'var(--cor-roxo)' : 'var(--cor-sugestao)'};">PEDIDO</span>`
            : `<span class="pill" style="background:var(--texto-secundario);" title="Mesma matéria-prima de outra OP da sequência (${c.mpRef}), usada pra completar a meta.">MP</span>`;
        return `
        <tr style="${!ehPedido ? 'background:rgba(0,0,0,0.02);' : ''}">
            <td style="font-weight:900; color:var(--cor-sugestao);">${i + 1}º</td>
            <td>${badge}</td>
            <td><strong>${c.op.id}</strong></td>
            <td>${c.op.referencia || '-'}</td>
            <td>${ehPedido ? c.pedido.cliente : '<em style="color:var(--texto-secundario);">complemento MP</em>'}</td>
            <td>${c.op.qtd}</td>
            <td>${formatarDataBR(c.dataChegada) || (ehPedido ? 'S/ DATA' : '-')}</td>
        </tr>
    `}).join('');

    const faltou = total < meta;
    const resumoTipos = qtdMP > 0 ? ` (${qtdPedido} de pedidos + ${qtdMP} de complemento por matéria-prima)` : '';

    $('modalSequenciaPedidos').innerHTML = `
        <div class="modal-card" style="width:640px; max-width:92vw; border-top:5px solid var(--cor-sugestao); max-height:88vh;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; border-bottom:2px solid var(--borda-cor); padding-bottom:10px;">
                <h2 style="margin:0; color:var(--texto-cor); display:flex; align-items:center; gap:10px; font-size:16px;">
                    <i class="fas fa-list-ol" style="color:var(--cor-sugestao);"></i> SEQUÊNCIA SUGERIDA DE PRODUÇÃO
                </h2>
                <button onclick="fecharModais()" class="modal-fechar-btn"><i class="fas fa-times"></i></button>
            </div>
            <div style="font-size:12px; margin-bottom:12px; padding:10px; border-radius:6px; background:${faltou ? 'rgba(193, 68, 78,0.1)' : 'rgba(76, 154, 106,0.1)'}; color:${faltou ? 'var(--cor-alerta)' : 'var(--cor-despacho)'}; font-weight:600;">
                ${sequencia.length} OP(s) reúnem <strong>${total} peças</strong> (meta: ${meta})${resumoTipos}${faltou ? ' — mesmo completando com matéria-prima, não foi possível reunir peças suficientes.' : ''}
            </div>
            <div style="overflow-y:auto; flex:1; margin-bottom:15px;">
                <table class="tabela-dados">
                    <thead><tr><th>ORDEM</th><th>TIPO</th><th>OP</th><th>REFERÊNCIA</th><th>CLIENTE</th><th>PEÇAS</th><th>CHEGADA</th></tr></thead>
                    <tbody>${linhas || '<tr><td colspan="7" style="text-align:center; padding:20px;">Nenhuma OP vinculada a pedidos pendentes encontrada.</td></tr>'}</tbody>
                </table>
            </div>
            <div style="display:flex; gap:10px;">
                <button onclick="copiarSequenciaPedidos()" class="btn btn-acao" style="flex:1;"><i class="fas fa-copy"></i> COPIAR LISTA</button>
                <button onclick="fecharModais()" class="btn" style="background:var(--bg-painel); color:var(--texto-cor);">FECHAR</button>
            </div>
        </div>
    `;
    ultimaSequenciaPedidosGerada = sequencia;
    $('modalSequenciaPedidos').style.display = 'flex';
}

function copiarSequenciaPedidos() {
    if (!ultimaSequenciaPedidosGerada || !ultimaSequenciaPedidosGerada.length) return;
    const texto = ultimaSequenciaPedidosGerada.map((c, i) => {
        if (c.tipo === 'pedido') {
            return `${i + 1}º - OP ${c.op.id} | ${c.op.referencia} | ${c.pedido.cliente} | ${c.op.qtd} pçs | chegada ${formatarDataBR(c.dataChegada) || 'S/ DATA'}`;
        }
        return `${i + 1}º - OP ${c.op.id} | ${c.op.referencia || 'S/ REF'} | complemento MP (${c.mpRef}) | ${c.op.qtd} pçs`;
    }).join('\n');
    navigator.clipboard.writeText(texto).then(() => showToast("<i class='fas fa-check'></i> Sequência copiada!"));
}

// =========================================================================
// 🔢 SEQUENCIAMENTO FIFO — sugere em que ordem tocar as OPs de um local,
// priorizando quem está parado há mais dias (Dias Local, já lido da Planilha
// A). Quando uma OP mais pra frente na fila é da MESMA matéria-prima de uma
// que já entrou antes, ela pula pra logo atrás da parceira — mesmo que não
// seja a vizinha imediata. Estrela manual sempre acima de tudo.
// =========================================================================
let ultimoSequenciamentoFifoGerado = [];
let ultimoAgrupamentoReferenciaGerado = [];

function abrirModalSequenciamentoFifo() {
    // Começa já na mesma etapa que está selecionada no "ETAPA ATUAL" do
    // montador, pra evitar o risco de gerar a sequência pro setor errado sem
    // perceber (o seletor aqui dentro é independente, mas o VALOR inicial é herdado).
    const etapaAtualMontador = etapasSelecionadas.length > 0 ? etapasSelecionadas[0] : 0;
    const opcoesEtapa = nomesEtapas.map((nome, i) => `<option value="${i}"${i === etapaAtualMontador ? ' selected' : ''}>${nome}</option>`).join('');
    $('modalSequenciamentoFifo').innerHTML = `
        <div class="modal-card" style="width:640px; max-width:92vw; border-top:5px solid var(--cor-sugestao); max-height:88vh;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; border-bottom:2px solid var(--borda-cor); padding-bottom:10px;">
                <h2 style="margin:0; color:var(--texto-cor); display:flex; align-items:center; gap:10px; font-size:16px;">
                    <i class="fas fa-sort-numeric-down" style="color:var(--cor-sugestao);"></i> SEQUENCIAMENTO FIFO
                </h2>
                <button onclick="fecharModais()" class="modal-fechar-btn"><i class="fas fa-times"></i></button>
            </div>
            <div style="display:flex; align-items:center; gap:var(--espaco-sm); margin-bottom:12px; flex-wrap:wrap;">
                <label style="font-size:11px; font-weight:700; color:var(--texto-secundario); text-transform:uppercase;">Local / Etapa</label>
                <select id="filtroEtapaSequenciamento" style="flex:1; min-width:180px;" onchange="gerarSequenciamentoFifo()">${opcoesEtapa}</select>
                <label style="font-size:11px; font-weight:700; color:var(--texto-secundario); text-transform:uppercase;">Ordenar por</label>
                <select id="modoOrdenacaoSequenciamento" style="min-width:150px;" onchange="gerarSequenciamentoFifo()">
                    <option value="diasParado"${modoOrdenacaoSequenciamentoFifo === 'diasParado' ? ' selected' : ''}>Dias parado</option>
                    <option value="dataCorte"${modoOrdenacaoSequenciamentoFifo === 'dataCorte' ? ' selected' : ''}>Data de corte</option>
                </select>
                <button id="btnGerarSequenciamentoFifo" class="btn btn-sugestao" onclick="gerarSequenciamentoFifo()"><i class="fas fa-play"></i> GERAR SEQUÊNCIA</button>
            </div>
            <div id="resultadoSequenciamentoFifo" style="overflow-y:auto; flex:1;">
                <div style="text-align:center; padding:30px; color:var(--texto-secundario); font-size:12px;">Escolha o local e clique em "Gerar sequência".</div>
            </div>
        </div>
    `;
    $('modalSequenciamentoFifo').style.display = 'flex';
    gerarSequenciamentoFifo(); // já mostra de cara, sem precisar clicar
}

// Ordena por dias parado (mais tempo primeiro) e depois agrupa em blocos por
// matéria-prima, preservando a ordem em que cada matéria-prima apareceu pela
// primeira vez — é isso que faz a "OP5" pular pra logo atrás da "OP1" quando
// as duas são da mesma matéria-prima, mesmo com OPs de outra MP no meio.
function ordenarPorFifoComAgrupamentoMP(lista) {
    const porDiasParado = [...lista].sort((a, b) => (b.diasLocal || 0) - (a.diasLocal || 0));
    const blocos = [];
    porDiasParado.forEach(op => {
        const mp = op.codigoMP || 'SEM-MP';
        let blocoAlvo = blocos.find(b => b.mp === mp);
        if (blocoAlvo) blocoAlvo.itens.push(op);
        else blocos.push({ mp, itens: [op] });
    });
    return blocos.flatMap(b => b.itens);
}

// Mesma ideia, só que ordenando por data de corte (mais cedo primeiro) em vez
// de dias parado. OP sem data (null, ou aquele "CT/CT/CT" que a planilha usa
// como vazio) conta como "sem data nenhuma": só entra na sequência cedo se
// bater a matéria-prima de alguma OP que TEM data — senão vai pro final.
function ordenarPorDataCorteComAgrupamentoMP(lista) {
    const valorData = op => { const d = op.dataCorte ? new Date(op.dataCorte).getTime() : NaN; return isNaN(d) ? Infinity : d; };
    const porData = [...lista].sort((a, b) => valorData(a) - valorData(b));
    const blocos = [];
    porData.forEach(op => {
        const mp = op.codigoMP || 'SEM-MP';
        let blocoAlvo = blocos.find(b => b.mp === mp);
        if (blocoAlvo) blocoAlvo.itens.push(op);
        else blocos.push({ mp, itens: [op] });
    });
    return blocos.flatMap(b => b.itens);
}

let modoOrdenacaoSequenciamentoFifo = 'diasParado'; // fica lembrado enquanto o sistema está aberto

function gerarSequenciamentoFifo() {
    const etapa = parseInt($('filtroEtapaSequenciamento').value);
    modoOrdenacaoSequenciamentoFifo = $('modoOrdenacaoSequenciamento') ? $('modoOrdenacaoSequenciamento').value : modoOrdenacaoSequenciamentoFifo;
    const ordenar = modoOrdenacaoSequenciamentoFifo === 'dataCorte' ? ordenarPorDataCorteComAgrupamentoMP : ordenarPorFifoComAgrupamentoMP;
    const candidatas = bancoDadosOPs.filter(op => op.etapa === etapa);

    const estrelas = ordenar(candidatas.filter(op => op.prioridade));
    const normais = ordenar(candidatas.filter(op => !op.prioridade));
    const sequencia = [...estrelas, ...normais];
    ultimoSequenciamentoFifoGerado = sequencia;

    const linhas = sequencia.map((op, i) => `
        <tr>
            <td style="font-weight:900; color:var(--cor-sugestao);">${i + 1}º</td>
            <td>${op.prioridade ? '<i class="fas fa-star" style="color:var(--cor-selecao);"></i>' : ''}</td>
            <td><strong>${op.id}</strong></td>
            <td>${op.ciclo}</td>
            <td><span style="background:var(--bg-painel); padding:2px 6px; border-radius:4px; font-size:0.85em; font-weight:bold;">${op.codigoMP || 'SEM-MP'}</span></td>
            <td style="text-align:right;">${op.qtd}</td>
            ${modoOrdenacaoSequenciamentoFifo === 'dataCorte'
                ? `<td>${formatarDataBR(op.dataCorte) || '<span style="color:var(--texto-secundario);">sem data</span>'}</td>`
                : `<td style="text-align:right; color:${(op.diasLocal || 0) >= 3 ? 'var(--cor-alerta)' : 'var(--texto-cor)'}; font-weight:bold;">${op.diasLocal || 0}</td>`}
        </tr>
    `).join('');

    const rotuloColuna = modoOrdenacaoSequenciamentoFifo === 'dataCorte' ? 'DT. CORTE' : 'DIAS PARADO';
    const explicacaoModo = modoOrdenacaoSequenciamentoFifo === 'dataCorte'
        ? 'ordenadas por data de corte, com matéria-prima repetida já agrupada (mesmo quando a data delas é mais pra frente).'
        : 'ordenadas por dias parado, com matéria-prima repetida já agrupada.';

    $('resultadoSequenciamentoFifo').innerHTML = sequencia.length === 0
        ? `<div class="tabela-vazia">Nenhuma OP encontrada em <strong>${nomesEtapas[etapa]}</strong>.</div>`
        : `
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:10px;">
            <span class="pill" style="background:var(--cor-sugestao); font-size:11px;">${nomesEtapas[etapa]}</span>
            <span style="font-size:11px; color:var(--texto-secundario);">${sequencia.length} OP(s) — ${explicacaoModo}</span>
        </div>
        <table class="tabela-dados">
            <thead><tr><th>ORDEM</th><th></th><th>OP</th><th>CICLO</th><th>MATÉRIA-PRIMA</th><th style="text-align:right;">PEÇAS</th><th>${rotuloColuna}</th></tr></thead>
            <tbody>${linhas}</tbody>
        </table>
        <button onclick="copiarSequenciamentoFifo()" class="btn btn-acao" style="margin-top:12px; width:100%;"><i class="fas fa-copy"></i> COPIAR LISTA</button>
        `;
}

function copiarSequenciamentoFifo() {
    if (!ultimoSequenciamentoFifoGerado || !ultimoSequenciamentoFifoGerado.length) return;
    const texto = ultimoSequenciamentoFifoGerado.map((op, i) => {
        const infoOrdenacao = modoOrdenacaoSequenciamentoFifo === 'dataCorte'
            ? `corte ${formatarDataBR(op.dataCorte) || 'sem data'}`
            : `${op.diasLocal || 0} dias parado`;
        return `${i + 1}º - OP ${op.id} | Ciclo ${op.ciclo} | MP ${op.codigoMP || 'SEM-MP'} | ${op.qtd} pçs | ${infoOrdenacao}${op.prioridade ? ' | ⭐ PRIORIDADE' : ''}`;
    }).join('\n');
    navigator.clipboard.writeText(texto).then(() => showToast("<i class='fas fa-check'></i> Sequência copiada!"));
}

// =========================================================================
// ❓ GUIA DE SEQUENCIAMENTO — compara os 3 geradores de sequência do sistema,
// já que cada um resolve um problema diferente e não é óbvio de cara qual
// usar em cada situação.
// =========================================================================
function abrirGuiaSequenciamento() {
    const guias = [
        {
            cor: 'var(--cor-sugestao)', icone: 'fa-list-ol', titulo: 'SUGERIR (por meta)',
            onde: 'Painel de Programação, dentro da etapa selecionada — campos "META PÇS" / "META MIN"',
            pergunta: '"Eu quero rodar um lote de ~X peças (ou X minutos) agora — quais OPs eu coloco nele?"',
            como: 'Pega as OPs da etapa atual, tenta fechar a meta usando o máximo possível de uma única matéria-prima antes de misturar com outra.',
            naoConsidera: 'Não olha pedido de cliente nem quantos dias a OP está parada.'
        },
        {
            cor: 'var(--cor-roxo)', icone: 'fa-user-clock', titulo: 'GERAR SEQUÊNCIA DE PRODUÇÃO (por pedido)',
            onde: 'Seção "OPs Vinculadas a Pedidos Pendentes", dentro da Programação',
            pergunta: '"Eu quero produzir ~X peças — quais OPs eu rodo pra fechar o máximo de pedido de cliente possível?"',
            como: 'Prioriza OPs que já fecham pedidos pendentes (sinalizados > atrasados > no prazo); se sobrar meta, completa com OPs da mesma matéria-prima das que já entraram.',
            naoConsidera: 'Não olha quantos dias a OP está parada — só a urgência do pedido vinculado.'
        },
        {
            cor: 'var(--cor-alerta)', icone: 'fa-sort-numeric-down', titulo: 'SEQUENCIAMENTO FIFO (por dias parado)',
            onde: 'Menu ANÁLISE, no cabeçalho',
            pergunta: '"Nesse setor aqui, em que ordem eu devo atender as OPs que já estão esperando?"',
            como: 'Ordena por quem está parado há mais dias (FIFO); OPs de mesma matéria-prima que apareceriam mais pra frente já pulam pra perto uma da outra.',
            naoConsidera: 'Não olha pedido de cliente diretamente — só reflete se a OP tiver a estrela manual de prioridade.'
        },
    ];

    const cardsHtml = guias.map(g => `
        <div style="border-left:4px solid ${g.cor}; background:var(--bg-painel); border-radius:8px; padding:14px; margin-bottom:12px;">
            <div style="font-weight:900; font-size:13px; color:var(--texto-cor); display:flex; align-items:center; gap:8px; margin-bottom:6px;">
                <i class="fas ${g.icone}" style="color:${g.cor};"></i> ${g.titulo}
            </div>
            <div style="font-size:11px; color:var(--texto-secundario); margin-bottom:6px;"><strong>Onde fica:</strong> ${g.onde}</div>
            <div style="font-size:12px; font-style:italic; color:var(--texto-cor); margin-bottom:6px;">${g.pergunta}</div>
            <div style="font-size:11px; color:var(--texto-secundario); margin-bottom:4px;"><strong>Como decide:</strong> ${g.como}</div>
            <div style="font-size:11px; color:var(--texto-secundario);"><strong>Não considera:</strong> ${g.naoConsidera}</div>
        </div>
    `).join('');

    $('modalGuiaSequenciamento').innerHTML = `
        <div class="modal-card" style="width:600px; max-width:92vw; border-top:5px solid var(--cor-sugestao); max-height:88vh;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; border-bottom:2px solid var(--borda-cor); padding-bottom:10px;">
                <h2 style="margin:0; color:var(--texto-cor); display:flex; align-items:center; gap:10px; font-size:16px;">
                    <i class="fas fa-question-circle" style="color:var(--cor-sugestao);"></i> QUAL SEQUÊNCIA USAR?
                </h2>
                <button onclick="fecharModais()" class="modal-fechar-btn"><i class="fas fa-times"></i></button>
            </div>
            <div style="overflow-y:auto; flex:1;">
                ${cardsHtml}
            </div>
        </div>
    `;
    $('modalGuiaSequenciamento').style.display = 'flex';
}

// =========================================================================
// ❓ GUIA GERAL DO SISTEMA — referência de tudo que o sistema faz, organizada
// por área. Existe porque o sistema cresceu muito ao longo do tempo e boa
// parte das funcionalidades não tem outro lugar pra "descobrir" que existem.
// =========================================================================
function abrirGuiaSistema() {
    const secoes = [
        {
            titulo: 'PROGRAMAÇÃO', cor: 'var(--cor-fila)', icone: 'fa-list-check',
            itens: [
                '<strong>Filtros</strong> (Etapa(s), Local, Ciclo, Buscar OP, Matéria-Prima) — combinam entre si; "Buscar OP" também expande pra mostrar outras OPs da mesma matéria-prima.',
                '<strong>Clicar no cabeçalho "CORTE"</strong> alterna a ordem por data de corte (crescente/decrescente).',
                '<strong>SUGERIR</strong> (por peças ou minutos) — monta um lote automaticamente até bater a meta, priorizando fechar uma matéria-prima antes de misturar com outra.',
                '<strong>Fracionar Lote</strong> — divide uma OP em duas (uma pra mover agora, outra fica de fila).',
                '<strong>Estrela</strong> — prioridade manual, sempre no topo da fila.',
                '<strong>Botão direito na OP</strong> — copiar número, alternar prioridade, fracionar, avançar etapa.',
                'Selos <strong>LASER</strong> e <strong>SBM</strong> (sob medida) aparecem na linha quando aplicável — SBM nunca entra em agrupamento por referência.',
                '<strong>OPs Vinculadas a Pedidos Pendentes</strong> (parte de baixo) — mostra quais OPs já em produção fecham algum pedido em aberto; "Gerar Sequência de Produção" monta uma lista pra bater uma meta de peças priorizando fechar pedido.',
            ]
        },
        {
            titulo: 'MENU ANÁLISE (cabeçalho)', cor: 'var(--cor-alerta)', icone: 'fa-magnifying-glass-chart',
            itens: [
                '<strong>Gargalo</strong> — ranking dos setores mais travados (peso = volume + dias parado + urgência de pedido vinculado).',
                '<strong>Sequenciamento FIFO</strong> — ordena as OPs de um setor por quem está parado há mais tempo, agrupando matéria-prima repetida.',
                '<strong>Agrupar por Referência</strong> — mostra referências com 2+ OPs entre Programação e Análise de Medidas, pra facilitar separar matéria-prima de uma vez.',
                '<strong>Qual Sequência Usar?</strong> — compara SUGERIR, Gerar Sequência de Produção e Sequenciamento FIFO lado a lado.',
            ]
        },
        {
            titulo: 'FILA GERAL', cor: 'var(--cor-fila)', icone: 'fa-table-list',
            itens: [
                '<strong>Painel de Visão Geral</strong> (5 cartões no topo) — clicáveis, levam direto pra aba/análise correspondente; acendem um brilho quando têm algo urgente.',
                'Tabela com todas as OPs, coloridas por status: atraso, prazo, FIFO, ou vinculada a pedido.',
            ]
        },
        {
            titulo: 'PEDIDOS PENDENTES', cor: '#A83A42', icone: 'fa-clipboard-list',
            itens: [
                '<strong>Buscar Pedido Específico</strong> (topo da aba) — mostra cada tamanho que falta, quais OPs já existem cobrindo, e (se a Grade foi importada) o local exato de cada uma e se o tamanho bate de verdade.',
                'Coluna CHEGADA é clicável — ordena por data.',
            ]
        },
        {
            titulo: 'FILA DE CORTE', cor: 'var(--cor-sugestao)', icone: 'fa-scissors',
            itens: [
                '"Dias Fila" = peças paradas ÷ média diária cortada; "Dias Fila Corte" soma só Enfesto + Corte.',
                'Botão de baixar imagem — tira um print do painel inteiro.',
            ]
        },
        {
            titulo: 'CABEÇALHO E SISTEMA', cor: 'var(--cor-primaria)', icone: 'fa-gear',
            itens: [
                '<strong>Busca Global</strong> (lupa, ou Ctrl+K) — por número de OP, ciclo, ou referência (traz todas as OPs daquela referência).',
                '<strong>SINCRONIZAR</strong> — depois de importar, abre sozinho um "Balanço da Sincronização" mostrando quem mudou de setor, quem é novo, quem saiu da planilha.',
                '<strong>Menu IMPORTAR</strong> — Grade (tamanho/local por OP) e Pedidos (o que falta produzir).',
                '<strong>Menu SISTEMA</strong> — Modo TV, Prioridade de Clientes, Backup (automático toda sexta também), Imprimir Lote, Limpar Dados.',
                'Indicadores de <strong>"última atualização"</strong> — em cada fonte de dado, avisam quando foi a última vez que ela foi importada (fica vermelho depois de alguns dias).',
                '<strong>Console de depuração</strong> — alcinha na borda direita da tela; mostra erros e avisos técnicos, com botão de copiar.',
            ]
        },
    ];

    const secoesHtml = secoes.map(s => `
        <div style="margin-bottom:18px;">
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px; padding-bottom:6px; border-bottom:2px solid ${s.cor};">
                <i class="fas ${s.icone}" style="color:${s.cor};"></i>
                <strong style="font-size:13px; letter-spacing:0.3px;">${s.titulo}</strong>
            </div>
            <ul style="margin:0; padding-left:20px; font-size:12px; line-height:1.9; color:var(--texto-cor);">
                ${s.itens.map(i => `<li>${i}</li>`).join('')}
            </ul>
        </div>
    `).join('');

    $('modalGuiaSistema').innerHTML = `
        <div class="modal-card" style="width:680px; max-width:92vw; border-top:5px solid var(--cor-sugestao); max-height:88vh;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; border-bottom:2px solid var(--borda-cor); padding-bottom:10px; flex-shrink:0;">
                <h2 style="margin:0; color:var(--texto-cor); display:flex; align-items:center; gap:10px; font-size:16px;">
                    <i class="fas fa-circle-question" style="color:var(--cor-sugestao);"></i> GUIA DO SISTEMA
                </h2>
                <button onclick="fecharModais()" class="modal-fechar-btn"><i class="fas fa-times"></i></button>
            </div>
            <div style="overflow-y:auto; flex:1; padding-right:4px;">
                ${secoesHtml}
            </div>
        </div>
    `;
    $('modalGuiaSistema').style.display = 'flex';
}

