import { 英文高级帮助 } from './helpManualEnglishAdvanced'

export interface 英文帮助条目 {
  分类: string
  标题: string
  摘要: string
  步骤: string[]
  提醒?: string
  关键词?: string
}

/** 手册为产品固定内容，英文版本与中文主题按标识对应。 */
export const 英文帮助主题: Record<string, 英文帮助条目> = {
  start: {
    分类: 'Getting started', 标题: 'Start from Home', 摘要: 'Create, open, and find recent files on Home. Switch open files using the tabs at the bottom.',
    步骤: [
      'Select New to create a document, spreadsheet, or presentation.',
      'Select Open to choose local files, or drag one or more files from your file manager into the window.',
      'Reopen files from Recent. Use Batch manage to select and remove multiple entries.',
      'Switch between open files using the bottom tabs. Check for unsaved changes before closing a tab.',
    ],
    提醒: 'Cloud documents and shared spaces require a server. Removing recent entries does not delete the files on disk.',
  },
  privacy: {
    分类: 'Getting started', 标题: 'Privacy and data storage', 摘要: 'Files, settings, and conversations are kept locally; network features send the data needed for a request to the service you choose.',
    步骤: [
      'Local files are opened, edited, saved, printed, and exported on your device. Cloud features require sign-in and activation; private files are encrypted on the device before upload or automatic sync.',
      'Keys, conversations, and memory are encrypted in the local user data directory. Unsaved workspace recovery backups are stored as plaintext.',
      'When using online features such as the assistant, translation, voice, or presentation generation, only the content needed for the request is sent to the service you configured. HTTPS is required except for local addresses.',
      'Screen recording captures the screen or window you choose. Enable the microphone separately; recordings are written to a local file only when saved.',
      'To clear local app data, remove the user data directory (default %APPDATA%\\seal-office), including after uninstall. Your separately saved documents are not removed. Manage cloud data separately in the relevant cloud service.',
    ],
    提醒: 'See the privacy statement in the repository. How a provider retains and uses your content depends on its terms and privacy policy.',
  },
  save: {
    分类: 'File management', 标题: 'Save and Save As', 摘要: 'Choose a location on the first save; subsequent saves use the same path.',
    步骤: [
      'Select Save in the editor’s File ribbon. Documents and spreadsheets also support Ctrl+S.',
      'On the first save, choose a folder and filename in the system dialog. The bottom tab displays the saved name.',
      'To preserve the original file, choose Save As and select another name or path.',
      'When closing with unsaved documents, Save and exit saves existing paths and asks for locations for new files, then exits after all saves succeed.',
    ],
    提醒: 'If import reports compatibility issues, save a copy and review it before replacing the original. Save and exit stops and explains when it cannot safely overwrite such a file.',
  },
  fidelity: {
    分类: 'File management', 标题: 'Check format compatibility', 摘要: 'Review unsupported content after importing a complex file before saving a copy.',
    步骤: [
      'When a DOCX, XLSX, or PPTX shows a compatibility warning, review the objects listed as not imported.',
      'Keep the source file and use Save As to choose a different path.',
      'Reopen the saved copy and check its text, numbers, pages, and layout; unsupported content may still be missing.',
    ],
    提醒: 'DOCX can retain inline PNG, JPEG, GIF, and BMP images. Floating or cropped pictures, charts, and complex animations may not round-trip fully; review the warning.',
  },
  'local-files': {
    分类: 'File management', 标题: 'Browse local folders', 摘要: 'Browse office files in common folders from Home.',
    步骤: [
      'Choose Desktop, Documents, or Downloads under Local on the left of Home.',
      'The list shows file names, sizes, and modified times. Select Refresh to read the latest contents.',
      'Select Open beside a file to open a bottom tab and add it to Recent.',
    ],
    提醒: 'Only supported office files in the top level of the selected folder are shown. Use Open on Home to choose other locations.',
  },
  'access-database': {
    分类: 'Database', 标题: 'Use an Access database', 摘要: 'View and maintain Access 2003 MDB and Access 2007 or newer ACCDB data in the Windows desktop app.',
    步骤: [
      'Open Access database from Apps. If prompted, install Microsoft 365 Access Runtime matching the Office architecture using the provided link.',
      'Select Open database to choose an Access 2003 MDB or a supported Access 2007–2024 / Microsoft 365 ACCDB, or create a new ACCDB.',
      'Choose a table on the left. In Data, query and export CSV; edit or delete rows when an identifiable primary key is available.',
      'Table design displays fields and indexes and creates or deletes tables. Relationships displays foreign keys. SQL offers read-only queries and separately confirmed changes.',
      'Import CSV into a new or existing table, up to 10,000 rows at once. Back up the original database before changing data or structure.',
    ],
    提醒: 'This workspace is not a full Microsoft Access replacement: it neither runs nor edits VBA, macros, ActiveX, forms, or reports. Convert Access 2002/XP or older MDB files to Access 2003 MDB or ACCDB first. Windows desktop only.',
  },
  'float-panel': {
    分类: 'Getting started', 标题: 'Selection toolbar and context menus', 摘要: 'Selecting text, cells, or objects opens a context toolbar; right-click menus provide common actions.',
    步骤: [
      'Select text in a document or PDF, drag across spreadsheet cells, or select a slide text box or object to show its toolbar.',
      'Available actions vary by content: document formatting and lists; spreadsheet formatting, alignment, merging, wrapping, sum and clear; slide clipboard, ordering, alignment and formatting; PDF copy, translation, explanation, summary and questions.',
      'AI shortcuts can refine, expand, shorten, rewrite, change tone, translate, explain, summarize, continue, or answer questions about the selection. Review proposed changes before applying; changes can be undone.',
      'The toolbar keeps the selection while you click. Scrolling, pressing Esc, or clearing the selection hides it.',
      'Context menus also provide formatting and AI actions; spreadsheet menus include sum, clear, sort, filter and deduplicate, and PDF menus include copying selected, page, or full text.',
    ],
    提醒: 'The toolbar appears for selected editor content. Configure a model service in Settings before using AI shortcuts.',
  },
  zoom: {
    分类: 'Getting started', 标题: 'Zoom page content', 摘要: 'Hold Ctrl and use the mouse wheel over an editor to zoom.',
    步骤: [
      'In a document, spreadsheet, presentation, or PDF, hold Ctrl (Command on macOS) while scrolling up to zoom in or down to zoom out.',
      'Use the minus, percentage, and plus controls in the lower-right status bar. Select the percentage to reset to 100%.',
      'The default opening zoom is 150%; the supported range is 8.33%–6400%. Scrolling past a limit does not exceed it.',
      'Zoom affects your view only. It is not saved into the document and does not change printed or exported page dimensions.',
      'Without Ctrl, the wheel scrolls normally. Editor operations such as slide sorting continue to use their own scrolling behavior.',
    ],
    提醒: 'Zoom is not saved with the file. Input-device sensitivity varies; touchpads may need more scrolling for one step.',
  },
  word: {
    分类: 'Edit documents', 标题: 'Text documents', 摘要: 'Edit text, paragraphs, and simple tables; navigate headings and find or replace text.',
    步骤: [
      'Create a text document on Home, or open a local DOCX, HTML, or TXT file.',
      'Select text and use the Home ribbon to adjust font, emphasis, alignment, and lists.',
      'Use Page Layout to set paper, orientation, margins, columns, borders, background, and text direction; custom dimensions retain their values.',
      'Press Ctrl+F to find text. Use Breaks to insert a page break that retains its position after saving.',
      'Review the layout before saving. Save a copy when compatibility warnings appear and address objects reported as unable to round-trip.',
    ],
    提醒: 'Inline pictures can be saved and reopened in DOCX. Text watermarks, floating or cropped pictures, headers, footers, and footnotes may not fully round-trip; preserve the source when warned.',
  },
  'word-images': {
    分类: 'Edit documents', 标题: 'Select, move, rotate, and crop images', 摘要: 'Use the image toolbar to change size, layout, rotation, flip, crop, or extract text.',
    步骤: [
      'Select a local PNG, JPEG, GIF, or BMP from the Insert ribbon.',
      'Select the image to show eight handles. Corners resize proportionally; side handles adjust one dimension. Size accepts precise values in centimeters.',
      'Drag the top rotation handle, holding Shift for 15-degree increments, or enter an angle under Image rotation. More actions includes flipping, resetting, and deleting.',
      'Drag an image into the text, or choose Move image and select a target position. Esc, system cancellation, or losing focus cancels the drag.',
      'Layout options place the image in a left-aligned, centered, or right-aligned paragraph while keeping adjacent text. Crop creates a real image from edge percentages and can be undone.',
      'Image preview shows crop and rotation. Extract text uses the configured image-recognition model; review the result before copying or inserting it.',
      'Local changes support undo, redo, and DOCX save and reopen. On mobile, the toolbar is below the screen and handles support touch.',
    ],
    提醒: 'Images are limited to 20 MB each and 100 MB per document; crops are limited to 8192 pixels per side and 16 million pixels. Review import warnings for floating wrap, non-destructive OOXML crops, SVG, WebP, and effects. AI image editing is not connected; text extraction needs an image-capable model.',
  },
  navigation: {
    分类: 'Edit documents', 标题: 'Heading navigation', 摘要: 'Use document headings to find locations in long text.',
    步骤: ['Select a paragraph and apply a heading style.', 'Open the View ribbon and select Navigation pane.', 'Select a heading to scroll the document to it.', 'Select Navigation pane again or Close in the pane to hide it.'],
    提醒: 'Only paragraphs with a heading style appear in the navigation pane.',
  },
  'mail-merge': {
    分类: 'Edit documents', 标题: 'Mail merge', 摘要: 'Generate a document from a local list of records.',
    步骤: ['Enter {{field name}} in the template, matching each list column name exactly.', 'Select Mail merge and paste a list or choose a local CSV file. The first row contains field names and each following row is one record.', 'Select Preview to review the first record and total count, then Generate new document.', 'The result opens in a new tab, with each record on its own page. Review and save it locally.'],
    提醒: 'The original template is not modified. Enclose list values containing commas or newlines in double quotes.',
  },
  sheet: {
    分类: 'Edit documents', 标题: 'Spreadsheets', 摘要: 'Enter data, format cells, and use supported formulas.',
    步骤: [
      'Create a spreadsheet or open local XLSX or CSV from Home or the ribbon. CSV preserves leading zeroes and text starting with an equals sign.',
      'Select a cell to enter text or numbers; start with an equals sign to enter a formula.',
      'Set borders, alignment, and number formats in the ribbon. Data validation can restrict choices or numeric ranges.',
      'Use Insert > Picture to add local PNG or JPEG images. View or delete them in the grid; they reopen with XLSX.',
      'Use Protect sheet to prevent accidental changes; remove local protection before editing.',
      'Spell check finds repeated function words and half-width punctuation in Chinese text; confirm suggestions before applying.',
      'Saving keeps a CSV or TSV source format and encoding. Confirm conversion losses for formulas or styles; use XLSX for multiple sheets. Preserve originals and save copies when compatibility warnings appear.',
    ],
    提醒: 'Sheet protection has no password and spell check does not use a dictionary. Images must be PNG or JPEG, up to 5 MB each. Review compatibility warnings for complex formulas, charts, pivots, and externally protected files.',
  },
  slides: {
    分类: 'Edit documents', 标题: 'Presentations', 摘要: 'Edit and present slides and their objects.',
    步骤: [
      'Create a presentation or open a local PPTX. Use the Home tab at the bottom to return to Home.',
      'Choose a slide thumbnail; use the ribbon to add, delete, or duplicate slides.',
      'Open Slide sorter to preview and reorder slides, or Notes page to enter speaker notes.',
      'Edit text and set supported transitions. Press F5 to present from the start or Shift+F5 from the current slide. Desktop presentation fills the current screen and hides editing controls.',
      'Click or use arrow keys to advance. Esc or advancing past the last slide ends the show and restores the window and assistant, retaining the last viewed slide.',
      'Save as PPTX. Supported notes and transitions remain editable after reopening. Save a copy when import warnings appear.',
    ],
  },
  pdf: {
    分类: 'Read and process', 标题: 'Read and process PDF', 摘要: 'Read centered pages and open or collapse tools on the right.',
    步骤: ['Open a PDF from Home or add one in PDF tools.', 'Navigate and zoom in the reader; choose extract, merge, delete, or rotate from the right.', 'Expand the tool, enter page numbers as requested, and choose where to save the result.', 'After saving, the result opens in a new bottom tab.'],
    提醒: 'Page operations produce a new PDF file. Check the available PDF tools for editing and other supported operations.',
  },
  calendar: {
    分类: 'Local tools', 标题: 'Local calendar', 摘要: 'Schedule events stored on this device.',
    步骤: ['Open Calendar from Home, select a date, and choose Add event.', 'Enter a title and start and end times. Saved events can be viewed, edited, or deleted on that date.', 'Select Export calendar to create a file for importing into another calendar app.'],
    提醒: 'Events are stored in this device’s application data; export them before moving to another device.',
  },
  diagrams: {
    分类: 'Local tools', 标题: 'Mind maps and flowcharts', 摘要: 'Edit nodes and connections and save editable data.',
    步骤: ['Choose Mind map or Flowchart from Home and select a node on the canvas.', 'Add nodes, edit text, and drag nodes to reposition them; connect flowchart steps using the controls on the right.', 'Use Export data for an editable backup or Export image for a graphic.', 'Use Import data to continue editing; confirm before replacing the current canvas.'],
    提醒: 'Importing or creating a new canvas replaces the current one. Export editable data first.',
  },
  assistant: {
    分类: 'Smart tools', 标题: 'Use the built-in assistant', 摘要: 'Configure a model provider to discuss a file and review proposed changes.',
    步骤: [
      'Choose DeepSeek, Doubao, Zhipu, Kimi, or a custom provider in model settings. DeepSeek defaults to deepseek-flash; Doubao requires an enabled model ID or endpoint. Set the context token limit to the model’s supported window.',
      'The default reasoning level is High. The interface shows the level actually used by the provider. Save a different default in model settings; configure custom reasoning parameters according to the provider.',
      'Open a document, spreadsheet, or presentation and describe the summary, rewrite, formatting, or cell edits you need. The assistant plans, reads file ranges, and validates changes. Plan-only mode waits for Execute plan.',
      'Provider reasoning and output stream as returned. Stop generation cancels the actual request while retaining received content and validated candidates. Validation failures are returned to the model.',
      'Review original and proposed text or formatting, including paginated large proposals, then apply. Word supports heading level, alignment, size, font, color, bold, spacing, and indentation.',
      'Save the file after applying changes; use editor Undo to revert. Conversation memory is encrypted locally and follows the saved file path. Memory can be compressed near the model window or cleared with New conversation.',
      'Changing tabs during a request does not modify another file. Request again if the original content changed; expired candidates are not restored when reopening.',
    ],
    提醒: 'Provider presets do not include model weights or free usage. File name, text, and location data may be sent; disk paths and image bytes are not. Reasoning shows only what the provider returns. Changes are validated and may be configured for automatic or manual confirmation. Keys are encrypted and not displayed again.',
  },
  settings: {
    分类: 'Settings and troubleshooting', 标题: 'Settings and recovery', 摘要: 'Manage appearance, translation services, and local workspace preferences.',
    步骤: ['Choose light or dark appearance and set workspace recovery, tab closing, and new-file notifications.', 'To use document translation, enter and save the translation service endpoint and key.', 'After an unexpected exit, reopen the app to restore the workspace and unsaved markers; review and save your content.', 'Use Restore initial defaults to clear local appearance and other settings.'],
    提醒: 'Restoring defaults does not delete documents you saved.',
  },
  associations: {
    分类: 'Settings and troubleshooting', 标题: 'Windows file associations', 摘要: 'Open supported office files into the existing workspace by double-clicking them in File Explorer.',
    步骤: [
      'The installer registers File Explorer New-menu templates for DOC, DOCX, PPT, PPTX, PDF, XLS, and XLSX. Restart Explorer or sign out if Windows still caches old entries.',
      'In component settings, the enabled-by-default startup check examines registered formats. If the app is not the default, confirm registration and then use the Windows default-app page.',
      'If Windows keeps another selection, review the listed formats and select Open system page to confirm associations there.',
      'Double-click an associated file in Explorer. If the app is running, it opens in a bottom tab without closing existing tabs.',
    ],
    提醒: 'Modern Windows requires default-app choices to be confirmed in Settings and may reject silent changes (including error 0x80070483). Supported file types use distinct document, spreadsheet, presentation, and PDF icons. Legacy DOC/XLS/PPT use the bundled converter; macros are not executed and require saving to a regular format after editing. OFD supports reading, printing, copying, and PDF export.',
  },
  alerts: {
    分类: 'Settings and troubleshooting', 标题: 'New file notifications', 摘要: 'Detect new office files in selected common folders while the desktop app is running.',
    步骤: ['Enable New file notifications in notification settings.', 'Choose Desktop, Documents, or Downloads. The initial scan records existing files without alerting for them.', 'When a new file appears, its name is shown; open it from the matching Home folder.', 'Turn the switch off to stop monitoring.'],
    提醒: 'Notifications work while the Windows desktop app is running and monitor supported files in the folder’s top level.',
  },
  ...英文高级帮助,
}
