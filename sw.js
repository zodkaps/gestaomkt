// Funcionar sem internet.
//
// O pátio tem canto sem sinal, e programação que só abre com rede não serve
// para dar baixa na oficina. Os arquivos do site cabem todos no cache; os dados
// nunca passam por aqui — eles moram no IndexedDB, que já é local.
//
// A estratégia é rede primeiro, cache como rede reserva: assim uma versão nova
// do site chega sem precisar de truque, e a falta de rede não trava nada.

const VERSAO = "mkt-v6";
const ARQUIVOS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/mkt.css",
  "./vendor/xlsx.mini.min.js",
  "./js/app.js",
  "./js/ui.js",
  "./js/dados.js",
  "./js/eventos.js",
  "./js/modelo.js",
  "./js/texto.js",
  "./js/planilha.js",
  "./js/importar.js",
  "./js/backup.js",
  "./js/tela/comum.js",
  "./js/tela/hoje.js",
  "./js/tela/semana.js",
  "./js/tela/programacao.js",
  "./js/tela/grade.js",
  "./js/tela/resultados.js",
  "./js/tela/frota.js",
  "./js/tela/indicadores.js",
  "./js/tela/historico.js",
  "./js/tela/importar.js",
  "./js/tela/entrar.js",
  "./js/tela/operacao.js",
  "./js/tela/movimentacoes.js",
  "./js/tela/preventivas.js",
  "./js/tela/diagnostico.js",
  "./js/nuvem.js",
  "./js/pessoas.js",
  "./js/config.js",
  // Os arquivos SQL entram no cache porque o diagnóstico os mostra para copiar:
  // quem está consertando a instalação é justamente quem não tem o site
  // funcionando inteiro.
  "./sql/01_esquema.sql",
  "./sql/02_acesso.sql",
  "./sql/03_liberar_acessos.sql",
  "./sql/00_conferir_rls.sql",
];

self.addEventListener("install", e => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSAO);
    // addAll falha inteiro se um arquivo falhar; um a um, o que der certo fica.
    await Promise.all(ARQUIVOS.map(a => c.add(a).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSAO) await caches.delete(k);
    self.clients.claim();
  })());
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  e.respondWith((async () => {
    try {
      const resp = await fetch(req);
      if (resp && resp.ok) {
        const c = await caches.open(VERSAO);
        c.put(req, resp.clone());
      }
      return resp;
    } catch (erro) {
      const guardado = await caches.match(req);
      if (guardado) return guardado;
      if (req.mode === "navigate") {
        const casca = await caches.match("./index.html");
        if (casca) return casca;
      }
      throw erro;
    }
  })());
});
