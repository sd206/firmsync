# Test firms

Ten fictional consulting firms for testing on the Test site, created by `scripts/seed-test-firms.mjs`.
The script uses a fixed-seed generator, so every run produces exactly this list. Structure only:
no timesheets, invoices, bills or expenses. Pay rates and bill rates start on 2026-01-01.

**Password:** every login below shares one password. On a hosted database it is the value of
`SEED_TEST_FIRMS_PASSWORD` used for the run (ask the owner); on a local database it is the default
in the script. It is never written here. Emails end in `.test`, so nothing can be delivered to them.

## Summary

| Firm | Type | Admin | Consultants | Clients | Vendors |
|---|---|---|---|---|---|
| Bramblewood Advisory | Employees only | ximena.lindqvist@bramblewood-advisory.test | 8 | 3 | 1 |
| Quillfeather Partners | Subcontractors only | ximena.abernathy@quillfeather-partners.test | 6 | 1 | 3 |
| Copperkettle Consulting | Mixed | soren.okonkwo@copperkettle-consulting.test | 4 | 2 | 1 |
| Larkspur Lane Analytics | Employees only | jonah.elsworth@larkspur-lane-analytics.test | 9 | 5 | 3 |
| Tidewhistle Strategy | Subcontractors only | ximena.hartwell@tidewhistle-strategy.test | 5 | 1 | 1 |
| Ironfern Systems Consulting | Employees only | zara.fenwick@ironfern-systems-consulting.test | 5 | 2 | 3 |
| Saltmarsh & Finch Advisors | Subcontractors only | nadia.galloway@saltmarsh-and-finch-advisors.test | 9 | 1 | 3 |
| Lanternhook Consulting Group | Mixed | ximena.thistlewood@lanternhook-consulting-group.test | 9 | 4 | 3 |
| Juniperwick Partners | Employees only | dmitri.yardley@juniperwick-partners.test | 6 | 3 | 3 |
| Hollowmere Digital | Subcontractors only | bruno.hartwell@hollowmere-digital.test | 3 | 1 | 1 |

## Bramblewood Advisory

- **Type:** Employees only
- **Admin:** Ximena Lindqvist, ximena.lindqvist@bramblewood-advisory.test

### Consultants

| Name | Email | Type | Pay rate | Paid through |
|---|---|---|---|---|
| Clara Bellweather | clara.bellweather@bramblewood-advisory.test | Employee | $87/h | Paid directly |
| Nadia Marchetti | nadia.marchetti@bramblewood-advisory.test | Employee | $61/h | Paid directly |
| Kofi Fenwick | kofi.fenwick@bramblewood-advisory.test | Employee | $49/h | Paid directly |
| Hugo Draycott | hugo.draycott@bramblewood-advisory.test | Employee | $51/h | Paid directly |
| Clara Quarles | clara.quarles@bramblewood-advisory.test | Employee | $86/h | Paid directly |
| Idris Bellweather | idris.bellweather@bramblewood-advisory.test | Employee | $61/h | Paid directly |
| Mateo Thistlewood | mateo.thistlewood@bramblewood-advisory.test | Employee | $77/h | Paid directly |
| Jonah Fenwick | jonah.fenwick@bramblewood-advisory.test | Employee | $49/h | Paid directly |

### Clients and projects

Every consultant is assigned to every project at the bill rate shown.

| Client | Project | Code | Bill rates |
|---|---|---|---|
| Riverbend Manufacturing | Data Platform | RM-01 | Clara Bellweather $140/h; Nadia Marchetti $100/h; Kofi Fenwick $90/h; Hugo Draycott $70/h; Clara Quarles $140/h; Idris Bellweather $110/h; Mateo Thistlewood $125/h; Jonah Fenwick $85/h |
| Harborview Energy | Security Review | HE-02 | Clara Bellweather $135/h; Nadia Marchetti $105/h; Kofi Fenwick $70/h; Hugo Draycott $90/h; Clara Quarles $160/h; Idris Bellweather $110/h; Mateo Thistlewood $110/h; Jonah Fenwick $90/h |
| Riverbend Freight | Compliance Audit | RF-03 | Clara Bellweather $125/h; Nadia Marchetti $105/h; Kofi Fenwick $75/h; Hugo Draycott $90/h; Clara Quarles $125/h; Idris Bellweather $90/h; Mateo Thistlewood $140/h; Jonah Fenwick $70/h |

