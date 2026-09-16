// A casca: carrega a fita, escolhe a tela, cuida do aviso de backup.

import * as ev from "./eventos.js";
import * as dados from "./dados.js";
import * as bk from "./backup.js";
import { el, $, limpar, avisar, erro, caixa, confirmar } from "./ui.js";

const TELAS = [
  { id: "hoje", icone: "☀", nome: "Hoje", carregar: () => import("./tela/hoje.js") },
  { id: "semana", icone: "▦", nome: "Semana", carregar: () => import("./tela/semana.js") },
  { id: "carteira", icone: "☰", nome: "Carteira", carregar: () => import("./tela/carteira.js") },
  { id: "frota", icone: "▤", nome: "Frota", carregar: () => import("./tela/frota.js") },
  { id: "indicadores", icone: "◔", nome: "Números", carregar: () => import("./tela/indicadores.js") },
  { id: "historico", icone: "⟲", nome: "Registro", carregar: () => import("./tela/historico.js") },
  { id: "importar", icone: "⇪", nome: "Importar", carregar: () => import("./tela/importar.js") },
];

const ctx = {
  ir(id, params = "") { location.hash = "#/" + id + (params ? "?" + params : ""); },
  atualizar() { pintar(); },
};

let atual = null;

function alvo() {
  const h = (location.hash || "").replace(/^#\/?/, "");
  const [id, q] = h.split("?");
  return { id: TELAS.some(t => t.id === id) ? id : "hoje", params: new URLSearchParams(q || "") };
}

function pintarNav(id) {
  const nav = $("#nav");
  limpar(nav);
  for (const t of TELAS) {
    nav.append(el("a", { href: "#/" + t.id, class: t.id === id ? "ativo" : "" },
      el("b", {}, t.icone), el("span", {}, t.nome)));
  }
}

async function pintar() {
  const { id, params } = alvo();
  pintarNav(id);
  const tela = TELAS.find(t => t.id === id);
  const raiz = $("#tela");
  if (atual && atual.desmontar) { try { atual.desmontar(); } catch (e) { /* segue */ } }
  limpar(raiz);
  try {
    const mod = await tela.carregar();
    atual = (await mod.montar(raiz, ctx, params)) || null;
  } catch (e) {
    console.error(e);
    limpar(raiz).append(el("p", { class: "nada" }, "Não consegui abrir esta tela: " + e.message));
  }
  await faixa();
  window.scrollTo(0, 0);
}

// ── a faixa de avisos do topo ───────────────────────────────────────────────
// Só aparece quando há o que dizer. Duas coisas moram aqui: onde os dados estão
// sendo guardados, quando não é o lugar bom, e há quanto tempo não se faz uma
// cópia — com o número de lançamentos que se perderiam.

async function faixa() {
  const f = $("#faixa");
  limpar(f);
  f.className = "";

  if (dados.modo === "memória") {
    f.append(el("span", {}, "⚠ Este navegador não deixa guardar dados. " +
      "Enquanto esta aba estiver aberta funciona, mas nada fica salvo — " +
      "exporte um backup antes de fechar."));
    return;
  }

  if (!ev.log.length) return;

  const b = await bk.estado();
  const perigo = b.nunca ? b.desde > 30 : (b.desde > 50 || b.dias > 7);
  const morno = !perigo && (b.nunca || b.desde > 0);
  if (!perigo && !morno) return;

  f.className = perigo ? "" : "morna";
  const texto = b.nunca
    ? `Você ainda não salvou nenhuma cópia de segurança — ${b.desde} lançamentos só existem neste navegador.`
    : `Última cópia há ${b.dias === 0 ? "menos de um dia" : b.dias + (b.dias === 1 ? " dia" : " dias")}` +
      (b.desde ? `, com ${b.desde} lançamento${b.desde === 1 ? "" : "s"} depois dela.` : ".");
  f.append(el("span", {}, texto),
    el("button", { class: "discreto", onclick: salvarBackup }, "Salvar agora"));
}

async function salvarBackup() {
  bk.baixar(await bk.exportar(), bk.nomeDoArquivo());
  await bk.marcarFeito();
  avisar("Cópia salva. Guarde o arquivo fora deste computador.");
  await faixa();
}

// ── tema ────────────────────────────────────────────────────────────────────

async function aplicarTema() {
  const t = await dados.lerMeta("tema", "");
  document.documentElement.dataset.tema = t;
}

// ── começo ──────────────────────────────────────────────────────────────────

async function comecar() {
  await ev.carregar();
  await aplicarTema();

  $("#btema").addEventListener("click", async () => {
    const agora = document.documentElement.dataset.tema;
    const novo = agora === "escuro" ? "claro" : agora === "claro" ? "" : "escuro";
    document.documentElement.dataset.tema = novo;
    await dados.gravarMeta("tema", novo);
  });
  $("#bbackup").addEventListener("click", salvarBackup);

  window.addEventListener("hashchange", pintar);
  ev.ouvir(() => { faixa(); });

  // Primeira vez: sem nenhum evento, a carteira vazia não explica nada. Manda
  // direto para a importação, que é o único caminho que faz sentido ali.
  if (!ev.log.length && !location.hash) location.hash = "#/importar";

  await pintar();
  registrarOffline();
}

function registrarOffline() {
  if (!("serviceWorker" in navigator)) return;
  if (location.protocol === "file:") return;   // sem origem, não há offline
  navigator.serviceWorker.register("sw.js").catch(() => { /* segue sem offline */ });
}

comecar().catch(e => {
  console.error(e);
  $("#tela").innerHTML = "";
  $("#tela").append(el("p", { class: "nada" },
    "Não consegui começar: " + e.message));
});

// Deixado à mão para conferência pelo console — `mkt.conferir()` toca a fita de
// novo e diz se o que está na tela veio dela.
globalThis.mkt = { ev, dados, bk, conferir: () => ev.conferir() };
