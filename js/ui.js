// Ferramenta de tela: criar elemento, abrir caixa, avisar.
//
// Sem framework de propósito. O que o site faz — listar, filtrar, abrir uma
// caixa, gravar um evento — cabe em manipulação direta de DOM, e o site antigo
// mostrou que o custo de manter uma camada a mais não se paga aqui.

export function el(tag, props = {}, ...filhos) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === "class") n.className = v;
    else if (k === "html") n.innerHTML = v;
    else if (k === "dataset") Object.assign(n.dataset, v);
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else if (k in n && k !== "list" && k !== "form") n[k] = v;
    else n.setAttribute(k, v);
  }
  for (const f of filhos.flat(9)) {
    if (f == null || f === false) continue;
    n.append(f instanceof Node ? f : document.createTextNode(String(f)));
  }
  return n;
}

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export function limpar(n) { while (n.firstChild) n.removeChild(n.firstChild); return n; }

// ── datas na tela ───────────────────────────────────────────────────────────

export function br(iso) {
  if (!iso) return "—";
  const [a, m, d] = String(iso).split("-");
  return `${d}/${m}/${a}`;
}

export function brCurto(iso) {
  if (!iso) return "—";
  const [, m, d] = String(iso).split("-");
  return `${d}/${m}`;
}

export function quando(ts) {
  const d = new Date(ts);
  const p = n => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// ── caixa de diálogo ────────────────────────────────────────────────────────

let aberta = null;

/** Abre uma caixa e devolve o que o botão escolhido devolver.
 *
 *  `corpo` recebe um objeto `ctx` com `fechar(valor)` para o conteúdo poder
 *  resolver sozinho — é o que um formulário faz ao ser enviado. */
export function caixa({ titulo, corpo, acoes = [], largura = "" }) {
  return new Promise(resolve => {
    const fundo = el("div", { class: "fundo" });
    const cx = el("div", { class: "caixa", role: "dialog", "aria-modal": "true",
      "aria-label": titulo });
    if (largura) cx.style.maxWidth = largura;

    let resolvido = false;
    const fechar = v => {
      if (resolvido) return;
      resolvido = true;
      fundo.remove();
      document.body.classList.remove("travado");
      document.removeEventListener("keydown", tecla);
      aberta = null;
      resolve(v);
    };
    const tecla = e => { if (e.key === "Escape") fechar(undefined); };

    const conteudo = typeof corpo === "function" ? corpo({ fechar }) : corpo;
    cx.append(
      el("header", {},
        el("h2", {}, titulo),
        el("button", { class: "x", title: "Fechar", onclick: () => fechar(undefined) }, "×")),
      el("div", { class: "corpo" }, conteudo),
      acoes.length ? el("footer", {}, acoes.map(a =>
        el("button", {
          class: a.classe || "",
          onclick: async () => {
            try { fechar(a.valor !== undefined ? a.valor : (a.acao ? await a.acao() : true)); }
            catch (e) { erro(e.message || String(e)); }
          },
        }, a.rotulo))) : null);

    fundo.append(cx);
    fundo.addEventListener("click", e => { if (e.target === fundo) fechar(undefined); });
    document.body.append(fundo);
    document.body.classList.add("travado");
    document.addEventListener("keydown", tecla);
    aberta = fechar;
    const foco = cx.querySelector("input, select, textarea, button");
    if (foco) setTimeout(() => foco.focus(), 30);
  });
}

export function fecharCaixa() { if (aberta) aberta(undefined); }

export async function confirmar(titulo, texto, rotuloSim = "Confirmar") {
  return await caixa({
    titulo,
    corpo: el("p", {}, texto),
    acoes: [
      { rotulo: "Cancelar", valor: false },
      { rotulo: rotuloSim, classe: "primario", valor: true },
    ],
  }) === true;
}

// ── avisos ──────────────────────────────────────────────────────────────────

export function avisar(texto, tipo = "") {
  const n = el("div", { class: "aviso " + tipo }, texto);
  let caixaAvisos = $("#avisos");
  if (!caixaAvisos) {
    caixaAvisos = el("div", { id: "avisos" });
    document.body.append(caixaAvisos);
  }
  caixaAvisos.append(n);
  setTimeout(() => n.classList.add("saindo"), 3600);
  setTimeout(() => n.remove(), 4200);
}

export const erro = t => avisar(t, "ruim");

// ── formulário ──────────────────────────────────────────────────────────────

export function campo(rotulo, entrada, dica = "") {
  return el("label", { class: "campo" },
    el("span", {}, rotulo),
    entrada,
    dica ? el("small", {}, dica) : null);
}

export function selecao(opcoes, valor, props = {}) {
  return el("select", props, opcoes.map(o => {
    const v = typeof o === "string" ? o : o.v;
    const t = typeof o === "string" ? o : o.t;
    return el("option", { value: v, selected: String(v) === String(valor ?? "") }, t);
  }));
}

/** Lista de sugestões para um campo de texto livre — executante, frota, motivo.
 *  Digitar continua valendo: a lista é atalho, não gaiola. */
export function comSugestoes(entrada, valores, id) {
  const dl = el("datalist", { id }, valores.map(v => el("option", { value: v })));
  entrada.setAttribute("list", id);
  return el("span", { class: "com-lista" }, entrada, dl);
}

export function chip(texto, classe = "") {
  return el("span", { class: "chip " + classe }, texto);
}

/** Barra de proporção, para os indicadores. SVG na mão porque é uma barra:
 *  puxar uma biblioteca de gráfico para isto custaria mais do que resolve. */
export function barras(itens, { altura = 26 } = {}) {
  const total = itens.reduce((s, i) => s + i.valor, 0) || 1;
  return el("div", { class: "barras" }, itens.map(i => {
    const pct = i.valor * 100 / total;
    return el("div", { class: "barra", title: `${i.rotulo}: ${i.valor} (${Math.round(pct)}%)` },
      el("div", { class: "trilho" },
        el("div", { class: "cheio " + (i.cor || ""), style: `width:${pct}%;height:${altura}px` })),
      el("div", { class: "leg" },
        el("b", {}, String(i.valor)), " ", i.rotulo,
        el("i", {}, ` ${Math.round(pct)}%`)));
  }));
}

export function medidor(pct, rotulo) {
  const p = pct == null ? 0 : Math.max(0, Math.min(100, pct));
  const cor = pct == null ? "neutro" : (p >= 90 ? "bom" : p >= 70 ? "medio" : "ruim");
  return el("div", { class: "medidor " + cor },
    el("div", { class: "num" }, pct == null ? "—" : `${p}%`),
    el("div", { class: "trilho" }, el("div", { class: "cheio", style: `width:${p}%` })),
    el("div", { class: "rot" }, rotulo));
}

export function cartaoNumero(valor, rotulo, detalhe = "", classe = "") {
  return el("div", { class: "cartao-num " + classe },
    el("div", { class: "v" }, String(valor)),
    el("div", { class: "r" }, rotulo),
    detalhe ? el("div", { class: "d" }, detalhe) : null);
}

export function vazio(texto) {
  return el("p", { class: "nada" }, texto);
}
