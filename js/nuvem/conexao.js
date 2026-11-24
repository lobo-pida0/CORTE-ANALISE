// -------------------------------------------------------------------------
// (separado de nuvem.js) Conexão com o Supabase, sessão/papel do usuário, abas liberadas por papel, login e logout.
// -------------------------------------------------------------------------
// =========================================================================
// ☁️ SUPABASE — conexão com o banco de dados na nuvem (Fase 3: só a tabela
// de OPs por enquanto). O resto do sistema (pedidos, grade, prioridades)
// continua no localStorage normalmente, sem mudança nenhuma — isso é
// aditivo, não substitui nada ainda.
// =========================================================================
const SUPABASE_URL = 'https://tqvlitrwhvufynrnxwxx.supabase.co';
const SUPABASE_KEY = 'sb_publishable__GE8nvPUdc0bG7TZx42d7A_gj1yat8N';
let supabaseClient = null;
try {
    if (typeof window.supabase !== 'undefined') {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    } else {
        registrarLogDebug('error', ['Biblioteca do Supabase não carregou (window.supabase indefinido) — login, publicar e carregar da nuvem não vão funcionar até isso ser resolvido.']);
    }
} catch (e) {
    registrarLogDebug('error', ['Falha ao iniciar o cliente Supabase: ' + e.message]);
}
// Linha "canário": aparece SEMPRE, em toda abertura da página, sem depender
// de login ou clique em nada — serve pra confirmar que essa versão do
// arquivo está rodando de verdade, e se a conexão com a nuvem foi montada.
registrarLogDebug('log', ['[NUVEM v2] window.supabase = ' + (typeof window.supabase) + ' | cliente montado = ' + (supabaseClient ? 'SIM' : 'NÃO')]);

let sessaoAdminAtual = null; // guarda a sessão do usuário logado (null = visitante)
let papelUsuarioAtual = null; // 'admin', 'usuario', 'sequencia' ou 'tv' — só tem valor quando sessaoAdminAtual existe

// Converte uma OP do formato usado no sistema (bancoDadosOPs) pro formato de
// colunas da tabela "ops" no Supabase (snake_case)
function opParaLinhaSupabase(op) {
    return {
        id: montarChaveOP(op.ciclo, op.id), ciclo: op.ciclo || '', descricao: op.desc || '',
        qtd: parseInt(op.qtd) || 0, tempo_corte: parseFloat(op.tempoCorte) || 0,
        etapa: op.etapa, data_corte: op.dataCorte ? new Date(op.dataCorte).toISOString().slice(0, 10) : null,
        local_destino: op.localDestino || '', local_excel: op.localExcel || '',
        tem_dublado: !!op.temDublado,
        // A separação entre estrela manual e urgência da planilha ainda não
        // existe no cliente (fica pra uma etapa própria) — por enquanto os
        // dois lados da tabela recebem o mesmo valor.
        prioridade_urgencia: !!op.prioridade, prioridade_manual: !!op.prioridade,
        mes_destino: op.mesDestino || null,
        numero_prioridade: op.numeroPrioridade || null,
        destaque: !!op.destaque,
        local_destino_detalhado: op.localDestinoDetalhado || null,
        data_inclusao: op.dataInclusao ? new Date(op.dataInclusao).toISOString().slice(0, 10) : null,
        dias_local: parseInt(op.diasLocal) || 0, codigo_mp: op.codigoMP || '', desc_mp: op.descMP || '',
        referencia: op.referencia || '', sob_medida: !!op.sobMedida, laser: !!op.laser,
        data_finalizacao: op.dataFinalizacao ? new Date(op.dataFinalizacao).toISOString().slice(0, 10) : null,
        atualizado_em: new Date().toISOString()
    };
}

// Converte de volta: linha do Supabase -> formato usado no sistema
function linhaSupabaseParaOP(l) {
    return {
        id: numeroDaChaveNuvem(l.id, l.ciclo), ciclo: l.ciclo || '', desc: l.descricao || '', qtd: l.qtd || 0,
        tempoCorte: l.tempo_corte || 0, etapa: l.etapa, dataCorte: l.data_corte,
        localDestino: l.local_destino || '', localExcel: l.local_excel || '',
        temDublado: !!l.tem_dublado, prioridade: !!(l.prioridade_urgencia || l.prioridade_manual),
        dataEntradaEtapa: l.data_entrada_etapa, diasLocal: l.dias_local || 0,
        codigoMP: l.codigo_mp || '', descMP: l.desc_mp || '', referencia: l.referencia || '',
        sobMedida: !!l.sob_medida, laser: !!l.laser, dataFinalizacao: l.data_finalizacao,
        mesDestino: l.mes_destino || null,
        numeroPrioridade: l.numero_prioridade || null,
        destaque: !!l.destaque,
        localDestinoDetalhado: l.local_destino_detalhado || null,
        dataInclusao: l.data_inclusao || null,
        dataCorteSuposta: calcularDataCorteSuposta(l.data_finalizacao)
    };
}

