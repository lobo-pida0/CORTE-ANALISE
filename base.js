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
