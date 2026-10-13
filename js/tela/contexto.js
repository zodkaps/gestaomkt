// O menu do botão direito.
//
// Em cima de uma atividade, movimentação ou preventiva — em qualquer tela, na
// linha da tabela ou no cartão —, abre as ações mais usadas daquele item, ali
// onde o mouse está, sem precisar mirar no "⋯". O "Mais ações…" do fim abre o
// menu completo do item. Fora de um item, abre o básico: voltar, ir para outra
// tela, atualizar, imprimir.
//
// O menu do navegador continua onde ele é útil: em campo de texto, com texto
// selecionado (para copiar) e com Shift + botão direito.

import * as ev from "../eventos.js";
import * as M from "../modelo.js";
import * as pessoas from "../pessoas.js";
import { el, avisar, erro } from "../ui.js";

let aberto = null;

export function fechar() {
  if (!aberto) return;
  aberto.remove();
  aberto = null;
  document.removeEventListener("pointerdown", foraDoMenu, true);
  document.removeEventListener("keydown", teclaDoMenu, true);
  window.removeEventListener("blur", fechar);
  window.removeEventListener("resize", fechar);
  window.removeEventListener("scroll", fechar, true);
}

const foraDoMenu = e => { if (aberto && !aberto.contains(e.target)) fechar(); };

function teclaDoMenu(e) {
  if (!aberto) return;
  const itens = [...aberto.querySelectorAll("button.cm-item:not([disabled])")];
  const i = itens.indexOf(document.activeElement);
  if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); fechar(); }
  else if (e.key === "ArrowDown") { e.preventDefault(); (itens[i + 1] || itens[0])?.focus(); }
  else if (e.key === "ArrowUp") { e.preventDefault(); (itens[i - 1] || itens[itens.length - 1])?.focus(); }
}

/** Desenha o menu em (x, y), sem sair da tela. `itens`: { rotulo, acao,
 *  perigo, dica } ou "-" para a linha divisória; os falsos são ignorados. */
export function abrirMenu(x, y, titulo, itens) {
  fechar();
  const lista = itens.filter(Boolean);
  // sem divisória sobrando no começo, no fim ou repetida
  const limpos = lista.filter((it, k) => it !== "-" ||
    (k > 0 && k < lista.length - 1 && lista[k - 1] !== "-"));
  const menu = el("div", { class: "cm", role: "menu" },
    titulo ? el("div", { class: "cm-tit" }, titulo) : null,
    limpos.map(it => it === "-" ? el("div", { class: "cm-sep" }) : el("button", {
      type: "button", role: "menuitem", class: "cm-item" + (it.perigo ? " perigo" : ""),
      title: it.dica || "",
      onclick: async () => {
        fechar();
        try { await it.acao(); } catch (e) { erro(e.message || String(e)); }
      },
    }, it.rotulo, it.atalho ? el("span", { class: "cm-atalho" }, it.atalho) : null)),
    el("div", { class: "cm-pe" }, "Shift + botão direito: menu do navegador"));
  document.body.append(menu);
  const r = menu.getBoundingClientRect();
  const left = Math.max(6, Math.min(x, innerWidth - r.width - 6));
  const top = Math.max(6, Math.min(y, innerHeight - r.height - 6));
  menu.style.left = left + "px";
  menu.style.top = top + "px";
  aberto = menu;
  document.addEventListener("pointerdown", foraDoMenu, true);
  document.addEventListener("keydown", teclaDoMenu, true);
  window.addEventListener("blur", fechar);
  window.addEventListener("resize", fechar);
  window.addEventListener("scroll", fechar, true);
  menu.querySelector("button.cm-item")?.focus({ preventScroll: true });
}

