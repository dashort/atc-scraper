// server.js (with waitForSelector added)
const express = require('express');
const bodyParser = require('body-parser');
const puppeteer = require('puppeteer-core');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 8080;

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  next();
});

app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.options('*', (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.sendStatus(200);
});

app.get('/', (req, res) => {
  res.send('ATC Scraper with Puppeteer-Core and Chromium is live.');
});

const targetUrl = 'https://laatcabc.atc.la.gov/laatcprod/pub/Default.aspx?PossePresentation=ResponsibleVendorLicenseSearch';

app.post('/search', async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  const { lastName, ssn, dob } = req.body;
  if (!lastName || !ssn || !dob) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }

  let browser;
  try {
    console.log('Launching Puppeteer from:', process.env.PUPPETEER_EXECUTABLE_PATH);

    browser = await puppeteer.launch({
      headless: 'new',
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });

    await page.waitForSelector('input[name="txtServerLastName"]', { timeout: 10000 });
    await page.type('input[name="txtServerLastName"]', lastName);

    await page.waitForSelector('input[name="txtServerSSN"]', { timeout: 10000 });
    await page.type('input[name="txtServerSSN"]', ssn);

    await page.waitForSelector('input[name="txtServerDOB"]', { timeout: 10000 });
    await page.type('input[name="txtServerDOB"]', dob);

    await Promise.all([
      page.click('input[name="btnSearch"]'),
      page.waitForNavigation({ waitUntil: 'domcontentloaded' })
    ]);

    const tableHTML = await page.$eval('#grdResults', el => el.outerHTML).catch(() => null);
    if (!tableHTML) {
      return res.status(200).json({ message: 'No results found or table missing.' });
    }

    res.status(200).send(tableHTML);
  } catch (error) {
    console.error('Puppeteer scraping error:', error);
    res.status(500).json({ error: 'Scraping failed. Try again later.' });
  } finally {
    if (browser) await browser.close();
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
