// OS Makro: o painel de OS do Protheus como uma tela do site (09/11/2026).
//
// Era uma página à parte (os.html), aberta por um link; agora mora no mesmo
// menu, com o mesmo login, o mesmo topo e o mesmo tema das movimentações e
// preventivas. O painel (js/os/painel.js) desenha numa área isolada (shadow
// DOM) com o css/os.css: ele usa nomes de estilo iguais aos do site (kpi, aba,
// botao…), e assim um não bagunça o outro. As cores de base e a fonte
// atravessam a fronteira: vêm do site, que decide o claro e o escuro.
//
// Quem vê: o banco decide — `ve_os()`, a marca `os_makro` em `pessoas`
// (sql/04_painel_os.sql). Os dados vêm do bucket privado `painel-os`
// (atual.json.gz); a lista do bucket diz quando ele mudou, para não baixar tudo
// à toa. Uma cópia fica neste aparelho para abrir sem rede, presa ao e-mail de
// quem baixou — e sai quando a pessoa sai (js/nuvem.js).

import * as dados from "../dados.js";
import * as nuvem from "../nuvem.js";
import { iniciarPainel } from "../os/painel.js";
import { abrirImportar, baixarJSON, arquivosDoPainel } from "../os/importar.js";

const GUARDA = "painel_os";
const br = (iso) => (iso ? iso.slice(8, 10) + "/" + iso.slice(5, 7) + "/" + iso.slice(0, 4) : "");

function el(tag, attrs = {}, ...filhos) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "on") for (const [ev, fn] of Object.entries(v)) e.addEventListener(ev, fn);
    else if (k === "text") e.textContent = v;
    else if (v !== null && v !== undefined && v !== false) e.setAttribute(k, v);
  }
  for (const f of filhos.flat()) if (f !== null && f !== undefined && f !== false) e.append(f);
  return e;
}

// O d3 só carrega quando a tela abre: o resto do site não usa.
let d3P = null;
function carregarD3() {
  if (globalThis.d3) return Promise.resolve();
  return d3P || (d3P = new Promise((ok, erro) => {
    const s = document.createElement("script");
    s.src = new URL("../../vendor/d3.min.js", import.meta.url).href;
    s.onload = ok;
    s.onerror = () => { d3P = null; erro(new Error("Não carregou o desenhador de gráficos (sem rede?).")); };
    document.head.append(s);
  }));
}

// O estilo do painel, dentro da área isolada. Espera carregar, para não piscar sem estilo.
const estilo = (sombra) => new Promise((ok) => {
  const l = document.createElement("link");
  l.rel = "stylesheet";
  l.href = new URL("../../css/os.css", import.meta.url).href;
  l.onload = l.onerror = ok;
  sombra.append(l);
});

/** O download de um arquivo pelo próprio navegador (CSV, imagem, PDF). */
const baixar = {
  async save({ filename, data }) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(data);
    a.download = filename;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 30000);
  },
};

