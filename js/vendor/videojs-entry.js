import {createPlayer} from '@videojs/html';
import {videoFeatures} from '@videojs/html/video';
import {playbackRateFeature} from '@videojs/core/dom';
import '@videojs/html/video/neutral-skin';
const rates={...playbackRateFeature,
 state(ctx){return {...playbackRateFeature.state(ctx),playbackRates:[1,2,4,8],setRates(value){ctx.set({playbackRates:JSON.parse(value||'[1,2,4,8]')});}};},
 config:{rates:{action:'setRates',state:'playbackRates'}}
};
const {PlayerElement}=createPlayer({features:videoFeatures.map(f=>f.name==='playbackRate'?rates:f)});
customElements.define('agp-video-player',PlayerElement);
