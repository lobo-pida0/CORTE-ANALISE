// =========================================================================
// 🔎 BUSCA DE PEDIDO ESPECÍFICO — mostra o quadro completo de um pedido
// pendente: cada referência+tamanho que ainda falta, e quais OPs já existem
// hoje (total ou parcialmente) cobrindo aquela referência.
// =========================================================================
// =========================================================================
// 🧭 SEQUENCIAMENTO DE PEDIDO — pra cada tamanho que falta, mostra TODAS as
// OPs daquela referência que existem hoje, em qualquer ponto da jornada
// completa (do "Aguard. Liberação OP" até o "Aguard. Finalização"), e indica
// qual está mais perto do estoque — é essa que deve ser usada primeiro.
// Junta duas fontes: bancoDadosOPs (Planilha A, cobre Programação até Corte)
// e sequenciaCompletaOPs (planilha geral, cobre a fábrica inteira — inclusive
// o que a Planilha A nem enxerga, antes do corte e depois dele).
// =========================================================================
function obterSequenciaCompletaOPs() {
    try { return JSON.parse(localStorage.getItem('sequenciaCompletaOPs') || '[]'); } catch (e) { return []; }
}

// Dado o ID de uma OP, acha os pedidos AINDA PENDENTES (ainda falta produzir
// alguma coisa) da mesma referência — o "inverso" do Sequenciamento, que
// parte do pedido pra achar a OP. Cruza com a grade da OP (se importada) pra
// saber se ela realmente tem o tamanho que falta, ou se isso ainda não dá
// pra confirmar.
// Mesma ideia de obterPendentesPorReferencia(), mas com TODOS os pedidos
// (inclusive já cobertos) — usada só pela busca "quais pedidos essa OP
// fecha", que precisa achar até os pedidos que já estão resolvidos (pra
// mostrar "já coberto" corretamente). Não reaproveitar essa em lugar de
// obterPendentesPorReferencia() nos contadores/urgência — lá o certo
// continua sendo só o que falta de verdade.
let cacheTodosPedidosPorReferencia = null; // limpo (= null) sempre que todosPedidos é escrito de novo
function obterTodosPedidosPorReferencia() {
    if (cacheTodosPedidosPorReferencia) return cacheTodosPedidosPorReferencia;
    const mapa = new Map();
    obterTodosPedidos().forEach(p => {
        if (!p.referencia) return;
        if (!mapa.has(p.referencia)) mapa.set(p.referencia, []);
        mapa.get(p.referencia).push(p);
    });
    cacheTodosPedidosPorReferencia = mapa;
    return mapa;
}

function pedidosQueEssaOPFecha(op) {
    if (!op || !op.referencia) return [];
    const pendentesRef = obterTodosPedidosPorReferencia().get(op.referencia);
    if (!pendentesRef || !pendentesRef.length) return [];

    const grades = obterGradesPorOP();
    const gradeOP = buscarGrade(grades, op.id, op.ciclo);
    const temGrade = !!(gradeOP && gradeOP.tamanhos && Object.keys(gradeOP.tamanhos).length);

    return [...pendentesRef].sort(compararUrgenciaPedidos).map(p => ({
        pedido: p.pedido, cliente: p.cliente, tam: p.tam, faltaProduzir: p.faltaProduzir,
        chegada: p.chegada, prior: p.prior,
        cobre: temGrade ? (gradeOP.tamanhos[p.tam] || 0) > 0 : null // null = grade não conferida
    }));
}

function opsNaJornadaCompleta(referencia) {
    const grades = obterGradesPorOP();
    const vistas = new Set();
    const itens = [];

    bancoDadosOPs.forEach(op => {
        if (op.referencia !== referencia) return;
        vistas.add(op.op || op.id);
        itens.push({
            op: op.id, ciclo: op.ciclo, qtd: parseInt(op.qtd) || 0,
            local: op.localExcel || nomesEtapas[op.etapa] || '',
            posicao: posicaoNaSequencia(op.localExcel),
            grade: (buscarGrade(grades, op.id, op.ciclo) || {}).tamanhos || null,
            fonte: 'planilha-a'
        });
    });

    obterSequenciaCompletaOPs().forEach(item => {
        if (item.ref !== referencia || vistas.has(item.op)) return;
        vistas.add(item.op);
        itens.push({
            op: item.op, ciclo: '', qtd: item.qtd || 0,
            local: item.local,
            posicao: posicaoNaSequencia(item.local),
            grade: (buscarGrade(grades, item.op, '') || {}).tamanhos || null, // sem ciclo aqui (planilha geral não carrega essa info) — só acha se o número não for ambíguo
            fonte: 'planilha-geral'
        });
    });

    // Mais perto do estoque primeiro. Local não mapeado (posição null) fica
    // por último — melhor um alerta visível do que fingir que sabe onde está.
    itens.sort((a, b) => (b.posicao ?? -1) - (a.posicao ?? -1));
    return itens;
}

