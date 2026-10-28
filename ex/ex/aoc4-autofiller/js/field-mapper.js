// AOC-4 field map. Selectors derived from live DOM scan of mca.gov.in/content/mca/.../form-aoc4.html.
// `kind` = 'text' | 'date' | 'number' | 'radio' | 'select' | 'addRows'
// For radio: provide `name` (full radio-group name); pageFill in popup.js picks the option by aria-label.
// For text/date/number/select: provide `selector`.

// Phases = form sections filled one at a time. `saveIndex` = which visible "Save" button closes the section.
const PHASES = [
  { id: 1, label: 'Phase 1 — Part A: General info (Q1–7)', saveIndex: 0 },
  { id: 2, label: 'Phase 2 — Subsidiary, auditor, industry (draft)', saveIndex: 1 },
  { id: 3, label: 'Phase 3 — Balance sheet (draft)', saveIndex: 2 }
];

// Nature of financial statements: data holds a code, the page option is picked by regex on its text.
const NATURE_FS_OPTIONS = {
  provisional: { re: 'provisional|un-?adopted' },
  adopted:     { re: 'adopted', not: 'provisional|un-?adopted' },
  revised130:  { re: '130' },
  revised131:  { re: '131' }
};

// Signatory tables. Row 1 has a fixed name; rows 2+ get a random GUID prefix, so rows are picked by position.
const FS_SIG = 'panel_478261092_copy_1688980105-table-Row1-';
const BR_SIG = 'panel_2074267803_cop-panel_478261092_copy-table-Row1-';

function sigRows(prefix, base, dinCol, rows, label) {
  const out = [];
  for (let i = 0; i < rows; i++) {
    const n = i + 1;
    out.push(
      { id: `${prefix}${n}_DIN`, key: `${prefix}_SIG_${n}_DIN`, label: `${label} ${n}: DIN/PAN`, phase: 1, kind: 'text',
        selector: `input[name$="${base}${dinCol}___jqName"]`, index: i, typeChars: true, waitAfterMs: 5000 },
      { id: `${prefix}${n}_NAME`, key: `${prefix}_SIG_${n}_NAME`, label: `${label} ${n}: Name`, phase: 1, kind: 'text',
        selector: `input[name$="${base}tableItem1___jqName"]`, index: i, onlyIfEmpty: true },
      { id: `${prefix}${n}_DESIG`, key: `${prefix}_SIG_${n}_DESIG`, label: `${label} ${n}: Designation`, phase: 1, kind: 'select',
        selector: `select[name$="${base}headerItem1643788021607___jqName"]`, index: i },
      { id: `${prefix}${n}_DATE`, key: `${prefix}_SIG_${n}_DATE`, label: `${label} ${n}: Date signed`, phase: 1, kind: 'date',
        selector: `input[name$="${base}headerItem1643788025320___jqName"]`, index: i }
    );
  }
  return out;
}

// The visible CIN box is a type-ahead ("dropdownlist"); a hidden textbox copy also exists — never fill that one.
const CIN_SEL = 'input[name$="panel1AOC4-panel-panel-panel-guidedropdownlist_co___jqName"]';
const NAME_SEL = 'input[aria-label="2 (a) *Name of the company"]';

