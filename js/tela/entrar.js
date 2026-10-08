// Quem é você.
//
// Sem senha, sem e-mail: a lista tem quatro nomes e o aparelho lembra a
// escolha. No pátio, no celular, qualquer atrito a mais é um apontamento que
// não acontece — e é por isso que esta tela é um toque só.
//
// O que ela NÃO é: uma parede. Quem trocar o nome aqui lança como outro. Está
// escrito na própria tela, para ninguém achar que tem proteção que não tem.

import * as pessoas from "../pessoas.js";
import { el, limpar, avisar } from "../ui.js";

export async function montar(raiz, ctx) {
  const atual = pessoas.quem();

  raiz.append(
    el("div", { class: "cabec" }, el("h1", {}, "Quem está usando")),
    el("p", { style: "color:var(--fraco);font-size:13.5px;margin-bottom:16px" },
      "Escolha seu nome. Este aparelho lembra, e cada lançamento fica assinado " +
      "com ele no registro."),
    el("div", { class: "lista" }, pessoas.PESSOAS.map(p =>
      el("button", {
        class: "entrar-pessoa" + (atual && atual.nome === p.nome ? " sel" : ""),
        onclick: async () => {
          await pessoas.entrar(p.nome);
          avisar(`Olá, ${p.nome.split(" ")[0]}.`);
          ctx.ir(p.papel === "operacao" ? "operacao" : "hoje");
        },
      },
        el("b", {}, p.nome),
        el("span", {}, pessoas.PAPEIS[p.papel].rotulo),
        el("small", {}, pessoas.PAPEIS[p.papel].descricao)))),
    el("p", { style: "color:var(--muito-fraco);font-size:12px;margin-top:18px" },
      "Isto identifica, não protege: quem abrir o endereço pode escolher " +
      "qualquer nome. O que é mesmo trancado é o registro — nenhum lançamento " +
      "pode ser apagado ou reescrito, por ninguém."));
}
