// Quem está usando, e o que esse alguém pode fazer.
//
// Mudou o que importa: o papel não mora mais aqui. Ele vem da tabela `pessoas`
// no banco, que o site **não consegue escrever** — não existe política de
// insert nem de update nela. Antes, a lista estava no código e a separação
// entre PCM e operação era combinada: quem trocasse o nome na tela lançava como
// PCM. Agora o Postgres recusa, e a conta só anda com a senha certa.
//
// Esta lista de nomes serve ao modo "trabalhar neste aparelho" e às sugestões
// da tela de criar acesso. Ela não decide nada, e não tem e-mail de ninguém:
// o repositório é público.

import * as dados from "./dados.js";
import * as nuvem from "./nuvem.js";
import { dominioDeTeste } from "./config.js";

const semAcento = t => String(t || "").trim().toLowerCase()
  .normalize("NFD").replace(/\p{Diacritic}/gu, "");

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
    "movimentar", "disponibilidade", "parada", "preventiva_feita", "criar_acesso",
    "aprovar"]),
  // A operação registra REALIDADE: o caminhão saiu, voltou, a frota está livre
  // tal dia. O que ela não faz é decidir a oficina.
  operacao: new Set(["movimentar", "disponibilidade"]),
};

let atual = null;
let elenco = [];

export function quem() { return atual; }
/** Está trabalhando só neste aparelho, sem sessão no banco? */
export function local() { return !!(atual && atual.local); }
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
    // Entrou com senha: o modo local cumpriu o papel e sai de cena. Guardá-lo
    // faria o site voltar a "trabalhando só neste aparelho" no próximo
    // recarregamento, que é o contrário do que acabou de acontecer.
    if (await dados.lerMeta("quem_local", "")) await dados.gravarMeta("quem_local", "");
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
    // Sem sessão no banco. Antes isto virava porta trancada: com o endereço
    // configurado, a única entrada era a senha, e um projeto fora do ar deixava
    // ninguém usar um site que funciona inteiro com os dados locais.
    //
    // Agora, quem escolheu trabalhar neste aparelho continua entrando. O papel
    // vem da lista de sugestão, como era antes de existir banco — e isso não
    // abre buraco nenhum: sem sessão não há como escrever no banco, então o
    // que for lançado fica na fila até alguém entrar com senha de verdade, e
    // aí o Postgres confere tudo como sempre.
    const nomeLocal = await dados.lerMeta("quem_local", "");
    const sug = SUGESTAO.find(x => x.nome === nomeLocal);
    atual = sug ? { email: "", nome: sug.nome, papel: sug.papel, local: true } : null;
  }
  return atual;
}

/** Trabalhar só neste aparelho, enquanto a nuvem não responde. */
export async function entrarLocal(nome) {
  const sug = SUGESTAO.find(x => x.nome === nome);
  if (!sug) throw new Error("Não conheço essa pessoa.");
  await dados.gravarMeta("quem_local", sug.nome);
  atual = { email: "", nome: sug.nome, papel: sug.papel, local: true };
  return atual;
}

export async function sair() {
  await nuvem.sair();
  await dados.gravarMeta("quem_local", "");
  atual = null;
}

/** A equipe que este aparelho já viu (nome e e-mail), sem os cadastros de
 *  teste. Serve à troca de usuário: tocar no nome preenche o e-mail. */
export async function conhecidos() {
  const lista = (await dados.lerMeta("elenco", [])) || [];
  return lista.filter(p => p && p.nome && p.email && !dominioDeTeste(p.email))
    .map(p => ({ nome: p.nome, email: p.email }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

/** O e-mail de quem tem esse nome, se este aparelho já souber.
 *
 *  Quem digita "Lucas" em vez do e-mail ainda entra, desde que alguém com
 *  papel já tenha entrado neste aparelho antes — é dessa vez que vem a cópia
 *  da tabela `pessoas`. Sobra de cadastro com domínio de teste não conta, e
 *  nome que aponta para dois e-mails não adivinha: pede o e-mail. */
export async function emailPorNome(texto) {
  const alvo = semAcento(texto);
  if (!alvo) return "";
  const lista = (await dados.lerMeta("elenco", [])) || [];
  const achados = [...new Set(lista
    .filter(p => semAcento(p.nome) === alvo && !dominioDeTeste(p.email))
    .map(p => p.email))];
  return achados.length === 1 ? achados[0] : "";
}

/** O e-mail da última pessoa que entrou neste aparelho. */
export async function ultimoEmail() {
  return dados.lerMeta("ultimo_email", "");
}

/** Quem estava trabalhando local — é de quem o site vai pedir a senha, para a
 *  fila de saída casar com o autor dos lançamentos que estão nela. */
export async function nomeLocalGuardado() {
  return dados.lerMeta("quem_local", "");
}
