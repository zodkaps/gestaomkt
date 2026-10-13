// A história de um caminhão.
//
// Quando alguém pergunta "o que já foi feito na 815?", a resposta está espalhada
// por semanas e por telas. Aqui ela fica em um lugar só: o que está aberto, o
// que foi feito, quantas vezes cada coisa foi empurrada, e o registro inteiro.

import * as ev from "../eventos.js";
import * as M from "../modelo.js";
import { el, limpar, br, cartaoNumero, vazio } from "../ui.js";
import { busca as semAcento } from "../texto.js";
import { cartao, botaoConcluir, secao, criarNova, frotas, descreverEvento } from "./comum.js";
import { cartaoMov } from "./movimentacoes.js";
import { cartaoPrev } from "./preventivas.js";
import { imprimirFrota } from "./imprimir.js";

export async function montar(raiz, ctx, params) {
  let frota = params.get("f") || "";

  // A frota se pesquisa, como na Programação: "969" acha a F-969. Sem frota
  // escolhida, a tela mostra todas para tocar, com quantas pendências cada uma tem.
  const chave = t => semAcento(String(t || "")).replace(/[^a-z0-9]/g, "");
  const escolha = el("input", { type: "search", class: "busca-frota", placeholder: "Pesquisar frota",
    list: "dl-frotas-tela", autocomplete: "off", spellcheck: false, value: frota,
    oninput: () => {
      const exata = frotas().find(f => chave(f) === chave(escolha.value));
      frota = exata || "";
      busca = exata ? "" : escolha.value.trim();
      pintar();
    } });
  const lista = el("datalist", { id: "dl-frotas-tela" });
  let busca = "";
  const corpo = el("div", {});
  const bImprimir = el("button", { title: "A folha com todas as pendências em aberto desta frota",
    onclick: () => frota && imprimirFrota(frota) }, "Imprimir folha");

  raiz.append(
    el("div", { class: "cabec" },
      el("h1", {}, "Frota"), escolha, lista,
      el("div", { class: "espaco" }),
      bImprimir,
      el("button", { class: "primario", onclick: () => criarNova(ctx, { frota }) }, "+ Nova")),
    corpo);

  function pintarEscolha() {
    limpar(lista);
    for (const f of frotas()) lista.append(el("option", { value: f }));
    if (document.activeElement !== escolha && frota && escolha.value !== frota) escolha.value = frota;
  }

  /** Todas as frotas para tocar, as com mais pendência primeiro. */
  function grade() {
    const abertasPor = new Map();
    for (const a of ev.lista()) if (a.frota && M.aberta(a)) abertasPor.set(a.frota, (abertasPor.get(a.frota) || 0) + 1);
    const q = chave(busca);
    const todas = frotas().filter(f => !q || chave(f).includes(q))
      .sort((x, y) => (abertasPor.get(y) || 0) - (abertasPor.get(x) || 0) ||
        x.localeCompare(y, "pt-BR", { numeric: true }));
    if (!todas.length) return vazio("Nenhuma frota com esse número.");
    return el("div", { class: "grade-frotas" }, todas.map(f => el("button", {
      class: "frota-chip" + ((abertasPor.get(f) || 0) ? "" : " sem"),
      onclick: () => { frota = f; busca = ""; escolha.value = f; pintar(); window.scrollTo(0, 0); },
    }, el("b", {}, f), el("span", {}, (abertasPor.get(f) || 0) ? `${abertasPor.get(f)} em aberto` : "nada em aberto"))));
  }

  function pintar() {
    pintarEscolha();
    bImprimir.hidden = !frota;
    limpar(corpo);
    if (!frota) { corpo.append(grade()); return; }

    const todas = ev.lista().filter(a => a.frota === frota);
    const abertas = todas.filter(M.aberta);
    const feitas = todas.filter(M.feita);
    const programadas = abertas.filter(a => a.semana);
    const carteira = abertas.filter(a => !a.semana);
    const vencidas = programadas.filter(a => M.situacaoDe(a) === "VENCIDA");
    const reprog = todas.reduce((s, a) => s + (a.reprogramacoes || 0), 0);
    const comOS = todas.filter(a => a.os).length;
    const cliente = (todas.find(a => a.cliente) || {}).cliente;
    const ultima = feitas.map(a => a.concluida_em).filter(Boolean).sort().pop();

    corpo.append(el("div", { class: "numeros", style: "margin-bottom:18px" },
      cartaoNumero(abertas.length, "em aberto",
        carteira.length ? `${carteira.length} na carteira` : ""),
      cartaoNumero(vencidas.length, "vencidas", "", vencidas.length ? "alerta" : ""),
      cartaoNumero(feitas.length, "concluídas", ultima ? "última em " + br(ultima) : ""),
      cartaoNumero(reprog, "reprogramações", "somando todas as atividades"),
      cartaoNumero(`${comOS}/${todas.length}`, "com OS aberta", cliente || ""),
      cartaoNumero(ev.lista("movimentacao").filter(m => m.frota === frota &&
        M.movimentacaoAberta(m)).length, "em movimentação")));

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
          feitas.sort((x, y) => (y.concluida_em || "").localeCompare(x.concluida_em || ""))
            .map(a => cartao(a, { ctx, compacto: true }))),
        feitas.length));
    }

    const canceladas = todas.filter(a => a.cancelada);
    if (canceladas.length) {
      corpo.append(secao("Canceladas",
        el("div", { class: "lista" }, canceladas.map(a => cartao(a, { ctx, compacto: true }))),
        canceladas.length));
    }

    // A história do caminhão não é só o que a oficina fez nele: é também cada
    // vez que ele saiu do pátio e cada preventiva esperando. Separado em três
    // telas, ninguém junta — e a pergunta "por que a 815 não anda?" quase
    // sempre se responde com as três juntas.
    const movs = ev.lista("movimentacao").filter(m => m.frota === frota);
    const movAbertas = movs.filter(M.movimentacaoAberta);
    const prevs = ev.lista("preventiva").filter(p => p.frota === frota);
    const prevAbertas = prevs.filter(M.preventivaAberta);

    if (movAbertas.length) {
      corpo.append(secao("Em movimentação agora",
        el("div", { class: "lista" }, movAbertas.map(m => cartaoMov(m, ctx))),
        movAbertas.length));
    }
    if (prevAbertas.length) {
      corpo.append(secao("Preventivas em aberto",
        el("div", { class: "lista" }, prevAbertas.map(p => cartaoPrev(p, ctx))),
        prevAbertas.length));
    }

    const ids = new Set([...todas.map(a => a.id), ...movs.map(m => m.id), ...prevs.map(p => p.id)]);
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
