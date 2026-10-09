// O endereço do lugar comum.
//
// Estes valores são PÚBLICOS por desenho — a chave do navegador é feita para
// ficar no navegador de quem usa, e quem protege os dados é a política do
// banco, não o segredo dela. Deixá-los aqui é o que faz ninguém nunca mais
// colar nada: os quatro abrem o endereço e já estão ligados.
//
// **Mas isso só é verdade se TODA tabela do projeto tiver RLS ligada.** Este
// repositório é público, e este projeto ainda carrega as tabelas do site
// antigo. Antes de gravar a chave aqui, rode `sql/00_conferir_rls.sql` e
// confira que nenhuma volta como ABERTA. Com a chave em branco o site continua
// funcionando: guarda só no navegador, e a aba Importar oferece colar à mão.

export const NUVEM = {
  url: "https://qektypjhagoktpvvaxel.supabase.co",

  // O Supabase trocou o sistema de chaves: `sb_publishable_…` substituiu a
  // antiga `anon`, e as duas funcionam igual para quem chama — vão no
  // cabeçalho `apikey`. Por isso o campo tem nome genérico: um campo chamado
  // `anon` guardando uma publishable seria mentira na primeira leitura.
  chave: "sb_publishable_-6P6cEB4VCw3KEPZZZ_S3w_7lOsCA1u",
};

// Cada um entra com o PRÓPRIO e-mail.
//
// A primeira versão inventava um: "Pedro" virava pedro@makro.local. O Supabase
// recusa — "Example and test domains are currently not supported" — e foi isso
// que barrou o primeiro acesso da equipe inteira. Nenhum e-mail de colega mora
// neste arquivo: o repositório é público, e quem é quem fica na tabela
// `pessoas`, no banco.

/** O que foi digitado, se for um e-mail. Nome sem @ devolve "". */
export function emailDe(texto) {
  const t = String(texto || "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t) ? t : "";
}

/** Os domínios que o Supabase não aceita. Servem para o site avisar antes de
 *  tentar, e para ignorar sobra de cadastro feito com eles. */
export function dominioDeTeste(email) {
  const d = String(email || "").toLowerCase().split("@")[1] || "";
  return /\.(local|test|example|invalid|localhost)$/.test(d) ||
    /^example\.(com|net|org)$/.test(d);
}
