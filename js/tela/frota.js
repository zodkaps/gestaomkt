// A história de um caminhão.
//
// Quando alguém pergunta "o que já foi feito na 815?", a resposta está espalhada
// por semanas e por telas. Aqui ela fica em um lugar só: o que está aberto, o
// que foi feito, quantas vezes cada coisa foi empurrada, e o registro inteiro.

import * as ev from "../eventos.js";
import * as M from "../modelo.js";
import { el, limpar, br, cartaoNumero, vazio } from "../ui.js";
import { busca as semAcento } from "../texto.js";
import { cartao, botaoConcluir, secao, criarNova, frotas, descreverEvento, programarEmLote } from "./comum.js";
import { cartaoMov } from "./movimentacoes.js";
import { cartaoPrev, abrirFichaPrev, ordemMes, rotuloMes } from "./preventivas.js";
import { imprimirFrota } from "./imprimir.js";
import { planoVigente } from "../decisoes.js";
import * as pessoas from "../pessoas.js";

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

  const bTodas = el("button", { class: "discreto", title: "Voltar para a lista de frotas",
    onclick: () => ctx.voltarPara("frota") }, "‹ Todas as frotas");
  raiz.append(
    el("div", { class: "cabec" },
      el("h1", {}, "Frota"), escolha, lista, bTodas,
      el("div", { class: "espaco" }),
      bImprimir,
      pessoas.pode("programar") ? el("button", { title: "A mensagem ou o PDF da inspeção/TOP desta frota vira pendências na carteira",
        onclick: async () => { const { colarPendencias } = await import("./colar.js"); colarPendencias(ctx, { frota }); } },
      "Colar inspeção/TOP") : null,
      el("button", { class: "primario", onclick: () => criarNova(ctx, { frota }) }, "+ Nova")),
    corpo);

  function pintarEscolha() {
    limpar(lista);
    for (const f of frotas()) lista.append(el("option", { value: f }));
    if (document.activeElement !== escolha && frota && escolha.value !== frota) escolha.value = frota;
  }

  /** Todas as frotas para tocar, as com mais pendência primeiro — e, em cada
   *  uma, o que pede atenção antes de abrir: preventiva vencida, a parada
   *  marcada, a movimentação em aberto. */
  function grade() {
    const ref = M.hoje();
    const abertasPor = new Map();
    for (const a of ev.lista()) if (a.frota && M.aberta(a)) abertasPor.set(a.frota, (abertasPor.get(a.frota) || 0) + 1);
    const selos = selosDasFrotas(ref);
    const q = chave(busca);
    const todas = frotas().filter(f => !q || chave(f).includes(q))
      .sort((x, y) => (abertasPor.get(y) || 0) - (abertasPor.get(x) || 0) ||
        x.localeCompare(y, "pt-BR", { numeric: true }));
    if (!todas.length) return vazio("Nenhuma frota com esse número.");
    return el("div", { class: "grade-frotas" }, todas.map(f => {
      const n = abertasPor.get(f) || 0;
      const sf = selos.get(f) || [];
      return el("button", {
        class: "frota-chip" + (n ? "" : " sem"),
        // pelo endereço: o voltar (botão do alto, Alt+←, gesto do celular) traz de volta à grade
        onclick: () => ctx.ir("frota", "f=" + encodeURIComponent(f)),
      }, el("b", {}, f), el("span", {}, n ? `${n} em aberto` : "nada em aberto"),
      sf.length ? el("div", { class: "selos" }, sf.map(x =>
        el("i", { class: "selo " + x.classe, title: x.titulo }, x.texto))) : null);
    }));
  }

  function pintar() {
    pintarEscolha();
    bImprimir.hidden = !frota;
    bTodas.hidden = !frota;
    limpar(corpo);
    if (!frota) { corpo.append(grade()); return; }

    const ref = M.hoje();
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

    // A história do caminhão não é só o que a oficina fez nele: é também cada
    // vez que ele saiu do pátio e cada preventiva. Separado em três telas,
    // ninguém junta — e a pergunta "por que a 815 não anda?" quase sempre se
    // responde com as três juntas.
    const movs = ev.lista("movimentacao").filter(m => m.frota === frota && !m.excluida);
    const movAbertas = movs.filter(M.movimentacaoAberta);
    const prevs = ev.lista("preventiva").filter(p => p.frota === frota && !p.excluida);
    // As de fora da conta do mês não entram na lista, como no quadro do pé da aba.
    const doPlano = prevs.filter(p => !p.fora);

    corpo.append(el("div", { class: "numeros", style: "margin-bottom:18px" },
      cartaoNumero(abertas.length, "em aberto",
        carteira.length ? `${carteira.length} na carteira` : ""),
      cartaoNumero(vencidas.length, "vencidas", "", vencidas.length ? "alerta" : ""),
      cartaoNumero(feitas.length, "concluídas", ultima ? "última em " + br(ultima) : ""),
      cartaoNumero(reprog, "reprogramações", "somando todas as atividades"),
      cartaoNumero(`${comOS}/${todas.length}`, "com OS aberta", cliente || ""),
      cartaoNumero(movAbertas.length, "em movimentação")));

    // As seções, cada uma com âncora: o resumo do alto leva até elas.
    const secoes = {};
    const sec = (chave, titulo, conteudo, n) => {
      const s = secao(titulo, conteudo, n);
      s.id = "frota-" + chave;
      secoes[chave] = s;
      return s;
    };
    const irPara = chave => () => secoes[chave] && secoes[chave].scrollIntoView({ behavior: "smooth", block: "start" });

    // ── o resumo: a preventiva, a próxima programada, a movimentação, a última baixa
    const doMes = planoVigente(ev.lista("preventiva").filter(p => !p.excluida), ref);
    const prevMes = doMes.prevs.filter(p => p.frota === frota && !p.fora)[0];
    const resumo = [];
    if (prevMes) {
      const sit = M.situacaoPreventiva(prevMes, ref);
      const venc = M.preventivaVencida(prevMes, ref);
      const sub = [];
      if (prevMes.dia_parada && !M.preventivaFeita(prevMes)) sub.push("parada " + br(prevMes.dia_parada));
      if (prevMes.realizada_em) sub.push("realizada em " + br(prevMes.realizada_em));
      if (M.venceEfetivo(prevMes) && !M.preventivaFeita(prevMes)) sub.push("vence " + br(M.venceEfetivo(prevMes)));
      resumo.push(itemResumo(`Preventiva de ${rotuloMes(doMes.mes).split("/")[0]}`,
        M.rotulo(sit) + (venc ? " · vencida" : ""), sub.join(" · "),
        () => abrirFichaPrev(prevMes.id, ctx), "prev" + (venc ? " alerta" : "")));
    } else if (doMes.mes) {
      // Fora da conta do mês (o quadro do pé da aba) não é o mesmo que fora do mapa.
      const fora = doMes.prevs.find(p => p.frota === frota && p.fora);
      resumo.push(itemResumo(`Preventiva de ${rotuloMes(doMes.mes).split("/")[0]}`,
        fora ? "fora da conta do mês" : "não está no plano",
        fora ? (fora.por_que_fora || "") : doPlano.length ? "ver as dos outros meses" : "",
        fora ? () => abrirFichaPrev(fora.id, ctx) : doPlano.length ? irPara("prev") : null));
    }
    const proxima = programadas.slice().sort(porSemana)[0];
    if (proxima) {
      resumo.push(itemResumo("Próxima na programação", proxima.atividade || "—",
        `semana ${proxima.semana} · ${proxima.dia || "sem dia"}${M.situacaoDe(proxima) === "VENCIDA" ? " · vencida" : ""}`,
        irPara("programadas"), M.situacaoDe(proxima) === "VENCIDA" ? "alerta" : ""));
    } else if (carteira.length) {
      resumo.push(itemResumo("Próxima na programação", "nada programado",
        `${carteira.length} na carteira esperando`, irPara("carteira")));
    }
    if (movAbertas.length) {
      const m = movAbertas[0];
      resumo.push(itemResumo("Movimentação em aberto", [m.acao, m.destino].filter(Boolean).join(" · ") || "em aberto",
        M.situacaoMovimentacao(m, ref) + (m.prometida_para ? " · prazo " + br(m.prometida_para) : ""),
        irPara("mov"), M.situacaoMovimentacao(m, ref) === "Atrasada" ? "alerta" : ""));
    }
    if (ultima) {
      const a = feitas.filter(x => x.concluida_em === ultima)[0];
      resumo.push(itemResumo("Última baixa", br(ultima), a ? a.atividade : "", irPara("historico")));
    }
    if (resumo.length) corpo.append(el("div", { class: "resumo-frota" }, resumo));

    // ── preventivas: de todos os meses, a do mês mais novo primeiro. Ela é a
    // categoria que mais importa aqui — preventiva que escorrega vira corretiva.
    if (doPlano.length) {
      const meses = [...new Set(doPlano.map(p => p.mes || ""))].sort((x, y) => ordemMes(y) - ordemMes(x));
      const caixaPrev = el("div", {});
      for (const m of meses) {
        const doM = doPlano.filter(p => (p.mes || "") === m)
          .sort((x, y) => (M.preventivaAberta(y) ? 1 : 0) - (M.preventivaAberta(x) ? 1 : 0));
        caixaPrev.append(el("div", { class: "mes-prev" }, rotuloMes(m)),
          el("div", { class: "lista" }, doM.map(p => cartaoPrev(p, ctx))));
      }
      corpo.append(sec("prev", "Preventivas do plano", caixaPrev, doPlano.length));
    }

    if (movAbertas.length) {
      corpo.append(sec("mov", "Em movimentação agora",
        el("div", { class: "lista" }, movAbertas.map(m => cartaoMov(m, ctx))),
        movAbertas.length));
    }
    if (programadas.length) {
      corpo.append(sec("programadas", "Programadas",
        el("div", { class: "lista" }, programadas.sort(porSemana)
          .map(a => cartao(a, { ctx, acoes: [botaoConcluir(a, ctx)] }))),
        programadas.length));
    }
    if (carteira.length) {
      // Na ordem da carteira da Programação: preventiva, P1, P2, P3, e a mais
      // velha primeiro dentro de cada uma.
      carteira.sort(M.ordemCarteira(ref));
      corpo.append(sec("carteira", "Na carteira",
        el("div", {},
          pessoas.pode("programar") ? el("div", { class: "sec-acoes" },
            el("button", { class: "primario-leve programar-carteira", title: "Programar todas (ou as que escolher) de uma vez",
              onclick: () => programarEmLote(carteira) }, `Programar a carteira (${carteira.length})`)) : null,
          el("div", { class: "lista" }, carteira.map(a => cartao(a, { ctx, idade: true })))),
        carteira.length));
    }
    if (feitas.length) {
      corpo.append(sec("historico", "Histórico de serviços",
        el("div", { class: "lista" },
          feitas.sort((x, y) => (y.concluida_em || "").localeCompare(x.concluida_em || ""))
            .map(a => cartao(a, { ctx, compacto: true }))),
        feitas.length));
    }

    const movFeitas = movs.filter(m => !M.movimentacaoAberta(m) && !m.cancelada)
      .sort((x, y) => (y.chegou_em || "").localeCompare(x.chegou_em || ""));
    if (movFeitas.length) {
      corpo.append(sec("movfeitas", "Movimentações recentes",
        el("div", { class: "lista" }, movFeitas.slice(0, 5).map(m => cartaoMov(m, ctx))),
        movFeitas.length > 5 ? `5 de ${movFeitas.length}` : movFeitas.length));
    }

    const canceladas = todas.filter(a => a.cancelada);
    if (canceladas.length) {
      corpo.append(sec("canceladas", "Canceladas",
        el("div", { class: "lista" }, canceladas.map(a => cartao(a, { ctx, compacto: true }))),
        canceladas.length));
    }

    const ids = new Set([...todas.map(a => a.id), ...movs.map(m => m.id), ...prevs.map(p => p.id)]);
    const registro = ev.log.filter(e => ids.has(e.alvo)).slice(-60).reverse();
    corpo.append(sec("registro", "Registro da frota",
      registro.length ? el("div", {}, registro.map(e => descreverEvento(e, true)))
        : vazio("Sem lançamentos."),
      registro.length));
  }

  /** Um quadro do resumo do alto. Sem `onclick`, não é botão. */
  function itemResumo(rotulo, valor, sub, onclick, classe = "") {
    const filhos = [el("span", { class: "r-rot" }, rotulo), el("span", { class: "r-val" }, valor),
      sub ? el("span", { class: "r-sub" }, sub) : null];
    return onclick ? el("button", { type: "button", class: classe, onclick }, filhos)
      : el("div", { class: classe }, filhos);
  }

  /** Os selos da grade, frota por frota. A preventiva é a do plano do mês —
   *  é ela que a aba Preventivas acompanha. */
  function selosDasFrotas(ref) {
    const r = new Map();
    const por = f => r.get(f) || (r.set(f, []), r.get(f));
    const doMes = planoVigente(ev.lista("preventiva").filter(p => !p.excluida), ref);
    for (const p of doMes.prevs) {
      if (!p.frota || !M.preventivaAberta(p)) continue;
      if (M.preventivaVencida(p, ref)) {
        por(p.frota).push({ classe: "vencida", texto: "preventiva vencida",
          titulo: `A preventiva de ${rotuloMes(doMes.mes)} venceu em ${br(M.venceEfetivo(p))}` });
      }
      if (p.dia_parada && p.dia_parada >= ref) {
        por(p.frota).push({ classe: "prev", texto: "parada " + br(p.dia_parada).slice(0, 5),
          titulo: `Parada da preventiva marcada para ${br(p.dia_parada)}` });
      } else if (p.dia_parada) {
        por(p.frota).push({ classe: "vencida", texto: "parada passou",
          titulo: `A parada era ${br(p.dia_parada)} e a preventiva não teve baixa` });
      }
    }
    for (const m of ev.lista("movimentacao")) {
      if (!m.frota || !M.movimentacaoAberta(m)) continue;
      if (por(m.frota).some(x => x.classe === "mov")) continue;
      por(m.frota).push({ classe: "mov", texto: "em movimentação",
        titulo: [m.acao, m.destino].filter(Boolean).join(" · ") || "Movimentação em aberto" });
    }
    return r;
  }

  const porSemana = (x, y) => (x.semana - y.semana) ||
    M.DIAS.indexOf(x.dia) - M.DIAS.indexOf(y.dia);

  pintar();
  return { desmontar: ev.ouvir(pintar) };
}
