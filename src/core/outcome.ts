/**
 * Classifies Google's reply to a `formResponse` POST.
 *
 * Google answers 200 both for success (a confirmation page) and for answers it
 * refuses (it re-renders the form with errors), so the body is inspected too.
 */
import { looksClosed, looksLikeLoginPage } from './parser';

export type SubmitOutcome =
  | { ok: true; confirmed: boolean }
  | {
      ok: false;
      reason: 'login' | 'closed' | 'rejected' | 'rate-limited' | 'server' | 'http' | 'network';
      retryable: boolean;
      message: string;
    };

const CONFIRMATION_MARKERS = ['usp=form_confirm', 'freebirdFormviewerViewResponseConfirmationMessage', 'vHW8K'];

export function classifyResponse(status: number, finalUrl: string, html: string): SubmitOutcome {
  if (status === 429) {
    return { ok: false, reason: 'rate-limited', retryable: true, message: 'Google is rate-limiting submissions (HTTP 429). Slow down the pacing.' };
  }
  if (status >= 500) return { ok: false, reason: 'server', retryable: true, message: `Google returned HTTP ${status}.` };
  if (status === 401 || status === 403 || looksLikeLoginPage(finalUrl, html)) {
    return { ok: false, reason: 'login', retryable: false, message: 'The form requires a signed-in Google account.' };
  }
  if (looksClosed(finalUrl, html)) {
    return { ok: false, reason: 'closed', retryable: false, message: 'The form is no longer accepting responses.' };
  }
  if (status === 400) {
    return { ok: false, reason: 'rejected', retryable: false, message: 'Google rejected the request (HTTP 400). The form may have changed, try reloading it.' };
  }
  if (status < 200 || status >= 300) {
    return { ok: false, reason: 'http', retryable: status === 408, message: `Unexpected HTTP ${status}.` };
  }
  const reRendered = /<form[^>]+action="[^"]*\/formResponse"/.test(html) && html.includes('name="pageHistory"');
  if (reRendered) {
    return {
      ok: false,
      reason: 'rejected',
      retryable: false,
      message: 'Google re-displayed the form: a required answer is missing or failed validation.',
    };
  }
  return { ok: true, confirmed: CONFIRMATION_MARKERS.some((m) => html.includes(m)) };
}