### Vendors

| Vendor | Contact | Email |
|---|---|---|
| Kestrel Staffing | Umar Elsworth | umar.elsworth@kestrel-staffing.test |

## Quillfeather Partners

- **Type:** Subcontractors only
- **Admin:** Ximena Abernathy, ximena.abernathy@quillfeather-partners.test

### Consultants

| Name | Email | Type | Pay rate | Paid through |
|---|---|---|---|---|
| Farah Hartwell | farah.hartwell@quillfeather-partners.test | Vendor contractor | $61/h | Bluegate Staffing |
| Yusuf Rookwood | yusuf.rookwood@quillfeather-partners.test | Vendor contractor | $84/h | Pinecrest Resourcing |
| Gideon Bellweather | gideon.bellweather@quillfeather-partners.test | Vendor contractor | $100/h | Pinecrest Resourcing |
| Mateo Fairbourne | mateo.fairbourne@quillfeather-partners.test | Vendor contractor | $93/h | Harborlight Resourcing |
| Omar Underhill | omar.underhill@quillfeather-partners.test | Vendor contractor | $82/h | Harborlight Resourcing |
| Camila Lindqvist | camila.lindqvist@quillfeather-partners.test | Vendor contractor | $79/h | Harborlight Resourcing |

### Clients and projects

Every consultant is assigned to every project at the bill rate shown.

| Client | Project | Code | Bill rates |
|---|---|---|---|
| Crestfall Freight | Data Platform | CF-01 | Farah Hartwell $110/h; Yusuf Rookwood $130/h; Gideon Bellweather $145/h; Mateo Fairbourne $135/h; Omar Underhill $120/h; Camila Lindqvist $140/h |

### Vendors

| Vendor | Contact | Email |
|---|---|---|
| Harborlight Resourcing | Hugo Underhill | hugo.underhill@harborlight-resourcing.test |
| Bluegate Staffing | Quentin Quarles | quentin.quarles@bluegate-staffing.test |
| Pinecrest Resourcing | Felix Fenwick | felix.fenwick@pinecrest-resourcing.test |

## Copperkettle Consulting

- **Type:** Mixed
- **Admin:** Soren Okonkwo, soren.okonkwo@copperkettle-consulting.test

### Consultants

| Name | Email | Type | Pay rate | Paid through |
|---|---|---|---|---|
| Jonah Marchetti | jonah.marchetti@copperkettle-consulting.test | Employee | $52/h | Paid directly |
| Idris Calloway | idris.calloway@copperkettle-consulting.test | Vendor contractor | $115/h | Moonrake Resourcing |
| Camila Quarles | camila.quarles@copperkettle-consulting.test | Vendor contractor | $75/h | Moonrake Resourcing |
| Anika Ashdown | anika.ashdown@copperkettle-consulting.test | Vendor contractor | $86/h | Moonrake Resourcing |

### Clients and projects

Every consultant is assigned to every project at the bill rate shown.

| Client | Project | Code | Bill rates |
|---|---|---|---|
| Starling Media | Process Redesign | SM-01 | Jonah Marchetti $75/h; Idris Calloway $210/h; Camila Quarles $140/h; Anika Ashdown $160/h |
| Eastholm Logistics | Integration Hub | EL-02 | Jonah Marchetti $90/h; Idris Calloway $185/h; Camila Quarles $125/h; Anika Ashdown $130/h |

### Vendors

| Vendor | Contact | Email |
|---|---|---|
| Moonrake Resourcing | Camila Ashdown | camila.ashdown@moonrake-resourcing.test |

## Larkspur Lane Analytics

- **Type:** Employees only
- **Admin:** Jonah Elsworth, jonah.elsworth@larkspur-lane-analytics.test

