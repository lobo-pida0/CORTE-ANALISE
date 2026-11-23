// -------------------------------------------------------------------------
// (separado de ops-prioridades.js) Importação da planilha de Sincronização (OPs) e balanço do que mudou.
// -------------------------------------------------------------------------
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
function normalizarTipoOP(v) { const t = v === undefined || v === null ? '' : String(v).trim().toUpperCase(); return t === '0' || t === '#N/D' || t === '#N/A' ? '' : t; }

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
