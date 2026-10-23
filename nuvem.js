// =========================================================================
// ☁️ SUPABASE — conexão com o banco de dados na nuvem (Fase 3: só a tabela
// de OPs por enquanto). O resto do sistema (pedidos, grade, prioridades)
// continua no localStorage normalmente, sem mudança nenhuma — isso é
// aditivo, não substitui nada ainda.
// =========================================================================
const SUPABASE_URL = 'https://tqvlitrwhvufynrnxwxx.supabase.co';
const SUPABASE_KEY = 'sb_publishable__GE8nvPUdc0bG7TZx42d7A_gj1yat8N';
let supabaseClient = null;
try {
    if (typeof window.supabase !== 'undefined') {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    } else {
        registrarLogDebug('error', ['Biblioteca do Supabase não carregou (window.supabase indefinido) — login, publicar e carregar da nuvem não vão funcionar até isso ser resolvido.']);
    }
} catch (e) {
    registrarLogDebug('error', ['Falha ao iniciar o cliente Supabase: ' + e.message]);
}
// Linha "canário": aparece SEMPRE, em toda abertura da página, sem depender
// de login ou clique em nada — serve pra confirmar que essa versão do
// arquivo está rodando de verdade, e se a conexão com a nuvem foi montada.
registrarLogDebug('log', ['[NUVEM v2] window.supabase = ' + (typeof window.supabase) + ' | cliente montado = ' + (supabaseClient ? 'SIM' : 'NÃO')]);

let sessaoAdminAtual = null; // guarda a sessão do usuário logado (null = visitante)
let papelUsuarioAtual = null; // 'admin' ou 'usuario' — só tem valor quando sessaoAdminAtual existe

// Converte uma OP do formato usado no sistema (bancoDadosOPs) pro formato de
// colunas da tabela "ops" no Supabase (snake_case)
function opParaLinhaSupabase(op) {
    return {
        id: montarChaveOP(op.ciclo, op.id), ciclo: op.ciclo || '', descricao: op.desc || '',
        qtd: parseInt(op.qtd) || 0, tempo_corte: parseFloat(op.tempoCorte) || 0,
        etapa: op.etapa, data_corte: op.dataCorte ? new Date(op.dataCorte).toISOString().slice(0, 10) : null,
        local_destino: op.localDestino || '', local_excel: op.localExcel || '',
        tem_dublado: !!op.temDublado,
        // A separação entre estrela manual e urgência da planilha ainda não
        // existe no cliente (fica pra uma etapa própria) — por enquanto os
        // dois lados da tabela recebem o mesmo valor.
        prioridade_urgencia: !!op.prioridade, prioridade_manual: !!op.prioridade,
        mes_destino: op.mesDestino || null,
        numero_prioridade: op.numeroPrioridade || null,
        destaque: !!op.destaque,
        local_destino_detalhado: op.localDestinoDetalhado || null,
        data_inclusao: op.dataInclusao ? new Date(op.dataInclusao).toISOString().slice(0, 10) : null,
        dias_local: parseInt(op.diasLocal) || 0, codigo_mp: op.codigoMP || '', desc_mp: op.descMP || '',
        referencia: op.referencia || '', sob_medida: !!op.sobMedida, laser: !!op.laser,
        data_finalizacao: op.dataFinalizacao ? new Date(op.dataFinalizacao).toISOString().slice(0, 10) : null,
        atualizado_em: new Date().toISOString()
    };
}

// Converte de volta: linha do Supabase -> formato usado no sistema
function linhaSupabaseParaOP(l) {
    return {
        id: numeroDaChaveNuvem(l.id, l.ciclo), ciclo: l.ciclo || '', desc: l.descricao || '', qtd: l.qtd || 0,
        tempoCorte: l.tempo_corte || 0, etapa: l.etapa, dataCorte: l.data_corte,
        localDestino: l.local_destino || '', localExcel: l.local_excel || '',
        temDublado: !!l.tem_dublado, prioridade: !!(l.prioridade_urgencia || l.prioridade_manual),
        dataEntradaEtapa: l.data_entrada_etapa, diasLocal: l.dias_local || 0,
        codigoMP: l.codigo_mp || '', descMP: l.desc_mp || '', referencia: l.referencia || '',
        sobMedida: !!l.sob_medida, laser: !!l.laser, dataFinalizacao: l.data_finalizacao,
        mesDestino: l.mes_destino || null,
        numeroPrioridade: l.numero_prioridade || null,
        destaque: !!l.destaque,
        localDestinoDetalhado: l.local_destino_detalhado || null,
        dataInclusao: l.data_inclusao || null,
        dataCorteSuposta: calcularDataCorteSuposta(l.data_finalizacao)
    };
}

async function verificarSessaoSupabase() {
    if (!supabaseClient) return;
    try {
        const { data } = await supabaseClient.auth.getSession();
        sessaoAdminAtual = data && data.session ? data.session : null;
        await verificarPapelUsuario();
        atualizarIndicadorLogin();
    } catch (e) {
        registrarLogDebug('error', ['Erro ao verificar sessão do Supabase: ' + e.message]);
    }
}

// Depois de logado, descobre se a pessoa é admin ou só "usuario" (acesso
// restrito, só pra importar planilha) — consultando a tabela
// papeis_usuario pelo e-mail de quem entrou. Quem não estiver cadastrado
// lá é tratado como admin, de propósito — assim o acesso do admin original
// nunca quebra só por essa tabela não ter uma linha pra ele.
async function verificarPapelUsuario() {
    papelUsuarioAtual = null;
    if (!sessaoAdminAtual || !supabaseClient) return;
    try {
        const email = sessaoAdminAtual.user.email;
        const { data, error } = await supabaseClient.from('papeis_usuario').select('papel').eq('email', email).maybeSingle();
        if (error) throw error;
        papelUsuarioAtual = data && data.papel === 'usuario' ? 'usuario' : 'admin';
    } catch (e) {
        registrarLogDebug('error', ['Não consegui checar o papel do usuário, tratando como admin: ' + e.message]);
        papelUsuarioAtual = 'admin'; // mesma lógica de segurança: se der erro, não bloqueia o admin original
    }
    // Checagem silenciosa do espaço da nuvem — só incomoda com um toast se
    // estiver alto (80%+); senão não aparece nada, pra não virar barulho
    // toda vez que o admin entra.
    if (papelUsuarioAtual === 'admin') { verificarEspacoNuvem(false); verificarBackupNuvemAutomatico(); }
}

