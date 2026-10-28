// ============================================================
// MCA ADT-1 AUTO-FILLER PRO - POPUP LOGIC
// Supports Version A (Smart Auto-Fill) & Version B (One-Click)
// ============================================================

// Version switching
document.querySelectorAll('.version-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const version = btn.getAttribute('data-version');

        document.querySelectorAll('.version-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.version-content').forEach(c => c.classList.remove('active'));

        btn.classList.add('active');
        document.getElementById(`version-${version}`).classList.add('active');
    });
});

// Tab switching for Version A
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));

        btn.classList.add('active');
        document.getElementById(btn.getAttribute('data-tab')).classList.add('active');
    });
});

// Pincode lookup -> populate matching area dropdown + city/state inputs.
// User picks the correct area because 1 pincode can map to many post offices.
async function fetchPincode(pin) {
    if (!/^\d{6}$/.test(pin)) return null;
    try {
        const response = await fetch('https://api.postalpincode.in/pincode/' + encodeURIComponent(pin));
        const data = await response.json();
        if (data[0] && data[0].Status === 'Success' && data[0].PostOffice.length) {
            const first = data[0].PostOffice[0];
            return {
                areas: data[0].PostOffice.map(item => item.Name),
                city: first.District || first.Name,
                state: first.State
            };
        }
    } catch (error) {
        console.warn('Pincode lookup failed:', error.message);
    }
    return null;
}

function populateAreaSelect(selectEl, areas, prevValue) {
    if (!selectEl) return;
    selectEl.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = areas.length ? '-- Select the correct area --' : '-- No areas found --';
    selectEl.appendChild(placeholder);
    areas.forEach(area => {
        const option = document.createElement('option');
        option.value = area;
        option.textContent = area;
        selectEl.appendChild(option);
    });
    if (prevValue && areas.includes(prevValue)) selectEl.value = prevValue;
}

function wirePincode(pincodeId, areaId, cityId, stateId, statusVersion) {
    const pincodeEl = document.getElementById(pincodeId);
    const areaEl = document.getElementById(areaId);
    const cityEl = cityId ? document.getElementById(cityId) : null;
    const stateEl = stateId ? document.getElementById(stateId) : null;
    if (!pincodeEl) return;
    const run = async () => {
        const pin = pincodeEl.value.trim();
        if (!/^\d{6}$/.test(pin)) return;
        showStatus(statusVersion, 'Looking up pincode ' + pin + '...', 'info', 0);
        const result = await fetchPincode(pin);
        if (!result) {
            showStatus(statusVersion, 'Pincode ' + pin + ' not found. Enter area manually.', 'error', 4000);
            return;
        }
        populateAreaSelect(areaEl, result.areas, areaEl ? areaEl.value : '');
        if (cityEl && !cityEl.value) cityEl.value = result.city;
        if (stateEl && !stateEl.value) stateEl.value = result.state;
        showStatus(statusVersion, result.areas.length + ' area(s) loaded. Pick the correct one.', 'success', 3000);
    };
    pincodeEl.addEventListener('blur', run);
    pincodeEl.addEventListener('change', run);
}

// Status message helper
function showStatus(version, message, type = 'info', duration = 3000) {
    const statusEl = version === 'a' ?
        document.getElementById('status') :
        document.getElementById('statusB');

    statusEl.textContent = message;
    statusEl.className = `status show ${type}`;

    if (duration > 0) {
        setTimeout(() => {
            statusEl.classList.remove('show');
        }, duration);
    }
}

function saveFormData(key, data) {
    const profile = key === 'adtFormDataA' ? 'A' : key === 'adtFormDataB' ? 'B' : null;
    if (!profile) return Promise.reject(new Error('Unknown profile.'));
    return ADT1Backend.saveProfile(profile, data);
}

// ============================================================
// VERSION A: Smart Auto-Fill Functions
// ============================================================

