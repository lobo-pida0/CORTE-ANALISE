// =========================================================================
// ✂️ FILA DE CORTE — planilha geral "POR_OP" (todos os setores). Agrupa
// peças/OPs por local, restrito aos 11 setores que compõem o pipeline até o
// Corte, e calcula quantos dias de fila cada um representa, usando a média
// diária real do setor CORTE (já lançada na aba Gestão Mensal).
// =========================================================================
// Aba URGÊNCIAS — pega a lista de OPs da aba "Implantação" de uma planilha
// própria do usuário, e cruza com a POR_OP (mesmo arquivo usado em outras
// abas do sistema) pra manter local/quantidade atualizados. Guardado em
// DOIS lugares: a base (do jeito que veio da Implantação, sem cruzar) e o
// resultado exibido (depois do cruzamento) — assim, importar a POR_OP de
// novo sempre recalcula A PARTIR da base, em vez de ir empilhando
// desdobramento em cima de desdobramento se importar várias vezes seguidas.
function obterImplantacaoBase() {
    try { return JSON.parse(localStorage.getItem('implantacaoBase') || '[]'); } catch (e) { return []; }
}
function salvarImplantacaoBase(lista) { localStorage.setItem('implantacaoBase', JSON.stringify(lista)); }
function obterImplantacaoOPs() {
    try { return JSON.parse(localStorage.getItem('implantacaoOPs') || '[]'); } catch (e) { return []; }
}
function salvarImplantacaoOPs(lista) { localStorage.setItem('implantacaoOPs', JSON.stringify(lista)); }

function processarImplantacao() {
    if (!exigirAdminOuUsuario('importar a planilha de Implantação')) return;
    if (!exigirBibliotecaExcel()) return;
    const input = $('inputImplantacao'); if (!input.files[0]) return;
    const r = new FileReader();
    r.onload = function (e) {
        try {
            const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
            // O arquivo do usuário tem VÁRIAS abas — procura uma chamada
            // "Implantação" (tolerante a acento/maiúscula) em vez de supor
            // que é sempre a primeira aba do arquivo.
            const nomeAba = wb.SheetNames.find(n => n.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().includes('IMPLANTA')) || wb.SheetNames[0];
            // Limita o intervalo lido (até a coluna Q, 20 mil linhas) — sem
            // isso, uma planilha que reporte um "intervalo usado" muito
            // maior que o dado real (comum em arquivo Excel com formatação
            // espalhada por engano) pode travar a importação tentando
            // processar células vazias por minutos.
            const rows = XLSX.utils.sheet_to_json(wb.Sheets[nomeAba], { header: 1, range: 'A1:Q20000' });
            if (!rows.length) throw new Error("Planilha vazia.");

            const cab = rows[0].map(c => String(c || '').trim().toUpperCase());
            const idx = {
                chave: cab.findIndex(c => c === 'CHAVE'),
                pedido: cab.findIndex(c => c === 'PEDIDO'),
                grade: cab.findIndex(c => c === 'GRADE'),
                local: cab.findIndex(c => c.includes('DESCRI') && c.includes('LOCAL')),
                referencia: cab.findIndex(c => c.includes('REFER') && !c.includes('DESCRI')),
                descRef: cab.findIndex(c => c.includes('DESCRI') && c.includes('REFER')),
                cor: cab.findIndex(c => c === 'COR'),
                ciclo: cab.findIndex(c => c === 'CICLO'),
                op: cab.findIndex(c => c === 'OP'),
                qtd: cab.findIndex(c => c.includes('QT') && c.includes('LOCAL')),
                tipoProduto: cab.findIndex(c => c.includes('TIPO') && c.includes('PRODUTO')),
                dataFinalizacao: cab.findIndex(c => c.includes('FINALIZ')),
                reprogramado: cab.findIndex(c => c.includes('REPROGRAM')),
            };
            if (idx.op === -1) throw new Error("Não encontrei a coluna OP no cabeçalho.");

            const lista = [];
            for (let i = 1; i < rows.length; i++) {
                const row = rows[i]; if (!row) continue;
                const opVal = row[idx.op] !== undefined && row[idx.op] !== null ? String(row[idx.op]).trim() : '';
                if (!opVal) continue;
                const pega = (chave) => idx[chave] !== -1 && row[idx[chave]] !== undefined && row[idx[chave]] !== null ? String(row[idx[chave]]).trim() : '';
                lista.push({
                    chave: pega('chave'), pedido: pega('pedido'), grade: pega('grade'), local: pega('local'),
                    referencia: pega('referencia'), descRef: pega('descRef'), cor: pega('cor'), ciclo: pega('ciclo'),
                    op: opVal, qtd: idx.qtd !== -1 ? (parseFloat(row[idx.qtd]) || 0) : 0, tipoProduto: pega('tipoProduto'),
                    dataFinalizacao: idx.dataFinalizacao !== -1 ? extrairDataExcel(row[idx.dataFinalizacao]) : null,
                    reprogramado: pega('reprogramado'),
                });
            }

            salvarImplantacaoBase(lista);
            salvarImplantacaoOPs(lista); // sem cruzar com POR_OP ainda — fica igual à base até importar ela
            reconciliarFiltroLocalUrgencias();
            renderizarUrgencias();
            showToast(`<i class="fas fa-check"></i> ${lista.length} OPs importadas da aba Implantação.`);
            marcarUrgenciasPendentesEPublicar();   // sobe pra nuvem (sem await: a importação já terminou)
        } catch (err) {
            alert("Erro ao importar a planilha de Implantação: " + err.message);
        }
        input.value = '';
    };
    r.readAsArrayBuffer(input.files[0]);
}

