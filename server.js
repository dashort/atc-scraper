// server.js (updated with extended waits and network stability handling)
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

    await page.waitForSelector('form');

    // Type values into input fields using wildcards
    await page.evaluate((data) => {
      function findField(keyPart) {
        const inputs = [...document.querySelectorAll('input')];
        const match = inputs.find(input => input.name.includes(keyPart));
        return match?.name || null;
      }

      const nameField = findField('LastName_');
      const ssnField = findField('Last4SSN_');
      const dobField = findField('DateOfBirth_');

      if (!nameField || !ssnField || !dobField) throw new Error('Field selectors not found.');

      document.querySelector(`[name="${nameField}"]`).value = data.lastName;
      document.querySelector(`[name="${ssnField}"]`).value = data.ssn;
      document.querySelector(`[name="${dobField}"]`).value = data.dob;

    }, { lastName, ssn, dob });

    // Click the search button
    await page.evaluate(() => {
      const btn = document.querySelector('a[id*="PerformSearch"]');
      if (!btn) throw new Error('Search button not found.');
      btn.click();
    });

    // Wait for navigation and content update
    await page.waitForTimeout(500);
    await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 });

    await page.waitForFunction(() => {
      const dz = document.querySelector('.datazone');
      return dz && dz.innerText.trim().length > 0;
    }, { timeout: 10000 });

    const text = await page.$eval('.datazone', el => el.innerText).catch(() => null);
    console.log('Datazone contents:', text);

    if (!text) {
      return res.status(200).json({ status: 'error', message: 'No results container found.' });
    }
    if (text.includes('No issued licenses were found')) {
      return res.status(200).json({ status: 'not_found', message: 'No issued licenses were found using your search criteria.' });
    }

    const html = await page.$eval('.datazone', el => el.innerHTML).catch(() => null);
    return res.status(200).json({ status: 'found', html });

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
