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
  chave: "",
};

// O domínio interno dos acessos. Ninguém precisa ter e-mail: quem digita
// "Pedro" entra como pedro@makro.local, e isso é detalhe de implementação que
// não aparece em tela nenhuma.
export const DOMINIO = "makro.local";

export function emailDe(nome) {
  return String(nome || "").trim().toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "") + "@" + DOMINIO;
}
