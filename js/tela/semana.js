// O quadro da semana.
//
// Arrastar um cartão de um dia para outro NÃO é mover uma caixa na tela: é
// reprogramar, e por isso abre a caixa de motivo antes de gravar. A tela não
// tem um caminho silencioso para mudar programação — é a mesma regra do
// `eventos.js`, só que visível.

import * as ev from "../eventos.js";
import * as M from "../modelo.js";
import { el, limpar, br, brCurto, medidor, avisar, vazio } from "../ui.js";
import { cartao, botaoConcluir, secao, criarNova, reprogramar } from "./comum.js";

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
      el("div", { class: "espaco" }),
      el("button", { onclick: () => { ano = agora.ano; semana = agora.semana; pintar(); } }, "Semana atual"),
      el("button", { class: "primario", onclick: () => criarNova(ctx, { ano, semana }) }, "+ Nova")),
    corpo);

  function andar(n) {
    semana += n;
    if (semana > 53) { semana = 1; ano++; }
    if (semana < 1) { semana = 53; ano--; }
    pintar();
  }

  async function soltar(id, dia) {
    const a = ev.porId(id);
    if (!a || a.dia === dia) return;
    await reprogramar(a, ctx, { ano, semana, dia, dias: a.dias || 1 });
  }

  function coluna(dia, itens, datas, hoje) {
    const i = M.DIAS.indexOf(dia);
    const data = i >= 0 ? datas[i] : "";
    const col = el("div", { class: "dia" + (data === hoje ? " e-hoje" : "") },
      el("h3", {}, el("span", {}, dia || "Sem dia"),
        el("i", {}, data ? brCurto(data) : `${itens.length}`)),
      el("div", { class: "lista" },
        itens.length ? itens.map(a => cartaoArrastavel(a)) : vazio("—")),
      el("button", { class: "discreto", style: "width:100%;justify-content:center;margin-top:6px",
        onclick: () => criarNova(ctx, { ano, semana, dia }) }, "+"));

    col.addEventListener("dragover", e => { e.preventDefault(); col.classList.add("alvo"); });
    col.addEventListener("dragleave", () => col.classList.remove("alvo"));
    col.addEventListener("drop", e => {
      e.preventDefault();
      col.classList.remove("alvo");
      const id = e.dataTransfer.getData("text/plain");
      if (id) soltar(id, dia);
    });
    return col;
  }

  function cartaoArrastavel(a) {
    const n = cartao(a, { ctx, compacto: true,
      acoes: a.concluida_em || a.cancelada ? [] : [botaoConcluir(a, ctx)] });
    if (!a.concluida_em && !a.cancelada) {
      n.draggable = true;
      n.addEventListener("dragstart", e => {
        e.dataTransfer.setData("text/plain", a.id);
        e.dataTransfer.effectAllowed = "move";
      });
    }
    return n;
  }

  function pintar() {
    limpar(corpo);
    const datas = M.datasDaSemana(ano, semana);
    const hoje = M.hoje();
    rotulo.textContent = `${semana}/${ano}`;

    const todas = ev.lista();
    const daSemana = todas.filter(a => a.semana === semana && a.ano === ano && !a.cancelada);
    const ad = M.aderencia(todas, ano, semana);

    corpo.append(el("p", { style: "color:var(--fraco);font-size:13px;margin-bottom:12px" },
      `${br(datas[0])} a ${br(datas[6])} · ${daSemana.length} atividade${daSemana.length === 1 ? "" : "s"}` +
      ` · ${ad.concluidas} de ${ad.programadas} programadas fechadas` +
      (ad.pct == null ? "" : ` (${ad.pct}%)`) +
      (ad.extras ? ` · ${ad.extras} extra${ad.extras === 1 ? "" : "s"}` : "")));

    if (!daSemana.length) {
      corpo.append(vazio("Semana vazia. Puxe atividades da carteira para programá-las."));
      return;
    }

    // Sábado e domingo só aparecem quando têm trabalho: cinco colunas cabem na
    // tela, sete espremem tudo e ninguém programa no fim de semana toda semana.
    const usados = new Set(daSemana.map(a => a.dia).filter(Boolean));
    const dias = M.DIAS.slice(0, 5).concat(M.DIAS.slice(5).filter(d => usados.has(d)));

    const grade = el("div", { class: "semana" });
    for (const d of dias) {
      grade.append(coluna(d, daSemana.filter(a => a.dia === d).sort(ordenar), datas, hoje));
    }
    corpo.append(grade);

    const semDia = daSemana.filter(a => !a.dia);
    if (semDia.length) {
      corpo.append(el("div", { style: "height:14px" }),
        secao("Nesta semana, sem dia marcado",
          el("div", { class: "semana" }, coluna("", semDia.sort(ordenar), datas, hoje)),
          semDia.length));
    }
  }

  function ordenar(x, y) {
    const pr = a => ({ P1: 0, P2: 1, P3: 2 })[a.prioridade] ?? 3;
    const feito = a => (a.concluida_em ? 1 : 0);
    return feito(x) - feito(y) || pr(x) - pr(y) ||
      String(x.frota).localeCompare(String(y.frota), "pt-BR");
  }

  pintar();
  return { desmontar: ev.ouvir(pintar) };
}
