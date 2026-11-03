// "Buscar frota" — tudo o que a frota tem em aberto, numa caixa, com o botão
// de cada coisa. Substituiu o "+ Registrar" (03/11/2026).
//
// O "+ Registrar" perguntava "o que aconteceu?" e repetia, num lugar só, os
// botões que cada aba já tem; o PCM pediu para reformular. O que ele tinha de
// próprio era começar pela frota — é assim que a operação pensa ("o que tem
// da 433?"). Aqui ficou só isso: digita a frota e aparece a preventiva com o
// próximo passo (e o "Já realizada"), as movimentações em aberto com o
// Concluir, o Justificar e o Aprovar, e embaixo Pedir movimentação e Pôr no
// plano. Cada botão abre a MESMA caixa da aba — regras no mesmo lugar.
//
// Uma caixa de cada vez: o botão fecha a busca, a caixa dele abre, e ao
// terminar a busca volta na mesma frota, com o que mudou — dá para lançar a
// próxima coisa sem digitar de novo.

import * as ev from "../eventos.js";
import * as M from "../modelo.js";
import * as pessoas from "../pessoas.js";
import { el, caixa, comSugestoes, brCurto } from "../ui.js";
import { filtroDeFrota } from "../texto.js";
import { icone } from "../icones.js";
import { mesDaData } from "../decisoes.js";
import { justificar } from "./comum.js";
import { rotuloMes, textoPasso, trilhaPassos, proximoPasso, podeJaFeita, darPorFeita,
  registrarEntregaPrev, abrirFichaPrev, incluirPreventiva } from "./preventivas.js";
import { tituloMov, concluirMov, aprovar, novaMovimentacao, abrirFichaMov } from "./movimentacoes.js";

const natural = (a, b) => String(a).localeCompare(String(b), "pt-BR", { numeric: true });
const movs = () => ev.lista("movimentacao").filter(m => !m.excluida && !m.cancelada);
const prevs = () => ev.lista("preventiva").filter(p => !p.excluida && !p.fora);

function frotasConhecidas() {
  return [...new Set([...movs(), ...prevs()].map(x => x.frota).filter(Boolean))].sort(natural);
}

/** O que da frota aparece: a preventiva em aberto (de qualquer mês), a deste
 *  mês já realizada (para fechar a OS) e a que chegou atrasada sem o porquê;
 *  as movimentações em aberto e as que esperam o PCM aprovar. */
function daFrota(f, ref) {
  const mes = mesDaData(ref);
  const atrasoSemPorque = p => p.entregue_em && !p.motivo_entrega && M.atrasoEntrega(p) > 0;
  const pv = prevs().filter(p => f.bate(p.frota) &&
    (M.preventivaAberta(p) || (p.mes === mes && M.preventivaFeita(p)) || atrasoSemPorque(p)))
    .sort((a, b) => natural(a.frota, b.frota) || String(a.mes).localeCompare(String(b.mes)));
  const mv = movs().filter(m => f.bate(m.frota) &&
    (M.movimentacaoAberta(m) || M.movimentacaoParaAprovar(m) || M.movimentacaoSemJustificativa(m, ref)))
    .sort((a, b) => natural(a.frota, b.frota) || String(a.prometida_para || "9").localeCompare(String(b.prometida_para || "9")));
  return { pv, mv, atrasoSemPorque };
}

/** As frotas com alguma coisa em aberto — para tocar, quando nada foi digitado. */
function frotasComAberto(ref) {
  const n = new Map();
  const soma = f => n.set(f, (n.get(f) || 0) + 1);
  for (const p of prevs()) if (p.frota && M.preventivaAberta(p) && p.mes === mesDaData(ref)) soma(p.frota);
  for (const m of movs()) if (m.frota && M.movimentacaoAberta(m)) soma(m.frota);
  return [...n.entries()].sort((a, b) => natural(a[0], b[0]));
}

/** Abre a busca. `frota`: já vem digitada. */
export async function abrirBuscaFrota(ctx, { frota = "" } = {}) {
  let texto = frota;
  for (;;) {
    const r = await caixaDaBusca(texto);
    if (!r) return;
    texto = r.frota;
    try { await r.acao(ctx); } catch (e) { /* a caixa da ação já avisou */ }
    if (r.fim) return;                       // abriu a ficha ou foi para outra tela
  }
}

function caixaDaBusca(inicial) {
  const ref = M.hoje();
  const conhecidas = frotasConhecidas();
  const eFrota = el("input", { type: "search", value: inicial, placeholder: "digite a frota — ex.: 433",
    autocomplete: "off", spellcheck: false, "aria-label": "Frota" });
  const res = el("div", { class: "bf-res", "aria-live": "polite" });
  let desligar = () => {};
  const p = caixa({
    titulo: "Buscar frota", largura: "620px",
    corpo: ({ fechar }) => {
      // o botão de dentro fecha a busca e diz o que fazer; a busca volta depois
      const ir = (acao, fim = false) => fechar({ acao, fim, frota: eFrota.value.trim() });
      const botao = (rot, acao, { classe = "", title = "", fim = false, ic = "" } = {}) =>
        el("button", { type: "button", class: "mini " + classe, title, onclick: () => ir(acao, fim) }, ic ? icone(ic, 14) : null, rot);
      const pintar = () => {
        const f = filtroDeFrota(eFrota.value, conhecidas);
        res.replaceChildren(...conteudo(f, ref, botao, ir, eFrota, pintar, conhecidas));
      };
      eFrota.addEventListener("input", pintar);
      desligar = ev.ouvir(pintar);           // lançou em outro aparelho: aparece aqui
      pintar();
      return el("div", { class: "buscar-frota" }, comSugestoes(eFrota, conhecidas, "dl-buscar"), res);
    },
  });
  return p.finally(() => desligar());
}