function getFormDataA() {
    const selected = name => document.querySelector('input[name="' + name + '"]:checked')?.value || '';
    return {
        category: selected('category'),
        firmRegNumber: document.getElementById('firmRegNumber').value,
        firmName: document.getElementById('firmName').value,
        firmPAN: document.getElementById('firmPAN').value,
        firmAddr1: document.getElementById('firmAddr1').value,
        firmAddr2: document.getElementById('firmAddr2').value,
        firmPincode: document.getElementById('firmPincode').value,
        firmArea: document.getElementById('firmArea').value,
        firmCity: document.getElementById('firmCity').value,
        firmDistrict: document.getElementById('firmDistrict').value,
        firmState: document.getElementById('firmState').value,
        firmEmail: document.getElementById('firmEmail').value,
        membershipNum: document.getElementById('membershipNum').value,
        auditorName: document.getElementById('auditorName').value,
        auditorPAN: document.getElementById('auditorPAN').value,
        auditorAddr1: document.getElementById('auditorAddr1').value,
        auditorAddr2: document.getElementById('auditorAddr2').value,
        auditorPincode: document.getElementById('auditorPincode').value,
        auditorArea: document.getElementById('auditorArea').value,
        auditorCity: document.getElementById('auditorCity').value,
        auditorDistrict: document.getElementById('auditorDistrict').value,
        auditorState: document.getElementById('auditorState').value,
        auditorEmail: document.getElementById('auditorEmail').value,
        fromDate: document.getElementById('fromDate').value,
        toDate: document.getElementById('toDate').value,
        finYears: document.getElementById('finYears').value,
        withinLimit: selected('withinLimit'),
        withinYear: selected('withinYear'),
        remuneration: selected('remuneration'),
        companyClass: selected('companyClass'),
        natureAppointment: document.getElementById('natureAppointment').value,
        appointedInAGM: selected('appointedInAGM'),
        appointmentDate: document.getElementById('appointmentDate').value,
        jointAuditors: selected('jointAuditors'),
        auditorCount: document.getElementById('auditorCount').value,
        previousTenure: document.getElementById('previousTenure').value,
        previousYears: document.getElementById('previousYears').value,
        previousSerial: document.getElementById('previousSerial').value,
        previousFirmReg: document.getElementById('previousFirmReg').value,
        previousMembership: document.getElementById('previousMembership').value,
        previousFromDate: document.getElementById('previousFromDate').value,
        previousToDate: document.getElementById('previousToDate').value,
        auditCommittee: selected('auditCommittee')
    };
}

// Version A: Save data
document.getElementById('saveDataA').addEventListener('click', async () => {
    const data = getFormDataA();
    try {
        await saveFormData('adtFormDataA', data);
        showStatus('a', '✅ Version A: Data saved on this browser!', 'success');
    } catch (error) {
        showStatus('a', `❌ Could not save data: ${error.message}`, 'error');
    }
});

// Version A: Fill form
document.getElementById('fillFormA').addEventListener('click', async () => {
    showStatus('a', '💾 Saving data locally...', 'info', 0);

    const data = getFormDataA();

    const required = [data.natureAppointment, data.appointmentDate, data.auditorCount, data.fromDate,
        data.toDate, data.finYears, data.auditorName, data.auditorPAN, data.auditorAddr1,
        data.auditorPincode, data.auditorEmail];
    if (data.category === 'firm') required.push(data.firmName, data.firmPAN, data.firmAddr1,
        data.firmPincode, data.firmEmail, data.membershipNum);
    if (required.some(value => !value)) {
        showStatus('a', '❌ Complete the required appointment, auditor, address, and period fields first.', 'error');
        return;
    }

    try {
        await saveFormData('adtFormDataA', data);
        showStatus('a', '✅ Data saved locally. Smart Auto-Fill starting...', 'info', 0);
        const response = await sendFillToMCA(data, 'fillFormSmartA');
        if (response && response.success) {
            showStatus('a', response.message, 'success', 5000);
        } else {
            showStatus('a', `❌ ${response ? response.message : 'Fill failed.'}`, 'error');
        }
    } catch (error) {
        showStatus('a', `❌ Error: ${error.message}`, 'error');
    }
});

// Version A: Clear
document.getElementById('clearFormA').addEventListener('click', () => {
    if (confirm('Clear all data?')) {
        document.querySelectorAll('#version-a input[type="text"], #version-a input[type="email"], #version-a input[type="number"], #version-a select').forEach(field => {
            field.value = '';
        });
        ADT1Backend.clearProfile('A').then(() => {
            showStatus('a', '✅ Data cleared!', 'success');
        }).catch(error => {
            showStatus('a', `❌ Could not clear data: ${error.message}`, 'error');
        });
    }
});

