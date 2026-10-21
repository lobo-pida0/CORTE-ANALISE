// =========================================================================
// 📋 PLANO DA COSTURA — o admin marca as OPs que programou pra um dia; no dia útil seguinte, quando o relatório de
// movimentação da costura é importado (Eficiência da costura), o sistema confere o que saiu:
//   saiu por completo / saiu parcial / não saiu / saiu sem estar no plano.
// Só conta o que saiu NO PRÓXIMO DIA ÚTIL depois do dia do plano (fim de semana e feriados cadastrados pulam).
// Guardado no navegador ('planoCostura') e na nuvem (tabela plano_costura, só usuário logado).
// { 'AAAA-MM-DD': { ops: [{ op, ciclo, grupo, local, qtd, desc }], salvoEm } }
// =========================================================================
function obterPlanosCostura() { try { return JSON.parse(localStorage.getItem('planoCostura') || '{}'); } catch (e) { return {}; } }
function salvarPlanosCostura(o) { try { localStorage.setItem('planoCostura', JSON.stringify(o)); } catch (e) { showToast('<i class="fas fa-triangle-exclamation"></i> Não consegui salvar o plano (armazenamento cheio).', true, 6000); } }

function hojeISOLocalPlanoCostura() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
// Próximo dia útil depois de 'AAAA-MM-DD' (pula sábado, domingo e feriados cadastrados).
function proximoDiaUtilPlanoCostura(diaISO) {
    const feriados = new Set((typeof obterFeriados === 'function' ? obterFeriados() : []));
    const d = new Date(diaISO + 'T12:00:00Z');
    do { d.setUTCDate(d.getUTCDate() + 1); } while (d.getUTCDay() === 0 || d.getUTCDay() === 6 || feriados.has(d.toISOString().slice(0, 10)));
    return d.toISOString().slice(0, 10);
}
function chaveOPPlanoCostura(item) { return montarChaveOP(item.ciclo, item.op); }

// ---- nuvem
async function publicarPlanoCosturaNuvem(dia) {
    if (!supabaseClient || !sessaoAdminAtual) return false;
    const plano = obterPlanosCostura()[dia]; if (!plano) return false;
    try {
        const por = String((sessaoAdminAtual.user && sessaoAdminAtual.user.email) || '').split('@')[0].toUpperCase();
        const { error } = await supabaseClient.from('plano_costura').upsert({ id: dia, dados: plano, atualizado_por: por, atualizado_em: new Date().toISOString() }, { onConflict: 'id' });
        if (error) throw error;
        return true;
    } catch (e) {
        registrarLogDebug('error', ['[PLANO COSTURA] falha ao publicar: ' + e.message]);
        showToast('<i class="fas fa-triangle-exclamation"></i> Plano salvo só neste navegador (falhou na nuvem: ' + (e.message || 'erro') + ').', true, 7000);
        return false;
    }
}
async function carregarPlanosCosturaDaNuvem() {
    if (!supabaseClient || !sessaoAdminAtual) return;
    try {
        const linhas = await buscarTodasLinhasSupabase('plano_costura');
        const locais = obterPlanosCostura(); let mudou = false;
        (linhas || []).forEach(l => {
            if (!l.dados || !Array.isArray(l.dados.ops)) return;
            const local = locais[l.id];
            if (!local || String(l.dados.salvoEm || '') > String(local.salvoEm || '')) { locais[l.id] = l.dados; mudou = true; }   // vale o mais recente
        });
        const soLocais = Object.keys(locais).filter(d => !(linhas || []).some(l => l.id === d));
        if (mudou) salvarPlanosCostura(locais);
        for (const d of soLocais) await publicarPlanoCosturaNuvem(d);
        renderizarPlanoCostura();
    } catch (e) { registrarLogDebug('error', ['[PLANO COSTURA] falha ao carregar da nuvem: ' + e.message]); }
}

