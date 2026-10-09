// Semana — a aba Semana da planilha.
//
// No alto, as mesmas caixas da planilha (programadas, concluídas, aderência,
// cumprimento geral, extra, vencidas), o bloco em HH e a carga por dia de cada
// executante. Embaixo, as atividades da semana na mesma grade da Programação,
// agrupadas por dia — a Programação mostra a semana por frota, aqui ela se lê
// pela agenda.
//
// O quadro de arrastar cartões entre dias saiu: reprogramar continua sendo pela
// ficha ou marcando várias na Programação, sempre pedindo o motivo.

import * as ev from "../eventos.js";
import * as M from "../modelo.js";
import { el, limpar, brCurto } from "../ui.js";
import { grade, repintarMantendoFoco } from "./grade.js";

const n1 = v => (Math.round(v * 10) / 10).toLocaleString("pt-BR");
const pc = v => v == null ? "—" : Math.round(v * 100) + "%";

export async function montar(raiz, ctx, params) {
  const agora = M.semanaAtual();
  let ano = Number(params.get("a")) || agora.ano;
  let semana = Number(params.get("s")) || agora.semana;

  const rotulo = el("b", {});
  const corpo = el("div", {});
  raiz.append(
    el("div", { class: "cabec" },
      el("h1", {}, "Semana"),
      el("span", { class: "navsem" },
        el("button", { onclick: () => andar(-1), title: "Semana anterior" }, "‹"),
        rotulo,
        el("button", { onclick: () => andar(1), title: "Próxima semana" }, "›")),
      el("button", { onclick: () => { ano = agora.ano; semana = agora.semana; pintar(); } }, "Semana atual"),
      el("div", { class: "espaco" }),
      el("button", { onclick: () => ctx.ir("programacao", `m=semana&s=${semana}&a=${ano}`) },
        "Ver por frota na Programação")),
    corpo);

  function andar(n) {
    semana += n;
    if (semana > 53) { semana = 1; ano++; }
    if (semana < 1) { semana = 52; ano--; }
    pintar();
  }

  const kpi = (rot, val, det, cls = "") =>
    el("div", { class: "kpi " + cls },
      el("div", { class: "k-rot" }, rot),
      el("div", { class: "k-val" }, String(val)),
      det ? el("div", { class: "k-det" }, det) : null);

  function pintar() {
    limpar(corpo);
    const todas = ev.lista();
    const r = M.resultados(todas, ano, semana);
    const h = M.semanaEmHH(todas, ano, semana);
    rotulo.textContent = `${semana}/${ano} · ${brCurto(r.datas[0])} a ${brCurto(r.datas[6])}`;

    corpo.append(el("div", { class: "titulo-secao" }, "Nesta semana",
      el("span", { class: "n" }, "· só a oficina interna, como a planilha")));
    corpo.append(el("div", { class: "kpis" },
      kpi("Programadas", r.plano, "o plano da semana"),
      kpi("Concluídas", r.concluidas_plano, "do plano", "ok"),
      kpi("Aderência", pc(r.aderencia), "concluídas ÷ programadas"),
      kpi("Cumprimento geral", pc(r.cumprimento), `${r.concluidas} de ${r.total}, com o extra`),
      kpi("Extra", r.extra, "entrou depois do plano", "extra"),
      kpi("Vencidas", r.vencidas, "a janela fechou e não saiu", r.vencidas ? "vencida" : "")));
    corpo.append(el("p", { class: "nota" },
      `Fora da conta interna: ${r.terceirizada} em empresa terceirizada · ` +
      `${r.canceladas} cancelada${r.canceladas === 1 ? "" : "s"} · ` +
      `na carteira, sem dia: ${r.carteira}.`));

    corpo.append(el("div", { class: "titulo-secao" }, "Em HH",
      el("span", { class: "n" }, "· carga × capacidade da equipe")));
    corpo.append(el("div", { class: "kpis" },
      kpi("HH programado", n1(h.hh_plano), "do plano da semana"),
      kpi("Aderência em HH", pc(h.aderencia_hh), `${n1(h.hh_plano_feito)} HH do plano concluídos`),
      kpi("Capacidade", n1(h.capacidade), `HH programáveis (${String(M.HORAS_DIA).replace(".", ",")} h/dia por pessoa)`),
      kpi("Ocupação", pc(h.ocupacao), "(plano + extra) ÷ capacidade"),
      kpi("HH extra", n1(h.hh_extra), "entrou depois da programação", "extra"),
      kpi("Carteira em HH", n1(h.hh_carteira), "pendências abertas sem semana"),
      kpi("Backlog em semanas", h.backlog_semanas == null ? "—" : n1(h.backlog_semanas),
        "carteira ÷ capacidade semanal")));

    if (h.carga.length) {
      corpo.append(el("div", { class: "titulo-secao" }, "Carga por dia",
        el("span", { class: "n" }, "· HH por pessoa — o HH da atividade dividido entre quem faz e espalhado pelos dias da janela")));
      corpo.append(tabelaCarga(h));
    }

    const daSemana = todas.filter(a => (a.atividade || a.frota) &&
      a.semana === semana && a.ano === ano);
    corpo.append(el("div", { class: "titulo-secao" }, "As atividades da semana",
      el("span", { class: "n" }, `· por dia · ${daSemana.length}`)));
    corpo.append(grade(daSemana, { ctx, agrupar: "dia", datas: r.datas,
      vazioTexto: "Semana vazia. Programe pela Programação: marque as atividades e escolha a semana." }));
  }

  function tabelaCarga(h) {
    const corDe = oc => oc > 1 ? "vencida" : oc >= 0.85 ? "hoje" : "";
    return el("div", { class: "rolagem" }, el("table", { class: "tabela carga" },
      el("thead", {}, el("tr", {},
        el("th", {}, "Executante"),
        h.datas.map(d => el("th", { class: "num" }, `${M.DIAS[M.datasDaSemana(ano, semana).indexOf(d)]} ${brCurto(d)}`)),
        el("th", { class: "num" }, "HH na semana"),
        el("th", { class: "num" }, "Capacidade"),
        el("th", { class: "num" }, "Ocupação"))),
      el("tbody", {}, h.carga.map(p => el("tr", {},
        el("td", {}, p.nome),
        p.dias.map(v => el("td", { class: "num" + (v > M.HORAS_DIA ? " c-venc" : "") },
          v ? n1(v) : el("span", { class: "seg" }, "—"))),
        el("td", { class: "num" }, el("b", {}, n1(p.total))),
        el("td", { class: "num" }, n1(p.capacidade)),
        el("td", { class: "num " + corDe(p.ocupacao) }, pc(p.ocupacao)))))));
  }

  pintar();
  return { desmontar: ev.ouvir(() => repintarMantendoFoco(corpo, pintar)) };
}
