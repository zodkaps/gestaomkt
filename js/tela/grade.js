// A grade: a lista de atividades no formato da aba Programação da planilha.
//
// Uma linha por atividade, em blocos (por frota, como a planilha, ou por dia),
// e a Situação na frente, colorida. O que se quer ver numa olhada — o que está
// feito e o que não está — é a cor da primeira coluna e o fundo verde da linha
// feita, exatamente como a planilha pinta. Cada bloco abre com um resumo: quantas
// tem, quantas saíram, quantas venceram.
//
// Hoje, Programação e Semana usam esta mesma grade. Um lugar só desenha uma
// atividade em lista, para as três telas nunca mostrarem a mesma coisa de jeitos
// diferentes.

import * as M from "../modelo.js";
import * as pessoas from "../pessoas.js";
import { el, brCurto, cliqueLimpo, vazio } from "../ui.js";
import { abrirFicha, concluir, cartao, botaoConcluir } from "./comum.js";

// A ordem dentro do bloco: primeiro o que pede ação, por último o que já saiu.
// Assim as cores se agrupam e o bloco se lê de cima para baixo.
const ORDEM = ["VENCIDA", "Fecha hoje", "Em execução", "Programada", "Falta o dia",
  "Na carteira", "Falta a atividade", "Concluída com atraso", "Concluída", "Cancelada"];

/** As situações, na ordem em que aparecem nos filtros. */
export const SITUACOES = ["VENCIDA", "Fecha hoje", "Em execução", "Programada",
  "Na carteira", "Concluída", "Concluída com atraso", "Cancelada"];

const peso = s => { const i = ORDEM.indexOf(s); return i < 0 ? 50 : i; };
export const natural = (x, y) =>
  String(x || "").localeCompare(String(y || ""), "pt-BR", { numeric: true });

export function ordenarPorSituacao(ref) {
  return (x, y) => peso(M.situacaoDe(x, ref)) - peso(M.situacaoDe(y, ref)) ||
    String(M.prazoDe(x) || "9").localeCompare(String(M.prazoDe(y) || "9")) ||
    natural(x.frota, y.frota) || natural(x.atividade, y.atividade);
}

function blocos(itens, por, ref) {
  if (!por) return [{ chave: null, itens: itens.slice().sort(ordenarPorSituacao(ref)) }];
  const m = new Map();
  for (const a of itens) {
    const k = por === "dia" ? (a.dia || "") : (a.frota || "");
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(a);
  }
  const ordemDia = k => { const i = M.DIAS.indexOf(k); return i < 0 ? 99 : i; };
  const chaves = [...m.keys()].sort(por === "dia" ? (x, y) => ordemDia(x) - ordemDia(y) : natural);
  return chaves.map(k => ({ chave: k, itens: m.get(k).sort(ordenarPorSituacao(ref)) }));
}

/** Quantas, quantas saíram, quantas venceram — o resumo de cada bloco. */
export function resumo(itens, ref) {
  const vivas = itens.filter(a => !a.cancelada);
  return {
    total: vivas.length,
    feitas: vivas.filter(M.feita).length,
    vencidas: vivas.filter(a => M.situacaoDe(a, ref) === "VENCIDA").length,
    hoje: vivas.filter(a => M.situacaoDe(a, ref) === "Fecha hoje").length,
  };
}

function barrinha(r) {
  const pct = r.total ? Math.round(r.feitas * 100 / r.total) : 0;
  return el("span", { class: "barrinha", title: `${r.feitas} de ${r.total} feitas` },
    el("span", { style: `width:${pct}%` }));
}

function rotuloBloco(chave, por, itens, datas) {
  if (por === "dia") {
    const i = M.DIAS.indexOf(chave);
    return [el("b", {}, chave || "Sem dia"),
      i >= 0 && datas ? el("span", { class: "seg" }, brCurto(datas[i])) : null];
  }
  const cliente = itens.find(a => a.cliente);
  return [el("b", {}, chave || "Sem frota"),
    cliente ? el("span", { class: "seg" }, cliente.cliente) : null];
}

function contagem(r) {
  return el("span", { class: "conta" },
    `${r.total} atividade${r.total === 1 ? "" : "s"}`,
    el("span", { class: r.feitas ? "c-ok" : "" }, ` · ${r.feitas} feita${r.feitas === 1 ? "" : "s"}`),
    r.vencidas ? el("span", { class: "c-venc" }, ` · ${r.vencidas} vencida${r.vencidas === 1 ? "" : "s"}`) : null,
    r.hoje ? el("span", { class: "c-hoje" }, ` · ${r.hoje} fecha${r.hoje === 1 ? "" : "m"} hoje`) : null);
}

// ── as células ──────────────────────────────────────────────────────────────