// Caminho contrário do de cima: parte de uma OP e mostra quais pedidos ela
// ajuda a fechar. Busca em bancoDadosOPs primeiro (cobre até o Corte); se não
// achar lá, tenta na jornada completa (pós-corte) só pra pegar a referência —
// nesse caso não dá pra cruzar grade (ela é indexada por OP da Planilha A).
// Desenha a tabela do Levantamento de Referências (aba só de admin). Alterna
// entre "Falta Estoque" (X) e "Falta OP" (AB) com um botão só, sem duas
// telas separadas.
let modoLevantamentoNecessidade = 'faltaEstoque'; // fica lembrado enquanto o sistema está aberto

// Desenha a aba PRIORIDADES — a mesma lista do Radar, num formato de
// tabela. Existe especificamente pra quem só visualiza (o Radar é uma
// sidebar, não uma aba, e não fica óbvio como abrir ela sem já conhecer o
// sistema).
// Filtros da aba PRIORIDADES — próprios dessa aba, não misturam com os
// filtros da Programação. A LISTA de opções (renderizarFiltro...) só é
// reconstruída em pontos específicos (abrir a aba, sincronizar, importar
// Destino) — não a cada atualização de tela, senão o dropdown "pisca"
// enquanto a pessoa está clicando nele.
let setoresPrioridadesExcluidos = new Set();
let mesesPrioridadesExcluidos = new Set();
const CHAVE_SEM_MES_PRIORIDADES = '__SEM_MES_PRI__';

// O "setor" de uma OP, pra exibição/filtro: prefere o local detalhado que
// vem da planilha de Destino (cobre etapas fora das 8 rastreadas, tipo
// costura) — cai pra etapa numérica normal quando não tiver isso.
// Locais extras (fora das 8 etapas normais) liberados pra aparecer no
// filtro de Setor da aba Prioridades — lista fechada, o usuário pediu
// especificamente esses 7. Qualquer outro local que a planilha de Destino
// trouxer é ignorado aqui (cai pra etapa normal), mesmo que exista de
// verdade — só esses foram aprovados.
const LOCAIS_EXTRA_APROVADOS_PRIORIDADES = new Set([
    'PNP COST SUP CAMISA',
    'PNP AGUARD DEFINICAO COST INF',
    'PNP COST CEL HIBRIDA',
    'PNP COST SUP MALHA',
    'PNP ETIQ PROF/AMARR SOC/SEP LOG/SEP GLA',
    'PNP COST INF CALCA',
    'PNP AGUARD DEFINICAO COST SUP',
]);

function obterSetorExibicaoPrioridade(op) {
    if (op.localDestinoDetalhado && LOCAIS_EXTRA_APROVADOS_PRIORIDADES.has(op.localDestinoDetalhado)) {
        return op.localDestinoDetalhado;
    }
    return nomesEtapas[op.etapa] || '(SEM SETOR)';
}

function renderizarFiltroSetorPrioridades() {
    const el = $('listaFiltroSetorPrioridades');
    if (!el) return;
    const todasPrioritarias = [...bancoDadosOPs.filter(o => o.prioridade), ...obterOpsManuaisPrioridade().map(o => ({ ...o, prioridade: true })), ...Object.values(obterOpsDestinoAutomaticas())];
    const setoresPresentes = [...new Set(todasPrioritarias.map(obterSetorExibicaoPrioridade))].filter(s => s !== '(SEM SETOR)').sort();

    if (!setoresPresentes.length) {
        el.innerHTML = '<label style="color:var(--texto-secundario); padding:8px 12px; display:block;">Nenhum setor disponível.</label>';
        atualizarTextoFiltroSetorPrioridades(0, 0);
        return;
    }
    const marcadas = setoresPresentes.filter(s => !setoresPrioridadesExcluidos.has(s)).length;
    const todasMarcadas = marcadas === setoresPresentes.length;
    let html = `<label style="font-weight:700; border-bottom:1px solid var(--borda-cor);"><input type="checkbox" id="chkTodosSetoresPrioridades" ${todasMarcadas ? 'checked' : ''}> Selecionar tudo</label>`;
    html += setoresPresentes.map(s => `<label><input type="checkbox" class="chk-setor-prioridades" value="${s.replace(/"/g, '&quot;')}" ${setoresPrioridadesExcluidos.has(s) ? '' : 'checked'}> ${s}</label>`).join('');
    el.innerHTML = html;
    atualizarTextoFiltroSetorPrioridades(marcadas, setoresPresentes.length);
}
function atualizarTextoFiltroSetorPrioridades(marcadas, total) {
    if (!$('textoFiltroSetorPrioridades')) return;
    if (total === 0 || marcadas === total) $('textoFiltroSetorPrioridades').innerText = 'Todos';
    else if (marcadas === 0) $('textoFiltroSetorPrioridades').innerText = 'Nenhum';
    else $('textoFiltroSetorPrioridades').innerText = `${marcadas} de ${total}`;
}

