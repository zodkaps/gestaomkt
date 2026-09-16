# -*- coding: utf-8 -*-
"""
Lê a folha de programação impressa pelo site (PDF) e devolve as atividades
em JSON, no formato que a planilha usa.

    pdftotext -layout Programacao.PDF prog.txt
    python3 extrair_pdf.py prog.txt > dados.json
"""
import io,re,sys,json

DIAS={"seg":0,"ter":1,"qua":2,"qui":3,"sex":4,"sáb":5,"sab":5,"dom":6}
STATUS=("EM EXECUÇÃO","PROGRAMADA","CONCLUÍDA","CANCELADA")

CAB=re.compile(
 r"^\s+(Seg|Ter|Qua|Qui|Sex|Sáb|Dom)\s+(\d{1,2})/(\d{1,2})(?:\s*\+(\d+)d)?\s{2,}"
 r"(OS\s+.+?)\s{2,}(\S.*?)\s{2,}("+"|".join(STATUS)+r")\s*$")
INTERV=re.compile(r"(\d{2})/(\d{2})/(\d{2})\s+a\s+(\d{2})/(\d{2})/(\d{2})")
NDIAS=re.compile(r"^(\d+)\s+dias?$")
PEND=re.compile(r"^\s*([☐☑])\s*(.+?)\s*$")
FILA=re.compile(r"^\s{2,}(F-\d+)\s{2,}(.+?)\s{2,}(\d+)\s+pend\.\s*$")
REPROG=re.compile(
 r"^\s*(F-\d+)\s{2,}(.+?)\s{2,}(\d{2}/\d{2}/\d{2})\s+(\d{2}/\d{2}/\d{2})\s+"
 r"([+-]\d+d|—)\s+([+-]\d+d|—)\s+(.+?)\s{2,}(\S+)\s*$")

def iso(d,m,a): return "20%s-%02d-%02d"%(a,int(m),int(d))

def extrair(txt):
    linhas=txt.split("\n")
    servicos=[]; fila=[]; reprogs=[]
    atual=None; secao="servicos"
    i=0
    while i<len(linhas):
        ln=linhas[i]
        if "ainda sem dia" in ln: secao="fila"
        elif "Reprogramações do período" in ln: secao="reprog"
        elif "Indicadores do período" in ln: secao="fim"

        if secao=="servicos":
            m=CAB.match(ln)
            if m:
                dia_sem,dd,mm,extra,os_,titulo,situacao=m.groups()
                frota,_,tit=titulo.partition(" — ")
                atual={"frota":frota.strip(),"titulo":tit.strip(),
                       "os":"" if "PENDENTE" in os_ else os_.replace("OS","").strip(),
                       "situacao":situacao,"pendencias":[],
                       "ini":iso(dd,mm,"26"),"dias":1+int(extra or 0),
                       "tipo":"","executantes":"","sistema":"","obs":""}
                servicos.append(atual)
                # meta na próxima linha não vazia
                j=i+1
                while j<len(linhas) and not linhas[j].strip(): j+=1
                if j<len(linhas):
                    partes=[p.strip() for p in linhas[j].strip().split(" · ")]
                    if partes:
                        atual["tipo"]=partes[0]
                        resto=partes[1:]
                        iv=INTERV.search(linhas[j])
                        if iv:
                            d1,m1,a1,d2,m2,a2=iv.groups()
                            atual["ini"]=iso(d1,m1,a1)
                            resto=[p for p in resto if not INTERV.search(p)]
                        nd=[p for p in resto if NDIAS.match(p)]
                        if nd: atual["dias"]=int(NDIAS.match(nd[0]).group(1))
                        resto=[p for p in resto if not NDIAS.match(p)]
                        # A linha é "tipo · sistema · executantes · em andamento
                        # desde X · N dias · intervalo". Tirado o que é data, o
                        # ÚLTIMO pedaço é quem executa; o que vem antes é o
                        # sistema. Sem essa separação, "Pneus · Airton" virava
                        # um executante chamado "Pneus · Airton".
                        resto=[p for p in resto if not p.startswith("em andamento desde")]
                        atual["executantes"]=resto[-1] if resto else ""
                        atual["sistema"]=" · ".join(resto[:-1]) if len(resto)>1 else ""
                    i=j
            elif atual is not None:
                p=PEND.match(ln)
                if p:
                    atual["pendencias"].append({"feito":p.group(1)=="☑","texto":p.group(2)})
                elif ln.strip().startswith("Executado por:"):
                    atual=None
                elif (ln.strip() and atual is not None and not atual["pendencias"]
                      and not ln.strip().startswith("PENDÊNCIAS")
                      and not re.match(r"^F-\d+\s*$",ln.strip())
                      and " · " not in ln and "serviço(s)" not in ln):
                    atual["obs"]=(atual["obs"]+" "+ln.strip()).strip()
        elif secao=="fila":
            m=FILA.match(ln)
            if m: fila.append({"frota":m.group(1),"titulo":m.group(2).strip(),
                               "pend":int(m.group(3))})
        elif secao=="reprog":
            m=REPROG.match(ln)
            if m:
                fr,serv,de,para,adiou,prazo,motivo,quem=m.groups()
                # Serviço e motivo quebram em duas linhas quando não cabem na
                # coluna: a continuação vem na linha seguinte, alinhada na
                # mesma posição de caractere.
                cs,cm=m.start(2),m.start(7)
                j=i+1
                while j<len(linhas) and linhas[j].strip() and not REPROG.match(linhas[j]) \
                      and "FROTA" not in linhas[j] and "Indicadores" not in linhas[j]:
                    cont=linhas[j]
                    ext_s=cont[cs:cm].strip() if len(cont)>cs else ""
                    ext_m=cont[cm:].strip() if len(cont)>cm else ""
                    if ext_s: serv=serv.rstrip()+" "+ext_s
                    if ext_m: motivo=motivo.rstrip()+" "+ext_m
                    if not ext_s and not ext_m: break
                    j+=1
                i=j-1
                reprogs.append({"frota":fr,"servico":serv.strip(),"de":de,"para":para,
                                "adiou":adiou,"prazo":prazo,
                                "motivo":"" if "não informado" in motivo else motivo.strip(),
                                "quem":quem})
        i+=1
    # as tabelas se repetem na quebra de página: tira o que veio duas vezes
    def unicos(lista, chave):
        vistos=set(); saida=[]
        for x in lista:
            k=chave(x)
            if k in vistos: continue
            vistos.add(k); saida.append(x)
        return saida
    fila=unicos(fila, lambda f:(f["frota"],f["titulo"]))
    reprogs=unicos(reprogs, lambda r:(r["frota"],r["servico"],r["de"],r["para"]))
    return {"servicos":servicos,"fila":fila,"reprogramacoes":reprogs}

if __name__=="__main__":
    txt=io.open(sys.argv[1],encoding="utf-8").read()
    print(json.dumps(extrair(txt),ensure_ascii=False,indent=1))
