// -------------------------------------------------------------------------
// (separado de nuvem.js) Publicar os dados na nuvem (admin) e carregar da nuvem (visitante/usuário).
// -------------------------------------------------------------------------
// Publica um conjunto de linhas numa tabela do Supabase — envia tudo que
// existe agora (insere novo, atualiza o que mudou) e REMOVE de lá o que não
// veio nesse lote. Sem isso, uma OP que já passou do corte (e por isso não
// está mais em bancoDadosOPs) ficaria acumulada na nuvem pra sempre, mesmo
// não fazendo mais sentido nenhum ali.
// Busca TODAS as linhas de uma tabela — o Supabase, numa busca simples, só
// devolve as primeiras 1000 linhas por padrão. Sem isso, uma tabela grande
// (a de localização completa tem mais de 2000 linhas) perderia mais da
// metade dos dados silenciosamente, sem erro nenhum avisando.
async function buscarTodasLinhasSupabase(nomeTabela, colunas) {
    const TAMANHO_PAGINA = 1000;
    let todas = [];
    let pagina = 0;
    while (true) {
        const { data, error } = await supabaseClient.from(nomeTabela).select(colunas || '*').range(pagina * TAMANHO_PAGINA, (pagina + 1) * TAMANHO_PAGINA - 1);
        if (error) throw error;
        if (!data || !data.length) break;
        todas = todas.concat(data);
        if (data.length < TAMANHO_PAGINA) break;
        pagina++;
    }
    return todas;
}

// Publica linhas SEM NUNCA apagar nada da nuvem, mesmo que não existam mais
// localmente — usada pra dado HISTÓRICO (tipo movimentação de KPI), onde o
// navegador só guarda uma janela recente por limite de espaço, mas a nuvem
// deve continuar acumulando pra sempre. Diferente de
// sincronizarTabelaSupabase(), que apaga da nuvem o que sumiu do lado
// local — certo pra "estado atual" (OPs, pedidos), errado pra histórico
// (já causou perda real de dado de meses antigos quando usado aqui antes).
async function publicarSemApagar(nomeTabela, linhas) {
    const porId = new Map();
    linhas.forEach(l => porId.set(l.id, l));
    const duplicatasRemovidas = linhas.length - porId.size;
    linhas = [...porId.values()];
    if (duplicatasRemovidas > 0) {
        registrarLogDebug('log', [`[NUVEM] "${nomeTabela}": ${duplicatasRemovidas} linha(s) duplicada(s) (mesmo id) ignorada(s) antes de publicar.`]);
    }

    const TAMANHO_LOTE = 500;
    let enviadas = 0;
    for (let i = 0; i < linhas.length; i += TAMANHO_LOTE) {
        const lote = linhas.slice(i, i + TAMANHO_LOTE);
        const { error } = await supabaseClient.from(nomeTabela).upsert(lote, { onConflict: 'id' });
        if (error) {
            registrarLogDebug('error', [`[NUVEM] "${nomeTabela}": erro ao publicar lote (linhas ${i}-${i + lote.length}): ${error.message}`]);
            throw error;
        }
        enviadas += lote.length;
    }
    registrarLogDebug('log', [`[NUVEM] "${nomeTabela}": ${enviadas} linha(s) publicada(s) com sucesso (sem apagar nada da nuvem).`]);
    return { publicados: linhas.length };
}

