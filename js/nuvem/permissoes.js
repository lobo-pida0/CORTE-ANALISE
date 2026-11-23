// -------------------------------------------------------------------------
// (separado de nuvem.js) Bloqueios de ação por papel (exigirAdmin, exigirAdminOuUsuario...).
// -------------------------------------------------------------------------
// Bloqueia uma ação se a pessoa não estiver logada como admin — chamada no
// COMEÇO de toda função que muda dado (sincronizar, importar, mover OP,
// etc). Sincronizar/editar sempre mexeu só no navegador de quem faz —
// nunca precisou de login pra isso. Mas deixar isso disponível pra quem só
// deveria estar visualizando é confuso (a pessoa mexe e nada realmente
// muda pros outros) — por isso passa a bloquear aqui, na origem da ação,
// e não só na hora de publicar.
function exigirAdmin(oQueIaFazer) {
    if (sessaoAdminAtual && papelUsuarioAtual === 'admin') return true;
    if (sessaoAdminAtual && papelUsuarioAtual === 'sequencia') {
        showToast(`<i class="fas fa-lock"></i> Seu acesso é só pra consultar a Sequência da costura — entre como admin pra ${oQueIaFazer || 'fazer isso'}.`, true);
        return false;
    }
    if (sessaoAdminAtual && papelUsuarioAtual === 'usuario') {
        showToast(`<i class="fas fa-lock"></i> Seu acesso é só pra importar planilhas — entre como admin pra ${oQueIaFazer || 'fazer isso'}.`, true);
        return false;
    }
    showToast(`<i class="fas fa-lock"></i> Modo visitante — entre como admin pra ${oQueIaFazer || 'fazer isso'}.`, true);
    return false;
}

// Igual exigirAdmin, mas também libera pra quem está logado com o papel
// "usuario" (acesso restrito) — usado só nas ações de IMPORTAR planilha,
// que foi a única coisa que esse papel tem permissão de fazer.
// Qualquer pessoa logada (admin, usuário ou o papel "sequencia") — pra ações da própria Sequência da costura (ocultar/remover/restaurar OP).
function exigirLogadoNaSequencia(oQueIaFazer) {
    if (sessaoAdminAtual) return true;
    showToast(`<i class="fas fa-lock"></i> Modo visitante — entre com login pra ${oQueIaFazer || 'fazer isso'}.`, true);
    return false;
}
function exigirAdminOuUsuario(oQueIaFazer) {
    if (sessaoAdminAtual && papelUsuarioAtual !== 'sequencia') return true;
    if (sessaoAdminAtual) { showToast(`<i class="fas fa-lock"></i> Seu acesso é só pra consultar a Sequência da costura.`, true); return false; }
    showToast(`<i class="fas fa-lock"></i> Modo visitante — entre com login pra ${oQueIaFazer || 'fazer isso'}.`, true);
    return false;
}