export async function copiar(texto, rotulo) {
  try {
    await navigator.clipboard.writeText(texto);
    avisar(`${rotulo} copiado.`);
  } catch (e) {
    // Sem permissão de área de transferência (http, navegador antigo): o
    // jeito antigo, por uma caixa de texto escondida.
    const t = el("textarea", { style: "position:fixed;left:-999px" }, texto);
    document.body.append(t); t.select();
    try { document.execCommand("copy"); avisar(`${rotulo} copiado.`); }
    catch (x) { erro("Não consegui copiar."); }
    t.remove();
  }
}

// ── os menus de cada item ───────────────────────────────────────────────────

async function itensAtividade(a, ctx) {
  const { abrirFicha, concluir, reprogramar, retirarDaProgramacao, justificar } = await import("./comum.js");
  const { imprimirFrota } = await import("./imprimir.js");
  const { menuDe } = await import("./acoes.js");
  const pode = p => pessoas.pode(p);
  const aberta = M.aberta(a);
  return [
    { rotulo: "Abrir a ficha", acao: () => abrirFicha(a.id, ctx) },
    (aberta || a.feita_sem_data) && pode("baixar")
      ? { rotulo: a.feita_sem_data ? "Informar a data" : "Dar baixa", acao: () => concluir(a, ctx) } : null,
    aberta && pode("programar")
      ? { rotulo: a.semana ? "Reprogramar" : "Programar", acao: () => reprogramar(a, ctx) } : null,
    aberta && a.semana && pode("programar")
      ? { rotulo: "Retirar da programação", acao: () => retirarDaProgramacao([a]) } : null,
    !a.cancelada && pode("editar_atividade")
      ? { rotulo: a.motivo ? "Alterar a justificativa" : "Justificar", acao: () => justificar(a, "atividade") } : null,
    "-",
    a.frota ? { rotulo: `Imprimir a folha da ${a.frota}`, acao: () => imprimirFrota(a.frota) } : null,
    a.frota ? { rotulo: `Abrir a frota ${a.frota}`, acao: () => ctx.ir("frota", "f=" + encodeURIComponent(a.frota)) } : null,
    "-",
    a.os ? { rotulo: `Copiar a OS ${a.os}`, acao: () => copiar(a.os, "OS") } : null,
    { rotulo: "Copiar a atividade", acao: () => copiar(`${a.frota ? a.frota + " · " : ""}${a.atividade || ""}`, "Texto") },
    "-",
    { rotulo: "Mais ações…", acao: () => menuDe("atividade", a.id, ctx) },
  ];
}

async function itensMovimentacao(m, ctx) {
  const mv = await import("./movimentacoes.js");
  const { justificar } = await import("./comum.js");
  const { menuDe } = await import("./acoes.js");
  const pode = p => pessoas.pode(p);
  const aberta = M.movimentacaoAberta(m);
  return [
    { rotulo: "Abrir a ficha", acao: () => mv.abrirFichaMov(m.id, ctx) },
    aberta && pode("movimentar") ? { rotulo: "Concluir", acao: () => mv.concluirMov(m) } : null,
    m.chegou_em && !m.aprovada && !m.cancelada && pode("aprovar")
      ? { rotulo: "Aprovar", acao: () => mv.aprovar(m) } : null,
    !m.cancelada && pode("movimentar") ? { rotulo: "Editar", acao: () => mv.editarMov(m) } : null,
    aberta && pode("movimentar")
      ? { rotulo: m.prometida_para ? "Alterar o prazo" : "Definir o prazo", acao: () => mv.prometerData(m) } : null,
    !m.cancelada && pode("movimentar") && (M.atrasoMovimentacao(m) > 0 || m.motivo_atraso)
      ? { rotulo: m.motivo_atraso ? "Alterar a justificativa" : "Justificar", acao: () => justificar(m, "movimentacao") } : null,
    "-",
    m.frota ? { rotulo: `Abrir a frota ${m.frota}`, acao: () => ctx.ir("frota", "f=" + encodeURIComponent(m.frota)) } : null,
    { rotulo: "Copiar a solicitação", acao: () => copiar(
      [m.frota, mv.tituloMov(m), m.prometida_para ? "prazo " + m.prometida_para.split("-").reverse().slice(0, 2).join("/") : ""]
        .filter(Boolean).join(" · "), "Texto") },
    "-",
    { rotulo: "Mais ações…", acao: () => menuDe("movimentacao", m.id, ctx) },
  ];
}

