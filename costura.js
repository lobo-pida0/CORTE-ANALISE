// =========================================================================
// 🧵 SEQUENCIAMENTO DE COSTURA — 4 grupos, lendo da planilha POR_OP
// (importada junto com a Fila de Corte, cobre a fábrica inteira, não só a
// aba Prioridades). Alguns locais são compartilhados entre grupos no
// sistema original (ex: jaqueta/gandola/parka aparecem junto com camisa em
// "PNP COST SUP CAMISA", e malha/camisa dividem a mesma fila de espera
// "PNP AGUARD DEFINICAO COST SUP") — confirmado com o usuário, separado
// por Tipo Produto (jaqueta/gandola/parka, já vem certinho na planilha) ou
// por palavra-chave na descrição da referência (malha, que não tem um
// Tipo Produto próprio e limpo).
// =========================================================================

const GRUPOS_SEQUENCIAMENTO_COSTURA = {
    CALCA: {
        rotulo: 'Calça',
        emAndamento: 'PNP COST INF CALCA', filtroEmAndamento: null, // local já é exclusivo
        aguardando: 'PNP AGUARD DEFINICAO COST INF', filtroAguardando: null, // também exclusivo
        campoTempo: 'minutosCostura',
    },
    MALHA: {
        rotulo: 'Malha',
        // "PNP COST SUP MALHA" já é exclusivo de malha — uma OP lá é malha
        // por definição, não precisa (e não deve) checar a descrição pra
        // confirmar (bug real: uma OP sem a palavra "MALHA" escrita mas já
        // fisicamente nesse local sumia da sequência por engano).
        emAndamento: 'PNP COST SUP MALHA', filtroEmAndamento: null,
        // MOLETOM entra junto de MALHA aqui — pedido do usuário (moletom é
        // tratado como malha, exceto quando é moletom de CALÇA, que nem
        // passa por essa fila compartilhada, tem local próprio dela).
        aguardando: 'PNP AGUARD DEFINICAO COST SUP', filtroAguardando: (op) => /MALHA|MOLETOM/i.test(op.descRef || ''), // aqui sim precisa, é fila compartilhada
        campoTempo: 'minutosCostura',
    },
    JAQUETA_GANDOLA_PARKA: {
        rotulo: 'Jaqueta/Gandola/Parka',
        emAndamento: 'PNP COST SUP CAMISA', filtroEmAndamento: (op) => ['JAQUETA', 'GANDOLA', 'PARKA'].includes(op.tipoProduto), // compartilhado com camisa
        aguardando: 'PNP AGUARD DEFINICAO COST SUP', filtroAguardando: (op) => ['JAQUETA', 'GANDOLA', 'PARKA'].includes(op.tipoProduto), // fila compartilhada
        campoTempo: 'minutosCostura',
    },
    CAMISA: {
        rotulo: 'Camisa',
        // OBS: só exclui MOLETOM aqui (fila de espera) — não no "em
        // andamento" logo abaixo, que usa um local exclusivo diferente do
        // da Malha; excluir moletom de lá sem dar um lugar novo pra ele na
        // Malha faria ele sumir da tela por completo, em vez de aparecer
        // no grupo certo. Só mexer nisso também se confirmar que precisa.
        emAndamento: 'PNP COST SUP CAMISA', filtroEmAndamento: (op) => !/MALHA/i.test(op.descRef || '') && !['JAQUETA', 'GANDOLA', 'PARKA'].includes(op.tipoProduto), // compartilhado com jaqueta/gandola/parka
        aguardando: 'PNP AGUARD DEFINICAO COST SUP', filtroAguardando: (op) => !/MALHA|MOLETOM/i.test(op.descRef || '') && !['JAQUETA', 'GANDOLA', 'PARKA'].includes(op.tipoProduto), // fila compartilhada — sobra tudo que não é dos outros grupos
        campoTempo: 'minutosCostura',
    },
    ACABAMENTO: {
        rotulo: 'Acabamento',
        // Setor mais simples — um local só, sem fila de espera separada
        // (confirmado com o usuário) e sem subdivisão por tipo de peça.
        emAndamento: 'PNP ACABAMENTO', filtroEmAndamento: null,
        aguardando: null, filtroAguardando: null,
        campoTempo: 'minutosAcabamento',
    },
    ENFESTO: {
        rotulo: 'Enfesto',
        // Também um local só, sem fila de espera separada. Diferente dos
        // outros grupos: não existe tempo confiável pra esse setor (o que
        // tem hoje é baseado na metragem dos esquemas, sem como levar pra
        // planilha) — confirmado com o usuário, que prefere só a fila
        // ORDENADA (por data/prioridade), sem tentar simular um
        // cronograma sem dado de verdade por trás. "minutosEnfesto" nunca
        // é preenchido na importação de propósito — isso já faz o
        // tempo/previsão aparecerem como "sem tempo"/"—" sozinhos, sem
        // precisar de nenhuma lógica especial pra esse grupo.
        emAndamento: 'PNP ENFESTO', filtroEmAndamento: null,
        aguardando: null, filtroAguardando: null,
        campoTempo: 'minutosEnfesto',
    },
    ETIQUETACAO: {
        rotulo: 'Etiquetação',
        // Igual ao Enfesto: um local só, sem fila de espera e SEM tempo
        // ("minutosEtiquetacao" nunca é preenchido — tempo/previsão
        // aparecem como "sem tempo"/"—"). Só a fila ordenada.
        emAndamento: 'PNP ETIQ PROF/AMARR SOC/SEP LOG/SEP GLA', filtroEmAndamento: null,
        aguardando: null, filtroAguardando: null,
        campoTempo: 'minutosEtiquetacao',
    },
};

function obterPorOPCosturaDetalhado() {
    try { return JSON.parse(localStorage.getItem('porOPCosturaDetalhado') || '[]'); } catch (e) { return []; }
}

// Conversão pra/da nuvem da fila do Sequenciamento da Produção. Chave da
// linha é "op|ciclo" (mesmo esquema usado em todo esse recurso).
function porOPCosturaParaLinhaSupabase(item) {
    return {
        id: chaveOPCostura(item.op, item.ciclo), op: item.op, ciclo: item.ciclo || '',
        local: item.local || '', ref: item.ref || '', desc_ref: item.descRef || '', cor: item.cor || '', tempo_peca_costura: item.tempoPecaCostura ?? null, dias_local: item.diasLocal ?? null,
        tipo_produto: item.tipoProduto || '', prioridade: item.prioridade ?? null, qtd: item.qtd || 0,
        minutos_costura: item.minutosCostura ?? null, minutos_acabamento: item.minutosAcabamento ?? null,
        minutos_enfesto: item.minutosEnfesto ?? null, data_finalizacao: item.dataFinalizacao || null,
        atualizado_em: new Date().toISOString(),
    };
}
function linhaSupabaseParaPorOPCostura(l) {
    return {
        op: l.op, ciclo: l.ciclo || '', local: l.local || '', ref: l.ref || '', descRef: l.desc_ref || '', cor: l.cor || '', tempoPecaCostura: l.tempo_peca_costura ?? null, diasLocal: l.dias_local ?? null,
        tipoProduto: l.tipo_produto || '', prioridade: l.prioridade, qtd: l.qtd || 0,
        minutosCostura: l.minutos_costura, minutosAcabamento: l.minutos_acabamento,
        minutosEnfesto: l.minutos_enfesto, dataFinalizacao: l.data_finalizacao,
    };
}

