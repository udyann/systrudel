# Third-party notices

Original systrudel code is currently unlicensed. The `UNLICENSED` package
metadata refers to that code, not its dependencies. Third-party components
retain their own copyright and license terms.

## Strudel

systrudel uses `@strudel/web` 1.3.0 and `@strudel/soundfonts` 1.3.0 for patterns,
synthesis and instrument loading. Both declare **AGPL-3.0-or-later**. Credits
include Felix Roos, Alex McLean and the Strudel contributors.

- [Strudel](https://strudel.cc/)
- [Upstream source and license](https://codeberg.org/uzu/strudel)
- Installed license texts: `node_modules/@strudel/web/LICENSE` and
  `node_modules/@strudel/soundfonts/LICENSE`, available after `npm ci`

The production build bundles Strudel code. Leaving systrudel unlicensed does
not replace upstream terms. Resolve project licensing before distributing
a bundled release.

## Sounds and services

Base song downloads SR-16 kick, snare and ride samples from Strudel's
`tidal-drum-machines` CDN collection. GM synth bass, electric piano and trombone
load through Strudel's WebAudioFont integration from
`felixroos.github.io/webaudiofontdata`. These assets are not vendored in this
source repository or covered by a systrudel license.

- [Strudel sample documentation](https://strudel.cc/learn/samples/)
- [WebAudioFont data source](https://github.com/felixroos/webaudiofontdata)
- [Instrument loading in this project](src/music/base-song-audio.js)

Consult upstream collections for individual asset terms before redistributing
sound files. Other dependencies are recorded in `package-lock.json`; installed
packages include their own notices. Optional weather and city lookup use
[Open-Meteo](https://open-meteo.com/).

systrudel is an independent project, not an official Strudel or OpenAI product.
