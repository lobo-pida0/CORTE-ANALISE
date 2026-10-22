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
        wireEvento('toggleSidebarPrioridades-2', 'click', () => { abrirAba(null, 'aba-prioridades'); });
        wireEvento('abrirPrioridadeClientes', 'click', () => { abrirModalPrioridadeClientes(); });
        wireEvento('inputGrades', 'change', () => { processarGrades(); });
        wireEvento('inputPedidos', 'change', () => { processarPedidos(); });
        wireEvento('inputDestino', 'change', () => { processarDestino(); });
        wireEvento('gerarSugestaoPedidos', 'click', () => { gerarSugestaoSequenciaPedidos(); });
        wireEvento('abrirSequenciamentoFifo', 'click', () => { abrirModalSequenciamentoFifo(); });
        wireEvento('abrirGuiaSequenciamento-montador', 'click', () => { abrirGuiaSequenciamento(); });
        wireEvento('abrirGuiaSequenciamento-pedidos', 'click', () => { abrirGuiaSequenciamento(); });
        wireEvento('abrirGuiaSequenciamento-menu', 'click', () => { abrirGuiaSequenciamento(); });
        wireEvento('abrirAgrupamentoReferencia', 'click', () => { abrirAgrupamentoReferencia(); });
        wireEvento('abrirModalPerguntarIA', 'click', () => { abrirModalPerguntarIA(); });
        wireEvento('abrirModalPrioridadeManual', 'click', () => { abrirModalPrioridadeManual(); });
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
        wireEvento('modalDetalheSetorKPI', 'click', function(event){ if(event.target === this) this.style.display='none'; });
        wireEvento('modalOficinasKPI', 'click', function(event){ if(event.target === this) this.style.display='none'; });
        wireEvento('modalGargalo', 'click', function(event){ if(event.target === this) this.style.display='none'; });
        wireEvento('ctxAcao-copiar', 'click', () => { ctxAcao('copiar'); });
        wireEvento('ctxAcao-prioridade', 'click', () => { ctxAcao('prioridade'); });
        wireEvento('ctxAcao-fracionar', 'click', () => { ctxAcao('fracionar'); });
        wireEvento('ctxAcao-avancar', 'click', () => { ctxAcao('avancar'); });
        wireEvento('btnMenuAnalise', 'click', () => { toggleDropdown('menuAnalise'); });
        wireEvento('btnMenuImportar', 'click', () => { toggleDropdown('menuImportar'); });
        wireEvento('btnMenuSistema', 'click', () => { toggleDropdown('menuSistema'); });
        wireEvento('btnMenuMaisAbas', 'click', () => { toggleDropdownFixo('btnMenuMaisAbas', 'menuMaisAbas'); });
        wireEvento('btnMenuMaisOpcoes', 'click', () => { toggleDropdown('menuMaisOpcoes'); });
        wireEvento('analisarGargalo', 'click', () => { analisarGargalo(); });
        wireEvento('verificarEspacoNuvemBtn', 'click', () => { verificarEspacoNuvem(true); });
        wireEvento('ativarModoTV', 'click', () => { ativarModoTV(); });
        wireEvento('toggleTema', 'click', () => { toggleTema(); });
        wireEvento('toggleDensidade', 'click', () => { toggleDensidadeTabelas(); });
        wireEvento('abrirBuscaGlobal', 'click', () => { abrirBuscaGlobal(); });
        wireEvento('abrirGuiaSistema', 'click', () => { abrirGuiaSistema(); });
        wireEvento('btnLoginAdmin', 'click', () => { abrirModalLoginAdmin(); });
        wireEvento('publicarSupabase', 'click', () => { publicarTudoNoSupabase(); });
        wireEvento('baixarBackupNuvem', 'click', () => { baixarBackupNuvem(); });
        wireEvento('abrirBackupsNuvem', 'click', () => { abrirBackupsNuvem(); });
        wireEvento('restaurarBackupNuvem', 'change', (e) => { restaurarBackupNuvem(e); });
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
        wireEvento('inputTemposPorOperacao', 'change', () => { processarTemposPorOperacao(); });
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
        wireEvento('inputMediaCorteManual', 'change', (e) => {
            if (!exigirAdmin('definir a média de corte')) { e.target.value = obterMediaCorteManual() || ''; return; }
            const v = parseFloat(e.target.value);
            if (v > 0) localStorage.setItem('mediaCorteManual', v);
            else localStorage.removeItem('mediaCorteManual');
            renderizarFilaCorte();
            renderizarTudoImediato();
        });
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
        wireEvento('toggleMultiSelectLocalProd', 'click', (event) => { abrirFecharMultiSelect('toggleMultiSelectLocalProd', 'listaFiltroLocalProd', event); });
        wireEvento('listaFiltroLocalProd', 'click', (event) => { event.stopPropagation(); });
        wireEvento('toggleMultiSelectTipoProd', 'click', (event) => { abrirFecharMultiSelect('toggleMultiSelectTipoProd', 'listaFiltroTipoProd', event); });
        wireEvento('listaFiltroTipoProd', 'click', (event) => { event.stopPropagation(); });
        wireEvento('marcarTodosLocalProd', 'click', () => { locaisProducaoExcluidos = []; salvarFiltrosFilaCorte(); renderizarFilaCorte(); });
        wireEvento('marcarTodosTipoProd', 'click', () => { tiposProdutoExcluidos = []; salvarFiltrosFilaCorte(); renderizarFilaCorte(); });
        wireEvento('abrirAba-aba-necessidade', 'click', (event) => { abrirAba(event, 'aba-necessidade'); renderizarNecessidadePorReferencia(); });
        wireEvento('abrirAba-aba-prioridades', 'click', (event) => { abrirAba(event, 'aba-prioridades'); reconstruirFiltrosPrioridades(); renderizarAbaPrioridades(); });
        wireEvento('abrirAba-aba-kpi', 'click', (event) => { abrirAba(event, 'aba-kpi'); renderizarGraficoKPI(); carregarEfCosturaDaNuvem(); });
        wireEvento('abrirAba-aba-seq-costura', 'click', (event) => { abrirAba(event, 'aba-seq-costura'); renderizarSequenciamentoCostura(); renderizarOpsRemovidasSeqCostura(); renderizarOpsOcultasSeqCostura(); carregarOpsRemovidasSeqCosturaDaNuvem(); carregarOrdemManualEnfestoDaNuvem(); });
        wireEvento('abrirAba-aba-plano-costura', 'click', (event) => { abrirAba(event, 'aba-plano-costura'); renderizarPlanoCostura(); carregarPlanosCosturaDaNuvem(); carregarEfCosturaDaNuvem(); });
        wireEvento('planoCosturaData', 'change', () => { renderizarPlanoCostura(); });
        // limpeza única dos dados da antiga aba URGÊNCIAS (a aba foi esvaziada)
        try { ['implantacaoBase', 'implantacaoOPs', 'urgenciasAtualizadoEm', 'urgenciasMetaNuvem', 'urgenciasPendentePublicar'].forEach(k => localStorage.removeItem(k)); } catch (e) { /* ignora */ }
        wireEvento('abrirAba-aba-urgencias', 'click', (event) => { abrirAba(event, 'aba-urgencias'); });
        wireEvento('inputPorOPCostura', 'change', () => { processarPorOPCostura(); });
        wireEvento('seqCostGrupo', 'change', () => { renderizarSequenciamentoCostura(); });
        wireEvento('btnGerenciarFeriados', 'click', () => { renderizarModalFeriados(); $('modalFeriados').style.display = 'flex'; });
        wireEvento('checkTudoSeqCostura', 'change', (e) => { $$('.check-imprimir-seq').forEach(cb => cb.checked = e.target.checked); });
        wireEvento('btnPlanoSeqCostura', 'click', () => { adicionarMarcadasAoPlanoCostura(); });
        wireEvento('btnImprimirSeqCostura', 'click', () => { imprimirSecao('secaoImprimirSeqCostura'); });
        wireEvento('btnOrdemAutomaticaEnfesto', 'click', () => { resetarOrdemAutomaticaEnfesto(); });
        wireEvento('seqCostPessoas', 'input', () => { renderizarSequenciamentoCostura(); });
        wireEvento('seqCostHoras', 'input', () => { renderizarSequenciamentoCostura(); });
        wireEvento('seqCostEficiencia', 'input', () => { renderizarSequenciamentoCostura(); });
        wireEvento('seletorSetorKPI', 'change', () => { renderizarGraficoKPI(); });
        wireEvento('seletorMesKPI', 'change', () => { renderizarGraficoKPI(); });
        wireEvento('seletorParAcertividadeKPI', 'change', () => { renderizarGraficoAcertividadeKPI(); });
        wireEvento('inputMovimentacaoKPI', 'change', () => { processarMovimentacaoSetor(); });
        wireEvento('inputExternoAlmoxKPI', 'change', () => { processarExternoAlmox(); });
        wireEvento('inputEfCostura', 'change', () => { processarEficienciaCostura(); });
        wireEvento('seletorMesEfCostura', 'change', () => { renderizarEficienciaCostura(); });
        wireEvento('btnBaixarMesEfCostura', 'click', () => { baixarMesEfCosturaExcel(); });
        wireEvento('btnLimparMesEfCostura', 'click', () => { limparMesEfCostura(); });
        wireEvento('efCosturaMinPessoa', 'input', () => { renderizarEficienciaCostura(); });
        popularSeletorMesEfCostura(); renderizarEficienciaCostura();
        wireEvento('btnLimparMovimentacoesKPI', 'click', () => { limparMovimentacoesKPI(); });
        wireEvento('btnBaixarMesKPI', 'click', () => { baixarMesKPIExcel(); });
        wireEvento('btnSubabaProgramarLote', 'click', () => { abrirSubabaProgramacao('lote'); });
        wireEvento('btnSubabaMaquinas', 'click', () => { abrirSubabaProgramacao('maquinas'); });
        wireEvento('btnMaquina1', 'click', () => { selecionarMaquinaEnfesto('1'); });
        wireEvento('btnMaquina2', 'click', () => { selecionarMaquinaEnfesto('2'); });
        wireEvento('btnMaquinaSem', 'click', () => { selecionarMaquinaEnfesto('SEM'); });
        wireEvento('btnDefinirMaquinas', 'click', () => { renderizarModalMaquinasEnfesto(); $('modalMaquinasEnfesto').style.display = 'flex'; });
        wireEvento('btnExportarMaquinaEnfesto', 'click', () => { exportarMaquinaEnfestoExcel(); });
        wireEvento('btnLimparSelecaoMaquina', 'click', () => { selecaoMaquinaEnfesto.clear(); ultimoIndiceMaquinaEnfesto = null; renderizarMaquinasEnfesto(); });
        wireEvento('checkTudoMaquinaEnfesto', 'change', (e) => {
            opsDaMaquinaAtualEnfesto().forEach(o => { if (e.target.checked) selecaoMaquinaEnfesto.add(o.id); else selecaoMaquinaEnfesto.delete(o.id); });
            renderizarMaquinasEnfesto();
        });
        wireEvento('listaMaquinaEnfesto', 'click', (e) => {
            if (!e.target.classList || !e.target.classList.contains('check-maquina-enfesto')) return;
            const caixas = [...document.querySelectorAll('#listaMaquinaEnfesto .check-maquina-enfesto')];
            const i = caixas.indexOf(e.target);
            // Shift + clique marca (ou desmarca) o intervalo inteiro desde a última caixinha clicada
            const faixa = (e.shiftKey && ultimoIndiceMaquinaEnfesto !== null && ultimoIndiceMaquinaEnfesto < caixas.length) ? [Math.min(i, ultimoIndiceMaquinaEnfesto), Math.max(i, ultimoIndiceMaquinaEnfesto)] : [i, i];
            for (let k = faixa[0]; k <= faixa[1]; k++) { caixas[k].checked = e.target.checked; if (e.target.checked) selecaoMaquinaEnfesto.add(caixas[k].dataset.id); else selecaoMaquinaEnfesto.delete(caixas[k].dataset.id); }
            ultimoIndiceMaquinaEnfesto = i;
            atualizarSelecaoMaquinaEnfesto();
        });
        wireEvento('modalMaquinasEnfesto', 'change', (e) => {
            const sel = e.target.closest('select[data-chave]'); if (!sel) return;
            definirMaquinaProdutoEnfesto(sel.dataset.chave, sel.value);
            sel.closest('tr').style.background = sel.value === 'SEM' ? 'rgba(224,123,57,0.12)' : '';
        });
        wireEvento('modalMaquinasEnfesto', 'click', (e) => {
            if (e.target.closest('#btnRestaurarMaquinasPadrao')) { salvarMapaMaquinasEnfesto({}); renderizarModalMaquinasEnfesto(); renderizarMaquinasEnfesto(); }
        });
        ['id', 'numeroPrioridade', 'desc', 'etapa', 'qtd', 'diasLocal', 'mesDestino'].forEach(campo => {
            wireEvento(`thOrdenarPrioridades-${campo}`, 'click', () => { ordenarPrioridadesPor(campo); });
        });
        wireEvento('btnAtualizarNecessidade', 'click', () => { renderizarNecessidadePorReferencia(); });
        wireEvento('btnModoNecessidade', 'click', () => { alternarModoLevantamentoNecessidade(); });
        wireEvento('buscaNecessidade', 'input', () => { renderizarNecessidadePorReferencia(); });
        wireEvento('toggleMultiSelectEtapa', 'click', (event) => { toggleMultiSelectEtapa(event); });
        wireEvento('toggleMultiSelectDataCorte', 'click', (event) => { abrirFecharMultiSelect('toggleMultiSelectDataCorte', 'listaFiltroDataCorte', event); });
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
        wireEvento('toggleMultiSelectMesDestino', 'click', (event) => { abrirFecharMultiSelect('toggleMultiSelectMesDestino', 'listaFiltroMesDestino', event); });
        wireEvento('listaFiltroMesDestino', 'click', (event) => { event.stopPropagation(); });
        wireEvento('listaFiltroMesDestino', 'change', (e) => {
            if (e.target.id === 'chkTodosMesesDestino') {
                if (e.target.checked) mesesDestinoExcluidos.clear();
                else $$('.chk-mes-destino').forEach(c => mesesDestinoExcluidos.add(c.value));
            } else if (e.target.classList.contains('chk-mes-destino')) {
                if (e.target.checked) mesesDestinoExcluidos.delete(e.target.value);
                else mesesDestinoExcluidos.add(e.target.value);
            } else return;
            renderizarFiltroMesDestino();
            renderizarTudoImediato();
        });
        wireEvento('toggleMultiSelectProduto', 'click', (event) => { abrirFecharMultiSelect('toggleMultiSelectProduto', 'listaFiltroProduto', event); });
        wireEvento('listaFiltroProduto', 'click', (event) => { event.stopPropagation(); });
        wireEvento('listaFiltroProduto', 'change', (e) => {
            if (e.target.id === 'chkTodosProdutos') {
                if (e.target.checked) produtosExcluidos.clear();
                else $$('.chk-produto').forEach(c => produtosExcluidos.add(c.value));
            } else if (e.target.classList.contains('chk-produto')) {
                if (e.target.checked) produtosExcluidos.delete(e.target.value);
                else produtosExcluidos.add(e.target.value);
            } else return;
            renderizarFiltroProduto();
            renderizarTudoImediato();
        });
        wireEvento('toggleMultiSelectSetorPrioridades', 'click', (event) => { abrirFecharMultiSelect('toggleMultiSelectSetorPrioridades', 'listaFiltroSetorPrioridades', event); });
        wireEvento('listaFiltroSetorPrioridades', 'click', (event) => { event.stopPropagation(); });
        wireEvento('listaFiltroSetorPrioridades', 'change', (e) => {
            if (e.target.id === 'chkTodosSetoresPrioridades') {
                if (e.target.checked) setoresPrioridadesExcluidos.clear();
                else $$('.chk-setor-prioridades').forEach(c => setoresPrioridadesExcluidos.add(c.value));
            } else if (e.target.classList.contains('chk-setor-prioridades')) {
                if (e.target.checked) setoresPrioridadesExcluidos.delete(e.target.value);
                else setoresPrioridadesExcluidos.add(e.target.value);
            } else return;
            renderizarFiltroSetorPrioridades();
            renderizarAbaPrioridades();
        });
        wireEvento('toggleMultiSelectMesPrioridades', 'click', (event) => { abrirFecharMultiSelect('toggleMultiSelectMesPrioridades', 'listaFiltroMesPrioridades', event); });
        wireEvento('listaFiltroMesPrioridades', 'click', (event) => { event.stopPropagation(); });
        wireEvento('listaFiltroMesPrioridades', 'change', (e) => {
            if (e.target.id === 'chkTodosMesesPrioridades') {
                if (e.target.checked) mesesPrioridadesExcluidos.clear();
                else $$('.chk-mes-prioridades').forEach(c => mesesPrioridadesExcluidos.add(c.value));
            } else if (e.target.classList.contains('chk-mes-prioridades')) {
                if (e.target.checked) mesesPrioridadesExcluidos.delete(e.target.value);
                else mesesPrioridadesExcluidos.add(e.target.value);
            } else return;
            renderizarFiltroMesPrioridades();
            renderizarAbaPrioridades();
        });
        wireEvento('listaFiltroEtapa', 'click', (event) => { event.stopPropagation(); });
        wireEvento('toggleMultiSelect', 'click', (event) => { toggleMultiSelect(event); });
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
}

