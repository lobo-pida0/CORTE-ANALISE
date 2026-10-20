// =========================================================================
// ⭐ PRIORIDADE MANUAL — usuário pode marcar uma OP como prioritária na mão,
// além das que já vêm do relatório de Destino. Dois casos:
// 1) A OP já existe no sistema (veio da Sincronização) — só marca
//    prioridade=true nela e guarda o número/mês que o usuário informou,
//    sem duplicar o resto do dado (Descrição/Etapa/Peças/Dias Parado já
//    existem, não precisa digitar de novo).
// 2) A OP não existe em lugar nenhum — cadastro completo, guardado numa
//    lista própria (`opsManuaisPrioridade`), mesclada na hora de mostrar
//    a aba Prioridades.
// =========================================================================

// Set de IDs de OP marcadas prioritária manualmente — separado de
// prioridadesDestino de propósito, pra uma importação de Destino futura
// que não mencione essa OP não apagar a marcação manual sem querer.
function obterPrioridadesManuais() {
    try { return new Set(JSON.parse(localStorage.getItem('prioridadesManuais') || '[]')); } catch (e) { return new Set(); }
}

// =========================================================================
// 🔦 DESTAQUE — dentro das já prioritárias, o usuário quer sinalizar quais
// fazer PRIMEIRO. Independente de onde a OP vive (bancoDadosOPs ou
// opsManuaisPrioridade), pra funcionar pras duas do mesmo jeito. Visível
// pra todo mundo (inclusive visitante), só quem edita é o admin.
// =========================================================================
function obterOPsDestacadas() {
    try { return new Set(JSON.parse(localStorage.getItem('opsDestacadasPrioridade') || '[]')); } catch (e) { return new Set(); }
}
function toggleDestaquePrioridade(id) {   // `id` aqui é a chave "ciclo-OP" (ou só o número, pra OP sem ciclo)
    if (!exigirAdmin('destacar essa OP')) return;
    const destacadas = obterOPsDestacadas();
    const novoValor = !destacadas.has(id);
    if (novoValor) destacadas.add(id); else destacadas.delete(id);
    localStorage.setItem('opsDestacadasPrioridade', JSON.stringify([...destacadas]));

    // Reaplica na hora, direto no objeto — igual já fazemos com
    // prioridade/mês/número — pra já refletir sem esperar sincronizar de
    // novo, e pra viajar certo pra nuvem quando publicar.
    const op = bancoDadosOPs.find(o => chaveDaOP(o) === id);
    if (op) { op.destaque = novoValor; localStorage.setItem('bancoOPs', JSON.stringify(bancoDadosOPs)); }
    else {
        const lista = obterOpsManuaisPrioridade();
        const item = lista.find(o => chaveDaOP(o) === id);
        if (item) {
            item.destaque = novoValor; salvarOpsManuaisPrioridade(lista);
        } else {
            const automaticas = obterOpsDestinoAutomaticas();
            if (automaticas[id]) { automaticas[id].destaque = novoValor; salvarOpsDestinoAutomaticas(automaticas); }
        }
    }
    renderizarAbaPrioridades();
}

// Lista de OPs 100% cadastradas na mão (não existem em bancoDadosOPs) —
// cada uma com todos os campos que a tabela de Prioridades mostra.
function obterOpsManuaisPrioridade() {
    try { return JSON.parse(localStorage.getItem('opsManuaisPrioridade') || '[]'); } catch (e) { return []; }
}
function salvarOpsManuaisPrioridade(lista) {
    localStorage.setItem('opsManuaisPrioridade', JSON.stringify(lista));
}

function abrirModalPrioridadeManual() {
    if (!exigirAdmin('adicionar OP prioritária manual')) return;
    const opcoesEtapa = nomesEtapas.map((n, i) => `<option value="${i}">${n}</option>`).join('')
        + `<optgroup label="Locais fora das 8 etapas (costura)">`
        + [...LOCAIS_EXTRA_APROVADOS_PRIORIDADES].map(l => `<option value="local:${l}">${l}</option>`).join('')
        + `</optgroup>`;
    $('modalPrioridadeManual').innerHTML = `
        <div class="modal-card" style="width:480px; max-width:92vw; max-height:85vh; overflow-y:auto;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
                <h2 style="margin:0; font-size:16px; display:flex; align-items:center; gap:8px;"><i class="fas fa-star" style="color:#B8862A;"></i> ADICIONAR OP PRIORITÁRIA</h2>
                <button onclick="fecharModais()" class="modal-fechar-btn"><i class="fas fa-times"></i></button>
            </div>
            <div style="display:flex; flex-direction:column; gap:10px;">
                <div class="campo-meta">
                    <label>NÚMERO DA OP</label>
                    <input type="text" id="inputOPManualNumero" placeholder="Ex: 4594">
                </div>
                <div class="campo-meta">
                    <label>CICLO (preencha se o número existir em mais de um ciclo)</label>
                    <input type="text" id="inputOPManualCiclo" placeholder="Ex: 211">
                </div>
                <div id="statusOPManual" style="font-size:11px;"></div>
                <div id="camposOPManual" style="display:flex; flex-direction:column; gap:10px;">
                    <div class="campo-meta"><label>DESCRIÇÃO</label><input type="text" id="inputOPManualDesc"></div>
                    <div class="campo-meta"><label>ETAPA</label><select id="inputOPManualEtapa">${opcoesEtapa}</select></div>
                    <div class="campo-meta"><label>PEÇAS</label><input type="number" id="inputOPManualQtd" min="0"></div>
                    <div class="campo-meta"><label>DIAS PARADO</label><input type="number" id="inputOPManualDias" min="0"></div>
                </div>
                <div class="campo-meta"><label>Nº PRIORIDADE (opcional)</label><input type="text" id="inputOPManualNumPrioridade"></div>
                <div class="campo-meta"><label>MÊS DESTINO — AAAA-MM (opcional)</label><input type="text" id="inputOPManualMes" placeholder="2026-06"></div>
                <button id="btnSalvarOPManual" class="btn btn-sugestao"><i class="fas fa-check"></i> SALVAR</button>
            </div>
        </div>
    `;
    $('modalPrioridadeManual').style.display = 'flex';
    $('inputOPManualNumero').oninput = conferirOPManualExistente;
    $('inputOPManualCiclo').oninput = conferirOPManualExistente;
    $('btnSalvarOPManual').onclick = salvarOPManual;
    conferirOPManualExistente();
}

// Confere se o número digitado já existe no sistema — se sim, esconde os
// campos que já vêm de lá (Descrição/Etapa/Peças/Dias Parado), já que
// digitar de novo seria redundante e podia até contradizer o dado real.
function conferirOPManualExistente() {
    const numero = $('inputOPManualNumero').value.trim();
    const cicloDigitado = normalizarParteChaveOP($('inputOPManualCiclo') ? $('inputOPManualCiclo').value : '');
    const camposDiv = $('camposOPManual');
    const statusDiv = $('statusOPManual');
    if (!numero) { statusDiv.innerHTML = ''; camposDiv.style.display = 'flex'; return; }

    // Mesmo número em ciclos diferentes são OPs diferentes: se existe em 2+ ciclos na
    // Sincronização e o ciclo não foi informado, pede o ciclo em vez de adivinhar.
    const ciclosDoNumero = [...new Set(bancoDadosOPs.filter(o => o.id === numero).map(o => normalizarParteChaveOP(o.ciclo)))];
    if (!cicloDigitado && ciclosDoNumero.length > 1) {
        statusDiv.innerHTML = `<span style="color:#B8862A;"><i class="fas fa-triangle-exclamation"></i> Esse número existe em mais de um ciclo (${ciclosDoNumero.join(', ')}) — preencha o CICLO.</span>`;
        camposDiv.style.display = 'none';
        return;
    }
    const chave = montarChaveOP(cicloDigitado, numero);

    // Caso 1: já existe na Sincronização — dado vem de lá, esconde os
    // campos redundantes (mesmo comportamento de antes).
    const opExistente = acharOPNaSincronizacao(numero, cicloDigitado);
    if (opExistente) {
        statusDiv.innerHTML = `<span style="color:var(--cor-despacho);"><i class="fas fa-check-circle"></i> Essa OP já existe no sistema (${opExistente.desc}) — Descrição/Etapa/Peças/Dias Parado vêm de lá automaticamente.</span>`;
        camposDiv.style.display = 'none';
        $('inputOPManualNumPrioridade').value = opExistente.numeroPrioridade || '';
        $('inputOPManualMes').value = opExistente.mesDestino || '';
        return;
    }

    // Caso 2: já tem um cadastro manual completo — avisa e pré-preenche
    // com o que já existe, em vez de deixar como se fosse novo (antes
    // dizia "não encontrada" mesmo quando já existia, arriscando
    // sobrescrever sem avisar).
    const itemManual = obterOpsManuaisPrioridade().find(o => chaveDaOP(o) === (opExistente ? chaveDaOP(opExistente) : chave));
    if (itemManual) {
        statusDiv.innerHTML = `<span style="color:#B8862A;"><i class="fas fa-triangle-exclamation"></i> Essa OP já tem um cadastro manual (${itemManual.desc}) — os campos já vêm preenchidos com o que existe. Salvar vai ATUALIZAR esse cadastro, não criar um novo.</span>`;
        camposDiv.style.display = 'flex';
        $('inputOPManualDesc').value = itemManual.desc || '';
        $('inputOPManualEtapa').value = itemManual.localDestinoDetalhado ? `local:${itemManual.localDestinoDetalhado}` : String(itemManual.etapa);
        $('inputOPManualQtd').value = itemManual.qtd || 0;
        $('inputOPManualDias').value = itemManual.diasLocal || 0;
        $('inputOPManualNumPrioridade').value = itemManual.numeroPrioridade || '';
        $('inputOPManualMes').value = itemManual.mesDestino || '';
        return;
    }

    // Caso 3: já existe como automática do Destino (OP que só existe na
    // costura, montada sozinha) — mesma ideia do caso 2.
    const itemAutomatico = obterOpsDestinoAutomaticas()[chave] || obterOpsDestinoAutomaticas()[numero];
    if (itemAutomatico) {
        statusDiv.innerHTML = `<span style="color:#B8862A;"><i class="fas fa-triangle-exclamation"></i> Essa OP já foi importada automaticamente do relatório de Destino (${itemAutomatico.desc}) — os campos já vêm preenchidos com o que existe. Salvar vai ATUALIZAR essa entrada.</span>`;
        camposDiv.style.display = 'flex';
        $('inputOPManualDesc').value = itemAutomatico.desc || '';
        $('inputOPManualEtapa').value = itemAutomatico.localDestinoDetalhado ? `local:${itemAutomatico.localDestinoDetalhado}` : '0';
        $('inputOPManualQtd').value = itemAutomatico.qtd || 0;
        $('inputOPManualDias').value = itemAutomatico.diasLocal || 0;
        $('inputOPManualNumPrioridade').value = itemAutomatico.numeroPrioridade || '';
        $('inputOPManualMes').value = itemAutomatico.mesDestino || '';
        return;
    }

    // Não existe em lugar nenhum — limpa os campos (pode ter sobrado dado
    // de uma consulta anterior no mesmo modal) e deixa preencher do zero.
    statusDiv.innerHTML = `<span style="color:var(--texto-secundario);"><i class="fas fa-info-circle"></i> OP não encontrada no sistema — preencha os dados abaixo na mão.</span>`;
    camposDiv.style.display = 'flex';
    $('inputOPManualDesc').value = '';
    $('inputOPManualEtapa').value = '0';
    $('inputOPManualQtd').value = '';
    $('inputOPManualDias').value = '';
    $('inputOPManualNumPrioridade').value = '';
    $('inputOPManualMes').value = '';
}

function salvarOPManual() {
    if (!exigirAdmin('adicionar OP prioritária manual')) return;
    const numero = $('inputOPManualNumero').value.trim();
    if (!numero) { showToast('<i class="fas fa-triangle-exclamation"></i> Informe o número da OP.', true); return; }
    const numPrioridade = $('inputOPManualNumPrioridade').value.trim() || null;
    const mes = $('inputOPManualMes').value.trim() || null;
    if (mes && !/^\d{4}-\d{2}$/.test(mes)) { showToast('<i class="fas fa-triangle-exclamation"></i> Mês Destino precisa ser no formato AAAA-MM.', true); return; }

    const cicloDigitado = normalizarParteChaveOP($('inputOPManualCiclo') ? $('inputOPManualCiclo').value : '');
    const ciclosDoNumero = [...new Set(bancoDadosOPs.filter(o => o.id === numero).map(o => normalizarParteChaveOP(o.ciclo)))];
    if (!cicloDigitado && ciclosDoNumero.length > 1) { showToast(`<i class="fas fa-triangle-exclamation"></i> O número ${numero} existe em mais de um ciclo (${ciclosDoNumero.join(', ')}) — informe o CICLO.`, true, 6000); return; }
    const opExistente = acharOPNaSincronizacao(numero, cicloDigitado);
    const chave = opExistente ? chaveDaOP(opExistente) : montarChaveOP(cicloDigitado, numero);

    if (opExistente) {
        // Caso 1: a OP já existe — só marca prioridade e guarda o que é
        // extra (número/mês), sem duplicar o resto do dado.
        const manuais = obterPrioridadesManuais();
        manuais.add(chave);
        localStorage.setItem('prioridadesManuais', JSON.stringify([...manuais]));
        opExistente.prioridade = true;
        if (numPrioridade) {
            opExistente.numeroPrioridade = numPrioridade;
            const n = obterNumerosPrioridade(); n[chave] = numPrioridade; localStorage.setItem('numerosPrioridade', JSON.stringify(n));
        }
        if (mes) {
            opExistente.mesDestino = mes;
            const m = obterOpsMesDestino(); m[chave] = mes; localStorage.setItem('opsMesDestino', JSON.stringify(m));
        }
        localStorage.setItem('bancoOPs', JSON.stringify(bancoDadosOPs));
    } else {
        // Caso 2: cadastro completo, OP não existe em lugar nenhum
        const desc = $('inputOPManualDesc').value.trim();
        const qtd = parseInt($('inputOPManualQtd').value) || 0;
        const diasLocal = parseInt($('inputOPManualDias').value) || 0;
        if (!desc) { showToast('<i class="fas fa-triangle-exclamation"></i> Preencha a descrição.', true); return; }
        // O valor do menu pode ser um índice numérico normal (0-7) ou um
        // dos locais extras aprovados, prefixado com "local:" — os dois
        // formatos moram no mesmo <select>, então separa aqui.
        const valorEtapa = $('inputOPManualEtapa').value;
        let etapa = null, localDestinoDetalhado = null;
        if (valorEtapa.startsWith('local:')) localDestinoDetalhado = valorEtapa.slice('local:'.length);
        else etapa = parseInt(valorEtapa);
        const lista = obterOpsManuaisPrioridade();
        const jaExiste = lista.findIndex(o => chaveDaOP(o) === chave);
        const entrada = { id: numero, ciclo: cicloDigitado, desc, etapa, qtd, diasLocal, mesDestino: mes, numeroPrioridade: numPrioridade, localDestinoDetalhado };
        if (jaExiste !== -1) lista[jaExiste] = entrada; else lista.push(entrada);
        salvarOpsManuaisPrioridade(lista);
    }

    fecharModais();
    cacheGruposPorReferencia = null;
    renderizarTudoImediato();
    showToast(`<i class="fas fa-check"></i> OP ${numero} adicionada às prioritárias!`);
}

// Remove uma marcação manual — se a OP existe no sistema, só desmarca a
// prioridade (não some com a OP, ela continua existindo normal); se for um
// cadastro 100% manual, remove da lista de vez.
function removerPrioridadeManual(chave) {   // chave "ciclo-OP" (ou só o número, pra OP sem ciclo)
    if (!exigirAdmin('remover prioridade manual')) return;
    const { ciclo: cicloDaChave, op: numero } = separarChaveOP(chave);
    if (!confirm(`Remover a marcação de prioridade da OP ${numero}${cicloDaChave ? ` (ciclo ${cicloDaChave})` : ''}? Se ela ainda estiver no próximo relatório de Destino, pode voltar a aparecer.`)) return;

    const manuais = obterPrioridadesManuais();
    const automaticas = obterOpsDestinoAutomaticas();
    if (manuais.has(chave)) {
        manuais.delete(chave);
        localStorage.setItem('prioridadesManuais', JSON.stringify([...manuais]));
        const op = bancoDadosOPs.find(o => chaveDaOP(o) === chave);
        if (op) {
            const prioridadesDestino = obterPrioridadesDestino();
            op.prioridade = prioridadesDestino.has(chave); // volta a valer só o que o Destino diz
            localStorage.setItem('bancoOPs', JSON.stringify(bancoDadosOPs));
        }
    } else if (automaticas[chave]) {
        delete automaticas[chave];
        salvarOpsDestinoAutomaticas(automaticas);
    } else {
        const lista = obterOpsManuaisPrioridade().filter(o => chaveDaOP(o) !== chave);
        salvarOpsManuaisPrioridade(lista);
    }
    cacheGruposPorReferencia = null;
    renderizarTudoImediato();
    showToast(`<i class="fas fa-check"></i> Removida.`);
}

function obterPedidosPendentes() {
    const salvo = localStorage.getItem('pedidosPendentes');
    if (!salvo) return [];
    try { return JSON.parse(salvo); } catch (e) { return []; }
}

// TODOS os itens da última importação de pedidos, mesmo os já cobertos (falta
// = 0) — usado só pra busca/consulta (Busca de Pedido, Sequenciamento), nunca
// pra contagem de pendentes/urgência, que continuam só com quem falta de
// verdade. Se não tiver essa lista (planilha antiga, importada antes dessa
// funcionalidade existir), cai pros pendentes — melhor achar menos do que
// travar a busca.
function obterTodosPedidos() {
    const salvo = localStorage.getItem('todosPedidos');
    if (!salvo) return obterPedidosPendentes();
    try { return JSON.parse(salvo); } catch (e) { return obterPedidosPendentes(); }
}

// Agrupa TODOS os itens de pedido por referência+tamanho, somando o campo
// escolhido — "faltaEstoque" (coluna X: quanto falta descontando só o
// estoque, sem descontar o que já está em produção) ou "faltaProduzir"
// (coluna AB "Falta OP": quanto falta depois de descontar TAMBÉM as OPs já
// em produção). Ex: pedido 123 (ref ABC tam 1, falta 10) + pedido 1234
// (mesma ref/tam, falta 20) -> vira uma linha só, "ABC tam 1: 30 no total".
function obterNecessidadePorReferenciaETamanho(campo) {
    campo = campo === 'faltaProduzir' ? 'faltaProduzir' : 'faltaEstoque';
    const mapa = new Map();
    obterTodosPedidos().forEach(p => {
        const falta = parseFloat(p[campo]) || 0;
        if (falta <= 0 || !p.referencia) return;
        const chave = `${p.referencia}|${p.tam}`;
        if (!mapa.has(chave)) mapa.set(chave, { referencia: p.referencia, tam: p.tam, total: 0, pedidos: new Set() });
        const item = mapa.get(chave);
        item.total += falta;
        item.pedidos.add(p.pedido);
    });
    return [...mapa.values()]
        .map(i => ({ referencia: i.referencia, tam: i.tam, total: i.total, qtdPedidos: i.pedidos.size, pedidos: [...i.pedidos] }))
        .sort((a, b) => b.total - a.total);
}

// Compara a urgência de 2 itens de pedido pendente: sinalização manual do
// pedido (Prior) primeiro, depois data de chegada com desempate por
// prioridade de cliente dentro de uma janela de 7 dias.
function compararUrgenciaPedidos(a, b) {
    const JANELA_DIAS = 7;

    const aEspecial = a.prior !== 99, bEspecial = b.prior !== 99;
    if (aEspecial !== bEspecial) return aEspecial ? -1 : 1;
    if (aEspecial && bEspecial && a.prior !== b.prior) return a.prior - b.prior;

    if (!a.chegada && !b.chegada) return 0;
    if (!a.chegada) return 1;
    if (!b.chegada) return -1;
    const dA = new Date(a.chegada), dB = new Date(b.chegada);
    const diffDias = Math.abs(dA - dB) / 86400000;

    if (diffDias <= JANELA_DIAS) {
        const listaClientes = obterListaPrioridadeClientes();
        const posA = listaClientes.findIndex(c => a.cliente.toUpperCase().includes(c.toUpperCase()));
        const posB = listaClientes.findIndex(c => b.cliente.toUpperCase().includes(c.toUpperCase()));
        const rankA = posA === -1 ? Infinity : posA;
        const rankB = posB === -1 ? Infinity : posB;
        if (rankA !== rankB) return rankA - rankB;
    }
    return dA - dB;
}

// null = ordena pela urgência de sempre (prior especial > atraso > prazo);
// 'asc'/'desc' = usuário clicou na coluna CHEGADA, ordena só por data
let ordenacaoPedidosPendentesData = null;

function ordenarPedidosPendentesPorData() {
    ordenacaoPedidosPendentesData = ordenacaoPedidosPendentesData === 'asc' ? 'desc' : 'asc';
    renderizarPedidosPendentes();
}

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

// =========================================================================
// ✂️ FILA DE CORTE — planilha geral "POR_OP" (todos os setores). Agrupa
// peças/OPs por local, restrito aos 11 setores que compõem o pipeline até o
// Corte, e calcula quantos dias de fila cada um representa, usando a média
// diária real do setor CORTE (já lançada na aba Gestão Mensal).
// =========================================================================
// Aba URGÊNCIAS — pega a lista de OPs da aba "Implantação" de uma planilha
// própria do usuário, e cruza com a POR_OP (mesmo arquivo usado em outras
// abas do sistema) pra manter local/quantidade atualizados. Guardado em
// DOIS lugares: a base (do jeito que veio da Implantação, sem cruzar) e o
// resultado exibido (depois do cruzamento) — assim, importar a POR_OP de
// novo sempre recalcula A PARTIR da base, em vez de ir empilhando
// desdobramento em cima de desdobramento se importar várias vezes seguidas.
function obterImplantacaoBase() {
    try { return JSON.parse(localStorage.getItem('implantacaoBase') || '[]'); } catch (e) { return []; }
}
function salvarImplantacaoBase(lista) { localStorage.setItem('implantacaoBase', JSON.stringify(lista)); }
function obterImplantacaoOPs() {
    try { return JSON.parse(localStorage.getItem('implantacaoOPs') || '[]'); } catch (e) { return []; }
}
function salvarImplantacaoOPs(lista) { localStorage.setItem('implantacaoOPs', JSON.stringify(lista)); }

function processarImplantacao() {
    if (!exigirAdminOuUsuario('importar a planilha de Implantação')) return;
    if (!exigirBibliotecaExcel()) return;
    const input = $('inputImplantacao'); if (!input.files[0]) return;
    const r = new FileReader();
    r.onload = function (e) {
        try {
            const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
            // O arquivo do usuário tem VÁRIAS abas — procura uma chamada
            // "Implantação" (tolerante a acento/maiúscula) em vez de supor
            // que é sempre a primeira aba do arquivo.
            const nomeAba = wb.SheetNames.find(n => n.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().includes('IMPLANTA')) || wb.SheetNames[0];
            // Limita o intervalo lido (até a coluna Q, 20 mil linhas) — sem
            // isso, uma planilha que reporte um "intervalo usado" muito
            // maior que o dado real (comum em arquivo Excel com formatação
            // espalhada por engano) pode travar a importação tentando
            // processar células vazias por minutos.
            const rows = XLSX.utils.sheet_to_json(wb.Sheets[nomeAba], { header: 1, range: 'A1:Q20000' });
            if (!rows.length) throw new Error("Planilha vazia.");

            const cab = rows[0].map(c => String(c || '').trim().toUpperCase());
            const idx = {
                chave: cab.findIndex(c => c === 'CHAVE'),
                pedido: cab.findIndex(c => c === 'PEDIDO'),
                grade: cab.findIndex(c => c === 'GRADE'),
                local: cab.findIndex(c => c.includes('DESCRI') && c.includes('LOCAL')),
                referencia: cab.findIndex(c => c.includes('REFER') && !c.includes('DESCRI')),
                descRef: cab.findIndex(c => c.includes('DESCRI') && c.includes('REFER')),
                cor: cab.findIndex(c => c === 'COR'),
                ciclo: cab.findIndex(c => c === 'CICLO'),
                op: cab.findIndex(c => c === 'OP'),
                qtd: cab.findIndex(c => c.includes('QT') && c.includes('LOCAL')),
                tipoProduto: cab.findIndex(c => c.includes('TIPO') && c.includes('PRODUTO')),
                dataFinalizacao: cab.findIndex(c => c.includes('FINALIZ')),
                reprogramado: cab.findIndex(c => c.includes('REPROGRAM')),
            };
            if (idx.op === -1) throw new Error("Não encontrei a coluna OP no cabeçalho.");

            const lista = [];
            for (let i = 1; i < rows.length; i++) {
                const row = rows[i]; if (!row) continue;
                const opVal = row[idx.op] !== undefined && row[idx.op] !== null ? String(row[idx.op]).trim() : '';
                if (!opVal) continue;
                const pega = (chave) => idx[chave] !== -1 && row[idx[chave]] !== undefined && row[idx[chave]] !== null ? String(row[idx[chave]]).trim() : '';
                lista.push({
                    chave: pega('chave'), pedido: pega('pedido'), grade: pega('grade'), local: pega('local'),
                    referencia: pega('referencia'), descRef: pega('descRef'), cor: pega('cor'), ciclo: pega('ciclo'),
                    op: opVal, qtd: idx.qtd !== -1 ? (parseFloat(row[idx.qtd]) || 0) : 0, tipoProduto: pega('tipoProduto'),
                    dataFinalizacao: idx.dataFinalizacao !== -1 ? extrairDataExcel(row[idx.dataFinalizacao]) : null,
                    reprogramado: pega('reprogramado'),
                });
            }

            salvarImplantacaoBase(lista);
            salvarImplantacaoOPs(lista); // sem cruzar com POR_OP ainda — fica igual à base até importar ela
            reconciliarFiltroLocalUrgencias();
            renderizarUrgencias();
            showToast(`<i class="fas fa-check"></i> ${lista.length} OPs importadas da aba Implantação.`);
            marcarUrgenciasPendentesEPublicar();   // sobe pra nuvem (sem await: a importação já terminou)
        } catch (err) {
            alert("Erro ao importar a planilha de Implantação: " + err.message);
        }
        input.value = '';
    };
    r.readAsArrayBuffer(input.files[0]);
}

// Compara a lista de Urgências ANTES e DEPOIS de importar a POR_OP (igual
// o balanço da sincronização faz com as etapas), pra mostrar o que andou.
// Casa por ciclo+OP. Devolve 4 grupos:
//  - movimentadas: mudou o(s) local(is) da OP
//  - qtdAlterada: continua no(s) mesmo(s) local(is), mas a quantidade mudou
//  - sairam: estava na POR_OP e agora não está mais (provavelmente seguiu adiante)
//  - voltaram: não estava na POR_OP e agora aparece
function compararUrgenciasAntesDepois(antes, depois) {
    const agrupar = lista => {
        const mapa = new Map();
        lista.forEach(o => {
            const k = `${o.ciclo}-${o.op}`;
            if (!mapa.has(k)) mapa.set(k, { op: o.op, ciclo: o.ciclo, naoEncontrado: !!o.naoEncontradoPorOP, entradas: [] });
            mapa.get(k).entradas.push({ local: o.local || '—', qtd: o.qtd || 0 });
        });
        mapa.forEach(v => v.entradas.sort((a, b) => a.local.localeCompare(b.local)));
        return mapa;
    };
    const A = agrupar(antes), B = agrupar(depois);
    const rotuloLocais = v => v.entradas.map(e => e.local).join(' + ');
    const rotuloQtds = v => v.entradas.map(e => e.qtd.toLocaleString('pt-BR')).join(' + ');
    const resultado = { movimentadas: [], qtdAlterada: [], sairam: [], voltaram: [] };

    B.forEach((novo, k) => {
        const velho = A.get(k);
        if (!velho) return;
        if (!velho.naoEncontrado && novo.naoEncontrado) {
            resultado.sairam.push({ op: novo.op, ciclo: novo.ciclo, de: rotuloLocais(velho) });
        } else if (velho.naoEncontrado && !novo.naoEncontrado) {
            resultado.voltaram.push({ op: novo.op, ciclo: novo.ciclo, para: rotuloLocais(novo) });
        } else if (!velho.naoEncontrado && !novo.naoEncontrado) {
            const de = rotuloLocais(velho), para = rotuloLocais(novo);
            if (de !== para) {
                resultado.movimentadas.push({ op: novo.op, ciclo: novo.ciclo, de, para });
            } else if (rotuloQtds(velho) !== rotuloQtds(novo)) {
                resultado.qtdAlterada.push({ op: novo.op, ciclo: novo.ciclo, local: para, de: rotuloQtds(velho), para: rotuloQtds(novo) });
            }
        }
    });
    return resultado;
}

