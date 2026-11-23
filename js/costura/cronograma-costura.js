// -------------------------------------------------------------------------
// (separado de producao-tempos.js) Cronograma da Sequência da costura: tempo por OP, dias úteis, atrasos e a tabela da sequência.
// -------------------------------------------------------------------------
function tempoCosturaOP(op) {
    const valor = op[op.campoTempo || 'minutosCostura'];
    return (valor !== null && valor !== undefined && !isNaN(valor)) ? valor : null;
}

// Percorre a fila NA ORDEM (prioridade já aplicada em montarFilaSequenciamentoCostura)
// e marca cada OP como "cabe hoje" ou não, respeitando a ordem estritamente
// — uma vez que uma OP não cabe mais no tempo disponível, as que vêm depois
// dela na fila também não contam como "hoje", mesmo que sejam menores
// (não pula a fila, só porque uma OP menor caberia).
// Avança pro próximo dia ÚTIL (pula sábado/domingo — confirmado com o
// usuário, a fábrica não costura nesses dias — e também pula qualquer
// data cadastrada em obterFeriados()).
function proximoDiaUtilCostura(data, feriados) {
    const feriadosSet = feriados || new Set(obterFeriados());
    const nova = new Date(data);
    do { nova.setDate(nova.getDate() + 1); } while (!ehDiaDeTrabalhoCostura(nova, feriadosSet));
    return nova;
}

// Em vez de um "cabe ou não cabe hoje" binário, monta um CRONOGRAMA de
// verdade: percorre a fila NA ORDEM e vai "gastando" os minutos
// disponíveis por dia — quando uma OP não termina de cair no dia, o resto
// dela continua no próximo dia útil (sem deixar o pessoal "parado" depois
// que uma OP grande não coube inteira num dia só, como o usuário
// descreveu). Cada OP recebe uma data de início e uma de término.
// Avança dia por dia (não "pula N dias" com uma conta pronta) de propósito
// — com feriados misturados no meio, dias diferentes podem valer 0 ou o
// valor cheio, então só dá pra saber certo andando um de cada vez.
function calcularCronogramaCostura(fila, minutosDisponiveisPorDia) {
    const feriados = new Set(obterFeriados());
    let diaAtual = new Date(); diaAtual.setHours(0, 0, 0, 0);
    while (!ehDiaDeTrabalhoCostura(diaAtual, feriados)) {
        diaAtual = proximoDiaUtilCostura(diaAtual, feriados);
    }
    let minutosUsadosHoje = 0;

    return fila.map(op => {
        const tempo = tempoCosturaOP(op);
        if (tempo === null || minutosDisponiveisPorDia <= 0) {
            return { ...op, tempoCostura: tempo, dataInicioProducao: null, dataTerminoProducao: null };
        }

        const dataInicioProducao = new Date(diaAtual);
        let restante = tempo - (minutosDisponiveisPorDia - minutosUsadosHoje);

        if (restante <= 0) {
            minutosUsadosHoje += tempo;
        } else {
            while (restante > 0) {
                diaAtual = proximoDiaUtilCostura(diaAtual, feriados);
                if (restante <= minutosDisponiveisPorDia) { minutosUsadosHoje = restante; restante = 0; }
                else restante -= minutosDisponiveisPorDia;
            }
        }

        const dataTerminoProducao = new Date(diaAtual);
        return { ...op, tempoCostura: tempo, dataInicioProducao, dataTerminoProducao };
    });
}

function minutosDisponiveisDiaCostura() {
    const pessoas = parseFloat($('seqCostPessoas')?.value) || 0;
    const horas = parseFloat($('seqCostHoras')?.value) || 0;
    const ef = parseFloat($('seqCostEficiencia')?.value) || 0;
    return pessoas * horas * 60 * (ef / 100);
}

// Vermelho = a data de finalização já passou de verdade (hoje já é depois
// dela). Laranja = ainda não passou, mas pela posição dessa OP na fila
// (calculada em calcularCronogramaCostura), ela só vai terminar de ser
// costurada DEPOIS da data prometida — ou seja, vai atrasar por causa do
// que vem antes dela, mesmo a data em si ainda não tendo vencido.
// Usa a data LIMITE da costura (Data Finalização menos os dias de reserva
// do Acabamento), não a Data Finalização crua — é esse o prazo que a
// Costura precisa cumprir de verdade, já que o Acabamento vem depois.
function classificarAtrasoOP(op, hoje) {
    const dataLimite = calcularDataLimiteCostura(op);
    if (!dataLimite) return null;
    if (dataLimite < hoje) return 'vermelho';
    if (op.dataTerminoProducao && op.dataTerminoProducao > dataLimite) return 'laranja';
    return null;
}