window.onload = function () {
    // 0. Liga todos os botões/campos aos seus handlers (antes feito via onclick/onchange inline no HTML)
    inicializarEventosUI();

    if (localStorage.getItem('temaEscuro') === 'true') document.body.classList.add('dark-mode');
    try { if (localStorage.getItem('tabelasDensas') === '1') document.body.classList.add('tabelas-densas'); } catch (e) {}
    iniciarColunasFixas();

    // Restringe as abas já de cara (trata como visitante até confirmar login,
    // que é assíncrono) — evita mostrar todas as abas por um instante antes
    // de esconder de novo.
    aplicarRestricaoDeAbaVisitante();

    migrarPrioridadesParaChaveComposta();   // 1ª vez depois da mudança: converte prioridade/mês/estrela salvos só por número pro formato ciclo-OP

    // 1. Inicia o sistema normalmente
    inicializarFiltroEtapa();
    inicializarFiltros();
    renderizarHistorico();
    renderizarFiltroDataCorte();
    renderizarFiltroMesDestino();
    renderizarFiltroProduto();
    reconstruirFiltrosPrioridades();

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
        carregarTudoDaNuvemParaVisitante();
        // Visitante atualiza sozinho a cada 3 minutos — sem precisar recarregar
        // a página na mão pra ver publicação nova. Admin não precisa disso (usa
        // o dado local, ao vivo).
        setInterval(() => { if (papelUsuarioAtual !== 'admin') carregarTudoDaNuvemParaVisitante(); }, 3 * 60 * 1000);
        // Remoções do Seq. Costura são diferentes — precisam ficar iguais em
        // QUALQUER computador, admin incluído, já que o objetivo é o admin
        // conseguir ver o que outra pessoa removeu de outro lugar.
        carregarOpsRemovidasSeqCosturaDaNuvem();
        setInterval(carregarOpsRemovidasSeqCosturaDaNuvem, 3 * 60 * 1000);
        // Mesma lógica pra ordem manual do Enfesto — todo mundo carrega.
        carregarOrdemManualEnfestoDaNuvem();
        setInterval(carregarOrdemManualEnfestoDaNuvem, 3 * 60 * 1000);
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
            // Além do backup local de sempre, baixa também o da nuvem — só
            // dá pra fazer isso se a pessoa estiver logada como admin nesse
            // momento (senão não tem como ler os dados publicados)
            if (sessaoAdminAtual) baixarBackupNuvem();
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
// Download automático de sexta DESLIGADO: agora o backup é feito sozinho na nuvem (backup-nuvem.js). Os botões BAIXAR BACKUP / BAIXAR BACKUP DA NUVEM continuam no menu Sistema, pra baixar na mão quando quiser.
// setTimeout(verificarBackupSexta, 3000);
// =========================================================

// ==========================================
// 💾 BOTÃO FÍSICO PARA SALVAR MÊS ATIVO
// ==========================================
// As funções que desenham gráficos são as que mais estouram quando a
// biblioteca não carrega — envolvendo elas aqui, um erro delas aparece com a
// mensagem real no console de depuração em vez do genérico "Script error.",
// e o resto da tela continua funcionando.
['atualizarGrafico', 'atualizarGraficoOTD', 'mostrarTooltipOP'].forEach(nome => {
    const original = window[nome];
    if (typeof original === 'function') {
        window[nome] = function (...args) { return executarSeguro(nome, () => original.apply(this, args)); };
    }
});