async function verificarSessaoSupabase() {
    if (!supabaseClient) return;
    try {
        const { data } = await supabaseClient.auth.getSession();
        sessaoAdminAtual = data && data.session ? data.session : null;
        await verificarPapelUsuario();
        atualizarIndicadorLogin();
    } catch (e) {
        registrarLogDebug('error', ['Erro ao verificar sessão do Supabase: ' + e.message]);
    }
}

// Depois de logado, descobre o papel da pessoa na tabela papeis_usuario (pelo e-mail):
// 'admin', 'usuario' (importa planilhas), 'sequencia' (Sequência da costura) ou 'tv'.
// Quem NÃO está cadastrado lá (ou se a consulta falhar) vira 'tv': só vê o modo TV.
// Antes virava admin — qualquer conta nova ganhava acesso total.
const PAPEIS_CONHECIDOS = ['admin', 'usuario', 'sequencia', 'tv'];
async function verificarPapelUsuario() {
    papelUsuarioAtual = null;
    if (!sessaoAdminAtual || !supabaseClient) return;
    try {
        const email = sessaoAdminAtual.user.email;
        const { data, error } = await supabaseClient.from('papeis_usuario').select('papel').eq('email', email).maybeSingle();
        if (error) throw error;
        papelUsuarioAtual = data && PAPEIS_CONHECIDOS.includes(data.papel) ? data.papel : 'tv';
        if (!data) registrarLogDebug('log', [`A conta ${email} não está cadastrada em papeis_usuario — entrou só com acesso ao modo TV.`]);
    } catch (e) {
        registrarLogDebug('error', ['Não consegui checar o papel do usuário, liberando só o modo TV: ' + e.message]);
        papelUsuarioAtual = 'tv'; // na dúvida, o MENOR acesso (saia e entre de novo pra tentar outra vez)
    }
    // Checagem silenciosa do espaço da nuvem — só incomoda com um toast se
    // estiver alto (80%+); senão não aparece nada, pra não virar barulho
    // toda vez que o admin entra.
    if (papelUsuarioAtual === 'admin') { verificarEspacoNuvem(false); verificarBackupNuvemAutomatico(); }
    carregarDestinoDaNuvem(); carregarUrgentesPreparacaoDaNuvem(); carregarCalendarioProducaoDaNuvem();
    if (papelUsuarioAtual === 'sequencia' || papelUsuarioAtual === 'tv') { try { localStorage.removeItem('porOPCosturaImportadaLocal'); } catch (e) { /* ignora */ } carregarTudoDaNuvemParaVisitante(); }   // só consulta: recebe os dados publicados
}

function atualizarIndicadorLogin() {
    const txt = $('txtLoginAdmin');
    if (!txt) return;
    document.body.classList.toggle('modo-usuario', papelUsuarioAtual === 'usuario');
    document.body.classList.toggle('modo-sequencia', papelUsuarioAtual === 'sequencia');
    if (sessaoAdminAtual) {
        const nome = sessaoAdminAtual.user.email.split('@')[0].toUpperCase();
        txt.innerText = papelUsuarioAtual === 'usuario' ? `${nome} (USUÁRIO)` : (papelUsuarioAtual === 'sequencia' ? `${nome} (SEQUÊNCIA)` : (papelUsuarioAtual === 'tv' ? `${nome} (TV)` : nome));
        $('btnLoginAdmin').title = papelUsuarioAtual === 'usuario' ? 'Logado — só pode importar planilhas. Clique pra sair.' : (papelUsuarioAtual === 'sequencia' ? 'Logado — só consulta a Sequência da costura. Clique pra sair.' : 'Logado como admin — clique pra sair');
        if ($('indicadorUltimaPublicacao')) $('indicadorUltimaPublicacao').innerText = ''; // não faz sentido pro admin, ele usa o dado local ao vivo
    } else {
        txt.innerText = 'VISITANTE';
        $('btnLoginAdmin').title = 'Entrar como admin';
    }
    aplicarRestricaoDeAbaVisitante();
    aplicarTelaDeLogin();
}