// Resumo de atrasos dos 6 grupos DE UMA VEZ (não só o que está selecionado
// no momento) — pra decidir rápido qual grupo precisa de atenção primeiro,
// sem precisar clicar em cada um. Usa a MESMA capacidade (Nº de
// pessoas/Horas/Eficiência) preenchida na tela pra todos os grupos — hoje
// só existe um conjunto desses campos, não um por grupo.
function calcularResumoAtrasosPorGrupo() {
    const minutosDisponiveis = minutosDisponiveisDiaCostura();
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    return Object.keys(GRUPOS_SEQUENCIAMENTO_COSTURA).map(chave => {
        const fila = montarFilaSequenciamentoCostura(chave);
        const filaComResultado = calcularCronogramaCostura(fila, minutosDisponiveis);
        let jaAtrasadas = 0, vaoAtrasar = 0;
        filaComResultado.forEach(op => {
            const c = classificarAtrasoOP(op, hoje);
            if (c === 'vermelho') jaAtrasadas++; else if (c === 'laranja') vaoAtrasar++;
        });
        return { chave, rotulo: GRUPOS_SEQUENCIAMENTO_COSTURA[chave].rotulo, total: filaComResultado.length, jaAtrasadas, vaoAtrasar };
    });
}

function renderizarResumoAtrasosPorGrupo() {
    if (!$('seqCostResumoGrupos')) return;
    const resumo = calcularResumoAtrasosPorGrupo();
    $('seqCostResumoGrupos').innerHTML = resumo.map(g => `
        <tr style="cursor:pointer;" onclick="$('seqCostGrupo').value='${g.chave}'; renderizarSequenciamentoCostura();" title="Clique pra ver a fila desse grupo">
            <td><strong>${g.rotulo}</strong></td>
            <td style="text-align:center; color:${g.jaAtrasadas ? 'var(--cor-alerta)' : 'var(--texto-secundario)'}; font-weight:${g.jaAtrasadas ? '700' : '400'};">${g.jaAtrasadas}</td>
            <td style="text-align:center; color:${g.vaoAtrasar ? '#E07B39' : 'var(--texto-secundario)'}; font-weight:${g.vaoAtrasar ? '700' : '400'};">${g.vaoAtrasar}</td>
            <td style="text-align:center; color:var(--texto-secundario);">${g.total}</td>
        </tr>`).join('');
}