// Visitante NÃO importa nada aqui — só vê o que o admin publicou. Gate é
// SÓ pra visitante de verdade (!!sessaoAdminAtual, não papelUsuarioAtual)
// de propósito: o papel "usuario" já importa essa planilha sozinha, então
// carregar da nuvem por cima apagaria o trabalho dela — diferente de KPI
// e das remoções do Seq. Costura, que são pensados pra sincronizar com
// TODO MUNDO.
async function carregarPorOPCosturaDaNuvemParaVisitante() {
    if (!supabaseClient || sessaoAdminAtual) return;
    try {
        const data = await buscarTodasLinhasSupabase('por_op_costura_detalhado');
        localStorage.setItem('porOPCosturaDetalhado', JSON.stringify((data || []).map(linhaSupabaseParaPorOPCostura)));
        if (typeof renderizarSequenciamentoCostura === 'function') renderizarSequenciamentoCostura();
    } catch (e) {
        registrarLogDebug('error', ['Falha ao carregar o Sequenciamento da Produção da nuvem: ' + e.message]);
    }
}

// Chave usada pra identificar uma OP de forma única nas duas listas abaixo
// — "op|ciclo", não só "op", porque o mesmo número de OP já apareceu
// reaproveitado em ciclos diferentes (avental num ciclo, calçado noutro).
function chaveOPCostura(op, ciclo) { return `${op}|${ciclo || ''}`; }

// Cruza uma OP do Sequenciamento da Produção com o dado de Prioridades
// (fonte totalmente separada — vem de uma importação diferente) só pra
// puxar o Mês Destino, quando existir. Confere as 3 fontes que Prioridades
// já usa, na mesma ordem de prioridade que a tela de lá usa.
function obterMesDestinoDaOP(opId, ciclo) {
    const chave = montarChaveOP(ciclo, opId);
    const doSincronizado = acharOPNaSincronizacao(opId, ciclo);
    if (doSincronizado && doSincronizado.mesDestino) return doSincronizado.mesDestino;
    const daManual = obterOpsManuaisPrioridade().find(o => String(o.id) === String(opId) && (!normalizarParteChaveOP(ciclo) || !normalizarParteChaveOP(o.ciclo) || normalizarParteChaveOP(o.ciclo) === normalizarParteChaveOP(ciclo)));
    if (daManual && daManual.mesDestino) return daManual.mesDestino;
    const automaticas = obterOpsDestinoAutomaticas();
    const auto = automaticas[chave] || automaticas[String(opId)];   // as antigas (de antes do ciclo ser guardado) ficam só pelo número
    if (auto && auto.mesDestino) return auto.mesDestino;
    return null;
}

// Lista de exclusão permanente: uma vez removida, a OP não volta a
// aparecer nem numa importação nova (o filtro roda na hora de importar).
function obterOpsRemovidasSeqCostura() {
    try { return JSON.parse(localStorage.getItem('opsRemovidasSeqCostura') || '{}'); } catch (e) { return {}; }
}
function salvarOpsRemovidasSeqCostura(obj) {
    localStorage.setItem('opsRemovidasSeqCostura', JSON.stringify(obj));
}

// Publica UMA remoção/restauração na hora, sem esperar o botão geral de
// "PUBLICAR NA NUVEM" — é isso que faz outra pessoa, em outro computador,
// ver a mudança rapidamente. Se falhar (sem internet, etc), avisa mas não
// desfaz a ação local — ela só fica sem sincronizar até a próxima tentativa.
async function publicarRemocaoSeqCosturaNaNuvem(chave, item) {
    if (!supabaseClient) return;
    try {
        const { error } = await supabaseClient.from('ops_removidas_seq_costura').upsert({
            id: chave, op: item.op, ciclo: item.ciclo || '', desc_ref: item.descRef || '', motivo: item.motivo || '',
            removido_por: item.removidoPor || '', removido_em: item.removidoEm,
            restaurado_por: item.restauradoPor || null, restaurado_em: item.restauradoEm || null,
        }, { onConflict: 'id' });
        if (error) throw error;
        registrarLogDebug('log', [`[NUVEM] Remoção/restauração de "${item.op}" (Seq. Costura) publicada.`]);
    } catch (e) {
        registrarLogDebug('error', ['Falha ao publicar remoção do Seq. Costura na nuvem: ' + e.message]);
        showToast('<i class="fas fa-triangle-exclamation"></i> Salvou aqui, mas não consegui avisar a nuvem — outras pessoas podem não ver essa mudança ainda.', true);
    }
}

// Busca a lista inteira da nuvem — pra TODO MUNDO, admin incluído (essa
// lista precisa ser igual em qualquer computador, diferente da maioria dos
// outros dados, onde só o visitante/usuario carrega da nuvem e o admin usa
// o que está local). Também reaplica a exclusão nas OPs já visíveis na
// tela, caso alguém em outro computador tenha removido algo depois da
// última importação local — sem isso, a OP ficaria visível até a próxima
// reimportação.
async function carregarOpsRemovidasSeqCosturaDaNuvem() {
    if (!supabaseClient) return;
    try {
        const { data, error } = await supabaseClient.from('ops_removidas_seq_costura').select('*');
        if (error) throw error;
        const removidas = {};
        (data || []).forEach(l => {
            removidas[l.id] = {
                op: l.op, ciclo: l.ciclo || '', descRef: l.desc_ref || '', motivo: l.motivo || '',
                removidoPor: l.removido_por || '', removidoEm: l.removido_em,
                restauradoPor: l.restaurado_por || null, restauradoEm: l.restaurado_em || null,
            };
        });
        salvarOpsRemovidasSeqCostura(removidas);

        const todas = obterPorOPCosturaDetalhado();
        const restantes = todas.filter(o => {
            const r = removidas[chaveOPCostura(o.op, o.ciclo)];
            return !(r && !r.restauradoEm);
        });
        if (restantes.length !== todas.length) localStorage.setItem('porOPCosturaDetalhado', JSON.stringify(restantes));

        renderizarSequenciamentoCostura();
        renderizarOpsRemovidasSeqCostura();
    } catch (e) {
        registrarLogDebug('error', ['Falha ao carregar remoções do Seq. Costura da nuvem: ' + e.message]);
    }
}

