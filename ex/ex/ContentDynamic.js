// Label-driven MCA ADT-1 filler. The MCA page reveals fields conditionally,
// so each answer is applied and allowed to settle before the next is located.
(() => {
    // Guard: popup may re-inject this file via chrome.scripting on tabs that
    // predate the extension. Only register listeners once.
    if (window.__ADT1_FILLER_LOADED__) return;
    window.__ADT1_FILLER_LOADED__ = true;

    let usedControls = new WeakSet();
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
    const normalize = value => String(value || '')
        .toLowerCase()
        .replace(/[＊*•]/g, ' ')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
        .replace(/\s+/g, ' ');

    function isVisible(element) {
        return !!(element && element.getClientRects && element.getClientRects().length &&
            getComputedStyle(element).visibility !== 'hidden' &&
            getComputedStyle(element).display !== 'none');
    }

    function labelText(element) {
        const labels = element.labels ? Array.from(element.labels) : [];
        if (element.id) {
            document.querySelectorAll('label[for="' + CSS.escape(element.id) + '"]').forEach(label => labels.push(label));
        }
        return labels.map(label => label.innerText || label.textContent || '').join(' ');
    }

    function contextFor(element) {
        const bits = [
            labelText(element), element.getAttribute('aria-label'), element.getAttribute('placeholder'),
            element.getAttribute('name'), element.id, element.getAttribute('title')
        ];
        let parent = element.parentElement;
        for (let depth = 0; parent && depth < 5; depth++, parent = parent.parentElement) {
            const text = (parent.innerText || parent.textContent || '').trim();
            if (text && text.length < 500) bits.push(text);
        }
        return normalize(bits.join(' '));
    }

    // hints may be an array OR {include: [...], avoid: [...]}. Avoid tokens
    // heavily penalise: used so that "name of the auditor" never matches
    // "name of the auditors firm" (both substrings).
    function toSpec(hints) {
        if (Array.isArray(hints)) return { include: hints, avoid: [] };
        return { include: hints.include || [], avoid: hints.avoid || [] };
    }

    function scoreContext(context, hints) {
        const spec = toSpec(hints);
        let score = 0;
        for (const hint of spec.include) {
            const term = normalize(hint);
            if (term && context.includes(term)) score += Math.min(12, term.length) + 4;
        }
        for (const bad of spec.avoid) {
            const term = normalize(bad);
            if (term && context.includes(term)) score -= 80;
        }
        return score;
    }

    function controls(selector) {
        return Array.from(document.querySelectorAll(selector)).filter(element =>
            isVisible(element) && !element.disabled && element.type !== 'hidden');
    }

    function findControl(hints, selector) {
        let best = null;
        let bestScore = 0;
        for (const element of controls(selector || 'input:not([type="radio"]):not([type="checkbox"]), select, textarea')) {
            if (usedControls.has(element)) continue;
            const score = scoreContext(contextFor(element), hints);
            if (score > bestScore) {
                best = element;
                bestScore = score;
            }
        }
        return bestScore >= 12 ? best : null;
    }

    // Fallback: find a control by name/id attribute containing any of the tokens.
    // Many MCA fields have the label inside a dialog that normalize can't reach.
    function findControlByAttr(tokens, selector) {
        const sel = selector || 'input:not([type="radio"]):not([type="checkbox"]):not([type="hidden"]), select, textarea';
        for (const element of controls(sel)) {
            if (usedControls.has(element)) continue;
            const bag = (element.name + ' ' + element.id + ' ' + (element.getAttribute('placeholder') || '')).toLowerCase();
            for (const token of tokens) {
                if (token && bag.includes(token.toLowerCase())) return element;
            }
        }
        return null;
    }

    function setNativeValue(element, value) {
        const prototype = element.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype :
            element.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
        const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
        try { element.focus({ preventScroll: true }); } catch (_) {}
        if (descriptor && descriptor.set) descriptor.set.call(element, value);
        else element.value = value;
        element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: String(value) }));
        element.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
        element.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
        element.dispatchEvent(new Event('blur', { bubbles: true }));
    }

    function formatDateForControl(value, control) {
        const match = String(value || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        if (control.type === 'date' && match) return match[3] + '-' + match[2] + '-' + match[1];
        return value;
    }

    // Expand a node's context by walking up a few ancestors, like contextFor does
    // for inputs. The MCA radio group container itself only holds the Yes/No
    // options; the question label ("3(a) *Whether company falls under...") sits
    // in a sibling block above, so we must sweep ancestors to see it.
    function expandedContext(groupNode) {
        // Climb ancestors until the next parent would pull in radios from a
        // sibling question. That gives us the question label block without
        // bleeding every other question's text into the score.
        const ownCount = groupNode.querySelectorAll('input[type="radio"]').length;
        const bits = [groupNode.innerText || groupNode.textContent || ''];
        let parent = groupNode.parentElement;
        for (let depth = 0; parent && depth < 5; depth++, parent = parent.parentElement) {
            const parentCount = parent.querySelectorAll('input[type="radio"]').length;
            if (parentCount > ownCount) break;
            const text = (parent.innerText || parent.textContent || '').trim();
            if (text && text.length < 1500) bits.push(text);
        }
        return normalize(bits.join(' '));
    }

    function findRadioGroup(hints) {
        const radios = controls('input[type="radio"]');
        const groups = new Map();
        for (const radio of radios) {
            let node = radio.parentElement;
            let group = node;
            while (node && node !== document.body) {
                if (node.querySelectorAll('input[type="radio"]').length >= 2) {
                    group = node;
                    break;
                }
                node = node.parentElement;
            }
            if (!groups.has(group)) groups.set(group, []);
            groups.get(group).push(radio);
        }

        let best = null;
        let bestScore = 0;
        for (const [group, members] of groups) {
            const score = scoreContext(expandedContext(group), hints);
            if (score > bestScore) {
                best = members;
                bestScore = score;
            }
        }
        return bestScore >= 12 ? best : null;
    }

    function radioOptionText(radio) {
        const label = labelText(radio) || (radio.closest('label') && radio.closest('label').innerText) || '';
        return normalize(label + ' ' + radio.value);
    }

    async function fillRadio(hints, option) {
        const group = findRadioGroup(hints);
        if (!group) return false;
        const wanted = normalize(option);
        let radio = group.find(item => radioOptionText(item) === wanted || radioOptionText(item).includes(wanted));
        if (!radio && (wanted === 'yes' || wanted === 'no')) {
            radio = group.find(item => normalize(item.value) === wanted || radioOptionText(item).split(' ').includes(wanted));
        }
        if (!radio) return false;
        radio.click();
        radio.checked = true;
        radio.dispatchEvent(new Event('input', { bubbles: true }));
        radio.dispatchEvent(new Event('change', { bubbles: true }));
        usedControls.add(radio);
        await delay(350);
        return true;
    }

    // Per-data-key attribute tokens: if label match fails, try matching by
    // input name/id/placeholder containing any of these.
    const FIELD_ATTRS = {
        firmRegNumber: ['firmreg', 'firmregistration', 'frn'],
        firmName: ['firmname', 'auditorsfirmname'],
        firmPAN: ['firmpan', 'firmincometaxpan'],
        firmAddr1: ['firmaddress1', 'firmaddr1', 'firmaddressline1'],
        firmAddr2: ['firmaddress2', 'firmaddr2', 'firmaddressline2'],
        firmPincode: ['firmpin', 'firmpincode', 'firmzip'],
        firmArea: ['firmarea', 'firmlocality'],
        firmCity: ['firmcity'],
        firmDistrict: ['firmdistrict'],
        firmState: ['firmstate'],
        firmEmail: ['firmemail'],
        membershipNum: ['membership', 'membershipno'],
        auditorName: ['auditorname', 'nameoftheauditor', 'individualauditorname'],
        auditorPAN: ['auditorpan', 'auditorincometaxpan', 'panauditor'],
        auditorAddr1: ['auditoraddress1', 'auditoraddr1', 'auditoraddressline1', 'residentialaddress1'],
        auditorAddr2: ['auditoraddress2', 'auditoraddr2', 'auditoraddressline2', 'residentialaddress2'],
        auditorPincode: ['auditorpin', 'auditorpincode', 'auditorzip'],
        auditorArea: ['auditorarea', 'auditorlocality'],
        auditorCity: ['auditorcity'],
        auditorDistrict: ['auditordistrict'],
        auditorState: ['auditorstate'],
        auditorEmail: ['auditoremail', 'emailauditor'],
        fromDate: ['fromdate', 'periodfrom', 'appointmentfrom'],
        toDate: ['todate', 'periodto', 'appointmentto'],
        finYears: ['financialyears', 'noofyears', 'finyears'],
        appointmentDate: ['appointmentdate', 'dateofappointment'],
        auditorCount: ['noofauditors', 'numberofauditors', 'auditorcount'],
        previousTenure: ['previoustenure', 'tenure'],
        previousYears: ['previousyears', 'previousfinyears'],
        previousSerial: ['previousserial', 'serialno', 'srno'],
        previousFirmReg: ['previousfirmreg', 'previousfrn'],
        previousMembership: ['previousmembership'],
        previousFromDate: ['previousfromdate', 'fystartdate'],
        previousToDate: ['previoustodate', 'fyenddate'],
        natureAppointment: ['natureappointment', 'typeofappointment']
    };

    async function fillField(hints, value, attrKey) {
        if (value === undefined || value === null || String(value).trim() === '') return true;
        let element = findControl(hints);
        if (!element && attrKey && FIELD_ATTRS[attrKey]) element = findControlByAttr(FIELD_ATTRS[attrKey]);
        if (!element) return false;
        const nextValue = formatDateForControl(value, element);
        setNativeValue(element, nextValue);
        usedControls.add(element);
        await delay(120);
        return true;
    }

    async function fillChoice(hints, value) {
        if (!value) return true;
        let element = findControl(hints, 'select');
        if (element) {
            const wanted = normalize(value);
            const option = Array.from(element.options).find(item =>
                normalize(item.textContent) === wanted || normalize(item.textContent).includes(wanted) ||
                normalize(item.value) === wanted);
            if (option) {
                setNativeValue(element, option.value);
                usedControls.add(element);
                await delay(450);
                return true;
            }
        }
        // MCA renders long enum choices (e.g. nature of appointment) as a radio
        // group, not a select. Fall back to radio-group matching before text.
        if (await fillRadio(hints, value)) return true;
        element = findControl(hints, 'input:not([type="radio"]):not([type="checkbox"]), textarea');
        if (!element) return false;
        setNativeValue(element, value);
        usedControls.add(element);
        await delay(350);
        return true;
    }

    async function fillAddress(prefix, data, errors) {
        const firm = prefix === 'firm';
        // Firm block hints REQUIRE "address of the auditors firm". Auditor block
        // hints REQUIRE "address of the auditor" and AVOID "firm" so we never
        // cross-match the firm block when category=individual too.
        const sectionAnchor = firm ? 'address of the auditors firm' : 'address of the auditor';
        // Avoid the firm block when filling auditor's address, but use a specific
        // phrase ("auditors firm") that only appears inside the firm section —
        // bare "firm" leaks into ancestors shared with the firm block above.
        const avoid = firm ? [] : ['address of the auditors firm', 'auditors firm'];
        const spec = suffix => ({ include: [sectionAnchor + ' ' + suffix, sectionAnchor, suffix], avoid });
        const entries = [
            { key: prefix + 'Addr1', hints: spec('address line 1') },
            { key: prefix + 'Addr2', hints: spec('address line 2') },
            { key: prefix + 'Pincode', hints: spec('pin code zip code') }
        ];
        for (const entry of entries) {
            if (!(await fillField(entry.hints, data[entry.key], entry.key)) && data[entry.key]) errors.push(entry.key);
        }

        const pin = data[prefix + 'Pincode'];
        let postal = null;
        if (pin && /^\d{6}$/.test(pin)) postal = await getAreasFromPincode(pin);
        if (postal && postal.success) {
            await waitForAreaOptions(spec('area locality'));
            const area = data[prefix + 'Area'] || postal.areas[0];
            if (area && !(await selectArea(spec('area locality'), area, postal.areas))) errors.push(prefix + 'Area');
            const placeFields = [
                { key: prefix + 'City', hints: spec('city'), fallback: postal.city },
                { key: prefix + 'District', hints: spec('district') },
                { key: prefix + 'State', hints: spec('state ut'), fallback: postal.state }
            ];
            for (const entry of placeFields) {
                const value = data[entry.key] || entry.fallback || '';
                if (value && !(await fillField(entry.hints, value, entry.key))) errors.push(entry.key);
            }
        } else {
            const placeFields = [
                { key: prefix + 'Area', hints: spec('area locality') },
                { key: prefix + 'City', hints: spec('city') },
                { key: prefix + 'District', hints: spec('district') },
                { key: prefix + 'State', hints: spec('state ut') }
            ];
            for (const entry of placeFields) {
                if (data[entry.key] && !(await fillField(entry.hints, data[entry.key], entry.key))) errors.push(entry.key);
            }
        }
        const emailKey = prefix + 'Email';
        if (data[emailKey] && !(await fillField(spec('email id'), data[emailKey], emailKey))) errors.push(emailKey);
    }

    async function waitForAreaOptions(hints) {
        for (let attempt = 0; attempt < 20; attempt++) {
            const select = findControl(hints, 'select');
            if (select && select.options.length > 1) return;
            await delay(250);
        }
    }

    async function selectArea(hints, preferred, postalAreas) {
        const select = findControl(hints, 'select');
        if (!select) return false;
        const options = Array.from(select.options).filter(option => option.value);
        const wanted = normalize(preferred);
        // Prefer the exact area the user picked, then its substring match, then
        // fall back to any post-office name the India Post API returned.
        let option = options.find(item => normalize(item.textContent) === wanted || normalize(item.value) === wanted);
        if (!option && wanted) option = options.find(item => normalize(item.textContent).includes(wanted));
        if (!option) option = options.find(item => postalAreas.some(area => normalize(area) === normalize(item.textContent)));
        if (!option) option = options.find(item => postalAreas.some(area => normalize(item.textContent).includes(normalize(area))));
        if (!option) return false;
        setNativeValue(select, option.value);
        usedControls.add(select);
        await delay(180);
        return true;
    }

    async function getAreasFromPincode(pincode) {
        try {
            const response = await fetch('https://api.postalpincode.in/pincode/' + encodeURIComponent(pincode));
            const data = await response.json();
            if (data[0] && data[0].Status === 'Success' && data[0].PostOffice.length) {
                const first = data[0].PostOffice[0];
                return {
                    success: true,
                    areas: data[0].PostOffice.map(item => item.Name),
                    city: first.District || first.Name,
                    district: first.District,
                    state: first.State
                };
            }
        } catch (error) {
            console.warn('India Post lookup failed:', error.message);
        }
        return { success: false };
    }

    // MCA ADT-1 is a dynamic SPA: fields mount in waves after prior answers.
    // Wait for the form root to appear before touching it.
    async function waitForForm() {
        for (let attempt = 0; attempt < 40; attempt++) {
            const inputs = controls('input:not([type="hidden"]), select, textarea');
            if (inputs.length >= 5) return true;
            await delay(250);
        }
        return false;
    }

    // Resolve after `ms` of no DOM mutations: lets the SPA settle before the next pass.
    function waitForDomQuiet(ms) {
        return new Promise(resolve => {
            let timer = setTimeout(finish, ms);
            const observer = new MutationObserver(() => {
                clearTimeout(timer);
                timer = setTimeout(finish, ms);
            });
            function finish() { observer.disconnect(); resolve(); }
            observer.observe(document.body, { childList: true, subtree: true, attributes: true });
        });
    }

    async function fillOnce(data) {
        const errors = [];
        const choiceFields = [
            { key: 'companyClass', hints: { include: ['class of companies as per section 139', 'section 139 2'], avoid: ['joint', 'twenty companies', 'agm', 'audit committee'] }, radio: true },
            { key: 'natureAppointment', hints: { include: ['nature of appointment'] }, choice: true },
            { key: 'appointedInAGM', hints: { include: ['appointed in the annual general meeting', 'appointed in agm'], avoid: ['joint', 'twenty companies', 'audit committee', 'class of companies'] }, radio: true },
            { key: 'appointmentDate', hints: { include: ['a date of appointment', 'date of appointment dd mm yyyy'], avoid: ['previous'] } },
            { key: 'jointAuditors', hints: { include: ['joint auditors have been appointed', 'joint auditors'], avoid: ['class of companies', 'twenty companies', 'audit committee', 'agm'] }, radio: true },
            { key: 'auditorCount', hints: { include: ['c number of auditor', 'number of auditor s appointed'], avoid: ['previous', 'financial year', 'joint'] } },
            { key: 'category', hints: { include: ['category of auditor', 'auditors firm individual', 'd category'], avoid: ['class of companies', 'twenty companies', 'joint', 'agm', 'audit committee'] }, radio: true }
        ];
        for (const item of choiceFields) {
            const value = data[item.key];
            if (value === undefined || value === null || String(value).trim() === '') continue;
            const ok = item.radio ? await fillRadio(item.hints, value) : item.choice ? await fillChoice(item.hints, value) : await fillField(item.hints, value, item.key);
            if (!ok) errors.push(item.key);
        }

        const regularFields = [
            ['firmRegNumber', { include: ['firm registration number'], avoid: ['previous', 'p firm'] }],
            ['firmName', { include: ['name of the auditors firm'] }],
            ['firmPAN', { include: ['permanent account number of auditors firm', 'income tax permanent account number of auditors firm'] }],
            ['membershipNum', { include: ['membership number of auditor signing the balance sheet', 'g membership number'], avoid: ['previous'] }],
            ['auditorName', { include: ['h name of the auditor', 'name of the auditor'], avoid: ['auditors firm', 'name of the auditors firm'] }],
            ['auditorPAN', { include: ['h i income tax permanent account number of auditor', 'permanent account number of auditor'], avoid: ['auditors firm', 'account number of auditors firm'] }],
            ['fromDate', { include: ['period of account for which appointed', 'from dd mm yyyy'], avoid: ['previous', 'financial year start', 'financial year end', 'to dd mm yyyy'] }],
            ['toDate', { include: ['period of account for which appointed', 'to dd mm yyyy'], avoid: ['previous', 'financial year start', 'financial year end', 'from dd mm yyyy'] }],
            ['finYears', { include: ['number of financial year s to which appointment relates', 'appointment relates'], avoid: ['previous', 'tenure'] }],
            ['previousTenure', { include: ['m specify the tenure of previous appointments', 'tenure of previous'] }],
            ['previousYears', { include: ['n number of financial year'], avoid: ['appointment relates'] }],
            ['previousSerial', { include: ['o s no', 'o serial number'] }],
            ['previousFirmReg', { include: ['p firm registration number'] }],
            ['previousMembership', { include: ['q membership number of auditor'] }],
            ['previousFromDate', { include: ['r financial year start date'] }],
            ['previousToDate', { include: ['s financial year end date'] }]
        ];
        for (const [key, hints] of regularFields) {
            if (data.category === 'individual' && ['firmRegNumber', 'firmName', 'firmPAN'].includes(key)) continue;
            if (data[key] && !(await fillField(hints, data[key], key))) errors.push(key);
        }

        if (data.withinLimit && !(await fillRadio({ include: ['within the limits of twenty companies', 'section 141'], avoid: ['class of companies', 'joint', 'agm', 'audit committee'] }, data.withinLimit))) {
            errors.push('withinLimit');
        }

        if (data.auditCommittee && !(await fillRadio({ include: ['recommendation of the audit committee', 'section 177'], avoid: ['twenty companies', 'joint', 'agm', 'class of companies'] }, data.auditCommittee))) {
            errors.push('auditCommittee');
        }

        if (data.category === 'firm') {
            await fillAddress('firm', data, errors);
        }
        if (data.category === 'individual' || data.category === 'firm') {
            await fillAddress('auditor', data, errors);
        }

        return errors;
    }

    // Orchestrate: wait for form, run multiple passes so conditionally revealed
    // fields get a second chance after their trigger has been answered.
    async function fillADT1(data) {
        const ready = await waitForForm();
        if (!ready) {
            return { success: false, message: 'MCA ADT-1 form not detected. Open the ADT-1 page and reload before clicking Fill.', missingFields: [] };
        }
        let errors = [];
        for (let pass = 0; pass < 3; pass++) {
            usedControls = new WeakSet();
            errors = await fillOnce(data);
            if (!errors.length) break;
            await waitForDomQuiet(400);
        }
        return {
            success: errors.length === 0,
            message: errors.length
                ? 'Filled matching visible fields across ' + 3 + ' passes. Still missing: ' + errors.join(', ') + '. Open those sections on the form and click Fill again.'
                : 'Filled the matching visible ADT-1 fields. Review all conditional answers before submitting.',
            filledFields: Object.keys(data).filter(key => data[key] !== '' && data[key] !== undefined).length,
            missingFields: errors
        };
    }

    // Diagnostic: dump every visible input/select so the user can share the real
    // MCA label/name/id strings when auto-fill misses a field.
    function dumpFields() {
        const list = controls('input:not([type="hidden"]), select, textarea').map(element => ({
            tag: element.tagName,
            type: element.type || '',
            name: element.name || '',
            id: element.id || '',
            placeholder: element.getAttribute('placeholder') || '',
            label: (labelText(element) || '').trim().slice(0, 120),
            context: contextFor(element).slice(0, 160)
        }));
        return { success: true, count: list.length, fields: list };
    }

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'fillFormSmartA' || request.action === 'fillFormOneClickB') {
            fillADT1(request.data || {}).then(sendResponse).catch(error => sendResponse({ success: false, message: error.message }));
            return true;
        }
        if (request.action === 'getAreasByPincode') {
            getAreasFromPincode(request.pincode).then(sendResponse);
            return true;
        }
        if (request.action === 'dumpFields') {
            sendResponse(dumpFields());
            return true;
        }
    });
})();
