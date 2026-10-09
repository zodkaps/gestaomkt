// O mapa de preventivas do mês — e o aperto de mão entre duas áreas.
//
// Uma preventiva só acontece quando duas pessoas respondem coisas diferentes:
// a operação diz **quando o caminhão fica livre**, o PCM diz **que dia ele
// para**. Na planilha isso são duas colunas lado a lado, e o resultado de hoje
// mostra onde o processo trava: 18 preventivas esperando a data da operação e
// 18 esperando o PCM marcar a parada, com 13 já vencidas.
//
// Por isso a tela é organizada por DE QUEM É A BOLA, e não por frota ou por
// vencimento: a pergunta que destrava não é "o que vence antes?", é "o que
// está parado esperando mim?".

import * as ev from "../eventos.js";
import * as M from "../modelo.js";
import * as pessoas from "../pessoas.js";
import { el, limpar, br, brCurto, chip, caixa, campo, selecao, comSugestoes,
  avisar, erro, vazio, cartaoNumero, cliqueLimpo } from "../ui.js";
import { secao, frotas } from "./comum.js";
import { busca as semAcento } from "../texto.js";

export function cartaoPrev(p, ctx, { acoes = [] } = {}) {
  const s = M.situacaoPreventiva(p);
  const esperando = M.esperandoQuem(p);
  const tags = [chip(s, M.corDe(s))];
  if (esperando) tags.push(chip("bola com " + esperando, esperando === "Operação" ? "hoje" : "andando"));
  if (p.os) tags.push(chip("OS " + p.os, "os"));
  if (p.pendencias > 0) tags.push(chip(`${p.pendencias} pendência${p.pendencias === 1 ? "" : "s"} na carteira`));
  if (p.onde_fazer === "Terceiro") tags.push(chip("terceiro"));

  const sub = [];
  if (p.plano) sub.push(p.plano);
  if (p.equipamento) sub.push(p.equipamento);
  if (p.local) sub.push(p.local);
  if (p.vence) sub.push("vence " + brCurto(p.vence));
  if (p.disponivel_agora) sub.push("livre agora");
  else if (p.disponivel_em) sub.push("livre " + brCurto(p.disponivel_em));
  if (p.dia_parada) sub.push("para " + brCurto(p.dia_parada));

  return el("div", { class: `at ${M.corDe(s)}${p.realizada_em ? " feito" : ""}` },
    el("div", { class: "meio", style: "cursor:pointer",
      onclick: cliqueLimpo(() => abrirFichaPrev(p.id, ctx)) },
      el("div", { class: "tit" }, p.frota),
      sub.length ? el("div", { class: "sub" }, sub.join(" · ")) : null,
      el("div", { class: "tags" }, tags)),
    acoes.length ? el("div", { class: "acoes" }, acoes) : null);
}

// ── as duas respostas ───────────────────────────────────────────────────────

export async function informarDisponibilidade(p, ctx) {
  const eQuando = el("input", { type: "date", value: p.disponivel_em || M.hoje() });
  let escolha = p.disponivel_agora ? "agora" : "data";
  const bAgora = el("button", { class: escolha === "agora" ? "primario" : "" }, "Já está livre");
  const bData = el("button", { class: escolha === "data" ? "primario" : "" }, "Fica livre em…");
  const linhaData = el("div", {}, campo("A partir de", eQuando));
  const trocar = v => {
    escolha = v;
    bAgora.className = v === "agora" ? "primario" : "";
    bData.className = v === "data" ? "primario" : "";
    linhaData.style.display = v === "data" ? "" : "none";
  };
  bAgora.onclick = () => trocar("agora");
  bData.onclick = () => trocar("data");
  trocar(escolha);

  const r = await caixa({
    titulo: "Quando esta frota pode parar?",
    corpo: el("div", {},
      el("p", {}, el("b", {}, p.frota), p.plano ? ` · ${p.plano}` : "",
        p.vence ? ` · vence ${br(p.vence)}` : ""),
      el("p", { class: "nada" },
        "A manutenção só marca a parada depois desta resposta."),
      el("div", { style: "display:flex;gap:8px;margin-bottom:12px" }, bAgora, bData),
      linhaData),
    acoes: [{ rotulo: "Cancelar", valor: false },
      { rotulo: "Responder", classe: "primario", valor: true }],
  });
  if (r !== true) return false;
  const quando = escolha === "agora" ? "agora" : eQuando.value;
  if (!quando) { erro("Falta a data."); return false; }
  try {
    await ev.aplicar(ev.informarDisponibilidade(p, quando));
    avisar(`${p.frota}: ${quando === "agora" ? "livre agora" : "livre em " + br(quando)}.`);
    ctx && ctx.atualizar();
    return true;
  } catch (e) { erro(e.message); return false; }
}