function atualizarIndicadorLogin() {
    const txt = $('txtLoginAdmin');
    if (!txt) return;
    document.body.classList.toggle('modo-usuario', papelUsuarioAtual === 'usuario');
    if (sessaoAdminAtual) {
        const nome = sessaoAdminAtual.user.email.split('@')[0].toUpperCase();
        txt.innerText = papelUsuarioAtual === 'usuario' ? `${nome} (USUÁRIO)` : nome;
        $('btnLoginAdmin').title = papelUsuarioAtual === 'usuario' ? 'Logado — só pode importar planilhas. Clique pra sair.' : 'Logado como admin — clique pra sair';
        if ($('indicadorUltimaPublicacao')) $('indicadorUltimaPublicacao').innerText = ''; // não faz sentido pro admin, ele usa o dado local ao vivo
    } else {
        txt.innerText = 'VISITANTE';
        $('btnLoginAdmin').title = 'Entrar como admin';
        atualizarIndicadorUltimaPublicacao();
    }
    aplicarRestricaoDeAbaVisitante();
}

// Sem login, só a aba Sequenciamento fica disponível — as outras somem do
// menu. Não é só estética: como as ações de edição já ficam bloqueadas de
// qualquer forma (exigirAdmin), deixar as outras abas visíveis só deixaria
// o visitante perdido clicando em telas que não fazem sentido pro papel dele.
const ABAS_LIBERADAS_PARA_VISITANTE = ['aba-prioridades', 'aba-kpi', 'aba-seq-costura'];
const ABAS_LIBERADAS_PARA_USUARIO = ['aba-prioridades', 'aba-kpi', 'aba-seq-costura', 'aba-urgencias', 'aba-producao-grupo', 'aba-preparacao'];
function abaLiberadaAgora(idAba) {
    if (papelUsuarioAtual === 'admin') return true;
    if (papelUsuarioAtual === 'usuario') return ABAS_LIBERADAS_PARA_USUARIO.includes(idAba);
    return ABAS_LIBERADAS_PARA_VISITANTE.includes(idAba); // visitante — nem logado
}
function aplicarRestricaoDeAbaVisitante() {
    document.body.classList.toggle('modo-visitante', !sessaoAdminAtual);
    // Seletor por ID (não por classe .tab-btn) de propósito — algumas abas
    // moraram pra dentro do menu "MAIS" e usam outra classe visual (.btn),
    // mas ainda precisam ser escondidas certinho pra quem não é admin.
    $$('[id^="abrirAba-"]').forEach(btn => {
        const idAba = btn.id.replace('abrirAba-', '');
        btn.style.display = abaLiberadaAgora(idAba) ? '' : 'none';
    });
    // O botão "MAIS" em si só faz sentido aparecer se tiver pelo menos uma
    // aba liberada lá dentro — senão abriria um menu vazio.
    if ($('btnMenuMaisAbas')) {
        const temAlgumaLiberada = ABAS_DENTRO_DO_MENU_MAIS.some(abaLiberadaAgora);
        $('btnMenuMaisAbas').closest('.dropdown-container').style.display = temAlgumaLiberada ? '' : 'none';
    }
    // Se a aba aberta agora não é mais permitida (ex: era admin e deslogou),
    // joga pra Prioridades em vez de deixar a tela numa aba escondida.
    const abaAtivaEl = document.querySelector('.aba-conteudo.ativa');
    if (abaAtivaEl && !abaLiberadaAgora(abaAtivaEl.id)) {
        abrirAba(null, 'aba-prioridades');
    }
}

async function fazerLoginAdmin(email, senha) {
    if (!supabaseClient) { showToast('Conexão com a nuvem não foi iniciada — veja o console de depuração.', true); return; }
    let resultado;
    try {
        resultado = await supabaseClient.auth.signInWithPassword({ email, password: senha });
    } catch (e) {
        registrarLogDebug('error', ['Login falhou (erro de rede/conexão): ' + e.message]);
        showToast('<i class="fas fa-triangle-exclamation"></i> Falha de conexão com a nuvem. Veja o console de depuração.', true);
        return;
    }
    const { data, error } = resultado;
    if (error) {
        registrarLogDebug('error', ['Login recusado pelo Supabase: ' + error.message]);
        showToast('<i class="fas fa-triangle-exclamation"></i> ' + error.message, true);
        return;
    }
    sessaoAdminAtual = data.session;
    await verificarPapelUsuario();
    atualizarIndicadorLogin();
    fecharModais();
    showToast(papelUsuarioAtual === 'usuario'
        ? "<i class='fas fa-check'></i> Login feito — você pode importar planilhas."
        : "<i class='fas fa-check'></i> Login feito — você é admin agora.");
}

async function fazerLogoutAdmin() {
    if (!supabaseClient) return;
    await supabaseClient.auth.signOut();
    sessaoAdminAtual = null;
    papelUsuarioAtual = null;
    atualizarIndicadorLogin();
    showToast("Saiu do modo admin.");
}

// Envia o bancoDadosOPs atual (o que está na tela agora) pra nuvem, de uma
// vez, em lotes de 500 (limite prático de uma chamada só). Só funciona
// logado — sem login, o Supabase já bloqueia isso sozinho (RLS).
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

