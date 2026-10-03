/**
 * Content script for docs.google.com/forms pages.
 *
 * "Fill this page" writes one generated response into the visible form so it
 * can be reviewed (and submitted by hand). Google's widgets are custom
 * elements, so we drive them the way a user would: native value setters +
 * input events for text, synthetic pointer sequences for radios, checkboxes
 * and dropdowns. Nothing is submitted.
 */
import { OTHER_VALUE } from '../core/constants';
import type { AnswerValue, FormModel, GeneratedResponse, Question } from '../core/types';
import type { AutofillReport, ContentRequest } from '../shared/messages';

declare global {
  interface Window {
    __crowdfillLoaded?: boolean;
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function setValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.dispatchEvent(new Event('blur', { bubbles: true }));
}

function press(el: Element): void {
  const r = el.getBoundingClientRect();
  const init = { bubbles: true, cancelable: true, view: window, button: 0, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
  el.dispatchEvent(new PointerEvent('pointerdown', { ...init, pointerType: 'mouse' }));
  el.dispatchEvent(new MouseEvent('mousedown', init));
  el.dispatchEvent(new PointerEvent('pointerup', { ...init, pointerType: 'mouse' }));
  el.dispatchEvent(new MouseEvent('mouseup', init));
  el.dispatchEvent(new MouseEvent('click', init));
}

async function waitFor<T>(fn: () => T | null | undefined | false, timeout = 2000, step = 50): Promise<T | null> {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const v = fn();
    if (v) return v;
    await sleep(step);
  }
  return null;
}

function containers(): Map<string, HTMLElement> {
  const map = new Map<string, HTMLElement>();
  for (const el of document.querySelectorAll<HTMLElement>('[data-params]')) {
    const m = /^%\.@\.\[(\d+),/.exec(el.getAttribute('data-params') ?? '');
    const li = el.closest<HTMLElement>('[role="listitem"]');
    if (m && li && !map.has(m[1]!)) map.set(m[1]!, li);
  }
  return map;
}

const esc = (s: string) => CSS.escape(s);

function setChecked(el: Element | null, want: boolean): boolean {
  if (!el) return false;
  const is = el.getAttribute('aria-checked') === 'true';
  if (is !== want) {
    el.scrollIntoView({ block: 'nearest' });
    press(el);
  }
  return true;
}

function otherInput(li: HTMLElement): HTMLInputElement | null {
  const other = li.querySelector('[data-value="__other_option__"], [data-answer-value="__other_option__"]');
  const scope = other?.closest('[role="listitem"], label, div[jscontroller]')?.parentElement ?? li;
  return scope.querySelector<HTMLInputElement>('input[type="text"]') ?? li.querySelector<HTMLInputElement>('input[type="text"]');
}

async function pickDropdown(li: HTMLElement, value: string): Promise<boolean> {
  const listbox = li.querySelector<HTMLElement>('[role="listbox"]');
  if (!listbox) return false;
  listbox.scrollIntoView({ block: 'center' });
  await sleep(120);
  press(listbox.querySelector('[jsname="LgbsSe"]') ?? listbox);
  const option = await waitFor(() => {
    const opts = [...document.querySelectorAll<HTMLElement>(`[role="option"][data-value="${esc(value)}"]`)];
    return opts.reverse().find((o) => o.getBoundingClientRect().height > 0) ?? null;
  });
  if (!option) return false;
  press(option);
  await waitFor(() => listbox.getAttribute('aria-expanded') === 'false', 1500);
  await sleep(150);
  return true;
}

function hidden(name: string): HTMLInputElement | null {
  return document.querySelector<HTMLInputElement>(`input[type="hidden"][name="${esc(name)}"]`);
}

async function fillQuestion(q: Question, a: AnswerValue, li: HTMLElement): Promise<boolean> {
  switch (a.t) {
    case 'text': {
      const input = li.querySelector<HTMLInputElement | HTMLTextAreaElement>('textarea, input[type="text"], input[type="email"], input[type="number"], input[type="url"], input[type="tel"]');
      if (!input) return false;
      setValue(input, a.v);
      return true;
    }
    case 'choice': {
      if (q.kind === 'dropdown') return pickDropdown(li, a.v === OTHER_VALUE ? '' : a.v);
      const target = li.querySelector(`[role="radio"][data-value="${esc(a.v)}"]`);
      if (!setChecked(target, true)) return false;
      if (a.v === OTHER_VALUE) {
        await sleep(80);
        const input = otherInput(li);
        if (input) setValue(input, a.other ?? '');
      }
      return true;
    }
    case 'multi': {
      const boxes = [...li.querySelectorAll('[role="checkbox"]')];
      if (!boxes.length) return false;
      for (const box of boxes) setChecked(box, a.v.includes(box.getAttribute('data-answer-value') ?? ''));
      if (a.v.includes(OTHER_VALUE)) {
        await sleep(80);
        const input = otherInput(li);
        if (input) setValue(input, a.other ?? '');
      }
      return true;
    }
    case 'grid': {
      const groups = [...li.querySelectorAll<HTMLElement>('[role="radiogroup"], [role="group"]')].filter((g) =>
        g.querySelector('[role="radio"], [role="checkbox"]'),
      );
      let ok = false;
      q.rows.forEach((row, i) => {
        const group = groups.find((g) => g.getAttribute('aria-label') === row.label) ?? groups[i];
        if (!group) return;
        const want = a.rows[row.entryId] ?? [];
        for (const cell of group.querySelectorAll('[role="radio"], [role="checkbox"]')) {
          const v = cell.getAttribute('data-value') ?? cell.getAttribute('data-answer-value') ?? '';
          const isRadio = cell.getAttribute('role') === 'radio';
          if (isRadio ? want.includes(v) : true) setChecked(cell, want.includes(v));
        }
        ok = true;
      });
      return ok;
    }
    case 'date': {
      const dateInput = li.querySelector<HTMLInputElement>('input[type="date"]');
      const key = `entry.${q.entryId}`;
      if (dateInput && a.y !== undefined) {
        setValue(dateInput, `${a.y}-${String(a.m).padStart(2, '0')}-${String(a.d).padStart(2, '0')}`);
      }
      const nums = [...li.querySelectorAll<HTMLInputElement>('input[type="number"], input[type="text"]')];
      if (a.hh !== undefined && nums.length >= 2) {
        setValue(nums[nums.length - 2]!, String(a.hh));
        setValue(nums[nums.length - 1]!, String(a.mm ?? 0));
      }
      // Keep Google's hidden fields in sync for layouts without a native date input.
      const set = (suffix: string, v: number | undefined) => {
        const h = hidden(`${key}_${suffix}`);
        if (h && v !== undefined) h.value = String(v);
      };
      set('year', a.y);
      set('month', a.m);
      set('day', a.d);
      set('hour', a.hh);
      set('minute', a.mm);
      return !!dateInput || !!hidden(`${key}_month`);
    }
    case 'time': {
      const nums = [...li.querySelectorAll<HTMLInputElement>('input[type="number"], input[type="text"]')];
      if (nums.length < 2) return false;
      const ampm = li.querySelector('[role="listbox"]');
      const hour = ampm ? a.hh % 12 || 12 : a.hh;
      setValue(nums[0]!, String(hour));
      setValue(nums[1]!, String(a.mm).padStart(2, '0'));
      if (a.ss !== undefined && nums[2]) setValue(nums[2], String(a.ss).padStart(2, '0'));
      if (ampm) {
        const opts = [...li.querySelectorAll('[role="option"]')].map((o) => o.getAttribute('data-value') ?? '').filter(Boolean);
        const want = opts[a.hh >= 12 ? 1 : 0];
        if (want) await pickDropdown(li, want);
      }
      return true;
    }
  }
}

function flash(el: HTMLElement, ok: boolean): void {
  const prev = el.style.boxShadow;
  el.style.transition = 'box-shadow .3s ease';
  el.style.boxShadow = ok ? '0 0 0 2px #6366f1' : '0 0 0 2px #f59e0b';
  setTimeout(() => (el.style.boxShadow = prev), 1600);
}

async function autofill(form: FormModel, res: GeneratedResponse): Promise<AutofillReport> {
  const report: AutofillReport = { filled: 0, skipped: 0, notOnPage: 0, details: [] };
  const byId = containers();
  if (res.email) {
    const email = document.querySelector<HTMLInputElement>('input[type="email"]');
    if (email && !email.closest('[data-params]')) {
      setValue(email, res.email);
      report.filled++;
    }
  }
  for (const q of form.questions) {
    const a = res.answers[q.itemId];
    if (!a) continue;
    const li = byId.get(q.itemId);
    if (!li) {
      report.notOnPage++;
      continue;
    }
    try {
      const ok = await fillQuestion(q, a, li);
      flash(li, ok);
      if (ok) report.filled++;
      else {
        report.skipped++;
        report.details.push(`Could not fill "${q.title || 'untitled'}"`);
      }
    } catch (e) {
      report.skipped++;
      report.details.push(`"${q.title || 'untitled'}": ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return report;
}

if (!window.__crowdfillLoaded) {
  window.__crowdfillLoaded = true;
  chrome.runtime.onMessage.addListener((msg: ContentRequest, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id) return false;
    if (msg.type === 'cf:ping') {
      sendResponse({ ok: true, url: location.href });
      return false;
    }
    if (msg.type === 'cf:autofill') {
      autofill(msg.form, msg.response).then(sendResponse, (e: unknown) =>
        sendResponse({ filled: 0, skipped: 0, notOnPage: 0, details: [String(e)] } satisfies AutofillReport),
      );
      return true;
    }
    return false;
  });
}