export async function montar(raiz, ctx, params = new URLSearchParams()) {
  const host = el("div", { class: "os-host" });
  raiz.append(host);
  const sombra = host.attachShadow({ mode: "open" });
  // o tema é o do site: copia a escolha e acompanha o ◐
  const tema = () => { host.dataset.tema = document.documentElement.dataset.tema === "claro" ? "claro" : "escuro"; };
  tema();
  const vigia = new MutationObserver(tema);
  vigia.observe(document.documentElement, { attributes: true, attributeFilter: ["data-tema"] });

  // `vez`: cada abertura tem a sua; a que perdeu a vez (tela fechada, ou "Tentar de novo" de novo) para
  // onde estiver, sem mexer no molde da mais nova
  let vivo = true, painel = null, atualD = null, vez = 0;
  const $ = (s) => sombra.querySelector(s);
  const parar = () => { if (painel) { painel.parar(); painel = null; } };
  const tentarDeNovo = () => el("button", { type: "button", class: "botao", text: "Tentar de novo", on: { click: () => abrir() } });

  /** Um molde novo a cada abertura: os ouvintes do painel anterior vão embora com os elementos dele. */
  function novoMolde() {
    parar();
    for (const n of [...sombra.childNodes]) if (n.nodeName !== "LINK") n.remove();
    sombra.append(document.getElementById("molde-os").content.cloneNode(true));
  }
  /** A porta: uma mensagem e o que fazer, no lugar do painel. */
  function porta(titulo, texto, ...acoes) {
    $("#os-porta").hidden = false;
    $("#os-porta").replaceChildren(el("div", { class: "porta-caixa" },
      el("h2", { text: titulo }), texto ? el("p", { text: texto }) : null,
      acoes.length ? el("div", { class: "porta-acoes" }, ...acoes) : null));
  }
  function mostrar(D, aviso = "") {
    atualD = D;
    $("#os-porta").hidden = true;
    for (const s of [".os-cab", ".abas", ".barra", ".pg"]) $(s).hidden = false;
    painel = iniciarPainel(aviso ? { ...D, aviso } : D, { baixar, raiz: sombra, aba: params.get("aba") || "",
      // a aba vai para o endereço sem trocar de tela (recarregar volta nela)
      aoTrocarAba: (aba) => history.replaceState(null, "", "#/os" + (aba && aba !== "geral" ? "?aba=" + aba : "")) });
  }

  function abrir() {
    const minha = ++vez;
    const vale = () => vivo && minha === vez;
    return comecar(vale).catch((e) => { console.error(e); if (vale()) porta("Não deu para abrir o painel", String((e && e.message) || e), tentarDeNovo()); });
  }

  async function comecar(vale) {
    novoMolde();
    if (!nuvem.ligada() || !nuvem.autenticado()) {
      return porta("Entre primeiro", "O painel de OS usa o mesmo acesso das movimentações e preventivas.",
        el("a", { class: "botao", href: "#/entrar", text: "Entrar" }));
    }
    const email = nuvem.emailAtual();
    const guardado = await dados.lerMeta(GUARDA, null);
    const meu = guardado && guardado.email === email && guardado.D ? guardado : null;
    // ver e atualizar são duas marcas (sql/06): quem só vê não tem o "Atualizar com o Protheus"
    const [pode, atualiza] = await Promise.all([nuvem.veOs(), nuvem.atualizaOs()]);
    if (!vale()) return;
    if (!nuvem.autenticado()) return porta("Entre de novo", nuvem.motivoDaSaida() || "Sua sessão terminou.", el("a", { class: "botao", href: "#/entrar", text: "Entrar" }));
    if (pode === false) {
      // o banco disse que não: o que houver guardado neste aparelho também sai
      if (guardado) await dados.gravarMeta(GUARDA, null);
      if (!vale()) return;
      return porta("Este painel não está liberado para o seu acesso",
        "O painel de OS do Protheus é só de quem o PCM liberou. Se você precisa dele, peça ao Mateus.");
    }
    const botaoAtualizar = $("#os-atualizar");
    botaoAtualizar.hidden = !(pode && atualiza);
    if (pode && atualiza) botaoAtualizar.addEventListener("click", () => abrirImportar({ atual: () => atualD, aoGravar: gravouNovo, raiz: sombra }));
    try { await carregarD3(); } catch (e) { if (vale()) porta("Não deu para abrir o painel", e.message, tentarDeNovo()); return; }
    if (!vale()) return;
    if (pode === null) {
      if (meu) return mostrar(meu.D, `Sem conexão com o banco: este é o painel guardado neste aparelho (Protheus de ${br(meu.D.base)}).`);
      return porta("Sem conexão", "Não deu para falar com o banco agora, e este aparelho ainda não tem o painel guardado. Tente de novo quando tiver sinal.", tentarDeNovo());
    }
    porta("Abrindo o painel…", "");
    let atual = null, versao = "";
    try {
      const lista = await arquivosDoPainel();
      if (lista.has("atual.json.gz")) {
        versao = lista.get("atual.json.gz").versao;
        if (meu && meu.versao === versao) { if (vale()) mostrar(meu.D); return; }
        atual = await baixarJSON("atual.json.gz");
      }
    } catch (e) {
      if (!vale()) return;
      if (meu) return mostrar(meu.D, `Não deu para baixar o painel novo (${e.message}); este é o guardado neste aparelho.`);
      return porta("Não deu para abrir o painel", e.message, tentarDeNovo());
    }
    if (!vale()) return;
    if (!atual || !atual.D) {
      if (!atualiza) return porta("O painel ainda não tem dados", "Quem atualiza o painel com o Protheus ainda não carregou os dados. Volte mais tarde.");
      return porta("O painel ainda não tem dados",
        "Para começar: clique em Atualizar com o Protheus e solte a base histórica (o arquivo historico-os.json.gz, uma vez só) junto com a STJ e a STL de hoje.",
        el("button", { type: "button", class: "botao prim", text: "Atualizar com o Protheus", on: { click: () => botaoAtualizar.click() } }));
    }
    await dados.gravarMeta(GUARDA, { email, versao, D: atual.D });
    if (vale()) mostrar(atual.D);
  }

  /** Gravou um painel novo: guarda neste aparelho e abre de novo, já com ele. */
  async function gravouNovo(pacote) {
    await dados.gravarMeta(GUARDA, { email: nuvem.emailAtual(), versao: "", D: pacote.D });
    if (vivo) abrir();
  }

  // a tela volta logo para o site; o painel abre sozinho quando chegar (e não abre se a tela já fechou)
  await estilo(sombra);
  if (vivo) abrir();
  return {
    desmontar() {
      vivo = false;
      parar();
      vigia.disconnect();
      const dlg = $("#os-importar");
      if (dlg && dlg.open) dlg.close();
    },
  };
}
