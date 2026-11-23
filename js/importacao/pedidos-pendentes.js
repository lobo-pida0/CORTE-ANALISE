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
