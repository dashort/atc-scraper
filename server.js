// server.js (direct form post version)
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
    await page.reload({ waitUntil: 'domcontentloaded' });

    // Grab all form values
    const formData = await page.evaluate(() => {
      const form = document.querySelector('form');
      const data = {};
      new FormData(form).forEach((value, key) => { data[key] = value; });
      return data;
    });

    // Inject user values
    const nameField = Object.keys(formData).find(k => k.startsWith('LastName_'));
    const ssnField = Object.keys(formData).find(k => k.startsWith('Last4SSN_'));
    const dobField = Object.keys(formData).find(k => k.startsWith('DateOfBirth_'));

    if (!nameField || !ssnField || !dobField) {
      throw new Error('Unable to locate input field keys.');
    }

    formData[nameField] = lastName;
    formData[ssnField] = ssn;
    formData[dobField] = dob;

    console.log('Submitting values via POST:', { nameField, ssnField, dobField });

    await page.setRequestInterception(true);
    page.once('request', request => {
      request.continue({
        method: 'POST',
        postData: new URLSearchParams(formData).toString(),
        headers: {
          ...request.headers(),
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });
    });

    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });

    // Wait for content to appear
    await page.waitForFunction(() => {
      const dz = document.querySelector('.datazone');
      return dz && (
        dz.innerText.includes('No issued licenses were found') ||
        dz.innerText.includes('License Number:')
      );
    }, { timeout: 20000 });

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