### Consultants

| Name | Email | Type | Pay rate | Paid through |
|---|---|---|---|---|
| Farah Okonkwo | farah.okonkwo@larkspur-lane-analytics.test | Employee | $77/h | Paid directly |
| Talia Ingleby | talia.ingleby@larkspur-lane-analytics.test | Employee | $47/h | Paid directly |
| Soren Kettering | soren.kettering@larkspur-lane-analytics.test | Employee | $77/h | Paid directly |
| Jonah Fairbourne | jonah.fairbourne@larkspur-lane-analytics.test | Employee | $95/h | Paid directly |
| Elena Varga | elena.varga@larkspur-lane-analytics.test | Employee | $71/h | Paid directly |
| Nadia Northcott | nadia.northcott@larkspur-lane-analytics.test | Employee | $76/h | Paid directly |
| Nell Galloway | nell.galloway@larkspur-lane-analytics.test | Employee | $49/h | Paid directly |
| Ines Pemberton | ines.pemberton@larkspur-lane-analytics.test | Employee | $54/h | Paid directly |
| Dev Hartwell | dev.hartwell@larkspur-lane-analytics.test | Employee | $79/h | Paid directly |

### Clients and projects

Every consultant is assigned to every project at the bill rate shown.

| Client | Project | Code | Bill rates |
|---|---|---|---|
| Brightmoor Foods | Compliance Audit | BF-01 | Farah Okonkwo $120/h; Talia Ingleby $70/h; Soren Kettering $140/h; Jonah Fairbourne $165/h; Elena Varga $115/h; Nadia Northcott $120/h; Nell Galloway $70/h; Ines Pemberton $100/h; Dev Hartwell $120/h |
| Summitline Logistics | ERP Rollout | SL-02 | Farah Okonkwo $115/h; Talia Ingleby $85/h; Soren Kettering $135/h; Jonah Fairbourne $135/h; Elena Varga $115/h; Nadia Northcott $135/h; Nell Galloway $75/h; Ines Pemberton $80/h; Dev Hartwell $145/h |
| Glenrock Freight | Analytics Dashboard | GF-03 | Farah Okonkwo $135/h; Talia Ingleby $85/h; Soren Kettering $145/h; Jonah Fairbourne $145/h; Elena Varga $120/h; Nadia Northcott $140/h; Nell Galloway $80/h; Ines Pemberton $100/h; Dev Hartwell $130/h |
| Glenrock Energy | Process Redesign | GE-04 | Farah Okonkwo $115/h; Talia Ingleby $80/h; Soren Kettering $145/h; Jonah Fairbourne $155/h; Elena Varga $110/h; Nadia Northcott $140/h; Nell Galloway $90/h; Ines Pemberton $100/h; Dev Hartwell $125/h |
| Riverbend Media | Security Review | RM-05 | Farah Okonkwo $135/h; Talia Ingleby $85/h; Soren Kettering $135/h; Jonah Fairbourne $135/h; Elena Varga $110/h; Nadia Northcott $110/h; Nell Galloway $85/h; Ines Pemberton $100/h; Dev Hartwell $130/h |

### Vendors

| Vendor | Contact | Email |
|---|---|---|
| Marigold Workforce | Umar Underhill | umar.underhill@marigold-workforce.test |
| Moonrake Talent | Talia Rookwood | talia.rookwood@moonrake-talent.test |
| Moonrake Contractors | Jonah Dunmore | jonah.dunmore@moonrake-contractors.test |

## Tidewhistle Strategy

- **Type:** Subcontractors only
- **Admin:** Ximena Hartwell, ximena.hartwell@tidewhistle-strategy.test

### Consultants

