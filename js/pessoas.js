// Quem está usando, e o que esse alguém pode fazer.
//
// São quatro: dois no PCM e dois na operação. Entrar é escolher o nome numa
// lista — sem senha, sem e-mail. Isso é uma troca consciente: no pátio, no
// celular, com a mão suja, qualquer atrito a mais é um apontamento que não
// acontece. O preço é que **o limite entre PCM e operação é combinado, não
// trancado**: quem souber o endereço e trocar o nome aqui consegue lançar como
// PCM. Para quatro pessoas da mesma equipe, vale.
//
// O que é trancado de verdade mora no banco (`sql/01_esquema.sql`): a fita de
// eventos é só-insere, e nem um erro meu apaga um lançamento.

import * as dados from "./dados.js";

export const PESSOAS = [
  { nome: "Mateus",       papel: "pcm" },
  { nome: "Lucas",        papel: "pcm" },
  { nome: "Pedro",        papel: "operacao" },
  { nome: "João Victor",  papel: "operacao" },
];

export const PAPEIS = {
  pcm: {
    rotulo: "PCM / manutenção",
    descricao: "programa a oficina, dá baixa, importa o Protheus",
  },
  operacao: {
    rotulo: "Operação",
    descricao: "aponta movimentação de frota e diz quando o caminhão fica livre",
  },
};

// O que cada papel pode fazer. Os nomes são a ação, não a tela: a mesma
// permissão vale no botão, no atalho e na importação.
const PODE = {
  pcm: new Set(["programar", "baixar", "editar_atividade", "importar",
    "movimentar", "disponibilidade", "parada", "preventiva_feita"]),
  // A operação registra REALIDADE — o caminhão saiu, o caminhão voltou, a
  // frota está livre tal dia. O que ela não faz é decidir a oficina: programar,
  // dar baixa em serviço e marcar o dia da parada continuam sendo do PCM.
  operacao: new Set(["movimentar", "disponibilidade"]),
};

let atual = null;

export function quem() { return atual; }

export function nome() { return atual ? atual.nome : ""; }

export function papel() { return atual ? atual.papel : ""; }

export function ehOperacao() { return papel() === "operacao"; }

export function pode(acao) {
  if (!atual) return false;
  return (PODE[atual.papel] || new Set()).has(acao);
}

/** Lança um erro em vez de devolver falso: quem chama sem checar tem de quebrar
 *  alto, não gravar calado um evento que a pessoa não podia gerar. */
export function exigir(acao) {
  if (!pode(acao)) {
    throw new Error(`${nome() || "Você"} não lança isso aqui — é do PCM.`);
  }
}

export async function carregar() {
  const n = await dados.lerMeta("quem", "");
  atual = PESSOAS.find(p => p.nome === n) || null;
  return atual;
}

export async function entrar(nomeEscolhido) {
  const p = PESSOAS.find(x => x.nome === nomeEscolhido);
  if (!p) throw new Error("Não conheço essa pessoa.");
  atual = p;
  await dados.gravarMeta("quem", p.nome);
  return p;
}

export async function sair() {
  atual = null;
  await dados.gravarMeta("quem", "");
}
