/**
 * AddressAutofill.js
 * Automatically fills city, state, and zip fields based on address input.
 *
 * SCRIPT TAG USAGE:
 *   <script
 *     src="address-autofill.js"
 *     data-api-key="YOUR_GOOGLE_MAPS_API_KEY"
 *     data-address="street_address"
 *     data-city="city"
 *     data-state="state"
 *     data-zip="zip_code"
 *   ></script>
 *
 * PROGRAMMATIC USAGE:
 *   const autofill = new AddressAutofill({
 *     apiKey: 'YOUR_GOOGLE_MAPS_API_KEY',
 *     fields: {
 *       address: 'street_address',   // name or id of the address input
 *       city:    'city',
 *       state:   'state',
 *       zip:     'zip_code',
 *     },
 *     debounceDelay: 400,            // ms to wait after typing stops (default: 400)
 *     minChars: 3,                   // min chars before querying (default: 3)
 *     dropdownClass: '',             // extra CSS class on the dropdown container
 *   });
 */

class AddressAutofill {
  /**
   * @param {Object} options
   * @param {string} options.apiKey            - Google Maps API key
   * @param {Object} options.fields            - Map of role → field name/id
   * @param {number} [options.debounceDelay]   - Debounce delay in ms
   * @param {number} [options.minChars]        - Minimum chars before lookup
   * @param {string} [options.dropdownClass]   - Extra class for the dropdown
   */
  constructor(options = {}) {
    this.apiKey = options.apiKey || '';
    this.fields = options.fields || {};
    this.debounceDelay = options.debounceDelay ?? 400;
    this.minChars = options.minChars ?? 3;
    this.dropdownClass = options.dropdownClass || '';

    this._debounceTimer = null;
    this._dropdown = null;
    this._addressEl = null;
    this._autocompleteService = null;
    this._placesService = null;
    this._sessionToken = null;

    this._onInput = this._onInput.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onDocClick = this._onDocClick.bind(this);

    this._loadGoogleMaps().then(() => this._init());
  }

  /* ─────────────────────────────────────────
     Public API
  ───────────────────────────────────────── */

  /** Programmatically destroy the instance and remove all listeners/DOM. */
  destroy() {
    if (this._addressEl) {
      this._addressEl.removeEventListener('input', this._onInput);
      this._addressEl.removeEventListener('keydown', this._onKeyDown);
    }
    document.removeEventListener('click', this._onDocClick);
    this._removeDropdown();
  }

  /* ─────────────────────────────────────────
     Initialisation
  ───────────────────────────────────────── */

