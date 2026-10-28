// ============================================================
// MCA ADT-1 SMART FORM FILLER - Version 2.0
// Features: Smart pincode validation, auto-area selection, one-click filling
// ============================================================

// Helper function to set input value and trigger events
function setInputValue(selector, value) {
    const element = document.querySelector(selector);
    if (element) {
        element.value = value;
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
        element.dispatchEvent(new Event('blur', { bubbles: true }));
        return true;
    }
    return false;
}

// Helper function to click radio button
function setRadioValue(name, value) {
    const radio = document.querySelector(`input[name="${name}"][value="${value}"]`);
    if (radio) {
        radio.click();
        radio.checked = true;
        radio.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
    }
    return false;
}

// Helper function to select dropdown
function setSelectValue(selector, value) {
    const select = document.querySelector(selector);
    if (select) {
        let option = Array.from(select.options).find(opt =>
            opt.value === value || opt.textContent.trim() === value
        );
        if (option) {
            select.value = option.value;
            select.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
        }
    }
    return false;
}

// ============================================================
// SMART PINCODE HANDLER - Validates & Fetches Area Data
// ============================================================
async function getAreasFromPincode(pincode) {
    try {
        // Validate pincode format
        if (!pincode || pincode.length !== 6 || !/^\d{6}$/.test(pincode)) {
            return { success: false, error: "Invalid pincode format" };
        }

        // Call India Post Pincode API
        const response = await fetch(`https://api.postalpincode.in/pincode/${pincode}`);
        const data = await response.json();

        if (data[0].Status === "Success") {
            const details = data[0].PostOffice[0];
            return {
                success: true,
                areas: data[0].PostOffice.map(po => po.Name),
                city: details.District || details.Name,
                state: details.State,
                region: details.Region
            };
        } else {
            return { success: false, error: "Pincode not found" };
        }
    } catch (error) {
        console.log("Pincode API error:", error.message);
        return { success: false, error: "Could not validate pincode" };
    }
}

// ============================================================
// MAIN FORM FILLING FUNCTION - Version A (Smart Auto-Fill)
// ============================================================
async function fillFormSmartA(data) {
    try {
        let filledCount = 0;

        // Set category
        if (setRadioValue('category', data.category === 'firm' ? 'Auditor Firm' : 'Individual')) {
            filledCount++;
        }

        if (data.category === 'firm') {
            // Firm fields
            if (setInputValue('input[placeholder*="Firm Registration"]', data.firmRegNumber)) filledCount++;
            if (setInputValue('input[placeholder*="Name of the Auditor"]', data.firmName)) filledCount++;
            if (setInputValue('input[placeholder*="Income Tax"]', data.firmPAN)) filledCount++;

            // Address fields
            const addrInputs = document.querySelectorAll('input[placeholder*="Address"]');
            if (addrInputs.length >= 2) {
                addrInputs[0].value = data.firmAddr1;
                addrInputs[0].dispatchEvent(new Event('input', { bubbles: true }));
                if (data.firmAddr2) {
                    addrInputs[1].value = data.firmAddr2;
                    addrInputs[1].dispatchEvent(new Event('input', { bubbles: true }));
                }
                filledCount += 2;
            }

            // Smart Pincode Handling
            if (data.firmPincode) {
                const pincodeResult = await getAreasFromPincode(data.firmPincode);

                if (pincodeResult.success) {
                    // Set pincode
                    const pincodeInputs = document.querySelectorAll('input[placeholder*="Pin"], input[placeholder*="Zip"]');
                    if (pincodeInputs.length > 0) {
                        pincodeInputs[0].value = data.firmPincode;
                        pincodeInputs[0].dispatchEvent(new Event('input', { bubbles: true }));
                        filledCount++;
                    }

                    // Wait for MCA dropdown to populate
                    await new Promise(resolve => setTimeout(resolve, 1000));

                    // Auto-select best matching area
                    const areaSelects = document.querySelectorAll('select');
                    if (areaSelects.length > 0 && data.firmArea) {
                        for (let select of areaSelects) {
                            if (setSelectValue(select, data.firmArea)) {
                                filledCount++;
                                break;
                            }
                        }
                    }

                    // Auto-fill city and state from pincode data
                    const cityInputs = document.querySelectorAll('input[placeholder*="City"]');
                    if (cityInputs.length > 0) {
                        cityInputs[0].value = pincodeResult.city;
                        cityInputs[0].dispatchEvent(new Event('input', { bubbles: true }));
                        filledCount++;
                    }

                    const stateInputs = document.querySelectorAll('input[placeholder*="State"]');
                    if (stateInputs.length > 0) {
                        stateInputs[0].value = pincodeResult.state;
                        stateInputs[0].dispatchEvent(new Event('input', { bubbles: true }));
                        filledCount++;
                    }
                }
            }

            // Email
            const emailInputs = document.querySelectorAll('input[type="email"]');
            if (emailInputs.length > 0) {
                emailInputs[0].value = data.firmEmail;
                emailInputs[0].dispatchEvent(new Event('input', { bubbles: true }));
                filledCount++;
            }
        } else {
            // Individual auditor - similar logic
            const nameInputs = document.querySelectorAll('input[placeholder*="Name"]');
            if (nameInputs.length > 0) {
                nameInputs[0].value = data.auditorName;
                nameInputs[0].dispatchEvent(new Event('input', { bubbles: true }));
                filledCount++;
            }

            // Smart pincode for auditor
            if (data.auditorPincode) {
                const pincodeResult = await getAreasFromPincode(data.auditorPincode);
                if (pincodeResult.success) {
                    const cityInputs = document.querySelectorAll('input[placeholder*="City"]');
                    if (cityInputs.length > 0) {
                        cityInputs[0].value = pincodeResult.city;
                        cityInputs[0].dispatchEvent(new Event('input', { bubbles: true }));
                        filledCount++;
                    }
                }
            }
        }

        // Fill dates
        const dateInputs = document.querySelectorAll('input[placeholder*="DD/MM/YYYY"]');
        if (dateInputs.length >= 2) {
            dateInputs[0].value = data.fromDate;
            dateInputs[0].dispatchEvent(new Event('input', { bubbles: true }));
            dateInputs[1].value = data.toDate;
            dateInputs[1].dispatchEvent(new Event('input', { bubbles: true }));
            filledCount += 2;
        }

        return {
            success: true,
            message: `✨ Smart Auto-Fill Complete! ${filledCount} fields populated. Review and submit.`
        };
    } catch (error) {
        return {
            success: false,
            message: `Error: ${error.message}`
        };
    }
}

