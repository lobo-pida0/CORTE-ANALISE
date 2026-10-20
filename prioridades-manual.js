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

