// =========================================================================
// 📊 KPI — MOVIMENTAÇÃO POR SETOR (novo KPI, sendo construído com o
// usuário). Cada um dos 7 setores rastreados (Análise de Medidas, CAD, PCP
// Programação-Corte, Almox Tecido, Enfesto, Corte, Etiquetação) tem seu
// próprio relatório de movimentação (formato .CSV, separado por ";",
// colunas: Nr. Op / Ciclo / Dt. Movimento / Qt. Movimento, entre outras) —
// o usuário importa um de cada vez, escolhendo o setor na hora.
//
// Guardado como { setor: { opId: {ciclo, data (ISO), qtd} } } — acumula
// entre importações (uma OP mencionada de novo atualiza a entrada dela, as
// que não aparecem no arquivo atual mantêm o que já tinha).
// =========================================================================

const SETORES_KPI = ['PPCP PROGRAMACAO', 'ANALISE DE MEDIDAS', 'CAD', 'PCP PROGRAMACAO-CORTE', 'ALMOX TECIDO', 'ENFESTO', 'CORTE', 'ETIQUETACAO'];

// O relatório de movimentação traz o local de ORIGEM ("Ds. Localorigem")
// com o texto exato usado no sistema de origem do usuário — o número
// representa quanto aquele setor PRODUZIU/liberou (confirmado com o
// usuário: atribui à origem, não ao destino, do movimento). Esse
// mapeamento traduz pro nome limpo que a gente usa. Assim o sistema
// reconhece sozinho pra qual setor cada arquivo é, sem precisar perguntar
// antes de importar.
//
// Uma mesma etapa pode aparecer com grafias levemente diferentes conforme
// é ORIGEM ou DESTINO em relatórios diferentes (confirmado com o usuário
// pro caso de PPCP-Programação) — por isso duas chaves apontando pro
// mesmo setor limpo em alguns casos.
const MAPEAMENTO_LOCAL_DESTINO_KPI = {
    'PNP ALMOX. ANALISE DE MEDIDAS': 'ANALISE DE MEDIDAS',
    'PNP ALMOX. TECIDOS': 'ALMOX TECIDO',
    'PNP CAD': 'CAD',
    'PNP CORTE': 'CORTE',
    'PNP ENFESTO': 'ENFESTO',
    'PNP ETIQ PROF/AMARR SOC/SEP LOG/SEP GLA': 'ETIQUETACAO',
    'PNP PPCP-PROGRAMACAO CORTE': 'PCP PROGRAMACAO-CORTE',   // o que vem DEPOIS do CAD
    'PNP PPCP - PROGRAMACAO': 'PPCP PROGRAMACAO',            // o INICIAL, antes da Análise de Medidas — setor separado do de cima
};

// Algumas peças passam mais de uma vez pelo Corte/Enfesto de verdade
// (tecido principal, forro, dublada como camadas separadas) — confirmado
// com o usuário: Paletó e Blazer = 3x, Jaqueta = 2x, resto (inclusive
// Calça) fica 1x, sem multiplicar. Só vale pra esses 2 setores, onde o
// trabalho de fato se repete por camada — nos outros 5, a peça passa uma
// vez só, independente do tipo.
const SETORES_COM_MULTIPLICADOR_CAMADAS_KPI = new Set(['CORTE', 'ENFESTO']);
const MULTIPLICADOR_CAMADAS_KPI = [
    { termo: /PALET[OÓ]/i, vezes: 3 },
    { termo: /BLAZER/i, vezes: 3 },
    { termo: /SOBRETUDO/i, vezes: 3 },
    { termo: /JAQUETA/i, vezes: 2 },
];
function multiplicadorDeCamadas(descricao) {
    const encontrado = MULTIPLICADOR_CAMADAS_KPI.find(m => m.termo.test(descricao || ''));
    return encontrado ? encontrado.vezes : 1;
}

