// Entrar: e-mail e senha — e, quando o banco não responde, trabalhar sem ele.
//
// Cada um entra com o próprio e-mail. A primeira versão inventava um
// (`pedro@makro.local`) e o Supabase recusa domínio de teste — foi isso que
// barrou o primeiro acesso. Para não virar atrito diário, o aparelho lembra o
// último e-mail, e quem digita o nome ainda entra se este aparelho já conhecer
// a pessoa. A senha é guardada e conferida pelo Supabase, nunca por este
// código e nunca neste repositório.
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
import { el, limpar, campo, avisar, erro, caixa, senhaComOlho } from "../ui.js";

export async function montar(raiz, ctx, params = new URLSearchParams()) {
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
  // fila, porque é a senha dele que faz a fila andar. Depois, de quem entrou
  // por último neste aparelho.
  const deQuem = (fila[0] && fila[0].autor) || guardado || "";
  // Trocando de usuário: a porta vem em branco, com os nomes da equipe para
  // tocar — no celular compartilhado, digitar o e-mail do colega é o atrito.
  const trocando = params.get("trocar") === "1";
  const sugerido = trocando ? "" : ((deQuem && await pessoas.emailPorNome(deQuem)) ||
    await pessoas.ultimoEmail() || "");

  const eNome = el("input", { placeholder: "Seu e-mail", autocomplete: "username",
    inputmode: "email", autocapitalize: "off", value: sugerido });
  const eSenha = el("input", { type: "password", placeholder: "Senha",
    autocomplete: "current-password" });
  const aviso = el("div", {});
  const botao = el("button", { type: "submit", class: "primario grande" }, "Entrar");

  const form = el("form", {
    onsubmit: async e => {
      e.preventDefault();
      limpar(aviso);
      if (!eNome.value.trim() || !eSenha.value) {
        aviso.append(el("div", { class: "erro" }, "Preencha e-mail e senha."));
        return;
      }
      const digitado = eNome.value.trim();
      const email = digitado.includes("@") ? digitado : await pessoas.emailPorNome(digitado);
      if (!email) {
        aviso.append(el("div", { class: "erro" },
          "Digite o seu e-mail — o mesmo da sua conta. Pelo nome só dá para " +
          "entrar num aparelho onde você já entrou antes."));
        return;
      }
      botao.disabled = true;
      botao.textContent = "Entrando…";
      try {
        await nuvem.entrar(email, eSenha.value);
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
    campo("E-mail", eNome),
    campo("Senha", senhaComOlho(eSenha)),
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

  // A equipe que este aparelho já conhece: um toque preenche o e-mail.
  const conhecidos = trocando ? await pessoas.conhecidos() : [];
  const atalhos = conhecidos.length ? el("div", { class: "atalhos-equipe" },
    el("span", {}, "Quem vai entrar?"),
    conhecidos.map(c => el("button", { type: "button", class: "discreto",
      onclick: () => { eNome.value = c.email; eSenha.value = ""; eSenha.focus(); } }, c.nome))) : null;

  const cartao = el("div", { class: "cartao-entrar" },
    el("div", { class: "logo" }, el("i", {}, "M"), "Programação Makro"),
    el("p", { class: "dica" }, "manutenção · Mossoró/RN"),
    aviso, atalhos, form,
    el("p", { class: "obs esqueci" },
      "Esqueceu a senha? Ninguém consegue vê-la — nem o PCM, nem o banco: ela é ",
      "guardada embaralhada. Fale com o Mateus para criar uma nova. Depois de ",
      "entrar, dá para trocar pela sua clicando no seu nome, no alto da tela."),
    alternativa);

  // A sessão caiu pelo banco (venceu, ou saíram desta conta em outro aparelho):
  // dizer isso poupa a pessoa de achar que o site quebrou.
  if (nuvem.motivoDaSaida()) aviso.append(el("div", { class: "morno" }, nuvem.motivoDaSaida()));

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
  const eEmail = el("input", { placeholder: "o e-mail da pessoa", autocomplete: "off",
    inputmode: "email", autocapitalize: "off" });
  const eNome = el("input", { placeholder: "como aparece nos lançamentos" });
  const eSenha = el("input", { type: "password", placeholder: "pelo menos 6 caracteres" });
  const sugestoes = el("div", { style: "display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px" },
    pessoas.SUGESTAO.map(p => el("button", {
      class: "discreto", type: "button",
      onclick: () => { eNome.value = p.nome; },
    }, p.nome)));

  const r = await caixa({
    titulo: "Criar acesso",
    corpo: el("div", {},
      el("p", { style: "font-size:13px;color:var(--fraco)" },
        "Para quem ainda não tem conta. Use o e-mail de verdade da pessoa — o ",
        "Supabase recusa endereço inventado."),
      el("p", { style: "font-size:13px;color:var(--fraco)" },
        "Depois de criar, o acesso só funciona quando o e-mail for cadastrado na ",
        "tabela ", el("code", {}, "pessoas"), " com o papel — é lá que se diz quem é ",
        "PCM e quem é operação, e o site não consegue escrever nela."),
      campo("E-mail", eEmail),
      sugestoes,
      campo("Nome", eNome),
      campo("Senha", senhaComOlho(eSenha))),
    acoes: [{ rotulo: "Cancelar", valor: false },
      { rotulo: "Criar", classe: "primario", valor: true }],
  });
  if (r !== true) return;
  try {
    await nuvem.criarAcesso(eEmail.value.trim(), eSenha.value, eNome.value.trim());
    avisar(`Acesso de ${eNome.value.trim() || eEmail.value.trim()} criado. ` +
      "Falta cadastrar o e-mail na tabela pessoas.");
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
        "Peça ao PCM para cadastrar esse e-mail em ", el("code", {}, "pessoas"),
        ", com o seu nome e o seu papel. Se você tem mais de um e-mail, confira ",
        "se entrou com o mesmo que foi cadastrado."),
      el("div", { style: "display:flex;gap:8px;margin-top:16px;flex-wrap:wrap" },
        el("button", { class: "primario", onclick: async () => {
          await pessoas.carregar();
          if (pessoas.papel()) { ctx.ir(pessoas.ehOperacao() ? "operacao" : "hoje"); }
          else avisar("Ainda não — o papel continua faltando.");
        } }, "Tentar de novo"),
        el("button", { onclick: () => ctx.ir("diagnostico") }, "Ver o diagnóstico"),
        el("button", { onclick: async () => { await pessoas.sair(); ctx.atualizar(); } },
          "Sair e entrar com outro e-mail")))));
  return { desmontar: () => document.body.classList.remove("entrando") };
}
