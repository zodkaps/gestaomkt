// Entrar: nome e senha — e, quando o banco não responde, trabalhar sem ele.
//
// Ninguém precisa ter e-mail — "Pedro" vira `pedro@makro.local` por baixo, e
// isso não aparece em tela nenhuma. A senha é guardada e conferida pelo
// Supabase, nunca por este código e nunca neste repositório.
//
// **Por que existe entrada sem senha.** Este site nasceu local-first: ele
// funciona inteiro com os dados do próprio navegador, e a nuvem é o que o torna
// compartilhado, não o que o torna utilizável. Mesmo assim, por um erro de
// desenho meu, bastava o projeto não responder — provedor de e-mail desligado,
// por exemplo — para não haver entrada nenhuma. Agora há: quem não consegue
// autenticar escolhe o próprio nome e segue trabalhando neste aparelho.
//
// E isso não abre buraco: sem sessão não há como escrever no banco. O que for
// lançado fica na fila de saída até alguém entrar com senha de verdade — e aí
// o Postgres confere `autor = nome_atual()` como sempre. Por isso a fila só
// sobe o que é do autor que entrou, e a tela diz de quem é o que está parado.

import * as nuvem from "../nuvem.js";
import * as pessoas from "../pessoas.js";
import * as ev from "../eventos.js";
import { el, limpar, campo, selecao, avisar, erro, caixa } from "../ui.js";

export async function montar(raiz, ctx) {
  // Esta tela não usa a casca: ela é a porta.
  document.body.classList.add("entrando");

  // Caso especial: a senha funcionou, mas o e-mail não está na tabela
  // `pessoas`. Sem papel, nenhuma tela do site faz sentido — e deixar passar
  // daria um menu vazio sem explicação. Melhor dizer o que houve e o que
  // resolve.
  const p = pessoas.quem();
  if (p && p.semPapel) return semPapel(raiz, ctx, p);

  const fila = await ev.autoresNaFila();
  const guardado = await pessoas.nomeLocalGuardado();
  // De quem o site pede a senha primeiro: de quem tem lançamento parado na
  // fila, porque é a senha dele que faz a fila andar.
  const sugerido = (fila[0] && fila[0].autor) || guardado || "";

  const eNome = el("input", { placeholder: "Seu nome", autocomplete: "username",
    value: sugerido });
  const eSenha = el("input", { type: "password", placeholder: "Senha",
    autocomplete: "current-password" });
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
        // Falhou por qualquer motivo: a saída local passa a aparecer. Pode ser
        // senha errada — e aí ele tenta de novo —, mas pode ser o projeto fora
        // do ar, e nesse caso ficar olhando o formulário não resolve nada.
        mostrarAlternativa();
        botao.disabled = false;
        botao.textContent = "Entrar";
      }
    },
  },
    campo("Nome", eNome),
    campo("Senha", eSenha),
    botao);

  // A saída de emergência, escondida até fazer falta: enquanto a nuvem
  // responde, oferecê-la só convidaria a trabalhar separado sem precisar.
  const alternativa = el("div", { class: "alternativa", hidden: true });
  let alternativaPronta = false;

  function mostrarAlternativa(motivo = "") {
    if (!alternativaPronta) {
      alternativaPronta = true;
      alternativa.append(
        el("div", { class: "risca" }, el("span", {}, "ou")),
        el("p", { class: "obs" }, motivo ||
          "Se o banco não responde, o site funciona neste aparelho do mesmo " +
          "jeito. O que você lançar fica guardado aqui e sobe sozinho quando " +
          "você entrar com senha."),
        el("button", { class: "grande", style: "width:100%;justify-content:center",
          onclick: () => entrarLocal(ctx) }, "Trabalhar neste aparelho"));
    }
    alternativa.hidden = false;
  }

  const cartao = el("div", { class: "cartao-entrar" },
    el("div", { class: "logo" }, el("i", {}, "M"), "Programação Makro"),
    el("p", { class: "dica" }, "manutenção · Mossoró/RN"),
    aviso, form, alternativa);

  if (fila.length) {
    const quem = fila.map(f => `${f.quantos} de ${f.autor}`).join(", ");
    aviso.append(el("div", { class: "morno" },
      `Tem lançamento feito neste aparelho que ainda não subiu (${quem}). ` +
      "Cada um sobe quando quem o assinou entrar com senha aqui."));
  }

  if (!nuvem.ligada()) {
    aviso.append(el("div", { class: "erro" },
      "Este site ainda não está ligado a um banco. Dá para trabalhar neste " +
      "aparelho; para a equipe ver o que você lança, falta ligar o banco."));
    form.querySelectorAll("input, button").forEach(n => { n.disabled = true; });
    mostrarAlternativa("Sem banco configurado, esta é a única entrada.");
  }

  // A criação dos acessos é um caminho à parte, para não virar porta aberta na
  // tela de entrada. Só serve na primeira vez, e o banco ainda confere tudo.
  cartao.append(el("div", { class: "pe-entrar" },
    el("button", { class: "discreto", onclick: () => criarAcesso() },
      "Primeiro acesso da equipe"),
    el("button", { class: "discreto", onclick: () => ctx.ir("diagnostico") },
      "O que falta no banco")));

  raiz.append(el("div", { id: "entrar-tela" }, cartao));
  setTimeout(() => (sugerido ? eSenha : eNome).focus(), 60);

  // Pergunta ao projeto, em segundo plano, se ele consegue autenticar — uma
  // chamada, sem bloquear a tela. Descobrir que o provedor está desligado DEPOIS
  // de digitar a senha é o que mais custou tempo da equipe.
  if (nuvem.ligada()) sondar(mostrarAlternativa);

  return { desmontar: () => document.body.classList.remove("entrando") };
}