async function sincronizarTabelaSupabase(nomeTabela, linhas) {
    // Se duas linhas tiverem o mesmo id no mesmo lote, o Postgres recusa o
    // upsert inteiro ("cannot affect row a second time") — normalmente
    // acontece quando a planilha de origem tem uma linha repetida. Deduplica
    // aqui (mantendo a última ocorrência de cada id) pra proteger qualquer
    // tabela que passe por essa função, não só a que der o problema hoje.
    const porId = new Map();
    linhas.forEach(l => porId.set(l.id, l));
    const duplicatasRemovidas = linhas.length - porId.size;
    linhas = [...porId.values()];
    if (duplicatasRemovidas > 0) {
        registrarLogDebug('log', [`[NUVEM] "${nomeTabela}": ${duplicatasRemovidas} linha(s) duplicada(s) (mesmo id) ignorada(s) antes de publicar.`]);
    }

    const TAMANHO_LOTE = 500;
    for (let i = 0; i < linhas.length; i += TAMANHO_LOTE) {
        const lote = linhas.slice(i, i + TAMANHO_LOTE);
        const { error } = await supabaseClient.from(nomeTabela).upsert(lote, { onConflict: 'id' });
        if (error) throw error;
    }
    const naNuvem = await buscarTodasLinhasSupabase(nomeTabela, 'id');
    const idsAtuais = new Set(linhas.map(l => String(l.id)));
    const paraApagar = (naNuvem || []).map(r => r.id).filter(id => !idsAtuais.has(String(id)));
    for (let i = 0; i < paraApagar.length; i += TAMANHO_LOTE) {
        const lote = paraApagar.slice(i, i + TAMANHO_LOTE);
        const { error } = await supabaseClient.from(nomeTabela).delete().in('id', lote);
        if (error) throw error;
    }
    return { publicados: linhas.length, removidos: paraApagar.length };
}

function pedidoParaLinhaSupabase(p) {
    return {
        id: `${p.pedido}|${p.referencia}|${p.tam}`,
        pedido: p.pedido || '', referencia: p.referencia || '', tam: p.tam || '',
        cliente: p.cliente || '', situacao: p.situacao || '',
        chegada: p.chegada ? new Date(p.chegada).toISOString().slice(0, 10) : null,
        prior: p.prior === undefined || p.prior === null ? 99 : p.prior,
        falta_produzir: parseFloat(p.faltaProduzir) || 0,
        falta_estoque: parseFloat(p.faltaEstoque) || 0,
        descricao: p.descricao || '',
        atualizado_em: new Date().toISOString()
    };
}
function linhaSupabaseParaPedido(l) {
    return { cliente: l.cliente || '', pedido: l.pedido, situacao: l.situacao || '', chegada: l.chegada, prior: l.prior === null ? 99 : l.prior, referencia: l.referencia || '', tam: l.tam || '', faltaProduzir: l.falta_produzir || 0, faltaEstoque: l.falta_estoque || 0, descricao: l.descricao || '' };
}

// A grade fica guardada agrupada por OP (objeto), mas a tabela do Supabase é
// linha por linha (uma por combinação OP+tamanho) — essas duas funções
// convertem de um formato pro outro, nos dois sentidos.
function gradesParaLinhasSupabase(gradesPorOP) {
    const linhas = [];
    for (const chave in gradesPorOP) {
        const g = gradesPorOP[chave];
        const opId = g.op || chave.split('|')[0];
        const ciclo = g.ciclo || '';
        for (const tam in (g.tamanhos || {})) {
            linhas.push({
                id: `${opId}|${ciclo}|${tam}`, op: opId, ciclo, referencia: g.referencia || '', tam,
                qtd: g.tamanhos[tam] || 0,
                locais: (g.locaisPorTamanho && g.locaisPorTamanho[tam]) || null,
                atualizado_em: new Date().toISOString()
            });
        }
    }
    return linhas;
}
function linhasSupabaseParaGrades(linhas) {
    const grades = {};
    linhas.forEach(l => {
        const chave = chaveGrade(l.op, l.ciclo);
        if (!grades[chave]) grades[chave] = { op: l.op, ciclo: l.ciclo || '', referencia: l.referencia || '', tamanhos: {}, locaisPorTamanho: {} };
        grades[chave].tamanhos[l.tam] = l.qtd || 0;
        if (l.locais && l.locais.length) grades[chave].locaisPorTamanho[l.tam] = l.locais;
    });
    return grades;
}

// A lista de prioridade de clientes é só um array ordenado — cada nome vira
// uma linha com a posição dele guardada, pra reconstruir a ordem depois.
function listaPrioridadeParaLinhasSupabase(lista) {
    return lista.map((nome, posicao) => ({ id: nome, posicao, atualizado_em: new Date().toISOString() }));
}
function linhasSupabaseParaListaPrioridade(linhas) {
    return [...linhas].sort((a, b) => a.posicao - b.posicao).map(l => l.id);
}