function exibirBalancoUrgencias(bal) {
    const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const chip = (texto, extra = '') => `<span class="pill" style="background:var(--bg-card); border:1px solid var(--borda-cor); color:var(--texto-cor); margin:2px 3px 0 0; display:inline-block; ${extra}">${esc(texto)}</span>`;
    const rotuloOP = o => `${o.op}${o.ciclo ? ' · ' + o.ciclo : ''}`;
    const total = bal.movimentadas.length + bal.qtdAlterada.length + bal.sairam.length + bal.voltaram.length;

    const cabecalho = (icone, cor) => `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; border-bottom:2px solid var(--borda-cor); padding-bottom:10px; flex-shrink:0;">
            <h2 style="margin:0; color:var(--texto-cor); display:flex; align-items:center; gap:10px; font-size:16px;"><i class="fas ${icone}" style="color:${cor};"></i> BALANÇO DA POR_OP</h2>
            <button onclick="fecharModais()" class="modal-fechar-btn"><i class="fas fa-times"></i></button>
        </div>`;

    if (!total) {
        $('modalBalancoUrgencias').innerHTML = `
            <div class="modal-card" style="width:480px; max-width:90vw; border-top:5px solid var(--cor-despacho);">
                ${cabecalho('fa-check-circle', 'var(--cor-despacho)')}
                <div style="text-align:center; padding:20px; color:var(--texto-secundario);">Nenhuma movimentação desde a última importação da POR_OP — tudo igual.</div>
            </div>`;
        $('modalBalancoUrgencias').style.display = 'flex';
        return;
    }

    // Movimentadas: junta por par "de → para", com os números das OPs dentro
    const pares = new Map();
    bal.movimentadas.forEach(m => {
        const k = `${m.de}>>${m.para}`;
        if (!pares.has(k)) pares.set(k, { de: m.de, para: m.para, ops: [] });
        pares.get(k).ops.push(m);
    });
    const movimentadasHtml = [...pares.values()].sort((a, b) => b.ops.length - a.ops.length).map(g => `
        <div style="border-left:4px solid var(--cor-sugestao); background:var(--bg-painel); border-radius:8px; padding:12px; margin-bottom:10px;">
            <div style="font-size:12px; font-weight:700; margin-bottom:6px; display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                <span class="pill" style="background:var(--cor-historico);">${esc(g.de)}</span>
                <i class="fas fa-arrow-right" style="color:var(--texto-secundario);"></i>
                <span class="pill" style="background:var(--cor-sugestao);">${esc(g.para)}</span>
                <span style="color:var(--texto-secundario); font-weight:400;">(${g.ops.length} OP${g.ops.length > 1 ? 's' : ''})</span>
            </div>
            <div>${g.ops.map(o => chip(rotuloOP(o))).join('')}</div>
        </div>`).join('');

    const qtdHtml = !bal.qtdAlterada.length ? '' : `
        <div style="margin-top:14px;">
            <div style="font-size:12px; font-weight:700; color:var(--cor-sugestao); margin-bottom:6px;"><i class="fas fa-scale-balanced"></i> QUANTIDADE ALTERADA (${bal.qtdAlterada.length}) <span style="font-weight:400; color:var(--texto-secundario);">— mesmo local, quantidade diferente</span></div>
            <div>${bal.qtdAlterada.map(o => chip(`${rotuloOP(o)} · ${o.de} → ${o.para} pçs`)).join('')}</div>
        </div>`;

    const voltaramHtml = !bal.voltaram.length ? '' : `
        <div style="margin-top:14px;">
            <div style="font-size:12px; font-weight:700; color:var(--cor-despacho); margin-bottom:6px;"><i class="fas fa-plus-circle"></i> PASSARAM A APARECER NA POR_OP (${bal.voltaram.length})</div>
            <div>${bal.voltaram.map(o => `<span class="pill pill-ok" style="margin:2px 3px 0 0; display:inline-block;">${esc(rotuloOP(o))} · agora em ${esc(o.para)}</span>`).join('')}</div>
        </div>`;

    const sairamHtml = !bal.sairam.length ? '' : `
        <div style="margin-top:14px;">
            <div style="font-size:12px; font-weight:700; color:var(--texto-secundario); margin-bottom:6px;"><i class="fas fa-sign-out-alt"></i> SAÍRAM DA POR_OP (${bal.sairam.length}) <span style="font-weight:400;">— deixaram de aparecer; o local mostrado volta a ser o da Implantação</span></div>
            <div>${bal.sairam.map(o => `<span class="pill" style="background:var(--cor-historico); margin:2px 3px 0 0; display:inline-block;">${esc(rotuloOP(o))} · estava em ${esc(o.de)}</span>`).join('')}</div>
        </div>`;

    $('modalBalancoUrgencias').innerHTML = `
        <div class="modal-card" style="width:680px; max-width:92vw; border-top:5px solid var(--cor-sugestao); max-height:85vh;">
            ${cabecalho('fa-right-left', 'var(--cor-sugestao)')}
            <div style="overflow-y:auto; flex:1;">
                ${movimentadasHtml || '<div style="text-align:center; padding:10px; color:var(--texto-secundario); font-size:12px;">Nenhuma OP trocou de local.</div>'}
                ${qtdHtml}${voltaramHtml}${sairamHtml}
            </div>
        </div>`;
    $('modalBalancoUrgencias').style.display = 'flex';
}

// Cruza a base da Implantação com a POR_OP, atualizando local/quantidade.
// Uma OP pode aparecer em MAIS de um local na POR_OP (movimentação
// parcial — parte das peças já saiu, parte ainda não) — confirmado com o
// usuário: nesse caso, desdobra em uma linha por local, cada uma com sua
// quantidade, SEM pedir decisão nenhuma (não é ambiguidade, é a realidade
// física da OP estar dividida mesmo).
function processarPorOPParaUrgencias() {
    if (!exigirAdminOuUsuario('importar a POR_OP pra Urgências')) return;
    if (!exigirBibliotecaExcel()) return;
    const input = $('inputPorOPUrgencias'); if (!input.files[0]) return;
    const r = new FileReader();
    r.onload = function (e) {
        try {
            const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
            // Mesma proteção da importação da Implantação — evita travar se
            // o "intervalo usado" reportado pela planilha for muito maior
            // que o dado real.
            const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, range: 'A1:T50000' });
            if (!rows.length) throw new Error("Planilha vazia.");

            const cab = rows[0].map(c => String(c || '').trim().toUpperCase());
            const idxOP = cab.findIndex(c => c === 'OP');
            const idxCiclo = cab.findIndex(c => c === 'CICLO');
            const idxDescLocal = cab.findIndex(c => c.includes('DESCRI') && c.includes('LOCAL'));
            const idxQtd = cab.findIndex(c => c.includes('QT') && c.includes('LOCAL'));
            const faltando = [];
            if (idxOP === -1) faltando.push('OP');
            if (idxCiclo === -1) faltando.push('Ciclo');
            if (idxDescLocal === -1) faltando.push('Descrição Local');
            if (idxQtd === -1) faltando.push('Qt OP Local');
            if (faltando.length) throw new Error("Não encontrei as colunas: " + faltando.join(', ') + ".");

            // O MESMO número de OP pode existir em ciclos diferentes (ex: 111
            // e 211) — são OPs distintas. Cruzar só pelo número misturava as
            // duas (mesma coisa que a coluna "chave" da Implantação resolve
            // concatenando ciclo e OP). Normaliza tirando espaço e o ".0"
            // que número vindo do Excel às vezes carrega.
            const normalizar = v => (v === undefined || v === null) ? '' : String(v).trim().replace(/\.0+$/, '');
            const chaveCicloOP = (ciclo, op) => `${normalizar(ciclo)}-${normalizar(op)}`;

            // Agrupa por ciclo+OP — pode ter mais de uma linha (local
            // diferente) pra mesma OP, exatamente o caso de movimentação parcial.
            const porOP = new Map();
            for (let i = 1; i < rows.length; i++) {
                const row = rows[i]; if (!row) continue;
                const opVal = normalizar(row[idxOP]);
                if (!opVal) continue;
                const chave = chaveCicloOP(row[idxCiclo], opVal);
                const local = String(row[idxDescLocal] ?? '').trim();
                const qtd = parseFloat(row[idxQtd]) || 0;
                if (!porOP.has(chave)) porOP.set(chave, []);
                porOP.get(chave).push({ local, qtd });
            }

            const base = obterImplantacaoBase();
            if (!base.length) throw new Error("Importe primeiro a planilha de Implantação.");
            let qtdSemCorrespondencia = 0, qtdDesdobradas = 0;
            const resultado = [];
            base.forEach((item, idxBase) => {
                const locais = porOP.get(chaveCicloOP(item.ciclo, item.op));
                if (!locais || !locais.length) {
                    resultado.push({ ...item, naoEncontradoPorOP: true });
                    qtdSemCorrespondencia++;
                } else if (locais.length === 1) {
                    resultado.push({ ...item, local: locais[0].local, qtd: locais[0].qtd, naoEncontradoPorOP: false });
                } else {
                    // grupoDesdobra = qual linha da Implantação gerou essas linhas — é o que
                    // deixa a tela juntar as linhas da MESMA OP, mostrar o selo "EM N LOCAIS"
                    // e listar todos os locais (a mesma OP pode aparecer 2x na própria
                    // Implantação, ex: dois pedidos; cada uma vira o seu grupo).
                    locais.forEach(l => resultado.push({ ...item, local: l.local, qtd: l.qtd, naoEncontradoPorOP: false, grupoDesdobra: idxBase }));
                    qtdDesdobradas++;
                }
            });

            // Guarda a lista de ANTES pra comparar. Só dá pra comparar se já
            // teve uma importação da POR_OP antes (itens cruzados têm o campo
            // naoEncontradoPorOP; lista recém-saída da Implantação não tem) —
            // na primeira vez tudo "mudaria" do local da Implantação pro da
            // POR_OP e o balanço só seria ruído.
            const antes = obterImplantacaoOPs();
            const jaTinhaCruzamento = antes.some(o => o.naoEncontradoPorOP !== undefined);

            salvarImplantacaoOPs(resultado);
            reconciliarFiltroLocalUrgencias();
            renderizarUrgencias();
            let msg = `<i class="fas fa-check"></i> Local/quantidade atualizados pela POR_OP.`;
            if (qtdDesdobradas) msg += ` ${qtdDesdobradas} OP(s) desdobrada(s) por estar em mais de um local.`;
            if (qtdSemCorrespondencia) msg += ` ${qtdSemCorrespondencia} OP(s) não encontrada(s) na POR_OP.`;
            showToast(msg);
            if (jaTinhaCruzamento) exibirBalancoUrgencias(compararUrgenciasAntesDepois(antes, resultado));
            marcarUrgenciasPendentesEPublicar();
        } catch (err) {
            alert("Erro ao importar a POR_OP: " + err.message);
        }
        input.value = '';
    };
    r.readAsArrayBuffer(input.files[0]);
}

// Exporta a lista de Urgências em Excel, no MESMO formato (colunas e ordem) da
// aba "Implantação" da planilha original — pra poder colar de volta lá ou
// reimportar aqui. Diferença: na planilha original a "chave" é fórmula
// (=Ciclo&"-"&OP) e a "Descrição Local" é um PROCV na aba Base; aqui já saem
// PRONTAS, como valor: chave escrita e local já atualizado pela POR_OP. OP
// que está em mais de um local (movimentação parcial) sai em uma linha por
// local, cada uma com a sua quantidade (a chave se repete nessas linhas — é
// a mesma OP). Última coluna, extra, diz se a linha foi atualizada pela
// POR_OP ou não; quem colar só as 13 primeiras colunas ignora ela.
// Sempre exporta a lista INTEIRA, não só o que está filtrado na tela, na
// ordem em que veio da Implantação.
function montarExportacaoUrgencias(lista) {
    const cabecalho = ['chave', 'Pedido', 'Grade', 'Descrição Local', 'Referência', 'Descrição Referência', 'Cor', 'Ciclo', 'OP', 'Qt OP Local', 'Tipo Produto', 'DT finalização', 'Reprogramado', 'Situação POR_OP'];
    // Ciclo e OP voltam a ser número quando só têm dígitos — como na planilha original
    const comoNumero = v => { const t = String(v ?? '').trim(); return /^\d+$/.test(t) ? Number(t) : t; };
    const linhas = lista.map(o => {
        // Data como número de série do Excel (data de verdade, não texto), calculada
        // pelo dia/mês/ano LOCAIS — a Data Finalização é criada à meia-noite local na importação
        const d = o.dataFinalizacao ? new Date(o.dataFinalizacao) : null;
        const celulaData = (d && !isNaN(d.getTime()))
            ? { t: 'n', v: Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000 + 25569, z: 'dd/mm/yyyy' }
            : null;
        const emLocais = o.grupoDesdobra !== undefined ? lista.filter(x => x.grupoDesdobra === o.grupoDesdobra).length : 0;
        const situacao = o.naoEncontradoPorOP === true ? 'NÃO ENCONTRADA'
            : o.naoEncontradoPorOP === false ? `Atualizada pela POR_OP${emLocais > 1 ? ` (OP em ${emLocais} locais)` : ''}` : 'POR_OP ainda não importada';
        return [
            `${String(o.ciclo ?? '').trim()}-${String(o.op ?? '').trim()}`,
            // null (e não '') nos campos vazios: '' vira uma célula de texto vazio, que o
            // Excel conta como preenchida (ÉVAZIO/CONT.VALORES se enganam); null deixa a célula realmente vazia
            o.pedido || null, o.grade || null, o.local || null, o.referencia || null, o.descRef || null, o.cor || null,
            comoNumero(o.ciclo), comoNumero(o.op), o.qtd || 0, o.tipoProduto || null, celulaData, o.reprogramado || null, situacao,
        ];
    });
    return { cabecalho, linhas };
}

