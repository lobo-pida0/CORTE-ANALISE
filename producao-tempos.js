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
}
function removerFeriado(dataChave) {
    if (!exigirAdminOuUsuario('remover feriado')) return;
    salvarFeriados(obterFeriados().filter(d => d !== dataChave));
    renderizarModalFeriados();
    renderizarSequenciamentoCostura();
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
    do { nova.setDate(nova.getDate() + 1); } while (nova.getDay() === 0 || nova.getDay() === 6 || feriadosSet.has(nova.toISOString().slice(0, 10)));
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
    while (diaAtual.getDay() === 0 || diaAtual.getDay() === 6 || feriados.has(diaAtual.toISOString().slice(0, 10))) {
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
    const nomeGrupo = { CALCA: 'Calça', MALHA: 'Malha', CAMISA: 'Camisa', JAQUETA_GANDOLA_PARKA: 'Jaqueta' }[grupo];
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
                <button class="btn somente-admin tambem-usuario" style="padding:3px 7px; background:var(--cor-historico);" onclick="ocultarOPDaSequenciaCostura('${op.op}', '${op.ciclo || ''}')" title="Ocultar essa OP (continua existindo, só some da lista e do tempo — reversível na hora)"><i class="fas fa-eye-slash"></i></button>
                <button class="btn somente-admin tambem-usuario" style="padding:3px 7px; background:var(--cor-alerta);" onclick="removerOPDaSequenciaCostura('${op.op}', '${op.ciclo || ''}')" title="Remover essa OP da sequência (não volta nem reimportando)"><i class="fas fa-trash"></i></button>
            </td>
        </tr>`;
    }).join('');

    if ($('btnOrdemAutomaticaEnfesto')) $('btnOrdemAutomaticaEnfesto').style.display = (grupo === 'ENFESTO' && obterOrdemManualEnfesto().length) ? '' : 'none';
    if ($('dicaArrastarEnfesto')) $('dicaArrastarEnfesto').style.display = (grupo === 'ENFESTO') ? '' : 'none';
}

// Setas de subir/descer pro Enfesto — trocado do arrastar-e-soltar
// original a pedido do usuário (arrastar não funcionou bem no navegador
// dele). Move a OP uma posição na fila (troca de lugar com a vizinha),
// salva a ordem inteira resultante (local + nuvem) e re-renderiza.
function moverOPEnfesto(chave, direcao) {
    if (!exigirAdminOuUsuario('reordenar o Enfesto')) return;
    const fila = montarFilaSequenciamentoCostura('ENFESTO');
    const chaves = fila.map(op => chaveOPCostura(op.op, op.ciclo));
    const indice = chaves.indexOf(chave);
    const novoIndice = indice + direcao;
    if (indice === -1 || novoIndice < 0 || novoIndice >= chaves.length) return;
    [chaves[indice], chaves[novoIndice]] = [chaves[novoIndice], chaves[indice]];
    salvarOrdemManualEnfesto(chaves);
    publicarOrdemManualEnfestoNaNuvem(chaves);
    renderizarSequenciamentoCostura();
}

function resetarOrdemAutomaticaEnfesto() {
    if (!exigirAdminOuUsuario('resetar a ordem do Enfesto')) return;
    if (!confirm('Voltar o Enfesto pra ordem automática (por data de finalização/prioridade)? A ordem manual que você fez vai ser descartada.')) return;
    salvarOrdemManualEnfesto([]);
    publicarOrdemManualEnfestoNaNuvem([]);
    renderizarSequenciamentoCostura();
    showToast("<i class='fas fa-rotate-left'></i> Enfesto voltou pra ordem automática.");
}

function renderizarFilaCorte() {
    if (!$('listaFilaCorte')) return;
    const media = calcularMediaDiariaCorte();
    if ($('inputMediaCorteManual') && document.activeElement !== $('inputMediaCorteManual')) {
        $('inputMediaCorteManual').value = obterMediaCorteManual() || '';
    }

    if ($('mediaCorteInfo')) {
        $('mediaCorteInfo').innerText = media > 0
            ? `Média diária do Corte: ${Math.round(media).toLocaleString('pt-BR')} pçs/dia${obterMediaCorteManual() !== null ? ' (manual)' : ''}`
            : 'Sem dados de produção do Corte lançados ainda';
    }

    const ops = obterOPsFilaCorte();
    renderizarFiltrosFilaCorte(ops);
    renderizarListaOPsFilaCorte(ops);

    if (!ops.length) {
        // Sem a lista detalhada (importação antiga ou não feita) cai nos totais
        // agregados de sempre, sem filtro — melhor que mostrar a tela zerada.
        const salvo = localStorage.getItem('filaCorteDados');
        if (!salvo) {
            $('listaFilaCorte').innerHTML = `<tr><td colspan="5" class="tabela-vazia"><i class="fas fa-file-import tabela-vazia-icone"></i>Importe a planilha geral (POR_OP) pra ver a fila de corte.</td></tr>`;
            return;
        }
        let dados; try { dados = JSON.parse(salvo); } catch (e) { return; }
        montarTabelaFilaCorte(dados.map(s => ({ codigo: s.codigo, nome: s.nome, pecas: s.qtdPecas || 0, ops: s.qtdOps || 0 })), media);
        renderizarResumoGeral(undefined, media);
        return;
    }

    // Soma por setor a partir das linhas individuais, já com os filtros
    const porSetor = new Map();
    SETORES_FILA_CORTE.forEach(s => porSetor.set(s.codigo, { codigo: s.codigo, nome: s.nome, pecas: 0, opsSet: new Set() }));
    ops.forEach(o => {
        if (!opPassaFiltroFilaCorte(o)) return;
        const alvo = porSetor.get(o.cod);
        if (!alvo) return;
        alvo.pecas += (o.qtd || 0);
        if (o.op) alvo.opsSet.add(o.op);
    });

    montarTabelaFilaCorte(SETORES_FILA_CORTE.map(s => {
        const d = porSetor.get(s.codigo);
        return { codigo: s.codigo, nome: s.nome, pecas: d.pecas, ops: d.opsSet.size };
    }), media);

    renderizarResumoGeral(undefined, media);
}

// Desenha as linhas da tabela da fila a partir de valores já somados
function montarTabelaFilaCorte(setores, media) {
    let totalPecas = 0, totalOps = 0, totalDiasFila = 0, totalDiasFilaCorte = 0;
    const linhas = setores.map(s => {
        const diasFila = media > 0 ? s.pecas / media : 0;
        const ehProximoCorte = CODIGOS_DIAS_FILA_CORTE.includes(s.codigo);
        totalPecas += s.pecas;
        totalOps += s.ops;
        totalDiasFila += diasFila;
        if (ehProximoCorte) totalDiasFilaCorte += diasFila;
        return `<tr${ehProximoCorte ? ' style="background:rgba(62, 124, 151, 0.06);"' : ''}>
            <td>${s.nome} <span style="color:var(--texto-secundario); font-size:10px;">(${s.codigo})</span></td>
            <td style="text-align:right;">${s.pecas.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</td>
            <td style="text-align:right;">${s.ops}</td>
            <td style="text-align:right; font-weight:bold;">${diasFila.toFixed(2).replace('.', ',')}</td>
            <td style="text-align:right; font-weight:bold; color:var(--cor-sugestao);">${ehProximoCorte ? diasFila.toFixed(2).replace('.', ',') : ''}</td>
        </tr>`;
    }).join('');

    const linhaTotal = `<tr style="background:var(--cor-alerta); color:white; font-weight:900;">
        <td>TOTAL</td>
        <td style="text-align:right;">${totalPecas.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</td>
        <td style="text-align:right;">${totalOps}</td>
        <td style="text-align:right;">${totalDiasFila.toFixed(2).replace('.', ',')}</td>
        <td style="text-align:right;">${totalDiasFilaCorte.toFixed(2).replace('.', ',')}</td>
    </tr>`;

    $('listaFilaCorte').innerHTML = linhas + linhaTotal;
}


// Baixa o painel inteiro (cabeçalho + tabela) como imagem PNG — útil pra
// anexar ou colar direto num e-mail.
function baixarImagemFilaCorte() {
    if (typeof html2canvas === 'undefined') { showToast("<i class='fas fa-exclamation-triangle'></i> Biblioteca de imagem não carregada.", true); return; }
    const painel = $('painel-fila-corte');
    if (!painel) return;
    const botoesAcao = $('botoes-acao-filacorte');
    if (botoesAcao) botoesAcao.style.display = 'none';
    showToast("<i class='fas fa-spinner fa-spin'></i> Gerando imagem...", false);

    html2canvas(painel, { scale: 2, backgroundColor: document.body.classList.contains('dark-mode') ? '#221F1A' : '#ffffff' }).then(canvas => {
        const link = document.createElement('a');
        link.href = canvas.toDataURL('image/png');
        link.download = `Fila_de_Corte_${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.png`;
        link.click();
        if (botoesAcao) botoesAcao.style.display = 'flex';
        showToast("<i class='fas fa-camera'></i> Imagem da fila de corte baixada!");
    }).catch(() => {
        if (botoesAcao) botoesAcao.style.display = 'flex';
        showToast("<i class='fas fa-exclamation-triangle'></i> Erro ao gerar a imagem.", true);
    });
}

// Etapa do sistema → setor do KPI que mede o ritmo dela (Dublagem não tem KPI).
const SETOR_KPI_DA_ETAPA = { 0: 'PPCP PROGRAMACAO', 1: 'ANALISE DE MEDIDAS', 2: 'CAD', 3: 'PCP PROGRAMACAO-CORTE', 4: 'ALMOX TECIDO', 6: 'ENFESTO', 7: 'CORTE' };
// Ritmo do setor: média de peças/dia dos últimos N dias ÚTEIS COM MOVIMENTO (até hoje). Precisa de pelo menos 2 dias.
function calcularRitmoDiarioSetorKPI(setorKpi, maxDias) {
    const movs = obterMovimentacoesPorSetor('fabrica')[setorKpi] || {};
    const porDia = {};
    const hojeISO = new Date().toISOString().slice(0, 10);
    Object.values(movs).forEach(m => {
        if (!m.data) return;
        const dia = new Date(m.data).toISOString().slice(0, 10);
        const dow = new Date(dia + 'T00:00:00Z').getUTCDay();
        if (dow === 0 || dow === 6 || dia > hojeISO) return;
        porDia[dia] = (porDia[dia] || 0) + (m.qtd || 0);
    });
    const dias = Object.keys(porDia).sort().slice(-maxDias);
    if (dias.length < 2) return null;
    return { media: dias.reduce((t, d) => t + porDia[d], 0) / dias.length, dias: dias.length, de: dias[0], ate: dias[dias.length - 1] };
}

// Calcula o ranking de setores por "peso de gargalo" — reaproveitado tanto
// pelo modal de Ranking de Gargalos quanto pelo painel de visão geral.
// Aceita o mapa de pendentes-por-referência já calculado (evita reler e
// reprocessar o localStorage de novo quando chamada de dentro do ciclo
// principal de renderização); se não vier nada, calcula na hora.
function calcularRankingGargalo(pendentesPorReferenciaParam) {
    if (!bancoDadosOPs || bancoDadosOPs.length === 0) return [];

    const pendentesPorReferencia = pendentesPorReferenciaParam || obterPendentesPorReferencia();
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);

    let setoresStatus = nomesEtapas.map((nome, index) => ({
        id: index, nome: nome, qtdOps: 0, qtdPcs: 0, somaDias: 0, maxDias: 0, score: 0, opsCriticas: 0,
        opsComPedido: 0, opsComPedidoUrgente: 0, ops: [], pcsFila: 0, ritmo: null, diasFila: null
    }));

    bancoDadosOPs.forEach(op => {
        if (op.etapa >= 0 && op.etapa < nomesEtapas.length) {
            let diasParados = op.diasLocal || 0;
            let stat = setoresStatus[op.etapa];
            let pecas = parseInt(op.qtd) || 0;

            stat.qtdOps++;
            stat.qtdPcs += pecas;
            stat.somaDias += diasParados;
            if (diasParados > stat.maxDias) stat.maxDias = diasParados;
            if (diasParados >= 3) stat.opsCriticas++;

            let pesoOp = (pecas * 0.01) + (diasParados * 5);

            // OP parada que também está travando um pedido pesa mais no ranking —
            // não é só volume/tempo, tem entrega real de cliente em jogo.
            const pendentesRef = op.referencia ? pendentesPorReferencia.get(op.referencia) : null;
            let opComPedido = false, opUrgente = false;
            if (pendentesRef && pendentesRef.length) {
                const pedido = [...pendentesRef].sort(compararUrgenciaPedidos)[0];
                const especial = pedido.prior !== 99;
                const dataChegada = pedido.chegada ? new Date(pedido.chegada) : null;
                const vencido = dataChegada && dataChegada < hoje;
                opComPedido = true; opUrgente = !!(especial || vencido);
                stat.opsComPedido++;
                if (especial || vencido) stat.opsComPedidoUrgente++;
                pesoOp += especial ? 200 : (vencido ? 100 : 50);
            }

            stat.score += pesoOp;
            const sc = SETOR_KPI_DA_ETAPA[op.etapa];
            const mult = (sc && SETORES_COM_MULTIPLICADOR_CAMADAS_KPI.has(sc)) ? multiplicadorDeCamadas(op.desc) : 1;   // o KPI de Enfesto/Corte conta por camada
            stat.pcsFila += pecas * mult;
            stat.ops.push({ op, pecas, dias: diasParados, comPedido: opComPedido, urgente: opUrgente });
        }
    });

    // Dias de fila = peças na etapa ÷ ritmo diário do setor (média dos últimos dias úteis do KPI).
    // Etapa sem ritmo (ex.: Dublagem, ou KPI ainda não importado) fica sem esse número e cai no critério antigo (peso).
    setoresStatus.forEach(st => {
        const sc = SETOR_KPI_DA_ETAPA[st.id];
        const r = sc ? calcularRitmoDiarioSetorKPI(sc, 5) : null;
        if (r && r.media > 0) { st.ritmo = r; st.diasFila = st.pcsFila / r.media; }
    });
    return setoresStatus.filter(s => s.qtdOps > 0).sort((a, b) => {
        if (a.diasFila !== null && b.diasFila !== null) return b.diasFila - a.diasFila;
        if (a.diasFila !== null) return -1;
        if (b.diasFila !== null) return 1;
        return b.score - a.score;
    });
}



// ---- LUPA: procura uma OP em TODOS os grupos da Sequência (em andamento e aguardando) e leva até a linha ----
function buscarOPNaSequenciaCostura(texto) {
    const sem = t => String(t == null ? '' : t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
    const termo = sem(texto); if (termo.length < 2) return [];
    const achados = [];
    Object.entries(GRUPOS_SEQUENCIAMENTO_COSTURA).forEach(([chave, g]) => {
        montarFilaSequenciamentoCostura(chave).forEach((op, i) => {
            if ([op.op, op.ref, op.descRef, op.cor].some(c => sem(c).includes(termo))) achados.push({ grupo: chave, rotulo: g.rotulo, posicao: i + 1, op });
        });
    });
    return achados;
}
function irParaOPNaSequenciaCostura(grupo, chaveLinha) {
    const sel = $('seqCostGrupo'); if (sel) sel.value = grupo;
    renderizarSequenciamentoCostura();
    const tr = [...document.querySelectorAll('#seqCostListaOPs tr[data-seq-chave]')].find(x => x.dataset.seqChave === chaveLinha);
    if (!tr) return;
    tr.scrollIntoView({ block: 'center', behavior: 'smooth' });
    tr.style.outline = '3px solid var(--cor-sugestao)'; tr.style.outlineOffset = '-3px'; tr.style.opacity = '1';
    setTimeout(() => { tr.style.outline = ''; tr.style.outlineOffset = ''; }, 3500);
}
function renderizarBuscaSequenciaCostura() {
    const inp = $('seqCostBusca'), box = $('seqCostBuscaResultado'); if (!inp || !box) return;
    const achados = buscarOPNaSequenciaCostura(inp.value);
    if (inp.value.trim().length < 2) { box.style.display = 'none'; box.innerHTML = ''; return; }
    const esc = t => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
    box.style.display = 'block';
    box.innerHTML = achados.length
        ? `<div style="border:1px solid var(--borda-cor); border-radius:8px; background:var(--bg-card); max-height:260px; overflow:auto;">${achados.slice(0, 40).map(a => `<div class="seq-busca-item" style="display:flex; gap:10px; align-items:center; padding:7px 12px; border-bottom:1px solid var(--borda-cor); cursor:pointer; font-size:12px; flex-wrap:wrap;" onclick="irParaOPNaSequenciaCostura('${a.grupo}', '${esc(chaveOPCostura(a.op.op, a.op.ciclo))}')">
            <strong>${esc(a.op.op)}</strong><span style="color:var(--texto-secundario);">${esc(a.op.ciclo)}</span>
            <span class="pill" style="background:var(--cor-primaria); color:white;">${esc(a.rotulo)}</span>
            <span style="font-weight:700; color:${a.op.situacaoCostura === 'Em andamento' ? 'var(--cor-despacho)' : 'var(--texto-secundario)'};">${esc(a.op.situacaoCostura)}</span>
            <span>${a.posicao}º na fila</span><span>${(a.op.qtd || 0).toLocaleString('pt-BR')} peças</span>
            <span style="color:var(--texto-secundario);">${esc(String(a.op.descRef || '').slice(0, 50))}</span></div>`).join('')}${achados.length > 40 ? `<div style="padding:6px 12px; font-size:11px; color:var(--texto-secundario);">+${achados.length - 40} resultados — digite mais para afinar.</div>` : ''}</div>`
        : '<div style="padding:8px 12px; font-size:12px; color:var(--texto-secundario);">Nenhuma OP encontrada na Sequência (ela pode estar oculta, removida ou fora dos locais de costura).</div>';
}
