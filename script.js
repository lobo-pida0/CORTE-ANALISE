// Atalhos usados o sistema inteiro — precisam existir antes de qualquer outra
// coisa, inclusive antes do console de depuração logo abaixo, que já usa eles.
const $ = id => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);

// =========================================================================
// 🖥️ CONSOLE DE DEPURAÇÃO — captura tudo que o navegador registraria no
// console de desenvolvedor (mensagens, avisos, erros) e deixa isso visível
// dentro do próprio app, com histórico salvo. Fica no topo do arquivo de
// propósito, pra capturar mesmo os erros mais cedo possíveis.
// =========================================================================
const LOGS_CONSOLE_MAX = 300;
let logsConsoleDebug = [];
try { logsConsoleDebug = JSON.parse(localStorage.getItem('logsConsoleDebug') || '[]'); } catch (e) { logsConsoleDebug = []; }

function registrarLogDebug(nivel, partes) {
    const mensagem = partes.map(p => {
        if (p instanceof Error) return p.stack || p.message;
        if (typeof p === 'object' && p !== null) { try { return JSON.stringify(p); } catch (e) { return String(p); } }
        return String(p);
    }).join(' ');

    logsConsoleDebug.push({ nivel, mensagem, hora: new Date().toISOString() });
    if (logsConsoleDebug.length > LOGS_CONSOLE_MAX) logsConsoleDebug = logsConsoleDebug.slice(-LOGS_CONSOLE_MAX);
    try { localStorage.setItem('logsConsoleDebug', JSON.stringify(logsConsoleDebug)); } catch (e) { /* localStorage cheio — ignora, não trava o app por causa do log */ }

    if (typeof renderizarConsoleDebug === 'function') renderizarConsoleDebug();
    if (typeof atualizarBadgeConsoleDebug === 'function') atualizarBadgeConsoleDebug();
}

const _consoleOriginal = { log: console.log, warn: console.warn, error: console.error };
console.log = function (...args) { _consoleOriginal.log.apply(console, args); registrarLogDebug('log', args); };
console.warn = function (...args) { _consoleOriginal.warn.apply(console, args); registrarLogDebug('warn', args); };
console.error = function (...args) { _consoleOriginal.error.apply(console, args); registrarLogDebug('error', args); };

window.addEventListener('error', e => {
    if (e.message === 'Script error.' && !e.filename) {
        registrarLogDebug('error', ['Erro sem detalhes — a página está aberta direto do arquivo (file://), e nesse modo o navegador esconde a mensagem real por segurança. Veja logo acima se alguma biblioteca não carregou; se o problema persistir, abrir o sistema por um servidor local (http://localhost) mostra o erro completo.']);
        return;
    }
    registrarLogDebug('error', [`Erro não tratado: ${e.message} (${e.filename ? e.filename.split('/').pop() : '?'}:${e.lineno})`]);
});
window.addEventListener('unhandledrejection', e => {
    registrarLogDebug('error', [`Promise rejeitada sem tratamento: ${e.reason}`]);
});

registrarLogDebug('log', ['Sistema carregado — console de depuração ativo.']);

// Confere se as bibliotecas externas realmente carregaram. Quando uma delas
// falha (CDN fora do ar, rede da empresa bloqueando, sem internet), o sintoma
// que aparece é um monte de erro sem explicação — aqui a causa fica escrita.
function verificarBibliotecas() {
    const libs = [
        { nome: 'Excel (SheetJS)', ok: () => typeof XLSX !== 'undefined', usadaEm: 'importar planilhas' },
        { nome: 'Gráficos (Chart.js)', ok: () => typeof Chart !== 'undefined', usadaEm: 'todos os gráficos' },
        { nome: 'Rótulos de gráfico', ok: () => typeof ChartDataLabels !== 'undefined', usadaEm: 'o gráfico de OTD' },
        { nome: 'Imagem (html2canvas)', ok: () => typeof html2canvas !== 'undefined', usadaEm: 'baixar painel como imagem' },
        { nome: 'Nuvem (Supabase)', ok: () => typeof window.supabase !== 'undefined', usadaEm: 'login de admin e publicar/carregar da nuvem' },
    ];
    const faltando = libs.filter(l => { try { return !l.ok(); } catch (e) { return true; } });
    if (!faltando.length) return;
    faltando.forEach(l => registrarLogDebug('error', [`Biblioteca "${l.nome}" NÃO carregou — o que depende dela (${l.usadaEm}) vai falhar. Causa provável: sem internet, CDN fora do ar, ou a rede da empresa bloqueando.`]));
}

// Roda algo protegido: se estourar, o erro REAL aparece no console de
// depuração. Diferente do handler global, o try/catch não é censurado quando
// a página roda via file://, então é aqui que a mensagem de verdade aparece.
function executarSeguro(nome, fn) {
    try { return fn(); }
    catch (err) {
        registrarLogDebug('error', [`Falha em "${nome}": ${err && err.message ? err.message : err}`, err && err.stack ? String(err.stack).split('\n')[1] || '' : '']);
        return null;
    }
}

// INICIALIZAÇÃO DE VARIÁVEIS E COMPATIBILIDADE DE DADOS
if (localStorage.getItem('kpiMetaMes') && !localStorage.getItem('kpiMetaMes_CORTE')) {
    localStorage.setItem('kpiMetaMes_CORTE', localStorage.getItem('kpiMetaMes'));
    localStorage.setItem('kpiMetaMesOps_CORTE', localStorage.getItem('kpiMetaMesOps'));
    localStorage.setItem('kpiDiasUteis_CORTE', localStorage.getItem('kpiDiasUteis'));
}

// Resolve uma variável CSS (ex: '--cor-despacho') pro valor real dela (ex:
// '#4C9A6A'). Necessário pra usar cores do tema em gráficos Chart.js/Canvas —
// diferente de um elemento HTML normal, o Canvas NÃO entende "var(--x)"
// como texto literal, precisa da cor já resolvida, senão cai em preto.
function corCSS(nomeVar) {
    // O modo escuro aplica a classe no <body>, não no <html> — lê de lá primeiro.
    let valor = getComputedStyle(document.body).getPropertyValue(nomeVar).trim();
    if (!valor) valor = getComputedStyle(document.documentElement).getPropertyValue(nomeVar).trim();
    // Nunca deixa o gráfico ficar preto por falha de leitura da variável —
    // cinza neutro é um fallback visível e seguro em qualquer tema.
    return valor || '#888888';
}

// ⏱️ Estimativa de dias por etapa restante, usada pra calcular o prazo (ATRASO/PRAZO) de cada OP.
// Hoje toda etapa usa o mesmo valor — se no futuro alguma etapa demorar mais/menos que
// as outras, ajusta só aqui em vez de caçar o número espalhado pelo código.
const DIAS_POR_ETAPA_PADRAO = 2;

// ⏱️ Estimativa de dias entre o Corte e a peça chegar no estoque — usada pra
// calcular a "data suposta de corte" de trás pra frente, a partir da data de
// finalização (quando ela já vem preenchida na planilha). São médias fixas,
// combinadas com o usuário; na prática variam bastante (principalmente a
// primeira, que depende da quantidade de peças da OP).
const DIAS_CORTE_ATE_ETIQUETACAO = 2;
const DIAS_ETIQUETACAO_ATE_DISTRIBUICAO = 10;
const DIAS_DISTRIBUICAO_ATE_ESTOQUE = 10;

// Calcula a data suposta em que a OP precisaria ter sido cortada, contando
// de trás pra frente a partir da data de finalização no estoque.
// Formata uma data que pode chegar como Date (recém-importada) ou como texto
// (depois de passar pelo localStorage, onde Date vira string no JSON). Sem
// isso, chamar .toLocaleDateString() direto estoura assim que a página é
// recarregada — foi o que quebrava o tooltip das OPs com data de finalização.
function formatarDataBR(valor) {
    if (!valor) return '';
    const d = valor instanceof Date ? valor : new Date(valor);
    return isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-BR');
}

function calcularDataCorteSuposta(dataFinalizacao) {
    if (!dataFinalizacao) return null;
    const totalDias = DIAS_CORTE_ATE_ETIQUETACAO + DIAS_ETIQUETACAO_ATE_DISTRIBUICAO + DIAS_DISTRIBUICAO_ATE_ESTOQUE;
    const data = new Date(dataFinalizacao);
    data.setDate(data.getDate() - totalDias);
    return data;
}

// =========================================================================
// 🕒 RASTREIO DE "ÚLTIMA ATUALIZAÇÃO" — cada fonte de dado (planilha) importada
// separadamente grava aqui quando foi a última vez que entrou informação nova.
// Evita confiar sem perceber num dado de dias atrás.
// =========================================================================
function registrarAtualizacao(chave) {
    const registro = JSON.parse(localStorage.getItem('ultimasAtualizacoes') || '{}');
    registro[chave] = new Date().toISOString();
    localStorage.setItem('ultimasAtualizacoes', JSON.stringify(registro));
}

function obterUltimaAtualizacao(chave) {
    const registro = JSON.parse(localStorage.getItem('ultimasAtualizacoes') || '{}');
    return registro[chave] || null;
}

// Texto curto tipo "há 2 dias", "há 3h", "agora mesmo", "nunca importado"
function formatarTempoDecorrido(isoString) {
    if (!isoString) return 'nunca importado';
    const diffMs = new Date() - new Date(isoString);
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'agora mesmo';
    if (diffMin < 60) return `há ${diffMin} min`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `há ${diffH}h`;
    const diffDias = Math.floor(diffH / 24);
    return `há ${diffDias} dia${diffDias > 1 ? 's' : ''}`;
}

// Classifica a "idade" do dado pra decidir a cor do aviso: normal (hoje),
// atenção (1-2 dias) ou crítico (3+ dias sem atualizar / nunca importado)
function nivelAlertaAtualizacao(isoString) {
    if (!isoString) return 'critico';
    const diffDias = (new Date() - new Date(isoString)) / 86400000;
    if (diffDias < 1) return 'normal';
    if (diffDias < 3) return 'atencao';
    return 'critico';
}

function corPorNivelAtualizacao(nivel) {
    if (nivel === 'critico') return 'var(--cor-alerta)';
    if (nivel === 'atencao') return 'var(--cor-selecao)';
    return 'var(--cor-despacho)';
}

// Atualiza todos os indicadores de "última atualização" espalhados pela tela
function atualizarIndicadoresDeAtualizacao() {
    const fontes = [
        { chave: 'bancoOPs', elIds: ['atualizacao-sincronizar', 'atualizacao-sincronizar-aba'] },
        { chave: 'grades', elIds: ['atualizacao-grade'] },
        { chave: 'pedidos', elIds: ['atualizacao-pedidos', 'atualizacao-pedidos-aba', 'atualizacao-pedidos-vinc'] },
        { chave: 'filaCorte', elIds: ['atualizacao-filacorte-aba'] },
    ];
    fontes.forEach(f => {
        const iso = obterUltimaAtualizacao(f.chave);
        const nivel = nivelAlertaAtualizacao(iso);
        f.elIds.forEach(elId => {
            const el = $(elId);
            if (!el) return;
            el.innerText = formatarTempoDecorrido(iso);
            el.style.color = corPorNivelAtualizacao(nivel);
        });
    });
}

// ✂️ FILA DE CORTE — os 11 setores físicos por onde a OP passa antes/durante o
// corte, na ordem cronológica real (confirmada com o usuário). Os códigos são
// os "Local" usados na planilha geral "POR_OP".
const SETORES_FILA_CORTE = [
    { codigo: 3901, nome: 'PNP AGUARD LIBERACAO OP' },
    { codigo: 801, nome: 'PNP AGUARD MATERIA PRIMA' },
    { codigo: 3961, nome: 'PNP ANALISE DE MATERIA PRIMA' },
    { codigo: 1881, nome: 'PNP PPCP - PROGRAMACAO' },
    { codigo: 3221, nome: 'PNP ALMOX. ANALISE DE MEDIDAS' },
    { codigo: 104, nome: 'PNP CAD' },
    { codigo: 3949, nome: 'PNP PPCP-PROGRAMACAO CORTE' },
    { codigo: 381, nome: 'PNP ALMOX. TECIDOS' },
    { codigo: 1821, nome: 'PNP DUBLAGEM' },
    { codigo: 3541, nome: 'PNP ENFESTO' },
    { codigo: 106, nome: 'PNP CORTE' },
];

// 🧭 SEQUÊNCIA COMPLETA DE PRODUÇÃO — do início até o estoque, ensinada pelo
// usuário passo a passo. Cada posição é um número: quanto MAIOR, mais perto
// do estoque a OP está. Onde existem "ramos" que não têm ordem entre si (ex:
// os processos antes da separação, ou as células de costura), todos ficam na
// MESMA posição — a comparação nesse caso é só "chegou nesse estágio ou não".
const SEQUENCIA_COMPLETA_LOCAIS = [
    'PNP AGUARD LIBERACAO OP',
    'PNP AGUARD MATERIA PRIMA',
    'PNP ANALISE DE MATERIA PRIMA',
    'PNP PPCP - PROGRAMACAO',
    'PNP ALMOX. ANALISE DE MEDIDAS',
    'PNP CAD',
    'PNP PPCP-PROGRAMACAO CORTE',
    'PNP ALMOX. TECIDOS',
    'PNP DUBLAGEM',
    'PNP ENFESTO',
    'PNP CORTE',
    'PNP ETIQ PROF/AMARR SOC/SEP LOG/SEP GLA',
    ['PNP AGUARD DEFINICAO SILK', 'PNP AGUARD DEFINICAO BORDADO', 'PNP BORDADO INTERNO', 'PNP PREP GOLA E PUNHO', 'PNP PREP PARTES INF', 'PNP PREP PARTES SUP'],
    'PNP SEPARAR PECAS / UNIR CORPO E PTS',
    ['PNP DISTRIBUICAO INT', 'PNP DISTRIBUICAO EXT'],
    ['PNP AGUARD DEFINICAO COST INF', 'PNP AGUARD DEFINICAO COST SUP'],
    ['PNP COST SUP CAMISA', 'PNP COST SUP MALHA', 'PNP COST INF CALCA'],
    'PNP ACABAMENTO',
    'PNP AGUARD FINALIZACAO',
];

