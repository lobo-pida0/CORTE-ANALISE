// =========================================================================
// 📋 PLANO DA COSTURA — o admin marca as OPs que programou pra um dia; no dia útil seguinte, quando o relatório de
// movimentação da costura é importado (Eficiência da costura), o sistema confere o que saiu:
//   saiu por completo / saiu parcial / não saiu / saiu sem estar no plano.
// Só conta o que saiu NO PRÓXIMO DIA ÚTIL depois do dia do plano (fim de semana e feriados cadastrados pulam).
// Guardado no navegador ('planoCostura') e na nuvem (tabela plano_costura, só usuário logado).
// { 'AAAA-MM-DD': { ops: [{ op, ciclo, grupo, local, qtd, desc }], salvoEm } }
// =========================================================================
// Dois planos independentes: 'costura' (padrão) e 'acabamento' (sub-aba própria; OPs marcadas na Sequência com o grupo ACABAMENTO; conferido com
// a saída do PNP ACABAMENTO no KPI → Eficiência do acabamento). Na nuvem o do acabamento usa o id 'acab-AAAA-MM-DD' na mesma tabela.
const PLANO_CFG = {
    costura: { ls: 'planoCostura', pref: '', nome: 'costura', raiz: 'planoCosturaConteudo', data: 'planoCosturaData', aviso: 'planoCosturaAviso', contador: 'planoCosturaContador', status: 'planoCosturaStatusDia', lista: 'planoCosturaLista', conf: 'planoCosturaConferencia' },
    acabamento: { ls: 'planoAcabamento', pref: 'acab-', nome: 'acabamento', raiz: 'planoAcabConteudo', data: 'planoAcabData', aviso: 'planoAcabAviso', contador: 'planoAcabContador', status: 'planoAcabStatusDia', lista: 'planoAcabLista', conf: 'planoAcabConferencia' },
};
function cfgPlano(tipo) { return tipo === 'acabamento' ? PLANO_CFG.acabamento : PLANO_CFG.costura; }
function tipoPlanoDoGrupoSelecionado() { return ($('seqCostGrupo') && $('seqCostGrupo').value === 'ACABAMENTO') ? 'acabamento' : 'costura'; }
function obterPlanosCostura(tipo) { try { return JSON.parse(localStorage.getItem(cfgPlano(tipo).ls) || '{}'); } catch (e) { return {}; } }
function salvarPlanosCostura(o, tipo) { try { localStorage.setItem(cfgPlano(tipo).ls, JSON.stringify(o)); } catch (e) { showToast('<i class="fas fa-triangle-exclamation"></i> Não consegui salvar o plano (armazenamento cheio).', true, 6000); } }

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
async function publicarPlanoCosturaNuvem(dia, tipo) {
    if (!supabaseClient || !sessaoAdminAtual) return false;
    const plano = obterPlanosCostura(tipo)[dia]; if (!plano) return false;
    try {
        const por = String((sessaoAdminAtual.user && sessaoAdminAtual.user.email) || '').split('@')[0].toUpperCase();
        const { error } = await supabaseClient.from('plano_costura').upsert({ id: cfgPlano(tipo).pref + dia, dados: plano, atualizado_por: por, atualizado_em: new Date().toISOString() }, { onConflict: 'id' });
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
        for (const tipo of ['costura', 'acabamento']) {
            const pref = cfgPlano(tipo).pref;
            const doTipo = (linhas || []).filter(l => tipo === 'acabamento' ? String(l.id).startsWith('acab-') : !String(l.id).startsWith('acab-')).map(l => ({ ...l, dia: String(l.id).slice(pref.length) }));
            const locais = obterPlanosCostura(tipo); let mudou = false;
            doTipo.forEach(l => {
                if (!l.dados || !Array.isArray(l.dados.ops)) return;
                const local = locais[l.dia];
                if (!local || String(l.dados.salvoEm || '') > String(local.salvoEm || '')) { locais[l.dia] = l.dados; mudou = true; }   // vale o mais recente
            });
            const soLocais = Object.keys(locais).filter(d => !doTipo.some(l => l.dia === d));
            if (mudou) salvarPlanosCostura(locais, tipo);
            for (const d of soLocais) await publicarPlanoCosturaNuvem(d, tipo);
        }
        renderizarPlanoCostura();
    } catch (e) { registrarLogDebug('error', ['[PLANO COSTURA] falha ao carregar da nuvem: ' + e.message]); }
}

