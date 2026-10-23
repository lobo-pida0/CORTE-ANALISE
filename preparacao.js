// =========================================================================
// 🧰 PREPARAÇÃO — fila das OPs entre o Corte e a Costura, em 5 grupos, cada um com suas "janelas" (um local por janela).
// Fonte: planilha POR_OP (colunas OP, Ciclo, Descrição Local, Qt OP Local, Data Finalização...). Só as OPs desses locais
// são guardadas. Ordem em cada janela: finalização mais próxima primeiro, depois quem está há mais dias no local.
// A pessoa marca as OPs do dia e clica em SALVAR NO PLANO (plano do dia, guardado por data).
// Para mudar o que entra em cada grupo/janela, é só editar GRUPOS_PREPARACAO.
// =========================================================================
const GRUPOS_PREPARACAO = [
    { chave: 'SUP', rotulo: 'Preparação parte superior', janelas: [
        { local: 'PNP PREP PARTES SUP', rotulo: 'Partes superiores' }, { local: 'PNP PREP GOLA E PUNHO', rotulo: 'Gola e punho' }] },
    { chave: 'INF', rotulo: 'Preparação parte inferior', janelas: [{ local: 'PNP PREP PARTES INF', rotulo: 'Partes inferiores' }] },
    { chave: 'LOGO', rotulo: 'Fusionadeira / logo / silk / bordado', janelas: [
        { local: 'PNP FUSIONADEIRA LOGO', rotulo: 'Fusionadeira logo' }, { local: 'PNP INSPECAO LOGO/MARCA INDIRETO', rotulo: 'Inspeção logo/marca' },
        { local: 'PNP SILK INTERNO', rotulo: 'Silk' }, { local: 'PNP BORDADO INTERNO', rotulo: 'Bordado' },
        { local: 'PNP AGUARD DEFINICAO SILK', rotulo: 'Aguardando definição de silk' }, { local: 'PNP AGUARD DEFINICAO BORDADO', rotulo: 'Aguardando definição de bordado' }] },
    { chave: 'UNIR', rotulo: 'Separar peças / unir corpo', janelas: [{ local: 'PNP SEPARAR PECAS / UNIR CORPO E PTS', rotulo: 'Separar peças / unir corpo' }] },
    { chave: 'DIST', rotulo: 'Distribuição', janelas: [
        { local: 'PNP AGUARD BIP DISTRIBUICAO', rotulo: 'Aguardando bipagem' }, { local: 'PNP DISTRIBUICAO INT', rotulo: 'Distribuição interna' }] },
];
const normLocalPrep = t => String(t == null ? '' : t).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
const LOCAIS_PREPARACAO = new Set(GRUPOS_PREPARACAO.flatMap(g => g.janelas.map(j => normLocalPrep(j.local))));
const escPrep = t => String(t == null ? '' : t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const isoLocalPrep = d => d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : null;

function obterOPsPreparacao() { try { return JSON.parse(localStorage.getItem('porOPPreparacao') || '[]'); } catch (e) { return []; } }
function obterPlanosPreparacao() { try { return JSON.parse(localStorage.getItem('planoPreparacao') || '{}') || {}; } catch (e) { return {}; } }
function salvarPlanosPreparacao(p) { try { localStorage.setItem('planoPreparacao', JSON.stringify(p)); } catch (e) { /* ignora */ } }
function hojePreparacao() { return isoLocalPrep(new Date()); }
const chaveOPPrep = o => `${o.ciclo || ''}-${o.op}`;

// Parte pura (testável): linhas da planilha → OPs nos locais da preparação.
function extrairOPsPreparacaoDasLinhas(rows) {
    const semAc = normLocalPrep;
    const iCab = [0, 1, 2, 3].find(i => rows[i] && rows[i].some(c => semAc(c) === 'OP'));
    if (iCab === undefined) throw new Error('Não achei a linha de títulos (coluna OP).');
    const cab = rows[iCab].map(semAc), f = fn => cab.findIndex(fn);
    const ix = {
        local: f(c => c === 'DESCRICAO LOCAL' || (c.startsWith('DESCRI') && c.endsWith(' LOCAL') && !c.includes('REFER'))), op: f(c => c === 'OP'), ciclo: f(c => c === 'CICLO'), ref: f(c => c.startsWith('REFERENCIA') && !c.includes('DESCRICAO')),
        descRef: f(c => c.includes('DESCRICAO') && c.includes('REFER')), cor: f(c => c === 'COR'), qtd: f(c => c.startsWith('QT') && c.includes('LOCAL')),
        tipo: f(c => c.includes('TIPO') && c.includes('PRODUTO')), dataFin: f(c => c.includes('DATA') && c.includes('FINALIZ')), dias: f(c => c === 'DIAS LOCAL'),
    };
    if (ix.local === -1 || ix.op === -1) throw new Error('Faltam as colunas "Descrição Local" e/ou "OP".');
    const lista = [];
    for (let i = iCab + 1; i < rows.length; i++) {
        const r = rows[i]; if (!r || r[ix.op] === undefined || r[ix.op] === null || r[ix.op] === '') continue;
        const local = normLocalPrep(r[ix.local]); if (!LOCAIS_PREPARACAO.has(local)) continue;
        lista.push({
            op: String(r[ix.op]).trim(), ciclo: ix.ciclo !== -1 && r[ix.ciclo] != null ? String(r[ix.ciclo]).trim() : '', local,
            ref: ix.ref !== -1 && r[ix.ref] ? String(r[ix.ref]).trim().toUpperCase() : '', descRef: ix.descRef !== -1 ? String(r[ix.descRef] || '').trim() : '',
            cor: ix.cor !== -1 && r[ix.cor] ? String(r[ix.cor]).trim().toUpperCase() : '', qtd: ix.qtd !== -1 ? (parseFloat(r[ix.qtd]) || 0) : 0,
            tipo: ix.tipo !== -1 ? semAc(r[ix.tipo]) : '', fin: ix.dataFin !== -1 ? isoLocalPrep(extrairDataExcel(r[ix.dataFin])) : null,
            dias: ix.dias !== -1 && r[ix.dias] !== '' && r[ix.dias] != null ? (parseInt(r[ix.dias]) || 0) : null,
        });
    }
    return lista;
}

function processarPorOPPreparacao() {
    if (!exigirAdminOuUsuario('importar a planilha da preparação')) return;
    if (!exigirBibliotecaExcel()) return;
    const input = $('inputPorOPPreparacao'); if (!input.files[0]) return;
    const r = new FileReader();
    r.onload = e => {
        try {
            const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
            const lista = extrairOPsPreparacaoDasLinhas(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 }));
            if (!lista.length) throw new Error('Nenhuma OP nos locais da preparação foi encontrada.');
            localStorage.setItem('porOPPreparacao', JSON.stringify(lista));
            localStorage.setItem('porOPPreparacaoEm', new Date().toISOString());
            input.value = ''; renderizarPreparacao();
            showToast(`<i class="fas fa-check-double"></i> ${lista.length} OPs da preparação importadas!`);
        } catch (err) { alert('❌ Não foi possível processar a planilha.\n\n' + err.message); input.value = ''; }
    };
    r.readAsArrayBuffer(input.files[0]);
}