| Name | Email | Type | Pay rate | Paid through |
|---|---|---|---|---|
| Elena Yardley | elena.yardley@tidewhistle-strategy.test | Vendor contractor | $70/h | Stonebridge Workforce |
| Jasper Coldridge | jasper.coldridge@tidewhistle-strategy.test | Vendor contractor | $102/h | Stonebridge Workforce |
| Elena Lindqvist | elena.lindqvist@tidewhistle-strategy.test | Vendor contractor | $77/h | Stonebridge Workforce |
| Omar Greaves | omar.greaves@tidewhistle-strategy.test | Vendor contractor | $85/h | Stonebridge Workforce |
| Felix Varga | felix.varga@tidewhistle-strategy.test | Vendor contractor | $65/h | Stonebridge Workforce |

### Clients and projects

Every consultant is assigned to every project at the bill rate shown.

| Client | Project | Code | Bill rates |
|---|---|---|---|
| Brightmoor Freight | ERP Rollout | BF-01 | Elena Yardley $115/h; Jasper Coldridge $165/h; Elena Lindqvist $140/h; Omar Greaves $150/h; Felix Varga $110/h |

### Vendors

| Vendor | Contact | Email |
|---|---|---|
| Stonebridge Workforce | Mira Hartwell | mira.hartwell@stonebridge-workforce.test |

## Ironfern Systems Consulting

- **Type:** Employees only
- **Admin:** Zara Fenwick, zara.fenwick@ironfern-systems-consulting.test

### Consultants

| Name | Email | Type | Pay rate | Paid through |
|---|---|---|---|---|
| Hana Northcott | hana.northcott@ironfern-systems-consulting.test | Employee | $93/h | Paid directly |
| Idris Lindqvist | idris.lindqvist@ironfern-systems-consulting.test | Employee | $84/h | Paid directly |
| Quentin Greaves | quentin.greaves@ironfern-systems-consulting.test | Employee | $95/h | Paid directly |
| Camila Rookwood | camila.rookwood@ironfern-systems-consulting.test | Employee | $63/h | Paid directly |
| Mira Thistlewood | mira.thistlewood@ironfern-systems-consulting.test | Employee | $66/h | Paid directly |

### Clients and projects

Every consultant is assigned to every project at the bill rate shown.

| Client | Project | Code | Bill rates |
|---|---|---|---|
| Starling Insurance | Integration Hub | SI-01 | Hana Northcott $150/h; Idris Lindqvist $120/h; Quentin Greaves $135/h; Camila Rookwood $115/h; Mira Thistlewood $95/h |
| Crestfall Health | Process Redesign | CH-02 | Hana Northcott $160/h; Idris Lindqvist $150/h; Quentin Greaves $155/h; Camila Rookwood $120/h; Mira Thistlewood $105/h |

### Vendors

| Vendor | Contact | Email |
|---|---|---|
| Willowbank Contractors | Bruno Ashdown | bruno.ashdown@willowbank-contractors.test |
| Silverbirch Contractors | Esme Ashdown | esme.ashdown@silverbirch-contractors.test |
| Harborlight Talent | Ines Ashdown | ines.ashdown@harborlight-talent.test |

## Saltmarsh & Finch Advisors

- **Type:** Subcontractors only
- **Admin:** Nadia Galloway, nadia.galloway@saltmarsh-and-finch-advisors.test

### Consultants

| Name | Email | Type | Pay rate | Paid through |
|---|---|---|---|---|
| Nadia Varga | nadia.varga@saltmarsh-and-finch-advisors.test | Vendor contractor | $96/h | Stonebridge Resourcing |
| Bruno Draycott | bruno.draycott@saltmarsh-and-finch-advisors.test | Vendor contractor | $72/h | Oakmoss Talent |
| Jasper Abernathy | jasper.abernathy@saltmarsh-and-finch-advisors.test | Vendor contractor | $117/h | Stonebridge Resourcing |
| Dmitri Quarles | dmitri.quarles@saltmarsh-and-finch-advisors.test | Vendor contractor | $113/h | Foxglove Resourcing |
| Quentin Ingleby | quentin.ingleby@saltmarsh-and-finch-advisors.test | Vendor contractor | $76/h | Foxglove Resourcing |
| Hugo Rookwood | hugo.rookwood@saltmarsh-and-finch-advisors.test | Vendor contractor | $70/h | Foxglove Resourcing |
| Farah Bellweather | farah.bellweather@saltmarsh-and-finch-advisors.test | Vendor contractor | $65/h | Foxglove Resourcing |
| Ines Fairbourne | ines.fairbourne@saltmarsh-and-finch-advisors.test | Vendor contractor | $75/h | Stonebridge Resourcing |
| Anika Okonkwo | anika.okonkwo@saltmarsh-and-finch-advisors.test | Vendor contractor | $89/h | Foxglove Resourcing |