// Junta todo o carregamento de nuvem do visitante num lugar só — usado tanto
// na abertura da página quanto na atualização automática periódica.
async function carregarTudoDaNuvemParaVisitante() {
    await Promise.all([
        carregarOPsDaNuvemParaVisitante(),
        carregarPedidosDaNuvemParaVisitante(),
        carregarGradeDaNuvemParaVisitante(),
        carregarPrioridadeClientesDaNuvemParaVisitante(),
        carregarLocalizacaoCompletaDaNuvemParaVisitante(),
        carregarTodosPedidosDaNuvemParaVisitante(),
        carregarOpsManuaisDaNuvemParaVisitante(),
        carregarLocalProducaoDaNuvemParaVisitante(),
        carregarMovimentacoesKPIDaNuvemParaVisitante(),
        carregarPorOPCosturaDaNuvemParaVisitante(),
    ]);
    atualizarIndicadorUltimaPublicacao();
}

const TABELAS_NUVEM = ['ops', 'pedidos', 'grade', 'prioridade_clientes', 'localizacao_completa', 'pedidos_todos'];

// Baixa uma cópia de TODOS os dados que estão hoje na nuvem, num arquivo só.
// O plano gratuito do Supabase não tem backup automático nenhum (só nos
// pagos) — esse é o "seguro" caseiro pros dados compartilhados. Não mexe no
// backup local de sexta-feira, que continua existindo separado (esse aqui é
// dos dados PUBLICADOS, que todo mundo vê — coisas diferentes).
// Plano gratuito do Supabase = 500MB, sem aviso nenhum quando está
// chegando perto do limite — essa função consulta o tamanho real do banco
// (via função obter_tamanho_banco(), criada no SQL) e mostra pro admin,
// evitando a surpresa de "parou de funcionar do nada" um dia.
const LIMITE_NUVEM_MB = 500;
async function verificarEspacoNuvem(mostrarSempreQueOk) {
    if (!exigirAdmin('verificar o espaço da nuvem')) return;
    if (!supabaseClient) { showToast('Conexão com a nuvem não foi iniciada.', true); return; }
    try {
        const { data, error } = await supabaseClient.rpc('obter_tamanho_banco');
        if (error) throw error;
        const usadoMB = data / (1024 * 1024);
        const percentual = Math.round((usadoMB / LIMITE_NUVEM_MB) * 1000) / 10;
        const mensagem = `<i class="fas fa-database"></i> Nuvem: ${usadoMB.toFixed(1)} MB de ${LIMITE_NUVEM_MB} MB usados (${percentual}%)`;
        if (percentual >= 80) {
            showToast(mensagem + ' — chegando perto do limite do plano gratuito!', true);
        } else if (mostrarSempreQueOk) {
            showToast(mensagem);
        }
        return { usadoMB, percentual };
    } catch (e) {
        registrarLogDebug('error', ['Falha ao consultar o tamanho do banco: ' + e.message]);
        if (mostrarSempreQueOk) showToast('<i class="fas fa-triangle-exclamation"></i> Não consegui consultar o espaço da nuvem — veja o console de depuração.', true);
    }
}