function renderizarFiltroMesPrioridades() {
    const el = $('listaFiltroMesPrioridades');
    if (!el) return;
    const meses = new Set(); let temSemMes = false;
    bancoDadosOPs.filter(o => o.prioridade).forEach(o => { if (o.mesDestino) meses.add(o.mesDestino); else temSemMes = true; });
    const listaMeses = [...meses].sort();
    if (temSemMes) listaMeses.push(CHAVE_SEM_MES_PRIORIDADES);

    if (!listaMeses.length) {
        el.innerHTML = '<label style="color:var(--texto-secundario); padding:8px 12px; display:block;">Nenhum mês disponível.</label>';
        atualizarTextoFiltroMesPrioridades(0, 0);
        return;
    }
    const marcadas = listaMeses.filter(m => !mesesPrioridadesExcluidos.has(m)).length;
    const todasMarcadas = marcadas === listaMeses.length;
    let html = `<label style="font-weight:700; border-bottom:1px solid var(--borda-cor);"><input type="checkbox" id="chkTodosMesesPrioridades" ${todasMarcadas ? 'checked' : ''}> Selecionar tudo</label>`;
    html += listaMeses.map(m => {
        const rotulo = m === CHAVE_SEM_MES_PRIORIDADES ? '(sem mês)' : m;
        return `<label><input type="checkbox" class="chk-mes-prioridades" value="${m}" ${mesesPrioridadesExcluidos.has(m) ? '' : 'checked'}> ${rotulo}</label>`;
    }).join('');
    el.innerHTML = html;
    atualizarTextoFiltroMesPrioridades(marcadas, listaMeses.length);
}
function atualizarTextoFiltroMesPrioridades(marcadas, total) {
    if (!$('textoFiltroMesPrioridades')) return;
    if (total === 0 || marcadas === total) $('textoFiltroMesPrioridades').innerText = 'Todos';
    else if (marcadas === 0) $('textoFiltroMesPrioridades').innerText = 'Nenhum';
    else $('textoFiltroMesPrioridades').innerText = `${marcadas} de ${total}`;
}

// Reconstrói as DUAS listas de opções — chamada só em pontos específicos
// (abrir a aba, sincronizar, importar Destino), nunca dentro do render
// frequente.
function reconstruirFiltrosPrioridades() {
    renderizarFiltroSetorPrioridades();
    renderizarFiltroMesPrioridades();
}

// Desenha a aba PRIORIDADES — a mesma lista do Radar, num formato de
// tabela, com os 2 filtros aplicados. Existe especificamente pra quem só
// visualiza (o Radar é uma sidebar, não uma aba, e não fica óbvio como
// abrir ela sem já conhecer o sistema).
// Estado de ordenação da aba Prioridades — lembrado enquanto o sistema
// está aberto, não precisa salvar.
let ordenacaoPrioridades = { campo: 'mesDestino', direcao: 'asc' };

function compararPrioridades(a, b, campo) {
    let va = a[campo], vb = b[campo];
    if (campo === 'id') { va = parseInt(va) || 0; vb = parseInt(vb) || 0; }
    else if (campo === 'etapa') { va = obterSetorExibicaoPrioridade(a); vb = obterSetorExibicaoPrioridade(b); }
    else if (campo === 'qtd' || campo === 'diasLocal') { va = va || 0; vb = vb || 0; }
    else if (campo === 'numeroPrioridade') {
        // Números primeiro (ordenados de verdade), o que não é número (ou
        // está vazio) vai pro final, não pro meio da lista
        const na = parseFloat(va), nb = parseFloat(vb);
        va = isNaN(na) ? Infinity : na; vb = isNaN(nb) ? Infinity : nb;
    }
    else { va = (va || '').toString(); vb = (vb || '').toString(); }
    if (va < vb) return -1;
    if (va > vb) return 1;
    return 0;
}

// Clique num cabeçalho: primeira vez ordena crescente, clique de novo no
// mesmo cabeçalho inverte pra decrescente.
function ordenarPrioridadesPor(campo) {
    if (ordenacaoPrioridades.campo === campo) {
        ordenacaoPrioridades.direcao = ordenacaoPrioridades.direcao === 'asc' ? 'desc' : 'asc';
    } else {
        ordenacaoPrioridades = { campo, direcao: 'asc' };
    }
    renderizarAbaPrioridades();
}