function exportarUrgenciasExcel() {
    if (!exigirBibliotecaExcel()) return;
    const lista = obterImplantacaoOPs();
    if (!lista.length) return alert('Não há nada pra exportar — importe a planilha de Implantação primeiro.');

    // Sem POR_OP importada os locais saem como vieram da Implantação (que na
    // planilha original muitas vezes é #N/A) — avisa antes de gerar.
    const jaCruzou = lista.some(o => o.naoEncontradoPorOP !== undefined);
    if (!jaCruzou && !confirm('A POR_OP ainda não foi importada, então os locais vão sair como vieram da Implantação (sem atualizar).\n\nExportar mesmo assim?')) return;

    const { cabecalho, linhas } = montarExportacaoUrgencias(lista);
    const ws = XLSX.utils.aoa_to_sheet([cabecalho, ...linhas]);
    ws['!cols'] = [12, 34, 22, 36, 12, 50, 8, 7, 8, 11, 16, 14, 26, 26].map(w => ({ wch: w }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Implantação'); // mesmo nome da aba original

    const hoje = new Date(), dois = n => String(n).padStart(2, '0');
    XLSX.writeFile(wb, `Urgencias_${hoje.getFullYear()}-${dois(hoje.getMonth() + 1)}-${dois(hoje.getDate())}.xlsx`);

    const opsDistintas = new Set(lista.map(o => `${o.ciclo}-${o.op}`)).size;
    const naoEnc = lista.filter(o => o.naoEncontradoPorOP === true).length;
    showToast(`<i class="fas fa-file-excel"></i> ${lista.length} linhas exportadas (${opsDistintas} OPs).${naoEnc ? ` ${naoEnc} sem correspondência na POR_OP — local original.` : ''}`);
}

// Pedido/Descrição Referência/Reprogramado às vezes vêm bem longos —
// sem isso, o texto quebrava em 2-3 linhas e deixava a tabela com altura
// de linha toda desigual ("serrilhada"). Trunca numa linha só, com o
// texto completo disponível passando o mouse.
function celulaTruncadaUrgencias(texto, larguraMaxPx) {
    if (!texto) return '';
    const escapado = String(texto).replace(/"/g, '&quot;');
    return `<span style="display:inline-block; vertical-align:middle; max-width:${larguraMaxPx}px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${escapado}">${texto}</span>`;
}

// ===== URGÊNCIAS NA NUVEM =====
// A lista de Urgências (base da Implantação + resultado depois da POR_OP) vale
// pra quem a importa E pra quem só olha, em computadores diferentes — então fica
// numa linha só da tabela `urgencias_estado` (SQL 25). A importação SUBSTITUI a
// lista inteira, igual já acontecia localmente.
// REGRAS PRA NÃO PERDER DADO:
//  - O carimbo de "qual versão é mais nova" vem do SERVIDOR (trigger no SQL), nunca
//    do relógio do computador — relógio errado já deu problema por aqui.
//  - Se a importação não chegou na nuvem (falha, sem login, tabela ainda não criada),
//    fica marcada como PENDENTE: ao abrir a aba o sistema tenta subir DE NOVO e, enquanto
//    estiver pendente, NUNCA troca a lista local por uma versão mais antiga da nuvem.
//  - Falha na nuvem não atrapalha o uso local da aba.
let urgenciasSincronizando = false;
let urgenciasAvisoTabelaDado = false;

function urgenciasTabelaFaltando(e) {
    const t = `${e && e.code || ''} ${e && e.message || ''}`;
    return /PGRST205|42P01|schema cache|does not exist/i.test(t);
}

function atualizarInfoNuvemUrgencias() {
    const el = $('urgenciasInfoNuvem'); if (!el) return;
    let meta = null; try { meta = JSON.parse(localStorage.getItem('urgenciasMetaNuvem') || 'null'); } catch (e) { /* ignora */ }
    if (localStorage.getItem('urgenciasPendentePublicar')) {
        el.innerHTML = '<i class="fas fa-triangle-exclamation"></i> SÓ NESTE NAVEGADOR — ainda não foi salva na nuvem';
        el.style.color = '#FFD08A'; el.title = 'A última importação não chegou na nuvem. Ao abrir esta aba o sistema tenta de novo.';
    } else if (meta && meta.em) {
        const d = new Date(meta.em);
        el.innerHTML = `<i class="fas fa-cloud"></i> Atualizada${meta.por ? ' por ' + String(meta.por).replace(/[<&]/g, '') : ''} em ${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
        el.style.color = ''; el.title = 'Salva na nuvem: quem abrir esta aba vê a mesma lista.';
    } else { el.textContent = ''; el.title = ''; }
}

function avisarFalhaNuvemUrgencias(e) {
    registrarLogDebug('error', ['Urgências na nuvem: ' + (e && e.message)]);
    if (urgenciasTabelaFaltando(e)) {
        if (!urgenciasAvisoTabelaDado) { urgenciasAvisoTabelaDado = true; showToast('<i class="fas fa-triangle-exclamation"></i> A nuvem ainda não tem a tabela das Urgências (falta rodar o SQL 25 no Supabase). A lista está salva só neste navegador.', true, 9000); }
    } else {
        showToast('<i class="fas fa-triangle-exclamation"></i> Não consegui salvar a lista na nuvem (' + ((e && e.message) || 'erro') + '). Ela continua neste navegador e eu tento de novo quando você abrir a aba.', true, 8000);
    }
}

// Chamado logo depois de uma importação: marca como pendente ANTES de tentar
// (se a aba fechar no meio, a pendência não se perde) e tenta subir.
function marcarUrgenciasPendentesEPublicar() {
    localStorage.setItem('urgenciasPendentePublicar', '1');
    atualizarInfoNuvemUrgencias();
    return publicarUrgenciasNaNuvem();
}

async function publicarUrgenciasNaNuvem() {
    if (!supabaseClient || !sessaoAdminAtual) { atualizarInfoNuvemUrgencias(); return false; }
    try {
        const por = String((sessaoAdminAtual.user && sessaoAdminAtual.user.email) || '').split('@')[0].toUpperCase();
        const { data, error } = await supabaseClient.from('urgencias_estado')
            .upsert({ id: 'atual', base: obterImplantacaoBase(), ops: obterImplantacaoOPs(), atualizado_por: por }, { onConflict: 'id' })
            .select('atualizado_em').single();
        if (error) throw error;
        localStorage.setItem('urgenciasAtualizadoEm', data.atualizado_em);
        localStorage.setItem('urgenciasMetaNuvem', JSON.stringify({ por, em: data.atualizado_em }));
        localStorage.removeItem('urgenciasPendentePublicar');
        atualizarInfoNuvemUrgencias();
        showToast('<i class="fas fa-cloud-upload-alt"></i> Lista de Urgências salva na nuvem.', false, 3000);
        return true;
    } catch (e) {
        avisarFalhaNuvemUrgencias(e);
        atualizarInfoNuvemUrgencias();
        return false;
    }
}

// Ao abrir a aba: pendente → tenta subir; nuvem mais nova (ou local vazio/sem carimbo) → baixa;
// nuvem vazia e lista local existente → sobe (1ª vez depois dessa mudança).
async function carregarUrgenciasDaNuvem() {
    if (!supabaseClient || !sessaoAdminAtual || urgenciasSincronizando) { atualizarInfoNuvemUrgencias(); return; }
    urgenciasSincronizando = true;
    try {
        if (localStorage.getItem('urgenciasPendentePublicar')) { await publicarUrgenciasNaNuvem(); return; }
        const { data: meta, error } = await supabaseClient.from('urgencias_estado').select('atualizado_em, atualizado_por').eq('id', 'atual').maybeSingle();
        if (error) { avisarFalhaNuvemUrgencias(error); return; }
        const local = obterImplantacaoOPs();
        if (!meta) { if (local.length) await marcarUrgenciasPendentesEPublicar(); return; }
        const carimbo = localStorage.getItem('urgenciasAtualizadoEm');
        const nuvemMs = new Date(meta.atualizado_em).getTime(), localMs = carimbo ? new Date(carimbo).getTime() : 0;
        if (local.length && carimbo && nuvemMs <= localMs) return;   // já está igual
        const { data: cheio, error: e2 } = await supabaseClient.from('urgencias_estado').select('base, ops, atualizado_em, atualizado_por').eq('id', 'atual').single();
        if (e2) { avisarFalhaNuvemUrgencias(e2); return; }
        if (!Array.isArray(cheio.ops) || !cheio.ops.length) { if (local.length) await marcarUrgenciasPendentesEPublicar(); return; } // nunca troca uma lista local por uma nuvem VAZIA
        salvarImplantacaoBase(cheio.base || []); salvarImplantacaoOPs(cheio.ops);
        localStorage.setItem('urgenciasAtualizadoEm', cheio.atualizado_em);
        localStorage.setItem('urgenciasMetaNuvem', JSON.stringify({ por: cheio.atualizado_por || '', em: cheio.atualizado_em }));
        reconciliarFiltroLocalUrgencias();
        renderizarUrgencias();
        showToast(`<i class="fas fa-cloud-download-alt"></i> Lista de Urgências atualizada pela nuvem (${cheio.ops.length} linhas).`, false, 3500);
    } catch (e) {
        avisarFalhaNuvemUrgencias(e);
    } finally {
        urgenciasSincronizando = false;
        atualizarInfoNuvemUrgencias();
    }
}

// Filtro de LOCAL da aba Urgências, de seleção múltipla (marcar vários de uma
// vez). Mesmo padrão do Mês Destino / Produto: guarda os EXCLUÍDOS, então um
// local que apareça numa próxima importação já entra marcado. A lista vem do
// que existe de verdade na lista (os nomes vêm direto da planilha). OP sem
// nome de local tem a opção "(sem local)" — sem ela não teria como excluí-las.
const CHAVE_SEM_LOCAL_URGENCIAS = '__SEM_LOCAL__';
let locaisUrgenciasExcluidos = new Set();

function chaveLocalUrgencias(o) { return (o.local && String(o.local).trim()) || CHAVE_SEM_LOCAL_URGENCIAS; }
function passaFiltroLocalUrgencias(o) { return !locaisUrgenciasExcluidos.has(chaveLocalUrgencias(o)); }

function renderizarFiltroLocalUrgencias(lista) {
    const el = $('listaFiltroLocalUrgencias');
    if (!el) return;
    const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const contagem = new Map();
    lista.forEach(o => { const k = chaveLocalUrgencias(o); contagem.set(k, (contagem.get(k) || 0) + 1); });

    const chaves = [...contagem.keys()].filter(k => k !== CHAVE_SEM_LOCAL_URGENCIAS).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    if (contagem.has(CHAVE_SEM_LOCAL_URGENCIAS)) chaves.push(CHAVE_SEM_LOCAL_URGENCIAS);

    if (!chaves.length) {
        el.innerHTML = '<label style="color:var(--texto-secundario); cursor:default;">Nenhuma OP importada ainda.</label>';
        if ($('textoFiltroLocalUrgencias')) $('textoFiltroLocalUrgencias').innerText = 'Todos';
        return;
    }
    const marcadas = chaves.filter(k => !locaisUrgenciasExcluidos.has(k)).length;
    el.innerHTML = `<label style="font-weight:700;"><input type="checkbox" id="chkTodosLocaisUrgencias" ${marcadas === chaves.length ? 'checked' : ''}> Selecionar tudo</label>`
        + chaves.map(k => `<label><input type="checkbox" class="chk-local-urgencias" value="${esc(k)}" ${locaisUrgenciasExcluidos.has(k) ? '' : 'checked'}> ${k === CHAVE_SEM_LOCAL_URGENCIAS ? '(sem local)' : esc(k)} <span style="color:var(--texto-secundario);">(${contagem.get(k)})</span></label>`).join('');
    if ($('textoFiltroLocalUrgencias')) {
        $('textoFiltroLocalUrgencias').innerText = marcadas === chaves.length ? 'Todos' : marcadas === 0 ? 'Nenhum' : `${marcadas} de ${chaves.length}`;
    }
}

// Depois de importar uma planilha nova: tira da seleção os locais que não
// existem mais e, se TUDO ficou desmarcado, volta a mostrar tudo — senão a
// tabela ficava vazia e a pessoa nem sabia por quê. (Só aqui, ao importar:
// durante o uso, "Nenhum" é um estado normal de quem vai marcar um por um.)
function reconciliarFiltroLocalUrgencias() {
    const existentes = new Set(obterImplantacaoOPs().map(chaveLocalUrgencias));
    locaisUrgenciasExcluidos = new Set([...locaisUrgenciasExcluidos].filter(k => existentes.has(k)));
    if (existentes.size && [...existentes].every(k => locaisUrgenciasExcluidos.has(k))) locaisUrgenciasExcluidos.clear();
}

function renderizarUrgencias() {
    if (!$('urgenciasLista')) return;
    const lista = obterImplantacaoOPs();

    renderizarFiltroLocalUrgencias(lista);

    const filtroOP = ($('filtroOPUrgencias')?.value || '').trim().toUpperCase();
    const filtroReferencia = ($('filtroReferenciaUrgencias')?.value || '').trim().toUpperCase();

    // "Situação na POR_OP": só tem sentido depois de importar a POR_OP —
    // antes disso o campo naoEncontradoPorOP nem existe (undefined), e a
    // OP não conta nem como encontrada nem como não encontrada.
    const filtroSituacao = $('filtroSituacaoUrgencias') ? $('filtroSituacaoUrgencias').value : '';

    // Contador clicável de não encontradas (sempre sobre a lista inteira,
    // não sobre o que está filtrado) — clicar nele aplica/tira o filtro.
    const totalNaoEncontradas = lista.filter(o => o.naoEncontradoPorOP === true).length;
    const wrapNaoEnc = $('wrapNaoEncontradasUrgencias'), btnNaoEnc = $('btnNaoEncontradasUrgencias');
    if (wrapNaoEnc && btnNaoEnc) {
        wrapNaoEnc.style.display = totalNaoEncontradas ? '' : 'none';
        const ativo = filtroSituacao === 'nao';
        btnNaoEnc.innerHTML = `<i class="fas fa-triangle-exclamation"></i> ${totalNaoEncontradas} NÃO ENCONTRADA${totalNaoEncontradas > 1 ? 'S' : ''}${ativo ? ' &nbsp;<i class="fas fa-xmark"></i>' : ''}`;
        btnNaoEnc.style.boxShadow = ativo ? '0 0 0 3px rgba(224,123,57,0.35)' : '';
        btnNaoEnc.title = ativo ? 'Mostrando só as não encontradas — clique pra ver todas de novo' : 'Clique pra ver só as OPs que não foram achadas na última POR_OP importada';
    }

    const filtrada = lista.filter(o =>
        passaFiltroLocalUrgencias(o) &&
        (!filtroOP || o.op.toUpperCase().includes(filtroOP)) &&
        (!filtroReferencia || (o.referencia || '').toUpperCase().includes(filtroReferencia) || (o.descRef || '').toUpperCase().includes(filtroReferencia)) &&
        (!filtroSituacao || (filtroSituacao === 'nao' ? o.naoEncontradoPorOP === true
            : filtroSituacao === 'multi' ? o.grupoDesdobra !== undefined
            : o.naoEncontradoPorOP === false))
    );

    // Mais antiga pra mais nova na Data Finalização — sem data vai pro
    // final (não tem como comparar uma data que não existe).
    filtrada.sort((a, b) => {
        if (!a.dataFinalizacao && !b.dataFinalizacao) return 0;
        if (!a.dataFinalizacao) return 1;
        if (!b.dataFinalizacao) return -1;
        return new Date(a.dataFinalizacao) - new Date(b.dataFinalizacao);
    });

    if ($('urgenciasCont')) $('urgenciasCont').textContent = `${filtrada.length} OP(s)`;

    if (!filtrada.length) {
        $('urgenciasLista').innerHTML = `<tr><td colspan="12" class="tabela-vazia">Nenhuma OP encontrada com esses filtros.</td></tr>`;
        return;
    }

    // OP que aparece em MAIS de um local na POR_OP: monta, sobre a lista INTEIRA (não a
    // filtrada), os locais de cada grupo — assim o selo e a dica mostram TODOS os locais
    // mesmo quando o filtro deixa só uma das linhas na tela.
    const grupos = new Map();
    lista.forEach(o => {
        if (o.grupoDesdobra === undefined) return;
        if (!grupos.has(o.grupoDesdobra)) grupos.set(o.grupoDesdobra, []);
        grupos.get(o.grupoDesdobra).push(o);
    });
    const idGrupo = o => (o && o.grupoDesdobra !== undefined) ? o.grupoDesdobra : null;
    const escAttr = t => String(t).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

    $('urgenciasLista').innerHTML = filtrada.map((o, i) => {
        // Linhas da mesma OP (vindas de uma divisão na POR_OP) ficam coladas — a
        // ordenação por data é estável e todas herdam a data da mesma linha da
        // Implantação — e ganham uma faixa azul na lateral, com linha no topo
        // da primeira e embaixo da última, mais o selo "EM N LOCAIS".
        const g = idGrupo(o);
        const primeiraDoGrupo = g !== null && g !== idGrupo(filtrada[i - 1]);
        const ultimaDoGrupo = g !== null && g !== idGrupo(filtrada[i + 1]);
        let estiloGrupo = '', seloGrupo = '';
        if (g !== null) {
            const membros = grupos.get(g);
            const sombras = ['inset 4px 0 0 var(--cor-sugestao)'];
            if (primeiraDoGrupo) sombras.push('inset 0 2px 0 rgba(62,124,151,0.55)');
            if (ultimaDoGrupo) sombras.push('inset 0 -2px 0 rgba(62,124,151,0.55)');
            estiloGrupo = `background:rgba(62,124,151,0.08); box-shadow:${sombras.join(', ')};`;
            const dica = `Essa OP aparece em ${membros.length} locais na POR_OP:&#10;` + membros.map(m => `• ${escAttr(m.local || '(sem nome)')} — ${(m.qtd || 0).toLocaleString('pt-BR')} pçs`).join('&#10;');
            seloGrupo = ` <span class="pill" style="background:var(--cor-sugestao); color:white; margin-left:6px; vertical-align:middle; white-space:nowrap;" title="${dica}">EM ${membros.length} LOCAIS</span>`;
        }
        // OP que não foi achada na POR_OP: etiqueta bem visível no lugar do
        // triângulo antigo, e local/quantidade (que são os ORIGINAIS da
        // Implantação, possivelmente velhos) em cinza itálico pra não
        // passar por dado atual e confiável.
        const nao = o.naoEncontradoPorOP === true;
        const estiloLinha = nao ? ' style="background:rgba(224,123,57,0.10); box-shadow:inset 4px 0 0 #E07B39;"'
            : (estiloGrupo ? ` style="${estiloGrupo}"` : '');
        const apagado = 'color:var(--texto-secundario); font-style:italic;';
        const etiqueta = `<span class="pill" style="background:#E07B39; color:white; margin-right:6px; vertical-align:middle;" title="Essa OP não foi encontrada na última POR_OP importada — o local e a quantidade abaixo são os originais da Implantação, podem estar desatualizados">NÃO ENCONTRADA</span>`;
        const localTxt = nao
            ? `${etiqueta}${o.local ? `<span style="${apagado}">${celulaTruncadaUrgencias(o.local, 130)}</span>` : ''}`
            : (o.local ? celulaTruncadaUrgencias(o.local, 160) : '—');
        const qtdTxt = (o.qtd || 0).toLocaleString('pt-BR');
        return `<tr${estiloLinha}>
            <td style="white-space:nowrap;"><strong>${o.op}</strong>${seloGrupo}</td>
            <td>${o.ciclo || '—'}</td>
            <td>${celulaTruncadaUrgencias(o.pedido, 150)}</td>
            <td>${celulaTruncadaUrgencias(o.grade, 120)}</td>
            <td${nao ? ' style="white-space:nowrap;"' : ''}>${localTxt}</td>
            <td>${o.referencia || ''}</td>
            <td>${celulaTruncadaUrgencias(o.descRef, 220)}</td>
            <td>${o.cor || ''}</td>
            <td style="text-align:right;${nao ? ' ' + apagado : ''}">${qtdTxt}</td>
            <td>${o.tipoProduto || ''}</td>
            <td>${o.dataFinalizacao ? formatarDataBR(o.dataFinalizacao) : '—'}</td>
            <td>${celulaTruncadaUrgencias(o.reprogramado, 150)}</td>
        </tr>`;
    }).join('');
}

function processarFilaCorte() {
    if (!exigirAdmin('importar a fila de corte')) return;
    if (!exigirBibliotecaExcel()) return;
    const input = $('inputFilaCorte'); if (!input.files[0]) return;
    const r = new FileReader();
    r.onload = function (e) {
        try {
            const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
            const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
            if (!rows.length) throw new Error("Planilha vazia.");

            const cab = rows[0].map(c => String(c || '').trim().toUpperCase());
            const idxLocal = cab.findIndex(c => c === 'LOCAL');
            const idxDescLocal = cab.findIndex(c => c === 'DESCRIÇÃO LOCAL' || c.includes('DESCRICAO LOCAL'));
            const idxOP = cab.findIndex(c => c === 'OP');
            const idxQtd = cab.findIndex(c => c.includes('QT') && c.includes('LOCAL'));
            const idxObs = cab.findIndex(c => c.includes('OBS')); // "Local Obs." (coluna M)
            const idxRef = cab.findIndex(c => c.includes('REFER') && !c.includes('DESCRI'));
            const idxTipo = cab.findIndex(c => c.includes('TIPO') && c.includes('PRODUTO'));
            const CODIGOS_FILA = SETORES_FILA_CORTE.map(s => s.codigo);
            const opsDetalhadas = [];
            const sequenciaCompleta = []; // TODAS as linhas com OP, não só os 11 setores

            const faltando = [];
            if (idxLocal === -1) faltando.push('Local');
            if (idxOP === -1) faltando.push('OP');
            if (idxQtd === -1) faltando.push('Qt OP Local');
            if (faltando.length) throw new Error("Não encontrei as colunas: " + faltando.join(', ') + " no cabeçalho da planilha.");

            // Agrupa por local: soma de peças + conjunto de OPs distintas (uma
            // OP pode aparecer em mais de uma linha no mesmo local)
            const porLocal = new Map();
            for (let i = 1; i < rows.length; i++) {
                const row = rows[i]; if (!row || row[idxLocal] === undefined || row[idxLocal] === null || row[idxLocal] === '') continue;
                const codigo = parseInt(row[idxLocal]); if (isNaN(codigo)) continue;
                const opId = row[idxOP] !== undefined && row[idxOP] !== null ? String(row[idxOP]).trim() : '';
                const qtd = parseFloat(row[idxQtd]) || 0;
                const classe = classificarLocalProducao(idxObs !== -1 ? row[idxObs] : '');
                if (!porLocal.has(codigo)) porLocal.set(codigo, {});
                const item = porLocal.get(codigo);
                if (!item[classe]) item[classe] = { qtdPecas: 0, opsDistintas: new Set() };
                item[classe].qtdPecas += qtd;
                if (opId) item[classe].opsDistintas.add(opId);

                // Guarda a linha individual (só dos setores da fila) pra poder
                // listar as OPs por trás dos números logo abaixo da tabela
                if (opId && CODIGOS_FILA.includes(codigo)) {
                    opsDetalhadas.push({
                        op: opId,
                        cod: codigo,
                        ref: idxRef !== -1 && row[idxRef] ? String(row[idxRef]).trim().toUpperCase() : '',
                        qtd: qtd,
                        obs: idxObs !== -1 && row[idxObs] ? String(row[idxObs]).trim() : '',
                        tipo: idxTipo !== -1 && row[idxTipo] ? String(row[idxTipo]).trim().toUpperCase() : ''
                    });
                }

                // Guarda TODA linha com OP (qualquer local), pro sequenciamento
                // completo — é o que permite comparar "essa OP já tá no
                // Acabamento" com "essa outra ainda tá no Enfesto"
                if (opId) {
                    sequenciaCompleta.push({
                        op: opId,
                        local: idxDescLocal !== -1 && row[idxDescLocal] ? String(row[idxDescLocal]).trim().toUpperCase() : '',
                        ref: idxRef !== -1 && row[idxRef] ? String(row[idxRef]).trim().toUpperCase() : '',
                        qtd: qtd
                    });
                }
            }

            const resultado = SETORES_FILA_CORTE.map(s => {
                const item = porLocal.get(s.codigo) || {};
                const classes = {};
                let qtdPecas = 0; const opsTodas = new Set();
                CLASSES_LOCAL_PRODUCAO.forEach(c => {
                    const d = item[c.id];
                    classes[c.id] = { qtdPecas: d ? d.qtdPecas : 0, qtdOps: d ? d.opsDistintas.size : 0 };
                    if (d) { qtdPecas += d.qtdPecas; d.opsDistintas.forEach(o => opsTodas.add(o)); }
                });
                // qtdPecas/qtdOps continuam no topo (total sem filtro) pra não
                // quebrar nada que já lia esses campos direto
                return { codigo: s.codigo, nome: s.nome, qtdPecas, qtdOps: opsTodas.size, classes };
            });

            localStorage.setItem('filaCorteDados', JSON.stringify(resultado));
            // Lista detalhada vai em chave separada: se faltar espaço, a fila
            // (que é o principal) continua funcionando normalmente
            try { localStorage.setItem('filaCorteOPs', JSON.stringify(opsDetalhadas)); }
            catch (err) { console.warn('Não coube a lista detalhada de OPs da fila de corte:', err.message); localStorage.removeItem('filaCorteOPs'); }
            try { localStorage.setItem('sequenciaCompletaOPs', JSON.stringify(sequenciaCompleta)); }
            catch (err) { console.warn('Não coube a lista de sequenciamento completo:', err.message); localStorage.removeItem('sequenciaCompletaOPs'); }
            input.value = '';
            renderizarFilaCorte();
            registrarAtualizacao('filaCorte'); atualizarIndicadoresDeAtualizacao();
            showToast("<i class='fas fa-check-double'></i> Fila de corte atualizada!");
        } catch (err) {
            console.error('Erro ao processar fila de corte:', err);
            alert("❌ Não foi possível processar a planilha.\n\nVerifique se ela tem as colunas Local, OP e Qt OP Local no cabeçalho.\n\nDetalhe técnico: " + err.message);
            input.value = '';
        }
    };
    r.readAsArrayBuffer(input.files[0]);
}

// Média diária real cortada pelo setor CORTE, usando só os dias que tiveram
// lançamento de produção (não uma média corrida de calendário) — reaproveita
// os mesmos dados que já são lançados na aba Gestão Mensal.
// Enquanto a aba de KPI não é refeita (removida e ainda não reconstruída),
// não tem como calcular a média automática — o usuário pode digitar um
// valor manual na Fila de Corte, que tem prioridade sobre o cálculo
// automático (que volta a valer sozinho quando a KPI existir de novo).
function obterMediaCorteManual() {
    const v = parseFloat(localStorage.getItem('mediaCorteManual'));
    return isNaN(v) || v <= 0 ? null : v;
}

function calcularMediaDiariaCorte() {
    const manual = obterMediaCorteManual();
    if (manual !== null) return manual;
    let totalPcs = 0, diasTrabalhados = 0;
    (dadosMes || []).forEach(g => {
        if (g && g['CORTE'] && g['CORTE'].pcsReal > 0) {
            diasTrabalhados++;
            totalPcs += g['CORTE'].pcsReal || 0;
        }
    });
    return diasTrabalhados > 0 ? totalPcs / diasTrabalhados : 0;
}

// Desenha os checkboxes de local de produção, com a quantidade de peças de
// cada grupo pra dar noção do impacto de marcar/desmarcar.
// Desenha as duas listas de marcar (local de produção e tipo de produto),
// montadas a partir dos valores que realmente aparecem na importação atual.
// Cada item mostra quantas peças representa, pra dar noção do impacto.
function renderizarFiltrosFilaCorte(ops) {
    const montar = (elId, textoId, chaveFn, excluidos, classeChk, corFn) => {
        const el = $(elId);
        if (!el) return;
        const porValor = new Map();
        ops.forEach(o => {
            const k = chaveFn(o);
            if (!porValor.has(k)) porValor.set(k, 0);
            porValor.set(k, porValor.get(k) + (o.qtd || 0));
        });
        const valores = [...porValor.entries()].sort((a, b) => b[1] - a[1]);
        el.innerHTML = valores.map(([valor, pecas]) => {
            const marcado = !excluidos.includes(valor);
            const cor = corFn ? corFn(valor) : null;
            return `<label title="${valor}">
                <input type="checkbox" class="${classeChk}" value="${valor.replace(/"/g, '&quot;')}" ${marcado ? 'checked' : ''}>
                ${cor ? `<span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:${cor}; margin-right:5px;"></span>` : ''}
                ${valor} <span style="color:var(--texto-secundario); float:right;">${pecas.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</span>
            </label>`;
        }).join('') || '<label style="color:var(--texto-secundario);">Nada importado ainda</label>';

        const texto = $(textoId);
        if (texto) {
            const fora = valores.filter(([v]) => excluidos.includes(v)).length;
            texto.innerText = fora === 0 ? `Todos (${valores.length})` : `${valores.length - fora} de ${valores.length}`;
        }
    };

    const corPorClasse = {};
    CLASSES_LOCAL_PRODUCAO.forEach(c => { corPorClasse[c.id] = c.cor; });

    montar('listaFiltroLocalProd', 'textoFiltroLocalProd', o => chaveLocalObs(o.obs), locaisProducaoExcluidos, 'chk-local-prod',
        valor => corPorClasse[classificarLocalProducao(valor === '(SEM INFO)' ? '' : valor)]);
    montar('listaFiltroTipoProd', 'textoFiltroTipoProd', o => chaveTipoProduto(o.tipo), tiposProdutoExcluidos, 'chk-tipo-prod', null);
}

// Lista as OPs individuais que estão por trás dos números da fila de corte.
// Segue o mesmo filtro de local de produção da tabela de cima, mais um filtro
// próprio de setor e uma busca por texto.
function renderizarListaOPsFilaCorte(opsParam) {
    const corpo = $('listaOPsFilaCorte');
    if (!corpo) return;

    const sel = $('filtroSetorOPsFilaCorte');
    if (sel && !sel.dataset.pronto) {
        sel.innerHTML = '<option value="">Todos</option>' + SETORES_FILA_CORTE.map(s => `<option value="${s.codigo}">${s.nome}</option>`).join('');
        sel.dataset.pronto = '1';
    }

    const ops = opsParam || obterOPsFilaCorte();

    if (!ops.length) {
        corpo.innerHTML = `<tr><td colspan="5" class="tabela-vazia"><i class="fas fa-file-import tabela-vazia-icone"></i>Importe a planilha geral de novo pra ver as OPs por trás dos números.</td></tr>`;
        if ($('contOPsFilaCorte')) $('contOPsFilaCorte').innerText = '0 OPs';
        return;
    }

    const setorSel = sel ? sel.value : '';
    const termo = $('buscaOPsFilaCorte') ? $('buscaOPsFilaCorte').value.trim().toLowerCase() : '';
    const nomeSetor = {}, ordemSetor = {};
    SETORES_FILA_CORTE.forEach((s, i) => { nomeSetor[s.codigo] = s.nome; ordemSetor[s.codigo] = i; });
    const infoClasse = {};
    CLASSES_LOCAL_PRODUCAO.forEach(c => { infoClasse[c.id] = c; });

    const filtradas = ops.filter(o => {
        if (!opPassaFiltroFilaCorte(o)) return false;
        if (setorSel && String(o.cod) !== setorSel) return false;
        if (termo && !`${o.op} ${o.ref} ${o.obs} ${o.tipo || ''}`.toLowerCase().includes(termo)) return false;
        return true;
    }).sort((a, b) => (ordemSetor[a.cod] - ordemSetor[b.cod]) || (b.qtd - a.qtd));

    const totalPecas = filtradas.reduce((s, o) => s + (o.qtd || 0), 0);
    if ($('contOPsFilaCorte')) $('contOPsFilaCorte').innerText = `${filtradas.length} linhas · ${totalPecas.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} pçs`;

    if (!filtradas.length) {
        corpo.innerHTML = `<tr><td colspan="5" class="tabela-vazia"><i class="fas fa-inbox tabela-vazia-icone"></i>Nenhuma OP com os filtros atuais.</td></tr>`;
        return;
    }

    corpo.innerHTML = filtradas.map(o => {
        const c = infoClasse[classificarLocalProducao(o.obs)];
        return `<tr>
            <td><strong>${o.op}</strong></td>
            <td>${o.ref || '-'}</td>
            <td>${nomeSetor[o.cod] || o.cod}</td>
            <td><span class="pill" style="background:${c.cor}; font-size:9px;">${o.obs || 'sem info'}</span></td>
            <td style="text-align:right;">${(o.qtd || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</td>
        </tr>`;
    }).join('');
}

// =========================================================================
// 📐 MONTAR PRODUÇÃO — calcula quanto tempo cabe no dia (máquinas × jornada ×
// eficiência) e compara com o tempo das OPs marcadas. O tempo vem do "T. E.
// (min)" da planilha; como ele vem vazio em boa parte das OPs (principalmente
// no Enfesto), dá pra digitar o tempo na mão ali mesmo — o valor digitado
// fica salvo e só é usado quando a planilha não trouxe nada.
// =========================================================================
let capSelecionadas = new Set();
let capTemposManuais = {};

function carregarCapacidade() {
    try {
        const t = JSON.parse(localStorage.getItem('capTemposManuais') || '{}');
        if (t && typeof t === 'object') capTemposManuais = t;
    } catch (e) { capTemposManuais = {}; }
    try {
        const p = JSON.parse(localStorage.getItem('capParametros') || 'null');
        if (p) {
            if ($('capMaquinas')) $('capMaquinas').value = p.maquinas;
            if ($('capHoras')) $('capHoras').value = p.horas;
            if ($('capEficiencia')) $('capEficiencia').value = p.eficiencia;
        }
    } catch (e) { /* usa os padrões do HTML */ }
}

function salvarParametrosCapacidade() {
    try {
        localStorage.setItem('capParametros', JSON.stringify({
            maquinas: $('capMaquinas').value, horas: $('capHoras').value, eficiencia: $('capEficiencia').value
        }));
    } catch (e) { /* ignora */ }
}

function salvarTemposManuais() {
    try { localStorage.setItem('capTemposManuais', JSON.stringify(capTemposManuais)); } catch (e) { /* ignora */ }
}

// =========================================================================
// ⏱️ TEMPOS POR REFERÊNCIA (planilha "Tempo Peça por Tipo de Operação") —
// usuário decidiu DESCONSIDERAR o tempo que vem da Sincronização e usar só
// esse: o tempo por peça é fixo por referência (confirmado com dado real —
// a mesma referência sempre traz o mesmo tempo, não importa a OP), então o
// tempo TOTAL da OP é recalculado sempre que a quantidade mudar, em vez de
// ficar travado no valor que a Sincronização trouxe da última vez.
// =========================================================================

let cacheTemposPorReferenciaOperacao = null;
function obterTemposPorReferenciaOperacao() {
    if (cacheTemposPorReferenciaOperacao) return cacheTemposPorReferenciaOperacao;
    try { cacheTemposPorReferenciaOperacao = JSON.parse(localStorage.getItem('temposPorReferenciaOperacao') || '{}'); }
    catch (e) { cacheTemposPorReferenciaOperacao = {}; }
    return cacheTemposPorReferenciaOperacao;
}

function processarTemposPorOperacao() {
    if (!exigirAdmin('importar tempos por operação')) return;
    if (!exigirBibliotecaExcel()) return;
    const input = $('inputTemposPorOperacao'); if (!input.files[0]) return;

    const r = new FileReader();
    r.onload = function (e) {
        try {
            const data = new Uint8Array(e.target.result);
            const wb = XLSX.read(data, { type: 'array' });
            const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
            if (rows.length < 3) throw new Error("Arquivo vazio ou incompleto — esperava pelo menos 3 linhas (2 de cabeçalho + dado).");

            // Linha 0 tem os nomes dos 14 tipos de operação, a partir da
            // coluna J (índice 9) — linha 1 é o cabeçalho normal
            // (Empresa/Ciclo/OP/Situação/Referência/...).
            const tiposOperacao = rows[0].slice(9).map(t => String(t || '').trim().toUpperCase());
            const cabecalho = rows[1].map(c => String(c || '').trim().toUpperCase());
            const idxReferencia = cabecalho.findIndex(c => c === 'REFERÊNCIA' || c === 'REFERENCIA');
            if (idxReferencia === -1) throw new Error("Não encontrei a coluna Referência no cabeçalho.");

            // O tempo é o mesmo pra toda OP da mesma referência (confirmado
            // com dado real) — só guarda a primeira ocorrência de cada uma.
            const temposPorReferencia = {};
            let linhasLidas = 0;
            for (let i = 2; i < rows.length; i++) {
                const row = rows[i]; if (!row || !row[idxReferencia]) continue;
                const referencia = String(row[idxReferencia]).trim().toUpperCase();
                if (temposPorReferencia[referencia]) continue;
                const tempos = {};
                tiposOperacao.forEach((tipo, idx) => {
                    const valor = row[9 + idx];
                    if (valor !== null && valor !== undefined && valor !== '') tempos[tipo] = parseFloat(valor);
                });
                temposPorReferencia[referencia] = tempos;
                linhasLidas++;
            }
            if (linhasLidas === 0) throw new Error("Nenhuma referência com tempo encontrada.");

            localStorage.setItem('temposPorReferenciaOperacao', JSON.stringify(temposPorReferencia));
            cacheTemposPorReferenciaOperacao = null; // invalida o cache, próxima leitura recarrega do zero
            input.value = '';
            renderizarCapacidade();
            showToast(`<i class="fas fa-check-double"></i> Tempos de ${linhasLidas} referências importados!`);
        } catch (err) {
            console.error('Erro ao processar tempos por operação:', err);
            alert("❌ Não foi possível processar a planilha de tempos por operação.\n\nDetalhe técnico: " + err.message);
            input.value = '';
        }
    };
    r.readAsArrayBuffer(input.files[0]);
}

// Se true, o tempo dessa OP já vem pronto da referência (não precisa
// digitar manual) — usado tanto pra decidir o que mostrar na tela quanto
// pro filtro "só as sem tempo".
function opTemTempoDaReferencia(op) {
    const temposPorReferencia = obterTemposPorReferenciaOperacao();
    const referencia = op.referencia ? String(op.referencia).trim().toUpperCase() : '';
    const tempoRef = temposPorReferencia[referencia];
    return !!(tempoRef && tempoRef['CORTE E ETIQUETACAO'] !== undefined && !isNaN(tempoRef['CORTE E ETIQUETACAO']));
}

// Tempo que vale pra conta, em ordem de prioridade: (1) tempo por peça da
// referência (planilha de tempos) × quantidade ATUAL da OP — sempre
// recalculado, então acompanha se a quantidade mudar depois; (2) se a
// referência não tiver tempo cadastrado, cai pro digitado à mão. O tempo
// que vinha da Sincronização foi descartado de propósito (decisão do
// usuário — o da referência é mais confiável e sempre atualizado).
function tempoEfetivoOP(op) {
    if (opTemTempoDaReferencia(op)) {
        const temposPorReferencia = obterTemposPorReferenciaOperacao();
        const referencia = String(op.referencia).trim().toUpperCase();
        return temposPorReferencia[referencia]['CORTE E ETIQUETACAO'] * (parseInt(op.qtd) || 0);
    }
    return parseFloat(capTemposManuais[op.id]) || 0;
}

// Tempo de COSTURA já vem pronto na própria planilha POR_OP ("Minutos
// Costura", já é o total pra quantidade daquela linha, não por peça) — bem
// mais simples que cruzar com a planilha de tempos por operação (usada só
// em Montar Produção, que precisa do tempo de Corte e Etiquetação).
// Cada grupo diz qual campo usar (campoTempo, anexado em cada OP por
// montarFilaSequenciamentoCostura) — "minutosCostura" pros 4 grupos de
// costura, "minutosAcabamento" pro Acabamento.
// Feriados cadastrados manualmente (datas "AAAA-MM-DD") — o cronograma da
// Sequência da Produção assumia que TODO dia útil (seg-sex) tinha a mesma
// capacidade, o que fazia a previsão "passar por cima" de um feriado como
// se fosse um dia de trabalho normal. Guardado junto (não por grupo),
// já que um feriado vale pra fábrica inteira.
function obterFeriados() {
    try { return JSON.parse(localStorage.getItem('feriadosSeqProducao') || '[]'); } catch (e) { return []; }
}
function salvarFeriados(lista) {
    localStorage.setItem('feriadosSeqProducao', JSON.stringify([...new Set(lista)].sort()));
}
function adicionarFeriado(dataChave) {
    if (!exigirAdminOuUsuario('cadastrar feriado')) return;
    if (!dataChave) return;
    const lista = obterFeriados();
    if (!lista.includes(dataChave)) { lista.push(dataChave); salvarFeriados(lista); }
    renderizarModalFeriados();
    renderizarSequenciamentoCostura();
}
function removerFeriado(dataChave) {
    if (!exigirAdminOuUsuario('remover feriado')) return;
    salvarFeriados(obterFeriados().filter(d => d !== dataChave));
    renderizarModalFeriados();
    renderizarSequenciamentoCostura();
}

function renderizarModalFeriados() {
    const lista = obterFeriados();
    // Formata direto da string "AAAA-MM-DD" pra "DD/MM/AAAA" sem passar por
    // new Date() — isso vira meia-noite UTC, que em fuso negativo (Brasil)
    // pode mostrar o dia ANTERIOR (mesma armadilha já documentada noutros
    // lugares do sistema com data-só-dia).
    const formatarFeriado = d => { const [a, m, dia] = d.split('-'); return `${dia}/${m}/${a}`; };
    const linhas = lista.length
        ? lista.map(d => `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 12px; border-bottom:1px solid var(--borda-cor);">
                <span>${formatarFeriado(d)}</span>
                <button onclick="removerFeriado('${d}')" class="btn btn-perigo somente-admin tambem-usuario" style="padding:3px 8px;" title="Remover"><i class="fas fa-trash"></i></button>
            </div>`).join('')
        : '<div style="padding:20px; text-align:center; color:var(--texto-secundario);">Nenhum feriado cadastrado.</div>';

    $('modalFeriados').innerHTML = `
        <div class="modal-card" style="width:380px; max-width:90vw; border-top:5px solid var(--cor-historico); max-height:80vh;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; border-bottom:2px solid var(--borda-cor); padding-bottom:10px;">
                <h2 style="margin:0; color:var(--texto-cor); display:flex; align-items:center; gap:10px; font-size:16px;">
                    <i class="fas fa-calendar-xmark" style="color:var(--cor-historico);"></i> FERIADOS
                </h2>
                <button onclick="fecharModais()" class="modal-fechar-btn"><i class="fas fa-times"></i></button>
            </div>
            <div style="font-size:12px; color:var(--texto-secundario); margin-bottom:15px;">
                Um feriado cadastrado aqui vira um dia sem produção no cronograma da Sequência (igual sábado/domingo) — as OPs previstas pra esse dia passam pro próximo dia útil.
            </div>
            <div style="overflow-y:auto; flex:1; margin-bottom:15px; border:1px solid var(--borda-cor); border-radius:8px;">
                ${linhas}
            </div>
            <div class="somente-admin tambem-usuario" style="display:flex; gap:10px;">
                <input type="date" id="inputNovoFeriado" style="flex:1;">
                <button onclick="adicionarFeriado($('inputNovoFeriado').value)" class="btn btn-sugestao"><i class="fas fa-plus"></i> ADICIONAR</button>
            </div>
        </div>
    `;
}

function tempoCosturaOP(op) {
    const valor = op[op.campoTempo || 'minutosCostura'];
    return (valor !== null && valor !== undefined && !isNaN(valor)) ? valor : null;
}

// Percorre a fila NA ORDEM (prioridade já aplicada em montarFilaSequenciamentoCostura)
// e marca cada OP como "cabe hoje" ou não, respeitando a ordem estritamente
// — uma vez que uma OP não cabe mais no tempo disponível, as que vêm depois
// dela na fila também não contam como "hoje", mesmo que sejam menores
// (não pula a fila, só porque uma OP menor caberia).
// Avança pro próximo dia ÚTIL (pula sábado/domingo — confirmado com o
// usuário, a fábrica não costura nesses dias — e também pula qualquer
// data cadastrada em obterFeriados()).
function proximoDiaUtilCostura(data, feriados) {
    const feriadosSet = feriados || new Set(obterFeriados());
    const nova = new Date(data);
    do { nova.setDate(nova.getDate() + 1); } while (nova.getDay() === 0 || nova.getDay() === 6 || feriadosSet.has(nova.toISOString().slice(0, 10)));
    return nova;
}

// Em vez de um "cabe ou não cabe hoje" binário, monta um CRONOGRAMA de
// verdade: percorre a fila NA ORDEM e vai "gastando" os minutos
// disponíveis por dia — quando uma OP não termina de cair no dia, o resto
// dela continua no próximo dia útil (sem deixar o pessoal "parado" depois
// que uma OP grande não coube inteira num dia só, como o usuário
// descreveu). Cada OP recebe uma data de início e uma de término.
// Avança dia por dia (não "pula N dias" com uma conta pronta) de propósito
// — com feriados misturados no meio, dias diferentes podem valer 0 ou o
// valor cheio, então só dá pra saber certo andando um de cada vez.
function calcularCronogramaCostura(fila, minutosDisponiveisPorDia) {
    const feriados = new Set(obterFeriados());
    let diaAtual = new Date(); diaAtual.setHours(0, 0, 0, 0);
    while (diaAtual.getDay() === 0 || diaAtual.getDay() === 6 || feriados.has(diaAtual.toISOString().slice(0, 10))) {
        diaAtual = proximoDiaUtilCostura(diaAtual, feriados);
    }
    let minutosUsadosHoje = 0;

    return fila.map(op => {
        const tempo = tempoCosturaOP(op);
        if (tempo === null || minutosDisponiveisPorDia <= 0) {
            return { ...op, tempoCostura: tempo, dataInicioProducao: null, dataTerminoProducao: null };
        }

        const dataInicioProducao = new Date(diaAtual);
        let restante = tempo - (minutosDisponiveisPorDia - minutosUsadosHoje);

        if (restante <= 0) {
            minutosUsadosHoje += tempo;
        } else {
            while (restante > 0) {
                diaAtual = proximoDiaUtilCostura(diaAtual, feriados);
                if (restante <= minutosDisponiveisPorDia) { minutosUsadosHoje = restante; restante = 0; }
                else restante -= minutosDisponiveisPorDia;
            }
        }

        const dataTerminoProducao = new Date(diaAtual);
        return { ...op, tempoCostura: tempo, dataInicioProducao, dataTerminoProducao };
    });
}

function minutosDisponiveisDiaCostura() {
    const pessoas = parseFloat($('seqCostPessoas')?.value) || 0;
    const horas = parseFloat($('seqCostHoras')?.value) || 0;
    const ef = parseFloat($('seqCostEficiencia')?.value) || 0;
    return pessoas * horas * 60 * (ef / 100);
}

// Vermelho = a data de finalização já passou de verdade (hoje já é depois
// dela). Laranja = ainda não passou, mas pela posição dessa OP na fila
// (calculada em calcularCronogramaCostura), ela só vai terminar de ser
// costurada DEPOIS da data prometida — ou seja, vai atrasar por causa do
// que vem antes dela, mesmo a data em si ainda não tendo vencido.
// Usa a data LIMITE da costura (Data Finalização menos os dias de reserva
// do Acabamento), não a Data Finalização crua — é esse o prazo que a
// Costura precisa cumprir de verdade, já que o Acabamento vem depois.
function classificarAtrasoOP(op, hoje) {
    const dataLimite = calcularDataLimiteCostura(op);
    if (!dataLimite) return null;
    if (dataLimite < hoje) return 'vermelho';
    if (op.dataTerminoProducao && op.dataTerminoProducao > dataLimite) return 'laranja';
    return null;
}

// Resumo de atrasos dos 6 grupos DE UMA VEZ (não só o que está selecionado
// no momento) — pra decidir rápido qual grupo precisa de atenção primeiro,
// sem precisar clicar em cada um. Usa a MESMA capacidade (Nº de
// pessoas/Horas/Eficiência) preenchida na tela pra todos os grupos — hoje
// só existe um conjunto desses campos, não um por grupo.
function calcularResumoAtrasosPorGrupo() {
    const minutosDisponiveis = minutosDisponiveisDiaCostura();
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    return Object.keys(GRUPOS_SEQUENCIAMENTO_COSTURA).map(chave => {
        const fila = montarFilaSequenciamentoCostura(chave);
        const filaComResultado = calcularCronogramaCostura(fila, minutosDisponiveis);
        let jaAtrasadas = 0, vaoAtrasar = 0;
        filaComResultado.forEach(op => {
            const c = classificarAtrasoOP(op, hoje);
            if (c === 'vermelho') jaAtrasadas++; else if (c === 'laranja') vaoAtrasar++;
        });
        return { chave, rotulo: GRUPOS_SEQUENCIAMENTO_COSTURA[chave].rotulo, total: filaComResultado.length, jaAtrasadas, vaoAtrasar };
    });
}

function renderizarResumoAtrasosPorGrupo() {
    if (!$('seqCostResumoGrupos')) return;
    const resumo = calcularResumoAtrasosPorGrupo();
    $('seqCostResumoGrupos').innerHTML = resumo.map(g => `
        <tr style="cursor:pointer;" onclick="$('seqCostGrupo').value='${g.chave}'; renderizarSequenciamentoCostura();" title="Clique pra ver a fila desse grupo">
            <td><strong>${g.rotulo}</strong></td>
            <td style="text-align:center; color:${g.jaAtrasadas ? 'var(--cor-alerta)' : 'var(--texto-secundario)'}; font-weight:${g.jaAtrasadas ? '700' : '400'};">${g.jaAtrasadas}</td>
            <td style="text-align:center; color:${g.vaoAtrasar ? '#E07B39' : 'var(--texto-secundario)'}; font-weight:${g.vaoAtrasar ? '700' : '400'};">${g.vaoAtrasar}</td>
            <td style="text-align:center; color:var(--texto-secundario);">${g.total}</td>
        </tr>`).join('');
}


// Eficiência REAL da costura (a do KPI) mostrada no cantinho da Sequência, de acordo com o grupo escolhido.
// Camisa e Jaqueta/Gandola/Parka dividem o mesmo local no KPI (PNP COST SUP CAMISA), então mostram a mesma %.
const LOCAL_EF_COSTURA_DO_GRUPO = {
    CALCA: 'PNP COST INF CALCA',
    MALHA: 'PNP COST SUP MALHA',
    CAMISA: 'PNP COST SUP CAMISA',
    JAQUETA_GANDOLA_PARKA: 'PNP COST SUP CAMISA',
};
// Mesma conta da tabela "Resumo do mês por local" do KPI: minutos produzidos ÷ minutos disponíveis,
// só nos dias em que as pessoas do local foram informadas.
function calcularEficienciaMesLocal(local, mes) {
    const todos = obterEficienciaCostura();
    const minPessoa = parseFloat($('efCosturaMinPessoa') ? $('efCosturaMinPessoa').value : 528) || 528;
    let minOk = 0, disp = 0, diasComPessoas = 0, diasComDado = 0;
    Object.keys(todos).filter(d => d.startsWith(mes)).forEach(dia => {
        const l = (todos[dia].locais || {})[local]; if (!l) return;
        diasComDado++;
        const pessoas = (todos[dia].pessoasLocal || {})[local];
        if (pessoas > 0) { minOk += l.minutos; disp += pessoas * minPessoa; diasComPessoas++; }
    });
    return { efic: disp ? (minOk / disp) * 100 : null, diasComPessoas, diasComDado };
}
function atualizarEficienciaSeqCostura() {
    const el = $('seqCostEfKpi'); if (!el) return;
    const grupo = $('seqCostGrupo') ? $('seqCostGrupo').value : 'CALCA';
    const local = LOCAL_EF_COSTURA_DO_GRUPO[grupo];
    if (!local) { el.innerHTML = ''; return; }
    const todos = obterEficienciaCostura();
    const meses = [...new Set(Object.keys(todos).map(d => d.slice(0, 7)))].sort();
    const mesSel = $('seletorMesEfCostura') && meses.includes($('seletorMesEfCostura').value) ? $('seletorMesEfCostura').value : meses[meses.length - 1];
    if (!mesSel) { el.innerHTML = ''; return; }
    const r = calcularEficienciaMesLocal(local, mesSel);
    const nome = nomeLocalEfCostura(local);
    const nomeGrupo = { CALCA: 'Calça', MALHA: 'Malha', CAMISA: 'Camisa', JAQUETA_GANDOLA_PARKA: 'Jaqueta' }[grupo];
    const compartilhado = grupo === 'CAMISA' || grupo === 'JAQUETA_GANDOLA_PARKA';
    const cor = r.efic === null ? '#cfcfcf' : (r.efic >= 100 ? '#7FD6A0' : (r.efic >= 70 ? '#F0C36A' : '#F08A8A'));
    const txt = r.efic === null ? 'sem pessoas informadas' : r.efic.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%';
    const titulo = `Eficiência do mês (${formatarMesLegivelKPI ? formatarMesLegivelKPI(mesSel) : mesSel}) do local ${local}, igual à tabela do KPI da costura: ${r.diasComPessoas} de ${r.diasComDado} dia(s) com pessoas informadas.` + (compartilhado ? ' No KPI, Camisa e Jaqueta são o mesmo local, por isso mostram a mesma %.' : '');
    el.innerHTML = `<span title="${titulo}" style="display:inline-flex; align-items:center; gap:6px; font-size:12px; background:rgba(255,255,255,0.14); padding:3px 10px; border-radius:999px; white-space:nowrap;"><i class="fas fa-gauge-high"></i> EFICIÊNCIA ${(compartilhado ? 'CAMISA/JAQUETA' : nomeGrupo).toUpperCase()} (MÊS): <strong style="color:${cor}; font-size:13px;">${txt}</strong></span>`;
}

function renderizarSequenciamentoCostura() {
    if (!$('seqCostListaOPs')) return;
    const grupo = $('seqCostGrupo') ? $('seqCostGrupo').value : 'CALCA';
    atualizarEficienciaSeqCostura();
    const fila = montarFilaSequenciamentoCostura(grupo);
    const minutosDisponiveis = minutosDisponiveisDiaCostura();
    const filaComResultado = calcularCronogramaCostura(fila, minutosDisponiveis);

    if ($('seqCostDisponivel')) $('seqCostDisponivel').textContent = Math.round(minutosDisponiveis).toLocaleString('pt-BR');
    if ($('seqCostContOPs')) $('seqCostContOPs').textContent = `${filaComResultado.length} OP(s)`;

    // Resumo de atrasos — pra não precisar rolar a tabela toda só pra
    // saber se hoje é um dia de se preocupar ou não.
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    if ($('seqCostResumoAtraso')) {
        const jaAtrasadas = filaComResultado.filter(op => classificarAtrasoOP(op, hoje) === 'vermelho').length;
        const vaoAtrasar = filaComResultado.filter(op => classificarAtrasoOP(op, hoje) === 'laranja').length;
        if (jaAtrasadas === 0 && vaoAtrasar === 0) {
            $('seqCostResumoAtraso').innerHTML = '';
        } else {
            const partes = [];
            if (jaAtrasadas > 0) partes.push(`<span style="color:var(--cor-alerta); font-weight:700;">${jaAtrasadas} já atrasada${jaAtrasadas === 1 ? '' : 's'}</span>`);
            if (vaoAtrasar > 0) partes.push(`<span style="color:#E07B39; font-weight:700;">${vaoAtrasar} ${vaoAtrasar === 1 ? 'vai' : 'vão'} atrasar</span>`);
            $('seqCostResumoAtraso').innerHTML = partes.join(' · ');
        }
    }

    renderizarResumoAtrasosPorGrupo();

    if (!filaComResultado.length) {
        $('seqCostListaOPs').innerHTML = `<tr><td colspan="14" style="text-align:center; padding:20px; color:var(--texto-secundario);">Nenhuma OP encontrada pra esse grupo.</td></tr>`;
        return;
    }

    $('seqCostListaOPs').innerHTML = filaComResultado.map((op, indice) => {
        const tempoTexto = op.tempoCostura === null
            ? `<span style="color:var(--cor-alerta);" title="Essa linha não trouxe Minutos Costura na planilha importada">sem tempo</span>`
            : op.tempoCostura.toFixed(1).replace('.', ',');
        const situacaoCor = op.situacaoCostura === 'Em andamento' ? 'var(--cor-despacho)' : 'var(--texto-secundario)';
        const dataFinalizacaoTexto = op.dataFinalizacao ? formatarDataBR(op.dataFinalizacao) : '—';
        const dataLimiteCostura = calcularDataLimiteCostura(op);
        const dataLimiteTexto = dataLimiteCostura ? formatarDataBR(dataLimiteCostura) : null;

        const classificacaoAtraso = classificarAtrasoOP(op, hoje);
        const corDataFinalizacao = classificacaoAtraso === 'vermelho' ? 'var(--cor-alerta)' : classificacaoAtraso === 'laranja' ? '#E07B39' : '';
        // Mostra as duas datas: a Data Finalização de verdade (a que vem
        // da planilha) e, embaixo dela, a data LIMITE da costura (já
        // descontados os dias de reserva do Acabamento) — é essa segunda
        // que fica colorida quando está atrasada/vai atrasar, já que é o
        // prazo que a Costura precisa cumprir de verdade.
        const dataFinalizacaoHtml = dataLimiteTexto
            ? `${dataFinalizacaoTexto}<br><span class="data-limite-costura-esconde-impressao" style="font-size:10px; ${corDataFinalizacao ? `color:${corDataFinalizacao}; font-weight:700;` : 'color:var(--texto-secundario);'}" title="Data limite pra Costura terminar, já descontando ${DIAS_RESERVA_ACABAMENTO_COSTURA} dias úteis de reserva pro Acabamento">limite: ${dataLimiteTexto}</span>`
            : dataFinalizacaoTexto;

        // "Previsão" mostra quando essa OP começa e termina de ser
        // costurada, de acordo com a fila — se levar mais de 1 dia, mostra
        // início → término; se cabe tudo no mesmo dia, mostra só a data.
        let previsaoTexto = '—';
        let comecaHoje = false;
        if (op.dataInicioProducao && op.dataTerminoProducao) {
            const inicioTxt = formatarDataBR(op.dataInicioProducao);
            const terminoTxt = formatarDataBR(op.dataTerminoProducao);
            previsaoTexto = inicioTxt === terminoTxt ? inicioTxt : `${inicioTxt} → ${terminoTxt}`;
            comecaHoje = op.dataInicioProducao.getTime() === hoje.getTime();
        }

        const chaveLinha = chaveOPCostura(op.op, op.ciclo);
        const isEnfesto = grupo === 'ENFESTO';
        const podeSubir = indice > 0;
        const podeDescer = indice < filaComResultado.length - 1;
        const setasHtml = isEnfesto ? `<span class="data-limite-costura-esconde-impressao" style="display:inline-flex; flex-direction:column; gap:1px; margin-right:6px; vertical-align:middle;">
            <button class="btn somente-admin tambem-usuario" style="padding:0 4px; font-size:9px; line-height:1.4; background:var(--cor-historico); ${podeSubir ? '' : 'opacity:0.25;'}" ${podeSubir ? '' : 'disabled'} onclick="moverOPEnfesto('${chaveLinha}', -1)" title="Mover pra cima"><i class="fas fa-caret-up"></i></button>
            <button class="btn somente-admin tambem-usuario" style="padding:0 4px; font-size:9px; line-height:1.4; background:var(--cor-historico); ${podeDescer ? '' : 'opacity:0.25;'}" ${podeDescer ? '' : 'disabled'} onclick="moverOPEnfesto('${chaveLinha}', 1)" title="Mover pra baixo"><i class="fas fa-caret-down"></i></button>
        </span>` : '';
        // Linha separadora bem visível entre "Em andamento" e "Aguardando"
        // — pedido do usuário, pra ficar claro pra quem olha a tela onde
        // uma situação termina e a outra começa, sem precisar ler a
        // coluna Situação linha por linha.
        const linhaAnterior = filaComResultado[indice - 1];
        const separador = (indice > 0 && linhaAnterior.situacaoCostura === 'Em andamento' && op.situacaoCostura === 'Aguardando')
            ? `<tr><td colspan="14" style="padding:0; border-top:3px solid var(--cor-historico);"></td></tr>`
            : '';
        // Sem previsão (Enfesto/Etiquetação, ou OP sem tempo) → nunca "começa hoje"; ficava apagada. Aqui não apaga.
        const semTempoNoGrupo = grupo === 'ENFESTO' || grupo === 'ETIQUETACAO' || !op.dataInicioProducao;   // sem previsão (OP sem tempo) também não apaga
        return separador + `<tr style="${(comecaHoje || semTempoNoGrupo) ? '' : 'opacity:0.6;'}">
            <td><input type="checkbox" class="check-imprimir-seq" data-id="${chaveLinha}"></td>
            <td>${setasHtml}<strong>${op.op}</strong></td>
            <td><span style="color:${situacaoCor}; font-weight:700; font-size:11px;">${op.situacaoCostura}</span></td>
            <td>${op.prioridade ?? '—'}</td>
            <td>${dataFinalizacaoHtml}</td>
            <td>${obterMesDestinoDaOP(op.op, op.ciclo) || '<span style="color:var(--texto-secundario);">—</span>'}</td>
            <td class="num" style="color:${(op.diasLocal || 0) >= 3 ? 'var(--cor-alerta)' : 'var(--texto-cor)'};">${op.diasLocal ?? '<span style="color:var(--texto-secundario);">—</span>'}</td>
            <td>${op.descRef || ''}</td>
            <td style="white-space:nowrap;">${op.cor || '<span style="color:var(--texto-secundario);">—</span>'}</td>
            <td class="num">${(op.qtd || 0).toLocaleString('pt-BR')}</td>
            <td class="num" style="white-space:nowrap;" title="Tempo de costura por peça (coluna 'Tempo Peca Costura' do POR_OP)">${(op.tempoPecaCostura && grupo !== 'ENFESTO' && grupo !== 'ETIQUETACAO') ? op.tempoPecaCostura.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '<span style="color:var(--texto-secundario);">—</span>'}</td>
            <td class="col-tempo-total-seq num">${tempoTexto}</td>
            <td style="text-align:center; white-space:nowrap;">${previsaoTexto}</td>
            <td style="text-align:center; white-space:nowrap;">
                <button class="btn somente-admin tambem-usuario" style="padding:3px 7px; background:var(--cor-historico);" onclick="ocultarOPDaSequenciaCostura('${op.op}', '${op.ciclo || ''}')" title="Ocultar essa OP (continua existindo, só some da lista e do tempo — reversível na hora)"><i class="fas fa-eye-slash"></i></button>
                <button class="btn somente-admin tambem-usuario" style="padding:3px 7px; background:var(--cor-alerta);" onclick="removerOPDaSequenciaCostura('${op.op}', '${op.ciclo || ''}')" title="Remover essa OP da sequência (não volta nem reimportando)"><i class="fas fa-trash"></i></button>
            </td>
        </tr>`;
    }).join('');

    if ($('btnOrdemAutomaticaEnfesto')) $('btnOrdemAutomaticaEnfesto').style.display = (grupo === 'ENFESTO' && obterOrdemManualEnfesto().length) ? '' : 'none';
    if ($('dicaArrastarEnfesto')) $('dicaArrastarEnfesto').style.display = (grupo === 'ENFESTO') ? '' : 'none';
}

// Setas de subir/descer pro Enfesto — trocado do arrastar-e-soltar
// original a pedido do usuário (arrastar não funcionou bem no navegador
// dele). Move a OP uma posição na fila (troca de lugar com a vizinha),
// salva a ordem inteira resultante (local + nuvem) e re-renderiza.
function moverOPEnfesto(chave, direcao) {
    if (!exigirAdminOuUsuario('reordenar o Enfesto')) return;
    const fila = montarFilaSequenciamentoCostura('ENFESTO');
    const chaves = fila.map(op => chaveOPCostura(op.op, op.ciclo));
    const indice = chaves.indexOf(chave);
    const novoIndice = indice + direcao;
    if (indice === -1 || novoIndice < 0 || novoIndice >= chaves.length) return;
    [chaves[indice], chaves[novoIndice]] = [chaves[novoIndice], chaves[indice]];
    salvarOrdemManualEnfesto(chaves);
    publicarOrdemManualEnfestoNaNuvem(chaves);
    renderizarSequenciamentoCostura();
}

function resetarOrdemAutomaticaEnfesto() {
    if (!exigirAdminOuUsuario('resetar a ordem do Enfesto')) return;
    if (!confirm('Voltar o Enfesto pra ordem automática (por data de finalização/prioridade)? A ordem manual que você fez vai ser descartada.')) return;
    salvarOrdemManualEnfesto([]);
    publicarOrdemManualEnfestoNaNuvem([]);
    renderizarSequenciamentoCostura();
    showToast("<i class='fas fa-rotate-left'></i> Enfesto voltou pra ordem automática.");
}

function minutosDisponiveisDia() {
    const maq = parseFloat($('capMaquinas')?.value) || 0;
    const horas = parseFloat($('capHoras')?.value) || 0;
    const ef = parseFloat($('capEficiencia')?.value) || 0;
    return maq * horas * 60 * (ef / 100);
}

function opsCandidatasCapacidade() {
    const sel = $('capFiltroEtapa');
    const valor = sel ? sel.value : 'ENFESTO_CORTE';
    return bancoDadosOPs.filter(op => {
        if (valor === 'TODAS') return true;
        if (valor === 'ENFESTO_CORTE') return op.etapa === 6 || op.etapa === 7;
        return String(op.etapa) === valor;
    });
}

function renderizarCapacidade() {
    if (!$('capListaOPs')) return;

    const sel = $('capFiltroEtapa');
    if (sel && !sel.dataset.pronto) {
        sel.innerHTML = '<option value="ENFESTO_CORTE">Enfesto + Corte</option>'
            + '<option value="TODAS">Todas as etapas</option>'
            + nomesEtapas.map((n, i) => `<option value="${i}">${n}</option>`).join('');
        sel.dataset.pronto = '1';
    }

    const disponivel = minutosDisponiveisDia();
    if ($('capDisponivel')) $('capDisponivel').innerText = `${Math.round(disponivel).toLocaleString('pt-BR')} min`;
    if ($('capDisponivelDetalhe')) {
        const h = disponivel / 60;
        $('capDisponivelDetalhe').innerText = `equivale a ${h.toFixed(1).replace('.', ',')} horas de trabalho efetivo`;
    }

    const termo = $('capBusca') ? $('capBusca').value.trim().toLowerCase() : '';
    const soSemTempo = $('capSoSemTempo') ? $('capSoSemTempo').checked : false;

    const candidatas = opsCandidatasCapacidade();
    const visiveis = candidatas.filter(op => {
        if (soSemTempo && opTemTempoDaReferencia(op)) return false;
        if (termo && !`${op.id} ${op.ciclo} ${op.desc || ''}`.toLowerCase().includes(termo)) return false;
        return true;
    }).sort((a, b) => (a.etapa - b.etapa) || (tempoEfetivoOP(b) - tempoEfetivoOP(a)));

    // Soma o que está marcado — considera TODAS as marcadas, não só as visíveis,
    // pra não "perder" seleção ao mexer nos filtros
    let totalSelecionado = 0, qtdSelecionadas = 0, semTempoSelecionadas = 0, pecasSelecionadas = 0;
    bancoDadosOPs.forEach(op => {
        if (!capSelecionadas.has(op.id)) return;
        qtdSelecionadas++;
        const t = tempoEfetivoOP(op);
        totalSelecionado += t;
        pecasSelecionadas += parseInt(op.qtd) || 0;
        if (t <= 0) semTempoSelecionadas++;
    });

    atualizarVereditoCapacidade(totalSelecionado, disponivel, qtdSelecionadas, semTempoSelecionadas, pecasSelecionadas);

    if ($('capContOPs')) $('capContOPs').innerText = `${visiveis.length} OPs · ${qtdSelecionadas} marcadas`;

    if (!visiveis.length) {
        $('capListaOPs').innerHTML = `<tr><td colspan="7" class="tabela-vazia"><i class="fas fa-inbox tabela-vazia-icone"></i>Nenhuma OP com os filtros atuais.</td></tr>`;
        return;
    }

    $('capListaOPs').innerHTML = visiveis.map(op => {
        const temTempoDaReferencia = opTemTempoDaReferencia(op);
        const t = tempoEfetivoOP(op);
        const marcada = capSelecionadas.has(op.id);
        const campoTempo = temTempoDaReferencia
            ? `<strong>${t.toFixed(1).replace('.', ',')}</strong>`
            : `<input type="number" class="cap-tempo-manual" data-id="${op.id}" value="${capTemposManuais[op.id] || ''}" placeholder="—" min="0" step="0.1" style="width:70px; text-align:right; font-size:11px; padding:3px; border:1px dashed var(--cor-selecao);">`;
        return `<tr${marcada ? ' style="background:rgba(62,124,151,0.08);"' : ''}>
            <td><input type="checkbox" class="cap-check" data-id="${op.id}" ${marcada ? 'checked' : ''}></td>
            <td><strong>${op.id}</strong>${t <= 0 ? ' <span class="pill" style="background:var(--cor-selecao); color:#2d3436; font-size:9px;">SEM TEMPO</span>' : ''}</td>
            <td>${op.ciclo}</td>
            <td><span class="pill" style="background:var(--cor-historico); font-size:9px;">${nomesEtapas[op.etapa]}</span></td>
            <td style="font-size:11px;">${(op.desc || '').substring(0, 45)}</td>
            <td style="text-align:right;">${op.qtd}</td>
            <td style="text-align:right;">${campoTempo}</td>
        </tr>`;
    }).join('');
}

function atualizarVereditoCapacidade(total, disponivel, qtd, semTempo, pecas) {
    const veredito = $('capVeredito'), detalhe = $('capDetalhe'), barra = $('capBarra'), caixa = $('capBarraResultado');
    if (!veredito) return;

    if (qtd === 0) {
        veredito.innerText = 'Marque as OPs abaixo pra montar a produção do dia.';
        veredito.style.color = 'var(--texto-cor)';
        detalhe.innerText = '';
        barra.style.width = '0%';
        caixa.style.borderLeftColor = 'var(--borda-cor)';
        if ($('capacidadeResumoTopo')) $('capacidadeResumoTopo').innerText = '';
        return;
    }

    const pct = disponivel > 0 ? (total / disponivel) * 100 : 0;
    const cabe = disponivel > 0 && total <= disponivel;
    const cor = cabe ? 'var(--cor-despacho)' : 'var(--cor-alerta)';

    veredito.innerHTML = cabe
        ? `<i class="fas fa-circle-check"></i> Cabe no dia — sobram ${Math.round(disponivel - total).toLocaleString('pt-BR')} min`
        : `<i class="fas fa-triangle-exclamation"></i> Não cabe no dia — faltam ${Math.round(total - disponivel).toLocaleString('pt-BR')} min`;
    veredito.style.color = cor;
    caixa.style.borderLeftColor = cor;
    barra.style.width = Math.min(pct, 100) + '%';
    barra.style.background = cor;

    const diasNecessarios = disponivel > 0 ? total / disponivel : 0;
    let txt = `${qtd} OPs marcadas · ${pecas.toLocaleString('pt-BR')} peças · ${Math.round(total).toLocaleString('pt-BR')} min de ${Math.round(disponivel).toLocaleString('pt-BR')} disponíveis (${pct.toFixed(0)}%) · precisa de ${diasNecessarios.toFixed(2).replace('.', ',')} dia(s)`;
    if (semTempo > 0) txt += ` ⚠️ ${semTempo} das marcadas estão sem tempo e entraram valendo zero`;
    detalhe.innerText = txt;
    if ($('capacidadeResumoTopo')) $('capacidadeResumoTopo').innerText = `${pct.toFixed(0)}% ocupado`;
}

function renderizarFilaCorte() {
    if (!$('listaFilaCorte')) return;
    const media = calcularMediaDiariaCorte();
    if ($('inputMediaCorteManual') && document.activeElement !== $('inputMediaCorteManual')) {
        $('inputMediaCorteManual').value = obterMediaCorteManual() || '';
    }

    if ($('mediaCorteInfo')) {
        $('mediaCorteInfo').innerText = media > 0
            ? `Média diária do Corte: ${Math.round(media).toLocaleString('pt-BR')} pçs/dia${obterMediaCorteManual() !== null ? ' (manual)' : ''}`
            : 'Sem dados de produção do Corte lançados ainda';
    }

    const ops = obterOPsFilaCorte();
    renderizarFiltrosFilaCorte(ops);
    renderizarListaOPsFilaCorte(ops);

    if (!ops.length) {
        // Sem a lista detalhada (importação antiga ou não feita) cai nos totais
        // agregados de sempre, sem filtro — melhor que mostrar a tela zerada.
        const salvo = localStorage.getItem('filaCorteDados');
        if (!salvo) {
            $('listaFilaCorte').innerHTML = `<tr><td colspan="5" class="tabela-vazia"><i class="fas fa-file-import tabela-vazia-icone"></i>Importe a planilha geral (POR_OP) pra ver a fila de corte.</td></tr>`;
            return;
        }
        let dados; try { dados = JSON.parse(salvo); } catch (e) { return; }
        montarTabelaFilaCorte(dados.map(s => ({ codigo: s.codigo, nome: s.nome, pecas: s.qtdPecas || 0, ops: s.qtdOps || 0 })), media);
        renderizarResumoGeral(undefined, media);
        return;
    }

    // Soma por setor a partir das linhas individuais, já com os filtros
    const porSetor = new Map();
    SETORES_FILA_CORTE.forEach(s => porSetor.set(s.codigo, { codigo: s.codigo, nome: s.nome, pecas: 0, opsSet: new Set() }));
    ops.forEach(o => {
        if (!opPassaFiltroFilaCorte(o)) return;
        const alvo = porSetor.get(o.cod);
        if (!alvo) return;
        alvo.pecas += (o.qtd || 0);
        if (o.op) alvo.opsSet.add(o.op);
    });

    montarTabelaFilaCorte(SETORES_FILA_CORTE.map(s => {
        const d = porSetor.get(s.codigo);
        return { codigo: s.codigo, nome: s.nome, pecas: d.pecas, ops: d.opsSet.size };
    }), media);

    renderizarResumoGeral(undefined, media);
}

// Desenha as linhas da tabela da fila a partir de valores já somados
function montarTabelaFilaCorte(setores, media) {
    let totalPecas = 0, totalOps = 0, totalDiasFila = 0, totalDiasFilaCorte = 0;
    const linhas = setores.map(s => {
        const diasFila = media > 0 ? s.pecas / media : 0;
        const ehProximoCorte = CODIGOS_DIAS_FILA_CORTE.includes(s.codigo);
        totalPecas += s.pecas;
        totalOps += s.ops;
        totalDiasFila += diasFila;
        if (ehProximoCorte) totalDiasFilaCorte += diasFila;
        return `<tr${ehProximoCorte ? ' style="background:rgba(62, 124, 151, 0.06);"' : ''}>
            <td>${s.nome} <span style="color:var(--texto-secundario); font-size:10px;">(${s.codigo})</span></td>
            <td style="text-align:right;">${s.pecas.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</td>
            <td style="text-align:right;">${s.ops}</td>
            <td style="text-align:right; font-weight:bold;">${diasFila.toFixed(2).replace('.', ',')}</td>
            <td style="text-align:right; font-weight:bold; color:var(--cor-sugestao);">${ehProximoCorte ? diasFila.toFixed(2).replace('.', ',') : ''}</td>
        </tr>`;
    }).join('');

    const linhaTotal = `<tr style="background:var(--cor-alerta); color:white; font-weight:900;">
        <td>TOTAL</td>
        <td style="text-align:right;">${totalPecas.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</td>
        <td style="text-align:right;">${totalOps}</td>
        <td style="text-align:right;">${totalDiasFila.toFixed(2).replace('.', ',')}</td>
        <td style="text-align:right;">${totalDiasFilaCorte.toFixed(2).replace('.', ',')}</td>
    </tr>`;

    $('listaFilaCorte').innerHTML = linhas + linhaTotal;
}


// Baixa o painel inteiro (cabeçalho + tabela) como imagem PNG — útil pra
// anexar ou colar direto num e-mail.
function baixarImagemFilaCorte() {
    if (typeof html2canvas === 'undefined') { showToast("<i class='fas fa-exclamation-triangle'></i> Biblioteca de imagem não carregada.", true); return; }
    const painel = $('painel-fila-corte');
    if (!painel) return;
    const botoesAcao = $('botoes-acao-filacorte');
    if (botoesAcao) botoesAcao.style.display = 'none';
    showToast("<i class='fas fa-spinner fa-spin'></i> Gerando imagem...", false);

    html2canvas(painel, { scale: 2, backgroundColor: document.body.classList.contains('dark-mode') ? '#221F1A' : '#ffffff' }).then(canvas => {
        const link = document.createElement('a');
        link.href = canvas.toDataURL('image/png');
        link.download = `Fila_de_Corte_${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.png`;
        link.click();
        if (botoesAcao) botoesAcao.style.display = 'flex';
        showToast("<i class='fas fa-camera'></i> Imagem da fila de corte baixada!");
    }).catch(() => {
        if (botoesAcao) botoesAcao.style.display = 'flex';
        showToast("<i class='fas fa-exclamation-triangle'></i> Erro ao gerar a imagem.", true);
    });
}

// Etapa do sistema → setor do KPI que mede o ritmo dela (Dublagem não tem KPI).
const SETOR_KPI_DA_ETAPA = { 0: 'PPCP PROGRAMACAO', 1: 'ANALISE DE MEDIDAS', 2: 'CAD', 3: 'PCP PROGRAMACAO-CORTE', 4: 'ALMOX TECIDO', 6: 'ENFESTO', 7: 'CORTE' };
// Ritmo do setor: média de peças/dia dos últimos N dias ÚTEIS COM MOVIMENTO (até hoje). Precisa de pelo menos 2 dias.
function calcularRitmoDiarioSetorKPI(setorKpi, maxDias) {
    const movs = obterMovimentacoesPorSetor('fabrica')[setorKpi] || {};
    const porDia = {};
    const hojeISO = new Date().toISOString().slice(0, 10);
    Object.values(movs).forEach(m => {
        if (!m.data) return;
        const dia = new Date(m.data).toISOString().slice(0, 10);
        const dow = new Date(dia + 'T00:00:00Z').getUTCDay();
        if (dow === 0 || dow === 6 || dia > hojeISO) return;
        porDia[dia] = (porDia[dia] || 0) + (m.qtd || 0);
    });
    const dias = Object.keys(porDia).sort().slice(-maxDias);
    if (dias.length < 2) return null;
    return { media: dias.reduce((t, d) => t + porDia[d], 0) / dias.length, dias: dias.length, de: dias[0], ate: dias[dias.length - 1] };
}

// Calcula o ranking de setores por "peso de gargalo" — reaproveitado tanto
// pelo modal de Ranking de Gargalos quanto pelo painel de visão geral.
// Aceita o mapa de pendentes-por-referência já calculado (evita reler e
// reprocessar o localStorage de novo quando chamada de dentro do ciclo
// principal de renderização); se não vier nada, calcula na hora.
function calcularRankingGargalo(pendentesPorReferenciaParam) {
    if (!bancoDadosOPs || bancoDadosOPs.length === 0) return [];

    const pendentesPorReferencia = pendentesPorReferenciaParam || obterPendentesPorReferencia();
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);

    let setoresStatus = nomesEtapas.map((nome, index) => ({
        id: index, nome: nome, qtdOps: 0, qtdPcs: 0, somaDias: 0, maxDias: 0, score: 0, opsCriticas: 0,
        opsComPedido: 0, opsComPedidoUrgente: 0, ops: [], pcsFila: 0, ritmo: null, diasFila: null
    }));

    bancoDadosOPs.forEach(op => {
        if (op.etapa >= 0 && op.etapa < nomesEtapas.length) {
            let diasParados = op.diasLocal || 0;
            let stat = setoresStatus[op.etapa];
            let pecas = parseInt(op.qtd) || 0;

            stat.qtdOps++;
            stat.qtdPcs += pecas;
            stat.somaDias += diasParados;
            if (diasParados > stat.maxDias) stat.maxDias = diasParados;
            if (diasParados >= 3) stat.opsCriticas++;

            let pesoOp = (pecas * 0.01) + (diasParados * 5);

            // OP parada que também está travando um pedido pesa mais no ranking —
            // não é só volume/tempo, tem entrega real de cliente em jogo.
            const pendentesRef = op.referencia ? pendentesPorReferencia.get(op.referencia) : null;
            let opComPedido = false, opUrgente = false;
            if (pendentesRef && pendentesRef.length) {
                const pedido = [...pendentesRef].sort(compararUrgenciaPedidos)[0];
                const especial = pedido.prior !== 99;
                const dataChegada = pedido.chegada ? new Date(pedido.chegada) : null;
                const vencido = dataChegada && dataChegada < hoje;
                opComPedido = true; opUrgente = !!(especial || vencido);
                stat.opsComPedido++;
                if (especial || vencido) stat.opsComPedidoUrgente++;
                pesoOp += especial ? 200 : (vencido ? 100 : 50);
            }

            stat.score += pesoOp;
            const sc = SETOR_KPI_DA_ETAPA[op.etapa];
            const mult = (sc && SETORES_COM_MULTIPLICADOR_CAMADAS_KPI.has(sc)) ? multiplicadorDeCamadas(op.desc) : 1;   // o KPI de Enfesto/Corte conta por camada
            stat.pcsFila += pecas * mult;
            stat.ops.push({ op, pecas, dias: diasParados, comPedido: opComPedido, urgente: opUrgente });
        }
    });

    // Dias de fila = peças na etapa ÷ ritmo diário do setor (média dos últimos dias úteis do KPI).
    // Etapa sem ritmo (ex.: Dublagem, ou KPI ainda não importado) fica sem esse número e cai no critério antigo (peso).
    setoresStatus.forEach(st => {
        const sc = SETOR_KPI_DA_ETAPA[st.id];
        const r = sc ? calcularRitmoDiarioSetorKPI(sc, 5) : null;
        if (r && r.media > 0) { st.ritmo = r; st.diasFila = st.pcsFila / r.media; }
    });
    return setoresStatus.filter(s => s.qtdOps > 0).sort((a, b) => {
        if (a.diasFila !== null && b.diasFila !== null) return b.diasFila - a.diasFila;
        if (a.diasFila !== null) return -1;
        if (b.diasFila !== null) return 1;
        return b.score - a.score;
    });
}

// =========================================================================
// 📊 PAINEL DE VISÃO GERAL — resumo rápido de 5 números-chave, no topo da
// Fila Geral, cada um clicável levando pra aba/análise correspondente.
// =========================================================================
// Anima um número subindo de 0 até o valor final — usado nos cartões da
// Visão Geral pra dar aquela sensação de "painel vivo" ao atualizar.
function animarContador(elementId, valorFinal, duracaoMs = 700) {
    const el = $(elementId);
    if (!el) return;
    const inicioTempo = performance.now();
    function passo(agora) {
        const progresso = Math.min((agora - inicioTempo) / duracaoMs, 1);
        el.innerText = Math.round(valorFinal * progresso);
        if (progresso < 1) requestAnimationFrame(passo);
        else el.innerText = valorFinal;
    }
    requestAnimationFrame(passo);
}

function renderizarResumoGeral(pendentesPorReferenciaParam, mediaCorteParam) {
    if (!$('resumo-pedidos-total')) return;
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);

    // Recebe o mapa já calculado quando vem do ciclo principal de renderização
    // (evita reprocessar o localStorage de novo pras seções que dependem
    // disso); senão, calcula na hora — mantém a função utilizável sozinha
    // (ex: depois de sincronizar a Fila de Corte, que roda fora do ciclo
    // principal). A lista completa de pedidos é lida à parte (não reconstruída
    // a partir do mapa), porque o mapa ignora de propósito pedidos sem
    // referência preenchida — reconstruir a partir dele os perderia da contagem.
    const pendentesPorReferencia = pendentesPorReferenciaParam || obterPendentesPorReferencia();
    const pendentes = obterPedidosPendentes();

    // Pedidos pendentes
    const pedidosUrgentes = pendentes.filter(p => p.prior !== 99 || (p.chegada && new Date(p.chegada) < hoje)).length;
    animarContador('resumo-pedidos-total', pendentes.length);
    $('resumo-pedidos-urgentes').innerText = pedidosUrgentes > 0 ? `${pedidosUrgentes} urgente${pedidosUrgentes > 1 ? 's' : ''}` : 'nenhum urgente';
    if ($('cardResumoPedidos')) $('cardResumoPedidos').classList.toggle('destaque-urgente', pedidosUrgentes > 0);

    // OPs vinculadas a pedidos
    let totalVinculadas = 0, vinculadasUrgentes = 0;
    bancoDadosOPs.forEach(op => {
        if (!op.referencia) return;
        const pendentesRef = pendentesPorReferencia.get(op.referencia);
        if (!pendentesRef || !pendentesRef.length) return;
        totalVinculadas++;
        const pedido = [...pendentesRef].sort(compararUrgenciaPedidos)[0];
        const especial = pedido.prior !== 99;
        const dataChegada = pedido.chegada ? new Date(pedido.chegada) : null;
        const vencido = dataChegada && dataChegada < hoje;
        if (especial || vencido) vinculadasUrgentes++;
    });
    animarContador('resumo-vinculadas-total', totalVinculadas);
    $('resumo-vinculadas-urgentes').innerText = vinculadasUrgentes > 0 ? `${vinculadasUrgentes} urgente${vinculadasUrgentes > 1 ? 's' : ''}` : 'nenhuma urgente';
    if ($('cardResumoVinculadas')) $('cardResumoVinculadas').classList.toggle('destaque-urgente', vinculadasUrgentes > 0);

    // Fila de corte
    const salvoFilaCorte = localStorage.getItem('filaCorteDados');
    if (salvoFilaCorte) {
        try {
            const dadosFC = JSON.parse(salvoFilaCorte);
            const media = mediaCorteParam ?? calcularMediaDiariaCorte();
            const opsFC = obterOPsFilaCorte();
            let pecasProximoCorte;
            if (opsFC.length) {
                pecasProximoCorte = opsFC.reduce((s, o) => s + (CODIGOS_DIAS_FILA_CORTE.includes(o.cod) && opPassaFiltroFilaCorte(o) ? (o.qtd || 0) : 0), 0);
            } else {
                pecasProximoCorte = dadosFC.reduce((s, x) => s + (CODIGOS_DIAS_FILA_CORTE.includes(x.codigo) ? (x.qtdPecas || 0) : 0), 0);
            }
            const diasFilaCorte = media > 0 ? pecasProximoCorte / media : 0;
            $('resumo-diasfilacorte').innerText = diasFilaCorte.toFixed(1).replace('.', ',');
            $('resumo-diasfilacorte-detalhe').innerText = 'dias na porta do corte';
            if ($('cardResumoFilaCorte')) $('cardResumoFilaCorte').classList.toggle('destaque-urgente', diasFilaCorte >= 5);
        } catch (e) { $('resumo-diasfilacorte').innerText = '—'; }
    } else {
        $('resumo-diasfilacorte').innerText = '—';
        $('resumo-diasfilacorte-detalhe').innerText = 'planilha não importada';
    }

    // Maior gargalo — passa o mapa adiante, em vez de deixar recalcular de novo
    const ranking = calcularRankingGargalo(pendentesPorReferencia);
    if (ranking.length > 0) {
        $('resumo-gargalo-setor').innerText = ranking[0].nome;
        $('resumo-gargalo-detalhe').innerText = ranking[0].diasFila !== null ? `${ranking[0].diasFila.toFixed(1).replace('.', ',')} dias de fila · ${ranking[0].qtdOps} OPs` : `${ranking[0].qtdOps} OPs · ${ranking[0].maxDias}d no pior caso`;
        if ($('cardResumoGargalo')) $('cardResumoGargalo').classList.toggle('destaque-urgente', ranking[0].opsComPedidoUrgente > 0);
    } else {
        $('resumo-gargalo-setor').innerText = '—';
        $('resumo-gargalo-detalhe').innerText = 'sem dados';
        if ($('cardResumoGargalo')) $('cardResumoGargalo').classList.remove('destaque-urgente');
    }

    // Fila geral (a própria tabela logo abaixo)
    const totalFila = filaGeralDadosGlobais.length;
    const atrasadosFila = filaGeralDadosGlobais.filter(i => i.sCls === 'pill-atraso').length;
    animarContador('resumo-fila-total', totalFila);
    $('resumo-fila-atraso').innerText = atrasadosFila > 0 ? `${atrasadosFila} em atraso` : 'nenhum em atraso';
    if ($('cardResumoFilaGeral')) $('cardResumoFilaGeral').classList.toggle('destaque-urgente', atrasadosFila > 0);
}

function analisarGargalo() {
    if (!bancoDadosOPs || bancoDadosOPs.length === 0) {
        showToast("<i class='fas fa-info-circle'></i> Sem OPs para analisar.");
        return;
    }

    let setoresAtivos = calcularRankingGargalo();

    if (setoresAtivos.length === 0) {
        showToast("<i class='fas fa-check-circle'></i> Fluxo limpo! Nenhuma OP parada.");
        return;
    }

    const fmt1 = v => v.toFixed(1).replace('.', ',');
    const comRitmo = setoresAtivos.filter(s => s.diasFila !== null);
    const maxDiasFila = comRitmo.length ? Math.max(...comRitmo.map(s => s.diasFila)) : 0;
    const maxScoreGlobal = Math.max(1, ...setoresAtivos.map(s => s.score));
    const corDaFila = d => d >= 3 ? 'var(--cor-alerta)' : (d >= 1.5 ? 'var(--cor-selecao)' : 'var(--cor-despacho)');

    // Esteira: as etapas na ordem real, largura proporcional aos dias de fila
    const porEtapa = [...setoresAtivos].sort((a, b) => a.id - b.id);
    const esteira = comRitmo.length ? `<div style="display:flex; gap:3px; margin-bottom:14px; align-items:stretch;">${porEtapa.map(st => {
        const peso = st.diasFila !== null ? Math.max(st.diasFila, 0.25) : 0.25;
        return `<div title="${st.nome}: ${st.diasFila !== null ? fmt1(st.diasFila) + ' dias de fila' : 'sem ritmo no KPI'}" style="flex:${peso} 1 0; min-width:44px; background:${st.diasFila !== null ? corDaFila(st.diasFila) : 'var(--borda-cor)'}; color:white; border-radius:6px; padding:6px 4px; text-align:center; overflow:hidden;">
            <div style="font-size:9px; font-weight:700; white-space:nowrap; text-overflow:ellipsis; overflow:hidden;">${st.nome}</div>
            <div style="font-size:13px; font-weight:900;">${st.diasFila !== null ? fmt1(st.diasFila) + 'd' : '—'}</div></div>`;
    }).join('')}</div>` : '';

    const linhaOP = o => {
        const x = o.op;
        const prio = opEstaNaAbaPrioridades(x.ciclo, x.id);
        return `<tr>
            <td style="white-space:nowrap;">${prio ? '<i class="fas fa-star" style="color:var(--cor-selecao); font-size:10px;" title="Está na aba Prioridades"></i> ' : ''}<strong>${x.id}</strong>${x.ciclo ? ' · ' + x.ciclo : ''}</td>
            <td style="max-width:230px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${String(x.desc || '').replace(/"/g, '&quot;')}">${x.desc || ''}</td>
            <td class="num">${o.pecas.toLocaleString('pt-BR')}</td>
            <td class="num" style="${o.dias >= 3 ? 'color:var(--cor-alerta); font-weight:700;' : ''}">${o.dias}d</td>
            <td>${o.comPedido ? `<span class="pill" style="background:${o.urgente ? 'var(--cor-roxo)' : 'var(--cor-sugestao)'}; color:white;" title="Trava um pedido de cliente em aberto">${o.urgente ? 'PEDIDO URGENTE' : 'PEDIDO'}</span>` : ''}</td>
        </tr>`;
    };
    const listaOPs = st => {
        const ordenadas = [...st.ops].sort((a, b) => (opEstaNaAbaPrioridades(b.op.ciclo, b.op.id) ? 1 : 0) - (opEstaNaAbaPrioridades(a.op.ciclo, a.op.id) ? 1 : 0) || (b.urgente ? 1 : 0) - (a.urgente ? 1 : 0) || b.dias - a.dias);
        return `<div style="max-height:260px; overflow-y:auto; margin-top:8px; border-top:1px solid var(--borda-cor);"><table class="tabela-dados" style="width:100%;"><thead><tr><th>OP</th><th>DESCRIÇÃO</th><th style="text-align:right;">PEÇAS</th><th style="text-align:right;">NO LOCAL</th><th></th></tr></thead><tbody>${ordenadas.map(linhaOP).join('')}</tbody></table></div>`;
    };

    let htmlGargalos = setoresAtivos.map((s, index) => {
        const mediaDias = s.qtdOps > 0 ? (s.somaDias / s.qtdOps).toFixed(1) : 0;
        const temFila = s.diasFila !== null;
        const pctBarra = temFila ? (maxDiasFila > 0 ? (s.diasFila / maxDiasFila) * 100 : 0) : (s.score / maxScoreGlobal) * 100;
        const corNivel = temFila ? corDaFila(s.diasFila) : 'var(--borda-cor)';
        const icone = index === 0 && temFila ? '<i class="fas fa-exclamation-triangle" style="color:var(--cor-alerta);"></i>' : `#${index + 1}`;
        const explicacao = temFila
            ? `<strong>${s.pcsFila.toLocaleString('pt-BR')}</strong> pçs na etapa${s.pcsFila !== s.qtdPcs ? ' <span title="Enfesto e Corte contam por camada (Paletó/Blazer/Sobretudo 3x, Jaqueta 2x), igual ao KPI">(contando camadas)</span>' : ''} ÷ <strong>${Math.round(s.ritmo.media).toLocaleString('pt-BR')}</strong> pçs/dia <span title="Média dos últimos ${s.ritmo.dias} dias úteis com movimento (${formatarChaveDataBR(s.ritmo.de)} a ${formatarChaveDataBR(s.ritmo.ate)})">(últimos ${s.ritmo.dias} dias úteis)</span>`
            : `sem ritmo do KPI pra essa etapa — ordenada pelo peso (volume + dias parada + pedido)`;
        return `
            <details style="background:var(--bg-painel); border:1px solid var(--borda-cor); border-radius:8px; margin-bottom:10px; overflow:hidden; position:relative;">
                <summary style="list-style:none; cursor:pointer; position:relative;">
                    <div class="barra-gargalo-fill" data-pct="${pctBarra}" style="position:absolute; top:0; left:0; height:100%; width:0%; background:${corNivel}; opacity:0.12; z-index:0; transition:width 0.6s ease-out;"></div>
                    <div style="position:relative; z-index:1; padding:12px 15px; display:flex; justify-content:space-between; align-items:center; gap:12px;">
                        <div style="flex:1; min-width:0;">
                            <div style="font-size:14px; font-weight:900; color:var(--texto-cor); display:flex; align-items:center; gap:10px;">
                                <span style="font-size:14px; width:20px; text-align:center; color:var(--texto-secundario);">${icone}</span>${s.nome}
                            </div>
                            <div style="font-size:11px; color:var(--texto-secundario); margin-top:4px; margin-left:30px;">
                                <strong>${s.qtdOps}</strong> OPs • <strong>${s.qtdPcs.toLocaleString('pt-BR')}</strong> pçs • no local: máx <strong style="color:${s.maxDias >= 3 ? 'var(--cor-alerta)' : 'inherit'};">${s.maxDias}d</strong>, média ${mediaDias}d
                            </div>
                            <div style="font-size:11px; color:var(--texto-secundario); margin-top:2px; margin-left:30px;">${explicacao}</div>
                        </div>
                        <div style="text-align:right; min-width:110px;">
                            ${temFila ? `<div style="font-size:22px; font-weight:900; color:${corNivel}; line-height:1;">${fmt1(s.diasFila)}</div><div style="font-size:10px; color:var(--texto-secundario);">dias de fila</div>` : ''}
                            <div style="margin-top:4px;">${s.opsCriticas > 0 ? `<span style="font-size:9px; background:var(--cor-alerta); color:white; padding:2px 6px; border-radius:4px; font-weight:bold;">${s.opsCriticas} Críticas</span>` : ''}
                            ${s.opsComPedido > 0 ? `<span style="font-size:9px; background:${s.opsComPedidoUrgente > 0 ? 'var(--cor-roxo)' : 'var(--cor-sugestao)'}; color:white; padding:2px 6px; border-radius:4px; margin-left:3px; font-weight:bold;" title="OPs paradas aqui que também travam um pedido de cliente ainda em aberto"><i class="fas fa-user-clock"></i> ${s.opsComPedido} c/ pedido</span>` : ''}</div>
                        </div>
                    </div>
                </summary>
                <div style="padding:0 15px 12px;">${listaOPs(s)}</div>
            </details>`;
    }).join('');

    let modal = $('modalGargalo');
    modal.innerHTML = `
        <div class="modal-card" style="width:720px; max-width:92vw; border-top:5px solid var(--cor-alerta); max-height:88vh;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; border-bottom:2px solid var(--borda-cor); padding-bottom:10px;">
                <h2 style="margin:0; color:var(--texto-cor); display:flex; align-items:center; gap:10px;">
                    <i class="fas fa-search-location" style="color:var(--cor-alerta);"></i> VISÃO DE GARGALO
                </h2>
                <button onclick="document.getElementById('modalGargalo').style.display='none'" class="modal-fechar-btn"><i class="fas fa-times"></i></button>
            </div>
            <div style="font-size:12px; color:var(--texto-secundario); margin-bottom:12px;">
                <strong>Dias de fila</strong> = peças que estão na etapa agora ÷ média de peças/dia que o setor produziu nos últimos dias úteis (do KPI). Quanto maior, mais tempo o setor levaria para esvaziar a fila no ritmo atual.
                Verde até 1,5 dia · amarelo até 3 · vermelho acima. Clique numa etapa para ver as OPs (as da aba Prioridades e as com pedido urgente aparecem primeiro).
            </div>
            ${esteira}
            <div style="overflow-y:auto; flex:1; padding-right:5px; margin-bottom:15px;">
                ${htmlGargalos}
            </div>
            <div style="display:flex; gap:10px; justify-content:flex-end; border-top:1px solid var(--borda-cor); padding-top:15px;">
                <button onclick="document.getElementById('modalGargalo').style.display='none'" class="btn" style="background:var(--borda-cor); color:var(--texto-cor);">FECHAR</button>
                <button onclick="document.getElementById('modalGargalo').style.display='none'; abrirAba(null, 'aba-fila');" class="btn btn-acao">
                    <i class="fas fa-list"></i> VER FILA GERAL
                </button>
            </div>
        </div>
    `;
    modal.style.display = 'flex';

    // Deixa as barras nascerem em 0% pra depois crescer até o valor real — só
    // funciona se houver um "antes" real no DOM antes de mudar o valor, por
    // isso o requestAnimationFrame duplo (garante que o navegador já pintou
    // a largura 0% antes de mudar pra largura de verdade).
    requestAnimationFrame(() => requestAnimationFrame(() => {
        $$('.barra-gargalo-fill').forEach(el => { el.style.width = el.dataset.pct + '%'; });
    }));
}

// FILA GERAL E RAIO-X
function ordenarFilaGeral(col) { if (filaOrdenacaoCol === col) filaOrdenacaoAsc = !filaOrdenacaoAsc; else { filaOrdenacaoCol = col; filaOrdenacaoAsc = true; } renderizarTabelaFilaGeral(); }

function renderizarTabelaFilaGeral() {
    let d = [...filaGeralDadosGlobais]; $$('th[id^="ordenarFilaGeral"] span').forEach(e => e.innerText = '');
    if (filaOrdenacaoCol !== 'padrao' && $('seta-' + filaOrdenacaoCol)) $('seta-' + filaOrdenacaoCol).innerText = filaOrdenacaoAsc ? " ▲" : " ▼";
    d.sort((a, b) => { if (a.op.prioridade !== b.op.prioridade) return b.op.prioridade - a.op.prioridade; if (filaOrdenacaoCol === 'padrao') return (a.peso - b.peso) || (a.dMeta - b.dMeta); let vA = ['dMeta', 'sTxt'].includes(filaOrdenacaoCol) ? a[filaOrdenacaoCol] : a.op[filaOrdenacaoCol], vB = ['dMeta', 'sTxt'].includes(filaOrdenacaoCol) ? b[filaOrdenacaoCol] : b.op[filaOrdenacaoCol]; return filaOrdenacaoAsc ? String(vA || '').localeCompare(String(vB || ''), undefined, { numeric: true }) : -String(vA || '').localeCompare(String(vB || ''), undefined, { numeric: true }); });
    $('listaFilaGeral').innerHTML = d.length === 0
        ? `<tr><td colspan="9" class="tabela-vazia"><i class="fas fa-inbox tabela-vazia-icone"></i>Nenhuma OP encontrada com os filtros atuais.</td></tr>`
        : d.map(i => `<tr oncontextmenu="mostrarMenuContexto(event, '${i.op.id}')" style="${i.op.prioridade ? 'background:rgba(107, 76, 122, 0.05);' : (i.sCls === 'pill-atraso' ? 'background:rgba(193, 68, 78, 0.06);' : '')}"><td>${i.op.prioridade ? '<i class="fas fa-star" style="color:var(--cor-selecao);"></i>' : '<span class="status-mov">●</span>'}</td><td>${i.op.ciclo}</td><td><strong>${i.op.id}</strong></td><td>${i.op.localDestino}</td><td>${i.op.localExcel}</td><td><span class="pill" style="background:${i.op.temDublado ? 'var(--cor-sugestao)' : '#ccc'};">${i.op.temDublado ? 'SIM' : 'NÃO'}</span></td><td>${i.op.tempoCorte} min</td><td style="color:var(--cor-alerta); font-weight:bold;">${i.metaTxt}</td><td><span class="pill ${i.sCls}">${i.sTxt}</span></td></tr>`).join('');
}

//PAINEL MONTADOR/PROGRAMAÇÃO//
// Lê a grade por tamanho de todas as OPs (planilha de Grade já importada) —
// usada tanto no tooltip da OP quanto na checagem de cobertura de pedido.
// =========================================================================
// 📐 UNIFORMIDADE DE GRADE — o quão "redonda" é a grade de uma OP, pensando
// no enfesto. Ideia explicada pelo usuário: uma grade uniforme (ex: 100 de
// cada tamanho) fecha num esquema só, repetido; uma grade "torta" (ex:
// 3/27/17/37/10) obriga a fatiar em vários esquemas menores — o que demora
// mais mesmo tendo menos peças no total. A base matemática disso é o MDC
// (máximo divisor comum) das quantidades: se ele for alto (perto do maior
// tamanho), existe um padrão que se repete; se for baixo (perto de 1), não
// tem padrão nenhum pra repetir.
// =========================================================================
function mdc(a, b) { while (b) { [a, b] = [b, a % b]; } return a; }
function mdcLista(numeros) {
    const validos = numeros.filter(n => n > 0);
    if (!validos.length) return 0;
    return validos.reduce((a, b) => mdc(a, b));
}

// Retorna um número de 0 (grade bem torta, muitos esquemas) a 1 (grade
// uniforme, um esquema só) — ou null se não tiver tamanho suficiente pra
// calcular (grade vazia ou só 1 tamanho, onde MDC = a própria quantidade).
function calcularUniformidadeGrade(tamanhos) {
    if (!tamanhos) return null;
    const qtds = Object.values(tamanhos).map(q => parseInt(q) || 0).filter(q => q > 0);
    if (qtds.length < 2) return null;
    const maior = Math.max(...qtds);
    const divisorComum = mdcLista(qtds);
    return maior > 0 ? divisorComum / maior : null;
}

// Junta OP + Ciclo numa chave só. Comprovado que o mesmo número de OP pode
// se repetir em ciclos diferentes representando produtos totalmente
// diferentes (ex: OP 3855 é avental no ciclo 211 e calçado no ciclo 111) —
// sem isso, as duas grades se misturavam na mesma "gaveta".
function chaveGrade(opId, ciclo) {
    return `${opId}|${ciclo || ''}`;
}

// Busca a grade de uma OP, usando o ciclo quando disponível. Quando o ciclo
// não é conhecido (ex: OP que só existe na jornada pós-corte, que não
// carrega ciclo), tenta achar só pelo número — mas SÓ devolve se existir
// exatamente 1 correspondência; se o número bater em mais de um ciclo, não
// dá pra saber qual é a certa, então não arrisca (retorna null em vez de
// adivinhar errado).
function buscarGrade(grades, opId, ciclo) {
    if (ciclo) {
        const exata = grades[chaveGrade(opId, ciclo)];
        if (exata) return exata;
    }
    const candidatas = Object.keys(grades).filter(k => k.split('|')[0] === String(opId));
    if (candidatas.length === 1) return grades[candidatas[0]];
    return null;
}

function obterOPsAguardandoMateriaPrima() {
    try { return JSON.parse(localStorage.getItem('opsAguardandoMP') || '[]'); } catch (e) { return []; }
}

let cacheGradesPorOP = null; // limpo (= null) sempre que gradesPorOP é escrito de novo
function obterGradesPorOP() {
    if (cacheGradesPorOP) return cacheGradesPorOP;
    try { cacheGradesPorOP = JSON.parse(localStorage.getItem('gradesPorOP') || '{}'); }
    catch (e) { cacheGradesPorOP = {}; }
    return cacheGradesPorOP;
}

// Agrupa os pedidos pendentes por referência — usado tanto pra vincular OPs
// da Programação quanto pra montar a lista separada de "OPs vinculadas".
function obterPendentesPorReferencia() {
    const mapa = new Map();
    obterPedidosPendentes().forEach(p => {
        if (!p.referencia) return;
        if (!mapa.has(p.referencia)) mapa.set(p.referencia, []);
        mapa.get(p.referencia).push(p);
    });
    return mapa;
}

// Ordem da lista PROGRAMAR LOTE (aba Programação). Gira em torno da DATA DE
// INCLUSÃO da OP (mais antiga primeiro), não da urgência de pedido — assim uma
// OP de reposição que ninguém pediu ainda também vai subindo com o tempo, em
// vez de ficar parada. Matéria-prima agrupa: quando uma OP entra na lista, as
// outras OPs da MESMA MP vêm logo atrás dela (mesmo com inclusão mais nova),
// então cada lote de MP fica na posição da OP mais antiga que ele tem.
// Combinado com o usuário:
//  - dentro do lote: da mais antiga pra mais nova; empate de data -> nº da OP
//  - OP sem código de MP não forma lote: fica solta, na sua própria data
//  - OP sem data de inclusão vai pro FINAL da lista (agrupadas por MP)
//  - setinha do cabeçalho CORTE inverte: mais nova primeiro (o lote fica na
//    posição da OP mais NOVA dele); as OPs sem data continuam no final
//  - estrela de prioridade e vínculo com pedido NÃO mexem na ordem
function ordenarProgramacaoPorInclusao(ops, maisAntigaPrimeiro) {
    const dir = maisAntigaPrimeiro ? 1 : -1;
    const tempo = op => { const t = op.dataInclusao ? new Date(op.dataInclusao).getTime() : NaN; return isNaN(t) ? null : t; };
    const codigoMP = op => (op.codigoMP && op.codigoMP !== 'SEM CÓDIGO') ? op.codigoMP : null;
    const cmpId = (a, b) => {
        const na = parseInt(a.id), nb = parseInt(b.id);
        if (!isNaN(na) && !isNaN(nb) && na !== nb) return na - nb;
        return String(a.id).localeCompare(String(b.id));
    };
    const cmpOP = (a, b) => (tempo(a) - tempo(b)) * dir || cmpId(a, b) * dir;

    const comData = ops.filter(op => tempo(op) !== null);
    const semData = ops.filter(op => tempo(op) === null);

    // Cada lote = lista de OPs da mesma MP. OP sem MP vira um lote de uma OP só.
    const lotes = [];
    const lotePorMP = new Map();
    comData.forEach(op => {
        const mp = codigoMP(op);
        if (mp === null) { lotes.push([op]); return; }
        if (!lotePorMP.has(mp)) { lotePorMP.set(mp, []); lotes.push(lotePorMP.get(mp)); }
        lotePorMP.get(mp).push(op);
    });
    lotes.forEach(lote => lote.sort(cmpOP));
    lotes.sort((la, lb) => cmpOP(la[0], lb[0]));

    // Sem data de inclusão: final da lista, ainda agrupadas por MP (sem MP por último)
    semData.sort((a, b) => {
        const ma = codigoMP(a), mb = codigoMP(b);
        if (ma !== mb) { if (ma === null) return 1; if (mb === null) return -1; return ma.localeCompare(mb); }
        return cmpId(a, b);
    });

    return [...lotes.flat(), ...semData];
}

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
    renderizarCapacidade();
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

// =========================================================================
// 🏷️ AGRUPAMENTO POR REFERÊNCIA — junta as OPs que compartilham a mesma
// referência entre os dois setores iniciais (PCP-Programação e Almox.
// Análise de Medidas), pra facilitar planejar/produzir elas juntas. Só
// mostra referências com 2+ OPs — uma OP sozinha não é "agrupamento".
// =========================================================================
// Mesmo cálculo do Agrupador por Referência (2+ OPs entre Programação,
// Análise de Medidas e Aguardando Matéria Prima, sem SBM), só que
// reaproveitável — usado tanto pelo modal quanto pelo selo na tabela da
// Programação. Cacheado (mesma lógica do cache de grade/pedidos de ontem):
// só refaz quando a sincronização traz dado novo.
let cacheGruposPorReferencia = null;
function calcularGruposPorReferencia() {
    if (cacheGruposPorReferencia) return cacheGruposPorReferencia;
    const candidatasBanco = bancoDadosOPs.filter(op => (op.etapa === 0 || op.etapa === 1) && op.referencia && !op.sobMedida);
    // Marca essas com uma etapa de exibição própria (nomesEtapas não tem
    // índice pra "Aguardando Matéria Prima" — fica antes de tudo, fora da
    // escala 0-7 normal)
    const candidatasAguardMP = obterOPsAguardandoMateriaPrima()
        .filter(op => op.referencia && !op.sobMedida)
        .map(op => ({ ...op, etapaRotulo: op.analiseMP ? 'ANÁLISE DE MATÉRIA PRIMA' : 'AGUARD. MATÉRIA PRIMA', etapaCor: 'var(--cor-alerta)' }));
    const candidatas = [...candidatasBanco, ...candidatasAguardMP];

    const porReferencia = new Map();
    candidatas.forEach(op => {
        if (!porReferencia.has(op.referencia)) porReferencia.set(op.referencia, []);
        porReferencia.get(op.referencia).push(op);
    });
    const grupos = [...porReferencia.entries()]
        .filter(([ref, ops]) => ops.length >= 2)
        .sort((a, b) => b[1].length - a[1].length);

    cacheGruposPorReferencia = grupos;
    return grupos;
}

function abrirAgrupamentoReferencia() {
    const grupos = calcularGruposPorReferencia();
    ultimoAgrupamentoReferenciaGerado = grupos;
    renderizarAgrupamentoReferencia(grupos);
    $('modalAgrupamentoReferencia').style.display = 'flex';
}

function renderizarAgrupamentoReferencia(grupos) {
    const gruposHtml = grupos.map(([ref, ops]) => {
        const totalPecas = ops.reduce((s, o) => s + (parseInt(o.qtd) || 0), 0);
        const descricaoRef = ops.find(o => o.desc)?.desc || '';
        const linhas = ops.map(op => `
            <tr>
                <td><strong>${op.id}</strong></td>
                <td>${op.ciclo}</td>
                <td><span class="pill" style="background:${op.etapaRotulo ? op.etapaCor : (op.etapa === 0 ? 'var(--cor-fila)' : 'var(--cor-sugestao)')};">${op.etapaRotulo || nomesEtapas[op.etapa]}</span></td>
                <td style="text-align:right;">${op.qtd}</td>
                <td>${op.codigoMP || '-'}</td>
                <td style="text-align:right; color:${(op.diasLocal || 0) >= 3 ? 'var(--cor-alerta)' : 'var(--texto-cor)'};">${op.diasLocal || 0}</td>
            </tr>
        `).join('');
        return `
            <div style="border-left:4px solid var(--cor-fila); background:var(--bg-painel); border-radius:8px; padding:12px; margin-bottom:14px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                    <strong style="font-size:13px;"><i class="fas fa-tag"></i> ${ref}${descricaoRef ? ` <span style="font-weight:normal; color:var(--texto-secundario); font-size:11px;">— ${descricaoRef}</span>` : ''}</strong>
                    <span style="font-size:11px; color:var(--texto-secundario);">${ops.length} OPs · ${totalPecas} peças no total</span>
                </div>
                <table class="tabela-dados">
                    <thead><tr><th>OP</th><th>CICLO</th><th>ETAPA</th><th style="text-align:right;">PEÇAS</th><th>MATÉRIA-PRIMA</th><th style="text-align:right;">DIAS PARADO</th></tr></thead>
                    <tbody>${linhas}</tbody>
                </table>
            </div>
        `;
    }).join('');

    $('modalAgrupamentoReferencia').innerHTML = `
        <div class="modal-card" style="width:680px; max-width:92vw; border-top:5px solid var(--cor-fila); max-height:88vh;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; border-bottom:2px solid var(--borda-cor); padding-bottom:10px;">
                <h2 style="margin:0; color:var(--texto-cor); display:flex; align-items:center; gap:10px; font-size:16px;">
                    <i class="fas fa-layer-group" style="color:var(--cor-fila);"></i> OPs AGRUPADAS POR REFERÊNCIA
                </h2>
                <button onclick="fecharModais()" class="modal-fechar-btn"><i class="fas fa-times"></i></button>
            </div>
            <div style="font-size:11px; color:var(--texto-secundario); margin-bottom:12px;">
                Só mostra referências com 2 ou mais OPs entre PCP-Programação, Almox. Análise de Medidas e Aguardando Matéria Prima — referência com uma única OP não aparece aqui, e OPs sob medida (SBM) nunca entram, já que cada uma é única.
            </div>
            <div style="overflow-y:auto; flex:1;">
                ${grupos.length === 0 ? `<div class="tabela-vazia">Nenhuma referência repetida entre esses dois setores no momento.</div>` : gruposHtml}
            </div>
            ${grupos.length > 0 ? `<button onclick="copiarAgrupamentoReferencia()" class="btn btn-acao" style="margin-top:12px;"><i class="fas fa-copy"></i> COPIAR LISTA</button>` : ''}
        </div>
    `;
}

function copiarAgrupamentoReferencia() {
    if (!ultimoAgrupamentoReferenciaGerado || !ultimoAgrupamentoReferenciaGerado.length) return;
    const texto = ultimoAgrupamentoReferenciaGerado.map(([ref, ops]) =>
        `${ref} (${ops.length} OPs):\n` + ops.map(op => `  - OP ${op.id} | Ciclo ${op.ciclo} | ${op.etapaRotulo || nomesEtapas[op.etapa]} | ${op.qtd} pçs | MP ${op.codigoMP || '-'} | ${op.diasLocal || 0}d parado`).join('\n')
    ).join('\n\n');
    navigator.clipboard.writeText(texto).then(() => showToast("<i class='fas fa-check'></i> Agrupamento copiado!"));
}

// =========================================================================
// 🖥️ CONSOLE DE DEPURAÇÃO — funções de exibição do painel (a captura de
// logs em si já roda desde o topo do arquivo, antes de tudo mais).
// =========================================================================
function renderizarConsoleDebug() {
    const corpo = $('corpoConsoleDebug');
    if (!corpo) return;
    const cores = { log: '#ddd', warn: '#e2b93b', error: '#ff6b6b' };
    const icones = { log: 'fa-circle-info', warn: 'fa-triangle-exclamation', error: 'fa-circle-xmark' };
    corpo.innerHTML = logsConsoleDebug.length === 0
        ? `<div style="padding:20px; text-align:center; color:#666; font-family:monospace; font-size:11px;">Nenhum registro ainda.</div>`
        : logsConsoleDebug.slice().reverse().map(l => {
            const hora = new Date(l.hora).toLocaleTimeString('pt-BR');
            const cor = cores[l.nivel] || cores.log;
            const msgSegura = String(l.mensagem).replace(/</g, '&lt;').replace(/>/g, '&gt;');
            return `<div style="padding:5px 10px; border-bottom:1px solid #2a2a2a; font-family:'Courier New', monospace; font-size:11px; color:${cor}; display:flex; gap:8px; align-items:flex-start;">
                <span style="opacity:0.55; white-space:nowrap;">${hora}</span>
                <i class="fas ${icones[l.nivel] || icones.log}" style="margin-top:2px; flex-shrink:0;"></i>
                <span style="word-break:break-word; white-space:pre-wrap;">${msgSegura}</span>
            </div>`;
        }).join('');
}

function atualizarBadgeConsoleDebug() {
    const badge = $('badgeConsoleDebug');
    if (!badge) return;
    const qtdErros = logsConsoleDebug.filter(l => l.nivel === 'error').length;
    if (qtdErros > 0) { badge.style.display = 'flex'; badge.innerText = qtdErros > 99 ? '99+' : qtdErros; }
    else badge.style.display = 'none';
}

function toggleConsoleDebug() {
    const painel = $('painelConsoleDebug');
    if (!painel) return;
    const aberto = painel.classList.toggle('aberto');
    if (aberto) renderizarConsoleDebug();
}

function limparLogsConsoleDebug() {
    if (!confirm('Limpar todo o histórico do console de depuração?')) return;
    logsConsoleDebug = [];
    try { localStorage.setItem('logsConsoleDebug', '[]'); } catch (e) { /* ignora */ }
    renderizarConsoleDebug();
    atualizarBadgeConsoleDebug();
}

function copiarLogsConsoleDebug() {
    if (!logsConsoleDebug.length) { showToast("<i class='fas fa-info-circle'></i> Nenhum log registrado ainda."); return; }
    const texto = logsConsoleDebug.map(l => `[${new Date(l.hora).toLocaleString('pt-BR')}] ${l.nivel.toUpperCase()}: ${l.mensagem}`).join('\n');
    navigator.clipboard.writeText(texto).then(() => showToast("<i class='fas fa-check'></i> Log copiado! Já pode colar e me mandar."));
}

// PROGRAMAÇÃO / LOTE
function calcularSomaLoteImediato() {
    let p = 0, t = 0, c = 0;
    // Se alguma OP selecionada não existir mais (ex: sumiu numa sincronização
    // nova), tira ela da seleção em vez de contar errado ou travar
    for (const id of [...selecaoLoteOPs]) {
        const op = bancoDadosOPs.find(o => o.id === id);
        if (!op) { selecaoLoteOPs.delete(id); continue; }
        p += parseInt(op.qtd) || 0; t += parseFloat(op.tempoCorte) || 0; c++;
    }
    // realça as linhas visíveis que fazem parte da seleção (o resto da
    // seleção pode estar fora do filtro atual, sem linha renderizada agora)
    $$('.check-lote').forEach(x => {
        if (selecaoLoteOPs.has(x.dataset.id)) x.closest('tr').classList.add('linha-marcada');
        else x.closest('tr').classList.remove('linha-marcada');
    });
    $('somaOpsTxt').innerText = c + " OPs";
    $('somaPecasTxt').innerText = p + " pçs";
    $('somaTempoTxt').innerText = t.toFixed(1) + " min";
    let m = ultimaSugestao === 'tempo' ? parseFloat($('metaTempo').value) || 1 : parseInt($('metaLote').value) || 1, pc = Math.min(((ultimaSugestao === 'tempo' ? t : p) / m) * 100, 100);
    $('barraProgresso').style.width = pc + '%';
    $('textoProgresso').innerText = Math.round(pc) + '%';
}

function limparSelecaoLote() {
    selecaoLoteOPs.clear();
    $$('.check-lote').forEach(x => x.checked = false);
    calcularSomaLoteImediato();
}
const calcularSomaLote = debounce(calcularSomaLoteImediato, 150);
function autoSelecionarPorMeta(tp) {
    ultimaSugestao = tp;
    const m = parseFloat(tp === 'tempo' ? $('metaTempo').value : $('metaLote').value) || 0;
    $$('.check-lote').forEach(x => x.checked = false);
    selecaoLoteOPs.clear();

    // Agrupa em blocos contíguos da mesma matéria-prima, preservando a ordem da fila
    // (prioridade > urgência > matéria-prima > data). Isso evita que a sugestão misture
    // matérias-primas diferentes num mesmo lote só porque uma OP menor cabe na meta —
    // ela tenta fechar o bloco da matéria-prima atual antes de avançar pra próxima.
    const blocos = [];
    for (let cb of $$('#listaDespacho .check-lote')) {
        const mp = cb.dataset.mp || 'SEM-MP';
        const ultimo = blocos[blocos.length - 1];
        if (ultimo && ultimo.mp === mp) ultimo.itens.push(cb);
        else blocos.push({ mp, itens: [cb] });
    }

    let s = 0;
    for (const bloco of blocos) {
        if (s >= m) break;
        for (const cb of bloco.itens) {
            const v = tp === 'tempo' ? parseFloat(cb.dataset.tempo) || 0 : parseInt(cb.dataset.qtd) || 0;
            if (s + v <= m) { s += v; cb.checked = true; selecaoLoteOPs.add(cb.dataset.id); }
        }
    }
    calcularSomaLoteImediato();
}
function sugerirPorDias() { const d = parseFloat($('qtdDiasProg').value) || 0, m = parseFloat($('mediaDiaProg').value) || 0; if (d > 0 && m > 0) { $('metaLote').value = d * m; autoSelecionarPorMeta('pecas'); showToast(`Meta: ${d * m} pçs`); } }
function handleShiftClick(e) {
    const id = this.dataset.id;
    if (lastChecked && e.shiftKey) {
        const c = Array.from($$('.check-lote')), s = c.indexOf(this), ex = c.indexOf(lastChecked);
        c.slice(Math.min(s, ex), Math.max(s, ex) + 1).forEach(x => {
            x.checked = lastChecked.checked;
            if (x.checked) selecaoLoteOPs.add(x.dataset.id); else selecaoLoteOPs.delete(x.dataset.id);
        });
    } else {
        if (this.checked) selecaoLoteOPs.add(id); else selecaoLoteOPs.delete(id);
    }
    lastChecked = this;
    calcularSomaLoteImediato();
}

function copiarListaOps() { const s = [...selecaoLoteOPs]; if (s.length > 0) navigator.clipboard.writeText(s.join('\n')).then(() => alert(s.length + " OPs copiadas!")); }
function exportarRelatorioMontador() {
    const ids = [...selecaoLoteOPs];
    
    if (ids.length === 0) {
        return showToast("<i class='fas fa-exclamation-triangle'></i> Selecione ao menos uma OP!", true);
    }
    
    try {
        const s = ids.map(id => {
            let op = bancoDadosOPs.find(o => o.id === id);
            return op ? { 
                "CICLO": op.ciclo, 
                "OP": op.id, 
                "DESCRIÇÃO PEÇA": op.desc,
                "PEÇAS": op.qtd,
                "LOCAL DESTINO": op.localDestino, 
                "DUB?": op.temDublado ? 'SIM' : 'NÃO', 
                "TEMPO (MIN)": op.tempoCorte, 
                "MATÉRIA-PRIMA": (op.codigoMP && op.codigoMP !== "SEM CÓDIGO") ? op.codigoMP : "MISTO", 
                "DESCRIÇÃO MP": op.descMP || ""
            } : null;
        }).filter(x => x !== null);
        
        // =================================================================
        // 🎯 A CORREÇÃO DO "INVALID WORKBOOK" ESTÁ AQUI:
        // Em vez de esmagar tudo numa linha, fazemos em 4 passos limpos!
        // =================================================================
        const worksheet = XLSX.utils.json_to_sheet(s); // Passo 1: Cria os dados
        const workbook = XLSX.utils.book_new();        // Passo 2: Cria o arquivo em branco
        XLSX.utils.book_append_sheet(workbook, worksheet, "Lote"); // Passo 3: Junta os dois
        XLSX.writeFile(workbook, "Lote_Producao.xlsx"); // Passo 4: Salva no PC
        // =================================================================
        
        // Histórico
        if (typeof historicoLotes !== 'undefined') {
            historicoLotes.unshift({ 
                data: new Date().toLocaleString('pt-BR'), 
                qtdOps: s.length, 
                totalPecas: s.reduce((a, c) => a + parseInt(c["PEÇAS"]), 0) 
            });
            if (historicoLotes.length > 5) historicoLotes.pop();
            localStorage.setItem('historicoLotes', JSON.stringify(historicoLotes));
        }
        
        if (typeof renderizarHistorico === 'function') renderizarHistorico();
        
        showToast("<i class='fas fa-file-excel'></i> Relatório gerado com sucesso!");

    } catch (erro) {
        console.error("ERRO NO RELATÓRIO:", erro);
        alert("Ainda deu erro! Verifique o console novamente.");
    }
}
function renderizarHistorico() { if ($('listaHistorico')) $('listaHistorico').innerHTML = historicoLotes.map(h => `<tr><td>${h.data}</td><td>${h.totalPecas} pçs</td><td>${h.qtdOps} OPs</td></tr>`).join(''); }
function limparHistorico(e) { e.stopPropagation(); if (confirm("Limpar histórico?")) { historicoLotes = []; localStorage.removeItem('historicoLotes'); renderizarHistorico(); } }


// SIDEBAR E MODO TV
// Antes enchia a sidebar do Radar (removida — usuário achou redundante com
// a aba Prioridades, que já filtra por setor/mês destino em formato de
// tabela). Ficou só atualizando o número no topo, que agora leva direto
// pra aba Prioridades quando clicado.
function renderizarSidebarPrioridades() {
    const u = bancoDadosOPs.filter(o => o.prioridade);
    if ($('badge-prioridades')) {
        if (u.length > 0) { $('badge-prioridades').style.display = 'flex'; $('badge-prioridades').innerText = u.length; }
        else $('badge-prioridades').style.display = 'none';
    }
}

let scInt = null;
function ativarModoTV() { document.body.classList.add('modo-tv'); if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => { }); abrirAba(null, 'aba-fila'); initScrollV('#aba-fila .secao-corpo'); }
function initScrollV(sel) { const e = document.querySelector(sel); if (!e) return; e.scrollTop = 0; let d = 1; scInt = setInterval(() => { if (e.scrollHeight <= e.clientHeight) return; e.scrollTop += d; if (e.scrollTop >= (e.scrollHeight - e.clientHeight - 1)) d = -1; if (e.scrollTop <= 0) d = 1; }, 40); }
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && document.body.classList.contains('modo-tv')) { document.body.classList.remove('modo-tv'); clearInterval(scInt); abrirAba(null, 'aba-programacao'); } });

// SISTEMA (TEMA, BACKUP, START)

// =========================================================================
// 📌 COLUNAS FIXAS — nas tabelas largas (Programação, Máquinas de Enfesto e
// Sequência) as primeiras colunas (marcar / OP) ficam coladas à esquerda
// quando se rola pro lado. O cabeçalho já era fixo em cima. Só liga em tela
// larga (>= 1100px); em tela estreita a tabela rola normal. As posições
// (left) são medidas pela largura real de cada coluna e refeitas sempre que
// a tabela é redesenhada.
// =========================================================================
const CONFIG_COLUNAS_FIXAS = [
    { tbody: 'listaDespacho', fixas: 5 },       // MOV, SEL, ORDEM, CICLO, OP
    { tbody: 'listaMaquinaEnfesto', fixas: 4 }, // marcar, ORDEM, CICLO, OP
    { tbody: 'seqCostListaOPs', fixas: 2 },     // marcar, OP
];
function ajustarColunasFixas() {
    const larga = window.innerWidth >= 1100;
    CONFIG_COLUNAS_FIXAS.forEach(cfg => {
        const tbody = $(cfg.tbody); if (!tbody) return;
        const tabela = tbody.closest('table'); if (!tabela) return;
        tabela.classList.toggle('tabela-fixa-colunas', larga);
        const ths = [...tabela.querySelectorAll('thead th')].slice(0, cfg.fixas);
        const limpar = el => { el.classList.remove('col-fixa', 'col-fixa-ultima'); el.style.removeProperty('--esq'); };
        if (!larga || tabela.offsetParent === null || ths.length < cfg.fixas) {   // tela estreita ou tabela escondida (largura 0): desliga
            tabela.querySelectorAll('.col-fixa').forEach(limpar); return;
        }
        const esq = []; let acc = 0;
        ths.forEach(th => { esq.push(acc); acc += th.getBoundingClientRect().width; });
        const marcar = (el, i) => { el.classList.add('col-fixa'); el.classList.toggle('col-fixa-ultima', i === cfg.fixas - 1); el.style.setProperty('--esq', esq[i] + 'px'); };
        ths.forEach(marcar);
        tbody.querySelectorAll('tr').forEach(tr => {
            if (tr.children.length < cfg.fixas || tr.querySelector('td[colspan]')) return;   // barra de lote / separador não entra
            for (let i = 0; i < cfg.fixas; i++) marcar(tr.children[i], i);
        });
    });
}
function iniciarColunasFixas() {
    let agendado = false;
    const agendar = () => { if (agendado) return; agendado = true; requestAnimationFrame(() => { agendado = false; try { ajustarColunasFixas(); } catch (e) { console.error('colunas fixas:', e); } }); };
    CONFIG_COLUNAS_FIXAS.forEach(cfg => { const tb = $(cfg.tbody); if (tb) new MutationObserver(agendar).observe(tb, { childList: true }); });
    window.addEventListener('resize', agendar);
    document.addEventListener('click', () => setTimeout(agendar, 30));   // trocar de aba/sub-aba mostra a tabela (antes escondida)
    agendar();
}

function toggleDensidadeTabelas() { document.body.classList.toggle('tabelas-densas'); try { localStorage.setItem('tabelasDensas', document.body.classList.contains('tabelas-densas') ? '1' : '0'); } catch (e) {} setTimeout(ajustarColunasFixas, 50); }
function toggleTema() { document.body.classList.toggle('dark-mode'); localStorage.setItem('temaEscuro', document.body.classList.contains('dark-mode')); try { renderizarEficienciaCostura(); } catch (e) {} }
function exportarBackup() { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(localStorage)], { type: "application/json" })); a.download = `Backup_${new Date().getDate()}.json`; a.click(); }