async function baixarBackupNuvem() {
    if (!exigirAdmin('baixar o backup da nuvem')) return;
    if (!supabaseClient) { showToast('Conexão com a nuvem não foi iniciada.', true); return; }
    showToast('<i class="fas fa-cloud-download-alt"></i> Baixando backup da nuvem...');
    try {
        const dados = {};
        for (const tabela of TABELAS_NUVEM) {
            dados[tabela] = await buscarTodasLinhasSupabase(tabela);
        }
        if (typeof coletarDadosNavegadorBackup === 'function') dados._navegador = coletarDadosNavegadorBackup();
        const dataHoje = new Date().toISOString().split('T')[0];
        const conteudoJSON = JSON.stringify(dados, null, 2);
        const blob = new Blob([conteudoJSON], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const linkDownload = document.createElement('a');
        linkDownload.href = url;
        linkDownload.download = `Backup_Nuvem_${dataHoje}.json`;
        linkDownload.click();
        URL.revokeObjectURL(url);
        showToast('<i class="fas fa-check"></i> Backup da nuvem baixado!');
    } catch (e) {
        registrarLogDebug('error', ['Falha ao baixar backup da nuvem: ' + e.message]);
        showToast('<i class="fas fa-triangle-exclamation"></i> Falha ao baixar backup. Veja o console de depuração.', true);
    }
}

// Restaura um arquivo baixado por baixarBackupNuvem() de volta pra nuvem —
// publica tabela por tabela, usando o mesmo mecanismo de sempre (upsert +
// remove o que não está no arquivo). Pede confirmação, porque SOBRESCREVE o
// que está publicado agora — é pra usar só se algo tiver dado errado.
async function restaurarBackupNuvem(e) {
    if (!exigirAdmin('restaurar um backup da nuvem')) { if (e && e.target) e.target.value = ''; return; }
    const input = e.target;
    if (!input.files[0]) return;
    if (!confirm('⚠️ Isso vai SUBSTITUIR os dados publicados na nuvem (que todo mundo vê) pelos desse arquivo de backup.\n\nTem certeza que deseja continuar?')) { input.value = ''; return; }

    const leitor = new FileReader();
    leitor.onload = async (ev) => {
        try {
            const dados = JSON.parse(ev.target.result);
            let resumo = [];
            for (const tabela of TABELAS_NUVEM) {
                if (dados[tabela] && dados[tabela].length) {
                    const r = await sincronizarTabelaSupabase(tabela, dados[tabela]);
                    resumo.push(`${r.publicados} em ${tabela}`);
                }
            }
            await supabaseClient.from('metadados_sistema').upsert({ id: 'global', ultima_publicacao: new Date().toISOString() });
            showToast(`<i class="fas fa-check"></i> Backup restaurado: ${resumo.join(' + ')}!`);
            // Dados que só existiam no navegador de quem fez o backup (histórico de lotes etc.): restaura só se a pessoa quiser
            const nav = dados._navegador && typeof dados._navegador === 'object' ? Object.keys(dados._navegador) : [];
            if (nav.length && confirm(`Esse backup também tem ${nav.length} item(ns) que ficam só no navegador (histórico de lotes, preferências, importações não publicadas...).\n\nRestaurar esses dados NESTE navegador também? Isso substitui o que existe aqui com o mesmo nome.`)) {
                nav.forEach(k => { try { localStorage.setItem(k, dados._navegador[k]); } catch (e) { /* ignora */ } });
                showToast('<i class="fas fa-check"></i> Dados do navegador restaurados. Recarregando...');
                setTimeout(() => location.reload(), 1500);
            }
        } catch (err) {
            registrarLogDebug('error', ['Falha ao restaurar backup da nuvem: ' + err.message]);
            showToast('<i class="fas fa-triangle-exclamation"></i> Falha ao restaurar. Arquivo pode estar corrompido ou não ser um backup da nuvem. Veja o console.', true);
        } finally {
            input.value = '';
        }
    };
    leitor.readAsText(input.files[0]);
}

// Bloqueia uma ação se a pessoa não estiver logada como admin — chamada no
// COMEÇO de toda função que muda dado (sincronizar, importar, mover OP,
// etc). Sincronizar/editar sempre mexeu só no navegador de quem faz —
// nunca precisou de login pra isso. Mas deixar isso disponível pra quem só
// deveria estar visualizando é confuso (a pessoa mexe e nada realmente
// muda pros outros) — por isso passa a bloquear aqui, na origem da ação,
// e não só na hora de publicar.
function exigirAdmin(oQueIaFazer) {
    if (sessaoAdminAtual && papelUsuarioAtual === 'admin') return true;
    if (sessaoAdminAtual && papelUsuarioAtual === 'usuario') {
        showToast(`<i class="fas fa-lock"></i> Seu acesso é só pra importar planilhas — entre como admin pra ${oQueIaFazer || 'fazer isso'}.`, true);
        return false;
    }
    showToast(`<i class="fas fa-lock"></i> Modo visitante — entre como admin pra ${oQueIaFazer || 'fazer isso'}.`, true);
    return false;
}

// Igual exigirAdmin, mas também libera pra quem está logado com o papel
// "usuario" (acesso restrito) — usado só nas ações de IMPORTAR planilha,
// que foi a única coisa que esse papel tem permissão de fazer.
function exigirAdminOuUsuario(oQueIaFazer) {
    if (sessaoAdminAtual) return true;
    showToast(`<i class="fas fa-lock"></i> Modo visitante — entre com login pra ${oQueIaFazer || 'fazer isso'}.`, true);
    return false;
}

// Monta uma lista enxuta de OPs pra mandar como contexto pra IA — só os
// campos relevantes pra decisão de sequenciamento (não manda o objeto OP
// inteiro, pra não gastar tokens à toa com coisa que não ajuda a resposta).
function montarContextoParaIA(escopo) {
    let lista;
    if (escopo === 'aguard-mp') {
        lista = obterOPsAguardandoMateriaPrima().map(op => ({
            op: op.id, ciclo: op.ciclo, etapa: 'AGUARDANDO MATÉRIA PRIMA', referencia: op.referencia,
            peças: op.qtd, diasParado: op.diasLocal, materiaPrima: op.codigoMP, descricao: op.desc
        }));
    } else {
        const idxEtapa = parseInt(escopo);
        lista = bancoDadosOPs.filter(op => op.etapa === idxEtapa).map(op => ({
            op: op.id, ciclo: op.ciclo, etapa: nomesEtapas[op.etapa], referencia: op.referencia,
            peças: op.qtd, dataCorte: op.dataCorte ? formatarDataBR(op.dataCorte) : null,
            diasParado: op.diasLocal, materiaPrima: op.codigoMP, descricao: op.desc
        }));
    }
    return lista;
}

function abrirModalPerguntarIA() {
    if (!exigirAdmin('perguntar à IA')) return;
    if (!supabaseClient) { showToast('Conexão com a nuvem não foi iniciada.', true); return; }

    const opcoesEtapa = nomesEtapas.map((n, i) => `<option value="${i}">${n}</option>`).join('');

    $('modalPerguntarIA').innerHTML = `
        <div class="modal-card" style="width:600px; max-width:92vw; max-height:85vh; overflow-y:auto; border-top:5px solid var(--cor-roxo);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
                <h2 style="margin:0; font-size:16px; display:flex; align-items:center; gap:8px;"><i class="fas fa-robot" style="color:var(--cor-roxo);"></i> PERGUNTAR À IA</h2>
                <button onclick="fecharModais()" class="modal-fechar-btn"><i class="fas fa-times"></i></button>
            </div>
            <div style="display:flex; flex-direction:column; gap:10px;">
                <div class="campo-meta">
                    <label>SOBRE QUAIS OPs?</label>
                    <select id="escopoPerguntarIA">
                        ${opcoesEtapa}
                        <option value="aguard-mp">AGUARDANDO MATÉRIA PRIMA</option>
                    </select>
                </div>
                <div class="campo-meta">
                    <label>SUA PERGUNTA</label>
                    <textarea id="textoPerguntarIA" rows="3" placeholder="Ex: quais OPs seria melhor mandar pra Análise de Medidas primeiro, misturando OPs grandes e pequenas?" style="resize:vertical; padding:8px 12px; border:1px solid var(--borda-cor); background:var(--bg-input); color:var(--texto-cor); border-radius:6px; font-family:'Inter', sans-serif; font-size:13px;"></textarea>
                </div>
                <button id="btnEnviarPerguntaIA" class="btn btn-acao"><i class="fas fa-paper-plane"></i> PERGUNTAR</button>
                <div id="respostaPerguntarIA"></div>
            </div>
        </div>
    `;
    $('modalPerguntarIA').style.display = 'flex';
    $('btnEnviarPerguntaIA').onclick = perguntarIA;
}

async function perguntarIA() {
    const pergunta = $('textoPerguntarIA').value.trim();
    if (!pergunta) return;
    const escopo = $('escopoPerguntarIA').value;
    const contexto = montarContextoParaIA(escopo);
    const respostaDiv = $('respostaPerguntarIA');

    if (!contexto.length) {
        respostaDiv.innerHTML = `<div style="padding:12px; color:var(--texto-secundario); font-style:italic;">Nenhuma OP encontrada nesse escopo — nada pra mandar pra IA analisar.</div>`;
        return;
    }

    $('btnEnviarPerguntaIA').disabled = true;
    respostaDiv.innerHTML = `<div style="padding:12px; color:var(--texto-secundario);"><i class="fas fa-spinner fa-spin"></i> Pensando (${contexto.length} OPs no contexto)...</div>`;

    try {
        const { data, error } = await supabaseClient.functions.invoke('perguntar-ia', { body: { pergunta, contexto } });
        if (error) throw error;
        if (data && data.erro) throw new Error(data.erro);
        const textoResposta = (data && data.resposta) || '(sem resposta)';
        respostaDiv.innerHTML = `<div style="padding:12px; background:var(--bg-painel); border:1px solid var(--borda-cor); border-radius:8px; white-space:pre-wrap; line-height:1.5;">${textoResposta}</div>`;
    } catch (e) {
        registrarLogDebug('error', ['Falha ao perguntar à IA: ' + e.message]);
        respostaDiv.innerHTML = `<div style="padding:12px; color:var(--cor-alerta);"><i class="fas fa-triangle-exclamation"></i> Não consegui obter resposta. Veja o console de depuração.</div>`;
    } finally {
        $('btnEnviarPerguntaIA').disabled = false;
    }
}

function abrirModalLoginAdmin() {
    if (sessaoAdminAtual) { fazerLogoutAdmin(); return; }
    $('modalLoginAdmin').innerHTML = `
        <div class="modal-card" style="width:340px; max-width:90vw; border-top:5px solid var(--cor-roxo);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
                <h2 style="margin:0; font-size:16px; display:flex; align-items:center; gap:8px;"><i class="fas fa-user-lock" style="color:var(--cor-roxo);"></i> ENTRAR COMO ADMIN</h2>
                <button onclick="fecharModais()" class="modal-fechar-btn"><i class="fas fa-times"></i></button>
            </div>
            <div style="display:flex; flex-direction:column; gap:10px;">
                <div class="campo-meta"><label>E-MAIL</label><input type="text" id="loginAdminEmail"></div>
                <div class="campo-meta"><label>SENHA</label><input type="password" id="loginAdminSenha"></div>
                <button id="btnConfirmarLoginAdmin" class="btn btn-acao" style="margin-top:6px;"><i class="fas fa-right-to-bracket"></i> ENTRAR</button>
            </div>
        </div>
    `;
    $('modalLoginAdmin').style.display = 'flex';
    $('btnConfirmarLoginAdmin').onclick = () => fazerLoginAdmin($('loginAdminEmail').value.trim(), $('loginAdminSenha').value);
    $('loginAdminSenha').onkeyup = (e) => { if (e.key === 'Enter') fazerLoginAdmin($('loginAdminEmail').value.trim(), $('loginAdminSenha').value); };
}

let bancoDadosOPs = JSON.parse(localStorage.getItem('bancoOPs')) || [];
let historicoLotes = JSON.parse(localStorage.getItem('historicoLotes')) || [];

// A aba de KPI/Gestão Mensal foi removida pra ser refeita do zero — uma
// coisa de FORA dela ainda lê esse dado (calcularMediaDiariaCorte, usada na
// Fila de Corte). Um array vazio evita que ela quebre; simplesmente mostra
// "sem dados" até o novo KPI existir e repor essa informação. (O Fluxo
// Geral, que também lia daqui, foi removido do sistema — não usa mais.)
let dadosMes = [];

let locaisSelecionados = [], etapasSelecionadas = [], lastChecked = null, ordemCorteAsc = true, ultimaSugestao = 'pecas', ultimaSequenciaPedidosGerada = [];
let filaOrdenacaoCol = 'padrao', filaOrdenacaoAsc = true, filaGeralDadosGlobais = [];
let opContextoId = null, opFracionarOrigem = null;

// Seleção do montador de lote — guardada aqui (não só no checkbox da tela)
// pra sobreviver a mudanças de filtro. Antes, filtrar uma OP e depois trocar
// o filtro fazia a marcação sumir, porque a tabela é reconstruída do zero a
// cada filtro e o HTML não "lembra" de nada sozinho.
let selecaoLoteOPs = new Set();
let pilhaUndo = [], pilhaRedo = []; const MAX_HISTORICO = 30;

Chart.register(ChartDataLabels);

const pluginFundoSolido = {
    id: 'fundoSolido',
    beforeDraw(chart) {
        const { ctx, width, height } = chart;
        ctx.save();
        ctx.globalCompositeOperation = 'destination-over';
        ctx.fillStyle = document.body.classList.contains('dark-mode') ? '#221F1A' : '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.restore();
    }
};

const pluginFinaisDeSemana = {
    id: 'finaisDeSemana',
    beforeDraw(chart) {
        const { ctx, chartArea: { top, bottom }, scales: { x } } = chart;
        if (!x || chart.config.id === 'fluxoConsolidado') return;
        ctx.save();
        ctx.fillStyle = document.body.classList.contains('dark-mode') ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)';
        let anoAtual = new Date().getFullYear();
        let elMes = document.getElementById('mesReferencia');
        let mesInput = elMes ? (parseInt(elMes.value) || (new Date().getMonth() + 1)) : (new Date().getMonth() + 1);
        let tickWidth = chart.data.labels.length > 1 ? (x.getPixelForTick(1) - x.getPixelForTick(0)) : x.width;

        chart.data.labels.forEach((label, index) => {
            let dia = parseInt(label);
            let diaSemana = new Date(anoAtual, mesInput - 1, dia).getDay();
            if (diaSemana === 0 || diaSemana === 6) {
                let xPos = x.getPixelForTick(index);
                if (xPos >= x.left && xPos <= x.right) { ctx.fillRect(xPos - tickWidth / 2, top, tickWidth, bottom - top); }
            }
        });
        ctx.restore();
    }
};