function ordenarPreparacao(a, b) {
    if (!!a.fin !== !!b.fin) return a.fin ? -1 : 1;
    if (a.fin !== b.fin) return a.fin < b.fin ? -1 : 1;
    return (b.dias || 0) - (a.dias || 0);
}
const dataBRPrep = iso => iso ? iso.split('-').reverse().join('/') : '—';

function renderizarPreparacao() {
    const alvo = $('preparacaoConteudo'); if (!alvo) return;
    const ops = obterOPsPreparacao(), planos = obterPlanosPreparacao(), hoje = hojePreparacao();
    const plano = planos[hoje] ? planos[hoje].ops : [], noPlano = new Set(plano.map(chaveOPPrep));
    const em = localStorage.getItem('porOPPreparacaoEm');
    const info = $('preparacaoInfo'); if (info) info.innerText = em ? `Planilha importada em ${new Date(em).toLocaleString('pt-BR')} · ${ops.length} OPs` : 'Nenhuma planilha importada ainda.';
    if (!ops.length) { alvo.innerHTML = '<div style="padding:30px; text-align:center; color:var(--texto-secundario);">Importe a planilha POR_OP para ver as OPs da preparação.</div>'; return; }

    const htmlPlano = plano.length ? `<div class="secao" style="margin-bottom:12px;"><div class="secao-header" style="background:var(--cor-despacho);"><span><i class="fas fa-clipboard-check"></i> PLANO DE HOJE (${dataBRPrep(hoje)})</span><span>${plano.length} OP(s) · ${plano.reduce((t, o) => t + (o.qtd || 0), 0).toLocaleString('pt-BR')} peças</span></div>
        <div class="secao-corpo" style="padding:0;"><table class="tabela-dados"><tbody>${plano.map(o => `<tr><td><strong>${escPrep(o.op)}</strong></td><td>ciclo ${escPrep(o.ciclo)}</td><td>${escPrep(o.grupoRotulo)} · ${escPrep(o.janelaRotulo)}</td><td>${escPrep(o.descRef)}</td><td>final.: ${dataBRPrep(o.fin)}</td><td style="text-align:right;">${o.qtd}</td><td><button class="btn btn-perigo" style="padding:2px 8px;" onclick="tirarOPDoPlanoPreparacao('${escPrep(chaveOPPrep(o))}')" title="Tirar do plano"><i class="fas fa-xmark"></i></button></td></tr>`).join('')}</tbody></table></div></div>` : '';

    const htmlGrupos = GRUPOS_PREPARACAO.map(g => {
        const janelas = g.janelas.map(j => {
            const lista = ops.filter(o => o.local === normLocalPrep(j.local)).sort(ordenarPreparacao);
            const pecas = lista.reduce((t, o) => t + (o.qtd || 0), 0);
            const linhas = lista.map(o => `<tr${noPlano.has(chaveOPPrep(o)) ? ' style="opacity:.55;"' : ''}>
                <td><input type="checkbox" class="check-prep" data-chave="${escPrep(chaveOPPrep(o))}" ${noPlano.has(chaveOPPrep(o)) ? 'checked disabled' : ''}></td>
                <td><strong>${escPrep(o.op)}</strong></td><td>${escPrep(o.ciclo)}</td><td>${escPrep(o.descRef)} <span style="color:var(--texto-secundario);">${escPrep(o.ref)}</span></td>
                <td style="white-space:nowrap;">${dataBRPrep(o.fin)}</td><td style="text-align:right;">${o.dias == null ? '—' : o.dias + 'd'}</td><td style="text-align:right; font-weight:bold;">${o.qtd}</td></tr>`).join('');
            return `<div style="flex:1; min-width:360px; border:1px solid var(--borda-cor); border-radius:6px; overflow:hidden;">
                <div style="padding:6px 10px; background:rgba(128,128,128,.12); display:flex; justify-content:space-between; font-size:12px;"><strong>${escPrep(j.rotulo)}</strong><span>${lista.length} OP(s) · ${pecas.toLocaleString('pt-BR')} peças</span></div>
                ${lista.length ? `<div style="max-height:340px; overflow:auto;"><table class="tabela-dados"><thead><tr><th></th><th>OP</th><th>Ciclo</th><th>Produto</th><th>Final.</th><th>No local</th><th style="text-align:right;">Qtd</th></tr></thead><tbody>${linhas}</tbody></table></div>` : '<div style="padding:14px; text-align:center; color:var(--texto-secundario); font-size:12px;">Nenhuma OP neste local.</div>'}</div>`;
        }).join('');
        const todas = ops.filter(o => g.janelas.some(j => normLocalPrep(j.local) === o.local));
        return `<div class="secao" style="margin-bottom:12px;"><div class="secao-header" style="background:var(--cor-primaria);"><span><i class="fas fa-layer-group"></i> ${escPrep(g.rotulo)}</span><span>${todas.length} OP(s) · ${todas.reduce((t, o) => t + (o.qtd || 0), 0).toLocaleString('pt-BR')} peças</span></div>
            <div class="secao-corpo" style="display:flex; gap:10px; flex-wrap:wrap;">${janelas}</div></div>`;
    }).join('');
    alvo.innerHTML = htmlPlano + htmlGrupos;
}