// Load Version A data
ADT1Backend.getProfile('A').then(({ data }) => {
    if (data) {
        document.getElementById('firmRegNumber').value = data.firmRegNumber || '';
        document.getElementById('firmName').value = data.firmName || '';
        document.getElementById('firmPAN').value = data.firmPAN || '';
        document.getElementById('firmAddr1').value = data.firmAddr1 || '';
        document.getElementById('firmAddr2').value = data.firmAddr2 || '';
        document.getElementById('firmPincode').value = data.firmPincode || '';
        document.getElementById('firmArea').value = data.firmArea || '';
        document.getElementById('firmCity').value = data.firmCity || '';
        document.getElementById('firmDistrict').value = data.firmDistrict || '';
        document.getElementById('firmState').value = data.firmState || '';
        document.getElementById('firmEmail').value = data.firmEmail || '';
        document.getElementById('membershipNum').value = data.membershipNum || '';

        document.getElementById('auditorName').value = data.auditorName || '';
        document.getElementById('auditorPAN').value = data.auditorPAN || '';
        document.getElementById('auditorAddr1').value = data.auditorAddr1 || '';
        document.getElementById('auditorAddr2').value = data.auditorAddr2 || '';
        document.getElementById('auditorPincode').value = data.auditorPincode || '';
        document.getElementById('auditorArea').value = data.auditorArea || '';
        document.getElementById('auditorCity').value = data.auditorCity || '';
        document.getElementById('auditorDistrict').value = data.auditorDistrict || '';
        document.getElementById('auditorState').value = data.auditorState || '';
        document.getElementById('auditorEmail').value = data.auditorEmail || '';

        document.getElementById('fromDate').value = data.fromDate || '';
        document.getElementById('toDate').value = data.toDate || '';
        document.getElementById('finYears').value = data.finYears || '';

        document.getElementById('natureAppointment').value = data.natureAppointment || '';
        document.getElementById('appointmentDate').value = data.appointmentDate || '';
        document.getElementById('auditorCount').value = data.auditorCount || '';
        document.getElementById('previousTenure').value = data.previousTenure || '';
        document.getElementById('previousYears').value = data.previousYears || '';
        document.getElementById('previousSerial').value = data.previousSerial || '1';
        document.getElementById('previousFirmReg').value = data.previousFirmReg || '';
        document.getElementById('previousMembership').value = data.previousMembership || '';
        document.getElementById('previousFromDate').value = data.previousFromDate || '';
        document.getElementById('previousToDate').value = data.previousToDate || '';

        const setRadio = (name, value) => {
            const radio = Array.from(document.querySelectorAll('input[name="' + name + '"]')).find(item => item.value === value);
            if (radio) radio.checked = true;
        };
        ['category', 'withinLimit', 'withinYear', 'remuneration', 'companyClass', 'appointedInAGM', 'jointAuditors', 'auditCommittee']
            .forEach(name => setRadio(name, data[name]));
        restoreAreaFromPincode('firmPincode', 'firmArea', data.firmArea, 'firmCity', 'firmState');
        restoreAreaFromPincode('auditorPincode', 'auditorArea', data.auditorArea, 'auditorCity', 'auditorState');
    }
}).catch(error => showStatus('a', `❌ Could not load saved data: ${error.message}`, 'error', 0));

// ============================================================
// VERSION B: One-Click Ultra-Automation Functions
// ============================================================

// Category toggle for Version B
document.querySelectorAll('input[name="categoryB"]').forEach(radio => {
    radio.addEventListener('change', () => {
        const firmSection = document.getElementById('firmSectionB');
        const auditorSection = document.getElementById('auditorSectionB');

        firmSection.style.display = radio.value === 'firm' ? 'block' : 'none';
        auditorSection.style.display = 'block';
    });
});

