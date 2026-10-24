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

    // Colunas da matéria-prima e da referência: acha pelo título (a planilha já perdeu colunas e elas mudaram de lugar);
    // se o título não for achado, usa as posições antigas (AM, AN, AO).
    const achar = (fn, padrao) => { const i = cab.findIndex(fn); return i !== -1 ? i : padrao; };
    const idxCodMP = achar(c => c.includes('CODIGO') && c.includes('M.P'), 38);
    const idxDescMP = achar(c => c.includes('DESCRICAO') && c.includes('M.P'), 39);
    const idxRefSinc = achar(c => c === 'REFERENCIA', 40);
    // Demais colunas, também pelo TÍTULO (a planilha já perdeu e trocou colunas de lugar). Título normalizado: sem acento, pontuação/quebra de linha viram espaço.
    const nz = t => semAc(t).replace(/[^A-Z0-9]+/g, ' ').trim();
    const cabNz = Array.from(rows[idxLinhaCab] || [], nz);
    const col = (...nomes) => { for (const n of nomes) { const i = cabNz.indexOf(n); if (i !== -1) return i; } return -1; };
    const cols = {
        tipoOP: (() => { let i = cabNz.findIndex(c => c.includes('REPOS') || c === 'TIPO' || c === 'TIPO OP' || c.includes('REPOSICAO OU PEDIDO')); if (i === -1 && cabNz.includes('CHAVE')) i = 25; return i; })(),   // reposição x pedido: pelo título; senão a coluna Z
        desc: col('DESCRICAO'), ciclo: col('CICLO'), op: col('NUM OP', 'OP'), qtd: (i => i !== -1 ? i : cabNz.findIndex(c => c.startsWith('QTDE')))(col('QTDE PECAS')),
        tempoCorte: col('T E MIN'), dataInclusao: col('DATA DE INCLUSAO OP'), localDestino: col('LOCAL'), temDublado: col('DUBLADO'),
        localAtual: col('LOCAL ATUAL'), dataCorte: col('DT CORTE PROGRAMADA'), diasLocal: col('DIAS LOCAL'),
    };
    return {
        idxLinhaCab, idxLaser, idxProduto, idxCodMP, idxDescMP, idxRefSinc, cols,
        letraLaser: idxLaser !== -1 ? letra(idxLaser) : null,
        letraProduto: idxProduto !== -1 ? letra(idxProduto) : null,
    };
}