### Clients and projects

Every consultant is assigned to every project at the bill rate shown.

| Client | Project | Code | Bill rates |
|---|---|---|---|
| Glenrock Media | Cloud Migration | GM-01 | Nadia Varga $175/h; Bruno Draycott $125/h; Jasper Abernathy $175/h; Dmitri Quarles $190/h; Quentin Ingleby $125/h; Hugo Rookwood $115/h; Farah Bellweather $110/h; Ines Fairbourne $140/h; Anika Okonkwo $125/h |

### Vendors

| Vendor | Contact | Email |
|---|---|---|
| Stonebridge Resourcing | Ines Elsworth | ines.elsworth@stonebridge-resourcing.test |
| Oakmoss Talent | Felix Draycott | felix.draycott@oakmoss-talent.test |
| Foxglove Resourcing | Dmitri Bellweather | dmitri.bellweather@foxglove-resourcing.test |

## Lanternhook Consulting Group

- **Type:** Mixed
- **Admin:** Ximena Thistlewood, ximena.thistlewood@lanternhook-consulting-group.test

### Consultants

| Name | Email | Type | Pay rate | Paid through |
|---|---|---|---|---|
| Felix Whitlock | felix.whitlock@lanternhook-consulting-group.test | Employee | $53/h | Paid directly |
| Omar Fenwick | omar.fenwick@lanternhook-consulting-group.test | Vendor contractor | $111/h | Cinderpath Resourcing |
| Ines Lindqvist | ines.lindqvist@lanternhook-consulting-group.test | Vendor contractor | $64/h | Harborlight Contractors |
| Omar Whitlock | omar.whitlock@lanternhook-consulting-group.test | Employee | $50/h | Paid directly |
| Idris Whitlock | idris.whitlock@lanternhook-consulting-group.test | Employee | $79/h | Paid directly |
| Jasper Brightwater | jasper.brightwater@lanternhook-consulting-group.test | Employee | $83/h | Paid directly |
| Elena Abernathy | elena.abernathy@lanternhook-consulting-group.test | Employee | $92/h | Paid directly |
| Greta Varga | greta.varga@lanternhook-consulting-group.test | Employee | $45/h | Paid directly |
| Yusuf Coldridge | yusuf.coldridge@lanternhook-consulting-group.test | Employee | $61/h | Paid directly |

### Clients and projects

Every consultant is assigned to every project at the bill rate shown.

| Client | Project | Code | Bill rates |
|---|---|---|---|
| Meadowgate Freight | Customer Portal | MF-01 | Felix Whitlock $90/h; Omar Fenwick $210/h; Ines Lindqvist $95/h; Omar Whitlock $85/h; Idris Whitlock $145/h; Jasper Brightwater $155/h; Elena Abernathy $160/h; Greta Varga $70/h; Yusuf Coldridge $95/h |
| Riverbend Energy | CRM Upgrade | RE-02 | Felix Whitlock $85/h; Omar Fenwick $210/h; Ines Lindqvist $105/h; Omar Whitlock $95/h; Idris Whitlock $110/h; Jasper Brightwater $140/h; Elena Abernathy $170/h; Greta Varga $85/h; Yusuf Coldridge $90/h |
| Summitline Retail | Integration Hub | SR-03 | Felix Whitlock $95/h; Omar Fenwick $205/h; Ines Lindqvist $95/h; Omar Whitlock $75/h; Idris Whitlock $125/h; Jasper Brightwater $115/h; Elena Abernathy $140/h; Greta Varga $65/h; Yusuf Coldridge $90/h |
| Eastholm Retail | Cost Reduction Study | ER-04 | Felix Whitlock $100/h; Omar Fenwick $190/h; Ines Lindqvist $95/h; Omar Whitlock $80/h; Idris Whitlock $115/h; Jasper Brightwater $115/h; Elena Abernathy $135/h; Greta Varga $75/h; Yusuf Coldridge $90/h |

