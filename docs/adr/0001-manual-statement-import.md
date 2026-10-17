# Manual Batch Statement Import Over Automated Scraping

Although Israeli credit card providers (Isracard and American Express) can be queried via automated browser scrapers, the household reviews expenses once a month. We decided to ingest Statements via manual batch upload of exported files (`.xls`, `.xlsx`, `.csv`) into a local-first database rather than integrating automated scrapers, eliminating credential storage risk, 2FA/OTP friction across multiple Cardholders, and breakage when provider portals change.
