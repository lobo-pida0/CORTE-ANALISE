// =========================================================================
// 📊 PRODUÇÃO POR GRUPO — o que a COSTURA produziu, por grupo de produto (camisa polo 200, calça 233, bermuda 90...)
// Fonte: relatório de movimentação importado em KPI → Eficiência da costura (guarda os grupos de cada dia).
// Visões: dia, semana (seg a sex) e mês. Dias importados antes dessa versão não têm o detalhe por grupo (reimportar).
// =========================================================================
let visaoProducaoGrupo = 'mes';          // 'dia' | 'semana' | 'mes'
let ancoraProducaoGrupo = null;          // 'AAAA-MM-DD' (dia / qualquer dia da semana) ou 'AAAA-MM'

function isoLocalProdGrupo(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function diasPeriodoProducaoGrupo(visao, ancora) {
    const todos = Object.keys(obterEficienciaCostura()).sort();
    if (visao === 'dia') return [ancora];
    if (visao === 'mes') return todos.filter(d => d.slice(0, 7) === ancora.slice(0, 7));
    const d = new Date(ancora + 'T12:00:00'), dow = (d.getDay() + 6) % 7;   // semana de segunda a sexta
    return Array.from({ length: 5 }, (_, i) => { const x = new Date(d); x.setDate(d.getDate() - dow + i); return isoLocalProdGrupo(x); });
}
// Parte pura (testável): soma os grupos dos dias pedidos.
function somarGruposProducao(todos, dias) {
    const grupos = {}; let semDetalhe = 0, comDados = 0;
    dias.forEach(dia => {
        const d = todos[dia]; if (!d) return;
        comDados++;
        if (!d.grupos) { semDetalhe++; return; }
        Object.entries(d.grupos).forEach(([g, x]) => { const r = grupos[g] = grupos[g] || { p: 0, o: 0, porDia: {} }; r.p += x.p; r.o += x.o; r.porDia[dia] = x.p; });
    });
    return { grupos, semDetalhe, comDados };
}
function mudarPeriodoProducaoGrupo(delta) {
    if (visaoProducaoGrupo === 'mes') { const [a, m] = ancoraProducaoGrupo.slice(0, 7).split('-').map(Number); const d = new Date(a, m - 1 + delta, 1); ancoraProducaoGrupo = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }
    else { const d = new Date(ancoraProducaoGrupo + 'T12:00:00'); d.setDate(d.getDate() + delta * (visaoProducaoGrupo === 'semana' ? 7 : 1)); ancoraProducaoGrupo = isoLocalProdGrupo(d); }
    renderizarProducaoGrupo();
}
function renderizarProducaoGrupo() {
    const raiz = document.getElementById('producaoGrupoConteudo'); if (!raiz) return;
    const todos = obterEficienciaCostura(), diasImportados = Object.keys(todos).sort();
    const fmt = v => Math.round(v).toLocaleString('pt-BR'), esc = t => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;');
    if (!ancoraProducaoGrupo) ancoraProducaoGrupo = visaoProducaoGrupo === 'mes' ? (diasImportados.length ? diasImportados[diasImportados.length - 1].slice(0, 7) : isoLocalProdGrupo(new Date()).slice(0, 7)) : (diasImportados.length ? diasImportados[diasImportados.length - 1] : isoLocalProdGrupo(new Date()));
    const dias = diasPeriodoProducaoGrupo(visaoProducaoGrupo, visaoProducaoGrupo === 'mes' ? ancoraProducaoGrupo.slice(0, 7) : ancoraProducaoGrupo.slice(0, 10));
    const r = somarGruposProducao(todos, dias);
    const lista = Object.entries(r.grupos).map(([g, x]) => ({ g, ...x })).sort((a, b) => b.p - a.p);
    const total = lista.reduce((t, x) => t + x.p, 0), maior = lista.length ? lista[0].p : 0;
    const rotulo = visaoProducaoGrupo === 'dia' ? formatarChaveDataBR(dias[0]) : (visaoProducaoGrupo === 'semana' ? `${formatarChaveDataBR(dias[0]).slice(0, 5)} a ${formatarChaveDataBR(dias[4]).slice(0, 5)}` : rotuloMesKPI(ancoraProducaoGrupo.slice(0, 7)));
    const diasColuna = visaoProducaoGrupo === 'semana' ? dias : [];
    const nomeDia = ['SEG', 'TER', 'QUA', 'QUI', 'SEX'];
    const btn = (v, t) => `<button type="button" class="btn" data-visao="${v}" style="margin:0; ${visaoProducaoGrupo === v ? 'background:var(--cor-primaria); color:white;' : 'background:var(--bg-card); color:var(--texto-cor); border:1px solid var(--borda-cor);'}">${t}</button>`;
    const linhas = lista.map(x => `<tr><td><strong>${esc(x.g)}</strong></td>
        <td style="width:30%;"><div style="height:8px; border-radius:4px; background:var(--cor-primaria); width:${Math.max(3, Math.round(x.p / maior * 100))}%;"></div></td>
        <td class="num"><strong style="font-size:15px;">${fmt(x.p)}</strong></td><td class="num" style="color:var(--texto-secundario);">${Math.round(x.p / total * 100)}%</td><td class="num" style="color:var(--texto-secundario);">${fmt(x.o)}</td>
        ${diasColuna.map(d => `<td class="num" style="font-size:12px;">${x.porDia[d] ? fmt(x.porDia[d]) : ''}</td>`).join('')}</tr>`).join('');
    let corpo;
    if (!r.comDados) corpo = '<div style="padding:16px; color:var(--texto-secundario); font-size:12px;">Nenhum dia da costura importado nesse período (KPI → Eficiência da costura → importar a movimentação).</div>';
    else if (!lista.length) corpo = '<div style="padding:16px; color:var(--cor-alerta); font-size:12px;">Os dias desse período foram importados antes do detalhe por grupo existir — reimporte o relatório de movimentação deles para ver os grupos.</div>';
    else corpo = `<div style="overflow:auto;"><table class="tabela-dados" style="width:100%;"><thead><tr><th>GRUPO</th><th></th><th class="num">PEÇAS</th><th class="num">%</th><th class="num">OPs</th>${diasColuna.map((d, i) => `<th class="num">${nomeDia[i]} ${formatarChaveDataBR(d).slice(0, 5)}</th>`).join('')}</tr></thead><tbody>${linhas}
        <tr style="background:var(--bg-card); font-weight:900;"><td>TOTAL</td><td></td><td class="num">${fmt(total)}</td><td class="num">100%</td><td></td>${diasColuna.map(d => `<td class="num">${fmt(lista.reduce((t, x) => t + (x.porDia[d] || 0), 0))}</td>`).join('')}</tr></tbody></table></div>`;
    const aviso = r.semDetalhe && lista.length ? `<div style="padding:8px 16px; font-size:11px; color:var(--cor-alerta);">${r.semDetalhe} dia(s) do período foram importados antes do detalhe por grupo e não entram na soma — reimporte o relatório deles.</div>` : '';
    raiz.innerHTML = `<div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap; padding:12px 16px; background:var(--bg-painel);">
        ${btn('dia', 'DIA')}${btn('semana', 'SEMANA')}${btn('mes', 'MÊS')}
        <button type="button" class="btn" id="btnPeriodoAnteriorProdGrupo" style="margin:0 0 0 12px; background:var(--bg-card); color:var(--texto-cor); border:1px solid var(--borda-cor);"><i class="fas fa-chevron-left"></i></button>
        <strong style="min-width:150px; text-align:center;">${esc(rotulo)}</strong>
        <button type="button" class="btn" id="btnPeriodoProximoProdGrupo" style="margin:0; background:var(--bg-card); color:var(--texto-cor); border:1px solid var(--borda-cor);"><i class="fas fa-chevron-right"></i></button>
        <span style="margin-left:auto; font-size:13px;">Total: <strong style="font-size:18px;">${fmt(total)}</strong> peças</span></div>${aviso}${corpo}
        <div style="padding:8px 16px; font-size:11px; color:var(--texto-secundario);">Peças que a costura movimentou (relatório de movimentação), agrupadas pelo produto da OP. Fonte: KPI → Eficiência da costura.</div>`;
    raiz.querySelectorAll('[data-visao]').forEach(b => b.onclick = () => { visaoProducaoGrupo = b.dataset.visao; ancoraProducaoGrupo = null; renderizarProducaoGrupo(); });
    const a = document.getElementById('btnPeriodoAnteriorProdGrupo'), p = document.getElementById('btnPeriodoProximoProdGrupo');
    if (a) a.onclick = () => mudarPeriodoProducaoGrupo(-1); if (p) p.onclick = () => mudarPeriodoProducaoGrupo(1);
}