// ---- OPs disponíveis pra marcar: as que estão agora nos locais da Sequência (em andamento + aguardando), por grupo
function opsDisponiveisPlanoCostura() {
    const FORA_DO_PLANO = ['ACABAMENTO', 'ENFESTO', 'ETIQUETACAO'];   // pedido do usuário: acabamento, enfesto e etiquetação não entram no plano da costura
    return Object.entries(GRUPOS_SEQUENCIAMENTO_COSTURA).filter(([chave]) => !FORA_DO_PLANO.includes(chave)).map(([chave, g]) => ({
        chave, rotulo: g.rotulo,
        ops: montarFilaSequenciamentoCostura(chave).map(o => ({ op: o.op, ciclo: o.ciclo || '', grupo: g.rotulo, local: o.situacaoCostura || '', qtd: Math.round(o.qtd || 0), desc: o.descRef || o.ref || '' })),
    })).filter(g => g.ops.length);
}

// ---- conferência
function compararPlanoCostura(dia) {
    const plano = obterPlanosCostura()[dia]; if (!plano) return null;
    const dataConf = proximoDiaUtilPlanoCostura(dia);
    const ef = obterEficienciaCostura()[dataConf];
    if (!ef) return { estado: 'aguardando', dataConf, plano };
    if (!ef.opsMov) return { estado: 'semDetalhe', dataConf, plano };
    const itens = plano.ops.map(o => {
        const mv = ef.opsMov[chaveOPPlanoCostura(o)]; const q = mv ? Math.round(mv.q) : 0;
        return { ...o, saiu: q, status: q <= 0 ? 'nao' : (q >= o.qtd ? 'completa' : 'parcial') };
    });
    const noPlano = new Set(plano.ops.map(chaveOPPlanoCostura));
    const extras = Object.entries(ef.opsMov).filter(([k]) => !noPlano.has(k)).map(([k, v]) => ({ chave: k, saiu: Math.round(v.q), locais: v.l || [] })).sort((a, b) => b.saiu - a.saiu);
    const prog = itens.reduce((t, x) => t + x.qtd, 0), cumprido = itens.reduce((t, x) => t + Math.min(x.saiu, x.qtd), 0);
    return {
        estado: 'conferido', dataConf, plano, itens, extras, pecasProgramadas: prog, pecasCumpridas: cumprido,
        pct: prog ? Math.round(cumprido / prog * 100) : 0,
        qtdCompletas: itens.filter(x => x.status === 'completa').length, qtdParciais: itens.filter(x => x.status === 'parcial').length, qtdNao: itens.filter(x => x.status === 'nao').length,
        pecasExtras: extras.reduce((t, x) => t + x.saiu, 0),
    };
}

// ---- salvar
async function salvarPlanoCostura() {
    if (!exigirAdmin('salvar o plano da costura')) return;
    const dia = ($('planoCosturaData') || {}).value; if (!dia) return alert('Escolha o dia do plano.');
    const disponiveis = opsDisponiveisPlanoCostura().flatMap(g => g.ops);
    const marcadas = new Set([...document.querySelectorAll('#planoCosturaLista input[type=checkbox]:checked')].map(c => c.value));
    const ops = disponiveis.filter(o => marcadas.has(chaveOPPlanoCostura(o)));
    const planos = obterPlanosCostura();
    if (!ops.length) {
        if (!planos[dia]) return alert('Marque ao menos uma OP.');
        if (!confirm('Nenhuma OP marcada: isso APAGA o plano de ' + formatarChaveDataBR(dia) + '. Continuar?')) return;
        delete planos[dia]; salvarPlanosCostura(planos);
        if (supabaseClient && sessaoAdminAtual) { try { await supabaseClient.from('plano_costura').delete().eq('id', dia); } catch (e) { /* ignora */ } }
        renderizarPlanoCostura(); showToast('<i class="fas fa-check"></i> Plano apagado.'); return;
    }
    // OPs que já estavam no plano e saíram da lista de agora (ex.: já saíram da costura) continuam no plano com os dados de antes
    const antigas = (planos[dia] && planos[dia].ops || []).filter(o => marcadas.has(chaveOPPlanoCostura(o)) && !disponiveis.some(d => chaveOPPlanoCostura(d) === chaveOPPlanoCostura(o)));
    planos[dia] = { ops: [...ops, ...antigas], salvoEm: new Date().toISOString() };
    salvarPlanosCostura(planos);
    const ok = await publicarPlanoCosturaNuvem(dia);
    renderizarPlanoCostura();
    showToast(`<i class="fas fa-check-double"></i> Plano de ${formatarChaveDataBR(dia)} salvo: ${planos[dia].ops.length} OPs, ${planos[dia].ops.reduce((t, o) => t + o.qtd, 0).toLocaleString('pt-BR')} peças.${ok ? ' Na nuvem também.' : ''} Será conferido com as saídas de ${formatarChaveDataBR(proximoDiaUtilPlanoCostura(dia))}.`, false, 6000);
}

