// Imprimir as pendências dos caminhões — a folha que vai para a oficina.
//
// Uma frota por bloco, as atividades em aberto de cada uma, e só as dos
// executantes escolhidos. Com "uma folha por executante", cada mecânico recebe
// a sua. A folha tem onde marcar o feito e anotar à mão: é papel de pátio, não
// relatório. Imprimir não grava nada.

import * as ev from "../eventos.js";
import * as M from "../modelo.js";
import { el, br, brCurto, caixa, campo, selecao, erro } from "../ui.js";
import { valoresDe } from "./comum.js";

const SEM = "__sem";                       // "sem executante", na lista de escolha
const natural = (a, b) => String(a).localeCompare(String(b), "pt-BR", { numeric: true });

/** As atividades em aberto, já filtradas pelo que foi escolhido. */
function pendencias({ quem, frota, carteira }) {
  return ev.lista().filter(a => {
    if (!M.aberta(a)) return false;
    if (frota && a.frota !== frota) return false;
    if (!carteira && !a.semana) return false;
    const ex = a.executantes || [];
    return ex.length ? ex.some(x => quem.has(x)) : quem.has(SEM);
  });
}

export async function imprimirPendencias({ frota = "" } = {}) {
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
    titulo: "Imprimir pendências",
    largura: "560px",
    corpo: el("div", { class: "form-imprimir" },
      el("p", { class: "nada", style: "margin-top:0" },
        "Atividades em aberto, agrupadas por frota. Escolha de quem são as folhas."),
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
  const filtro = { frota: eFrota.value, carteira: eCarteira.checked };
  const rotuloDe = v => v === SEM ? "Sem executante definido" : v;

  // Uma folha por executante, ou uma folha só com todos os escolhidos.
  const folhas = eSeparar.checked
    ? escolhidos.map(v => ({ titulo: rotuloDe(v), itens: pendencias({ ...filtro, quem: new Set([v]) }) }))
    : [{ titulo: escolhidos.map(rotuloDe).join(", "), itens: pendencias({ ...filtro, quem: new Set(escolhidos) }) }];
  const comAlgo = folhas.filter(f => f.itens.length);
  if (!comAlgo.length) { erro("Nada em aberto com essa escolha."); return false; }

  imprimir(comAlgo.map(f => folha(f, filtro)));
  return true;
}

function folha({ titulo, itens }, { frota, carteira }) {
  const agora = new Date();
  const emitido = `${br(M.hoje())} ${String(agora.getHours()).padStart(2, "0")}:${String(agora.getMinutes()).padStart(2, "0")}`;
  const porFrota = new Map();
  for (const a of itens) {
    if (!porFrota.has(a.frota)) porFrota.set(a.frota, []);
    porFrota.get(a.frota).push(a);
  }
  const ordem = a => [M.prazoDe(a) || "9999-99-99", a.semana ? 0 : 1];
  const blocos = [...porFrota].sort((x, y) => natural(x[0], y[0])).map(([fr, lista]) => {
    lista.sort((a, b) => ordem(a)[0].localeCompare(ordem(b)[0]) || ordem(a)[1] - ordem(b)[1]);
    return el("div", { class: "imp-frota" },
      el("h2", {}, fr || "Sem frota", el("small", {}, ` · ${lista.length} pendência${lista.length === 1 ? "" : "s"}`)),
      el("table", {},
        el("thead", {}, el("tr", {},
          el("th", { class: "i-ok" }, "Feito"), el("th", { class: "i-os" }, "OS"),
          el("th", {}, "Atividade"), el("th", { class: "i-quem" }, "Executante"),
          el("th", { class: "i-sem" }, "Semana"), el("th", { class: "i-dt" }, "Prazo"),
          el("th", { class: "i-sit" }, "Situação"), el("th", { class: "i-obs" }, "Observação"))),
        el("tbody", {}, lista.map(a => {
          const s = M.situacaoDe(a);
          return el("tr", {},
            el("td", { class: "i-ok" }, "☐"),
            el("td", { class: "i-os" }, a.os || "—"),
            el("td", {}, a.atividade || "—"),
            el("td", { class: "i-quem" }, (a.executantes || []).join(", ") || "—"),
            el("td", { class: "i-sem" }, a.semana ? `${a.semana}${a.dia ? " · " + a.dia : ""}` : "carteira"),
            el("td", { class: "i-dt" }, M.prazoDe(a) ? brCurto(M.prazoDe(a)) : "—"),
            el("td", { class: "i-sit" + (s === "VENCIDA" ? " i-venc" : "") }, M.rotulo(s)),
            el("td", { class: "i-obs" }, ""));
        }))));
  });
  const nFrotas = porFrota.size;
  return el("section", { class: "imp-folha" },
    el("header", {},
      el("h1", {}, "Pendências da oficina"),
      el("div", { class: "imp-sub" },
        el("b", {}, titulo), ` · ${itens.length} atividade${itens.length === 1 ? "" : "s"} em ` +
        `${nFrotas} frota${nFrotas === 1 ? "" : "s"}` + (frota ? ` · frota ${frota}` : "") +
        (carteira ? "" : " · sem a carteira") + ` · emitido em ${emitido}`)),
    blocos,
    el("footer", {}, "Makro Transportes · PCM · marque o que foi feito e devolva ao PCM"));
}

/** Põe as folhas numa área que só aparece na impressão, imprime e tira. */
function imprimir(folhas) {
  document.getElementById("impressao")?.remove();
  const area = el("div", { id: "impressao" }, folhas);
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