// 🔒 TELA DE LOGIN NA ENTRADA — sem login não aparece NADA do sistema (o <body> já nasce com a classe
// "sem-login" no index.html, então nem pisca antes de conferir a sessão). Papel 'tv' cai direto no modo TV.
function aplicarTelaDeLogin() {
    const logado = !!sessaoAdminAtual;
    document.body.classList.toggle('sem-login', !logado);
    if (!logado) { if ($('telaLoginSenha')) $('telaLoginSenha').value = ''; setTimeout(() => $('telaLoginEmail') && $('telaLoginEmail').focus(), 50); return; }
    if (papelUsuarioAtual === 'tv') ativarModoTV(true);
}
function mostrarErroTelaLogin(msg) {
    const el = $('telaLoginErro'); if (!el) return;
    el.textContent = msg || ''; el.style.display = msg ? 'block' : 'none';
}
async function enviarTelaLogin() {
    const email = ($('telaLoginEmail').value || '').trim(), senha = $('telaLoginSenha').value || '';
    if (!email || !senha) { mostrarErroTelaLogin('Preencha o e-mail e a senha.'); return; }
    const btn = $('telaLoginEntrar'); btn.disabled = true; mostrarErroTelaLogin('');
    try { await fazerLoginAdmin(email, senha); } finally { btn.disabled = false; }
}

// Sem login, só a aba Sequenciamento fica disponível — as outras somem do
// menu. Não é só estética: como as ações de edição já ficam bloqueadas de
// qualquer forma (exigirAdmin), deixar as outras abas visíveis só deixaria
// o visitante perdido clicando em telas que não fazem sentido pro papel dele.
const ABAS_LIBERADAS_PARA_VISITANTE = ['aba-prioridades', 'aba-kpi', 'aba-seq-costura'];
const ABAS_LIBERADAS_PARA_SEQUENCIA = ['aba-seq-costura', 'aba-kpi', 'aba-plano-costura', 'aba-producao-grupo'];   // papel "sequencia" (Luis): Sequência da costura + só o bloco de eficiência da costura no KPI + Plano da costura
const ABAS_LIBERADAS_PARA_USUARIO = ['aba-prioridades', 'aba-kpi', 'aba-seq-costura', 'aba-urgencias', 'aba-producao-grupo', 'aba-preparacao'];
const ABAS_LIBERADAS_PARA_TV = ['aba-fila'];   // papel 'tv' (e conta sem papel): só a Fila Geral, em modo TV
function abaLiberadaAgora(idAba) {
    if (!sessaoAdminAtual) return false;   // sem login não vê nenhuma aba (fica na tela de login)
    if (papelUsuarioAtual === 'admin') return true;
    if (papelUsuarioAtual === 'usuario') return ABAS_LIBERADAS_PARA_USUARIO.includes(idAba);
    if (papelUsuarioAtual === 'sequencia') return ABAS_LIBERADAS_PARA_SEQUENCIA.includes(idAba);
    return ABAS_LIBERADAS_PARA_TV.includes(idAba);
}
// Primeira aba que o papel pode ver — pra onde vai quando tenta abrir uma aba proibida.
function abaInicialDoPapel() {
    if (papelUsuarioAtual === 'tv') return 'aba-fila';
    if (papelUsuarioAtual === 'sequencia') return 'aba-seq-costura';
    return 'aba-prioridades';
}
function aplicarRestricaoDeAbaVisitante() {
    document.body.classList.toggle('modo-visitante', !sessaoAdminAtual || papelUsuarioAtual === 'sequencia');   // o papel "sequencia" vê a tela como visitante (sem botões de admin)
    // Seletor por ID (não por classe .tab-btn) de propósito — algumas abas
    // moraram pra dentro do menu "MAIS" e usam outra classe visual (.btn),
    // mas ainda precisam ser escondidas certinho pra quem não é admin.
    $$('[id^="abrirAba-"]').forEach(btn => {
        const idAba = btn.id.replace('abrirAba-', '');
        btn.style.display = abaLiberadaAgora(idAba) ? '' : 'none';
    });
    // O botão "MAIS" em si só faz sentido aparecer se tiver pelo menos uma
    // aba liberada lá dentro — senão abriria um menu vazio.
    if ($('btnMenuMaisAbas')) {
        const temAlgumaLiberada = ABAS_DENTRO_DO_MENU_MAIS.some(abaLiberadaAgora);
        $('btnMenuMaisAbas').closest('.dropdown-container').style.display = temAlgumaLiberada ? '' : 'none';
    }
    // Se a aba aberta agora não é mais permitida (ex: era admin e deslogou),
    // joga pra Prioridades em vez de deixar a tela numa aba escondida.
    const abaAtivaEl = document.querySelector('.aba-conteudo.ativa');
    if (sessaoAdminAtual && abaAtivaEl && !abaLiberadaAgora(abaAtivaEl.id)) {
        if (papelUsuarioAtual === 'sequencia' && $('abrirAba-aba-seq-costura')) $('abrirAba-aba-seq-costura').click();   // abre a única aba dele (o clique também carrega a tela)
        else abrirAba(null, abaInicialDoPapel());
    }
}