// Compara a lista de Urgências ANTES e DEPOIS de importar a POR_OP (igual
// o balanço da sincronização faz com as etapas), pra mostrar o que andou.
// Casa por ciclo+OP. Devolve 4 grupos:
//  - movimentadas: mudou o(s) local(is) da OP
//  - qtdAlterada: continua no(s) mesmo(s) local(is), mas a quantidade mudou
//  - sairam: estava na POR_OP e agora não está mais (provavelmente seguiu adiante)
//  - voltaram: não estava na POR_OP e agora aparece
function compararUrgenciasAntesDepois(antes, depois) {
    const agrupar = lista => {
        const mapa = new Map();
        lista.forEach(o => {
            const k = `${o.ciclo}-${o.op}`;
            if (!mapa.has(k)) mapa.set(k, { op: o.op, ciclo: o.ciclo, naoEncontrado: !!o.naoEncontradoPorOP, entradas: [] });
            mapa.get(k).entradas.push({ local: o.local || '—', qtd: o.qtd || 0 });
        });
        mapa.forEach(v => v.entradas.sort((a, b) => a.local.localeCompare(b.local)));
        return mapa;
    };
    const A = agrupar(antes), B = agrupar(depois);
    const rotuloLocais = v => v.entradas.map(e => e.local).join(' + ');
    const rotuloQtds = v => v.entradas.map(e => e.qtd.toLocaleString('pt-BR')).join(' + ');
    const resultado = { movimentadas: [], qtdAlterada: [], sairam: [], voltaram: [] };

    B.forEach((novo, k) => {
        const velho = A.get(k);
        if (!velho) return;
        if (!velho.naoEncontrado && novo.naoEncontrado) {
            resultado.sairam.push({ op: novo.op, ciclo: novo.ciclo, de: rotuloLocais(velho) });
        } else if (velho.naoEncontrado && !novo.naoEncontrado) {
            resultado.voltaram.push({ op: novo.op, ciclo: novo.ciclo, para: rotuloLocais(novo) });
        } else if (!velho.naoEncontrado && !novo.naoEncontrado) {
            const de = rotuloLocais(velho), para = rotuloLocais(novo);
            if (de !== para) {
                resultado.movimentadas.push({ op: novo.op, ciclo: novo.ciclo, de, para });
            } else if (rotuloQtds(velho) !== rotuloQtds(novo)) {
                resultado.qtdAlterada.push({ op: novo.op, ciclo: novo.ciclo, local: para, de: rotuloQtds(velho), para: rotuloQtds(novo) });
            }
        }
    });
    return resultado;
}

