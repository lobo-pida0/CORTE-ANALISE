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
    agendarPublicacaoAutomatica();
}
// ☁️ Publicação automática: depois de qualquer importação/sincronização feita pelo admin,
// manda tudo pra nuvem sozinho (espera 4s pra juntar importações seguidas numa só publicação).
// Desligar: localStorage.setItem('publicacaoAutomatica','0').
let timerPublicacaoAuto = null, publicandoAuto = false;
// Indicador no topo: estados 'agendado' | 'publicando' | 'ok' | 'falha' | 'bloqueado'
function definirStatusNuvem(estado, detalhe) {
    const el = document.getElementById('indicadorNuvem'); if (!el) return;
    const mapa = {
        agendado:   ['fa-clock', 'rgba(255,255,255,0.18)', 'Vai publicar em instantes'],
        publicando: ['fa-cloud-arrow-up', 'rgba(70,130,200,0.55)', 'Publicando...'],
        ok:         ['fa-circle-check', 'rgba(46,125,91,0.75)', 'Publicado ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })],
        falha:      ['fa-triangle-exclamation', 'rgba(193,68,78,0.8)', 'Falhou — tente publicar de novo'],
        bloqueado:  ['fa-hand', 'rgba(184,134,42,0.85)', 'Publicação cancelada'],
    };
    const [ic, bg, txt] = mapa[estado] || mapa.agendado;
    el.style.display = ''; el.style.background = bg;
    el.innerHTML = `<i class="fas ${ic}"></i> ${txt}`;
    el.title = detalhe || txt;
    try { sessionStorage.setItem('ultimoStatusNuvem', JSON.stringify({ estado, detalhe: detalhe || '', hora: Date.now() })); } catch (e) { /* ignora */ }
}
// Proteção da publicação automática: se alguma tabela ficou MUITO menor que a da nuvem
// (ex.: planilha incompleta importada sem querer), pergunta antes de apagar da nuvem.
async function conferirQuedaAntesDePublicar() {
    const checagens = [
        ['ops', 'OPs', () => bancoDadosOPs.length],
        ['por_op_costura_detalhado', 'linhas do Sequenciamento', () => obterPorOPCosturaDetalhado().length],
        ['pedidos', 'itens de pedido', () => obterPedidosPendentes().length],
        ['localizacao_completa', 'localizações', () => obterSequenciaCompletaOPs().length],
    ];
    const quedas = [];
    for (const [tabela, nome, qtdLocal] of checagens) {
        const local = qtdLocal();
        if (!local) continue;   // vazio local nem é publicado (a tabela é pulada)
        try {
            const { count, error } = await supabaseClient.from(tabela).select('*', { count: 'exact', head: true });
            if (error || count === null) continue;
            if (count >= 20 && local < count * 0.7) quedas.push(`• ${nome}: ${count} na nuvem → ${local} aqui (−${Math.round((1 - local / count) * 100)}%)`);
        } catch (e) { /* sem contagem, segue */ }
    }
    if (!quedas.length) return true;
    return confirm('⚠️ A publicação automática vai REDUZIR bastante o que está na nuvem:\n\n' + quedas.join('\n') + '\n\nSe isso é esperado (muita coisa saiu da planilha), clique OK para publicar.\nSe a planilha importada estava incompleta, clique Cancelar — a nuvem fica como está.');
}
function agendarPublicacaoAutomatica() {
    try { if (localStorage.getItem('publicacaoAutomatica') === '0') return; } catch (e) { /* segue */ }
    clearTimeout(timerPublicacaoAuto);
    const ehAdmin = () => typeof supabaseClient !== 'undefined' && supabaseClient && sessaoAdminAtual && papelUsuarioAtual === 'admin';
    if (ehAdmin()) definirStatusNuvem('agendado');
    timerPublicacaoAuto = setTimeout(async function tentar() {
        if (!ehAdmin()) return;
        if (publicandoAuto) { timerPublicacaoAuto = setTimeout(tentar, 4000); return; }
        publicandoAuto = true;
        try {
            if (!(await conferirQuedaAntesDePublicar())) { definirStatusNuvem('bloqueado', 'Você cancelou: a nuvem ficou como estava. Use PUBLICAR se quiser enviar mesmo assim.'); return; }
            await publicarTudoNoSupabase();
        } finally { publicandoAuto = false; }
    }, 4000);
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
        { chave: 'destino', elIds: ['atualizacao-destino'] },
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

// Cruza por número de OP com os dados da Fila de Corte (planilha diferente
// da Sincronização) pra achar o "Local de Produção" — a Sincronização
// sozinha não tem esse dado. Só funciona pras OPs que também apareceram
// numa importação de Fila de Corte; as outras ficam sem essa informação,
// sem quebrar nada (decisão do usuário, sabendo dessa limitação).
function obterLocalProducaoPorOP() {
    const mapa = new Map();
    obterOPsFilaCorte().forEach(item => {
        if (item.op && item.obs && !mapa.has(item.op)) mapa.set(item.op, item.obs);
    });
    // Fallback pra quem não tem Fila de Corte importada localmente (ex: o
    // visitante) — usa a versão enxuta publicada na nuvem só pra esse
    // cruzamento (não duplica a Fila de Corte inteira lá).
    try {
        const daNuvem = JSON.parse(localStorage.getItem('localProducaoPorOPNuvem') || '{}');
        Object.entries(daNuvem).forEach(([op, local]) => { if (!mapa.has(op)) mapa.set(op, local); });
    } catch (e) { /* ignora, só não usa o fallback */ }
    return mapa;
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
    if (papelUsuarioAtual === 'admin') verificarEspacoNuvem(false);
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
const ABAS_LIBERADAS_PARA_USUARIO = ['aba-prioridades', 'aba-kpi', 'aba-seq-costura', 'aba-urgencias'];
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
    const ehAdmin = !!sessaoAdminAtual;
    const linhas = lista.map((cliente, i) => `
        <div style="display:flex; align-items:center; gap:10px; padding:8px 12px; border-bottom:1px solid var(--borda-cor);">
            <span style="width:28px; text-align:center; font-weight:900; color:var(--texto-secundario);">${i + 1}º</span>
            <span style="flex:1; font-weight:600;">${cliente}</span>
            ${ehAdmin ? `
            <button onclick="moverClientePrioridade(${i}, -1)" class="btn" style="padding:4px 8px; background:var(--bg-painel); color:var(--texto-cor);" ${i === 0 ? 'disabled' : ''}><i class="fas fa-arrow-up"></i></button>
            <button onclick="moverClientePrioridade(${i}, 1)" class="btn" style="padding:4px 8px; background:var(--bg-painel); color:var(--texto-cor);" ${i === lista.length - 1 ? 'disabled' : ''}><i class="fas fa-arrow-down"></i></button>
            <button onclick="removerClientePrioridade(${i})" class="btn btn-perigo" style="padding:4px 8px;"><i class="fas fa-trash"></i></button>
            ` : ''}
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
            ${ehAdmin ? `
            <div style="display:flex; gap:10px;">
                <input type="text" id="inputNovoClientePrioridade" placeholder="Nome do cliente..." style="flex:1;">
                <button onclick="adicionarClientePrioridade()" class="btn btn-sugestao"><i class="fas fa-plus"></i> ADICIONAR</button>
            </div>
            ` : ''}
        </div>
    `;
}

function moverClientePrioridade(idx, direcao) {
    if (!exigirAdmin('editar a prioridade de clientes')) return;
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
    if (!e.target.closest('.multi-select-container') && !e.target.closest('.multi-select-options')) {
        $$('.multi-select-options').forEach(o => { o.style.display = 'none'; });
    }
});

// Os dropdowns de filtro são position:fixed (pra não serem cortados pelo
// overflow:hidden do container da aba — ver comentário no CSS), mas isso
// significa que eles NÃO acompanham a rolagem sozinhos. Em vez de recalcular
// a posição toda hora que rola (mais complexo e arriscado), fecha o
// dropdown assim que qualquer rolagem acontecer — inclusive rolagem DENTRO
// de uma área com scroll próprio, tipo a tabela (por isso o "true" no
// final, que pega o evento na fase de captura, já que "scroll" não borbulha
// como outros eventos).
document.addEventListener('scroll', (e) => {
    // Se a rolagem aconteceu DENTRO do próprio dropdown (ele tem scroll
    // próprio quando a lista é grande), não fecha — só fecha quando é a
    // página ou algum outro container por trás que rolou.
    if (e.target && e.target.closest && e.target.closest('.multi-select-options')) return;
    $$('.multi-select-options').forEach(o => { o.style.display = 'none'; });
}, true);

// Abre/fecha um menu suspenso do cabeçalho, fechando qualquer outro que já
// estivesse aberto (evita dois menus abertos ao mesmo tempo).
function toggleDropdown(id) {
    const menu = $(id);
    const jaAberto = menu.classList.contains('aberto');
    $$('.dropdown-menu.aberto').forEach(m => m.classList.remove('aberto'));
    if (!jaAberto) menu.classList.add('aberto');
}

// Igual toggleDropdown, mas pra menus que vivem dentro de um container com
// overflow:auto (como .tabs-container, que faz a barra de abas rolar
// horizontalmente quando não cabe tudo) — um dropdown position:absolute
// normal ficaria CORTADO por esse overflow, mesmo com z-index alto (mesma
// armadilha já documentada nos filtros multi-select). Resolve do mesmo
// jeito: move o menu pra filho direto do <body> e calcula a posição via
// JS (position:fixed), escapando do corte.
function toggleDropdownFixo(idBotao, idMenu) {
    const menu = $(idMenu);
    if (!menu.dataset.movidoParaBody) {
        document.body.appendChild(menu);
        menu.dataset.movidoParaBody = '1';
    }
    const jaAberto = menu.classList.contains('aberto');
    $$('.dropdown-menu.aberto').forEach(m => m.classList.remove('aberto'));
    if (jaAberto) return;
    const gatilho = $(idBotao);
    if (gatilho) {
        const rect = gatilho.getBoundingClientRect();
        menu.style.position = 'fixed';
        menu.style.left = Math.round(rect.left) + 'px';
        menu.style.top = Math.round(rect.bottom + 6) + 'px';
        menu.style.right = 'auto';
    }
    menu.classList.add('aberto');
}

function ctxAcao(acao) {
    if (!opContextoId) return; let op = bancoDadosOPs.find(o => o.id === opContextoId); if (!op) return;
    if (acao === 'copiar') { navigator.clipboard.writeText(op.id); $('ctxMenu').style.display = 'none'; return; }
    if (!exigirAdmin('mexer nas OPs')) { $('ctxMenu').style.display = 'none'; return; }
    if (acao === 'prioridade') { registrarEstado(); op.prioridade = !op.prioridade; localStorage.setItem('bancoOPs', JSON.stringify(bancoDadosOPs)); cacheGruposPorReferencia = null; renderizarTudoImediato(); }
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
    bancoDadosOPs.push(op2); localStorage.setItem('bancoOPs', JSON.stringify(bancoDadosOPs)); cacheGruposPorReferencia = null; fecharModais(); renderizarTudoImediato();
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
function avancarEtapaOP(id) { if (!exigirAdmin('avançar etapa')) return; let op = bancoDadosOPs.find(o => o.id === id); if (op && op.etapa < 7) { registrarEstado(); op.etapa = proximaEtapa(op.etapa, op); op.dataEntradaEtapa = new Date(); localStorage.setItem('bancoOPs', JSON.stringify(bancoDadosOPs)); cacheGruposPorReferencia = null; renderizarTudoImediato(); } }

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

// Confere se a biblioteca de leitura de Excel carregou antes de tentar usar
// — sem isso, o erro que aparecia era um "XLSX is not defined" cru, sem
// explicação nenhuma. CDN às vezes falha por um instante; recarregar a
// página (F5) quase sempre resolve.
function exigirBibliotecaExcel() {
    if (typeof XLSX !== 'undefined') return true;
    registrarLogDebug('error', ['Tentativa de ler planilha sem a biblioteca de Excel carregada (XLSX indefinido).']);
    showToast('<i class="fas fa-triangle-exclamation"></i> A biblioteca de leitura de planilhas não carregou. Recarregue a página (F5) e tente de novo.', true);
    return false;
}

// Acha, na planilha de sincronização, em qual coluna estão o PRODUTO
// (camisa, calça, jaqueta...) e o LASER. Antes o LASER era lido sempre do
// índice 41 (coluna AP) — mas o usuário adicionou uma coluna de produto
// também na AP, então o LASER pode ter ido pra outra coluna, e continuar
// lendo "AP = laser" faria TODA OP a laser deixar de ser marcada, sem
// nenhum aviso. Por isso agora procura pelo NOME do cabeçalho primeiro.
// Ordem de decisão:
//  1) cabeçalho "LASER" e cabeçalho com "PRODUTO" → usa onde estiverem;
//  2) achou o LASER em OUTRA coluna que não a AP → a AP está livre e é o produto;
//  3) não achou nenhum dos dois cabeçalhos → decide pelo CONTEÚDO da AP
//     (se tem "LASER" nela, é o laser; se tem outro texto, é o produto).
// Devolve também as letras (AP, AQ...) pra mostrar no aviso da importação.
function detectarColunasProdutoELaser(rows) {
    const semAc = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();
    const letra = i => { let s = '', n = i + 1; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };

    // Linha de cabeçalho: a das primeiras 4 que tem a coluna "CHAVE"; senão a 2ª (índice 1), como sempre foi
    let idxLinhaCab = [0, 1, 2, 3].find(i => rows[i] && rows[i].some(c => semAc(c) === 'CHAVE'));
    if (idxLinhaCab === undefined) idxLinhaCab = 1;
    // Array.from (não .map direto): a linha de cabeçalho vem do Excel com
    // "buracos" nas células vazias (ex: a coluna W não tem título), e .map
    // pula buraco — o findIndex depois dava erro em cima de undefined.
    const cab = Array.from(rows[idxLinhaCab] || [], semAc);

    const AP = 41;
    let idxLaser = cab.indexOf('LASER');
    let idxProduto = cab.findIndex(c => c.includes('PRODUTO'));

    if (idxLaser === -1 && idxProduto === -1) {
        const conteudoAP = rows.slice(idxLinhaCab + 1).map(r => r && r[AP]).filter(v => v !== undefined && v !== null && String(v).trim() !== '');
        if (conteudoAP.some(v => semAc(v).includes('LASER'))) idxLaser = AP;
        else if (conteudoAP.length) idxProduto = AP;
    } else if (idxProduto === -1 && idxLaser !== -1 && idxLaser !== AP) {
        idxProduto = AP;
    }
    // Laser sem cabeçalho achado: comportamento antigo (coluna AP), a não ser que a AP seja o produto
    if (idxLaser === -1 && idxProduto !== AP) idxLaser = AP;

    return {
        idxLinhaCab, idxLaser, idxProduto,
        letraLaser: idxLaser !== -1 ? letra(idxLaser) : null,
        letraProduto: idxProduto !== -1 ? letra(idxProduto) : null,
    };
}

function processarExcel() {
    if (!exigirAdmin('sincronizar a planilha')) return;
    if (!exigirBibliotecaExcel()) return;
    const input = $('inputExcel'); if (!input.files[0]) return alert("Selecione um arquivo!");
    const r = new FileReader();
    r.onload = function (e) {
      try {
        registrarEstado();
        const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array', cellDates: true });
        // A prioridade (estrela) agora vem da importação separada "Destino de
        // Produção" (DESTINO), não mais da aba URGENCIAS dessa planilha —
        // decisão do usuário, já que o relatório de destino traz uma
        // prioridade mais confiável (numérica, vinda direto do sistema).
        const prioridadesDestino = obterPrioridadesDestino();
        const prioridadesManuais = obterPrioridadesManuais();
        const mesesDestino = obterOpsMesDestino();
        const numerosPrioridade = obterNumerosPrioridade();
        const locaisDestinoPorOP = obterLocaisDestinoPorOP();
        const opsDestacadas = obterOPsDestacadas();

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
        const colunasSinc = detectarColunasProdutoELaser(rows); // onde estão LASER e PRODUTO (a planilha mudou de layout)
        const lerProduto = r => (colunasSinc.idxProduto !== -1 && r[colunasSinc.idxProduto]) ? String(r[colunasSinc.idxProduto]).trim().toUpperCase() : '';
        let mapA = {}; bancoDadosOPs.forEach(o => mapA[chaveDaOP(o)] = o); bancoDadosOPs = [];   // pela chave ciclo-OP: o mesmo número em 2 ciclos são OPs diferentes
        const sincronizacaoInicial = Object.keys(mapA).length === 0; // primeira vez que sincroniza nesse navegador
        let movimentacoes = []; // OPs que trocaram de etapa nessa sincronização
        // OPs em "Aguardando Matéria Prima" — fica ANTES da Programação no
        // processo real, sem lugar natural na escala 0-7 de etapa (que é
        // usada em muita coisa sensível: cores, filtros, avançar etapa,
        // Gargalo...). Por segurança, guardada numa lista PRÓPRIA, sem
        // misturar com bancoDadosOPs — usada hoje só pelo Agrupador por
        // Referência.
        const opsAguardandoMP = [];

        for (let i = 1; i < rows.length; i++) {
            const r = rows[i]; if (!r) continue;

            // LÓGICA DE CRIAÇÃO DO BANCO DE DADOS (Mantida igual a sua original)
            if (r[5] && !['OP', 'ORDEM'].includes(String(r[5]).trim().toUpperCase())) {
                const loc = (r[21] ? String(r[21]).toUpperCase() : "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

                // "PNP ANALISE DE MATERIA PRIMA" também cai aqui (antes caía em ANALISE DE MEDIDAS por causa da palavra ANALISE)
                if ((loc.includes("AGUARD") || loc.includes("ANALISE")) && loc.includes("MATERIA") && loc.includes("PRIMA")) {
                    opsAguardandoMP.push({
                        id: String(r[5]).trim(), ciclo: String(r[4] || ""), desc: String(r[3] || ""),
                        qtd: parseInt(r[6]) || 0, diasLocal: parseInt(r[25]) || 0,
                        codigoMP: r[38] ? String(r[38]).trim().toUpperCase() : "SEM CÓDIGO",
                        referencia: r[40] ? String(r[40]).trim().toUpperCase() : "",
                        produto: lerProduto(r),
                        sobMedida: mapaSBM.has(String(r[5]).trim()),
                        analiseMP: loc.includes("ANALISE")
                    });
                    continue; // não passa pela lógica de etapa 0-7 abaixo
                }

                let idxE = -1;
                if (loc.includes("CORTE") && !loc.includes("PROG") && !loc.includes("ENFESTO")) idxE = 7; else if (loc.includes("ENFESTO")) idxE = 6; else if (loc.includes("DUBLA")) idxE = 5; else if (loc.includes("ALMOX") && loc.includes("TECIDO")) idxE = 4; else if (loc.includes("PROG") && loc.includes("CORTE")) idxE = 3; else if (loc.includes("CAD")) idxE = 2; else if (loc.includes("ANALISE") || loc.includes("MEDIDA")) idxE = 1; else if (loc.includes("PROGRAMACAO")) idxE = 0;

                if (idxE !== -1) {
                    const idOP = String(r[5]).trim(), cicloOP = String(r[4] || ""), chaveOP = montarChaveOP(cicloOP, idOP), old = mapA[chaveOP];
                    if (old && old.etapa !== idxE) movimentacoes.push({ id: idOP, ciclo: String(r[4] || ""), deIdx: old.etapa, paraIdx: idxE });
                    bancoDadosOPs.push({
                        id: idOP, ciclo: String(r[4] || ""), desc: String(r[3] || ""),
                        qtd: parseInt(r[6]) || 0, tempoCorte: parseFloat(r[7]) || 0,
                        etapa: idxE, dataCorte: extrairDataExcel(r[23]), // coluna X (antes era P/15)
                        localDestino: r[17] ? String(r[17]).trim().toUpperCase() : "N/D",
                        localExcel: r[21] ? String(r[21]).trim().toUpperCase() : "",
                        temDublado: r[18] ? String(r[18]).toUpperCase().includes("SIM") : false,
                        prioridade: prioridadesDestino.has(chaveOP) || prioridadesManuais.has(chaveOP), // fonte: importação "Destino de Produção" OU marcação manual — antes vinha da aba URGENCIAS
                        mesDestino: mesesDestino[chaveOP] || null, // "AAAA-MM" informado na importação de Destino — planilha não tem data que sirva pra isso
                        numeroPrioridade: numerosPrioridade[chaveOP] || null, // valor bruto da coluna Prioridade — só exibição
                        localDestinoDetalhado: locaisDestinoPorOP[chaveOP] || null, // "Descrição Local" do Destino — cobre etapas fora das 8 rastreadas
                        destaque: opsDestacadas.has(chaveOP), // "faça essa primeiro" — marcado na aba Prioridades
                        dataEntradaEtapa: (old && old.etapa === idxE && old.dataEntradaEtapa) ? old.dataEntradaEtapa : new Date(),
                        diasLocal: parseInt(r[25]) || 0,
                        codigoMP: r[38] ? String(r[38]).trim().toUpperCase() : "SEM CÓDIGO",
                        descMP: r[39] ? String(r[39]).trim().toUpperCase() : "🔍 COLUNA VAZIA",
                        referencia: r[40] ? String(r[40]).trim().toUpperCase() : "", // coluna AO
                        sobMedida: mapaSBM.has(idOP), // aba BASE, coluna Y ("Descrição OP" contém "SBM")
                        laser: (colunasSinc.idxLaser !== -1 && r[colunasSinc.idxLaser]) ? String(r[colunasSinc.idxLaser]).trim().toUpperCase().includes('LASER') : false, // coluna do LASER (achada pelo cabeçalho)
                        produto: lerProduto(r), // camisa/calça/jaqueta... — só local (não vai pra nuvem), usado no filtro de Produto
                        dataFinalizacao: mapaFinalizacao.get(idOP) || null, // aba BASE, coluna P
                        dataCorteSuposta: calcularDataCorteSuposta(mapaFinalizacao.get(idOP)),
                        dataInclusao: extrairDataExcel(r[16]) || null, // quando a OP foi criada — base do cálculo de lead time por setor
                    });
                }
            }

        }

        // Grava as OPs e finaliza a importação
        localStorage.setItem('bancoOPs', JSON.stringify(bancoDadosOPs)); cacheGruposPorReferencia = null;
        localStorage.setItem('opsAguardandoMP', JSON.stringify(opsAguardandoMP));
        inicializarFiltros();
        renderizarFiltroDataCorte();
        renderizarFiltroMesDestino();
        renderizarFiltroProduto();
        reconstruirFiltrosPrioridades();
        renderizarTudoImediato();

        input.value = '';
        registrarAtualizacao('bancoOPs'); atualizarIndicadoresDeAtualizacao();
        // Avisa de onde o Produto foi lido — se a coluna não existir/mudar de
        // lugar de novo, o usuário vê na hora em vez de achar que o filtro quebrou.
        const qtdComProduto = bancoDadosOPs.filter(o => o.produto).length;
        let avisoProduto = '';
        if (colunasSinc.idxProduto === -1) avisoProduto = ` <br><i class='fas fa-triangle-exclamation'></i> Não achei a coluna de PRODUTO na planilha — o filtro de Produto ficou vazio.`;
        else avisoProduto = ` Produto lido da coluna ${colunasSinc.letraProduto} (${qtdComProduto} de ${bancoDadosOPs.length} OPs com produto).`;
        showToast("<i class='fas fa-check-double'></i> Planilha e OTD atualizados!" + avisoProduto);

        // Painel de balanço: quem mudou de setor, quem é novo, quem saiu da
        // planilha — só faz sentido comparar se já existia uma sincronização
        // anterior pra comparar contra.
        if (!sincronizacaoInicial) {
            const chavesNovas = new Set(bancoDadosOPs.map(chaveDaOP));
            const entradas = bancoDadosOPs.filter(o => !mapA[chaveDaOP(o)]);
            const chavesAindaNaPlanilhaMP = new Set(opsAguardandoMP.map(chaveDaOP));   // foi pra Aguard./Análise de Matéria Prima: continua na planilha, não "saiu"
            const saidas = Object.keys(mapA).filter(k => !chavesNovas.has(k) && !chavesAindaNaPlanilhaMP.has(k)).map(k => ({ id: mapA[k].id, ciclo: mapA[k].ciclo, deIdx: mapA[k].etapa }));
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
// A OP aparece hoje na aba Prioridades? (marcada no Destino, marcada à mão, OP manual cadastrada,
// ou OP "automática" do Destino que já saiu da sincronização) — mesma fonte que a aba usa.
function opEstaNaAbaPrioridades(ciclo, id) {
    const chave = montarChaveOP(ciclo, id);
    if (obterPrioridadesDestino().has(chave) || obterPrioridadesManuais().has(chave)) return true;
    if (obterOpsDestinoAutomaticas()[chave]) return true;
    if (obterOpsManuaisPrioridade().some(o => chaveDaOP(o) === chave)) return true;
    const naSinc = bancoDadosOPs.find(o => chaveDaOP(o) === chave);
    return !!(naSinc && naSinc.prioridade);
}
// Selo de OP do balanço: padrão (neutro) ou DESTACADO (⭐, cor própria) se estiver na aba Prioridades.
function seloOPBalanco(ciclo, id, texto, estiloNormal, classeNormal) {
    if (opEstaNaAbaPrioridades(ciclo, id)) {
        return `<span class="pill" title="Essa OP está na aba Prioridades" style="background:var(--cor-selecao); color:white; font-weight:700; margin:2px 3px 0 0; display:inline-block; box-shadow:0 0 0 2px rgba(0,0,0,0.12);"><i class="fas fa-star" style="font-size:9px;"></i> ${texto}</span>`;
    }
    return `<span class="pill ${classeNormal || ''}" style="${estiloNormal}">${texto}</span>`;
}
const ordenarPrioridadesPrimeiro = (lista, pegar) => [...lista].sort((a, b) => (opEstaNaAbaPrioridades(...pegar(b)) ? 1 : 0) - (opEstaNaAbaPrioridades(...pegar(a)) ? 1 : 0));

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
            <div>${ordenarPrioridadesPrimeiro(g.ops, m => [m.ciclo, m.id]).map(m => seloOPBalanco(m.ciclo, m.id, `${m.id}${m.ciclo ? ' · ' + m.ciclo : ''}`, 'background:var(--bg-card); border:1px solid var(--borda-cor); color:var(--texto-cor); margin:2px 3px 0 0; display:inline-block;')).join('')}</div>
        </div>
    `).join('');

    const entradasHtml = entradas.length === 0 ? '' : `
        <div style="margin-top:14px;">
            <div style="font-size:12px; font-weight:700; color:var(--cor-despacho); margin-bottom:6px;"><i class="fas fa-plus-circle"></i> NOVAS NA PLANILHA (${entradas.length})</div>
            <div>${ordenarPrioridadesPrimeiro(entradas, o => [o.ciclo, o.id]).map(o => seloOPBalanco(o.ciclo, o.id, `${o.id} · ${nomesEtapas[o.etapa]}`, 'margin:2px 3px 0 0; display:inline-block;', 'pill-ok')).join('')}</div>
        </div>`;

    const saidasHtml = saidas.length === 0 ? '' : `
        <div style="margin-top:14px;">
            <div style="font-size:12px; font-weight:700; color:var(--texto-secundario); margin-bottom:6px;"><i class="fas fa-sign-out-alt"></i> SAÍRAM DA PLANILHA (${saidas.length}) <span style="font-weight:400;">— provavelmente terminaram o corte e seguiram pra costura</span></div>
            <div>${ordenarPrioridadesPrimeiro(saidas, o => [o.ciclo, o.id]).map(o => seloOPBalanco(o.ciclo, o.id, `${o.id} · estava em ${nomesEtapas[o.deIdx]}`, 'background:var(--cor-historico); margin:2px 3px 0 0; display:inline-block;')).join('')}</div>
        </div>`;

    const totalPrioNoBalanco = movimentacoes.filter(m => opEstaNaAbaPrioridades(m.ciclo, m.id)).length + entradas.filter(o => opEstaNaAbaPrioridades(o.ciclo, o.id)).length + saidas.filter(o => opEstaNaAbaPrioridades(o.ciclo, o.id)).length;
    const legendaPrioridadesBalanco = `<div style="display:flex; align-items:center; gap:8px; font-size:11px; color:var(--texto-secundario); margin-bottom:10px;"><span class="pill" style="background:var(--cor-selecao); color:white; font-weight:700;"><i class="fas fa-star" style="font-size:9px;"></i> 0000</span> = OP que está na aba Prioridades${totalPrioNoBalanco ? ` — <strong style="color:var(--texto-cor);">${totalPrioNoBalanco} neste balanço</strong>` : ' — nenhuma neste balanço'}</div>`;
    $('modalBalancoSincronizacao').innerHTML = `
        <div class="modal-card" style="width:640px; max-width:92vw; border-top:5px solid var(--cor-sugestao); max-height:85vh;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; border-bottom:2px solid var(--borda-cor); padding-bottom:10px; flex-shrink:0;">
                <h2 style="margin:0; color:var(--texto-cor); display:flex; align-items:center; gap:10px; font-size:16px;"><i class="fas fa-right-left" style="color:var(--cor-sugestao);"></i> BALANÇO DA SINCRONIZAÇÃO</h2>
                <button onclick="fecharModais()" class="modal-fechar-btn"><i class="fas fa-times"></i></button>
            </div>
            <div style="overflow-y:auto; flex:1;">
                ${legendaPrioridadesBalanco}
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
    if (!exigirBibliotecaExcel()) return;
    const input = $('inputGrades'); if (!input.files[0]) return;
    const r = new FileReader();
    r.onload = function (e) {
        try {
            const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
            const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
            if (!rows.length) throw new Error("Planilha vazia.");

            const cab = rows[0].map(c => String(c || '').trim().toUpperCase());
            const idxOP = cab.findIndex(c => c === 'OP' || c.startsWith('OP '));
            const idxCiclo = cab.findIndex(c => c === 'CICLO'); // usado JUNTO com a OP na chave — dois ciclos diferentes podem reutilizar o mesmo número de OP (confirmado: OP 3855 é avental no ciclo 211 e calçado no ciclo 111)
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
                const ciclo = idxCiclo !== -1 && row[idxCiclo] !== undefined && row[idxCiclo] !== null ? String(row[idxCiclo]).trim() : '';
                const chave = chaveGrade(opId, ciclo);
                const referencia = String(row[idxRef] || '').trim().toUpperCase();
                const tamanho = String(row[idxTam] || '').trim().toUpperCase();
                const qtd = parseInt(row[idxQtd]) || 0;
                const local = idxLocalFallback !== -1 ? String(row[idxLocalFallback] || '').trim().toUpperCase() : '';
                if (!opId || !tamanho) continue;
                if (!grades[chave]) grades[chave] = { op: opId, ciclo, referencia, tamanhos: {}, locaisPorTamanho: {} };
                grades[chave].tamanhos[tamanho] = (grades[chave].tamanhos[tamanho] || 0) + qtd;
                if (local) {
                    if (!grades[chave].locaisPorTamanho[tamanho]) grades[chave].locaisPorTamanho[tamanho] = [];
                    const entrada = grades[chave].locaisPorTamanho[tamanho].find(e => e.local === local);
                    if (entrada) entrada.qtd += qtd;
                    else grades[chave].locaisPorTamanho[tamanho].push({ local, qtd });
                }
                linhasLidas++;
            }

            if (linhasLidas === 0) throw new Error("Nenhuma linha válida encontrada (confira se OP e Tamanho estão preenchidos).");

            localStorage.setItem('gradesPorOP', JSON.stringify(grades));
            cacheGradesPorOP = null;
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
    if (!exigirBibliotecaExcel()) return;
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
            const idxDescricao = cab.findIndex(c => c === 'DESCRIÇÃO' || c === 'DESCRICAO'); // opcional — algumas referências são só um código numérico (ex: "015"), a descrição diz o que é de verdade

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
                    faltaEstoque: idxFaltaEstoque !== -1 ? (parseFloat(row[idxFaltaEstoque]) || 0) : 0,
                    descricao: idxDescricao !== -1 && row[idxDescricao] ? String(row[idxDescricao]).trim() : ''
                };
                todos.push(item);
                if (faltaOP > 0) pendentes.push(item);
            }

            localStorage.setItem('pedidosPendentes', JSON.stringify(pendentes));
            cacheTodosPedidosPorReferencia = null;
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

// =========================================================================
// 🎯 DESTINO DE PRODUÇÃO — planilha "Por Ordem de Produção Destino". Fonte
// NOVA da prioridade (estrela) das OPs, substituindo a aba URGENCIAS da
// Planilha A (decisão do usuário). A coluna "Prioridade" aqui é um número
// (1 a 10 = prioridade real, 99 = sem prioridade — mesma convenção usada no
// "Prior" da planilha de Pedidos) — é consistente entre os tamanhos de uma
// mesma OP, então basta olhar 1 linha por OP.
// =========================================================================
function processarDestino() {
    if (!exigirAdmin('importar o destino de produção')) return;
    if (!exigirBibliotecaExcel()) return;
    const input = $('inputDestino'); if (!input.files[0]) return;

    // A planilha só tem a data de ENTRADA no local — não representa pra qual
    // mês a OP está sendo destinada. Como cada arquivo importado É de um mês
    // específico (você me manda um arquivo por mês), pergunto aqui e marco
    // todas as OPs desse arquivo com esse mês.
    const mesInformado = prompt('Esse relatório é de qual mês? (formato AAAA-MM, ex: 2026-06)', new Date().toISOString().slice(0, 7));
    if (!mesInformado || !/^\d{4}-\d{2}$/.test(mesInformado.trim())) {
        showToast('<i class="fas fa-triangle-exclamation"></i> Mês inválido ou não informado (formato esperado: AAAA-MM). Importação cancelada.', true);
        input.value = '';
        return;
    }
    const mes = mesInformado.trim();

    const r = new FileReader();
    r.onload = function (e) {
        try {
            const data = new Uint8Array(e.target.result);
            const wb = XLSX.read(data, { type: 'array' });
            const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
            const cab = rows[0].map(c => String(c || '').trim().toUpperCase());

            const idxOP = cab.findIndex(c => c === 'OP');
            const idxPrioridade = cab.findIndex(c => c.startsWith('PRIOR'));
            const idxDescLocal = cab.findIndex(c => c === 'DESCRIÇÃO LOCAL' || c === 'DESCRICAO LOCAL');
            const idxDescricaoProduto = cab.findIndex(c => c === 'DESCRIÇÃO' || c === 'DESCRICAO');
            const idxQtdDestino = cab.findIndex(c => c.includes('QT') && c.includes('DESTINO') && c.includes('LOCAL') && !c.includes('DIFER') && !c.includes('FECHA'));
            const idxDiasLocalDestino = cab.findIndex(c => c === 'DIAS LOCAL');
            const idxCiclo = cab.findIndex(c => c === 'CICLO');   // o mesmo número de OP existe em ciclos diferentes — o ciclo faz parte da identidade
            if (idxOP === -1) {
                throw new Error("Não encontrei a coluna OP no cabeçalho da planilha (primeira linha).");
            }

            // Acumula em cima do que já existia de outras importações — só
            // as OPs que aparecem NESSE arquivo têm seu estado reavaliado;
            // as que não aparecem aqui mantêm o que já tinham de uma
            // importação anterior. Antes disso, importar um mês novo
            // APAGAVA a prioridade dos meses anteriores por engano.
            //
            // A coluna "Prioridade" da planilha é um dado interno do
            // sistema de origem do usuário — NÃO é usada aqui pra decidir
            // quem é prioritária ou não (toda OP do relatório entra). O
            // número em si é só guardado pra MOSTRAR na tela, não filtra
            // nada.
            //
            // "Descrição Local" é o local ATUAL da OP segundo essa
            // planilha — cobre etapas fora das 8 rastreadas pela
            // Sincronização (ex: costura, etiquetação), usado como opção
            // extra no filtro de Setor da aba Prioridades.
            const prioritarias = obterPrioridadesDestino();
            const mesPorOP = obterOpsMesDestino(); // acumula em cima do que já tinha de outros meses
            const numeroPorOP = obterNumerosPrioridade(); // acumula igual, só informativo
            const localPorOP = obterLocaisDestinoPorOP(); // acumula igual
            // OPs que aparecem no Destino mas NÃO existem na Sincronização
            // (comum pras que já passaram das 8 etapas rastreadas, tipo
            // costura) — o Destino sozinho tem dado suficiente (Descrição,
            // Peças, Dias Parado) pra montar a linha, sem precisar dessas
            // OPs existirem em bancoDadosOPs.
            const opsAutomaticas = obterOpsDestinoAutomaticas();
            let linhasLidas = 0, linhasAmbiguasSemCiclo = 0;
            for (let i = 1; i < rows.length; i++) {
                const row = rows[i]; if (!row || !row[idxOP]) continue;
                const opNumero = String(row[idxOP]).trim();
                let ciclo = idxCiclo !== -1 ? normalizarParteChaveOP(row[idxCiclo]) : '';
                // Sem ciclo na linha (ou planilha sem a coluna): só dá pra cruzar se o número for ÚNICO na
                // Sincronização; se existe em 2+ ciclos não dá pra saber qual é — pula a linha em vez de chutar.
                if (!ciclo) {
                    const candidatas = [...new Set(bancoDadosOPs.filter(o => o.id === opNumero).map(chaveDaOP))];
                    if (candidatas.length === 1) ciclo = separarChaveOP(candidatas[0]).ciclo;
                    else if (candidatas.length > 1) { linhasAmbiguasSemCiclo++; continue; }
                }
                // OP da Sincronização que é essa (mesmo número e mesmo ciclo — ou sem ciclo gravado): usa a chave dela
                const opNaSinc = bancoDadosOPs.find(o => o.id === opNumero && (!normalizarParteChaveOP(o.ciclo) || normalizarParteChaveOP(o.ciclo) === ciclo));
                const opId = opNaSinc ? chaveDaOP(opNaSinc) : montarChaveOP(ciclo, opNumero);   // a "chave" (nome mantido pra não mexer no resto do bloco)
                prioritarias.add(opId);
                mesPorOP[opId] = mes; // se essa OP já tinha mês de uma importação anterior, o mais recente vence
                if (idxPrioridade !== -1 && row[idxPrioridade] !== undefined && row[idxPrioridade] !== null && row[idxPrioridade] !== '') {
                    numeroPorOP[opId] = String(row[idxPrioridade]).trim();
                }
                const localDetalhado = idxDescLocal !== -1 && row[idxDescLocal] ? String(row[idxDescLocal]).trim().toUpperCase() : null;
                if (localDetalhado) localPorOP[opId] = localDetalhado;

                if (opId !== opNumero) delete opsAutomaticas[opNumero];   // versão antiga dessa OP, de antes do ciclo ser guardado
                if (!opNaSinc) {
                    opsAutomaticas[opId] = {
                        id: opNumero, ciclo,
                        desc: idxDescricaoProduto !== -1 && row[idxDescricaoProduto] ? String(row[idxDescricaoProduto]).trim() : '(sem descrição)',
                        qtd: idxQtdDestino !== -1 ? (parseInt(row[idxQtdDestino]) || 0) : 0,
                        diasLocal: idxDiasLocalDestino !== -1 ? (parseInt(row[idxDiasLocalDestino]) || 0) : 0,
                        localDestinoDetalhado: localDetalhado,
                        mesDestino: mes,
                        numeroPrioridade: numeroPorOP[opId] || null,
                    };
                } else {
                    delete opsAutomaticas[opId]; // a OP passou a existir na Sincronização, não precisa mais da versão automática
                }
                linhasLidas++;
            }
            if (linhasLidas === 0) throw new Error("Nenhuma linha válida encontrada (confira se a coluna OP está preenchida).");

            localStorage.setItem('prioridadesDestino', JSON.stringify([...prioritarias]));
            localStorage.setItem('opsMesDestino', JSON.stringify(mesPorOP));
            localStorage.setItem('numerosPrioridade', JSON.stringify(numeroPorOP));
            localStorage.setItem('locaisDestinoPorOP', JSON.stringify(localPorOP));
            salvarOpsDestinoAutomaticas(opsAutomaticas);

            // Reaplica prioridade E mês nas OPs que JÁ ESTÃO na tela agora —
            // sem isso, quem importasse o Destino DEPOIS de já ter
            // sincronizado só veria a mudança na próxima sincronização, o
            // que não é óbvio (a pessoa acha que já devia ter atualizado na
            // hora).
            let mudou = 0;
            bancoDadosOPs.forEach(op => {
                const chaveOPAtual = chaveDaOP(op);
                const novaPrioridade = prioritarias.has(chaveOPAtual);
                const novoMes = mesPorOP[chaveOPAtual] || null;
                const novoNumero = numeroPorOP[chaveOPAtual] || null;
                const novoLocal = localPorOP[chaveOPAtual] || null;
                if (op.prioridade !== novaPrioridade || op.mesDestino !== novoMes || op.numeroPrioridade !== novoNumero || op.localDestinoDetalhado !== novoLocal) {
                    op.prioridade = novaPrioridade; op.mesDestino = novoMes; op.numeroPrioridade = novoNumero; op.localDestinoDetalhado = novoLocal; mudou++;
                }
            });
            if (mudou > 0) localStorage.setItem('bancoOPs', JSON.stringify(bancoDadosOPs));
            cacheGruposPorReferencia = null; // a prioridade/mês não entram nesse cache, mas por segurança

            input.value = '';
            renderizarFiltroMesDestino();
            reconstruirFiltrosPrioridades();
            renderizarTudoImediato();
            registrarAtualizacao('destino'); atualizarIndicadoresDeAtualizacao();
            showToast(`<i class="fas fa-check-double"></i> Destino de ${mes} importado! ${prioritarias.size} OP(s) com prioridade${mudou > 0 ? ` — ${mudou} OP(s) já na tela foram atualizadas agora` : ''}.${linhasAmbiguasSemCiclo ? ` ⚠ ${linhasAmbiguasSemCiclo} linha(s) sem ciclo foram puladas: o número existe em mais de um ciclo.` : ''}${idxCiclo === -1 ? ' ⚠ A planilha não tem a coluna Ciclo.' : ''}`);
        } catch (err) {
            console.error('Erro ao processar destino:', err);
            alert("❌ Não foi possível processar a planilha de destino.\n\nVerifique se ela tem as colunas OP e Prioridade no cabeçalho.\n\nDetalhe técnico: " + err.message);
            input.value = '';
        }
    };
    r.readAsArrayBuffer(input.files[0]);
}

// =========================================================================
// 🔑 IDENTIDADE DA OP NA PRIORIDADE: CICLO + NÚMERO
// O mesmo número de OP existe em ciclos diferentes (ex: 111 e 211 — são OPs
// distintas). Tudo que guarda estado de prioridade (Destino, mês, número,
// local, OPs automáticas, manuais, estrela) usa a chave "ciclo-OP" ("211-4293");
// OP sem ciclo gravado usa só o número. Antes era só o número, e uma OP
// herdava a prioridade/mês/local da OP de OUTRO ciclo com o mesmo número.
// =========================================================================
function normalizarParteChaveOP(v) { return (v === undefined || v === null) ? '' : String(v).trim().replace(/\.0+$/, ''); }
function montarChaveOP(ciclo, op) { const c = normalizarParteChaveOP(ciclo), o = normalizarParteChaveOP(op); return c ? `${c}-${o}` : o; }
function chaveDaOP(o) { return o ? montarChaveOP(o.ciclo, o.id) : ''; }
// "211-4293" → { ciclo: "211", op: "4293" }; "4293" → { ciclo: "", op: "4293" } (ciclo = 3 dígitos)
function separarChaveOP(chave) { const m = String(chave).match(/^(\d{3})-(.+)$/); return m ? { ciclo: m[1], op: m[2] } : { ciclo: '', op: String(chave) }; }
// Acha a OP da Sincronização pelo número + ciclo. Sem ciclo informado, só devolve se o número for ÚNICO.
function acharOPNaSincronizacao(opId, ciclo) {
    const c = normalizarParteChaveOP(ciclo), id = String(opId);
    if (c) return bancoDadosOPs.find(o => o.id === id && normalizarParteChaveOP(o.ciclo) === c) || bancoDadosOPs.find(o => o.id === id && !normalizarParteChaveOP(o.ciclo)) || null;
    const mesmas = bancoDadosOPs.filter(o => o.id === id);
    return mesmas.length === 1 ? mesmas[0] : null;
}
// Id que vai pra nuvem: "ciclo-OP". Ao voltar, tira o prefixo do ciclo (a tabela `ops` já tem coluna ciclo; a de OPs manuais não, aí o ciclo viaja dentro do id).
function numeroDaChaveNuvem(id, ciclo) { const s = String(id), c = normalizarParteChaveOP(ciclo); return (c && s.startsWith(c + '-')) ? s.slice(c.length + 1) : s; }

// Roda UMA vez (e só com a lista de OPs carregada): converte o que já estava salvo
// pelo número pro formato "ciclo-OP". Número que existe em UM único ciclo na lista
// atual vira a chave dessa OP; número que não está mais na lista (a OP já saiu) ou
// que existe em 2+ ciclos (não dá pra saber de qual era) é DESCARTADO — mantê-lo
// faria a prioridade antiga "grudar" numa OP nova que reaproveite o número.
// Não mexe nas OPs automáticas/manuais cadastradas (têm o dado todo dentro delas).
function migrarPrioridadesParaChaveComposta() {
    if (localStorage.getItem('prioridadeChaveV2')) return;
    if (!bancoDadosOPs.length) return;
    const porNumero = new Map();
    bancoDadosOPs.forEach(o => { const n = String(o.id); if (!porNumero.has(n)) porNumero.set(n, new Set()); porNumero.get(n).add(chaveDaOP(o)); });
    const convertidas = new Set(), descartadas = new Set();   // OPs DISTINTAS (a mesma OP aparece em várias listas)
    const converter = k => {
        k = String(k);
        if (separarChaveOP(k).ciclo) return k;                       // já está no formato novo
        const cand = porNumero.get(k);
        if (cand && cand.size === 1) { convertidas.add(k); return [...cand][0]; }
        descartadas.add(k); return null;
    };
    const ler = (nome, padrao) => { try { return JSON.parse(localStorage.getItem(nome) || padrao); } catch (e) { return JSON.parse(padrao); } };
    ['prioridadesDestino', 'prioridadesManuais', 'opsDestacadasPrioridade'].forEach(nome => {
        const novo = []; ler(nome, '[]').forEach(k => { const n = converter(k); if (n && !novo.includes(n)) novo.push(n); });
        localStorage.setItem(nome, JSON.stringify(novo));
    });
    ['opsMesDestino', 'numerosPrioridade', 'locaisDestinoPorOP'].forEach(nome => {
        const novo = {}; Object.entries(ler(nome, '{}')).forEach(([k, v]) => { const n = converter(k); if (n) novo[n] = v; });
        localStorage.setItem(nome, JSON.stringify(novo));
    });
    localStorage.setItem('prioridadeChaveV2', '1');
    if (convertidas.size || descartadas.size) {
        showToast(`<i class="fas fa-key"></i> Prioridades atualizadas pro novo formato (OP + ciclo): ${convertidas.size} OP(s) mantida(s)${descartadas.size ? `, ${descartadas.size} descartada(s) (já saíram da Sincronização ou o número existe em 2 ciclos — reimporte o Destino se faltar alguma)` : ''}.`, false, 9000);
    }
}

function obterPrioridadesDestino() {
    try { return new Set(JSON.parse(localStorage.getItem('prioridadesDestino') || '[]')); } catch (e) { return new Set(); }
}

// Objeto { idDaOP: "AAAA-MM" } — de qual mês cada OP foi marcada na última
// importação de Destino em que ela apareceu.
function obterOpsMesDestino() {
    try { return JSON.parse(localStorage.getItem('opsMesDestino') || '{}'); } catch (e) { return {}; }
}

// Objeto { idDaOP: "número" } — o valor bruto da coluna Prioridade da
// planilha de Destino, guardado só pra EXIBIR (não decide mais quem é
// prioritária — ver processarDestino).
function obterNumerosPrioridade() {
    try { return JSON.parse(localStorage.getItem('numerosPrioridade') || '{}'); } catch (e) { return {}; }
}

// Objeto { idDaOP: "PNP..." } — a "Descrição Local" da planilha de Destino,
// que cobre etapas fora das 8 rastreadas pela Sincronização (costura,
// etiquetação etc) — usado como opção extra no filtro de Setor.
function obterLocaisDestinoPorOP() {
    try { return JSON.parse(localStorage.getItem('locaisDestinoPorOP') || '{}'); } catch (e) { return {}; }
}

// Objeto { idDaOP: {desc,qtd,diasLocal,localDestinoDetalhado,mesDestino,numeroPrioridade} }
// — OPs que aparecem no Destino mas não existem na Sincronização (comum
// pras que já passaram das 8 etapas rastreadas). Montada inteiramente com
// dado do próprio Destino, sem precisar o usuário digitar nada — diferente
// de opsManuaisPrioridade, que é 100% digitada à mão.
function obterOpsDestinoAutomaticas() {
    try { return JSON.parse(localStorage.getItem('opsDestinoAutomaticas') || '{}'); } catch (e) { return {}; }
}

// =========================================================================
// 🧵 SEQUENCIAMENTO DE COSTURA — 4 grupos, lendo da planilha POR_OP
// (importada junto com a Fila de Corte, cobre a fábrica inteira, não só a
// aba Prioridades). Alguns locais são compartilhados entre grupos no
// sistema original (ex: jaqueta/gandola/parka aparecem junto com camisa em
// "PNP COST SUP CAMISA", e malha/camisa dividem a mesma fila de espera
// "PNP AGUARD DEFINICAO COST SUP") — confirmado com o usuário, separado
// por Tipo Produto (jaqueta/gandola/parka, já vem certinho na planilha) ou
// por palavra-chave na descrição da referência (malha, que não tem um
// Tipo Produto próprio e limpo).
// =========================================================================

const GRUPOS_SEQUENCIAMENTO_COSTURA = {
    CALCA: {
        rotulo: 'Calça',
        emAndamento: 'PNP COST INF CALCA', filtroEmAndamento: null, // local já é exclusivo
        aguardando: 'PNP AGUARD DEFINICAO COST INF', filtroAguardando: null, // também exclusivo
        campoTempo: 'minutosCostura',
    },
    MALHA: {
        rotulo: 'Malha',
        // "PNP COST SUP MALHA" já é exclusivo de malha — uma OP lá é malha
        // por definição, não precisa (e não deve) checar a descrição pra
        // confirmar (bug real: uma OP sem a palavra "MALHA" escrita mas já
        // fisicamente nesse local sumia da sequência por engano).
        emAndamento: 'PNP COST SUP MALHA', filtroEmAndamento: null,
        // MOLETOM entra junto de MALHA aqui — pedido do usuário (moletom é
        // tratado como malha, exceto quando é moletom de CALÇA, que nem
        // passa por essa fila compartilhada, tem local próprio dela).
        aguardando: 'PNP AGUARD DEFINICAO COST SUP', filtroAguardando: (op) => /MALHA|MOLETOM/i.test(op.descRef || ''), // aqui sim precisa, é fila compartilhada
        campoTempo: 'minutosCostura',
    },
    JAQUETA_GANDOLA_PARKA: {
        rotulo: 'Jaqueta/Gandola/Parka',
        emAndamento: 'PNP COST SUP CAMISA', filtroEmAndamento: (op) => ['JAQUETA', 'GANDOLA', 'PARKA'].includes(op.tipoProduto), // compartilhado com camisa
        aguardando: 'PNP AGUARD DEFINICAO COST SUP', filtroAguardando: (op) => ['JAQUETA', 'GANDOLA', 'PARKA'].includes(op.tipoProduto), // fila compartilhada
        campoTempo: 'minutosCostura',
    },
    CAMISA: {
        rotulo: 'Camisa',
        // OBS: só exclui MOLETOM aqui (fila de espera) — não no "em
        // andamento" logo abaixo, que usa um local exclusivo diferente do
        // da Malha; excluir moletom de lá sem dar um lugar novo pra ele na
        // Malha faria ele sumir da tela por completo, em vez de aparecer
        // no grupo certo. Só mexer nisso também se confirmar que precisa.
        emAndamento: 'PNP COST SUP CAMISA', filtroEmAndamento: (op) => !/MALHA/i.test(op.descRef || '') && !['JAQUETA', 'GANDOLA', 'PARKA'].includes(op.tipoProduto), // compartilhado com jaqueta/gandola/parka
        aguardando: 'PNP AGUARD DEFINICAO COST SUP', filtroAguardando: (op) => !/MALHA|MOLETOM/i.test(op.descRef || '') && !['JAQUETA', 'GANDOLA', 'PARKA'].includes(op.tipoProduto), // fila compartilhada — sobra tudo que não é dos outros grupos
        campoTempo: 'minutosCostura',
    },
    ACABAMENTO: {
        rotulo: 'Acabamento',
        // Setor mais simples — um local só, sem fila de espera separada
        // (confirmado com o usuário) e sem subdivisão por tipo de peça.
        emAndamento: 'PNP ACABAMENTO', filtroEmAndamento: null,
        aguardando: null, filtroAguardando: null,
        campoTempo: 'minutosAcabamento',
    },
    ENFESTO: {
        rotulo: 'Enfesto',
        // Também um local só, sem fila de espera separada. Diferente dos
        // outros grupos: não existe tempo confiável pra esse setor (o que
        // tem hoje é baseado na metragem dos esquemas, sem como levar pra
        // planilha) — confirmado com o usuário, que prefere só a fila
        // ORDENADA (por data/prioridade), sem tentar simular um
        // cronograma sem dado de verdade por trás. "minutosEnfesto" nunca
        // é preenchido na importação de propósito — isso já faz o
        // tempo/previsão aparecerem como "sem tempo"/"—" sozinhos, sem
        // precisar de nenhuma lógica especial pra esse grupo.
        emAndamento: 'PNP ENFESTO', filtroEmAndamento: null,
        aguardando: null, filtroAguardando: null,
        campoTempo: 'minutosEnfesto',
    },
    ETIQUETACAO: {
        rotulo: 'Etiquetação',
        // Igual ao Enfesto: um local só, sem fila de espera e SEM tempo
        // ("minutosEtiquetacao" nunca é preenchido — tempo/previsão
        // aparecem como "sem tempo"/"—"). Só a fila ordenada.
        emAndamento: 'PNP ETIQ PROF/AMARR SOC/SEP LOG/SEP GLA', filtroEmAndamento: null,
        aguardando: null, filtroAguardando: null,
        campoTempo: 'minutosEtiquetacao',
    },
};

function obterPorOPCosturaDetalhado() {
    try { return JSON.parse(localStorage.getItem('porOPCosturaDetalhado') || '[]'); } catch (e) { return []; }
}

// Conversão pra/da nuvem da fila do Sequenciamento da Produção. Chave da
// linha é "op|ciclo" (mesmo esquema usado em todo esse recurso).
function porOPCosturaParaLinhaSupabase(item) {
    return {
        id: chaveOPCostura(item.op, item.ciclo), op: item.op, ciclo: item.ciclo || '',
        local: item.local || '', ref: item.ref || '', desc_ref: item.descRef || '', cor: item.cor || '', tempo_peca_costura: item.tempoPecaCostura ?? null, dias_local: item.diasLocal ?? null,
        tipo_produto: item.tipoProduto || '', prioridade: item.prioridade ?? null, qtd: item.qtd || 0,
        minutos_costura: item.minutosCostura ?? null, minutos_acabamento: item.minutosAcabamento ?? null,
        minutos_enfesto: item.minutosEnfesto ?? null, data_finalizacao: item.dataFinalizacao || null,
        atualizado_em: new Date().toISOString(),
    };
}
function linhaSupabaseParaPorOPCostura(l) {
    return {
        op: l.op, ciclo: l.ciclo || '', local: l.local || '', ref: l.ref || '', descRef: l.desc_ref || '', cor: l.cor || '', tempoPecaCostura: l.tempo_peca_costura ?? null, diasLocal: l.dias_local ?? null,
        tipoProduto: l.tipo_produto || '', prioridade: l.prioridade, qtd: l.qtd || 0,
        minutosCostura: l.minutos_costura, minutosAcabamento: l.minutos_acabamento,
        minutosEnfesto: l.minutos_enfesto, dataFinalizacao: l.data_finalizacao,
    };
}

// Visitante NÃO importa nada aqui — só vê o que o admin publicou. Gate é
// SÓ pra visitante de verdade (!!sessaoAdminAtual, não papelUsuarioAtual)
// de propósito: o papel "usuario" já importa essa planilha sozinha, então
// carregar da nuvem por cima apagaria o trabalho dela — diferente de KPI
// e das remoções do Seq. Costura, que são pensados pra sincronizar com
// TODO MUNDO.
async function carregarPorOPCosturaDaNuvemParaVisitante() {
    if (!supabaseClient || sessaoAdminAtual) return;
    try {
        const data = await buscarTodasLinhasSupabase('por_op_costura_detalhado');
        localStorage.setItem('porOPCosturaDetalhado', JSON.stringify((data || []).map(linhaSupabaseParaPorOPCostura)));
        if (typeof renderizarSequenciamentoCostura === 'function') renderizarSequenciamentoCostura();
    } catch (e) {
        registrarLogDebug('error', ['Falha ao carregar o Sequenciamento da Produção da nuvem: ' + e.message]);
    }
}

// Chave usada pra identificar uma OP de forma única nas duas listas abaixo
// — "op|ciclo", não só "op", porque o mesmo número de OP já apareceu
// reaproveitado em ciclos diferentes (avental num ciclo, calçado noutro).
function chaveOPCostura(op, ciclo) { return `${op}|${ciclo || ''}`; }

// Cruza uma OP do Sequenciamento da Produção com o dado de Prioridades
// (fonte totalmente separada — vem de uma importação diferente) só pra
// puxar o Mês Destino, quando existir. Confere as 3 fontes que Prioridades
// já usa, na mesma ordem de prioridade que a tela de lá usa.
function obterMesDestinoDaOP(opId, ciclo) {
    const chave = montarChaveOP(ciclo, opId);
    const doSincronizado = acharOPNaSincronizacao(opId, ciclo);
    if (doSincronizado && doSincronizado.mesDestino) return doSincronizado.mesDestino;
    const daManual = obterOpsManuaisPrioridade().find(o => String(o.id) === String(opId) && (!normalizarParteChaveOP(ciclo) || !normalizarParteChaveOP(o.ciclo) || normalizarParteChaveOP(o.ciclo) === normalizarParteChaveOP(ciclo)));
    if (daManual && daManual.mesDestino) return daManual.mesDestino;
    const automaticas = obterOpsDestinoAutomaticas();
    const auto = automaticas[chave] || automaticas[String(opId)];   // as antigas (de antes do ciclo ser guardado) ficam só pelo número
    if (auto && auto.mesDestino) return auto.mesDestino;
    return null;
}

// Lista de exclusão permanente: uma vez removida, a OP não volta a
// aparecer nem numa importação nova (o filtro roda na hora de importar).
function obterOpsRemovidasSeqCostura() {
    try { return JSON.parse(localStorage.getItem('opsRemovidasSeqCostura') || '{}'); } catch (e) { return {}; }
}
function salvarOpsRemovidasSeqCostura(obj) {
    localStorage.setItem('opsRemovidasSeqCostura', JSON.stringify(obj));
}

// Publica UMA remoção/restauração na hora, sem esperar o botão geral de
// "PUBLICAR NA NUVEM" — é isso que faz outra pessoa, em outro computador,
// ver a mudança rapidamente. Se falhar (sem internet, etc), avisa mas não
// desfaz a ação local — ela só fica sem sincronizar até a próxima tentativa.
async function publicarRemocaoSeqCosturaNaNuvem(chave, item) {
    if (!supabaseClient) return;
    try {
        const { error } = await supabaseClient.from('ops_removidas_seq_costura').upsert({
            id: chave, op: item.op, ciclo: item.ciclo || '', desc_ref: item.descRef || '', motivo: item.motivo || '',
            removido_por: item.removidoPor || '', removido_em: item.removidoEm,
            restaurado_por: item.restauradoPor || null, restaurado_em: item.restauradoEm || null,
        }, { onConflict: 'id' });
        if (error) throw error;
        registrarLogDebug('log', [`[NUVEM] Remoção/restauração de "${item.op}" (Seq. Costura) publicada.`]);
    } catch (e) {
        registrarLogDebug('error', ['Falha ao publicar remoção do Seq. Costura na nuvem: ' + e.message]);
        showToast('<i class="fas fa-triangle-exclamation"></i> Salvou aqui, mas não consegui avisar a nuvem — outras pessoas podem não ver essa mudança ainda.', true);
    }
}

// Busca a lista inteira da nuvem — pra TODO MUNDO, admin incluído (essa
// lista precisa ser igual em qualquer computador, diferente da maioria dos
// outros dados, onde só o visitante/usuario carrega da nuvem e o admin usa
// o que está local). Também reaplica a exclusão nas OPs já visíveis na
// tela, caso alguém em outro computador tenha removido algo depois da
// última importação local — sem isso, a OP ficaria visível até a próxima
// reimportação.
async function carregarOpsRemovidasSeqCosturaDaNuvem() {
    if (!supabaseClient) return;
    try {
        const { data, error } = await supabaseClient.from('ops_removidas_seq_costura').select('*');
        if (error) throw error;
        const removidas = {};
        (data || []).forEach(l => {
            removidas[l.id] = {
                op: l.op, ciclo: l.ciclo || '', descRef: l.desc_ref || '', motivo: l.motivo || '',
                removidoPor: l.removido_por || '', removidoEm: l.removido_em,
                restauradoPor: l.restaurado_por || null, restauradoEm: l.restaurado_em || null,
            };
        });
        salvarOpsRemovidasSeqCostura(removidas);

        const todas = obterPorOPCosturaDetalhado();
        const restantes = todas.filter(o => {
            const r = removidas[chaveOPCostura(o.op, o.ciclo)];
            return !(r && !r.restauradoEm);
        });
        if (restantes.length !== todas.length) localStorage.setItem('porOPCosturaDetalhado', JSON.stringify(restantes));

        renderizarSequenciamentoCostura();
        renderizarOpsRemovidasSeqCostura();
    } catch (e) {
        registrarLogDebug('error', ['Falha ao carregar remoções do Seq. Costura da nuvem: ' + e.message]);
    }
}

// Remove uma OP da sequência agora (tira do que está na tela) E pra sempre
// (fica na lista de exclusão, então nem reimportando ela volta) — guarda
// quem removeu e quando, pro histórico.
function removerOPDaSequenciaCostura(op, ciclo) {
    if (!exigirAdminOuUsuario('remover uma OP da sequência')) return;
    const todas = obterPorOPCosturaDetalhado();
    const item = todas.find(o => o.op === op && (o.ciclo || '') === (ciclo || ''));
    if (!item) return;
    if (!confirm(`Remover a OP ${op} da sequência?\n\n"${item.descRef || ''}"\n\nEla não vai aparecer de novo, mesmo reimportando a planilha — mas fica guardada na lista de removidas, com um botão de restaurar se for engano.`)) return;
    const motivo = (prompt('Motivo da remoção (opcional — ajuda a lembrar depois por que ela saiu):', '') || '').trim();

    const chave = chaveOPCostura(op, ciclo);
    const removidas = obterOpsRemovidasSeqCostura();
    removidas[chave] = {
        op, ciclo: ciclo || '', descRef: item.descRef || '', motivo,
        removidoPor: sessaoAdminAtual && sessaoAdminAtual.user ? sessaoAdminAtual.user.email : 'desconhecido',
        removidoEm: new Date().toISOString(),
        restauradoPor: null, restauradoEm: null,
    };
    salvarOpsRemovidasSeqCostura(removidas);
    publicarRemocaoSeqCosturaNaNuvem(chave, removidas[chave]);

    const restantes = todas.filter(o => !(o.op === op && (o.ciclo || '') === (ciclo || '')));
    localStorage.setItem('porOPCosturaDetalhado', JSON.stringify(restantes));

    renderizarSequenciamentoCostura();
    renderizarOpsRemovidasSeqCostura();
    showToast(`<i class="fas fa-trash"></i> OP ${op} removida da sequência.`);
}

// Marca como restaurada (não apaga o registro) — assim o histórico
// continua mostrando que ela foi removida e depois voltou, em vez de
// simplesmente sumir a linha. Ela não volta sozinha pra tela agora (não
// tem mais o dado dela em porOPCosturaDetalhado), mas a próxima
// importação da planilha volta a trazer ela normalmente, já que a checagem
// de exclusão passa a ignorar registros restaurados.
function restaurarOPRemovidaSeqCostura(chave) {
    if (!exigirAdminOuUsuario('restaurar uma OP removida')) return;
    const removidas = obterOpsRemovidasSeqCostura();
    const item = removidas[chave];
    if (!item || item.restauradoEm) return;
    if (!confirm(`Restaurar a OP ${item.op}?\n\nEla não aparece na hora — só depois da próxima vez que a planilha for importada de novo.`)) return;
    item.restauradoPor = sessaoAdminAtual && sessaoAdminAtual.user ? sessaoAdminAtual.user.email : 'desconhecido';
    item.restauradoEm = new Date().toISOString();
    salvarOpsRemovidasSeqCostura(removidas);
    publicarRemocaoSeqCosturaNaNuvem(chave, item);
    renderizarOpsRemovidasSeqCostura();
    showToast(`<i class="fas fa-check"></i> OP ${item.op} liberada — reimporte a planilha pra ela voltar.`);
}

function renderizarOpsRemovidasSeqCostura() {
    if (!$('seqCostListaRemovidas')) return;
    const removidas = obterOpsRemovidasSeqCostura();
    const lista = Object.entries(removidas).sort((a, b) => new Date(b[1].removidoEm) - new Date(a[1].removidoEm));

    if ($('seqCostContRemovidas')) $('seqCostContRemovidas').textContent = lista.length;

    if (!lista.length) {
        $('seqCostListaRemovidas').innerHTML = `<tr><td colspan="6" style="text-align:center; padding:16px; color:var(--texto-secundario);">Nenhuma OP removida ainda.</td></tr>`;
        return;
    }

    $('seqCostListaRemovidas').innerHTML = lista.map(([chave, item]) => {
        const quandoTexto = new Date(item.removidoEm).toLocaleString('pt-BR');
        const quemTexto = item.removidoPor ? item.removidoPor.split('@')[0].toUpperCase() : '—';
        return `<tr>
            <td><strong>${item.op}</strong></td>
            <td>${item.ciclo || '—'}</td>
            <td>${item.descRef || ''}</td>
            <td>${item.motivo || '<span style="color:var(--texto-secundario);">—</span>'}</td>
            <td>${quemTexto}</td>
            <td style="white-space:nowrap;">${quandoTexto}
                <button class="btn somente-admin tambem-usuario" style="padding:2px 8px; margin-left:8px; background:var(--cor-despacho); font-size:10px;" onclick="restaurarOPRemovidaSeqCostura('${chave}')" title="Restaurar essa OP (volta a aparecer na próxima importação)"><i class="fas fa-rotate-left"></i> RESTAURAR</button>
            </td>
        </tr>`;
    }).join('');
}

// Importação PRÓPRIA da planilha POR_OP pro Seq. Costura — separada da
// importação de Fila de Corte de propósito (o usuário quis desacoplar as
// duas, mesmo lendo o mesmo tipo de arquivo). Captura toda linha com OP,
// com os campos que o sequenciamento de costura precisa.

// =========================================================================
// 🧵 BALANÇO DA COSTURA — compara a foto anterior do Seq. Costura com a nova
// POR OP. Na costura a OP sai AOS POUCOS, então a comparação é por QUANTIDADE
// (soma de "Qt Local" nos locais de costura), não por "a OP ainda está lá":
// parcial = a quantidade caiu mas sobrou saldo; total = zerou.
// =========================================================================
function nomeLocalBalancoCostura(local) {
    for (const g of Object.values(GRUPOS_SEQUENCIAMENTO_COSTURA)) {
            }
    return nomeLocalEfCostura(local);
}
function compararSeqCostura(antes, depois) {
    const agrupar = lista => {
        const m = new Map();
        lista.forEach(i => {
            const k = chaveOPCostura(i.op, i.ciclo);
            const r = m.get(k) || { op: i.op, ciclo: i.ciclo || '', ref: i.descRef || i.ref || '', total: 0, locais: {} };
            r.total += (i.qtd || 0);
            r.locais[i.local] = (r.locais[i.local] || 0) + (i.qtd || 0);
            m.set(k, r);
        });
        return m;
    };
    const A = agrupar(antes), D = agrupar(depois);
    const res = { novas: [], saidaTotal: [], saidaParcial: [], chegouMais: [], mudouLocal: [] };
    A.forEach((a, k) => {
        const d = D.get(k);
        if (!d || d.total <= 0) { res.saidaTotal.push({ ...a, saiu: a.total }); return; }
        if (d.total < a.total) { res.saidaParcial.push({ ...d, antes: a.total, saiu: a.total - d.total, pct: Math.round(((a.total - d.total) / a.total) * 100) }); return; }
        if (d.total > a.total) { res.chegouMais.push({ ...d, antes: a.total, chegou: d.total - a.total }); return; }
        const mudou = new Set([...Object.keys(a.locais), ...Object.keys(d.locais)]);
        if ([...mudou].some(l => (a.locais[l] || 0) !== (d.locais[l] || 0))) res.mudouLocal.push({ ...d, de: a.locais });
    });
    D.forEach((d, k) => { if (!A.has(k) && d.total > 0) res.novas.push(d); });
    return res;
}
function exibirBalancoSeqCostura(antes, depois) {
    const r = compararSeqCostura(antes, depois);
    registrarHistoricoBalancoCostura(r);
    const n = x => Number(x).toLocaleString('pt-BR');
    const bloco = (titulo, icone, cor, lista, linha) => lista.length === 0 ? '' : `
        <div style="border-left:4px solid ${cor}; background:var(--bg-painel); border-radius:8px; padding:12px; margin-bottom:10px;">
            <div style="font-size:12px; font-weight:700; color:${cor}; margin-bottom:8px;"><i class="fas ${icone}"></i> ${titulo} (${lista.length})</div>
            <div style="display:flex; flex-direction:column; gap:5px;">${ordenarPrioridadesPrimeiro(lista, o => [o.ciclo, o.op]).map(linha).join('')}</div>
        </div>`;
    const selo = o => seloOPBalanco(o.ciclo, o.op, `${o.op}${o.ciclo ? ' · ' + o.ciclo : ''}`, 'background:var(--bg-card); border:1px solid var(--borda-cor); color:var(--texto-cor); display:inline-block;');
    const ref = o => o.ref ? `<span style="color:var(--texto-secundario); font-size:11px;"> ${String(o.ref).slice(0, 38)}</span>` : '';
    const barra = pct => `<span style="display:inline-block; width:70px; height:7px; background:var(--borda-cor); border-radius:4px; overflow:hidden; vertical-align:middle;"><span style="display:block; width:${Math.min(100, pct)}%; height:100%; background:var(--cor-sugestao);"></span></span>`;
    const linhaLocais = loc => Object.entries(loc).filter(([, q]) => q > 0).map(([l, q]) => `${nomeLocalBalancoCostura(l)} ${n(q)}`).join(' + ') || '—';
    const html =
        bloco('SAÍRAM PARCIALMENTE — ainda têm saldo', 'fa-circle-half-stroke', 'var(--cor-sugestao)', r.saidaParcial.sort((a, b) => b.pct - a.pct),
            o => `<div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">${selo(o)} ${barra(o.pct)} <strong style="font-size:12px;">${o.pct}%</strong> <span style="font-size:12px;">saiu ${n(o.saiu)} de ${n(o.antes)} · <strong>restam ${n(o.total)}</strong></span>${ref(o)}</div>`) +
        bloco('SAÍRAM POR COMPLETO — sem saldo na costura', 'fa-check-circle', 'var(--cor-despacho)', r.saidaTotal,
            o => `<div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">${selo(o)} <span style="font-size:12px;">saíram ${n(o.saiu)} peças</span>${ref(o)}</div>`) +
        bloco('MAIS PEÇAS CHEGARAM', 'fa-arrow-trend-up', 'var(--cor-alerta)', r.chegouMais,
            o => `<div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">${selo(o)} <span style="font-size:12px;">+${n(o.chegou)} (de ${n(o.antes)} para ${n(o.total)})</span>${ref(o)}</div>`) +
        bloco('MUDARAM DE LOCAL (mesma quantidade)', 'fa-right-left', 'var(--cor-sugestao)', r.mudouLocal,
            o => `<div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">${selo(o)} <span style="font-size:12px;">${linhaLocais(o.de)} <i class="fas fa-arrow-right" style="color:var(--texto-secundario);"></i> ${linhaLocais(o.locais)}</span>${ref(o)}</div>`) +
        bloco('OPs NOVAS NA COSTURA', 'fa-plus-circle', 'var(--cor-despacho)', r.novas,
            o => `<div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">${selo(o)} <span style="font-size:12px;">${linhaLocais(o.locais)}</span>${ref(o)}</div>`);
    const totalPecasSaidas = r.saidaParcial.reduce((t, o) => t + o.saiu, 0) + r.saidaTotal.reduce((t, o) => t + o.saiu, 0);
    const resumo = `<div style="display:flex; gap:14px; flex-wrap:wrap; font-size:12px; color:var(--texto-secundario); margin-bottom:12px;">
        <span><strong style="color:var(--texto-cor);">${n(totalPecasSaidas)}</strong> peças saíram</span>
        <span><strong style="color:var(--texto-cor);">${r.saidaParcial.length}</strong> parciais</span>
        <span><strong style="color:var(--texto-cor);">${r.saidaTotal.length}</strong> completas</span>
        <span><strong style="color:var(--texto-cor);">${r.novas.length}</strong> novas</span></div>`;
    $('modalBalancoSincronizacao').innerHTML = `
        <div class="modal-card" style="width:680px; max-width:92vw; border-top:5px solid var(--cor-sugestao); max-height:85vh;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; border-bottom:2px solid var(--borda-cor); padding-bottom:10px; flex-shrink:0;">
                <h2 style="margin:0; color:var(--texto-cor); display:flex; align-items:center; gap:10px; font-size:16px;"><i class="fas fa-scissors" style="color:var(--cor-sugestao);"></i> BALANÇO DA COSTURA</h2>
                <button onclick="fecharModais()" class="modal-fechar-btn"><i class="fas fa-times"></i></button>
            </div>
            <div style="overflow-y:auto; flex:1;">
                ${html ? resumo + html : '<div style="text-align:center; padding:20px; color:var(--texto-secundario);">Nenhuma mudança de quantidade desde a última importação — tudo igual.</div>'}
            </div>
        </div>`;
    $('modalBalancoSincronizacao').style.display = 'flex';
}


function obterHistoricoBalancoCostura() { try { return JSON.parse(localStorage.getItem('historicoBalancoCostura') || '[]'); } catch (e) { return []; } }
function registrarHistoricoBalancoCostura(r) {
    const hist = obterHistoricoBalancoCostura();
    const compacta = (l, extra) => l.slice(0, 150).map(o => ({ op: o.op, ciclo: o.ciclo, ...extra(o) }));
    const entrada = {
        em: new Date().toISOString(),
        pecasSairam: r.saidaParcial.reduce((t, o) => t + o.saiu, 0) + r.saidaTotal.reduce((t, o) => t + o.saiu, 0),
        parciais: compacta(r.saidaParcial, o => ({ saiu: o.saiu, restam: o.total })),
        completas: compacta(r.saidaTotal, o => ({ saiu: o.saiu })),
        novas: r.novas.length, chegaram: r.chegouMais.length,
    };
    hist.unshift(entrada);
    try { localStorage.setItem('historicoBalancoCostura', JSON.stringify(hist.slice(0, 40))); } catch (e) { /* ignora */ }
}
function exibirHistoricoBalancoCostura() {
    const hist = obterHistoricoBalancoCostura();
    const n = x => Number(x).toLocaleString('pt-BR');
    const fmtData = iso => { const d = new Date(iso); return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); };
    let conteudo;
    if (!hist.length) conteudo = '<div style="text-align:center; padding:20px; color:var(--texto-secundario);">Ainda não há balanços guardados. Eles passam a ser guardados a cada importação do POR OP (a partir da segunda).</div>';
    else {
        const linhas = hist.map(h => `
            <details style="border:1px solid var(--borda-cor); border-radius:8px; padding:8px 12px; margin-bottom:6px; background:var(--bg-painel);">
                <summary style="cursor:pointer; font-size:12px; display:flex; gap:12px; flex-wrap:wrap; align-items:center;"><strong>${fmtData(h.em)}</strong>
                    <span><strong>${n(h.pecasSairam)}</strong> peças saíram</span><span>${h.parciais.length} parciais</span><span>${h.completas.length} completas</span><span>${h.novas} novas</span></summary>
                <div style="font-size:12px; margin-top:8px; line-height:1.9;">
                    ${h.parciais.length ? `<div><strong>Parciais:</strong> ${h.parciais.map(o => `<span class="pill" style="background:var(--bg-card); border:1px solid var(--borda-cor); color:var(--texto-cor);">${o.op}${o.ciclo ? ' · ' + o.ciclo : ''} −${n(o.saiu)} (restam ${n(o.restam)})</span>`).join(' ')}</div>` : ''}
                    ${h.completas.length ? `<div><strong>Completas:</strong> ${h.completas.map(o => `<span class="pill pill-ok">${o.op}${o.ciclo ? ' · ' + o.ciclo : ''} (${n(o.saiu)})</span>`).join(' ')}</div>` : ''}
                </div>
            </details>`).join('');
        conteudo = `<div style="font-size:11px; color:var(--texto-secundario); margin-bottom:8px;">Um registro por importação do POR OP. Clique para ver as OPs.</div>${linhas}`;
    }
    $('modalBalancoSincronizacao').innerHTML = `
        <div class="modal-card" style="width:680px; max-width:92vw; border-top:5px solid var(--cor-sugestao); max-height:85vh;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; border-bottom:2px solid var(--borda-cor); padding-bottom:10px; flex-shrink:0;">
                <h2 style="margin:0; color:var(--texto-cor); display:flex; align-items:center; gap:10px; font-size:16px;"><i class="fas fa-clock-rotate-left" style="color:var(--cor-sugestao);"></i> HISTÓRICO DO BALANÇO DA COSTURA</h2>
                <button onclick="fecharModais()" class="modal-fechar-btn"><i class="fas fa-times"></i></button>
            </div>
            <div style="overflow-y:auto; flex:1;">${conteudo}</div>
        </div>`;
    $('modalBalancoSincronizacao').style.display = 'flex';
}

function processarPorOPCostura() {
    if (!exigirAdminOuUsuario('importar a planilha do Seq. Costura')) return;
    if (!exigirBibliotecaExcel()) return;
    const input = $('inputPorOPCostura'); if (!input.files[0]) return;
    const r = new FileReader();
    r.onload = function (e) {
        try {
            const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
            const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
            if (!rows.length) throw new Error("Planilha vazia.");

            const cab = rows[0].map(c => String(c || '').trim().toUpperCase());
            const idxDescLocal = cab.findIndex(c => c === 'DESCRIÇÃO LOCAL' || c.includes('DESCRICAO LOCAL'));
            const idxOP = cab.findIndex(c => c === 'OP');
            const idxQtd = cab.findIndex(c => c.includes('QT') && c.includes('LOCAL'));
            const idxRef = cab.findIndex(c => c.includes('REFER') && !c.includes('DESCRI'));
            const idxDescRef = cab.findIndex(c => c.includes('DESCRI') && c.includes('REFER'));
            const idxTipo = cab.findIndex(c => c.includes('TIPO') && c.includes('PRODUTO'));
            const idxPrioridade = cab.findIndex(c => c === 'PRIORIDADE');
            const idxMinutosCostura = cab.findIndex(c => c.includes('MINUTOS') && c.includes('COSTURA'));
            const idxMinutosAcabamento = cab.findIndex(c => c.includes('MINUTOS') && c.includes('ACABAMENTO'));
            const idxDataFinalizacao = cab.findIndex(c => c.includes('DATA') && c.includes('FINALIZ'));
            const idxDataInclusao = cab.findIndex(c => c.includes('DATA') && c.includes('INCLUS'));
            const idxCiclo = cab.findIndex(c => c === 'CICLO');
            const idxTempoPecaCostura = cab.findIndex(c => c.includes('TEMPO') && /PE[CÇ]A/.test(c) && c.includes('COSTURA'));
            const idxCor = cab.findIndex(c => c === 'COR' || c === 'COR PRODUTO');
            const idxDiasLocal = cab.findIndex(c => c === 'DIAS LOCAL');

            const faltando = [];
            if (idxDescLocal === -1) faltando.push('Descrição Local');
            if (idxOP === -1) faltando.push('OP');
            if (faltando.length) throw new Error("Não encontrei as colunas: " + faltando.join(', ') + " no cabeçalho da planilha.");

            // A planilha inteira cobre a fábrica toda (quase 2 mil linhas),
            // mas o Seq. Costura só usa 5 locais específicos — guardar só
            // esses reduz o tamanho em muitas vezes e evita estourar o
            // limite de armazenamento do navegador (aconteceu na prática:
            // guardar tudo passava do limite; só os locais relevantes cabe
            // numa fração do espaço).
            const locaisRelevantes = new Set(
                Object.values(GRUPOS_SEQUENCIAMENTO_COSTURA).flatMap(g => [g.emAndamento, g.aguardando]).filter(Boolean)
            );
            // OPs removidas ficam de fora pra sempre, mesmo reimportando —
            // é assim que se limpa o "lixo" (OP que não existe mais, ou
            // que virou ruído) sem ela voltar toda vez.
            const removidas = obterOpsRemovidasSeqCostura();

            let puladasPorRemocao = 0;
            const snapshotBalanco = [];
            const porOPCosturaDetalhado = [];
            for (let i = 1; i < rows.length; i++) {
                const row = rows[i]; if (!row || row[idxOP] === undefined || row[idxOP] === null || row[idxOP] === '') continue;
                const local = idxDescLocal !== -1 && row[idxDescLocal] ? String(row[idxDescLocal]).trim().toUpperCase() : '';
                if (ehLocalCosturaEficiencia(local) && normalizarCabecalhoEf(local).startsWith('PNP')) {   // foto do balanço (só PNP, sem SLV): só os locais de costura do KPI (independe dos grupos da sequência)
                    snapshotBalanco.push({ op: String(row[idxOP]).trim(), ciclo: idxCiclo !== -1 && row[idxCiclo] !== undefined && row[idxCiclo] !== null ? String(row[idxCiclo]).trim() : '', local: normalizarCabecalhoEf(local), descRef: idxDescRef !== -1 && row[idxDescRef] ? String(row[idxDescRef]).trim() : '', qtd: idxQtd !== -1 ? (parseFloat(row[idxQtd]) || 0) : 0 });
                }
                if (!locaisRelevantes.has(local)) continue;
                const opId = String(row[idxOP]).trim();
                const cicloId = idxCiclo !== -1 && row[idxCiclo] !== undefined && row[idxCiclo] !== null ? String(row[idxCiclo]).trim() : '';
                const registroRemocao = removidas[chaveOPCostura(opId, cicloId)];
                if (registroRemocao && !registroRemocao.restauradoEm) { puladasPorRemocao++; continue; }
                porOPCosturaDetalhado.push({
                    op: opId,
                    ciclo: cicloId,
                    local: local,
                    ref: idxRef !== -1 && row[idxRef] ? String(row[idxRef]).trim().toUpperCase() : '',
                    descRef: idxDescRef !== -1 && row[idxDescRef] ? String(row[idxDescRef]).trim() : '',
                    tempoPecaCostura: idxTempoPecaCostura !== -1 && row[idxTempoPecaCostura] !== null && row[idxTempoPecaCostura] !== undefined && row[idxTempoPecaCostura] !== '' ? (parseFloat(row[idxTempoPecaCostura]) || null) : null,
                    cor: idxCor !== -1 && row[idxCor] ? String(row[idxCor]).trim().toUpperCase() : '',
                    diasLocal: idxDiasLocal !== -1 && row[idxDiasLocal] !== null && row[idxDiasLocal] !== undefined && row[idxDiasLocal] !== '' ? (parseInt(row[idxDiasLocal]) || 0) : null,
                    tipoProduto: idxTipo !== -1 && row[idxTipo] ? String(row[idxTipo]).trim().toUpperCase() : '',
                    prioridade: idxPrioridade !== -1 && row[idxPrioridade] !== null && row[idxPrioridade] !== undefined ? parseInt(row[idxPrioridade]) : null,
                    qtd: idxQtd !== -1 ? (parseFloat(row[idxQtd]) || 0) : 0,
                    minutosCostura: idxMinutosCostura !== -1 && row[idxMinutosCostura] !== null && row[idxMinutosCostura] !== undefined ? parseFloat(row[idxMinutosCostura]) : null,
                    minutosAcabamento: idxMinutosAcabamento !== -1 && row[idxMinutosAcabamento] !== null && row[idxMinutosAcabamento] !== undefined ? parseFloat(row[idxMinutosAcabamento]) : null,
                    dataFinalizacao: idxDataFinalizacao !== -1 ? extrairDataExcel(row[idxDataFinalizacao]) : null,
                    dataInclusao: idxDataInclusao !== -1 ? extrairDataExcel(row[idxDataInclusao]) : null,
                });
            }
            if (!porOPCosturaDetalhado.length) throw new Error("Nenhuma linha nos locais de costura conhecidos foi encontrada (confira se a planilha realmente cobre esses locais).");

            let snapshotAntes = [];
            try { snapshotAntes = JSON.parse(localStorage.getItem('snapshotBalancoCostura') || '[]'); } catch (e2) { /* sem foto anterior */ }
            try { localStorage.setItem('snapshotBalancoCostura', JSON.stringify(snapshotBalanco)); } catch (e2) { /* ignora */ }
            localStorage.setItem('porOPCosturaDetalhado', JSON.stringify(porOPCosturaDetalhado));
            input.value = '';
            renderizarSequenciamentoCostura();
            if (snapshotAntes.length) exibirBalancoSeqCostura(snapshotAntes, snapshotBalanco);
            agendarPublicacaoAutomatica();
            let msgImportacao = `<i class="fas fa-check-double"></i> ${porOPCosturaDetalhado.length} linhas de costura importadas!`;
            if (puladasPorRemocao > 0) msgImportacao += ` (${puladasPorRemocao} ficaram de fora por já terem sido removidas antes.)`;
            showToast(msgImportacao);
        } catch (err) {
            console.error('Erro ao processar planilha do Seq. Costura:', err);
            alert("❌ Não foi possível processar a planilha.\n\nVerifique se ela tem as colunas Descrição Local e OP no cabeçalho.\n\nDetalhe técnico: " + err.message);
            input.value = '';
        }
    };
    r.readAsArrayBuffer(input.files[0]);
}

// Junta as linhas da planilha POR_OP (importada junto com a Fila de Corte)
// que batem com um local específico — com filtro opcional, pra separar o
// que está misturado no mesmo local no sistema original (o filtro recebe
// a linha inteira, não só a descrição, já que agora também temos Tipo
// Produto disponível).
// "Ocultar" é mais leve que "Remover" — sem motivo, só local (não
// sincroniza com a nuvem), e reversível NA HORA (não precisa reimportar a
// planilha pra voltar, já que o dado da OP nunca sai de
// porOPCosturaDetalhado, só fica filtrado daqui). Pra quando a OP
// "atrapalha" a sequência mas o usuário não quer removê-la de verdade.
function obterOpsOcultasSeqCostura() {
    try { return JSON.parse(localStorage.getItem('opsOcultasSeqCostura') || '{}'); } catch (e) { return {}; }
}
function salvarOpsOcultasSeqCostura(obj) {
    localStorage.setItem('opsOcultasSeqCostura', JSON.stringify(obj));
}
function ocultarOPDaSequenciaCostura(op, ciclo) {
    if (!exigirAdminOuUsuario('ocultar uma OP da sequência')) return;
    const item = obterPorOPCosturaDetalhado().find(o => o.op === op && (o.ciclo || '') === (ciclo || ''));
    if (!item) return;
    const chave = chaveOPCostura(op, ciclo);
    const ocultas = obterOpsOcultasSeqCostura();
    ocultas[chave] = { op, ciclo: ciclo || '', descRef: item.descRef || '', ocultadoEm: new Date().toISOString() };
    salvarOpsOcultasSeqCostura(ocultas);
    renderizarSequenciamentoCostura();
    renderizarOpsOcultasSeqCostura();
    showToast(`<i class="fas fa-eye-slash"></i> OP ${op} ocultada da sequência.`);
}
function reexibirOPOcultaSeqCostura(chave) {
    if (!exigirAdminOuUsuario('reexibir uma OP oculta')) return;
    const ocultas = obterOpsOcultasSeqCostura();
    const item = ocultas[chave];
    if (!item) return;
    delete ocultas[chave];
    salvarOpsOcultasSeqCostura(ocultas);
    renderizarSequenciamentoCostura();
    renderizarOpsOcultasSeqCostura();
    showToast(`<i class="fas fa-eye"></i> OP ${item.op} reexibida na sequência.`);
}
function renderizarOpsOcultasSeqCostura() {
    if (!$('seqCostListaOcultas')) return;
    const ocultas = obterOpsOcultasSeqCostura();
    const lista = Object.entries(ocultas).sort((a, b) => new Date(b[1].ocultadoEm) - new Date(a[1].ocultadoEm));

    if ($('seqCostContOcultas')) $('seqCostContOcultas').textContent = lista.length;

    if (!lista.length) {
        $('seqCostListaOcultas').innerHTML = `<tr><td colspan="4" class="tabela-vazia">Nenhuma OP oculta.</td></tr>`;
        return;
    }

    $('seqCostListaOcultas').innerHTML = lista.map(([chave, item]) => `
        <tr>
            <td><strong>${item.op}</strong></td>
            <td>${item.ciclo || '—'}</td>
            <td>${item.descRef || ''}</td>
            <td style="text-align:center;"><button class="btn somente-admin tambem-usuario" style="padding:2px 8px; background:var(--cor-despacho); font-size:10px;" onclick="reexibirOPOcultaSeqCostura('${chave}')" title="Reexibir essa OP na sequência"><i class="fas fa-eye"></i> REEXIBIR</button></td>
        </tr>`).join('');
}

function obterOPsPorLocalCostura(local, filtro) {
    const ocultas = obterOpsOcultasSeqCostura();
    return obterPorOPCosturaDetalhado().filter(op =>
        op.local === local && (!filtro || filtro(op)) && !ocultas[chaveOPCostura(op.op, op.ciclo)]
    );
}

// Prioridade 1-98 = ordem normal, menor primeiro. Dentro da prioridade 99
// (que é o valor padrão, ninguém definiu manualmente), quem já tem uma
// Data Finalização vem antes de quem não tem — e entre as que têm, a data
// mais próxima vem primeiro (confirmado com o usuário).
// Data Finalização é o critério PRINCIPAL agora (quem tem data vem antes
// de quem não tem, e entre as que têm, a mais próxima primeiro) — só cai
// pra prioridade quando a OP não tem data nenhuma cadastrada.
// Quantos dias úteis (pula sábado/domingo e feriados cadastrados) uma OP
// de Costura precisa "sobrar" depois de pronta, pra dar tempo do
// Acabamento fazer a dele antes da Data Finalização de verdade. Mesmo
// valor pros 6 grupos (confirmado com o usuário).
const DIAS_RESERVA_ACABAMENTO_COSTURA = 5;
// A partir de quantos dias úteis de folga uma OP deixa de ser "urgente"
// pra ordem (e passa a competir só pela data de inclusão, como reposição).
const DIAS_JANELA_URGENCIA_COSTURA = 2;

function somarDiasUteisCostura(data, dias, feriados) {
    const feriadosSet = feriados || new Set(obterFeriados());
    const d = new Date(data);
    let restante = dias;
    while (restante > 0) {
        d.setDate(d.getDate() + 1);
        if (d.getDay() !== 0 && d.getDay() !== 6 && !feriadosSet.has(d.toISOString().slice(0, 10))) restante--;
    }
    return d;
}
function subtrairDiasUteisCostura(data, dias, feriados) {
    const feriadosSet = feriados || new Set(obterFeriados());
    const d = new Date(data);
    let restante = dias;
    while (restante > 0) {
        d.setDate(d.getDate() - 1);
        if (d.getDay() !== 0 && d.getDay() !== 6 && !feriadosSet.has(d.toISOString().slice(0, 10))) restante--;
    }
    return d;
}

// A data que REALMENTE importa pra Costura — a Data Finalização menos os
// dias de reserva do Acabamento. Null se a OP não tem Data Finalização.
function calcularDataLimiteCostura(op, feriados) {
    if (!op.dataFinalizacao) return null;
    const dataFinal = new Date(op.dataFinalizacao); dataFinal.setHours(0, 0, 0, 0);
    return subtrairDiasUteisCostura(dataFinal, DIAS_RESERVA_ACABAMENTO_COSTURA, feriados);
}

// Lógica combinada (pedido do usuário, substituindo a ordenação só por
// Data Finalização): uma OP só "fura a fila" pela data se estiver REALMENTE
// perto — já atrasada, ou dentro de DIAS_JANELA_URGENCIA_COSTURA dias úteis
// a partir de hoje (usando a data LIMITE, já descontado o tempo do
// Acabamento). Fora dessa janela, não tem urgência de prazo ainda, então
// a OP concorre pela DATA DE INCLUSÃO (mais antiga primeiro) — mesmo
// raciocínio já usado na aba Programação, pra reposições não ficarem
// esquecidas só porque o prazo ainda está longe.
function compararPrioridadeCostura(a, b) {
    const feriados = new Set(obterFeriados());
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const limiteUrgencia = somarDiasUteisCostura(hoje, DIAS_JANELA_URGENCIA_COSTURA, feriados);

    const limiteA = calcularDataLimiteCostura(a, feriados);
    const limiteB = calcularDataLimiteCostura(b, feriados);
    const urgenteA = limiteA !== null && limiteA <= limiteUrgencia;
    const urgenteB = limiteB !== null && limiteB <= limiteUrgencia;

    // Desempates, na ordem: Data Finalização (a mais cedo primeiro), data de
    // inclusão (a mais antiga primeiro; sem data vai pro fim) e, por último, a prioridade.
    const finA = a.dataFinalizacao ? new Date(a.dataFinalizacao).getTime() : Infinity;
    const finB = b.dataFinalizacao ? new Date(b.dataFinalizacao).getTime() : Infinity;
    const incA = a.dataInclusao ? new Date(a.dataInclusao).getTime() : Infinity;
    const incB = b.dataInclusao ? new Date(b.dataInclusao).getTime() : Infinity;
    const porFinalizacao = () => finA === finB ? 0 : (finA < finB ? -1 : 1);
    const porInclusao = () => incA === incB ? 0 : (incA < incB ? -1 : 1);

    if (urgenteA && urgenteB) {
        // as duas urgentes: a data limite mais cedo (ou mais atrasada) primeiro...
        if (limiteA - limiteB !== 0) return limiteA - limiteB;
        // ...e se a data limite EMPATA, vale a Data Finalização — dias diferentes
        // podem cair na mesma data limite (ex: um feriado cadastrado no meio junta
        // 12/10 e 13/10 no mesmo limite; sem esse desempate as duas ficavam na ordem
        // da planilha e a de 13/10 podia passar na frente da de 12/10).
        return porFinalizacao() || porInclusao() || (a.prioridade ?? 99) - (b.prioridade ?? 99);
    }
    if (urgenteA && !urgenteB) return -1;
    if (!urgenteA && urgenteB) return 1;

    // Nenhuma urgente (ou sem data) — ordena por data de inclusão, mais
    // antiga primeiro; sem data de inclusão vai pro fim; empate cai na Data
    // Finalização e, por último, na prioridade.
    return porInclusao() || porFinalizacao() || (a.prioridade ?? 99) - (b.prioridade ?? 99);
}

// Monta a fila de um grupo inteiro: primeiro tudo que já está "em
// andamento" (ordenado por prioridade), depois tudo "aguardando definição"
// (também por prioridade) — confirmado com o usuário, essa é a ordem.
// Ordem manual do Enfesto (só esse grupo, sem tempo confiável — usuário
// pediu pra poder reordenar na mão, já que o sistema não consegue dizer
// quando cada OP começa/termina). Guardada como array de chaves "op|ciclo"
// na ordem desejada — OP nova que aparecer numa reimportação entra no
// FIM, na ordem automática entre si (não temos como saber onde ela
// "deveria" ficar no meio de uma ordem que foi feita à mão).
function obterOrdemManualEnfesto() {
    try { return JSON.parse(localStorage.getItem('ordemManualEnfesto') || '[]'); } catch (e) { return []; }
}
function salvarOrdemManualEnfesto(ordem) {
    localStorage.setItem('ordemManualEnfesto', JSON.stringify(ordem));
}
function aplicarOrdemManualEnfesto(fila) {
    const ordemSalva = obterOrdemManualEnfesto();
    if (!ordemSalva.length) return fila;
    const porChave = new Map(fila.map(op => [chaveOPCostura(op.op, op.ciclo), op]));
    const ordenados = [];
    ordemSalva.forEach(chave => {
        if (porChave.has(chave)) { ordenados.push(porChave.get(chave)); porChave.delete(chave); }
    });
    ordenados.push(...porChave.values()); // OPs novas, não estavam na ordem salva
    return ordenados;
}

// Publica a ordem inteira na hora (1 linha só, id fixo 'enfesto') — sem
// esperar o botão geral de publicar, senão outra pessoa só veria a ordem
// nova bem depois.
async function publicarOrdemManualEnfestoNaNuvem(ordem) {
    if (!supabaseClient) return;
    try {
        const { error } = await supabaseClient.from('ordem_manual_enfesto').upsert({
            id: 'enfesto', ordem,
            atualizado_por: sessaoAdminAtual && sessaoAdminAtual.user ? sessaoAdminAtual.user.email : 'desconhecido',
            atualizado_em: new Date().toISOString(),
        }, { onConflict: 'id' });
        if (error) throw error;
        registrarLogDebug('log', ['[NUVEM] Ordem manual do Enfesto publicada.']);
    } catch (e) {
        registrarLogDebug('error', ['Falha ao publicar ordem do Enfesto na nuvem: ' + e.message]);
        showToast('<i class="fas fa-triangle-exclamation"></i> Salvou aqui, mas não consegui avisar a nuvem — outras pessoas podem não ver essa ordem nova ainda.', true);
    }
}

// Busca a ordem da nuvem — TODO MUNDO carrega (mesmo padrão de
// ops_removidas_seq_costura), já que o objetivo é sincronizar entre
// qualquer computador, admin incluído.
async function carregarOrdemManualEnfestoDaNuvem() {
    if (!supabaseClient) return;
    try {
        const { data, error } = await supabaseClient.from('ordem_manual_enfesto').select('*').eq('id', 'enfesto').maybeSingle();
        if (error) throw error;
        salvarOrdemManualEnfesto(data && Array.isArray(data.ordem) ? data.ordem : []);
        renderizarSequenciamentoCostura();
    } catch (e) {
        registrarLogDebug('error', ['Falha ao carregar ordem do Enfesto da nuvem: ' + e.message]);
    }
}

function montarFilaSequenciamentoCostura(chaveGrupo) {
    const grupo = GRUPOS_SEQUENCIAMENTO_COSTURA[chaveGrupo];
    if (!grupo) return [];
    const emAndamento = obterOPsPorLocalCostura(grupo.emAndamento, grupo.filtroEmAndamento)
        .map(op => ({ ...op, situacaoCostura: 'Em andamento', campoTempo: grupo.campoTempo }))
        .sort(compararPrioridadeCostura);
    // Acabamento não tem fila de espera separada (confirmado com o
    // usuário) — só pula essa parte quando o grupo não tiver um local de
    // "aguardando" definido.
    const aguardando = grupo.aguardando
        ? obterOPsPorLocalCostura(grupo.aguardando, grupo.filtroAguardando)
            .map(op => ({ ...op, situacaoCostura: 'Aguardando', campoTempo: grupo.campoTempo }))
            .sort(compararPrioridadeCostura)
        : [];
    const filaCompleta = [...emAndamento, ...aguardando];
    return chaveGrupo === 'ENFESTO' ? aplicarOrdemManualEnfesto(filaCompleta) : filaCompleta;
}

