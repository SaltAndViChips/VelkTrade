# VelkTrade Imgur gallery title fix

This patch fixes Imgur links like:

https://imgur.com/6hUs12E

The previous version used the plain image endpoint first, so it often fell back to the ID:

6hUs12E

This patch tries gallery endpoints first and aggressively cleans gallery titles/descriptions.

## Example

Input title:

discord.gg/velkon | Apocalyptic SR-25

Saved title:

Apocalyptic SR-25

## Also handles noisy Steam capture text

If Imgur metadata includes lines like:

Owned-by-Salt-amp-Vi-STEAM-0-1-108432244-https-steamcommunity-com-profiles-76561198177130217-Captured-on-Gaming-2-Join-http-l
Apocalyptic SR-25
Owned by Salt & Vi- (STEAM_0:1:108432244) (https://steamcommunity.com/profiles/76561198177130217)
Captured on ?★▶ Velkon Gaming #2

It chooses:

Apocalyptic SR-25

## Files changed

- backend/imgur.js
- frontend/src/tests/tradeLogic.test.js