function exibirBalancoUrgencias(bal) {
    const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const chip = (texto, extra = '') => `<span class="pill" style="background:var(--bg-card); border:1px solid var(--borda-cor); color:var(--texto-cor); margin:2px 3px 0 0; display:inline-block; ${extra}">${esc(texto)}</span>`;
    const rotuloOP = o => `${o.op}${o.ciclo ? ' · ' + o.ciclo : ''}`;
    const total = bal.movimentadas.length + bal.qtdAlterada.length + bal.sairam.length + bal.voltaram.length;

    const cabecalho = (icone, cor) => `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; border-bottom:2px solid var(--borda-cor); padding-bottom:10px; flex-shrink:0;">
            <h2 style="margin:0; color:var(--texto-cor); display:flex; align-items:center; gap:10px; font-size:16px;"><i class="fas ${icone}" style="color:${cor};"></i> BALANÇO DA POR_OP</h2>
            <button onclick="fecharModais()" class="modal-fechar-btn"><i class="fas fa-times"></i></button>
        </div>`;

    if (!total) {
        $('modalBalancoUrgencias').innerHTML = `
            <div class="modal-card" style="width:480px; max-width:90vw; border-top:5px solid var(--cor-despacho);">
                ${cabecalho('fa-check-circle', 'var(--cor-despacho)')}
                <div style="text-align:center; padding:20px; color:var(--texto-secundario);">Nenhuma movimentação desde a última importação da POR_OP — tudo igual.</div>
            </div>`;
        $('modalBalancoUrgencias').style.display = 'flex';
        return;
    }

    // Movimentadas: junta por par "de → para", com os números das OPs dentro
    const pares = new Map();
    bal.movimentadas.forEach(m => {
        const k = `${m.de}>>${m.para}`;
        if (!pares.has(k)) pares.set(k, { de: m.de, para: m.para, ops: [] });
        pares.get(k).ops.push(m);
    });
    const movimentadasHtml = [...pares.values()].sort((a, b) => b.ops.length - a.ops.length).map(g => `
        <div style="border-left:4px solid var(--cor-sugestao); background:var(--bg-painel); border-radius:8px; padding:12px; margin-bottom:10px;">
            <div style="font-size:12px; font-weight:700; margin-bottom:6px; display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                <span class="pill" style="background:var(--cor-historico);">${esc(g.de)}</span>
                <i class="fas fa-arrow-right" style="color:var(--texto-secundario);"></i>
                <span class="pill" style="background:var(--cor-sugestao);">${esc(g.para)}</span>
                <span style="color:var(--texto-secundario); font-weight:400;">(${g.ops.length} OP${g.ops.length > 1 ? 's' : ''})</span>
            </div>
            <div>${g.ops.map(o => chip(rotuloOP(o))).join('')}</div>
        </div>`).join('');

    const qtdHtml = !bal.qtdAlterada.length ? '' : `
        <div style="margin-top:14px;">
            <div style="font-size:12px; font-weight:700; color:var(--cor-sugestao); margin-bottom:6px;"><i class="fas fa-scale-balanced"></i> QUANTIDADE ALTERADA (${bal.qtdAlterada.length}) <span style="font-weight:400; color:var(--texto-secundario);">— mesmo local, quantidade diferente</span></div>
            <div>${bal.qtdAlterada.map(o => chip(`${rotuloOP(o)} · ${o.de} → ${o.para} pçs`)).join('')}</div>
        </div>`;

    const voltaramHtml = !bal.voltaram.length ? '' : `
        <div style="margin-top:14px;">
            <div style="font-size:12px; font-weight:700; color:var(--cor-despacho); margin-bottom:6px;"><i class="fas fa-plus-circle"></i> PASSARAM A APARECER NA POR_OP (${bal.voltaram.length})</div>
            <div>${bal.voltaram.map(o => `<span class="pill pill-ok" style="margin:2px 3px 0 0; display:inline-block;">${esc(rotuloOP(o))} · agora em ${esc(o.para)}</span>`).join('')}</div>
        </div>`;

    const sairamHtml = !bal.sairam.length ? '' : `
        <div style="margin-top:14px;">
            <div style="font-size:12px; font-weight:700; color:var(--texto-secundario); margin-bottom:6px;"><i class="fas fa-sign-out-alt"></i> SAÍRAM DA POR_OP (${bal.sairam.length}) <span style="font-weight:400;">— deixaram de aparecer; o local mostrado volta a ser o da Implantação</span></div>
            <div>${bal.sairam.map(o => `<span class="pill" style="background:var(--cor-historico); margin:2px 3px 0 0; display:inline-block;">${esc(rotuloOP(o))} · estava em ${esc(o.de)}</span>`).join('')}</div>
        </div>`;

    $('modalBalancoUrgencias').innerHTML = `
        <div class="modal-card" style="width:680px; max-width:92vw; border-top:5px solid var(--cor-sugestao); max-height:85vh;">
            ${cabecalho('fa-right-left', 'var(--cor-sugestao)')}
            <div style="overflow-y:auto; flex:1;">
                ${movimentadasHtml || '<div style="text-align:center; padding:10px; color:var(--texto-secundario); font-size:12px;">Nenhuma OP trocou de local.</div>'}
                ${qtdHtml}${voltaramHtml}${sairamHtml}
            </div>
        </div>`;
    $('modalBalancoUrgencias').style.display = 'flex';
}

