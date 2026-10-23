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

const ABAS_DENTRO_DO_MENU_MAIS = ['aba-fila', 'aba-pedidos', 'aba-filacorte', 'aba-sequenciamento', 'aba-necessidade', 'aba-plano-costura', 'aba-producao-grupo'];
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

