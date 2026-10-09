// Quem está usando, e o que esse alguém pode fazer.
//
// Mudou o que importa: o papel não mora mais aqui. Ele vem da tabela `pessoas`
// no banco, que o site **não consegue escrever** — não existe política de
// insert nem de update nela. Antes, a lista estava no código e a separação
// entre PCM e operação era combinada: quem trocasse o nome na tela lançava como
// PCM. Agora o Postgres recusa, e a conta só anda com a senha certa.
//
// Esta lista de nomes continua existindo só para a tela de criar acesso saber
// o que sugerir na primeira vez. Ela não decide nada.

import * as dados from "./dados.js";
import * as nuvem from "./nuvem.js";

export const SUGESTAO = [
  { nome: "Mateus", papel: "pcm" },
  { nome: "Lucas", papel: "pcm" },
  { nome: "Pedro", papel: "operacao" },
  { nome: "João Victor", papel: "operacao" },
];

export const PAPEIS = {
  pcm: {
    rotulo: "PCM / manutenção",
    descricao: "programa a oficina, dá baixa, marca parada, importa o Protheus",
  },
  operacao: {
    rotulo: "Operação",
    descricao: "aponta movimentação de frota e diz quando o caminhão fica livre",
  },
};

// O que cada papel pode. Os nomes são a ação, não a tela: a mesma permissão
// vale no botão, no atalho e na importação. O banco confere as mesmas regras —
// isto aqui existe para a tela não oferecer o que vai ser recusado.
const PODE = {
  pcm: new Set(["programar", "baixar", "editar_atividade", "importar",
    "movimentar", "disponibilidade", "parada", "preventiva_feita", "criar_acesso"]),
  // A operação registra REALIDADE: o caminhão saiu, voltou, a frota está livre
  // tal dia. O que ela não faz é decidir a oficina.
  operacao: new Set(["movimentar", "disponibilidade"]),
};

let atual = null;
let elenco = [];

export function quem() { return atual; }
export function nome() { return atual ? atual.nome : ""; }
export function papel() { return atual ? atual.papel : ""; }
export function ehOperacao() { return papel() === "operacao"; }
export function todos() { return elenco.slice(); }

export function pode(acao) {
  if (!atual) return false;
  return (PODE[atual.papel] || new Set()).has(acao);
}

/** Lança em vez de devolver falso: quem chama sem checar tem de quebrar alto,
 *  não gravar calado um evento que a pessoa não podia gerar. */
export function exigir(acao) {
  if (!pode(acao)) {
    throw new Error(`${nome() || "Você"} não lança isso aqui — é do PCM.`);
  }
}

/** Monta quem está usando a partir da sessão e da tabela do banco. Sem rede,
 *  usa a última cópia conhecida: o pátio não pode travar porque o sinal caiu. */
export async function carregar() {
  elenco = await dados.lerMeta("elenco", []) || [];
  if (nuvem.autenticado()) {
    try {
      // Resposta do banco é resposta, mesmo vindo vazia: lista vazia quer dizer
      // "a tabela não tem ninguém", e não "não consegui perguntar". Guardar a
      // cópia velha nesse caso faria alguém tirado da tabela continuar com
      // papel de PCM na tela. Só a FALHA da chamada cai para a cópia local —
      // que é o caso do pátio sem sinal.
      elenco = await nuvem.lerPessoas() || [];
      await dados.gravarMeta("elenco", elenco);
    } catch (e) { /* sem rede: segue com a cópia local */ }
    const email = nuvem.emailAtual();
    atual = elenco.find(p => p.email === email) || null;
    if (!atual) {
      // Entrou, mas não está na tabela `pessoas`: sem papel, sem permissão.
      // Melhor do que chutar "operação" e deixar alguém lançar o que não devia
      // — mas o site tem de DIZER isso, senão vira um menu vazio sem
      // explicação, que é o pior jeito de errar.
      atual = { email, nome: email.split("@")[0], papel: "", semPapel: true };
    }
  } else {
    atual = null;
  }
  return atual;
}

export async function sair() {
  await nuvem.sair();
  atual = null;
}