const FIELD_MAPPINGS = [
  /* ===== PHASE 1 — SEGMENT I Part A, in form order ===== */
  // Typed key by key so MCA's CIN lookup fires; skipped if the page already shows this company.
  { id: 'CIN', key: 'CIN', label: '1(a) CIN', phase: 1, kind: 'text', selector: CIN_SEL,
    typeChars: true, doneSelector: NAME_SEL },

  { id: 'AUTH_CAP', key: 'AUTHORIZED_CAPITAL', label: '1(b) Authorised capital', phase: 1, kind: 'number', onlyIfEmpty: true,
    selector: 'input[aria-label="(b) Authorised capital of the company as on the date of filing"]' },
  { id: 'MEMBERS', key: 'MEMBER_COUNT', label: '1(c) Number of members', phase: 1, kind: 'number', onlyIfEmpty: true,
    selector: 'input[aria-label="(c) Number of members of the company as on the date of filing"]' },

  { id: 'FY_FROM', key: 'FY_FROM', label: '3 FY From', phase: 1, kind: 'date',
    selector: 'input[name$="panel_478261092_copy-panel_252196987-guidetextbox_copy___jqName"][placeholder="DD/MM/YYYY"]' },
  { id: 'FY_TO', key: 'FY_TO', label: '3 FY To', phase: 1, kind: 'date',
    selector: 'input[name$="panel_478261092_copy-panel_252196987-guidetextbox_copy_673278796___jqName"]' },

  { id: 'BM_DATE', key: 'BOARD_MEETING_DATE', label: '4(a) Board meeting (FS approved)', phase: 1, kind: 'date',
    selector: 'input[aria-label^="4 (a) *Date of Board of directors\' meeting"]' },
  { id: 'NATURE_FS', key: 'NATURE_FS', label: '4(b)(i) Nature of financial statements', phase: 1, kind: 'select',
    selector: 'select[aria-label="(b) (i) *Nature of financial statements"]', optionMap: NATURE_FS_OPTIONS },
  // Two Yes/No/N.A. groups shown for "adopted"; DOM order assumed to be (iii) then (iv).
  { id: 'PROV_EARLIER', key: 'PROVISIONAL_FILED_EARLIER', label: '4(b)(iii) Provisional FS filed earlier', phase: 1, kind: 'radio',
    name: 'guideContainer-rootPanel-panel-panel-panel1AOC4-panel_2074267803-panel_478261092_copy_1688980105-panel_252196987-guideradiobutton___jqName' },
  { id: 'ADJ_AGM', key: 'ADOPTED_IN_ADJOURNED_AGM', label: '4(b)(iv) Adopted in adjourned AGM', phase: 1, kind: 'radio',
    name: 'guideContainer-rootPanel-panel-panel-panel1AOC4-panel_2074267803-panel_478261092_copy_1688980105-panel_252196987-guideradiobutton_2135980083___jqName' },

  { id: 'FS_ADD_ROWS', label: '4(c) Ensure 5 FS signatory rows', phase: 1, kind: 'addRows',
    selector: `input[name$="${FS_SIG}tableitem___jqName"]`, need: 5 },
  ...sigRows('FS', FS_SIG, 'tableitem', 5, '4(c) FS signatory'),

  { id: 'BR_DATE', key: 'BOARD_REPORT_DATE', label: "5(a) Board meeting (Board's report approved)", phase: 1, kind: 'date',
    selector: 'input[aria-label^="5 (a) Date of Board of directors\' meeting in which boards"]' },

  { id: 'BR_ADD_ROWS', label: "5(b) Ensure 3 Board's report signatory rows", phase: 1, kind: 'addRows',
    selector: `input[name$="${BR_SIG}tableItem___jqName"]`, need: 3 },
  ...sigRows('BR', BR_SIG, 'tableItem', 3, "5(b) Board's report signatory"),

  { id: 'AUDITOR_SIGN', key: 'AUDITOR_SIGN_DATE', label: '6 Auditor signed reports', phase: 1, kind: 'date',
    selector: 'input[aria-label^="6 *Date of signing of reports"]' },

  { id: 'AGM_HELD', key: 'AGM_HELD', label: '7(a) AGM held', phase: 1, kind: 'radio',
    name: 'guideContainer-rootPanel-panel-panel-panel1AOC4-panel_2074267803_cop_606137638-panel_478261092_copy-guideradiobutton___jqName' },
  { id: 'AGM_DATE', key: 'AGM_DATE', label: '7(b) Date of AGM', phase: 1, kind: 'date',
    selector: 'input[aria-label^="(b) If yes, date of AGM"]' },
  { id: 'AGM_DUE', key: 'AGM_DUE_DATE', label: '7(c) Due date of AGM', phase: 1, kind: 'date',
    selector: 'input[aria-label^="(c) Due date of AGM"]' },
  { id: 'AGM_EXT', key: 'AGM_EXTENSION', label: '7(d) AGM extension granted', phase: 1, kind: 'radio',
    name: 'guideContainer-rootPanel-panel-panel-panel1AOC4-panel_2074267803_cop_606137638-panel_478261092_copy-guideradiobutton_cop___jqName' },
  { id: 'GNL1_SRN', key: 'GNL1_SRN', label: '7(e) SRN of GNL-1', phase: 1, kind: 'text',
    selector: 'input[aria-label="(e) SRN of GNL-1"]' },
  { id: 'AGM_EXT_DUE', key: 'AGM_EXT_DUE_DATE', label: '7(f) Due date after extension', phase: 1, kind: 'date',
    selector: 'input[aria-label^="(f) Due date of AGM after grant of extension"]' },

  /* ===== Subsidiary ===== */
  { id: 'IS_SUB', key: 'IS_SUBSIDIARY', label: 'Is Subsidiary?',
    kind: 'radio',
    name: 'guideContainer-rootPanel-panel-panel-panel2AOC4-panel_2074267803_cop_2081672660-panel_478261092_copy-guideradiobutton___jqName' },

  { id: 'HOLD_CIN', key: 'HOLDING_CIN', label: 'Holding CIN',
    kind: 'text',
    selector: 'input[aria-label="(b) CIN/any other registration number of the holding company, if applicable"]' },

  { id: 'HOLD_NAME', key: 'HOLDING_NAME', label: 'Holding Name',
    kind: 'text',
    selector: 'input[aria-label="(c) Name of the holding company"]' },

  { id: 'PROV_SEC', key: 'PROVISION_SECTION', label: 'Provision Section',
    kind: 'select',
    selector: 'select[aria-label^="(d) Provision pursuant"]' },

  { id: 'HAS_SUB_JV', key: 'HAS_SUBSIDIARY_JV', label: 'Has Subsidiary/JV?',
    kind: 'radio',
    name: 'guideContainer-rootPanel-panel-panel-panel2AOC4-panel_2074267803_cop_2081672660-panel_478261092_copy-guideradiobutton_cop___jqName' },

  /* ===== Auditor ===== */
  { id: 'ADT_SRN', key: 'ADT_SRN', label: 'SRN of Form ADT-1',
    kind: 'text',
    selector: 'input[aria-label="9 *SRN of Form ADT-1"]' },

  { id: 'NUM_AUD', key: 'NUM_AUDITORS', label: 'Number of Auditors',
    kind: 'number',
    selector: 'input[aria-label="*Number of Auditors"]' },

  { id: 'AUD_PAN', key: 'AUDITOR_PAN', label: 'Auditor PAN',
    kind: 'text',
    selector: 'input[aria-label*="Income-tax PAN of auditor"]' },

  { id: 'AUD_CAT', key: 'AUDITOR_CATEGORY', label: 'Auditor Category',
    kind: 'radio',
    name: 'guideContainer-rootPanel-panel-panel-panel2AOC4-panel_1603825367-panel-guideradiobutton___jqName' },

  { id: 'FIRM_REG', key: 'AUDITOR_FIRM_REG', label: 'Firm Reg Number',
    kind: 'text',
    selector: 'input[aria-label*="Membership number of auditor or auditor"]' },

  { id: 'AUD_NAME', key: 'AUDITOR_NAME', label: 'Auditor Name',
    kind: 'text',
    selector: 'input[aria-label*="(d) *Name of the auditor"]' },

  { id: 'AUD_ADDR1', key: 'AUDITOR_ADDR1', label: 'Auditor Address 1',
    kind: 'text',
    selector: 'input[name$="panel-guidetextbox_2007049246___jqName"]' },

  { id: 'AUD_ADDR2', key: 'AUDITOR_ADDR2', label: 'Auditor Address 2',
    kind: 'text',
    selector: 'input[name$="panel-guidetextbox_382138727___jqName"]' },

  { id: 'AUD_COUNTRY', key: 'AUDITOR_COUNTRY', label: 'Auditor Country',
    kind: 'select',
    selector: 'select[name$="panel_1603825367-panel-guidedropdownlist___jqName"]' },

  { id: 'AUD_PIN', key: 'AUDITOR_PIN', label: 'Auditor PIN',
    kind: 'text',
    selector: 'input[name$="panel_1603825367-panel-guidetextbox_1574494336___jqName"]' },

  { id: 'AUD_CITY', key: 'AUDITOR_CITY', label: 'Auditor City',
    kind: 'text',
    selector: 'input[name$="panel_1603825367-panel-guidetextbox_1885532300___jqName"]' },

  { id: 'AUD_STATE', key: 'AUDITOR_STATE', label: 'Auditor State',
    kind: 'text',
    selector: 'input[name$="panel_1603825367-panel-guidetextbox_1885532_621346261___jqName"]' },

  { id: 'MEMBER_NM', key: 'MEMBER_NAME', label: 'Member Name',
    kind: 'text',
    selector: 'input[aria-label="(i) Name of the member"]' },

  { id: 'MEMBER_NO', key: 'MEMBER_NUMBER', label: 'Membership Number',
    kind: 'text',
    selector: 'input[name$="panel_1603825367-panel-panel-guidetextbox_1509170263___jqName"]' },

  /* ===== Industry etc ===== */
  { id: 'IND_TYPE', key: 'INDUSTRY_TYPE', label: 'Industry Type',
    kind: 'select',
    selector: 'select[aria-label*="type of industry"]' },

  { id: 'SCH3', key: 'SCHEDULE_III_APPLICABLE', label: 'Schedule III Applicable',
    kind: 'radio',
    name: 'guideContainer-rootPanel-panel-panel-panel2AOC4-panel_2074267803_cop_385433263-panel_478261092_copy-guideradiobutton___jqName' },

  { id: 'CONSOL', key: 'CONSOLIDATED_FS_REQUIRED', label: 'Consolidated FS Required',
    kind: 'radio',
    name: 'guideContainer-rootPanel-panel-panel-panel2AOC4-panel_2074267803_cop_1118870191-guideradiobutton___jqName' },

  { id: 'BOOKS_E', key: 'BOOKS_ELECTRONIC', label: 'Books in Electronic Form',
    kind: 'radio',
    name: 'guideContainer-rootPanel-panel-panel-panel2AOC4-panel_2074267803_cop_1118870191-panel_478261092_copy-guideradiobutton___jqName' },

  /* ===== BALANCE SHEET ===== */
  // Each Row has 3 inputs in order: current period, previous period, reason for change (not filled).

  { id: 'bs_date_cur',  key: 'asOf_CUR',  label: 'BS date (current)',  kind: 'date',
    selector: 'input[name$="table-HeaderRow-headerItem1643803865994___jqName"]' },
  { id: 'bs_date_prev', key: 'asOf_PREV', label: 'BS date (previous)', kind: 'date',
    selector: 'input[name$="table-HeaderRow-headerItem1643803870365___jqName"]' },

  { id: 'bs_sc_cur',  key: 'SHARE_CAPITAL_CUR',  kind: 'number',
    selector: 'input[name$="Row1643805949296-tableItem1643805949299___jqName"]' },
  { id: 'bs_sc_prev', key: 'SHARE_CAPITAL_PREV', kind: 'number',
    selector: 'input[name$="Row1643805949296-tableItem1643805949300___jqName"]' },

  { id: 'bs_rs_cur',  key: 'RESERVES_SURPLUS_CUR',  kind: 'number',
    selector: 'input[name$="Row1643810517442-tableItem1643810517445___jqName"]' },
  { id: 'bs_rs_prev', key: 'RESERVES_SURPLUS_PREV', kind: 'number',
    selector: 'input[name$="Row1643810517442-tableItem1643810517446___jqName"]' },

  { id: 'bs_mw_cur',  key: 'MONEY_AGAINST_WARRANTS_CUR',  kind: 'number',
    selector: 'input[name$="Row1643810556785-tableItem1643810556788___jqName"]' },
  { id: 'bs_mw_prev', key: 'MONEY_AGAINST_WARRANTS_PREV', kind: 'number',
    selector: 'input[name$="Row1643810556785-tableItem1643810556789___jqName"]' },

  { id: 'bs_sap_cur',  key: 'SHARE_APP_PENDING_CUR',  kind: 'number',
    selector: 'input[name$="Row1643810981304-tableItem1643810981307___jqName"]' },
  { id: 'bs_sap_prev', key: 'SHARE_APP_PENDING_PREV', kind: 'number',
    selector: 'input[name$="Row1643810981304-tableItem1643810981308___jqName"]' },

  { id: 'bs_ltb_cur',  key: 'LONG_TERM_BORROWINGS_CUR',  kind: 'number',
    selector: 'input[name$="Row1643811210415-tableItem1643811210419___jqName"]' },
  { id: 'bs_ltb_prev', key: 'LONG_TERM_BORROWINGS_PREV', kind: 'number',
    selector: 'input[name$="Row1643811210415-tableItem1643811210420___jqName"]' },

  { id: 'bs_dtl_cur',  key: 'DEFERRED_TAX_LIAB_CUR',  kind: 'number',
    selector: 'input[name$="Row1643811216485-tableItem1643811216488___jqName"]' },
  { id: 'bs_dtl_prev', key: 'DEFERRED_TAX_LIAB_PREV', kind: 'number',
    selector: 'input[name$="Row1643811216485-tableItem1643811216489___jqName"]' },

  { id: 'bs_oll_cur',  key: 'OTHER_LONG_TERM_LIAB_CUR',  kind: 'number',
    selector: 'input[name$="Row1643811233453-tableItem1643811233456___jqName"]' },
  { id: 'bs_oll_prev', key: 'OTHER_LONG_TERM_LIAB_PREV', kind: 'number',
    selector: 'input[name$="Row1643811233453-tableItem1643811233457___jqName"]' },

  { id: 'bs_ltp_cur',  key: 'LONG_TERM_PROVISIONS_CUR',  kind: 'number',
    selector: 'input[name$="Row1643811248414-tableItem1643811248417___jqName"]' },
  { id: 'bs_ltp_prev', key: 'LONG_TERM_PROVISIONS_PREV', kind: 'number',
    selector: 'input[name$="Row1643811248414-tableItem1643811248418___jqName"]' },

  { id: 'bs_stb_cur',  key: 'SHORT_TERM_BORROWINGS_CUR',  kind: 'number',
    selector: 'input[name$="Row1643811597352-tableItem1643811597355___jqName"]' },
  { id: 'bs_stb_prev', key: 'SHORT_TERM_BORROWINGS_PREV', kind: 'number',
    selector: 'input[name$="Row1643811597352-tableItem1643811597356___jqName"]' },

  { id: 'bs_tpm_cur',  key: 'TRADE_PAYABLES_MSME_CUR',  kind: 'number',
    selector: 'input[name$="Row1720502496918-tableItem1720502496921___jqName"]' },
  { id: 'bs_tpm_prev', key: 'TRADE_PAYABLES_MSME_PREV', kind: 'number',
    selector: 'input[name$="Row1720502496918-tableItem1720502496922___jqName"]' },

  { id: 'bs_tpo_cur',  key: 'TRADE_PAYABLES_OTHER_CUR',  kind: 'number',
    selector: 'input[name$="Row1720503320433-tableItem1720503320436___jqName"]' },
  { id: 'bs_tpo_prev', key: 'TRADE_PAYABLES_OTHER_PREV', kind: 'number',
    selector: 'input[name$="Row1720503320433-tableItem1720503320437___jqName"]' },

  { id: 'bs_ocl_cur',  key: 'OTHER_CURRENT_LIAB_CUR',  kind: 'number',
    selector: 'input[name$="Row1643867870853-tableItem1643867870856___jqName"]' },
  { id: 'bs_ocl_prev', key: 'OTHER_CURRENT_LIAB_PREV', kind: 'number',
    selector: 'input[name$="Row1643867870853-tableItem1643867870857___jqName"]' },

  { id: 'bs_stp_cur',  key: 'SHORT_TERM_PROVISIONS_CUR',  kind: 'number',
    selector: 'input[name$="Row1643867878141-tableItem1643867878144___jqName"]' },
  { id: 'bs_stp_prev', key: 'SHORT_TERM_PROVISIONS_PREV', kind: 'number',
    selector: 'input[name$="Row1643867878141-tableItem1643867878145___jqName"]' },

  /* Assets side */
  { id: 'as_ppe_cur',  key: 'PPE_CUR',  kind: 'number',
    selector: 'input[name$="Row1643869054335-tableItem1643869054338___jqName"]' },
  { id: 'as_ppe_prev', key: 'PPE_PREV', kind: 'number',
    selector: 'input[name$="Row1643869054335-tableItem1643869054339___jqName"]' },

  { id: 'as_int_cur',  key: 'INTANGIBLE_ASSETS_CUR',  kind: 'number',
    selector: 'input[name$="Row1643869059645-tableItem1643869059648___jqName"]' },
  { id: 'as_int_prev', key: 'INTANGIBLE_ASSETS_PREV', kind: 'number',
    selector: 'input[name$="Row1643869059645-tableItem1643869059649___jqName"]' },

  { id: 'as_cwip_cur',  key: 'CWIP_CUR',  kind: 'number',
    selector: 'input[name$="Row1643869065899-tableItem1643869065902___jqName"]' },
  { id: 'as_cwip_prev', key: 'CWIP_PREV', kind: 'number',
    selector: 'input[name$="Row1643869065899-tableItem1643869065903___jqName"]' },

  { id: 'as_iud_cur',  key: 'INTANGIBLE_UNDER_DEV_CUR',  kind: 'number',
    selector: 'input[name$="Row1643869072635-tableItem1643869072638___jqName"]' },
  { id: 'as_iud_prev', key: 'INTANGIBLE_UNDER_DEV_PREV', kind: 'number',
    selector: 'input[name$="Row1643869072635-tableItem1643869072639___jqName"]' },

  { id: 'as_nci_cur',  key: 'NON_CURRENT_INVESTMENTS_CUR',  kind: 'number',
    selector: 'input[name$="Row1643869078500-tableItem1643869078503___jqName"]' },
  { id: 'as_nci_prev', key: 'NON_CURRENT_INVESTMENTS_PREV', kind: 'number',
    selector: 'input[name$="Row1643869078500-tableItem1643869078504___jqName"]' },

  { id: 'as_dta_cur',  key: 'DEFERRED_TAX_ASSETS_CUR',  kind: 'number',
    selector: 'input[name$="Row1643869089142-tableItem1643869089145___jqName"]' },
  { id: 'as_dta_prev', key: 'DEFERRED_TAX_ASSETS_PREV', kind: 'number',
    selector: 'input[name$="Row1643869089142-tableItem1643869089146___jqName"]' },

  { id: 'as_ltla_cur',  key: 'LONG_TERM_LOANS_ADVANCES_CUR',  kind: 'number',
    selector: 'input[name$="Row1643869103460-tableItem1643869103463___jqName"]' },
  { id: 'as_ltla_prev', key: 'LONG_TERM_LOANS_ADVANCES_PREV', kind: 'number',
    selector: 'input[name$="Row1643869103460-tableItem1643869103464___jqName"]' },

  { id: 'as_onc_cur',  key: 'OTHER_NON_CURRENT_ASSETS_CUR',  kind: 'number',
    selector: 'input[name$="Row1643869110403-tableItem1643869110406___jqName"]' },
  { id: 'as_onc_prev', key: 'OTHER_NON_CURRENT_ASSETS_PREV', kind: 'number',
    selector: 'input[name$="Row1643869110403-tableItem1643869110407___jqName"]' },

  { id: 'as_ci_cur',  key: 'CURRENT_INVESTMENTS_CUR',  kind: 'number',
    selector: 'input[name$="Row1643869677742-tableItem1643869677745___jqName"]' },
  { id: 'as_ci_prev', key: 'CURRENT_INVESTMENTS_PREV', kind: 'number',
    selector: 'input[name$="Row1643869677742-tableItem1643869677746___jqName"]' },

  { id: 'as_inv_cur',  key: 'INVENTORIES_CUR',  kind: 'number',
    selector: 'input[name$="Row1643869683963-tableItem1643869683966___jqName"]' },
  { id: 'as_inv_prev', key: 'INVENTORIES_PREV', kind: 'number',
    selector: 'input[name$="Row1643869683963-tableItem1643869683967___jqName"]' },

  { id: 'as_tr_cur',  key: 'TRADE_RECEIVABLES_CUR',  kind: 'number',
    selector: 'input[name$="Row1643869691133-tableItem1643869691136___jqName"]' },
  { id: 'as_tr_prev', key: 'TRADE_RECEIVABLES_PREV', kind: 'number',
    selector: 'input[name$="Row1643869691133-tableItem1643869691137___jqName"]' },

  { id: 'as_cc_cur',  key: 'CASH_EQUIVALENTS_CUR',  kind: 'number',
    selector: 'input[name$="Row1643869700097-tableItem1643869700100___jqName"]' },
  { id: 'as_cc_prev', key: 'CASH_EQUIVALENTS_PREV', kind: 'number',
    selector: 'input[name$="Row1643869700097-tableItem1643869700101___jqName"]' },

  { id: 'as_stla_cur',  key: 'SHORT_TERM_LOANS_ADVANCES_CUR',  kind: 'number',
    selector: 'input[name$="Row1643869710045-tableItem1643869710048___jqName"]' },
  { id: 'as_stla_prev', key: 'SHORT_TERM_LOANS_ADVANCES_PREV', kind: 'number',
    selector: 'input[name$="Row1643869710045-tableItem1643869710049___jqName"]' },

  { id: 'as_oca_cur',  key: 'OTHER_CURRENT_ASSETS_CUR',  kind: 'number',
    selector: 'input[name$="Row1643869716976-tableItem1643869716979___jqName"]' },
  { id: 'as_oca_prev', key: 'OTHER_CURRENT_ASSETS_PREV', kind: 'number',
    selector: 'input[name$="Row1643869716976-tableItem1643869716980___jqName"]' }
];

