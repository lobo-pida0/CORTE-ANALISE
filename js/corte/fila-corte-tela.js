// -------------------------------------------------------------------------
// (separado de producao-tempos.js) Ordem manual do Enfesto e a tela/imagem da Fila de Corte.
// -------------------------------------------------------------------------
// Setas de subir/descer pro Enfesto — trocado do arrastar-e-soltar
// original a pedido do usuário (arrastar não funcionou bem no navegador
// dele). Move a OP uma posição na fila (troca de lugar com a vizinha),
// salva a ordem inteira resultante (local + nuvem) e re-renderiza.
function moverOPEnfesto(chave, direcao) {
    if (!exigirAdminOuUsuario('reordenar o Enfesto')) return;
    const fila = montarFilaSequenciamentoCostura('ENFESTO');
    const chaves = fila.map(op => chaveOPCostura(op.op, op.ciclo));
    const indice = chaves.indexOf(chave);
    const novoIndice = indice + direcao;
    if (indice === -1 || novoIndice < 0 || novoIndice >= chaves.length) return;
    [chaves[indice], chaves[novoIndice]] = [chaves[novoIndice], chaves[indice]];
    salvarOrdemManualEnfesto(chaves);
    publicarOrdemManualEnfestoNaNuvem(chaves);
    renderizarSequenciamentoCostura();
}

function resetarOrdemAutomaticaEnfesto() {
    if (!exigirAdminOuUsuario('resetar a ordem do Enfesto')) return;
    if (!confirm('Voltar o Enfesto pra ordem automática (por data de finalização/prioridade)? A ordem manual que você fez vai ser descartada.')) return;
    salvarOrdemManualEnfesto([]);
    publicarOrdemManualEnfestoNaNuvem([]);
    renderizarSequenciamentoCostura();
    showToast("<i class='fas fa-rotate-left'></i> Enfesto voltou pra ordem automática.");
}

function renderizarFilaCorte() {
    if (!$('listaFilaCorte')) return;
    const media = calcularMediaDiariaCorte();
    if ($('inputMediaCorteManual') && document.activeElement !== $('inputMediaCorteManual')) {
        $('inputMediaCorteManual').value = obterMediaCorteManual() || '';
    }

    if ($('mediaCorteInfo')) {
        $('mediaCorteInfo').innerText = media > 0
            ? `Média diária do Corte: ${Math.round(media).toLocaleString('pt-BR')} pçs/dia${obterMediaCorteManual() !== null ? ' (manual)' : ''}`
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
            $('listaFilaCorte').innerHTML = `<tr><td colspan="5" class="tabela-vazia"><i class="fas fa-file-import tabela-vazia-icone"></i>Importe a planilha geral (POR_OP) pra ver a fila de corte.</td></tr>`;
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
