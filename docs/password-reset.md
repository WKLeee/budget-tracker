# Password Reset

1. In Supabase Dashboard, open Authentication > URL Configuration.
2. Set Site URL to the production app origin.
3. Add exact Redirect URLs for each environment:
   - `http://localhost:3000/auth/recovery`
   - `https://YOUR_PRODUCTION_DOMAIN/auth/recovery`
   - If using another local port, add its exact callback URL too.
4. Keep the Reset Password email template link using `{{ .ConfirmationURL }}`.
5. Confirm email delivery/SMTP configuration in Supabase. Sending limits apply.

Flow: `/login` > `/forgot-password` > email > `/auth/recovery` >
`/reset-password` > authenticated `updateUser({ password })`.
PKCE requires opening the email in the same browser/profile that requested it.
No service-role key or database schema change is required.

Manual checks (use a test account, not a real user's password):
- Request an email, open it in the same browser, set matching passwords of at
  least eight characters, and verify login with the new password.
- Check mismatched passwords, network failures, expired/reused links, direct
  unauthenticated access to `/reset-password`, and another browser's link.
- Unknown emails must receive the same generic success message.
- Supabase password policy and rate-limit failures must leave the form usable.

References:
- https://supabase.com/docs/guides/auth/passwords
- https://supabase.com/docs/guides/auth/redirect-urls

## Automated UI Checks (Windows)

With the dev server listening on port 3000 and Google Chrome installed:

```powershell
npm.cmd install --prefix "$env:TEMP\budget-reset-tests" --no-package-lock --no-save playwright
node scripts/test-password-reset.cjs
```

The script runs an isolated headless browser. Authenticated requests are mocked;
no recovery email is sent and no real password is changed. It checks navigation,
callback URL, rate limits, invalid links, password confirmation, update errors,
mock update success, and mobile/desktop overflow. Screenshots go to TEMP.
Actual email delivery, redirect allow-list configuration, and a real PKCE code
exchange still require a test account and inbox access.
