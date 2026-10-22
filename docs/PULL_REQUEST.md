# Build SIMINU RSAS frontend demo with correspondence workflow

Implement the initial React, Vite, and TypeScript application for RSAS administration. The demo runs without a backend or credentials and persists metadata and attachments in IndexedDB.

The main workflow covers incoming-letter registration, leadership submission, multiunit dispositions, recipient tasks, progress, completion reports, result review/return, and archival. A document stays open until every active required task is complete; copies and discussion messages do not count as completed work. Revisions and cancellation reasons preserve earlier dispositions and task history.

Includes role simulation, searchable registers, work dashboard, outgoing-letter metadata stages, calendar, task Kanban, editable unit hierarchy/PICs, reports/CSV, validated metadata backups, printable disposition sheets, sample PDFs, 32 incoming and 10 outgoing letters, and Vercel SPA configuration.

Validation: production build and TypeScript checks; five repository tests; two Chromium browser scenarios covering the core workflow, persistence/reload, 360 px navigation, dashboard filters, sample PDF content, outgoing stages, calendar, master data, report downloads, metadata export, and print generation. Normal disposition output is one A4 page. See README for commands and demo steps.

The official screenshot and Format Disposisi.pdf were not supplied. Print content follows the textual specification and still needs comparison against that source. No Vercel deployment, production authentication, external notifications, or certified electronic signing is claimed. Browser-local history is mutable; metadata backups exclude attachment bytes. Outgoing letters record administrative stages and do not send correspondence.

The repository was empty. An empty initial commit on main supplies the comparison base; all application code is on feat/siminu-rsas-demo.