export async function marcarParada(p, ctx) {
  const eDia = el("input", { type: "date", value: p.dia_parada ||
    (p.disponivel_agora ? M.hoje() : p.disponivel_em || M.hoje()) });
  const eOnde = selecao([{ v: "", t: "— onde —" }, "Interna", "Terceiro"], p.onde_fazer || "");
  const livre = p.disponivel_agora ? "agora" : (p.disponivel_em ? br(p.disponivel_em) : null);

  const r = await caixa({
    titulo: "Marcar a parada",
    corpo: el("div", {},
      el("p", {}, el("b", {}, p.frota), p.plano ? ` · ${p.plano}` : ""),
      livre
        ? el("p", { class: "nada" }, `A operação disse que fica livre ${livre}.`)
        : el("p", { style: "color:var(--hoje)" },
          "⚠ A operação ainda não informou quando esta frota fica livre. " +
          "Marcar sem isso é marcar no escuro."),
      p.pendencias > 0
        ? el("p", { class: "nada" },
          `Tem ${p.pendencias} pendência(s) na carteira desta frota — dá para ` +
          "aproveitar a parada e fazer junto.")
        : null,
      campo("Dia da parada", eDia),
      campo("Onde fazer", eOnde)),
    acoes: [{ rotulo: "Cancelar", valor: false },
      { rotulo: "Marcar", classe: "primario", valor: true }],
  });
  if (r !== true) return false;
  try {
    await ev.aplicar(ev.marcarParada(p, eDia.value, eOnde.value));
    avisar(`${p.frota} para em ${br(eDia.value)}.`);
    ctx && ctx.atualizar();
    return true;
  } catch (e) { erro(e.message); return false; }
}

async function darPorFeita(p, ctx) {
  const eData = el("input", { type: "date", value: M.hoje() });
  const eOS = el("input", { value: p.os, inputmode: "numeric", placeholder: "OS no Protheus" });
  const r = await caixa({
    titulo: "Preventiva realizada",
    corpo: el("div", {},
      el("p", {}, el("b", {}, p.frota), p.plano ? ` · ${p.plano}` : ""),
      campo("Realizada em", eData), campo("OS", eOS)),
    acoes: [{ rotulo: "Cancelar", valor: false },
      { rotulo: "Confirmar", classe: "primario", valor: true }],
  });
  if (r !== true) return;
  try {
    await ev.aplicar(ev.preventivaFeita(p, eData.value, eOS.value.replace(/\D+/g, "")));
    avisar("Preventiva fechada.");
    ctx && ctx.atualizar();
  } catch (e) { erro(e.message); }
}

async function adiar(p, ctx) {
  const e = selecao([{ v: "", t: "— escolha —" }, ...M.MOTIVOS, "Passa para o mês seguinte"], "");
  const livre = el("input", { placeholder: "ou escreva" });
  const r = await caixa({
    titulo: "Adiar a preventiva",
    corpo: el("div", {},
      el("p", {}, "Sai do mapa deste mês e fica registrado por quê."),
      campo("Motivo", e), campo("Ou escreva", livre)),
    acoes: [{ rotulo: "Voltar", valor: false },
      { rotulo: "Adiar", classe: "perigo", valor: true }],
  });
  if (r !== true) return;
  try {
    await ev.aplicar(ev.adiarPreventiva(p, livre.value.trim() || e.value));
    avisar("Adiada."); ctx && ctx.atualizar();
  } catch (x) { erro(x.message); }
}

export async function abrirFichaPrev(id, ctx) {
  const p = ev.porId(id, "preventiva");
  if (!p) return;
  const s = M.situacaoPreventiva(p);
  const linha = (r, v) => v ? el("tr", {}, el("th", {}, r), el("td", {}, v)) : null;
  const hist = ev.historicoDe(id);

  const corpo = el("div", {},
    el("table", { class: "tabela" },
      linha("Situação", el("span", {}, chip(s, M.corDe(s)))),
      linha("Esperando", M.esperandoQuem(p)),
      linha("Frota", p.frota),
      linha("Equipamento", [p.equipamento, p.local].filter(Boolean).join(" · ")),
      linha("Plano", p.plano),
      linha("Vence", p.vence ? br(p.vence) : null),
      linha("Prazo do service", p.prazo_service ? br(p.prazo_service) : null),
      linha("Livre (operação)", p.disponivel_agora ? "agora" : (p.disponivel_em ? br(p.disponivel_em) : null)),
      linha("Dia da parada (PCM)", p.dia_parada ? br(p.dia_parada) : null),
      linha("Onde fazer", p.onde_fazer),
      linha("OS", p.os),
      linha("HH previsto", p.hh ? String(p.hh) : null),
      linha("Pendências na carteira", p.pendencias ? String(p.pendencias) : null),
      linha("Realizada em", p.realizada_em ? br(p.realizada_em) : null),
      linha("Observação", p.obs)),
    el("h2", { class: "mini" }, `Registro · ${hist.length}`),
    el("div", {}, hist.map(e => el("div", { class: "evento" },
      el("div", { class: "qdo" }, e.ts.slice(8, 10) + "/" + e.ts.slice(5, 7)),
      el("div", { class: "oq" },
        el("b", {}, e.autor || "—"), " — ",
        ({ criada: "criou", importada: "veio da planilha",
          prev_disponivel: `informou disponibilidade: ${(e.dados || {}).quando === "agora" ? "agora" : br((e.dados || {}).quando)}`,
          prev_parada: `marcou a parada para ${br((e.dados || {}).dia)}`,
          prev_realizada: `deu por realizada em ${br((e.dados || {}).em)}`,
          prev_adiada: "adiou", editada: "editou" })[e.tipo] || e.tipo,
        e.motivo ? el("div", { class: "mot" }, "motivo: " + e.motivo) : null)))));

  const acoes = [];
  if (M.preventivaAberta(p)) {
    if (pessoas.pode("disponibilidade")) {
      acoes.push({ rotulo: "Disponibilidade", acao: async () => { await informarDisponibilidade(p, ctx); } });
    }
    if (pessoas.pode("parada")) {
      acoes.push({ rotulo: "Marcar parada", classe: "primario", acao: async () => { await marcarParada(p, ctx); } });
      acoes.push({ rotulo: "Foi feita", acao: async () => { await darPorFeita(p, ctx); } });
      acoes.push({ rotulo: "Adiar", classe: "perigo", acao: async () => { await adiar(p, ctx); } });
    }
  }
  await caixa({ titulo: p.frota || "Preventiva", corpo, acoes, largura: "600px" });
}

