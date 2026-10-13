// O número da semana que fica.
//
// Três jeitos de uma semana ter número, nesta ordem:
//
//  1. REGISTRADO — o PCM fechou a semana no site, ou o número veio da coluna
//     amarela da planilha. É o que foi para a reunião, e vale acima de tudo.
//  2. AUTOMÁTICO — ninguém fechou, a semana já acabou e o site já existia na
//     sexta: vale como as atividades estavam na sexta às 23h59. É a fita tocada
//     até aquele instante, não um palpite — e por isso ninguém precisa lembrar.
//  3. SEM FECHAMENTO — a semana ainda não acabou (o número ainda está sendo
//     feito), ou acabou antes de o site existir e a planilha não tinha o
//     registrado: só há o calculado de hoje, e a tela avisa.
//
// O calculado de hoje vem sempre junto, para mostrar o quanto se afastou.

import * as ev from "./eventos.js";
import * as M from "./modelo.js";

// Tocar a fita até cada sexta é uma passada só por ela, para todas as semanas
// de uma vez: a fita está em ordem de instante, então "até a sexta" é sempre
// um começo dela. Guardado até a fita mudar.
let memo = { chave: "", porSemana: new Map() };

function naSexta(semanas, fita) {
  const chave = `${fita.length}|${fita.length ? fita[fita.length - 1].id : ""}|` +
    semanas.map(w => ev.chaveSemana(w.ano, w.semana)).sort().join(",");
  if (memo.chave === chave) return memo.porSemana;
  const porSemana = new Map();
  const ordem = semanas.map(w => ({ ...w, corte: M.corteDaSemana(w.ano, w.semana) }))
    .sort((a, b) => a.corte.localeCompare(b.corte));
  const mapas = ev.reconstruir([]);
  let i = 0;
  for (const w of ordem) {
    while (i < fita.length && fita[i].ts < w.corte) ev.dobrar(mapas, fita[i++]);
    if (i === 0) continue;                         // o site ainda não existia
    const lista = [...mapas.atividade.values()].filter(a => !a.excluida);
    const sexta = M.datasDaSemana(w.ano, w.semana)[4];
    porSemana.set(ev.chaveSemana(w.ano, w.semana),
      M.numerosDoFechamento(M.resultados(lista, w.ano, w.semana, sexta)));
  }
  memo = { chave, porSemana };
  return porSemana;
}

/** O fechamento de cada semana pedida.
 *  `agora` é um instante ISO e `hoje` a data do calculado (para testar);
 *  `fita` é a fita de eventos. */
export function fechamentos(semanas, { agora = new Date().toISOString(), hoje = M.hoje(),
  fita = ev.log, registrados = ev.estado.semana, atividades = null } = {}) {
  const ats = atividades || (fita === ev.log ? ev.lista()
    : [...ev.reconstruir(fita).atividade.values()].filter(a => !a.excluida));
  const encerradas = semanas.filter(w => M.corteDaSemana(w.ano, w.semana) <= agora);
  const auto = naSexta(encerradas, fita);
  return semanas.map(w => {
    const chave = ev.chaveSemana(w.ano, w.semana);
    const ao_vivo = M.resultados(ats, w.ano, w.semana, hoje);
    const encerrada = M.corteDaSemana(w.ano, w.semana) <= agora;
    const reg = registrados.get(chave);
    const sexta = auto.get(chave) || null;           // como estava na sexta às 23h59
    if (reg) return { ...w, modo: "registrado", numeros: reg, ao_vivo, sexta, encerrada };
    if (sexta) return { ...w, modo: "automatico", numeros: sexta, ao_vivo, sexta, encerrada };
    return { ...w, modo: encerrada ? "sem_fechamento" : "em_andamento", numeros: null, ao_vivo,
      sexta: null, encerrada };
  });
}

export function fechamento(ano, semana, opcoes = {}) {
  return fechamentos([{ ano, semana }], opcoes)[0];
}

/** O número veio da coluna amarela da planilha — pela tela Importar, ou
 *  trazido a pedido pelo banco, com a planilha anotada como fonte. */
export function daPlanilha(n) {
  return !!n && (n.origem === "planilha" || /\.(xlsx|xlsm|xls|csv)$/i.test(n.fonte || ""));
}

/** O valor que vale para um indicador: o registrado, se houver; senão o de hoje. */
export function vale(f, campo) {
  if (f.numeros && f.numeros[campo] != null) return f.numeros[campo];
  return f.ao_vivo[campo];
}