function renderizarAbaPrioridades() {
    if (!$('listaPrioridadesTab')) return;
    const manuaisSet = obterPrioridadesManuais();
    const opsManuaisCompletas = obterOpsManuaisPrioridade().map(o => ({ ...o, prioridade: true, manualCompleta: true }));
    const opsAutomaticasCompletas = Object.values(obterOpsDestinoAutomaticas()).map(o => ({ ...o, etapa: null, prioridade: true, automaticaDoDestino: true }));
    const localProducaoPorOP = obterLocalProducaoPorOP();

    const prioritarias = [...bancoDadosOPs.filter(o => o.prioridade), ...opsManuaisCompletas, ...opsAutomaticasCompletas]
        .filter(o => obterSetorExibicaoPrioridade(o) !== '(SEM SETOR)') // local não reconhecido (nem etapa válida, nem um dos locais aprovados) — não mostra
        .filter(o => !setoresPrioridadesExcluidos.has(obterSetorExibicaoPrioridade(o)))
        .filter(o => !mesesPrioridadesExcluidos.has(o.mesDestino || CHAVE_SEM_MES_PRIORIDADES))
        .sort((a, b) => {
            // As destacadas sempre vêm primeiro, não importa a ordenação
            // escolhida — é exatamente o "faça isso primeiro" que se quer
            const destA = a.destaque ? 0 : 1, destB = b.destaque ? 0 : 1;
            if (destA !== destB) return destA - destB;
            const r = compararPrioridades(a, b, ordenacaoPrioridades.campo);
            return ordenacaoPrioridades.direcao === 'asc' ? r : -r;
        });

    if ($('contPrioridadesTab')) $('contPrioridadesTab').innerText = `${prioritarias.length} OP(s)`;

    // Marca visualmente qual cabeçalho está ordenando agora (a seta ▲/▼)
    $$('.th-ordenavel').forEach(th => th.classList.remove('ordenado-asc', 'ordenado-desc'));
    const thAtivo = $(`thOrdenarPrioridades-${ordenacaoPrioridades.campo}`);
    if (thAtivo) thAtivo.classList.add(ordenacaoPrioridades.direcao === 'asc' ? 'ordenado-asc' : 'ordenado-desc');

    // Total de peças no rodapé — soma só o que está visível com os filtros
    // atuais, então muda sozinho conforme Setor/Mês Destino mudam.
    const totalPecas = prioritarias.reduce((s, op) => s + (parseInt(op.qtd) || 0), 0);
    if ($('totalPecasPrioridades')) $('totalPecasPrioridades').innerText = totalPecas.toLocaleString('pt-BR');

    if (!prioritarias.length) {
        $('listaPrioridadesTab').innerHTML = `<tr><td colspan="9" class="tabela-vazia"><i class="fas fa-check-circle tabela-vazia-icone" style="color:var(--cor-despacho);"></i>Nenhuma OP prioritária com esse filtro.</td></tr>`;
        return;
    }

    $('listaPrioridadesTab').innerHTML = prioritarias.map(op => {
        const chaveDestaOP = chaveDaOP(op);
        const ehManual = op.manualCompleta || manuaisSet.has(chaveDestaOP);
        const ehAutomatica = !!op.automaticaDoDestino;
        const botaoRemover = (ehManual || ehAutomatica) ? `<button class="btn somente-admin" style="padding:3px 7px; background:var(--cor-alerta);" onclick="removerPrioridadeManual('${chaveDestaOP}')" title="Remover essa marcação"><i class="fas fa-times"></i></button>` : '';
        const localProducao = localProducaoPorOP.get(op.id);
        const destacada = !!op.destaque;
        const estrela = `<i class="fas fa-star" style="cursor:pointer; color:${destacada ? '#B8862A' : 'var(--borda-cor)'};" onclick="toggleDestaquePrioridade('${chaveDestaOP}')" title="${destacada ? 'Tirar destaque' : 'Destacar — faça essa primeiro'}"></i>`;
        return `
        <tr style="${destacada ? 'background:rgba(184, 134, 42, 0.15);' : ''}">
            <td>${estrela} <strong>${op.id}</strong>${op.ciclo ? ` <span style="font-size:10px; color:var(--texto-secundario);" title="Ciclo">${op.ciclo}</span>` : ''}${ehManual ? ' <i class="fas fa-hand" style="font-size:9px; color:var(--texto-secundario);" title="Adicionada manualmente"></i>' : ''}${ehAutomatica ? ' <i class="fas fa-file-import" style="font-size:9px; color:var(--texto-secundario);" title="Não existe na Sincronização — montada com dado do Destino"></i>' : ''}</td>
            <td>${op.numeroPrioridade !== null && op.numeroPrioridade !== undefined ? op.numeroPrioridade : '<span style="color:var(--texto-secundario);">—</span>'}</td>
            <td>${op.desc}</td>
            <td><span class="pill selo-setor">${obterSetorExibicaoPrioridade(op)}</span></td>
            <td style="text-align:right;">${op.qtd}</td>
            <td style="text-align:right; color:${(op.diasLocal || 0) >= 3 ? 'var(--cor-alerta)' : 'var(--texto-cor)'};">${op.diasLocal || 0}</td>
            <td>${op.mesDestino ? `<span class="pill selo-mes">${op.mesDestino}</span>` : '<span style="color:var(--texto-secundario);">—</span>'}</td>
            <td style="font-size:11px;">${localProducao || '<span style="color:var(--texto-secundario);">—</span>'}</td>
            <td>${botaoRemover}</td>
        </tr>
    `;
    }).join('');
}