function getFormDataB() {
    const category = document.querySelector('input[name="categoryB"]:checked').value;
    const selected = name => document.querySelector('input[name="' + name + '"]:checked')?.value || '';
    return {
        category,
        firmName: document.getElementById('firmNameB').value,
        firmPAN: document.getElementById('firmPANB').value,
        firmRegNumber: document.getElementById('firmRegB').value,
        firmAddr1: document.getElementById('firmAddr1B').value,
        firmAddr2: document.getElementById('firmAddr2B').value,
        firmPincode: document.getElementById('firmPincodeB').value,
        firmEmail: document.getElementById('firmEmailB').value,
        firmArea: document.getElementById('firmAreaB') ? document.getElementById('firmAreaB').value : '',
        firmCity: document.getElementById('firmCityB') ? document.getElementById('firmCityB').value : '',
        firmDistrict: '',
        firmState: document.getElementById('firmStateB') ? document.getElementById('firmStateB').value : '',
        auditorName: document.getElementById('auditorNameB').value,
        auditorPAN: document.getElementById('auditorPANB').value,
        auditorAddr1: document.getElementById('auditorAddr1B').value,
        auditorAddr2: document.getElementById('auditorAddr2B').value,
        auditorPincode: document.getElementById('auditorPincodeB').value,
        auditorEmail: document.getElementById('auditorEmailB').value,
        auditorArea: document.getElementById('auditorAreaB') ? document.getElementById('auditorAreaB').value : '',
        auditorCity: document.getElementById('auditorCityB') ? document.getElementById('auditorCityB').value : '',
        auditorDistrict: '',
        auditorState: document.getElementById('auditorStateB') ? document.getElementById('auditorStateB').value : '',
        membershipNum: document.getElementById('membershipB').value,
        fromDate: document.getElementById('fromDateB').value,
        toDate: document.getElementById('toDateB').value,
        finYears: document.getElementById('finYearsB').value,
        companyClass: selected('companyClassB'),
        natureAppointment: document.getElementById('natureAppointmentB').value,
        appointedInAGM: selected('appointedInAGMB'),
        appointmentDate: document.getElementById('appointmentDateB').value,
        jointAuditors: selected('jointAuditorsB'),
        auditorCount: document.getElementById('auditorCountB').value,
        previousTenure: document.getElementById('previousTenureB').value,
        previousYears: document.getElementById('previousYearsB').value,
        previousSerial: document.getElementById('previousSerialB').value,
        previousFirmReg: document.getElementById('previousFirmRegB').value,
        previousMembership: document.getElementById('previousMembershipB').value,
        previousFromDate: document.getElementById('previousFromDateB').value,
        previousToDate: document.getElementById('previousToDateB').value,
        auditCommittee: selected('auditCommitteeB')
    };
}

// Version B: Save defaults
document.getElementById('saveDefaultsB').addEventListener('click', async () => {
    const data = getFormDataB();

    if (!data.firmName && data.category === 'firm') {
        showStatus('b', '❌ Please fill required fields', 'error');
        return;
    }

    try {
        await saveFormData('adtFormDataB', data);
        showStatus('b', '🎯 Defaults saved on this browser! Ready for one-click filling.', 'success');
    } catch (error) {
        showStatus('b', `❌ Could not save defaults: ${error.message}`, 'error');
    }
});

// Version B: One-click fill
document.getElementById('oneClickB').addEventListener('click', async () => {
    showStatus('b', '💾 Saving data locally...', 'info', 0);

    const data = getFormDataB();

    // Quick validation
    const requiredFields = [data.natureAppointment, data.appointmentDate, data.auditorCount,
        data.fromDate, data.toDate, data.finYears, data.auditorName, data.auditorPAN,
        data.auditorAddr1, data.auditorPincode, data.auditorEmail];
    if (data.category === 'firm') requiredFields.push(data.firmName, data.firmPAN, data.firmAddr1,
        data.firmPincode, data.firmEmail, data.membershipNum);

    if (requiredFields.some(f => !f)) {
        showStatus('b', '❌ Complete the required appointment, auditor, address, and period fields first.', 'error');
        return;
    }

    try {
        await saveFormData('adtFormDataB', data);
        showStatus('b', '✅ Defaults saved locally. One-click filling...', 'info', 0);
        const response = await sendFillToMCA(data, 'fillFormOneClickB');
        if (response && response.success) {
            showStatus('b', response.message, 'success', 6000);
        } else {
            showStatus('b', `❌ ${response ? response.message : 'Fill failed.'}`, 'error');
        }
    } catch (error) {
        showStatus('b', `❌ Error: ${error.message}`, 'error');
    }
});

