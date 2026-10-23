// Os ícones do menu, desenhados em linha (24×24, traço de 2 na cor do
// texto). Antes eram caracteres — e alguns, como a mão da tela "Para você",
// viravam emoji colorido conforme o aparelho. Desenho próprio, sem
// biblioteca: são poucos e simples.

const NS = "http://www.w3.org/2000/svg";

const DESENHOS = {
  pessoa: '<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5c.8-3.8 3.8-6 7.5-6s6.7 2.2 7.5 6"/>',
  medidor: '<path d="M4.4 18.5a9 9 0 1 1 15.2 0"/><path d="M12 14.5l4-4.5"/><circle cx="12" cy="14.5" r="1.4"/>',
  painel: '<rect x="3.5" y="3.5" width="7" height="9" rx="1.8"/><rect x="13.5" y="3.5" width="7" height="5" rx="1.8"/>' +
    '<rect x="13.5" y="11.5" width="7" height="9" rx="1.8"/><rect x="3.5" y="15.5" width="7" height="5" rx="1.8"/>',
  sol: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
  lista: '<path d="M9 6.5h11M9 12h11M9 17.5h11"/><path d="M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01" stroke-width="2.6"/>',
  calendario: '<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M8 3v4M16 3v4M3.5 10h17"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 17h.01M12 17h.01" stroke-width="2.4"/>',
  barras: '<path d="M4 4v16h16"/><path d="M8.5 16v-4M13 16V8M17.5 16v-6.5"/>',
  escudo: '<path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.2-7.5 9.5-4.3-1.3-7.5-4.9-7.5-9.5V6z"/><path d="M8.7 12.2l2.3 2.3 4.4-4.6"/>',
  trocar: '<path d="M4 8h15M15 4l4 4-4 4"/><path d="M20 16H5M9 12l-4 4 4 4"/>',
  caminhao: '<path d="M2.5 6.5h11v9.5h-11z"/><path d="M13.5 9.5h4l3 3.5v3h-7"/><circle cx="6.5" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>',
  historico: '<path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1L3.5 8.5"/><path d="M3.5 4v4.5H8"/><path d="M12 7.5V12l3 2"/>',
  enviar: '<path d="M12 15V4M7.5 8.5L12 4l4.5 4.5"/><path d="M4.5 14.5v3a3 3 0 0 0 3 3h9a3 3 0 0 0 3-3v-3"/>',
  pulso: '<path d="M3 12h4l2.2-5.5 4.6 11 2.2-5.5h5"/>',
  mais: '<path d="M6 12h.01M12 12h.01M18 12h.01" stroke-width="3"/>',
  visto: '<circle cx="12" cy="12" r="8.5"/><path d="M8.3 12.3l2.5 2.5 4.9-5.1"/>',
  bandeira: '<path d="M5.5 21V4"/><path d="M5.5 4.5h11.5l-2.5 4 2.5 4H5.5"/>',
  pergunta: '<circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.5a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.2-2.4 3.6"/><path d="M12 17.2h.01" stroke-width="2.6"/>',
  adicionar: '<path d="M12 5v14M5 12h14"/>',
};

/** O ícone como <svg>, na cor do texto em volta. */
export function icone(nome, tam = 18) {
  const s = document.createElementNS(NS, "svg");
  s.setAttribute("viewBox", "0 0 24 24");
  s.setAttribute("width", tam);
  s.setAttribute("height", tam);
  s.setAttribute("fill", "none");
  s.setAttribute("stroke", "currentColor");
  s.setAttribute("stroke-width", "2");
  s.setAttribute("stroke-linecap", "round");
  s.setAttribute("stroke-linejoin", "round");
  s.setAttribute("aria-hidden", "true");
  s.setAttribute("class", "ic");
  s.innerHTML = DESENHOS[nome] || "";
  return s;
}

export const NOMES_ICONES = Object.keys(DESENHOS);