function renderizarNecessidadePorReferencia() {
    if (!$('listaNecessidade')) return;
    const termo = $('buscaNecessidade') ? $('buscaNecessidade').value.trim().toLowerCase() : '';
    let linhas = obterNecessidadePorReferenciaETamanho(modoLevantamentoNecessidade);
    if (termo) linhas = linhas.filter(l => l.referencia.toLowerCase().includes(termo));

    const rotulo = modoLevantamentoNecessidade === 'faltaProduzir' ? 'FALTA OP (AB)' : 'FALTA ESTOQUE (X)';
    const explicacao = modoLevantamentoNecessidade === 'faltaProduzir'
        ? 'Soma a "Falta OP" — quanto falta depois de descontar o estoque E o que já está em produção (OPs abertas).'
        : 'Soma a "Falta Estoque" — quanto falta descontando só o estoque, sem descontar o que já está em produção.';
    if ($('explicacaoNecessidade')) $('explicacaoNecessidade').innerText = explicacao;
    if ($('btnModoNecessidade')) $('btnModoNecessidade').innerText = modoLevantamentoNecessidade === 'faltaProduzir' ? 'VER POR FALTA ESTOQUE' : 'VER POR FALTA OP';
    if ($('cabecalhoColunaNecessidade')) $('cabecalhoColunaNecessidade').innerText = rotulo + ' (TOTAL)';

    if ($('contNecessidade')) $('contNecessidade').innerText = `${linhas.length} referência(s)/tamanho(s)`;

    if (!linhas.length) {
        $('listaNecessidade').innerHTML = `<tr><td colspan="5" class="tabela-vazia"><i class="fas fa-inbox tabela-vazia-icone"></i>${termo ? 'Nada encontrado com esse filtro.' : `Nenhuma referência com ${rotulo.toLowerCase()} — sincronize os pedidos, ou essa coluna não veio na planilha.`}</td></tr>`;
        return;
    }

    $('listaNecessidade').innerHTML = linhas.map(l => `
        <tr>
            <td><strong>${l.referencia}</strong></td>
            <td>${l.tam || '-'}</td>
            <td style="text-align:right; font-weight:900; color:var(--cor-alerta); font-size:14px;">${l.total.toLocaleString('pt-BR')}</td>
            <td style="text-align:right;">${l.qtdPedidos}</td>
            <td style="font-size:11px; color:var(--texto-secundario);">${l.pedidos.slice(0, 5).join(', ')}${l.pedidos.length > 5 ? ` +${l.pedidos.length - 5}` : ''}</td>
        </tr>
    `).join('');
}

function alternarModoLevantamentoNecessidade() {
    modoLevantamentoNecessidade = modoLevantamentoNecessidade === 'faltaProduzir' ? 'faltaEstoque' : 'faltaProduzir';
    renderizarNecessidadePorReferencia();
}


function pesquisarSequenciamentoOP() {
    const termo = $('inputSequenciamentoOP').value.trim();
    const resultadoDiv = $('resultadoSequenciamentoOP');
    if (!termo) { resultadoDiv.innerHTML = ''; return; }

    let op = bancoDadosOPs.find(o => o.id === termo);
    if (!op) {
        const naJornada = obterSequenciaCompletaOPs().find(i => String(i.op) === termo);
        if (naJornada) op = { id: naJornada.op, referencia: naJornada.ref, localExcel: naJornada.local };
    }

    if (!op) {
        resultadoDiv.innerHTML = `<div style="padding:20px; text-align:center; color:var(--texto-secundario); border-top:1px solid var(--borda-cor);">
            <i class="fas fa-info-circle"></i> OP "${termo}" não encontrada.
        </div>`;
        return;
    }

    const matches = pedidosQueEssaOPFecha(op);
    const linhas = matches.map(m => {
        const selo = m.cobre === true
            ? '<span class="pill" style="background:var(--cor-despacho);"><i class="fas fa-check"></i> grade confere</span>'
            : m.cobre === false
                ? '<span class="pill" style="background:var(--cor-alerta);"><i class="fas fa-triangle-exclamation"></i> sem esse tamanho na grade</span>'
                : '<span class="pill" style="background:var(--cor-historico);">grade não conferida</span>';
        return `<tr>
            <td><strong>${m.pedido}</strong></td>
            <td>${m.cliente}</td>
            <td>${m.tam}</td>
            <td style="text-align:right;">${m.faltaProduzir}</td>
            <td>${formatarDataBR(m.chegada) || 'S/ DATA'}</td>
            <td>${selo}</td>
        </tr>`;
    }).join('');

    resultadoDiv.innerHTML = `
        <div style="padding:16px 20px; border-top:1px solid var(--borda-cor); background:var(--bg-painel);">
            <div style="margin-bottom:12px; font-size:14px;">
                <strong>OP ${op.id}</strong> — referência <strong>${op.referencia || 'sem referência'}</strong>${op.localExcel ? ` — em <strong>${op.localExcel}</strong>` : ''}
            </div>
            ${matches.length === 0
                ? `<div style="color:var(--texto-secundario); font-style:italic;">Nenhum pedido em aberto usa essa referência hoje.</div>`
                : `<table class="tabela-dados">
                    <thead><tr><th>PEDIDO</th><th>CLIENTE</th><th>TAM</th><th style="text-align:right;">FALTA</th><th>CHEGADA</th><th>SITUAÇÃO DA GRADE</th></tr></thead>
                    <tbody>${linhas}</tbody>
                </table>`}
        </div>
    `;
}

