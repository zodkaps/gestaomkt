// "+ Registrar" — lançar em dois toques, de qualquer tela.
//
// O PCM pediu (21/10/2026) que registrar fosse simples: um botão só, no alto,
// a frota digitada — qualquer uma — e "o que aconteceu?". Cada resposta abre a
// MESMA caixa que a tela da movimentação ou da preventiva abre: o motivo, a
// permissão e a data são conferidos no mesmo lugar, porque o código é o mesmo.
// Quando a frota tem uma coisa só daquele tipo em aberto, ela abre direto;
// com várias, a pessoa toca na certa.

import * as ev from "../eventos.js";
import * as M from "../modelo.js";
import * as pessoas from "../pessoas.js";
import { el, caixa, campo, comSugestoes, brCurto } from "../ui.js";
import { filtroDeFrota } from "../texto.js";
import { icone } from "../icones.js";

const movs = () => ev.lista("movimentacao").filter(m => !m.excluida);
const prevs = () => ev.lista("preventiva").filter(p => !p.excluida && !p.fora);
const titulo = m => [m.acao, m.destino].filter(Boolean).join(" · ") || m.para_que || "movimentação";

function frotasConhecidas() {
  return [...new Set([...movs(), ...prevs()].map(x => x.frota).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));
}

/** O que cada resposta oferece: quem pode, e o que está em aberto para ela. */
function opcoes(ref) {
  const semPorque = m => M.movimentacaoSemJustificativa(m, ref);
  return [
    { id: "mov-nova", icone: "trocar", rotulo: "Pedir uma movimentação", sub: "levar, buscar, TOP, lavagem…",
      pode: pessoas.pode("movimentar"), itens: null },
    { id: "mov-feita", icone: "visto", rotulo: "Uma movimentação foi feita", sub: "concluir a que estava em aberto",
      pode: pessoas.pode("movimentar"), itens: () => movs().filter(M.movimentacaoAberta),
      linha: m => [m.frota, titulo(m), m.prometida_para ? `prazo ${brCurto(m.prometida_para)}` : "sem prazo"] },
    { id: "chegou", icone: "caminhao", rotulo: "A frota chegou na oficina", sub: "para a preventiva",
      pode: pessoas.pode("parada"), itens: () => prevs().filter(p => M.preventivaAberta(p) && !p.entregue_em),
      linha: p => [p.frota, `Preventiva ${p.plano || ""}`.trim(), p.dia_parada ? `parada ${brCurto(p.dia_parada)}` : "sem parada"] },
    { id: "liberacao", icone: "bandeira", rotulo: "Liberação para a preventiva", sub: "disponível agora, ou a partir de um dia",
      pode: pessoas.pode("disponibilidade"), itens: () => prevs().filter(M.preventivaAberta),
      linha: p => [p.frota, `Preventiva ${p.plano || ""}`.trim(),
        p.disponivel_agora ? "liberada agora" : p.disponivel_em ? `liberada ${brCurto(p.disponivel_em)}` : "sem liberação"] },
    { id: "justificar", icone: "pergunta", rotulo: "Justificar um atraso", sub: "dizer por que atrasou e quem atrasou",
      pode: pessoas.pode("movimentar"),
      itens: () => [...movs().filter(semPorque).map(m => ({ ...m, _tipo: "movimentacao" })),
        ...(pessoas.pode("parada") ? prevs().filter(p => p.entregue_em && !p.motivo_entrega && M.atrasoEntrega(p) > 0)
          .map(p => ({ ...p, _tipo: "preventiva" })) : [])],
      linha: x => x._tipo === "movimentacao"
        ? [x.frota, titulo(x), `${M.atrasoMovimentacao(x, ref)} d de atraso`]
        : [x.frota, `Chegada para a preventiva ${x.plano || ""}`.trim(), `${M.atrasoEntrega(x)} d de atraso`] },
    { id: "incluir", icone: "adicionar", rotulo: "Pôr a frota no plano de preventivas", sub: "de qualquer mês",
      pode: pessoas.pode("parada"), itens: null },
  ].filter(o => o.pode);
}

