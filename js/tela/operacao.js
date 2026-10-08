// A tela do pátio: o que a oficina está esperando de você.
//
// Pedro e João Victor abrem isto no celular, em pé, do lado de um caminhão. Não
// precisam de carteira, de HH nem de aderência — precisam de duas perguntas:
// que frota já foi e ainda não voltou, e que frota pode parar para preventiva.
// Qualquer coisa a mais nesta tela é coisa para rolar antes de achar o que
// importa.

import * as ev from "../eventos.js";
import * as M from "../modelo.js";
import * as pessoas from "../pessoas.js";
import { el, limpar, br, brCurto, chip, avisar, vazio, cartaoNumero } from "../ui.js";
import { secao } from "./comum.js";
import { apontarChegada, novaMovimentacao, cartaoMov } from "./movimentacoes.js";
import { informarDisponibilidade, cartaoPrev } from "./preventivas.js";

export async function montar(raiz, ctx) {
  const corpo = el("div", {});
  raiz.append(
    el("div", { class: "cabec" },
      el("h1", {}, "Para você"),
      el("div", { class: "espaco" }),
      el("button", { class: "primario", onclick: () => novaMovimentacao(ctx) },
        "+ Movimentação")),
    corpo);

  function pintar() {
    limpar(corpo);
    const hoje = M.hoje();
    const movs = ev.lista("movimentacao");
    const prevs = ev.lista("preventiva");

    const fora = movs.filter(M.movimentacaoAberta)
      .sort((a, b) => String(a.prometida_para || "9999").localeCompare(String(b.prometida_para || "9999")));
    const atrasadas = fora.filter(m => M.situacaoMovimentacao(m, hoje) === "ATRASADA");
    const semDisp = prevs.filter(p => M.preventivaAberta(p) && M.esperandoQuem(p) === "Operação")
      .sort((a, b) => String(a.vence || "9999").localeCompare(String(b.vence || "9999")));

    corpo.append(el("div", { class: "numeros", style: "margin-bottom:16px" },
      cartaoNumero(fora.length, "frotas fora, sem voltar", "", fora.length ? "alerta" : ""),
      cartaoNumero(atrasadas.length, "passaram do prometido", "", atrasadas.length ? "alerta" : ""),
      cartaoNumero(semDisp.length, "esperando sua data", "para preventiva")));

    if (!fora.length && !semDisp.length) {
      corpo.append(el("p", { class: "nada", style: "font-size:15px;padding:26px 0;text-align:center" },
        "Nada esperando por você agora. 👍"));
    }

    if (fora.length) {
      corpo.append(secao("Frotas fora — aponte quando voltar",
        el("div", { class: "lista" }, fora.map(m => cartaoMov(m, ctx, {
          acoes: [el("button", { class: "primario",
            onclick: e => { e.stopPropagation(); apontarChegada(m, ctx); } }, "Chegou")],
        }))), fora.length));
    }

    if (semDisp.length) {
      corpo.append(secao("Quando esta frota pode parar?",
        el("div", { class: "lista" }, semDisp.map(p => cartaoPrev(p, ctx, {
          acoes: [el("button", { class: "primario",
            onclick: e => { e.stopPropagation(); informarDisponibilidade(p, ctx); } },
            "Informar")],
        }))), semDisp.length));
    }

    // O que ele já respondeu hoje, para dar a sensação de progresso e permitir
    // corrigir um toque errado sem precisar procurar a frota numa lista longa.
    const hojeFeito = ev.log.filter(e => e.ts.slice(0, 10) === hoje &&
      e.autor === pessoas.nome() &&
      ["mov_chegou", "prev_disponivel", "mov_prometida", "criada"].includes(e.tipo));
    if (hojeFeito.length) {
      corpo.append(secao("Você lançou hoje",
        el("div", { class: "lista" }, hojeFeito.slice(-8).reverse().map(e => {
          const alvo = ev.achar(e.alvo);
          const nome = alvo ? (alvo.item.frota || "—") : "—";
          const oq = e.tipo === "mov_chegou" ? `chegou em ${br(e.dados.em)}`
            : e.tipo === "prev_disponivel" ? `disponível ${e.dados.quando === "agora" ? "agora" : "em " + br(e.dados.quando)}`
            : e.tipo === "mov_prometida" ? `prometida para ${br(e.dados.para)}`
            : "lançada";
          return el("div", { class: "at ok" },
            el("div", { class: "meio" },
              el("div", { class: "tit" }, nome),
              el("div", { class: "sub" }, oq)));
        })), hojeFeito.length));
    }
  }

  pintar();
  return { desmontar: ev.ouvir(pintar) };
}
