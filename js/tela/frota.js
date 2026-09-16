// A história de um caminhão.
//
// Quando alguém pergunta "o que já foi feito na 815?", a resposta está espalhada
// por semanas e por telas. Aqui ela fica em um lugar só: o que está aberto, o
// que foi feito, quantas vezes cada coisa foi empurrada, e o registro inteiro.

import * as ev from "../eventos.js";
import * as M from "../modelo.js";
import { el, limpar, br, cartaoNumero, vazio, selecao } from "../ui.js";
import { cartao, botaoConcluir, secao, criarNova, frotas, descreverEvento } from "./comum.js";

export async function montar(raiz, ctx, params) {
  let frota = params.get("f") || "";

  const escolha = el("select", { style: "width:auto;min-width:150px",
    onchange: () => { frota = escolha.value; pintar(); } });
  const corpo = el("div", {});

  raiz.append(
    el("div", { class: "cabec" },
      el("h1", {}, "Frota"), escolha,
      el("div", { class: "espaco" }),
      el("button", { class: "primario", onclick: () => criarNova(ctx, { frota }) }, "+ Nova")),
    corpo);

  function pintarEscolha() {
    const lista = frotas();
    if (!frota && lista.length) frota = lista[0];
    limpar(escolha);
    escolha.append(el("option", { value: "" }, "— escolha a frota —"));
    for (const f of lista) escolha.append(el("option", { value: f, selected: f === frota }, f));
  }

  function pintar() {
    pintarEscolha();
    limpar(corpo);
    if (!frota) { corpo.append(vazio("Escolha uma frota.")); return; }

    const todas = ev.lista().filter(a => a.frota === frota);
    const abertas = todas.filter(a => !a.concluida_em && !a.cancelada);
    const feitas = todas.filter(a => a.concluida_em);
    const programadas = abertas.filter(a => a.semana);
    const carteira = abertas.filter(a => !a.semana);
    const vencidas = programadas.filter(a => M.situacaoDe(a) === "VENCIDA");
    const reprog = todas.reduce((s, a) => s + (a.reprogramacoes || 0), 0);
    const comOS = todas.filter(a => a.os).length;
    const cliente = (todas.find(a => a.cliente) || {}).cliente;
    const ultima = feitas.map(a => a.concluida_em).sort().pop();

    corpo.append(el("div", { class: "numeros", style: "margin-bottom:18px" },
      cartaoNumero(abertas.length, "em aberto",
        carteira.length ? `${carteira.length} na carteira` : ""),
      cartaoNumero(vencidas.length, "passaram do prazo", "", vencidas.length ? "alerta" : ""),
      cartaoNumero(feitas.length, "já fechadas", ultima ? "última em " + br(ultima) : ""),
      cartaoNumero(reprog, "reprogramações", "somando todas as atividades"),
      cartaoNumero(`${comOS}/${todas.length}`, "com OS aberta", cliente || "")));

    if (programadas.length) {
      corpo.append(secao("Programadas",
        el("div", { class: "lista" }, programadas.sort(porSemana)
          .map(a => cartao(a, { ctx, acoes: [botaoConcluir(a, ctx)] }))),
        programadas.length));
    }
    if (carteira.length) {
      corpo.append(secao("Na carteira",
        el("div", { class: "lista" }, carteira.sort(porServico).map(a => cartao(a, { ctx }))),
        carteira.length));
    }
    if (feitas.length) {
      corpo.append(secao("Histórico de serviços",
        el("div", { class: "lista" },
          feitas.sort((x, y) => y.concluida_em.localeCompare(x.concluida_em))
            .map(a => cartao(a, { ctx, compacto: true }))),
        feitas.length));
    }

    const canceladas = todas.filter(a => a.cancelada);
    if (canceladas.length) {
      corpo.append(secao("Canceladas",
        el("div", { class: "lista" }, canceladas.map(a => cartao(a, { ctx, compacto: true }))),
        canceladas.length));
    }

    const ids = new Set(todas.map(a => a.id));
    const registro = ev.log.filter(e => ids.has(e.alvo)).slice(-60).reverse();
    corpo.append(secao("Registro da frota",
      registro.length ? el("div", {}, registro.map(e => descreverEvento(e, true)))
        : vazio("Sem lançamentos."),
      registro.length));
  }

  const porSemana = (x, y) => (x.semana - y.semana) ||
    M.DIAS.indexOf(x.dia) - M.DIAS.indexOf(y.dia);
  const porServico = (x, y) =>
    String(x.servico).localeCompare(String(y.servico), "pt-BR");

  pintar();
  return { desmontar: ev.ouvir(pintar) };
}
