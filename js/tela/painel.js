// Painel — o resultado geral numa tela só, e o que decidir com ele.
//
// Em cima, os números que vão para a reunião, um de cada área: a aderência da
// semana (a registrada, quando a semana fechou), as vencidas da oficina, as
// preventivas do mês e a pontualidade da operação. No meio, a lista "O que
// decidir agora", juntando as três áreas, do urgente para a oportunidade, cada
// item com o porquê e o botão que já abre a ação. Embaixo, um cartão por área
// com o detalhe e o caminho para a aba dela, e a aderência registrada das
// últimas semanas.
//
// Nenhum número aqui é calculado de um jeito novo: são as mesmas contas das
// abas (M.resultados, M.resumoPreventivas, M.pontualidade, o fechamento).

import * as ev from "../eventos.js";
import * as M from "../modelo.js";
import * as pessoas from "../pessoas.js";
import { el, limpar, br, brCurto } from "../ui.js";
import { todas as todasDecisoes, planoVigente, resumir } from "../decisoes.js";
import { fechamentos, naTendencia } from "../fechamento.js";
import { listaDecisoes } from "./decidir.js";
import { cartaoGrafico, graficoLinhas } from "../graficos.js";

const pc = v => v == null ? "—" : Math.round(v * 100) + "%";
const cor = v => v == null ? "" : v >= 0.9 ? "ok" : v >= 0.7 ? "hoje" : "vencida";
const estado = { area: "" };

