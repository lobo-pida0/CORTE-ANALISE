// Tempo de COSTURA já vem pronto na própria planilha POR_OP ("Minutos
// Costura", já é o total pra quantidade daquela linha, não por peça) — bem
// mais simples que cruzar com a planilha de tempos por operação (usada só
// em Montar Produção, que precisa do tempo de Corte e Etiquetação).
// Cada grupo diz qual campo usar (campoTempo, anexado em cada OP por
// montarFilaSequenciamentoCostura) — "minutosCostura" pros 4 grupos de
// costura, "minutosAcabamento" pro Acabamento.
// Feriados cadastrados manualmente (datas "AAAA-MM-DD") — o cronograma da
// Sequência da Produção assumia que TODO dia útil (seg-sex) tinha a mesma
// capacidade, o que fazia a previsão "passar por cima" de um feriado como
// se fosse um dia de trabalho normal. Guardado junto (não por grupo),
// já que um feriado vale pra fábrica inteira.
// ---- CALENDÁRIO DA PRODUÇÃO NA NUVEM: feriados + dias extras valem pra todo mundo (linha 'calendario_producao' da tabela destino_producao) ----
// Ao cadastrar/remover, lê a nuvem e troca SÓ aquela data (duas pessoas cadastrando datas diferentes não se sobrescrevem); depois o navegador copia o resultado.
async function alterarCalendarioNaNuvem(tipo, acao, data) {   // tipo: 'feriados' | 'extras'; acao: 'add' | 'rem'
    if (!supabaseClient || !sessaoAdminAtual) return;
    try {
        const { data: linha, error: e1 } = await supabaseClient.from('destino_producao').select('dados').eq('id', 'calendario_producao').maybeSingle();
        if (e1) throw e1;
        const dados = { feriados: [], extras: [], ...((linha && linha.dados) || {}) };
        const s = new Set(dados[tipo]); if (acao === 'add') s.add(data); else s.delete(data); dados[tipo] = [...s].sort();
        const por = String((sessaoAdminAtual.user && sessaoAdminAtual.user.email) || '').split('@')[0].toUpperCase();
        const { error } = await supabaseClient.from('destino_producao').upsert({ id: 'calendario_producao', dados, atualizado_em: new Date().toISOString(), atualizado_por: por }, { onConflict: 'id' });
        if (error) throw error;
        salvarFeriados(dados.feriados); salvarDiasExtras(dados.extras); localStorage.removeItem('calendarioPendentePublicar');
    } catch (e) {
        try { localStorage.setItem('calendarioPendentePublicar', '1'); } catch (e2) { /* ignora */ }
        registrarLogDebug('error', ['Falha ao publicar o calendário da produção: ' + e.message]);
        showToast('<i class="fas fa-triangle-exclamation"></i> Salvo só neste navegador (falha na nuvem). Abra a Sequência de novo pra tentar enviar.', true, 6000);
    }
}
async function carregarCalendarioProducaoDaNuvem() {
    if (!supabaseClient) return;
    const podeGravar = !!sessaoAdminAtual && (papelUsuarioAtual !== 'sequencia' || localStorage.getItem('calendarioPendentePublicar') === '1');   // o papel sequencia só grava se tem um envio seu pendente
    try {
        const { data, error } = await supabaseClient.from('destino_producao').select('dados').eq('id', 'calendario_producao').maybeSingle();
        if (error) throw error;
        const local = { feriados: obterFeriados(), extras: obterDiasExtras() };
        if (!data || !data.dados || localStorage.getItem('calendarioPendentePublicar') === '1') {
            // nuvem vazia ou envio que falhou antes: quem pode gravar sobe o que tem aqui (união com a nuvem, nunca perde data)
            if (!podeGravar || (!local.feriados.length && !local.extras.length)) return;
            const nuvem = (data && data.dados) || {};
            const dados = { feriados: [...new Set([...(nuvem.feriados || []), ...local.feriados])].sort(), extras: [...new Set([...(nuvem.extras || []), ...local.extras])].sort() };
            const { error: e2 } = await supabaseClient.from('destino_producao').upsert({ id: 'calendario_producao', dados, atualizado_em: new Date().toISOString(), atualizado_por: String((sessaoAdminAtual.user && sessaoAdminAtual.user.email) || '').split('@')[0].toUpperCase() }, { onConflict: 'id' });
            if (e2) throw e2;
            salvarFeriados(dados.feriados); salvarDiasExtras(dados.extras); localStorage.removeItem('calendarioPendentePublicar');
        } else {
            const f = data.dados.feriados || [], x = data.dados.extras || [];
            if (JSON.stringify(f) === JSON.stringify(local.feriados) && JSON.stringify(x) === JSON.stringify(local.extras)) return;
            salvarFeriados(f); salvarDiasExtras(x);
        }
        if ($('seqCostListaOPs')) renderizarSequenciamentoCostura();
    } catch (e) { registrarLogDebug('error', ['Falha ao carregar o calendário da produção: ' + e.message]); }
}