// Imprime só a lista de "PROGRAMAR LOTE" (tabela filtrada de OPs na
// Programação), do jeito que ela aparece na tela — a folha de estilo de
// impressão (@media print no CSS) isola só essa seção, tira o resto da
// página, e não corta tabela grande.
// Antes chamava window.print() direto, contando com uma regra de CSS fixa
// que deixava #secaoProgramarLote sempre visível na impressão, não importa
// a aba. Isso conflitava com QUALQUER outra seção usando o mecanismo
// genérico (imprimirSecao) ao mesmo tempo — as duas apareciam juntas,
// causando um bloco vazio estranho (bug real relatado pelo usuário na
// impressão da Sequência). Unificado: agora usa o mesmo mecanismo.
function imprimirTela() { imprimirSecao('secaoProgramarLote'); }

// Imprime só UMA seção da tela, isolando ela do resto — genérico, dá pra
// usar em qualquer aba futura, só passando o id do elemento (não precisa
// de uma função nova nem de CSS novo pra cada caso).
// Qual seção clonar pra área de impressão — setado por imprimirSecao(id) e
// lido dentro do 'beforeprint' (não antes: precisa rodar DEPOIS da lógica
// de esconder linha-por-linha do Programar Lote logo abaixo, senão o
// clone sai com a seleção errada).
let idSecaoParaImprimir = null;
function imprimirSecao(idElemento) {
    idSecaoParaImprimir = idElemento;
    window.print();
}