function normalizarLocalSequencia(v) {
    return String(v || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

// Monta {local normalizado -> posição} a partir da lista acima
function construirMapaPosicaoSequencia() {
    const mapa = {};
    SEQUENCIA_COMPLETA_LOCAIS.forEach((item, pos) => {
        (Array.isArray(item) ? item : [item]).forEach(nome => { mapa[normalizarLocalSequencia(nome)] = pos; });
    });
    return mapa;
}
const MAPA_POSICAO_SEQUENCIA = construirMapaPosicaoSequencia();
const POSICAO_MAXIMA_SEQUENCIA = SEQUENCIA_COMPLETA_LOCAIS.length - 1;

// Posição de um local na sequência — null se for um local que o usuário ainda
// não descreveu (existe na planilha mas não foi mapeado). Nesse caso é melhor
// admitir que não sabemos do que arriscar um palpite de posição errado.
function posicaoNaSequencia(nomeLocal) {
    const p = MAPA_POSICAO_SEQUENCIA[normalizarLocalSequencia(nomeLocal)];
    return p === undefined ? null : p;
}
// Setores mais próximos da mesa de corte de verdade — usados na coluna "Dias Fila Corte"
const CODIGOS_DIAS_FILA_CORTE = [3541, 106];

// 🏭 CLASSIFICAÇÃO DO LOCAL DE PRODUÇÃO (coluna "Local Obs." da planilha geral).
// O campo é texto livre e bem irregular (erros de digitação, espaçamento
// variado, recados embutidos), então classificamos em 4 grupos em vez de usar
// o texto cru:
//   INTERNO         -> começa com "INT" (corte e costura aqui dentro)
//   CORTE_EXTERNO   -> o texto menciona "CORTE" (ex: "GILBERTO CORTE E PRODUCAO").
//                      Essas OPs passam pelos setores iniciais só pra medir o
//                      tecido que vai ser enviado — NÃO são cortadas aqui.
//   COSTURA_EXTERNA -> só um nome de facção (ex: "SONIA"). São cortadas aqui
//                      dentro e só a costura sai — contam como produção interna.
//   SEM_INFO        -> campo vazio
const CLASSES_LOCAL_PRODUCAO = [
    { id: 'INTERNO', nome: 'Interno (INT)', cor: 'var(--cor-despacho)' },
    { id: 'COSTURA_EXTERNA', nome: 'Corte aqui, costura fora', cor: 'var(--cor-sugestao)' },
    { id: 'CORTE_EXTERNO', nome: 'Corte fora (só mede tecido aqui)', cor: 'var(--cor-alerta)' },
    { id: 'SEM_INFO', nome: 'Sem informação', cor: 'var(--cor-historico)' },
];

function classificarLocalProducao(valor) {
    const t = String(valor === undefined || valor === null ? '' : valor).trim().toUpperCase();
    if (!t) return 'SEM_INFO';
    if (t.startsWith('INT')) return 'INTERNO';
    if (t.includes('CORTE')) return 'CORTE_EXTERNO';
    return 'COSTURA_EXTERNA';
}

// Filtros da Fila de Corte, guardados por EXCLUSÃO (o que foi desmarcado).
// Guardar o que sai — em vez do que entra — faz com que um valor novo que
// apareça numa importação futura entre por padrão, em vez de sumir sem avisar.
let locaisProducaoExcluidos = [];
let tiposProdutoExcluidos = [];

function chaveLocalObs(v) { return String(v === undefined || v === null ? '' : v).trim().toUpperCase() || '(SEM INFO)'; }
function chaveTipoProduto(v) { return String(v === undefined || v === null ? '' : v).trim().toUpperCase() || '(SEM TIPO)'; }

function carregarFiltrosFilaCorte() {
    let salvo = null;
    try { salvo = JSON.parse(localStorage.getItem('filtrosFilaCorte') || 'null'); } catch (e) { salvo = null; }
    if (salvo && Array.isArray(salvo.locais) && Array.isArray(salvo.tipos)) {
        locaisProducaoExcluidos = salvo.locais;
        tiposProdutoExcluidos = salvo.tipos;
        return;
    }
    // Primeira vez: já deixa de fora o que vai ser cortado fora (o texto
    // menciona "CORTE"), que era o caso que motivou o filtro.
    locaisProducaoExcluidos = [...new Set(obterOPsFilaCorte()
        .map(o => chaveLocalObs(o.obs))
        .filter(k => k.includes('CORTE')))];
    tiposProdutoExcluidos = [];
}

function salvarFiltrosFilaCorte() {
    try { localStorage.setItem('filtrosFilaCorte', JSON.stringify({ locais: locaisProducaoExcluidos, tipos: tiposProdutoExcluidos })); } catch (e) { /* ignora */ }
}

function obterOPsFilaCorte() {
    try { return JSON.parse(localStorage.getItem('filaCorteOPs') || '[]'); } catch (e) { return []; }
}

function opPassaFiltroFilaCorte(o) {
    return !locaisProducaoExcluidos.includes(chaveLocalObs(o.obs))
        && !tiposProdutoExcluidos.includes(chaveTipoProduto(o.tipo));
}

// ⏱️ Utilitário de debounce — evita recalcular/re-renderizar a cada tecla digitada
function debounce(fn, delay = 250) {
    let temporizador;
    return function (...args) {
        clearTimeout(temporizador);
        temporizador = setTimeout(() => fn.apply(this, args), delay);
    };
}

const nomesEtapas = ["PROGRAMAÇÃO", "ANALISE DE MEDIDAS", "CAD", "PROG CORTE", "ALMOX TECIDOS", "DUBLAGEM", "ENFESTO", "CORTE"];
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

// Converte uma OP do formato usado no sistema (bancoDadosOPs) pro formato de
// colunas da tabela "ops" no Supabase (snake_case)
function opParaLinhaSupabase(op) {
    return {
        id: String(op.id), ciclo: op.ciclo || '', descricao: op.desc || '',
        qtd: parseInt(op.qtd) || 0, tempo_corte: parseFloat(op.tempoCorte) || 0,
        etapa: op.etapa, data_corte: op.dataCorte ? new Date(op.dataCorte).toISOString().slice(0, 10) : null,
        local_destino: op.localDestino || '', local_excel: op.localExcel || '',
        tem_dublado: !!op.temDublado,
        // A separação entre estrela manual e urgência da planilha ainda não
        // existe no cliente (fica pra uma etapa própria) — por enquanto os
        // dois lados da tabela recebem o mesmo valor.
        prioridade_urgencia: !!op.prioridade, prioridade_manual: !!op.prioridade,
        dias_local: parseInt(op.diasLocal) || 0, codigo_mp: op.codigoMP || '', desc_mp: op.descMP || '',
        referencia: op.referencia || '', sob_medida: !!op.sobMedida, laser: !!op.laser,
        data_finalizacao: op.dataFinalizacao ? new Date(op.dataFinalizacao).toISOString().slice(0, 10) : null,
        atualizado_em: new Date().toISOString()
    };
}

// Converte de volta: linha do Supabase -> formato usado no sistema
function linhaSupabaseParaOP(l) {
    return {
        id: l.id, ciclo: l.ciclo || '', desc: l.descricao || '', qtd: l.qtd || 0,
        tempoCorte: l.tempo_corte || 0, etapa: l.etapa, dataCorte: l.data_corte,
        localDestino: l.local_destino || '', localExcel: l.local_excel || '',
        temDublado: !!l.tem_dublado, prioridade: !!(l.prioridade_urgencia || l.prioridade_manual),
        dataEntradaEtapa: l.data_entrada_etapa, diasLocal: l.dias_local || 0,
        codigoMP: l.codigo_mp || '', descMP: l.desc_mp || '', referencia: l.referencia || '',
        sobMedida: !!l.sob_medida, laser: !!l.laser, dataFinalizacao: l.data_finalizacao,
        dataCorteSuposta: calcularDataCorteSuposta(l.data_finalizacao)
    };
}

async function verificarSessaoSupabase() {
    if (!supabaseClient) return;
    try {
        const { data } = await supabaseClient.auth.getSession();
        sessaoAdminAtual = data && data.session ? data.session : null;
        atualizarIndicadorLogin();
    } catch (e) {
        registrarLogDebug('error', ['Erro ao verificar sessão do Supabase: ' + e.message]);
    }
}

function atualizarIndicadorLogin() {
    const txt = $('txtLoginAdmin');
    if (!txt) return;
    if (sessaoAdminAtual) {
        txt.innerText = sessaoAdminAtual.user.email.split('@')[0].toUpperCase();
        $('btnLoginAdmin').title = 'Logado como admin — clique pra sair';
    } else {
        txt.innerText = 'VISITANTE';
        $('btnLoginAdmin').title = 'Entrar como admin';
    }
    aplicarRestricaoDeAbaVisitante();
}

// Sem login, só a aba Sequenciamento fica disponível — as outras somem do
// menu. Não é só estética: como as ações de edição já ficam bloqueadas de
// qualquer forma (exigirAdmin), deixar as outras abas visíveis só deixaria
// o visitante perdido clicando em telas que não fazem sentido pro papel dele.
const ABAS_LIBERADAS_PARA_VISITANTE = ['aba-sequenciamento', 'aba-necessidade'];
function abaLiberadaAgora(idAba) {
    return !!sessaoAdminAtual || ABAS_LIBERADAS_PARA_VISITANTE.includes(idAba);
}
function aplicarRestricaoDeAbaVisitante() {
    $$('.tab-btn').forEach(btn => {
        const idAba = btn.id.replace('abrirAba-', '');
        btn.style.display = abaLiberadaAgora(idAba) ? '' : 'none';
    });
    // Se a aba aberta agora não é mais permitida (ex: era admin e deslogou),
    // joga pra Sequenciamento em vez de deixar a tela numa aba escondida.
    const abaAtivaEl = document.querySelector('.aba-conteudo.ativa');
    if (abaAtivaEl && !abaLiberadaAgora(abaAtivaEl.id)) {
        abrirAba(null, 'aba-sequenciamento');
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
    atualizarIndicadorLogin();
    fecharModais();
    showToast("<i class='fas fa-check'></i> Login feito — você é admin agora.");
}

async function fazerLogoutAdmin() {
    if (!supabaseClient) return;
    await supabaseClient.auth.signOut();
    sessaoAdminAtual = null;
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

async function sincronizarTabelaSupabase(nomeTabela, linhas) {
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
        atualizado_em: new Date().toISOString()
    };
}
function linhaSupabaseParaPedido(l) {
    return { cliente: l.cliente || '', pedido: l.pedido, situacao: l.situacao || '', chegada: l.chegada, prior: l.prior === null ? 99 : l.prior, referencia: l.referencia || '', tam: l.tam || '', faltaProduzir: l.falta_produzir || 0 };
}

// A grade fica guardada agrupada por OP (objeto), mas a tabela do Supabase é
// linha por linha (uma por combinação OP+tamanho) — essas duas funções
// convertem de um formato pro outro, nos dois sentidos.
function gradesParaLinhasSupabase(gradesPorOP) {
    const linhas = [];
    for (const op in gradesPorOP) {
        const g = gradesPorOP[op];
        for (const tam in (g.tamanhos || {})) {
            linhas.push({
                id: `${op}|${tam}`, op, referencia: g.referencia || '', tam,
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
        if (!grades[l.op]) grades[l.op] = { referencia: l.referencia || '', tamanhos: {}, locaisPorTamanho: {} };
        grades[l.op].tamanhos[l.tam] = l.qtd || 0;
        if (l.locais && l.locais.length) grades[l.op].locaisPorTamanho[l.tam] = l.locais;
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
async function publicarTudoNoSupabase() {
    if (!supabaseClient) { showToast('Conexão com a nuvem não foi iniciada.', true); return; }
    if (!sessaoAdminAtual) { showToast('<i class="fas fa-lock"></i> Entre como admin primeiro.', true); return; }

    const status = $('statusPublicacaoSupabase');
    const pedidosAtuais = obterPedidosPendentes();
    const linhasGrade = gradesParaLinhasSupabase(obterGradesPorOP());
    const listaPrioridade = obterListaPrioridadeClientes();
    const linhasLocalizacao = sequenciaCompletaParaLinhasSupabase(obterSequenciaCompletaOPs());
    const todosOsPedidos = obterTodosPedidos().map(pedidoParaLinhaSupabase);
    if (!bancoDadosOPs.length && !pedidosAtuais.length && !linhasGrade.length && !linhasLocalizacao.length && !todosOsPedidos.length) { showToast('Nada pra publicar — sincronize primeiro.', true); return; }

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
        if (status) status.innerText = `Publicado às ${new Date().toLocaleTimeString('pt-BR')}`;
        showToast(`<i class="fas fa-cloud-upload-alt"></i> Publicado: ${resumo.join(' + ')}!`);
    } catch (e) {
        if (status) status.innerText = 'Falha ao publicar — veja o console de depuração';
        registrarLogDebug('error', ['Falha ao publicar no Supabase: ' + e.message]);
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
            // Os filtros (locais, datas) foram montados na abertura da página,
            // quando ainda não existia OP nenhuma (a nuvem responde depois).
            // Sem reconstruir agora, "locaisSelecionados" fica vazio pra
            // sempre — e filtro vazio nesse sistema significa "não mostra
            // nada", não "mostra tudo". Foi isso que deixou a tela vazia
            // mesmo com o dado certo por trás.
            inicializarFiltros();
            renderizarFiltroDataCorte();
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
        }
    } catch (e) {
        registrarLogDebug('error', ['Falha ao carregar todos os pedidos da nuvem: ' + e.message]);
    }
}

// Bloqueia uma ação se a pessoa não estiver logada como admin — chamada no
// COMEÇO de toda função que muda dado (sincronizar, importar, mover OP,
// etc). Sincronizar/editar sempre mexeu só no navegador de quem faz —
// nunca precisou de login pra isso. Mas deixar isso disponível pra quem só
// deveria estar visualizando é confuso (a pessoa mexe e nada realmente
// muda pros outros) — por isso passa a bloquear aqui, na origem da ação,
// e não só na hora de publicar.
function exigirAdmin(oQueIaFazer) {
    if (sessaoAdminAtual) return true;
    showToast(`<i class="fas fa-lock"></i> Modo visitante — entre como admin pra ${oQueIaFazer || 'fazer isso'}.`, true);
    return false;
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

// A aba de KPI/Gestão Mensal foi removida pra ser refeita do zero — mas duas
// coisas de FORA dela ainda leem esse dado (calcularMediaDiariaCorte, usada
// na Fila de Corte, e renderizarFluxoConsolidado, do Fluxo Geral). Um array
// vazio evita que essas duas quebrem; elas simplesmente mostram "sem dados"
// até o novo KPI existir e repor essa informação.
let dadosMes = [];

let locaisSelecionados = [], etapasSelecionadas = [], lastChecked = null, ordemCorteAsc = true, ultimaSugestao = 'pecas', ultimaSequenciaPedidosGerada = [];
let filaOrdenacaoCol = 'padrao', filaOrdenacaoAsc = true, filaGeralDadosGlobais = [];
let opContextoId = null, opFracionarOrigem = null;

// Seleção do montador de lote — guardada aqui (não só no checkbox da tela)
// pra sobreviver a mudanças de filtro. Antes, filtrar uma OP e depois trocar
// o filtro fazia a marcação sumir, porque a tabela é reconstruída do zero a
// cada filtro e o HTML não "lembra" de nada sozinho.
let selecaoLoteOPs = new Set();
let meuGraficoConsolidado = null; // usado só pelo Fluxo Geral
let pilhaUndo = [], pilhaRedo = []; const MAX_HISTORICO = 30;

let modoFluxoAtivo = 'acumulado';
function mudarModoFluxo(modo) {
    modoFluxoAtivo = modo;
    $('btn-fluxo-acumulado').style.background = modo === 'acumulado' ? 'var(--cor-selecao)' : 'transparent';
    $('btn-fluxo-diario').style.background = modo === 'diario' ? 'var(--cor-selecao)' : 'transparent';
    $('btn-fluxo-acumulado').style.color = modo === 'acumulado' ? '#333' : 'var(--texto-cor)';
    $('btn-fluxo-diario').style.color = modo === 'diario' ? '#333' : 'var(--texto-cor)';
    renderizarFluxoConsolidado();
}

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
function desfazerAcao() { if (pilhaUndo.length > 0) { pilhaRedo.push(JSON.stringify(bancoDadosOPs)); bancoDadosOPs = JSON.parse(pilhaUndo.pop()); localStorage.setItem('bancoOPs', JSON.stringify(bancoDadosOPs)); renderizarTudoImediato(); showToast("<i class='fas fa-undo'></i> Ação Desfeita"); } }
function refazerAcao() { if (pilhaRedo.length > 0) { pilhaUndo.push(JSON.stringify(bancoDadosOPs)); bancoDadosOPs = JSON.parse(pilhaRedo.pop()); localStorage.setItem('bancoOPs', JSON.stringify(bancoDadosOPs)); renderizarTudoImediato(); showToast("<i class='fas fa-redo'></i> Ação Refeita"); } }

function showToast(html, err = false) {
    let t = $('toast-atalhos'); if (!t) { t = document.createElement('div'); t.id = 'toast-atalhos'; t.style.cssText = 'position:fixed; bottom:20px; left:50%; transform:translateX(-50%); color:white; padding:12px 25px; border-radius:30px; font-weight:800; font-size:14px; z-index:10000; transition:all 0.3s; opacity:0; pointer-events:none; display:flex; gap:10px; align-items:center;'; document.body.appendChild(t); }
    t.style.background = err ? 'var(--cor-alerta)' : 'var(--cor-sugestao)'; t.innerHTML = html; t.style.opacity = '1'; t.style.bottom = '40px';
    clearTimeout(t.timer); t.timer = setTimeout(() => { t.style.opacity = '0'; t.style.bottom = '20px'; }, 2000);
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
        const abas = { '1': 'aba-programacao', '2': 'aba-fila', '3': 'aba-fluxo-consolidado' };
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
    const op = bancoDadosOPs.find(o => o.id === id); if (!op) return;
    const tt = $('tooltip-op');
    let alertaAtraso = '';
    if (op.dataCorte && new Date(op.dataCorte) < new Date(new Date().setHours(0, 0, 0, 0))) alertaAtraso = `<div style="margin-top:6px; background:rgba(193, 68, 78, 0.1); padding:4px 8px; border-radius:4px; color:var(--cor-alerta); font-size:11px; font-weight:900; display:inline-block;"><i class="fas fa-exclamation-triangle"></i> ATRASADO</div>`;

    // Grade por tamanho, se a planilha de grades já foi importada pra essa OP
    let gradeHtml = '';
    try {
        const grades = obterGradesPorOP();
        const gradeOP = grades[op.id];
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
        }
    } catch (err) { /* se a leitura falhar, só não mostra a grade — não trava o tooltip */ }

    // Pedidos que essa OP ajuda a fechar (referência em comum, ainda com falta)
    let pedidosHtml = '';
    try {
        const matches = pedidosQueEssaOPFecha(op);
        if (matches.length) {
            const MOSTRAR = 3;
            const linhas = matches.slice(0, MOSTRAR).map(m => {
                const selo = m.cobre === true ? '<i class="fas fa-check" style="color:var(--cor-despacho);"></i>' : m.cobre === false ? '<i class="fas fa-triangle-exclamation" style="color:var(--cor-alerta);" title="Grade dessa OP não tem esse tamanho"></i>' : '';
                return `<div style="font-size:11px;">${selo} <strong>${m.pedido}</strong> — ${m.tam}: falta ${m.faltaProduzir} <span style="color:var(--texto-secundario);">(${m.cliente})</span></div>`;
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
            <div><span class="lbl">Ciclo:</span> <strong>${op.ciclo}</strong></div>
            <div><span class="lbl">Destino:</span> <strong>${op.localDestino}</strong></div>
            <div><span class="lbl">Setor Atual:</span> <strong style="color:var(--cor-sugestao);">${op.localExcel || 'N/D'}</strong></div>
            <div><span class="lbl">Peças:</span> <strong style="color:var(--cor-selecao); font-size:14px;">${op.qtd}</strong></div>
            <div><span class="lbl">Tempo:</span> <strong style="color:var(--cor-alerta);">${Number(op.tempoCorte).toFixed(1)} min</strong></div>
            <div><span class="lbl">Dublagem:</span> <strong>${op.temDublado ? 'SIM' : 'NÃO'}</strong></div>
            <div><span class="lbl">Dias Parada:</span> <strong style="color:var(--cor-alerta);">${op.diasLocal || 0} dias</strong></div>
            ${op.dataCorteSuposta && formatarDataBR(op.dataCorteSuposta) ? `<div><span class="lbl">Corte Suposto:</span> <strong style="color:var(--cor-roxo);" title="Calculado de trás pra frente a partir da data de finalização no estoque (${formatarDataBR(op.dataFinalizacao)}), descontando ~22 dias de etiquetação+distribuição+estoque. É uma estimativa, não um compromisso.">${formatarDataBR(op.dataCorteSuposta)} <i class="fas fa-circle-question" style="font-size:10px;"></i></strong></div>` : ''}
            ${gradeHtml}
            ${pedidosHtml}
            ${alertaAtraso}
            <div style="margin-top:10px; padding-top:10px; border-top:1px dashed var(--borda-cor); color:var(--texto-secundario); font-style:italic;">${op.desc}</div>
        </div>
    `;
    tt.style.display = 'block'; setTimeout(() => tt.style.opacity = '1', 10);
}
function esconderTooltipOP() { const tt = $('tooltip-op'); if (!tt) return; tt.style.opacity = '0'; tt.style.display = 'none'; }

// MODAIS E MENUS
function fecharModais() { $('ctxMenu').style.display = 'none'; $('omniSearchOverlay').style.display = 'none'; $('modalFracionarOverlay').style.display = 'none'; $('modalGargalo').style.display = 'none'; $('modalPrioridadeClientes').style.display = 'none'; $('modalSequenciaPedidos').style.display = 'none'; $('modalSequenciamentoFifo').style.display = 'none'; $('modalGuiaSequenciamento').style.display = 'none'; $('modalAgrupamentoReferencia').style.display = 'none'; $('modalBalancoSincronizacao').style.display = 'none'; $('modalGuiaSistema').style.display = 'none'; $('modalLoginAdmin').style.display = 'none'; }

// =========================================================================
// 👑 PRIORIDADE DE CLIENTES — lista editável, do mais pro menos prioritário.
// Usada só como critério de DESEMPATE entre pedidos que vencem dentro da
// mesma janela de urgência (7 dias) — fora dessa janela, a data manda sozinha.
// =========================================================================
const LISTA_PRIORIDADE_CLIENTES_PADRAO = [
    "Tejofran", "G4S", "Protege", "Sam's", "Brinks", "Security", "Porto Seguro",
    "Carrefour", "Atacadão", "Prosegur e Segurpro", "Nestlé", "GR", "Rede D'Or",
    "Richet", "Haganá", "Santa Catarina", "Ipiranga", "Mais Barato", "Sodexo",
    "Belfort", "CVC", "Viação Cometa"
];

function obterListaPrioridadeClientes() {
    const salva = localStorage.getItem('listaPrioridadeClientes');
    if (salva) { try { return JSON.parse(salva); } catch (e) { return [...LISTA_PRIORIDADE_CLIENTES_PADRAO]; } }
    return [...LISTA_PRIORIDADE_CLIENTES_PADRAO];
}

function salvarListaPrioridadeClientes(lista) {
    localStorage.setItem('listaPrioridadeClientes', JSON.stringify(lista));
}

function abrirModalPrioridadeClientes() {
    renderizarModalPrioridadeClientes();
    $('modalPrioridadeClientes').style.display = 'flex';
}

function renderizarModalPrioridadeClientes() {
    const lista = obterListaPrioridadeClientes();
    const linhas = lista.map((cliente, i) => `
        <div style="display:flex; align-items:center; gap:10px; padding:8px 12px; border-bottom:1px solid var(--borda-cor);">
            <span style="width:28px; text-align:center; font-weight:900; color:var(--texto-secundario);">${i + 1}º</span>
            <span style="flex:1; font-weight:600;">${cliente}</span>
            <button onclick="moverClientePrioridade(${i}, -1)" class="btn" style="padding:4px 8px; background:var(--bg-painel); color:var(--texto-cor);" ${i === 0 ? 'disabled' : ''}><i class="fas fa-arrow-up"></i></button>
            <button onclick="moverClientePrioridade(${i}, 1)" class="btn" style="padding:4px 8px; background:var(--bg-painel); color:var(--texto-cor);" ${i === lista.length - 1 ? 'disabled' : ''}><i class="fas fa-arrow-down"></i></button>
            <button onclick="removerClientePrioridade(${i})" class="btn btn-perigo" style="padding:4px 8px;"><i class="fas fa-trash"></i></button>
        </div>
    `).join('');

    $('modalPrioridadeClientes').innerHTML = `
        <div class="modal-card" style="width:480px; max-width:90vw; border-top:5px solid #B8862A; max-height:85vh;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; border-bottom:2px solid var(--borda-cor); padding-bottom:10px;">
                <h2 style="margin:0; color:var(--texto-cor); display:flex; align-items:center; gap:10px; font-size:16px;">
                    <i class="fas fa-crown" style="color:#B8862A;"></i> PRIORIDADE DE CLIENTES
                </h2>
                <button onclick="fecharModais()" class="modal-fechar-btn"><i class="fas fa-times"></i></button>
            </div>
            <div style="font-size:12px; color:var(--texto-secundario); margin-bottom:15px;">
                Do mais prioritário pro menos prioritário. Usado só pra desempatar quando dois pedidos vencem dentro da mesma semana — fora disso, a data mais próxima sempre vence.
            </div>
            <div style="overflow-y:auto; flex:1; margin-bottom:15px; border:1px solid var(--borda-cor); border-radius:8px;">
                ${linhas || '<div style="padding:20px; text-align:center; color:var(--texto-secundario);">Nenhum cliente cadastrado.</div>'}
            </div>
            <div style="display:flex; gap:10px;">
                <input type="text" id="inputNovoClientePrioridade" placeholder="Nome do cliente..." style="flex:1;">
                <button onclick="adicionarClientePrioridade()" class="btn btn-sugestao"><i class="fas fa-plus"></i> ADICIONAR</button>
            </div>
        </div>
    `;
}

function moverClientePrioridade(idx, direcao) {
    const lista = obterListaPrioridadeClientes();
    const novoIdx = idx + direcao;
    if (novoIdx < 0 || novoIdx >= lista.length) return;
    [lista[idx], lista[novoIdx]] = [lista[novoIdx], lista[idx]];
    salvarListaPrioridadeClientes(lista);
    renderizarModalPrioridadeClientes();
}

function removerClientePrioridade(idx) {
    if (!exigirAdmin('editar a prioridade de clientes')) return;
    const lista = obterListaPrioridadeClientes();
    if (!confirm(`Remover "${lista[idx]}" da lista de prioridade?`)) return;
    lista.splice(idx, 1);
    salvarListaPrioridadeClientes(lista);
    renderizarModalPrioridadeClientes();
}

function adicionarClientePrioridade() {
    if (!exigirAdmin('editar a prioridade de clientes')) return;
    const input = $('inputNovoClientePrioridade');
    const nome = input.value.trim();
    if (!nome) return;
    const lista = obterListaPrioridadeClientes();
    if (lista.some(c => c.toLowerCase() === nome.toLowerCase())) { alert("Esse cliente já está na lista."); return; }
    lista.push(nome);
    salvarListaPrioridadeClientes(lista);
    renderizarModalPrioridadeClientes();
}
function abrirBuscaGlobal() { $('omniSearchOverlay').style.display = 'flex'; $('omniInput').value = ''; $('omniResults').innerHTML = ''; setTimeout(() => $('omniInput').focus(), 100); }

function pesquisaOmni() {
    const termo = $('omniInput').value.trim().toLowerCase(); const res = $('omniResults'); if (termo.length < 2) { res.innerHTML = ''; return; }
    const encontradas = bancoDadosOPs.filter(o =>
        `${o.ciclo}-${o.id}`.toLowerCase().includes(termo) ||
        `${o.ciclo} ${o.id}`.toLowerCase().includes(termo) ||
        o.id.toLowerCase().includes(termo) ||
        o.ciclo.toLowerCase().includes(termo) ||
        (o.referencia && o.referencia.toLowerCase().includes(termo))
    );
    const LIMITE_RESULTADOS = 50;
    const avisoLimite = encontradas.length > LIMITE_RESULTADOS
        ? `<div style="text-align:center; padding:8px; font-size:11px; color:var(--texto-secundario);">Mostrando ${LIMITE_RESULTADOS} de ${encontradas.length} resultados — refine a busca pra ver menos.</div>`
        : '';
    res.innerHTML = encontradas.slice(0, LIMITE_RESULTADOS).map(op => `
        <div class="omni-item" onclick="abrirAba(null,'aba-programacao'); fecharModais(); setTimeout(()=>alert('OP Localizada:\\n${op.id} - ${nomesEtapas[op.etapa]}'), 300);">
            <div><strong style="color:var(--texto-cor); font-size:16px;">OP: ${op.id}</strong> <span style="font-size:11px; color:var(--texto-secundario);">(Ciclo ${op.ciclo}${op.referencia ? ' · Ref. ' + op.referencia : ''})</span><div style="font-size:12px; margin-top:4px;">${op.desc.substring(0, 40)}</div></div>
            <div style="text-align:right;"><span class="pill" style="background:var(--cor-sugestao);">${nomesEtapas[op.etapa]}</span><div style="font-size:11px; margin-top:4px;">${op.qtd} pçs | Local: ${op.localDestino}</div></div>
        </div>`).join('') + avisoLimite;
}

function mostrarMenuContexto(e, id) { e.preventDefault(); e.stopPropagation(); opContextoId = id; const m = $('ctxMenu'); m.style.display = 'block'; m.style.left = Math.min(e.pageX, window.innerWidth - 220) + 'px'; m.style.top = e.pageY + 'px'; }

document.addEventListener('click', e => {
    if (!e.target.closest('#ctxMenu')) $('ctxMenu').style.display = 'none';
    const dentroDropdown = e.target.closest('.dropdown-container');
    if (!dentroDropdown || e.target.closest('.dropdown-menu .btn, .dropdown-menu label')) {
        $$('.dropdown-menu.aberto').forEach(m => m.classList.remove('aberto'));
    }
    // fecha as listas de marcar (locais, etapas, local de produção, tipo)
    if (!e.target.closest('.multi-select-container')) {
        $$('.multi-select-options').forEach(o => { o.style.display = 'none'; });
    }
});

// Abre/fecha um menu suspenso do cabeçalho, fechando qualquer outro que já
// estivesse aberto (evita dois menus abertos ao mesmo tempo).
function toggleDropdown(id) {
    const menu = $(id);
    const jaAberto = menu.classList.contains('aberto');
    $$('.dropdown-menu.aberto').forEach(m => m.classList.remove('aberto'));
    if (!jaAberto) menu.classList.add('aberto');
}

function ctxAcao(acao) {
    if (!opContextoId) return; let op = bancoDadosOPs.find(o => o.id === opContextoId); if (!op) return;
    if (acao === 'copiar') { navigator.clipboard.writeText(op.id); $('ctxMenu').style.display = 'none'; return; }
    if (!exigirAdmin('mexer nas OPs')) { $('ctxMenu').style.display = 'none'; return; }
    if (acao === 'prioridade') { registrarEstado(); op.prioridade = !op.prioridade; localStorage.setItem('bancoOPs', JSON.stringify(bancoDadosOPs)); renderizarTudoImediato(); }
    else if (acao === 'avancar') avancarEtapaOP(op.id);
    else if (acao === 'fracionar') abrirModalFracionar(op.id);
    $('ctxMenu').style.display = 'none';
}

function abrirModalFracionar(id) {
    opFracionarOrigem = bancoDadosOPs.find(o => o.id === id); if (!opFracionarOrigem || opFracionarOrigem.qtd <= 1) return alert("Não pode fracionar 1 peça.");
    $('fracOpId').innerText = opFracionarOrigem.id; $('fracTotalPcs').innerText = opFracionarOrigem.qtd; $('fracTotalTempo').innerText = opFracionarOrigem.tempoCorte;
    const s = $('fracSlider'); s.min = 1; s.max = opFracionarOrigem.qtd - 1; s.value = Math.floor(opFracionarOrigem.qtd / 2);
    $('modalFracionarOverlay').style.display = 'flex'; $('ctxMenu').style.display = 'none'; atualizarFracao();
}
function atualizarFracao() {
    const q1 = parseInt($('fracSlider').value), q2 = opFracionarOrigem.qtd - q1;
    const t1 = ((q1 / opFracionarOrigem.qtd) * opFracionarOrigem.tempoCorte).toFixed(1), t2 = (opFracionarOrigem.tempoCorte - t1).toFixed(1);
    $('fracPcs1').innerText = q1 + " pçs"; $('fracTempo1').innerText = t1 + " min"; $('fracPcs2').innerText = q2 + " pçs"; $('fracTempo2').innerText = t2 + " min";
}
function confirmarFracionamento() {
    if (!exigirAdmin('fracionar a OP')) return;
    registrarEstado(); const q1 = parseInt($('fracSlider').value), q2 = opFracionarOrigem.qtd - q1;
    const t1 = parseFloat(((q1 / opFracionarOrigem.qtd) * opFracionarOrigem.tempoCorte).toFixed(1)), t2 = parseFloat((opFracionarOrigem.tempoCorte - t1).toFixed(1));
    const base = opFracionarOrigem.id.split('-K')[0], rx = new RegExp(`^${base}-K(\\d+)$`); let mx = 0;
    bancoDadosOPs.forEach(o => { if (o.id === base) mx = Math.max(mx, 1); const m = o.id.match(rx); if (m) mx = Math.max(mx, parseInt(m[1])); });
    let op2 = JSON.parse(JSON.stringify(opFracionarOrigem)); op2.id = `${base}-K${mx > 0 ? mx + 2 : 2}`; op2.qtd = q2; op2.tempoCorte = t2;
    opFracionarOrigem.id = `${base}-K${mx > 0 ? mx + 1 : 1}`; opFracionarOrigem.qtd = q1; opFracionarOrigem.tempoCorte = t1;
    bancoDadosOPs.push(op2); localStorage.setItem('bancoOPs', JSON.stringify(bancoDadosOPs)); fecharModais(); renderizarTudoImediato();
}

// 🔀 Regra da etapa de DUBLAGEM (etapa 5): só se aplica a OPs marcadas com temDublado.
// Centralizado aqui porque essa regra era checada em 2 lugares diferentes do código
// (avanço de etapa e cálculo de prazo) — se um dia mudar, só precisa mexer aqui.
function etapaEhAplicavel(idxEtapa, op) {
    return !(idxEtapa === 5 && !op.temDublado);
}
function proximaEtapa(etapaAtual, op) {
    let prox = etapaAtual + 1;
    if (!etapaEhAplicavel(prox, op)) prox++;
    return prox;
}
function avancarEtapaOP(id) { if (!exigirAdmin('avançar etapa')) return; let op = bancoDadosOPs.find(o => o.id === id); if (op && op.etapa < 7) { registrarEstado(); op.etapa = proximaEtapa(op.etapa, op); op.dataEntradaEtapa = new Date(); localStorage.setItem('bancoOPs', JSON.stringify(bancoDadosOPs)); renderizarTudoImediato(); } }

// GESTÃO DE DADOS EXCEL E TEMPO
function extrairDataExcel(valorData) {
    if (!valorData) return null;
    if (valorData instanceof Date) { if (valorData.getFullYear() > 2000) return valorData; return null; }
    if (typeof valorData === 'number' && valorData > 40000 && valorData < 60000) {
        let dt = new Date(Math.round((valorData - 25569) * 86400 * 1000));
        dt = new Date(dt.getTime() + dt.getTimezoneOffset() * 60000);
        if (dt.getFullYear() > 2000) return dt; return null;
    }
    if (typeof valorData === 'string') {
        let v = valorData.trim();
        let m1 = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (m1) { let dt = new Date(parseInt(m1[1]), parseInt(m1[2]) - 1, parseInt(m1[3])); if (dt.getFullYear() > 2000) return dt; }
        let m2 = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
        if (m2) { let ano = parseInt(m2[3]); if (ano < 100) ano += 2000; let dt = new Date(ano, parseInt(m2[2]) - 1, parseInt(m2[1])); if (dt.getFullYear() > 2000) return dt; }
    }
    return null;
}

function adicionarDiasUteis(dataOriginal, diasUteis) {
    let d = new Date(dataOriginal.getTime()), dias = 0;
    while (dias < diasUteis) { d.setUTCDate(d.getUTCDate() + 1); let diaSemana = d.getUTCDay(); if (diaSemana !== 0 && diaSemana !== 6) dias++; }
    return d;
}

function diffDiasCorridos(d1, d2) {
    if (!d1 || !d2) return null;
    let diff = new Date(d2).setUTCHours(0, 0, 0, 0) - new Date(d1).setUTCHours(0, 0, 0, 0);
    return Math.max(0, Math.round(diff / (1000 * 60 * 60 * 24)));
}

function processarExcel() {
    if (!exigirAdmin('sincronizar a planilha')) return;
    const input = $('inputExcel'); if (!input.files[0]) return alert("Selecione um arquivo!");
    const r = new FileReader();
    r.onload = function (e) {
      try {
        registrarEstado();
        const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array', cellDates: true });
        let urg = new Set(); const nUrg = wb.SheetNames.find(n => n.toUpperCase().includes('URGENCIA'));
        if (nUrg) {
            const lUrg = XLSX.utils.sheet_to_json(wb.Sheets[nUrg], { header: 1 });
            let idX = -1;
            if (lUrg.length > 0) {
                lUrg[0].forEach((c, i) => {
                    const cUp = String(c || '').trim().toUpperCase();
                    // aceita "OP" exato (formato antigo) ou qualquer cabeçalho que
                    // contenha "OP" (ex: "Num.\r\nOp", formato mais novo) — sem essa
                    // tolerância, a coluna não batia e caía num índice fixo errado
                    if (cUp === 'OP' || cUp.includes('OP')) idX = i;
                });
            }
            if (idX === -1) idX = 4;
            for (let i = 1; i < lUrg.length; i++) if (lUrg[i] && lUrg[i][idX]) urg.add(String(lUrg[i][idX]).trim());
        }

        // Aba "BASE" — a "Descrição OP" (coluna Y) indica se a OP é feita SOB
        // MEDIDA (contém "SBM" no texto). OPs sob medida não devem ser
        // sugeridas em agrupamentos por referência, já que cada uma é única.
        // A coluna "Finalização" (P) traz a data de finalização no estoque,
        // quando já vem preenchida — usada pra calcular a data SUPOSTA de
        // corte (de trás pra frente, ver DIAS_*_ATE_* logo abaixo).
        let mapaSBM = new Set();
        let mapaFinalizacao = new Map();
        const nBase = wb.SheetNames.find(n => n.toUpperCase().includes('BASE'));
        if (nBase) {
            const lBase = XLSX.utils.sheet_to_json(wb.Sheets[nBase], { header: 1 });
            if (lBase.length > 0) {
                let idxOPBase = -1, idxDescBase = -1, idxFinalizacao = -1;
                lBase[0].forEach((c, i) => {
                    const cUp = String(c || '').trim().toUpperCase();
                    if (cUp === 'OP') idxOPBase = i;
                    if (cUp.includes('DESCRI') && cUp.includes('OP')) idxDescBase = i;
                    if (cUp === 'FINALIZAÇÃO' || cUp === 'FINALIZACAO') idxFinalizacao = i; // exato, pra não bater com "DATA FINALIZAÇÃO" (outra coluna, logo depois)
                });
                if (idxOPBase === -1) idxOPBase = 6; // coluna G, se o cabeçalho não bater
                if (idxDescBase === -1) idxDescBase = 24; // coluna Y, se o cabeçalho não bater
                if (idxFinalizacao === -1) idxFinalizacao = 15; // coluna P, se o cabeçalho não bater
                for (let i = 1; i < lBase.length; i++) {
                    const linha = lBase[i]; if (!linha || !linha[idxOPBase]) continue;
                    const opIdBase = String(linha[idxOPBase]).trim();
                    const descOP = String(linha[idxDescBase] || '').toUpperCase();
                    if (descOP.includes('SBM')) mapaSBM.add(opIdBase);
                    const dtFinalizacao = extrairDataExcel(linha[idxFinalizacao]);
                    if (dtFinalizacao) mapaFinalizacao.set(opIdBase, dtFinalizacao);
                }
            }
        }

        const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
        let mapA = {}; bancoDadosOPs.forEach(o => mapA[o.id] = o); bancoDadosOPs = [];
        const sincronizacaoInicial = Object.keys(mapA).length === 0; // primeira vez que sincroniza nesse navegador
        let movimentacoes = []; // OPs que trocaram de etapa nessa sincronização


        for (let i = 1; i < rows.length; i++) {
            const r = rows[i]; if (!r) continue;

            // LÓGICA DE CRIAÇÃO DO BANCO DE DADOS (Mantida igual a sua original)
            if (r[5] && !['OP', 'ORDEM'].includes(String(r[5]).trim().toUpperCase())) {
                const loc = (r[21] ? String(r[21]).toUpperCase() : "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
                let idxE = -1;
                if (loc.includes("CORTE") && !loc.includes("PROG") && !loc.includes("ENFESTO")) idxE = 7; else if (loc.includes("ENFESTO")) idxE = 6; else if (loc.includes("DUBLA")) idxE = 5; else if (loc.includes("ALMOX") && loc.includes("TECIDO")) idxE = 4; else if (loc.includes("PROG") && loc.includes("CORTE")) idxE = 3; else if (loc.includes("CAD")) idxE = 2; else if (loc.includes("ANALISE") || loc.includes("MEDIDA")) idxE = 1; else if (loc.includes("PROGRAMACAO")) idxE = 0;

                if (idxE !== -1) {
                    const idOP = String(r[5]), old = mapA[idOP];
                    if (old && old.etapa !== idxE) movimentacoes.push({ id: idOP, ciclo: String(r[4] || ""), deIdx: old.etapa, paraIdx: idxE });
                    bancoDadosOPs.push({
                        id: idOP, ciclo: String(r[4] || ""), desc: String(r[3] || ""),
                        qtd: parseInt(r[6]) || 0, tempoCorte: parseFloat(r[7]) || 0,
                        etapa: idxE, dataCorte: extrairDataExcel(r[23]), // coluna X (antes era P/15)
                        localDestino: r[17] ? String(r[17]).trim().toUpperCase() : "N/D",
                        localExcel: r[21] ? String(r[21]).trim().toUpperCase() : "",
                        temDublado: r[18] ? String(r[18]).toUpperCase().includes("SIM") : false,
                        prioridade: urg.has(idOP), // só o que está na aba URGENCIAS agora — antes carregava a marcação antiga (|| old.prioridade), e como nunca limpava, foi acumulando sincronização após sincronização
                        dataEntradaEtapa: (old && old.etapa === idxE && old.dataEntradaEtapa) ? old.dataEntradaEtapa : new Date(),
                        diasLocal: parseInt(r[25]) || 0,
                        codigoMP: r[38] ? String(r[38]).trim().toUpperCase() : "SEM CÓDIGO",
                        descMP: r[39] ? String(r[39]).trim().toUpperCase() : "🔍 COLUNA VAZIA",
                        referencia: r[40] ? String(r[40]).trim().toUpperCase() : "", // coluna AO
                        sobMedida: mapaSBM.has(idOP), // aba BASE, coluna Y ("Descrição OP" contém "SBM")
                        laser: r[41] ? String(r[41]).trim().toUpperCase().includes('LASER') : false, // coluna AP
                        dataFinalizacao: mapaFinalizacao.get(idOP) || null, // aba BASE, coluna P
                        dataCorteSuposta: calcularDataCorteSuposta(mapaFinalizacao.get(idOP))
                    });
                }
            }

        }

        // Grava as OPs e finaliza a importação
        localStorage.setItem('bancoOPs', JSON.stringify(bancoDadosOPs));
        inicializarFiltros();
        renderizarFiltroDataCorte();
        renderizarTudoImediato();

        input.value = '';
        registrarAtualizacao('bancoOPs'); atualizarIndicadoresDeAtualizacao();
        showToast("<i class='fas fa-check-double'></i> Planilha e OTD atualizados!");

        // Painel de balanço: quem mudou de setor, quem é novo, quem saiu da
        // planilha — só faz sentido comparar se já existia uma sincronização
        // anterior pra comparar contra.
        if (!sincronizacaoInicial) {
            const idsNovos = new Set(bancoDadosOPs.map(o => o.id));
            const entradas = bancoDadosOPs.filter(o => !mapA[o.id]);
            const saidas = Object.keys(mapA).filter(id => !idsNovos.has(id)).map(id => ({ id, ciclo: mapA[id].ciclo, deIdx: mapA[id].etapa }));
            exibirBalancoSincronizacao(movimentacoes, entradas, saidas);
        }
      } catch (err) {
        console.error('Erro ao processar Excel:', err);
        alert("❌ Não foi possível processar a planilha.\n\nVerifique se o arquivo está no formato esperado (colunas e abas corretas) e tente novamente.\n\nDetalhe técnico: " + err.message);
        input.value = '';
      }
    };
    r.readAsArrayBuffer(input.files[0]);
}

// =========================================================================
// 🔀 BALANÇO DE SINCRONIZAÇÃO — mostra, logo depois de sincronizar, quais OPs
// trocaram de setor desde a última vez, quais são novas, e quais saíram da
// planilha (normalmente porque finalizaram o corte e seguiram pra costura).
// =========================================================================
function exibirBalancoSincronizacao(movimentacoes, entradas, saidas) {
    if (movimentacoes.length === 0 && entradas.length === 0 && saidas.length === 0) {
        $('modalBalancoSincronizacao').innerHTML = `
            <div class="modal-card" style="width:480px; max-width:90vw; border-top:5px solid var(--cor-despacho);">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; border-bottom:2px solid var(--borda-cor); padding-bottom:10px;">
                    <h2 style="margin:0; color:var(--texto-cor); display:flex; align-items:center; gap:10px; font-size:16px;"><i class="fas fa-check-circle" style="color:var(--cor-despacho);"></i> BALANÇO DA SINCRONIZAÇÃO</h2>
                    <button onclick="fecharModais()" class="modal-fechar-btn"><i class="fas fa-times"></i></button>
                </div>
                <div style="text-align:center; padding:20px; color:var(--texto-secundario);">Nenhuma movimentação desde a última sincronização — tudo igual.</div>
            </div>`;
        $('modalBalancoSincronizacao').style.display = 'flex';
        return;
    }

    // Agrupa as movimentações por par (de -> para), juntando os números das OPs
    const grupos = new Map();
    movimentacoes.forEach(m => {
        const chave = `${m.deIdx}|${m.paraIdx}`;
        if (!grupos.has(chave)) grupos.set(chave, { deIdx: m.deIdx, paraIdx: m.paraIdx, ops: [] });
        grupos.get(chave).ops.push(m);
    });
    const gruposOrdenados = [...grupos.values()].sort((a, b) => b.ops.length - a.ops.length);

    const movimentacoesHtml = gruposOrdenados.map(g => `
        <div style="border-left:4px solid var(--cor-sugestao); background:var(--bg-painel); border-radius:8px; padding:12px; margin-bottom:10px;">
            <div style="font-size:12px; font-weight:700; margin-bottom:6px; display:flex; align-items:center; gap:8px;">
                <span class="pill" style="background:var(--cor-historico);">${nomesEtapas[g.deIdx]}</span>
                <i class="fas fa-arrow-right" style="color:var(--texto-secundario);"></i>
                <span class="pill" style="background:var(--cor-sugestao);">${nomesEtapas[g.paraIdx]}</span>
                <span style="color:var(--texto-secundario); font-weight:400;">(${g.ops.length} OP${g.ops.length > 1 ? 's' : ''})</span>
            </div>
            <div>${g.ops.map(m => `<span class="pill" style="background:var(--bg-card); border:1px solid var(--borda-cor); color:var(--texto-cor); margin:2px 3px 0 0; display:inline-block;">${m.id}${m.ciclo ? ' · ' + m.ciclo : ''}</span>`).join('')}</div>
        </div>
    `).join('');

    const entradasHtml = entradas.length === 0 ? '' : `
        <div style="margin-top:14px;">
            <div style="font-size:12px; font-weight:700; color:var(--cor-despacho); margin-bottom:6px;"><i class="fas fa-plus-circle"></i> NOVAS NA PLANILHA (${entradas.length})</div>
            <div>${entradas.map(o => `<span class="pill pill-ok" style="margin:2px 3px 0 0; display:inline-block;">${o.id} · ${nomesEtapas[o.etapa]}</span>`).join('')}</div>
        </div>`;

    const saidasHtml = saidas.length === 0 ? '' : `
        <div style="margin-top:14px;">
            <div style="font-size:12px; font-weight:700; color:var(--texto-secundario); margin-bottom:6px;"><i class="fas fa-sign-out-alt"></i> SAÍRAM DA PLANILHA (${saidas.length}) <span style="font-weight:400;">— provavelmente terminaram o corte e seguiram pra costura</span></div>
            <div>${saidas.map(o => `<span class="pill" style="background:var(--cor-historico); margin:2px 3px 0 0; display:inline-block;">${o.id} · estava em ${nomesEtapas[o.deIdx]}</span>`).join('')}</div>
        </div>`;

    $('modalBalancoSincronizacao').innerHTML = `
        <div class="modal-card" style="width:640px; max-width:92vw; border-top:5px solid var(--cor-sugestao); max-height:85vh;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; border-bottom:2px solid var(--borda-cor); padding-bottom:10px; flex-shrink:0;">
                <h2 style="margin:0; color:var(--texto-cor); display:flex; align-items:center; gap:10px; font-size:16px;"><i class="fas fa-right-left" style="color:var(--cor-sugestao);"></i> BALANÇO DA SINCRONIZAÇÃO</h2>
                <button onclick="fecharModais()" class="modal-fechar-btn"><i class="fas fa-times"></i></button>
            </div>
            <div style="overflow-y:auto; flex:1;">
                ${movimentacoesHtml || '<div style="text-align:center; padding:10px; color:var(--texto-secundario); font-size:12px;">Nenhuma OP trocou de setor.</div>'}
                ${entradasHtml}
                ${saidasHtml}
            </div>
        </div>`;
    $('modalBalancoSincronizacao').style.display = 'flex';
}
// só que com a grade P/M/G/GG etc. de cada uma). Formato: uma linha por
// tamanho (OP + Referência + Tamanho + Qtd), casando pelo número da OP.
// Colunas detectadas pelo texto do cabeçalho, não por posição fixa — assim
// não depende de estarem sempre na mesma ordem/coluna do Excel.
// =========================================================================
function processarGrades() {
    if (!exigirAdmin('importar a grade')) return;
    const input = $('inputGrades'); if (!input.files[0]) return;
    const r = new FileReader();
    r.onload = function (e) {
        try {
            const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
            const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
            if (!rows.length) throw new Error("Planilha vazia.");

            const cab = rows[0].map(c => String(c || '').trim().toUpperCase());
            const idxOP = cab.findIndex(c => c === 'OP' || c.startsWith('OP '));
            const idxRef = cab.findIndex(c => c.includes('REFER') && !c.includes('DESCRI'));
            const idxTam = cab.findIndex(c => c === 'TAM' || c.startsWith('TAM'));
            const idxQtd = cab.findIndex(c => c.includes('QTD') || c.includes('QUANT') || c.includes('QT '));
            const idxLocal = cab.findIndex(c => c.includes('DESCRI') && c.includes('LOCAL'));
            const idxLocalFallback = idxLocal !== -1 ? idxLocal : cab.findIndex(c => c === 'LOCAL');

            if (idxOP === -1 || idxRef === -1 || idxTam === -1 || idxQtd === -1) {
                throw new Error("Não encontrei as colunas OP, Referência, Tamanho e Qtd no cabeçalho da planilha (primeira linha).");
            }

            const grades = {};
            let linhasLidas = 0;
            for (let i = 1; i < rows.length; i++) {
                const row = rows[i]; if (!row || !row[idxOP]) continue;
                const opId = String(row[idxOP]).trim();
                const referencia = String(row[idxRef] || '').trim().toUpperCase();
                const tamanho = String(row[idxTam] || '').trim().toUpperCase();
                const qtd = parseInt(row[idxQtd]) || 0;
                const local = idxLocalFallback !== -1 ? String(row[idxLocalFallback] || '').trim().toUpperCase() : '';
                if (!opId || !tamanho) continue;
                if (!grades[opId]) grades[opId] = { referencia, tamanhos: {}, locaisPorTamanho: {} };
                grades[opId].tamanhos[tamanho] = (grades[opId].tamanhos[tamanho] || 0) + qtd;
                if (local) {
                    if (!grades[opId].locaisPorTamanho[tamanho]) grades[opId].locaisPorTamanho[tamanho] = [];
                    const entrada = grades[opId].locaisPorTamanho[tamanho].find(e => e.local === local);
                    if (entrada) entrada.qtd += qtd;
                    else grades[opId].locaisPorTamanho[tamanho].push({ local, qtd });
                }
                linhasLidas++;
            }

            if (linhasLidas === 0) throw new Error("Nenhuma linha válida encontrada (confira se OP e Tamanho estão preenchidos).");

            localStorage.setItem('gradesPorOP', JSON.stringify(grades));
            input.value = '';
            registrarAtualizacao('grades'); atualizarIndicadoresDeAtualizacao();
            showToast(`<i class='fas fa-check-double'></i> Grades importadas! ${Object.keys(grades).length} OPs com grade cadastrada.`);
        } catch (err) {
            console.error('Erro ao processar grades:', err);
            alert("❌ Não foi possível processar a planilha de grades.\n\nVerifique se ela tem as colunas OP, Referência, Tamanho e Qtd no cabeçalho.\n\nDetalhe técnico: " + err.message);
            input.value = '';
        }
    };
    r.readAsArrayBuffer(input.files[0]);
}

// =========================================================================
// 📋 PEDIDOS PENDENTES — planilha "Resumo Geral dos Pedidos". Guarda só as
// linhas que realmente precisam de produção nova (Situação != Bloqueado e
// Falta OP > 0) — a própria planilha já calcula esse número considerando
// estoque físico e OPs existentes, então não recalculamos isso aqui.
// =========================================================================
function processarPedidos() {
    if (!exigirAdmin('importar os pedidos')) return;
    const input = $('inputPedidos'); if (!input.files[0]) return;
    const r = new FileReader();
    r.onload = function (e) {
        try {
            const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array', cellDates: true });
            const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
            if (!rows.length) throw new Error("Planilha vazia.");

            const cab = rows[0].map(c => String(c || '').trim().toUpperCase());
            const idxNome = cab.findIndex(c => c.includes('NOME'));
            const idxPedido = cab.findIndex(c => c.includes('PEDIDO'));
            const idxSituacao = cab.findIndex(c => c.startsWith('SITUA'));
            const idxChegada = cab.findIndex(c => c.includes('CHEGADA'));
            const idxPrior = cab.findIndex(c => c.startsWith('PRIOR'));
            const idxRef = cab.findIndex(c => c.includes('REFER') && !c.includes('DESCRI'));
            const idxTam = cab.findIndex(c => c === 'TAM');
            const idxFaltaOP = cab.findIndex(c => c === 'FALTA OP');
            const idxFaltaEstoque = cab.findIndex(c => c === 'FALTA ESTOQUE'); // opcional, usada só no Levantamento de Referências

            const faltando = [];
            if (idxNome === -1) faltando.push('Nome');
            if (idxPedido === -1) faltando.push('Pedido');
            if (idxSituacao === -1) faltando.push('Situação');
            if (idxChegada === -1) faltando.push('Chegada');
            if (idxRef === -1) faltando.push('Referência');
            if (idxTam === -1) faltando.push('Tam');
            if (idxFaltaOP === -1) faltando.push('Falta OP');
            if (faltando.length) throw new Error("Não encontrei as colunas: " + faltando.join(', ') + ". Cabeçalho real da planilha (primeira linha): [" + cab.filter(c => c).join(' | ') + "]");

            const pendentes = [];
            const todos = []; // TODOS os itens, mesmo já cobertos — só pra consulta/busca, não entra na aba Pedidos Pendentes nem nas contagens de urgência
            for (let i = 1; i < rows.length; i++) {
                const row = rows[i]; if (!row || !row[idxPedido]) continue;
                const situacao = String(row[idxSituacao] || '').trim().toUpperCase();
                if (situacao === 'BLOQUEADO') continue;
                const faltaOP = parseFloat(row[idxFaltaOP]) || 0;

                const chegadaRaw = row[idxChegada];
                const chegada = chegadaRaw instanceof Date ? chegadaRaw : extrairDataExcel(chegadaRaw);
                const prior = idxPrior !== -1 && row[idxPrior] !== undefined && row[idxPrior] !== null && row[idxPrior] !== ''
                    ? parseFloat(row[idxPrior]) : 99;

                const item = {
                    cliente: String(row[idxNome] || '').trim(),
                    pedido: String(row[idxPedido]).trim(),
                    situacao,
                    chegada: chegada ? chegada.toISOString() : null,
                    prior: isNaN(prior) ? 99 : prior,
                    referencia: String(row[idxRef] || '').trim().toUpperCase(),
                    tam: String(row[idxTam] || '').trim().toUpperCase(),
                    faltaProduzir: faltaOP,
                    faltaEstoque: idxFaltaEstoque !== -1 ? (parseFloat(row[idxFaltaEstoque]) || 0) : 0
                };
                todos.push(item);
                if (faltaOP > 0) pendentes.push(item);
            }

            localStorage.setItem('pedidosPendentes', JSON.stringify(pendentes));
            try { localStorage.setItem('todosPedidos', JSON.stringify(todos)); }
            catch (err) { console.warn('Não coube a lista completa de pedidos (só busca fica afetada):', err.message); localStorage.removeItem('todosPedidos'); }
            input.value = '';
            renderizarPedidosPendentes();
            renderizarTudoImediato();
            registrarAtualizacao('pedidos'); atualizarIndicadoresDeAtualizacao();
            showToast(`<i class='fas fa-check-double'></i> Pedidos importados! ${pendentes.length} itens ainda sem produção suficiente.`);
        } catch (err) {
            console.error('Erro ao processar pedidos:', err);
            alert("❌ Não foi possível processar a planilha de pedidos.\n\nVerifique se ela tem as colunas Nome, Pedido, Situação, Chegada, Referência, Tam e Falta OP no cabeçalho.\n\nDetalhe técnico: " + err.message);
            input.value = '';
        }
    };
    r.readAsArrayBuffer(input.files[0]);
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
function pedidosQueEssaOPFecha(op) {
    if (!op || !op.referencia) return [];
    const pendentesRef = obterPendentesPorReferencia().get(op.referencia);
    if (!pendentesRef || !pendentesRef.length) return [];

    const grades = obterGradesPorOP();
    const gradeOP = grades[op.id];
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
            grade: (grades[op.id] && grades[op.id].tamanhos) || null,
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
            grade: (grades[item.op] && grades[item.op].tamanhos) || null,
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
        $('listaNecessidade').innerHTML = `<tr><td colspan="5" style="text-align:center; padding:30px; color:var(--texto-secundario);"><i class="fas fa-inbox" style="font-size:20px; display:block; margin-bottom:8px;"></i>${termo ? 'Nada encontrado com esse filtro.' : `Nenhuma referência com ${rotulo.toLowerCase()} — sincronize os pedidos, ou essa coluna não veio na planilha.`}</td></tr>`;
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
                    <strong style="font-size:13px;"><i class="fas fa-tag"></i> ${referencia}</strong>
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
        const grades = obterGradesPorOP();

        // Pra cada tamanho que falta, confere se alguma OP existente REALMENTE
        // tem esse tamanho na grade dela — ter volume na referência não quer
        // dizer que cobre o tamanho específico que está faltando. Detalha
        // qual OP contribui com quanto, e em qual local ela está.
        const linhasTamanhoHtml = linhasTamanho.map(l => {
            let qtdGrade = 0, algumaComGrade = false;
            const contribuicoes = [];
            opsExistentes.forEach(op => {
                const g = grades[op.id];
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
                    <strong style="font-size:13px;"><i class="fas fa-tag"></i> ${referencia}</strong>
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
        $('listaPedidosPendentes').innerHTML = `<tr><td colspan="7" style="text-align:center; padding:30px; color:var(--texto-secundario);"><i class="fas fa-check-circle" style="font-size:20px; display:block; margin-bottom:8px; color:var(--cor-despacho);"></i>Nenhum pedido pendente — ou a planilha de pedidos ainda não foi importada.</td></tr>`;
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
function processarFilaCorte() {
    if (!exigirAdmin('importar a fila de corte')) return;
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
function calcularMediaDiariaCorte() {
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
        corpo.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:30px; color:var(--texto-secundario);"><i class="fas fa-file-import" style="font-size:20px; display:block; margin-bottom:8px;"></i>Importe a planilha geral de novo pra ver as OPs por trás dos números.</td></tr>`;
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
        corpo.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:30px; color:var(--texto-secundario);"><i class="fas fa-inbox" style="font-size:20px; display:block; margin-bottom:8px;"></i>Nenhuma OP com os filtros atuais.</td></tr>`;
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

// Tempo que vale pra conta: o da planilha quando existe, senão o digitado
function tempoEfetivoOP(op) {
    const daPlanilha = parseFloat(op.tempoCorte) || 0;
    if (daPlanilha > 0) return daPlanilha;
    return parseFloat(capTemposManuais[op.id]) || 0;
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
        if (soSemTempo && (parseFloat(op.tempoCorte) || 0) > 0) return false;
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
        $('capListaOPs').innerHTML = `<tr><td colspan="7" style="text-align:center; padding:30px; color:var(--texto-secundario);"><i class="fas fa-inbox" style="font-size:20px; display:block; margin-bottom:8px;"></i>Nenhuma OP com os filtros atuais.</td></tr>`;
        return;
    }

    $('capListaOPs').innerHTML = visiveis.map(op => {
        const daPlanilha = parseFloat(op.tempoCorte) || 0;
        const t = tempoEfetivoOP(op);
        const marcada = capSelecionadas.has(op.id);
        const campoTempo = daPlanilha > 0
            ? `<strong>${daPlanilha.toFixed(1).replace('.', ',')}</strong>`
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

    if ($('mediaCorteInfo')) {
        $('mediaCorteInfo').innerText = media > 0
            ? `Média diária do Corte: ${Math.round(media).toLocaleString('pt-BR')} pçs/dia`
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
            $('listaFilaCorte').innerHTML = `<tr><td colspan="5" style="text-align:center; padding:30px; color:var(--texto-secundario);"><i class="fas fa-file-import" style="font-size:20px; display:block; margin-bottom:8px;"></i>Importe a planilha geral (POR_OP) pra ver a fila de corte.</td></tr>`;
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
        opsComPedido: 0, opsComPedidoUrgente: 0
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
            if (pendentesRef && pendentesRef.length) {
                const pedido = [...pendentesRef].sort(compararUrgenciaPedidos)[0];
                const especial = pedido.prior !== 99;
                const dataChegada = pedido.chegada ? new Date(pedido.chegada) : null;
                const vencido = dataChegada && dataChegada < hoje;
                stat.opsComPedido++;
                if (especial || vencido) stat.opsComPedidoUrgente++;
                pesoOp += especial ? 200 : (vencido ? 100 : 50);
            }

            stat.score += pesoOp;
        }
    });

    return setoresStatus.filter(s => s.qtdOps > 0).sort((a, b) => b.score - a.score);
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
        $('resumo-gargalo-detalhe').innerText = `${ranking[0].qtdOps} OPs · ${ranking[0].maxDias}d no pior caso`;
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

    let maxScoreGlobal = setoresAtivos[0].score;

    let htmlGargalos = setoresAtivos.map((s, index) => {
        let mediaDias = s.qtdOps > 0 ? (s.somaDias / s.qtdOps).toFixed(1) : 0;
        let pctBarra = maxScoreGlobal > 0 ? (s.score / maxScoreGlobal) * 100 : 0;

        let corNivel = index === 0 ? 'var(--cor-alerta)' : (index === 1 ? 'var(--cor-selecao)' : 'var(--cor-sugestao)');
        let iconeNivel = index === 0 ? '<i class="fas fa-exclamation-triangle" style="color:var(--cor-alerta);"></i>' : `#${index + 1}`;

        return `
            <div style="background:var(--bg-painel); border:1px solid var(--borda-cor); border-radius:8px; margin-bottom:10px; overflow:hidden; position:relative;">
                <div class="barra-gargalo-fill" data-pct="${pctBarra}" style="position:absolute; top:0; left:0; height:100%; width:0%; background:${corNivel}; opacity:0.1; z-index:0; transition:width 0.6s ease-out;"></div>
                <div style="position:relative; z-index:1; padding:12px 15px; display:flex; justify-content:space-between; align-items:center;">
                    <div style="flex:1;">
                        <div style="font-size:14px; font-weight:900; color:var(--texto-cor); display:flex; align-items:center; gap:10px;">
                            <span style="font-size:14px; width:20px; text-align:center; color:var(--texto-secundario);">${iconeNivel}</span>
                            ${s.nome}
                        </div>
                        <div style="font-size:11px; color:var(--texto-secundario); margin-top:4px; margin-left:30px;">
                            <strong>${s.qtdOps}</strong> OPs • <strong>${s.qtdPcs.toLocaleString('pt-BR')}</strong> pçs
                        </div>
                    </div>
                    <div style="text-align:right; min-width:120px;">
                        <div style="font-size:12px; font-weight:bold; color:${s.maxDias >= 3 ? 'var(--cor-alerta)' : 'var(--texto-cor)'};">
                            <i class="fas fa-clock"></i> Max: ${s.maxDias} d
                        </div>
                        <div style="font-size:10px; color:var(--texto-secundario); margin-top:2px;">
                            Média: ${mediaDias} d
                        </div>
                        ${s.opsCriticas > 0 ? `<div style="font-size:9px; background:var(--cor-alerta); color:white; padding:2px 6px; border-radius:4px; display:inline-block; margin-top:4px; font-weight:bold;">${s.opsCriticas} Críticas</div>` : ''}
                        ${s.opsComPedido > 0 ? `<div style="font-size:9px; background:${s.opsComPedidoUrgente > 0 ? 'var(--cor-roxo)' : 'var(--cor-sugestao)'}; color:white; padding:2px 6px; border-radius:4px; display:inline-block; margin-top:4px; margin-left:4px; font-weight:bold;" title="OPs paradas aqui que também estão travando um pedido de cliente ainda em aberto"><i class="fas fa-user-clock"></i> ${s.opsComPedido} c/ pedido</div>` : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');

    let modal = $('modalGargalo');
    modal.innerHTML = `
        <div class="modal-card" style="width:600px; max-width:90vw; border-top:5px solid var(--cor-alerta); max-height:85vh;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; border-bottom:2px solid var(--borda-cor); padding-bottom:10px;">
                <h2 style="margin:0; color:var(--texto-cor); display:flex; align-items:center; gap:10px;">
                    <i class="fas fa-search-location" style="color:var(--cor-alerta);"></i> RANKING DE GARGALOS
                </h2>
                <button onclick="document.getElementById('modalGargalo').style.display='none'" class="modal-fechar-btn"><i class="fas fa-times"></i></button>
            </div>
            <div style="font-size:12px; color:var(--texto-secundario); margin-bottom:15px;">
                Análise do peso de retenção de fluxo (Volume de peças + Tempo de permanência + urgência de pedido
                vinculado). OPs com mais de 3 dias no mesmo local são consideradas críticas; OPs que travam um pedido
                pendente pesam mais no ranking, principalmente se o pedido já venceu ou tem prioridade sinalizada.
            </div>
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
        ? `<tr><td colspan="9" style="text-align:center; padding:30px; color:var(--texto-secundario);"><i class="fas fa-inbox" style="font-size:20px; display:block; margin-bottom:8px;"></i>Nenhuma OP encontrada com os filtros atuais.</td></tr>`
        : d.map(i => `<tr oncontextmenu="mostrarMenuContexto(event, '${i.op.id}')" style="${i.op.prioridade ? 'background:rgba(107, 76, 122, 0.05);' : (i.sCls === 'pill-atraso' ? 'background:rgba(193, 68, 78, 0.06);' : '')}"><td>${i.op.prioridade ? '<i class="fas fa-star" style="color:var(--cor-selecao);"></i>' : '<span class="status-mov">●</span>'}</td><td>${i.op.ciclo}</td><td><strong>${i.op.id}</strong></td><td>${i.op.localDestino}</td><td>${i.op.localExcel}</td><td><span class="pill" style="background:${i.op.temDublado ? 'var(--cor-sugestao)' : '#ccc'};">${i.op.temDublado ? 'SIM' : 'NÃO'}</span></td><td>${i.op.tempoCorte} min</td><td style="color:var(--cor-alerta); font-weight:bold;">${i.metaTxt}</td><td><span class="pill ${i.sCls}">${i.sTxt}</span></td></tr>`).join('');
}

//PAINEL MONTADOR/PROGRAMAÇÃO//
// Lê a grade por tamanho de todas as OPs (planilha de Grade já importada) —
// usada tanto no tooltip da OP quanto na checagem de cobertura de pedido.
function obterGradesPorOP() {
    try { return JSON.parse(localStorage.getItem('gradesPorOP') || '{}'); } catch (e) { return {}; }
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
        && passaFiltroDataCorte(o);
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

    // Ordenação das OPs
    dDados.sort((a, b) => {
        if (a.prioridade !== b.prioridade) return b.prioridade - a.prioridade;

        // OPs COM STATUS DE ATRASO FURAM A FILA DENTRO DO MESMO NÍVEL DE PRIORIDADE
        // (mesmo peso usado na Fila Geral: 1=ATRASO, 2=FIFO/sem data, 3=PRAZO em dia)
        const pesoA = pesoUrgenciaPorOP.get(a.id) ?? 2, pesoB = pesoUrgenciaPorOP.get(b.id) ?? 2;
        if (pesoA !== pesoB) return pesoA - pesoB;

        // ORDENAÇÃO POR MATÉRIA-PRIMA PRIMEIRO
        const mpA = a.codigoMP || "";
        const mpB = b.codigoMP || "";
        if (mpA !== mpB) return mpA.localeCompare(mpB);

        // DEPOIS POR DATA DE CORTE
        const dA = a.dataCorte ? new Date(a.dataCorte).getTime() : 0, dB = b.dataCorte ? new Date(b.dataCorte).getTime() : 0;
        return ordemCorteAsc ? dA - dB : dB - dA;
    });

    if ($('setaOrdenacao')) $('setaOrdenacao').innerText = ordemCorteAsc ? "▲" : "▼";

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
            ? `<br><span class="pill pill-pedido" style="margin-top:4px; display:inline-block;" title="Pedido ${pedidoVinc.pedido} de ${pedidoVinc.cliente} — falta ${pedidoVinc.faltaProduzir} pçs (tam ${pedidoVinc.tam})${pedidoVinc.chegada ? ' — chegada ' + new Date(pedidoVinc.chegada).toLocaleDateString('pt-BR') : ''}"><i class="fas fa-user-clock"></i> ${pedidoVinc.cliente.split(' ').slice(0, 2).join(' ')}</span>`
            : '';
        const entrouPorMP = bOP !== "" && !o.id.toLowerCase().includes(bOP);
        const badgeMP = entrouPorMP
            ? `<br><span class="pill" style="background:var(--cor-sugestao); margin-top:4px; display:inline-block;" title="Não bateu com a busca — apareceu por ser da mesma matéria-prima (${mpOP}) de uma OP buscada"><i class="fas fa-layer-group"></i> MESMA MP</span>`
            : '';
        htmlTabela += `
            <tr oncontextmenu="mostrarMenuContexto(event, '${o.id}')" style="${o.prioridade ? 'background:rgba(107, 76, 122,0.05);' : (tintaPedido || (emAtraso ? 'background:rgba(193, 68, 78,0.06);' : ''))}">
                <td>${o.prioridade ? '<i class="fas fa-star" style="color:var(--cor-selecao);"></i>' : '●'}</td>
                <td><input type="checkbox" class="check-lote" data-qtd="${o.qtd}" data-tempo="${o.tempoCorte}" data-id="${o.id}" data-mp="${mpOP}" ${selecaoLoteOPs.has(o.id) ? 'checked' : ''}></td>
                <td>${i + 1}º</td>
                <td>${o.ciclo}</td>
                <td><strong>${o.id}</strong>${badgePedido}${badgeMP}</td>
                <td><span class="pill" style="background:var(--cor-historico);">${nomesEtapas[o.etapa]}</span>${o.laser ? ' <span class="pill" style="background:var(--cor-roxo);" title="Vai pra máquina de corte a laser"><i class="fas fa-bolt"></i> LASER</span>' : ''}</td>
                
                <td title="${o.descMP}"><span style="background: #eee; color: #333; padding: 2px 6px; border-radius: 4px; font-size: 0.85em; font-weight: bold; cursor: help;">${mpOP}</span></td>
                
                <td>${o.localDestino}</td>
                <td>${o.desc}</td>
                <td>${o.temDublado ? 'SIM' : 'NÃO'}</td>
                <td><b>${o.tempoCorte}</b> min</td>
                <td>${o.qtd}</td>
                <td>${o.dataCorte ? new Date(o.dataCorte).toLocaleDateString('pt-BR') : 'FIFO'}</td>
                <td>${o.dataCorteSuposta && formatarDataBR(o.dataCorteSuposta) ? `<span style="color:var(--cor-roxo);" title="Estimado a partir da finalização (${formatarDataBR(o.dataFinalizacao)})">${formatarDataBR(o.dataCorteSuposta)}</span>` : '—'}</td>
            </tr>
        `;
    });

    if ($('listaDespacho')) $('listaDespacho').innerHTML = dDados.length === 0
        ? `<tr><td colspan="14" style="text-align:center; padding:30px; color:var(--texto-secundario);"><i class="fas fa-inbox" style="font-size:20px; display:block; margin-bottom:8px;"></i>Nenhuma OP encontrada com os filtros atuais.</td></tr>`
        : htmlTabela;
    // =========================================================================
    filaGeralDadosGlobais = fDados; renderizarTabelaFilaGeral();
    if ($('contDespacho')) $('contDespacho').innerText = dDados.length + " OPs";
    if ($('contTotal')) $('contTotal').innerText = filtrados.length + " OPs";
    $$('.check-lote').forEach(cb => cb.onclick = handleShiftClick);

    renderizarSidebarPrioridades();
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
        $('listaOPsVinculadas').innerHTML = `<tr><td colspan="9" style="text-align:center; padding:30px; color:var(--texto-secundario);"><i class="fas fa-link" style="font-size:20px; display:block; margin-bottom:8px;"></i>Nenhuma OP em produção está vinculada a um pedido pendente no momento.</td></tr>`;
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
        const gradeOP = grades[v.op.id];
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
        ? `<div style="text-align:center; padding:30px; color:var(--texto-secundario);">Nenhuma OP encontrada em <strong>${nomesEtapas[etapa]}</strong>.</div>`
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
function abrirAgrupamentoReferencia() {
    const candidatas = bancoDadosOPs.filter(op => (op.etapa === 0 || op.etapa === 1) && op.referencia && !op.sobMedida);
    const porReferencia = new Map();
    candidatas.forEach(op => {
        if (!porReferencia.has(op.referencia)) porReferencia.set(op.referencia, []);
        porReferencia.get(op.referencia).push(op);
    });
    const grupos = [...porReferencia.entries()]
        .filter(([ref, ops]) => ops.length >= 2)
        .sort((a, b) => b[1].length - a[1].length);

    ultimoAgrupamentoReferenciaGerado = grupos;
    renderizarAgrupamentoReferencia(grupos);
    $('modalAgrupamentoReferencia').style.display = 'flex';
}

function renderizarAgrupamentoReferencia(grupos) {
    const gruposHtml = grupos.map(([ref, ops]) => {
        const totalPecas = ops.reduce((s, o) => s + (parseInt(o.qtd) || 0), 0);
        const linhas = ops.map(op => `
            <tr>
                <td><strong>${op.id}</strong></td>
                <td>${op.ciclo}</td>
                <td><span class="pill" style="background:${op.etapa === 0 ? 'var(--cor-fila)' : 'var(--cor-sugestao)'};">${nomesEtapas[op.etapa]}</span></td>
                <td style="text-align:right;">${op.qtd}</td>
                <td>${op.codigoMP || '-'}</td>
                <td style="text-align:right; color:${(op.diasLocal || 0) >= 3 ? 'var(--cor-alerta)' : 'var(--texto-cor)'};">${op.diasLocal || 0}</td>
            </tr>
        `).join('');
        return `
            <div style="border-left:4px solid var(--cor-fila); background:var(--bg-painel); border-radius:8px; padding:12px; margin-bottom:14px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                    <strong style="font-size:13px;"><i class="fas fa-tag"></i> ${ref}</strong>
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
                Só mostra referências com 2 ou mais OPs entre PCP-Programação e Almox. Análise de Medidas — referência com uma única OP não aparece aqui, e OPs sob medida (SBM) nunca entram, já que cada uma é única.
            </div>
            <div style="overflow-y:auto; flex:1;">
                ${grupos.length === 0 ? `<div style="text-align:center; padding:30px; color:var(--texto-secundario);">Nenhuma referência repetida entre esses dois setores no momento.</div>` : gruposHtml}
            </div>
            ${grupos.length > 0 ? `<button onclick="copiarAgrupamentoReferencia()" class="btn btn-acao" style="margin-top:12px;"><i class="fas fa-copy"></i> COPIAR LISTA</button>` : ''}
        </div>
    `;
}

function copiarAgrupamentoReferencia() {
    if (!ultimoAgrupamentoReferenciaGerado || !ultimoAgrupamentoReferenciaGerado.length) return;
    const texto = ultimoAgrupamentoReferenciaGerado.map(([ref, ops]) =>
        `${ref} (${ops.length} OPs):\n` + ops.map(op => `  - OP ${op.id} | Ciclo ${op.ciclo} | ${nomesEtapas[op.etapa]} | ${op.qtd} pçs | MP ${op.codigoMP || '-'} | ${op.diasLocal || 0}d parado`).join('\n')
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

// PAINEL DE FLUXO CONSOLIDADO GERAL
function renderizarFluxoConsolidado() {
    const ctx = $('graficoFluxoConsolidado'); if (!ctx) return;
    const ctxFunil = $('graficoFunil');
    const fC = document.body.classList.contains('dark-mode') ? '#aaa' : '#666';
    const gridColor = document.body.classList.contains('dark-mode') ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';

    if (meuGraficoConsolidado) meuGraficoConsolidado.destroy();
    if (typeof window.meuGraficoFunil !== 'undefined' && window.meuGraficoFunil) window.meuGraficoFunil.destroy();

    const setores = ["MEDIDAS", "CAD", "ALMOX", "ENFESTO", "CORTE", "ETIQUETAÇÃO"];
    const nomesExibicao = ["MEDIDAS", "CAD", "ALMOX TEC", "ENFESTO", "CORTE", "ETIQUETA"];
    const coresSetores = [corCSS('--cor-roxo'), '#35505C', '#B8862A', '#2F8577', corCSS('--cor-sugestao'), corCSS('--cor-alerta')];

    let totaisReal = setores.map(s => dadosMes.reduce((acc, d) => acc + ((d[s] && d[s].pcsReal) || 0), 0));

    if (modoFluxoAtivo === 'acumulado') {
        meuGraficoConsolidado = new Chart(ctx, {
            type: 'bar', config: { id: 'fluxoConsolidado' },
            plugins: [pluginFundoSolido],
            data: {
                labels: nomesExibicao,
                datasets: [{ label: 'Produção Acumulada', data: totaisReal, backgroundColor: corCSS('--cor-sugestao'), borderRadius: 4 }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { labels: { color: fC } },
                    datalabels: { anchor: 'end', align: 'end', color: fC, font: { weight: 'bold', size: 10 }, formatter: (value) => value > 0 ? value.toLocaleString('pt-BR') : '' }
                },
                scales: {
                    x: { ticks: { color: fC }, grid: { display: false } },
                    y: { ticks: { color: fC }, grid: { color: gridColor, borderDash: [5, 5], drawBorder: false } }
                }
            }
        });
    } else {
        let labelsDias = dadosMes.map(d => d.dia);
        let datasets = setores.map((setor, index) => {
            return {
                label: nomesExibicao[index],
                data: dadosMes.map(d => (d[setor] && d[setor].pcsReal) || 0),
                borderColor: coresSetores[index],
                backgroundColor: coresSetores[index] + '33',
                borderWidth: 2, fill: false, tension: 0.3, pointRadius: 3, datalabels: { display: false }
            }
        });

        meuGraficoConsolidado = new Chart(ctx, {
            type: 'line', config: { id: 'fluxoConsolidadoDiario' },
            plugins: [pluginFundoSolido, pluginFinaisDeSemana],
            data: { labels: labelsDias, datasets: datasets },
            options: {
                responsive: true, maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: { legend: { labels: { color: fC } }, datalabels: { display: false } },
                scales: {
                    x: { ticks: { color: fC }, grid: { color: gridColor, drawBorder: false } },
                    y: { ticks: { color: fC }, grid: { color: gridColor, borderDash: [5, 5], drawBorder: false } }
                }
            }
        });
    }

    if (ctxFunil) {
        let maxVal = Math.max(...totaisReal) || 1;
        let funnelData = totaisReal.map(val => {
            let margin = (maxVal - val) / 2;
            return [margin, margin + val];
        });

        window.meuGraficoFunil = new Chart(ctxFunil, {
            type: 'bar',
            data: {
                labels: nomesExibicao,
                datasets: [{
                    data: funnelData, backgroundColor: coresSetores, borderRadius: 4, borderSkipped: false
                }]
            },
            options: {
                indexAxis: 'y', responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function (context) {
                                let val = totaisReal[context.dataIndex];
                                let pct = Math.round((val / totaisReal[0]) * 100) || 0;
                                return `${val.toLocaleString('pt-BR')} pçs (${pct}% de retenção)`;
                            }
                        }
                    },
                    datalabels: {
                        color: '#fff', font: { weight: 'bold', size: 10 },
                        formatter: (value, context) => { let val = totaisReal[context.dataIndex]; return val > 0 ? val.toLocaleString('pt-BR') : ''; }
                    }
                },
                scales: {
                    x: { display: false, min: 0, max: maxVal },
                    y: { ticks: { color: fC, font: { size: 10, weight: 'bold' } }, grid: { display: false }, border: { display: false } }
                }
            }
        });
    }

    let htmlCards = '';
    for (let idx = 0; idx < setores.length; idx++) {
        let r = totaisReal[idx];
        htmlCards += `
            <div style="flex:1; min-width:130px; background:var(--bg-painel); padding:15px; border-radius:8px; border:1px solid var(--borda-cor); text-align:center; box-shadow:var(--sombra-leve); border-bottom: 4px solid ${coresSetores[idx]};">
                <div style="font-size:11px; font-weight:900; color:var(--texto-secundario); text-transform:uppercase;">${nomesExibicao[idx]}</div>
                <div style="font-size:20px; font-weight:900; margin-top:8px; color:var(--texto-cor);">${r.toLocaleString('pt-BR')}</div>
            </div>`;

        if (idx < setores.length - 1) {
            let proxReal = totaisReal[idx + 1] || 0;
            let wip = r - proxReal;
            let wipColor = wip > 2000 ? 'var(--cor-alerta)' : (wip > 500 ? 'var(--cor-selecao)' : 'var(--texto-secundario)');

            htmlCards += `
            <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; min-width:60px;">
                <div style="font-size:9px; font-weight:bold; color:var(--texto-secundario);" title="Work In Progress (Aguardando)">WIP</div>
                <div style="background:var(--bg-card); border:1px dashed ${wipColor}; color:${wipColor}; padding:4px 8px; border-radius:12px; font-size:11px; font-weight:bold; margin-top:2px;">
                    ${wip > 0 ? wip.toLocaleString('pt-BR') : '0'}
                </div>
                <i class="fas fa-arrow-right" style="color:var(--borda-cor); margin-top:4px; font-size:14px;"></i>
            </div>`;
        }
    }
    $('cardsSectoresResumo').innerHTML = htmlCards;
}

// SIDEBAR E MODO TV
function toggleSidebarPrioridades() { const s = $('sidebar-prioridades'), o = $('overlay-sidebar'); if (s.classList.contains('aberta')) { s.classList.remove('aberta'); o.style.display = 'none'; } else { s.classList.add('aberta'); o.style.display = 'block'; renderizarSidebarPrioridades(); } }
function renderizarSidebarPrioridades() { const u = bancoDadosOPs.filter(o => o.prioridade); if ($('badge-prioridades')) { if (u.length > 0) { $('badge-prioridades').style.display = 'flex'; $('badge-prioridades').innerText = u.length; } else $('badge-prioridades').style.display = 'none'; } if ($('lista-prioridades')) { if (u.length === 0) $('lista-prioridades').innerHTML = '<div style="text-align:center; padding:30px 10px; color:var(--texto-secundario); font-weight:bold;"><i class="fas fa-check-circle" style="font-size:30px; margin-bottom:10px; color:var(--cor-despacho);"></i><br>Nenhuma urgência.</div>'; else $('lista-prioridades').innerHTML = u.map(o => `<div class="card-op" style="border-left-color:#B8862A; padding:12px; cursor:default;" oncontextmenu="mostrarMenuContexto(event,'${o.id}')"><div style="display:flex; justify-content:space-between; margin-bottom:8px;"><strong>OP: ${o.id}</strong><button onclick="opContextoId='${o.id}'; ctxAcao('prioridade');" class="btn" style="padding:4px 8px;"><i class="fas fa-times"></i></button></div><div style="font-size:11px; margin-bottom:10px;">${o.desc.substring(0, 35)}</div><div><span class="pill" style="background:var(--cor-primaria);">${nomesEtapas[o.etapa]}</span> <strong>${o.qtd} pçs</strong></div></div>`).join(''); } }

let tvInt = null, scInt = null, tTv = 0;
function ativarModoTV() { document.body.classList.add('modo-tv'); if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => { }); tTv = 0; abrirAba(null, 'aba-fila'); initScrollV('#aba-fila .secao-corpo'); tvInt = setInterval(altTV, 30000); }
function altTV() { tTv = tTv > 0 ? 0 : tTv + 1; clearInterval(scInt); if (tTv === 0) { abrirAba(null, 'aba-fila'); initScrollV('#aba-fila .secao-corpo'); } else { abrirAba(null, 'aba-fluxo-consolidado'); } }
function initScrollV(sel) { const e = document.querySelector(sel); if (!e) return; e.scrollTop = 0; let d = 1; scInt = setInterval(() => { if (e.scrollHeight <= e.clientHeight) return; e.scrollTop += d; if (e.scrollTop >= (e.scrollHeight - e.clientHeight - 1)) d = -1; if (e.scrollTop <= 0) d = 1; }, 40); }
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && document.body.classList.contains('modo-tv')) { document.body.classList.remove('modo-tv'); clearInterval(tvInt); clearInterval(scInt); abrirAba(null, 'aba-programacao'); } });

// SISTEMA (TEMA, BACKUP, START)
function toggleTema() { document.body.classList.toggle('dark-mode'); localStorage.setItem('temaEscuro', document.body.classList.contains('dark-mode')); if ($('aba-fluxo-consolidado').classList.contains('ativa')) renderizarFluxoConsolidado(); }
function exportarBackup() { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(localStorage)], { type: "application/json" })); a.download = `Backup_${new Date().getDate()}.json`; a.click(); }

// Imprime só a lista de "PROGRAMAR LOTE" (tabela filtrada de OPs na
// Programação), do jeito que ela aparece na tela — a folha de estilo de
// impressão (@media print no CSS) isola só essa seção, tira o resto da
// página, e não corta tabela grande.
function imprimirTela() { window.print(); }

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
});

window.addEventListener('afterprint', () => {
    $$('.imprimir-esconder').forEach(el => el.classList.remove('imprimir-esconder'));
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

function abrirAba(ev, id) { if (!abaLiberadaAgora(id)) { id = 'aba-sequenciamento'; ev = null; } $$('.aba-conteudo').forEach(a => a.classList.remove('ativa')); $$('.tab-btn').forEach(b => b.classList.remove('ativo')); $(id).classList.add('ativa'); if (ev) ev.currentTarget.classList.add('ativo'); else $('abrirAba-' + id)?.classList.add('ativo'); if (id === 'aba-fluxo-consolidado') renderizarFluxoConsolidado(); }
function toggleMultiSelect() { const e = $('listaFiltroLocal'); e.style.display = e.style.display === 'block' ? 'none' : 'block'; }

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

function toggleMultiSelectEtapa() { const e = $('listaFiltroEtapa'); e.style.display = e.style.display === 'block' ? 'none' : 'block'; }
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
        wireEvento('overlay-sidebar', 'click', () => { toggleSidebarPrioridades(); });
        wireEvento('toggleSidebarPrioridades', 'click', () => { toggleSidebarPrioridades(); });
        wireEvento('abrirPrioridadeClientes', 'click', () => { abrirModalPrioridadeClientes(); });
        wireEvento('inputGrades', 'change', () => { processarGrades(); });
        wireEvento('inputPedidos', 'change', () => { processarPedidos(); });
        wireEvento('gerarSugestaoPedidos', 'click', () => { gerarSugestaoSequenciaPedidos(); });
        wireEvento('abrirSequenciamentoFifo', 'click', () => { abrirModalSequenciamentoFifo(); });
        wireEvento('abrirGuiaSequenciamento-montador', 'click', () => { abrirGuiaSequenciamento(); });
        wireEvento('abrirGuiaSequenciamento-pedidos', 'click', () => { abrirGuiaSequenciamento(); });
        wireEvento('abrirGuiaSequenciamento-menu', 'click', () => { abrirGuiaSequenciamento(); });
        wireEvento('abrirAgrupamentoReferencia', 'click', () => { abrirAgrupamentoReferencia(); });
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
        wireEvento('modalGargalo', 'click', function(event){ if(event.target === this) this.style.display='none'; });
        wireEvento('ctxAcao-copiar', 'click', () => { ctxAcao('copiar'); });
        wireEvento('ctxAcao-prioridade', 'click', () => { ctxAcao('prioridade'); });
        wireEvento('ctxAcao-fracionar', 'click', () => { ctxAcao('fracionar'); });
        wireEvento('ctxAcao-avancar', 'click', () => { ctxAcao('avancar'); });
        wireEvento('toggleSidebarPrioridades-2', 'click', () => { toggleSidebarPrioridades(); });
        wireEvento('btnMenuAnalise', 'click', () => { toggleDropdown('menuAnalise'); });
        wireEvento('btnMenuImportar', 'click', () => { toggleDropdown('menuImportar'); });
        wireEvento('btnMenuSistema', 'click', () => { toggleDropdown('menuSistema'); });
        wireEvento('analisarGargalo', 'click', () => { analisarGargalo(); });
        wireEvento('ativarModoTV', 'click', () => { ativarModoTV(); });
        wireEvento('toggleTema', 'click', () => { toggleTema(); });
        wireEvento('abrirBuscaGlobal', 'click', () => { abrirBuscaGlobal(); });
        wireEvento('abrirGuiaSistema', 'click', () => { abrirGuiaSistema(); });
        wireEvento('btnLoginAdmin', 'click', () => { abrirModalLoginAdmin(); });
        wireEvento('publicarSupabase', 'click', () => { publicarTudoNoSupabase(); });
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
        wireEvento('toggleMultiSelectLocalProd', 'click', () => { const e2 = $('listaFiltroLocalProd'); e2.style.display = e2.style.display === 'block' ? 'none' : 'block'; });
        wireEvento('listaFiltroLocalProd', 'click', (event) => { event.stopPropagation(); });
        wireEvento('toggleMultiSelectTipoProd', 'click', () => { const e2 = $('listaFiltroTipoProd'); e2.style.display = e2.style.display === 'block' ? 'none' : 'block'; });
        wireEvento('listaFiltroTipoProd', 'click', (event) => { event.stopPropagation(); });
        wireEvento('marcarTodosLocalProd', 'click', () => { locaisProducaoExcluidos = []; salvarFiltrosFilaCorte(); renderizarFilaCorte(); });
        wireEvento('marcarTodosTipoProd', 'click', () => { tiposProdutoExcluidos = []; salvarFiltrosFilaCorte(); renderizarFilaCorte(); });
        wireEvento('abrirAba-aba-fluxo-consolidado', 'click', (event) => { abrirAba(event, 'aba-fluxo-consolidado'); });
        wireEvento('abrirAba-aba-necessidade', 'click', (event) => { abrirAba(event, 'aba-necessidade'); renderizarNecessidadePorReferencia(); });
        wireEvento('btnAtualizarNecessidade', 'click', () => { renderizarNecessidadePorReferencia(); });
        wireEvento('btnModoNecessidade', 'click', () => { alternarModoLevantamentoNecessidade(); });
        wireEvento('buscaNecessidade', 'input', () => { renderizarNecessidadePorReferencia(); });
        wireEvento('toggleMultiSelectEtapa', 'click', () => { toggleMultiSelectEtapa(); });
        wireEvento('toggleMultiSelectDataCorte', 'click', () => { const e2 = $('listaFiltroDataCorte'); e2.style.display = e2.style.display === 'block' ? 'none' : 'block'; });
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
        wireEvento('listaFiltroEtapa', 'click', (event) => { event.stopPropagation(); });
        wireEvento('toggleMultiSelect', 'click', () => { toggleMultiSelect(); });
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
        wireEvento('mudarModoFluxo-acumulado-acumulado', 'change', () => { mudarModoFluxo('acumulado'); });
        wireEvento('mudarModoFluxo-diario-diario', 'change', () => { mudarModoFluxo('diario'); });
        wireEvento('renderizarFluxoConsolidado', 'click', () => { renderizarFluxoConsolidado(); });
}

window.onload = function () {
    // 0. Liga todos os botões/campos aos seus handlers (antes feito via onclick/onchange inline no HTML)
    inicializarEventosUI();

    if (localStorage.getItem('temaEscuro') === 'true') document.body.classList.add('dark-mode');

    // Restringe as abas já de cara (trata como visitante até confirmar login,
    // que é assíncrono) — evita mostrar todas as abas por um instante antes
    // de esconder de novo.
    aplicarRestricaoDeAbaVisitante();

    // 1. Inicia o sistema normalmente
    inicializarFiltroEtapa();
    inicializarFiltros();
    renderizarHistorico();
    renderizarFiltroDataCorte();

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
        carregarOPsDaNuvemParaVisitante();
        carregarPedidosDaNuvemParaVisitante();
        carregarGradeDaNuvemParaVisitante();
        carregarPrioridadeClientesDaNuvemParaVisitante();
        carregarLocalizacaoCompletaDaNuvemParaVisitante();
        carregarTodosPedidosDaNuvemParaVisitante();
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
['renderizarFluxoConsolidado', 'atualizarGrafico', 'atualizarGraficoOTD', 'mostrarTooltipOP'].forEach(nome => {
    const original = window[nome];
    if (typeof original === 'function') {
        window[nome] = function (...args) { return executarSeguro(nome, () => original.apply(this, args)); };
    }
});