function celulaOS(a) {
  if (a.os) {
    return el("span", { class: "os" }, a.os,
      a.os_outras.length ? el("span", { class: "seg" }, ` +${a.os_outras.length}`) : null);
  }
  return M.aberta(a) ? el("span", { class: "sem-os" }, "sem OS") : el("span", { class: "seg" }, "—");
}

function celulaAtividade(a, o) {
  const tags = [];
  if (a.origem === "Extra") tags.push(el("span", { class: "tag extra" }, "Extra"));
  if (a.tipo && a.tipo !== "Corretiva") tags.push(el("span", { class: "tag" }, a.tipo));
  // Prioridade fica na ficha: na planilha a coluna é oculta, e P1 em quase toda
  // linha vira ruído que esconde o que importa na olhada — a situação.
  if (a.reprogramacoes > 0) {
    tags.push(el("span", { class: "tag reprog", title: "mudou de semana" },
      `↻ ${a.reprogramacoes > 1 ? a.reprogramacoes + "×" : "reprog."}`));
  }
  // O "SE NÃO FOI, POR QUÊ" da planilha: só aparece enquanto não saiu.
  const porque = !M.feita(a) && !a.cancelada && a.motivo
    ? el("div", { class: "porque" }, a.motivo) : null;
  return [
    el("div", { class: "t" },
      o.mostrarFrota && a.frota ? el("b", { class: "fr" }, a.frota + " ") : null,
      a.atividade || "—", tags.length ? " " : null, tags),
    porque,
  ];
}

function celulaFeito(a, o) {
  if (a.cancelada) return el("span", { class: "seg" }, "cancelada");
  if (a.concluida_em) return el("span", { class: "feito-em" }, "✓ " + brCurto(a.concluida_em));
  const pode = pessoas.pode("baixar");
  if (a.feita_sem_data) {
    return pode
      ? el("button", { class: "mini sem-data",
        title: "Marcada Concluída na planilha, sem a data. Clique para dar a data.",
        onclick: e => { e.stopPropagation(); concluir(a, o.ctx); } }, "✓ sem data")
      : el("span", { class: "sem-data" }, "✓ sem data");
  }
  if (!pode) return "";
  return el("button", { class: "mini baixa",
    onclick: e => { e.stopPropagation(); concluir(a, o.ctx); } }, "Dar baixa");
}

function linha(a, o) {
  const s = M.situacaoDe(a, o.ref);
  const cor = M.corDe(s);
  const tr = el("tr", {
    class: `lin ${cor}${M.feita(a) ? " feita" : ""}${a.cancelada ? " cancel" : ""}` +
      (o.selecao && o.selecao.has(a.id) ? " marcada" : ""),
    dataset: { id: a.id },
  });
  if (o.selecao) {
    // Só o que está em aberto se programa; nas outras a caixinha seria ruído.
    tr.append(el("td", { class: "c-sel" }, !M.aberta(a) ? null : el("input", {
      type: "checkbox", checked: o.selecao.has(a.id),
      title: "Marcar para programar",
      onclick: e => e.stopPropagation(),
      onchange: e => {
        e.target.checked ? o.selecao.add(a.id) : o.selecao.delete(a.id);
        tr.classList.toggle("marcada", e.target.checked);
        o.aoSelecionar && o.aoSelecionar();
      },
    })));
  }
  const prazo = M.prazoDe(a);
  tr.append(
    el("td", { class: "c-sit" }, el("span", { class: "sit " + cor }, s)),
    el("td", { class: "c-os" }, celulaOS(a)),
    el("td", { class: "c-ativ" }, celulaAtividade(a, o)),
    el("td", { class: "c-quem" }, (a.executantes || []).join(", ") || el("span", { class: "seg" }, "—")),
    el("td", { class: "c-sem num" }, a.semana
      ? `${a.semana}${a.dia ? " · " + a.dia : ""}` : el("span", { class: "seg" }, "—")),
    el("td", { class: "c-hh num" }, Number(a.hh) ? String(a.hh).replace(".", ",") : el("span", { class: "seg" }, "—")),
    el("td", { class: "c-prazo num" }, prazo ? brCurto(prazo) : el("span", { class: "seg" }, "—")),
    el("td", { class: "c-feito" }, celulaFeito(a, o)));
  tr.addEventListener("click", cliqueLimpo(() => abrirFicha(a.id, o.ctx)));
  return tr;
}

/** A grade inteira: tabela no computador, cartões no celular.
 *
 *  `o`: { ctx, agrupar: "frota" | "dia" | null, ref, datas, selecao (Set),
 *         aoSelecionar, vazioTexto } */