// Localização completa (a jornada inteira, do Aguard. Liberação até o
// Aguard. Finalização) — usada só pela aba Sequenciamento. Uma linha por OP,
// com a posição dela na fábrica agora (não é o mesmo dado das OPs
// principais, que só cobre até o Corte).
function sequenciaCompletaParaLinhasSupabase(lista) {
    return lista.map(item => ({
        id: String(item.op), op: String(item.op), local: item.local || '',
        referencia: item.ref || '', qtd: item.qtd || 0,
        atualizado_em: new Date().toISOString()
    }));
}
function linhasSupabaseParaSequenciaCompleta(linhas) {
    return linhas.map(l => ({ op: l.op, local: l.local || '', ref: l.referencia || '', qtd: l.qtd || 0 }));
}

// Publica tudo que dá pra publicar hoje (OPs + Pedidos) numa tacada só, pra
// não precisar de um botão pra cada tabela.
function opManualParaLinhaSupabase(op) {
    return {
        id: montarChaveOP(op.ciclo, op.id), descricao: op.desc || '', etapa: op.etapa,
        qtd: parseInt(op.qtd) || 0, dias_local: parseInt(op.diasLocal) || 0,
        mes_destino: op.mesDestino || null, numero_prioridade: op.numeroPrioridade || null,
        destaque: !!op.destaque,
        local_destino_detalhado: op.localDestinoDetalhado || null,
        origem: op.automaticaDoDestino ? 'auto' : 'manual',
        atualizado_em: new Date().toISOString()
    };
}
function linhaSupabaseParaOpManual(l) {
    const parteId = separarChaveOP(l.id);
    return { id: parteId.op, ciclo: parteId.ciclo, desc: l.descricao || '', etapa: l.etapa, qtd: l.qtd || 0, diasLocal: l.dias_local || 0, mesDestino: l.mes_destino || null, numeroPrioridade: l.numero_prioridade || null, destaque: !!l.destaque, localDestinoDetalhado: l.local_destino_detalhado || null, automaticaDoDestino: l.origem === 'auto' };
}