// ============================================================
// ONE-CLICK FILLING FUNCTION - Version B (Ultra-Auto)
// ============================================================
async function fillFormOneClickB(data) {
    try {
        let filledCount = 0;

        // Set category
        if (setRadioValue('category', data.category === 'firm' ? 'Auditor Firm' : 'Individual')) {
            filledCount++;
        }

        if (data.category === 'firm') {
            // Auto-fill all firm fields
            const addrInputs = document.querySelectorAll('input[placeholder*="Address"]');
            if (addrInputs.length >= 2) {
                addrInputs[0].value = data.firmName;
                addrInputs[1].value = data.firmAddr1;
                filledCount += 2;
            }

            // Smart pincode
            if (data.firmPincode) {
                const pincodeResult = await getAreasFromPincode(data.firmPincode);
                if (pincodeResult.success) {
                    const pincodeInputs = document.querySelectorAll('input[placeholder*="Pin"]');
                    if (pincodeInputs.length > 0) {
                        pincodeInputs[0].value = data.firmPincode;
                        filledCount++;
                    }

                    await new Promise(resolve => setTimeout(resolve, 1000));

                    const areaSelects = document.querySelectorAll('select');
                    if (areaSelects.length > 0) {
                        setSelectValue(areaSelects[0], pincodeResult.areas[0]);
                        filledCount++;
                    }

                    const cityInputs = document.querySelectorAll('input[placeholder*="City"]');
                    if (cityInputs.length > 0) {
                        cityInputs[0].value = pincodeResult.city;
                        filledCount++;
                    }

                    const stateInputs = document.querySelectorAll('input[placeholder*="State"]');
                    if (stateInputs.length > 0) {
                        stateInputs[0].value = pincodeResult.state;
                        filledCount++;
                    }
                }
            }
        }

        // Fill dates
        const dateInputs = document.querySelectorAll('input[placeholder*="DD/MM/YYYY"]');
        if (dateInputs.length >= 2) {
            dateInputs[0].value = data.fromDate;
            dateInputs[1].value = data.toDate;
            filledCount += 2;
        }

        // Set company flags
        setRadioValue('withinLimit', 'yes');
        setRadioValue('withinYear', 'yes');
        setRadioValue('remuneration', 'yes');

        return {
            success: true,
            message: `🎯 ONE-CLICK COMPLETE! Form auto-filled in seconds. Review & submit now!`
        };
    } catch (error) {
        return {
            success: false,
            message: `Error: ${error.message}`
        };
    }
}

// ============================================================
// MESSAGE LISTENER - Handle requests from popup
// ============================================================
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'fillFormSmartA') {
        fillFormSmartA(request.data).then(result => {
            sendResponse(result);
        });
        return true;
    } else if (request.action === 'fillFormOneClickB') {
        fillFormOneClickB(request.data).then(result => {
            sendResponse(result);
        });
        return true;
    } else if (request.action === 'getAreasByPincode') {
        getAreasFromPincode(request.pincode).then(result => {
            sendResponse(result);
        });
        return true;
    }
});

console.log('✨ MCA ADT-1 Auto-Filler Pro v2.0 Loaded');