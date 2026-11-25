// =========================================================================
// 📏 GRADE DAS OPs — planilha com as mesmas OPs da Sincronização,
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