// Cruza a base da Implantação com a POR_OP, atualizando local/quantidade.
// Uma OP pode aparecer em MAIS de um local na POR_OP (movimentação
// parcial — parte das peças já saiu, parte ainda não) — confirmado com o
// usuário: nesse caso, desdobra em uma linha por local, cada uma com sua
// quantidade, SEM pedir decisão nenhuma (não é ambiguidade, é a realidade
// física da OP estar dividida mesmo).
function processarPorOPParaUrgencias() {
    if (!exigirAdminOuUsuario('importar a POR_OP pra Urgências')) return;
    if (!exigirBibliotecaExcel()) return;
    const input = $('inputPorOPUrgencias'); if (!input.files[0]) return;
    const r = new FileReader();
    r.onload = function (e) {
        try {
            const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
            // Mesma proteção da importação da Implantação — evita travar se
            // o "intervalo usado" reportado pela planilha for muito maior
            // que o dado real.
            const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, range: 'A1:T50000' });
            if (!rows.length) throw new Error("Planilha vazia.");

            const cab = rows[0].map(c => String(c || '').trim().toUpperCase());
            const idxOP = cab.findIndex(c => c === 'OP');
            const idxCiclo = cab.findIndex(c => c === 'CICLO');
            const idxDescLocal = cab.findIndex(c => c.includes('DESCRI') && c.includes('LOCAL'));
            const idxQtd = cab.findIndex(c => c.includes('QT') && c.includes('LOCAL'));
            const faltando = [];
            if (idxOP === -1) faltando.push('OP');
            if (idxCiclo === -1) faltando.push('Ciclo');
            if (idxDescLocal === -1) faltando.push('Descrição Local');
            if (idxQtd === -1) faltando.push('Qt OP Local');
            if (faltando.length) throw new Error("Não encontrei as colunas: " + faltando.join(', ') + ".");

            // O MESMO número de OP pode existir em ciclos diferentes (ex: 111
            // e 211) — são OPs distintas. Cruzar só pelo número misturava as
            // duas (mesma coisa que a coluna "chave" da Implantação resolve
            // concatenando ciclo e OP). Normaliza tirando espaço e o ".0"
            // que número vindo do Excel às vezes carrega.
            const normalizar = v => (v === undefined || v === null) ? '' : String(v).trim().replace(/\.0+$/, '');
            const chaveCicloOP = (ciclo, op) => `${normalizar(ciclo)}-${normalizar(op)}`;

            // Agrupa por ciclo+OP — pode ter mais de uma linha (local
            // diferente) pra mesma OP, exatamente o caso de movimentação parcial.
            const porOP = new Map();
            for (let i = 1; i < rows.length; i++) {
                const row = rows[i]; if (!row) continue;
                const opVal = normalizar(row[idxOP]);
                if (!opVal) continue;
                const chave = chaveCicloOP(row[idxCiclo], opVal);
                const local = String(row[idxDescLocal] ?? '').trim();
                const qtd = parseFloat(row[idxQtd]) || 0;
                if (!porOP.has(chave)) porOP.set(chave, []);
                porOP.get(chave).push({ local, qtd });
            }

            const base = obterImplantacaoBase();
            if (!base.length) throw new Error("Importe primeiro a planilha de Implantação.");
            let qtdSemCorrespondencia = 0, qtdDesdobradas = 0;
            const resultado = [];
            base.forEach((item, idxBase) => {
                const locais = porOP.get(chaveCicloOP(item.ciclo, item.op));
                if (!locais || !locais.length) {
                    resultado.push({ ...item, naoEncontradoPorOP: true });
                    qtdSemCorrespondencia++;
                } else if (locais.length === 1) {
                    resultado.push({ ...item, local: locais[0].local, qtd: locais[0].qtd, naoEncontradoPorOP: false });
                } else {
                    // grupoDesdobra = qual linha da Implantação gerou essas linhas — é o que
                    // deixa a tela juntar as linhas da MESMA OP, mostrar o selo "EM N LOCAIS"
                    // e listar todos os locais (a mesma OP pode aparecer 2x na própria
                    // Implantação, ex: dois pedidos; cada uma vira o seu grupo).
                    locais.forEach(l => resultado.push({ ...item, local: l.local, qtd: l.qtd, naoEncontradoPorOP: false, grupoDesdobra: idxBase }));
                    qtdDesdobradas++;
                }
            });

            // Guarda a lista de ANTES pra comparar. Só dá pra comparar se já
            // teve uma importação da POR_OP antes (itens cruzados têm o campo
            // naoEncontradoPorOP; lista recém-saída da Implantação não tem) —
            // na primeira vez tudo "mudaria" do local da Implantação pro da
            // POR_OP e o balanço só seria ruído.
            const antes = obterImplantacaoOPs();
            const jaTinhaCruzamento = antes.some(o => o.naoEncontradoPorOP !== undefined);

            salvarImplantacaoOPs(resultado);
            reconciliarFiltroLocalUrgencias();
            renderizarUrgencias();
            let msg = `<i class="fas fa-check"></i> Local/quantidade atualizados pela POR_OP.`;
            if (qtdDesdobradas) msg += ` ${qtdDesdobradas} OP(s) desdobrada(s) por estar em mais de um local.`;
            if (qtdSemCorrespondencia) msg += ` ${qtdSemCorrespondencia} OP(s) não encontrada(s) na POR_OP.`;
            showToast(msg);
            if (jaTinhaCruzamento) exibirBalancoUrgencias(compararUrgenciasAntesDepois(antes, resultado));
            marcarUrgenciasPendentesEPublicar();
        } catch (err) {
            alert("Erro ao importar a POR_OP: " + err.message);
        }
        input.value = '';
    };
    r.readAsArrayBuffer(input.files[0]);
}

// Exporta a lista de Urgências em Excel, no MESMO formato (colunas e ordem) da
// aba "Implantação" da planilha original — pra poder colar de volta lá ou
// reimportar aqui. Diferença: na planilha original a "chave" é fórmula
// (=Ciclo&"-"&OP) e a "Descrição Local" é um PROCV na aba Base; aqui já saem
// PRONTAS, como valor: chave escrita e local já atualizado pela POR_OP. OP
// que está em mais de um local (movimentação parcial) sai em uma linha por
// local, cada uma com a sua quantidade (a chave se repete nessas linhas — é
// a mesma OP). Última coluna, extra, diz se a linha foi atualizada pela
// POR_OP ou não; quem colar só as 13 primeiras colunas ignora ela.
// Sempre exporta a lista INTEIRA, não só o que está filtrado na tela, na
// ordem em que veio da Implantação.
function montarExportacaoUrgencias(lista) {
    const cabecalho = ['chave', 'Pedido', 'Grade', 'Descrição Local', 'Referência', 'Descrição Referência', 'Cor', 'Ciclo', 'OP', 'Qt OP Local', 'Tipo Produto', 'DT finalização', 'Reprogramado', 'Situação POR_OP'];
    // Ciclo e OP voltam a ser número quando só têm dígitos — como na planilha original
    const comoNumero = v => { const t = String(v ?? '').trim(); return /^\d+$/.test(t) ? Number(t) : t; };
    const linhas = lista.map(o => {
        // Data como número de série do Excel (data de verdade, não texto), calculada
        // pelo dia/mês/ano LOCAIS — a Data Finalização é criada à meia-noite local na importação
        const d = o.dataFinalizacao ? new Date(o.dataFinalizacao) : null;
        const celulaData = (d && !isNaN(d.getTime()))
            ? { t: 'n', v: Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000 + 25569, z: 'dd/mm/yyyy' }
            : null;
        const emLocais = o.grupoDesdobra !== undefined ? lista.filter(x => x.grupoDesdobra === o.grupoDesdobra).length : 0;
        const situacao = o.naoEncontradoPorOP === true ? 'NÃO ENCONTRADA'
            : o.naoEncontradoPorOP === false ? `Atualizada pela POR_OP${emLocais > 1 ? ` (OP em ${emLocais} locais)` : ''}` : 'POR_OP ainda não importada';
        return [
            `${String(o.ciclo ?? '').trim()}-${String(o.op ?? '').trim()}`,
            // null (e não '') nos campos vazios: '' vira uma célula de texto vazio, que o
            // Excel conta como preenchida (ÉVAZIO/CONT.VALORES se enganam); null deixa a célula realmente vazia
            o.pedido || null, o.grade || null, o.local || null, o.referencia || null, o.descRef || null, o.cor || null,
            comoNumero(o.ciclo), comoNumero(o.op), o.qtd || 0, o.tipoProduto || null, celulaData, o.reprogramado || null, situacao,
        ];
    });
    return { cabecalho, linhas };
}