// Version B: Clear defaults
document.getElementById('clearDefaultsB').addEventListener('click', () => {
    if (confirm('Clear all defaults?')) {
        document.querySelectorAll('#version-b input[type="text"], #version-b input[type="email"], #version-b input[type="number"], #version-b select').forEach(field => {
            field.value = '';
        });
        ADT1Backend.clearProfile('B').then(() => {
            showStatus('b', '✅ Defaults cleared!', 'success');
        }).catch(error => {
            showStatus('b', `❌ Could not clear defaults: ${error.message}`, 'error');
        });
    }
});

// Load Version B data
ADT1Backend.getProfile('B').then(({ data }) => {
    if (data) {

        if (data.category === 'firm') {
            document.querySelector('input[name="categoryB"][value="firm"]').checked = true;
            document.getElementById('firmSectionB').style.display = 'block';
        } else {
            document.querySelector('input[name="categoryB"][value="individual"]').checked = true;
            document.getElementById('firmSectionB').style.display = 'none';
        }

        document.getElementById('auditorSectionB').style.display = 'block';
        document.getElementById('firmNameB').value = data.firmName || '';
        document.getElementById('firmPANB').value = data.firmPAN || '';
        document.getElementById('firmRegB').value = data.firmRegNumber || '';
        document.getElementById('firmAddr1B').value = data.firmAddr1 || '';
        document.getElementById('firmAddr2B').value = data.firmAddr2 || '';
        document.getElementById('firmPincodeB').value = data.firmPincode || '';
        document.getElementById('firmEmailB').value = data.firmEmail || '';
        document.getElementById('membershipB').value = data.membershipNum || '';
        document.getElementById('auditorNameB').value = data.auditorName || '';
        document.getElementById('auditorPANB').value = data.auditorPAN || '';
        document.getElementById('auditorAddr1B').value = data.auditorAddr1 || '';
        document.getElementById('auditorAddr2B').value = data.auditorAddr2 || '';
        document.getElementById('auditorPincodeB').value = data.auditorPincode || '';
        document.getElementById('auditorEmailB').value = data.auditorEmail || '';

        document.getElementById('fromDateB').value = data.fromDate || '';
        document.getElementById('toDateB').value = data.toDate || '';
        document.getElementById('finYearsB').value = data.finYears || '';
        document.getElementById('natureAppointmentB').value = data.natureAppointment || '';
        document.getElementById('appointmentDateB').value = data.appointmentDate || '';
        document.getElementById('auditorCountB').value = data.auditorCount || '';
        document.getElementById('previousTenureB').value = data.previousTenure || '';
        document.getElementById('previousYearsB').value = data.previousYears || '';
        document.getElementById('previousSerialB').value = data.previousSerial || '1';
        document.getElementById('previousFirmRegB').value = data.previousFirmReg || '';
        document.getElementById('previousMembershipB').value = data.previousMembership || '';
        document.getElementById('previousFromDateB').value = data.previousFromDate || '';
        document.getElementById('previousToDateB').value = data.previousToDate || '';
        const setRadioB = (name, value) => {
            const radio = Array.from(document.querySelectorAll('input[name="' + name + '"]')).find(item => item.value === value);
            if (radio) radio.checked = true;
        };
        setRadioB('companyClassB', data.companyClass);
        setRadioB('appointedInAGMB', data.appointedInAGM);
        setRadioB('jointAuditorsB', data.jointAuditors);
        setRadioB('auditCommitteeB', data.auditCommittee);
        if (document.getElementById('firmCityB')) document.getElementById('firmCityB').value = data.firmCity || '';
        if (document.getElementById('firmStateB')) document.getElementById('firmStateB').value = data.firmState || '';
        if (document.getElementById('auditorCityB')) document.getElementById('auditorCityB').value = data.auditorCity || '';
        if (document.getElementById('auditorStateB')) document.getElementById('auditorStateB').value = data.auditorState || '';
        restoreAreaFromPincode('firmPincodeB', 'firmAreaB', data.firmArea, 'firmCityB', 'firmStateB');
        restoreAreaFromPincode('auditorPincodeB', 'auditorAreaB', data.auditorArea, 'auditorCityB', 'auditorStateB');
    }
}).catch(error => showStatus('b', `❌ Could not load defaults: ${error.message}`, 'error', 0));