### Vendors

| Vendor | Contact | Email |
|---|---|---|
| Harborlight Contractors | Dev Fairbourne | dev.fairbourne@harborlight-contractors.test |
| Cinderpath Resourcing | Esme Quarles | esme.quarles@cinderpath-resourcing.test |
| Marigold Resourcing | Felix Underhill | felix.underhill@marigold-resourcing.test |

## Juniperwick Partners

- **Type:** Employees only
- **Admin:** Dmitri Yardley, dmitri.yardley@juniperwick-partners.test

### Consultants

| Name | Email | Type | Pay rate | Paid through |
|---|---|---|---|---|
| Camila Ingleby | camila.ingleby@juniperwick-partners.test | Employee | $87/h | Paid directly |
| Nell Greaves | nell.greaves@juniperwick-partners.test | Employee | $57/h | Paid directly |
| Gideon Okonkwo | gideon.okonkwo@juniperwick-partners.test | Employee | $94/h | Paid directly |
| Bruno Lindqvist | bruno.lindqvist@juniperwick-partners.test | Employee | $46/h | Paid directly |
| Hana Jessop | hana.jessop@juniperwick-partners.test | Employee | $46/h | Paid directly |
| Luca Ashdown | luca.ashdown@juniperwick-partners.test | Employee | $90/h | Paid directly |

### Clients and projects

Every consultant is assigned to every project at the bill rate shown.

| Client | Project | Code | Bill rates |
|---|---|---|---|
| Eastholm Freight | Process Redesign | EF-01 | Camila Ingleby $140/h; Nell Greaves $85/h; Gideon Okonkwo $165/h; Bruno Lindqvist $85/h; Hana Jessop $70/h; Luca Ashdown $145/h |
| Summitline Media | Cloud Migration | SM-02 | Camila Ingleby $140/h; Nell Greaves $95/h; Gideon Okonkwo $155/h; Bruno Lindqvist $70/h; Hana Jessop $70/h; Luca Ashdown $135/h |
| Riverbend Logistics | Security Review | RL-03 | Camila Ingleby $125/h; Nell Greaves $95/h; Gideon Okonkwo $145/h; Bruno Lindqvist $70/h; Hana Jessop $75/h; Luca Ashdown $145/h |

### Vendors

| Vendor | Contact | Email |
|---|---|---|
| Foxglove Staffing | Jonah Quarles | jonah.quarles@foxglove-staffing.test |
| Willowbank Workforce | Kofi Kettering | kofi.kettering@willowbank-workforce.test |
| Bluegate Contractors | Dev Greaves | dev.greaves@bluegate-contractors.test |

## Hollowmere Digital

- **Type:** Subcontractors only
- **Admin:** Bruno Hartwell, bruno.hartwell@hollowmere-digital.test

### Consultants

| Name | Email | Type | Pay rate | Paid through |
|---|---|---|---|---|
| Leona Calloway | leona.calloway@hollowmere-digital.test | Vendor contractor | $117/h | Foxglove Contractors |
| Soren Pemberton | soren.pemberton@hollowmere-digital.test | Vendor contractor | $96/h | Foxglove Contractors |
| Anika Quarles | anika.quarles@hollowmere-digital.test | Vendor contractor | $102/h | Foxglove Contractors |

### Clients and projects

Every consultant is assigned to every project at the bill rate shown.

| Client | Project | Code | Bill rates |
|---|---|---|---|
| Crestfall Manufacturing | Analytics Dashboard | CM-01 | Leona Calloway $210/h; Soren Pemberton $170/h; Anika Quarles $150/h |

### Vendors

| Vendor | Contact | Email |
|---|---|---|
| Foxglove Contractors | Mira Elsworth | mira.elsworth@foxglove-contractors.test |
