// server.js (wait for label text, then log inputs again)
const express = require('express');
const bodyParser = require('body-parser');
const puppeteer = require('puppeteer-core');
const cors = require('cors');
const fs = require('fs');

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

    // Wait for a visible label to confirm JS-rendered content
    await page.waitForFunction(() => {
      return document.body.innerText.includes("Search for Responsible Vendor Licenses");
    }, { timeout: 10000 });

    // Take screenshot and HTML
    const pageContent = await page.content();
    console.log('PAGE HTML:\n', pageContent);
    await page.screenshot({ path: 'debug-screenshot.png', fullPage: true });

    // Re-log input fields after JS content is loaded
    const allInputs = await page.$$eval('input', els => els.map(el => el.name));
    console.log('INPUT NAMES FOUND (after load):', allInputs);

    res.status(200).json({ message: 'Inputs logged. Check logs for field names.' });
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
