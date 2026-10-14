// A folha de pendências — o papel que vai com o caminhão para a oficina.
//
// O desenho é o da folha que o PCM já usava: a frota grande no alto, a linha de
// resumo, um filete, e as atividades agrupadas por executante e, dentro, pela
// janela de dias em que estão programadas. Cada linha tem o quadrado para marcar
// o feito e a linha "Quem fez" para escrever à mão. É papel de pátio, não
// relatório — e imprimir não grava nada.
//
// Três jeitos de chegar nela: a semana inteira (uma folha por frota), uma frota
// só (o botão do bloco, ou a tela Frota) e, para quem distribui o serviço, por
// executante. Frota que não cabe numa página continua na seguinte, com o
// cabeçalho repetido e "página 1 de 2" no pé: a paginação é medida, não chutada.

import * as ev from "../eventos.js";
import * as M from "../modelo.js";
import { el, br, brCurto, caixa, campo, selecao, erro } from "../ui.js";
import { valoresDe } from "./comum.js";

const SEM = "__sem";                       // "sem executante", na lista de escolha
const A_DEFINIR = "Executante a definir";
const natural = (a, b) => String(a).localeCompare(String(b), "pt-BR", { numeric: true });
const DIA_NOME = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

/** A pendência nasceu no TOP? A observação começa por ele: "[06/10] TOP: …".
 *  Item do backlog que só CITA o TOP no meio ("… · TOP 06/10: 'cortinas'
 *  conforme, conferir") não é do TOP e não leva a etiqueta. */
export const doTOP = a => /^\s*\[\d{1,2}\/\d{1,2}\]\s*TOP\b/.test(a.obs || "");

/** A janela de dias da atividade: "terça 06/10 a sexta 09/10". */
function janelaDe(a) {
  const ini = M.inicioDe(a);
  if (!ini) return { chave: "~", rotulo: "Sem data — carteira" };
  const fim = M.prazoDe(a) || ini;
  const nome = d => `${DIA_NOME[M.data(d).getUTCDay()]} ${brCurto(d)}`;
  return { chave: `${ini}|${fim}`, rotulo: ini === fim ? nome(ini) : `${nome(ini)} a ${nome(fim)}` };
}

/** A preventiva primeiro; depois com OS, o resto em ordem alfabética, e o que
 *  veio do TOP no fim. */
const ordemLinha = (a, b) => (M.ehPreventiva(b) ? 1 : 0) - (M.ehPreventiva(a) ? 1 : 0) || (a.os ? 0 : 1) - (b.os ? 0 : 1) ||
  (doTOP(a) ? 1 : 0) - (doTOP(b) ? 1 : 0) || natural(a.atividade || "", b.atividade || "");

function porJanela(itens) {
  const m = new Map();
  for (const a of itens) {
    const j = janelaDe(a);
    if (!m.has(j.chave)) m.set(j.chave, { ...j, itens: [] });
    m.get(j.chave).itens.push(a);
  }
  return [...m.values()].sort((x, y) => x.chave.localeCompare(y.chave))
    .map(j => ({ rotulo: j.rotulo, itens: j.itens.sort(ordemLinha) }));
}

const quemDe = a => (a.executantes || []).filter(Boolean).join(" e ") || A_DEFINIR;