// Eficiência REAL da costura (a do KPI) mostrada no cantinho da Sequência, de acordo com o grupo escolhido.
// Camisa e Jaqueta/Gandola/Parka dividem o mesmo local no KPI (PNP COST SUP CAMISA), então mostram a mesma %.
const LOCAL_EF_COSTURA_DO_GRUPO = {
    CALCA: 'PNP COST INF CALCA',
    MALHA: 'PNP COST SUP MALHA',
    CAMISA: 'PNP COST SUP CAMISA',
    JAQUETA_GANDOLA_PARKA: 'PNP COST SUP CAMISA',
    HIBRIDA: 'PNP COST CEL HIBRIDA',
};
// Mesma conta da tabela "Resumo do mês por local" do KPI: minutos produzidos ÷ minutos disponíveis,
// só nos dias em que as pessoas do local foram informadas.
function calcularEficienciaMesLocal(local, mes) {
    const todos = obterEficienciaCostura();
    const minPessoa = parseFloat($('efCosturaMinPessoa') ? $('efCosturaMinPessoa').value : 528) || 528;
    let minOk = 0, disp = 0, diasComPessoas = 0, diasComDado = 0;
    Object.keys(todos).filter(d => d.startsWith(mes)).forEach(dia => {
        const l = (todos[dia].locais || {})[local]; if (!l) return;
        diasComDado++;
        const pessoas = (todos[dia].pessoasLocal || {})[local];
        if (pessoas > 0) { minOk += l.minutos; disp += pessoas * minPessoa; diasComPessoas++; }
    });
    return { efic: disp ? (minOk / disp) * 100 : null, diasComPessoas, diasComDado };
}
function atualizarEficienciaSeqCostura() {
    const el = $('seqCostEfKpi'); if (!el) return;
    const grupo = $('seqCostGrupo') ? $('seqCostGrupo').value : 'CALCA';
    const local = LOCAL_EF_COSTURA_DO_GRUPO[grupo];
    if (!local) { el.innerHTML = ''; return; }
    const todos = obterEficienciaCostura();
    const meses = [...new Set(Object.keys(todos).map(d => d.slice(0, 7)))].sort();
    const mesSel = $('seletorMesEfCostura') && meses.includes($('seletorMesEfCostura').value) ? $('seletorMesEfCostura').value : meses[meses.length - 1];
    if (!mesSel) { el.innerHTML = ''; return; }
    const r = calcularEficienciaMesLocal(local, mesSel);
    const nome = nomeLocalEfCostura(local);
    const nomeGrupo = { CALCA: 'Calça', MALHA: 'Malha', CAMISA: 'Camisa', JAQUETA_GANDOLA_PARKA: 'Jaqueta', HIBRIDA: 'Híbrida' }[grupo];
    const compartilhado = grupo === 'CAMISA' || grupo === 'JAQUETA_GANDOLA_PARKA';
    const cor = r.efic === null ? '#cfcfcf' : (r.efic >= 100 ? '#7FD6A0' : (r.efic >= 70 ? '#F0C36A' : '#F08A8A'));
    const txt = r.efic === null ? 'sem pessoas informadas' : r.efic.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%';
    const titulo = `Eficiência do mês (${formatarMesLegivelKPI ? formatarMesLegivelKPI(mesSel) : mesSel}) do local ${local}, igual à tabela do KPI da costura: ${r.diasComPessoas} de ${r.diasComDado} dia(s) com pessoas informadas.` + (compartilhado ? ' No KPI, Camisa e Jaqueta são o mesmo local, por isso mostram a mesma %.' : '');
    el.innerHTML = `<span title="${titulo}" style="display:inline-flex; align-items:center; gap:6px; font-size:12px; background:rgba(255,255,255,0.14); padding:3px 10px; border-radius:999px; white-space:nowrap;"><i class="fas fa-gauge-high"></i> EFICIÊNCIA ${(compartilhado ? 'CAMISA/JAQUETA' : nomeGrupo).toUpperCase()} (MÊS): <strong style="color:${cor}; font-size:13px;">${txt}</strong></span>`;
}

