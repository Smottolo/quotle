#!/usr/bin/env python3
"""Scarica i prezzi mensili (aggiustati) delle aziende e genera ../data.js.

Uso:  python3 tools/fetch_data.py
Da rilanciare quando si aggiungono aziende o si vogliono dati aggiornati.
I prezzi vengono riportati a base 100 (il primo mese = 100): nel gioco
non compaiono mai prezzi reali.
"""
import json, os, sys, time, urllib.request, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "data.js")

# name, ticker Yahoo, settore (chiave), paese (ISO), dominio (per il logo), alias
COMPANIES = [
    # Italia
    ("Ferrari", "RACE.MI", "auto", "IT", "ferrari.com", ["RACE"]),
    ("Eni", "ENI.MI", "energy", "IT", "eni.com", []),
    ("Enel", "ENEL.MI", "utilities", "IT", "enel.com", []),
    ("Intesa Sanpaolo", "ISP.MI", "banks", "IT", "intesasanpaolo.com", ["Intesa", "ISP"]),
    ("UniCredit", "UCG.MI", "banks", "IT", "unicredit.it", ["UCG"]),
    ("Stellantis", "STLAM.MI", "auto", "IT", "stellantis.com", ["FCA", "Fiat"]),
    ("Telecom Italia", "TIT.MI", "telecom", "IT", "telecomitalia.com", ["TIM", "TIT"]),
    ("Moncler", "MONC.MI", "luxury", "IT", "moncler.com", []),
    ("Leonardo", "LDO.MI", "aerospace", "IT", "leonardo.com", ["Finmeccanica"]),
    ("Generali", "G.MI", "insurance", "IT", "generali.com", ["Assicurazioni Generali"]),
    ("Campari", "CPR.MI", "food", "IT", "camparigroup.com", ["Davide Campari"]),
    ("Prysmian", "PRY.MI", "industrials", "IT", "prysmian.com", []),
    ("Saipem", "SPM.MI", "energy", "IT", "saipem.com", []),
    ("Monte dei Paschi", "BMPS.MI", "banks", "IT", "mps.it", ["MPS", "Monte dei Paschi di Siena"]),
    ("Juventus", "JUVE.MI", "media", "IT", "juventus.com", ["Juve"]),
    ("Brunello Cucinelli", "BC.MI", "luxury", "IT", "brunellocucinelli.com", ["Cucinelli"]),
    ("Pirelli", "PIRC.MI", "auto", "IT", "pirelli.com", []),
    ("Amplifon", "AMP.MI", "health", "IT", "amplifon.com", []),
    ("Poste Italiane", "PST.MI", "insurance", "IT", "posteitaliane.it", ["Poste"]),
    ("Fineco", "FBK.MI", "banks", "IT", "finecobank.com", ["FinecoBank"]),
    # Europa
    ("LVMH", "MC.PA", "luxury", "FR", "lvmh.com", ["Louis Vuitton", "Moet Hennessy"]),
    ("Hermès", "RMS.PA", "luxury", "FR", "hermes.com", ["Hermes"]),
    ("Kering", "KER.PA", "luxury", "FR", "kering.com", ["Gucci"]),
    ("Airbus", "AIR.PA", "aerospace", "FR", "airbus.com", []),
    ("ASML", "ASML.AS", "tech", "NL", "asml.com", []),
    ("Adyen", "ADYEN.AS", "tech", "NL", "adyen.com", []),
    ("Philips", "PHIA.AS", "health", "NL", "philips.com", ["Koninklijke Philips"]),
    ("SAP", "SAP.DE", "tech", "DE", "sap.com", []),
    ("Adidas", "ADS.DE", "consumer", "DE", "adidas.com", []),
    ("Puma", "PUM.DE", "consumer", "DE", "puma.com", []),
    ("Volkswagen", "VOW3.DE", "auto", "DE", "volkswagen.com", ["VW"]),
    ("BMW", "BMW.DE", "auto", "DE", "bmw.com", []),
    ("Siemens", "SIE.DE", "industrials", "DE", "siemens.com", []),
    ("Deutsche Bank", "DBK.DE", "banks", "DE", "db.com", []),
    ("Bayer", "BAYN.DE", "health", "DE", "bayer.com", []),
    ("Zalando", "ZAL.DE", "consumer", "DE", "zalando.com", []),
    ("Nokia", "NOKIA.HE", "telecom", "FI", "nokia.com", []),
    ("Ericsson", "ERIC-B.ST", "telecom", "SE", "ericsson.com", []),
    ("H&M", "HM-B.ST", "consumer", "SE", "hm.com", ["Hennes & Mauritz", "H and M"]),
    ("Novo Nordisk", "NOVO-B.CO", "health", "DK", "novonordisk.com", ["Novo"]),
    ("Nestlé", "NESN.SW", "food", "CH", "nestle.com", ["Nestle"]),
    ("Inditex", "ITX.MC", "consumer", "ES", "inditex.com", ["Zara"]),
    ("Ryanair", "RYA.IR", "transport", "IE", "ryanair.com", []),
    ("Rolls-Royce", "RR.L", "aerospace", "GB", "rolls-royce.com", ["Rolls Royce"]),
    ("Shell", "SHEL.L", "energy", "GB", "shell.com", ["Royal Dutch Shell"]),
    ("AstraZeneca", "AZN.L", "health", "GB", "astrazeneca.com", []),
]

