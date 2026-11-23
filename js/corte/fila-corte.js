// =========================================================================
// ✂️ FILA DE CORTE — planilha geral "POR_OP" (todos os setores). Agrupa
// peças/OPs por local, restrito aos 11 setores que compõem o pipeline até o
// Corte, e calcula quantos dias de fila cada um representa, usando a média
// diária real do setor CORTE (já lançada na aba Gestão Mensal).
// =========================================================================

function processarFilaCorte() {
    if (!exigirAdmin('importar a fila de corte')) return;
    if (!exigirBibliotecaExcel()) return;
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
// Enquanto a aba de KPI não é refeita (removida e ainda não reconstruída),
// não tem como calcular a média automática — o usuário pode digitar um
// valor manual na Fila de Corte, que tem prioridade sobre o cálculo
// automático (que volta a valer sozinho quando a KPI existir de novo).
function obterMediaCorteManual() {
    const v = parseFloat(localStorage.getItem('mediaCorteManual'));
    return isNaN(v) || v <= 0 ? null : v;
}

function calcularMediaDiariaCorte() {
    const manual = obterMediaCorteManual();
    if (manual !== null) return manual;
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
        corpo.innerHTML = `<tr><td colspan="5" class="tabela-vazia"><i class="fas fa-file-import tabela-vazia-icone"></i>Importe a planilha geral de novo pra ver as OPs por trás dos números.</td></tr>`;
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
        corpo.innerHTML = `<tr><td colspan="5" class="tabela-vazia"><i class="fas fa-inbox tabela-vazia-icone"></i>Nenhuma OP com os filtros atuais.</td></tr>`;
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

