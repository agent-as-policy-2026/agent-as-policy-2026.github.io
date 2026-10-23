# Video.js player

The site loads `videojs.js`, a self-contained browser bundle of Video.js HTML custom elements. `videojs-entry.js` is its source. The playback-rate feature supplies each episode’s supported rates; player controls use the standard neutral skin.

Upstream documentation: https://videojs.com/docs/
License: VIDEOJS-LICENSE.txt

Rebuild in a temporary directory with Node.js and npm:

```sh
npm init -y
npm install --save-exact @videojs/html@10.2.0 @videojs/core@10.2.0 esbuild@0.28.2
# Copy videojs-entry.js into this directory, then run
npx esbuild videojs-entry.js --bundle --minify --format=esm --outfile=videojs.js --legal-comments=inline
```

Copy the resulting `videojs.js` back into this directory. No install or build step is required to serve the website.