YEARS = 10
MIN_MONTHS = 60


def fetch(ticker):
    url = (f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker}"
           f"?range={YEARS}y&interval=1mo&events=div,splits")
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=20) as r:
        res = json.load(r)["chart"]["result"][0]
    ts = res["timestamp"]
    adj = res["indicators"]["adjclose"][0]["adjclose"]
    pts = [(datetime.datetime.fromtimestamp(t, datetime.UTC).strftime("%Y-%m"), p)
           for t, p in zip(ts, adj) if p]
    # un punto per mese (Yahoo a volte aggiunge il mese corrente due volte)
    seen, out = set(), []
    for m, p in pts:
        if m not in seen:
            seen.add(m); out.append((m, p))
    return out


def biggest_crash_year(prices):
    """Anno in cui termina il calo più profondo dal massimo precedente."""
    peak, best, year = prices[0][1], 0.0, prices[0][0][:4]
    for m, p in prices:
        peak = max(peak, p)
        dd = 1 - p / peak
        if dd > best:
            best, year = dd, m[:4]
    return year, round(best * 100)


def main():
    out = []
    for name, ticker, sector, country, domain, aliases in COMPANIES:
        try:
            prices = fetch(ticker)
        except Exception as e:
            print(f"  ✗ {name} ({ticker}): {e}", file=sys.stderr)
            continue
        if len(prices) < MIN_MONTHS:
            print(f"  ✗ {name}: solo {len(prices)} mesi", file=sys.stderr)
            continue
        base = prices[0][1]
        year, depth = biggest_crash_year(prices)
        out.append({
            "name": name, "ticker": ticker.split(".")[0], "sector": sector,
            "country": country, "domain": domain, "aliases": aliases,
            "start": prices[0][0], "end": prices[-1][0],
            "crashYear": year, "crashDepth": depth,
            "series": [round(p / base * 100, 1) for _, p in prices],
        })
        print(f"  ✓ {name}: {len(prices)} mesi, crollo {depth}% nel {year}")
        time.sleep(0.3)
    with open(OUT, "w", encoding="utf-8") as f:
        f.write("// Generato da tools/fetch_data.py — non modificare a mano\n")
        f.write(f"// Aggiornato: {datetime.date.today()}\n")
        f.write("window.QUOTLE_DATA = ")
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")
    print(f"\n{len(out)} aziende salvate in data.js")


if __name__ == "__main__":
    main()
