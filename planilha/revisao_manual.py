# -*- coding: utf-8 -*-
"""
As 17 que o robô não pode reescrever sozinho
============================================
`adicionar.py --limpar` padroniza o texto das atividades, mas se recusa a mexer
em 17 delas: 12 têm parêntese dentro de parêntese e 5 vieram **cortadas do PDF**
de inspeção, sem fechar o parêntese. Nas duas situações a extração automática
deixa `)` solto ou embaralha a ordem da observação, então texto.py devolve a
linha intacta e manda revisar à mão.

É o que este arquivo faz — uma vez, para o acervo que veio do PDF. O padrão é o
mesmo do automático: **verbo no infinitivo + objeto + posição** na atividade, e
o número de peça, a oficina e o porquê na observação.

Nas 5 cortadas, o que sobrou da frase foi reconstruído até onde o texto permite
e a linha leva ⚠️ dizendo que veio truncada — o resto se perdeu na origem, não
aqui, e só o relatório do Protheus pode devolver.

    python3 revisao_manual.py entrada.json > saida.json
"""
import sys, json, io

# (frota, trecho que identifica a linha, atividade nova, observação nova)
R = [
 ("F-326", "Substituir batentes dos eixos traseiros",
  "Substituir batentes dos eixos traseiros LE e LD gastos",
  "Serviço empresa especializada · peça 20390836 (4 unidades)"),

 ("F-327", "juntas do escapamento gastas",
  "Substituir juntas do escapamento gastas",
  "Serviço interno Matriz · peça 20855371 (6 unidades) · realizar acompanhamento"),

 ("F-626", "juntas do coletor de escapamento",
  "Substituir juntas do coletor de escapamento",
  "Peça 20855371 (6 unidades)"),

 ("F-815", "junta da tampa de válvulas com vazamento",
  "Substituir junta da tampa de válvulas com vazamento",
  "Peça 20804638 (junta motor D11)"),

 ("F-815", "mangueiras do reservatório de óleo hidráulico",
  "Corrigir vazamento nas mangueiras do reservatório de óleo hidráulico",
  "Recuperar as mangueiras e substituir abraçadeiras · "
  "⚠️ texto veio cortado do PDF de inspeção"),

 ("F-815", "amortecedor dianteiro da cabine LD com desgaste",
  "Substituir amortecedor dianteiro da cabine LD",
  'Desgaste nas buchas, com ruído "ferro com ferro" ao movimentar · '
  "⚠️ texto veio cortado do PDF de inspeção"),

 ("F-815", "Substituir farol LE avariado",
  "Substituir farol LE avariado",
  "Peça 21035645 · realizar acompanhamento"),

 ("F-815", "vedação dos pescadores do tanque",
  "Substituir vedação dos pescadores do tanque LD e LE",
  "Devido vazamento · peça 20732301 (2 unidades) · realizar acompanhamento"),

 ("F-815", "farol de neblina LE avariado",
  "Substituir farol de neblina LE avariado",
  "Peça 21297918 · realizar acompanhamento"),

 ("F-815", "paralama traseiro LE avariado",
  "Substituir paralama traseiro LE avariado",
  "Peça 812975614 · realizar acompanhamento"),

 ("F-964", "anéis de vedação das unidades",
  "Substituir anéis de vedação das unidades",
  "OS 7166 · devido vazamento nas unidades · peças A 023 997 64 48 (6 unidades) "
  "e A 023 997 65 48 · ⚠️ texto veio cortado do PDF de inspeção"),

 ("F-964", "conjunto do filtro racor",
  "Lavar conjunto do filtro racor e verificar vazamento",
  "Peça A 000 470 24 90 · realizar acompanhamento"),

 ("F-964", "espelho retrovisor inferior LE",
  "Repor espelho retrovisor inferior LE",
  "OS 7168 · peças A 000 810 24 79 e A 002 811 31 33 "
  "(retrovisor auxiliar completo)"),

 ("F-964", "borracha inferior da cabine",
  "Retirar borracha inferior da cabine",
  "OS 7193 · devido atrito com o reservatório de arrefecimento · "
  "serviço interno Matriz · ⚠️ texto veio cortado do PDF de inspeção"),

 # "especialmente LE" fica na observação: a atividade é retirar os espelhos das
 # rodas traseiras, e escrever só LE no nome mudaria o serviço.
 ("F-964", "espelhos das rodas traseiras",
  "Retirar espelhos das rodas traseiras",
  "OS 7190 · especialmente o LE · para melhor visualização do desgaste das "
  "lonas de freio · serviço interno Matriz · ⚠️ texto veio cortado do PDF de inspeção"),

 ("F-964", "borracha de vedação da porta LD",
  "Repor borracha de vedação da porta LD",
  "OS 7168 · peça A 958 721 00 80 (2 unidades)"),

 ("F-964", "letreiro do modelo Axor",
  'Substituir letreiro do modelo Axor "3344"',
  "Peça A 943 817 13 14 · certificar com fornecedor"),
]

d = json.load(io.open(sys.argv[1], encoding="utf-8"))

feitas = 0
nao = []
for frota, marca, nova, obs in R:
    alvo = [x for x in d["linhas"]
            if x.get("frota") == frota and marca in (x.get("atividade") or "")]
    if len(alvo) != 1:
        nao.append(f"{frota} · {marca!r} casou com {len(alvo)} linhas")
        continue
    x = alvo[0]
    antes = x.get("obs") or ""
    x["atividade"] = nova
    # o que ele já tinha escrito na observação vem primeiro e não se perde
    x["obs"] = " · ".join(p for p in (antes, obs) if p.strip())
    feitas += 1

sys.stderr.write(f"reescritas à mão: {feitas} de {len(R)}\n")
for t in nao:
    sys.stderr.write(f"  NÃO APLIQUEI: {t}\n")
if nao:
    sys.exit(1)
json.dump(d, sys.stdout, ensure_ascii=False)