// Na hora de imprimir, esconde as OPs que NÃO estão marcadas (só imprime o
// que foi selecionado) — e some também com a barra "LOTE MATÉRIA-PRIMA" de
// um bloco inteiro se nenhuma OP dele estiver marcada. Se nada estiver
// marcado, imprime tudo (senão a folha sairia em branco, o que quase certamente
// não é a intenção). Depois de imprimir, desfaz tudo pra tela voltar ao normal.
window.addEventListener('beforeprint', () => {
    const linhas = $$('#secaoProgramarLote .tabela-dados tbody tr');
    const temSelecao = [...linhas].some(tr => tr.querySelector('.check-lote:checked'));

    let divisorAtual = null, temMarcadaNoBloco = false;
    linhas.forEach(tr => {
        if (tr.classList.contains('linha-lote-mp')) {
            if (divisorAtual) divisorAtual.classList.toggle('imprimir-esconder', temSelecao && !temMarcadaNoBloco);
            divisorAtual = tr; temMarcadaNoBloco = false;
            return;
        }
        const checkbox = tr.querySelector('.check-lote');
        if (checkbox) {
            if (checkbox.checked) temMarcadaNoBloco = true;
            tr.classList.toggle('imprimir-esconder', temSelecao && !checkbox.checked);
        }
    });
    if (divisorAtual) divisorAtual.classList.toggle('imprimir-esconder', temSelecao && !temMarcadaNoBloco);

    // Mesma ideia do Programar Lote, agora pra Sequência da Produção: se
    // alguma OP estiver marcada, só ela(s) saem na impressão; se nenhuma
    // estiver marcada, imprime a fila inteira (não faz sentido uma folha
    // em branco só porque ninguém marcou nada).
    const linhasSeq = $$('#secaoImprimirSeqCostura .tabela-dados tbody tr');
    const temSelecaoSeq = [...linhasSeq].some(tr => tr.querySelector('.check-imprimir-seq:checked'));
    linhasSeq.forEach(tr => {
        const checkbox = tr.querySelector('.check-imprimir-seq');
        if (checkbox) tr.classList.toggle('imprimir-esconder', temSelecaoSeq && !checkbox.checked);
    });

    // Clona a seção pedida (já com a filtragem de linhas acima aplicada,
    // já que isso roda primeiro nesse mesmo evento) pra dentro da área
    // dedicada de impressão — ver comentário longo no style.css sobre por
    // que isso é mais robusto que o esquema antigo de visibility+position.
    if (idSecaoParaImprimir) {
        const el = document.getElementById(idSecaoParaImprimir);
        const area = document.getElementById('areaImpressaoGenerica');
        if (el && area) {
            area.innerHTML = el.outerHTML;
            document.body.classList.add('modo-impressao-generica');
        }
    }
});