// Grupo de produto (calça, camisa, jaqueta...) a partir da descrição ("CORTE CALCA UNX CARGO SARJA...", "CAMISA FEM ML MICROFIBRA..."). Ordem importa: o mais específico primeiro.
const GRUPOS_PRODUTO_KPI = [
    ['CAMISA POLO', /\bPOLO\b/], ['CAMISETA', /CAMISETA/], ['CAMISA', /CAMISA|CAMISOLA/], ['BLUSA', /BLUSA|BLUSINHA/],
    ['CALÇA', /CALCA|CALÇA|LEGGING/], ['BERMUDA', /BERMUDA|SHORT/], ['JAQUETA', /JAQUETA|JAQ\b|CASACO|PARKA|MOLETOM/],
    ['COLETE', /COLETE/], ['PALETÓ / BLAZER', /PALET[OÓ]|BLAZER|SOBRETUDO/], ['JALECO', /JALECO/], ['AVENTAL', /AVENTAL/],
    ['SAIA', /SAIA/], ['VESTIDO', /VESTIDO/], ['MACACÃO', /MACAC[AÃ]O|JARDINEIRA|MACAQUINHO/], ['BONÉ', /BON[EÉ]\b/], ['CALÇADO', /CALCADO|CALÇADO|BOTA\b|SAPATO/],
];
function grupoProdutoKPI(descricao) {
    const d = String(descricao || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
    if (!d.trim()) return 'SEM PRODUTO';
    const g = GRUPOS_PRODUTO_KPI.find(([, re]) => re.test(d));
    return g ? g[0] : 'OUTROS';
}

function obterMovimentacoesPorSetorBruto() {
    try { return JSON.parse(localStorage.getItem('movimentacoesPorSetorKPI') || '{}'); } catch (e) { return {}; }
}

// =========================================================================
// 🏭 EXTERNO x FÁBRICA — o relatório traz a coluna "Cod. Loc Prod Cost" (coluna N): "INT" (ou vazia) = a OP
// é da fábrica; qualquer outro texto é a oficina onde a OP está (digitado à mão, com variações e erros). O texto
// vai guardado em cada movimentação (campo `of`, normalizado). A classificação é feita na hora de mostrar —
// então mudar a regra vale pros dados já importados, sem reimportar:
//   1) override manual do usuário (modal OFICINAS) manda; 2) senão, texto com "CORTE" = externo; 3) senão, fábrica.
// A visão normal do KPI NÃO conta o externo; o botão EXTERNO mostra SÓ o externo. Importar, limpar, publicar
// e listar meses usam sempre o conjunto completo (Bruto).
// =========================================================================
function normalizarOficinaKPI(t) {
    return String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
}
function obterClassificacaoOficinasKPI() {
    try { return JSON.parse(localStorage.getItem('oficinasKPIClassificacao') || '{}'); } catch (e) { return {}; }
}
// Palavras que, aparecendo no texto da coluna N, já marcam a OP como externa (sem precisar de override manual).
// "MATHEUS MG" cobre "matheus-mg", "matheus mg" e "matheusmg" (pontuação vira espaço e também se compara sem espaços).
const PALAVRAS_EXTERNO_KPI = ['CORTE', 'ANDERSON', 'MATHEUS MG', 'DESTINO EXTERNO'];   // 'DESTINO EXTERNO' é o marcador que a importação grava quando o destino da movimentação é externo (ver DESTINOS_EXTERNOS_KPI)
// Nomes curtos: só valem como PALAVRA inteira (senão "ARI" pegaria MARIA, MARIANA, VARIEDADE...).
const PALAVRAS_INTEIRAS_EXTERNO_KPI = ['ARI'];
function textoTemPalavraExternoKPI(t) {
    const espacado = String(t || '').replace(/[^A-Z0-9]+/g, ' ').trim();
    const colado = espacado.replace(/ /g, '');
    const palavras = espacado.split(' ');
    return PALAVRAS_EXTERNO_KPI.some(p => espacado.includes(p) || colado.includes(p.replace(/ /g, ''))) || PALAVRAS_INTEIRAS_EXTERNO_KPI.some(p => palavras.includes(p));
}
// Setores em que o LOCAL DE DESTINO decide o externo: no Almox Tecidos o tecido já sai separado pra oficina, então destino
// "...EXTERNO" = externo. Nos outros setores NÃO vale (a OP ainda passa pelo setor seguinte antes de ir pra fora): lá só a coluna N decide.
const DESTINOS_EXTERNOS_KPI = { 'ALMOX TECIDO': /EXTERNO/ };
function oficinaEhExternaKPI(of, classif) {
    const t = normalizarOficinaKPI(of);
    if (!t || t === 'INT') return false;
    const c = classif || obterClassificacaoOficinasKPI();
    if (c[t]) return c[t] === 'EXT';
    return textoTemPalavraExternoKPI(t);
}
function modoVisaoKPI() {
    try { const v = localStorage.getItem('kpiVisaoExterno'); return v === 'externo' || v === '1' ? 'externo' : (v === 'juntos' ? 'juntos' : 'fabrica'); } catch (e) { return 'fabrica'; }
}
// modo: 'fabrica' (sem externos), 'externo' (só externos), 'juntos' (tudo). Sem argumento, segue a escolha da tela.
function obterMovimentacoesPorSetor(modo) {
    modo = modo || modoVisaoKPI();
    const todas = obterMovimentacoesPorSetorBruto();
    if (modo === 'juntos') return todas;
    const classif = obterClassificacaoOficinasKPI();
    const querExterno = modo === 'externo';
    const resultado = {};
    Object.entries(todas).forEach(([setor, porOP]) => {
        const filtrado = {};
        Object.entries(porOP).forEach(([chave, m]) => {
            if (oficinaEhExternaKPI(m.of, classif) === querExterno) filtrado[chave] = m;
        });
        if (Object.keys(filtrado).length) resultado[setor] = filtrado;
    });
    return resultado;
}
function definirVisaoKPI(modo) {
    try { localStorage.setItem('kpiVisaoExterno', modo); } catch (e) { /* ignora */ }
    renderizarGraficoKPI();
}
function atualizarBotaoVisaoExternoKPI() {
    const modo = modoVisaoKPI();
    [['fabrica', 'btnVisaoFabricaKPI'], ['externo', 'btnVisaoExternoKPI'], ['juntos', 'btnVisaoJuntosKPI']].forEach(([m, id]) => {
        const b = $(id); if (!b) return;
        const ativo = modo === m;
        b.style.background = ativo ? (m === 'externo' ? 'var(--cor-alerta)' : '#35505C') : 'var(--bg-card)';
        b.style.color = ativo ? 'white' : 'var(--texto-cor)';
    });
    const av = $('avisoVisaoExternoKPI');
    if (av) {
        av.style.display = modo === 'fabrica' ? 'none' : 'block';
        av.innerHTML = modo === 'externo'
            ? '<i class="fas fa-industry"></i> <strong>Mostrando SÓ o que é de externo (oficinas).</strong> Esses números não entram no KPI normal da fábrica. Clique em FÁBRICA para voltar.'
            : '<i class="fas fa-layer-group"></i> <strong>Mostrando fábrica + externo JUNTOS.</strong> Os números incluem as OPs de oficinas externas. Clique em FÁBRICA para ver sem elas.';
    }
}
// Lista de textos da coluna N já vistos nos dados + como cada um é tratado hoje; o usuário pode forçar Externo/Fábrica.
function listarOficinasKPI() {
    const todas = obterMovimentacoesPorSetorBruto();
    const classif = obterClassificacaoOficinasKPI();
    const mapa = {};
    Object.values(todas).forEach(porOP => Object.values(porOP).forEach(m => {
        const t = normalizarOficinaKPI(m.of); if (!t || t === 'INT') return;
        const o = mapa[t] = mapa[t] || { texto: t, movs: 0, pecas: 0, ops: new Set() };
        o.movs++; o.pecas += m.qtd || 0; o.ops.add(m.op);
    }));
    return Object.values(mapa).map(o => ({ texto: o.texto, movs: o.movs, pecas: o.pecas, ops: o.ops.size, override: classif[o.texto] || '', externo: oficinaEhExternaKPI(o.texto, classif) })).sort((a, b) => b.pecas - a.pecas);
}
let _oficinasKPIListadas = [];
function abrirModalOficinasKPI() {
    _oficinasKPIListadas = listarOficinasKPI();
    const linhas = _oficinasKPIListadas.length ? _oficinasKPIListadas.map((o, i) => `<tr>
        <td><strong>${o.texto.replace(/</g, '&lt;')}</strong></td>
        <td style="text-align:right;">${o.ops.toLocaleString('pt-BR')}</td>
        <td style="text-align:right;">${o.pecas.toLocaleString('pt-BR')}</td>
        <td><select onchange="definirClassificacaoOficinaKPI(${i}, this.value)">
            <option value="" ${!o.override ? 'selected' : ''}>Automático (${textoTemPalavraExternoKPI(o.texto) ? 'tem palavra de externo' : 'sem palavra de externo: fábrica'})</option>
            <option value="EXT" ${o.override === 'EXT' ? 'selected' : ''}>Externo</option>
            <option value="INT" ${o.override === 'INT' ? 'selected' : ''}>Fábrica</option>
        </select></td>
        <td style="font-weight:700; color:${o.externo ? 'var(--cor-alerta)' : 'var(--texto-secundario)'};">${o.externo ? 'EXTERNO' : 'fábrica'}</td></tr>`).join('')
        : '<tr><td colspan="5" style="text-align:center; padding:20px; color:var(--texto-secundario);">Nenhuma oficina nos dados ainda. Importe o relatório de movimentação (ele precisa ter a coluna "Cod. Loc Prod Cost"). Meses importados antes dessa função precisam ser reimportados.</td></tr>';
    const modal = $('modalOficinasKPI');
    modal.innerHTML = `<div class="modal-card" style="width:760px; max-width:94vw; border-top:5px solid var(--cor-alerta); max-height:88vh;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; border-bottom:2px solid var(--borda-cor); padding-bottom:10px;">
            <h2 style="margin:0; color:var(--texto-cor); display:flex; align-items:center; gap:10px;"><i class="fas fa-industry" style="color:var(--cor-alerta);"></i> OFICINAS (EXTERNO)</h2>
            <button onclick="document.getElementById('modalOficinasKPI').style.display='none'" class="modal-fechar-btn"><i class="fas fa-times"></i></button>
        </div>
        <div style="font-size:12px; color:var(--texto-secundario); margin-bottom:12px;">Textos da coluna "Cod. Loc Prod Cost" do relatório. <strong>INT</strong> ou vazio = fábrica. Todo texto com <strong>CORTE</strong>, <strong>ANDERSON</strong>, <strong>MATHEUS MG</strong> ou <strong>ARI</strong> (palavra inteira) é tratado como externo automaticamente; para os outros, escolha <strong>Externo</strong> na lista (vale também pros dados já importados). Só o que está como Externo sai do KPI normal e aparece no botão EXTERNO.</div>
        <div style="overflow-y:auto; flex:1; margin-bottom:15px;"><table class="tabela-dados" style="width:100%;"><thead><tr><th>TEXTO NO RELATÓRIO</th><th style="text-align:right;">OPs</th><th style="text-align:right;">PEÇAS</th><th>COMO TRATAR</th><th>HOJE</th></tr></thead><tbody>${linhas}</tbody></table></div>
        <div style="display:flex; justify-content:flex-end; border-top:1px solid var(--borda-cor); padding-top:15px;"><button onclick="document.getElementById('modalOficinasKPI').style.display='none'" class="btn" style="background:var(--borda-cor); color:var(--texto-cor);">FECHAR</button></div></div>`;
    modal.style.display = 'flex';
}
function definirClassificacaoOficinaKPI(i, valor) {
    const o = _oficinasKPIListadas[i]; if (!o) return;
    const c = obterClassificacaoOficinasKPI();
    if (valor) c[o.texto] = valor; else delete c[o.texto];
    try { localStorage.setItem('oficinasKPIClassificacao', JSON.stringify(c)); } catch (e) { /* ignora */ }
    renderizarGraficoKPI();
    abrirModalOficinasKPI();
}

// Remove movimentações mais antigas que X dias — usado antes de salvar,
// pra evitar estourar o limite de armazenamento do navegador (localStorage
// costuma ter só uns 5-10MB no total, compartilhado com todo o resto do
// sistema). Dado antigo já foi publicado na nuvem várias vezes até essa
// altura, então não tem problema não guardar ele localmente pra sempre.
function podarMovimentacoesAntigas(obj, diasParaManter) {
    const limite = new Date();
    limite.setDate(limite.getDate() - diasParaManter);
    const limiteISO = limite.toISOString();
    const resultado = {};
    Object.entries(obj).forEach(([setor, porOP]) => {
        const filtrado = {};
        Object.entries(porOP).forEach(([opId, m]) => {
            if (m.data && m.data >= limiteISO) filtrado[opId] = m;
        });
        if (Object.keys(filtrado).length) resultado[setor] = filtrado;
    });
    return resultado;
}

function salvarMovimentacoesPorSetor(obj) {
    // Tenta salvar TUDO primeiro, sem podar nada — só entra em modo de
    // poda se o espaço realmente estourar. Antes, a poda de 90 dias rodava
    // sempre, mesmo com espaço de sobra — isso descartava na hora qualquer
    // relatório antigo importado de propósito (ex: reimportar janeiro em
    // setembro), mesmo sem precisar.
    try {
        localStorage.setItem('movimentacoesPorSetorKPI', JSON.stringify(obj));
        return;
    } catch (e) { /* segue pra tentar podar */ }

    try {
        const podado90 = podarMovimentacoesAntigas(obj, 90);
        localStorage.setItem('movimentacoesPorSetorKPI', JSON.stringify(podado90));
        showToast('<i class="fas fa-triangle-exclamation"></i> Espaço do navegador ficou apertado — mantidos só os últimos 90 dias localmente (o resto já está salvo na nuvem, publique antes de limpar se ainda não publicou).', true);
        return;
    } catch (e) { /* segue pra tentar mais agressivo */ }

    try {
        const podado30 = podarMovimentacoesAntigas(obj, 30);
        localStorage.setItem('movimentacoesPorSetorKPI', JSON.stringify(podado30));
        showToast('<i class="fas fa-triangle-exclamation"></i> Espaço do navegador ficou bem apertado — mantidos só os últimos 30 dias localmente (o resto já está salvo na nuvem, publique antes de limpar se ainda não publicou).', true);
    } catch (e2) {
        console.error('Falha ao salvar movimentações de KPI mesmo após podar:', e2);
        alert("❌ Não foi possível salvar as movimentações — o armazenamento do navegador está cheio.\n\nUse o botão LIMPAR DADOS (escolhendo um setor específico ou 'Todos') pra liberar espaço. Se ainda não publicou na nuvem recentemente, publique antes de limpar.");
    }
}

// A nuvem trabalha com linhas, não com o objeto aninhado que usamos aqui —
// essas duas funções convertem de um formato pro outro. Chave da linha:
// "setor|op|data" — precisa da DATA também, senão a mesma OP passando 2x
// pelo mesmo setor em dias diferentes colide na mesma linha da nuvem e
// uma sobrescreve a outra (mesmo bug que existia no armazenamento local,
// corrigido junto).
// Identidade de uma OP no KPI: "ciclo-OP" (o mesmo número pode existir em ciclos diferentes). Sem ciclo, só o número.
function idOPKPI(m) { return m && m.ciclo ? `${String(m.ciclo).trim()}-${m.op}` : String(m && m.op); }
// Chave da movimentação dentro do setor: ciclo + OP + dia (antes era só OP + dia, e duas OPs de mesmo número em ciclos diferentes se sobrescreviam).
function chaveMovimentoKPI(op, ciclo, diaSlice) { return `${ciclo ? String(ciclo).trim() + '-' : ''}${op}|${diaSlice}`; }

function linhaSupabaseDeMovimentoKPI(setor, m) {
    const dataSlice = m.data ? new Date(m.data).toISOString().slice(0, 10) : 'semdata';
    return { id: `${setor}|${m.ciclo ? m.ciclo + '-' : ''}${m.op}|${dataSlice}`, setor, op: m.op, ciclo: m.ciclo || '', data: m.data ? new Date(m.data).toISOString().slice(0, 10) : null, qtd: m.qtd || 0, oficina: m.of || '', produto: m.ds || '', atualizado_em: new Date().toISOString() };
}

// Depois de importar um relatório de movimentação, publica na nuvem SÓ o que
// veio nessa importação (não a base local inteira): antes o dado ficava só
// neste navegador até alguém lembrar de clicar em PUBLICAR — e uma limpeza
// local (ou trocar de computador) perdia o que nunca tinha subido. Não mexe em
// "dados de: há X min" do visitante (esse carimbo é da publicação GERAL; marcar
// aqui faria parecer que as OPs também foram atualizadas). Falha na nuvem NÃO
// desfaz a importação local — só avisa, e o PUBLICAR do menu Sistema continua valendo.
// Publica movimentações do KPI. Se a nuvem ainda não tem a coluna "oficina" (SQL 29), publica sem ela
// (o KPI continua funcionando, só o externo não vai junto pra nuvem) em vez de travar a publicação inteira.
async function publicarMovimentacoesKPILinhas(linhas) {
    try {
        return await publicarSemApagar('movimentacoes_kpi', linhas);
    } catch (e) {
        if (/produto/i.test(String(e && e.message || e)) && !/oficina/i.test(String(e && e.message || e))) {   // nuvem ainda sem a coluna "produto": publica sem ela
            registrarLogDebug('error', ['[NUVEM] Falta a coluna "produto" em movimentacoes_kpi: KPI publicado SEM a descrição do produto.']);
            return await publicarMovimentacoesKPILinhas(linhas.map(({ produto, ...resto }) => resto));
        }
        if (!/oficina/i.test(String(e && e.message || e))) throw e;
        registrarLogDebug('error', ['[NUVEM] Falta rodar o SQL 29 (coluna "oficina" em movimentacoes_kpi): KPI publicado SEM a informação de externo.']);
        showToast('<i class="fas fa-triangle-exclamation"></i> A nuvem ainda não tem a coluna "oficina" (SQL 29): o KPI foi publicado, mas a informação de externo ficou só neste navegador.', true, 8000);
        return await publicarSemApagar('movimentacoes_kpi', linhas.map(({ oficina, ...resto }) => resto));
    }
}

async function publicarMovimentacoesImportadasNaNuvem(movimentos) {
    if (!movimentos || !movimentos.length) return;
    if (!supabaseClient || !sessaoAdminAtual) {
        showToast('<i class="fas fa-triangle-exclamation"></i> Importado só neste navegador: você não está logado, então não foi pra nuvem. Entre e use PUBLICAR.', true, 7000);
        return;
    }
    try {
        const r = await publicarMovimentacoesKPILinhas(movimentos.map(({ setor, m }) => linhaSupabaseDeMovimentoKPI(setor, m)));
        showToast(`<i class="fas fa-cloud-upload-alt"></i> KPI publicado na nuvem (${r.publicados.toLocaleString('pt-BR')} movimentações).`, false, 4000);
    } catch (e) {
        registrarLogDebug('error', ['Falha ao publicar o KPI importado: ' + e.message]);
        showToast('<i class="fas fa-triangle-exclamation"></i> Importou, mas NÃO foi pra nuvem (' + (e.message || 'erro') + '). Os dados estão só neste navegador — use PUBLICAR no menu Sistema.', true, 9000);
    }
}

function movimentacoesParaLinhasSupabase() {
    const todas = obterMovimentacoesPorSetorBruto();
    const linhas = [];
    Object.entries(todas).forEach(([setor, porOP]) => {
        Object.values(porOP).forEach(m => {
            const dataSlice = m.data ? new Date(m.data).toISOString().slice(0, 10) : 'semdata';
            linhas.push(linhaSupabaseDeMovimentoKPI(setor, m));
        });
    });
    return linhas;
}
function linhasSupabaseParaMovimentacoes(linhas) {
    const todas = {};
    (linhas || []).forEach(l => {
        if (!l.setor || !l.op) return;
        if (!todas[l.setor]) todas[l.setor] = {};
        const dataSlice = l.data ? String(l.data).slice(0, 10) : 'semdata';
        const chaveMovimento = chaveMovimentoKPI(l.op, l.ciclo, dataSlice);
        todas[l.setor][chaveMovimento] = { op: l.op, ciclo: l.ciclo || '', data: l.data, qtd: l.qtd || 0 };
        if (l.oficina) todas[l.setor][chaveMovimento].of = normalizarOficinaKPI(l.oficina);
        if (l.produto) todas[l.setor][chaveMovimento].ds = l.produto;
    });
    return todas;
}

// Data no formato brasileiro "DD/MM/AAAA" (como vem no relatório) — vira
// Date de verdade, guardado como ISO pra ser fácil de comparar depois.
function parsearDataBR(str) {
    if (!str) return null;
    const m = String(str).trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) return null;
    return new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1]));
}