// Wire pincode -> area lookup on both profiles. User picks correct post office
// from the dropdown, so a 1->many pincode never silently fills the wrong area.
wirePincode('firmPincode', 'firmArea', 'firmCity', 'firmState', 'a');
wirePincode('auditorPincode', 'auditorArea', 'auditorCity', 'auditorState', 'a');
wirePincode('firmPincodeB', 'firmAreaB', 'firmCityB', 'firmStateB', 'b');
wirePincode('auditorPincodeB', 'auditorAreaB', 'auditorCityB', 'auditorStateB', 'b');

// Pre-populate the area dropdown from saved pincode so saved area restores.
async function restoreAreaFromPincode(pinId, areaId, savedArea, cityId, stateId) {
    const pinEl = document.getElementById(pinId);
    const areaEl = document.getElementById(areaId);
    if (!pinEl || !areaEl) return;
    const pin = pinEl.value.trim();
    if (!/^\d{6}$/.test(pin)) return;
    const result = await fetchPincode(pin);
    if (!result) return;
    populateAreaSelect(areaEl, result.areas, savedArea);
    const cityEl = cityId ? document.getElementById(cityId) : null;
    const stateEl = stateId ? document.getElementById(stateId) : null;
    if (cityEl && !cityEl.value) cityEl.value = result.city;
    if (stateEl && !stateEl.value) stateEl.value = result.state;
}

// Named-profile list: top-of-popup saved profiles. Click a name to load its data
// into Version A fields; Run also fires the auto-fill against the open MCA tab.

function applyProfileToVersionA(data) {
    if (!data) return;
    const text = ['firmRegNumber','firmName','firmPAN','firmAddr1','firmAddr2','firmPincode',
        'firmCity','firmDistrict','firmState','firmEmail','membershipNum',
        'auditorName','auditorPAN','auditorAddr1','auditorAddr2','auditorPincode',
        'auditorCity','auditorDistrict','auditorState','auditorEmail',
        'fromDate','toDate','finYears','natureAppointment','appointmentDate',
        'auditorCount','previousTenure','previousYears','previousSerial',
        'previousFirmReg','previousMembership','previousFromDate','previousToDate'];
    for (const key of text) {
        const el = document.getElementById(key);
        if (el) el.value = data[key] || '';
    }
    const radios = ['category','withinLimit','withinYear','remuneration','companyClass',
        'appointedInAGM','jointAuditors','auditCommittee'];
    for (const name of radios) {
        const el = Array.from(document.querySelectorAll('input[name="' + name + '"]')).find(r => r.value === data[name]);
        if (el) el.checked = true;
    }
    restoreAreaFromPincode('firmPincode', 'firmArea', data.firmArea, 'firmCity', 'firmState');
    restoreAreaFromPincode('auditorPincode', 'auditorArea', data.auditorArea, 'auditorCity', 'auditorState');
}

function setProfileStatus(message, type) {
    const el = document.getElementById('profileStatus');
    if (!el) return;
    el.textContent = message || '';
    el.className = 'profile-status' + (type ? ' ' + type : '');
}

// Inject the content script on demand so the popup works even when the active
// tab loaded before the extension or does not match the manifest URL pattern.
async function ensureContentInjected(tabId) {
    try {
        await chrome.scripting.executeScript({ target: { tabId }, files: ['ContentDynamic.js'] });
    } catch (error) {
        throw new Error('Could not inject into this tab: ' + error.message);
    }
}

function sendOnce(tabId, payload) {
    return new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(tabId, payload, resp => {
            if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
            else resolve(resp);
        });
    });
}

async function sendFillToMCA(data, action = 'fillFormSmartA') {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    if (!tab) throw new Error('No active tab.');
    if (!/^https?:/.test(tab.url || '')) {
        throw new Error('Active tab is not a web page. Open the MCA ADT-1 page first.');
    }
    const payload = { action, data };
    try {
        return await sendOnce(tab.id, payload);
    } catch (error) {
        if (!/Receiving end does not exist|Could not establish connection/i.test(error.message)) throw error;
        await ensureContentInjected(tab.id);
        return await sendOnce(tab.id, payload);
    }
}

