// Hoje — a aba Hoje da planilha.
//
// Os números do dia no alto, como as caixas da planilha (contando só a oficina
// interna, que é a equipe que se mede), e embaixo duas listas na mesma grade da
// Programação: o que está na janela deste dia, feito ou não, e o que já passou
// do prazo. Dar baixa é na própria linha.
//
// Dá para olhar outro dia: a situação de cada atividade é calculada para a data
// escolhida, não para hoje.

import * as ev from "../eventos.js";
import * as M from "../modelo.js";
import * as pessoas from "../pessoas.js";
import { el, limpar, br } from "../ui.js";
import { criarNova } from "./comum.js";
import { grade, repintarMantendoFoco } from "./grade.js";

const NOMES = ["domingo", "segunda-feira", "terça-feira", "quarta-feira",
  "quinta-feira", "sexta-feira", "sábado"];

export async function montar(raiz, ctx, params) {
  let dia = params.get("d") || M.hoje();

  const entradaDia = el("input", { type: "date", value: dia, style: "width:auto",
    onchange: () => { dia = entradaDia.value || M.hoje(); pintar(); } });
  const quando = el("span", { class: "sub" });
  const corpo = el("div", {});
  raiz.append(
    el("div", { class: "cabec" },
      el("h1", {}, "Hoje"), entradaDia, quando,
      el("button", { onclick: () => { entradaDia.value = M.hoje(); dia = M.hoje(); pintar(); } },
        "Voltar para hoje"),
      el("div", { class: "espaco" }),
      pessoas.pode("programar")
        ? el("button", { class: "primario", onclick: () => criarNova(ctx, { origem: "Extra" }) }, "+ Extra")
        : null),
    corpo);

  const kpi = (rot, val, det, cls = "") =>
    el("div", { class: "kpi " + cls },
      el("div", { class: "k-rot" }, rot),
      el("div", { class: "k-val" }, String(val)),
      det ? el("div", { class: "k-det" }, det) : null);

  function pintar() {
    limpar(corpo);
    const sem = M.semanaISO(dia);
    quando.textContent = `${NOMES[M.data(dia).getUTCDay()]} · semana ${sem.semana}`;

    const vivas = ev.lista().filter(a => (a.atividade || a.frota) && !a.cancelada);
    const naJanela = a => { const i = M.inicioDe(a), p = M.prazoDe(a); return a.dia && i && i <= dia && p >= dia; };
    const interna = a => M.oficinaDe(a) === "Interna";

    const doDia = vivas.filter(naJanela);
    const atrasadas = vivas.filter(a => M.aberta(a) && a.dia && M.prazoDe(a) && M.prazoDe(a) < dia);
    const fechadasNoDia = vivas.filter(a => a.concluida_em === dia && !naJanela(a));

    // As caixas são as da aba Hoje, com as mesmas contas — e, como lá, só a
    // oficina interna: é a equipe que se mede.
    const paraFechar = doDia.filter(a => interna(a) && M.prazoDe(a) === dia);
    const fecharam = paraFechar.filter(M.feita);
    const emExecucao = doDia.filter(a => interna(a) && M.aberta(a));
    const atrasadasInt = atrasadas.filter(interna);
    const pct = paraFechar.length ? Math.round(fecharam.length * 100 / paraFechar.length) + "%" : "—";

    corpo.append(el("div", { class: "kpis" },
      kpi("Vencem hoje", paraFechar.length, "prazo termina neste dia", "hoje"),
      kpi("Concluídas", fecharam.length, "das que vencem hoje", "ok"),
      kpi("Aderência do dia", pct, "concluídas ÷ vencem hoje"),
      kpi("Em execução", emExecucao.length, "programadas para o dia, em aberto", "andando"),
      kpi("Atrasadas", atrasadasInt.length, "prazo vencido", atrasadasInt.length ? "vencida" : "")));
    corpo.append(el("p", { class: "nota" },
      "Os indicadores consideram só a oficina interna, como na planilha. As listas mostram tudo, " +
      "inclusive os serviços em terceiros."));

    corpo.append(el("div", { class: "titulo-secao" }, "Programadas para o dia",
      el("span", { class: "n" }, `· período de execução inclui ${br(dia)} · ${doDia.length}`)));
    corpo.append(grade(doDia, { ctx, agrupar: "frota", ref: dia,
      vazioTexto: "Nenhuma atividade em execução neste dia. A programação da semana está na aba Programação." }));

    if (atrasadas.length) {
      corpo.append(el("div", { class: "titulo-secao" }, "Atrasadas",
        el("span", { class: "n" }, `· prazo vencido, ainda em aberto · ${atrasadas.length}`)));
      corpo.append(grade(atrasadas, { ctx, agrupar: "frota", ref: dia }));
    }

    if (fechadasNoDia.length) {
      corpo.append(el("div", { class: "titulo-secao" }, "Também concluídas neste dia",
        el("span", { class: "n" }, `· fora do período programado · ${fechadasNoDia.length}`)));
      corpo.append(grade(fechadasNoDia, { ctx, agrupar: "frota", ref: dia }));
    }
  }

  pintar();
  return { desmontar: ev.ouvir(() => repintarMantendoFoco(corpo, pintar)) };
}