function pesquisarSequenciamentoPedido() {
    const termo = $('inputSequenciamentoPedido').value.trim();
    const resultadoDiv = $('resultadoSequenciamentoPedido');
    if (!termo) { resultadoDiv.innerHTML = ''; return; }

    const itens = obterTodosPedidos().filter(p => p.pedido === termo);
    if (itens.length === 0) {
        resultadoDiv.innerHTML = `<div style="padding:20px; text-align:center; color:var(--texto-secundario); border-top:1px solid var(--borda-cor);">
            <i class="fas fa-info-circle"></i> Pedido "${termo}" não encontrado.
        </div>`;
        return;
    }

    const porReferencia = new Map();
    itens.forEach(item => {
        if (!porReferencia.has(item.referencia)) porReferencia.set(item.referencia, []);
        porReferencia.get(item.referencia).push(item);
    });

    const cliente = itens[0].cliente;
    const chegada = formatarDataBR(itens[0].chegada) || 'S/ DATA';

    const gruposHtml = [...porReferencia.entries()].map(([referencia, linhasTamanho]) => {
        const jornada = opsNaJornadaCompleta(referencia);
        const descricaoRef = linhasTamanho.find(l => l.descricao)?.descricao || '';

        const linhasTamanhoHtml = linhasTamanho.map(l => {
            // Entre as OPs que têm o tamanho que falta, pega a mais avançada
            const comTamanho = jornada.filter(j => j.grade && (j.grade[l.tam] || 0) > 0);
            const melhor = comTamanho[0]; // já vem ordenado por posição desc

            let indicador;
            if (!melhor) {
                const algumaComGrade = jornada.some(j => j.grade);
                indicador = algumaComGrade
                    ? `<span class="pill" style="background:var(--cor-alerta); font-size:9px;"><i class="fas fa-triangle-exclamation"></i> nenhuma OP tem esse tamanho</span>`
                    : `<span class="pill" style="background:var(--cor-historico); font-size:9px;">grade não conferida</span>`;
            } else {
                const posConhecida = melhor.posicao !== null;
                indicador = posConhecida
                    ? `<span class="pill" style="background:var(--cor-despacho); font-size:9px;"><i class="fas fa-arrow-right"></i> use a OP ${melhor.op} (${melhor.local})</span>`
                    : `<span class="pill" style="background:var(--cor-selecao); color:#2d3436; font-size:9px;">OP ${melhor.op} num local ainda não mapeado (${melhor.local})</span>`;
            }
            return `<div style="display:inline-flex; flex-direction:column; align-items:flex-start; gap:4px; background:var(--bg-painel); border:1px solid var(--borda-cor); border-radius:6px; padding:6px 10px; margin:0 8px 8px 0;">
                ${l.faltaProduzir > 0
                    ? `<span class="pill" style="background:var(--cor-alerta);">${l.tam}: falta ${l.faltaProduzir}</span>`
                    : `<span class="pill" style="background:var(--cor-despacho);"><i class="fas fa-check"></i> ${l.tam}: já coberto</span>`}
                ${indicador}
            </div>`;
        }).join('');

        const linhasJornada = jornada.map((j, i) => {
            const semPosicao = j.posicao === null;
            const corBarra = semPosicao ? 'var(--texto-secundario)' : `hsl(${Math.round((j.posicao / POSICAO_MAXIMA_SEQUENCIA) * 130)}, 55%, 45%)`;
            return `<tr${i === 0 && !semPosicao ? ' style="background:rgba(76,154,106,0.08);"' : ''}>
                <td><strong>${j.op}</strong>${j.ciclo ? ' · ' + j.ciclo : ''}</td>
                <td>${j.local || '-'}</td>
                <td style="text-align:right;">${j.qtd}</td>
                <td style="text-align:right;">${j.grade ? Object.entries(j.grade).map(([t, q]) => `${t}:${q}`).join(' ') : '<span style="color:var(--texto-secundario);">s/ grade</span>'}</td>
                <td>${semPosicao ? '<span style="color:var(--cor-selecao);">não mapeado</span>' : `<div style="height:8px; border-radius:4px; background:var(--bg-card); overflow:hidden;"><div style="height:100%; width:${(j.posicao / POSICAO_MAXIMA_SEQUENCIA * 100).toFixed(0)}%; background:${corBarra};"></div></div>`}</td>
            </tr>`;
        }).join('');

        return `
            <div style="border-left:4px solid var(--cor-roxo); background:var(--bg-card); border:1px solid var(--borda-cor); border-radius:8px; padding:12px; margin-bottom:14px;">
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
                    <strong style="font-size:13px;"><i class="fas fa-tag"></i> ${referencia}${descricaoRef ? ` <span style="font-weight:normal; color:var(--texto-secundario); font-size:11px;">— ${descricaoRef}</span>` : ''}</strong>
                    <span style="font-size:11px; color:var(--texto-secundario);">${jornada.length} OP(s) encontrada(s) na jornada completa</span>
                </div>
                <div style="margin-top:8px;">${linhasTamanhoHtml}</div>
                ${jornada.length === 0 ? `<div style="font-size:11px; color:var(--texto-secundario); font-style:italic; margin-top:6px;">Nenhuma OP dessa referência encontrada (nem na Planilha A, nem na planilha geral).</div>` : `
                <table class="tabela-dados" style="margin-top:10px;">
                    <thead><tr><th>OP</th><th>LOCAL ATUAL</th><th style="text-align:right;">PEÇAS</th><th style="text-align:right;">GRADE</th><th style="width:120px;">JORNADA</th></tr></thead>
                    <tbody>${linhasJornada}</tbody>
                </table>`}
            </div>
        `;
    }).join('');

    resultadoDiv.innerHTML = `
        <div style="padding:16px 20px; border-top:1px solid var(--borda-cor); background:var(--bg-painel);">
            <div style="margin-bottom:12px; font-size:14px;">
                <strong>Pedido ${termo}</strong> — ${cliente} — chegada <strong>${chegada}</strong>
            </div>
            ${gruposHtml}
        </div>
    `;
}