for (const f of FIELD_MAPPINGS) if (!f.phase) f.phase = /^(bs|as)_/.test(f.id) ? 3 : 2;

function flattenClient(c) {
  const out = {};
  Object.assign(out, c.general || {}, c.auditor || {}, c.relatedParty || {}, c.disclosures || {});
  for (const [prefix, list] of [['FS', c.signatoriesFS], ['BR', c.signatoriesBR]]) {
    (list || []).forEach((s, i) => {
      const n = i + 1;
      out[`${prefix}_SIG_${n}_DIN`] = s.din;
      out[`${prefix}_SIG_${n}_NAME`] = s.name;
      out[`${prefix}_SIG_${n}_DESIG`] = s.designation;
      out[`${prefix}_SIG_${n}_DATE`] = s.date;
    });
  }
  const bsCur = (c.balanceSheet && c.balanceSheet.current) || {};
  const bsPrev = (c.balanceSheet && c.balanceSheet.previous) || {};
  for (const k of Object.keys(bsCur))  out[`${k}_CUR`]  = bsCur[k];
  for (const k of Object.keys(bsPrev)) out[`${k}_PREV`] = bsPrev[k];
  const plCur = (c.profitLoss && c.profitLoss.current) || {};
  const plPrev = (c.profitLoss && c.profitLoss.previous) || {};
  for (const k of Object.keys(plCur))  out[`${k}_CUR`]  = plCur[k];
  for (const k of Object.keys(plPrev)) out[`${k}_PREV`] = plPrev[k];
  return out;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { FIELD_MAPPINGS, PHASES, flattenClient };
}
