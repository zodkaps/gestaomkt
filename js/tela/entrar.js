// Entrar: nome e senha.
//
// Ninguém precisa ter e-mail — "Pedro" vira `pedro@makro.local` por baixo, e
// isso não aparece em tela nenhuma. A senha é guardada e conferida pelo
// Supabase, nunca por este código e nunca neste repositório.

import * as nuvem from "../nuvem.js";
import * as pessoas from "../pessoas.js";
import * as ev from "../eventos.js";
import { el, limpar, campo, selecao, avisar, erro, caixa } from "../ui.js";

export async function montar(raiz, ctx) {
  // Esta tela não usa a casca: ela é a porta.
  document.body.classList.add("entrando");

  const eNome = el("input", { placeholder: "Seu nome", autocomplete: "username" });
  const eSenha = el("input", { type: "password", placeholder: "Senha", autocomplete: "current-password" });
  const aviso = el("div", {});
  const botao = el("button", { type: "submit", class: "primario grande" }, "Entrar");

  const form = el("form", {
    onsubmit: async e => {
      e.preventDefault();
      limpar(aviso);
      if (!eNome.value.trim() || !eSenha.value) {
        aviso.append(el("div", { class: "erro" }, "Preencha nome e senha."));
        return;
      }
      botao.disabled = true;
      botao.textContent = "Entrando…";
      try {
        await nuvem.entrar(eNome.value.trim(), eSenha.value);
        await pessoas.carregar();
        await ev.carregar();
        avisar(`Olá, ${pessoas.nome().split(" ")[0]}.`);
        ctx.ir(pessoas.ehOperacao() ? "operacao" : "hoje");
      } catch (x) {
        aviso.append(el("div", { class: "erro" }, x.message));
        botao.disabled = false;
        botao.textContent = "Entrar";
      }
    },
  },
    campo("Nome", eNome),
    campo("Senha", eSenha),
    botao);

  const cartao = el("div", { class: "cartao-entrar" },
    el("div", { class: "logo" }, el("i", {}, "M"), "Programação Makro"),
    el("p", { class: "dica" }, "manutenção · Mossoró/RN"),
    aviso, form);

  if (!nuvem.ligada()) {
    limpar(aviso).append(el("div", { class: "erro" },
      "O site ainda não está ligado ao banco. Enquanto isso não acontecer, " +
      "não há como entrar com senha."));
    form.querySelectorAll("input, button").forEach(n => { n.disabled = true; });
  }

  // A criação dos acessos é um caminho à parte, para não virar porta aberta na
  // tela de entrada. Só serve na primeira vez, e o banco ainda confere tudo.
  cartao.append(el("button", {
    class: "discreto", style: "width:100%;justify-content:center;margin-top:14px;font-size:12px",
    onclick: () => criarAcesso(),
  }, "Primeiro acesso da equipe"));

  raiz.append(el("div", { id: "entrar-tela" }, cartao));
  setTimeout(() => eNome.focus(), 60);

  return { desmontar: () => document.body.classList.remove("entrando") };
}

async function criarAcesso() {
  const eNome = el("input", { placeholder: "Nome, como vai ser digitado" });
  const eSenha = el("input", { type: "password", placeholder: "pelo menos 6 caracteres" });
  const ePapel = selecao([{ v: "pcm", t: "PCM / manutenção" },
    { v: "operacao", t: "Operação" }], "pcm");
  const sugestoes = el("div", { style: "display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px" },
    pessoas.SUGESTAO.map(p => el("button", {
      class: "discreto", type: "button",
      onclick: () => { eNome.value = p.nome; ePapel.value = p.papel; },
    }, p.nome)));

  const r = await caixa({
    titulo: "Criar acesso",
    corpo: el("div", {},
      el("p", { style: "font-size:13px;color:var(--fraco)" },
        "Use uma vez por pessoa. O papel que vale é o da tabela ", el("code", {}, "pessoas"),
        " no banco — este aqui só fica guardado junto do acesso."),
      sugestoes,
      campo("Nome", eNome),
      campo("Senha", eSenha),
      campo("Papel", ePapel)),
    acoes: [{ rotulo: "Cancelar", valor: false },
      { rotulo: "Criar", classe: "primario", valor: true }],
  });
  if (r !== true) return;
  try {
    await nuvem.criarAcesso(eNome.value.trim(), eSenha.value, ePapel.value);
    avisar(`Acesso de ${eNome.value.trim()} criado. Agora é só entrar.`);
  } catch (e) { erro(e.message); }
}