// ── a tela ──────────────────────────────────────────────────────────────────

export async function montar(raiz, ctx, params) {
  const fBusca = el("input", { class: "busca", type: "search",
    placeholder: "frota, equipamento, local…", oninput: pintar });
  const corpo = el("div", {});

  raiz.append(
    el("div", { class: "cabec" }, el("h1", {}, "Preventivas")),
    el("p", { style: "color:var(--fraco);font-size:13px;margin-bottom:10px" },
      "Uma preventiva anda quando as duas áreas respondem: a operação diz " +
      "quando o caminhão fica livre, o PCM marca o dia da parada."),
    el("div", { class: "filtros" }, fBusca),
    corpo);

  function pintar() {
    limpar(corpo);
    const hoje = M.hoje();
    const todas = ev.lista("preventiva");
    if (!todas.length) {
      corpo.append(vazio("Nenhuma preventiva. Importe o mapa do mês na aba Importar."));
      return;
    }

    const q = semAcento(fBusca.value.trim());
    const filtra = l => !q ? l : l.filter(p =>
      semAcento([p.frota, p.equipamento, p.local, p.plano].join(" ")).includes(q));

    const abertas = filtra(todas.filter(M.preventivaAberta));
    const vencidas = abertas.filter(p => p.vence && p.vence < hoje);
    const esperaOp = abertas.filter(p => M.esperandoQuem(p) === "Operação");
    const esperaPCM = abertas.filter(p => M.esperandoQuem(p) === "PCM");
    const marcadas = abertas.filter(p => p.dia_parada);
    const fechadas = filtra(todas.filter(p => p.realizada_em || p.adiada));

    corpo.append(el("div", { class: "numeros", style: "margin-bottom:16px" },
      cartaoNumero(abertas.length, "abertas no mês"),
      cartaoNumero(vencidas.length, "já vencidas", "", vencidas.length ? "alerta" : ""),
      cartaoNumero(esperaOp.length, "esperando a operação"),
      cartaoNumero(esperaPCM.length, "esperando o PCM"),
      cartaoNumero(marcadas.length, "com parada marcada", "", marcadas.length ? "bom" : "")));

    const porVencimento = (a, b) => String(a.vence || "9999").localeCompare(String(b.vence || "9999"));

    if (esperaPCM.length) {
      corpo.append(secao("Bola com o PCM — marcar a parada",
        el("div", { class: "lista" }, esperaPCM.sort(porVencimento).map(p => cartaoPrev(p, ctx, {
          acoes: pessoas.pode("parada")
            ? [el("button", { class: "primario",
              onclick: e => { e.stopPropagation(); marcarParada(p, ctx); } }, "Marcar")] : [],
        }))), esperaPCM.length));
    }
    if (esperaOp.length) {
      corpo.append(secao("Bola com a operação — informar quando fica livre",
        el("div", { class: "lista" }, esperaOp.sort(porVencimento).map(p => cartaoPrev(p, ctx, {
          acoes: pessoas.pode("disponibilidade")
            ? [el("button", { onclick: e => { e.stopPropagation(); informarDisponibilidade(p, ctx); } },
              "Informar")] : [],
        }))), esperaOp.length));
    }
    if (marcadas.length) {
      corpo.append(secao("Parada marcada",
        el("div", { class: "lista" }, marcadas
          .sort((a, b) => String(a.dia_parada).localeCompare(String(b.dia_parada)))
          .map(p => cartaoPrev(p, ctx, {
            acoes: pessoas.pode("preventiva_feita")
              ? [el("button", { onclick: e => { e.stopPropagation(); darPorFeita(p, ctx); } }, "Foi feita")] : [],
          }))), marcadas.length));
    }
    if (fechadas.length) {
      corpo.append(secao("Realizadas e adiadas",
        el("div", { class: "lista" }, fechadas.map(p => cartaoPrev(p, ctx))), fechadas.length));
    }
  }

  pintar();
  return { desmontar: ev.ouvir(pintar) };
}