function salvarMarcadasNoPlanoPreparacao() {
    if (!exigirAdminOuUsuario('salvar o plano da preparação')) return;
    const marcadas = new Set(Array.from(document.querySelectorAll('.check-prep:checked:not(:disabled)')).map(c => c.dataset.chave));
    if (!marcadas.size) return showToast('Marque as OPs que quer salvar no plano.', true);
    const planos = obterPlanosPreparacao(), hoje = hojePreparacao(), plano = planos[hoje] || { ops: [] };
    const jaTem = new Set(plano.ops.map(chaveOPPrep));
    obterOPsPreparacao().forEach(o => {
        if (!marcadas.has(chaveOPPrep(o)) || jaTem.has(chaveOPPrep(o))) return;
        const g = GRUPOS_PREPARACAO.find(x => x.janelas.some(j => normLocalPrep(j.local) === o.local)), j = g.janelas.find(x => normLocalPrep(x.local) === o.local);
        plano.ops.push({ op: o.op, ciclo: o.ciclo, qtd: o.qtd, fin: o.fin, descRef: o.descRef, local: o.local, grupo: g.chave, grupoRotulo: g.rotulo, janelaRotulo: j.rotulo });
    });
    planos[hoje] = plano; salvarPlanosPreparacao(planos);
    renderizarPreparacao(); showToast(`<i class="fas fa-check"></i> ${marcadas.size} OP(s) salvas no plano de hoje.`);
}
function tirarOPDoPlanoPreparacao(chave) {
    if (!exigirAdminOuUsuario('alterar o plano da preparação')) return;
    const planos = obterPlanosPreparacao(), hoje = hojePreparacao();
    if (planos[hoje]) { planos[hoje].ops = planos[hoje].ops.filter(o => chaveOPPrep(o) !== chave); if (!planos[hoje].ops.length) delete planos[hoje]; }
    salvarPlanosPreparacao(planos); renderizarPreparacao();
}
