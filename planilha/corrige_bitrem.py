# -*- coding: utf-8 -*-
"""
Correção do PCM: o bitrem das 09:25 é a F-1065
==============================================
Ele confirmou a frota — o que também explica a mensagem solta das 10:03,
"Frota 1065", que estava justamente identificando o bitrem.

E confirmou que a mensagem das 09:32 ("Realizado ferragem de pneus TAMBÉM")
é a mesma atividade das 09:25, não outra: era a confirmação de que a ferragem
do bitrem saiu. As duas linhas viram uma só, concluída.

    python3 corrige_bitrem.py entrada.json > saida.json
"""
import sys, json, io

BITREM="Ferrar pneus do bitrem"
TAG="Ferragem de pneus — verificar TAG"

d=json.load(io.open(sys.argv[1],encoding="utf-8"))

base=None; extra=None
for x in d["linhas"]:
    if x.get("frota")=="Não informada":
        if x.get("atividade")==BITREM: base=x
        elif x.get("atividade")==TAG:  extra=x

if base is None:
    sys.stderr.write("ERRO: não achei a linha do bitrem\n"); sys.exit(1)

base["frota"]="F-1065"
base["atividade"]="Ferragem de pneus do bitrem"
base["obs"]=("Verificar TAG · Bitrem identificado pelo PCM como F-1065 "
             "(mensagem das 10:03) · Origem: WhatsApp 02/09")
if extra:
    # As 09:32 confirmavam a conclusão desta mesma ferragem: a data e o
    # "Concluída" vêm de lá, e a linha duplicada sai.
    base["concluida"]=extra.get("concluida") or base.get("concluida")
    base["marcar"]="Concluída"
    for q in (extra.get("equipe") or []):
        if q not in base["equipe"]: base["equipe"].append(q)
    d["linhas"].remove(extra)
    sys.stderr.write("linha das 09:32 consolidada na do bitrem\n")

sys.stderr.write(f"bitrem → F-1065 · {base['marcar'] or 'pendente'} · "
                 f"concluída em {base.get('concluida') or '—'}\n")
sys.stderr.write(f"total de linhas: {len(d['linhas'])}\n")
json.dump(d, sys.stdout, ensure_ascii=False)
