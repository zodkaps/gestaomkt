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

import * as ev from "../eventos.js";
import * as M from "../modelo.js";
import * as pessoas from "../pessoas.js";
import { el, brCurto, cliqueLimpo, vazio } from "../ui.js";
import { abrirFicha, concluir, cartao, botaoConcluir, gravarOS, justificar } from "./comum.js";

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

// Depois de gravar uma OS com Enter, o foco pula para a próxima linha sem OS —
// é assim que se preenche uma coluna inteira sem tirar a mão do teclado. A
// tela se repinta depois de gravar, então o "próximo" fica anotado aqui e a
// linha nova pega o foco quando for desenhada.
let focarDepois = "";

function campoOS(a) {
  const entrada = el("input", {
    class: "os-in", inputmode: "numeric", placeholder: "sem OS", "aria-label": `OS de ${a.frota}`,
    title: "Digite a OS e aperte Enter (ou Tab)", dataset: { id: a.id },
    onclick: e => e.stopPropagation(),
    onkeydown: async e => {
      if (e.key === "Escape") { entrada.value = ""; entrada.blur(); return; }
      // Grava só com Enter ou Tab — gesto de quem terminou de digitar. Gravar
      // ao sair do campo gravaria pela metade um número que estava sendo
      // digitado quando a tela se repintou por um lançamento de outra pessoa.
      if (e.key !== "Enter" && e.key !== "Tab") return;
      if (!entrada.value.trim()) return;
      e.preventDefault();
      const todos = [...document.querySelectorAll("input.os-in")];
      const prox = todos[todos.indexOf(entrada) + (e.shiftKey ? -1 : 1)];
      focarDepois = prox ? prox.dataset.id : "";
      const ok = await gravarOS([a], entrada.value);
      if (!ok) { focarDepois = ""; entrada.focus(); }
    },
  });
  if (focarDepois === a.id) {
    focarDepois = "";
    requestAnimationFrame(() => entrada.focus());
  }
  return entrada;
}

/** Repinta uma área sem tirar o cursor de quem está digitando uma OS nela.
 *  A tela se repinta quando qualquer lançamento chega — inclusive a volta do
 *  próprio lançamento, do banco —, e cada repintura tirava o foco do campo. */
export function repintarMantendoFoco(area, desenhar) {
  const f = document.activeElement;
  const guardado = f && f.classList && f.classList.contains("os-in") && area.contains(f)
    ? { id: f.dataset.id, valor: f.value, ini: f.selectionStart, fim: f.selectionEnd } : null;
  desenhar();
  if (!guardado) return;
  const n = area.querySelector(`input.os-in[data-id="${guardado.id}"]`);
  if (!n) return;
  n.value = guardado.valor;
  n.focus();
  try { n.setSelectionRange(guardado.ini, guardado.fim); } catch (e) { /* tipo sem seleção */ }
}

function celulaOS(a) {
  if (a.os) {
    return el("span", { class: "os" }, a.os,
      a.os_outras.length ? el("span", { class: "seg" }, ` +${a.os_outras.length}`) : null);
  }
  if (!M.aberta(a)) return el("span", { class: "seg" }, "—");
  return pessoas.pode("editar_atividade") ? campoOS(a) : el("span", { class: "sem-os" }, "sem OS");
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
  // O "SE NÃO FOI, POR QUÊ" da planilha, com quem atrasou ao lado. Aparece
  // enquanto não saiu, e também na que saiu com atraso. Vencida sem porquê
  // ganha o atalho "+ justificar" — o porquê se escreve onde se vê o atraso.
  const s = M.situacaoDe(a, o.ref);
  const atrasou = s === "VENCIDA" || s === "Concluída com atraso";
  const pode = pessoas.pode("editar_atividade");
  const quem = a.quem_atrasou || M.areaDoMotivo(a.motivo);
  const abrirJust = e => { e.stopPropagation(); justificar(a, "atividade"); };
  let porque = null;
  if ((a.motivo || a.quem_atrasou) && !a.cancelada && (!M.feita(a) || atrasou)) {
    porque = el("div", { class: "porque" + (pode ? " editavel" : ""),
      title: pode ? "Mudar a justificativa" : "", onclick: pode ? abrirJust : null },
      a.motivo || a.justificativa || "—",
      quem ? el("span", { class: "quem-atrasou" }, " · " + quem) : null);
  } else if (atrasou && pode) {
    porque = el("button", { class: "mini justificar", onclick: abrirJust }, "+ justificar");
  }
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