function conteudo(f, ref, botao, ir, eFrota, repintar, conhecidas) {
  // nada digitado: as frotas com alguma coisa em aberto, para tocar
  if (f.vazio) {
    const com = frotasComAberto(ref);
    return [el("p", { class: "nada bf-dica" }, "Digite a frota para ver o que ela tem em aberto e lançar dali. " +
      "Atalho: Ctrl+K em qualquer tela."),
      com.length ? el("div", { class: "bf-sec" }, el("h3", {}, "Com alguma coisa em aberto"),
        el("div", { class: "bf-chips" }, com.map(([fr, n]) => el("button", { type: "button", class: "chip-op",
          onclick: () => { eFrota.value = fr; repintar(); eFrota.focus(); } }, fr, el("small", {}, ` ${n}`))))) : null];
  }
  // digitado em parte: as frotas que batem, para escolher; uma só, já é ela
  // (sem mexer no que está sendo digitado)
  if (!f.exata) {
    const batem = conhecidas.filter(x => f.bate(x));
    if (batem.length === 1) f = filtroDeFrota(batem[0], conhecidas);
    else if (batem.length > 1) return [el("div", { class: "bf-sec" }, el("h3", {}, `${batem.length} frotas com "${eFrota.value.trim()}"`),
      el("div", { class: "bf-chips" }, batem.slice(0, 40).map(fr => el("button", { type: "button", class: "chip-op",
        onclick: () => { eFrota.value = fr; repintar(); eFrota.focus(); } }, fr))))];
  }
  const frota = f.exata || eFrota.value.trim();
  const { pv, mv, atrasoSemPorque } = daFrota(f, ref);
  const pode = x => pessoas.pode(x);
  const partes = [];

  const abertos = pv.filter(M.preventivaAberta).length + mv.filter(M.movimentacaoAberta).length;
  partes.push(el("div", { class: "bf-cab" }, el("b", {}, frota),
    el("span", { class: "seg" }, !f.exata ? "frota nova" : abertos ? `${abertos} em aberto` : pv.length || mv.length ? "nada em aberto · falta conferir" : "nada em aberto")));

  if (pv.length) partes.push(el("div", { class: "bf-sec" }, el("h3", {}, "Preventiva"), ...pv.map(p => {
    const t = textoPasso(p, ref);
    const x = proximoPasso(p, ref);
    return el("div", { class: "bf-item" + (t.alerta ? " alerta" : "") },
      trilhaPassos(p, ref),
      el("div", { class: "bf-txt" }, el("b", {}, `Preventiva ${p.plano || ""}`.trim()),
        el("small", {}, [rotuloMes(p.mes), t.texto].filter(Boolean).join(" · "))),
      el("div", { class: "bf-acoes" },
        x ? botao(x.rotulo, () => x.fn(), { classe: "primario-leve", title: x.title }) : null,
        podeJaFeita(p) ? botao("Já realizada", () => darPorFeita(p), { classe: "ja-feita", ic: "visto",
          title: "Adiantar: a preventiva já foi feita — dá a baixa direto, sem os passos que faltam" }) : null,
        atrasoSemPorque(p) && pode("parada") ? botao("Justificar a chegada", () => registrarEntregaPrev(p, { soJustificar: true })) : null,
        botao("Abrir", ctx => abrirFichaPrev(p.id, ctx), { fim: true, title: "A ficha da preventiva, com o registro" })));
  })));

  if (mv.length) partes.push(el("div", { class: "bf-sec" }, el("h3", {}, mv.length === 1 ? "Movimentação" : `Movimentações · ${mv.length}`), ...mv.map(m => {
    const atraso = M.atrasoMovimentacao(m, ref);
    const aberta = M.movimentacaoAberta(m);
    const info = [aberta ? (m.prometida_para ? `prazo ${brCurto(m.prometida_para)}` : "sem prazo") : "feita, esperando o PCM aprovar",
      atraso ? `${atraso} d de atraso` : ""].filter(Boolean).join(" · ");
    return el("div", { class: "bf-item" + (aberta && atraso ? " alerta" : "") },
      el("span", { class: "bf-ic", "aria-hidden": "true" }, icone("trocar", 18)),
      el("div", { class: "bf-txt" }, el("b", {}, tituloMov(m)), el("small", {}, info)),
      el("div", { class: "bf-acoes" },
        aberta && pode("movimentar") ? botao("Concluir", () => concluirMov(m), { classe: "primario-leve" }) : null,
        !aberta && M.movimentacaoParaAprovar(m) && pode("aprovar") ? botao("Aprovar", () => aprovar(m), { classe: "primario-leve" }) : null,
        M.movimentacaoSemJustificativa(m, ref) && pode("movimentar") ? botao("Justificar", () => justificar(m, "movimentacao")) : null,
        botao("Abrir", ctx => abrirFichaMov(m.id, ctx), { fim: true })));
  })));

  if (!pv.length && !mv.length) partes.push(el("p", { class: "nada" }, f.exata
    ? `${frota} não tem nada em aberto: nenhuma preventiva a fazer e nenhuma movimentação pendente.`
    : `Nenhum lançamento com ${frota} ainda.`));

  // o que dá para começar por aqui, com a frota já digitada
  const criar = [
    pode("movimentar") ? botao("Pedir movimentação", ctx => novaMovimentacao(ctx, { frota }), { ic: "adicionar" }) : null,
    pode("parada") ? botao("Pôr no plano de preventivas", () => incluirPreventiva(mesDaData(ref), { frota }), { ic: "adicionar" }) : null,
  ].filter(Boolean);
  if (criar.length) partes.push(el("div", { class: "bf-criar" }, criar));
  return partes;
}
