// O que o site mostra.
//
// Desde 21/10/2026 o site é a ferramenta de avaliação da operação: só
// movimentações de frota e preventivas, com os atrasos de entrega. As telas da
// oficina (Painel, Hoje, Programação, Semana, Resultados e Frota) saíram do
// menu a pedido do PCM, mas nada foi apagado: o código continua aqui e os
// lançamentos continuam na fita. Abrir o site com `?oficina=1` no endereço
// traz as telas de volta, para consultar o histórico.

export const OFICINA = typeof location !== "undefined" &&
  new URLSearchParams(location.search).get("oficina") === "1";

/** A primeira tela de quem entra, pelo papel: a consulta vai para o painel de OS
 *  (é só o que ela vê); a operação, para o que é dela; o PCM, para a Avaliação —
 *  ou para o Hoje, com a oficina de volta. */
export const telaInicial = papel => papel === "consulta" ? "os" : papel === "operacao" ? "operacao" : OFICINA ? "hoje" : "avaliacao";