// ---- OPs disponíveis pra marcar: as que estão agora nos locais da Sequência (em andamento + aguardando), por grupo
function opsDisponiveisPlanoCostura(tipo) {
    if (tipo === 'acabamento') { const g = GRUPOS_SEQUENCIAMENTO_COSTURA.ACABAMENTO; return [{ chave: 'ACABAMENTO', rotulo: g.rotulo, ops: montarFilaSequenciamentoCostura('ACABAMENTO').map(o => ({ op: o.op, ciclo: o.ciclo || '', grupo: g.rotulo, local: o.situacaoCostura || '', qtd: Math.round(o.qtd || 0), desc: o.descRef || o.ref || '', fin: o.dataFinalizacao ? new Date(o.dataFinalizacao).toISOString() : '' })) }].filter(x => x.ops.length); }
    const FORA_DO_PLANO = ['ACABAMENTO', 'ENFESTO', 'ETIQUETACAO'];   // pedido do usuário: acabamento, enfesto e etiquetação não entram no plano da costura
    return Object.entries(GRUPOS_SEQUENCIAMENTO_COSTURA).filter(([chave]) => !FORA_DO_PLANO.includes(chave)).map(([chave, g]) => ({
        chave, rotulo: g.rotulo,
        ops: montarFilaSequenciamentoCostura(chave).map(o => ({ op: o.op, ciclo: o.ciclo || '', grupo: g.rotulo, local: o.situacaoCostura || '', qtd: Math.round(o.qtd || 0), desc: o.descRef || o.ref || '', fin: o.dataFinalizacao ? new Date(o.dataFinalizacao).toISOString() : '' })),
    })).filter(g => g.ops.length);
}

// ---- conferência
// Data de finalização: a salva no plano (do dia em que a OP foi marcada) + aviso se a da SEQUÊNCIA mudou depois.
function mapaFinAtualPlanoCostura(tipo) {
    const m = {}; try { opsDisponiveisPlanoCostura(tipo).forEach(g => g.ops.forEach(o => { m[chaveOPPlanoCostura(o)] = o.fin; })); } catch (e) { /* sem sequência carregada */ }
    return m;
}
function htmlFinalizacaoPlanoCostura(o, atuais) {
    const salva = formatarDataBR(o.fin) || '—';
    const k = chaveOPPlanoCostura(o), agora = atuais ? formatarDataBR(atuais[k]) : '';
    const mudou = o.fin && agora && agora !== salva;
    return `${salva}${mudou ? ` <span style="color:var(--cor-alerta); font-weight:700; font-size:10px;" title="A data de finalização dessa OP foi alterada na SEQUÊNCIA depois que você salvou o plano">→ agora ${agora}</span>` : ''}`;
}

