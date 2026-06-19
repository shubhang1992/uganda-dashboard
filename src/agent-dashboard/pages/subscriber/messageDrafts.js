/** Starting drafts for the agent's outreach to a subscriber. checkInMessage
 *  prefills the WhatsApp / Text deep links in MessageLauncher; the nudge flows
 *  (NudgeSheet) supply their own drafts. Kept in its own module so the component
 *  files only export components (fast-refresh / react-refresh stays happy). */

function firstName(name) {
  return (name || '').trim().split(/\s+/)[0] || 'there';
}

/** Neutral check-in draft for a general "Message this subscriber" action. */
export function checkInMessage(recipients) {
  const lead = recipients.length === 1 ? `Hi ${firstName(recipients[0].name)}, ` : 'Hi, ';
  return `${lead}your Universal Pensions agent here — just checking in. Let me know if you need any help with your pension, contributions, or insurance. Thank you!`;
}
