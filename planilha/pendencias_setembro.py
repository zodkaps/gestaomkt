# -*- coding: utf-8 -*-
"""
Levantamento de pendências das frotas — setembro
================================================
Lançamento do levantamento que veio do PCM. Substitui as nove linhas
reservadas (frota lançada, atividade em branco) pelas atividades de verdade.

SEM DATA, de propósito: ele pediu para não marcar o dia de execução. Elas
entram na fila de "sem data" e ele puxa quando programar.

    python3 pendencias_setembro.py entrada.json > saida.json
"""
import sys, json, io

HH="Apenas HH"                       # só mão de obra, sem peça
INSP="Verificar na rota de inspeção de setembro — sem pendências mapeadas"
OS_818="21378"

# (frota, serviço, [atividades], quem, obs, tipo)
LOTES=[
 ("F-1038","Pendências de inspeção",[
   "Substituir pneu 1º eixo LE devido desgaste",
   "Lubrificar graxeiros da quinta roda entre os bitrens",
   "Corrigir trinca no lastro",
   "Reapertar parafusos da tampa do cubo 1º eixo LD",
   "Regular freios 1º eixo LD",
   "Fixar grade de proteção do ciclista LD",
   "Fixar para-lamas folgados 2º eixo LD",
   "Fixar para-lamas folgados LE",
   "Reposicionar pinos da balança 2º e 3º eixo LD",
   "Corrigir travessa avariada ao lado direito da quinta roda",
 ],[],HH,"Corretiva",""),

 ("F-1039","Pendências de inspeção",[
   "Repor estepe faltante da carreta",
   "Repor porca de roda faltante 2º eixo LD",
   "Substituir tampa do cubo 3º eixo LE",
   "Substituir grade traseira com apoio faltante no LE",
   "Corrigir trincas no lastro da carreta",
   "Corrigir iluminação meia-luz dianteira LD",
   "Corrigir parafusos do para-choque traseiro LD",
   "Fixar para-lamas folgados LD e LE",
   "Reapertar tirante folgado 3º eixo LE",
 ],[],HH,"Corretiva",""),

 ("F-818","Pendências de inspeção",[
   "Substituir vareta de nível de óleo avariada",
   "Substituir junta da tampa de válvulas devido vazamento",
   "Substituir válvula termostática e tampa do reservatório contaminado",
   "Substituir amortecedores do 3º eixo LE",
   "Substituir amortecedores da cabine (horizontais traseiros e verticais dianteiros)",
   "Substituir joystick de mudanças",
   "Sanar vazamento no tubo de enchimento / vedação do cárter",
   "Completar óleo da direção hidráulica e sanar vazamento do reservatório",
   "Fixar retrovisor inferior LD",
   "Isolar fiação exposta do sensor de temperatura",
   "Fixar caixa do chicote das unidades",
   "Fixar módulo do motor",
   "Recuperar / fabricar base de proteção das conexões da bomba de ARLA",
   "Regular freios 3º eixo",
   "Regular freios 1º eixo",
   "Corrigir fixação da lameira traseira LE",
   "Reposicionar cabo do varão da válvula sensível à carga",
   "Fixar tampa superior do catalisador",
   "Reposicionar mangueira do dreno do AC",
   "Corrigir iluminação interna da cabine",
   "Substituir faixa refletiva do para-choque traseiro",
 ],[],HH,"Corretiva",OS_818),

 ("F-818","Pendências de inspeção",[
   "Recuperar barra V dianteira e traseira devido folga",
   "Programar recuperação da barra de direção longa (coifa rasgada)",
   "Substituir espelho contrapoeira 2º eixo LE",
   "Programar substituição das lonas de freio 1º eixo LD e LE",
 ],["Cardan Nordeste (externo)"],"Terceirizada — Cardan Nordeste","Corretiva",OS_818),

 ("F-818","Pendências de inspeção",[
   "Recuperar banco do motorista (fixação do assento e tapeçaria)",
 ],["Rodo Ceará (externo)"],"Terceirizada — Rodo Ceará","Corretiva",OS_818),

 ("F-968","Inspeção Mossoró",[
   "Bater e validar as pendências da inspeção realizada em Mossoró",
 ],[],"","Inspeção",""),
]
# Frotas sem pendência mapeada: entram na rota de inspeção de setembro.
for f in ("F-425","F-621","F-433","F-817","F-745"):
    LOTES.append((f,"Inspeção de setembro",
                  ["Verificar pendências na rota de inspeção de setembro"],
                  [],INSP,"Inspeção",""))

d=json.load(io.open(sys.argv[1],encoding="utf-8"))
FROTAS_NOVAS={l[0] for l in LOTES}

# Fora as linhas reservadas dessas frotas: é justamente o que este
# levantamento veio responder.
antes=len(d["linhas"])
d["linhas"]=[x for x in d["linhas"]
             if not (not x.get("atividade") and x.get("frota") in FROTAS_NOVAS)]
tiradas=antes-len(d["linhas"])

novas=0
for frota,servico,ativs,quem,obs,tipo,os_ in LOTES:
    for a in ativs:
        d["linhas"].append(dict(
            os=os_, frota=frota, servico=servico, atividade=a,
            tipo=tipo, origem="Programada", equipe=quem,
            semana=None, dia="", dias=None,      # SEM DATA, como ele pediu
            data=None, prazo=None, concluida="", marcar="",
            semorig=None, orig="", motivo="", obs=obs, oficina=""))
        novas+=1

ex=d.setdefault("listas",{}).setdefault("Executantes",[])
for q in ("Cardan Nordeste (externo)",):
    if q not in ex: ex.append(q)
fr=d["listas"].setdefault("Frotas",[])
for f in sorted(FROTAS_NOVAS):
    if f not in fr: fr.append(f)

sys.stderr.write(f"linhas reservadas removidas: {tiradas}\n")
sys.stderr.write(f"atividades novas: {novas}\n")
sys.stderr.write(f"total: {len(d['linhas'])}\n")
json.dump(d, sys.stdout, ensure_ascii=False)
