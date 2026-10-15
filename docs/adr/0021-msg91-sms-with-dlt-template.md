# ADR-0021: Phone login codes through MSG91 with a DLT-approved template

- **Status:** Accepted (implements the owner's decision of 2026-10-09: "MSG91 for SMS")
- **Date:** 2026-10-15

## Context
Phone login codes have only gone to the server log (console provider, preview only) because no SMS vendor was chosen (ADR-0006). The owner chose MSG91 on 2026-10-09. In India every transactional SMS must match a template registered on TRAI's DLT platform, with a registered sender ID; free text is not delivered. Craftware is doing the DLT registration.

## Decision
- New `Msg91SmsProvider` behind the existing `SmsProvider` port, chosen with `SMS_PROVIDER=msg91`. It uses MSG91's Flow API as documented at docs.msg91.com ("Send SMS"): `POST https://control.msg91.com/api/v5/flow`, header `authkey`, body `{ template_id, short_url: "0", recipients: [{ mobiles: "<country code + number, no +>", <code variable>: "<code>" }] }`. Success is `{ "type": "success", "message": "<request id>" }`; anything else, a non-2xx status or a 10-second timeout is an error.
- The port now passes the **code** as well as the full text: template providers fill the template variable (`MSG91_OTP_CODE_VAR`, default `var1`) and ignore the text; the console provider keeps printing the text.
- Settings: `MSG91_OTP_TEMPLATE_ID` and `MSG91_OTP_CODE_VAR` in `.env`; the key `MSG91_AUTH_KEY` is typed by a human into `set-secret.sh`, which switches `SMS_PROVIDER` to `msg91` once the template id is set. `MSG91_BASE_URL` exists only for tests and is refused in production.
- Neither the key nor the code is logged; phone numbers are masked in errors.

## Consequences
- Switching on needs only the DLT-approved template (with the sender ID linked to it in MSG91), its id and variable name, and the key. No code change.
- The approved template's wording is what people receive; keep it close to the console text ("<code> is your Dodoom verification code…").
- Delivery reports, retries by MSG91 and per-message cost are MSG91's; failures surface to the user as the normal "could not send the code" error.
- Tested against a local fake MSG91 server (request shape, success, errors); the real account is checked once at switch-over with one code to a team phone.
