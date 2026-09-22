const { chromium } = require('playwright');
const fs = require('fs');
// Rigenera /en/index.html dalla pagina italiana, applicando traduzioni-en.json.
// Da rilanciare ogni volta che si modifica index.html, aggiungendo al file delle
// traduzioni le frasi nuove: lo script elenca quelle che non trova.
const SCR = __dirname;
const dizionario = JSON.parse(fs.readFileSync(`${SCR}/traduzioni-en.json`, 'utf8'));

(async () => {
  const b = await chromium.launch();
  const page = await b.newPage();
  // La pagina contiene uno script che rimanda a /en/ per chi non ha il browser in
  // italiano: caricandola da file:// quel rimando punterebbe a un percorso
  // inesistente e romperebbe la cattura. Si finge quindi una scelta di lingua
  // già fatta, così lo script di rimando non parte.
  await page.addInitScript(() => { try { sessionStorage.setItem("lingua-scelta", "it"); } catch (e) {} });
  await page.goto(`file://${SCR}/index.html`, {waitUntil:'networkidle'});
  await page.waitForTimeout(700);

  const rimasti = await page.evaluate((diz) => {
    const nonTradotti = [];
    const salta = new Set(["S","SER","MAT","LAB","Filotheca","Hank","H",".","Windows","macOS",
      "Apple Silicon","Mac Intel","Mac","theca","support@sermatlab.it","© 2026 SERMAT LAB",
      "· Windows 1.1.3","Anycubic","Bambu Lab"]);
    const stringi = (x) => x.replace(/\s+/g, " ").trim();
    const mappa = {};
    for (const k of Object.keys(diz)) mappa[stringi(k)] = diz[k];
    const cammina = (n) => {
      if (n.nodeType === 3) {
        const v = n.nodeValue.trim();
        if (!v) return;
        const chiave = stringi(v);
        if (mappa[chiave] !== undefined) { n.nodeValue = n.nodeValue.replace(v, mappa[chiave]); return; }
        if (!salta.has(v) && /[a-zàèéìòù]{4}/i.test(v)) nonTradotti.push(v);
        return;
      }
      if (n.nodeType !== 1 || ["SCRIPT","STYLE"].includes(n.tagName)) return;
      for (const attr of ["placeholder","title","alt"]) {
        const a = n.getAttribute && n.getAttribute(attr);
        if (a && mappa[stringi(a)] !== undefined) n.setAttribute(attr, mappa[stringi(a)]);
        else if (a && a.trim() && /[a-zàèéìòù]{4}/i.test(a)) nonTradotti.push('[' + attr + '] ' + a.trim());
      }
      n.childNodes.forEach(cammina);
    };
    cammina(document.body);
    return nonTradotti;
  }, dizionario);

  let html = await page.evaluate(() => '<!doctype html>\n' + document.documentElement.outerHTML);
  await b.close();

  // la pagina inglese vive in /en/: le risorse stanno un livello sopra
  html = html.replace(/lang="it"/, 'lang="en"')
             .replace(/src="img\//g, 'src="../img/')
             .replace(/href="img\//g, 'href="../img/')
             .replace(/href="favicon\.svg"/g, 'href="../favicon.svg"')
             .replace(/src="logo-firma\.png"/g, 'src="../logo-firma.png"');

  // Alcuni screenshot mostrano l'interfaccia dell'app stessa (non solo testo
  // del sito): per quelli servono scatti fatti con l'app in inglese, salvati
  // qui accanto con lo stesso nome più "-en". Si sostituiscono ovunque
  // compaiano, incluso il meta og:image (che usa il percorso assoluto dal
  // dominio, non "../img/").
  const screenshotInglesi = {
    '1-calcolo-costi.jpg': '1-calcolo-costi-en.jpg',
    '2-registro-lavori.jpg': '2-registro-lavori-en.jpg',
    '3-catalogo-colori.jpg': '3-catalogo-colori-en.jpg',
  };
  for (const [it_, en_] of Object.entries(screenshotInglesi)) {
    html = html.split(`img/${it_}`).join(`img/${en_}`);
  }

  fs.mkdirSync(`${SCR}/en`, {recursive:true});
  fs.writeFileSync(`${SCR}/en/index.html`, html);
  console.log('pagina inglese generata');
  console.log('testi non tradotti:', rimasti.length);
  rimasti.slice(0, 25).forEach(r => console.log('   ·', r.slice(0,90)));
})();