async function publicarTudoNoSupabase() {
    if (!supabaseClient) { showToast('Conexão com a nuvem não foi iniciada.', true); return; }
    if (!sessaoAdminAtual) { showToast('<i class="fas fa-lock"></i> Entre como admin primeiro.', true); return; }

    const status = $('statusPublicacaoSupabase');
    definirStatusNuvem('publicando');
    const pedidosAtuais = obterPedidosPendentes();
    const linhasGrade = gradesParaLinhasSupabase(obterGradesPorOP());
    const listaPrioridade = obterListaPrioridadeClientes();
    const linhasLocalizacao = sequenciaCompletaParaLinhasSupabase(obterSequenciaCompletaOPs());
    const todosOsPedidos = obterTodosPedidos().map(pedidoParaLinhaSupabase);
    if (!bancoDadosOPs.length && !pedidosAtuais.length && !linhasGrade.length && !linhasLocalizacao.length && !todosOsPedidos.length) { definirStatusNuvem('bloqueado', 'Nada pra publicar'); showToast('Nada pra publicar — sincronize primeiro.', true); return; }

    try {
        let resumo = [];
        if (bancoDadosOPs.length) {
            if (status) status.innerText = `Publicando ${bancoDadosOPs.length} OPs...`;
            const r = await sincronizarTabelaSupabase('ops', bancoDadosOPs.map(opParaLinhaSupabase));
            resumo.push(`${r.publicados} OPs`);
        }
        if (pedidosAtuais.length) {
            if (status) status.innerText = `Publicando ${pedidosAtuais.length} itens de pedido...`;
            const r = await sincronizarTabelaSupabase('pedidos', pedidosAtuais.map(pedidoParaLinhaSupabase));
            resumo.push(`${r.publicados} itens de pedido`);
        }
        if (linhasGrade.length) {
            if (status) status.innerText = `Publicando ${linhasGrade.length} linhas de grade...`;
            const r = await sincronizarTabelaSupabase('grade', linhasGrade);
            resumo.push(`${r.publicados} linhas de grade`);
        }
        if (listaPrioridade.length) {
            if (status) status.innerText = `Publicando prioridade de clientes...`;
            const r = await sincronizarTabelaSupabase('prioridade_clientes', listaPrioridadeParaLinhasSupabase(listaPrioridade));
            resumo.push(`${r.publicados} clientes prioritários`);
        }
        if (linhasLocalizacao.length) {
            if (status) status.innerText = `Publicando ${linhasLocalizacao.length} localizações...`;
            const r = await sincronizarTabelaSupabase('localizacao_completa', linhasLocalizacao);
            resumo.push(`${r.publicados} localizações`);
        }
        if (todosOsPedidos.length) {
            if (status) status.innerText = `Publicando ${todosOsPedidos.length} pedidos (todos)...`;
            const r = await sincronizarTabelaSupabase('pedidos_todos', todosOsPedidos);
            resumo.push(`${r.publicados} pedidos (busca)`);
        }
        const opsManuais = [...obterOpsManuaisPrioridade(), ...Object.values(obterOpsDestinoAutomaticas()).map(o => ({ ...o, automaticaDoDestino: true }))];
        if (opsManuais.length) {
            if (status) status.innerText = `Publicando ${opsManuais.length} OPs manuais/automáticas...`;
            const r = await sincronizarTabelaSupabase('ops_manuais_prioridade', opsManuais.map(opManualParaLinhaSupabase));
            resumo.push(`${r.publicados} OPs manuais/automáticas`);
        }
        const localProducaoMapa = obterLocalProducaoPorOP();
        if (localProducaoMapa.size) {
            const linhasLocalProducao = [...localProducaoMapa.entries()].map(([op, local]) => ({ id: op, local_producao: local, atualizado_em: new Date().toISOString() }));
            if (status) status.innerText = `Publicando ${linhasLocalProducao.length} locais de produção...`;
            const r = await sincronizarTabelaSupabase('local_producao_por_op', linhasLocalProducao);
            resumo.push(`${r.publicados} locais de produção`);
        }
        // Fila do Sequenciamento da Produção — visitante só VÊ (não importa
        // nada), então precisa que o admin publique isso pra ele enxergar.
        // sincronizarTabelaSupabase (não publicarSemApagar) de propósito:
        // isso é ESTADO ATUAL da fila, não histórico — se uma OP saiu da
        // fila localmente (foi embora, ou foi removida), precisa sumir da
        // nuvem também.
        const porOPCostura = obterPorOPCosturaDetalhado();
        if (porOPCostura.length) {
            const linhasPorOPCostura = porOPCostura.map(porOPCosturaParaLinhaSupabase);
            if (status) status.innerText = `Publicando ${linhasPorOPCostura.length} linhas do Sequenciamento da Produção...`;
            let r;
            try {
                r = await sincronizarTabelaSupabase('por_op_costura_detalhado', linhasPorOPCostura);
            } catch (eCor) {
                // Coluna "cor" ainda não criada no Supabase (SQL 26) — publica sem ela e sem o MIN/PEÇA pra não travar o resto.
                if (!/\b(cor|tempo_peca_costura|dias_local)\b/i.test(String(eCor && eCor.message || eCor))) throw eCor;
                r = await sincronizarTabelaSupabase('por_op_costura_detalhado', linhasPorOPCostura.map(({ cor, tempo_peca_costura, dias_local, ...resto }) => resto));
                registrarLogDebug('error', ['[NUVEM] Falta rodar o SQL 26/28 (colunas "cor", "tempo_peca_costura", "dias_local"): Sequência publicada SEM elas.']);
            }
            resumo.push(`${r.publicados} linhas do Sequenciamento da Produção`);
        }
        const linhasMovimentacoesKPI = movimentacoesParaLinhasSupabase();
        registrarLogDebug('log', [`[NUVEM] Preparando publicação de movimentacoes_kpi: ${linhasMovimentacoesKPI.length} linha(s) encontrada(s) localmente.`]);
        if (linhasMovimentacoesKPI.length) {
            if (status) status.innerText = `Publicando ${linhasMovimentacoesKPI.length} movimentações de KPI...`;
            const r = await publicarMovimentacoesKPILinhas(linhasMovimentacoesKPI);
            resumo.push(`${r.publicados} movimentações de KPI`);
        } else {
            registrarLogDebug('log', ['[NUVEM] "movimentacoes_kpi": pulado, não havia nenhuma movimentação salva localmente no momento de publicar.']);
        }
        // Marca a hora dessa publicação — é isso que o visitante vê como
        // "dados de: há X min"
        await supabaseClient.from('metadados_sistema').upsert({ id: 'global', ultima_publicacao: new Date().toISOString() });
        if (status) status.innerText = `Publicado às ${new Date().toLocaleTimeString('pt-BR')}`;
        definirStatusNuvem('ok', 'Publicado: ' + resumo.join(' + '));
        showToast(`<i class="fas fa-cloud-upload-alt"></i> Publicado: ${resumo.join(' + ')}!`);
    } catch (e) {
        if (status) status.innerText = 'Falha ao publicar — veja o console de depuração';
        registrarLogDebug('error', ['Falha ao publicar no Supabase: ' + e.message]);
        definirStatusNuvem('falha', e.message);
        showToast('<i class="fas fa-triangle-exclamation"></i> Falha ao publicar. Veja o console de depuração.', true);
    }
}

