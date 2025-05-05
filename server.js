// server.js (enhanced structured result detection with smart wait)
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

    await page.waitForFunction(() => {
      return document.body.innerText.includes("Search for Responsible Vendor Licenses");
    }, { timeout: 10000 });

    const lastNameInput = await page.$('input[name^="LastName_"]');
    const ssnInput = await page.$('input[name^="Last4SSN_"]');
    const dobInput = await page.$('input[name^="DateOfBirth_"]');

    if (!lastNameInput || !ssnInput || !dobInput) {
      throw new Error('One or more input fields not found.');
    }

    await lastNameInput.type(lastName);
    await ssnInput.type(ssn);
    await dobInput.type(dob);

    await page.evaluate(() => {
      document.querySelector('#cphTopBand_ctl03_PerformSearch')?.click();
    });

    // Smart wait for .datazone content to change
    await page.waitForFunction(() => {
      const dz = document.querySelector('.datazone');
      return dz && (dz.innerText.includes('No issued licenses were found') || dz.innerText.includes('RV licenses'));
    }, { timeout: 15000 });

    const html = await page.$eval('.datazone', el => el.innerHTML).catch(() => null);
    const text = await page.$eval('.datazone', el => el.innerText).catch(() => null);

    if (!html) {
      return res.status(200).json({ status: 'error', message: 'No results container found.' });
    }

    if (text.includes('No issued licenses were found')) {
      return res.status(200).json({ status: 'not_found', message: 'No issued licenses were found using your search criteria.' });
    }

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
