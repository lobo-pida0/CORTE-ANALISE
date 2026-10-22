// =========================================================================
// ✂️ META DE CORTE — PALETÓ / BLAZER (aba URGÊNCIAS reaproveitada)
// Meta semanal (padrão 400 peças, segunda a sexta). "Cortado" = saída do setor CORTE no KPI
// (grupo PALETÓ / BLAZER), em peças reais (o KPI conta por camada, aqui divide de volta).
// Se faltar peça para a meta, sugere as OPs de paletó/blazer: etapa mais perto do corte primeiro e, no empate, a mais antiga.
// =========================================================================
const GRUPO_META_CORTE = 'PALETÓ / BLAZER';
let semanaMetaCorteOffset = 0;   // 0 = semana atual, -1 = anterior...

function obterMetaCorteSemana() { const v = parseFloat(localStorage.getItem('metaCorteBlazerSemana')); return v > 0 ? v : 400; }
function dataISOLocalMetaCorte(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function diasDaSemanaMetaCorte(offset) {
    const h = new Date(); h.setHours(12, 0, 0, 0);
    const dow = (h.getDay() + 6) % 7;   // segunda = 0
    const seg = new Date(h); seg.setDate(h.getDate() - dow + (offset || 0) * 7);
    return Array.from({ length: 5 }, (_, i) => { const d = new Date(seg); d.setDate(seg.getDate() + i); return dataISOLocalMetaCorte(d); });
}
// Quanto foi cortado de paletó/blazer em cada dia (peças reais) + por OP.
function calcularCortadoMetaCorte(dias) {
    const movs = obterMovimentacoesPorSetor('fabrica')['CORTE'] || {};
    const porDia = Object.fromEntries(dias.map(d => [d, 0])), porOP = {};
    Object.entries(movs).forEach(([chave, m]) => {
        const dia = chave.split('|')[1];
        if (!(dia in porDia) || grupoProdutoKPI(m.ds) !== GRUPO_META_CORTE) return;
        const q = (m.qtd || 0) / (multiplicadorDeCamadas(m.ds) || 1);
        porDia[dia] += q;
        const k = idOPKPI(m); porOP[k] = porOP[k] || { chave: k, desc: m.ds || '', total: 0, dias: {} };
        porOP[k].total += q; porOP[k].dias[dia] = (porOP[k].dias[dia] || 0) + q;
    });
    return { porDia, porOP, total: Object.values(porDia).reduce((t, v) => t + v, 0) };
}
// OPs de paletó/blazer ainda na fábrica, ordenadas: etapa mais avançada primeiro, depois a mais antiga.
function sugerirOPsMetaCorte() {
    const antiguidade = o => o.dataInclusao ? new Date(o.dataInclusao).getTime() : Infinity;
    return (bancoDadosOPs || []).filter(o => grupoProdutoKPI(o.desc) === GRUPO_META_CORTE && (parseInt(o.qtd) || 0) > 0)
        .sort((a, b) => (b.etapa - a.etapa) || (antiguidade(a) - antiguidade(b)) || ((b.diasLocal || 0) - (a.diasLocal || 0)));
}
function renderizarMetaCorte() {
    const raiz = document.getElementById('metaCorteConteudo'); if (!raiz) return;
    const fmt = v => Math.round(v).toLocaleString('pt-BR');
    const esc = t => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const meta = obterMetaCorteSemana(), dias = diasDaSemanaMetaCorte(semanaMetaCorteOffset), hoje = dataISOLocalMetaCorte(new Date());
    const c = calcularCortadoMetaCorte(dias), falta = Math.max(0, meta - c.total), pct = Math.min(100, Math.round(c.total / meta * 100));
    const nomeDia = ['SEG', 'TER', 'QUA', 'QUI', 'SEX'];
    const cor = pct >= 100 ? 'var(--cor-despacho)' : (pct >= 50 ? 'var(--cor-sugestao)' : 'var(--cor-alerta)');
    const semanaAtual = semanaMetaCorteOffset === 0;
    let acum = 0;
    const linhasDia = dias.map((d, i) => {
        const q = c.porDia[d]; acum += q;
        let sit;
        if (d > hoje) sit = '<span style="color:var(--texto-secundario);">—</span>';
        else if (q > 0) sit = '<span style="color:var(--cor-despacho); font-weight:700;">CORTOU</span>';
        else sit = d === hoje ? '<span style="color:var(--cor-sugestao); font-weight:700;">AINDA NÃO CORTOU</span>' : '<span style="color:var(--cor-alerta); font-weight:700;">NÃO CORTOU</span>';
        return `<tr${d === hoje ? ' style="background:var(--bg-card);"' : ''}><td><strong>${nomeDia[i]}</strong> ${formatarChaveDataBR(d).slice(0, 5)}</td><td class="num">${d > hoje ? '—' : fmt(q)}</td><td class="num">${d > hoje ? '—' : fmt(acum)}</td><td>${sit}</td></tr>`;
    }).join('');
    const ops = Object.values(c.porOP).sort((a, b) => b.total - a.total);
    const linhasOPs = ops.length ? ops.map(o => `<tr><td><strong>${esc(o.chave)}</strong></td><td style="font-size:11px; color:var(--texto-secundario);">${esc(String(o.desc).slice(0, 55))}</td>${dias.map(d => `<td class="num">${o.dias[d] ? fmt(o.dias[d]) : ''}</td>`).join('')}<td class="num"><strong>${fmt(o.total)}</strong></td></tr>`).join('')
        : `<tr><td colspan="8" style="color:var(--texto-secundario); padding:10px;">Nenhum paletó/blazer saiu do CORTE nessa semana (nos relatórios importados no KPI).</td></tr>`;
    // sugestão
    let sugestao = '';
    if (falta > 0 && semanaAtual) {
        const lista = sugerirOPsMetaCorte(); let soma = 0, fechou = false;
        const jaCortadas = new Set(Object.keys(c.porOP));
        const linhas = lista.map((o, i) => {
            const q = parseInt(o.qtd) || 0; const pegar = !fechou; soma += pegar ? q : 0; if (pegar && soma >= falta) fechou = true;
            return `<tr style="${pegar ? '' : 'opacity:0.55;'}"><td class="num">${i + 1}</td><td><strong>${esc(o.id)}</strong>${o.ciclo ? ' · ' + esc(o.ciclo) : ''}${jaCortadas.has(`${o.ciclo}-${o.id}`) ? ' <span class="pill" style="background:var(--cor-sugestao); color:white;">já cortou parte</span>' : ''}</td><td style="font-size:11px; color:var(--texto-secundario);">${esc(String(o.desc).slice(0, 55))}</td><td>${esc(nomesEtapas[o.etapa] || '')}</td><td class="num">${fmt(q)}</td><td>${o.dataInclusao ? formatarDataBR(o.dataInclusao) : '—'}</td><td class="num">${o.diasLocal || 0}d</td><td>${pegar ? '<span class="pill" style="background:var(--cor-despacho); color:white;">PEGAR</span>' : ''}</td></tr>`;
        }).join('');
        sugestao = `<div class="secao" style="margin-top:12px;"><div class="secao-header" style="background:var(--cor-fila);"><span><i class="fas fa-scissors"></i> O QUE CORTAR PARA FECHAR A META — faltam ${fmt(falta)} peças</span><span>${lista.length} OP(s) de paletó/blazer na fábrica</span></div>
            <div class="secao-corpo" style="padding:0; overflow:auto; max-height:420px;">${lista.length ? `<table class="tabela-dados" style="width:100%;"><thead><tr><th class="num">#</th><th>OP</th><th>DESCRIÇÃO</th><th>ETAPA</th><th class="num">PEÇAS</th><th>INCLUSÃO</th><th class="num">NO LOCAL</th><th></th></tr></thead><tbody>${linhas}</tbody></table>` : '<div style="padding:14px; color:var(--texto-secundario); font-size:12px;">Nenhuma OP de paletó/blazer na fábrica (sincronize a planilha).</div>'}</div>
            <div style="padding:8px 14px; font-size:11px; color:var(--texto-secundario);">Ordem: etapa mais perto do corte primeiro; no empate, a OP mais antiga (data de inclusão). "PEGAR" marca as OPs necessárias para cobrir o que falta.</div></div>`;
    }
    const sem = `${formatarChaveDataBR(dias[0]).slice(0, 5)} a ${formatarChaveDataBR(dias[4]).slice(0, 5)}`;
    raiz.innerHTML = `
        <div style="display:flex; gap:16px; align-items:center; flex-wrap:wrap; padding:12px 16px; background:var(--bg-painel); border-radius:8px; margin-bottom:12px;">
            <button type="button" class="btn" id="btnSemanaAnteriorMetaCorte" style="margin:0; background:var(--bg-card); color:var(--texto-cor); border:1px solid var(--borda-cor);"><i class="fas fa-chevron-left"></i></button>
            <strong>${semanaAtual ? 'Semana atual' : 'Semana'} · ${sem}</strong>
            <button type="button" class="btn" id="btnSemanaProximaMetaCorte" style="margin:0; background:var(--bg-card); color:var(--texto-cor); border:1px solid var(--borda-cor);" ${semanaAtual ? 'disabled' : ''}><i class="fas fa-chevron-right"></i></button>
            <span style="margin-left:auto; display:flex; align-items:center; gap:6px; font-size:12px;">META DA SEMANA <input type="number" id="inputMetaCorteSemana" min="1" step="10" value="${meta}" style="width:80px;" ${(sessaoAdminAtual && papelUsuarioAtual === 'admin') ? '' : 'disabled'}> peças</span>
        </div>
        <div style="padding:14px 16px; background:var(--bg-painel); border-left:5px solid ${cor}; border-radius:8px; margin-bottom:12px;">
            <div style="display:flex; align-items:baseline; gap:12px; flex-wrap:wrap;"><span style="font-size:30px; font-weight:900; color:${cor};">${fmt(c.total)}</span><span style="font-size:14px;">de ${fmt(meta)} peças de paletó/blazer cortadas · <strong style="color:${cor};">${pct}%</strong></span>
                <span style="font-size:13px; font-weight:700; color:${falta > 0 ? 'var(--cor-alerta)' : 'var(--cor-despacho)'};">${falta > 0 ? `faltam ${fmt(falta)}` : 'META BATIDA'}</span></div>
            <div style="height:10px; background:var(--borda-cor); border-radius:5px; overflow:hidden; margin-top:8px;"><div style="width:${pct}%; height:100%; background:${cor};"></div></div>
        </div>
        <div style="display:grid; grid-template-columns:minmax(260px, 1fr) minmax(0, 2fr); gap:12px; align-items:start;">
            <table class="tabela-dados" style="width:100%;"><thead><tr><th>DIA</th><th class="num">CORTADO</th><th class="num">ACUMULADO</th><th>SITUAÇÃO</th></tr></thead><tbody>${linhasDia}</tbody></table>
            <div style="overflow:auto;"><table class="tabela-dados" style="width:100%;"><thead><tr><th>OP CORTADA</th><th>DESCRIÇÃO</th>${nomeDia.map(n => `<th class="num">${n}</th>`).join('')}<th class="num">TOTAL</th></tr></thead><tbody>${linhasOPs}</tbody></table></div>
        </div>
        ${sugestao}
        <div style="font-size:11px; color:var(--texto-secundario); margin-top:8px;">Cortado = saída do setor CORTE (fábrica) no KPI, em peças reais (o KPI conta paletó/blazer ×3 por camada). Atualiza quando você importa o relatório de movimentação.</div>`;
    const bind = (id, fn) => { const e = document.getElementById(id); if (e) e.onclick = fn; };
    bind('btnSemanaAnteriorMetaCorte', () => { semanaMetaCorteOffset--; renderizarMetaCorte(); });
    bind('btnSemanaProximaMetaCorte', () => { if (semanaMetaCorteOffset < 0) { semanaMetaCorteOffset++; renderizarMetaCorte(); } });
    const inp = document.getElementById('inputMetaCorteSemana');
    if (inp) inp.onchange = () => { const v = parseFloat(inp.value); if (v > 0) { try { localStorage.setItem('metaCorteBlazerSemana', String(v)); } catch (e) { /* ignora */ } } renderizarMetaCorte(); };
}