/** Uma chamada só, e nunca derruba a tela: na dúvida, o formulário fica. */
async function sondar(mostrarAlternativa) {
  try {
    const o = await nuvem.opcoes();
    const provedor = !o.external || o.external.email !== false;
    if (!provedor) {
      mostrarAlternativa("O login por e-mail está desligado neste projeto, " +
        "então a senha não vai funcionar até alguém ligar o provedor Email " +
        "em Authentication → Sign In / Providers. Até lá, trabalhe neste aparelho.");
    }
  } catch (e) {
    mostrarAlternativa("O banco não respondeu agora. Trabalhe neste aparelho: " +
      "o que você lançar sobe sozinho quando ele voltar e você entrar com senha.");
  }
}

/** Escolher quem é, entre os quatro, e seguir sem sessão. */
async function entrarLocal(ctx) {
  let escolhido = "";
  const botoes = pessoas.SUGESTAO.map(s => el("button", {
    class: "escolha-pessoa", type: "button",
    onclick: () => { escolhido = s.nome; },
  },
    el("b", {}, s.nome),
    el("small", {}, (pessoas.PAPEIS[s.papel] || {}).rotulo || s.papel)));

  const r = await caixa({
    titulo: "Quem está usando este aparelho?",
    corpo: ({ fechar }) => {
      botoes.forEach(b => b.addEventListener("click", () => fechar(true)));
      return el("div", {},
        el("p", { style: "font-size:13px;color:var(--fraco)" },
          "O nome importa: é ele que assina o que você lançar, e o banco só " +
          "aceita o lançamento quando quem entrar com senha for a mesma pessoa."),
        el("div", { class: "escolha-pessoas" }, botoes));
    },
    acoes: [{ rotulo: "Cancelar", valor: false }],
  });
  if (r !== true || !escolhido) return;
  try {
    await pessoas.entrarLocal(escolhido);
    await ev.carregar();
    avisar(`Trabalhando neste aparelho como ${escolhido.split(" ")[0]}.`);
    ctx.ir(pessoas.ehOperacao() ? "operacao" : "hoje");
  } catch (e) { erro(e.message); }
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

/** Entrou, mas não está na tabela `pessoas`. */
function semPapel(raiz, ctx, p) {
  raiz.append(el("div", { id: "entrar-tela" },
    el("div", { class: "cartao-entrar" },
      el("div", { class: "logo" }, el("i", {}, "M"), "Quase lá"),
      el("div", { class: "erro" },
        "Sua senha funcionou, mas este acesso ainda não tem papel."),
      el("p", { style: "font-size:13px;color:var(--fraco)" },
        "O site entrou como ", el("b", {}, p.email),
        ", e esse endereço não está na tabela ", el("code", {}, "pessoas"),
        " do banco — é ela que diz quem é PCM e quem é operação."),
      el("p", { style: "font-size:13px;color:var(--fraco)" },
        "Duas causas, nesta ordem: ou falta rodar ",
        el("code", {}, "sql/02_acesso.sql"), " no SQL Editor do Supabase, ",
        "ou o nome foi digitado diferente do que está cadastrado lá."),
      el("div", { style: "display:flex;gap:8px;margin-top:16px;flex-wrap:wrap" },
        el("button", { class: "primario", onclick: async () => {
          await pessoas.carregar();
          if (pessoas.papel()) { ctx.ir(pessoas.ehOperacao() ? "operacao" : "hoje"); }
          else avisar("Ainda não — o papel continua faltando.");
        } }, "Tentar de novo"),
        el("button", { onclick: () => ctx.ir("diagnostico") }, "Ver o diagnóstico"),
        el("button", { onclick: async () => { await pessoas.sair(); ctx.atualizar(); } },
          "Sair e entrar com outro nome")))));
  return { desmontar: () => document.body.classList.remove("entrando") };
}
