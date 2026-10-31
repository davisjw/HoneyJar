# Connectors

What HoneyJar sends off this server, to which host, and how to stop it.

A call listed here leaves the machine only in the case that section describes. Account rows, transactions, and document bodies are not part of the ZIP, weather, or contact calls. The advisor call is the one that sends money figures, and it sends a short brief, not the whole register.

SimpleFIN, an outbound webhook, receipt OCR, and a live quote feed are not in this build. They are not described here. A section is added when that connector ships.

## ZIP lookup

**Host.** `https://api.zippopotam.us`

**When.** A utility chart is open, the meter has a 5-digit US ZIP, and this server does not already have the months that chart needs. There is no separate on/off switch. Opening the chart is what starts it. A viewer can start it too.

**What leaves.** Only the first five digits of the ZIP. A ZIP+4 is cut down to those five before the call, in the path `/us/94612` (your ZIP, not this example). No household name, no balances, no transactions.

**How to turn it off.** Clear the ZIP on that meter, or leave it as something other than five digits. The server then returns without calling out.

## Weather

**Hosts.** `https://archive-api.open-meteo.com` for past months, then `https://api.open-meteo.com` if the archive does not have a month yet.

**When.** Immediately after a ZIP lookup that returned a latitude and longitude. If the ZIP lookup fails, weather is not called. If every month on the chart is already stored, nothing is called.

**What leaves.** Latitude, longitude, and the start and end dates of the span from the first missing month through the last (or today, if that is sooner). The request asks for the daily mean temperature in Fahrenheit. The ZIP itself is not on this request. No household name, no balances, no transactions. The monthly average is saved on this server. Opening the chart again does not ask for a month that is already stored.

**How to turn it off.** Same as the ZIP lookup: clear the meter's ZIP. No weather call runs without that lookup.

## Advisor

The advisor runs only when someone presses **Ask**. One provider is selected in **Customize**. The other two are not called. The default provider on a new household is Grok.

Every provider receives the same text:

- A short instruction not to invent numbers and not to act as a broker.
- A brief: household name, today's date, currency, net-worth totals (net, assets, and debts), account names, kinds, and balances, this month's spending for up to eight categories, up to eight upcoming bills or income items with the amount and due date, goals (name and amounts saved toward the target), filing status, and, when the household has lots, portfolio market value, modified Dietz, and IRR. Prices in that line are the ones someone typed.
- The last eight advisor messages, then the question just asked.

It does not receive every transaction, document bodies, or the OpenAI key inside the message. The OpenAI key is sent only as the request's `Authorization` header, and only to OpenAI.

### Grok

**Host.** `https://api.x.ai`

**When.** **Ask**, and the provider is Grok. If `XAI_API_KEY` is unset, the server stops before the call.

**What leaves.** The text above. The server key is the `Authorization` header. The browser does not see that key.

**How to turn it off.** In **Customize**, switch the provider to OpenAI or Ollama, or do not press **Ask**. Unsetting `XAI_API_KEY` also stops the call.

### OpenAI

**Host.** `https://api.openai.com`

**When.** **Ask**, and the provider is OpenAI, and a key is saved on the household. No key means no call.

**What leaves.** The same text. The saved key is the `Authorization` header to OpenAI. The model name saved in **Customize** is sent too (default `gpt-4.1-mini`).

**How to turn it off.** Clear the key, or switch the provider. Clearing the key leaves the other profile fields alone.

### Ollama

**Host.** The URL saved in **Customize**. A new household starts at `http://127.0.0.1:11434`, which stays on this machine when Ollama is installed there. The server posts to `/api/chat` on that origin unless the saved URL already ends in `/api/chat`.

**When.** **Ask**, and the provider is Ollama. The server makes the call. The browser does not.

**What leaves.** The same text, to whatever machine that URL points at. A URL on another host sends the brief there. The model name saved in **Customize** is sent too (default `llama3.1`). No HoneyJar API key is attached.

**How to turn it off.** Switch the provider away from Ollama.

## Contact lookup

**Hosts.** `https://html.duckduckgo.com`, then the public page that search points at.

**When.** Someone presses **Look up public details** on a contact. Nothing is sent because a contact was saved.

**What leaves.** The name typed in the form, plus the words "official website", to DuckDuckGo. HoneyJar then requests that one public page and reads the phone, address, email, website, and hours it publishes. The books are not sent.

**How to turn it off.** Do not press **Look up public details**. There is no background lookup.

## Other outbound calls

These are not household connectors. They are off until the operator turns them on, and [Install](install.md) is where they are set:

- Password reset email, when `SMTP_HOST` and `SMTP_FROM` are set. The message goes to the operator's mail server.
- OpenID Connect, when those variables are set. Sign-in talks to the directory the operator named.

A Zillow field is a link the household opens in a browser. HoneyJar does not request Zillow. Portfolio prices are numbers someone typed. Importing a bank file does not contact the bank.