// Nome do mês pra mostrar em avisos ("SETEMBRO/2026"), a partir de "AAAA-MM".
function rotuloMesKPI(anoMes) {
    const nomes = ['JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'];
    const [ano, mes] = String(anoMes).split('-');
    return `${nomes[Number(mes) - 1] || mes}/${ano}`;
}

// Apaga as movimentações importadas do MÊS escolhido no seletor MÊS — do
// setor selecionado, ou de todos os setores se estiver em "Todos". Os outros
// meses não são mexidos. (Antes apagava o setor INTEIRO, de todos os meses,
// ignorando o seletor de mês: quem limpava setembro, já guardado em Excel,
// perdia também outubro sem querer — bug real relatado pelo usuário.)
// Só mexe no navegador: o que já foi publicado na nuvem continua lá.
function limparMovimentacoesKPI() {
    if (!exigirAdmin('limpar dados do KPI')) return;
    const setorSelecionado = $('seletorSetorKPI') ? $('seletorSetorKPI').value : 'TODOS';
    const anoMes = $('seletorMesKPI') ? $('seletorMesKPI').value : '';
    if (!anoMes) return alert('Escolha no seletor MÊS qual mês você quer limpar.');

    const todas = obterMovimentacoesPorSetorBruto();
    const setores = setorSelecionado === 'TODOS' ? Object.keys(todas) : [setorSelecionado];
    const doMes = m => m.data && new Date(m.data).toISOString().slice(0, 7) === anoMes;

    let aApagar = 0, aManter = 0;
    setores.forEach(setor => Object.values(todas[setor] || {}).forEach(m => { if (doMes(m)) aApagar++; else aManter++; }));
    const rotulo = rotuloMesKPI(anoMes);
    const onde = setorSelecionado === 'TODOS' ? 'de TODOS os setores' : `do setor "${setorSelecionado}"`;
    if (!aApagar) return alert(`Não há movimentações de ${rotulo} ${onde} pra limpar.`);

    const mensagem = `Vai apagar ${aApagar.toLocaleString('pt-BR')} movimentações de ${rotulo} ${onde}.\n\n`
        + `Os outros meses NÃO são mexidos (${aManter.toLocaleString('pt-BR')} movimentações ${onde} continuam).\n\n`
        + `Só apaga deste navegador — o que já foi publicado na nuvem continua lá. Se ainda não baixou o arquivo do mês (BAIXAR MÊS), baixe antes.\n\n`
        + `Não dá pra desfazer. Confirma?`;
    if (!confirm(mensagem)) return;

    setores.forEach(setor => {
        if (!todas[setor]) return;
        const mantidas = {};
        Object.entries(todas[setor]).forEach(([chave, m]) => { if (!doMes(m)) mantidas[chave] = m; });
        if (Object.keys(mantidas).length) todas[setor] = mantidas; else delete todas[setor];
    });
    salvarMovimentacoesPorSetor(todas);
    renderizarGraficoKPI();
    showToast(`<i class="fas fa-check"></i> ${rotulo} limpo (${aApagar.toLocaleString('pt-BR')} movimentações). Os outros meses foram mantidos.`);
}


