// server.js
const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const bodyParser = require('body-parser');
const qs = require('qs');
const { CookieJar } = require('tough-cookie');
const { default: axiosCookieJarSupport } = require('axios-cookiejar-support');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Allow CORS for frontend testing
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});

// Health check route
app.get('/', (req, res) => {
  res.send('ATC Scraper is live.');
});

const targetUrl = 'https://laatcabc.atc.la.gov/laatcprod/pub/Default.aspx?PossePresentation=ResponsibleVendorLicenseSearch';

app.post('/search', async (req, res) => {
  const { lastName, ssn, dob } = req.body;

  try {
    const jar = new CookieJar();
    const client = axios.create({ jar });
    axiosCookieJarSupport(client);

    // Initial GET request to fetch __VIEWSTATE and other hidden fields
    const initialRes = await client.get(targetUrl);
    const $ = cheerio.load(initialRes.data);

    const viewstate = $('#__VIEWSTATE').val();
    const viewstateGenerator = $('#__VIEWSTATEGENERATOR').val();
    const eventValidation = $('#__EVENTVALIDATION').val();

    const formData = {
      '__VIEWSTATE': viewstate,
      '__VIEWSTATEGENERATOR': viewstateGenerator,
      '__EVENTVALIDATION': eventValidation,
      '__EVENTTARGET': '',
      '__EVENTARGUMENT': '',
      'SearchBy': 'Server',
      'txtServerLastName': lastName,
      'txtServerSSN': ssn,
      'txtServerDOB': dob,
      'btnSearch': 'Search'
    };

    // POST request to submit the search
    const response = await client.post(targetUrl, qs.stringify(formData), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    const $$ = cheerio.load(response.data);
    const resultsTable = $$('#grdResults').html();

    if (!resultsTable) {
      console.log('Raw HTML output for debugging:', response.data);
      return res.status(200).json({ message: 'No results found or parsing failed.' });
    }

    res.status(200).send(resultsTable);
  } catch (error) {
    console.error('Error during scraping:', error);
    res.status(500).json({ error: 'Scraping failed. Try again later.' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