  _loadGoogleMaps() {
    return new Promise((resolve, reject) => {
      if (window.google?.maps?.places) {
        resolve();
        return;
      }
      if (!this.apiKey) {
        console.warn('[AddressAutofill] No API key provided. Google Maps will not load.');
        resolve();
        return;
      }

      const callbackName = `__addressAutofillInit_${Date.now()}`;
      window[callbackName] = () => {
        delete window[callbackName];
        resolve();
      };

      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${this.apiKey}&libraries=places&callback=${callbackName}`;
      script.async = true;
      script.defer = true;
      script.onerror = () => reject(new Error('[AddressAutofill] Failed to load Google Maps API.'));
      document.head.appendChild(script);
    });
  }

  _init() {
    if (!window.google?.maps?.places) {
      console.warn('[AddressAutofill] Google Maps Places library not available.');
      return;
    }

    this._autocompleteService = new google.maps.places.AutocompleteService();
    // PlacesService requires a DOM element or map; a hidden div works.
    const dummy = document.createElement('div');
    this._placesService = new google.maps.places.PlacesService(dummy);
    this._sessionToken = new google.maps.places.AutocompleteSessionToken();

    this._addressEl = this._findField(this.fields.address);
    if (!this._addressEl) {
      console.warn('[AddressAutofill] Address field not found:', this.fields.address);
      return;
    }

    this._addressEl.setAttribute('autocomplete', 'off');
    this._addressEl.addEventListener('input', this._onInput);
    this._addressEl.addEventListener('keydown', this._onKeyDown);
    document.addEventListener('click', this._onDocClick);
  }

  /* ─────────────────────────────────────────
     Field lookup — supports input & select
     by name or id attribute
  ───────────────────────────────────────── */

  _findField(nameOrId) {
    if (!nameOrId) return null;
    return (
      document.querySelector(`[name="${nameOrId}"]`) ||
      document.querySelector(`#${CSS.escape(nameOrId)}`)
    );
  }

  _setFieldValue(el, value) {
    if (!el) return;
    if (el.tagName === 'SELECT') {
      // Try to match by value first, then by text content
      const opt = [...el.options].find(
        o => o.value.toLowerCase() === value.toLowerCase() ||
             o.text.toLowerCase() === value.toLowerCase()
      );
      if (opt) el.value = opt.value;
    } else {
      el.value = value;
      // Fire native events so framework bindings (Vue, React, etc.) pick up the change
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  /* ─────────────────────────────────────────
     Debounced input handler
  ───────────────────────────────────────── */

  _onInput() {
    clearTimeout(this._debounceTimer);
    const query = this._addressEl.value.trim();

    if (query.length < this.minChars) {
      this._removeDropdown();
      return;
    }

    this._debounceTimer = setTimeout(() => this._fetchPredictions(query), this.debounceDelay);
  }

  /* ─────────────────────────────────────────
     Google Places predictions
  ───────────────────────────────────────── */

  _fetchPredictions(query) {
    this._autocompleteService.getPlacePredictions(
      {
        input: query,
        sessionToken: this._sessionToken,
        types: ['address'],
        componentRestrictions: { country: 'us' },
      },
      (predictions, status) => {
        if (status !== google.maps.places.PlacesServiceStatus.OK || !predictions?.length) {
          this._removeDropdown();
          return;
        }
        this._showDropdown(predictions);
      }
    );
  }

  _selectPrediction(prediction) {
    this._placesService.getDetails(
      {
        placeId: prediction.place_id,
        fields: ['address_components', 'formatted_address'],
        sessionToken: this._sessionToken,
      },
      (place, status) => {
        if (status !== google.maps.places.PlacesServiceStatus.OK || !place) return;

        // Refresh session token after a selection (billing best practice)
        this._sessionToken = new google.maps.places.AutocompleteSessionToken();

        const parts = this._parseAddressComponents(place.address_components);

        // Fill address field with street number + route only
        const streetAddress = [parts.street_number, parts.route].filter(Boolean).join(' ');
        this._setFieldValue(this._addressEl, streetAddress || place.formatted_address);

        this._setFieldValue(this._findField(this.fields.city),  parts.city);
        this._setFieldValue(this._findField(this.fields.state), parts.state_short);
        this._setFieldValue(this._findField(this.fields.zip),   parts.zip);

        this._removeDropdown();
        // Move focus to the next logical field (city → state → zip)
        const next = this._findField(this.fields.city) ||
                     this._findField(this.fields.state) ||
                     this._findField(this.fields.zip);
        if (next) next.focus();
      }
    );
  }

  _parseAddressComponents(components) {
    const map = {};
    for (const c of components) {
      for (const type of c.types) {
        map[type] = { long: c.long_name, short: c.short_name };
      }
    }
    return {
      street_number: map.street_number?.long || '',
      route:         map.route?.long || '',
      city:          (map.locality || map.sublocality || map.postal_town)?.long || '',
      state_long:    map.administrative_area_level_1?.long || '',
      state_short:   map.administrative_area_level_1?.short || '',
      zip:           map.postal_code?.long || '',
      country:       map.country?.short || '',
    };
  }

  /* ─────────────────────────────────────────
     Dropdown rendering
  ───────────────────────────────────────── */

  _showDropdown(predictions) {
    this._removeDropdown();

    const rect = this._addressEl.getBoundingClientRect();
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    const scrollLeft = window.scrollX || document.documentElement.scrollLeft;

    const dropdown = document.createElement('ul');
    dropdown.className = ['aaf-dropdown', this.dropdownClass].filter(Boolean).join(' ');
    dropdown.setAttribute('role', 'listbox');
    Object.assign(dropdown.style, {
      position: 'absolute',
      top:  `${rect.bottom + scrollTop}px`,
      left: `${rect.left  + scrollLeft}px`,
      width: `${rect.width}px`,
      zIndex: '99999',
      listStyle: 'none',
      margin: '0',
      padding: '0',
    });

    let activeIdx = -1;

    predictions.forEach((pred, idx) => {
      const li = document.createElement('li');
      li.setAttribute('role', 'option');
      li.setAttribute('data-idx', idx);
      li.className = 'aaf-dropdown__item';
      li.innerHTML = this._highlightMatch(pred.description, this._addressEl.value.trim());

      li.addEventListener('mousedown', e => {
        e.preventDefault(); // prevent blur on address field
        this._selectPrediction(pred);
      });
      li.addEventListener('mouseenter', () => {
        [...dropdown.querySelectorAll('.aaf-dropdown__item')].forEach(el =>
          el.classList.remove('aaf-dropdown__item--active')
        );
        li.classList.add('aaf-dropdown__item--active');
        activeIdx = idx;
      });

      dropdown.appendChild(li);
    });

    document.body.appendChild(dropdown);
    this._dropdown = dropdown;
    this._predictions = predictions; // store for keyboard nav

    // Keyboard navigation closure
    this._activeIdx = -1;
    this._dropdownItems = () => [...dropdown.querySelectorAll('.aaf-dropdown__item')];
  }

  _highlightMatch(description, query) {
    const re = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return description.replace(re, '<mark>$1</mark>');
  }

  _removeDropdown() {
    if (this._dropdown) {
      this._dropdown.remove();
      this._dropdown = null;
    }
    this._activeIdx = -1;
    this._predictions = [];
  }

  /* ─────────────────────────────────────────
     Keyboard navigation
  ───────────────────────────────────────── */

  _onKeyDown(e) {
    if (!this._dropdown) return;
    const items = this._dropdownItems?.() ?? [];
    if (!items.length) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        this._activeIdx = Math.min(this._activeIdx + 1, items.length - 1);
        this._highlightItem(items);
        break;
      case 'ArrowUp':
        e.preventDefault();
        this._activeIdx = Math.max(this._activeIdx - 1, 0);
        this._highlightItem(items);
        break;
      case 'Enter':
        if (this._activeIdx >= 0 && this._predictions[this._activeIdx]) {
          e.preventDefault();
          this._selectPrediction(this._predictions[this._activeIdx]);
        }
        break;
      case 'Escape':
        this._removeDropdown();
        break;
    }
  }

  _highlightItem(items) {
    items.forEach((el, i) => {
      el.classList.toggle('aaf-dropdown__item--active', i === this._activeIdx);
    });
    items[this._activeIdx]?.scrollIntoView({ block: 'nearest' });
  }

  /* ─────────────────────────────────────────
     Click-outside to close
  ───────────────────────────────────────── */

  _onDocClick(e) {
    if (this._dropdown && !this._dropdown.contains(e.target) && e.target !== this._addressEl) {
      this._removeDropdown();
    }
  }
}

/* ─────────────────────────────────────────────────────────────────
   Default stylesheet injected once
───────────────────────────────────────────────────────────────── */

(function injectStyles() {
  if (document.getElementById('aaf-styles')) return;
  const style = document.createElement('style');
  style.id = 'aaf-styles';
  style.textContent = `
    .aaf-dropdown {
      background: #fff;
      border: 1px solid #d1d5db;
      border-radius: 8px;
      box-shadow: 0 8px 24px rgba(0,0,0,.12);
      max-height: 260px;
      overflow-y: auto;
      font-family: inherit;
      font-size: 0.9rem;
    }
    .aaf-dropdown__item {
      padding: 10px 14px;
      cursor: pointer;
      line-height: 1.4;
      color: #1f2937;
      border-bottom: 1px solid #f3f4f6;
      transition: background 0.12s;
    }
    .aaf-dropdown__item:last-child { border-bottom: none; }
    .aaf-dropdown__item:hover,
    .aaf-dropdown__item--active {
      background: #f0f4ff;
      color: #1d4ed8;
    }
    .aaf-dropdown__item mark {
      background: none;
      font-weight: 700;
      color: #1d4ed8;
    }
  `;
  document.head.appendChild(style);
})();

/* ─────────────────────────────────────────────────────────────────
   Auto-init from script tag data attributes
   Usage:
     <script src="address-autofill.js"
       data-api-key="..."
       data-address="street"
       data-city="city"
       data-state="state"
       data-zip="zip">
     </script>
───────────────────────────────────────────────────────────────── */

(function autoInit() {
  const scripts = document.querySelectorAll('script[src*="address-autofill"]');
  const tag = [...scripts].find(s => s.dataset.address || s.dataset.city);
  if (!tag) return; // no data attributes → skip auto-init

  const run = () => {
    new AddressAutofill({
      apiKey: tag.dataset.apiKey || '',
      debounceDelay: Number(tag.dataset.debounce) || 400,
      minChars: Number(tag.dataset.minChars) || 3,
      fields: {
        address: tag.dataset.address || '',
        city:    tag.dataset.city    || '',
        state:   tag.dataset.state   || '',
        zip:     tag.dataset.zip     || '',
      },
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();