// SISTEMA DE UNDO/REDO E TOAST
function registrarEstado() { const e = JSON.stringify(bancoDadosOPs); if (pilhaUndo[pilhaUndo.length - 1] !== e) { pilhaUndo.push(e); if (pilhaUndo.length > MAX_HISTORICO) pilhaUndo.shift(); pilhaRedo = []; } }
function desfazerAcao() { if (pilhaUndo.length > 0) { pilhaRedo.push(JSON.stringify(bancoDadosOPs)); bancoDadosOPs = JSON.parse(pilhaUndo.pop()); localStorage.setItem('bancoOPs', JSON.stringify(bancoDadosOPs)); cacheGruposPorReferencia = null; renderizarTudoImediato(); showToast("<i class='fas fa-undo'></i> Ação Desfeita"); } }
function refazerAcao() { if (pilhaRedo.length > 0) { pilhaUndo.push(JSON.stringify(bancoDadosOPs)); bancoDadosOPs = JSON.parse(pilhaRedo.pop()); localStorage.setItem('bancoOPs', JSON.stringify(bancoDadosOPs)); cacheGruposPorReferencia = null; renderizarTudoImediato(); showToast("<i class='fas fa-redo'></i> Ação Refeita"); } }

function showToast(html, err = false, duracaoMs = 2000) {
    let t = $('toast-atalhos'); if (!t) { t = document.createElement('div'); t.id = 'toast-atalhos'; t.style.cssText = 'position:fixed; bottom:20px; left:50%; transform:translateX(-50%); color:white; padding:12px 25px; border-radius:30px; font-weight:800; font-size:14px; z-index:10000; transition:all 0.3s; opacity:0; pointer-events:none; display:flex; gap:10px; align-items:center;'; document.body.appendChild(t); }
    t.style.background = err ? 'var(--cor-alerta)' : 'var(--cor-sugestao)'; t.innerHTML = html; t.style.opacity = '1'; t.style.bottom = '40px';
    clearTimeout(t.timer); t.timer = setTimeout(() => { t.style.opacity = '0'; t.style.bottom = '20px'; }, duracaoMs);
}