function pesquisarPedido() {
    const termo = $('inputPesquisaPedido').value.trim();
    const resultadoDiv = $('resultadoPesquisaPedido');
    if (!termo) { resultadoDiv.innerHTML = ''; return; }

    const itens = obterTodosPedidos().filter(p => p.pedido === termo);

    if (itens.length === 0) {
        resultadoDiv.innerHTML = `<div style="padding:20px; text-align:center; color:var(--texto-secundario); border-top:1px solid var(--borda-cor);">
            <i class="fas fa-info-circle"></i> Pedido "${termo}" não encontrado — o número deve estar diferente do que veio na planilha.
        </div>`;
        return;
    }

    // Um pedido pode ter várias referências, e cada referência pode ter mais
    // de uma linha (uma por tamanho) — agrupa por referência antes de montar.
    const porReferencia = new Map();
    itens.forEach(item => {
        if (!porReferencia.has(item.referencia)) porReferencia.set(item.referencia, []);
        porReferencia.get(item.referencia).push(item);
    });

    const cliente = itens[0].cliente;
    const chegada = itens[0].chegada ? new Date(itens[0].chegada).toLocaleDateString('pt-BR') : 'S/ DATA';

    const gruposHtml = [...porReferencia.entries()].map(([referencia, linhasTamanho]) => {
        const opsExistentes = bancoDadosOPs.filter(op => op.referencia === referencia);
        const totalOPs = opsExistentes.reduce((s, op) => s + (parseInt(op.qtd) || 0), 0);
        const descricaoRef = linhasTamanho.find(l => l.descricao)?.descricao || '';
        const grades = obterGradesPorOP();

        // Pra cada tamanho que falta, confere se alguma OP existente REALMENTE
        // tem esse tamanho na grade dela — ter volume na referência não quer
        // dizer que cobre o tamanho específico que está faltando. Detalha
        // qual OP contribui com quanto, e em qual local ela está.
        const linhasTamanhoHtml = linhasTamanho.map(l => {
            let qtdGrade = 0, algumaComGrade = false;
            const contribuicoes = [];
            opsExistentes.forEach(op => {
                const g = buscarGrade(grades, op.id, op.ciclo);
                if (g && g.tamanhos) {
                    algumaComGrade = true;
                    const qtdOP = g.tamanhos[l.tam] || 0;
                    if (qtdOP > 0) {
                        qtdGrade += qtdOP;
                        contribuicoes.push({ opId: op.id, qtd: qtdOP, locais: (g.locaisPorTamanho && g.locaisPorTamanho[l.tam]) || [] });
                    }
                }
            });
            let avisoGrade = '';
            if (algumaComGrade) {
                if (qtdGrade === 0) {
                    avisoGrade = `<span class="pill" style="background:var(--cor-alerta); font-size:9px;"><i class="fas fa-triangle-exclamation"></i> sem grade ${l.tam}</span>`;
                } else if (qtdGrade < l.faltaProduzir) {
                    avisoGrade = `<span class="pill" style="background:var(--cor-selecao); font-size:9px; color:#2d3436;"><i class="fas fa-circle-half-stroke"></i> ${qtdGrade}/${l.faltaProduzir} coberto</span>`;
                } else {
                    avisoGrade = `<span class="pill" style="background:var(--cor-despacho); font-size:9px;"><i class="fas fa-check"></i> coberto (${qtdGrade})</span>`;
                }
            }
            const detalheContribuicoes = contribuicoes.length === 0 ? '' : `
                <div style="margin-top:4px; display:flex; flex-direction:column; gap:2px; border-top:1px dashed var(--borda-cor); padding-top:4px;">
                    ${contribuicoes.map(c => {
                        const locaisTxt = c.locais.length > 0 ? c.locais.map(loc => `${loc.local} (${loc.qtd})`).join(' + ') : 'local não informado na grade';
                        return `<div style="font-size:9px; color:var(--texto-secundario);"><strong style="color:var(--texto-cor);">OP ${c.opId}</strong>: ${c.qtd} pçs · <i class="fas fa-location-dot"></i> ${locaisTxt}</div>`;
                    }).join('')}
                </div>`;
            return `<div style="display:inline-flex; flex-direction:column; align-items:flex-start; gap:4px; background:var(--bg-painel); border:1px solid var(--borda-cor); border-radius:6px; padding:6px 10px; margin:0 8px 8px 0; max-width:280px;">
                ${l.faltaProduzir > 0
                    ? `<span class="pill" style="background:var(--cor-alerta);">${l.tam}: falta ${l.faltaProduzir}</span>`
                    : `<span class="pill" style="background:var(--cor-despacho);"><i class="fas fa-check"></i> ${l.tam}: já coberto</span>`}
                ${avisoGrade}
                ${detalheContribuicoes}
            </div>`;
        }).join('');

        const opsHtml = opsExistentes.length === 0
            ? `<div style="font-size:11px; color:var(--texto-secundario); font-style:italic; margin-top:8px;"><i class="fas fa-triangle-exclamation"></i> Nenhuma OP existente hoje pra essa referência.</div>`
            : `<table class="tabela-dados" style="margin-top:8px;">
                <thead><tr><th>OP</th><th>CICLO</th><th>ETAPA ATUAL</th><th style="text-align:right;">PEÇAS</th><th style="text-align:right;">DIAS PARADO</th></tr></thead>
                <tbody>${opsExistentes.map(op => `
                    <tr>
                        <td><strong>${op.id}</strong></td>
                        <td>${op.ciclo}</td>
                        <td><span class="pill" style="background:var(--cor-sugestao);">${nomesEtapas[op.etapa]}</span></td>
                        <td style="text-align:right;">${op.qtd}</td>
                        <td style="text-align:right; color:${(op.diasLocal || 0) >= 3 ? 'var(--cor-alerta)' : 'var(--texto-cor)'};">${op.diasLocal || 0}</td>
                    </tr>
                `).join('')}</tbody>
            </table>`;

        return `
            <div style="border-left:4px solid var(--cor-roxo); background:var(--bg-card); border:1px solid var(--borda-cor); border-radius:8px; padding:12px; margin-bottom:12px;">
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
                    <strong style="font-size:13px;"><i class="fas fa-tag"></i> ${referencia}${descricaoRef ? ` <span style="font-weight:normal; color:var(--texto-secundario); font-size:11px;">— ${descricaoRef}</span>` : ''}</strong>
                    <span style="font-size:11px; color:var(--texto-secundario);">${opsExistentes.length} OP(s) já existente(s) · ${totalOPs} peças já em produção hoje</span>
                </div>
                <div style="margin-top:8px;">${linhasTamanhoHtml}</div>
                ${opsHtml}
            </div>
        `;
    }).join('');

    resultadoDiv.innerHTML = `
        <div style="padding:16px 20px; border-top:1px solid var(--borda-cor); background:var(--bg-painel);">
            <div style="margin-bottom:12px; font-size:14px;">
                <strong>Pedido ${termo}</strong> — ${cliente} — chegada <strong>${chegada}</strong>
            </div>
            ${gruposHtml}
        </div>
    `;
}

