# AddressAutofill.js

An ES6 class that auto-fills city, state, and zip fields as a user types a street address. Uses the Google Maps Places API to show a suggestion dropdown, and works with both `<input>` and `<select>` field types.

---

## Requirements

- A Google Maps API key with the **Maps JavaScript API** and **Places API** enabled.
- [Get an API key →](https://developers.google.com/maps/documentation/javascript/get-api-key)

---

## Usage

### Option 1 — Script tag (zero JavaScript required)

Include the script with `data-*` attributes that map to your field `name` or `id` values:

```html
<script
  src="address-autofill.js"
  data-api-key="YOUR_GOOGLE_MAPS_API_KEY"
  data-scope="#my-form"
  data-address="street_address"
  data-city="city"
  data-state="state"
  data-zip="zip_code">
</script>
```

### Option 2 — Programmatic

```js
new AddressAutofill({
  apiKey: 'YOUR_GOOGLE_MAPS_API_KEY',
  scope: '#my-form',
  fields: {
    address: 'street_address',
    city:    'city',
    state:   'state',
    zip:     'zip_code',
  },
});
```

Fields are matched by `name` attribute first, then `id`. Works with any combination of `<input>` and `<select>` elements.

---

## Options

| Option | Type | Default | Description |
|---|---|---|---|
| `apiKey` | string | `''` | Google Maps API key |
| `fields.address` | string | — | `name` or `id` of the street address field |
| `fields.city` | string | — | `name` or `id` of the city field |
| `fields.state` | string | — | `name` or `id` of the state field (input or select) |
| `fields.zip` | string | — | `name` or `id` of the zip code field |
| `scope` | string \| Element | `document` | CSS selector or DOM element to search within. **Recommended when multiple forms appear on the same page.** |
| `debounceDelay` | number | `400` | Milliseconds to wait after the user stops typing before querying the API |
| `minChars` | number | `3` | Minimum characters typed before a lookup is triggered |
| `dropdownClass` | string | `''` | Extra CSS class added to the dropdown `<ul>` element |

### Script tag equivalents

| `data-` attribute | Corresponds to |
|---|---|
| `data-api-key` | `apiKey` |
| `data-scope` | `scope` |
| `data-address` | `fields.address` |
| `data-city` | `fields.city` |
| `data-state` | `fields.state` |
| `data-zip` | `fields.zip` |
| `data-debounce` | `debounceDelay` |
| `data-min-chars` | `minChars` |

---

## State field — input or select

The state field can be either an `<input>` or a `<select>`. When it is a select, the script tries to match the returned state against option `value` and visible `text`, and supports both abbreviations (`CA`) and full names (`California`):

```html
<!-- All of these will match correctly -->
<option value="CA">CA</option>
<option value="CA">California</option>
<option value="California">California</option>
```

---

## Multiple forms on one page

When more than one form appears on the same page, always set `scope` to avoid fields from different forms conflicting with each other:

```js
new AddressAutofill({
  apiKey: 'YOUR_KEY',
  scope: '#billing-form',
  fields: { address: 'street', city: 'city', state: 'state', zip: 'zip' },
});

new AddressAutofill({
  apiKey: 'YOUR_KEY',
  scope: '#shipping-form',
  fields: { address: 'street', city: 'city', state: 'state', zip: 'zip' },
});
```

---

## Dropdown interaction

- **Mouse** — click a suggestion to fill the fields.
- **Keyboard** — `↑` / `↓` to navigate, `Enter` to select, `Escape` to close.
- **Click outside** — closes the dropdown.

---

## Styling the dropdown

The script injects a small default stylesheet automatically. Override any of these classes to customise the appearance:

```css
.aaf-dropdown               /* the <ul> container */
.aaf-dropdown__item         /* each suggestion row */
.aaf-dropdown__item--active /* the currently highlighted row */
.aaf-dropdown__item mark    /* the matched portion of text */
```

Or pass `dropdownClass: 'my-class'` to add an extra class to the container.

---

## Lifecycle

Each instance exposes a `destroy()` method that removes all event listeners and the dropdown from the DOM. Useful in single-page applications when a form is unmounted:

```js
const autofill = new AddressAutofill({ /* ... */ });

// Later:
autofill.destroy();
```

---

## Troubleshooting

**`RefererNotAllowedMapError`** — Your API key has HTTP referrer restrictions set. Either add your domain to the allowlist in Google Cloud Console, or switch to API-level restrictions (Maps JS API + Places API only) instead of referrer restrictions.

**CORS error on `maps.googleapis.com`** — Your server's Content Security Policy is blocking Google Maps. Add the following domains to your CSP headers: `maps.googleapis.com`, `maps.gstatic.com`, and `*.ggpht.com` (for Street View thumbnails).

**Dropdown doesn't appear** — Check that the `data-api-key` / `apiKey` option is set, and that the Places API is enabled for the key in Google Cloud Console.

**State select not filling** — Ensure the select option values or text match either the two-letter abbreviation (`CA`) or the full state name (`California`). Both formats are tried automatically.

**Two forms interfering with each other** — Set `scope` to a CSS selector that uniquely identifies each form's container element.
