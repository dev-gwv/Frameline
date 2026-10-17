/**
 * Frameline support Sheet (Google Apps Script). The support desk's side for people.
 *
 * Frameline adds a row here for every ticket the assistant hands to the team, and adds the studio's later
 * messages to that row's "Notes from studio". You answer in "Reply to studio" and set Status; within five
 * minutes (or Frameline → Send replies now) the reply lands in the studio's ticket and they get an email.
 *
 * Setup, once (about 5 minutes):
 *  1. Make a new Google Sheet. Extensions → Apps Script. Paste this whole file over the sample code. Save.
 *  2. Project Settings (gear) → Script Properties → add:
 *       SECRET     the same long random text as Frameline's SUPPORT_SHEET_SECRET (24+ characters)
 *       REPLY_URL  https://frameline-api.dev-d9b.workers.dev/v1/integrations/support/reply
 *  3. In the editor pick the function "setup" and press Run. Allow the permissions it asks for.
 *     It makes the "Tickets" tab with its columns and a 5-minute timer that sends your replies.
 *  4. Deploy → New deployment → type "Web app". Execute as: Me. Who has access: Anyone. Deploy.
 *     Copy the Web app URL: that is Frameline's SUPPORT_SHEET_URL.
 *     (Anyone with the URL can reach it, but every request must carry the SECRET, or it is ignored.)
 *
 * Daily use: sort or filter by Status. Statuses:
 *   New → Looking (optional, so others know someone has it) → Replied (an answer, still open)
 *   → Fixed (a bug fixed: the studio is told it is fixed) or Resolved (done: the ticket closes).
 *   "Studio replied" means the studio wrote again: read "Notes from studio", write a new reply, clear
 *   "Sent at", and set the status again.
 */

const SHEET_NAME = 'Tickets'
const HEADERS = [
  'Ticket ID', 'Opened', 'Studio', 'Plan', 'Person', 'Type', 'Urgency', 'Subject', 'Summary', 'Steps to repeat',
  'Their message', 'Event', 'Gallery', 'Where', 'Screenshots', 'Notes from studio', 'Status', 'Reply to studio',
  'Handled by', 'Sent at',
]
const STATUSES = ['New', 'Looking', 'Replied', 'Fixed', 'Resolved', 'Studio replied']
const col = (name) => HEADERS.indexOf(name) + 1

function props() {
  const p = PropertiesService.getScriptProperties()
  return { secret: p.getProperty('SECRET') || '', replyUrl: p.getProperty('REPLY_URL') || '' }
}

function sheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet()
  return ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME)
}

const json = (o) => ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON)

/** Frameline → Sheet: a new ticket for the team ("append"), or the studio wrote again ("note"). */
function doPost(e) {
  let body
  try { body = JSON.parse(e.postData.contents) } catch (err) { return json({ ok: false, error: 'bad json' }) }
  const { secret } = props()
  if (!secret || body.secret !== secret) return json({ ok: false, error: 'wrong secret' })
  const lock = LockService.getScriptLock()
  lock.waitLock(20000)
  try {
    const sh = sheet()
    if (body.action === 'append') {
      const r = body.row || {}
      if (findRow(sh, r.ticketId)) return json({ ok: true, duplicate: true })
      sh.appendRow([
        r.ticketId, r.opened, r.studio, r.plan, r.person, r.type, r.urgency, r.subject, r.summary, r.steps,
        r.message, r.event, r.gallery, r.platform, r.files, '', 'New', '', '', '',
      ])
      if (r.urgency === 'high') sh.getRange(sh.getLastRow(), 1, 1, HEADERS.length).setBackground('#fde8e8')
      return json({ ok: true })
    }
    if (body.action === 'note') {
      const row = findRow(sh, body.ticketId)
      if (!row) return json({ ok: true, missing: true })
      const cell = sh.getRange(row, col('Notes from studio'))
      const stamp = Utilities.formatDate(new Date(body.at || Date.now()), 'Asia/Kolkata', 'd MMM, h:mm a')
      cell.setValue(`${cell.getValue() ? `${cell.getValue()}\n\n` : ''}[${stamp}] ${body.note}`)
      sh.getRange(row, col('Status')).setValue('Studio replied')
      return json({ ok: true })
    }
    return json({ ok: false, error: 'unknown action' })
  } finally {
    lock.releaseLock()
  }
}

function findRow(sh, ticketId) {
  if (!ticketId || sh.getLastRow() < 2) return 0
  const ids = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues()
  for (let i = 0; i < ids.length; i++) if (ids[i][0] === ticketId) return i + 2
  return 0
}

/** Sheet → Frameline: every row with a status of Replied, Fixed or Resolved and no "Sent at" yet. */
function sendReplies() {
  const { secret, replyUrl } = props()
  if (!secret || !replyUrl) throw new Error('Set SECRET and REPLY_URL in Project Settings → Script Properties.')
  const sh = sheet()
  if (sh.getLastRow() < 2) return
  const rows = sh.getRange(2, 1, sh.getLastRow() - 1, HEADERS.length).getValues()
  rows.forEach((r, i) => {
    const status = String(r[col('Status') - 1]).trim()
    const reply = String(r[col('Reply to studio') - 1]).trim()
    const sent = r[col('Sent at') - 1]
    if (sent || !['Replied', 'Fixed', 'Resolved'].includes(status)) return
    if (status === 'Replied' && !reply) return
    const res = UrlFetchApp.fetch(replyUrl, {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      payload: JSON.stringify({ secret, ticketId: r[0], reply, status: status.toLowerCase(), by: String(r[col('Handled by') - 1] || '') }),
    })
    const ok = res.getResponseCode() === 200
    sh.getRange(i + 2, col('Sent at')).setValue(ok ? new Date() : `Not sent (${res.getResponseCode()}): ${res.getContentText().slice(0, 120)}`)
  })
}

/** Run once from the editor: the tab, its columns, the Status choices and the 5-minute timer. */
function setup() {
  const sh = sheet()
  sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold').setBackground('#f3efe7')
  sh.setFrozenRows(1)
  sh.setColumnWidths(1, HEADERS.length, 140)
  ;['Summary', 'Their message', 'Notes from studio', 'Reply to studio'].forEach((h) => sh.setColumnWidth(col(h), 320))
  const rule = SpreadsheetApp.newDataValidation().requireValueInList(STATUSES, true).setAllowInvalid(false).build()
  sh.getRange(2, col('Status'), 1000, 1).setDataValidation(rule)
  ScriptApp.getProjectTriggers().filter((t) => t.getHandlerFunction() === 'sendReplies').forEach((t) => ScriptApp.deleteTrigger(t))
  ScriptApp.newTrigger('sendReplies').timeBased().everyMinutes(5).create()
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Frameline').addItem('Send replies now', 'sendReplies').addToUi()
}