// Remove uma OP da sequência agora (tira do que está na tela) E pra sempre
// (fica na lista de exclusão, então nem reimportando ela volta) — guarda
// quem removeu e quando, pro histórico.
function removerOPDaSequenciaCostura(op, ciclo) {
    if (!exigirAdminOuUsuario('remover uma OP da sequência')) return;
    const todas = obterPorOPCosturaDetalhado();
    const item = todas.find(o => o.op === op && (o.ciclo || '') === (ciclo || ''));
    if (!item) return;
    if (!confirm(`Remover a OP ${op} da sequência?\n\n"${item.descRef || ''}"\n\nEla não vai aparecer de novo, mesmo reimportando a planilha — mas fica guardada na lista de removidas, com um botão de restaurar se for engano.`)) return;
    const motivo = (prompt('Motivo da remoção (opcional — ajuda a lembrar depois por que ela saiu):', '') || '').trim();

    const chave = chaveOPCostura(op, ciclo);
    const removidas = obterOpsRemovidasSeqCostura();
    removidas[chave] = {
        op, ciclo: ciclo || '', descRef: item.descRef || '', motivo,
        removidoPor: sessaoAdminAtual && sessaoAdminAtual.user ? sessaoAdminAtual.user.email : 'desconhecido',
        removidoEm: new Date().toISOString(),
        restauradoPor: null, restauradoEm: null,
    };
    salvarOpsRemovidasSeqCostura(removidas);
    publicarRemocaoSeqCosturaNaNuvem(chave, removidas[chave]);

    const restantes = todas.filter(o => !(o.op === op && (o.ciclo || '') === (ciclo || '')));
    localStorage.setItem('porOPCosturaDetalhado', JSON.stringify(restantes));

    renderizarSequenciamentoCostura();
    renderizarOpsRemovidasSeqCostura();
    showToast(`<i class="fas fa-trash"></i> OP ${op} removida da sequência.`);
}

// Marca como restaurada (não apaga o registro) — assim o histórico
// continua mostrando que ela foi removida e depois voltou, em vez de
// simplesmente sumir a linha. Ela não volta sozinha pra tela agora (não
// tem mais o dado dela em porOPCosturaDetalhado), mas a próxima
// importação da planilha volta a trazer ela normalmente, já que a checagem
// de exclusão passa a ignorar registros restaurados.
function restaurarOPRemovidaSeqCostura(chave) {
    if (!exigirAdminOuUsuario('restaurar uma OP removida')) return;
    const removidas = obterOpsRemovidasSeqCostura();
    const item = removidas[chave];
    if (!item || item.restauradoEm) return;
    if (!confirm(`Restaurar a OP ${item.op}?\n\nEla não aparece na hora — só depois da próxima vez que a planilha for importada de novo.`)) return;
    item.restauradoPor = sessaoAdminAtual && sessaoAdminAtual.user ? sessaoAdminAtual.user.email : 'desconhecido';
    item.restauradoEm = new Date().toISOString();
    salvarOpsRemovidasSeqCostura(removidas);
    publicarRemocaoSeqCosturaNaNuvem(chave, item);
    renderizarOpsRemovidasSeqCostura();
    showToast(`<i class="fas fa-check"></i> OP ${item.op} liberada — reimporte a planilha pra ela voltar.`);
}

function renderizarOpsRemovidasSeqCostura() {
    if (!$('seqCostListaRemovidas')) return;
    const removidas = obterOpsRemovidasSeqCostura();
    const lista = Object.entries(removidas).sort((a, b) => new Date(b[1].removidoEm) - new Date(a[1].removidoEm));

    if ($('seqCostContRemovidas')) $('seqCostContRemovidas').textContent = lista.length;

    if (!lista.length) {
        $('seqCostListaRemovidas').innerHTML = `<tr><td colspan="6" style="text-align:center; padding:16px; color:var(--texto-secundario);">Nenhuma OP removida ainda.</td></tr>`;
        return;
    }

    $('seqCostListaRemovidas').innerHTML = lista.map(([chave, item]) => {
        const quandoTexto = new Date(item.removidoEm).toLocaleString('pt-BR');
        const quemTexto = item.removidoPor ? item.removidoPor.split('@')[0].toUpperCase() : '—';
        return `<tr>
            <td><strong>${item.op}</strong></td>
            <td>${item.ciclo || '—'}</td>
            <td>${item.descRef || ''}</td>
            <td>${item.motivo || '<span style="color:var(--texto-secundario);">—</span>'}</td>
            <td>${quemTexto}</td>
            <td style="white-space:nowrap;">${quandoTexto}
                <button class="btn somente-admin tambem-usuario" style="padding:2px 8px; margin-left:8px; background:var(--cor-despacho); font-size:10px;" onclick="restaurarOPRemovidaSeqCostura('${chave}')" title="Restaurar essa OP (volta a aparecer na próxima importação)"><i class="fas fa-rotate-left"></i> RESTAURAR</button>
            </td>
        </tr>`;
    }).join('');
}

// Importação PRÓPRIA da planilha POR_OP pro Seq. Costura — separada da
// importação de Fila de Corte de propósito (o usuário quis desacoplar as
// duas, mesmo lendo o mesmo tipo de arquivo). Captura toda linha com OP,
// com os campos que o sequenciamento de costura precisa.