function emitida() {
  const d = new Date();
  return `${br(M.hoje())} às ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

// ── os modelos de folha ─────────────────────────────────────────────────────

/** A folha de uma frota: grupos por executante, janelas dentro. */
export function folhaDaFrota(frota, itens, contexto = "") {
  const abertas = itens.filter(M.aberta);
  const grupos = new Map();
  for (const a of abertas) {
    const q = quemDe(a);
    if (!grupos.has(q)) grupos.set(q, []);
    grupos.get(q).push(a);
  }
  const cliente = (abertas.find(a => a.cliente) || {}).cliente || "";
  return {
    titulo: frota || "Sem frota", extra: cliente,
    resumo: ["Pendências em aberto", plural(abertas.length, "atividade", "atividades"),
      contexto, `impressa em ${emitida()}`].filter(Boolean).join(" · "),
    rodape: frota || "Sem frota",
    grupos: [...grupos].sort((x, y) => (x[0] === A_DEFINIR) - (y[0] === A_DEFINIR) || natural(x[0], y[0]))
      .map(([nome, l]) => ({ nome, n: l.length, sub: porJanela(l) })),
  };
}

/** A folha de um executante: grupos por frota. */
function folhaDoExecutante(nome, itens, contexto = "") {
  const porFrota = new Map();
  for (const a of itens) {
    if (!porFrota.has(a.frota)) porFrota.set(a.frota, []);
    porFrota.get(a.frota).push(a);
  }
  return {
    titulo: nome, extra: "",
    resumo: ["Pendências em aberto", plural(itens.length, "atividade", "atividades"),
      plural(porFrota.size, "frota", "frotas"), contexto, `impressa em ${emitida()}`].filter(Boolean).join(" · "),
    rodape: nome,
    grupos: [...porFrota].sort((x, y) => natural(x[0], y[0]))
      .map(([fr, l]) => ({ nome: fr || "Sem frota", n: l.length, sub: porJanela(l) })),
  };
}

// ── os três jeitos de imprimir ──────────────────────────────────────────────

/** A semana inteira: uma folha por frota, só o que está em aberto. */
export function imprimirSemana(ano, semana, itens = null) {
  const d = M.datasDaSemana(ano, semana);
  const lista = (itens || ev.lista().filter(a => a.semana === semana && a.ano === ano)).filter(M.aberta);
  if (!lista.length) { erro(`Nada em aberto na semana ${semana}.`); return false; }
  return imprimirPorFrota(lista, `semana ${semana} · ${brCurto(d[0])} a ${brCurto(d[4])}`);
}

/** Uma folha por frota, para a lista que vier (o recorte da tela). */
export function imprimirPorFrota(itens, contexto = "") {
  const porFrota = new Map();
  for (const a of itens.filter(M.aberta)) {
    if (!porFrota.has(a.frota)) porFrota.set(a.frota, []);
    porFrota.get(a.frota).push(a);
  }
  if (!porFrota.size) { erro("Nada em aberto para imprimir."); return false; }
  imprimir([...porFrota].sort((x, y) => natural(x[0], y[0]))
    .map(([fr, l]) => folhaDaFrota(fr, l, contexto)));
  return true;
}

/** Uma frota só. Sem lista, vão todas as pendências em aberto dela. */
export function imprimirFrota(frota, itens = null, contexto = "") {
  const lista = (itens || ev.lista().filter(a => a.frota === frota)).filter(M.aberta);
  if (!lista.length) { erro(`${frota}: nada em aberto.`); return false; }
  imprimir([folhaDaFrota(frota, lista, contexto || (itens ? "" : "todas as semanas e a carteira"))]);
  return true;
}

/** Por executante: escolhe de quem, a frota, se a carteira entra e se cada um
 *  recebe a sua folha. */
export async function imprimirPorExecutante({ frota = "" } = {}) {
  const abertas = ev.lista().filter(M.aberta);
  // Só aparece na escolha quem tem pendência — a lista não cresce com quem já saiu.
  const comPendencia = new Set(abertas.flatMap(a => a.executantes || []));
  const nomes = valoresDe("executantes").filter(n => comPendencia.has(n));
  const semNinguem = abertas.filter(a => !(a.executantes || []).length).length;
  const conta = n => abertas.filter(a => (a.executantes || []).includes(n)).length;

  const caixas = [...nomes.map(n => [n, n, conta(n)]),
    ...(semNinguem ? [[SEM, "Sem executante definido", semNinguem]] : [])]
    .map(([v, t, n]) => {
      const c = el("input", { type: "checkbox", value: v });
      return { c, no: el("label", { class: "opcao-check" }, c, ` ${t} `, el("span", { class: "n" }, `· ${n}`)) };
    });
  const marcarTodos = valor => caixas.forEach(x => { x.c.checked = valor; });
  const frotasAbertas = [...new Set(abertas.map(a => a.frota).filter(Boolean))].sort(natural);
  const eFrota = selecao([{ v: "", t: "Todas as frotas" }, ...frotasAbertas], frota);
  const eCarteira = el("input", { type: "checkbox", checked: true });
  const eSeparar = el("input", { type: "checkbox", checked: true });

  const r = await caixa({
    titulo: "Imprimir por executante",
    largura: "560px",
    corpo: el("div", { class: "form-imprimir" },
      el("p", { class: "nada", style: "margin-top:0" },
        "Atividades em aberto dos executantes escolhidos, no mesmo formato da folha da frota."),
      el("div", { class: "campo" },
        el("span", {}, "Executantes"),
        el("div", { class: "linha-botoes" },
          el("button", { type: "button", class: "mini", onclick: () => marcarTodos(true) }, "Marcar todos"),
          el("button", { type: "button", class: "mini", onclick: () => marcarTodos(false) }, "Limpar")),
        el("div", { class: "lista-check" }, caixas.map(x => x.no))),
      campo("Frota", eFrota),
      el("label", { class: "opcao-check" }, eCarteira, " Incluir a carteira (atividades ainda sem semana)"),
      el("label", { class: "opcao-check" }, eSeparar, " Uma folha para cada executante")),
    acoes: [{ rotulo: "Cancelar", valor: false }, { rotulo: "Imprimir", classe: "primario", valor: true }],
  });
  if (r !== true) return false;

  const escolhidos = caixas.filter(x => x.c.checked).map(x => x.c.value);
  if (!escolhidos.length) { erro("Marque ao menos um executante."); return false; }
  const de = quem => abertas.filter(a => {
    if (eFrota.value && a.frota !== eFrota.value) return false;
    if (!eCarteira.checked && !a.semana) return false;
    const ex = a.executantes || [];
    return ex.length ? ex.some(x => quem.has(x)) : quem.has(SEM);
  });
  const rotuloDe = v => v === SEM ? "Sem executante definido" : v;
  const contexto = eCarteira.checked ? "" : "sem a carteira";

  const folhas = eSeparar.checked
    ? escolhidos.map(v => [rotuloDe(v), de(new Set([v]))]).filter(([, l]) => l.length)
      .map(([nome, l]) => folhaDoExecutante(nome, l, contexto))
    : (() => {
      const l = de(new Set(escolhidos));
      const porFrota = new Map();
      for (const a of l) { if (!porFrota.has(a.frota)) porFrota.set(a.frota, []); porFrota.get(a.frota).push(a); }
      return [...porFrota].sort((x, y) => natural(x[0], y[0])).map(([fr, it]) => folhaDaFrota(fr, it, contexto));
    })();
  if (!folhas.length) { erro("Nada em aberto com essa escolha."); return false; }
  imprimir(folhas);
  return true;
}

// ── desenhar e paginar ──────────────────────────────────────────────────────
// Cada pedaço da folha (cabeçalho, título de grupo, janela, linha) é um bloco
// medido na largura do papel. A página é preenchida bloco a bloco; título de
// grupo e de janela nunca ficam sozinhos no pé da página, e o grupo que
// continua na página seguinte repete o título com "continuação".

const cabecalho = (f, primeira) => primeira
  ? el("div", { class: "fl-cab" },
    el("h1", {}, f.titulo, f.extra ? el("span", { class: "fl-extra" }, ` · ${f.extra}`) : null),
    el("div", { class: "fl-resumo" }, f.resumo))
  : el("div", { class: "fl-cab fl-cont" }, el("h1", {}, f.titulo, el("span", { class: "fl-extra" }, " · continuação")));

const colunas = () => el("div", { class: "fl-linha fl-colunas" },
  el("span", {}), el("span", {}, "OS"), el("span", {}, "Atividade"), el("span", {}, "Quem fez"));

const tituloGrupo = (g, cont = false) => el("div", { class: "fl-grupo" },
  g.nome, el("span", { class: "fl-n" }, cont ? " continuação" : ` ${g.n}`));

const tituloJanela = rotulo => el("div", { class: "fl-janela" }, rotulo);

const linha = a => el("div", { class: "fl-linha" },
  el("span", { class: "fl-ok" }),
  el("span", { class: "fl-os" }, a.os || "—"),
  el("span", { class: "fl-ativ" }, M.ehPreventiva(a) ? el("span", { class: "fl-top fl-prev" }, "PREVENTIVA") : null,
    a.atividade || "—", doTOP(a) ? el("span", { class: "fl-top" }, "TOP") : null),
  el("span", { class: "fl-quem" }));

const rodape = (f, i, n) => el("div", { class: "fl-rodape" }, `${f.rodape} · página ${i} de ${n}`);

/** Os blocos de uma folha, na ordem, com o que precisa ficar junto. */
function blocosDe(f) {
  const r = [];
  for (const g of f.grupos) {
    r.push({ tipo: "grupo", g, no: tituloGrupo(g) });
    for (const s of g.sub) {
      r.push({ tipo: "janela", g, s, no: tituloJanela(s.rotulo) });
      for (const a of s.itens) r.push({ tipo: "linha", g, s, no: linha(a) });
    }
  }
  return r;
}

const MM = 96 / 25.4;
// A página tem 273 mm (A4 menos as margens do @page); conta-se com 268 para
// sobrar folga de arredondamento — melhor uma linha a menos que uma página em branco.
const ALTURA_PAGINA = 268 * MM;

/** Mede na largura do papel e devolve as páginas prontas. */
export function paginar(folhas) {
  // Os blocos do corpo se medem DENTRO de um .fl-corpo, como vão ficar na
  // página: o espaçamento e o filete das linhas vêm de lá.
  const corpoMedida = el("div", { class: "fl-corpo" });
  const medida = el("div", { id: "impressao-medida", class: "fl" }, corpoMedida);
  document.body.append(medida);
  const medir = (onde, no) => { onde.append(no); const h = no.getBoundingClientRect().height; no.remove(); return h; };
  const altura = no => medir(corpoMedida, no);
  const alturaFora = no => medir(medida, no);
  const paginas = [];
  try {
    for (const f of folhas) {
      const blocos = blocosDe(f);
      for (const b of blocos) b.h = altura(b.no);
      const hCab1 = alturaFora(cabecalho(f, true)), hCab2 = alturaFora(cabecalho(f, false));
      const hCol = alturaFora(colunas()), hPe = alturaFora(rodape(f, 1, 1));
      const daFolha = [];
      let atual = null, livre = 0;
      const nova = () => {
        const primeira = !daFolha.length;
        atual = { primeira, nos: [] };
        daFolha.push(atual);
        livre = ALTURA_PAGINA - (primeira ? hCab1 : hCab2) - hCol - hPe;
      };
      nova();
      for (let i = 0; i < blocos.length; i++) {
        const b = blocos[i];
        // título não fica sozinho no pé: precisa caber com o que vem até a primeira linha
        let precisa = b.h;
        for (let j = i + 1; b.tipo !== "linha" && j < blocos.length; j++) {
          precisa += blocos[j].h;
          if (blocos[j].tipo === "linha") break;
        }
        if (precisa > livre && atual.nos.length) {
          nova();
          // a continuação de um grupo repete o título dele (e o da janela)
          if (b.tipo !== "grupo") {
            const g = tituloGrupo(b.g, true); atual.nos.push(g); livre -= altura(tituloGrupo(b.g, true));
            if (b.tipo === "linha") { const j = tituloJanela(b.s.rotulo); atual.nos.push(j); livre -= altura(tituloJanela(b.s.rotulo)); }
          }
        }
        atual.nos.push(b.no);
        livre -= b.h;
      }
      daFolha.forEach((p, k) => paginas.push(el("section", { class: "fl-pagina imp-folha" },
        cabecalho(f, p.primeira), colunas(), el("div", { class: "fl-corpo" }, p.nos),
        rodape(f, k + 1, daFolha.length))));
    }
  } finally {
    medida.remove();
  }
  return paginas;
}

/** Põe as páginas numa área que só aparece na impressão, imprime e tira. */
function imprimir(folhas) {
  const paginas = paginar(folhas);
  document.getElementById("impressao")?.remove();
  const area = el("div", { id: "impressao", class: "fl" }, paginas);
  document.body.append(area);
  document.body.classList.add("imprimindo");
  // Só limpa a própria área: uma segunda impressão logo depois não perde a dela.
  const limpar = () => {
    if (!area.isConnected) return;
    area.remove();
    document.body.classList.remove("imprimindo");
  };
  window.addEventListener("afterprint", limpar, { once: true });
  window.print();
  // Alguns navegadores de celular não avisam o fim da impressão.
  setTimeout(() => { if (!matchMedia("print").matches) limpar(); }, 60000);
}