function renderizarSequenciamentoCostura() {
    if (!$('seqCostListaOPs')) return;
    const grupo = $('seqCostGrupo') ? $('seqCostGrupo').value : 'CALCA';
    atualizarEficienciaSeqCostura();
    const fila = montarFilaSequenciamentoCostura(grupo);
    const minutosDisponiveis = minutosDisponiveisDiaCostura();
    const filaComResultado = calcularCronogramaCostura(fila, minutosDisponiveis);

    if ($('seqCostDisponivel')) $('seqCostDisponivel').textContent = Math.round(minutosDisponiveis).toLocaleString('pt-BR');
    if ($('seqCostContOPs')) $('seqCostContOPs').textContent = `${filaComResultado.length} OP(s)`;

    // Resumo de atrasos — pra não precisar rolar a tabela toda só pra
    // saber se hoje é um dia de se preocupar ou não.
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    if ($('seqCostResumoAtraso')) {
        const jaAtrasadas = filaComResultado.filter(op => classificarAtrasoOP(op, hoje) === 'vermelho').length;
        const vaoAtrasar = filaComResultado.filter(op => classificarAtrasoOP(op, hoje) === 'laranja').length;
        if (jaAtrasadas === 0 && vaoAtrasar === 0) {
            $('seqCostResumoAtraso').innerHTML = '';
        } else {
            const partes = [];
            if (jaAtrasadas > 0) partes.push(`<span style="color:var(--cor-alerta); font-weight:700;">${jaAtrasadas} já atrasada${jaAtrasadas === 1 ? '' : 's'}</span>`);
            if (vaoAtrasar > 0) partes.push(`<span style="color:#E07B39; font-weight:700;">${vaoAtrasar} ${vaoAtrasar === 1 ? 'vai' : 'vão'} atrasar</span>`);
            $('seqCostResumoAtraso').innerHTML = partes.join(' · ');
        }
    }

    renderizarResumoAtrasosPorGrupo();

    if (!filaComResultado.length) {
        $('seqCostListaOPs').innerHTML = `<tr><td colspan="14" style="text-align:center; padding:20px; color:var(--texto-secundario);">Nenhuma OP encontrada pra esse grupo.</td></tr>`;
        return;
    }

    $('seqCostListaOPs').innerHTML = filaComResultado.map((op, indice) => {
        const tempoTexto = op.tempoCostura === null
            ? `<span style="color:var(--cor-alerta);" title="Essa linha não trouxe Minutos Costura na planilha importada">sem tempo</span>`
            : op.tempoCostura.toFixed(1).replace('.', ',');
        const situacaoCor = op.situacaoCostura === 'Em andamento' ? 'var(--cor-despacho)' : 'var(--texto-secundario)';
        const dataFinalizacaoTexto = op.dataFinalizacao ? formatarDataBR(op.dataFinalizacao) : '—';
        const dataLimiteCostura = calcularDataLimiteCostura(op);
        const dataLimiteTexto = dataLimiteCostura ? formatarDataBR(dataLimiteCostura) : null;

        const classificacaoAtraso = classificarAtrasoOP(op, hoje);
        const corDataFinalizacao = classificacaoAtraso === 'vermelho' ? 'var(--cor-alerta)' : classificacaoAtraso === 'laranja' ? '#E07B39' : '';
        // Mostra as duas datas: a Data Finalização de verdade (a que vem
        // da planilha) e, embaixo dela, a data LIMITE da costura (já
        // descontados os dias de reserva do Acabamento) — é essa segunda
        // que fica colorida quando está atrasada/vai atrasar, já que é o
        // prazo que a Costura precisa cumprir de verdade.
        const dataFinalizacaoHtml = dataLimiteTexto
            ? `${dataFinalizacaoTexto}<br><span class="data-limite-costura-esconde-impressao" style="font-size:10px; ${corDataFinalizacao ? `color:${corDataFinalizacao}; font-weight:700;` : 'color:var(--texto-secundario);'}" title="Data limite pra Costura terminar, já descontando ${DIAS_RESERVA_ACABAMENTO_COSTURA} dias úteis de reserva pro Acabamento">limite: ${dataLimiteTexto}</span>`
            : dataFinalizacaoTexto;

        // "Previsão" mostra quando essa OP começa e termina de ser
        // costurada, de acordo com a fila — se levar mais de 1 dia, mostra
        // início → término; se cabe tudo no mesmo dia, mostra só a data.
        let previsaoTexto = '—';
        let comecaHoje = false;
        if (op.dataInicioProducao && op.dataTerminoProducao) {
            const inicioTxt = formatarDataBR(op.dataInicioProducao);
            const terminoTxt = formatarDataBR(op.dataTerminoProducao);
            previsaoTexto = inicioTxt === terminoTxt ? inicioTxt : `${inicioTxt} → ${terminoTxt}`;
            comecaHoje = op.dataInicioProducao.getTime() === hoje.getTime();
        }

        const chaveLinha = chaveOPCostura(op.op, op.ciclo);
        const isEnfesto = grupo === 'ENFESTO';
        const podeSubir = indice > 0;
        const podeDescer = indice < filaComResultado.length - 1;
        const setasHtml = isEnfesto ? `<span class="data-limite-costura-esconde-impressao" style="display:inline-flex; flex-direction:column; gap:1px; margin-right:6px; vertical-align:middle;">
            <button class="btn somente-admin tambem-usuario" style="padding:0 4px; font-size:9px; line-height:1.4; background:var(--cor-historico); ${podeSubir ? '' : 'opacity:0.25;'}" ${podeSubir ? '' : 'disabled'} onclick="moverOPEnfesto('${chaveLinha}', -1)" title="Mover pra cima"><i class="fas fa-caret-up"></i></button>
            <button class="btn somente-admin tambem-usuario" style="padding:0 4px; font-size:9px; line-height:1.4; background:var(--cor-historico); ${podeDescer ? '' : 'opacity:0.25;'}" ${podeDescer ? '' : 'disabled'} onclick="moverOPEnfesto('${chaveLinha}', 1)" title="Mover pra baixo"><i class="fas fa-caret-down"></i></button>
        </span>` : '';
        // Linha separadora bem visível entre "Em andamento" e "Aguardando"
        // — pedido do usuário, pra ficar claro pra quem olha a tela onde
        // uma situação termina e a outra começa, sem precisar ler a
        // coluna Situação linha por linha.
        const linhaAnterior = filaComResultado[indice - 1];
        const separador = (indice > 0 && linhaAnterior.situacaoCostura === 'Em andamento' && op.situacaoCostura === 'Aguardando')
            ? `<tr><td colspan="14" style="padding:0; border-top:3px solid var(--cor-historico);"></td></tr>`
            : '';
        // Sem previsão (Enfesto/Etiquetação, ou OP sem tempo) → nunca "começa hoje"; ficava apagada. Aqui não apaga.
        const semTempoNoGrupo = grupo === 'ENFESTO' || grupo === 'ETIQUETACAO' || !op.dataInicioProducao;   // sem previsão (OP sem tempo) também não apaga
        return separador + `<tr data-seq-chave="${chaveLinha}" style="${(comecaHoje || semTempoNoGrupo) ? '' : 'opacity:0.6;'}">
            <td><input type="checkbox" class="check-imprimir-seq" data-id="${chaveLinha}"></td>
            <td>${setasHtml}<strong>${op.op}</strong></td>
            <td><span style="color:${situacaoCor}; font-weight:700; font-size:11px;">${op.situacaoCostura}</span></td>
            <td>${op.prioridade ?? '—'}</td>
            <td>${dataFinalizacaoHtml}</td>
            <td>${obterMesDestinoDaOP(op.op, op.ciclo) || '<span style="color:var(--texto-secundario);">—</span>'}</td>
            <td class="num" style="color:${(op.diasLocal || 0) >= 3 ? 'var(--cor-alerta)' : 'var(--texto-cor)'};">${op.diasLocal ?? '<span style="color:var(--texto-secundario);">—</span>'}</td>
            <td>${op.descRef || ''}</td>
            <td style="white-space:nowrap;">${op.cor || '<span style="color:var(--texto-secundario);">—</span>'}</td>
            <td class="num">${(op.qtd || 0).toLocaleString('pt-BR')}</td>
            <td class="num" style="white-space:nowrap;" title="Tempo de costura por peça (coluna 'Tempo Peca Costura' do POR_OP)">${(op.tempoPecaCostura && grupo !== 'ENFESTO' && grupo !== 'ETIQUETACAO') ? op.tempoPecaCostura.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '<span style="color:var(--texto-secundario);">—</span>'}</td>
            <td class="col-tempo-total-seq num">${tempoTexto}</td>
            <td style="text-align:center; white-space:nowrap;">${previsaoTexto}</td>
            <td style="text-align:center; white-space:nowrap;">
                <button class="btn somente-admin tambem-usuario tambem-sequencia" style="padding:3px 7px; background:var(--cor-historico);" onclick="ocultarOPDaSequenciaCostura('${op.op}', '${op.ciclo || ''}')" title="Ocultar essa OP (continua existindo, só some da lista e do tempo — reversível na hora)"><i class="fas fa-eye-slash"></i></button>
                <button class="btn somente-admin tambem-usuario tambem-sequencia" style="padding:3px 7px; background:var(--cor-alerta);" onclick="removerOPDaSequenciaCostura('${op.op}', '${op.ciclo || ''}')" title="Remover essa OP da sequência (não volta nem reimportando)"><i class="fas fa-trash"></i></button>
            </td>
        </tr>`;
    }).join('');

    if ($('btnOrdemAutomaticaEnfesto')) $('btnOrdemAutomaticaEnfesto').style.display = (grupo === 'ENFESTO' && obterOrdemManualEnfesto().length) ? '' : 'none';
    if ($('dicaArrastarEnfesto')) $('dicaArrastarEnfesto').style.display = (grupo === 'ENFESTO') ? '' : 'none';
}