// =========================================================================
// 🧵 BALANÇO DA COSTURA — compara a foto anterior do Seq. Costura com a nova
// POR OP. Na costura a OP sai AOS POUCOS, então a comparação é por QUANTIDADE
// (soma de "Qt Local" nos locais de costura), não por "a OP ainda está lá":
// parcial = a quantidade caiu mas sobrou saldo; total = zerou.
// =========================================================================
function nomeLocalBalancoCostura(local) {
    for (const g of Object.values(GRUPOS_SEQUENCIAMENTO_COSTURA)) {
            }
    return nomeLocalEfCostura(local);
}
function compararSeqCostura(antes, depois) {
    const agrupar = lista => {
        const m = new Map();
        lista.forEach(i => {
            const k = chaveOPCostura(i.op, i.ciclo);
            const r = m.get(k) || { op: i.op, ciclo: i.ciclo || '', ref: i.descRef || i.ref || '', codRef: i.ref || '', total: 0, locais: {} };
            r.total += (i.qtd || 0);
            r.locais[i.local] = (r.locais[i.local] || 0) + (i.qtd || 0);
            m.set(k, r);
        });
        return m;
    };
    const A = agrupar(antes), D = agrupar(depois);
    const res = { novas: [], saidaTotal: [], saidaParcial: [], chegouMais: [], mudouLocal: [] };
    A.forEach((a, k) => {
        const d = D.get(k);
        if (!d || d.total <= 0) { res.saidaTotal.push({ ...a, saiu: a.total }); return; }
        if (d.total < a.total) { res.saidaParcial.push({ ...d, antes: a.total, saiu: a.total - d.total, pct: Math.round(((a.total - d.total) / a.total) * 100) }); return; }
        if (d.total > a.total) { res.chegouMais.push({ ...d, antes: a.total, chegou: d.total - a.total }); return; }
        const mudou = new Set([...Object.keys(a.locais), ...Object.keys(d.locais)]);
        if ([...mudou].some(l => (a.locais[l] || 0) !== (d.locais[l] || 0))) res.mudouLocal.push({ ...d, de: a.locais });
    });
    D.forEach((d, k) => { if (!A.has(k) && d.total > 0) res.novas.push(d); });
    return res;
}
// opc (opcional) reaproveita o mesmo balanço em outras telas (Preparação): { titulo, icone, setor, nomeLocal, semHistorico }.
function exibirBalancoSeqCostura(antes, depois, opc = {}) {
    const r = compararSeqCostura(antes, depois);
    if (!opc.semHistorico) registrarHistoricoBalancoCostura(r);
    const setor = opc.setor || 'COSTURA', nomeLocalBal = opc.nomeLocal || nomeLocalBalancoCostura;
    const n = x => Number(x).toLocaleString('pt-BR');
    const bloco = (titulo, icone, cor, lista, linha) => lista.length === 0 ? '' : `
        <div style="border-left:4px solid ${cor}; background:var(--bg-painel); border-radius:8px; padding:12px; margin-bottom:10px;">
            <div style="font-size:12px; font-weight:700; color:${cor}; margin-bottom:8px;"><i class="fas ${icone}"></i> ${titulo} (${lista.length})</div>
            <div style="display:flex; flex-direction:column; gap:5px;">${ordenarPrioridadesPrimeiro(lista, o => [o.ciclo, o.op]).map(linha).join('')}</div>
        </div>`;
    const selo = o => seloOPBalanco(o.ciclo, o.op, `${o.op}${o.ciclo ? ' · ' + o.ciclo : ''}`, 'background:var(--bg-card); border:1px solid var(--borda-cor); color:var(--texto-cor); display:inline-block;');
    const ref = o => {
        const cod = String(o.codRef || '').trim(), desc = String(o.ref || '').trim();
        const codHtml = cod ? `<strong style="font-size:11px; background:var(--bg-card); border:1px solid var(--borda-cor); border-radius:4px; padding:1px 6px;" title="Referência">${cod}</strong>` : '';
        const descSemCod = cod ? desc.replace(cod, '').trim() : desc;
        return `${codHtml}${descSemCod ? `<span style="color:var(--texto-secundario); font-size:11px;" title="${desc.replace(/"/g, '')}"> ${descSemCod.slice(0, 45)}</span>` : ''}`;
    };
    const barra = pct => `<span style="display:inline-block; width:70px; height:7px; background:var(--borda-cor); border-radius:4px; overflow:hidden; vertical-align:middle;"><span style="display:block; width:${Math.min(100, pct)}%; height:100%; background:var(--cor-sugestao);"></span></span>`;
    const linhaLocais = loc => Object.entries(loc).filter(([, q]) => q > 0).map(([l, q]) => `${nomeLocalBal(l)} ${n(q)}`).join(' + ') || '—';
    const html =
        bloco(`SAÍRAM PARCIALMENTE — ainda têm saldo`, 'fa-circle-half-stroke', 'var(--cor-sugestao)', r.saidaParcial.sort((a, b) => b.pct - a.pct),
            o => `<div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">${selo(o)} ${barra(o.pct)} <strong style="font-size:12px;">${o.pct}%</strong> <span style="font-size:12px;">saiu ${n(o.saiu)} de ${n(o.antes)} · <strong>restam ${n(o.total)}</strong></span>${ref(o)}</div>`) +
        bloco(`SAÍRAM POR COMPLETO — sem saldo na ${setor.toLowerCase()}`, 'fa-check-circle', 'var(--cor-despacho)', r.saidaTotal,
            o => `<div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">${selo(o)} <span style="font-size:12px;">saíram ${n(o.saiu)} peças</span>${ref(o)}</div>`) +
        bloco('MAIS PEÇAS CHEGARAM', 'fa-arrow-trend-up', 'var(--cor-alerta)', r.chegouMais,
            o => `<div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">${selo(o)} <span style="font-size:12px;">+${n(o.chegou)} (de ${n(o.antes)} para ${n(o.total)})</span>${ref(o)}</div>`) +
        bloco('MUDARAM DE LOCAL (mesma quantidade)', 'fa-right-left', 'var(--cor-sugestao)', r.mudouLocal,
            o => `<div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">${selo(o)} <span style="font-size:12px;">${linhaLocais(o.de)} <i class="fas fa-arrow-right" style="color:var(--texto-secundario);"></i> ${linhaLocais(o.locais)}</span>${ref(o)}</div>`) +
        bloco(`OPs NOVAS NA ${setor}`, 'fa-plus-circle', 'var(--cor-despacho)', r.novas,
            o => `<div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">${selo(o)} <span style="font-size:12px;">${linhaLocais(o.locais)}</span>${ref(o)}</div>`);
    const totalPecasSaidas = r.saidaParcial.reduce((t, o) => t + o.saiu, 0) + r.saidaTotal.reduce((t, o) => t + o.saiu, 0);
    const resumo = `<div style="display:flex; gap:14px; flex-wrap:wrap; font-size:12px; color:var(--texto-secundario); margin-bottom:12px;">
        <span><strong style="color:var(--texto-cor);">${n(totalPecasSaidas)}</strong> peças saíram</span>
        <span><strong style="color:var(--texto-cor);">${r.saidaParcial.length}</strong> parciais</span>
        <span><strong style="color:var(--texto-cor);">${r.saidaTotal.length}</strong> completas</span>
        <span><strong style="color:var(--texto-cor);">${r.novas.length}</strong> novas</span></div>`;
    $('modalBalancoSincronizacao').innerHTML = `
        <div class="modal-card" style="width:680px; max-width:92vw; border-top:5px solid var(--cor-sugestao); max-height:85vh;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; border-bottom:2px solid var(--borda-cor); padding-bottom:10px; flex-shrink:0;">
                <h2 style="margin:0; color:var(--texto-cor); display:flex; align-items:center; gap:10px; font-size:16px;"><i class="fas ${opc.icone || 'fa-scissors'}" style="color:var(--cor-sugestao);"></i> ${opc.titulo || 'BALANÇO DA COSTURA'}</h2>
                <button onclick="fecharModais()" class="modal-fechar-btn"><i class="fas fa-times"></i></button>
            </div>
            <div style="overflow-y:auto; flex:1;">
                ${html ? resumo + html : '<div style="text-align:center; padding:20px; color:var(--texto-secundario);">Nenhuma mudança de quantidade desde a última importação — tudo igual.</div>'}
            </div>
        </div>`;
    $('modalBalancoSincronizacao').style.display = 'flex';
}