async function fazerLoginAdmin(email, senha) {
    if (!supabaseClient) { showToast('Conexão com a nuvem não foi iniciada — veja o console de depuração.', true); return; }
    let resultado;
    try {
        resultado = await supabaseClient.auth.signInWithPassword({ email, password: senha });
    } catch (e) {
        registrarLogDebug('error', ['Login falhou (erro de rede/conexão): ' + e.message]);
        mostrarErroTelaLogin('Sem conexão com a nuvem. Confira a internet e tente de novo.');
        showToast('<i class="fas fa-triangle-exclamation"></i> Falha de conexão com a nuvem. Veja o console de depuração.', true);
        return;
    }
    const { data, error } = resultado;
    if (error) {
        registrarLogDebug('error', ['Login recusado pelo Supabase: ' + error.message]);
        mostrarErroTelaLogin(/invalid login credentials/i.test(error.message) ? 'E-mail ou senha incorretos.' : error.message);
        showToast('<i class="fas fa-triangle-exclamation"></i> ' + error.message, true);
        return;
    }
    sessaoAdminAtual = data.session;
    await verificarPapelUsuario();
    atualizarIndicadorLogin();
    fecharModais();
    if (papelUsuarioAtual !== 'admin') carregarTudoDaNuvemParaVisitante();   // quem não é admin vê o que foi publicado
    showToast(papelUsuarioAtual === 'usuario'
        ? "<i class='fas fa-check'></i> Login feito — você pode importar planilhas."
        : (papelUsuarioAtual === 'sequencia' ? "<i class='fas fa-check'></i> Login feito — acesso à Sequência da costura."
        : (papelUsuarioAtual === 'tv' ? "<i class='fas fa-tv'></i> Login feito — modo TV." : "<i class='fas fa-check'></i> Login feito — você é admin agora.")));
}

// Sair recarrega a página: volta limpo pra tela de login, sem sobrar nada do que estava na tela.
async function fazerLogoutAdmin() {
    if (!supabaseClient) return;
    try { await supabaseClient.auth.signOut(); } catch (e) { registrarLogDebug('error', ['Falha ao sair: ' + e.message]); }
    sessaoAdminAtual = null;
    papelUsuarioAtual = null;
    location.reload();
}
// Se a sessão acabar por fora (saiu em outra aba, login expirou), volta pra tela de login.
if (supabaseClient) supabaseClient.auth.onAuthStateChange(evento => {
    if (evento === 'SIGNED_OUT' && sessaoAdminAtual) { sessaoAdminAtual = null; papelUsuarioAtual = null; location.reload(); }
});

// Envia o bancoDadosOPs atual (o que está na tela agora) pra nuvem, de uma
// vez, em lotes de 500 (limite prático de uma chamada só). Só funciona
// logado — sem login, o Supabase já bloqueia isso sozinho (RLS).
function abrirModalLoginAdmin() {
    if (sessaoAdminAtual) { if (confirm('Sair do sistema?')) fazerLogoutAdmin(); return; }
    $('modalLoginAdmin').innerHTML = `
        <div class="modal-card" style="width:340px; max-width:90vw; border-top:5px solid var(--cor-roxo);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
                <h2 style="margin:0; font-size:16px; display:flex; align-items:center; gap:8px;"><i class="fas fa-user-lock" style="color:var(--cor-roxo);"></i> ENTRAR COMO ADMIN</h2>
                <button onclick="fecharModais()" class="modal-fechar-btn"><i class="fas fa-times"></i></button>
            </div>
            <div style="display:flex; flex-direction:column; gap:10px;">
                <div class="campo-meta"><label>E-MAIL</label><input type="text" id="loginAdminEmail"></div>
                <div class="campo-meta"><label>SENHA</label><input type="password" id="loginAdminSenha"></div>
                <button id="btnConfirmarLoginAdmin" class="btn btn-acao" style="margin-top:6px;"><i class="fas fa-right-to-bracket"></i> ENTRAR</button>
            </div>
        </div>
    `;
    $('modalLoginAdmin').style.display = 'flex';
    $('btnConfirmarLoginAdmin').onclick = () => fazerLoginAdmin($('loginAdminEmail').value.trim(), $('loginAdminSenha').value);
    $('loginAdminSenha').onkeyup = (e) => { if (e.key === 'Enter') fazerLoginAdmin($('loginAdminEmail').value.trim(), $('loginAdminSenha').value); };
}