// "REPOSIÇÃO" ou "PEDIDO" (coluna Z da Sincronização) — qualquer outro texto é guardado como veio, em maiúsculas.
function normalizarTipoOP(v) { return v === undefined || v === null ? '' : String(v).trim().toUpperCase(); }

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

        let C = colunasSinc.cols;
        // Cabeçalho sem os títulos conhecidos (planilha muito antiga/CSV simples): usa as posições do layout original.
        if (C.op === -1 && C.localAtual === -1) C = { desc: 3, ciclo: 4, op: 5, qtd: 6, tempoCorte: 7, dataInclusao: 16, localDestino: 17, temDublado: 18, localAtual: 21, dataCorte: 23, diasLocal: 25 };
        const faltamCols = [['Num. Op', C.op], ['Local atual', C.localAtual], ['Qtde Peças', C.qtd]].filter(([, i]) => i === -1).map(([n]) => n);
        if (faltamCols.length) throw new Error('Não encontrei na planilha de sincronização a(s) coluna(s): ' + faltamCols.join(', ') + '. Confira os títulos da linha de cabeçalho.');
        const dado = (r, i) => i === -1 ? undefined : r[i];
        for (let i = colunasSinc.idxLinhaCab + 1; i < rows.length; i++) {
            const r = rows[i]; if (!r) continue;

            // LÓGICA DE CRIAÇÃO DO BANCO DE DADOS (Mantida igual a sua original)
            if (dado(r, C.op) && !['OP', 'ORDEM'].includes(String(dado(r, C.op)).trim().toUpperCase())) {
                const loc = (dado(r, C.localAtual) ? String(dado(r, C.localAtual)).toUpperCase() : "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

                // "PNP ANALISE DE MATERIA PRIMA" também cai aqui (antes caía em ANALISE DE MEDIDAS por causa da palavra ANALISE)
                if ((loc.includes("AGUARD") || loc.includes("ANALISE")) && loc.includes("MATERIA") && loc.includes("PRIMA")) {
                    opsAguardandoMP.push({
                        id: String(dado(r, C.op)).trim(), ciclo: String(dado(r, C.ciclo) || ""), desc: String(dado(r, C.desc) || ""),
                        qtd: parseInt(dado(r, C.qtd)) || 0, diasLocal: parseInt(dado(r, C.diasLocal)) || 0,
                        codigoMP: r[colunasSinc.idxCodMP] ? String(r[colunasSinc.idxCodMP]).trim().toUpperCase() : "SEM CÓDIGO",
                        referencia: r[colunasSinc.idxRefSinc] ? String(r[colunasSinc.idxRefSinc]).trim().toUpperCase() : "",
                        produto: lerProduto(r),
                        sobMedida: mapaSBM.has(String(dado(r, C.op)).trim()),
                        tipoOP: normalizarTipoOP(dado(r, C.tipoOP)),
                        analiseMP: loc.includes("ANALISE")
                    });
                    continue; // não passa pela lógica de etapa 0-7 abaixo
                }

                let idxE = -1;
                if (loc.includes("EXTERNO")) idxE = -1;   // local externo (ex.: AGRUP CORTE EXTERNO) não é etapa da fábrica — antes caía em CORTE só por ter a palavra "CORTE"
                else if (loc.includes("CORTE") && !loc.includes("PROG") && !loc.includes("ENFESTO")) idxE = 7; else if (loc.includes("ENFESTO")) idxE = 6; else if (loc.includes("DUBLA")) idxE = 5; else if (loc.includes("ALMOX") && loc.includes("TECIDO")) idxE = 4; else if (loc.includes("PROG") && loc.includes("CORTE")) idxE = 3; else if (loc.includes("CAD")) idxE = 2; else if (loc.includes("ANALISE") || loc.includes("MEDIDA")) idxE = 1; else if (loc.includes("PROGRAMACAO")) idxE = 0;

                if (idxE !== -1) {
                    const idOP = String(dado(r, C.op)).trim(), cicloOP = String(dado(r, C.ciclo) || ""), chaveOP = montarChaveOP(cicloOP, idOP), old = mapA[chaveOP];
                    if (old && old.etapa !== idxE) movimentacoes.push({ id: idOP, ciclo: String(dado(r, C.ciclo) || ""), deIdx: old.etapa, paraIdx: idxE });
                    bancoDadosOPs.push({
                        id: idOP, ciclo: String(dado(r, C.ciclo) || ""), desc: String(dado(r, C.desc) || ""),
                        qtd: parseInt(dado(r, C.qtd)) || 0, tempoCorte: parseFloat(dado(r, C.tempoCorte)) || 0,
                        etapa: idxE, tipoOP: normalizarTipoOP(dado(r, C.tipoOP)), dataCorte: extrairDataExcel(dado(r, C.dataCorte)), // coluna X (antes era P/15)
                        localDestino: dado(r, C.localDestino) ? String(dado(r, C.localDestino)).trim().toUpperCase() : "N/D",
                        localExcel: dado(r, C.localAtual) ? String(dado(r, C.localAtual)).trim().toUpperCase() : "",
                        temDublado: dado(r, C.temDublado) ? String(dado(r, C.temDublado)).toUpperCase().includes("SIM") : false,
                        prioridade: prioridadesDestino.has(chaveOP) || prioridadesManuais.has(chaveOP), // fonte: importação "Destino de Produção" OU marcação manual — antes vinha da aba URGENCIAS
                        mesDestino: mesesDestino[chaveOP] || null, // "AAAA-MM" informado na importação de Destino — planilha não tem data que sirva pra isso
                        numeroPrioridade: numerosPrioridade[chaveOP] || null, // valor bruto da coluna Prioridade — só exibição
                        localDestinoDetalhado: locaisDestinoPorOP[chaveOP] || null, // "Descrição Local" do Destino — cobre etapas fora das 8 rastreadas
                        destaque: opsDestacadas.has(chaveOP), // "faça essa primeiro" — marcado na aba Prioridades
                        dataEntradaEtapa: (old && old.etapa === idxE && old.dataEntradaEtapa) ? old.dataEntradaEtapa : new Date(),
                        diasLocal: parseInt(dado(r, C.diasLocal)) || 0,
                        codigoMP: r[colunasSinc.idxCodMP] ? String(r[colunasSinc.idxCodMP]).trim().toUpperCase() : "SEM CÓDIGO",
                        descMP: r[colunasSinc.idxDescMP] ? String(r[colunasSinc.idxDescMP]).trim().toUpperCase() : "🔍 COLUNA VAZIA",
                        referencia: r[colunasSinc.idxRefSinc] ? String(r[colunasSinc.idxRefSinc]).trim().toUpperCase() : "", // coluna AO
                        sobMedida: mapaSBM.has(idOP), // aba BASE, coluna Y ("Descrição OP" contém "SBM")
                        laser: (colunasSinc.idxLaser !== -1 && r[colunasSinc.idxLaser]) ? String(r[colunasSinc.idxLaser]).trim().toUpperCase().includes('LASER') : false, // coluna do LASER (achada pelo cabeçalho)
                        produto: lerProduto(r), // camisa/calça/jaqueta... — só local (não vai pra nuvem), usado no filtro de Produto
                        dataFinalizacao: mapaFinalizacao.get(idOP) || null, // aba BASE, coluna P
                        dataCorteSuposta: calcularDataCorteSuposta(mapaFinalizacao.get(idOP)),
                        dataInclusao: extrairDataExcel(dado(r, C.dataInclusao)) || null, // quando a OP foi criada — base do cálculo de lead time por setor
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
            publicarDestinoNuvem().then(ok => { if (!ok && supabaseClient && sessaoAdminAtual) showToast('<i class="fas fa-triangle-exclamation"></i> O Destino foi importado aqui, mas não consegui publicar na nuvem — os outros usuários não vão ver ainda.', true, 6000); });
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

// =========================================================================
// ☁️ DESTINO NA NUVEM — o que a importação do Destino de Produção grava (estrelas, mês, número, local) fica numa linha só
// ('global' da tabela destino_producao), pra TODOS verem o mesmo (a aba Preparação lê o mês daqui). Quem importa publica; quem abre
// o sistema baixa se a nuvem estiver mais nova que a cópia local. Se a publicação falhar (sem internet), fica "pendente" e a cópia
// local não é sobrescrita até conseguir publicar.
// =========================================================================
function dadosDestinoLocal() { return { prioridades: [...obterPrioridadesDestino()], meses: obterOpsMesDestino(), numeros: obterNumerosPrioridade(), locais: obterLocaisDestinoPorOP() }; }
async function publicarDestinoNuvem() {
    if (!supabaseClient || !sessaoAdminAtual) return false;
    try {
        const agora = new Date().toISOString(), por = String((sessaoAdminAtual.user && sessaoAdminAtual.user.email) || '').split('@')[0].toUpperCase();
        localStorage.setItem('destinoPendentePublicar', '1');
        const { error } = await supabaseClient.from('destino_producao').upsert({ id: 'global', dados: dadosDestinoLocal(), atualizado_em: agora, atualizado_por: por }, { onConflict: 'id' });
        if (error) throw error;
        localStorage.setItem('destinoNuvemEm', agora); localStorage.removeItem('destinoPendentePublicar');
        return true;
    } catch (e) { registrarLogDebug('error', ['Falha ao publicar o Destino na nuvem: ' + e.message]); return false; }
}
async function carregarDestinoDaNuvem() {
    if (!supabaseClient) return;
    try {
        if (localStorage.getItem('destinoPendentePublicar') === '1') { if (sessaoAdminAtual) await publicarDestinoNuvem(); return; }
        const { data, error } = await supabaseClient.from('destino_producao').select('dados, atualizado_em').eq('id', 'global').maybeSingle();
        if (error) throw error;
        if (!data) { if (sessaoAdminAtual && Object.keys(obterOpsMesDestino()).length) await publicarDestinoNuvem(); return; }   // nuvem vazia: sobe o que já existe aqui
        if (data.atualizado_em === localStorage.getItem('destinoNuvemEm')) return;                                                  // já está igual
        const d = data.dados || {};
        localStorage.setItem('prioridadesDestino', JSON.stringify(d.prioridades || []));
        localStorage.setItem('opsMesDestino', JSON.stringify(d.meses || {}));
        localStorage.setItem('numerosPrioridade', JSON.stringify(d.numeros || {}));
        localStorage.setItem('locaisDestinoPorOP', JSON.stringify(d.locais || {}));
        localStorage.setItem('destinoNuvemEm', data.atualizado_em);
        if (papelUsuarioAtual === 'admin') {   // admin trabalha com a Sincronização local: reaplica nas OPs da tela (visitante/usuário já recebem tudo pronto das OPs da nuvem)
            const pri = obterPrioridadesDestino(), man = obterPrioridadesManuais(); let mudou = 0;
            bancoDadosOPs.forEach(op => { const k = chaveDaOP(op), p = pri.has(k) || man.has(k), m = (d.meses || {})[k] || null, n = (d.numeros || {})[k] || null, l = (d.locais || {})[k] || null;
                if (op.prioridade !== p || op.mesDestino !== m || op.numeroPrioridade !== n || op.localDestinoDetalhado !== l) { op.prioridade = p; op.mesDestino = m; op.numeroPrioridade = n; op.localDestinoDetalhado = l; mudou++; } });
            if (mudou) localStorage.setItem('bancoOPs', JSON.stringify(bancoDadosOPs));
        }
        try { renderizarFiltroMesDestino(); reconstruirFiltrosPrioridades(); renderizarTudoImediato(); renderizarPreparacao(); } catch (e2) { /* tela ainda não montada */ }
    } catch (e) { registrarLogDebug('error', ['Falha ao carregar o Destino da nuvem: ' + e.message]); }
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