function obterHistoricoBalancoCostura() { try { return JSON.parse(localStorage.getItem('historicoBalancoCostura') || '[]'); } catch (e) { return []; } }
function registrarHistoricoBalancoCostura(r) {
    const hist = obterHistoricoBalancoCostura();
    const compacta = (l, extra) => l.slice(0, 150).map(o => ({ op: o.op, ciclo: o.ciclo, ...extra(o) }));
    const entrada = {
        em: new Date().toISOString(),
        pecasSairam: r.saidaParcial.reduce((t, o) => t + o.saiu, 0) + r.saidaTotal.reduce((t, o) => t + o.saiu, 0),
        parciais: compacta(r.saidaParcial, o => ({ saiu: o.saiu, restam: o.total })),
        completas: compacta(r.saidaTotal, o => ({ saiu: o.saiu })),
        novas: r.novas.length, chegaram: r.chegouMais.length,
    };
    hist.unshift(entrada);
    try { localStorage.setItem('historicoBalancoCostura', JSON.stringify(hist.slice(0, 40))); } catch (e) { /* ignora */ }
}
function exibirHistoricoBalancoCostura() {
    const hist = obterHistoricoBalancoCostura();
    const n = x => Number(x).toLocaleString('pt-BR');
    const fmtData = iso => { const d = new Date(iso); return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); };
    let conteudo;
    if (!hist.length) conteudo = '<div style="text-align:center; padding:20px; color:var(--texto-secundario);">Ainda não há balanços guardados. Eles passam a ser guardados a cada importação do POR OP (a partir da segunda).</div>';
    else {
        const linhas = hist.map(h => `
            <details style="border:1px solid var(--borda-cor); border-radius:8px; padding:8px 12px; margin-bottom:6px; background:var(--bg-painel);">
                <summary style="cursor:pointer; font-size:12px; display:flex; gap:12px; flex-wrap:wrap; align-items:center;"><strong>${fmtData(h.em)}</strong>
                    <span><strong>${n(h.pecasSairam)}</strong> peças saíram</span><span>${h.parciais.length} parciais</span><span>${h.completas.length} completas</span><span>${h.novas} novas</span></summary>
                <div style="font-size:12px; margin-top:8px; line-height:1.9;">
                    ${h.parciais.length ? `<div><strong>Parciais:</strong> ${h.parciais.map(o => `<span class="pill" style="background:var(--bg-card); border:1px solid var(--borda-cor); color:var(--texto-cor);">${o.op}${o.ciclo ? ' · ' + o.ciclo : ''} −${n(o.saiu)} (restam ${n(o.restam)})</span>`).join(' ')}</div>` : ''}
                    ${h.completas.length ? `<div><strong>Completas:</strong> ${h.completas.map(o => `<span class="pill pill-ok">${o.op}${o.ciclo ? ' · ' + o.ciclo : ''} (${n(o.saiu)})</span>`).join(' ')}</div>` : ''}
                </div>
            </details>`).join('');
        conteudo = `<div style="font-size:11px; color:var(--texto-secundario); margin-bottom:8px;">Um registro por importação do POR OP. Clique para ver as OPs.</div>${linhas}`;
    }
    $('modalBalancoSincronizacao').innerHTML = `
        <div class="modal-card" style="width:680px; max-width:92vw; border-top:5px solid var(--cor-sugestao); max-height:85vh;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; border-bottom:2px solid var(--borda-cor); padding-bottom:10px; flex-shrink:0;">
                <h2 style="margin:0; color:var(--texto-cor); display:flex; align-items:center; gap:10px; font-size:16px;"><i class="fas fa-clock-rotate-left" style="color:var(--cor-sugestao);"></i> HISTÓRICO DO BALANÇO DA COSTURA</h2>
                <button onclick="fecharModais()" class="modal-fechar-btn"><i class="fas fa-times"></i></button>
            </div>
            <div style="overflow-y:auto; flex:1;">${conteudo}</div>
        </div>`;
    $('modalBalancoSincronizacao').style.display = 'flex';
}