window.addEventListener('afterprint', () => {
    $$('.imprimir-esconder').forEach(el => el.classList.remove('imprimir-esconder'));
    // Cobre tanto imprimir de verdade quanto cancelar a caixa de diálogo —
    // os dois disparam esse evento.
    const area = document.getElementById('areaImpressaoGenerica');
    if (area) area.innerHTML = '';
    document.body.classList.remove('modo-impressao-generica');
    idSecaoParaImprimir = null;
});

function importarBackup(e) {
    if (!exigirAdmin('restaurar um backup')) { if (e && e.target) e.target.value = ''; return; }
    const input = e.target; if (!input.files[0] || !confirm("Substituir dados pelo backup?")) { if (input) input.value = ''; return; }
    const r = new FileReader();
    r.onload = function (ev) {
        try {
            const d = JSON.parse(ev.target.result);

            // Guarda uma cópia do que já está salvo, pra poder devolver se a
            // restauração falhar no meio do caminho — evita perder os dados
            // atuais numa tentativa de backup que dá erro (por falta de
            // espaço, por exemplo), que era exatamente o risco antes daqui.
            const copiaAtual = {};
            for (let k in localStorage) { if (localStorage.hasOwnProperty(k)) copiaAtual[k] = localStorage.getItem(k); }

            try {
                localStorage.clear();
                for (let k in d) localStorage.setItem(k, d[k]);
            } catch (errEscrita) {
                localStorage.clear();
                for (let k in copiaAtual) localStorage.setItem(k, copiaAtual[k]);
                throw errEscrita;
            }

            alert("Restaurado.");
            location.reload();
        } catch (err) {
            console.error('Erro ao importar backup:', err);
            const ehQuota = err.name === 'QuotaExceededError' || /quota/i.test(err.message);
            if (ehQuota) {
                alert("❌ Não deu pra restaurar o backup: o navegador desse aparelho não reserva espaço suficiente pra guardar todos esses dados (é comum em celular — o limite de armazenamento local costuma ser bem menor que no computador).\n\nOs dados que já estavam salvos aqui foram mantidos, nada foi perdido.\n\nDetalhe técnico: " + err.message);
            } else {
                alert("❌ Erro ao importar backup: o arquivo não é um backup válido (JSON corrompido ou de outro sistema).\n\nDetalhe técnico: " + err.message);
            }
        }
    };
    r.readAsText(input.files[0]);
    if (input) input.value = '';
}