// ---- tela
function atualizarContadorPlanoCostura() {
    const el = $('planoCosturaContador'); if (!el) return;
    const marcadas = new Set([...document.querySelectorAll('#planoCosturaLista input[type=checkbox]:checked')].map(c => c.value));
    const todas = opsDisponiveisPlanoCostura().flatMap(g => g.ops).filter(o => marcadas.has(chaveOPPlanoCostura(o)));
    el.innerHTML = `<strong>${todas.length}</strong> OP(s) · <strong>${todas.reduce((t, o) => t + o.qtd, 0).toLocaleString('pt-BR')}</strong> peças marcadas`;
}
function alternarGrupoPlanoCostura(chave, marcar) {
    document.querySelectorAll(`#planoCosturaLista input[data-grupo="${chave}"]`).forEach(c => { c.checked = marcar; });
    atualizarContadorPlanoCostura();
}
function renderizarPlanoCostura() {
    const raiz = $('planoCosturaConteudo'); if (!raiz) return;
    const admin = !!(sessaoAdminAtual && papelUsuarioAtual === 'admin');
    const fmt = v => Number(v).toLocaleString('pt-BR');
    const esc = t => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const dia = ($('planoCosturaData') && $('planoCosturaData').value) || hojeISOLocalPlanoCostura();
    if ($('planoCosturaData') && !$('planoCosturaData').value) $('planoCosturaData').value = dia;
    const planoDoDia = obterPlanosCostura()[dia];
    const marcadasAntes = new Set(planoDoDia ? planoDoDia.ops.map(chaveOPPlanoCostura) : []);
    // mantém o que o usuário já marcou na tela (sem salvar) se o dia não mudou
    const jaMarcadas = [...document.querySelectorAll('#planoCosturaLista input[type=checkbox]:checked')].map(c => c.value);
    const diaAnterior = raiz.dataset.dia;
    const marcadas = (diaAnterior === dia && raiz.dataset.montado === '1') ? new Set(jaMarcadas) : marcadasAntes;
    const grupos = opsDisponiveisPlanoCostura();
    $('planoCosturaAviso').innerHTML = `<i class="fas fa-circle-info"></i> O plano de <strong>${formatarChaveDataBR(dia)}</strong> será conferido com o que saiu da costura em <strong>${formatarChaveDataBR(proximoDiaUtilPlanoCostura(dia))}</strong> (próximo dia útil), quando você importar o relatório de movimentação em KPI → Eficiência da costura. Vale a saída completa ou parcial.`;
    if (!grupos.length) {
        $('planoCosturaLista').innerHTML = '<div style="padding:16px; color:var(--texto-secundario);">Não há OPs na Sequência da costura. Importe a planilha POR_OP na aba SEQUÊNCIA.</div>';
    } else {
        $('planoCosturaLista').innerHTML = grupos.map(g => `
            <details open style="border:1px solid var(--borda-cor); border-radius:8px; margin-bottom:8px; background:var(--bg-painel);">
                <summary style="cursor:pointer; padding:8px 12px; font-weight:700; font-size:13px; display:flex; gap:10px; align-items:center;">${esc(g.rotulo)} <span style="font-weight:400; font-size:11px; color:var(--texto-secundario);">${g.ops.length} OPs · ${fmt(g.ops.reduce((t, o) => t + o.qtd, 0))} peças</span>
                    ${admin ? `<span style="margin-left:auto; font-weight:400; font-size:11px;"><a href="#" onclick="event.preventDefault(); event.stopPropagation(); alternarGrupoPlanoCostura('${g.chave}', true)">marcar todas</a> · <a href="#" onclick="event.preventDefault(); event.stopPropagation(); alternarGrupoPlanoCostura('${g.chave}', false)">limpar</a></span>` : ''}</summary>
                <div style="padding:0 12px 10px;">${g.ops.map(o => `<label style="display:flex; gap:10px; align-items:center; padding:4px 0; border-top:1px solid var(--borda-cor); font-size:12px; cursor:${admin ? 'pointer' : 'default'};">
                    <input type="checkbox" value="${esc(chaveOPPlanoCostura(o))}" data-grupo="${g.chave}" ${marcadas.has(chaveOPPlanoCostura(o)) ? 'checked' : ''} ${admin ? '' : 'disabled'} onchange="atualizarContadorPlanoCostura()">
                    <strong style="min-width:70px;">${esc(o.op)}</strong><span style="color:var(--texto-secundario); min-width:70px;">ciclo ${esc(o.ciclo || '—')}</span>
                    <span style="flex:1; color:var(--texto-secundario); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(String(o.desc).slice(0, 60))}</span>
                    <span style="font-size:11px; color:var(--texto-secundario);">${esc(o.local)}</span><strong style="min-width:60px; text-align:right;">${fmt(o.qtd)}</strong></label>`).join('')}</div>
            </details>`).join('');
    }
    raiz.dataset.dia = dia; raiz.dataset.montado = '1';
    atualizarContadorPlanoCostura();
    if ($('btnSalvarPlanoCostura')) $('btnSalvarPlanoCostura').style.display = admin ? '' : 'none';
    $('planoCosturaStatusDia').innerHTML = planoDoDia ? `<span class="pill pill-ok">PLANO SALVO: ${planoDoDia.ops.length} OPs</span>` : '<span style="font-size:11px; color:var(--texto-secundario);">Sem plano salvo para esse dia.</span>';
    renderizarConferenciaPlanoCostura();
}
function renderizarConferenciaPlanoCostura() {
    const el = $('planoCosturaConferencia'); if (!el) return;
    const fmt = v => Number(v).toLocaleString('pt-BR');
    const esc = t => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const dias = Object.keys(obterPlanosCostura()).sort().reverse().slice(0, 15);
    if (!dias.length) { el.innerHTML = '<div style="padding:16px; color:var(--texto-secundario); font-size:12px;">Ainda não há planos salvos. Marque as OPs acima e clique em SALVAR PLANO.</div>'; return; }
    const sel = { completa: ['SAIU POR COMPLETO', 'var(--cor-despacho)'], parcial: ['SAIU PARCIAL', 'var(--cor-sugestao)'], nao: ['NÃO SAIU', 'var(--cor-alerta)'] };
    el.innerHTML = dias.map((d, i) => {
        const r = compararPlanoCostura(d);
        const cab = `<strong>${formatarChaveDataBR(d)}</strong> <span style="color:var(--texto-secundario); font-size:11px;">(${r.plano.ops.length} OPs, ${fmt(r.plano.ops.reduce((t, o) => t + o.qtd, 0))} peças)</span>`;
        if (r.estado !== 'conferido') {
            const msg = r.estado === 'aguardando' ? `aguardando o relatório de ${formatarChaveDataBR(r.dataConf)}` : `o relatório de ${formatarChaveDataBR(r.dataConf)} foi importado antes dessa versão (sem o detalhe por OP) — reimporte-o`;
            return `<div style="border:1px solid var(--borda-cor); border-radius:8px; padding:10px 12px; margin-bottom:8px; background:var(--bg-painel); font-size:12px;">${cab} <span class="pill" style="background:var(--borda-cor); color:var(--texto-cor); margin-left:8px;">${msg}</span></div>`;
        }
        const cor = r.pct >= 80 ? 'var(--cor-despacho)' : (r.pct >= 50 ? 'var(--cor-sugestao)' : 'var(--cor-alerta)');
        const linhas = r.itens.sort((a, b) => ({ nao: 0, parcial: 1, completa: 2 })[a.status] - ({ nao: 0, parcial: 1, completa: 2 })[b.status]).map(x => `<tr>
            <td style="white-space:nowrap;"><strong>${esc(x.op)}</strong> <span style="font-size:11px; color:var(--texto-secundario);">ciclo ${esc(x.ciclo || '—')}</span></td>
            <td style="font-size:11px; color:var(--texto-secundario);">${esc(x.grupo)} · ${esc(String(x.desc).slice(0, 40))}</td>
            <td style="text-align:right;">${fmt(x.qtd)}</td><td style="text-align:right;">${fmt(x.saiu)}</td>
            <td><span style="color:${sel[x.status][1]}; font-weight:700; font-size:11px;">${sel[x.status][0]}</span>${x.status === 'parcial' ? ` <span style="font-size:11px; color:var(--texto-secundario);">faltam ${fmt(x.qtd - x.saiu)}</span>` : ''}</td></tr>`).join('');
        const extras = r.extras.length ? `<div style="font-size:11px; font-weight:700; color:var(--texto-secundario); margin:10px 0 4px;">SAÍRAM SEM ESTAR NO PLANO (${r.extras.length} OPs · ${fmt(r.pecasExtras)} peças)</div>
            <div style="font-size:12px; line-height:1.8;">${r.extras.slice(0, 40).map(x => `<span class="pill" style="background:var(--bg-card); border:1px solid var(--borda-cor); color:var(--texto-cor);">${esc(x.chave)} · ${fmt(x.saiu)}</span>`).join(' ')}${r.extras.length > 40 ? ' …' : ''}</div>` : '';
        return `<details ${i === 0 ? 'open' : ''} style="border:1px solid var(--borda-cor); border-left:4px solid ${cor}; border-radius:8px; padding:8px 12px; margin-bottom:8px; background:var(--bg-painel);">
            <summary style="cursor:pointer; font-size:12px; display:flex; gap:14px; flex-wrap:wrap; align-items:center;">${cab}
                <span>conferido com <strong>${formatarChaveDataBR(r.dataConf)}</strong></span>
                <span style="color:${cor}; font-weight:900; font-size:15px;">${r.pct}% cumprido</span>
                <span>${fmt(r.pecasCumpridas)} de ${fmt(r.pecasProgramadas)} peças</span>
                <span style="color:var(--cor-despacho);">${r.qtdCompletas} completas</span><span style="color:var(--cor-sugestao);">${r.qtdParciais} parciais</span><span style="color:var(--cor-alerta);">${r.qtdNao} não saíram</span></summary>
            <table class="tabela-dados" style="width:100%; margin-top:8px;"><thead><tr><th>OP</th><th>GRUPO / PRODUTO</th><th style="text-align:right;">PROGRAMADO</th><th style="text-align:right;">SAIU</th><th>SITUAÇÃO</th></tr></thead><tbody>${linhas}</tbody></table>${extras}
        </details>`;
    }).join('');
}