function renderizarPedidosPendentes() {
    const pendentes = obterPedidosPendentes();
    if (!$('listaPedidosPendentes')) return;

    if ($('contPedidosPendentes')) $('contPedidosPendentes').innerText = pendentes.length + " itens";

    if ($('setaPedidosPendentes')) {
        $('setaPedidosPendentes').innerText = ordenacaoPedidosPendentesData === 'asc' ? '▲' : ordenacaoPedidosPendentesData === 'desc' ? '▼' : '';
    }

    if (pendentes.length === 0) {
        $('listaPedidosPendentes').innerHTML = `<tr><td colspan="7" class="tabela-vazia"><i class="fas fa-check-circle tabela-vazia-icone" style="color:var(--cor-despacho);"></i>Nenhum pedido pendente — ou a planilha de pedidos ainda não foi importada.</td></tr>`;
        return;
    }

    let ordenados;
    if (ordenacaoPedidosPendentesData) {
        const mult = ordenacaoPedidosPendentesData === 'asc' ? 1 : -1;
        ordenados = [...pendentes].sort((a, b) => {
            if (!a.chegada && !b.chegada) return 0;
            if (!a.chegada) return 1;
            if (!b.chegada) return -1;
            return mult * (new Date(a.chegada) - new Date(b.chegada));
        });
    } else {
        ordenados = [...pendentes].sort(compararUrgenciaPedidos);
    }
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);

    $('listaPedidosPendentes').innerHTML = ordenados.map(p => {
        const especial = p.prior !== 99;
        const dataChegada = p.chegada ? new Date(p.chegada) : null;
        const atrasado = dataChegada && dataChegada < hoje;
        const tintaLinha = especial ? 'background:rgba(107, 76, 122,0.08);' : (atrasado ? 'background:rgba(193, 68, 78,0.06);' : '');
        const marcador = especial
            ? `<span class="pill" style="background:var(--cor-roxo);" title="Prioridade sinalizada no pedido: ${p.prior}">P${p.prior}</span>`
            : (atrasado ? `<span class="pill pill-atraso">ATRASO</span>` : `<span class="pill pill-ok">PRAZO</span>`);
        return `<tr style="${tintaLinha}">
            <td>${marcador}</td>
            <td>${p.cliente}</td>
            <td>${p.pedido}</td>
            <td><strong>${p.referencia}</strong></td>
            <td>${p.tam}</td>
            <td style="color:var(--cor-alerta); font-weight:bold;">${p.faltaProduzir}</td>
            <td>${dataChegada ? dataChegada.toLocaleDateString('pt-BR') : 'S/ DATA'}</td>
        </tr>`;
    }).join('');
}