const ABAS_DENTRO_DO_MENU_MAIS = ['aba-fila', 'aba-pedidos', 'aba-filacorte', 'aba-capacidade', 'aba-sequenciamento', 'aba-necessidade'];
function abrirAba(ev, id) {
    if (!abaLiberadaAgora(id)) { id = 'aba-prioridades'; ev = null; }
    $$('.aba-conteudo').forEach(a => a.classList.remove('ativa'));
    $$('.tab-btn').forEach(b => b.classList.remove('ativo'));
    $(id).classList.add('ativa');
    if (ev) ev.currentTarget.classList.add('ativo');
    else $('abrirAba-' + id)?.classList.add('ativo');
    // A aba pode estar escondida dentro do menu "MAIS" — nesse caso, quem
    // fica destacado na barra é o próprio botão "MAIS", senão não sobra
    // nenhuma indicação visual de qual aba está aberta.
    if (ABAS_DENTRO_DO_MENU_MAIS.includes(id) && $('btnMenuMaisAbas')) $('btnMenuMaisAbas').classList.add('ativo');
    $$('.dropdown-menu.aberto').forEach(m => m.classList.remove('aberto'));
}
// Abre/fecha um dropdown de filtro (multi-select), calculando a posição na
// tela na hora de abrir — usado por TODOS os filtros desse tipo no sistema
// (Etapa, Local, Data de Corte, Mês Destino, Local/Tipo de Produção, Setor e
// Mês de Prioridades). Precisa disso porque o dropdown é position:fixed (ver
// comentário no CSS — o container pai corta ele se for position:absolute).
function abrirFecharMultiSelect(idGatilho, idLista, event) {
    if (event) event.stopPropagation(); // abrir o filtro nunca deve contar como "clique fora" pro handler global
    const lista = $(idLista);
    if (!lista) return;
    // Move o dropdown pra ser filho direto do <body>, na primeira vez que
    // abre — assim ele escapa de qualquer propriedade CSS de um ancestral
    // que atrapalhe position:fixed (overflow:hidden, transform, filter,
    // backdrop-filter...). Só move uma vez (marca com data-attribute),
    // continua funcionando pelo mesmo id depois disso.
    if (!lista.dataset.movidoParaBody) {
        document.body.appendChild(lista);
        lista.dataset.movidoParaBody = '1';
    }
    const jaAberta = lista.style.display === 'block';
    $$('.multi-select-options').forEach(o => { o.style.display = 'none'; });
    if (jaAberta) return;
    const gatilho = $(idGatilho);
    if (gatilho) {
        const rect = gatilho.getBoundingClientRect();
        lista.style.left = Math.round(rect.left) + 'px';
        lista.style.top = Math.round(rect.bottom + 5) + 'px';
        lista.style.minWidth = Math.round(rect.width) + 'px';
    }
    lista.style.display = 'block';
}

function toggleMultiSelect(event) { abrirFecharMultiSelect('toggleMultiSelect', 'listaFiltroLocal', event); }

function inicializarFiltros() {
    locaisSelecionados = [...new Set(bancoDadosOPs.map(o => o.localDestino))].sort();
    if ($('listaFiltroLocal')) $('listaFiltroLocal').innerHTML = `<label style="font-weight:bold;"><input type="checkbox" id="chkLoc" checked onchange="$$('.chk-loc').forEach(c=>c.checked=$('chkLoc').checked); locaisSelecionados=Array.from($$('.chk-loc')).filter(c=>c.checked).map(c=>c.value); renderizarTudoImediato();"> TUDO</label>` + locaisSelecionados.map(l => `<label><input type="checkbox" class="chk-loc" value="${l}" checked onchange="locaisSelecionados=Array.from($$('.chk-loc')).filter(c=>c.checked).map(c=>c.value); renderizarTudoImediato();"> ${l}</label>`).join('');
}

// Filtro de "Data de Corte" no estilo Excel: lista as datas que REALMENTE
// aparecem nas OPs (não um intervalo digitado), com "Selecionar tudo" no
// topo. Guarda por EXCLUSÃO (igual os filtros da Fila de Corte) — assim uma
// data nova de uma sincronização futura entra marcada por padrão, em vez de
// sumir da tela sem explicação.
const CHAVE_SEM_DATA_CORTE = '__SEM_DATA__';
let datasCorteExcluidas = new Set();

function renderizarFiltroDataCorte() {
    const el = $('listaFiltroDataCorte');
    if (!el) return;

    const mapaDatas = new Map(); // 'dd/mm/aaaa' -> Date, só pra ordenar certo
    let temSemData = false;
    bancoDadosOPs.forEach(op => {
        if (!op.dataCorte) { temSemData = true; return; }
        const d = new Date(op.dataCorte);
        if (isNaN(d.getTime())) { temSemData = true; return; }
        const chave = formatarDataBR(op.dataCorte);
        if (chave && !mapaDatas.has(chave)) mapaDatas.set(chave, d);
    });
    const datas = [...mapaDatas.entries()].sort((a, b) => a[1] - b[1]).map(([chave]) => chave);
    if (temSemData) datas.push(CHAVE_SEM_DATA_CORTE);

    if (datas.length === 0) {
        el.innerHTML = '<label style="color:var(--texto-secundario); padding:8px 12px; display:block;">Nenhuma data disponível — sincronize primeiro.</label>';
        atualizarTextoFiltroDataCorte(0, 0);
        return;
    }

    const marcadas = datas.filter(d => !datasCorteExcluidas.has(d)).length;
    const todasMarcadas = marcadas === datas.length;

    let html = `<label style="font-weight:700; border-bottom:1px solid var(--borda-cor);">
        <input type="checkbox" id="chkTodasDatasCorte" ${todasMarcadas ? 'checked' : ''}> Selecionar tudo</label>`;
    html += datas.map(d => {
        const rotulo = d === CHAVE_SEM_DATA_CORTE ? '(sem data)' : d;
        return `<label><input type="checkbox" class="chk-data-corte" value="${d}" ${datasCorteExcluidas.has(d) ? '' : 'checked'}> ${rotulo}</label>`;
    }).join('');
    el.innerHTML = html;

    atualizarTextoFiltroDataCorte(marcadas, datas.length);
}

function atualizarTextoFiltroDataCorte(marcadas, total) {
    if (!$('textoFiltroDataCorte')) return;
    if (total === 0 || marcadas === total) $('textoFiltroDataCorte').innerText = 'Todas';
    else if (marcadas === 0) $('textoFiltroDataCorte').innerText = 'Nenhuma';
    else $('textoFiltroDataCorte').innerText = `${marcadas} de ${total}`;
}

// Uma OP passa no filtro de data se a data dela (ou "sem data") não estiver
// entre as excluídas.
function passaFiltroDataCorte(op) {
    if (!op.dataCorte) return !datasCorteExcluidas.has(CHAVE_SEM_DATA_CORTE);
    const d = new Date(op.dataCorte);
    if (isNaN(d.getTime())) return !datasCorteExcluidas.has(CHAVE_SEM_DATA_CORTE);
    return !datasCorteExcluidas.has(formatarDataBR(op.dataCorte));
}

// Filtro de "Mês Destino" — o mês que o usuário informou na importação de
// Destino (não tem coluna de data que sirva pra isso na planilha, então é
// informado na hora de importar). Mesmo padrão do filtro de Data de Corte.
const CHAVE_SEM_MES_DESTINO = '__SEM_MES__';
let mesesDestinoExcluidos = new Set();

function renderizarFiltroMesDestino() {
    const el = $('listaFiltroMesDestino');
    if (!el) return;

    const meses = new Set();
    let temSemMes = false;
    bancoDadosOPs.forEach(op => { if (op.mesDestino) meses.add(op.mesDestino); else temSemMes = true; });
    const listaMeses = [...meses].sort();
    if (temSemMes) listaMeses.push(CHAVE_SEM_MES_DESTINO);

    if (listaMeses.length === 0) {
        el.innerHTML = '<label style="color:var(--texto-secundario); padding:8px 12px; display:block;">Nenhum mês disponível — importe o Destino primeiro.</label>';
        atualizarTextoFiltroMesDestino(0, 0);
        return;
    }

    const marcadas = listaMeses.filter(m => !mesesDestinoExcluidos.has(m)).length;
    const todasMarcadas = marcadas === listaMeses.length;

    let html = `<label style="font-weight:700; border-bottom:1px solid var(--borda-cor);">
        <input type="checkbox" id="chkTodosMesesDestino" ${todasMarcadas ? 'checked' : ''}> Selecionar tudo</label>`;
    html += listaMeses.map(m => {
        const rotulo = m === CHAVE_SEM_MES_DESTINO ? '(sem mês)' : m;
        return `<label><input type="checkbox" class="chk-mes-destino" value="${m}" ${mesesDestinoExcluidos.has(m) ? '' : 'checked'}> ${rotulo}</label>`;
    }).join('');
    el.innerHTML = html;

    atualizarTextoFiltroMesDestino(marcadas, listaMeses.length);
}

function atualizarTextoFiltroMesDestino(marcadas, total) {
    if (!$('textoFiltroMesDestino')) return;
    if (total === 0 || marcadas === total) $('textoFiltroMesDestino').innerText = 'Todos';
    else if (marcadas === 0) $('textoFiltroMesDestino').innerText = 'Nenhum';
    else $('textoFiltroMesDestino').innerText = `${marcadas} de ${total}`;
}

function passaFiltroMesDestino(op) {
    if (!op.mesDestino) return !mesesDestinoExcluidos.has(CHAVE_SEM_MES_DESTINO);
    return !mesesDestinoExcluidos.has(op.mesDestino);
}

// Filtro de "Produto" (camisa, calça, jaqueta, parka, blusa...) — vem da
// coluna de produto da planilha de sincronização, e só existe LOCAL (não vai
// pra nuvem; a Programação é só do admin). Mesmo padrão do Mês Destino:
// guarda o que foi EXCLUÍDO, então um produto novo que apareça numa próxima
// sincronização já entra marcado. A lista é montada do que existe de
// verdade nas OPs, não é fixa. "CALÇA" e "CALCA" contam como o mesmo produto.
const CHAVE_SEM_PRODUTO = '__SEM_PRODUTO__';
let produtosExcluidos = new Set();

