// Local storage backend for MCA ADT-1 profiles.
// Data remains in this browser's extension storage and is never uploaded.
(() => {
    const profileKeys = {
        A: 'adtFormDataA',
        B: 'adtFormDataB'
    };
    const metadataKey = 'adtFormMeta';
    const namedKey = 'adtNamedProfiles';
    const seedFlagKey = 'adtNamedSeeded';

    const SAMPLE_PROFILES = {
        'Sample Mumbai Firm': {
            category: 'firm',
            firmRegNumber: '123456W',
            firmName: 'ABC & Associates LLP',
            firmPAN: 'AAAFQ1234A',
            firmAddr1: '456 Business Plaza',
            firmAddr2: 'Fort',
            firmPincode: '400001',
            firmArea: 'Mumbai G.P.O.',
            firmCity: 'Mumbai',
            firmDistrict: 'Mumbai',
            firmState: 'Maharashtra',
            firmEmail: 'contact@abc-llp.in',
            membershipNum: '123456',
            auditorName: 'CA Rajesh Kumar',
            auditorPAN: 'ABCPS9876D',
            auditorAddr1: '456 Business Plaza',
            auditorAddr2: 'Fort',
            auditorPincode: '400001',
            auditorArea: 'Mumbai G.P.O.',
            auditorCity: 'Mumbai',
            auditorDistrict: 'Mumbai',
            auditorState: 'Maharashtra',
            auditorEmail: 'rajesh@abc-llp.in',
            fromDate: '01/04/2024',
            toDate: '31/03/2025',
            finYears: '1',
            withinLimit: 'Yes',
            withinYear: 'yes',
            remuneration: 'yes',
            companyClass: 'No',
            natureAppointment: 'Appointment of Auditors in AGM',
            appointedInAGM: 'Yes',
            appointmentDate: '15/09/2024',
            jointAuditors: 'No',
            auditorCount: '1',
            auditCommittee: 'Not Applicable',
            previousTenure: 'Not applicable',
            previousYears: '0',
            previousSerial: '1',
            previousFirmReg: '',
            previousMembership: '',
            previousFromDate: '',
            previousToDate: ''
        },
        'Sample Bangalore Individual': {
            category: 'individual',
            firmRegNumber: '',
            firmName: '',
            firmPAN: '',
            firmAddr1: '',
            firmAddr2: '',
            firmPincode: '',
            firmEmail: '',
            auditorName: 'CA Priya Sharma',
            auditorPAN: 'PQRPS4567B',
            auditorAddr1: '12 MG Road',
            auditorAddr2: 'Shivaji Nagar',
            auditorPincode: '560001',
            auditorArea: 'Bangalore G.P.O.',
            auditorCity: 'Bengaluru',
            auditorDistrict: 'Bengaluru Urban',
            auditorState: 'Karnataka',
            auditorEmail: 'priya@casharma.in',
            membershipNum: '234567',
            fromDate: '01/04/2024',
            toDate: '31/03/2025',
            finYears: '1',
            withinLimit: 'Yes',
            withinYear: 'yes',
            remuneration: 'yes',
            companyClass: 'No',
            natureAppointment: 'Re-appointment of Auditors in AGM',
            appointedInAGM: 'Yes',
            appointmentDate: '20/09/2024',
            jointAuditors: 'No',
            auditorCount: '1',
            auditCommittee: 'Yes',
            previousTenure: 'Not applicable',
            previousYears: '0',
            previousSerial: '1',
            previousFirmReg: '',
            previousMembership: '',
            previousFromDate: '',
            previousToDate: ''
        }
    };

    function storageGet(keys) {
        return new Promise((resolve, reject) => {
            chrome.storage.local.get(keys, result => {
                const error = chrome.runtime.lastError;
                if (error) reject(new Error(error.message));
                else resolve(result);
            });
        });
    }

    function storageSet(values) {
        return new Promise((resolve, reject) => {
            chrome.storage.local.set(values, () => {
                const error = chrome.runtime.lastError;
                if (error) reject(new Error(error.message));
                else resolve();
            });
        });
    }

    function storageRemove(keys) {
        return new Promise((resolve, reject) => {
            chrome.storage.local.remove(keys, () => {
                const error = chrome.runtime.lastError;
                if (error) reject(new Error(error.message));
                else resolve();
            });
        });
    }

    window.ADT1Backend = {
        async saveProfile(profile, data) {
            const key = profileKeys[profile];
            if (!key) throw new Error('Unknown profile.');
            const saved = await storageGet(metadataKey);
            const metadata = saved[metadataKey] || {};
            metadata[profile] = { savedAt: new Date().toISOString() };
            await storageSet({ [key]: data, [metadataKey]: metadata });
            return metadata[profile];
        },

        async getProfile(profile) {
            const key = profileKeys[profile];
            if (!key) throw new Error('Unknown profile.');
            const result = await storageGet([key, metadataKey]);
            return {
                data: result[key] || null,
                metadata: (result[metadataKey] || {})[profile] || null
            };
        },

        async clearProfile(profile) {
            const key = profileKeys[profile];
            if (!key) throw new Error('Unknown profile.');
            const result = await storageGet(metadataKey);
            const metadata = result[metadataKey] || {};
            delete metadata[profile];
            await storageSet({ [metadataKey]: metadata });
            await storageRemove(key);
        },

        async seedSamplesIfNeeded() {
            // Always upsert the Sample_* profiles so edits to sample data in this
            // file propagate on every popup load. User-added profiles stay intact.
            const result = await storageGet(namedKey);
            const bag = result[namedKey] || {};
            for (const [name, data] of Object.entries(SAMPLE_PROFILES)) bag[name] = data;
            await storageSet({ [namedKey]: bag, [seedFlagKey]: true });
            return true;
        },

        async listNamedProfiles() {
            const result = await storageGet(namedKey);
            const bag = result[namedKey] || {};
            return Object.keys(bag).sort();
        },

        async getNamedProfile(name) {
            const result = await storageGet(namedKey);
            const bag = result[namedKey] || {};
            return bag[name] || null;
        },

        async saveNamedProfile(name, data) {
            if (!name || !name.trim()) throw new Error('Profile name required.');
            const result = await storageGet(namedKey);
            const bag = result[namedKey] || {};
            bag[name.trim()] = data;
            await storageSet({ [namedKey]: bag });
        },

        async deleteNamedProfile(name) {
            const result = await storageGet(namedKey);
            const bag = result[namedKey] || {};
            delete bag[name];
            await storageSet({ [namedKey]: bag });
        }
    };
})();