function processarPorOPCostura() {
    if (!exigirAdminOuUsuario('importar a planilha do Seq. Costura')) return;
    if (!exigirBibliotecaExcel()) return;
    const input = $('inputPorOPCostura'); if (!input.files[0]) return;
    const r = new FileReader();
    r.onload = function (e) {
        try {
            const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
            const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
            if (!rows.length) throw new Error("Planilha vazia.");

            const cab = rows[0].map(c => String(c || '').trim().toUpperCase());
            const idxDescLocal = cab.findIndex(c => c === 'DESCRIÇÃO LOCAL' || c.includes('DESCRICAO LOCAL'));
            const idxOP = cab.findIndex(c => c === 'OP');
            const idxQtd = cab.findIndex(c => c.includes('QT') && c.includes('LOCAL'));
            const idxRef = cab.findIndex(c => c.includes('REFER') && !c.includes('DESCRI'));
            const idxDescRef = cab.findIndex(c => c.includes('DESCRI') && c.includes('REFER'));
            const idxTipo = cab.findIndex(c => c.includes('TIPO') && c.includes('PRODUTO'));
            const idxPrioridade = cab.findIndex(c => c === 'PRIORIDADE');
            const idxMinutosCostura = cab.findIndex(c => c.includes('MINUTOS') && c.includes('COSTURA'));
            const idxMinutosAcabamento = cab.findIndex(c => c.includes('MINUTOS') && c.includes('ACABAMENTO'));
            const idxDataFinalizacao = cab.findIndex(c => c.includes('DATA') && c.includes('FINALIZ'));
            const idxDataInclusao = cab.findIndex(c => c.includes('DATA') && c.includes('INCLUS'));
            const idxCiclo = cab.findIndex(c => c === 'CICLO');
            const idxTempoPecaCostura = cab.findIndex(c => c.includes('TEMPO') && /PE[CÇ]A/.test(c) && c.includes('COSTURA'));
            const idxCor = cab.findIndex(c => c === 'COR' || c === 'COR PRODUTO');
            const idxDiasLocal = cab.findIndex(c => c === 'DIAS LOCAL');

            const faltando = [];
            if (idxDescLocal === -1) faltando.push('Descrição Local');
            if (idxOP === -1) faltando.push('OP');
            if (faltando.length) throw new Error("Não encontrei as colunas: " + faltando.join(', ') + " no cabeçalho da planilha.");

            // A planilha inteira cobre a fábrica toda (quase 2 mil linhas),
            // mas o Seq. Costura só usa 5 locais específicos — guardar só
            // esses reduz o tamanho em muitas vezes e evita estourar o
            // limite de armazenamento do navegador (aconteceu na prática:
            // guardar tudo passava do limite; só os locais relevantes cabe
            // numa fração do espaço).
            const locaisRelevantes = new Set(
                Object.values(GRUPOS_SEQUENCIAMENTO_COSTURA).flatMap(g => [g.emAndamento, g.aguardando]).filter(Boolean)
            );
            // OPs removidas ficam de fora pra sempre, mesmo reimportando —
            // é assim que se limpa o "lixo" (OP que não existe mais, ou
            // que virou ruído) sem ela voltar toda vez.
            const removidas = obterOpsRemovidasSeqCostura();

            let puladasPorRemocao = 0;
            const snapshotBalanco = [];
            const porOPCosturaDetalhado = [];
            for (let i = 1; i < rows.length; i++) {
                const row = rows[i]; if (!row || row[idxOP] === undefined || row[idxOP] === null || row[idxOP] === '') continue;
                const local = idxDescLocal !== -1 && row[idxDescLocal] ? String(row[idxDescLocal]).trim().toUpperCase() : '';
                if (ehLocalCosturaEficiencia(local) && normalizarCabecalhoEf(local).startsWith('PNP')) {   // foto do balanço (só PNP, sem SLV): só os locais de costura do KPI (independe dos grupos da sequência)
                    snapshotBalanco.push({ op: String(row[idxOP]).trim(), ciclo: idxCiclo !== -1 && row[idxCiclo] !== undefined && row[idxCiclo] !== null ? String(row[idxCiclo]).trim() : '', local: normalizarCabecalhoEf(local), descRef: idxDescRef !== -1 && row[idxDescRef] ? String(row[idxDescRef]).trim() : '', ref: idxRef !== -1 && row[idxRef] ? String(row[idxRef]).trim().toUpperCase() : '', qtd: idxQtd !== -1 ? (parseFloat(row[idxQtd]) || 0) : 0 });
                }
                if (!locaisRelevantes.has(local)) continue;
                const opId = String(row[idxOP]).trim();
                const cicloId = idxCiclo !== -1 && row[idxCiclo] !== undefined && row[idxCiclo] !== null ? String(row[idxCiclo]).trim() : '';
                const registroRemocao = removidas[chaveOPCostura(opId, cicloId)];
                if (registroRemocao && !registroRemocao.restauradoEm) { puladasPorRemocao++; continue; }
                porOPCosturaDetalhado.push({
                    op: opId,
                    ciclo: cicloId,
                    local: local,
                    ref: idxRef !== -1 && row[idxRef] ? String(row[idxRef]).trim().toUpperCase() : '',
                    descRef: idxDescRef !== -1 && row[idxDescRef] ? String(row[idxDescRef]).trim() : '',
                    tempoPecaCostura: idxTempoPecaCostura !== -1 && row[idxTempoPecaCostura] !== null && row[idxTempoPecaCostura] !== undefined && row[idxTempoPecaCostura] !== '' ? (parseFloat(row[idxTempoPecaCostura]) || null) : null,
                    cor: idxCor !== -1 && row[idxCor] ? String(row[idxCor]).trim().toUpperCase() : '',
                    diasLocal: idxDiasLocal !== -1 && row[idxDiasLocal] !== null && row[idxDiasLocal] !== undefined && row[idxDiasLocal] !== '' ? (parseInt(row[idxDiasLocal]) || 0) : null,
                    tipoProduto: idxTipo !== -1 && row[idxTipo] ? String(row[idxTipo]).trim().toUpperCase() : '',
                    prioridade: idxPrioridade !== -1 && row[idxPrioridade] !== null && row[idxPrioridade] !== undefined ? parseInt(row[idxPrioridade]) : null,
                    qtd: idxQtd !== -1 ? (parseFloat(row[idxQtd]) || 0) : 0,
                    minutosCostura: idxMinutosCostura !== -1 && row[idxMinutosCostura] !== null && row[idxMinutosCostura] !== undefined ? parseFloat(row[idxMinutosCostura]) : null,
                    minutosAcabamento: idxMinutosAcabamento !== -1 && row[idxMinutosAcabamento] !== null && row[idxMinutosAcabamento] !== undefined ? parseFloat(row[idxMinutosAcabamento]) : null,
                    dataFinalizacao: idxDataFinalizacao !== -1 ? extrairDataExcel(row[idxDataFinalizacao]) : null,
                    dataInclusao: idxDataInclusao !== -1 ? extrairDataExcel(row[idxDataInclusao]) : null,
                });
            }
            if (!porOPCosturaDetalhado.length) throw new Error("Nenhuma linha nos locais de costura conhecidos foi encontrada (confira se a planilha realmente cobre esses locais).");

            let snapshotAntes = [];
            try { snapshotAntes = JSON.parse(localStorage.getItem('snapshotBalancoCostura') || '[]'); } catch (e2) { /* sem foto anterior */ }
            try { localStorage.setItem('snapshotBalancoCostura', JSON.stringify(snapshotBalanco)); } catch (e2) { /* ignora */ }
            localStorage.setItem('porOPCosturaDetalhado', JSON.stringify(porOPCosturaDetalhado));
            input.value = '';
            renderizarSequenciamentoCostura();
            if (snapshotAntes.length) exibirBalancoSeqCostura(snapshotAntes, snapshotBalanco);
            agendarPublicacaoAutomatica();
            let msgImportacao = `<i class="fas fa-check-double"></i> ${porOPCosturaDetalhado.length} linhas de costura importadas!`;
            if (puladasPorRemocao > 0) msgImportacao += ` (${puladasPorRemocao} ficaram de fora por já terem sido removidas antes.)`;
            showToast(msgImportacao);
        } catch (err) {
            console.error('Erro ao processar planilha do Seq. Costura:', err);
            alert("❌ Não foi possível processar a planilha.\n\nVerifique se ela tem as colunas Descrição Local e OP no cabeçalho.\n\nDetalhe técnico: " + err.message);
            input.value = '';
        }
    };
    r.readAsArrayBuffer(input.files[0]);
}