// EVENTOS GLOBAIS (TECLADO E MOUSE)
document.addEventListener('keydown', e => {
    const isInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName);
    if ($('omniInput') === document.activeElement && e.key !== 'Escape') return;
    if (e.ctrlKey || e.metaKey) {
        if (e.key.toLowerCase() === 'z' && !isInput) { e.preventDefault(); e.shiftKey ? refazerAcao() : desfazerAcao(); }
        if (e.key.toLowerCase() === 'y' && !isInput) { e.preventDefault(); refazerAcao(); }
        if (e.key.toLowerCase() === 'k') { e.preventDefault(); abrirBuscaGlobal(); }
    }
    if (e.altKey && !isInput) {
        const abas = { '1': 'aba-programacao', '2': 'aba-fila' };
        if (abas[e.key] && abaLiberadaAgora(abas[e.key])) { e.preventDefault(); abrirAba(null, abas[e.key]); }
        if (e.key.toLowerCase() === 's') { e.preventDefault(); processarExcel(); }
        if (e.key.toLowerCase() === 'c') { e.preventDefault(); $('filtroOP').focus(); }
    }
    if (e.key === 'Escape') { fecharModais(); $$('.dropdown-menu.aberto').forEach(m => m.classList.remove('aberto')); }
});

document.addEventListener('mouseover', function (e) {
    const opElement = e.target.closest('.card-op, .bloco-op, tr, .omni-item, .bloco-op-planta');
    if (!opElement) return;
    let opId = null;
    if (opElement.dataset.id) opId = opElement.dataset.id;
    else if (opElement.getAttribute('oncontextmenu')) { const match = opElement.getAttribute('oncontextmenu').match(/'([^']+)'/); if (match && match[1]) opId = match[1]; }
    else if (opElement.classList.contains('bloco-op')) { const span = opElement.querySelector('.texto-op-visivel'); if (span) opId = span.innerText.split(' ')[0].trim(); }
    else if (opElement.tagName === 'TR') { const cb = opElement.querySelector('.check-lote'); if (cb && cb.dataset.id) opId = cb.dataset.id; }
    else if (opElement.classList.contains('omni-item')) { const st = opElement.querySelector('strong'); if (st) opId = st.innerText.replace('OP:', '').trim(); }
    if (opId) mostrarTooltipOP(e, opId);
});

document.addEventListener('mouseout', function (e) { if (e.target.closest('.card-op, .bloco-op, tr, .omni-item, .bloco-op-planta')) esconderTooltipOP(); });
document.addEventListener('mousemove', function (e) {
    const tt = $('tooltip-op');
    if (tt && tt.style.display === 'block') {
        let x = e.clientX + 15; let y = e.clientY + 15;
        if (x + tt.offsetWidth > window.innerWidth) x = e.clientX - tt.offsetWidth - 15;
        if (y + tt.offsetHeight > window.innerHeight) y = e.clientY - tt.offsetHeight - 15;
        tt.style.left = x + 'px'; tt.style.top = y + 'px';
    }
});

