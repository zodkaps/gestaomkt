// O dia da oficina: o que está em execução, o que venceu, o que já saiu.
//
// Agrupado por executante porque é assim que o trabalho é entregue — cada um
// olha o próprio bloco. E dar baixa é um botão no cartão, não um caminho por
// dentro da ficha: fechar serviço é o que mais se faz aqui.

import * as ev from "../eventos.js";
import * as M from "../modelo.js";
import { el, limpar, br, avisar, vazio } from "../ui.js";
import { cartao, botaoConcluir, agrupar, secao, criarNova } from "./comum.js";

export async function montar(raiz, ctx, params) {
  let dia = params.get("d") || M.hoje();

  const entradaDia = el("input", { type: "date", value: dia, style: "width:auto",
    onchange: () => { dia = entradaDia.value || M.hoje(); pintar(); } });

  const corpo = el("div", {});
  raiz.append(
    el("div", { class: "cabec" },
      el("h1", {}, "Hoje"),
      el("span", { class: "sub" }, entradaDia),
      el("div", { class: "espaco" }),
      el("button", { onclick: () => { entradaDia.value = M.hoje(); dia = M.hoje(); pintar(); } }, "Voltar para hoje"),
      el("button", { class: "primario", onclick: () => criarNova(ctx, { origem: "Extra" }) }, "+ Extra")),
    corpo);

  function pintar() {
    limpar(corpo);
    const todas = ev.lista();

    const abertas = todas.filter(a => !a.concluida_em && !a.cancelada && a.semana);
    const noDia = abertas.filter(a => {
      const i = M.inicioDe(a), p = M.prazoDe(a);
      return i && i <= dia && p >= dia;
    });
    const vencidas = abertas.filter(a => {
      const p = M.prazoDe(a);
      return p && p < dia;
    }).sort((x, y) => M.prazoDe(x).localeCompare(M.prazoDe(y)));
    const fechadasNoDia = todas.filter(a => a.concluida_em === dia);

    const sem = M.semanaISO(dia);
    const ad = M.aderencia(todas, sem.ano, sem.semana);

    corpo.append(el("p", { class: "sub", style: "color:var(--fraco);font-size:13px;margin-bottom:14px" },
      `Semana ${sem.semana} · ${ad.concluidas} de ${ad.programadas} programadas` +
      (ad.pct == null ? "" : ` · ${ad.pct}%`) +
      (ad.extras ? ` · ${ad.extras} extra${ad.extras === 1 ? "" : "s"}` : "")));

    // Vencidas primeiro: é a fila que está atrasando a semana, e enterrá-la no
    // fim da tela é como ela some por três dias.
    if (vencidas.length) {
      corpo.append(secao("Passaram do prazo",
        el("div", { class: "lista" },
          vencidas.map(a => cartao(a, { ctx, acoes: [botaoConcluir(a, ctx)] }))),
        vencidas.length));
    }

    if (!noDia.length) {
      corpo.append(secao("Do dia", vazio(
        "Nada em execução neste dia. A programação da semana fica na aba Semana."), 0));
    } else {
      const porQuem = agrupar(noDia, a => (a.executantes || []).join(" e ") || "Sem executante");
      const chaves = [...porQuem.keys()].sort((a, b) => {
        if (a === "Sem executante") return 1;
        if (b === "Sem executante") return -1;
        return a.localeCompare(b, "pt-BR");
      });
      const bloco = el("div", {});
      for (const quem of chaves) {
        const lista = porQuem.get(quem).sort(ordenar);
        bloco.append(el("div", { class: "secao" },
          el("h2", {}, quem, el("span", { class: "cont" }, String(lista.length))),
          el("div", { class: "lista" },
            lista.map(a => cartao(a, { ctx, acoes: [botaoConcluir(a, ctx)], compacto: true })))));
      }
      corpo.append(secao(`Em execução em ${br(dia)}`, bloco, noDia.length));
    }

    if (fechadasNoDia.length) {
      corpo.append(secao("Fechadas neste dia",
        el("div", { class: "lista" }, fechadasNoDia.map(a => cartao(a, { ctx }))),
        fechadasNoDia.length));
    }
  }

  // Prioridade primeiro, depois o prazo mais apertado: é a ordem em que a
  // oficina deveria pegar as tarefas.
  function ordenar(x, y) {
    const pr = a => ({ P1: 0, P2: 1, P3: 2 })[a.prioridade] ?? 3;
    return pr(x) - pr(y) ||
      String(M.prazoDe(x)).localeCompare(String(M.prazoDe(y))) ||
      String(x.frota).localeCompare(String(y.frota), "pt-BR");
  }

  pintar();
  return { desmontar: ev.ouvir(pintar) };
}
