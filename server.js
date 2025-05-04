// server.js (Puppeteer version with full CORS fix - temporarily allow all origins)
const express = require('express');
const bodyParser = require('body-parser');
const puppeteer = require('puppeteer');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 8080;

// CORS setup - temporarily allow all origins for testing
const corsOptions = {
  origin: true, // Reflect origin header in response
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type']
};

app.use(cors(corsOptions));
app.options('/search', cors(corsOptions)); // Explicit preflight handler

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.get('/', (req, res) => {
  res.send('ATC Scraper with Puppeteer is live.');
});

const targetUrl = 'https://laatcabc.atc.la.gov/laatcprod/pub/Default.aspx?PossePresentation=ResponsibleVendorLicenseSearch';

app.post('/search', async (req, res) => {
  const { lastName, ssn, dob } = req.body;

  if (!lastName || !ssn || !dob) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }

  let browser;

  try {
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });

    await page.type('input[name="txtServerLastName"]', lastName);
    await page.type('input[name="txtServerSSN"]', ssn);
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
