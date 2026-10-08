// O endereço do lugar comum.
//
// Estes dois valores são PÚBLICOS por desenho — a chave anon é feita para ficar
// no navegador de quem usa, e quem protege os dados é a política do banco, não
// o segredo dela. Deixá-los aqui é o que faz ninguém nunca mais colar nada: os
// quatro abrem o endereço e já estão ligados.
//
// Enquanto estiverem vazios, o site funciona guardando só no navegador, e a
// tela Importar continua oferecendo colar à mão.

export const NUVEM = {
  url: "",      // https://xxxx.supabase.co
  anon: "",     // a chave "anon public", de Settings → API
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
