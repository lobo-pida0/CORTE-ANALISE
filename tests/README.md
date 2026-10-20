# Testes automáticos do Corte Pro

Abrem o `index.html` num navegador headless e conferem as regras de negócio (importação do KPI, ciclo + OP,
externo x fábrica, importar externo, grupos de produto, tempo no setor, nuvem, Excel do mês, backup).

```
cd tests
npm install
CHROMIUM_PATH=/caminho/do/chrome node run.js
```

Saída: "N verificações passaram, 0 falharam". Se falhar, a lista mostra o que era esperado e o que saiu.
Rode antes de publicar qualquer mudança em `kpi.js`, `kpi-detalhe.js`, `eficiencia-costura.js` ou `nuvem.js`.
Para cobrir uma regra nova, acrescente um bloco em `run.js` (use `L(...)` para montar linhas de relatório).