// Pra quem NÃO está logado (visitante): busca as OPs direto da nuvem, em vez
// de usar o que está (ou não está) no localStorage desse navegador.
async function carregarOPsDaNuvemParaVisitante() {
    if (!supabaseClient) { registrarLogDebug('log', ['[NUVEM] Não busquei OPs da nuvem: cliente Supabase não foi montado (veja a linha [NUVEM v2] acima).']); return; }
    if (sessaoAdminAtual) { registrarLogDebug('log', ['[NUVEM] Não busquei da nuvem: você está logado como admin, usando o fluxo local normal.']); return; }
    try {
        const data = await buscarTodasLinhasSupabase('ops');
        registrarLogDebug('log', [`[NUVEM] Busca concluída: ${data ? data.length : 0} OPs encontradas na tabela.`]);
        if (data && data.length) {
            bancoDadosOPs = data.map(linhaSupabaseParaOP);
            cacheGruposPorReferencia = null;
            // Os filtros (locais, datas) foram montados na abertura da página,
            // quando ainda não existia OP nenhuma (a nuvem responde depois).
            // Sem reconstruir agora, "locaisSelecionados" fica vazio pra
            // sempre — e filtro vazio nesse sistema significa "não mostra
            // nada", não "mostra tudo". Foi isso que deixou a tela vazia
            // mesmo com o dado certo por trás.
            inicializarFiltros();
            renderizarFiltroDataCorte();
            renderizarFiltroMesDestino();
            reconstruirFiltrosPrioridades();
            renderizarTudoImediato();
            showToast(`<i class="fas fa-cloud"></i> ${data.length} OPs carregadas da nuvem (modo visitante).`);
        }
    } catch (e) {
        registrarLogDebug('error', ['Falha ao carregar OPs da nuvem: ' + e.message]);
    }
}

// Mesma ideia da função de OPs, mas pra pedidos. Como obterPedidosPendentes()
// já lê direto do localStorage toda vez que é chamada (não guarda numa
// variável fixa), basta escrever o dado da nuvem nessa mesma chave — todo o
// resto do sistema (Busca de Pedido, Sequenciamento, OPs Vinculadas) já
// funciona sem precisar mudar mais nada.
async function carregarPedidosDaNuvemParaVisitante() {
    if (!supabaseClient || sessaoAdminAtual) return;
    try {
        const data = await buscarTodasLinhasSupabase('pedidos');
        registrarLogDebug('log', [`[NUVEM] Busca de pedidos concluída: ${data ? data.length : 0} itens encontrados.`]);
        if (data && data.length) {
            const pendentes = data.map(linhaSupabaseParaPedido);
            localStorage.setItem('pedidosPendentes', JSON.stringify(pendentes));
            renderizarPedidosPendentes();
            renderizarTudoImediato();
        }
    } catch (e) {
        registrarLogDebug('error', ['Falha ao carregar pedidos da nuvem: ' + e.message]);
    }
}