export function grade(itens, o = {}) {
  if (!itens.length) return vazio(o.vazioTexto || "Nada aqui com estes filtros.");
  const opc = { ...o, mostrarFrota: o.agrupar !== "frota" };
  const grupos = blocos(itens, o.agrupar, o.ref);

  // ── computador ──
  const cab = [
    o.selecao ? el("th", { class: "c-sel" }) : null,
    el("th", { class: "c-sit" }, "Situação"),
    el("th", { class: "c-os" }, "OS"),
    el("th", { class: "c-ativ" }, "Atividade"),
    el("th", { class: "c-quem" }, "Quem faz"),
    el("th", { class: "c-sem num" }, "Sem."),
    el("th", { class: "c-hh num" }, "HH"),
    el("th", { class: "c-prazo num" }, "Prazo"),
    el("th", { class: "c-feito" }, "Feito em"),
  ];
  const ncol = cab.filter(Boolean).length;
  const corpo = el("tbody", {});
  for (const g of grupos) {
    if (o.agrupar) {
      const r = resumo(g.itens, o.ref);
      const marcarBloco = o.selecao ? el("input", {
        type: "checkbox", title: "Marcar todas em aberto deste bloco",
        checked: g.itens.filter(M.aberta).length > 0 &&
          g.itens.filter(M.aberta).every(a => o.selecao.has(a.id)),
        onchange: e => {
          for (const a of g.itens.filter(M.aberta)) {
            e.target.checked ? o.selecao.add(a.id) : o.selecao.delete(a.id);
          }
          o.aoSelecionar && o.aoSelecionar(true);
        },
      }) : null;
      corpo.append(el("tr", { class: "bloco" },
        el("td", { colspan: ncol },
          el("div", { class: "bloco-cab" },
            marcarBloco, rotuloBloco(g.chave, o.agrupar, g.itens, o.datas),
            contagem(r), el("span", { class: "espaco" }), barrinha(r)))));
    }
    for (const a of g.itens) corpo.append(linha(a, opc));
  }
  const tabela = el("table", { class: "grade" + (o.selecao ? " com-sel" : "") },
    el("thead", {}, el("tr", {}, cab)), corpo);

  // ── celular ──
  const cartoes = el("div", {});
  for (const g of grupos) {
    if (o.agrupar) {
      const r = resumo(g.itens, o.ref);
      cartoes.append(el("div", { class: "bloco-cel" },
        rotuloBloco(g.chave, o.agrupar, g.itens, o.datas), contagem(r), barrinha(r)));
    }
    const lista = el("div", { class: "lista" });
    for (const a of g.itens) {
      const acoes = M.aberta(a) && pessoas.pode("baixar") ? [botaoConcluir(a, o.ctx)] : [];
      lista.append(cartao(a, { ctx: o.ctx, compacto: true, acoes }));
    }
    cartoes.append(lista);
  }

  return el("div", { class: "grade-caixa" },
    el("div", { class: "so-tabela" }, tabela),
    el("div", { class: "so-cartao" }, cartoes));
}

/** A faixa de situações com contagem — o "uma olhada" no alto da tela, que
 *  também filtra: clicar em VENCIDA mostra só as vencidas. */
export function faixaSituacoes(itens, ref, escolhidas, aoMudar) {
  const conta = new Map();
  for (const a of itens) {
    const s = M.situacaoDe(a, ref);
    conta.set(s, (conta.get(s) || 0) + 1);
  }
  const botoes = SITUACOES.filter(s => conta.get(s)).map(s => el("button", {
    class: `fsit ${M.corDe(s)}${escolhidas.has(s) ? " on" : ""}`,
    "aria-pressed": escolhidas.has(s) ? "true" : "false",
    onclick: () => {
      escolhidas.has(s) ? escolhidas.delete(s) : escolhidas.add(s);
      aoMudar();
    },
  }, el("b", {}, String(conta.get(s))), " ", s));
  return el("div", { class: "faixa-sit" },
    el("button", { class: "fsit todas" + (escolhidas.size ? "" : " on"),
      onclick: () => { escolhidas.clear(); aoMudar(); } },
      el("b", {}, String(itens.length)), " Todas"),
    botoes);
}

/** O progresso grande: quantas saíram da lista, com a barra. O número grande é
 *  a contagem da própria lista — "22 de 91" —, não uma porcentagem: porcentagem
 *  grande no alto seria lida como a aderência, e a aderência é outra conta (só
 *  a oficina interna, só o plano), escrita por extenso ao lado. */
export function progresso(titulo, feitas, total, extra = "") {
  const pct = total ? Math.round(feitas * 100 / total) : 0;
  return el("div", { class: "progresso" },
    el("div", { class: "p-num" }, String(feitas), el("small", {}, ` de ${total}`)),
    el("div", { class: "p-meio" },
      el("div", { class: "p-tit" }, titulo),
      el("div", { class: "p-trilho" }, el("span", { style: `width:${pct}%` })),
      el("div", { class: "p-txt" }, `feita${feitas === 1 ? "" : "s"}${extra}`)));
}