// Em celular/toque não existe "passar o mouse" — um toque na OP abre o mesmo
// tooltip (calculando a posição na hora, já que não tem mousemove contínuo),
// e tocar fora de qualquer OP fecha ele.
document.addEventListener('click', function (e) {
    if (e.target.closest('button, a, input, select, label, .btn, [onclick]')) return;
    const opElement = e.target.closest('.card-op, .bloco-op, tr, .omni-item, .bloco-op-planta');
    if (!opElement) { esconderTooltipOP(); return; }
    let opId = null;
    if (opElement.dataset.id) opId = opElement.dataset.id;
    else if (opElement.getAttribute('oncontextmenu')) { const match = opElement.getAttribute('oncontextmenu').match(/'([^']+)'/); if (match && match[1]) opId = match[1]; }
    else if (opElement.classList.contains('bloco-op')) { const span = opElement.querySelector('.texto-op-visivel'); if (span) opId = span.innerText.split(' ')[0].trim(); }
    else if (opElement.tagName === 'TR') { const cb = opElement.querySelector('.check-lote'); if (cb && cb.dataset.id) opId = cb.dataset.id; }
    else if (opElement.classList.contains('omni-item')) { const st = opElement.querySelector('strong'); if (st) opId = st.innerText.replace('OP:', '').trim(); }
    if (!opId) return;
    mostrarTooltipOP(e, opId);
    const tt = $('tooltip-op');
    if (tt) {
        let x = e.clientX + 15, y = e.clientY + 15;
        if (x + tt.offsetWidth > window.innerWidth) x = e.clientX - tt.offsetWidth - 15;
        if (y + tt.offsetHeight > window.innerHeight) y = e.clientY - tt.offsetHeight - 15;
        tt.style.left = Math.max(5, x) + 'px'; tt.style.top = Math.max(5, y) + 'px';
    }
});

