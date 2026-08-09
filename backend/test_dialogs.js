const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const Database = require('better-sqlite3');
const db = new Database('data.db');
const API_ID = 33960207;
const API_HASH = 'b4a1d5e99cce9e6f317596dfc25aa38a';

async function main() {
  const account = db.prepare('SELECT * FROM accounts WHERE id = 4').get();
  const session = new StringSession(account.session_string);
  const client = new TelegramClient(session, API_ID, API_HASH, { connectionRetries: 3, useWSS: false });
  await client.connect();
  const dialogs = await client.getDialogs({ limit: 5 });
  
  for (const d of dialogs) {
    console.log('---');
    console.log('id:', d.id?.toString?.());
    console.log('title:', d.title);
    console.log('name:', d.name);
    console.log('firstName:', d.firstName);
    console.log('unreadCount:', d.unreadCount);
    const lm = d.lastMessage;
    console.log('lastMessage:', lm ? (typeof lm === 'object' ? { id: lm.id, message: lm.message, text: lm.text, className: lm.className } : lm) : 'null');
    console.log('isGroup:', d.isGroup);
    console.log('isChannel:', d.isChannel);
  }
  await client.disconnect();
  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