// Mesma ideia, pra Grade — reconstrói o formato agrupado por OP e escreve na
// mesma chave que obterGradesPorOP() já lê, então tooltip/Sequenciamento/
// Busca de Pedido continuam funcionando sem mudança nenhuma.
async function carregarGradeDaNuvemParaVisitante() {
    if (!supabaseClient || sessaoAdminAtual) return;
    try {
        const data = await buscarTodasLinhasSupabase('grade');
        registrarLogDebug('log', [`[NUVEM] Busca de grade concluída: ${data ? data.length : 0} linhas encontradas.`]);
        if (data && data.length) {
            localStorage.setItem('gradesPorOP', JSON.stringify(linhasSupabaseParaGrades(data)));
            cacheGradesPorOP = null;
        }
    } catch (e) {
        registrarLogDebug('error', ['Falha ao carregar grade da nuvem: ' + e.message]);
    }
}

// Mesma ideia, pra Prioridade de Clientes — reordena pela posição salva.
async function carregarPrioridadeClientesDaNuvemParaVisitante() {
    if (!supabaseClient || sessaoAdminAtual) return;
    try {
        const data = await buscarTodasLinhasSupabase('prioridade_clientes');
        registrarLogDebug('log', [`[NUVEM] Busca de prioridade de clientes concluída: ${data ? data.length : 0} clientes encontrados.`]);
        if (data && data.length) {
            salvarListaPrioridadeClientes(linhasSupabaseParaListaPrioridade(data));
            renderizarTudoImediato();
            renderizarPedidosPendentes();
        }
    } catch (e) {
        registrarLogDebug('error', ['Falha ao carregar prioridade de clientes da nuvem: ' + e.message]);
    }
}

// Mesma ideia, pra localização completa — usada só pela aba Sequenciamento.
async function carregarLocalizacaoCompletaDaNuvemParaVisitante() {
    if (!supabaseClient || sessaoAdminAtual) return;
    try {
        const data = await buscarTodasLinhasSupabase('localizacao_completa');
        registrarLogDebug('log', [`[NUVEM] Busca de localização completa concluída: ${data ? data.length : 0} linhas encontradas.`]);
        if (data && data.length) {
            localStorage.setItem('sequenciaCompletaOPs', JSON.stringify(linhasSupabaseParaSequenciaCompleta(data)));
        }
    } catch (e) {
        registrarLogDebug('error', ['Falha ao carregar localização completa da nuvem: ' + e.message]);
    }
}

// Mesma ideia, pra "todos os pedidos" (inclusive já cobertos) — usada só
// pela Busca de Pedido e Sequenciamento, nunca pelas contagens/urgência.
async function carregarTodosPedidosDaNuvemParaVisitante() {
    if (!supabaseClient || sessaoAdminAtual) return;
    try {
        const data = await buscarTodasLinhasSupabase('pedidos_todos');
        registrarLogDebug('log', [`[NUVEM] Busca de todos os pedidos concluída: ${data ? data.length : 0} itens encontrados.`]);
        if (data && data.length) {
            localStorage.setItem('todosPedidos', JSON.stringify(data.map(linhaSupabaseParaPedido)));
            cacheTodosPedidosPorReferencia = null;
        }
    } catch (e) {
        registrarLogDebug('error', ['Falha ao carregar todos os pedidos da nuvem: ' + e.message]);
    }
}