export async function montar(raiz, ctx) {
  const quando = el("span", { class: "sub" });
  const corpo = el("div", { class: "bi painel-geral" });
  raiz.append(el("div", { class: "cabec" }, el("h1", {}, "Painel"), quando, el("div", { class: "espaco" }),
    pessoas.pode("programar") ? el("button", { title: "A mensagem do WhatsApp ou o PDF da inspeção/TOP vira pendências na carteira",
      onclick: async () => { const { colarPendencias } = await import("./colar.js"); colarPendencias(ctx); } },
    "Colar inspeção/TOP") : null), corpo);

  function pintar() {
    limpar(corpo);
    const ref = M.hoje();
    const { ano, semana } = M.semanaAtual();
    quando.textContent = `${br(ref)} · semana ${semana}`;
    const ats = ev.lista();
    const movs = ev.lista("movimentacao");
    // O plano de preventivas que vale é o do mês de hoje; sem ele, o mais recente.
    const { mes: mesPrev, prevs } = planoVigente(ev.lista("preventiva"), ref);

    const r = M.resultados(ats, ano, semana, ref);
    const semanas = [];
    for (let k = 7; k >= 0; k--) {
      let s = semana - k, a = ano;
      while (s < 1) { s += 52; a--; }
      semanas.push({ ano: a, semana: s });
    }
    const fs = fechamentos(semanas, { atividades: ats.filter(a => a.atividade || a.frota) });
    const anterior = fs[fs.length - 2];
    const rp = M.resumoPreventivas(prevs, ref);
    const pt = M.pontualidade(movs, ref);
    const vencidas = ats.filter(a => !a.excluida && !a.cancelada && M.situacaoDe(a, ref) === "VENCIDA").length;

    // ── os números grandes
    const grande = (titulo, valor, texto, cls, ir) => el("div", { class: "grande clicavel " + cls,
      title: "Abrir", onclick: ir },
      el("div", { class: "g-tit" }, titulo), el("div", { class: "g-val" }, valor), el("div", { class: "g-txt" }, texto));
    corpo.append(el("div", { class: "grandes quatro" },
      grande("Aderência da semana", pc(r.aderencia),
        `${r.concluidas_plano} de ${r.plano} do plano · semana ${semana} em andamento` +
        (anterior && naTendencia(anterior, "aderencia") != null ? ` · a ${anterior.semana} fechou em ${pc(naTendencia(anterior, "aderencia"))}` : ""),
        cor(r.aderencia), () => ctx.ir("resultados")),
      grande("Vencidas na oficina", String(vencidas), "atividades com o período encerrado sem conclusão",
        vencidas ? "vencida" : "ok", () => ctx.ir("programacao", "m=abertas&sit=VENCIDA")),
      grande("Preventivas realizadas", pc(rp.preventivas ? rp.pct_realizadas : null),
        `${rp.realizadas} de ${rp.preventivas} do plano de ${mesPrev || "—"} · ${rp.vencidas} vencida${rp.vencidas === 1 ? "" : "s"}`,
        cor(rp.preventivas ? rp.pct_realizadas : null), () => ctx.ir("preventivas", "v=painel")),
      grande("Pontualidade da operação", pc(pt.pct),
        `${pt.no_prazo} de ${pt.concluidas} movimentações no prazo · ${pt.atrasadas} atrasada${pt.atrasadas === 1 ? "" : "s"} agora`,
        cor(pt.pct), () => ctx.ir("movimentacoes"))));

    // ── o que decidir. Aqui, o mesmo tipo de decisão de várias frotas vira uma
    // linha só — o detalhe de cada uma fica no painel de preventivas. O número
    // de urgentes é o de antes de juntar, o mesmo do menu.
    const todasAsDecisoes = todasDecisoes({ ats, movs, prevs, ref, podeAprovar: pessoas.pode("aprovar") });
    const ds = resumir(todasAsDecisoes);
    const areas = ["Programação", "Preventivas", "Movimentação"];
    const filtro = el("div", { class: "faixa-sit" },
      el("button", { class: "fsit" + (estado.area ? "" : " on"), onclick: () => { estado.area = ""; pintar(); } },
        el("b", {}, String(ds.length)), " Todas"),
      areas.map(a => el("button", { class: "fsit" + (estado.area === a ? " on" : ""),
        onclick: () => { estado.area = estado.area === a ? "" : a; pintar(); } },
        el("b", {}, String(ds.filter(d => d.area === a).length)), " ", a)));
    const urgentes = todasAsDecisoes.filter(d => d.nivel === 1).length;
    corpo.append(el("div", { class: "titulo-secao" }, "O que decidir agora",
      el("span", { class: "n" }, `· ${urgentes} urgente${urgentes === 1 ? "" : "s"}, do mais urgente para a oportunidade`)),
      filtro,
      listaDecisoes(ds.filter(d => !estado.area || d.area === estado.area), ctx, { max: 12, comArea: true }));

    // ── um cartão por área
    const linha = (rot, val, cls = "") => el("div", { class: "a-lin" }, el("span", {}, rot), el("b", { class: cls }, String(val)));
    const daSemana = ats.filter(a => !a.excluida && a.semana === semana && a.ano === ano);
    const hh = M.semanaEmHH(ats, ano, semana);
    corpo.append(el("div", { class: "titulo-secao" }, "Por área"), el("div", { class: "areas" },
      el("div", { class: "area-card" },
        el("div", { class: "a-tit" }, `Programação · semana ${semana}`),
        linha("Atividades do plano", r.plano), linha("Concluídas do plano", r.concluidas_plano),
        linha("Extra programação", r.extra), linha("Vencidas (todas as semanas)", vencidas, vencidas ? "t-vencida" : ""),
        linha("Sem OS na semana", daSemana.filter(a => M.aberta(a) && !a.os).length),
        linha("Carga da equipe", pc(hh.ocupacao), hh.ocupacao > 1 ? "t-vencida" : ""),
        el("button", { class: "mini", onclick: () => ctx.ir("programacao", "m=semana") }, "Abrir a Programação")),
      el("div", { class: "area-card" },
        el("div", { class: "a-tit" }, `Preventivas · ${mesPrev || "sem plano"}`),
        linha("No plano", `${rp.preventivas} em ${rp.frotas} frotas`), linha("Realizadas", rp.realizadas),
        linha("Sem liberação da operação", rp.sem_data, rp.sem_data ? "t-hoje" : ""),
        linha("Parada programada", rp.parada_marcada), linha("Conflitos de data", rp.conflitos, rp.conflitos ? "t-vencida" : ""),
        linha("Vencidas", rp.vencidas, rp.vencidas ? "t-vencida" : ""),
        el("button", { class: "mini", onclick: () => ctx.ir("preventivas", "v=painel") }, "Abrir o painel de preventivas")),
      el("div", { class: "area-card" },
        el("div", { class: "a-tit" }, "Movimentação"),
        linha("Em aberto", pt.em_aberto), linha("Atrasadas agora", pt.atrasadas, pt.atrasadas ? "t-vencida" : ""),
        linha("Aguardando aprovação", pt.para_aprovar, pt.para_aprovar ? "t-hoje" : ""),
        linha("Concluídas no prazo", `${pt.no_prazo} de ${pt.concluidas}`),
        linha("Atraso médio", `${String(Math.round(pt.atraso_medio * 10) / 10).replace(".", ",")} dias`),
        el("button", { class: "mini", onclick: () => ctx.ir("movimentacoes") }, "Abrir a Movimentação"))));

    // ── a aderência registrada, semana a semana
    const grade = el("div", { class: "bi-grade" });
    corpo.append(grade);
    const card = cartaoGrafico("Aderência e cumprimento, semana a semana",
      "o número registrado no fechamento de cada semana; a atual, calculada hoje; sem número, em branco · clique para abrir",
      el("div", { class: "g-corpo" }), { legendaDe: [{ nome: "Aderência à programação", cor: "var(--s1)" },
        { nome: "Cumprimento geral", cor: "var(--s2)" }] });
    card.classList.add("larga");
    grade.append(card);
    card.querySelector(".g-corpo").append(graficoLinhas({
      largura: Math.max(280, (card.clientWidth || 600) - 28), xs: semanas.map(w => "S" + w.semana), meta: 0.9,
      marcado: semanas.length - 1,
      // semana que acabou sem número registrado fica de fora (ver naTendencia)
      series: [{ nome: "Aderência", cor: "var(--s1)", valores: fs.map(f => naTendencia(f, "aderencia")) },
        { nome: "Cumprimento", cor: "var(--s2)", valores: fs.map(f => naTendencia(f, "cumprimento")) }],
      aoClicar: i => ctx.ir("resultados", `s=${semanas[i].semana}&a=${semanas[i].ano}`) }));
  }

  let tempo = null;
  const aoRedimensionar = () => { clearTimeout(tempo); tempo = setTimeout(pintar, 180); };
  window.addEventListener("resize", aoRedimensionar);
  pintar();
  const parar = ev.ouvir(pintar);
  return { desmontar: () => { parar(); window.removeEventListener("resize", aoRedimensionar); } };
}