async function renderProfileList() {
    const list = document.getElementById('profileList');
    if (!list) return;
    const names = await ADT1Backend.listNamedProfiles();
    list.innerHTML = '';
    if (!names.length) {
        const empty = document.createElement('li');
        empty.className = 'profile-empty';
        empty.textContent = 'No saved profiles yet. Click "+ Add current as profile".';
        list.appendChild(empty);
        return;
    }
    for (const name of names) {
        const li = document.createElement('li');

        const nameEl = document.createElement('span');
        nameEl.className = 'profile-name';
        nameEl.textContent = name;
        nameEl.title = 'Click to load + auto-fill the MCA tab';
        nameEl.addEventListener('click', () => runProfile(name));

        const actions = document.createElement('span');
        actions.className = 'profile-actions';

        const runBtn = document.createElement('button');
        runBtn.className = 'profile-run';
        runBtn.textContent = '▶ Run';
        runBtn.addEventListener('click', () => runProfile(name));

        const loadBtn = document.createElement('button');
        loadBtn.className = 'profile-load';
        loadBtn.textContent = 'Load';
        loadBtn.addEventListener('click', () => loadProfileOnly(name));

        const delBtn = document.createElement('button');
        delBtn.className = 'profile-del';
        delBtn.textContent = '✕';
        delBtn.title = 'Delete profile';
        delBtn.addEventListener('click', async () => {
            if (!confirm('Delete profile "' + name + '"?')) return;
            await ADT1Backend.deleteNamedProfile(name);
            await renderProfileList();
            setProfileStatus('Deleted "' + name + '".', 'success');
        });

        actions.append(runBtn, loadBtn, delBtn);
        li.append(nameEl, actions);
        list.appendChild(li);
    }
}

async function loadProfileOnly(name) {
    const data = await ADT1Backend.getNamedProfile(name);
    if (!data) { setProfileStatus('Profile not found.', 'error'); return; }
    applyProfileToVersionA(data);
    setProfileStatus('Loaded "' + name + '" into Version A.', 'success');
}

async function runProfile(name) {
    const data = await ADT1Backend.getNamedProfile(name);
    if (!data) { setProfileStatus('Profile not found.', 'error'); return; }
    applyProfileToVersionA(data);
    setProfileStatus('Running "' + name + '" against the MCA tab...', '');
    try {
        const resp = await sendFillToMCA(data);
        if (resp && resp.success) setProfileStatus('✅ ' + resp.message, 'success');
        else setProfileStatus('❌ ' + (resp && resp.message ? resp.message : 'Fill failed. Is the ADT-1 page open?'), 'error');
    } catch (error) {
        setProfileStatus('❌ ' + error.message + '. Open the ADT-1 page and reload before clicking Run.', 'error');
    }
}

// Diagnostic: query the content script for every visible field and log to console
// so you can share the real MCA label/name/id strings for any field we miss.
document.getElementById('dumpFieldsBtn').addEventListener('click', async () => {
    setProfileStatus('Dumping fields from the MCA tab... open DevTools console on this popup.', '');
    try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const tab = tabs[0];
        if (!tab) throw new Error('No active tab.');
        await ensureContentInjected(tab.id);
        const resp = await sendOnce(tab.id, { action: 'dumpFields' });
        console.table(resp && resp.fields);
        setProfileStatus('Dumped ' + (resp && resp.count) + ' fields. See popup console (right-click popup -> Inspect).', 'success');
    } catch (error) {
        setProfileStatus('❌ ' + error.message, 'error');
    }
});

document.getElementById('addProfileBtn').addEventListener('click', async () => {
    const name = prompt('Profile name:');
    if (!name || !name.trim()) return;
    const data = getFormDataA();
    try {
        await ADT1Backend.saveNamedProfile(name, data);
        await renderProfileList();
        setProfileStatus('Saved "' + name.trim() + '".', 'success');
    } catch (error) {
        setProfileStatus('❌ ' + error.message, 'error');
    }
});

(async () => {
    try {
        await ADT1Backend.seedSamplesIfNeeded();
        await renderProfileList();
    } catch (error) {
        setProfileStatus('❌ Could not load profiles: ' + error.message, 'error');
    }
})();

console.log('✨ MCA ADT-1 Pro v2.1 - Popup loaded');