/** A caixa do "+ Registrar". `frota`: já vem digitada (a tela da frota). */
export async function abrirRegistrar(ctx, { frota = "" } = {}) {
  const ref = M.hoje();
  const ops = opcoes(ref);
  const conhecidas = frotasConhecidas();
  const eFrota = el("input", { type: "search", value: frota, placeholder: "digite a frota — qualquer uma",
    autocomplete: "off", spellcheck: false, "aria-label": "Frota" });
  const lista = el("div", { class: "reg-opcoes", role: "list" });
  const escolha = await caixa({
    titulo: "Registrar", largura: "520px",
    corpo: ({ fechar }) => {
      const pintar = () => {
        const f = filtroDeFrota(eFrota.value, conhecidas);
        lista.replaceChildren(...ops.map(o => {
          const itens = o.itens ? o.itens().filter(x => f.bate(x.frota)) : null;
          const n = itens ? itens.length : null;
          const desligada = n === 0;
          return el("button", { type: "button", class: "reg-op" + (desligada ? " vazia" : ""), role: "listitem",
            disabled: desligada, dataset: { op: o.id },
            onclick: () => fechar({ op: o, itens, frota: f.exata || eFrota.value.trim() }) },
            el("span", { class: "reg-ic", "aria-hidden": "true" }, icone(o.icone, 20)),
            el("span", { class: "reg-txt" }, el("b", {}, o.rotulo), el("small", {}, o.sub)),
            n == null ? null : el("span", { class: "reg-n" }, desligada
              ? (f.vazio ? "nada em aberto" : "nada desta frota")
              : `${n} em aberto`));
        }));
      };
      eFrota.addEventListener("input", pintar);
      pintar();
      return el("div", { class: "registrar" },
        campo("Frota", comSugestoes(eFrota, conhecidas, "dl-registrar"), "deixe em branco para ver de todas"),
        el("div", { class: "reg-pergunta" }, "O que aconteceu?"),
        lista);
    },
  });
  if (!escolha) return false;
  return executar(escolha, ctx);
}

async function executar({ op, itens, frota }, ctx) {
  if (op.id === "mov-nova") {
    const { novaMovimentacao } = await import("./movimentacoes.js");
    return !!(await novaMovimentacao(ctx, { frota }));
  }
  if (op.id === "incluir") {
    const { incluirPreventiva } = await import("./preventivas.js");
    const { mesDaData } = await import("../decisoes.js");
    return !!(await incluirPreventiva(mesDaData(M.hoje()), { frota }));
  }
  const x = itens.length === 1 ? itens[0] : await escolherItem(op, itens);
  if (!x) return false;
  if (op.id === "mov-feita") {
    const { concluirMov } = await import("./movimentacoes.js");
    return concluirMov(ev.porId(x.id, "movimentacao"));
  }
  const pv = await import("./preventivas.js");
  if (op.id === "chegou") return pv.registrarEntregaPrev(ev.porId(x.id, "preventiva"));
  if (op.id === "liberacao") return pv.informarDisponibilidade(ev.porId(x.id, "preventiva"));
  if (op.id === "justificar") {
    if (x._tipo === "preventiva") return pv.registrarEntregaPrev(ev.porId(x.id, "preventiva"), { soJustificar: true });
    const { justificar } = await import("./comum.js");
    return justificar(ev.porId(x.id, "movimentacao"), "movimentacao");
  }
  return false;
}

/** Várias em aberto: a lista, a mais urgente primeiro, e um toque escolhe. */
function escolherItem(op, itens) {
  const ordem = x => x.prometida_para || x.dia_parada || x.vence || "9999";
  const ordenados = itens.slice().sort((a, b) => String(ordem(a)).localeCompare(String(ordem(b))) ||
    String(a.frota).localeCompare(String(b.frota), "pt-BR", { numeric: true }));
  return caixa({
    titulo: op.rotulo, largura: "560px",
    corpo: ({ fechar }) => el("div", { class: "reg-itens" },
      el("p", { class: "nada", style: "margin-top:0" }, `${itens.length} em aberto. Toque na certa.`),
      ...ordenados.map(x => {
        const [fr, oque, info] = op.linha(x);
        return el("button", { type: "button", class: "reg-item", onclick: () => fechar(x) },
          el("b", {}, fr), el("span", { class: "reg-oque" }, oque), el("span", { class: "reg-info" }, info));
      })),
  });
}
