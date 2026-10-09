// Os indicadores que a planilha não tem.
//
// A tela Resultados espelha a aba Resultados. Estes painéis vieram da antiga
// tela Números e respondem perguntas que a planilha não faz — quanto saiu nos
// sete dias venha de onde vier, de quem é o atraso, quanto a operação cumpre o
// que promete. Ficam na mesma tela, recolhidos embaixo.
//
// Todo indicador aqui é conta sobre as atividades, feita no `modelo.js`, e
// nenhum guarda valor próprio: número que se guarda é número que um dia discorda
// da lista que ele deveria resumir.

import * as ev from "../eventos.js";
import * as M from "../modelo.js";
import { el, medidor, barras, cartaoNumero, vazio } from "../ui.js";

function painel(titulo, conteudo, obs) {
  return el("div", { class: "painel" },
    el("h2", {}, titulo), conteudo,
    obs ? el("p", { class: "obs" }, obs) : null);
}

export function outrosIndicadores(ano, semana) {
  const todas = ev.lista();
  const bl = M.backlogEmSemanas(todas, ano, semana);
  const fn = M.fechadasNaSemana(todas, ano, semana);
  const pt = M.pontualidade(ev.lista("movimentacao"), M.hoje());
  const ar = M.atrasoPorArea(todas);
  const prevs = ev.lista("preventiva");
  const prevAbertas = prevs.filter(M.preventivaAberta);
  const abertas = todas.filter(M.aberta);

  // Reprogramações lançadas NESTA semana — contadas no log, que é onde elas
  // existem. O campo na atividade só guarda o total acumulado.
  const datas = M.datasDaSemana(ano, semana);
  const reprogSemana = ev.log.filter(e => e.tipo === "reprogramada" &&
    e.ts.slice(0, 10) >= datas[0] && e.ts.slice(0, 10) <= datas[6]);
  const porMotivo = new Map();
  for (const e of reprogSemana) {
    const m = e.motivo || "sem motivo escrito";
    porMotivo.set(m, (porMotivo.get(m) || 0) + 1);
  }

  return el("div", { class: "paineis" },
    painel("O que saiu nestes sete dias",
      el("div", {},
        el("div", { class: "medidor neutro" },
          el("div", { class: "num" }, String(fn.total)),
          el("div", { class: "rot" }, "serviços fechados com data nesta semana")),
        el("div", { class: "numeros", style: "margin-top:12px" },
          cartaoNumero(fn.programadas, "programados"),
          cartaoNumero(fn.extras, "extras"),
          cartaoNumero(fn.de_outras_semanas, "atrasados de outras semanas"),
          cartaoNumero(String(fn.hh).replace(".", ","), "HH entregues"))),
      "Pergunta diferente da aderência: ali é 'do que planejei, quanto saiu?'; " +
      "aqui é 'quanto trabalho saiu?', incluindo terceirizada e o que era de outra semana."),

    painel("Backlog",
      el("div", {},
        el("div", { class: "medidor neutro" },
          el("div", { class: "num" }, bl.semanas == null ? "—" : String(bl.semanas).replace(".", ",")),
          el("div", { class: "rot" }, "semanas para zerar o que está em aberto")),
        el("div", { class: "numeros", style: "margin-top:12px" },
          cartaoNumero(bl.abertos, "em aberto"),
          cartaoNumero(String(bl.ritmo).replace(".", ","), "fechadas por semana"))),
      "Ritmo medido nas quatro semanas anteriores. Se nada novo entrasse, " +
      "é o tempo que a oficina levaria para acabar o que já tem."),

    painel(`Reprogramações lançadas na semana ${semana}`,
      porMotivo.size
        ? barras([...porMotivo.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([m, n]) => ({ rotulo: m, valor: n, cor: "c" })))
        : vazio("Nenhuma nesta semana."),
      `${reprogSemana.length} lançamento${reprogSemana.length === 1 ? "" : "s"} no registro do site. ` +
      "É por aqui que se responde por que a semana não fechou."),

    painel("De quem é o atraso",
      Object.keys(ar.por).length
        ? barras(Object.entries(ar.por)
          .sort((a, b) => b[1].total - a[1].total)
          .map(([area, d]) => ({ rotulo: area, valor: d.total,
            cor: { "Suprimentos": "c", "Operação": "d", "Manutenção": "",
              "Terceiro": "e", "Gestão / prioridade": "b" }[area] || "" })))
        : vazio("Nenhuma atividade em aberto com motivo escrito."),
      `Lido do motivo escrito em cada atividade em aberto. ${ar.sem_motivo} ` +
      "ainda não têm motivo — e sem motivo o atraso não tem endereço."),

    painel("Pontualidade da operação",
      el("div", {},
        medidor(pt.pct == null ? null : Math.round(pt.pct * 100),
          `${pt.no_prazo} de ${pt.concluidas} concluídas no prazo`),
        el("div", { class: "numeros", style: "margin-top:12px" },
          cartaoNumero(pt.atrasadas, "em aberto, já atrasadas", "", pt.atrasadas ? "alerta" : ""),
          cartaoNumero(pt.dias_perdidos, "dias de frota perdidos", "", pt.dias_perdidos ? "alerta" : ""))),
      "Cada dia além do prometido é um dia em que a oficina não pôde " +
      "trabalhar naquele caminhão."),

    prevs.length ? painel("Preventivas do mês",
      el("div", { class: "numeros" },
        cartaoNumero(prevAbertas.length, "abertas"),
        cartaoNumero(prevs.filter(p => M.preventivaVencida(p)).length,
          "vencidas", "", "alerta"),
        cartaoNumero(prevAbertas.filter(p => M.esperandoQuem(p) === "Operação").length, "com a operação"),
        cartaoNumero(prevAbertas.filter(p => M.esperandoQuem(p) === "PCM").length, "com o PCM")),
      "Preventiva parada esperando resposta vira corretiva depois.") : null,

    painel("Onde está o trabalho em aberto",
      barras(["VENCIDA", "Fecha hoje", "Em execução", "Programada", "Na carteira"]
        .map(s => ({ rotulo: s, valor: abertas.filter(a => M.situacaoDe(a) === s).length,
          cor: { VENCIDA: "d", "Fecha hoje": "c", "Em execução": "", Programada: "", "Na carteira": "e" }[s] }))
        .filter(i => i.valor)),
      "Carteira grande não é problema; carteira grande com vencidas em cima é."));
}