function chaveProdutoOP(op) {
    const p = String(op.produto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();
    return p || CHAVE_SEM_PRODUTO;
}

function renderizarFiltroProduto() {
    const el = $('listaFiltroProduto');
    if (!el) return;
    const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    const rotulos = new Map(), contagem = new Map();
    bancoDadosOPs.forEach(op => {
        const k = chaveProdutoOP(op);
        contagem.set(k, (contagem.get(k) || 0) + 1);
        if (k !== CHAVE_SEM_PRODUTO && !rotulos.has(k)) rotulos.set(k, String(op.produto).trim().toUpperCase());
    });

    if (!rotulos.size) {
        // Nenhuma OP tem produto (planilha sem a coluna). Zera as exclusões
        // de antes, senão dava pra ficar com tudo escondido sem ter como
        // desmarcar (a lista de opções some).
        produtosExcluidos.clear();
        el.innerHTML = '<label style="color:var(--texto-secundario); padding:8px 12px; display:block;">Nenhum produto disponível — sincronize uma planilha que tenha a coluna de produto.</label>';
        atualizarTextoFiltroProduto(0, 0);
        return;
    }

    const chaves = [...rotulos.keys()].sort((a, b) => rotulos.get(a).localeCompare(rotulos.get(b), 'pt-BR'));
    if (contagem.has(CHAVE_SEM_PRODUTO)) chaves.push(CHAVE_SEM_PRODUTO);

    const marcadas = chaves.filter(k => !produtosExcluidos.has(k)).length;
    let html = `<label style="font-weight:700; border-bottom:1px solid var(--borda-cor);">
        <input type="checkbox" id="chkTodosProdutos" ${marcadas === chaves.length ? 'checked' : ''}> Selecionar tudo</label>`;
    html += chaves.map(k => {
        const rotulo = k === CHAVE_SEM_PRODUTO ? '(sem produto)' : rotulos.get(k);
        return `<label><input type="checkbox" class="chk-produto" value="${esc(k)}" ${produtosExcluidos.has(k) ? '' : 'checked'}> ${esc(rotulo)} <span style="color:var(--texto-secundario);">(${contagem.get(k)})</span></label>`;
    }).join('');
    el.innerHTML = html;
    atualizarTextoFiltroProduto(marcadas, chaves.length);
}

function atualizarTextoFiltroProduto(marcadas, total) {
    if (!$('textoFiltroProduto')) return;
    if (total === 0 || marcadas === total) $('textoFiltroProduto').innerText = 'Todos';
    else if (marcadas === 0) $('textoFiltroProduto').innerText = 'Nenhum';
    else $('textoFiltroProduto').innerText = `${marcadas} de ${total}`;
}

function passaFiltroProduto(op) {
    return !produtosExcluidos.has(chaveProdutoOP(op));
}

function inicializarFiltroEtapa() {
    if (!$('listaFiltroEtapa')) return;
    // Mantém o comportamento de sempre por padrão (só PROGRAMAÇÃO marcada),
    // a menos que o usuário já tenha escolhido outra coisa nessa sessão.
    if (etapasSelecionadas.length === 0) etapasSelecionadas = [0];
    $('listaFiltroEtapa').innerHTML = nomesEtapas.map((n, i) =>
        `<label><input type="checkbox" class="chk-etapa" value="${i}" ${etapasSelecionadas.includes(i) ? 'checked' : ''} onchange="etapasSelecionadas=Array.from($$('.chk-etapa')).filter(c=>c.checked).map(c=>parseInt(c.value)); atualizarTextoFiltroEtapa(); renderizarTudoImediato();"> ${n}</label>`
    ).join('');
    atualizarTextoFiltroEtapa();
}

// Mostra um resumo do que está selecionado no gatilho do multi-select (nome
// da etapa se for só uma, ou "N etapas" se for mais de uma)
function atualizarTextoFiltroEtapa() {
    if (!$('textoFiltroEtapa')) return;
    if (etapasSelecionadas.length === 0) $('textoFiltroEtapa').innerText = 'Nenhuma etapa';
    else if (etapasSelecionadas.length === 1) $('textoFiltroEtapa').innerText = nomesEtapas[etapasSelecionadas[0]];
    else $('textoFiltroEtapa').innerText = `${etapasSelecionadas.length} etapas`;
}

function toggleMultiSelectEtapa(event) { abrirFecharMultiSelect('toggleMultiSelectEtapa', 'listaFiltroEtapa', event); }
function alternarOrdenacaoCorte() { ordemCorteAsc = !ordemCorteAsc; renderizarTudoImediato(); }
function zerarTudo() { if (!exigirAdmin('limpar os dados')) return; if (confirm("⚠️ Isso vai apagar TODOS os dados salvos neste navegador (OPs, histórico, filtros) e não pode ser desfeito.\n\nTem certeza que deseja continuar?")) { localStorage.clear(); location.reload(); } }

// =========================================================
// 🔌 WIRING DE EVENTOS (substitui os antigos onclick/onchange inline do HTML)
// =========================================================
// Conecta um evento com segurança — se o elemento não existir por qualquer
// motivo (ex: navegador que renderiza algo de forma diferente), avisa no
// console de depuração em vez de travar a conexão de TODOS os botões que
// viriam depois dele no código.
function wireEvento(id, evento, handler) {
    const el = document.getElementById(id);
    if (el) el.addEventListener(evento, handler);
    else console.warn(`Wiring: elemento #${id} não encontrado — esse botão/campo não vai funcionar.`);
}

function inicializarEventosUI() {
        wireEvento('toggleSidebarPrioridades-2', 'click', () => { abrirAba(null, 'aba-prioridades'); });
        wireEvento('abrirPrioridadeClientes', 'click', () => { abrirModalPrioridadeClientes(); });
        wireEvento('inputGrades', 'change', () => { processarGrades(); });
        wireEvento('inputPedidos', 'change', () => { processarPedidos(); });
        wireEvento('inputDestino', 'change', () => { processarDestino(); });
        wireEvento('gerarSugestaoPedidos', 'click', () => { gerarSugestaoSequenciaPedidos(); });
        wireEvento('abrirSequenciamentoFifo', 'click', () => { abrirModalSequenciamentoFifo(); });
        wireEvento('abrirGuiaSequenciamento-montador', 'click', () => { abrirGuiaSequenciamento(); });
        wireEvento('abrirGuiaSequenciamento-pedidos', 'click', () => { abrirGuiaSequenciamento(); });
        wireEvento('abrirGuiaSequenciamento-menu', 'click', () => { abrirGuiaSequenciamento(); });
        wireEvento('abrirAgrupamentoReferencia', 'click', () => { abrirAgrupamentoReferencia(); });
        wireEvento('abrirModalPerguntarIA', 'click', () => { abrirModalPerguntarIA(); });
        wireEvento('abrirModalPrioridadeManual', 'click', () => { abrirModalPrioridadeManual(); });
        wireEvento('alcaConsoleDebug', 'click', () => { toggleConsoleDebug(); });
        wireEvento('btnCopiarConsoleDebug', 'click', () => { copiarLogsConsoleDebug(); });
        wireEvento('btnLimparConsoleDebug', 'click', () => { limparLogsConsoleDebug(); });
        wireEvento('ordenarOPsVinculadas-chegada', 'click', () => { ordenarOPsVinculadasPorData(); });
        wireEvento('ordenarPedidosPendentes-chegada', 'click', () => { ordenarPedidosPendentesPorData(); });
        wireEvento('btnPesquisarPedido', 'click', () => { pesquisarPedido(); });
        wireEvento('inputPesquisaPedido', 'keyup', (e) => { if (e.key === 'Enter') pesquisarPedido(); });
        wireEvento('fracSlider', 'input', () => { atualizarFracao(); });
        wireEvento('fecharModais', 'click', () => { fecharModais(); });
        wireEvento('confirmarFracionamento', 'click', () => { confirmarFracionamento(); });
        wireEvento('omniSearchOverlay', 'click', function(event){ if(event.target === this) fecharModais(); });
        wireEvento('omniInput', 'keyup', () => { pesquisaOmni(); });
        wireEvento('modalDetalheSetorKPI', 'click', function(event){ if(event.target === this) this.style.display='none'; });
        wireEvento('modalOficinasKPI', 'click', function(event){ if(event.target === this) this.style.display='none'; });
        wireEvento('modalGargalo', 'click', function(event){ if(event.target === this) this.style.display='none'; });
        wireEvento('ctxAcao-copiar', 'click', () => { ctxAcao('copiar'); });
        wireEvento('ctxAcao-prioridade', 'click', () => { ctxAcao('prioridade'); });
        wireEvento('ctxAcao-fracionar', 'click', () => { ctxAcao('fracionar'); });
        wireEvento('ctxAcao-avancar', 'click', () => { ctxAcao('avancar'); });
        wireEvento('btnMenuAnalise', 'click', () => { toggleDropdown('menuAnalise'); });
        wireEvento('btnMenuImportar', 'click', () => { toggleDropdown('menuImportar'); });
        wireEvento('btnMenuSistema', 'click', () => { toggleDropdown('menuSistema'); });
        wireEvento('btnMenuMaisAbas', 'click', () => { toggleDropdownFixo('btnMenuMaisAbas', 'menuMaisAbas'); });
        wireEvento('btnMenuMaisOpcoes', 'click', () => { toggleDropdown('menuMaisOpcoes'); });
        wireEvento('analisarGargalo', 'click', () => { analisarGargalo(); });
        wireEvento('verificarEspacoNuvemBtn', 'click', () => { verificarEspacoNuvem(true); });
        wireEvento('ativarModoTV', 'click', () => { ativarModoTV(); });
        wireEvento('toggleTema', 'click', () => { toggleTema(); });
        wireEvento('toggleDensidade', 'click', () => { toggleDensidadeTabelas(); });
        wireEvento('abrirBuscaGlobal', 'click', () => { abrirBuscaGlobal(); });
        wireEvento('abrirGuiaSistema', 'click', () => { abrirGuiaSistema(); });
        wireEvento('btnLoginAdmin', 'click', () => { abrirModalLoginAdmin(); });
        wireEvento('publicarSupabase', 'click', () => { publicarTudoNoSupabase(); });
        wireEvento('baixarBackupNuvem', 'click', () => { baixarBackupNuvem(); });
        wireEvento('restaurarBackupNuvem', 'change', (e) => { restaurarBackupNuvem(e); });
        wireEvento('processarExcel', 'click', () => { processarExcel(); });
        wireEvento('zerarTudo', 'click', () => { zerarTudo(); });
        wireEvento('exportarBackup', 'click', () => { exportarBackup(); });
        wireEvento('imprimirTela', 'click', () => { imprimirTela(); });
        wireEvento('importarBackup', 'change', (event) => { importarBackup(event); });
        wireEvento('abrirAba-aba-programacao', 'click', (event) => { abrirAba(event, 'aba-programacao'); });
        wireEvento('abrirAba-aba-fila', 'click', (event) => { abrirAba(event, 'aba-fila'); });
        wireEvento('cardResumoPedidos', 'click', () => { abrirAba(null, 'aba-pedidos'); });
        wireEvento('cardResumoVinculadas', 'click', () => { abrirAba(null, 'aba-programacao'); });
        wireEvento('cardResumoFilaCorte', 'click', () => { abrirAba(null, 'aba-filacorte'); });
        wireEvento('cardResumoGargalo', 'click', () => { analisarGargalo(); });
        wireEvento('abrirAba-aba-pedidos', 'click', (event) => { abrirAba(event, 'aba-pedidos'); });
        wireEvento('abrirAba-aba-filacorte', 'click', (event) => { abrirAba(event, 'aba-filacorte'); });
        wireEvento('abrirAba-aba-capacidade', 'click', (event) => { abrirAba(event, 'aba-capacidade'); renderizarCapacidade(); });
        wireEvento('abrirAba-aba-sequenciamento', 'click', (event) => { abrirAba(event, 'aba-sequenciamento'); });
        wireEvento('btnSequenciamentoPedido', 'click', () => { pesquisarSequenciamentoPedido(); });
        wireEvento('inputSequenciamentoPedido', 'keyup', (e) => { if (e.key === 'Enter') pesquisarSequenciamentoPedido(); });
        wireEvento('btnSequenciamentoOP', 'click', () => { pesquisarSequenciamentoOP(); });
        wireEvento('inputSequenciamentoOP', 'keyup', (e) => { if (e.key === 'Enter') pesquisarSequenciamentoOP(); });
        ['capMaquinas', 'capHoras', 'capEficiencia'].forEach(id => {
            wireEvento(id, 'input', () => { salvarParametrosCapacidade(); renderizarCapacidade(); });
        });
        wireEvento('capFiltroEtapa', 'change', () => { renderizarCapacidade(); });
        wireEvento('capBusca', 'input', () => { renderizarCapacidade(); });
        wireEvento('capSoSemTempo', 'change', () => { renderizarCapacidade(); });
        wireEvento('capLimparSelecao', 'click', () => { capSelecionadas.clear(); renderizarCapacidade(); });
        wireEvento('inputTemposPorOperacao', 'change', () => { processarTemposPorOperacao(); });
        wireEvento('capListaOPs', 'change', (e) => {
            if (e.target.classList.contains('cap-check')) {
                const id = e.target.dataset.id;
                if (e.target.checked) capSelecionadas.add(id); else capSelecionadas.delete(id);
                renderizarCapacidade();
            }
        });
        wireEvento('capListaOPs', 'input', (e) => {
            if (!e.target.classList.contains('cap-tempo-manual')) return;
            const id = e.target.dataset.id;
            const v = parseFloat(e.target.value);
            if (!isNaN(v) && v > 0) capTemposManuais[id] = v; else delete capTemposManuais[id];
            salvarTemposManuais();
            // só recalcula o resumo — redesenhar a tabela faria o campo perder o foco
            const disponivel = minutosDisponiveisDia();
            let total = 0, qtd = 0, semTempo = 0, pecas = 0;
            bancoDadosOPs.forEach(op => {
                if (!capSelecionadas.has(op.id)) return;
                qtd++; const t = tempoEfetivoOP(op); total += t;
                pecas += parseInt(op.qtd) || 0; if (t <= 0) semTempo++;
            });
            atualizarVereditoCapacidade(total, disponivel, qtd, semTempo, pecas);
        });
        wireEvento('inputFilaCorte', 'change', () => { processarFilaCorte(); });
        wireEvento('baixarImagemFilaCorte', 'click', () => { baixarImagemFilaCorte(); });
        wireEvento('inputMediaCorteManual', 'change', (e) => {
            if (!exigirAdmin('definir a média de corte')) { e.target.value = obterMediaCorteManual() || ''; return; }
            const v = parseFloat(e.target.value);
            if (v > 0) localStorage.setItem('mediaCorteManual', v);
            else localStorage.removeItem('mediaCorteManual');
            renderizarFilaCorte();
            renderizarTudoImediato();
        });
        wireEvento('filtroSetorOPsFilaCorte', 'change', () => { renderizarListaOPsFilaCorte(); });
        wireEvento('buscaOPsFilaCorte', 'input', () => { renderizarListaOPsFilaCorte(); });
        wireEvento('listaFiltroLocalProd', 'change', (e) => {
            if (!e.target.classList.contains('chk-local-prod')) return;
            locaisProducaoExcluidos = Array.from($$('.chk-local-prod')).filter(c => !c.checked).map(c => c.value);
            salvarFiltrosFilaCorte();
            renderizarFilaCorte();
        });
        wireEvento('listaFiltroTipoProd', 'change', (e) => {
            if (!e.target.classList.contains('chk-tipo-prod')) return;
            tiposProdutoExcluidos = Array.from($$('.chk-tipo-prod')).filter(c => !c.checked).map(c => c.value);
            salvarFiltrosFilaCorte();
            renderizarFilaCorte();
        });
        wireEvento('toggleMultiSelectLocalProd', 'click', (event) => { abrirFecharMultiSelect('toggleMultiSelectLocalProd', 'listaFiltroLocalProd', event); });
        wireEvento('listaFiltroLocalProd', 'click', (event) => { event.stopPropagation(); });
        wireEvento('toggleMultiSelectTipoProd', 'click', (event) => { abrirFecharMultiSelect('toggleMultiSelectTipoProd', 'listaFiltroTipoProd', event); });
        wireEvento('listaFiltroTipoProd', 'click', (event) => { event.stopPropagation(); });
        wireEvento('marcarTodosLocalProd', 'click', () => { locaisProducaoExcluidos = []; salvarFiltrosFilaCorte(); renderizarFilaCorte(); });
        wireEvento('marcarTodosTipoProd', 'click', () => { tiposProdutoExcluidos = []; salvarFiltrosFilaCorte(); renderizarFilaCorte(); });
        wireEvento('abrirAba-aba-necessidade', 'click', (event) => { abrirAba(event, 'aba-necessidade'); renderizarNecessidadePorReferencia(); });
        wireEvento('abrirAba-aba-prioridades', 'click', (event) => { abrirAba(event, 'aba-prioridades'); reconstruirFiltrosPrioridades(); renderizarAbaPrioridades(); });
        wireEvento('abrirAba-aba-kpi', 'click', (event) => { abrirAba(event, 'aba-kpi'); renderizarGraficoKPI(); carregarEfCosturaDaNuvem(); });
        wireEvento('abrirAba-aba-seq-costura', 'click', (event) => { abrirAba(event, 'aba-seq-costura'); renderizarSequenciamentoCostura(); renderizarOpsRemovidasSeqCostura(); renderizarOpsOcultasSeqCostura(); carregarOpsRemovidasSeqCosturaDaNuvem(); carregarOrdemManualEnfestoDaNuvem(); });
        wireEvento('abrirAba-aba-urgencias', 'click', (event) => { abrirAba(event, 'aba-urgencias'); renderizarUrgencias(); atualizarInfoNuvemUrgencias(); carregarUrgenciasDaNuvem(); });
        wireEvento('inputImplantacao', 'change', () => { processarImplantacao(); });
        wireEvento('inputPorOPUrgencias', 'change', () => { processarPorOPParaUrgencias(); });
        wireEvento('toggleMultiSelectLocalUrgencias', 'click', (event) => { abrirFecharMultiSelect('toggleMultiSelectLocalUrgencias', 'listaFiltroLocalUrgencias', event); });
        wireEvento('listaFiltroLocalUrgencias', 'click', (event) => { event.stopPropagation(); });
        wireEvento('listaFiltroLocalUrgencias', 'change', (e) => {
            if (e.target.id === 'chkTodosLocaisUrgencias') {
                if (e.target.checked) locaisUrgenciasExcluidos.clear();
                else $$('.chk-local-urgencias').forEach(c => locaisUrgenciasExcluidos.add(c.value));
            } else if (e.target.classList.contains('chk-local-urgencias')) {
                if (e.target.checked) locaisUrgenciasExcluidos.delete(e.target.value);
                else locaisUrgenciasExcluidos.add(e.target.value);
            } else return;
            renderizarUrgencias();
        });
        wireEvento('filtroOPUrgencias', 'input', () => { renderizarUrgencias(); });
        wireEvento('filtroReferenciaUrgencias', 'input', () => { renderizarUrgencias(); });
        wireEvento('filtroSituacaoUrgencias', 'change', () => { renderizarUrgencias(); });
        wireEvento('btnExportarUrgencias', 'click', () => { exportarUrgenciasExcel(); });
        wireEvento('btnNaoEncontradasUrgencias', 'click', () => {
            const sel = $('filtroSituacaoUrgencias');
            sel.value = sel.value === 'nao' ? '' : 'nao';
            renderizarUrgencias();
        });
        wireEvento('inputPorOPCostura', 'change', () => { processarPorOPCostura(); });
        wireEvento('seqCostGrupo', 'change', () => { renderizarSequenciamentoCostura(); });
        wireEvento('btnGerenciarFeriados', 'click', () => { renderizarModalFeriados(); $('modalFeriados').style.display = 'flex'; });
        wireEvento('checkTudoSeqCostura', 'change', (e) => { $$('.check-imprimir-seq').forEach(cb => cb.checked = e.target.checked); });
        wireEvento('btnImprimirSeqCostura', 'click', () => { imprimirSecao('secaoImprimirSeqCostura'); });
        wireEvento('btnOrdemAutomaticaEnfesto', 'click', () => { resetarOrdemAutomaticaEnfesto(); });
        wireEvento('seqCostPessoas', 'input', () => { renderizarSequenciamentoCostura(); });
        wireEvento('seqCostHoras', 'input', () => { renderizarSequenciamentoCostura(); });
        wireEvento('seqCostEficiencia', 'input', () => { renderizarSequenciamentoCostura(); });
        wireEvento('seletorSetorKPI', 'change', () => { renderizarGraficoKPI(); });
        wireEvento('seletorMesKPI', 'change', () => { renderizarGraficoKPI(); });
        wireEvento('seletorParAcertividadeKPI', 'change', () => { renderizarGraficoAcertividadeKPI(); });
        wireEvento('inputMovimentacaoKPI', 'change', () => { processarMovimentacaoSetor(); });
        wireEvento('inputExternoAlmoxKPI', 'change', () => { processarExternoAlmox(); });
        wireEvento('inputEfCostura', 'change', () => { processarEficienciaCostura(); });
        wireEvento('seletorMesEfCostura', 'change', () => { renderizarEficienciaCostura(); });
        wireEvento('btnBaixarMesEfCostura', 'click', () => { baixarMesEfCosturaExcel(); });
        wireEvento('btnLimparMesEfCostura', 'click', () => { limparMesEfCostura(); });
        wireEvento('efCosturaMinPessoa', 'input', () => { renderizarEficienciaCostura(); });
        popularSeletorMesEfCostura(); renderizarEficienciaCostura();
        wireEvento('btnLimparMovimentacoesKPI', 'click', () => { limparMovimentacoesKPI(); });
        wireEvento('btnBaixarMesKPI', 'click', () => { baixarMesKPIExcel(); });
        wireEvento('btnSubabaProgramarLote', 'click', () => { abrirSubabaProgramacao('lote'); });
        wireEvento('btnSubabaMaquinas', 'click', () => { abrirSubabaProgramacao('maquinas'); });
        wireEvento('btnMaquina1', 'click', () => { selecionarMaquinaEnfesto('1'); });
        wireEvento('btnMaquina2', 'click', () => { selecionarMaquinaEnfesto('2'); });
        wireEvento('btnMaquinaSem', 'click', () => { selecionarMaquinaEnfesto('SEM'); });
        wireEvento('btnDefinirMaquinas', 'click', () => { renderizarModalMaquinasEnfesto(); $('modalMaquinasEnfesto').style.display = 'flex'; });
        wireEvento('btnExportarMaquinaEnfesto', 'click', () => { exportarMaquinaEnfestoExcel(); });
        wireEvento('btnLimparSelecaoMaquina', 'click', () => { selecaoMaquinaEnfesto.clear(); ultimoIndiceMaquinaEnfesto = null; renderizarMaquinasEnfesto(); });
        wireEvento('checkTudoMaquinaEnfesto', 'change', (e) => {
            opsDaMaquinaAtualEnfesto().forEach(o => { if (e.target.checked) selecaoMaquinaEnfesto.add(o.id); else selecaoMaquinaEnfesto.delete(o.id); });
            renderizarMaquinasEnfesto();
        });
        wireEvento('listaMaquinaEnfesto', 'click', (e) => {
            if (!e.target.classList || !e.target.classList.contains('check-maquina-enfesto')) return;
            const caixas = [...document.querySelectorAll('#listaMaquinaEnfesto .check-maquina-enfesto')];
            const i = caixas.indexOf(e.target);
            // Shift + clique marca (ou desmarca) o intervalo inteiro desde a última caixinha clicada
            const faixa = (e.shiftKey && ultimoIndiceMaquinaEnfesto !== null && ultimoIndiceMaquinaEnfesto < caixas.length) ? [Math.min(i, ultimoIndiceMaquinaEnfesto), Math.max(i, ultimoIndiceMaquinaEnfesto)] : [i, i];
            for (let k = faixa[0]; k <= faixa[1]; k++) { caixas[k].checked = e.target.checked; if (e.target.checked) selecaoMaquinaEnfesto.add(caixas[k].dataset.id); else selecaoMaquinaEnfesto.delete(caixas[k].dataset.id); }
            ultimoIndiceMaquinaEnfesto = i;
            atualizarSelecaoMaquinaEnfesto();
        });
        wireEvento('modalMaquinasEnfesto', 'change', (e) => {
            const sel = e.target.closest('select[data-chave]'); if (!sel) return;
            definirMaquinaProdutoEnfesto(sel.dataset.chave, sel.value);
            sel.closest('tr').style.background = sel.value === 'SEM' ? 'rgba(224,123,57,0.12)' : '';
        });
        wireEvento('modalMaquinasEnfesto', 'click', (e) => {
            if (e.target.closest('#btnRestaurarMaquinasPadrao')) { salvarMapaMaquinasEnfesto({}); renderizarModalMaquinasEnfesto(); renderizarMaquinasEnfesto(); }
        });
        ['id', 'numeroPrioridade', 'desc', 'etapa', 'qtd', 'diasLocal', 'mesDestino'].forEach(campo => {
            wireEvento(`thOrdenarPrioridades-${campo}`, 'click', () => { ordenarPrioridadesPor(campo); });
        });
        wireEvento('btnAtualizarNecessidade', 'click', () => { renderizarNecessidadePorReferencia(); });
        wireEvento('btnModoNecessidade', 'click', () => { alternarModoLevantamentoNecessidade(); });
        wireEvento('buscaNecessidade', 'input', () => { renderizarNecessidadePorReferencia(); });
        wireEvento('toggleMultiSelectEtapa', 'click', (event) => { toggleMultiSelectEtapa(event); });
        wireEvento('toggleMultiSelectDataCorte', 'click', (event) => { abrirFecharMultiSelect('toggleMultiSelectDataCorte', 'listaFiltroDataCorte', event); });
        wireEvento('listaFiltroDataCorte', 'click', (event) => { event.stopPropagation(); });
        wireEvento('listaFiltroDataCorte', 'change', (e) => {
            if (e.target.id === 'chkTodasDatasCorte') {
                if (e.target.checked) datasCorteExcluidas.clear();
                else $$('.chk-data-corte').forEach(c => datasCorteExcluidas.add(c.value));
            } else if (e.target.classList.contains('chk-data-corte')) {
                if (e.target.checked) datasCorteExcluidas.delete(e.target.value);
                else datasCorteExcluidas.add(e.target.value);
            } else return;
            renderizarFiltroDataCorte();
            renderizarTudoImediato();
        });
        wireEvento('toggleMultiSelectMesDestino', 'click', (event) => { abrirFecharMultiSelect('toggleMultiSelectMesDestino', 'listaFiltroMesDestino', event); });
        wireEvento('listaFiltroMesDestino', 'click', (event) => { event.stopPropagation(); });
        wireEvento('listaFiltroMesDestino', 'change', (e) => {
            if (e.target.id === 'chkTodosMesesDestino') {
                if (e.target.checked) mesesDestinoExcluidos.clear();
                else $$('.chk-mes-destino').forEach(c => mesesDestinoExcluidos.add(c.value));
            } else if (e.target.classList.contains('chk-mes-destino')) {
                if (e.target.checked) mesesDestinoExcluidos.delete(e.target.value);
                else mesesDestinoExcluidos.add(e.target.value);
            } else return;
            renderizarFiltroMesDestino();
            renderizarTudoImediato();
        });
        wireEvento('toggleMultiSelectProduto', 'click', (event) => { abrirFecharMultiSelect('toggleMultiSelectProduto', 'listaFiltroProduto', event); });
        wireEvento('listaFiltroProduto', 'click', (event) => { event.stopPropagation(); });
        wireEvento('listaFiltroProduto', 'change', (e) => {
            if (e.target.id === 'chkTodosProdutos') {
                if (e.target.checked) produtosExcluidos.clear();
                else $$('.chk-produto').forEach(c => produtosExcluidos.add(c.value));
            } else if (e.target.classList.contains('chk-produto')) {
                if (e.target.checked) produtosExcluidos.delete(e.target.value);
                else produtosExcluidos.add(e.target.value);
            } else return;
            renderizarFiltroProduto();
            renderizarTudoImediato();
        });
        wireEvento('toggleMultiSelectSetorPrioridades', 'click', (event) => { abrirFecharMultiSelect('toggleMultiSelectSetorPrioridades', 'listaFiltroSetorPrioridades', event); });
        wireEvento('listaFiltroSetorPrioridades', 'click', (event) => { event.stopPropagation(); });
        wireEvento('listaFiltroSetorPrioridades', 'change', (e) => {
            if (e.target.id === 'chkTodosSetoresPrioridades') {
                if (e.target.checked) setoresPrioridadesExcluidos.clear();
                else $$('.chk-setor-prioridades').forEach(c => setoresPrioridadesExcluidos.add(c.value));
            } else if (e.target.classList.contains('chk-setor-prioridades')) {
                if (e.target.checked) setoresPrioridadesExcluidos.delete(e.target.value);
                else setoresPrioridadesExcluidos.add(e.target.value);
            } else return;
            renderizarFiltroSetorPrioridades();
            renderizarAbaPrioridades();
        });
        wireEvento('toggleMultiSelectMesPrioridades', 'click', (event) => { abrirFecharMultiSelect('toggleMultiSelectMesPrioridades', 'listaFiltroMesPrioridades', event); });
        wireEvento('listaFiltroMesPrioridades', 'click', (event) => { event.stopPropagation(); });
        wireEvento('listaFiltroMesPrioridades', 'change', (e) => {
            if (e.target.id === 'chkTodosMesesPrioridades') {
                if (e.target.checked) mesesPrioridadesExcluidos.clear();
                else $$('.chk-mes-prioridades').forEach(c => mesesPrioridadesExcluidos.add(c.value));
            } else if (e.target.classList.contains('chk-mes-prioridades')) {
                if (e.target.checked) mesesPrioridadesExcluidos.delete(e.target.value);
                else mesesPrioridadesExcluidos.add(e.target.value);
            } else return;
            renderizarFiltroMesPrioridades();
            renderizarAbaPrioridades();
        });
        wireEvento('listaFiltroEtapa', 'click', (event) => { event.stopPropagation(); });
        wireEvento('toggleMultiSelect', 'click', (event) => { toggleMultiSelect(event); });
        wireEvento('listaFiltroLocal', 'click', (event) => { event.stopPropagation(); });
        wireEvento('filtroCiclo', 'input', () => { renderizarTudo(); });
        wireEvento('filtroOP', 'input', () => { renderizarTudo(); });
        wireEvento('filtroMP', 'input', () => { renderizarTudo(); });
        wireEvento('limparSelecaoLote', 'click', () => { limparSelecaoLote(); });
        wireEvento('sugerirPorDias', 'click', () => { sugerirPorDias(); });
        wireEvento('metaLote', 'input', () => { calcularSomaLote(); });
        wireEvento('autoSelecionarPorMeta-pecas', 'click', () => { autoSelecionarPorMeta('pecas'); });
        wireEvento('metaTempo', 'input', () => { calcularSomaLote(); });
        wireEvento('autoSelecionarPorMeta-tempo', 'click', () => { autoSelecionarPorMeta('tempo'); });
        wireEvento('copiarListaOps', 'click', () => { copiarListaOps(); });
        wireEvento('exportarRelatorioMontador', 'click', () => { exportarRelatorioMontador(); });
        wireEvento('alternarOrdenacaoCorte', 'click', () => { alternarOrdenacaoCorte(); });
        wireEvento('limparHistorico', 'click', (event) => { limparHistorico(event); });
        wireEvento('ordenarFilaGeral-ciclo', 'click', () => { ordenarFilaGeral('ciclo'); });
        wireEvento('ordenarFilaGeral-id', 'click', () => { ordenarFilaGeral('id'); });
        wireEvento('ordenarFilaGeral-localDestino', 'click', () => { ordenarFilaGeral('localDestino'); });
        wireEvento('ordenarFilaGeral-localExcel', 'click', () => { ordenarFilaGeral('localExcel'); });
        wireEvento('ordenarFilaGeral-temDublado', 'click', () => { ordenarFilaGeral('temDublado'); });
        wireEvento('ordenarFilaGeral-tempoCorte', 'click', () => { ordenarFilaGeral('tempoCorte'); });
        wireEvento('ordenarFilaGeral-dMeta', 'click', () => { ordenarFilaGeral('dMeta'); });
        wireEvento('ordenarFilaGeral-sTxt', 'click', () => { ordenarFilaGeral('sTxt'); });
}

window.onload = function () {
    // 0. Liga todos os botões/campos aos seus handlers (antes feito via onclick/onchange inline no HTML)
    inicializarEventosUI();

    if (localStorage.getItem('temaEscuro') === 'true') document.body.classList.add('dark-mode');
    try { if (localStorage.getItem('tabelasDensas') === '1') document.body.classList.add('tabelas-densas'); } catch (e) {}
    iniciarColunasFixas();

    // Restringe as abas já de cara (trata como visitante até confirmar login,
    // que é assíncrono) — evita mostrar todas as abas por um instante antes
    // de esconder de novo.
    aplicarRestricaoDeAbaVisitante();

    migrarPrioridadesParaChaveComposta();   // 1ª vez depois da mudança: converte prioridade/mês/estrela salvos só por número pro formato ciclo-OP

    // 1. Inicia o sistema normalmente
    inicializarFiltroEtapa();
    inicializarFiltros();
    renderizarHistorico();
    renderizarFiltroDataCorte();
    renderizarFiltroMesDestino();
    renderizarFiltroProduto();
    reconstruirFiltrosPrioridades();

    carregarFiltrosFilaCorte();
    carregarCapacidade();
    verificarBibliotecas();
    setTimeout(renderizarTudoImediato, 200);
    renderizarPedidosPendentes();
    renderizarFilaCorte();
    atualizarIndicadoresDeAtualizacao();
    // Confere se já tem sessão de admin salva (o Supabase lembra sozinho
    // entre visitas); se não tiver, carrega as OPs direto da nuvem pra quem
    // só visualiza — em vez de depender do que esse navegador já tinha salvo
    verificarSessaoSupabase().then(() => {
        carregarTudoDaNuvemParaVisitante();
        // Visitante atualiza sozinho a cada 3 minutos — sem precisar recarregar
        // a página na mão pra ver publicação nova. Admin não precisa disso (usa
        // o dado local, ao vivo).
        setInterval(() => { if (papelUsuarioAtual !== 'admin') carregarTudoDaNuvemParaVisitante(); }, 3 * 60 * 1000);
        // Remoções do Seq. Costura são diferentes — precisam ficar iguais em
        // QUALQUER computador, admin incluído, já que o objetivo é o admin
        // conseguir ver o que outra pessoa removeu de outro lugar.
        carregarOpsRemovidasSeqCosturaDaNuvem();
        setInterval(carregarOpsRemovidasSeqCosturaDaNuvem, 3 * 60 * 1000);
        // Mesma lógica pra ordem manual do Enfesto — todo mundo carrega.
        carregarOrdemManualEnfestoDaNuvem();
        setInterval(carregarOrdemManualEnfestoDaNuvem, 3 * 60 * 1000);
    });
    atualizarBadgeConsoleDebug();
};
// =========================================================
// 🛡️ SISTEMA DE BACKUP AUTOMÁTICO (TODA SEXTA-FEIRA)
// =========================================================
function verificarBackupSexta() {
    const hoje = new Date();

    // getDay() retorna o dia da semana (0 = Domingo, 5 = Sexta-feira)
    if (hoje.getDay() === 5) {
        // Pega a data de hoje no formato YYYY-MM-DD (Ex: 2026-06-05)
        const dataHoje = hoje.toISOString().split('T')[0];
        const ultimoBackup = localStorage.getItem('ultimoBackupFeito');

        // Se a data do último backup for diferente de hoje, ele faz o download
        if (ultimoBackup !== dataHoje) {
            executarDownloadBackup(dataHoje);
            // Além do backup local de sempre, baixa também o da nuvem — só
            // dá pra fazer isso se a pessoa estiver logada como admin nesse
            // momento (senão não tem como ler os dados publicados)
            if (sessaoAdminAtual) baixarBackupNuvem();
        }
    }
}

function executarDownloadBackup(dataHoje) {
    // 1. Pega os dados vitais do seu sistema no localStorage
    const dadosBackup = {
        bancoOPs: JSON.parse(localStorage.getItem('bancoOPs')) || [],
        historicoLotes: JSON.parse(localStorage.getItem('historicoLotes')) || []
    };

    // 2. Transforma tudo num arquivo JSON legível
    const conteudoJSON = JSON.stringify(dadosBackup, null, 2);
    const blob = new Blob([conteudoJSON], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    // 3. Cria um botão invisível de download e "clica" nele automaticamente
    const linkDownload = document.createElement('a');
    linkDownload.href = url;
    linkDownload.download = `Backup_Sistema_Corte_${dataHoje}.json`; // Nome do arquivo
    document.body.appendChild(linkDownload);
    linkDownload.click();

    // 4. Limpa o botão invisível e salva que o backup de hoje já foi feito
    document.body.removeChild(linkDownload);
    URL.revokeObjectURL(url);

    localStorage.setItem('ultimoBackupFeito', dataHoje);
    console.log("✅ Backup automático de sexta-feira realizado com sucesso!");
}

// Dispara o verificador invisível assim que o sistema terminar de carregar a tela
setTimeout(verificarBackupSexta, 3000); // Aguarda 3 segundos após abrir o painel
// =========================================================

// ==========================================
// 💾 BOTÃO FÍSICO PARA SALVAR MÊS ATIVO
// ==========================================
// As funções que desenham gráficos são as que mais estouram quando a
// biblioteca não carrega — envolvendo elas aqui, um erro delas aparece com a
// mensagem real no console de depuração em vez do genérico "Script error.",
// e o resto da tela continua funcionando.
['atualizarGrafico', 'atualizarGraficoOTD', 'mostrarTooltipOP'].forEach(nome => {
    const original = window[nome];
    if (typeof original === 'function') {
        window[nome] = function (...args) { return executarSeguro(nome, () => original.apply(this, args)); };
    }
});