// TOOLTIP
function mostrarTooltipOP(e, id) {
    const tt = $('tooltip-op');
    // mouseover dispara de novo a cada célula que o mouse passa dentro da
    // MESMA linha (não é "entra na linha" uma vez só) — sem essa guarda, o
    // sistema refazia todo o cálculo caro (grade, uniformidade, quais
    // pedidos a OP fecha) várias vezes só pra mostrar a mesma OP de novo.
    if (tt && tt.style.display === 'block' && tt.dataset.opAtual === id) return;
    const op = bancoDadosOPs.find(o => o.id === id); if (!op) return;
    let alertaAtraso = '';
    if (op.dataCorte && new Date(op.dataCorte) < new Date(new Date().setHours(0, 0, 0, 0))) alertaAtraso = `<div style="margin-bottom:8px; background:rgba(193, 68, 78, 0.1); padding:4px 8px; border-radius:4px; color:var(--cor-alerta); font-size:11px; font-weight:900; display:inline-block;"><i class="fas fa-exclamation-triangle"></i> ATRASADO</div>`;

    // Grade por tamanho, se a planilha de grades já foi importada pra essa OP
    let gradeHtml = '';
    try {
        const grades = obterGradesPorOP();
        const gradeOP = buscarGrade(grades, op.id, op.ciclo);
        if (gradeOP && gradeOP.tamanhos && Object.keys(gradeOP.tamanhos).length) {
            const ordemTamanhosConhecidos = ['PP', 'P', 'PM', 'M', 'MG', 'G', 'GG', 'XG', 'EG', 'EGG', 'SG'];
            const compararTamanhos = (a, b) => {
                const idxA = ordemTamanhosConhecidos.indexOf(a.toUpperCase()), idxB = ordemTamanhosConhecidos.indexOf(b.toUpperCase());
                if (idxA !== -1 && idxB !== -1) return idxA - idxB;
                return a.localeCompare(b, 'pt-BR', { numeric: true });
            };
            const selosTamanho = Object.entries(gradeOP.tamanhos)
                .sort((a, b) => compararTamanhos(a[0], b[0]))
                .map(([tam, qtd]) => `<span style="background:var(--bg-painel); border:1px solid var(--borda-cor); border-radius:4px; padding:2px 7px; margin:2px 3px 0 0; display:inline-block; font-size:11px;"><strong>${tam}</strong>: ${qtd}</span>`)
                .join('');
            gradeHtml = `<div style="margin-top:8px;"><span class="lbl">Grade:</span><div style="margin-top:4px;">${selosTamanho}</div></div>`;

            // Uniformidade — o quão "redonda" a grade é pro enfesto (ver
            // calcularUniformidadeGrade). Só mostra quando dá pra calcular.
            const uniformidade = calcularUniformidadeGrade(gradeOP.tamanhos);
            if (uniformidade !== null) {
                let corUnif, textoUnif;
                if (uniformidade >= 0.5) { corUnif = 'var(--cor-despacho)'; textoUnif = 'grade uniforme'; }
                else if (uniformidade >= 0.15) { corUnif = 'var(--cor-selecao)'; textoUnif = 'grade moderada'; }
                else { corUnif = 'var(--cor-alerta)'; textoUnif = 'grade complexa — enfesto tende a ser mais lento'; }
                gradeHtml += `<div style="margin-top:4px;"><span class="pill" style="background:${corUnif}; font-size:9px; color:${uniformidade >= 0.15 && uniformidade < 0.5 ? '#2d3436' : 'white'};" title="Quanto mais próximo de 100%, mais a grade se repete num padrão único — menos esquemas de enfesto.">${textoUnif} (${Math.round(uniformidade * 100)}%)</span></div>`;
            }
        }
    } catch (err) { /* se a leitura falhar, só não mostra a grade — não trava o tooltip */ }

    // Pedidos que essa OP ajuda a fechar (referência em comum) — inclui os já
    // cobertos, não só os que ainda faltam
    let pedidosHtml = '';
    try {
        const matches = pedidosQueEssaOPFecha(op);
        if (matches.length) {
            const MOSTRAR = 3;
            const linhas = matches.slice(0, MOSTRAR).map(m => {
                const selo = m.cobre === true ? '<i class="fas fa-check" style="color:var(--cor-despacho);"></i>' : m.cobre === false ? '<i class="fas fa-triangle-exclamation" style="color:var(--cor-alerta);" title="Grade dessa OP não tem esse tamanho"></i>' : '';
                const situacao = m.faltaProduzir > 0 ? `falta ${m.faltaProduzir}` : `<span style="color:var(--cor-despacho);">já coberto</span>`;
                return `<div style="font-size:11px;">${selo} <strong>${m.pedido}</strong> — ${m.tam}: ${situacao} <span style="color:var(--texto-secundario);">(${m.cliente})</span></div>`;
            }).join('');
            const sobrando = matches.length - MOSTRAR;
            pedidosHtml = `<div style="margin-top:8px;"><span class="lbl">Fecha pedido(s):</span><div style="margin-top:4px; display:flex; flex-direction:column; gap:2px;">${linhas}${sobrando > 0 ? `<div style="font-size:10px; color:var(--texto-secundario);">+${sobrando} outro(s)</div>` : ''}</div></div>`;
        }
    } catch (err) { /* se a leitura falhar, só não mostra essa seção */ }

    tt.innerHTML = `
        <div class="tt-header">
            <div style="display:flex; align-items:center; gap:8px;">
                <span style="color:var(--cor-sugestao); font-size:16px;">${op.id}</span>
                ${op.prioridade ? '<i class="fas fa-star" style="color:var(--cor-selecao); font-size:12px;"></i>' : ''}
                ${op.laser ? '<span class="pill" style="background:var(--cor-roxo); font-size:9px;" title="Essa OP vai pra máquina de corte a laser"><i class="fas fa-bolt"></i> LASER</span>' : ''}
            </div>
            <span class="pill" style="background:var(--cor-primaria); font-size:10px;">${nomesEtapas[op.etapa]}</span>
        </div>
        <div class="tt-body">
            ${alertaAtraso}
            <div><span class="lbl">Ciclo:</span> <strong>${op.ciclo}</strong></div>
            <div><span class="lbl">Destino:</span> <strong>${op.localDestino}</strong></div>
            <div><span class="lbl">Setor Atual:</span> <strong style="color:var(--cor-sugestao);">${op.localExcel || 'N/D'}</strong></div>
            <div><span class="lbl">Peças:</span> <strong style="color:var(--cor-selecao); font-size:14px;">${op.qtd}</strong></div>
            <div><span class="lbl">Tempo:</span> <strong style="color:var(--cor-alerta);">${Number(op.tempoCorte).toFixed(1)} min</strong></div>
            <div><span class="lbl">Dublagem:</span> <strong>${op.temDublado ? 'SIM' : 'NÃO'}</strong></div>
            <div><span class="lbl">Dias Parada:</span> <strong style="color:var(--cor-alerta);">${op.diasLocal || 0} dias</strong></div>
            ${op.mesDestino ? `<div><span class="lbl">Mês Destino:</span> <strong style="color:#B8862A;">${op.mesDestino}</strong></div>` : ''}
            ${op.dataCorteSuposta && formatarDataBR(op.dataCorteSuposta) ? `<div><span class="lbl">Corte Suposto:</span> <strong style="color:var(--cor-roxo);" title="Calculado de trás pra frente a partir da data de finalização no estoque (${formatarDataBR(op.dataFinalizacao)}), descontando ~22 dias de etiquetação+distribuição+estoque. É uma estimativa, não um compromisso.">${formatarDataBR(op.dataCorteSuposta)} <i class="fas fa-circle-question" style="font-size:10px;"></i></strong></div>` : ''}
            ${gradeHtml || pedidosHtml ? `<div style="margin-top:10px; padding-top:8px; border-top:1px solid var(--borda-cor);">${gradeHtml}${pedidosHtml}</div>` : ''}
            <div style="margin-top:10px; padding-top:10px; border-top:1px dashed var(--borda-cor); color:var(--texto-secundario); font-style:italic;">${op.desc}</div>
        </div>
    `;
    tt.style.display = 'block'; tt.dataset.opAtual = id; setTimeout(() => tt.style.opacity = '1', 10);
}
function esconderTooltipOP() { const tt = $('tooltip-op'); if (!tt) return; tt.style.opacity = '0'; tt.style.display = 'none'; }

// MODAIS E MENUS
function fecharModais() { $('ctxMenu').style.display = 'none'; $('omniSearchOverlay').style.display = 'none'; $('modalFracionarOverlay').style.display = 'none'; $('modalGargalo').style.display = 'none'; $('modalPrioridadeClientes').style.display = 'none'; $('modalSequenciaPedidos').style.display = 'none'; $('modalSequenciamentoFifo').style.display = 'none'; $('modalGuiaSequenciamento').style.display = 'none'; $('modalAgrupamentoReferencia').style.display = 'none'; $('modalBalancoSincronizacao').style.display = 'none'; $('modalGuiaSistema').style.display = 'none'; $('modalLoginAdmin').style.display = 'none'; $('modalPerguntarIA').style.display = 'none'; $('modalPrioridadeManual').style.display = 'none'; $('modalFeriados').style.display = 'none'; $('modalBalancoUrgencias').style.display = 'none'; $('modalMaquinasEnfesto').style.display = 'none'; if ($('modalOficinasKPI')) $('modalOficinasKPI').style.display = 'none'; if ($('modalDetalheSetorKPI')) $('modalDetalheSetorKPI').style.display = 'none'; }