function exportarUrgenciasExcel() {
    if (!exigirBibliotecaExcel()) return;
    const lista = obterImplantacaoOPs();
    if (!lista.length) return alert('Não há nada pra exportar — importe a planilha de Implantação primeiro.');

    // Sem POR_OP importada os locais saem como vieram da Implantação (que na
    // planilha original muitas vezes é #N/A) — avisa antes de gerar.
    const jaCruzou = lista.some(o => o.naoEncontradoPorOP !== undefined);
    if (!jaCruzou && !confirm('A POR_OP ainda não foi importada, então os locais vão sair como vieram da Implantação (sem atualizar).\n\nExportar mesmo assim?')) return;

    const { cabecalho, linhas } = montarExportacaoUrgencias(lista);
    const ws = XLSX.utils.aoa_to_sheet([cabecalho, ...linhas]);
    ws['!cols'] = [12, 34, 22, 36, 12, 50, 8, 7, 8, 11, 16, 14, 26, 26].map(w => ({ wch: w }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Implantação'); // mesmo nome da aba original

    const hoje = new Date(), dois = n => String(n).padStart(2, '0');
    XLSX.writeFile(wb, `Urgencias_${hoje.getFullYear()}-${dois(hoje.getMonth() + 1)}-${dois(hoje.getDate())}.xlsx`);

    const opsDistintas = new Set(lista.map(o => `${o.ciclo}-${o.op}`)).size;
    const naoEnc = lista.filter(o => o.naoEncontradoPorOP === true).length;
    showToast(`<i class="fas fa-file-excel"></i> ${lista.length} linhas exportadas (${opsDistintas} OPs).${naoEnc ? ` ${naoEnc} sem correspondência na POR_OP — local original.` : ''}`);
}

// Pedido/Descrição Referência/Reprogramado às vezes vêm bem longos —
// sem isso, o texto quebrava em 2-3 linhas e deixava a tabela com altura
// de linha toda desigual ("serrilhada"). Trunca numa linha só, com o
// texto completo disponível passando o mouse.
function celulaTruncadaUrgencias(texto, larguraMaxPx) {
    if (!texto) return '';
    const escapado = String(texto).replace(/"/g, '&quot;');
    return `<span style="display:inline-block; vertical-align:middle; max-width:${larguraMaxPx}px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${escapado}">${texto}</span>`;
}

// ===== URGÊNCIAS NA NUVEM =====
// A lista de Urgências (base da Implantação + resultado depois da POR_OP) vale
// pra quem a importa E pra quem só olha, em computadores diferentes — então fica
// numa linha só da tabela `urgencias_estado` (SQL 25). A importação SUBSTITUI a
// lista inteira, igual já acontecia localmente.
// REGRAS PRA NÃO PERDER DADO:
//  - O carimbo de "qual versão é mais nova" vem do SERVIDOR (trigger no SQL), nunca
//    do relógio do computador — relógio errado já deu problema por aqui.
//  - Se a importação não chegou na nuvem (falha, sem login, tabela ainda não criada),
//    fica marcada como PENDENTE: ao abrir a aba o sistema tenta subir DE NOVO e, enquanto
//    estiver pendente, NUNCA troca a lista local por uma versão mais antiga da nuvem.
//  - Falha na nuvem não atrapalha o uso local da aba.
let urgenciasSincronizando = false;
let urgenciasAvisoTabelaDado = false;

function urgenciasTabelaFaltando(e) {
    const t = `${e && e.code || ''} ${e && e.message || ''}`;
    return /PGRST205|42P01|schema cache|does not exist/i.test(t);
}

function atualizarInfoNuvemUrgencias() {
    const el = $('urgenciasInfoNuvem'); if (!el) return;
    let meta = null; try { meta = JSON.parse(localStorage.getItem('urgenciasMetaNuvem') || 'null'); } catch (e) { /* ignora */ }
    if (localStorage.getItem('urgenciasPendentePublicar')) {
        el.innerHTML = '<i class="fas fa-triangle-exclamation"></i> SÓ NESTE NAVEGADOR — ainda não foi salva na nuvem';
        el.style.color = '#FFD08A'; el.title = 'A última importação não chegou na nuvem. Ao abrir esta aba o sistema tenta de novo.';
    } else if (meta && meta.em) {
        const d = new Date(meta.em);
        el.innerHTML = `<i class="fas fa-cloud"></i> Atualizada${meta.por ? ' por ' + String(meta.por).replace(/[<&]/g, '') : ''} em ${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
        el.style.color = ''; el.title = 'Salva na nuvem: quem abrir esta aba vê a mesma lista.';
    } else { el.textContent = ''; el.title = ''; }
}

function avisarFalhaNuvemUrgencias(e) {
    registrarLogDebug('error', ['Urgências na nuvem: ' + (e && e.message)]);
    if (urgenciasTabelaFaltando(e)) {
        if (!urgenciasAvisoTabelaDado) { urgenciasAvisoTabelaDado = true; showToast('<i class="fas fa-triangle-exclamation"></i> A nuvem ainda não tem a tabela das Urgências (falta rodar o SQL 25 no Supabase). A lista está salva só neste navegador.', true, 9000); }
    } else {
        showToast('<i class="fas fa-triangle-exclamation"></i> Não consegui salvar a lista na nuvem (' + ((e && e.message) || 'erro') + '). Ela continua neste navegador e eu tento de novo quando você abrir a aba.', true, 8000);
    }
}

// Chamado logo depois de uma importação: marca como pendente ANTES de tentar
// (se a aba fechar no meio, a pendência não se perde) e tenta subir.
function marcarUrgenciasPendentesEPublicar() {
    localStorage.setItem('urgenciasPendentePublicar', '1');
    atualizarInfoNuvemUrgencias();
    return publicarUrgenciasNaNuvem();
}

async function publicarUrgenciasNaNuvem() {
    if (!supabaseClient || !sessaoAdminAtual) { atualizarInfoNuvemUrgencias(); return false; }
    try {
        const por = String((sessaoAdminAtual.user && sessaoAdminAtual.user.email) || '').split('@')[0].toUpperCase();
        const { data, error } = await supabaseClient.from('urgencias_estado')
            .upsert({ id: 'atual', base: obterImplantacaoBase(), ops: obterImplantacaoOPs(), atualizado_por: por }, { onConflict: 'id' })
            .select('atualizado_em').single();
        if (error) throw error;
        localStorage.setItem('urgenciasAtualizadoEm', data.atualizado_em);
        localStorage.setItem('urgenciasMetaNuvem', JSON.stringify({ por, em: data.atualizado_em }));
        localStorage.removeItem('urgenciasPendentePublicar');
        atualizarInfoNuvemUrgencias();
        showToast('<i class="fas fa-cloud-upload-alt"></i> Lista de Urgências salva na nuvem.', false, 3000);
        return true;
    } catch (e) {
        avisarFalhaNuvemUrgencias(e);
        atualizarInfoNuvemUrgencias();
        return false;
    }
}

// Ao abrir a aba: pendente → tenta subir; nuvem mais nova (ou local vazio/sem carimbo) → baixa;
// nuvem vazia e lista local existente → sobe (1ª vez depois dessa mudança).
async function carregarUrgenciasDaNuvem() {
    if (!supabaseClient || !sessaoAdminAtual || urgenciasSincronizando) { atualizarInfoNuvemUrgencias(); return; }
    urgenciasSincronizando = true;
    try {
        if (localStorage.getItem('urgenciasPendentePublicar')) { await publicarUrgenciasNaNuvem(); return; }
        const { data: meta, error } = await supabaseClient.from('urgencias_estado').select('atualizado_em, atualizado_por').eq('id', 'atual').maybeSingle();
        if (error) { avisarFalhaNuvemUrgencias(error); return; }
        const local = obterImplantacaoOPs();
        if (!meta) { if (local.length) await marcarUrgenciasPendentesEPublicar(); return; }
        const carimbo = localStorage.getItem('urgenciasAtualizadoEm');
        const nuvemMs = new Date(meta.atualizado_em).getTime(), localMs = carimbo ? new Date(carimbo).getTime() : 0;
        if (local.length && carimbo && nuvemMs <= localMs) return;   // já está igual
        const { data: cheio, error: e2 } = await supabaseClient.from('urgencias_estado').select('base, ops, atualizado_em, atualizado_por').eq('id', 'atual').single();
        if (e2) { avisarFalhaNuvemUrgencias(e2); return; }
        if (!Array.isArray(cheio.ops) || !cheio.ops.length) { if (local.length) await marcarUrgenciasPendentesEPublicar(); return; } // nunca troca uma lista local por uma nuvem VAZIA
        salvarImplantacaoBase(cheio.base || []); salvarImplantacaoOPs(cheio.ops);
        localStorage.setItem('urgenciasAtualizadoEm', cheio.atualizado_em);
        localStorage.setItem('urgenciasMetaNuvem', JSON.stringify({ por: cheio.atualizado_por || '', em: cheio.atualizado_em }));
        reconciliarFiltroLocalUrgencias();
        renderizarUrgencias();
        showToast(`<i class="fas fa-cloud-download-alt"></i> Lista de Urgências atualizada pela nuvem (${cheio.ops.length} linhas).`, false, 3500);
    } catch (e) {
        avisarFalhaNuvemUrgencias(e);
    } finally {
        urgenciasSincronizando = false;
        atualizarInfoNuvemUrgencias();
    }
}

// Filtro de LOCAL da aba Urgências, de seleção múltipla (marcar vários de uma
// vez). Mesmo padrão do Mês Destino / Produto: guarda os EXCLUÍDOS, então um
// local que apareça numa próxima importação já entra marcado. A lista vem do
// que existe de verdade na lista (os nomes vêm direto da planilha). OP sem
// nome de local tem a opção "(sem local)" — sem ela não teria como excluí-las.
const CHAVE_SEM_LOCAL_URGENCIAS = '__SEM_LOCAL__';
let locaisUrgenciasExcluidos = new Set();

function chaveLocalUrgencias(o) { return (o.local && String(o.local).trim()) || CHAVE_SEM_LOCAL_URGENCIAS; }
function passaFiltroLocalUrgencias(o) { return !locaisUrgenciasExcluidos.has(chaveLocalUrgencias(o)); }

function renderizarFiltroLocalUrgencias(lista) {
    const el = $('listaFiltroLocalUrgencias');
    if (!el) return;
    const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const contagem = new Map();
    lista.forEach(o => { const k = chaveLocalUrgencias(o); contagem.set(k, (contagem.get(k) || 0) + 1); });

    const chaves = [...contagem.keys()].filter(k => k !== CHAVE_SEM_LOCAL_URGENCIAS).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    if (contagem.has(CHAVE_SEM_LOCAL_URGENCIAS)) chaves.push(CHAVE_SEM_LOCAL_URGENCIAS);

    if (!chaves.length) {
        el.innerHTML = '<label style="color:var(--texto-secundario); cursor:default;">Nenhuma OP importada ainda.</label>';
        if ($('textoFiltroLocalUrgencias')) $('textoFiltroLocalUrgencias').innerText = 'Todos';
        return;
    }
    const marcadas = chaves.filter(k => !locaisUrgenciasExcluidos.has(k)).length;
    el.innerHTML = `<label style="font-weight:700;"><input type="checkbox" id="chkTodosLocaisUrgencias" ${marcadas === chaves.length ? 'checked' : ''}> Selecionar tudo</label>`
        + chaves.map(k => `<label><input type="checkbox" class="chk-local-urgencias" value="${esc(k)}" ${locaisUrgenciasExcluidos.has(k) ? '' : 'checked'}> ${k === CHAVE_SEM_LOCAL_URGENCIAS ? '(sem local)' : esc(k)} <span style="color:var(--texto-secundario);">(${contagem.get(k)})</span></label>`).join('');
    if ($('textoFiltroLocalUrgencias')) {
        $('textoFiltroLocalUrgencias').innerText = marcadas === chaves.length ? 'Todos' : marcadas === 0 ? 'Nenhum' : `${marcadas} de ${chaves.length}`;
    }
}

// Depois de importar uma planilha nova: tira da seleção os locais que não
// existem mais e, se TUDO ficou desmarcado, volta a mostrar tudo — senão a
// tabela ficava vazia e a pessoa nem sabia por quê. (Só aqui, ao importar:
// durante o uso, "Nenhum" é um estado normal de quem vai marcar um por um.)
function reconciliarFiltroLocalUrgencias() {
    const existentes = new Set(obterImplantacaoOPs().map(chaveLocalUrgencias));
    locaisUrgenciasExcluidos = new Set([...locaisUrgenciasExcluidos].filter(k => existentes.has(k)));
    if (existentes.size && [...existentes].every(k => locaisUrgenciasExcluidos.has(k))) locaisUrgenciasExcluidos.clear();
}

function renderizarUrgencias() {
    if (!$('urgenciasLista')) return;
    const lista = obterImplantacaoOPs();

    renderizarFiltroLocalUrgencias(lista);

    const filtroOP = ($('filtroOPUrgencias')?.value || '').trim().toUpperCase();
    const filtroReferencia = ($('filtroReferenciaUrgencias')?.value || '').trim().toUpperCase();

    // "Situação na POR_OP": só tem sentido depois de importar a POR_OP —
    // antes disso o campo naoEncontradoPorOP nem existe (undefined), e a
    // OP não conta nem como encontrada nem como não encontrada.
    const filtroSituacao = $('filtroSituacaoUrgencias') ? $('filtroSituacaoUrgencias').value : '';

    // Contador clicável de não encontradas (sempre sobre a lista inteira,
    // não sobre o que está filtrado) — clicar nele aplica/tira o filtro.
    const totalNaoEncontradas = lista.filter(o => o.naoEncontradoPorOP === true).length;
    const wrapNaoEnc = $('wrapNaoEncontradasUrgencias'), btnNaoEnc = $('btnNaoEncontradasUrgencias');
    if (wrapNaoEnc && btnNaoEnc) {
        wrapNaoEnc.style.display = totalNaoEncontradas ? '' : 'none';
        const ativo = filtroSituacao === 'nao';
        btnNaoEnc.innerHTML = `<i class="fas fa-triangle-exclamation"></i> ${totalNaoEncontradas} NÃO ENCONTRADA${totalNaoEncontradas > 1 ? 'S' : ''}${ativo ? ' &nbsp;<i class="fas fa-xmark"></i>' : ''}`;
        btnNaoEnc.style.boxShadow = ativo ? '0 0 0 3px rgba(224,123,57,0.35)' : '';
        btnNaoEnc.title = ativo ? 'Mostrando só as não encontradas — clique pra ver todas de novo' : 'Clique pra ver só as OPs que não foram achadas na última POR_OP importada';
    }

    const filtrada = lista.filter(o =>
        passaFiltroLocalUrgencias(o) &&
        (!filtroOP || o.op.toUpperCase().includes(filtroOP)) &&
        (!filtroReferencia || (o.referencia || '').toUpperCase().includes(filtroReferencia) || (o.descRef || '').toUpperCase().includes(filtroReferencia)) &&
        (!filtroSituacao || (filtroSituacao === 'nao' ? o.naoEncontradoPorOP === true
            : filtroSituacao === 'multi' ? o.grupoDesdobra !== undefined
            : o.naoEncontradoPorOP === false))
    );

    // Mais antiga pra mais nova na Data Finalização — sem data vai pro
    // final (não tem como comparar uma data que não existe).
    filtrada.sort((a, b) => {
        if (!a.dataFinalizacao && !b.dataFinalizacao) return 0;
        if (!a.dataFinalizacao) return 1;
        if (!b.dataFinalizacao) return -1;
        return new Date(a.dataFinalizacao) - new Date(b.dataFinalizacao);
    });

    if ($('urgenciasCont')) $('urgenciasCont').textContent = `${filtrada.length} OP(s)`;

    if (!filtrada.length) {
        $('urgenciasLista').innerHTML = `<tr><td colspan="12" class="tabela-vazia">Nenhuma OP encontrada com esses filtros.</td></tr>`;
        return;
    }

    // OP que aparece em MAIS de um local na POR_OP: monta, sobre a lista INTEIRA (não a
    // filtrada), os locais de cada grupo — assim o selo e a dica mostram TODOS os locais
    // mesmo quando o filtro deixa só uma das linhas na tela.
    const grupos = new Map();
    lista.forEach(o => {
        if (o.grupoDesdobra === undefined) return;
        if (!grupos.has(o.grupoDesdobra)) grupos.set(o.grupoDesdobra, []);
        grupos.get(o.grupoDesdobra).push(o);
    });
    const idGrupo = o => (o && o.grupoDesdobra !== undefined) ? o.grupoDesdobra : null;
    const escAttr = t => String(t).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

    $('urgenciasLista').innerHTML = filtrada.map((o, i) => {
        // Linhas da mesma OP (vindas de uma divisão na POR_OP) ficam coladas — a
        // ordenação por data é estável e todas herdam a data da mesma linha da
        // Implantação — e ganham uma faixa azul na lateral, com linha no topo
        // da primeira e embaixo da última, mais o selo "EM N LOCAIS".
        const g = idGrupo(o);
        const primeiraDoGrupo = g !== null && g !== idGrupo(filtrada[i - 1]);
        const ultimaDoGrupo = g !== null && g !== idGrupo(filtrada[i + 1]);
        let estiloGrupo = '', seloGrupo = '';
        if (g !== null) {
            const membros = grupos.get(g);
            const sombras = ['inset 4px 0 0 var(--cor-sugestao)'];
            if (primeiraDoGrupo) sombras.push('inset 0 2px 0 rgba(62,124,151,0.55)');
            if (ultimaDoGrupo) sombras.push('inset 0 -2px 0 rgba(62,124,151,0.55)');
            estiloGrupo = `background:rgba(62,124,151,0.08); box-shadow:${sombras.join(', ')};`;
            const dica = `Essa OP aparece em ${membros.length} locais na POR_OP:&#10;` + membros.map(m => `• ${escAttr(m.local || '(sem nome)')} — ${(m.qtd || 0).toLocaleString('pt-BR')} pçs`).join('&#10;');
            seloGrupo = ` <span class="pill" style="background:var(--cor-sugestao); color:white; margin-left:6px; vertical-align:middle; white-space:nowrap;" title="${dica}">EM ${membros.length} LOCAIS</span>`;
        }
        // OP que não foi achada na POR_OP: etiqueta bem visível no lugar do
        // triângulo antigo, e local/quantidade (que são os ORIGINAIS da
        // Implantação, possivelmente velhos) em cinza itálico pra não
        // passar por dado atual e confiável.
        const nao = o.naoEncontradoPorOP === true;
        const estiloLinha = nao ? ' style="background:rgba(224,123,57,0.10); box-shadow:inset 4px 0 0 #E07B39;"'
            : (estiloGrupo ? ` style="${estiloGrupo}"` : '');
        const apagado = 'color:var(--texto-secundario); font-style:italic;';
        const etiqueta = `<span class="pill" style="background:#E07B39; color:white; margin-right:6px; vertical-align:middle;" title="Essa OP não foi encontrada na última POR_OP importada — o local e a quantidade abaixo são os originais da Implantação, podem estar desatualizados">NÃO ENCONTRADA</span>`;
        const localTxt = nao
            ? `${etiqueta}${o.local ? `<span style="${apagado}">${celulaTruncadaUrgencias(o.local, 130)}</span>` : ''}`
            : (o.local ? celulaTruncadaUrgencias(o.local, 160) : '—');
        const qtdTxt = (o.qtd || 0).toLocaleString('pt-BR');
        return `<tr${estiloLinha}>
            <td style="white-space:nowrap;"><strong>${o.op}</strong>${seloGrupo}</td>
            <td>${o.ciclo || '—'}</td>
            <td>${celulaTruncadaUrgencias(o.pedido, 150)}</td>
            <td>${celulaTruncadaUrgencias(o.grade, 120)}</td>
            <td${nao ? ' style="white-space:nowrap;"' : ''}>${localTxt}</td>
            <td>${o.referencia || ''}</td>
            <td>${celulaTruncadaUrgencias(o.descRef, 220)}</td>
            <td>${o.cor || ''}</td>
            <td style="text-align:right;${nao ? ' ' + apagado : ''}">${qtdTxt}</td>
            <td>${o.tipoProduto || ''}</td>
            <td>${o.dataFinalizacao ? formatarDataBR(o.dataFinalizacao) : '—'}</td>
            <td>${celulaTruncadaUrgencias(o.reprogramado, 150)}</td>
        </tr>`;
    }).join('');
}

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