async function itensPreventiva(p, ctx) {
  const pv = await import("./preventivas.js");
  const { menuDe } = await import("./acoes.js");
  const pode = x => pessoas.pode(x);
  const aberta = M.preventivaAberta(p);
  return [
    { rotulo: "Abrir a ficha", acao: () => pv.abrirFichaPrev(p.id, ctx) },
    aberta && pode("disponibilidade") ? { rotulo: "Informar liberação", acao: () => pv.informarDisponibilidade(p) } : null,
    aberta && pode("parada") ? { rotulo: p.dia_parada ? "Reprogramar a parada" : "Programar a parada", acao: () => pv.marcarParada(p) } : null,
    aberta && pode("parada") ? { rotulo: "Registrar realização", acao: () => pv.darPorFeita(p) } : null,
    !p.excluida && pode("parada") ? { rotulo: "Editar", acao: () => pv.editarPreventiva(p) } : null,
    "-",
    p.frota ? { rotulo: `Abrir a frota ${p.frota}`, acao: () => ctx.ir("frota", "f=" + encodeURIComponent(p.frota)) } : null,
    p.os ? { rotulo: `Copiar a OS ${p.os}`, acao: () => copiar(p.os, "OS") } : null,
    "-",
    { rotulo: "Mais ações…", acao: () => menuDe("preventiva", p.id, ctx) },
  ];
}

/** O menu de fora de um item: o básico da navegação. */
function itensDaTela(ctx, nav) {
  return [
    nav.podeVoltar() ? { rotulo: `Voltar${nav.rotuloVoltar() ? " para " + nav.rotuloVoltar() : ""}`, atalho: "Alt+←", acao: () => nav.voltar() } : null,
    { rotulo: "Atualizar", dica: "Buscar agora o que os outros lançaram", acao: () => nav.atualizar() },
    { rotulo: "Imprimir esta página", atalho: "Ctrl+P", acao: () => window.print() },
    "-",
    ...nav.telas().map(t => ({ rotulo: `Ir para ${t.nome}`, acao: () => ctx.ir(t.id) })),
  ];
}

/** Liga o botão direito na página. `nav` vem da casca (app.js). */
export function ligar(ctx, nav) {
  document.addEventListener("contextmenu", e => {
    if (e.shiftKey) return;                                   // o do navegador
    const t = e.target;
    if (!(t instanceof Element)) return;
    if (t.closest("input, textarea, select, [contenteditable], .caixa, .fundo, .cm")) return;
    if (String(getSelection() || "").trim()) return;          // para copiar o que marcou
    if (!pessoas.quem()) return;                              // na porta, nada
    const no = t.closest("[data-id]");
    const achado = no && ev.achar(no.dataset.id);
    e.preventDefault();
    const { clientX: x, clientY: y } = e;
    (async () => {
      if (achado && achado.tipo === "atividade") {
        const a = achado.item;
        abrirMenu(x, y, `${a.frota ? a.frota + " · " : ""}${a.atividade || "Atividade"}`, await itensAtividade(a, ctx));
      } else if (achado && achado.tipo === "movimentacao") {
        const m = achado.item;
        const { tituloMov } = await import("./movimentacoes.js");
        abrirMenu(x, y, `${m.frota} · ${tituloMov(m)}`, await itensMovimentacao(m, ctx));
      } else if (achado && achado.tipo === "preventiva") {
        const p = achado.item;
        abrirMenu(x, y, `${p.frota} · ${p.plano || "preventiva"}`, await itensPreventiva(p, ctx));
      } else {
        abrirMenu(x, y, "", itensDaTela(ctx, nav));
      }
    })().catch(err => erro(err.message || String(err)));
  });
}
