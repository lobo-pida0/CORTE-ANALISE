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