function compararPlanoCostura(dia, tipo) {
    const plano = obterPlanosCostura(tipo)[dia]; if (!plano) return null;
    const dataConf = dia;   // conferido com a saída do PRÓPRIO dia do plano (antes era o próximo dia útil)
    const ef = (tipo === 'acabamento' ? obterEfAcab() : obterEficienciaCostura())[dataConf];
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

// ---- botão SALVAR NO PLANO (aba SEQUÊNCIA): grava de uma vez as OPs marcadas, no plano de HOJE (soma ao que já estava).
function opEstaNoPlanoCostura(op, ciclo, dia) {
    const k = montarChaveOP(ciclo, op);
    return ['costura', 'acabamento'].some(t => { const pl = obterPlanosCostura(t)[dia || hojeISOLocalPlanoCostura()]; return !!(pl && pl.ops.some(o => chaveOPPlanoCostura(o) === k)); });
}
function capacidadeAtualPlanoCostura() {
    const n = id => parseFloat(document.getElementById(id) && document.getElementById(id).value) || 0;
    return { pessoas: n('seqCostPessoas'), horas: n('seqCostHoras'), ef: n('seqCostEficiencia') };
}
function htmlCapacidadePlanoCostura(plano) {
    const c = plano && plano.cap; if (!c) return '';
    const fmt = v => Number(v).toLocaleString('pt-BR');
    return `<span title="Pessoas, horas por dia e eficiência usadas na SEQUÊNCIA quando o plano foi salvo">${fmt(c.pessoas)} pessoas · ${fmt(c.horas)}h/dia · <strong>${fmt(c.ef)}%</strong> de eficiência</span>`;
}
async function adicionarMarcadasAoPlanoCostura() {
    if (!exigirLogadoNaSequencia('montar o plano da costura')) return;
    const marcadas = [...document.querySelectorAll('.check-imprimir-seq:checked')].map(c => c.dataset.id);
    if (!marcadas.length) { showToast('<i class="fas fa-triangle-exclamation"></i> Marque na lista as OPs que quer salvar no plano.', true); return; }
    const tipo = tipoPlanoDoGrupoSelecionado();   // grupo ACABAMENTO selecionado na Sequência → vai pro plano do acabamento
    const nomePlano = tipo === 'acabamento' ? 'plano do acabamento' : 'plano de hoje';
    const dia = hojeISOLocalPlanoCostura();
    const planos = obterPlanosCostura(tipo);
    const atual = planos[dia] ? planos[dia].ops : [];
    const jaTem = new Set(atual.map(chaveOPPlanoCostura));
    const disponiveis = opsDisponiveisPlanoCostura(tipo).flatMap(g => g.ops);
    const novas = [];
    marcadas.forEach(id => {
        const [op, ciclo] = id.split('|');
        const k = montarChaveOP(ciclo, op);
        if (jaTem.has(k)) return;
        const item = disponiveis.find(o => chaveOPPlanoCostura(o) === k);
        if (item) { novas.push(item); jaTem.add(k); }
    });
    if (!novas.length) { showToast(`<i class="fas fa-circle-info"></i> Essas OPs já estão no ${nomePlano} (ou o grupo não entra no plano).`, false, 3000); return; }
    planos[dia] = { ops: [...atual, ...novas], salvoEm: new Date().toISOString(), cap: capacidadeAtualPlanoCostura() };   // pessoas/horas/eficiência usadas nesse dia
    salvarPlanosCostura(planos, tipo);
    document.querySelectorAll('.check-imprimir-seq:checked').forEach(c => { c.checked = false; });
    const tg = document.getElementById('checkTudoSeqCostura'); if (tg) tg.checked = false;
    renderizarPlanoCostura();
    showToast(`<i class="fas fa-clipboard-check"></i> ${novas.length} OP(s) salvas no ${nomePlano} (total ${planos[dia].ops.length} OPs, ${planos[dia].ops.reduce((t, o) => t + o.qtd, 0).toLocaleString('pt-BR')} peças).`, false, 3500);
    await publicarPlanoCosturaNuvem(dia, tipo);
}
async function tirarOPDoPlanoCostura(op, ciclo, tipo) {
    if (!exigirLogadoNaSequencia('montar o plano da costura')) return;
    const dia = hojeISOLocalPlanoCostura();
    const k = montarChaveOP(ciclo, op);
    const planos = obterPlanosCostura(tipo);
    const restantes = (planos[dia] ? planos[dia].ops : []).filter(o => chaveOPPlanoCostura(o) !== k);
    if (restantes.length) planos[dia] = { ...planos[dia], ops: restantes, salvoEm: new Date().toISOString() }; else delete planos[dia];
    salvarPlanosCostura(planos, tipo);
    renderizarPlanoCostura();
    showToast(`<i class="fas fa-clipboard-check"></i> OP ${op} saiu do ${tipo === 'acabamento' ? 'plano do acabamento' : 'plano de hoje'}.`, false, 2500);
    if (planos[dia]) await publicarPlanoCosturaNuvem(dia, tipo);
    else if (supabaseClient && sessaoAdminAtual) { try { await supabaseClient.from('plano_costura').delete().eq('id', cfgPlano(tipo).pref + dia); } catch (e) { /* ignora */ } }
}

// ---- tela
function renderizarPlanoCostura() { renderizarPlanoDoTipo('costura'); renderizarPlanoDoTipo('acabamento'); }
function renderizarPlanoDoTipo(tipo) {
    const C = cfgPlano(tipo), ehAcab = tipo === 'acabamento';
    const raiz = $(C.raiz); if (!raiz) return;
    const admin = !!(sessaoAdminAtual && (papelUsuarioAtual === 'admin' || papelUsuarioAtual === 'sequencia'));
    const fmt = v => Number(v).toLocaleString('pt-BR');
    const esc = t => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const dia = ($(C.data) && $(C.data).value) || hojeISOLocalPlanoCostura();
    if ($(C.data) && !$(C.data).value) $(C.data).value = dia;
    const plano = obterPlanosCostura(tipo)[dia];
    const atuais = mapaFinAtualPlanoCostura(tipo);
    $(C.aviso).innerHTML = ehAcab ? `<i class="fas fa-circle-info"></i> Para montar o plano do acabamento, vá na aba <strong>SEQUÊNCIA</strong>, escolha o grupo <strong>ACABAMENTO</strong>, marque as OPs e clique em <strong>SALVAR NO PLANO</strong> (salva no plano de hoje). O plano de <strong>${formatarChaveDataBR(dia)}</strong> será conferido com o que saiu do <strong>PNP ACABAMENTO</strong> <strong>nesse mesmo dia</strong>, quando você importar o relatório de movimentação em KPI → Eficiência do acabamento.` : `<i class="fas fa-circle-info"></i> Para montar o plano, marque as OPs na aba <strong>SEQUÊNCIA</strong> e clique em <strong>SALVAR NO PLANO</strong> (ao lado de IMPRIMIR; salva no plano de hoje). O plano de <strong>${formatarChaveDataBR(dia)}</strong> será conferido com o que saiu da costura <strong>nesse mesmo dia</strong>, quando você importar o relatório de movimentação em KPI → Eficiência da costura. Vale a saída completa ou parcial.`;
    $(C.contador).innerHTML = plano ? `<strong>${plano.ops.length}</strong> OP(s) · <strong>${fmt(plano.ops.reduce((t, o) => t + o.qtd, 0))}</strong> peças no plano` + (plano.cap ? ` · ${htmlCapacidadePlanoCostura(plano)}` : '') : '';
    $(C.status).innerHTML = '';
    if (!plano) {
        $(C.lista).innerHTML = `<div style="padding:16px; color:var(--texto-secundario); font-size:12px;">Nenhuma OP no plano desse dia. Vá na aba SEQUÊNCIA${ehAcab ? ', escolha o grupo ACABAMENTO,' : ''} e marque as OPs que você programou e clique em SALVAR NO PLANO.</div>`;
    } else {
        const grupos = {};
        plano.ops.forEach(o => { (grupos[o.grupo || 'Outros'] = grupos[o.grupo || 'Outros'] || []).push(o); });
        $(C.lista).innerHTML = Object.entries(grupos).map(([g, ops]) => `
            <div style="border:1px solid var(--borda-cor); border-radius:8px; margin-bottom:8px; background:var(--bg-painel);">
                <div style="padding:8px 12px; font-weight:700; font-size:13px;">${esc(g)} <span style="font-weight:400; font-size:11px; color:var(--texto-secundario);">${ops.length} OPs · ${fmt(ops.reduce((t, o) => t + o.qtd, 0))} peças</span></div>
                <div style="padding:0 12px 8px;">${ops.map(o => `<div style="display:flex; gap:10px; align-items:center; padding:4px 0; border-top:1px solid var(--borda-cor); font-size:12px;">
                    <strong style="min-width:70px;">${esc(o.op)}</strong><span style="color:var(--texto-secundario); min-width:70px;">ciclo ${esc(o.ciclo || '—')}</span>
                    <span style="min-width:150px; font-size:11px;" title="Data de finalização no dia em que a OP foi salva no plano">final.: ${htmlFinalizacaoPlanoCostura(o, atuais)}</span>
                    <span style="flex:1; color:var(--texto-secundario); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(String(o.desc).slice(0, 60))}</span>
                    <strong style="min-width:60px; text-align:right;">${fmt(o.qtd)}</strong>
                    ${admin && dia === hojeISOLocalPlanoCostura() ? `<button type="button" class="btn" style="padding:2px 8px; font-size:11px; margin:0; background:var(--bg-card); color:var(--texto-cor); border:1px solid var(--borda-cor);" onclick="tirarOPDoPlanoCostura('${esc(o.op)}', '${esc(o.ciclo || '')}', '${tipo}')" title="Tirar essa OP do plano"><i class="fas fa-xmark"></i> TIRAR</button>` : ''}</div>`).join('')}</div>
            </div>`).join('');
    }
    renderizarConferenciaPlanoCostura(tipo);
}
function renderizarConferenciaPlanoCostura(tipo) {
    const C = cfgPlano(tipo);
    const el = $(C.conf); if (!el) return;
    const fmt = v => Number(v).toLocaleString('pt-BR');
    const esc = t => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const dias = Object.keys(obterPlanosCostura(tipo)).sort().reverse().slice(0, 15);
    if (!dias.length) { el.innerHTML = '<div style="padding:16px; color:var(--texto-secundario); font-size:12px;">Ainda não há planos salvos. Marque as OPs acima e clique em SALVAR PLANO.</div>'; return; }
    const atuais = mapaFinAtualPlanoCostura(tipo);
    const sel = { completa: ['SAIU POR COMPLETO', 'var(--cor-despacho)'], parcial: ['SAIU PARCIAL', 'var(--cor-sugestao)'], nao: ['NÃO SAIU', 'var(--cor-alerta)'] };
    el.innerHTML = dias.map((d, i) => {
        const r = compararPlanoCostura(d, tipo);
        const cab = `<strong>${formatarChaveDataBR(d)}</strong> <span style="color:var(--texto-secundario); font-size:11px;">(${r.plano.ops.length} OPs, ${fmt(r.plano.ops.reduce((t, o) => t + o.qtd, 0))} peças${r.plano.cap ? ' · ' + htmlCapacidadePlanoCostura(r.plano) : ''})</span>`;
        if (r.estado !== 'conferido') {
            const msg = r.estado === 'aguardando' ? `aguardando o relatório de ${formatarChaveDataBR(r.dataConf)}` : `o relatório de ${formatarChaveDataBR(r.dataConf)} foi importado antes dessa versão (sem o detalhe por OP) — reimporte-o`;
            return `<div style="border:1px solid var(--borda-cor); border-radius:8px; padding:10px 12px; margin-bottom:8px; background:var(--bg-painel); font-size:12px;">${cab} <span class="pill" style="background:var(--borda-cor); color:var(--texto-cor); margin-left:8px;">${msg}</span></div>`;
        }
        const cor = r.pct >= 80 ? 'var(--cor-despacho)' : (r.pct >= 50 ? 'var(--cor-sugestao)' : 'var(--cor-alerta)');
        const linhas = r.itens.sort((a, b) => ({ nao: 0, parcial: 1, completa: 2 })[a.status] - ({ nao: 0, parcial: 1, completa: 2 })[b.status]).map(x => `<tr>
            <td style="white-space:nowrap;"><strong>${esc(x.op)}</strong> <span style="font-size:11px; color:var(--texto-secundario);">ciclo ${esc(x.ciclo || '—')}</span></td>
            <td style="font-size:11px; color:var(--texto-secundario);">${esc(x.grupo)} · ${esc(String(x.desc).slice(0, 40))}</td>
            <td style="white-space:nowrap; font-size:11px;">${htmlFinalizacaoPlanoCostura(x, atuais)}</td><td style="text-align:right;">${fmt(x.qtd)}</td><td style="text-align:right;">${fmt(x.saiu)}</td>
            <td><span style="color:${sel[x.status][1]}; font-weight:700; font-size:11px;">${sel[x.status][0]}</span>${x.status === 'parcial' ? ` <span style="font-size:11px; color:var(--texto-secundario);">faltam ${fmt(x.qtd - x.saiu)}</span>` : ''}</td></tr>`).join('');
        const extras = r.extras.length ? `<div style="font-size:11px; font-weight:700; color:var(--texto-secundario); margin:10px 0 4px;">SAÍRAM SEM ESTAR NO PLANO (${r.extras.length} OPs · ${fmt(r.pecasExtras)} peças)</div>
            <div style="font-size:12px; line-height:1.8;">${r.extras.slice(0, 40).map(x => `<span class="pill" style="background:var(--bg-card); border:1px solid var(--borda-cor); color:var(--texto-cor);">${esc(x.chave)} · ${fmt(x.saiu)}</span>`).join(' ')}${r.extras.length > 40 ? ' …' : ''}</div>` : '';
        return `<details ${i === 0 ? 'open' : ''} style="border:1px solid var(--borda-cor); border-left:4px solid ${cor}; border-radius:8px; padding:8px 12px; margin-bottom:8px; background:var(--bg-painel);">
            <summary style="cursor:pointer; font-size:12px; display:flex; gap:14px; flex-wrap:wrap; align-items:center;">${cab}
                ${r.plano.cap ? `<span style="color:var(--texto-secundario);">${htmlCapacidadePlanoCostura(r.plano)}</span>` : ''}
                <span>conferido com <strong>${formatarChaveDataBR(r.dataConf)}</strong></span>
                <span style="color:${cor}; font-weight:900; font-size:15px;">${r.pct}% cumprido</span>
                <span>${fmt(r.pecasCumpridas)} de ${fmt(r.pecasProgramadas)} peças</span>
                <span style="color:var(--cor-despacho);">${r.qtdCompletas} completas</span><span style="color:var(--cor-sugestao);">${r.qtdParciais} parciais</span><span style="color:var(--cor-alerta);">${r.qtdNao} não saíram</span></summary>
            <table class="tabela-dados" style="width:100%; margin-top:8px;"><thead><tr><th>OP</th><th>GRUPO / PRODUTO</th><th>FINALIZAÇÃO (SALVA)</th><th style="text-align:right;">PROGRAMADO</th><th style="text-align:right;">SAIU</th><th>SITUAÇÃO</th></tr></thead><tbody>${linhas}</tbody></table>${extras}
        </details>`;
    }).join('');
}

// Sub-abas COSTURA | ACABAMENTO da aba PLANO DA COSTURA
function abrirSubabaPlano(tipo) {
    const acab = tipo === 'acabamento';
    if ($('subaba-plano-costura')) $('subaba-plano-costura').style.display = acab ? 'none' : '';
    if ($('subaba-plano-acabamento')) $('subaba-plano-acabamento').style.display = acab ? '' : 'none';
    const ativo = (id, on, cor) => { const b = $(id); if (!b) return; b.style.background = on ? cor : 'var(--bg-card)'; b.style.color = on ? 'white' : 'var(--texto-cor)'; b.style.border = on ? 'none' : '1px solid var(--borda-cor)'; };
    ativo('btnSubPlanoCostura', !acab, 'var(--cor-sugestao)'); ativo('btnSubPlanoAcabamento', acab, '#5C4A35');
    renderizarPlanoCostura();
}

// ---- EXPORTAR EXCEL: planejado x realizado de todos os planos salvos (um tipo por vez: costura ou acabamento).
// Aba PLANEJADO x REALIZADO = uma linha por OP de cada dia (+ o que saiu sem estar no plano); aba RESUMO = uma linha por dia.
function montarPlanoXRealizado(tipo) {
    const dias = Object.keys(obterPlanosCostura(tipo)).sort();
    const resumo = [['DATA DO PLANO', 'OPs NO PLANO', 'PEÇAS PROGRAMADAS', 'PEÇAS QUE SAÍRAM (DO PLANO)', '% CUMPRIDO', 'OPs COMPLETAS', 'OPs PARCIAIS', 'OPs QUE NÃO SAÍRAM', 'OPs FORA DO PLANO', 'PEÇAS FORA DO PLANO', 'PESSOAS', 'HORAS/DIA', 'EFICIÊNCIA USADA (%)', 'SITUAÇÃO']];
    const detalhe = [['DATA DO PLANO', 'CICLO', 'OP', 'GRUPO', 'DESCRIÇÃO', 'FINALIZAÇÃO (SALVA)', 'PROGRAMADO', 'SAIU', 'FALTAM', '% DA OP', 'SITUAÇÃO']];
    const nomeSit = { completa: 'SAIU POR COMPLETO', parcial: 'SAIU PARCIAL', nao: 'NÃO SAIU' };
    dias.forEach(d => {
        const r = compararPlanoCostura(d, tipo), data = formatarChaveDataBR(d), cap = r.plano.cap || {};
        const prog = r.plano.ops.reduce((t, o) => t + o.qtd, 0);
        const comum = [cap.pessoas ?? '', cap.horas ?? '', cap.ef ?? ''];
        if (r.estado !== 'conferido') {
            const sit = r.estado === 'aguardando' ? 'AGUARDANDO RELATÓRIO' : 'RELATÓRIO SEM DETALHE POR OP (reimportar)';
            resumo.push([data, r.plano.ops.length, prog, '', '', '', '', '', '', '', ...comum, sit]);
            r.plano.ops.forEach(o => detalhe.push([data, o.ciclo || '', o.op, o.grupo || '', o.desc || '', formatarDataBR(o.fin) || '', o.qtd, '', '', '', sit]));
            return;
        }
        resumo.push([data, r.plano.ops.length, r.pecasProgramadas, r.pecasCumpridas, r.pct, r.qtdCompletas, r.qtdParciais, r.qtdNao, r.extras.length, r.pecasExtras, ...comum, 'CONFERIDO']);
        r.itens.forEach(x => detalhe.push([data, x.ciclo || '', x.op, x.grupo || '', x.desc || '', formatarDataBR(x.fin) || '', x.qtd, x.saiu, Math.max(0, x.qtd - x.saiu), x.qtd ? Math.round(Math.min(x.saiu, x.qtd) / x.qtd * 100) : 0, nomeSit[x.status]]));
        r.extras.forEach(x => { const sep = String(x.chave).split('-'); detalhe.push([data, sep.length > 1 ? sep[0] : '', sep.length > 1 ? sep.slice(1).join('-') : x.chave, '', '', '', 0, x.saiu, '', '', 'SAIU SEM ESTAR NO PLANO']); });
    });
    return { dias, resumo, detalhe };
}
function exportarPlanoXRealizadoExcel(tipo) {
    if (!exigirBibliotecaExcel()) return;
    const m = montarPlanoXRealizado(tipo);
    if (!m.dias.length) return alert('Ainda não há planos salvos pra exportar.');
    const wb = XLSX.utils.book_new();
    [['PLANEJADO x REALIZADO', m.detalhe, [14, 8, 10, 14, 40, 18, 12, 10, 10, 10, 26]], ['RESUMO POR DIA', m.resumo, [14, 12, 18, 22, 12, 14, 14, 18, 16, 18, 10, 10, 18, 26]]].forEach(([nome, linhas, larg]) => {
        const ws = XLSX.utils.aoa_to_sheet(linhas); ws['!cols'] = larg.map(w => ({ wch: w })); XLSX.utils.book_append_sheet(wb, ws, nome);
    });
    XLSX.writeFile(wb, `Plano_${cfgPlano(tipo).nome}_planejado_x_realizado_${hojeISOLocalPlanoCostura()}.xlsx`);
    showToast(`<i class="fas fa-file-excel"></i> Planejado x realizado do ${cfgPlano(tipo).nome} exportado (${m.dias.length} dia(s)).`);
}
