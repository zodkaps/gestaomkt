// A porta do painel de OS (os.html): quem entra, o que abre e de onde vêm os
// dados (05/11/2026).
//
// O login é o mesmo do site (a sessão fica no IndexedDB, que as duas páginas
// dividem). Quem decide se a pessoa vê o painel é o banco — `ve_os()`, pela
// marca `os_makro` em `pessoas` —, e os dados vêm do bucket privado
// `painel-os`: atual.json.gz, o painel do dia. A lista do bucket diz quando ele
// mudou, para não baixar tudo à toa; uma cópia fica neste aparelho para abrir
// sem rede, presa ao e-mail de quem baixou.

import * as dados from "../dados.js";
import * as nuvem from "../nuvem.js";
import { iniciarPainel } from "./painel.js";
import { abrirImportar, baixarJSON, arquivosDoPainel } from "./importar.js";

const $ = (s) => document.querySelector(s);
const GUARDA = "painel_os";

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
const br = (iso) => (iso ? iso.slice(8, 10) + "/" + iso.slice(5, 7) + "/" + iso.slice(0, 4) : "");

/** A porta: uma mensagem e o que fazer, no lugar do painel. */
function porta(titulo, texto, ...acoes) {
  $("#os-porta").hidden = false;
  $("#os-porta").replaceChildren(el("div", { class: "porta-caixa" },
    el("h2", { text: titulo }), texto ? el("p", { text: texto }) : null,
    acoes.length ? el("div", { class: "porta-acoes" }, ...acoes) : null));
}
const linkSite = (rot = "Ir para o site") => el("a", { class: "botao", href: "./", text: rot });

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

let atualD = null;

function mostrar(D, aviso = "") {
  atualD = D;
  $("#os-porta").hidden = true;
  for (const s of [".abas", ".barra", "main.pg"]) $(s).hidden = false;
  if (aviso) { D = { ...D, aviso }; }
  iniciarPainel(D, { baixar });
}

async function comecar() {
  await dados.abrir();
  await nuvem.carregarConfig();
  if (!nuvem.ligada() || !nuvem.autenticado()) {
    return porta("Entre no site primeiro", "O painel de OS usa o mesmo acesso das movimentações e preventivas. Entre por lá e volte pelo menu, em OS Makro.", linkSite("Entrar no site"));
  }
  const email = nuvem.emailAtual();
  const guardado = await dados.lerMeta(GUARDA, null);
  const meu = guardado && guardado.email === email && guardado.D ? guardado : null;
  const pode = await nuvem.veOs();
  if (!nuvem.autenticado()) {
    return porta("Entre de novo", nuvem.motivoDaSaida() || "Sua sessão terminou. Entre no site e volte pelo menu.", linkSite("Entrar no site"));
  }
  if (pode === false) {
    // o banco disse que não: o que houver guardado neste aparelho também sai
    if (guardado) await dados.gravarMeta(GUARDA, null);
    return porta("Este painel não está liberado para o seu acesso",
      "O painel de OS do Protheus é só de quem o PCM liberou. Se você precisa dele, peça ao Mateus.", linkSite("Voltar ao site"));
  }
  const botaoAtualizar = $("#os-atualizar");
  botaoAtualizar.hidden = false;
  botaoAtualizar.addEventListener("click", () => abrirImportar({ atual: () => atualD, email, aoGravar: gravouNovo }));
  if (pode === null) {
    if (meu) return mostrar(meu.D, `Sem conexão com o banco: este é o painel guardado neste aparelho (Protheus de ${br(meu.D.base)}).`);
    return porta("Sem conexão", "Não deu para falar com o banco agora, e este aparelho ainda não tem o painel guardado. Tente de novo quando tiver sinal.",
      el("button", { type: "button", class: "botao", text: "Tentar de novo", on: { click: () => location.reload() } }));
  }
  porta("Abrindo o painel…", "");
  let atual = null, versao = "";
  try {
    const lista = await arquivosDoPainel();
    if (lista.has("atual.json.gz")) {
      versao = lista.get("atual.json.gz").versao;
      if (meu && meu.versao === versao) return mostrar(meu.D);
      atual = await baixarJSON("atual.json.gz");
    }
  } catch (e) {
    if (meu) return mostrar(meu.D, `Não deu para baixar o painel novo (${e.message}); este é o guardado neste aparelho.`);
    return porta("Não deu para abrir o painel", e.message, el("button", { type: "button", class: "botao", text: "Tentar de novo", on: { click: () => location.reload() } }));
  }
  if (!atual || !atual.D) {
    return porta("O painel ainda não tem dados",
      "Para começar: clique em Atualizar com o Protheus e solte a base histórica (o arquivo historico-os.json.gz, uma vez só) junto com a STJ e a STL de hoje.",
      el("button", { type: "button", class: "botao prim", text: "Atualizar com o Protheus", on: { click: () => botaoAtualizar.click() } }), linkSite("Voltar ao site"));
  }
  await dados.gravarMeta(GUARDA, { email, versao, D: atual.D });
  mostrar(atual.D);
}

/** Gravou um painel novo: guarda neste aparelho e abre de novo, já com ele. */
async function gravouNovo(pacote) {
  await dados.gravarMeta(GUARDA, { email: nuvem.emailAtual(), versao: "", D: pacote.D });
  location.reload();
}

comecar().catch((e) => {
  console.error(e);
  porta("Não deu para abrir o painel", String(e && e.message || e), linkSite("Voltar ao site"));
});
