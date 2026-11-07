/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict')
const path = require('node:path')
const { chromium } = require(path.join(process.env.TEMP, 'budget-reset-tests/node_modules/playwright'))
require('@next/env').loadEnvConfig(process.cwd())

async function main() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
    const authUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const ref = new URL(authUrl).hostname.split('.')[0]
    const user = { id: '00000000-0000-0000-0000-000000000001', aud: 'authenticated', role: 'authenticated', email: 'calendar-test@example.invalid', app_metadata: {}, user_metadata: {} }
    const exp = Math.floor(Date.now() / 1000) + 3600
    const jwt = ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify({ sub: user.id, exp, aud: 'authenticated' })).toString('base64url'), 'mock-signature'].join('.')
    await context.addCookies([{ name: `sb-${ref}-auth-token`, value: 'base64-' + Buffer.from(JSON.stringify({ access_token: jwt, refresh_token: 'mock', expires_at: exp, expires_in: 3600, token_type: 'bearer', user })).toString('base64url'), domain: 'localhost', path: '/' }])
    const page = await context.newPage()
    page.setDefaultTimeout(10000)
    // Keep all account and household data isolated from the live service.
    await page.route(authUrl + '/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(route.request().url().includes('/auth/') ? user : []) }))
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto('http://localhost:3000/dashboard')
    const calendar = page.getByRole('region', { name: '달력', exact: true })
    await calendar.waitFor()
    const heading = calendar.getByRole('heading')
    const initial = await heading.innerText()
    const [year, month] = initial.match(/\d+/g).map(Number)
    const label = offset => {
      const date = new Date(year, month - 1 + offset, 1)
      return `${date.getFullYear()}년 ${date.getMonth() + 1}월`
    }
    const cdp = await context.newCDPSession(page)
    const box = await calendar.boundingBox()
    const y = box.y + 130
    async function swipe(x1, y1, x2, y2) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x1, y: y1, id: 1 }] })
      for (let step = 1; step <= 8; step++) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x1 + (x2 - x1) * step / 8, y: y1 + (y2 - y1) * step / 8, id: 1 }] })
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    }
    async function check(name, run) { await run(); console.log('PASS ' + name) }
    await check('Tapping a date still selects it', async () => {
      await calendar.getByRole('button', { name: '15', exact: true }).tap()
      await page.getByRole('heading', { name: `${month}월 15일 일정`, exact: true }).waitFor()
    })
    await check('Left swipe advances exactly one month without selecting the release date', async () => {
      await swipe(300, y, 90, y)
      assert.equal(await heading.innerText(), label(1))
      const next = new Date(year, month, 1)
      await page.getByRole('heading', { name: `${next.getMonth() + 1}월 1일 일정`, exact: true }).waitFor()
    })
    await check('Right swipe returns to the previous month', async () => {
      await swipe(90, y, 300, y)
      assert.equal(await heading.innerText(), initial)
    })
    await check('A new touch clears suppression for an intentional click', async () => {
      const day = calendar.getByRole('button', { name: '15', exact: true })
      await day.dispatchEvent('touchstart', { touches: [{ identifier: 1, clientX: 200, clientY: y }] })
      await day.dispatchEvent('click', { detail: 1 })
      await day.dispatchEvent('touchcancel', { touches: [] })
      await page.getByRole('heading', { name: `${month}월 15일 일정`, exact: true }).waitFor()
    })
    await check('Small horizontal movements do not change month', async () => {
      await swipe(220, y, 195, y)
      assert.equal(await heading.innerText(), initial)
    })
    await check('Vertical scrolling does not change month', async () => {
      await swipe(220, y, 225, y + 90)
      assert.equal(await heading.innerText(), initial)
    })
    await check('Cancelled and multi-touch gestures do not change month', async () => {
      const touch = { identifier: 1, clientX: 300, clientY: y }
      await calendar.dispatchEvent('touchstart', { touches: [touch] })
      await calendar.dispatchEvent('touchcancel', { touches: [] })
      await calendar.dispatchEvent('touchend', { touches: [], changedTouches: [{ ...touch, clientX: 50 }] })
      assert.equal(await heading.innerText(), initial)
      await calendar.dispatchEvent('touchstart', { touches: [touch] })
      await calendar.dispatchEvent('touchmove', { touches: [touch, { ...touch, identifier: 2 }] })
      await calendar.dispatchEvent('touchend', { touches: [], changedTouches: [{ ...touch, clientX: 50 }] })
      assert.equal(await heading.innerText(), initial)
    })
    await check('Swiping outside the calendar does not change month', async () => {
      await page.getByText('이 날의 일정이 없습니다', { exact: true }).dispatchEvent('touchstart', { touches: [{ identifier: 1, clientX: 300, clientY: 500 }] })
      await page.getByText('이 날의 일정이 없습니다', { exact: true }).dispatchEvent('touchend', { touches: [], changedTouches: [{ identifier: 1, clientX: 50, clientY: 500 }] })
      assert.equal(await heading.innerText(), initial)
    })
    await check('December/January swipes handle the year boundary', async () => {
      for (let m = month; m < 12; m++) await calendar.getByRole('button', { name: '다음 달', exact: true }).press('Enter')
      await swipe(300, y, 90, y)
      assert.equal(await heading.innerText(), `${year + 1}년 1월`)
      await swipe(90, y, 300, y)
      assert.equal(await heading.innerText(), `${year}년 12월`)
    })
    await check('Desktop month buttons and layout remain usable', async () => {
      await page.setViewportSize({ width: 1280, height: 900 })
      await calendar.getByRole('button', { name: '다음 달', exact: true }).press('Enter')
      assert.equal(await heading.innerText(), `${year + 1}년 1월`)
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    })
    assert.deepEqual(errors, [])
    console.log('Completed 10 calendar tests; no live account data was used.')
  } finally { await browser.close() }
}

main().catch(error => { console.error(error); process.exitCode = 1 })