// Pra quem NÃO está logado: busca as OPs 100% manuais (cadastradas pelo
// admin, que não existem em nenhuma planilha) direto da nuvem.
async function carregarOpsManuaisDaNuvemParaVisitante() {
    if (!supabaseClient || sessaoAdminAtual) return;
    try {
        const data = await buscarTodasLinhasSupabase('ops_manuais_prioridade');
        registrarLogDebug('log', [`[NUVEM] Busca de OPs manuais concluída: ${data ? data.length : 0} itens encontrados.`]);
        const todas = (data || []).map(linhaSupabaseParaOpManual);
        salvarOpsManuaisPrioridade(todas.filter(o => !o.automaticaDoDestino));
        const automaticasObj = {};
        todas.filter(o => o.automaticaDoDestino).forEach(o => { automaticasObj[chaveDaOP(o)] = o; });
        salvarOpsDestinoAutomaticas(automaticasObj);
    } catch (e) {
        registrarLogDebug('error', ['Falha ao carregar OPs manuais da nuvem: ' + e.message]);
    }
}

// Pra quem NÃO está logado: busca a versão enxuta de Local de Produção por
// OP — o visitante não tem a Fila de Corte importada localmente (isso
// nunca vai pra nuvem inteira, só esse cruzamento específico).
async function carregarLocalProducaoDaNuvemParaVisitante() {
    if (!supabaseClient || sessaoAdminAtual) return;
    try {
        const data = await buscarTodasLinhasSupabase('local_producao_por_op');
        registrarLogDebug('log', [`[NUVEM] Busca de Local de Produção concluída: ${data ? data.length : 0} itens encontrados.`]);
        const mapa = {};
        (data || []).forEach(l => { if (l.id && l.local_producao) mapa[l.id] = l.local_producao; });
        localStorage.setItem('localProducaoPorOPNuvem', JSON.stringify(mapa));
    } catch (e) {
        registrarLogDebug('error', ['Falha ao carregar Local de Produção da nuvem: ' + e.message]);
    }
}

// Pra quem NÃO está logado: busca as movimentações de KPI (o gráfico da
// aba KPI ainda é só-admin, mas já deixa o dado pronto na nuvem — se um
// dia o usuário decidir liberar essa aba pro visitante, é só isso).
async function carregarMovimentacoesKPIDaNuvemParaVisitante() {
    if (!supabaseClient || papelUsuarioAtual === 'admin') return; // libera visitante E o papel "usuario" — só o admin de verdade usa o dado local
    try {
        const data = await buscarTodasLinhasSupabase('movimentacoes_kpi');
        registrarLogDebug('log', [`[NUVEM] Busca de movimentações de KPI concluída: ${data ? data.length : 0} itens encontrados.`]);
        salvarMovimentacoesPorSetor(linhasSupabaseParaMovimentacoes(data));
    } catch (e) {
        registrarLogDebug('error', ['Falha ao carregar movimentações de KPI da nuvem: ' + e.message]);
    }
}

// Formata "há quanto tempo" de um jeito curto e legível — "agora mesmo",
// "há 3 min", "há 2h", "há 5 dias"
function formatarTempoRelativo(timestamp) {
    if (!timestamp) return null;
    const segundos = Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000);
    if (segundos < 30) return 'agora mesmo';
    if (segundos < 60) return 'há menos de 1 min';
    const minutos = Math.floor(segundos / 60);
    if (minutos < 60) return `há ${minutos} min`;
    const horas = Math.floor(minutos / 60);
    if (horas < 24) return `há ${horas}h`;
    const dias = Math.floor(horas / 24);
    return `há ${dias} dia(s)`;
}

// Busca a hora da última publicação e atualiza o indicador na tela — só faz
// sentido mostrar pro visitante (o admin trabalha com o dado local, ao vivo)
async function atualizarIndicadorUltimaPublicacao() {
    if (!supabaseClient || sessaoAdminAtual || !$('indicadorUltimaPublicacao')) return;
    try {
        const { data, error } = await supabaseClient.from('metadados_sistema').select('ultima_publicacao').eq('id', 'global').maybeSingle();
        if (error) throw error;
        const rotulo = data && data.ultima_publicacao ? formatarTempoRelativo(data.ultima_publicacao) : 'nunca publicado';
        $('indicadorUltimaPublicacao').innerText = `Dados de: ${rotulo}`;
    } catch (e) {
        registrarLogDebug('error', ['Falha ao buscar última publicação: ' + e.message]);
    }
}