// Junta as linhas da planilha POR_OP (importada junto com a Fila de Corte)
// que batem com um local específico — com filtro opcional, pra separar o
// que está misturado no mesmo local no sistema original (o filtro recebe
// a linha inteira, não só a descrição, já que agora também temos Tipo
// Produto disponível).
// "Ocultar" é mais leve que "Remover" — sem motivo, só local (não
// sincroniza com a nuvem), e reversível NA HORA (não precisa reimportar a
// planilha pra voltar, já que o dado da OP nunca sai de
// porOPCosturaDetalhado, só fica filtrado daqui). Pra quando a OP
// "atrapalha" a sequência mas o usuário não quer removê-la de verdade.
function obterOpsOcultasSeqCostura() {
    try { return JSON.parse(localStorage.getItem('opsOcultasSeqCostura') || '{}'); } catch (e) { return {}; }
}
function salvarOpsOcultasSeqCostura(obj) {
    localStorage.setItem('opsOcultasSeqCostura', JSON.stringify(obj));
}
function ocultarOPDaSequenciaCostura(op, ciclo) {
    if (!exigirAdminOuUsuario('ocultar uma OP da sequência')) return;
    const item = obterPorOPCosturaDetalhado().find(o => o.op === op && (o.ciclo || '') === (ciclo || ''));
    if (!item) return;
    const chave = chaveOPCostura(op, ciclo);
    const ocultas = obterOpsOcultasSeqCostura();
    ocultas[chave] = { op, ciclo: ciclo || '', descRef: item.descRef || '', ocultadoEm: new Date().toISOString() };
    salvarOpsOcultasSeqCostura(ocultas);
    renderizarSequenciamentoCostura();
    renderizarOpsOcultasSeqCostura();
    showToast(`<i class="fas fa-eye-slash"></i> OP ${op} ocultada da sequência.`);
}
function reexibirOPOcultaSeqCostura(chave) {
    if (!exigirAdminOuUsuario('reexibir uma OP oculta')) return;
    const ocultas = obterOpsOcultasSeqCostura();
    const item = ocultas[chave];
    if (!item) return;
    delete ocultas[chave];
    salvarOpsOcultasSeqCostura(ocultas);
    renderizarSequenciamentoCostura();
    renderizarOpsOcultasSeqCostura();
    showToast(`<i class="fas fa-eye"></i> OP ${item.op} reexibida na sequência.`);
}
function renderizarOpsOcultasSeqCostura() {
    if (!$('seqCostListaOcultas')) return;
    const ocultas = obterOpsOcultasSeqCostura();
    const lista = Object.entries(ocultas).sort((a, b) => new Date(b[1].ocultadoEm) - new Date(a[1].ocultadoEm));

    if ($('seqCostContOcultas')) $('seqCostContOcultas').textContent = lista.length;

    if (!lista.length) {
        $('seqCostListaOcultas').innerHTML = `<tr><td colspan="4" class="tabela-vazia">Nenhuma OP oculta.</td></tr>`;
        return;
    }

    $('seqCostListaOcultas').innerHTML = lista.map(([chave, item]) => `
        <tr>
            <td><strong>${item.op}</strong></td>
            <td>${item.ciclo || '—'}</td>
            <td>${item.descRef || ''}</td>
            <td style="text-align:center;"><button class="btn somente-admin tambem-usuario" style="padding:2px 8px; background:var(--cor-despacho); font-size:10px;" onclick="reexibirOPOcultaSeqCostura('${chave}')" title="Reexibir essa OP na sequência"><i class="fas fa-eye"></i> REEXIBIR</button></td>
        </tr>`).join('');
}

function obterOPsPorLocalCostura(local, filtro) {
    const ocultas = obterOpsOcultasSeqCostura();
    return obterPorOPCosturaDetalhado().filter(op =>
        op.local === local && (!filtro || filtro(op)) && !ocultas[chaveOPCostura(op.op, op.ciclo)]
    );
}

// Prioridade 1-98 = ordem normal, menor primeiro. Dentro da prioridade 99
// (que é o valor padrão, ninguém definiu manualmente), quem já tem uma
// Data Finalização vem antes de quem não tem — e entre as que têm, a data
// mais próxima vem primeiro (confirmado com o usuário).
// Data Finalização é o critério PRINCIPAL agora (quem tem data vem antes
// de quem não tem, e entre as que têm, a mais próxima primeiro) — só cai
// pra prioridade quando a OP não tem data nenhuma cadastrada.
// Quantos dias úteis (pula sábado/domingo e feriados cadastrados) uma OP
// de Costura precisa "sobrar" depois de pronta, pra dar tempo do
// Acabamento fazer a dele antes da Data Finalização de verdade. Mesmo
// valor pros 6 grupos (confirmado com o usuário).
const DIAS_RESERVA_ACABAMENTO_COSTURA = 5;
// A partir de quantos dias úteis de folga uma OP deixa de ser "urgente"
// pra ordem (e passa a competir só pela data de inclusão, como reposição).
const DIAS_JANELA_URGENCIA_COSTURA = 2;

function somarDiasUteisCostura(data, dias, feriados) {
    const feriadosSet = feriados || new Set(obterFeriados());
    const d = new Date(data);
    let restante = dias;
    while (restante > 0) {
        d.setDate(d.getDate() + 1);
        if (d.getDay() !== 0 && d.getDay() !== 6 && !feriadosSet.has(d.toISOString().slice(0, 10))) restante--;
    }
    return d;
}
function subtrairDiasUteisCostura(data, dias, feriados) {
    const feriadosSet = feriados || new Set(obterFeriados());
    const d = new Date(data);
    let restante = dias;
    while (restante > 0) {
        d.setDate(d.getDate() - 1);
        if (d.getDay() !== 0 && d.getDay() !== 6 && !feriadosSet.has(d.toISOString().slice(0, 10))) restante--;
    }
    return d;
}

// A data que REALMENTE importa pra Costura — a Data Finalização menos os
// dias de reserva do Acabamento. Null se a OP não tem Data Finalização.
function calcularDataLimiteCostura(op, feriados) {
    if (!op.dataFinalizacao) return null;
    const dataFinal = new Date(op.dataFinalizacao); dataFinal.setHours(0, 0, 0, 0);
    return subtrairDiasUteisCostura(dataFinal, DIAS_RESERVA_ACABAMENTO_COSTURA, feriados);
}

