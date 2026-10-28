# AOC-4 Auto Filler

Chrome Extension that extracts data from a PDF and auto-fills the MCA AOC-4 form.

## Install

1. Download **PDF.js** build (two files) from https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/
   - `pdf.min.js`
   - `pdf.worker.min.js`
   Put both in `aoc4-autofiller/libs/`.
2. Open `chrome://extensions/`.
3. Toggle **Developer mode** on.
4. Click **Load unpacked** and pick the `aoc4-autofiller/` folder.

## Use

1. Open the AOC-4 page on `www.mca.gov.in`.
2. Click the extension icon.
3. **Main** tab: pick the PDF, click **Extract Data**, review, click **Confirm & Fill**.
4. **Settings**: save default CIN / email.
5. **Logs**: last 100 actions.

## Files

```
aoc4-autofiller/
  manifest.json
  popup.html
  popup.js
  content_script.js
  background.js
  css/styles.css
  js/
    pdf-extractor.js
    field-mapper.js
    validator.js
    storage.js
  data/field-mappings.json
  libs/ (you add pdf.min.js + pdf.worker.min.js)
```

## Notes

- Patterns in `js/field-mapper.js` are regex-based. Tune `pattern:` strings to your real PDF layout.
- Form selectors assume `aria-label` text on MCA inputs. If MCA updates markup, update `selector:`.
- Values go through the React/Angular-safe native setter, so inputs register the change.
- Auto-submit is **off** by default. Verify fields before enabling it.
- No PII is sent off-device. Chrome `storage.local` only.

## Debug

- Right-click the popup → **Inspect** for popup logs.
- On the MCA tab, DevTools console shows content-script errors.
- `chrome://extensions/` → **service worker** opens background logs.