// 📉 TRÁFEGO: antes, todo navegador não-admin baixava TODAS as tabelas a cada 3 min (só movimentacoes_kpi são ~14
// páginas) — estourou a cota de tráfego do plano gratuito do Supabase. Agora a cada ciclo lê só os carimbos de
// metadados_sistema ('global' = PUBLICAR do admin; 'kpi' = importação do KPI, que publica por fora) e baixa as
// tabelas grandes de novo só se o carimbo mudou desde a última vez NESTA página (abrir/recarregar sempre baixa).
const versaoNuvemBaixada = { global: undefined, kpi: undefined };
async function lerVersoesNuvem() {
    try {
        const { data, error } = await supabaseClient.from('metadados_sistema').select('id, ultima_publicacao').in('id', ['global', 'kpi']);
        if (error) throw error;
        const v = { global: null, kpi: null }; (data || []).forEach(l => { v[l.id] = l.ultima_publicacao || null; });
        return v;
    } catch (e) { registrarLogDebug('error', ['Falha ao ler a versão publicada na nuvem: ' + e.message]); return null; }
}
async function marcarVersaoKPINuvem() {
    try { await supabaseClient.from('metadados_sistema').upsert({ id: 'kpi', ultima_publicacao: new Date().toISOString() }); }
    catch (e) { registrarLogDebug('error', ['Falha ao marcar a versão do KPI na nuvem: ' + e.message]); }
}
// Junta todo o carregamento de nuvem do visitante num lugar só — usado tanto
// na abertura da página quanto na atualização automática periódica.
async function carregarTudoDaNuvemParaVisitante() {
    if (!supabaseClient) return;
    const v = await lerVersoesNuvem();   // null = não deu pra conferir → baixa tudo (mais seguro)
    const mudouGeral = !v || v.global !== versaoNuvemBaixada.global;
    const mudouKPI = mudouGeral || v.kpi !== versaoNuvemBaixada.kpi;
    await Promise.all([
        ...(mudouGeral ? [
            carregarOPsDaNuvemParaVisitante(),
            carregarPedidosDaNuvemParaVisitante(),
            carregarGradeDaNuvemParaVisitante(),
            carregarPrioridadeClientesDaNuvemParaVisitante(),
            carregarLocalizacaoCompletaDaNuvemParaVisitante(),
            carregarTodosPedidosDaNuvemParaVisitante(),
            carregarOpsManuaisDaNuvemParaVisitante(),
            carregarLocalProducaoDaNuvemParaVisitante(),
            carregarPorOPCosturaDaNuvemParaVisitante(),
        ] : []),
        ...(mudouKPI ? [carregarMovimentacoesKPIDaNuvemParaVisitante()] : []),
        carregarDestinoDaNuvem(),               // estes três conferem a data de atualização antes de baixar
        carregarUrgentesPreparacaoDaNuvem(),
        carregarCalendarioProducaoDaNuvem(),
    ]);
    if (v) { versaoNuvemBaixada.global = v.global; versaoNuvemBaixada.kpi = v.kpi; }
    if (mudouGeral || mudouKPI) registrarLogDebug('log', [`[NUVEM] Dados baixados (${mudouGeral ? 'publicação geral' : 'só o KPI'}).`]);
    atualizarIndicadorUltimaPublicacao();
}
// Só baixa o conteúdo de uma linha de destino_producao se a data de atualização mudou (o conteúdo pode ter 150 KB).
async function linhaDestinoMudou(id, chaveLocal) {
    const { data, error } = await supabaseClient.from('destino_producao').select('atualizado_em').eq('id', id).maybeSingle();
    if (error) throw error;
    return data ? { existe: true, em: data.atualizado_em, mudou: data.atualizado_em !== localStorage.getItem(chaveLocal) } : { existe: false };
}