function obterFeriados() {
    try { return JSON.parse(localStorage.getItem('feriadosSeqProducao') || '[]'); } catch (e) { return []; }
}
function salvarFeriados(lista) {
    localStorage.setItem('feriadosSeqProducao', JSON.stringify([...new Set(lista)].sort()));
}
function adicionarFeriado(dataChave) {
    if (!exigirAdminOuUsuario('cadastrar feriado')) return;
    if (!dataChave) return;
    const lista = obterFeriados();
    if (!lista.includes(dataChave)) { lista.push(dataChave); salvarFeriados(lista); }
    renderizarModalFeriados();
    renderizarSequenciamentoCostura();
    alterarCalendarioNaNuvem('feriados', 'add', dataChave).then(() => { renderizarModalFeriados(); renderizarSequenciamentoCostura(); });
}
function removerFeriado(dataChave) {
    if (!exigirAdminOuUsuario('remover feriado')) return;
    salvarFeriados(obterFeriados().filter(d => d !== dataChave));
    renderizarModalFeriados();
    renderizarSequenciamentoCostura();
    alterarCalendarioNaNuvem('feriados', 'rem', dataChave).then(() => { renderizarModalFeriados(); renderizarSequenciamentoCostura(); });
}

// Dias EXTRAS trabalhados (ex.: sábado em que a fábrica costura): contam como dia útil no cronograma e nos prazos, mesmo sendo fim de semana.
function obterDiasExtras() { try { return JSON.parse(localStorage.getItem('diasExtrasSeqProducao') || '[]'); } catch (e) { return []; } }
function salvarDiasExtras(lista) { localStorage.setItem('diasExtrasSeqProducao', JSON.stringify([...new Set(lista)].sort())); }
// Dia de trabalho = dia extra cadastrado OU (seg-sex que não é feriado). O dia extra vale mesmo se cair em fim de semana ou feriado.
function ehDiaDeTrabalhoCostura(d, feriadosSet, extrasSet) {
    const iso = d.toISOString().slice(0, 10), extras = extrasSet || new Set(obterDiasExtras());
    if (extras.has(iso)) return true;
    return d.getDay() !== 0 && d.getDay() !== 6 && !(feriadosSet || new Set(obterFeriados())).has(iso);
}
function adicionarDiaExtra(dataChave) {
    if (!exigirLogadoNaSequencia('cadastrar dia trabalhado')) return;
    if (!dataChave) return;
    const lista = obterDiasExtras(); if (!lista.includes(dataChave)) { lista.push(dataChave); salvarDiasExtras(lista); }
    renderizarModalDiasExtras(); renderizarSequenciamentoCostura();
    alterarCalendarioNaNuvem('extras', 'add', dataChave).then(() => { renderizarModalDiasExtras(); renderizarSequenciamentoCostura(); });
}
function removerDiaExtra(dataChave) {
    if (!exigirLogadoNaSequencia('remover dia trabalhado')) return;
    salvarDiasExtras(obterDiasExtras().filter(d => d !== dataChave));
    renderizarModalDiasExtras(); renderizarSequenciamentoCostura();
    alterarCalendarioNaNuvem('extras', 'rem', dataChave).then(() => { renderizarModalDiasExtras(); renderizarSequenciamentoCostura(); });
}
function renderizarModalDiasExtras() {
    const lista = obterDiasExtras(), dias = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
    const fmt = d => { const [a, m, dia] = d.split('-'); return `${dia}/${m}/${a} (${dias[new Date(+a, +m - 1, +dia).getDay()]})`; };
    const linhas = lista.length ? lista.map(d => `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 12px; border-bottom:1px solid var(--borda-cor);">
                <span>${fmt(d)}</span>
                <button onclick="removerDiaExtra('${d}')" class="btn btn-perigo somente-admin tambem-usuario tambem-sequencia" style="padding:3px 8px;" title="Remover"><i class="fas fa-trash"></i></button>
            </div>`).join('') : '<div style="padding:20px; text-align:center; color:var(--texto-secundario);">Nenhum dia extra cadastrado.</div>';
    $('modalDiasExtras').innerHTML = `
        <div class="modal-card" style="width:400px; max-width:90vw; border-top:5px solid var(--cor-despacho); max-height:80vh;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; border-bottom:2px solid var(--borda-cor); padding-bottom:10px;">
                <h2 style="margin:0; color:var(--texto-cor); display:flex; align-items:center; gap:10px; font-size:16px;"><i class="fas fa-calendar-plus" style="color:var(--cor-despacho);"></i> DIAS EXTRAS TRABALHADOS</h2>
                <button onclick="fecharModais()" class="modal-fechar-btn"><i class="fas fa-times"></i></button>
            </div>
            <div style="font-size:12px; color:var(--texto-secundario); margin-bottom:15px;">Um dia cadastrado aqui (ex.: um sábado de trabalho) passa a contar como dia útil: a Sequência usa a capacidade cheia nele e os prazos (data limite) também contam esse dia.</div>
            <div style="overflow-y:auto; flex:1; margin-bottom:15px; border:1px solid var(--borda-cor); border-radius:8px;">${linhas}</div>
            <div class="somente-admin tambem-usuario tambem-sequencia" style="display:flex; gap:10px;">
                <input type="date" id="inputNovoDiaExtra" style="flex:1;">
                <button onclick="adicionarDiaExtra($('inputNovoDiaExtra').value)" class="btn btn-sugestao"><i class="fas fa-plus"></i> ADICIONAR</button>
            </div>
        </div>`;
}