// Lógica combinada (pedido do usuário, substituindo a ordenação só por
// Data Finalização): uma OP só "fura a fila" pela data se estiver REALMENTE
// perto — já atrasada, ou dentro de DIAS_JANELA_URGENCIA_COSTURA dias úteis
// a partir de hoje (usando a data LIMITE, já descontado o tempo do
// Acabamento). Fora dessa janela, não tem urgência de prazo ainda, então
// a OP concorre pela DATA DE INCLUSÃO (mais antiga primeiro) — mesmo
// raciocínio já usado na aba Programação, pra reposições não ficarem
// esquecidas só porque o prazo ainda está longe.
function compararPrioridadeCostura(a, b) {
    const feriados = new Set(obterFeriados());
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const limiteUrgencia = somarDiasUteisCostura(hoje, DIAS_JANELA_URGENCIA_COSTURA, feriados);

    const limiteA = calcularDataLimiteCostura(a, feriados);
    const limiteB = calcularDataLimiteCostura(b, feriados);
    const urgenteA = limiteA !== null && limiteA <= limiteUrgencia;
    const urgenteB = limiteB !== null && limiteB <= limiteUrgencia;

    // Desempates, na ordem: Data Finalização (a mais cedo primeiro), data de
    // inclusão (a mais antiga primeiro; sem data vai pro fim) e, por último, a prioridade.
    const finA = a.dataFinalizacao ? new Date(a.dataFinalizacao).getTime() : Infinity;
    const finB = b.dataFinalizacao ? new Date(b.dataFinalizacao).getTime() : Infinity;
    const incA = a.dataInclusao ? new Date(a.dataInclusao).getTime() : Infinity;
    const incB = b.dataInclusao ? new Date(b.dataInclusao).getTime() : Infinity;
    const porFinalizacao = () => finA === finB ? 0 : (finA < finB ? -1 : 1);
    const porInclusao = () => incA === incB ? 0 : (incA < incB ? -1 : 1);

    if (urgenteA && urgenteB) {
        // as duas urgentes: a data limite mais cedo (ou mais atrasada) primeiro...
        if (limiteA - limiteB !== 0) return limiteA - limiteB;
        // ...e se a data limite EMPATA, vale a Data Finalização — dias diferentes
        // podem cair na mesma data limite (ex: um feriado cadastrado no meio junta
        // 12/10 e 13/10 no mesmo limite; sem esse desempate as duas ficavam na ordem
        // da planilha e a de 13/10 podia passar na frente da de 12/10).
        return porFinalizacao() || porInclusao() || (a.prioridade ?? 99) - (b.prioridade ?? 99);
    }
    if (urgenteA && !urgenteB) return -1;
    if (!urgenteA && urgenteB) return 1;

    // Nenhuma urgente (ou sem data) — ordena por data de inclusão, mais
    // antiga primeiro; sem data de inclusão vai pro fim; empate cai na Data
    // Finalização e, por último, na prioridade.
    return porInclusao() || porFinalizacao() || (a.prioridade ?? 99) - (b.prioridade ?? 99);
}

// Monta a fila de um grupo inteiro: primeiro tudo que já está "em
// andamento" (ordenado por prioridade), depois tudo "aguardando definição"
// (também por prioridade) — confirmado com o usuário, essa é a ordem.
// Ordem manual do Enfesto (só esse grupo, sem tempo confiável — usuário
// pediu pra poder reordenar na mão, já que o sistema não consegue dizer
// quando cada OP começa/termina). Guardada como array de chaves "op|ciclo"
// na ordem desejada — OP nova que aparecer numa reimportação entra no
// FIM, na ordem automática entre si (não temos como saber onde ela
// "deveria" ficar no meio de uma ordem que foi feita à mão).
function obterOrdemManualEnfesto() {
    try { return JSON.parse(localStorage.getItem('ordemManualEnfesto') || '[]'); } catch (e) { return []; }
}
function salvarOrdemManualEnfesto(ordem) {
    localStorage.setItem('ordemManualEnfesto', JSON.stringify(ordem));
}
function aplicarOrdemManualEnfesto(fila) {
    const ordemSalva = obterOrdemManualEnfesto();
    if (!ordemSalva.length) return fila;
    const porChave = new Map(fila.map(op => [chaveOPCostura(op.op, op.ciclo), op]));
    const ordenados = [];
    ordemSalva.forEach(chave => {
        if (porChave.has(chave)) { ordenados.push(porChave.get(chave)); porChave.delete(chave); }
    });
    ordenados.push(...porChave.values()); // OPs novas, não estavam na ordem salva
    return ordenados;
}

// Publica a ordem inteira na hora (1 linha só, id fixo 'enfesto') — sem
// esperar o botão geral de publicar, senão outra pessoa só veria a ordem
// nova bem depois.
async function publicarOrdemManualEnfestoNaNuvem(ordem) {
    if (!supabaseClient) return;
    try {
        const { error } = await supabaseClient.from('ordem_manual_enfesto').upsert({
            id: 'enfesto', ordem,
            atualizado_por: sessaoAdminAtual && sessaoAdminAtual.user ? sessaoAdminAtual.user.email : 'desconhecido',
            atualizado_em: new Date().toISOString(),
        }, { onConflict: 'id' });
        if (error) throw error;
        registrarLogDebug('log', ['[NUVEM] Ordem manual do Enfesto publicada.']);
    } catch (e) {
        registrarLogDebug('error', ['Falha ao publicar ordem do Enfesto na nuvem: ' + e.message]);
        showToast('<i class="fas fa-triangle-exclamation"></i> Salvou aqui, mas não consegui avisar a nuvem — outras pessoas podem não ver essa ordem nova ainda.', true);
    }
}

// Busca a ordem da nuvem — TODO MUNDO carrega (mesmo padrão de
// ops_removidas_seq_costura), já que o objetivo é sincronizar entre
// qualquer computador, admin incluído.
async function carregarOrdemManualEnfestoDaNuvem() {
    if (!supabaseClient) return;
    try {
        const { data, error } = await supabaseClient.from('ordem_manual_enfesto').select('*').eq('id', 'enfesto').maybeSingle();
        if (error) throw error;
        salvarOrdemManualEnfesto(data && Array.isArray(data.ordem) ? data.ordem : []);
        renderizarSequenciamentoCostura();
    } catch (e) {
        registrarLogDebug('error', ['Falha ao carregar ordem do Enfesto da nuvem: ' + e.message]);
    }
}

function montarFilaSequenciamentoCostura(chaveGrupo) {
    const grupo = GRUPOS_SEQUENCIAMENTO_COSTURA[chaveGrupo];
    if (!grupo) return [];
    const emAndamento = obterOPsPorLocalCostura(grupo.emAndamento, grupo.filtroEmAndamento)
        .map(op => ({ ...op, situacaoCostura: 'Em andamento', campoTempo: grupo.campoTempo }))
        .sort(compararPrioridadeCostura);
    // Acabamento não tem fila de espera separada (confirmado com o
    // usuário) — só pula essa parte quando o grupo não tiver um local de
    // "aguardando" definido.
    const aguardando = grupo.aguardando
        ? obterOPsPorLocalCostura(grupo.aguardando, grupo.filtroAguardando)
            .map(op => ({ ...op, situacaoCostura: 'Aguardando', campoTempo: grupo.campoTempo }))
            .sort(compararPrioridadeCostura)
        : [];
    const filaCompleta = [...emAndamento, ...aguardando];
    return chaveGrupo === 'ENFESTO' ? aplicarOrdemManualEnfesto(filaCompleta) : filaCompleta;
}

