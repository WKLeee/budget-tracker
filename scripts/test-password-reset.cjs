/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict')
const path = require('node:path')
const { chromium } = require(path.join(process.env.TEMP, 'budget-reset-tests/node_modules/playwright'))
const { loadEnvConfig } = require('@next/env')

loadEnvConfig(process.cwd())
const origin = 'http://localhost:3000'
const authUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
if (!authUrl) throw new Error('NEXT_PUBLIC_SUPABASE_URL is required')
const ref = new URL(authUrl).hostname.split('.')[0]
const user = { id: '00000000-0000-0000-0000-000000000001', aud: 'authenticated', role: 'authenticated', email: 'reset-test@example.invalid', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() }
const results = []

async function main() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
    const page = await context.newPage()
    page.setDefaultTimeout(10000)
    async function visible(text) { await page.getByText(text, { exact: true }).waitFor() }
    async function check(name, run) { await run(); results.push(name); console.log('PASS ' + name) }

    await check('Login links to password recovery', async () => {
      await page.goto(origin + '/login')
      await page.getByRole('link', { name: '비밀번호 찾기' }).click()
      await page.getByLabel('이메일', { exact: true }).waitFor()
      assert.equal(new URL(page.url()).pathname, '/forgot-password')
    })
    let recoverMode = 'success'
    let calls = 0
    await page.route(authUrl + '/auth/v1/recover**', async route => {
      calls++
      assert.equal(new URL(route.request().url()).searchParams.get('redirect_to'), origin + '/auth/recovery')
      assert.equal(route.request().postDataJSON().email, 'reset-test@example.invalid')
      await route.fulfill({ status: recoverMode === 'success' ? 200 : 429, contentType: 'application/json', body: recoverMode === 'success' ? '{}' : JSON.stringify({ code: 'over_email_send_rate_limit', msg: 'Rate limited' }) })
    })
    await check('Recovery success and callback URL (mock)', async () => {
      await page.getByLabel('이메일', { exact: true }).fill('reset-test@example.invalid')
      await page.getByRole('button', { name: '재설정 메일 보내기' }).click()
      await page.getByRole('status').waitFor()
      assert.equal(calls, 1)
    })
    await check('Rate limit leaves form usable (mock)', async () => {
      recoverMode = 'rate-limit'
      await page.goto(origin + '/forgot-password')
      await page.getByLabel('이메일', { exact: true }).fill('reset-test@example.invalid')
      await page.getByRole('button', { name: '재설정 메일 보내기' }).click()
      await visible('요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.')
      assert.equal(await page.getByRole('button', { name: '재설정 메일 보내기' }).isEnabled(), true)
    })
    await check('Unauthenticated reset access is blocked', async () => {
      await page.goto(origin + '/reset-password')
      await page.getByRole('link', { name: '재설정 메일 다시 요청' }).waitFor()
      assert.equal(await page.getByLabel('새 비밀번호', { exact: true }).count(), 0)
    })
    await check('Missing recovery code redirects to invalid-link state', async () => {
      await page.goto(origin + '/auth/recovery')
      await page.getByRole('link', { name: '재설정 메일 다시 요청' }).waitFor()
      assert.equal(new URL(page.url()).searchParams.get('error'), 'invalid_link')
    })
    const expires = Math.floor(Date.now() / 1000) + 3600
    const jwt = ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify({ sub: user.id, exp: expires, aud: 'authenticated' })).toString('base64url'), 'test-signature'].join('.')
    const session = { access_token: jwt, refresh_token: 'mock-only', expires_at: expires, expires_in: 3600, token_type: 'bearer', user }
    await context.addCookies([{ name: `sb-${ref}-auth-token`, value: 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url'), domain: 'localhost', path: '/' }])
    let updateMode = 'same-password'
    let updates = 0
    // All authenticated requests are intercepted; no real account is changed.
    await page.route(authUrl + '/auth/v1/**', async route => {
      if (route.request().method() === 'PUT') {
        updates++
        await route.fulfill({ status: updateMode === 'success' ? 200 : 422, contentType: 'application/json', headers: { 'x-supabase-api-version': '2024-01-01', 'access-control-expose-headers': 'x-supabase-api-version' }, body: JSON.stringify(updateMode === 'success' ? user : { code: 'same_password', error_code: 'same_password', msg: 'Same password' }) })
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(user) })
      }
    })
    await check('Password confirmation mismatch makes no update request', async () => {
      await page.goto(origin + '/reset-password')
      await page.getByLabel('새 비밀번호', { exact: true }).fill('MockPassword-123!')
      await page.getByLabel('새 비밀번호 확인').fill('DifferentMock-123!')
      await page.getByRole('button', { name: '비밀번호 변경', exact: true }).click()
      await visible('비밀번호가 일치하지 않습니다.')
      assert.equal(updates, 0)
    })
    await check('Same-password error is displayed (mock)', async () => {
      await page.getByLabel('새 비밀번호 확인').fill('MockPassword-123!')
      await page.getByRole('button', { name: '비밀번호 변경', exact: true }).click()
      await visible('기존 비밀번호와 다른 비밀번호를 입력해 주세요.')
    })
    await check('Successful update clears password fields (mock)', async () => {
      updateMode = 'success'
      await page.getByRole('button', { name: '비밀번호 변경', exact: true }).click()
      await visible('비밀번호가 변경되었습니다.')
      assert.equal(await page.locator('input[type=password]').count(), 0)
    })
    await check('Explicit invalid link is blocked even with a session', async () => {
      await page.goto(origin + '/reset-password?error=invalid_link')
      await page.getByRole('link', { name: '재설정 메일 다시 요청' }).waitFor()
      assert.equal(await page.getByLabel('새 비밀번호', { exact: true }).count(), 0)
    })
    await check('Recovery form fits mobile and desktop viewports', async () => {
      for (const width of [390, 1280]) {
        await page.setViewportSize({ width, height: 844 })
        await page.goto(origin + '/forgot-password')
        await page.getByLabel('이메일', { exact: true }).waitFor()
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true)
        await page.screenshot({ path: path.join(process.env.TEMP, `budget-password-reset-${width}.png`) })
      }
    })
    await context.close()
    console.log(`Completed ${results.length} tests. No real password changed.`)
  } finally {
    await browser.close()
  }
}

main().catch(error => { console.error(error); process.exitCode = 1 })