function renderizarModalFeriados() {
    const lista = obterFeriados();
    // Formata direto da string "AAAA-MM-DD" pra "DD/MM/AAAA" sem passar por
    // new Date() — isso vira meia-noite UTC, que em fuso negativo (Brasil)
    // pode mostrar o dia ANTERIOR (mesma armadilha já documentada noutros
    // lugares do sistema com data-só-dia).
    const formatarFeriado = d => { const [a, m, dia] = d.split('-'); return `${dia}/${m}/${a}`; };
    const linhas = lista.length
        ? lista.map(d => `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 12px; border-bottom:1px solid var(--borda-cor);">
                <span>${formatarFeriado(d)}</span>
                <button onclick="removerFeriado('${d}')" class="btn btn-perigo somente-admin tambem-usuario" style="padding:3px 8px;" title="Remover"><i class="fas fa-trash"></i></button>
            </div>`).join('')
        : '<div style="padding:20px; text-align:center; color:var(--texto-secundario);">Nenhum feriado cadastrado.</div>';

    $('modalFeriados').innerHTML = `
        <div class="modal-card" style="width:380px; max-width:90vw; border-top:5px solid var(--cor-historico); max-height:80vh;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; border-bottom:2px solid var(--borda-cor); padding-bottom:10px;">
                <h2 style="margin:0; color:var(--texto-cor); display:flex; align-items:center; gap:10px; font-size:16px;">
                    <i class="fas fa-calendar-xmark" style="color:var(--cor-historico);"></i> FERIADOS
                </h2>
                <button onclick="fecharModais()" class="modal-fechar-btn"><i class="fas fa-times"></i></button>
            </div>
            <div style="font-size:12px; color:var(--texto-secundario); margin-bottom:15px;">
                Um feriado cadastrado aqui vira um dia sem produção no cronograma da Sequência (igual sábado/domingo) — as OPs previstas pra esse dia passam pro próximo dia útil.
            </div>
            <div style="overflow-y:auto; flex:1; margin-bottom:15px; border:1px solid var(--borda-cor); border-radius:8px;">
                ${linhas}
            </div>
            <div class="somente-admin tambem-usuario" style="display:flex; gap:10px;">
                <input type="date" id="inputNovoFeriado" style="flex:1;">
                <button onclick="adicionarFeriado($('inputNovoFeriado').value)" class="btn btn-sugestao"><i class="fas fa-plus"></i> ADICIONAR</button>
            </div>
        </div>
    `;
}
